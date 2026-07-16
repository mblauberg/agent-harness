import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";

import { Ajv2020 } from "ajv/dist/2020.js";
import { parse } from "yaml";

import { FabricError } from "../errors.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveCompatibilityArtifact(compatibilityPath: string, value: string): string {
  const userHomeToken = "${USER_HOME}";
  if (value === userHomeToken || value.startsWith(`${userHomeToken}/`)) {
    return resolve(homedir(), value.slice(userHomeToken.length + 1));
  }
  if (value.includes(userHomeToken)) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", "${USER_HOME} must begin a compatibility artifact path");
  }
  if (isAbsolute(value)) return value;
  return resolve(dirname(compatibilityPath), "..", value);
}

async function digest(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function verifyHash(path: string, expected: string): Promise<void> {
  let actual: string;
  try {
    actual = await digest(path);
  } catch (error: unknown) {
    throw new FabricError("ADAPTER_ARTIFACT_MISSING", `adapter artifact is unavailable: ${path}`, { cause: error });
  }
  if (actual !== expected) {
    throw new FabricError("ADAPTER_HASH_MISMATCH", `adapter artifact digest changed: ${path}`);
  }
}

const execFileAsync = promisify(execFile);

export type WrapperProvenance = {
  adapterId: string;
  repositoryCommit: string;
  wrapperPath: string;
};

/**
 * Environment for provenance Git invocations. Every GIT_* variable is
 * stripped so injected values (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...)
 * cannot redirect repository discovery, and global/system configuration is
 * disabled so external configuration cannot alter the read-only queries.
 */
function gitEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || key.startsWith("GIT_")) continue;
    environment[key] = value;
  }
  environment.GIT_CONFIG_GLOBAL = "/dev/null";
  environment.GIT_CONFIG_SYSTEM = "/dev/null";
  return environment;
}

async function gitOutput(directory: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", directory, ...args], { env: gitEnvironment() });
  return stdout.trim();
}

async function readWorkspacePackage(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function isWorkspaceDependency(name: string, specifier: unknown): boolean {
  return name.startsWith("@local/") || (typeof specifier === "string" && specifier.startsWith("file:"));
}

async function resolveWorkspaceDependencyRoot(packageRoot: string, repositoryRoot: string, name: string): Promise<string> {
  let searchDirectory = packageRoot;
  for (;;) {
    try {
      return await realpath(join(searchDirectory, "node_modules", name));
    } catch {
      if (searchDirectory === repositoryRoot) break;
      const parent = dirname(searchDirectory);
      if (parent === searchDirectory) break;
      searchDirectory = parent;
    }
  }
  throw new FabricError("ADAPTER_ARTIFACT_MISSING", `local workspace dependency is unavailable: ${name}`);
}

/**
 * The executed first-party source span of a wrapper: the src directory of
 * its owning workspace package plus the src directories of every local
 * workspace dependency, recursively. This is the same first-party set the
 * removed manifests pinned. Third-party lockfile-pinned dependencies stay
 * outside the span, exactly as they were outside the manifests. Wrappers
 * without an owning package (test fixtures) have an empty span.
 */
async function firstPartySourceSpans(wrapperPath: string, repositoryRoot: string): Promise<string[]> {
  let packageRoot: string | undefined;
  let searchDirectory = dirname(wrapperPath);
  for (;;) {
    if ((await readWorkspacePackage(join(searchDirectory, "package.json"))) !== undefined) {
      packageRoot = searchDirectory;
      break;
    }
    if (searchDirectory === repositoryRoot) break;
    const parent = dirname(searchDirectory);
    if (parent === searchDirectory) break;
    searchDirectory = parent;
  }
  if (packageRoot === undefined) return [];
  const spans = new Set<string>();
  const visited = new Set<string>();
  const pending = [packageRoot];
  while (pending.length > 0) {
    const root = pending.pop();
    if (root === undefined || visited.has(root)) continue;
    visited.add(root);
    const document = await readWorkspacePackage(join(root, "package.json"));
    if (document === undefined) {
      throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `local workspace package manifest is invalid: ${root}`);
    }
    let sourceDirectory: string | undefined;
    try {
      sourceDirectory = await realpath(join(root, "src"));
    } catch {
      sourceDirectory = undefined;
    }
    if (sourceDirectory !== undefined) {
      const span = relative(repositoryRoot, sourceDirectory);
      if (span.length === 0 || span.startsWith("..") || isAbsolute(span)) {
        throw new FabricError(
          "ADAPTER_COMPATIBILITY_INVALID",
          `wrapper workspace package escapes its Git repository: ${root}`,
        );
      }
      spans.add(span.split(sep).join("/"));
    }
    const dependencies = isRecord(document.dependencies) ? document.dependencies : {};
    for (const [name, specifier] of Object.entries(dependencies)) {
      if (!isWorkspaceDependency(name, specifier)) continue;
      const dependencyRoot = await resolveWorkspaceDependencyRoot(root, repositoryRoot, name);
      const contained = relative(repositoryRoot, dependencyRoot);
      if (contained.length === 0 || contained.startsWith("..") || isAbsolute(contained)) {
        throw new FabricError(
          "ADAPTER_COMPATIBILITY_INVALID",
          `local workspace dependency escapes the wrapper repository: ${name}`,
        );
      }
      pending.push(dependencyRoot);
    }
  }
  return [...spans].sort();
}

/**
 * Derives provenance for repository-owned wrapper code from Git: the commit
 * of the repository that owns the wrapper entrypoint plus the wrapper path
 * relative to that repository's root. Git supplies the content identity, so
 * the wrapper must be tracked at HEAD and byte-identical to its committed
 * content, and the executed first-party source span (the owning workspace
 * package's src tree plus local workspace dependency src trees) must be
 * diff-clean against HEAD; untracked, ignored or locally modified wrapper
 * code fails closed. No repository-local hash pin exists for wrapper code.
 */
async function deriveWrapperProvenance(input: {
  adapterId: string;
  wrapperEntrypoint: string;
}): Promise<WrapperProvenance> {
  let wrapperPath: string;
  try {
    wrapperPath = await realpath(input.wrapperEntrypoint);
  } catch (error: unknown) {
    throw new FabricError("ADAPTER_ARTIFACT_MISSING", `wrapper entrypoint is unavailable: ${input.adapterId}`, {
      cause: error,
    });
  }
  const wrapperDirectory = dirname(wrapperPath);
  let repositoryRoot: string;
  let repositoryCommit: string;
  try {
    [repositoryRoot, repositoryCommit] = await Promise.all([
      gitOutput(wrapperDirectory, ["rev-parse", "--show-toplevel"]),
      gitOutput(wrapperDirectory, ["rev-parse", "HEAD"]),
    ]);
  } catch (error: unknown) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper entrypoint has no Git repository provenance: ${input.adapterId}`,
      { cause: error },
    );
  }
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(repositoryCommit)) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper repository commit is invalid: ${input.adapterId}`,
    );
  }
  const resolvedRepositoryRoot = await realpath(repositoryRoot);
  const repositoryRelativePath = relative(resolvedRepositoryRoot, wrapperPath);
  if (repositoryRelativePath.length === 0 || repositoryRelativePath.startsWith("..") || isAbsolute(repositoryRelativePath)) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper entrypoint escapes its Git repository: ${input.adapterId}`,
    );
  }
  const portablePath = repositoryRelativePath.split(sep).join("/");
  try {
    await gitOutput(resolvedRepositoryRoot, ["cat-file", "-e", `HEAD:${portablePath}`]);
  } catch (error: unknown) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper entrypoint is not tracked at the repository HEAD: ${input.adapterId}`,
      { cause: error },
    );
  }
  try {
    await gitOutput(resolvedRepositoryRoot, ["diff", "--quiet", "HEAD", "--", portablePath]);
  } catch (error: unknown) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper entrypoint differs from its committed content: ${input.adapterId}`,
      { cause: error },
    );
  }
  const sourceSpans = await firstPartySourceSpans(wrapperPath, resolvedRepositoryRoot);
  if (sourceSpans.length > 0) {
    try {
      await gitOutput(resolvedRepositoryRoot, ["diff", "--quiet", "HEAD", "--", ...sourceSpans]);
    } catch (error: unknown) {
      throw new FabricError(
        "ADAPTER_COMPATIBILITY_INVALID",
        `wrapper first-party source differs from its committed content: ${input.adapterId}`,
        { cause: error },
      );
    }
  }
  return {
    adapterId: input.adapterId,
    repositoryCommit,
    wrapperPath: portablePath,
  };
}

const VALUE_TAKING_NODE_OPTIONS = new Set(["--import", "--require", "--loader", "--experimental-loader", "--conditions"]);

/**
 * Index of the wrapper entrypoint inside a trusted adapter command: the
 * first argument after the executable that is not a runtime option or the
 * value of one (for example the tsx loader after --import).
 */
export function wrapperCommandEntrypointIndex(command: string[]): number {
  let index = 1;
  while (index < command.length) {
    const part = command[index] ?? "";
    if (part.startsWith("--")) {
      index += !part.includes("=") && VALUE_TAKING_NODE_OPTIONS.has(part) ? 2 : 1;
      continue;
    }
    return index;
  }
  return -1;
}

/**
 * Re-derives wrapper provenance immediately before an adapter process spawn
 * and requires it to match the provenance verified at composition, closing
 * the composition-to-spawn window.
 */
export async function verifySpawnWrapperProvenance(input: {
  adapterId: string;
  command: string[];
  expected: { repositoryCommit: string; wrapperPath: string };
}): Promise<void> {
  const index = wrapperCommandEntrypointIndex(input.command);
  const entrypoint = index === -1 ? undefined : input.command[index];
  if (entrypoint === undefined) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `adapter command has no wrapper entrypoint: ${input.adapterId}`);
  }
  const provenance = await deriveWrapperProvenance({ adapterId: input.adapterId, wrapperEntrypoint: entrypoint });
  if (provenance.repositoryCommit !== input.expected.repositoryCommit || provenance.wrapperPath !== input.expected.wrapperPath) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper provenance changed since activation composition: ${input.adapterId}`,
    );
  }
}

export async function verifyAdapterCompatibility(input: {
  compatibilityPath: string;
  schemaPath: string;
  adapterIds: string[];
  requireEnabled: boolean;
}): Promise<{ valid: true; adapterIds: string[]; verifiedArtifactCount: number; wrapperProvenance: WrapperProvenance[] }> {
  const document: unknown = parse(await readFile(input.compatibilityPath, "utf8"));
  const schema: unknown = JSON.parse(await readFile(input.schemaPath, "utf8"));
  if (!isRecord(schema)) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", "compatibility schema is not an object");
  }
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  if (!ajv.validate(schema, document)) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", ajv.errorsText(ajv.errors));
  }
  if (!isRecord(document) || !isRecord(document.adapters)) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", "compatibility registry lacks adapters");
  }

  let verifiedArtifactCount = 0;
  const wrapperProvenance: WrapperProvenance[] = [];
  for (const adapterId of input.adapterIds) {
    const adapter = document.adapters[adapterId];
    if (!isRecord(adapter)) {
      throw new FabricError("NOT_FOUND", `adapter compatibility entry is missing: ${adapterId}`);
    }
    if (input.requireEnabled && adapter.enabled !== true) {
      throw new FabricError("ADAPTER_DISABLED", `adapter is not activated: ${adapterId}`);
    }
    if (input.requireEnabled && Array.isArray(adapter.unresolved_pins) && adapter.unresolved_pins.length > 0) {
      throw new FabricError("ADAPTER_PIN_UNRESOLVED", `adapter compatibility pins remain unresolved: ${adapterId}`);
    }
    if (!isRecord(adapter.implementation) || !isRecord(adapter.contract)) {
      throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `adapter entry is incomplete: ${adapterId}`);
    }
    if (input.requireEnabled && typeof adapter.implementation.wrapper_entrypoint !== "string") {
      throw new FabricError(
        "ADAPTER_COMPATIBILITY_INVALID",
        `enabled adapter has no pinned fabric wrapper: ${adapterId}`,
      );
    }
    if (input.requireEnabled) {
      const protocolVersion = adapter.contract.protocol_version;
      const schemaSource = adapter.contract.schema_source ?? adapter.contract.schema_bundle;
      if (
        (typeof protocolVersion !== "string" && typeof protocolVersion !== "number") ||
        typeof schemaSource !== "string" ||
        typeof adapter.contract.schema_sha256 !== "string"
      ) {
        throw new FabricError(
          "ADAPTER_COMPATIBILITY_INVALID",
          `enabled adapter has incomplete protocol/schema pins: ${adapterId}`,
        );
      }
      const upstreamArtifactPins = Object.keys(adapter.implementation).filter(
        (field) => field.endsWith("_sha256"),
      );
      if (upstreamArtifactPins.length === 0) {
        throw new FabricError(
          "ADAPTER_COMPATIBILITY_INVALID",
          `enabled adapter has no pinned upstream artifact: ${adapterId}`,
        );
      }
    }
    for (const [field, expected] of Object.entries(adapter.implementation)) {
      if (!field.endsWith("_sha256") || typeof expected !== "string") continue;
      const pathValue = adapter.implementation[field.slice(0, -"_sha256".length)];
      if (typeof pathValue !== "string") {
        throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `${adapterId}.${field} has no artifact path`);
      }
      await verifyHash(resolveCompatibilityArtifact(input.compatibilityPath, pathValue), expected);
      verifiedArtifactCount += 1;
    }
    const wrapperEntrypoint = adapter.implementation.wrapper_entrypoint;
    if (typeof wrapperEntrypoint === "string") {
      wrapperProvenance.push(await deriveWrapperProvenance({
        adapterId,
        wrapperEntrypoint: resolveCompatibilityArtifact(input.compatibilityPath, wrapperEntrypoint),
      }));
    }
    if (typeof adapter.contract.schema_sha256 === "string") {
      const source = adapter.contract.schema_source ?? adapter.contract.schema_bundle;
      if (typeof source !== "string") {
        throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `${adapterId} has no schema artifact`);
      }
      await verifyHash(resolveCompatibilityArtifact(input.compatibilityPath, source), adapter.contract.schema_sha256);
      verifiedArtifactCount += 1;
    }
  }
  return { valid: true, adapterIds: [...input.adapterIds], verifiedArtifactCount, wrapperProvenance };
}

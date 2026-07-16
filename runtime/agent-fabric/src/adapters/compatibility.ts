import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, readFile, realpath } from "node:fs/promises";
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

/**
 * Runs a read-only Git query. `--no-replace-objects` is a global flag on
 * every invocation so replacement objects (refs/replace/*) cannot shadow the
 * real HEAD tree or commit: without it an attacker could `git replace` the
 * committed tree with a tampered one that matches a tampered worktree, so
 * content verification would pass while `rev-parse HEAD` still records the
 * original commit. With the flag every query resolves genuine objects only.
 */
async function gitOutput(directory: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", directory, "--no-replace-objects", ...args], {
    env: gitEnvironment(),
  });
  return stdout.trim();
}

type WorkspaceManifest =
  | { state: "missing" }
  | { state: "invalid" }
  | { state: "present"; document: Record<string, unknown> };

async function readWorkspaceManifest(path: string): Promise<WorkspaceManifest> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return { state: "missing" };
  }
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? { state: "present", document: value } : { state: "invalid" };
  } catch {
    return { state: "invalid" };
  }
}

async function isTrackedAtHead(repositoryRoot: string, portablePath: string): Promise<boolean> {
  try {
    await gitOutput(repositoryRoot, ["cat-file", "-e", `HEAD:${portablePath}`]);
    return true;
  } catch {
    return false;
  }
}

function portableRepositoryPath(repositoryRoot: string, path: string, adapterId: string): string {
  const contained = relative(repositoryRoot, path);
  if (contained.length === 0 || contained.startsWith("..") || isAbsolute(contained)) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper workspace path escapes its Git repository: ${path} (adapter ${adapterId})`,
    );
  }
  return contained.split(sep).join("/");
}

function isWorkspaceDependency(name: string, specifier: unknown): boolean {
  return name.startsWith("@local/") || (typeof specifier === "string" && specifier.startsWith("file:"));
}

/**
 * The location a workspace dependency is *required* to occupy, derived only
 * from tracked data: a `file:` specifier resolves relative to the declaring
 * package, and any other workspace specifier resolves through the tracked npm
 * workspace layout at the repository root (the workspace globs plus the target
 * package's tracked name). Node module resolution follows the on-disk
 * `node_modules` symlink instead, which nothing tracks, so the caller binds
 * the two together and fails closed on any divergence.
 */
async function expectedWorkspaceDependencyRoot(input: {
  packageRoot: string;
  repositoryRoot: string;
  name: string;
  specifier: unknown;
  adapterId: string;
}): Promise<string> {
  const { packageRoot, repositoryRoot, name, specifier, adapterId } = input;
  let expectedRoot: string;
  if (typeof specifier === "string" && specifier.startsWith("file:")) {
    const target = specifier.slice("file:".length);
    expectedRoot = isAbsolute(target) ? target : resolve(packageRoot, target);
  } else {
    expectedRoot = await workspacePackageRootByName({ repositoryRoot, name, adapterId });
  }
  try {
    return await realpath(expectedRoot);
  } catch (error: unknown) {
    throw new FabricError(
      "ADAPTER_ARTIFACT_MISSING",
      `local workspace dependency target is unavailable: ${name} (expected at ${expectedRoot}, adapter ${adapterId})`,
      { cause: error },
    );
  }
}

/**
 * Finds the package root of a named workspace member from the tracked npm
 * workspace layout at the repository root. The root manifest must be tracked
 * at HEAD, and the member is located by its tracked `name`, so the expected
 * location is derived from committed data rather than the working tree's
 * `node_modules` graph.
 */
async function workspacePackageRootByName(input: {
  repositoryRoot: string;
  name: string;
  adapterId: string;
}): Promise<string> {
  const { repositoryRoot, name, adapterId } = input;
  if (!(await isTrackedAtHead(repositoryRoot, "package.json"))) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `workspace root manifest is not tracked at the repository HEAD, cannot bind dependency location: ${name} (adapter ${adapterId})`,
    );
  }
  const rootManifest = await readWorkspaceManifest(join(repositoryRoot, "package.json"));
  if (rootManifest.state !== "present") {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `workspace root manifest is invalid, cannot bind dependency location: ${name} (adapter ${adapterId})`,
    );
  }
  const workspacesField = rootManifest.document.workspaces;
  const patterns = Array.isArray(workspacesField)
    ? workspacesField
    : isRecord(workspacesField) && Array.isArray(workspacesField.packages)
      ? workspacesField.packages
      : [];
  const candidateRoots = new Set<string>();
  for (const pattern of patterns) {
    if (typeof pattern !== "string") continue;
    if (pattern.endsWith("/*")) {
      const base = join(repositoryRoot, pattern.slice(0, -2));
      let children: Dirent[];
      try {
        children = await readdir(base, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const child of children) {
        if (child.isDirectory()) candidateRoots.add(join(base, child.name));
      }
    } else {
      candidateRoots.add(join(repositoryRoot, pattern));
    }
  }
  for (const candidate of candidateRoots) {
    const manifest = await readWorkspaceManifest(join(candidate, "package.json"));
    if (manifest.state === "present" && manifest.document.name === name) return candidate;
  }
  throw new FabricError(
    "ADAPTER_COMPATIBILITY_INVALID",
    `local workspace dependency has no tracked workspace location: ${name} (adapter ${adapterId})`,
  );
}

async function resolveWorkspaceDependencyRoot(input: {
  packageRoot: string;
  repositoryRoot: string;
  name: string;
  specifier: unknown;
  adapterId: string;
}): Promise<string> {
  const { packageRoot, repositoryRoot, name, specifier, adapterId } = input;
  let resolved: string | undefined;
  let searchDirectory = packageRoot;
  for (;;) {
    try {
      resolved = await realpath(join(searchDirectory, "node_modules", name));
      break;
    } catch {
      if (searchDirectory === repositoryRoot) break;
      const parent = dirname(searchDirectory);
      if (parent === searchDirectory) break;
      searchDirectory = parent;
    }
  }
  if (resolved === undefined) {
    throw new FabricError("ADAPTER_ARTIFACT_MISSING", `local workspace dependency is unavailable: ${name}`);
  }
  const expected = await expectedWorkspaceDependencyRoot({ packageRoot, repositoryRoot, name, specifier, adapterId });
  if (resolved !== expected) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `local workspace dependency resolves outside its tracked location: ${name} resolved to ${resolved} but the tracked manifest requires ${expected} (adapter ${adapterId})`,
    );
  }
  return resolved;
}

async function readFileMaybe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Extracts the `extends` field from a tsconfig by tolerantly stripping
 * comments and trailing commas before JSON parsing. The tsconfig itself is
 * byte-verified against HEAD independently; this parse only walks the extends
 * chain, so an unparseable tracked tsconfig fails closed at the caller.
 */
function parseTsconfigExtends(raw: string): { ok: true; extends: string[] } | { ok: false } {
  const withoutBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLineComments = withoutBlockComments.replace(/(^|[^:"])\/\/[^\n\r]*/g, "$1");
  const withoutTrailingCommas = withoutLineComments.replace(/,(\s*[}\]])/g, "$1");
  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutTrailingCommas);
  } catch {
    return { ok: false };
  }
  if (!isRecord(parsed)) return { ok: true, extends: [] };
  const field = parsed.extends;
  if (typeof field === "string") return { ok: true, extends: [field] };
  if (Array.isArray(field)) return { ok: true, extends: field.filter((value): value is string => typeof value === "string") };
  return { ok: true, extends: [] };
}

/**
 * Resolves a tsconfig `extends` target to a repository-relative path only when
 * it names a file inside the repository. Relative and absolute targets resolve
 * to a `.json` file (TypeScript appends the extension); bare specifiers resolve
 * through `node_modules` into third-party packages that sit outside the
 * first-party span, exactly like lockfile-pinned dependencies, so they are not
 * bound here.
 */
function resolveTsconfigExtends(target: string, configDirectory: string, repositoryRoot: string): string | undefined {
  if (!target.startsWith(".") && !isAbsolute(target)) return undefined;
  let candidate = isAbsolute(target) ? target : resolve(configDirectory, target);
  if (!candidate.endsWith(".json")) candidate = `${candidate}.json`;
  const contained = relative(repositoryRoot, candidate);
  if (contained.length === 0 || contained.startsWith("..") || isAbsolute(contained)) return undefined;
  return candidate;
}

/**
 * The effective tsconfig chain tsx would read for a consulted package root:
 * the root's own `tsconfig.json` plus every `extends` ancestor that resolves
 * inside the repository. Each present tsconfig must be tracked at HEAD (a
 * present-but-untracked one could redirect module resolution while provenance
 * passes, so it fails closed), and every collected path is returned for
 * byte-for-byte verification against HEAD alongside the source span. An absent
 * tsconfig is acceptable because tsx reads none at that root.
 */
async function collectTsconfigChain(input: {
  packageRoot: string;
  repositoryRoot: string;
  adapterId: string;
}): Promise<string[]> {
  const { packageRoot, repositoryRoot, adapterId } = input;
  const collected = new Set<string>();
  const visited = new Set<string>();
  const pending = [join(packageRoot, "tsconfig.json")];
  while (pending.length > 0) {
    const configPath = pending.pop();
    if (configPath === undefined || visited.has(configPath)) continue;
    visited.add(configPath);
    const raw = await readFileMaybe(configPath);
    if (raw === undefined) continue;
    const portable = portableRepositoryPath(repositoryRoot, configPath, adapterId);
    if (!(await isTrackedAtHead(repositoryRoot, portable))) {
      throw new FabricError(
        "ADAPTER_COMPATIBILITY_INVALID",
        `wrapper TypeScript configuration is present but not tracked at the repository HEAD: ${portable} (adapter ${adapterId})`,
      );
    }
    collected.add(portable);
    const parsed = parseTsconfigExtends(raw);
    if (!parsed.ok) {
      throw new FabricError(
        "ADAPTER_COMPATIBILITY_INVALID",
        `wrapper TypeScript configuration is unparseable: ${portable} (adapter ${adapterId})`,
      );
    }
    for (const target of parsed.extends) {
      const resolved = resolveTsconfigExtends(target, dirname(configPath), repositoryRoot);
      if (resolved !== undefined) pending.push(resolved);
    }
  }
  return [...collected];
}

/**
 * The executed first-party source span of a wrapper: the src directory of
 * its owning workspace package plus the src directories of every local
 * workspace dependency, recursively. This is the same first-party set the
 * removed manifests pinned. Third-party lockfile-pinned dependencies stay
 * outside the span, exactly as they were outside the manifests.
 *
 * Span discovery itself fails closed: every package manifest it consults
 * must be tracked at the repository HEAD. An untracked manifest could
 * hijack the owning-package search and truncate the span, and a tracked
 * manifest deleted from the working tree could truncate the ancestor walk,
 * so both are hard verification failures instead of a silent fallback to
 * working-tree content. A wrapper with no owning workspace package at all
 * yields no verifiable span and is likewise a hard failure at the caller.
 * The consulted manifests are returned alongside the source spans so the
 * caller also verifies them byte-for-byte against HEAD.
 */
async function firstPartySourceSpans(input: {
  adapterId: string;
  wrapperPath: string;
  repositoryRoot: string;
}): Promise<{ sourceSpans: string[]; manifestPaths: string[] }> {
  const { adapterId, wrapperPath, repositoryRoot } = input;
  let packageRoot: string | undefined;
  let searchDirectory = dirname(wrapperPath);
  for (;;) {
    const manifestPath = join(searchDirectory, "package.json");
    if ((await readWorkspaceManifest(manifestPath)).state === "missing") {
      const portableManifest = portableRepositoryPath(repositoryRoot, manifestPath, adapterId);
      if (await isTrackedAtHead(repositoryRoot, portableManifest)) {
        throw new FabricError(
          "ADAPTER_COMPATIBILITY_INVALID",
          `wrapper first-party span discovery truncated: package manifest is tracked at HEAD but missing from the working tree: ${portableManifest} (adapter ${adapterId})`,
        );
      }
    } else {
      packageRoot = searchDirectory;
      break;
    }
    if (searchDirectory === repositoryRoot) break;
    const parent = dirname(searchDirectory);
    if (parent === searchDirectory) break;
    searchDirectory = parent;
  }
  if (packageRoot === undefined) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper has no owning workspace package: ${adapterId} (no package.json exists between the wrapper and its repository root, so the executed first-party source span cannot be verified)`,
    );
  }
  const spans = new Set<string>();
  const manifestPaths = new Set<string>();
  const visited = new Set<string>();
  const pending = [packageRoot];
  while (pending.length > 0) {
    const root = pending.pop();
    if (root === undefined || visited.has(root)) continue;
    visited.add(root);
    const manifestPath = join(root, "package.json");
    const portableManifest = portableRepositoryPath(repositoryRoot, manifestPath, adapterId);
    if (!(await isTrackedAtHead(repositoryRoot, portableManifest))) {
      throw new FabricError(
        "ADAPTER_COMPATIBILITY_INVALID",
        `wrapper workspace package manifest is not tracked at the repository HEAD: ${portableManifest} (adapter ${adapterId})`,
      );
    }
    const manifest = await readWorkspaceManifest(manifestPath);
    if (manifest.state !== "present") {
      throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `local workspace package manifest is invalid: ${root}`);
    }
    const document = manifest.document;
    manifestPaths.add(portableManifest);
    for (const tsconfigPortable of await collectTsconfigChain({ packageRoot: root, repositoryRoot, adapterId })) {
      manifestPaths.add(tsconfigPortable);
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
      const dependencyRoot = await resolveWorkspaceDependencyRoot({
        packageRoot: root,
        repositoryRoot,
        name,
        specifier,
        adapterId,
      });
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
  return { sourceSpans: [...spans].sort(), manifestPaths: [...manifestPaths].sort() };
}

/**
 * Enumerates the blob object SHAs tracked at HEAD under the given paths,
 * keyed by repository-relative POSIX path. `ls-tree -r` reads the committed
 * tree directly, so the result never consults the index or its stat cache.
 */
async function trackedBlobShas(repositoryRoot: string, paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const stdout = await gitOutput(repositoryRoot, ["ls-tree", "-r", "-z", "HEAD", "--", ...paths]);
  const shas = new Map<string, string>();
  for (const record of stdout.split("\0")) {
    if (record.length === 0) continue;
    const tab = record.indexOf("\t");
    if (tab === -1) continue;
    const [, type, sha] = record.slice(0, tab).split(" ");
    if (type !== "blob" || sha === undefined) continue;
    shas.set(record.slice(tab + 1), sha);
  }
  return shas;
}

/**
 * Computes the Git blob SHA of a worktree file from its current bytes via
 * `hash-object`, or undefined when the file is absent. This reads the file
 * itself rather than trusting the index, so `assume-unchanged` / `skip-worktree`
 * cannot hide byte drift from the comparison against the tracked blob SHA.
 */
async function worktreeBlobSha(repositoryRoot: string, portablePath: string): Promise<string | undefined> {
  try {
    return await gitOutput(repositoryRoot, ["hash-object", "--", portablePath]);
  } catch {
    return undefined;
  }
}

async function* walkWorktreeFiles(directory: string): AsyncGenerator<string> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walkWorktreeFiles(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

/**
 * Index-free byte verification of tracked content against HEAD. Every blob
 * tracked under the given files and spans must exist in the worktree with a
 * byte-identical blob SHA; each named file must additionally still be tracked
 * at HEAD; and every file physically present inside a source span must be
 * tracked (no untracked shadow that tsx would execute outside the verified
 * set). Every failure names the offending path.
 */
async function verifyTrackedBytesAgainstHead(input: {
  adapterId: string;
  repositoryRoot: string;
  files: string[];
  spans: string[];
  differsMessage: (portablePath: string) => string;
}): Promise<void> {
  const { adapterId, repositoryRoot, files, spans, differsMessage } = input;
  const paths = [...files, ...spans];
  if (paths.length === 0) return;
  const trackedShas = await trackedBlobShas(repositoryRoot, paths);
  for (const [portablePath, expectedSha] of trackedShas) {
    const actualSha = await worktreeBlobSha(repositoryRoot, portablePath);
    if (actualSha === undefined || actualSha !== expectedSha) {
      throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", differsMessage(portablePath));
    }
  }
  for (const file of files) {
    if (!trackedShas.has(file)) {
      throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", differsMessage(file));
    }
  }
  for (const span of spans) {
    const absoluteSpan = join(repositoryRoot, ...span.split("/"));
    for await (const worktreeFile of walkWorktreeFiles(absoluteSpan)) {
      const portable = relative(repositoryRoot, worktreeFile).split(sep).join("/");
      if (!trackedShas.has(portable)) {
        throw new FabricError(
          "ADAPTER_COMPATIBILITY_INVALID",
          `wrapper first-party source has an untracked file shadowing HEAD: ${portable} (adapter ${adapterId})`,
        );
      }
    }
  }
}

/**
 * Derives provenance for repository-owned wrapper code from Git: the commit
 * of the repository that owns the wrapper entrypoint plus the wrapper path
 * relative to that repository's root. Git supplies the content identity, so
 * the wrapper must be tracked at HEAD and byte-identical to its committed
 * content, and the executed first-party source span (the owning workspace
 * package's src tree plus local workspace dependency src trees, together
 * with every consulted package manifest) must be diff-clean against HEAD;
 * untracked, ignored or locally modified wrapper code fails closed. An
 * empty or truncated span discovery is itself a hard verification failure,
 * never a skip. No repository-local hash pin exists for wrapper code.
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
  await verifyTrackedBytesAgainstHead({
    adapterId: input.adapterId,
    repositoryRoot: resolvedRepositoryRoot,
    files: [portablePath],
    spans: [],
    differsMessage: (path) => `wrapper entrypoint differs from its committed content: ${input.adapterId} (${path})`,
  });
  const { sourceSpans, manifestPaths } = await firstPartySourceSpans({
    adapterId: input.adapterId,
    wrapperPath,
    repositoryRoot: resolvedRepositoryRoot,
  });
  if (sourceSpans.length === 0) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper first-party source span is empty: ${input.adapterId} (its owning workspace package has no src tree, so the executed source cannot be verified against HEAD)`,
    );
  }
  await verifyTrackedBytesAgainstHead({
    adapterId: input.adapterId,
    repositoryRoot: resolvedRepositoryRoot,
    files: manifestPaths,
    spans: sourceSpans,
    differsMessage: (path) => `wrapper first-party source differs from its committed content: ${input.adapterId} (${path})`,
  });
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

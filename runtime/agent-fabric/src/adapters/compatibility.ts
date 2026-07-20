import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
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

const PROVIDER_IDENTITY_POLICY: Readonly<Record<string, string>> = {
  "claude-agent-sdk": "apple-designated",
  "codex-app-server": "apple-designated",
  agy: "apple-designated",
  "cursor-agent": "cursor-partial-signed-helpers",
  "kiro-acp": "apple-designated",
  "opencode-acp": "owner-controlled-install-root",
};

async function gitOutput(directory: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", directory, ...args]);
  return stdout.trim();
}

async function verifyWrapperTrackedAndClean(input: {
  adapterId: string;
  wrapperDirectory: string;
  wrapperArgument: string;
}): Promise<string> {
  const { adapterId, wrapperDirectory, wrapperArgument } = input;
  let wrapperPath: string;
  try {
    wrapperPath = await gitOutput(wrapperDirectory, ["ls-files", "--full-name", "--error-unmatch", "--", wrapperArgument]);
  } catch (error: unknown) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper entrypoint is not tracked at the repository HEAD: ${adapterId} (${wrapperArgument})`,
      { cause: error },
    );
  }
  try {
    await gitOutput(wrapperDirectory, ["diff", "--quiet", "HEAD", "--", wrapperArgument]);
  } catch (error: unknown) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper entrypoint differs from its committed content: ${adapterId} (${wrapperPath})`,
      { cause: error },
    );
  }
  return wrapperPath;
}

/**
 * Derives provenance from the Git repository containing the configured wrapper
 * entrypoint. The wrapper must be tracked and clean against HEAD; its owning
 * package, source spans, TypeScript configuration and dependency symlinks are
 * intentionally outside this compatibility check.
 */
async function deriveWrapperProvenance(input: {
  adapterId: string;
  wrapperEntrypoint: string;
}): Promise<WrapperProvenance> {
  const configuredWrapperPath = resolve(input.wrapperEntrypoint);
  const wrapperDirectory = dirname(configuredWrapperPath);
  const wrapperArgument = `./${basename(configuredWrapperPath)}`;
  let repositoryRoot: string;
  let repositoryCommit: string;
  try {
    repositoryRoot = resolve(await gitOutput(wrapperDirectory, ["rev-parse", "--show-toplevel"]));
    repositoryCommit = await gitOutput(repositoryRoot, ["rev-parse", "HEAD"]);
  } catch (error: unknown) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper entrypoint has no Git repository provenance: ${input.adapterId}`,
      { cause: error },
    );
  }
  const wrapperPath = await verifyWrapperTrackedAndClean({
    adapterId: input.adapterId,
    wrapperDirectory,
    wrapperArgument,
  });
  return {
    adapterId: input.adapterId,
    repositoryCommit,
    wrapperPath,
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
 * Re-checks the wrapper's tracked-and-clean Git pin immediately before an
 * adapter process spawn and requires the composition identity to match.
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
}): Promise<{
  valid: true;
  adapterIds: string[];
  verifiedArtifactCount: number;
  wrapperProvenance: WrapperProvenance[];
  resolvedExecutables: Record<string, string>;
}> {
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
  const resolvedExecutables: Record<string, string> = {};
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
      const expectedIdentity = PROVIDER_IDENTITY_POLICY[adapterId];
      if (expectedIdentity !== undefined && adapter.implementation.provider_identity !== expectedIdentity) {
        throw new FabricError(
          "ADAPTER_COMPATIBILITY_INVALID",
          `enabled adapter has the wrong provider identity policy: ${adapterId}`,
        );
      }
      if (adapterId === "cursor-agent" && typeof adapter.implementation.cursor_install_root !== "string") {
        throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", "enabled Cursor adapter has no canonical install root");
      }
      if (adapterId === "opencode-acp" && typeof adapter.implementation.provider_install_root !== "string") {
        throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", "enabled OpenCode adapter has no canonical install root");
      }
    }
    if (input.requireEnabled) {
      const protocolVersion = adapter.contract.protocol_version;
      if (typeof protocolVersion !== "string" && typeof protocolVersion !== "number") {
        throw new FabricError(
          "ADAPTER_COMPATIBILITY_INVALID",
          `enabled adapter has no protocol version pin: ${adapterId}`,
        );
      }
      if (typeof adapter.implementation.executable !== "string") {
        throw new FabricError(
          "ADAPTER_COMPATIBILITY_INVALID",
          `enabled adapter has no provider executable: ${adapterId}`,
        );
      }
      if (
        adapter.implementation.kind === "npm-package" &&
        (typeof adapter.implementation.entrypoint !== "string" ||
          typeof adapter.implementation.entrypoint_sha256 !== "string")
      ) {
        throw new FabricError(
          "ADAPTER_COMPATIBILITY_INVALID",
          `enabled npm adapter has no executed entrypoint pin: ${adapterId}`,
        );
      }
    }
    for (const [field, expected] of Object.entries(adapter.implementation)) {
      if (!field.endsWith("_sha256") || field === "executable_sha256" || field === "bundle_entrypoint_sha256" || typeof expected !== "string") continue;
      const pathValue = adapter.implementation[field.slice(0, -"_sha256".length)];
      if (typeof pathValue !== "string") {
        throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `${adapterId}.${field} has no artifact path`);
      }
      await verifyHash(resolveCompatibilityArtifact(input.compatibilityPath, pathValue), expected);
      verifiedArtifactCount += 1;
    }
    if (typeof adapter.implementation.executable === "string") {
      resolvedExecutables[adapterId] = resolveCompatibilityArtifact(
        input.compatibilityPath,
        adapter.implementation.executable,
      );
    }
    const wrapperEntrypoint = adapter.implementation.wrapper_entrypoint;
    if (typeof wrapperEntrypoint === "string") {
      wrapperProvenance.push(await deriveWrapperProvenance({
        adapterId,
        wrapperEntrypoint: resolveCompatibilityArtifact(input.compatibilityPath, wrapperEntrypoint),
      }));
    }
  }
  return {
    valid: true,
    adapterIds: [...input.adapterIds],
    verifiedArtifactCount,
    wrapperProvenance,
    resolvedExecutables,
  };
}

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
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

async function gitOutput(directory: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", directory, ...args]);
  return stdout.trim();
}

/**
 * Derives provenance for repository-owned wrapper code from Git: the commit
 * of the repository that owns the wrapper entrypoint plus the wrapper path
 * relative to that repository's root. Git supplies the content identity, so
 * no repository-local hash pin exists for wrapper code.
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
  if (!/^[0-9a-f]{40,64}$/u.test(repositoryCommit)) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper repository commit is invalid: ${input.adapterId}`,
    );
  }
  const repositoryRelativePath = relative(await realpath(repositoryRoot), wrapperPath);
  if (repositoryRelativePath.length === 0 || repositoryRelativePath.startsWith("..") || isAbsolute(repositoryRelativePath)) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `wrapper entrypoint escapes its Git repository: ${input.adapterId}`,
    );
  }
  return {
    adapterId: input.adapterId,
    repositoryCommit,
    wrapperPath: repositoryRelativePath.split(sep).join("/"),
  };
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

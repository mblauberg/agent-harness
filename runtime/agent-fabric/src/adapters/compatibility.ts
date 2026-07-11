import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";

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

type WrapperManifest = {
  schemaVersion: 1;
  entrypoint: string;
  files: Array<{ path: string; sha256: string }>;
};

function parseWrapperManifest(value: unknown, adapterId: string): WrapperManifest {
  if (!isRecord(value) || value.schema_version !== 1 || typeof value.entrypoint !== "string" || !Array.isArray(value.files)) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `wrapper manifest is invalid: ${adapterId}`);
  }
  const files: Array<{ path: string; sha256: string }> = [];
  for (const member of value.files) {
    if (
      !isRecord(member) ||
      typeof member.path !== "string" ||
      member.path.length === 0 ||
      typeof member.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(member.sha256)
    ) {
      throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `wrapper manifest member is invalid: ${adapterId}`);
    }
    files.push({ path: member.path, sha256: member.sha256 });
  }
  if (files.length === 0) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `wrapper manifest has no members: ${adapterId}`);
  }
  return { schemaVersion: 1, entrypoint: value.entrypoint, files };
}

const LOCAL_IMPORT = /(?:\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?|\bimport\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/gu;

function localImports(source: string, sourcePath: string): string[] {
  return [...source.matchAll(LOCAL_IMPORT)].map((match) => resolve(dirname(sourcePath), match[1] ?? ""));
}

async function discoverWrapperClosure(entrypoint: string): Promise<string[]> {
  const pending = [entrypoint];
  const discovered = new Set<string>();
  while (pending.length > 0) {
    const path = pending.pop();
    if (path === undefined || discovered.has(path)) continue;
    discovered.add(path);
    let source: string;
    try {
      source = await readFile(path, "utf8");
    } catch (error: unknown) {
      throw new FabricError("ADAPTER_ARTIFACT_MISSING", `wrapper closure member is unavailable: ${path}`, {
        cause: error,
      });
    }
    for (const dependency of localImports(source, path)) {
      if (!discovered.has(dependency)) pending.push(dependency);
    }
  }
  return [...discovered].sort((left, right) => left.localeCompare(right));
}

async function verifyWrapperClosure(input: {
  adapterId: string;
  compatibilityPath: string;
  wrapperEntrypoint: string;
  manifestPath: string;
}): Promise<number> {
  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(await readFile(input.manifestPath, "utf8"));
  } catch (error: unknown) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `wrapper manifest cannot be read: ${input.adapterId}`, {
      cause: error,
    });
  }
  const manifest = parseWrapperManifest(manifestValue, input.adapterId);
  const entrypoint = resolveCompatibilityArtifact(input.compatibilityPath, manifest.entrypoint);
  if (entrypoint !== input.wrapperEntrypoint) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `wrapper manifest entrypoint differs: ${input.adapterId}`);
  }
  const members = manifest.files.map((member) => ({
    path: resolveCompatibilityArtifact(input.compatibilityPath, member.path),
    sha256: member.sha256,
  }));
  const uniqueMembers = new Set(members.map((member) => member.path));
  if (uniqueMembers.size !== members.length) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `wrapper manifest contains duplicate members: ${input.adapterId}`);
  }
  const closure = await discoverWrapperClosure(entrypoint);
  const declared = [...uniqueMembers].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(closure) !== JSON.stringify(declared)) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `wrapper manifest does not match import closure: ${input.adapterId}`);
  }
  for (const member of members) await verifyHash(member.path, member.sha256);
  return members.length;
}

export async function verifyAdapterCompatibility(input: {
  compatibilityPath: string;
  schemaPath: string;
  adapterIds: string[];
  requireEnabled: boolean;
}): Promise<{ valid: true; adapterIds: string[]; verifiedArtifactCount: number }> {
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
    if (
      input.requireEnabled &&
      (typeof adapter.implementation.wrapper_entrypoint !== "string" ||
        typeof adapter.implementation.wrapper_entrypoint_sha256 !== "string" ||
        typeof adapter.implementation.wrapper_manifest !== "string" ||
        typeof adapter.implementation.wrapper_manifest_sha256 !== "string")
    ) {
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
        (field) =>
          field.endsWith("_sha256") &&
          field !== "wrapper_entrypoint_sha256" &&
          field !== "wrapper_manifest_sha256",
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
    const wrapperManifest = adapter.implementation.wrapper_manifest;
    if (typeof wrapperEntrypoint === "string" || typeof wrapperManifest === "string") {
      if (typeof wrapperEntrypoint !== "string" || typeof wrapperManifest !== "string") {
        throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `adapter wrapper closure pin is incomplete: ${adapterId}`);
      }
      verifiedArtifactCount += await verifyWrapperClosure({
        adapterId,
        compatibilityPath: input.compatibilityPath,
        wrapperEntrypoint: resolveCompatibilityArtifact(input.compatibilityPath, wrapperEntrypoint),
        manifestPath: resolveCompatibilityArtifact(input.compatibilityPath, wrapperManifest),
      });
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
  return { valid: true, adapterIds: [...input.adapterIds], verifiedArtifactCount };
}

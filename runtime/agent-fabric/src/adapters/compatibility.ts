import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
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

const MODULE_IMPORT = /(?:\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?|\bimport\s*\(\s*)["']([^"']+)["']/gu;

function exportTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  for (const [condition, candidate] of Object.entries(value)) {
    if (condition !== "import" && condition !== "node" && condition !== "default") continue;
    const target = exportTarget(candidate);
    if (target !== undefined) return target;
  }
  return undefined;
}

function workspacePackageName(specifier: string): string | undefined {
  return /^(@local\/[^/]+)(?:\/.*)?$/u.exec(specifier)?.[1];
}

async function resolveWorkspaceImport(specifier: string, sourcePath: string): Promise<string[]> {
  const packageName = workspacePackageName(specifier);
  if (packageName === undefined) return [];
  let searchDirectory = dirname(sourcePath);
  let packageJsonPath: string | undefined;
  while (packageJsonPath === undefined) {
    try {
      packageJsonPath = await realpath(resolve(searchDirectory, "node_modules", packageName, "package.json"));
    } catch {
      const parent = dirname(searchDirectory);
      if (parent === searchDirectory) {
        throw new FabricError("ADAPTER_ARTIFACT_MISSING", `local workspace package is unavailable: ${specifier}`);
      }
      searchDirectory = parent;
    }
  }
  let packageDocument: unknown;
  try {
    packageDocument = JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch (error: unknown) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `local workspace package manifest is invalid: ${specifier}`,
      { cause: error },
    );
  }
  if (!isRecord(packageDocument)) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `local workspace package manifest is invalid: ${specifier}`);
  }
  const subpath = specifier.slice(packageName.length);
  const exportKey = subpath.length === 0 ? "." : `.${subpath}`;
  const exportsValue = packageDocument.exports;
  const selectedExport = isRecord(exportsValue) && Object.hasOwn(exportsValue, exportKey)
    ? exportsValue[exportKey]
    : exportKey === "."
      ? exportsValue
      : undefined;
  const target = exportTarget(selectedExport) ?? (
    exportKey === "." && typeof packageDocument.module === "string"
      ? packageDocument.module
      : exportKey === "." && typeof packageDocument.main === "string"
        ? packageDocument.main
        : undefined
  );
  if (target === undefined || !target.startsWith("./")) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `local workspace package export is invalid: ${specifier}`);
  }
  let entrypoint: string;
  try {
    entrypoint = await realpath(resolve(dirname(packageJsonPath), target));
  } catch (error: unknown) {
    throw new FabricError("ADAPTER_ARTIFACT_MISSING", `local workspace package export is unavailable: ${specifier}`, {
      cause: error,
    });
  }
  const packageRelativePath = relative(dirname(packageJsonPath), entrypoint);
  if (packageRelativePath.startsWith("..") || isAbsolute(packageRelativePath)) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `local workspace package export escapes its package: ${specifier}`);
  }
  return [packageJsonPath, entrypoint];
}

async function localImports(source: string, sourcePath: string): Promise<string[]> {
  const dependencies: string[] = [];
  for (const match of source.matchAll(MODULE_IMPORT)) {
    const specifier = match[1] ?? "";
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      dependencies.push(resolve(dirname(sourcePath), specifier));
    } else {
      dependencies.push(...await resolveWorkspaceImport(specifier, sourcePath));
    }
  }
  return dependencies;
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
    for (const dependency of await localImports(source, path)) {
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
  let entrypoint: string;
  let wrapperEntrypoint: string;
  try {
    [entrypoint, wrapperEntrypoint] = await Promise.all([
      realpath(resolveCompatibilityArtifact(input.compatibilityPath, manifest.entrypoint)),
      realpath(input.wrapperEntrypoint),
    ]);
  } catch (error: unknown) {
    throw new FabricError("ADAPTER_ARTIFACT_MISSING", `wrapper entrypoint is unavailable: ${input.adapterId}`, {
      cause: error,
    });
  }
  if (entrypoint !== wrapperEntrypoint) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", `wrapper manifest entrypoint differs: ${input.adapterId}`);
  }
  const members = await Promise.all(manifest.files.map(async (member) => {
    const unresolved = resolveCompatibilityArtifact(input.compatibilityPath, member.path);
    try {
      return { path: await realpath(unresolved), sha256: member.sha256 };
    } catch (error: unknown) {
      throw new FabricError("ADAPTER_ARTIFACT_MISSING", `wrapper closure member is unavailable: ${unresolved}`, {
        cause: error,
      });
    }
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

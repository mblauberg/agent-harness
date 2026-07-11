import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

type Stage4AdapterId = "pi-rpc" | "agy";

const FAMILIES: Record<Stage4AdapterId, string[]> = {
  "pi-rpc": ["generic-open", "open-weight"],
  agy: ["google"],
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stage4RepositoryPath(relativePath: string): string {
  return fileURLToPath(new URL(`../../../../${relativePath}`, import.meta.url));
}

export function stage4SchemaPath(): string {
  return stage4RepositoryPath("runtime/agent-fabric/schemas/adapter-compatibility.schema.json");
}

export function stage4FixtureCommand(adapterId: Stage4AdapterId): string[] {
  return [
    process.execPath,
    "--import",
    "tsx",
    fileURLToPath(new URL("./stage4-pi-agy-fixture.ts", import.meta.url)),
    adapterId,
    JSON.stringify(FAMILIES[adapterId]),
  ];
}

export async function createResolvedStage4Compatibility(adapterId: Stage4AdapterId): Promise<{
  directory: string;
  compatibilityPath: string;
  schemaPath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), `agent-fabric-${adapterId}-`));
  const executablePath = join(directory, `${adapterId}-fixture`);
  const protocolSchemaPath = join(directory, `${adapterId}-protocol.json`);
  const wrapperManifestPath = join(directory, `${adapterId}-wrapper-manifest.json`);
  const executableBytes = `${adapterId} deterministic fixture\n`;
  const schemaBytes = `${JSON.stringify({ schemaVersion: 1, protocolVersion: 1 })}\n`;
  await writeFile(executablePath, executableBytes, { mode: 0o700 });
  await writeFile(protocolSchemaPath, schemaBytes, { mode: 0o600 });
  const wrapperManifest = `${JSON.stringify({
    schema_version: 1,
    entrypoint: executablePath,
    files: [{ path: executablePath, sha256: sha256(executableBytes) }],
  })}\n`;
  await writeFile(wrapperManifestPath, wrapperManifest, { mode: 0o600 });
  const compatibilityPath = join(directory, "adapter-compatibility.yaml");
  await writeFile(
    compatibilityPath,
    stringify({
      schema_version: 1,
      verification_date: "2026-07-10",
      adapter_contract_version: 1,
      capability_fixture_version: 1,
      activation_policy: { real_adapters_require_separate_gate: true, default_enabled: false },
      adapters: {
        [adapterId]: {
          enabled: true,
          delivery_stage: 4,
          implementation: {
            kind: "fixture-process",
            installed_version: "1.0.0-fixture",
            executable: executablePath,
            executable_sha256: sha256(executableBytes),
            wrapper_entrypoint: executablePath,
            wrapper_entrypoint_sha256: sha256(executableBytes),
            wrapper_manifest: wrapperManifestPath,
            wrapper_manifest_sha256: sha256(wrapperManifest),
          },
          contract: {
            adapter_version: 1,
            protocol: `${adapterId}-fixture`,
            protocol_version: "1",
            schema_source: protocolSchemaPath,
            schema_sha256: sha256(schemaBytes),
            capability_fixture_version: 1,
          },
          runtime_range: { platforms: [process.platform] },
          model_family_constraints: {
            allowed: FAMILIES[adapterId],
            requires_explicit_model: true,
          },
          official_source_url: "https://example.invalid/deterministic-fixture",
          unresolved_pins: [],
        },
      },
    }),
  );
  return { directory, compatibilityPath, schemaPath: stage4SchemaPath() };
}

export async function createEnabledUnresolvedCheckedInAdapter(adapterId: Stage4AdapterId): Promise<{
  directory: string;
  compatibilityPath: string;
  schemaPath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), `agent-fabric-${adapterId}-unresolved-`));
  const checkedInPath = stage4RepositoryPath("config/adapter-compatibility.yaml");
  const document: unknown = parse(await readFile(checkedInPath, "utf8"));
  if (!isRecord(document) || !isRecord(document.adapters)) throw new TypeError("compatibility registry is invalid");
  const adapters = document.adapters;
  const adapter = adapters[adapterId];
  if (!isRecord(adapter)) throw new Error(`checked-in adapter missing: ${adapterId}`);
  adapter.enabled = true;
  adapter.unresolved_pins = ["test-only unresolved pin"];
  const compatibilityPath = join(directory, "adapter-compatibility.yaml");
  await writeFile(compatibilityPath, stringify(document));
  return { directory, compatibilityPath, schemaPath: stage4SchemaPath() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

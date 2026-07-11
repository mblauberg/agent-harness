import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { stringify } from "yaml";

import * as publicApi from "../../src/index.ts";
import { openFabric } from "../../src/index.ts";

import { ROOT_AUTHORITY } from "./stage1-fixture.ts";

export type PublicFunction = (...args: unknown[]) => unknown;

export function requirePublicFunction(name: string): PublicFunction {
  const value: unknown = Reflect.get(publicApi, name);
  if (typeof value !== "function") {
    throw new Error(`public agent-fabric API ${name} is not implemented`);
  }
  return (...args: unknown[]) => Reflect.apply(value, undefined, args);
}

export function primaryAdapterFixtureCommand(adapterId: string): string[] {
  return [
    process.execPath,
    "--import",
    "tsx",
    fileURLToPath(new URL("./primary-adapter-fixture.ts", import.meta.url)),
    adapterId,
  ];
}

export function repositoryPath(relativePath: string): string {
  return fileURLToPath(new URL(`../../../../${relativePath}`, import.meta.url));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compatibilityAdapter(options: {
  adapterId: string;
  implementationPath: string;
  implementationHash: string;
  schemaPath: string;
  schemaHash: string;
}): Record<string, unknown> {
  return {
    enabled: false,
    delivery_stage: 3,
    implementation: {
      kind: "fixture-process",
      installed_version: "1.0.0-fixture",
      executable: options.implementationPath,
      executable_sha256: options.implementationHash,
    },
    contract: {
      adapter_version: 1,
      protocol: `${options.adapterId}-fixture`,
      protocol_version: "1",
      schema_source: options.schemaPath,
      schema_sha256: options.schemaHash,
      capability_fixture_version: 1,
    },
    runtime_range: { platforms: [process.platform] },
    model_family_constraints: { allowed: [] },
    official_source_url: "https://example.invalid/fixture",
    unresolved_pins: [],
  };
}

export async function createPrimaryCompatibilityFixture(): Promise<{
  directory: string;
  compatibilityPath: string;
  schemaPath: string;
  artifactPaths: string[];
}> {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-primary-compatibility-"));
  const executablePath = join(directory, "fixture-adapter");
  const protocolSchemaPath = join(directory, "fixture-protocol.json");
  const executableBytes = "fixture adapter executable\n";
  const schemaBytes = `${JSON.stringify({ schemaVersion: 1, protocolVersion: 1 })}\n`;
  await writeFile(executablePath, executableBytes, { mode: 0o700 });
  await writeFile(protocolSchemaPath, schemaBytes, { mode: 0o600 });

  const adapters = Object.fromEntries(
    ["claude-agent-sdk", "codex-app-server", "herdr"].map((adapterId) => [
      adapterId,
      compatibilityAdapter({
        adapterId,
        implementationPath: executablePath,
        implementationHash: sha256(executableBytes),
        schemaPath: protocolSchemaPath,
        schemaHash: sha256(schemaBytes),
      }),
    ]),
  );
  const compatibilityPath = join(directory, "adapter-compatibility.yaml");
  await writeFile(
    compatibilityPath,
    stringify({
      schema_version: 1,
      verification_date: "2026-07-10",
      adapter_contract_version: 1,
      capability_fixture_version: 1,
      activation_policy: {
        real_adapters_require_separate_gate: true,
        default_enabled: false,
      },
      adapters,
    }),
  );
  return {
    directory,
    compatibilityPath,
    schemaPath: repositoryPath("runtime/agent-fabric/schemas/adapter-compatibility.schema.json"),
    artifactPaths: [executablePath, protocolSchemaPath],
  };
}

export async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(value)) {
    throw new TypeError(`${path} must contain an object`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function createInterventionFixture() {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-intervention-"));
  const fabric = await openFabric({ databasePath: join(directory, "fabric.sqlite3"), workspaceRoots: [directory] });
  const run = await fabric.createRun({
    runId: "run-stage3-intervention",
    projectRunDirectory: directory,
    chair: { agentId: "chair", authority: ROOT_AUTHORITY },
  });
  return {
    directory,
    fabric,
    chair: fabric.connect(run.chairCapability),
  };
}

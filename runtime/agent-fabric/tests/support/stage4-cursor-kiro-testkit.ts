import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { stringify } from "yaml";

import * as publicApi from "../../src/index.ts";
import { runAdapterConformance } from "../../src/index.ts";

import { commitFixtureRepository, writeWrapperPackageScaffold } from "./fixture-repository.ts";

export type Stage4AdapterId = "cursor-agent" | "kiro-acp";
export type PublicFunction = (...arguments_: unknown[]) => unknown;

const fixtureAdapter = fileURLToPath(new URL("./stage4-cursor-kiro-fake-adapter.ts", import.meta.url));

export function repositoryPath(relativePath: string): string {
  return fileURLToPath(new URL(`../../../../${relativePath}`, import.meta.url));
}

export function requireStage4PublicFunction(name: string): PublicFunction {
  const value: unknown = Reflect.get(publicApi, name);
  if (typeof value !== "function") {
    throw new Error(`public agent-fabric API ${name} is not implemented`);
  }
  return (...arguments_: unknown[]) => Reflect.apply(value, undefined, arguments_);
}

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function compatibilityEntry(input: {
  adapterId: Stage4AdapterId;
  executableHash: string;
  schemaPath: string;
  schemaHash: string;
  wrapperPath: string;
  unresolved: boolean;
}): Record<string, unknown> {
  const cursor = input.adapterId === "cursor-agent";
  return {
    enabled: true,
    delivery_stage: 4,
    implementation: {
      kind: "fixture-process",
      installed_version: "1.0.0-fixture",
      executable: fixtureAdapter,
      executable_sha256: input.executableHash,
      wrapper_entrypoint: input.wrapperPath,
    },
    contract: {
      adapter_version: 1,
      protocol: cursor ? "cursor-fixture-jsonl" : "kiro-fixture-acp",
      protocol_version: input.unresolved ? null : "1",
      schema_source: input.unresolved ? null : input.schemaPath,
      schema_sha256: input.unresolved ? null : input.schemaHash,
      capability_fixture_version: 1,
      ...(cursor ? {} : { agent_engine: "v2" }),
    },
    runtime_range: { platforms: [process.platform] },
    model_family_constraints: cursor
      ? {
          allowed: ["cursor-composer", "xai"],
          allowed_model_patterns: ["composer-*", "cursor-grok-*"],
          requires_explicit_model: true,
        }
      : {
          allowed: ["open-weight"],
          requires_explicit_model: true,
          route_role: "open-model-worker",
        },
    official_source_url: "https://example.invalid/stage4-fixture",
    unresolved_pins: input.unresolved ? ["fixture protocol/schema pin unresolved"] : [],
  };
}

export async function createCursorKiroCompatibilityFixture(options: {
  unresolvedAdapters?: Stage4AdapterId[];
} = {}): Promise<{
  directory: string;
  compatibilityPath: string;
  schemaPath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-stage4-cursor-kiro-"));
  const protocolSchemaPath = join(directory, "fixture-protocol.json");
  const wrapperPath = join(directory, "fixture-wrapper.js");
  const protocolSchema = `${JSON.stringify({ schemaVersion: 1, adapterContractVersion: 1 })}\n`;
  const wrapper = "export const fixtureWrapper = true;\n";
  await writeFile(protocolSchemaPath, protocolSchema, { mode: 0o600 });
  await writeFile(wrapperPath, wrapper, { mode: 0o600 });
  await writeWrapperPackageScaffold(directory);
  await commitFixtureRepository(directory);
  const executableHash = digest(await readFile(fixtureAdapter));
  const schemaHash = digest(protocolSchema);
  const unresolved = new Set(options.unresolvedAdapters ?? []);
  const adapters = Object.fromEntries(
    (["cursor-agent", "kiro-acp"] as const).map((adapterId) => [
      adapterId,
      compatibilityEntry({
        adapterId,
        executableHash,
        schemaPath: protocolSchemaPath,
        schemaHash,
        wrapperPath,
        unresolved: unresolved.has(adapterId),
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
      activation_policy: { real_adapters_require_separate_gate: true, default_enabled: false },
      adapters,
    }),
  );
  return {
    directory,
    compatibilityPath,
    schemaPath: repositoryPath("runtime/agent-fabric/schemas/adapter-compatibility.schema.json"),
  };
}

export async function runStage4Fixture(input: {
  adapterId: Stage4AdapterId;
  model: string;
  modelFamily: string;
  journalPath: string;
}): Promise<Awaited<ReturnType<typeof runAdapterConformance>>> {
  return await runAdapterConformance({
    command: [process.execPath, "--import", "tsx", fixtureAdapter, input.adapterId],
    environment: { STAGE4_FAKE_ADAPTER_JOURNAL: input.journalPath },
    action: {
      actionId: `${input.adapterId}:conformance:1`,
      operation: "send_turn",
      payload: { model: input.model, modelFamily: input.modelFamily, prompt: "fixture-only" },
    },
  });
}

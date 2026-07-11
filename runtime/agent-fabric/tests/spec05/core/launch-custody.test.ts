import Database from "better-sqlite3";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../../src/core/migrations.ts";
import {
  LaunchCustodyService,
  computeLaunchResourceStateDigest,
  normaliseLaunchChairAuthority,
  type LaunchCustodyIntent,
} from "../../../src/project-session/launch-custody.ts";
import { canonicalJson, sha256 } from "../../../src/project-session/store-support.ts";

const databases: Database.Database[] = [];
const directories: string[] = [];
const now = Date.parse("2027-01-01T00:00:00Z");
const digest = (value: string): `sha256:${string}` => `sha256:${sha256(value)}`;
const trustDigest = digest("trusted-project-record");
const contract = {
  schemaVersion: 1,
  inputSchemaId: "chair-launch-input.v1",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["model"],
    properties: { model: { type: "string", minLength: 1 } },
  },
} as const;
const contractDigest = digest(canonicalJson(contract));

function createFixture(): {
  database: Database.Database;
  root: string;
  service: LaunchCustodyService;
  intent: LaunchCustodyIntent;
} {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "afab-launch-custody-")));
  directories.push(root);
  const database = new Database(":memory:");
  databases.push(database);
  applyMigrations(database);

  const resourcePlan = {
    schema_version: 1,
    project_id: "project_01",
    project_session_id: "session_launch_01",
    run_id: "run_launch_01",
    budget_ref: "budget_launch_01",
    scopes: {
      project: { scope_id: "scope_project_01", limits: { provider_calls: 10 } },
      project_session: { scope_id: "scope_session_launch_01", limits: { provider_calls: 10 } },
      coordination_run: { scope_id: "scope_run_launch_01", limits: { provider_calls: 10 } },
    },
    launch_reservation: { amounts: { provider_calls: 1 } },
  };
  const resourcePlanText = canonicalJson(resourcePlan);
  writeFileSync(join(root, "launch-resources.json"), resourcePlanText, { mode: 0o600 });
  const resourcePlanRef = { path: "launch-resources.json", digest: digest(resourcePlanText) };

  const chairAuthority = {
    workspaceRoots: ["."],
    sourcePaths: ["."],
    artifactPaths: [".agent-run/AFAB-LAUNCH"],
    actions: ["read"],
    deniedPaths: [],
    deniedActions: [],
    disclosure: { level: "forbidden" },
    expiresAt: "2027-01-02T00:00:00.000Z",
    budget: { provider_calls: 10 },
  };
  const normalisedAuthority = normaliseLaunchChairAuthority(chairAuthority, root);
  const authorityRef = digest(canonicalJson(normalisedAuthority));
  const launchPacket = {
    schema_version: 1,
    project_id: "project_01",
    project_session_id: "session_launch_01",
    run_id: "run_launch_01",
    chair_agent_id: "chair_launch_01",
    project_run_directory: ".agent-run/AFAB-LAUNCH",
    topology_mode: "coordinated",
    budget_ref: "budget_launch_01",
    resource_plan_ref: resourcePlanRef,
    chair_authority: chairAuthority,
    provider: {
      adapter_id: "claude-agent-sdk",
      action_id: "provider_launch_01",
      contract_digest: contractDigest,
      input_schema_id: contract.inputSchemaId,
      input: { model: "claude-opus-4-1" },
    },
  };
  const packetText = canonicalJson(launchPacket);
  writeFileSync(join(root, "launch-packet.json"), packetText, { mode: 0o600 });
  const launchPacketRef = { path: "launch-packet.json", digest: digest(packetText) };

  database.prepare(`
    INSERT INTO projects(
      project_id, canonical_root, trust_record_digest, revision,
      authority_generation, created_at, updated_at
    ) VALUES ('project_01', ?, ?, 1, 1, ?, ?)
  `).run(root, trustDigest, now - 1_000, now - 1_000);
  database.prepare(`
    INSERT INTO project_sessions(
      project_session_id, project_id, mode, state, revision, generation,
      authority_ref, budget_ref, launch_packet_path, launch_packet_digest,
      membership_revision, origin_kind, origin_operator_id, created_at, updated_at
    ) VALUES (
      'session_launch_01', 'project_01', 'coordinated', 'awaiting_launch', 2, 1,
      ?, 'budget_launch_01', ?, ?, 1, 'operator-launch', 'operator_01', ?, ?
    )
  `).run(authorityRef, launchPacketRef.path, launchPacketRef.digest, now - 900, now - 900);
  database.exec(`
    INSERT INTO operator_principals(
      operator_id, project_id, project_session_id, authenticated_subject_hash,
      project_authority_generation, principal_generation, state, created_at, updated_at
    ) VALUES (
      'operator_01', 'project_01', NULL, 'subject-hash', 1, 1, 'active', ${now - 800}, ${now - 800}
    );
    INSERT INTO operator_capabilities(
      capability_id, token_hash, operator_id, project_id, project_session_id,
      project_authority_generation, session_generation, principal_generation,
      kind, operations_json, issued_at, expires_at
    ) VALUES (
      'operator_cap_launch_01', '${sha256("operator-secret")}', 'operator_01', 'project_01',
      'session_launch_01', 1, 1, 1, 'session', '["launch","read"]',
      ${now - 700}, ${now + 60_000}
    );
  `);

  const service = new LaunchCustodyService({
    database,
    clock: () => now,
    randomCapability: () => "chair-secret-canary-01",
    fabricSocketPath: "/private/agent-fabric.sock",
    adapterContracts: {
      inspect: async (adapterId) => {
        if (adapterId !== "claude-agent-sdk") throw new Error("unknown adapter");
        return contract;
      },
    },
    adapterEffects: {
      dispatch: async () => { throw new Error("not expected during preparation"); },
      lookup: async () => { throw new Error("not expected during preparation"); },
    },
  });
  const intent: LaunchCustodyIntent = {
    kind: "project-session-launch",
    projectId: "project_01",
    projectSessionId: "session_launch_01",
    expectedProjectRevision: 1,
    expectedSessionRevision: 2,
    expectedSessionGeneration: 1,
    trustRecordDigest: trustDigest,
    launchPacketRef,
    authorityRef,
    budgetRef: "budget_launch_01",
    resourcePlanRef,
    providerAdapterId: "claude-agent-sdk",
    providerActionId: "provider_launch_01",
    providerContractDigest: contractDigest,
    resourceStateDigest: computeLaunchResourceStateDigest(database, "project_01", "session_launch_01"),
  };
  return { database, root, service, intent };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("launch custody", () => {
  it("inspects closed artifacts and atomically prepares one hash-only chair launch", async () => {
    const fixture = createFixture();
    const inspection = await fixture.service.inspect(fixture.intent);
    let handle: ReturnType<LaunchCustodyService["prepareInTransaction"]> | undefined;
    fixture.database.transaction(() => {
      fixture.database.prepare(`
        INSERT INTO operator_commands(
          operator_id, command_id, capability_id, project_id, project_session_id,
          operation, expected_revision, payload_hash, provenance_json, before_json,
          after_json, evidence_json, result_json, status, created_at
        ) VALUES (
          'operator_01', 'commit_launch_01', 'operator_cap_launch_01', 'project_01',
          'session_launch_01', 'launch', 2, 'payload-hash', '{}', '{}', '{}', '[]', '{}',
          'committed', ${now}
        )
      `).run();
      handle = fixture.service.prepareInTransaction({
        inspection,
        operatorId: "operator_01",
        operatorCommandId: "commit_launch_01",
      });
    })();

    expect(handle).toMatchObject({
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      capability: "chair-secret-canary-01",
      socketPath: "/private/agent-fabric.sock",
    });
    expect(fixture.database.prepare(`
      SELECT state, revision FROM project_sessions WHERE project_session_id='session_launch_01'
    `).get()).toEqual({ state: "launching", revision: 3 });
    expect(fixture.database.prepare(`
      SELECT lifecycle_state, chair_agent_id FROM runs WHERE run_id='run_launch_01'
    `).get()).toEqual({ lifecycle_state: "launching", chair_agent_id: "chair_launch_01" });
    expect(fixture.database.prepare(`
      SELECT status, execution_count, effect_count FROM provider_actions
       WHERE adapter_id='claude-agent-sdk' AND action_id='provider_launch_01'
    `).get()).toEqual({ status: "prepared", execution_count: 0, effect_count: 0 });
    expect(fixture.database.prepare(`
      SELECT COUNT(*) AS count FROM project_session_launch_custody
    `).get()).toEqual({ count: 1 });
    expect(fixture.database.prepare(`
      SELECT COUNT(*) AS count FROM capabilities WHERE token_hash=?
    `).get(sha256("chair-secret-canary-01"))).toEqual({ count: 1 });
    expect(fixture.database.prepare(`
      SELECT COUNT(*) AS count FROM capabilities WHERE token_hash='chair-secret-canary-01'
    `).get()).toEqual({ count: 0 });
    expect(fixture.database.prepare(`
      SELECT operation_id, state FROM resource_reservations
       WHERE reservation_id=(SELECT reservation_id FROM project_session_launch_custody)
    `).get()).toEqual({ operation_id: "provider_launch_01", state: "reserved" });
  });

  it("rejects extra artifact fields and symlink escape before any launch row", async () => {
    const fixture = createFixture();
    const packetPath = join(fixture.root, fixture.intent.launchPacketRef.path);
    const packet = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(packetPath, "utf8"))) as Record<string, unknown>;
    packet.unreviewed = true;
    const changed = canonicalJson(packet);
    writeFileSync(packetPath, changed, { mode: 0o600 });
    fixture.database.prepare(`
      UPDATE project_sessions SET launch_packet_digest=?, revision=revision+1
       WHERE project_session_id='session_launch_01'
    `).run(digest(changed));
    await expect(fixture.service.inspect({
      ...fixture.intent,
      expectedSessionRevision: 3,
      launchPacketRef: { ...fixture.intent.launchPacketRef, digest: digest(changed) },
    })).rejects.toMatchObject({ code: "PROTOCOL_INVALID" });

    const outside = join(fixture.root, "outside-packet.json");
    writeFileSync(outside, "{}", { mode: 0o600 });
    symlinkSync(outside, join(fixture.root, "linked-packet.json"));
    fixture.database.prepare(`
      UPDATE project_sessions
         SET launch_packet_path='linked-packet.json', launch_packet_digest=?, revision=revision+1
       WHERE project_session_id='session_launch_01'
    `).run(digest("{}"));
    await expect(fixture.service.inspect({
      ...fixture.intent,
      expectedSessionRevision: 4,
      launchPacketRef: { path: "linked-packet.json", digest: digest("{}") },
    })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM runs").get()).toEqual({ count: 0 });
  });
});

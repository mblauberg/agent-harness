import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import {
  parseArtifactRef,
  parseProjectSessionLaunchIntent,
  parseSha256Digest,
  type OperatorActionCommitRequest,
  type OperatorActionPreviewRequest,
  type Sha256Digest,
} from "@local/agent-fabric-protocol";

import { applyMigrations } from "../../../src/core/migrations.ts";
import { OperatorActionStore } from "../../../src/operator/action-store.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
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
const digest = (value: string): Sha256Digest => parseSha256Digest(`sha256:${sha256(value)}`, "test.digest");
const trustDigest = digest("trusted-project-record");
const contract = {
  schemaVersion: 1,
  method: "launch_chair",
  oneUse: true,
  secretTransport: "private-environment",
  environment: {
    capability: "AGENT_FABRIC_CAPABILITY",
    socketPath: "AGENT_FABRIC_SOCKET_PATH",
  },
  inputSchemaId: "chair-launch-input.v1",
  publicPayloadSchema: {
    type: "object",
    additionalProperties: false,
    required: ["model"],
    properties: { model: { type: "string", minLength: 1 } },
  },
  noEffectProofSchemas: {
    "provider-no-effect.v1": {
      type: "object",
      additionalProperties: false,
      required: ["effectCount"],
      properties: { effectCount: { const: 0 } },
    },
  },
} as const;
const contractDigest = digest(canonicalJson(contract));

function databaseContains(database: Database.Database, needle: string): boolean {
  const tables = database.prepare(`
    SELECT name FROM sqlite_master
     WHERE type='table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name
  `).all() as Array<{ name: string }>;
  for (const { name } of tables) {
    const quotedTable = `"${name.replaceAll('"', '""')}"`;
    const columns = database.prepare(`PRAGMA table_info(${quotedTable})`).all() as Array<{ name: string }>;
    for (const column of columns) {
      const quotedColumn = `"${column.name.replaceAll('"', '""')}"`;
      if (database.prepare(`SELECT 1 FROM ${quotedTable} WHERE instr(CAST(${quotedColumn} AS TEXT), ?) > 0 LIMIT 1`).get(needle) !== undefined) {
        return true;
      }
    }
  }
  return false;
}

function createFixture(options: Readonly<{
  dispatch?: (handle: Parameters<LaunchCustodyService["dispatchPrepared"]>[0]) => Promise<unknown>;
  lookup?: (input: Parameters<LaunchCustodyService["lookup"]>[0]) => Promise<unknown>;
  fault?: (label: string) => void;
}> = {}): {
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
    schemaVersion: 1,
    projectId: "project_01",
    projectSessionId: "session_launch_01",
    runId: "run_launch_01",
    budgetRef: "budget_launch_01",
    scopes: {
      project: { scopeId: "scope_project_01", limits: { provider_calls: 10 } },
      projectSession: { scopeId: "scope_session_launch_01", limits: { provider_calls: 10 } },
      coordinationRun: { scopeId: "scope_run_launch_01", limits: { provider_calls: 10 } },
    },
    launchReservation: { amounts: { provider_calls: 1 } },
  };
  const resourcePlanText = canonicalJson(resourcePlan);
  writeFileSync(join(root, "launch-resources.json"), resourcePlanText, { mode: 0o600 });
  const resourcePlanRef = parseArtifactRef({ path: "launch-resources.json", digest: digest(resourcePlanText) }, "test.resourcePlanRef");

  const chairAuthority = {
    workspaceRoots: ["."],
    sourcePaths: ["."],
    artifactPaths: [".agent-run/AFAB-LAUNCH"],
    actions: ["fabric.v1.run-status.read"],
    deniedPaths: [],
    deniedActions: [],
    disclosure: { level: "forbidden" },
    expiresAt: "2027-01-02T00:00:00.000Z",
    budget: { provider_calls: 10 },
  };
  const normalisedAuthority = normaliseLaunchChairAuthority(chairAuthority, root);
  const authorityRef = digest(canonicalJson(normalisedAuthority));
  const launchPacket = {
    schemaVersion: 1,
    projectId: "project_01",
    projectSessionId: "session_launch_01",
    runId: "run_launch_01",
    chairAgentId: "chair_launch_01",
    projectRunDirectory: ".agent-run/AFAB-LAUNCH",
    topologyMode: "coordinated",
    budgetRef: "budget_launch_01",
    resourcePlanRef,
    chairAuthority,
    provider: {
      adapterId: "claude-agent-sdk",
      actionId: "provider_launch_01",
      contractDigest,
      inputSchemaId: contract.inputSchemaId,
      input: { model: "claude-opus-4-1" },
    },
  };
  const packetText = canonicalJson(launchPacket);
  writeFileSync(join(root, "launch-packet.json"), packetText, { mode: 0o600 });
  const launchPacketRef = parseArtifactRef({ path: "launch-packet.json", digest: digest(packetText) }, "test.launchPacketRef");

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

  let capabilityGeneration = 0;
  const service = new LaunchCustodyService({
    database,
    clock: () => now,
    ...(options.fault === undefined ? {} : { fault: options.fault }),
    randomCapability: () => `chair-secret-canary-${String(++capabilityGeneration).padStart(2, "0")}`,
    fabricSocketPath: "/private/agent-fabric.sock",
    adapterContracts: {
      inspect: async (adapterId) => {
        if (adapterId !== "claude-agent-sdk") throw new Error("unknown adapter");
        return contract;
      },
    },
    adapterEffects: {
      dispatch: options.dispatch ?? (async () => { throw new Error("not expected during preparation"); }),
      lookup: options.lookup ?? (async () => { throw new Error("not expected during preparation"); }),
    },
  });
  const intent: LaunchCustodyIntent = parseProjectSessionLaunchIntent({
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
  });
  return { database, root, service, intent };
}

async function prepareFixture(fixture: ReturnType<typeof createFixture>): Promise<{
  inspection: Awaited<ReturnType<LaunchCustodyService["inspect"]>>;
  handle: ReturnType<LaunchCustodyService["prepareInTransaction"]>;
}> {
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
  if (handle === undefined) throw new Error("launch handle was not prepared");
  return { inspection, handle };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("launch custody", () => {
  it("inspects closed artifacts and atomically prepares one hash-only chair launch", async () => {
    const fixture = createFixture();
    const { handle } = await prepareFixture(fixture);

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
    expect(fixture.service.providerActionRefForCommand("operator_01", "commit_launch_01")).toMatchObject({
      journalState: "prepared",
      journalRevision: 1,
      outcomeKind: null,
      outcomeDigest: null,
    });
    expect(databaseContains(fixture.database, "chair-secret-canary-01")).toBe(false);
  });

  it("routes operator preview and commit through custody instead of the generic effect port", async () => {
    const fixture = createFixture();
    const operatorStore = new OperatorStore({ database: fixture.database, clock: () => now });
    let genericEffects = 0;
    const actions = new OperatorActionStore({
      database: fixture.database,
      operatorStore,
      statePort: { read: async () => { throw new Error("generic state port must not inspect launch"); } },
      effectPort: {
        dispatch: async () => { genericEffects += 1; throw new Error("generic effect port must not launch"); },
        observe: async () => { genericEffects += 1; throw new Error("generic effect port must not launch"); },
      },
      launchCustody: fixture.service,
      clock: () => now,
    });
    const context = {
      operatorId: "operator_01",
      projectId: "project_01",
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
    } as never;
    const command = {
      credential: { capabilityId: "operator_cap_launch_01", token: "operator-secret" },
      commandId: "preview_launch_vertical_01",
      expectedRevision: 2,
      actor: "operator_01",
      provenance: {
        kind: "console-direct-input",
        clientId: "console_launch_vertical_01",
        inputEventId: "input_preview_launch_vertical_01",
      },
      evidenceRefs: [],
    };
    const preview = await actions.preview(context, {
      command,
      projectId: "project_01",
      intent: fixture.intent,
    } as unknown as OperatorActionPreviewRequest);
    const receipt = await actions.commit(context, {
      command: {
        ...command,
        commandId: "commit_launch_vertical_01",
        provenance: { ...command.provenance, inputEventId: "input_commit_launch_vertical_01" },
      },
      projectId: "project_01",
      previewId: preview.previewId,
      expectedPreviewRevision: preview.previewRevision,
      previewDigest: preview.previewDigest,
      expectedIntentDigest: preview.intentDigest,
      confirmation: { kind: "explicit", confirmationId: "confirm_launch_vertical_01" },
    } as unknown as OperatorActionCommitRequest);

    expect(genericEffects).toBe(0);
    expect(receipt.providerActionRef).toMatchObject({ journalState: "ambiguous", outcomeKind: "ambiguous" });
    expect(actions.status({
      credential: command.credential,
      projectId: "project_01",
      commandId: "commit_launch_vertical_01",
    } as never)).toMatchObject({
      status: "ambiguous",
      providerActionRef: { journalState: "ambiguous", outcomeKind: "ambiguous" },
    });
  });

  it("rolls back every launch-owned row when any preparation statement faults", async () => {
    const labels = [
      "launch:prepare:session",
      "launch:prepare:run",
      "launch:prepare:authority",
      "launch:prepare:chair",
      "launch:prepare:scopes",
      "launch:prepare:reservation",
      "launch:prepare:provider-action",
      "launch:prepare:memberships",
      "launch:prepare:custody",
    ];
    for (const target of labels) {
      const fixture = createFixture({
        fault: (label) => {
          if (label === target) throw new Error(`fault:${target}`);
        },
      });
      await expect(prepareFixture(fixture)).rejects.toThrow(`fault:${target}`);
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM runs").get(), target).toEqual({ count: 0 });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM provider_actions").get(), target).toEqual({ count: 0 });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM resource_reservations").get(), target).toEqual({ count: 0 });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM project_session_launch_custody").get(), target).toEqual({ count: 0 });
      expect(fixture.database.prepare(`
        SELECT state, revision FROM project_sessions WHERE project_session_id='session_launch_01'
      `).get(), target).toEqual({ state: "awaiting_launch", revision: 2 });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM operator_commands").get(), target).toEqual({ count: 0 });
    }
  });

  it("cleans a prepared crash without adapter I/O and preserves immutable custody", async () => {
    const fixture = createFixture();
    await prepareFixture(fixture);

    await expect(fixture.service.recover()).resolves.toEqual({
      preparedFailed: 1,
      lookedUp: 0,
      activated: 0,
      failed: 1,
      ambiguous: 0,
      recoveryRequired: 0,
    });
    expect(fixture.database.prepare(`
      SELECT state FROM project_sessions WHERE project_session_id='session_launch_01'
    `).get()).toEqual({ state: "launch_failed" });
    expect(fixture.database.prepare(`
      SELECT status, execution_count, effect_count FROM provider_actions
       WHERE adapter_id='claude-agent-sdk' AND action_id='provider_launch_01'
    `).get()).toEqual({ status: "terminal", execution_count: 0, effect_count: 0 });
    expect(fixture.database.prepare(`
      SELECT revoked_at FROM capabilities
       WHERE token_hash=(SELECT capability_hash FROM project_session_launch_custody)
    `).get()).toEqual({ revoked_at: now });
    expect(fixture.database.prepare(`
      SELECT status FROM run_chair_leases WHERE lease_id='chair:run_launch_01:1'
    `).get()).toEqual({ status: "revoked" });
    expect(fixture.database.prepare(`
      SELECT state FROM resource_reservations
       WHERE reservation_id=(SELECT reservation_id FROM project_session_launch_custody)
    `).get()).toEqual({ state: "released" });
    expect(() => fixture.database.prepare(`
      UPDATE project_session_launch_custody SET created_at=created_at+1
    `).run()).toThrow(/INVARIANT_launch_custody_immutable/u);
  });

  it("reconciles a complete dispatch return without waiting for restart", async () => {
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return",
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success",
        providerSessionRef: "claude-session-dispatch-01",
        providerSessionGeneration: 2,
        effectDigest: digest("provider-dispatch-effect"),
        resourceUsage: { provider_calls: 1 },
      },
    };
    const fixture = createFixture({ dispatch: async () => outcome });
    const { handle } = await prepareFixture(fixture);

    await expect(fixture.service.dispatchPrepared(handle)).resolves.toEqual(outcome);
    expect(fixture.database.prepare(`
      SELECT state FROM project_sessions WHERE project_session_id='session_launch_01'
    `).get()).toEqual({ state: "active" });
    expect(fixture.database.prepare(`
      SELECT status, execution_count, effect_count, provider_session_generation
        FROM provider_actions WHERE adapter_id='claude-agent-sdk' AND action_id='provider_launch_01'
    `).get()).toEqual({
      status: "terminal",
      execution_count: 1,
      effect_count: 1,
      provider_session_generation: 2,
    });
    expect(fixture.service.providerActionRefForCommand("operator_01", "commit_launch_01")).toMatchObject({
      journalState: "terminal",
      journalRevision: 3,
      outcomeKind: "terminal-success",
    });
  });

  it("persists dispatched before I/O and recovers by lookup-only terminal success", async () => {
    const fixture = createFixture();
    const { handle } = await prepareFixture(fixture);
    await expect(fixture.service.dispatchPrepared(handle)).resolves.toMatchObject({
      outcome: { kind: "ambiguous", reasonCode: "adapter-error" },
    });
    expect(fixture.database.prepare(`
      SELECT status, execution_count FROM provider_actions
       WHERE adapter_id='claude-agent-sdk' AND action_id='provider_launch_01'
    `).get()).toEqual({ status: "ambiguous", execution_count: 1 });

    const lookupOutcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "lookup",
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success",
        providerSessionRef: "claude-session-launch-01",
        providerSessionGeneration: 1,
        effectDigest: digest("provider-launch-effect"),
        resourceUsage: { provider_calls: 1 },
      },
    };
    const restarted = new LaunchCustodyService({
      database: fixture.database,
      clock: () => now,
      randomCapability: () => "unused-restart-secret",
      fabricSocketPath: "/private/agent-fabric.sock",
      adapterContracts: { inspect: async () => contract },
      adapterEffects: {
        dispatch: async () => { throw new Error("restart must not dispatch"); },
        lookup: async () => lookupOutcome,
      },
    });
    await expect(restarted.recover()).resolves.toEqual({
      preparedFailed: 0,
      lookedUp: 1,
      activated: 1,
      failed: 0,
      ambiguous: 0,
      recoveryRequired: 0,
    });
    expect(fixture.database.prepare(`
      SELECT state FROM project_sessions WHERE project_session_id='session_launch_01'
    `).get()).toEqual({ state: "active" });
    expect(fixture.database.prepare(`
      SELECT provider_session_ref FROM agents WHERE run_id='run_launch_01' AND agent_id='chair_launch_01'
    `).get()).toEqual({ provider_session_ref: "claude-session-launch-01" });
    expect(fixture.database.prepare(`
      SELECT state FROM resource_reservations
       WHERE reservation_id=(SELECT reservation_id FROM project_session_launch_custody)
    `).get()).toEqual({ state: "reconciled" });
    expect(fixture.database.prepare(`
      SELECT used, reserved FROM resource_dimensions WHERE scope_id='scope_run_launch_01' AND unit_key='provider_calls'
    `).get()).toEqual({ used: 1, reserved: 0 });
  });

  it("marks unknown launch usage at every ancestor without restoring unproved capacity", async () => {
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return",
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success",
        providerSessionRef: "claude-session-unknown-01",
        providerSessionGeneration: 1,
        effectDigest: digest("provider-unknown-effect"),
        resourceUsage: { provider_calls: "unknown" },
      },
    };
    const fixture = createFixture({ dispatch: async () => outcome });
    const { handle } = await prepareFixture(fixture);
    await fixture.service.dispatchPrepared(handle);

    expect(fixture.database.prepare(`
      SELECT COUNT(*) AS count FROM resource_dimensions
       WHERE unit_key='provider_calls' AND usage_unknown=1 AND reserved=0
    `).get()).toEqual({ count: 3 });
    expect(fixture.database.prepare(`
      SELECT state FROM resource_reservations
       WHERE reservation_id=(SELECT reservation_id FROM project_session_launch_custody)
    `).get()).toEqual({ state: "reconciled" });
  });

  it("enters recovery-required on exact launch overrun without truncating the reservation", async () => {
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return",
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success",
        providerSessionRef: "claude-session-overrun-01",
        providerSessionGeneration: 1,
        effectDigest: digest("provider-overrun-effect"),
        resourceUsage: { provider_calls: 2 },
      },
    };
    const fixture = createFixture({ dispatch: async () => outcome });
    const { handle } = await prepareFixture(fixture);
    await fixture.service.dispatchPrepared(handle);

    expect(fixture.database.prepare(`
      SELECT state FROM project_sessions WHERE project_session_id='session_launch_01'
    `).get()).toEqual({ state: "recovery_required" });
    expect(fixture.database.prepare(`
      SELECT state FROM resource_reservations
       WHERE reservation_id=(SELECT reservation_id FROM project_session_launch_custody)
    `).get()).toEqual({ state: "reserved" });
    expect(fixture.database.prepare(`
      SELECT reserved, used FROM resource_dimensions
       WHERE scope_id='scope_run_launch_01' AND unit_key='provider_calls'
    `).get()).toEqual({ reserved: 1, used: 0 });
  });

  it("accepts only a registered, digest-valid no-effect proof and cleans the failed attempt", async () => {
    const proof = { effectCount: 0 };
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return",
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-no-effect",
        failureCode: "provider-rejected",
        noEffectProof: {
          schemaId: "provider-no-effect.v1",
          proof,
          digest: digest(canonicalJson(proof)),
        },
      },
    };
    const fixture = createFixture({ dispatch: async () => outcome });
    const { handle } = await prepareFixture(fixture);
    await expect(fixture.service.dispatchPrepared(handle)).resolves.toEqual(outcome);
    expect(fixture.database.prepare(`
      SELECT state FROM project_sessions WHERE project_session_id='session_launch_01'
    `).get()).toEqual({ state: "launch_failed" });
    expect(fixture.database.prepare(`
      SELECT state FROM resource_reservations
       WHERE reservation_id=(SELECT reservation_id FROM project_session_launch_custody)
    `).get()).toEqual({ state: "released" });
  });

  it("normalises incomplete acceptance to ambiguity and never replays the one-use handoff", async () => {
    const fixture = createFixture({ dispatch: async () => ({ status: "accepted" }) });
    const { handle } = await prepareFixture(fixture);
    await expect(fixture.service.dispatchPrepared(handle)).resolves.toMatchObject({
      outcome: { kind: "ambiguous", reasonCode: "malformed" },
    });
    expect(fixture.database.prepare(`
      SELECT state FROM project_sessions WHERE project_session_id='session_launch_01'
    `).get()).toEqual({ state: "launch_ambiguous" });
    expect(fixture.database.prepare(`
      SELECT state FROM resource_reservations
       WHERE reservation_id=(SELECT reservation_id FROM project_session_launch_custody)
    `).get()).toEqual({ state: "reserved" });
    await expect(fixture.service.dispatchPrepared(handle)).rejects.toMatchObject({ code: "DEDUPE_CONFLICT" });
  });

  it("retries only the exact proved failure with a fresh packet, run and provider action", async () => {
    const fixture = createFixture();
    await prepareFixture(fixture);
    await fixture.service.recover();

    const plan = JSON.parse(readFileSync(join(fixture.root, "launch-resources.json"), "utf8")) as Record<string, unknown>;
    plan.runId = "run_launch_02";
    const scopes = plan.scopes as Record<string, Record<string, unknown>>;
    if (scopes.coordinationRun === undefined) throw new Error("retry plan has no coordination run scope");
    scopes.coordinationRun.scopeId = "scope_run_launch_02";
    const planText = canonicalJson(plan);
    writeFileSync(join(fixture.root, "launch-resources-02.json"), planText, { mode: 0o600 });
    const planRef = parseArtifactRef({ path: "launch-resources-02.json", digest: digest(planText) }, "test.retryPlanRef");

    const packet = JSON.parse(readFileSync(join(fixture.root, "launch-packet.json"), "utf8")) as Record<string, unknown>;
    packet.runId = "run_launch_02";
    packet.chairAgentId = "chair_launch_02";
    packet.projectRunDirectory = ".agent-run/AFAB-LAUNCH-RETRY";
    packet.resourcePlanRef = planRef;
    const provider = packet.provider as Record<string, unknown>;
    provider.actionId = "provider_launch_02";
    const packetText = canonicalJson(packet);
    writeFileSync(join(fixture.root, "launch-packet-02.json"), packetText, { mode: 0o600 });
    const packetRef = parseArtifactRef({ path: "launch-packet-02.json", digest: digest(packetText) }, "test.retryPacketRef");
    const retryIntent = parseProjectSessionLaunchIntent({
      ...fixture.intent,
      expectedSessionRevision: 4,
      launchPacketRef: packetRef,
      resourcePlanRef: planRef,
      providerActionId: "provider_launch_02",
      resourceStateDigest: computeLaunchResourceStateDigest(fixture.database, "project_01", "session_launch_01"),
      retryOf: {
        providerAdapterId: "claude-agent-sdk",
        providerActionId: "provider_launch_01",
      },
    });
    await expect(fixture.service.inspect(parseProjectSessionLaunchIntent({
      ...retryIntent,
      retryOf: {
        providerAdapterId: "claude-agent-sdk",
        providerActionId: "another_failed_action",
      },
    }))).rejects.toMatchObject({ code: "CONFLICT" });

    const inspection = await fixture.service.inspect(retryIntent);
    fixture.database.transaction(() => {
      fixture.database.prepare(`
        INSERT INTO operator_commands(
          operator_id, command_id, capability_id, project_id, project_session_id,
          operation, expected_revision, payload_hash, provenance_json, before_json,
          after_json, evidence_json, result_json, status, created_at
        ) VALUES (
          'operator_01', 'commit_launch_02', 'operator_cap_launch_01', 'project_01',
          'session_launch_01', 'launch', 4, 'payload-hash-02', '{}', '{}', '{}', '[]', '{}',
          'committed', ${now}
        )
      `).run();
      fixture.service.prepareInTransaction({
        inspection,
        operatorId: "operator_01",
        operatorCommandId: "commit_launch_02",
      });
    })();
    expect(fixture.database.prepare(`
      SELECT state, revision, launch_packet_path FROM project_sessions
       WHERE project_session_id='session_launch_01'
    `).get()).toEqual({ state: "launching", revision: 5, launch_packet_path: "launch-packet-02.json" });
    expect(fixture.database.prepare(`
      SELECT COUNT(*) AS count FROM project_session_launch_custody
    `).get()).toEqual({ count: 2 });
    expect(fixture.database.prepare(`
      SELECT retry_of_provider_action_id FROM project_session_launch_custody
       WHERE custody_attempt_generation=2
    `).get()).toEqual({ retry_of_provider_action_id: "provider_launch_01" });
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
      launchPacketRef: parseArtifactRef({ path: "linked-packet.json", digest: digest("{}") }, "test.linkedPacketRef"),
    })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM runs").get()).toEqual({ count: 0 });
  });
});

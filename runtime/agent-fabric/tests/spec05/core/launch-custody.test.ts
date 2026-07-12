import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import {
  parseArtifactRef,
  parseProjectSessionLaunchIntent,
  parseSha256Digest,
  type ChairBridgeRecoveryIntent,
  type OperatorId,
  type OperatorActionCommitRequest,
  type OperatorActionPreviewRequest,
  type ProjectId,
  type ProjectSessionTransitionRequest,
  type Sha256Digest,
} from "@local/agent-fabric-protocol";

import { applyMigrations } from "../../../src/core/migrations.ts";
import { openFabric } from "../../../src/index.ts";
import { OperatorActionStore } from "../../../src/operator/action-store.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
import {
  chairLaunchAttestationDigest,
  chairLaunchChallengeDigest,
} from "../../../src/adapters/providers/types.ts";
import {
  preflightProviderBridgeCustody,
  ProviderBridgeCustodyPreflightError,
} from "../../../src/persistence/provider-bridge-custody-preflight.ts";
import {
  preflightLaunchedChairBridgeLoss,
  LaunchedChairBridgeLossPreflightError,
} from "../../../src/persistence/launched-chair-bridge-loss-preflight.ts";
import {
  LaunchCustodyService,
  computeLaunchResourceStateDigest,
  normaliseLaunchChairAuthority,
  parseLaunchAdapterContract,
  type LaunchCustodyIntent,
} from "../../../src/project-session/launch-custody.ts";
import { ProjectSessionStore } from "../../../src/project-session/store.ts";
import { canonicalJson, sha256 } from "../../../src/project-session/store-support.ts";

const databases: Database.Database[] = [];
const directories: string[] = [];
const now = Date.parse("2027-01-01T00:00:00Z");
const digest = (value: string): Sha256Digest => parseSha256Digest(`sha256:${sha256(value)}`, "test.digest");
const attestationChallenge = "ab".repeat(32);
const attestationChallengeDigest = parseSha256Digest(
  `sha256:${createHash("sha256").update(Buffer.from(attestationChallenge, "hex")).digest("hex")}`,
  "test.attestationChallengeDigest",
);
const trustDigest = digest("trusted-project-record");
const contract = {
  schemaVersion: 1,
  method: "launch_chair",
  oneUse: true,
  secretTransport: "private-environment",
  environment: {
    capability: "AGENT_FABRIC_CAPABILITY",
    socketPath: "AGENT_FABRIC_SOCKET_PATH",
    attestationChallenge: "AGENT_FABRIC_ATTESTATION_CHALLENGE",
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
  attestation: {
    method: "provider-session-random-challenge-v1",
    bridgeContract: "agent-fabric-session-bridge-v1",
    origin: "provider-session-tool-call",
    oneUse: true,
    bridgeLifetime: "provider-session",
    digestAlgorithm: "sha256",
    nativeAttribution: "claude-sdk-assistant-request-tool-use-v1",
  },
} as const;
const contractDigest = digest(canonicalJson(contract));
const recoveryAdapter = fileURLToPath(new URL("../../support/launch-custody-recovery-adapter.ts", import.meta.url));

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
  persistent?: boolean;
  retainedChairBridge?: boolean;
  recoverChair?: (handle: Parameters<LaunchCustodyService["dispatchPreparedChairRecovery"]>[0]) => Promise<unknown>;
  lookupChairRecovery?: (input: { adapterId: string; actionId: string }) => Promise<unknown>;
  promoteSuccessor?: (input: Record<string, unknown>) => Promise<boolean>;
  lookupSuccessor?: (input: Record<string, unknown>) => Promise<"child" | "chair" | "missing">;
}> = {}): {
  database: Database.Database;
  databasePath: string;
  root: string;
  service: LaunchCustodyService;
  intent: LaunchCustodyIntent;
} {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "afab-launch-custody-")));
  directories.push(root);
  const databasePath = options.persistent === true ? join(root, "fabric.sqlite3") : ":memory:";
  const database = new Database(databasePath);
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
    randomAttestationChallenge: () => attestationChallenge,
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
      hasRetainedChairBridge: () => options.retainedChairBridge ?? true,
      ...(options.recoverChair === undefined ? {} : { recoverChair: options.recoverChair }),
      ...(options.lookupChairRecovery === undefined
        ? {}
        : { lookupChairRecovery: options.lookupChairRecovery }),
      ...(options.lookupSuccessor === undefined
        ? {}
        : { lookupRetainedSuccessorBridge: options.lookupSuccessor }),
      ...(options.promoteSuccessor === undefined
        ? {}
        : { promoteRetainedSuccessorBridge: options.promoteSuccessor }),
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
  return { database, databasePath, root, service, intent };
}

function closeTrackedDatabase(database: Database.Database): void {
  const index = databases.indexOf(database);
  if (index >= 0) databases.splice(index, 1);
  database.close();
}

function probeRecoveryCapabilityIdentityGuards(database: Database.Database): {
  identityUpdateBlocked: boolean;
  deleteBlocked: boolean;
  mutableMetadataAllowed: boolean;
  canonicalRevocationAllowed: boolean;
} {
  const recovery = database.prepare(`
    SELECT new_capability_hash FROM chair_bridge_recovery_custody WHERE path='rebind'
  `).get() as { new_capability_hash: string };
  let identityUpdateBlocked = false;
  database.exec("SAVEPOINT probe_recovery_identity_update");
  try {
    database.prepare(`
      UPDATE capabilities SET principal_generation=principal_generation+1 WHERE token_hash=?
    `).run(recovery.new_capability_hash);
  } catch (error: unknown) {
    identityUpdateBlocked = error instanceof Error && /INVARIANT_chair_bridge_loss_freezes_grants/u.test(error.message);
  } finally {
    database.exec("ROLLBACK TO probe_recovery_identity_update");
    database.exec("RELEASE probe_recovery_identity_update");
  }
  let deleteBlocked = false;
  database.exec("SAVEPOINT probe_recovery_identity_delete");
  try {
    database.prepare(`DELETE FROM capabilities WHERE token_hash=?`).run(recovery.new_capability_hash);
  } catch (error: unknown) {
    deleteBlocked = error instanceof Error && /INVARIANT_chair_bridge_loss_freezes_grants/u.test(error.message);
  } finally {
    database.exec("ROLLBACK TO probe_recovery_identity_delete");
    database.exec("RELEASE probe_recovery_identity_delete");
  }
  let mutableMetadataAllowed = true;
  database.exec("SAVEPOINT probe_recovery_mutable_metadata");
  try {
    database.prepare(`
      UPDATE capabilities SET expires_at=expires_at+1, revoked_at=COALESCE(revoked_at, ?)
       WHERE token_hash=?
    `).run(now, recovery.new_capability_hash);
  } catch {
    mutableMetadataAllowed = false;
  } finally {
    database.exec("ROLLBACK TO probe_recovery_mutable_metadata");
    database.exec("RELEASE probe_recovery_mutable_metadata");
  }
  let canonicalRevocationAllowed = true;
  database.exec("SAVEPOINT probe_recovery_canonical_revocation");
  try {
    const result = database.prepare(`
      UPDATE capabilities SET revoked_at=?, principal_generation=principal_generation+1
       WHERE token_hash=? AND revoked_at IS NULL
    `).run(now, recovery.new_capability_hash);
    canonicalRevocationAllowed = result.changes === 1;
  } catch {
    canonicalRevocationAllowed = false;
  } finally {
    database.exec("ROLLBACK TO probe_recovery_canonical_revocation");
    database.exec("RELEASE probe_recovery_canonical_revocation");
  }
  return { identityUpdateBlocked, deleteBlocked, mutableMetadataAllowed, canonicalRevocationAllowed };
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
  it.each([
    ["revoked capability", (database: Database.Database) => database.prepare(`
      UPDATE capabilities SET revoked_at=?
       WHERE token_hash=(SELECT capability_hash FROM project_session_launch_custody)
    `).run(now)],
    ["missing provider state", (database: Database.Database) => database.prepare(`
      DELETE FROM provider_state WHERE run_id='run_launch_01' AND agent_id='chair_launch_01'
    `).run()],
    ["malformed terminal result", (database: Database.Database) => database.prepare(`
      UPDATE provider_actions SET result_json='{}'
       WHERE adapter_id='claude-agent-sdk' AND action_id='provider_launch_01'
    `).run()],
  ] as const)("fails migration-9 preflight for active launch custody with %s", async (_case, corrupt) => {
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return" as const,
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success" as const,
        providerSessionRef: "migration-preflight-session",
        providerSessionGeneration: 2,
        effectDigest: digest("migration-preflight-effect"),
        resourceUsage: { provider_calls: 1 },
      },
    };
    const fixture = createFixture({ dispatch: async () => outcome, retainedChairBridge: true });
    const { handle } = await prepareFixture(fixture);
    await fixture.service.dispatchPrepared(handle);
    expect(() => preflightLaunchedChairBridgeLoss(fixture.database)).not.toThrow();
    corrupt(fixture.database);
    expect(() => preflightLaunchedChairBridgeLoss(fixture.database)).toThrowError(
      expect.objectContaining<Partial<LaunchedChairBridgeLossPreflightError>>({
        code: "LAUNCHED_CHAIR_BRIDGE_LOSS_MIGRATION_PREFLIGHT_FAILED",
      }),
    );
  });

  it("runs migration 9 only after total preflight and backfills the exact active chair", async () => {
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return" as const,
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success" as const,
        providerSessionRef: "migration-backfill-session",
        providerSessionGeneration: 4,
        effectDigest: digest("migration-backfill-effect"),
        resourceUsage: { provider_calls: 1 },
      },
    };
    const fixture = createFixture({ dispatch: async () => outcome, retainedChairBridge: true });
    const { handle } = await prepareFixture(fixture);
    await fixture.service.dispatchPrepared(handle);
    const triggerRows = fixture.database.prepare(`
      SELECT name FROM sqlite_master
       WHERE type='trigger' AND (
         name GLOB 'chair_bridge_*' OR name GLOB 'launched_chair_bridge_*' OR
         name GLOB 'global_revision_chair_bridge_*' OR
         name GLOB 'global_revision_launched_chair_bridge_*'
       )
    `).all() as Array<{ name: string }>;
    for (const { name } of triggerRows) {
      fixture.database.exec(`DROP TRIGGER "${name.replaceAll('"', '""')}"`);
    }
    fixture.database.exec(`
      DROP TABLE chair_bridge_loss_resolutions;
      DROP TABLE chair_bridge_recovery_custody;
      DROP TABLE chair_bridge_losses;
      DROP TABLE launched_chair_bridge_state;
    `);
    const migrationNine = readFileSync(
      new URL("../../../migrations/0009-launched-chair-bridge-loss.sql", import.meta.url),
      "utf8",
    ).replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*ON;\s*/iu, "");
    fixture.database.transaction(() => {
      preflightLaunchedChairBridgeLoss(fixture.database);
       fixture.database.exec(migrationNine);
     })();
    expect(fixture.database.prepare(`
      SELECT chair_agent_id, provider_adapter_id, provider_action_id,
             provider_contract_digest, provider_session_ref,
             provider_session_generation, principal_generation,
             bridge_generation, activation_evidence_digest, state
        FROM launched_chair_bridge_state
    `).get()).toEqual({
      chair_agent_id: "chair_launch_01",
      provider_adapter_id: "claude-agent-sdk",
      provider_action_id: "provider_launch_01",
      provider_contract_digest: contractDigest,
      provider_session_ref: "migration-backfill-session",
      provider_session_generation: 4,
      principal_generation: 1,
      bridge_generation: 1,
      activation_evidence_digest: digest("migration-backfill-effect"),
      state: "active",
    });
  });

  it.each(["dispatched", "accepted", "ambiguous"] as const)(
    "rejects a pre-challenge migration while legacy launch custody is %s",
    async (status) => {
      const fixture = createFixture();
      await prepareFixture(fixture);
      expect(() => preflightProviderBridgeCustody(fixture.database)).not.toThrow();
      fixture.database.prepare("UPDATE provider_actions SET status=?").run(status);
      expect(() => preflightProviderBridgeCustody(fixture.database)).toThrowError(
        expect.objectContaining<Partial<ProviderBridgeCustodyPreflightError>>({
          code: "PROVIDER_BRIDGE_CUSTODY_MIGRATION_PREFLIGHT_FAILED",
        }),
      );
    },
  );

  it("binds the exact provider-session attestation contract into launch custody", () => {
    expect(parseLaunchAdapterContract(contract)).toEqual(contract);
    expect(() => parseLaunchAdapterContract({
      ...contract,
      attestation: { ...contract.attestation, method: "wrapper-mailbox-probe-v1" },
    })).toThrow(/attestation/u);
    expect(() => parseLaunchAdapterContract({
      ...contract,
      attestation: { ...contract.attestation, wrapperMayAttest: true },
    })).toThrow(/unknown field/u);
  });

  it("inspects closed artifacts and atomically prepares one hash-only chair launch", async () => {
    const fixture = createFixture();
    const { handle } = await prepareFixture(fixture);

    expect(handle).toMatchObject({
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      capability: "chair-secret-canary-01",
      socketPath: "/private/agent-fabric.sock",
      attestationChallenge,
      attestationChallengeDigest,
      expectedPrincipal: {
        agentId: "chair_launch_01",
        projectSessionId: "session_launch_01",
        runId: "run_launch_01",
        principalGeneration: 1,
      },
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
       WHERE attestation_challenge_digest=?
    `).get(attestationChallengeDigest)).toEqual({ count: 1 });
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
    expect(databaseContains(fixture.database, attestationChallenge)).toBe(false);
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
    expect(fixture.database.prepare(`
      SELECT state, bridge_generation, principal_generation, provider_session_generation
        FROM launched_chair_bridge_state WHERE coordination_run_id='run_launch_01'
    `).get()).toEqual({
      state: "active",
      bridge_generation: 1,
      principal_generation: 1,
      provider_session_generation: 2,
    });
  });

  it("persists and fences one exact live chair-bridge loss idempotently", async () => {
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return",
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success",
        providerSessionRef: "claude-chair-live-loss-01",
        providerSessionGeneration: 3,
        effectDigest: digest("provider-live-loss-effect"),
        resourceUsage: { provider_calls: 1 },
      },
    };
    const fixture = createFixture({ dispatch: async () => outcome, retainedChairBridge: true });
    const { handle } = await prepareFixture(fixture);
    await fixture.service.dispatchPrepared(handle);
    const loss = {
      projectSessionId: "session_launch_01",
      runId: "run_launch_01",
      agentId: "chair_launch_01",
      principalGeneration: 1,
      adapterId: "claude-agent-sdk",
      actionId: "provider_launch_01",
      providerSessionRef: "claude-chair-live-loss-01",
      providerSessionGeneration: 3,
      bridgeGeneration: 1,
      reason: "retained adapter socket closed",
    };

    expect(() => fixture.service.observeChairBridgeLoss({
      ...loss,
      bridgeGeneration: 2,
    })).toThrow(/does not match retained custody/u);
    expect(fixture.database.prepare(`
      SELECT state FROM launched_chair_bridge_state WHERE coordination_run_id='run_launch_01'
    `).get()).toEqual({ state: "active" });
    expect(fixture.database.prepare(`
      SELECT COUNT(*) AS count FROM chair_bridge_losses WHERE coordination_run_id='run_launch_01'
    `).get()).toEqual({ count: 0 });
    expect(fixture.service.observeChairBridgeLoss(loss)).toBe(true);
    expect(fixture.service.observeChairBridgeLoss(loss)).toBe(false);
    expect(fixture.database.prepare(`
      SELECT COUNT(*) AS count FROM chair_bridge_losses WHERE coordination_run_id='run_launch_01'
    `).get()).toEqual({ count: 1 });
    expect(fixture.database.prepare(`
      SELECT state, bridge_generation, revision FROM launched_chair_bridge_state
       WHERE coordination_run_id='run_launch_01'
    `).get()).toEqual({ state: "lost", bridge_generation: 1, revision: 2 });
    expect(fixture.database.prepare(`
      SELECT state FROM project_sessions WHERE project_session_id='session_launch_01'
    `).get()).toEqual({ state: "recovery_required" });
    expect(fixture.database.prepare(`
      SELECT lifecycle_state FROM runs WHERE run_id='run_launch_01'
    `).get()).toEqual({ lifecycle_state: "recovery_required" });
    expect(fixture.database.prepare(`
      SELECT status FROM run_chair_leases WHERE run_id='run_launch_01'
    `).get()).toEqual({ status: "frozen" });
    expect(fixture.database.prepare(`
      SELECT revoked_at FROM capabilities
       WHERE token_hash=(SELECT capability_hash FROM project_session_launch_custody)
    `).get()).toEqual({ revoked_at: now });
    expect(fixture.database.prepare(`
      SELECT reason FROM delivery_freezes WHERE run_id='run_launch_01' AND agent_id='chair_launch_01'
    `).get()).toMatchObject({ reason: expect.stringMatching(/^chair-bridge-loss:/u) });
    fixture.database.prepare(`
      INSERT INTO operator_capabilities(
        capability_id, token_hash, operator_id, project_id, project_session_id,
        project_authority_generation, session_generation, principal_generation,
        kind, operations_json, issued_at, expires_at
      ) VALUES (
        'operator_cap_recovery_transition', ?, 'operator_01', 'project_01',
        'session_launch_01', 1, 1, 1, 'session', '["read","decide"]', ?, ?
      )
    `).run(sha256("recovery-transition-secret"), now - 1, now + 60_000);
    const before = fixture.database.prepare(`
      SELECT
        (SELECT state FROM project_sessions WHERE project_session_id='session_launch_01') AS session_state,
        (SELECT revision FROM project_sessions WHERE project_session_id='session_launch_01') AS session_revision,
        (SELECT lifecycle_state FROM runs WHERE run_id='run_launch_01') AS run_state,
        (SELECT revision FROM runs WHERE run_id='run_launch_01') AS run_revision,
        (SELECT status FROM run_chair_leases WHERE run_id='run_launch_01') AS lease_status,
        (SELECT state FROM launched_chair_bridge_state WHERE coordination_run_id='run_launch_01') AS bridge_state,
        (SELECT COUNT(*) FROM chair_bridge_losses WHERE coordination_run_id='run_launch_01') AS losses,
        (SELECT COUNT(*) FROM chair_bridge_recovery_custody recovery
          JOIN chair_bridge_losses loss ON loss.loss_id=recovery.loss_id
          WHERE loss.coordination_run_id='run_launch_01') AS recoveries,
        (SELECT COUNT(*) FROM operator_commands WHERE project_session_id='session_launch_01') AS commands
    `).get();
    const sessionRevision = (before as { session_revision: number }).session_revision;
    const sessions = new ProjectSessionStore({
      database: fixture.database,
      operatorStore: new OperatorStore({ database: fixture.database, clock: () => now }),
      clock: () => now,
    });
    for (const target of ["reconciling", "quarantined"] as const) {
      expect(() => sessions.transitionProjectSession({
        operatorId: "operator_01" as OperatorId,
        projectId: "project_01" as ProjectId,
        projectAuthorityGeneration: 1,
        principalGeneration: 1,
      }, {
        command: {
          credential: { capabilityId: "operator_cap_recovery_transition", token: "recovery-transition-secret" },
          commandId: `forbidden_lost_bridge_${target}`,
          expectedRevision: sessionRevision,
          actor: "operator_01",
          provenance: {
            kind: "console-direct-input",
            clientId: "console_recovery",
            inputEventId: `input_${target}`,
          },
          evidenceRefs: [],
        },
        projectSessionId: "session_launch_01",
        expectedGeneration: 1,
        transition: { to: target, reason: "generic transition must not steal recovery custody" },
      } as unknown as ProjectSessionTransitionRequest)).toThrowError(
        expect.objectContaining({ code: "RECOVERY_REQUIRED" }),
      );
      expect(fixture.database.prepare(`
        SELECT
          (SELECT state FROM project_sessions WHERE project_session_id='session_launch_01') AS session_state,
          (SELECT revision FROM project_sessions WHERE project_session_id='session_launch_01') AS session_revision,
          (SELECT lifecycle_state FROM runs WHERE run_id='run_launch_01') AS run_state,
          (SELECT revision FROM runs WHERE run_id='run_launch_01') AS run_revision,
          (SELECT status FROM run_chair_leases WHERE run_id='run_launch_01') AS lease_status,
          (SELECT state FROM launched_chair_bridge_state WHERE coordination_run_id='run_launch_01') AS bridge_state,
          (SELECT COUNT(*) FROM chair_bridge_losses WHERE coordination_run_id='run_launch_01') AS losses,
          (SELECT COUNT(*) FROM chair_bridge_recovery_custody recovery
            JOIN chair_bridge_losses loss ON loss.loss_id=recovery.loss_id
            WHERE loss.coordination_run_id='run_launch_01') AS recoveries,
          (SELECT COUNT(*) FROM operator_commands WHERE project_session_id='session_launch_01') AS commands
      `).get()).toEqual(before);
    }
    expect(() => fixture.database.prepare(`
      INSERT INTO capabilities(token_hash, run_id, agent_id, principal_generation, expires_at)
      VALUES ('forbidden-after-chair-loss', 'run_launch_01', 'chair_launch_01', 2, ${now + 60_000})
    `).run()).toThrow(/INVARIANT_chair_bridge_loss_freezes_grants/u);
    expect(() => fixture.database.prepare(`
      INSERT INTO authorities(authority_id, run_id, parent_authority_id, authority_json, authority_hash, created_at)
      VALUES ('forbidden-authority-after-chair-loss', 'run_launch_01', NULL, '{}', 'hash', ${now})
    `).run()).toThrow(/INVARIANT_chair_bridge_loss_freezes_grants/u);
  });

  it("terminalises an exact lost chair through versioned abandon recovery custody", async () => {
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return" as const,
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success" as const,
        providerSessionRef: "claude-chair-abandon-01",
        providerSessionGeneration: 3,
        effectDigest: digest("provider-abandon-effect"),
        resourceUsage: { provider_calls: 1 },
      },
    };
    const fixture = createFixture({ dispatch: async () => outcome, retainedChairBridge: true });
    const { handle } = await prepareFixture(fixture);
    await fixture.service.dispatchPrepared(handle);
    fixture.service.observeChairBridgeLoss({
      projectSessionId: "session_launch_01",
      runId: "run_launch_01",
      agentId: "chair_launch_01",
      principalGeneration: 1,
      adapterId: "claude-agent-sdk",
      actionId: "provider_launch_01",
      providerSessionRef: "claude-chair-abandon-01",
      providerSessionGeneration: 3,
      bridgeGeneration: 1,
      reason: "provider bridge closed",
    });
    const loss = fixture.database.prepare(`SELECT * FROM chair_bridge_losses`).get() as Record<string, unknown>;
    const bridge = fixture.database.prepare(`SELECT * FROM launched_chair_bridge_state`).get() as Record<string, unknown>;
    const session = fixture.database.prepare(`SELECT revision, generation FROM project_sessions`).get() as Record<string, number>;
    const run = fixture.database.prepare(`SELECT revision, chair_generation FROM runs`).get() as Record<string, number>;
    const intent: ChairBridgeRecoveryIntent = {
      kind: "chair-bridge-recovery",
      schemaVersion: 1,
      path: "abandon",
      projectSessionId: "session_launch_01" as never,
      coordinationRunId: "run_launch_01" as never,
      lossId: String(loss.loss_id),
      recoveryManifestDigest: String(loss.recovery_manifest_digest) as Sha256Digest,
      expectedSessionRevision: Number(session.revision),
      expectedSessionGeneration: Number(session.generation),
      expectedRunRevision: Number(run.revision),
      expectedChairGeneration: Number(run.chair_generation),
      expectedPrincipalGeneration: Number(loss.principal_generation),
      expectedBridgeRevision: Number(bridge.revision),
      expectedLostBridgeGeneration: Number(loss.lost_bridge_generation),
      expectedProviderSessionGeneration: Number(loss.provider_session_generation),
      providerAdapterId: "claude-agent-sdk",
      providerContractDigest: String(loss.provider_contract_digest) as Sha256Digest,
      reason: "operator accepted terminal provider loss",
    };
    fixture.database.prepare(`
      INSERT INTO operator_capabilities(
        capability_id, token_hash, operator_id, project_id, project_session_id,
        project_authority_generation, session_generation, principal_generation,
        kind, operations_json, issued_at, expires_at, handoff_digest,
        old_chair_generation, expected_run_id, expected_run_revision,
        expected_session_revision, cas_target_revision
      ) VALUES (
        'operator_cap_recovery_01', ?, 'operator_01', 'project_01', 'session_launch_01',
        1, ?, 1, 'takeover', '["takeover","read"]', ?, ?, ?, ?,
        'run_launch_01', ?, ?, ?
      )
    `).run(
      sha256("operator-recovery-secret"),
      intent.expectedSessionGeneration,
      now - 1,
      now + 60_000,
      intent.recoveryManifestDigest,
      intent.expectedChairGeneration,
      intent.expectedRunRevision,
      intent.expectedSessionRevision,
      intent.expectedBridgeRevision,
    );
    const operatorStore = new OperatorStore({ database: fixture.database, clock: () => now });
    let genericEffects = 0;
    const actions = new OperatorActionStore({
      database: fixture.database,
      operatorStore,
      statePort: { read: async () => { throw new Error("generic state must not inspect recovery"); } },
      effectPort: {
        dispatch: async () => { genericEffects += 1; throw new Error("generic effect must not recover chair"); },
        observe: async () => { genericEffects += 1; throw new Error("generic effect must not recover chair"); },
      },
      chairRecoveryCustody: fixture.service,
      clock: () => now,
    });
    const context = {
      operatorId: "operator_01",
      projectId: "project_01",
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
    } as never;
    const previewCommand = {
      credential: { capabilityId: "operator_cap_recovery_01", token: "operator-recovery-secret" },
      commandId: "preview_recovery_abandon_01",
      expectedRevision: intent.expectedBridgeRevision,
      actor: "operator_01",
      provenance: {
        kind: "console-direct-input",
        clientId: "console_recovery_01",
        inputEventId: "input_recovery_preview_01",
      },
      evidenceRefs: [],
    };
    const preview = await actions.preview(context, {
      command: previewCommand,
      projectId: "project_01",
      intent,
    } as unknown as OperatorActionPreviewRequest);
    const receipt = await actions.commit(context, {
      command: {
        ...previewCommand,
        commandId: "recovery_abandon_01",
        provenance: { ...previewCommand.provenance, inputEventId: "input_recovery_commit_01" },
      },
      projectId: "project_01",
      previewId: preview.previewId,
      expectedPreviewRevision: preview.previewRevision,
      previewDigest: preview.previewDigest,
      expectedIntentDigest: preview.intentDigest,
      confirmation: { kind: "explicit", confirmationId: "confirm_recovery_abandon_01" },
    } as unknown as OperatorActionCommitRequest);
    expect(receipt.afterStateDigest).not.toEqual(receipt.beforeStateDigest);
    expect(genericEffects).toBe(0);
    expect(actions.status({
      credential: previewCommand.credential,
      projectId: "project_01",
      commandId: "recovery_abandon_01",
    } as never)).toMatchObject({ status: "committed" });
    const reconcileRequest = {
      command: {
        ...previewCommand,
        commandId: "reconcile_recovery_abandon_01",
        provenance: { ...previewCommand.provenance, inputEventId: "input_recovery_reconcile_01" },
      },
      projectId: "project_01",
      targetCommandId: "recovery_abandon_01",
      expectedStatus: "committed" as const,
      expectedAttemptGeneration: 1,
      mode: "observe-only" as const,
    };
    const reconciled = await actions.reconcile(context, reconcileRequest as never);
    expect(reconciled).toMatchObject({ status: "committed", commandId: "recovery_abandon_01" });
    await expect(actions.reconcile(context, reconcileRequest as never)).resolves.toEqual(reconciled);
    expect(genericEffects).toBe(0);
    expect(fixture.database.prepare(`SELECT state FROM launched_chair_bridge_state`).get()).toEqual({ state: "abandoned" });
    expect(fixture.database.prepare(`SELECT state FROM project_sessions`).get()).toEqual({ state: "cancelled" });
    expect(fixture.database.prepare(`SELECT lifecycle_state FROM runs`).get()).toEqual({ lifecycle_state: "cancelled" });
    expect(fixture.database.prepare(`SELECT path FROM chair_bridge_loss_resolutions`).get()).toEqual({ path: "abandon" });
  });

  it("rebinds a lost chair with fresh secret custody, native evidence and duplicate-safe settlement", async () => {
    let recoveryEffects = 0;
    let dispatchedCapabilityGuards: ReturnType<typeof probeRecoveryCapabilityIdentityGuards> | undefined;
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return" as const,
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success" as const,
        providerSessionRef: "claude-chair-rebind-01",
        providerSessionGeneration: 3,
        effectDigest: digest("provider-before-rebind-effect"),
        resourceUsage: { provider_calls: 1 },
      },
    };
    const fixture = createFixture({
      dispatch: async () => outcome,
      retainedChairBridge: true,
      recoverChair: async (recovery) => {
        recoveryEffects += 1;
        expect(fixture.database.prepare(`
          SELECT state FROM chair_bridge_recovery_custody WHERE recovery_id=?
        `).get(recovery.recoveryId)).toEqual({ state: "dispatched" });
        dispatchedCapabilityGuards = probeRecoveryCapabilityIdentityGuards(fixture.database);
        return {
          schemaVersion: 1,
          recoveryId: recovery.recoveryId,
          providerAdapterId: "claude-agent-sdk",
          providerActionId: "provider_rebind_01",
          providerContractDigest: contractDigest,
          providerSessionRef: "claude-chair-rebind-01",
          providerSessionGeneration: 4,
          activationEvidenceDigest: digest("provider-after-rebind-effect"),
        };
      },
    });
    const { handle } = await prepareFixture(fixture);
    await fixture.service.dispatchPrepared(handle);
    fixture.service.observeChairBridgeLoss({
      projectSessionId: "session_launch_01",
      runId: "run_launch_01",
      agentId: "chair_launch_01",
      principalGeneration: 1,
      adapterId: "claude-agent-sdk",
      actionId: "provider_launch_01",
      providerSessionRef: "claude-chair-rebind-01",
      providerSessionGeneration: 3,
      bridgeGeneration: 1,
      reason: "provider bridge closed",
    });
    const loss = fixture.database.prepare(`SELECT * FROM chair_bridge_losses`).get() as Record<string, unknown>;
    const bridge = fixture.database.prepare(`SELECT * FROM launched_chair_bridge_state`).get() as Record<string, unknown>;
    const session = fixture.database.prepare(`SELECT revision, generation FROM project_sessions`).get() as Record<string, unknown>;
    const run = fixture.database.prepare(`SELECT revision, chair_generation FROM runs`).get() as Record<string, unknown>;
    const intent: ChairBridgeRecoveryIntent = {
      kind: "chair-bridge-recovery",
      schemaVersion: 1,
      path: "rebind",
      projectSessionId: "session_launch_01" as never,
      coordinationRunId: "run_launch_01" as never,
      lossId: String(loss.loss_id),
      recoveryManifestDigest: String(loss.recovery_manifest_digest) as Sha256Digest,
      expectedSessionRevision: Number(session.revision),
      expectedSessionGeneration: Number(session.generation),
      expectedRunRevision: Number(run.revision),
      expectedChairGeneration: Number(run.chair_generation),
      expectedPrincipalGeneration: 1,
      expectedBridgeRevision: Number(bridge.revision),
      expectedLostBridgeGeneration: 1,
      expectedProviderSessionGeneration: 3,
      providerAdapterId: "claude-agent-sdk",
      providerContractDigest: contractDigest,
      providerActionId: "provider_rebind_01" as never,
    };
    const inspection = await fixture.service.inspectChairRecovery(intent);
    const recovery = fixture.database.transaction(() => fixture.service.prepareChairRecoveryInTransaction({
      inspection,
      operatorId: "operator_01",
      operatorCommandId: "recovery_rebind_01",
    }))();
    expect(recovery).toMatchObject({
      capability: "chair-secret-canary-02",
      attestationChallenge,
      socketPath: "/private/agent-fabric.sock",
    });
    fixture.database.exec("SAVEPOINT invalid_rebind_capability_identity");
    try {
      const chair = fixture.database.prepare(`
        SELECT authority_id FROM agents WHERE run_id='run_launch_01' AND agent_id='chair_launch_01'
      `).get() as { authority_id: string };
      fixture.database.prepare(`
        INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, lifecycle)
        VALUES ('run_launch_01', 'wrong_rebind_agent', 'chair_launch_01', ?, 'ready')
      `).run(chair.authority_id);
      const fresh = fixture.database.prepare(`
        SELECT new_capability_hash, new_principal_generation
          FROM chair_bridge_recovery_custody
         WHERE operator_command_id='recovery_rebind_01'
      `).get() as { new_capability_hash: string; new_principal_generation: number };
      fixture.database.prepare(`
        INSERT INTO runs(
          run_id, chair_agent_id, workspace_root, project_run_directory, created_at,
          project_session_id, lifecycle_state, revision, chair_generation, chair_lease_id,
          authority_ref, budget_ref, dependency_revision, topology_slot
        ) SELECT 'foreign_rebind_run', 'foreign_rebind_agent', workspace_root, NULL, ?,
                 project_session_id, 'closed', 1, 1, 'foreign-rebind-chair-lease',
                 authority_ref, budget_ref, 1, NULL
            FROM runs WHERE run_id='run_launch_01'
      `).run(now);
      fixture.database.prepare(`
        INSERT INTO authorities(authority_id, run_id, parent_authority_id, authority_json, authority_hash, created_at)
        VALUES ('foreign_rebind_authority', 'foreign_rebind_run', NULL, '{}', 'foreign-rebind-hash', ?)
      `).run(now);
      fixture.database.prepare(`
        INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, lifecycle)
        VALUES ('foreign_rebind_run', 'foreign_rebind_agent', NULL, 'foreign_rebind_authority', 'ready')
      `).run();

      let updateBlocked = false;
      fixture.database.exec("SAVEPOINT rebind_capability_update");
      try {
        fixture.database.prepare(`
          UPDATE capabilities SET agent_id='wrong_rebind_agent' WHERE token_hash=?
        `).run(fresh.new_capability_hash);
      } catch (error: unknown) {
        updateBlocked = error instanceof Error && /INVARIANT_chair_bridge_loss_freezes_grants/u.test(error.message);
      } finally {
        fixture.database.exec("ROLLBACK TO rebind_capability_update");
        fixture.database.exec("RELEASE rebind_capability_update");
      }

      let sameRunInsertBlocked = false;
      fixture.database.exec("SAVEPOINT rebind_capability_same_run_insert");
      try {
        fixture.database.prepare(`DELETE FROM capabilities WHERE token_hash=?`).run(fresh.new_capability_hash);
        fixture.database.prepare(`
          INSERT INTO capabilities(token_hash, run_id, agent_id, principal_generation, expires_at)
          VALUES (?, 'run_launch_01', 'wrong_rebind_agent', ?, ?)
        `).run(fresh.new_capability_hash, fresh.new_principal_generation, now + 60_000);
      } catch (error: unknown) {
        sameRunInsertBlocked = error instanceof Error && /INVARIANT_chair_bridge_loss_freezes_grants/u.test(error.message);
      } finally {
        fixture.database.exec("ROLLBACK TO rebind_capability_same_run_insert");
        fixture.database.exec("RELEASE rebind_capability_same_run_insert");
      }

      let wrongRunInsertBlocked = false;
      fixture.database.exec("SAVEPOINT rebind_capability_wrong_run_insert");
      try {
        fixture.database.prepare(`DELETE FROM capabilities WHERE token_hash=?`).run(fresh.new_capability_hash);
        fixture.database.prepare(`
          INSERT INTO capabilities(token_hash, run_id, agent_id, principal_generation, expires_at)
          VALUES (?, 'foreign_rebind_run', 'foreign_rebind_agent', ?, ?)
        `).run(fresh.new_capability_hash, fresh.new_principal_generation, now + 60_000);
      } catch (error: unknown) {
        wrongRunInsertBlocked = error instanceof Error && /INVARIANT_chair_bridge_loss_freezes_grants/u.test(error.message);
      } finally {
        fixture.database.exec("ROLLBACK TO rebind_capability_wrong_run_insert");
        fixture.database.exec("RELEASE rebind_capability_wrong_run_insert");
      }
      expect({ updateBlocked, sameRunInsertBlocked, wrongRunInsertBlocked }).toEqual({
        updateBlocked: true,
        sameRunInsertBlocked: true,
        wrongRunInsertBlocked: true,
      });
    } finally {
      fixture.database.exec("ROLLBACK TO invalid_rebind_capability_identity");
      fixture.database.exec("RELEASE invalid_rebind_capability_identity");
    }
    const concurrentInspection = await fixture.service.inspectChairRecovery({
      ...intent,
      providerActionId: "provider_rebind_concurrent_01" as never,
    });
    expect(() => fixture.database.transaction(() => fixture.service.prepareChairRecoveryInTransaction({
      inspection: concurrentInspection,
      operatorId: "operator_01",
      operatorCommandId: "recovery_rebind_concurrent_01",
    }))()).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
    expect(databaseContains(fixture.database, "chair-secret-canary-02")).toBe(false);
    expect(databaseContains(fixture.database, attestationChallenge)).toBe(false);
    const committed = await fixture.service.dispatchPreparedChairRecovery(recovery);
    await expect(fixture.service.dispatchPreparedChairRecovery(recovery)).resolves.toEqual(committed);
    expect(recoveryEffects).toBe(1);
    expect(dispatchedCapabilityGuards).toEqual({
      identityUpdateBlocked: true,
      deleteBlocked: true,
      mutableMetadataAllowed: true,
      canonicalRevocationAllowed: false,
    });
    expect(probeRecoveryCapabilityIdentityGuards(fixture.database)).toEqual({
      identityUpdateBlocked: true,
      deleteBlocked: true,
      mutableMetadataAllowed: true,
      canonicalRevocationAllowed: true,
    });
    expect(fixture.database.prepare(`
      SELECT chair_agent_id, provider_action_id, provider_session_generation,
             principal_generation, bridge_generation, state
        FROM launched_chair_bridge_state
    `).get()).toEqual({
      chair_agent_id: "chair_launch_01",
      provider_action_id: "provider_rebind_01",
      provider_session_generation: 4,
      principal_generation: 2,
      bridge_generation: 2,
      state: "active",
    });
    expect(fixture.database.prepare(`SELECT state, generation FROM project_sessions`).get()).toEqual({
      state: "active",
      generation: Number(session.generation) + 1,
    });
    expect(fixture.database.prepare(`SELECT lifecycle_state, chair_generation FROM runs`).get()).toEqual({
      lifecycle_state: "active",
      chair_generation: Number(run.chair_generation) + 1,
    });
  });

  it("journals takeover before promotion and reconciles a post-promotion crash by lookup only", async () => {
    let promotions = 0;
    let lookups = 0;
    let crashAfterPromotion = true;
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return" as const,
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success" as const,
        providerSessionRef: "claude-chair-takeover-old",
        providerSessionGeneration: 2,
        effectDigest: digest("provider-before-takeover-effect"),
        resourceUsage: { provider_calls: 1 },
      },
    };
    const fixture = createFixture({
      dispatch: async () => outcome,
      retainedChairBridge: true,
      fault: (label) => {
        if (label === "chair-recovery:takeover:after-adapter" && crashAfterPromotion) {
          crashAfterPromotion = false;
          throw new Error("simulated daemon crash after bridge promotion");
        }
      },
      lookupSuccessor: async (input) => {
        lookups += 1;
        expect(input).toMatchObject({
          agentId: "successor_01",
          providerSessionRef: "claude-successor-session",
          sourceBridgeGeneration: 1,
          chairBridgeGeneration: 2,
        });
        return "chair";
      },
      promoteSuccessor: async (input) => {
        promotions += 1;
        expect(fixture.database.prepare(`
          SELECT state FROM chair_bridge_recovery_custody
           WHERE operator_command_id='recovery_takeover_01'
        `).get()).toEqual({ state: "dispatched" });
        expect(input).toMatchObject({
          agentId: "successor_01",
          providerSessionRef: "claude-successor-session",
          sourceBridgeGeneration: 1,
          chairBridgeGeneration: 2,
        });
        return true;
      },
    });
    const { handle } = await prepareFixture(fixture);
    await fixture.service.dispatchPrepared(handle);
    const authority = fixture.database.prepare(`
      SELECT authority_id FROM agents WHERE run_id='run_launch_01' AND agent_id='chair_launch_01'
    `).get() as { authority_id: string };
    const successorCapabilityHash = sha256("successor-capability-secret");
    const successorResult = canonicalJson({
      agentId: "successor_01",
      authorityId: authority.authority_id,
      adapterId: "claude-agent-sdk",
      actionId: "successor_action_01",
      providerSessionRef: "claude-successor-session",
      providerSessionGeneration: 1,
      bridgeState: "active",
      bridgeGeneration: 1,
      evidenceDigest: digest("successor-activation"),
    });
    fixture.database.transaction(() => {
      fixture.database.prepare(`
        INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, provider_session_ref, lifecycle)
        VALUES ('run_launch_01', 'successor_01', 'chair_launch_01', ?, 'claude-successor-session', 'ready')
      `).run(authority.authority_id);
      fixture.database.prepare(`INSERT INTO mailbox_state(run_id, recipient_id) VALUES ('run_launch_01', 'successor_01')`).run();
      fixture.database.prepare(`
        INSERT INTO capabilities(token_hash, run_id, agent_id, principal_generation, expires_at)
        VALUES (?, 'run_launch_01', 'successor_01', 1, ?)
      `).run(successorCapabilityHash, now + 60_000);
      fixture.database.prepare(`
        INSERT INTO provider_actions(
          run_id, action_id, adapter_id, operation, target_agent_id,
          provider_session_generation, turn_lease_generation, identity_hash,
          payload_hash, payload_json, status, history_json, execution_count,
          effect_count, idempotency_proven, result_json, updated_at
        ) VALUES (
          'run_launch_01', 'successor_action_01', 'claude-agent-sdk', 'spawn', 'successor_01',
          1, NULL, ?, ?, '{}', 'terminal', '["prepared","dispatched","accepted","terminal"]',
          1, 1, 1, ?, ?
        )
      `).run(sha256("successor-identity"), sha256("{}"), successorResult, now);
      fixture.database.prepare(`
        INSERT INTO provider_agent_custody(
          run_id, action_id, operation, actor_agent_id, target_agent_id, authority_id,
          adapter_id, bridge_contract_digest, bridge_capable, capability_hash,
          capability_expires_at, principal_generation, requested_provider_session_ref,
          intent_digest, created_at
        ) VALUES (
          'run_launch_01', 'successor_action_01', 'spawn', 'chair_launch_01', 'successor_01', ?,
          'claude-agent-sdk', ?, 1, ?, ?, 1, NULL, ?, ?
        )
      `).run(authority.authority_id, digest("successor-bridge-contract"), successorCapabilityHash, now + 60_000, digest("successor-intent"), now);
      fixture.database.prepare(`
        INSERT INTO agent_bridge_state(
          run_id, agent_id, adapter_id, action_id, provider_session_ref,
          provider_session_generation, bridge_state, bridge_generation,
          capability_hash, activation_evidence_digest, revision, created_at, updated_at
        ) VALUES (
          'run_launch_01', 'successor_01', 'claude-agent-sdk', 'successor_action_01',
          'claude-successor-session', 1, 'active', 1, ?, ?, 1, ?, ?
        )
      `).run(successorCapabilityHash, digest("successor-activation"), now, now);
    })();
    fixture.service.observeChairBridgeLoss({
      projectSessionId: "session_launch_01",
      runId: "run_launch_01",
      agentId: "chair_launch_01",
      principalGeneration: 1,
      adapterId: "claude-agent-sdk",
      actionId: "provider_launch_01",
      providerSessionRef: "claude-chair-takeover-old",
      providerSessionGeneration: 2,
      bridgeGeneration: 1,
      reason: "provider bridge closed",
    });
    const loss = fixture.database.prepare(`SELECT * FROM chair_bridge_losses`).get() as Record<string, unknown>;
    const bridge = fixture.database.prepare(`SELECT * FROM launched_chair_bridge_state`).get() as Record<string, unknown>;
    const session = fixture.database.prepare(`SELECT revision, generation FROM project_sessions`).get() as Record<string, unknown>;
    const run = fixture.database.prepare(`SELECT revision, chair_generation FROM runs`).get() as Record<string, unknown>;
    const intent: ChairBridgeRecoveryIntent = {
      kind: "chair-bridge-recovery",
      schemaVersion: 1,
      path: "takeover",
      projectSessionId: "session_launch_01" as never,
      coordinationRunId: "run_launch_01" as never,
      lossId: String(loss.loss_id),
      recoveryManifestDigest: String(loss.recovery_manifest_digest) as Sha256Digest,
      expectedSessionRevision: Number(session.revision),
      expectedSessionGeneration: Number(session.generation),
      expectedRunRevision: Number(run.revision),
      expectedChairGeneration: Number(run.chair_generation),
      expectedPrincipalGeneration: 1,
      expectedBridgeRevision: Number(bridge.revision),
      expectedLostBridgeGeneration: 1,
      expectedProviderSessionGeneration: 2,
      providerAdapterId: "claude-agent-sdk",
      providerContractDigest: contractDigest,
      successorAgentId: "successor_01",
      expectedSuccessorPrincipalGeneration: 1,
      expectedSuccessorBridgeGeneration: 1,
      expectedSuccessorRevision: 1,
    };
    fixture.database.prepare(`UPDATE capabilities SET expires_at=? WHERE token_hash=?`)
      .run(now, successorCapabilityHash);
    await expect(fixture.service.inspectChairRecovery(intent)).rejects.toThrow();
    fixture.database.prepare(`UPDATE capabilities SET expires_at=? WHERE token_hash=?`)
      .run(now + 60_000, successorCapabilityHash);
    const inspection = await fixture.service.inspectChairRecovery(intent);
    const recovery = fixture.database.transaction(() => fixture.service.prepareChairRecoveryInTransaction({
      inspection,
      operatorId: "operator_01",
      operatorCommandId: "recovery_takeover_01",
    }))();
    await expect(fixture.service.dispatchPreparedChairRecovery(recovery)).resolves.toMatchObject({
      status: "ambiguous",
      path: "takeover",
    });
    expect(fixture.database.prepare(`SELECT state FROM chair_bridge_recovery_custody`).get())
      .toEqual({ state: "ambiguous" });
    await expect(fixture.service.reconcileChairRecovery("operator_01", "recovery_takeover_01"))
      .resolves.toMatchObject({ status: "committed", path: "takeover" });
    expect(promotions).toBe(1);
    expect(lookups).toBe(1);
    expect(fixture.database.prepare(`
      SELECT chair_agent_id, provider_action_id, bridge_generation, state
        FROM launched_chair_bridge_state
    `).get()).toEqual({
      chair_agent_id: "successor_01",
      provider_action_id: "successor_action_01",
      bridge_generation: 2,
      state: "active",
    });
    expect(fixture.database.prepare(`SELECT chair_agent_id, lifecycle_state FROM runs`).get()).toEqual({
      chair_agent_id: "successor_01",
      lifecycle_state: "active",
    });
    expect(fixture.database.prepare(`SELECT bridge_state FROM agent_bridge_state WHERE agent_id='successor_01'`).get())
      .toEqual({ bridge_state: "none" });
  });

  it("performs zero adapter I/O for prepared recovery after restart and revokes only the fresh capability", async () => {
    let recoveryEffects = 0;
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return" as const,
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success" as const,
        providerSessionRef: "prepared-recovery-session",
        providerSessionGeneration: 2,
        effectDigest: digest("prepared-recovery-effect"),
        resourceUsage: { provider_calls: 1 },
      },
    };
    const fixture = createFixture({
      dispatch: async () => outcome,
      retainedChairBridge: true,
      recoverChair: async () => { recoveryEffects += 1; throw new Error("must not dispatch"); },
    });
    const { handle } = await prepareFixture(fixture);
    await fixture.service.dispatchPrepared(handle);
    fixture.service.observeChairBridgeLoss({
      projectSessionId: "session_launch_01", runId: "run_launch_01", agentId: "chair_launch_01",
      principalGeneration: 1, adapterId: "claude-agent-sdk", actionId: "provider_launch_01",
      providerSessionRef: "prepared-recovery-session", providerSessionGeneration: 2,
      bridgeGeneration: 1, reason: "provider bridge closed",
    });
    const loss = fixture.database.prepare(`SELECT * FROM chair_bridge_losses`).get() as Record<string, unknown>;
    const session = fixture.database.prepare(`SELECT revision, generation FROM project_sessions`).get() as Record<string, unknown>;
    const run = fixture.database.prepare(`SELECT revision, chair_generation FROM runs`).get() as Record<string, unknown>;
    const bridge = fixture.database.prepare(`SELECT revision FROM launched_chair_bridge_state`).get() as Record<string, unknown>;
    const intent: ChairBridgeRecoveryIntent = {
      kind: "chair-bridge-recovery", schemaVersion: 1, path: "rebind",
      projectSessionId: "session_launch_01" as never, coordinationRunId: "run_launch_01" as never,
      lossId: String(loss.loss_id), recoveryManifestDigest: String(loss.recovery_manifest_digest) as Sha256Digest,
      expectedSessionRevision: Number(session.revision), expectedSessionGeneration: Number(session.generation),
      expectedRunRevision: Number(run.revision), expectedChairGeneration: Number(run.chair_generation),
      expectedPrincipalGeneration: 1, expectedBridgeRevision: Number(bridge.revision),
      expectedLostBridgeGeneration: 1, expectedProviderSessionGeneration: 2,
      providerAdapterId: "claude-agent-sdk", providerContractDigest: contractDigest,
      providerActionId: "prepared_recovery_action" as never,
    };
    const inspection = await fixture.service.inspectChairRecovery(intent);
    fixture.database.transaction(() => fixture.service.prepareChairRecoveryInTransaction({
      inspection, operatorId: "operator_01", operatorCommandId: "prepared_recovery_command",
    }))();
    const recovered = await fixture.service.recover();
    expect(recoveryEffects).toBe(0);
    expect(recovered).toMatchObject({ failed: expect.any(Number), recoveryRequired: expect.any(Number) });
    expect(fixture.database.prepare(`SELECT state FROM chair_bridge_recovery_custody`).get()).toEqual({ state: "no-effect" });
    expect(fixture.database.prepare(`SELECT state FROM launched_chair_bridge_state`).get()).toEqual({ state: "lost" });
    expect(fixture.database.prepare(`
      SELECT revoked_at FROM capabilities
       WHERE token_hash=(SELECT new_capability_hash FROM chair_bridge_recovery_custody)
    `).get()).toEqual({ revoked_at: now });
  });

  it("recovers an ambiguous rebind by pair-keyed lookup without a second provider effect", async () => {
    let recoveryEffects = 0;
    let lookups = 0;
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return" as const,
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success" as const,
        providerSessionRef: "ambiguous-recovery-session",
        providerSessionGeneration: 2,
        effectDigest: digest("ambiguous-recovery-before"),
        resourceUsage: { provider_calls: 1 },
      },
    };
    const fixture = createFixture({
      dispatch: async () => outcome,
      retainedChairBridge: true,
      recoverChair: async () => {
        recoveryEffects += 1;
        throw new Error("connection dropped after provider acceptance");
      },
      lookupChairRecovery: async ({ actionId }) => {
        lookups += 1;
        const unsigned = {
          schemaVersion: 1 as const,
          kind: "provider-session-fabric-attestation" as const,
          method: "provider-session-random-challenge-v1" as const,
          bridgeContract: "agent-fabric-session-bridge-v1" as const,
          providerAdapterId: "claude-agent-sdk",
          providerActionId: actionId,
          providerContractDigest: contractDigest,
          providerSessionRef: "ambiguous-recovery-session",
          providerSessionGeneration: 3,
          providerTurnRef: "ambiguous-recovery-turn",
          challengeDigest: chairLaunchChallengeDigest(attestationChallenge),
          providerInvocationRef: "ambiguous-recovery-tool-call",
        };
        return {
          actionId,
          operation: "recover_chair",
          status: "terminal",
          executionCount: 1,
          effectCount: 1,
          result: {
            resumeReference: "ambiguous-recovery-session",
            providerSessionGeneration: 3,
            fabricContinuity: {
              ...unsigned,
              attestationDigest: chairLaunchAttestationDigest(unsigned),
            },
          },
        };
      },
    });
    const { handle } = await prepareFixture(fixture);
    await fixture.service.dispatchPrepared(handle);
    fixture.service.observeChairBridgeLoss({
      projectSessionId: "session_launch_01", runId: "run_launch_01", agentId: "chair_launch_01",
      principalGeneration: 1, adapterId: "claude-agent-sdk", actionId: "provider_launch_01",
      providerSessionRef: "ambiguous-recovery-session", providerSessionGeneration: 2,
      bridgeGeneration: 1, reason: "provider bridge closed",
    });
    const loss = fixture.database.prepare(`SELECT * FROM chair_bridge_losses`).get() as Record<string, unknown>;
    const session = fixture.database.prepare(`SELECT revision, generation FROM project_sessions`).get() as Record<string, unknown>;
    const run = fixture.database.prepare(`SELECT revision, chair_generation FROM runs`).get() as Record<string, unknown>;
    const bridge = fixture.database.prepare(`SELECT revision FROM launched_chair_bridge_state`).get() as Record<string, unknown>;
    const intent: ChairBridgeRecoveryIntent = {
      kind: "chair-bridge-recovery", schemaVersion: 1, path: "rebind",
      projectSessionId: "session_launch_01" as never, coordinationRunId: "run_launch_01" as never,
      lossId: String(loss.loss_id), recoveryManifestDigest: String(loss.recovery_manifest_digest) as Sha256Digest,
      expectedSessionRevision: Number(session.revision), expectedSessionGeneration: Number(session.generation),
      expectedRunRevision: Number(run.revision), expectedChairGeneration: Number(run.chair_generation),
      expectedPrincipalGeneration: 1, expectedBridgeRevision: Number(bridge.revision),
      expectedLostBridgeGeneration: 1, expectedProviderSessionGeneration: 2,
      providerAdapterId: "claude-agent-sdk", providerContractDigest: contractDigest,
      providerActionId: "ambiguous_recovery_action" as never,
    };
    const inspection = await fixture.service.inspectChairRecovery(intent);
    const recovery = fixture.database.transaction(() => fixture.service.prepareChairRecoveryInTransaction({
      inspection, operatorId: "operator_01", operatorCommandId: "ambiguous_recovery_command",
    }))();
    await expect(fixture.service.dispatchPreparedChairRecovery(recovery)).resolves.toMatchObject({ status: "ambiguous" });
    expect(probeRecoveryCapabilityIdentityGuards(fixture.database)).toEqual({
      identityUpdateBlocked: true,
      deleteBlocked: true,
      mutableMetadataAllowed: true,
      canonicalRevocationAllowed: false,
    });
    await fixture.service.recover();
    expect(recoveryEffects).toBe(1);
    expect(lookups).toBe(1);
    expect(fixture.database.prepare(`SELECT state FROM chair_bridge_recovery_custody`).get()).toEqual({ state: "terminal" });
    expect(fixture.database.prepare(`
      SELECT status, effect_count, idempotency_proven FROM provider_actions
       WHERE action_id='ambiguous_recovery_action'
    `).get()).toEqual({ status: "terminal", effect_count: 1, idempotency_proven: 1 });
    expect(fixture.database.prepare(`SELECT state, provider_session_generation FROM launched_chair_bridge_state`).get())
      .toEqual({ state: "active", provider_session_generation: 3 });
  });

  it("keeps unresolved chair rebind custody out of generic startup recovery", async () => {
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return" as const,
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success" as const,
        providerSessionRef: "startup-unresolved-rebind-session",
        providerSessionGeneration: 2,
        effectDigest: digest("startup-unresolved-rebind-effect"),
        resourceUsage: { provider_calls: 1 },
      },
    };
    const fixture = createFixture({
      dispatch: async () => outcome,
      retainedChairBridge: true,
      persistent: true,
      recoverChair: async () => { throw new Error("connection dropped after provider acceptance"); },
    });
    const { handle } = await prepareFixture(fixture);
    await fixture.service.dispatchPrepared(handle);
    fixture.service.observeChairBridgeLoss({
      projectSessionId: "session_launch_01", runId: "run_launch_01", agentId: "chair_launch_01",
      principalGeneration: 1, adapterId: "claude-agent-sdk", actionId: "provider_launch_01",
      providerSessionRef: "startup-unresolved-rebind-session", providerSessionGeneration: 2,
      bridgeGeneration: 1, reason: "provider bridge closed",
    });
    const loss = fixture.database.prepare(`SELECT * FROM chair_bridge_losses`).get() as Record<string, unknown>;
    const session = fixture.database.prepare(`SELECT revision, generation FROM project_sessions`).get() as Record<string, unknown>;
    const run = fixture.database.prepare(`SELECT revision, chair_generation FROM runs`).get() as Record<string, unknown>;
    const bridge = fixture.database.prepare(`SELECT revision FROM launched_chair_bridge_state`).get() as Record<string, unknown>;
    const intent: ChairBridgeRecoveryIntent = {
      kind: "chair-bridge-recovery", schemaVersion: 1, path: "rebind",
      projectSessionId: "session_launch_01" as never, coordinationRunId: "run_launch_01" as never,
      lossId: String(loss.loss_id), recoveryManifestDigest: String(loss.recovery_manifest_digest) as Sha256Digest,
      expectedSessionRevision: Number(session.revision), expectedSessionGeneration: Number(session.generation),
      expectedRunRevision: Number(run.revision), expectedChairGeneration: Number(run.chair_generation),
      expectedPrincipalGeneration: 1, expectedBridgeRevision: Number(bridge.revision),
      expectedLostBridgeGeneration: 1, expectedProviderSessionGeneration: 2,
      providerAdapterId: "claude-agent-sdk", providerContractDigest: contractDigest,
      providerActionId: "startup_unresolved_rebind_action" as never,
    };
    const inspection = await fixture.service.inspectChairRecovery(intent);
    const recovery = fixture.database.transaction(() => fixture.service.prepareChairRecoveryInTransaction({
      inspection, operatorId: "operator_01", operatorCommandId: "startup_unresolved_rebind_command",
    }))();
    await expect(fixture.service.dispatchPreparedChairRecovery(recovery)).resolves.toMatchObject({ status: "ambiguous" });
    closeTrackedDatabase(fixture.database);

    const callsPath = join(fixture.root, "unresolved-rebind-calls.jsonl");
    const runtime = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.root],
      fabricSocketPath: join(fixture.root, "fabric.sock"),
      adapters: {
        "claude-agent-sdk": {
          command: [process.execPath, "--import", "tsx", recoveryAdapter],
          environment: {
            LAUNCH_RECOVERY_CALLS_PATH: callsPath,
            LAUNCH_RECOVERY_CONTRACT_JSON: canonicalJson(contract),
          },
        },
      },
    });
    let startup: Awaited<ReturnType<typeof runtime.recoverStartupState>> | undefined;
    let directError: unknown;
    try {
      startup = await runtime.recoverStartupState();
      try {
        await runtime.reconcileProviderAction("run_launch_01", "chair_launch_01", {
          actionId: "startup_unresolved_rebind_action",
          commandId: "generic_rebind_reconcile_forbidden_01",
        });
      } catch (error: unknown) {
        directError = error;
      }
    } finally {
      await runtime.close();
    }
    expect(startup).toMatchObject({ actionsQuarantined: 0 });
    expect(directError).toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    const calls = readFileSync(callsPath, "utf8").trim().split("\n")
      .map((line) => JSON.parse(line) as { method: string });
    expect(calls.filter(({ method }) => method === "lookup_action")).toHaveLength(1);
    const state = new Database(fixture.databasePath, { readonly: true });
    expect(state.prepare(`
      SELECT c.state, p.status, p.execution_count, p.effect_count
        FROM chair_bridge_recovery_custody c
        JOIN provider_actions p
          ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
       WHERE c.operator_command_id='startup_unresolved_rebind_command'
    `).get()).toEqual({ state: "ambiguous", status: "ambiguous", execution_count: 1, effect_count: 0 });
    state.close();
  });

  it("fences an activated launched chair on restart without a retained bridge or generic status call", async () => {
    const outcome = {
      schemaVersion: 1,
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_launch_01",
      providerContractDigest: contractDigest,
      observationKind: "dispatch-return",
      observedAt: "2027-01-01T00:00:00.000Z",
      outcome: {
        kind: "terminal-success",
        providerSessionRef: "claude-chair-restart-loss-01",
        providerSessionGeneration: 4,
        effectDigest: digest("provider-restart-loss-effect"),
        resourceUsage: { provider_calls: 1 },
      },
    };
    const fixture = createFixture({ dispatch: async () => outcome, retainedChairBridge: true, persistent: true });
    const { handle } = await prepareFixture(fixture);
    await fixture.service.dispatchPrepared(handle);
    closeTrackedDatabase(fixture.database);
    const callsPath = join(fixture.root, "chair-restart-calls.jsonl");
    const runtime = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.root],
      fabricSocketPath: join(fixture.root, "fabric.sock"),
      adapters: {
        "claude-agent-sdk": {
          command: [process.execPath, "--import", "tsx", recoveryAdapter],
          environment: {
            LAUNCH_RECOVERY_CALLS_PATH: callsPath,
            LAUNCH_RECOVERY_CONTRACT_JSON: canonicalJson(contract),
          },
        },
      },
    });

    await runtime.recoverStartupState();
    await runtime.recoverStartupState();
    await runtime.close();
    expect(() => readFileSync(callsPath, "utf8")).toThrow();
    const state = new Database(fixture.databasePath, { readonly: true });
    expect(state.prepare(`
      SELECT COUNT(*) AS count FROM chair_bridge_losses WHERE coordination_run_id='run_launch_01'
    `).get()).toEqual({ count: 1 });
    expect(state.prepare(`
      SELECT s.state, r.lifecycle_state, b.state AS bridge_state
        FROM project_sessions s
        JOIN runs r ON r.project_session_id=s.project_session_id
        JOIN launched_chair_bridge_state b ON b.coordination_run_id=r.run_id
       WHERE r.run_id='run_launch_01'
    `).get()).toEqual({
      state: "recovery_required",
      lifecycle_state: "recovery_required",
      bridge_state: "lost",
    });
    state.close();
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

  it("routes startup recovery through launch custody without generic redispatch", async () => {
    const prepared = createFixture({ persistent: true });
    await prepareFixture(prepared);
    closeTrackedDatabase(prepared.database);

    const preparedRuntime = await openFabric({
      databasePath: prepared.databasePath,
      workspaceRoots: [prepared.root],
      fabricSocketPath: join(prepared.root, "fabric.sock"),
    });
    await expect(preparedRuntime.reconcileProviderAction("run_launch_01", "chair_launch_01", {
      actionId: "provider_launch_01",
      commandId: "generic_launch_reconcile_forbidden_01",
    })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    await preparedRuntime.recoverStartupState();
    await preparedRuntime.close();
    const preparedState = new Database(prepared.databasePath, { readonly: true });
    expect(preparedState.prepare(`
      SELECT s.state, p.status, p.execution_count
        FROM project_sessions s
        JOIN project_session_launch_custody c ON c.project_session_id=s.project_session_id
        JOIN provider_actions p
          ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
    `).get()).toEqual({ state: "launch_failed", status: "terminal", execution_count: 0 });
    preparedState.close();

    const dispatched = createFixture({ persistent: true });
    await prepareFixture(dispatched);
    dispatched.database.prepare(`
      UPDATE provider_actions
         SET status='dispatched', history_json='["prepared","dispatched"]', execution_count=1
    `).run();
    closeTrackedDatabase(dispatched.database);
    const callsPath = join(dispatched.root, "adapter-calls.jsonl");
    const dispatchedRuntime = await openFabric({
      databasePath: dispatched.databasePath,
      workspaceRoots: [dispatched.root],
      fabricSocketPath: join(dispatched.root, "fabric.sock"),
      adapters: {
        "claude-agent-sdk": {
          command: [process.execPath, "--import", "tsx", recoveryAdapter],
          environment: {
            LAUNCH_RECOVERY_CALLS_PATH: callsPath,
            LAUNCH_RECOVERY_CONTRACT_JSON: canonicalJson(contract),
          },
        },
      },
    });
    await dispatchedRuntime.recoverStartupState();
    await dispatchedRuntime.close();
    const calls = readFileSync(callsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { method: string });
    expect(calls.map(({ method }) => method)).toEqual(["capabilities", "lookup_action"]);
    const dispatchedState = new Database(dispatched.databasePath, { readonly: true });
    expect(dispatchedState.prepare(`
      SELECT s.state, p.status, p.execution_count
        FROM project_sessions s
        JOIN project_session_launch_custody c ON c.project_session_id=s.project_session_id
        JOIN provider_actions p
          ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
    `).get()).toEqual({ state: "launch_ambiguous", status: "ambiguous", execution_count: 1 });
    dispatchedState.close();
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

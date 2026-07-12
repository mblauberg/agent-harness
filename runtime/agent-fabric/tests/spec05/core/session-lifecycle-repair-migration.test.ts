import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations, type Migration } from "../../../src/core/migrations.ts";
import { preflightArtifactRegistry } from "../../../src/persistence/artifact-registry-preflight.ts";
import { preflightExternalEffectCustody } from "../../../src/persistence/external-effect-custody-preflight.ts";
import { preflightAdditiveInvariants } from "../../../src/persistence/invariants.ts";
import { preflightLaunchedChairBridgeLoss } from "../../../src/persistence/launched-chair-bridge-loss-preflight.ts";
import { preflightLaunchCustody } from "../../../src/persistence/launch-custody-preflight.ts";
import { preflightProjectSessionOperations } from "../../../src/persistence/project-session-preflight.ts";
import { preflightProviderBridgeCustody } from "../../../src/persistence/provider-bridge-custody-preflight.ts";
import {
  preflightSessionLifecycleRepair,
  SessionLifecycleRepairPreflightError,
} from "../../../src/persistence/session-lifecycle-repair-preflight.ts";
import { preflightTypedGitCustody } from "../../../src/persistence/typed-git-preflight.ts";

const databases: Database.Database[] = [];
const digest = `sha256:${"a".repeat(64)}`;

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

const filenames = [
  "0001-core.sql",
  "0002-observer-event-sequence.sql",
  "0003-integrity-and-query-plans.sql",
  "0004-project-session-operations.sql",
  "0005-launch-custody.sql",
  "0006-operator-lifecycle.sql",
  "0007-provider-bridge-custody.sql",
  "0008-external-effect-custody.sql",
  "0009-launched-chair-bridge-loss.sql",
  "0010-artifact-registry.sql",
  "0011-automatic-session-membership.sql",
  "0012-typed-git-custody.sql",
  "0013-session-lifecycle-repair.sql",
] as const;

const preflights = new Map<number, Migration["preflight"]>([
  [3, preflightAdditiveInvariants],
  [4, preflightProjectSessionOperations],
  [5, preflightLaunchCustody],
  [7, preflightProviderBridgeCustody],
  [8, preflightExternalEffectCustody],
  [9, preflightLaunchedChairBridgeLoss],
  [10, preflightArtifactRegistry],
  [12, preflightTypedGitCustody],
  [13, preflightSessionLifecycleRepair],
]);

function migrationsThrough(version: number): Migration[] {
  return filenames.slice(0, version).map((filename, index) => {
    const preflight = preflights.get(index + 1);
    return {
      version: index + 1,
      name: filename.replace(/^[0-9]+-/u, "").replace(/\.sql$/u, ""),
      sql: readFileSync(new URL(`../../../migrations/${filename}`, import.meta.url), "utf8"),
      ...(preflight === undefined ? {} : { preflight }),
    };
  });
}

function version12(): Database.Database {
  const database = new Database(":memory:");
  databases.push(database);
  database.pragma("foreign_keys = ON");
  expect(applyMigrations(database, migrationsThrough(12))).toMatchObject({ currentVersion: 12 });
  return database;
}

function seedProject(database: Database.Database, sessionId: string, state = "active"): void {
  database.exec(`
    INSERT INTO projects(project_id,canonical_root,revision,authority_generation,created_at,updated_at)
    VALUES ('project_01','/project/one',1,1,1,1);
    INSERT INTO project_sessions(
      project_session_id,project_id,mode,state,revision,generation,authority_ref,
      budget_ref,launch_packet_path,launch_packet_digest,membership_revision,
      origin_kind,origin_operator_id,terminal_path_json,created_at,updated_at
    ) VALUES (
      '${sessionId}','project_01','independent','${state}',1,1,'${digest}',
      'budget_01','launch.json','${digest}',1,'operator-launch','operator_01',NULL,1,1
    );
  `);
}

function seedRun(database: Database.Database, sessionId: string, runId: string, state = "active"): void {
  database.exec(`
    INSERT INTO runs(
      run_id,chair_agent_id,workspace_root,project_run_directory,project_run_directory_basis,
      created_at,project_session_id,lifecycle_state,revision,chair_generation,chair_lease_id,
      authority_ref,budget_ref,dependency_revision,topology_slot
    ) VALUES (
      '${runId}','chair_01','/project/one',NULL,'none',1,'${sessionId}','${state}',1,2,
      'chair:${runId}:2','${digest}','budget_01',1,NULL
    );
    INSERT INTO authorities(authority_id,run_id,authority_json,authority_hash,created_at)
    VALUES ('authority_${runId}','${runId}','{}','authority-hash-${runId}',1);
    INSERT INTO agents(run_id,agent_id,authority_id,lifecycle)
    VALUES ('${runId}','chair_01','authority_${runId}','ready');
    INSERT INTO run_chair_leases(
      project_session_id,run_id,lease_id,holder_agent_id,generation,status,updated_at
    ) VALUES
      ('${sessionId}','${runId}','chair:${runId}:1','chair_01',1,'frozen',1),
      ('${sessionId}','${runId}','chair:${runId}:2','chair_01',2,'active',2);
  `);
}

function seedChairBridge(
  database: Database.Database,
  sessionId: string,
  runId: string,
  bridgeState: "active" | "lost" | "abandoned" = "active",
): void {
  database.prepare(`
    UPDATE agents SET provider_session_ref='provider-chair-01'
     WHERE run_id=? AND agent_id='chair_01'
  `).run(runId);
  database.prepare(`
    INSERT INTO capabilities(token_hash,run_id,agent_id,principal_generation,expires_at,revoked_at)
    VALUES (?,?,?,?,?,?)
  `).run(`cap-${runId}`, runId, "chair_01", 1, 999, null);
  database.prepare(`
    INSERT INTO provider_actions(
      run_id,action_id,adapter_id,operation,target_agent_id,provider_session_generation,
      turn_lease_generation,identity_hash,payload_hash,payload_json,status,history_json,
      execution_count,effect_count,idempotency_proven,result_json,updated_at,journal_revision
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    runId, `launch-${runId}`, "adapter-test", "spawn", "chair_01", 1,
    null, "identity", "payload", "{}", "terminal", "[]", 1, 1, 1,
    JSON.stringify({ outcome: { kind: "terminal-success", providerSessionRef: "provider-chair-01" } }),
    2, 1,
  );
  database.prepare(`
    INSERT INTO launched_chair_bridge_state(
      project_session_id,coordination_run_id,chair_agent_id,provider_adapter_id,
      provider_action_id,provider_contract_digest,provider_session_ref,
      provider_session_generation,principal_generation,bridge_generation,
      capability_hash,activation_evidence_digest,state,revision,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    sessionId, runId, "chair_01", "adapter-test", `launch-${runId}`, digest,
    "provider-chair-01", 1, 1, 1, `cap-${runId}`, digest, bridgeState, 1, 2, 2,
  );
}

function seedTerminalChairBridge(
  database: Database.Database,
  sessionId: string,
  runId: string,
  bridgeState: "active" | "lost" | "abandoned" = "active",
): void {
  seedChairBridge(database, sessionId, runId, bridgeState);
  const terminalPath = JSON.stringify({ kind: "accepted", acceptanceRef: digest });
  database.prepare(`
    UPDATE project_sessions
       SET state='closed', terminal_path_json=?, revision=revision+1, updated_at=2
     WHERE project_session_id=?
  `).run(terminalPath, sessionId);
  database.prepare(`
    UPDATE runs SET lifecycle_state='closed', revision=revision+1 WHERE run_id=?
  `).run(runId);
  database.prepare(`
    UPDATE agents SET lifecycle='archived' WHERE run_id=? AND agent_id='chair_01'
  `).run(runId);
  database.prepare(`
    UPDATE run_chair_leases SET status='revoked', updated_at=3
     WHERE project_session_id=? AND run_id=? AND lease_id=?
  `).run(sessionId, runId, `chair:${runId}:2`);
  database.prepare(`UPDATE capabilities SET revoked_at=3 WHERE token_hash=?`).run(`cap-${runId}`);
}

function seedActiveChildBridge(database: Database.Database, runId: string): void {
  database.exec(`
    INSERT INTO agents(run_id,agent_id,parent_agent_id,authority_id,provider_session_ref,lifecycle)
    VALUES ('${runId}','child_01','chair_01','authority_${runId}','provider-child-01','ready');
    INSERT INTO capabilities(token_hash,run_id,agent_id,principal_generation,expires_at,revoked_at)
    VALUES ('cap-child-${runId}','${runId}','child_01',1,999,NULL);
    INSERT INTO provider_actions(
      run_id,action_id,adapter_id,operation,target_agent_id,provider_session_generation,
      turn_lease_generation,identity_hash,payload_hash,payload_json,status,history_json,
      execution_count,effect_count,idempotency_proven,result_json,updated_at,journal_revision
    ) VALUES (
      '${runId}','spawn-child-${runId}','adapter-test','spawn','child_01',1,NULL,
      'identity-child','payload-child','{}','terminal','[]',1,1,1,
      '{"outcome":{"kind":"terminal-success","providerSessionRef":"provider-child-01"}}',2,1
    );
    INSERT INTO provider_agent_custody(
      run_id,action_id,operation,actor_agent_id,target_agent_id,authority_id,adapter_id,
      bridge_contract_digest,bridge_capable,capability_hash,capability_expires_at,
      principal_generation,requested_provider_session_ref,intent_digest,created_at
    ) VALUES (
      '${runId}','spawn-child-${runId}','spawn','chair_01','child_01','authority_${runId}',
      'adapter-test','${digest}',1,'cap-child-${runId}',999,1,NULL,'${digest}',2
    );
    INSERT INTO agent_bridge_state(
      run_id,agent_id,adapter_id,action_id,provider_session_ref,
      provider_session_generation,bridge_state,bridge_generation,capability_hash,
      activation_evidence_digest,revision,created_at,updated_at
    ) VALUES (
      '${runId}','child_01','adapter-test','spawn-child-${runId}','provider-child-01',
      1,'active',1,'cap-child-${runId}','${digest}',1,2,2
    );
  `);
}

describe("session lifecycle repair migration 0013", () => {
  it("repairs source dispositions and chair membership once across restart", () => {
    const database = version12();
    seedProject(database, "session_repair");
    seedRun(database, "session_repair", "run_repair");
    database.exec(`
      INSERT INTO tasks(
        run_id,task_id,authority_id,objective,base_revision,state,
        owner_agent_id,revision,owner_lease_generation,created_by
      ) VALUES
        ('run_repair','task_cancelled','authority_run_repair','cancelled','base','cancelled','chair_01',1,1,'chair_01'),
        ('run_repair','task_degraded','authority_run_repair','degraded','base','degraded','chair_01',1,1,'chair_01');
      INSERT INTO messages(
        message_id,run_id,sender_id,dedupe_key,payload_hash,audience_json,kind,body,
        requires_ack,conversation_id,hop_count,created_at
      ) VALUES
        ('message_zero','run_repair','chair_01','zero','hash-zero','{}','request','zero',1,'conv-zero',0,3),
        ('message_expired','run_repair','chair_01','expired','hash-expired','{}','request','expired',1,'conv-expired',0,3);
      INSERT INTO mailbox_state(run_id,recipient_id,next_sequence,contiguous_watermark)
      VALUES ('run_repair','chair_01',2,0);
      INSERT INTO deliveries(
        delivery_id,message_id,run_id,recipient_id,mailbox_sequence,state,attempt_count,
        resolution_reason,resolved_at
      ) VALUES (
        'delivery_expired','message_expired','run_repair','chair_01',1,'expired',1,'deadline',4
      );
      INSERT INTO project_session_memberships(
        project_session_id,coordination_run_id,member_kind,member_id,
        required,state,revision,abandoned_reason,created_at,updated_at
      ) VALUES
        ('session_repair','run_repair','task','task_cancelled',1,'reconciled',1,NULL,1,1),
        ('session_repair','run_repair','task','task_degraded',1,'reconciled',1,NULL,1,1),
        ('session_repair','run_repair','required-message','message_zero',1,'reconciled',1,NULL,1,1),
        ('session_repair','run_repair','required-message','message_expired',1,'reconciled',1,NULL,1,1),
        ('session_repair','run_repair','lease','chair:run_repair:1',1,'active',1,NULL,1,1);
    `);

    expect(applyMigrations(database, migrationsThrough(13)))
      .toEqual({ applied: [13], currentVersion: 13 });
    expect(database.prepare(`
      SELECT member_kind,member_id,state,abandoned_reason
        FROM project_session_memberships
       WHERE project_session_id='session_repair'
       ORDER BY member_kind,member_id
    `).all()).toEqual([
      { member_kind: "coordination-run", member_id: "run_repair", state: "active", abandoned_reason: null },
      { member_kind: "lease", member_id: "chair:run_repair:1", state: "abandoned", abandoned_reason: "superseded chair lease" },
      { member_kind: "lease", member_id: "chair:run_repair:2", state: "active", abandoned_reason: null },
      { member_kind: "required-message", member_id: "message_expired", state: "abandoned", abandoned_reason: "required-message source delivery expired or abandoned" },
      { member_kind: "required-message", member_id: "message_zero", state: "active", abandoned_reason: null },
      { member_kind: "task", member_id: "task_cancelled", state: "abandoned", abandoned_reason: "task source state cancelled" },
      { member_kind: "task", member_id: "task_degraded", state: "abandoned", abandoned_reason: "task source state degraded" },
    ]);
    expect(database.prepare("SELECT status FROM run_chair_leases ORDER BY generation").all())
      .toEqual([{ status: "revoked" }, { status: "active" }]);
    expect(database.prepare(`
      SELECT revision,membership_revision FROM project_sessions WHERE project_session_id='session_repair'
    `).get()).toEqual({ revision: 2, membership_revision: 2 });
    expect(applyMigrations(database, migrationsThrough(13)))
      .toEqual({ applied: [], currentVersion: 13 });
    expect(database.prepare(`
      SELECT revision,membership_revision FROM project_sessions WHERE project_session_id='session_repair'
    `).get()).toEqual({ revision: 2, membership_revision: 2 });
  });

  it("rejects ambiguous multi-run topology and enforces one later nonterminal run", () => {
    const ambiguous = version12();
    seedProject(ambiguous, "session_ambiguous");
    seedRun(ambiguous, "session_ambiguous", "run_one");
    ambiguous.prepare(`
      INSERT INTO runs(
        run_id,chair_agent_id,workspace_root,project_run_directory,project_run_directory_basis,
        created_at,project_session_id,lifecycle_state,revision,chair_generation,chair_lease_id,
        authority_ref,budget_ref,dependency_revision,topology_slot
      ) VALUES ('run_two','chair_01','/project/one',NULL,'none',2,'session_ambiguous','active',1,1,
        'chair:run_two:1',?,'budget_01',1,NULL)
    `).run(digest);
    expect(() => applyMigrations(ambiguous, migrationsThrough(13))).toThrowError(
      expect.objectContaining<Partial<SessionLifecycleRepairPreflightError>>({
        code: "SESSION_LIFECYCLE_REPAIR_PREFLIGHT_FAILED",
      }),
    );
    expect(ambiguous.prepare("SELECT version FROM schema_migrations WHERE version=13").get()).toBeUndefined();

    const enforced = version12();
    seedProject(enforced, "session_enforced");
    seedRun(enforced, "session_enforced", "run_current");
    expect(applyMigrations(enforced, migrationsThrough(13))).toMatchObject({ currentVersion: 13 });
    expect(() => enforced.prepare(`
      INSERT INTO runs(
        run_id,chair_agent_id,workspace_root,project_run_directory,project_run_directory_basis,
        created_at,project_session_id,lifecycle_state,revision,chair_generation,chair_lease_id,
        authority_ref,budget_ref,dependency_revision,topology_slot
      ) VALUES ('run_forbidden','chair_01','/project/one',NULL,'none',2,'session_enforced','active',1,1,
        'chair:run_forbidden:1',?,'budget_01',1,NULL)
    `).run(digest)).toThrow(/UNIQUE/iu);
  });

  it("refuses a current chair lease held by a different agent", () => {
    const database = version12();
    seedProject(database, "session_wrong_chair");
    seedRun(database, "session_wrong_chair", "run_wrong_chair");
    database.exec(`
      INSERT INTO agents(run_id,agent_id,authority_id,lifecycle)
      VALUES ('run_wrong_chair','chair_02','authority_run_wrong_chair','ready');
      UPDATE run_chair_leases SET holder_agent_id='chair_02'
       WHERE project_session_id='session_wrong_chair'
         AND run_id='run_wrong_chair' AND lease_id='chair:run_wrong_chair:2';
    `);

    expect(() => applyMigrations(database, migrationsThrough(13))).toThrowError(
      expect.objectContaining<Partial<SessionLifecycleRepairPreflightError>>({
        code: "SESSION_LIFECYCLE_REPAIR_PREFLIGHT_FAILED",
      }),
    );
    expect(database.prepare("SELECT version FROM schema_migrations WHERE version=13").get()).toBeUndefined();
  });

  it("rejects nullable or moved run identity after upgrade", () => {
    const database = version12();
    seedProject(database, "session_identity");
    seedRun(database, "session_identity", "run_identity");
    expect(applyMigrations(database, migrationsThrough(13))).toMatchObject({ currentVersion: 13 });

    expect(() => database.prepare(`
      UPDATE runs SET lifecycle_state=NULL,revision=revision+1 WHERE run_id='run_identity'
    `).run()).toThrow(/INVARIANT_run_required_session_identity/u);
    expect(() => database.prepare(`
      UPDATE runs SET project_session_id=NULL,revision=revision+1 WHERE run_id='run_identity'
    `).run()).toThrow(/INVARIANT_run_required_session_identity/u);
    expect(database.prepare(`
      SELECT project_session_id,lifecycle_state,revision FROM runs WHERE run_id='run_identity'
    `).get()).toEqual({ project_session_id: "session_identity", lifecycle_state: "active", revision: 1 });
    database.exec(`
      INSERT INTO agents(run_id,agent_id,authority_id,lifecycle)
      VALUES ('run_identity','chair_02','authority_run_identity','ready');
    `);
    expect(() => database.prepare(`
      UPDATE run_chair_leases SET holder_agent_id='chair_02'
       WHERE run_id='run_identity' AND lease_id='chair:run_identity:2'
    `).run()).toThrow(/INVARIANT_run_chair_lease_identity_immutable/u);
  });

  it("refuses cross-owner lease identity collisions before repair", () => {
    const database = version12();
    seedProject(database, "session_lease_collision");
    seedRun(database, "session_lease_collision", "run_lease_collision");
    database.prepare(`
      INSERT INTO leases(lease_id,run_id,kind,holder_agent_id,generation,status,expires_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      "chair:run_lease_collision:1",
      "run_lease_collision",
      "write",
      "chair_01",
      1,
      "active",
      999,
      2,
    );
    expect(() => applyMigrations(database, migrationsThrough(13))).toThrowError(
      expect.objectContaining<Partial<SessionLifecycleRepairPreflightError>>({
        code: "SESSION_LIFECYCLE_REPAIR_PREFLIGHT_FAILED",
      }),
    );
    expect(database.prepare("SELECT version FROM schema_migrations WHERE version=13").get()).toBeUndefined();
  });

  it("refuses a terminal run whose current chair lease is still live", () => {
    const database = version12();
    seedProject(database, "session_terminal_lease", "closed");
    seedRun(database, "session_terminal_lease", "run_terminal_lease", "closed");
    database.prepare(`
      UPDATE project_sessions SET terminal_path_json=? WHERE project_session_id='session_terminal_lease'
    `).run(JSON.stringify({ kind: "accepted", acceptanceRef: digest }));
    expect(() => applyMigrations(database, migrationsThrough(13))).toThrowError(
      expect.objectContaining<Partial<SessionLifecycleRepairPreflightError>>({
        code: "SESSION_LIFECYCLE_REPAIR_PREFLIGHT_FAILED",
      }),
    );
  });

  it("backfills immutable retirement proof for a clean terminal launched-chair bridge", () => {
    const database = version12();
    seedProject(database, "session_terminal");
    seedRun(database, "session_terminal", "run_terminal");
    seedTerminalChairBridge(database, "session_terminal", "run_terminal");

    expect(applyMigrations(database, migrationsThrough(13)))
      .toEqual({ applied: [13], currentVersion: 13 });
    expect(database.prepare(`
      SELECT source_kind,terminal_kind,terminal_ref,owner_ref
        FROM launched_chair_bridge_retirements
       WHERE project_session_id='session_terminal' AND coordination_run_id='run_terminal'
    `).get()).toEqual({
      source_kind: "migration-backfill",
      terminal_kind: "accepted",
      terminal_ref: JSON.stringify({ kind: "accepted", acceptanceRef: digest }),
      owner_ref: "migration-0013",
    });
    expect(() => database.prepare(`
      UPDATE launched_chair_bridge_retirements SET owner_ref='tampered'
       WHERE project_session_id='session_terminal' AND coordination_run_id='run_terminal'
    `).run()).toThrow(/INVARIANT_launched_chair_bridge_retirement_immutable/u);
    expect(applyMigrations(database, migrationsThrough(13)))
      .toEqual({ applied: [], currentVersion: 13 });
  });

  it("backfills clean abandoned launched-chair retirement proof", () => {
    const database = version12();
    seedProject(database, "session_abandoned");
    seedRun(database, "session_abandoned", "run_abandoned");
    seedTerminalChairBridge(database, "session_abandoned", "run_abandoned", "abandoned");
    expect(applyMigrations(database, migrationsThrough(13))).toMatchObject({ currentVersion: 13 });
    expect(database.prepare(`
      SELECT source_kind,terminal_kind FROM launched_chair_bridge_retirements
       WHERE project_session_id='session_abandoned' AND coordination_run_id='run_abandoned'
    `).get()).toEqual({ source_kind: "migration-backfill", terminal_kind: "accepted" });
  });

  it("refuses to guess retirement proof for a terminal lost launched-chair bridge", () => {
    const database = version12();
    seedProject(database, "session_lost");
    seedRun(database, "session_lost", "run_lost");
    seedTerminalChairBridge(database, "session_lost", "run_lost", "lost");

    expect(() => applyMigrations(database, migrationsThrough(13))).toThrowError(
      expect.objectContaining<Partial<SessionLifecycleRepairPreflightError>>({
        code: "SESSION_LIFECYCLE_REPAIR_PREFLIGHT_FAILED",
      }),
    );
    expect(database.prepare("SELECT version FROM schema_migrations WHERE version=13").get()).toBeUndefined();
  });

  it("rejects a forged retirement sidecar for a live launched-chair bridge", () => {
    const database = version12();
    seedProject(database, "session_live");
    seedRun(database, "session_live", "run_live");
    seedChairBridge(database, "session_live", "run_live");
    expect(applyMigrations(database, migrationsThrough(13)))
      .toEqual({ applied: [13], currentVersion: 13 });

    expect(() => database.prepare(`
      INSERT INTO launched_chair_bridge_retirements(
        project_session_id,coordination_run_id,source_kind,terminal_kind,
        terminal_ref,owner_operator_id,owner_ref,created_at
      ) VALUES (?,?,?,?,?,?,?,?)
    `).run(
      "session_live",
      "run_live",
      "project-session-close",
      "accepted",
      JSON.stringify({ kind: "accepted", acceptanceRef: digest }),
      "forged-operator",
      "forged-command",
      4,
    )).toThrow(/INVARIANT_launched_chair_bridge_retirement_proof/u);
    expect(database.prepare(`
      SELECT 1 FROM launched_chair_bridge_retirements
       WHERE project_session_id='session_live' AND coordination_run_id='run_live'
    `).get()).toBeUndefined();
  });

  it("forbids clearing or deleting a live child bridge without terminal proof", () => {
    const database = version12();
    seedProject(database, "session_live_child");
    seedRun(database, "session_live_child", "run_live_child");
    seedActiveChildBridge(database, "run_live_child");
    expect(applyMigrations(database, migrationsThrough(13))).toMatchObject({ currentVersion: 13 });

    expect(() => database.prepare(`
      UPDATE agent_bridge_state
         SET bridge_state='none',provider_session_ref=NULL,provider_session_generation=NULL,
             capability_hash=NULL,activation_evidence_digest=NULL,revision=revision+1
       WHERE run_id='run_live_child' AND agent_id='child_01'
    `).run()).toThrow(/INVARIANT_agent_bridge_active_retirement_proof/u);
    expect(() => database.prepare(`
      DELETE FROM agent_bridge_state WHERE run_id='run_live_child' AND agent_id='child_01'
    `).run()).toThrow(/INVARIANT_agent_bridge_active_retirement_proof/u);
    expect(database.prepare(`
      SELECT bridge_state,capability_hash FROM agent_bridge_state
       WHERE run_id='run_live_child' AND agent_id='child_01'
    `).get()).toEqual({ bridge_state: "active", capability_hash: "cap-child-run_live_child" });
  });
});

import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseOperatorCapabilityGrant,
  type OperatorId,
  type ProjectId,
  type ProjectSessionCloseRequest,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../../src/core/migrations.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
import { ProjectSessionStore } from "../../../src/project-session/store.ts";
import { NotificationOutbox } from "../../../src/attention/outbox.ts";

const cleanup: Array<() => Promise<void>> = [];
const now = Date.parse("2027-01-01T00:00:00Z");
const digest = `sha256:${"a".repeat(64)}`;

afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).map(async (close) => close()));
});

function operatorContext() {
  return {
    operatorId: "operator_01" as OperatorId,
    projectId: "project_01" as ProjectId,
    projectAuthorityGeneration: 1,
    principalGeneration: 1,
  };
}

function command(commandId: string, expectedRevision: number) {
  return {
    credential: { capabilityId: "cap_session", token: "session-secret" },
    commandId,
    expectedRevision,
    actor: "operator_01",
    provenance: { kind: "console-direct-input", clientId: "console_01", inputEventId: `${commandId}:input` },
    evidenceRefs: [{ path: "launch.json", digest }],
  } as const;
}

async function setup(state: "draft" | "awaiting_acceptance") {
  const root = await mkdtemp(join(tmpdir(), "fabric-nonaccepted-close-"));
  const database = new Database(join(root, "fabric.sqlite3"));
  cleanup.push(async () => {
    if (database.open) database.close();
    await rm(root, { recursive: true, force: true });
  });
  applyMigrations(database);
  database.prepare(`
    INSERT INTO projects(
      project_id,canonical_root,trust_record_digest,revision,authority_generation,created_at,updated_at
    ) VALUES ('project_01',?,?,?,?,?,?)
  `).run(root, digest, 1, 1, now, now);
  database.prepare(`
    INSERT INTO project_sessions(
      project_session_id,project_id,mode,state,revision,generation,authority_ref,
      budget_ref,launch_packet_path,launch_packet_digest,membership_revision,
      origin_kind,origin_operator_id,created_at,updated_at
    ) VALUES ('session_01','project_01','independent',?,?,1,?,
      'budget_01','launch.json',?,1,'operator-launch','operator_01',?,?)
  `).run(state === "awaiting_acceptance" ? "active" : state, 1, digest, digest, now, now);
  if (state === "awaiting_acceptance") {
    database.exec(`
      INSERT INTO runs(
        run_id,chair_agent_id,workspace_root,project_run_directory,created_at,
        project_session_id,lifecycle_state,revision,chair_generation,chair_lease_id,
        authority_ref,budget_ref,dependency_revision,topology_slot
      ) VALUES (
        'run_01','chair_01','${root}',NULL,${now},'session_01','awaiting_acceptance',3,1,
        'chair:run_01:1','${digest}','budget_01',1,NULL
      );
      INSERT INTO authorities(authority_id,run_id,authority_json,authority_hash,created_at)
      VALUES ('authority_01','run_01','{}','authority-hash',${now});
      INSERT INTO agents(run_id,agent_id,authority_id,lifecycle)
      VALUES ('run_01','chair_01','authority_01','ready');
      INSERT INTO capabilities(token_hash,run_id,agent_id,principal_generation,expires_at,revoked_at)
      VALUES ('chair-cap','run_01','chair_01',1,${now + 100_000},NULL);
      INSERT INTO run_chair_leases(
        project_session_id,run_id,lease_id,holder_agent_id,generation,status,updated_at
      ) VALUES ('session_01','run_01','chair:run_01:1','chair_01',1,'frozen',${now});
      INSERT INTO project_session_memberships(
        project_session_id,coordination_run_id,member_kind,member_id,
        required,state,revision,abandoned_reason,created_at,updated_at
      ) VALUES
        ('session_01','run_01','coordination-run','run_01',1,'reconciled',1,NULL,${now},${now}),
        ('session_01','run_01','lease','chair:run_01:1',1,'reconciled',1,NULL,${now},${now}),
        ('session_01','run_01','gate','gate_final',1,'active',1,NULL,${now},${now});
      INSERT INTO scoped_gates(
        gate_id,project_session_id,coordination_run_id,dedupe_key,scope_kind,
        scope_task_id,dependency_revision,blocked_operation_ids_json,
        enforcement_points_json,question,reason,options_json,recommendation,
        consequences_json,evidence_refs_json,created_by_ref,expected_approver_ref,
        status,human_required,revision,created_at,updated_at
      ) VALUES (
        'gate_final','session_01','run_01','final-close','run',NULL,1,
        '["fabric.v1.project-session.close"]','["operation"]','Accept?','Final close',
        '["approve","reject"]','approve','["Close"]',
        '[{"path":"launch.json","digest":"${digest}"}]',
        'operator:operator_01','authenticated-human-operator','pending',1,1,${now},${now}
      );
      INSERT INTO scoped_gate_operations(gate_id,operation_id)
      VALUES ('gate_final','fabric.v1.project-session.close');
    `);
    const notifications = new NotificationOutbox({ database, clock: () => now });
    const attention = notifications.upsertAttention({
      producerId: "operator:operator_01",
      projectId: "project_01",
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      principalGeneration: 1,
    }, {
      dedupeKey: "scoped-gate:gate_final",
      kind: "consequential-gate",
      severity: "critical",
      payload: {
        gateId: "gate_final",
        title: "Accept?",
        summary: "Final close",
        priority: "critical-path",
        duplicateCount: 1,
      },
    });
    notifications.enqueue({
      producerId: "operator:operator_01",
      projectId: "project_01",
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      principalGeneration: 1,
    }, {
      itemId: attention.itemId,
      expectedItemRevision: attention.revision,
      targetIntegration: "native-desktop",
    });
    database.prepare(`
      UPDATE scoped_gates
         SET status='approved',resolved_by_operator_id='operator_01',
             resolution_json='{"kind":"typed-console","confirmationCommandId":"seed-approval"}',
             revision=2
       WHERE gate_id='gate_final'
    `).run();
    database.prepare(`
      UPDATE project_session_memberships SET state='reconciled',revision=2
       WHERE project_session_id='session_01' AND member_kind='gate'
    `).run();
    database.prepare(`
      UPDATE project_sessions SET state='awaiting_acceptance',revision=revision+1
       WHERE project_session_id='session_01' AND state='active'
    `).run();
  }
  const operatorStore = new OperatorStore({ database, clock: () => now });
  operatorStore.registerPrincipal({
    operatorId: "operator_01",
    projectId: "project_01",
    authenticatedSubjectHash: "subject-hash",
    projectAuthorityGeneration: 1,
  });
  operatorStore.issueCapability(parseOperatorCapabilityGrant({
    capabilityId: "cap_session",
    operatorId: "operator_01",
    projectId: "project_01",
    projectAuthorityGeneration: 1,
    principalGeneration: 1,
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2099-01-01T00:00:00Z",
    status: "active",
    kind: "session",
    projectSessionId: "session_01",
    sessionGeneration: 1,
    actions: ["read", "decide"],
  }), "session-secret");
  return { database, operatorStore };
}

describe("cancelled and failed project-session close", () => {
  it("owns prelaunch cancellation and rolls back the complete terminal transaction on crash", async () => {
    const { database, operatorStore } = await setup("draft");
    const crashing = new ProjectSessionStore({
      database,
      operatorStore,
      clock: () => now + 1,
      fault: (label) => {
        if (label === "session:close:after-bridges") throw new Error("terminal crash");
      },
    });
    expect(() => crashing.closeProjectSession(operatorContext(), {
      command: command("cancel_draft_crash", 1),
      projectSessionId: "session_01",
      expectedGeneration: 1,
      terminalPath: { kind: "cancelled", reason: "operator cancelled before launch" },
    } as unknown as ProjectSessionCloseRequest)).toThrow("terminal crash");
    expect(database.prepare(`
      SELECT state,revision,terminal_path_json FROM project_sessions WHERE project_session_id='session_01'
    `).get()).toEqual({ state: "draft", revision: 1, terminal_path_json: null });

    const sessions = new ProjectSessionStore({ database, operatorStore, clock: () => now + 2 });
    expect(sessions.closeProjectSession(operatorContext(), {
      command: command("cancel_draft", 1),
      projectSessionId: "session_01",
      expectedGeneration: 1,
      terminalPath: { kind: "cancelled", reason: "operator cancelled before launch" },
    } as unknown as ProjectSessionCloseRequest)).toMatchObject({
      state: "closed",
      revision: 2,
      terminalPath: { kind: "cancelled", reason: "operator cancelled before launch" },
    });
  });

  it("supersedes an awaiting-acceptance cycle before failed close and leaves no live run", async () => {
    const { database, operatorStore } = await setup("awaiting_acceptance");
    const crashing = new ProjectSessionStore({
      database,
      operatorStore,
      clock: () => now + 1,
      fault: (label) => {
        if (label === "session:close:after-runs") throw new Error("failed-close crash");
      },
    });
    const request = {
      command: command("fail_awaiting", 2),
      projectSessionId: "session_01",
      expectedGeneration: 1,
      terminalPath: { kind: "failed", reason: "acceptance could not complete", failureRef: digest },
    } as unknown as ProjectSessionCloseRequest;
    database.prepare(`
      INSERT INTO operator_effect_custody(
        custody_id,operator_id,project_id,project_session_id,principal_generation,
        command_id,operation,intent_digest,before_state_digest,intent_json,state,
        created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      "git-conflict-custody",
      "operator_01",
      "project_01",
      "session_01",
      1,
      "git-conflict-command",
      "git-mutation",
      digest,
      digest,
      JSON.stringify({ kind: "git-mutation" }),
      "conflict",
      now,
      now,
    );
    expect(() => crashing.closeProjectSession(operatorContext(), request)).toThrowError(
      expect.objectContaining({ code: "BARRIER_PRECONDITION_FAILED" }),
    );
    database.prepare(`
      UPDATE operator_effect_custody SET state='no-effect',updated_at=?
       WHERE custody_id='git-conflict-custody' AND state='conflict'
    `).run(now + 1);
    expect(() => crashing.closeProjectSession(operatorContext(), request)).toThrow("failed-close crash");
    expect(database.prepare("SELECT status,revision FROM scoped_gates WHERE gate_id='gate_final'").get())
      .toEqual({ status: "approved", revision: 2 });
    expect(database.prepare(`
      SELECT state,revision FROM project_session_memberships
       WHERE project_session_id='session_01' AND member_kind='gate'
    `).get()).toEqual({ state: "reconciled", revision: 2 });
    expect(database.prepare("SELECT lifecycle_state,revision FROM runs WHERE run_id='run_01'").get())
      .toEqual({ lifecycle_state: "awaiting_acceptance", revision: 3 });

    const sessions = new ProjectSessionStore({ database, operatorStore, clock: () => now + 2 });
    expect(sessions.closeProjectSession(operatorContext(), request)).toMatchObject({
      state: "closed",
      revision: 3,
      membershipRevision: 2,
      terminalPath: { kind: "failed", reason: "acceptance could not complete", failureRef: digest },
    });
    expect(database.prepare("SELECT status,revision FROM scoped_gates WHERE gate_id='gate_final'").get())
      .toEqual({ status: "superseded", revision: 3 });
    expect(database.prepare(`
      SELECT state,revision,abandoned_reason FROM project_session_memberships
       WHERE project_session_id='session_01' AND member_kind='gate'
    `).get()).toEqual({
      state: "reconciled",
      revision: 3,
      abandoned_reason: null,
    });
    expect(database.prepare("SELECT lifecycle_state,revision FROM runs WHERE run_id='run_01'").get())
      .toEqual({ lifecycle_state: "closed", revision: 4 });
    expect(database.prepare(`
      SELECT COUNT(*) AS live FROM runs
       WHERE project_session_id='session_01' AND lifecycle_state NOT IN ('closed','cancelled','launch_failed')
    `).get()).toEqual({ live: 0 });
    expect(database.prepare("SELECT status FROM run_chair_leases WHERE lease_id='chair:run_01:1'").get())
      .toEqual({ status: "revoked" });
    expect(database.prepare("SELECT revoked_at FROM capabilities WHERE token_hash='chair-cap'").get())
      .toEqual({ revoked_at: now + 2 });
    expect(database.prepare("SELECT lifecycle FROM agents WHERE run_id='run_01' AND agent_id='chair_01'").get())
      .toEqual({ lifecycle: "archived" });
  });
});

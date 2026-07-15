import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import { ROOT_AUTHORITY } from "../../support/stage1-fixture.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.allSettled(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

describe("operator task admission", () => {
  it("blocks only the exact scoped barrier bound to an unresolved gate", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-scoped-barrier-admission-"));
    roots.push(root);
    const databasePath = join(root, "fabric.sqlite3");
    const fabric = await openFabric({ databasePath, workspaceRoots: [root], capabilityKey: "scoped-barrier-key" });
    try {
      const run = await createCurrentSessionRun({ databasePath, workspaceRoot: root, runId: "run_barrier_gate", chair: { agentId: "chair", authority: ROOT_AUTHORITY } });
      const chair = fabric.connect(run.chairCapability);
      const database = new Database(databasePath);
      try {
        const identity = database.prepare(`
          SELECT project_session_id, dependency_revision FROM runs WHERE run_id='run_barrier_gate'
        `).get() as { project_session_id: string; dependency_revision: number };
        database.prepare(`
          INSERT INTO scoped_gates(
            gate_id, project_session_id, coordination_run_id, dedupe_key, scope_kind,
            scope_task_id, dependency_revision, blocked_operation_ids_json,
            enforcement_points_json, question, reason, options_json, recommendation,
            consequences_json, evidence_refs_json, created_by_ref, expected_approver_ref,
            status, human_required, revision, created_at, updated_at
          ) VALUES ('gate_stage_barrier', ?, 'run_barrier_gate', 'gate:stage-barrier', 'run',
                    NULL, ?, '[]', '["scoped-barrier"]', 'Close implementation?',
                    'Human decision required', '["approve","defer"]', 'defer', '[]', '[]',
                    'agent:chair', 'authenticated-human-operator', 'pending', 1, 1, 1, 1)
        `).run(identity.project_session_id, identity.dependency_revision);
        database.prepare(`
          INSERT INTO scoped_gate_barriers(gate_id, barrier_id)
          VALUES ('gate_stage_barrier', 'run_barrier_gate:stage:implementation')
        `).run();
      } finally {
        database.close();
      }

      await expect(chair.closeBarrier({ scope: "run", commandId: "close_unrelated_run_barrier" }))
        .rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(chair.closeBarrier({
        scope: "stage",
        stageId: "implementation",
        commandId: "close_gated_stage_barrier",
      })).rejects.toMatchObject({ code: "GATE_BLOCKED" });
    } finally {
      await fabric.close();
    }
  });

  it("enforces task-readiness and named-operation gates without blocking a sibling", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-scoped-gate-admission-"));
    roots.push(root);
    const databasePath = join(root, "fabric.sqlite3");
    const fabric = await openFabric({ databasePath, workspaceRoots: [root], capabilityKey: "scoped-gate-admission-key" });
    try {
      const run = await createCurrentSessionRun({ databasePath, workspaceRoot: root, runId: "run_gate_admission", chair: { agentId: "chair", authority: ROOT_AUTHORITY } });
      const chair = fabric.connect(run.chairCapability);
      const delegated = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...ROOT_AUTHORITY, sourcePaths: ["src/worker"], budget: { turns: 5, "cost:USD": 2 } },
        commandId: "delegate_gate_worker",
      });
      const registration = await chair.registerAgent({
        agentId: "worker",
        authorityId: delegated.authorityId,
        adapterId: "missing",
        providerSessionRef: "provider_gate_worker",
      });
      const worker = fabric.connect(registration.capability);
      for (const taskId of ["task_gate_claim", "task_gate_operation", "task_gate_sibling"]) {
        await chair.createTask({
          taskId,
          authorityId: delegated.authorityId,
          eligibleAgentIds: ["worker"],
          objective: `Exercise ${taskId}`,
          baseRevision: "base_gate",
          commandId: `create_${taskId}`,
        });
      }
      await worker.claimTask({ taskId: "task_gate_operation", expectedRevision: 1, commandId: "claim_gate_operation" });

      const database = new Database(databasePath);
      try {
        const identity = database.prepare(`
          SELECT project_session_id, dependency_revision FROM runs WHERE run_id='run_gate_admission'
        `).get() as { project_session_id: string; dependency_revision: number };
        const insertGate = database.prepare(`
          INSERT INTO scoped_gates(
            gate_id, project_session_id, coordination_run_id, dedupe_key, scope_kind,
            scope_task_id, dependency_revision, blocked_operation_ids_json,
            enforcement_points_json, question, reason, options_json, recommendation,
            consequences_json, evidence_refs_json, created_by_ref, expected_approver_ref,
            status, human_required, revision, created_at, updated_at
          ) VALUES (?, ?, 'run_gate_admission', ?, 'task', ?, ?, ?, ?, 'Proceed?',
                    'Human decision required', '["approve","defer"]', 'defer', '[]', '[]',
                    'agent:chair', 'authenticated-human-operator', 'pending', 1, 1, 1, 1)
        `);
        insertGate.run(
          "gate_claim",
          identity.project_session_id,
          "gate:claim",
          "task_gate_claim",
          identity.dependency_revision,
          "[]",
          '["task-readiness"]',
        );
        insertGate.run(
          "gate_operation",
          identity.project_session_id,
          "gate:operation",
          "task_gate_operation",
          identity.dependency_revision,
          '["fabric.v1.provider-action.dispatch"]',
          '["operation"]',
        );
        const bindTask = database.prepare(`
          INSERT INTO scoped_gate_tasks(
            gate_id, project_session_id, run_id, task_id, binding_kind, bound_dependency_revision
          ) VALUES (?, ?, 'run_gate_admission', ?, 'direct', ?)
        `);
        bindTask.run("gate_claim", identity.project_session_id, "task_gate_claim", identity.dependency_revision);
        bindTask.run("gate_operation", identity.project_session_id, "task_gate_operation", identity.dependency_revision);
        database.prepare(`
          INSERT INTO scoped_gate_operations(gate_id, operation_id)
          VALUES ('gate_operation', 'fabric.v1.provider-action.dispatch')
        `).run();
      } finally {
        database.close();
      }

      await expect(worker.claimTask({
        taskId: "task_gate_claim",
        expectedRevision: 1,
        commandId: "claim_while_gated",
      })).rejects.toMatchObject({ code: "GATE_BLOCKED" });
      await expect(worker.claimTask({
        taskId: "task_gate_sibling",
        expectedRevision: 1,
        commandId: "claim_ungated_sibling",
      })).resolves.toMatchObject({ state: "active", ownerAgentId: "worker" });
      await expect(chair.dispatchProviderAction({
        adapterId: "missing",
        actionId: "turn_while_gated",
        operation: "send_turn",
        payload: { agentId: "worker", taskId: "task_gate_operation", instruction: "bypass" },
        commandId: "turn_while_gated",
      })).rejects.toMatchObject({ code: "GATE_BLOCKED" });
    } finally {
      await fabric.close();
    }
  });

  it("blocks owner completion and unbound work turns while a task is paused", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-operator-task-admission-"));
    roots.push(root);
    const databasePath = join(root, "fabric.sqlite3");
    const fabric = await openFabric({ databasePath, workspaceRoots: [root], capabilityKey: "operator-task-admission-key" });
    try {
      const run = await createCurrentSessionRun({ databasePath, workspaceRoot: root, runId: "run_admission", chair: { agentId: "chair", authority: ROOT_AUTHORITY } });
      const chair = fabric.connect(run.chairCapability);
      const delegated = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...ROOT_AUTHORITY, sourcePaths: ["src/worker"], budget: { turns: 5, "cost:USD": 2 } },
        commandId: "delegate_worker",
      });
      const registration = await chair.registerAgent({
        agentId: "worker",
        authorityId: delegated.authorityId,
        adapterId: "missing",
        providerSessionRef: "provider_worker",
      });
      const worker = fabric.connect(registration.capability);
      await chair.createTask({
        taskId: "task_paused",
        authorityId: delegated.authorityId,
        eligibleAgentIds: ["worker"],
        objective: "Prove pause admission",
        baseRevision: "base_01",
        commandId: "create_task_paused",
      });
      const claimed = await worker.claimTask({ taskId: "task_paused", expectedRevision: 1, commandId: "claim_task_paused" });

      const database = new Database(databasePath);
      try {
        const session = database.prepare("SELECT project_session_id FROM runs WHERE run_id='run_admission'")
          .get() as { project_session_id: string };
        database.prepare(`
          INSERT INTO operator_control_fences(
            fence_id, project_session_id, coordination_run_id, task_id, scope_kind,
            target_revision, session_generation, command_id, state, created_at, released_at
          ) VALUES ('fence_task_paused', ?, 'run_admission', 'task_paused', 'task', ?, 1,
                    'pause_task_paused', 'paused', 1, NULL)
        `).run(session.project_session_id, claimed.revision);
      } finally {
        database.close();
      }

      await chair.createTask({
        taskId: "task_ambiguous_binding",
        authorityId: delegated.authorityId,
        eligibleAgentIds: ["worker"],
        participantAgentIds: ["worker"],
        objective: "Force an explicit task binding",
        baseRevision: "base_02",
        commandId: "create_task_ambiguous_binding",
      });

      await expect(worker.updateTask({
        taskId: "task_paused",
        expectedRevision: claimed.revision,
        state: "complete",
        commandId: "complete_while_paused",
      })).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
      await expect(worker.acquireWriteLease({
        scope: ["src/worker"],
        ttlMs: 10_000,
        commandId: "lease_without_task_binding",
      })).rejects.toThrow(/exact task ID/u);
      await expect(worker.acquireWriteLease({
        scope: ["src/worker"],
        ttlMs: 10_000,
        taskId: "task_paused",
        commandId: "lease_while_paused",
      })).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
      await expect(chair.dispatchProviderAction({
        adapterId: "missing",
        actionId: "turn_without_task",
        operation: "send_turn",
        payload: { agentId: "worker", instruction: "bypass" },
        commandId: "turn_without_task",
      })).rejects.toThrow(/exact task ID/u);
    } finally {
      await fabric.close();
    }
  });

  it("blocks register and spawn ingress in an exceptional project state", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-operator-state-admission-"));
    roots.push(root);
    const databasePath = join(root, "fabric.sqlite3");
    const fabric = await openFabric({ databasePath, workspaceRoots: [root], capabilityKey: "operator-state-admission-key" });
    try {
      const run = await createCurrentSessionRun({ databasePath, workspaceRoot: root, runId: "run_exceptional", chair: { agentId: "chair", authority: ROOT_AUTHORITY } });
      const chair = fabric.connect(run.chairCapability);
      const delegated = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...ROOT_AUTHORITY, sourcePaths: ["src/blocked"], budget: { turns: 5, "cost:USD": 2 } },
        commandId: "delegate_blocked",
      });
      const database = new Database(databasePath);
      try {
        database.prepare(`
          UPDATE project_sessions SET state='quarantined', revision=revision+1
           WHERE project_session_id=(SELECT project_session_id FROM runs WHERE run_id='run_exceptional')
        `).run();
        database.prepare("UPDATE runs SET lifecycle_state='quarantined', revision=revision+1 WHERE run_id='run_exceptional'").run();
      } finally {
        database.close();
      }

      await expect(chair.registerAgent({ agentId: "blocked", authorityId: delegated.authorityId }))
        .rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
      await expect(chair.spawnAgent({
        agentId: "blocked",
        authorityId: delegated.authorityId,
        adapterId: "missing",
        actionId: "spawn_blocked",
        payload: { model: "none" },
      })).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
    } finally {
      await fabric.close();
    }
  });
});

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../../src/core/migrations.ts";
import {
  assertOperatorTaskRunnable,
  assertRunAcceptingWork,
  createProductionOperatorActionPorts,
} from "../../../src/operator/production-action-ports.ts";

const databases: Database.Database[] = [];
const digest = `sha256:${"a".repeat(64)}`;
const now = Date.parse("2027-01-01T00:00:00Z");

function fixture(adapter: Parameters<typeof createProductionOperatorActionPorts>[0]["adapter"] = {
  capabilities: async () => { throw new Error("idle control must not inspect an adapter"); },
  dispatch: async () => { throw new Error("idle control must not dispatch an adapter effect"); },
  lookup: async () => { throw new Error("idle control must not look up an adapter effect"); },
}): {
  database: Database.Database;
  ports: ReturnType<typeof createProductionOperatorActionPorts>;
} {
  const database = new Database(":memory:");
  databases.push(database);
  applyMigrations(database);
  database.exec(`
    INSERT INTO projects(project_id, canonical_root, trust_record_digest, revision, authority_generation, created_at, updated_at)
    VALUES ('project_01', '/project/one', '${digest}', 1, 1, ${now}, ${now});
    INSERT INTO project_sessions(
      project_session_id, project_id, mode, state, revision, generation, authority_ref,
      budget_ref, launch_packet_path, launch_packet_digest, membership_revision,
      origin_kind, origin_operator_id, created_at, updated_at
    ) VALUES (
      'session_01', 'project_01', 'coordinated', 'active', 2, 1, '${digest}',
      'budget_01', 'launch.json', '${digest}', 1, 'operator-launch', 'operator_01', ${now}, ${now}
    );
    INSERT INTO runs(
      run_id, chair_agent_id, workspace_root, project_run_directory, created_at,
      project_session_id, lifecycle_state, revision, chair_generation, chair_lease_id,
      authority_ref, budget_ref, dependency_revision, topology_slot
    ) VALUES (
      'run_01', 'chair_01', '/project/one', '.agent-run/AFAB-001', ${now},
      'session_01', 'active', 4, 1, 'chair:run_01:1', '${digest}', 'budget_01', 1, 1
    );
    INSERT INTO authorities(authority_id, run_id, authority_json, authority_hash, created_at)
    VALUES ('authority_01', 'run_01', '{}', '${"b".repeat(64)}', ${now});
    INSERT INTO agents(run_id, agent_id, authority_id, provider_session_ref, lifecycle)
    VALUES ('run_01', 'chair_01', 'authority_01', 'provider_session_01', 'ready');
    INSERT INTO provider_state(run_id, agent_id, provider_session_generation, context_revision)
    VALUES ('run_01', 'chair_01', 2, 'context_01');
    INSERT INTO agent_adapter_bindings(run_id, agent_id, adapter_id, bound_at)
    VALUES ('run_01', 'chair_01', 'fake', ${now});
    INSERT INTO tasks(
      run_id, task_id, authority_id, objective, base_revision, state,
      owner_agent_id, revision, owner_lease_generation, created_by
    ) VALUES (
      'run_01', 'task_01', 'authority_01', 'Implement lifecycle', 'base_01', 'active',
      'chair_01', 3, 1, 'chair_01'
    );
  `);
  return {
    database,
    ports: createProductionOperatorActionPorts({
      database,
      clock: () => now,
      adapter,
    }),
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("production operator lifecycle ports", () => {
  it("pauses and resumes an idle exact-revision task without provider I/O", async () => {
    const { database, ports } = fixture();
    database.exec(`
      INSERT INTO tasks(
        run_id, task_id, authority_id, objective, base_revision, state,
        owner_agent_id, revision, owner_lease_generation, created_by
      ) VALUES (
        'run_01', 'task_02', 'authority_01', 'Unaffected sibling', 'base_02', 'active',
        'chair_01', 7, 1, 'chair_01'
      );
    `);
    const target = {
      kind: "task" as const,
      projectSessionId: "session_01" as never,
      coordinationRunId: "run_01" as never,
      taskId: "task_01" as never,
      expectedRevision: 3,
    };
    const pause = { kind: "control" as const, action: "pause" as const, target };

    await expect(ports.statePort.read(pause)).resolves.toMatchObject({
      kind: "control",
      revision: 3,
      lifecycleState: "active",
      eligibleActions: expect.arrayContaining(["pause", "cancel"]),
    });
    await expect(ports.effectPort.dispatch({
      commandId: "pause_01",
      intent: pause,
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).resolves.toMatchObject({
      status: "committed",
      afterState: { lifecycleState: "paused" },
    });
    expect(database.prepare("SELECT lifecycle FROM agents WHERE run_id='run_01' AND agent_id='chair_01'").get())
      .toEqual({ lifecycle: "ready" });
    expect(database.prepare("SELECT task_id, state FROM operator_control_fences").all())
      .toEqual([{ task_id: "task_01", state: "paused" }]);
    expect(() => assertOperatorTaskRunnable(database, "run_01", "task_01"))
      .toThrow(/task is paused/u);
    expect(() => assertOperatorTaskRunnable(database, "run_01", "task_02"))
      .not.toThrow();
    expect(() => assertRunAcceptingWork(database, "run_01")).not.toThrow();

    const resume = { kind: "control" as const, action: "resume" as const, target };
    await expect(ports.statePort.read(resume)).resolves.toMatchObject({
      kind: "control",
      revision: 3,
      lifecycleState: "paused",
      eligibleActions: expect.arrayContaining(["resume", "cancel"]),
    });
    await expect(ports.effectPort.dispatch({
      commandId: "resume_01",
      intent: resume,
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).resolves.toMatchObject({
      status: "committed",
      afterState: { lifecycleState: "active" },
    });
    expect(database.prepare("SELECT lifecycle FROM agents WHERE run_id='run_01' AND agent_id='chair_01'").get())
      .toEqual({ lifecycle: "ready" });
    expect(database.prepare("SELECT task_id, state FROM operator_control_fences").all())
      .toEqual([{ task_id: "task_01", state: "released" }]);
  });

  it("looks up an ambiguous pause action without replaying provider I/O", async () => {
    let dispatches = 0;
    let lookups = 0;
    let providerActionId = "";
    const { database, ports } = fixture({
      capabilities: async () => ({ actionJournal: true, operations: ["interrupt", "lookup_action"] }),
      dispatch: async (_adapterId, input) => {
        dispatches += 1;
        providerActionId = input.actionId;
        throw new Error("connection lost after dispatch");
      },
      lookup: async (_adapterId, actionId) => {
        lookups += 1;
        expect(actionId).toBe(providerActionId);
        return {
          actionId,
          operation: "interrupt",
          status: "terminal",
          history: ["prepared", "dispatched", "accepted", "terminal"],
          executionCount: 1,
          effectCount: 1,
          result: { interrupted: true },
        };
      },
    });
    database.exec(`
      INSERT INTO provider_actions(
        run_id, action_id, adapter_id, operation, target_agent_id,
        provider_session_generation, turn_lease_generation, identity_hash,
        payload_hash, payload_json, status, history_json, execution_count,
        effect_count, idempotency_proven, updated_at
      ) VALUES (
        'run_01', 'turn_01', 'fake', 'send_turn', 'chair_01', 2, 1,
        '${"c".repeat(64)}', '${"d".repeat(64)}', '{"taskId":"task_01"}', 'dispatched',
        '["prepared","dispatched"]', 1, 0, 0, ${now}
      );
      INSERT INTO provider_session_turn_leases(
        run_id, agent_id, provider_session_generation, turn_lease_generation,
        action_id, status, created_at, updated_at
      ) VALUES ('run_01', 'chair_01', 2, 1, 'turn_01', 'active', ${now}, ${now});
    `);
    const pause = {
      kind: "control" as const,
      action: "pause" as const,
      target: {
        kind: "task" as const,
        projectSessionId: "session_01" as never,
        coordinationRunId: "run_01" as never,
        taskId: "task_01" as never,
        expectedRevision: 3,
      },
    };
    const request = {
      commandId: "pause_ambiguous_01",
      intent: pause,
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    };

    const ambiguous = await ports.effectPort.dispatch(request);
    expect(ambiguous).toMatchObject({ status: "ambiguous" });
    if (ambiguous.status !== "ambiguous" || !("effectRef" in ambiguous) || ambiguous.effectRef === undefined) {
      throw new Error("expected an effect reference");
    }
    expect(dispatches).toBe(1);

    await expect(ports.effectPort.dispatch(request)).resolves.toEqual(ambiguous);
    expect(dispatches).toBe(1);

    await expect(ports.effectPort.observe({ ...request, attemptGeneration: 2, effectRef: ambiguous.effectRef }))
      .resolves.toMatchObject({ status: "committed", afterState: { lifecycleState: "paused" } });
    expect(dispatches).toBe(1);
    expect(lookups).toBe(1);
    expect(database.prepare("SELECT task_id, state FROM operator_control_fences").all())
      .toEqual([{ task_id: "task_01", state: "paused" }]);
  });

  it("does not interrupt a shared owner's unrelated active turn", async () => {
    let adapterCalls = 0;
    const { database, ports } = fixture({
      capabilities: async () => { adapterCalls += 1; return {}; },
      dispatch: async () => { adapterCalls += 1; return {}; },
      lookup: async () => { adapterCalls += 1; return {}; },
    });
    database.exec(`
      INSERT INTO tasks(
        run_id, task_id, authority_id, objective, base_revision, state,
        owner_agent_id, revision, owner_lease_generation, created_by
      ) VALUES (
        'run_01', 'task_02', 'authority_01', 'Unrelated live turn', 'base_02', 'active',
        'chair_01', 7, 1, 'chair_01'
      );
      INSERT INTO provider_actions(
        run_id, action_id, adapter_id, operation, target_agent_id,
        provider_session_generation, turn_lease_generation, identity_hash,
        payload_hash, payload_json, status, history_json, execution_count,
        effect_count, idempotency_proven, updated_at
      ) VALUES (
        'run_01', 'turn_sibling', 'fake', 'send_turn', 'chair_01', 2, 1,
        '${"c".repeat(64)}', '${"d".repeat(64)}', '{"taskId":"task_02"}', 'dispatched',
        '["prepared","dispatched"]', 1, 0, 0, ${now}
      );
      INSERT INTO provider_session_turn_leases(
        run_id, agent_id, provider_session_generation, turn_lease_generation,
        action_id, status, created_at, updated_at
      ) VALUES ('run_01', 'chair_01', 2, 1, 'turn_sibling', 'active', ${now}, ${now});
    `);
    const pause = {
      kind: "control" as const,
      action: "pause" as const,
      target: {
        kind: "task" as const,
        projectSessionId: "session_01" as never,
        coordinationRunId: "run_01" as never,
        taskId: "task_01" as never,
        expectedRevision: 3,
      },
    };

    await expect(ports.effectPort.dispatch({
      commandId: "pause_scoped_01",
      intent: pause,
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).resolves.toMatchObject({ status: "committed", afterState: { lifecycleState: "paused" } });
    expect(adapterCalls).toBe(0);
    expect(database.prepare("SELECT status FROM provider_session_turn_leases WHERE action_id='turn_sibling'").get())
      .toEqual({ status: "active" });
    expect(database.prepare("SELECT lifecycle FROM agents WHERE run_id='run_01' AND agent_id='chair_01'").get())
      .toEqual({ lifecycle: "ready" });
  });

  it("rejects a multi-agent pause before persisting any action when one adapter lacks custody", async () => {
    let dispatches = 0;
    const { database, ports } = fixture({
      capabilities: async (adapterId) => ({
        actionJournal: true,
        operations: adapterId === "fake_bad" ? ["lookup_action"] : ["interrupt", "lookup_action"],
      }),
      dispatch: async () => { dispatches += 1; return {}; },
      lookup: async () => { throw new Error("rejected preflight must not perform lookup"); },
    });
    database.exec(`
      INSERT INTO agents(run_id, agent_id, authority_id, provider_session_ref, lifecycle)
      VALUES ('run_01', 'worker_02', 'authority_01', 'provider_session_02', 'ready');
      INSERT INTO provider_state(run_id, agent_id, provider_session_generation, context_revision)
      VALUES ('run_01', 'worker_02', 3, 'context_02');
      INSERT INTO agent_adapter_bindings(run_id, agent_id, adapter_id, bound_at)
      VALUES ('run_01', 'worker_02', 'fake_bad', ${now});
      INSERT INTO tasks(
        run_id, task_id, authority_id, objective, base_revision, state,
        owner_agent_id, revision, owner_lease_generation, created_by
      ) VALUES (
        'run_01', 'task_02', 'authority_01', 'Second live turn', 'base_02', 'active',
        'worker_02', 7, 1, 'chair_01'
      );
      INSERT INTO provider_actions(
        run_id, action_id, adapter_id, operation, target_agent_id,
        provider_session_generation, turn_lease_generation, identity_hash,
        payload_hash, payload_json, status, history_json, execution_count,
        effect_count, idempotency_proven, updated_at
      ) VALUES
        ('run_01', 'turn_chair', 'fake', 'send_turn', 'chair_01', 2, 1,
          '${"c".repeat(64)}', '${"d".repeat(64)}', '{"taskId":"task_01"}', 'accepted',
          '["prepared","dispatched","accepted"]', 1, 0, 0, ${now}),
        ('run_01', 'turn_worker', 'fake_bad', 'send_turn', 'worker_02', 3, 1,
          '${"e".repeat(64)}', '${"f".repeat(64)}', '{"taskId":"task_02"}', 'accepted',
          '["prepared","dispatched","accepted"]', 1, 0, 0, ${now});
      INSERT INTO provider_session_turn_leases(
        run_id, agent_id, provider_session_generation, turn_lease_generation,
        action_id, status, created_at, updated_at
      ) VALUES
        ('run_01', 'chair_01', 2, 1, 'turn_chair', 'active', ${now}, ${now}),
        ('run_01', 'worker_02', 3, 1, 'turn_worker', 'active', ${now}, ${now});
    `);

    await expect(ports.effectPort.dispatch({
      commandId: "pause_run_preflight_01",
      intent: {
        kind: "control",
        action: "pause",
        target: {
          kind: "run",
          projectSessionId: "session_01" as never,
          coordinationRunId: "run_01" as never,
          expectedRevision: 4,
        },
      },
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).resolves.toMatchObject({ status: "rejected" });
    expect(dispatches).toBe(0);
    expect(database.prepare("SELECT COUNT(*) AS count FROM provider_actions WHERE operation='interrupt'").get())
      .toEqual({ count: 0 });
  });

  it("does not claim pause from a terminal adapter row with the wrong operation or replay count", async () => {
    let providerActionId = "";
    const { database, ports } = fixture({
      capabilities: async () => ({ actionJournal: true, operations: ["interrupt", "lookup_action"] }),
      dispatch: async (_adapterId, input) => {
        providerActionId = input.actionId;
        throw new Error("ambiguous dispatch");
      },
      lookup: async () => ({
        actionId: providerActionId,
        operation: "steer",
        status: "terminal",
        history: ["prepared", "dispatched", "terminal"],
        executionCount: 2,
        effectCount: 1,
        result: { interrupted: true },
      }),
    });
    database.exec(`
      INSERT INTO provider_actions(
        run_id, action_id, adapter_id, operation, target_agent_id,
        provider_session_generation, turn_lease_generation, identity_hash,
        payload_hash, payload_json, status, history_json, execution_count,
        effect_count, idempotency_proven, updated_at
      ) VALUES (
        'run_01', 'turn_unproved', 'fake', 'send_turn', 'chair_01', 2, 1,
        '${"c".repeat(64)}', '${"d".repeat(64)}', '{"taskId":"task_01"}', 'dispatched',
        '["prepared","dispatched"]', 1, 0, 0, ${now}
      );
      INSERT INTO provider_session_turn_leases(
        run_id, agent_id, provider_session_generation, turn_lease_generation,
        action_id, status, created_at, updated_at
      ) VALUES ('run_01', 'chair_01', 2, 1, 'turn_unproved', 'active', ${now}, ${now});
    `);
    const request = {
      commandId: "pause_unproved_01",
      intent: {
        kind: "control" as const,
        action: "pause" as const,
        target: {
          kind: "task" as const,
          projectSessionId: "session_01" as never,
          coordinationRunId: "run_01" as never,
          taskId: "task_01" as never,
          expectedRevision: 3,
        },
      },
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    };
    const ambiguous = await ports.effectPort.dispatch(request);
    if (ambiguous.status !== "ambiguous" || !("effectRef" in ambiguous) || ambiguous.effectRef === undefined) {
      throw new Error("expected ambiguous control effect");
    }

    await expect(ports.effectPort.observe({ ...request, attemptGeneration: 2, effectRef: ambiguous.effectRef }))
      .resolves.toMatchObject({ status: "ambiguous" });
    expect(database.prepare("SELECT COUNT(*) AS count FROM operator_control_fences").get()).toEqual({ count: 0 });
  });

  it("steers only an exact task-attributed active turn and requires a proved adapter effect", async () => {
    const dispatched: Array<Record<string, unknown>> = [];
    const { database, ports } = fixture({
      capabilities: async () => ({ actionJournal: true, operations: ["steer", "lookup_action"] }),
      dispatch: async (_adapterId, input) => {
        dispatched.push(input.payload);
        return {
          actionId: input.actionId,
          operation: "steer",
          status: "terminal",
          history: ["prepared", "dispatched", "accepted", "terminal"],
          executionCount: 1,
          effectCount: 1,
          result: { steered: true },
        };
      },
      lookup: async () => { throw new Error("terminal steer must not be looked up"); },
    });
    database.exec(`
      INSERT INTO provider_actions(
        run_id, action_id, adapter_id, operation, target_agent_id,
        provider_session_generation, turn_lease_generation, identity_hash,
        payload_hash, payload_json, status, history_json, execution_count,
        effect_count, idempotency_proven, result_json, updated_at
      ) VALUES (
        'run_01', 'turn_steer', 'fake', 'send_turn', 'chair_01', 2, 1,
        '${"c".repeat(64)}', '${"d".repeat(64)}', '{"taskId":"task_01"}', 'accepted',
        '["prepared","dispatched","accepted"]', 1, 1, 0, '{"turnId":"turn_provider_01"}', ${now}
      );
      INSERT INTO provider_session_turn_leases(
        run_id, agent_id, provider_session_generation, turn_lease_generation,
        action_id, status, created_at, updated_at
      ) VALUES ('run_01', 'chair_01', 2, 1, 'turn_steer', 'active', ${now}, ${now});
    `);

    await expect(ports.effectPort.dispatch({
      commandId: "steer_01",
      intent: {
        kind: "control",
        action: "steer",
        target: {
          kind: "task",
          projectSessionId: "session_01" as never,
          coordinationRunId: "run_01" as never,
          taskId: "task_01" as never,
          expectedRevision: 3,
        },
        instruction: "Return only the bounded evidence.",
        evidenceRefs: [],
      },
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).resolves.toMatchObject({ status: "committed", afterState: { steered: true } });
    expect(dispatched).toEqual([expect.objectContaining({
      sourceActionId: "turn_steer",
      turnId: "turn_provider_01",
      expectedTurnId: "turn_provider_01",
      instruction: "Return only the bounded evidence.",
      providerSessionGeneration: 2,
      turnLeaseGeneration: 1,
    })]);
  });

  it("cancels only the exact task scope and advances its revision", async () => {
    const { database, ports } = fixture();
    database.exec(`
      INSERT INTO tasks(
        run_id, task_id, authority_id, objective, base_revision, state,
        owner_agent_id, revision, owner_lease_generation, created_by
      ) VALUES (
        'run_01', 'task_02', 'authority_01', 'Unaffected sibling', 'base_02', 'active',
        'chair_01', 7, 1, 'chair_01'
      );
      INSERT INTO task_owner_leases(
        project_session_id, run_id, task_id, lease_id, holder_agent_id,
        generation, status, updated_at
      ) VALUES (
        'session_01', 'run_01', 'task_01', 'task-owner:run_01:task_01:1',
        'chair_01', 1, 'active', ${now}
      ), (
        'session_01', 'run_01', 'task_02', 'task-owner:run_01:task_02:1',
        'chair_01', 1, 'active', ${now}
      );
      INSERT INTO project_session_memberships(
        project_session_id, coordination_run_id, member_kind, member_id,
        required, state, revision, created_at, updated_at
      ) VALUES (
        'session_01', 'run_01', 'task', 'task_01',
        1, 'active', 1, ${now}, ${now}
      ), (
        'session_01', 'run_01', 'task', 'task_02',
        1, 'active', 1, ${now}, ${now}
      );
    `);
    const cancel = {
      kind: "control" as const,
      action: "cancel" as const,
      target: {
        kind: "task" as const,
        projectSessionId: "session_01" as never,
        coordinationRunId: "run_01" as never,
        taskId: "task_01" as never,
        expectedRevision: 3,
      },
      reason: "Operator cancelled the bounded task",
    };

    await expect(ports.effectPort.dispatch({
      commandId: "cancel_01",
      intent: cancel,
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).resolves.toMatchObject({
      status: "committed",
      afterState: { lifecycleState: "cancelled", cancelledTasks: 1 },
    });
    expect(database.prepare("SELECT state, revision FROM tasks WHERE run_id='run_01' AND task_id='task_01'").get())
      .toEqual({ state: "cancelled", revision: 4 });
    expect(database.prepare("SELECT state, revision FROM tasks WHERE run_id='run_01' AND task_id='task_02'").get())
      .toEqual({ state: "active", revision: 7 });
    expect(database.prepare("SELECT lifecycle FROM agents WHERE run_id='run_01' AND agent_id='chair_01'").get())
      .toEqual({ lifecycle: "ready" });
    expect(database.prepare(`
      SELECT status FROM task_owner_leases WHERE lease_id='task-owner:run_01:task_01:1'
    `).get()).toEqual({ status: "released" });
    expect(database.prepare(`
      SELECT status FROM task_owner_leases WHERE lease_id='task-owner:run_01:task_02:1'
    `).get()).toEqual({ status: "active" });
    expect(database.prepare(`
      SELECT state, revision, abandoned_reason FROM project_session_memberships
       WHERE project_session_id='session_01' AND coordination_run_id='run_01'
         AND member_kind='task' AND member_id='task_01'
    `).get()).toEqual({
      state: "abandoned",
      revision: 2,
      abandoned_reason: "Operator cancelled the bounded task",
    });
    expect(database.prepare(`
      SELECT state, revision, abandoned_reason FROM project_session_memberships
       WHERE project_session_id='session_01' AND coordination_run_id='run_01'
         AND member_kind='task' AND member_id='task_02'
    `).get()).toEqual({ state: "active", revision: 1, abandoned_reason: null });
  });

  it("rejects stale revision, generation, and wrong-session control targets before effects", async () => {
    const { ports } = fixture();
    const base = {
      kind: "control" as const,
      action: "pause" as const,
    };
    await expect(ports.statePort.read({
      ...base,
      target: {
        kind: "task",
        projectSessionId: "session_01" as never,
        coordinationRunId: "run_01" as never,
        taskId: "task_01" as never,
        expectedRevision: 2,
      },
    })).rejects.toMatchObject({ code: "STALE_REVISION" });
    await expect(ports.statePort.read({
      ...base,
      target: {
        kind: "session",
        projectSessionId: "session_01" as never,
        expectedRevision: 2,
        expectedGeneration: 2,
      },
    })).rejects.toMatchObject({ code: "STALE_GENERATION" });
    await expect(ports.statePort.read({
      ...base,
      target: {
        kind: "task",
        projectSessionId: "session_other" as never,
        coordinationRunId: "run_01" as never,
        taskId: "task_01" as never,
        expectedRevision: 3,
      },
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("binds subtree, run, and session targets to their authoritative revision families", async () => {
    const { database, ports } = fixture();
    database.exec(`
      INSERT INTO tasks(
        run_id, task_id, authority_id, objective, base_revision, state,
        owner_agent_id, revision, owner_lease_generation, created_by
      ) VALUES (
        'run_01', 'task_02', 'authority_01', 'Dependent child', 'base_02', 'active',
        'chair_01', 7, 1, 'chair_01'
      );
      INSERT INTO dependency_mutation_guards(
        run_id, project_session_id, target_revision, expected_edge_count, expected_binding_count
      ) VALUES ('run_01', 'session_01', 2, 1, 0);
      UPDATE runs SET dependency_revision=2 WHERE run_id='run_01';
      INSERT INTO task_dependencies(
        run_id, task_id, dependency_task_id, project_session_id, dependency_revision
      ) VALUES ('run_01', 'task_02', 'task_01', 'session_01', 2);
      DELETE FROM dependency_mutation_guards WHERE run_id='run_01';
    `);
    const subtree = {
      kind: "control" as const,
      action: "pause" as const,
      target: {
        kind: "subtree" as const,
        projectSessionId: "session_01" as never,
        coordinationRunId: "run_01" as never,
        rootTaskId: "task_01" as never,
        expectedRevision: 3,
      },
    };
    await expect(ports.effectPort.dispatch({
      commandId: "pause_subtree_01",
      intent: subtree,
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).resolves.toMatchObject({ status: "committed" });
    expect(database.prepare(`
      SELECT task_id, scope_kind FROM operator_control_fences WHERE state='paused' ORDER BY task_id
    `).all()).toEqual([
      { task_id: "task_01", scope_kind: "subtree" },
      { task_id: "task_02", scope_kind: "subtree" },
    ]);
    await expect(ports.statePort.read({
      kind: "control",
      action: "resume",
      target: {
        kind: "run",
        projectSessionId: "session_01" as never,
        coordinationRunId: "run_01" as never,
        expectedRevision: 4,
      },
    })).resolves.toMatchObject({ kind: "control", revision: 4, lifecycleState: "paused" });
    await expect(ports.statePort.read({
      kind: "control",
      action: "resume",
      target: {
        kind: "session",
        projectSessionId: "session_01" as never,
        expectedRevision: 2,
        expectedGeneration: 1,
      },
    })).resolves.toMatchObject({
      kind: "control",
      revision: 2,
      lifecycleState: "paused",
    });

    await expect(ports.effectPort.dispatch({
      commandId: "resume_subtree_01",
      intent: { ...subtree, action: "resume" },
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).resolves.toMatchObject({ status: "committed" });
    const runPause = {
      kind: "control" as const,
      action: "pause" as const,
      target: {
        kind: "run" as const,
        projectSessionId: "session_01" as never,
        coordinationRunId: "run_01" as never,
        expectedRevision: 4,
      },
    };
    await expect(ports.effectPort.dispatch({
      commandId: "pause_run_01",
      intent: runPause,
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).resolves.toMatchObject({ status: "committed" });
    expect(() => assertRunAcceptingWork(database, "run_01")).toThrow(/paused/u);
    await expect(ports.effectPort.dispatch({
      commandId: "resume_run_01",
      intent: { ...runPause, action: "resume" },
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).resolves.toMatchObject({ status: "committed" });
    expect(() => assertRunAcceptingWork(database, "run_01")).not.toThrow();
  });

  it("does not overwrite a delivery freeze owned by another lifecycle", async () => {
    const { database, ports } = fixture();
    database.exec(`
      INSERT INTO delivery_freezes(run_id, agent_id, reason, created_at)
      VALUES ('run_01', 'chair_01', 'context-reconciliation', ${now});
      UPDATE agents SET lifecycle='suspended' WHERE run_id='run_01' AND agent_id='chair_01';
    `);
    await expect(ports.effectPort.dispatch({
      commandId: "pause_run_foreign_freeze_01",
      intent: {
        kind: "control",
        action: "pause",
        target: {
          kind: "run",
          projectSessionId: "session_01" as never,
          coordinationRunId: "run_01" as never,
          expectedRevision: 4,
        },
      },
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(database.prepare("SELECT reason FROM delivery_freezes WHERE run_id='run_01' AND agent_id='chair_01'").get())
      .toEqual({ reason: "context-reconciliation" });
    expect(database.prepare("SELECT COUNT(*) AS count FROM operator_control_fences").get()).toEqual({ count: 0 });
  });

  it("persists a project drain receipt only after obligations settle and requires it for stop", async () => {
    const { database, ports } = fixture();
    database.prepare("UPDATE tasks SET state='complete', revision=revision+1 WHERE run_id='run_01' AND task_id='task_01'").run();
    database.exec(`
      INSERT INTO run_chair_leases(
        project_session_id, run_id, lease_id, holder_agent_id, generation, status, updated_at
      ) VALUES ('session_01', 'run_01', 'chair:run_01:1', 'chair_01', 1, 'active', ${now});
      INSERT INTO project_session_memberships(
        project_session_id, coordination_run_id, member_kind, member_id,
        required, state, revision, created_at, updated_at
      ) VALUES
        ('session_01', 'run_01', 'coordination-run', 'run_01', 1, 'active', 1, ${now}, ${now}),
        ('session_01', 'run_01', 'lease', 'chair:run_01:1', 1, 'active', 1, ${now}, ${now}),
        ('session_01', 'run_01', 'lease', 'lease_work_01', 1, 'active', 1, ${now}, ${now});
      INSERT INTO leases(lease_id, run_id, kind, holder_agent_id, generation, status, expires_at, updated_at)
      VALUES ('lease_work_01', 'run_01', 'write', 'chair_01', 1, 'active', ${now + 60_000}, ${now});
    `);
    const beforeDrain = database.prepare("SELECT revision FROM daemon_global_state WHERE singleton=1").get() as { revision: number };
    const drain = {
      kind: "project-session-drain" as const,
      projectSessionId: "session_01" as never,
      expectedSessionRevision: 2,
      expectedSessionGeneration: 1,
      expectedGlobalStateRevision: beforeDrain.revision,
    };

    await expect(ports.statePort.read(drain)).resolves.toMatchObject({
      kind: "project-session-lifecycle",
      revision: 2,
      sessionGeneration: 1,
      globalStateRevision: beforeDrain.revision,
      lifecycleState: "active",
      drainReceiptRef: null,
    });
    const request = {
      commandId: "project_drain_01",
      intent: drain,
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    };
    await expect(ports.effectPort.dispatch(request)).resolves.toEqual({ status: "pending", phase: "accepted" });
    expect(database.prepare("SELECT COUNT(*) AS count FROM operator_lifecycle_receipts").get()).toEqual({ count: 0 });
    database.exec(`
      UPDATE leases SET status='released', updated_at=${now + 1} WHERE lease_id='lease_work_01';
      UPDATE project_session_memberships
         SET state='reconciled', revision=revision+1, updated_at=${now + 1}
       WHERE project_session_id='session_01' AND coordination_run_id='run_01'
         AND member_kind='lease' AND member_id='lease_work_01';
    `);
    const drained = await ports.effectPort.observe({ ...request, attemptGeneration: 2, effectRef: null });
    expect(drained).toMatchObject({
      status: "committed",
      afterState: { lifecycleState: "quiescing", obligationsSettled: true },
    });
    if (drained.status !== "committed" || drained.effectRef === undefined) throw new Error("expected drain receipt");
    expect(database.prepare("SELECT state, revision FROM project_sessions WHERE project_session_id='session_01'").get())
      .toEqual({ state: "quiescing", revision: 3 });
    expect(database.prepare("SELECT lifecycle_state, revision FROM runs WHERE run_id='run_01'").get())
      .toEqual({ lifecycle_state: "quiescing", revision: 5 });
    expect(database.prepare("SELECT kind, relative_path, sha256 FROM operator_lifecycle_receipts").get())
      .toEqual({
        kind: "project-session-drain",
        relative_path: drained.effectRef.path,
        sha256: drained.effectRef.digest,
      });

    const afterDrain = database.prepare("SELECT revision FROM daemon_global_state WHERE singleton=1").get() as { revision: number };
    const stop = {
      kind: "project-session-stop" as const,
      projectSessionId: "session_01" as never,
      expectedSessionRevision: 3,
      expectedSessionGeneration: 1,
      expectedGlobalStateRevision: afterDrain.revision,
      drainReceiptRef: drained.effectRef,
    };
    await expect(ports.effectPort.dispatch({
      commandId: "project_stop_bad_receipt",
      intent: {
        ...stop,
        drainReceiptRef: { path: drained.effectRef.path, digest: `sha256:${"f".repeat(64)}` as never },
      },
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(database.prepare("SELECT state FROM project_sessions WHERE project_session_id='session_01'").get())
      .toEqual({ state: "quiescing" });
    await expect(ports.effectPort.dispatch({
      commandId: "project_stop_01",
      intent: stop,
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).resolves.toMatchObject({
      status: "committed",
      afterState: { lifecycleState: "cancelled" },
    });
    expect(database.prepare("SELECT state, revision FROM project_sessions WHERE project_session_id='session_01'").get())
      .toEqual({ state: "cancelled", revision: 4 });
    expect(database.prepare("SELECT status FROM run_chair_leases WHERE lease_id='chair:run_01:1'").get())
      .toEqual({ status: "revoked" });
    expect(database.prepare(`
      SELECT member_kind, member_id, state, abandoned_reason
        FROM project_session_memberships ORDER BY member_kind, member_id
    `).all()).toEqual([
      {
        member_kind: "coordination-run",
        member_id: "run_01",
        state: "abandoned",
        abandoned_reason: "operator stop project_stop_01",
      },
      {
        member_kind: "lease",
        member_id: "chair:run_01:1",
        state: "abandoned",
        abandoned_reason: "operator stop project_stop_01",
      },
      { member_kind: "lease", member_id: "lease_work_01", state: "reconciled", abandoned_reason: null },
    ]);
  });

  it("resumes a pending project drain after restart without fabricating a receipt while busy", async () => {
    const { database, ports } = fixture();
    const beforeDrain = database.prepare("SELECT revision FROM daemon_global_state WHERE singleton=1").get() as { revision: number };
    const drain = {
      kind: "project-session-drain" as const,
      projectSessionId: "session_01" as never,
      expectedSessionRevision: 2,
      expectedSessionGeneration: 1,
      expectedGlobalStateRevision: beforeDrain.revision,
    };
    const request = {
      commandId: "project_drain_restart_01",
      intent: drain,
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    };

    await expect(ports.effectPort.dispatch(request)).resolves.toEqual({ status: "pending", phase: "accepted" });
    expect(database.prepare("SELECT COUNT(*) AS count FROM operator_lifecycle_receipts").get()).toEqual({ count: 0 });
    database.prepare("UPDATE tasks SET state='complete', revision=revision+1 WHERE run_id='run_01' AND task_id='task_01'").run();
    const restarted = createProductionOperatorActionPorts({
      database,
      clock: () => now + 1,
      adapter: {
        capabilities: async () => { throw new Error("project drain has no adapter effect"); },
        dispatch: async () => { throw new Error("project drain has no adapter effect"); },
        lookup: async () => { throw new Error("project drain has no adapter effect"); },
      },
    });
    await expect(restarted.effectPort.observe({ ...request, attemptGeneration: 2, effectRef: null }))
      .resolves.toMatchObject({
        status: "committed",
        afterState: { lifecycleState: "quiescing", obligationsSettled: true },
        effectRef: { path: expect.stringContaining("project-session-drain") },
      });
  });

  it("fences daemon drain and stop by the exact epoch, global revision, and receipt", async () => {
    const { database } = fixture();
    database.exec(`
      UPDATE tasks SET state='complete', revision=revision+1 WHERE run_id='run_01' AND task_id='task_01';
      UPDATE runs SET lifecycle_state='cancelled', revision=revision+1 WHERE run_id='run_01';
      UPDATE project_sessions
         SET state='cancelled', terminal_path_json='{"kind":"cancelled","reason":"fixture settled"}',
             revision=revision+1
       WHERE project_session_id='session_01';
      INSERT INTO daemon_runtime_epochs(
        instance_generation, instance_id, state, observed_global_revision,
        started_at, heartbeat_at, stopped_at
      ) VALUES (7, 'daemon_07', 'running', NULL, ${now}, ${now}, NULL);
    `);
    const ports = createProductionOperatorActionPorts({
      database,
      clock: () => now,
      adapter: {
        capabilities: async () => { throw new Error("daemon lifecycle has no adapter effect"); },
        dispatch: async () => { throw new Error("daemon lifecycle has no adapter effect"); },
        lookup: async () => { throw new Error("daemon lifecycle has no adapter effect"); },
      },
      daemonStop: {
        request: async ({ token }) => {
          const updated = database.prepare(`
            UPDATE daemon_runtime_epochs SET state='stopped', stopped_at=?, heartbeat_at=?
             WHERE instance_generation=? AND state='quiescing' AND observed_global_revision=?
          `).run(now, now, token.daemonInstanceGeneration, token.observedGlobalStateRevision);
          return updated.changes === 1 ? "stopped" : "busy";
        },
      },
    });
    const before = database.prepare("SELECT revision FROM daemon_global_state WHERE singleton=1").get() as { revision: number };
    const drain = {
      kind: "daemon-drain" as const,
      expectedDaemonGeneration: 7,
      expectedGlobalStateRevision: before.revision,
    };
    const drained = await ports.effectPort.dispatch({
      commandId: "daemon_drain_01",
      intent: drain,
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    });
    expect(drained).toMatchObject({ status: "committed", afterState: { lifecycleState: "quiescing" } });
    if (drained.status !== "committed" || drained.effectRef === undefined) throw new Error("expected daemon drain receipt");
    const afterDrain = database.prepare("SELECT revision FROM daemon_global_state WHERE singleton=1").get() as { revision: number };
    await expect(ports.effectPort.dispatch({
      commandId: "daemon_stop_01",
      intent: {
        kind: "daemon-stop",
        expectedDaemonGeneration: 7,
        expectedGlobalStateRevision: afterDrain.revision,
        drainReceiptRef: drained.effectRef,
      },
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).resolves.toMatchObject({ status: "committed", afterState: { lifecycleState: "stopped" } });
    expect(database.prepare("SELECT state, stopped_at FROM daemon_runtime_epochs WHERE instance_generation=7").get())
      .toEqual({ state: "stopped", stopped_at: now });
  });

  it("keeps a busy daemon quiescing without a stop receipt and rejects new work", async () => {
    const { database, ports } = fixture();
    database.exec(`
      INSERT INTO daemon_runtime_epochs(
        instance_generation, instance_id, state, observed_global_revision,
        started_at, heartbeat_at, stopped_at
      ) VALUES (7, 'daemon_busy_07', 'running', NULL, ${now}, ${now}, NULL);
    `);
    const before = database.prepare("SELECT revision FROM daemon_global_state WHERE singleton=1").get() as { revision: number };
    await expect(ports.effectPort.dispatch({
      commandId: "daemon_drain_busy_01",
      intent: {
        kind: "daemon-drain",
        expectedDaemonGeneration: 7,
        expectedGlobalStateRevision: before.revision,
      },
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).resolves.toEqual({ status: "pending", phase: "observing" });
    expect(database.prepare("SELECT COUNT(*) AS count FROM operator_lifecycle_receipts").get()).toEqual({ count: 0 });
    expect(() => assertRunAcceptingWork(database, "run_01")).toThrow(/daemon is draining/u);
    await expect(ports.effectPort.dispatch({
      commandId: "daemon_stop_without_receipt",
      intent: {
        kind: "daemon-stop",
        expectedDaemonGeneration: 7,
        expectedGlobalStateRevision: before.revision,
        drainReceiptRef: {
          path: ".agent-fabric/lifecycle-receipts/missing.json" as never,
          digest: digest as never,
        },
      },
      intentDigest: digest as never,
      beforeStateDigest: digest as never,
      attemptGeneration: 1,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

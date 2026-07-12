import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type {
  ScopedGateCheckRequest,
  ScopedGateCheckResult,
  ScopedGateCreateRequest,
} from "@local/agent-fabric-protocol";

import { ScopedGateStore } from "../../../src/gates/store.ts";
import { chairContext, openSpec05Database } from "./restart-recovery-fixtures.ts";

const databases: Database.Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function open(): Database.Database {
  const database = openSpec05Database();
  databases.push(database);
  return database;
}

function subtreeGate(): ScopedGateCreateRequest {
  return {
    origin: "chair",
    command: {
      commandId: "command_gate",
      agentId: "chair_01",
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      principalGeneration: 1,
      chairLeaseId: "chair:run_01:1",
      chairLeaseGeneration: 1,
      expectedRunRevision: 1,
      expectedRevision: 2,
    },
    intent: {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dedupeKey: "gate:subtree",
      scope: { kind: "subtree", rootTaskId: "task_root" },
      blockedOperationIds: ["fabric.v1.provider-action.dispatch"],
      enforcementPoints: ["task-readiness", "operation", "scoped-barrier"],
      question: "Continue this subtree?",
      reason: "Human judgement is required.",
      options: ["approve", "defer"],
      recommendation: "defer",
      consequences: ["The affected subtree remains blocked."],
      evidenceRefs: [],
    },
  } as unknown as ScopedGateCreateRequest;
}

function check(store: ScopedGateStore, request: unknown): ScopedGateCheckResult {
  return store.check(chairContext, request as ScopedGateCheckRequest);
}

describe("scoped gate service", () => {
  it("rebinds descendants atomically and enforces only the affected task, operation, and barrier", () => {
    const database = open();
    const store = new ScopedGateStore({ database, clock: () => 1_000 });

    expect(store.mutateDependencies(chairContext, {
      commandId: "dependencies_1",
      expectedRevision: 1,
      edges: [{ taskId: "task_child", dependencyTaskId: "task_root" }],
    })).toEqual({ dependencyRevision: 2, edgeCount: 1, bindingCount: 0 });
    const gate = store.createGate(chairContext, subtreeGate());
    expect(gate).toMatchObject({
      status: "pending",
      revision: 1,
      dependencyRevision: 2,
      affectedTaskIds: ["task_child", "task_root"],
    });
    store.bindBarrier(chairContext, {
      commandId: "bind_barrier",
      gateId: gate.gateId,
      barrierId: "run_01:stage:implementation",
      expectedGateRevision: 1,
    });

    expect(check(store, {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dependencyRevision: 2,
      enforcementPoint: "task-readiness",
      taskId: "task_child",
    })).toMatchObject({ allowed: false, blockingGateIds: [gate.gateId] });
    expect(check(store, {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dependencyRevision: 2,
      enforcementPoint: "task-readiness",
      taskId: "task_sibling",
    })).toEqual({ allowed: true, checkedGateRevisions: { [gate.gateId]: 1 } });
    expect(check(store, {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dependencyRevision: 2,
      enforcementPoint: "operation",
      operationId: "fabric.v1.provider-action.dispatch",
      operationTarget: { kind: "task", taskId: "task_child" },
    })).toMatchObject({ allowed: false, blockingGateIds: [gate.gateId] });
    expect(check(store, {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dependencyRevision: 2,
      enforcementPoint: "operation",
      operationId: "fabric.v1.provider-action.dispatch",
      operationTarget: { kind: "task", taskId: "task_sibling" },
    })).toEqual({ allowed: true, checkedGateRevisions: { [gate.gateId]: 1 } });
    expect(check(store, {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dependencyRevision: 2,
      enforcementPoint: "operation",
      operationId: "fabric.v1.provider-action.dispatch",
      operationTarget: { kind: "run" },
    })).toEqual({ allowed: true, checkedGateRevisions: { [gate.gateId]: 1 } });
    expect(check(store, {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dependencyRevision: 2,
      enforcementPoint: "scoped-barrier",
      barrierId: "run_01:stage:implementation",
    })).toMatchObject({ allowed: false, blockingGateIds: [gate.gateId] });

    expect(store.mutateDependencies(chairContext, {
      commandId: "dependencies_2",
      expectedRevision: 2,
      edges: [
        { taskId: "task_child", dependencyTaskId: "task_root" },
        { taskId: "task_grandchild", dependencyTaskId: "task_child" },
      ],
    })).toMatchObject({ dependencyRevision: 3, edgeCount: 2, bindingCount: 3 });
    expect(check(store, {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dependencyRevision: 3,
      enforcementPoint: "task-readiness",
      taskId: "task_grandchild",
    })).toMatchObject({ allowed: false });
    expect(check(store, {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dependencyRevision: 3,
      enforcementPoint: "operation",
      operationId: "fabric.v1.provider-action.dispatch",
      operationTarget: { kind: "task", taskId: "task_grandchild" },
    })).toMatchObject({ allowed: false });

    expect(store.mutateDependencies(chairContext, {
      commandId: "dependencies_3",
      expectedRevision: 3,
      edges: [],
    })).toMatchObject({ dependencyRevision: 4, edgeCount: 0, bindingCount: 1 });
    expect(check(store, {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dependencyRevision: 4,
      enforcementPoint: "task-readiness",
      taskId: "task_child",
    })).toEqual({ allowed: true, checkedGateRevisions: { [gate.gateId]: 3 } });
    expect(check(store, {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dependencyRevision: 4,
      enforcementPoint: "operation",
      operationId: "fabric.v1.provider-action.dispatch",
      operationTarget: { kind: "task", taskId: "task_child" },
    })).toEqual({ allowed: true, checkedGateRevisions: { [gate.gateId]: 3 } });
  });

  it.each(["run", "release"] as const)(
    "enforces an operation-scoped %s gate for both run and exact-task targets",
    (scopeKind) => {
      const database = open();
      const store = new ScopedGateStore({ database, clock: () => 1_000 });
      const gate = store.createGate(chairContext, {
        origin: "chair",
        command: {
          commandId: `command_${scopeKind}_gate`,
          agentId: "chair_01",
          projectSessionId: "session_01",
          coordinationRunId: "run_01",
          principalGeneration: 1,
          chairLeaseId: "chair:run_01:1",
          chairLeaseGeneration: 1,
          expectedRunRevision: 1,
          expectedRevision: 1,
        },
        intent: {
          projectSessionId: "session_01",
          coordinationRunId: "run_01",
          dedupeKey: `gate:${scopeKind}`,
          scope: { kind: scopeKind },
          blockedOperationIds: ["fabric.v1.provider-action.dispatch"],
          enforcementPoints: ["operation"],
          question: "Proceed with the operation?",
          reason: "Human judgement is required.",
          options: ["approve", "defer"],
          recommendation: "defer",
          consequences: ["The named operation remains blocked."],
          evidenceRefs: [],
          ...(scopeKind === "release" ? {
            releaseBinding: {
              acceptedDeliveryReceiptRef: {
                path: "receipts/accepted.json",
                digest: `sha256:${"a".repeat(64)}`,
              },
              artifactDigest: `sha256:${"b".repeat(64)}`,
              promotionAction: "release",
              target: "local:test",
            },
          } : {}),
        },
      } as unknown as ScopedGateCreateRequest);

      for (const operationTarget of [
        { kind: "run" as const },
        { kind: "task" as const, taskId: "task_sibling" },
      ]) {
        expect(check(store, {
          projectSessionId: "session_01",
          coordinationRunId: "run_01",
          dependencyRevision: 1,
          enforcementPoint: "operation",
          operationId: "fabric.v1.provider-action.dispatch",
          operationTarget,
        })).toMatchObject({ allowed: false, blockingGateIds: [gate.gateId] });
      }
    },
  );

  it("fails closed when an operation target does not belong to the exact run", () => {
    const database = open();
    const store = new ScopedGateStore({ database, clock: () => 1_000 });
    expect(() => check(store, {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dependencyRevision: 1,
      enforcementPoint: "operation",
      operationId: "fabric.v1.provider-action.dispatch",
      operationTarget: { kind: "task", taskId: "task_from_another_run" },
    })).toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("rolls back the dependency graph, revision, and complete gate rebind on a crash", () => {
    const database = open();
    const store = new ScopedGateStore({ database, clock: () => 1_000 });
    store.mutateDependencies(chairContext, {
      commandId: "dependencies_1",
      expectedRevision: 1,
      edges: [{ taskId: "task_child", dependencyTaskId: "task_root" }],
    });
    store.createGate(chairContext, subtreeGate());
    const crashing = new ScopedGateStore({
      database,
      clock: () => 2_000,
      fault: (label) => {
        if (label === "gates:dependency:after-edges") throw new Error("crash");
      },
    });

    expect(() => crashing.mutateDependencies(chairContext, {
      commandId: "dependencies_crash",
      expectedRevision: 2,
      edges: [{ taskId: "task_grandchild", dependencyTaskId: "task_child" }],
    })).toThrow("crash");
    expect(database.prepare("SELECT dependency_revision FROM runs WHERE run_id='run_01'").get())
      .toEqual({ dependency_revision: 2 });
    expect(database.prepare("SELECT task_id, dependency_task_id FROM task_dependencies ORDER BY task_id").all())
      .toEqual([{ task_id: "task_child", dependency_task_id: "task_root" }]);
    expect(database.prepare("SELECT task_id, bound_dependency_revision FROM scoped_gate_tasks ORDER BY task_id").all())
      .toEqual([
        { task_id: "task_child", bound_dependency_revision: 2 },
        { task_id: "task_root", bound_dependency_revision: 2 },
      ]);
  });

  it("converts compatibility human-gate IDs into pending scoped gates without legacy writes", () => {
    const database = open();
    const store = new ScopedGateStore({ database, clock: () => 1_000 });
    const gates = store.createCompatibilityTaskGates(chairContext, {
      commandId: "compatibility_gates",
      expectedDependencyRevision: 1,
      taskId: "task_root",
      humanGateIds: ["human_01"],
    });

    expect(gates).toHaveLength(1);
    expect(gates[0]).toMatchObject({
      status: "pending",
      scope: { kind: "task", taskId: "task_root" },
      enforcementPoints: ["task-readiness", "scoped-barrier"],
    });
    expect(database.prepare("SELECT count(*) AS count FROM task_human_gates").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT legacy_status FROM scoped_gates WHERE gate_id=?").get(gates[0]?.gateId))
      .toEqual({ legacy_status: "declared" });
    expect(store.createCompatibilityTaskGates(chairContext, {
      commandId: "compatibility_gates",
      expectedDependencyRevision: 1,
      taskId: "task_root",
      humanGateIds: ["human_01"],
    })).toEqual(gates);
  });
});

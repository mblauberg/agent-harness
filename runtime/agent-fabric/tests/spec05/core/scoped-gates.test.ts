import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type {
  ScopedGateCheckRequest,
  ScopedGateCheckResult,
  ScopedGateCreateRequest,
} from "@local/agent-fabric-protocol";
import { parseOperatorCapabilityGrant } from "@local/agent-fabric-protocol";

import { ScopedGateStore } from "../../../src/gates/store.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
import type { AuthenticatedOperatorContext } from "../../../src/project-session/contracts.ts";
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
  it("creates and retires the exact gate Attention item in the gate transaction", () => {
    const database = open();
    const gateStore = new ScopedGateStore({ database, clock: () => 1_000 });
    const gate = gateStore.createGate(chairContext, {
      origin: "chair",
      command: {
        commandId: "command_attention_gate",
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
        dedupeKey: "gate:attention-lifecycle",
        scope: { kind: "run" },
        blockedOperationIds: ["fabric.v1.provider-action.dispatch"],
        enforcementPoints: ["operation"],
        question: "Continue this run?",
        reason: "Human judgement is required.",
        options: ["approve", "reject", "defer"],
        recommendation: "defer",
        consequences: ["The run remains blocked."],
        evidenceRefs: [],
      },
    } as unknown as ScopedGateCreateRequest);
    expect(database.prepare(`
      SELECT kind, severity, revision, state, dedupe_key,
             json_extract(payload_json, '$.gateId') AS gate_id,
             json_extract(payload_json, '$.title') AS title
        FROM attention_items
       WHERE project_session_id='session_01' AND coordination_run_id='run_01'
         AND json_extract(payload_json, '$.gateId')=?
    `).get(gate.gateId)).toEqual({
      kind: "consequential-gate",
      severity: "critical",
      revision: 1,
      state: "open",
      dedupe_key: `scoped-gate:${gate.gateId}`,
      gate_id: gate.gateId,
      title: "Continue this run?",
    });
    expect(database.prepare(`
      SELECT state FROM notification_deliveries
       WHERE item_id=(SELECT item_id FROM attention_items
                       WHERE json_extract(payload_json, '$.gateId')=?)
    `).get(gate.gateId)).toEqual({ state: "pending" });

    const operatorStore = new OperatorStore({ database, clock: () => 2_000 });
    operatorStore.registerPrincipal({
      operatorId: "operator_01",
      projectId: "project_01",
      authenticatedSubjectHash: "subject-hash",
      projectAuthorityGeneration: 1,
    });
    operatorStore.issueCapability(parseOperatorCapabilityGrant({
      capabilityId: "cap_gate_attention",
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
    }), "gate-attention-secret");
    const operatorContext: AuthenticatedOperatorContext = {
      operatorId: "operator_01" as never,
      projectId: "project_01" as never,
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
    };
    const commandId = "resolve_attention_gate";
    const resolution = {
      command: {
        credential: { capabilityId: "cap_gate_attention", token: "gate-attention-secret" },
        commandId,
        expectedRevision: gate.revision,
        actor: "operator_01",
        provenance: {
          kind: "console-direct-input",
          clientId: "console_gate_attention",
          inputEventId: "input_gate_attention",
        },
        evidenceRefs: [],
      },
      gateId: gate.gateId,
      status: "approved",
      decisionEvidence: { kind: "typed-console", confirmationCommandId: commandId },
    } as const;
    const crashing = new ScopedGateStore({
      database,
      operatorStore,
      clock: () => 2_000,
      fault: (label) => {
        if (label === "gates:resolve:after-attention") throw new Error("crash after Attention retirement");
      },
    });
    expect(() => crashing.resolveGate(operatorContext, resolution as never)).toThrow(
      "crash after Attention retirement",
    );
    expect(gateStore.getGate(gate.gateId)).toMatchObject({ status: "pending", revision: 1 });
    expect(database.prepare(`
      SELECT state, revision FROM attention_items
       WHERE json_extract(payload_json, '$.gateId')=?
    `).get(gate.gateId)).toEqual({ state: "open", revision: 1 });
    expect(database.prepare("SELECT state FROM notification_deliveries").get())
      .toEqual({ state: "pending" });

    const resolving = new ScopedGateStore({ database, operatorStore, clock: () => 3_000 });
    expect(resolving.resolveGate(operatorContext, resolution as never)).toMatchObject({
      status: "approved",
      revision: 2,
    });
    expect(database.prepare(`
      SELECT state, revision FROM attention_items
       WHERE json_extract(payload_json, '$.gateId')=?
    `).get(gate.gateId)).toEqual({ state: "resolved", revision: 2 });
    expect(database.prepare("SELECT state FROM notification_deliveries").get())
      .toEqual({ state: "deduplicated" });
  });

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

});

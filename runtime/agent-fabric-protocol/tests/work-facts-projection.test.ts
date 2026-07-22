import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  PROTOCOL_FEATURES,
  assertOperationResultFeatureShape,
  parseOperationResult,
} from "../src/index.js";

const observedAt = "2026-07-22T00:00:00.000Z";
const workflow = {
  workflowRevision: 17,
  objective: { observation: "Observed", value: "Implement workflow facts" },
  dependencies: { observation: "Observed", dependencyRevision: 2, taskIds: ["task_00"] },
  coordinationRun: {
    observation: "Observed",
    projectSessionId: "session_01",
    coordinationRunId: "run_01",
  },
  workstream: { observation: "Unobserved" },
  parentTask: { observation: "Unobserved" },
  plan: { observation: "Observed", planRevision: 3 },
  task: {
    observation: "Observed",
    state: "active",
    owner: { observation: "Observed", agentId: "agent_01", ownerLeaseGeneration: 1 },
  },
  checks: { observation: "Observed", items: [{ checkId: "check_01", state: "pass" }] },
  barriers: {
    observation: "Observed",
    items: [{ kind: "run", barrierId: "run_01:run:", state: "closed" }],
  },
  declaredWriteScopes: {
    observation: "Observed",
    leases: [{
      leaseId: "lease_01",
      generation: 1,
      state: "active",
      paths: ["src/workflow.ts"],
    }],
  },
  runTaskStates: {
    observation: "Observed",
    counts: { blocked: 0, ready: 1, active: 1, complete: 2, cancelled: 0, degraded: 0 },
  },
} as const;

function workPage(summary: unknown) {
  return {
    status: "page",
    view: "work",
    rows: [{
      itemId: "task_01",
      itemRevision: 2,
      fact: {
        freshness: "live",
        source: "fabric",
        revision: 2,
        observedAt,
        value: {
          summary,
          detailRef: { kind: "task", taskId: "task_01", expectedRevision: 2 },
          actionAvailability: { state: "read-only", reason: "feature-unavailable" },
        },
      },
    }],
    nextCursor: 1,
    hasMore: false,
    snapshotRevision: 17,
    readTransactionId: "read_work_facts",
  };
}

function workDetail(detail: unknown) {
  return {
    status: "current",
    detailRef: { kind: "task", taskId: "task_01", expectedRevision: 2 },
    detail: {
      freshness: "live",
      source: "fabric",
      revision: 2,
      observedAt,
      value: detail,
    },
    snapshotRevision: 17,
    readTransactionId: "read_work_facts_detail",
  };
}

describe("work-facts-projection.v1 closed result shape", () => {
  it("accepts Fabric-observed workflow facts on a work row", () => {
    expect(parseOperationResult(
      FABRIC_OPERATIONS.projectionViewPage,
      workPage({ kind: "work", state: "active", checkState: "passing", workflow }),
    )).toMatchObject({ status: "page", view: "work" });
  });

  it("requires uniform workflow presence exactly when its result feature is negotiated", () => {
    expect(PROTOCOL_FEATURES).toContain("work-facts-projection.v1");
    const legacySummary = { kind: "work", state: "active", checkState: "passing" } as const;
    const legacy = parseOperationResult(FABRIC_OPERATIONS.projectionViewPage, workPage(legacySummary));
    const extended = parseOperationResult(
      FABRIC_OPERATIONS.projectionViewPage,
      workPage({ ...legacySummary, workflow }),
    );
    const legacyFeatures = ["operator-projection.v2"] as const;
    const extendedFeatures = [...legacyFeatures, "work-facts-projection.v1"] as const;

    expect(assertOperationResultFeatureShape(
      FABRIC_OPERATIONS.projectionViewPage,
      extendedFeatures,
      extended,
    )).toBe(extended);
    expect(() => assertOperationResultFeatureShape(
      FABRIC_OPERATIONS.projectionViewPage,
      extendedFeatures,
      legacy,
    )).toThrow(expect.objectContaining({ reason: "missing-negotiated-field" }));
    expect(() => assertOperationResultFeatureShape(
      FABRIC_OPERATIONS.projectionViewPage,
      legacyFeatures,
      extended,
    )).toThrow(expect.objectContaining({ reason: "unnegotiated-field" }));

    const extendedPage = workPage({ ...legacySummary, workflow });
    const extendedFact = extendedPage.rows[0]!.fact;
    const mixed = parseOperationResult(FABRIC_OPERATIONS.projectionViewPage, {
      ...extendedPage,
      rows: [{
        ...extendedPage.rows[0],
        fact: {
          freshness: "conflict",
          source: "fabric",
          revision: 2,
          observedAt,
          candidates: [extendedFact.value, { ...extendedFact.value, summary: legacySummary }],
        },
      }],
    });
    expect(() => assertOperationResultFeatureShape(
      FABRIC_OPERATIONS.projectionViewPage,
      extendedFeatures,
      mixed,
    )).toThrow(expect.objectContaining({ reason: "mixed-presence" }));
  });

  it("accepts explicit unobserved workflow arms on task detail", () => {
    const unobserved = {
      ...workflow,
      dependencies: { observation: "Observed", dependencyRevision: 2, taskIds: [] },
      workstream: { observation: "Unobserved" },
      plan: { observation: "Unobserved" },
      task: { observation: "Observed", state: "ready", owner: { observation: "Unobserved" } },
      checks: { observation: "Observed", items: [] },
      barriers: { observation: "Observed", items: [] },
      declaredWriteScopes: { observation: "Observed", leases: [] },
      runTaskStates: {
        observation: "Observed",
        counts: { blocked: 0, ready: 1, active: 0, complete: 0, cancelled: 0, degraded: 0 },
      },
    } as const;
    expect(parseOperationResult(
      FABRIC_OPERATIONS.projectionDetailRead,
      workDetail({
        kind: "task",
        taskId: "task_01",
        objective: "Implement workflow facts",
        state: "ready",
        ownerAgentId: null,
        workflow: unobserved,
      }),
    )).toMatchObject({ status: "current" });
  });

  it("rejects contradictory workflow facts and open-ended arms", () => {
    const summary = { kind: "work", state: "active", checkState: "passing" } as const;
    for (const invalid of [
      { ...workflow, workflowRevision: 16 },
      { ...workflow, parentTask: { observation: "Observed", taskId: "task_00" } },
      { ...workflow, dependencies: { ...workflow.dependencies, taskIds: ["task_00", "task_00"] } },
      { ...workflow, task: { ...workflow.task, state: "parked" } },
      { ...workflow, task: { ...workflow.task, owner: { ...workflow.task.owner, ownerLeaseGeneration: 0 } } },
      { ...workflow, runTaskStates: { ...workflow.runTaskStates, counts: {
        ...workflow.runTaskStates.counts, active: 0,
      } } },
      { ...workflow, inferredWorkstreamId: "ws_01" },
    ]) {
      expect(() => parseOperationResult(
        FABRIC_OPERATIONS.projectionViewPage,
        workPage({ ...summary, workflow: invalid }),
      )).toThrowError();
    }
  });

  it("enforces workflow correlation with enclosing work and task detail", () => {
    const mismatchedRow = workPage({ kind: "work", state: "active", checkState: "passing", workflow });
    mismatchedRow.rows[0]!.fact.value.detailRef.taskId = "task_wrong";
    expect(() => parseOperationResult(
      FABRIC_OPERATIONS.projectionViewPage,
      mismatchedRow,
    )).toThrow(/task identity/u);
    expect(() => parseOperationResult(
      FABRIC_OPERATIONS.projectionViewPage,
      workPage({ kind: "work", state: "ready", checkState: "passing", workflow }),
    )).toThrow(/state/u);
    expect(() => parseOperationResult(
      FABRIC_OPERATIONS.projectionViewPage,
      workPage({ kind: "work", state: "active", checkState: "pending", workflow }),
    )).toThrow(/checkState/u);
    expect(() => parseOperationResult(
      FABRIC_OPERATIONS.projectionDetailRead,
      workDetail({
        kind: "task",
        taskId: "task_01",
        objective: "Different objective",
        state: "active",
        ownerAgentId: "agent_01",
        workflow,
      }),
    )).toThrow(/objective/u);
    expect(() => parseOperationResult(
      FABRIC_OPERATIONS.projectionDetailRead,
      workDetail({
        kind: "task",
        taskId: "task_wrong",
        objective: "Implement workflow facts",
        state: "active",
        ownerAgentId: "agent_01",
        workflow,
      }),
    )).toThrow(/task identity/u);
  });

  it("enforces negotiated workflow presence on task detail", () => {
    const detailBase = {
      kind: "task",
      taskId: "task_01",
      objective: "Implement workflow facts",
      state: "active",
      ownerAgentId: "agent_01",
    } as const;
    const legacy = parseOperationResult(FABRIC_OPERATIONS.projectionDetailRead, workDetail(detailBase));
    const extended = parseOperationResult(
      FABRIC_OPERATIONS.projectionDetailRead,
      workDetail({ ...detailBase, workflow }),
    );
    const feature = ["operator-projection.v2", "work-facts-projection.v1"] as const;
    expect(assertOperationResultFeatureShape(
      FABRIC_OPERATIONS.projectionDetailRead,
      feature,
      extended,
    )).toBe(extended);
    expect(() => assertOperationResultFeatureShape(
      FABRIC_OPERATIONS.projectionDetailRead,
      feature,
      legacy,
    )).toThrow(expect.objectContaining({ reason: "missing-negotiated-field" }));
  });
});

import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  PROTOCOL_FEATURES,
  assertOperationResultFeatureShape,
  parseOperationResult,
} from "../src/index.js";

const observedAt = "2026-07-22T00:00:00.000Z";
const topology = {
  topologyRevision: 17,
  teams: {
    observation: "Observed",
    memberships: [{
      teamId: "team_01",
      teamGeneration: 2,
      relationship: "Member",
      leadAgentId: "lead_01",
    }],
  },
  supervisor: { observation: "Observed", agentId: "lead_01" },
  currentTask: {
    observation: "Observed",
    taskId: "task_01",
    taskRevision: 3,
    ownerLeaseGeneration: 1,
  },
  nativeChildren: { observation: "Unobserved" },
} as const;

function agentPage(summary: unknown) {
  return {
    status: "page",
    view: "agents",
    rows: [{
      itemId: "agent_01",
      itemRevision: 2,
      fact: {
        freshness: "live",
        source: "fabric",
        revision: 2,
        observedAt,
        value: {
          summary,
          detailRef: { kind: "agent", agentId: "agent_01", expectedRevision: 2 },
          actionAvailability: { state: "read-only", reason: "feature-unavailable" },
        },
      },
    }],
    nextCursor: 1,
    hasMore: false,
    snapshotRevision: 17,
    readTransactionId: "read_agent_topology",
  };
}

function agentDetail(detail: unknown) {
  return {
    status: "current",
    detailRef: { kind: "agent", agentId: "agent_01", expectedRevision: 2 },
    detail: {
      freshness: "live",
      source: "fabric",
      revision: 2,
      observedAt,
      value: detail,
    },
    snapshotRevision: 17,
    readTransactionId: "read_agent_topology_detail",
  };
}

describe("agent-topology-projection.v1 closed result shape", () => {
  it("accepts Fabric-observed team, supervisor and active task-claim facts", () => {
    expect(parseOperationResult(
      FABRIC_OPERATIONS.projectionViewPage,
      agentPage({
        kind: "agent",
        role: "worker",
        lifecycle: "ready",
        contextPressure: "unknown",
        topology,
      }),
    )).toMatchObject({ status: "page", view: "agents" });
  });

  it("requires uniform topology presence exactly when its result feature is negotiated", () => {
    expect(PROTOCOL_FEATURES).toContain("agent-topology-projection.v1");
    const legacySummary = {
      kind: "agent",
      role: "worker",
      lifecycle: "ready",
      contextPressure: "unknown",
    } as const;
    const legacy = parseOperationResult(
      FABRIC_OPERATIONS.projectionViewPage,
      agentPage(legacySummary),
    );
    const extended = parseOperationResult(
      FABRIC_OPERATIONS.projectionViewPage,
      agentPage({ ...legacySummary, topology }),
    );
    const legacyFeatures = ["operator-projection.v2"] as const;
    const extendedFeatures = [...legacyFeatures, "agent-topology-projection.v1"] as const;

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
  });

  it("accepts explicit unobserved and ambiguous relationships on agent detail", () => {
    const detailBase = {
      kind: "agent",
      agentId: "agent_01",
      role: "worker",
      lifecycle: "ready",
      provider: "unbound",
      providerSessionGeneration: 2,
    } as const;
    for (const variant of [
      {
        ...topology,
        teams: { observation: "Observed", memberships: [] },
        supervisor: { observation: "Unobserved" },
        currentTask: { observation: "Unobserved" },
      },
      {
        ...topology,
        currentTask: { observation: "Unknown", reason: "MultipleActiveClaims" },
      },
    ] as const) {
      expect(parseOperationResult(
        FABRIC_OPERATIONS.projectionDetailRead,
        agentDetail({ ...detailBase, topology: variant }),
      )).toMatchObject({ status: "current" });
    }
  });

  it("rejects inferred, malformed and open-ended topology variants", () => {
    const summary = {
      kind: "agent",
      role: "worker",
      lifecycle: "ready",
      contextPressure: "unknown",
    } as const;
    for (const invalid of [
      { ...topology, supervisor: { observation: "Inferred", agentId: "lead_01" } },
      { ...topology, currentTask: { ...topology.currentTask, taskRevision: 0 } },
      { ...topology, nativeChildren: { observation: "Observed", agentIds: [] } },
      { ...topology, inferredParentAgentId: "lead_01" },
      { ...topology, topologyRevision: 16 },
      { ...topology, teams: { observation: "Observed", memberships: [
        ...topology.teams.memberships,
        { ...topology.teams.memberships[0] },
      ] } },
      { ...topology, teams: { observation: "Observed", memberships: [{
        ...topology.teams.memberships[0], relationship: "Lead",
      }] } },
    ]) {
      expect(() => parseOperationResult(
        FABRIC_OPERATIONS.projectionViewPage,
        agentPage({ ...summary, topology: invalid }),
      )).toThrowError();
    }
  });

  it("enforces negotiated topology presence on agent detail", () => {
    const detailBase = {
      kind: "agent",
      agentId: "agent_01",
      role: "worker",
      lifecycle: "ready",
      provider: "unbound",
      providerSessionGeneration: 2,
    } as const;
    const legacy = parseOperationResult(
      FABRIC_OPERATIONS.projectionDetailRead,
      agentDetail(detailBase),
    );
    const extended = parseOperationResult(
      FABRIC_OPERATIONS.projectionDetailRead,
      agentDetail({ ...detailBase, topology }),
    );
    const feature = ["operator-projection.v2", "agent-topology-projection.v1"] as const;
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
    expect(() => parseOperationResult(
      FABRIC_OPERATIONS.projectionDetailRead,
      agentDetail({ ...detailBase, topology: { ...topology, topologyRevision: 16 } }),
    )).toThrow(/topologyRevision/);
    expect(() => parseOperationResult(
      FABRIC_OPERATIONS.projectionDetailRead,
      agentDetail({ ...detailBase, agentId: "agent_other", topology }),
    )).toThrow(/identity/);
  });
});

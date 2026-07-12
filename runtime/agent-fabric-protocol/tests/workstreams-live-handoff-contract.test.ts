import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  FEATURE_OPERATIONS,
  parseOperationInput,
  parseOperationInputForPrincipal,
  parseOperationResult,
  requiredOperatorActionForIntent,
  type ChairLiveHandoffIntent,
} from "../src/index.js";

const digest = `sha256:${"a".repeat(64)}`;
const authority = {
  workspaceRoots: ["."],
  sourcePaths: ["src"],
  artifactPaths: ["artifacts"],
  actions: ["fabric.v1.task.read"],
  disclosure: { level: "forbidden" as const },
  expiresAt: "2027-01-01T00:00:00.000Z",
  budget: { provider_calls: 2 },
};
const chairCommand = {
  commandId: "command_workstream",
  agentId: "chair_1",
  projectSessionId: "session_1",
  coordinationRunId: "run_1",
  principalGeneration: 1,
  chairLeaseId: "chair:run_1:1",
  chairLeaseGeneration: 1,
  expectedRunRevision: 4,
  expectedRevision: 8,
};

const create = {
  command: chairCommand,
  expectedSessionGeneration: 1,
  expectedMembershipRevision: 6,
  workstreamId: "workstream_1",
  deliveryRunId: "delivery_1",
  launchPacketRef: { path: ".agent-run/delivery_1/RUN.json", digest },
  team: {
    teamId: "team_1",
    leader: { agentId: "lead_1", authority },
    rootTask: { taskId: "task_1", objective: "Deliver the slice", baseRevision: "abc123" },
    initialMembers: [{ agentId: "worker_1", authority }],
    discussionGroups: [{ groupId: "group_1", memberAgentIds: ["lead_1", "worker_1"] }],
    reservedBudget: { provider_calls: 2 },
  },
  resources: {
    runScopeId: "scope_run_1",
    teamScopeId: "scope_team_1",
    teamLimits: { provider_calls: 2 },
    agentScopes: [
      { agentId: "lead_1", scopeId: "scope_lead_1", limits: { provider_calls: 1 } },
      { agentId: "worker_1", scopeId: "scope_worker_1", limits: { provider_calls: 1 } },
    ],
  },
};

describe("workstreams.v1 closed protocol", () => {
  it("owns chair-only create and source-derived settle operations", () => {
    expect(FABRIC_OPERATIONS.workstreamCreate).toBe("fabric.v1.workstream.create");
    expect(FABRIC_OPERATIONS.workstreamSettle).toBe("fabric.v1.workstream.settle");
    expect(FEATURE_OPERATIONS["workstreams.v1"]).toEqual([
      FABRIC_OPERATIONS.workstreamCreate,
      FABRIC_OPERATIONS.workstreamSettle,
    ]);
    expect(parseOperationInputForPrincipal(FABRIC_OPERATIONS.workstreamCreate, "agent", create))
      .toEqual(create);
    expect(() => parseOperationInputForPrincipal(FABRIC_OPERATIONS.workstreamCreate, "operator", create))
      .toThrow(/cannot invoke/u);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.workstreamCreate, {
      ...create,
      resources: { ...create.resources, agentScopes: create.resources.agentScopes.slice(0, 1) },
    })).toThrow(/exactly the team agents/u);
  });

  it("does not let the caller choose a settlement state", () => {
    const settle = {
      command: { ...chairCommand, commandId: "command_settle", expectedRunRevision: 5, expectedRevision: 9 },
      expectedSessionGeneration: 1,
      expectedMembershipRevision: 7,
      workstreamId: "workstream_1",
      expectedWorkstreamRevision: 1,
      expectedRootTaskRevision: 3,
      expectedTeamGeneration: 1,
    };
    expect(parseOperationInput(FABRIC_OPERATIONS.workstreamSettle, settle)).toEqual(settle);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.workstreamSettle, {
      ...settle,
      state: "complete",
    })).toThrow(/unknown field/u);
    expect(parseOperationResult(FABRIC_OPERATIONS.workstreamSettle, {
      workstreamId: "workstream_1",
      projectSessionId: "session_1",
      coordinationRunId: "run_1",
      deliveryRunId: "delivery_1",
      teamId: "team_1",
      rootTaskId: "task_1",
      leadAgentId: "lead_1",
      authorityId: "authority_1",
      budgetId: "team_1:budget",
      teamScopeId: "scope_team_1",
      state: "complete",
      revision: 2,
      membershipRevision: 10,
    }).state).toBe("complete");
  });
});

describe("chair-live-handoff.v1 intent", () => {
  const intent: ChairLiveHandoffIntent = {
    kind: "chair-live-handoff",
    schemaVersion: 1,
    projectSessionId: "session_1" as never,
    coordinationRunId: "run_1" as never,
    handoffRef: { path: ".agent-run/handoff.json" as never, digest: digest as never },
    predecessorAgentId: "chair_1" as never,
    successorAgentId: "lead_1" as never,
    successorAuthorityId: "authority_1",
    successorAuthorityDigest: digest as never,
    expectedSessionRevision: 8,
    expectedSessionGeneration: 1,
    expectedMembershipRevision: 6,
    expectedRunRevision: 4,
    expectedChairGeneration: 1,
    expectedChairLeaseId: "chair:run_1:1" as never,
    expectedBridgeRevision: 1,
    expectedChairBridgeGeneration: 1,
    expectedPredecessorPrincipalGeneration: 1,
    expectedSuccessorPrincipalGeneration: 1,
    expectedSuccessorBridgeRevision: 1,
    expectedSuccessorBridgeGeneration: 1,
    providerAdapterId: "adapter_1",
    providerContractDigest: digest as never,
  };

  it("is a takeover action with a closed generation/provider binding", () => {
    expect(requiredOperatorActionForIntent(intent)).toBe("takeover");
    const preview = parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command: {
        credential: { capabilityId: "cap_1", token: "secret-secret-secret" },
        commandId: "preview_handoff",
        expectedRevision: 8,
        actor: "operator_1",
        provenance: { kind: "console-direct-input", clientId: "console_1", inputEventId: "input_1" },
        evidenceRefs: [],
      },
      projectId: "project_1",
      intent,
    });
    expect(preview.intent).toEqual(intent);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command: (preview as { command: unknown }).command,
      projectId: "project_1",
      intent: { ...intent, expectedSuccessorBridgeRevision: undefined },
    })).toThrow();
  });
});

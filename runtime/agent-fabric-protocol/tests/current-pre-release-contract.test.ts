import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  OPERATION_REGISTRY,
  parseLaunchPacketV1,
  parseOperationInput,
  parseOperationResult,
  parseProjectSession,
} from "../src/index.js";

const authority = {
  schemaVersion: 2,
  approval: {
    approvedBy: "human-maintainer",
    evidenceId: "authority-approval",
    evidenceDigest: `sha256:${"a".repeat(64)}`,
  },
  workspaceRoots: ["project"],
  sourcePaths: ["runtime/agent-fabric"],
  artifactPaths: [".agent-run/AFAB-005"],
  actions: [FABRIC_OPERATIONS.createTask],
  deniedPaths: [],
  deniedActions: [],
  prohibitedActions: [],
  disclosure: { level: "forbidden" as const },
  secrets: { access: "none" as const },
  deployment: { allowed: false as const },
  irreversibleActions: { allowed: false as const },
  network: { toolEgress: "none" as const },
  expiresAt: "2026-07-13T12:00:00Z",
  budget: { concurrent_turns: 2 },
};

describe("current pre-release protocol contract", () => {
  it("has no generic operator command operation", () => {
    expect(Reflect.get(FABRIC_OPERATIONS, "operatorCommand")).toBeUndefined();
    expect(Object.hasOwn(OPERATION_REGISTRY, "fabric.v1.operator.command")).toBe(false);
    expect(() => parseOperationInput("fabric.v1.operator.command" as never, {})).toThrowError(
      /unknown fabric operation/iu,
    );
  });

  it("accepts only a closed disclosure policy object", () => {
    expect(() => parseOperationInput(FABRIC_OPERATIONS.delegateAuthority, {
      parentAuthorityId: "authority_parent",
      authority: { ...authority, disclosure: ["local"] },
    })).toThrowError(/disclosure/iu);

    expect(() => parseLaunchPacketV1({
      schemaVersion: 1,
      projectId: "project_01",
      projectSessionId: "ps_01",
      runId: "run_01",
      chairAgentId: "agent_chair",
      projectRunDirectory: ".agent-run/AFAB-005",
      topologyMode: "coordinated",
      budgetRef: "budget_01",
      resourcePlanRef: {
        path: "launch/resources.json",
        digest: `sha256:${"a".repeat(64)}`,
      },
      chairAuthority: { ...authority, disclosure: ["local"] },
      provider: {
        adapterId: "claude-agent-sdk",
        actionId: "provider_action_01",
        contractDigest: `sha256:${"b".repeat(64)}`,
        inputSchemaId: "claude-launch-input.v1",
        input: {},
      },
    })).toThrowError(/disclosure/iu);
  });

  it("keeps task creation independent of scoped human gates", () => {
    expect(() => parseOperationInput(FABRIC_OPERATIONS.createTask, {
      taskId: "task_01",
      authorityId: "authority_01",
      eligibleAgentIds: ["agent_01"],
      objective: "Implement the current contract",
      baseRevision: "base_01",
      commandId: "command_01",
      humanGates: ["approve-release"],
    })).toThrowError(/unknown field: humanGates/iu);
  });

  it("admits a task-bound ephemeral provider spawn under delegated authority", () => {
    const input = {
      adapterId: "agy",
      actionId: "review_gemini_01",
      operation: "spawn",
      taskId: "task_review_01",
      authorityId: "authority_review_01",
      routeRequest: {
        schemaVersion: 1,
        adapterAlias: "agy",
        modelAlias: "gemini",
        explicitModel: "gemini-3.1-pro",
        role: "reviewer",
        leadFamily: "openai",
        requireDistinct: true,
        providerEffort: null,
      },
      certifyingReview: null,
      payload: {
        taskId: "task_review_01",
        model: "gemini-3.1-pro",
        modelFamily: "google",
        prompt: "Review the current implementation read-only.",
        cwd: "src/review",
      },
      commandId: "command_review_01",
    } as const;

    expect(parseOperationInput(FABRIC_OPERATIONS.dispatchProviderAction, input)).toStrictEqual(input);
  });

  it("accepts only atomic structured team creation", () => {
    const input = {
      teamId: "team_01",
      leader: { agentId: "agent_lead", authority },
      rootTask: {
        taskId: "task_root",
        objective: "Deliver the current protocol",
        baseRevision: "base_01",
      },
      initialMembers: [{ agentId: "agent_member", authority }],
      discussionGroups: [{ groupId: "group_01", memberAgentIds: ["agent_lead", "agent_member"] }],
      reservedBudget: { concurrent_turns: 2 },
      commandId: "command_01",
    } as const;

    expect(parseOperationInput(FABRIC_OPERATIONS.createTeam, input)).toStrictEqual(input);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.createTeam, {
      teamId: "team_obsolete_shape",
      leaderAgentId: "agent_lead",
      rootTaskId: "task_root",
      commandId: "command_obsolete_shape",
    })).toThrowError(/leader|unknown field/iu);
  });

  it("returns exact authority identities for atomically registered team members", () => {
    const result = {
      teamId: "team_01",
      parentTeamId: null,
      depth: 1,
      leaderAgentId: "agent_lead",
      rootTaskId: "task_root",
      ownedTaskIds: ["task_root"],
      memberAgentIds: ["agent_lead", "agent_member"],
      budgetId: "team_01:budget",
      state: "active",
      generation: 1,
      successorAgentId: null,
      leader: { agentId: "agent_lead", authorityId: "authority_lead" },
      initialMembers: [{ agentId: "agent_member", authorityId: "authority_member" }],
      discussionGroups: [],
      reservedBudget: { concurrent_turns: 2 },
    } as const;
    expect(parseOperationResult(FABRIC_OPERATIONS.createTeam, result)).toStrictEqual(result);
    expect(() => parseOperationResult(FABRIC_OPERATIONS.createTeam, {
      ...result,
      initialMemberAgentIds: ["agent_member"],
    })).toThrowError(/initialMemberAgentIds/iu);
  });

  it("allows only operator-launched project-session origin", () => {
    expect(() => parseProjectSession({
      projectSessionId: "ps_01",
      projectId: "project_01",
      mode: "coordinated",
      state: "active",
      revision: 1,
      generation: 1,
      authorityRef: `sha256:${"a".repeat(64)}`,
      budgetRef: "budget_01",
      launchPacketRef: { path: "launch.json", digest: `sha256:${"b".repeat(64)}` },
      membershipRevision: 0,
      origin: { kind: "legacy-migration", manifestRef: "migration_01" },
    })).toThrowError(/operator-launch/iu);
  });

  it("retains receipt schema v1 and v2 as archival result formats", () => {
    for (const schemaVersion of [1, 2] as const) {
      expect(parseOperationResult(FABRIC_OPERATIONS.exportReceipt, {
        relativePath: `.agent-run/AFAB-005/receipt-v${schemaVersion}.json`,
        schemaVersion,
        sha256: "a".repeat(64),
      })).toMatchObject({ schemaVersion });
    }
    expect(() => parseOperationResult(FABRIC_OPERATIONS.exportReceipt, {
      relativePath: ".agent-run/AFAB-005/receipt-v3.json",
      schemaVersion: 3,
      sha256: "a".repeat(64),
    })).toThrowError(/schemaVersion/iu);
  });
});

import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";

import { callTool, createMcpFixture } from "../../support/mcp-testkit.ts";
import {
  createStage5TeamFixture,
  createTeam,
  issueTeamLeaderCapability,
  teamAuthority,
  teamCreateInput,
} from "../../support/stage5-team-testkit.ts";

describe("FR-019 / AC-004 bounded team hierarchy", () => {
  it("atomically creates the leader, root task, members, groups and reserved budget", async () => {
    const fixture = await createStage5TeamFixture("run-stage5-team-success");
    try {
      const result = await createTeam(fixture.chair, teamCreateInput({ teamId: "team-alpha" }));

      expect(result).toMatchObject({
        teamId: "team-alpha",
        parentTeamId: null,
        depth: 1,
        leader: {
          agentId: "team-alpha-leader",
          authorityId: expect.any(String),
        },
        rootTask: {
          taskId: "team-alpha-root-task",
          state: "ready",
          proposedOwnerAgentId: "team-alpha-leader",
          ownerLeaseGeneration: 0,
        },
        initialMembers: [
          { agentId: "team-alpha-worker-a", authorityId: expect.any(String) },
          { agentId: "team-alpha-worker-b", authorityId: expect.any(String) },
        ],
        discussionGroups: [{
          groupId: "team-alpha-coordination",
          memberAgentIds: [
            "team-alpha-leader",
            "team-alpha-worker-a",
            "team-alpha-worker-b",
          ],
        }],
        reservedBudget: { turns: 40, "cost:USD": 40, descendants: 6 },
      });
      expect(result.leader).not.toHaveProperty("capability");

      const database = new Database(join(fixture.directory, "fabric.sqlite3"), { readonly: true });
      try {
        expect(database.prepare("SELECT COUNT(*) AS count FROM capabilities").get()).toEqual({ count: 1 });
      } finally {
        database.close();
      }

      const status = await fixture.chair.getRunStatus({ runId: fixture.run.runId });
      expect(status.counts).toMatchObject({ agents: 4, tasks: 1 });
      const agents = await fixture.chair.listAgents({ runId: fixture.run.runId });
      expect(agents.agents).toEqual(expect.arrayContaining([
        expect.objectContaining({ agentId: "team-alpha-leader", parentAgentId: "chair", bridgeState: "none" }),
        expect.objectContaining({ agentId: "team-alpha-worker-a", parentAgentId: "team-alpha-leader", bridgeState: "none" }),
        expect.objectContaining({ agentId: "team-alpha-worker-b", parentAgentId: "team-alpha-leader", bridgeState: "none" }),
      ]));
    } finally {
      await fixture.fabric.close();
    }
  });

  it("automatically binds tasks created by an active team leader into that team subtree", async () => {
    const fixture = await createStage5TeamFixture("run-stage5-team-owned-task");
    try {
      const team = await createTeam(fixture.chair, teamCreateInput({
        teamId: "team-owned-task",
        memberAuthorities: [],
      }));
      const leader = fixture.fabric.connect(await issueTeamLeaderCapability(fixture.chair, team));
      const leaderIdentity = team.leader;
      if (!isIdentity(leaderIdentity)) throw new TypeError("team leader identity is missing");
      const task = await leader.createTask({
        taskId: "team-owned-task-follow-up",
        authorityId: leaderIdentity.authorityId,
        proposedOwnerAgentId: leaderIdentity.agentId,
        participantAgentIds: [leaderIdentity.agentId],
        eligibleAgentIds: [leaderIdentity.agentId],
        dependencies: [],
        objective: "Finish the team follow-up",
        baseRevision: "revision-2",
        commandId: "create-team-owned-follow-up",
      });

      expect(await leader.getTeam({ teamId: "team-owned-task" })).toMatchObject({
        ownedTaskIds: ["team-owned-task-follow-up", "team-owned-task-root-task"],
      });
      expect(task.taskId).toBe("team-owned-task-follow-up");
    } finally {
      await fixture.fabric.close();
    }
  });

  it("does not replay a parent-bound task as an atomic child-team root", async () => {
    const fixture = await createStage5TeamFixture("run-stage5-team-root-dedupe");
    try {
      const parent = await createTeam(fixture.chair, teamCreateInput({
        teamId: "team-preseed-parent",
        memberAuthorities: [],
      }));
      if (!isIdentity(parent.leader)) throw new TypeError("parent leader identity is missing");
      const parentLeader = fixture.fabric.connect(await issueTeamLeaderCapability(fixture.chair, parent));
      const childAuthority = teamAuthority({
        sourcePath: "src/team-preseed-parent/team-preseed-child",
        artifactPath: ".agent-run/team-preseed-parent/team-preseed-child",
        turns: 40,
        costUsd: 40,
        descendants: 6,
      });
      const childInput = teamCreateInput({
        teamId: "team-preseed-child",
        parentTeamId: "team-preseed-parent",
        sourcePath: "src/team-preseed-parent/team-preseed-child",
        artifactPath: ".agent-run/team-preseed-parent/team-preseed-child",
        memberAuthorities: [],
      });
      const grant = await parentLeader.delegateAuthority({
        parentAuthorityId: parent.leader.authorityId,
        authority: childAuthority,
        commandId: "create-team:team-preseed-child:leader-authority",
      });
      await parentLeader.registerAgent({
        agentId: "team-preseed-child-leader",
        authorityId: grant.authorityId,
      });
      await parentLeader.createTask({
        taskId: "team-preseed-child-root-task",
        authorityId: grant.authorityId,
        proposedOwnerAgentId: "team-preseed-child-leader",
        participantAgentIds: ["team-preseed-child-leader"],
        eligibleAgentIds: ["team-preseed-child-leader"],
        dependencies: [],
        objective: "Deliver team-preseed-child",
        baseRevision: "revision-1",
        commandId: "create-team:team-preseed-child:root-task",
      });

      await expect(createTeam(parentLeader, childInput)).rejects.toMatchObject({
        code: "DEDUPE_CONFLICT",
      });
      await expect(parentLeader.getTeam({ teamId: "team-preseed-parent" })).resolves.toMatchObject({
        ownedTaskIds: ["team-preseed-child-root-task", "team-preseed-parent-root-task"],
      });
    } finally {
      await fixture.fabric.close();
    }
  });

  it.each([
    {
      name: "wider member path",
      code: "AUTHORITY_WIDENING",
      input: teamCreateInput({
        teamId: "team-invalid-path",
        memberAuthorities: [{
          agentId: "team-invalid-path-worker",
          authority: teamAuthority({
            sourcePath: "src/outside-team",
            artifactPath: ".agent-run/outside-team",
            turns: 5,
            costUsd: 5,
            descendants: 0,
          }),
        }],
      }),
    },
    {
      name: "over-reserved member budget",
      code: "BUDGET_EXCEEDED",
      input: teamCreateInput({
        teamId: "team-invalid-budget",
        memberAuthorities: [
          {
            agentId: "team-invalid-budget-worker-a",
            authority: teamAuthority({
              sourcePath: "src/team-invalid-budget/worker-a",
              artifactPath: ".agent-run/team-invalid-budget/worker-a",
              turns: 6,
              costUsd: 6,
              descendants: 0,
            }),
          },
          {
            agentId: "team-invalid-budget-worker-b",
            authority: teamAuthority({
              sourcePath: "src/team-invalid-budget/worker-b",
              artifactPath: ".agent-run/team-invalid-budget/worker-b",
              turns: 6,
              costUsd: 6,
              descendants: 0,
            }),
          },
        ],
        reservedBudget: { turns: 10, "cost:USD": 10, descendants: 1 },
      }),
    },
  ])("rejects $name without leaving any agent, task or budget reservation", async ({ code, input }) => {
    const fixture = await createStage5TeamFixture(`run-${String(input.teamId)}`);
    try {
      const before = await fixture.chair.getRunStatus({ runId: fixture.run.runId });
      await expect(createTeam(fixture.chair, input)).rejects.toMatchObject({ code });
      const after = await fixture.chair.getRunStatus({ runId: fixture.run.runId });
      expect(after.counts).toEqual(before.counts);

      const valid = teamCreateInput({
        teamId: `${String(input.teamId)}-valid-after-rejection`,
        reservedBudget: { turns: 40, "cost:USD": 40, descendants: 6 },
      });
      await expect(createTeam(fixture.chair, valid)).resolves.toMatchObject({
        reservedBudget: { turns: 40, "cost:USD": 40, descendants: 6 },
      });
    } finally {
      await fixture.fabric.close();
    }
  });

  it("permits two levels below the chair and atomically rejects a third", async () => {
    const fixture = await createStage5TeamFixture("run-stage5-team-depth");
    try {
      const levelOne = await createTeam(fixture.chair, teamCreateInput({ teamId: "team-level-1", memberAuthorities: [] }));
      const leaderOneCapability = await issueTeamLeaderCapability(fixture.chair, levelOne);
      const levelOneClient = fixture.fabric.connect(leaderOneCapability);
      const levelTwo = await createTeam(levelOneClient, teamCreateInput({
        teamId: "team-level-2",
        parentTeamId: "team-level-1",
        sourcePath: "src/team-level-1/team-level-2",
        artifactPath: ".agent-run/team-level-1/team-level-2",
        memberAuthorities: [],
      }));
      expect(levelTwo).toMatchObject({ parentTeamId: "team-level-1", depth: 2 });

      const leaderTwoCapability = await issueTeamLeaderCapability(levelOneClient, levelTwo);
      const levelTwoClient = fixture.fabric.connect(leaderTwoCapability);
      const before = await fixture.chair.getRunStatus({ runId: fixture.run.runId });
      await expect(createTeam(levelTwoClient, teamCreateInput({
        teamId: "team-level-3",
        parentTeamId: "team-level-2",
        sourcePath: "src/team-level-1/team-level-2/team-level-3",
        artifactPath: ".agent-run/team-level-1/team-level-2/team-level-3",
        memberAuthorities: [],
      }))).rejects.toMatchObject({ code: "TEAM_DEPTH_EXCEEDED" });
      const after = await fixture.chair.getRunStatus({ runId: fixture.run.runId });
      expect(after.counts).toEqual(before.counts);
    } finally {
      await fixture.fabric.close();
    }
  });

  it("atomically debits child-team reservations from the parent team budget", async () => {
    const fixture = await createStage5TeamFixture("run-stage5-parent-budget");
    try {
      const parent = await createTeam(fixture.chair, teamCreateInput({ teamId: "team-budget-parent", memberAuthorities: [], reservedBudget: { turns: 40, "cost:USD": 40, descendants: 6 } }));
      if (typeof parent.budgetId !== "string") throw new TypeError("parent budget id is missing");
      const parentLeader = fixture.fabric.connect(await issueTeamLeaderCapability(fixture.chair, parent));
      await createTeam(parentLeader, teamCreateInput({
        teamId: "team-budget-child-a", parentTeamId: "team-budget-parent",
        sourcePath: "src/team-budget-parent/child-a", artifactPath: ".agent-run/team-budget-parent/child-a",
        memberAuthorities: [], reservedBudget: { turns: 30, "cost:USD": 30, descendants: 4 },
      }));
      await expect(createTeam(parentLeader, teamCreateInput({
        teamId: "team-budget-child-b", parentTeamId: "team-budget-parent",
        sourcePath: "src/team-budget-parent/child-b", artifactPath: ".agent-run/team-budget-parent/child-b",
        memberAuthorities: [], reservedBudget: { turns: 20, "cost:USD": 20, descendants: 3 },
      }))).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
      expect(await parentLeader.getBudget({ budgetId: parent.budgetId })).toMatchObject({
        dimensions: {
          turns: { granted: 40, reserved: 30, available: 10 },
          "cost:USD": { granted: 40, reserved: 30, available: 10 },
          descendants: { granted: 6, reserved: 4, available: 2 },
        },
      });
    } finally {
      await fixture.fabric.close();
    }
  });

  it("exposes the same atomic fabric_team_create operation through MCP", async () => {
    const fixture = await createMcpFixture("run-stage5-team-mcp");
    try {
      const listed = await fixture.chairProxy.client.listTools();
      const tool = listed.tools.find((candidate) => candidate.name === "fabric_team_create");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
        required: ["teamId", "leader", "rootTask", "initialMembers", "discussionGroups", "reservedBudget", "commandId"],
      });
      if (tool === undefined) {
        throw new Error("fabric_team_create is absent from the MCP surface");
      }

      const outcome = await callTool(
        fixture.chairProxy.client,
        "fabric_team_create",
        teamCreateInput({ teamId: "team-mcp" }),
      );
      expect(outcome.isError, outcome.text).toBe(false);
      expect(outcome.structured).toMatchObject({
        teamId: "team-mcp",
        leader: { agentId: "team-mcp-leader" },
        rootTask: { taskId: "team-mcp-root-task" },
        reservedBudget: { turns: 40, "cost:USD": 40, descendants: 6 },
      });
    } finally {
      await fixture.cleanup();
    }
  });
});

function isIdentity(value: unknown): value is { agentId: string; authorityId: string } {
  return typeof value === "object" && value !== null &&
    typeof Reflect.get(value, "agentId") === "string" &&
    typeof Reflect.get(value, "authorityId") === "string";
}

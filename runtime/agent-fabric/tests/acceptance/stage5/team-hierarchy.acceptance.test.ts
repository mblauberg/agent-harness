import { describe, expect, it } from "vitest";

import { callTool, createMcpFixture } from "../../support/mcp-testkit.ts";
import {
  createStage5TeamFixture,
  createTeam,
  requireRecord,
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
          capability: expect.any(String),
        },
        rootTask: {
          taskId: "team-alpha-root-task",
          state: "ready",
          proposedOwnerAgentId: "team-alpha-leader",
          ownerLeaseGeneration: 0,
        },
        initialMemberAgentIds: ["team-alpha-worker-a", "team-alpha-worker-b"],
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

      const status = await fixture.chair.getRunStatus({ runId: fixture.run.runId });
      expect(status.counts).toMatchObject({ agents: 4, tasks: 1 });
      const agents = await fixture.chair.listAgents({ runId: fixture.run.runId });
      expect(agents.agents).toEqual(expect.arrayContaining([
        expect.objectContaining({ agentId: "team-alpha-leader", parentAgentId: "chair" }),
        expect.objectContaining({ agentId: "team-alpha-worker-a", parentAgentId: "team-alpha-leader" }),
        expect.objectContaining({ agentId: "team-alpha-worker-b", parentAgentId: "team-alpha-leader" }),
      ]));
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
      const leaderOne = requireRecord(levelOne.leader, "level-one leader");
      const leaderOneCapability = leaderOne.capability;
      expect(typeof leaderOneCapability).toBe("string");
      if (typeof leaderOneCapability !== "string") {
        throw new TypeError("level-one leader capability is missing");
      }
      const levelOneClient = fixture.fabric.connect(leaderOneCapability);
      const levelTwo = await createTeam(levelOneClient, teamCreateInput({
        teamId: "team-level-2",
        parentTeamId: "team-level-1",
        sourcePath: "src/team-level-1/team-level-2",
        artifactPath: ".agent-run/team-level-1/team-level-2",
        memberAuthorities: [],
      }));
      expect(levelTwo).toMatchObject({ parentTeamId: "team-level-1", depth: 2 });

      const leaderTwo = requireRecord(levelTwo.leader, "level-two leader");
      const leaderTwoCapability = leaderTwo.capability;
      expect(typeof leaderTwoCapability).toBe("string");
      if (typeof leaderTwoCapability !== "string") {
        throw new TypeError("level-two leader capability is missing");
      }
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
      const leader = requireRecord(parent.leader, "parent leader");
      if (typeof leader.capability !== "string") throw new TypeError("parent leader capability is missing");
      if (typeof parent.budgetId !== "string") throw new TypeError("parent budget id is missing");
      const parentLeader = fixture.fabric.connect(leader.capability);
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
        required: [
          "teamId",
          "leader",
          "rootTask",
          "initialMembers",
          "discussionGroups",
          "reservedBudget",
          "commandId",
        ],
      });
      if (tool === undefined) {
        throw new Error("fabric_team_create is absent from the MCP surface");
      }

      const outcome = await callTool(
        fixture.chairProxy.client,
        "fabric_team_create",
        teamCreateInput({ teamId: "team-mcp" }),
      );
      expect(outcome.isError).toBe(false);
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

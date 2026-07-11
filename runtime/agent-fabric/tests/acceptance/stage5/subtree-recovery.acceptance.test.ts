import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createStage5RecoveryFixture, createTeamA } from "../../support/stage5-recovery-testkit.ts";
import {
  createStage5TeamFixture,
  createTeam,
  requireRecord,
  teamCreateInput,
} from "../../support/stage5-team-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("Stage 5 subtree ownership and recovery", () => {
  it("binds each task subtree to one bounded leader", async () => {
    const fixture = await createStage5RecoveryFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const team = await createTeamA(fixture);
    expect(team).toMatchObject({
      teamId: "team-a",
      leaderAgentId: "leader-a",
      rootTaskId: "team-a-root",
      ownedTaskIds: ["team-a-root", "team-a-worker"],
      memberAgentIds: ["leader-a", "worker-a"],
      state: "active",
      generation: 1,
    });

    await expect(
      fixture.chair.createTeam({
        teamId: "team-overlap",
        leaderAgentId: "leader-b",
        rootTaskId: fixture.tasks.rootB.taskId,
        ownedTaskIds: [fixture.tasks.rootB.taskId, fixture.tasks.workerA.taskId],
        memberAgentIds: ["leader-b"],
        authorityId: fixture.authorities.leaderB,
        budget: { turns: 5, "cost:USD": 2 },
        commandId: "stage5:team-overlap:create",
      }),
    ).rejects.toMatchObject({ code: "TASK_SUBTREE_CONFLICT" });
    await expect(
      fixture.leaderA.createTeam({
        teamId: "unauthorised-top-level-team",
        leaderAgentId: "worker-a",
        rootTaskId: fixture.tasks.workerA.taskId,
        ownedTaskIds: [fixture.tasks.workerA.taskId],
        memberAgentIds: ["worker-a"],
        authorityId: fixture.authorities.workerA,
        budget: { turns: 1 },
        commandId: "stage5:team-unauthorised:create",
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
  });

  it("freezes without silent promotion and permits only a chair-fenced adoption", async () => {
    const fixture = await createStage5RecoveryFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const team = await createTeamA(fixture);
    await expect(
      fixture.leaderA.freezeSubtree({
        teamId: team.teamId,
        expectedGeneration: team.generation,
        reason: "self-reported loss",
        commandId: "stage5:freeze:not-chair",
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });

    const frozen = await fixture.chair.freezeSubtree({
      teamId: team.teamId,
      expectedGeneration: team.generation,
      reason: "leader session lost",
      commandId: "stage5:freeze:chair",
    });
    expect(frozen).toMatchObject({
      state: "frozen",
      leaderAgentId: "leader-a",
      successorAgentId: null,
      generation: team.generation + 1,
    });
    expect(await fixture.chair.getTeam({ teamId: team.teamId })).toEqual(frozen);
    await expect(
      fixture.replacement.adoptSubtree({
        teamId: team.teamId,
        successorAgentId: "leader-replacement",
        expectedGeneration: frozen.generation,
        handoffEvidence: "checkpoints/team-a.json#sha256",
        commandId: "stage5:adopt:not-chair",
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });

    const adopted = await fixture.chair.adoptSubtree({
      teamId: team.teamId,
      successorAgentId: "leader-replacement",
      expectedGeneration: frozen.generation,
      handoffEvidence: "checkpoints/team-a.json#sha256",
      commandId: "stage5:adopt:chair",
    });
    expect(adopted).toMatchObject({
      state: "active",
      leaderAgentId: "leader-replacement",
      successorAgentId: "leader-replacement",
      generation: frozen.generation + 1,
    });
    await expect(
      fixture.leaderA.reserveBudget({
        teamId: team.teamId,
        expectedTeamGeneration: team.generation,
        parentBudgetId: adopted.budgetId,
        budgetId: "stale-leader-budget",
        dimensions: { turns: 1 },
        commandId: "stage5:stale-leader:reserve",
      }),
    ).rejects.toMatchObject({ code: "STALE_TEAM_GENERATION" });
  });

  it("freezes every nested team and blocks descendant grants", async () => {
    const fixture = await createStage5TeamFixture("run-stage5-recursive-freeze");
    cleanup.push(async () => fixture.fabric.close());
    const parent = await createTeam(fixture.chair, teamCreateInput({
      teamId: "recursive-parent",
      memberAuthorities: [],
      reservedBudget: { turns: 40, "cost:USD": 40, descendants: 6 },
    }));
    const parentCapability = requireRecord(parent.leader, "parent leader").capability;
    if (typeof parentCapability !== "string") throw new TypeError("parent leader capability is missing");
    const parentLeader = fixture.fabric.connect(parentCapability);
    const child = await createTeam(parentLeader, teamCreateInput({
      teamId: "recursive-child",
      parentTeamId: "recursive-parent",
      sourcePath: "src/recursive-parent/recursive-child",
      artifactPath: ".agent-run/recursive-parent/recursive-child",
      memberAuthorities: [],
      reservedBudget: { turns: 20, "cost:USD": 20, descendants: 3 },
    }));
    const childCapability = requireRecord(child.leader, "child leader").capability;
    if (typeof childCapability !== "string") throw new TypeError("child leader capability is missing");
    const childLeader = fixture.fabric.connect(childCapability);

    await fixture.chair.freezeSubtree({
      teamId: "recursive-parent",
      expectedGeneration: Number(parent.generation),
      reason: "parent leader lost",
      commandId: "stage5:recursive-freeze",
    });

    await expect(fixture.chair.getTeam({ teamId: "recursive-child" })).resolves.toMatchObject({
      state: "frozen",
      generation: Number(child.generation) + 1,
    });
    await expect(childLeader.reserveBudget({
      teamId: "recursive-child",
      expectedTeamGeneration: Number(child.generation) + 1,
      parentBudgetId: String(child.budgetId),
      budgetId: "recursive-child-after-freeze",
      dimensions: { turns: 1 },
      commandId: "stage5:recursive-freeze:reserve",
    })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
  });

  it("adopts a frozen root and reactivates its nested teams at new generations", async () => {
    const fixture = await createStage5TeamFixture("run-stage5-recursive-adoption");
    cleanup.push(async () => fixture.fabric.close());
    const parent = await createTeam(fixture.chair, teamCreateInput({
      teamId: "adoption-parent",
      memberAuthorities: [],
      reservedBudget: { turns: 40, "cost:USD": 40, descendants: 6 },
    }));
    const parentCapability = requireRecord(parent.leader, "parent leader").capability;
    if (typeof parentCapability !== "string") throw new TypeError("parent leader capability is missing");
    const child = await createTeam(fixture.fabric.connect(parentCapability), teamCreateInput({
      teamId: "adoption-child",
      parentTeamId: "adoption-parent",
      sourcePath: "src/adoption-parent/adoption-child",
      artifactPath: ".agent-run/adoption-parent/adoption-child",
      memberAuthorities: [],
      reservedBudget: { turns: 20, "cost:USD": 20, descendants: 3 },
    }));
    await fixture.chair.freezeSubtree({
      teamId: "adoption-parent",
      expectedGeneration: Number(parent.generation),
      reason: "parent leader lost",
      commandId: "stage5:recursive-adoption:freeze",
    });

    const adopted = await fixture.chair.adoptSubtree({
      teamId: "adoption-parent",
      successorAgentId: "chair",
      expectedGeneration: Number(parent.generation) + 1,
      handoffEvidence: "checkpoints/adoption-parent.json#sha256",
      commandId: "stage5:recursive-adoption:adopt",
    });

    expect(adopted).toMatchObject({
      state: "active",
      leaderAgentId: "chair",
      successorAgentId: "chair",
      generation: Number(parent.generation) + 2,
      memberAgentIds: expect.arrayContaining(["chair"]),
    });
    await expect(fixture.chair.getTeam({ teamId: "adoption-child" })).resolves.toMatchObject({
      state: "active",
      generation: Number(child.generation) + 2,
    });
  });
});

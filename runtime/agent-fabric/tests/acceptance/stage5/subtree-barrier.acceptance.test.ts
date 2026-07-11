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

describe("Stage 5 subtree barriers", () => {
  it("lets only the owning leader close its reconciled subtree", async () => {
    const fixture = await createStage5RecoveryFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const team = await createTeamA(fixture);

    await expect(
      fixture.leaderB.closeSubtreeBarrier({
        teamId: team.teamId,
        expectedGeneration: team.generation,
        commandId: "stage5:barrier:wrong-leader",
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    await expect(
      fixture.workerA.closeSubtreeBarrier({
        teamId: team.teamId,
        expectedGeneration: team.generation,
        commandId: "stage5:barrier:worker",
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    await expect(
      fixture.leaderA.closeSubtreeBarrier({
        teamId: team.teamId,
        expectedGeneration: team.generation,
        commandId: "stage5:barrier:open-work",
      }),
    ).rejects.toMatchObject({ code: "BARRIER_PRECONDITION_FAILED" });

    const workerComplete = await fixture.workerA.updateTask({
      taskId: fixture.tasks.workerA.taskId,
      expectedRevision: fixture.tasks.workerA.revision,
      state: "complete",
      commandId: "stage5:barrier:worker-complete",
    });
    const rootComplete = await fixture.leaderA.updateTask({
      taskId: fixture.tasks.rootA.taskId,
      expectedRevision: fixture.tasks.rootA.revision,
      state: "complete",
      commandId: "stage5:barrier:root-complete",
    });
    await expect(fixture.leaderB.acknowledgeTaskHandoff({
      taskId: workerComplete.taskId,
      taskRevision: workerComplete.revision,
      ownerLeaseGeneration: workerComplete.ownerLeaseGeneration,
      commandId: "stage5:barrier:worker-handoff-unrelated",
    })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    await fixture.leaderA.acknowledgeTaskHandoff({
      taskId: workerComplete.taskId,
      taskRevision: workerComplete.revision,
      ownerLeaseGeneration: workerComplete.ownerLeaseGeneration,
      commandId: "stage5:barrier:worker-handoff",
    });
    await fixture.chair.acknowledgeTaskHandoff({
      taskId: rootComplete.taskId,
      taskRevision: rootComplete.revision,
      ownerLeaseGeneration: rootComplete.ownerLeaseGeneration,
      commandId: "stage5:barrier:root-handoff",
    });
    await expect(
      fixture.leaderA.closeSubtreeBarrier({
        teamId: team.teamId,
        expectedGeneration: team.generation,
        commandId: "stage5:barrier:close",
      }),
    ).resolves.toEqual({ teamId: team.teamId, generation: team.generation, closed: true });
    await expect(
      fixture.leaderA.closeBarrier({
        scope: "stage",
        stageId: "stage5",
        commandId: "stage5:barrier:global-not-leader",
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
  });

  it("keeps a parent barrier open until every nested team task is terminal", async () => {
    const fixture = await createStage5TeamFixture("run-stage5-recursive-barrier");
    cleanup.push(async () => fixture.fabric.close());
    const parent = await createTeam(fixture.chair, teamCreateInput({
      teamId: "barrier-parent",
      memberAuthorities: [],
      reservedBudget: { turns: 40, "cost:USD": 40, descendants: 6 },
    }));
    const parentCapability = requireRecord(parent.leader, "parent leader").capability;
    if (typeof parentCapability !== "string") throw new TypeError("parent leader capability is missing");
    const parentLeader = fixture.fabric.connect(parentCapability);
    const child = await createTeam(parentLeader, teamCreateInput({
      teamId: "barrier-child",
      parentTeamId: "barrier-parent",
      sourcePath: "src/barrier-parent/barrier-child",
      artifactPath: ".agent-run/barrier-parent/barrier-child",
      memberAuthorities: [],
      reservedBudget: { turns: 20, "cost:USD": 20, descendants: 3 },
    }));
    const childCapability = requireRecord(child.leader, "child leader").capability;
    if (typeof childCapability !== "string") throw new TypeError("child leader capability is missing");
    const childLeader = fixture.fabric.connect(childCapability);
    const parentRoot = requireRecord(parent.rootTask, "parent root task");
    const parentClaimed = await parentLeader.claimTask({
      taskId: String(parent.rootTaskId),
      expectedRevision: Number(parentRoot.revision),
      commandId: "stage5:recursive-barrier:parent-claim",
    });
    const parentComplete = await parentLeader.updateTask({
      taskId: parentClaimed.taskId,
      expectedRevision: parentClaimed.revision,
      state: "complete",
      commandId: "stage5:recursive-barrier:parent-complete",
    });
    await fixture.chair.acknowledgeTaskHandoff({
      taskId: parentComplete.taskId,
      taskRevision: parentComplete.revision,
      ownerLeaseGeneration: parentComplete.ownerLeaseGeneration,
      commandId: "stage5:recursive-barrier:parent-handoff",
    });

    await expect(parentLeader.closeSubtreeBarrier({
      teamId: "barrier-parent",
      expectedGeneration: Number(parent.generation),
      commandId: "stage5:recursive-barrier:premature",
    })).rejects.toMatchObject({ code: "BARRIER_PRECONDITION_FAILED" });

    const childRoot = requireRecord(child.rootTask, "child root task");
    const childClaimed = await childLeader.claimTask({
      taskId: String(child.rootTaskId),
      expectedRevision: Number(childRoot.revision),
      commandId: "stage5:recursive-barrier:child-claim",
    });
    const childComplete = await childLeader.updateTask({
      taskId: childClaimed.taskId,
      expectedRevision: childClaimed.revision,
      state: "complete",
      commandId: "stage5:recursive-barrier:child-complete",
    });
    await parentLeader.acknowledgeTaskHandoff({
      taskId: childComplete.taskId,
      taskRevision: childComplete.revision,
      ownerLeaseGeneration: childComplete.ownerLeaseGeneration,
      commandId: "stage5:recursive-barrier:child-handoff",
    });
    await expect(parentLeader.closeSubtreeBarrier({
      teamId: "barrier-parent",
      expectedGeneration: Number(parent.generation),
      commandId: "stage5:recursive-barrier:close",
    })).resolves.toMatchObject({ closed: true });
    await expect(fixture.chair.getTeam({ teamId: "barrier-child" })).resolves.toMatchObject({
      state: "barrier-closed",
    });
  });
});

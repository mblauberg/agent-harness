import { access, rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createLifecycleFixture, writeLifecycleCheckpoint } from "../../support/lifecycle-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("AC-008 Stage 3 safe completion", () => {
  it("refuses release until write leases, children, tasks and the barrier are reconciled", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const lease = await fixture.leader.acquireWriteLease({
      scope: ["src/leader"],
      ttlMs: 60_000,
      commandId: "completion:lease:acquire",
    });
    const blockedCheckpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task", "child-task"],
      nextAction: "release the write lease and reconcile child",
    });
    await fixture.leader.requestLifecycle({
      action: "completion-ready",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint: blockedCheckpoint,
      commandId: "completion:ready:blocked",
    });

    await expect(
      fixture.leader.requestLifecycle({
        action: "release",
        agentId: "leader",
        taskId: fixture.leaderTask.taskId,
        taskRevision: fixture.leaderTask.revision,
        checkpoint: blockedCheckpoint,
        commandId: "completion:release:blocked",
      }),
    ).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });

    await fixture.leader.releaseWriteLease({
      leaseId: lease.leaseId,
      expectedGeneration: lease.generation,
      commandId: "completion:lease:release",
    });
    const childTask = await fixture.child.updateTask({
      taskId: fixture.childTask.taskId,
      expectedRevision: fixture.childTask.revision,
      state: "complete",
      commandId: "completion:child-task:complete",
    });
    const leaderTask = await fixture.leader.updateTask({
      taskId: fixture.leaderTask.taskId,
      expectedRevision: fixture.leaderTask.revision,
      state: "complete",
      commandId: "completion:leader-task:complete",
    });
    const childCheckpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "child",
      nextAction: "release",
    });
    await fixture.child.requestLifecycle({
      action: "completion-ready",
      agentId: "child",
      taskId: childTask.taskId,
      taskRevision: childTask.revision,
      checkpoint: childCheckpoint,
      commandId: "completion:child:ready",
    });
    const finalCheckpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      nextAction: "release",
    });
    await fixture.leader.requestLifecycle({
      action: "completion-ready",
      agentId: "leader",
      taskId: leaderTask.taskId,
      taskRevision: leaderTask.revision,
      checkpoint: finalCheckpoint,
      commandId: "completion:leader:ready",
    });
    await fixture.chair.closeBarrier({ scope: "run", commandId: "completion:barrier:close" });
    await fixture.child.requestLifecycle({
      action: "release",
      agentId: "child",
      taskId: childTask.taskId,
      taskRevision: childTask.revision,
      checkpoint: childCheckpoint,
      commandId: "completion:child:release",
    });
    const released = await fixture.leader.requestLifecycle({
      action: "release",
      agentId: "leader",
      taskId: leaderTask.taskId,
      taskRevision: leaderTask.revision,
      checkpoint: finalCheckpoint,
      commandId: "completion:leader:release",
    });

    expect(released).toMatchObject({ agentId: "leader", lifecycle: "archived" });
    await expect(access(fixture.providerSessionMarker)).resolves.toBeUndefined();
  });
});

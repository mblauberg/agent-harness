import { access, rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createLifecycleFixture, writeLifecycleCheckpoint } from "../../support/lifecycle-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("AC-009 Stage 3 unannounced provider compaction", () => {
  it("fences an unreconciled context from writes and barriers, then rotates through a verified checkpoint", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 1,
      contextRevision: "context-1",
      commandId: "compaction:observe:g1",
    });
    const unreconciled = await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: "context-2-unannounced",
      commandId: "compaction:observe:g2",
    });
    expect(unreconciled).toMatchObject({ agentId: "leader", lifecycle: "context-unreconciled" });

    await expect(
      fixture.leader.acquireWriteLease({
        scope: ["src/leader"],
        ttlMs: 60_000,
        commandId: "compaction:write:blocked",
      }),
    ).rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });

    const childTask = await fixture.child.updateTask({
      taskId: fixture.childTask.taskId,
      expectedRevision: fixture.childTask.revision,
      state: "complete",
      commandId: "compaction:child-task:complete",
    });
    void childTask;
    const leaderTask = await fixture.leader.updateTask({
      taskId: fixture.leaderTask.taskId,
      expectedRevision: fixture.leaderTask.revision,
      state: "complete",
      commandId: "compaction:leader-task:complete",
    });
    await expect(
      fixture.chair.closeBarrier({ scope: "stage", stageId: "compaction", commandId: "compaction:barrier:blocked" }),
    ).rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });

    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      nextAction: "rotate into a fresh managed session",
    });
    const rotated = await fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: leaderTask.taskId,
      taskRevision: leaderTask.revision,
      checkpoint,
      commandId: "compaction:rotate:verified",
    });

    expect(rotated).toMatchObject({
      agentId: "leader",
      lifecycle: "ready",
      providerSessionGeneration: 3,
      rotation: {
        kind: "replacement-session",
        priorResumeReference: fixture.providerSessionMarker,
      },
    });
    await expect(access(fixture.providerSessionMarker)).resolves.toBeUndefined();
  });
});

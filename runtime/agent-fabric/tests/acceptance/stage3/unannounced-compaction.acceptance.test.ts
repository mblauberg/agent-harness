import { access, rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createLifecycleFixture, writeLifecycleCheckpoint } from "../../support/lifecycle-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("AC-009 Stage 3 unannounced provider compaction", () => {
  it("does not reconcile a changed provider context from an arbitrary checkpoint digest", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 1,
      contextRevision: "context-1",
      commandId: "compaction:forged:observe:g1",
    });

    const changed = await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: "context-2",
      checkpointSha256: "a".repeat(64),
      commandId: "compaction:forged:observe:g2",
    });

    expect(changed).toMatchObject({
      agentId: "leader",
      lifecycle: "context-unreconciled",
      providerSessionGeneration: 2,
    });
  });

  it("does not reconcile from a validated checkpoint after its child state changes", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 1,
      contextRevision: "context-1",
      commandId: "compaction:stale-child:observe:g1",
    });
    const leaderCheckpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "wait for the child",
    });
    await fixture.leader.requestLifecycle({
      action: "completion-ready",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint: leaderCheckpoint,
      commandId: "compaction:stale-child:leader-checkpoint",
    });
    const childTask = await fixture.child.updateTask({
      taskId: fixture.childTask.taskId,
      expectedRevision: fixture.childTask.revision,
      state: "complete",
      commandId: "compaction:stale-child:child-task-complete",
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
      commandId: "compaction:stale-child:child-checkpoint",
    });

    const changed = await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: "context-2",
      checkpointSha256: leaderCheckpoint.sha256,
      commandId: "compaction:stale-child:observe:g2",
    });

    expect(changed).toMatchObject({
      lifecycle: "context-unreconciled",
      providerSessionGeneration: 2,
    });
  });

  it("reconciles only while the checkpoint task revision remains current", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 1,
      contextRevision: "context-1",
      commandId: "compaction:task-revision:observe:g1",
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "continue from the current task revision",
    });
    await fixture.leader.requestLifecycle({
      action: "completion-ready",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "compaction:task-revision:checkpoint",
    });

    await expect(fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: "context-2",
      checkpointSha256: checkpoint.sha256,
      commandId: "compaction:task-revision:observe:g2",
    })).resolves.toMatchObject({
      lifecycle: "completion-ready",
      providerSessionGeneration: 2,
    });

    await fixture.leader.updateTask({
      taskId: fixture.leaderTask.taskId,
      expectedRevision: fixture.leaderTask.revision,
      state: "complete",
      commandId: "compaction:task-revision:task-complete",
    });
    await expect(fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 3,
      contextRevision: "context-3",
      checkpointSha256: checkpoint.sha256,
      commandId: "compaction:task-revision:observe:g3",
    })).resolves.toMatchObject({
      lifecycle: "context-unreconciled",
      providerSessionGeneration: 3,
    });
  });

  it("fences delivery, provider turns and retained write custody after an unannounced change", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 1,
      contextRevision: "context-1",
      commandId: "compaction:custody:observe:g1",
    });
    const lease = await fixture.leader.acquireWriteLease({
      scope: ["src/leader"],
      ttlMs: 60_000,
      commandId: "compaction:custody:lease",
    });
    await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["leader"] },
      kind: "request",
      body: "deliver only after context recovery",
      requiresAck: true,
      dedupeKey: "compaction:custody:message",
      context: { kind: "task", taskId: fixture.leaderTask.taskId },
    });

    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: "context-2-unannounced",
      commandId: "compaction:custody:observe:g2",
    });

    await expect(fixture.leader.getWriteLease({ leaseId: lease.leaseId })).resolves.toMatchObject({
      status: "quarantined",
    });
    await expect(fixture.leader.receiveMessages({ limit: 1, visibilityTimeoutMs: 30_000 }))
      .rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });
    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "compaction-custody-turn",
      operation: "send_turn",
      payload: { taskId: fixture.leaderTask.taskId, scenario: "terminal" },
      commandId: "compaction:custody:turn",
    })).rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });
    await expect(fixture.chair.closeBarrier({
      scope: "stage",
      stageId: "compaction-custody",
      commandId: "compaction:custody:barrier",
    })).rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });
  });

  it("admits only explicit rotation as lifecycle recovery from an unreconciled context", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 1,
      contextRevision: "context-1",
      commandId: "compaction:recovery-only:observe:g1",
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: "context-2-unannounced",
      commandId: "compaction:recovery-only:observe:g2",
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "rotate through the verified recovery path",
    });

    await expect(fixture.leader.requestLifecycle({
      action: "completion-ready",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "compaction:recovery-only:completion-ready",
    })).rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });
  });

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

    await expect(
      fixture.chair.closeBarrier({ scope: "stage", stageId: "compaction", commandId: "compaction:barrier:blocked" }),
    ).rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });

    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "rotate into a fresh managed session",
    });
    const rotated = await fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
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

import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createLifecycleFixture, writeLifecycleCheckpoint } from "../../support/lifecycle-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("FR-013 Stage 3 checkpointed lifecycle requests", () => {
  it("rejects rotation when the durable checkpoint omits resume-critical fields", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const complete = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "reconcile child before rotation",
    });
    const incomplete: unknown = {
      relativePath: complete.relativePath,
      sha256: complete.sha256,
      mailboxWatermark: complete.mailboxWatermark,
      acknowledgedAboveWatermark: complete.acknowledgedAboveWatermark,
      inFlightChildren: complete.inFlightChildren,
    };

    const requestLifecycle: unknown = Reflect.get(fixture.leader, "requestLifecycle");
    if (typeof requestLifecycle !== "function") throw new Error("requestLifecycle is unavailable");

    await expect(
      Reflect.apply(requestLifecycle, fixture.leader, [{
        action: "rotate",
        agentId: "leader",
        taskId: fixture.leaderTask.taskId,
        taskRevision: fixture.leaderTask.revision,
        checkpoint: incomplete,
        commandId: "lifecycle:rotate:incomplete",
      }]),
    ).rejects.toMatchObject({ code: "CHECKPOINT_INCOMPLETE" });
  });

  it("accepts a complete checkpoint as the only portable lifecycle handoff", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "resume the task graph from the recorded revision",
    });

    const result = await fixture.leader.requestLifecycle({
      action: "completion-ready",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:completion-ready:complete",
    });

    expect(result).toMatchObject({ agentId: "leader", lifecycle: "completion-ready" });
  });
});

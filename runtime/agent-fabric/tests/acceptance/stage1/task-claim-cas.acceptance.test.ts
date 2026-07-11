import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createStage1Fixture } from "../../support/stage1-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("Stage 1 one-owner task claim and CAS revision", () => {
  it("commits exactly one concurrent claimant and rejects stale revisions", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });

    const created = await fixture.chair.createTask({
      taskId: "task-claim",
      authorityId: fixture.authorities.chair,
      eligibleAgentIds: ["alice", "bob"],
      objective: "Produce one immutable patch",
      baseRevision: "rev-1",
      commandId: "task:create:claim",
    });
    expect(created).toMatchObject({
      taskId: "task-claim",
      ownerAgentId: null,
      state: "ready",
      revision: 1,
    });

    const attempts = await Promise.allSettled([
      fixture.alice.claimTask({
        taskId: created.taskId,
        expectedRevision: 1,
        commandId: "task:claim:alice",
      }),
      fixture.bob.claimTask({
        taskId: created.taskId,
        expectedRevision: 1,
        commandId: "task:claim:bob",
      }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect(attempts.find((attempt) => attempt.status === "rejected")).toMatchObject({
      reason: { code: "TASK_REVISION_CONFLICT" },
    });

    const claimed = await fixture.chair.getTask({ taskId: created.taskId });
    expect(claimed).toMatchObject({
      ownerAgentId: expect.stringMatching(/^(alice|bob)$/u),
      state: "active",
      revision: 2,
    });
    const owner = claimed.ownerAgentId === "alice" ? fixture.alice : fixture.bob;
    const nonOwner = claimed.ownerAgentId === "alice" ? fixture.bob : fixture.alice;

    await expect(
      nonOwner.updateTask({
        taskId: created.taskId,
        expectedRevision: 2,
        state: "complete",
        commandId: "task:complete:non-owner",
      }),
    ).rejects.toMatchObject({ code: "TASK_NOT_OWNER" });

    const completed = await owner.updateTask({
      taskId: created.taskId,
      expectedRevision: 2,
      state: "complete",
      commandId: "task:complete:owner",
    });
    expect(completed).toMatchObject({ state: "complete", revision: 3 });
    await expect(
      owner.updateTask({
        taskId: created.taskId,
        expectedRevision: 2,
        state: "cancelled",
        commandId: "task:stale-owner",
      }),
    ).rejects.toMatchObject({ code: "TASK_REVISION_CONFLICT" });
  });
});

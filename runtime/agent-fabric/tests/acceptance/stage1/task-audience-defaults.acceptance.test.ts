import { afterEach, describe, expect, it } from "vitest";

import { createStage1Fixture } from "../../support/stage1-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("task audience defaults", () => {
  it("rejects an implicit participant set larger than the protocol can represent", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(() => fixture.fabric.close());

    await expect(fixture.chair.createTask({
      taskId: "oversized-default-task-audience",
      authorityId: fixture.authorities.alice,
      eligibleAgentIds: Array.from({ length: 256 }, (_, index) => `eligible-${String(index)}`),
      objective: "reject an unrepresentable default audience",
      baseRevision: "base",
      commandId: "oversized-default-task-audience:create",
    })).rejects.toThrow("task participants exceed the protocol limit");
  });

  it("defaults omitted participants to creator and eligible agents without a sender echo", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(() => fixture.fabric.close());
    const task = await fixture.chair.createTask({
      taskId: "default-task-audience",
      authorityId: fixture.authorities.alice,
      eligibleAgentIds: ["alice", "bob"],
      proposedOwnerAgentId: "alice",
      objective: "message the default task audience",
      baseRevision: "base",
      commandId: "default-task-audience:create",
    });

    await fixture.chair.sendMessage({
      audience: { kind: "task", taskId: task.taskId },
      kind: "request",
      body: "Roundtrip request",
      requiresAck: true,
      dedupeKey: "default-task-audience:request",
    });

    await expect(fixture.chair.receiveMessages({ limit: 10, visibilityTimeoutMs: 1_000 }))
      .resolves.toEqual([]);
    await expect(fixture.alice.receiveMessages({ limit: 10, visibilityTimeoutMs: 1_000 }))
      .resolves.toHaveLength(1);
    await expect(fixture.bob.receiveMessages({ limit: 10, visibilityTimeoutMs: 1_000 }))
      .resolves.toHaveLength(1);
    await expect(fixture.chair.getRunStatus({ runId: fixture.run.runId })).resolves.toMatchObject({
      counts: { deliveriesUnacknowledged: 2 },
    });
  });
});

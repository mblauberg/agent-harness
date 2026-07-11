import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import { createStage1Fixture } from "../../support/stage1-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("Stage 1 restart recovery", () => {
  it("recovers mailbox watermark, task revision and lease generation through public reads", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(async () => rm(fixture.directory, { recursive: true, force: true }));

    await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["alice"] },
      kind: "request",
      body: "first",
      requiresAck: true,
      dedupeKey: "restart:first",
    });
    await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["alice"] },
      kind: "request",
      body: "second",
      requiresAck: true,
      dedupeKey: "restart:second",
    });
    const deliveries = await fixture.alice.receiveMessages({ limit: 2, visibilityTimeoutMs: 1_000 });
    expect(deliveries).toHaveLength(2);
    const secondDelivery = deliveries.at(1);
    if (secondDelivery === undefined) {
      throw new Error("expected the second delivery");
    }
    await fixture.alice.acknowledgeDelivery({ deliveryId: secondDelivery.deliveryId });

    const task = await fixture.chair.createTask({
      taskId: "task-restart",
      authorityId: fixture.authorities.alice,
      eligibleAgentIds: ["alice"],
      objective: "Survive restart",
      baseRevision: "rev-1",
      commandId: "task:create:restart",
    });
    await fixture.alice.claimTask({
      taskId: task.taskId,
      expectedRevision: task.revision,
      commandId: "task:claim:restart",
    });

    const lease = await fixture.alice.acquireWriteLease({
      scope: ["src/alice"],
      ttlMs: 1_000,
      commandId: "lease:restart:acquire",
    });
    fixture.clock.advance(1_001);
    await fixture.chair.recordRevocationProof({
      leaseId: lease.leaseId,
      generation: 1,
      kind: "predecessor-terminal",
      detail: { agentId: "alice", providerSessionRef: "session-alice" },
      commandId: "lease:restart:proof",
    });
    const recoveredLease = await fixture.chair.recoverWriteLease({
      leaseId: lease.leaseId,
      expectedGeneration: 1,
      commandId: "lease:restart:recover",
      evidence: {
        kind: "predecessor-terminal",
        agentId: "alice",
        providerSessionRef: "session-alice",
      },
    });
    expect(recoveredLease.generation).toBe(2);
    await fixture.fabric.close();

    const reopened = await openFabric({ databasePath: fixture.databasePath, workspaceRoots: [fixture.directory], clock: fixture.clock.now });
    cleanup.push(() => reopened.close());
    const chair = reopened.connect(fixture.capabilities.chair);
    const alice = reopened.connect(fixture.capabilities.alice);
    const reopenedChair = reopened.connect(fixture.capabilities.chair);

    expect(await alice.getMailboxState()).toEqual({
      contiguousWatermark: 0,
      acknowledgedAboveWatermark: [2],
    });
    expect(await chair.getTask({ taskId: task.taskId })).toMatchObject({
      ownerAgentId: "alice",
      state: "active",
      revision: 2,
    });
    expect(await reopenedChair.getWriteLease({ leaseId: lease.leaseId })).toMatchObject({
      holderAgentId: "chair",
      generation: 2,
      status: "active",
    });

    fixture.clock.advance(1_001);
    const redelivery = await alice.receiveMessages({ limit: 2, visibilityTimeoutMs: 1_000 });
    expect(redelivery.map(({ sequence }) => sequence)).toEqual([1]);
    const firstRedelivery = redelivery.at(0);
    if (firstRedelivery === undefined) {
      throw new Error("expected the first delivery to be redelivered");
    }
    await alice.acknowledgeDelivery({ deliveryId: firstRedelivery.deliveryId });
    expect(await alice.getMailboxState()).toEqual({
      contiguousWatermark: 2,
      acknowledgedAboveWatermark: [],
    });
  });
});

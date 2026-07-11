import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createStage1Fixture } from "../../support/stage1-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("Stage 1 durable per-recipient mailbox", () => {
  it("orders, claims and acknowledges independently while advancing only a contiguous watermark", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });

    const first = await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["alice", "bob"] },
      kind: "request",
      body: "first",
      requiresAck: true,
      dedupeKey: "chair:first",
    });
    const second = await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["alice"] },
      kind: "request",
      body: "second",
      requiresAck: true,
      dedupeKey: "chair:second",
    });

    const aliceClaims = await fixture.alice.receiveMessages({ limit: 2, visibilityTimeoutMs: 5_000 });
    const bobClaims = await fixture.bob.receiveMessages({ limit: 2, visibilityTimeoutMs: 5_000 });
    expect(aliceClaims.map(({ messageId, sequence, body, senderId, kind, requiresAck }) => ({
      messageId,
      sequence,
      body,
      senderId,
      kind,
      requiresAck,
    }))).toEqual([
      { messageId: first.messageId, sequence: 1, body: "first", senderId: "chair", kind: "request", requiresAck: true },
      { messageId: second.messageId, sequence: 2, body: "second", senderId: "chair", kind: "request", requiresAck: true },
    ]);
    expect(bobClaims.map(({ messageId, sequence }) => ({ messageId, sequence }))).toEqual([
      { messageId: first.messageId, sequence: 1 },
    ]);
    expect(await fixture.alice.receiveMessages({ limit: 2, visibilityTimeoutMs: 5_000 })).toEqual([]);

    const secondAliceClaim = aliceClaims[1];
    const firstAliceClaim = aliceClaims[0];
    const firstBobClaim = bobClaims[0];
    if (secondAliceClaim === undefined || firstAliceClaim === undefined || firstBobClaim === undefined) {
      throw new Error("expected mailbox claims were not returned");
    }
    await fixture.alice.acknowledgeDelivery({ deliveryId: secondAliceClaim.deliveryId });
    expect(await fixture.alice.getMailboxState()).toMatchObject({
      contiguousWatermark: 0,
      acknowledgedAboveWatermark: [2],
    });
    await fixture.alice.acknowledgeDelivery({ deliveryId: firstAliceClaim.deliveryId });
    expect(await fixture.alice.getMailboxState()).toMatchObject({
      contiguousWatermark: 2,
      acknowledgedAboveWatermark: [],
    });
    expect(await fixture.bob.getMailboxState()).toMatchObject({ contiguousWatermark: 0 });

    fixture.clock.advance(5_001);
    const bobRedelivery = await fixture.bob.receiveMessages({ limit: 1, visibilityTimeoutMs: 5_000 });
    expect(bobRedelivery).toHaveLength(1);
    const redelivery = bobRedelivery[0];
    if (redelivery === undefined) {
      throw new Error("expected Bob's delivery to be retried");
    }
    expect(redelivery).toMatchObject({
      deliveryId: firstBobClaim.deliveryId,
      messageId: first.messageId,
      sequence: 1,
      attempt: 2,
    });
  });

  it("makes sender-scoped dedupe idempotent and rejects key reuse with changed payload or audience", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const command = {
      audience: { kind: "agents" as const, agentIds: ["alice"] },
      kind: "request" as const,
      body: "inspect",
      requiresAck: true,
      dedupeKey: "chair:inspect:1",
    };

    const original = await fixture.chair.sendMessage(command);
    const retry = await fixture.chair.sendMessage(command);
    expect(retry).toEqual(original);
    expect(await fixture.alice.receiveMessages({ limit: 10, visibilityTimeoutMs: 5_000 })).toHaveLength(1);

    await expect(fixture.chair.sendMessage({ ...command, body: "changed" })).rejects.toMatchObject({
      code: "DEDUPE_CONFLICT",
    });
    await expect(
      fixture.chair.sendMessage({
        ...command,
        audience: { kind: "agents", agentIds: ["alice", "bob"] },
      }),
    ).rejects.toMatchObject({ code: "DEDUPE_CONFLICT" });
  });
});

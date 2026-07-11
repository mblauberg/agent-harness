import { afterEach, describe, expect, it } from "vitest";

import { createDaemonFixture, DAEMON_ROOT_AUTHORITY } from "../support/daemon-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("Stage 1 shared daemon store", () => {
  it("rejects unknown authority fields instead of silently broadening them", async () => {
    const fixture = await createDaemonFixture("run-authority-parser");
    cleanup.push(fixture.cleanup);
    const malformedAuthority = { ...DAEMON_ROOT_AUTHORITY, deniedPath: ["private"] };

    await expect(fixture.bootstrap.createRun({
      runId: "run-authority-parser-typo",
      chair: { agentId: "chair", authority: malformedAuthority },
    })).rejects.toThrow(/authority contains unknown fields: deniedPath/u);
  });

  it("lets two capability-bound clients exchange and acknowledge one durable delivery", async () => {
    const fixture = await createDaemonFixture("run-two-clients");
    cleanup.push(fixture.cleanup);

    const sent = await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "inspect artifact sha256:abc",
      requiresAck: true,
      dedupeKey: "two-clients:message:1",
    });
    const deliveries = await fixture.peer.receiveMessages({ limit: 1, visibilityTimeoutMs: 5_000 });
    expect(deliveries).toHaveLength(1);
    const delivery = deliveries.at(0);
    if (delivery === undefined) {
      throw new Error("expected one peer delivery");
    }
    expect(delivery).toMatchObject({
      messageId: sent.messageId,
      sequence: 1,
      attempt: 1,
      senderId: "chair",
      kind: "request",
      requiresAck: true,
    });
    await fixture.peer.acknowledgeDelivery({ deliveryId: delivery.deliveryId });
    expect(await fixture.peer.getMailboxState()).toEqual({
      contiguousWatermark: 1,
      acknowledgedAboveWatermark: [],
    });
  });
});

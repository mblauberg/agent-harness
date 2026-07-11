import { afterEach, describe, expect, it } from "vitest";

import { createVisibilityCoordinator } from "../../../src/index.ts";
import { createVisibilityFixture } from "../../support/visibility-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("AC-003A interactive paired round trip", () => {
  it("persists both directions and leaves a missed deadline pending with operator escalation", async () => {
    const fixture = await createVisibilityFixture("run-interactive-roundtrip");
    cleanup.push(fixture.cleanup);
    const coordinator = await createVisibilityCoordinator({
      runId: fixture.run.runId,
      profileName: "paired-visible",
      chairInHerdr: true,
      clients: { chair: fixture.chair, peer: fixture.peer },
      herdr: fixture.herdr,
      provider: fixture.provider,
      clock: fixture.clock.now,
      evidenceSink: fixture.chair,
    });
    await coordinator.startPair({
      chair: { agentId: "chair", provider: "claude", sessionRef: "claude-session-1", paneId: "w-test:p-chair" },
      peer: { agentId: "peer", provider: "codex", sessionRef: "codex-session-1", paneId: "w-test:p-peer" },
    });

    const request = await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "review artifact",
      requiresAck: true,
      dedupeKey: "roundtrip:request",
    });
    await coordinator.notifyUnread({ agentId: "peer", messageId: request.messageId, deadlineMs: 5_000 });
    const peerBoundary = await coordinator.safeTurnBoundary({ agentId: "peer" });
    const requestDelivery = peerBoundary.deliveries.at(0);
    if (requestDelivery === undefined) throw new Error("expected peer request delivery");
    await coordinator.acknowledgeInteractiveDelivery({ agentId: "peer", deliveryId: requestDelivery.deliveryId });

    const response = await fixture.peer.sendMessage({
      audience: { kind: "agents", agentIds: ["chair"] },
      kind: "response",
      body: "review complete",
      requiresAck: true,
      dedupeKey: "roundtrip:response",
    });
    await coordinator.notifyUnread({ agentId: "chair", messageId: response.messageId, deadlineMs: 5_000 });
    const chairBoundary = await coordinator.safeTurnBoundary({ agentId: "chair" });
    const responseDelivery = chairBoundary.deliveries.at(0);
    if (responseDelivery === undefined) throw new Error("expected chair response delivery");
    expect(responseDelivery).toMatchObject({ messageId: response.messageId, body: "review complete" });
    await coordinator.acknowledgeInteractiveDelivery({ agentId: "chair", deliveryId: responseDelivery.deliveryId });
    expect(await coordinator.deliveryStatus({ messageId: request.messageId, agentId: "peer" })).toBe("acknowledged");
    expect(await coordinator.deliveryStatus({ messageId: response.messageId, agentId: "chair" })).toBe("acknowledged");

    const late = await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "late request",
      requiresAck: true,
      dedupeKey: "roundtrip:late",
    });
    await coordinator.notifyUnread({ agentId: "peer", messageId: late.messageId, deadlineMs: 1_000 });
    fixture.clock.advance(1_001);
    const escalations = await coordinator.reconcileDeliveryDeadlines();
    expect(escalations).toContainEqual({
      agentId: "peer",
      messageId: late.messageId,
      state: "delivery-pending",
      escalation: "operator",
    });
    expect(await coordinator.deliveryStatus({ messageId: late.messageId, agentId: "peer" })).toBe("delivery-pending");
  });
});

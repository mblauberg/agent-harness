import { afterEach, describe, expect, it } from "vitest";

import { createVisibilityCoordinator } from "../../../src/index.ts";
import { createVisibilityFixture } from "../../support/visibility-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("AC-003 interactive delivery limitation", () => {
  it("treats Herdr wake-up as unconfirmed and consumes only at a safe provider boundary", async () => {
    const fixture = await createVisibilityFixture("run-interactive-inbox");
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
    fixture.provider.setTurnState("peer", "busy", 1);
    const sent = await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "private task body",
      requiresAck: true,
      dedupeKey: "interactive:pending",
    });

    const wakeup = await coordinator.notifyUnread({ agentId: "peer", messageId: sent.messageId, deadlineMs: 5_000 });
    expect(wakeup).toMatchObject({ status: "dispatched-unconfirmed", delivery: "pending" });
    expect(JSON.stringify(fixture.herdr.callsFor("wakeup"))).not.toContain("private task body");
    expect(await fixture.peer.getMailboxState()).toMatchObject({ contiguousWatermark: 0 });
    await expect(coordinator.safeTurnBoundary({ agentId: "peer" })).rejects.toMatchObject({
      code: "PROVIDER_TURN_ACTIVE",
    });

    fixture.provider.setTurnState("peer", "idle", 0);
    const boundary = await coordinator.safeTurnBoundary({ agentId: "peer" });
    expect(boundary).toMatchObject({ eventVersion: 1, agentId: "peer" });
    expect(boundary.deliveries).toHaveLength(1);
    const delivery = boundary.deliveries.at(0);
    if (delivery === undefined) throw new Error("expected interactive delivery at safe boundary");
    expect(delivery).toMatchObject({ messageId: sent.messageId, body: "private task body" });
    expect(await fixture.peer.getMailboxState()).toMatchObject({ contiguousWatermark: 0 });
    await coordinator.acknowledgeInteractiveDelivery({
      agentId: "peer",
      deliveryId: delivery.deliveryId,
    });
    expect(await fixture.peer.getMailboxState()).toMatchObject({ contiguousWatermark: 1 });
  });
});

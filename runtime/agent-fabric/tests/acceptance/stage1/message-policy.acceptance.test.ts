import { rm } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { MESSAGE_POLICY } from "../../../src/index.ts";
import { createStage1Fixture } from "../../support/stage1-fixture.ts";

describe("bounded conversations and message storm policy", () => {
  it("enforces hop, unresolved-backlog and expiry bounds without global broadcast", async () => {
    const fixture = await createStage1Fixture();
    try {
      expect(MESSAGE_POLICY).toMatchObject({
        maximumHops: 4,
        maximumUnacknowledgedPerAgent: 100,
      });
      await expect(fixture.chair.sendMessage({ audience: { kind: "agents", agentIds: ["alice"] }, kind: "request", body: "too many hops", requiresAck: false, dedupeKey: "message-policy:hops", hopCount: MESSAGE_POLICY.maximumHops + 1 })).rejects.toMatchObject({ code: "MESSAGE_HOP_LIMIT_EXCEEDED" });

      await fixture.chair.sendMessage({
        audience: { kind: "agents", agentIds: ["alice"] }, kind: "event", body: "expires", requiresAck: true,
        dedupeKey: "message-policy:expiry", expiresAt: "2026-07-10T00:00:01.000Z",
      });
      fixture.clock.advance(1_001);
      expect(await fixture.alice.receiveMessages({ limit: 1, visibilityTimeoutMs: 1_000 })).toEqual([]);
      expect(await fixture.alice.getMailboxState()).toEqual({ contiguousWatermark: 1, acknowledgedAboveWatermark: [] });

      for (let index = 0; index < MESSAGE_POLICY.maximumUnacknowledgedPerAgent; index += 1) {
        await fixture.chair.sendMessage({ audience: { kind: "agents", agentIds: ["bob"] }, kind: "request", body: `bounded-${index}`, requiresAck: true, dedupeKey: `message-policy:quota:${index}`, conversationId: "message-policy:bounded-conversation", hopCount: 0 });
      }
      await expect(fixture.chair.sendMessage({ audience: { kind: "agents", agentIds: ["bob"] }, kind: "request", body: "one too many", requiresAck: true, dedupeKey: "message-policy:quota:overflow" })).rejects.toMatchObject({ code: "MESSAGE_QUOTA_EXCEEDED" });
    } finally {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});

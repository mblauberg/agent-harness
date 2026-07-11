import { afterEach, describe, expect, it } from "vitest";

import { createDaemonFixture } from "../support/daemon-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).map((close) => close()));
});

describe("daemon observer event read", () => {
  it("carries bounded local message previews over the capability-bound protocol", async () => {
    const fixture = await createDaemonFixture("run-observer-daemon");
    cleanup.push(fixture.cleanup);
    const body = "daemon-observer-secret";
    await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body,
      requiresAck: true,
      dedupeKey: "daemon-observer-message",
    });

    const first = await fixture.chair.eventsAfter({ cursor: 0, limit: 1 });
    const second = await fixture.chair.eventsAfter({ cursor: first.nextCursor, limit: 100 });

    expect(first.events).toHaveLength(1);
    expect(second.events.every((event) => event.cursor > first.nextCursor)).toBe(true);
    expect(JSON.stringify([first, second])).toContain(body);
    expect(second.events.some((event) => event.type === "message-persisted")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import {
  advanceOptionalLeg,
  flushOptionalLeg,
  OptionalAdapterClock,
} from "../../support/optional-adapter-clock.ts";
import { FakeOptionalAdapter } from "../../support/optional-adapter-fake.ts";
import {
  expectRecord,
  startOptionalAdapterLeg,
} from "../../support/optional-adapter-testkit.ts";

describe("FR-016 / AC-013 optional-family degradation", () => {
  it("does not block the required primary path while retrying an unavailable provider", async () => {
    const clock = new OptionalAdapterClock();
    const adapter = new FakeOptionalAdapter({
      dispatchResponses: [
        { state: "unavailable", acknowledged: false, reason: "provider-unavailable" },
        { state: "unavailable", acknowledged: false, reason: "provider-unavailable" },
        { state: "unavailable", acknowledged: false, reason: "provider-unavailable" },
      ],
    });
    const handle = startOptionalAdapterLeg({
      adapterId: "pi-rpc",
      adapter,
      action: { actionId: "optional-action-unavailable", payload: { objective: "bonus review" } },
      policy: {
        retryDelaysMs: [250, 250],
        acknowledgementDeadlineMs: 1_000,
        acknowledgementPollMs: 100,
        deadlineState: "degraded",
      },
      clock: { now: clock.now, sleep: clock.sleep },
    });

    expect(handle.blocking).toBe(false);
    const firstCompleted = await Promise.race([
      Promise.resolve("required-primary-complete"),
      handle.completion.then(() => "optional-complete"),
    ]);
    expect(firstCompleted).toBe("required-primary-complete");

    await flushOptionalLeg();
    await advanceOptionalLeg(clock, 250);
    await advanceOptionalLeg(clock, 250);
    await advanceOptionalLeg(clock, 500);
    const result = expectRecord(await handle.completion);

    expect(adapter.dispatches).toHaveLength(3);
    expect(adapter.dispatches.map((attempt) => attempt.actionId)).toEqual([
      "optional-action-unavailable",
      "optional-action-unavailable",
      "optional-action-unavailable",
    ]);
    expect(result).toMatchObject({
      adapterId: "pi-rpc",
      actionId: "optional-action-unavailable",
      state: "degraded",
      reason: "provider-unavailable",
      attempts: 3,
      acknowledged: false,
      requiredPrimaryBlocked: false,
      deadlineExceeded: true,
    });
    expect(result.receipt).toEqual(expect.objectContaining({
      adapterId: "pi-rpc",
      status: "degraded",
      reason: "provider-unavailable",
    }));
  });

  it("polls an accepted action until its acknowledgement deadline without replaying it", async () => {
    const clock = new OptionalAdapterClock();
    const adapter = new FakeOptionalAdapter({
      dispatchResponses: [
        { state: "unavailable", acknowledged: false, reason: "provider-unavailable" },
        {
          state: "accepted",
          acknowledged: false,
          providerActionRef: "provider-action-1",
        },
      ],
      lookupResult: {
        state: "accepted",
        acknowledged: false,
        providerActionRef: "provider-action-1",
      },
    });
    const handle = startOptionalAdapterLeg({
      adapterId: "agy",
      adapter,
      action: { actionId: "optional-action-accepted", payload: { objective: "bonus review" } },
      policy: {
        retryDelaysMs: [250, 250],
        acknowledgementDeadlineMs: 1_000,
        acknowledgementPollMs: 250,
        deadlineState: "degraded",
      },
      clock: { now: clock.now, sleep: clock.sleep },
    });

    await flushOptionalLeg();
    await advanceOptionalLeg(clock, 250);
    await advanceOptionalLeg(clock, 250);
    await advanceOptionalLeg(clock, 250);
    await advanceOptionalLeg(clock, 250);
    const result = expectRecord(await handle.completion);

    expect(adapter.dispatches).toHaveLength(2);
    expect(adapter.dispatches.every((attempt) => attempt.actionId === "optional-action-accepted")).toBe(true);
    expect(adapter.lookups.length).toBeGreaterThan(0);
    expect(adapter.lookups.every((actionId) => actionId === "optional-action-accepted")).toBe(true);
    expect(result).toMatchObject({
      adapterId: "agy",
      actionId: "optional-action-accepted",
      state: "degraded",
      reason: "acknowledgement-deadline-exceeded",
      attempts: 2,
      acknowledged: false,
      requiredPrimaryBlocked: false,
      deadlineExceeded: true,
    });
    expect(result.receipt).toEqual(expect.objectContaining({
      adapterId: "agy",
      status: "degraded",
      reason: "acknowledgement-deadline-exceeded",
      providerActionRef: "provider-action-1",
    }));
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { IdleShutdownScheduler } from "../../../src/daemon/idle-shutdown-scheduler.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("idle shutdown scheduler", () => {
  it("coalesces final-detach triggers and performs only one guarded attempt", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const scheduler = new IdleShutdownScheduler({
      graceMs: 100,
      sweepMs: 1_000,
      attempt: async ({ actionId }) => {
        calls.push(actionId);
        return { state: "busy", reason: "contributors-active" };
      },
      onStopped: async () => undefined,
    });
    scheduler.start();
    scheduler.schedule("operator-detach");
    scheduler.schedule("operator-detach");
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toEqual(["idle-stop:operator-detach:1"]);
    scheduler.close();
  });

  it("retries a busy daemon on the unref sweep and closes exactly once after stop", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    let stopped = 0;
    const scheduler = new IdleShutdownScheduler({
      graceMs: 100,
      sweepMs: 500,
      attempt: async () => {
        attempts += 1;
        return attempts === 1
          ? { state: "busy", reason: "contributors-active" }
          : { state: "stopped", daemonInstanceGeneration: 3, globalStateRevision: 9 };
      },
      onStopped: async () => { stopped += 1; },
    });
    scheduler.start();
    scheduler.schedule("operator-detach");
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(400);
    expect(attempts).toBe(2);
    expect(stopped).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(attempts).toBe(2);
    expect(stopped).toBe(1);
  });

  it("never overlaps attempts and performs no work after close", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    let calls = 0;
    const scheduler = new IdleShutdownScheduler({
      graceMs: 10,
      sweepMs: 10,
      attempt: async () => {
        calls += 1;
        await new Promise<void>((resolve) => { release = resolve; });
        return { state: "busy", reason: "contributors-active" };
      },
      onStopped: async () => undefined,
    });
    scheduler.start();
    scheduler.schedule("operator-detach");
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(1);
    scheduler.close();
    release?.();
    await vi.runAllTimersAsync();
    expect(calls).toBe(1);
  });
});

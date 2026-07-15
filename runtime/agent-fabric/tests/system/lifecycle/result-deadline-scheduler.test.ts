import { afterEach, describe, expect, it, vi } from "vitest";

import { ResultDeadlineScheduler } from "../../../src/daemon/result-deadline-scheduler.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("result deadline scheduler", () => {
  it("runs deterministic daemon-fenced generations without overlap", async () => {
    vi.useFakeTimers();
    const calls: Array<{ daemonInstanceGeneration: number; passGeneration: number }> = [];
    let release: (() => void) | undefined;
    const scheduler = new ResultDeadlineScheduler({
      intervalMs: 100,
      daemonInstanceGeneration: 7,
      pass: async (input) => {
        calls.push(input);
        await new Promise<void>((resolve) => { release = resolve; });
      },
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toEqual([{ daemonInstanceGeneration: 7, passGeneration: 1 }]);
    release?.();
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toEqual([
      { daemonInstanceGeneration: 7, passGeneration: 1 },
      { daemonInstanceGeneration: 7, passGeneration: 2 },
    ]);
    scheduler.close();
    release?.();
    await vi.runAllTimersAsync();
    expect(calls).toHaveLength(2);
  });

  it("is idempotent across repeated start and close calls", async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const scheduler = new ResultDeadlineScheduler({
      intervalMs: 50,
      daemonInstanceGeneration: 3,
      pass: ({ passGeneration }) => { calls.push(passGeneration); },
    });
    scheduler.start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(50);
    expect(calls).toEqual([1]);
    scheduler.close();
    scheduler.close();
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toEqual([1]);
  });

  it("retries the same pass generation after a failed transaction", async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    let failures = 1;
    const scheduler = new ResultDeadlineScheduler({
      intervalMs: 50,
      daemonInstanceGeneration: 9,
      pass: ({ passGeneration }) => {
        calls.push(passGeneration);
        if (failures > 0) {
          failures -= 1;
          throw new Error("injected pass failure");
        }
      },
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(150);
    expect(calls).toEqual([1, 1, 2]);
    scheduler.close();
  });
});

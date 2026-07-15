import { describe, expect, it } from "vitest";

import { finalizeDaemonShutdown } from "../../../src/daemon/shutdown-finalizer.ts";

class ExitCalled extends Error {
  constructor(readonly code: number) {
    super(`exit ${String(code)}`);
  }
}

describe("daemon shutdown finalizer", () => {
  it("attempts every terminal cleanup leg and forces a nonzero exit after close failure", async () => {
    const calls: string[] = [];
    let terminalInput: { state: "stopped" | "crashed"; exitCode: number } | undefined;

    await expect(finalizeDaemonShutdown({
      requestedState: "stopped",
      requestedExitCode: 0,
      closeFabric: async () => {
        calls.push("close-fabric");
        throw new Error("close failed");
      },
      markTerminal: async (input) => {
        calls.push("mark-terminal");
        terminalInput = input;
      },
      removeSocket: async () => { calls.push("remove-socket"); },
      releaseLocks: async () => { calls.push("release-locks"); },
      reportFailure: () => { calls.push("report-failure"); },
      exit: (code) => { throw new ExitCalled(code); },
    })).rejects.toMatchObject({ code: 1 });

    expect(calls).toEqual([
      "close-fabric",
      "remove-socket",
      "release-locks",
      "mark-terminal",
      "report-failure",
    ]);
    expect(terminalInput).toEqual({ state: "crashed", exitCode: 1 });
  });

  it("still exits nonzero when discovery terminalization and later cleanup both fail", async () => {
    const calls: string[] = [];
    const failures: unknown[] = [];

    await expect(finalizeDaemonShutdown({
      requestedState: "stopped",
      requestedExitCode: 0,
      closeFabric: async () => { calls.push("close-fabric"); },
      markTerminal: async () => {
        calls.push("mark-terminal");
        throw new Error("terminal failed");
      },
      removeSocket: async () => {
        calls.push("remove-socket");
        throw new Error("socket cleanup failed");
      },
      releaseLocks: async () => { calls.push("release-locks"); },
      reportFailure: (failure) => {
        calls.push("report-failure");
        failures.push(failure);
        throw new Error("reporter failed");
      },
      exit: (code) => { throw new ExitCalled(code); },
    })).rejects.toMatchObject({ code: 1 });

    expect(calls).toEqual([
      "close-fabric",
      "remove-socket",
      "release-locks",
      "mark-terminal",
      "report-failure",
    ]);
    expect(failures).toHaveLength(1);
  });

  it("preserves a clean requested exit when every cleanup leg succeeds", async () => {
    await expect(finalizeDaemonShutdown({
      requestedState: "stopped",
      requestedExitCode: 0,
      closeFabric: async () => undefined,
      markTerminal: async () => undefined,
      removeSocket: async () => undefined,
      releaseLocks: async () => undefined,
      reportFailure: () => undefined,
      exit: (code) => { throw new ExitCalled(code); },
    })).rejects.toMatchObject({ code: 0 });
  });
});

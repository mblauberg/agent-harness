import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { EventEmitter } = await import("node:events");
  const { PassThrough, Writable } = await import("node:stream");

  return {
    ...actual,
    spawn: () => {
      const events = new EventEmitter();
      const child = Object.assign(events, {
        stdin: new Writable({
          write(_chunk, _encoding, callback) {
            const cause = Object.assign(new Error("fixture stdin closed"), { code: "EPIPE" });
            callback(cause);
          },
        }),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        pid: 42,
        exitCode: null as number | null,
        signalCode: null as NodeJS.Signals | null,
        kill(signal: NodeJS.Signals = "SIGTERM") {
          this.signalCode = signal;
          queueMicrotask(() => events.emit("close", null, signal));
          return true;
        },
      });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    },
  };
});

import { AdapterProcessTransport } from "../../src/adapters/process.ts";

describe("AdapterProcessTransport stdin closure", () => {
  it("owns a child stdin EPIPE while rejecting the registered request once", async () => {
    const transport = new AdapterProcessTransport({ command: ["fixture"], environment: {} });
    const rejected = vi.fn();
    const request = transport.request("capabilities", {}).catch((error: unknown) => {
      rejected(error);
      throw error;
    });

    await expect(request).rejects.toMatchObject({ code: "ADAPTER_STDIN_FAILED" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(rejected).toHaveBeenCalledOnce();
    await transport.close();
  });
});

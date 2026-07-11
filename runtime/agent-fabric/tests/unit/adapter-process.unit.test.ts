import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  AdapterProcessTransport,
  AdapterTransportError,
} from "../../src/adapters/process.ts";

const fixturePath = fileURLToPath(new URL("../support/adapter-process-fixture.ts", import.meta.url));
const transports: AdapterProcessTransport[] = [];

function fixture(mode: string, responseTimeoutMs = 1_000): AdapterProcessTransport {
  const transport = new AdapterProcessTransport({
    command: [process.execPath, "--import", "tsx", fixturePath, mode],
    environment: {},
    responseTimeoutMs,
    closeTimeoutMs: 50,
  });
  transports.push(transport);
  return transport;
}

function processExists(pid: number | undefined): boolean {
  if (pid === undefined) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.allSettled(transports.splice(0).map(async (transport) => transport.close()));
});

describe("AdapterProcessTransport", () => {
  it("rejects an empty command before spawning", () => {
    expect(
      () => new AdapterProcessTransport({ command: [], environment: {} }),
    ).toThrowError(expect.objectContaining({ code: "ADAPTER_COMMAND_EMPTY" }));
  });

  it("handles a missing executable as a request rejection, not an uncaught child error", async () => {
    const transport = new AdapterProcessTransport({
      command: ["/definitely/missing/agent-fabric-adapter"],
      environment: {},
      responseTimeoutMs: 100,
    });
    transports.push(transport);

    await expect(transport.request("capabilities", {})).rejects.toMatchObject({
      code: "ADAPTER_SPAWN_FAILED",
    });
    expect(transport.closed).toBe(true);
  });

  it("bounds a never-reply request and kills the child", async () => {
    const transport = fixture("never-reply", 30);
    const pid = transport.pid;

    await expect(transport.request("capabilities", {})).rejects.toMatchObject({
      code: "ADAPTER_RESPONSE_TIMEOUT",
    });
    await transport.close();
    expect(transport.closed).toBe(true);
    expect(processExists(pid)).toBe(false);
  });

  it("rejects more than eight in-flight adapter calls without dispatching them", async () => {
    const transport = fixture("never-reply", 5_000);
    const pending = Array.from(
      { length: 8 },
      () => transport.request("capabilities", {}).catch((error: unknown) => error),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    await expect(transport.request("capabilities", {})).rejects.toMatchObject({ code: "ADAPTER_OVERLOADED" });
    await transport.close();
    await Promise.allSettled(pending);
  });

  it("supports AbortSignal and cleans up the child", async () => {
    const transport = fixture("never-reply", 5_000);
    const pid = transport.pid;
    const controller = new AbortController();
    const pending = transport.request("capabilities", {}, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "ADAPTER_REQUEST_ABORTED" });
    await transport.close();
    expect(processExists(pid)).toBe(false);
  });

  it.each(["malformed-json", "malformed-envelope"])(
    "rejects %s output without an uncaught listener throw",
    async (mode) => {
      const transport = fixture(mode);
      await expect(transport.request("capabilities", {})).rejects.toMatchObject({
        code: "ADAPTER_PROTOCOL_INVALID",
      });
      expect(transport.closed).toBe(true);
    },
  );

  it("rejects pending work when the child exits and retains bounded stderr", async () => {
    const transport = fixture("exit");
    await expect(transport.request("capabilities", {})).rejects.toMatchObject({
      code: "ADAPTER_EXITED",
      message: expect.stringContaining("fixture exited intentionally"),
    });
    expect(transport.closed).toBe(true);
  });

  it("returns valid responses and close kills a child that stays alive after stdin ends", async () => {
    const transport = fixture("stubborn");
    const pid = transport.pid;
    await expect(transport.request("echo", {})).resolves.toEqual({ echoed: true });
    expect(processExists(pid)).toBe(true);

    await transport.close();
    expect(transport.closed).toBe(true);
    expect(processExists(pid)).toBe(false);
  });

  it("uses the per-request timeout override", async () => {
    const transport = fixture("never-reply", 5_000);
    await expect(
      transport.request("capabilities", {}, { timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(AdapterTransportError);
    expect(transport.closed).toBe(true);
  });
});

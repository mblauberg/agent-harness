import { Duplex } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FabricRemoteError, TimedNdjsonTransport } from "../../src/transport/ndjson-rpc.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).map((close) => close()));
});

class NeverConnectingSocket extends Duplex {
  override _read(): void {}
  override _write(_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    callback();
  }
}

describe("timed daemon NDJSON transport", () => {
  it("bounds connection setup and destroys a socket that never connects", async () => {
    const socket = new NeverConnectingSocket();

    await expect(
      TimedNdjsonTransport.connect(
        { socketPath: "/unused.sock", capability: "capability", connectTimeoutMs: 20, requestTimeoutMs: 100 },
        { connect: () => socket as unknown as Socket },
      ),
    ).rejects.toMatchObject({ code: "DAEMON_CONNECT_TIMEOUT" } satisfies Partial<FabricRemoteError>);
    expect(socket.destroyed).toBe(true);
  });

  it("times out and removes an unanswered request while preserving later wire-compatible calls", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-transport-"));
    const socketPath = join(directory, "fabric.sock");
    const requests: Array<{ id: string; capability: string; method: string; params: Record<string, unknown> }> = [];
    const server = createServer((socket) => {
      const lines = createInterface({ input: socket, crlfDelay: Infinity });
      lines.on("line", (line) => {
        const request = JSON.parse(line) as { id: string; capability: string; method: string; params: Record<string, unknown> };
        requests.push(request);
        if (request.method === "initialize") {
          socket.write(`${JSON.stringify({
            id: request.id,
            result: {
              protocolVersion: 1,
              daemonVersion: "0.1.0",
              capabilities: ["rpc"],
              activeAdapters: [],
              limits: {
                maximumFrameBytes: 1_048_576,
                maximumConnections: 32,
                maximumInFlightPerConnection: 16,
                maximumTotalInFlight: 128,
                maximumClientPending: 32,
                maximumAdapterInFlight: 8,
                idleTimeoutMs: 300_000,
              },
            },
          })}\n`);
          return;
        }
        if (request.method === "second") {
          socket.write(`${JSON.stringify({ id: request.id, result: { ok: true } })}\n`);
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    cleanup.push(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    });
    const transport = await TimedNdjsonTransport.connect({
      socketPath,
      capability: "afb_test",
      connectTimeoutMs: 200,
      requestTimeoutMs: 25,
    });
    cleanup.unshift(() => transport.close());

    await expect(transport.call("first", { sequence: 1 })).rejects.toMatchObject({
      code: "DAEMON_REQUEST_TIMEOUT",
    } satisfies Partial<FabricRemoteError>);
    await expect(transport.call("second", { sequence: 2 })).resolves.toEqual({ ok: true });
    expect(requests.map(({ capability, method, params }) => ({ capability, method, params }))).toEqual([
      {
        capability: "afb_test",
        method: "initialize",
        params: { protocolVersion: 1, client: { name: "agent-fabric", version: "0.1.0" }, capabilities: ["rpc"] },
      },
      { capability: "afb_test", method: "first", params: { sequence: 1 } },
      { capability: "afb_test", method: "second", params: { sequence: 2 } },
    ]);
  });

  it("rejects a thirty-third pending client call without writing it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-transport-pending-"));
    const socketPath = join(directory, "fabric.sock");
    let ordinaryRequests = 0;
    const server = createServer((socket) => {
      const lines = createInterface({ input: socket, crlfDelay: Infinity });
      lines.on("line", (line) => {
        const request = JSON.parse(line) as { id: string; method: string };
        if (request.method === "initialize") {
          socket.write(`${JSON.stringify({
            id: request.id,
            result: {
              protocolVersion: 1,
              daemonVersion: "0.1.0",
              capabilities: ["rpc"],
              activeAdapters: [],
              limits: {
                maximumFrameBytes: 1_048_576,
                maximumConnections: 32,
                maximumInFlightPerConnection: 16,
                maximumTotalInFlight: 128,
                maximumClientPending: 32,
                maximumAdapterInFlight: 8,
                idleTimeoutMs: 300_000,
              },
            },
          })}\n`);
        } else {
          ordinaryRequests += 1;
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    cleanup.push(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    });
    const transport = await TimedNdjsonTransport.connect({
      socketPath,
      capability: "afb_test",
      connectTimeoutMs: 200,
      requestTimeoutMs: 5_000,
    });
    cleanup.unshift(() => transport.close());
    const pending = Array.from(
      { length: 32 },
      (_, index) => transport.call("hold", { index }).catch((error: unknown) => error),
    );

    await expect(transport.call("overflow", {})).rejects.toMatchObject({ code: "DAEMON_CLIENT_OVERLOADED" });
    await vi.waitFor(() => expect(ordinaryRequests).toBe(32));
    await transport.close();
    await Promise.allSettled(pending);
  });
});

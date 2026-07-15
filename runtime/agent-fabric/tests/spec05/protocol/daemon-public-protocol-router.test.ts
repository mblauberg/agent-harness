import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection, createServer, Socket, type Server } from "node:net";
import { createInterface } from "node:readline";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  routeDaemonConnection,
  type DaemonConnectionProtocol,
} from "../../../src/daemon/connection-router.ts";

const servers: Server[] = [];
const roots: string[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  await Promise.allSettled(servers.splice(0).map(async (server) => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }));
  await Promise.allSettled(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
  vi.useRealTimers();
});

async function startRouter(options: {
  maximumFirstFrameBytes?: number;
  idleTimeoutMs?: number;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "fabric-daemon-router-"));
  roots.push(root);
  const socketPath = join(root, "fabric.sock");
  const routed = Promise.withResolvers<DaemonConnectionProtocol>();
  const onRoute = vi.fn((protocol: DaemonConnectionProtocol, socket: Socket) => {
    routed.resolve(protocol);
    socket.destroy();
  });
  const server = createServer((socket) => routeDaemonConnection(socket, {
    maximumFirstFrameBytes: options.maximumFirstFrameBytes ?? 1_024,
    idleTimeoutMs: options.idleTimeoutMs ?? 1_000,
    onRoute,
  }));
  servers.push(server);
  await new Promise<void>((resolve, reject) => server.listen(socketPath, resolve).once("error", reject));
  const socket = createConnection(socketPath);
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  return { socket, onRoute, routed: routed.promise };
}

async function nextResponse(socket: Socket): Promise<Record<string, unknown>> {
  const lines = createInterface({ input: socket, crlfDelay: Infinity });
  return await new Promise<Record<string, unknown>>((resolve) => {
    lines.once("line", (line) => {
      lines.close();
      resolve(JSON.parse(line) as Record<string, unknown>);
    });
  });
}

describe("daemon first-frame routing bounds", () => {
  it("rejects invalid UTF-8 before selecting a protocol", async () => {
    const { socket, onRoute } = await startRouter();
    const response = nextResponse(socket);
    socket.write(Buffer.from([0xff, 0x0a]));

    await expect(response).resolves.toMatchObject({
      id: "connection",
      error: { code: "NDJSON_INVALID_UTF8" },
    });
    expect(onRoute).not.toHaveBeenCalled();
  });

  it("rejects a first frame beyond the shared byte limit before routing", async () => {
    const { socket, onRoute } = await startRouter({ maximumFirstFrameBytes: 32 });
    const response = nextResponse(socket);
    socket.write(Buffer.concat([Buffer.alloc(33, 0x61), Buffer.from("\n")]));

    await expect(response).resolves.toMatchObject({
      id: "connection",
      error: { code: "NDJSON_FRAME_TOO_LARGE" },
    });
    expect(onRoute).not.toHaveBeenCalled();
  });

  it("closes a connection that stays idle before its first frame", async () => {
    const { socket, onRoute } = await startRouter({ idleTimeoutMs: 20 });
    const closed = new Promise<true>((resolve) => socket.once("close", () => resolve(true)));
    const timedOut = new Promise<false>((resolve) => setTimeout(() => resolve(false), 100));

    await expect(Promise.race([closed, timedOut])).resolves.toBe(true);
    expect(onRoute).not.toHaveBeenCalled();
  });

  it("measures idle time from the latest partial first-frame bytes", () => {
    vi.useFakeTimers();
    const socket = new Socket();
    sockets.push(socket);
    const onRoute = vi.fn((_protocol: DaemonConnectionProtocol, routedSocket: Socket) => {
      routedSocket.destroy();
    });
    routeDaemonConnection(socket, {
      maximumFirstFrameBytes: 1_024,
      idleTimeoutMs: 30,
      onRoute,
    });

    vi.advanceTimersByTime(29);
    socket.emit("data", Buffer.from('{"id":"partial",'));
    vi.advanceTimersByTime(29);
    expect(socket.destroyed).toBe(false);

    socket.emit("data", Buffer.from('"operation"'));
    vi.advanceTimersByTime(29);
    expect(socket.destroyed).toBe(false);

    socket.emit("data", Buffer.from(':"initialize","input":{}}\n'));
    expect(onRoute).toHaveBeenCalledWith("public-v1", expect.anything());
  });

  it("routes the current private control frame without classifying it as public", async () => {
    const { socket, onRoute, routed } = await startRouter();
    socket.write(`${JSON.stringify({
      id: "private-initialize",
      method: "initialize",
      params: {},
      capability: "afb_current_control_capability",
    })}\n`);

    await expect(routed).resolves.toBe("private-control-v1");
    expect(onRoute).toHaveBeenCalledWith("private-control-v1", expect.anything());
  });
});

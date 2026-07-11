import { createHash, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { createServer, type Socket } from "node:net";

import { openFabric } from "../index.js";
import {
  createRunInput,
  daemonInitializeParams,
  daemonInitializeResult,
  dispatchClientMethod,
  FABRIC_PROTOCOL_VERSION,
  isDaemonRequest,
  isRecord,
  type DaemonRequest,
} from "./protocol.js";
import { parseDaemonAdapters } from "./composition.js";
import { acquireDaemonLocks, releaseDaemonLocks, writeDaemonLockReceipt } from "./client.js";
import { BoundedNdjsonReader, BoundedNdjsonWriter, FABRIC_PROTOCOL_LIMITS } from "../transport/bounded-ndjson.js";

class DaemonProtocolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DaemonProtocolError";
    this.code = code;
  }
}

function secretEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

const databasePath = process.env.AGENT_FABRIC_DATABASE_PATH;
const socketPath = process.env.AGENT_FABRIC_SOCKET_PATH;
const stateDirectory = process.env.AGENT_FABRIC_STATE_DIRECTORY;
const runtimeDirectory = process.env.AGENT_FABRIC_RUNTIME_DIRECTORY;
const bootstrapCapability = process.env.AGENT_FABRIC_BOOTSTRAP_CAPABILITY;
const daemonLockPathsValue: unknown = JSON.parse(process.env.AGENT_FABRIC_DAEMON_LOCK_PATHS_JSON ?? "[]");
const daemonLockPaths = Array.isArray(daemonLockPathsValue) && daemonLockPathsValue.every((value) => typeof value === "string")
  ? daemonLockPathsValue
  : undefined;
const capabilityKey = process.env.AGENT_FABRIC_CAPABILITY_KEY;
const executionProfile = process.env.AGENT_FABRIC_EXECUTION_PROFILE;
const maximumConcurrentProviderTurnsValue = process.env.AGENT_FABRIC_MAXIMUM_CONCURRENT_PROVIDER_TURNS ?? "8";
const maximumConcurrentProviderTurns = Number(maximumConcurrentProviderTurnsValue);
const workspaceRootsValue: unknown = JSON.parse(process.env.AGENT_FABRIC_WORKSPACE_ROOTS_JSON ?? "[]");
const workspaceRoots = Array.isArray(workspaceRootsValue) && workspaceRootsValue.every((value) => typeof value === "string")
  ? workspaceRootsValue
  : undefined;

if (
  databasePath === undefined ||
  socketPath === undefined ||
  stateDirectory === undefined ||
  runtimeDirectory === undefined ||
  bootstrapCapability === undefined
  || daemonLockPaths === undefined
  || daemonLockPaths.length !== 2
  || capabilityKey === undefined
  || executionProfile === undefined
  || !Number.isInteger(maximumConcurrentProviderTurns)
  || maximumConcurrentProviderTurns < 1
  || workspaceRoots === undefined
  || workspaceRoots.length === 0
) {
  throw new Error("agent fabric daemon environment is incomplete");
}

mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
chmodSync(stateDirectory, 0o700);
chmodSync(runtimeDirectory, 0o700);
let daemonLocks: Awaited<ReturnType<typeof acquireDaemonLocks>>;
try {
  daemonLocks = await acquireDaemonLocks(daemonLockPaths);
  for (const lock of daemonLocks) {
    await writeDaemonLockReceipt(lock.path, { pid: process.pid, token: lock.token, socketPath });
  }
} catch (error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : "DAEMON_LOCKED";
  const message = error instanceof Error ? error.message : String(error);
  await new Promise<void>((resolve) => process.stdout.write(`${JSON.stringify({ ready: false, error: { code, message } })}\n`, () => resolve()));
  process.exit(1);
  throw error;
}
rmSync(socketPath, { force: true });

const daemonAdapters = parseDaemonAdapters(process.env.AGENT_FABRIC_ADAPTERS_JSON);
const initializeResult = daemonInitializeResult(Object.keys(daemonAdapters));
const fabric = await openFabric({
  databasePath,
  capabilityKey,
  executionProfile,
  maximumConcurrentProviderTurns,
  workspaceRoots,
  adapters: daemonAdapters,
});
await fabric.recoverStartupState();
const sockets = new Set<Socket>();
let totalInFlight = 0;
const server = createServer((socket) => {
  const writer = new BoundedNdjsonWriter(socket, {
    maximumFrameBytes: FABRIC_PROTOCOL_LIMITS.maximumFrameBytes,
    maximumPendingWrites: FABRIC_PROTOCOL_LIMITS.maximumInFlightPerConnection,
  });
  if (sockets.size >= FABRIC_PROTOCOL_LIMITS.maximumConnections) {
    void writer.write({
      id: "connection",
      error: {
        name: "DaemonProtocolError",
        code: "DAEMON_CONNECTION_LIMIT",
        message: `daemon accepts at most ${String(FABRIC_PROTOCOL_LIMITS.maximumConnections)} connections`,
      },
    }).finally(() => socket.end());
    return;
  }
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
  let connectionInFlight = 0;
  let initializedCapability: string | undefined;
  let initializationComplete = false;

  const respond = async (
    id: string,
    operation: () => Promise<unknown>,
    onSuccess?: () => void,
  ): Promise<void> => {
    try {
      const result = await operation();
      await writer.write({ id, result: result === undefined ? null : result });
      onSuccess?.();
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : "Error";
      const message = error instanceof Error ? error.message : String(error);
      const code =
        typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
          ? error.code
          : "DAEMON_REQUEST_FAILED";
      await writer.write({ id, error: { name, code, message } }).catch(() => socket.destroy());
    } finally {
      connectionInFlight -= 1;
      totalInFlight -= 1;
    }
  };

  const dispatch = async (request: DaemonRequest): Promise<unknown> => {
    if (request.method === "initialize") {
      if (initializedCapability !== undefined) {
        throw new DaemonProtocolError("DAEMON_ALREADY_INITIALIZED", "daemon connection is already initialized");
      }
      const initialize = daemonInitializeParams(request.params);
      if (initialize.protocolVersion !== FABRIC_PROTOCOL_VERSION) {
        throw new DaemonProtocolError(
          "DAEMON_PROTOCOL_UNSUPPORTED",
          `daemon protocol ${String(initialize.protocolVersion)} is unsupported`,
        );
      }
      initializedCapability = request.capability;
      return initializeResult;
    }
    if (!initializationComplete || initializedCapability === undefined) {
      throw new DaemonProtocolError("DAEMON_NOT_INITIALIZED", "initialize must succeed before daemon commands");
    }
    if (!secretEqual(request.capability, initializedCapability)) {
      throw new DaemonProtocolError(
        "DAEMON_CAPABILITY_MISMATCH",
        "daemon capability cannot change after initialization",
      );
    }
    return secretEqual(request.capability, bootstrapCapability)
      ? request.method === "createRun"
        ? await fabric.createRun(createRunInput(request.params))
        : (() => {
            throw new DaemonProtocolError("BOOTSTRAP_SCOPE_VIOLATION", "bootstrap capability may only create a run");
          })()
      : await dispatchClientMethod(fabric.connect(request.capability), request.method, request.params);
  };

  const reader = new BoundedNdjsonReader(socket, {
    maximumFrameBytes: FABRIC_PROTOCOL_LIMITS.maximumFrameBytes,
    idleTimeoutMs: FABRIC_PROTOCOL_LIMITS.idleTimeoutMs,
    onIdle: () => socket.destroy(),
    onError: (error) => {
      void writer.write({ id: "unknown", error: { name: error.name, code: error.code, message: error.message } })
        .finally(() => socket.destroy());
    },
    onFrame: (line) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (cause: unknown) {
        void writer.write({
          id: "unknown",
          error: {
            name: "DaemonProtocolError",
            code: "DAEMON_PROTOCOL_INVALID",
            message: cause instanceof Error ? cause.message : "malformed daemon JSON",
          },
        }).catch(() => socket.destroy());
        return;
      }
      const id = isRecord(parsed) && typeof parsed.id === "string" ? parsed.id : "unknown";
      if (!isDaemonRequest(parsed)) {
        void writer.write({
          id,
          error: { name: "DaemonProtocolError", code: "DAEMON_PROTOCOL_INVALID", message: "invalid daemon request" },
        }).catch(() => socket.destroy());
        return;
      }
      if (connectionInFlight >= FABRIC_PROTOCOL_LIMITS.maximumInFlightPerConnection) {
        void writer.write({
          id,
          error: {
            name: "DaemonProtocolError",
            code: "DAEMON_CONNECTION_OVERLOADED",
            message: `connection permits ${String(FABRIC_PROTOCOL_LIMITS.maximumInFlightPerConnection)} in-flight commands`,
          },
        }).catch(() => socket.destroy());
        return;
      }
      if (totalInFlight >= FABRIC_PROTOCOL_LIMITS.maximumTotalInFlight) {
        void writer.write({
          id,
          error: {
            name: "DaemonProtocolError",
            code: "DAEMON_OVERLOADED",
            message: `daemon permits ${String(FABRIC_PROTOCOL_LIMITS.maximumTotalInFlight)} in-flight commands`,
          },
        }).catch(() => socket.destroy());
        return;
      }
      connectionInFlight += 1;
      totalInFlight += 1;
      void respond(
        id,
        () => dispatch(parsed),
        parsed.method === "initialize" ? () => { initializationComplete = true; } : undefined,
      );
    },
  });
  socket.once("close", () => reader.close());
});

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(socketPath, () => {
    server.off("error", reject);
    chmodSync(socketPath, 0o600);
    resolve();
  });
});

process.stdout.write(`${JSON.stringify({ ready: true })}\n`);

let shuttingDown = false;
const shutdown = (): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => {
    void fabric.close().finally(async () => {
      rmSync(socketPath, { force: true });
      await releaseDaemonLocks(daemonLocks);
      process.exit(0);
    });
  });
  for (const socket of sockets) socket.destroy();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

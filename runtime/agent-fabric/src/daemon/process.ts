import { createHash, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { createInterface } from "node:readline";

import { openFabric } from "../index.js";
import { createRunInput, dispatchClientMethod, isDaemonRequest } from "./protocol.js";
import { parseDaemonAdapters } from "./composition.js";
import { acquireDaemonLocks, releaseDaemonLocks, writeDaemonLockReceipt } from "./client.js";

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

const fabric = await openFabric({
  databasePath,
  capabilityKey,
  executionProfile,
  maximumConcurrentProviderTurns,
  workspaceRoots,
  adapters: parseDaemonAdapters(process.env.AGENT_FABRIC_ADAPTERS_JSON),
});
await fabric.recoverStartupState();
const sockets = new Set<Socket>();
const server = createServer((socket) => {
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
  const lines = createInterface({ input: socket, crlfDelay: Infinity });
  lines.on("line", (line) => {
    void (async () => {
      let id = "unknown";
      try {
        const parsed: unknown = JSON.parse(line);
        if (!isDaemonRequest(parsed)) {
          throw new TypeError("invalid daemon request");
        }
        id = parsed.id;
        const result =
          secretEqual(parsed.capability, bootstrapCapability)
            ? parsed.method === "createRun"
              ? await fabric.createRun(createRunInput(parsed.params))
              : (() => {
                  throw new TypeError("bootstrap capability may only create a run");
                })()
            : await dispatchClientMethod(fabric.connect(parsed.capability), parsed.method, parsed.params);
        socket.write(`${JSON.stringify({ id, result: result === undefined ? null : result })}\n`);
      } catch (error: unknown) {
        const name = error instanceof Error ? error.name : "Error";
        const message = error instanceof Error ? error.message : String(error);
        const code =
          typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
            ? error.code
            : "DAEMON_REQUEST_FAILED";
        socket.write(`${JSON.stringify({ id, error: { name, code, message } })}\n`);
      }
    })();
  });
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

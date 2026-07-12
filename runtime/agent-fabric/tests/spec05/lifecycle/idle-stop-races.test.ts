import { mkdtemp, rm } from "node:fs/promises";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BootstrapElection, FLOCK_ELECTION_LOCK_PORT } from "../../../src/daemon/bootstrap-election.ts";
import { attemptDrainedStop, attemptIdleStop } from "../../../src/daemon/global-liveness.ts";
import {
  closeRecoverableUnixListener,
  openRecoverableUnixListener,
} from "../../../src/daemon/recoverable-serving-socket.ts";
import { createLivenessDatabase, seedProject } from "./liveness-fixture.ts";

const databases: ReturnType<typeof createLivenessDatabase>[] = [];
const directories: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    if (!server.listening) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }));
  for (const database of databases.splice(0)) database.close();
  await Promise.allSettled(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("global idle stop races", () => {
  it("cancels quiesce when a concurrent launch advances global state", async () => {
    const database = createLivenessDatabase();
    databases.push(database);
    const root = await mkdtemp(join(tmpdir(), "fabric-idle-race-"));
    directories.push(root);
    const closeSocket = vi.fn();
    const reopenSocket = vi.fn();

    await expect(attemptIdleStop({
      actionId: "idle_race_01",
      election: new BootstrapElection({ runtimeDirectory: join(root, "runtime") }),
      database,
      daemonInstanceGeneration: 7,
      clock: () => 1_000,
      beforeFinalRecheck: async () => {
        seedProject(database, { sessionState: "active" });
        database.prepare("UPDATE daemon_global_state SET revision = revision + 1 WHERE singleton = 1").run();
      },
      closeSocket,
      reopenSocket,
    })).resolves.toMatchObject({ state: "busy", reason: "state-changed" });
    expect(closeSocket).not.toHaveBeenCalled();
    expect(reopenSocket).not.toHaveBeenCalled();
    expect(database.prepare("SELECT state, observed_global_revision FROM daemon_runtime_epochs WHERE instance_generation = 7").get())
      .toEqual({ state: "running", observed_global_revision: null });
  });

  it("holds the kernel election lock through final recheck and socket close", async () => {
    const database = createLivenessDatabase();
    databases.push(database);
    const root = await mkdtemp(join(tmpdir(), "fabric-idle-lock-order-"));
    directories.push(root);
    const runtimeDirectory = join(root, "runtime");
    const election = new BootstrapElection({ runtimeDirectory });
    const reopenSocket = vi.fn();
    const closeSocket = vi.fn().mockImplementation(async () => {
      await expect(FLOCK_ELECTION_LOCK_PORT.tryAcquire(election.paths.lockPath)).resolves.toBeUndefined();
    });

    await expect(attemptIdleStop({
      actionId: "idle_stop_01",
      election,
      database,
      daemonInstanceGeneration: 7,
      clock: () => 1_000,
      closeSocket,
      reopenSocket,
    })).resolves.toMatchObject({ state: "stopped", globalStateRevision: 1 });
    expect(closeSocket).toHaveBeenCalledTimes(1);
    expect(reopenSocket).not.toHaveBeenCalled();
    expect(database.prepare("SELECT state, stopped_at FROM daemon_runtime_epochs WHERE instance_generation = 7").get())
      .toEqual({ state: "stopped", stopped_at: 1_000 });

    await expect(attemptIdleStop({
      actionId: "idle_stop_repeat",
      election,
      database,
      daemonInstanceGeneration: 7,
      clock: () => 1_001,
      closeSocket,
      reopenSocket,
    })).resolves.toMatchObject({ state: "busy", reason: "epoch-not-running" });
    expect(closeSocket).toHaveBeenCalledTimes(1);
  });

  it("restores serving when a drained in-flight command creates a liveness contributor", async () => {
    const database = createLivenessDatabase();
    databases.push(database);
    const root = await mkdtemp(join(tmpdir(), "fabric-idle-post-drain-race-"));
    directories.push(root);
    const reopenSocket = vi.fn();

    await expect(attemptIdleStop({
      actionId: "idle_stop_post_drain_race_01",
      election: new BootstrapElection({ runtimeDirectory: join(root, "runtime") }),
      database,
      daemonInstanceGeneration: 7,
      clock: () => 1_000,
      closeSocket: async () => {
        seedProject(database, { sessionState: "active" });
        database.prepare("UPDATE daemon_global_state SET revision = revision + 1 WHERE singleton = 1").run();
      },
      reopenSocket,
    })).resolves.toMatchObject({ state: "busy", reason: "state-changed" });
    expect(reopenSocket).toHaveBeenCalledTimes(1);
    expect(database.prepare("SELECT state, observed_global_revision FROM daemon_runtime_epochs WHERE instance_generation = 7").get())
      .toEqual({ state: "running", observed_global_revision: null });
  });

  it("reopens the Unix listener and accepts connections after a post-drain busy result", async () => {
    const database = createLivenessDatabase();
    databases.push(database);
    const root = await mkdtemp(join(tmpdir(), "fabric-relisten-"));
    directories.push(root);
    const runtimeDirectory = join(root, "runtime");
    const socketPath = join(root, "fabric.sock");
    const activeSockets = new Set<Socket>();
    let acceptConnection!: () => void;
    const accepted = new Promise<void>((resolve) => { acceptConnection = resolve; });
    const server = createServer((socket) => {
      activeSockets.add(socket);
      socket.once("close", () => activeSockets.delete(socket));
      acceptConnection();
      socket.end();
    });
    servers.push(server);
    await openRecoverableUnixListener(server, socketPath);

    await expect(attemptIdleStop({
      actionId: "idle_stop_relisten_01",
      election: new BootstrapElection({ runtimeDirectory }),
      database,
      daemonInstanceGeneration: 7,
      clock: () => 1_000,
      closeSocket: async () => await closeRecoverableUnixListener({
        server,
        sockets: activeSockets,
        waitForInFlight: async () => {
          seedProject(database, { sessionState: "active" });
          database.prepare("UPDATE daemon_global_state SET revision = revision + 1 WHERE singleton = 1").run();
        },
      }),
      reopenSocket: async () => await openRecoverableUnixListener(server, socketPath),
    })).resolves.toMatchObject({ state: "busy", reason: "state-changed" });

    const client = createConnection(socketPath);
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve);
      client.once("error", reject);
    });
    await accepted;
    client.end();
    expect(server.listening).toBe(true);
  });

  it("closes a newly opened Unix listener when socket permission hardening fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-listener-mode-failure-"));
    directories.push(root);
    const socketPath = join(root, "fabric.sock");
    const server = createServer();
    servers.push(server);

    await expect(openRecoverableUnixListener(server, socketPath, {
      setMode: () => { throw new Error("mode hardening failed"); },
    })).rejects.toThrow("mode hardening failed");
    expect(server.listening).toBe(false);
  });

  it("atomically rejects a liveness revision that advances after the post-drain recheck", async () => {
    const database = createLivenessDatabase();
    databases.push(database);
    const root = await mkdtemp(join(tmpdir(), "fabric-idle-stop-cas-race-"));
    directories.push(root);
    const reopenSocket = vi.fn();

    await expect(attemptIdleStop({
      actionId: "idle_stop_cas_race_01",
      election: new BootstrapElection({ runtimeDirectory: join(root, "runtime") }),
      database,
      daemonInstanceGeneration: 7,
      clock: () => 1_000,
      beforeStopCommit: async () => {
        seedProject(database, { sessionState: "active" });
        database.prepare("UPDATE daemon_global_state SET revision = revision + 1 WHERE singleton = 1").run();
      },
      closeSocket: vi.fn(),
      reopenSocket,
    })).resolves.toMatchObject({ state: "busy", reason: "state-changed" });
    expect(reopenSocket).toHaveBeenCalledTimes(1);
    expect(database.prepare("SELECT state, stopped_at FROM daemon_runtime_epochs WHERE instance_generation = 7").get())
      .toEqual({ state: "running", stopped_at: null });
  });

  it("completes only the exact receipt-bound quiescing epoch", async () => {
    const database = createLivenessDatabase();
    databases.push(database);
    database.prepare(`
      UPDATE daemon_runtime_epochs SET state='quiescing', observed_global_revision=1
       WHERE instance_generation=7
    `).run();
    const root = await mkdtemp(join(tmpdir(), "fabric-drained-stop-"));
    directories.push(root);
    const closeSocket = vi.fn();
    const reopenSocket = vi.fn();

    await expect(attemptDrainedStop({
      actionId: "drained_stop_01",
      token: { daemonInstanceGeneration: 7, observedGlobalStateRevision: 1 },
      election: new BootstrapElection({ runtimeDirectory: join(root, "runtime") }),
      database,
      clock: () => 1_000,
      closeSocket,
      reopenSocket,
    })).resolves.toMatchObject({ state: "stopped", globalStateRevision: 1 });
    expect(closeSocket).toHaveBeenCalledTimes(1);
    expect(reopenSocket).not.toHaveBeenCalled();
  });
});

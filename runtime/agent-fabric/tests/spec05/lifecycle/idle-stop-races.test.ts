import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BootstrapElection, FLOCK_ELECTION_LOCK_PORT } from "../../../src/daemon/bootstrap-election.ts";
import { attemptDrainedStop, attemptIdleStop } from "../../../src/daemon/global-liveness.ts";
import { createLivenessDatabase, seedProject } from "./liveness-fixture.ts";

const databases: ReturnType<typeof createLivenessDatabase>[] = [];
const directories: string[] = [];

afterEach(async () => {
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
    })).resolves.toMatchObject({ state: "busy", reason: "state-changed" });
    expect(closeSocket).not.toHaveBeenCalled();
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
    })).resolves.toMatchObject({ state: "stopped", globalStateRevision: 1 });
    expect(closeSocket).toHaveBeenCalledTimes(1);
    expect(database.prepare("SELECT state, stopped_at FROM daemon_runtime_epochs WHERE instance_generation = 7").get())
      .toEqual({ state: "stopped", stopped_at: 1_000 });

    await expect(attemptIdleStop({
      actionId: "idle_stop_repeat",
      election,
      database,
      daemonInstanceGeneration: 7,
      clock: () => 1_001,
      closeSocket,
    })).resolves.toMatchObject({ state: "busy", reason: "epoch-not-running" });
    expect(closeSocket).toHaveBeenCalledTimes(1);
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

    await expect(attemptDrainedStop({
      actionId: "drained_stop_01",
      token: { daemonInstanceGeneration: 7, observedGlobalStateRevision: 1 },
      election: new BootstrapElection({ runtimeDirectory: join(root, "runtime") }),
      database,
      clock: () => 1_000,
      closeSocket,
    })).resolves.toMatchObject({ state: "stopped", globalStateRevision: 1 });
    expect(closeSocket).toHaveBeenCalledTimes(1);
  });
});

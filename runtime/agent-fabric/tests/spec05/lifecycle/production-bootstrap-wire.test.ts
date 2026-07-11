import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { startFabricDaemon, type FabricDaemonHandle } from "../../../src/daemon/client.ts";

const handles: FabricDaemonHandle[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.allSettled(handles.splice(0).reverse().map(async (handle) => handle.stop()));
  await Promise.allSettled(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe("production daemon bootstrap wiring", () => {
  it("handshakes first and coalesces repeated starts through one flock election without lock databases", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-production-bootstrap-"));
    roots.push(root);
    const stateDirectory = join(root, "state");
    const runtimeDirectory = join(root, "runtime");
    const options = {
      databasePath: join(stateDirectory, "fabric.sqlite3"),
      stateDirectory,
      runtimeDirectory,
      socketPath: join(runtimeDirectory, "fabric.sock"),
      workspaceRoots: [root],
    };

    const first = await startFabricDaemon(options);
    handles.push(first);
    const second = await startFabricDaemon(options);
    handles.push(second);

    expect(second.pid).toBe(first.pid);
    expect([
      ...await readdir(stateDirectory),
      ...await readdir(runtimeDirectory),
    ].filter((name) => name.endsWith(".lock.sqlite3"))).toEqual([]);
  });

  it("coalesces twelve production contenders onto exactly one child and one private discovery owner", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-production-contention-"));
    roots.push(root);
    const stateDirectory = join(root, "state");
    const runtimeDirectory = join(root, "runtime");
    const options = {
      databasePath: join(stateDirectory, "fabric.sqlite3"),
      stateDirectory,
      runtimeDirectory,
      socketPath: join(runtimeDirectory, "fabric.sock"),
      workspaceRoots: [root],
    };

    const contenders = await Promise.all(Array.from({ length: 12 }, async () => await startFabricDaemon(options)));
    handles.push(...contenders);

    expect(new Set(contenders.map((handle) => handle.pid)).size).toBe(1);
    expect(contenders.filter((handle) => handle.ownsProcess)).toHaveLength(1);
    const discovery = JSON.parse(await readFile(join(runtimeDirectory, "fabric-v1.discovery.json"), "utf8")) as Record<string, unknown>;
    expect(Object.keys(discovery).sort()).toEqual(["bootstrapCapability", "pid", "schemaVersion", "socketPath"]);
    expect((await stat(join(runtimeDirectory, "fabric-v1.discovery.json"))).mode & 0o777).toBe(0o600);
    expect([
      ...await readdir(stateDirectory),
      ...await readdir(runtimeDirectory),
    ].filter((name) => name.endsWith(".lock.sqlite3"))).toEqual([]);
  });

  it("records clean terminal ownership and advances the daemon epoch before restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-production-restart-"));
    roots.push(root);
    const stateDirectory = join(root, "state");
    const runtimeDirectory = join(root, "runtime");
    const options = {
      databasePath: join(stateDirectory, "fabric.sqlite3"),
      stateDirectory,
      runtimeDirectory,
      socketPath: join(runtimeDirectory, "fabric.sock"),
      workspaceRoots: [root],
    };

    const first = await startFabricDaemon(options);
    handles.push(first);
    const firstOwner = JSON.parse(await readFile(join(runtimeDirectory, "fabric-v1.discovery-owner.json"), "utf8")) as {
      daemonInstanceGeneration: number;
      state: string;
    };
    await first.stop();
    const stoppedOwner = JSON.parse(await readFile(join(runtimeDirectory, "fabric-v1.discovery-owner.json"), "utf8")) as {
      daemonInstanceGeneration: number;
      state: string;
    };
    expect(stoppedOwner).toMatchObject({
      daemonInstanceGeneration: firstOwner.daemonInstanceGeneration,
      state: "stopped",
    });

    const restarted = await startFabricDaemon(options);
    handles.push(restarted);
    const restartedOwner = JSON.parse(await readFile(join(runtimeDirectory, "fabric-v1.discovery-owner.json"), "utf8")) as {
      daemonInstanceGeneration: number;
      state: string;
    };
    expect(restarted.pid).not.toBe(first.pid);
    expect(restartedOwner).toMatchObject({
      daemonInstanceGeneration: firstOwner.daemonInstanceGeneration + 1,
      state: "active",
    });
  });

  it("does not replace ambiguous legacy discovery with a blind spawn", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-production-ambiguous-"));
    roots.push(root);
    const stateDirectory = join(root, "state");
    const runtimeDirectory = join(root, "runtime");
    const socketPath = join(runtimeDirectory, "fabric.sock");
    await Promise.all([
      mkdir(stateDirectory, { mode: 0o700 }),
      mkdir(runtimeDirectory, { mode: 0o700 }),
    ]);
    await writeFile(join(runtimeDirectory, "fabric-v1.discovery.json"), `${JSON.stringify({
      schemaVersion: 1,
      socketPath,
      pid: 2_147_483_647,
      bootstrapCapability: `afb_${"a".repeat(43)}`,
    })}\n`, { mode: 0o600 });

    await expect(startFabricDaemon({
      databasePath: join(stateDirectory, "fabric.sqlite3"),
      stateDirectory,
      runtimeDirectory,
      socketPath,
      workspaceRoots: [root],
    })).rejects.toMatchObject({ code: "BOOTSTRAP_RECONCILIATION_REQUIRED" });
    expect(await readdir(runtimeDirectory)).not.toContain("fabric.sock");

    await rm(join(runtimeDirectory, "fabric-v1.discovery.json"));
    await writeFile(socketPath, "orphaned socket placeholder\n", { mode: 0o600 });
    await expect(startFabricDaemon({
      databasePath: join(stateDirectory, "fabric.sqlite3"),
      stateDirectory,
      runtimeDirectory,
      socketPath,
      workspaceRoots: [root],
    })).rejects.toMatchObject({ code: "BOOTSTRAP_RECONCILIATION_REQUIRED" });
  });
});

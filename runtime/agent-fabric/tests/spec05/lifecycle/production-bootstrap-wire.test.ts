import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { startFabricDaemon, type FabricDaemonHandle } from "../../../src/daemon/client.ts";

const handles: FabricDaemonHandle[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.allSettled(handles.splice(0).reverse().map(async (handle) => handle.stop()));
  await Promise.allSettled(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe("production daemon bootstrap wiring", () => {
  it("accepts a production election proof without placeholder process-lock paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-production-process-proof-"));
    roots.push(root);
    const stateDirectory = join(root, "s");
    const runtimeDirectory = join(root, "r");
    await Promise.all([
      mkdir(stateDirectory, { recursive: true, mode: 0o700 }),
      mkdir(runtimeDirectory, { recursive: true, mode: 0o700 }),
    ]);
    const processPath = fileURLToPath(new URL("../../../src/daemon/process.ts", import.meta.url));
    const child = spawn(process.execPath, ["--import", "tsx", processPath], {
      cwd: fileURLToPath(new URL("../../..", import.meta.url)),
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? root,
        AGENT_FABRIC_DATABASE_PATH: join(stateDirectory, "fabric.sqlite3"),
        AGENT_FABRIC_SOCKET_PATH: join(runtimeDirectory, "f.sock"),
        AGENT_FABRIC_STATE_DIRECTORY: stateDirectory,
        AGENT_FABRIC_RUNTIME_DIRECTORY: runtimeDirectory,
        AGENT_FABRIC_BOOTSTRAP_CAPABILITY: `afb_${"a".repeat(43)}`,
        AGENT_FABRIC_BOOTSTRAP_MODE: "production-election",
        AGENT_FABRIC_BOOTSTRAP_ACTION_ID: "bootstrap_process_proof_01",
        AGENT_FABRIC_BOOTSTRAP_ELECTION_GENERATION: "1",
        AGENT_FABRIC_DAEMON_INSTANCE_GENERATION: "1",
        AGENT_FABRIC_CAPABILITY_KEY: "b".repeat(43),
        AGENT_FABRIC_EXECUTION_PROFILE: "headless",
        AGENT_FABRIC_MAXIMUM_CONCURRENT_PROVIDER_TURNS: "1",
        AGENT_FABRIC_WORKSPACE_ROOTS_JSON: JSON.stringify([root]),
        AGENT_FABRIC_ADAPTERS_JSON: "{}",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (child.stdout === null || child.stderr === null) throw new Error("daemon proof child pipes are unavailable");
    let childStderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { childStderr += chunk; });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const firstLine = await new Promise<string>((resolvePromise, reject) => {
      const timeout = setTimeout(() => reject(new Error("daemon proof child did not report readiness")), 10_000);
      lines.once("line", (line) => {
        clearTimeout(timeout);
        resolvePromise(line);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`daemon proof child exited before readiness: ${String(code)} ${childStderr}`));
      });
    });
    expect(JSON.parse(firstLine)).toEqual({ ready: true });
    child.kill("SIGTERM");
    await new Promise<void>((resolvePromise, reject) => {
      child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`daemon proof child exit ${String(code)}`)));
    });
  });

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
    const database = new Database(options.databasePath, { readonly: true, fileMustExist: true });
    try {
      expect(database.prepare(`
        SELECT instance_generation, state FROM daemon_runtime_epochs
        ORDER BY instance_generation DESC LIMIT 1
      `).get()).toEqual({ instance_generation: 1, state: "running" });
    } finally {
      database.close();
    }
    expect([
      ...await readdir(stateDirectory),
      ...await readdir(runtimeDirectory),
    ].filter((name) => name.endsWith(".lock.sqlite3"))).toEqual([]);
  });

  it("releases a bootstrap owner's local process handles without stopping the daemon", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-production-release-"));
    roots.push(root);
    const options = {
      databasePath: join(root, "state", "fabric.sqlite3"),
      stateDirectory: join(root, "state"),
      runtimeDirectory: join(root, "runtime"),
      socketPath: join(root, "runtime", "fabric.sock"),
      workspaceRoots: [root],
    };

    const owner = await startFabricDaemon(options);
    handles.push(owner);
    expect(owner.ownsProcess).toBe(true);
    owner.release();

    const attached = await startFabricDaemon(options);
    handles.push(attached);
    expect(attached.pid).toBe(owner.pid);
    expect(attached.ownsProcess).toBe(false);
    attached.release();
    await expect(attached.waitForExit()).resolves.toBeUndefined();
    process.kill(owner.pid, 0);
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

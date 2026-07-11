import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  type OperatorMutationContext,
} from "@local/agent-fabric-protocol";

import { startFabricDaemon, type FabricDaemonHandle } from "../../../src/index.ts";
import { openLocalOperatorConsoleSession } from "../../../src/operator/local-console-session.ts";
import { runWorkspaceTrust } from "../../../src/cli/workspace-trust.ts";

const roots: string[] = [];
const daemons: FabricDaemonHandle[] = [];

afterEach(async () => {
  await Promise.allSettled(daemons.splice(0).reverse().map(async (daemon) => daemon.stop()));
  await Promise.allSettled(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "fabric-console-session-"));
  roots.push(root);
  const stateDirectory = join(root, "state");
  const runtimeDirectory = join(root, "runtime");
  const projectA = join(root, "project-a");
  const projectB = join(root, "project-b");
  await Promise.all([
    mkdir(stateDirectory, { recursive: true, mode: 0o700 }),
    mkdir(runtimeDirectory, { recursive: true, mode: 0o700 }),
    mkdir(projectA),
    mkdir(projectB),
  ]);
  const paths = {
    stateDirectory,
    runtimeDirectory,
    databasePath: join(stateDirectory, "fabric.sqlite3"),
    socketPath: join(runtimeDirectory, "fabric.sock"),
  };
  await Promise.all([
    runWorkspaceTrust(["trust", projectA], paths),
    runWorkspaceTrust(["trust", projectB], paths),
  ]);
  const daemon = await startFabricDaemon({
    ...paths,
    workspaceRoots: [projectA, projectB],
    executionProfile: "headless",
  });
  daemons.push(daemon);
  return { paths, projectA, projectB, daemon };
}

async function holdFileLock(path: string): Promise<() => Promise<void>> {
  const script = `
    const fs = require("node:fs");
    const { flock } = require("fs-ext");
    const path = process.argv[1];
    const fd = fs.openSync(path, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600);
    flock(fd, "ex", (error) => {
      if (error) throw error;
      process.stdout.write("locked\\n");
      process.stdin.resume();
      process.stdin.once("end", () => flock(fd, "un", () => {
        fs.closeSync(fd);
        process.exit(0);
      }));
    });
  `;
  const child = spawn(process.execPath, ["-e", script, path], {
    cwd: new URL("../../..", import.meta.url),
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (child.stdin === null || child.stdout === null || child.stderr === null) {
    throw new Error("lock child pipes are unavailable");
  }
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  await new Promise<void>((resolvePromise, reject) => {
    child.stdout?.once("data", (chunk: Buffer) => {
      if (chunk.toString("utf8").startsWith("locked")) resolvePromise();
      else reject(new Error("lock child returned an invalid readiness marker"));
    });
    child.once("exit", (code) => reject(new Error(`lock child exited ${String(code)}: ${stderr}`)));
  });
  return async () => {
    child.stdin?.end();
    await new Promise<void>((resolvePromise, reject) => {
      child.once("exit", (code) => code === 0
        ? resolvePromise()
        : reject(new Error(`lock child exited ${String(code)}: ${stderr}`)));
    });
  };
}

async function waitForPath(path: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      await lstat(path);
      return;
    } catch (error: unknown) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 10));
  }
}

describe("public local operator Console session", () => {
  it("reuses one daemon and one project authority while attaching concurrent projects and clients", async () => {
    const { paths, projectA, projectB, daemon } = await fixture();

    const [first, second, otherProject] = await Promise.all([
      openLocalOperatorConsoleSession({
        projectRoot: projectA,
        surface: "standalone",
        paths,
        daemon: { executionProfile: "headless", workspaceRoots: [projectA, projectB] },
        clientId: "console_project_a_01",
      }),
      openLocalOperatorConsoleSession({
        projectRoot: projectA,
        surface: "herdr",
        paths,
        daemon: { executionProfile: "headless", workspaceRoots: [projectA, projectB] },
        clientId: "console_project_a_02",
      }),
      openLocalOperatorConsoleSession({
        projectRoot: projectB,
        surface: "standalone",
        paths,
        daemon: { executionProfile: "headless", workspaceRoots: [projectA, projectB] },
        clientId: "console_project_b_01",
      }),
    ]);

    expect(first.daemonPid).toBe(daemon.pid);
    expect(second.daemonPid).toBe(daemon.pid);
    expect(otherProject.daemonPid).toBe(daemon.pid);
    expect(first.projectId).toBe(second.projectId);
    expect(otherProject.projectId).not.toBe(first.projectId);
    expect(first.projectSessionId).toBeUndefined();
    expect(first.client.console?.readOnly).toBe(true);

    await Promise.all([
      first.detach({ reason: "operator" }),
      first.detach({ reason: "operator" }),
      second.close(),
      second.close(),
      otherProject.close(),
    ]);
    await first.close();

    const bootstrap = await import("better-sqlite3").then(({ default: Database }) =>
      new Database(paths.databasePath, { readonly: true, fileMustExist: true }),
    );
    try {
      expect(bootstrap.prepare("SELECT COUNT(*) AS count FROM projects").get()).toEqual({ count: 2 });
      expect(bootstrap.prepare("SELECT COUNT(*) AS count FROM operator_principals").get()).toEqual({ count: 2 });
      expect(bootstrap.prepare("SELECT COUNT(*) AS count FROM operator_client_attachments WHERE state='active'").get()).toEqual({ count: 0 });
    } finally {
      bootstrap.close();
    }
  });

  it("selects an existing session, reuses its bounded credential and never creates a session implicitly", async () => {
    const { paths, projectA, projectB } = await fixture();
    const project = await openLocalOperatorConsoleSession({
      projectRoot: projectA,
      surface: "standalone",
      paths,
      daemon: { executionProfile: "headless", workspaceRoots: [projectA, projectB] },
      clientId: "console_project_create_01",
    });
    const snapshot = await project.client.projection?.snapshot({
      credential: project.credential,
      projectId: project.projectId,
    });
    const createProjectSession = project.client.operations[FABRIC_OPERATIONS.projectSessionCreate];
    if (snapshot === undefined || createProjectSession === undefined) {
      throw new Error("project client did not negotiate project-session creation");
    }
    const command: OperatorMutationContext = {
      credential: project.credential,
      commandId: "console_create_session_01" as never,
      expectedRevision: snapshot.project.revision,
      actor: project.operatorId,
      provenance: {
        kind: "console-direct-input",
        clientId: project.clientId,
        inputEventId: "console_create_session_input_01",
      },
      evidenceRefs: [],
    };
    await createProjectSession({
      command,
      projectSessionId: "session_console_existing_01" as never,
      projectId: project.projectId,
      mode: "coordinated",
      generation: 1,
      authorityRef: `sha256:${"a".repeat(64)}` as never,
      budgetRef: "budget_console_existing_01",
      launchPacketRef: {
        path: "launch/packet.json" as never,
        digest: `sha256:${"b".repeat(64)}` as never,
      },
    });
    await project.close();

    const [first, replay] = await Promise.all([
      openLocalOperatorConsoleSession({
        projectRoot: projectA,
        surface: "standalone",
        paths,
        daemon: { executionProfile: "headless", workspaceRoots: [projectA, projectB] },
        clientId: "console_session_01",
      }),
      openLocalOperatorConsoleSession({
        projectRoot: projectA,
        surface: "herdr",
        paths,
        daemon: { executionProfile: "headless", workspaceRoots: [projectA, projectB] },
        clientId: "console_session_02",
      }),
    ]);

    expect(first.projectSessionId).toBe("session_console_existing_01");
    expect(replay.projectSessionId).toBe(first.projectSessionId);
    expect(first.credential.capabilityId).toBe(replay.credential.capabilityId);
    expect(first.client.console?.readOnly).toBe(false);
    expect(first.client.operations[FABRIC_OPERATIONS.operatorActionPreview]).toBeTypeOf("function");
    await Promise.all([first.close(), replay.close()]);
  });

  it("fails closed for untrusted roots and never creates default authority", async () => {
    const { paths, projectA, projectB } = await fixture();
    const untrusted = join(projectA, "untrusted-child");
    await mkdir(untrusted);

    await expect(openLocalOperatorConsoleSession({
      projectRoot: untrusted,
      surface: "standalone",
      paths,
      daemon: { executionProfile: "headless", workspaceRoots: [projectA, projectB] },
      clientId: "console_untrusted_01",
    })).rejects.toMatchObject({
      code: "CONSOLE_CONFIGURATION_UNAVAILABLE",
      reason: "configuration-missing",
    });
  });

  it("never direct-stops a ready shared daemon when its first Console fails late", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-console-late-failure-"));
    roots.push(root);
    const stateDirectory = join(root, "state");
    const runtimeDirectory = join(root, "runtime");
    const projectA = join(root, "project-a");
    const projectB = join(root, "project-b");
    await Promise.all([
      mkdir(stateDirectory, { recursive: true, mode: 0o700 }),
      mkdir(runtimeDirectory, { recursive: true, mode: 0o700 }),
      mkdir(projectA),
      mkdir(projectB),
    ]);
    const paths = {
      stateDirectory,
      runtimeDirectory,
      databasePath: join(stateDirectory, "fabric.sqlite3"),
      socketPath: join(runtimeDirectory, "fabric.sock"),
    };
    await runWorkspaceTrust(["trust", projectA], paths);
    await runWorkspaceTrust(["trust", projectB], paths);

    const projectKey = createHash("sha256")
      .update(await realpath(projectA))
      .digest("hex")
      .slice(0, 32);
    const custodyDirectory = join(stateDirectory, "console-operators", projectKey);
    await mkdir(custodyDirectory, { recursive: true, mode: 0o700 });
    const releaseLock = await holdFileLock(join(custodyDirectory, "credential.lock"));
    const first = openLocalOperatorConsoleSession({
      projectRoot: projectA,
      surface: "standalone",
      paths,
      daemon: { executionProfile: "headless", workspaceRoots: [projectA, projectB] },
      clientId: "console_late_failure_01",
    });
    void first.catch(() => undefined);
    await waitForPath(paths.socketPath);

    const survivor = await openLocalOperatorConsoleSession({
      projectRoot: projectB,
      surface: "standalone",
      paths,
      daemon: { executionProfile: "headless", workspaceRoots: [projectA, projectB] },
      clientId: "console_survivor_01",
    });
    try {
      await writeFile(
        join(custodyDirectory, "credential.json"),
        "{\"invalid\":true}\n",
        { mode: 0o600 },
      );
      await releaseLock();

      await expect(first).rejects.toMatchObject({
        code: "CONSOLE_AUTHORITY_UNAVAILABLE",
      });
      process.kill(survivor.daemonPid, 0);
      await expect(survivor.client.projection?.snapshot({
        credential: survivor.credential,
        projectId: survivor.projectId,
      })).resolves.toMatchObject({
        project: { freshness: "live", value: { projectId: survivor.projectId } },
      });
    } finally {
      await survivor.close().catch(() => undefined);
      try { process.kill(survivor.daemonPid, "SIGTERM"); } catch { /* already stopped */ }
    }
  });
});

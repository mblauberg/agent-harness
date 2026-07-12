import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { connectFabricDaemon, startFabricDaemon } from "../../src/index.ts";
import { DAEMON_ROOT_AUTHORITY } from "../support/daemon-testkit.ts";
import { createCurrentSessionRun } from "../support/current-session-testkit.ts";
import { callTool, spawnMcpProxy } from "../support/mcp-testkit.ts";

const fakeAdapter = fileURLToPath(new URL("../support/daemon-fake-adapter.ts", import.meta.url));

describe("daemon adapter composition", () => {
  it("validates enabled GitHub hosted checks in the authoritative daemon process", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-daemon-github-"));
    const stateDirectory = join(directory, "state");
    const runtimeDirectory = join(directory, "runtime");
    const socketPath = join(runtimeDirectory, "fabric.sock");
    const projectRoot = join(directory, "project");
    const executable = join(directory, "gh-fixture");
    const body = "#!/bin/sh\nexit 0\n";
    await mkdir(projectRoot);
    await writeFile(executable, body, { encoding: "utf8", mode: 0o700 });
    await chmod(executable, 0o700);
    let unexpected: Awaited<ReturnType<typeof startFabricDaemon>> | undefined;
    let rejected = false;
    try {
      try {
        unexpected = await startFabricDaemon({
          databasePath: join(stateDirectory, "fabric.sqlite3"),
          stateDirectory,
          runtimeDirectory,
          socketPath,
          workspaceRoots: [projectRoot],
          githubHostedChecks: {
            enabled: true,
            executable,
            executableDigest: `sha256:${"0".repeat(64)}`,
            hostname: "github.com",
            repository: "example/project",
            canonicalRepositoryRoot: projectRoot,
          },
        });
      } catch {
        rejected = true;
      }
      expect(rejected).toBe(true);
      expect(createHash("sha256").update(body).digest("hex")).not.toBe("0".repeat(64));
    } finally {
      if (unexpected !== undefined) await unexpected.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("passes an explicitly activated adapter into the authoritative daemon and journals a real fake-process action", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-daemon-adapter-"));
    const stateDirectory = join(directory, "state");
    const runtimeDirectory = join(directory, "runtime");
    const socketPath = join(runtimeDirectory, "fabric.sock");
    const databasePath = join(stateDirectory, "fabric.sqlite3");
    const daemon = await startFabricDaemon({
      databasePath, stateDirectory, runtimeDirectory, socketPath,
      adapters: { fake: { command: [process.execPath, "--import", "tsx", fakeAdapter], environment: { FAKE_ADAPTER_JOURNAL: join(directory, "fake-journal.json") } } },
    });
    const bootstrap = await connectFabricDaemon({ socketPath, capability: daemon.bootstrapCapability });
    try {
      const run = await createCurrentSessionRun({
        databasePath,
        workspaceRoot: directory,
        runId: "run-daemon-adapter",
        chair: { agentId: "chair", authority: { ...DAEMON_ROOT_AUTHORITY, disclosure: { level: "scoped", scopes: ["local", "approved-provider"] } as const } },
      });
      const chair = await connectFabricDaemon({ socketPath, capability: run.chairCapability });
      try {
        const action = await chair.dispatchProviderAction({ adapterId: "fake", actionId: "daemon-adapter:1", operation: "steer", payload: { instruction: "bounded review" }, commandId: "daemon-adapter:dispatch:1" });
        expect(action).toMatchObject({ actionId: "daemon-adapter:1", status: "terminal", executionCount: 1, effectCount: 1 });
      } finally {
        await chair.close();
      }
    } finally {
      await bootstrap.close();
      await daemon.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("runs a task-bound ephemeral provider review through the generated MCP surface", async () => {
    const directory = await mkdtemp(join(tmpdir(), "af-ephemeral-"));
    const stateDirectory = join(directory, "state");
    const runtimeDirectory = join(directory, "runtime");
    const socketPath = join(runtimeDirectory, "fabric.sock");
    const databasePath = join(stateDirectory, "fabric.sqlite3");
    const daemon = await startFabricDaemon({
      databasePath,
      stateDirectory,
      runtimeDirectory,
      socketPath,
      adapters: {
        fake: {
          command: [process.execPath, "--import", "tsx", fakeAdapter],
          environment: {
            FAKE_ADAPTER_JOURNAL: join(directory, "fake-journal.json"),
            FAKE_ADAPTER_EPHEMERAL_SPAWN: "1",
          },
          modelPolicy: {
            allowedFamilies: ["fake"],
            allowedModelPatterns: ["fake-reviewer-*"],
            requiresExplicitModel: true,
          },
        },
      },
    });
    const bootstrap = await connectFabricDaemon({ socketPath, capability: daemon.bootstrapCapability });
    let chairProxy: Awaited<ReturnType<typeof spawnMcpProxy>> | undefined;
    try {
      const rootAuthority = {
        ...DAEMON_ROOT_AUTHORITY,
        disclosure: { level: "scoped", scopes: ["local", "approved-provider"] } as const,
      };
      const run = await createCurrentSessionRun({
        databasePath,
        workspaceRoot: directory,
        runId: "run-daemon-ephemeral-review",
        chair: { agentId: "chair", authority: rootAuthority },
      });
      const chair = await connectFabricDaemon({ socketPath, capability: run.chairCapability });
      try {
        const reviewAuthority = await chair.delegateAuthority({
          parentAuthorityId: run.chairAuthorityId,
          authority: {
            ...rootAuthority,
            budget: { turns: 1, "cost:USD": 1 },
          },
          commandId: "daemon-ephemeral-review:authority",
        });
        chairProxy = await spawnMcpProxy({
          socketPath,
          capability: run.chairCapability,
          label: "daemon-ephemeral-review-chair",
        });
        const task = await callTool(chairProxy.client, "fabric_task_create", {
          taskId: "daemon-ephemeral-review",
          authorityId: reviewAuthority.authorityId,
          eligibleAgentIds: ["chair"],
          participantAgentIds: ["chair"],
          objective: "review the current implementation",
          baseRevision: "daemon-ephemeral-review-base",
          commandId: "daemon-ephemeral-review:task",
        });
        expect(task.isError, task.text).toBe(false);
        const outcome = await callTool(chairProxy.client, "fabric_provider_action_dispatch", {
          adapterId: "fake",
          actionId: "daemon-ephemeral-review:spawn",
          operation: "spawn",
          authorityId: reviewAuthority.authorityId,
          payload: {
            taskId: "daemon-ephemeral-review",
            model: "fake-reviewer-v1",
            modelFamily: "fake",
            prompt: "Review the current implementation read-only.",
            cwd: "src",
          },
          commandId: "daemon-ephemeral-review:dispatch",
        });
        expect(outcome.isError, outcome.text).toBe(false);
        expect(outcome.structured).toMatchObject({
          actionId: "daemon-ephemeral-review:spawn",
          status: "terminal",
          executionCount: 1,
          effectCount: 1,
          providerAnswer: "review:fake:fake-reviewer-v1",
          resultDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        });
      } finally {
        await chair.close();
      }
    } finally {
      await Promise.allSettled([chairProxy?.close(), bootstrap.close()]);
      await daemon.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

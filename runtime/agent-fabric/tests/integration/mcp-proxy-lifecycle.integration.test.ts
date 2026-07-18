import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  FABRIC_OPERATIONS,
  PROTOCOL_FEATURES,
  PROTOCOL_LIMITS,
  createProtocolInitializeResult,
  parseProtocolInitializeRequest,
  type ProtocolLimits,
  type VerifiedProtocolCredential,
} from "@local/agent-fabric-protocol";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

import { startFabricDaemon } from "../../src/index.ts";
import { createDaemonFixture } from "../support/daemon-testkit.ts";
import {
  callTool,
  createMcpFixture,
  MCP_ROOT_AUTHORITY,
  spawnMcpProxy,
} from "../support/mcp-testkit.ts";
import { trackTestProcess, untrackTestProcess } from "../support/test-process-registry.ts";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const mcpMain = fileURLToPath(new URL("../../src/mcp/main.ts", import.meta.url));

const timeoutCapability = `afc_${"a".repeat(43)}`;
const timeoutCredential: VerifiedProtocolCredential = {
  principal: {
    kind: "agent",
    agentId: "peer" as never,
    projectSessionId: "session_01" as never,
    runId: "run-timeout-recovery",
    principalGeneration: 1,
  },
  grantedOperations: [FABRIC_OPERATIONS.sendMessage, FABRIC_OPERATIONS.receiveMessages],
};

async function createTimeoutMcpFixture(options: {
  limits: ProtocolLimits;
  dispatch(operation: string): Promise<unknown> | unknown;
}) {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-mcp-timeout-"));
  const socketPath = join(directory, "fabric.sock");
  const server = createServer((socket) => {
    const lines = createInterface({ input: socket, crlfDelay: Infinity });
    lines.on("line", (line) => {
      const request = JSON.parse(line) as { id: string; operation: string; input: unknown };
      if (request.operation === "initialize") {
        const input = parseProtocolInitializeRequest(request.input);
        if (input.authentication.credential !== timeoutCapability) throw new Error("unexpected test capability");
        const result = createProtocolInitializeResult({
          request: input,
          verifiedCredential: timeoutCredential,
          daemonVersion: "0.1.0",
          daemonInstanceGeneration: 1,
          offeredFeatures: PROTOCOL_FEATURES,
          limits: options.limits,
          connectionNonce: "connection_timeout_test" as never,
        });
        socket.write(`${JSON.stringify({ id: request.id, operation: request.operation, ok: true, result })}\n`);
        return;
      }
      void Promise.resolve(options.dispatch(request.operation)).then((result) => {
        socket.write(`${JSON.stringify({ id: request.id, operation: request.operation, ok: true, result })}\n`);
      });
    });
  });
  await new Promise<void>((resolve, reject) => server.listen(socketPath, resolve).once("error", reject));
  const proxy = await spawnMcpProxy({ socketPath, capability: timeoutCapability, label: "timeout-peer" });
  return {
    proxy,
    async cleanup(): Promise<void> {
      await proxy.close().catch(() => undefined);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    },
  };
}

describe("MCP proxy lifecycle", () => {
  it("reconnects before dispatch after a review outlives the negotiated idle timeout", async () => {
    let dispatches = 0;
    const fixture = await createTimeoutMcpFixture({
      limits: { ...PROTOCOL_LIMITS, idleTimeoutMs: 40, requestTimeoutMs: 20 },
      dispatch: () => ({ messageId: `message_${String(++dispatches)}` }),
    });
    try {
      await delay(80);
      const sent = await callTool(fixture.proxy.client, "fabric_message_send", {
        audience: { kind: "agents", agentIds: ["chair"] },
        kind: "response",
        body: "review complete",
        requiresAck: true,
        dedupeKey: "review-complete-01",
      });

      expect(sent).toMatchObject({ isError: false, structured: { messageId: "message_1" } });
      expect(dispatches).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it("replays an in-flight timed-out message through its durable dedupe identity", async () => {
    let dispatches = 0;
    const fixture = await createTimeoutMcpFixture({
      limits: { ...PROTOCOL_LIMITS, idleTimeoutMs: 200, requestTimeoutMs: 30 },
      dispatch: async () => {
        dispatches += 1;
        if (dispatches === 1) await delay(90);
        return { messageId: "message_deduped" };
      },
    });
    try {
      const sent = await callTool(fixture.proxy.client, "fabric_message_send", {
        audience: { kind: "agents", agentIds: ["chair"] },
        kind: "response",
        body: "review complete",
        requiresAck: true,
        dedupeKey: "review-complete-02",
      });

      expect(sent).toMatchObject({ isError: false, structured: { messageId: "message_deduped" } });
      expect(dispatches).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });

  it("reconnects and returns actionable recovery for an ambiguous commandless timeout", async () => {
    let receives = 0;
    const fixture = await createTimeoutMcpFixture({
      limits: { ...PROTOCOL_LIMITS, idleTimeoutMs: 200, requestTimeoutMs: 30 },
      dispatch: async (operation) => {
        if (operation !== FABRIC_OPERATIONS.receiveMessages) return { messageId: "unexpected" };
        receives += 1;
        if (receives === 1) await delay(90);
        return { deliveries: [] };
      },
    });
    try {
      const timedOut = await callTool(fixture.proxy.client, "fabric_message_receive", {
        limit: 10,
        visibilityTimeoutMs: 30_000,
      });
      expect(timedOut).toMatchObject({
        isError: true,
        structured: {
          code: "RECONNECT_REQUIRED",
          action: "Reconcile the operation outcome before retrying the Fabric request.",
        },
      });

      await expect(callTool(fixture.proxy.client, "fabric_message_receive", {
        limit: 10,
        visibilityTimeoutMs: 30_000,
      })).resolves.toMatchObject({ isError: false, structured: { deliveries: [] } });
      expect(receives).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });

  it("replays command-identified requests after restart and preserves their domain errors", async () => {
    const fixture = await createMcpFixture("run-mcp-daemon-restart");
    let replacement: Awaited<ReturnType<typeof startFabricDaemon>> | undefined;
    try {
      const before = await callTool(fixture.chairProxy.client, "fabric_message_receive", {
        limit: 10,
        visibilityTimeoutMs: 30_000,
      });
      expect(before.isError).toBe(false);

      await fixture.daemon.stop();
      untrackTestProcess(fixture.daemon.pid);
      replacement = await startFabricDaemon({
        databasePath: fixture.databasePath,
        stateDirectory: join(fixture.directory, "state"),
        runtimeDirectory: join(fixture.directory, "runtime"),
        socketPath: fixture.socketPath,
        workspaceRoots: [fixture.directory],
      });
      trackTestProcess(replacement.pid, `replacement Fabric daemon ${fixture.directory}`);

      const [created, missing] = await Promise.all([
        callTool(fixture.chairProxy.client, "fabric_task_create", {
          taskId: "task-after-restart",
          authorityId: fixture.run.chairAuthorityId,
          eligibleAgentIds: ["chair"],
          objective: "prove stable replay after restart",
          baseRevision: "restart-base",
          commandId: "restart:create-task",
        }),
        callTool(fixture.chairProxy.client, "fabric_task_claim", {
          taskId: "missing-after-restart",
          expectedRevision: 1,
          commandId: "restart:claim-missing",
        }),
      ]);
      expect(created).toMatchObject({ isError: false, structured: { taskId: "task-after-restart" } });
      expect(missing).toMatchObject({ isError: true, structured: { code: "NOT_FOUND" } });
    } finally {
      if (replacement !== undefined) {
        await replacement.stop().catch(() => undefined);
        untrackTestProcess(replacement.pid);
      }
      await fixture.cleanup();
    }
  });

  it("replays commandless requests when a disconnect was observed before dispatch", async () => {
    const fixture = await createMcpFixture("run-mcp-no-unsafe-replay");
    let replacement: Awaited<ReturnType<typeof startFabricDaemon>> | undefined;
    const delegatedAuthority = {
      ...MCP_ROOT_AUTHORITY,
      sourcePaths: ["src/reconnected-peer"],
      artifactPaths: [".agent-run/reconnected-peer"],
      budget: { turns: 1, "cost:USD": 1 },
    };
    try {
      await fixture.daemon.stop();
      untrackTestProcess(fixture.daemon.pid);
      replacement = await startFabricDaemon({
        databasePath: fixture.databasePath,
        stateDirectory: join(fixture.directory, "state"),
        runtimeDirectory: join(fixture.directory, "runtime"),
        socketPath: fixture.socketPath,
        workspaceRoots: [fixture.directory],
      });
      trackTestProcess(replacement.pid, `replacement Fabric daemon ${fixture.directory}`);

      const results = await Promise.all([
        callTool(fixture.chairProxy.client, "fabric_message_receive", {
          limit: 10,
          visibilityTimeoutMs: 30_000,
        }),
        callTool(fixture.chairProxy.client, "fabric_authority_delegate", {
          parentAuthorityId: fixture.run.chairAuthorityId,
          authority: delegatedAuthority,
        }),
      ]);
      expect(results).toEqual([
        expect.objectContaining({ isError: false }),
        expect.objectContaining({ isError: false }),
      ]);
    } finally {
      if (replacement !== undefined) {
        await replacement.stop().catch(() => undefined);
        untrackTestProcess(replacement.pid);
      }
      await fixture.cleanup();
    }
  });

  it("returns one reconnect action when the daemon remains unavailable", async () => {
    const fixture = await createMcpFixture("run-mcp-daemon-unavailable");
    try {
      await fixture.daemon.stop();
      untrackTestProcess(fixture.daemon.pid);

      const result = await callTool(fixture.chairProxy.client, "fabric_message_receive", {
        limit: 10,
        visibilityTimeoutMs: 30_000,
      });
      expect(result).toEqual({
        isError: true,
        structured: {
          code: "RECONNECT_REQUIRED",
          message: "Agent Fabric could not reconnect to the daemon",
          action: "Retry the Fabric request after the daemon is available.",
        },
        text: JSON.stringify({
          code: "RECONNECT_REQUIRED",
          message: "Agent Fabric could not reconnect to the daemon",
          action: "Retry the Fabric request after the daemon is available.",
        }),
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("initializes with only exact-root bootstrap when the configured seat is not provisioned", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-mcp-unprovisioned-"));
    const project = join(directory, "project");
    const state = join(directory, "state");
    await Promise.all([mkdir(project), mkdir(state)]);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", mcpMain],
      cwd: packageRoot,
      env: {
        AGENT_FABRIC_CLIENT_LABEL: "unprovisioned-test",
        AGENT_FABRIC_PROJECT_PATH: project,
        AGENT_FABRIC_SEAT: "codex",
        AGENT_FABRIC_STATE_DIRECTORY: state,
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
        ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
      },
    });
    const client = new Client({ name: "unprovisioned-test", version: "0.1.0" });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map(({ name }) => name)).toEqual(["fabric_bootstrap"]);
      await expect(client.listResources()).resolves.toEqual({ resources: [] });
      await expect(client.listResourceTemplates()).resolves.toEqual({ resourceTemplates: [] });
    } finally {
      await client.close().catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("closes its daemon connection and exits when the client closes stdin", async () => {
    const fixture = await createDaemonFixture("run-mcp-eof");
    const child = spawn(process.execPath, ["--import", "tsx", mcpMain], {
      cwd: packageRoot,
      env: {
        AGENT_FABRIC_SOCKET_PATH: fixture.socketPath,
        AGENT_FABRIC_CAPABILITY: fixture.peerCapability,
        AGENT_FABRIC_CLIENT_LABEL: "eof-test",
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      await delay(200);
      child.stdin.end();
      const result = await Promise.race([
        new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
          child.once("close", (code, signal) => resolve({ code, signal }));
        }),
        delay(2_000).then(() => ({ code: null, signal: "SIGALRM" as NodeJS.Signals })),
      ]);
      expect(result).toEqual({ code: 0, signal: null });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await fixture.cleanup();
    }
  });
});

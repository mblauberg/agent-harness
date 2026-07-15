import Database from "better-sqlite3";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AUTHORITY_ACTION_VOCABULARY, connectFabricDaemon, startFabricDaemon } from "../../../src/index.ts";
import { TEST_AUTHORITY_V2_FIELDS } from "../../support/authority-v2-testkit.ts";
import { callTool, spawnMcpProxy } from "../../support/mcp-testkit.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";

const fakeAdapter = fileURLToPath(new URL("../../support/agent-bridge-fake-provider.ts", import.meta.url));

const authority = {
  ...TEST_AUTHORITY_V2_FIELDS,
  workspaceRoots: ["."],
  sourcePaths: ["src"],
  artifactPaths: [".agent-run"],
  actions: [...AUTHORITY_ACTION_VOCABULARY],
  disclosure: { level: "scoped", scopes: ["local", "approved-provider"] } as const,
  expiresAt: "2099-01-01T00:00:00.000Z",
  budget: { turns: 100, descendants: 10 },
};

function createChildBridgeLossBarrier(controlSocketPath: string): Readonly<{
  waitForAuditReady(): Promise<void>;
  requestLoss(): Promise<string>;
  cancel(): void;
}> {
  const socket = createConnection(controlSocketPath);
  const connected = once(socket, "connect");
  const input = createInterface({ input: socket, crlfDelay: Infinity });
  const lines = input[Symbol.asyncIterator]();
  const nextLine = async (expected: string): Promise<string> => {
    const line = await lines.next();
    if (line.done || line.value !== expected) {
      throw new Error(`expected fake provider ${expected}, received ${line.done ? "EOF" : line.value}`);
    }
    return `${line.value}\n`;
  };
  return {
    async waitForAuditReady(): Promise<void> {
      await connected;
      socket.write("ARM\n");
      await nextLine("AUDIT_READY");
    },
    async requestLoss(): Promise<string> {
      socket.write("LOSS_REQUEST\n");
      return await nextLine("LOSS_OBSERVED");
    },
    cancel(): void {
      input.close();
      socket.destroy();
    },
  };
}

describe("Spec 05 provider child custody", () => {
  it("spawns through one private bridge and returns only generation-bound custody evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-child-custody-"));
    const databasePath = join(directory, "fabric.sqlite3");
    const journalPath = join(directory, "adapter-journal.json");
    const socketPath = join(directory, "runtime", "fabric.sock");
    const daemon = await startFabricDaemon({
      databasePath,
      stateDirectory: join(directory, "state"),
      runtimeDirectory: join(directory, "runtime"),
      socketPath,
      workspaceRoots: [directory],
      adapters: {
        "agent-bridge-fake": {
          command: [process.execPath, "--import", "tsx", fakeAdapter],
          environment: { AGENT_BRIDGE_FAKE_JOURNAL: journalPath },
        },
      },
    });
    const bootstrap = await connectFabricDaemon({ socketPath, capability: daemon.bootstrapCapability });
    let chair: Awaited<ReturnType<typeof connectFabricDaemon>> | undefined;
    let chairProxy: Awaited<ReturnType<typeof spawnMcpProxy>> | undefined;
    try {
      const run = await createCurrentSessionRun({ databasePath, workspaceRoot: directory, runId: "run-child-custody", chair: { agentId: "chair", authority } });
      chair = await connectFabricDaemon({ socketPath, capability: run.chairCapability });
      chairProxy = await spawnMcpProxy({ socketPath, capability: run.chairCapability, label: "child-custody" });
      const child = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority, sourcePaths: ["src/child"], budget: { turns: 10, descendants: 0 } },
      });
      const outcome = await callTool(chairProxy.client, "fabric_agent_spawn", {
        agentId: "child",
        authorityId: child.authorityId,
        adapterId: "agent-bridge-fake",
        actionId: "spawn-child-1",
        payload: { initialPrompt: "work" },
      });
      expect(outcome.isError, JSON.stringify(outcome)).toBe(false);
      const result = outcome.structured;
      expect(result).toStrictEqual({
        agentId: "child",
        authorityId: child.authorityId,
        adapterId: "agent-bridge-fake",
        actionId: "spawn-child-1",
        providerSessionRef: "fake-session:child",
        providerSessionGeneration: 1,
        bridgeState: "active",
        bridgeGeneration: 1,
        evidenceDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      });
      expect(JSON.stringify(result)).not.toContain("afc_");

      const database = new Database(databasePath, { readonly: true });
      try {
        const durable = JSON.stringify({
          actions: database.prepare("SELECT payload_json, result_json FROM provider_actions").all(),
          custody: database.prepare("SELECT * FROM provider_agent_custody").all(),
          bridge: database.prepare("SELECT * FROM agent_bridge_state").all(),
        });
        expect(durable).not.toContain("afc_");
        expect(database.prepare("SELECT bridge_state FROM agent_bridge_state WHERE agent_id='child'").get())
          .toEqual({ bridge_state: "active" });
      } finally {
        database.close();
      }
      expect(await readFile(journalPath, "utf8")).not.toContain("afc_");
    } finally {
      await Promise.allSettled([chairProxy?.close(), chair?.close(), bootstrap.close()]);
      await daemon.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("attaches honestly without a bridge and rejects bridge-incapable spawn before identity mutation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-child-no-bridge-"));
    const databasePath = join(directory, "fabric.sqlite3");
    const socketPath = join(directory, "runtime", "fabric.sock");
    const daemon = await startFabricDaemon({
      databasePath,
      stateDirectory: join(directory, "state"),
      runtimeDirectory: join(directory, "runtime"),
      socketPath,
      workspaceRoots: [directory],
      adapters: {
        "agent-bridge-fake": {
          command: [process.execPath, "--import", "tsx", fakeAdapter],
          environment: {
            AGENT_BRIDGE_FAKE_JOURNAL: join(directory, "adapter-journal.json"),
            AGENT_BRIDGE_FAKE_NO_BRIDGE: "1",
          },
        },
      },
    });
    const bootstrap = await connectFabricDaemon({ socketPath, capability: daemon.bootstrapCapability });
    let chair: Awaited<ReturnType<typeof connectFabricDaemon>> | undefined;
    let chairProxy: Awaited<ReturnType<typeof spawnMcpProxy>> | undefined;
    try {
      const run = await createCurrentSessionRun({ databasePath, workspaceRoot: directory, runId: "run-child-no-bridge", chair: { agentId: "chair", authority } });
      chair = await connectFabricDaemon({ socketPath, capability: run.chairCapability });
      chairProxy = await spawnMcpProxy({ socketPath, capability: run.chairCapability, label: "child-no-bridge" });
      const child = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority, sourcePaths: ["src/attached"], budget: { turns: 10, descendants: 0 } },
      });
      const attached = await callTool(chairProxy.client, "fabric_agent_attach", {
        agentId: "attached",
        authorityId: child.authorityId,
        adapterId: "agent-bridge-fake",
        actionId: "attach-child-1",
        providerSessionRef: "existing-provider-session",
      });
      expect(attached.isError, attached.text).toBe(false);
      expect(attached.structured).toMatchObject({
        agentId: "attached",
        providerSessionRef: "existing-provider-session",
        bridgeState: "none",
        bridgeGeneration: 1,
      });
      expect(JSON.stringify(attached.structured)).not.toContain("afc_");

      const unsupported = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority, sourcePaths: ["src/unsupported"], budget: { turns: 10, descendants: 0 } },
      });
      const rejected = await callTool(chairProxy.client, "fabric_agent_spawn", {
        agentId: "unsupported",
        authorityId: unsupported.authorityId,
        adapterId: "agent-bridge-fake",
        actionId: "spawn-child-unsupported",
        payload: { initialPrompt: "work" },
      });
      expect(rejected.isError).toBe(true);
      expect(rejected.text).toContain("CAPABILITY_UNAVAILABLE");

      const database = new Database(databasePath, { readonly: true });
      try {
        expect(database.prepare("SELECT bridge_state FROM agent_bridge_state WHERE agent_id='attached'").get())
          .toEqual({ bridge_state: "none" });
        expect(database.prepare("SELECT COUNT(*) AS count FROM capabilities WHERE agent_id='attached'").get())
          .toEqual({ count: 0 });
        expect(database.prepare("SELECT COUNT(*) AS count FROM agents WHERE agent_id='unsupported'").get())
          .toEqual({ count: 0 });
      } finally {
        database.close();
      }
    } finally {
      await Promise.allSettled([chairProxy?.close(), chair?.close(), bootstrap.close()]);
      await daemon.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists and fences a post-activation child bridge loss without fencing the chair run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-child-loss-"));
    const databasePath = join(directory, "fabric.sqlite3");
    const socketPath = join(directory, "runtime", "fabric.sock");
    const lossControlSocketPath = join(directory, "child-bridge-loss.sock");
    const lossObservedPath = join(directory, "child-bridge-loss-observed");
    const daemon = await startFabricDaemon({
      databasePath,
      stateDirectory: join(directory, "state"),
      runtimeDirectory: join(directory, "runtime"),
      socketPath,
      workspaceRoots: [directory],
      adapters: {
        "agent-bridge-fake": {
          command: [process.execPath, "--import", "tsx", fakeAdapter],
          environment: {
            AGENT_BRIDGE_FAKE_JOURNAL: join(directory, "adapter-journal.json"),
            AGENT_BRIDGE_FAKE_LOSS_CONTROL_SOCKET: lossControlSocketPath,
            AGENT_BRIDGE_FAKE_LOSS_OBSERVED: lossObservedPath,
          },
        },
      },
    });
    const bootstrap = await connectFabricDaemon({ socketPath, capability: daemon.bootstrapCapability });
    let chair: Awaited<ReturnType<typeof connectFabricDaemon>> | undefined;
    let chairProxy: Awaited<ReturnType<typeof spawnMcpProxy>> | undefined;
    let lossBarrier: ReturnType<typeof createChildBridgeLossBarrier> | undefined;
    try {
      const run = await createCurrentSessionRun({ databasePath, workspaceRoot: directory, runId: "run-child-loss", chair: { agentId: "chair", authority } });
      chair = await connectFabricDaemon({ socketPath, capability: run.chairCapability });
      chairProxy = await spawnMcpProxy({ socketPath, capability: run.chairCapability, label: "child-live-loss" });
      const child = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority, sourcePaths: ["src/lost"], budget: { turns: 10, descendants: 0 } },
      });
      const spawned = await callTool(chairProxy.client, "fabric_agent_spawn", {
        agentId: "lost-child",
        authorityId: child.authorityId,
        adapterId: "agent-bridge-fake",
        actionId: "spawn-child-loss",
        payload: { initialPrompt: "work" },
      });
      expect(spawned.isError, spawned.text).toBe(false);
      expect(spawned.structured).toMatchObject({ bridgeState: "active", bridgeGeneration: 1 });

      lossBarrier = createChildBridgeLossBarrier(lossControlSocketPath);
      await lossBarrier.waitForAuditReady();
      expect(await lossBarrier.requestLoss()).toBe("LOSS_OBSERVED\n");
      expect(await readFile(lossObservedPath, "utf8")).toBe("child-bridge-loss-observed\n");
      const listed = await callTool(chairProxy.client, "fabric_agent_list", { runId: run.runId });
      expect((listed.structured.agents as Array<Record<string, unknown>>).find(({ agentId }) => agentId === "lost-child"))
        .toMatchObject({ bridgeState: "lost", bridgeGeneration: 2 });

      const database = new Database(databasePath, { readonly: true });
      try {
        expect(database.prepare("SELECT COUNT(*) AS count FROM child_bridge_losses WHERE agent_id='lost-child'").get())
          .toEqual({ count: 1 });
        expect(database.prepare(`
          SELECT c.revoked_at IS NOT NULL AS revoked
            FROM capabilities c JOIN provider_agent_custody p ON p.capability_hash=c.token_hash
           WHERE p.target_agent_id='lost-child'
        `).get()).toEqual({ revoked: 1 });
        expect(database.prepare("SELECT lifecycle_state, revision FROM runs WHERE run_id='run-child-loss'").get())
          .toEqual({ lifecycle_state: "active", revision: 1 });
      } finally {
        database.close();
      }
      const rebound = await callTool(chairProxy.client, "fabric_agent_spawn", {
        agentId: "lost-child",
        authorityId: child.authorityId,
        adapterId: "agent-bridge-fake",
        actionId: "spawn-child-loss-rebind",
        payload: { initialPrompt: "resume under a fresh bridge" },
      });
      expect(rebound.isError, rebound.text).toBe(false);
      expect(rebound.structured).toMatchObject({ bridgeState: "active", bridgeGeneration: 2 });
    } finally {
      lossBarrier?.cancel();
      await Promise.allSettled([chairProxy?.close(), chair?.close(), bootstrap.close()]);
      try {
        process.kill(daemon.pid, "SIGKILL");
      } catch (error: unknown) {
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
      }
      await daemon.waitForExit();
      await daemon.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses lookup only after an ambiguous daemon crash and fences the unrecoverable volatile bridge", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-child-restart-"));
    const databasePath = join(directory, "fabric.sqlite3");
    const journalPath = join(directory, "adapter-journal.json");
    const stateDirectory = join(directory, "state");
    const runtimeDirectory = join(directory, "runtime");
    const socketPath = join(runtimeDirectory, "fabric.sock");
    const options = {
      databasePath,
      stateDirectory,
      runtimeDirectory,
      socketPath,
      workspaceRoots: [directory],
      adapters: {
        "agent-bridge-fake": {
          command: [process.execPath, "--import", "tsx", fakeAdapter],
          environment: { AGENT_BRIDGE_FAKE_JOURNAL: journalPath },
        },
      },
    };
    const first = await startFabricDaemon(options);
    const bootstrap = await connectFabricDaemon({ socketPath, capability: first.bootstrapCapability });
    let chair: Awaited<ReturnType<typeof connectFabricDaemon>> | undefined;
    let chairProxy: Awaited<ReturnType<typeof spawnMcpProxy>> | undefined;
    let second: Awaited<ReturnType<typeof startFabricDaemon>> | undefined;
    let firstStopped = false;
    try {
      const run = await createCurrentSessionRun({ databasePath, workspaceRoot: directory, runId: "run-child-restart", chair: { agentId: "chair", authority } });
      chair = await connectFabricDaemon({ socketPath, capability: run.chairCapability });
      chairProxy = await spawnMcpProxy({ socketPath, capability: run.chairCapability, label: "child-restart" });
      const child = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority, sourcePaths: ["src/restart"], budget: { turns: 10, descendants: 0 } },
      });
      const spawned = await callTool(chairProxy.client, "fabric_agent_spawn", {
        agentId: "restart-child",
        authorityId: child.authorityId,
        adapterId: "agent-bridge-fake",
        actionId: "spawn-child-restart",
        payload: { initialPrompt: "work" },
      });
      expect(spawned.isError, spawned.text).toBe(false);
      expect(spawned.structured).toMatchObject({ bridgeState: "active", bridgeGeneration: 1 });
      await Promise.allSettled([chairProxy.close(), chair.close(), bootstrap.close()]);
      chair = undefined;
      chairProxy = undefined;
      await first.stop();
      firstStopped = true;

      const crashed = new Database(databasePath);
      try {
        crashed.transaction(() => {
          crashed.prepare(`
            UPDATE provider_actions
               SET status='ambiguous', history_json='["prepared","dispatched","ambiguous"]',
                   effect_count=0, idempotency_proven=0,
                   result_json='{"schemaVersion":1,"kind":"agent-custody-ambiguous"}'
             WHERE action_id='spawn-child-restart'
          `).run();
          crashed.prepare(`
            UPDATE agent_bridge_state
               SET provider_session_ref=NULL, provider_session_generation=NULL,
                   bridge_state='pending', activation_evidence_digest=NULL
             WHERE agent_id='restart-child'
          `).run();
          crashed.prepare("UPDATE agents SET provider_session_ref=NULL WHERE agent_id='restart-child'").run();
        })();
      } finally {
        crashed.close();
      }

      second = await startFabricDaemon(options);
      const database = new Database(databasePath, { readonly: true });
      try {
        expect(database.prepare("SELECT bridge_state, bridge_generation FROM agent_bridge_state WHERE agent_id='restart-child'").get())
          .toEqual({ bridge_state: "lost", bridge_generation: 2 });
        expect(database.prepare("SELECT COUNT(*) AS count FROM child_bridge_losses WHERE agent_id='restart-child'").get())
          .toEqual({ count: 1 });
      } finally {
        database.close();
      }
      const journal = JSON.parse(await readFile(journalPath, "utf8")) as { requestLines: string[] };
      const methods = journal.requestLines.map((line) => (JSON.parse(line) as { method: string }).method);
      expect(methods.filter((method) => method === "provision_agent")).toHaveLength(1);
      expect(methods.filter((method) => method === "lookup_action")).toHaveLength(1);
    } finally {
      await Promise.allSettled([chairProxy?.close(), chair?.close(), bootstrap.close()]);
      if (!firstStopped) await first.stop();
      await second?.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

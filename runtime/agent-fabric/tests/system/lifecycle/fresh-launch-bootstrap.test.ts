import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { runWorkspaceTrust } from "../../../src/cli/workspace-trust.ts";
import type { FabricPaths } from "../../../src/cli/paths.ts";
import { startFabricDaemon, type FabricDaemonHandle } from "../../../src/daemon/client.ts";
import { callTool } from "../../support/mcp-testkit.ts";
import { trackTestProcess } from "../../support/test-process-registry.ts";

const roots: string[] = [];
const daemons: FabricDaemonHandle[] = [];
const mcpMain = fileURLToPath(new URL("../../../src/mcp/main.ts", import.meta.url));
const tsxLoader = fileURLToPath(new URL("../../../../../../../node_modules/tsx/dist/loader.mjs", import.meta.url));

async function fixture(): Promise<{ projectRoot: string; paths: FabricPaths }> {
  const temporaryRoot = await mkdtemp("/tmp/afb-");
  roots.push(temporaryRoot);
  const root = await realpath(temporaryRoot);
  const projectRoot = join(root, "project");
  const stateDirectory = join(root, "state");
  const runtimeDirectory = join(root, "runtime");
  await Promise.all([
    mkdir(projectRoot),
    mkdir(stateDirectory, { mode: 0o700 }),
    mkdir(runtimeDirectory, { mode: 0o700 }),
  ]);
  const paths: FabricPaths = {
    stateDirectory,
    runtimeDirectory,
    databasePath: join(stateDirectory, "fabric-v1.sqlite3"),
    socketPath: join(runtimeDirectory, "fabric-v1.sock"),
  };
  await runWorkspaceTrust(["trust", projectRoot], paths);
  const daemon = await startFabricDaemon({
    ...paths,
    executionProfile: "headless",
    workspaceRoots: [projectRoot],
    adapters: {},
  });
  daemons.push(daemon);
  trackTestProcess(daemon.pid, "zero-state-bootstrap-daemon");
  return { projectRoot, paths };
}

async function openMcpClient(
  seat: "claude" | "codex",
  projectRoot: string,
  paths: FabricPaths,
  suffix: string = seat,
): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", tsxLoader, mcpMain],
    cwd: projectRoot,
    env: {
      AGENT_FABRIC_SOCKET_PATH: paths.socketPath,
      AGENT_FABRIC_STATE_DIRECTORY: paths.stateDirectory,
      AGENT_FABRIC_RUNTIME_DIRECTORY: paths.runtimeDirectory,
      AGENT_FABRIC_SEAT: seat,
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      TMPDIR: process.env.TMPDIR ?? "/tmp",
      ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
    },
  });
  const client = new Client({ name: `bootstrap-${suffix}`, version: "0.1.0" });
  await client.connect(transport);
  return client;
}

afterEach(async () => {
  await Promise.allSettled(daemons.splice(0).reverse().map(async (daemon) => daemon.stop()));
  await Promise.allSettled(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe("fresh Agent Fabric launch bootstrap", () => {
  it("converges concurrent Claude and Codex zero-state calls and hot-switches both MCP clients", async () => {
    const { projectRoot, paths } = await fixture();
    const clients = await Promise.all((["codex", "claude"] as const).map(async (seat) => ({
      seat,
      client: await openMcpClient(seat, projectRoot, paths),
    })));
    try {
      for (const { client } of clients) {
        expect((await client.listTools()).tools.map(({ name }) => name)).toEqual(["fabric_bootstrap"]);
      }
      const results = await Promise.all(clients.map(async ({ client }) => callTool(client, "fabric_bootstrap", {})));
      if (!results.every((result) => result.isError === false)) throw new Error(JSON.stringify(results));
      for (const { client } of clients) {
        const names = (await client.listTools()).tools.map(({ name }) => name);
        expect(names).not.toContain("fabric_bootstrap");
        expect(names).toContain("fabric_run_status_read");
        expect(names).toContain("fabric_evidence_publish");
      }
      const database = new Database(paths.databasePath, { readonly: true });
      try {
        expect(database.prepare("SELECT count(*) AS count FROM runs").get()).toEqual({ count: 1 });
        expect(database.prepare("SELECT count(*) AS count FROM agents").get()).toEqual({ count: 2 });
        expect(database.prepare("SELECT count(*) AS count FROM mcp_active_seat_generations").get()).toEqual({ count: 1 });
      } finally {
        database.close();
      }
    } finally {
      await Promise.allSettled(clients.map(async ({ client }) => client.close()));
    }
  });

  it("refreshes stale first-seat proxies once for both tool and resource reads after peer rotation", async () => {
    const { projectRoot, paths } = await fixture();
    const codexTool = await openMcpClient("codex", projectRoot, paths, "codex-tool");
    const clients = [codexTool];
    try {
      expect((await codexTool.listTools()).tools.map(({ name }) => name)).toEqual(["fabric_bootstrap"]);
      expect((await callTool(codexTool, "fabric_bootstrap", {})).isError).toBe(false);
      const codexResource = await openMcpClient("codex", projectRoot, paths, "codex-resource");
      clients.push(codexResource);
      const claude = await openMcpClient("claude", projectRoot, paths);
      clients.push(claude);
      expect((await claude.listTools()).tools.map(({ name }) => name)).toEqual(["fabric_bootstrap"]);
      expect((await callTool(claude, "fabric_bootstrap", {})).isError).toBe(false);

      const database = new Database(paths.databasePath, { readonly: true });
      const run = database.prepare("SELECT run_id FROM runs").get() as { run_id: string };
      database.close();
      const toolResult = await callTool(codexTool, "fabric_run_status_read", { runId: run.run_id });
      expect(toolResult.isError).toBe(false);
      const resource = await codexResource.readResource({ uri: `fabric://runs/${run.run_id}/status` });
      expect(resource.contents).toHaveLength(1);
    } finally {
      await Promise.allSettled(clients.map(async (client) => client.close()));
    }
  });
});

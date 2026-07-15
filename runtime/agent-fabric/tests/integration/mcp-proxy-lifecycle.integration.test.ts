import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

import { createDaemonFixture } from "../support/daemon-testkit.ts";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const mcpMain = fileURLToPath(new URL("../../src/mcp/main.ts", import.meta.url));

describe("MCP proxy lifecycle", () => {
  it("initializes without Fabric surfaces when the configured seat is not provisioned", async () => {
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
      await expect(client.listTools()).resolves.toEqual({ tools: [] });
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

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createDaemonFixture } from "../support/daemon-testkit.ts";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const mcpMain = fileURLToPath(new URL("../../src/mcp/main.ts", import.meta.url));

describe("MCP proxy lifecycle", () => {
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

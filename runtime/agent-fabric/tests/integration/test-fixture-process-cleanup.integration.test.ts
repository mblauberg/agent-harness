import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { startFabricDaemon } from "../../src/index.ts";
import { createMcpFixture } from "../support/mcp-testkit.ts";

const HARNESS_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe.sequential("agent-fabric test fixture cleanup", () => {
  it("rolls back daemon and proxy processes when MCP fixture construction fails", async () => {
    let daemonPid: number | undefined;
    let proxyPid: number | undefined;

    await expect(createMcpFixture(
      "run-mcp-partial-cleanup",
      { chair: "cleanup-chair", peer: "cleanup-peer" },
      {
        chairProxyStarted(input) {
          daemonPid = input.daemonPid;
          proxyPid = input.proxyPid;
          throw new Error("injected fixture construction failure");
        },
      },
    )).rejects.toThrow("injected fixture construction failure");

    expect(daemonPid).toBeTypeOf("number");
    expect(proxyPid).toBeTypeOf("number");
    if (daemonPid === undefined || proxyPid === undefined) {
      throw new Error("fixture failure hook did not capture child process IDs");
    }
    expect(processExists(daemonPid)).toBe(false);
    expect(processExists(proxyPid)).toBe(false);
  });

  it("starts the source daemon when its caller cwd is the harness root", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-daemon-cwd-"));
    const originalCwd = process.cwd();
    let daemon: Awaited<ReturnType<typeof startFabricDaemon>> | undefined;
    try {
      process.chdir(HARNESS_ROOT);
      daemon = await startFabricDaemon({
        databasePath: join(directory, "state", "fabric.sqlite3"),
        stateDirectory: join(directory, "state"),
        runtimeDirectory: join(directory, "runtime"),
        socketPath: join(directory, "runtime", "fabric.sock"),
      });
      expect(daemon.pid).toBeGreaterThan(0);
    } finally {
      process.chdir(originalCwd);
      await daemon?.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

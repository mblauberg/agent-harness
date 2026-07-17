import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { fabricDoctor, fabricStatus } from "../../src/cli/status.ts";
import type { FabricPaths } from "../../src/cli/paths.ts";
import { openFabric, startFabricDaemon } from "../../src/index.ts";
import { createPortableActivatedPrimaryFixture } from "../support/primary-adapter-testkit.ts";

const cleanup: string[] = [];
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function paths(): Promise<FabricPaths> {
  const root = await mkdtemp(join(tmpdir(), "fabric-status-"));
  cleanup.push(root);
  const stateDirectory = join(root, "state");
  const runtimeDirectory = join(stateDirectory, "runtime");
  const databasePath = join(stateDirectory, "fabric-v1.sqlite3");
  await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
  const fabric = await openFabric({ databasePath, workspaceRoots: [root] });
  await fabric.close();
  return { stateDirectory, runtimeDirectory, databasePath, socketPath: join(runtimeDirectory, "fabric-v1.sock") };
}

describe("machine status and doctor", () => {
  it("reports configured adapters, exact roots and secret-free seat metadata", async () => {
    const value = await paths();
    const agentsHome = resolve(import.meta.dirname, "../../../..");
    const status = await fabricStatus(["--agents-home", agentsHome, "--project", agentsHome], value);
    expect(status).toMatchObject({
      schemaVersion: 1,
      daemon: { reachable: false, protocolVersion: 1 },
      configuredAdapters: ["claude-agent-sdk", "codex-app-server", "agy", "cursor-agent"],
      activeAdapters: [],
      project: { path: agentsHome },
    });
    expect(JSON.stringify(status)).not.toMatch(/capability|credentialPath|afb_|afc_/u);
  });

  it("returns typed checks and fails only the unavailable daemon in an isolated state root", async () => {
    const value = await paths();
    const fixture = await createPortableActivatedPrimaryFixture();
    cleanup.push(fixture.directory);
    const result = await fabricDoctor([
      "--agents-home", fixture.directory,
      "--trusted-config", fixture.configPath,
      "--compatibility", fixture.compatibilityPath,
      "--compatibility-schema", fixture.schemaPath,
    ], value);
    expect(result).toMatchObject({ schemaVersion: 1, healthy: false });
    const checks = result.checks as Array<{ id: string; status: string }>;
    expect(checks.find((item) => item.id === "configuration")?.status).toBe("pass");
    expect(checks.find((item) => item.id === "adapter-compatibility")?.status).toBe("pass");
    expect(checks.find((item) => item.id === "database-integrity")?.status).toBe("pass");
    expect(checks.find((item) => item.id === "daemon-socket")?.status).toBe("fail");
  });

  it("does not call a live unrelated PID plus stale socket metadata reachable", async () => {
    const value = await paths();
    await writeFile(join(value.runtimeDirectory, "fabric-v1.discovery.json"), `${JSON.stringify({
      schemaVersion: 1,
      socketPath: value.socketPath,
      pid: process.pid,
      bootstrapCapability: `afb_${"A".repeat(43)}`,
      lifecycleReceiptAuthorityId: null,
    })}\n`, { mode: 0o600 });
    const agentsHome = resolve(import.meta.dirname, "../../../..");
    await expect(fabricStatus(["--agents-home", agentsHome, "--project", agentsHome], value)).resolves.toMatchObject({
      daemon: { reachable: false }, activeAdapters: [],
    });
  });

  it("reports adapters loaded by the live daemon rather than a changed config file", async () => {
    const value = await paths();
    const daemon = await startFabricDaemon({
      ...value,
      workspaceRoots: [value.stateDirectory],
      adapters: { "live-only": { command: [process.execPath, "-e", "process.exit(0)"], environment: {} } },
    });
    try {
      await writeFile(join(value.runtimeDirectory, "fabric-v1.discovery.json"), `${JSON.stringify({
        schemaVersion: 1, socketPath: value.socketPath, pid: daemon.pid,
        bootstrapCapability: daemon.bootstrapCapability, lifecycleReceiptAuthorityId: null,
      })}\n`, { mode: 0o600 });
      const agentsHome = resolve(import.meta.dirname, "../../../..");
      await expect(fabricStatus(["--agents-home", agentsHome, "--project", agentsHome], value)).resolves.toMatchObject({
        daemon: { reachable: true, activeAdapters: ["live-only"] },
        configuredAdapters: ["claude-agent-sdk", "codex-app-server", "agy", "cursor-agent"],
        activeAdapters: ["live-only"],
      });
    } finally { await daemon.stop(); }
  });
});

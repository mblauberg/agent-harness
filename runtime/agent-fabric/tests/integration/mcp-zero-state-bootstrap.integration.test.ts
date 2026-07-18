import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { Fabric } from "../../src/core/fabric.ts";
import { bootstrapMcpSeat } from "../../src/cli/mcp-bootstrap.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe("zero-state MCP bootstrap", () => {
  it("rejects an untrusted exact root before daemon discovery", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "fabric-untrusted-bootstrap-"));
    roots.push(temporaryRoot);
    const root = await realpath(temporaryRoot);
    const stateDirectory = join(root, "state");
    await expect(bootstrapMcpSeat({
      environment: { AGENT_FABRIC_SEAT: "codex" },
      cwd: root,
      paths: {
        stateDirectory,
        runtimeDirectory: join(root, "runtime"),
        databasePath: join(stateDirectory, "fabric-v1.sqlite3"),
        socketPath: join(root, "runtime", "fabric-v1.sock"),
      },
    })).rejects.toMatchObject({ code: "WORKSPACE_NOT_TRUSTED" });
  });

  it("creates one deterministic scoping run and converges a second primary into its peer seat", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "fabric-zero-state-"));
    roots.push(temporaryRoot);
    const root = await realpath(temporaryRoot);
    const databasePath = join(root, "fabric.sqlite3");
    const now = Date.parse("2026-07-18T00:00:00.000Z");
    const fabric = new Fabric({ databasePath, workspaceRoots: [root], clock: () => now });
    const base = {
      canonicalRoot: root,
      trustRecordDigest: `sha256:${"a".repeat(64)}`,
      expiresAt: "2026-07-19T00:00:00.000Z",
    } as const;

    const first = fabric.bootstrapCurrentMcpSeat({ ...base, seat: "codex" });
    const replay = fabric.bootstrapCurrentMcpSeat({ ...base, seat: "codex" });
    const second = fabric.bootstrapCurrentMcpSeat({ ...base, seat: "claude" });

    expect(replay).toEqual(first);
    expect(first.credentials).toHaveLength(1);
    expect(second.credentials.map(({ seat }) => seat).sort()).toEqual(["claude", "codex"]);
    expect(second.runId).toBe(first.runId);
    expect(second.chairAgentId).toBe(first.chairAgentId);
    expect(second.expectedPreviousGeneration).toBe(first.generation);

    const database = new Database(databasePath, { readonly: true });
    try {
      expect(database.prepare("SELECT count(*) AS count FROM projects").get()).toEqual({ count: 1 });
      expect(database.prepare("SELECT count(*) AS count FROM project_sessions").get()).toEqual({ count: 1 });
      expect(database.prepare("SELECT count(*) AS count FROM runs").get()).toEqual({ count: 1 });
      expect(database.prepare("SELECT count(*) AS count FROM agents").get()).toEqual({ count: 2 });
      expect(database.prepare("SELECT count(*) AS count FROM mcp_active_seat_generations").get()).toEqual({ count: 1 });
    } finally {
      database.close();
      await fabric.close();
    }
  });
});

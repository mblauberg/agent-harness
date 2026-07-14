import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { openFabric } from "../../../src/index.ts";
import { FABRIC_OPERATIONS } from "../../../src/domain/operations.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";
import { TEST_AUTHORITY_V2_FIELDS } from "../../support/authority-v2-testkit.ts";

describe("Stage 1 authority algebra", () => {
  it("preserves a canonical delegated path when its filesystem target changes before restart", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "fabric-authority-restart-"));
    const databasePath = join(workspaceRoot, "fabric.sqlite3");
    await Promise.all([
      mkdir(join(workspaceRoot, "src")),
      mkdir(join(workspaceRoot, "secret")),
    ]);
    const rootAuthority = {
      ...TEST_AUTHORITY_V2_FIELDS,
      workspaceRoots: ["."],
      sourcePaths: ["."],
      artifactPaths: ["."],
      actions: [
        FABRIC_OPERATIONS.delegateAuthority,
        FABRIC_OPERATIONS.registerAgent,
        FABRIC_OPERATIONS.acquireWriteLease,
      ],
      disclosure: { level: "scoped", scopes: ["local"] } as const,
      expiresAt: "2099-01-01T00:00:00.000Z",
      budget: { turns: 2 },
    };
    let fabric = await openFabric({ databasePath, workspaceRoots: [workspaceRoot] });
    try {
      const run = await createCurrentSessionRun({
        databasePath,
        workspaceRoot,
        runId: "canonical-path-restart",
        chair: { agentId: "chair", authority: rootAuthority },
      });
      const chair = fabric.connect(run.chairCapability);
      const childAuthority = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: {
          ...rootAuthority,
          sourcePaths: ["src"],
          artifactPaths: ["src"],
          actions: [FABRIC_OPERATIONS.acquireWriteLease],
          budget: { turns: 1 },
        },
      });
      const child = await chair.registerAgent({ agentId: "child", authorityId: childAuthority.authorityId });
      await fabric.close();
      await rm(join(workspaceRoot, "src"), { recursive: true });
      await symlink(join(workspaceRoot, "secret"), join(workspaceRoot, "src"));

      fabric = await openFabric({ databasePath, workspaceRoots: [workspaceRoot] });
      await expect(fabric.connect(child.capability).acquireWriteLease({
        scope: ["src/new"],
        ttlMs: 1_000,
        commandId: "canonical-path-restart:lease",
      })).rejects.toMatchObject({ code: "AUTHORITY_WIDENING" });
    } finally {
      await fabric.close().catch(() => undefined);
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("does not upgrade a non-current stored authority shape on reopen", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "fabric-legacy-authority-restart-"));
    const databasePath = join(workspaceRoot, "fabric.sqlite3");
    await Promise.all([
      mkdir(join(workspaceRoot, "src")),
      mkdir(join(workspaceRoot, "secret")),
    ]);
    const rootAuthority = {
      ...TEST_AUTHORITY_V2_FIELDS,
      workspaceRoots: ["."],
      sourcePaths: ["."],
      artifactPaths: ["."],
      actions: [
        FABRIC_OPERATIONS.delegateAuthority,
        FABRIC_OPERATIONS.registerAgent,
        FABRIC_OPERATIONS.acquireWriteLease,
      ],
      disclosure: { level: "scoped", scopes: ["local"] } as const,
      expiresAt: "2099-01-01T00:00:00.000Z",
      budget: { turns: 2 },
    };
    let fabric = await openFabric({ databasePath, workspaceRoots: [workspaceRoot] });
    try {
      const run = await createCurrentSessionRun({
        databasePath,
        workspaceRoot,
        runId: "legacy-path-restart",
        chair: { agentId: "chair", authority: rootAuthority },
      });
      const chair = fabric.connect(run.chairCapability);
      const childAuthority = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: {
          ...rootAuthority,
          sourcePaths: ["src"],
          artifactPaths: ["src"],
          actions: [FABRIC_OPERATIONS.acquireWriteLease],
          budget: { turns: 1 },
        },
      });
      const child = await chair.registerAgent({ agentId: "child", authorityId: childAuthority.authorityId });
      await fabric.close();

      const database = new Database(databasePath);
      const row = database.prepare("SELECT authority_json FROM authorities WHERE authority_id = ?")
        .get(childAuthority.authorityId) as { authority_json: string };
      const stored = JSON.parse(row.authority_json) as Record<string, unknown>;
      delete stored.deniedPaths;
      delete stored.deniedActions;
      stored.disclosure = ["local"];
      database.prepare("UPDATE authorities SET authority_json = ? WHERE authority_id = ?")
        .run(JSON.stringify(stored), childAuthority.authorityId);
      database.close();

      await rm(join(workspaceRoot, "src"), { recursive: true });
      await symlink(join(workspaceRoot, "secret"), join(workspaceRoot, "src"));
      fabric = await openFabric({ databasePath, workspaceRoots: [workspaceRoot] });
      await expect(fabric.connect(child.capability).acquireWriteLease({
        scope: ["src/new"],
        ttlMs: 1_000,
        commandId: "legacy-path-restart:lease",
      })).rejects.toThrow(/stored authority is invalid/u);
    } finally {
      await fabric.close().catch(() => undefined);
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("reopens a run whose persisted workspace root is contained by a broader configured root", async () => {
    const configuredRoot = await mkdtemp(join(tmpdir(), "fabric-contained-root-restart-"));
    const projectRoot = join(configuredRoot, "project");
    const databasePath = join(configuredRoot, "fabric.sqlite3");
    await mkdir(projectRoot);
    const authority = {
      ...TEST_AUTHORITY_V2_FIELDS,
      workspaceRoots: ["."],
      sourcePaths: ["."],
      artifactPaths: ["."],
      actions: [FABRIC_OPERATIONS.getRunStatus],
      disclosure: { level: "scoped", scopes: ["local"] } as const,
      expiresAt: "2099-01-01T00:00:00.000Z",
      budget: {},
    };
    let fabric = await openFabric({ databasePath, workspaceRoots: [configuredRoot] });
    try {
      const run = await createCurrentSessionRun({
        databasePath,
        workspaceRoot: projectRoot,
        runId: "contained-root-restart",
        chair: { agentId: "chair", authority },
      });
      await fabric.close();

      fabric = await openFabric({ databasePath, workspaceRoots: [configuredRoot] });
      await expect(fabric.connect(run.chairCapability).getRunStatus({ runId: run.runId }))
        .resolves.toMatchObject({ runId: "contained-root-restart" });
    } finally {
      await fabric.close().catch(() => undefined);
      await rm(configuredRoot, { recursive: true, force: true });
    }
  });

  it("rejects absolute authority paths even inside a configured workspace root", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "fabric-authority-root-"));
    const runDirectory = join(workspaceRoot, ".agent-run", "absolute-paths");
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    const fabric = await openFabric({
      databasePath: join(workspaceRoot, "fabric.sqlite3"),
      workspaceRoots: [workspaceRoot],
    });
    try {
      await expect(createCurrentSessionRun({
        databasePath: join(workspaceRoot, "fabric.sqlite3"),
        workspaceRoot,
        runId: "absolute-paths",
        projectRunDirectory: runDirectory,
        chair: {
          agentId: "chair",
          authority: {
            ...TEST_AUTHORITY_V2_FIELDS,
            workspaceRoots: [workspaceRoot],
            sourcePaths: [join(workspaceRoot, "src")],
            artifactPaths: [runDirectory],
            actions: [FABRIC_OPERATIONS.getRunStatus],
            disclosure: { level: "scoped", scopes: ["local"] } as const,
            expiresAt: "2027-07-10T00:00:00.000Z",
            budget: { turns: 1 },
          },
        },
      })).rejects.toMatchObject({ code: "AUTHORITY_WIDENING" });
    } finally {
      await fabric.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("rejects legacy unqualified cost budget keys", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "fabric-authority-budget-"));
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    const fabric = await openFabric({
      databasePath: join(workspaceRoot, "fabric.sqlite3"),
      workspaceRoots: [workspaceRoot],
    });
    try {
      await expect(createCurrentSessionRun({
        databasePath: join(workspaceRoot, "fabric.sqlite3"),
        workspaceRoot,
        runId: "legacy-budget-key",
        chair: {
          agentId: "chair",
          authority: {
            ...TEST_AUTHORITY_V2_FIELDS,
            workspaceRoots: ["."],
            sourcePaths: ["src"],
            artifactPaths: [".agent-run"],
            actions: [FABRIC_OPERATIONS.getRunStatus],
            disclosure: { level: "forbidden" },
            expiresAt: "2027-07-10T00:00:00.000Z",
            budget: { costUsd: 1 },
          },
        },
      })).rejects.toMatchObject({ code: "AUTHORITY_WIDENING" });
    } finally {
      await fabric.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

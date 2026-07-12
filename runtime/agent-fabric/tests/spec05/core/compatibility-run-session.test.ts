import Database from "better-sqlite3";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import { ROOT_AUTHORITY } from "../../support/stage1-fixture.ts";

describe("schema-v4 compatibility run creation", () => {
  it("preserves a legacy empty budget as three scopes with no configured dimensions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-v4-empty-budget-"));
    const databasePath = join(directory, "fabric.sqlite3");
    try {
      const fabric = await openFabric({ databasePath, workspaceRoots: [directory] });
      await fabric.createRun({
        runId: "run-v4-empty-budget",
        chair: {
          agentId: "chair",
          authority: { ...ROOT_AUTHORITY, budget: {} },
        },
      });
      await fabric.close();

      const database = new Database(databasePath, { readonly: true });
      try {
        expect(database.prepare(`
          SELECT scope_kind, count(*) AS count
            FROM resource_scopes GROUP BY scope_kind ORDER BY scope_kind
        `).all()).toEqual([
          { scope_kind: "coordination-run", count: 1 },
          { scope_kind: "project", count: 1 },
          { scope_kind: "project-session", count: 1 },
        ]);
        expect(database.prepare("SELECT count(*) AS count FROM resource_dimensions").get())
          .toEqual({ count: 0 });
      } finally {
        database.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists an independent recovery session before its legacy facade run without inventing an operator", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-v4-run-"));
    const databasePath = join(directory, "fabric.sqlite3");
    try {
      const fabric = await openFabric({ databasePath, workspaceRoots: [directory] });
      const input = {
        runId: "run-v4-compatibility",
        chair: { agentId: "chair", authority: ROOT_AUTHORITY },
      };
      const created = await fabric.createRun(input);
      expect(await fabric.createRun(input)).toEqual(created);
      await fabric.close();

      const database = new Database(databasePath, { readonly: true });
      try {
        const persisted = database.prepare(`
          SELECT p.canonical_root, s.mode, s.state AS session_state, s.origin_kind,
                 s.origin_operator_id, s.migration_manifest_ref, r.lifecycle_state,
                 r.revision, r.chair_generation, r.chair_lease_id, r.dependency_revision,
                 r.topology_slot, l.holder_agent_id, l.generation AS lease_generation,
                 l.status AS lease_status
            FROM runs r
            JOIN project_sessions s ON s.project_session_id=r.project_session_id
            JOIN projects p ON p.project_id=s.project_id
            JOIN run_chair_leases l ON l.project_session_id=r.project_session_id
                                    AND l.run_id=r.run_id
                                    AND l.generation=r.chair_generation
           WHERE r.run_id=?
        `).get(input.runId);
        expect(persisted).toMatchObject({
          canonical_root: realpathSync(directory),
          mode: "independent",
          session_state: "recovery_required",
          origin_kind: "legacy-migration",
          origin_operator_id: null,
          lifecycle_state: "recovery_required",
          revision: 1,
          chair_generation: 1,
          chair_lease_id: `chair:${input.runId}:1`,
          dependency_revision: 1,
          topology_slot: null,
          holder_agent_id: "chair",
          lease_generation: 1,
          lease_status: "frozen",
        });
        expect(JSON.parse((persisted as { migration_manifest_ref: string }).migration_manifest_ref)).toMatchObject({
          path: `.agent-run/migrations/0004/${input.runId}-manifest.json`,
        });
        expect(database.prepare("SELECT count(*) AS count FROM operator_principals").get()).toEqual({ count: 0 });
        expect(database.prepare(`
          SELECT member_kind, member_id, required, state
            FROM project_session_memberships
           WHERE coordination_run_id=?
        `).all(input.runId)).toEqual([
          {
            member_kind: "coordination-run",
            member_id: input.runId,
            required: 1,
            state: "active",
          },
          {
            member_kind: "lease",
            member_id: `chair:${input.runId}:1`,
            required: 1,
            state: "active",
          },
        ]);
        expect(database.prepare(`
          SELECT scope_kind, count(*) AS count
            FROM resource_scopes
           WHERE project_id=(SELECT project_id FROM project_sessions WHERE project_session_id=(SELECT project_session_id FROM runs WHERE run_id=?))
           GROUP BY scope_kind ORDER BY scope_kind
        `).all(input.runId)).toEqual([
          { scope_kind: "coordination-run", count: 1 },
          { scope_kind: "project", count: 1 },
          { scope_kind: "project-session", count: 1 },
        ]);
      } finally {
        database.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reuses one project resource root for multiple independent compatibility sessions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-v4-project-"));
    const databasePath = join(directory, "fabric.sqlite3");
    try {
      const fabric = await openFabric({ databasePath, workspaceRoots: [directory] });
      await fabric.createRun({
        runId: "run-v4-independent-a",
        chair: { agentId: "chair-a", authority: ROOT_AUTHORITY },
      });
      await fabric.createRun({
        runId: "run-v4-independent-b",
        chair: { agentId: "chair-b", authority: ROOT_AUTHORITY },
      });
      await fabric.close();

      const database = new Database(databasePath, { readonly: true });
      try {
        expect(database.prepare("SELECT count(*) AS count FROM projects").get()).toEqual({ count: 1 });
        expect(database.prepare("SELECT count(*) AS count FROM project_sessions").get()).toEqual({ count: 2 });
        expect(database.prepare(`
          SELECT scope_kind, count(*) AS count
            FROM resource_scopes GROUP BY scope_kind ORDER BY scope_kind
        `).all()).toEqual([
          { scope_kind: "coordination-run", count: 2 },
          { scope_kind: "project", count: 1 },
          { scope_kind: "project-session", count: 2 },
        ]);
      } finally {
        database.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations, type Migration } from "../../../src/core/migrations.ts";
import { preflightProjectSessionOperations } from "../../../src/persistence/project-session-preflight.ts";

const databases: Database.Database[] = [];
const directories: string[] = [];

function migration(version: number, filename: string, preflight?: Migration["preflight"]): Migration {
  return {
    version,
    name: filename.replace(/^[0-9]+-/u, "").replace(/\.sql$/u, ""),
    sql: readFileSync(new URL(`../../../migrations/${filename}`, import.meta.url), "utf8"),
    ...(preflight === undefined ? {} : { preflight }),
  };
}

function migrations(): Migration[] {
  return [
    migration(1, "0001-core.sql"),
    migration(2, "0002-observer-event-sequence.sql"),
    migration(3, "0003-integrity-and-query-plans.sql"),
    migration(4, "0004-project-session-operations.sql", preflightProjectSessionOperations),
  ];
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("project-session migration 0004", () => {
  it("backfills a deterministic recovery-required independent session without fabricating legacy approval", () => {
    const root = mkdtempSync(join(tmpdir(), "afab-0004-root-"));
    directories.push(root);
    const database = new Database(":memory:");
    databases.push(database);
    const firstThree = migrations().slice(0, 3);
    applyMigrations(database, firstThree);
    database.prepare(`
      INSERT INTO runs(run_id, chair_agent_id, workspace_root, project_run_directory, created_at)
      VALUES ('run-legacy', 'chair', ?, NULL, 1)
    `).run(root);
    database.exec(`
      INSERT INTO authorities(authority_id, run_id, parent_authority_id, authority_json, authority_hash, created_at)
      VALUES ('authority-root', 'run-legacy', NULL, '{}', '${"a".repeat(64)}', 1);
      INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, provider_session_ref, lifecycle)
      VALUES ('run-legacy', 'chair', NULL, 'authority-root', NULL, 'ready');
      INSERT INTO authority_budget(authority_id, unit_key, granted, reserved, consumed, usage_unknown)
      VALUES ('authority-root', 'provider_calls', 10, 2, 3, 0);
      INSERT INTO tasks(run_id, task_id, authority_id, objective, base_revision, state, owner_agent_id, revision, owner_lease_generation, created_by)
      VALUES ('run-legacy', 'task-a', 'authority-root', 'Legacy task', 'base', 'ready', NULL, 1, 0, 'chair');
      INSERT INTO task_human_gates(run_id, task_id, gate_id, status, evidence)
      VALUES ('run-legacy', 'task-a', 'legacy-approval', 'approved', 'unattested prose');
    `);

    expect(applyMigrations(database, migrations())).toEqual({ applied: [4], currentVersion: 4 });
    const session = database.prepare(`
      SELECT mode, state, origin_kind, origin_operator_id, project_session_id
      FROM project_sessions
    `).get() as Record<string, unknown>;
    expect(session).toMatchObject({
      mode: "independent",
      state: "recovery_required",
      origin_kind: "legacy-migration",
      origin_operator_id: null,
    });
    expect(session.project_session_id).toMatch(/^psl_[0-9a-f]{32}$/u);
    expect(database.prepare("SELECT lifecycle_state FROM runs WHERE run_id='run-legacy'").get()).toEqual({
      lifecycle_state: "recovery_required",
    });
    expect(database.prepare("SELECT trust_record_digest FROM projects").get()).toEqual({ trust_record_digest: null });
    expect(database.prepare("SELECT status, resolved_by_operator_id, legacy_status FROM scoped_gates").get()).toEqual({
      status: "pending",
      resolved_by_operator_id: null,
      legacy_status: "approved",
    });
    expect(database.prepare("PRAGMA foreign_key_check").get()).toBeUndefined();
  });

  it("invalidates the operator snapshot for every table read by v2 projections", () => {
    const root = mkdtempSync(join(tmpdir(), "afab-0004-snapshot-root-"));
    directories.push(root);
    const database = new Database(":memory:");
    databases.push(database);
    applyMigrations(database, migrations().slice(0, 3));
    database.prepare(`
      INSERT INTO runs(run_id, chair_agent_id, workspace_root, project_run_directory, created_at)
      VALUES ('run-snapshot', 'chair', ?, NULL, 1)
    `).run(root);
    database.exec(`
      INSERT INTO authorities(authority_id, run_id, parent_authority_id, authority_json, authority_hash, created_at)
      VALUES ('authority-snapshot', 'run-snapshot', NULL, '{}', '${"a".repeat(64)}', 1);
      INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, provider_session_ref, lifecycle)
      VALUES ('run-snapshot', 'chair', NULL, 'authority-snapshot', NULL, 'ready');
    `);
    applyMigrations(database, migrations());

    const snapshotTables = [
      "projects",
      "project_sessions",
      "runs",
      "tasks",
      "leases",
      "provider_actions",
      "operator_client_attachments",
      "agents",
      "provider_state",
      "agent_adapter_bindings",
      "artifacts",
      "events",
      "observer_event_sequence",
      "messages",
      "message_contexts",
      "attention_items",
      "resource_scopes",
      "resource_dimensions",
      "integration_availability",
      "task_objective_checks",
      "workstreams",
      "cross_family_review_evidence",
      "intakes",
    ] as const;
    for (const table of snapshotTables) {
      for (const operation of ["insert", "update", "delete"] as const) {
        expect(database.prepare(`
          SELECT name FROM sqlite_master
          WHERE type='trigger' AND tbl_name=? AND name=?
            AND sql LIKE '%UPDATE daemon_global_state%'
        `).get(table, `global_revision_${table}_${operation}`), `${table} ${operation}`).toBeDefined();
      }
    }

    const before = database.prepare("SELECT revision FROM daemon_global_state WHERE singleton=1").get() as { revision: number };
    database.prepare("UPDATE projects SET updated_at=updated_at+1").run();
    database.prepare("UPDATE agents SET lifecycle='suspended' WHERE run_id='run-snapshot' AND agent_id='chair'").run();
    expect(database.prepare("SELECT revision FROM daemon_global_state WHERE singleton=1").get()).toEqual({
      revision: before.revision + 2,
    });
  });
});

describe("launch-custody migration 0005", () => {
  it("adds immutable custody and enforces daemon-global provider action identity", () => {
    const database = new Database(":memory:");
    databases.push(database);

    expect(applyMigrations(database)).toEqual({ applied: [1, 2, 3, 4, 5, 6, 7], currentVersion: 7 });
    expect(database.prepare(`
      SELECT name FROM sqlite_master
       WHERE type='table' AND name='project_session_launch_custody'
    `).get()).toEqual({ name: "project_session_launch_custody" });
    expect(database.prepare(`
      SELECT name FROM sqlite_master
       WHERE type='trigger' AND name='launch_custody_immutable_update'
    `).get()).toEqual({ name: "launch_custody_immutable_update" });
    expect(database.prepare(`
      SELECT name FROM sqlite_master
       WHERE type='trigger' AND name='launch_custody_immutable_delete'
    `).get()).toEqual({ name: "launch_custody_immutable_delete" });

    const insertAction = database.prepare(`
      INSERT INTO provider_actions(
        run_id, action_id, adapter_id, operation, target_agent_id,
        provider_session_generation, turn_lease_generation, identity_hash,
        payload_hash, payload_json, status, history_json, execution_count,
        effect_count, idempotency_proven, updated_at
      ) VALUES (?, 'shared-action', 'shared-adapter', 'spawn', NULL, NULL, NULL,
                ?, ?, '{}', 'prepared', '["prepared"]', 0, 0, 0, 1)
    `);
    insertAction.run("run-one", "identity-one", "payload-one");
    expect(() => insertAction.run("run-two", "identity-two", "payload-two"))
      .toThrow(/UNIQUE constraint failed: provider_actions\.adapter_id, provider_actions\.action_id/u);
  });

  it("fails migration before mutation when legacy rows reuse an adapter/action pair across runs", () => {
    const database = new Database(":memory:");
    databases.push(database);
    applyMigrations(database, migrations());
    const insertAction = database.prepare(`
      INSERT INTO provider_actions(
        run_id, action_id, adapter_id, operation, target_agent_id,
        provider_session_generation, turn_lease_generation, identity_hash,
        payload_hash, payload_json, status, history_json, execution_count,
        effect_count, idempotency_proven, updated_at
      ) VALUES (?, 'duplicate-action', 'duplicate-adapter', 'spawn', NULL, NULL, NULL,
                ?, ?, '{}', 'prepared', '["prepared"]', 0, 0, 0, 1)
    `);
    insertAction.run("run-one", "identity-one", "payload-one");
    insertAction.run("run-two", "identity-two", "payload-two");

    expect(() => applyMigrations(database)).toThrowError(
      expect.objectContaining({ code: "LAUNCH_CUSTODY_MIGRATION_PREFLIGHT_FAILED" }),
    );
    expect(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version=5").get())
      .toEqual({ count: 0 });
  });
});

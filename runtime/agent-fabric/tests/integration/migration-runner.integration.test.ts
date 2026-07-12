import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/core/migrations.ts";

const openDatabases: Database.Database[] = [];

function openDatabase(): Database.Database {
  const database = new Database(":memory:");
  openDatabases.push(database);
  return database;
}

afterEach(() => {
  for (const database of openDatabases.splice(0)) database.close();
});

describe("current schema baseline", () => {
  it("initialises exactly one current baseline and treats a second application as a no-op", () => {
    const database = openDatabase();

    expect(applyMigrations(database)).toEqual({ applied: [1], currentVersion: 1 });
    expect(applyMigrations(database)).toEqual({ applied: [], currentVersion: 1 });
    expect(database.prepare(`
      SELECT epoch, length(baseline_sha256) AS baseline_length,
             length(catalog_sha256) AS catalog_length
        FROM fabric_schema
    `).get()).toEqual({
      epoch: "agent-fabric-pre-release-v1",
      baseline_length: 64,
      catalog_length: 64,
    });
    for (const table of [
      "lifecycle_checkpoints",
      "teams",
      "projects",
      "project_sessions",
      "project_session_launch_custody",
      "operator_effect_custody",
      "launched_chair_bridge_retirements",
      "operator_commands",
      "scoped_gates",
      "resource_reservations",
      "task_requests",
      "attention_items",
      "daemon_runtime_epochs",
      "workstreams",
      "chair_live_handoff_custody",
    ]) {
      expect(database.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      ).get(table)).toEqual({ name: table });
    }
  });

  it("contains only the current operator-launched session and scoped-gate model", () => {
    const database = openDatabase();
    applyMigrations(database);

    expect(database.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'task_human_gates'",
    ).get()).toBeUndefined();

    const columns = (table: string): string[] => database.prepare(
      `SELECT name FROM pragma_table_info(?) ORDER BY cid`,
    ).all(table).map((row) => (row as { name: string }).name);
    expect(columns("project_sessions")).not.toContain("migration_manifest_ref");
    expect(columns("scoped_gates")).not.toContain("legacy_status");
    expect(columns("scoped_gates")).not.toContain("legacy_evidence");

    const projectSessionSql = database.prepare(
      "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'project_sessions'",
    ).pluck().get() as string;
    expect(projectSessionSql).toContain("origin_kind='operator-launch'");
    expect(projectSessionSql).not.toContain("legacy-migration");

    const artifactSql = database.prepare(
      "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'artifacts'",
    ).pluck().get() as string;
    expect(artifactSql).not.toContain("'migration'");
  });

  it("installs the closed typed-Git variants and single-owner lease constraints", () => {
    const database = openDatabase();
    applyMigrations(database);

    expect(() => database.prepare(`
      INSERT INTO run_git_allowlist_variants(
        project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch,operation_variant
      ) VALUES ('session_x','run_x',1,1,'branch-delete-force')
    `).run()).toThrow(/operation_variant|CHECK constraint/iu);

    database.exec(`
      INSERT INTO projects(project_id,canonical_root,revision,authority_generation,created_at,updated_at)
      VALUES ('project_01','/project/one',1,1,1,1);
      INSERT INTO project_sessions(
        project_session_id,project_id,mode,state,revision,generation,authority_ref,budget_ref,
        launch_packet_path,launch_packet_digest,membership_revision,origin_kind,origin_operator_id,
        created_at,updated_at
      ) VALUES (
        'session_01','project_01','coordinated','active',1,1,'authority-session','budget-session',
        'launch.json','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        1,'operator-launch','operator_01',1,1
      );
      INSERT INTO runs(
        run_id,chair_agent_id,workspace_root,project_run_directory,project_run_directory_basis,
        created_at,project_session_id,lifecycle_state,revision,chair_generation,chair_lease_id,
        authority_ref,budget_ref,dependency_revision,topology_slot
      ) VALUES (
        'run_01','chair_01','/project/one','.agent-run/current','project-relative',1,
        'session_01','active',1,1,'chair:run_01:1','authority-run','budget-run',1,1
      );
      INSERT INTO authorities(authority_id,run_id,authority_json,authority_hash,created_at)
      VALUES ('authority_01','run_01','{}','authority-hash',1);
      INSERT INTO agents(run_id,agent_id,authority_id,provider_session_ref,lifecycle)
      VALUES ('run_01','chair_01','authority_01','provider-chair','ready');
      INSERT INTO leases(lease_id,run_id,kind,holder_agent_id,generation,status,expires_at,updated_at)
      VALUES ('lease_shared','run_01','write','chair_01',1,'active',9999999999999,1);
    `);
    expect(() => database.prepare(`
      INSERT INTO run_chair_leases(
        project_session_id,run_id,lease_id,holder_agent_id,generation,status,updated_at
      ) VALUES ('session_01','run_01','lease_shared','chair_01',1,'active',1)
    `).run()).toThrow(/INVARIANT_lease_identity_single_owner/u);
  });
});

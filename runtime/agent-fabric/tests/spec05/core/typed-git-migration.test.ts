import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../../src/core/migrations.ts";

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function migrated(): Database.Database {
  const database = new Database(":memory:");
  databases.push(database);
  expect(applyMigrations(database).currentVersion).toBe(12);
  return database;
}

describe("typed Git custody migration 0012", () => {
  it("installs immutable authority, draft, custody and common-directory owners", () => {
    const database = migrated();
    for (const table of [
      "run_authority_revisions",
      "git_execution_profiles",
      "git_remote_registrations",
      "operator_git_grants",
      "operator_git_grant_variants",
      "operator_git_grant_remotes",
      "operator_git_grant_refs",
      "operator_git_grant_paths",
      "git_operation_drafts",
      "git_mutation_reservations",
      "operator_git_effect_bindings",
      "git_custody_resolutions",
    ]) {
      expect(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)).toEqual({ name: table });
    }
    expect(database.prepare("PRAGMA table_info(runs)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "authority_revision", notnull: 1 }),
      expect.objectContaining({ name: "git_allowlist_epoch", notnull: 1 }),
      expect.objectContaining({ name: "git_allowlist_digest" }),
    ]));
  });

  it("rejects two live reservations for one canonical common directory", () => {
    const database = migrated();
    database.pragma("foreign_keys = OFF");
    const insert = database.prepare(`
      INSERT INTO git_mutation_reservations(
        custody_id,generation,project_id,project_session_id,coordination_run_id,
        git_common_dir,common_dir_identity_digest,lock_plan_digest,state,
        owner_instance_id,created_at,updated_at
      ) VALUES (?,1,'project_01','session_01','run_01','/repo/.git',?,?,?,'daemon_01',1,1)
    `);
    const digest = `sha256:${"a".repeat(64)}`;
    insert.run("custody_01", digest, digest, "reserved");
    expect(() => insert.run("custody_02", digest, digest, "ambiguous")).toThrowError(/UNIQUE/iu);
  });

  it("widens canonical custody and admission states for the atomic four-owner map", () => {
    const database = migrated();
    const custodySql = database.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='operator_effect_custody'",
    ).get() as { sql: string };
    const admissionSql = database.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='operation_admissions'",
    ).get() as { sql: string };
    expect(custodySql.sql).toMatch(/'conflict'.*'quarantined'/su);
    expect(admissionSql.sql).toMatch(/'conflict'.*'ambiguous'.*'quarantined'/su);
  });
});

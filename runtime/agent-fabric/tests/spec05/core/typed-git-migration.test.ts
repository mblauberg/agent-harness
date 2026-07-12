import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../../src/core/migrations.ts";
import { preflightTypedGitCustody } from "../../../src/persistence/typed-git-preflight.ts";

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function migrated(): Database.Database {
  const database = new Database(":memory:");
  databases.push(database);
  expect(applyMigrations(database).currentVersion).toBe(13);
  return database;
}

describe("typed Git custody migration 0012", () => {
  it("installs immutable authority, draft, custody and common-directory owners", () => {
    const database = migrated();
    for (const table of [
      "run_authority_revisions",
      "git_execution_profiles",
      "git_remote_registrations",
      "run_git_allowlists",
      "run_git_allowlist_variants",
      "run_git_allowlist_profiles",
      "run_git_allowlist_remotes",
      "run_git_allowlist_refs",
      "run_git_allowlist_paths",
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

  it("preserves registered and promotion external-effect guards after the 0012 rebuild", () => {
    const database = migrated();
    database.pragma("foreign_keys = OFF");
    const digest = `sha256:${"a".repeat(64)}`;
    database.prepare(`
      INSERT INTO operator_effect_custody(
        custody_id,operator_id,project_id,project_session_id,principal_generation,command_id,operation,
        intent_digest,before_state_digest,intent_json,state,created_at,updated_at
      ) VALUES('external_parent','operator_01','project_01','session_01',1,'command_01','external-effect',
        ?,?,?,'prepared',1,1)
    `).run(digest, digest, JSON.stringify({
      kind: "registered-external-effect",
      integrationId: "integration_01",
      expectedIntegrationGeneration: 1,
      operationId: "effect_01",
      contractDigest: digest,
      targetId: "target_01",
      expectedTargetRevision: 1,
      requestArtifactRef: { path: "effect.json", digest },
      idempotencyKey: "idempotency_01",
    }));
    const insert = database.prepare(`
      INSERT INTO operator_external_effect_bindings(
        custody_id,effect_kind,integration_id,integration_generation,operation_id,contract_digest,
        target_id,target_revision,request_artifact_path,request_artifact_digest,idempotency_key,
        release_gate_id,release_gate_revision,release_binding_digest,lookup_generation,
        lookup_evidence_digest,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    expect(() => insert.run(
      "external_parent", "registered-external-effect", "wrong_integration", 1, "effect_01", digest,
      "target_01", 1, "effect.json", digest, "idempotency_01", null, null, null, 0, null, 1,
    )).toThrowError(/INVARIANT_external_effect_intent_binding/iu);
    expect(() => insert.run(
      "external_parent", "registered-external-effect", "integration_01", 1, "effect_01", digest,
      "target_01", 1, "effect.json", digest, "idempotency_01", "gate_01", 1, digest, 0, null, 1,
    )).toThrowError(/INVARIANT_external_effect_intent_binding|CHECK constraint failed/iu);
    expect(() => insert.run(
      "external_parent", "registered-external-effect", "integration_01", 1, "effect_01", "not-a-digest",
      "target_01", 1, "effect.json", digest, "idempotency_01", null, null, null, 0, null, 1,
    )).toThrowError(/INVARIANT_external_effect_intent_binding|CHECK constraint failed/iu);
  });

  it("fails closed instead of inferring legacy coarse Git custody", () => {
    const database = migrated();
    database.pragma("foreign_keys = OFF");
    const digest = `sha256:${"a".repeat(64)}`;
    database.prepare(`
      INSERT INTO operator_effect_custody(
        custody_id,operator_id,project_id,project_session_id,principal_generation,command_id,operation,
        intent_digest,before_state_digest,intent_json,state,created_at,updated_at
      ) VALUES('legacy_git','operator_legacy','project_legacy','session_legacy',1,'command_legacy','git',
        ?,?,'{"kind":"git","operation":{"effect":"push"}}','prepared',1,1)
    `).run(digest, digest);
    expect(() => preflightTypedGitCustody(database)).toThrow(/legacy Git custody cannot be inferred/iu);
  });
});

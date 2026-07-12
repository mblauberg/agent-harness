import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../../src/core/migrations.ts";
import { preflightArtifactRegistry } from "../../../src/persistence/artifact-registry-preflight.ts";

const databases: Database.Database[] = [];
const directories: string[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function legacyAcceptedFixture(candidateCount: number): Database.Database {
  const createdRoot = mkdtempSync(join(tmpdir(), "artifact-registry-preflight-"));
  directories.push(createdRoot);
  const root = realpathSync.native(createdRoot);
  mkdirSync(join(root, ".run"));
  const database = new Database(":memory:");
  databases.push(database);
  database.exec(`
    CREATE TABLE projects(project_id TEXT PRIMARY KEY, canonical_root TEXT NOT NULL);
    CREATE TABLE project_sessions(project_session_id TEXT PRIMARY KEY, project_id TEXT NOT NULL);
    CREATE TABLE runs(
      run_id TEXT PRIMARY KEY,
      project_session_id TEXT NOT NULL,
      project_run_directory TEXT
    );
    CREATE TABLE artifacts(
      artifact_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      task_id TEXT,
      publisher_agent_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE receipt_exports(
      run_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      exported_at INTEGER NOT NULL
    );
    CREATE TABLE intakes(
      intake_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_session_id TEXT,
      coordination_run_id TEXT
    );
    CREATE TABLE intake_revisions(
      intake_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      state TEXT NOT NULL,
      PRIMARY KEY(intake_id, revision)
    );
    CREATE TABLE intake_artifact_bindings(
      intake_id TEXT NOT NULL,
      intake_revision INTEGER NOT NULL,
      relative_path TEXT NOT NULL,
      sha256 TEXT NOT NULL
    );
  `);
  database.prepare("INSERT INTO projects(project_id,canonical_root) VALUES ('project_01',?)").run(root);
  database.exec(`
    INSERT INTO project_sessions(project_session_id,project_id) VALUES ('session_01','project_01');
    INSERT INTO runs(run_id,project_session_id,project_run_directory)
      VALUES ('run_01','session_01','.run');
    INSERT INTO intakes(intake_id,project_id,project_session_id,coordination_run_id)
      VALUES ('intake_01','project_01','session_01','run_01');
    INSERT INTO intake_revisions(intake_id,revision,state) VALUES ('intake_01',1,'accepted');
    INSERT INTO intake_artifact_bindings(intake_id,intake_revision,relative_path,sha256)
      VALUES ('intake_01',1,'docs/spec.md','${"a".repeat(64)}');
  `);
  const insert = database.prepare(`
    INSERT INTO artifacts(
      artifact_id,run_id,task_id,publisher_agent_id,relative_path,sha256,created_at
    ) VALUES (?, 'run_01', NULL, 'chair_01', 'docs/spec.md', ?, 1)
  `);
  for (let index = 0; index < candidateCount; index += 1) {
    insert.run(`legacy_artifact_${String(index + 1)}`, "a".repeat(64));
  }
  return database;
}

describe("artifact registry migration 0010", () => {
  it("installs the canonical registry, accepted-scope binding and run-root basis", () => {
    const database = new Database(":memory:");
    databases.push(database);

    expect(applyMigrations(database)).toEqual({
      applied: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      currentVersion: 11,
    });

    const artifactColumns = database.prepare("PRAGMA table_info(artifacts)").all() as Array<{ name: string }>;
    expect(artifactColumns.map(({ name }) => name)).toEqual(expect.arrayContaining([
      "artifact_id",
      "project_id",
      "project_session_id",
      "run_id",
      "task_id",
      "publisher_kind",
      "publisher_ref",
      "publisher_agent_id",
      "source_kind",
      "evidence_kind",
      "relative_path",
      "sha256",
      "registry_state",
      "quarantine_reason",
      "revision",
      "created_at",
    ]));
    expect(database.prepare("PRAGMA table_info(runs)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "project_run_directory_basis", notnull: 1 }),
    ]));
    for (const table of ["intakes", "intake_revisions"] as const) {
      expect(database.prepare(`PRAGMA table_info(${table})`).all()).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "accepted_scope_artifact_id" }),
        expect.objectContaining({ name: "accepted_scope_state", notnull: 1 }),
      ]));
    }
  });

  it("invalidates Console snapshots for notification delivery transitions", () => {
    const database = new Database(":memory:");
    databases.push(database);
    applyMigrations(database);

    for (const operation of ["insert", "update", "delete"] as const) {
      expect(database.prepare(`
        SELECT name FROM sqlite_master
         WHERE type='trigger' AND tbl_name='notification_deliveries'
           AND name=? AND sql LIKE '%UPDATE daemon_global_state%'
      `).get(`global_revision_notification_deliveries_${operation}`)).toBeDefined();
      expect(database.prepare(`
        SELECT name FROM sqlite_master
         WHERE type='trigger' AND tbl_name='integration_availability'
           AND name=? AND sql LIKE '%UPDATE daemon_global_state%'
      `).get(`global_revision_integration_availability_${operation}`)).toBeDefined();
    }

    database.pragma("foreign_keys = OFF");
    const revision = (): number => (database.prepare(
      "SELECT revision FROM daemon_global_state WHERE singleton=1",
    ).get() as { revision: number }).revision;
    let expected = revision();
    database.prepare(`
      INSERT INTO notification_deliveries(
        notification_id, item_id, item_revision, target_integration, dedupe_key,
        state, claim_generation, updated_at
      ) VALUES ('notification_01','attention_01',1,'native-desktop','dedupe_01','pending',0,1)
    `).run();
    expect(revision()).toBe(++expected);
    database.prepare(
      "UPDATE notification_deliveries SET state='claimed', claim_generation=1 WHERE notification_id='notification_01'",
    ).run();
    expect(revision()).toBe(++expected);
    database.prepare("DELETE FROM notification_deliveries WHERE notification_id='notification_01'").run();
    expect(revision()).toBe(++expected);

    database.prepare(`
      INSERT INTO integration_availability(integration_id,state,discovered_contract_json,checked_at)
      VALUES ('native-desktop','available','{}',1)
    `).run();
    expect(revision()).toBe(++expected);
    database.prepare(
      "UPDATE integration_availability SET state='stale', checked_at=2 WHERE integration_id='native-desktop'",
    ).run();
    expect(revision()).toBe(++expected);
    database.prepare("DELETE FROM integration_availability WHERE integration_id='native-desktop'").run();
    expect(revision()).toBe(++expected);
  });

  it.each([
    [0, "recovery-required"],
    [1, "bound"],
    [2, "recovery-required"],
  ] as const)(
    "stages %i legacy accepted-scope candidates as %s without guessing",
    (candidateCount, expectedState) => {
      const database = legacyAcceptedFixture(candidateCount);
      preflightArtifactRegistry(database);
      expect(database.prepare(`
        SELECT accepted_scope_state FROM migration_0010_intake_scopes
         WHERE intake_id='intake_01' AND intake_revision=1
      `).get()).toEqual({ accepted_scope_state: expectedState });
      const active = database.prepare(`
        SELECT COUNT(*) AS count FROM migration_0010_artifacts
         WHERE relative_path='docs/spec.md' AND registry_state='active'
      `).get() as { count: number };
      expect(active.count).toBe(candidateCount === 1 ? 1 : 0);
      expect(database.prepare(`
        SELECT COUNT(*) AS count FROM migration_0010_intake_bindings
         WHERE intake_id='intake_01' AND intake_revision=1
      `).get()).toEqual({ count: 1 });
    },
  );

  it("quarantines legacy sensitive paths instead of projecting credential files", () => {
    const database = legacyAcceptedFixture(1);
    database.prepare("UPDATE artifacts SET relative_path='.env'").run();
    database.prepare("UPDATE intake_artifact_bindings SET relative_path='.env'").run();
    preflightArtifactRegistry(database);
    expect(database.prepare(`
      SELECT registry_state, quarantine_reason FROM migration_0010_artifacts
       WHERE artifact_id='legacy_artifact_1'
    `).get()).toMatchObject({
      registry_state: "quarantined",
      quarantine_reason: expect.stringContaining("sensitive-path"),
    });
    expect(database.prepare(`
      SELECT accepted_scope_state FROM migration_0010_intake_scopes
       WHERE intake_id='intake_01' AND intake_revision=1
    `).get()).toEqual({ accepted_scope_state: "recovery-required" });
  });
});

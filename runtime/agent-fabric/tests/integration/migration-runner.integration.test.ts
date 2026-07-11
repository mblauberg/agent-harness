import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  applyMigrations,
  type Migration,
  MigrationError,
} from "../../src/core/migrations.ts";

const openDatabases: Database.Database[] = [];

function openDatabase(): Database.Database {
  const database = new Database(":memory:");
  openDatabases.push(database);
  return database;
}

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    database.close();
  }
});

describe("ordered migration runner", () => {
  it("orders migrations, records checksums, and applies each migration only once", () => {
    const database = openDatabase();
    const migrations: Migration[] = [
      {
        version: 2,
        name: "seed-widget",
        sql: "INSERT INTO widgets(name) VALUES ('first');",
      },
      {
        version: 1,
        name: "create-widgets",
        sql: "CREATE TABLE widgets (name TEXT NOT NULL);",
      },
    ];

    expect(applyMigrations(database, migrations)).toEqual({ applied: [1, 2], currentVersion: 2 });
    expect(applyMigrations(database, migrations)).toEqual({ applied: [], currentVersion: 2 });
    expect(database.prepare("SELECT name FROM widgets").all()).toEqual([{ name: "first" }]);
    expect(
      database.prepare("SELECT version, name, length(checksum) AS checksum_length FROM schema_migrations ORDER BY version").all(),
    ).toEqual([
      { version: 1, name: "create-widgets", checksum_length: 64 },
      { version: 2, name: "seed-widget", checksum_length: 64 },
    ]);
  });

  it("rolls back a failed migration without recording or retaining its partial schema", () => {
    const database = openDatabase();
    const migrations: Migration[] = [
      { version: 1, name: "create-stable", sql: "CREATE TABLE stable (id INTEGER PRIMARY KEY);" },
      {
        version: 2,
        name: "fail-after-ddl",
        sql: "CREATE TABLE rolled_back (id INTEGER PRIMARY KEY); INSERT INTO missing_table VALUES (1);",
      },
    ];

    expect(() => applyMigrations(database, migrations)).toThrow();
    expect(database.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([{ version: 1 }]);
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rolled_back'").get(),
    ).toBeUndefined();
  });

  it("refuses checksum drift for an already-applied migration", () => {
    const database = openDatabase();
    applyMigrations(database, [{ version: 1, name: "initial", sql: "CREATE TABLE item (id INTEGER);" }]);

    expect(() =>
      applyMigrations(database, [{ version: 1, name: "initial", sql: "CREATE TABLE changed (id INTEGER);" }]),
    ).toThrowError(expect.objectContaining<Partial<MigrationError>>({ code: "MIGRATION_CHECKSUM_DRIFT" }));
  });

  it("refuses a missing checksum once the checksum-aware registry exists", () => {
    const database = openDatabase();
    const migrations: Migration[] = [
      { version: 1, name: "initial", sql: "CREATE TABLE item (id INTEGER);" },
    ];
    applyMigrations(database, migrations);
    database.prepare("UPDATE schema_migrations SET checksum = NULL WHERE version = 1").run();

    expect(() => applyMigrations(database, migrations)).toThrowError(
      expect.objectContaining<Partial<MigrationError>>({ code: "MIGRATION_INVALID_SET" }),
    );
  });

  it("rejects the unreleased legacy version-only registry after the canonical squash", () => {
    const database = openDatabase();
    database.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations(version, applied_at) VALUES (1, '2026-01-01T00:00:00.000Z');
      CREATE TABLE item (id INTEGER);
    `);
    const migrations: Migration[] = [
      { version: 1, name: "initial", sql: "CREATE TABLE item (id INTEGER);" },
    ];

    expect(() => applyMigrations(database, migrations)).toThrowError(
      expect.objectContaining<Partial<MigrationError>>({ code: "MIGRATION_INVALID_SET" }),
    );
  });

  it("refuses a database created by a newer migration set", () => {
    const database = openDatabase();
    const migrations: Migration[] = [
      { version: 1, name: "initial", sql: "CREATE TABLE item (id INTEGER);" },
    ];
    applyMigrations(database, migrations);
    database
      .prepare("INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)")
      .run(99, "future", "f".repeat(64), "2099-01-01T00:00:00.000Z");

    expect(() => applyMigrations(database, migrations)).toThrowError(
      expect.objectContaining<Partial<MigrationError>>({ code: "MIGRATION_FUTURE_VERSION" }),
    );
  });

  it("applies the checked-in migrations and treats a second run as a no-op", () => {
    const database = openDatabase();

    expect(applyMigrations(database)).toEqual({ applied: [1, 2, 3, 4, 5, 6, 7, 8], currentVersion: 8 });
    expect(applyMigrations(database)).toEqual({ applied: [], currentVersion: 8 });
    expect(database.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
    ]);
    for (const table of [
      "lifecycle_checkpoints",
      "teams",
      "agent_adapter_bindings",
      "projects",
      "project_sessions",
      "project_session_launch_custody",
      "operator_control_fences",
      "operator_lifecycle_receipts",
      "operator_effect_custody",
      "operator_daemon_stop_custody",
      "task_obligation_bindings",
      "provider_agent_custody",
      "agent_bridge_state",
      "child_bridge_losses",
      "operator_external_effect_bindings",
      "operator_commands",
      "scoped_gates",
      "resource_reservations",
      "task_requests",
      "attention_items",
      "daemon_runtime_epochs",
    ]) {
      expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toEqual({
        name: table,
      });
    }
    expect(
      database
        .prepare("PRAGMA table_info(deliveries)")
        .all()
        .map((column) => (column as { name: string }).name),
    ).toEqual(expect.arrayContaining(["resolution_reason", "resolved_at"]));
  });
});

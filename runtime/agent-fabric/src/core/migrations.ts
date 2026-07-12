import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import type Database from "better-sqlite3";

import { preflightAdditiveInvariants } from "../persistence/invariants.js";
import { preflightLaunchCustody } from "../persistence/launch-custody-preflight.js";
import { preflightProjectSessionOperations } from "../persistence/project-session-preflight.js";
import { preflightProviderBridgeCustody } from "../persistence/provider-bridge-custody-preflight.js";
import { preflightExternalEffectCustody } from "../persistence/external-effect-custody-preflight.js";
import { preflightLaunchedChairBridgeLoss } from "../persistence/launched-chair-bridge-loss-preflight.js";
import { preflightArtifactRegistry } from "../persistence/artifact-registry-preflight.js";

export type Migration = {
  version: number;
  name: string;
  sql: string;
  preflight?: (database: Database.Database) => void;
};

export type MigrationErrorCode =
  | "MIGRATION_CHECKSUM_DRIFT"
  | "MIGRATION_FUTURE_VERSION"
  | "MIGRATION_INVALID_SET";

export class MigrationError extends Error {
  readonly code: MigrationErrorCode;

  constructor(code: MigrationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "MigrationError";
    this.code = code;
  }
}

type MigrationRow = {
  version: number;
  name: string | null;
  checksum: string | null;
};

const defaultMigrationFiles = [
  "0001-core.sql",
  "0002-observer-event-sequence.sql",
  "0003-integrity-and-query-plans.sql",
  "0004-project-session-operations.sql",
  "0005-launch-custody.sql",
  "0006-operator-lifecycle.sql",
  "0007-provider-bridge-custody.sql",
  "0008-external-effect-custody.sql",
  "0009-launched-chair-bridge-loss.sql",
  "0010-artifact-registry.sql",
  "0011-automatic-session-membership.sql",
] as const;

function loadDefaultMigrations(): Migration[] {
  return defaultMigrationFiles.map((filename, index) => {
    const candidates = [
      new URL(`../../migrations/${filename}`, import.meta.url),
      new URL(`../../../migrations/${filename}`, import.meta.url),
    ];
    const migrationUrl = candidates.find((candidate) => existsSync(candidate));
    if (migrationUrl === undefined) {
      throw new MigrationError("MIGRATION_INVALID_SET", `migration ${filename} is unavailable`);
    }
    return {
      version: index + 1,
      name: filename.replace(/^[0-9]+-/u, "").replace(/\.sql$/u, ""),
      sql: readFileSync(migrationUrl, "utf8"),
      ...(index === 2
        ? { preflight: preflightAdditiveInvariants }
        : index === 3
          ? { preflight: preflightProjectSessionOperations }
          : index === 4
            ? { preflight: preflightLaunchCustody }
            : index === 6
              ? { preflight: preflightProviderBridgeCustody }
              : index === 7
                ? { preflight: preflightExternalEffectCustody }
                : index === 8
                  ? { preflight: preflightLaunchedChairBridgeLoss }
                  : index === 9
                    ? { preflight: preflightArtifactRegistry }
            : {}),
    };
  });
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function orderedMigrations(migrations: readonly Migration[]): Migration[] {
  const ordered = [...migrations].sort((left, right) => left.version - right.version);
  for (const [index, migration] of ordered.entries()) {
    const expectedVersion = index + 1;
    if (
      migration.version !== expectedVersion ||
      migration.name.length === 0 ||
      migration.sql.trim().length === 0
    ) {
      throw new MigrationError(
        "MIGRATION_INVALID_SET",
        `migration set must contain one non-empty migration for every version from 1; expected ${expectedVersion}`,
      );
    }
  }
  return ordered;
}

function ensureRegistry(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT,
      checksum TEXT,
      applied_at TEXT NOT NULL
    )
  `);
  const columns = database.prepare("PRAGMA table_info(schema_migrations)").all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));
  if (!["version", "name", "checksum", "applied_at"].every((name) => names.has(name))) {
    throw new MigrationError("MIGRATION_INVALID_SET", "migration registry predates the canonical checksum baseline");
  }
}

function splitConnectionPragmas(sql: string): { pragmas: string; body: string } {
  let body = sql;
  const pragmas: string[] = [];
  const leadingPragma = /^\s*(PRAGMA\s+[^;]+;)/iu;
  while (true) {
    const match = leadingPragma.exec(body);
    if (match?.[1] === undefined) break;
    pragmas.push(match[1]);
    body = body.slice(match[0].length);
  }
  return { pragmas: pragmas.join("\n"), body };
}

function registryRows(database: Database.Database): MigrationRow[] {
  return database
    .prepare("SELECT version, name, checksum FROM schema_migrations ORDER BY version")
    .all() as MigrationRow[];
}

export function applyMigrations(
  database: Database.Database,
  migrations: readonly Migration[] = loadDefaultMigrations(),
): { applied: number[]; currentVersion: number } {
  const ordered = orderedMigrations(migrations);
  ensureRegistry(database);

  const rows = registryRows(database);
  const maximumKnownVersion = ordered.length;
  const future = rows.find((row) => row.version > maximumKnownVersion);
  if (future !== undefined) {
    throw new MigrationError(
      "MIGRATION_FUTURE_VERSION",
      `database schema version ${future.version} is newer than supported version ${maximumKnownVersion}`,
    );
  }

  const byVersion = new Map(ordered.map((migration) => [migration.version, migration]));
  for (const row of rows) {
    const migration = byVersion.get(row.version);
    if (migration === undefined) {
      throw new MigrationError("MIGRATION_INVALID_SET", `database contains unknown migration version ${row.version}`);
    }
    const expectedChecksum = checksum(migration.sql);
    if (row.checksum === null) {
      throw new MigrationError(
        "MIGRATION_INVALID_SET",
        `migration ${row.version} (${migration.name}) has no recorded checksum`,
      );
    }
    if (row.checksum !== null && row.checksum !== expectedChecksum) {
      throw new MigrationError(
        "MIGRATION_CHECKSUM_DRIFT",
        `migration ${row.version} (${migration.name}) no longer matches its recorded checksum`,
      );
    }
  }

  const appliedVersions = new Set(rows.map((row) => row.version));
  for (let version = 1; version <= appliedVersions.size; version += 1) {
    if (!appliedVersions.has(version)) {
      throw new MigrationError("MIGRATION_INVALID_SET", `database migration registry has a gap at version ${version}`);
    }
  }

  const applied: number[] = [];
  for (const migration of ordered) {
    if (appliedVersions.has(migration.version)) continue;
    const { pragmas, body } = splitConnectionPragmas(migration.sql);
    if (pragmas.length > 0) database.exec(pragmas);
    const applyOne = database.transaction(() => {
      migration.preflight?.(database);
      database.exec(body);
      database
        .prepare(`
          INSERT INTO schema_migrations(version, name, checksum, applied_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(version) DO UPDATE SET name = excluded.name, checksum = excluded.checksum
        `)
        .run(migration.version, migration.name, checksum(migration.sql), new Date().toISOString());
    });
    applyOne();
    appliedVersions.add(migration.version);
    applied.push(migration.version);
  }

  return { applied, currentVersion: ordered.length };
}

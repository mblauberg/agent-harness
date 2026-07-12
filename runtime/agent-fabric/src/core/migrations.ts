import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";

import type Database from "better-sqlite3";
import BetterSqlite3 from "better-sqlite3";

export const FABRIC_SCHEMA_EPOCH = "agent-fabric-pre-release-v1" as const;

type CurrentSchemaManifest = Readonly<{
  schemaVersion: 1;
  epoch: typeof FABRIC_SCHEMA_EPOCH;
  baselineFile: "0001-current-baseline.sql";
  baselineSha256: string;
  catalogSha256: string;
  objectCount: number;
}>;

type SchemaArtifacts = Readonly<{
  manifest: CurrentSchemaManifest;
  sql: string;
}>;

type FabricSchemaRow = Readonly<{
  epoch: string;
  baseline_sha256: string;
  catalog_sha256: string;
}>;

type CatalogRow = Readonly<{
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}>;

export type SchemaBaselineErrorCode =
  | "SCHEMA_BASELINE_INVALID"
  | "SCHEMA_CUTOVER_REQUIRED";

export class SchemaBaselineError extends Error {
  readonly code: SchemaBaselineErrorCode;
  readonly preserved: boolean;

  constructor(
    code: SchemaBaselineErrorCode,
    message: string,
    options?: Readonly<{ cause?: unknown; preserved?: boolean }>,
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SchemaBaselineError";
    this.code = code;
    this.preserved = options?.preserved ?? false;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function artifactUrl(directory: "migrations" | "schemas", filename: string): URL {
  const candidates = [
    new URL(`../../${directory}/${filename}`, import.meta.url),
    new URL(`../../../${directory}/${filename}`, import.meta.url),
  ];
  const selected = candidates.find((candidate) => existsSync(candidate));
  if (selected === undefined) {
    throw new SchemaBaselineError(
      "SCHEMA_BASELINE_INVALID",
      `current schema artifact is unavailable: ${directory}/${filename}`,
    );
  }
  return selected;
}

function parseManifest(value: unknown): CurrentSchemaManifest {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new SchemaBaselineError("SCHEMA_BASELINE_INVALID", "current schema manifest is not an object");
  }
  const manifest = value as Record<string, unknown>;
  const keys = Object.keys(manifest).sort();
  const expected = [
    "baselineFile",
    "baselineSha256",
    "catalogSha256",
    "epoch",
    "objectCount",
    "schemaVersion",
  ];
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index]) ||
    manifest.schemaVersion !== 1 ||
    manifest.epoch !== FABRIC_SCHEMA_EPOCH ||
    manifest.baselineFile !== "0001-current-baseline.sql" ||
    typeof manifest.baselineSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(manifest.baselineSha256) ||
    typeof manifest.catalogSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(manifest.catalogSha256) ||
    typeof manifest.objectCount !== "number" ||
    !Number.isSafeInteger(manifest.objectCount) ||
    manifest.objectCount < 1
  ) {
    throw new SchemaBaselineError("SCHEMA_BASELINE_INVALID", "current schema manifest is invalid");
  }
  return {
    schemaVersion: 1,
    epoch: FABRIC_SCHEMA_EPOCH,
    baselineFile: "0001-current-baseline.sql",
    baselineSha256: manifest.baselineSha256,
    catalogSha256: manifest.catalogSha256,
    objectCount: manifest.objectCount,
  };
}

function loadSchemaArtifacts(): SchemaArtifacts {
  const manifestValue: unknown = JSON.parse(
    readFileSync(artifactUrl("schemas", "database-baseline.v1.json"), "utf8"),
  );
  const manifest = parseManifest(manifestValue);
  const sql = readFileSync(artifactUrl("migrations", manifest.baselineFile), "utf8");
  if (sha256(sql) !== manifest.baselineSha256) {
    throw new SchemaBaselineError(
      "SCHEMA_BASELINE_INVALID",
      "current schema baseline does not match its pinned manifest",
    );
  }
  return { manifest, sql };
}

function catalogRows(database: Database.Database): CatalogRow[] {
  return database.prepare(`
    SELECT type,name,tbl_name,sql
      FROM sqlite_schema
     WHERE name NOT LIKE 'sqlite_%'
     ORDER BY type,name,tbl_name
  `).all() as CatalogRow[];
}

export function currentSchemaCatalogFingerprint(database: Database.Database): string {
  const canonical = JSON.stringify(
    catalogRows(database).map((row) => [row.type, row.name, row.tbl_name, row.sql]),
  );
  return sha256(canonical);
}

function cutover(message: string, cause?: unknown): SchemaBaselineError {
  return new SchemaBaselineError(
    "SCHEMA_CUTOVER_REQUIRED",
    `${message}; existing database preserved`,
    { ...(cause === undefined ? {} : { cause }), preserved: true },
  );
}

function currentSchemaRow(database: Database.Database): FabricSchemaRow {
  let rows: FabricSchemaRow[];
  try {
    rows = database.prepare(`
      SELECT epoch,baseline_sha256,catalog_sha256 FROM fabric_schema
    `).all() as FabricSchemaRow[];
  } catch (error: unknown) {
    throw cutover("database does not contain the current schema epoch", error);
  }
  if (rows.length !== 1 || rows[0] === undefined) {
    throw cutover("database schema epoch metadata is missing or ambiguous");
  }
  return rows[0];
}

export function assertCurrentSchema(database: Database.Database): void {
  const { manifest } = loadSchemaArtifacts();
  const row = currentSchemaRow(database);
  if (
    row.epoch !== manifest.epoch ||
    row.baseline_sha256 !== manifest.baselineSha256 ||
    row.catalog_sha256 !== manifest.catalogSha256
  ) {
    throw cutover("database schema epoch does not match this runtime");
  }
  const rows = catalogRows(database);
  if (
    rows.length !== manifest.objectCount ||
    currentSchemaCatalogFingerprint(database) !== manifest.catalogSha256
  ) {
    throw cutover("database schema catalog fingerprint does not match this runtime");
  }
}

function userSchemaObjectCount(database: Database.Database): number {
  const value = database.prepare(`
    SELECT COUNT(*) AS count FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'
  `).get() as { count: number };
  return value.count;
}

function isolatedDatabaseImage(databasePath: string): Buffer {
  const image = Buffer.from(readFileSync(databasePath));
  const sqliteHeader = Buffer.from("SQLite format 3\0", "ascii");
  if (image.length >= 20 && image.subarray(0, sqliteHeader.length).equals(sqliteHeader)) {
    // A WAL-mode main file cannot be deserialised as an anonymous database.
    // The isolated copy contains the checkpointed main image, so normalise
    // only its in-memory read/write version bytes to rollback-journal format.
    image[18] = 1;
    image[19] = 1;
  }
  return image;
}

/**
 * Initialises only a genuinely empty database connection. Existing current
 * state is verified; every other epoch is rejected without repair or backfill.
 */
export function applyMigrations(
  database: Database.Database,
): { applied: number[]; currentVersion: 1 } {
  if (userSchemaObjectCount(database) > 0) {
    assertCurrentSchema(database);
    return { applied: [], currentVersion: 1 };
  }
  const { manifest, sql } = loadSchemaArtifacts();
  database.pragma("foreign_keys = ON");
  const apply = database.transaction(() => {
    database.exec(sql);
    const rows = catalogRows(database);
    const catalogSha256 = currentSchemaCatalogFingerprint(database);
    if (rows.length !== manifest.objectCount || catalogSha256 !== manifest.catalogSha256) {
      throw new SchemaBaselineError(
        "SCHEMA_BASELINE_INVALID",
        "current schema baseline produced an unexpected catalog fingerprint",
      );
    }
    database.prepare(`
      INSERT INTO fabric_schema(singleton,epoch,baseline_sha256,catalog_sha256)
      VALUES (1,?,?,?)
    `).run(manifest.epoch, manifest.baselineSha256, catalogSha256);
  });
  apply();
  assertCurrentSchema(database);
  return { applied: [1], currentVersion: 1 };
}

export type FabricDatabaseInspection = Readonly<{
  state: "absent" | "current";
}>;

/** Read-only compatibility gate used before any daemon/runtime mutation. */
export function inspectFabricDatabase(databasePath: string): FabricDatabaseInspection {
  let before;
  try {
    before = lstatSync(databasePath);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { state: "absent" };
    }
    throw error;
  }
  if (!before.isFile() || before.isSymbolicLink()) {
    throw cutover("database path is not a regular non-symlink file");
  }
  let database: Database.Database | undefined;
  try {
    // SQLite may create WAL/SHM sidecars even for a readonly file handle. Load
    // an isolated in-memory image so compatibility inspection has no writable
    // relationship with the caller's path.
    database = new BetterSqlite3(isolatedDatabaseImage(databasePath));
    database.pragma("trusted_schema = OFF");
    assertCurrentSchema(database);
  } catch (error: unknown) {
    if (error instanceof SchemaBaselineError) throw error;
    throw cutover("database format or schema fingerprint is not current", error);
  } finally {
    database?.close();
  }
  const after = lstatSync(databasePath);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    before.ctimeMs !== after.ctimeMs
  ) {
    throw cutover("database identity changed during read-only schema inspection");
  }
  return { state: "current" };
}

import { closeSync, existsSync, lstatSync, openSync, unlinkSync } from "node:fs";

import type Database from "better-sqlite3";

export type PersistenceInvariantErrorCode =
  | "PERSISTENCE_INVARIANT_VIOLATION"
  | "PERSISTENCE_QUICK_CHECK_FAILED"
  | "PERSISTENCE_FOREIGN_KEY_CHECK_FAILED"
  | "PERSISTENCE_MARKER_UNSAFE";

export class PersistenceInvariantError extends Error {
  readonly code: PersistenceInvariantErrorCode;

  constructor(code: PersistenceInvariantErrorCode, message: string) {
    super(message);
    this.name = "PersistenceInvariantError";
    this.code = code;
  }
}

export function assertDatabaseIntegrity(database: Database.Database): void {
  const quick = database.prepare("PRAGMA quick_check(1)").get() as Record<string, unknown> | undefined;
  const result = quick === undefined ? undefined : Object.values(quick)[0];
  if (result !== "ok") {
    throw new PersistenceInvariantError("PERSISTENCE_QUICK_CHECK_FAILED", `SQLite quick_check failed: ${String(result)}`);
  }
  const foreignKeyViolation = database.prepare("PRAGMA foreign_key_check").get() as Record<string, unknown> | undefined;
  if (foreignKeyViolation !== undefined) {
    throw new PersistenceInvariantError(
      "PERSISTENCE_FOREIGN_KEY_CHECK_FAILED",
      `SQLite foreign_key_check failed for table ${String(foreignKeyViolation.table ?? "unknown")}`,
    );
  }
}

export function prepareUncleanMarker(databasePath: string): { markerPath: string; wasUnclean: boolean } {
  const markerPath = `${databasePath}.unclean`;
  const wasUnclean = existsSync(markerPath);
  if (wasUnclean) {
    const stat = lstatSync(markerPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new PersistenceInvariantError("PERSISTENCE_MARKER_UNSAFE", `unclean marker is not a regular file: ${markerPath}`);
    }
  } else {
    closeSync(openSync(markerPath, "wx", 0o600));
  }
  return { markerPath, wasUnclean };
}

export function removeUncleanMarker(markerPath: string): void {
  try {
    unlinkSync(markerPath);
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

export function runOpenMaintenance(database: Database.Database): void {
  database.pragma("optimize = 0x10002");
}

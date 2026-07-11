import Database from "better-sqlite3";
import { chmodSync, existsSync } from "node:fs";

import { applyMigrations } from "../core/migrations.js";
import { assertDatabaseIntegrity, prepareUncleanMarker, removeUncleanMarker, runOpenMaintenance } from "./invariants.js";

export function openFabricDatabase(databasePath: string): Database.Database {
  const priorUmask = process.umask(0o077);
  let database: Database.Database | undefined;
  try {
    database = new Database(databasePath);
    chmodSync(databasePath, 0o600);
    database.pragma("journal_mode = WAL");
    database.pragma("synchronous = FULL");
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    database.pragma("trusted_schema = OFF");
    const marker = prepareUncleanMarker(databasePath);
    if (marker.wasUnclean) assertDatabaseIntegrity(database);
    applyMigrations(database);
    runOpenMaintenance(database);
    for (const path of [`${databasePath}-wal`, `${databasePath}-shm`]) {
      if (existsSync(path)) chmodSync(path, 0o600);
    }
    const originalClose = database.close.bind(database);
    database.close = (() => {
      originalClose();
      removeUncleanMarker(marker.markerPath);
    }) as Database.Database["close"];
    return database;
  } catch (error: unknown) {
    database?.close();
    throw error;
  } finally {
    process.umask(priorUmask);
  }
}

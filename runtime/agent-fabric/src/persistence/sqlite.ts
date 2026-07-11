import Database from "better-sqlite3";
import { chmodSync, existsSync } from "node:fs";

import { applyMigrations } from "../core/migrations.js";

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
    applyMigrations(database);
    for (const path of [`${databasePath}-wal`, `${databasePath}-shm`]) {
      if (existsSync(path)) chmodSync(path, 0o600);
    }
    return database;
  } catch (error: unknown) {
    database?.close();
    throw error;
  } finally {
    process.umask(priorUmask);
  }
}

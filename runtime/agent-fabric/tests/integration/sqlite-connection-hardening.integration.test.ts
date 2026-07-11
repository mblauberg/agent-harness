import Database from "better-sqlite3";
import { lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openFabricDatabase } from "../../src/persistence/sqlite.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("SQLite connection hardening", () => {
  it("reapplies connection-local pragmas on every reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-sqlite-"));
    directories.push(directory);
    const path = join(directory, "fabric.sqlite3");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const database = openFabricDatabase(path);
      expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(database.pragma("trusted_schema", { simple: true })).toBe(0);
      expect(database.pragma("busy_timeout", { simple: true })).toBe(5_000);
      expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
      expect((await lstat(path)).mode & 0o777).toBe(0o600);
      for (const sibling of [`${path}-wal`, `${path}-shm`]) {
        await expect(lstat(sibling).then((metadata) => metadata.mode & 0o777)).resolves.toBe(0o600);
      }
      database.close();
      await expect(lstat(`${path}.unclean`)).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("runs bounded integrity checks after an unclean marker", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-sqlite-"));
    directories.push(directory);
    const path = join(directory, "fabric.sqlite3");
    openFabricDatabase(path).close();
    const raw = new Database(path);
    raw.pragma("foreign_keys = OFF");
    raw.prepare("INSERT INTO authorities VALUES ('orphan','missing-run',NULL,'{}','hash',1)").run();
    raw.close();
    await writeFile(`${path}.unclean`, "", { mode: 0o600 });

    expect(() => openFabricDatabase(path)).toThrowError(
      expect.objectContaining({ code: "PERSISTENCE_FOREIGN_KEY_CHECK_FAILED" }),
    );
  });
});

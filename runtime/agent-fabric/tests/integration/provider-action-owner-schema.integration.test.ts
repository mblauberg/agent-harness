import Database from "better-sqlite3";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations, inspectFabricDatabase } from "../../src/core/migrations.ts";
import { openFabricDatabase } from "../../src/persistence/sqlite.ts";

const databases: Database.Database[] = [];
const directories: string[] = [];

function openDatabase(): Database.Database {
  const database = new Database(":memory:");
  databases.push(database);
  applyMigrations(database);
  return database;
}

afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("operator-control provider-action owner binding", () => {
  it("installs one immutable exact-identity binding relation", () => {
    const database = openDatabase();
    const columns = database.prepare(`
      SELECT name FROM pragma_table_info('operator_control_provider_action_bindings') ORDER BY cid
    `).pluck().all();
    expect(columns).toStrictEqual([
      "custody_id",
      "run_id",
      "adapter_id",
      "action_id",
      "source_adapter_id",
      "source_action_id",
      "source_payload_hash",
      "operation",
      "target_agent_id",
      "provider_session_ref",
      "provider_session_generation",
      "turn_lease_generation",
      "turn_id",
      "created_at",
    ]);
    const triggers = new Set(database.prepare(`
      SELECT name FROM sqlite_schema
       WHERE type='trigger' AND tbl_name='operator_control_provider_action_bindings'
    `).pluck().all());
    expect(triggers).toStrictEqual(new Set([
      "operator_control_provider_action_bindings_exact_identity",
      "operator_control_provider_action_bindings_immutable_delete",
      "operator_control_provider_action_bindings_immutable_update",
    ]));
  });

  it("opens a regenerated fresh baseline and rejects the prior fingerprint without changing its bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "provider-owner-cutover-"));
    directories.push(directory);
    const path = join(directory, "fabric.sqlite3");
    openFabricDatabase(path).close();
    expect(inspectFabricDatabase(path)).toEqual({ state: "current" });

    const prior = new Database(path);
    prior.exec(`
      DROP TRIGGER operator_control_provider_action_bindings_exact_identity;
      DROP TRIGGER operator_control_provider_action_bindings_immutable_delete;
      DROP TRIGGER operator_control_provider_action_bindings_immutable_update;
      DROP TABLE operator_control_provider_action_bindings;
    `);
    prior.prepare(`
      UPDATE fabric_schema
         SET baseline_sha256=?,catalog_sha256=?
       WHERE singleton=1
    `).run(
      "dd4d3eb547e13198a27849d19ce272f66d2c318e92b97e359e4424a4652a6a32",
      "7a4baf7cb18b471478cf5b1c84e7162fafcfbc1ae414d8fe38321d81206f5918",
    );
    prior.close();
    const priorShape = new Database(path, { readonly: true });
    expect(priorShape.prepare(`
      SELECT 1 FROM sqlite_schema WHERE name='operator_control_provider_action_bindings'
    `).get()).toBeUndefined();
    priorShape.close();
    const priorNames = await readdir(directory);
    const before = new Map(await Promise.all(priorNames.map(async (name) => [name, await readFile(join(directory, name))] as const)));

    expect(() => inspectFabricDatabase(path)).toThrowError(expect.objectContaining({
      code: "SCHEMA_CUTOVER_REQUIRED",
      preserved: true,
    }));
    expect(await readdir(directory)).toStrictEqual(priorNames);
    for (const [name, bytes] of before) {
      expect((await readFile(join(directory, name))).equals(bytes)).toBe(true);
    }
  });
});

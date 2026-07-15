import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { recoverDaemonRuntimeEpoch } from "../../../src/daemon/global-liveness.ts";
import { openFabricDatabase } from "../../../src/persistence/sqlite.ts";

describe("daemon runtime epoch production schema", () => {
  it("persists starting without claiming an idle-stop observation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-runtime-epoch-schema-"));
    const databasePath = join(directory, "fabric.sqlite3");
    try {
      const database = openFabricDatabase(databasePath);
      try {
        expect(recoverDaemonRuntimeEpoch(database, {
          instanceGeneration: 1,
          instanceId: "daemon_instance_01",
          now: 1_000,
        })).toEqual({
          instanceGeneration: 1,
          recoveredGenerations: [],
          state: "starting",
        });
        expect(database.prepare(`
          SELECT state, observed_global_revision FROM daemon_runtime_epochs
           WHERE instance_generation=1
        `).get()).toEqual({ state: "starting", observed_global_revision: null });
      } finally {
        database.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

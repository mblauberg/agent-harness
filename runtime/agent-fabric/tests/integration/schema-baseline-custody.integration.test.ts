import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  applyMigrations,
  currentSchemaCatalogFingerprint,
} from "../../src/core/migrations.ts";

describe("current schema artifact custody", () => {
  it("pins one baseline, one manifest and no legacy migration preflight modules", async () => {
    expect((await readdir(new URL("../../migrations/", import.meta.url))).sort()).toStrictEqual([
      "0001-current-baseline.sql",
    ]);
    const persistenceFiles = new Set(await readdir(new URL("../../src/persistence/", import.meta.url)));
    for (const legacy of [
      "artifact-registry-preflight.ts",
      "external-effect-custody-preflight.ts",
      "launch-custody-preflight.ts",
      "launched-chair-bridge-loss-preflight.ts",
      "project-session-preflight.ts",
      "provider-bridge-custody-preflight.ts",
      "session-lifecycle-repair-preflight.ts",
      "typed-git-preflight.ts",
    ]) expect(persistenceFiles.has(legacy), legacy).toBe(false);
  });

  it("reproduces the manifest-pinned baseline and catalog fingerprints", async () => {
    const manifest = JSON.parse(await readFile(
      new URL("../../schemas/database-baseline.v1.json", import.meta.url),
      "utf8",
    )) as {
      schemaVersion: number;
      epoch: string;
      baselineFile: string;
      baselineSha256: string;
      catalogSha256: string;
      objectCount: number;
    };
    const baseline = await readFile(new URL(`../../migrations/${manifest.baselineFile}`, import.meta.url), "utf8");
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      epoch: "agent-fabric-pre-release-v1",
      baselineFile: "0001-current-baseline.sql",
    });
    expect(createHash("sha256").update(baseline).digest("hex")).toBe(manifest.baselineSha256);

    const database = new Database(":memory:");
    try {
      applyMigrations(database);
      expect(database.pragma("foreign_key_check")).toStrictEqual([]);
      const objectCount = database.prepare(`
        SELECT COUNT(*) AS count FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'
      `).get() as { count: number };
      expect(objectCount.count).toBe(manifest.objectCount);
      expect(currentSchemaCatalogFingerprint(database)).toBe(manifest.catalogSha256);
    } finally {
      database.close();
    }
  });
});

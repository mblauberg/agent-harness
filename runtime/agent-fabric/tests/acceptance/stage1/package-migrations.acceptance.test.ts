import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).map(async (path) =>
    await rm(path, { recursive: true, force: true }),
  ));
});

describe("packed agent-fabric migration custody", () => {
  it("ships every migration and opens a fresh database from the packed artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-pack-"));
    cleanup.push(root);
    const packageRoot = new URL("../../..", import.meta.url);
    const packed = await execFileAsync(
      "npm",
      ["pack", "--json", "--pack-destination", root],
      { cwd: packageRoot },
    );
    const packResult: unknown = JSON.parse(packed.stdout);
    if (
      !Array.isArray(packResult) ||
      typeof packResult[0] !== "object" ||
      packResult[0] === null ||
      !("filename" in packResult[0]) ||
      typeof packResult[0].filename !== "string"
    ) throw new Error("npm pack result is invalid");
    await execFileAsync("tar", ["-xzf", join(root, packResult[0].filename), "-C", root]);
    const extracted = join(root, "package");
    expect(await readdir(join(extracted, "migrations"))).toStrictEqual([
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
      "0012-typed-git-custody.sql",
      "0013-session-lifecycle-repair.sql",
      "0014-workstreams-live-chair-handoff.sql",
    ]);

    await symlink(new URL("../../../node_modules", import.meta.url), join(extracted, "node_modules"));
    const workspace = join(root, "workspace");
    await mkdir(workspace);
    const databasePath = join(root, "fresh.sqlite3");
    const smoke = `
      import { pathToFileURL } from "node:url";
      const module = await import(pathToFileURL(process.argv[1]).href);
      const fabric = await module.openFabric({
        databasePath: process.argv[2],
        workspaceRoots: [process.argv[3]],
      });
      await fabric.close();
    `;
    await execFileAsync(process.execPath, [
      "--input-type=module",
      "-e",
      smoke,
      join(extracted, "dist", "index.js"),
      databasePath,
      workspace,
    ], { cwd: extracted });
    const database = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      expect(database.prepare(
        "SELECT version FROM schema_migrations ORDER BY version",
      ).all()).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((version) => ({ version })));
    } finally {
      database.close();
    }
  });
});

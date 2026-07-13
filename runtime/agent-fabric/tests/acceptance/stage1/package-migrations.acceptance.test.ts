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

describe("packed agent-fabric schema custody", () => {
  it("ships only the current baseline and opens a fresh database from the packed artifact", async () => {
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
      "0001-current-baseline.sql",
    ]);
    expect(await readdir(join(extracted, "schemas"))).toContain("database-baseline.v1.json");

    await symlink(new URL("../../../../../node_modules", import.meta.url), join(extracted, "node_modules"));
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
        "SELECT epoch FROM fabric_schema",
      ).all()).toStrictEqual([{ epoch: "agent-fabric-pre-release-v1" }]);
    } finally {
      database.close();
    }
  });
});

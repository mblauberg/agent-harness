import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { archiveRun, retentionReport } from "../../src/cli/retention.ts";
import { AUTHORITY_ACTION_VOCABULARY, openFabric } from "../../src/index.ts";
import { createCurrentSessionRun } from "../support/current-session-testkit.ts";

const cleanup: string[] = [];
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function fixture(runId = "run-terminal"): Promise<{ root: string; databasePath: string; runDirectory: string; runId: string }> {
  const root = await mkdtemp(join(tmpdir(), "fabric-retention-"));
  cleanup.push(root);
  const databasePath = join(root, "fabric.sqlite3");
  const runDirectory = join(root, ".agent-run", "run-terminal");
  await mkdir(runDirectory, { recursive: true });
  const fabric = await openFabric({ databasePath, workspaceRoots: [root] });
  try {
    await createCurrentSessionRun({
      databasePath,
      workspaceRoot: root,
      runId,
      projectRunDirectory: runDirectory,
      chair: {
        agentId: "chair",
        authority: {
          workspaceRoots: ["."], sourcePaths: ["."], artifactPaths: [".agent-run"],
          actions: [...AUTHORITY_ACTION_VOCABULARY], disclosure: { level: "scoped", scopes: ["local"] } as const,
          expiresAt: "2099-01-01T00:00:00.000Z", budget: { turns: 10 },
        },
      },
    });
  } finally {
    await fabric.close();
  }
  return { root, databasePath, runDirectory, runId };
}

describe("non-destructive retention operations", () => {
  it("reports active runs without claiming any prune authority", async () => {
    const value = await fixture();
    const report = retentionReport(value.databasePath, "preview");
    expect(report).toMatchObject({
      destructiveActionAvailable: false,
      totals: { active: 1, terminal: 0, pruneEligible: 0 },
      runs: [{ runId: "run-terminal", classification: "active", eligibleForPrune: false }],
    });
  });

  it("archives a verified terminal receipt without mutating the database or source", async () => {
    const value = await fixture();
    const receipt = Buffer.from('{"schemaVersion":2,"runId":"run-terminal"}\n', "utf8");
    const sha256 = createHash("sha256").update(receipt).digest("hex");
    const receiptName = `fabric-receipt-${sha256}.json`;
    const receiptPath = join(value.runDirectory, receiptName);
    await writeFile(receiptPath, receipt, { mode: 0o600 });
    const database = new Database(value.databasePath);
    try {
      database.prepare("INSERT INTO barriers(run_id,scope,stage_id,state,closed_at,receipt_sha256) VALUES (?, 'run', '', 'closed', ?, ?)").run("run-terminal", Date.now(), sha256);
      database.prepare("INSERT INTO receipt_exports(run_id,relative_path,sha256,exported_at) VALUES (?,?,?,?)").run("run-terminal", receiptName, sha256, Date.now());
    } finally {
      database.close();
    }
    const before = await readFile(value.databasePath);
    const archived = await archiveRun(value.databasePath, "run-terminal", join(value.root, "archives"));
    expect(archived).toMatchObject({ runId: "run-terminal", sourceMutation: "none", receipt: { sha256 } });
    expect(await readFile(receiptPath)).toEqual(receipt);
    const after = await readFile(value.databasePath);
    expect(after.byteLength).toBe(before.byteLength);
    expect(after.equals(before)).toBe(true);
    expect(basename(String(archived.archiveDirectory))).toMatch(/^run-[0-9a-f]{24}$/u);
    expect(JSON.parse(await readFile(join(String(archived.archiveDirectory), "archive-manifest.json"), "utf8"))).toMatchObject({ receipt: { relativePath: receiptName, sha256 } });
  }, 5_000);

  it("refuses active and quarantined runs", async () => {
    const value = await fixture();
    await expect(archiveRun(value.databasePath, "run-terminal", join(value.root, "archives"))).rejects.toThrow(/terminal/u);
  });

  it("maps an unsafe run identifier to a fixed archive key inside the selected root", async () => {
    const value = await fixture("../outside");
    const receipt = Buffer.from('{"schemaVersion":2,"runId":"../outside"}\n', "utf8");
    const sha256 = createHash("sha256").update(receipt).digest("hex");
    const receiptName = `fabric-receipt-${sha256}.json`;
    await writeFile(join(value.runDirectory, receiptName), receipt, { mode: 0o600 });
    const database = new Database(value.databasePath);
    try {
      database.prepare("INSERT INTO barriers(run_id,scope,stage_id,state,closed_at,receipt_sha256) VALUES (?, 'run', '', 'closed', ?, ?)").run(value.runId, Date.now(), sha256);
      database.prepare("INSERT INTO receipt_exports(run_id,relative_path,sha256,exported_at) VALUES (?,?,?,?)").run(value.runId, receiptName, sha256, Date.now());
    } finally { database.close(); }
    const output = join(value.root, "archives");
    const archived = await archiveRun(value.databasePath, value.runId, output);
    expect(String(archived.archiveDirectory).startsWith(`${output}/run-`)).toBe(true);
    await expect(readFile(join(value.root, "outside", "archive-manifest.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

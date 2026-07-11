import { createHash, randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { constants } from "node:fs";
import { chmod, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

type RunRow = {
  run_id: string;
  project_run_directory: string | null;
  terminal: number;
  quarantined: number;
  task_count: number;
  message_count: number;
  event_count: number;
  receipt_count: number;
  unresolved_count: number;
};

export type RetentionRun = {
  runId: string;
  classification: "active" | "quarantined" | "terminal";
  eligibleForArchive: boolean;
  eligibleForPrune: false;
  counts: { tasks: number; messages: number; events: number; receipts: number };
};

function option(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  const value = index === -1 ? undefined : arguments_[index + 1];
  if (index !== -1 && (value === undefined || value.startsWith("--"))) throw new Error(`${name} requires a value`);
  return value;
}

function retentionRows(database: Database.Database): RetentionRun[] {
  const rows = database.prepare(`
    SELECT r.run_id, r.project_run_directory,
      EXISTS(SELECT 1 FROM barriers b WHERE b.run_id=r.run_id AND b.scope='run' AND b.stage_id='' AND b.state='closed') AS terminal,
      (EXISTS(SELECT 1 FROM leases l WHERE l.run_id=r.run_id AND l.status='quarantined') OR
       EXISTS(SELECT 1 FROM provider_actions p WHERE p.run_id=r.run_id AND p.status='quarantined')) AS quarantined,
      (SELECT COUNT(*) FROM tasks t WHERE t.run_id=r.run_id) AS task_count,
      (SELECT COUNT(*) FROM messages m WHERE m.run_id=r.run_id) AS message_count,
      (SELECT COUNT(*) FROM events e WHERE e.run_id=r.run_id) AS event_count,
      (SELECT COUNT(*) FROM receipt_exports x WHERE x.run_id=r.run_id) AS receipt_count,
      ((SELECT COUNT(*) FROM agents a WHERE a.run_id=r.run_id AND a.lifecycle='context-unreconciled') +
       (SELECT COUNT(*) FROM tasks t WHERE t.run_id=r.run_id AND t.state NOT IN ('complete','cancelled','degraded')) +
       (SELECT COUNT(*) FROM leases l WHERE l.run_id=r.run_id AND l.status IN ('active','quarantined')) +
       (SELECT COUNT(*) FROM deliveries d JOIN messages m ON m.message_id=d.message_id WHERE d.run_id=r.run_id AND m.requires_ack=1 AND d.state NOT IN ('acknowledged','abandoned','expired')) +
       (SELECT COUNT(*) FROM provider_actions p WHERE p.run_id=r.run_id AND p.status NOT IN ('terminal','quarantined'))) AS unresolved_count
    FROM runs r ORDER BY r.run_id
  `).all() as RunRow[];
  return rows.map((row) => {
    const classification = row.quarantined === 1 ? "quarantined" : row.terminal === 1 && row.unresolved_count === 0 ? "terminal" : "active";
    return {
      runId: row.run_id,
      classification,
      eligibleForArchive: classification === "terminal" && row.receipt_count > 0 && row.project_run_directory !== null,
      eligibleForPrune: false,
      counts: { tasks: row.task_count, messages: row.message_count, events: row.event_count, receipts: row.receipt_count },
    };
  });
}

export function retentionReport(databasePath: string, mode: "status" | "preview"): Record<string, unknown> {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const runs = retentionRows(database);
    return {
      schemaVersion: 1,
      mode,
      destructiveActionAvailable: false,
      policy: "report-and-archive-only",
      runs,
      totals: {
        active: runs.filter((run) => run.classification === "active").length,
        quarantined: runs.filter((run) => run.classification === "quarantined").length,
        terminal: runs.filter((run) => run.classification === "terminal").length,
        archiveEligible: runs.filter((run) => run.eligibleForArchive).length,
        pruneEligible: 0,
      },
    };
  } finally {
    database.close();
  }
}

async function atomicPrivateWrite(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
    await chmod(path, 0o600);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function archiveRun(databasePath: string, runId: string, outputDirectory: string): Promise<Record<string, unknown>> {
  if (!isAbsolute(outputDirectory)) throw new Error("archive output must be an absolute directory");
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  let projectRunDirectory: string;
  let relativePath: string;
  let expectedSha256: string;
  try {
    const run = retentionRows(database).find((candidate) => candidate.runId === runId);
    if (run === undefined) throw new Error(`run not found: ${runId}`);
    if (run.classification !== "terminal") throw new Error(`archive requires a terminal non-quarantined run: ${runId}`);
    const row = database.prepare(`
      SELECT r.project_run_directory, x.relative_path, x.sha256
      FROM runs r
      JOIN barriers b ON b.run_id=r.run_id AND b.scope='run' AND b.stage_id='' AND b.state='closed'
      JOIN receipt_exports x ON x.run_id=r.run_id AND x.sha256=b.receipt_sha256
      WHERE r.run_id=? ORDER BY x.exported_at DESC, x.relative_path DESC LIMIT 1
    `).get(runId) as { project_run_directory?: unknown; relative_path?: unknown; sha256?: unknown } | undefined;
    if (row === undefined || typeof row.project_run_directory !== "string" || typeof row.relative_path !== "string" || typeof row.sha256 !== "string") {
      throw new Error(`terminal run has no exported receipt: ${runId}`);
    }
    projectRunDirectory = row.project_run_directory;
    relativePath = row.relative_path;
    expectedSha256 = row.sha256;
  } finally {
    database.close();
  }
  if (basename(relativePath) !== relativePath) throw new Error("stored receipt path is not a filename");
  const sourcePath = join(projectRunDirectory, relativePath);
  const receipt = await readFile(sourcePath);
  const actualSha256 = createHash("sha256").update(receipt).digest("hex");
  if (actualSha256 !== expectedSha256) throw new Error("stored receipt hash does not match archive source");
  const archiveKey = createHash("sha256").update(runId).digest("hex").slice(0, 24);
  const archiveDirectory = resolve(outputDirectory, `run-${archiveKey}`);
  const receiptName = `fabric-receipt-${actualSha256}.json`;
  await atomicPrivateWrite(join(archiveDirectory, receiptName), receipt);
  const manifest = {
    schemaVersion: 1,
    kind: "agent-fabric-coordination-archive",
    runId,
    receipt: { relativePath: receiptName, sha256: actualSha256, bytes: receipt.byteLength },
    sourceMutation: "none",
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await atomicPrivateWrite(join(archiveDirectory, "archive-manifest.json"), manifestBytes);
  return { ...manifest, archiveDirectory };
}

export async function runRetentionCli(arguments_: string[], databasePath: string): Promise<Record<string, unknown>> {
  const action = arguments_[0];
  const selectedDatabase = option(arguments_, "--database") ?? databasePath;
  if (action === "status" || action === "preview") return retentionReport(selectedDatabase, action);
  if (action === "archive") {
    const runId = option(arguments_, "--run-id");
    const output = option(arguments_, "--output");
    if (runId === undefined || output === undefined) throw new Error("retention archive requires --run-id ID --output ABSOLUTE_DIRECTORY");
    return archiveRun(selectedDatabase, runId, output);
  }
  throw new Error("retention command must be status, preview or archive");
}

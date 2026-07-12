import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselineFile = "0001-current-baseline.sql";
const baselinePath = join(root, "migrations", baselineFile);
const manifestPath = join(root, "schemas", "database-baseline.v1.json");
const baseline = readFileSync(baselinePath, "utf8");
const database = new Database(":memory:");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

try {
  database.exec(baseline);
  const rows = database.prepare(`
    SELECT type,name,tbl_name,sql
      FROM sqlite_schema
     WHERE name NOT LIKE 'sqlite_%'
     ORDER BY type,name,tbl_name
  `).all();
  const manifest = {
    schemaVersion: 1,
    epoch: "agent-fabric-pre-release-v1",
    baselineFile,
    baselineSha256: sha256(baseline),
    catalogSha256: sha256(JSON.stringify(
      rows.map((row) => [row.type, row.name, row.tbl_name, row.sql]),
    )),
    objectCount: rows.length,
  };
  const rendered = `${JSON.stringify(manifest, null, 2)}\n`;

  if (process.argv.includes("--write")) {
    writeFileSync(manifestPath, rendered, "utf8");
  } else if (readFileSync(manifestPath, "utf8") !== rendered) {
    console.error("database baseline manifest is stale; run npm run schema:update");
    process.exitCode = 1;
  }
} finally {
  database.close();
}

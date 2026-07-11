import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const countPath = process.env.SUPERVISOR_COUNT_PATH;
if (countPath === undefined) throw new Error("SUPERVISOR_COUNT_PATH is required");
const count = existsSync(countPath) ? Number(readFileSync(countPath, "utf8")) : 0;
writeFileSync(countPath, String(count + 1), { mode: 0o600 });
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", async (line) => {
  const request = JSON.parse(line) as { id: string; method: string };
  const delay = Number(process.env.SUPERVISOR_DELAY_MS ?? "0");
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  process.stdout.write(`${JSON.stringify({ id: request.id, result: { method: request.method, pid: process.pid } })}\n`);
});

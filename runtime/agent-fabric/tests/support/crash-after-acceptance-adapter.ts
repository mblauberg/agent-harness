import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const journalPath = process.env.CRASH_ADAPTER_JOURNAL;
if (journalPath === undefined) throw new Error("CRASH_ADAPTER_JOURNAL is required");

type Request = { id: string; method: string; params: Record<string, unknown> };
type Journal = { actionId: string; dispatchCount: number };
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

function respond(id: string, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ id, result })}\n`);
}

input.on("line", (line) => {
  const request = JSON.parse(line) as Request;
  if (request.method === "capabilities") {
    respond(request.id, { protocolVersion: 1, operations: ["dispatch", "lookup_action"], actionJournal: true });
    return;
  }
  if (request.method === "dispatch") {
    const actionId = request.params.actionId;
    if (typeof actionId !== "string") throw new Error("actionId is required");
    const prior: Journal | undefined = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, "utf8")) as Journal : undefined;
    writeFileSync(journalPath, `${JSON.stringify({ actionId, dispatchCount: (prior?.dispatchCount ?? 0) + 1 })}\n`, { mode: 0o600 });
    process.exit(0);
  }
  if (request.method === "lookup_action") {
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal;
    respond(request.id, { actionId: journal.actionId, status: "terminal", history: ["prepared", "dispatched", "accepted", "terminal"], executionCount: journal.dispatchCount, effectCount: 1, idempotencyProven: true, result: { acceptedBeforeCrash: true } });
    return;
  }
  respond(request.id, {});
});

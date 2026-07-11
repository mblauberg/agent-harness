import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

type Request = { id: string; method: string; params: Record<string, unknown> };
type Action = {
  actionId: string;
  status: "terminal";
  history: ["prepared", "dispatched", "accepted", "terminal"];
  executionCount: 1;
  effectCount: 1;
  result: { completed: true };
  idempotencyProven: true;
};

const journalPath = process.env.PROVIDER_TURN_JOURNAL;
if (journalPath === undefined) throw new Error("PROVIDER_TURN_JOURNAL is required");
const requiredJournalPath: string = journalPath;
const delayMs = Number(process.env.PROVIDER_TURN_DELAY_MS ?? "100");

function respond(id: string, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ id, result })}\n`);
}

function actions(): Record<string, Action> {
  try {
    return JSON.parse(readFileSync(requiredJournalPath, "utf8")) as Record<string, Action>;
  } catch {
    return {};
  }
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  void (async (): Promise<void> => {
    const request = JSON.parse(line) as Request;
    if (request.method === "capabilities") {
      respond(request.id, {
        protocolVersion: 1,
        operations: ["capabilities", "dispatch", "lookup_action"],
        actionJournal: true,
      });
      return;
    }
    if (request.method === "lookup_action") {
      respond(request.id, actions()[String(request.params.actionId)]);
      return;
    }
    if (request.method !== "dispatch") throw new Error(`unsupported ${request.method}`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const actionId = String(request.params.actionId);
    const action: Action = {
      actionId,
      status: "terminal",
      history: ["prepared", "dispatched", "accepted", "terminal"],
      executionCount: 1,
      effectCount: 1,
      result: { completed: true },
      idempotencyProven: true,
    };
    const journal = actions();
    journal[actionId] = action;
    writeFileSync(requiredJournalPath, `${JSON.stringify(journal)}\n`);
    respond(request.id, action);
  })();
});

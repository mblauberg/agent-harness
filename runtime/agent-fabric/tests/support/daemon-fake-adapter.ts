import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const journalPath = process.env.FAKE_ADAPTER_JOURNAL;
if (journalPath === undefined) {
  throw new Error("FAKE_ADAPTER_JOURNAL is required");
}
const requiredJournalPath: string = journalPath;

type ActionRecord = {
  actionId: string;
  payloadHash: string;
  status: string;
  history: string[];
  executionCount: number;
  effectCount: number;
  result?: unknown;
};

type Journal = {
  schemaVersion: 1;
  actions: Record<string, ActionRecord>;
  released: boolean;
};

type Request = {
  id: string;
  method: string;
  params: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActionRecord(value: unknown): value is ActionRecord {
  return (
    isRecord(value) &&
    typeof value.actionId === "string" &&
    typeof value.payloadHash === "string" &&
    typeof value.status === "string" &&
    Array.isArray(value.history) &&
    value.history.every((item) => typeof item === "string") &&
    typeof value.executionCount === "number" &&
    typeof value.effectCount === "number"
  );
}

function isJournal(value: unknown): value is Journal {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    isRecord(value.actions) &&
    Object.values(value.actions).every(isActionRecord) &&
    typeof value.released === "boolean"
  );
}

function isRequest(value: unknown): value is Request {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.method === "string" &&
    isRecord(value.params)
  );
}

function loadJournal(): Journal {
  if (!existsSync(requiredJournalPath)) {
    return { schemaVersion: 1, actions: {}, released: false };
  }
  const value: unknown = JSON.parse(readFileSync(requiredJournalPath, "utf8"));
  if (!isJournal(value)) {
    throw new Error("fake adapter journal is invalid");
  }
  return value;
}

function saveJournal(journal: Journal): void {
  writeFileSync(requiredJournalPath, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function respond(id: string, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ id, result })}\n`);
}

function fail(id: string, code: string, message: string): void {
  process.stdout.write(`${JSON.stringify({ id, error: { code, message } })}\n`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  const value: unknown = JSON.parse(line);
  if (!isRequest(value)) {
    throw new Error("fake adapter request is invalid");
  }
  const request = value;
  const journal = loadJournal();
  if (request.method === "capabilities") {
    respond(request.id, {
      protocolVersion: 1,
      operations: ["capabilities", "spawn", "dispatch", "lookup_action", "cancel_action", "release"],
      actionJournal: true,
      ephemeralWorker: true,
      answerBearingSpawn: true,
    });
    return;
  }
  if (request.method === "spawn") {
    if (
      typeof request.params.actionId !== "string" ||
      typeof request.params.model !== "string" ||
      typeof request.params.modelFamily !== "string" ||
      typeof request.params.prompt !== "string" ||
      typeof request.params.taskId !== "string"
    ) {
      fail(request.id, "INVALID_PARAMS", "task-bound ephemeral spawn fields are required");
      return;
    }
    respond(request.id, {
      result: `review:${request.params.modelFamily}:${request.params.model}`,
      taskId: request.params.taskId,
    });
    return;
  }
  if (request.method === "dispatch") {
    const actionId = request.params.actionId;
    if (typeof actionId !== "string") {
      fail(request.id, "INVALID_PARAMS", "actionId must be a string");
      return;
    }
    const payloadHash = digest(request.params.payload);
    const existing = journal.actions[actionId];
    if (existing !== undefined) {
      if (existing.payloadHash !== payloadHash) {
        fail(request.id, "ACTION_CONFLICT", "action ID reused with changed payload");
      } else {
        respond(request.id, existing);
      }
      return;
    }
    const action: ActionRecord = {
      actionId,
      payloadHash,
      status: "prepared",
      history: ["prepared"],
      executionCount: 0,
      effectCount: 0,
    };
    journal.actions[actionId] = action;
    saveJournal(journal);
    action.status = "dispatched";
    action.history.push("dispatched");
    action.executionCount += 1;
    saveJournal(journal);
    action.status = "accepted";
    action.history.push("accepted");
    action.effectCount = 1;
    saveJournal(journal);
    action.status = "terminal";
    action.history.push("terminal");
    action.result = { echoed: request.params.payload };
    saveJournal(journal);
    respond(request.id, action);
    return;
  }
  if (request.method === "lookup_action") {
    const actionId = request.params.actionId;
    if (typeof actionId !== "string") {
      fail(request.id, "INVALID_PARAMS", "actionId must be a string");
      return;
    }
    const action = journal.actions[actionId];
    if (action === undefined) {
      fail(request.id, "ACTION_NOT_FOUND", "action does not exist");
    } else {
      respond(request.id, action);
    }
    return;
  }
  if (request.method === "cancel_action") {
    const actionId = request.params.actionId;
    if (typeof actionId !== "string") {
      fail(request.id, "INVALID_PARAMS", "actionId must be a string");
      return;
    }
    const action = journal.actions[actionId];
    if (action === undefined) {
      fail(request.id, "ACTION_NOT_FOUND", "action does not exist");
    } else if (action.status === "terminal") {
      fail(request.id, "ACTION_TERMINAL", "terminal action cannot be cancelled");
    } else {
      action.status = "cancelled";
      action.history.push("cancelled");
      saveJournal(journal);
      respond(request.id, action);
    }
    return;
  }
  if (request.method === "release") {
    journal.released = true;
    saveJournal(journal);
    respond(request.id, { released: true });
    input.close();
    return;
  }
  fail(request.id, "METHOD_NOT_FOUND", `unsupported method ${request.method}`);
});

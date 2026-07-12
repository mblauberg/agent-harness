import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const journalPath = process.env.LIFECYCLE_FAKE_JOURNAL;
if (journalPath === undefined) {
  throw new Error("LIFECYCLE_FAKE_JOURNAL is required");
}
const requiredJournalPath: string = journalPath;

type Action = {
  actionId: string;
  payloadHash: string;
  status: string;
  history: string[];
  executionCount: number;
  effectCount: number;
  idempotencyProven: boolean;
  result?: unknown;
};

type Journal = {
  schemaVersion: 1;
  actions: Record<string, Action>;
  sessions: Record<string, { released: boolean; generation: number }>;
};

type Request = { id: string; method: string; params: Record<string, unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJournal(value: unknown): value is Journal {
  return isRecord(value) && value.schemaVersion === 1 && isRecord(value.actions) && isRecord(value.sessions);
}

function loadJournal(): Journal {
  if (!existsSync(requiredJournalPath)) {
    return { schemaVersion: 1, actions: {}, sessions: {} };
  }
  const value: unknown = JSON.parse(readFileSync(requiredJournalPath, "utf8"));
  if (!isJournal(value)) throw new Error("fake provider journal is invalid");
  return value;
}

function saveJournal(journal: Journal): void {
  writeFileSync(requiredJournalPath, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
}

function payloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function respond(id: string, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ id, result })}\n`);
}

function fail(id: string, code: string, message: string): void {
  process.stdout.write(`${JSON.stringify({ id, error: { code, message } })}\n`);
}

function actionFor(request: Request, journal: Journal): Action | undefined {
  const actionId = request.params.actionId;
  return typeof actionId === "string" ? journal.actions[actionId] : undefined;
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  const parsed: unknown = JSON.parse(line);
  if (!isRecord(parsed) || typeof parsed.id !== "string" || typeof parsed.method !== "string" || !isRecord(parsed.params)) {
    throw new Error("invalid fake provider request");
  }
  const request: Request = { id: parsed.id, method: parsed.method, params: parsed.params };
  const journal = loadJournal();

  if (request.method === "capabilities") {
    respond(request.id, {
      protocolVersion: 1,
      operations: ["status", "spawn", "dispatch", "lookup_action", "cancel_action", "release"],
      actionJournal: true,
      ephemeralWorker: true,
      answerBearingSpawn: true,
      compactInPlace: false,
      idempotencyEvidence: "per-action",
    });
    return;
  }
  if (request.method === "spawn") {
    const prior = typeof request.params.priorResumeReference === "string" ? request.params.priorResumeReference : "new";
    const generation = typeof request.params.generation === "number" ? request.params.generation : 1;
    const resumeReference = `${prior}:replacement:g${String(generation)}`;
    journal.sessions[resumeReference] = { released: false, generation };
    saveJournal(journal);
    respond(request.id, { resumeReference, generation, result: "fake provider review complete" });
    return;
  }
  if (request.method === "release") {
    const reference = request.params.resumeReference;
    if (typeof reference === "string") {
      journal.sessions[reference] = {
        released: true,
        generation: typeof request.params.generation === "number" ? request.params.generation : 1,
      };
      saveJournal(journal);
    }
    respond(request.id, { released: true, deleted: false });
    return;
  }
  if (request.method === "dispatch") {
    const actionId = request.params.actionId;
    const payload = request.params.payload;
    if (typeof actionId !== "string" || !isRecord(payload)) {
      fail(request.id, "INVALID_PARAMS", "actionId and payload are required");
      return;
    }
    const digest = payloadHash(payload);
    const existing = journal.actions[actionId];
    if (existing !== undefined) {
      if (existing.payloadHash !== digest) {
        fail(request.id, "ACTION_CONFLICT", "action ID was reused with changed payload");
        return;
      }
      if (existing.status === "ambiguous" && existing.idempotencyProven) {
        existing.executionCount += 1;
        existing.history.push("dispatched", "accepted", "terminal");
        existing.status = "terminal";
        existing.result = { replayedWithSameActionId: true };
        saveJournal(journal);
      }
      respond(request.id, existing);
      return;
    }
    const scenario = typeof payload.scenario === "string" ? payload.scenario : "terminal";
    const ambiguous = scenario === "ambiguous-unproven" || scenario === "ambiguous-idempotent";
    const action: Action = {
      actionId,
      payloadHash: digest,
      status: ambiguous ? "ambiguous" : "terminal",
      history: ambiguous
        ? ["prepared", "dispatched", "accepted", "ambiguous"]
        : ["prepared", "dispatched", "accepted", "terminal"],
      executionCount: 1,
      effectCount: 1,
      idempotencyProven: scenario === "ambiguous-idempotent",
      ...(ambiguous ? {} : { result: { completed: true } }),
    };
    journal.actions[actionId] = action;
    saveJournal(journal);
    respond(request.id, action);
    return;
  }
  if (request.method === "lookup_action") {
    const action = actionFor(request, journal);
    if (action === undefined) {
      fail(request.id, "ACTION_NOT_FOUND", "action does not exist");
    } else {
      respond(request.id, action);
    }
    return;
  }
  if (request.method === "cancel_action") {
    const action = actionFor(request, journal);
    if (action === undefined) {
      fail(request.id, "ACTION_NOT_FOUND", "action does not exist");
    } else {
      action.status = "terminal";
      action.history.push("terminal");
      saveJournal(journal);
      respond(request.id, action);
    }
    return;
  }
  if (request.method === "status") {
    if (process.env.LIFECYCLE_FAKE_STATUS === "missing-evidence") {
      respond(request.id, {});
      return;
    }
    const managed = process.env.LIFECYCLE_FAKE_STATUS !== "unmanaged";
    respond(request.id, { healthy: managed, matches: managed });
    return;
  }
  fail(request.id, "METHOD_NOT_FOUND", `unsupported method ${request.method}`);
});

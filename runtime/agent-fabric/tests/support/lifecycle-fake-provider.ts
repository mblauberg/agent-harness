import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const journalPath = process.env.LIFECYCLE_FAKE_JOURNAL;
if (journalPath === undefined) {
  throw new Error("LIFECYCLE_FAKE_JOURNAL is required");
}
const requiredJournalPath: string = journalPath;
const spawnDelayMs = Number(process.env.LIFECYCLE_FAKE_SPAWN_DELAY_MS ?? "0");

type Action = {
  actionId: string;
  payloadHash: string;
  status: string;
  history: string[];
  executionCount: number;
  effectCount: number;
  idempotencyProven: boolean;
  result?: unknown;
  scenario?: string;
  lookupCount?: number;
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
    const result = {
      protocolVersion: 1,
      operations: ["status", "spawn", "dispatch", "lookup_action", "cancel_action", "release"],
      actionJournal: true,
      ephemeralWorker: true,
      answerBearingSpawn: true,
      answerBearingSpawnTurns: process.env.LIFECYCLE_FAKE_PAYLOAD_MAX_TURNS === "1"
        ? "payload-max-turns"
        : "one-shot",
      ...(process.env.LIFECYCLE_FAKE_MANDATORY_USAGE === "1"
        ? { answerBearingUsageUnits: ["cost:USD", "input_tokens:fake", "output_tokens:fake"] }
        : {}),
      compactInPlace: false,
      idempotencyEvidence: "per-action",
    };
    const delay = Number(process.env.LIFECYCLE_FAKE_CAPABILITIES_DELAY_MS ?? "0");
    if (Number.isSafeInteger(delay) && delay > 0) setTimeout(() => respond(request.id, result), delay);
    else respond(request.id, result);
    return;
  }
  if (request.method === "spawn") {
    const taskBoundMaxTurns = request.params.maxTurns;
    if (
      typeof request.params.taskId === "string" &&
      (
        typeof taskBoundMaxTurns !== "number" ||
        !Number.isSafeInteger(taskBoundMaxTurns) ||
        taskBoundMaxTurns < 1 ||
        (process.env.LIFECYCLE_FAKE_PAYLOAD_MAX_TURNS !== "1" && taskBoundMaxTurns !== 1)
      )
    ) {
      fail(request.id, "INVALID_PARAMS", "task-bound fake spawn requires its advertised turn ceiling");
      return;
    }
    const prior = typeof request.params.priorResumeReference === "string" ? request.params.priorResumeReference : "new";
    const generation = typeof request.params.generation === "number" ? request.params.generation : 1;
    const resumeReference = `${prior}:replacement:g${String(generation)}`;
    journal.sessions[resumeReference] = { released: false, generation };
    const scenario = typeof request.params.scenario === "string" ? request.params.scenario : "terminal";
    if (scenario.startsWith("ambiguous-review-")) {
      const actionId = request.params.actionId;
      if (typeof actionId !== "string") {
        fail(request.id, "INVALID_PARAMS", "actionId is required");
        return;
      }
      const answer = scenario === "ambiguous-review-valid" ||
        scenario === "ambiguous-review-wrong-action-id" ||
        scenario === "ambiguous-review-concurrent-divergent"
        ? "recovered provider review"
        : scenario === "ambiguous-review-usage-late"
          ? "recovered provider review with late usage"
        : scenario === "ambiguous-review-empty"
          ? ""
          : "x".repeat(262_145);
      journal.actions[actionId] = {
        actionId,
        payloadHash: payloadHash(request.params.payload),
        status: "terminal",
        history: ["prepared", "dispatched", "accepted", "terminal"],
        executionCount: 1,
        effectCount: 1,
        idempotencyProven: true,
        result: { resumeReference, generation, result: answer },
        scenario,
        lookupCount: 0,
      };
      saveJournal(journal);
      fail(request.id, "TRANSPORT_RESULT_LOST", "provider completed but the direct response was lost");
      return;
    }
    saveJournal(journal);
    const complete = (): void => respond(request.id, {
      resumeReference,
      generation,
      result: "fake provider review complete",
      ...(scenario === "terminal-exact-usage"
        ? { resourceUsage: { "cost:USD": 5, "input_tokens:fake": 3, "output_tokens:fake": 4 } }
        : scenario === "terminal-partial-turn-usage"
          ? { resourceUsage: { turns: 1 } }
        : scenario === "terminal-malformed-turn-usage"
          ? { resourceUsage: { turns: -1 } }
        : scenario === "terminal-over-turn-usage"
          ? { resourceUsage: { turns: 3 } }
        : scenario === "terminal-unreserved-usage"
          ? { resourceUsage: { "output_tokens:other": 1 } }
          : scenario === "terminal-over-cap-usage"
            ? { resourceUsage: { "cost:USD": 11 } }
            : scenario === "terminal-malformed-usage"
              ? { resourceUsage: "not-a-budget-vector" }
        : {}),
    });
    if (Number.isSafeInteger(spawnDelayMs) && spawnDelayMs > 0) setTimeout(complete, spawnDelayMs);
    else complete();
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
      if (action.scenario === "ambiguous-review-concurrent-divergent") {
        action.lookupCount = (action.lookupCount ?? 0) + 1;
        const lookupCount = action.lookupCount;
        const candidate = {
          ...action,
          result: {
            ...(isRecord(action.result) ? action.result : {}),
            result: lookupCount === 1 ? "recovered provider review" : "divergent provider review",
            resourceUsage: { turns: lookupCount === 1 ? 1 : 2 },
          },
        };
        saveJournal(journal);
        if (lookupCount === 1) setTimeout(() => respond(request.id, candidate), 100);
        else respond(request.id, candidate);
        return;
      }
      if (action.scenario === "ambiguous-review-usage-late") {
        action.lookupCount = (action.lookupCount ?? 0) + 1;
        if (action.lookupCount >= 2 && isRecord(action.result)) {
          action.result.resourceUsage = {
            "cost:USD": 5,
            "input_tokens:fake": 3,
            "output_tokens:fake": 4,
          };
        }
        saveJournal(journal);
      }
      respond(request.id, action.scenario === "ambiguous-review-wrong-action-id"
        ? { ...action, actionId: `${action.actionId}:wrong` }
        : action);
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

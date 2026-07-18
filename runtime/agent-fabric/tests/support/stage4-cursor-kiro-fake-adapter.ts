import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const adapterId = process.argv[2];
const journalPath = process.env.STAGE4_FAKE_ADAPTER_JOURNAL;
if ((adapterId !== "cursor-agent" && adapterId !== "kiro-acp" && adapterId !== "opencode-acp") || journalPath === undefined) {
  throw new Error("fixture requires cursor-agent|kiro-acp|opencode-acp and STAGE4_FAKE_ADAPTER_JOURNAL");
}
const selectedAdapter: "cursor-agent" | "kiro-acp" | "opencode-acp" = adapterId;
const requiredJournalPath: string = journalPath;

type Action = {
  actionId: string;
  payloadHash: string;
  status: "terminal";
  executionCount: number;
};

type Journal = { schemaVersion: 1; actions: Record<string, Action>; released: boolean };
type Request = { id: string; method: string; params: Record<string, unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJournal(value: unknown): value is Journal {
  return isRecord(value) && value.schemaVersion === 1 && isRecord(value.actions) && typeof value.released === "boolean";
}

function loadJournal(): Journal {
  if (!existsSync(requiredJournalPath)) return { schemaVersion: 1, actions: {}, released: false };
  const value: unknown = JSON.parse(readFileSync(requiredJournalPath, "utf8"));
  if (!isJournal(value)) throw new Error("fixture journal is invalid");
  return value;
}

function saveJournal(journal: Journal): void {
  writeFileSync(requiredJournalPath, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
}

function respond(id: string, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ id, result })}\n`);
}

function fail(id: string, code: string, message: string): void {
  process.stdout.write(`${JSON.stringify({ id, error: { code, message } })}\n`);
}

function allowedModel(payload: Record<string, unknown>): boolean {
  const model = payload.model;
  const family = payload.modelFamily;
  if (typeof model !== "string" || model.length === 0) return false;
  if (selectedAdapter === "cursor-agent") {
    return (model.startsWith("composer-") && family === "cursor-composer") ||
      (model.startsWith("cursor-grok-") && family === "xai");
  }
  if (selectedAdapter === "opencode-acp") {
    return model.startsWith("opencode/") && family === "generic-open";
  }
  return family === "open-weight";
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  const value: unknown = JSON.parse(line);
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.method !== "string" || !isRecord(value.params)) {
    throw new Error("invalid fixture request");
  }
  const request: Request = { id: value.id, method: value.method, params: value.params };
  const journal = loadJournal();
  if (request.method === "capabilities") {
    respond(request.id, {
      protocolVersion: 1,
      adapterContractVersion: 1,
      adapterId: selectedAdapter,
      actionJournal: true,
      requiresExplicitModel: true,
      modelFamilies: selectedAdapter === "cursor-agent" ? ["cursor-composer", "xai"] : selectedAdapter === "opencode-acp" ? ["generic-open"] : ["open-weight"],
    });
    return;
  }
  if (request.method === "dispatch") {
    const actionId = request.params.actionId;
    const payload = request.params.payload;
    if (typeof actionId !== "string" || !isRecord(payload)) {
      fail(request.id, "INVALID_PARAMS", "actionId and payload are required");
      return;
    }
    if (!allowedModel(payload)) {
      fail(request.id, "MODEL_NOT_ALLOWED", "fixture model is outside adapter policy");
      return;
    }
    const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const existing = journal.actions[actionId];
    if (existing !== undefined) {
      if (existing.payloadHash !== digest) {
        fail(request.id, "ACTION_CONFLICT", "action ID reused with changed payload");
      } else {
        respond(request.id, existing);
      }
      return;
    }
    const action: Action = { actionId, payloadHash: digest, status: "terminal", executionCount: 1 };
    journal.actions[actionId] = action;
    saveJournal(journal);
    respond(request.id, action);
    return;
  }
  if (request.method === "lookup_action") {
    const actionId = request.params.actionId;
    const action = typeof actionId === "string" ? journal.actions[actionId] : undefined;
    if (action === undefined) fail(request.id, "ACTION_NOT_FOUND", "action does not exist");
    else respond(request.id, action);
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

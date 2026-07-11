import { createInterface } from "node:readline";

type ActionRecord = {
  actionId: string;
  payload: Record<string, unknown>;
  status: "terminal";
  executionCount: number;
};

const adapterId = process.argv[2] ?? "fixture-primary";
const actions = new Map<string, ActionRecord>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function respond(id: string, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ id, result })}\n`);
}

function reject(id: string, code: string, message: string): void {
  process.stdout.write(`${JSON.stringify({ id, error: { code, message } })}\n`);
}

function actionResult(record: ActionRecord): Record<string, unknown> {
  return {
    actionId: record.actionId,
    status: record.status,
    executionCount: record.executionCount,
  };
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  const request: unknown = JSON.parse(line);
  if (!isRecord(request) || typeof request.id !== "string" || typeof request.method !== "string") {
    return;
  }
  const params = isRecord(request.params) ? request.params : {};
  if (request.method === "capabilities") {
    respond(request.id, {
      protocolVersion: 1,
      adapterId,
      actionJournal: true,
      persistentSession: true,
      ephemeralWorker: true,
      controlModes: ["managed"],
      inboxDeliveryModes: ["structured-push"],
      recoveryOperations: ["resume_reference", "lookup_action"],
    });
    return;
  }
  if (request.method === "dispatch") {
    const actionId = params.actionId;
    const payload = params.payload;
    if (typeof actionId !== "string" || !isRecord(payload)) {
      reject(request.id, "INVALID_ACTION", "dispatch requires actionId and payload");
      return;
    }
    const existing = actions.get(actionId);
    if (existing !== undefined) {
      if (JSON.stringify(existing.payload) !== JSON.stringify(payload)) {
        reject(request.id, "ACTION_CONFLICT", "action ID was reused with a changed payload");
        return;
      }
      respond(request.id, actionResult(existing));
      return;
    }
    const record: ActionRecord = { actionId, payload, status: "terminal", executionCount: 1 };
    actions.set(actionId, record);
    respond(request.id, actionResult(record));
    return;
  }
  if (request.method === "lookup_action") {
    const actionId = params.actionId;
    const record = typeof actionId === "string" ? actions.get(actionId) : undefined;
    if (record === undefined) {
      reject(request.id, "ACTION_NOT_FOUND", "action is unknown");
      return;
    }
    respond(request.id, actionResult(record));
    return;
  }
  if (request.method === "release") {
    respond(request.id, { released: true });
    input.close();
    return;
  }
  reject(request.id, "CAPABILITY_UNAVAILABLE", `unsupported fixture operation ${request.method}`);
});

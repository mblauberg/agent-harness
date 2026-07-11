import { createInterface } from "node:readline";

type Action = {
  actionId: string;
  payload: Record<string, unknown>;
  status: "terminal";
  executionCount: number;
};

const adapterId = process.argv[2];
const allowedFamilies: unknown = JSON.parse(process.argv[3] ?? "[]");
if (adapterId === undefined || !Array.isArray(allowedFamilies) || !allowedFamilies.every((item) => typeof item === "string")) {
  throw new Error("fixture requires adapter ID and allowed-family JSON");
}
const families: string[] = allowedFamilies;
const actions = new Map<string, Action>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function respond(id: string, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ id, result })}\n`);
}

function reject(id: string, code: string, message: string): void {
  process.stdout.write(`${JSON.stringify({ id, error: { code, message } })}\n`);
}

function actionResult(action: Action): Record<string, unknown> {
  return {
    actionId: action.actionId,
    status: action.status,
    executionCount: action.executionCount,
  };
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  const request: unknown = JSON.parse(line);
  if (!isRecord(request) || typeof request.id !== "string" || typeof request.method !== "string") return;
  const params = isRecord(request.params) ? request.params : {};

  if (request.method === "capabilities") {
    respond(request.id, {
      protocolVersion: 1,
      adapterContractVersion: 1,
      adapterId,
      actionJournal: true,
      persistentSession: true,
      ephemeralWorker: true,
      controlModes: ["managed"],
      inboxDeliveryModes: ["structured-push"],
      recoveryOperations: ["resume_reference", "lookup_action"],
      allowedModelFamilies: families,
      requiresExplicitModel: true,
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
    if (typeof payload.model !== "string" || payload.model.length === 0) {
      reject(request.id, "ADAPTER_MODEL_REQUIRED", "fixture requires an explicit model");
      return;
    }
    if (typeof payload.modelFamily !== "string" || !families.includes(payload.modelFamily)) {
      reject(request.id, "ADAPTER_FAMILY_FORBIDDEN", "fixture model family is not allowed");
      return;
    }
    const existing = actions.get(actionId);
    if (existing !== undefined) {
      if (JSON.stringify(existing.payload) !== JSON.stringify(payload)) {
        reject(request.id, "ACTION_CONFLICT", "action ID reused with changed payload");
      } else {
        respond(request.id, actionResult(existing));
      }
      return;
    }
    const action: Action = { actionId, payload, status: "terminal", executionCount: 1 };
    actions.set(actionId, action);
    respond(request.id, actionResult(action));
    return;
  }
  if (request.method === "lookup_action") {
    const action = typeof params.actionId === "string" ? actions.get(params.actionId) : undefined;
    if (action === undefined) reject(request.id, "ACTION_NOT_FOUND", "action is unknown");
    else respond(request.id, actionResult(action));
    return;
  }
  if (request.method === "release") {
    respond(request.id, { released: true });
    input.close();
    return;
  }
  reject(request.id, "CAPABILITY_UNAVAILABLE", `unsupported fixture method ${request.method}`);
});

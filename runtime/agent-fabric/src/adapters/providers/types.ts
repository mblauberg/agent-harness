export type AdapterActionStatus =
  | "prepared"
  | "dispatched"
  | "accepted"
  | "terminal"
  | "ambiguous"
  | "cancelled";

export type AdapterActionRecord = {
  actionId: string;
  operation: string;
  payloadHash: string;
  status: AdapterActionStatus;
  history: AdapterActionStatus[];
  executionCount: number;
  effectCount: number;
  idempotencyProven: boolean;
  result?: unknown;
};

export type ProviderAdapterCapabilities = {
  protocolVersion: 1;
  adapterId: string;
  operations: string[];
  actionJournal: true;
  persistentSession: boolean;
  ephemeralWorker: true;
  controlModes: ["managed"];
  inboxDeliveryModes: ["structured-push"];
  recoveryOperations: string[];
  compactInPlace: boolean;
  idempotencyEvidence: "per-action-fail-closed";
};

export type AdapterRequestHandler = {
  request(method: string, params: Record<string, unknown>): Promise<unknown>;
};

export class ProviderAdapterError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderAdapterError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderAdapterError("INVALID_PARAMS", `${field} must be a non-empty string`);
  }
  return value;
}

export function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, field);
}

export function actionPayload(params: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(params.payload)) return params.payload;
  return Object.fromEntries(Object.entries(params).filter(([key]) => key !== "actionId"));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

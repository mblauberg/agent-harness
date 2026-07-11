declare const identifierBrand: unique symbol;

export type Identifier<Kind extends string> = string & {
  readonly [identifierBrand]: Kind;
};

export type ProjectId = Identifier<"ProjectId">;
export type ProjectSessionId = Identifier<"ProjectSessionId">;
export type CoordinationRunId = Identifier<"CoordinationRunId">;
export type WorkstreamId = Identifier<"WorkstreamId">;
export type DeliveryRunId = Identifier<"DeliveryRunId">;
export type AgentId = Identifier<"AgentId">;
export type OperatorId = Identifier<"OperatorId">;
export type OperatorClientId = Identifier<"OperatorClientId">;
export type CapabilityId = Identifier<"CapabilityId">;
export type InputAttestationId = Identifier<"InputAttestationId">;
export type CommandId = Identifier<"CommandId">;
export type IntakeId = Identifier<"IntakeId">;
export type GateId = Identifier<"GateId">;
export type TaskId = Identifier<"TaskId">;
export type TeamId = Identifier<"TeamId">;
export type MessageId = Identifier<"MessageId">;
export type ConversationId = Identifier<"ConversationId">;
export type CallbackId = Identifier<"CallbackId">;
export type ResultDeliveryId = Identifier<"ResultDeliveryId">;
export type ReservationId = Identifier<"ReservationId">;
export type ResourceScopeId = Identifier<"ResourceScopeId">;
export type MembershipId = Identifier<"MembershipId">;
export type LeaseId = Identifier<"LeaseId">;
export type ProviderActionId = Identifier<"ProviderActionId">;
export type ArtifactObligationId = Identifier<"ArtifactObligationId">;
export type BarrierId = Identifier<"BarrierId">;
export type ProviderSessionRef = Identifier<"ProviderSessionRef">;
export type ProjectionCursor = number;

declare const digestBrand: unique symbol;
export type Sha256Digest = string & { readonly [digestBrand]: "Sha256Digest" };

declare const timestampBrand: unique symbol;
export type Timestamp = string & { readonly [timestampBrand]: "Timestamp" };

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[];

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type ArtifactRef = {
  path: string;
  digest: Sha256Digest;
};

export class ProtocolValidationError extends TypeError {
  readonly path: string;

  constructor(path: string, message: string, options?: ErrorOptions) {
    super(`${path} ${message}`, options);
    this.name = "ProtocolValidationError";
    this.path = path;
  }
}

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;

export function parseIdentifier<Kind extends string>(value: unknown, path: string): Identifier<Kind> {
  if (typeof value !== "string" || !identifierPattern.test(value)) {
    throw new ProtocolValidationError(path, "must be a bounded stable identifier");
  }
  // A runtime-validated wire primitive is branded at this single boundary.
  return value as Identifier<Kind>;
}

export function parseSha256Digest(value: unknown, path: string): Sha256Digest {
  if (typeof value !== "string" || !digestPattern.test(value)) {
    throw new ProtocolValidationError(path, "must be a lowercase sha256 digest");
  }
  // A runtime-validated wire primitive is branded at this single boundary.
  return value as Sha256Digest;
}

export function parseTimestamp(value: unknown, path: string): Timestamp {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new ProtocolValidationError(path, "must be an ISO-8601 timestamp");
  }
  // A runtime-validated wire primitive is branded at this single boundary.
  return value as Timestamp;
}

export function parseArtifactRef(value: unknown, path: string): ArtifactRef {
  const record = strictRecord(value, path, ["path", "digest"]);
  const artifactPath = requiredString(record.path, `${path}.path`);
  if (artifactPath.includes("\0") || artifactPath.length > 4096) {
    throw new ProtocolValidationError(`${path}.path`, "must be a bounded path without NUL bytes");
  }
  return { path: artifactPath, digest: parseSha256Digest(record.digest, `${path}.digest`) };
}

export function strictRecord(
  value: unknown,
  path: string,
  allowedFields: readonly string[],
): Record<string, unknown> {
  if (!isUnknownRecord(value)) {
    throw new ProtocolValidationError(path, "must be an object");
  }
  const record = value;
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(record).filter((field) => !allowed.has(field)).sort();
  if (unknown.length > 0) {
    throw new ProtocolValidationError(path, `has unknown field: ${unknown.join(", ")}`);
  }
  return record;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProtocolValidationError(path, "must be a non-empty string");
  }
  return value;
}

export function safeInteger(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new ProtocolValidationError(path, `must be a safe integer greater than or equal to ${String(minimum)}`);
  }
  return value;
}

export function oneOf<const Values extends readonly string[]>(
  value: unknown,
  allowed: Values,
  path: string,
): Values[number] {
  if (typeof value !== "string") {
    throw new ProtocolValidationError(path, `must be one of ${allowed.join(", ")}`);
  }
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new ProtocolValidationError(path, `must be one of ${allowed.join(", ")}`);
  }
  return match;
}

export function stringArray(value: unknown, path: string, minimumLength = 0): string[] {
  if (!Array.isArray(value) || value.length < minimumLength) {
    throw new ProtocolValidationError(path, `must be an array with at least ${String(minimumLength)} item(s)`);
  }
  return value.map((entry, index) => requiredString(entry, `${path}[${String(index)}]`));
}

export function parseJsonValue(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ProtocolValidationError(path, "must contain only finite JSON numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => parseJsonValue(entry, `${path}[${String(index)}]`));
  if (typeof value === "object") {
    const parsed: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) parsed[key] = parseJsonValue(entry, `${path}.${key}`);
    return parsed;
  }
  throw new ProtocolValidationError(path, "must be a JSON value");
}

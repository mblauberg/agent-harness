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
export type IntegrationId = Identifier<"IntegrationId">;
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

declare const relativePathBrand: unique symbol;
export type CanonicalRelativePath = string & { readonly [relativePathBrand]: "CanonicalRelativePath" };

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[];

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type ArtifactRef = {
  path: CanonicalRelativePath;
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
const rfc3339Pattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

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
  if (typeof value !== "string") throw new ProtocolValidationError(path, "must be a strict RFC3339 timestamp");
  const match = rfc3339Pattern.exec(value);
  if (match === null || !Number.isFinite(Date.parse(value))) {
    throw new ProtocolValidationError(path, "must be a strict RFC3339 timestamp");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
    throw new ProtocolValidationError(path, "must be a strict RFC3339 timestamp");
  }
  // A runtime-validated wire primitive is branded at this single boundary.
  return value as Timestamp;
}

export const PATH_RESOLUTION_REQUIREMENT =
  "daemon-resolves-nearest-existing-ancestor-and-rejects-symlink-escape" as const;

export function parseCanonicalRelativePath(value: unknown, path: string): CanonicalRelativePath {
  const candidate = parseBoundedUtf8String(value, path, 4096);
  const segments = candidate.split("/");
  if (
    candidate.startsWith("/") ||
    /^[A-Za-z]:/u.test(candidate) ||
    candidate.includes("\\") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
    /[*?\[\]{}]/u.test(candidate) ||
    candidate.includes("\0")
  ) {
    throw new ProtocolValidationError(path, "must be a canonical workspace-relative path");
  }
  return candidate as CanonicalRelativePath;
}

export function parseBoundedUtf8String(value: unknown, path: string, maximumBytes: number): string {
  const candidate = requiredString(value, path);
  if (Buffer.byteLength(candidate, "utf8") > maximumBytes) {
    throw new ProtocolValidationError(path, `must be at most ${String(maximumBytes)} UTF-8 bytes`);
  }
  return candidate;
}

export function parseArtifactRef(value: unknown, path: string): ArtifactRef {
  const record = strictRecord(value, path, ["path", "digest"]);
  const artifactPath = parseCanonicalRelativePath(record.path, `${path}.path`);
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

export const JSON_VALUE_LIMITS = Object.freeze({
  maximumDepth: 64,
  maximumNodes: 4_096,
  maximumArrayItems: 256,
  maximumObjectProperties: 256,
  maximumPropertyNameBytes: 256,
  maximumStringBytes: 1_048_576,
});

type JsonWorkItem = {
  value: unknown;
  path: string;
  depth: number;
  assign(parsed: JsonValue): void;
};

export function parseJsonValue(value: unknown, path: string): JsonValue {
  let result: JsonValue | undefined;
  let assigned = false;
  let nodes = 0;
  const work: JsonWorkItem[] = [{
    value,
    path,
    depth: 0,
    assign: (parsed) => {
      result = parsed;
      assigned = true;
    },
  }];

  while (work.length > 0) {
    const current = work.pop();
    if (current === undefined) break;
    nodes += 1;
    if (nodes > JSON_VALUE_LIMITS.maximumNodes) {
      throw new ProtocolValidationError(path, `must contain at most ${String(JSON_VALUE_LIMITS.maximumNodes)} JSON nodes`);
    }
    if (current.value === null || typeof current.value === "boolean") {
      current.assign(current.value);
      continue;
    }
    if (typeof current.value === "string") {
      if (Buffer.byteLength(current.value, "utf8") > JSON_VALUE_LIMITS.maximumStringBytes) {
        throw new ProtocolValidationError(
          current.path,
          `must be at most ${String(JSON_VALUE_LIMITS.maximumStringBytes)} UTF-8 bytes`,
        );
      }
      current.assign(current.value);
      continue;
    }
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) {
        throw new ProtocolValidationError(current.path, "must contain only finite JSON numbers");
      }
      current.assign(current.value);
      continue;
    }
    if (current.depth >= JSON_VALUE_LIMITS.maximumDepth) {
      throw new ProtocolValidationError(
        current.path,
        `exceeds maximum JSON depth ${String(JSON_VALUE_LIMITS.maximumDepth)}`,
      );
    }
    if (Array.isArray(current.value)) {
      if (current.value.length > JSON_VALUE_LIMITS.maximumArrayItems) {
        throw new ProtocolValidationError(
          current.path,
          `must be an array with at most ${String(JSON_VALUE_LIMITS.maximumArrayItems)} items`,
        );
      }
      const parsed: JsonValue[] = new Array(current.value.length);
      current.assign(parsed);
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        work.push({
          value: current.value[index],
          path: `${current.path}[${String(index)}]`,
          depth: current.depth + 1,
          assign: (entry) => { parsed[index] = entry; },
        });
      }
      continue;
    }
    if (typeof current.value === "object") {
      const entries = Object.entries(current.value);
      if (entries.length > JSON_VALUE_LIMITS.maximumObjectProperties) {
        throw new ProtocolValidationError(
          current.path,
          `must be an object with at most ${String(JSON_VALUE_LIMITS.maximumObjectProperties)} properties`,
        );
      }
      const parsed: Record<string, JsonValue> = {};
      current.assign(parsed);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry === undefined) continue;
        const [key, child] = entry;
        if (Buffer.byteLength(key, "utf8") > JSON_VALUE_LIMITS.maximumPropertyNameBytes) {
          throw new ProtocolValidationError(
            `${current.path}.${key}`,
            `property name must be at most ${String(JSON_VALUE_LIMITS.maximumPropertyNameBytes)} UTF-8 bytes`,
          );
        }
        work.push({
          value: child,
          path: `${current.path}.${key}`,
          depth: current.depth + 1,
          assign: (entryValue) => {
            Object.defineProperty(parsed, key, {
              value: entryValue,
              enumerable: true,
              configurable: true,
              writable: true,
            });
          },
        });
      }
      continue;
    }
    throw new ProtocolValidationError(current.path, "must be a JSON value");
  }

  if (!assigned || result === undefined) throw new ProtocolValidationError(path, "must be a JSON value");
  return result;
}

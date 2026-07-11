import { createHash } from "node:crypto";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

export function canonicaliseJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicaliseJson);
  if (typeof value !== "object" || value === null) return value;
  const result: { [key: string]: JsonValue } = {};
  for (const key of Object.keys(value).sort()) {
    const member = value[key];
    if (member === undefined) throw new TypeError("canonical JSON cannot contain undefined");
    result[key] = canonicaliseJson(member);
  }
  return result;
}

export function fabricReceiptStateHash(receipt: { [key: string]: JsonValue }): string {
  const committedState = { ...receipt };
  delete committedState.stateHash;
  return createHash("sha256").update(JSON.stringify(canonicaliseJson(committedState))).digest("hex");
}

export function canonicalFabricReceipt(committedState: { [key: string]: JsonValue }): { [key: string]: JsonValue } {
  const canonicalState = canonicaliseJson(committedState);
  if (typeof canonicalState !== "object" || canonicalState === null || Array.isArray(canonicalState)) {
    throw new TypeError("fabric receipt state must be an object");
  }
  const receipt = canonicaliseJson({ ...canonicalState, stateHash: fabricReceiptStateHash(canonicalState) });
  if (typeof receipt !== "object" || receipt === null || Array.isArray(receipt)) {
    throw new TypeError("canonical fabric receipt must be an object");
  }
  return receipt;
}

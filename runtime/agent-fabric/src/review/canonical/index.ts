export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | Readonly<{ [key: string]: CanonicalJson }>;

export type Sha256Digest = `sha256:${string}`;

function assertValidString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError("canonical JSON string contains an unpaired surrogate");
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError("canonical JSON string contains an unpaired surrogate");
    }
  }
}

function encodeCanonical(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON numbers must be finite");
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    assertValidString(value);
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    if (value === undefined) throw new TypeError("canonical JSON cannot contain undefined");
    throw new TypeError(`unsupported canonical JSON value: ${typeof value}`);
  }
  if (ancestors.has(value)) throw new TypeError("canonical JSON cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const members: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new TypeError("canonical JSON arrays cannot be sparse");
        members.push(encodeCanonical(value[index], ancestors));
      }
      return `[${members.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("canonical JSON objects must be plain objects");
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      throw new TypeError("canonical JSON objects cannot contain symbol keys");
    }
    const members: string[] = [];
    for (const key of Object.keys(value).sort()) {
      assertValidString(key);
      const member = (value as Record<string, unknown>)[key];
      if (member === undefined) throw new TypeError("canonical JSON cannot contain undefined");
      members.push(`${JSON.stringify(key)}:${encodeCanonical(member, ancestors)}`);
    }
    return `{${members.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalString(value: unknown): string {
  return encodeCanonical(value, new Set<object>());
}

export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalString(value));
}

export function sha256Digest(bytes: string | Uint8Array): Sha256Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function digestCanonical(value: unknown): Sha256Digest {
  return sha256Digest(canonicalBytes(value));
}

export function canonicalWithout(
  value: Readonly<Record<string, unknown>>,
  omittedKeys: readonly string[],
): string {
  if (new Set(omittedKeys).size !== omittedKeys.length) {
    throw new TypeError("digest preimage omission keys must be unique");
  }
  for (const key of omittedKeys) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`missing digest preimage field: ${key}`);
  }
  return canonicalString(Object.fromEntries(
    Object.entries(value).filter(([key]) => !omittedKeys.includes(key)),
  ));
}
import { createHash } from "node:crypto";

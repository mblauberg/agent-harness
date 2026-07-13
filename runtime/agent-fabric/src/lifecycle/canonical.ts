import { createHash } from "node:crypto";

import type { LifecycleDigest } from "./types.js";

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (value === null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const item = source[key];
    if (item !== undefined) result[key] = canonicalValue(item);
  }
  return result;
}

export function canonicalJson(value: unknown): string {
  const encoded = JSON.stringify(canonicalValue(value));
  if (encoded === undefined) throw new TypeError("value is not canonical JSON");
  return encoded;
}

export function lifecycleDigest(value: unknown): LifecycleDigest {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

import { createHash } from "node:crypto";

import { parseAuthorityEnvelopeV2, type AuthorityEnvelopeV2 } from "@local/agent-fabric-protocol";

type StoredAuthorityRecord = Readonly<{
  authority_json?: unknown;
  authority_hash?: unknown;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new TypeError("value is not JSON-compatible");
}

export function readStoredAuthority(record: StoredAuthorityRecord, label = "stored authority"): AuthorityEnvelopeV2 {
  const serialised = record.authority_json;
  const expectedHash = record.authority_hash;
  if (typeof serialised !== "string" || typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/u.test(expectedHash)) {
    throw new Error(`${label} is invalid`);
  }
  let value: unknown;
  let canonical: string;
  try {
    value = JSON.parse(serialised) as unknown;
    canonical = canonicalJson(value);
  } catch (cause: unknown) {
    throw new Error(`${label} is invalid`, { cause });
  }
  const actualHash = createHash("sha256").update(canonical).digest("hex");
  if (actualHash !== expectedHash) throw new Error(`${label} hash does not match canonical JSON`);
  try {
    return parseAuthorityEnvelopeV2(value, label);
  } catch (cause: unknown) {
    throw new Error(`${label} is invalid`, { cause });
  }
}

import { Buffer } from "node:buffer";

import {
  arrayOf,
  boundedString,
  defineCodec,
  enumeration,
  integer,
  literal,
  nullable,
  objectCodec,
  parserBacked,
  sha256,
  unionOf,
} from "./codec.js";

const nonnegative = integer();
const positive = integer({ minimum: 1 });
const portalRequestIdCodec = unionOf([
  integer({ maximum: 2_147_483_647 }),
  boundedString({
    minBytes: 1,
    maxBytes: 64,
    pattern: "^[A-Za-z0-9._:-]{1,64}$",
    example: "request_01",
  }),
]);
const base64 = boundedString({
  minBytes: 0,
  maxBytes: 87_384,
  pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
  example: "YQ==",
});
export const REVIEW_BUNDLE_MEDIA_TYPE_V1_CODEC = enumeration([
  "application/octet-stream",
  "application/vnd.agent-fabric.review-bundle-root.v1+json",
  "application/vnd.agent-fabric.review-bundle-body.v1+json",
  "application/vnd.agent-fabric.review-diff.v1+json",
  "application/vnd.agent-fabric.review-finding-page.v1+json",
  "application/vnd.agent-fabric.review-finding-set.v1+json",
]);
const nonRootReadKind = enumeration(["manifest-body-page", "object", "chunk"]);
const readCommon = {
  schemaVersion: literal(1),
  bundleDigest: sha256,
  payloadDigest: sha256,
} as const;
export const REVIEW_BUNDLE_READ_ARGS_V1_CODEC = unionOf([
  objectCodec({ ...readCommon, kind: literal("manifest-root"), parentDigest: literal(null), ordinal: literal(0) }),
  objectCodec({ ...readCommon, kind: nonRootReadKind, parentDigest: sha256, ordinal: nonnegative }),
]);
const readResultCommon = {
  schemaVersion: literal(1),
  bundleDigest: sha256,
  payloadDigest: sha256,
  offset: nonnegative,
  rawByteLength: integer({ maximum: 65_536 }),
  mediaType: REVIEW_BUNDLE_MEDIA_TYPE_V1_CODEC,
  encoding: literal("base64"),
  payload: base64,
  resultDigest: sha256,
} as const;
const reviewBundleReadResultBaseCodec = unionOf([
  objectCodec({ ...readResultCommon, kind: literal("manifest-root"), parentDigest: literal(null), ordinal: literal(0) }),
  objectCodec({ ...readResultCommon, kind: nonRootReadKind, parentDigest: sha256, ordinal: nonnegative }),
]);

function decodedBase64Bytes(value: string): number {
  return Buffer.from(value, "base64").byteLength;
}

export const REVIEW_BUNDLE_READ_RESULT_V1_CODEC = defineCodec(
  { ...reviewBundleReadResultBaseCodec.schema, "x-base64LengthMatches": true },
  { ...reviewBundleReadResultBaseCodec.example, rawByteLength: 1, payload: "YQ==" },
  (input, path) => {
    const value = reviewBundleReadResultBaseCodec.parse(input, path) as Readonly<Record<string, unknown>>;
    if (decodedBase64Bytes(String(value.payload)) !== value.rawByteLength) {
      throw new TypeError(`${path}.rawByteLength must equal decoded payload length`);
    }
    return value;
  },
);
export const REVIEW_BUNDLE_SEARCH_ARGS_V1_CODEC = objectCodec({
  schemaVersion: literal(1),
  bundleDigest: sha256,
  queryKind: enumeration(["literal", "token"]),
  query: boundedString({ maxBytes: 256, example: "query" }),
  maximumResults: integer({ minimum: 1, maximum: 100 }),
});
const searchEntryBaseCodec = objectCodec({
  objectDigest: sha256,
  offset: nonnegative,
  rawByteLength: positive,
  encoding: literal("base64"),
  snippet: base64,
});
const searchEntryCodec = parserBacked(
  searchEntryBaseCodec,
  (value, path) => {
    const record = value as Readonly<Record<string, unknown>>;
    const length = decodedBase64Bytes(String(record.snippet));
    if (length !== record.rawByteLength) throw new TypeError(`${path}.rawByteLength must equal decoded snippet length`);
    if (length > 65_536) throw new TypeError(`${path}.snippet decoded length must be at most 65,536 bytes`);
    return record;
  },
  searchEntryBaseCodec.example,
);
const reviewBundleSearchResultBaseCodec = objectCodec({
  schemaVersion: literal(1),
  bundleDigest: sha256,
  entries: arrayOf(searchEntryCodec, { maximum: 100, unique: true }),
  resultDigest: sha256,
});

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function searchEntryKey(entry: Readonly<Record<string, unknown>>): string {
  return `${String(entry.objectDigest)}\u0000${String(entry.offset).padStart(16, "0")}\u0000${String(entry.rawByteLength).padStart(16, "0")}`;
}

export const REVIEW_BUNDLE_SEARCH_RESULT_V1_CODEC = defineCodec(
  {
    ...reviewBundleSearchResultBaseCodec.schema,
    "x-maxCanonicalJsonBytes": 65_536,
    "x-searchEntriesCanonical": true,
  },
  reviewBundleSearchResultBaseCodec.example,
  (input, path) => {
    const value = reviewBundleSearchResultBaseCodec.parse(input, path) as Readonly<Record<string, unknown>>;
    const entries = value.entries as readonly Readonly<Record<string, unknown>>[];
    for (let index = 1; index < entries.length; index += 1) {
      const previous = entries[index - 1];
      const current = entries[index];
      if (previous === undefined || current === undefined || searchEntryKey(previous) >= searchEntryKey(current)) {
        throw new TypeError(`${path}.entries must use deterministic objectDigest/offset/rawByteLength order`);
      }
    }
    if (Buffer.byteLength(canonicalJson(value), "utf8") > 65_536) {
      throw new TypeError(`${path} canonical result must be at most 65,536 bytes`);
    }
    return value;
  },
);
export const REVIEW_BUNDLE_PORTAL_ERROR_V1_CODEC = objectCodec({
  schemaVersion: literal(1),
  code: enumeration(["INVALID_REQUEST", "UNAUTHENTICATED", "BUNDLE_MISMATCH", "NOT_LISTED", "CROSS_BUNDLE", "BUDGET_EXHAUSTED", "RESULT_TOO_LARGE", "INTEGRITY_FAILURE"]),
  evidenceDigest: nullable(sha256),
});

export const REVIEW_PORTAL_REQUEST_V1_CODEC = unionOf([
  objectCodec({
    jsonrpc: literal("2.0"),
    id: portalRequestIdCodec,
    method: literal("tools/call"),
    params: objectCodec({ name: literal("review_bundle_read"), arguments: REVIEW_BUNDLE_READ_ARGS_V1_CODEC }),
  }),
  objectCodec({
    jsonrpc: literal("2.0"),
    id: portalRequestIdCodec,
    method: literal("tools/call"),
    params: objectCodec({ name: literal("review_bundle_search"), arguments: REVIEW_BUNDLE_SEARCH_ARGS_V1_CODEC }),
  }),
]);

const reviewPortalResponseBaseCodec = unionOf([
  objectCodec({ jsonrpc: literal("2.0"), id: portalRequestIdCodec, result: REVIEW_BUNDLE_READ_RESULT_V1_CODEC }),
  objectCodec({ jsonrpc: literal("2.0"), id: portalRequestIdCodec, result: REVIEW_BUNDLE_SEARCH_RESULT_V1_CODEC }),
  objectCodec({ jsonrpc: literal("2.0"), id: portalRequestIdCodec, error: REVIEW_BUNDLE_PORTAL_ERROR_V1_CODEC }),
]);

function reviewPortalResponseLimit(value: Readonly<Record<string, unknown>>): number {
  const result = value.result as Readonly<Record<string, unknown>> | undefined;
  return result !== undefined && Array.isArray(result.entries) ? 65_536 : 98_304;
}

export const REVIEW_PORTAL_RESPONSE_V1_CODEC = parserBacked(
  defineCodec(
    { ...reviewPortalResponseBaseCodec.schema, "x-reviewPortalResponseBound": true },
    reviewPortalResponseBaseCodec.example,
    (input, path) => reviewPortalResponseBaseCodec.parse(input, path),
  ),
  (value, path) => {
    const record = value as Readonly<Record<string, unknown>>;
    const bytes = Buffer.byteLength(`${canonicalJson(record)}\n`, "utf8");
    const limit = reviewPortalResponseLimit(record);
    if (bytes > limit) throw new TypeError(`${path} canonical portal response must be at most ${String(limit)} bytes`);
    return record;
  },
  reviewPortalResponseBaseCodec.example,
);

type JsonCursor = { source: string; index: number };

function skipJsonWhitespace(cursor: JsonCursor): void {
  while (/\s/u.test(cursor.source[cursor.index] ?? "")) cursor.index += 1;
}

function parseJsonString(cursor: JsonCursor): string {
  const start = cursor.index;
  if (cursor.source[cursor.index] !== '"') throw new TypeError("portal JSON object key must be a string");
  cursor.index += 1;
  while (cursor.index < cursor.source.length) {
    const current = cursor.source[cursor.index];
    if (current === '"') {
      cursor.index += 1;
      return JSON.parse(cursor.source.slice(start, cursor.index)) as string;
    }
    if (current === "\\") {
      cursor.index += 2;
      continue;
    }
    cursor.index += 1;
  }
  throw new TypeError("portal JSON contains an unterminated string");
}

function parseJsonValue(cursor: JsonCursor): unknown {
  skipJsonWhitespace(cursor);
  const current = cursor.source[cursor.index];
  if (current === '"') return parseJsonString(cursor);
  if (current === "{") {
    cursor.index += 1;
    const value: Record<string, unknown> = {};
    const keys = new Set<string>();
    skipJsonWhitespace(cursor);
    if (cursor.source[cursor.index] === "}") {
      cursor.index += 1;
      return value;
    }
    while (true) {
      skipJsonWhitespace(cursor);
      const key = parseJsonString(cursor);
      if (keys.has(key)) throw new TypeError(`portal JSON contains duplicate key ${key}`);
      keys.add(key);
      skipJsonWhitespace(cursor);
      if (cursor.source[cursor.index] !== ":") throw new TypeError("portal JSON object key must be followed by colon");
      cursor.index += 1;
      value[key] = parseJsonValue(cursor);
      skipJsonWhitespace(cursor);
      const separator = cursor.source[cursor.index];
      if (separator === "}") {
        cursor.index += 1;
        return value;
      }
      if (separator !== ",") throw new TypeError("portal JSON object entries must be comma-separated");
      cursor.index += 1;
    }
  }
  if (current === "[") {
    cursor.index += 1;
    const value: unknown[] = [];
    skipJsonWhitespace(cursor);
    if (cursor.source[cursor.index] === "]") {
      cursor.index += 1;
      return value;
    }
    while (true) {
      value.push(parseJsonValue(cursor));
      skipJsonWhitespace(cursor);
      const separator = cursor.source[cursor.index];
      if (separator === "]") {
        cursor.index += 1;
        return value;
      }
      if (separator !== ",") throw new TypeError("portal JSON array entries must be comma-separated");
      cursor.index += 1;
    }
  }
  const remainder = cursor.source.slice(cursor.index);
  const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(remainder)?.[0];
  if (token === undefined) throw new TypeError("portal JSON contains an invalid value");
  cursor.index += token.length;
  return JSON.parse(token) as unknown;
}

function parseDuplicateFreeJsonObject(source: string): Readonly<Record<string, unknown>> {
  const cursor: JsonCursor = { source, index: 0 };
  const value = parseJsonValue(cursor);
  skipJsonWhitespace(cursor);
  if (cursor.index !== source.length) throw new TypeError("portal request contains trailing JSON bytes");
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("portal request must contain exactly one JSON object; batches are forbidden");
  }
  return value as Readonly<Record<string, unknown>>;
}

export function parseReviewPortalRequestBytes(input: Uint8Array): unknown {
  const bytes = Buffer.from(input);
  if (bytes.length === 0 || bytes[bytes.length - 1] !== 0x0a) {
    throw new TypeError("portal request must end with exactly one LF");
  }
  const body = bytes.subarray(0, -1);
  if (body.includes(0x0a) || body.includes(0x0d)) throw new TypeError("portal request forbids CRLF and embedded framing bytes");
  const source = new TextDecoder("utf-8", { fatal: true }).decode(body);
  if (source.startsWith("\uFEFF")) throw new TypeError("portal request forbids UTF-8 BOM");
  return REVIEW_PORTAL_REQUEST_V1_CODEC.parse(parseDuplicateFreeJsonObject(source), "portalRequest");
}

export function encodeReviewPortalResponse(input: unknown): Buffer {
  const response = REVIEW_PORTAL_RESPONSE_V1_CODEC.parse(input, "portalResponse");
  return Buffer.from(`${canonicalJson(response)}\n`, "utf8");
}

export const REVIEW_BUNDLE_PORTAL_DESCRIPTOR_V1 = Object.freeze({
  serverName: "agent-fabric-review-bundle",
  tools: Object.freeze(["review_bundle_read", "review_bundle_search"]),
  resources: Object.freeze([]),
  resourceTemplates: Object.freeze([]),
  prompts: Object.freeze([]),
});

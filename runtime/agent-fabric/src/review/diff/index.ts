import {
  canonicalString,
  digestCanonical,
  sha256Digest,
  type Sha256Digest,
} from "../canonical/index.js";

export type GitMode = "100644" | "100755" | "120000" | "160000";

export const REVIEW_DIFF_LIMITS = {
  maximumObjectBytes: 16 * 1_024 * 1_024,
  maximumMyersLines: 100_000,
  maximumMyersCombinedLines: 20_000,
  maximumMyersLineProduct: 16_000_000,
  maximumMyersEditDistance: 512,
  maximumMyersTraceCells: 250_000,
} as const;

export interface ReviewTreeEntry {
  path: string;
  mode: GitMode;
  bytes: Uint8Array;
}

export interface ReviewDiffFileRecord {
  ordinal: number;
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "mode-changed";
  oldPath: string | null;
  beforeMode: GitMode | null;
  afterMode: GitMode | null;
  beforeObjectDigest: Sha256Digest | null;
  afterObjectDigest: Sha256Digest | null;
  diffObjectDigest: Sha256Digest;
  diffObject: Readonly<Record<string, unknown>>;
}

export interface ReviewDiffSet {
  schemaVersion: 1;
  objectFormat: "sha1" | "sha256";
  baseObjectId: string;
  headObjectId: string;
  codecDigest: Sha256Digest;
  rulesDigest: Sha256Digest;
  entries: readonly ReviewDiffFileRecord[];
  reviewDiffSetDigest: Sha256Digest;
}

type DiffStatus = ReviewDiffFileRecord["status"];
type LineEditKind = "equal" | "delete" | "insert";

interface LineEdit {
  kind: LineEditKind;
  line: Uint8Array;
}

const MODE_SET = new Set<GitMode>(["100644", "100755", "120000", "160000"]);
const STATUS_RANK: Readonly<Record<DiffStatus, number>> = {
  added: 0,
  modified: 1,
  deleted: 2,
  renamed: 3,
  "mode-changed": 4,
};

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function validatePath(path: string): void {
  if (path.length === 0 || path.startsWith("/") || path.endsWith("/")) {
    throw new TypeError(`invalid review-diff path: ${path}`);
  }
  const encoded = Buffer.from(path, "utf8");
  if (encoded.toString("utf8") !== path || encoded.includes(0)) {
    throw new TypeError(`invalid review-diff path encoding: ${path}`);
  }
  for (const unit of encoded) {
    if (unit < 0x20 || (unit >= 0x7f && unit <= 0x9f)) {
      throw new TypeError(`invalid review-diff path control byte: ${path}`);
    }
  }
  if (path.split("/").some((component) => component === "" || component === "." || component === "..")) {
    throw new TypeError(`invalid review-diff path component: ${path}`);
  }
}

function validateObjectId(format: "sha1" | "sha256", value: string): void {
  const length = format === "sha1" ? 40 : 64;
  if (!new RegExp(`^[0-9a-f]{${length}}$`, "u").test(value)) {
    throw new TypeError(`invalid full ${format} object id`);
  }
}

function validateEntries(entries: readonly ReviewTreeEntry[]): Map<string, ReviewTreeEntry> {
  const result = new Map<string, ReviewTreeEntry>();
  for (const value of entries) {
    validatePath(value.path);
    if (!MODE_SET.has(value.mode)) throw new TypeError(`invalid Git mode: ${value.mode}`);
    if (!(value.bytes instanceof Uint8Array)) throw new TypeError("review tree bytes must be Uint8Array");
    if (value.bytes.byteLength > REVIEW_DIFF_LIMITS.maximumObjectBytes) throw new RangeError("review-diff object byte limit exceeded");
    if (result.has(value.path)) throw new TypeError(`duplicate review tree path: ${value.path}`);
    result.set(value.path, value);
  }
  return result;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && Buffer.from(left).equals(Buffer.from(right));
}

function splitTextLines(entryValue: ReviewTreeEntry | null): Uint8Array[] | null {
  if (entryValue === null) return [];
  if (entryValue.mode !== "100644" && entryValue.mode !== "100755") return null;
  if (entryValue.bytes.includes(0)) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(entryValue.bytes);
  } catch {
    return null;
  }
  const lines: Uint8Array[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n") continue;
    lines.push(new TextEncoder().encode(text.slice(start, index + 1)));
    start = index + 1;
  }
  if (start < text.length) lines.push(new TextEncoder().encode(text.slice(start)));
  if (lines.length > REVIEW_DIFF_LIMITS.maximumMyersLines) throw new RangeError("review-diff text resource limit exceeded");
  return lines;
}

function myersEdits(before: readonly Uint8Array[], after: readonly Uint8Array[]): LineEdit[] {
  const equals = (left: Uint8Array, right: Uint8Array): boolean => bytesEqual(left, right);
  const maximum = before.length + after.length;
  let frontier = new Map<number, number>([[1, 0]]);
  const trace: Array<Map<number, number>> = [];
  let traceCells = 0;

  for (let distance = 0; distance <= maximum; distance += 1) {
    if (distance > REVIEW_DIFF_LIMITS.maximumMyersEditDistance) throw new RangeError("review-diff text resource limit exceeded");
    trace.push(new Map(frontier));
    traceCells += frontier.size;
    if (traceCells > REVIEW_DIFF_LIMITS.maximumMyersTraceCells) throw new RangeError("review-diff text resource limit exceeded");
    const next = new Map<number, number>();
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down = frontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY;
      const right = (frontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY) + 1;
      let x = diagonal === -distance || (diagonal !== distance && right <= down) ? down : right;
      if (!Number.isFinite(x)) x = 0;
      let y = x - diagonal;
      while (x < before.length && y < after.length && equals(before[x]!, after[y]!)) {
        x += 1;
        y += 1;
      }
      next.set(diagonal, x);
      if (x >= before.length && y >= after.length) {
        const reversed: LineEdit[] = [];
        let backX = before.length;
        let backY = after.length;
        for (let d = distance; d >= 0; d -= 1) {
          const prior = trace[d]!;
          const k = backX - backY;
          const priorDown = prior.get(k + 1) ?? Number.NEGATIVE_INFINITY;
          const priorRight = (prior.get(k - 1) ?? Number.NEGATIVE_INFINITY) + 1;
          const previousK = k === -d || (k !== d && priorRight <= priorDown) ? k + 1 : k - 1;
          const previousX = prior.get(previousK) ?? 0;
          const previousY = previousX - previousK;
          while (backX > previousX && backY > previousY) {
            reversed.push({ kind: "equal", line: before[backX - 1]! });
            backX -= 1;
            backY -= 1;
          }
          if (d === 0) break;
          if (backX === previousX) {
            reversed.push({ kind: "insert", line: after[backY - 1]! });
            backY -= 1;
          } else {
            reversed.push({ kind: "delete", line: before[backX - 1]! });
            backX -= 1;
          }
        }
        return reversed.reverse();
      }
    }
    frontier = next;
  }
  throw new Error("Myers diff failed to terminate");
}

function textPayload(before: readonly Uint8Array[], after: readonly Uint8Array[]): Readonly<Record<string, unknown>> {
  const edits = myersEdits(before, after);
  const operations: Array<{
    kind: LineEditKind;
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    segmentDigest: Sha256Digest;
  }> = [];
  let oldIndex = 0;
  let newIndex = 0;
  for (let cursor = 0; cursor < edits.length;) {
    const kind = edits[cursor]!.kind;
    const startOld = oldIndex;
    const startNew = newIndex;
    const chunks: Uint8Array[] = [];
    while (cursor < edits.length && edits[cursor]!.kind === kind) {
      const edit = edits[cursor]!;
      chunks.push(edit.line);
      if (kind !== "insert") oldIndex += 1;
      if (kind !== "delete") newIndex += 1;
      cursor += 1;
    }
    const segment = Buffer.concat(chunks.map((value) => Buffer.from(value)));
    operations.push({
      kind,
      oldStart: startOld,
      oldCount: oldIndex - startOld,
      newStart: startNew,
      newCount: newIndex - startNew,
      segmentDigest: sha256Digest(segment),
    });
  }
  return { kind: "text-edits", operations };
}

function objectSummary(value: ReviewTreeEntry | null): Readonly<Record<string, unknown>> | null {
  return value === null ? null : {
    mode: value.mode,
    objectDigest: sha256Digest(value.bytes),
    byteLength: value.bytes.byteLength,
  };
}

function buildDiffObject(
  status: DiffStatus,
  path: string,
  oldPath: string | null,
  before: ReviewTreeEntry | null,
  after: ReviewTreeEntry | null,
): Readonly<Record<string, unknown>> {
  const beforeLines = splitTextLines(before);
  const afterLines = splitTextLines(after);
  const text = beforeLines !== null && afterLines !== null;
  if (text && (beforeLines.length + afterLines.length > REVIEW_DIFF_LIMITS.maximumMyersCombinedLines
    || beforeLines.length * afterLines.length > REVIEW_DIFF_LIMITS.maximumMyersLineProduct)) {
    throw new RangeError("review-diff text resource limit exceeded");
  }
  const payload = text ? textPayload(beforeLines, afterLines) : {
        kind: "binary-summary",
        beforeDigest: before === null ? null : sha256Digest(before.bytes),
        afterDigest: after === null ? null : sha256Digest(after.bytes),
        beforeBytes: before?.bytes.byteLength ?? null,
        afterBytes: after?.bytes.byteLength ?? null,
      };
  return {
    schemaVersion: 1,
    status,
    path,
    oldPath,
    before: objectSummary(before),
    after: objectSummary(after),
    payload,
  };
}

function compareRecords(left: ReviewDiffFileRecord, right: ReviewDiffFileRecord): number {
  const pathOrder = compareUtf8(left.path, right.path);
  if (pathOrder !== 0) return pathOrder;
  const statusOrder = STATUS_RANK[left.status] - STATUS_RANK[right.status];
  if (statusOrder !== 0) return statusOrder;
  if (left.oldPath === right.oldPath) return 0;
  if (left.oldPath === null) return -1;
  if (right.oldPath === null) return 1;
  return compareUtf8(left.oldPath, right.oldPath);
}

function record(
  status: DiffStatus,
  path: string,
  oldPath: string | null,
  before: ReviewTreeEntry | null,
  after: ReviewTreeEntry | null,
): ReviewDiffFileRecord {
  const diffObject = buildDiffObject(status, path, oldPath, before, after);
  return {
    ordinal: -1,
    path,
    status,
    oldPath,
    beforeMode: before?.mode ?? null,
    afterMode: after?.mode ?? null,
    beforeObjectDigest: before === null ? null : sha256Digest(before.bytes),
    afterObjectDigest: after === null ? null : sha256Digest(after.bytes),
    diffObjectDigest: digestCanonical(diffObject),
    diffObject,
  };
}

export function buildReviewDiffSet(input: Readonly<{
  objectFormat: "sha1" | "sha256";
  baseObjectId: string;
  headObjectId: string;
  codecDigest: Sha256Digest;
  rulesDigest: Sha256Digest;
  before: readonly ReviewTreeEntry[];
  after: readonly ReviewTreeEntry[];
}>): ReviewDiffSet {
  validateObjectId(input.objectFormat, input.baseObjectId);
  validateObjectId(input.objectFormat, input.headObjectId);
  const before = validateEntries(input.before);
  const after = validateEntries(input.after);
  const records: ReviewDiffFileRecord[] = [];
  const deleted = new Map<string, ReviewTreeEntry>();
  const added = new Map<string, ReviewTreeEntry>();

  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const prior = before.get(path) ?? null;
    const current = after.get(path) ?? null;
    if (prior !== null && current !== null) {
      if (prior.mode === current.mode && bytesEqual(prior.bytes, current.bytes)) continue;
      records.push(record(bytesEqual(prior.bytes, current.bytes) ? "mode-changed" : "modified", path, null, prior, current));
    } else if (prior !== null) {
      deleted.set(path, prior);
    } else if (current !== null) {
      added.set(path, current);
    }
  }

  const digests = new Set([...deleted.values(), ...added.values()].map((value) => sha256Digest(value.bytes)));
  for (const digest of [...digests].sort()) {
    const oldEntries = [...deleted.values()]
      .filter((value) => sha256Digest(value.bytes) === digest)
      .sort((left, right) => compareUtf8(left.path, right.path));
    const newEntries = [...added.values()]
      .filter((value) => sha256Digest(value.bytes) === digest)
      .sort((left, right) => compareUtf8(left.path, right.path));
    const pairCount = Math.min(oldEntries.length, newEntries.length);
    for (let index = 0; index < pairCount; index += 1) {
      const prior = oldEntries[index]!;
      const current = newEntries[index]!;
      if (!bytesEqual(prior.bytes, current.bytes)) continue;
      records.push(record("renamed", current.path, prior.path, prior, current));
      deleted.delete(prior.path);
      added.delete(current.path);
    }
  }

  for (const value of deleted.values()) records.push(record("deleted", value.path, null, value, null));
  for (const value of added.values()) records.push(record("added", value.path, null, null, value));
  records.sort(compareRecords);
  const entries = records.map((value, ordinal) => ({ ...value, ordinal }));
  const withoutDigest = {
    schemaVersion: 1 as const,
    objectFormat: input.objectFormat,
    baseObjectId: input.baseObjectId,
    headObjectId: input.headObjectId,
    codecDigest: input.codecDigest,
    rulesDigest: input.rulesDigest,
    entries,
  };
  const result: ReviewDiffSet = { ...withoutDigest, reviewDiffSetDigest: digestCanonical(withoutDigest) };
  verifyReviewDiffSet(result);
  return result;
}

export function verifyReviewDiffSet(value: ReviewDiffSet): void {
  validateObjectId(value.objectFormat, value.baseObjectId);
  validateObjectId(value.objectFormat, value.headObjectId);
  for (let index = 0; index < value.entries.length; index += 1) {
    const current = value.entries[index]!;
    if (current.ordinal !== index) throw new TypeError("review-diff entry ordinal/order mismatch");
    validatePath(current.path);
    if (current.oldPath !== null) validatePath(current.oldPath);
    if (index > 0 && compareRecords(value.entries[index - 1]!, current) >= 0) {
      throw new TypeError("review-diff entry order is not strict");
    }
    if (digestCanonical(current.diffObject) !== current.diffObjectDigest) {
      throw new TypeError("review-diff object digest mismatch");
    }
  }
  const { reviewDiffSetDigest: _digest, ...withoutDigest } = value;
  if (digestCanonical(withoutDigest) !== value.reviewDiffSetDigest) {
    throw new TypeError("review-diff set digest mismatch");
  }
  canonicalString(withoutDigest);
}

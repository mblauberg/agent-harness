import { describe, expect, it } from "vitest";

import { sha256Digest } from "../../../src/review/canonical/index.ts";
import {
  buildReviewDiffSet,
  REVIEW_DIFF_LIMITS,
  verifyReviewDiffSet,
  type ReviewTreeEntry,
} from "../../../src/review/diff/index.ts";

const bytes = (value: string | readonly number[]): Uint8Array =>
  typeof value === "string" ? new TextEncoder().encode(value) : Uint8Array.from(value);

const entry = (path: string, mode: ReviewTreeEntry["mode"], value: string | readonly number[]): ReviewTreeEntry => ({
  path,
  mode,
  bytes: bytes(value),
});

const input = {
  objectFormat: "sha1" as const,
  baseObjectId: "1".repeat(40),
  headObjectId: "2".repeat(40),
  codecDigest: sha256Digest("review-diff-codec"),
  rulesDigest: sha256Digest("review-diff-rules"),
};

describe("review-diff.v1", () => {
  it("covers exact rename, copy-as-add, text, binary, mode, type and submodule changes deterministically", () => {
    const shared = "same bytes\n";
    const before = [
      entry("rename-old-a.txt", "100644", shared),
      entry("rename-old-b.txt", "100644", shared),
      entry("copy-source.txt", "100644", "copy\n"),
      entry("text.txt", "100644", "one\ntwo\n"),
      entry("mode.sh", "100644", "echo ok\n"),
      entry("binary.bin", "100644", [0, 1, 2]),
      entry("type", "120000", "target"),
      entry("submodule", "160000", "a".repeat(40)),
      entry("deleted.txt", "100644", "gone\n"),
    ];
    const after = [
      entry("rename-new-a.txt", "100644", shared),
      entry("rename-new-b.txt", "100755", shared),
      entry("copy-source.txt", "100644", "copy\n"),
      entry("copy-added.txt", "100644", "copy\n"),
      entry("text.txt", "100644", "one\nthree\n"),
      entry("mode.sh", "100755", "echo ok\n"),
      entry("binary.bin", "100644", [0, 1, 3]),
      entry("type", "100644", "not a link\n"),
      entry("submodule", "160000", "b".repeat(40)),
      entry("added.txt", "100644", "new\n"),
    ];

    const result = buildReviewDiffSet({ ...input, before, after });
    const permuted = buildReviewDiffSet({ ...input, before: [...before].reverse(), after: [...after].reverse() });

    expect(permuted).toStrictEqual(result);
    expect(result.entries.map(({ path, status, oldPath }) => ({ path, status, oldPath }))).toStrictEqual([
      { path: "added.txt", status: "added", oldPath: null },
      { path: "binary.bin", status: "modified", oldPath: null },
      { path: "copy-added.txt", status: "added", oldPath: null },
      { path: "deleted.txt", status: "deleted", oldPath: null },
      { path: "mode.sh", status: "mode-changed", oldPath: null },
      { path: "rename-new-a.txt", status: "renamed", oldPath: "rename-old-a.txt" },
      { path: "rename-new-b.txt", status: "renamed", oldPath: "rename-old-b.txt" },
      { path: "submodule", status: "modified", oldPath: null },
      { path: "text.txt", status: "modified", oldPath: null },
      { path: "type", status: "modified", oldPath: null },
    ]);
    expect(result.entries.find((value) => value.path === "text.txt")?.diffObject.payload).toMatchObject({
      kind: "text-edits",
    });
    expect(result.entries.find((value) => value.path === "binary.bin")?.diffObject.payload).toMatchObject({
      kind: "binary-summary",
    });
    expect(result.entries.find((value) => value.path === "submodule")?.diffObject.payload).toMatchObject({
      kind: "binary-summary",
    });
    expect(() => verifyReviewDiffSet(result)).not.toThrow();
    expect(() => verifyReviewDiffSet({ ...result, entries: [...result.entries].reverse() })).toThrow(/order/u);
  });

  it("handles two empty committed trees and rejects non-full object IDs or unsafe paths", () => {
    const empty = buildReviewDiffSet({ ...input, before: [], after: [] });
    expect(empty.entries).toStrictEqual([]);
    expect(() => buildReviewDiffSet({ ...input, baseObjectId: "1234", before: [], after: [] })).toThrow(/object id/u);
    expect(() => buildReviewDiffSet({
      ...input,
      before: [],
      after: [entry("bad/../path", "100644", "bad")],
    })).toThrow(/path/u);
  });

  it("uses the specified delete-before-insert Myers tie break", () => {
    const result = buildReviewDiffSet({ ...input,
      before: [entry("tie.txt", "100644", "old\n")],
      after: [entry("tie.txt", "100644", "new\n")] });
    expect((result.entries[0]?.diffObject.payload as any).operations.map((operation: any) => operation.kind))
      .toEqual(["delete", "insert"]);
  });

  it("preserves text semantics through the object bound and rejects excess work explicitly", () => {
    expect(() => buildReviewDiffSet({ ...input, before: [], after: [{ path: "too-large.txt", mode: "100644",
      bytes: new Uint8Array(REVIEW_DIFF_LIMITS.maximumObjectBytes + 1) }] })).toThrow(/object byte/u);
    const largeBefore = new Uint8Array(2 * 1_024 * 1_024 + 1).fill(97);
    const largeAfter = largeBefore.slice();
    largeAfter[0] = 98;
    const result = buildReviewDiffSet({ ...input,
      before: [{ path: "large.txt", mode: "100644", bytes: largeBefore }],
      after: [{ path: "large.txt", mode: "100644", bytes: largeAfter }] });
    expect(result.entries[0]?.diffObject.payload).toMatchObject({ kind: "text-edits" });

    expect(() => buildReviewDiffSet({ ...input,
      before: [entry("skewed.txt", "100644", "only\n")],
      after: [entry("skewed.txt", "100644", Array.from({ length: 3_000 }, (_, index) => `new-${index}\n`).join(""))] }))
      .toThrow(/text resource limit/u);
    expect(() => buildReviewDiffSet({ ...input,
      before: [entry("rewrite.txt", "100644", Array.from({ length: 1_500 }, (_, index) => `old-${index}\n`).join(""))],
      after: [entry("rewrite.txt", "100644", Array.from({ length: 1_500 }, (_, index) => `new-${index}\n`).join(""))] }))
      .toThrow(/text resource limit/u);
  });
});

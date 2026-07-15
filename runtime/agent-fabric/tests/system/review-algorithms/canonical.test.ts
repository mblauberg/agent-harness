import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  canonicalString,
  canonicalWithout,
  digestCanonical,
} from "../../../src/review/canonical/index.ts";

describe("RFC 8785 canonical JSON", () => {
  it("produces one exact UTF-8 preimage and digest for every property permutation", () => {
    const first = {
      z: [3, -0, 0.002, 1e30],
      a: { "\u20ac": "Euro", alpha: "line\ntext" },
    };
    const second = {
      a: { alpha: "line\ntext", "\u20ac": "Euro" },
      z: [3, 0, 0.002, 1e30],
    };
    const expected = "{\"a\":{\"alpha\":\"line\\ntext\",\"€\":\"Euro\"},\"z\":[3,0,0.002,1e+30]}";

    expect(canonicalString(first)).toBe(expected);
    expect(canonicalString(second)).toBe(expected);
    expect(digestCanonical(first)).toBe(
      `sha256:${createHash("sha256").update(expected).digest("hex")}`,
    );
  });

  it("rejects values outside I-JSON instead of coercing them", () => {
    expect(() => canonicalString({ invalid: undefined })).toThrow(/undefined/u);
    expect(() => canonicalString({ invalid: Number.POSITIVE_INFINITY })).toThrow(/finite/u);
    expect(() => canonicalString({ invalid: 1n })).toThrow(/unsupported/u);
    expect(() => canonicalString({ invalid: "\ud800" })).toThrow(/surrogate/u);
  });

  it("omits only the declared top-level digest field", () => {
    const input = { schemaVersion: 1, nested: { digest: "keep" }, digest: "omit" };
    expect(canonicalWithout(input, ["digest"])).toBe(
      "{\"nested\":{\"digest\":\"keep\"},\"schemaVersion\":1}",
    );
    expect(() => canonicalWithout(input, ["missing"])).toThrow(/missing/u);
  });
});

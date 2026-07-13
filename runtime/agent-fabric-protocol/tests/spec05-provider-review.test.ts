import { describe, expect, it } from "vitest";

import {
  REVIEW_COMPLETION_V1_CODEC,
  REVIEW_EVIDENCE_LIST_REQUEST_V1_CODEC,
  REVIEW_SLOT_V1_CODEC,
  TERMINAL_RESULT_IDENTITY_V1_CODEC,
} from "../src/index.js";

describe("Spec 05 provider review closure", () => {
  it("admits exactly six disjoint terminal-result arms", () => {
    const terminal = TERMINAL_RESULT_IDENTITY_V1_CODEC.example;
    expect(TERMINAL_RESULT_IDENTITY_V1_CODEC.parse(terminal, "terminal")).toStrictEqual(terminal);
    expect(() => TERMINAL_RESULT_IDENTITY_V1_CODEC.parse({
      ...terminal,
      providerFailureCode: "provider-rejected",
    }, "terminal")).toThrow(/unknown field|allowed variant/);
  });

  it("bounds and closes evidence cursors", () => {
    expect(() => REVIEW_EVIDENCE_LIST_REQUEST_V1_CODEC.parse({
      ...REVIEW_EVIDENCE_LIST_REQUEST_V1_CODEC.example,
      cursor: "x".repeat(257),
    }, "list")).toThrow(/256/);
  });

  it("requires completion slots to be empty or the exact four-slot order", () => {
    const completion = REVIEW_COMPLETION_V1_CODEC.example;
    expect(() => REVIEW_COMPLETION_V1_CODEC.parse({
      ...completion,
      slots: [
        { ...REVIEW_SLOT_V1_CODEC.example, slot: "native" },
        { ...REVIEW_SLOT_V1_CODEC.example, slot: "other-primary" },
      ],
    }, "completion")).toThrow(/empty or exactly four/);
  });
});

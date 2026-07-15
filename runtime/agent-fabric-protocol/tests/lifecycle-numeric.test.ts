import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  parseOperationInput,
  type OperationInputMap,
} from "../src/index.js";

describe("Agent Fabric numeric lifecycle generations", () => {
  it("uses a nonnegative numeric context revision", () => {
    const input = {
      sourceEventId: "provider_event_01",
      providerSessionRef: "provider_session_01",
      agentId: "agent_01",
      providerSessionGeneration: 1,
      contextRevision: 0,
      evidenceDigest: `sha256:${"a".repeat(64)}` as `sha256:${string}`,
      commandId: "command_01",
    } satisfies OperationInputMap[typeof FABRIC_OPERATIONS.reportProviderState];
    expect(parseOperationInput(FABRIC_OPERATIONS.reportProviderState, input)).toStrictEqual(input);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.reportProviderState, {
      ...input,
      contextRevision: "0",
    })).toThrow(/contextRevision/);
  });

  it("requires the exact authenticated provider context observation", () => {
    const input = {
      sourceEventId: "provider_event_01",
      providerSessionRef: "provider_session_01",
      providerSessionGeneration: 1,
      contextRevision: 0,
      evidenceDigest: `sha256:${"b".repeat(64)}` as `sha256:${string}`,
      agentId: "agent_01",
      commandId: "command_01",
    } satisfies OperationInputMap[typeof FABRIC_OPERATIONS.reportProviderState];

    for (const field of [
      "sourceEventId",
      "providerSessionRef",
      "providerSessionGeneration",
      "contextRevision",
      "evidenceDigest",
      "agentId",
      "commandId",
    ] as const) {
      const incomplete = { ...input };
      delete incomplete[field];
      expect(
        () => parseOperationInput(FABRIC_OPERATIONS.reportProviderState, incomplete),
        field,
      ).toThrow(new RegExp(field, "u"));
    }

    expect(parseOperationInput(FABRIC_OPERATIONS.reportProviderState, {
      ...input,
      checkpointSha256: "c".repeat(64),
    })).toStrictEqual({ ...input, checkpointSha256: "c".repeat(64) });
    expect(() => parseOperationInput(FABRIC_OPERATIONS.reportProviderState, {
      ...input,
      evidenceDigest: "b".repeat(64),
    })).toThrow(/evidenceDigest/u);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.reportProviderState, {
      ...input,
      sourceEventId: `provider_event_${"x".repeat(128)}`,
    })).toThrow(/sourceEventId/u);
  });
});

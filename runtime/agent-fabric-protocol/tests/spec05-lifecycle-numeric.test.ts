import { describe, expect, it } from "vitest";

import { FABRIC_OPERATIONS, parseOperationInput } from "../src/index.js";

describe("Spec 05 numeric lifecycle generations", () => {
  it("uses a nonnegative numeric context revision", () => {
    const input = {
      agentId: "agent_01",
      providerSessionGeneration: 1,
      contextRevision: 0,
      commandId: "command_01",
    };
    expect(parseOperationInput(FABRIC_OPERATIONS.reportProviderState, input)).toStrictEqual(input);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.reportProviderState, {
      ...input,
      contextRevision: "0",
    })).toThrow(/contextRevision/);
  });
});

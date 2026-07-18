import { ProtocolTransportError } from "@local/agent-fabric-protocol";
import { describe, expect, it } from "vitest";

import { errorPayload, retryRecoveredProtocolCall } from "../../src/mcp/server.ts";

describe("MCP recovered protocol retry", () => {
  it("preserves a non-disconnect transport error from the retried operation", async () => {
    for (const code of [
      "PROTOCOL_RESULT_INVALID",
      "PROTOCOL_FEATURE_UNAVAILABLE",
      "PROTOCOL_OVERLOADED",
    ] as const) {
      const failure = new ProtocolTransportError(code, `injected ${code}`);

      await expect(retryRecoveredProtocolCall(async () => {
        throw failure;
      })).rejects.toBe(failure);
      expect(errorPayload(failure)).toEqual({
        code,
        message: "Agent Fabric protocol request failed",
      });
    }
  });
});

import { FABRIC_OPERATIONS, ProtocolTransportError } from "@local/agent-fabric-protocol";
import { describe, expect, it } from "vitest";

import { errorPayload, retryRecoveredProtocolCall } from "../../src/mcp/server.ts";

describe("MCP recovered protocol retry", () => {
  it("turns a second timeout into actionable reconnect guidance", async () => {
    await expect(retryRecoveredProtocolCall(
      async () => {
        throw new ProtocolTransportError("PROTOCOL_TIMEOUT", "in-flight retry timed out");
      },
      FABRIC_OPERATIONS.receiveMessages,
      { limit: 10, visibilityTimeoutMs: 30_000 },
    )).rejects.toMatchObject({
      code: "RECONNECT_REQUIRED",
      action: "The fabric_message_receive outcome is unknown and no delivery was acknowledged. Wait at least 30000 ms (the requested visibilityTimeoutMs) before retrying fabric_message_receive.",
    });
  });

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

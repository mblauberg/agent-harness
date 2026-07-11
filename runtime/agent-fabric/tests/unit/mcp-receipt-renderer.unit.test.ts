import { describe, expect, it } from "vitest";

import { renderToolReceipt } from "../../src/mcp/receipt-renderer.ts";

describe("human-readable MCP dispatch receipts", () => {
  it("renders a compact send line without copying the body", () => {
    const line = renderToolReceipt(
      "fabric_message_send",
      {
        audience: { kind: "agents", agentIds: ["peer"] },
        kind: "request",
        body: "private task body",
        requiresAck: true,
      },
      { messageId: "msg-1" },
    );
    expect(line).toBe("sent request → agents:peer · msg msg-1 · ack required · delivery pending");
    expect(line).not.toContain("private task body");
  });

  it("never copies capability tokens into human-visible text", () => {
    const line = renderToolReceipt(
      "fabric_run_create",
      { runId: "run-1" },
      { runId: "run-1", chairCapability: "afc_must-not-appear" },
    );
    expect(line).toBe("created run run-1 · chair capability issued (redacted)");
    expect(line).not.toContain("afc_must-not-appear");
  });

  it("renders received metadata but leaves message bodies structured-only", () => {
    const line = renderToolReceipt(
      "fabric_message_receive",
      {},
      { deliveries: [{ messageId: "msg-1", sequence: 3, senderId: "chair", kind: "request", attempt: 1, body: "secret" }] },
    );
    expect(line).toContain("msg msg-1 seq 3 from chair · request · attempt 1 · claimed");
    expect(line).not.toContain("secret");
  });
});

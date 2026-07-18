import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

type JsonObject = Record<string, unknown>;

const scenario = process.argv[2] ?? "happy";
const transcriptPath = process.argv[3];
let permissionRequestId = 90;
let pendingPromptId: unknown;

function record(direction: "in" | "out", value: unknown): void {
  if (transcriptPath !== undefined) {
    appendFileSync(transcriptPath, `${JSON.stringify({ direction, value })}\n`);
  }
}

function send(value: unknown): void {
  record("out", value);
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function result(id: unknown, value: unknown): void {
  send({ jsonrpc: "2.0", id, result: value });
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  const value = JSON.parse(line) as JsonObject;
  record("in", value);

  if (value.method === "initialize") {
    result(value.id, {
      protocolVersion: scenario === "protocol-mismatch" ? 999 : 1,
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: { image: false, audio: false, embeddedContext: false },
        mcpCapabilities: { http: false, sse: false },
        sessionCapabilities: { close: {} },
      },
      authMethods: [],
      agentInfo: { name: "kiro-acp-fake", version: "1" },
    });
    return;
  }
  if (value.method === "session/new") {
    result(value.id, {
      sessionId: "kiro-session-1",
      ...(scenario === "config-model" ? {
        configOptions: [{
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "opencode/default-free",
          options: [
            { value: "opencode/default-free", name: "Default" },
            { value: "opencode/deepseek-v4-flash-free", name: "DeepSeek" },
          ],
        }],
      } : {}),
    });
    return;
  }
  if (value.method === "session/set_config_option") {
    result(value.id, {
      configOptions: [{
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: (value.params as JsonObject).value,
        options: [],
      }],
    });
    return;
  }
  if (value.method === "session/load") {
    result(value.id, {});
    return;
  }
  if (value.method === "session/prompt") {
    if (scenario === "oversized-output") {
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "kiro-session-1",
          update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "x".repeat(4096) } },
        },
      });
      result(value.id, { stopReason: "end_turn" });
      return;
    }
    if (scenario === "edit-permission" || scenario === "read-permission" || scenario === "outside-read-permission") {
      pendingPromptId = value.id;
      const requestId = permissionRequestId++;
      send({
        jsonrpc: "2.0",
        id: requestId,
        method: "session/request_permission",
        params: {
          sessionId: "kiro-session-1",
          toolCall: {
            toolCallId: "tool-1",
            title: "fixture tool",
            kind: scenario === "edit-permission" ? "edit" : "read",
            locations: [{ path: scenario === "outside-read-permission" ? "/etc/hosts" : process.cwd() }],
          },
          options: [
            { optionId: "allow", name: "Allow once", kind: "allow_once" },
            { optionId: "reject", name: "Reject", kind: "reject_once" },
          ],
        },
      });
      return;
    }
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "kiro-session-1",
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "bounded response" } },
      },
    });
    result(value.id, { stopReason: "end_turn" });
    return;
  }
  if (value.method === "session/close") {
    result(value.id, {});
    return;
  }
  if (value.id !== undefined && value.method === undefined) {
    const response = value.result as JsonObject | undefined;
    const outcome = response?.outcome as JsonObject | undefined;
    const selected = outcome?.optionId;
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "kiro-session-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: `permission:${String(selected)}` },
        },
      },
    });
    result(pendingPromptId, { stopReason: "end_turn" });
    pendingPromptId = undefined;
  }
});

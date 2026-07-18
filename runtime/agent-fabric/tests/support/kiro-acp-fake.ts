import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

type JsonObject = Record<string, unknown>;

const scenario = process.argv[2] ?? "happy";
const transcriptPath = process.argv[3];
let permissionRequestId = 90;
let pendingPromptId: unknown;
let selectedModel = "opencode/default-free";
let selectedEffort = "low";
const configScenarios = new Set([
  "config-model",
  "misapply-effort",
  "empty-answer",
  "unsupported-update",
  "partial-answer",
  "timeout",
]);

function configOptions(): unknown[] {
  return [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: selectedModel,
      options: [
        { value: "opencode/default-free", name: "Default" },
        { value: "opencode/deepseek-v4-flash-free", name: "DeepSeek" },
      ],
    },
    {
      id: "effort",
      name: "Effort",
      category: "thought_level",
      type: "select",
      currentValue: selectedEffort,
      options: [
        { value: "low", name: "Low" },
        { value: "high", name: "High" },
      ],
    },
  ];
}

function record(direction: "argv" | "in" | "out", value: unknown): void {
  if (transcriptPath !== undefined) {
    appendFileSync(transcriptPath, `${JSON.stringify({ direction, value })}\n`);
  }
}

record("argv", process.argv.slice(4));

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
      ...(configScenarios.has(scenario) ? { configOptions: configOptions() } : {}),
    });
    return;
  }
  if (value.method === "session/set_config_option") {
    const params = value.params as JsonObject;
    if (params.configId === "model") selectedModel = String(params.value);
    if (params.configId === "effort") selectedEffort = scenario === "misapply-effort" ? "low" : String(params.value);
    result(value.id, { configOptions: configOptions() });
    return;
  }
  if (value.method === "session/load") {
    result(value.id, {});
    return;
  }
  if (value.method === "session/prompt") {
    if (scenario.startsWith("malformed-known:")) {
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "kiro-session-1",
          update: { sessionUpdate: scenario.slice("malformed-known:".length) },
        },
      });
      result(value.id, { stopReason: "end_turn" });
      return;
    }
    if (scenario === "valid-non-answer-updates") {
      for (const update of [
        { sessionUpdate: "user_message_chunk", content: { type: "text", text: "user" } },
        { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "thought" } },
        { sessionUpdate: "tool_call", toolCallId: "tool-1", title: "Read" },
        { sessionUpdate: "tool_call_update", toolCallId: "tool-1" },
        { sessionUpdate: "plan", entries: [] },
        { sessionUpdate: "available_commands_update", availableCommands: [] },
        { sessionUpdate: "current_mode_update", currentModeId: "default" },
        { sessionUpdate: "config_option_update", configOptions: [] },
        { sessionUpdate: "session_info_update", title: "Fixture" },
        { sessionUpdate: "usage_update", used: 1, size: 2 },
      ]) {
        send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "kiro-session-1", update } });
      }
      result(value.id, { stopReason: "end_turn" });
      return;
    }
    if (scenario === "empty-answer") {
      result(value.id, { stopReason: "end_turn" });
      return;
    }
    if (scenario === "timeout") return;
    if (scenario === "wrong-session-update") {
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "another-session",
          update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "wrong session" } },
        },
      });
      result(value.id, { stopReason: "end_turn" });
      return;
    }
    if (scenario === "malformed-update") {
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "kiro-session-1",
          update: { sessionUpdate: "agent_message_chunk", content: { type: "text" } },
        },
      });
      result(value.id, { stopReason: "end_turn" });
      return;
    }
    if (scenario === "unsupported-update") {
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: { sessionId: "kiro-session-1", update: { sessionUpdate: "future_unknown_update" } },
      });
      result(value.id, { stopReason: "end_turn" });
      return;
    }
    if (scenario === "partial-answer") {
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "kiro-session-1",
          update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "partial" } },
        },
      });
      setTimeout(() => process.exit(0), 20);
      return;
    }
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

import { createInterface } from "node:readline";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function response(id: string, command: string, data?: unknown): void {
  process.stdout.write(`${JSON.stringify({ id, type: "response", command, success: true, ...(data === undefined ? {} : { data }) })}\n`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  const value: unknown = JSON.parse(line);
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string") {
    throw new Error("invalid Pi RPC fixture command");
  }
  switch (value.type) {
    case "get_state":
      response(value.id, value.type, {
        sessionId: process.env.AGENT_FABRIC_TEST_SECRET === undefined ? "pi-session-1" : "environment-leaked",
        sessionFile: "/sessions/pi-session-1.jsonl",
        isStreaming: false,
      });
      return;
    case "new_session":
    case "switch_session":
      response(value.id, value.type, { cancelled: false });
      return;
    case "set_model":
      response(value.id, value.type, { provider: value.provider, id: value.modelId });
      return;
    case "prompt":
      response(value.id, value.type);
      if (value.message !== "hang") {
        process.stdout.write(`${JSON.stringify({ type: "message_update", text: "done" })}\n`);
        process.stdout.write(`${JSON.stringify({ type: "agent_end" })}\n`);
      }
      return;
    case "get_last_assistant_text":
      response(value.id, value.type, { text: "done" });
      return;
    case "steer":
    case "abort":
      response(value.id, value.type);
      return;
    case "compact":
      response(value.id, value.type, { compacted: true });
      return;
    default:
      process.stdout.write(`${JSON.stringify({ id: value.id, type: "response", command: value.type, success: false, error: "unsupported fixture command" })}\n`);
  }
});

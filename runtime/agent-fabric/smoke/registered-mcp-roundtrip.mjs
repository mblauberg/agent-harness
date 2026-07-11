#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const projectRoot = resolve(process.argv[2] ?? process.cwd());
const stateDirectory = process.env.AGENT_FABRIC_STATE_DIRECTORY
  ?? join(process.env.HOME ?? "", ".local", "state", "agent-harness", "fabric");
const socketPath = process.env.AGENT_FABRIC_SOCKET_PATH
  ?? join(stateDirectory, "runtime", "fabric-v1.sock");
const projectKey = process.env.AGENT_FABRIC_PROJECT_KEY;
if (projectKey === undefined) throw new Error("AGENT_FABRIC_PROJECT_KEY is required");
const seatDirectory = join(stateDirectory, "seats", projectKey);

async function connect(seat) {
  const transport = new StdioClientTransport({
    command: join(projectRoot, "scripts", "agent-fabric-mcp"),
    cwd: projectRoot,
    env: {
      AGENT_FABRIC_SOCKET_PATH: socketPath,
      AGENT_FABRIC_STATE_DIRECTORY: stateDirectory,
      AGENT_FABRIC_SEAT: seat,
      AGENT_FABRIC_CLIENT_LABEL: seat,
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
    },
  });
  const client = new Client({ name: `registered-roundtrip-${seat}`, version: "1" });
  await client.connect(transport);
  return client;
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError === true || result.structuredContent === undefined) {
    throw new Error(`${name} failed`);
  }
  return result.structuredContent;
}

async function receive(client, expectedMessageId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await call(client, "fabric_message_receive", { limit: 10, visibilityTimeoutMs: 10_000 });
    const deliveries = Array.isArray(result.deliveries) ? result.deliveries : [];
    const delivery = deliveries.find((item) => item?.messageId === expectedMessageId);
    if (delivery !== undefined) return delivery;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`timed out waiting for registered message ${expectedMessageId}`);
}

const [codexMetadata, claudeMetadata] = await Promise.all([
  readFile(join(seatDirectory, "codex.json"), "utf8").then(JSON.parse),
  readFile(join(seatDirectory, "claude.json"), "utf8").then(JSON.parse),
]);
if (codexMetadata.runId !== claudeMetadata.runId) throw new Error("registered seats are not in one run");

const codex = await connect("codex");
const claude = await connect("claude");
try {
  const nonce = randomUUID();
  const conversationId = `registered-roundtrip:${nonce}`;
  const request = await call(codex, "fabric_message_send", {
    audience: { kind: "agents", agentIds: ["claude"] },
    context: { kind: "direct" },
    kind: "request",
    body: "Codex registration check: please acknowledge this shared MCP message.",
    requiresAck: true,
    dedupeKey: `${conversationId}:request`,
    conversationId,
    hopCount: 0,
  });
  const receivedByClaude = await receive(claude, request.messageId);
  await call(claude, "fabric_message_ack", { deliveryId: receivedByClaude.deliveryId });
  const response = await call(claude, "fabric_message_send", {
    audience: { kind: "agents", agentIds: ["codex"] },
    context: { kind: "direct" },
    kind: "response",
    body: "Claude registration check: message received and acknowledged over the shared MCP fabric.",
    requiresAck: true,
    dedupeKey: `${conversationId}:response`,
    conversationId,
    replyToMessageId: request.messageId,
    hopCount: 1,
  });
  const receivedByCodex = await receive(codex, response.messageId);
  await call(codex, "fabric_message_ack", { deliveryId: receivedByCodex.deliveryId });
  process.stdout.write(`${JSON.stringify({
    status: "pass",
    runId: codexMetadata.runId,
    exchange: [
      { from: "codex", to: "claude", messageId: request.messageId, acknowledged: true },
      { from: "claude", to: "codex", messageId: response.messageId, acknowledged: true },
    ],
  }, null, 2)}\n`);
} finally {
  await Promise.allSettled([codex.close(), claude.close()]);
}

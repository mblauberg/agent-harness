#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { connectFabricDaemon, startFabricDaemon } from "../dist/index.js";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MCP_MAIN = fileURLToPath(new URL("../dist/mcp/main.js", import.meta.url));
const ROLES = Object.freeze(["codex", "fable"]);
const ROLE_CONFIG = Object.freeze({
  codex: { agentId: "codex-chair", peerRole: "fable", peerAgentId: "fable-peer" },
  fable: { agentId: "fable-peer", peerRole: "codex", peerAgentId: "codex-chair" },
});

function usage() {
  return [
    "usage:",
    "  node smoke/paired-mcp.mjs coordinate --session PATH [--timeout-ms 180000]",
    "  node smoke/paired-mcp.mjs participant --session PATH --role codex|fable --message TEXT [--reply TEXT] [--timeout-ms 60000]",
    "  node --test smoke/paired-mcp.self-test.mjs",
  ].join("\n");
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== "coordinate" && command !== "participant") throw new Error(usage());
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) throw new Error(usage());
    options[key.slice(2)] = value;
  }
  return { command, options };
}

function requiredString(options, key) {
  const value = options[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`--${key} is required\n${usage()}`);
  return value;
}

function timeout(options, fallback) {
  if (options["timeout-ms"] === undefined) return fallback;
  const value = Number(options["timeout-ms"]);
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 600_000) {
    throw new Error("--timeout-ms must be an integer from 1000 to 600000");
  }
  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function stringField(value, key, label) {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) throw new Error(`${label}.${key} must be a non-empty string`);
  return field;
}

async function writePrivateJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await rename(temporary, path);
  await chmod(path, 0o600);
}

async function readPrivateJson(path, label) {
  const metadata = await stat(path);
  if ((metadata.mode & 0o077) !== 0) throw new Error(`${label} must not be accessible by group or other users`);
  return record(JSON.parse(await readFile(path, "utf8")), label);
}

async function waitForJson(path, deadline, label) {
  while (Date.now() < deadline) {
    try {
      return await readPrivateJson(path, label);
    } catch (error) {
      if (!isRecord(error) || error.code !== "ENOENT") throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
  }
  throw new Error(`timed out waiting for ${label}`);
}

function authority(session, actions, budget, expiresAt) {
  return {
    workspaceRoots: [session],
    sourcePaths: [session],
    artifactPaths: [session],
    actions,
    disclosure: ["local-paired-smoke"],
    expiresAt,
    budget,
  };
}

async function coordinate(options) {
  const session = resolve(requiredString(options, "session"));
  const deadline = Date.now() + timeout(options, 180_000);
  // Darwin caps Unix-domain socket paths at roughly 104 bytes. Keep the
  // daemon's secret state in a short, mode-0700 temporary path while the
  // human-facing evidence remains at the requested session path.
  const privateDirectory = join("/tmp", `afp-${randomUUID().slice(0, 12)}`);
  const stateDirectory = join(privateDirectory, "state");
  const runtimeDirectory = join(privateDirectory, "runtime");
  const databasePath = join(stateDirectory, "fabric.sqlite3");
  const socketPath = join(runtimeDirectory, "fabric.sock");
  const rendezvousPath = join(session, "rendezvous.json");
  const runId = `paired-mcp-${randomUUID()}`;
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  await mkdir(session, { recursive: true, mode: 0o700 });
  await chmod(session, 0o700);

  let daemon;
  let bootstrap;
  let chair;
  let interrupted = false;
  const onSignal = () => { interrupted = true; };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    daemon = await startFabricDaemon({ databasePath, stateDirectory, runtimeDirectory, socketPath });
    bootstrap = await connectFabricDaemon({ socketPath, capability: daemon.bootstrapCapability });
    const created = await bootstrap.createRun({
      runId,
      projectRunDirectory: session,
      chair: {
        agentId: ROLE_CONFIG.codex.agentId,
        authority: authority(session, ["read", "delegate", "message"], { turns: 32, descendants: 2 }, expiresAt),
      },
    });
    chair = await connectFabricDaemon({ socketPath, capability: created.chairCapability });
    const delegated = await chair.delegateAuthority({
      parentAuthorityId: created.chairAuthorityId,
      commandId: `${runId}:fable-authority`,
      authority: authority(session, ["read", "message"], { turns: 16 }, expiresAt),
    });
    const fable = await chair.registerAgent({
      agentId: ROLE_CONFIG.fable.agentId,
      authorityId: delegated.authorityId,
    });
    const discussionGroupId = `${runId}:paired`;
    await chair.createDiscussionGroup({
      groupId: discussionGroupId,
      memberAgentIds: [ROLE_CONFIG.codex.agentId, ROLE_CONFIG.fable.agentId],
      commandId: `${runId}:paired-group`,
    });
    await writePrivateJson(rendezvousPath, {
      schemaVersion: "agent-fabric.paired-mcp-rendezvous.v1",
      runId,
      socketPath,
      discussionGroupId,
      daemonPid: daemon.pid,
      createdAt: new Date().toISOString(),
      participants: {
        codex: { agentId: ROLE_CONFIG.codex.agentId, capability: created.chairCapability },
        fable: { agentId: ROLE_CONFIG.fable.agentId, capability: fable.capability },
      },
    });
    process.stdout.write(`paired MCP coordinator ready · session ${session} · secrets kept in mode-0600 rendezvous\n`);

    while (!interrupted) {
      const codexPath = join(session, "evidence-codex.json");
      const fablePath = join(session, "evidence-fable.json");
      try {
        const [codexEvidence, fableEvidence] = await Promise.all([
          waitForJson(codexPath, Math.min(deadline, Date.now() + 100), "Codex evidence"),
          waitForJson(fablePath, Math.min(deadline, Date.now() + 100), "Fable evidence"),
        ]);
        const summary = verifyEvidence(runId, codexEvidence, fableEvidence);
        await writePrivateJson(join(session, "summary.json"), {
          ...summary,
          verifiedAt: new Date().toISOString(),
        });
        process.stdout.write(`paired MCP smoke verified · codex ↔ fable · 4 deliveries acknowledged · summary ${join(session, "summary.json")}\n`);
        return;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("timed out waiting for")) {
          if (Date.now() >= deadline) throw new Error("paired MCP coordinator timed out waiting for both participants");
          continue;
        }
        throw error;
      }
    }
    throw new Error("paired MCP coordinator interrupted");
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await rm(rendezvousPath, { force: true }).catch(() => undefined);
    await Promise.allSettled([chair?.close(), bootstrap?.close()]);
    await daemon?.stop().catch(() => undefined);
    await rm(privateDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function verifyEvidence(runId, codexEvidence, fableEvidence) {
  const evidence = { codex: codexEvidence, fable: fableEvidence };
  for (const role of ROLES) {
    const item = evidence[role];
    const config = ROLE_CONFIG[role];
    if (item.schemaVersion !== "agent-fabric.paired-mcp-evidence.v1") throw new Error(`${role} evidence schema is invalid`);
    if (item.runId !== runId || item.role !== role || item.agentId !== config.agentId || item.peerAgentId !== config.peerAgentId) {
      throw new Error(`${role} evidence identity does not match the rendezvous`);
    }
    for (const field of ["initial", "receivedInitial", "reply", "receivedReply"]) {
      const message = record(item[field], `${role}.${field}`);
      stringField(message, "messageId", `${role}.${field}`);
      const content = record(message.content, `${role}.${field}.content`);
      stringField(content, "text", `${role}.${field}.content`);
    }
    if (!Array.isArray(item.acknowledgements) || item.acknowledgements.length !== 2) {
      throw new Error(`${role} must record exactly two acknowledgements`);
    }
  }
  if (codexEvidence.initial.messageId !== fableEvidence.receivedInitial.messageId
    || fableEvidence.initial.messageId !== codexEvidence.receivedInitial.messageId
    || codexEvidence.reply.messageId !== fableEvidence.receivedReply.messageId
    || fableEvidence.reply.messageId !== codexEvidence.receivedReply.messageId) {
    throw new Error("paired evidence message IDs do not cross-link");
  }
  if (codexEvidence.reply.replyToMessageId !== fableEvidence.initial.messageId
    || fableEvidence.reply.replyToMessageId !== codexEvidence.initial.messageId) {
    throw new Error("paired replies do not reference the received initial messages");
  }
  if (codexEvidence.receivedInitial.senderAgentId !== ROLE_CONFIG.fable.agentId
    || codexEvidence.receivedReply.senderAgentId !== ROLE_CONFIG.fable.agentId
    || fableEvidence.receivedInitial.senderAgentId !== ROLE_CONFIG.codex.agentId
    || fableEvidence.receivedReply.senderAgentId !== ROLE_CONFIG.codex.agentId) {
    throw new Error("delivery sender identities do not match the paired capabilities");
  }
  return {
    schemaVersion: "agent-fabric.paired-mcp-summary.v1",
    status: "verified",
    runId,
    roles: [...ROLES],
    transport: "two independent MCP stdio proxies to one temporary Unix-socket daemon",
    exchange: {
      codex: { initial: codexEvidence.initial, reply: codexEvidence.reply },
      fable: { initial: fableEvidence.initial, reply: fableEvidence.reply },
    },
    acknowledgements: [...codexEvidence.acknowledgements, ...fableEvidence.acknowledgements],
  };
}

async function spawnMcpProxy(rendezvous, role, capability) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [MCP_MAIN],
    cwd: PACKAGE_ROOT,
    env: {
      AGENT_FABRIC_SOCKET_PATH: stringField(rendezvous, "socketPath", "rendezvous"),
      AGENT_FABRIC_CAPABILITY: capability,
      AGENT_FABRIC_CLIENT_LABEL: `paired-smoke-${role}`,
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      TMPDIR: process.env.TMPDIR ?? "/tmp",
      ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
    },
  });
  const client = new Client({ name: `paired-smoke-${role}`, version: "0.1.0" });
  await client.connect(transport);
  return client;
}

async function callTool(client, name, args) {
  const result = record(await client.callTool({ name, arguments: args }), `${name} result`);
  if (result.isError === true) {
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content.find((item) => isRecord(item) && item.type === "text")?.text;
    throw new Error(`${name} failed${typeof text === "string" ? `: ${text}` : ""}`);
  }
  return record(result.structuredContent, `${name}.structuredContent`);
}

function messageEnvelope(body, label) {
  const envelope = record(JSON.parse(body), label);
  if (envelope.schemaVersion !== "agent-fabric.smoke-message.v1") throw new Error(`${label} has an unknown schema`);
  const content = record(envelope.content, `${label}.content`);
  stringField(content, "text", `${label}.content`);
  if (envelope.phase !== "initial" && envelope.phase !== "reply") throw new Error(`${label}.phase is invalid`);
  return envelope;
}

async function participant(options) {
  const session = resolve(requiredString(options, "session"));
  const role = requiredString(options, "role");
  if (!ROLES.includes(role)) throw new Error("--role must be codex or fable");
  const initialText = requiredString(options, "message");
  const deadline = Date.now() + timeout(options, 60_000);
  const config = ROLE_CONFIG[role];
  const rendezvous = await readPrivateJson(join(session, "rendezvous.json"), "rendezvous");
  if (rendezvous.schemaVersion !== "agent-fabric.paired-mcp-rendezvous.v1") throw new Error("rendezvous schema is invalid");
  const runId = stringField(rendezvous, "runId", "rendezvous");
  const discussionGroupId = stringField(rendezvous, "discussionGroupId", "rendezvous");
  const participants = record(rendezvous.participants, "rendezvous.participants");
  const identity = record(participants[role], `rendezvous.participants.${role}`);
  const capability = stringField(identity, "capability", `rendezvous.participants.${role}`);
  if (identity.agentId !== config.agentId) throw new Error(`${role} rendezvous identity is invalid`);
  const client = await spawnMcpProxy(rendezvous, role, capability);
  try {
    const conversationId = `${runId}:paired-smoke`;
    const initialEnvelope = {
      schemaVersion: "agent-fabric.smoke-message.v1",
      senderRole: role,
      phase: "initial",
      content: { text: initialText },
    };
    const initial = await callTool(client, "fabric_message_send", {
      audience: { kind: "agents", agentIds: [config.peerAgentId] },
      context: { kind: "discussion-group", groupId: discussionGroupId },
      kind: "request",
      body: JSON.stringify(initialEnvelope),
      requiresAck: true,
      dedupeKey: `${runId}:${role}:initial`,
      conversationId,
      hopCount: 0,
    });
    const initialMessageId = stringField(initial, "messageId", "initial send");
    process.stdout.write(`${role} → ${config.peerRole} [${initialMessageId}]: ${JSON.stringify(initialText)}\n`);

    const deliveries = new Map();
    const acknowledgements = [];
    const poll = async () => {
      const received = await callTool(client, "fabric_message_receive", { limit: 10, visibilityTimeoutMs: 10_000 });
      if (!Array.isArray(received.deliveries)) throw new Error("fabric_message_receive returned invalid deliveries");
      for (const raw of received.deliveries) {
        const delivery = record(raw, "delivery");
        const messageId = stringField(delivery, "messageId", "delivery");
        if (deliveries.has(messageId)) continue;
        const deliveryId = stringField(delivery, "deliveryId", "delivery");
        const envelope = messageEnvelope(stringField(delivery, "body", "delivery"), "delivery.body");
        if (envelope.senderRole !== config.peerRole || delivery.senderId !== config.peerAgentId) {
          throw new Error(`${role} received a delivery from an unexpected identity`);
        }
        await callTool(client, "fabric_message_ack", { deliveryId });
        acknowledgements.push({ role, deliveryId, messageId });
        deliveries.set(messageId, {
          messageId,
          deliveryId,
          senderAgentId: delivery.senderId,
          content: envelope.content,
          phase: envelope.phase,
        });
        process.stdout.write(`${role} ← ${config.peerRole} [${messageId}]: ${JSON.stringify(envelope.content.text)} · acknowledged\n`);
      }
    };
    const waitForPhase = async (phase) => {
      while (Date.now() < deadline) {
        const found = [...deliveries.values()].find((item) => item.phase === phase);
        if (found !== undefined) return found;
        await poll();
        await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      }
      throw new Error(`${role} timed out waiting for ${config.peerRole} ${phase}`);
    };

    const receivedInitial = await waitForPhase("initial");
    const replyText = options.reply ?? `${role} received ${config.peerRole}'s message and replies over the shared MCP fabric.`;
    const replyEnvelope = {
      schemaVersion: "agent-fabric.smoke-message.v1",
      senderRole: role,
      phase: "reply",
      content: { text: replyText },
    };
    const reply = await callTool(client, "fabric_message_send", {
      audience: { kind: "agents", agentIds: [config.peerAgentId] },
      context: { kind: "discussion-group", groupId: discussionGroupId },
      kind: "response",
      body: JSON.stringify(replyEnvelope),
      requiresAck: true,
      dedupeKey: `${runId}:${role}:reply`,
      conversationId,
      replyToMessageId: receivedInitial.messageId,
      hopCount: 1,
    });
    const replyMessageId = stringField(reply, "messageId", "reply send");
    process.stdout.write(`${role} → ${config.peerRole} [${replyMessageId}] reply: ${JSON.stringify(replyText)}\n`);
    const receivedReply = await waitForPhase("reply");

    const evidence = {
      schemaVersion: "agent-fabric.paired-mcp-evidence.v1",
      runId,
      role,
      agentId: config.agentId,
      peerAgentId: config.peerAgentId,
      mcpClientLabel: `paired-smoke-${role}`,
      initial: { messageId: initialMessageId, content: initialEnvelope.content },
      receivedInitial,
      reply: { messageId: replyMessageId, replyToMessageId: receivedInitial.messageId, content: replyEnvelope.content },
      receivedReply,
      acknowledgements,
      completedAt: new Date().toISOString(),
    };
    await writePrivateJson(join(session, `evidence-${role}.json`), evidence);
    process.stdout.write(`${role} MCP exchange complete · evidence ${join(session, `evidence-${role}.json`)}\n`);
  } finally {
    await client.close();
  }
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "coordinate") await coordinate(options);
  else await participant(options);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { createInterface } from "node:readline";

import {
  FABRIC_OPERATIONS,
  NdjsonRpcTransport,
} from "@local/agent-fabric-protocol";

const journalPath = process.env.AGENT_BRIDGE_FAKE_JOURNAL;
if (journalPath === undefined) throw new Error("AGENT_BRIDGE_FAKE_JOURNAL is required");
const requiredJournalPath: string = journalPath;
const bridgeSupported = process.env.AGENT_BRIDGE_FAKE_NO_BRIDGE !== "1";
const exitAfterProvisionMs = Number(process.env.AGENT_BRIDGE_FAKE_EXIT_AFTER_PROVISION_MS ?? "0");

type Action = {
  actionId: string;
  operation: string;
  payloadHash: string;
  status: "terminal";
  history: string[];
  executionCount: number;
  effectCount: number;
  idempotencyProven: true;
  result: Record<string, unknown>;
};
type Journal = { actions: Record<string, Action>; requestLines: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function load(): Journal {
  if (!existsSync(requiredJournalPath)) return { actions: {}, requestLines: [] };
  const value: unknown = JSON.parse(readFileSync(requiredJournalPath, "utf8"));
  if (!isRecord(value) || !isRecord(value.actions) || !Array.isArray(value.requestLines)) {
    throw new Error("agent bridge fake journal is invalid");
  }
  return value as Journal;
}

function save(value: Journal): void {
  writeFileSync(requiredJournalPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function respond(id: string, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ id, result })}\n`);
}

function fail(id: string, code: string, message: string): void {
  process.stdout.write(`${JSON.stringify({ id, error: { code, message } })}\n`);
}

const bridgeContract = {
  schemaVersion: 1,
  method: "provision_agent",
  operations: ["spawn", "attach"],
  secretTransport: "private-handoff",
  bridgeContract: "agent-fabric-session-bridge-v1",
  generationBound: true,
  providerOriginatedActivation: true,
};

let retainedProtocol: Awaited<ReturnType<typeof NdjsonRpcTransport.connect>> | undefined;

async function provision(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const capability = process.env.AGENT_FABRIC_CAPABILITY;
  const socketPath = process.env.AGENT_FABRIC_SOCKET_PATH;
  if (capability === undefined || socketPath === undefined) throw new Error("private child handoff missing");
  const socket = createConnection(socketPath);
  retainedProtocol = await NdjsonRpcTransport.connect(socket, {
    protocolVersion: 1,
    client: { name: "agent-bridge-fake-provider", version: "1.0.0" },
    authentication: { scheme: "capability", credential: capability, clientNonce: `fake_${randomUUID()}` },
    expectedPrincipalKind: "agent",
    requiredFeatures: ["fabric-core.v1"],
    optionalFeatures: [],
  });
  const activation = await retainedProtocol.call(FABRIC_OPERATIONS.getMailboxState, {});
  const providerSessionRef = typeof params.providerSessionRef === "string"
    ? params.providerSessionRef
    : `fake-session:${String(params.targetAgentId)}`;
  const evidenceDigest = `sha256:${createHash("sha256").update(JSON.stringify({
    actionId: params.actionId,
    targetAgentId: params.targetAgentId,
    providerSessionRef,
    activation,
  })).digest("hex")}`;
  return {
    schemaVersion: 1,
    adapterId: "agent-bridge-fake",
    actionId: params.actionId,
    targetAgentId: params.targetAgentId,
    providerSessionRef,
    providerSessionGeneration: 1,
    bridgeGeneration: params.bridgeGeneration,
    bridgeContractDigest: params.bridgeContractDigest,
    activationEvidenceDigest: evidenceDigest,
  };
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  void (async () => {
    const request: unknown = JSON.parse(line);
    if (!isRecord(request) || typeof request.id !== "string" || typeof request.method !== "string" || !isRecord(request.params)) {
      throw new Error("agent bridge fake request is invalid");
    }
    const journal = load();
    journal.requestLines.push(line);
    save(journal);
    if (request.method === "capabilities") {
      respond(request.id, {
        protocolVersion: 1,
        adapterId: "agent-bridge-fake",
        operations: ["capabilities", "status", "spawn", "attach", "dispatch", "lookup_action", "cancel_action", "release"],
        actionJournal: true,
        ...(bridgeSupported ? { agentBridge: bridgeContract } : {}),
      });
      return;
    }
    if (request.method === "spawn") {
      respond(request.id, { resumeReference: `legacy-session:${String(request.params.agentId)}` });
      return;
    }
    if (request.method === "attach") {
      respond(request.id, { resumeReference: request.params.resumeReference });
      return;
    }
    if (request.method === "provision_agent") {
      try {
        const result = await provision(request.params);
        const actionId = String(request.params.actionId);
        const publicPayload = Object.fromEntries(
          Object.entries(request.params).filter(([key]) => key !== "actionId"),
        );
        journal.actions[actionId] = {
          actionId,
          operation: "provision_agent",
          payloadHash: createHash("sha256").update(canonicalJson(publicPayload)).digest("hex"),
          status: "terminal",
          history: ["prepared", "dispatched", "accepted", "terminal"],
          executionCount: 1,
          effectCount: 1,
          idempotencyProven: true,
          result,
        };
        save(journal);
        respond(request.id, result);
        if (
          Number.isFinite(exitAfterProvisionMs) && exitAfterProvisionMs > 0 &&
          process.env.AGENT_FABRIC_HANDOFF_KIND === "agent"
        ) {
          setTimeout(() => process.exit(91), exitAfterProvisionMs);
        }
      } catch (error: unknown) {
        fail(request.id, "PROVISION_FAILED", error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (request.method === "lookup_action") {
      const action = journal.actions[String(request.params.actionId)];
      if (action === undefined) fail(request.id, "ACTION_NOT_FOUND", "action not found");
      else respond(request.id, action);
      return;
    }
    if (request.method === "status") {
      respond(request.id, { healthy: true, matches: true });
      return;
    }
    if (request.method === "release") {
      await retainedProtocol?.close();
      retainedProtocol = undefined;
      respond(request.id, { released: true, deleted: false });
      return;
    }
    fail(request.id, "METHOD_NOT_FOUND", `unsupported ${request.method}`);
  })();
});

input.on("close", () => {
  void retainedProtocol?.close();
});

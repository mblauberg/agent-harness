import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createSdkMcpServer,
  getSessionInfo,
  query,
  tool,
  type Options,
  type Query,
  type SDKMessage,
  type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import { createProviderAdapter, type ProviderBoundary } from "./adapter.js";
import {
  chairLaunchContinuityUnproven,
  createChairLaunchFabricBridge,
  type ChairLaunchFabricBridge,
  type ChairLaunchFabricBridgeInput,
} from "./chair-launch-continuity.js";
import { SqliteAdapterActionJournal } from "./journal.js";
import { journalPathFromArguments, serveAdapter } from "./server.js";
import {
  optionalString,
  isRecord,
  parseChairLaunchProviderResult,
  ProviderAdapterError,
  requiredString,
  takeChairLaunchHandoff,
  type AdapterRequestHandler,
  type ChairLaunchBoundaryInput,
  type ChairLaunchHandoff,
  type ChairLaunchProviderResult,
  type ProviderAdapterCapabilities,
} from "./types.js";

export type ClaudeAgentSdkBoundary = ProviderBoundary;

const CAPABILITIES: ProviderAdapterCapabilities = {
  protocolVersion: 1,
  adapterId: "claude-agent-sdk",
  operations: [
    "capabilities",
    "status",
    "spawn",
    "attach",
    "send_turn",
    "resume_reference",
    "lookup_action",
    "cancel_action",
    "release",
    "launch_chair",
  ],
  actionJournal: true,
  persistentSession: true,
  ephemeralWorker: true,
  controlModes: ["managed"],
  inboxDeliveryModes: ["structured-push"],
  recoveryOperations: ["resume_reference", "lookup_action"],
  compactInPlace: false,
  idempotencyEvidence: "per-action-fail-closed",
  chairLaunch: {
    schemaVersion: 1,
    method: "launch_chair",
    inputSchemaId: "claude-agent-sdk.chair-launch.v1",
    oneUse: true,
    secretTransport: "private-environment",
    environment: {
      capability: "AGENT_FABRIC_CAPABILITY",
      socketPath: "AGENT_FABRIC_SOCKET_PATH",
      attestationChallenge: "AGENT_FABRIC_ATTESTATION_CHALLENGE",
    },
    publicPayloadSchema: {
      type: "object",
      additionalProperties: false,
      required: ["cwd", "modelFamily", "model", "prompt"],
      properties: {
        cwd: { type: "string", minLength: 1, pattern: "^/" },
        modelFamily: { type: "string", const: "anthropic" },
        model: { type: "string", minLength: 1 },
        prompt: { type: "string", minLength: 1 },
        maxTurns: { type: "integer", minimum: 1 },
      },
    },
    noEffectProofSchemas: {},
    attestation: {
      method: "provider-session-random-challenge-v1",
      bridgeContract: "agent-fabric-session-bridge-v1",
      origin: "provider-session-tool-call",
      oneUse: true,
      bridgeLifetime: "provider-session",
      digestAlgorithm: "sha256",
      nativeAttribution: "claude-sdk-assistant-request-tool-use-v1",
    },
  },
};

function validateClaudeChairLaunchPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(["cwd", "modelFamily", "model", "prompt", "maxTurns"]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) {
    throw new ProviderAdapterError("INVALID_PARAMS", "Claude chair launch payload has unexpected fields");
  }
  const cwd = requiredString(payload.cwd, "cwd");
  if (!isAbsolute(cwd)) throw new ProviderAdapterError("INVALID_PARAMS", "cwd must be absolute");
  const modelFamily = requiredString(payload.modelFamily, "modelFamily");
  if (modelFamily !== "anthropic") {
    throw new ProviderAdapterError("INVALID_PARAMS", "Claude chair launch modelFamily must be anthropic");
  }
  const validated: Record<string, unknown> = {
    cwd,
    modelFamily,
    model: requiredString(payload.model, "model"),
    prompt: requiredString(payload.prompt, "prompt"),
  };
  const maxTurns = positiveInteger(payload.maxTurns, "maxTurns");
  if (maxTurns !== undefined) validated.maxTurns = maxTurns;
  return validated;
}

function positiveInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    throw new ProviderAdapterError("INVALID_PARAMS", `${field} must be a positive integer`);
  }
  return value;
}

export function claudeReadOnlyOptions(
  payload: Record<string, unknown>,
  resume?: string,
  executable?: string,
  environment?: Record<string, string>,
): Options {
  const cwd = optionalString(payload.cwd, "cwd");
  const model = optionalString(payload.model, "model");
  const maxTurns = positiveInteger(payload.maxTurns, "maxTurns");
  return {
    ...(cwd === undefined ? {} : { cwd }),
    ...(model === undefined ? {} : { model }),
    ...(maxTurns === undefined ? {} : { maxTurns }),
    ...(resume === undefined ? {} : { resume }),
    ...(executable === undefined ? {} : { pathToClaudeCodeExecutable: executable }),
    ...(environment === undefined ? {} : { env: { ...process.env, ...environment } }),
    tools: [],
    permissionMode: "plan",
    settingSources: [],
    skills: [],
    plugins: [],
  };
}

function prompt(payload: Record<string, unknown>): string {
  return requiredString(payload.prompt ?? payload.instruction ?? payload.initialPrompt, "prompt");
}

async function consumeQuery(
  active: Query,
  onSession?: (sessionId: string) => void,
  onMessage?: (message: SDKMessage) => void,
): Promise<{ resumeReference: string; result: string; usage: unknown; costUsd: number }> {
  let sessionId: string | undefined;
  let terminal: SDKResultMessage | undefined;
  try {
    for await (const message of active) {
      sessionId = message.session_id;
      if (typeof message.session_id === "string") onSession?.(message.session_id);
      onMessage?.(message);
      if (message.type === "result") terminal = message;
    }
  } finally {
    active.close();
  }
  if (terminal === undefined || sessionId === undefined) {
    throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "Claude Agent SDK ended without a terminal result");
  }
  if (terminal.subtype !== "success") {
    throw new ProviderAdapterError("PROVIDER_TURN_FAILED", terminal.errors.join("; "), {
      resumeReference: sessionId,
      subtype: terminal.subtype,
    });
  }
  return {
    resumeReference: sessionId,
    result: terminal.result,
    usage: terminal.usage,
    costUsd: terminal.total_cost_usd,
  };
}

type ClaudeChairSession = {
  bridge: ChairLaunchFabricBridge;
  mcp?: ClaudeChairMcpBridge;
  providerSessionRef?: string;
  providerSessionGeneration: number;
  attestationTurnRef?: string;
  attestationInvocationRef?: string;
  attestationChallengeResponse?: string;
  busy?: boolean;
};

export type ClaudeChairMcpBridge = {
  serverName: string;
  server: ReturnType<typeof createSdkMcpServer>;
  attestationToolName: string;
  mailboxToolName: string;
  attestationTool: { handler(args: { challengeResponse: string }, extra: unknown): Promise<unknown> };
  mailboxTool: { handler(args: Record<string, never>, extra: unknown): Promise<unknown> };
};

function observeClaudeAttestationToolUse(
  session: ClaudeChairSession,
  message: SDKMessage,
  attestationToolName: string,
): void {
  if (
    message.type !== "assistant" ||
    !isRecord(message.message) ||
    !Array.isArray(message.message.content)
  ) return;
  const toolUse = message.message.content.find((block) => (
    isRecord(block) &&
    block.type === "tool_use" &&
    block.name === attestationToolName &&
    typeof block.id === "string" &&
    block.id.length > 0 &&
    isRecord(block.input) &&
    Object.keys(block.input).length === 1 &&
    typeof block.input.challengeResponse === "string" &&
    /^[0-9a-f]{64}$/u.test(block.input.challengeResponse)
  ));
  if (
    !isRecord(toolUse) ||
    typeof toolUse.id !== "string" ||
    !isRecord(toolUse.input) ||
    typeof toolUse.input.challengeResponse !== "string"
  ) return;
  const turnRef = typeof message.request_id === "string" && message.request_id.length > 0
    ? message.request_id
    : message.uuid;
  session.attestationTurnRef = turnRef;
  session.attestationInvocationRef = toolUse.id;
  session.attestationChallengeResponse = toolUse.input.challengeResponse;
}

export function createClaudeChairMcpBridge(session: ClaudeChairSession): ClaudeChairMcpBridge {
  const serverName = "agent_fabric_session";
  const attestationTool = tool(
    session.bridge.challengeToolName,
    "Required one-use Agent Fabric provider-session continuity challenge.",
    { challengeResponse: z.string().regex(/^[0-9a-f]{64}$/u) },
    async ({ challengeResponse }) => {
      if (
        session.providerSessionRef === undefined ||
        session.attestationTurnRef === undefined ||
        session.attestationInvocationRef === undefined ||
        session.attestationChallengeResponse !== challengeResponse
      ) {
        throw new ProviderAdapterError("CHAIR_CONTINUITY_UNPROVEN", "Claude MCP invocation lacks native session, turn or tool-call evidence");
      }
      await session.bridge.attest({
        providerSessionRef: session.providerSessionRef,
        providerSessionGeneration: session.providerSessionGeneration,
        providerTurnRef: session.attestationTurnRef,
        providerInvocationRef: session.attestationInvocationRef,
        challengeResponse,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          attested: true,
          challengeDigest: session.bridge.challengeDigest,
        }) }],
      };
    },
    { alwaysLoad: true },
  );
  const mailboxTool = tool(
    "fabric_get_mailbox_state",
    "Read this chair's mailbox state through its retained Agent Fabric bridge.",
    {},
    async () => ({
      content: [{
        type: "text" as const,
        text: JSON.stringify(await session.bridge.call("getMailboxState", {})),
      }],
    }),
    { alwaysLoad: true },
  );
  return {
    serverName,
    server: createSdkMcpServer({
      name: serverName,
      version: "1.0.0",
      alwaysLoad: true,
      tools: [attestationTool, mailboxTool],
    }),
    attestationToolName: `mcp__${serverName}__${session.bridge.challengeToolName}`,
    mailboxToolName: `mcp__${serverName}__fabric_get_mailbox_state`,
    attestationTool,
    mailboxTool,
  };
}

function claudeChairOptions(
  payload: Record<string, unknown>,
  executable: string | undefined,
  resume: string | undefined,
  mcp: ClaudeChairMcpBridge,
): Options {
  return {
    ...claudeReadOnlyOptions(payload, resume, executable),
    mcpServers: { [mcp.serverName]: mcp.server },
    allowedTools: [mcp.attestationToolName, mcp.mailboxToolName],
  };
}

type BridgeFactory = (input: ChairLaunchFabricBridgeInput) => Promise<ChairLaunchFabricBridge>;
type ClaudeMcpBridgeFactory = (session: ClaudeChairSession) => ClaudeChairMcpBridge;

export class InstalledClaudeAgentSdkBoundary implements ClaudeAgentSdkBoundary {
  readonly #executable: string | undefined;
  readonly #query: typeof query;
  readonly #bridgeFactory: BridgeFactory;
  readonly #mcpBridgeFactory: ClaudeMcpBridgeFactory;
  readonly #chairSessions = new Map<string, ClaudeChairSession>();

  constructor(options?: string | {
    executable?: string;
    query?: typeof query;
    bridgeFactory?: BridgeFactory;
    mcpBridgeFactory?: ClaudeMcpBridgeFactory;
  }) {
    if (typeof options === "string" || options === undefined) {
      this.#executable = options;
      this.#query = query;
      this.#bridgeFactory = createChairLaunchFabricBridge;
      this.#mcpBridgeFactory = createClaudeChairMcpBridge;
    } else {
      this.#executable = options.executable;
      this.#query = options.query ?? query;
      this.#bridgeFactory = options.bridgeFactory ?? createChairLaunchFabricBridge;
      this.#mcpBridgeFactory = options.mcpBridgeFactory ?? createClaudeChairMcpBridge;
    }
  }

  async status(input: { resumeReference?: string }): Promise<Record<string, unknown>> {
    if (input.resumeReference === undefined) return { healthy: true, providerSession: "unselected" };
    const info = await getSessionInfo(input.resumeReference);
    return info === undefined
      ? { healthy: false, resumeReference: input.resumeReference, state: "not-found" }
      : {
          healthy: true,
          resumeReference: info.sessionId,
          state: "resumable",
          lastModified: info.lastModified,
          ...(info.cwd === undefined ? {} : { cwd: info.cwd }),
        };
  }

  async spawn(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const prior = optionalString(payload.priorResumeReference, "priorResumeReference");
    return await consumeQuery(this.#query({ prompt: prompt(payload), options: claudeReadOnlyOptions(payload, prior, this.#executable) }));
  }

  async launchChair(input: ChairLaunchBoundaryInput): Promise<ChairLaunchProviderResult> {
    const bridge = await this.#bridgeFactory({
      providerAdapterId: input.providerAdapterId,
      providerActionId: input.actionId,
      providerContractDigest: input.providerContractDigest,
      challengeDigest: input.challengeDigest,
      capability: input.environment.AGENT_FABRIC_CAPABILITY,
      socketPath: input.environment.AGENT_FABRIC_SOCKET_PATH,
      attestationChallenge: input.environment.AGENT_FABRIC_ATTESTATION_CHALLENGE,
    });
    const session: ClaudeChairSession = { bridge, providerSessionGeneration: 1 };
    const mcp = this.#mcpBridgeFactory(session);
    session.mcp = mcp;
    try {
      const completed = await consumeQuery(this.#query({
        prompt: `Before continuing, invoke ${mcp.attestationToolName} exactly once with {"challengeResponse":"${bridge.challengeResponse}"}. ${prompt(input.payload)}`,
        options: claudeChairOptions(input.payload, this.#executable, undefined, mcp),
      }), (sessionId) => {
        session.providerSessionRef = sessionId;
        bridge.bindProviderSession(sessionId, session.providerSessionGeneration);
      }, (message) => observeClaudeAttestationToolUse(session, message, mcp.attestationToolName));
      const evidence = {
        resumeReference: completed.resumeReference,
        providerSessionGeneration: 1,
        providerContractDigest: input.providerContractDigest,
      };
      try {
        const result = parseChairLaunchProviderResult(await bridge.result(), {
          providerAdapterId: input.providerAdapterId,
          providerActionId: input.actionId,
          providerContractDigest: input.providerContractDigest,
          challengeDigest: input.challengeDigest,
        });
        this.#chairSessions.set(completed.resumeReference, session);
        return result;
      } catch {
        throw chairLaunchContinuityUnproven(evidence);
      }
    } catch (error: unknown) {
      await bridge.close();
      throw error;
    }
  }

  async attach(input: { resumeReference: string; payload: Record<string, unknown> }): Promise<Record<string, unknown>> {
    const info = await getSessionInfo(input.resumeReference, {
      ...(typeof input.payload.cwd === "string" ? { dir: input.payload.cwd } : {}),
    });
    if (info === undefined) {
      throw new ProviderAdapterError("SESSION_NOT_FOUND", "Claude session cannot be attached", {
        resumeReference: input.resumeReference,
      });
    }
    return { resumeReference: info.sessionId, attached: true };
  }

  async sendTurn(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resumeReference = requiredString(payload.resumeReference, "resumeReference");
    const session = this.#chairSessions.get(resumeReference);
    if (session === undefined) {
      return await consumeQuery(this.#query({ prompt: prompt(payload), options: claudeReadOnlyOptions(payload, resumeReference, this.#executable) }));
    }
    const mcp = session.mcp;
    if (mcp === undefined) {
      throw new ProviderAdapterError("CHAIR_BRIDGE_LOST", "Claude chair MCP bridge is unavailable");
    }
    if (session.busy === true) {
      throw new ProviderAdapterError("PROVIDER_SESSION_BUSY", "Claude chair session already has an active turn");
    }
    session.busy = true;
    try {
      return await consumeQuery(this.#query({
        prompt: prompt(payload),
        options: claudeChairOptions(payload, this.#executable, resumeReference, mcp),
      }), (sessionId) => session.bridge.bindProviderSession(sessionId, session.providerSessionGeneration));
    } catch (error: unknown) {
      if (error instanceof ProviderAdapterError && error.code === "PROVIDER_TURN_FAILED") throw error;
      this.#chairSessions.delete(resumeReference);
      await session.bridge.close();
      throw new ProviderAdapterError("CHAIR_BRIDGE_LOST", "Claude chair provider context was lost", undefined, {
        cause: error,
      });
    } finally {
      session.busy = false;
    }
  }

  async interrupt(): Promise<Record<string, unknown>> {
    throw new ProviderAdapterError(
      "CAPABILITY_UNAVAILABLE",
      "Claude SDK interruption requires the owning live Query object; the process-isolated fabric transport cannot prove it",
      { capability: "interrupt" },
    );
  }

  async release(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resumeReference = optionalString(payload.resumeReference, "resumeReference");
    if (resumeReference !== undefined) {
      const session = this.#chairSessions.get(resumeReference);
      this.#chairSessions.delete(resumeReference);
      await session?.bridge.close();
    }
    return { released: true, deleted: false, ...(resumeReference === undefined ? {} : { resumeReference }) };
  }

  async closeAll(): Promise<void> {
    const sessions = [...this.#chairSessions.values()];
    this.#chairSessions.clear();
    await Promise.allSettled(sessions.map(async (session) => await session.bridge.close()));
  }
}

export function createClaudeAgentSdkAdapter(options: {
  boundary: ClaudeAgentSdkBoundary;
  journal: SqliteAdapterActionJournal;
  chairLaunchHandoff?: ChairLaunchHandoff;
}): AdapterRequestHandler {
  return createProviderAdapter({
    capabilities: CAPABILITIES,
    boundary: options.boundary,
    journal: options.journal,
    chairLaunch: {
      ...(options.chairLaunchHandoff === undefined ? {} : { handoff: options.chairLaunchHandoff }),
      validatePayload: validateClaudeChairLaunchPayload,
    },
  });
}

export async function runClaudeAgentSdkAdapter(arguments_: string[] = process.argv.slice(2)): Promise<void> {
  const journal = new SqliteAdapterActionJournal(journalPathFromArguments("claude-agent-sdk", arguments_));
  const chairLaunchHandoff = takeChairLaunchHandoff(process.env);
  const providerIndex = arguments_.indexOf("--provider-executable");
  const providerExecutable = providerIndex === -1 ? undefined : arguments_[providerIndex + 1];
  const boundary = new InstalledClaudeAgentSdkBoundary(providerExecutable);
  try {
    await serveAdapter(
      createClaudeAgentSdkAdapter({
        boundary,
        journal,
        ...(chairLaunchHandoff === undefined ? {} : { chairLaunchHandoff }),
      }),
      { input: process.stdin, output: process.stdout },
    );
  } finally {
    await boundary.closeAll();
    journal.close();
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  await runClaudeAgentSdkAdapter();
}

import { pathToFileURL } from "node:url";

import {
  getSessionInfo,
  query,
  type Options,
  type Query,
  type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";

import { createProviderAdapter, type ProviderBoundary } from "./adapter.js";
import { SqliteAdapterActionJournal } from "./journal.js";
import { journalPathFromArguments, serveAdapter } from "./server.js";
import {
  optionalString,
  ProviderAdapterError,
  requiredString,
  type AdapterRequestHandler,
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
  ],
  actionJournal: true,
  persistentSession: true,
  ephemeralWorker: true,
  controlModes: ["managed"],
  inboxDeliveryModes: ["structured-push"],
  recoveryOperations: ["resume_reference", "lookup_action"],
  compactInPlace: false,
  idempotencyEvidence: "per-action-fail-closed",
};

function positiveInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    throw new ProviderAdapterError("INVALID_PARAMS", `${field} must be a positive integer`);
  }
  return value;
}

export function claudeReadOnlyOptions(payload: Record<string, unknown>, resume?: string, executable?: string): Options {
  const cwd = optionalString(payload.cwd, "cwd");
  const model = optionalString(payload.model, "model");
  const maxTurns = positiveInteger(payload.maxTurns, "maxTurns");
  return {
    ...(cwd === undefined ? {} : { cwd }),
    ...(model === undefined ? {} : { model }),
    ...(maxTurns === undefined ? {} : { maxTurns }),
    ...(resume === undefined ? {} : { resume }),
    ...(executable === undefined ? {} : { pathToClaudeCodeExecutable: executable }),
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

async function consumeQuery(active: Query): Promise<{ resumeReference: string; result: string; usage: unknown; costUsd: number }> {
  let sessionId: string | undefined;
  let terminal: SDKResultMessage | undefined;
  try {
    for await (const message of active) {
      sessionId = message.session_id;
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

export class InstalledClaudeAgentSdkBoundary implements ClaudeAgentSdkBoundary {
  readonly #executable: string | undefined;

  constructor(executable?: string) {
    this.#executable = executable;
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
    return await consumeQuery(query({ prompt: prompt(payload), options: claudeReadOnlyOptions(payload, prior, this.#executable) }));
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
    return await consumeQuery(query({ prompt: prompt(payload), options: claudeReadOnlyOptions(payload, resumeReference, this.#executable) }));
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
    return { released: true, deleted: false, ...(resumeReference === undefined ? {} : { resumeReference }) };
  }
}

export function createClaudeAgentSdkAdapter(options: {
  boundary: ClaudeAgentSdkBoundary;
  journal: SqliteAdapterActionJournal;
}): AdapterRequestHandler {
  return createProviderAdapter({ capabilities: CAPABILITIES, ...options });
}

export async function runClaudeAgentSdkAdapter(arguments_: string[] = process.argv.slice(2)): Promise<void> {
  const journal = new SqliteAdapterActionJournal(journalPathFromArguments("claude-agent-sdk", arguments_));
  const providerIndex = arguments_.indexOf("--provider-executable");
  const providerExecutable = providerIndex === -1 ? undefined : arguments_[providerIndex + 1];
  try {
    await serveAdapter(
      createClaudeAgentSdkAdapter({ boundary: new InstalledClaudeAgentSdkBoundary(providerExecutable), journal }),
      { input: process.stdin, output: process.stdout },
    );
  } finally {
    journal.close();
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  await runClaudeAgentSdkAdapter();
}

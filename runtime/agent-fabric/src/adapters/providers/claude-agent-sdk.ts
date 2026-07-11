import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import {
  getSessionInfo,
  query,
  type Options,
  type Query,
  type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";

import { createProviderAdapter, type ProviderBoundary } from "./adapter.js";
import {
  chairLaunchContinuityUnproven,
  probeChairLaunchFabricContinuity,
  type ChairLaunchContinuityProbe,
} from "./chair-launch-continuity.js";
import { SqliteAdapterActionJournal } from "./journal.js";
import { journalPathFromArguments, serveAdapter } from "./server.js";
import {
  optionalString,
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
  readonly #query: typeof query;
  readonly #continuityProbe: ChairLaunchContinuityProbe;

  constructor(options?: string | {
    executable?: string;
    query?: typeof query;
    continuityProbe?: ChairLaunchContinuityProbe;
  }) {
    if (typeof options === "string" || options === undefined) {
      this.#executable = options;
      this.#query = query;
      this.#continuityProbe = probeChairLaunchFabricContinuity;
    } else {
      this.#executable = options.executable;
      this.#query = options.query ?? query;
      this.#continuityProbe = options.continuityProbe ?? probeChairLaunchFabricContinuity;
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
    const completed = await consumeQuery(this.#query({
      prompt: prompt(input.payload),
      options: claudeReadOnlyOptions(input.payload, undefined, this.#executable, input.environment),
    }));
    const evidence = {
      resumeReference: completed.resumeReference,
      providerSessionGeneration: 1,
      providerContractDigest: input.providerContractDigest,
    };
    try {
      return parseChairLaunchProviderResult(await this.#continuityProbe({
        capability: input.environment.AGENT_FABRIC_CAPABILITY,
        socketPath: input.environment.AGENT_FABRIC_SOCKET_PATH,
        ...evidence,
      }), input.providerContractDigest);
    } catch {
      throw chairLaunchContinuityUnproven(evidence);
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
    return await consumeQuery(this.#query({ prompt: prompt(payload), options: claudeReadOnlyOptions(payload, resumeReference, this.#executable) }));
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
  try {
    await serveAdapter(
      createClaudeAgentSdkAdapter({
        boundary: new InstalledClaudeAgentSdkBoundary(providerExecutable),
        journal,
        ...(chairLaunchHandoff === undefined ? {} : { chairLaunchHandoff }),
      }),
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

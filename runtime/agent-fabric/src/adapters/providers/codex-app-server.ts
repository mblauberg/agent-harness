import { pathToFileURL } from "node:url";
import { isAbsolute } from "node:path";

import { createProviderAdapter, type ProviderBoundary } from "./adapter.js";
import {
  chairLaunchContinuityUnproven,
  probeChairLaunchFabricContinuity,
  type ChairLaunchContinuityProbe,
} from "./chair-launch-continuity.js";
import { CodexJsonRpcConnection } from "./codex-json-rpc.js";
import { SqliteAdapterActionJournal } from "./journal.js";
import { journalPathFromArguments, serveAdapter } from "./server.js";
import {
  isRecord,
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

export type CodexAppServerBoundary = ProviderBoundary & {
  steer(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  compact(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
};

export function codexAppServerCommand(executable: string): string[] {
  if (!isAbsolute(executable)) throw new TypeError("Codex provider executable must be absolute");
  return [executable, "app-server"];
}

const CAPABILITIES: ProviderAdapterCapabilities = {
  protocolVersion: 1,
  adapterId: "codex-app-server",
  operations: [
    "capabilities",
    "status",
    "spawn",
    "attach",
    "send_turn",
    "steer",
    "interrupt",
    "compact",
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
  compactInPlace: true,
  idempotencyEvidence: "per-action-fail-closed",
  chairLaunch: {
    schemaVersion: 1,
    method: "launch_chair",
    inputSchemaId: "codex-app-server.chair-launch.v1",
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
        modelFamily: { type: "string", const: "openai" },
        model: { type: "string", minLength: 1 },
        prompt: { type: "string", minLength: 1 },
        developerInstructions: { type: "string", minLength: 1 },
        baseInstructions: { type: "string", minLength: 1 },
        serviceTier: { type: "string", minLength: 1 },
        ephemeral: { type: "boolean", const: false },
      },
    },
    noEffectProofSchemas: {},
  },
};

function validateCodexChairLaunchPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const stringFields = ["developerInstructions", "baseInstructions", "serviceTier"] as const;
  const allowed = new Set(["cwd", "modelFamily", "model", "prompt", "ephemeral", ...stringFields]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) {
    throw new ProviderAdapterError("INVALID_PARAMS", "Codex chair launch payload has unexpected fields");
  }
  const cwd = requiredString(payload.cwd, "cwd");
  if (!isAbsolute(cwd)) throw new ProviderAdapterError("INVALID_PARAMS", "cwd must be absolute");
  const modelFamily = requiredString(payload.modelFamily, "modelFamily");
  if (modelFamily !== "openai") {
    throw new ProviderAdapterError("INVALID_PARAMS", "Codex chair launch modelFamily must be openai");
  }
  const validated: Record<string, unknown> = {
    cwd,
    modelFamily,
    model: requiredString(payload.model, "model"),
    prompt: requiredString(payload.prompt, "prompt"),
  };
  for (const field of stringFields) copyString(payload, field, validated);
  if (payload.ephemeral === false) validated.ephemeral = false;
  else if (payload.ephemeral !== undefined) {
    throw new ProviderAdapterError("INVALID_PARAMS", "chair launch cannot create an ephemeral Codex thread");
  }
  return validated;
}

function threadId(payload: Record<string, unknown>): string {
  return requiredString(payload.resumeReference ?? payload.threadId, "resumeReference");
}

function textInput(payload: Record<string, unknown>): { type: "text"; text: string }[] {
  return [{ type: "text", text: requiredString(payload.prompt ?? payload.instruction, "prompt") }];
}

function threadFromResponse(value: unknown, operation: string): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.thread) || typeof value.thread.id !== "string") {
    throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", `Codex ${operation} returned no thread ID`);
  }
  return value.thread;
}

function turnFromResponse(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.turn) || typeof value.turn.id !== "string") {
    throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "Codex turn/start returned no turn ID");
  }
  return value.turn;
}

export function codexCompletedTurnResult(turn: Record<string, unknown>): string {
  if (turn.status !== "completed") {
    const detail = isRecord(turn.error) && typeof turn.error.message === "string"
      ? `: ${turn.error.message}`
      : "";
    throw new ProviderAdapterError("PROVIDER_TURN_FAILED", `Codex turn ended with status ${String(turn.status)}${detail}`);
  }
  if (!Array.isArray(turn.items)) {
    throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "Codex completed turn returned no item list");
  }
  const messages = turn.items.filter(
    (item): item is Record<string, unknown> => isRecord(item) && item.type === "agentMessage" && typeof item.text === "string",
  );
  const result = messages.at(-1)?.text;
  if (typeof result !== "string" || result.length === 0) {
    throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "Codex completed turn returned no agent message");
  }
  return result;
}

function copyString(payload: Record<string, unknown>, key: string, target: Record<string, unknown>): void {
  const value = optionalString(payload[key], key);
  if (value !== undefined) target[key] = value;
}

export function codexThreadConfiguration(payload: Record<string, unknown>): Record<string, unknown> {
  const configuration: Record<string, unknown> = { sandbox: "read-only", approvalPolicy: "never" };
  for (const key of ["cwd", "model", "modelProvider", "developerInstructions", "baseInstructions", "serviceTier"]) {
    copyString(payload, key, configuration);
  }
  if (typeof payload.ephemeral === "boolean") configuration.ephemeral = payload.ephemeral;
  return configuration;
}

type CodexConnection = Pick<
  CodexJsonRpcConnection,
  "initialize" | "request" | "waitForNotification" | "close"
>;

type ConnectionFactory = (environment?: Record<string, string>) => CodexConnection;

export class InstalledCodexAppServerBoundary implements CodexAppServerBoundary {
  readonly #connectionFactory: ConnectionFactory;
  readonly #continuityProbe: ChairLaunchContinuityProbe;
  readonly #connections = new Map<string, CodexConnection>();

  constructor(
    connectionFactory: ConnectionFactory,
    continuityProbe: ChairLaunchContinuityProbe = probeChairLaunchFabricContinuity,
  ) {
    this.#connectionFactory = connectionFactory;
    this.#continuityProbe = continuityProbe;
  }

  async #withConnection<T>(operation: (connection: CodexConnection) => Promise<T>): Promise<T> {
    const connection = this.#connectionFactory();
    try {
      await connection.initialize();
      return await operation(connection);
    } finally {
      await connection.close();
    }
  }

  async #openConnection(environment?: Record<string, string>): Promise<CodexConnection> {
    const connection = this.#connectionFactory(environment);
    await connection.initialize();
    return connection;
  }

  async #sessionConnection(resumeReference: string): Promise<CodexConnection> {
    const existing = this.#connections.get(resumeReference);
    if (existing !== undefined) return existing;
    const connection = await this.#openConnection();
    try {
      await connection.request("thread/resume", { threadId: resumeReference });
      this.#connections.set(resumeReference, connection);
      return connection;
    } catch (error: unknown) {
      await connection.close();
      throw error;
    }
  }

  async #completeTurn(
    connection: CodexConnection,
    resumeReference: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await connection.request("turn/start", {
      threadId: resumeReference,
      input: textInput(payload),
      ...(typeof payload.model === "string" ? { model: payload.model } : {}),
      ...(typeof payload.effort === "string" ? { effort: payload.effort } : {}),
    });
    const turn = turnFromResponse(response);
    const completed = await connection.waitForNotification(
      "turn/completed",
      (params) => params.threadId === resumeReference && isRecord(params.turn) && params.turn.id === turn.id,
    );
    const completedTurn = isRecord(completed.turn) ? completed.turn : turn;
    if (completedTurn.status !== "completed") codexCompletedTurnResult(completedTurn);
    const readResponse = await connection.request("thread/read", { threadId: resumeReference, includeTurns: true });
    const hydratedThread = threadFromResponse(readResponse, "thread/read");
    const hydratedTurn = Array.isArray(hydratedThread.turns)
      ? hydratedThread.turns.find((candidate) => isRecord(candidate) && candidate.id === turn.id)
      : undefined;
    if (!isRecord(hydratedTurn)) {
      throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "Codex thread/read returned no completed turn");
    }
    return {
      resumeReference,
      turnId: turn.id,
      status: hydratedTurn.status,
      result: codexCompletedTurnResult(hydratedTurn),
    };
  }

  async closeAll(): Promise<void> {
    const connections = [...this.#connections.values()];
    this.#connections.clear();
    await Promise.all(connections.map(async (connection) => await connection.close()));
  }

  async status(input: { resumeReference?: string }): Promise<Record<string, unknown>> {
    if (input.resumeReference === undefined) return { healthy: true, providerSession: "unselected" };
    return await this.#withConnection(async (connection) => {
      const response = await connection.request("thread/read", { threadId: input.resumeReference, includeTurns: false });
      const thread = threadFromResponse(response, "thread/read");
      return { healthy: true, resumeReference: thread.id, status: thread.status ?? "unknown" };
    });
  }

  async spawn(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const connection = await this.#openConnection();
    try {
      const prior = optionalString(payload.priorResumeReference, "priorResumeReference");
      const response = prior === undefined
        ? await connection.request("thread/start", codexThreadConfiguration(payload))
        : await connection.request("thread/resume", { threadId: prior, ...codexThreadConfiguration(payload) });
      const thread = threadFromResponse(response, prior === undefined ? "thread/start" : "thread/resume");
      this.#connections.set(String(thread.id), connection);
      return { resumeReference: thread.id };
    } catch (error: unknown) {
      await connection.close();
      throw error;
    }
  }

  async launchChair(input: ChairLaunchBoundaryInput): Promise<ChairLaunchProviderResult> {
    const connection = await this.#openConnection(input.environment);
    try {
      const response = await connection.request("thread/start", codexThreadConfiguration(input.payload));
      const thread = threadFromResponse(response, "thread/start");
      const resumeReference = String(thread.id);
      await this.#completeTurn(connection, resumeReference, input.payload);
      const evidence = {
        resumeReference,
        providerSessionGeneration: 1,
        providerContractDigest: input.providerContractDigest,
      };
      let result: ChairLaunchProviderResult;
      try {
        result = parseChairLaunchProviderResult(await this.#continuityProbe({
          capability: input.environment.AGENT_FABRIC_CAPABILITY,
          socketPath: input.environment.AGENT_FABRIC_SOCKET_PATH,
          ...evidence,
        }), input.providerContractDigest);
      } catch {
        throw chairLaunchContinuityUnproven(evidence);
      }
      this.#connections.set(resumeReference, connection);
      return result;
    } catch (error: unknown) {
      await connection.close();
      throw error;
    }
  }

  async attach(input: { resumeReference: string; payload: Record<string, unknown> }): Promise<Record<string, unknown>> {
    const connection = await this.#openConnection();
    try {
      const response = await connection.request("thread/resume", {
        threadId: input.resumeReference,
        ...codexThreadConfiguration(input.payload),
      });
      const thread = threadFromResponse(response, "thread/resume");
      this.#connections.set(String(thread.id), connection);
      return { resumeReference: thread.id, attached: true };
    } catch (error: unknown) {
      await connection.close();
      throw error;
    }
  }

  async sendTurn(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resumeReference = threadId(payload);
    const connection = await this.#sessionConnection(resumeReference);
    return await this.#completeTurn(connection, resumeReference, payload);
  }

  async steer(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resumeReference = threadId(payload);
    const expectedTurnId = requiredString(payload.expectedTurnId ?? payload.turnId, "expectedTurnId");
    const connection = await this.#sessionConnection(resumeReference);
    return await (async () => {
      const response = await connection.request("turn/steer", {
        threadId: resumeReference,
        expectedTurnId,
        input: textInput(payload),
      });
      if (!isRecord(response) || typeof response.turnId !== "string") {
        throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "Codex turn/steer returned no turn ID");
      }
      return { resumeReference, turnId: response.turnId, steered: true };
    })();
  }

  async interrupt(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resumeReference = threadId(payload);
    const turnIdValue = requiredString(payload.turnId, "turnId");
    const connection = await this.#sessionConnection(resumeReference);
    return await (async () => {
      await connection.request("turn/interrupt", { threadId: resumeReference, turnId: turnIdValue });
      return { resumeReference, turnId: turnIdValue, interrupted: true };
    })();
  }

  async compact(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resumeReference = threadId(payload);
    const connection = await this.#sessionConnection(resumeReference);
    return await (async () => {
      await connection.request("thread/compact/start", { threadId: resumeReference });
      await connection.waitForNotification(
        "thread/compacted",
        (params) => params.threadId === resumeReference,
      );
      return { resumeReference, compacted: true };
    })();
  }

  async release(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resumeReference = optionalString(payload.resumeReference, "resumeReference");
    if (resumeReference !== undefined) {
      const connection = this.#connections.get(resumeReference);
      this.#connections.delete(resumeReference);
      await connection?.close();
    }
    return { released: true, deleted: false, ...(resumeReference === undefined ? {} : { resumeReference }) };
  }
}

export function createCodexAppServerAdapter(options: {
  boundary: CodexAppServerBoundary;
  journal: SqliteAdapterActionJournal;
  chairLaunchHandoff?: ChairLaunchHandoff;
}): AdapterRequestHandler {
  return createProviderAdapter({
    capabilities: CAPABILITIES,
    boundary: options.boundary,
    journal: options.journal,
    chairLaunch: {
      ...(options.chairLaunchHandoff === undefined ? {} : { handoff: options.chairLaunchHandoff }),
      validatePayload: validateCodexChairLaunchPayload,
    },
  });
}

export async function runCodexAppServerAdapter(arguments_: string[] = process.argv.slice(2)): Promise<void> {
  const journal = new SqliteAdapterActionJournal(journalPathFromArguments("codex-app-server", arguments_));
  const chairLaunchHandoff = takeChairLaunchHandoff(process.env);
  const providerIndex = arguments_.indexOf("--provider-executable");
  const providerExecutable = providerIndex === -1 ? undefined : arguments_[providerIndex + 1];
  if (providerExecutable === undefined) throw new Error("codex-app-server adapter requires --provider-executable");
  const boundary = new InstalledCodexAppServerBoundary(
    (environment) => new CodexJsonRpcConnection(codexAppServerCommand(providerExecutable), environment),
  );
  try {
    await serveAdapter(
      createCodexAppServerAdapter({
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
  await runCodexAppServerAdapter();
}

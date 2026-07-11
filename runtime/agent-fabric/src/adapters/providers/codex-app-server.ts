import { pathToFileURL } from "node:url";
import { isAbsolute } from "node:path";

import { createProviderAdapter, type ProviderBoundary } from "./adapter.js";
import { CodexJsonRpcConnection } from "./codex-json-rpc.js";
import { SqliteAdapterActionJournal } from "./journal.js";
import { journalPathFromArguments, serveAdapter } from "./server.js";
import {
  isRecord,
  optionalString,
  ProviderAdapterError,
  requiredString,
  type AdapterRequestHandler,
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
  ],
  actionJournal: true,
  persistentSession: true,
  ephemeralWorker: true,
  controlModes: ["managed"],
  inboxDeliveryModes: ["structured-push"],
  recoveryOperations: ["resume_reference", "lookup_action"],
  compactInPlace: true,
  idempotencyEvidence: "per-action-fail-closed",
};

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

function copyString(payload: Record<string, unknown>, key: string, target: Record<string, unknown>): void {
  const value = optionalString(payload[key], key);
  if (value !== undefined) target[key] = value;
}

export function codexThreadConfiguration(payload: Record<string, unknown>): Record<string, unknown> {
  const configuration: Record<string, unknown> = {};
  for (const key of ["cwd", "model", "modelProvider", "developerInstructions", "baseInstructions", "sandbox", "serviceTier"]) {
    copyString(payload, key, configuration);
  }
  if (typeof payload.ephemeral === "boolean") configuration.ephemeral = payload.ephemeral;
  if (payload.approvalPolicy === "never" || payload.approvalPolicy === "on-request" || payload.approvalPolicy === "untrusted") {
    configuration.approvalPolicy = payload.approvalPolicy;
  }
  return configuration;
}

type ConnectionFactory = () => CodexJsonRpcConnection;

export class InstalledCodexAppServerBoundary implements CodexAppServerBoundary {
  readonly #connectionFactory: ConnectionFactory;

  constructor(connectionFactory: ConnectionFactory) {
    this.#connectionFactory = connectionFactory;
  }

  async #withConnection<T>(operation: (connection: CodexJsonRpcConnection) => Promise<T>): Promise<T> {
    const connection = this.#connectionFactory();
    try {
      await connection.initialize();
      return await operation(connection);
    } finally {
      await connection.close();
    }
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
    return await this.#withConnection(async (connection) => {
      const prior = optionalString(payload.priorResumeReference, "priorResumeReference");
      const response = prior === undefined
        ? await connection.request("thread/start", codexThreadConfiguration(payload))
        : await connection.request("thread/resume", { threadId: prior, ...codexThreadConfiguration(payload) });
      const thread = threadFromResponse(response, prior === undefined ? "thread/start" : "thread/resume");
      return { resumeReference: thread.id };
    });
  }

  async attach(input: { resumeReference: string; payload: Record<string, unknown> }): Promise<Record<string, unknown>> {
    return await this.#withConnection(async (connection) => {
      const response = await connection.request("thread/resume", {
        threadId: input.resumeReference,
        ...codexThreadConfiguration(input.payload),
      });
      const thread = threadFromResponse(response, "thread/resume");
      return { resumeReference: thread.id, attached: true };
    });
  }

  async sendTurn(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resumeReference = threadId(payload);
    return await this.#withConnection(async (connection) => {
      await connection.request("thread/resume", { threadId: resumeReference });
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
      return {
        resumeReference,
        turnId: turn.id,
        status: completedTurn.status ?? "completed",
      };
    });
  }

  async steer(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resumeReference = threadId(payload);
    const expectedTurnId = requiredString(payload.expectedTurnId ?? payload.turnId, "expectedTurnId");
    return await this.#withConnection(async (connection) => {
      await connection.request("thread/resume", { threadId: resumeReference });
      const response = await connection.request("turn/steer", {
        threadId: resumeReference,
        expectedTurnId,
        input: textInput(payload),
      });
      if (!isRecord(response) || typeof response.turnId !== "string") {
        throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "Codex turn/steer returned no turn ID");
      }
      return { resumeReference, turnId: response.turnId, steered: true };
    });
  }

  async interrupt(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resumeReference = threadId(payload);
    const turnIdValue = requiredString(payload.turnId, "turnId");
    return await this.#withConnection(async (connection) => {
      await connection.request("thread/resume", { threadId: resumeReference });
      await connection.request("turn/interrupt", { threadId: resumeReference, turnId: turnIdValue });
      return { resumeReference, turnId: turnIdValue, interrupted: true };
    });
  }

  async compact(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resumeReference = threadId(payload);
    return await this.#withConnection(async (connection) => {
      await connection.request("thread/resume", { threadId: resumeReference });
      await connection.request("thread/compact/start", { threadId: resumeReference });
      await connection.waitForNotification(
        "thread/compacted",
        (params) => params.threadId === resumeReference,
      );
      return { resumeReference, compacted: true };
    });
  }

  async release(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resumeReference = optionalString(payload.resumeReference, "resumeReference");
    return { released: true, deleted: false, ...(resumeReference === undefined ? {} : { resumeReference }) };
  }
}

export function createCodexAppServerAdapter(options: {
  boundary: CodexAppServerBoundary;
  journal: SqliteAdapterActionJournal;
}): AdapterRequestHandler {
  return createProviderAdapter({ capabilities: CAPABILITIES, ...options });
}

export async function runCodexAppServerAdapter(arguments_: string[] = process.argv.slice(2)): Promise<void> {
  const journal = new SqliteAdapterActionJournal(journalPathFromArguments("codex-app-server", arguments_));
  const providerIndex = arguments_.indexOf("--provider-executable");
  const providerExecutable = providerIndex === -1 ? undefined : arguments_[providerIndex + 1];
  if (providerExecutable === undefined) throw new Error("codex-app-server adapter requires --provider-executable");
  try {
    await serveAdapter(
      createCodexAppServerAdapter({
        boundary: new InstalledCodexAppServerBoundary(
          () => new CodexJsonRpcConnection(codexAppServerCommand(providerExecutable)),
        ),
        journal,
      }),
      { input: process.stdin, output: process.stdout },
    );
  } finally {
    journal.close();
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  await runCodexAppServerAdapter();
}

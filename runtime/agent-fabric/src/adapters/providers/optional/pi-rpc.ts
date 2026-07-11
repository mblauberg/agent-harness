import { pathToFileURL } from "node:url";

import { ProviderAdapterError, requiredString, type AdapterRequestHandler } from "../types.js";
import { SqliteAdapterActionJournal } from "../journal.js";
import { journalPathFromArguments, serveAdapter } from "../server.js";
import { PiJsonlRpcClient } from "./pi-jsonl-client.js";
import {
  createOptionalProviderAdapter,
  optionalCapabilities,
  type OptionalProviderBoundary,
} from "./shared.js";

export type PiRpcBoundary = OptionalProviderBoundary;

export type PiRpcClient = {
  getState(): Promise<{ sessionId: string; sessionFile?: string; isStreaming: boolean }>;
  newSession(parentSession?: string): Promise<{ cancelled: boolean }>;
  setModel(provider: string, modelId: string): Promise<unknown>;
  switchSession(sessionPath: string): Promise<{ cancelled: boolean }>;
  promptAndWait(message: string, images?: unknown[], timeout?: number): Promise<unknown[]>;
  getLastAssistantText(): Promise<string | null>;
  steer(message: string): Promise<void>;
  abort(): Promise<void>;
  compact(customInstructions?: string): Promise<unknown>;
  stop(): Promise<void>;
};

function sessionReference(state: { sessionId: string; sessionFile?: string }): string {
  return state.sessionFile ?? state.sessionId;
}

export function createPiRpcBoundary(options: { client: PiRpcClient; turnTimeoutMs?: number }): PiRpcBoundary {
  return {
    async status() {
      const state = await options.client.getState();
      return { healthy: true, resumeReference: sessionReference(state), isStreaming: state.isStreaming };
    },
    async spawn(payload) {
      const created = await options.client.newSession(
        typeof payload.parentSession === "string" ? payload.parentSession : undefined,
      );
      if (created.cancelled) throw new ProviderAdapterError("PROVIDER_ACTION_CANCELLED", "Pi cancelled new session");
      await options.client.setModel(requiredString(payload.provider, "provider"), requiredString(payload.model, "model"));
      const state = await options.client.getState();
      return { resumeReference: sessionReference(state), sessionId: state.sessionId };
    },
    async attach({ resumeReference }) {
      const switched = await options.client.switchSession(resumeReference);
      if (switched.cancelled) throw new ProviderAdapterError("PROVIDER_ACTION_CANCELLED", "Pi cancelled session switch");
      const state = await options.client.getState();
      return { resumeReference: sessionReference(state), sessionId: state.sessionId };
    },
    async sendTurn(payload) {
      const events = await options.client.promptAndWait(
        requiredString(payload.prompt, "prompt"),
        undefined,
        options.turnTimeoutMs,
      );
      const [state, text] = await Promise.all([options.client.getState(), options.client.getLastAssistantText()]);
      return { resumeReference: sessionReference(state), sessionId: state.sessionId, text, eventCount: events.length };
    },
    async steer(payload) {
      await options.client.steer(requiredString(payload.prompt, "prompt"));
      return { steered: true };
    },
    async interrupt() {
      await options.client.abort();
      return { interrupted: true };
    },
    async compact(payload) {
      const customInstructions = typeof payload.customInstructions === "string" ? payload.customInstructions : undefined;
      const result = await options.client.compact(customInstructions);
      const state = await options.client.getState();
      return { compacted: true, resumeReference: sessionReference(state), result };
    },
    async release() {
      await options.client.stop();
      return { released: true, deleted: false };
    },
  };
}

export function createPiRpcAdapter(options: {
  boundary: PiRpcBoundary;
  journal: SqliteAdapterActionJournal;
}): AdapterRequestHandler {
  return createOptionalProviderAdapter({
    capabilities: optionalCapabilities({
      adapterId: "pi-rpc",
      operations: ["spawn", "attach", "send_turn", "steer", "interrupt", "compact", "release"],
      modelFamilies: ["generic-open", "open-weight"],
      compactInPlace: true,
    }),
    boundary: options.boundary,
    journal: options.journal,
    modelPolicy: { adapterId: "pi-rpc", allowedFamilies: ["generic-open", "open-weight"] },
  });
}

function argument(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index === -1 ? undefined : arguments_[index + 1];
}

function argumentValues(arguments_: string[], name: string): string[] {
  const values: string[] = [];
  for (const [index, value] of arguments_.entries()) {
    const candidate = arguments_[index + 1];
    if (value === name && candidate !== undefined) values.push(candidate);
  }
  return values;
}

function requiredArgument(arguments_: string[], name: string): string {
  const value = argument(arguments_, name);
  if (value === undefined || value.length === 0) throw new Error(`pi-rpc adapter requires ${name}`);
  return value;
}

function positiveIntegerArgument(arguments_: string[], name: string): number | undefined {
  const value = argument(arguments_, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`pi-rpc adapter requires positive ${name}`);
  return parsed;
}

export async function runPiRpcAdapter(arguments_: string[] = process.argv.slice(2)): Promise<void> {
  const journal = new SqliteAdapterActionJournal(journalPathFromArguments("pi-rpc", arguments_));
  const client = new PiJsonlRpcClient({
    executable: requiredArgument(arguments_, "--provider-executable"),
    args: argumentValues(arguments_, "--provider-argument"),
    cwd: argument(arguments_, "--cwd") ?? process.cwd(),
  });
  const turnTimeoutMs = positiveIntegerArgument(arguments_, "--turn-timeout-ms");
  try {
    await client.start();
    await serveAdapter(
      createPiRpcAdapter({
        boundary: createPiRpcBoundary({ client, ...(turnTimeoutMs === undefined ? {} : { turnTimeoutMs }) }),
        journal,
      }),
      { input: process.stdin, output: process.stdout },
    );
  } finally {
    await client.stop();
    journal.close();
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  await runPiRpcAdapter();
}

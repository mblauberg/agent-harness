import { pathToFileURL } from "node:url";
import { isAbsolute } from "node:path";

import { ProviderAdapterError, requiredString, type AdapterRequestHandler } from "../types.js";
import { SqliteAdapterActionJournal } from "../journal.js";
import { journalPathFromArguments, serveAdapter } from "../server.js";
import { KiroAcpStdioClient } from "./kiro-acp-client.js";
import { verifyProviderConformance } from "../../provider-conformance.js";
import {
  createOptionalProviderAdapter,
  optionalCapabilities,
  type OptionalProviderBoundary,
} from "./shared.js";

export type KiroAcpClient = {
  start(): Promise<void>;
  newSession(cwd: string): Promise<{ sessionId: string }>;
  loadSession(sessionId: string, cwd: string): Promise<{ sessionId: string }>;
  prompt(sessionId: string, prompt: string): Promise<{ stopReason: string; text: string }>;
  closeSession(sessionId: string): Promise<void>;
  stop(): Promise<void>;
};

export type KiroAcpBoundary = OptionalProviderBoundary;

function absoluteCwd(value: unknown): string {
  const cwd = requiredString(value, "cwd");
  if (!isAbsolute(cwd)) {
    throw new ProviderAdapterError("PROVIDER_CWD_INVALID", "Kiro ACP cwd must be absolute", { cwd });
  }
  return cwd;
}

export function createManagedAcpBoundary(options: {
  clientFactory(input: { model: string; cwd: string }): KiroAcpClient;
  verifyExecutable?: () => Promise<unknown>;
  providerName?: string;
}): KiroAcpBoundary & { shutdown(): Promise<void> } {
  const providerName = options.providerName ?? "Kiro ACP";
  type ManagedSession = { client: KiroAcpClient; cwd: string; model: string };
  const sessions = new Map<string, ManagedSession>();

  async function start(input: { model: string; cwd: string }): Promise<KiroAcpClient> {
    await options.verifyExecutable?.();
    const created = options.clientFactory(input);
    try {
      await created.start();
      return created;
    } catch (error: unknown) {
      await created.stop();
      throw error;
    }
  }

  function active(payload: Record<string, unknown>): ManagedSession & { sessionId: string } {
    const sessionId = requiredString(payload.resumeReference, "resumeReference");
    const session = sessions.get(sessionId);
    if (session === undefined) {
      throw new ProviderAdapterError("PROVIDER_SESSION_NOT_ATTACHED", `${providerName} has no active managed session`);
    }
    if (payload.cwd !== undefined && absoluteCwd(payload.cwd) !== session.cwd) {
      throw new ProviderAdapterError("PROVIDER_CWD_MISMATCH", `${providerName} cwd changed within a managed session`);
    }
    if (payload.model !== undefined) {
      const requestedModel = requiredString(payload.model, "model");
      if (requestedModel !== session.model) {
        throw new ProviderAdapterError("PROVIDER_MODEL_MISMATCH", `${providerName} model changed within a managed session`);
      }
    }
    return { ...session, sessionId };
  }

  async function shutdown(): Promise<void> {
    const managed = [...sessions.values()];
    sessions.clear();
    await Promise.allSettled(managed.map(async ({ client }) => await client.stop()));
  }

  return {
    async status({ resumeReference }) {
      if (resumeReference === undefined) return { healthy: true, managedSessionCount: sessions.size };
      const managed = sessions.has(resumeReference);
      return { healthy: managed, matches: managed, resumeReference };
    },
    async spawn(payload) {
      const cwd = absoluteCwd(payload.cwd);
      const model = requiredString(payload.model, "model");
      const created = await start({ model, cwd });
      try {
        const session = await created.newSession(cwd);
        if (sessions.has(session.sessionId)) {
          throw new ProviderAdapterError("PROVIDER_SESSION_CONFLICT", `${providerName} returned an already managed session ID`);
        }
        sessions.set(session.sessionId, { client: created, cwd, model });
        return { resumeReference: session.sessionId, sessionId: session.sessionId };
      } catch (error: unknown) {
        await created.stop();
        throw error;
      }
    },
    async attach() {
      throw new ProviderAdapterError(
        "CAPABILITY_UNAVAILABLE",
        `${providerName} attach is disabled until persisted provider model lineage can be verified`,
      );
    },
    async sendTurn(payload) {
      const current = active(payload);
      const result = await current.client.prompt(current.sessionId, requiredString(payload.prompt, "prompt"));
      return { resumeReference: current.sessionId, sessionId: current.sessionId, ...result };
    },
    async interrupt() {
      throw new ProviderAdapterError("CAPABILITY_UNAVAILABLE", `${providerName} interrupt is not advertised`);
    },
    async release(payload) {
      const current = active(payload);
      try {
        await current.client.closeSession(current.sessionId);
      } finally {
        sessions.delete(current.sessionId);
        await current.client.stop();
      }
      return { released: true, deleted: false };
    },
    shutdown,
  };
}

export const createKiroAcpBoundary = createManagedAcpBoundary;

export function createKiroAcpAdapter(options: {
  boundary: KiroAcpBoundary;
  journal: SqliteAdapterActionJournal;
}): AdapterRequestHandler {
  return createOptionalProviderAdapter({
    capabilities: optionalCapabilities({
      adapterId: "kiro-acp",
      operations: ["spawn", "send_turn", "release"],
      modelFamilies: ["open-weight"],
      compactInPlace: false,
      persistentSession: false,
      recoveryOperations: ["lookup_action"],
    }),
    boundary: options.boundary,
    journal: options.journal,
    modelPolicy: {
      allowedModelPatterns: ["deepseek-*", "glm-*", "minimax-*", "qwen*"],
    },
  });
}

export function createUnverifiedKiroAcpEntrypoint(): AdapterRequestHandler {
  return {
    async request(): Promise<never> {
      throw new ProviderAdapterError(
        "KIRO_ACP_PROTOCOL_UNVERIFIED",
        "Kiro ACP activation is disabled because the installed CLI exposes no pinned ACP wire version or schema",
      );
    },
  };
}

export async function runKiroAcpAdapter(
  arguments_: string[] = process.argv.slice(2),
  dependencies: { verifyProvider?: typeof verifyProviderConformance } = {},
): Promise<void> {
  const journal = new SqliteAdapterActionJournal(journalPathFromArguments("kiro-acp", arguments_));
  const providerExecutable = requiredArgument(arguments_, "--provider-executable");
  const providerArguments = argumentValues(arguments_, "--provider-argument");
  if (providerArguments.some((value) => value === "--trust-all-tools" || value === "--trust-tools" || value === "-a")) {
    throw new Error("kiro-acp adapter forbids provider trust overrides");
  }
  const engine = argument(arguments_, "--agent-engine") ?? "v2";
  if (engine !== "v1" && engine !== "v2" && engine !== "v3") {
    throw new Error("kiro-acp adapter requires --agent-engine v1|v2|v3");
  }
  const requestTimeoutMs = positiveIntegerArgument(arguments_, "--request-timeout-ms");
  const closeTimeoutMs = positiveIntegerArgument(arguments_, "--close-timeout-ms");
  const maximumLineBytes = positiveIntegerArgument(arguments_, "--maximum-line-bytes");
  const maximumOutputBytes = positiveIntegerArgument(arguments_, "--maximum-output-bytes");
  const boundary = createKiroAcpBoundary({
    verifyExecutable: async () => await (dependencies.verifyProvider ?? verifyProviderConformance)({ adapterId: "kiro-acp", executable: providerExecutable }),
    clientFactory({ model, cwd }) {
      return new KiroAcpStdioClient({
        executable: providerExecutable,
        args: [
          ...providerArguments,
          "acp",
          ...(model === undefined ? [] : ["--model", model]),
          "--agent-engine",
          engine,
        ],
        cwd,
        ...(model === undefined ? {} : { model }),
        ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
        ...(closeTimeoutMs === undefined ? {} : { closeTimeoutMs }),
        ...(maximumLineBytes === undefined ? {} : { maximumLineBytes }),
        ...(maximumOutputBytes === undefined ? {} : { maximumOutputBytes }),
      });
    },
  });
  try {
    await serveAdapter(createKiroAcpAdapter({ boundary, journal }), { input: process.stdin, output: process.stdout });
  } finally {
    await boundary.shutdown();
    journal.close();
  }
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
  if (value === undefined || value.length === 0) throw new Error(`kiro-acp adapter requires ${name}`);
  return value;
}

function positiveIntegerArgument(arguments_: string[], name: string): number | undefined {
  const value = argument(arguments_, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`kiro-acp adapter requires positive ${name}`);
  return parsed;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  await runKiroAcpAdapter();
}

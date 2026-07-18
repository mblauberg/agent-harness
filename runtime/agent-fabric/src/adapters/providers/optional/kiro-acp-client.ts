import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";

import { isRecord, ProviderAdapterError } from "../types.js";

type JsonObject = Record<string, unknown>;
type JsonRpcId = string | number;

type PendingRequest = {
  method: string;
  resolve(value: JsonObject): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
};

type AgentCapabilities = {
  loadSession: boolean;
  resumeSession: boolean;
  closeSession: boolean;
};

type ActiveTurn = {
  sessionId: string;
  chunks: string[];
  outputBytes: number;
};

const ACP_V1_STOP_REASONS = new Set([
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
]);

function validContentBlock(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "text": return typeof value.text === "string";
    case "image":
    case "audio": return typeof value.data === "string" && typeof value.mimeType === "string";
    case "resource_link": return typeof value.name === "string" && typeof value.uri === "string";
    case "resource": return isRecord(value.resource);
    default: return false;
  }
}

function validNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function validNonAnswerSessionUpdate(update: JsonObject): boolean {
  switch (update.sessionUpdate) {
    case "user_message_chunk":
    case "agent_thought_chunk":
      return validContentBlock(update.content);
    case "tool_call":
      return typeof update.toolCallId === "string" && typeof update.title === "string";
    case "tool_call_update":
      return typeof update.toolCallId === "string";
    case "plan":
      return Array.isArray(update.entries);
    case "available_commands_update":
      return Array.isArray(update.availableCommands);
    case "current_mode_update":
      return typeof update.currentModeId === "string";
    case "config_option_update":
      return Array.isArray(update.configOptions);
    case "session_info_update":
      return (Object.hasOwn(update, "title") && validNullableString(update.title)) ||
        (Object.hasOwn(update, "updatedAt") && validNullableString(update.updatedAt));
    case "usage_update":
      return Number.isSafeInteger(update.used) && Number(update.used) >= 0 &&
        Number.isSafeInteger(update.size) && Number(update.size) >= 0;
    default:
      return false;
  }
}

export type KiroAcpClientOptions = {
  executable: string;
  args?: string[];
  cwd: string;
  model?: string;
  effort?: string;
  environment?: Record<string, string>;
  requestTimeoutMs?: number;
  closeTimeoutMs?: number;
  maximumLineBytes?: number;
  maximumOutputBytes?: number;
  configureModelOnSessionStart?: boolean;
  configureEffortOnSessionStart?: boolean;
};

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function protocolError(code: string, message: string, cause?: unknown): ProviderAdapterError {
  return new ProviderAdapterError(code, message, {}, cause === undefined ? undefined : { cause });
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isRecord(value)) throw protocolError("PROVIDER_RESPONSE_INVALID", `Kiro ACP ${label} is not an object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw protocolError("PROVIDER_RESPONSE_INVALID", `Kiro ACP ${label} is not a non-empty string`);
  }
  return value;
}

function requireAbsoluteCwd(cwd: string): string {
  if (!isAbsolute(cwd)) {
    throw new ProviderAdapterError("PROVIDER_CWD_INVALID", "Kiro ACP cwd must be absolute", { cwd });
  }
  return cwd;
}

function negotiatedCapabilities(result: JsonObject): AgentCapabilities {
  if (result.protocolVersion !== 1) {
    throw new ProviderAdapterError(
      "PROVIDER_PROTOCOL_MISMATCH",
      `Kiro ACP negotiated unsupported protocol ${String(result.protocolVersion)}`,
      { expected: 1, received: result.protocolVersion },
    );
  }
  const advertised = result.agentCapabilities;
  if (advertised !== undefined && !isRecord(advertised)) {
    throw protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP agentCapabilities is invalid");
  }
  const capabilities = isRecord(advertised) ? advertised : {};
  const session = capabilities.sessionCapabilities;
  if (session !== undefined && !isRecord(session)) {
    throw protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP sessionCapabilities is invalid");
  }
  return {
    loadSession: capabilities.loadSession === true,
    resumeSession: isRecord(session) && isRecord(session.resume),
    closeSession: isRecord(session) && isRecord(session.close),
  };
}

export class KiroAcpStdioClient {
  readonly #options: KiroAcpClientOptions;
  readonly #requestTimeoutMs: number;
  readonly #closeTimeoutMs: number;
  readonly #maximumLineBytes: number;
  readonly #maximumOutputBytes: number;
  readonly #cwd: string;
  readonly #decoder = new StringDecoder("utf8");
  readonly #pending = new Map<JsonRpcId, PendingRequest>();
  #child: ChildProcessWithoutNullStreams | undefined;
  #buffer = "";
  #stderr = "";
  #requestId = 0;
  #terminalError: Error | undefined;
  #closing = false;
  #capabilities: AgentCapabilities | undefined;
  #activeTurn: ActiveTurn | undefined;

  constructor(options: KiroAcpClientOptions) {
    if (options.executable.length === 0) throw new TypeError("Kiro ACP executable must not be empty");
    requireAbsoluteCwd(options.cwd);
    this.#cwd = realpathSync(options.cwd);
    this.#options = options;
    this.#requestTimeoutMs = positiveInteger(options.requestTimeoutMs ?? 60_000, "requestTimeoutMs");
    this.#closeTimeoutMs = positiveInteger(options.closeTimeoutMs ?? 1_000, "closeTimeoutMs");
    this.#maximumLineBytes = positiveInteger(options.maximumLineBytes ?? 1_048_576, "maximumLineBytes");
    this.#maximumOutputBytes = positiveInteger(options.maximumOutputBytes ?? 4_194_304, "maximumOutputBytes");
  }

  async start(): Promise<void> {
    if (this.#child !== undefined) {
      throw new ProviderAdapterError("PROVIDER_ALREADY_STARTED", "Kiro ACP client is already started");
    }
    const child = spawn(this.#options.executable, this.#options.args ?? [], {
      cwd: this.#options.cwd,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
        ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
        ...(this.#options.environment ?? {}),
      },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#child = child;
    child.stdout.on("data", (chunk: Buffer) => this.#receiveChunk(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.#stderr = `${this.#stderr}${chunk}`.slice(-4096);
    });
    child.stdin.on("error", (cause: Error) => {
      this.#fail(protocolError("PROVIDER_STDIN_FAILED", `Kiro ACP stdin failed: ${cause.message}`, cause));
    });
    child.once("error", (cause: Error) => {
      this.#fail(protocolError("PROVIDER_SPAWN_FAILED", `Kiro ACP failed to start: ${cause.message}`, cause));
    });
    child.once("close", (code, signal) => {
      if (!this.#closing) {
        this.#fail(
          new ProviderAdapterError(
            "PROVIDER_EXITED",
            `Kiro ACP exited (${String(code)}, ${String(signal)})${this.#stderr.length === 0 ? "" : `: ${this.#stderr}`}`,
          ),
        );
      }
    });
    await new Promise<void>((resolve, reject) => {
      const onSpawn = (): void => {
        child.off("error", onError);
        resolve();
      };
      const onError = (cause: Error): void => {
        child.off("spawn", onSpawn);
        reject(protocolError("PROVIDER_SPAWN_FAILED", `Kiro ACP failed to start: ${cause.message}`, cause));
      };
      child.once("spawn", onSpawn);
      child.once("error", onError);
    });
    try {
      const initialized = await this.#send("initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: "agent-fabric", version: "1" },
      });
      this.#capabilities = negotiatedCapabilities(initialized);
    } catch (error: unknown) {
      this.#fail(error instanceof Error ? error : protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP initialization failed"));
      throw error;
    }
  }

  async newSession(cwd: string): Promise<{ sessionId: string }> {
    const result = await this.#send("session/new", { cwd: requireAbsoluteCwd(cwd), mcpServers: [] });
    const sessionId = requireString(result.sessionId, "session/new sessionId");
    let configOptions = result.configOptions;
    if (this.#options.configureModelOnSessionStart === true) {
      const model = requireString(this.#options.model, "configured model");
      this.#requireSelectableConfig(configOptions, "model", model, "ADAPTER_MODEL_FORBIDDEN");
      const configured = await this.#send("session/set_config_option", { sessionId, configId: "model", value: model });
      this.#requireCurrentConfig(configured.configOptions, "model", model);
      configOptions = configured.configOptions;
    }
    if (this.#options.configureEffortOnSessionStart === true) {
      const effort = requireString(this.#options.effort, "configured effort");
      this.#requireSelectableConfig(configOptions, "effort", effort, "ADAPTER_EFFORT_FORBIDDEN");
      const configured = await this.#send("session/set_config_option", { sessionId, configId: "effort", value: effort });
      this.#requireCurrentConfig(configured.configOptions, "effort", effort);
    }
    return { sessionId };
  }

  #requireSelectableConfig(value: unknown, configId: string, selected: string, code: string): void {
    const option = this.#selectOption(value, configId);
    const options = option.options;
    if (!Array.isArray(options) || !options.some((candidate) => isRecord(candidate) && candidate.value === selected)) {
      throw new ProviderAdapterError(code, `ACP provider did not advertise the requested ${configId}`, { [configId]: selected });
    }
  }

  #requireCurrentConfig(value: unknown, configId: string, selected: string): void {
    const option = this.#selectOption(value, configId);
    if (option.currentValue !== selected) {
      throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", `ACP provider did not activate the requested ${configId}`, { [configId]: selected });
    }
  }

  #selectOption(value: unknown, configId: string): JsonObject {
    if (!Array.isArray(value)) {
      throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "ACP provider config options are missing");
    }
    const option = value.find((candidate) => isRecord(candidate) && candidate.id === configId && candidate.type === "select");
    if (!isRecord(option)) {
      throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", `ACP provider ${configId} selector is missing`);
    }
    return option;
  }

  async loadSession(sessionId: string, cwd: string): Promise<{ sessionId: string }> {
    const capabilities = this.#requireCapabilities();
    const params = { sessionId: requireString(sessionId, "sessionId"), cwd: requireAbsoluteCwd(cwd), mcpServers: [] };
    if (capabilities.resumeSession) {
      await this.#send("session/resume", params);
    } else if (capabilities.loadSession) {
      await this.#send("session/load", params);
    } else {
      throw new ProviderAdapterError(
        "PROVIDER_RESUME_UNAVAILABLE",
        "Kiro ACP did not advertise session/resume or session/load",
      );
    }
    return { sessionId };
  }

  async prompt(sessionId: string, prompt: string): Promise<{ stopReason: string; text: string }> {
    this.#requireCapabilities();
    if (this.#activeTurn !== undefined) {
      throw new ProviderAdapterError("PROVIDER_BUSY", "Kiro ACP already has an active prompt turn");
    }
    const activeTurn: ActiveTurn = { sessionId, chunks: [], outputBytes: 0 };
    this.#activeTurn = activeTurn;
    try {
      const result = await this.#send("session/prompt", {
        sessionId: requireString(sessionId, "sessionId"),
        prompt: [{ type: "text", text: requireString(prompt, "prompt") }],
      });
      const stopReason = requireString(result.stopReason, "session/prompt stopReason");
      if (!ACP_V1_STOP_REASONS.has(stopReason)) {
        throw protocolError("PROVIDER_RESPONSE_INVALID", "Kiro ACP session/prompt stopReason is unsupported");
      }
      const text = activeTurn.chunks.join("");
      if (text.trim().length === 0) {
        throw protocolError("PROVIDER_RESPONSE_INVALID", "Kiro ACP session/prompt completed without a valid answer");
      }
      return { stopReason, text };
    } finally {
      if (this.#activeTurn === activeTurn) this.#activeTurn = undefined;
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    if (this.#requireCapabilities().closeSession) {
      await this.#send("session/close", { sessionId: requireString(sessionId, "sessionId") });
    } else {
      this.#notify("session/cancel", { sessionId: requireString(sessionId, "sessionId") });
    }
  }

  async stop(): Promise<void> {
    const child = this.#child;
    if (child === undefined) return;
    this.#closing = true;
    this.#rejectAll(new ProviderAdapterError("PROVIDER_CLOSED", "Kiro ACP client closed"));
    child.stdin.end();
    if (!(await this.#waitForExit(child, this.#closeTimeoutMs))) {
      child.kill("SIGTERM");
      if (!(await this.#waitForExit(child, this.#closeTimeoutMs)) && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await this.#waitForExit(child, this.#closeTimeoutMs);
      }
    }
    this.#child = undefined;
  }

  #requireCapabilities(): AgentCapabilities {
    if (this.#capabilities === undefined) {
      throw new ProviderAdapterError("PROVIDER_NOT_INITIALIZED", "Kiro ACP client is not initialized");
    }
    return this.#capabilities;
  }

  async #send(method: string, params: JsonObject): Promise<JsonObject> {
    const child = this.#child;
    if (child === undefined || this.#terminalError !== undefined || child.stdin.destroyed || !child.stdin.writable) {
      throw this.#terminalError ?? new ProviderAdapterError("PROVIDER_CLOSED", "Kiro ACP client is unavailable");
    }
    const id = ++this.#requestId;
    const promise = new Promise<JsonObject>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        const timeout = new ProviderAdapterError("PROVIDER_RESPONSE_TIMEOUT", `Kiro ACP ${method} timed out`);
        this.#fail(timeout);
        reject(timeout);
      }, this.#requestTimeoutMs);
      this.#pending.set(id, { method, resolve, reject, timer });
    });
    this.#write({ jsonrpc: "2.0", id, method, params });
    return await promise;
  }

  #notify(method: string, params: JsonObject): void {
    this.#write({ jsonrpc: "2.0", method, params });
  }

  #write(value: JsonObject): void {
    const child = this.#child;
    if (child === undefined || child.stdin.destroyed || !child.stdin.writable) {
      throw this.#terminalError ?? new ProviderAdapterError("PROVIDER_CLOSED", "Kiro ACP client is unavailable");
    }
    child.stdin.write(`${JSON.stringify(value)}\n`, (error) => {
      if (error !== null && error !== undefined) {
        this.#fail(protocolError("PROVIDER_STDIN_FAILED", `Kiro ACP stdin failed: ${error.message}`, error));
      }
    });
  }

  #receiveChunk(chunk: Buffer): void {
    this.#buffer += this.#decoder.write(chunk);
    if (Buffer.byteLength(this.#buffer) > this.#maximumLineBytes) {
      this.#fail(new ProviderAdapterError("PROVIDER_OUTPUT_LIMIT", "Kiro ACP output line exceeded its byte limit"));
      return;
    }
    while (true) {
      const newline = this.#buffer.indexOf("\n");
      if (newline === -1) return;
      const line = this.#buffer.slice(0, newline).replace(/\r$/u, "");
      this.#buffer = this.#buffer.slice(newline + 1);
      if (line.length > 0) this.#receiveLine(line);
      if (this.#terminalError !== undefined) return;
    }
  }

  #receiveLine(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (cause: unknown) {
      this.#fail(protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP emitted malformed JSON", cause));
      return;
    }
    if (!isRecord(value) || value.jsonrpc !== "2.0") {
      this.#fail(protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP emitted an invalid JSON-RPC envelope"));
      return;
    }
    if (value.method !== undefined) {
      if (typeof value.method !== "string" || !isRecord(value.params)) {
        this.#fail(protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP emitted an invalid method envelope"));
        return;
      }
      if (value.id === undefined) this.#receiveNotification(value.method, value.params);
      else if (typeof value.id === "string" || typeof value.id === "number") {
        try {
          this.#receiveRequest(value.id, value.method, value.params);
        } catch (error: unknown) {
          this.#fail(error instanceof Error
            ? error
            : protocolError("PROVIDER_STDIN_FAILED", "Kiro ACP could not reply to a provider request"));
        }
      }
      else this.#fail(protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP request ID is invalid"));
      return;
    }
    if (typeof value.id !== "string" && typeof value.id !== "number") {
      this.#fail(protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP response ID is invalid"));
      return;
    }
    const pending = this.#pending.get(value.id);
    if (pending === undefined || (value.result === undefined) === (value.error === undefined)) {
      this.#fail(protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP response correlation is invalid"));
      return;
    }
    this.#pending.delete(value.id);
    clearTimeout(pending.timer);
    if (value.error !== undefined) {
      pending.reject(new ProviderAdapterError("PROVIDER_REQUEST_FAILED", `Kiro ACP ${pending.method} failed`, { error: value.error }));
      return;
    }
    try {
      pending.resolve(requireObject(value.result, `${pending.method} result`));
    } catch (error: unknown) {
      pending.reject(error instanceof Error ? error : protocolError("PROVIDER_RESPONSE_INVALID", `Kiro ACP ${pending.method} failed`));
    }
  }

  #receiveNotification(method: string, params: JsonObject): void {
    if (method !== "session/update") return;
    const active = this.#activeTurn;
    if (active === undefined) return;
    if (params.sessionId !== active.sessionId) {
      this.#fail(protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP session update targeted the wrong active session"));
      return;
    }
    if (!isRecord(params.update)) {
      this.#fail(protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP session update is invalid"));
      return;
    }
    const update = params.update;
    if (update.sessionUpdate !== "agent_message_chunk") {
      if (!validNonAnswerSessionUpdate(update)) {
        this.#fail(protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP session update kind is unsupported"));
      }
      return;
    }
    if (!isRecord(update.content) || update.content.type !== "text" || typeof update.content.text !== "string") {
      this.#fail(protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP agent message chunk is invalid"));
      return;
    }
    active.outputBytes += Buffer.byteLength(update.content.text);
    if (active.outputBytes > this.#maximumOutputBytes) {
      this.#fail(new ProviderAdapterError("PROVIDER_OUTPUT_LIMIT", "Kiro ACP turn output exceeded its byte limit"));
      return;
    }
    active.chunks.push(update.content.text);
  }

  #receiveRequest(id: JsonRpcId, method: string, params: JsonObject): void {
    if (method !== "session/request_permission") {
      this.#write({ jsonrpc: "2.0", id, error: { code: -32601, message: "Client method is not available" } });
      return;
    }
    const toolCall = params.toolCall;
    const options = params.options;
    if (!isRecord(toolCall) || typeof toolCall.kind !== "string" || !Array.isArray(options)) {
      this.#fail(protocolError("PROVIDER_PROTOCOL_INVALID", "Kiro ACP permission request is invalid"));
      return;
    }
    const locations = toolCall.locations;
    const confinedRead = toolCall.kind === "read" && Array.isArray(locations) && locations.length > 0 && locations.every((location) => {
      if (!isRecord(location) || typeof location.path !== "string" || !isAbsolute(location.path)) return false;
      try {
        const target = realpathSync(resolve(location.path));
        const path = relative(this.#cwd, target);
        return path === "" || (!path.startsWith("..") && !isAbsolute(path));
      } catch {
        return false;
      }
    });
    const desiredKind = confinedRead ? "allow_once" : "reject_once";
    const selected = options.find((option) => isRecord(option) && option.kind === desiredKind && typeof option.optionId === "string");
    if (!isRecord(selected) || typeof selected.optionId !== "string") {
      this.#write({ jsonrpc: "2.0", id, result: { outcome: { outcome: "cancelled" } } });
      return;
    }
    this.#write({
      jsonrpc: "2.0",
      id,
      result: { outcome: { outcome: "selected", optionId: selected.optionId } },
    });
  }

  #fail(error: Error): void {
    if (this.#terminalError === undefined) this.#terminalError = error;
    this.#rejectAll(this.#terminalError);
    const child = this.#child;
    if (child !== undefined && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  async #waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
    if (child.exitCode !== null || child.signalCode !== null) return true;
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        child.off("close", onClose);
        resolve(false);
      }, timeoutMs);
      const onClose = (): void => {
        clearTimeout(timer);
        resolve(true);
      };
      child.once("close", onClose);
    });
  }
}

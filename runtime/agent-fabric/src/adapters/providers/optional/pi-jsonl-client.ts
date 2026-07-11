import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

import { ProviderAdapterError } from "../types.js";
import type { PiRpcClient } from "./pi-rpc.js";

type JsonRecord = Record<string, unknown>;

type PendingRequest = {
  command: string;
  resolve(value: JsonRecord): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
};

type EventCollector = {
  events: unknown[];
  resolve(value: unknown[]): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
};

export type PiJsonlRpcClientOptions = {
  executable: string;
  args?: string[];
  cwd?: string;
  environment?: Record<string, string>;
  requestTimeoutMs?: number;
  closeTimeoutMs?: number;
  maximumLineBytes?: number;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive integer`);
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", `Pi RPC ${field} is invalid`);
  }
  return value;
}

export class PiJsonlRpcClient implements PiRpcClient {
  readonly #options: PiJsonlRpcClientOptions;
  readonly #requestTimeoutMs: number;
  readonly #closeTimeoutMs: number;
  readonly #maximumLineBytes: number;
  readonly #decoder = new StringDecoder("utf8");
  readonly #pending = new Map<string, PendingRequest>();
  readonly #collectors = new Set<EventCollector>();
  #child: ChildProcessWithoutNullStreams | undefined;
  #buffer = "";
  #stderr = "";
  #requestId = 0;
  #terminalError: Error | undefined;
  #closing = false;

  constructor(options: PiJsonlRpcClientOptions) {
    if (options.executable.length === 0) throw new TypeError("Pi RPC executable must not be empty");
    this.#options = options;
    this.#requestTimeoutMs = positiveInteger(options.requestTimeoutMs ?? 30_000, "requestTimeoutMs");
    this.#closeTimeoutMs = positiveInteger(options.closeTimeoutMs ?? 1_000, "closeTimeoutMs");
    this.#maximumLineBytes = positiveInteger(options.maximumLineBytes ?? 1_048_576, "maximumLineBytes");
  }

  async start(): Promise<void> {
    if (this.#child !== undefined) throw new ProviderAdapterError("PROVIDER_ALREADY_STARTED", "Pi RPC client is already started");
    const child = spawn(this.#options.executable, [...(this.#options.args ?? []), "--mode", "rpc"], {
      ...(this.#options.cwd === undefined ? {} : { cwd: this.#options.cwd }),
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
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
      this.#fail(new ProviderAdapterError("PROVIDER_STDIN_FAILED", `Pi RPC stdin failed: ${cause.message}`, {}, { cause }));
    });
    child.once("error", (cause: Error) => {
      this.#fail(new ProviderAdapterError("PROVIDER_SPAWN_FAILED", `Pi RPC failed to start: ${cause.message}`, {}, { cause }));
    });
    child.once("close", (code, signal) => {
      if (!this.#closing) {
        this.#fail(
          new ProviderAdapterError(
            "PROVIDER_EXITED",
            `Pi RPC exited (${String(code)}, ${String(signal)})${this.#stderr.length === 0 ? "" : `: ${this.#stderr}`}`,
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
        reject(new ProviderAdapterError("PROVIDER_SPAWN_FAILED", `Pi RPC failed to start: ${cause.message}`, {}, { cause }));
      };
      child.once("spawn", onSpawn);
      child.once("error", onError);
    });
  }

  async getState(): Promise<{ sessionId: string; sessionFile?: string; isStreaming: boolean }> {
    const data = this.#data(await this.#send("get_state", {}), "get_state");
    if (typeof data.isStreaming !== "boolean") {
      throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "Pi RPC get_state returned invalid streaming state");
    }
    return {
      sessionId: requiredString(data.sessionId, "sessionId"),
      ...(typeof data.sessionFile === "string" ? { sessionFile: data.sessionFile } : {}),
      isStreaming: data.isStreaming,
    };
  }

  async newSession(parentSession?: string): Promise<{ cancelled: boolean }> {
    return this.#cancelled(
      this.#data(
        await this.#send("new_session", { ...(parentSession === undefined ? {} : { parentSession }) }),
        "new_session",
      ),
      "new_session",
    );
  }

  async setModel(provider: string, modelId: string): Promise<unknown> {
    return this.#data(await this.#send("set_model", { provider, modelId }), "set_model");
  }

  async switchSession(sessionPath: string): Promise<{ cancelled: boolean }> {
    return this.#cancelled(
      this.#data(await this.#send("switch_session", { sessionPath }), "switch_session"),
      "switch_session",
    );
  }

  async promptAndWait(message: string, _images?: unknown[], timeout = 60_000): Promise<unknown[]> {
    const collector = this.#collect(positiveInteger(timeout, "prompt timeout"));
    try {
      await this.#send("prompt", { message });
      return await collector.promise;
    } catch (error: unknown) {
      collector.cancel();
      throw error;
    }
  }

  async getLastAssistantText(): Promise<string | null> {
    const data = this.#data(await this.#send("get_last_assistant_text", {}), "get_last_assistant_text");
    if (typeof data.text !== "string" && data.text !== null) {
      throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "Pi RPC assistant text is invalid");
    }
    return data.text;
  }

  async steer(message: string): Promise<void> {
    await this.#send("steer", { message });
  }

  async abort(): Promise<void> {
    await this.#send("abort", {});
  }

  async compact(customInstructions?: string): Promise<unknown> {
    return this.#data(
      await this.#send("compact", { ...(customInstructions === undefined ? {} : { customInstructions }) }),
      "compact",
    );
  }

  async stop(): Promise<void> {
    const child = this.#child;
    if (child === undefined) return;
    this.#closing = true;
    this.#rejectAll(new ProviderAdapterError("PROVIDER_CLOSED", "Pi RPC client closed"));
    child.stdin.end();
    if (await this.#waitForExit(child, this.#closeTimeoutMs)) {
      this.#child = undefined;
      return;
    }
    child.kill("SIGTERM");
    if (!(await this.#waitForExit(child, this.#closeTimeoutMs)) && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await this.#waitForExit(child, this.#closeTimeoutMs);
    }
    this.#child = undefined;
  }

  async #send(command: string, fields: JsonRecord): Promise<JsonRecord> {
    const child = this.#child;
    if (child === undefined || this.#terminalError !== undefined || child.stdin.destroyed || !child.stdin.writable) {
      throw this.#terminalError ?? new ProviderAdapterError("PROVIDER_CLOSED", "Pi RPC client is not available");
    }
    const id = `fabric_${String(++this.#requestId)}`;
    const result = new Promise<JsonRecord>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new ProviderAdapterError("PROVIDER_RESPONSE_TIMEOUT", `Pi RPC ${command} response timed out`));
      }, this.#requestTimeoutMs);
      this.#pending.set(id, { command, resolve, reject, timer });
    });
    child.stdin.write(`${JSON.stringify({ id, type: command, ...fields })}\n`, (error) => {
      if (error === null || error === undefined) return;
      this.#fail(new ProviderAdapterError("PROVIDER_STDIN_FAILED", `Pi RPC stdin failed: ${error.message}`, {}, { cause: error }));
    });
    return await result;
  }

  #receiveChunk(chunk: Buffer): void {
    this.#buffer += this.#decoder.write(chunk);
    if (Buffer.byteLength(this.#buffer) > this.#maximumLineBytes) {
      this.#fail(new ProviderAdapterError("PROVIDER_OUTPUT_LIMIT", "Pi RPC output line exceeded its byte limit"));
      return;
    }
    while (true) {
      const newline = this.#buffer.indexOf("\n");
      if (newline === -1) return;
      const line = this.#buffer.slice(0, newline).replace(/\r$/u, "");
      this.#buffer = this.#buffer.slice(newline + 1);
      this.#receiveLine(line);
    }
  }

  #receiveLine(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (cause: unknown) {
      this.#fail(new ProviderAdapterError("PROVIDER_PROTOCOL_INVALID", "Pi RPC emitted malformed JSON", {}, { cause }));
      return;
    }
    if (!isRecord(value)) {
      this.#fail(new ProviderAdapterError("PROVIDER_PROTOCOL_INVALID", "Pi RPC emitted a non-object record"));
      return;
    }
    if (value.type === "response" && typeof value.id === "string") {
      const pending = this.#pending.get(value.id);
      if (pending === undefined || value.command !== pending.command || typeof value.success !== "boolean") {
        this.#fail(new ProviderAdapterError("PROVIDER_PROTOCOL_INVALID", "Pi RPC response correlation is invalid"));
        return;
      }
      this.#pending.delete(value.id);
      clearTimeout(pending.timer);
      if (value.success) pending.resolve(value);
      else pending.reject(new ProviderAdapterError("PROVIDER_REQUEST_FAILED", typeof value.error === "string" ? value.error : `Pi RPC ${pending.command} failed`));
      return;
    }
    for (const collector of [...this.#collectors]) {
      collector.events.push(value);
      if (value.type === "agent_end") {
        clearTimeout(collector.timer);
        this.#collectors.delete(collector);
        collector.resolve(collector.events);
      }
    }
  }

  #data(response: JsonRecord, command: string): JsonRecord {
    if (!isRecord(response.data)) {
      throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", `Pi RPC ${command} returned no object data`);
    }
    return response.data;
  }

  #cancelled(data: JsonRecord, command: string): { cancelled: boolean } {
    if (typeof data.cancelled !== "boolean") {
      throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", `Pi RPC ${command} returned invalid cancellation state`);
    }
    return { cancelled: data.cancelled };
  }

  #collect(timeoutMs: number): { promise: Promise<unknown[]>; cancel(): void } {
    let collector: EventCollector;
    const promise = new Promise<unknown[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#collectors.delete(collector);
        reject(new ProviderAdapterError("PROVIDER_RESPONSE_TIMEOUT", "Pi RPC prompt did not reach agent_end"));
      }, timeoutMs);
      collector = { events: [], resolve, reject, timer };
      this.#collectors.add(collector);
    });
    return {
      promise,
      cancel: () => {
        clearTimeout(collector.timer);
        this.#collectors.delete(collector);
      },
    };
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
    for (const collector of this.#collectors) {
      clearTimeout(collector.timer);
      collector.reject(error);
    }
    this.#collectors.clear();
  }

  async #waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
    if (child.exitCode !== null || child.signalCode !== null) return true;
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      child.once("close", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }
}

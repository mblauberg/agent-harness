import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";

import { isRecord, ProviderAdapterError } from "./types.js";

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
};

type Notification = { method: string; params: Record<string, unknown> };
type ServerRequestHandler = (params: Record<string, unknown>) => Promise<unknown>;

function boundedError(stderr: string): string {
  return stderr.length === 0 ? "" : `: ${stderr.slice(-2048)}`;
}

function providerEnvironment(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
  };
  for (const key of ["HOME", "CODEX_HOME", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "SSL_CERT_FILE"] as const) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  Object.assign(environment, overrides);
  return environment;
}

export class CodexJsonRpcConnection {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #lines: Interface;
  readonly #pending = new Map<number, PendingRequest>();
  readonly #notifications: Notification[] = [];
  readonly #serverRequestHandlers = new Map<string, ServerRequestHandler>();
  readonly #waiters = new Set<{
    method: string;
    predicate(params: Record<string, unknown>): boolean;
    resolve(params: Record<string, unknown>): void;
    reject(error: Error): void;
  }>();
  #nextId = 1;
  #stderr = "";
  #closed = false;

  constructor(command: string[], environment: Record<string, string> = {}) {
    const executable = command[0];
    if (executable === undefined) throw new ProviderAdapterError("PROVIDER_COMMAND_INVALID", "Codex command is empty");
    this.#child = spawn(executable, command.slice(1), {
      env: providerEnvironment(environment),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#lines = createInterface({ input: this.#child.stdout, crlfDelay: Infinity });
    this.#lines.on("line", (line) => this.#receive(line));
    this.#child.stderr.setEncoding("utf8");
    this.#child.stderr.on("data", (chunk: string) => {
      this.#stderr = `${this.#stderr}${chunk}`.slice(-4096);
    });
    this.#child.stdin.on("error", (cause: Error) => this.#fail(new ProviderAdapterError(
      "PROVIDER_STDIN_FAILED",
      `Codex app-server stdin failed: ${cause.message}`,
      undefined,
      { cause },
    )));
    this.#child.once("error", (cause: Error) => this.#fail(new ProviderAdapterError(
      "PROVIDER_SPAWN_FAILED",
      `Codex app-server failed to spawn: ${cause.message}`,
      undefined,
      { cause },
    )));
    this.#child.once("close", (code, signal) => {
      if (!this.#closed) {
        this.#fail(new ProviderAdapterError(
          "PROVIDER_EXITED",
          `Codex app-server exited (${String(code)}, ${String(signal)})${boundedError(this.#stderr)}`,
        ));
      }
    });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: { name: "agent-fabric", title: "Agent fabric provider adapter", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});
  }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.#closed) throw new ProviderAdapterError("PROVIDER_CLOSED", "Codex app-server connection is closed");
    const id = this.#nextId;
    this.#nextId += 1;
    const result = new Promise<unknown>((resolve, reject) => this.#pending.set(id, { resolve, reject }));
    this.#child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return result;
  }

  notify(method: string, params: Record<string, unknown>): void {
    if (this.#closed) throw new ProviderAdapterError("PROVIDER_CLOSED", "Codex app-server connection is closed");
    this.#child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  setServerRequestHandler(method: string, handler: ServerRequestHandler): void {
    if (this.#closed) throw new ProviderAdapterError("PROVIDER_CLOSED", "Codex app-server connection is closed");
    this.#serverRequestHandlers.set(method, handler);
  }

  waitForNotification(
    method: string,
    predicate: (params: Record<string, unknown>) => boolean,
    timeoutMs = 30 * 60 * 1000,
  ): Promise<Record<string, unknown>> {
    const bufferedIndex = this.#notifications.findIndex(
      (notification) => notification.method === method && predicate(notification.params),
    );
    if (bufferedIndex !== -1) {
      const [buffered] = this.#notifications.splice(bufferedIndex, 1);
      if (buffered !== undefined) return Promise.resolve(buffered.params);
    }
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      let timer: NodeJS.Timeout;
      const waiter = {
        method,
        predicate,
        resolve: (params: Record<string, unknown>): void => {
          clearTimeout(timer);
          this.#waiters.delete(waiter);
          resolve(params);
        },
        reject: (error: Error): void => {
          clearTimeout(timer);
          this.#waiters.delete(waiter);
          reject(error);
        },
      };
      timer = setTimeout(() => {
        this.#waiters.delete(waiter);
        reject(new ProviderAdapterError("PROVIDER_RESPONSE_TIMEOUT", `Codex notification ${method} timed out`));
      }, timeoutMs);
      this.#waiters.add(waiter);
    });
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#rejectWaiters(new ProviderAdapterError("PROVIDER_CLOSED", "Codex app-server connection is closed"));
    this.#lines.close();
    this.#child.stdin.end();
    if (this.#child.exitCode === null && this.#child.signalCode === null) this.#child.kill("SIGTERM");
  }

  #receive(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (cause: unknown) {
      this.#fail(new ProviderAdapterError("PROVIDER_PROTOCOL_INVALID", "Codex app-server emitted malformed JSON", undefined, { cause }));
      return;
    }
    if (!isRecord(value)) {
      this.#fail(new ProviderAdapterError("PROVIDER_PROTOCOL_INVALID", "Codex app-server emitted a non-object message"));
      return;
    }
    if ((typeof value.id === "number" || typeof value.id === "string") && typeof value.method === "string") {
      void this.#handleServerRequest(value.id, value.method, isRecord(value.params) ? value.params : {});
      return;
    }
    if (typeof value.id === "number") {
      const pending = this.#pending.get(value.id);
      if (pending === undefined) return;
      this.#pending.delete(value.id);
      if (Object.hasOwn(value, "error")) {
        pending.reject(new ProviderAdapterError(
          "PROVIDER_REQUEST_FAILED",
          isRecord(value.error) && typeof value.error.message === "string" ? value.error.message : "Codex app-server request failed",
          isRecord(value.error) ? value.error : undefined,
        ));
      } else {
        pending.resolve(value.result);
      }
      return;
    }
    if (typeof value.method === "string" && isRecord(value.params)) {
      const notification = { method: value.method, params: value.params };
      const waiter = [...this.#waiters].find(
        (candidate) => candidate.method === notification.method && candidate.predicate(notification.params),
      );
      if (waiter !== undefined) {
        waiter.resolve(notification.params);
      } else {
        this.#notifications.push(notification);
        if (this.#notifications.length > 256) this.#notifications.shift();
      }
    }
  }

  async #handleServerRequest(
    id: number | string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const handler = this.#serverRequestHandlers.get(method);
    if (handler === undefined) {
      this.#child.stdin.write(`${JSON.stringify({
        id,
        error: { code: -32601, message: `agent-fabric does not implement server request ${method}` },
      })}\n`);
      return;
    }
    try {
      const result = await handler(params);
      if (!this.#closed) this.#child.stdin.write(`${JSON.stringify({ id, result })}\n`);
    } catch {
      if (!this.#closed) {
        this.#child.stdin.write(`${JSON.stringify({
          id,
          error: { code: -32603, message: "agent-fabric server request failed" },
        })}\n`);
      }
    }
  }

  #fail(error: Error): void {
    this.#closed = true;
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
    this.#rejectWaiters(error);
    this.#lines.close();
  }

  #rejectWaiters(error: Error): void {
    for (const waiter of [...this.#waiters]) waiter.reject(error);
    this.#waiters.clear();
  }
}

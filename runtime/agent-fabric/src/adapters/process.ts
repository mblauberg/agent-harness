import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";

import { v7 as uuidv7 } from "uuid";

export type AdapterTransportErrorCode =
  | "ADAPTER_COMMAND_EMPTY"
  | "ADAPTER_SPAWN_FAILED"
  | "ADAPTER_RESPONSE_TIMEOUT"
  | "ADAPTER_REQUEST_ABORTED"
  | "ADAPTER_PROTOCOL_INVALID"
  | "ADAPTER_EXITED"
  | "ADAPTER_CLOSED"
  | "ADAPTER_STDIN_FAILED";

export class AdapterTransportError extends Error {
  readonly code: AdapterTransportErrorCode;

  constructor(code: AdapterTransportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AdapterTransportError";
    this.code = code;
  }
}

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
  signal?: AbortSignal;
  abort?: () => void;
};

type RequestOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

type AdapterProcessTransportOptions = {
  command: string[];
  environment: Record<string, string>;
  responseTimeoutMs?: number;
  closeTimeoutMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveMilliseconds(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number`);
  }
  return value;
}

function boundedStderr(stderr: string): string {
  return stderr.length === 0 ? "" : `: ${stderr}`;
}

function signalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

export class AdapterProcessTransport {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #lines: Interface;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #responseTimeoutMs: number;
  readonly #closeTimeoutMs: number;
  readonly #ready: Promise<void>;
  readonly #exited: Promise<void>;
  #resolveExited: () => void = () => undefined;
  #stderr = "";
  #closed = false;
  #closing = false;
  #terminalError: AdapterTransportError | undefined;
  #closePromise: Promise<void> | undefined;

  constructor(options: AdapterProcessTransportOptions) {
    const executable = options.command[0];
    if (executable === undefined || executable.length === 0) {
      throw new AdapterTransportError("ADAPTER_COMMAND_EMPTY", "adapter command must not be empty");
    }
    this.#responseTimeoutMs = positiveMilliseconds(
      options.responseTimeoutMs ?? 10_000,
      "responseTimeoutMs",
    );
    this.#closeTimeoutMs = positiveMilliseconds(options.closeTimeoutMs ?? 250, "closeTimeoutMs");
    this.#child = spawn(executable, options.command.slice(1), {
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
        ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
        ...options.environment,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#lines = createInterface({ input: this.#child.stdout, crlfDelay: Infinity });
    this.#lines.on("line", (line) => this.#receive(line));
    this.#child.stderr.setEncoding("utf8");
    this.#child.stderr.on("data", (chunk: string) => {
      this.#stderr = `${this.#stderr}${chunk}`.slice(-4096);
    });

    this.#exited = new Promise<void>((resolve) => {
      this.#resolveExited = resolve;
    });
    this.#ready = new Promise<void>((resolve, reject) => {
      this.#child.once("spawn", resolve);
      this.#child.once("error", (cause: Error) => {
        const error = new AdapterTransportError(
          "ADAPTER_SPAWN_FAILED",
          `adapter failed to spawn: ${cause.message}`,
          { cause },
        );
        reject(error);
        this.#failTransport(error, false);
        this.#resolveExited();
      });
    });
    // A caller may construct and close without issuing a request. Keep a failed
    // spawn observable through request()/close() without creating an unhandled
    // rejection in that valid lifecycle.
    void this.#ready.catch(() => undefined);
    this.#child.once("close", (code, signal) => {
      this.#resolveExited();
      if (!this.#closing && this.#terminalError === undefined) {
        this.#failTransport(
          new AdapterTransportError(
            "ADAPTER_EXITED",
            `adapter exited (${String(code)}, ${String(signal)})${boundedStderr(this.#stderr)}`,
          ),
          false,
        );
      } else {
        this.#closed = true;
      }
    });
  }

  get pid(): number | undefined {
    return this.#child.pid;
  }

  get closed(): boolean {
    return this.#closed;
  }

  async request(
    method: string,
    params: Record<string, unknown>,
    options: RequestOptions = {},
  ): Promise<unknown> {
    if (this.#closed) {
      throw this.#terminalError ?? new AdapterTransportError("ADAPTER_CLOSED", "adapter transport is closed");
    }
    if (signalAborted(options.signal)) {
      throw new AdapterTransportError("ADAPTER_REQUEST_ABORTED", "adapter request was aborted before dispatch");
    }
    try {
      await this.#ready;
    } catch (error: unknown) {
      if (error instanceof AdapterTransportError) {
        throw error;
      }
      throw new AdapterTransportError("ADAPTER_SPAWN_FAILED", "adapter failed to spawn", { cause: error });
    }
    if (signalAborted(options.signal)) {
      const error = new AdapterTransportError(
        "ADAPTER_REQUEST_ABORTED",
        `adapter ${method} request was aborted before dispatch`,
      );
      this.#failTransport(error, true);
      throw error;
    }
    if (this.#closed) {
      throw this.#terminalError ?? new AdapterTransportError("ADAPTER_CLOSED", "adapter transport is closed");
    }

    const timeoutMs = positiveMilliseconds(options.timeoutMs ?? this.#responseTimeoutMs, "timeoutMs");
    const id = uuidv7();
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#failTransport(
          new AdapterTransportError(
            "ADAPTER_RESPONSE_TIMEOUT",
            `adapter ${method} response exceeded ${String(timeoutMs)}ms`,
          ),
          true,
        );
      }, timeoutMs);
      const pending: PendingRequest = { resolve, reject, timer };
      if (options.signal !== undefined) {
        const abort = (): void => {
          this.#failTransport(
            new AdapterTransportError("ADAPTER_REQUEST_ABORTED", `adapter ${method} request was aborted`),
            true,
          );
        };
        pending.signal = options.signal;
        pending.abort = abort;
        options.signal.addEventListener("abort", abort, { once: true });
      }
      this.#pending.set(id, pending);
    });

    const request = `${JSON.stringify({ id, method, params })}\n`;
    try {
      this.#child.stdin.write(request, (error: Error | null | undefined) => {
        if (error !== null && error !== undefined) {
          this.#failTransport(
            new AdapterTransportError("ADAPTER_STDIN_FAILED", `adapter stdin failed: ${error.message}`, { cause: error }),
            true,
          );
        }
      });
    } catch (error: unknown) {
      this.#failTransport(
        new AdapterTransportError("ADAPTER_STDIN_FAILED", "adapter stdin write failed", { cause: error }),
        true,
      );
    }
    return await result;
  }

  async close(): Promise<void> {
    if (this.#closePromise !== undefined) {
      return await this.#closePromise;
    }
    this.#closePromise = this.#closeOnce();
    return await this.#closePromise;
  }

  async #closeOnce(): Promise<void> {
    this.#closing = true;
    this.#closed = true;
    this.#rejectPending(
      this.#terminalError ?? new AdapterTransportError("ADAPTER_CLOSED", "adapter transport closed before response"),
    );
    this.#lines.close();
    if (this.#child.exitCode !== null || this.#child.signalCode !== null || this.#terminalError?.code === "ADAPTER_SPAWN_FAILED") {
      this.#child.stdin.destroy();
      return;
    }
    this.#child.stdin.end();
    const exitedGracefully = await this.#waitForExit(this.#closeTimeoutMs);
    if (!exitedGracefully && this.#child.exitCode === null && this.#child.signalCode === null) {
      this.#child.kill("SIGKILL");
      await this.#waitForExit(this.#closeTimeoutMs);
    }
    this.#child.stdin.destroy();
  }

  async #waitForExit(timeoutMs: number): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    const exited = this.#exited.then(() => true);
    const result = await Promise.race([exited, timedOut]);
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    return result;
  }

  #receive(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (cause: unknown) {
      this.#failTransport(
        new AdapterTransportError("ADAPTER_PROTOCOL_INVALID", "adapter emitted malformed JSON", { cause }),
        true,
      );
      return;
    }
    if (!isRecord(value) || typeof value.id !== "string") {
      this.#failTransport(
        new AdapterTransportError("ADAPTER_PROTOCOL_INVALID", "adapter response envelope is invalid"),
        true,
      );
      return;
    }
    const hasResult = Object.hasOwn(value, "result");
    const hasError = Object.hasOwn(value, "error");
    if (hasResult === hasError) {
      this.#failTransport(
        new AdapterTransportError("ADAPTER_PROTOCOL_INVALID", "adapter response requires exactly one result or error"),
        true,
      );
      return;
    }
    const pending = this.#pending.get(value.id);
    if (pending === undefined) {
      this.#failTransport(
        new AdapterTransportError("ADAPTER_PROTOCOL_INVALID", "adapter response has an unknown request ID"),
        true,
      );
      return;
    }
    this.#pending.delete(value.id);
    this.#cleanupPending(pending);
    if (hasError) {
      if (!isRecord(value.error) || typeof value.error.code !== "string" || typeof value.error.message !== "string") {
        const error = new AdapterTransportError("ADAPTER_PROTOCOL_INVALID", "adapter error envelope is invalid");
        pending.reject(error);
        this.#failTransport(error, true);
        return;
      }
      const error = new Error(value.error.message);
      error.name = value.error.code;
      pending.reject(error);
      return;
    }
    pending.resolve(value.result);
  }

  #failTransport(error: AdapterTransportError, kill: boolean): void {
    if (this.#terminalError === undefined) {
      this.#terminalError = error;
    }
    this.#closed = true;
    this.#rejectPending(this.#terminalError);
    this.#lines.close();
    if (kill && this.#child.exitCode === null && this.#child.signalCode === null) {
      this.#child.kill("SIGKILL");
    }
  }

  #rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      this.#cleanupPending(pending);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #cleanupPending(pending: PendingRequest): void {
    clearTimeout(pending.timer);
    if (pending.signal !== undefined && pending.abort !== undefined) {
      pending.signal.removeEventListener("abort", pending.abort);
    }
  }
}

export async function requestAdapter(input: {
  command: string[];
  environment: Record<string, string>;
  method: string;
  params: Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<unknown> {
  const transport = new AdapterProcessTransport({
    command: input.command,
    environment: input.environment,
    ...(input.timeoutMs === undefined ? {} : { responseTimeoutMs: input.timeoutMs }),
  });
  try {
    return await transport.request(input.method, input.params, {
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
  } finally {
    await transport.close();
  }
}

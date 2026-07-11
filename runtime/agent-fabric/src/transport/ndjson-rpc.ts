import { connect as connectSocket, type Socket } from "node:net";
import { createInterface, type Interface } from "node:readline";

import { v7 as uuidv7 } from "uuid";

import { isDaemonResponse, type DaemonResponse } from "../daemon/protocol.js";

type Pending = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
};

export type TimedNdjsonTransportOptions = {
  socketPath: string;
  capability: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
};

export type TimedNdjsonTransportDependencies = {
  connect(path: string): Socket;
};

export class FabricRemoteError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FabricError";
    this.code = code;
  }
}

const defaultDependencies: TimedNdjsonTransportDependencies = { connect: connectSocket };

function positiveTimeout(value: number | undefined, fallback: number, label: string): number {
  const timeout = value ?? fallback;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new TypeError(`${label} must be a positive number`);
  }
  return timeout;
}

export class TimedNdjsonTransport {
  readonly #socket: Socket;
  readonly #lines: Interface;
  readonly #capability: string;
  readonly #requestTimeoutMs: number;
  readonly #pending = new Map<string, Pending>();
  #closed = false;

  private constructor(socket: Socket, capability: string, requestTimeoutMs: number) {
    this.#socket = socket;
    this.#capability = capability;
    this.#requestTimeoutMs = requestTimeoutMs;
    this.#lines = createInterface({ input: socket, crlfDelay: Infinity });
    this.#lines.on("line", (line) => this.#receive(line));
    socket.on("error", () => this.#disconnect());
    socket.on("close", () => this.#disconnect());
  }

  static async connect(
    options: TimedNdjsonTransportOptions,
    dependencies: TimedNdjsonTransportDependencies = defaultDependencies,
  ): Promise<TimedNdjsonTransport> {
    const connectTimeoutMs = positiveTimeout(options.connectTimeoutMs, 5_000, "connect timeout");
    const requestTimeoutMs = positiveTimeout(options.requestTimeoutMs, 30_000, "request timeout");
    const socket = dependencies.connect(options.socketPath);
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timeout);
        socket.off("connect", onConnect);
        socket.off("error", onError);
      };
      const onConnect = (): void => {
        cleanup();
        resolve();
      };
      const onError = (error: Error): void => {
        cleanup();
        socket.destroy();
        reject(error);
      };
      const timeout = setTimeout(() => {
        cleanup();
        socket.destroy();
        reject(new FabricRemoteError("DAEMON_CONNECT_TIMEOUT", "daemon connection timed out"));
      }, connectTimeoutMs);
      socket.once("connect", onConnect);
      socket.once("error", onError);
    });
    return new TimedNdjsonTransport(socket, options.capability, requestTimeoutMs);
  }

  #disconnect(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#lines.close();
    this.#rejectPending(new FabricRemoteError("DAEMON_DISCONNECTED", "daemon connection closed"));
  }

  #rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #receive(line: string): void {
    let response: DaemonResponse;
    try {
      const value: unknown = JSON.parse(line);
      if (!isDaemonResponse(value)) throw new Error("invalid daemon response");
      response = value;
    } catch (error: unknown) {
      this.#rejectPending(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    const pending = this.#pending.get(response.id);
    if (pending === undefined) return;
    this.#pending.delete(response.id);
    clearTimeout(pending.timeout);
    if ("error" in response) {
      pending.reject(new FabricRemoteError(response.error.code, response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  async call(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.#closed) {
      throw new FabricRemoteError("DAEMON_DISCONNECTED", "daemon connection is closed");
    }
    const id = uuidv7();
    const result = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.#pending.delete(id)) return;
        reject(new FabricRemoteError("DAEMON_REQUEST_TIMEOUT", `daemon request timed out: ${method}`));
      }, this.#requestTimeoutMs);
      this.#pending.set(id, { resolve, reject, timeout });
    });
    this.#socket.write(
      `${JSON.stringify({ id, capability: this.#capability, method, params })}\n`,
      (error?: Error | null) => {
        if (error === undefined || error === null) return;
        const pending = this.#pending.get(id);
        if (pending === undefined) return;
        this.#pending.delete(id);
        clearTimeout(pending.timeout);
        pending.reject(error);
      },
    );
    return result;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    const closed = new Promise<void>((resolve) => this.#socket.once("close", resolve));
    this.#socket.end();
    await closed;
  }
}

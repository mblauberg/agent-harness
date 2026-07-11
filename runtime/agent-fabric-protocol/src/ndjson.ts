import { randomUUID } from "node:crypto";
import type { Duplex, Readable, Writable } from "node:stream";

import { negotiateProtocol, operationsForFeatures, type ProtocolFeature } from "./features.js";
import type { FabricOperation } from "./operations.js";
import { strictRecord } from "./primitives.js";
import {
  PROTOCOL_LIMITS,
  type OperationInputMap,
  type OperationResultMap,
  type ProtocolInitializeRequest,
  type ProtocolInitializeResult,
  type ProtocolLimits,
} from "./rpc-contract.js";
import type { ProtocolRpcTransport } from "./client.js";

export type NdjsonErrorCode =
  | "NDJSON_FRAME_TOO_LARGE"
  | "NDJSON_INVALID_UTF8"
  | "NDJSON_INCOMPLETE_FRAME"
  | "NDJSON_STREAM_ERROR"
  | "NDJSON_WRITE_OVERLOADED"
  | "NDJSON_WRITE_FAILED";

export class NdjsonProtocolError extends Error {
  readonly code: NdjsonErrorCode;

  constructor(code: NdjsonErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NdjsonProtocolError";
    this.code = code;
  }
}

type ReaderOptions = {
  maximumFrameBytes: number;
  idleTimeoutMs?: number;
  onFrame(frame: string): void;
  onError?(error: NdjsonProtocolError): void;
  onIdle?(): void;
};

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer`);
  return value;
}

export class BoundedNdjsonReader {
  readonly #input: Readable;
  readonly #maximumFrameBytes: number;
  readonly #idleTimeoutMs: number | undefined;
  readonly #onFrame: (frame: string) => void;
  readonly #onError: (error: NdjsonProtocolError) => void;
  readonly #onIdle: () => void;
  readonly #parts: Buffer[] = [];
  readonly closed: Promise<void>;
  #resolveClosed: () => void = () => undefined;
  #frameBytes = 0;
  #timer: NodeJS.Timeout | undefined;
  #finished = false;

  constructor(input: Readable, options: ReaderOptions) {
    this.#input = input;
    this.#maximumFrameBytes = positiveInteger(options.maximumFrameBytes, "maximumFrameBytes");
    this.#idleTimeoutMs = options.idleTimeoutMs === undefined
      ? undefined
      : positiveInteger(options.idleTimeoutMs, "idleTimeoutMs");
    this.#onFrame = options.onFrame;
    this.#onError = options.onError ?? (() => undefined);
    this.#onIdle = options.onIdle ?? (() => undefined);
    this.closed = new Promise<void>((resolve) => { this.#resolveClosed = resolve; });
    input.on("data", this.#data);
    input.once("end", this.#end);
    input.once("close", this.#close);
    input.once("error", this.#streamError);
    this.#resetIdleTimer();
  }

  close(): void {
    this.#finish();
  }

  readonly #data = (chunk: Buffer | string): void => {
    if (this.#finished) return;
    this.#resetIdleTimer();
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    let start = 0;
    while (start < bytes.length && !this.#finished) {
      const newline = bytes.indexOf(0x0a, start);
      const end = newline === -1 ? bytes.length : newline;
      const segment = bytes.subarray(start, end);
      if (this.#frameBytes + segment.length > this.#maximumFrameBytes) {
        this.#fail(new NdjsonProtocolError(
          "NDJSON_FRAME_TOO_LARGE",
          `NDJSON frame exceeds ${String(this.#maximumFrameBytes)} bytes`,
        ));
        return;
      }
      if (segment.length > 0) {
        this.#parts.push(segment);
        this.#frameBytes += segment.length;
      }
      if (newline === -1) return;
      this.#emitFrame();
      start = newline + 1;
    }
  };

  readonly #end = (): void => {
    if (this.#frameBytes > 0) {
      this.#fail(new NdjsonProtocolError("NDJSON_INCOMPLETE_FRAME", "NDJSON stream ended mid-frame"));
      return;
    }
    this.#finish();
  };

  readonly #close = (): void => {
    if (this.#frameBytes > 0) {
      this.#fail(new NdjsonProtocolError("NDJSON_INCOMPLETE_FRAME", "NDJSON stream closed mid-frame"));
      return;
    }
    this.#finish();
  };

  readonly #streamError = (cause: Error): void => {
    this.#fail(new NdjsonProtocolError("NDJSON_STREAM_ERROR", `NDJSON stream failed: ${cause.message}`, { cause }));
  };

  #emitFrame(): void {
    let bytes = this.#parts.length === 0 ? Buffer.alloc(0) : Buffer.concat(this.#parts, this.#frameBytes);
    this.#parts.length = 0;
    this.#frameBytes = 0;
    if (bytes.at(-1) === 0x0d) bytes = bytes.subarray(0, -1);
    try {
      this.#onFrame(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (cause: unknown) {
      this.#fail(new NdjsonProtocolError("NDJSON_INVALID_UTF8", "NDJSON frame is not valid UTF-8", { cause }));
    }
  }

  #resetIdleTimer(): void {
    if (this.#idleTimeoutMs === undefined) return;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#onIdle();
      this.#finish();
    }, this.#idleTimeoutMs);
    this.#timer.unref();
  }

  #fail(error: NdjsonProtocolError): void {
    if (this.#finished) return;
    this.#onError(error);
    this.#finish();
  }

  #finish(): void {
    if (this.#finished) return;
    this.#finished = true;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#input.off("data", this.#data);
    this.#input.off("end", this.#end);
    this.#input.off("close", this.#close);
    this.#input.off("error", this.#streamError);
    this.#resolveClosed();
  }
}

export class BoundedNdjsonWriter {
  readonly #output: Writable;
  readonly #maximumFrameBytes: number;
  readonly #maximumPendingWrites: number;
  #tail: Promise<void> = Promise.resolve();
  #pendingWrites = 0;

  constructor(output: Writable, options: { maximumFrameBytes: number; maximumPendingWrites: number }) {
    this.#output = output;
    this.#maximumFrameBytes = positiveInteger(options.maximumFrameBytes, "maximumFrameBytes");
    this.#maximumPendingWrites = positiveInteger(options.maximumPendingWrites, "maximumPendingWrites");
  }

  write(value: unknown): Promise<void> {
    if (this.#pendingWrites >= this.#maximumPendingWrites) {
      return Promise.reject(new NdjsonProtocolError("NDJSON_WRITE_OVERLOADED", "NDJSON writer pending limit reached"));
    }
    this.#pendingWrites += 1;
    const operation = this.#tail.then(() => this.#writeNow(value), () => this.#writeNow(value)).finally(() => {
      this.#pendingWrites -= 1;
    });
    this.#tail = operation.catch(() => undefined);
    return operation;
  }

  async #writeNow(value: unknown): Promise<void> {
    let frame: Buffer;
    try {
      const encoded = JSON.stringify(value);
      if (encoded === undefined) throw new TypeError("value has no JSON representation");
      frame = Buffer.from(`${encoded}\n`);
    } catch (cause: unknown) {
      throw new NdjsonProtocolError("NDJSON_WRITE_FAILED", "NDJSON value is not serializable", { cause });
    }
    if (frame.length - 1 > this.#maximumFrameBytes) {
      throw new NdjsonProtocolError("NDJSON_FRAME_TOO_LARGE", `NDJSON frame exceeds ${String(this.#maximumFrameBytes)} bytes`);
    }
    await new Promise<void>((resolveWrite, rejectWrite) => {
      this.#output.write(frame, (cause: Error | null | undefined) => {
        if (cause === null || cause === undefined) resolveWrite();
        else rejectWrite(new NdjsonProtocolError("NDJSON_WRITE_FAILED", `NDJSON write failed: ${cause.message}`, { cause }));
      });
    });
  }
}

export type ProtocolTransportErrorCode =
  | "PROTOCOL_INVALID"
  | "PROTOCOL_DISCONNECTED"
  | "PROTOCOL_TIMEOUT"
  | "PROTOCOL_OVERLOADED"
  | "PROTOCOL_FEATURE_UNAVAILABLE"
  | "PROTOCOL_NEGOTIATION_FAILED"
  | "PROTOCOL_REMOTE_ERROR";

export class ProtocolTransportError extends Error {
  readonly code: ProtocolTransportErrorCode;

  constructor(code: ProtocolTransportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProtocolTransportError";
    this.code = code;
  }
}

type PendingCall = {
  operation: string;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
};

function parseLimits(value: unknown): ProtocolLimits {
  const record = strictRecord(value, "initialize.result.limits", Object.keys(PROTOCOL_LIMITS));
  const parsed: Record<string, number> = {};
  for (const [key, maximum] of Object.entries(PROTOCOL_LIMITS)) {
    const limit = record[key];
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
      throw new ProtocolTransportError("PROTOCOL_NEGOTIATION_FAILED", `initialize limit ${key} is invalid`);
    }
    parsed[key] = limit;
  }
  return {
    maximumFrameBytes: parsed.maximumFrameBytes ?? PROTOCOL_LIMITS.maximumFrameBytes,
    maximumPendingCalls: parsed.maximumPendingCalls ?? PROTOCOL_LIMITS.maximumPendingCalls,
    maximumInFlightPerConnection: parsed.maximumInFlightPerConnection ?? PROTOCOL_LIMITS.maximumInFlightPerConnection,
    idleTimeoutMs: parsed.idleTimeoutMs ?? PROTOCOL_LIMITS.idleTimeoutMs,
    requestTimeoutMs: parsed.requestTimeoutMs ?? PROTOCOL_LIMITS.requestTimeoutMs,
  };
}

function parseInitializeResult(value: unknown): ProtocolInitializeResult {
  const record = strictRecord(value, "initialize.result", [
    "protocolVersion",
    "daemonVersion",
    "daemonInstanceGeneration",
    "features",
    "limits",
  ]);
  if (record.protocolVersion !== 1 || typeof record.daemonVersion !== "string") {
    throw new ProtocolTransportError("PROTOCOL_NEGOTIATION_FAILED", "initialize result version is invalid");
  }
  if (typeof record.daemonInstanceGeneration !== "number" || !Number.isSafeInteger(record.daemonInstanceGeneration) || record.daemonInstanceGeneration < 1) {
    throw new ProtocolTransportError("PROTOCOL_NEGOTIATION_FAILED", "daemon instance generation is invalid");
  }
  if (!Array.isArray(record.features)) throw new ProtocolTransportError("PROTOCOL_NEGOTIATION_FAILED", "features must be an array");
  const known: ProtocolFeature[] = [];
  for (const feature of record.features) {
    if (typeof feature !== "string" || ![
      "project-sessions.v1",
      "operator-control.v1",
      "intakes.v1",
      "scoped-gates.v1",
      "resource-reservations.v1",
      "request-results.v1",
      "chair-takeover.v1",
      "operator-projection.v1",
      "message-body-read.v1",
      "lifecycle-control.v1",
    ].includes(feature)) {
      throw new ProtocolTransportError("PROTOCOL_NEGOTIATION_FAILED", `unknown negotiated feature: ${String(feature)}`);
    }
    const matched = ([
      "project-sessions.v1",
      "operator-control.v1",
      "intakes.v1",
      "scoped-gates.v1",
      "resource-reservations.v1",
      "request-results.v1",
      "chair-takeover.v1",
      "operator-projection.v1",
      "message-body-read.v1",
      "lifecycle-control.v1",
    ] as const).find((candidate) => candidate === feature);
    if (matched !== undefined) known.push(matched);
  }
  return {
    protocolVersion: 1,
    daemonVersion: record.daemonVersion,
    daemonInstanceGeneration: record.daemonInstanceGeneration,
    features: known,
    limits: parseLimits(record.limits),
  };
}

export class NdjsonRpcTransport implements ProtocolRpcTransport {
  readonly #stream: Duplex;
  readonly #reader: BoundedNdjsonReader;
  readonly #writer: BoundedNdjsonWriter;
  readonly #pending = new Map<string, PendingCall>();
  #limits: ProtocolLimits = PROTOCOL_LIMITS;
  #features: readonly ProtocolFeature[] = [];
  #allowedOperations: ReadonlySet<FabricOperation> = new Set();
  #terminalError: Error | undefined;
  #closed = false;

  private constructor(stream: Duplex) {
    this.#stream = stream;
    this.#writer = new BoundedNdjsonWriter(stream, {
      maximumFrameBytes: PROTOCOL_LIMITS.maximumFrameBytes,
      maximumPendingWrites: PROTOCOL_LIMITS.maximumPendingCalls,
    });
    this.#reader = new BoundedNdjsonReader(stream, {
      maximumFrameBytes: PROTOCOL_LIMITS.maximumFrameBytes,
      idleTimeoutMs: PROTOCOL_LIMITS.idleTimeoutMs,
      onFrame: (line) => this.#receive(line),
      onError: (error) => this.#fail(new ProtocolTransportError("PROTOCOL_INVALID", error.message, { cause: error })),
      onIdle: () => this.#fail(new ProtocolTransportError("PROTOCOL_TIMEOUT", "protocol connection became idle")),
    });
    stream.once("error", (error) => this.#fail(new ProtocolTransportError("PROTOCOL_DISCONNECTED", error.message, { cause: error })));
    stream.once("close", () => this.#fail(new ProtocolTransportError("PROTOCOL_DISCONNECTED", "protocol stream closed")));
  }

  static async connect(stream: Duplex, request: ProtocolInitializeRequest): Promise<NdjsonRpcTransport> {
    const transport = new NdjsonRpcTransport(stream);
    try {
      const raw = await transport.#wireCall("initialize", request);
      const initialized = parseInitializeResult(raw);
      const negotiation = negotiateProtocol(request, initialized);
      if (!negotiation.ok) {
        throw new ProtocolTransportError("PROTOCOL_NEGOTIATION_FAILED", `protocol negotiation failed: ${negotiation.reason}`);
      }
      transport.#features = negotiation.features;
      transport.#allowedOperations = operationsForFeatures(negotiation.features);
      transport.#limits = initialized.limits;
      return transport;
    } catch (error: unknown) {
      stream.destroy();
      throw error;
    }
  }

  get features(): readonly ProtocolFeature[] {
    return this.#features;
  }

  async call<Operation extends FabricOperation>(
    operation: Operation,
    input: OperationInputMap[Operation],
  ): Promise<OperationResultMap[Operation]> {
    if (!this.#allowedOperations.has(operation)) {
      throw new ProtocolTransportError(
        "PROTOCOL_FEATURE_UNAVAILABLE",
        `operation was not negotiated: ${operation}`,
      );
    }
    const value = await this.#wireCall(operation, input);
    // The operation discriminant and closed response envelope were validated above.
    return value as OperationResultMap[Operation];
  }

  async #wireCall(operation: string, input: unknown): Promise<unknown> {
    if (this.#closed) throw this.#terminalError ?? new ProtocolTransportError("PROTOCOL_DISCONNECTED", "transport is closed");
    if (this.#pending.size >= this.#limits.maximumPendingCalls) {
      throw new ProtocolTransportError("PROTOCOL_OVERLOADED", "protocol pending-call limit reached");
    }
    const id = randomUUID();
    const request = { id, operation, input };
    const encoded = JSON.stringify(request);
    if (Buffer.byteLength(encoded) > this.#limits.maximumFrameBytes) {
      throw new ProtocolTransportError("PROTOCOL_INVALID", "protocol request exceeds negotiated frame limit");
    }
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.#pending.delete(id)) return;
        reject(new ProtocolTransportError("PROTOCOL_TIMEOUT", `protocol request timed out: ${operation}`));
      }, this.#limits.requestTimeoutMs);
      timer.unref();
      this.#pending.set(id, { operation, resolve, reject, timer });
    });
    try {
      await this.#writer.write(request);
    } catch (error: unknown) {
      const pending = this.#pending.get(id);
      if (pending !== undefined) {
        clearTimeout(pending.timer);
        this.#pending.delete(id);
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return await result;
  }

  #receive(line: string): void {
    try {
      const decoded: unknown = JSON.parse(line);
      if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) throw new TypeError("response must be an object");
      const ok: unknown = Reflect.get(decoded, "ok");
      const record = strictRecord(decoded, "response", ok === true
        ? ["id", "operation", "ok", "result"]
        : ["id", "operation", "ok", "error"]);
      if (typeof record.id !== "string" || typeof record.operation !== "string" || typeof record.ok !== "boolean") {
        throw new TypeError("response identity is invalid");
      }
      const pending = this.#pending.get(record.id);
      if (pending === undefined) return;
      if (pending.operation !== record.operation) throw new TypeError("response operation does not match request");
      clearTimeout(pending.timer);
      this.#pending.delete(record.id);
      if (record.ok) pending.resolve(record.result);
      else {
        const error = strictRecord(record.error, "response.error", ["code", "message", "retryable", "details"]);
        pending.reject(new ProtocolTransportError(
          "PROTOCOL_REMOTE_ERROR",
          typeof error.message === "string" ? error.message : "remote protocol error",
        ));
      }
    } catch (error: unknown) {
      this.#fail(new ProtocolTransportError(
        "PROTOCOL_INVALID",
        error instanceof Error ? error.message : String(error),
        { cause: error },
      ));
    }
  }

  #fail(error: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#terminalError = error;
    this.#reader.close();
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#reader.close();
    this.#stream.end();
  }
}

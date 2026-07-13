import { randomUUID } from "node:crypto";
import type { Duplex, Readable, Writable } from "node:stream";

import {
  parseProtocolInitializeRequest,
  parseProtocolInitializeResult,
  ProtocolAuthenticationError,
} from "./authentication.js";
import { protocolFailureMessage } from "./codec.js";
import { negotiateProtocol, operationsForFeatures, type ProtocolFeature } from "./features.js";
import { isFabricOperation, type FabricOperation } from "./operations.js";
import {
  parseOperationInputForPrincipal,
  parseOperationResult,
  parseOperationResultForInput,
} from "./operation-codecs.js";
import {
  ProtocolResultShapeError,
  assertOperationResultFeatureShape,
} from "./result-feature-shape.js";
import { parseJsonValue, strictRecord, type JsonValue } from "./primitives.js";
import {
  PROTOCOL_LIMITS,
  PROTOCOL_ERROR_CODES,
  type OperationInputMap,
  type OperationResultMap,
  type ProtocolInitializeRequest,
  type ProtocolInitializeResult,
  type ProtocolLimits,
  type ProtocolErrorCode,
  type ProtocolFailure,
  type ProtocolOperation,
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
  #maximumFrameBytes: number;
  #idleTimeoutMs: number | undefined;
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

  tightenLimits(options: { maximumFrameBytes: number; idleTimeoutMs: number }): void {
    const maximumFrameBytes = positiveInteger(options.maximumFrameBytes, "maximumFrameBytes");
    const idleTimeoutMs = positiveInteger(options.idleTimeoutMs, "idleTimeoutMs");
    if (maximumFrameBytes > this.#maximumFrameBytes ||
        (this.#idleTimeoutMs !== undefined && idleTimeoutMs > this.#idleTimeoutMs)) {
      throw new TypeError("negotiated reader limits may only narrow bootstrap limits");
    }
    this.#maximumFrameBytes = maximumFrameBytes;
    this.#idleTimeoutMs = idleTimeoutMs;
    if (this.#frameBytes > maximumFrameBytes) {
      this.#fail(new NdjsonProtocolError(
        "NDJSON_FRAME_TOO_LARGE",
        `buffered NDJSON frame exceeds negotiated ${String(maximumFrameBytes)} bytes`,
      ));
      return;
    }
    this.#resetIdleTimer();
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
  | "PROTOCOL_INCOMPATIBLE"
  | "PROTOCOL_RESULT_INVALID";

export class ProtocolTransportError extends Error {
  readonly code: ProtocolTransportErrorCode;

  constructor(code: ProtocolTransportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProtocolTransportError";
    this.code = code;
  }
}

export class ProtocolRemoteError extends Error {
  readonly code: ProtocolErrorCode;
  readonly retryable: boolean;
  readonly details: JsonValue | undefined;

  constructor(failure: ProtocolFailure) {
    super(failure.message);
    this.name = "ProtocolRemoteError";
    this.code = failure.code;
    this.retryable = failure.retryable;
    this.details = failure.details;
  }
}

type PendingCall = {
  operation: string;
  input: unknown;
  state: "queued" | "in-flight";
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
};

type QueuedCall = { id: string; request: { id: string; operation: string; input: unknown } };

export class NdjsonRpcTransport implements ProtocolRpcTransport {
  readonly #stream: Duplex;
  readonly #reader: BoundedNdjsonReader;
  readonly #writer: BoundedNdjsonWriter;
  readonly #pending = new Map<string, PendingCall>();
  readonly #queue: QueuedCall[] = [];
  #inFlight = 0;
  #limits: ProtocolLimits = PROTOCOL_LIMITS;
  #features: readonly ProtocolFeature[] = [];
  #principal: ProtocolInitializeResult["principal"] | undefined;
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
      const parsedRequest = parseProtocolInitializeRequest(request);
      const raw = await transport.#wireCall("initialize", parsedRequest);
      const initialized = parseProtocolInitializeResult(raw);
      if (initialized.clientNonce !== parsedRequest.authentication.clientNonce) {
        throw new ProtocolAuthenticationError("initialize response is not bound to the client nonce");
      }
      if (initialized.principal.kind !== parsedRequest.expectedPrincipalKind) {
        throw new ProtocolAuthenticationError("initialize response principal kind does not match the credential expectation");
      }
      const negotiation = negotiateProtocol(parsedRequest, initialized);
      if (!negotiation.ok) {
        throw new ProtocolTransportError("PROTOCOL_NEGOTIATION_FAILED", `protocol negotiation failed: ${negotiation.reason}`);
      }
      const negotiatedOperations = operationsForFeatures(negotiation.features);
      const invalidGrant = initialized.allowedOperations.find((operation) => !negotiatedOperations.has(operation));
      if (invalidGrant !== undefined) {
        throw new ProtocolAuthenticationError(
          `allowed operation ${invalidGrant} is outside the client's negotiated feature set`,
        );
      }
      transport.#features = negotiation.features;
      transport.#principal = initialized.principal;
      transport.#allowedOperations = new Set(initialized.allowedOperations);
      transport.#limits = initialized.limits;
      transport.#reader.tightenLimits({
        maximumFrameBytes: initialized.limits.maximumFrameBytes,
        idleTimeoutMs: initialized.limits.idleTimeoutMs,
      });
      return transport;
    } catch (error: unknown) {
      transport.#terminate(
        error instanceof Error ? error : new ProtocolTransportError("PROTOCOL_NEGOTIATION_FAILED", String(error)),
      );
      throw error;
    }
  }

  get features(): readonly ProtocolFeature[] {
    return this.#features;
  }

  get principal(): ProtocolInitializeResult["principal"] {
    if (this.#principal === undefined) throw new ProtocolTransportError("PROTOCOL_NEGOTIATION_FAILED", "transport is not initialized");
    return this.#principal;
  }

  get allowedOperations(): ReadonlySet<FabricOperation> {
    return this.#allowedOperations;
  }

  async call<Operation extends ProtocolOperation>(
    operation: Operation,
    input: OperationInputMap[Operation],
  ): Promise<OperationResultMap[Operation]> {
    if (!this.#allowedOperations.has(operation)) {
      throw new ProtocolTransportError(
        "PROTOCOL_FEATURE_UNAVAILABLE",
        `operation was not negotiated: ${operation}`,
      );
    }
    const parsedInput = parseOperationInputForPrincipal(operation, this.principal.kind, input);
    const value = await this.#wireCall(operation, parsedInput);
    return parseOperationResult(operation, value);
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
        const pending = this.#pending.get(id);
        if (pending === undefined) return;
        this.#pending.delete(id);
        if (pending.state === "queued") {
          const queueIndex = this.#queue.findIndex((entry) => entry.id === id);
          if (queueIndex >= 0) this.#queue.splice(queueIndex, 1);
          reject(new ProtocolTransportError("PROTOCOL_TIMEOUT", `queued protocol request timed out: ${operation}`));
          return;
        }
        reject(new ProtocolTransportError("PROTOCOL_TIMEOUT", `protocol request timed out: ${operation}`));
        this.#fail(new ProtocolTransportError("PROTOCOL_TIMEOUT", `in-flight protocol request timed out: ${operation}`));
      }, this.#limits.requestTimeoutMs);
      timer.unref();
      this.#pending.set(id, { operation, input, state: "queued", resolve, reject, timer });
    });
    this.#queue.push({ id, request });
    this.#drainQueue();
    return await result;
  }

  #drainQueue(): void {
    while (!this.#closed && this.#inFlight < this.#limits.maximumInFlightPerConnection) {
      const queued = this.#queue.shift();
      if (queued === undefined) return;
      const pending = this.#pending.get(queued.id);
      if (pending === undefined) continue;
      pending.state = "in-flight";
      this.#inFlight += 1;
      void this.#writer.write(queued.request).catch((error: unknown) => {
        const active = this.#pending.get(queued.id);
        if (active === undefined) return;
        clearTimeout(active.timer);
        this.#pending.delete(queued.id);
        this.#inFlight -= 1;
        active.reject(error instanceof Error ? error : new Error(String(error)));
        this.#drainQueue();
      });
    }
  }

  #completePending(id: string): PendingCall | undefined {
    const pending = this.#pending.get(id);
    if (pending === undefined) return undefined;
    clearTimeout(pending.timer);
    this.#pending.delete(id);
    if (pending.state === "in-flight") this.#inFlight -= 1;
    this.#drainQueue();
    return pending;
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
      if (record.ok) {
        if (record.operation !== "initialize" && isFabricOperation(record.operation)) {
          try {
            const parsed = parseOperationResultForInput(
              record.operation,
              pending.input as never,
              record.result,
              this.principal,
            );
            assertOperationResultFeatureShape(
              record.operation,
              this.#features,
              parsed,
            );
          } catch (cause: unknown) {
            if (cause instanceof ProtocolResultShapeError) {
              this.#fail(new ProtocolTransportError(
                "PROTOCOL_INCOMPATIBLE",
                cause.message,
                { cause },
              ));
              return;
            }
            const completed = this.#completePending(record.id);
            completed?.reject(new ProtocolTransportError(
              "PROTOCOL_RESULT_INVALID",
              cause instanceof Error ? cause.message : String(cause),
              { cause },
            ));
            return;
          }
        }
        this.#completePending(record.id)?.resolve(record.result);
      }
      else {
        const failure = parseProtocolFailure(record.error);
        const remote = new ProtocolRemoteError(failure);
        if (failure.code === "PROTOCOL_INCOMPATIBLE") {
          this.#fail(new ProtocolTransportError(
            "PROTOCOL_INCOMPATIBLE",
            failure.message,
            { cause: remote },
          ));
          return;
        }
        this.#completePending(record.id)?.reject(remote);
      }
    } catch (error: unknown) {
      this.#fail(new ProtocolTransportError(
        "PROTOCOL_INVALID",
        error instanceof Error ? error.message : String(error),
        { cause: error },
      ));
    }
  }

  #terminate(error: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#terminalError = error;
    this.#reader.close();
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    this.#queue.length = 0;
    this.#inFlight = 0;
    this.#stream.destroy();
  }

  #fail(error: Error): void {
    this.#terminate(error);
  }

  async close(): Promise<void> {
    this.#terminate(new ProtocolTransportError("PROTOCOL_DISCONNECTED", "protocol transport closed"));
  }
}

const protocolErrorCodes: ReadonlySet<string> = new Set(PROTOCOL_ERROR_CODES);

export function parseProtocolFailure(value: unknown): ProtocolFailure {
  const record = strictRecord(value, "response.error", ["code", "message", "retryable", "details"]);
  if (typeof record.code !== "string" || !protocolErrorCodes.has(record.code)) {
    throw new ProtocolTransportError("PROTOCOL_INVALID", "response error code is invalid");
  }
  if (typeof record.retryable !== "boolean") {
    throw new ProtocolTransportError("PROTOCOL_INVALID", "response error fields are invalid");
  }
  let message: string;
  try {
    message = protocolFailureMessage.parse(record.message, "response.error.message");
  } catch (error) {
    throw new ProtocolTransportError(
      "PROTOCOL_INVALID",
      error instanceof Error ? error.message : "response error message is invalid",
    );
  }
  const details = record.details === undefined ? undefined : parseJsonValue(record.details, "response.error.details");
  return {
    code: record.code as ProtocolErrorCode,
    message,
    retryable: record.retryable,
    ...(details === undefined ? {} : { details }),
  };
}

import type { Readable, Writable } from "node:stream";

export const FABRIC_PROTOCOL_LIMITS = Object.freeze({
  maximumFrameBytes: 1_048_576,
  maximumConnections: 32,
  maximumInFlightPerConnection: 16,
  maximumTotalInFlight: 128,
  maximumClientPending: 32,
  maximumAdapterInFlight: 8,
  idleTimeoutMs: 300_000,
});

export type FabricProtocolLimits = typeof FABRIC_PROTOCOL_LIMITS;

export type NdjsonProtocolErrorCode =
  | "NDJSON_FRAME_TOO_LARGE"
  | "NDJSON_INVALID_UTF8"
  | "NDJSON_INCOMPLETE_FRAME"
  | "NDJSON_STREAM_ERROR"
  | "NDJSON_WRITE_OVERLOADED"
  | "NDJSON_WRITE_FAILED";

export class NdjsonProtocolError extends Error {
  readonly code: NdjsonProtocolErrorCode;

  constructor(code: NdjsonProtocolErrorCode, message: string, options?: ErrorOptions) {
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
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

/** Incremental, byte-bounded NDJSON framing shared by every fabric wire boundary. */
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
    this.closed = new Promise<void>((resolve) => {
      this.#resolveClosed = resolve;
    });
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
    if (this.#finished) return;
    if (this.#frameBytes > 0) {
      this.#fail(new NdjsonProtocolError("NDJSON_INCOMPLETE_FRAME", "NDJSON stream ended mid-frame"));
      return;
    }
    this.#finish();
  };

  readonly #close = (): void => {
    if (this.#finished) return;
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
      const frame = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      this.#onFrame(frame);
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

type WriterOptions = { maximumFrameBytes: number; maximumPendingWrites: number };

/** Serializes writes and does not dequeue another response until the stream accepts the prior one. */
export class BoundedNdjsonWriter {
  readonly #output: Writable;
  readonly #maximumFrameBytes: number;
  readonly #maximumPendingWrites: number;
  #tail: Promise<void> = Promise.resolve();
  #pendingWrites = 0;

  constructor(output: Writable, options: WriterOptions) {
    this.#output = output;
    this.#maximumFrameBytes = positiveInteger(options.maximumFrameBytes, "maximumFrameBytes");
    this.#maximumPendingWrites = positiveInteger(options.maximumPendingWrites, "maximumPendingWrites");
  }

  write(value: unknown): Promise<void> {
    if (this.#pendingWrites >= this.#maximumPendingWrites) {
      return Promise.reject(new NdjsonProtocolError(
        "NDJSON_WRITE_OVERLOADED",
        `NDJSON writer permits ${String(this.#maximumPendingWrites)} pending writes`,
      ));
    }
    this.#pendingWrites += 1;
    const operation = this.#tail.then(
      () => this.#writeNow(value),
      () => this.#writeNow(value),
    ).finally(() => { this.#pendingWrites -= 1; });
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
      throw new NdjsonProtocolError("NDJSON_WRITE_FAILED", "NDJSON response is not serializable", { cause });
    }
    if (frame.length - 1 > this.#maximumFrameBytes) {
      throw new NdjsonProtocolError(
        "NDJSON_FRAME_TOO_LARGE",
        `NDJSON frame exceeds ${String(this.#maximumFrameBytes)} bytes`,
      );
    }
    await new Promise<void>((resolve, reject) => {
      this.#output.write(frame, (cause: Error | null | undefined) => {
        if (cause === null || cause === undefined) {
          resolve();
        } else {
          reject(new NdjsonProtocolError("NDJSON_WRITE_FAILED", `NDJSON write failed: ${cause.message}`, { cause }));
        }
      });
    });
  }
}

import { randomUUID } from "node:crypto";
import type { Duplex } from "node:stream";

import {
  BoundedNdjsonReader,
  BoundedNdjsonWriter,
  PROTOCOL_ERROR_CODES,
  PROTOCOL_LIMITS,
  createProtocolInitializeResult,
  isActiveFabricOperation,
  parseIdentifier,
  parseJsonValue,
  parseOperationInputForPrincipal,
  parseOperationResult,
  parseProtocolInitializeRequest,
  strictRecord,
  type FabricOperation,
  type JsonValue,
  type OperationInputMap,
  type OperationResultMap,
  type ProtocolErrorCode,
  type ProtocolFeature,
  type ProtocolInitializeResult,
  type ProtocolLimits,
  type ProtocolOperation,
  type ProtocolPrincipal,
  type VerifiedProtocolCredential,
} from "@local/agent-fabric-protocol";

export type PublicProtocolContext = {
  principal: ProtocolPrincipal;
  allowedOperations: ReadonlySet<FabricOperation>;
  features: readonly ProtocolFeature[];
  connectionNonce: string;
};

export type PublicProtocolServerOptions = {
  daemonVersion: string;
  daemonInstanceGeneration: number;
  offeredFeatures: readonly ProtocolFeature[];
  limits?: ProtocolLimits;
  verifyCredential(credential: string): Promise<VerifiedProtocolCredential> | VerifiedProtocolCredential;
  dispatch<Operation extends ProtocolOperation>(
    context: PublicProtocolContext,
    operation: Operation,
    input: OperationInputMap[Operation],
  ): Promise<OperationResultMap[Operation] | unknown> | OperationResultMap[Operation] | unknown;
};

export type PublicProtocolConnection = {
  readonly closed: Promise<void>;
  close(): void;
};

const knownErrorCodes = new Set<string>(PROTOCOL_ERROR_CODES);
const retryableErrorCodes = new Set<ProtocolErrorCode>(["OVERLOADED", "DEADLINE_EXCEEDED"]);

function boundedMessage(error: unknown): string {
  const source = error instanceof Error ? error.message : String(error);
  const bytes = Buffer.from(source.length === 0 ? "protocol request failed" : source, "utf8");
  if (bytes.length <= 4_096) return bytes.toString("utf8");
  return `${new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4_080))}…`;
}

function failure(error: unknown): {
  code: ProtocolErrorCode;
  message: string;
  retryable: boolean;
  details?: JsonValue;
} {
  const reportedCode = typeof error === "object" && error !== null && "code" in error
    ? Reflect.get(error, "code")
    : undefined;
  const code = typeof reportedCode === "string" && knownErrorCodes.has(reportedCode)
    ? reportedCode as ProtocolErrorCode
    : error instanceof TypeError
      ? "PROTOCOL_INVALID"
      : "RECOVERY_REQUIRED";
  const reportedDetails = typeof error === "object" && error !== null && "details" in error
    ? Reflect.get(error, "details")
    : undefined;
  let details: JsonValue | undefined;
  if (reportedDetails !== undefined) {
    try {
      details = parseJsonValue(reportedDetails, "failure.details");
    } catch {
      details = undefined;
    }
  }
  return {
    code,
    message: boundedMessage(error),
    retryable: retryableErrorCodes.has(code),
    ...(details === undefined ? {} : { details }),
  };
}

function parseWireRequest(value: unknown): { id: string; operation: string; input: unknown } {
  const record = strictRecord(value, "request", ["id", "operation", "input"]);
  return {
    id: parseIdentifier<"ProtocolRequestId">(record.id, "request.id"),
    operation: typeof record.operation === "string"
      ? record.operation
      : (() => { throw new TypeError("request.operation must be a string"); })(),
    input: record.input,
  };
}

export function servePublicProtocolConnection(
  stream: Duplex,
  options: PublicProtocolServerOptions,
): PublicProtocolConnection {
  const limits = options.limits ?? PROTOCOL_LIMITS;
  const writer = new BoundedNdjsonWriter(stream, {
    maximumFrameBytes: PROTOCOL_LIMITS.maximumFrameBytes,
    maximumPendingWrites: PROTOCOL_LIMITS.maximumPendingCalls,
  });
  let initialized: ProtocolInitializeResult | undefined;
  let context: PublicProtocolContext | undefined;
  let inFlight = 0;
  let closed = false;

  const write = async (value: unknown): Promise<void> => {
    const encoded = JSON.stringify(value);
    if (encoded === undefined || Buffer.byteLength(encoded, "utf8") > limits.maximumFrameBytes) {
      throw new TypeError("protocol response exceeds the negotiated frame limit");
    }
    await writer.write(value);
  };

  const respondFailure = async (id: string, operation: string, error: unknown): Promise<void> => {
    await write({ id, operation, ok: false, error: failure(error) });
  };

  const handle = async (line: string): Promise<void> => {
    let request: { id: string; operation: string; input: unknown };
    try {
      request = parseWireRequest(JSON.parse(line));
    } catch (error: unknown) {
      await respondFailure("unknown", "initialize", error);
      return;
    }
    if (inFlight >= limits.maximumInFlightPerConnection) {
      await respondFailure(request.id, request.operation, Object.assign(
        new Error("protocol connection is overloaded"),
        { code: "OVERLOADED" },
      ));
      return;
    }
    inFlight += 1;
    try {
      if (request.operation === "initialize") {
        if (initialized !== undefined) throw new TypeError("protocol connection is already initialized");
        const input = parseProtocolInitializeRequest(request.input);
        const verifiedCredential = await options.verifyCredential(input.authentication.credential);
        initialized = createProtocolInitializeResult({
          request: input,
          verifiedCredential,
          daemonVersion: options.daemonVersion,
          daemonInstanceGeneration: options.daemonInstanceGeneration,
          offeredFeatures: options.offeredFeatures,
          limits,
          connectionNonce: `connection:${randomUUID()}` as never,
        });
        context = {
          principal: initialized.principal,
          allowedOperations: new Set(initialized.allowedOperations),
          features: initialized.features,
          connectionNonce: initialized.connectionNonce,
        };
        reader.tightenLimits({
          maximumFrameBytes: limits.maximumFrameBytes,
          idleTimeoutMs: limits.idleTimeoutMs,
        });
        await write({ id: request.id, operation: request.operation, ok: true, result: initialized });
        return;
      }
      if (initialized === undefined || context === undefined) {
        throw Object.assign(new Error("protocol initialize must succeed before operations"), {
          code: "AUTHENTICATION_FAILED",
        });
      }
      if (!isActiveFabricOperation(request.operation)) {
        throw Object.assign(new Error("protocol operation is unsupported or retired"), {
          code: "PROTOCOL_UNSUPPORTED",
        });
      }
      if (!context.allowedOperations.has(request.operation)) {
        throw Object.assign(new Error("protocol operation was not granted to this connection"), {
          code: "FEATURE_UNAVAILABLE",
        });
      }
      const operation = request.operation as ProtocolOperation;
      const input = parseOperationInputForPrincipal(operation, context.principal.kind, request.input);
      const dispatched = await options.dispatch(context, operation, input);
      const result = parseOperationResult(operation, dispatched);
      await write({ id: request.id, operation, ok: true, result });
    } catch (error: unknown) {
      await respondFailure(request.id, request.operation, error);
    } finally {
      inFlight -= 1;
    }
  };

  const reader = new BoundedNdjsonReader(stream, {
    maximumFrameBytes: PROTOCOL_LIMITS.maximumFrameBytes,
    idleTimeoutMs: PROTOCOL_LIMITS.idleTimeoutMs,
    onFrame: (line) => {
      void handle(line).catch(() => stream.destroy());
    },
    onError: () => stream.destroy(),
    onIdle: () => stream.destroy(),
  });
  stream.once("error", () => reader.close());
  stream.once("close", () => {
    closed = true;
    reader.close();
  });
  return {
    closed: reader.closed,
    close(): void {
      if (closed) return;
      closed = true;
      reader.close();
      stream.destroy();
    },
  };
}

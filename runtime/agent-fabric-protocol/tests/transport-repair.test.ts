import { Duplex } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  NdjsonRpcTransport,
  ProtocolRemoteError,
  PROTOCOL_ERROR_CODES,
  parseProtocolFailure,
} from "../src/index.js";

type WireRequest = { id: string; operation: string; input: unknown };

class ControlledLoopback extends Duplex {
  readonly requests: WireRequest[] = [];
  readonly #features: string[];
  readonly #maximumInFlight: number;
  readonly #maximumFrameBytes: number;
  #buffer = "";

  constructor(options: { features: string[]; maximumInFlight?: number; maximumFrameBytes?: number }) {
    super();
    this.#features = options.features;
    this.#maximumInFlight = options.maximumInFlight ?? 16;
    this.#maximumFrameBytes = options.maximumFrameBytes ?? 1_048_576;
  }

  override _read(): void {}

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.#buffer += chunk.toString("utf8");
    let newline = this.#buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      const request: WireRequest = JSON.parse(line);
      this.requests.push(request);
      if (request.operation === "initialize") {
        const initializeInput = request.input as { authentication: { clientNonce: string } };
        this.respond(request, {
          protocolVersion: 1,
          daemonVersion: "1.0.0",
          daemonInstanceGeneration: 1,
          principal: { kind: "operator", operatorId: "operator_01", projectId: "project_01", principalGeneration: 1 },
          clientNonce: initializeInput.authentication.clientNonce,
          connectionNonce: "connection_01",
          features: this.#features,
          allowedOperations: this.#features.includes("project-sessions.v1")
            ? [
                "fabric.v1.project-session.create",
                "fabric.v1.project-session.read",
                "fabric.v1.project-session.transition",
                "fabric.v1.project-session.close",
                "fabric.v1.project-session.membership.bind",
              ]
            : [],
          limits: {
            maximumFrameBytes: this.#maximumFrameBytes,
            maximumPendingCalls: 8,
            maximumInFlightPerConnection: this.#maximumInFlight,
            idleTimeoutMs: 300000,
            requestTimeoutMs: 30000,
          },
        });
      }
      newline = this.#buffer.indexOf("\n");
    }
    callback();
  }

  respond(request: WireRequest, result: unknown): void {
    this.push(`${JSON.stringify({ id: request.id, operation: request.operation, ok: true, result })}\n`);
  }

  fail(request: WireRequest, error: unknown): void {
    this.push(`${JSON.stringify({ id: request.id, operation: request.operation, ok: false, error })}\n`);
  }
}

const initialize = {
  protocolVersion: 1,
  client: { name: "test", version: "1.0.0" },
  authentication: { scheme: "capability", credential: "operator-secret-0001", clientNonce: "client_01" },
  expectedPrincipalKind: "operator",
  requiredFeatures: ["project-sessions.v1"],
  optionalFeatures: [],
} as const;

const getInput = {
  projectId: "project_01" as never,
  projectSessionId: "ps_01" as never,
  expectedGeneration: 1,
};

describe("validated NDJSON results", () => {
  it.each(["AUTHORITY_WIDENING", "STALE_LEASE_GENERATION", "PROJECTION_RESNAPSHOT_REQUIRED"] as const)(
    "preserves the public %s error code",
    (code) => {
      expect(parseProtocolFailure({ code, message: "typed failure", retryable: false })).toMatchObject({ code });
      expect(PROTOCOL_ERROR_CODES).toContain(code);
    },
  );

  it("rejects a malformed successful operation result", async () => {
    const stream = new ControlledLoopback({ features: ["project-sessions.v1"] });
    const transport = await NdjsonRpcTransport.connect(stream, initialize);
    const result = transport.call(FABRIC_OPERATIONS.projectSessionGet, getInput);
    await new Promise((resolve) => setImmediate(resolve));
    const request = stream.requests.at(-1);
    if (request === undefined) throw new Error("missing request");
    stream.respond(request, { spoof: true });

    await expect(result).rejects.toThrow(/project-session\.read\.result|projectSession has unknown field/);
    stream.destroy();
  });

  it("preserves typed remote code, retryability and state-diff details", async () => {
    const stream = new ControlledLoopback({ features: ["project-sessions.v1"] });
    const transport = await NdjsonRpcTransport.connect(stream, initialize);
    const result = transport.call(FABRIC_OPERATIONS.projectSessionGet, getInput);
    await new Promise((resolve) => setImmediate(resolve));
    const request = stream.requests.at(-1);
    if (request === undefined) throw new Error("missing request");
    stream.fail(request, {
      code: "STALE_REVISION",
      message: "stale",
      retryable: false,
      details: { expected: 2, actual: 3 },
    });

    const error = await result.catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ProtocolRemoteError);
    expect(error).toMatchObject({
      code: "STALE_REVISION",
      retryable: false,
      details: { expected: 2, actual: 3 },
    });
    stream.destroy();
  });
});

describe("negotiated in-flight limit", () => {
  it("does not write a second call until the first response frees capacity", async () => {
    const stream = new ControlledLoopback({ features: ["project-sessions.v1"], maximumInFlight: 1 });
    const transport = await NdjsonRpcTransport.connect(stream, initialize);
    const first = transport.call(FABRIC_OPERATIONS.projectSessionGet, getInput);
    const second = transport.call(FABRIC_OPERATIONS.projectSessionGet, getInput);
    await new Promise((resolve) => setImmediate(resolve));
    expect(stream.requests.filter((request) => request.operation !== "initialize")).toHaveLength(1);

    const firstRequest = stream.requests.at(-1);
    if (firstRequest === undefined) throw new Error("missing first request");
    stream.fail(firstRequest, { code: "NOT_FOUND", message: "missing", retryable: false });
    await first.catch(() => undefined);
    await new Promise((resolve) => setImmediate(resolve));
    expect(stream.requests.filter((request) => request.operation !== "initialize")).toHaveLength(2);

    const secondRequest = stream.requests.at(-1);
    if (secondRequest === undefined) throw new Error("missing second request");
    stream.fail(secondRequest, { code: "NOT_FOUND", message: "missing", retryable: false });
    await second.catch(() => undefined);
    stream.destroy();
  });

  it("terminally rejects queued and in-flight calls and destroys the stream on close", async () => {
    const stream = new ControlledLoopback({ features: ["project-sessions.v1"], maximumInFlight: 1 });
    const transport = await NdjsonRpcTransport.connect(stream, initialize);
    const first = transport.call(FABRIC_OPERATIONS.projectSessionGet, getInput);
    const queued = transport.call(FABRIC_OPERATIONS.projectSessionGet, getInput);
    await new Promise((resolve) => setImmediate(resolve));

    await transport.close();

    await expect(first).rejects.toThrow(/closed|disconnected/iu);
    await expect(queued).rejects.toThrow(/closed|disconnected/iu);
    expect(stream.destroyed).toBe(true);
  });
});

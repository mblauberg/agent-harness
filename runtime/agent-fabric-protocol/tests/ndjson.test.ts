import { Duplex, PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  BoundedNdjsonReader,
  NdjsonRpcTransport,
  ProtocolTransportError,
} from "../src/index.js";

describe("bounded NDJSON framing", () => {
  it("rejects an oversized frame before a newline arrives", async () => {
    const input = new PassThrough();
    const onFrame = vi.fn();
    const errors: Error[] = [];
    const reader = new BoundedNdjsonReader(input, {
      maximumFrameBytes: 4,
      onFrame,
      onError: (error) => errors.push(error),
    });

    input.write(Buffer.from("12345"));
    await reader.closed;

    expect(onFrame).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "NDJSON_FRAME_TOO_LARGE" });
  });

  it("rejects malformed UTF-8 at the frame boundary", async () => {
    const input = new PassThrough();
    const errors: Error[] = [];
    const reader = new BoundedNdjsonReader(input, {
      maximumFrameBytes: 16,
      onFrame: () => undefined,
      onError: (error) => errors.push(error),
    });

    input.end(Buffer.from([0xc3, 0x28, 0x0a]));
    await reader.closed;

    expect(errors[0]).toMatchObject({ code: "NDJSON_INVALID_UTF8" });
  });
});

class ProtocolLoopback extends Duplex {
  readonly operations: string[] = [];
  #buffer = "";

  override _read(): void {}

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.#buffer += chunk.toString("utf8");
    let newline = this.#buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      const request: { id: string; operation: string; input: { authentication?: { clientNonce?: string } } } = JSON.parse(line);
      this.operations.push(request.operation);
      if (request.operation === "initialize") {
        this.push(`${JSON.stringify({
          id: request.id,
          operation: "initialize",
          ok: true,
          result: {
            protocolVersion: 1,
            daemonVersion: "0.2.0",
            daemonInstanceGeneration: 4,
            principal: {
              kind: "operator",
              operatorId: "operator_01",
              projectId: "project_01",
              projectAuthorityGeneration: 1,
              principalGeneration: 1,
            },
            clientNonce: request.input.authentication?.clientNonce,
            connectionNonce: "connection_01",
            features: ["project-sessions.v1"],
            allowedOperations: ["fabric.v1.project-session.create", "fabric.v1.project-session.read", "fabric.v1.project-session.transition", "fabric.v1.project-session.close"],
            limits: {
              maximumFrameBytes: 1048576,
              maximumPendingCalls: 32,
              maximumInFlightPerConnection: 16,
              idleTimeoutMs: 300000,
              requestTimeoutMs: 30000,
            },
          },
        })}\n`);
      }
      newline = this.#buffer.indexOf("\n");
    }
    callback();
  }
}

describe("negotiated NDJSON RPC transport", () => {
  it("handshakes before exposing negotiated features", async () => {
    const stream = new ProtocolLoopback();

    const transport = await NdjsonRpcTransport.connect(stream, {
      protocolVersion: 1,
      client: { name: "test", version: "1.0.0" },
      authentication: { scheme: "capability", credential: "operator-secret-0001", clientNonce: "client_01" },
      expectedPrincipalKind: "operator",
      requiredFeatures: ["project-sessions.v1"],
      optionalFeatures: ["intakes.v1"],
    });

    expect(transport.features).toStrictEqual(["project-sessions.v1"]);
    expect(stream.operations).toStrictEqual(["initialize"]);
    stream.destroy();
  });

  it("rejects an operation whose feature was not negotiated before writing", async () => {
    const stream = new ProtocolLoopback();
    const transport = await NdjsonRpcTransport.connect(stream, {
      protocolVersion: 1,
      client: { name: "test", version: "1.0.0" },
      authentication: { scheme: "capability", credential: "operator-secret-0001", clientNonce: "client_01" },
      expectedPrincipalKind: "operator",
      requiredFeatures: ["project-sessions.v1"],
      optionalFeatures: [],
    });

    await expect(transport.call("fabric.v1.intake.submit", {} as never)).rejects.toBeInstanceOf(ProtocolTransportError);
    expect(stream.operations).toStrictEqual(["initialize"]);
    stream.destroy();
  });
});

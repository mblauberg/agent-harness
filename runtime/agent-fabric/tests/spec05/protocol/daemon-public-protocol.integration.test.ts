import { createConnection, type Socket } from "node:net";
import { createInterface } from "node:readline";

import {
  FABRIC_OPERATIONS,
  NdjsonRpcTransport,
  type ProtocolInitializeRequest,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { createDaemonFixture } from "../../support/daemon-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

async function rawConnection(socketPath: string): Promise<{
  socket: Socket;
  nextResponse(): Promise<Record<string, unknown>>;
}> {
  const socket = createConnection(socketPath);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  const lines = createInterface({ input: socket, crlfDelay: Infinity });
  const responses: Array<(value: Record<string, unknown>) => void> = [];
  lines.on("line", (line) => responses.shift()?.(JSON.parse(line) as Record<string, unknown>));
  cleanup.unshift(async () => {
    lines.close();
    socket.destroy();
  });
  return {
    socket,
    async nextResponse() {
      return await new Promise<Record<string, unknown>>((resolve) => responses.push(resolve));
    },
  };
}

afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).map(async (close) => close()));
});

describe("daemon public protocol routing", () => {
  it("serves an authenticated chair getRunStatus call over the legacy daemon Unix socket", async () => {
    const fixture = await createDaemonFixture("run-public-protocol");
    cleanup.push(fixture.cleanup);
    const stream = createConnection(fixture.socketPath);
    const initialize: ProtocolInitializeRequest = {
      protocolVersion: 1,
      client: { name: "daemon-public-protocol-integration", version: "1.0.0" },
      authentication: {
        scheme: "capability",
        credential: fixture.run.chairCapability,
        clientNonce: "daemon_public_protocol_nonce_01",
      },
      expectedPrincipalKind: "agent",
      requiredFeatures: ["fabric-core.v1"],
      optionalFeatures: [],
    };

    const transport = await NdjsonRpcTransport.connect(stream, initialize);
    cleanup.unshift(async () => transport.close());

    expect(transport.principal).toMatchObject({
      kind: "agent",
      agentId: "chair",
      runId: fixture.run.runId,
    });
    expect(transport.features).toContain("fabric-core.v1");
    await expect(transport.call(FABRIC_OPERATIONS.getRunStatus, {
      runId: fixture.run.runId,
    })).resolves.toMatchObject({
      runId: fixture.run.runId,
      chairAgentId: "chair",
      barrier: { state: "open" },
    });
  });

  it("rejects a first frame that mixes public and legacy protocol fields", async () => {
    const fixture = await createDaemonFixture("run-ambiguous-protocol");
    cleanup.push(fixture.cleanup);
    const raw = await rawConnection(fixture.socketPath);
    const response = raw.nextResponse();
    raw.socket.write(`${JSON.stringify({
      id: "ambiguous_request",
      operation: "initialize",
      input: {},
      capability: fixture.run.chairCapability,
      method: "initialize",
      params: {},
    })}\n`);

    await expect(response).resolves.toMatchObject({
      id: "connection",
      error: { code: "DAEMON_PROTOCOL_AMBIGUOUS" },
    });
  });

  it("never authenticates the bootstrap discovery capability as a public principal", async () => {
    const fixture = await createDaemonFixture("run-bootstrap-not-principal");
    cleanup.push(fixture.cleanup);
    const stream = createConnection(fixture.socketPath);
    cleanup.unshift(async () => {
      stream.destroy();
    });

    await expect(NdjsonRpcTransport.connect(stream, {
      protocolVersion: 1,
      client: { name: "bootstrap-negative", version: "1.0.0" },
      authentication: {
        scheme: "capability",
        credential: fixture.daemon.bootstrapCapability,
        clientNonce: "bootstrap_negative_nonce_01",
      },
      expectedPrincipalKind: "agent",
      requiredFeatures: ["fabric-core.v1"],
      optionalFeatures: [],
    })).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
      message: "bootstrap discovery capability is not a public protocol principal",
    });
  });
});

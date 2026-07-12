import { Duplex } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  allowedOperationsForPrincipal,
  authorizeProtocolInitialize,
  createProtocolInitializeResult,
  NdjsonRpcTransport,
  operationsForFeatures,
  parseProtocolInitializeRequest,
  parseProtocolInitializeResult,
  PROTOCOL_FEATURES,
  PROTOCOL_SCHEMA,
  type ProtocolInitializeRequest,
} from "../src/index.js";

class InitializeLoopback extends Duplex {
  #buffer = "";

  override _read(): void {}

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.#buffer += chunk.toString("utf8");
    const newline = this.#buffer.indexOf("\n");
    if (newline >= 0) {
      const request = JSON.parse(this.#buffer.slice(0, newline)) as { id: string; operation: string };
      this.push(`${JSON.stringify({
        id: request.id,
        operation: request.operation,
        ok: true,
        result: {
          protocolVersion: 1,
          daemonVersion: "1.0.0",
          daemonInstanceGeneration: 1,
          features: ["fabric-core.v1"],
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
    callback();
  }
}

describe("authenticated initialize", () => {
  it("negotiates the notification result shape without granting an operation", () => {
    expect(PROTOCOL_FEATURES).toContain("native-notification-projection.v1");
    expect([...operationsForFeatures(["native-notification-projection.v1"])]).toStrictEqual([]);

    const result = createProtocolInitializeResult({
      request: {
        protocolVersion: 1,
        client: { name: "console", version: "1" },
        authentication: { scheme: "capability", credential: "operator-secret-0001", clientNonce: "client_01" },
        expectedPrincipalKind: "operator",
        requiredFeatures: ["operator-projection.v1"],
        optionalFeatures: ["native-notification-projection.v1"],
      },
      verifiedCredential: {
        principal: {
          kind: "operator",
          operatorId: "operator_01" as never,
          projectId: "project_01" as never,
          projectAuthorityGeneration: 1,
          principalGeneration: 1,
        },
        grantedOperations: [FABRIC_OPERATIONS.projectionSnapshot],
      },
      daemonVersion: "1.0.0",
      daemonInstanceGeneration: 1,
      offeredFeatures: ["operator-projection.v1", "native-notification-projection.v1"],
      limits: {
        maximumFrameBytes: 1048576,
        maximumPendingCalls: 32,
        maximumInFlightPerConnection: 16,
        idleTimeoutMs: 300000,
        requestTimeoutMs: 30000,
      },
      connectionNonce: "connection_01",
    });

    expect(result.features).toStrictEqual([
      "operator-projection.v1",
      "native-notification-projection.v1",
    ]);
    expect(result.allowedOperations).toStrictEqual([FABRIC_OPERATIONS.projectionSnapshot]);
  });

  it("ignores a well-formed unknown optional feature and reports an unknown required feature unavailable", () => {
    const base = {
      protocolVersion: 1,
      client: { name: "future-console", version: "1" },
      authentication: { scheme: "capability", credential: "operator-secret-0001", clientNonce: "client_01" },
      expectedPrincipalKind: "operator",
      requiredFeatures: ["operator-projection.v1"],
      optionalFeatures: ["future-result-shape.v7"],
    } as const;
    const parsed = parseProtocolInitializeRequest(base);
    expect(parsed.optionalFeatures).toStrictEqual(["future-result-shape.v7"]);

    const result = createProtocolInitializeResult({
      request: parsed,
      verifiedCredential: {
        principal: {
          kind: "operator",
          operatorId: "operator_01" as never,
          projectId: "project_01" as never,
          projectAuthorityGeneration: 1,
          principalGeneration: 1,
        },
        grantedOperations: [FABRIC_OPERATIONS.projectionSnapshot],
      },
      daemonVersion: "1.0.0",
      daemonInstanceGeneration: 1,
      offeredFeatures: ["operator-projection.v1"],
      limits: {
        maximumFrameBytes: 1048576,
        maximumPendingCalls: 32,
        maximumInFlightPerConnection: 16,
        idleTimeoutMs: 300000,
        requestTimeoutMs: 30000,
      },
      connectionNonce: "connection_01",
    });
    expect(result.features).toStrictEqual(["operator-projection.v1"]);

    const required = parseProtocolInitializeRequest({
      ...base,
      requiredFeatures: ["operator-projection.v1", "future-required.v3"],
      optionalFeatures: [],
    });
    expect(() => createProtocolInitializeResult({
      request: required,
      verifiedCredential: {
        principal: result.principal,
        grantedOperations: [FABRIC_OPERATIONS.projectionSnapshot],
      },
      daemonVersion: "1.0.0",
      daemonInstanceGeneration: 1,
      offeredFeatures: ["operator-projection.v1"],
      limits: result.limits,
      connectionNonce: "connection_02",
    })).toThrow(expect.objectContaining({ code: "FEATURE_UNAVAILABLE" }));
  });

  it("rejects malformed, oversized and duplicate feature lists before classification", () => {
    const request = {
      protocolVersion: 1,
      client: { name: "console", version: "1" },
      authentication: { scheme: "capability", credential: "operator-secret-0001", clientNonce: "client_01" },
      expectedPrincipalKind: "operator",
      requiredFeatures: ["operator-projection.v1"],
      optionalFeatures: [],
    } as const;
    for (const feature of [
      "Operator-projection.v1",
      "operator_projection.v1",
      "operator-projection.v0",
      "operator-projection.١v1",
      `${"a".repeat(62)}.v1`,
    ]) {
      expect(() => parseProtocolInitializeRequest({
        ...request,
        optionalFeatures: [feature],
      })).toThrow(/feature/iu);
    }
    expect(() => parseProtocolInitializeRequest({
      ...request,
      requiredFeatures: ["operator-projection.v1", "operator-projection.v1"],
    })).toThrow(/duplicate/iu);
    expect(() => parseProtocolInitializeRequest({
      ...request,
      optionalFeatures: ["operator-projection.v1"],
    })).toThrow(/duplicate/iu);
    expect(() => parseProtocolInitializeRequest({
      ...request,
      requiredFeatures: Array.from({ length: 64 }, (_, index) => `required-${String(index)}.v1`),
      optionalFeatures: Array.from({ length: 64 }, (_, index) => `optional-${String(index)}.v1`),
    })).toThrow(/64/iu);
    expect(() => parseProtocolInitializeRequest({
      ...request,
      requiredFeatures: Array.from({ length: 65 }, (_, index) => `feature-${String(index)}.v1`),
    })).toThrow(/64/iu);
  });

  it("never grants the launch-only attestation operation to a standalone protocol connection", () => {
    const request = {
      protocolVersion: 1,
      client: { name: "standalone-agent", version: "1" },
      authentication: { scheme: "capability", credential: "agent-secret-000001", clientNonce: "client_01" },
      expectedPrincipalKind: "agent",
      requiredFeatures: ["fabric-core.v1"],
      optionalFeatures: ["launch-attestation.v1"],
    } as const satisfies ProtocolInitializeRequest;
    const principal = {
      kind: "agent" as const,
      agentId: "agent_01" as never,
      projectSessionId: "ps_01" as never,
      runId: "run_01",
      principalGeneration: 1,
    };

    expect(authorizeProtocolInitialize(request, {
      principal,
      grantedOperations: [FABRIC_OPERATIONS.getMailboxState, FABRIC_OPERATIONS.launchAttest],
    }).allowedOperations).toStrictEqual([FABRIC_OPERATIONS.getMailboxState]);
    expect(allowedOperationsForPrincipal(principal, ["launch-attestation.v1"]))
      .not.toContain(FABRIC_OPERATIONS.launchAttest);
  });

  it("enforces the same credential bounds in the runtime parser and published schema", () => {
    expect(() => parseProtocolInitializeRequest({
      protocolVersion: 1,
      client: { name: "console", version: "1" },
      authentication: { scheme: "capability", credential: "short", clientNonce: "client_01" },
      expectedPrincipalKind: "operator",
      requiredFeatures: [],
      optionalFeatures: [],
    })).toThrowError(/credential.*16-4096/iu);
  });

  it("rejects a caller-self-asserted principal without credential authentication", async () => {
    const stream = new InitializeLoopback();
    const unauthenticated = {
      protocolVersion: 1,
      client: { name: "spoof", version: "1" },
      principal: {
        kind: "integration",
        integrationId: "integration_spoof",
        projectId: "project_other",
        principalGeneration: 999,
      },
      requiredFeatures: ["fabric-core.v1"],
      optionalFeatures: [],
    } as unknown as ProtocolInitializeRequest;

    await expect(NdjsonRpcTransport.connect(stream, unauthenticated)).rejects.toThrow(/principal|authentication|credential/iu);
    stream.destroy();
  });

  it("derives identity from the verified credential and rejects a cross-principal expectation", () => {
    const request = {
      protocolVersion: 1,
      client: { name: "console", version: "1" },
      authentication: { scheme: "capability", credential: "operator-secret-0001", clientNonce: "client_01" },
      expectedPrincipalKind: "operator",
      requiredFeatures: ["operator-projection.v1"],
      optionalFeatures: [],
    } as const satisfies ProtocolInitializeRequest;

    expect(() => authorizeProtocolInitialize(request, {
      principal: {
        kind: "integration",
        integrationId: "integration_01" as never,
        projectId: "project_01" as never,
        principalGeneration: 1,
      },
      grantedOperations: ["fabric.v1.integration.input-attest"],
    })).toThrow(/credential resolved to integration/);
  });

  it("rejects a server grant outside both negotiated features and the derived principal", () => {
    const result = createProtocolInitializeResult({
      request: {
        protocolVersion: 1,
        client: { name: "console", version: "1" },
        authentication: { scheme: "capability", credential: "operator-secret-0001", clientNonce: "client_01" },
        expectedPrincipalKind: "operator",
        requiredFeatures: ["operator-projection.v1"],
        optionalFeatures: [],
      },
      verifiedCredential: {
        principal: {
          kind: "operator",
          operatorId: "operator_01" as never,
          projectId: "project_01" as never,
          projectAuthorityGeneration: 1,
          principalGeneration: 1,
        },
        grantedOperations: [
          "fabric.v1.project.discover",
          "fabric.v1.operator-projection.snapshot",
          "fabric.v1.operator-projection.page",
          "fabric.v1.operator-projection.events",
        ],
      },
      daemonVersion: "1.0.0",
      daemonInstanceGeneration: 1,
      offeredFeatures: ["operator-projection.v1"],
      limits: {
        maximumFrameBytes: 1048576,
        maximumPendingCalls: 32,
        maximumInFlightPerConnection: 16,
        idleTimeoutMs: 300000,
        requestTimeoutMs: 30000,
      },
      connectionNonce: "connection_01",
    });
    expect(result.allowedOperations).toStrictEqual(allowedOperationsForPrincipal(result.principal, result.features));

    expect(() => parseProtocolInitializeResult({
      ...result,
      allowedOperations: ["fabric.v1.integration.input-attest"],
    })).toThrow(/outside the bound principal/);
  });

  it("publishes initialize as the actual correlated NDJSON request/success/error envelopes", () => {
    const variants = [
      PROTOCOL_SCHEMA.$defs.initializeRequest,
      PROTOCOL_SCHEMA.$defs.initializeSuccess,
      PROTOCOL_SCHEMA.$defs.initializeFailure,
    ];
    expect(JSON.stringify(variants)).toContain('"operation":{"const":"initialize"}');
    expect(JSON.stringify(variants)).toContain('"ok":{"const":true}');
    expect(JSON.stringify(variants)).toContain('"ok":{"const":false}');
  });
});

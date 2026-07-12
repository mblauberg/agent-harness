import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Duplex } from "node:stream";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";

import * as protocol from "../src/index.js";
import {
  FABRIC_OPERATIONS,
  NdjsonRpcTransport,
  OPERATION_CONTRACT_FIXTURES,
  ProtocolValidationError,
  createProtocolInitializeResult,
  parseCanonicalRelativePath,
  parseJsonValue,
  parseOperationInput,
  parseOperationResult,
  protocolRequestSchemaFor,
  protocolResponseSchemasFor,
  type ProtocolInitializeRequest,
} from "../src/index.js";

const addFormats = createRequire(import.meta.url)("ajv-formats") as FormatsPlugin;
const limits = {
  maximumFrameBytes: 1_048_576,
  maximumPendingCalls: 32,
  maximumInFlightPerConnection: 16,
  idleTimeoutMs: 300_000,
  requestTimeoutMs: 30_000,
} as const;
const operatorPrincipal = {
  kind: "operator",
  operatorId: "operator_01" as never,
  projectId: "project_01" as never,
  projectAuthorityGeneration: 1,
  principalGeneration: 1,
} as const;
const projectionRequest = {
  protocolVersion: 1,
  client: { name: "console", version: "1" },
  authentication: { scheme: "capability", credential: "operator-secret-0001", clientNonce: "client_01" },
  expectedPrincipalKind: "operator",
  requiredFeatures: ["operator-projection.v1"],
  optionalFeatures: [],
} as const satisfies ProtocolInitializeRequest;

function createResultWithGrant(
  request: ProtocolInitializeRequest,
  grantedOperations: readonly protocol.FabricOperation[],
) {
  return createProtocolInitializeResult({
    request,
    verifiedCredential: { principal: operatorPrincipal, grantedOperations },
    daemonVersion: "1.0.0",
    daemonInstanceGeneration: 1,
    offeredFeatures: protocol.PROTOCOL_FEATURES,
    limits,
    connectionNonce: "connection_01",
  });
}

class GrantLoopback extends Duplex {
  #buffer = "";

  override _read(): void {}

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.#buffer += chunk.toString("utf8");
    const newline = this.#buffer.indexOf("\n");
    if (newline >= 0) {
      const request = JSON.parse(this.#buffer.slice(0, newline)) as {
        id: string;
        operation: string;
        input: { authentication: { clientNonce: string } };
      };
      this.push(`${JSON.stringify({
        id: request.id,
        operation: request.operation,
        ok: true,
        result: {
          protocolVersion: 1,
          daemonVersion: "1.0.0",
          daemonInstanceGeneration: 1,
          principal: operatorPrincipal,
          clientNonce: request.input.authentication.clientNonce,
          connectionNonce: "connection_01",
          features: ["operator-projection.v1", "project-sessions.v1"],
          allowedOperations: [FABRIC_OPERATIONS.projectDiscover, FABRIC_OPERATIONS.projectSessionCreate],
          limits,
        },
      })}\n`);
    }
    callback();
  }
}

describe("credential-derived initialization grants", () => {
  it("intersects a read-only credential grant with requested features and principal legality", () => {
    const result = createResultWithGrant(projectionRequest, [
      FABRIC_OPERATIONS.projectDiscover,
      FABRIC_OPERATIONS.projectSessionCreate,
      FABRIC_OPERATIONS.integrationInputAttest,
    ]);
    expect(result.allowedOperations).toStrictEqual([FABRIC_OPERATIONS.projectDiscover]);
  });

  it("does not widen a launch-only credential to every project-session operation", () => {
    const result = createResultWithGrant({
      ...projectionRequest,
      requiredFeatures: ["project-sessions.v1"],
    }, [FABRIC_OPERATIONS.projectSessionCreate]);
    expect(result.allowedOperations).toStrictEqual([FABRIC_OPERATIONS.projectSessionCreate]);
  });

  it("rejects a server operation grant outside the client's final requested feature set", async () => {
    const stream = new GrantLoopback();
    await expect(NdjsonRpcTransport.connect(stream, projectionRequest)).rejects.toThrow(/allowed operation|negotiated feature/iu);
    stream.destroy();
  });
});

const chairCommand = {
  commandId: "command_chair_01",
  agentId: "agent_chair_01",
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  principalGeneration: 1,
  chairLeaseId: "lease_chair_01",
  chairLeaseGeneration: 1,
  expectedRunRevision: 1,
  expectedRevision: 1,
} as const;

function principalParse(principal: "agent" | "operator", operation: string, value: unknown): unknown {
  const parser: unknown = Reflect.get(protocol, "parseOperationInputForPrincipal");
  if (typeof parser !== "function") throw new TypeError("parseOperationInputForPrincipal is required");
  return Reflect.apply(parser, undefined, [operation, principal, value]);
}

describe("principal-discriminated chair commands", () => {
  it.each([
    FABRIC_OPERATIONS.membershipBind,
    FABRIC_OPERATIONS.scopedGateCreate,
  ] as const)("accepts a chair command for the agent-owned %s operation", (operation) => {
    const fixture = OPERATION_CONTRACT_FIXTURES[operation];
    principalParse("agent", operation, {
      ...(fixture.input as Record<string, unknown>),
      ...(operation === FABRIC_OPERATIONS.membershipBind
        ? { projectSessionId: "ps_01", coordinationRunId: "run_01" }
        : {}),
      origin: "chair",
      command: chairCommand,
    });
  });

  it("accepts a correlated chair intake revision and rejects cross-intake bindings", () => {
    const revise = OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.intakeRevise].input as Record<string, unknown>;
    const submit = OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.intakeSubmit].input as {
      chairRequest: Record<string, unknown> & { request: Record<string, unknown> & { intakeBinding: Record<string, unknown> } };
    };
    const matchingRequest = {
      ...submit.chairRequest,
      request: {
        ...submit.chairRequest.request,
        intakeBinding: {
          ...submit.chairRequest.request.intakeBinding,
          intakeRevision: 2,
        },
      },
    };
    principalParse("agent", FABRIC_OPERATIONS.intakeRevise, {
      ...revise,
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      origin: "chair",
      command: chairCommand,
      chairRequest: matchingRequest,
    });
    expect(() => principalParse("agent", FABRIC_OPERATIONS.intakeRevise, {
      ...revise,
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      origin: "chair",
      command: chairCommand,
      chairRequest: {
        ...matchingRequest,
        request: {
          ...matchingRequest.request,
          intakeBinding: { ...matchingRequest.request.intakeBinding, intakeId: "intake_other" },
        },
      },
    })).toThrowError(/intake.*does not match/iu);
  });

  it("rejects operator-command impersonation on an agent connection", () => {
    const fixture = OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.scopedGateCreate];
    expect(() => principalParse("agent", FABRIC_OPERATIONS.scopedGateCreate, {
      ...(fixture.input as Record<string, unknown>),
      origin: "operator",
    })).toThrowError(/agent.*operator|operator.*agent/iu);
  });
});

const tempRoots: string[] = [];
afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function reserveWithWriter(repositoryRoot: string, worktreePath: string): unknown {
  const fixture = OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.resourceReserve].input as Record<string, unknown>;
  return {
    ...fixture,
    writerAdmission: {
      repositoryRoot,
      worktreePath,
      sourcePrefixes: ["src"],
      writerGeneration: 1,
    },
  };
}

describe("canonical writer admission", () => {
  it("rejects a relative repository root", () => {
    expect(() => parseOperationInput(
      FABRIC_OPERATIONS.resourceReserve,
      reserveWithWriter("..", join("..", ".worktrees", "task-agent")),
    )).toThrowError(/repositoryRoot.*(?:absolute|format)/iu);
  });

  it("accepts exactly one direct worktree child and rejects nested children", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "protocol-writer-")));
    tempRoots.push(root);
    mkdirSync(join(root, ".worktrees"));
    expect(() => parseOperationInput(
      FABRIC_OPERATIONS.resourceReserve,
      reserveWithWriter(root, join(root, ".worktrees", "task-agent")),
    )).not.toThrow();
    expect(() => parseOperationInput(
      FABRIC_OPERATIONS.resourceReserve,
      reserveWithWriter(root, join(root, ".worktrees", "team", "task-agent")),
    )).toThrowError(/direct child/iu);
  });

  it("rejects a direct-child symlink escape", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "protocol-writer-")));
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "protocol-outside-")));
    tempRoots.push(root, outside);
    mkdirSync(join(root, ".worktrees"));
    symlinkSync(outside, join(root, ".worktrees", "task-agent"));
    expect(() => parseOperationInput(
      FABRIC_OPERATIONS.resourceReserve,
      reserveWithWriter(root, join(root, ".worktrees", "task-agent")),
    )).toThrowError(/symlink|escape/iu);
  });
});

describe("projection codec discrimination", () => {
  it("requires snapshot schemaVersion to be literal 1", () => {
    const fixture = OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.projectionSnapshot];
    expect(() => parseOperationResult(FABRIC_OPERATIONS.projectionSnapshot, {
      ...(fixture.result as Record<string, unknown>),
      schemaVersion: 2,
    })).toThrowError(/schemaVersion/iu);
  });

  it("rejects attention rows in a work-view result in runtime and schema", () => {
    const operation = FABRIC_OPERATIONS.projectionPage;
    const result = {
      view: "work",
      page: {
        freshness: "live",
        source: "fabric",
        revision: 1,
        observedAt: "2026-07-11T10:00:00Z",
        value: {
          items: [{
            itemId: "attention_01",
            revision: 1,
            label: "Decision",
            priority: "critical-path",
            title: "Choose",
            sourceFreshness: "live",
            lastEventAt: "2026-07-11T10:00:00Z",
            duplicateCount: 0,
          }],
          nextCursor: 1,
          hasMore: false,
        },
      },
    };
    expect(() => parseOperationResult(operation, result)).toThrow();
    const schema = protocolResponseSchemasFor(operation)[0];
    if (schema === undefined) throw new Error("missing projection success schema");
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    expect(ajv.compile(schema)({ id: "request_01", operation, ok: true, result })).toBe(false);
  });
});

describe("bounded JSON and path parity", () => {
  it.each([
    ["traversal source path", { sourcePaths: ["../escape"] }],
    ["brace-glob artifact path", { artifactPaths: ["artifacts/{one,two}"] }],
    ["obsolete authority action", { actions: ["fabric.v1.task.human-gate.resolve"] }],
    ["unknown authority action", { actions: ["fabric.v1.unknown.operation"] }],
    ["obsolete direct lifecycle action", { actions: ["fabric.v1.daemon.stop"] }],
    ["unqualified budget unit", { budget: { tokens: 10 } }],
    ["unrecognised ISO-4217 currency", { budget: { "cost:ZZZ": 10 } }],
  ] as const)("rejects %s in delegated authority at runtime and schema", (_label, mutation) => {
    const operation = FABRIC_OPERATIONS.delegateAuthority;
    const fixture = OPERATION_CONTRACT_FIXTURES[operation];
    const input = fixture.input as Record<string, unknown> & { authority: Record<string, unknown> };
    const candidate = { ...input, authority: { ...input.authority, ...mutation } };
    expect(() => parseOperationInput(operation, candidate)).toThrow();
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    expect(ajv.compile(protocolRequestSchemaFor(operation))({ id: "request_01", operation, input: candidate })).toBe(false);
  });

  it("rejects deeply nested JSON with a typed validation error instead of RangeError", () => {
    let nested: unknown = null;
    for (let index = 0; index < 5_000; index += 1) nested = [nested];
    let thrown: unknown;
    try {
      parseJsonValue(nested, "payload");
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ProtocolValidationError);
    expect(thrown).not.toBeInstanceOf(RangeError);
    expect(String(thrown)).toMatch(/maximum.*depth/iu);
  });

  it("publishes and enforces JSON array limits", () => {
    const operation = FABRIC_OPERATIONS.operatorCommand;
    const fixture = OPERATION_CONTRACT_FIXTURES[operation];
    const input = { ...(fixture.input as Record<string, unknown>), payload: new Array(257).fill(null) };
    expect(() => parseOperationInput(operation, input)).toThrowError(/array.*256/iu);
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    expect(ajv.compile(protocolRequestSchemaFor(operation))({ id: "request_01", operation, input })).toBe(false);
  });

  it("rejects brace glob constructs at both runtime and schema boundaries", () => {
    expect(() => parseCanonicalRelativePath("src/{one,two}.ts", "path")).toThrowError(/canonical/iu);
  });

  it("enforces explicit UTF-8-byte schema keywords for multibyte strings", () => {
    const installKeywords: unknown = Reflect.get(protocol, "addProtocolSchemaKeywords");
    expect(installKeywords).toBeTypeOf("function");
    const operation = FABRIC_OPERATIONS.sendMessage;
    const fixture = OPERATION_CONTRACT_FIXTURES[operation];
    const input = { ...(fixture.input as Record<string, unknown>), body: "😀".repeat(4_096) };
    expect(() => parseOperationInput(operation, input)).toThrowError(/4096 UTF-8 bytes/iu);
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    Reflect.apply(installKeywords as (...args: unknown[]) => unknown, undefined, [ajv]);
    expect(ajv.compile(protocolRequestSchemaFor(operation))({ id: "request_01", operation, input })).toBe(false);
  });
});

import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  NdjsonRpcTransport,
  PROVIDER_ACTION_TERMINAL_PROJECTION_V1_CODEC,
  addProtocolSchemaKeywords,
  parseOperationInput,
  parseOperationResult,
  parseOperationResultForInput,
  protocolRequestSchemaFor,
  protocolResponseSchemasFor,
} from "../src/index.js";

type WireRequest = { id: string; operation: string; input: unknown };

class ProviderLoopback extends Duplex {
  readonly requests: WireRequest[] = [];
  #buffer = "";

  override _read(): void {}

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.#buffer += chunk.toString("utf8");
    let newline = this.#buffer.indexOf("\n");
    while (newline >= 0) {
      const request = JSON.parse(this.#buffer.slice(0, newline)) as WireRequest;
      this.#buffer = this.#buffer.slice(newline + 1);
      this.requests.push(request);
      if (request.operation === "initialize") {
        const input = request.input as { authentication: { clientNonce: string } };
        this.respond(request, {
          protocolVersion: 1,
          daemonVersion: "1.0.0",
          daemonInstanceGeneration: 1,
          principal: {
            kind: "agent",
            agentId: "agent_01",
            projectSessionId: "ps_01",
            runId: "run_01",
            principalGeneration: 1,
          },
          clientNonce: input.authentication.clientNonce,
          connectionNonce: "connection_01",
          features: ["fabric-core.v1"],
          allowedOperations: [
            FABRIC_OPERATIONS.dispatchProviderAction,
            FABRIC_OPERATIONS.getProviderAction,
            FABRIC_OPERATIONS.reconcileProviderAction,
          ],
          limits: {
            maximumFrameBytes: 1_048_576,
            maximumPendingCalls: 8,
            maximumInFlightPerConnection: 8,
            idleTimeoutMs: 300_000,
            requestTimeoutMs: 30_000,
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
}

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function routeRequest() {
  return {
    schemaVersion: 1,
    adapterAlias: "cursor",
    modelAlias: "grok",
    explicitModel: "grok-4.5-xhigh",
    role: "reviewer",
    leadFamily: "openai",
    requireDistinct: true,
    providerEffort: "xhigh",
  } as const;
}

describe("Spec 05 provider action operation wire", () => {
  it("admits only task/route-bound certifying review spawns", () => {
    const input = {
      adapterId: "cursor-agent",
      actionId: "review_01",
      operation: "spawn",
      taskId: "task_review_01",
      authorityId: "authority_review_01",
      routeRequest: routeRequest(),
      certifyingReview: {
        targetGeneration: 1,
        slot: "cursor-grok",
        expectedSlotHeadGeneration: 0,
        expectedChairBindingGeneration: 1,
        expectedOpenFindingSetDigest: digest,
        findingWindowMode: "normal",
        findingCapacityReservationDigest: digest,
      },
      payload: { prompt: "Review through the bound portal." },
      commandId: "command_review_01",
    } as const;
    expect(parseOperationInput(FABRIC_OPERATIONS.dispatchProviderAction, input)).toStrictEqual(input);
    for (const missing of ["taskId", "routeRequest", "certifyingReview"] as const) {
      const candidate = { ...input } as Record<string, unknown>;
      delete candidate[missing];
      expect(() => parseOperationInput(FABRIC_OPERATIONS.dispatchProviderAction, candidate)).toThrow();
    }
    expect(() => parseOperationInput(FABRIC_OPERATIONS.dispatchProviderAction, {
      ...input,
      operation: "send_turn",
    })).toThrow(/certifyingReview|spawn|operation/);

    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addProtocolSchemaKeywords(ajv);
    const request = { id: "request_01", operation: FABRIC_OPERATIONS.dispatchProviderAction, input };
    expect(ajv.compile(protocolRequestSchemaFor(FABRIC_OPERATIONS.dispatchProviderAction))(request)).toBe(true);
  });

  it("keeps raw answers exclusive to the non-review result arm", () => {
    const review = {
      kind: "certifying-review",
      action: PROVIDER_ACTION_TERMINAL_PROJECTION_V1_CODEC.example,
    } as const;
    expect(parseOperationResult(FABRIC_OPERATIONS.getProviderAction, review)).toStrictEqual(review);
    expect(() => parseOperationResult(FABRIC_OPERATIONS.getProviderAction, {
      ...review,
      providerAnswer: "private review answer",
    })).toThrow(/providerAnswer|unknown field/);

    const nonReview = {
      kind: "non-review",
      actionRef: { adapterId: "agy", actionId: "answer_01" },
      status: "terminal",
      history: ["prepared", "terminal"],
      executionCount: 1,
      effectCount: 1,
      resultDigest: digest,
      providerAnswer: "bounded ordinary answer",
    } as const;
    expect(parseOperationResult(FABRIC_OPERATIONS.getProviderAction, nonReview)).toStrictEqual(nonReview);

    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addProtocolSchemaKeywords(ajv);
    const schemas = protocolResponseSchemasFor(FABRIC_OPERATIONS.getProviderAction);
    expect(schemas.some((schema) => ajv.compile(schema)({
      id: "request_01",
      operation: FABRIC_OPERATIONS.getProviderAction,
      result: review,
      ok: true,
    }))).toBe(true);
  });

  it("represents ordinary terminal actions without synthesizing an answer or result digest", () => {
    const ordinaryTerminal = {
      kind: "non-review",
      actionRef: { adapterId: "agy", actionId: "release_01" },
      status: "terminal",
      history: ["terminal"],
      executionCount: 1,
      effectCount: 1,
    } as const;

    expect(parseOperationResult(FABRIC_OPERATIONS.getProviderAction, ordinaryTerminal)).toStrictEqual(ordinaryTerminal);
    expect(parseOperationResult(FABRIC_OPERATIONS.getProviderAction, {
      ...ordinaryTerminal,
      resultDigest: digest,
    })).toMatchObject({ resultDigest: digest });
    expect(() => parseOperationResult(FABRIC_OPERATIONS.getProviderAction, {
      ...ordinaryTerminal,
      providerAnswer: "unbound answer",
    })).toThrow(/providerAnswer|resultDigest|allowed variant/);
    expect(() => parseOperationResult(FABRIC_OPERATIONS.getProviderAction, {
      ...ordinaryTerminal,
      resultDigest: digest,
      providerAnswer: "",
    })).toThrow(/providerAnswer|UTF-8 byte|allowed variant/);

    const releaseInput = {
      adapterId: ordinaryTerminal.actionRef.adapterId,
      actionId: ordinaryTerminal.actionRef.actionId,
      operation: "release",
      certifyingReview: null,
      payload: {},
      commandId: "command_release_01",
    } as const;
    expect(() => parseOperationResultForInput(FABRIC_OPERATIONS.dispatchProviderAction, releaseInput, {
      ...ordinaryTerminal,
      resultDigest: digest,
      providerAnswer: "must not escape from release",
    })).toThrow(/task-bound non-review spawn|providerAnswer/);

    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addProtocolSchemaKeywords(ajv);
    const schemas = protocolResponseSchemasFor(FABRIC_OPERATIONS.getProviderAction);
    expect(schemas.some((schema) => ajv.compile(schema)({
      id: "request_ordinary_terminal",
      operation: FABRIC_OPERATIONS.getProviderAction,
      ok: true,
      result: ordinaryTerminal,
    }))).toBe(true);
    expect(schemas.some((schema) => ajv.compile(schema)({
      id: "request_empty_answer",
      operation: FABRIC_OPERATIONS.getProviderAction,
      ok: true,
      result: { ...ordinaryTerminal, resultDigest: digest, providerAnswer: "" },
    }))).toBe(false);
  });

  it("correlates provider result kind and action identity to the exact dispatch", () => {
    const certifyingInput = {
      adapterId: "cursor-agent",
      actionId: "review_01",
      operation: "spawn",
      taskId: "task_review_01",
      authorityId: "authority_review_01",
      routeRequest: routeRequest(),
      certifyingReview: {
        targetGeneration: 1,
        slot: "cursor-grok",
        expectedSlotHeadGeneration: 0,
        expectedChairBindingGeneration: 1,
        expectedOpenFindingSetDigest: digest,
        findingWindowMode: "normal",
        findingCapacityReservationDigest: digest,
      },
      payload: { prompt: "Review." },
      commandId: "command_review_01",
    } as const;
    const rawResult = {
      kind: "non-review",
      actionRef: { adapterId: certifyingInput.adapterId, actionId: certifyingInput.actionId },
      status: "terminal",
      history: ["terminal"],
      executionCount: 1,
      effectCount: 1,
      resultDigest: digest,
      providerAnswer: "must never cross a certifying review response",
    } as const;
    expect(() => parseOperationResultForInput(
      FABRIC_OPERATIONS.dispatchProviderAction,
      certifyingInput,
      rawResult,
    )).toThrow(/certifying|result kind|non-review|providerAnswer/);

    const crossedReview = {
      kind: "certifying-review",
      action: {
        ...PROVIDER_ACTION_TERMINAL_PROJECTION_V1_CODEC.example,
        actionRef: { adapterId: "cursor-agent", actionId: "crossed" },
      },
    } as const;
    expect(() => parseOperationResultForInput(
      FABRIC_OPERATIONS.dispatchProviderAction,
      certifyingInput,
      crossedReview,
    )).toThrow(/actionRef|action identity/);
  });

  it("binds provider reads to durable classification on a fresh transport", async () => {
    const stream = new ProviderLoopback();
    const transport = await NdjsonRpcTransport.connect(stream, {
      protocolVersion: 1,
      client: { name: "test", version: "1.0.0" },
      authentication: { scheme: "capability", credential: "agent-secret-0001", clientNonce: "client_01" },
      expectedPrincipalKind: "agent",
      requiredFeatures: ["fabric-core.v1"],
      optionalFeatures: [],
    });
    const actionRef = {
      adapterId: "cursor-agent",
      actionId: "review_01",
    } as const;
    const requestValidator = new Ajv2020({ strict: false, allErrors: true });
    addProtocolSchemaKeywords(requestValidator);
    const validateRead = requestValidator.compile(protocolRequestSchemaFor(FABRIC_OPERATIONS.getProviderAction));
    expect(validateRead({ id: "read_missing_kind", operation: FABRIC_OPERATIONS.getProviderAction, input: actionRef })).toBe(false);
    expect(validateRead({
      id: "read_certifying",
      operation: FABRIC_OPERATIONS.getProviderAction,
      input: { ...actionRef, expectedActionKind: "certifying-review" },
    })).toBe(true);
    const read = transport.call(FABRIC_OPERATIONS.getProviderAction, {
      ...actionRef,
      expectedActionKind: "certifying-review",
    });
    await new Promise((resolve) => setImmediate(resolve));
    const readRequest = stream.requests.at(-1);
    if (readRequest === undefined) throw new Error("missing provider read request");
    stream.respond(readRequest, {
      kind: "non-review",
      actionRef,
      status: "terminal",
      history: ["terminal"],
      executionCount: 1,
      effectCount: 1,
      resultDigest: digest,
      providerAnswer: "must not escape through a fresh read",
    });
    await expect(read).rejects.toMatchObject({ code: "PROTOCOL_RESULT_INVALID" });
    stream.destroy();
  });
});
import { Duplex } from "node:stream";

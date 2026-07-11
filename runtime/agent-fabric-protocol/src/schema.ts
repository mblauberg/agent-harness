import { PROTOCOL_FEATURES } from "./features.js";
import { OPERATION_CODECS } from "./operation-codecs.js";
import { OPERATION_REGISTRY } from "./operations.js";
import type { JsonValue } from "./primitives.js";
import { PROTOCOL_ERROR_CODES, PROTOCOL_LIMITS, type ProtocolOperation } from "./rpc-contract.js";

type JsonSchema = Readonly<Record<string, JsonValue>>;

const idSchema = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$" } as const;
const timestampSchema = { type: "string", format: "date-time" } as const;
const digestSchema = { type: "string", pattern: "^sha256:[a-f0-9]{64}$" } as const;
const operations = Object.keys(OPERATION_REGISTRY) as ProtocolOperation[];
const activeOperations = operations.filter((operation) => OPERATION_REGISTRY[operation].kind !== "retired");

const principalSchemas = {
  operator: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "operatorId", "projectId", "principalGeneration"],
    properties: {
      kind: { const: "operator" },
      operatorId: idSchema,
      projectId: idSchema,
      principalGeneration: { type: "integer", minimum: 1 },
    },
  },
  agent: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "agentId", "projectSessionId", "runId", "principalGeneration"],
    properties: {
      kind: { const: "agent" },
      agentId: idSchema,
      projectSessionId: idSchema,
      runId: idSchema,
      principalGeneration: { type: "integer", minimum: 1 },
    },
  },
  integration: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "integrationId", "projectId", "principalGeneration"],
    properties: {
      kind: { const: "integration" },
      integrationId: idSchema,
      projectId: idSchema,
      principalGeneration: { type: "integer", minimum: 1 },
    },
  },
} as const;

const protocolFailureSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "message", "retryable"],
  properties: {
    code: { type: "string", enum: PROTOCOL_ERROR_CODES },
    message: { type: "string", minLength: 1, maxLength: 4096 },
    retryable: { type: "boolean" },
    details: { type: ["object", "array", "string", "number", "boolean", "null"] },
  },
} as const;

const limitsSchema = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(PROTOCOL_LIMITS),
  properties: {
    maximumFrameBytes: { type: "integer", minimum: 1, maximum: PROTOCOL_LIMITS.maximumFrameBytes },
    maximumPendingCalls: { type: "integer", minimum: 1, maximum: PROTOCOL_LIMITS.maximumPendingCalls },
    maximumInFlightPerConnection: { type: "integer", minimum: 1, maximum: PROTOCOL_LIMITS.maximumInFlightPerConnection },
    idleTimeoutMs: { type: "integer", minimum: 1, maximum: PROTOCOL_LIMITS.idleTimeoutMs },
    requestTimeoutMs: { type: "integer", minimum: 1, maximum: PROTOCOL_LIMITS.requestTimeoutMs },
  },
} as const;

const initializeInputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "protocolVersion",
    "client",
    "authentication",
    "expectedPrincipalKind",
    "requiredFeatures",
    "optionalFeatures",
  ],
  properties: {
    protocolVersion: { const: 1 },
    client: {
      type: "object",
      additionalProperties: false,
      required: ["name", "version"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 128 },
        version: { type: "string", minLength: 1, maxLength: 128 },
      },
    },
    authentication: {
      type: "object",
      additionalProperties: false,
      required: ["scheme", "credential", "clientNonce"],
      properties: {
        scheme: { const: "capability" },
        credential: { type: "string", minLength: 16, maxLength: 4096 },
        clientNonce: idSchema,
      },
    },
    expectedPrincipalKind: { enum: ["operator", "agent", "integration"] },
    requiredFeatures: { type: "array", maxItems: PROTOCOL_FEATURES.length, uniqueItems: true, items: { enum: PROTOCOL_FEATURES } },
    optionalFeatures: { type: "array", maxItems: PROTOCOL_FEATURES.length, uniqueItems: true, items: { enum: PROTOCOL_FEATURES } },
  },
} as const;

const initializeResultSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "protocolVersion",
    "daemonVersion",
    "daemonInstanceGeneration",
    "principal",
    "clientNonce",
    "connectionNonce",
    "features",
    "allowedOperations",
    "limits",
  ],
  properties: {
    protocolVersion: { const: 1 },
    daemonVersion: { type: "string", minLength: 1, maxLength: 128 },
    daemonInstanceGeneration: { type: "integer", minimum: 1 },
    principal: { oneOf: Object.values(principalSchemas) },
    clientNonce: idSchema,
    connectionNonce: idSchema,
    features: { type: "array", maxItems: PROTOCOL_FEATURES.length, uniqueItems: true, items: { enum: PROTOCOL_FEATURES } },
    allowedOperations: { type: "array", maxItems: activeOperations.length, uniqueItems: true, items: { enum: activeOperations } },
    limits: limitsSchema,
  },
} as const;

function requestVariant(operation: ProtocolOperation): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "operation", "input"],
    properties: {
      id: idSchema,
      operation: { const: operation },
      input: OPERATION_CODECS[operation].input.schema,
    },
  };
}

function successVariant(operation: ProtocolOperation): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "operation", "ok", "result"],
    properties: {
      id: idSchema,
      operation: { const: operation },
      ok: { const: true },
      result: OPERATION_CODECS[operation].result.schema,
    },
  };
}

function failureVariant(operation: ProtocolOperation | "initialize"): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "operation", "ok", "error"],
    properties: {
      id: idSchema,
      operation: { const: operation },
      ok: { const: false },
      error: protocolFailureSchema,
    },
  };
}

const initializeRequestEnvelope = {
  type: "object",
  additionalProperties: false,
  required: ["id", "operation", "input"],
  properties: { id: idSchema, operation: { const: "initialize" }, input: initializeInputSchema },
} as const;
const initializeSuccessEnvelope = {
  type: "object",
  additionalProperties: false,
  required: ["id", "operation", "ok", "result"],
  properties: { id: idSchema, operation: { const: "initialize" }, ok: { const: true }, result: initializeResultSchema },
} as const;

const capabilityBaseProperties = {
  capabilityId: idSchema,
  operatorId: idSchema,
  projectId: idSchema,
  principalGeneration: { type: "integer", minimum: 1 },
  issuedAt: timestampSchema,
  expiresAt: timestampSchema,
  status: { const: "active" },
};
function capabilityVariant(kind: "project-launch" | "session" | "takeover", actions: readonly string[]): JsonSchema {
  const sessionFields = kind === "project-launch" ? {} : {
    projectSessionId: idSchema,
    sessionGeneration: { type: "integer", minimum: 1 },
  };
  const takeoverFields = kind === "takeover" ? {
    takeoverBinding: {
      type: "object",
      additionalProperties: false,
      required: ["handoffDigest", "oldChairGeneration", "expectedRunId", "expectedRunRevision", "expectedSessionRevision", "targetRevision"],
      properties: {
        handoffDigest: digestSchema,
        oldChairGeneration: { type: "integer", minimum: 1 },
        expectedRunId: idSchema,
        expectedRunRevision: { type: "integer", minimum: 0 },
        expectedSessionRevision: { type: "integer", minimum: 0 },
        targetRevision: { type: "integer", minimum: 1 },
      },
    },
  } : {};
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "capabilityId", "operatorId", "projectId", "principalGeneration", "issuedAt", "expiresAt", "status", "kind", "actions",
      ...(kind === "project-launch" ? [] : ["projectSessionId", "sessionGeneration"]),
      ...(kind === "takeover" ? ["takeoverBinding"] : []),
    ],
    properties: {
      ...capabilityBaseProperties,
      kind: { const: kind },
      actions: {
        type: "array",
        minItems: 1,
        maxItems: actions.length,
        uniqueItems: true,
        items: { enum: actions },
        ...(kind === "takeover" ? { contains: { const: "takeover" } } : {}),
      },
      ...sessionFields,
      ...takeoverFields,
    },
  };
}

export const PROTOCOL_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://local.invalid/agent-fabric-protocol/v1/protocol.schema.json",
  title: "Agent Fabric public protocol v1",
  oneOf: [
    { "$ref": "#/$defs/initializeRequest" },
    { "$ref": "#/$defs/initializeSuccess" },
    { "$ref": "#/$defs/initializeFailure" },
    { "$ref": "#/$defs/rpcRequest" },
    { "$ref": "#/$defs/rpcResponse" },
  ],
  "$defs": {
    fabricOperation: { type: "string", enum: operations },
    activeFabricOperation: { type: "string", enum: activeOperations },
    operatorPrincipal: principalSchemas.operator,
    agentPrincipal: principalSchemas.agent,
    integrationPrincipal: principalSchemas.integration,
    principal: { oneOf: Object.values(principalSchemas) },
    operatorCapability: {
      oneOf: [
        capabilityVariant("project-launch", ["read", "launch"]),
        capabilityVariant("session", ["read", "decide", "steer", "pause", "resume", "cancel", "drain", "stop", "launch", "git", "external-effect"]),
        capabilityVariant("takeover", ["read", "decide", "steer", "pause", "resume", "cancel", "drain", "stop", "launch", "takeover", "git", "external-effect"]),
      ],
    },
    protocolFailure: protocolFailureSchema,
    protocolLimits: limitsSchema,
    initializeInput: initializeInputSchema,
    initializeResult: initializeResultSchema,
    initializeRequest: initializeRequestEnvelope,
    initializeSuccess: initializeSuccessEnvelope,
    initializeFailure: failureVariant("initialize"),
    rpcRequest: { oneOf: operations.map(requestVariant) },
    rpcResponse: { oneOf: operations.flatMap((operation) => (
      OPERATION_REGISTRY[operation].kind === "retired"
        ? [failureVariant(operation)]
        : [successVariant(operation), failureVariant(operation)]
    )) },
  },
} as const satisfies Readonly<Record<string, JsonValue>>;

export function protocolRequestSchemaFor(operation: ProtocolOperation): JsonSchema {
  return requestVariant(operation);
}

export function protocolResponseSchemasFor(operation: ProtocolOperation): readonly JsonSchema[] {
  return OPERATION_REGISTRY[operation].kind === "retired"
    ? [failureVariant(operation)]
    : [successVariant(operation), failureVariant(operation)];
}

export function initializeRequestSchema(): JsonSchema {
  return initializeRequestEnvelope;
}

export function initializeResponseSchemas(): readonly JsonSchema[] {
  return [initializeSuccessEnvelope, failureVariant("initialize")];
}

import { FABRIC_OPERATIONS, OPERATION_REGISTRY } from "./operations.js";
import {
  OPERATION_INPUT_SHAPES,
  OPERATION_RESULT_SHAPES,
  operationShapeSchema,
} from "./operation-codecs.js";
import type { JsonValue } from "./primitives.js";
import type { ProtocolOperation } from "./rpc-contract.js";
import { PROTOCOL_ERROR_CODES } from "./rpc-contract.js";

const idSchema = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$" } as const;
const featureEnum = [
  "fabric-core.v1",
  "project-sessions.v1",
  "operator-control.v1",
  "input-attestation.v1",
  "intakes.v1",
  "scoped-gates.v1",
  "resource-reservations.v1",
  "request-results.v1",
  "chair-takeover.v1",
  "operator-projection.v1",
  "message-body-read.v1",
  "lifecycle-control.v1",
] as const;

const capabilityBaseProperties = {
  capabilityId: idSchema,
  operatorId: idSchema,
  projectId: idSchema,
  principalGeneration: { type: "integer", minimum: 1 },
  issuedAt: { type: "string", format: "date-time" },
  expiresAt: { type: "string", format: "date-time" },
  status: { const: "active" },
};

const artifactRefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["path", "digest"],
  properties: {
    path: { type: "string", minLength: 1, maxLength: 4096 },
    digest: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
  },
} as const;

const operatorMutationContextSchema = {
  type: "object",
  additionalProperties: false,
  required: ["credential", "commandId", "expectedRevision", "actor", "provenance", "evidenceRefs"],
  properties: {
    credential: {
      type: "object",
      additionalProperties: false,
      required: ["capabilityId", "token"],
      properties: { capabilityId: idSchema, token: { type: "string", minLength: 1 } },
    },
    commandId: idSchema,
    expectedRevision: { type: "integer", minimum: 0 },
    actor: idSchema,
    provenance: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "clientId", "inputEventId"],
          properties: {
            kind: { const: "console-direct-input" },
            clientId: idSchema,
            inputEventId: { type: "string", minLength: 1 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "attestationId", "integrationId", "integrationGeneration"],
          properties: {
            kind: { const: "attested-provider-input" },
            attestationId: idSchema,
            integrationId: idSchema,
            integrationGeneration: { type: "integer", minimum: 1 },
          },
        },
      ],
    },
    evidenceRefs: { type: "array", items: artifactRefSchema },
  },
} as const;

const chairMutationContextSchema = {
  type: "object",
  additionalProperties: false,
  required: ["commandId", "ownerLeaseId", "ownerLeaseGeneration", "expectedRevision"],
  properties: {
    commandId: idSchema,
    ownerLeaseId: idSchema,
    ownerLeaseGeneration: { type: "integer", minimum: 1 },
    expectedRevision: { type: "integer", minimum: 1 },
  },
} as const;

const operatorMutationOperations: ReadonlySet<ProtocolOperation> = new Set([
  FABRIC_OPERATIONS.projectSessionCreate,
  FABRIC_OPERATIONS.projectSessionTransition,
  FABRIC_OPERATIONS.projectSessionClose,
  FABRIC_OPERATIONS.membershipBind,
  FABRIC_OPERATIONS.operatorAttach,
  FABRIC_OPERATIONS.operatorDetach,
  FABRIC_OPERATIONS.operatorHeartbeat,
  FABRIC_OPERATIONS.operatorCommand,
  FABRIC_OPERATIONS.intakeSubmit,
  FABRIC_OPERATIONS.scopedGateCreate,
  FABRIC_OPERATIONS.scopedGateResolve,
  FABRIC_OPERATIONS.chairTakeover,
  FABRIC_OPERATIONS.projectSessionDrain,
  FABRIC_OPERATIONS.projectSessionStop,
  FABRIC_OPERATIONS.daemonDrain,
  FABRIC_OPERATIONS.daemonStop,
]);

function capabilityVariant(
  kind: "project-launch" | "session" | "takeover",
  actions: readonly string[],
): Readonly<Record<string, JsonValue>> {
  const sessionFields = kind === "project-launch"
    ? {}
    : {
        projectSessionId: idSchema,
        sessionGeneration: { type: "integer", minimum: 1 },
      };
  const takeoverFields = kind === "takeover"
    ? { takeoverBinding: { "$ref": "#/$defs/takeoverBinding" } }
    : {};
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "capabilityId",
      "operatorId",
      "projectId",
      "principalGeneration",
      "issuedAt",
      "expiresAt",
      "status",
      "kind",
      "actions",
      ...(kind === "project-launch" ? [] : ["projectSessionId", "sessionGeneration"]),
      ...(kind === "takeover" ? ["takeoverBinding"] : []),
    ],
    properties: {
      ...capabilityBaseProperties,
      kind: { const: kind },
      actions: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { enum: actions },
        ...(kind === "takeover" ? { contains: { const: "takeover" } } : {}),
      },
      ...sessionFields,
      ...takeoverFields,
    },
  };
}

function requestVariant(operation: ProtocolOperation): Readonly<Record<string, JsonValue>> {
  const baseInputSchema = operationShapeSchema(OPERATION_INPUT_SHAPES[operation]);
  const commandSchema = operation === FABRIC_OPERATIONS.intakeRevise
    ? { oneOf: [operatorMutationContextSchema, chairMutationContextSchema] }
    : operatorMutationOperations.has(operation)
      ? operatorMutationContextSchema
      : undefined;
  const baseProperties = baseInputSchema.properties;
  const inputSchema = commandSchema === undefined || typeof baseProperties !== "object" || baseProperties === null || Array.isArray(baseProperties)
    ? baseInputSchema
    : { ...baseInputSchema, properties: { ...baseProperties, command: commandSchema } };
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "operation", "input"],
    properties: {
      id: idSchema,
      operation: { const: operation },
      input: inputSchema,
    },
  };
}

function responseVariants(operation: ProtocolOperation): readonly Readonly<Record<string, JsonValue>>[] {
  const identity = { id: idSchema, operation: { const: operation } };
  return [
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "operation", "ok", "result"],
      properties: {
        ...identity,
        ok: { const: true },
        result: operationShapeSchema(OPERATION_RESULT_SHAPES[operation]),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "operation", "ok", "error"],
      properties: {
        ...identity,
        ok: { const: false },
        error: { "$ref": "#/$defs/protocolFailure" },
      },
    },
  ];
}

const operations = Object.keys(OPERATION_REGISTRY) as ProtocolOperation[];

export const PROTOCOL_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://local.invalid/agent-fabric-protocol/v1/protocol.schema.json",
  title: "Agent Fabric public protocol v1",
  oneOf: [
    { "$ref": "#/$defs/initializeRequest" },
    { "$ref": "#/$defs/initializeResult" },
    { "$ref": "#/$defs/rpcRequest" },
    { "$ref": "#/$defs/rpcResponse" },
  ],
  "$defs": {
    fabricOperation: { type: "string", enum: operations },
    operatorPrincipal: {
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
    agentPrincipal: {
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
    integrationPrincipal: {
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
    takeoverBinding: {
      type: "object",
      additionalProperties: false,
      required: ["handoffDigest", "oldChairGeneration", "expectedRunId", "expectedRunRevision", "expectedSessionRevision", "targetRevision"],
      properties: {
        handoffDigest: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
        oldChairGeneration: { type: "integer", minimum: 1 },
        expectedRunId: idSchema,
        expectedRunRevision: { type: "integer", minimum: 0 },
        expectedSessionRevision: { type: "integer", minimum: 0 },
        targetRevision: { type: "integer", minimum: 1 },
      },
    },
    operatorCapability: {
      oneOf: [
        capabilityVariant("project-launch", ["read", "launch"]),
        capabilityVariant("session", ["read", "decide", "steer", "pause", "resume", "cancel", "drain", "stop", "launch", "git", "external-effect"]),
        capabilityVariant("takeover", ["read", "decide", "steer", "pause", "resume", "cancel", "drain", "stop", "launch", "takeover", "git", "external-effect"]),
      ],
    },
    initializeRequest: {
      type: "object",
      additionalProperties: false,
      required: ["protocolVersion", "client", "principal", "requiredFeatures", "optionalFeatures"],
      properties: {
        protocolVersion: { const: 1 },
        client: {
          type: "object",
          additionalProperties: false,
          required: ["name", "version"],
          properties: { name: { type: "string", minLength: 1 }, version: { type: "string", minLength: 1 } },
        },
        principal: {
          oneOf: [
            { "$ref": "#/$defs/operatorPrincipal" },
            { "$ref": "#/$defs/agentPrincipal" },
            { "$ref": "#/$defs/integrationPrincipal" },
          ],
        },
        requiredFeatures: { type: "array", uniqueItems: true, items: { enum: featureEnum } },
        optionalFeatures: { type: "array", uniqueItems: true, items: { enum: featureEnum } },
      },
    },
    initializeResult: {
      type: "object",
      additionalProperties: false,
      required: ["protocolVersion", "daemonVersion", "daemonInstanceGeneration", "features", "limits"],
      properties: {
        protocolVersion: { const: 1 },
        daemonVersion: { type: "string", minLength: 1 },
        daemonInstanceGeneration: { type: "integer", minimum: 1 },
        features: { type: "array", uniqueItems: true, items: { enum: featureEnum } },
        limits: {
          type: "object",
          additionalProperties: false,
          required: ["maximumFrameBytes", "maximumPendingCalls", "maximumInFlightPerConnection", "idleTimeoutMs", "requestTimeoutMs"],
          properties: {
            maximumFrameBytes: { type: "integer", minimum: 1, maximum: 1048576 },
            maximumPendingCalls: { type: "integer", minimum: 1, maximum: 32 },
            maximumInFlightPerConnection: { type: "integer", minimum: 1, maximum: 16 },
            idleTimeoutMs: { type: "integer", minimum: 1, maximum: 300000 },
            requestTimeoutMs: { type: "integer", minimum: 1, maximum: 30000 },
          },
        },
      },
    },
    protocolFailure: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "retryable"],
      properties: {
        code: { type: "string", enum: PROTOCOL_ERROR_CODES },
        message: { type: "string", minLength: 1 },
        retryable: { type: "boolean" },
        details: true,
      },
    },
    rpcRequest: { oneOf: operations.map(requestVariant) },
    rpcResponse: { oneOf: operations.flatMap(responseVariants) },
  },
} as const satisfies Readonly<Record<string, JsonValue>>;

export function protocolRequestSchemaFor(operation: ProtocolOperation): Readonly<Record<string, JsonValue>> {
  return requestVariant(operation);
}

export function protocolResponseSchemasFor(
  operation: ProtocolOperation,
): readonly Readonly<Record<string, JsonValue>>[] {
  return responseVariants(operation);
}

import { protocolClientField, secret } from "./codec.js";
import {
  negotiateProtocol,
  operationsForFeatures,
  PROTOCOL_FEATURES,
  type ProtocolFeature,
} from "./features.js";
import {
  isFabricOperation,
  isActiveFabricOperation,
  isDaemonGrantableOperation,
  OPERATION_REGISTRY,
  operationsForPrincipal,
  type FabricOperation,
} from "./operations.js";
import {
  parseIdentifier,
  safeInteger,
  strictRecord,
  type AgentId,
  type IntegrationId,
  type OperatorId,
  type ProjectId,
  type ProjectSessionId,
} from "./primitives.js";
import {
  PROTOCOL_LIMITS,
  type ProtocolInitializeRequest,
  type ProtocolInitializeResult,
  type ProtocolLimits,
  type ProtocolPrincipal,
} from "./rpc-contract.js";

export class ProtocolAuthenticationError extends Error {
  readonly code = "AUTHENTICATION_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProtocolAuthenticationError";
  }
}

export type VerifiedProtocolCredential = {
  readonly principal: ProtocolPrincipal;
  readonly grantedOperations: readonly FabricOperation[];
};

function parseFeatureArray(value: unknown, path: string): ProtocolFeature[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  const features = value.map((feature, index) => {
    const matched = PROTOCOL_FEATURES.find((candidate) => candidate === feature);
    if (matched === undefined) throw new TypeError(`${path}[${String(index)}] is not a protocol feature`);
    return matched;
  });
  if (new Set(features).size !== features.length) throw new TypeError(`${path} must not contain duplicates`);
  return features;
}

export function parseProtocolPrincipal(value: unknown, path = "principal"): ProtocolPrincipal {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  const kind: unknown = Reflect.get(value, "kind");
  if (kind === "operator") {
    const record = strictRecord(value, path, [
      "kind",
      "operatorId",
      "projectId",
      "projectAuthorityGeneration",
      "principalGeneration",
    ]);
    return {
      kind,
      operatorId: parseIdentifier<"OperatorId">(record.operatorId, `${path}.operatorId`) as OperatorId,
      projectId: parseIdentifier<"ProjectId">(record.projectId, `${path}.projectId`) as ProjectId,
      projectAuthorityGeneration: safeInteger(
        record.projectAuthorityGeneration,
        `${path}.projectAuthorityGeneration`,
        1,
      ),
      principalGeneration: safeInteger(record.principalGeneration, `${path}.principalGeneration`, 1),
    };
  }
  if (kind === "agent") {
    const record = strictRecord(value, path, ["kind", "agentId", "projectSessionId", "runId", "principalGeneration"]);
    return {
      kind,
      agentId: parseIdentifier<"AgentId">(record.agentId, `${path}.agentId`) as AgentId,
      projectSessionId: parseIdentifier<"ProjectSessionId">(
        record.projectSessionId,
        `${path}.projectSessionId`,
      ) as ProjectSessionId,
      runId: parseIdentifier<"CoordinationRunId">(record.runId, `${path}.runId`),
      principalGeneration: safeInteger(record.principalGeneration, `${path}.principalGeneration`, 1),
    };
  }
  if (kind === "integration") {
    const record = strictRecord(value, path, ["kind", "integrationId", "projectId", "principalGeneration"]);
    return {
      kind,
      integrationId: parseIdentifier<"IntegrationId">(
        record.integrationId,
        `${path}.integrationId`,
      ) as IntegrationId,
      projectId: parseIdentifier<"ProjectId">(record.projectId, `${path}.projectId`) as ProjectId,
      principalGeneration: safeInteger(record.principalGeneration, `${path}.principalGeneration`, 1),
    };
  }
  throw new TypeError(`${path}.kind must be operator, agent or integration`);
}

export function parseProtocolInitializeRequest(value: unknown): ProtocolInitializeRequest {
  const record = strictRecord(value, "initialize.input", [
    "protocolVersion",
    "client",
    "authentication",
    "expectedPrincipalKind",
    "requiredFeatures",
    "optionalFeatures",
  ]);
  if (record.protocolVersion !== 1) throw new TypeError("initialize.input.protocolVersion must be 1");
  const client = strictRecord(record.client, "initialize.input.client", ["name", "version"]);
  const authentication = strictRecord(record.authentication, "initialize.input.authentication", [
    "scheme",
    "credential",
    "clientNonce",
  ]);
  if (authentication.scheme !== "capability") throw new TypeError("initialize authentication scheme must be capability");
  const expectedPrincipalKind = record.expectedPrincipalKind;
  if (expectedPrincipalKind !== "operator" && expectedPrincipalKind !== "agent" && expectedPrincipalKind !== "integration") {
    throw new TypeError("initialize expectedPrincipalKind is invalid");
  }
  return {
    protocolVersion: 1,
    client: {
      name: protocolClientField.parse(client.name, "initialize.input.client.name"),
      version: protocolClientField.parse(client.version, "initialize.input.client.version"),
    },
    authentication: {
      scheme: "capability",
      credential: secret.parse(authentication.credential, "initialize.input.authentication.credential"),
      clientNonce: parseIdentifier<"ClientNonce">(
        authentication.clientNonce,
        "initialize.input.authentication.clientNonce",
      ),
    },
    expectedPrincipalKind,
    requiredFeatures: parseFeatureArray(record.requiredFeatures, "initialize.input.requiredFeatures"),
    optionalFeatures: parseFeatureArray(record.optionalFeatures, "initialize.input.optionalFeatures"),
  };
}

function parseLimits(value: unknown): ProtocolLimits {
  const record = strictRecord(value, "initialize.result.limits", Object.keys(PROTOCOL_LIMITS));
  const result: Record<keyof ProtocolLimits, number> = { ...PROTOCOL_LIMITS };
  for (const [key, maximum] of Object.entries(PROTOCOL_LIMITS) as Array<[keyof ProtocolLimits, number]>) {
    const limit = record[key];
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
      throw new TypeError(`initialize.result.limits.${key} is invalid`);
    }
    result[key] = limit;
  }
  return result;
}

export function allowedOperationsForPrincipal(
  principal: ProtocolPrincipal,
  features: readonly ProtocolFeature[],
): FabricOperation[] {
  const featureOperations = operationsForFeatures(features);
  const principalOperations = operationsForPrincipal(principal.kind);
  return [...featureOperations]
    .filter((operation) => isDaemonGrantableOperation(operation) && principalOperations.has(operation as never))
    .sort();
}

export function authorizeProtocolInitialize(
  request: ProtocolInitializeRequest,
  verifiedCredential: VerifiedProtocolCredential,
  negotiatedFeatures: readonly ProtocolFeature[] = [...request.requiredFeatures, ...request.optionalFeatures],
): { principal: ProtocolPrincipal; allowedOperations: FabricOperation[] } {
  const verifiedPrincipal = verifiedCredential.principal;
  if (verifiedPrincipal.kind !== request.expectedPrincipalKind) {
    throw new ProtocolAuthenticationError(
      `credential resolved to ${verifiedPrincipal.kind}, expected ${request.expectedPrincipalKind}`,
    );
  }
  const featureOperations = operationsForFeatures(negotiatedFeatures);
  const principalOperations = operationsForPrincipal(verifiedPrincipal.kind);
  const allowedOperations = [...new Set(verifiedCredential.grantedOperations)]
    .filter((operation) => (
      isActiveFabricOperation(operation) &&
      isDaemonGrantableOperation(operation) &&
      featureOperations.has(operation) &&
      principalOperations.has(operation as never)
    ))
    .sort();
  return {
    principal: verifiedPrincipal,
    allowedOperations,
  };
}

export function createProtocolInitializeResult(options: {
  request: ProtocolInitializeRequest;
  verifiedCredential: VerifiedProtocolCredential;
  daemonVersion: string;
  daemonInstanceGeneration: number;
  offeredFeatures: readonly ProtocolFeature[];
  limits: ProtocolLimits;
  connectionNonce: string;
}): ProtocolInitializeResult {
  const negotiation = negotiateProtocol(options.request, {
    protocolVersion: 1,
    features: options.offeredFeatures,
  });
  if (!negotiation.ok) throw new TypeError(`protocol negotiation failed: ${negotiation.reason}`);
  const authorization = authorizeProtocolInitialize(
    options.request,
    options.verifiedCredential,
    negotiation.features,
  );
  return {
    protocolVersion: 1,
    daemonVersion: protocolClientField.parse(options.daemonVersion, "daemonVersion"),
    daemonInstanceGeneration: safeInteger(options.daemonInstanceGeneration, "daemonInstanceGeneration", 1),
    principal: authorization.principal,
    clientNonce: options.request.authentication.clientNonce,
    connectionNonce: parseIdentifier<"ConnectionNonce">(options.connectionNonce, "connectionNonce"),
    features: negotiation.features,
    allowedOperations: authorization.allowedOperations,
    limits: options.limits,
  };
}

export function parseProtocolInitializeResult(value: unknown): ProtocolInitializeResult {
  const record = strictRecord(value, "initialize.result", [
    "protocolVersion",
    "daemonVersion",
    "daemonInstanceGeneration",
    "principal",
    "clientNonce",
    "connectionNonce",
    "features",
    "allowedOperations",
    "limits",
  ]);
  if (record.protocolVersion !== 1) throw new TypeError("initialize.result.protocolVersion must be 1");
  const principal = parseProtocolPrincipal(record.principal, "initialize.result.principal");
  const features = parseFeatureArray(record.features, "initialize.result.features");
  if (!Array.isArray(record.allowedOperations)) throw new TypeError("initialize.result.allowedOperations must be an array");
  const legalOperations = new Set(allowedOperationsForPrincipal(principal, features));
  const allowedOperations = record.allowedOperations.map((operation, index) => {
    if (typeof operation !== "string" || !isFabricOperation(operation)) {
      throw new TypeError(`initialize.result.allowedOperations[${String(index)}] is invalid`);
    }
    if (OPERATION_REGISTRY[operation].kind === "retired" || !legalOperations.has(operation)) {
      throw new ProtocolAuthenticationError(`server granted ${operation} outside the bound principal`);
    }
    return operation;
  });
  if (new Set(allowedOperations).size !== allowedOperations.length) {
    throw new TypeError("initialize.result.allowedOperations must not contain duplicates");
  }
  return {
    protocolVersion: 1,
    daemonVersion: protocolClientField.parse(record.daemonVersion, "initialize.result.daemonVersion"),
    daemonInstanceGeneration: safeInteger(
      record.daemonInstanceGeneration,
      "initialize.result.daemonInstanceGeneration",
      1,
    ),
    principal,
    clientNonce: parseIdentifier<"ClientNonce">(record.clientNonce, "initialize.result.clientNonce"),
    connectionNonce: parseIdentifier<"ConnectionNonce">(
      record.connectionNonce,
      "initialize.result.connectionNonce",
    ),
    features,
    allowedOperations,
    limits: parseLimits(record.limits),
  };
}

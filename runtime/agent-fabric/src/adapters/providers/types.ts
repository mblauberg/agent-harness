import { isAbsolute } from "node:path";

export type AdapterActionStatus =
  | "prepared"
  | "dispatched"
  | "accepted"
  | "terminal"
  | "ambiguous"
  | "cancelled";

export type AdapterActionRecord = {
  actionId: string;
  operation: string;
  payloadHash: string;
  status: AdapterActionStatus;
  history: AdapterActionStatus[];
  executionCount: number;
  effectCount: number;
  idempotencyProven: boolean;
  result?: unknown;
};

export type ProviderAdapterCapabilities = {
  protocolVersion: 1;
  adapterId: string;
  operations: string[];
  actionJournal: true;
  persistentSession: boolean;
  ephemeralWorker: true;
  controlModes: ["managed"];
  inboxDeliveryModes: ["structured-push"];
  recoveryOperations: string[];
  compactInPlace: boolean;
  idempotencyEvidence: "per-action-fail-closed";
  chairLaunch?: ChairLaunchCapability;
};

export type ChairLaunchCapability = {
  schemaVersion: 1;
  method: "launch_chair";
  inputSchemaId: string;
  oneUse: true;
  secretTransport: "private-environment";
  environment: {
    capability: "AGENT_FABRIC_CAPABILITY";
    socketPath: "AGENT_FABRIC_SOCKET_PATH";
  };
  publicPayloadSchema: Record<string, unknown>;
  noEffectProofSchemas: Record<string, Record<string, unknown>>;
};

function isClosedObjectSchema(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    value.type === "object" &&
    value.additionalProperties === false &&
    isRecord(value.properties) &&
    Array.isArray(value.required) &&
    value.required.every((field) => typeof field === "string")
  );
}

export function parseChairLaunchCapability(value: unknown): ChairLaunchCapability {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 8 ||
    value.schemaVersion !== 1 ||
    value.method !== "launch_chair" ||
    typeof value.inputSchemaId !== "string" ||
    value.inputSchemaId.length === 0 ||
    value.oneUse !== true ||
    value.secretTransport !== "private-environment" ||
    !isRecord(value.environment) ||
    Object.keys(value.environment).length !== 2 ||
    value.environment.capability !== "AGENT_FABRIC_CAPABILITY" ||
    value.environment.socketPath !== "AGENT_FABRIC_SOCKET_PATH" ||
    !isClosedObjectSchema(value.publicPayloadSchema) ||
    !isRecord(value.noEffectProofSchemas) ||
    !Object.values(value.noEffectProofSchemas).every(isClosedObjectSchema)
  ) {
    throw new ProviderAdapterError(
      "CAPABILITY_CONTRACT_INVALID",
      "chair launch capability does not match its closed schema",
    );
  }
  return {
    schemaVersion: 1,
    method: "launch_chair",
    inputSchemaId: value.inputSchemaId,
    oneUse: true,
    secretTransport: "private-environment",
    environment: {
      capability: "AGENT_FABRIC_CAPABILITY",
      socketPath: "AGENT_FABRIC_SOCKET_PATH",
    },
    publicPayloadSchema: value.publicPayloadSchema,
    noEffectProofSchemas: value.noEffectProofSchemas as Record<string, Record<string, unknown>>,
  };
}

export type ChairLaunchHandoff = {
  capability: string;
  socketPath: string;
};

export type ChairLaunchBoundaryInput = {
  actionId: string;
  providerContractDigest: string;
  payload: Record<string, unknown>;
  environment: {
    AGENT_FABRIC_CAPABILITY: string;
    AGENT_FABRIC_SOCKET_PATH: string;
  };
};

export type ChairLaunchProviderResult = {
  resumeReference: string;
  providerSessionGeneration: number;
  fabricContinuity: ChairLaunchFabricContinuityEvidence;
};

export type ChairLaunchFabricContinuityEvidence = {
  schemaVersion: 1;
  kind: "authenticated-fabric-continuity";
  providerContractDigest: string;
  providerSessionRef: string;
  providerSessionGeneration: number;
  authenticated: true;
};

export type ChairLaunchContinuityUnprovenEvidence = {
  kind: "continuity-unproven";
  providerContractDigest: string;
  resumeReference: string;
  providerSessionGeneration: number;
};

export function parseChairLaunchContinuityUnprovenEvidence(
  value: unknown,
  expectedProviderContractDigest: string,
): ChairLaunchContinuityUnprovenEvidence {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    value.kind !== "continuity-unproven" ||
    value.providerContractDigest !== expectedProviderContractDigest ||
    typeof value.resumeReference !== "string" ||
    value.resumeReference.length === 0 ||
    typeof value.providerSessionGeneration !== "number" ||
    !Number.isSafeInteger(value.providerSessionGeneration) ||
    value.providerSessionGeneration <= 0
  ) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "chair launch continuity failure evidence does not match the launch contract",
    );
  }
  return {
    kind: "continuity-unproven",
    providerContractDigest: expectedProviderContractDigest,
    resumeReference: value.resumeReference,
    providerSessionGeneration: value.providerSessionGeneration,
  };
}

export function parseChairLaunchProviderResult(
  value: unknown,
  expectedProviderContractDigest: string,
): ChairLaunchProviderResult {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    !Object.hasOwn(value, "resumeReference") ||
    typeof value.resumeReference !== "string" ||
    value.resumeReference.length === 0 ||
    !Object.hasOwn(value, "providerSessionGeneration") ||
    typeof value.providerSessionGeneration !== "number" ||
    !Number.isSafeInteger(value.providerSessionGeneration) ||
    value.providerSessionGeneration <= 0 ||
    !Object.hasOwn(value, "fabricContinuity") ||
    !isRecord(value.fabricContinuity)
  ) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "chair launch provider result does not match its closed schema",
    );
  }
  const continuity = value.fabricContinuity;
  if (
    Object.keys(continuity).length !== 6 ||
    continuity.schemaVersion !== 1 ||
    continuity.kind !== "authenticated-fabric-continuity" ||
    typeof continuity.providerContractDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(continuity.providerContractDigest) ||
    continuity.providerContractDigest !== expectedProviderContractDigest ||
    continuity.providerSessionRef !== value.resumeReference ||
    continuity.providerSessionGeneration !== value.providerSessionGeneration ||
    continuity.authenticated !== true
  ) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "chair launch Fabric continuity evidence does not match the launch contract",
    );
  }
  return {
    resumeReference: value.resumeReference,
    providerSessionGeneration: value.providerSessionGeneration,
    fabricContinuity: {
      schemaVersion: 1,
      kind: "authenticated-fabric-continuity",
      providerContractDigest: continuity.providerContractDigest,
      providerSessionRef: value.resumeReference,
      providerSessionGeneration: value.providerSessionGeneration,
      authenticated: true,
    },
  };
}

export function takeChairLaunchHandoff(environment: NodeJS.ProcessEnv): ChairLaunchHandoff | undefined {
  const capability = environment.AGENT_FABRIC_CAPABILITY;
  const socketPath = environment.AGENT_FABRIC_SOCKET_PATH;
  delete environment.AGENT_FABRIC_CAPABILITY;
  delete environment.AGENT_FABRIC_SOCKET_PATH;
  if (capability === undefined && socketPath === undefined) return undefined;
  if (
    typeof capability !== "string" ||
    capability.length === 0 ||
    typeof socketPath !== "string" ||
    socketPath.length === 0 ||
    !isAbsolute(socketPath)
  ) {
    throw new ProviderAdapterError(
      "PRIVATE_HANDOFF_INVALID",
      "chair launch private environment must contain a capability and absolute socket path",
    );
  }
  return { capability, socketPath };
}

export type AdapterRequestHandler = {
  request(method: string, params: Record<string, unknown>): Promise<unknown>;
};

export class ProviderAdapterError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderAdapterError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderAdapterError("INVALID_PARAMS", `${field} must be a non-empty string`);
  }
  return value;
}

export function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, field);
}

export function actionPayload(params: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(params.payload)) return params.payload;
  return Object.fromEntries(Object.entries(params).filter(([key]) => key !== "actionId"));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

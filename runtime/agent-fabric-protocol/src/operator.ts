import {
  oneOf,
  parseIdentifier,
  parseSha256Digest,
  parseTimestamp,
  requiredString,
  safeInteger,
  strictRecord,
  type AgentId,
  type ArtifactRef,
  type CapabilityId,
  type CommandId,
  type CoordinationRunId,
  type GateId,
  type InputAttestationId,
  type NonEmptyReadonlyArray,
  type OperatorClientId,
  type OperatorId,
  type ProjectId,
  type ProjectSessionId,
  type ProviderSessionRef,
  type Sha256Digest,
  type Timestamp,
} from "./primitives.js";

export const OPERATOR_ACTIONS = [
  "read",
  "decide",
  "steer",
  "pause",
  "resume",
  "cancel",
  "drain",
  "stop",
  "launch",
  "takeover",
  "git",
  "external-effect",
] as const;

export type OperatorAction = (typeof OPERATOR_ACTIONS)[number];
export type NonTakeoverOperatorAction = Exclude<OperatorAction, "takeover">;

type CapabilityBase = {
  capabilityId: CapabilityId;
  operatorId: OperatorId;
  projectId: ProjectId;
  principalGeneration: number;
  issuedAt: Timestamp;
  expiresAt: Timestamp;
  status: "active";
};

export type TakeoverBinding = {
  handoffDigest: Sha256Digest;
  oldChairGeneration: number;
  expectedRunId: CoordinationRunId;
  expectedRunRevision: number;
  expectedSessionRevision: number;
  targetRevision: number;
};

export type OperatorCapabilityGrant =
  | (CapabilityBase & {
      kind: "project-launch";
      actions: NonEmptyReadonlyArray<Extract<OperatorAction, "read" | "launch">>;
    })
  | (CapabilityBase & {
      kind: "session";
      projectSessionId: ProjectSessionId;
      sessionGeneration: number;
      actions: NonEmptyReadonlyArray<NonTakeoverOperatorAction>;
    })
  | (CapabilityBase & {
      kind: "takeover";
      projectSessionId: ProjectSessionId;
      sessionGeneration: number;
      actions: NonEmptyReadonlyArray<OperatorAction>;
      takeoverBinding: TakeoverBinding;
    });

export type OperatorCapabilityCredential = {
  capabilityId: CapabilityId;
  token: string;
};

export type OperatorProvenance =
  | { kind: "console-direct-input"; clientId: OperatorClientId; inputEventId: string }
  | {
      kind: "provider-direct-input";
      providerId: string;
      providerSessionRef: ProviderSessionRef;
      inputEventId: string;
    };

export type OperatorMutationContext = {
  credential: OperatorCapabilityCredential;
  commandId: CommandId;
  expectedRevision: number;
  actor: OperatorId;
  provenance: OperatorProvenance;
  evidenceRefs: readonly ArtifactRef[];
};

export type GateDecision = "approve" | "reject" | "defer" | "request-changes";

export type OperatorInputAttestation = {
  attestationId: InputAttestationId;
  operatorId: OperatorId;
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  providerMessageId: string;
  humanUtterance: string;
  channel: OperatorProvenance;
  gateBinding: {
    gateId: GateId;
    expectedGateRevision: number;
    artifactDigests: NonEmptyReadonlyArray<Sha256Digest>;
    interpretedDecision: GateDecision;
  };
  recordedAt: Timestamp;
};

export type OperatorCommandAudit = {
  commandId: CommandId;
  actor: OperatorId;
  provenance: OperatorProvenance;
  operation: OperatorAction;
  expectedRevision: number;
  committedRevision: number;
  before: Sha256Digest;
  after: Sha256Digest;
  evidenceRefs: readonly ArtifactRef[];
  committedAt: Timestamp;
};

export type ChairTakeoverRequest = {
  command: OperatorMutationContext;
  projectSessionId: ProjectSessionId;
  runId: CoordinationRunId;
  expectedChairAgentId: AgentId;
  successorChairAgentId: AgentId;
  expectedChairGeneration: number;
  expectedSessionGeneration: number;
  handoffRef: ArtifactRef;
  targetRevision: number;
};

const baseCapabilityFields = [
  "capabilityId",
  "operatorId",
  "projectId",
  "principalGeneration",
  "issuedAt",
  "expiresAt",
  "status",
  "kind",
] as const;

function parseActions(value: unknown, path: string): NonEmptyReadonlyArray<OperatorAction> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${path} must contain at least one operator action`);
  }
  const parsed = value.map((action, index) => oneOf(action, OPERATOR_ACTIONS, `${path}[${String(index)}]`));
  if (new Set(parsed).size !== parsed.length) throw new TypeError(`${path} must not contain duplicates`);
  const first = parsed[0];
  if (first === undefined) throw new TypeError(`${path} must contain at least one operator action`);
  return [first, ...parsed.slice(1)];
}

function parseCapabilityBase(record: Record<string, unknown>): CapabilityBase {
  const issuedAt = parseTimestamp(record.issuedAt, "operatorCapability.issuedAt");
  const expiresAt = parseTimestamp(record.expiresAt, "operatorCapability.expiresAt");
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new TypeError("operatorCapability.expiresAt must be after issuedAt");
  }
  if (record.status !== "active") throw new TypeError("operatorCapability.status must be active");
  return {
    capabilityId: parseIdentifier<"CapabilityId">(record.capabilityId, "operatorCapability.capabilityId"),
    operatorId: parseIdentifier<"OperatorId">(record.operatorId, "operatorCapability.operatorId"),
    projectId: parseIdentifier<"ProjectId">(record.projectId, "operatorCapability.projectId"),
    principalGeneration: safeInteger(record.principalGeneration, "operatorCapability.principalGeneration", 1),
    issuedAt,
    expiresAt,
    status: "active",
  };
}

function parseTakeoverBinding(value: unknown): TakeoverBinding {
  if (value === undefined) throw new TypeError("operatorCapability.takeoverBinding is required");
  const record = strictRecord(value, "operatorCapability.takeoverBinding", [
    "handoffDigest",
    "oldChairGeneration",
    "expectedRunId",
    "expectedRunRevision",
    "expectedSessionRevision",
    "targetRevision",
  ]);
  return {
    handoffDigest: parseSha256Digest(record.handoffDigest, "operatorCapability.takeoverBinding.handoffDigest"),
    oldChairGeneration: safeInteger(record.oldChairGeneration, "operatorCapability.takeoverBinding.oldChairGeneration", 1),
    expectedRunId: parseIdentifier<"CoordinationRunId">(
      record.expectedRunId,
      "operatorCapability.takeoverBinding.expectedRunId",
    ),
    expectedRunRevision: safeInteger(record.expectedRunRevision, "operatorCapability.takeoverBinding.expectedRunRevision"),
    expectedSessionRevision: safeInteger(
      record.expectedSessionRevision,
      "operatorCapability.takeoverBinding.expectedSessionRevision",
    ),
    targetRevision: safeInteger(record.targetRevision, "operatorCapability.takeoverBinding.targetRevision", 1),
  };
}

export function parseOperatorCapabilityGrant(value: unknown): OperatorCapabilityGrant {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("operatorCapability must be an object");
  }
  const kind: unknown = Reflect.get(value, "kind");
  const fields = kind === "project-launch"
    ? [...baseCapabilityFields, "actions"]
    : kind === "session"
      ? [...baseCapabilityFields, "projectSessionId", "sessionGeneration", "actions"]
      : kind === "takeover"
        ? [...baseCapabilityFields, "projectSessionId", "sessionGeneration", "actions", "takeoverBinding"]
        : baseCapabilityFields;
  const record = strictRecord(value, "operatorCapability", fields);
  const base = parseCapabilityBase(record);
  const actions = parseActions(record.actions, "operatorCapability.actions");

  if (kind === "project-launch") {
    const launchActions = actions.filter((action): action is "read" | "launch" => action === "read" || action === "launch");
    if (launchActions.length !== actions.length) {
      throw new TypeError("operatorCapability project-launch actions may only be read or launch");
    }
    const first = launchActions[0];
    if (first === undefined) throw new TypeError("operatorCapability.actions must not be empty");
    return { ...base, kind, actions: [first, ...launchActions.slice(1)] };
  }
  const projectSessionId = parseIdentifier<"ProjectSessionId">(
    record.projectSessionId,
    "operatorCapability.projectSessionId",
  );
  const sessionGeneration = safeInteger(record.sessionGeneration, "operatorCapability.sessionGeneration", 1);
  if (kind === "session") {
    if (actions.includes("takeover")) {
      throw new TypeError("operatorCapability takeover action requires a takeover capability");
    }
    const sessionActions = actions.filter((action): action is NonTakeoverOperatorAction => action !== "takeover");
    const first = sessionActions[0];
    if (first === undefined) throw new TypeError("operatorCapability.actions must not be empty");
    return { ...base, kind, projectSessionId, sessionGeneration, actions: [first, ...sessionActions.slice(1)] };
  }
  if (kind === "takeover") {
    if (!actions.includes("takeover")) throw new TypeError("operatorCapability takeover action is required");
    return {
      ...base,
      kind,
      projectSessionId,
      sessionGeneration,
      actions,
      takeoverBinding: parseTakeoverBinding(record.takeoverBinding),
    };
  }
  throw new TypeError("operatorCapability.kind must be project-launch, session or takeover");
}

function parseProvenance(value: unknown, path: string): OperatorProvenance {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  const kind: unknown = Reflect.get(value, "kind");
  if (kind === "console-direct-input") {
    const record = strictRecord(value, path, ["kind", "clientId", "inputEventId"]);
    return {
      kind,
      clientId: parseIdentifier<"OperatorClientId">(record.clientId, `${path}.clientId`),
      inputEventId: requiredString(record.inputEventId, `${path}.inputEventId`),
    };
  }
  if (kind === "provider-direct-input") {
    const record = strictRecord(value, path, ["kind", "providerId", "providerSessionRef", "inputEventId"]);
    return {
      kind,
      providerId: requiredString(record.providerId, `${path}.providerId`),
      providerSessionRef: parseIdentifier<"ProviderSessionRef">(record.providerSessionRef, `${path}.providerSessionRef`),
      inputEventId: requiredString(record.inputEventId, `${path}.inputEventId`),
    };
  }
  throw new TypeError(`${path}.kind must be one of console-direct-input, provider-direct-input`);
}

export function parseOperatorInputAttestation(value: unknown): OperatorInputAttestation {
  const record = strictRecord(value, "operatorInputAttestation", [
    "attestationId",
    "operatorId",
    "projectId",
    "projectSessionId",
    "providerMessageId",
    "humanUtterance",
    "channel",
    "gateBinding",
    "recordedAt",
  ]);
  const binding = strictRecord(record.gateBinding, "operatorInputAttestation.gateBinding", [
    "gateId",
    "expectedGateRevision",
    "artifactDigests",
    "interpretedDecision",
  ]);
  if (!Array.isArray(binding.artifactDigests) || binding.artifactDigests.length === 0) {
    throw new TypeError("operatorInputAttestation.gateBinding.artifactDigests must not be empty");
  }
  const digests = binding.artifactDigests.map((digest, index) => parseSha256Digest(
    digest,
    `operatorInputAttestation.gateBinding.artifactDigests[${String(index)}]`,
  ));
  const firstDigest = digests[0];
  if (firstDigest === undefined) throw new TypeError("operatorInputAttestation.gateBinding.artifactDigests must not be empty");
  return {
    attestationId: parseIdentifier<"InputAttestationId">(
      record.attestationId,
      "operatorInputAttestation.attestationId",
    ),
    operatorId: parseIdentifier<"OperatorId">(record.operatorId, "operatorInputAttestation.operatorId"),
    projectId: parseIdentifier<"ProjectId">(record.projectId, "operatorInputAttestation.projectId"),
    projectSessionId: parseIdentifier<"ProjectSessionId">(
      record.projectSessionId,
      "operatorInputAttestation.projectSessionId",
    ),
    providerMessageId: requiredString(record.providerMessageId, "operatorInputAttestation.providerMessageId"),
    humanUtterance: requiredString(record.humanUtterance, "operatorInputAttestation.humanUtterance"),
    channel: parseProvenance(record.channel, "operatorInputAttestation.channel"),
    gateBinding: {
      gateId: parseIdentifier<"GateId">(binding.gateId, "operatorInputAttestation.gateBinding.gateId"),
      expectedGateRevision: safeInteger(
        binding.expectedGateRevision,
        "operatorInputAttestation.gateBinding.expectedGateRevision",
      ),
      artifactDigests: [firstDigest, ...digests.slice(1)],
      interpretedDecision: oneOf(
        binding.interpretedDecision,
        ["approve", "reject", "defer", "request-changes"] as const,
        "operatorInputAttestation.gateBinding.interpretedDecision",
      ),
    },
    recordedAt: parseTimestamp(record.recordedAt, "operatorInputAttestation.recordedAt"),
  };
}

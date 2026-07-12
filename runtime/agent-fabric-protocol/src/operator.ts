import {
  oneOf,
  parseArtifactRef,
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
  type IntegrationId,
  type LeaseId,
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
  "git-authorise",
  "git-custody-resolve",
  "external-effect",
] as const;

export type OperatorAction = (typeof OPERATOR_ACTIONS)[number];
export type NonTakeoverOperatorAction = Exclude<OperatorAction, "takeover">;

type CapabilityBase = {
  capabilityId: CapabilityId;
  operatorId: OperatorId;
  projectId: ProjectId;
  projectAuthorityGeneration: number;
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

export type OperatorAuthorityBinding = {
  projectId: ProjectId;
  projectAuthorityGeneration: number;
  principalGeneration: number;
  projectSessionId?: ProjectSessionId;
  sessionGeneration?: number;
};

/** Rechecks a persisted grant against daemon-owned authority state immediately before use. */
export function assertOperatorCapabilityAuthority(
  grant: OperatorCapabilityGrant,
  current: OperatorAuthorityBinding,
): void {
  if (grant.projectId !== current.projectId) {
    throw new TypeError("operatorCapability project does not match current authority");
  }
  if (grant.projectAuthorityGeneration !== current.projectAuthorityGeneration) {
    throw new TypeError("operatorCapability project authority generation is stale");
  }
  if (grant.principalGeneration !== current.principalGeneration) {
    throw new TypeError("operatorCapability principal generation is stale");
  }
  if (grant.kind === "project-launch") return;
  if (grant.projectSessionId !== current.projectSessionId) {
    throw new TypeError("operatorCapability project session does not match current authority");
  }
  if (grant.sessionGeneration !== current.sessionGeneration) {
    throw new TypeError("operatorCapability session generation is stale");
  }
}

export type OperatorCapabilityCredential = {
  capabilityId: CapabilityId;
  token: string;
};

export type OperatorProvenance =
  | { kind: "console-direct-input"; clientId: OperatorClientId; inputEventId: string }
  | {
      kind: "attested-provider-input";
      attestationId: InputAttestationId;
      integrationId: IntegrationId;
      integrationGeneration: number;
    };

export type OperatorMutationContext = {
  credential: OperatorCapabilityCredential;
  commandId: CommandId;
  expectedRevision: number;
  actor: OperatorId;
  provenance: OperatorProvenance;
  evidenceRefs: readonly ArtifactRef[];
};

export type ChairMutationContext = {
  commandId: CommandId;
  agentId: AgentId;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  principalGeneration: number;
  chairLeaseId: LeaseId;
  chairLeaseGeneration: number;
  expectedRunRevision: number;
  expectedRevision: number;
};

export type ChairAuthorityBinding = {
  agentId: AgentId;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  principalGeneration: number;
  chairLeaseId: LeaseId;
  chairLeaseGeneration: number;
  runRevision: number;
};

/** Rechecks a chair command against the authenticated agent and daemon-owned run state. */
export function assertChairMutationAuthority(
  command: ChairMutationContext,
  current: ChairAuthorityBinding,
): void {
  if (command.agentId !== current.agentId) {
    throw new TypeError("chairCommand authenticated agent is not the current chair");
  }
  if (command.projectSessionId !== current.projectSessionId || command.coordinationRunId !== current.coordinationRunId) {
    throw new TypeError("chairCommand authenticated session or run does not match current chair");
  }
  if (command.principalGeneration !== current.principalGeneration) {
    throw new TypeError("chairCommand authenticated principal generation is stale");
  }
  if (
    command.chairLeaseId !== current.chairLeaseId ||
    command.chairLeaseGeneration !== current.chairLeaseGeneration
  ) {
    throw new TypeError("chairCommand chair lease is stale");
  }
  if (command.expectedRunRevision !== current.runRevision) {
    throw new TypeError("chairCommand run revision is stale");
  }
}

export type GateDecision = "approve" | "reject" | "defer" | "request-changes";

export type OperatorInputAttestation = {
  attestationId: InputAttestationId;
  integrationId: IntegrationId;
  integrationGeneration: number;
  operatorId: OperatorId;
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  providerEvent: {
    providerId: string;
    providerSessionRef: ProviderSessionRef;
    providerMessageId: string;
    inputEventId: string;
    eventDigest: Sha256Digest;
    classification: "direct-human";
  };
  humanUtterance: string;
  gateBinding: {
    gateId: GateId;
    expectedGateRevision: number;
    artifactDigests: NonEmptyReadonlyArray<Sha256Digest>;
    interpretedDecision: GateDecision;
  };
  recordedAt: Timestamp;
};

export type IntegrationMutationContext = {
  commandId: CommandId;
  integrationId: IntegrationId;
  expectedIntegrationGeneration: number;
  eventId: string;
  eventDigest: Sha256Digest;
};

export type IntegrationInputAttestationRequest = {
  context: IntegrationMutationContext;
  attestation: OperatorInputAttestation;
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

export function parseChairMutationContext(value: unknown, path = "chairCommand"): ChairMutationContext {
  const record = strictRecord(value, path, [
    "commandId",
    "agentId",
    "projectSessionId",
    "coordinationRunId",
    "principalGeneration",
    "chairLeaseId",
    "chairLeaseGeneration",
    "expectedRunRevision",
    "expectedRevision",
  ]);
  return {
    commandId: parseIdentifier<"CommandId">(record.commandId, `${path}.commandId`),
    agentId: parseIdentifier<"AgentId">(record.agentId, `${path}.agentId`),
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, `${path}.projectSessionId`),
    coordinationRunId: parseIdentifier<"CoordinationRunId">(
      record.coordinationRunId,
      `${path}.coordinationRunId`,
    ),
    principalGeneration: safeInteger(record.principalGeneration, `${path}.principalGeneration`, 1),
    chairLeaseId: parseIdentifier<"LeaseId">(record.chairLeaseId, `${path}.chairLeaseId`),
    chairLeaseGeneration: safeInteger(record.chairLeaseGeneration, `${path}.chairLeaseGeneration`, 1),
    expectedRunRevision: safeInteger(record.expectedRunRevision, `${path}.expectedRunRevision`),
    expectedRevision: safeInteger(record.expectedRevision, `${path}.expectedRevision`, 1),
  };
}

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
  "projectAuthorityGeneration",
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
    projectAuthorityGeneration: safeInteger(
      record.projectAuthorityGeneration,
      "operatorCapability.projectAuthorityGeneration",
      1,
    ),
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
  if (kind === "attested-provider-input") {
    const record = strictRecord(value, path, ["kind", "attestationId", "integrationId", "integrationGeneration"]);
    return {
      kind,
      attestationId: parseIdentifier<"InputAttestationId">(record.attestationId, `${path}.attestationId`),
      integrationId: parseIdentifier<"IntegrationId">(record.integrationId, `${path}.integrationId`),
      integrationGeneration: safeInteger(record.integrationGeneration, `${path}.integrationGeneration`, 1),
    };
  }
  throw new TypeError(`${path}.kind must be one of console-direct-input, attested-provider-input`);
}

export function parseOperatorMutationContext(value: unknown, path = "operatorMutation"): OperatorMutationContext {
  const record = strictRecord(value, path, [
    "credential",
    "commandId",
    "expectedRevision",
    "actor",
    "provenance",
    "evidenceRefs",
  ]);
  const credential = strictRecord(record.credential, `${path}.credential`, ["capabilityId", "token"]);
  if (!Array.isArray(record.evidenceRefs)) throw new TypeError(`${path}.evidenceRefs must be an array`);
  return {
    credential: {
      capabilityId: parseIdentifier<"CapabilityId">(credential.capabilityId, `${path}.credential.capabilityId`),
      token: requiredString(credential.token, `${path}.credential.token`),
    },
    commandId: parseIdentifier<"CommandId">(record.commandId, `${path}.commandId`),
    expectedRevision: safeInteger(record.expectedRevision, `${path}.expectedRevision`),
    actor: parseIdentifier<"OperatorId">(record.actor, `${path}.actor`),
    provenance: parseProvenance(record.provenance, `${path}.provenance`),
    evidenceRefs: record.evidenceRefs.map((evidence, index) => parseArtifactRef(
      evidence,
      `${path}.evidenceRefs[${String(index)}]`,
    )),
  };
}

export function parseOperatorInputAttestation(value: unknown): OperatorInputAttestation {
  const record = strictRecord(value, "operatorInputAttestation", [
    "attestationId",
    "integrationId",
    "integrationGeneration",
    "operatorId",
    "projectId",
    "projectSessionId",
    "providerEvent",
    "humanUtterance",
    "gateBinding",
    "recordedAt",
  ]);
  const providerEvent = strictRecord(record.providerEvent, "operatorInputAttestation.providerEvent", [
    "providerId",
    "providerSessionRef",
    "providerMessageId",
    "inputEventId",
    "eventDigest",
    "classification",
  ]);
  if (providerEvent.classification !== "direct-human") {
    throw new TypeError("operatorInputAttestation.providerEvent.classification must be direct-human");
  }
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
    integrationId: parseIdentifier<"IntegrationId">(record.integrationId, "operatorInputAttestation.integrationId"),
    integrationGeneration: safeInteger(
      record.integrationGeneration,
      "operatorInputAttestation.integrationGeneration",
      1,
    ),
    operatorId: parseIdentifier<"OperatorId">(record.operatorId, "operatorInputAttestation.operatorId"),
    projectId: parseIdentifier<"ProjectId">(record.projectId, "operatorInputAttestation.projectId"),
    projectSessionId: parseIdentifier<"ProjectSessionId">(
      record.projectSessionId,
      "operatorInputAttestation.projectSessionId",
    ),
    providerEvent: {
      providerId: requiredString(providerEvent.providerId, "operatorInputAttestation.providerEvent.providerId"),
      providerSessionRef: parseIdentifier<"ProviderSessionRef">(
        providerEvent.providerSessionRef,
        "operatorInputAttestation.providerEvent.providerSessionRef",
      ),
      providerMessageId: requiredString(
        providerEvent.providerMessageId,
        "operatorInputAttestation.providerEvent.providerMessageId",
      ),
      inputEventId: requiredString(providerEvent.inputEventId, "operatorInputAttestation.providerEvent.inputEventId"),
      eventDigest: parseSha256Digest(providerEvent.eventDigest, "operatorInputAttestation.providerEvent.eventDigest"),
      classification: "direct-human",
    },
    humanUtterance: requiredString(record.humanUtterance, "operatorInputAttestation.humanUtterance"),
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

export function parseIntegrationInputAttestationRequest(value: unknown): IntegrationInputAttestationRequest {
  const record = strictRecord(value, "integrationInputAttestation", ["context", "attestation"]);
  const contextRecord = strictRecord(record.context, "integrationInputAttestation.context", [
    "commandId",
    "integrationId",
    "expectedIntegrationGeneration",
    "eventId",
    "eventDigest",
  ]);
  const context: IntegrationMutationContext = {
    commandId: parseIdentifier<"CommandId">(contextRecord.commandId, "integrationInputAttestation.context.commandId"),
    integrationId: parseIdentifier<"IntegrationId">(
      contextRecord.integrationId,
      "integrationInputAttestation.context.integrationId",
    ),
    expectedIntegrationGeneration: safeInteger(
      contextRecord.expectedIntegrationGeneration,
      "integrationInputAttestation.context.expectedIntegrationGeneration",
      1,
    ),
    eventId: requiredString(contextRecord.eventId, "integrationInputAttestation.context.eventId"),
    eventDigest: parseSha256Digest(contextRecord.eventDigest, "integrationInputAttestation.context.eventDigest"),
  };
  const attestation = parseOperatorInputAttestation(record.attestation);
  if (attestation.integrationId !== context.integrationId ||
      attestation.integrationGeneration !== context.expectedIntegrationGeneration) {
    throw new TypeError("integrationInputAttestation integration generation does not match authenticated context");
  }
  if (attestation.providerEvent.inputEventId !== context.eventId ||
      attestation.providerEvent.eventDigest !== context.eventDigest) {
    throw new TypeError("integrationInputAttestation immutable provider event does not match authenticated context");
  }
  return { context, attestation };
}

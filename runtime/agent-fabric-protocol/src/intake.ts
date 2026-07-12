import {
  parseArtifactRef,
  parseIdentifier,
  requiredString,
  safeInteger,
  strictRecord,
  type ArtifactRef,
  type AgentId,
  type ConversationId,
  type CoordinationRunId,
  type GateId,
  type IntakeId,
  type ProjectId,
  type ProjectSessionId,
  type ProviderSessionRef,
} from "./primitives.js";
import {
  parseChairMutationContext,
  parseOperatorMutationContext,
  type ChairMutationContext,
  type OperatorCapabilityCredential,
  type OperatorMutationContext,
} from "./operator.js";
import { parseTaskRequest, type TaskRequest } from "./request-result.js";

export const INTAKE_STATES = [
  "draft",
  "awaiting-chair",
  "discussing",
  "awaiting-human",
  "accepted",
  "deferred",
  "cancelled",
] as const;

export type IntakeState = (typeof INTAKE_STATES)[number];
export type BoundIntakeState = Exclude<IntakeState, "draft">;

type IntakeBase = {
  intakeId: IntakeId;
  projectId: ProjectId;
  revision: number;
  dedupeKey: string;
  summary: string;
  artifactRefs: readonly ArtifactRef[];
  gateIds: readonly GateId[];
};

export type IntakeDraft = IntakeBase & { state: "draft" };

type BoundIntakeBase = IntakeBase & {
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  chairRequestSeed?: IntakeChairRequestSeed;
};

export type IntakeChairRequestSeed = Readonly<{
  conversationId: ConversationId;
  targetAgentId: AgentId;
  targetProviderSessionRef: ProviderSessionRef;
  baseRevision: string;
}>;

export type BoundIntake = BoundIntakeBase & (
  | { state: "accepted"; acceptedScopeRef: ArtifactRef }
  | { state: Exclude<BoundIntakeState, "accepted">; acceptedScopeRef?: never }
);

export type Intake = IntakeDraft | BoundIntake;

function parseChairRequestSeed(value: unknown): IntakeChairRequestSeed {
  const record = strictRecord(value, "intake.chairRequestSeed", [
    "conversationId",
    "targetAgentId",
    "targetProviderSessionRef",
    "baseRevision",
  ]);
  return {
    conversationId: parseIdentifier<"ConversationId">(
      record.conversationId,
      "intake.chairRequestSeed.conversationId",
    ),
    targetAgentId: parseIdentifier<"AgentId">(
      record.targetAgentId,
      "intake.chairRequestSeed.targetAgentId",
    ),
    targetProviderSessionRef: parseIdentifier<"ProviderSessionRef">(
      record.targetProviderSessionRef,
      "intake.chairRequestSeed.targetProviderSessionRef",
    ),
    baseRevision: requiredString(record.baseRevision, "intake.chairRequestSeed.baseRevision"),
  };
}

export type IntakeDraftCreateRequest = {
  command: OperatorMutationContext;
  intakeId: IntakeId;
  dedupeKey: string;
  summary: string;
  artifactRefs: readonly ArtifactRef[];
  gateIds: readonly GateId[];
};

export type IntakeReadRequest = {
  credential: OperatorCapabilityCredential;
  intakeId: IntakeId;
};

export type IntakeSubmission = {
  command: OperatorMutationContext;
  intakeId: IntakeId;
  expectedRevision: number;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  summary: string;
  artifactRefs: readonly ArtifactRef[];
  gateIds: readonly GateId[];
  chairRequest: TaskRequest & {
    request: TaskRequest["request"] & { intakeBinding: NonNullable<TaskRequest["request"]["intakeBinding"]> };
  };
};

type IntakeRevisionBase = {
  intakeId: IntakeId;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  expectedRevision: number;
  summary: string;
  artifactRefs: readonly ArtifactRef[];
  gateIds: readonly GateId[];
  chairRequest?: TaskRequest;
};

type IntakeRevision = IntakeRevisionBase & (
  | { state: "accepted"; acceptedScopeRef: ArtifactRef }
  | { state: Exclude<BoundIntakeState, "accepted">; acceptedScopeRef?: never }
);

export type IntakeRevisionRequest =
  | (IntakeRevision & { origin: "operator"; command: OperatorMutationContext })
  | (IntakeRevision & { origin: "chair"; command: ChairMutationContext });

function parseArtifactRefs(value: unknown, path: string): readonly ArtifactRef[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value.map((artifact, index) => parseArtifactRef(artifact, `${path}[${String(index)}]`));
}

function parseGateIds(value: unknown, path: string): readonly GateId[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value.map((gateId, index) => parseIdentifier<"GateId">(gateId, `${path}[${String(index)}]`));
}

export function parseIntake(value: unknown): Intake {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("intake must be an object");
  }
  const state: unknown = Reflect.get(value, "state");
  const fields = state === "draft"
    ? ["intakeId", "projectId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"]
    : [
        "intakeId",
        "projectId",
        "projectSessionId",
        "coordinationRunId",
        "revision",
        "state",
        "dedupeKey",
        "summary",
        "artifactRefs",
        "gateIds",
        "chairRequestSeed",
        ...(state === "accepted" ? ["acceptedScopeRef"] : []),
      ];
  const record = strictRecord(value, "intake", fields);
  const common = {
    intakeId: parseIdentifier<"IntakeId">(record.intakeId, "intake.intakeId"),
    projectId: parseIdentifier<"ProjectId">(record.projectId, "intake.projectId"),
    revision: safeInteger(record.revision, "intake.revision", 1),
    dedupeKey: requiredString(record.dedupeKey, "intake.dedupeKey"),
    summary: requiredString(record.summary, "intake.summary"),
    artifactRefs: parseArtifactRefs(record.artifactRefs, "intake.artifactRefs"),
    gateIds: parseGateIds(record.gateIds, "intake.gateIds"),
  };
  if (state === "draft") return { ...common, state };
  const boundState = INTAKE_STATES.find(
    (candidate): candidate is BoundIntakeState => candidate !== "draft" && candidate === state,
  );
  if (boundState === undefined) throw new TypeError("intake.state is invalid");
  const bound = {
    ...common,
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, "intake.projectSessionId"),
    coordinationRunId: parseIdentifier<"CoordinationRunId">(
      record.coordinationRunId,
      "intake.coordinationRunId",
    ),
    state: boundState,
    ...(record.chairRequestSeed === undefined
      ? {}
      : { chairRequestSeed: parseChairRequestSeed(record.chairRequestSeed) }),
  };
  if (boundState === "accepted") {
    return { ...bound, state: boundState, acceptedScopeRef: parseArtifactRef(record.acceptedScopeRef, "intake.acceptedScopeRef") };
  }
  return { ...bound, state: boundState };
}

export function parseIntakeDraftCreateRequest(value: unknown): IntakeDraftCreateRequest {
  const record = strictRecord(value, "intakeDraftCreate", [
    "command",
    "intakeId",
    "dedupeKey",
    "summary",
    "artifactRefs",
    "gateIds",
  ]);
  const command = parseOperatorMutationContext(record.command, "intakeDraftCreate.command");
  if (command.expectedRevision !== 0) {
    throw new TypeError("intakeDraftCreate command must expect revision 0");
  }
  return {
    command,
    intakeId: parseIdentifier<"IntakeId">(record.intakeId, "intakeDraftCreate.intakeId"),
    dedupeKey: requiredString(record.dedupeKey, "intakeDraftCreate.dedupeKey"),
    summary: requiredString(record.summary, "intakeDraftCreate.summary"),
    artifactRefs: parseArtifactRefs(record.artifactRefs, "intakeDraftCreate.artifactRefs"),
    gateIds: parseGateIds(record.gateIds, "intakeDraftCreate.gateIds"),
  };
}

export function parseIntakeReadRequest(value: unknown): IntakeReadRequest {
  const record = strictRecord(value, "intakeRead", ["credential", "intakeId"]);
  const credential = strictRecord(record.credential, "intakeRead.credential", ["capabilityId", "token"]);
  return {
    credential: {
      capabilityId: parseIdentifier<"CapabilityId">(credential.capabilityId, "intakeRead.credential.capabilityId"),
      token: requiredString(credential.token, "intakeRead.credential.token"),
    },
    intakeId: parseIdentifier<"IntakeId">(record.intakeId, "intakeRead.intakeId"),
  };
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function assertChairRequestBinding(options: {
  path: string;
  chairRequest: TaskRequest;
  intakeId: IntakeId;
  intakeRevision: number;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  artifactRefs: readonly ArtifactRef[];
  gateIds: readonly GateId[];
}): NonNullable<TaskRequest["request"]["intakeBinding"]> {
  const binding = options.chairRequest.request.intakeBinding;
  if (binding === undefined) throw new TypeError(`${options.path} intake binding is required`);
  if (binding.intakeId !== options.intakeId || binding.intakeRevision !== options.intakeRevision) {
    throw new TypeError(`${options.path} intake revision does not match`);
  }
  if (!sameOrderedStrings(binding.gateIds, options.gateIds)) {
    throw new TypeError(`${options.path} gate IDs do not match`);
  }
  if (!sameOrderedStrings(binding.artifactDigests, options.artifactRefs.map((artifact) => artifact.digest))) {
    throw new TypeError(`${options.path} artifact digests do not match`);
  }
  if (options.chairRequest.projectSessionId !== options.projectSessionId) {
    throw new TypeError(`${options.path} project session does not match`);
  }
  if (options.chairRequest.coordinationRunId !== options.coordinationRunId) {
    throw new TypeError(`${options.path} coordination run does not match`);
  }
  return binding;
}

export function parseIntakeSubmission(value: unknown): IntakeSubmission {
  const record = strictRecord(value, "intakeSubmission", [
    "command",
    "intakeId",
    "expectedRevision",
    "projectSessionId",
    "coordinationRunId",
    "summary",
    "artifactRefs",
    "gateIds",
    "chairRequest",
  ]);
  const command = parseOperatorMutationContext(record.command, "intakeSubmission.command");
  const expectedRevision = safeInteger(record.expectedRevision, "intakeSubmission.expectedRevision", 1);
  if (command.expectedRevision !== expectedRevision) {
    throw new TypeError("intakeSubmission operator command revision does not match");
  }
  const intakeId = parseIdentifier<"IntakeId">(record.intakeId, "intakeSubmission.intakeId");
  const projectSessionId = parseIdentifier<"ProjectSessionId">(
    record.projectSessionId,
    "intakeSubmission.projectSessionId",
  );
  const coordinationRunId = parseIdentifier<"CoordinationRunId">(
    record.coordinationRunId,
    "intakeSubmission.coordinationRunId",
  );
  const artifactRefs = parseArtifactRefs(record.artifactRefs, "intakeSubmission.artifactRefs");
  const gateIds = parseGateIds(record.gateIds, "intakeSubmission.gateIds");
  const chairRequest = parseTaskRequest(record.chairRequest);
  const binding = assertChairRequestBinding({
    path: "intakeSubmission.chairRequest",
    chairRequest,
    intakeId,
    intakeRevision: expectedRevision + 1,
    projectSessionId,
    coordinationRunId,
    artifactRefs,
    gateIds,
  });
  return {
    command,
    intakeId,
    expectedRevision,
    projectSessionId,
    coordinationRunId,
    summary: requiredString(record.summary, "intakeSubmission.summary"),
    artifactRefs,
    gateIds,
    chairRequest: { ...chairRequest, request: { ...chairRequest.request, intakeBinding: binding } },
  };
}

export function parseIntakeRevisionRequest(value: unknown): IntakeRevisionRequest {
  const record = strictRecord(value, "intakeRevision", [
    "origin",
    "command",
    "intakeId",
    "projectSessionId",
    "coordinationRunId",
    "expectedRevision",
    "state",
    "summary",
    "artifactRefs",
    "gateIds",
    "chairRequest",
    "acceptedScopeRef",
  ]);
  const state = INTAKE_STATES.find(
    (candidate): candidate is BoundIntakeState => candidate !== "draft" && candidate === record.state,
  );
  if (state === undefined) throw new TypeError("intakeRevision.state must be a session-bound state");
  const acceptedScopeRef = record.acceptedScopeRef === undefined
    ? undefined
    : parseArtifactRef(record.acceptedScopeRef, "intakeRevision.acceptedScopeRef");
  if (state === "accepted") {
    if (acceptedScopeRef === undefined) throw new TypeError("intakeRevision.acceptedScopeRef is required when accepted");
  } else if (acceptedScopeRef !== undefined) {
    throw new TypeError("intakeRevision.acceptedScopeRef is forbidden unless accepted");
  }
  const artifactRefs = parseArtifactRefs(record.artifactRefs, "intakeRevision.artifactRefs");
  if (acceptedScopeRef !== undefined) {
    const occurrences = artifactRefs.filter(
      (artifact) => artifact.path === acceptedScopeRef.path && artifact.digest === acceptedScopeRef.digest,
    ).length;
    if (occurrences !== 1) throw new TypeError("intakeRevision.acceptedScopeRef must occur exactly once in artifactRefs");
  }
  const revisionBase = {
    intakeId: parseIdentifier<"IntakeId">(record.intakeId, "intakeRevision.intakeId"),
    projectSessionId: parseIdentifier<"ProjectSessionId">(
      record.projectSessionId,
      "intakeRevision.projectSessionId",
    ),
    coordinationRunId: parseIdentifier<"CoordinationRunId">(
      record.coordinationRunId,
      "intakeRevision.coordinationRunId",
    ),
    expectedRevision: safeInteger(record.expectedRevision, "intakeRevision.expectedRevision", 1),
    summary: requiredString(record.summary, "intakeRevision.summary"),
    artifactRefs,
    gateIds: parseGateIds(record.gateIds, "intakeRevision.gateIds"),
    ...(record.chairRequest === undefined ? {} : { chairRequest: parseTaskRequest(record.chairRequest) }),
  };
  const revision: IntakeRevision = state === "accepted"
    ? { ...revisionBase, state, acceptedScopeRef: acceptedScopeRef as ArtifactRef }
    : { ...revisionBase, state };
  if (revision.chairRequest !== undefined) {
    assertChairRequestBinding({
      path: "intakeRevision.chairRequest",
      chairRequest: revision.chairRequest,
      intakeId: revision.intakeId,
      intakeRevision: revision.expectedRevision + 1,
      projectSessionId: revision.projectSessionId,
      coordinationRunId: revision.coordinationRunId,
      artifactRefs: revision.artifactRefs,
      gateIds: revision.gateIds,
    });
  }
  if (record.origin === "operator") {
    const command = parseOperatorMutationContext(record.command, "intakeRevision.command");
    if (command.expectedRevision !== revision.expectedRevision) {
      throw new TypeError("intakeRevision operator command revision does not match");
    }
    return { ...revision, origin: "operator", command };
  }
  if (record.origin === "chair") {
    const command = parseChairMutationContext(record.command, "intakeRevision.command");
    if (command.expectedRevision !== revision.expectedRevision) {
      throw new TypeError("intakeRevision chair command revision does not match");
    }
    if (
      command.projectSessionId !== revision.projectSessionId ||
      command.coordinationRunId !== revision.coordinationRunId
    ) {
      throw new TypeError("intakeRevision chair command session or run does not match intake");
    }
    return { ...revision, origin: "chair", command };
  }
  throw new TypeError("intakeRevision.origin must be operator or chair");
}

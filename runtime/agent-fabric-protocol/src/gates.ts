import { isActiveFabricOperation, type FabricOperation } from "./operations.js";
import {
  parseChairMutationContext,
  parseOperatorMutationContext,
  type ChairMutationContext,
  type OperatorCapabilityCredential,
  type OperatorMutationContext,
} from "./operator.js";
import {
  oneOf,
  parseArtifactRef,
  parseIdentifier,
  parseSha256Digest,
  parseTimestamp,
  requiredString,
  safeInteger,
  strictRecord,
  stringArray,
  type ArtifactRef,
  type BarrierId,
  type CommandId,
  type CoordinationRunId,
  type GateId,
  type InputAttestationId,
  type OperatorId,
  type ProjectId,
  type ProjectSessionId,
  type Sha256Digest,
  type TaskId,
  type Timestamp,
} from "./primitives.js";

export const GATE_ENFORCEMENT_POINTS = ["task-readiness", "operation", "scoped-barrier"] as const;
export type GateEnforcementPoint = (typeof GATE_ENFORCEMENT_POINTS)[number];

export type GateScope =
  | { kind: "task"; taskId: TaskId }
  | { kind: "subtree"; rootTaskId: TaskId }
  | { kind: "run" }
  | { kind: "release" };

export type ReleaseBinding = {
  acceptedDeliveryReceiptRef: ArtifactRef;
  artifactDigest: Sha256Digest;
  promotionAction: string;
  target: string;
};

type ScopedGateBase = {
  gateId: GateId;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  scope: GateScope;
  affectedTaskIds: readonly TaskId[];
  dependencyRevision: number;
  blockedOperationIds: readonly FabricOperation[];
  enforcementPoints: readonly GateEnforcementPoint[];
  question: string;
  reason: string;
  options: readonly string[];
  recommendation: string;
  consequences: readonly string[];
  evidenceRefs: readonly ArtifactRef[];
  revision: number;
  createdByRef: string;
  expectedApproverRef: string;
  deadline?: Timestamp;
  default?: string;
};

export type GateResolution = {
  operatorId: OperatorId;
  decidedAt: Timestamp;
  evidenceRefs: readonly ArtifactRef[];
} & (
  | { kind: "typed-console"; confirmationCommandId: CommandId }
  | {
      kind: "attested-input";
      attestationId: InputAttestationId;
      integrationId: string;
      integrationGeneration: number;
    }
);

export type ScopedGate =
  | (ScopedGateBase & { status: "pending" | "deferred"; releaseBinding?: ReleaseBinding })
  | (ScopedGateBase & {
      status: "approved" | "rejected" | "cancelled" | "superseded";
      resolution: GateResolution;
      releaseBinding?: ReleaseBinding;
    });

export type ScopedGateIntent = {
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  dedupeKey: string;
  scope: GateScope;
  blockedOperationIds: readonly FabricOperation[];
  enforcementPoints: readonly GateEnforcementPoint[];
  question: string;
  reason: string;
  options: readonly string[];
  recommendation: string;
  consequences: readonly string[];
  evidenceRefs: readonly ArtifactRef[];
  deadline?: Timestamp;
  default?: string;
  releaseBinding?: ReleaseBinding;
};

export type ScopedGateCreateRequest = {
  intent: ScopedGateIntent;
} & (
  | { origin: "operator"; command: OperatorMutationContext }
  | { origin: "chair"; command: ChairMutationContext }
);
export type ScopedGateResolveRequest = {
  command: OperatorMutationContext;
  gateId: GateId;
  status: "approved" | "rejected" | "deferred" | "cancelled";
  decisionEvidence:
    | { kind: "typed-console"; confirmationCommandId: CommandId }
    | {
        kind: "attested-input";
        attestationId: InputAttestationId;
        expectedIntegrationGeneration: number;
      };
};
type ScopedGateCheckBase = {
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  dependencyRevision: number;
};
export type GateOperationTarget =
  | { kind: "run" }
  | { kind: "task"; taskId: TaskId };
export type ScopedGateCheckRequest = ScopedGateCheckBase & (
  | { enforcementPoint: "task-readiness"; taskId: TaskId }
  | { enforcementPoint: "operation"; operationId: FabricOperation; operationTarget: GateOperationTarget }
  | { enforcementPoint: "scoped-barrier"; barrierId: BarrierId }
);
export type ScopedGateCheckResult =
  | { allowed: true; checkedGateRevisions: Readonly<Record<string, number>> }
  | { allowed: false; blockingGateIds: readonly GateId[]; checkedGateRevisions: Readonly<Record<string, number>> };

export type ScopedGateReadRequest = {
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  gateId: GateId;
  expectedRevision?: number;
};

export type ScopedGateReadResult =
  | {
      status: "current";
      gate: ScopedGate;
      readTransactionId: string;
      stateDigest: Sha256Digest;
    }
  | {
      status: "changed";
      expectedRevision: number;
      gate: ScopedGate;
      readTransactionId: string;
      stateDigest: Sha256Digest;
    };

export function parseScopedGateCreateRequest(value: unknown): ScopedGateCreateRequest {
  const record = strictRecord(value, "scopedGateCreate", ["origin", "command", "intent"]);
  const intentRecord = strictRecord(record.intent, "scopedGateCreate.intent", [
    "projectSessionId",
    "coordinationRunId",
    "dedupeKey",
    "scope",
    "blockedOperationIds",
    "enforcementPoints",
    "question",
    "reason",
    "options",
    "recommendation",
    "consequences",
    "evidenceRefs",
    "deadline",
    "default",
    "releaseBinding",
  ]);
  const scope = parseScope(intentRecord.scope);
  const { blockedOperationIds, enforcementPoints } = parseEnforcementTargets(
    intentRecord.blockedOperationIds,
    intentRecord.enforcementPoints,
    "scopedGateCreate.intent",
  );
  if (!Array.isArray(intentRecord.evidenceRefs)) {
    throw new TypeError("scopedGateCreate.intent.evidenceRefs must be an array");
  }
  const releaseBinding = scope.kind === "release"
    ? parseReleaseBinding(intentRecord.releaseBinding)
    : intentRecord.releaseBinding === undefined
      ? undefined
      : (() => { throw new TypeError("scopedGateCreate.intent.releaseBinding is forbidden outside release scope"); })();
  const parsedIntent = {
    projectSessionId: parseIdentifier<"ProjectSessionId">(
      intentRecord.projectSessionId,
      "scopedGateCreate.intent.projectSessionId",
    ),
    coordinationRunId: parseIdentifier<"CoordinationRunId">(
      intentRecord.coordinationRunId,
      "scopedGateCreate.intent.coordinationRunId",
    ),
    dedupeKey: requiredString(intentRecord.dedupeKey, "scopedGateCreate.intent.dedupeKey"),
    scope,
    blockedOperationIds,
    enforcementPoints,
    question: requiredString(intentRecord.question, "scopedGateCreate.intent.question"),
    reason: requiredString(intentRecord.reason, "scopedGateCreate.intent.reason"),
    options: stringArray(intentRecord.options, "scopedGateCreate.intent.options", 1),
    recommendation: typeof intentRecord.recommendation === "string" ? intentRecord.recommendation : "",
    consequences: stringArray(intentRecord.consequences, "scopedGateCreate.intent.consequences"),
    evidenceRefs: intentRecord.evidenceRefs.map((entry, index) => parseArtifactRef(
      entry,
      `scopedGateCreate.intent.evidenceRefs[${String(index)}]`,
    )),
    ...(intentRecord.deadline === undefined
      ? {}
      : { deadline: parseTimestamp(intentRecord.deadline, "scopedGateCreate.intent.deadline") }),
    ...(intentRecord.default === undefined
      ? {}
      : { default: requiredString(intentRecord.default, "scopedGateCreate.intent.default") }),
    ...(releaseBinding === undefined ? {} : { releaseBinding }),
  };
  if (record.origin === "operator") {
    return {
      origin: "operator",
      command: parseOperatorMutationContext(record.command, "scopedGateCreate.command"),
      intent: parsedIntent,
    };
  }
  if (record.origin === "chair") {
    return {
      origin: "chair",
      command: parseChairMutationContext(record.command, "scopedGateCreate.command"),
      intent: parsedIntent,
    };
  }
  throw new TypeError("scopedGateCreate.origin must be operator or chair");
}

export function parseScopedGateResolveRequest(value: unknown): ScopedGateResolveRequest {
  const record = strictRecord(value, "scopedGateResolve", ["command", "gateId", "status", "decisionEvidence"]);
  const status = oneOf(record.status, ["approved", "rejected", "deferred", "cancelled"] as const, "scopedGateResolve.status");
  if (typeof record.decisionEvidence !== "object" || record.decisionEvidence === null || Array.isArray(record.decisionEvidence)) {
    throw new TypeError("scopedGateResolve.decisionEvidence must be an object");
  }
  const kind: unknown = Reflect.get(record.decisionEvidence, "kind");
  if (kind === "typed-console") {
    const evidence = strictRecord(record.decisionEvidence, "scopedGateResolve.decisionEvidence", [
      "kind",
      "confirmationCommandId",
    ]);
    if (evidence.confirmationCommandId === undefined) {
      throw new TypeError("scopedGateResolve.decisionEvidence.confirmationCommandId is required");
    }
    return {
      command: parseOperatorMutationContext(record.command, "scopedGateResolve.command"),
      gateId: parseIdentifier<"GateId">(record.gateId, "scopedGateResolve.gateId"),
      status,
      decisionEvidence: {
        kind,
        confirmationCommandId: parseIdentifier<"CommandId">(
          evidence.confirmationCommandId,
          "scopedGateResolve.decisionEvidence.confirmationCommandId",
        ) as CommandId,
      },
    };
  }
  if (kind === "attested-input") {
    const evidence = strictRecord(record.decisionEvidence, "scopedGateResolve.decisionEvidence", [
      "kind",
      "attestationId",
      "expectedIntegrationGeneration",
    ]);
    return {
      command: parseOperatorMutationContext(record.command, "scopedGateResolve.command"),
      gateId: parseIdentifier<"GateId">(record.gateId, "scopedGateResolve.gateId"),
      status,
      decisionEvidence: {
        kind,
        attestationId: parseIdentifier<"InputAttestationId">(
          evidence.attestationId,
          "scopedGateResolve.decisionEvidence.attestationId",
        ),
        expectedIntegrationGeneration: safeInteger(
          evidence.expectedIntegrationGeneration,
          "scopedGateResolve.decisionEvidence.expectedIntegrationGeneration",
          1,
        ),
      },
    };
  }
  throw new TypeError("scopedGateResolve.decisionEvidence.kind is invalid");
}

export function parseScopedGateCheckRequest(value: unknown): ScopedGateCheckRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("scopedGateCheck must be an object");
  }
  const enforcementPoint: unknown = Reflect.get(value, "enforcementPoint");
  const targetField = enforcementPoint === "task-readiness"
    ? "taskId"
    : enforcementPoint === "operation"
      ? "operationId"
      : enforcementPoint === "scoped-barrier"
        ? "barrierId"
        : undefined;
  const record = strictRecord(value, "scopedGateCheck", [
    "projectSessionId",
    "coordinationRunId",
    "dependencyRevision",
    "enforcementPoint",
    ...(targetField === undefined ? [] : [targetField]),
    ...(enforcementPoint === "operation" ? ["operationTarget"] : []),
  ]);
  const base: ScopedGateCheckBase = {
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, "scopedGateCheck.projectSessionId"),
    coordinationRunId: parseIdentifier<"CoordinationRunId">(
      record.coordinationRunId,
      "scopedGateCheck.coordinationRunId",
    ),
    dependencyRevision: safeInteger(record.dependencyRevision, "scopedGateCheck.dependencyRevision", 1),
  };
  if (enforcementPoint === "task-readiness") {
    if (record.taskId === undefined) throw new TypeError("scopedGateCheck.taskId is required");
    return {
      ...base,
      enforcementPoint,
      taskId: parseIdentifier<"TaskId">(record.taskId, "scopedGateCheck.taskId"),
    };
  }
  if (enforcementPoint === "operation") {
    if (record.operationId === undefined) throw new TypeError("scopedGateCheck.operationId is required");
    if (record.operationTarget === undefined) throw new TypeError("scopedGateCheck.operationTarget is required");
    if (typeof record.operationId !== "string" || !isActiveFabricOperation(record.operationId)) {
      throw new TypeError("scopedGateCheck.operationId is not a protocol operation");
    }
    return {
      ...base,
      enforcementPoint,
      operationId: record.operationId,
      operationTarget: parseGateOperationTarget(record.operationTarget),
    };
  }
  if (enforcementPoint === "scoped-barrier") {
    if (record.barrierId === undefined) throw new TypeError("scopedGateCheck.barrierId is required");
    return {
      ...base,
      enforcementPoint,
      barrierId: parseIdentifier<"BarrierId">(record.barrierId, "scopedGateCheck.barrierId"),
    };
  }
  throw new TypeError("scopedGateCheck.enforcementPoint is invalid");
}

function parseGateOperationTarget(value: unknown): GateOperationTarget {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("scopedGateCheck.operationTarget must be an object");
  }
  const kind: unknown = Reflect.get(value, "kind");
  if (kind === "run") {
    strictRecord(value, "scopedGateCheck.operationTarget", ["kind"]);
    return { kind };
  }
  if (kind === "task") {
    const record = strictRecord(value, "scopedGateCheck.operationTarget", ["kind", "taskId"]);
    return {
      kind,
      taskId: parseIdentifier<"TaskId">(record.taskId, "scopedGateCheck.operationTarget.taskId"),
    };
  }
  throw new TypeError("scopedGateCheck.operationTarget.kind is invalid");
}

function parseScope(value: unknown): GateScope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("scopedGate.scope must be an object");
  const kind: unknown = Reflect.get(value, "kind");
  if (kind === "task") {
    const record = strictRecord(value, "scopedGate.scope", ["kind", "taskId"]);
    return { kind, taskId: parseIdentifier<"TaskId">(record.taskId, "scopedGate.scope.taskId") };
  }
  if (kind === "subtree") {
    const record = strictRecord(value, "scopedGate.scope", ["kind", "rootTaskId"]);
    return { kind, rootTaskId: parseIdentifier<"TaskId">(record.rootTaskId, "scopedGate.scope.rootTaskId") };
  }
  if (kind === "run" || kind === "release") {
    strictRecord(value, "scopedGate.scope", ["kind"]);
    return { kind };
  }
  throw new TypeError("scopedGate.scope.kind is invalid");
}

export function parseReleaseBinding(value: unknown): ReleaseBinding {
  if (value === undefined) throw new TypeError("scopedGate.releaseBinding is required for release scope");
  const record = strictRecord(value, "scopedGate.releaseBinding", [
    "acceptedDeliveryReceiptRef",
    "artifactDigest",
    "promotionAction",
    "target",
  ]);
  return {
    acceptedDeliveryReceiptRef: parseArtifactRef(
      record.acceptedDeliveryReceiptRef,
      "scopedGate.releaseBinding.acceptedDeliveryReceiptRef",
    ),
    artifactDigest: parseSha256Digest(record.artifactDigest, "scopedGate.releaseBinding.artifactDigest"),
    promotionAction: requiredString(record.promotionAction, "scopedGate.releaseBinding.promotionAction"),
    target: requiredString(record.target, "scopedGate.releaseBinding.target"),
  };
}

function parseEnforcementTargets(
  blockedValue: unknown,
  enforcementValue: unknown,
  path: string,
): { blockedOperationIds: FabricOperation[]; enforcementPoints: GateEnforcementPoint[] } {
  if (!Array.isArray(blockedValue)) throw new TypeError(`${path}.blockedOperationIds must be an array`);
  const blockedOperationIds = blockedValue.map((operation, index) => {
    if (typeof operation !== "string" || !isActiveFabricOperation(operation)) {
      throw new TypeError(`${path}.blockedOperationIds[${String(index)}] is not an active protocol operation`);
    }
    return operation;
  });
  if (new Set(blockedOperationIds).size !== blockedOperationIds.length) {
    throw new TypeError(`${path}.blockedOperationIds must not contain duplicates`);
  }
  if (!Array.isArray(enforcementValue) || enforcementValue.length === 0) {
    throw new TypeError(`${path}.enforcementPoints must be non-empty`);
  }
  const enforcementPoints = enforcementValue.map((point, index) => {
    const match = GATE_ENFORCEMENT_POINTS.find((candidate) => candidate === point);
    if (match === undefined) throw new TypeError(`${path}.enforcementPoints[${String(index)}] is invalid`);
    return match;
  });
  if (new Set(enforcementPoints).size !== enforcementPoints.length) {
    throw new TypeError(`${path}.enforcementPoints must not contain duplicates`);
  }
  if (enforcementPoints.includes("operation") && blockedOperationIds.length === 0) {
    throw new TypeError(`${path}.blockedOperationIds must be non-empty for operation enforcement`);
  }
  if (!enforcementPoints.includes("operation") && blockedOperationIds.length > 0) {
    throw new TypeError(`${path}.blockedOperationIds require the operation enforcement point`);
  }
  return { blockedOperationIds, enforcementPoints };
}

function parseResolution(value: unknown): GateResolution {
  if (value === undefined) throw new TypeError("scopedGate.resolution is required for resolved status");
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("scopedGate.resolution must be an object");
  }
  const kind: unknown = Reflect.get(value, "kind");
  const fields = kind === "typed-console"
    ? ["kind", "operatorId", "confirmationCommandId", "decidedAt", "evidenceRefs"]
    : kind === "attested-input"
      ? ["kind", "operatorId", "attestationId", "integrationId", "integrationGeneration", "decidedAt", "evidenceRefs"]
      : ["kind"];
  const record = strictRecord(value, "scopedGate.resolution", fields);
  if (!Array.isArray(record.evidenceRefs)) throw new TypeError("scopedGate.resolution.evidenceRefs must be an array");
  const base = {
    operatorId: parseIdentifier<"OperatorId">(record.operatorId, "scopedGate.resolution.operatorId"),
    decidedAt: parseTimestamp(record.decidedAt, "scopedGate.resolution.decidedAt"),
    evidenceRefs: record.evidenceRefs.map((entry, index) => parseArtifactRef(
      entry,
      `scopedGate.resolution.evidenceRefs[${String(index)}]`,
    )),
  };
  if (kind === "typed-console") {
    return {
      ...base,
      kind,
      confirmationCommandId: parseIdentifier<"CommandId">(
        record.confirmationCommandId,
        "scopedGate.resolution.confirmationCommandId",
      ) as CommandId,
    };
  }
  if (kind === "attested-input") {
    return {
      ...base,
      kind,
      attestationId: parseIdentifier<"InputAttestationId">(
        record.attestationId,
        "scopedGate.resolution.attestationId",
      ),
      integrationId: requiredString(record.integrationId, "scopedGate.resolution.integrationId"),
      integrationGeneration: safeInteger(
        record.integrationGeneration,
        "scopedGate.resolution.integrationGeneration",
        1,
      ),
    };
  }
  throw new TypeError("scopedGate.resolution.kind is invalid");
}

export function parseScopedGate(value: unknown): ScopedGate {
  const record = strictRecord(value, "scopedGate", [
    "gateId",
    "projectSessionId",
    "coordinationRunId",
    "scope",
    "affectedTaskIds",
    "dependencyRevision",
    "blockedOperationIds",
    "enforcementPoints",
    "question",
    "reason",
    "options",
    "recommendation",
    "consequences",
    "evidenceRefs",
    "revision",
    "createdByRef",
    "expectedApproverRef",
    "deadline",
    "default",
    "status",
    "resolution",
    "releaseBinding",
  ]);
  const scope = parseScope(record.scope);
  if (!Array.isArray(record.affectedTaskIds)) throw new TypeError("scopedGate.affectedTaskIds must be an array");
  const { blockedOperationIds, enforcementPoints } = parseEnforcementTargets(
    record.blockedOperationIds,
    record.enforcementPoints,
    "scopedGate",
  );
  if (!Array.isArray(record.evidenceRefs)) throw new TypeError("scopedGate.evidenceRefs must be an array");
  const base: ScopedGateBase = {
    gateId: parseIdentifier<"GateId">(record.gateId, "scopedGate.gateId"),
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, "scopedGate.projectSessionId"),
    coordinationRunId: parseIdentifier<"CoordinationRunId">(
      record.coordinationRunId,
      "scopedGate.coordinationRunId",
    ),
    scope,
    affectedTaskIds: record.affectedTaskIds.map((taskId, index) => parseIdentifier<"TaskId">(
      taskId,
      `scopedGate.affectedTaskIds[${String(index)}]`,
    )),
    dependencyRevision: safeInteger(record.dependencyRevision, "scopedGate.dependencyRevision"),
    blockedOperationIds,
    enforcementPoints,
    question: requiredString(record.question, "scopedGate.question"),
    reason: requiredString(record.reason, "scopedGate.reason"),
    options: stringArray(record.options, "scopedGate.options", 1),
    recommendation: typeof record.recommendation === "string" ? record.recommendation : "",
    consequences: stringArray(record.consequences, "scopedGate.consequences"),
    evidenceRefs: record.evidenceRefs.map((entry, index) => parseArtifactRef(entry, `scopedGate.evidenceRefs[${String(index)}]`)),
    revision: safeInteger(record.revision, "scopedGate.revision", 1),
    createdByRef: requiredString(record.createdByRef, "scopedGate.createdByRef"),
    expectedApproverRef: requiredString(record.expectedApproverRef, "scopedGate.expectedApproverRef"),
    ...(record.deadline === undefined ? {} : { deadline: parseTimestamp(record.deadline, "scopedGate.deadline") }),
    ...(record.default === undefined ? {} : { default: requiredString(record.default, "scopedGate.default") }),
  };
  const releaseBinding = scope.kind === "release"
    ? parseReleaseBinding(record.releaseBinding)
    : record.releaseBinding === undefined
      ? undefined
      : (() => { throw new TypeError("scopedGate.releaseBinding is forbidden outside release scope"); })();
  const status = record.status;
  if (status === "pending" || status === "deferred") {
    if (record.resolution !== undefined) throw new TypeError("scopedGate.resolution is forbidden for unresolved status");
    return { ...base, status, ...(releaseBinding === undefined ? {} : { releaseBinding }) };
  }
  if (status === "approved" || status === "rejected" || status === "cancelled" || status === "superseded") {
    return { ...base, status, resolution: parseResolution(record.resolution), ...(releaseBinding === undefined ? {} : { releaseBinding }) };
  }
  throw new TypeError("scopedGate.status is invalid");
}

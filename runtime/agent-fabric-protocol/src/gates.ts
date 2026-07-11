import { isFabricOperation, type FabricOperation } from "./operations.js";
import {
  parseArtifactRef,
  parseIdentifier,
  parseSha256Digest,
  parseTimestamp,
  requiredString,
  safeInteger,
  strictRecord,
  stringArray,
  type ArtifactRef,
  type CoordinationRunId,
  type GateId,
  type OperatorId,
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
  attestationId: string;
  decidedAt: Timestamp;
  evidenceRefs: readonly ArtifactRef[];
};

export type ScopedGate =
  | (ScopedGateBase & { status: "pending" | "deferred"; releaseBinding?: ReleaseBinding })
  | (ScopedGateBase & {
      status: "approved" | "rejected" | "cancelled" | "superseded";
      resolution: GateResolution;
      releaseBinding?: ReleaseBinding;
    });

export type ScopedGateCreateRequest = { gate: ScopedGate & { status: "pending" } };
export type ScopedGateRebindRequest = {
  gateId: GateId;
  expectedRevision: number;
  expectedDependencyRevision: number;
  newDependencyRevision: number;
  affectedTaskIds: readonly TaskId[];
};
export type ScopedGateResolveRequest = {
  gateId: GateId;
  expectedRevision: number;
  status: "approved" | "rejected" | "deferred" | "cancelled";
  resolution: GateResolution;
};
export type ScopedGateCheckRequest = {
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  taskId?: TaskId;
  operationId?: FabricOperation;
  enforcementPoint: GateEnforcementPoint;
  dependencyRevision: number;
};
export type ScopedGateCheckResult =
  | { allowed: true; checkedGateRevisions: Readonly<Record<string, number>> }
  | { allowed: false; blockingGateIds: readonly GateId[]; checkedGateRevisions: Readonly<Record<string, number>> };

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

function parseReleaseBinding(value: unknown): ReleaseBinding {
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

function parseResolution(value: unknown): GateResolution {
  if (value === undefined) throw new TypeError("scopedGate.resolution is required for resolved status");
  const record = strictRecord(value, "scopedGate.resolution", ["operatorId", "attestationId", "decidedAt", "evidenceRefs"]);
  if (!Array.isArray(record.evidenceRefs)) throw new TypeError("scopedGate.resolution.evidenceRefs must be an array");
  return {
    operatorId: parseIdentifier<"OperatorId">(record.operatorId, "scopedGate.resolution.operatorId"),
    attestationId: requiredString(record.attestationId, "scopedGate.resolution.attestationId"),
    decidedAt: parseTimestamp(record.decidedAt, "scopedGate.resolution.decidedAt"),
    evidenceRefs: record.evidenceRefs.map((entry, index) => parseArtifactRef(
      entry,
      `scopedGate.resolution.evidenceRefs[${String(index)}]`,
    )),
  };
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
  if (!Array.isArray(record.blockedOperationIds)) throw new TypeError("scopedGate.blockedOperationIds must be an array");
  const blockedOperationIds = record.blockedOperationIds.map((operation, index) => {
    if (typeof operation !== "string" || !isFabricOperation(operation)) {
      throw new TypeError(`scopedGate.blockedOperationIds[${String(index)}] is not a protocol operation`);
    }
    return operation;
  });
  if (!Array.isArray(record.enforcementPoints)) throw new TypeError("scopedGate.enforcementPoints must be an array");
  const enforcementPoints = record.enforcementPoints.map((point, index) => {
    const match = GATE_ENFORCEMENT_POINTS.find((candidate) => candidate === point);
    if (match === undefined) throw new TypeError(`scopedGate.enforcementPoints[${String(index)}] is invalid`);
    return match;
  });
  if (new Set(enforcementPoints).size !== enforcementPoints.length) {
    throw new TypeError("scopedGate.enforcementPoints must not contain duplicates");
  }
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

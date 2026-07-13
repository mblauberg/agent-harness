import {
  arrayOf,
  boundedString,
  defineCodec,
  enumeration,
  integer,
  literal,
  nullable,
  objectCodec,
  parserBacked,
  sha256,
  timestamp,
  unionOf,
  type CodecOutput,
} from "./codec.js";
import { PROVIDER_ACTION_REF_V1_CODEC } from "./launch.js";
import {
  DISCOVERY_SURFACE_REF_V1_CODEC,
  REGISTERED_EVIDENCE_REF_V1_CODEC,
  RESOLVED_EFFORT_V1_CODEC,
} from "./route-lineage.js";

const positive = integer({ minimum: 1 });
const nonnegative = integer();
const id256 = boundedString({ maxBytes: 256, example: "id_01" });
const nullableId = nullable(id256);
const cursor = nullable(boundedString({ maxBytes: 256, example: "cursor_01" }));

export const TOPOLOGY_WAVE_PLAN_REF_V1_CODEC = objectCodec({
  schemaVersion: literal(1),
  projectSessionId: id256,
  coordinationRunId: id256,
  taskId: id256,
  waveId: id256,
  waveRevision: positive,
  planDigest: sha256,
});

const dependencyCodec = objectCodec({
  dependencyTaskId: id256,
  requiredState: enumeration(["ready", "completed"]),
  evidenceRef: id256,
});
const decomposabilityCodec = objectCodec({
  kind: enumeration(["atomic", "decomposable", "conditionally-decomposable"]),
  evidenceRef: id256,
});
const topologyCodec = objectCodec({
  executionShape: enumeration(["single-owner", "fabric-explicit", "host-native"]),
  mode: enumeration(["serial", "parallel", "fan-out-fan-in", "dynamic"]),
  maximumConcurrentAgents: positive,
});
const chairCodec = objectCodec({
  agentId: id256,
  principalGeneration: positive,
  chairLeaseGeneration: positive,
});
const stageOwnerCodec = objectCodec({
  stageId: id256,
  taskId: id256,
  ownerAgentId: id256,
  writePartitionId: nullableId,
});
const writePartitionCodec = objectCodec({
  partitionId: id256,
  ownerAgentId: id256,
  mode: enumeration(["exclusive-write", "shared-read"]),
  pathSetDigest: sha256,
  authorityRef: id256,
});
const contentionCodec = objectCodec({
  mode: enumeration(["none", "serialized", "disjoint-partitions"]),
  serializationOwnerAgentId: nullableId,
  evidenceRef: id256,
});
const topologyBudgetCodec = objectCodec({
  providerTurns: nonnegative,
  toolCalls: nonnegative,
  wallClockSeconds: nonnegative,
  maximumParallelAgents: positive,
});
const stopConditionCodec = objectCodec({
  conditionId: id256,
  kind: enumeration(["objective-complete", "gate-failed", "budget-exhausted", "human-gate"]),
  predicateRef: id256,
});
const authorityCodec = objectCodec({ authorityRevision: positive, authorityRef: id256, authorityDigest: sha256 });
const policyCodec = objectCodec({ policyRevision: positive, policyRef: id256, policyDigest: sha256 });
const waveState = enumeration(["proposed", "approved", "started", "completed", "superseded", "cancelled"]);

export const TOPOLOGY_WAVE_PLAN_V1_CODEC = objectCodec({
  schemaVersion: literal(1),
  projectSessionId: id256,
  coordinationRunId: id256,
  taskId: id256,
  waveId: id256,
  waveRevision: positive,
  predecessor: nullable(TOPOLOGY_WAVE_PLAN_REF_V1_CODEC),
  dependencies: arrayOf(dependencyCodec, { maximum: 1024, unique: true }),
  decomposability: decomposabilityCodec,
  topology: topologyCodec,
  chair: chairCodec,
  stageOwners: arrayOf(stageOwnerCodec, { minimum: 1, maximum: 1024, unique: true }),
  writePartitions: arrayOf(writePartitionCodec, { maximum: 1024, unique: true }),
  contention: contentionCodec,
  budget: topologyBudgetCodec,
  stopConditions: arrayOf(stopConditionCodec, { minimum: 1, maximum: 256, unique: true }),
  authority: authorityCodec,
  policy: policyCodec,
  state: waveState,
  rationaleRef: id256,
  createdAt: timestamp,
  planDigest: sha256,
});

export const TOPOLOGY_WAVE_PLAN_CURRENT_V1_CODEC = objectCodec({
  schemaVersion: literal(1),
  projectSessionId: id256,
  coordinationRunId: id256,
  taskId: id256,
  waveId: id256,
  waveRevision: positive,
  planDigest: sha256,
  revision: positive,
});

export const TOPOLOGY_WAVE_PLAN_INPUT_V1_CODEC = objectCodec({
  schemaVersion: literal(1),
  taskId: id256,
  waveId: id256,
  dependencies: arrayOf(dependencyCodec, { maximum: 1024, unique: true }),
  decomposability: decomposabilityCodec,
  topology: topologyCodec,
  stageOwners: arrayOf(stageOwnerCodec, { minimum: 1, maximum: 1024, unique: true }),
  writePartitions: arrayOf(writePartitionCodec, { maximum: 1024, unique: true }),
  contention: contentionCodec,
  budget: topologyBudgetCodec,
  stopConditions: arrayOf(stopConditionCodec, { minimum: 1, maximum: 256, unique: true }),
  state: waveState,
  rationaleRef: id256,
});

const expectedCurrentCodec = unionOf([
  objectCodec({ kind: literal("none"), expectedPointerRevision: literal(0) }),
  objectCodec({
    kind: literal("current"),
    planRef: TOPOLOGY_WAVE_PLAN_REF_V1_CODEC,
    expectedPointerRevision: positive,
  }),
]);
export const TOPOLOGY_WAVE_APPEND_REQUEST_V1_CODEC = objectCodec({
  schemaVersion: literal(1),
  commandId: id256,
  projectSessionId: id256,
  coordinationRunId: id256,
  expectedCurrent: expectedCurrentCodec,
  plan: TOPOLOGY_WAVE_PLAN_INPUT_V1_CODEC,
});
const topologyWaveAppendReceiptBaseCodec = objectCodec({
  schemaVersion: literal(1),
  commandId: id256,
  status: literal("appended"),
  priorPlanRef: nullable(TOPOLOGY_WAVE_PLAN_REF_V1_CODEC),
  planRef: TOPOLOGY_WAVE_PLAN_REF_V1_CODEC,
  pointer: TOPOLOGY_WAVE_PLAN_CURRENT_V1_CODEC,
  receiptDigest: sha256,
});
const topologyRefFields = [
  "projectSessionId", "coordinationRunId", "taskId", "waveId", "waveRevision", "planDigest",
] as const;
function assertPlanPointerEquality(
  plan: Readonly<Record<string, unknown>>,
  pointer: Readonly<Record<string, unknown>>,
  path: string,
): void {
  for (const field of topologyRefFields) {
    if (plan[field] !== pointer[field]) throw new TypeError(`${path}.pointer.${field} must equal plan.${field}`);
  }
}
export const TOPOLOGY_WAVE_APPEND_RECEIPT_V1_CODEC = parserBacked(
  defineCodec(
    { ...topologyWaveAppendReceiptBaseCodec.schema, "x-topologyAppendReceiptCorrelated": true },
    topologyWaveAppendReceiptBaseCodec.example,
    (input, path) => topologyWaveAppendReceiptBaseCodec.parse(input, path),
  ),
  (value, path) => {
    const record = value as Readonly<Record<string, unknown>>;
    const prior = record.priorPlanRef as Readonly<Record<string, unknown>> | null;
    const plan = record.planRef as Readonly<Record<string, unknown>>;
    const pointer = record.pointer as Readonly<Record<string, unknown>>;
    assertPlanPointerEquality(plan, pointer, path);
    if (prior === null) {
      if (plan.waveRevision !== 1) throw new TypeError(`${path}.planRef.waveRevision must be one without priorPlanRef`);
    } else {
      for (const field of ["projectSessionId", "coordinationRunId", "taskId"] as const) {
        if (prior[field] !== plan[field]) throw new TypeError(`${path}.priorPlanRef.${field} must equal planRef.${field}`);
      }
      const expectedRevision = prior.waveId === plan.waveId ? Number(prior.waveRevision) + 1 : 1;
      if (plan.waveRevision !== expectedRevision) {
        throw new TypeError(`${path}.planRef.waveRevision must continue its wave or start a new wave at one`);
      }
    }
    return record;
  },
  topologyWaveAppendReceiptBaseCodec.example,
);

export const TOPOLOGY_WAVE_CURRENT_READ_REQUEST_V1_CODEC = objectCodec({
  schemaVersion: literal(1),
  projectSessionId: id256,
  coordinationRunId: id256,
  taskId: id256,
});
const topologyWaveCurrentReadBaseCodec = unionOf([
  objectCodec({
    schemaVersion: literal(1),
    currency: literal("current"),
    plan: TOPOLOGY_WAVE_PLAN_V1_CODEC,
    pointer: TOPOLOGY_WAVE_PLAN_CURRENT_V1_CODEC,
  }),
  objectCodec({
    schemaVersion: literal(1),
    currency: literal("stale"),
    plan: TOPOLOGY_WAVE_PLAN_V1_CODEC,
    pointer: TOPOLOGY_WAVE_PLAN_CURRENT_V1_CODEC,
  }),
  objectCodec({
    schemaVersion: literal(1),
    currency: literal("unavailable"),
    plan: literal(null),
    pointer: literal(null),
  }),
]);
export const TOPOLOGY_WAVE_CURRENT_READ_V1_CODEC = parserBacked(
  defineCodec(
    { ...topologyWaveCurrentReadBaseCodec.schema, "x-topologyCurrentReadCorrelated": true },
    topologyWaveCurrentReadBaseCodec.example,
    (input, path) => topologyWaveCurrentReadBaseCodec.parse(input, path),
  ),
  (value, path) => {
    const record = value as Readonly<Record<string, unknown>>;
    if (record.currency !== "unavailable") {
      assertPlanPointerEquality(
        record.plan as Readonly<Record<string, unknown>>,
        record.pointer as Readonly<Record<string, unknown>>,
        path,
      );
    }
    return record;
  },
  topologyWaveCurrentReadBaseCodec.example,
);
export const TOPOLOGY_WAVE_LIST_REQUEST_V1_CODEC = objectCodec({
  schemaVersion: literal(1),
  projectSessionId: id256,
  coordinationRunId: id256,
  taskId: id256,
  pageSize: integer({ minimum: 1, maximum: 200 }),
  cursor,
});
export const TOPOLOGY_WAVE_LIST_V1_CODEC = objectCodec({
  schemaVersion: literal(1),
  plans: arrayOf(TOPOLOGY_WAVE_PLAN_V1_CODEC, { maximum: 200 }),
  nextCursor: cursor,
  watermarkRevision: nonnegative,
});

export const EVALUATED_ROUTE_IDENTITY_V1_CODEC = objectCodec({
  schemaVersion: literal(1),
  hostId: id256,
  hostVersion: id256,
  adapterId: id256,
  adapterContractDigest: sha256,
  endpointProvider: id256,
  family: id256,
  model: id256,
  resolvedEffort: RESOLVED_EFFORT_V1_CODEC,
  normalizedReasoningEffort: nullable(enumeration(["none", "low", "medium", "high", "xhigh", "max"])),
  rawNativeMode: nullableId,
  orchestrationMode: enumeration(["single", "native-subagents", "dynamic-workflow", "provider-multi-agent"]),
  capabilityBodyDigest: sha256,
  requestedConfigurationDigest: sha256,
  effectiveConfigurationDigest: sha256,
  permissionProfileDigest: sha256,
  discoverySurfaceRef: DISCOVERY_SURFACE_REF_V1_CODEC,
  routePolicyRevision: positive,
  harnessRevision: positive,
  harnessDigest: sha256,
  contextPolicyRevision: positive,
  contextPolicyDigest: sha256,
  topologyWavePlanRef: TOPOLOGY_WAVE_PLAN_REF_V1_CODEC,
});

const trialRouteCodec = objectCodec({
  ordinal: positive,
  actionRef: PROVIDER_ACTION_REF_V1_CODEC,
  deployedRouteAdmissionDigest: sha256,
  deployedRouteObservationDigest: nullable(sha256),
});
const baselineCodec = unionOf([
  objectCodec({ kind: literal("best-single"), evidenceRef: REGISTERED_EVIDENCE_REF_V1_CODEC, absenceReason: literal(null) }),
  objectCodec({ kind: literal("cheapest-acceptable"), evidenceRef: REGISTERED_EVIDENCE_REF_V1_CODEC, absenceReason: literal(null) }),
  objectCodec({ kind: literal("prior-policy"), evidenceRef: REGISTERED_EVIDENCE_REF_V1_CODEC, absenceReason: literal(null) }),
  objectCodec({ kind: literal("simple-single-owner"), evidenceRef: REGISTERED_EVIDENCE_REF_V1_CODEC, absenceReason: literal(null) }),
  objectCodec({ kind: literal("none"), evidenceRef: literal(null), absenceReason: boundedString({ maxBytes: 512, example: "no baseline" }) }),
]);
const routeEvaluationEvidenceBaseCodec = objectCodec({
  schemaVersion: literal(1),
  taskClass: id256,
  evaluatedRouteIdentity: EVALUATED_ROUTE_IDENTITY_V1_CODEC,
  evaluatedRouteIdentityDigest: sha256,
  evaluationPlanRef: REGISTERED_EVIDENCE_REF_V1_CODEC,
  plannedTrialCount: integer({ minimum: 1, maximum: 256 }),
  trialRoutes: arrayOf(trialRouteCodec, { minimum: 1, maximum: 256, unique: true }),
  topologyWavePlanRef: TOPOLOGY_WAVE_PLAN_REF_V1_CODEC,
  harnessRevision: positive,
  harnessDigest: sha256,
  discoverySurfaceRef: DISCOVERY_SURFACE_REF_V1_CODEC,
  routePolicyRevision: positive,
  contextPolicyRevision: positive,
  contextPolicyDigest: sha256,
  datasetDigest: sha256,
  trialCount: positive,
  objectivePassCount: nullable(nonnegative),
  objectiveTrialCount: nullable(positive),
  judgementAggregateRef: nullable(REGISTERED_EVIDENCE_REF_V1_CODEC),
  reliabilityAggregateRef: nullable(REGISTERED_EVIDENCE_REF_V1_CODEC),
  efficiencyAggregateRef: nullable(REGISTERED_EVIDENCE_REF_V1_CODEC),
  baseline: baselineCodec,
  observedAt: timestamp,
  expiresAt: timestamp,
  promotionState: enumeration(["bootstrap", "shadow", "advisory", "canary", "task-class-active", "expired"]),
  evidenceDigest: sha256,
});

export const ROUTE_EVALUATION_EVIDENCE_V1_CODEC = parserBacked(
  defineCodec(
    { ...routeEvaluationEvidenceBaseCodec.schema, "x-routeEvaluationEvidenceCorrelated": true },
    routeEvaluationEvidenceBaseCodec.example,
    (input, path) => routeEvaluationEvidenceBaseCodec.parse(input, path),
  ),
  (value, path) => {
    const record = value as Readonly<Record<string, unknown>>;
    const trials = record.trialRoutes as readonly Readonly<Record<string, unknown>>[];
    if (trials.length !== record.trialCount || trials.length !== record.plannedTrialCount) {
      throw new TypeError(`${path}.trialRoutes length must equal trialCount and plannedTrialCount`);
    }
    trials.forEach((trial, index) => {
      if (trial.ordinal !== index + 1) throw new TypeError(`${path}.trialRoutes ordinals must be contiguous from one`);
    });
    const actionPairs = new Set<string>();
    const admissionDigests = new Set<string>();
    let provedObservationCount = 0;
    for (const trial of trials) {
      const action = trial.actionRef as Readonly<Record<string, unknown>>;
      const actionPair = `${String(action.adapterId)}\u0000${String(action.actionId)}`;
      if (actionPairs.has(actionPair)) throw new TypeError(`${path}.trialRoutes canonical action pairs must be distinct`);
      actionPairs.add(actionPair);
      const admissionDigest = String(trial.deployedRouteAdmissionDigest);
      if (admissionDigests.has(admissionDigest)) throw new TypeError(`${path}.trialRoutes admission digests must be distinct`);
      admissionDigests.add(admissionDigest);
      if (trial.deployedRouteObservationDigest !== null) provedObservationCount += 1;
    }
    const passCount = record.objectivePassCount;
    const objectiveTrialCount = record.objectiveTrialCount;
    if ((passCount === null) !== (objectiveTrialCount === null)) {
      throw new TypeError(`${path}.objectivePassCount and objectiveTrialCount must be null together`);
    }
    if (typeof passCount === "number" && typeof objectiveTrialCount === "number" && passCount > objectiveTrialCount) {
      throw new TypeError(`${path}.objectivePassCount cannot exceed objectiveTrialCount`);
    }
    if (typeof objectiveTrialCount === "number" && objectiveTrialCount > provedObservationCount) {
      throw new TypeError(`${path}.objectiveTrialCount denominator cannot exceed distinct trials with proved observations`);
    }
    const identity = record.evaluatedRouteIdentity as Readonly<Record<string, unknown>>;
    for (const field of ["topologyWavePlanRef", "harnessRevision", "harnessDigest", "discoverySurfaceRef", "routePolicyRevision", "contextPolicyRevision", "contextPolicyDigest"] as const) {
      if (JSON.stringify(record[field]) !== JSON.stringify(identity[field])) {
        throw new TypeError(`${path}.${field} must equality-copy evaluatedRouteIdentity.${field}`);
      }
    }
    return record;
  },
  routeEvaluationEvidenceBaseCodec.example,
);

export type TopologyWavePlanV1 = CodecOutput<typeof TOPOLOGY_WAVE_PLAN_V1_CODEC>;
export type RouteEvaluationEvidenceV1 = CodecOutput<typeof ROUTE_EVALUATION_EVIDENCE_V1_CODEC>;
export type TopologyWaveAppendRequestV1 = CodecOutput<typeof TOPOLOGY_WAVE_APPEND_REQUEST_V1_CODEC>;
export type TopologyWaveAppendReceiptV1 = CodecOutput<typeof TOPOLOGY_WAVE_APPEND_RECEIPT_V1_CODEC>;
export type TopologyWaveCurrentReadRequestV1 = CodecOutput<typeof TOPOLOGY_WAVE_CURRENT_READ_REQUEST_V1_CODEC>;
export type TopologyWaveCurrentReadV1 = CodecOutput<typeof TOPOLOGY_WAVE_CURRENT_READ_V1_CODEC>;
export type TopologyWaveListRequestV1 = CodecOutput<typeof TOPOLOGY_WAVE_LIST_REQUEST_V1_CODEC>;
export type TopologyWaveListV1 = CodecOutput<typeof TOPOLOGY_WAVE_LIST_V1_CODEC>;

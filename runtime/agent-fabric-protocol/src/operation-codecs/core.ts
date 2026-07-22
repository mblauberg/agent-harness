import {
  arrayOf,
  boolean,
  enumeration,
  identifier,
  integer,
  literal,
  nullable,
  objectCodec,
  recordOf,
  relativePath,
  sha256,
  sha256Hex,
  unionOf,
  type Codec,
} from "../codec.js";
import { FABRIC_OPERATIONS } from "../operations.js";
import { budgetUnitKey } from "../resource-unit-keys.js";
import {
  discussionGroupCodec,
  nil,
  nonEmptyNumberRecord,
  nullableNumberRecord,
  numberRecord,
  object,
  positiveInteger,
  recoveryEvidenceCodec,
  rootTaskInputCodec,
  semanticShapeCodec,
  stringList,
  teamLeaderCodec,
  teamMemberCodec,
  text,
  type OperationCodecFragment,
  type OperationCodecPair,
  type OperationShapeFragment,
} from "./common.js";

export const CORE_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.delegateAuthority]: object(["parentAuthorityId", "authority"], ["commandId"]),
  [FABRIC_OPERATIONS.registerAgent]: object(["agentId", "authorityId"], ["providerSessionRef", "adapterId"]),
  [FABRIC_OPERATIONS.spawnAgent]: object(["agentId", "authorityId", "adapterId", "actionId", "payload"]),
  [FABRIC_OPERATIONS.attachAgent]: object(["agentId", "authorityId", "adapterId", "actionId", "providerSessionRef"]),
  [FABRIC_OPERATIONS.createTask]: object(["taskId", "authorityId", "eligibleAgentIds", "objective", "baseRevision", "commandId"], ["proposedOwnerAgentId", "participantAgentIds", "dependencies", "expectedArtifacts", "objectiveChecks"]),
  [FABRIC_OPERATIONS.claimTask]: object(["taskId", "expectedRevision", "commandId"]),
  [FABRIC_OPERATIONS.refreshTaskReadiness]: object(["taskId", "expectedRevision", "commandId"]),
  [FABRIC_OPERATIONS.recordObjectiveCheck]: object(["taskId", "checkId", "status", "evidence", "commandId"]),
  [FABRIC_OPERATIONS.acknowledgeTaskHandoff]: object(["taskId", "taskRevision", "ownerLeaseGeneration", "commandId"]),
  [FABRIC_OPERATIONS.getTask]: object(["taskId"]),
  [FABRIC_OPERATIONS.updateTask]: object(["taskId", "expectedRevision", "state", "commandId"]),
  [FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof]: object(["taskId", "ownerLeaseGeneration", "kind", "detail", "commandId"]),
  [FABRIC_OPERATIONS.recoverTaskOwner]: object(["taskId", "expectedRevision", "expectedOwnerLeaseGeneration", "successorAgentId", "proofId", "commandId"]),
  [FABRIC_OPERATIONS.recordRevocationProof]: object(["leaseId", "generation", "kind", "detail", "commandId"]),
  [FABRIC_OPERATIONS.revokeCapability]: object(["agentId", "commandId"]),
  [FABRIC_OPERATIONS.rotateCapability]: object(["agentId", "expectedPrincipalGeneration", "commandId"]),
  [FABRIC_OPERATIONS.acquireWriteLease]: object(["scope", "ttlMs", "commandId"], ["taskId"]),
  [FABRIC_OPERATIONS.recoverWriteLease]: object(["leaseId", "expectedGeneration", "commandId", "evidence"]),
  [FABRIC_OPERATIONS.renewWriteLease]: object(["leaseId", "expectedGeneration", "ttlMs", "commandId"]),
  [FABRIC_OPERATIONS.getWriteLease]: object(["leaseId"]),
  [FABRIC_OPERATIONS.releaseWriteLease]: object(["leaseId", "expectedGeneration", "commandId"]),
  [FABRIC_OPERATIONS.recordOperatorIntervention]: object(["source", "directInputProvenance", "taskRevision", "summary", "commandId"]),
  [FABRIC_OPERATIONS.recordVisibilityFailure]: object(["kind", "agentId", "commandId"]),
  [FABRIC_OPERATIONS.createTeam]: object(["teamId", "leader", "rootTask", "initialMembers", "discussionGroups", "reservedBudget", "commandId"], ["parentTeamId"]),
  [FABRIC_OPERATIONS.getTeam]: object(["teamId"]),
  [FABRIC_OPERATIONS.freezeSubtree]: object(["teamId", "expectedGeneration", "reason", "commandId"]),
  [FABRIC_OPERATIONS.adoptSubtree]: object(["teamId", "successorAgentId", "expectedGeneration", "handoffEvidence", "commandId"]),
  [FABRIC_OPERATIONS.closeSubtreeBarrier]: object(["teamId", "expectedGeneration", "commandId"]),
  [FABRIC_OPERATIONS.reserveBudget]: object(["teamId", "expectedTeamGeneration", "parentBudgetId", "budgetId", "dimensions", "commandId"]),
  [FABRIC_OPERATIONS.recordBudgetUsage]: object(["budgetId", "usage", "commandId"]),
  [FABRIC_OPERATIONS.reconcileBudgetUsage]: object(["budgetId", "consumed", "commandId"]),
  [FABRIC_OPERATIONS.releaseBudget]: object(["budgetId", "commandId"]),
  [FABRIC_OPERATIONS.getBudget]: object(["budgetId"]),
  [FABRIC_OPERATIONS.publishArtifact]: object(["relativePath", "sha256", "commandId"], ["taskId"]),
  [FABRIC_OPERATIONS.closeBarrier]: object(["scope", "commandId"], ["stageId"]),
  [FABRIC_OPERATIONS.whoami]: object([]),
  [FABRIC_OPERATIONS.getRunStatus]: object(["runId"]),
  [FABRIC_OPERATIONS.observeEvents]: object(["cursor", "limit"]),
  [FABRIC_OPERATIONS.listTasks]: object(["runId"]),
  [FABRIC_OPERATIONS.listAgents]: object(["runId"]),
  [FABRIC_OPERATIONS.listReceipts]: object(["runId"]),
  [FABRIC_OPERATIONS.exportReceipt]: object(["commandId"]),
} as const satisfies OperationShapeFragment;

export const CORE_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.delegateAuthority]: object(["authorityId"]),
  [FABRIC_OPERATIONS.registerAgent]: object(["capability"]),
  [FABRIC_OPERATIONS.spawnAgent]: object(["agentId", "authorityId", "adapterId", "actionId", "providerSessionRef", "providerSessionGeneration", "bridgeState", "bridgeGeneration", "evidenceDigest"]),
  [FABRIC_OPERATIONS.attachAgent]: object(["agentId", "authorityId", "adapterId", "actionId", "providerSessionRef", "providerSessionGeneration", "bridgeState", "bridgeGeneration", "evidenceDigest"]),
  [FABRIC_OPERATIONS.createTask]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.claimTask]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.refreshTaskReadiness]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.recordObjectiveCheck]: object(["taskId", "checkId", "status"]),
  [FABRIC_OPERATIONS.acknowledgeTaskHandoff]: object(["acknowledged"]),
  [FABRIC_OPERATIONS.getTask]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.updateTask]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof]: object(["proofId"]),
  [FABRIC_OPERATIONS.recoverTaskOwner]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.recordRevocationProof]: object(["proofId"]),
  [FABRIC_OPERATIONS.revokeCapability]: nil,
  [FABRIC_OPERATIONS.rotateCapability]: object(["agentId", "principalGeneration", "capability"]),
  [FABRIC_OPERATIONS.acquireWriteLease]: object(["leaseId", "holderAgentId", "generation", "status", "scope"]),
  [FABRIC_OPERATIONS.recoverWriteLease]: object(["leaseId", "holderAgentId", "generation", "status", "scope"]),
  [FABRIC_OPERATIONS.renewWriteLease]: object(["leaseId", "holderAgentId", "generation", "status", "scope"]),
  [FABRIC_OPERATIONS.getWriteLease]: object(["leaseId", "holderAgentId", "generation", "status", "scope"]),
  [FABRIC_OPERATIONS.releaseWriteLease]: object(["leaseId", "status", "generation"]),
  [FABRIC_OPERATIONS.recordOperatorIntervention]: object(["interventionId"]),
  [FABRIC_OPERATIONS.recordVisibilityFailure]: object(["visibility", "providerSession", "delivery"], ["recovery"]),
  [FABRIC_OPERATIONS.createTeam]: object(["teamId", "parentTeamId", "depth", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "budgetId", "state", "generation", "successorAgentId", "discussionGroups", "reservedBudget"], ["leader", "rootTask", "initialMembers"]),
  [FABRIC_OPERATIONS.getTeam]: object(["teamId", "parentTeamId", "depth", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "budgetId", "state", "generation", "successorAgentId", "discussionGroups", "reservedBudget"], ["leader", "rootTask", "initialMembers"]),
  [FABRIC_OPERATIONS.freezeSubtree]: object(["teamId", "parentTeamId", "depth", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "budgetId", "state", "generation", "successorAgentId", "discussionGroups", "reservedBudget"], ["leader", "rootTask", "initialMembers"]),
  [FABRIC_OPERATIONS.adoptSubtree]: object(["teamId", "parentTeamId", "depth", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "budgetId", "state", "generation", "successorAgentId", "discussionGroups", "reservedBudget"], ["leader", "rootTask", "initialMembers"]),
  [FABRIC_OPERATIONS.closeSubtreeBarrier]: object(["teamId", "generation", "closed"]),
  [FABRIC_OPERATIONS.reserveBudget]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.recordBudgetUsage]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.reconcileBudgetUsage]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.releaseBudget]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.getBudget]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.publishArtifact]: object(["artifactId", "relativePath", "sha256"]),
  [FABRIC_OPERATIONS.closeBarrier]: object(["scope", "closed", "receipt"]),
  [FABRIC_OPERATIONS.whoami]: object(["seat", "agentId", "runId", "authorityId", "generation", "lease"]),
  [FABRIC_OPERATIONS.getRunStatus]: object(["runId", "chairAgentId", "barrier", "counts"]),
  [FABRIC_OPERATIONS.observeEvents]: object(["events", "nextCursor"]),
  [FABRIC_OPERATIONS.listTasks]: object(["tasks"]),
  [FABRIC_OPERATIONS.listAgents]: object(["agents"]),
  [FABRIC_OPERATIONS.listReceipts]: object(["receipts"]),
  [FABRIC_OPERATIONS.exportReceipt]: object(["relativePath", "schemaVersion", "sha256"]),
} as const satisfies OperationShapeFragment;

const taskResultCodec = objectCodec({
  taskId: identifier,
  ownerAgentId: nullable(identifier),
  state: enumeration(["blocked", "ready", "active", "complete", "cancelled", "degraded"]),
  revision: positiveInteger,
  ownerLeaseGeneration: integer(),
  proposedOwnerAgentId: nullable(identifier),
  dependencies: stringList,
});

const leaseResultCodec = objectCodec({
  leaseId: identifier,
  holderAgentId: identifier,
  generation: positiveInteger,
  status: enumeration(["active", "quarantined"]),
  scope: stringList,
});

const agentCustodyResultCodec = objectCodec({
  agentId: identifier,
  authorityId: identifier,
  adapterId: identifier,
  actionId: identifier,
  providerSessionRef: identifier,
  providerSessionGeneration: positiveInteger,
  bridgeState: enumeration(["active", "none"]),
  bridgeGeneration: positiveInteger,
  evidenceDigest: sha256,
});

const whoamiResultCodec = objectCodec({
  seat: identifier,
  agentId: identifier,
  runId: identifier,
  authorityId: identifier,
  generation: sha256Hex,
  lease: objectCodec({
    leaseId: identifier,
    holderAgentId: identifier,
    generation: positiveInteger,
    state: enumeration(["active", "frozen", "revoked"]),
  }),
});

const budgetDimensionCodec = objectCodec({
  granted: integer(),
  reserved: integer(),
  consumed: integer(),
  available: integer(),
  usageUnknown: boolean,
});

const budgetResultCodec = objectCodec({
  budgetId: identifier,
  parentBudgetId: nullable(identifier),
  state: enumeration(["active", "usage-unknown", "released"]),
  dimensions: recordOf(budgetDimensionCodec, { maximum: 128, keyCodec: budgetUnitKey }),
  returned: numberRecord,
});

const teamResultCodec = objectCodec({
  teamId: identifier,
  parentTeamId: nullable(identifier),
  depth: integer(),
  leaderAgentId: identifier,
  rootTaskId: identifier,
  ownedTaskIds: stringList,
  memberAgentIds: stringList,
  budgetId: identifier,
  state: enumeration(["active", "frozen", "barrier-closed"]),
  generation: positiveInteger,
  successorAgentId: nullable(identifier),
  discussionGroups: arrayOf(discussionGroupCodec, { maximum: 64 }),
  reservedBudget: numberRecord,
}, {
  leader: objectCodec({ agentId: identifier, authorityId: identifier }),
  rootTask: taskResultCodec,
  initialMembers: arrayOf(objectCodec({ agentId: identifier, authorityId: identifier }), { maximum: 5 }),
});

const visibleTeamResultCodec = objectCodec({
  teamId: identifier,
  parentTeamId: nullable(identifier),
  depth: integer(),
  leaderAgentId: identifier,
  rootTaskId: identifier,
  ownedTaskIds: stringList,
  memberAgentIds: stringList,
  budgetId: identifier,
  state: enumeration(["active", "frozen", "barrier-closed"]),
  generation: positiveInteger,
  successorAgentId: nullable(identifier),
  discussionGroups: arrayOf(discussionGroupCodec, { maximum: 64 }),
  reservedBudget: numberRecord,
}, {
  rootTask: taskResultCodec,
});

const teamCreateStructuredCodec = objectCodec({
  teamId: identifier,
  leader: teamLeaderCodec,
  rootTask: rootTaskInputCodec,
  initialMembers: arrayOf(teamMemberCodec, { maximum: 5 }),
  discussionGroups: arrayOf(discussionGroupCodec, { maximum: 64 }),
  reservedBudget: nonEmptyNumberRecord,
  commandId: identifier,
}, { parentTeamId: identifier });

const agentListResultCodec = objectCodec({
  agents: arrayOf(objectCodec({
    agentId: identifier,
    parentAgentId: nullable(identifier),
    lifecycle: text,
    bridgeState: enumeration(["active", "none", "lost"]),
    bridgeGeneration: positiveInteger,
  }), { maximum: 256 }),
});

const observerEventCodec = objectCodec({
  cursor: positiveInteger,
  eventId: identifier,
  type: text,
  actorAgentId: nullable(identifier),
  createdAt: integer(),
  summary: text,
});

const receiptCodec = objectCodec({
  relativePath,
  schemaVersion: unionOf([literal(1), literal(2)]),
  sha256: sha256Hex,
});

const coreFieldCodec = (
  operation: Parameters<typeof semanticShapeCodec>[0],
  field: string,
  direction: Parameters<typeof semanticShapeCodec>[1],
): Codec<unknown> | undefined => {
  if (field === "source" && operation === FABRIC_OPERATIONS.recordOperatorIntervention) return enumeration(["fabric", "integration"]);
  if (field === "directInputProvenance") return enumeration(["complete", "partial", "unavailable"]);
  if (field === "status" && operation === FABRIC_OPERATIONS.recordObjectiveCheck) return enumeration(["pass", "fail"]);
  if (field === "status" && operation === FABRIC_OPERATIONS.releaseWriteLease && direction === "result") return literal("released");
  if (field === "kind" && (operation === FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof || operation === FABRIC_OPERATIONS.recordRevocationProof)) {
    return enumeration(["predecessor-terminal", "os-isolated", "patch-only"]);
  }
  if (field === "kind" && operation === FABRIC_OPERATIONS.recordVisibilityFailure) {
    return enumeration(["herdr-telemetry", "observer-pane", "interactive-tui"]);
  }
  if (field === "state" && operation === FABRIC_OPERATIONS.updateTask && direction === "input") {
    return enumeration(["complete", "cancelled", "degraded"]);
  }
  if (field === "scope" && operation === FABRIC_OPERATIONS.acquireWriteLease) {
    return arrayOf(relativePath, { minimum: 1, maximum: 128, unique: true });
  }
  if (field === "scope" && operation === FABRIC_OPERATIONS.closeBarrier) return enumeration(["run", "stage"]);
  if (field === "visibility") return enumeration(["degraded", "lost"]);
  if (field === "providerSession") return enumeration(["healthy", "lost"]);
  if (field === "delivery") return enumeration(["active", "frozen"]);
  if (field === "recovery") return literal("reattach-or-rotate");
  if (field === "evidence" && operation === FABRIC_OPERATIONS.recoverWriteLease) return recoveryEvidenceCodec;
  if (field === "dimensions" && direction === "input") return nonEmptyNumberRecord;
  if (field === "usage") return nullableNumberRecord;
  if (field === "consumed") return nonEmptyNumberRecord;
  if (field === "events") return arrayOf(observerEventCodec, { maximum: 256 });
  if (field === "tasks") return arrayOf(taskResultCodec, { maximum: 256 });
  if (field === "receipts") return arrayOf(objectCodec({ relativePath, sha256: sha256Hex, exportedAt: integer() }), { maximum: 256 });
  if (field === "barrier") return objectCodec({ state: enumeration(["open", "closed"]) });
  if (field === "counts") return objectCodec({
    agents: integer(), tasks: integer(), tasksTerminal: integer(), messages: integer(),
    deliveriesUnacknowledged: integer(), leasesActive: integer(),
  });
  if (field === "receipt") return receiptCodec;
  if (field === "schemaVersion" && operation === FABRIC_OPERATIONS.exportReceipt && direction === "result") {
    return unionOf([literal(1), literal(2)]);
  }
  if (field === "sha256" && (operation === FABRIC_OPERATIONS.publishArtifact || operation === FABRIC_OPERATIONS.exportReceipt)) {
    return sha256Hex;
  }
  return undefined;
};

function corePair(
  operation: keyof typeof CORE_INPUT_SHAPES,
  overrides: Partial<OperationCodecPair> = {},
): OperationCodecPair {
  return {
    input: overrides.input ?? semanticShapeCodec(operation, "input", CORE_INPUT_SHAPES[operation], coreFieldCodec),
    result: overrides.result ?? semanticShapeCodec(operation, "result", CORE_RESULT_SHAPES[operation], coreFieldCodec),
  };
}

export const coreOperationCodecFragment = {
  [FABRIC_OPERATIONS.delegateAuthority]: corePair(FABRIC_OPERATIONS.delegateAuthority),
  [FABRIC_OPERATIONS.registerAgent]: corePair(FABRIC_OPERATIONS.registerAgent),
  [FABRIC_OPERATIONS.spawnAgent]: corePair(FABRIC_OPERATIONS.spawnAgent, { result: agentCustodyResultCodec }),
  [FABRIC_OPERATIONS.attachAgent]: corePair(FABRIC_OPERATIONS.attachAgent, { result: agentCustodyResultCodec }),
  [FABRIC_OPERATIONS.createTask]: corePair(FABRIC_OPERATIONS.createTask, { result: taskResultCodec }),
  [FABRIC_OPERATIONS.claimTask]: corePair(FABRIC_OPERATIONS.claimTask, { result: taskResultCodec }),
  [FABRIC_OPERATIONS.refreshTaskReadiness]: corePair(FABRIC_OPERATIONS.refreshTaskReadiness, { result: taskResultCodec }),
  [FABRIC_OPERATIONS.recordObjectiveCheck]: corePair(FABRIC_OPERATIONS.recordObjectiveCheck),
  [FABRIC_OPERATIONS.acknowledgeTaskHandoff]: corePair(FABRIC_OPERATIONS.acknowledgeTaskHandoff),
  [FABRIC_OPERATIONS.getTask]: corePair(FABRIC_OPERATIONS.getTask, { result: taskResultCodec }),
  [FABRIC_OPERATIONS.updateTask]: corePair(FABRIC_OPERATIONS.updateTask, { result: taskResultCodec }),
  [FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof]: corePair(FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof),
  [FABRIC_OPERATIONS.recoverTaskOwner]: corePair(FABRIC_OPERATIONS.recoverTaskOwner, { result: taskResultCodec }),
  [FABRIC_OPERATIONS.recordRevocationProof]: corePair(FABRIC_OPERATIONS.recordRevocationProof),
  [FABRIC_OPERATIONS.revokeCapability]: corePair(FABRIC_OPERATIONS.revokeCapability),
  [FABRIC_OPERATIONS.rotateCapability]: corePair(FABRIC_OPERATIONS.rotateCapability),
  [FABRIC_OPERATIONS.acquireWriteLease]: corePair(FABRIC_OPERATIONS.acquireWriteLease, { result: leaseResultCodec }),
  [FABRIC_OPERATIONS.recoverWriteLease]: corePair(FABRIC_OPERATIONS.recoverWriteLease, { result: leaseResultCodec }),
  [FABRIC_OPERATIONS.renewWriteLease]: corePair(FABRIC_OPERATIONS.renewWriteLease, { result: leaseResultCodec }),
  [FABRIC_OPERATIONS.getWriteLease]: corePair(FABRIC_OPERATIONS.getWriteLease, { result: leaseResultCodec }),
  [FABRIC_OPERATIONS.releaseWriteLease]: corePair(FABRIC_OPERATIONS.releaseWriteLease),
  [FABRIC_OPERATIONS.recordOperatorIntervention]: corePair(FABRIC_OPERATIONS.recordOperatorIntervention),
  [FABRIC_OPERATIONS.recordVisibilityFailure]: corePair(FABRIC_OPERATIONS.recordVisibilityFailure),
  [FABRIC_OPERATIONS.createTeam]: corePair(FABRIC_OPERATIONS.createTeam, { input: teamCreateStructuredCodec, result: teamResultCodec }),
  [FABRIC_OPERATIONS.getTeam]: corePair(FABRIC_OPERATIONS.getTeam, { result: visibleTeamResultCodec }),
  [FABRIC_OPERATIONS.freezeSubtree]: corePair(FABRIC_OPERATIONS.freezeSubtree, { result: visibleTeamResultCodec }),
  [FABRIC_OPERATIONS.adoptSubtree]: corePair(FABRIC_OPERATIONS.adoptSubtree, { result: visibleTeamResultCodec }),
  [FABRIC_OPERATIONS.closeSubtreeBarrier]: corePair(FABRIC_OPERATIONS.closeSubtreeBarrier),
  [FABRIC_OPERATIONS.reserveBudget]: corePair(FABRIC_OPERATIONS.reserveBudget, { result: budgetResultCodec }),
  [FABRIC_OPERATIONS.recordBudgetUsage]: corePair(FABRIC_OPERATIONS.recordBudgetUsage, { result: budgetResultCodec }),
  [FABRIC_OPERATIONS.reconcileBudgetUsage]: corePair(FABRIC_OPERATIONS.reconcileBudgetUsage, { result: budgetResultCodec }),
  [FABRIC_OPERATIONS.releaseBudget]: corePair(FABRIC_OPERATIONS.releaseBudget, { result: budgetResultCodec }),
  [FABRIC_OPERATIONS.getBudget]: corePair(FABRIC_OPERATIONS.getBudget, { result: budgetResultCodec }),
  [FABRIC_OPERATIONS.publishArtifact]: corePair(FABRIC_OPERATIONS.publishArtifact),
  [FABRIC_OPERATIONS.closeBarrier]: corePair(FABRIC_OPERATIONS.closeBarrier),
  [FABRIC_OPERATIONS.whoami]: corePair(FABRIC_OPERATIONS.whoami, { result: whoamiResultCodec }),
  [FABRIC_OPERATIONS.getRunStatus]: corePair(FABRIC_OPERATIONS.getRunStatus),
  [FABRIC_OPERATIONS.observeEvents]: corePair(FABRIC_OPERATIONS.observeEvents),
  [FABRIC_OPERATIONS.listTasks]: corePair(FABRIC_OPERATIONS.listTasks),
  [FABRIC_OPERATIONS.listAgents]: corePair(FABRIC_OPERATIONS.listAgents, { result: agentListResultCodec }),
  [FABRIC_OPERATIONS.listReceipts]: corePair(FABRIC_OPERATIONS.listReceipts),
  [FABRIC_OPERATIONS.exportReceipt]: corePair(FABRIC_OPERATIONS.exportReceipt),
} satisfies OperationCodecFragment;

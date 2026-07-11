import {
  FABRIC_OPERATIONS,
  isActiveFabricOperation,
  isRetiredOperation,
  OPERATION_REGISTRY,
  operationsForPrincipal,
  type FabricOperation,
  type OperationPrincipalKind,
} from "./operations.js";
import {
  arrayOf,
  boolean,
  boundedString,
  defineCodec,
  enumeration,
  identifier,
  integer,
  jsonValue,
  literal,
  nullable,
  objectCodec,
  parserBacked,
  recordOf,
  relativePath,
  secret,
  sha256,
  timestamp,
  unionOf,
  type Codec,
} from "./codec.js";
import {
  parseChairMutationContext,
  parseIntegrationInputAttestationRequest,
  parseOperatorInputAttestation,
  parseOperatorMutationContext,
} from "./operator.js";
import {
  parseIntake,
  parseIntakeDraftCreateRequest,
  parseIntakeReadRequest,
  parseIntakeRevisionRequest,
  parseIntakeSubmission,
} from "./intake.js";
import { parseMembershipBindRequest, parseMembershipBindResult } from "./membership.js";
import {
  parseScopedGate,
  parseScopedGateCheckRequest,
  parseScopedGateCreateRequest,
  parseScopedGateResolveRequest,
} from "./gates.js";
import { parseProjectSession } from "./project-session.js";
import {
  parseResultDelivery,
  parseTaskCompleteWithReply,
  parseTaskRequest,
} from "./request-result.js";
import { parseResourceReservationRequest } from "./resources.js";
import type {
  OperationInputMap,
  OperationResultMap,
  ProtocolOperation,
} from "./rpc-contract.js";

export type ObjectWireShape = {
  kind: "object";
  required: readonly string[];
  optional: readonly string[];
};
export type WireShape = ObjectWireShape | { kind: "array" } | { kind: "null" };

const object = (required: readonly string[], optional: readonly string[] = []): ObjectWireShape => ({
  kind: "object",
  required,
  optional,
});
const array: WireShape = { kind: "array" };
const nil: WireShape = { kind: "null" };

export const OPERATION_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.delegateAuthority]: object(["parentAuthorityId", "authority"], ["commandId"]),
  [FABRIC_OPERATIONS.registerAgent]: object(["agentId", "authorityId"], ["providerSessionRef", "adapterId"]),
  [FABRIC_OPERATIONS.spawnAgent]: object(["agentId", "authorityId", "adapterId", "actionId", "payload"]),
  [FABRIC_OPERATIONS.attachAgent]: object(["agentId", "authorityId", "adapterId", "actionId", "providerSessionRef"]),
  [FABRIC_OPERATIONS.sendMessage]: object(["audience", "kind", "body", "requiresAck", "dedupeKey"], ["conversationId", "replyToMessageId", "taskRevision", "hopCount", "expiresAt", "context"]),
  [FABRIC_OPERATIONS.createDiscussionGroup]: object(["groupId", "memberAgentIds", "commandId"], ["teamId"]),
  [FABRIC_OPERATIONS.receiveMessages]: object(["limit", "visibilityTimeoutMs"]),
  [FABRIC_OPERATIONS.acknowledgeDelivery]: object(["deliveryId"]),
  [FABRIC_OPERATIONS.abandonDelivery]: object(["deliveryId", "reason", "commandId"]),
  [FABRIC_OPERATIONS.getMailboxState]: object([]),
  [FABRIC_OPERATIONS.createTask]: object(["taskId", "authorityId", "eligibleAgentIds", "objective", "baseRevision", "commandId"], ["proposedOwnerAgentId", "participantAgentIds", "dependencies", "expectedArtifacts", "objectiveChecks", "humanGates"]),
  [FABRIC_OPERATIONS.claimTask]: object(["taskId", "expectedRevision", "commandId"]),
  [FABRIC_OPERATIONS.refreshTaskReadiness]: object(["taskId", "expectedRevision", "commandId"]),
  [FABRIC_OPERATIONS.recordObjectiveCheck]: object(["taskId", "checkId", "status", "evidence", "commandId"]),
  [FABRIC_OPERATIONS.resolveHumanGate]: object(["taskId", "gateId", "status", "evidence", "commandId"]),
  [FABRIC_OPERATIONS.acknowledgeTaskHandoff]: object(["taskId", "taskRevision", "ownerLeaseGeneration", "commandId"]),
  [FABRIC_OPERATIONS.getTask]: object(["taskId"]),
  [FABRIC_OPERATIONS.updateTask]: object(["taskId", "expectedRevision", "state", "commandId"]),
  [FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof]: object(["taskId", "ownerLeaseGeneration", "kind", "detail", "commandId"]),
  [FABRIC_OPERATIONS.recoverTaskOwner]: object(["taskId", "expectedRevision", "expectedOwnerLeaseGeneration", "successorAgentId", "proofId", "commandId"]),
  [FABRIC_OPERATIONS.recordRevocationProof]: object(["leaseId", "generation", "kind", "detail", "commandId"]),
  [FABRIC_OPERATIONS.revokeCapability]: object(["agentId", "commandId"]),
  [FABRIC_OPERATIONS.rotateCapability]: object(["agentId", "expectedPrincipalGeneration", "commandId"]),
  [FABRIC_OPERATIONS.acquireWriteLease]: object(["scope", "ttlMs", "commandId"]),
  [FABRIC_OPERATIONS.recoverWriteLease]: object(["leaseId", "expectedGeneration", "commandId", "evidence"]),
  [FABRIC_OPERATIONS.renewWriteLease]: object(["leaseId", "expectedGeneration", "ttlMs", "commandId"]),
  [FABRIC_OPERATIONS.getWriteLease]: object(["leaseId"]),
  [FABRIC_OPERATIONS.releaseWriteLease]: object(["leaseId", "expectedGeneration", "commandId"]),
  [FABRIC_OPERATIONS.requestLifecycle]: object(["action", "agentId", "taskId", "taskRevision", "checkpoint", "commandId"]),
  [FABRIC_OPERATIONS.getAgentLifecycle]: object(["agentId"]),
  [FABRIC_OPERATIONS.reportProviderState]: object(["agentId", "providerSessionGeneration", "contextRevision", "commandId"], ["checkpointSha256"]),
  [FABRIC_OPERATIONS.dispatchProviderAction]: object(["adapterId", "actionId", "operation", "payload", "commandId"]),
  [FABRIC_OPERATIONS.reconcileProviderAction]: object(["actionId", "commandId"]),
  [FABRIC_OPERATIONS.getProviderAction]: object(["actionId"]),
  [FABRIC_OPERATIONS.recordOperatorIntervention]: object(["source", "directInputProvenance", "taskRevision", "summary", "commandId"]),
  [FABRIC_OPERATIONS.recordVisibilityFailure]: object(["kind", "agentId", "commandId"]),
  [FABRIC_OPERATIONS.createTeam]: object(["teamId", "commandId"], ["parentTeamId", "leader", "rootTask", "initialMembers", "discussionGroups", "reservedBudget", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "initialMemberAgentIds", "authorityId", "budget"]),
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
  [FABRIC_OPERATIONS.getRunStatus]: object(["runId"]),
  [FABRIC_OPERATIONS.observeEvents]: object(["cursor", "limit"]),
  [FABRIC_OPERATIONS.listTasks]: object(["runId"]),
  [FABRIC_OPERATIONS.listAgents]: object(["runId"]),
  [FABRIC_OPERATIONS.listReceipts]: object(["runId"]),
  [FABRIC_OPERATIONS.exportReceipt]: object(["commandId"]),
  [FABRIC_OPERATIONS.projectSessionCreate]: object(["command", "projectSessionId", "projectId", "mode", "generation", "authorityRef", "budgetRef", "launchPacketRef"]),
  [FABRIC_OPERATIONS.projectSessionGet]: object(["projectId", "projectSessionId", "expectedGeneration"]),
  [FABRIC_OPERATIONS.projectSessionTransition]: object(["command", "projectSessionId", "expectedGeneration", "transition"]),
  [FABRIC_OPERATIONS.projectSessionClose]: object(["command", "projectSessionId", "expectedGeneration", "terminalPath"]),
  [FABRIC_OPERATIONS.membershipBind]: object(["origin", "command", "projectSessionId", "coordinationRunId", "expectedMembershipRevision", "members"]),
  [FABRIC_OPERATIONS.operatorAttach]: object(["command", "projectId", "requestedExpiresAt"], ["projectSessionId", "expectedAttachmentGeneration"]),
  [FABRIC_OPERATIONS.operatorDetach]: object(["command", "attachmentGeneration"]),
  [FABRIC_OPERATIONS.operatorHeartbeat]: object(["command", "attachmentGeneration", "extendUntil"]),
  [FABRIC_OPERATIONS.operatorCommand]: object(["command", "action", "payload"], ["targetTaskId"]),
  [FABRIC_OPERATIONS.integrationInputAttest]: object(["context", "attestation"]),
  [FABRIC_OPERATIONS.intakeDraftCreate]: object(["command", "intakeId", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.intakeRead]: object(["credential", "intakeId"]),
  [FABRIC_OPERATIONS.intakeSubmit]: object(["command", "intakeId", "expectedRevision", "projectSessionId", "coordinationRunId", "summary", "artifactRefs", "gateIds", "chairRequest"]),
  [FABRIC_OPERATIONS.intakeRevise]: object(["origin", "command", "intakeId", "projectSessionId", "coordinationRunId", "expectedRevision", "state", "summary", "artifactRefs", "gateIds"], ["chairRequest"]),
  [FABRIC_OPERATIONS.scopedGateCreate]: object(["origin", "command", "intent"]),
  [FABRIC_OPERATIONS.scopedGateResolve]: object(["command", "gateId", "status", "decisionEvidence"]),
  [FABRIC_OPERATIONS.scopedGateCheck]: object(["projectSessionId", "coordinationRunId", "dependencyRevision", "enforcementPoint"], ["taskId", "operationId", "barrierId"]),
  [FABRIC_OPERATIONS.scopedGateRead]: object(["credential", "projectId", "projectSessionId", "gateId"], ["expectedRevision"]),
  [FABRIC_OPERATIONS.resourceReserve]: object(["commandId", "reservationId", "projectSessionId", "path", "amounts"], ["writerAdmission"]),
  [FABRIC_OPERATIONS.resourceRelease]: object(["commandId", "reservationId", "expectedRevision", "consumed"]),
  [FABRIC_OPERATIONS.resourceReconcile]: object(["commandId", "reservationId", "expectedRevision", "observedUsage", "evidence"]),
  [FABRIC_OPERATIONS.taskRequest]: object(["commandId", "projectSessionId", "coordinationRunId", "task", "request"]),
  [FABRIC_OPERATIONS.taskCompleteWithReply]: object(["commandId", "taskId", "expectedTaskRevision", "ownerLeaseId", "ownerLeaseGeneration", "requestMessageId", "expectedRequestRevision", "callbackId", "callbackGeneration", "reply", "terminalResult"]),
  [FABRIC_OPERATIONS.resultDeliveryClaim]: object(["commandId", "resultDeliveryId", "expectedRevision", "expectedClaimGeneration", "claimantAgentId", "claimDeadline"]),
  [FABRIC_OPERATIONS.resultDeliveryProviderAccept]: object(["commandId", "resultDeliveryId", "expectedRevision", "claimGeneration", "providerActionId"]),
  [FABRIC_OPERATIONS.resultDeliveryConsume]: object(["commandId", "resultDeliveryId", "expectedRevision", "claimGeneration", "callbackId", "payloadDigest"]),
  [FABRIC_OPERATIONS.resultDeliveryRetry]: object(["commandId", "resultDeliveryId", "expectedRevision", "sameCallbackId", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryReassign]: object(["commandId", "resultDeliveryId", "expectedRevision", "targetAgentId", "targetProviderSessionRef", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryAbandon]: object(["commandId", "resultDeliveryId", "expectedRevision", "reason"]),
  [FABRIC_OPERATIONS.chairTakeover]: object(["command", "projectSessionId", "runId", "expectedChairAgentId", "successorChairAgentId", "expectedChairGeneration", "expectedSessionGeneration", "handoffRef", "targetRevision"]),
  [FABRIC_OPERATIONS.projectDiscover]: object(["credential", "projectId", "after", "limit"]),
  [FABRIC_OPERATIONS.projectionSnapshot]: object(["credential", "projectId"], ["projectSessionId"]),
  [FABRIC_OPERATIONS.projectionPage]: object(["credential", "projectId", "view", "after", "limit"], ["projectSessionId"]),
  [FABRIC_OPERATIONS.projectionEvents]: object(["credential", "projectId", "after", "limit"], ["projectSessionId"]),
  [FABRIC_OPERATIONS.projectionViewPage]: object(["credential", "projectId", "view", "snapshotRevision", "cursor", "limit"], ["projectSessionId"]),
  [FABRIC_OPERATIONS.projectionDetailRead]: object(["credential", "projectId", "snapshotRevision", "detailRef"], ["projectSessionId"]),
  [FABRIC_OPERATIONS.operatorActionPreview]: object(["command", "projectId", "intent"]),
  [FABRIC_OPERATIONS.operatorActionCommit]: object(["command", "projectId", "previewId", "expectedPreviewRevision", "previewDigest", "expectedIntentDigest", "confirmation"]),
  [FABRIC_OPERATIONS.operatorActionStatus]: object(["credential", "projectId", "commandId"]),
  [FABRIC_OPERATIONS.operatorActionReconcile]: object(["command", "projectId", "targetCommandId", "expectedStatus", "expectedAttemptGeneration", "mode"]),
  [FABRIC_OPERATIONS.messageBodyRead]: object(["credential", "projectSessionId", "messageId", "expectedRevision"]),
  [FABRIC_OPERATIONS.operatorRepositoryRead]: object(
    ["credential", "projectId", "snapshotRevision", "target", "diff", "log"],
    ["projectSessionId"],
  ),
  [FABRIC_OPERATIONS.projectSessionDrain]: object(["command", "projectSessionId", "expectedGeneration", "consequencePreviewRef", "confirmedPreviewRevision"]),
  [FABRIC_OPERATIONS.projectSessionStop]: object(["command", "projectSessionId", "expectedGeneration", "consequencePreviewRef", "confirmedPreviewRevision", "drainReceiptRef"]),
  [FABRIC_OPERATIONS.daemonDrain]: object(["command", "expectedDaemonGeneration", "expectedGlobalStateRevision"]),
  [FABRIC_OPERATIONS.daemonStop]: object(["command", "expectedDaemonGeneration", "expectedGlobalStateRevision", "drainReceiptRef"]),
} as const satisfies Record<ProtocolOperation, WireShape>;

export const OPERATION_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.delegateAuthority]: object(["authorityId"]),
  [FABRIC_OPERATIONS.registerAgent]: object(["capability"]),
  [FABRIC_OPERATIONS.spawnAgent]: object(["capability", "providerSessionRef", "adapterId", "actionId"]),
  [FABRIC_OPERATIONS.attachAgent]: object(["capability", "providerSessionRef", "adapterId", "actionId"]),
  [FABRIC_OPERATIONS.sendMessage]: object(["messageId"]),
  [FABRIC_OPERATIONS.createDiscussionGroup]: object(["groupId", "memberAgentIds"]),
  [FABRIC_OPERATIONS.receiveMessages]: array,
  [FABRIC_OPERATIONS.acknowledgeDelivery]: nil,
  [FABRIC_OPERATIONS.abandonDelivery]: object(["deliveryId", "status", "reason"]),
  [FABRIC_OPERATIONS.getMailboxState]: object(["contiguousWatermark", "acknowledgedAboveWatermark"]),
  [FABRIC_OPERATIONS.createTask]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.claimTask]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.refreshTaskReadiness]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.recordObjectiveCheck]: object(["taskId", "checkId", "status"]),
  [FABRIC_OPERATIONS.resolveHumanGate]: object(["taskId", "gateId", "status"]),
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
  [FABRIC_OPERATIONS.requestLifecycle]: object(["agentId", "lifecycle", "providerSessionGeneration"], ["rotation"]),
  [FABRIC_OPERATIONS.getAgentLifecycle]: object(["agentId", "lifecycle", "providerSessionGeneration"], ["rotation"]),
  [FABRIC_OPERATIONS.reportProviderState]: object(["agentId", "lifecycle", "providerSessionGeneration"], ["rotation"]),
  [FABRIC_OPERATIONS.dispatchProviderAction]: object(["actionId", "status", "history", "executionCount", "effectCount"], ["result"]),
  [FABRIC_OPERATIONS.reconcileProviderAction]: object(["actionId", "status", "history", "executionCount", "effectCount"], ["result"]),
  [FABRIC_OPERATIONS.getProviderAction]: object(["actionId", "status", "history", "executionCount", "effectCount"], ["result"]),
  [FABRIC_OPERATIONS.recordOperatorIntervention]: object(["interventionId"]),
  [FABRIC_OPERATIONS.recordVisibilityFailure]: object(["visibility", "providerSession", "delivery"], ["recovery"]),
  [FABRIC_OPERATIONS.createTeam]: object(["teamId", "parentTeamId", "depth", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "budgetId", "state", "generation", "successorAgentId", "discussionGroups", "reservedBudget"], ["leader", "rootTask", "initialMemberAgentIds"]),
  [FABRIC_OPERATIONS.getTeam]: object(["teamId", "parentTeamId", "depth", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "budgetId", "state", "generation", "successorAgentId", "discussionGroups", "reservedBudget"], ["leader", "rootTask", "initialMemberAgentIds"]),
  [FABRIC_OPERATIONS.freezeSubtree]: object(["teamId", "parentTeamId", "depth", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "budgetId", "state", "generation", "successorAgentId", "discussionGroups", "reservedBudget"], ["leader", "rootTask", "initialMemberAgentIds"]),
  [FABRIC_OPERATIONS.adoptSubtree]: object(["teamId", "parentTeamId", "depth", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "budgetId", "state", "generation", "successorAgentId", "discussionGroups", "reservedBudget"], ["leader", "rootTask", "initialMemberAgentIds"]),
  [FABRIC_OPERATIONS.closeSubtreeBarrier]: object(["teamId", "generation", "closed"]),
  [FABRIC_OPERATIONS.reserveBudget]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.recordBudgetUsage]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.reconcileBudgetUsage]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.releaseBudget]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.getBudget]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.publishArtifact]: object(["artifactId", "relativePath", "sha256"]),
  [FABRIC_OPERATIONS.closeBarrier]: object(["scope", "closed", "receipt"]),
  [FABRIC_OPERATIONS.getRunStatus]: object(["runId", "chairAgentId", "barrier", "counts"]),
  [FABRIC_OPERATIONS.observeEvents]: object(["events", "nextCursor"]),
  [FABRIC_OPERATIONS.listTasks]: object(["tasks"]),
  [FABRIC_OPERATIONS.listAgents]: object(["agents"]),
  [FABRIC_OPERATIONS.listReceipts]: object(["receipts"]),
  [FABRIC_OPERATIONS.exportReceipt]: object(["relativePath", "schemaVersion", "sha256"]),
  [FABRIC_OPERATIONS.projectSessionCreate]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionGet]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionTransition]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionClose]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin", "terminalPath"]),
  [FABRIC_OPERATIONS.membershipBind]: object(["projectSessionId", "coordinationRunId", "membershipRevision", "members"]),
  [FABRIC_OPERATIONS.operatorAttach]: object(["clientId", "projectId", "projectAuthorityGeneration", "projectSessionId", "generation", "expiresAt"]),
  [FABRIC_OPERATIONS.operatorDetach]: object(["detached", "revision"]),
  [FABRIC_OPERATIONS.operatorHeartbeat]: object(["clientId", "projectId", "projectAuthorityGeneration", "projectSessionId", "generation", "expiresAt"]),
  [FABRIC_OPERATIONS.operatorCommand]: object(["commandId", "actor", "provenance", "operation", "expectedRevision", "committedRevision", "before", "after", "evidenceRefs", "committedAt"]),
  [FABRIC_OPERATIONS.integrationInputAttest]: object(["attestationId", "integrationId", "integrationGeneration", "operatorId", "projectId", "projectSessionId", "providerEvent", "humanUtterance", "gateBinding", "recordedAt"]),
  [FABRIC_OPERATIONS.intakeDraftCreate]: object(["intakeId", "projectId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.intakeRead]: object(["intakeId", "projectId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"], ["projectSessionId", "coordinationRunId"]),
  [FABRIC_OPERATIONS.intakeSubmit]: object(["intakeId", "projectId", "projectSessionId", "coordinationRunId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.intakeRevise]: object(["intakeId", "projectId", "projectSessionId", "coordinationRunId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.scopedGateCreate]: object(["gateId", "projectSessionId", "coordinationRunId", "scope", "affectedTaskIds", "dependencyRevision", "blockedOperationIds", "enforcementPoints", "question", "reason", "options", "recommendation", "consequences", "evidenceRefs", "revision", "createdByRef", "expectedApproverRef", "status"], ["deadline", "default", "resolution", "releaseBinding"]),
  [FABRIC_OPERATIONS.scopedGateResolve]: object(["gateId", "projectSessionId", "coordinationRunId", "scope", "affectedTaskIds", "dependencyRevision", "blockedOperationIds", "enforcementPoints", "question", "reason", "options", "recommendation", "consequences", "evidenceRefs", "revision", "createdByRef", "expectedApproverRef", "status"], ["deadline", "default", "resolution", "releaseBinding"]),
  [FABRIC_OPERATIONS.scopedGateCheck]: object(["allowed", "checkedGateRevisions"], ["blockingGateIds"]),
  [FABRIC_OPERATIONS.scopedGateRead]: object(["status", "gate", "readTransactionId", "stateDigest"], ["expectedRevision"]),
  [FABRIC_OPERATIONS.resourceReserve]: object(["reservationId", "revision", "state", "path", "amounts", "capacity"]),
  [FABRIC_OPERATIONS.resourceRelease]: object(["reservationId", "revision", "state", "path", "amounts", "capacity"]),
  [FABRIC_OPERATIONS.resourceReconcile]: object(["reservationId", "revision", "state", "path", "amounts", "capacity"]),
  [FABRIC_OPERATIONS.taskRequest]: object(["taskRevision", "requestRevision", "callbackId", "callbackGeneration"]),
  [FABRIC_OPERATIONS.taskCompleteWithReply]: object(["taskRevision", "replyRevision", "resultDelivery"]),
  [FABRIC_OPERATIONS.resultDeliveryClaim]: object(["resultDeliveryId", "revision", "projectSessionId", "taskId", "requestMessageId", "requestRevision", "replyMessageId", "replyRevision", "taskRevision", "callbackId", "callbackGeneration", "assignmentGeneration", "targetAgentId", "targetProviderSessionRef", "payloadDigest", "responseDeadline", "dependentBarrierId", "required", "state", "claimGeneration"], ["claimedByAgentId", "claimDeadline", "providerAcceptedAt", "consumedAt", "overdueAt", "abandonedAt", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryProviderAccept]: object(["resultDeliveryId", "revision", "projectSessionId", "taskId", "requestMessageId", "requestRevision", "replyMessageId", "replyRevision", "taskRevision", "callbackId", "callbackGeneration", "assignmentGeneration", "targetAgentId", "targetProviderSessionRef", "payloadDigest", "responseDeadline", "dependentBarrierId", "required", "state", "claimGeneration"], ["claimedByAgentId", "claimDeadline", "providerAcceptedAt", "consumedAt", "overdueAt", "abandonedAt", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryConsume]: object(["resultDeliveryId", "revision", "projectSessionId", "taskId", "requestMessageId", "requestRevision", "replyMessageId", "replyRevision", "taskRevision", "callbackId", "callbackGeneration", "assignmentGeneration", "targetAgentId", "targetProviderSessionRef", "payloadDigest", "responseDeadline", "dependentBarrierId", "required", "state", "claimGeneration"], ["claimedByAgentId", "claimDeadline", "providerAcceptedAt", "consumedAt", "overdueAt", "abandonedAt", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryRetry]: object(["resultDeliveryId", "revision", "projectSessionId", "taskId", "requestMessageId", "requestRevision", "replyMessageId", "replyRevision", "taskRevision", "callbackId", "callbackGeneration", "assignmentGeneration", "targetAgentId", "targetProviderSessionRef", "payloadDigest", "responseDeadline", "dependentBarrierId", "required", "state", "claimGeneration"], ["claimedByAgentId", "claimDeadline", "providerAcceptedAt", "consumedAt", "overdueAt", "abandonedAt", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryReassign]: object(["resultDeliveryId", "revision", "projectSessionId", "taskId", "requestMessageId", "requestRevision", "replyMessageId", "replyRevision", "taskRevision", "callbackId", "callbackGeneration", "assignmentGeneration", "targetAgentId", "targetProviderSessionRef", "payloadDigest", "responseDeadline", "dependentBarrierId", "required", "state", "claimGeneration"], ["claimedByAgentId", "claimDeadline", "providerAcceptedAt", "consumedAt", "overdueAt", "abandonedAt", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryAbandon]: object(["resultDeliveryId", "revision", "projectSessionId", "taskId", "requestMessageId", "requestRevision", "replyMessageId", "replyRevision", "taskRevision", "callbackId", "callbackGeneration", "assignmentGeneration", "targetAgentId", "targetProviderSessionRef", "payloadDigest", "responseDeadline", "dependentBarrierId", "required", "state", "claimGeneration"], ["claimedByAgentId", "claimDeadline", "providerAcceptedAt", "consumedAt", "overdueAt", "abandonedAt", "reason"]),
  [FABRIC_OPERATIONS.chairTakeover]: object(["projectSessionId", "sessionRevision", "runRevision", "chairAgentId", "chairGeneration"]),
  [FABRIC_OPERATIONS.projectDiscover]: object(["project", "sessions"]),
  [FABRIC_OPERATIONS.projectionSnapshot]: object(["schemaVersion", "snapshotRevision", "readTransactionId", "project", "session", "runs", "attention", "capacity", "cursor", "stateDigest"]),
  [FABRIC_OPERATIONS.projectionPage]: object(["view", "page"]),
  [FABRIC_OPERATIONS.projectionEvents]: object(["status"], ["events", "nextCursor", "hasMore", "snapshotRevision", "readTransactionId", "reason", "currentSnapshotRevision", "snapshotCursor"]),
  [FABRIC_OPERATIONS.projectionViewPage]: object(["status", "view"], ["rows", "nextCursor", "hasMore", "snapshotRevision", "readTransactionId", "reason", "currentSnapshotRevision", "snapshotCursor"]),
  [FABRIC_OPERATIONS.projectionDetailRead]: object(["status"], ["detailRef", "detail", "snapshotRevision", "readTransactionId", "reason", "currentSnapshotRevision"]),
  [FABRIC_OPERATIONS.operatorActionPreview]: object(["previewId", "previewRevision", "previewDigest", "intent", "intentDigest", "beforeStateDigest", "consequenceClass", "evidenceRefs", "gateIds", "confirmationMode", "expiresAt"]),
  [FABRIC_OPERATIONS.operatorActionCommit]: object(["commandId", "previewId", "previewRevision", "intentDigest", "beforeStateDigest", "afterStateDigest", "evidenceRefs", "committedAt"], ["effectRef"]),
  [FABRIC_OPERATIONS.operatorActionStatus]: object(["status", "commandId"], ["intentDigest", "phase", "attemptGeneration", "effectRef", "receipt", "code", "evidenceRefs"]),
  [FABRIC_OPERATIONS.operatorActionReconcile]: object(["status", "commandId"], ["intentDigest", "phase", "attemptGeneration", "effectRef", "receipt", "code", "evidenceRefs"]),
  [FABRIC_OPERATIONS.messageBodyRead]: object(["available", "messageId", "revision"], ["body", "terminalNeutralised", "capabilityValuesRedacted", "artifactRefs", "reason"]),
  [FABRIC_OPERATIONS.operatorRepositoryRead]: object(
    ["status"],
    ["projectId", "projectSessionId", "snapshotRevision", "readTransactionId", "repository", "reason", "currentSnapshotRevision"],
  ),
  [FABRIC_OPERATIONS.projectSessionDrain]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionStop]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.daemonDrain]: object(["daemonInstanceGeneration", "globalStateRevision", "state", "receiptDigest"]),
  [FABRIC_OPERATIONS.daemonStop]: object(["daemonInstanceGeneration", "globalStateRevision", "state", "receiptDigest"]),
} as const satisfies Record<ProtocolOperation, WireShape>;

const text = boundedString();
const optionalText = boundedString({ minBytes: 0 });
const positiveInteger = integer({ minimum: 1 });
const stringList = arrayOf(identifier, { maximum: 256, unique: true });
const textList = arrayOf(text, { maximum: 256 });
const integerList = arrayOf(integer(), { maximum: 256, unique: true });
const resourceUnitPattern = "^(?:provider_calls|concurrent_turns|descendants|message_bytes|artifact_bytes|wall_clock_milliseconds|cost:[A-Z]{3}|(?:input_tokens|output_tokens):[a-z0-9][a-z0-9._-]{0,63})$";
const numberRecord = recordOf(integer(), { maximum: 128, keyPattern: resourceUnitPattern });
const nonEmptyNumberRecord = recordOf(integer(), {
  minimum: 1,
  maximum: 128,
  keyPattern: resourceUnitPattern,
  exampleKey: "concurrent_turns",
});
const nullableNumberRecord = recordOf(nullable(integer()), {
  minimum: 1,
  maximum: 128,
  keyPattern: resourceUnitPattern,
  exampleKey: "concurrent_turns",
});
const stringRecord = recordOf(text, { maximum: 128 });
const jsonRecord = recordOf(jsonValue, { maximum: 128 });
const activeOperationValues = Object.keys(OPERATION_REGISTRY).filter(isActiveFabricOperation);
const activeOperationCodec = defineCodec<FabricOperation>({
  type: "string",
  enum: activeOperationValues,
}, FABRIC_OPERATIONS.acknowledgeDelivery, (value, path) => {
  if (typeof value !== "string" || !isActiveFabricOperation(value)) {
    throw new TypeError(`${path} must be an active protocol operation`);
  }
  return value;
});
const agentAuthorityOperationValues = [...operationsForPrincipal("agent")].sort();
const agentAuthorityOperationSet: ReadonlySet<string> = new Set(agentAuthorityOperationValues);
const agentAuthorityOperationCodec = defineCodec<FabricOperation>({
  type: "string",
  enum: agentAuthorityOperationValues,
}, FABRIC_OPERATIONS.acknowledgeDelivery, (value, path) => {
  if (typeof value !== "string" || !agentAuthorityOperationSet.has(value)) {
    throw new TypeError(`${path} must be an active agent protocol operation`);
  }
  return value as FabricOperation;
});

const artifactRefCodec = objectCodec({ path: relativePath, digest: sha256 });
const artifactRefsCodec = arrayOf(artifactRefCodec, { maximum: 128 });
const credentialCodec = objectCodec({ capabilityId: identifier, token: secret });
const consoleProvenanceCodec = objectCodec({
  kind: literal("console-direct-input"),
  clientId: identifier,
  inputEventId: identifier,
});
const attestedProvenanceCodec = objectCodec({
  kind: literal("attested-provider-input"),
  attestationId: identifier,
  integrationId: identifier,
  integrationGeneration: positiveInteger,
});
const provenanceCodec = unionOf([consoleProvenanceCodec, attestedProvenanceCodec]);
const operatorMutationBaseCodec = objectCodec({
  credential: credentialCodec,
  commandId: identifier,
  expectedRevision: integer(),
  actor: identifier,
  provenance: provenanceCodec,
  evidenceRefs: artifactRefsCodec,
});
const operatorMutationCodec = parserBacked(
  operatorMutationBaseCodec,
  parseOperatorMutationContext,
  parseOperatorMutationContext(operatorMutationBaseCodec.example),
);
const chairMutationBaseCodec = objectCodec({
  commandId: identifier,
  agentId: identifier,
  projectSessionId: identifier,
  coordinationRunId: identifier,
  principalGeneration: positiveInteger,
  chairLeaseId: identifier,
  chairLeaseGeneration: positiveInteger,
  expectedRunRevision: integer(),
  expectedRevision: positiveInteger,
});
const chairMutationCodec = parserBacked(
  chairMutationBaseCodec,
  parseChairMutationContext,
  parseChairMutationContext(chairMutationBaseCodec.example),
);

const disclosureCodec = unionOf([
  objectCodec({ level: literal("allowed") }),
  objectCodec({ level: literal("forbidden") }),
  objectCodec({
    level: literal("scoped"),
    scopes: arrayOf(enumeration(["local", "approved-provider", "external"]), {
      minimum: 1,
      maximum: 3,
      unique: true,
    }),
  }),
  arrayOf(enumeration(["local", "approved-provider", "external"]), { maximum: 3, unique: true }),
]);
const authorityCodec = objectCodec({
  workspaceRoots: arrayOf(relativePath, { minimum: 1, maximum: 64, unique: true }),
  sourcePaths: arrayOf(relativePath, { maximum: 256, unique: true }),
  artifactPaths: arrayOf(relativePath, { maximum: 256, unique: true }),
  actions: arrayOf(agentAuthorityOperationCodec, { maximum: 256, unique: true }),
  disclosure: disclosureCodec,
  expiresAt: timestamp,
  budget: numberRecord,
}, {
  deniedPaths: arrayOf(relativePath, { maximum: 256, unique: true }),
  deniedActions: arrayOf(agentAuthorityOperationCodec, { maximum: 256, unique: true }),
});

const messageAudienceCodec = unionOf([
  objectCodec({ kind: literal("agents"), agentIds: arrayOf(identifier, { minimum: 1, maximum: 64, unique: true }) }),
  objectCodec({ kind: literal("team"), teamId: identifier }),
  objectCodec({ kind: literal("task"), taskId: identifier }),
]);
const messageContextCodec = unionOf([
  objectCodec({ kind: literal("direct") }),
  objectCodec({ kind: literal("task"), taskId: identifier }),
  objectCodec({ kind: literal("task-dependency"), fromTaskId: identifier, toTaskId: identifier }),
  objectCodec({ kind: literal("discussion-group"), groupId: identifier }),
]);
const recoveryEvidenceCodec = unionOf([
  objectCodec({ kind: literal("unproven") }),
  objectCodec({ kind: literal("predecessor-terminal"), agentId: identifier, providerSessionRef: identifier }),
  objectCodec({ kind: literal("os-isolated"), proofRef: identifier }),
  objectCodec({ kind: literal("patch-only"), serialApplierRef: identifier }),
]);
const lifecycleCheckpointCodec = objectCodec({
  relativePath,
  sha256,
  mailboxWatermark: integer(),
  acknowledgedAboveWatermark: integerList,
  inFlightChildren: stringList,
  openWork: textList,
  nextAction: text,
  providerResumeReference: identifier,
});

const teamMemberCodec = objectCodec({ agentId: identifier, authority: authorityCodec });
const discussionGroupCodec = objectCodec({
  groupId: identifier,
  memberAgentIds: arrayOf(identifier, { minimum: 2, maximum: 64, unique: true }),
});
const teamLeaderCodec = objectCodec({ agentId: identifier, authority: authorityCodec });
const rootTaskInputCodec = objectCodec({ taskId: identifier, objective: text, baseRevision: text });

const projectSessionOriginCodec = unionOf([
  objectCodec({ kind: literal("operator-launch"), operatorId: identifier }),
  objectCodec({ kind: literal("legacy-migration"), migrationManifestRef: artifactRefCodec }),
]);
const cancelledTerminalPathCodec = objectCodec({ kind: literal("cancelled"), reason: text });
const terminalPathCodec = unionOf([
  objectCodec({ kind: literal("accepted"), acceptanceRef: sha256 }),
  cancelledTerminalPathCodec,
  objectCodec({ kind: literal("failed"), reason: text, failureRef: sha256 }),
]);
const projectSessionCommonFields = {
  projectSessionId: identifier,
  projectId: identifier,
  mode: enumeration(["coordinated", "independent"]),
  revision: positiveInteger,
  generation: positiveInteger,
  authorityRef: sha256,
  budgetRef: identifier,
  launchPacketRef: artifactRefCodec,
  membershipRevision: integer(),
  origin: projectSessionOriginCodec,
};
const projectSessionWireCodec = unionOf([
  objectCodec({
    ...projectSessionCommonFields,
    state: enumeration([
      "draft",
      "awaiting_launch",
      "launching",
      "active",
      "quiescing",
      "awaiting_acceptance",
      "launch_failed",
      "launch_ambiguous",
      "reconciling",
      "visibility_degraded",
      "recovery_required",
      "quarantined",
    ]),
  }),
  objectCodec({ ...projectSessionCommonFields, state: literal("closed"), terminalPath: terminalPathCodec }),
  objectCodec({ ...projectSessionCommonFields, state: literal("cancelled"), terminalPath: cancelledTerminalPathCodec }),
]);
const projectSessionCodec = parserBacked(
  projectSessionWireCodec,
  parseProjectSession,
  parseProjectSession(projectSessionWireCodec.example),
);

const runProjectionCodec = objectCodec({
  runId: identifier,
  phase: text,
  chairAgentId: identifier,
  nextMilestone: text,
  health: enumeration(["healthy", "degraded", "blocked", "quarantined", "unknown"]),
});
const attentionItemCodec = objectCodec({
  itemId: identifier,
  revision: positiveInteger,
  label: enumeration(["Decision", "Approval", "Blocked", "FYI"]),
  priority: enumeration(["safety-integrity", "critical-path", "expiring-authority", "acceptance-ready", "advisory"]),
  title: text,
  sourceFreshness: enumeration(["live", "snapshot", "stale", "unavailable", "conflict"]),
  lastEventAt: timestamp,
  duplicateCount: integer(),
});
const projectionSourceCodec = enumeration(["fabric", "delivery-run", "git", "github", "herdr", "provider"]);

function projectionFact(
  valueCodec: Codec<unknown>,
  sourceCodec: Codec<unknown> = projectionSourceCodec,
): Codec<unknown> {
  return unionOf([
    objectCodec({
      freshness: enumeration(["live", "snapshot", "stale"]),
      source: sourceCodec,
      revision: integer(),
      observedAt: timestamp,
      value: valueCodec,
    }),
    objectCodec({
      freshness: literal("unavailable"),
      source: sourceCodec,
      revision: integer(),
      observedAt: timestamp,
      reason: text,
    }),
    objectCodec({
      freshness: literal("conflict"),
      source: sourceCodec,
      revision: integer(),
      observedAt: timestamp,
      candidates: arrayOf(valueCodec, { minimum: 2, maximum: 16 }),
    }),
  ]);
}

const resourceScopeCodec = unionOf([
  objectCodec({ kind: literal("project"), scopeId: identifier, projectId: identifier }),
  objectCodec({ kind: literal("project-session"), scopeId: identifier, projectId: identifier, projectSessionId: identifier }),
  objectCodec({ kind: literal("coordination-run"), scopeId: identifier, projectSessionId: identifier, coordinationRunId: identifier }),
  objectCodec({ kind: literal("team"), scopeId: identifier, coordinationRunId: identifier, teamId: identifier }),
  objectCodec({ kind: literal("agent"), scopeId: identifier, teamId: identifier, agentId: identifier }),
]);
const absoluteFilesystemPathCodec = boundedString({ maxBytes: 4096, pattern: "^/", example: "/workspace/project" });
const canonicalAbsoluteFilesystemPathCodec = boundedString({
  maxBytes: 4096,
  pattern: "^/(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*//).+$",
  example: "/workspace/project",
});
const gitRefNameCodec = boundedString({ maxBytes: 1024, example: "refs/heads/main" });
const gitDiffSelectorCodec = unionOf([
  objectCodec({ kind: literal("working-tree") }),
  objectCodec({ kind: literal("staged") }),
  objectCodec({ kind: literal("objects"), baseObjectDigest: sha256, targetObjectDigest: sha256 }),
]);
const gitLogCursorCodec = objectCodec({ repositoryStateDigest: sha256, afterObjectDigest: sha256 });
const gitLogRequestCodec = objectCodec({ limit: integer({ minimum: 1, maximum: 128 }) }, { cursor: gitLogCursorCodec });
const repositoryReadCommonFields = {
  credential: credentialCodec,
  projectId: identifier,
  snapshotRevision: positiveInteger,
  diff: gitDiffSelectorCodec,
  log: gitLogRequestCodec,
};
const gitRepositoryReadInputCodec = unionOf([
  objectCodec({
    ...repositoryReadCommonFields,
    target: objectCodec({ kind: literal("project-root") }),
  }, { projectSessionId: identifier }),
  objectCodec({
    ...repositoryReadCommonFields,
    projectSessionId: identifier,
    target: objectCodec({
      kind: literal("session-worktree"),
      canonicalWorktreePath: canonicalAbsoluteFilesystemPathCodec,
    }),
  }),
]);
const gitHeadCodec = unionOf([
  objectCodec({ detached: literal(false), refName: gitRefNameCodec, objectDigest: sha256 }),
  objectCodec({ detached: literal(true), objectDigest: sha256 }),
]);
const gitPathPageCodec = objectCodec({
  paths: arrayOf(relativePath, { maximum: 256, unique: true }),
  truncated: boolean,
});
const gitOperationStateCodec = unionOf([
  objectCodec({ kind: literal("clean") }),
  objectCodec({ kind: literal("merge") }),
  objectCodec({ kind: literal("rebase") }),
  objectCodec({ kind: literal("cherry-pick") }),
  objectCodec({ kind: literal("bisect") }),
]);
const gitUpstreamIdentityCodec = objectCodec({ remoteName: identifier, branchName: gitRefNameCodec });
const gitUpstreamCodec = objectCodec({
  remoteName: identifier,
  branchName: gitRefNameCodec,
  ahead: integer(),
  behind: integer(),
});
const gitHostedChecksCodec = objectCodec({
  repository: boundedString({ maxBytes: 1024 }),
  headObjectDigest: sha256,
  state: enumeration(["passing", "failing", "pending", "unknown"]),
  total: integer(),
  passing: integer(),
  failing: integer(),
  pending: integer(),
});
const gitDiffProjectionCodec = objectCodec({
  selector: gitDiffSelectorCodec,
  artifactRef: artifactRefCodec,
  baseDigest: sha256,
  targetDigest: sha256,
});
const gitLogEntryCodec = objectCodec({
  objectDigest: sha256,
  parentObjectDigests: arrayOf(sha256, { maximum: 64, unique: true }),
  subject: boundedString({ maxBytes: 1024 }),
  authorTimestamp: timestamp,
});
const gitLogPageCodec = unionOf([
  objectCodec({
    items: arrayOf(gitLogEntryCodec, { maximum: 128 }),
    hasMore: literal(false),
    nextCursor: literal(null),
  }),
  objectCodec({
    items: arrayOf(gitLogEntryCodec, { maximum: 128 }),
    hasMore: literal(true),
    nextCursor: gitLogCursorCodec,
  }),
]);
const gitBranchRecordCodec = objectCodec({
  refName: gitRefNameCodec,
  objectDigest: sha256,
  checkedOut: boolean,
  upstream: nullable(gitUpstreamIdentityCodec),
});
const gitWorktreeRecordCodec = objectCodec({
  canonicalPath: canonicalAbsoluteFilesystemPathCodec,
  head: gitHeadCodec,
  current: boolean,
  locked: boolean,
});
const gitRepositoryProjectionCodec = objectCodec({
  freshness: enumeration(["live", "snapshot", "stale"]),
  source: literal("git"),
  revision: positiveInteger,
  observedAt: timestamp,
  canonicalRepositoryRoot: canonicalAbsoluteFilesystemPathCodec,
  canonicalWorktreePath: canonicalAbsoluteFilesystemPathCodec,
  repositoryStateDigest: sha256,
  head: gitHeadCodec,
  headDigest: sha256,
  indexDigest: sha256,
  worktreeDigest: sha256,
  remoteDigest: sha256,
  changes: objectCodec({
    staged: gitPathPageCodec,
    unstaged: gitPathPageCodec,
    untracked: gitPathPageCodec,
    conflicted: gitPathPageCodec,
  }),
  operationState: gitOperationStateCodec,
  upstream: nullable(gitUpstreamCodec),
  diff: gitDiffProjectionCodec,
  log: gitLogPageCodec,
  branches: objectCodec({ items: arrayOf(gitBranchRecordCodec, { maximum: 128 }), truncated: boolean }),
  worktrees: objectCodec({ items: arrayOf(gitWorktreeRecordCodec, { maximum: 64 }), truncated: boolean }),
  hostedChecks: projectionFact(nullable(gitHostedChecksCodec), literal("github")),
});
const gitRepositorySummaryCodec = objectCodec({
  freshness: enumeration(["live", "snapshot", "stale"]),
  source: literal("git"),
  revision: positiveInteger,
  observedAt: timestamp,
  repositoryStateDigest: sha256,
  head: gitHeadCodec,
  operationState: enumeration(["clean", "merge", "rebase", "cherry-pick", "bisect"]),
  counts: objectCodec({ staged: integer(), unstaged: integer(), untracked: integer(), conflicted: integer() }),
  pathsTruncated: boolean,
  upstream: nullable(gitUpstreamCodec),
  hostedChecks: projectionFact(nullable(gitHostedChecksCodec), literal("github")),
});
const gitRepositoryReadResultCodec = unionOf([
  objectCodec({
    status: literal("current"),
    projectId: identifier,
    projectSessionId: nullable(identifier),
    snapshotRevision: positiveInteger,
    readTransactionId: identifier,
    repository: gitRepositoryProjectionCodec,
  }),
  objectCodec({
    status: literal("resnapshot-required"),
    reason: literal("snapshot-mismatch"),
    currentSnapshotRevision: positiveInteger,
  }),
]);
const writerAdmissionCodec = objectCodec({
  repositoryRoot: absoluteFilesystemPathCodec,
  worktreePath: absoluteFilesystemPathCodec,
  sourcePrefixes: arrayOf(relativePath, { minimum: 1, maximum: 128, unique: true }),
  writerGeneration: positiveInteger,
});

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
const lifecycleResultCodec = objectCodec({
  agentId: identifier,
  lifecycle: text,
  providerSessionGeneration: positiveInteger,
}, {
  rotation: objectCodec({
    kind: enumeration(["in-place", "replacement-session"]),
    priorResumeReference: identifier,
  }),
});
const providerActionResultCodec = objectCodec({
  actionId: identifier,
  status: enumeration(["prepared", "dispatched", "accepted", "terminal", "ambiguous", "quarantined"]),
  history: textList,
  executionCount: integer(),
  effectCount: integer(),
}, { result: jsonValue });
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
  dimensions: recordOf(budgetDimensionCodec, { maximum: 128, keyPattern: resourceUnitPattern }),
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
  leader: objectCodec({ agentId: identifier, authorityId: identifier, capability: secret }),
  rootTask: taskResultCodec,
  initialMemberAgentIds: stringList,
});

const intakeBindingCodec = objectCodec({
  intakeId: identifier,
  intakeRevision: positiveInteger,
  gateIds: stringList,
  artifactDigests: arrayOf(sha256, { maximum: 128, unique: true }),
});
const taskRequestTaskCodec = objectCodec({
  taskId: identifier,
  taskRevision: positiveInteger,
  objective: text,
  baseRevision: text,
  expectedArtifactPaths: arrayOf(relativePath, { maximum: 128, unique: true }),
});
const taskRequestMessageCodec = objectCodec({
  requestRevision: positiveInteger,
  messageId: identifier,
  conversationId: identifier,
  targetAgentId: identifier,
  targetProviderSessionRef: identifier,
  requiresAck: literal(true),
  dedupeKey: text,
  responseDeadline: timestamp,
  callbackId: identifier,
  callbackGeneration: positiveInteger,
  dependentBarrierId: identifier,
}, { intakeBinding: intakeBindingCodec });
const taskRequestCodec = objectCodec({
  commandId: identifier,
  projectSessionId: identifier,
  coordinationRunId: identifier,
  task: taskRequestTaskCodec,
  request: taskRequestMessageCodec,
});
const replyCodec = objectCodec({
  messageId: identifier,
  conversationId: identifier,
  replyToMessageId: identifier,
  body: boundedString({ maxBytes: 4096 }),
  artifactRefs: artifactRefsCodec,
});
const terminalResultCodec = objectCodec({
  status: literal("complete"),
  summary: text,
  completedAt: timestamp,
});
const taskCompletionCodec = objectCodec({
  commandId: identifier,
  taskId: identifier,
  expectedTaskRevision: positiveInteger,
  ownerLeaseId: identifier,
  ownerLeaseGeneration: positiveInteger,
  requestMessageId: identifier,
  expectedRequestRevision: positiveInteger,
  callbackId: identifier,
  callbackGeneration: positiveInteger,
  reply: replyCodec,
  terminalResult: terminalResultCodec,
});

const resultDeliveryBase = {
  resultDeliveryId: identifier,
  revision: positiveInteger,
  projectSessionId: identifier,
  taskId: identifier,
  requestMessageId: identifier,
  requestRevision: positiveInteger,
  replyMessageId: identifier,
  replyRevision: positiveInteger,
  taskRevision: positiveInteger,
  callbackId: identifier,
  callbackGeneration: positiveInteger,
  assignmentGeneration: positiveInteger,
  targetAgentId: identifier,
  targetProviderSessionRef: identifier,
  payloadDigest: sha256,
  responseDeadline: timestamp,
  dependentBarrierId: identifier,
  required: boolean,
  claimGeneration: integer(),
};
const resultDeliveryCodec = unionOf([
  objectCodec({ ...resultDeliveryBase, state: literal("pending") }),
  objectCodec({
    ...resultDeliveryBase,
    state: literal("claimed"),
    claimedByAgentId: identifier,
    claimDeadline: timestamp,
  }),
  objectCodec({
    ...resultDeliveryBase,
    state: literal("provider-accepted"),
    claimedByAgentId: identifier,
    claimDeadline: timestamp,
    providerAcceptedAt: timestamp,
  }),
  objectCodec({ ...resultDeliveryBase, state: literal("consumed"), consumedAt: timestamp }),
  objectCodec({ ...resultDeliveryBase, state: literal("overdue"), overdueAt: timestamp }),
  objectCodec({ ...resultDeliveryBase, state: literal("abandoned"), abandonedAt: timestamp, reason: text }),
]);

const integrationContextCodec = objectCodec({
  commandId: identifier,
  integrationId: identifier,
  expectedIntegrationGeneration: positiveInteger,
  eventId: identifier,
  eventDigest: sha256,
});
const providerEventCodec = objectCodec({
  providerId: identifier,
  providerSessionRef: identifier,
  providerMessageId: identifier,
  inputEventId: identifier,
  eventDigest: sha256,
  classification: literal("direct-human"),
});
const gateBindingCodec = objectCodec({
  gateId: identifier,
  expectedGateRevision: positiveInteger,
  artifactDigests: arrayOf(sha256, { minimum: 1, maximum: 128, unique: true }),
  interpretedDecision: enumeration(["approve", "reject", "defer", "request-changes"]),
});
const attestationCodec = objectCodec({
  attestationId: identifier,
  integrationId: identifier,
  integrationGeneration: positiveInteger,
  operatorId: identifier,
  projectId: identifier,
  projectSessionId: identifier,
  providerEvent: providerEventCodec,
  humanUtterance: text,
  gateBinding: gateBindingCodec,
  recordedAt: timestamp,
});

const intakeDraftCodec = objectCodec({
  intakeId: identifier,
  projectId: identifier,
  revision: positiveInteger,
  state: literal("draft"),
  dedupeKey: text,
  summary: text,
  artifactRefs: artifactRefsCodec,
  gateIds: stringList,
});
const boundIntakeCodec = objectCodec({
  intakeId: identifier,
  projectId: identifier,
  projectSessionId: identifier,
  coordinationRunId: identifier,
  revision: positiveInteger,
  state: enumeration(["awaiting-chair", "discussing", "awaiting-human", "accepted", "deferred", "cancelled"]),
  dedupeKey: text,
  summary: text,
  artifactRefs: artifactRefsCodec,
  gateIds: stringList,
});
const intakeCodec = unionOf([intakeDraftCodec, boundIntakeCodec]);
const intakeDraftCreateBaseCodec = objectCodec({
  command: operatorMutationCodec,
  intakeId: identifier,
  dedupeKey: text,
  summary: text,
  artifactRefs: artifactRefsCodec,
  gateIds: stringList,
});
const intakeDraftCreateCodec = parserBacked(
  intakeDraftCreateBaseCodec,
  parseIntakeDraftCreateRequest,
  parseIntakeDraftCreateRequest({
    ...intakeDraftCreateBaseCodec.example,
    command: { ...operatorMutationCodec.example, expectedRevision: 0 },
  }),
);

const gateScopeCodec = unionOf([
  objectCodec({ kind: literal("task"), taskId: identifier }),
  objectCodec({ kind: literal("subtree"), rootTaskId: identifier }),
  objectCodec({ kind: literal("run") }),
  objectCodec({ kind: literal("release") }),
]);
const releaseBindingCodec = objectCodec({
  acceptedDeliveryReceiptRef: artifactRefCodec,
  artifactDigest: sha256,
  promotionAction: text,
  target: text,
});

const operatorRevisionTargetCodec = unionOf([
  objectCodec({
    kind: literal("task"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    taskId: identifier,
    expectedRevision: positiveInteger,
  }),
  objectCodec({
    kind: literal("subtree"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    rootTaskId: identifier,
    expectedRevision: positiveInteger,
  }),
  objectCodec({
    kind: literal("run"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    expectedRevision: positiveInteger,
  }),
  objectCodec({
    kind: literal("session"),
    projectSessionId: identifier,
    expectedRevision: positiveInteger,
    expectedGeneration: positiveInteger,
  }),
]);

const gitRepositoryBindingCodec = objectCodec({
  repositoryRoot: absoluteFilesystemPathCodec,
  worktreePath: absoluteFilesystemPathCodec,
  remoteName: identifier,
  expectedHeadDigest: sha256,
  expectedIndexDigest: sha256,
  expectedWorktreeDigest: sha256,
  expectedRemoteDigest: sha256,
});
const gitCommitObjectCodec = objectCodec({ kind: literal("commit"), objectName: identifier, objectDigest: sha256 });
const gitTagObjectCodec = objectCodec({ kind: literal("tag"), objectName: identifier, objectDigest: sha256 });
const gitLocalBranchObjectCodec = objectCodec({
  kind: literal("local-branch"),
  objectName: identifier,
  objectDigest: sha256,
});
const gitRemoteRefObjectCodec = objectCodec({
  kind: literal("remote-ref"),
  remoteName: identifier,
  objectName: identifier,
  objectDigest: sha256,
});
const gitTrackingRefObjectCodec = objectCodec({
  kind: literal("tracking-ref"),
  remoteName: identifier,
  objectName: identifier,
  objectDigest: sha256,
});
const gitObjectIntentCodec = unionOf([
  gitCommitObjectCodec,
  gitTagObjectCodec,
  gitLocalBranchObjectCodec,
  gitRemoteRefObjectCodec,
  gitTrackingRefObjectCodec,
]);
const gitPushPolicyCodec = unionOf([
  objectCodec({ kind: literal("fast-forward-only") }),
  objectCodec({ kind: literal("force-with-lease"), expectedRemoteObjectDigest: sha256 }),
]);
const gitEffectCodec = unionOf([
  objectCodec({ effect: literal("fetch"), source: gitRemoteRefObjectCodec, destination: gitTrackingRefObjectCodec }),
  objectCodec({
    effect: literal("pull"),
    source: gitRemoteRefObjectCodec,
    destination: gitLocalBranchObjectCodec,
    strategy: enumeration(["fast-forward-only", "merge", "rebase"]),
  }),
  objectCodec({ effect: literal("stage"), paths: arrayOf(relativePath, { minimum: 1, maximum: 256, unique: true }) }),
  objectCodec({ effect: literal("unstage"), paths: arrayOf(relativePath, { minimum: 1, maximum: 256, unique: true }) }),
  objectCodec({
    effect: literal("commit"),
    sourceIndexDigest: sha256,
    destination: gitCommitObjectCodec,
    message: text,
  }),
  objectCodec({ effect: literal("merge"), source: gitObjectIntentCodec, destination: gitLocalBranchObjectCodec }),
  objectCodec({ effect: literal("rebase"), source: gitLocalBranchObjectCodec, destination: gitObjectIntentCodec }),
  objectCodec({
    effect: literal("push"),
    source: gitLocalBranchObjectCodec,
    destination: gitRemoteRefObjectCodec,
    policy: gitPushPolicyCodec,
  }),
  objectCodec({
    effect: literal("branch"),
    action: literal("create"),
    source: gitObjectIntentCodec,
    destination: gitLocalBranchObjectCodec,
  }),
  objectCodec({ effect: literal("branch"), action: literal("delete"), source: gitLocalBranchObjectCodec }),
  objectCodec({
    effect: literal("branch"),
    action: literal("rename"),
    source: gitLocalBranchObjectCodec,
    destination: gitLocalBranchObjectCodec,
  }),
  objectCodec({
    effect: literal("worktree"),
    action: literal("create"),
    destinationWorktreePath: absoluteFilesystemPathCodec,
    source: gitObjectIntentCodec,
  }),
  objectCodec({
    effect: literal("worktree"),
    action: literal("remove"),
    sourceWorktreePath: absoluteFilesystemPathCodec,
    expectedWorktreeDigest: sha256,
  }),
  objectCodec({
    effect: literal("worktree"),
    action: literal("move"),
    sourceWorktreePath: absoluteFilesystemPathCodec,
    destinationWorktreePath: absoluteFilesystemPathCodec,
    expectedWorktreeDigest: sha256,
  }),
]);

const operatorActionIntentCodec = unionOf([
  objectCodec({ kind: literal("control"), action: literal("pause"), target: operatorRevisionTargetCodec }),
  objectCodec({ kind: literal("control"), action: literal("resume"), target: operatorRevisionTargetCodec }),
  objectCodec({ kind: literal("control"), action: literal("cancel"), target: operatorRevisionTargetCodec, reason: text }),
  objectCodec({
    kind: literal("control"),
    action: literal("steer"),
    target: operatorRevisionTargetCodec,
    instruction: text,
    evidenceRefs: artifactRefsCodec,
  }),
  objectCodec({
    kind: literal("project-session-launch"),
    projectId: identifier,
    projectSessionId: identifier,
    expectedSessionRevision: positiveInteger,
    expectedSessionGeneration: positiveInteger,
    launchPacketRef: artifactRefCodec,
    authorityRef: sha256,
    budgetRef: identifier,
    resourcePlanRef: artifactRefCodec,
    providerAdapterId: identifier,
    providerActionId: identifier,
  }),
  objectCodec({
    kind: literal("project-session-drain"),
    projectSessionId: identifier,
    expectedSessionRevision: positiveInteger,
    expectedSessionGeneration: positiveInteger,
    expectedGlobalStateRevision: positiveInteger,
  }),
  objectCodec({
    kind: literal("project-session-stop"),
    projectSessionId: identifier,
    expectedSessionRevision: positiveInteger,
    expectedSessionGeneration: positiveInteger,
    expectedGlobalStateRevision: positiveInteger,
    drainReceiptRef: artifactRefCodec,
  }),
  objectCodec({
    kind: literal("daemon-drain"),
    expectedDaemonGeneration: positiveInteger,
    expectedGlobalStateRevision: positiveInteger,
  }),
  objectCodec({
    kind: literal("daemon-stop"),
    expectedDaemonGeneration: positiveInteger,
    expectedGlobalStateRevision: positiveInteger,
    drainReceiptRef: artifactRefCodec,
  }),
  objectCodec({ kind: literal("git"), repository: gitRepositoryBindingCodec, operation: gitEffectCodec }),
  objectCodec({
    kind: literal("registered-external-effect"),
    integrationId: identifier,
    expectedIntegrationGeneration: positiveInteger,
    operationId: identifier,
    contractDigest: sha256,
    requestArtifactRef: artifactRefCodec,
    targetId: identifier,
    expectedTargetRevision: positiveInteger,
    idempotencyKey: text,
  }),
  objectCodec({
    kind: literal("promotion"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    gateId: identifier,
    expectedGateRevision: positiveInteger,
    expectedGateStatus: literal("approved"),
    releaseBinding: releaseBindingCodec,
  }),
]);

const operatorActionPreviewInputCodec = objectCodec({
  command: operatorMutationCodec,
  projectId: identifier,
  intent: operatorActionIntentCodec,
});
const operatorActionPreviewCodec = objectCodec({
  previewId: identifier,
  previewRevision: positiveInteger,
  previewDigest: sha256,
  intent: operatorActionIntentCodec,
  intentDigest: sha256,
  beforeStateDigest: sha256,
  consequenceClass: enumeration(["routine", "consequential", "destructive", "external", "promotion"]),
  evidenceRefs: artifactRefsCodec,
  gateIds: stringList,
  confirmationMode: enumeration(["explicit", "echo"]),
  expiresAt: timestamp,
});
const operatorActionConfirmationCodec = unionOf([
  objectCodec({ kind: literal("explicit"), confirmationId: identifier }),
  objectCodec({ kind: literal("echo"), echoedPreviewDigest: sha256 }),
]);
const operatorActionCommitBaseCodec = objectCodec({
  command: operatorMutationCodec,
  projectId: identifier,
  previewId: identifier,
  expectedPreviewRevision: positiveInteger,
  previewDigest: sha256,
  expectedIntentDigest: sha256,
  confirmation: operatorActionConfirmationCodec,
});
const operatorActionCommitCodec = parserBacked(
  operatorActionCommitBaseCodec,
  (value) => {
    const confirmation = Reflect.get(value as object, "confirmation") as Record<string, unknown>;
    if (confirmation.kind === "echo" && confirmation.echoedPreviewDigest !== Reflect.get(value as object, "previewDigest")) {
      throw new TypeError("operatorActionCommit echoed preview digest does not match");
    }
    return value;
  },
  operatorActionCommitBaseCodec.example,
);
const operatorActionReceiptCodec = objectCodec({
  commandId: identifier,
  previewId: identifier,
  previewRevision: positiveInteger,
  intentDigest: sha256,
  beforeStateDigest: sha256,
  afterStateDigest: sha256,
  evidenceRefs: artifactRefsCodec,
  committedAt: timestamp,
}, { effectRef: artifactRefCodec });
const operatorActionStatusInputCodec = objectCodec({
  credential: credentialCodec,
  projectId: identifier,
  commandId: identifier,
});
const operatorActionReconcileBaseCodec = objectCodec({
  command: operatorMutationCodec,
  projectId: identifier,
  targetCommandId: identifier,
  expectedStatus: enumeration(["pending", "ambiguous"]),
  expectedAttemptGeneration: positiveInteger,
  mode: literal("observe-only"),
});
const operatorActionReconcileCodec = parserBacked(
  operatorActionReconcileBaseCodec,
  (value) => {
    const command = Reflect.get(value as object, "command") as Record<string, unknown>;
    if (command.commandId === Reflect.get(value as object, "targetCommandId")) {
      throw new TypeError("operatorActionReconcile requires a new command ID");
    }
    return value;
  },
  {
    ...operatorActionReconcileBaseCodec.example,
    targetCommandId: "target_command_01",
  },
);
const operatorActionStatusCodec = unionOf([
  objectCodec({ status: literal("not-found"), commandId: identifier }),
  objectCodec({
    status: literal("pending"),
    commandId: identifier,
    intentDigest: sha256,
    phase: enumeration(["prepared", "dispatched", "accepted", "observing"]),
    attemptGeneration: positiveInteger,
  }),
  objectCodec({
    status: literal("ambiguous"),
    commandId: identifier,
    intentDigest: sha256,
    attemptGeneration: positiveInteger,
    effectRef: artifactRefCodec,
  }),
  objectCodec({ status: literal("committed"), commandId: identifier, receipt: operatorActionReceiptCodec }),
  objectCodec({
    status: literal("rejected"),
    commandId: identifier,
    intentDigest: sha256,
    code: enumeration([
      "authority-insufficient",
      "preview-expired",
      "preview-stale",
      "state-changed",
      "generation-stale",
      "git-state-changed",
      "external-contract-unknown",
      "external-contract-stale",
      "release-binding-mismatch",
      "dedupe-conflict",
    ]),
    evidenceRefs: artifactRefsCodec,
  }),
]);

const operatorActionAvailabilityCodec = unionOf([
  objectCodec({
    state: literal("read-only"),
    reason: enumeration(["feature-unavailable", "authority-insufficient", "state-ineligible"]),
  }),
  objectCodec({
    state: literal("available"),
    actions: arrayOf(enumeration([
      "pause",
      "resume",
      "cancel",
      "steer",
      "project-session-launch",
      "project-session-drain",
      "project-session-stop",
      "daemon-drain",
      "daemon-stop",
      "git",
      "registered-external-effect",
      "promotion",
    ]), { minimum: 1, maximum: 12, unique: true }),
    requiresPreview: literal(true),
  }),
]);

const operatorDetailRefCodec = unionOf([
  objectCodec({ kind: literal("project"), projectId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("session"), projectSessionId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("run"), coordinationRunId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("task"), taskId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("agent"), agentId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("evidence"), evidenceId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("activity"), eventId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("system"), componentId: identifier, expectedRevision: positiveInteger }),
]);
const projectDetailRefCodec = objectCodec({
  kind: literal("project"),
  projectId: identifier,
  expectedRevision: positiveInteger,
});
const runDetailRefCodec = objectCodec({
  kind: literal("run"),
  coordinationRunId: identifier,
  expectedRevision: positiveInteger,
});
const taskDetailRefCodec = objectCodec({ kind: literal("task"), taskId: identifier, expectedRevision: positiveInteger });
const agentDetailRefCodec = objectCodec({ kind: literal("agent"), agentId: identifier, expectedRevision: positiveInteger });
const evidenceDetailRefCodec = objectCodec({
  kind: literal("evidence"),
  evidenceId: identifier,
  expectedRevision: positiveInteger,
});
const activityDetailRefCodec = objectCodec({
  kind: literal("activity"),
  eventId: identifier,
  expectedRevision: positiveInteger,
});
const systemDetailRefCodec = objectCodec({
  kind: literal("system"),
  componentId: identifier,
  expectedRevision: positiveInteger,
});
const messageBodyRefCodec = objectCodec({
  projectSessionId: identifier,
  messageId: identifier,
  expectedRevision: positiveInteger,
});

const attentionSummaryCodec = objectCodec({
  kind: literal("attention"),
  label: enumeration(["Decision", "Approval", "Blocked", "FYI"]),
  priority: enumeration(["safety-integrity", "critical-path", "expiring-authority", "acceptance-ready", "advisory"]),
  title: text,
});
const projectSummaryCodec = objectCodec(
  { kind: literal("project"), goal: text, repositoryRevision: text },
  { repository: gitRepositorySummaryCodec },
);
const runSummaryCodec = objectCodec({
  kind: literal("run"),
  phase: text,
  health: enumeration(["healthy", "degraded", "blocked", "quarantined", "unknown"]),
  nextMilestone: text,
});
const workSummaryCodec = objectCodec({
  kind: literal("work"),
  state: text,
  checkState: enumeration(["pending", "passing", "failing", "unknown"]),
});
const agentSummaryCodec = objectCodec({
  kind: literal("agent"),
  role: enumeration(["chair", "lead", "worker", "reviewer"]),
  lifecycle: text,
  contextPressure: enumeration(["low", "medium", "high", "unknown"]),
});
const evidenceSummaryCodec = objectCodec({
  kind: literal("evidence"),
  evidenceKind: enumeration(["artifact", "diff", "test", "review", "receipt"]),
  status: enumeration(["pass", "fail", "pending", "informational"]),
  provenance: text,
});
const activitySummaryFields = {
  kind: literal("activity"),
  summary: text,
  occurredAt: timestamp,
};
const activitySummaryCodec = unionOf([
  objectCodec({
    ...activitySummaryFields,
    activityKind: literal("message"),
    messageBodyRef: messageBodyRefCodec,
  }),
  objectCodec({
    ...activitySummaryFields,
    activityKind: enumeration(["decision", "lifecycle", "operation"]),
  }),
]);
const systemSummaryCodec = objectCodec({
  kind: literal("system"),
  systemKind: enumeration(["daemon", "adapter", "trust", "seat", "integration"]),
  state: enumeration(["healthy", "degraded", "stale", "unavailable", "conflict"]),
  detail: text,
});

function operatorViewRowCodec(summary: Codec<unknown>, detailRef: Codec<unknown>): Codec<unknown> {
  return objectCodec({
    itemId: identifier,
    itemRevision: positiveInteger,
    fact: projectionFact(objectCodec({ summary, detailRef, actionAvailability: operatorActionAvailabilityCodec })),
  });
}

const attentionRowCodec = operatorViewRowCodec(attentionSummaryCodec, operatorDetailRefCodec);
const projectRowCodec = operatorViewRowCodec(projectSummaryCodec, projectDetailRefCodec);
const runRowCodec = operatorViewRowCodec(runSummaryCodec, runDetailRefCodec);
const workRowCodec = operatorViewRowCodec(workSummaryCodec, taskDetailRefCodec);
const agentRowCodecV2 = operatorViewRowCodec(agentSummaryCodec, agentDetailRefCodec);
const evidenceRowCodec = operatorViewRowCodec(evidenceSummaryCodec, evidenceDetailRefCodec);
const activityRowCodec = operatorViewRowCodec(activitySummaryCodec, activityDetailRefCodec);
const systemRowCodec = operatorViewRowCodec(systemSummaryCodec, systemDetailRefCodec);

function operatorViewPageVariant(view: string, row: Codec<unknown>): Codec<unknown> {
  return objectCodec({
    status: literal("page"),
    view: literal(view),
    rows: arrayOf(row, { maximum: 256 }),
    nextCursor: integer(),
    hasMore: boolean,
    snapshotRevision: positiveInteger,
    readTransactionId: identifier,
  });
}
const operatorViewPageInputCodec = objectCodec({
  credential: credentialCodec,
  projectId: identifier,
  view: enumeration(["attention", "project", "runs", "work", "agents", "evidence", "activity", "system"]),
  snapshotRevision: positiveInteger,
  cursor: integer(),
  limit: integer({ minimum: 1, maximum: 256 }),
}, { projectSessionId: identifier });
const operatorViewPageBaseCodec = unionOf([
  operatorViewPageVariant("attention", attentionRowCodec),
  operatorViewPageVariant("project", projectRowCodec),
  operatorViewPageVariant("runs", runRowCodec),
  operatorViewPageVariant("work", workRowCodec),
  operatorViewPageVariant("agents", agentRowCodecV2),
  operatorViewPageVariant("evidence", evidenceRowCodec),
  operatorViewPageVariant("activity", activityRowCodec),
  operatorViewPageVariant("system", systemRowCodec),
  objectCodec({
    status: literal("resnapshot-required"),
    view: enumeration(["attention", "project", "runs", "work", "agents", "evidence", "activity", "system"]),
    reason: enumeration(["snapshot-mismatch", "retention-gap", "project-cursor-mismatch", "cursor-overflow"]),
    currentSnapshotRevision: positiveInteger,
    snapshotCursor: integer(),
  }),
]);
const operatorViewPageResultCodec = parserBacked(
  operatorViewPageBaseCodec,
  (value) => {
    if (Reflect.get(value as object, "status") !== "page") return value;
    const rows = Reflect.get(value as object, "rows") as Array<Record<string, unknown>>;
    for (const [index, row] of rows.entries()) {
      const fact = row.fact as Record<string, unknown>;
      if (row.itemRevision !== fact.revision) {
        throw new TypeError(`operatorViewPage.rows[${String(index)}] item revision does not match fact revision`);
      }
    }
    return value;
  },
  operatorViewPageBaseCodec.example,
);

const operatorDetailCodec = unionOf([
  objectCodec(
    { kind: literal("project"), projectId: identifier, canonicalRoot: absoluteFilesystemPathCodec, goal: text, repositoryRevision: text },
    { repository: gitRepositoryProjectionCodec },
  ),
  objectCodec({
    kind: literal("session"),
    projectSessionId: identifier,
    mode: enumeration(["coordinated", "independent"]),
    state: enumeration([
      "draft", "awaiting_launch", "launching", "active", "quiescing", "awaiting_acceptance", "closed",
      "launch_failed", "launch_ambiguous", "reconciling", "visibility_degraded", "recovery_required",
      "quarantined", "cancelled",
    ]),
    generation: positiveInteger,
    membershipRevision: integer(),
  }),
  objectCodec({
    kind: literal("run"),
    coordinationRunId: identifier,
    phase: text,
    chairAgentId: identifier,
    chairGeneration: positiveInteger,
    health: enumeration(["healthy", "degraded", "blocked", "quarantined", "unknown"]),
  }),
  objectCodec({ kind: literal("task"), taskId: identifier, objective: text, state: text, ownerAgentId: nullable(identifier) }),
  objectCodec({
    kind: literal("agent"),
    agentId: identifier,
    role: enumeration(["chair", "lead", "worker", "reviewer"]),
    lifecycle: text,
    provider: text,
    providerSessionGeneration: positiveInteger,
  }),
  objectCodec({
    kind: literal("evidence"),
    evidenceId: identifier,
    evidenceKind: enumeration(["artifact", "diff", "test", "review", "receipt"]),
    artifactRef: artifactRefCodec,
    status: enumeration(["pass", "fail", "pending", "informational"]),
  }),
  objectCodec({
    kind: literal("activity"),
    eventId: identifier,
    activityKind: literal("message"),
    summary: text,
    occurredAt: timestamp,
    messageBodyRef: messageBodyRefCodec,
  }),
  objectCodec({
    kind: literal("activity"),
    eventId: identifier,
    activityKind: enumeration(["decision", "lifecycle", "operation"]),
    summary: text,
    occurredAt: timestamp,
  }),
  objectCodec({
    kind: literal("system"),
    componentId: identifier,
    systemKind: enumeration(["daemon", "adapter", "trust", "seat", "integration"]),
    state: enumeration(["healthy", "degraded", "stale", "unavailable", "conflict"]),
    generation: positiveInteger,
    detail: text,
  }),
]);
const operatorDetailReadInputCodec = objectCodec({
  credential: credentialCodec,
  projectId: identifier,
  snapshotRevision: positiveInteger,
  detailRef: operatorDetailRefCodec,
}, { projectSessionId: identifier });
const operatorDetailReadBaseCodec = unionOf([
  objectCodec({
    status: literal("current"),
    detailRef: operatorDetailRefCodec,
    detail: projectionFact(operatorDetailCodec),
    snapshotRevision: positiveInteger,
    readTransactionId: identifier,
  }),
  objectCodec({
    status: literal("resnapshot-required"),
    reason: enumeration(["snapshot-mismatch", "detail-revision-changed"]),
    currentSnapshotRevision: positiveInteger,
  }),
]);
const operatorDetailReadResultCodec = parserBacked(
  operatorDetailReadBaseCodec,
  (value) => {
    if (Reflect.get(value as object, "status") !== "current") return value;
    const detailRef = Reflect.get(value as object, "detailRef") as Record<string, unknown>;
    const fact = Reflect.get(value as object, "detail") as Record<string, unknown>;
    if (detailRef.expectedRevision !== fact.revision) {
      throw new TypeError("operatorDetailRead detail revision does not match reference");
    }
    const values: Record<string, unknown>[] = fact.freshness === "conflict"
      ? fact.candidates as Record<string, unknown>[]
      : fact.freshness === "unavailable"
        ? []
        : [fact.value as Record<string, unknown>];
    if (values.some((detail) => detail.kind !== detailRef.kind)) {
      throw new TypeError("operatorDetailRead detail kind does not match reference");
    }
    return value;
  },
  operatorDetailReadBaseCodec.example,
);
const gateIntentCodec = objectCodec({
  projectSessionId: identifier,
  coordinationRunId: identifier,
  dedupeKey: text,
  scope: gateScopeCodec,
  blockedOperationIds: arrayOf(activeOperationCodec, { maximum: 128, unique: true }),
  enforcementPoints: arrayOf(enumeration(["task-readiness", "operation", "scoped-barrier"]), {
    minimum: 1,
    maximum: 3,
    unique: true,
  }),
  question: text,
  reason: text,
  options: arrayOf(text, { minimum: 1, maximum: 64 }),
  recommendation: optionalText,
  consequences: textList,
  evidenceRefs: artifactRefsCodec,
}, { deadline: timestamp, default: text, releaseBinding: releaseBindingCodec });
const intakeRevisionCommonFields = {
  intakeId: identifier,
  projectSessionId: identifier,
  coordinationRunId: identifier,
  expectedRevision: positiveInteger,
  state: enumeration(["awaiting-chair", "discussing", "awaiting-human", "accepted", "deferred", "cancelled"]),
  summary: text,
  artifactRefs: artifactRefsCodec,
  gateIds: stringList,
};
const intakeRevisionCodec = unionOf([
  objectCodec({
    origin: literal("operator"),
    command: operatorMutationCodec,
    ...intakeRevisionCommonFields,
  }, { chairRequest: taskRequestCodec }),
  objectCodec({
    origin: literal("chair"),
    command: chairMutationCodec,
    ...intakeRevisionCommonFields,
  }, { chairRequest: taskRequestCodec }),
]);
const gateCreateCodec = unionOf([
  objectCodec({ origin: literal("operator"), command: operatorMutationCodec, intent: gateIntentCodec }),
  objectCodec({ origin: literal("chair"), command: chairMutationCodec, intent: gateIntentCodec }),
]);
const typedDecisionEvidenceCodec = objectCodec({
  kind: literal("typed-console"),
  confirmationCommandId: identifier,
});
const attestedDecisionEvidenceCodec = objectCodec({
  kind: literal("attested-input"),
  attestationId: identifier,
  expectedIntegrationGeneration: positiveInteger,
});
const decisionEvidenceCodec = unionOf([typedDecisionEvidenceCodec, attestedDecisionEvidenceCodec]);

const scopedGateCheckCodec = unionOf([
  objectCodec({
    projectSessionId: identifier,
    coordinationRunId: identifier,
    dependencyRevision: integer(),
    enforcementPoint: literal("task-readiness"),
    taskId: identifier,
  }),
  objectCodec({
    projectSessionId: identifier,
    coordinationRunId: identifier,
    dependencyRevision: integer(),
    enforcementPoint: literal("operation"),
    operationId: activeOperationCodec,
  }),
  objectCodec({
    projectSessionId: identifier,
    coordinationRunId: identifier,
    dependencyRevision: integer(),
    enforcementPoint: literal("scoped-barrier"),
    barrierId: identifier,
  }),
]);
const scopedGateReadInputCodec = objectCodec({
  credential: credentialCodec,
  projectId: identifier,
  projectSessionId: identifier,
  gateId: identifier,
}, { expectedRevision: positiveInteger });

function memberVariants(kind: string, identityField: string): Codec<unknown>[] {
  const identity = {
    kind: literal(kind),
    membershipId: identifier,
    coordinationRunId: identifier,
    [identityField]: identifier,
  };
  return [
    objectCodec({ ...identity, state: literal("active") }),
    objectCodec({ ...identity, state: literal("terminal") }),
    objectCodec({ ...identity, state: literal("abandoned"), reason: text }),
  ];
}
const projectSessionMemberCodec = unionOf([
  ...memberVariants("coordination-run", "runId"),
  ...memberVariants("workstream", "workstreamId"),
  ...memberVariants("task", "taskId"),
  ...memberVariants("lease", "leaseId"),
  ...memberVariants("provider-action", "providerActionId"),
  ...memberVariants("required-message", "messageId"),
  ...memberVariants("artifact-obligation", "artifactObligationId"),
  ...memberVariants("gate", "gateId"),
  ...memberVariants("scoped-barrier", "barrierId"),
] as [Codec<unknown>, ...Codec<unknown>[]]);
const membershipBindCodec = unionOf([
  objectCodec({
    origin: literal("operator"),
    command: operatorMutationCodec,
    projectSessionId: identifier,
    coordinationRunId: identifier,
    expectedMembershipRevision: integer(),
    members: arrayOf(projectSessionMemberCodec, { maximum: 256 }),
  }),
  objectCodec({
    origin: literal("chair"),
    command: chairMutationCodec,
    projectSessionId: identifier,
    coordinationRunId: identifier,
    expectedMembershipRevision: positiveInteger,
    members: arrayOf(projectSessionMemberCodec, { maximum: 256 }),
  }),
]);

const resourceDimensionCodec = unionOf([
  objectCodec({ unknown: literal(false), used: integer(), reserved: integer(), remaining: integer() }),
  objectCodec({ unknown: literal(true), used: nullable(integer()), reserved: integer(), remaining: literal(null) }),
]);

const typedGateResolutionCodec = objectCodec({
  kind: literal("typed-console"),
  operatorId: identifier,
  confirmationCommandId: identifier,
  decidedAt: timestamp,
  evidenceRefs: artifactRefsCodec,
});
const attestedGateResolutionCodec = objectCodec({
  kind: literal("attested-input"),
  operatorId: identifier,
  attestationId: identifier,
  integrationId: identifier,
  integrationGeneration: positiveInteger,
  decidedAt: timestamp,
  evidenceRefs: artifactRefsCodec,
});
const gateResolutionCodec = unionOf([typedGateResolutionCodec, attestedGateResolutionCodec]);

const projectIdentityCodec = objectCodec({ projectId: identifier, canonicalRoot: text });
const projectViewItemCodec = objectCodec({
  projectId: identifier,
  goal: text,
  acceptedScopeRef: nullable(artifactRefCodec),
  repositoryRevision: text,
  github: projectionFact(objectCodec({ repository: text, openPullRequests: integer() })),
});
const workViewItemCodec = objectCodec({
  taskId: identifier,
  workstreamId: nullable(identifier),
  parentTaskId: nullable(identifier),
  state: text,
  ownerAgentId: nullable(identifier),
  sourcePrefixes: arrayOf(relativePath, { maximum: 128, unique: true }),
  worktreePath: nullable(text),
  barrierIds: stringList,
  checkState: enumeration(["pending", "passing", "failing", "unknown"]),
});
const agentViewItemCodec = objectCodec({
  agentId: identifier,
  stableTaskId: nullable(identifier),
  stableWorkstreamId: nullable(identifier),
  role: enumeration(["chair", "lead", "worker", "reviewer"]),
  provider: text,
  modelFamily: text,
  providerSessionRef: nullable(identifier),
  providerSessionGeneration: integer(),
  lifecycle: text,
  contextPressure: enumeration(["low", "medium", "high", "unknown"]),
  visibility: projectionFact(objectCodec({ paneRef: nullable(identifier) })),
});
const evidenceViewItemCodec = objectCodec({
  evidenceId: identifier,
  kind: enumeration(["artifact", "diff", "test", "review", "receipt"]),
  artifactRef: artifactRefCodec,
  taskId: nullable(identifier),
  provenance: text,
  status: enumeration(["pass", "fail", "pending", "informational"]),
});
const activityViewItemFields = {
  eventId: identifier,
  actorId: nullable(identifier),
  taskId: nullable(identifier),
  summary: text,
  occurredAt: timestamp,
  sourceRevision: integer(),
};
const activityViewItemCodec = unionOf([
  objectCodec({ ...activityViewItemFields, kind: literal("message"), messageBodyRef: messageBodyRefCodec }),
  objectCodec({ ...activityViewItemFields, kind: enumeration(["decision", "lifecycle", "operation"]) }),
]);
const systemViewItemCodec = objectCodec({
  componentId: identifier,
  kind: enumeration(["daemon", "adapter", "trust", "seat", "integration"]),
  state: enumeration(["healthy", "degraded", "stale", "unavailable", "conflict"]),
  generation: integer(),
  expiresAt: nullable(timestamp),
  detail: text,
});
function projectionPageDataCodec(itemCodec: Codec<unknown>): Codec<unknown> {
  return projectionFact(objectCodec({
    items: arrayOf(itemCodec, { maximum: 256 }),
    nextCursor: integer(),
    hasMore: boolean,
  }));
}
const projectionPageResultCodec = unionOf([
  objectCodec({ view: literal("attention"), page: projectionPageDataCodec(attentionItemCodec) }),
  objectCodec({ view: literal("project"), page: projectionPageDataCodec(projectViewItemCodec) }),
  objectCodec({ view: literal("runs"), page: projectionPageDataCodec(runProjectionCodec) }),
  objectCodec({ view: literal("work"), page: projectionPageDataCodec(workViewItemCodec) }),
  objectCodec({ view: literal("agents"), page: projectionPageDataCodec(agentViewItemCodec) }),
  objectCodec({ view: literal("evidence"), page: projectionPageDataCodec(evidenceViewItemCodec) }),
  objectCodec({ view: literal("activity"), page: projectionPageDataCodec(activityViewItemCodec) }),
  objectCodec({ view: literal("system"), page: projectionPageDataCodec(systemViewItemCodec) }),
]);
const projectionEventCodec = objectCodec({
  cursor: positiveInteger,
  projectSessionId: identifier,
  kind: text,
  revision: positiveInteger,
  occurredAt: timestamp,
  payload: jsonValue,
});
const projectSessionDiscoveryCodec = objectCodec({
  projectSessionId: identifier,
  mode: enumeration(["coordinated", "independent"]),
  state: enumeration([
    "draft", "awaiting_launch", "launching", "active", "quiescing", "awaiting_acceptance", "closed",
    "launch_failed", "launch_ambiguous", "reconciling", "visibility_degraded", "recovery_required",
    "quarantined", "cancelled",
  ]),
  revision: positiveInteger,
  generation: positiveInteger,
  lastEventAt: timestamp,
});
const discoveredSessionsCodec = projectionFact(objectCodec({
  items: arrayOf(projectSessionDiscoveryCodec, { maximum: 256 }),
  nextCursor: integer(),
  hasMore: boolean,
}));

const legacyMessageCodec = objectCodec({
  audience: messageAudienceCodec,
  kind: enumeration(["request", "response", "event", "steer", "cancel", "escalate", "ack"]),
  body: boundedString({ maxBytes: 4096 }),
  requiresAck: boolean,
  dedupeKey: text,
}, {
  conversationId: identifier,
  replyToMessageId: identifier,
  taskRevision: positiveInteger,
  hopCount: integer({ maximum: 16 }),
  expiresAt: timestamp,
  context: messageContextCodec,
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
const teamCreateLegacyCodec = objectCodec({
  teamId: identifier,
  leaderAgentId: identifier,
  rootTaskId: identifier,
  commandId: identifier,
}, {
  parentTeamId: identifier,
  ownedTaskIds: stringList,
  memberAgentIds: stringList,
  initialMemberAgentIds: stringList,
  authorityId: identifier,
  budget: numberRecord,
  reservedBudget: numberRecord,
  discussionGroups: arrayOf(discussionGroupCodec, { maximum: 64 }),
});
const teamCreateCodec = unionOf([teamCreateStructuredCodec, teamCreateLegacyCodec]);

const deliveryItemCodec = objectCodec({
  deliveryId: identifier,
  messageId: identifier,
  sequence: positiveInteger,
  body: boundedString({ maxBytes: 4096 }),
  attempt: positiveInteger,
  senderId: identifier,
  kind: enumeration(["request", "response", "event", "steer", "cancel", "escalate", "ack"]),
  requiresAck: boolean,
});
const observerEventCodec = objectCodec({
  cursor: positiveInteger,
  eventId: identifier,
  type: text,
  actorAgentId: nullable(identifier),
  createdAt: integer(),
  summary: text,
});
const receiptCodec = objectCodec({ relativePath, schemaVersion: unionOf([literal(1), literal(2)]), sha256 });

type CodecDirection = "input" | "result";

const timestampFields = new Set([
  "abandonedAt", "claimDeadline", "committedAt", "consumedAt", "deadline", "expiresAt", "extendUntil",
  "lastEventAt", "occurredAt", "overdueAt", "providerAcceptedAt", "recordedAt", "requestedExpiresAt",
  "responseDeadline",
]);
const booleanFields = new Set([
  "allowed", "available", "closed", "detached", "hasMore", "required", "requiresAck",
  "terminalNeutralised", "capabilityValuesRedacted", "acknowledged",
]);
const integerFields = new Set([
  "after", "assignmentGeneration", "attachmentGeneration", "callbackGeneration", "chairGeneration",
  "claimGeneration", "committedRevision", "confirmedPreviewRevision", "contiguousWatermark", "cursor",
  "currentSnapshotRevision", "daemonInstanceGeneration", "dependencyRevision", "depth", "effectCount",
  "executionCount", "expectedAttachmentGeneration", "expectedChairGeneration", "expectedClaimGeneration",
  "expectedDaemonGeneration", "expectedGeneration", "expectedGlobalStateRevision", "expectedMembershipRevision",
  "expectedOwnerLeaseGeneration", "expectedPrincipalGeneration", "expectedRequestRevision", "expectedRevision",
  "expectedSessionGeneration", "expectedTaskRevision", "expectedTeamGeneration", "generation", "globalStateRevision",
  "hopCount", "integrationGeneration", "limit", "membershipRevision", "nextCursor", "ownerLeaseGeneration",
  "principalGeneration", "providerSessionGeneration", "replyRevision", "requestRevision", "revision",
  "runRevision", "schemaVersion", "sessionRevision", "snapshotCursor", "snapshotRevision", "sourceRevision",
  "targetRevision", "taskRevision", "ttlMs", "visibilityTimeoutMs",
]);

function enumField(operation: ProtocolOperation, field: string, direction: CodecDirection): Codec<unknown> | undefined {
  if (field === "schemaVersion" && operation === FABRIC_OPERATIONS.projectionSnapshot && direction === "result") {
    return literal(1);
  }
  if (field === "mode") return enumeration(["coordinated", "independent"]);
  if (field === "view") return enumeration(["attention", "project", "runs", "work", "agents", "evidence", "activity", "system"]);
  if (field === "enforcementPoint") return enumeration(["task-readiness", "operation", "scoped-barrier"]);
  if (field === "source" && operation === FABRIC_OPERATIONS.recordOperatorIntervention) return enumeration(["fabric", "integration"]);
  if (field === "directInputProvenance") return enumeration(["complete", "partial", "unavailable"]);
  if (field === "operation" && operation === FABRIC_OPERATIONS.dispatchProviderAction) {
    return enumeration(["send_turn", "wakeup", "release", "steer"]);
  }
  if (field === "operation" && operation === FABRIC_OPERATIONS.operatorCommand) {
    return enumeration(["read", "decide", "steer", "pause", "resume", "cancel", "drain", "stop", "launch", "takeover", "git", "external-effect"]);
  }
  if (field === "action" && operation === FABRIC_OPERATIONS.requestLifecycle) {
    return enumeration(["compact", "rotate", "completion-ready", "release"]);
  }
  if (field === "action" && operation === FABRIC_OPERATIONS.operatorCommand) {
    return enumeration(["decide", "steer", "pause", "resume", "cancel", "launch", "git", "external-effect"]);
  }
  if (field === "origin" && operation === FABRIC_OPERATIONS.intakeRevise && direction === "input") {
    return enumeration(["operator", "chair"]);
  }
  if (field === "status" && operation === FABRIC_OPERATIONS.recordObjectiveCheck) return enumeration(["pass", "fail"]);
  if (field === "status" && operation === FABRIC_OPERATIONS.abandonDelivery && direction === "result") return literal("abandoned");
  if (field === "status" && operation === FABRIC_OPERATIONS.releaseWriteLease && direction === "result") return literal("released");
  if (field === "status" && operation === FABRIC_OPERATIONS.scopedGateResolve && direction === "input") {
    return enumeration(["approved", "rejected", "deferred", "cancelled"]);
  }
  if (field === "status" && (operation === FABRIC_OPERATIONS.scopedGateCreate || operation === FABRIC_OPERATIONS.scopedGateResolve) && direction === "result") {
    return enumeration(["pending", "deferred", "approved", "rejected", "cancelled", "superseded"]);
  }
  if (field === "kind" && (operation === FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof || operation === FABRIC_OPERATIONS.recordRevocationProof)) {
    return enumeration(["predecessor-terminal", "os-isolated", "patch-only"]);
  }
  if (field === "kind" && operation === FABRIC_OPERATIONS.recordVisibilityFailure) {
    return enumeration(["herdr-telemetry", "observer-pane", "interactive-tui"]);
  }
  if (field === "state" && (operation === FABRIC_OPERATIONS.daemonDrain || operation === FABRIC_OPERATIONS.daemonStop) && direction === "result") {
    return enumeration(["running", "quiescing", "stopped", "busy"]);
  }
  if (field === "state" && operation === FABRIC_OPERATIONS.updateTask && direction === "input") {
    return enumeration(["complete", "cancelled", "degraded"]);
  }
  if (field === "state" && ([
    FABRIC_OPERATIONS.resourceReserve,
    FABRIC_OPERATIONS.resourceRelease,
    FABRIC_OPERATIONS.resourceReconcile,
  ] as readonly ProtocolOperation[]).includes(operation)) return enumeration(["active", "released", "ambiguous", "reconciled"]);
  if (field === "scope" && operation === FABRIC_OPERATIONS.closeBarrier) return enumeration(["run", "stage"]);
  if (field === "visibility") return enumeration(["degraded", "lost"]);
  if (field === "providerSession") return enumeration(["healthy", "lost"]);
  if (field === "delivery") return enumeration(["active", "frozen"]);
  if (field === "recovery") return literal("reattach-or-rotate");
  return undefined;
}

function semanticFieldCodec(
  operation: ProtocolOperation,
  field: string,
  direction: CodecDirection,
): Codec<unknown> {
  const enumerated = enumField(operation, field, direction);
  if (enumerated !== undefined) return enumerated;
  if (field === "command") return operatorMutationCodec;
  if (field === "credential") return credentialCodec;
  if (field === "provenance") return provenanceCodec;
  if (field === "authority") return authorityCodec;
  if (field === "audience") return messageAudienceCodec;
  if (field === "context") return operation === FABRIC_OPERATIONS.integrationInputAttest
    ? integrationContextCodec
    : messageContextCodec;
  if (field === "checkpoint") return lifecycleCheckpointCodec;
  if (field === "evidence" && operation === FABRIC_OPERATIONS.recoverWriteLease) return recoveryEvidenceCodec;
  if (field === "payload" || field === "result") return jsonValue;
  if (field === "detail") return stringRecord;
  if (field === "leader") return direction === "input" ? teamLeaderCodec : objectCodec({ agentId: identifier, authorityId: identifier, capability: secret });
  if (field === "rootTask") return direction === "input" ? rootTaskInputCodec : taskResultCodec;
  if (field === "initialMembers") return arrayOf(teamMemberCodec, { maximum: 5 });
  if (field === "discussionGroups") return arrayOf(discussionGroupCodec, { maximum: 64 });
  if (field === "transition") return unionOf([
    objectCodec({ to: enumeration([
      "draft", "awaiting_launch", "launching", "active", "quiescing", "launch_failed", "launch_ambiguous",
      "reconciling", "visibility_degraded", "recovery_required", "quarantined",
    ]), reason: text }),
    objectCodec({ to: literal("awaiting_acceptance"), closureEvidence: artifactRefCodec }),
  ]);
  if (field === "terminalPath") return terminalPathCodec;
  if (field === "members") return arrayOf(projectSessionMemberCodec, { maximum: 256 });
  if (field === "attestation") return attestationCodec;
  if (field === "providerEvent") return providerEventCodec;
  if (field === "gateBinding") return gateBindingCodec;
  if (field === "intake") return intakeCodec;
  if (field === "chairRequest" || field === "request") return taskRequestCodec;
  if (field === "intent") return gateIntentCodec;
  if (field === "decisionEvidence") return decisionEvidenceCodec;
  if (field === "scope") {
    if (([FABRIC_OPERATIONS.acquireWriteLease, FABRIC_OPERATIONS.getWriteLease] as readonly ProtocolOperation[]).includes(operation) ||
        direction === "result" && ([
          FABRIC_OPERATIONS.acquireWriteLease,
          FABRIC_OPERATIONS.recoverWriteLease,
          FABRIC_OPERATIONS.renewWriteLease,
          FABRIC_OPERATIONS.getWriteLease,
        ] as readonly ProtocolOperation[]).includes(operation)) return arrayOf(relativePath, { minimum: 1, maximum: 128, unique: true });
    return gateScopeCodec;
  }
  if (field === "path") return arrayOf(resourceScopeCodec, { minimum: 2, maximum: 5 });
  if (field === "writerAdmission") return writerAdmissionCodec;
  if (field === "amounts" || field === "consumed" || field === "reservedBudget" || field === "budget") {
    return field === "amounts" || field === "consumed" ? nonEmptyNumberRecord : numberRecord;
  }
  if (field === "usage") return nullableNumberRecord;
  if (field === "observedUsage") return recordOf(unionOf([integer(), literal("unknown")]), {
    minimum: 1,
    maximum: 128,
    keyPattern: resourceUnitPattern,
    exampleKey: "concurrent_turns",
  });
  if (field === "dimensions") return direction === "input"
    ? nonEmptyNumberRecord
    : recordOf(budgetDimensionCodec, { maximum: 128, keyPattern: resourceUnitPattern });
  if (field === "returned") return numberRecord;
  if (field === "capacity") return operation === FABRIC_OPERATIONS.projectionSnapshot
    ? projectionFact(jsonRecord)
    : recordOf(resourceDimensionCodec, { maximum: 128, keyPattern: resourceUnitPattern });
  if (field === "checkedGateRevisions") return recordOf(positiveInteger, { maximum: 128 });
  if (field === "task") return taskRequestTaskCodec;
  if (field === "reply") return replyCodec;
  if (field === "terminalResult") return terminalResultCodec;
  if (field === "resultDelivery") return resultDeliveryCodec;
  if (field === "project") return projectionFact(projectIdentityCodec);
  if (field === "session") return projectionFact(nullable(projectSessionCodec));
  if (field === "runs") return projectionFact(arrayOf(runProjectionCodec, { maximum: 256 }));
  if (field === "attention") return projectionFact(arrayOf(attentionItemCodec, { maximum: 256 }));
  if (field === "sessions") return discoveredSessionsCodec;
  if (field === "events") return operation === FABRIC_OPERATIONS.projectionEvents
    ? arrayOf(projectionEventCodec, { maximum: 256 })
    : arrayOf(observerEventCodec, { maximum: 256 });
  if (field === "tasks") return arrayOf(taskResultCodec, { maximum: 256 });
  if (field === "agents") return arrayOf(objectCodec({
    agentId: identifier,
    parentAgentId: nullable(identifier),
    lifecycle: text,
  }), { maximum: 256 });
  if (field === "receipts") return arrayOf(objectCodec({ relativePath, sha256, exportedAt: integer() }), { maximum: 256 });
  if (field === "barrier") return objectCodec({ state: enumeration(["open", "closed"]) });
  if (field === "counts") return objectCodec({
    agents: integer(), tasks: integer(), tasksTerminal: integer(), messages: integer(),
    deliveriesUnacknowledged: integer(), leasesActive: integer(),
  });
  if (field === "receipt") return receiptCodec;
  if (field === "rotation") return objectCodec({
    kind: enumeration(["in-place", "replacement-session"]),
    priorResumeReference: identifier,
  });
  if (field === "releaseBinding") return releaseBindingCodec;
  if (field === "resolution") return gateResolutionCodec;
  if (field === "artifactRefs" || field === "evidenceRefs") return artifactRefsCodec;
  if (["launchPacketRef", "handoffRef", "consequencePreviewRef", "drainReceiptRef"].includes(field)) return artifactRefCodec;
  if (field === "relativePath") return relativePath;
  if (["sha256", "authorityRef", "before", "after", "checkpointSha256", "payloadDigest", "receiptDigest", "stateDigest"].includes(field)) {
    if (field === "after" && direction === "input") return integer();
    return sha256;
  }
  if (timestampFields.has(field)) return timestamp;
  if (booleanFields.has(field)) {
    if (["closed", "detached", "acknowledged", "terminalNeutralised", "capabilityValuesRedacted"].includes(field)) return literal(true);
    return boolean;
  }
  if (integerFields.has(field)) return field.toLowerCase().includes("generation") ? positiveInteger : integer();
  if (field.endsWith("Ids")) return stringList;
  if ([
    "dependencies", "eligibleAgentIds", "participantAgentIds", "ownedTaskIds", "memberAgentIds",
    "initialMemberAgentIds", "objectiveChecks", "humanGates", "blockingGateIds", "affectedTaskIds",
  ].includes(field)) return stringList;
  if (field === "expectedArtifacts") return arrayOf(relativePath, { maximum: 128, unique: true });
  if (field === "enforcementPoints") return arrayOf(enumeration(["task-readiness", "operation", "scoped-barrier"]), { minimum: 1, maximum: 3, unique: true });
  if (field === "blockedOperationIds") return arrayOf(identifier, { maximum: 128, unique: true });
  if (field === "options" || field === "consequences" || field === "history") return textList;
  if (field === "acknowledgedAboveWatermark") return integerList;
  if (field === "sourcePrefixes") return arrayOf(relativePath, { minimum: 1, maximum: 128, unique: true });
  if (field === "projectSessionId" && direction === "result" && operation === FABRIC_OPERATIONS.operatorAttach) {
    return nullable(identifier);
  }
  if (field.endsWith("Id") || field.endsWith("Ref") || field === "capability" || field === "actor") {
    return field === "capability" ? secret : identifier;
  }
  if ([
    "baseRevision", "body", "contextRevision", "default", "evidence", "handoffEvidence", "humanUtterance",
    "lifecycle", "objective", "question", "reason", "recommendation", "summary", "target", "title", "type",
  ].includes(field)) return field === "recommendation" ? optionalText : text;
  if (["status", "state", "kind", "origin", "action", "source", "directInputProvenance", "visibility", "providerSession", "delivery", "recovery"].includes(field)) {
    return text;
  }
  throw new Error(`semantic codec missing for ${direction} ${operation}.${field}`);
}

function semanticShapeCodec(
  operation: ProtocolOperation,
  direction: CodecDirection,
  shape: WireShape,
): Codec<unknown> {
  if (shape.kind === "null") return literal(null);
  if (shape.kind === "array") return operation === FABRIC_OPERATIONS.receiveMessages
    ? arrayOf(deliveryItemCodec, { maximum: 256 })
    : arrayOf(jsonValue, { maximum: 256 });
  const required = Object.fromEntries(shape.required.map((field) => [field, semanticFieldCodec(operation, field, direction)]));
  const optional = Object.fromEntries(shape.optional.map((field) => [field, semanticFieldCodec(operation, field, direction)]));
  return objectCodec(required, optional);
}

const messageBodyResultCodec = unionOf([
  objectCodec({
    available: literal(true),
    messageId: identifier,
    revision: positiveInteger,
    body: boundedString({ maxBytes: 4096 }),
    terminalNeutralised: literal(true),
    capabilityValuesRedacted: literal(true),
    artifactRefs: artifactRefsCodec,
  }),
  objectCodec({
    available: literal(false),
    messageId: identifier,
    revision: positiveInteger,
    reason: enumeration(["not-found", "forbidden", "expired"]),
  }),
]);
const projectionEventsResultCodec = unionOf([
  objectCodec({
    status: literal("continuation"),
    events: arrayOf(projectionEventCodec, { maximum: 256 }),
    nextCursor: positiveInteger,
    hasMore: boolean,
    snapshotRevision: positiveInteger,
    readTransactionId: identifier,
  }),
  objectCodec({
    status: literal("resnapshot-required"),
    reason: enumeration(["retention-gap", "project-cursor-mismatch", "cursor-overflow"]),
    currentSnapshotRevision: positiveInteger,
    snapshotCursor: positiveInteger,
  }),
]);
const operatorAttachmentCodec = objectCodec({
  clientId: identifier,
  projectId: identifier,
  projectAuthorityGeneration: positiveInteger,
  projectSessionId: nullable(identifier),
  generation: positiveInteger,
  expiresAt: timestamp,
});
const resourceReservationResultCodec = objectCodec({
  reservationId: identifier,
  revision: positiveInteger,
  state: enumeration(["active", "released", "ambiguous", "reconciled"]),
  path: arrayOf(resourceScopeCodec, { minimum: 2, maximum: 5 }),
  amounts: nonEmptyNumberRecord,
  capacity: recordOf(resourceDimensionCodec, { maximum: 128, keyPattern: resourceUnitPattern }),
});

export type OperationCodecPair = {
  readonly input: Codec<unknown>;
  readonly result: Codec<unknown>;
};

function parsedBy(
  codec: Codec<unknown>,
  parser: (value: unknown) => unknown,
): Codec<unknown> {
  return parserBacked(codec, (value) => parser(value), codec.example);
}

const taskResultOperations: ReadonlySet<ProtocolOperation> = new Set([
  FABRIC_OPERATIONS.createTask,
  FABRIC_OPERATIONS.claimTask,
  FABRIC_OPERATIONS.refreshTaskReadiness,
  FABRIC_OPERATIONS.getTask,
  FABRIC_OPERATIONS.updateTask,
  FABRIC_OPERATIONS.recoverTaskOwner,
]);
const leaseResultOperations: ReadonlySet<ProtocolOperation> = new Set([
  FABRIC_OPERATIONS.acquireWriteLease,
  FABRIC_OPERATIONS.recoverWriteLease,
  FABRIC_OPERATIONS.renewWriteLease,
  FABRIC_OPERATIONS.getWriteLease,
]);
const lifecycleResultOperations: ReadonlySet<ProtocolOperation> = new Set([
  FABRIC_OPERATIONS.requestLifecycle,
  FABRIC_OPERATIONS.getAgentLifecycle,
  FABRIC_OPERATIONS.reportProviderState,
]);
const providerActionResultOperations: ReadonlySet<ProtocolOperation> = new Set([
  FABRIC_OPERATIONS.dispatchProviderAction,
  FABRIC_OPERATIONS.reconcileProviderAction,
  FABRIC_OPERATIONS.getProviderAction,
]);
const teamResultOperations: ReadonlySet<ProtocolOperation> = new Set([
  FABRIC_OPERATIONS.createTeam,
  FABRIC_OPERATIONS.getTeam,
  FABRIC_OPERATIONS.freezeSubtree,
  FABRIC_OPERATIONS.adoptSubtree,
]);
const budgetResultOperations: ReadonlySet<ProtocolOperation> = new Set([
  FABRIC_OPERATIONS.reserveBudget,
  FABRIC_OPERATIONS.recordBudgetUsage,
  FABRIC_OPERATIONS.reconcileBudgetUsage,
  FABRIC_OPERATIONS.releaseBudget,
  FABRIC_OPERATIONS.getBudget,
]);

function inputCodecFor(operation: ProtocolOperation): Codec<unknown> {
  if (operation === FABRIC_OPERATIONS.sendMessage) return legacyMessageCodec;
  if (operation === FABRIC_OPERATIONS.createTeam) return teamCreateCodec;
  if (operation === FABRIC_OPERATIONS.intakeDraftCreate) return intakeDraftCreateCodec;
  if (operation === FABRIC_OPERATIONS.scopedGateRead) return scopedGateReadInputCodec;
  if (operation === FABRIC_OPERATIONS.projectionViewPage) return operatorViewPageInputCodec;
  if (operation === FABRIC_OPERATIONS.projectionDetailRead) return operatorDetailReadInputCodec;
  if (operation === FABRIC_OPERATIONS.operatorRepositoryRead) return gitRepositoryReadInputCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionPreview) return operatorActionPreviewInputCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionCommit) return operatorActionCommitCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionStatus) return operatorActionStatusInputCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionReconcile) return operatorActionReconcileCodec;
  if (operation === FABRIC_OPERATIONS.scopedGateCheck) return parsedBy(scopedGateCheckCodec, parseScopedGateCheckRequest);
  if (operation === FABRIC_OPERATIONS.membershipBind) return parsedBy(membershipBindCodec, parseMembershipBindRequest);
  if (operation === FABRIC_OPERATIONS.intakeRevise) return parsedBy(intakeRevisionCodec, parseIntakeRevisionRequest);
  if (operation === FABRIC_OPERATIONS.scopedGateCreate) return parsedBy(gateCreateCodec, parseScopedGateCreateRequest);
  if (operation === FABRIC_OPERATIONS.taskRequest) return parsedBy(taskRequestCodec, parseTaskRequest);
  if (operation === FABRIC_OPERATIONS.taskCompleteWithReply) return parsedBy(taskCompletionCodec, parseTaskCompleteWithReply);
  const base = semanticShapeCodec(operation, "input", OPERATION_INPUT_SHAPES[operation]);
  if (operation === FABRIC_OPERATIONS.intakeRead) return parsedBy(base, parseIntakeReadRequest);
  if (operation === FABRIC_OPERATIONS.integrationInputAttest) return parsedBy(base, parseIntegrationInputAttestationRequest);
  if (operation === FABRIC_OPERATIONS.intakeSubmit) return parsedBy(base, parseIntakeSubmission);
  if (operation === FABRIC_OPERATIONS.scopedGateResolve) return parsedBy(base, parseScopedGateResolveRequest);
  if (operation === FABRIC_OPERATIONS.resourceReserve) return parsedBy(base, parseResourceReservationRequest);
  return base;
}

function resultCodecFor(operation: ProtocolOperation): Codec<unknown> {
  if (taskResultOperations.has(operation)) return taskResultCodec;
  if (leaseResultOperations.has(operation)) return leaseResultCodec;
  if (lifecycleResultOperations.has(operation)) return lifecycleResultCodec;
  if (providerActionResultOperations.has(operation)) return providerActionResultCodec;
  if (teamResultOperations.has(operation)) return teamResultCodec;
  if (budgetResultOperations.has(operation)) return budgetResultCodec;
  if (([
    FABRIC_OPERATIONS.projectSessionCreate,
    FABRIC_OPERATIONS.projectSessionGet,
    FABRIC_OPERATIONS.projectSessionTransition,
    FABRIC_OPERATIONS.projectSessionClose,
    FABRIC_OPERATIONS.projectSessionDrain,
    FABRIC_OPERATIONS.projectSessionStop,
  ] as readonly ProtocolOperation[]).includes(operation)) return projectSessionCodec;
  if (operation === FABRIC_OPERATIONS.operatorAttach || operation === FABRIC_OPERATIONS.operatorHeartbeat) {
    return operatorAttachmentCodec;
  }
  if (operation === FABRIC_OPERATIONS.integrationInputAttest) return parsedBy(attestationCodec, parseOperatorInputAttestation);
  if (operation === FABRIC_OPERATIONS.scopedGateRead) {
    const gateBase = semanticShapeCodec(
      FABRIC_OPERATIONS.scopedGateCreate,
      "result",
      OPERATION_RESULT_SHAPES[FABRIC_OPERATIONS.scopedGateCreate],
    );
    const gateExample = parseScopedGate({ ...gateBase.example as Record<string, unknown>, options: ["Approve"] });
    const gate = parserBacked(gateBase, parseScopedGate, gateExample);
    const result = unionOf([
      objectCodec({
        status: literal("current"),
        gate,
        readTransactionId: identifier,
        stateDigest: sha256,
      }),
      objectCodec({
        status: literal("changed"),
        expectedRevision: positiveInteger,
        gate,
        readTransactionId: identifier,
        stateDigest: sha256,
      }),
    ]);
    return parserBacked(result, (value) => {
      if (Reflect.get(value as object, "status") !== "changed") return value;
      const gateValue = Reflect.get(value as object, "gate") as Record<string, unknown>;
      if (Reflect.get(value as object, "expectedRevision") === gateValue.revision) {
        throw new TypeError("scopedGateRead changed revision must differ from the current gate revision");
      }
      return value;
    }, result.example);
  }
  if (operation === FABRIC_OPERATIONS.projectionViewPage) return operatorViewPageResultCodec;
  if (operation === FABRIC_OPERATIONS.projectionDetailRead) return operatorDetailReadResultCodec;
  if (operation === FABRIC_OPERATIONS.operatorRepositoryRead) return gitRepositoryReadResultCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionPreview) return operatorActionPreviewCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionCommit) return operatorActionReceiptCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionStatus || operation === FABRIC_OPERATIONS.operatorActionReconcile) {
    return operatorActionStatusCodec;
  }
  if (operation === FABRIC_OPERATIONS.membershipBind) {
    const base = semanticShapeCodec(operation, "result", OPERATION_RESULT_SHAPES[operation]);
    return parsedBy(base, parseMembershipBindResult);
  }
  if (operation === FABRIC_OPERATIONS.intakeDraftCreate) {
    return parsedBy(intakeDraftCodec, parseIntake);
  }
  if (operation === FABRIC_OPERATIONS.intakeRead) return parsedBy(intakeCodec, parseIntake);
  if (operation === FABRIC_OPERATIONS.intakeSubmit || operation === FABRIC_OPERATIONS.intakeRevise) {
    return parsedBy(boundIntakeCodec, parseIntake);
  }
  if (operation === FABRIC_OPERATIONS.scopedGateCreate || operation === FABRIC_OPERATIONS.scopedGateResolve) {
    const base = semanticShapeCodec(operation, "result", OPERATION_RESULT_SHAPES[operation]);
    return parsedBy(base, parseScopedGate);
  }
  if (([
    FABRIC_OPERATIONS.resourceReserve,
    FABRIC_OPERATIONS.resourceRelease,
    FABRIC_OPERATIONS.resourceReconcile,
  ] as readonly ProtocolOperation[]).includes(operation)) return resourceReservationResultCodec;
  if (([
    FABRIC_OPERATIONS.resultDeliveryClaim,
    FABRIC_OPERATIONS.resultDeliveryProviderAccept,
    FABRIC_OPERATIONS.resultDeliveryConsume,
    FABRIC_OPERATIONS.resultDeliveryRetry,
    FABRIC_OPERATIONS.resultDeliveryReassign,
    FABRIC_OPERATIONS.resultDeliveryAbandon,
  ] as readonly ProtocolOperation[]).includes(operation)) return parsedBy(resultDeliveryCodec, parseResultDelivery);
  if (operation === FABRIC_OPERATIONS.taskCompleteWithReply) {
    return objectCodec({ taskRevision: positiveInteger, replyRevision: positiveInteger, resultDelivery: resultDeliveryCodec });
  }
  if (operation === FABRIC_OPERATIONS.projectionEvents) return projectionEventsResultCodec;
  if (operation === FABRIC_OPERATIONS.projectionPage) return projectionPageResultCodec;
  if (operation === FABRIC_OPERATIONS.messageBodyRead) return messageBodyResultCodec;
  return semanticShapeCodec(operation, "result", OPERATION_RESULT_SHAPES[operation]);
}

function buildOperationCodecs(): Readonly<Record<ProtocolOperation, OperationCodecPair>> {
  const codecs: Partial<Record<ProtocolOperation, OperationCodecPair>> = {};
  for (const operation of Object.keys(OPERATION_REGISTRY) as ProtocolOperation[]) {
    codecs[operation] = Object.freeze({ input: inputCodecFor(operation), result: resultCodecFor(operation) });
  }
  return Object.freeze(codecs) as Readonly<Record<ProtocolOperation, OperationCodecPair>>;
}

export const OPERATION_CODECS = buildOperationCodecs();

export function parseOperationInput<Operation extends ProtocolOperation>(
  operation: Operation,
  value: unknown,
): OperationInputMap[Operation] {
  if (isRetiredOperation(operation)) {
    throw new TypeError(`${operation} is retired; use daemon-owned scoped-gate operations`);
  }
  return OPERATION_CODECS[operation].input.parse(value, `${operation}.input`) as OperationInputMap[Operation];
}

type PrincipalBoundOperation =
  | typeof FABRIC_OPERATIONS.membershipBind
  | typeof FABRIC_OPERATIONS.intakeRevise
  | typeof FABRIC_OPERATIONS.scopedGateCreate;

export type OperationInputForPrincipal<
  Operation extends ProtocolOperation,
  Principal extends OperationPrincipalKind,
> = Operation extends PrincipalBoundOperation
  ? Extract<OperationInputMap[Operation], { origin: Principal extends "agent" ? "chair" : "operator" }>
  : OperationInputMap[Operation];

export function parseOperationInputForPrincipal<
  Operation extends ProtocolOperation,
  Principal extends OperationPrincipalKind,
>(
  operation: Operation,
  principal: Principal,
  value: unknown,
): OperationInputForPrincipal<Operation, Principal> {
  if (!OPERATION_REGISTRY[operation].principals.includes(principal)) {
    throw new TypeError(`${principal} principal cannot invoke ${operation}`);
  }
  const parsed = parseOperationInput(operation, value);
  if (([
    FABRIC_OPERATIONS.membershipBind,
    FABRIC_OPERATIONS.intakeRevise,
    FABRIC_OPERATIONS.scopedGateCreate,
  ] as readonly ProtocolOperation[]).includes(operation)) {
    const expectedOrigin = principal === "agent" ? "chair" : "operator";
    if (typeof parsed !== "object" || parsed === null || Reflect.get(parsed, "origin") !== expectedOrigin) {
      throw new TypeError(`${principal} principal cannot submit an ${expectedOrigin === "chair" ? "operator" : "chair"} command`);
    }
  }
  return parsed as OperationInputForPrincipal<Operation, Principal>;
}

export function parseOperationResult<Operation extends ProtocolOperation>(
  operation: Operation,
  value: unknown,
): OperationResultMap[Operation] {
  if (isRetiredOperation(operation)) {
    throw new TypeError(`${operation} is retired; use daemon-owned scoped-gate operations`);
  }
  return OPERATION_CODECS[operation].result.parse(value, `${operation}.result`) as OperationResultMap[Operation];
}

export function assertCodecRegistryExhaustive(): void {
  const operations = Object.keys(OPERATION_REGISTRY);
  if (operations.length !== Object.keys(OPERATION_CODECS).length) {
    throw new Error("operation codec registry is not exhaustive");
  }
}

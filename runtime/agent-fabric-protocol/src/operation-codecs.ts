import { FABRIC_OPERATIONS, OPERATION_REGISTRY, type FabricOperation } from "./operations.js";
import {
  parseIntegrationInputAttestationRequest,
  parseOperatorInputAttestation,
  parseOperatorMutationContext,
} from "./operator.js";
import { parseIntakeRevisionRequest, parseIntakeSubmission } from "./intake.js";
import {
  parseScopedGate,
  parseScopedGateCheckRequest,
  parseScopedGateCreateRequest,
  parseScopedGateResolveRequest,
} from "./gates.js";
import { parseProjectSession } from "./project-session.js";
import { parseJsonValue, strictRecord, type JsonValue } from "./primitives.js";
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
  [FABRIC_OPERATIONS.membershipBind]: object(["command", "projectSessionId", "expectedMembershipRevision", "members"]),
  [FABRIC_OPERATIONS.operatorAttach]: object(["command", "projectSessionId", "requestedExpiresAt"]),
  [FABRIC_OPERATIONS.operatorDetach]: object(["command", "attachmentGeneration"]),
  [FABRIC_OPERATIONS.operatorHeartbeat]: object(["command", "attachmentGeneration", "extendUntil"]),
  [FABRIC_OPERATIONS.operatorCommand]: object(["command", "action", "payload"], ["targetTaskId"]),
  [FABRIC_OPERATIONS.integrationInputAttest]: object(["context", "attestation"]),
  [FABRIC_OPERATIONS.intakeSubmit]: object(["command", "intake", "chairRequest"]),
  [FABRIC_OPERATIONS.intakeRevise]: object(["origin", "command", "intakeId", "expectedRevision", "state", "summary", "artifactRefs", "gateIds"], ["chairRequest"]),
  [FABRIC_OPERATIONS.scopedGateCreate]: object(["command", "gate"]),
  [FABRIC_OPERATIONS.scopedGateResolve]: object(["command", "gateId", "status", "decisionEvidence"]),
  [FABRIC_OPERATIONS.scopedGateCheck]: object(["projectSessionId", "coordinationRunId", "dependencyRevision", "enforcementPoint"], ["taskId", "operationId", "barrierId"]),
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
  [FABRIC_OPERATIONS.messageBodyRead]: object(["credential", "projectSessionId", "messageId", "expectedRevision"]),
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
  [FABRIC_OPERATIONS.membershipBind]: object(["projectSessionId", "membershipRevision", "members"]),
  [FABRIC_OPERATIONS.operatorAttach]: object(["clientId", "projectSessionId", "generation", "expiresAt"]),
  [FABRIC_OPERATIONS.operatorDetach]: object(["detached", "revision"]),
  [FABRIC_OPERATIONS.operatorHeartbeat]: object(["clientId", "projectSessionId", "generation", "expiresAt"]),
  [FABRIC_OPERATIONS.operatorCommand]: object(["commandId", "actor", "provenance", "operation", "expectedRevision", "committedRevision", "before", "after", "evidenceRefs", "committedAt"]),
  [FABRIC_OPERATIONS.integrationInputAttest]: object(["attestationId", "integrationId", "integrationGeneration", "operatorId", "projectId", "projectSessionId", "providerEvent", "humanUtterance", "gateBinding", "recordedAt"]),
  [FABRIC_OPERATIONS.intakeSubmit]: object(["intakeId", "projectSessionId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.intakeRevise]: object(["intakeId", "projectSessionId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.scopedGateCreate]: object(["gateId", "projectSessionId", "coordinationRunId", "scope", "affectedTaskIds", "dependencyRevision", "blockedOperationIds", "enforcementPoints", "question", "reason", "options", "recommendation", "consequences", "evidenceRefs", "revision", "createdByRef", "expectedApproverRef", "status"], ["deadline", "default", "resolution", "releaseBinding"]),
  [FABRIC_OPERATIONS.scopedGateResolve]: object(["gateId", "projectSessionId", "coordinationRunId", "scope", "affectedTaskIds", "dependencyRevision", "blockedOperationIds", "enforcementPoints", "question", "reason", "options", "recommendation", "consequences", "evidenceRefs", "revision", "createdByRef", "expectedApproverRef", "status"], ["deadline", "default", "resolution", "releaseBinding"]),
  [FABRIC_OPERATIONS.scopedGateCheck]: object(["allowed", "checkedGateRevisions"], ["blockingGateIds"]),
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
  [FABRIC_OPERATIONS.projectionSnapshot]: object(["schemaVersion", "project", "session", "runs", "attention", "capacity", "cursor", "stateDigest"]),
  [FABRIC_OPERATIONS.projectionPage]: object(["view", "page"]),
  [FABRIC_OPERATIONS.projectionEvents]: object(["events", "nextCursor"]),
  [FABRIC_OPERATIONS.messageBodyRead]: object(["available", "messageId", "revision"], ["body", "terminalNeutralised", "capabilityValuesRedacted", "artifactRefs", "reason"]),
  [FABRIC_OPERATIONS.projectSessionDrain]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionStop]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.daemonDrain]: object(["daemonInstanceGeneration", "globalStateRevision", "state", "receiptDigest"]),
  [FABRIC_OPERATIONS.daemonStop]: object(["daemonInstanceGeneration", "globalStateRevision", "state", "receiptDigest"]),
} as const satisfies Record<ProtocolOperation, WireShape>;

const operatorMutationOperations: ReadonlySet<FabricOperation> = new Set([
  FABRIC_OPERATIONS.projectSessionCreate,
  FABRIC_OPERATIONS.projectSessionTransition,
  FABRIC_OPERATIONS.projectSessionClose,
  FABRIC_OPERATIONS.membershipBind,
  FABRIC_OPERATIONS.operatorAttach,
  FABRIC_OPERATIONS.operatorDetach,
  FABRIC_OPERATIONS.operatorHeartbeat,
  FABRIC_OPERATIONS.operatorCommand,
  FABRIC_OPERATIONS.intakeSubmit,
  FABRIC_OPERATIONS.scopedGateCreate,
  FABRIC_OPERATIONS.scopedGateResolve,
  FABRIC_OPERATIONS.chairTakeover,
  FABRIC_OPERATIONS.projectSessionDrain,
  FABRIC_OPERATIONS.projectSessionStop,
  FABRIC_OPERATIONS.daemonDrain,
  FABRIC_OPERATIONS.daemonStop,
]);

function parseShape(value: unknown, shape: WireShape, path: string): JsonValue {
  if (shape.kind === "null") {
    if (value !== null) throw new TypeError(`${path} must be null`);
    return null;
  }
  if (shape.kind === "array") {
    if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
    return parseJsonValue(value, path);
  }
  const record = strictRecord(value, path, [...shape.required, ...shape.optional]);
  for (const field of shape.required) {
    if (record[field] === undefined) throw new TypeError(`${path}.${field} is required`);
  }
  return parseJsonValue(record, path);
}

export function parseOperationInput<Operation extends ProtocolOperation>(
  operation: Operation,
  value: unknown,
): OperationInputMap[Operation] {
  parseShape(value, OPERATION_INPUT_SHAPES[operation], `${operation}.input`);
  let parsed: unknown = value;
  if (operatorMutationOperations.has(operation)) {
    const record = strictRecord(
      value,
      `${operation}.input`,
      [...OPERATION_INPUT_SHAPES[operation].required, ...OPERATION_INPUT_SHAPES[operation].optional],
    );
    parseOperatorMutationContext(record.command, `${operation}.input.command`);
  }
  if (operation === FABRIC_OPERATIONS.integrationInputAttest) parsed = parseIntegrationInputAttestationRequest(value);
  else if (operation === FABRIC_OPERATIONS.intakeSubmit) parsed = parseIntakeSubmission(value);
  else if (operation === FABRIC_OPERATIONS.intakeRevise) parsed = parseIntakeRevisionRequest(value);
  else if (operation === FABRIC_OPERATIONS.scopedGateCreate) parsed = parseScopedGateCreateRequest(value);
  else if (operation === FABRIC_OPERATIONS.scopedGateResolve) parsed = parseScopedGateResolveRequest(value);
  else if (operation === FABRIC_OPERATIONS.scopedGateCheck) parsed = parseScopedGateCheckRequest(value);
  else if (operation === FABRIC_OPERATIONS.resourceReserve) parsed = parseResourceReservationRequest(value);
  else if (operation === FABRIC_OPERATIONS.taskRequest) parsed = parseTaskRequest(value);
  else if (operation === FABRIC_OPERATIONS.taskCompleteWithReply) parsed = parseTaskCompleteWithReply(value);
  return parsed as OperationInputMap[Operation];
}

const projectSessionResults: ReadonlySet<FabricOperation> = new Set([
  FABRIC_OPERATIONS.projectSessionCreate,
  FABRIC_OPERATIONS.projectSessionGet,
  FABRIC_OPERATIONS.projectSessionTransition,
  FABRIC_OPERATIONS.projectSessionClose,
  FABRIC_OPERATIONS.projectSessionDrain,
  FABRIC_OPERATIONS.projectSessionStop,
]);
const resultDeliveryResults: ReadonlySet<FabricOperation> = new Set([
  FABRIC_OPERATIONS.resultDeliveryClaim,
  FABRIC_OPERATIONS.resultDeliveryProviderAccept,
  FABRIC_OPERATIONS.resultDeliveryConsume,
  FABRIC_OPERATIONS.resultDeliveryRetry,
  FABRIC_OPERATIONS.resultDeliveryReassign,
  FABRIC_OPERATIONS.resultDeliveryAbandon,
]);

export function parseOperationResult<Operation extends ProtocolOperation>(
  operation: Operation,
  value: unknown,
): OperationResultMap[Operation] {
  parseShape(value, OPERATION_RESULT_SHAPES[operation], `${operation}.result`);
  let parsed: unknown = value;
  if (projectSessionResults.has(operation)) parsed = parseProjectSession(value);
  else if (operation === FABRIC_OPERATIONS.integrationInputAttest) parsed = parseOperatorInputAttestation(value);
  else if (operation === FABRIC_OPERATIONS.scopedGateCreate || operation === FABRIC_OPERATIONS.scopedGateResolve) {
    parsed = parseScopedGate(value);
  } else if (resultDeliveryResults.has(operation)) parsed = parseResultDelivery(value);
  else if (operation === FABRIC_OPERATIONS.taskCompleteWithReply) {
    const record = strictRecord(value, `${operation}.result`, ["taskRevision", "replyRevision", "resultDelivery"]);
    parsed = { ...record, resultDelivery: parseResultDelivery(record.resultDelivery) };
  }
  return parsed as OperationResultMap[Operation];
}

export function operationShapeSchema(shape: WireShape): Readonly<Record<string, JsonValue>> {
  if (shape.kind === "null") return { type: "null" };
  if (shape.kind === "array") return { type: "array" };
  return {
    type: "object",
    additionalProperties: false,
    required: [...shape.required],
    properties: Object.fromEntries(
      [...shape.required, ...shape.optional].map((field) => [field, true]),
    ),
  };
}

export function assertCodecRegistryExhaustive(): void {
  const operations = Object.keys(OPERATION_REGISTRY);
  if (operations.length !== Object.keys(OPERATION_INPUT_SHAPES).length ||
      operations.length !== Object.keys(OPERATION_RESULT_SHAPES).length) {
    throw new Error("operation codec registry is not exhaustive");
  }
}

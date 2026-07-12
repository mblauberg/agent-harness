import {
  FABRIC_OPERATIONS,
  isFabricOperation,
  isActiveFabricOperation,
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
  sha256Hex,
  timestamp,
  unionOf,
  type Codec,
  type JsonSchema,
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
import { PROJECT_SESSION_LAUNCH_INTENT_CODEC, PROVIDER_ACTION_REF_V1_CODEC } from "./launch.js";
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
import { budgetUnitKey } from "./resource-unit-keys.js";
import {
  parseArtifactContentReadRequest,
  parseArtifactContentReadResult,
  parseEvidenceArtifactRegistration,
  parseEvidencePublishRequest,
} from "./artifacts.js";
import {
  assertWorkstreamCreateSemantics,
  type WorkstreamCreateRequest,
} from "./workstreams.js";

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
  [FABRIC_OPERATIONS.launchAttest]: object(["challengeResponse"]),
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
  [FABRIC_OPERATIONS.intakeRevise]: object(["origin", "command", "intakeId", "projectSessionId", "coordinationRunId", "expectedRevision", "state", "summary", "artifactRefs", "gateIds"], ["chairRequest", "acceptedScopeRef"]),
  [FABRIC_OPERATIONS.scopedGateCreate]: object(["origin", "command", "intent"]),
  [FABRIC_OPERATIONS.scopedGateResolve]: object(["command", "gateId", "status", "decisionEvidence"]),
  [FABRIC_OPERATIONS.scopedGateCheck]: object(["projectSessionId", "coordinationRunId", "dependencyRevision", "enforcementPoint"], ["taskId", "operationId", "operationTarget", "barrierId"]),
  [FABRIC_OPERATIONS.scopedGateRead]: object(["credential", "projectId", "projectSessionId", "gateId"], ["expectedRevision"]),
  [FABRIC_OPERATIONS.resourceReserve]: object(["commandId", "reservationId", "projectSessionId", "path", "amounts"], ["writerAdmission", "taskId"]),
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
  [FABRIC_OPERATIONS.workstreamCreate]: object([
    "command", "expectedSessionGeneration", "expectedMembershipRevision", "workstreamId",
    "deliveryRunId", "launchPacketRef", "team", "resources",
  ]),
  [FABRIC_OPERATIONS.workstreamSettle]: object([
    "command", "expectedSessionGeneration", "expectedMembershipRevision", "workstreamId",
    "expectedWorkstreamRevision", "expectedRootTaskRevision", "expectedTeamGeneration",
  ]),
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
  [FABRIC_OPERATIONS.evidencePublish]: object(
    [
      "commandId",
      "projectSessionId",
      "coordinationRunId",
      "requestedSourceKind",
      "evidenceKind",
      "relativePath",
      "sourceDigest",
    ],
    ["taskId"],
  ),
  [FABRIC_OPERATIONS.operatorArtifactContentRead]: object(
    [
      "credential",
      "projectId",
      "evidenceId",
      "expectedEvidenceRevision",
      "artifactRef",
      "cursor",
      "maximumBytes",
      "maximumLines",
    ],
    ["projectSessionId"],
  ),
} as const satisfies Record<ProtocolOperation, WireShape>;

export const OPERATION_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.delegateAuthority]: object(["authorityId"]),
  [FABRIC_OPERATIONS.registerAgent]: object(["capability"]),
  [FABRIC_OPERATIONS.spawnAgent]: object(["agentId", "authorityId", "adapterId", "actionId", "providerSessionRef", "providerSessionGeneration", "bridgeState", "bridgeGeneration", "evidenceDigest"]),
  [FABRIC_OPERATIONS.attachAgent]: object(["agentId", "authorityId", "adapterId", "actionId", "providerSessionRef", "providerSessionGeneration", "bridgeState", "bridgeGeneration", "evidenceDigest"]),
  [FABRIC_OPERATIONS.sendMessage]: object(["messageId"]),
  [FABRIC_OPERATIONS.createDiscussionGroup]: object(["groupId", "memberAgentIds"]),
  [FABRIC_OPERATIONS.receiveMessages]: object(["deliveries"]),
  [FABRIC_OPERATIONS.acknowledgeDelivery]: object(["acknowledged"]),
  [FABRIC_OPERATIONS.abandonDelivery]: object(["deliveryId", "status", "reason"]),
  [FABRIC_OPERATIONS.getMailboxState]: object(["contiguousWatermark", "acknowledgedAboveWatermark"]),
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
  [FABRIC_OPERATIONS.launchAttest]: object(["attested", "challengeDigest"]),
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
  [FABRIC_OPERATIONS.intakeRead]: object(["intakeId", "projectId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"], ["projectSessionId", "coordinationRunId", "acceptedScopeRef"]),
  [FABRIC_OPERATIONS.intakeSubmit]: object(["intakeId", "projectId", "projectSessionId", "coordinationRunId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.intakeRevise]: object(["intakeId", "projectId", "projectSessionId", "coordinationRunId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"], ["acceptedScopeRef"]),
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
  [FABRIC_OPERATIONS.workstreamCreate]: object([
    "workstreamId", "projectSessionId", "coordinationRunId", "deliveryRunId", "teamId",
    "rootTaskId", "leadAgentId", "authorityId", "budgetId", "teamScopeId", "state",
    "revision", "membershipRevision",
  ]),
  [FABRIC_OPERATIONS.workstreamSettle]: object([
    "workstreamId", "projectSessionId", "coordinationRunId", "deliveryRunId", "teamId",
    "rootTaskId", "leadAgentId", "authorityId", "budgetId", "teamScopeId", "state",
    "revision", "membershipRevision",
  ]),
  [FABRIC_OPERATIONS.chairTakeover]: object(["projectSessionId", "sessionRevision", "runRevision", "chairAgentId", "chairGeneration"]),
  [FABRIC_OPERATIONS.projectDiscover]: object(["project", "sessions"]),
  [FABRIC_OPERATIONS.projectionSnapshot]: object(["schemaVersion", "snapshotRevision", "readTransactionId", "project", "session", "runs", "attention", "capacity", "cursor", "stateDigest"]),
  [FABRIC_OPERATIONS.projectionPage]: object(["view", "page"]),
  [FABRIC_OPERATIONS.projectionEvents]: object(["status"], ["events", "nextCursor", "hasMore", "snapshotRevision", "readTransactionId", "reason", "currentSnapshotRevision", "snapshotCursor"]),
  [FABRIC_OPERATIONS.projectionViewPage]: object(["status", "view"], ["rows", "nextCursor", "hasMore", "snapshotRevision", "readTransactionId", "reason", "currentSnapshotRevision", "snapshotCursor"]),
  [FABRIC_OPERATIONS.projectionDetailRead]: object(["status"], ["detailRef", "detail", "snapshotRevision", "readTransactionId", "reason", "currentSnapshotRevision"]),
  [FABRIC_OPERATIONS.operatorActionPreview]: object(["previewId", "previewRevision", "previewDigest", "intent", "intentDigest", "beforeStateDigest", "consequenceClass", "evidenceRefs", "gateIds", "confirmationMode", "expiresAt"]),
  [FABRIC_OPERATIONS.operatorActionCommit]: object(["commandId", "previewId", "previewRevision", "intentDigest", "beforeStateDigest", "afterStateDigest", "evidenceRefs", "committedAt"], ["effectRef", "providerActionRef"]),
  [FABRIC_OPERATIONS.operatorActionStatus]: object(["status", "commandId"], ["intentDigest", "phase", "attemptGeneration", "effectRef", "providerActionRef", "receipt", "code", "evidenceRefs"]),
  [FABRIC_OPERATIONS.operatorActionReconcile]: object(["status", "commandId"], ["intentDigest", "phase", "attemptGeneration", "effectRef", "providerActionRef", "receipt", "code", "evidenceRefs"]),
  [FABRIC_OPERATIONS.messageBodyRead]: object(["available", "messageId", "revision"], ["body", "terminalNeutralised", "capabilityValuesRedacted", "artifactRefs", "reason"]),
  [FABRIC_OPERATIONS.operatorRepositoryRead]: object(
    ["status"],
    ["projectId", "projectSessionId", "snapshotRevision", "readTransactionId", "repository", "reason", "currentSnapshotRevision"],
  ),
  [FABRIC_OPERATIONS.evidencePublish]: object([
    "evidenceId",
    "evidenceRevision",
    "projectId",
    "projectSessionId",
    "coordinationRunId",
    "taskId",
    "sourceKind",
    "evidenceKind",
    "artifactRef",
    "publisherKind",
    "publisherRef",
    "createdAt",
  ]),
  [FABRIC_OPERATIONS.operatorArtifactContentRead]: object(
    ["available", "artifactRef"],
    [
      "reason",
      "mediaType",
      "content",
      "totalBytes",
      "totalLines",
      "renderedTotalBytes",
      "renderedTotalLines",
      "pageIndex",
      "lineFragment",
      "pageContentDigest",
      "renderedArtifactDigest",
      "nextCursor",
      "transformation",
      "terminalNeutralised",
      "capabilityValuesRedacted",
      "credentialValuesRedacted",
    ],
  ),
} as const satisfies Record<ProtocolOperation, WireShape>;

const text = boundedString();
const optionalText = boundedString({ minBytes: 0 });
const positiveInteger = integer({ minimum: 1 });
const stringList = arrayOf(identifier, { maximum: 256, unique: true });
const textList = arrayOf(text, { maximum: 256 });
const integerList = arrayOf(integer(), { maximum: 256, unique: true });
const numberRecord = recordOf(integer(), { maximum: 128, keyCodec: budgetUnitKey });
const nonEmptyNumberRecord = recordOf(integer(), {
  minimum: 1,
  maximum: 128,
  keyCodec: budgetUnitKey,
  exampleKey: "concurrent_turns",
});
const nullableNumberRecord = recordOf(nullable(integer()), {
  minimum: 1,
  maximum: 128,
  keyCodec: budgetUnitKey,
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
const evidenceKindCodec = enumeration(["artifact", "diff", "test", "review", "receipt"]);
const publishableEvidenceSourceKindCodec = enumeration(["project-file", "run-file"]);
const evidencePublishInputCodec = parserBacked(
  objectCodec({
    commandId: identifier,
    projectSessionId: identifier,
    coordinationRunId: identifier,
    requestedSourceKind: publishableEvidenceSourceKindCodec,
    evidenceKind: evidenceKindCodec,
    relativePath,
    sourceDigest: sha256,
  }, { taskId: identifier }),
  parseEvidencePublishRequest,
  parseEvidencePublishRequest({
    commandId: "command_01",
    projectSessionId: "session_01",
    coordinationRunId: "run_01",
    requestedSourceKind: "run-file",
    evidenceKind: "artifact",
    relativePath: "artifacts/item.json",
    sourceDigest: sha256.example,
  }),
);
const evidenceRegistrationCodec = parserBacked(
  objectCodec({
    evidenceId: identifier,
    evidenceRevision: positiveInteger,
    projectId: identifier,
    projectSessionId: identifier,
    coordinationRunId: identifier,
    taskId: nullable(identifier),
    sourceKind: publishableEvidenceSourceKindCodec,
    evidenceKind: evidenceKindCodec,
    artifactRef: artifactRefCodec,
    publisherKind: literal("agent"),
    publisherRef: identifier,
    createdAt: timestamp,
  }),
  parseEvidenceArtifactRegistration,
  parseEvidenceArtifactRegistration({
    evidenceId: "artifact_01",
    evidenceRevision: 1,
    projectId: "project_01",
    projectSessionId: "session_01",
    coordinationRunId: "run_01",
    taskId: null,
    sourceKind: "run-file",
    evidenceKind: "artifact",
    artifactRef: artifactRefCodec.example,
    publisherKind: "agent",
    publisherRef: "agent_01",
    createdAt: timestamp.example,
  }),
);
const artifactContentReadInputCodec = parserBacked(
  objectCodec({
    credential: credentialCodec,
    projectId: identifier,
    evidenceId: identifier,
    expectedEvidenceRevision: positiveInteger,
    artifactRef: artifactRefCodec,
    cursor: nullable(boundedString({ maxBytes: 4096, example: "cursor_01" })),
    maximumBytes: integer({ minimum: 4, maximum: 131_072 }),
    maximumLines: integer({ minimum: 1, maximum: 2_000 }),
  }, { projectSessionId: identifier }),
  parseArtifactContentReadRequest,
  parseArtifactContentReadRequest({
    credential: credentialCodec.example,
    projectId: "project_01",
    evidenceId: "artifact_01",
    expectedEvidenceRevision: 1,
    artifactRef: artifactRefCodec.example,
    cursor: null,
    maximumBytes: 131_072,
    maximumLines: 2_000,
  }),
);
const artifactContentReadResultCodec = parserBacked(
  unionOf([
    objectCodec({
      available: literal(false),
      artifactRef: artifactRefCodec,
      reason: enumeration(["not-found", "forbidden", "unsupported-media", "unsafe-content", "stale", "oversized"]),
    }),
    objectCodec({
      available: literal(true),
      artifactRef: artifactRefCodec,
      mediaType: enumeration(["text/markdown", "application/json", "text/x-diff", "text/plain"]),
      content: boundedString({ minBytes: 0, maxBytes: 131_072, example: "safe content\n" }),
      totalBytes: integer(),
      totalLines: integer(),
      renderedTotalBytes: integer(),
      renderedTotalLines: integer(),
      pageIndex: integer(),
      lineFragment: enumeration(["whole", "start", "middle", "end"]),
      pageContentDigest: sha256,
      renderedArtifactDigest: sha256,
      nextCursor: nullable(boundedString({ maxBytes: 4096, example: "cursor_02" })),
      transformation: enumeration([
        "none",
        "terminal-neutralised",
        "capability-redacted",
        "credential-redacted",
        "combined",
      ]),
      terminalNeutralised: literal(true),
      capabilityValuesRedacted: literal(true),
      credentialValuesRedacted: literal(true),
    }),
  ]),
  parseArtifactContentReadResult,
  parseArtifactContentReadResult({
    available: false,
    artifactRef: artifactRefCodec.example,
    reason: "not-found",
  }),
);
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
const authorityPathCodec = unionOf([literal("."), relativePath]);
const authorityCodec = objectCodec({
  workspaceRoots: arrayOf(authorityPathCodec, { minimum: 1, maximum: 64, unique: true }),
  sourcePaths: arrayOf(authorityPathCodec, { maximum: 256, unique: true }),
  artifactPaths: arrayOf(authorityPathCodec, { maximum: 256, unique: true }),
  actions: arrayOf(agentAuthorityOperationCodec, { maximum: 256, unique: true }),
  disclosure: disclosureCodec,
  expiresAt: timestamp,
  budget: numberRecord,
}, {
  deniedPaths: arrayOf(authorityPathCodec, { maximum: 256, unique: true }),
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
  sha256: sha256Hex,
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
const workstreamCreateBaseCodec = objectCodec({
  command: chairMutationCodec,
  expectedSessionGeneration: positiveInteger,
  expectedMembershipRevision: positiveInteger,
  workstreamId: identifier,
  deliveryRunId: identifier,
  launchPacketRef: artifactRefCodec,
  team: objectCodec({
    teamId: identifier,
    leader: teamLeaderCodec,
    rootTask: rootTaskInputCodec,
    initialMembers: arrayOf(teamMemberCodec, { maximum: 5 }),
    discussionGroups: arrayOf(discussionGroupCodec, { maximum: 64 }),
    reservedBudget: numberRecord,
  }),
  resources: objectCodec({
    runScopeId: identifier,
    teamScopeId: identifier,
    teamLimits: numberRecord,
    agentScopes: arrayOf(objectCodec({
      agentId: identifier,
      scopeId: identifier,
      limits: numberRecord,
    }), { minimum: 1, maximum: 6 }),
  }),
});
const baseWorkstreamCreateExample = workstreamCreateBaseCodec.example as WorkstreamCreateRequest;
const workstreamCreateCodec = parserBacked(
  workstreamCreateBaseCodec,
  (value) => assertWorkstreamCreateSemantics(value as WorkstreamCreateRequest),
  assertWorkstreamCreateSemantics({
    ...baseWorkstreamCreateExample,
    team: {
      ...baseWorkstreamCreateExample.team,
      reservedBudget: { provider_calls: 1 },
    },
    resources: {
      ...baseWorkstreamCreateExample.resources,
      teamLimits: { provider_calls: 1 },
      agentScopes: [{
        agentId: baseWorkstreamCreateExample.team.leader.agentId,
        scopeId: "workstream_agent_scope_01",
        limits: { provider_calls: 1 },
      }],
    },
  }),
);
const workstreamSettleCodec = objectCodec({
  command: chairMutationCodec,
  expectedSessionGeneration: positiveInteger,
  expectedMembershipRevision: positiveInteger,
  workstreamId: identifier,
  expectedWorkstreamRevision: positiveInteger,
  expectedRootTaskRevision: positiveInteger,
  expectedTeamGeneration: positiveInteger,
});

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
const projectSessionTransitionInputCodec = objectCodec({
  command: operatorMutationCodec,
  projectSessionId: identifier,
  expectedGeneration: positiveInteger,
  transition: unionOf([
    objectCodec({
      to: literal("awaiting_launch"),
      reason: text,
      launchPacketRef: artifactRefCodec,
    }),
    objectCodec({
      to: enumeration([
        "draft",
        "active",
        "reconciling",
        "visibility_degraded",
        "recovery_required",
        "quarantined",
      ]),
      reason: text,
    }),
    objectCodec({ to: literal("awaiting_acceptance"), closureEvidence: artifactRefCodec }),
  ]),
});

const runProjectionCodec = objectCodec({
  runId: identifier,
  phase: text,
  chairAgentId: identifier,
  nextMilestone: text,
  health: enumeration(["healthy", "degraded", "blocked", "quarantined", "unknown"]),
}, { projectSessionId: identifier });
const nativeNotificationDeliverySummaryCodec = objectCodec({
  targetIntegration: literal("native-desktop"),
  status: enumeration(["available", "unavailable", "stale"]),
  journalState: enumeration(["missing", "pending", "claimed", "sent", "failed", "deduplicated", "ambiguous"]),
  deliveryItemRevision: nullable(positiveInteger),
  claimGeneration: nullable(integer({ minimum: 0 })),
  integrationState: enumeration(["absent", "available", "unavailable", "stale"]),
  observedAt: timestamp,
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
}, { nativeNotification: nativeNotificationDeliverySummaryCodec });
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
}, { resultDigest: sha256 });
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
  initialMemberAgentIds: stringList,
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
  initialMemberAgentIds: stringList,
});
const workstreamProjectionCodec = objectCodec({
  workstreamId: identifier,
  projectSessionId: identifier,
  coordinationRunId: identifier,
  deliveryRunId: identifier,
  teamId: identifier,
  rootTaskId: identifier,
  leadAgentId: identifier,
  authorityId: identifier,
  budgetId: identifier,
  teamScopeId: identifier,
  state: enumeration(["active", "complete", "cancelled", "degraded"]),
  revision: positiveInteger,
  membershipRevision: positiveInteger,
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
const boundIntakeCommonFields = {
  intakeId: identifier,
  projectId: identifier,
  projectSessionId: identifier,
  coordinationRunId: identifier,
  revision: positiveInteger,
  dedupeKey: text,
  summary: text,
  artifactRefs: artifactRefsCodec,
  gateIds: stringList,
};
const boundIntakeCodec = unionOf([
  objectCodec({
    ...boundIntakeCommonFields,
    state: enumeration(["awaiting-chair", "discussing", "awaiting-human", "deferred", "cancelled"]),
  }),
  objectCodec({
    ...boundIntakeCommonFields,
    state: literal("accepted"),
    acceptedScopeRef: artifactRefCodec,
  }),
]);
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
  gitCommonDir: absoluteFilesystemPathCodec,
  commonDirectoryIdentityDigest: sha256,
  repositoryStateDigest: sha256,
  headDigest: sha256,
  indexDigest: sha256,
  worktreeDigest: sha256,
  remoteStateDigest: sha256,
  configDigest: sha256,
  worktreeRegistryDigest: sha256,
});
const gitExecutionProfileBindingCodec = objectCodec({
  profileId: identifier,
  revision: positiveInteger,
  digest: sha256,
  gitBinaryDigest: sha256,
  objectFormat: enumeration(["sha1", "sha256"]),
});
const gitRemoteBindingCodec = objectCodec({
  registrationId: identifier,
  revision: positiveInteger,
  generation: positiveInteger,
  remoteName: identifier,
  targetDigest: sha256,
  adapterId: identifier,
  adapterContractDigest: sha256,
});
const gitIdentityCodec = objectCodec({ name: text, email: text, timestamp });
const gitRefCodec = boundedString({ maxBytes: 1024, pattern: "^refs/", example: "refs/heads/main" });
const gitCommitMappingCodec = objectCodec({
  sourceObjectDigest: nullable(sha256),
  parentDigests: arrayOf(sha256, { maximum: 16 }),
  treeDigest: sha256,
  author: gitIdentityCodec,
  committer: gitIdentityCodec,
  message: text,
  resultObjectDigest: sha256,
});
const gitConflictPathCodec = objectCodec({
  path: relativePath,
  stage1Digest: nullable(sha256),
  stage2Digest: nullable(sha256),
  stage3Digest: nullable(sha256),
});
const gitConflictRecipeCodec = objectCodec({
  kind: enumeration(["merge", "rebase"]),
  operationStateDigest: sha256,
  indexDigest: sha256,
  worktreeDigest: sha256,
  conflictPaths: arrayOf(gitConflictPathCodec, { maximum: 4096, unique: true }),
});
const gitResultRecipeCodec = objectCodec({
  schemaVersion: literal(1),
  executionProfileDigest: sha256,
  resultRecipeDigest: sha256,
  beforeRepositoryStateDigest: sha256,
  expectedSuccessRepositoryStateDigest: sha256,
  expectedConflict: nullable(gitConflictRecipeCodec),
  refUpdates: arrayOf(objectCodec({
    refName: gitRefCodec,
    beforeObjectDigest: nullable(sha256),
    afterObjectDigest: nullable(sha256),
  }), { maximum: 64, unique: true }),
  configUpdates: arrayOf(objectCodec({
    section: literal("branch"),
    subsection: identifier,
    key: enumeration(["remote", "merge"]),
    beforeValue: nullable(text),
    afterValue: nullable(text),
  }), { maximum: 64, unique: true }),
  commitMappings: arrayOf(gitCommitMappingCodec, { maximum: 128, unique: true }),
  affectedPaths: arrayOf(objectCodec({
    path: relativePath,
    beforeDigest: nullable(sha256),
    afterDigest: nullable(sha256),
  }), { maximum: 4096, unique: true }),
  bounds: objectCodec({
    maximumRefOrConfigUpdates: literal(64),
    maximumCommitMappings: literal(128),
    maximumConflictPaths: literal(4096),
  }),
});
const remoteOperationFields = {
  remote: gitRemoteBindingCodec,
  sourceRef: gitRefCodec,
  destinationRef: gitRefCodec,
  sourceObjectDigest: sha256,
  destinationObjectDigest: nullable(sha256),
};
const conflictSuccessorFields = {
  predecessorCustodyId: identifier,
  predecessorConflictGeneration: positiveInteger,
  expectedConflictStateDigest: sha256,
};
const gitOperationCodec = unionOf([
  objectCodec({ variant: literal("fetch"), ...remoteOperationFields }),
  objectCodec({ variant: literal("pull-fast-forward-only"), ...remoteOperationFields }),
  objectCodec({ variant: literal("pull-merge-commit-start"), ...remoteOperationFields }),
  objectCodec({ variant: literal("pull-rebase-start"), ...remoteOperationFields }),
  objectCodec({ variant: literal("stage"), paths: arrayOf(relativePath, { minimum: 1, maximum: 256, unique: true }) }),
  objectCodec({ variant: literal("unstage"), paths: arrayOf(relativePath, { minimum: 1, maximum: 256, unique: true }) }),
  objectCodec({
    variant: literal("commit"),
    sourceIndexDigest: sha256,
    parentObjectDigest: sha256,
    treeDigest: sha256,
    message: text,
    author: gitIdentityCodec,
    committer: gitIdentityCodec,
    resultingCommitDigest: sha256,
  }),
  objectCodec({
    variant: literal("merge-fast-forward-only-start"),
    sourceRef: gitRefCodec,
    sourceObjectDigest: sha256,
    destinationRef: gitRefCodec,
    destinationObjectDigest: sha256,
  }),
  objectCodec({
    variant: literal("merge-commit-start"),
    sourceRef: gitRefCodec,
    sourceObjectDigest: sha256,
    destinationRef: gitRefCodec,
    destinationObjectDigest: sha256,
  }),
  objectCodec({ variant: literal("merge-continue"), ...conflictSuccessorFields }),
  objectCodec({ variant: literal("merge-abort"), ...conflictSuccessorFields }),
  objectCodec({
    variant: literal("rebase-current-branch-no-autostash-start"),
    sourceRef: gitRefCodec,
    sourceObjectDigest: sha256,
    destinationRef: gitRefCodec,
    destinationObjectDigest: sha256,
  }),
  objectCodec({ variant: literal("rebase-continue"), ...conflictSuccessorFields }),
  objectCodec({ variant: literal("rebase-abort"), ...conflictSuccessorFields }),
  objectCodec({ variant: literal("push-fast-forward-only"), ...remoteOperationFields }),
  objectCodec({ variant: literal("push-force-with-lease"), ...remoteOperationFields, expectedRemoteObjectDigest: sha256 }),
  objectCodec({ variant: literal("branch-create"), sourceObjectDigest: sha256, destinationRef: gitRefCodec }),
  objectCodec({
    variant: literal("branch-rename"),
    sourceRef: gitRefCodec,
    sourceObjectDigest: sha256,
    destinationRef: gitRefCodec,
  }),
  objectCodec({
    variant: literal("branch-delete-merged-only"),
    sourceRef: gitRefCodec,
    sourceObjectDigest: sha256,
    mergedIntoObjectDigest: sha256,
  }),
  objectCodec({ variant: literal("branch-delete-force"), sourceRef: gitRefCodec, sourceObjectDigest: sha256 }),
  objectCodec({
    variant: literal("worktree-create-detached"),
    destinationWorktreePath: absoluteFilesystemPathCodec,
    sourceObjectDigest: sha256,
  }),
  objectCodec({
    variant: literal("worktree-create-new-branch"),
    destinationWorktreePath: absoluteFilesystemPathCodec,
    sourceObjectDigest: sha256,
    branchRef: gitRefCodec,
  }),
  objectCodec({
    variant: literal("worktree-create-existing-branch"),
    destinationWorktreePath: absoluteFilesystemPathCodec,
    sourceObjectDigest: sha256,
    branchRef: gitRefCodec,
  }),
  objectCodec({
    variant: literal("worktree-move"),
    sourceWorktreePath: absoluteFilesystemPathCodec,
    destinationWorktreePath: absoluteFilesystemPathCodec,
    expectedWorktreeStateDigest: sha256,
  }),
  objectCodec({
    variant: literal("worktree-remove-clean"),
    sourceWorktreePath: absoluteFilesystemPathCodec,
    expectedWorktreeStateDigest: sha256,
  }),
  objectCodec({
    variant: literal("worktree-remove-force"),
    sourceWorktreePath: absoluteFilesystemPathCodec,
    expectedWorktreeStateDigest: sha256,
  }),
  objectCodec({
    variant: literal("upstream-set"),
    localBranchRef: gitRefCodec,
    remote: gitRemoteBindingCodec,
    remoteBranchRef: gitRefCodec,
    expectedConfigDigest: sha256,
  }),
  objectCodec({
    variant: literal("upstream-unset"),
    localBranchRef: gitRefCodec,
    remote: gitRemoteBindingCodec,
    remoteBranchRef: gitRefCodec,
    expectedConfigDigest: sha256,
  }),
]);
const gitGateDecisionCodec = objectCodec({
  kind: literal("gate"),
  draftId: identifier,
  expectedDraftRevision: positiveInteger,
  draftDigest: sha256,
  gateId: identifier,
  expectedGateRevision: positiveInteger,
  expectedGateStatus: literal("approved"),
  blockedOperationId: identifier,
});
const gitPreauthorisedDecisionCodec = objectCodec({
  kind: literal("preauthorised"),
  grantId: identifier,
  expectedGrantRevision: positiveInteger,
  grantDigest: sha256,
});
const gitDraftAuthorisationFields = {
  projectId: identifier,
  projectSessionId: identifier,
  expectedSessionRevision: positiveInteger,
  expectedSessionGeneration: positiveInteger,
  coordinationRunId: identifier,
  expectedRunRevision: positiveInteger,
  expectedDependencyRevision: positiveInteger,
  authorityRef: sha256,
  expectedAuthorityRevision: positiveInteger,
  expectedGitAllowlistEpoch: positiveInteger,
  gitAllowlistDigest: nullable(sha256),
  repositoryRoot: absoluteFilesystemPathCodec,
  worktreePath: absoluteFilesystemPathCodec,
  repositoryStateDigest: sha256,
  executionProfileId: identifier,
  executionProfileRevision: positiveInteger,
  executionProfileDigest: sha256,
  operationVariant: enumeration([
    "fetch", "pull-fast-forward-only", "pull-merge-commit-start", "pull-rebase-start",
    "stage", "unstage", "commit", "merge-fast-forward-only-start", "merge-commit-start",
    "merge-continue", "merge-abort", "rebase-current-branch-no-autostash-start", "rebase-continue",
    "rebase-abort", "push-fast-forward-only", "push-force-with-lease", "branch-create",
    "branch-rename", "branch-delete-merged-only", "branch-delete-force", "worktree-create-detached",
    "worktree-create-new-branch", "worktree-create-existing-branch", "worktree-move",
    "worktree-remove-clean", "worktree-remove-force", "upstream-set", "upstream-unset",
  ]),
  remoteBinding: nullable(gitRemoteBindingCodec),
  resultRecipeDigest: sha256,
  effectBindingDigest: sha256,
};
const gitAuthorisationFields = { ...gitDraftAuthorisationFields, operationId: identifier };
const gitAuthorisationCodec = objectCodec({
  ...gitAuthorisationFields,
  decision: unionOf([gitPreauthorisedDecisionCodec, gitGateDecisionCodec]),
});
const gitIntentBaseCodec = objectCodec({
  kind: literal("git"),
  authorisation: gitAuthorisationCodec,
  repository: gitRepositoryBindingCodec,
  executionProfile: gitExecutionProfileBindingCodec,
  operation: gitOperationCodec,
  resultRecipe: gitResultRecipeCodec,
});
const gitIntentCodec = parserBacked(
  gitIntentBaseCodec,
  (value) => {
    const intent = value as Record<string, unknown>;
    const authorisation = intent.authorisation as Record<string, unknown>;
    const operation = intent.operation as Record<string, unknown>;
    const repository = intent.repository as Record<string, unknown>;
    const profile = intent.executionProfile as Record<string, unknown>;
    const recipe = intent.resultRecipe as Record<string, unknown>;
    if (authorisation.operationVariant !== operation.variant) throw new TypeError("git authorisation operationVariant must match operation variant");
    if (authorisation.resultRecipeDigest !== recipe.resultRecipeDigest) throw new TypeError("git authorisation resultRecipeDigest must match recipe");
    if (authorisation.repositoryStateDigest !== repository.repositoryStateDigest || recipe.beforeRepositoryStateDigest !== repository.repositoryStateDigest) {
      throw new TypeError("git repositoryStateDigest must match recipe and authorisation");
    }
    if (authorisation.executionProfileDigest !== profile.digest || recipe.executionProfileDigest !== profile.digest) {
      throw new TypeError("git executionProfileDigest must match recipe and authorisation");
    }
    const decision = authorisation.decision as Record<string, unknown>;
    if (decision.kind === "preauthorised") {
      const gateOnly = new Set([
        "pull-merge-commit-start", "pull-rebase-start", "merge-fast-forward-only-start", "merge-commit-start",
        "merge-continue", "merge-abort", "rebase-current-branch-no-autostash-start", "rebase-continue",
        "rebase-abort", "push-force-with-lease", "branch-delete-force", "worktree-remove-force",
      ]);
      if (gateOnly.has(String(operation.variant))) throw new TypeError("git gate-only variant cannot be preauthorised");
    } else if (decision.blockedOperationId !== authorisation.operationId) {
      throw new TypeError("git gate blockedOperationId must match operationId");
    }
    return value;
  },
  gitIntentBaseCodec.example,
);
const preauthorisedGitVariantCodec = enumeration([
  "fetch", "pull-fast-forward-only", "stage", "unstage", "commit", "push-fast-forward-only",
  "branch-create", "branch-rename", "branch-delete-merged-only", "worktree-create-detached",
  "worktree-create-new-branch", "worktree-create-existing-branch", "worktree-move",
  "worktree-remove-clean", "upstream-set", "upstream-unset",
]);
const gitGrantConstraintsCodec = objectCodec({
  operationVariants: arrayOf(preauthorisedGitVariantCodec, { minimum: 1, maximum: 16, unique: true }),
  remoteBindings: arrayOf(gitRemoteBindingCodec, { maximum: 32, unique: true }),
  refs: arrayOf(gitRefCodec, { maximum: 256, unique: true }),
  pathPrefixes: arrayOf(relativePath, { maximum: 256, unique: true }),
  allowWorktreeCreation: boolean,
});
const gitActionGrantCodec = objectCodec({
  grantId: identifier,
  revision: positiveInteger,
  projectId: identifier,
  projectSessionId: identifier,
  sessionGeneration: positiveInteger,
  issuingSessionRevision: positiveInteger,
  coordinationRunId: identifier,
  issuingRunRevision: positiveInteger,
  issuingDependencyRevision: positiveInteger,
  authorityRef: sha256,
  authorityRevision: positiveInteger,
  gitAllowlistEpoch: positiveInteger,
  gitAllowlistDigest: sha256,
  repositoryRoot: absoluteFilesystemPathCodec,
  worktreePath: absoluteFilesystemPathCodec,
  executionProfileId: identifier,
  executionProfileRevision: positiveInteger,
  executionProfileDigest: sha256,
  constraints: gitGrantConstraintsCodec,
  sourceAuthority: objectCodec({ kind: enumeration(["launch-envelope", "operator-command"]), digest: sha256 }),
  expiresAt: timestamp,
  grantDigest: sha256,
});
const gitAuthoriseCommonFields = {
  kind: literal("git-authorise"),
  projectId: identifier,
  projectSessionId: identifier,
  expectedSessionRevision: positiveInteger,
  expectedSessionGeneration: positiveInteger,
  coordinationRunId: identifier,
  expectedRunRevision: positiveInteger,
  expectedDependencyRevision: positiveInteger,
  authorityRef: sha256,
  expectedAuthorityRevision: positiveInteger,
  expectedGitAllowlistEpoch: positiveInteger,
  gitAllowlistDigest: sha256,
};
const gitAuthoriseIntentCodec = unionOf([
  objectCodec({ ...gitAuthoriseCommonFields, action: literal("issue"), proposedGrant: gitActionGrantCodec }),
  objectCodec({
    ...gitAuthoriseCommonFields,
    action: literal("revise"),
    currentGrant: gitActionGrantCodec,
    proposedGrant: gitActionGrantCodec,
  }),
  objectCodec({ ...gitAuthoriseCommonFields, action: literal("revoke"), currentGrant: gitActionGrantCodec }),
]);
const gitMutationDraftBindingBaseCodec = objectCodec({
  kind: literal("mutation"),
  authorisation: objectCodec(gitDraftAuthorisationFields),
  repository: gitRepositoryBindingCodec,
  executionProfile: gitExecutionProfileBindingCodec,
  operation: gitOperationCodec,
  resultRecipe: gitResultRecipeCodec,
});
const gitMutationDraftBindingCodec = parserBacked(
  gitMutationDraftBindingBaseCodec,
  (value) => {
    const binding = value as Record<string, unknown>;
    const authorisation = binding.authorisation as Record<string, unknown>;
    const operation = binding.operation as Record<string, unknown>;
    const repository = binding.repository as Record<string, unknown>;
    const profile = binding.executionProfile as Record<string, unknown>;
    const recipe = binding.resultRecipe as Record<string, unknown>;
    if (authorisation.operationVariant !== operation.variant) throw new TypeError("git draft operationVariant must match operation variant");
    if (authorisation.resultRecipeDigest !== recipe.resultRecipeDigest) throw new TypeError("git draft resultRecipeDigest must match recipe");
    if (authorisation.repositoryStateDigest !== repository.repositoryStateDigest || recipe.beforeRepositoryStateDigest !== repository.repositoryStateDigest) {
      throw new TypeError("git draft repositoryStateDigest must match recipe and authorisation");
    }
    if (authorisation.executionProfileDigest !== profile.digest || recipe.executionProfileDigest !== profile.digest) {
      throw new TypeError("git draft executionProfileDigest must match recipe and authorisation");
    }
    return value;
  },
  gitMutationDraftBindingBaseCodec.example,
);
const gitResolutionEligibilityReasonCodec = enumeration([
  "inspector-unavailable",
  "remote-proof-permanently-unavailable",
  "mixed-local-remote-evidence",
  "evidence-integrity-failure",
  "conflict-state-unverifiable",
]);
const gitCustodyResolutionDraftBindingCodec = objectCodec({
  kind: literal("custody-resolution"),
  projectId: identifier,
  projectSessionId: identifier,
  expectedSessionRevision: positiveInteger,
  expectedSessionGeneration: positiveInteger,
  coordinationRunId: identifier,
  expectedRunRevision: positiveInteger,
  expectedDependencyRevision: positiveInteger,
  authorityRef: sha256,
  expectedAuthorityRevision: positiveInteger,
  custodyId: identifier,
  expectedCustodyState: enumeration(["ambiguous", "quarantined"]),
  expectedLookupGeneration: integer({ minimum: 0 }),
  lookupEvidenceDigest: sha256,
  resolutionEligibilityReason: gitResolutionEligibilityReasonCodec,
  adjudication: enumeration(["applied", "no-effect", "quarantine-accepted"]),
  reason: text,
});
const gitOperationDraftIntentCodec = unionOf([
  objectCodec({
    kind: literal("git-operation-draft"),
    action: literal("create"),
    draftRequestId: identifier,
    expiresAt: timestamp,
    binding: unionOf([gitMutationDraftBindingCodec, gitCustodyResolutionDraftBindingCodec]),
  }),
  objectCodec({
    kind: literal("git-operation-draft"),
    action: literal("cancel"),
    projectId: identifier,
    projectSessionId: identifier,
    expectedSessionRevision: positiveInteger,
    expectedSessionGeneration: positiveInteger,
    coordinationRunId: identifier,
    expectedRunRevision: positiveInteger,
    expectedDependencyRevision: positiveInteger,
    draftId: identifier,
    expectedDraftRevision: positiveInteger,
    draftDigest: sha256,
  }),
]);
const gitCustodyResolveIntentCodec = objectCodec({
  kind: literal("git-custody-resolve"),
  projectId: identifier,
  projectSessionId: identifier,
  expectedSessionRevision: positiveInteger,
  expectedSessionGeneration: positiveInteger,
  coordinationRunId: identifier,
  expectedRunRevision: positiveInteger,
  expectedDependencyRevision: positiveInteger,
  authorityRef: sha256,
  expectedAuthorityRevision: positiveInteger,
  draftId: identifier,
  expectedDraftRevision: positiveInteger,
  draftDigest: sha256,
  operationId: identifier,
  custodyId: identifier,
  expectedCustodyState: enumeration(["ambiguous", "quarantined"]),
  expectedLookupGeneration: integer({ minimum: 0 }),
  lookupEvidenceDigest: sha256,
  resolutionEligibilityReason: gitResolutionEligibilityReasonCodec,
  adjudication: enumeration(["applied", "no-effect", "quarantine-accepted"]),
  reason: text,
  gateId: identifier,
  expectedGateRevision: positiveInteger,
  expectedGateStatus: literal("approved"),
});

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
  PROJECT_SESSION_LAUNCH_INTENT_CODEC,
  objectCodec({
    kind: literal("chair-bridge-recovery"),
    schemaVersion: literal(1),
    path: literal("rebind"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    lossId: identifier,
    recoveryManifestDigest: sha256,
    expectedSessionRevision: positiveInteger,
    expectedSessionGeneration: positiveInteger,
    expectedRunRevision: positiveInteger,
    expectedChairGeneration: positiveInteger,
    expectedPrincipalGeneration: positiveInteger,
    expectedBridgeRevision: positiveInteger,
    expectedLostBridgeGeneration: positiveInteger,
    expectedProviderSessionGeneration: positiveInteger,
    providerAdapterId: identifier,
    providerContractDigest: sha256,
    providerActionId: identifier,
  }),
  objectCodec({
    kind: literal("chair-bridge-recovery"),
    schemaVersion: literal(1),
    path: literal("takeover"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    lossId: identifier,
    recoveryManifestDigest: sha256,
    expectedSessionRevision: positiveInteger,
    expectedSessionGeneration: positiveInteger,
    expectedRunRevision: positiveInteger,
    expectedChairGeneration: positiveInteger,
    expectedPrincipalGeneration: positiveInteger,
    expectedBridgeRevision: positiveInteger,
    expectedLostBridgeGeneration: positiveInteger,
    expectedProviderSessionGeneration: positiveInteger,
    providerAdapterId: identifier,
    providerContractDigest: sha256,
    successorAgentId: identifier,
    expectedSuccessorPrincipalGeneration: positiveInteger,
    expectedSuccessorBridgeGeneration: positiveInteger,
    expectedSuccessorRevision: positiveInteger,
  }),
  objectCodec({
    kind: literal("chair-bridge-recovery"),
    schemaVersion: literal(1),
    path: literal("abandon"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    lossId: identifier,
    recoveryManifestDigest: sha256,
    expectedSessionRevision: positiveInteger,
    expectedSessionGeneration: positiveInteger,
    expectedRunRevision: positiveInteger,
    expectedChairGeneration: positiveInteger,
    expectedPrincipalGeneration: positiveInteger,
    expectedBridgeRevision: positiveInteger,
    expectedLostBridgeGeneration: positiveInteger,
    expectedProviderSessionGeneration: positiveInteger,
    providerAdapterId: identifier,
    providerContractDigest: sha256,
    reason: text,
  }),
  objectCodec({
    kind: literal("chair-live-handoff"),
    schemaVersion: literal(1),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    handoffRef: artifactRefCodec,
    predecessorAgentId: identifier,
    successorAgentId: identifier,
    successorAuthorityId: identifier,
    successorAuthorityDigest: sha256,
    expectedSessionRevision: positiveInteger,
    expectedSessionGeneration: positiveInteger,
    expectedMembershipRevision: positiveInteger,
    expectedRunRevision: positiveInteger,
    expectedChairGeneration: positiveInteger,
    expectedChairLeaseId: identifier,
    expectedBridgeRevision: positiveInteger,
    expectedChairBridgeGeneration: positiveInteger,
    expectedPredecessorPrincipalGeneration: positiveInteger,
    expectedSuccessorPrincipalGeneration: positiveInteger,
    expectedSuccessorBridgeRevision: positiveInteger,
    expectedSuccessorBridgeGeneration: positiveInteger,
    providerAdapterId: identifier,
    providerContractDigest: sha256,
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
  gitIntentCodec,
  gitAuthoriseIntentCodec,
  gitOperationDraftIntentCodec,
  gitCustodyResolveIntentCodec,
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
const operatorActionReceiptFields = {
  commandId: identifier,
  previewId: identifier,
  previewRevision: positiveInteger,
  intentDigest: sha256,
  beforeStateDigest: sha256,
  afterStateDigest: sha256,
  evidenceRefs: artifactRefsCodec,
  committedAt: timestamp,
};
const operatorActionReceiptCodec = unionOf([
  objectCodec(operatorActionReceiptFields, { effectRef: artifactRefCodec }),
  objectCodec({ ...operatorActionReceiptFields, providerActionRef: PROVIDER_ACTION_REF_V1_CODEC }, {
    effectRef: artifactRefCodec,
  }),
]);
const operatorActionStatusInputCodec = objectCodec({
  credential: credentialCodec,
  projectId: identifier,
  commandId: identifier,
});
const gitLookupOutcomeCodec = enumeration([
  "exact-conflict", "exact-applied", "exact-no-effect", "incomplete", "unavailable", "inconsistent",
  "inspector-unavailable", "remote-proof-permanently-unavailable", "mixed-local-remote-evidence",
  "evidence-integrity-failure", "conflict-state-unverifiable",
]);
const gitResolutionEligibilityCodec = unionOf([
  objectCodec({ kind: literal("none") }),
  objectCodec({
    kind: literal("eligible"),
    lookupGeneration: positiveInteger,
    evidenceDigest: sha256,
    reason: gitResolutionEligibilityReasonCodec,
  }),
]);
const gitCustodyStatusBaseCodec = objectCodec({
  custodyId: identifier,
  bindingStateRevision: positiveInteger,
  reservationGeneration: positiveInteger,
  commonDirectoryIdentityDigest: sha256,
  predecessorCustodyId: nullable(identifier),
  predecessorConflictGeneration: nullable(positiveInteger),
  ownedConflictGeneration: nullable(positiveInteger),
  lookupGeneration: integer({ minimum: 0 }),
  lookupEvidenceDigest: nullable(sha256),
  lookupOutcome: nullable(gitLookupOutcomeCodec),
  lookupFailureSignatureDigest: nullable(sha256),
  lookupObservedAt: nullable(timestamp),
  resolutionEligibility: gitResolutionEligibilityCodec,
});
const gitCustodyStatusCodec = parserBacked(
  gitCustodyStatusBaseCodec,
  (value) => {
    const custody = value as Record<string, unknown>;
    const predecessorCustodyId = custody.predecessorCustodyId;
    const predecessorConflictGeneration = custody.predecessorConflictGeneration;
    if ((predecessorCustodyId === null) !== (predecessorConflictGeneration === null)) {
      throw new TypeError("Git custody predecessor lineage must be wholly present or absent");
    }
    const lookupGeneration = custody.lookupGeneration as number;
    const lookupEvidenceDigest = custody.lookupEvidenceDigest;
    const lookupOutcome = custody.lookupOutcome;
    const lookupObservedAt = custody.lookupObservedAt;
    const lookupFailureSignatureDigest = custody.lookupFailureSignatureDigest;
    if (lookupGeneration === 0) {
      if (lookupEvidenceDigest !== null || lookupOutcome !== null || lookupObservedAt !== null || lookupFailureSignatureDigest !== null) {
        throw new TypeError("Git custody lookup generation zero cannot carry lookup evidence");
      }
    } else if (lookupEvidenceDigest === null || lookupOutcome === null || lookupObservedAt === null) {
      throw new TypeError("Git custody positive lookup generation requires complete lookup evidence");
    }
    const signatureOutcomes = new Set([
      "incomplete", "unavailable", "inconsistent", "inspector-unavailable",
      "remote-proof-permanently-unavailable", "mixed-local-remote-evidence", "evidence-integrity-failure",
      "conflict-state-unverifiable",
    ]);
    if (signatureOutcomes.has(String(lookupOutcome)) !== (lookupFailureSignatureDigest !== null)) {
      throw new TypeError("Git custody lookup failure signature does not match its outcome");
    }
    const eligibility = custody.resolutionEligibility as Record<string, unknown>;
    if (eligibility.kind === "eligible" && (
      eligibility.lookupGeneration !== lookupGeneration ||
      eligibility.evidenceDigest !== lookupEvidenceDigest ||
      eligibility.reason !== lookupOutcome
    )) throw new TypeError("Git custody resolution eligibility must bind the latest lookup evidence and outcome");
    return value;
  },
  gitCustodyStatusBaseCodec.example,
);
const ownedConflictReconcileCodec = objectCodec({
  kind: literal("owned-conflict"),
  custodyId: identifier,
  expectedBindingState: literal("conflict"),
  expectedBindingStateRevision: positiveInteger,
  expectedOwnedConflictGeneration: positiveInteger,
  expectedPredecessorCustodyId: nullable(identifier),
  expectedPredecessorConflictGeneration: nullable(positiveInteger),
  expectedReservationGeneration: positiveInteger,
  expectedCommonDirectoryIdentityDigest: sha256,
  expectedLookupGeneration: integer({ minimum: 0 }),
  expectedLookupEvidenceDigest: nullable(sha256),
  expectedResolutionEligibility: literal("none"),
});
const inheritedConflictReconcileCodec = objectCodec({
  kind: literal("inherited-successor"),
  custodyId: identifier,
  expectedBindingState: enumeration(["prepared", "ambiguous", "quarantined"]),
  expectedBindingStateRevision: positiveInteger,
  expectedOwnedConflictGeneration: literal(null),
  expectedPredecessorCustodyId: identifier,
  expectedPredecessorConflictGeneration: positiveInteger,
  expectedReservationGeneration: positiveInteger,
  expectedCommonDirectoryIdentityDigest: sha256,
  expectedLookupGeneration: integer({ minimum: 0 }),
  expectedLookupEvidenceDigest: nullable(sha256),
  expectedResolutionEligibility: literal("none"),
});
const operatorActionReconcileBaseCodec = unionOf([
  objectCodec({
    command: operatorMutationCodec,
    projectId: identifier,
    targetCommandId: identifier,
    expectedStatus: enumeration(["pending", "ambiguous"]),
    expectedAttemptGeneration: positiveInteger,
    mode: literal("observe-only"),
  }),
  objectCodec({
    command: operatorMutationCodec,
    projectId: identifier,
    targetCommandId: identifier,
    expectedStatus: literal("conflict"),
    expectedAttemptGeneration: positiveInteger,
    mode: literal("observe-only"),
    gitConflict: ownedConflictReconcileCodec,
  }),
  objectCodec({
    command: operatorMutationCodec,
    projectId: identifier,
    targetCommandId: identifier,
    expectedStatus: enumeration(["pending", "ambiguous", "quarantined"]),
    expectedAttemptGeneration: positiveInteger,
    mode: literal("observe-only"),
    gitConflict: inheritedConflictReconcileCodec,
  }),
]);
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
const operatorActionStatusBaseCodec = unionOf([
  objectCodec({ status: literal("not-found"), commandId: identifier }),
  objectCodec({
    status: literal("pending"),
    commandId: identifier,
    intentDigest: sha256,
    phase: enumeration(["prepared", "dispatched", "accepted", "observing"]),
    attemptGeneration: positiveInteger,
  }),
  objectCodec({
    status: literal("pending"),
    commandId: identifier,
    intentDigest: sha256,
    phase: enumeration(["prepared", "dispatched", "accepted", "observing"]),
    attemptGeneration: positiveInteger,
    providerActionRef: PROVIDER_ACTION_REF_V1_CODEC,
  }),
  objectCodec({
    status: literal("pending"),
    commandId: identifier,
    intentDigest: sha256,
    phase: literal("prepared"),
    attemptGeneration: positiveInteger,
    gitCustody: gitCustodyStatusCodec,
  }),
  objectCodec({
    status: literal("ambiguous"),
    commandId: identifier,
    intentDigest: sha256,
    attemptGeneration: positiveInteger,
    effectRef: artifactRefCodec,
  }),
  objectCodec({
    status: literal("ambiguous"),
    commandId: identifier,
    intentDigest: sha256,
    attemptGeneration: positiveInteger,
    providerActionRef: PROVIDER_ACTION_REF_V1_CODEC,
  }, { effectRef: artifactRefCodec }),
  objectCodec({
    status: literal("ambiguous"),
    commandId: identifier,
    intentDigest: sha256,
    attemptGeneration: positiveInteger,
    gitCustody: gitCustodyStatusCodec,
  }, { effectRef: artifactRefCodec }),
  objectCodec({
    status: literal("conflict"),
    commandId: identifier,
    intentDigest: sha256,
    attemptGeneration: positiveInteger,
    gitCustody: gitCustodyStatusCodec,
  }),
  objectCodec({
    status: literal("quarantined"),
    commandId: identifier,
    intentDigest: sha256,
    attemptGeneration: positiveInteger,
    gitCustody: gitCustodyStatusCodec,
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
const operatorActionStatusCodec = parserBacked(
  operatorActionStatusBaseCodec,
  (value) => {
    const status = value as Record<string, unknown>;
    const custody = status.gitCustody as Record<string, unknown> | undefined;
    if (custody === undefined) return value;
    const predecessorPresent = custody.predecessorCustodyId !== null && custody.predecessorConflictGeneration !== null;
    const eligibility = custody.resolutionEligibility as Record<string, unknown>;
    if (status.status === "pending" && (
      status.phase !== "prepared" || !predecessorPresent || custody.ownedConflictGeneration !== null || eligibility.kind !== "none"
    )) throw new TypeError("Git custody pending status requires one inherited predecessor and no owned conflict or eligibility");
    if (status.status === "conflict" && (
      typeof custody.ownedConflictGeneration !== "number" || eligibility.kind !== "none"
    )) throw new TypeError("Git custody conflict status requires one owned conflict and no resolution eligibility");
    return value;
  },
  operatorActionStatusBaseCodec.example,
);

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
      "chair-bridge-recovery",
      "chair-live-handoff",
      "project-session-drain",
      "project-session-stop",
      "daemon-drain",
      "daemon-stop",
      "git",
      "registered-external-effect",
      "promotion",
    ]), { minimum: 1, maximum: 17, unique: true }),
    requiresPreview: literal(true),
  }),
]);

const operatorDetailRefCodec = unionOf([
  objectCodec({ kind: literal("project"), projectId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("session"), projectSessionId: identifier, expectedRevision: positiveInteger }),
  objectCodec(
    { kind: literal("run"), coordinationRunId: identifier, expectedRevision: positiveInteger },
    { projectSessionId: identifier },
  ),
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
}, { projectSessionId: identifier });
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
}, { nativeNotification: nativeNotificationDeliverySummaryCodec });
const projectSummaryCodec = objectCodec(
  { kind: literal("project"), goal: text, acceptedScopeRef: nullable(artifactRefCodec), repositoryRevision: text },
  { repository: gitRepositorySummaryCodec },
);
const runSummaryCodec = objectCodec({
  kind: literal("run"),
  phase: text,
  health: enumeration(["healthy", "degraded", "blocked", "quarantined", "unknown"]),
  nextMilestone: text,
}, { projectSessionId: identifier });
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
    {
      kind: literal("project"),
      projectId: identifier,
      canonicalRoot: absoluteFilesystemPathCodec,
      goal: text,
      acceptedScopeRef: nullable(artifactRefCodec),
      repositoryRevision: text,
    },
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
  }, { projectSessionId: identifier }),
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
    sourceKind: enumeration(["project-file", "run-file", "git-private-diff"]),
    publisherKind: enumeration(["agent", "operator", "fabric", "project", "migration"]),
    publisherRef: identifier,
    projectSessionId: nullable(identifier),
    coordinationRunId: nullable(identifier),
    taskId: nullable(identifier),
    createdAt: timestamp,
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
  summary: text,
  artifactRefs: artifactRefsCodec,
  gateIds: stringList,
};
const intakeRevisionCodec = unionOf([
  objectCodec({
    origin: literal("operator"),
    command: operatorMutationCodec,
    ...intakeRevisionCommonFields,
    state: enumeration(["awaiting-chair", "discussing", "awaiting-human", "deferred", "cancelled"]),
  }, { chairRequest: taskRequestCodec }),
  objectCodec({
    origin: literal("operator"),
    command: operatorMutationCodec,
    ...intakeRevisionCommonFields,
    state: literal("accepted"),
    acceptedScopeRef: artifactRefCodec,
  }, { chairRequest: taskRequestCodec }),
  objectCodec({
    origin: literal("chair"),
    command: chairMutationCodec,
    ...intakeRevisionCommonFields,
    state: enumeration(["awaiting-chair", "discussing", "awaiting-human", "deferred", "cancelled"]),
  }, { chairRequest: taskRequestCodec }),
  objectCodec({
    origin: literal("chair"),
    command: chairMutationCodec,
    ...intakeRevisionCommonFields,
    state: literal("accepted"),
    acceptedScopeRef: artifactRefCodec,
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
    dependencyRevision: positiveInteger,
    enforcementPoint: literal("task-readiness"),
    taskId: identifier,
  }),
  objectCodec({
    projectSessionId: identifier,
    coordinationRunId: identifier,
    dependencyRevision: positiveInteger,
    enforcementPoint: literal("operation"),
    operationId: activeOperationCodec,
    operationTarget: unionOf([
      objectCodec({ kind: literal("run") }),
      objectCodec({ kind: literal("task"), taskId: identifier }),
    ]),
  }),
  objectCodec({
    projectSessionId: identifier,
    coordinationRunId: identifier,
    dependencyRevision: positiveInteger,
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
const systemGateSupersessionCodec = objectCodec({
  kind: literal("system-supersession"),
  cause: unionOf([
    objectCodec({ kind: literal("operator-command"), ref: identifier }),
    objectCodec({ kind: literal("chair-bridge-loss"), ref: identifier }),
    objectCodec({ kind: literal("system-recovery"), ref: identifier }),
  ]),
  reason: text,
  decidedAt: timestamp,
});
const gateResolutionCodec = unionOf([
  typedGateResolutionCodec,
  attestedGateResolutionCodec,
  systemGateSupersessionCodec,
]);

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

const agentListResultCodec = objectCodec({
  agents: arrayOf(objectCodec({
    agentId: identifier,
    parentAgentId: nullable(identifier),
    lifecycle: text,
    bridgeState: enumeration(["active", "none", "lost"]),
    bridgeGeneration: positiveInteger,
  }), { maximum: 256 }),
});

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
const receiptCodec = objectCodec({ relativePath, schemaVersion: unionOf([literal(1), literal(2)]), sha256: sha256Hex });
const launchAttestationInputCodec = objectCodec({
  challengeResponse: boundedString({
    minBytes: 64,
    maxBytes: 64,
    pattern: "^[a-f0-9]{64}$",
    example: "ab".repeat(32),
  }),
});
const launchAttestationResultCodec = objectCodec({
  attested: literal(true),
  challengeDigest: sha256,
});

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
  if (field === "leader") return direction === "input" ? teamLeaderCodec : objectCodec({ agentId: identifier, authorityId: identifier });
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
    keyCodec: budgetUnitKey,
    exampleKey: "concurrent_turns",
  });
  if (field === "dimensions") return direction === "input"
    ? nonEmptyNumberRecord
    : recordOf(budgetDimensionCodec, { maximum: 128, keyCodec: budgetUnitKey });
  if (field === "returned") return numberRecord;
  if (field === "capacity") return operation === FABRIC_OPERATIONS.projectionSnapshot
    ? projectionFact(jsonRecord)
    : recordOf(resourceDimensionCodec, { maximum: 128, keyCodec: budgetUnitKey });
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
  if (field === "receipts") return arrayOf(objectCodec({ relativePath, sha256: sha256Hex, exportedAt: integer() }), { maximum: 256 });
  if (field === "barrier") return objectCodec({ state: enumeration(["open", "closed"]) });
  if (field === "counts") return objectCodec({
    agents: integer(), tasks: integer(), tasksTerminal: integer(), messages: integer(),
    deliveriesUnacknowledged: integer(), leasesActive: integer(),
  });
  if (field === "receipt") return receiptCodec;
  if (field === "deliveries" && operation === FABRIC_OPERATIONS.receiveMessages && direction === "result") {
    return arrayOf(deliveryItemCodec, { maximum: 256 });
  }
  if (field === "rotation") return objectCodec({
    kind: enumeration(["in-place", "replacement-session"]),
    priorResumeReference: identifier,
  });
  if (field === "releaseBinding") return releaseBindingCodec;
  if (field === "resolution") return gateResolutionCodec;
  if (field === "artifactRefs" || field === "evidenceRefs") return artifactRefsCodec;
  if (["launchPacketRef", "handoffRef", "consequencePreviewRef", "drainReceiptRef"].includes(field)) return artifactRefCodec;
  if (field === "relativePath") return relativePath;
  if (
    field === "sha256" &&
    (operation === FABRIC_OPERATIONS.publishArtifact || operation === FABRIC_OPERATIONS.exportReceipt)
  ) return sha256Hex;
  if (field === "checkpointSha256" && operation === FABRIC_OPERATIONS.reportProviderState) return sha256Hex;
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
  capacity: recordOf(resourceDimensionCodec, { maximum: 128, keyCodec: budgetUnitKey }),
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
  if (operation === FABRIC_OPERATIONS.evidencePublish) return evidencePublishInputCodec;
  if (operation === FABRIC_OPERATIONS.operatorArtifactContentRead) return artifactContentReadInputCodec;
  if (operation === FABRIC_OPERATIONS.launchAttest) return launchAttestationInputCodec;
  if (operation === FABRIC_OPERATIONS.sendMessage) return legacyMessageCodec;
  if (operation === FABRIC_OPERATIONS.createTeam) return teamCreateCodec;
  if (operation === FABRIC_OPERATIONS.workstreamCreate) return workstreamCreateCodec;
  if (operation === FABRIC_OPERATIONS.workstreamSettle) return workstreamSettleCodec;
  if (operation === FABRIC_OPERATIONS.intakeDraftCreate) return intakeDraftCreateCodec;
  if (operation === FABRIC_OPERATIONS.scopedGateRead) return scopedGateReadInputCodec;
  if (operation === FABRIC_OPERATIONS.projectionViewPage) return operatorViewPageInputCodec;
  if (operation === FABRIC_OPERATIONS.projectionDetailRead) return operatorDetailReadInputCodec;
  if (operation === FABRIC_OPERATIONS.operatorRepositoryRead) return gitRepositoryReadInputCodec;
  if (operation === FABRIC_OPERATIONS.projectSessionTransition) return projectSessionTransitionInputCodec;
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
  if (operation === FABRIC_OPERATIONS.evidencePublish) return evidenceRegistrationCodec;
  if (operation === FABRIC_OPERATIONS.operatorArtifactContentRead) return artifactContentReadResultCodec;
  if (operation === FABRIC_OPERATIONS.launchAttest) return launchAttestationResultCodec;
  if (operation === FABRIC_OPERATIONS.spawnAgent || operation === FABRIC_OPERATIONS.attachAgent) {
    return agentCustodyResultCodec;
  }
  if (taskResultOperations.has(operation)) return taskResultCodec;
  if (leaseResultOperations.has(operation)) return leaseResultCodec;
  if (lifecycleResultOperations.has(operation)) return lifecycleResultCodec;
  if (providerActionResultOperations.has(operation)) return providerActionResultCodec;
  if (operation === FABRIC_OPERATIONS.createTeam) return teamResultCodec;
  if (operation === FABRIC_OPERATIONS.workstreamCreate || operation === FABRIC_OPERATIONS.workstreamSettle) {
    return workstreamProjectionCodec;
  }
  if (operation === FABRIC_OPERATIONS.listAgents) return agentListResultCodec;
  if (teamResultOperations.has(operation)) return visibleTeamResultCodec;
  if (budgetResultOperations.has(operation)) return budgetResultCodec;
  if (([
    FABRIC_OPERATIONS.projectSessionCreate,
    FABRIC_OPERATIONS.projectSessionGet,
    FABRIC_OPERATIONS.projectSessionTransition,
    FABRIC_OPERATIONS.projectSessionClose,
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

export function operationInputSchemaForPrincipal(
  operation: ProtocolOperation,
  principal: OperationPrincipalKind,
): JsonSchema {
  if (!OPERATION_REGISTRY[operation].principals.includes(principal)) {
    throw new TypeError(`${principal} principal cannot invoke ${operation}`);
  }
  const schema = OPERATION_CODECS[operation].input.schema;
  if (!(new Set<ProtocolOperation>([
    FABRIC_OPERATIONS.membershipBind,
    FABRIC_OPERATIONS.intakeRevise,
    FABRIC_OPERATIONS.scopedGateCreate,
  ])).has(operation)) return schema;
  const variants = schema.oneOf;
  if (!Array.isArray(variants)) throw new Error(`${operation} principal-bound input schema has no variants`);
  const expectedOrigin = principal === "agent" ? "chair" : "operator";
  const matched = variants.find((variant) => {
    if (typeof variant !== "object" || variant === null || Array.isArray(variant)) return false;
    const properties = Reflect.get(variant, "properties");
    if (typeof properties !== "object" || properties === null || Array.isArray(properties)) return false;
    const origin = Reflect.get(properties, "origin");
    return typeof origin === "object" && origin !== null && Reflect.get(origin, "const") === expectedOrigin;
  });
  if (matched === undefined || typeof matched !== "object" || matched === null || Array.isArray(matched)) {
    throw new Error(`${operation} has no ${principal} input schema`);
  }
  return matched as JsonSchema;
}

export function parseOperationInput<Operation extends ProtocolOperation>(
  operation: Operation,
  value: unknown,
): OperationInputMap[Operation] {
  if (!isFabricOperation(operation)) throw new TypeError(`unknown fabric operation: ${String(operation)}`);
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
  if (!isFabricOperation(operation)) throw new TypeError(`unknown fabric operation: ${String(operation)}`);
  return OPERATION_CODECS[operation].result.parse(value, `${operation}.result`) as OperationResultMap[Operation];
}

export function assertCodecRegistryExhaustive(): void {
  const operations = Object.keys(OPERATION_REGISTRY);
  if (operations.length !== Object.keys(OPERATION_CODECS).length) {
    throw new Error("operation codec registry is not exhaustive");
  }
}

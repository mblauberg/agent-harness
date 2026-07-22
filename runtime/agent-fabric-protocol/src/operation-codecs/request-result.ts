import { FABRIC_OPERATIONS } from "../operations.js";
import { parseResultDelivery, parseTaskCompleteWithReply, parseTaskRequest } from "../request-result.js";
import { assertWorkstreamCreateSemantics, type WorkstreamCreateRequest } from "../workstreams.js";
import { arrayOf, boolean, boundedString, enumeration, identifier, integer, literal, objectCodec, parserBacked, relativePath, sha256, timestamp, unionOf } from "../codec.js";
import { artifactRefCodec, artifactRefsCodec, object, parsedBy, positiveInteger, semanticShapeCodec, stringList, text, type OperationCodecFragment, type OperationShapeFragment, chairMutationCodec, numberRecord, teamLeaderCodec, teamMemberCodec, discussionGroupCodec, rootTaskInputCodec } from "./common.js";

export const REQUEST_RESULT_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.taskRequest]: object(["commandId", "projectSessionId", "coordinationRunId", "task", "request"]),
  [FABRIC_OPERATIONS.taskCompleteWithReply]: object(["commandId", "taskId", "expectedTaskRevision", "ownerLeaseId", "ownerLeaseGeneration", "requestMessageId", "expectedRequestRevision", "callbackId", "callbackGeneration", "reply", "terminalResult"]),
  [FABRIC_OPERATIONS.resultDeliveryClaim]: object(["commandId", "resultDeliveryId", "expectedRevision", "expectedClaimGeneration", "claimantAgentId", "claimDeadline"]),
  [FABRIC_OPERATIONS.resultDeliveryProviderAccept]: object(["commandId", "resultDeliveryId", "expectedRevision", "claimGeneration", "providerAdapterId", "providerActionId"]),
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
} as const satisfies OperationShapeFragment;

export const REQUEST_RESULT_RESULT_SHAPES = {
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
} as const satisfies OperationShapeFragment;

export const workstreamCreateBaseCodec = objectCodec({
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

export const baseWorkstreamCreateExample = workstreamCreateBaseCodec.example as WorkstreamCreateRequest;

export const workstreamCreateCodec = parserBacked(
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

export const workstreamSettleCodec = objectCodec({
  command: chairMutationCodec,
  expectedSessionGeneration: positiveInteger,
  expectedMembershipRevision: positiveInteger,
  workstreamId: identifier,
  expectedWorkstreamRevision: positiveInteger,
  expectedRootTaskRevision: positiveInteger,
  expectedTeamGeneration: positiveInteger,
});

export const workstreamProjectionCodec = objectCodec({
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

export const intakeBindingCodec = objectCodec({
  intakeId: identifier,
  intakeRevision: positiveInteger,
  gateIds: stringList,
  artifactDigests: arrayOf(sha256, { maximum: 128, unique: true }),
});

export const taskRequestTaskCodec = objectCodec({
  taskId: identifier,
  taskRevision: positiveInteger,
  objective: text,
  baseRevision: text,
  expectedArtifactPaths: arrayOf(relativePath, { maximum: 128, unique: true }),
});

export const taskRequestMessageCodec = objectCodec({
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

export const taskRequestCodec = objectCodec({
  commandId: identifier,
  projectSessionId: identifier,
  coordinationRunId: identifier,
  task: taskRequestTaskCodec,
  request: taskRequestMessageCodec,
});

export const replyCodec = objectCodec({
  messageId: identifier,
  conversationId: identifier,
  replyToMessageId: identifier,
  body: boundedString({ maxBytes: 4096 }),
  artifactRefs: artifactRefsCodec,
});

export const terminalResultCodec = objectCodec({
  status: literal("complete"),
  summary: text,
  completedAt: timestamp,
});

export const taskCompletionCodec = objectCodec({
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

export const resultDeliveryBase = {
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

export const resultDeliveryCodec = unionOf([
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

export const requestResultOperationCodecFragment = {
  [FABRIC_OPERATIONS.taskRequest]: { input: parsedBy(taskRequestCodec, parseTaskRequest), result: semanticShapeCodec(FABRIC_OPERATIONS.taskRequest, "result", REQUEST_RESULT_RESULT_SHAPES[FABRIC_OPERATIONS.taskRequest]) },
  [FABRIC_OPERATIONS.taskCompleteWithReply]: { input: parsedBy(taskCompletionCodec, parseTaskCompleteWithReply), result: objectCodec({ taskRevision: positiveInteger, replyRevision: positiveInteger, resultDelivery: resultDeliveryCodec }) },
  [FABRIC_OPERATIONS.resultDeliveryClaim]: { input: semanticShapeCodec(FABRIC_OPERATIONS.resultDeliveryClaim, "input", REQUEST_RESULT_INPUT_SHAPES[FABRIC_OPERATIONS.resultDeliveryClaim]), result: parsedBy(resultDeliveryCodec, parseResultDelivery) },
  [FABRIC_OPERATIONS.resultDeliveryProviderAccept]: { input: semanticShapeCodec(FABRIC_OPERATIONS.resultDeliveryProviderAccept, "input", REQUEST_RESULT_INPUT_SHAPES[FABRIC_OPERATIONS.resultDeliveryProviderAccept]), result: parsedBy(resultDeliveryCodec, parseResultDelivery) },
  [FABRIC_OPERATIONS.resultDeliveryConsume]: { input: semanticShapeCodec(FABRIC_OPERATIONS.resultDeliveryConsume, "input", REQUEST_RESULT_INPUT_SHAPES[FABRIC_OPERATIONS.resultDeliveryConsume]), result: parsedBy(resultDeliveryCodec, parseResultDelivery) },
  [FABRIC_OPERATIONS.resultDeliveryRetry]: { input: semanticShapeCodec(FABRIC_OPERATIONS.resultDeliveryRetry, "input", REQUEST_RESULT_INPUT_SHAPES[FABRIC_OPERATIONS.resultDeliveryRetry]), result: parsedBy(resultDeliveryCodec, parseResultDelivery) },
  [FABRIC_OPERATIONS.resultDeliveryReassign]: { input: semanticShapeCodec(FABRIC_OPERATIONS.resultDeliveryReassign, "input", REQUEST_RESULT_INPUT_SHAPES[FABRIC_OPERATIONS.resultDeliveryReassign]), result: parsedBy(resultDeliveryCodec, parseResultDelivery) },
  [FABRIC_OPERATIONS.resultDeliveryAbandon]: { input: semanticShapeCodec(FABRIC_OPERATIONS.resultDeliveryAbandon, "input", REQUEST_RESULT_INPUT_SHAPES[FABRIC_OPERATIONS.resultDeliveryAbandon]), result: parsedBy(resultDeliveryCodec, parseResultDelivery) },
  [FABRIC_OPERATIONS.workstreamCreate]: { input: workstreamCreateCodec, result: workstreamProjectionCodec },
  [FABRIC_OPERATIONS.workstreamSettle]: { input: workstreamSettleCodec, result: workstreamProjectionCodec },
} satisfies OperationCodecFragment;

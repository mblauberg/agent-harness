import {
  parseArtifactRef,
  parseBoundedUtf8String,
  parseCanonicalRelativePath,
  parseIdentifier,
  parseSha256Digest,
  parseTimestamp,
  requiredString,
  safeInteger,
  strictRecord,
  stringArray,
  type AgentId,
  type ArtifactRef,
  type BarrierId,
  type CallbackId,
  type CommandId,
  type ConversationId,
  type CoordinationRunId,
  type GateId,
  type Identifier,
  type IntakeId,
  type LeaseId,
  type MessageId,
  type ProjectSessionId,
  type ProviderSessionRef,
  type ResultDeliveryId,
  type Sha256Digest,
  type TaskId,
  type Timestamp,
} from "./primitives.js";

export type IntakeRequestBinding = {
  intakeId: IntakeId;
  intakeRevision: number;
  gateIds: readonly GateId[];
  artifactDigests: readonly Sha256Digest[];
};

export type TaskRequest = {
  commandId: CommandId;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  task: {
    taskId: TaskId;
    taskRevision: number;
    objective: string;
    baseRevision: string;
    expectedArtifactPaths: readonly string[];
  };
  request: {
    requestRevision: number;
    messageId: MessageId;
    conversationId: ConversationId;
    targetAgentId: AgentId;
    targetProviderSessionRef: ProviderSessionRef;
    requiresAck: true;
    dedupeKey: string;
    responseDeadline: Timestamp;
    callbackId: CallbackId;
    callbackGeneration: number;
    dependentBarrierId: BarrierId;
    intakeBinding?: IntakeRequestBinding;
  };
};

export type TaskCompleteWithReply = {
  commandId: CommandId;
  taskId: TaskId;
  expectedTaskRevision: number;
  ownerLeaseId: LeaseId;
  ownerLeaseGeneration: number;
  requestMessageId: MessageId;
  expectedRequestRevision: number;
  callbackId: CallbackId;
  callbackGeneration: number;
  reply: {
    messageId: MessageId;
    conversationId: ConversationId;
    replyToMessageId: MessageId;
    body: string;
    artifactRefs: readonly ArtifactRef[];
  };
  terminalResult: {
    status: "complete";
    summary: string;
    completedAt: Timestamp;
  };
};

type ResultDeliveryBase = {
  resultDeliveryId: ResultDeliveryId;
  revision: number;
  projectSessionId: ProjectSessionId;
  taskId: TaskId;
  requestMessageId: MessageId;
  requestRevision: number;
  replyMessageId: MessageId;
  replyRevision: number;
  taskRevision: number;
  callbackId: CallbackId;
  callbackGeneration: number;
  assignmentGeneration: number;
  targetAgentId: AgentId;
  targetProviderSessionRef: ProviderSessionRef;
  payloadDigest: Sha256Digest;
  responseDeadline: Timestamp;
  dependentBarrierId: BarrierId;
  required: boolean;
  claimGeneration: number;
};

export type ResultDelivery =
  | (ResultDeliveryBase & { state: "pending" })
  | (ResultDeliveryBase & {
      state: "claimed";
      claimedByAgentId: AgentId;
      claimDeadline: Timestamp;
    })
  | (ResultDeliveryBase & {
      state: "provider-accepted";
      claimedByAgentId: AgentId;
      claimDeadline: Timestamp;
      providerAcceptedAt: Timestamp;
    })
  | (ResultDeliveryBase & { state: "consumed"; consumedAt: Timestamp })
  | (ResultDeliveryBase & { state: "overdue"; overdueAt: Timestamp })
  | (ResultDeliveryBase & { state: "abandoned"; abandonedAt: Timestamp; reason: string });

export type ResultDeliveryClaimRequest = {
  commandId: CommandId;
  resultDeliveryId: ResultDeliveryId;
  expectedRevision: number;
  expectedClaimGeneration: number;
  claimantAgentId: AgentId;
  claimDeadline: Timestamp;
};

export type ResultDeliveryProviderAcceptRequest = {
  commandId: CommandId;
  resultDeliveryId: ResultDeliveryId;
  expectedRevision: number;
  claimGeneration: number;
  providerActionId: string;
};

export type ResultDeliveryConsumeRequest = {
  commandId: CommandId;
  resultDeliveryId: ResultDeliveryId;
  expectedRevision: number;
  claimGeneration: number;
  callbackId: CallbackId;
  payloadDigest: Sha256Digest;
};

export type ResultDeliveryRetryRequest = {
  commandId: CommandId;
  resultDeliveryId: ResultDeliveryId;
  expectedRevision: number;
  sameCallbackId: CallbackId;
  reason: string;
};

export type ResultDeliveryReassignRequest = {
  commandId: CommandId;
  resultDeliveryId: ResultDeliveryId;
  expectedRevision: number;
  targetAgentId: AgentId;
  targetProviderSessionRef: ProviderSessionRef;
  reason: string;
};

export type ResultDeliveryAbandonRequest = {
  commandId: CommandId;
  resultDeliveryId: ResultDeliveryId;
  expectedRevision: number;
  reason: string;
};

function parseIdentifierArray<Kind extends string>(value: unknown, path: string): Array<Identifier<Kind>> {
  return stringArray(value, path).map((entry, index) => parseIdentifier<Kind>(entry, `${path}[${String(index)}]`));
}

function parseIntakeBinding(value: unknown): IntakeRequestBinding {
  const record = strictRecord(value, "taskRequest.request.intakeBinding", [
    "intakeId",
    "intakeRevision",
    "gateIds",
    "artifactDigests",
  ]);
  const gateIds = parseIdentifierArray<"GateId">(record.gateIds, "taskRequest.request.intakeBinding.gateIds");
  if (!Array.isArray(record.artifactDigests)) {
    throw new TypeError("taskRequest.request.intakeBinding.artifactDigests must be an array");
  }
  return {
    intakeId: parseIdentifier<"IntakeId">(record.intakeId, "taskRequest.request.intakeBinding.intakeId"),
    intakeRevision: safeInteger(record.intakeRevision, "taskRequest.request.intakeBinding.intakeRevision", 1),
    gateIds,
    artifactDigests: record.artifactDigests.map((digest, index) => parseSha256Digest(
      digest,
      `taskRequest.request.intakeBinding.artifactDigests[${String(index)}]`,
    )),
  };
}

export function parseTaskRequest(value: unknown): TaskRequest {
  const record = strictRecord(value, "taskRequest", ["commandId", "projectSessionId", "coordinationRunId", "task", "request"]);
  const task = strictRecord(record.task, "taskRequest.task", [
    "taskId",
    "taskRevision",
    "objective",
    "baseRevision",
    "expectedArtifactPaths",
  ]);
  const request = strictRecord(record.request, "taskRequest.request", [
    "requestRevision",
    "messageId",
    "conversationId",
    "targetAgentId",
    "targetProviderSessionRef",
    "requiresAck",
    "dedupeKey",
    "responseDeadline",
    "callbackId",
    "callbackGeneration",
    "dependentBarrierId",
    "intakeBinding",
  ]);
  if (request.requiresAck !== true) throw new TypeError("taskRequest.request.requiresAck must be true");
  return {
    commandId: parseIdentifier<"CommandId">(record.commandId, "taskRequest.commandId"),
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, "taskRequest.projectSessionId"),
    coordinationRunId: parseIdentifier<"CoordinationRunId">(
      record.coordinationRunId,
      "taskRequest.coordinationRunId",
    ),
    task: {
      taskId: parseIdentifier<"TaskId">(task.taskId, "taskRequest.task.taskId"),
      taskRevision: safeInteger(task.taskRevision, "taskRequest.task.taskRevision", 1),
      objective: requiredString(task.objective, "taskRequest.task.objective"),
      baseRevision: requiredString(task.baseRevision, "taskRequest.task.baseRevision"),
      expectedArtifactPaths: stringArray(task.expectedArtifactPaths, "taskRequest.task.expectedArtifactPaths").map(
        (artifactPath, index) => parseCanonicalRelativePath(
          artifactPath,
          `taskRequest.task.expectedArtifactPaths[${String(index)}]`,
        ),
      ),
    },
    request: {
      requestRevision: safeInteger(request.requestRevision, "taskRequest.request.requestRevision", 1),
      messageId: parseIdentifier<"MessageId">(request.messageId, "taskRequest.request.messageId"),
      conversationId: parseIdentifier<"ConversationId">(request.conversationId, "taskRequest.request.conversationId"),
      targetAgentId: parseIdentifier<"AgentId">(request.targetAgentId, "taskRequest.request.targetAgentId"),
      targetProviderSessionRef: parseIdentifier<"ProviderSessionRef">(
        request.targetProviderSessionRef,
        "taskRequest.request.targetProviderSessionRef",
      ),
      requiresAck: true,
      dedupeKey: requiredString(request.dedupeKey, "taskRequest.request.dedupeKey"),
      responseDeadline: parseTimestamp(request.responseDeadline, "taskRequest.request.responseDeadline"),
      callbackId: parseIdentifier<"CallbackId">(request.callbackId, "taskRequest.request.callbackId"),
      callbackGeneration: safeInteger(request.callbackGeneration, "taskRequest.request.callbackGeneration", 1),
      dependentBarrierId: parseIdentifier<"BarrierId">(
        request.dependentBarrierId,
        "taskRequest.request.dependentBarrierId",
      ),
      ...(request.intakeBinding === undefined ? {} : { intakeBinding: parseIntakeBinding(request.intakeBinding) }),
    },
  };
}

function parseArtifactRefs(value: unknown, path: string): ArtifactRef[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value.map((artifact, index) => parseArtifactRef(artifact, `${path}[${String(index)}]`));
}

export function parseTaskCompleteWithReply(value: unknown): TaskCompleteWithReply {
  const record = strictRecord(value, "taskCompleteWithReply", [
    "commandId",
    "taskId",
    "expectedTaskRevision",
    "ownerLeaseId",
    "ownerLeaseGeneration",
    "requestMessageId",
    "expectedRequestRevision",
    "callbackId",
    "callbackGeneration",
    "reply",
    "terminalResult",
  ]);
  const reply = strictRecord(record.reply, "taskCompleteWithReply.reply", [
    "messageId",
    "conversationId",
    "replyToMessageId",
    "body",
    "artifactRefs",
  ]);
  const terminalResult = strictRecord(record.terminalResult, "taskCompleteWithReply.terminalResult", [
    "status",
    "summary",
    "completedAt",
  ]);
  const requestMessageId = parseIdentifier<"MessageId">(
    record.requestMessageId,
    "taskCompleteWithReply.requestMessageId",
  );
  const replyToMessageId = parseIdentifier<"MessageId">(
    reply.replyToMessageId,
    "taskCompleteWithReply.reply.replyToMessageId",
  );
  if (replyToMessageId !== requestMessageId) {
    throw new TypeError("taskCompleteWithReply.reply.replyToMessageId must equal requestMessageId");
  }
  if (terminalResult.status !== "complete") {
    throw new TypeError("taskCompleteWithReply.terminalResult.status must be complete");
  }
  return {
    commandId: parseIdentifier<"CommandId">(record.commandId, "taskCompleteWithReply.commandId"),
    taskId: parseIdentifier<"TaskId">(record.taskId, "taskCompleteWithReply.taskId"),
    expectedTaskRevision: safeInteger(record.expectedTaskRevision, "taskCompleteWithReply.expectedTaskRevision", 1),
    ownerLeaseId: parseIdentifier<"LeaseId">(record.ownerLeaseId, "taskCompleteWithReply.ownerLeaseId"),
    ownerLeaseGeneration: safeInteger(
      record.ownerLeaseGeneration,
      "taskCompleteWithReply.ownerLeaseGeneration",
      1,
    ),
    requestMessageId,
    expectedRequestRevision: safeInteger(
      record.expectedRequestRevision,
      "taskCompleteWithReply.expectedRequestRevision",
      1,
    ),
    callbackId: parseIdentifier<"CallbackId">(record.callbackId, "taskCompleteWithReply.callbackId"),
    callbackGeneration: safeInteger(record.callbackGeneration, "taskCompleteWithReply.callbackGeneration", 1),
    reply: {
      messageId: parseIdentifier<"MessageId">(reply.messageId, "taskCompleteWithReply.reply.messageId"),
      conversationId: parseIdentifier<"ConversationId">(
        reply.conversationId,
        "taskCompleteWithReply.reply.conversationId",
      ),
      replyToMessageId,
      body: parseBoundedUtf8String(reply.body, "taskCompleteWithReply.reply.body", 4096),
      artifactRefs: parseArtifactRefs(reply.artifactRefs, "taskCompleteWithReply.reply.artifactRefs"),
    },
    terminalResult: {
      status: "complete",
      summary: requiredString(terminalResult.summary, "taskCompleteWithReply.terminalResult.summary"),
      completedAt: parseTimestamp(terminalResult.completedAt, "taskCompleteWithReply.terminalResult.completedAt"),
    },
  };
}

const resultBaseFields = [
  "resultDeliveryId",
  "revision",
  "projectSessionId",
  "taskId",
  "requestMessageId",
  "requestRevision",
  "replyMessageId",
  "replyRevision",
  "taskRevision",
  "callbackId",
  "callbackGeneration",
  "assignmentGeneration",
  "targetAgentId",
  "targetProviderSessionRef",
  "payloadDigest",
  "responseDeadline",
  "dependentBarrierId",
  "required",
  "state",
  "claimGeneration",
] as const;

function parseResultBase(record: Record<string, unknown>): ResultDeliveryBase {
  if (typeof record.required !== "boolean") throw new TypeError("resultDelivery.required must be a boolean");
  return {
    resultDeliveryId: parseIdentifier<"ResultDeliveryId">(record.resultDeliveryId, "resultDelivery.resultDeliveryId"),
    revision: safeInteger(record.revision, "resultDelivery.revision", 1),
    projectSessionId: parseIdentifier<"ProjectSessionId">(
      record.projectSessionId,
      "resultDelivery.projectSessionId",
    ),
    taskId: parseIdentifier<"TaskId">(record.taskId, "resultDelivery.taskId"),
    requestMessageId: parseIdentifier<"MessageId">(record.requestMessageId, "resultDelivery.requestMessageId"),
    requestRevision: safeInteger(record.requestRevision, "resultDelivery.requestRevision", 1),
    replyMessageId: parseIdentifier<"MessageId">(record.replyMessageId, "resultDelivery.replyMessageId"),
    replyRevision: safeInteger(record.replyRevision, "resultDelivery.replyRevision", 1),
    taskRevision: safeInteger(record.taskRevision, "resultDelivery.taskRevision", 1),
    callbackId: parseIdentifier<"CallbackId">(record.callbackId, "resultDelivery.callbackId"),
    callbackGeneration: safeInteger(record.callbackGeneration, "resultDelivery.callbackGeneration", 1),
    assignmentGeneration: safeInteger(record.assignmentGeneration, "resultDelivery.assignmentGeneration", 1),
    targetAgentId: parseIdentifier<"AgentId">(record.targetAgentId, "resultDelivery.targetAgentId"),
    targetProviderSessionRef: parseIdentifier<"ProviderSessionRef">(
      record.targetProviderSessionRef,
      "resultDelivery.targetProviderSessionRef",
    ),
    payloadDigest: parseSha256Digest(record.payloadDigest, "resultDelivery.payloadDigest"),
    responseDeadline: parseTimestamp(record.responseDeadline, "resultDelivery.responseDeadline"),
    dependentBarrierId: parseIdentifier<"BarrierId">(record.dependentBarrierId, "resultDelivery.dependentBarrierId"),
    required: record.required,
    claimGeneration: safeInteger(record.claimGeneration, "resultDelivery.claimGeneration"),
  };
}

export function parseResultDelivery(value: unknown): ResultDelivery {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("resultDelivery must be an object");
  }
  const state: unknown = Reflect.get(value, "state");
  const stateFields = state === "claimed"
    ? ["claimedByAgentId", "claimDeadline"]
    : state === "provider-accepted"
      ? ["claimedByAgentId", "claimDeadline", "providerAcceptedAt"]
      : state === "consumed"
        ? ["consumedAt"]
        : state === "overdue"
          ? ["overdueAt"]
          : state === "abandoned"
            ? ["abandonedAt", "reason"]
            : [];
  const record = strictRecord(value, "resultDelivery", [...resultBaseFields, ...stateFields]);
  const base = parseResultBase(record);
  if (state === "pending") return { ...base, state };
  if (state === "claimed") {
    return {
      ...base,
      state,
      claimedByAgentId: parseIdentifier<"AgentId">(record.claimedByAgentId, "resultDelivery.claimedByAgentId"),
      claimDeadline: parseTimestamp(record.claimDeadline, "resultDelivery.claimDeadline"),
    };
  }
  if (state === "provider-accepted") {
    return {
      ...base,
      state,
      claimedByAgentId: parseIdentifier<"AgentId">(record.claimedByAgentId, "resultDelivery.claimedByAgentId"),
      claimDeadline: parseTimestamp(record.claimDeadline, "resultDelivery.claimDeadline"),
      providerAcceptedAt: parseTimestamp(record.providerAcceptedAt, "resultDelivery.providerAcceptedAt"),
    };
  }
  if (state === "consumed") {
    return { ...base, state, consumedAt: parseTimestamp(record.consumedAt, "resultDelivery.consumedAt") };
  }
  if (state === "overdue") {
    return { ...base, state, overdueAt: parseTimestamp(record.overdueAt, "resultDelivery.overdueAt") };
  }
  if (state === "abandoned") {
    return {
      ...base,
      state,
      abandonedAt: parseTimestamp(record.abandonedAt, "resultDelivery.abandonedAt"),
      reason: requiredString(record.reason, "resultDelivery.reason"),
    };
  }
  throw new TypeError("resultDelivery.state is invalid");
}

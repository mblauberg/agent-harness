import { describe, expect, it } from "vitest";

import {
  parseResultDelivery,
  parseTaskCompleteWithReply,
  parseTaskRequest,
} from "../src/index.js";

const taskRequest = {
  commandId: "command_request_01",
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  task: {
    taskId: "task_01",
    taskRevision: 1,
    objective: "Review the protocol boundary.",
    baseRevision: "c2fc623",
    expectedArtifactPaths: ["reviews/protocol.md"],
  },
  request: {
    requestRevision: 1,
    messageId: "message_request_01",
    conversationId: "conversation_01",
    targetAgentId: "agent_peer",
    targetProviderSessionRef: "session_peer",
    requiresAck: true,
    dedupeKey: "request-01",
    responseDeadline: "2026-07-11T10:00:00.000Z",
    callbackId: "callback_01",
    callbackGeneration: 1,
    dependentBarrierId: "barrier_01",
  },
} as const;

describe("atomic task request schema", () => {
  it("accepts an answer-bearing request with a durable callback", () => {
    expect(parseTaskRequest(taskRequest)).toStrictEqual(taskRequest);
  });

  it("rejects fire-and-forget input from the answer-bearing request operation", () => {
    expect(() => parseTaskRequest({
      ...taskRequest,
      request: { ...taskRequest.request, requiresAck: false },
    })).toThrowError(/request.requiresAck must be true/);
  });

  it("rejects a request without a response deadline", () => {
    const { responseDeadline: _responseDeadline, ...request } = taskRequest.request;
    expect(() => parseTaskRequest({ ...taskRequest, request })).toThrowError(/request.responseDeadline/);
  });
});

const completion = {
  commandId: "command_complete_01",
  taskId: "task_01",
  expectedTaskRevision: 1,
  ownerLeaseId: "lease_task_01",
  ownerLeaseGeneration: 3,
  requestMessageId: "message_request_01",
  expectedRequestRevision: 1,
  callbackId: "callback_01",
  callbackGeneration: 1,
  reply: {
    messageId: "message_reply_01",
    conversationId: "conversation_01",
    replyToMessageId: "message_request_01",
    body: "Review complete.",
    artifactRefs: [{
      path: "reviews/protocol.md",
      digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }],
  },
  terminalResult: {
    status: "complete",
    summary: "Review complete.",
    completedAt: "2026-07-11T09:00:00.000Z",
  },
} as const;

describe("atomic completion-with-reply schema", () => {
  it("accepts one reply bound to the exact request and callback generations", () => {
    expect(parseTaskCompleteWithReply(completion)).toStrictEqual(completion);
  });

  it("rejects a reply linked to another request", () => {
    expect(() => parseTaskCompleteWithReply({
      ...completion,
      reply: { ...completion.reply, replyToMessageId: "message_other" },
    })).toThrowError(/replyToMessageId must equal requestMessageId/);
  });
});

const pendingDelivery = {
  resultDeliveryId: "delivery_result_01",
  revision: 1,
  projectSessionId: "ps_01",
  taskId: "task_01",
  requestMessageId: "message_request_01",
  requestRevision: 1,
  replyMessageId: "message_reply_01",
  replyRevision: 1,
  taskRevision: 2,
  callbackId: "callback_01",
  callbackGeneration: 1,
  assignmentGeneration: 1,
  targetAgentId: "agent_requester",
  targetProviderSessionRef: "session_requester",
  payloadDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  responseDeadline: "2026-07-11T10:00:00.000Z",
  dependentBarrierId: "barrier_01",
  required: true,
  state: "pending",
  claimGeneration: 0,
} as const;

describe("result-delivery state schema", () => {
  it("accepts a pending durable callback independently of mailbox state", () => {
    expect(parseResultDelivery(pendingDelivery)).toStrictEqual(pendingDelivery);
  });

  it("rejects a claimed callback without a bounded claim deadline", () => {
    expect(() => parseResultDelivery({
      ...pendingDelivery,
      state: "claimed",
      claimGeneration: 1,
      claimedByAgentId: "agent_requester",
    })).toThrowError(/claimDeadline/);
  });

  it("rejects stale state-only fields on a pending callback", () => {
    expect(() => parseResultDelivery({ ...pendingDelivery, consumedAt: "2026-07-11T09:01:00.000Z" })).toThrowError(
      /unknown field: consumedAt/,
    );
  });
});

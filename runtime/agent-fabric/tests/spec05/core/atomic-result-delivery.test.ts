import type Database from "better-sqlite3";
import type {
  ResultDeliveryClaimRequest,
  ResultDeliveryConsumeRequest,
  ResultDeliveryProviderAcceptRequest,
  TaskCompleteWithReply,
  TaskRequest,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import {
  AtomicDeliveryStore,
  resultDeliveryProviderActionBinding,
  type AuthenticatedIntegrationContext,
} from "../../../src/results/store.ts";
import {
  chairContext,
  openSpec05Database,
  workerContext,
} from "./restart-recovery-fixtures.ts";

const databases: Database.Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function open(): Database.Database {
  const database = openSpec05Database();
  databases.push(database);
  return database;
}

function request(overrides: Readonly<Record<string, unknown>> = {}): TaskRequest {
  return {
    commandId: "request_command",
    projectSessionId: "session_01",
    coordinationRunId: "run_01",
    task: {
      taskId: "task_answer",
      taskRevision: 1,
      objective: "Return a bounded answer.",
      baseRevision: "base-answer",
      expectedArtifactPaths: ["artifacts/answer.md"],
    },
    request: {
      requestRevision: 1,
      messageId: "message_request",
      conversationId: "conversation_answer",
      targetAgentId: "worker_01",
      targetProviderSessionRef: "provider-worker",
      requiresAck: true,
      dedupeKey: "answer-request",
      responseDeadline: "2099-01-01T00:00:00.000Z",
      callbackId: "callback_answer",
      callbackGeneration: 1,
      dependentBarrierId: "barrier_answer",
    },
    ...overrides,
  } as unknown as TaskRequest;
}

function completion(): TaskCompleteWithReply {
  return {
    commandId: "complete_command",
    taskId: "task_answer",
    expectedTaskRevision: 1,
    ownerLeaseId: "task-owner:run_01:task_answer:1",
    ownerLeaseGeneration: 1,
    requestMessageId: "message_request",
    expectedRequestRevision: 1,
    callbackId: "callback_answer",
    callbackGeneration: 1,
    reply: {
      messageId: "message_reply",
      conversationId: "conversation_answer",
      replyToMessageId: "message_request",
      body: "Bounded answer.",
      artifactRefs: [{ path: "artifacts/answer.md", digest: `sha256:${"b".repeat(64)}` }],
    },
    terminalResult: {
      status: "complete",
      summary: "Answer complete.",
      completedAt: "2026-07-11T00:00:01.000Z",
    },
  } as unknown as TaskCompleteWithReply;
}

const integrationContext: AuthenticatedIntegrationContext = {
  integrationId: "integration_provider",
  projectId: "project_01",
  projectSessionId: "session_01",
  coordinationRunId: "run_01",
  principalGeneration: 1,
};

describe("atomic request, result, and callback delivery", () => {
  it.each([
    "results:request:after-task",
    "results:request:after-message",
    "results:request:after-mailbox",
    "results:request:after-request",
  ])("exposes none of the request composite after crash at %s", (failpoint) => {
    const database = open();
    const store = new AtomicDeliveryStore({
      database,
      clock: () => 1_000,
      fault: (label) => {
        if (label === failpoint) throw new Error("crash");
      },
    });

    expect(() => store.request(chairContext, request())).toThrow("crash");
    expect(database.prepare("SELECT count(*) AS count FROM tasks WHERE task_id='task_answer'").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT count(*) AS count FROM messages WHERE message_id='message_request'").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT count(*) AS count FROM task_requests").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT count(*) AS count FROM task_request_barriers").get()).toEqual({ count: 0 });
  });

  it.each([
    "results:complete:after-reply",
    "results:complete:after-task-result",
    "results:complete:after-delivery",
    "results:complete:after-terminal-task",
  ])("exposes none of the reply/result composite after crash at %s", (failpoint) => {
    const database = open();
    new AtomicDeliveryStore({ database, clock: () => 1_000 }).request(chairContext, request());
    const crashing = new AtomicDeliveryStore({
      database,
      clock: () => 2_000,
      fault: (label) => {
        if (label === failpoint) throw new Error("crash");
      },
    });

    expect(() => crashing.completeWithReply(workerContext, completion())).toThrow("crash");
    expect(database.prepare("SELECT count(*) AS count FROM messages WHERE message_id='message_reply'").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT count(*) AS count FROM task_results").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT count(*) AS count FROM result_deliveries").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT state, revision FROM tasks WHERE task_id='task_answer'").get())
      .toEqual({ state: "active", revision: 1 });
  });

  it("commits task/request/recipients/barrier then reply/result/artifacts/pending delivery exactly once", () => {
    const database = open();
    const store = new AtomicDeliveryStore({ database, clock: () => 1_000 });
    const committed = store.request(chairContext, request());
    expect(committed).toEqual({
      taskRevision: 1,
      requestRevision: 1,
      callbackId: "callback_answer",
      callbackGeneration: 1,
    });
    expect(store.request(chairContext, request())).toEqual(committed);
    expect(database.prepare("SELECT state, owner_agent_id FROM tasks WHERE task_id='task_answer'").get())
      .toEqual({ state: "active", owner_agent_id: "worker_01" });
    expect(database.prepare("SELECT state FROM task_request_barriers WHERE request_id='message_request'").get())
      .toEqual({ state: "blocked" });

    const completed = store.completeWithReply(workerContext, completion());
    expect(completed).toMatchObject({
      taskRevision: 2,
      replyRevision: 1,
      resultDelivery: {
        state: "pending",
        callbackId: "callback_answer",
        targetAgentId: "chair_01",
        targetProviderSessionRef: "provider-chair",
        required: true,
      },
    });
    expect(store.completeWithReply(workerContext, completion())).toEqual(completed);
    expect(database.prepare("SELECT state, revision FROM tasks WHERE task_id='task_answer'").get())
      .toEqual({ state: "complete", revision: 2 });
    expect(database.prepare("SELECT count(*) AS count FROM artifacts WHERE task_id='task_answer'").get())
      .toEqual({ count: 1 });
    expect(database.prepare(`
      SELECT member_kind, state FROM project_session_memberships
       WHERE member_id IN ('message_reply', (SELECT artifact_id FROM artifacts WHERE task_id='task_answer'))
       ORDER BY member_kind
    `).all()).toEqual([
      { member_kind: "artifact-obligation", state: "reconciled" },
      { member_kind: "required-message", state: "active" },
    ]);
    expect(database.prepare("SELECT state FROM task_request_barriers WHERE request_id='message_request'").get())
      .toEqual({ state: "blocked" });

    const resultDeliveryId = completed.resultDelivery.resultDeliveryId;
    const claimed = store.claim(chairContext, {
      commandId: "claim_command",
      resultDeliveryId,
      expectedRevision: 1,
      expectedClaimGeneration: 0,
      claimantAgentId: "chair_01",
      claimDeadline: "2099-01-01T00:00:01.000Z",
    } as unknown as ResultDeliveryClaimRequest);
    expect(claimed).toMatchObject({ state: "claimed", revision: 2, claimGeneration: 1 });

    database.prepare(`
      INSERT INTO provider_actions(
        run_id, action_id, adapter_id, operation, target_agent_id,
        provider_session_generation, turn_lease_generation, identity_hash,
        payload_hash, payload_json, status, history_json, execution_count,
        effect_count, idempotency_proven, updated_at
      ) VALUES (
        'run_01', 'provider_action_wrong', 'adapter', 'inject', 'chair_01',
        1, 1, 'identity-wrong', 'payload-wrong', '{}', 'accepted', '[]', 1, 0, 1, 1
      )
    `).run();
    expect(() => store.providerAccept(integrationContext, {
      commandId: "accept_wrong_command",
      resultDeliveryId,
      expectedRevision: 2,
      claimGeneration: 1,
      providerActionId: "provider_action_wrong",
    } as unknown as ResultDeliveryProviderAcceptRequest)).toThrow(/exact result callback/u);

    const providerPayload = JSON.stringify({
      fabricResultDelivery: resultDeliveryProviderActionBinding(claimed),
    });
    database.prepare(`
      INSERT INTO provider_actions(
        run_id, action_id, adapter_id, operation, target_agent_id,
        provider_session_generation, turn_lease_generation, identity_hash,
        payload_hash, payload_json, status, history_json, execution_count,
        effect_count, idempotency_proven, updated_at
      ) VALUES (
        'run_01', 'provider_action_result', 'adapter', 'inject', 'chair_01',
        1, 1, 'identity', 'payload', ?, 'accepted', '[]', 1, 0, 1, 1
      )
    `).run(providerPayload);
    const accepted = store.providerAccept(integrationContext, {
      commandId: "accept_command",
      resultDeliveryId,
      expectedRevision: 2,
      claimGeneration: 1,
      providerActionId: "provider_action_result",
    } as unknown as ResultDeliveryProviderAcceptRequest);
    expect(accepted).toMatchObject({ state: "provider-accepted", revision: 3 });
    const consumed = store.consume(chairContext, {
      commandId: "consume_command",
      resultDeliveryId,
      expectedRevision: 3,
      claimGeneration: 1,
      callbackId: "callback_answer",
      payloadDigest: accepted.payloadDigest,
    } as unknown as ResultDeliveryConsumeRequest);
    expect(consumed).toMatchObject({ state: "consumed", revision: 4 });
    expect(database.prepare("SELECT state FROM task_request_barriers WHERE request_id='message_request'").get())
      .toEqual({ state: "released" });
  });
});

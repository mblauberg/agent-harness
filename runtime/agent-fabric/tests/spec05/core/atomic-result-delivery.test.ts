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

function requestWithDeadline(responseDeadline: string): TaskRequest {
  const value = request();
  return {
    ...value,
    request: { ...value.request, responseDeadline },
  } as TaskRequest;
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

  it("fences a claimed callback at its response deadline and emits one deduplicated native alert", () => {
    let now = Date.parse("2026-07-11T00:00:00.000Z");
    const database = open();
    database.prepare(`
      INSERT INTO daemon_runtime_epochs(
        instance_generation, instance_id, state, started_at, heartbeat_at
      ) VALUES (7, 'daemon-deadline-7', 'running', ?, ?)
    `).run(now, now);
    const store = new AtomicDeliveryStore({ database, clock: () => now });
    store.request(chairContext, requestWithDeadline("2026-07-11T00:00:01.000Z"));
    const completed = store.completeWithReply(workerContext, completion());
    const claimed = store.claim(chairContext, {
      commandId: "deadline_claim_command",
      resultDeliveryId: completed.resultDelivery.resultDeliveryId,
      expectedRevision: 1,
      expectedClaimGeneration: 0,
      claimantAgentId: "chair_01",
      claimDeadline: "2026-07-11T00:10:00.000Z",
    } as unknown as ResultDeliveryClaimRequest);
    expect(claimed).toMatchObject({ state: "claimed", claimGeneration: 1, revision: 2 });

    now = Date.parse("2026-07-11T00:00:02.000Z");
    const first = store.sweepDeadlines({ daemonInstanceGeneration: 7, passGeneration: 1 });
    expect(first).toEqual({
      daemonInstanceGeneration: 7,
      passGeneration: 1,
      overdueDeliveries: 1,
      overdueRequests: 0,
      attentionItems: 1,
      notificationsEnqueued: 1,
    });
    expect(store.get(completed.resultDelivery.resultDeliveryId)).toMatchObject({
      state: "overdue",
      revision: 3,
      claimGeneration: 2,
    });
    expect(database.prepare(`
      SELECT claimed_by, claim_deadline FROM result_deliveries
       WHERE result_delivery_id=?
    `).get(completed.resultDelivery.resultDeliveryId)).toEqual({
      claimed_by: null,
      claim_deadline: null,
    });
    expect(database.prepare("SELECT state FROM task_request_barriers WHERE request_id='message_request'").get())
      .toEqual({ state: "blocked" });
    expect(database.prepare(`
      SELECT kind, severity, state FROM attention_items
       WHERE dedupe_key='result-overdue:callback_answer'
    `).get()).toEqual({ kind: "critical-path-block", severity: "critical-path", state: "open" });
    expect(database.prepare(`
      SELECT target_integration, state FROM notification_deliveries
    `).all()).toEqual([{ target_integration: "native-desktop", state: "pending" }]);

    expect(store.sweepDeadlines({ daemonInstanceGeneration: 7, passGeneration: 1 })).toEqual(first);
    expect(store.sweepDeadlines({ daemonInstanceGeneration: 7, passGeneration: 2 })).toEqual({
      daemonInstanceGeneration: 7,
      passGeneration: 2,
      overdueDeliveries: 0,
      overdueRequests: 0,
      attentionItems: 0,
      notificationsEnqueued: 0,
    });
    expect(database.prepare("SELECT COUNT(*) AS count FROM attention_items").get()).toEqual({ count: 1 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM notification_deliveries").get()).toEqual({ count: 1 });
  });

  it("marks an unanswered request overdue live and a late result cannot duplicate its alert or release its barrier", () => {
    let now = Date.parse("2026-07-11T00:00:00.000Z");
    const database = open();
    database.prepare(`
      INSERT INTO daemon_runtime_epochs(
        instance_generation, instance_id, state, started_at, heartbeat_at
      ) VALUES (8, 'daemon-deadline-8', 'running', ?, ?)
    `).run(now, now);
    const store = new AtomicDeliveryStore({ database, clock: () => now });
    store.request(chairContext, requestWithDeadline("2026-07-11T00:00:01.000Z"));
    now = Date.parse("2026-07-11T00:00:02.000Z");

    expect(store.sweepDeadlines({ daemonInstanceGeneration: 8, passGeneration: 1 })).toMatchObject({
      overdueDeliveries: 0,
      overdueRequests: 1,
      attentionItems: 1,
      notificationsEnqueued: 1,
    });
    expect(database.prepare("SELECT state FROM task_requests WHERE request_id='message_request'").get())
      .toEqual({ state: "overdue" });
    const late = store.completeWithReply(workerContext, completion());
    expect(late.resultDelivery).toMatchObject({ state: "overdue" });
    expect(store.sweepDeadlines({ daemonInstanceGeneration: 8, passGeneration: 2 })).toMatchObject({
      overdueDeliveries: 0,
      overdueRequests: 0,
      attentionItems: 0,
      notificationsEnqueued: 0,
    });
    expect(database.prepare("SELECT state FROM task_request_barriers WHERE request_id='message_request'").get())
      .toEqual({ state: "blocked" });
    expect(database.prepare("SELECT COUNT(*) AS count FROM attention_items").get()).toEqual({ count: 1 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM notification_deliveries").get()).toEqual({ count: 1 });
  });

  it("alerts when a late reply creates an overdue delivery before the first live sweep", () => {
    let now = Date.parse("2026-07-11T00:00:00.000Z");
    const database = open();
    database.prepare(`
      INSERT INTO daemon_runtime_epochs(
        instance_generation, instance_id, state, started_at, heartbeat_at
      ) VALUES (9, 'daemon-deadline-9', 'running', ?, ?)
    `).run(now, now);
    const store = new AtomicDeliveryStore({ database, clock: () => now });
    store.request(chairContext, requestWithDeadline("2026-07-11T00:00:01.000Z"));
    now = Date.parse("2026-07-11T00:00:02.000Z");
    const late = store.completeWithReply(workerContext, completion());
    expect(late.resultDelivery).toMatchObject({ state: "overdue" });

    expect(store.sweepDeadlines({ daemonInstanceGeneration: 9, passGeneration: 1 })).toMatchObject({
      overdueDeliveries: 0,
      overdueRequests: 0,
      attentionItems: 1,
      notificationsEnqueued: 1,
    });
    expect(database.prepare("SELECT COUNT(*) AS count FROM attention_items").get()).toEqual({ count: 1 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM notification_deliveries").get()).toEqual({ count: 1 });
    expect(database.prepare("SELECT state FROM task_request_barriers WHERE request_id='message_request'").get())
      .toEqual({ state: "blocked" });
  });
});

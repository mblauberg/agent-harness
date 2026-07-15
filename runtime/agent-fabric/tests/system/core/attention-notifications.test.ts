import type Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  NotificationOutbox,
  type AttentionProducerContext,
  type NotificationWorkerContext,
} from "../../../src/attention/outbox.ts";
import { openSystemDatabase } from "./restart-recovery-fixtures.ts";

const databases: Database.Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function open(): Database.Database {
  const database = openSystemDatabase();
  databases.push(database);
  return database;
}

const producer: AttentionProducerContext = {
  producerId: "daemon-attention",
  projectId: "project_01",
  projectSessionId: "session_01",
  coordinationRunId: "run_01",
  principalGeneration: 1,
};

const nativeWorker: NotificationWorkerContext = {
  workerInstanceId: "notification-worker-01",
  integrationId: "native-desktop",
};

function attention(payload: Readonly<Record<string, unknown>> = { gateId: "gate_release", duplicateCount: 1 }) {
  return {
    dedupeKey: "gate:release",
    kind: "consequential-gate",
    severity: "critical-path",
    payload,
  };
}

describe("durable attention and native-notification outbox", () => {
  it("keeps one stable attention identity and one delivery per exact revision and integration", () => {
    const database = open();
    const outbox = new NotificationOutbox({ database, clock: () => 1_000 });

    const first = outbox.upsertAttention(producer, attention());
    expect(first).toMatchObject({
      revision: 1,
      state: "open",
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dedupeKey: "gate:release",
    });
    expect(outbox.upsertAttention(producer, attention())).toEqual(first);
    const delivery = outbox.enqueue(producer, {
      itemId: first.itemId,
      expectedItemRevision: 1,
      targetIntegration: "native-desktop",
    });
    expect(delivery).toMatchObject({
      itemId: first.itemId,
      itemRevision: 1,
      targetIntegration: "native-desktop",
      state: "pending",
      claimGeneration: 0,
    });
    expect(outbox.enqueue(producer, {
      itemId: first.itemId,
      expectedItemRevision: 1,
      targetIntegration: "native-desktop",
    })).toEqual(delivery);

    const revised = outbox.upsertAttention(producer, attention({ gateId: "gate_release", duplicateCount: 2 }));
    expect(revised).toMatchObject({ itemId: first.itemId, revision: 2 });
    const revisedDelivery = outbox.enqueue(producer, {
      itemId: first.itemId,
      expectedItemRevision: 2,
      targetIntegration: "native-desktop",
    });
    expect(revisedDelivery.notificationId).not.toBe(delivery.notificationId);
    expect(outbox.get(delivery.notificationId)).toMatchObject({ state: "deduplicated" });
    expect(database.prepare("SELECT count(*) AS count FROM attention_items").get()).toEqual({ count: 1 });
    expect(database.prepare("SELECT count(*) AS count FROM notification_deliveries").get()).toEqual({ count: 2 });
  });

  it("claims and journals an exact revision without changing or acknowledging attention", () => {
    const database = open();
    const outbox = new NotificationOutbox({ database, clock: () => 1_000 });
    const item = outbox.upsertAttention(producer, attention());
    const delivery = outbox.enqueue(producer, {
      itemId: item.itemId,
      expectedItemRevision: item.revision,
      targetIntegration: "native-desktop",
    });
    outbox.setIntegrationAvailability(nativeWorker, {
      state: "available",
      discoveredContract: {
        exactAttentionFocus: { supported: true, contractTested: true },
      },
    });

    const claimRequest = {
      notificationId: delivery.notificationId,
      expectedItemRevision: 1,
      expectedClaimGeneration: 0,
      claimDeadline: "2099-01-01T00:00:00.000Z",
    };
    const claimed = outbox.claim(nativeWorker, claimRequest);
    expect(claimed).toMatchObject({ state: "claimed", claimGeneration: 1 });
    outbox.setIntegrationAvailability(nativeWorker, { state: "stale", discoveredContract: {} });
    outbox.upsertAttention(producer, attention({ gateId: "gate_release", duplicateCount: 2 }));
    expect(outbox.claim(nativeWorker, claimRequest)).toMatchObject({
      ...claimed,
      availability: "stale",
    });
    expect(database.prepare("SELECT count(*) AS count FROM notification_attempts").get()).toEqual({ count: 1 });

    const sent = outbox.recordOutcome(nativeWorker, {
      notificationId: delivery.notificationId,
      claimGeneration: 1,
      outcome: "sent",
      effectIdentityHash: claimed.effectIdentityHash,
      detail: { receipt: "native-receipt-01" },
    });
    expect(sent).toMatchObject({ state: "sent", claimGeneration: 1 });
    expect(outbox.recordOutcome(nativeWorker, {
      notificationId: delivery.notificationId,
      claimGeneration: 1,
      outcome: "sent",
      effectIdentityHash: claimed.effectIdentityHash,
      detail: { receipt: "native-receipt-01" },
    })).toEqual(sent);
    expect(database.prepare("SELECT revision, state FROM attention_items WHERE item_id=?").get(item.itemId))
      .toEqual({ revision: 2, state: "open" });
    expect(outbox.exactFocusAction(delivery.notificationId)).toBeNull();
    outbox.setIntegrationAvailability(nativeWorker, {
      state: "available",
      discoveredContract: {
        exactAttentionFocus: { supported: true, contractTested: true },
      },
    });
    expect(outbox.exactFocusAction(delivery.notificationId)).toEqual({
      integrationId: "native-desktop",
      action: "focus-attention-item",
      itemId: item.itemId,
      itemRevision: 1,
      projectSessionId: "session_01",
    });
  });

  it("settles authoritative Attention while an already-claimed notification finishes honestly", () => {
    const database = open();
    const outbox = new NotificationOutbox({ database, clock: () => 1_000 });
    const item = outbox.upsertAttention(producer, attention());
    const delivery = outbox.enqueue(producer, {
      itemId: item.itemId,
      expectedItemRevision: item.revision,
      targetIntegration: "native-desktop",
    });
    outbox.setIntegrationAvailability(nativeWorker, {
      state: "available",
      discoveredContract: {},
    });
    const claimed = outbox.claim(nativeWorker, {
      notificationId: delivery.notificationId,
      expectedItemRevision: item.revision,
      expectedClaimGeneration: 0,
      claimDeadline: "2099-01-01T00:00:00.000Z",
    });

    expect(outbox.settleAttention(producer, {
      itemId: item.itemId,
      expectedRevision: item.revision,
      state: "resolved",
      reason: "gate-approved",
    })).toMatchObject({ state: "resolved", revision: 2 });
    expect(outbox.get(delivery.notificationId)).toMatchObject({
      state: "claimed",
      claimGeneration: 1,
    });
    expect(outbox.recordOutcome(nativeWorker, {
      notificationId: delivery.notificationId,
      claimGeneration: claimed.claimGeneration,
      outcome: "sent",
      effectIdentityHash: claimed.effectIdentityHash,
      detail: { receipt: "native-receipt-after-resolution" },
    })).toMatchObject({ state: "sent" });
    expect(() => outbox.enqueue(producer, {
      itemId: item.itemId,
      expectedItemRevision: 2,
      targetIntegration: "native-desktop",
    })).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
  });

  it.each(["unavailable", "stale"] as const)("keeps delivery pending when integration is %s", (state) => {
    const database = open();
    const outbox = new NotificationOutbox({ database, clock: () => 1_000 });
    const item = outbox.upsertAttention(producer, attention());
    const delivery = outbox.enqueue(producer, {
      itemId: item.itemId,
      expectedItemRevision: item.revision,
      targetIntegration: "native-desktop",
    });
    outbox.setIntegrationAvailability(nativeWorker, { state, discoveredContract: {} });

    expect(() => outbox.claim(nativeWorker, {
      notificationId: delivery.notificationId,
      expectedItemRevision: 1,
      expectedClaimGeneration: 0,
      claimDeadline: "2099-01-01T00:00:00.000Z",
    })).toThrow(/integration is not available/u);
    expect(outbox.get(delivery.notificationId)).toMatchObject({ state: "pending", availability: state });
    expect(outbox.exactFocusAction(delivery.notificationId)).toBeNull();
  });

  it("marks an expired in-flight effect ambiguous on restart and never blindly retries it", () => {
    const database = open();
    let now = 1_000;
    const outbox = new NotificationOutbox({ database, clock: () => now });
    const item = outbox.upsertAttention(producer, attention());
    const delivery = outbox.enqueue(producer, {
      itemId: item.itemId,
      expectedItemRevision: item.revision,
      targetIntegration: "native-desktop",
    });
    outbox.setIntegrationAvailability(nativeWorker, { state: "available", discoveredContract: {} });
    outbox.claim(nativeWorker, {
      notificationId: delivery.notificationId,
      expectedItemRevision: 1,
      expectedClaimGeneration: 0,
      claimDeadline: "1970-01-01T00:00:02.000Z",
    });

    now = 3_000;
    const restarted = new NotificationOutbox({ database, clock: () => now });
    expect(restarted.recover()).toEqual({ ambiguousClaims: 1 });
    expect(restarted.get(delivery.notificationId)).toMatchObject({
      state: "ambiguous",
      claimGeneration: 1,
    });
    expect(database.prepare("SELECT state FROM notification_attempts WHERE notification_id=?").get(delivery.notificationId))
      .toEqual({ state: "ambiguous" });
    expect(restarted.recover()).toEqual({ ambiguousClaims: 0 });
    expect(() => restarted.claim(nativeWorker, {
      notificationId: delivery.notificationId,
      expectedItemRevision: 1,
      expectedClaimGeneration: 1,
      claimDeadline: "2099-01-01T00:00:00.000Z",
    })).toThrow(/pending notification/u);
    expect(restarted.reconcileAmbiguous(nativeWorker, {
      notificationId: delivery.notificationId,
      claimGeneration: 1,
      outcome: "sent",
      effectIdentityHash: outbox.get(delivery.notificationId).effectIdentityHash ?? "",
      evidence: { lookupReceipt: "native-lookup-01", proved: true },
    })).toMatchObject({ state: "sent", claimGeneration: 1 });
    expect(database.prepare("SELECT state FROM notification_attempts WHERE notification_id=?").get(delivery.notificationId))
      .toEqual({ state: "sent" });
  });

  it("retries a proved failed attempt under the same dedupe key and appends an attempt", () => {
    const database = open();
    const outbox = new NotificationOutbox({ database, clock: () => 1_000 });
    const item = outbox.upsertAttention(producer, attention());
    const delivery = outbox.enqueue(producer, {
      itemId: item.itemId,
      expectedItemRevision: item.revision,
      targetIntegration: "native-desktop",
    });
    outbox.setIntegrationAvailability(nativeWorker, { state: "available", discoveredContract: {} });
    const firstClaim = outbox.claim(nativeWorker, {
      notificationId: delivery.notificationId,
      expectedItemRevision: 1,
      expectedClaimGeneration: 0,
      claimDeadline: "2099-01-01T00:00:00.000Z",
    });
    outbox.recordOutcome(nativeWorker, {
      notificationId: delivery.notificationId,
      claimGeneration: 1,
      outcome: "failed",
      effectIdentityHash: firstClaim.effectIdentityHash,
      detail: { error: "notification centre unavailable" },
    });
    expect(outbox.retryFailed(nativeWorker, {
      notificationId: delivery.notificationId,
      expectedClaimGeneration: 1,
      reason: "Availability was re-established.",
    })).toMatchObject({ state: "pending", claimGeneration: 1 });
    outbox.claim(nativeWorker, {
      notificationId: delivery.notificationId,
      expectedItemRevision: 1,
      expectedClaimGeneration: 1,
      claimDeadline: "2099-01-01T00:00:00.000Z",
    });
    expect(database.prepare("SELECT count(*) AS count FROM notification_attempts WHERE notification_id=?")
      .get(delivery.notificationId)).toEqual({ count: 2 });
  });

  it("rolls back delivery and attempt state at every injected outbox crash point", () => {
    const database = open();
    const normal = new NotificationOutbox({ database, clock: () => 1_000 });
    const item = normal.upsertAttention(producer, attention());
    const delivery = normal.enqueue(producer, {
      itemId: item.itemId,
      expectedItemRevision: item.revision,
      targetIntegration: "native-desktop",
    });
    normal.setIntegrationAvailability(nativeWorker, { state: "available", discoveredContract: {} });
    const crashing = new NotificationOutbox({
      database,
      clock: () => 1_000,
      fault: (label) => {
        if (label === "attention:claim:after-delivery") throw new Error("crash");
      },
    });

    expect(() => crashing.claim(nativeWorker, {
      notificationId: delivery.notificationId,
      expectedItemRevision: 1,
      expectedClaimGeneration: 0,
      claimDeadline: "2099-01-01T00:00:00.000Z",
    })).toThrow("crash");
    expect(normal.get(delivery.notificationId)).toMatchObject({ state: "pending", claimGeneration: 0 });
    expect(database.prepare("SELECT count(*) AS count FROM notification_attempts").get()).toEqual({ count: 0 });
  });

  it("refuses exact focus unless the available integration advertises a tested action contract", () => {
    const database = open();
    const outbox = new NotificationOutbox({ database, clock: () => 1_000 });
    const item = outbox.upsertAttention(producer, attention());
    const delivery = outbox.enqueue(producer, {
      itemId: item.itemId,
      expectedItemRevision: item.revision,
      targetIntegration: "native-desktop",
    });
    outbox.setIntegrationAvailability(nativeWorker, {
      state: "available",
      discoveredContract: { exactAttentionFocus: { supported: true, contractTested: false } },
    });
    expect(outbox.exactFocusAction(delivery.notificationId)).toBeNull();
  });
});

import type Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { NotificationOutbox, type AttentionProducerContext } from "../../../src/attention/outbox.ts";
import {
  NativeNotificationWorker,
  type NativeNotificationAdapter,
} from "../../../src/attention/notification-worker.ts";
import { openSpec05Database } from "./restart-recovery-fixtures.ts";

const databases: Database.Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

const producer: AttentionProducerContext = {
  producerId: "daemon-attention",
  projectId: "project_01",
  projectSessionId: "session_01",
  coordinationRunId: "run_01",
  principalGeneration: 1,
};

function fixture(kind = "consequential-gate"): {
  database: Database.Database;
  outbox: NotificationOutbox;
} {
  const database = openSpec05Database();
  databases.push(database);
  const outbox = new NotificationOutbox({ database, clock: () => 1_000 });
  const item = outbox.upsertAttention(producer, {
    dedupeKey: `attention:${kind}`,
    kind,
    severity: "critical-path",
    payload: { title: "Release gate", summary: "Review\u001b[2J evidence", gateId: "gate_release" },
  });
  outbox.enqueue(producer, {
    itemId: item.itemId,
    expectedItemRevision: item.revision,
    targetIntegration: "native-desktop",
  });
  return { database, outbox };
}

function adapter(sent: Array<{ title: string; body: string }>, available = true): NativeNotificationAdapter {
  return {
    discover: async () => available
      ? { state: "available", contract: { schemaVersion: 1, exactAttentionFocus: { supported: false, contractTested: false } } }
      : { state: "unavailable", contract: { schemaVersion: 1, reason: "unsupported-platform" } },
    send: async (notification) => {
      sent.push({ title: notification.title, body: notification.body });
      return { receipt: "native-receipt-01" };
    },
  };
}

describe("daemon-owned native notification worker", () => {
  it("claims one exact revision, emits once, journals success and never mutates attention", async () => {
    const { database, outbox } = fixture();
    const sent: Array<{ title: string; body: string }> = [];
    const worker = new NativeNotificationWorker({
      outbox,
      adapter: adapter(sent),
      workerInstanceId: "notification-worker-01",
      integrationId: "native-desktop",
      clock: () => 1_000,
    });

    await expect(worker.runOnce()).resolves.toEqual({ examined: 1, sent: 1, failed: 0, deduplicated: 0 });
    await expect(worker.runOnce()).resolves.toEqual({ examined: 0, sent: 0, failed: 0, deduplicated: 0 });
    expect(sent).toEqual([{ title: "Release gate", body: "Review evidence" }]);
    expect(database.prepare("SELECT state FROM notification_deliveries").get()).toEqual({ state: "sent" });
    expect(database.prepare("SELECT state FROM attention_items").get()).toEqual({ state: "open" });
  });

  it("deduplicates non-consequential categories without invoking the native adapter", async () => {
    const { database, outbox } = fixture("routine-activity");
    const sent: Array<{ title: string; body: string }> = [];
    const worker = new NativeNotificationWorker({
      outbox,
      adapter: adapter(sent),
      workerInstanceId: "notification-worker-01",
      integrationId: "native-desktop",
      clock: () => 1_000,
    });

    await expect(worker.runOnce()).resolves.toEqual({ examined: 1, sent: 0, failed: 0, deduplicated: 1 });
    expect(sent).toEqual([]);
    expect(database.prepare("SELECT state FROM notification_deliveries").get()).toEqual({ state: "deduplicated" });
  });

  it("reports unavailable without claiming or losing pending work", async () => {
    const { database, outbox } = fixture();
    const worker = new NativeNotificationWorker({
      outbox,
      adapter: adapter([], false),
      workerInstanceId: "notification-worker-01",
      integrationId: "native-desktop",
      clock: () => 1_000,
    });

    await expect(worker.runOnce()).resolves.toEqual({ examined: 0, sent: 0, failed: 0, deduplicated: 0 });
    expect(database.prepare("SELECT state FROM notification_deliveries").get()).toEqual({ state: "pending" });
    expect(database.prepare("SELECT state FROM integration_availability WHERE integration_id='native-desktop'").get())
      .toEqual({ state: "unavailable" });
  });

  it("leaves best-effort work pending when its project session is no longer active", async () => {
    const { database, outbox } = fixture();
    database.prepare("UPDATE project_sessions SET state='closed', revision=revision+1").run();
    database.prepare("UPDATE runs SET lifecycle_state='closed', revision=revision+1").run();
    const worker = new NativeNotificationWorker({
      outbox,
      adapter: adapter([], true),
      workerInstanceId: "notification-worker-01",
      integrationId: "native-desktop",
      clock: () => 1_000,
    });
    const original = worker.runOnce.bind(worker);
    await expect(original()).resolves.toEqual({ examined: 0, sent: 0, failed: 0, deduplicated: 0 });
    expect(database.prepare("SELECT state FROM notification_deliveries").get()).toEqual({ state: "pending" });
  });

  it("fails one claimed effect without retrying it in the same or later pass", async () => {
    const { database, outbox } = fixture();
    let calls = 0;
    const worker = new NativeNotificationWorker({
      outbox,
      adapter: {
        discover: async () => ({ state: "available", contract: { schemaVersion: 1 } }),
        send: async () => {
          calls += 1;
          throw new Error("notification centre unavailable");
        },
      },
      workerInstanceId: "notification-worker-01",
      integrationId: "native-desktop",
      clock: () => 1_000,
    });

    await expect(worker.runOnce()).resolves.toEqual({ examined: 1, sent: 0, failed: 1, deduplicated: 0 });
    await worker.runOnce();
    expect(calls).toBe(1);
    expect(database.prepare("SELECT state FROM notification_deliveries").get()).toEqual({ state: "failed" });
  });

  it("expires a claim that becomes overdue after restart on the next worker pass exactly once", async () => {
    const database = openSpec05Database();
    databases.push(database);
    let now = 1_000;
    const original = new NotificationOutbox({ database, clock: () => now });
    const item = original.upsertAttention(producer, {
      dedupeKey: "attention:restart-overdue",
      kind: "consequential-gate",
      severity: "critical-path",
      payload: { title: "Release gate", summary: "Review evidence", gateId: "gate_release" },
    });
    const delivery = original.enqueue(producer, {
      itemId: item.itemId,
      expectedItemRevision: item.revision,
      targetIntegration: "native-desktop",
    });
    original.setIntegrationAvailability({
      workerInstanceId: "notification-worker-before-restart",
      integrationId: "native-desktop",
    }, { state: "available", discoveredContract: { schemaVersion: 1 } });
    original.claim({
      workerInstanceId: "notification-worker-before-restart",
      integrationId: "native-desktop",
    }, {
      notificationId: delivery.notificationId,
      expectedItemRevision: item.revision,
      expectedClaimGeneration: 0,
      claimDeadline: new Date(2_000).toISOString(),
    });

    const restarted = new NotificationOutbox({ database, clock: () => now });
    expect(restarted.recover()).toEqual({ ambiguousClaims: 0 });
    now = 3_000;
    const sent: Array<{ title: string; body: string }> = [];
    const worker = new NativeNotificationWorker({
      outbox: restarted,
      adapter: adapter(sent),
      workerInstanceId: "notification-worker-after-restart",
      integrationId: "native-desktop",
      clock: () => now,
    });

    await expect(worker.runOnce()).resolves.toEqual({ examined: 0, sent: 0, failed: 0, deduplicated: 0 });
    expect(sent).toEqual([]);
    expect(restarted.get(delivery.notificationId)).toMatchObject({ state: "ambiguous", claimGeneration: 1 });
    expect(database.prepare("SELECT state, COUNT(*) AS count FROM notification_attempts GROUP BY state").all())
      .toEqual([{ state: "ambiguous", count: 1 }]);
    await expect(worker.runOnce()).resolves.toEqual({ examined: 0, sent: 0, failed: 0, deduplicated: 0 });
    expect(database.prepare("SELECT state, COUNT(*) AS count FROM notification_attempts GROUP BY state").all())
      .toEqual([{ state: "ambiguous", count: 1 }]);
  });
});

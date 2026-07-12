import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { openFabric } from "../../../src/index.ts";
import { assertFabricReceiptSchema } from "../../../src/exports/schema.ts";
import { ManualClock } from "../../support/manual-clock.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("Stage 1 fabric receipt export", () => {
  it("replays a durable schema-v1 export command after upgrading while new exports remain v2", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-receipt-upgrade-"));
    const databasePath = join(root, "fabric.sqlite3");
    const runDirectory = join(root, ".agent-run", "run-upgrade");
    const capabilityKey = "receipt-upgrade-capability-key";
    await mkdir(runDirectory, { recursive: true });
    let fabric = await openFabric({ databasePath, workspaceRoots: [root], capabilityKey });
    const run = await createCurrentSessionRun({
      databasePath,
      workspaceRoot: root,
      runId: "run-upgrade", projectRunDirectory: runDirectory,
      chair: { agentId: "chair", authority: {
        workspaceRoots: ["."], sourcePaths: ["."], artifactPaths: [".agent-run"],
        actions: ["read", "write", "delegate", "message"], disclosure: ["local"],
        expiresAt: "2099-01-01T00:00:00.000Z", budget: {},
      } },
    });
    const commandId = "receipt:legacy-replay";
    const emitted = await fabric.connect(run.chairCapability).exportReceipt({ commandId });
    await fabric.close();
    const database = new Database(databasePath);
    try {
      const stored = database.prepare("SELECT result_json FROM commands WHERE run_id=? AND actor_agent_id=? AND command_id=?")
        .get("run-upgrade", "chair", commandId) as { result_json: string };
      const result = JSON.parse(stored.result_json) as Record<string, unknown>;
      database.prepare("UPDATE commands SET result_json=? WHERE run_id=? AND actor_agent_id=? AND command_id=?")
        .run(JSON.stringify({ ...result, schemaVersion: 1 }), "run-upgrade", "chair", commandId);
    } finally { database.close(); }
    fabric = await openFabric({ databasePath, workspaceRoots: [root], capabilityKey });
    cleanup.push(async () => { await fabric.close(); await rm(root, { recursive: true, force: true }); });
    await expect(fabric.connect(run.chairCapability).exportReceipt({ commandId })).resolves.toEqual({ ...emitted, schemaVersion: 1 });
    await expect(fabric.connect(run.chairCapability).exportReceipt({ commandId: "receipt:new-v2" })).resolves.toMatchObject({ schemaVersion: 2 });
  });

  it("writes the standard relative path and returns the SHA-256 of the exact exported bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-receipt-"));
    const runDirectory = join(root, ".agent-run", "run-receipt");
    await mkdir(runDirectory, { recursive: true });
    const clock = new ManualClock();
    const databasePath = join(root, "fabric.sqlite3");
    const fabric = await openFabric({
      databasePath,
      workspaceRoots: [root],
      clock: clock.now,
    });
    cleanup.push(async () => {
      await fabric.close();
      await rm(root, { recursive: true, force: true });
    });
    const run = await createCurrentSessionRun({
      databasePath,
      workspaceRoot: root,
      runId: "run-receipt",
      projectRunDirectory: runDirectory,
      chair: {
        agentId: "chair",
        authority: {
          workspaceRoots: ["."],
          sourcePaths: ["."],
          artifactPaths: [".agent-run/run-receipt"],
          actions: ["read", "write", "delegate", "message"],
          disclosure: ["local"],
          expiresAt: "2099-01-01T00:00:00.000Z",
          budget: { turns: 10, "cost:USD": 5 },
        },
      },
    });
    const chair = fabric.connect(run.chairCapability);

    const exported = await chair.exportReceipt({ commandId: "receipt:export:1" });
    expect(exported).toMatchObject({ schemaVersion: 2 });
    expect(exported.relativePath).toBe(`fabric-receipt-${exported.sha256}.json`);
    const bytes = await readFile(join(runDirectory, exported.relativePath));
    expect(exported.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    const receipt: unknown = JSON.parse(bytes.toString("utf8"));
    expect(receipt).toMatchObject({
      schemaVersion: 2,
      runId: "run-receipt",
      chair: { agentId: "chair", adapterId: null },
      taskOwners: [],
      executionProfile: "headless",
      directInputProvenance: "unavailable",
      modelRoutingReceipts: [],
      taskAndWriteLeases: [],
      messageAndDeliveryCounts: {
        messages: 0,
        deliveries: { ready: 0, claimed: 0, acknowledged: 0, abandoned: 0, expired: 0 },
      },
      objectiveChecks: [],
      crossFamilyReviews: [],
      providerFailuresAndSubstitutions: [],
      operatorInterventions: [],
      compactionsAndRotations: [],
      eventWatermark: expect.objectContaining({ eventId: expect.any(String) }),
      stateHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(JSON.stringify(receipt)).not.toContain("provider_session_ref");
    if (typeof receipt !== "object" || receipt === null || Array.isArray(receipt)) throw new Error("receipt fixture is invalid");
    expect(() => assertFabricReceiptSchema({ ...receipt, stateHash: "0".repeat(64) })).toThrow(/state hash/u);

    const repeated = await chair.exportReceipt({ commandId: "receipt:export:repeat" });
    expect(repeated).toEqual(exported);
    expect(await readFile(join(runDirectory, repeated.relativePath))).toEqual(bytes);

    await chair.recordOperatorIntervention({ source: "fabric", directInputProvenance: "complete", taskRevision: 1, summary: "force a second observed receipt", commandId: "receipt:intervention" });
    const second = await chair.exportReceipt({ commandId: "receipt:export:2" });
    expect(second.sha256).not.toBe(exported.sha256);
    expect(await readFile(join(runDirectory, exported.relativePath))).toEqual(bytes);
    expect(await chair.exportReceipt({ commandId: "receipt:export:1" })).toEqual(exported);
  });

  it("projects task owners, explicit delivery states and a deterministic event watermark", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-receipt-state-"));
    const runDirectory = join(root, ".agent-run", "run-receipt-state");
    await mkdir(runDirectory, { recursive: true });
    const clock = new ManualClock();
    const databasePath = join(root, "fabric.sqlite3");
    const fabric = await openFabric({ databasePath, workspaceRoots: [root], clock: clock.now });
    cleanup.push(async () => {
      await fabric.close();
      await rm(root, { recursive: true, force: true });
    });
    const authority = {
      workspaceRoots: ["."], sourcePaths: ["."], artifactPaths: [".agent-run/run-receipt-state"],
      actions: ["read", "write", "delegate", "message"], disclosure: ["local"],
      expiresAt: "2099-01-01T00:00:00.000Z", budget: { turns: 20, "cost:USD": 10 },
    };
    const run = await createCurrentSessionRun({
      databasePath,
      workspaceRoot: root,
      runId: "run-receipt-state", projectRunDirectory: runDirectory,
      chair: { agentId: "chair", authority },
    });
    const chair = fabric.connect(run.chairCapability);
    const delegated = await chair.delegateAuthority({
      parentAuthorityId: run.chairAuthorityId,
      authority: { ...authority, actions: ["read", "write", "message"], budget: { turns: 5, "cost:USD": 2 } },
    });
    const registration = await chair.registerAgent({ agentId: "alice", authorityId: delegated.authorityId });
    const alice = fabric.connect(registration.capability);
    await chair.createDiscussionGroup({
      groupId: "receipt-state", memberAgentIds: ["chair", "alice"], commandId: "receipt:group:create",
    });

    const task = await chair.createTask({
      taskId: "owned-task", authorityId: run.chairAuthorityId, eligibleAgentIds: ["alice"],
      objective: "own one task", baseRevision: "rev-1", commandId: "receipt:task:create",
    });
    await alice.claimTask({ taskId: task.taskId, expectedRevision: task.revision, commandId: "receipt:task:claim" });

    await chair.sendMessage({
      audience: { kind: "agents", agentIds: ["alice"] }, kind: "request", body: "expire",
      requiresAck: true, dedupeKey: "receipt:expired", expiresAt: new Date(clock.now().getTime() + 1_000).toISOString(),
    });
    clock.advance(1_001);
    expect(await alice.receiveMessages({ limit: 1, visibilityTimeoutMs: 10_000 })).toEqual([]);

    await chair.sendMessage({ audience: { kind: "agents", agentIds: ["alice"] }, kind: "request", body: "ack", requiresAck: true, dedupeKey: "receipt:ack" });
    const acknowledged = (await alice.receiveMessages({ limit: 1, visibilityTimeoutMs: 10_000 }))[0];
    if (acknowledged === undefined) throw new Error("missing acknowledged fixture delivery");
    await alice.acknowledgeDelivery({ deliveryId: acknowledged.deliveryId });

    await chair.sendMessage({ audience: { kind: "agents", agentIds: ["alice"] }, kind: "request", body: "abandon", requiresAck: true, dedupeKey: "receipt:abandon" });
    const abandoned = (await alice.receiveMessages({ limit: 1, visibilityTimeoutMs: 10_000 }))[0];
    if (abandoned === undefined) throw new Error("missing abandoned fixture delivery");
    await chair.abandonDelivery({ deliveryId: abandoned.deliveryId, reason: "fixture", commandId: "receipt:delivery:abandon" });

    await chair.sendMessage({ audience: { kind: "agents", agentIds: ["alice"] }, kind: "request", body: "claimed", requiresAck: true, dedupeKey: "receipt:claimed" });
    expect(await alice.receiveMessages({ limit: 1, visibilityTimeoutMs: 10_000 })).toHaveLength(1);
    await chair.sendMessage({ audience: { kind: "agents", agentIds: ["alice"] }, kind: "request", body: "ready", requiresAck: true, dedupeKey: "receipt:ready" });

    const exported = await chair.exportReceipt({ commandId: "receipt:state:export" });
    const receipt = JSON.parse(await readFile(join(runDirectory, exported.relativePath), "utf8")) as Record<string, unknown>;
    expect(receipt).toMatchObject({
      taskOwners: [{ taskId: "owned-task", ownerAgentId: "alice", state: "active" }],
      messageAndDeliveryCounts: {
        messages: 5,
        deliveries: { ready: 1, claimed: 1, acknowledged: 1, abandoned: 1, expired: 1 },
      },
      eventWatermark: { eventId: expect.any(String), createdAt: expect.any(String) },
    });
    expect(receipt).not.toHaveProperty("stageOwners");
    expect(receipt).not.toHaveProperty("observedAt");
  });

  it("continues to validate historical schema-v1 receipts read-only", () => {
    expect(() => assertFabricReceiptSchema({
      schemaVersion: 1,
      runId: "historical-run",
      chair: { agentId: "chair", adapterId: null },
      observedAt: "2026-07-11T00:00:00.000Z",
      stageOwners: [], agents: [], executionProfile: "headless", directInputProvenance: "unavailable",
      modelRoutingReceipts: [], taskAndWriteLeases: [],
      messagesSentReceivedAbandoned: { sent: 0, delivered: 0, acknowledged: 0, abandoned: 0, expired: 0 },
      objectiveChecks: [], crossFamilyReviews: [], providerFailuresAndSubstitutions: [], operatorInterventions: [],
      compactionsAndRotations: [], counts: { agents: 0, tasks: 0, messages: 0, deliveries: 0, leases: 0, events: 0 },
    })).not.toThrow();
  });
});

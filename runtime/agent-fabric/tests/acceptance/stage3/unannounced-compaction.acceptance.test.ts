import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLifecycleFixture as createLifecycleFixtureBase,
  writeLifecycleCheckpoint,
  type LifecycleFixture,
} from "../../support/lifecycle-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

async function createLifecycleFixture(
  options: Parameters<typeof createLifecycleFixtureBase>[0] = {},
): ReturnType<typeof createLifecycleFixtureBase> {
  return await createLifecycleFixtureBase({ ...options, retainedAgents: true });
}

function providerObservation(
  fixture: { providerSessionMarker: string },
  sourceEventId: string,
  generation: number,
): { sourceEventId: string; providerSessionRef: string; evidenceDigest: `sha256:${string}` } {
  return {
    sourceEventId,
    providerSessionRef: generation === 1 ? fixture.providerSessionMarker : `${fixture.providerSessionMarker}:g${generation}`,
    evidenceDigest: `sha256:${createHash("sha256").update(sourceEventId).digest("hex")}`,
  };
}

function activeGenerationLoss(fixture: LifecycleFixture): Record<string, unknown> {
  const database = new Database(fixture.databasePath, { readonly: true });
  try {
    return database.prepare(`
      SELECT loss.loss_kind,loss.old_provider_generation,loss.new_provider_generation,
             loss.old_context_revision,loss.new_context_revision,loss.checkpoint_state,
             head.state,head.current_revision,head.terminal
        FROM lifecycle_generation_losses loss
        JOIN lifecycle_generation_loss_heads head
          ON head.run_id=loss.run_id AND head.agent_id=loss.agent_id
         AND head.generation_loss_id=loss.generation_loss_id
       WHERE loss.run_id=? AND loss.agent_id='leader'
    `).get(fixture.runId) as Record<string, unknown>;
  } finally {
    database.close();
  }
}

async function observeBaseline(fixture: LifecycleFixture, prefix: string): Promise<void> {
  await expect(fixture.chair.reportProviderState({
    ...providerObservation(fixture, `${prefix}:g1`, 1),
    agentId: "leader",
    providerSessionGeneration: 1,
    contextRevision: 0,
    commandId: `${prefix}:g1`,
  })).resolves.toMatchObject({
    agentId: "leader",
    lifecycle: "ready",
    providerSessionGeneration: 1,
    contextRevision: 0,
  });
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("AC-009 Stage 3 unannounced provider compaction", () => {
  it("leaves ready messages unclaimed while an independent delivery freeze is active", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["leader"] },
      kind: "request",
      body: "must remain ready until the freeze is cleared",
      requiresAck: true,
      dedupeKey: "delivery-freeze:ready-message",
      context: { kind: "task", taskId: fixture.leaderTask.taskId },
    });
    const database = new Database(fixture.databasePath);
    database.prepare(`
      INSERT INTO delivery_freezes(run_id,agent_id,reason,created_at)
      VALUES (?, 'leader', 'operator-pause:independent', ?)
    `).run(fixture.runId, fixture.clock.now().getTime());
    database.close();

    await expect(fixture.leader.receiveMessages({ limit: 1, visibilityTimeoutMs: 30_000 }))
      .rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
    const proof = new Database(fixture.databasePath, { readonly: true });
    expect(proof.prepare(`
      SELECT delivery.state,delivery.attempt_count
        FROM deliveries delivery JOIN messages message USING(message_id)
       WHERE delivery.run_id=? AND delivery.recipient_id='leader'
         AND message.dedupe_key='delivery-freeze:ready-message'
    `).get(fixture.runId)).toEqual({ state: "ready", attempt_count: 0 });
    proof.close();
  });

  it("records an explicit context loss for the first revision advance", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await observeBaseline(fixture, "compaction:context");

    await expect(fixture.chair.reportProviderState({
      ...providerObservation(fixture, "compaction:context:g1:r1", 1),
      agentId: "leader",
      providerSessionGeneration: 1,
      contextRevision: 1,
      commandId: "compaction:context:g1:r1",
    })).resolves.toMatchObject({
      agentId: "leader",
      lifecycle: "suspended",
      providerSessionGeneration: 1,
      contextRevision: 1,
    });
    expect(activeGenerationLoss(fixture)).toMatchObject({
      loss_kind: "context-advance",
      old_provider_generation: 1,
      new_provider_generation: 1,
      old_context_revision: 0,
      new_context_revision: 1,
      state: "open",
      current_revision: 1,
      terminal: 0,
    });
  });

  it("records generation loss and does not trust an arbitrary checkpoint digest", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await observeBaseline(fixture, "compaction:forged");

    await expect(fixture.chair.reportProviderState({
      ...providerObservation(fixture, "compaction:forged:g2", 2),
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: 2,
      checkpointSha256: "a".repeat(64),
      commandId: "compaction:forged:g2",
    })).resolves.toMatchObject({
      agentId: "leader",
      lifecycle: "suspended",
      providerSessionGeneration: 2,
    });
    expect(activeGenerationLoss(fixture)).toMatchObject({
      loss_kind: "generation-advance",
      old_provider_generation: 1,
      new_provider_generation: 2,
      old_context_revision: 0,
      new_context_revision: 2,
      checkpoint_state: "invalid",
      state: "open",
      terminal: 0,
    });
  });

  it("does not treat a validated current checkpoint as implicit generation-loss recovery", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await observeBaseline(fixture, "compaction:checkpoint");
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "await explicit recovery authority",
    });
    await fixture.leader.requestLifecycle({
      action: "completion-ready",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "compaction:checkpoint:completion-ready",
    });

    await expect(fixture.chair.reportProviderState({
      ...providerObservation(fixture, "compaction:checkpoint:g2", 2),
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: 1,
      checkpointSha256: checkpoint.sha256,
      commandId: "compaction:checkpoint:g2",
    })).resolves.toMatchObject({ lifecycle: "suspended", providerSessionGeneration: 2 });
    expect(activeGenerationLoss(fixture)).toMatchObject({
      loss_kind: "generation-advance",
      checkpoint_state: "last-validated",
      state: "open",
      terminal: 0,
    });
  });

  it("fences retained custody and quarantines writes after generation loss", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await observeBaseline(fixture, "compaction:custody");
    const lease = await fixture.leader.acquireWriteLease({
      scope: ["leader"],
      ttlMs: 60_000,
      commandId: "compaction:custody:lease",
    });
    await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["leader"] },
      kind: "request",
      body: "deliver only after explicit context recovery",
      requiresAck: true,
      dedupeKey: "compaction:custody:message",
      context: { kind: "task", taskId: fixture.leaderTask.taskId },
    });

    await fixture.chair.reportProviderState({
      ...providerObservation(fixture, "compaction:custody:g2", 2),
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: 1,
      commandId: "compaction:custody:g2",
    });

    await expect(fixture.chair.getWriteLease({ leaseId: lease.leaseId })).resolves.toMatchObject({
      status: "quarantined",
    });
    await expect(fixture.leader.receiveMessages({ limit: 1, visibilityTimeoutMs: 30_000 }))
      .rejects.toMatchObject({ code: "STALE_LEASE_GENERATION" });
    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "compaction-custody-turn",
      operation: "send_turn",
      payload: {
        agentId: "leader",
        providerSessionGeneration: 1,
        taskId: fixture.leaderTask.taskId,
        scenario: "terminal",
      },
      commandId: "compaction:custody:turn",
    })).rejects.toMatchObject({ code: "STALE_LEASE_GENERATION" });
  });

  it("publishes accepted-suspended rotation custody, not synchronous ready", async () => {
    const fixture = await createLifecycleFixture({ spawnDelayMs: 100 });
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "continue only after externally verified terminal apply",
    });
    await expect(fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "rotation:accepted-suspended",
    })).resolves.toMatchObject({
      schemaVersion: 1,
      kind: "accepted-suspended",
      action: "rotate",
      agentId: "leader",
      lifecycle: "suspended",
      sourceProviderGeneration: 1,
      targetProviderGeneration: 2,
    });

    await vi.waitFor(() => {
      const database = new Database(fixture.databasePath, { readonly: true });
      try {
        expect(database.prepare(`
          SELECT agent.lifecycle,head.state,head.disposition_code,head.terminal
            FROM agents agent
            JOIN lifecycle_rotation_custody_heads head
              ON head.run_id=agent.run_id AND head.agent_id=agent.agent_id
           WHERE agent.run_id=? AND agent.agent_id='leader'
        `).get(fixture.runId)).toMatchObject({
          lifecycle: "suspended",
          state: "committing",
          disposition_code: "none",
          terminal: 0,
        });
      } finally {
        database.close();
      }
    });
  });
});

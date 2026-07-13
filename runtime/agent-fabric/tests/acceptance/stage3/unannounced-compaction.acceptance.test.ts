import { access, readFile, rm } from "node:fs/promises";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLifecycleFixture, writeLifecycleCheckpoint } from "../../support/lifecycle-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("AC-009 Stage 3 unannounced provider compaction", () => {
  it("leaves ready messages unclaimed while delivery is frozen", async () => {
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
      .rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });
    const proof = new Database(fixture.databasePath, { readonly: true });
    expect(proof.prepare(`
      SELECT delivery.state,delivery.attempt_count
        FROM deliveries delivery JOIN messages message USING(message_id)
       WHERE delivery.run_id=? AND delivery.recipient_id='leader'
         AND message.dedupe_key='delivery-freeze:ready-message'
    `).get(fixture.runId)).toEqual({ state: "ready", attempt_count: 0 });
    proof.close();
  });

  it("settles policy-expired required delivery before enforcing a recipient freeze", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["leader"] },
      kind: "request",
      body: "expire without becoming claimable",
      requiresAck: true,
      dedupeKey: "delivery-freeze:expired-message",
      expiresAt: new Date(fixture.clock.now().getTime() + 100).toISOString(),
      context: { kind: "task", taskId: fixture.leaderTask.taskId },
    });
    fixture.clock.advance(101);
    const database = new Database(fixture.databasePath);
    database.prepare(`
      INSERT INTO delivery_freezes(run_id,agent_id,reason,created_at)
      VALUES (?, 'leader', 'operator-pause:independent', ?)
    `).run(fixture.runId, fixture.clock.now().getTime());
    database.close();

    await expect(fixture.leader.receiveMessages({ limit: 1, visibilityTimeoutMs: 30_000 }))
      .rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });

    const proof = new Database(fixture.databasePath, { readonly: true });
    expect(proof.prepare(`
      SELECT delivery.state,delivery.attempt_count,delivery.resolution_reason,
             mailbox.contiguous_watermark
        FROM deliveries delivery
        JOIN messages message USING(message_id)
        JOIN mailbox_state mailbox
          ON mailbox.run_id=delivery.run_id AND mailbox.recipient_id=delivery.recipient_id
       WHERE delivery.run_id=? AND delivery.recipient_id='leader'
         AND message.dedupe_key='delivery-freeze:expired-message'
    `).get(fixture.runId)).toEqual({
      state: "expired",
      attempt_count: 0,
      resolution_reason: "message-expired-by-policy",
      contiguous_watermark: 1,
    });
    proof.close();
  });

  it("does not reconcile a changed provider context from an arbitrary checkpoint digest", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 1,
      contextRevision: "context-1",
      commandId: "compaction:forged:observe:g1",
    });

    const changed = await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: "context-2",
      checkpointSha256: "a".repeat(64),
      commandId: "compaction:forged:observe:g2",
    });

    expect(changed).toMatchObject({
      agentId: "leader",
      lifecycle: "context-unreconciled",
      providerSessionGeneration: 2,
    });
  });

  it("does not reconcile from a validated checkpoint after its child state changes", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 1,
      contextRevision: "context-1",
      commandId: "compaction:stale-child:observe:g1",
    });
    const leaderCheckpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "wait for the child",
    });
    await fixture.leader.requestLifecycle({
      action: "completion-ready",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint: leaderCheckpoint,
      commandId: "compaction:stale-child:leader-checkpoint",
    });
    const childTask = await fixture.child.updateTask({
      taskId: fixture.childTask.taskId,
      expectedRevision: fixture.childTask.revision,
      state: "complete",
      commandId: "compaction:stale-child:child-task-complete",
    });
    const childCheckpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "child",
      nextAction: "release",
    });
    await fixture.child.requestLifecycle({
      action: "completion-ready",
      agentId: "child",
      taskId: childTask.taskId,
      taskRevision: childTask.revision,
      checkpoint: childCheckpoint,
      commandId: "compaction:stale-child:child-checkpoint",
    });

    const changed = await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: "context-2",
      checkpointSha256: leaderCheckpoint.sha256,
      commandId: "compaction:stale-child:observe:g2",
    });

    expect(changed).toMatchObject({
      lifecycle: "context-unreconciled",
      providerSessionGeneration: 2,
    });
  });

  it("reconciles only while the checkpoint task revision remains current", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 1,
      contextRevision: "context-1",
      commandId: "compaction:task-revision:observe:g1",
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "continue from the current task revision",
    });
    await fixture.leader.requestLifecycle({
      action: "completion-ready",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "compaction:task-revision:checkpoint",
    });

    await expect(fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: "context-2",
      checkpointSha256: checkpoint.sha256,
      commandId: "compaction:task-revision:observe:g2",
    })).resolves.toMatchObject({
      lifecycle: "completion-ready",
      providerSessionGeneration: 2,
    });

    await fixture.leader.updateTask({
      taskId: fixture.leaderTask.taskId,
      expectedRevision: fixture.leaderTask.revision,
      state: "complete",
      commandId: "compaction:task-revision:task-complete",
    });
    await expect(fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 3,
      contextRevision: "context-3",
      checkpointSha256: checkpoint.sha256,
      commandId: "compaction:task-revision:observe:g3",
    })).resolves.toMatchObject({
      lifecycle: "context-unreconciled",
      providerSessionGeneration: 3,
    });
  });

  it("fences delivery, provider turns and retained write custody after an unannounced change", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 1,
      contextRevision: "context-1",
      commandId: "compaction:custody:observe:g1",
    });
    const lease = await fixture.leader.acquireWriteLease({
      scope: ["src/leader"],
      ttlMs: 60_000,
      commandId: "compaction:custody:lease",
    });
    await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["leader"] },
      kind: "request",
      body: "deliver only after context recovery",
      requiresAck: true,
      dedupeKey: "compaction:custody:message",
      context: { kind: "task", taskId: fixture.leaderTask.taskId },
    });

    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: "context-2-unannounced",
      commandId: "compaction:custody:observe:g2",
    });

    await expect(fixture.leader.getWriteLease({ leaseId: lease.leaseId })).resolves.toMatchObject({
      status: "quarantined",
    });
    await expect(fixture.leader.receiveMessages({ limit: 1, visibilityTimeoutMs: 30_000 }))
      .rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });
    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "compaction-custody-turn",
      operation: "send_turn",
      payload: { taskId: fixture.leaderTask.taskId, scenario: "terminal" },
      commandId: "compaction:custody:turn",
    })).rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });
    await expect(fixture.chair.closeBarrier({
      scope: "stage",
      stageId: "compaction-custody",
      commandId: "compaction:custody:barrier",
    })).rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });
  });

  it("admits only explicit rotation as lifecycle recovery from an unreconciled context", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 1,
      contextRevision: "context-1",
      commandId: "compaction:recovery-only:observe:g1",
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: "context-2-unannounced",
      commandId: "compaction:recovery-only:observe:g2",
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "rotate through the verified recovery path",
    });

    await expect(fixture.leader.requestLifecycle({
      action: "completion-ready",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "compaction:recovery-only:completion-ready",
    })).rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });
  });

  it("fences an unreconciled context from writes and barriers, then rotates through a verified checkpoint", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 1,
      contextRevision: "context-1",
      commandId: "compaction:observe:g1",
    });
    const unreconciled = await fixture.chair.reportProviderState({
      agentId: "leader",
      providerSessionGeneration: 2,
      contextRevision: "context-2-unannounced",
      commandId: "compaction:observe:g2",
    });
    expect(unreconciled).toMatchObject({ agentId: "leader", lifecycle: "context-unreconciled" });

    await expect(
      fixture.leader.acquireWriteLease({
        scope: ["src/leader"],
        ttlMs: 60_000,
        commandId: "compaction:write:blocked",
      }),
    ).rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });

    await expect(
      fixture.chair.closeBarrier({ scope: "stage", stageId: "compaction", commandId: "compaction:barrier:blocked" }),
    ).rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });

    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "rotate into a fresh managed session",
    });
    const rotated = await fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "compaction:rotate:verified",
    });

    expect(rotated).toMatchObject({
      agentId: "leader",
      lifecycle: "ready",
      providerSessionGeneration: 3,
      rotation: {
        kind: "replacement-session",
        priorResumeReference: fixture.providerSessionMarker,
      },
    });
    await expect(access(fixture.providerSessionMarker)).resolves.toBeUndefined();
  });

  it("fences delivery and provider turns before I/O and refuses stale post-effect finalization", async () => {
    const fixture = await createLifecycleFixture({ spawnDelayMs: 250 });
    let rotation: Promise<unknown> | undefined;
    cleanup.push(async () => {
      if (rotation !== undefined) await Promise.allSettled([rotation]);
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["leader"] },
      kind: "request",
      body: "message present before rotation",
      requiresAck: true,
      dedupeKey: "rotation:fence:before",
      context: { kind: "task", taskId: fixture.leaderTask.taskId },
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "resume only if custody is unchanged",
    });
    rotation = fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "rotation:fence:request",
    });

    await vi.waitFor(() => {
      const database = new Database(fixture.databasePath, { readonly: true });
      const row = database.prepare(`
        SELECT status FROM provider_actions WHERE run_id=? AND action_id=?
      `).get(fixture.runId, "rotation:fence:request:spawn");
      database.close();
      expect(row).toBeDefined();
    });
    await expect(fixture.chair.getAgentLifecycle({ agentId: "leader" })).resolves.toMatchObject({
      lifecycle: "suspended",
    });
    await expect(fixture.leader.receiveMessages({ limit: 1, visibilityTimeoutMs: 30_000 }))
      .rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });
    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "rotation-fence-concurrent-turn",
      operation: "send_turn",
      payload: { taskId: fixture.leaderTask.taskId, scenario: "terminal" },
      commandId: "rotation:fence:turn",
    })).rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });

    await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["leader"] },
      kind: "request",
      body: "mailbox changed while the provider effect was in flight",
      requiresAck: true,
      dedupeKey: "rotation:fence:during",
      context: { kind: "task", taskId: fixture.leaderTask.taskId },
    });
    await expect(rotation).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
    await expect(fixture.chair.getAgentLifecycle({ agentId: "leader" })).resolves.toMatchObject({
      lifecycle: "context-unreconciled",
    });
  });

  it("supersedes a stale terminal replacement before a fresh checkpoint starts one distinct action", async () => {
    const fixture = await createLifecycleFixture({ spawnDelayMs: 150 });
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const firstCheckpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "resume only after refreshing mailbox custody",
    });
    const first = fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint: firstCheckpoint,
      commandId: "rotation:posteffect:first",
    });
    await vi.waitFor(() => {
      const database = new Database(fixture.databasePath, { readonly: true });
      const row = database.prepare(`
        SELECT state FROM lifecycle_rotation_custody
         WHERE run_id=? AND agent_id='leader' AND command_id='rotation:posteffect:first'
      `).get(fixture.runId);
      database.close();
      expect(row).toBeDefined();
    });
    await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["leader"] },
      kind: "request",
      body: "mailbox mutation after provider dispatch",
      requiresAck: true,
      dedupeKey: "rotation:posteffect:mailbox-race",
      context: { kind: "task", taskId: fixture.leaderTask.taskId },
    });
    await expect(first).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });

    const freshCheckpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "supersede the stale successor and acknowledge this fresh checkpoint",
    });
    await expect(fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint: freshCheckpoint,
      commandId: "rotation:posteffect:adopt",
    })).resolves.toMatchObject({
      lifecycle: "ready",
      providerSessionGeneration: 2,
      rotation: { kind: "replacement-session" },
    });

    const providerJournal = JSON.parse(await readFile(fixture.providerJournalPath, "utf8")) as {
      actions: Record<string, { executionCount: number; effectCount: number }>;
    };
    expect(Object.keys(providerJournal.actions).sort()).toEqual([
      "rotation:posteffect:adopt:spawn",
      "rotation:posteffect:first:spawn",
    ]);
    expect(providerJournal.actions["rotation:posteffect:first:spawn"]).toMatchObject({
      executionCount: 1,
      effectCount: 1,
    });
    expect(providerJournal.actions["rotation:posteffect:adopt:spawn"]).toMatchObject({
      executionCount: 1,
      effectCount: 1,
    });
    const database = new Database(fixture.databasePath, { readonly: true });
    expect(database.prepare(`
      SELECT state,history_json,resolution_json
        FROM lifecycle_rotation_custody
       WHERE run_id=? AND agent_id='leader' AND command_id='rotation:posteffect:first'
    `).get(fixture.runId)).toEqual({
      state: "superseded",
      history_json: '["prepared","provider-terminal","unreconciled","fresh-checkpoint-superseded","superseded"]',
      resolution_json: expect.stringContaining("rotation:posteffect:adopt"),
    });
    expect(database.prepare(`
      SELECT state,replacement_resume_reference
        FROM lifecycle_rotation_custody
       WHERE run_id=? AND agent_id='leader' AND command_id='rotation:posteffect:adopt'
    `).get(fixture.runId)).toMatchObject({
      state: "finalized",
      replacement_resume_reference: expect.stringContaining(":replacement:g2"),
    });
    database.close();
  });

  it.each(["task", "mailbox", "children", "provider", "write-custody"] as const)(
    "does not publish ready when %s state changes after lifecycle prepare",
    async (changedState) => {
      const fixture = await createLifecycleFixture({ spawnDelayMs: 150 });
      cleanup.push(async () => {
        await fixture.fabric.close();
        await rm(fixture.directory, { recursive: true, force: true });
      });
      const lease = changedState === "write-custody"
        ? await fixture.leader.acquireWriteLease({
            scope: ["src/leader"],
            ttlMs: 60_000,
            commandId: "rotation:state-race:lease",
          })
        : undefined;
      const checkpoint = await writeLifecycleCheckpoint(fixture, {
        agentId: "leader",
        inFlightChildren: ["child"],
        openWork: ["leader-task"],
        nextAction: `resume after checking ${changedState}`,
      });
      const commandId = `rotation:state-race:${changedState}`;
      const rotation = fixture.leader.requestLifecycle({
        action: "rotate",
        agentId: "leader",
        taskId: fixture.leaderTask.taskId,
        taskRevision: fixture.leaderTask.revision,
        checkpoint,
        commandId,
      });

      await vi.waitFor(() => {
        const database = new Database(fixture.databasePath, { readonly: true });
        const row = database.prepare(`
          SELECT state FROM lifecycle_rotation_custody
           WHERE run_id=? AND agent_id=? AND command_id=?
        `).get(fixture.runId, "leader", commandId);
        database.close();
        expect(row).toBeDefined();
      });
      if (changedState === "mailbox") {
        await fixture.chair.sendMessage({
          audience: { kind: "agents", agentIds: ["leader"] },
          kind: "request",
          body: "concurrent mailbox mutation",
          requiresAck: true,
          dedupeKey: commandId,
          context: { kind: "task", taskId: fixture.leaderTask.taskId },
        });
      } else {
        const database = new Database(fixture.databasePath);
        if (changedState === "task") {
          database.prepare(`
            UPDATE tasks SET revision=revision+1 WHERE run_id=? AND task_id=?
          `).run(fixture.runId, fixture.leaderTask.taskId);
        } else if (changedState === "children") {
          database.prepare(`
            UPDATE agents SET lifecycle='completion-ready' WHERE run_id=? AND agent_id='child'
          `).run(fixture.runId);
        } else if (changedState === "provider") {
          database.prepare(`
            INSERT INTO provider_state(
              run_id,agent_id,provider_session_generation,context_revision,reconciled_checkpoint_sha256
            ) VALUES (?, 'leader', 2, 'concurrent-provider-context', NULL)
            ON CONFLICT(run_id,agent_id) DO UPDATE SET
              provider_session_generation=excluded.provider_session_generation,
              context_revision=excluded.context_revision
          `).run(fixture.runId);
        } else {
          database.prepare(`
            UPDATE leases SET status='quarantined',updated_at=updated_at+1 WHERE lease_id=?
          `).run(lease?.leaseId);
        }
        database.close();
      }

      await expect(rotation).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
      await expect(fixture.chair.getAgentLifecycle({ agentId: "leader" })).resolves.toMatchObject({
        lifecycle: "context-unreconciled",
        providerSessionGeneration: changedState === "provider" ? 2 : 1,
      });
    },
  );

  it("does not remove a freeze that changed owner while the provider effect was in flight", async () => {
    const fixture = await createLifecycleFixture({ spawnDelayMs: 150 });
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "retain any independently owned freeze",
    });
    const commandId = "rotation:freeze-owner-race";
    const rotation = fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId,
    });
    await vi.waitFor(() => expect(fixture.chair.getAgentLifecycle({ agentId: "leader" }))
      .resolves.toMatchObject({ lifecycle: "suspended" }));
    const database = new Database(fixture.databasePath);
    database.prepare(`
      UPDATE delivery_freezes SET reason='operator-pause:independent'
       WHERE run_id=? AND agent_id='leader'
    `).run(fixture.runId);
    database.close();

    await expect(rotation).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
    const proof = new Database(fixture.databasePath, { readonly: true });
    expect(proof.prepare(`
      SELECT reason FROM delivery_freezes WHERE run_id=? AND agent_id='leader'
    `).get(fixture.runId)).toEqual({ reason: "operator-pause:independent" });
    proof.close();
  });

  it("transfers the exact interactive visibility freeze into successful rotation custody", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "recover the exact interactive provider loss",
    });
    await fixture.chair.recordVisibilityFailure({
      kind: "interactive-tui",
      agentId: "leader",
      commandId: "rotation:interactive-visibility-loss",
    });

    await expect(fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "rotation:foreign-interactive-freeze",
    })).resolves.toMatchObject({
      lifecycle: "ready",
      providerSessionGeneration: 2,
      rotation: { kind: "replacement-session" },
    });
    const proof = new Database(fixture.databasePath, { readonly: true });
    expect(proof.prepare(`
      SELECT COUNT(*) AS count FROM delivery_freezes WHERE run_id=? AND agent_id='leader'
    `).get(fixture.runId)).toEqual({ count: 0 });
    expect(proof.prepare(`
      SELECT lifecycle,provider_session_ref FROM agents WHERE run_id=? AND agent_id='leader'
    `).get(fixture.runId)).toMatchObject({
      lifecycle: "ready",
      provider_session_ref: expect.stringContaining(":replacement:g2"),
    });
    expect(proof.prepare(`
      SELECT state FROM lifecycle_rotation_custody
       WHERE run_id=? AND agent_id='leader' AND command_id='rotation:foreign-interactive-freeze'
    `).get(fixture.runId)).toEqual({ state: "finalized" });
    proof.close();
  });

  it.each(["completion-ready", "suspended"] as const)(
    "rejects a new lifecycle rotation from %s without existing rotation custody",
    async (sourceLifecycle) => {
      const fixture = await createLifecycleFixture();
      cleanup.push(async () => {
        await fixture.fabric.close();
        await rm(fixture.directory, { recursive: true, force: true });
      });
      const checkpoint = await writeLifecycleCheckpoint(fixture, {
        agentId: "leader",
        inFlightChildren: ["child"],
        openWork: ["leader-task"],
        nextAction: "do not widen lifecycle source states",
      });
      const database = new Database(fixture.databasePath);
      database.prepare(`
        UPDATE agents SET lifecycle=? WHERE run_id=? AND agent_id='leader'
      `).run(sourceLifecycle, fixture.runId);
      database.close();

      await expect(fixture.leader.requestLifecycle({
        action: "rotate",
        agentId: "leader",
        taskId: fixture.leaderTask.taskId,
        taskRevision: fixture.leaderTask.revision,
        checkpoint,
        commandId: `rotation:source:${sourceLifecycle}`,
      })).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
      const proof = new Database(fixture.databasePath, { readonly: true });
      expect(proof.prepare(`
        SELECT lifecycle,provider_session_ref FROM agents WHERE run_id=? AND agent_id='leader'
      `).get(fixture.runId)).toEqual({
        lifecycle: sourceLifecycle,
        provider_session_ref: fixture.providerSessionMarker,
      });
      expect(proof.prepare(`
        SELECT COUNT(*) AS count FROM lifecycle_rotation_custody WHERE run_id=?
      `).get(fixture.runId)).toEqual({ count: 0 });
      proof.close();
    },
  );

  it("preserves an operator-owned freeze on a suspended agent", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "wait for explicit operator resume",
    });
    const database = new Database(fixture.databasePath);
    database.transaction(() => {
      database.prepare(`
        UPDATE agents SET lifecycle='suspended' WHERE run_id=? AND agent_id='leader'
      `).run(fixture.runId);
      database.prepare(`
        INSERT INTO delivery_freezes(run_id,agent_id,reason,created_at)
        VALUES (?, 'leader', 'operator-pause:independent', ?)
      `).run(fixture.runId, fixture.clock.now().getTime());
    })();
    database.close();

    await expect(fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "rotation:operator-freeze",
    })).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
    const proof = new Database(fixture.databasePath, { readonly: true });
    expect(proof.prepare(`
      SELECT reason FROM delivery_freezes WHERE run_id=? AND agent_id='leader'
    `).get(fixture.runId)).toEqual({ reason: "operator-pause:independent" });
    expect(proof.prepare(`
      SELECT COUNT(*) AS count FROM provider_actions WHERE run_id=?
    `).get(fixture.runId)).toEqual({ count: 0 });
    proof.close();
  });
});

import { readFile, rm } from "node:fs/promises";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLifecycleFixture,
  reopenLifecycleFabric,
  writeLifecycleCheckpoint,
} from "../../support/lifecycle-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("FR-013 Stage 3 checkpointed lifecycle requests", () => {
  it("rejects a self-consistent checkpoint that omits current children and open work", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: [],
      openWork: [],
      nextAction: "continue without the omitted work",
    });

    await expect(fixture.leader.requestLifecycle({
      action: "completion-ready",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:completion-ready:false-current-state",
    })).rejects.toMatchObject({ code: "CHECKPOINT_INCOMPLETE" });
  });

  it("rejects a self-consistent checkpoint for a different provider session", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "continue in the wrong provider session",
      providerResumeReference: "different-provider-session",
    });

    await expect(fixture.leader.requestLifecycle({
      action: "completion-ready",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:completion-ready:false-provider-state",
    })).rejects.toMatchObject({ code: "CHECKPOINT_INCOMPLETE" });
  });

  it("rejects rotation when the durable checkpoint omits resume-critical fields", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const complete = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "reconcile child before rotation",
    });
    const incomplete: unknown = {
      relativePath: complete.relativePath,
      sha256: complete.sha256,
      mailboxWatermark: complete.mailboxWatermark,
      acknowledgedAboveWatermark: complete.acknowledgedAboveWatermark,
      inFlightChildren: complete.inFlightChildren,
    };

    const requestLifecycle: unknown = Reflect.get(fixture.leader, "requestLifecycle");
    if (typeof requestLifecycle !== "function") throw new Error("requestLifecycle is unavailable");

    await expect(
      Reflect.apply(requestLifecycle, fixture.leader, [{
        action: "rotate",
        agentId: "leader",
        taskId: fixture.leaderTask.taskId,
        taskRevision: fixture.leaderTask.revision,
        checkpoint: incomplete,
        commandId: "lifecycle:rotate:incomplete",
      }]),
    ).rejects.toMatchObject({ code: "CHECKPOINT_INCOMPLETE" });
  });

  it("accepts a complete checkpoint as the only portable lifecycle handoff", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "resume the task graph from the recorded revision",
    });

    const result = await fixture.leader.requestLifecycle({
      action: "completion-ready",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:completion-ready:complete",
    });

    expect(result).toMatchObject({ agentId: "leader", lifecycle: "completion-ready" });
  });

  it("passes the verified checkpoint as a bounded provider handoff before rotating", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "resume the exact task and mailbox revisions",
    });

    await fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:rotate:provider-handoff",
    });

    const database = new Database(fixture.databasePath, { readonly: true });
    const row = database.prepare(`
      SELECT payload_json FROM provider_actions
       WHERE run_id=? AND action_id=?
    `).get(fixture.runId, "lifecycle:rotate:provider-handoff:spawn") as { payload_json: string };
    database.close();
    const payload: unknown = JSON.parse(row.payload_json);
    expect(payload).toMatchObject({
      priorResumeReference: fixture.providerSessionMarker,
      generation: 2,
      prompt: expect.stringContaining(checkpoint.sha256),
    });
    expect(JSON.stringify(payload)).toContain("resume the exact task and mailbox revisions");
    expect(Buffer.byteLength((payload as { prompt: string }).prompt, "utf8")).toBeLessThanOrEqual(65_536);
  });

  it("publishes the successor generation only with a retained provider-originated Fabric bridge", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "acknowledge the checkpoint through the successor Fabric bridge",
    });

    await expect(fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:rotate:retained-bridge",
    })).resolves.toMatchObject({
      lifecycle: "ready",
      providerSessionGeneration: 2,
    });

    const database = new Database(fixture.databasePath, { readonly: true });
    expect(database.prepare(`
      SELECT bridge.bridge_state,bridge.provider_session_generation,
             bridge.bridge_generation,bridge.capability_hash,
             bridge.activation_evidence_digest,custody.principal_generation
        FROM agent_bridge_state bridge
        JOIN provider_agent_custody custody
          ON custody.run_id=bridge.run_id AND custody.action_id=bridge.action_id
       WHERE bridge.run_id=? AND bridge.agent_id='leader'
    `).get(fixture.runId)).toMatchObject({
      bridge_state: "active",
      provider_session_generation: 2,
      bridge_generation: expect.any(Number),
      capability_hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      activation_evidence_digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      principal_generation: 2,
    });
    expect(database.prepare(`
      SELECT principal_generation,revoked_at IS NOT NULL AS revoked
        FROM capabilities WHERE run_id=? AND agent_id='leader'
       ORDER BY principal_generation
    `).all(fixture.runId)).toEqual([
      { principal_generation: 1, revoked: 1 },
      { principal_generation: 2, revoked: 0 },
    ]);
    database.close();
  });

  it("quarantines predecessor write custody before replacement provider I/O", async () => {
    const fixture = await createLifecycleFixture({ spawnDelayMs: 100 });
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const lease = await fixture.leader.acquireWriteLease({
      scope: ["src/leader"],
      ttlMs: 60_000,
      commandId: "lifecycle:rotate:write-lease",
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "recover write custody under the successor generation",
    });
    const accepted = await fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:rotate:write-custody-fence",
    });
    expect(accepted).toMatchObject({ lifecycle: "suspended", providerSessionGeneration: 1 });
    const database = new Database(fixture.databasePath, { readonly: true });
    expect(database.prepare(`
      SELECT status FROM leases WHERE run_id=? AND lease_id=?
    `).get(fixture.runId, lease.leaseId)).toEqual({ status: "quarantined" });
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM leases
       WHERE run_id=? AND holder_agent_id='leader' AND status='active'
    `).get(fixture.runId)).toEqual({ count: 0 });
    database.close();
    await vi.waitFor(async () => {
      await expect(fixture.chair.getAgentLifecycle({ agentId: "leader" })).resolves.toMatchObject({
        lifecycle: "ready",
        providerSessionGeneration: 2,
      });
    });
  });

  it("accepts rotation but defers replacement I/O until the predecessor provider turn releases", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const now = fixture.clock.now().getTime();
    const database = new Database(fixture.databasePath);
    database.exec(`
      INSERT INTO provider_actions(
        run_id,action_id,adapter_id,operation,target_agent_id,
        provider_session_generation,turn_lease_generation,identity_hash,
        payload_hash,payload_json,status,history_json,execution_count,
        effect_count,idempotency_proven,updated_at
      ) VALUES (
        '${fixture.runId}','lifecycle-active-turn','fake-lifecycle','send_turn','leader',
        1,1,'${"a".repeat(64)}','${"b".repeat(64)}','{}',
        'dispatched','["prepared","dispatched"]',1,0,0,${now}
      );
      INSERT INTO provider_session_turn_leases(
        run_id,agent_id,provider_session_generation,turn_lease_generation,
        action_id,status,created_at,updated_at
      ) VALUES (
        '${fixture.runId}','leader',1,1,'lifecycle-active-turn','active',${now},${now}
      );
    `);
    database.close();
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "wait for the active provider turn",
    });

    await expect(fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:rotate:active-turn-fence",
    })).resolves.toMatchObject({
      lifecycle: "suspended",
      providerSessionGeneration: 1,
    });

    const waiting = new Database(fixture.databasePath, { readonly: true });
    expect(waiting.prepare(`
      SELECT state FROM lifecycle_rotation_custody
       WHERE run_id=? AND command_id='lifecycle:rotate:active-turn-fence'
    `).get(fixture.runId)).toEqual({ state: "prepared" });
    expect(waiting.prepare(`
      SELECT COUNT(*) AS count FROM provider_actions
       WHERE run_id=? AND action_id='lifecycle:rotate:active-turn-fence:spawn'
    `).get(fixture.runId)).toEqual({ count: 0 });
    expect(waiting.prepare(`
      SELECT status FROM provider_session_turn_leases
       WHERE run_id=? AND action_id='lifecycle-active-turn'
    `).get(fixture.runId)).toEqual({ status: "active" });
    waiting.close();

    const release = new Database(fixture.databasePath);
    release.transaction(() => {
      release.prepare(`
        UPDATE provider_session_turn_leases SET status='released',updated_at=?
         WHERE run_id=? AND action_id='lifecycle-active-turn' AND status='active'
      `).run(fixture.clock.now().getTime(), fixture.runId);
      release.prepare(`
        UPDATE provider_actions
           SET status='terminal',history_json='["prepared","dispatched","accepted","terminal"]',
               effect_count=1,idempotency_proven=1,result_json='{"completed":true}',updated_at=?
         WHERE run_id=? AND action_id='lifecycle-active-turn'
      `).run(fixture.clock.now().getTime(), fixture.runId);
    })();
    release.close();

    await vi.waitFor(async () => {
      await expect(fixture.chair.getAgentLifecycle({ agentId: "leader" })).resolves.toMatchObject({
        lifecycle: "ready",
        providerSessionGeneration: 2,
      });
    });
    const proof = new Database(fixture.databasePath, { readonly: true });
    expect(proof.prepare(`
      SELECT status,execution_count,effect_count FROM provider_actions
       WHERE run_id=? AND action_id='lifecycle:rotate:active-turn-fence:spawn'
    `).get(fixture.runId)).toEqual({ status: "terminal", execution_count: 1, effect_count: 1 });
    proof.close();
  });

  it("reconciles a lost provider result with the same action and never repeats the effect", async () => {
    const fixture = await createLifecycleFixture({ spawnResultLost: true });
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "reconcile the exact lifecycle action",
    });
    const request = {
      action: "rotate" as const,
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:rotate:lost-result",
    };

    await expect(fixture.leader.requestLifecycle(request)).rejects.toMatchObject({
      code: "LIFECYCLE_PRECONDITION_FAILED",
    });
    await expect(fixture.chair.getAgentLifecycle({ agentId: "leader" })).resolves.toMatchObject({
      lifecycle: "context-unreconciled",
      providerSessionGeneration: 1,
    });
    await expect(fixture.chair.reconcileProviderAction({
      actionId: "lifecycle:rotate:lost-result:spawn",
      commandId: "lifecycle:rotate:lost-result:generic-reconcile",
    })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });

    await expect(fixture.leader.requestLifecycle(request)).resolves.toMatchObject({
      lifecycle: "ready",
      providerSessionGeneration: 2,
      rotation: { kind: "replacement-session" },
    });
    const providerJournal = JSON.parse(await readFile(fixture.providerJournalPath, "utf8")) as {
      actions: Record<string, { executionCount: number; effectCount: number }>;
    };
    expect(providerJournal.actions["lifecycle:rotate:lost-result:spawn"]).toMatchObject({
      executionCount: 1,
      effectCount: 1,
    });
    expect(Object.keys(providerJournal.actions)).toEqual(["lifecycle:rotate:lost-result:spawn"]);

    const database = new Database(fixture.databasePath, { readonly: true });
    expect(database.prepare(`
      SELECT state,replacement_resume_reference FROM lifecycle_rotation_custody
       WHERE run_id=? AND agent_id=? AND command_id=?
    `).get(fixture.runId, "leader", request.commandId)).toMatchObject({
      state: "finalized",
      replacement_resume_reference: expect.stringContaining(":replacement:g2"),
    });
    expect(database.prepare(`
      SELECT status,execution_count,effect_count FROM provider_actions
       WHERE run_id=? AND action_id=?
    `).get(fixture.runId, "lifecycle:rotate:lost-result:spawn")).toEqual({
      status: "terminal",
      execution_count: 1,
      effect_count: 1,
    });
    database.close();
  });

  it("replays the same lifecycle action after a crash at the durable prepare boundary", async () => {
    let crash = true;
    const fixture = await createLifecycleFixture({
      fault: (label) => {
        if (crash && label === "lifecycle-rotation:prepared") {
          crash = false;
          throw new Error("simulated lifecycle process crash");
        }
      },
    });
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "resume from the durable lifecycle prepare",
    });
    const request = {
      action: "rotate" as const,
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:rotate:prepare-crash",
    };

    await expect(fixture.leader.requestLifecycle(request)).rejects.toThrow("simulated lifecycle process crash");
    await expect(fixture.chair.getAgentLifecycle({ agentId: "leader" })).resolves.toMatchObject({
      lifecycle: "suspended",
      providerSessionGeneration: 1,
    });
    const prepared = new Database(fixture.databasePath, { readonly: true });
    expect(prepared.prepare(`
      SELECT state,action_id FROM lifecycle_rotation_custody
       WHERE run_id=? AND agent_id='leader' AND command_id=?
    `).get(fixture.runId, request.commandId)).toEqual({
      state: "prepared",
      action_id: "lifecycle:rotate:prepare-crash:spawn",
    });
    expect(prepared.prepare(`
      SELECT COUNT(*) AS count FROM provider_actions WHERE run_id=? AND action_id=?
    `).get(fixture.runId, "lifecycle:rotate:prepare-crash:spawn")).toEqual({ count: 0 });
    prepared.close();
    await expect(fixture.leader.receiveMessages({ limit: 1, visibilityTimeoutMs: 30_000 }))
      .rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });
    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "lifecycle-prepare-crash-concurrent-turn",
      operation: "send_turn",
      payload: { taskId: fixture.leaderTask.taskId, scenario: "terminal" },
      commandId: "lifecycle:rotate:prepare-crash:turn",
    })).rejects.toMatchObject({ code: "CONTEXT_UNRECONCILED" });

    await expect(fixture.leader.requestLifecycle(request)).resolves.toMatchObject({
      lifecycle: "ready",
      providerSessionGeneration: 2,
    });
    const providerJournal = JSON.parse(await readFile(fixture.providerJournalPath, "utf8")) as {
      actions: Record<string, { executionCount: number; effectCount: number }>;
    };
    expect(providerJournal.actions["lifecycle:rotate:prepare-crash:spawn"]).toMatchObject({
      executionCount: 1,
      effectCount: 1,
    });
  });

  it("records startup pre-dispatch no-effect without restoring a lost predecessor bridge", async () => {
    let crash = true;
    const fixture = await createLifecycleFixture({
      fault: (label) => {
        if (crash && label === "lifecycle-rotation:prepared") {
          crash = false;
          throw new Error("simulated process death after lifecycle prepare");
        }
      },
    });
    let reopened: Awaited<ReturnType<typeof reopenLifecycleFabric>> | undefined;
    cleanup.push(async () => {
      await reopened?.close();
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "restart from the proved no-effect prepare",
    });
    await expect(fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:startup:prepared-no-effect",
    })).rejects.toThrow("simulated process death after lifecycle prepare");
    await fixture.fabric.close();

    reopened = await reopenLifecycleFabric(fixture);
    await expect(reopened.recoverStartupState()).resolves.toMatchObject({
      actionsQuarantined: 0,
    });

    const database = new Database(fixture.databasePath, { readonly: true });
    expect(database.prepare(`
      SELECT state,history_json,resolution_json
        FROM lifecycle_rotation_custody
       WHERE run_id=? AND agent_id='leader'
         AND command_id='lifecycle:startup:prepared-no-effect'
    `).get(fixture.runId)).toEqual({
      state: "no-effect",
      history_json: expect.stringContaining("no-effect"),
      resolution_json: expect.stringContaining("startup-pre-dispatch-no-effect"),
    });
    expect(database.prepare(`
      SELECT lifecycle FROM agents WHERE run_id=? AND agent_id='leader'
    `).get(fixture.runId)).toEqual({ lifecycle: "context-unreconciled" });
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM delivery_freezes
       WHERE run_id=? AND agent_id='leader'
    `).get(fixture.runId)).toEqual({ count: 1 });
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM provider_actions
       WHERE run_id=? AND action_id='lifecycle:startup:prepared-no-effect:spawn'
    `).get(fixture.runId)).toEqual({ count: 0 });
    database.close();
  });

  it("recovers a dispatched lifecycle action only by its adapter pair key and quarantines lost bridge custody", async () => {
    const fixture = await createLifecycleFixture({ spawnResultLost: true });
    let reopened: Awaited<ReturnType<typeof reopenLifecycleFabric>> | undefined;
    cleanup.push(async () => {
      await reopened?.close();
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "recover the exact dispatched lifecycle action",
    });
    await expect(fixture.leader.requestLifecycle({
      action: "rotate",
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:startup:dispatched-lookup",
    })).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
    await fixture.fabric.close();

    reopened = await reopenLifecycleFabric(fixture);
    await expect(reopened.recoverStartupState()).resolves.toMatchObject({
      actionsQuarantined: 1,
    });

    const journal = JSON.parse(await readFile(fixture.providerJournalPath, "utf8")) as {
      actions: Record<string, { executionCount: number; lookupCount?: number }>;
      sessions: Record<string, { spawnRequests?: number }>;
    };
    expect(journal.actions["lifecycle:startup:dispatched-lookup:spawn"]).toMatchObject({
      executionCount: 1,
      lookupCount: 1,
    });
    expect(Object.values(journal.sessions)).toHaveLength(1);
    expect(Object.values(journal.sessions)[0]).toMatchObject({ spawnRequests: 1 });

    const database = new Database(fixture.databasePath, { readonly: true });
    expect(database.prepare(`
      SELECT status,history_json,execution_count,effect_count
        FROM provider_actions
       WHERE run_id=? AND action_id='lifecycle:startup:dispatched-lookup:spawn'
    `).get(fixture.runId)).toEqual({
      status: "terminal",
      history_json: '["prepared","dispatched","accepted","terminal"]',
      execution_count: 1,
      effect_count: 1,
    });
    expect(database.prepare(`
      SELECT state,history_json,resolution_json
        FROM lifecycle_rotation_custody
       WHERE run_id=? AND agent_id='leader'
         AND command_id='lifecycle:startup:dispatched-lookup'
    `).get(fixture.runId)).toEqual({
      state: "quarantined",
      history_json: '["prepared","unreconciled","startup-lookup-terminal","quarantined"]',
      resolution_json: expect.stringContaining("startup-retained-bridge-unavailable"),
    });
    database.close();
  });

  it("keeps an ambiguous lifecycle effect unreconciled without dispatching it again", async () => {
    const fixture = await createLifecycleFixture({ spawnUnresolved: true });
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "wait for exact provider reconciliation",
    });
    const request = {
      action: "rotate" as const,
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:rotate:unresolved",
    };

    await expect(fixture.leader.requestLifecycle(request)).rejects.toMatchObject({
      code: "LIFECYCLE_PRECONDITION_FAILED",
    });
    await expect(fixture.leader.requestLifecycle(request)).rejects.toMatchObject({
      code: "LIFECYCLE_PRECONDITION_FAILED",
    });
    await expect(fixture.chair.getAgentLifecycle({ agentId: "leader" })).resolves.toMatchObject({
      lifecycle: "context-unreconciled",
      providerSessionGeneration: 1,
    });
    const providerJournal = JSON.parse(await readFile(fixture.providerJournalPath, "utf8")) as {
      actions: Record<string, { status: string; executionCount: number; effectCount: number }>;
    };
    expect(providerJournal.actions["lifecycle:rotate:unresolved:spawn"]).toEqual(expect.objectContaining({
      status: "ambiguous",
      executionCount: 1,
      effectCount: 1,
    }));
    const database = new Database(fixture.databasePath, { readonly: true });
    expect(database.prepare(`
      SELECT state FROM lifecycle_rotation_custody
       WHERE run_id=? AND agent_id='leader' AND command_id=?
    `).get(fixture.runId, request.commandId)).toEqual({ state: "unreconciled" });
    expect(database.prepare(`
      SELECT status,history_json,execution_count,effect_count,result_json
        FROM provider_actions WHERE run_id=? AND action_id='lifecycle:rotate:unresolved:spawn'
    `).get(fixture.runId)).toEqual({
      status: "quarantined",
      history_json: '["prepared","dispatched","accepted","ambiguous","quarantined"]',
      execution_count: 1,
      effect_count: 1,
      result_json: null,
    });
    database.close();
  });

  it("coalesces concurrent replay of one lifecycle command onto one provider effect", async () => {
    const fixture = await createLifecycleFixture({ spawnDelayMs: 100 });
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "resume one coalesced lifecycle command",
    });
    const request = {
      action: "rotate" as const,
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:rotate:concurrent-replay",
    };

    const [first, second] = await Promise.all([
      fixture.leader.requestLifecycle(request),
      fixture.leader.requestLifecycle(request),
    ]);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ lifecycle: "ready", providerSessionGeneration: 2 });
    const providerJournal = JSON.parse(await readFile(fixture.providerJournalPath, "utf8")) as {
      actions: Record<string, { executionCount: number; effectCount: number }>;
    };
    expect(providerJournal.actions["lifecycle:rotate:concurrent-replay:spawn"]).toMatchObject({
      executionCount: 1,
      effectCount: 1,
    });
  });

  it("never redispatches after adapter lookup loses a dispatched lifecycle action", async () => {
    const fixture = await createLifecycleFixture({ spawnLookupMissing: true });
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "quarantine missing provider evidence",
    });
    const request = {
      action: "rotate" as const,
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:rotate:lookup-missing",
    };

    await expect(fixture.leader.requestLifecycle(request)).rejects.toMatchObject({
      code: "LIFECYCLE_PRECONDITION_FAILED",
    });
    await expect(fixture.leader.requestLifecycle(request)).rejects.toMatchObject({
      code: "LIFECYCLE_PRECONDITION_FAILED",
    });

    const providerJournal = JSON.parse(await readFile(fixture.providerJournalPath, "utf8")) as {
      sessions: Record<string, { spawnRequests?: number }>;
    };
    expect(Object.values(providerJournal.sessions)).toHaveLength(1);
    expect(Object.values(providerJournal.sessions)[0]).toMatchObject({ spawnRequests: 1 });
    const database = new Database(fixture.databasePath, { readonly: true });
    expect(database.prepare(`
      SELECT status,history_json,execution_count,effect_count,result_json FROM provider_actions
       WHERE run_id=? AND action_id='lifecycle:rotate:lookup-missing:spawn'
    `).get(fixture.runId)).toEqual({
      status: "quarantined",
      history_json: '["prepared","dispatched","ambiguous","quarantined"]',
      execution_count: 1,
      effect_count: 0,
      result_json: null,
    });
    expect(database.prepare(`
      SELECT state FROM lifecycle_rotation_custody
       WHERE run_id=? AND agent_id='leader' AND command_id=?
    `).get(fixture.runId, request.commandId)).toEqual({ state: "unreconciled" });
    database.close();
  });

  it("does not dispatch a prepared replay after its lifecycle freeze changes owner", async () => {
    let crash = true;
    const fixture = await createLifecycleFixture({
      fault: (label) => {
        if (crash && label === "lifecycle-rotation:prepared") {
          crash = false;
          throw new Error("simulated crash before lifecycle provider I/O");
        }
      },
    });
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeLifecycleCheckpoint(fixture, {
      agentId: "leader",
      inFlightChildren: ["child"],
      openWork: ["leader-task"],
      nextAction: "preserve the new freeze owner",
    });
    const request = {
      action: "rotate" as const,
      agentId: "leader",
      taskId: fixture.leaderTask.taskId,
      taskRevision: fixture.leaderTask.revision,
      checkpoint,
      commandId: "lifecycle:rotate:prepared-foreign-freeze",
    };
    await expect(fixture.leader.requestLifecycle(request)).rejects.toThrow(
      "simulated crash before lifecycle provider I/O",
    );
    const database = new Database(fixture.databasePath);
    database.prepare(`
      UPDATE delivery_freezes SET reason='interactive-tui-lost'
       WHERE run_id=? AND agent_id='leader'
    `).run(fixture.runId);
    database.close();

    await expect(fixture.leader.requestLifecycle(request)).rejects.toMatchObject({
      code: "LIFECYCLE_PRECONDITION_FAILED",
    });
    const proof = new Database(fixture.databasePath, { readonly: true });
    expect(proof.prepare(`
      SELECT reason FROM delivery_freezes WHERE run_id=? AND agent_id='leader'
    `).get(fixture.runId)).toEqual({ reason: "interactive-tui-lost" });
    expect(proof.prepare(`
      SELECT COUNT(*) AS count FROM provider_actions WHERE run_id=?
    `).get(fixture.runId)).toEqual({ count: 0 });
    proof.close();
  });
});

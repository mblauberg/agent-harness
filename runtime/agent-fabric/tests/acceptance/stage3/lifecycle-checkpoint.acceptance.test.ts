import { readFile, rm } from "node:fs/promises";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { createLifecycleFixture, writeLifecycleCheckpoint } from "../../support/lifecycle-testkit.ts";

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

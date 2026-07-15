import Database from "better-sqlite3";
import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { createStage1Fixture } from "../../support/stage1-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(async (close) => await close()));
});

async function fixtureWithReader() {
  const fixture = await createStage1Fixture();
  const reader = new Database(fixture.databasePath, { readonly: true, fileMustExist: true });
  cleanup.push(async () => {
    reader.close();
    await fixture.fabric.close();
    await rm(fixture.directory, { recursive: true, force: true });
  });
  const run = reader.prepare(`
    SELECT project_session_id FROM runs WHERE run_id='run-stage1'
  `).get() as { project_session_id: string };
  return { ...fixture, reader, projectSessionId: run.project_session_id };
}

function membership(
  database: Database.Database,
  kind: "task" | "required-message" | "lease",
  memberId: string,
): { state: string; revision: number } | undefined {
  return database.prepare(`
    SELECT state, revision FROM project_session_memberships
     WHERE coordination_run_id='run-stage1' AND member_kind=? AND member_id=?
  `).get(kind, memberId) as { state: string; revision: number } | undefined;
}

function membershipDisposition(
  database: Database.Database,
  kind: "task" | "required-message" | "lease",
  memberId: string,
): { state: string; revision: number; abandoned_reason: string | null } | undefined {
  return database.prepare(`
    SELECT state, revision, abandoned_reason FROM project_session_memberships
     WHERE coordination_run_id='run-stage1' AND member_kind=? AND member_id=?
  `).get(kind, memberId) as { state: string; revision: number; abandoned_reason: string | null } | undefined;
}

describe("automatic project-session membership", () => {
  it("binds generic tasks, required messages, and write leases in their source transactions", async () => {
    const fixture = await fixtureWithReader();

    await fixture.chair.createTask({
      taskId: "task_membership",
      authorityId: fixture.authorities.alice,
      eligibleAgentIds: ["alice"],
      objective: "Prove automatic task membership.",
      baseRevision: "base-membership",
      commandId: "membership:task:create",
    });
    const message = await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["alice", "bob"] },
      kind: "request",
      body: "Prove automatic required-message membership.",
      requiresAck: true,
      dedupeKey: "membership:message",
    });
    const lease = await fixture.alice.acquireWriteLease({
      scope: ["src/alice"],
      ttlMs: 60_000,
      commandId: "membership:lease:acquire",
    });

    expect(membership(fixture.reader, "task", "task_membership")).toEqual({ state: "active", revision: 1 });
    expect(membership(fixture.reader, "required-message", message.messageId)).toEqual({ state: "active", revision: 1 });
    expect(membership(fixture.reader, "lease", lease.leaseId)).toEqual({ state: "active", revision: 1 });
  });

  it("reconciles each terminal source exactly once and keeps a multi-recipient message active until all settle", async () => {
    const fixture = await fixtureWithReader();
    await fixture.chair.createTask({
      taskId: "task_terminal_membership",
      authorityId: fixture.authorities.alice,
      eligibleAgentIds: ["alice"],
      objective: "Reach a terminal state.",
      baseRevision: "base-terminal-membership",
      commandId: "membership:task:terminal:create",
    });
    await fixture.alice.claimTask({
      taskId: "task_terminal_membership",
      expectedRevision: 1,
      commandId: "membership:task:terminal:claim",
    });
    const terminalTask = {
      taskId: "task_terminal_membership",
      expectedRevision: 2,
      state: "complete" as const,
      commandId: "membership:task:terminal:complete",
    };
    await fixture.alice.updateTask(terminalTask);
    await fixture.alice.updateTask(terminalTask);
    expect(membership(fixture.reader, "task", "task_terminal_membership"))
      .toEqual({ state: "reconciled", revision: 2 });

    const message = await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["alice", "bob"] },
      kind: "request",
      body: "Acknowledge independently.",
      requiresAck: true,
      dedupeKey: "membership:message:terminal",
    });
    const [aliceDelivery] = await fixture.alice.receiveMessages({ limit: 1, visibilityTimeoutMs: 5_000 });
    const [bobDelivery] = await fixture.bob.receiveMessages({ limit: 1, visibilityTimeoutMs: 5_000 });
    if (aliceDelivery === undefined || bobDelivery === undefined) throw new Error("expected both deliveries");
    await fixture.alice.acknowledgeDelivery({ deliveryId: aliceDelivery.deliveryId });
    expect(membership(fixture.reader, "required-message", message.messageId))
      .toEqual({ state: "active", revision: 1 });
    await fixture.bob.acknowledgeDelivery({ deliveryId: bobDelivery.deliveryId });
    await fixture.bob.acknowledgeDelivery({ deliveryId: bobDelivery.deliveryId });
    expect(membership(fixture.reader, "required-message", message.messageId))
      .toEqual({ state: "reconciled", revision: 2 });

    const lease = await fixture.alice.acquireWriteLease({
      scope: ["src/alice"],
      ttlMs: 60_000,
      commandId: "membership:lease:terminal:acquire",
    });
    const release = {
      leaseId: lease.leaseId,
      expectedGeneration: lease.generation,
      commandId: "membership:lease:terminal:release",
    };
    await fixture.alice.releaseWriteLease(release);
    await fixture.alice.releaseWriteLease(release);
    expect(membership(fixture.reader, "lease", lease.leaseId))
      .toEqual({ state: "reconciled", revision: 2 });
  });

  it("abandons cancelled task membership with a durable source reason", async () => {
    const fixture = await fixtureWithReader();
    await fixture.chair.createTask({
      taskId: "task_abandoned_membership",
      authorityId: fixture.authorities.alice,
      eligibleAgentIds: ["alice"],
      objective: "Cancel with an explicit durable disposition.",
      baseRevision: "base-abandoned-membership",
      commandId: "membership:task:abandoned:create",
    });
    await fixture.alice.claimTask({
      taskId: "task_abandoned_membership",
      expectedRevision: 1,
      commandId: "membership:task:abandoned:claim",
    });
    await fixture.alice.updateTask({
      taskId: "task_abandoned_membership",
      expectedRevision: 2,
      state: "cancelled",
      commandId: "membership:task:abandoned:cancel",
    });
    expect(membershipDisposition(fixture.reader, "task", "task_abandoned_membership"))
      .toEqual({ state: "abandoned", revision: 2, abandoned_reason: "task source state cancelled" });
  });

  it("reconciles expiry and abandonment only after the required message is fully settled", async () => {
    const fixture = await fixtureWithReader();
    const expiring = await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["alice"] },
      kind: "request",
      body: "Expire this request.",
      requiresAck: true,
      dedupeKey: "membership:message:expiry",
      expiresAt: new Date(fixture.clock.now().getTime() + 1_000).toISOString(),
    });
    fixture.clock.advance(1_001);
    expect(await fixture.alice.receiveMessages({ limit: 1, visibilityTimeoutMs: 5_000 })).toEqual([]);
    expect(membershipDisposition(fixture.reader, "required-message", expiring.messageId))
      .toEqual({
        state: "abandoned",
        revision: 2,
        abandoned_reason: "required-message source delivery expired or abandoned",
      });

    const abandoned = await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["bob"] },
      kind: "request",
      body: "Abandon this request with evidence.",
      requiresAck: true,
      dedupeKey: "membership:message:abandon",
    });
    const [delivery] = await fixture.bob.receiveMessages({ limit: 1, visibilityTimeoutMs: 5_000 });
    if (delivery === undefined) throw new Error("expected an abandonable delivery");
    const abandon = {
      deliveryId: delivery.deliveryId,
      reason: "Explicitly superseded.",
      commandId: "membership:message:abandon:command",
    };
    await fixture.chair.abandonDelivery(abandon);
    await fixture.chair.abandonDelivery(abandon);
    expect(membershipDisposition(fixture.reader, "required-message", abandoned.messageId))
      .toEqual({
        state: "abandoned",
        revision: 2,
        abandoned_reason: "required-message source delivery expired or abandoned",
      });
  });

  it("cannot create an orphan source after quiescing and closure remains blocked by an active member", async () => {
    const fixture = await fixtureWithReader();
    await fixture.chair.createTask({
      taskId: "task_blocks_closure",
      authorityId: fixture.authorities.alice,
      eligibleAgentIds: ["alice"],
      objective: "Remain active through the closure check.",
      baseRevision: "base-closure",
      commandId: "membership:task:block:create",
    });

    const writer = new Database(fixture.databasePath);
    try {
      writer.prepare(`
        UPDATE project_sessions SET state='quiescing', revision=revision+1
         WHERE project_session_id=?
      `).run(fixture.projectSessionId);
      writer.prepare(`
        UPDATE runs SET lifecycle_state='awaiting_acceptance', revision=revision+1
         WHERE run_id='run-stage1'
      `).run();
      expect(() => writer.prepare(`
        UPDATE project_sessions SET state='awaiting_acceptance', revision=revision+1
         WHERE project_session_id=?
      `).run(fixture.projectSessionId)).toThrow(/AFAB_0004_SESSION_CLOSURE_BLOCKED/u);
    } finally {
      writer.close();
    }

    await expect(fixture.chair.createTask({
      taskId: "task_orphan_after_quiesce",
      authorityId: fixture.authorities.alice,
      eligibleAgentIds: ["alice"],
      objective: "This source must roll back.",
      baseRevision: "base-orphan",
      commandId: "membership:task:orphan:create",
    })).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
    expect(fixture.reader.prepare(`
      SELECT COUNT(*) AS count FROM tasks WHERE task_id='task_orphan_after_quiesce'
    `).get()).toEqual({ count: 0 });
  });

  it("rolls each source mutation back when its required membership cannot commit", async () => {
    const fixture = await fixtureWithReader();
    const writer = new Database(fixture.databasePath);
    try {
      writer.exec(`
        CREATE TRIGGER test_reject_automatic_membership
        BEFORE INSERT ON project_session_memberships
        WHEN NEW.member_kind IN ('task','required-message','lease')
        BEGIN SELECT RAISE(ABORT, 'TEST_MEMBERSHIP_REJECTED'); END;
      `);
    } finally {
      writer.close();
    }

    await expect(fixture.chair.createTask({
      taskId: "task_atomic_rollback",
      authorityId: fixture.authorities.alice,
      eligibleAgentIds: ["alice"],
      objective: "This source must roll back with its membership.",
      baseRevision: "base-atomic-rollback",
      commandId: "membership:atomic:task",
    })).rejects.toThrow(/TEST_MEMBERSHIP_REJECTED/u);

    await expect(fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["alice"] },
      kind: "request",
      body: "This message must roll back with its membership.",
      requiresAck: true,
      dedupeKey: "membership:atomic:message",
    })).rejects.toThrow(/TEST_MEMBERSHIP_REJECTED/u);

    await expect(fixture.alice.acquireWriteLease({
      scope: ["src/alice"],
      ttlMs: 60_000,
      commandId: "membership:atomic:lease",
    })).rejects.toThrow(/TEST_MEMBERSHIP_REJECTED/u);

    expect(fixture.reader.prepare(`
      SELECT COUNT(*) AS count FROM tasks WHERE task_id='task_atomic_rollback'
    `).get()).toEqual({ count: 0 });
    expect(fixture.reader.prepare(`
      SELECT COUNT(*) AS count FROM messages WHERE dedupe_key='membership:atomic:message'
    `).get()).toEqual({ count: 0 });
    expect(fixture.reader.prepare(`
      SELECT COUNT(*) AS count FROM leases WHERE kind='write'
    `).get()).toEqual({ count: 0 });
  });
});

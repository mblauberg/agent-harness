import { afterEach, describe, expect, it } from "vitest";

import { createStage5MessagingFixture } from "../../support/stage5-messaging-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("FR-010/FR-011 Stage 5 messaging relationships", () => {
  it("allows either direction between registered participants of one task without transferring ownership or authority", async () => {
    const fixture = await createStage5MessagingFixture();
    cleanup.push(fixture.cleanup);
    const task = await fixture.chair.createTask({
      taskId: "task-shared",
      authorityId: fixture.authorities.alice,
      proposedOwnerAgentId: "alice",
      participantAgentIds: ["alice", "bob"],
      eligibleAgentIds: ["alice"],
      dependencies: [],
      objective: "Shared task communication",
      baseRevision: "rev-1",
      commandId: "task:create:shared",
    });
    const claimed = await fixture.alice.claimTask({
      taskId: task.taskId,
      expectedRevision: task.revision,
      commandId: "task:claim:shared",
    });

    await fixture.alice.sendMessage({
      audience: { kind: "agents", agentIds: ["bob"] },
      context: { kind: "task", taskId: task.taskId },
      kind: "request",
      body: "peer check",
      requiresAck: true,
      dedupeKey: "shared:alice-to-bob",
    });
    await fixture.bob.sendMessage({
      audience: { kind: "agents", agentIds: ["alice"] },
      context: { kind: "task", taskId: task.taskId },
      kind: "response",
      body: "peer reply",
      requiresAck: true,
      dedupeKey: "shared:bob-to-alice",
    });
    expect(await fixture.bob.receiveMessages({ limit: 1, visibilityTimeoutMs: 1_000 })).toHaveLength(1);
    expect(await fixture.alice.receiveMessages({ limit: 1, visibilityTimeoutMs: 1_000 })).toHaveLength(1);
    expect(await fixture.chair.getTask({ taskId: task.taskId })).toMatchObject({
      ownerAgentId: "alice",
      ownerLeaseGeneration: claimed.ownerLeaseGeneration,
      revision: claimed.revision,
    });
    await expect(
      fixture.bob.acquireWriteLease({
        scope: ["src/alice"],
        ttlMs: 1_000,
        commandId: "shared:message-does-not-grant-authority",
      }),
    ).rejects.toMatchObject({ code: "AUTHORITY_WIDENING" });
  });

  it("allows either direction across one direct dependency edge and blocks readiness until the dependency is terminal", async () => {
    const fixture = await createStage5MessagingFixture();
    cleanup.push(fixture.cleanup);
    const upstream = await fixture.chair.createTask({
      taskId: "task-upstream",
      authorityId: fixture.authorities.alice,
      proposedOwnerAgentId: "alice",
      participantAgentIds: ["alice"],
      eligibleAgentIds: ["alice"],
      dependencies: [],
      objective: "Upstream work",
      baseRevision: "rev-1",
      commandId: "task:create:upstream",
    });
    const activeUpstream = await fixture.alice.claimTask({
      taskId: upstream.taskId,
      expectedRevision: upstream.revision,
      commandId: "task:claim:upstream",
    });
    const downstream = await fixture.chair.createTask({
      taskId: "task-downstream",
      authorityId: fixture.authorities.bob,
      proposedOwnerAgentId: "bob",
      participantAgentIds: ["bob"],
      eligibleAgentIds: ["bob"],
      dependencies: [upstream.taskId],
      objective: "Downstream work",
      baseRevision: "rev-1",
      commandId: "task:create:downstream",
    });
    expect(downstream).toMatchObject({ state: "blocked", dependencies: [upstream.taskId] });
    await expect(
      fixture.bob.claimTask({
        taskId: downstream.taskId,
        expectedRevision: downstream.revision,
        commandId: "task:claim:downstream-too-early",
      }),
    ).rejects.toMatchObject({ code: "TASK_DEPENDENCY_BLOCKED" });

    await fixture.alice.sendMessage({
      audience: { kind: "agents", agentIds: ["bob"] },
      context: { kind: "task-dependency", fromTaskId: upstream.taskId, toTaskId: downstream.taskId },
      kind: "request",
      body: "dependency note",
      requiresAck: false,
      dedupeKey: "dependency:forward",
    });
    await fixture.bob.sendMessage({
      audience: { kind: "agents", agentIds: ["alice"] },
      context: { kind: "task-dependency", fromTaskId: downstream.taskId, toTaskId: upstream.taskId },
      kind: "response",
      body: "dependency reply",
      requiresAck: false,
      dedupeKey: "dependency:reverse",
    });
    expect(await fixture.bob.receiveMessages({ limit: 1, visibilityTimeoutMs: 1_000 })).toHaveLength(1);
    expect(await fixture.alice.receiveMessages({ limit: 1, visibilityTimeoutMs: 1_000 })).toHaveLength(1);

    await fixture.alice.updateTask({
      taskId: upstream.taskId,
      expectedRevision: activeUpstream.revision,
      state: "degraded",
      commandId: "task:degrade:upstream",
    });
    const ready = await fixture.chair.refreshTaskReadiness({
      taskId: downstream.taskId,
      expectedRevision: downstream.revision,
      commandId: "task:refresh:downstream",
    });
    expect(ready).toMatchObject({ state: "ready", dependencies: [upstream.taskId] });
    await expect(
      fixture.bob.claimTask({
        taskId: downstream.taskId,
        expectedRevision: ready.revision,
        commandId: "task:claim:downstream-ready",
      }),
    ).resolves.toMatchObject({ state: "active", ownerAgentId: "bob" });
  });

  it.each(["complete", "cancelled", "degraded"] as const)(
    "treats an explicitly %s dependency as satisfying readiness",
    async (terminalState) => {
      const fixture = await createStage5MessagingFixture();
      cleanup.push(fixture.cleanup);
      const suffix = terminalState;
      const upstream = await fixture.chair.createTask({
        taskId: `task-${suffix}-dependency`,
        authorityId: fixture.authorities.alice,
        proposedOwnerAgentId: "alice",
        participantAgentIds: ["alice"],
        eligibleAgentIds: ["alice"],
        dependencies: [],
        objective: `${terminalState} dependency`,
        baseRevision: "rev-1",
        commandId: `task:create:${suffix}-dependency`,
      });
      const active = await fixture.alice.claimTask({
        taskId: upstream.taskId,
        expectedRevision: upstream.revision,
        commandId: `task:claim:${suffix}-dependency`,
      });
      await fixture.alice.updateTask({
        taskId: upstream.taskId,
        expectedRevision: active.revision,
        state: terminalState,
        commandId: `task:terminal:${suffix}-dependency`,
      });
      const dependent = await fixture.chair.createTask({
        taskId: `task-after-${suffix}`,
        authorityId: fixture.authorities.bob,
        proposedOwnerAgentId: "bob",
        participantAgentIds: ["bob"],
        eligibleAgentIds: ["bob"],
        dependencies: [upstream.taskId],
        objective: `Ready after ${terminalState}`,
        baseRevision: "rev-1",
        commandId: `task:create:after-${suffix}`,
      });
      expect(dependent).toMatchObject({ state: "ready", dependencies: [upstream.taskId] });
    },
  );

  it("allows a shared discussion group but rejects an unrelated or forged recipient", async () => {
    const fixture = await createStage5MessagingFixture();
    cleanup.push(fixture.cleanup);
    const rootTask = await fixture.chair.createTask({
      taskId: "task-team-root",
      authorityId: fixture.authorities.chair,
      proposedOwnerAgentId: "chair",
      participantAgentIds: ["chair"],
      eligibleAgentIds: ["chair"],
      dependencies: [],
      objective: "Discussion team root",
      baseRevision: "rev-1",
      commandId: "task:create:team-root",
    });
    await fixture.chair.createTeam({
      teamId: "team-review",
      leaderAgentId: "chair",
      rootTaskId: rootTask.taskId,
      initialMemberAgentIds: ["alice", "bob", "carol", "dave"],
      discussionGroups: [{ groupId: "review-room", memberAgentIds: ["alice", "carol"] }],
      reservedBudget: { turns: 4, "cost:USD": 4 },
      commandId: "team:create:review",
    });

    await fixture.alice.sendMessage({
      audience: { kind: "agents", agentIds: ["carol"] },
      context: { kind: "discussion-group", groupId: "review-room" },
      kind: "request",
      body: "group note",
      requiresAck: false,
      dedupeKey: "group:alice-to-carol",
    });
    await fixture.carol.sendMessage({
      audience: { kind: "agents", agentIds: ["alice"] },
      context: { kind: "discussion-group", groupId: "review-room" },
      kind: "response",
      body: "group reply",
      requiresAck: false,
      dedupeKey: "group:carol-to-alice",
    });
    expect(await fixture.carol.receiveMessages({ limit: 1, visibilityTimeoutMs: 1_000 })).toHaveLength(1);
    expect(await fixture.alice.receiveMessages({ limit: 1, visibilityTimeoutMs: 1_000 })).toHaveLength(1);

    await expect(
      fixture.dave.sendMessage({
        audience: { kind: "agents", agentIds: ["alice"] },
        context: { kind: "discussion-group", groupId: "review-room" },
        kind: "request",
        body: "forged membership",
        requiresAck: false,
        dedupeKey: "group:forged",
      }),
    ).rejects.toMatchObject({ code: "MESSAGE_RELATIONSHIP_FORBIDDEN" });
    await expect(
      fixture.carol.sendMessage({
        audience: { kind: "agents", agentIds: ["bob"] },
        context: { kind: "direct" },
        kind: "request",
        body: "unrelated",
        requiresAck: false,
        dedupeKey: "direct:unrelated",
      }),
    ).rejects.toMatchObject({ code: "MESSAGE_RELATIONSHIP_FORBIDDEN" });
  });

  it("atomically expands team and task audiences into per-agent deliveries", async () => {
    const fixture = await createStage5MessagingFixture();
    cleanup.push(fixture.cleanup);
    const task = await fixture.chair.createTask({
      taskId: "task-audience",
      authorityId: fixture.authorities.alice,
      proposedOwnerAgentId: "alice",
      participantAgentIds: ["alice", "bob"],
      eligibleAgentIds: ["alice"],
      dependencies: [],
      objective: "Task audience expansion",
      baseRevision: "rev-1",
      commandId: "task:create:audience",
    });
    await fixture.alice.claimTask({
      taskId: task.taskId,
      expectedRevision: task.revision,
      commandId: "task:claim:audience",
    });
    const rootTask = await fixture.chair.createTask({
      taskId: "team-audience-root",
      authorityId: fixture.authorities.chair,
      proposedOwnerAgentId: "chair",
      participantAgentIds: ["chair"],
      eligibleAgentIds: ["chair"],
      dependencies: [],
      objective: "Team audience expansion",
      baseRevision: "rev-1",
      commandId: "task:create:team-audience-root",
    });
    await fixture.chair.createTeam({
      teamId: "team-audience",
      leaderAgentId: "chair",
      rootTaskId: rootTask.taskId,
      memberAgentIds: ["alice", "bob", "carol"],
      reservedBudget: { turns: 3, "cost:USD": 3 },
      commandId: "team:create:audience",
    });

    await fixture.alice.sendMessage({
      audience: { kind: "task", taskId: task.taskId },
      kind: "event",
      body: "task-wide",
      requiresAck: false,
      dedupeKey: "audience:task",
    });
    await fixture.alice.sendMessage({
      audience: { kind: "team", teamId: "team-audience" },
      kind: "event",
      body: "team-wide",
      requiresAck: false,
      dedupeKey: "audience:team",
    });

    expect(await fixture.alice.receiveMessages({ limit: 10, visibilityTimeoutMs: 1_000 })).toHaveLength(2);
    expect(await fixture.bob.receiveMessages({ limit: 10, visibilityTimeoutMs: 1_000 })).toHaveLength(2);
    expect(await fixture.carol.receiveMessages({ limit: 10, visibilityTimeoutMs: 1_000 })).toHaveLength(1);
    expect(await fixture.chair.receiveMessages({ limit: 10, visibilityTimeoutMs: 1_000 })).toHaveLength(1);
    expect(await fixture.dave.receiveMessages({ limit: 10, visibilityTimeoutMs: 1_000 })).toEqual([]);
  });
});

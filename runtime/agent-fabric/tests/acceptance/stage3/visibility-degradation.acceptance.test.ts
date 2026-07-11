import { afterEach, describe, expect, it } from "vitest";

import { createVisibilityCoordinator } from "../../../src/index.ts";
import { createVisibilityFixture } from "../../support/visibility-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("AC-007 visibility degradation", () => {
  it("distinguishes telemetry, observer and interactive TUI loss without losing coordination state", async () => {
    const fixture = await createVisibilityFixture("run-visibility-loss");
    cleanup.push(fixture.cleanup);
    const observed = await createVisibilityCoordinator({
      runId: fixture.run.runId,
      profileName: "paired-observed",
      chairInHerdr: true,
      clients: { chair: fixture.chair, peer: fixture.peer },
      herdr: fixture.herdr,
      provider: fixture.provider,
      clock: fixture.clock.now,
      evidenceSink: fixture.chair,
    });
    await observed.startPair({
      chair: { agentId: "chair", provider: "claude", sessionRef: "claude-session-1", paneId: "w-test:p-chair" },
      peer: { agentId: "peer", provider: "codex", sessionRef: "codex-session-1" },
    });
    const readyTask = await fixture.chair.createTask({
      taskId: "visibility-survivor",
      authorityId: fixture.peerAuthorityId,
      eligibleAgentIds: ["peer"],
      objective: "survive Herdr loss",
      baseRevision: "visibility-base",
      commandId: "visibility:task:create",
    });
    const activeTask = await fixture.peer.claimTask({
      taskId: readyTask.taskId,
      expectedRevision: readyTask.revision,
      commandId: "visibility:task:claim",
    });
    const lease = await fixture.peer.acquireWriteLease({
      scope: ["src/peer"],
      ttlMs: 60_000,
      commandId: "visibility:lease:acquire",
    });
    const pending = await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "must survive visibility loss",
      requiresAck: true,
      dedupeKey: "visibility-loss:pending",
    });

    expect(await observed.handleVisibilityFailure({ kind: "herdr-telemetry", agentId: "peer" })).toEqual({
      visibility: "degraded",
      providerSession: "healthy",
      delivery: "active",
    });
    expect(fixture.provider.status("peer")).toMatchObject({ state: "idle", sessionRef: "codex-session-1" });
    expect(await fixture.peer.getTask({ taskId: activeTask.taskId })).toEqual(activeTask);
    expect(await fixture.peer.getWriteLease({ leaseId: lease.leaseId })).toEqual(lease);
    expect(await observed.handleVisibilityFailure({ kind: "observer-pane", agentId: "peer" })).toEqual({
      visibility: "degraded",
      providerSession: "healthy",
      delivery: "active",
    });
    expect(fixture.provider.managedSpawnCount).toBe(1);
    expect(await fixture.peer.getMailboxState()).toMatchObject({ contiguousWatermark: 0 });

    const interactive = await createVisibilityCoordinator({
      runId: fixture.run.runId,
      profileName: "paired-visible",
      chairInHerdr: true,
      clients: { chair: fixture.chair, peer: fixture.peer },
      herdr: fixture.herdr,
      provider: fixture.provider,
      clock: fixture.clock.now,
      evidenceSink: fixture.chair,
    });
    await interactive.startPair({
      chair: { agentId: "chair", provider: "claude", sessionRef: "claude-session-1", paneId: "w-test:p-chair" },
      peer: { agentId: "peer", provider: "codex", sessionRef: "codex-session-1", paneId: "w-test:p-peer" },
    });
    fixture.provider.loseSession("peer");
    expect(await interactive.handleVisibilityFailure({ kind: "interactive-tui", agentId: "peer" })).toEqual({
      visibility: "lost",
      providerSession: "lost",
      delivery: "frozen",
      recovery: "reattach-or-rotate",
    });
    expect(await interactive.deliveryStatus({ messageId: pending.messageId, agentId: "peer" })).toBe("delivery-pending");
    expect(fixture.provider.status("peer")).toMatchObject({ sessionRef: "codex-session-1", state: "lost" });
    expect(await fixture.chair.getAgentLifecycle({ agentId: "peer" })).toMatchObject({ lifecycle: "suspended" });
    await expect(fixture.peer.receiveMessages({ limit: 1, visibilityTimeoutMs: 30_000 })).rejects.toMatchObject({
      code: "CONTEXT_UNRECONCILED",
    });
    expect(await fixture.peer.getMailboxState()).toMatchObject({ contiguousWatermark: 0 });
  });
});

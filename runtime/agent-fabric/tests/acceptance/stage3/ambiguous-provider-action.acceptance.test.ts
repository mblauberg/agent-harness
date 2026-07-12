import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  asLifecycleClient,
  createLifecycleFixture,
  reopenLifecycleFabric,
} from "../../support/lifecycle-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("NFR-004/AC-011 Stage 3 durable provider actions", () => {
  it("runs a task-bound ephemeral provider spawn without creating an agent identity", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const reviewAuthority = await fixture.chair.delegateAuthority({
      parentAuthorityId: fixture.chairAuthorityId,
      authority: {
        ...fixture.rootAuthority,
        sourcePaths: ["src/leader"],
        actions: [...fixture.rootAuthority.actions],
        budget: { turns: 1, "cost:USD": 1 },
      },
      commandId: "provider-review:authority",
    });
    const before = await fixture.chair.getRunStatus({ runId: fixture.runId });
    const result = await fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-review:spawn",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Review the current implementation read-only.",
        cwd: "src/leader",
      },
      commandId: "provider-review:dispatch",
    });

    expect(result).toMatchObject({
      actionId: "provider-review:spawn",
      status: "terminal",
      executionCount: 1,
      effectCount: 1,
      result: { resumeReference: "new:replacement:g1", generation: 1, result: "fake provider review complete" },
      providerAnswer: "fake provider review complete",
    });
    expect((await fixture.chair.getRunStatus({ runId: fixture.runId })).counts.agents).toBe(before.counts.agents);
    expect(await fixture.chair.getProviderAction({ actionId: "provider-review:spawn" })).toEqual(result);

    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-review:missing-task",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Missing task must fail before provider dispatch.",
      },
      commandId: "provider-review:missing-task",
    })).rejects.toMatchObject({ code: "PROTOCOL_INVALID" });
  });

  it("recovers only a validated answer from terminal adapter evidence", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const reviewAuthority = await fixture.chair.delegateAuthority({
      parentAuthorityId: fixture.chairAuthorityId,
      authority: {
        ...fixture.rootAuthority,
        sourcePaths: ["src/leader"],
        actions: [...fixture.rootAuthority.actions],
        budget: { turns: 3, "cost:USD": 3 },
      },
      commandId: "provider-review-recovery:authority",
    });
    const dispatch = async (scenario: string) => await fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: `provider-review-recovery:${scenario}`,
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Review the current implementation read-only.",
        cwd: "src/leader",
        scenario,
      },
      commandId: `provider-review-recovery:${scenario}:dispatch`,
    });

    await expect(dispatch("ambiguous-review-valid")).rejects.toMatchObject({
      code: "LIFECYCLE_PRECONDITION_FAILED",
    });
    await expect(fixture.chair.reconcileProviderAction({
      actionId: "provider-review-recovery:ambiguous-review-valid",
      commandId: "provider-review-recovery:valid:reconcile",
    })).resolves.toMatchObject({
      status: "terminal",
      providerAnswer: "recovered provider review",
    });

    for (const scenario of ["ambiguous-review-empty", "ambiguous-review-oversized"] as const) {
      await expect(dispatch(scenario)).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
      await expect(fixture.chair.reconcileProviderAction({
        actionId: `provider-review-recovery:${scenario}`,
        commandId: `provider-review-recovery:${scenario}:reconcile`,
      })).resolves.toMatchObject({ status: "quarantined" });
      expect(await fixture.chair.getProviderAction({
        actionId: `provider-review-recovery:${scenario}`,
      })).toMatchObject({ status: "quarantined" });
    }
  });

  it("persists prepared, dispatched, accepted and terminal states across a core restart", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => rm(fixture.directory, { recursive: true, force: true }));
    const terminal = await fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "action-terminal",
      operation: "send_turn",
      payload: { scenario: "terminal", taskId: fixture.leaderTask.taskId },
      commandId: "provider-action:terminal:dispatch",
    });
    expect(terminal).toMatchObject({
      actionId: "action-terminal",
      status: "terminal",
      history: ["prepared", "dispatched", "accepted", "terminal"],
      executionCount: 1,
      effectCount: 1,
    });

    await fixture.fabric.close();
    const reopened = await reopenLifecycleFabric(fixture);
    cleanup.push(async () => reopened.close());
    const chair = asLifecycleClient(reopened.connect(fixture.capabilities.chair));
    expect(await chair.getProviderAction({ actionId: "action-terminal" })).toEqual(terminal);
  });

  it("quarantines ambiguity without replay when downstream idempotency is unproven", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const ambiguous = await fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "action-ambiguous-unproven",
      operation: "send_turn",
      payload: { scenario: "ambiguous-unproven", taskId: fixture.leaderTask.taskId },
      commandId: "provider-action:ambiguous-unproven:dispatch",
    });
    expect(ambiguous).toMatchObject({
      status: "ambiguous",
      history: ["prepared", "dispatched", "accepted", "ambiguous"],
      executionCount: 1,
      effectCount: 1,
    });

    const reconciled = await fixture.chair.reconcileProviderAction({
      actionId: ambiguous.actionId,
      commandId: "provider-action:ambiguous-unproven:reconcile",
    });
    expect(reconciled).toMatchObject({ status: "quarantined", executionCount: 1, effectCount: 1 });
    expect(await fixture.chair.getProviderAction({ actionId: ambiguous.actionId })).toEqual(reconciled);
  });

  it("replays only the same action ID when the adapter proves idempotency", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const ambiguous = await fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "action-ambiguous-idempotent",
      operation: "send_turn",
      payload: { scenario: "ambiguous-idempotent", taskId: fixture.leaderTask.taskId },
      commandId: "provider-action:ambiguous-idempotent:dispatch",
    });
    const reconciled = await fixture.chair.reconcileProviderAction({
      actionId: ambiguous.actionId,
      commandId: "provider-action:ambiguous-idempotent:reconcile",
    });

    expect(reconciled).toMatchObject({
      actionId: "action-ambiguous-idempotent",
      status: "terminal",
      executionCount: 2,
      effectCount: 1,
    });
    expect(reconciled.history).toContain("ambiguous");
    expect(reconciled.history.at(-1)).toBe("terminal");
  });

  it("does not replay an idempotent action after the target principal is revoked", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const ambiguous = await fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "action-revoked-before-replay",
      operation: "send_turn",
      payload: { scenario: "ambiguous-idempotent", taskId: fixture.leaderTask.taskId },
      commandId: "provider-action:revoked:dispatch",
    });
    await fixture.chair.revokeCapability({ agentId: "leader", commandId: "provider-action:revoke-leader" });

    await expect(fixture.chair.reconcileProviderAction({
      actionId: ambiguous.actionId,
      commandId: "provider-action:revoked:reconcile",
    })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("does not replay an idempotent action after the target principal expires", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const ambiguous = await fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "action-expired-before-replay",
      operation: "send_turn",
      payload: { scenario: "ambiguous-idempotent", taskId: fixture.leaderTask.taskId },
      commandId: "provider-action:expired:dispatch",
    });
    fixture.clock.advance(Date.parse("2100-01-01T00:00:00.000Z") - fixture.clock.now().getTime());

    await expect(fixture.chair.reconcileProviderAction({
      actionId: ambiguous.actionId,
      commandId: "provider-action:expired:reconcile",
    })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });
});

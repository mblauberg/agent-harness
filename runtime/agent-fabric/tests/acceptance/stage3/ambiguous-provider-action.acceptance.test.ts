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
  it("atomically spends one delegated turn across concurrent ephemeral provider spawns", async () => {
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
        budget: { turns: 1 },
      },
      commandId: "provider-review-concurrent:authority",
    });
    const dispatch = async (suffix: string) => await fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: `provider-review-concurrent:${suffix}`,
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Review the current implementation read-only.",
        cwd: "src/leader",
      },
      commandId: `provider-review-concurrent:${suffix}:dispatch`,
    });

    const outcomes = await Promise.allSettled([dispatch("one"), dispatch("two")]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { code: "BUDGET_EXCEEDED" } });
  });

  it("retains one turn reservation through restart and settles it from terminal lookup evidence", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => rm(fixture.directory, { recursive: true, force: true }));
    const reviewAuthority = await fixture.chair.delegateAuthority({
      parentAuthorityId: fixture.chairAuthorityId,
      authority: {
        ...fixture.rootAuthority,
        sourcePaths: ["src/leader"],
        actions: [...fixture.rootAuthority.actions],
        budget: { turns: 1 },
      },
      commandId: "provider-review-restart-budget:authority",
    });
    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-review-restart-budget:ambiguous",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Review the current implementation read-only.",
        cwd: "src/leader",
        scenario: "ambiguous-review-valid",
      },
      commandId: "provider-review-restart-budget:dispatch",
    })).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });

    await fixture.fabric.close();
    const reopened = await reopenLifecycleFabric(fixture);
    cleanup.push(async () => reopened.close());
    const chair = asLifecycleClient(reopened.connect(fixture.capabilities.chair));
    await expect(chair.reconcileProviderAction({
      actionId: "provider-review-restart-budget:ambiguous",
      commandId: "provider-review-restart-budget:reconcile",
    })).resolves.toMatchObject({ status: "terminal", providerAnswer: "recovered provider review" });
    await expect(chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-review-restart-budget:second",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "A spent turn cannot be reused.",
        cwd: "src/leader",
      },
      commandId: "provider-review-restart-budget:second:dispatch",
    })).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });

  it("rejects a requested turn ceiling that exceeds delegated capacity before provider work", async () => {
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
        budget: { turns: 1 },
      },
      commandId: "provider-review-exhausted:authority",
    });

    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-review-exhausted:spawn",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Two turns exceed this delegated review authority.",
        maxTurns: 2,
        cwd: "src/leader",
      },
      commandId: "provider-review-exhausted:dispatch",
    })).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    await expect(fixture.chair.getProviderAction({
      actionId: "provider-review-exhausted:spawn",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("freezes further turns when ambiguous provider usage cannot be validated", async () => {
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
        budget: { turns: 2 },
      },
      commandId: "provider-review-unknown:authority",
    });
    const action = "provider-review-unknown:ambiguous";
    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: action,
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "An invalid terminal answer leaves usage unprovable.",
        cwd: "src/leader",
        scenario: "ambiguous-review-empty",
      },
      commandId: "provider-review-unknown:dispatch",
    })).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
    await expect(fixture.chair.reconcileProviderAction({
      actionId: action,
      commandId: "provider-review-unknown:reconcile",
    })).resolves.toMatchObject({ status: "quarantined" });
    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-review-unknown:second",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Unknown usage must fail closed.",
        cwd: "src/leader",
      },
      commandId: "provider-review-unknown:second:dispatch",
    })).rejects.toMatchObject({ code: "BUDGET_USAGE_UNKNOWN" });
  });

  it("rejects an explicitly named terminal task before ephemeral provider I/O", async () => {
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
        budget: { turns: 1 },
      },
      commandId: "provider-review-terminal-task:authority",
    });
    await fixture.leader.updateTask({
      taskId: fixture.leaderTask.taskId,
      expectedRevision: fixture.leaderTask.revision,
      state: "complete",
      commandId: "provider-review-terminal-task:complete",
    });

    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-review-terminal-task:spawn",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "This terminal task must not start provider work.",
        cwd: "src/leader",
      },
      commandId: "provider-review-terminal-task:dispatch",
    })).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
    await expect(fixture.chair.getProviderAction({
      actionId: "provider-review-terminal-task:spawn",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

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
      commandId: "provider-review:dispatch-replay",
    })).resolves.toEqual(result);

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
    const dispatch = async (scenario: string, authorityId = reviewAuthority.authorityId) => await fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: `provider-review-recovery:${scenario}`,
      operation: "spawn",
      authorityId,
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
      const invalidAuthority = await fixture.chair.delegateAuthority({
        parentAuthorityId: fixture.chairAuthorityId,
        authority: {
          ...fixture.rootAuthority,
          sourcePaths: ["src/leader"],
          actions: [...fixture.rootAuthority.actions],
          budget: { turns: 1 },
        },
        commandId: `provider-review-recovery:${scenario}:authority`,
      });
      await expect(dispatch(scenario, invalidAuthority.authorityId)).rejects.toMatchObject({
        code: "LIFECYCLE_PRECONDITION_FAILED",
      });
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

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

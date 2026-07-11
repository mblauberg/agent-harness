import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createStage5RecoveryFixture, createTeamA } from "../../support/stage5-recovery-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("Stage 5 inherited budget reconciliation", () => {
  it("freezes unknown hard usage and blocks reuse until the chair reconciles it", async () => {
    const fixture = await createStage5RecoveryFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const team = await createTeamA(fixture);
    const child = await fixture.leaderA.reserveBudget({
      teamId: team.teamId,
      expectedTeamGeneration: team.generation,
      parentBudgetId: team.budgetId,
      budgetId: "worker-budget-unknown",
      dimensions: { turns: 6 },
      commandId: "stage5:budget:reserve:unknown",
    });
    await fixture.leaderA.recordBudgetUsage({
      budgetId: child.budgetId,
      usage: { turns: null },
      commandId: "stage5:budget:usage:unknown",
    });
    const frozen = await fixture.leaderA.releaseBudget({
      budgetId: child.budgetId,
      commandId: "stage5:budget:release:unknown",
    });
    expect(frozen).toMatchObject({
      state: "usage-unknown",
      returned: {},
      dimensions: { turns: { granted: 6, usageUnknown: true } },
    });
    await expect(
      fixture.leaderA.reserveBudget({
        teamId: team.teamId,
        expectedTeamGeneration: team.generation,
        parentBudgetId: team.budgetId,
        budgetId: "worker-budget-reuse-blocked",
        dimensions: { turns: 5 },
        commandId: "stage5:budget:reserve:blocked",
      }),
    ).rejects.toMatchObject({ code: "BUDGET_USAGE_UNKNOWN" });

    await fixture.chair.reconcileBudgetUsage({
      budgetId: child.budgetId,
      consumed: { turns: 2 },
      commandId: "stage5:budget:reconcile:chair",
    });
    const released = await fixture.leaderA.releaseBudget({
      budgetId: child.budgetId,
      commandId: "stage5:budget:release:reconciled",
    });
    expect(released).toMatchObject({ state: "released", returned: { turns: 4 } });
  });

  it("makes release idempotent and never restores more than the original grant", async () => {
    const fixture = await createStage5RecoveryFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const team = await createTeamA(fixture);
    const child = await fixture.leaderA.reserveBudget({
      teamId: team.teamId,
      expectedTeamGeneration: team.generation,
      parentBudgetId: team.budgetId,
      budgetId: "worker-budget-idempotent",
      dimensions: { turns: 6 },
      commandId: "stage5:budget:reserve:idempotent",
    });
    await fixture.leaderA.recordBudgetUsage({
      budgetId: child.budgetId,
      usage: { turns: 2 },
      commandId: "stage5:budget:usage:known",
    });
    const first = await fixture.leaderA.releaseBudget({
      budgetId: child.budgetId,
      commandId: "stage5:budget:release:idempotent",
    });
    const retry = await fixture.leaderA.releaseBudget({
      budgetId: child.budgetId,
      commandId: "stage5:budget:release:idempotent",
    });
    expect(retry).toEqual(first);
    expect(await fixture.chair.getBudget({ budgetId: team.budgetId })).toMatchObject({
      dimensions: {
        turns: { granted: 10, reserved: 0, consumed: 2, available: 8, usageUnknown: false },
      },
    });
  });

  it("rejects a lower cumulative usage report from the budget owner", async () => {
    const fixture = await createStage5RecoveryFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const team = await createTeamA(fixture);
    const child = await fixture.leaderA.reserveBudget({
      teamId: team.teamId,
      expectedTeamGeneration: team.generation,
      parentBudgetId: team.budgetId,
      budgetId: "worker-budget-monotonic",
      dimensions: { turns: 6 },
      commandId: "stage5:budget:reserve:monotonic",
    });
    await fixture.leaderA.recordBudgetUsage({
      budgetId: child.budgetId,
      usage: { turns: 5 },
      commandId: "stage5:budget:usage:five",
    });
    await expect(fixture.leaderA.recordBudgetUsage({
      budgetId: child.budgetId,
      usage: { turns: 1 },
      commandId: "stage5:budget:usage:rewind",
    })).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    const released = await fixture.leaderA.releaseBudget({
      budgetId: child.budgetId,
      commandId: "stage5:budget:release:monotonic",
    });
    expect(released).toMatchObject({ state: "released", returned: { turns: 1 } });
    expect(await fixture.chair.getBudget({ budgetId: team.budgetId })).toMatchObject({
      dimensions: { turns: { consumed: 5, available: 5 } },
    });
  });

  it("keeps the parent frozen until every unknown child dimension is reconciled", async () => {
    const fixture = await createStage5RecoveryFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const team = await createTeamA(fixture);
    for (const budgetId of ["worker-budget-unknown-a", "worker-budget-unknown-b"]) {
      await fixture.leaderA.reserveBudget({
        teamId: team.teamId,
        expectedTeamGeneration: team.generation,
        parentBudgetId: team.budgetId,
        budgetId,
        dimensions: { turns: 3 },
        commandId: `stage5:budget:reserve:${budgetId}`,
      });
    }
    for (const budgetId of ["worker-budget-unknown-a", "worker-budget-unknown-b"]) {
      await fixture.leaderA.recordBudgetUsage({
        budgetId,
        usage: { turns: null },
        commandId: `stage5:budget:usage:${budgetId}`,
      });
    }

    await fixture.chair.reconcileBudgetUsage({
      budgetId: "worker-budget-unknown-a",
      consumed: { turns: 1 },
      commandId: "stage5:budget:reconcile:unknown-a",
    });
    expect(await fixture.chair.getBudget({ budgetId: team.budgetId })).toMatchObject({
      state: "usage-unknown",
      dimensions: { turns: { usageUnknown: true } },
    });
    await expect(fixture.leaderA.reserveBudget({
      teamId: team.teamId,
      expectedTeamGeneration: team.generation,
      parentBudgetId: team.budgetId,
      budgetId: "worker-budget-still-frozen",
      dimensions: { turns: 1 },
      commandId: "stage5:budget:reserve:still-frozen",
    })).rejects.toMatchObject({ code: "BUDGET_USAGE_UNKNOWN" });

    await fixture.chair.reconcileBudgetUsage({
      budgetId: "worker-budget-unknown-b",
      consumed: { turns: 1 },
      commandId: "stage5:budget:reconcile:unknown-b",
    });
    expect(await fixture.chair.getBudget({ budgetId: team.budgetId })).toMatchObject({
      state: "active",
      dimensions: { turns: { usageUnknown: false } },
    });
  });
});

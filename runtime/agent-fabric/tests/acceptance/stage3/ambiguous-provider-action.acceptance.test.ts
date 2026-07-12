import { readFile, rm } from "node:fs/promises";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { FabricClient } from "../../../src/index.ts";

import {
  asLifecycleClient,
  createLifecycleFixture,
  reopenLifecycleFabric,
} from "../../support/lifecycle-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

type ObservedProviderAction = Awaited<ReturnType<FabricClient["getProviderAction"]>>;

async function waitForProviderAction(
  client: FabricClient,
  actionId: string,
): Promise<ObservedProviderAction> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const action = await client.getProviderAction({ actionId });
    if (["terminal", "ambiguous", "quarantined"].includes(action.status)) return action;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error(`provider action did not settle: ${actionId}`);
}

function authorityBudget(
  databasePath: string,
  authorityId: string,
): Record<string, { granted: number; reserved: number; consumed: number; usageUnknown: boolean }> {
  const database = new Database(databasePath, { readonly: true });
  try {
    return Object.fromEntries(database.prepare(`
      SELECT unit_key,granted,reserved,consumed,usage_unknown
        FROM authority_budget WHERE authority_id=? ORDER BY unit_key
    `).all(authorityId).map((value) => {
      const row = value as {
        unit_key: string;
        granted: number;
        reserved: number;
        consumed: number;
        usage_unknown: number;
      };
      return [row.unit_key, {
        granted: row.granted,
        reserved: row.reserved,
        consumed: row.consumed,
        usageUnknown: row.usage_unknown === 1,
      }];
    }));
  } finally {
    database.close();
  }
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("NFR-004/AC-011 Stage 3 durable provider actions", () => {
  it("rejects provider authority without a positive hard turns ceiling before provider I/O", async () => {
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
        budget: {
          provider_calls: 1,
          "cost:USD": 10,
          "input_tokens:fake": 10,
          "output_tokens:fake": 10,
        },
      },
      commandId: "provider-review-no-turns:authority",
    });
    const actionId = "provider-review-no-turns:spawn";

    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId,
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Hard turns capacity is mandatory.",
        cwd: "src/leader",
      },
      commandId: "provider-review-no-turns:dispatch",
    })).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    await expect(fixture.chair.getProviderAction({ actionId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reserves and exactly settles every configured provider budget dimension", async () => {
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
        budget: {
          turns: 2,
          provider_calls: 2,
          concurrent_turns: 1,
          wall_clock_milliseconds: 1_000,
          "cost:USD": 10,
          "input_tokens:fake": 10,
          "output_tokens:fake": 10,
          descendants: 1,
          message_bytes: 128,
          artifact_bytes: 128,
        },
      },
      commandId: "provider-review-vector:authority",
    });

    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-review-vector:spawn",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Return exact bounded usage.",
        cwd: "src/leader",
        scenario: "terminal-exact-usage",
      },
      commandId: "provider-review-vector:dispatch",
    })).resolves.toMatchObject({ status: "prepared", effectCount: 0 });
    await expect(waitForProviderAction(fixture.chair, "provider-review-vector:spawn"))
      .resolves.toMatchObject({ status: "terminal", providerAnswer: "fake provider review complete" });

    expect(authorityBudget(fixture.databasePath, reviewAuthority.authorityId)).toMatchObject({
      turns: { granted: 2, reserved: 0, consumed: 1, usageUnknown: false },
      provider_calls: { granted: 2, reserved: 0, consumed: 1, usageUnknown: false },
      concurrent_turns: { granted: 1, reserved: 0, consumed: 0, usageUnknown: false },
      wall_clock_milliseconds: { granted: 1_000, reserved: 0, consumed: 0, usageUnknown: false },
      "cost:USD": { granted: 10, reserved: 0, consumed: 5, usageUnknown: false },
      "input_tokens:fake": { granted: 10, reserved: 0, consumed: 3, usageUnknown: false },
      "output_tokens:fake": { granted: 10, reserved: 0, consumed: 4, usageUnknown: false },
      descendants: { granted: 1, reserved: 0, consumed: 0, usageUnknown: false },
      message_bytes: { granted: 128, reserved: 0, consumed: 0, usageUnknown: false },
      artifact_bytes: { granted: 128, reserved: 0, consumed: 0, usageUnknown: false },
    });
  });

  it("settles the provider-reported turns and releases an unused multi-turn reservation", async () => {
    const fixture = await createLifecycleFixture({ payloadMaxTurns: true });
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
      commandId: "provider-review-partial-turns:authority",
    });

    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-review-partial-turns:first",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Use one turn within a two-turn ceiling.",
        maxTurns: 2,
        cwd: "src/leader",
        scenario: "terminal-partial-turn-usage",
      },
      commandId: "provider-review-partial-turns:first:dispatch",
    })).resolves.toMatchObject({ status: "prepared" });
    await expect(waitForProviderAction(fixture.chair, "provider-review-partial-turns:first"))
      .resolves.toMatchObject({ status: "terminal" });

    expect(authorityBudget(fixture.databasePath, reviewAuthority.authorityId)).toMatchObject({
      turns: { granted: 2, reserved: 0, consumed: 1, usageUnknown: false },
    });
    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-review-partial-turns:second",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Use the released turn.",
        maxTurns: 1,
        cwd: "src/leader",
        scenario: "terminal-partial-turn-usage",
      },
      commandId: "provider-review-partial-turns:second:dispatch",
    })).resolves.toMatchObject({ status: "prepared" });
    await expect(waitForProviderAction(fixture.chair, "provider-review-partial-turns:second"))
      .resolves.toMatchObject({ status: "terminal" });
  });

  it("keeps an unreported multi-turn usage reservation unknown", async () => {
    const fixture = await createLifecycleFixture({ payloadMaxTurns: true });
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
      commandId: "provider-review-missing-turns:authority",
    });

    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-review-missing-turns:spawn",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Omit actual multi-turn usage.",
        maxTurns: 2,
        cwd: "src/leader",
      },
      commandId: "provider-review-missing-turns:dispatch",
    })).resolves.toMatchObject({ status: "prepared" });
    await expect(waitForProviderAction(fixture.chair, "provider-review-missing-turns:spawn"))
      .resolves.toMatchObject({ status: "terminal" });
    expect(authorityBudget(fixture.databasePath, reviewAuthority.authorityId)).toMatchObject({
      turns: { granted: 2, reserved: 2, consumed: 0, usageUnknown: true },
    });
  });

  it.each(["terminal-malformed-turn-usage", "terminal-over-turn-usage"] as const)(
    "quarantines %s against the admitted multi-turn ceiling",
    async (scenario) => {
      const fixture = await createLifecycleFixture({ payloadMaxTurns: true });
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
        commandId: `provider-review-invalid-turns:${scenario}:authority`,
      });
      const actionId = `provider-review-invalid-turns:${scenario}:spawn`;

      await expect(fixture.chair.dispatchProviderAction({
        adapterId: "fake-lifecycle",
        actionId,
        operation: "spawn",
        authorityId: reviewAuthority.authorityId,
        payload: {
          taskId: fixture.leaderTask.taskId,
          model: "fake-reviewer-v1",
          modelFamily: "fake",
          prompt: "Return invalid actual turn usage.",
          maxTurns: 2,
          cwd: "src/leader",
          scenario,
        },
        commandId: `provider-review-invalid-turns:${scenario}:dispatch`,
      })).resolves.toMatchObject({ status: "prepared" });
      await expect(waitForProviderAction(fixture.chair, actionId)).resolves.toMatchObject({ status: "ambiguous" });
      await expect(fixture.chair.reconcileProviderAction({
        actionId,
        commandId: `provider-review-invalid-turns:${scenario}:reconcile`,
      })).resolves.toMatchObject({ status: "quarantined" });
      expect(authorityBudget(fixture.databasePath, reviewAuthority.authorityId)).toMatchObject({
        turns: { granted: 2, reserved: 2, consumed: 0, usageUnknown: true },
      });
    },
  );

  it.each([
    "terminal-unreserved-usage",
    "terminal-over-cap-usage",
    "terminal-malformed-usage",
  ] as const)("quarantines %s before accepting terminal settlement", async (scenario) => {
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
        budget: { turns: 1, "cost:USD": 10 },
      },
      commandId: `provider-review-invalid-usage:${scenario}:authority`,
    });
    const actionId = `provider-review-invalid-usage:${scenario}:spawn`;

    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId,
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Return an invalid usage vector.",
        cwd: "src/leader",
        scenario,
      },
      commandId: `provider-review-invalid-usage:${scenario}:dispatch`,
    })).resolves.toMatchObject({ status: "prepared" });
    await expect(waitForProviderAction(fixture.chair, actionId)).resolves.toMatchObject({ status: "ambiguous" });
    await expect(fixture.chair.reconcileProviderAction({
      actionId,
      commandId: `provider-review-invalid-usage:${scenario}:reconcile`,
    })).resolves.toMatchObject({ status: "quarantined", executionCount: 1 });
    expect(authorityBudget(fixture.databasePath, reviewAuthority.authorityId)).toMatchObject({
      turns: { reserved: 1, consumed: 0, usageUnknown: true },
    });
  });

  it("rejects adapter-mandatory usage dimensions before provider I/O", async () => {
    const fixture = await createLifecycleFixture({ mandatoryUsageUnits: true });
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
      commandId: "provider-review-mandatory-usage:authority",
    });
    const actionId = "provider-review-mandatory-usage:spawn";

    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId,
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Do not run without mandatory usage capacity.",
        cwd: "src/leader",
      },
      commandId: "provider-review-mandatory-usage:dispatch",
    })).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    await expect(fixture.chair.getProviderAction({ actionId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reconciles late exact usage without replaying the provider effect", async () => {
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
        budget: {
          turns: 1,
          provider_calls: 1,
          "cost:USD": 10,
          "input_tokens:fake": 10,
          "output_tokens:fake": 10,
        },
      },
      commandId: "provider-review-late-usage:authority",
    });
    const actionId = "provider-review-late-usage:spawn";
    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId,
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Return usage through durable lookup.",
        cwd: "src/leader",
        scenario: "ambiguous-review-usage-late",
      },
      commandId: "provider-review-late-usage:dispatch",
    })).resolves.toMatchObject({ status: "prepared" });
    await expect(waitForProviderAction(fixture.chair, actionId)).resolves.toMatchObject({ status: "ambiguous" });
    await expect(fixture.chair.reconcileProviderAction({
      actionId,
      commandId: "provider-review-late-usage:reconcile-1",
    })).resolves.toMatchObject({
      status: "terminal",
      providerAnswer: "recovered provider review with late usage",
    });
    expect(authorityBudget(fixture.databasePath, reviewAuthority.authorityId)).toMatchObject({
      turns: { reserved: 0, consumed: 1, usageUnknown: false },
      provider_calls: { reserved: 0, consumed: 1, usageUnknown: false },
      "cost:USD": { reserved: 10, consumed: 0, usageUnknown: true },
      "input_tokens:fake": { reserved: 10, consumed: 0, usageUnknown: true },
      "output_tokens:fake": { reserved: 10, consumed: 0, usageUnknown: true },
    });

    await expect(fixture.chair.reconcileProviderAction({
      actionId,
      commandId: "provider-review-late-usage:reconcile-2",
    })).resolves.toMatchObject({ status: "terminal", executionCount: 1, effectCount: 1 });
    expect(authorityBudget(fixture.databasePath, reviewAuthority.authorityId)).toMatchObject({
      "cost:USD": { reserved: 0, consumed: 5, usageUnknown: false },
      "input_tokens:fake": { reserved: 0, consumed: 3, usageUnknown: false },
      "output_tokens:fake": { reserved: 0, consumed: 4, usageUnknown: false },
    });
  });

  it("rechecks task state atomically after adapter capabilities before provider dispatch", async () => {
    const fixture = await createLifecycleFixture({ capabilitiesDelayMs: 100 });
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
      commandId: "provider-review-task-race:authority",
    });
    const dispatch = fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-review-task-race:spawn",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Do not start after task completion.",
        cwd: "src/leader",
      },
      commandId: "provider-review-task-race:dispatch",
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    await fixture.leader.updateTask({
      taskId: fixture.leaderTask.taskId,
      expectedRevision: fixture.leaderTask.revision,
      state: "complete",
      commandId: "provider-review-task-race:complete",
    });

    await expect(dispatch).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
    await expect(fixture.chair.getProviderAction({
      actionId: "provider-review-task-race:spawn",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([
    ["gate", "GATE_BLOCKED"],
    ["quiesce", "LIFECYCLE_PRECONDITION_FAILED"],
    ["authority-expiry", "AUTHENTICATION_FAILED"],
    ["chair-handoff", "CAPABILITY_FORBIDDEN"],
  ] as const)("rechecks %s after delayed capabilities before provider dispatch", async (scenario, code) => {
    const fixture = await createLifecycleFixture({ capabilitiesDelayMs: 200 });
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const reviewAuthority = await fixture.chair.delegateAuthority({
      parentAuthorityId: fixture.chairAuthorityId,
      authority: {
        ...fixture.rootAuthority,
        ...(scenario === "authority-expiry"
          ? { expiresAt: new Date(fixture.clock.now().getTime() + 100).toISOString() }
          : {}),
        sourcePaths: ["src/leader"],
        actions: [...fixture.rootAuthority.actions],
        budget: { turns: 1 },
      },
      commandId: `provider-review-admission-race:${scenario}:authority`,
    });
    const actionId = `provider-review-admission-race:${scenario}:spawn`;
    const dispatch = fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId,
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Do not start after admission changes.",
        cwd: "src/leader",
      },
      commandId: `provider-review-admission-race:${scenario}:dispatch`,
    });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));

    if (scenario === "authority-expiry") {
      fixture.clock.advance(200);
    } else {
      const database = new Database(fixture.databasePath);
      try {
        if (scenario === "quiesce") {
          database.prepare(`
            UPDATE runs SET lifecycle_state='quiescing',revision=revision+1 WHERE run_id=?
          `).run(fixture.runId);
        } else if (scenario === "chair-handoff") {
          database.prepare(`
            UPDATE runs SET chair_agent_id='leader',revision=revision+1 WHERE run_id=?
          `).run(fixture.runId);
        } else {
          const identity = database.prepare(`
            SELECT project_session_id,dependency_revision FROM runs WHERE run_id=?
          `).get(fixture.runId) as { project_session_id: string; dependency_revision: number };
          database.prepare(`
            INSERT INTO scoped_gates(
              gate_id,project_session_id,coordination_run_id,dedupe_key,scope_kind,
              scope_task_id,dependency_revision,blocked_operation_ids_json,
              enforcement_points_json,question,reason,options_json,recommendation,
              consequences_json,evidence_refs_json,created_by_ref,expected_approver_ref,
              status,human_required,revision,created_at,updated_at
            ) VALUES (?,?,?,'provider-review-admission-race','task',?,?,
                      '["fabric.v1.provider-action.dispatch"]','["operation"]','Proceed?',
                      'Admission changed','["approve","defer"]','defer','[]','[]',
                      'agent:chair','authenticated-human-operator','pending',1,1,1,1)
          `).run(
            `gate-provider-review-admission-race`,
            identity.project_session_id,
            fixture.runId,
            fixture.leaderTask.taskId,
            identity.dependency_revision,
          );
          database.prepare(`
            INSERT INTO scoped_gate_tasks(
              gate_id,project_session_id,run_id,task_id,binding_kind,bound_dependency_revision
            ) VALUES ('gate-provider-review-admission-race',?,?,?,'direct',?)
          `).run(
            identity.project_session_id,
            fixture.runId,
            fixture.leaderTask.taskId,
            identity.dependency_revision,
          );
          database.prepare(`
            INSERT INTO scoped_gate_operations(gate_id,operation_id)
            VALUES ('gate-provider-review-admission-race','fabric.v1.provider-action.dispatch')
          `).run();
        }
      } finally {
        database.close();
      }
    }

    await expect(dispatch).rejects.toMatchObject({ code });
    const verification = new Database(fixture.databasePath, { readonly: true });
    try {
      expect(verification.prepare(`
        SELECT 1 FROM provider_actions WHERE run_id=? AND action_id=?
      `).get(fixture.runId, actionId)).toBeUndefined();
    } finally {
      verification.close();
    }
  });

  it("fences delayed provider admission before closing Fabric", async () => {
    const fixture = await createLifecycleFixture({ capabilitiesDelayMs: 200 });
    cleanup.push(async () => rm(fixture.directory, { recursive: true, force: true }));
    const reviewAuthority = await fixture.chair.delegateAuthority({
      parentAuthorityId: fixture.chairAuthorityId,
      authority: {
        ...fixture.rootAuthority,
        sourcePaths: ["src/leader"],
        actions: [...fixture.rootAuthority.actions],
        budget: { turns: 1 },
      },
      commandId: "provider-review-close-race:authority",
    });
    const actionId = "provider-review-close-race:spawn";
    const dispatch = fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId,
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Do not start while Fabric closes.",
        cwd: "src/leader",
      },
      commandId: "provider-review-close-race:dispatch",
    });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    const close = fixture.fabric.close();

    await expect(dispatch).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
    await close;
    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      expect(database.prepare(`SELECT 1 FROM provider_actions WHERE action_id=?`).get(actionId)).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("blocks task terminalisation while its provider action remains unresolved", async () => {
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
      commandId: "provider-review-task-obligation:authority",
    });
    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-review-task-obligation:spawn",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Remain unresolved until lookup.",
        cwd: "src/leader",
        scenario: "ambiguous-review-valid",
      },
      commandId: "provider-review-task-obligation:dispatch",
    })).resolves.toMatchObject({ status: "prepared" });
    await expect(waitForProviderAction(fixture.chair, "provider-review-task-obligation:spawn"))
      .resolves.toMatchObject({ status: "ambiguous" });
    await expect(fixture.leader.updateTask({
      taskId: fixture.leaderTask.taskId,
      expectedRevision: fixture.leaderTask.revision,
      state: "complete",
      commandId: "provider-review-task-obligation:complete-early",
    })).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
    await fixture.chair.reconcileProviderAction({
      actionId: "provider-review-task-obligation:spawn",
      commandId: "provider-review-task-obligation:reconcile",
    });
    await expect(fixture.leader.updateTask({
      taskId: fixture.leaderTask.taskId,
      expectedRevision: fixture.leaderTask.revision,
      state: "complete",
      commandId: "provider-review-task-obligation:complete",
    })).resolves.toMatchObject({ state: "complete" });
  });
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

  it("queues answer-bearing work within the shared provider-turn ceiling", async () => {
    const fixture = await createLifecycleFixture({
      maximumConcurrentProviderTurns: 1,
      spawnDelayMs: 250,
    });
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
      commandId: "provider-review-queue:authority",
    });
    const dispatch = async (suffix: string) => await fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: `provider-review-queue:${suffix}`,
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: `Queued review ${suffix}.`,
        cwd: "src/leader",
      },
      commandId: `provider-review-queue:${suffix}:dispatch`,
    });

    await expect(dispatch("one")).resolves.toMatchObject({ status: "prepared", executionCount: 0 });
    await expect(dispatch("two")).resolves.toMatchObject({ status: "prepared", executionCount: 0 });
    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      expect(database.prepare(`
        SELECT action_id,status FROM provider_actions
         WHERE action_id IN ('provider-review-queue:one','provider-review-queue:two')
         ORDER BY action_id
      `).all()).toEqual([
        { action_id: "provider-review-queue:one", status: "dispatched" },
        { action_id: "provider-review-queue:two", status: "prepared" },
      ]);
    } finally {
      database.close();
    }
    await expect(fixture.leader.updateTask({
      taskId: fixture.leaderTask.taskId,
      expectedRevision: fixture.leaderTask.revision,
      state: "complete",
      commandId: "provider-review-queue:complete-early",
    })).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });

    await expect(waitForProviderAction(fixture.chair, "provider-review-queue:one"))
      .resolves.toMatchObject({ status: "terminal", executionCount: 1 });
    await expect(waitForProviderAction(fixture.chair, "provider-review-queue:two"))
      .resolves.toMatchObject({ status: "terminal", executionCount: 1 });
  });

  it("keeps ambiguous answer-bearing work inside the shared provider-turn ceiling", async () => {
    const fixture = await createLifecycleFixture({ maximumConcurrentProviderTurns: 1 });
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
      commandId: "provider-review-ambiguous-cap:authority",
    });
    const secondAuthority = await fixture.chair.delegateAuthority({
      parentAuthorityId: fixture.chairAuthorityId,
      authority: {
        ...fixture.rootAuthority,
        sourcePaths: ["src/leader"],
        actions: [...fixture.rootAuthority.actions],
        budget: { turns: 1 },
      },
      commandId: "provider-review-ambiguous-cap:second-authority",
    });
    const dispatch = async (suffix: string, authorityId: string, scenario?: string) => await fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: `provider-review-ambiguous-cap:${suffix}`,
      operation: "spawn",
      authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: `Ambiguous capacity review ${suffix}.`,
        cwd: "src/leader",
        ...(scenario === undefined ? {} : { scenario }),
      },
      commandId: `provider-review-ambiguous-cap:${suffix}:dispatch`,
    });

    await expect(dispatch("one", reviewAuthority.authorityId, "ambiguous-review-valid"))
      .resolves.toMatchObject({ status: "prepared" });
    await expect(waitForProviderAction(fixture.chair, "provider-review-ambiguous-cap:one"))
      .resolves.toMatchObject({ status: "ambiguous" });
    await expect(dispatch("two", secondAuthority.authorityId)).resolves.toMatchObject({ status: "prepared" });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
    await expect(fixture.chair.getProviderAction({ actionId: "provider-review-ambiguous-cap:two" }))
      .resolves.toMatchObject({ status: "prepared", executionCount: 0 });

    await expect(fixture.chair.reconcileProviderAction({
      actionId: "provider-review-ambiguous-cap:one",
      commandId: "provider-review-ambiguous-cap:one:reconcile",
    })).resolves.toMatchObject({ status: "terminal" });
    await expect(waitForProviderAction(fixture.chair, "provider-review-ambiguous-cap:two"))
      .resolves.toMatchObject({ status: "terminal" });
  });

  it.each(["ambiguous", "quarantined"] as const)(
    "closes around a %s capacity holder without executing durable queued work",
    async (holderStatus) => {
      const fixture = await createLifecycleFixture({
        maximumConcurrentProviderTurns: 2,
        spawnDelayMs: 500,
      });
      let closed = false;
      cleanup.push(async () => {
        if (!closed) await fixture.fabric.close();
        await rm(fixture.directory, { recursive: true, force: true });
      });
      const delegateReviewAuthority = async (suffix: string) => await fixture.chair.delegateAuthority({
        parentAuthorityId: fixture.chairAuthorityId,
        authority: {
          ...fixture.rootAuthority,
          sourcePaths: ["src/leader"],
          actions: [...fixture.rootAuthority.actions],
          budget: { turns: 1 },
        },
        commandId: `provider-review-close-queue:${holderStatus}:${suffix}:authority`,
      });
      const [holderAuthority, claimedAuthority, queuedAuthority] = await Promise.all([
        delegateReviewAuthority("holder"),
        delegateReviewAuthority("claimed"),
        delegateReviewAuthority("queued"),
      ]);
      const actionId = (suffix: string): string =>
        `provider-review-close-queue:${holderStatus}:${suffix}`;
      const dispatch = async (
        suffix: string,
        authorityId: string,
        scenario?: string,
      ) => await fixture.chair.dispatchProviderAction({
        adapterId: "fake-lifecycle",
        actionId: actionId(suffix),
        operation: "spawn",
        authorityId,
        payload: {
          taskId: fixture.leaderTask.taskId,
          model: "fake-reviewer-v1",
          modelFamily: "fake",
          prompt: `Close queue review ${suffix}.`,
          cwd: "src/leader",
          ...(scenario === undefined ? {} : { scenario }),
        },
        commandId: `${actionId(suffix)}:dispatch`,
      });

      await expect(dispatch(
        "holder",
        holderAuthority.authorityId,
        holderStatus === "ambiguous" ? "ambiguous-review-valid" : "ambiguous-review-empty",
      )).resolves.toMatchObject({ status: "prepared" });
      await expect(waitForProviderAction(fixture.chair, actionId("holder")))
        .resolves.toMatchObject({ status: "ambiguous" });
      if (holderStatus === "quarantined") {
        await expect(fixture.chair.reconcileProviderAction({
          actionId: actionId("holder"),
          commandId: `${actionId("holder")}:reconcile`,
        })).resolves.toMatchObject({ status: "quarantined" });
      }

      await expect(dispatch("claimed", claimedAuthority.authorityId))
        .resolves.toMatchObject({ status: "prepared" });
      await expect(dispatch("queued", queuedAuthority.authorityId))
        .resolves.toMatchObject({ status: "prepared" });
      await expect(fixture.chair.getProviderAction({ actionId: actionId("claimed") }))
        .resolves.toMatchObject({ status: "dispatched", executionCount: 1 });
      await expect(fixture.chair.getProviderAction({ actionId: actionId("queued") }))
        .resolves.toMatchObject({ status: "prepared", executionCount: 0 });

      const closing = fixture.fabric.close();
      let rescueTimer: ReturnType<typeof setTimeout> | undefined;
      const rescued = new Promise<"rescued">((resolvePromise, rejectPromise) => {
        rescueTimer = setTimeout(() => {
          try {
            const database = new Database(fixture.databasePath);
            try {
              database.prepare(`
                UPDATE provider_actions
                   SET status='terminal',history_json='["prepared","dispatched","terminal"]',
                       updated_at=?
                 WHERE run_id=? AND action_id=?
              `).run(fixture.clock.now().getTime(), fixture.runId, actionId("holder"));
            } finally {
              database.close();
            }
          } catch (error: unknown) {
            rejectPromise(error);
            return;
          }
          void closing.then(() => resolvePromise("rescued"), rejectPromise);
        }, 2_000);
      });
      const closeOutcome = await Promise.race([
        closing.then(() => "closed" as const),
        rescued,
      ]);
      if (rescueTimer !== undefined) clearTimeout(rescueTimer);
      closed = true;

      expect(closeOutcome).toBe("closed");
      const database = new Database(fixture.databasePath, { readonly: true });
      try {
        expect(database.prepare(`
          SELECT action_id,status,execution_count,effect_count
            FROM provider_actions
           WHERE action_id IN (?,?,?)
           ORDER BY action_id
        `).all(actionId("claimed"), actionId("holder"), actionId("queued"))).toEqual([
          {
            action_id: actionId("claimed"),
            status: "terminal",
            execution_count: 1,
            effect_count: 1,
          },
          {
            action_id: actionId("holder"),
            status: holderStatus,
            execution_count: 1,
            effect_count: 0,
          },
          {
            action_id: actionId("queued"),
            status: "prepared",
            execution_count: 0,
            effect_count: 0,
          },
        ]);
      } finally {
        database.close();
      }
    },
    10_000,
  );

  it("wakes queued review work after out-of-band turn-lease release", async () => {
    const fixture = await createLifecycleFixture({ maximumConcurrentProviderTurns: 1 });
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const now = fixture.clock.now().getTime();
    const database = new Database(fixture.databasePath);
    try {
      database.exec(`
        INSERT INTO provider_actions(
          run_id,action_id,adapter_id,operation,target_agent_id,
          provider_session_generation,turn_lease_generation,identity_hash,
          payload_hash,payload_json,status,history_json,execution_count,
          effect_count,idempotency_proven,updated_at
        ) VALUES (
          '${fixture.runId}','provider-review-capacity-sentinel','fake-lifecycle','send_turn','leader',
          1,1,'${"a".repeat(64)}','${"b".repeat(64)}','{"taskId":"${fixture.leaderTask.taskId}"}',
          'dispatched','["prepared","dispatched"]',1,0,0,${now}
        );
        INSERT INTO provider_session_turn_leases(
          run_id,agent_id,provider_session_generation,turn_lease_generation,
          action_id,status,created_at,updated_at
        ) VALUES (
          '${fixture.runId}','leader',1,1,'provider-review-capacity-sentinel','active',${now},${now}
        );
      `);
    } finally {
      database.close();
    }
    const reviewAuthority = await fixture.chair.delegateAuthority({
      parentAuthorityId: fixture.chairAuthorityId,
      authority: {
        ...fixture.rootAuthority,
        sourcePaths: ["src/leader"],
        actions: [...fixture.rootAuthority.actions],
        budget: { turns: 1 },
      },
      commandId: "provider-review-external-capacity:authority",
    });
    const actionId = "provider-review-external-capacity:spawn";
    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId,
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Start after external turn capacity is released.",
        cwd: "src/leader",
      },
      commandId: "provider-review-external-capacity:dispatch",
    })).resolves.toMatchObject({ status: "prepared" });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
    await expect(fixture.chair.getProviderAction({ actionId }))
      .resolves.toMatchObject({ status: "prepared", executionCount: 0 });

    const release = new Database(fixture.databasePath);
    try {
      release.transaction(() => {
        release.prepare(`
          UPDATE provider_session_turn_leases SET status='released',updated_at=?
           WHERE run_id=? AND action_id=?
        `).run(now + 1, fixture.runId, "provider-review-capacity-sentinel");
        release.prepare(`
          UPDATE provider_actions SET status='terminal',history_json='["prepared","dispatched","terminal"]',
                 effect_count=1,updated_at=? WHERE run_id=? AND action_id=?
        `).run(now + 1, fixture.runId, "provider-review-capacity-sentinel");
      })();
    } finally {
      release.close();
    }
    await expect(waitForProviderAction(fixture.chair, actionId))
      .resolves.toMatchObject({ status: "terminal", executionCount: 1 });
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
    })).resolves.toMatchObject({ status: "prepared" });
    await expect(waitForProviderAction(fixture.chair, "provider-review-restart-budget:ambiguous"))
      .resolves.toMatchObject({ status: "ambiguous" });

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
        budget: { turns: 3 },
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
    })).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
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
    })).resolves.toMatchObject({ status: "prepared" });
    await expect(waitForProviderAction(fixture.chair, action)).resolves.toMatchObject({ status: "ambiguous" });
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
    const dispatchReceipt = await fixture.chair.dispatchProviderAction({
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

    expect(dispatchReceipt).toMatchObject({
      actionId: "provider-review:spawn",
      status: "prepared",
      executionCount: 0,
      effectCount: 0,
    });
    const result = await waitForProviderAction(fixture.chair, "provider-review:spawn");
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
    expect(authorityBudget(fixture.databasePath, reviewAuthority.authorityId)).toMatchObject({
      turns: { reserved: 0, consumed: 1, usageUnknown: false },
      "cost:USD": { reserved: 1, consumed: 0, usageUnknown: true },
    });
    await expect(fixture.chair.reconcileProviderAction({
      actionId: "provider-review:spawn",
      commandId: "provider-review:late-usage-unavailable",
    })).resolves.toEqual(result);
    expect(await fixture.chair.getProviderAction({ actionId: "provider-review:spawn" })).toEqual(result);
    await fixture.leader.updateTask({
      taskId: fixture.leaderTask.taskId,
      expectedRevision: fixture.leaderTask.revision,
      state: "complete",
      commandId: "provider-review:complete-task-before-replay",
    });
    const lifecycleDatabase = new Database(fixture.databasePath);
    try {
      lifecycleDatabase.prepare(`
        UPDATE runs SET lifecycle_state='quiescing',revision=revision+1 WHERE run_id=?
      `).run(fixture.runId);
    } finally {
      lifecycleDatabase.close();
    }
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
      actionId: "provider-review:spawn",
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Changed identity must not replay.",
        cwd: "src/leader",
      },
      commandId: "provider-review:dispatch-conflict-after-quiesce",
    })).rejects.toMatchObject({ code: "DEDUPE_CONFLICT" });

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

    await expect(dispatch("ambiguous-review-valid")).resolves.toMatchObject({ status: "prepared" });
    await expect(waitForProviderAction(fixture.chair, "provider-review-recovery:ambiguous-review-valid"))
      .resolves.toMatchObject({ status: "ambiguous" });
    await expect(fixture.chair.reconcileProviderAction({
      actionId: "provider-review-recovery:ambiguous-review-valid",
      commandId: "provider-review-recovery:valid:reconcile",
    })).resolves.toMatchObject({
      status: "terminal",
      providerAnswer: "recovered provider review",
    });

    for (const scenario of [
      "ambiguous-review-empty",
      "ambiguous-review-oversized",
      "ambiguous-review-wrong-action-id",
    ] as const) {
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
      await expect(dispatch(scenario, invalidAuthority.authorityId)).resolves.toMatchObject({ status: "prepared" });
      await expect(waitForProviderAction(fixture.chair, `provider-review-recovery:${scenario}`))
        .resolves.toMatchObject({ status: "ambiguous" });
      await expect(fixture.chair.reconcileProviderAction({
        actionId: `provider-review-recovery:${scenario}`,
        commandId: `provider-review-recovery:${scenario}:reconcile`,
      })).resolves.toMatchObject({ status: "quarantined" });
      expect(await fixture.chair.getProviderAction({
        actionId: `provider-review-recovery:${scenario}`,
      })).toMatchObject({ status: "quarantined" });
    }
  });

  it("singleflights concurrent reconciliation commands so divergent lookup evidence cannot rewrite terminal custody", async () => {
    const fixture = await createLifecycleFixture({ payloadMaxTurns: true });
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
      commandId: "provider-review-concurrent:authority",
    });
    const actionId = "provider-review-concurrent:spawn";
    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId,
      operation: "spawn",
      authorityId: reviewAuthority.authorityId,
      payload: {
        taskId: fixture.leaderTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Recover one immutable answer.",
        maxTurns: 2,
        cwd: "src/leader",
        scenario: "ambiguous-review-concurrent-divergent",
      },
      commandId: "provider-review-concurrent:dispatch",
    })).resolves.toMatchObject({ status: "prepared" });
    await expect(waitForProviderAction(fixture.chair, actionId)).resolves.toMatchObject({ status: "ambiguous" });

    const proxy = asLifecycleClient(fixture.fabric.connect(fixture.capabilities.chair));
    const firstPromise = fixture.chair.reconcileProviderAction({
      actionId,
      commandId: "provider-review-concurrent:reconcile:first",
    });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    const secondPromise = proxy.reconcileProviderAction({
      actionId,
      commandId: "provider-review-concurrent:reconcile:second",
    });
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ status: "terminal", providerAnswer: "recovered provider review" });
    expect(await fixture.chair.getProviderAction({ actionId })).toEqual(first);
    await expect(fixture.chair.reconcileProviderAction({
      actionId,
      commandId: "provider-review-concurrent:reconcile:first",
    })).resolves.toEqual(first);
    await expect(proxy.reconcileProviderAction({
      actionId,
      commandId: "provider-review-concurrent:reconcile:second",
    })).resolves.toEqual(first);

    const providerJournal = JSON.parse(await readFile(fixture.providerJournalPath, "utf8")) as {
      actions: Record<string, { lookupCount?: number }>;
    };
    expect(providerJournal.actions[actionId]?.lookupCount).toBe(1);
    expect(authorityBudget(fixture.databasePath, reviewAuthority.authorityId)).toMatchObject({
      turns: { granted: 2, reserved: 0, consumed: 1, usageUnknown: false },
    });
    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      const receipts = database.prepare(`
        SELECT result_json FROM commands
         WHERE run_id=? AND actor_agent_id='chair' AND command_id LIKE 'provider-review-concurrent:reconcile:%'
         ORDER BY command_id
      `).all(fixture.runId) as Array<{ result_json: string }>;
      expect(receipts).toHaveLength(2);
      expect(receipts[0]?.result_json).toBe(receipts[1]?.result_json);
      expect(JSON.parse(receipts[0]?.result_json ?? "null")).toEqual(first);
    } finally {
      database.close();
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

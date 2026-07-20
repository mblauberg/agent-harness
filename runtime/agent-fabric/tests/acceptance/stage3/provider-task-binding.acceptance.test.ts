import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";

import {
  FABRIC_OPERATIONS,
  parseOperationInputForPrincipal,
} from "@local/agent-fabric-protocol";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import type { FabricClient } from "../../../src/index.ts";
import type { PublicProtocolContext } from "../../../src/daemon/public-protocol.ts";
import {
  asLifecycleClient,
  createLifecycleFixture,
  reopenLifecycleFabric,
  type LifecycleFixture,
} from "../../support/lifecycle-testkit.ts";

const cleanup: LifecycleFixture[] = [];
const nonSpawnOperations = ["send_turn", "wakeup", "release", "steer"] as const;

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(async (fixture) => {
    await fixture.fabric.close();
    await rm(fixture.directory, { recursive: true, force: true });
  }));
});

async function expectNoPrivateProviderActionEffects(
  fixture: LifecycleFixture,
  actionId: string,
  commandId: string,
): Promise<void> {
  const database = new Database(fixture.databasePath, { readonly: true });
  try {
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM provider_actions
       WHERE run_id=? AND adapter_id='fake-lifecycle' AND action_id=?
    `).get(fixture.runId, actionId)).toEqual({ count: 0 });
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM provider_action_pair_preflights
       WHERE adapter_id='fake-lifecycle' AND action_id=?
    `).get(actionId)).toEqual({ count: 0 });
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM commands
       WHERE run_id=? AND actor_agent_id='chair' AND command_id=?
    `).get(fixture.runId, commandId)).toEqual({ count: 0 });
  } finally {
    database.close();
  }
  const providerJournal = JSON.parse(await readFile(fixture.providerJournalPath, "utf8")) as {
    actions: Record<string, unknown>;
  };
  expect(providerJournal.actions[actionId]).toBeUndefined();
}

describe("provider action task binding", () => {
  it.each(nonSpawnOperations)(
    "rejects a private-RPC %s carrying a top-level taskId before persistence or provider effect",
    async (operation) => {
      const fixture = await createLifecycleFixture({ retainedAgents: true });
      cleanup.push(fixture);
      const actionId = `provider-task-private-rpc:non-spawn-task:${operation}`;
      const commandId = `${actionId}:dispatch`;

      await expect(fixture.chair.dispatchProviderAction({
        adapterId: "fake-lifecycle",
        actionId,
        operation,
        taskId: "bogus-task",
        certifyingReview: null,
        payload: {
          instruction: "A non-spawn task identity must not be silently discarded.",
          scenario: "terminal",
        },
        commandId,
      } as unknown as Parameters<FabricClient["dispatchProviderAction"]>[0])).rejects.toMatchObject({
        code: "PROTOCOL_INVALID",
        message: "non-spawn provider action must not carry a top-level task ID",
      });

      await expectNoPrivateProviderActionEffects(fixture, actionId, commandId);
    },
  );

  it.each(nonSpawnOperations)(
    "rejects a private-RPC %s carrying a malformed authorityId before persistence or provider effect",
    async (operation) => {
      const fixture = await createLifecycleFixture({ retainedAgents: true });
      cleanup.push(fixture);
      const actionId = `provider-task-private-rpc:malformed-authority:${operation}`;
      const commandId = `${actionId}:dispatch`;

      await expect(fixture.chair.dispatchProviderAction({
        adapterId: "fake-lifecycle",
        actionId,
        operation,
        authorityId: 42,
        certifyingReview: null,
        payload: {
          instruction: "A malformed present authority identity must not be silently discarded.",
          scenario: "terminal",
        },
        commandId,
      } as unknown as Parameters<FabricClient["dispatchProviderAction"]>[0])).rejects.toMatchObject({
        code: "PROTOCOL_INVALID",
        message: "provider authority ID must be a string when present",
      });

      await expectNoPrivateProviderActionEffects(fixture, actionId, commandId);
    },
  );

  it("dispatches a codec-valid spawn whose sole task binding is the top-level taskId", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(fixture);
    const providerAuthority = await fixture.chair.delegateAuthority({
      parentAuthorityId: fixture.chairAuthorityId,
      authority: {
        ...fixture.rootAuthority,
        sourcePaths: ["src/leader"],
        actions: [...fixture.rootAuthority.actions],
        budget: { turns: 1, provider_calls: 1 },
      },
      commandId: "provider-task-binding:authority",
    });
    const verified = fixture.fabric.verifyProtocolCredential(fixture.capabilities.chair);
    if (verified.principal.kind !== "agent") throw new Error("expected agent principal");
    const context: PublicProtocolContext = {
      principal: verified.principal,
      allowedOperations: new Set(verified.grantedOperations),
      features: [],
      connectionNonce: "provider_task_binding_connection",
      credentialHash: createHash("sha256").update(fixture.capabilities.chair).digest("hex"),
      daemonInstanceGeneration: 1,
    };
    const request = parseOperationInputForPrincipal(
      FABRIC_OPERATIONS.dispatchProviderAction,
      "agent",
      {
        adapterId: "fake-lifecycle",
        actionId: "provider-task-binding:spawn",
        operation: "spawn",
        taskId: fixture.leaderTask.taskId,
        authorityId: providerAuthority.authorityId,
        certifyingReview: null,
        payload: {
          model: "fake-reviewer-v1",
          modelFamily: "fake",
          prompt: "Prove that the canonical top-level task binding reaches the provider action.",
          cwd: "src/leader",
        },
        commandId: "provider-task-binding:dispatch",
      },
    );

    await expect(fixture.fabric.dispatchPublicProtocol(
      context,
      FABRIC_OPERATIONS.dispatchProviderAction,
      request,
    )).resolves.toMatchObject({
      kind: "non-review",
      actionRef: {
        adapterId: "fake-lifecycle",
        actionId: "provider-task-binding:spawn",
      },
      status: "prepared",
    });

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      const persisted = database.prepare(`
        SELECT task_id,payload_json FROM provider_actions
         WHERE run_id=? AND adapter_id='fake-lifecycle' AND action_id='provider-task-binding:spawn'
      `).get(fixture.runId) as { task_id: string; payload_json: string };
      expect(persisted.task_id).toBe(fixture.leaderTask.taskId);
      expect(JSON.parse(persisted.payload_json)).toMatchObject({ taskId: fixture.leaderTask.taskId });
    } finally {
      database.close();
    }
  });

  it("normalizes an equal payload duplicate before command replay and restart", async () => {
    const fixture = await createLifecycleFixture({ spawnUnresolved: true });
    cleanup.push(fixture);
    const providerAuthority = await fixture.chair.delegateAuthority({
      parentAuthorityId: fixture.chairAuthorityId,
      authority: {
        ...fixture.rootAuthority,
        sourcePaths: ["src/leader"],
        actions: [...fixture.rootAuthority.actions],
        budget: { turns: 1, provider_calls: 1 },
      },
      commandId: "provider-task-normalization:authority",
    });
    const baseRequest = {
      adapterId: "fake-lifecycle",
      actionId: "provider-task-normalization:spawn",
      operation: "spawn" as const,
      taskId: fixture.leaderTask.taskId,
      authorityId: providerAuthority.authorityId,
      certifyingReview: null,
      payload: {
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Normalize caller task identity before durable command custody.",
        cwd: "src/leader",
      },
      commandId: "provider-task-normalization:dispatch",
    };

    const initial = await fixture.chair.dispatchProviderAction({
      ...baseRequest,
      payload: { ...baseRequest.payload, taskId: fixture.leaderTask.taskId },
    });
    await expect(fixture.chair.dispatchProviderAction(baseRequest)).resolves.toEqual(initial);
    await expect(fixture.chair.dispatchProviderAction({
      ...baseRequest,
      commandId: "provider-task-normalization:retry",
    })).resolves.toMatchObject({
      actionId: initial.actionId,
      effectCount: 0,
    });

    await fixture.fabric.close();
    const reopened = await reopenLifecycleFabric(fixture);
    fixture.fabric = reopened;
    const reopenedChair = asLifecycleClient(reopened.connect(fixture.capabilities.chair));
    await expect(reopenedChair.dispatchProviderAction(baseRequest)).resolves.toEqual(initial);

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      expect(database.prepare(`
        SELECT task_id FROM provider_actions
         WHERE run_id=? AND adapter_id='fake-lifecycle' AND action_id='provider-task-normalization:spawn'
      `).get(fixture.runId)).toEqual({ task_id: fixture.leaderTask.taskId });
      expect(database.prepare(`
        SELECT COUNT(*) AS count FROM commands
         WHERE run_id=? AND actor_agent_id='chair'
           AND command_id IN ('provider-task-normalization:dispatch','provider-task-normalization:retry')
      `).get(fixture.runId)).toEqual({ count: 2 });
      expect(database.prepare(`
        SELECT COUNT(*) AS count FROM provider_action_pair_preflights
         WHERE adapter_id='fake-lifecycle' AND action_id='provider-task-normalization:spawn'
      `).get()).toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });

  it("rejects a conflicting payload duplicate before durable or provider effects", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(fixture);
    const providerAuthority = await fixture.chair.delegateAuthority({
      parentAuthorityId: fixture.chairAuthorityId,
      authority: {
        ...fixture.rootAuthority,
        sourcePaths: ["src/leader"],
        actions: [...fixture.rootAuthority.actions],
        budget: { turns: 1, provider_calls: 1 },
      },
      commandId: "provider-task-conflict:authority",
    });

    await expect(fixture.chair.dispatchProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-task-conflict:spawn",
      operation: "spawn",
      taskId: fixture.leaderTask.taskId,
      authorityId: providerAuthority.authorityId,
      certifyingReview: null,
      payload: {
        taskId: fixture.childTask.taskId,
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "This conflicting identity must fail without an effect.",
        cwd: "src/leader",
      },
      commandId: "provider-task-conflict:dispatch",
    })).rejects.toMatchObject({
      code: "PROTOCOL_INVALID",
      message: "provider payload task ID conflicts with the canonical top-level task ID",
    });

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      expect(database.prepare(`
        SELECT COUNT(*) AS count FROM provider_actions
         WHERE run_id=? AND adapter_id='fake-lifecycle' AND action_id='provider-task-conflict:spawn'
      `).get(fixture.runId)).toEqual({ count: 0 });
      expect(database.prepare(`
        SELECT COUNT(*) AS count FROM provider_action_pair_preflights
         WHERE adapter_id='fake-lifecycle' AND action_id='provider-task-conflict:spawn'
      `).get()).toEqual({ count: 0 });
      expect(database.prepare(`
        SELECT COUNT(*) AS count FROM commands
         WHERE run_id=? AND actor_agent_id='chair' AND command_id='provider-task-conflict:dispatch'
      `).get(fixture.runId)).toEqual({ count: 0 });
    } finally {
      database.close();
    }
    await expect(fixture.chair.getProviderAction({
      adapterId: "fake-lifecycle",
      actionId: "provider-task-conflict:spawn",
      expectedActionKind: "non-review",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("carries and replays the canonical task binding through the private daemon RPC", async () => {
    const fixture = await createLifecycleFixture({ retainedAgents: true, spawnUnresolved: true });
    cleanup.push(fixture);
    const database = new Database(fixture.databasePath, { readonly: true });
    const task = database.prepare(`
      SELECT authority_id FROM tasks WHERE run_id=? AND task_id=?
    `).get(fixture.runId, fixture.leaderTask.taskId) as { authority_id: string };
    database.close();
    const request: Parameters<FabricClient["dispatchProviderAction"]>[0] = {
      adapterId: "fake-lifecycle",
      actionId: "provider-task-private-rpc:spawn",
      operation: "spawn",
      taskId: fixture.leaderTask.taskId,
      authorityId: task.authority_id,
      certifyingReview: null,
      payload: {
        model: "fake-reviewer-v1",
        modelFamily: "fake",
        prompt: "Carry the exact task identity through the private daemon RPC.",
        cwd: "leader",
      },
      commandId: "provider-task-private-rpc:dispatch",
    };

    const initial = await fixture.chair.dispatchProviderAction(request);
    await expect(fixture.chair.dispatchProviderAction({
      ...request,
      payload: { ...request.payload, taskId: request.taskId },
    })).resolves.toEqual(initial);
    await expect(fixture.chair.dispatchProviderAction({
      ...request,
      actionId: "provider-task-private-rpc:conflict",
      payload: { ...request.payload, taskId: fixture.childTask.taskId },
      commandId: "provider-task-private-rpc:conflict",
    })).rejects.toMatchObject({
      code: "PROTOCOL_INVALID",
      message: "provider payload task ID conflicts with the canonical top-level task ID",
    });
    if (fixture.restartRetainedDaemon === undefined) {
      throw new Error("retained daemon restart fixture is unavailable");
    }
    await fixture.fabric.close();
    const restarted = await fixture.restartRetainedDaemon();
    fixture.fabric = restarted.fabric;
    fixture.chair = restarted.chair;
    await expect(restarted.chair.dispatchProviderAction(request)).resolves.toEqual(initial);

    const verification = new Database(fixture.databasePath, { readonly: true });
    try {
      expect(verification.prepare(`
        SELECT task_id FROM provider_actions
         WHERE run_id=? AND adapter_id='fake-lifecycle' AND action_id='provider-task-private-rpc:spawn'
      `).get(fixture.runId)).toEqual({ task_id: fixture.leaderTask.taskId });
      expect(verification.prepare(`
        SELECT COUNT(*) AS count FROM provider_actions
         WHERE run_id=? AND adapter_id='fake-lifecycle' AND action_id='provider-task-private-rpc:conflict'
      `).get(fixture.runId)).toEqual({ count: 0 });
    } finally {
      verification.close();
    }
  });

  it.each(nonSpawnOperations)(
    "rejects a private-RPC %s carrying a routeRequest before persistence or provider effect",
    async (operation) => {
      const fixture = await createLifecycleFixture({ retainedAgents: true });
      cleanup.push(fixture);
      const actionId = `provider-task-private-rpc:route-request:${operation}`;
      const commandId = `${actionId}:dispatch`;

      await expect(fixture.chair.dispatchProviderAction({
        adapterId: "fake-lifecycle",
        actionId,
        operation,
        certifyingReview: null,
        routeRequest: {
          preferredProviderFamily: "bogus-family",
        },
        payload: {
          instruction: "This review-classified private request must never reach the provider.",
          scenario: "terminal",
        },
        commandId,
      } as unknown as Parameters<FabricClient["dispatchProviderAction"]>[0])).rejects.toMatchObject({
        code: "PROTOCOL_INVALID",
        message: "provider route requests require the review evidence daemon owner",
      });

      await expectNoPrivateProviderActionEffects(fixture, actionId, commandId);
    },
  );

  it.each(nonSpawnOperations)(
    "rejects a private-RPC %s carrying certifyingReview before persistence or provider effect",
    async (operation) => {
      const fixture = await createLifecycleFixture({ retainedAgents: true });
      cleanup.push(fixture);
      const actionId = `provider-task-private-rpc:certifying-review:${operation}`;
      const commandId = `${actionId}:dispatch`;

      await expect(fixture.chair.dispatchProviderAction({
        adapterId: "fake-lifecycle",
        actionId,
        operation,
        certifyingReview: {
          reviewerAgentId: "bogus-reviewer",
        },
        payload: {
          instruction: "This certifying-review request must never reach the generic provider boundary.",
          scenario: "terminal",
        },
        commandId,
      } as unknown as Parameters<FabricClient["dispatchProviderAction"]>[0])).rejects.toMatchObject({
        code: "PROTOCOL_INVALID",
        message: "certifying review dispatch requires the review evidence daemon owner",
      });

      await expectNoPrivateProviderActionEffects(fixture, actionId, commandId);
    },
  );
});

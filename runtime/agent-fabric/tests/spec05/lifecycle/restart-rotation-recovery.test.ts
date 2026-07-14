import { rm } from "node:fs/promises";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import { LifecycleRotationRepository } from "../../../src/lifecycle/rotation-repository.ts";
import { sha256 } from "../../../src/project-session/store-support.ts";
import { TestLifecycleReceiptAuthority } from "../../support/lifecycle-receipt-authority-fake.ts";
import {
  createLifecycleFixture,
  reopenLifecycleFabric,
  type LifecycleFixture,
} from "../../support/lifecycle-testkit.ts";
import { admitProviderActionFixture } from "../../support/provider-action-fixture.ts";
import { createStage1Fixture } from "../../support/stage1-fixture.ts";

const fixtures: LifecycleFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(async (fixture) => {
    await fixture.fabric.close();
    await rm(fixture.directory, { recursive: true, force: true });
  }));
});

describe("lifecycle restart recovery", () => {
  it("binds an unmanaged retained session to a generation-loss source before exposing it", async () => {
    const fixture = await createLifecycleFixture({ retainedAgents: true });
    fixtures.push(fixture);
    await fixture.fabric.close();
    const restarted = await reopenLifecycleFabric(fixture, { providerStatus: "unmanaged" });
    fixture.fabric = restarted;

    await expect(restarted.recoverStartupState()).resolves.toMatchObject({ sessionsDegraded: 2 });
    const chair = restarted.connect(fixture.capabilities.chair);
    await expect(chair.getAgentLifecycle({ agentId: "leader" })).resolves.toMatchObject({
      lifecycle: "suspended",
      contextState: "context-unreconciled",
      currentSource: {
        sourceKind: "generation-loss",
        state: "open",
        disposition: null,
      },
    });
  });

  it("finalizes an awaiting-boundary rotation as durable zero-dispatch no-effect without an adapter", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const database = new Database(fixture.databasePath);
    database.pragma("foreign_keys = ON");
    const authority = new TestLifecycleReceiptAuthority();
    try {
      const identity = database.prepare(`
        SELECT run.project_session_id,capability.token_hash,
               capability.principal_generation
          FROM runs run
          JOIN capabilities capability
            ON capability.run_id=run.run_id AND capability.agent_id=run.chair_agent_id
         WHERE run.run_id='run-stage1' AND capability.revoked_at IS NULL
         ORDER BY capability.principal_generation DESC LIMIT 1
      `).get() as {
        project_session_id: string;
        token_hash: string;
        principal_generation: number;
      };
      admitProviderActionFixture(database, {
        runId: "run-stage1",
        adapterId: "missing-adapter",
        actionId: "restart-rotation-action",
        operation: "spawn",
        targetAgentId: "chair",
        identityHash: sha256("restart-rotation-identity"),
        payloadHash: sha256("restart-rotation-payload"),
        payloadJson: "{}",
        status: "prepared",
        historyJson: '["prepared"]',
        executionCount: 0,
        updatedAt: 10,
      });
      const repository = new LifecycleRotationRepository(database);
      database.transaction(() => {
        repository.createInCurrentTransaction({
          projectSessionId: identity.project_session_id,
          runId: "run-stage1",
          agentId: "chair",
          custodyId: "restart-rotation-custody",
          commandId: "restart-rotation-command",
          admissionDigest: `sha256:${"a".repeat(64)}`,
          actionRef: { adapterId: "missing-adapter", actionId: "restart-rotation-action" },
          bridgeOwnerKind: "child",
          callerTurnLeaseId: "restart-rotation-turn",
          callerTurnGeneration: 1,
          predecessorTurnSetDigest: `sha256:${"b".repeat(64)}`,
          quarantinedWriteSetDigest: `sha256:${"c".repeat(64)}`,
          deliveryCutWatermark: 0,
          adoptionDeliverySetDigest: `sha256:${"d".repeat(64)}`,
          checkpointRef: "restart-checkpoint.json",
          checkpointDigest: `sha256:${"e".repeat(64)}`,
          taskRevision: 1,
          mailboxRevision: 0,
          childSetDigest: `sha256:${"f".repeat(64)}`,
          openWorkSetDigest: `sha256:${"1".repeat(64)}`,
          sourceProviderSessionRef: "source-session",
          sourceCapabilityHash: identity.token_hash,
          sourceCustodyActionId: "restart-rotation-action",
          sourceAdapterId: "missing-adapter",
          sourceAdapterContractDigest: `sha256:${"2".repeat(64)}`,
          sourceBridgeRowId: "run-stage1:chair",
          sourceBridgeRevision: 1,
          sourceProviderGeneration: 1,
          sourcePrincipalGeneration: identity.principal_generation,
          sourceBridgeGeneration: 1,
          sourceProjectSessionGeneration: 1,
          sourceRunGeneration: 1,
          sourceChairLeaseGeneration: 1,
          targetProviderGeneration: 2,
          targetPrincipalGeneration: identity.principal_generation + 1,
          targetBridgeGeneration: 2,
          replacementAdapterId: "missing-adapter",
          replacementContractDigest: `sha256:${"3".repeat(64)}`,
          stagedCapabilityHash: `sha256:${"4".repeat(64)}`,
          launchAttestChallengeDigest: `sha256:${"5".repeat(64)}`,
          preconditionDigest: `sha256:${"6".repeat(64)}`,
          createdAt: 11,
        });
        database.prepare("UPDATE agents SET lifecycle='suspended' WHERE run_id='run-stage1' AND agent_id='chair'").run();
        database.prepare(`
          INSERT INTO delivery_freezes(run_id,agent_id,reason,created_at)
          VALUES ('run-stage1','chair',?,11)
        `).run(`lifecycle-rotation:${sha256("restart-rotation-custody").slice(0, 32)}`);
      }).immediate();
    } finally {
      database.close();
    }

    const restarted = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      lifecycleReceiptAuthority: authority,
    });
    try {
      await expect(restarted.recoverStartupState()).resolves.toMatchObject({
        actionsReconciled: 0,
        actionsQuarantined: 0,
      });
      const inspection = new Database(fixture.databasePath, { readonly: true });
      try {
        expect(inspection.prepare(`
          SELECT state,disposition_code,terminal
            FROM lifecycle_rotation_custody_heads
           WHERE custody_id='restart-rotation-custody'
        `).get()).toEqual({ state: "finalized", disposition_code: "no-effect", terminal: 1 });
        expect(inspection.prepare(`
          SELECT status,execution_count,effect_count,idempotency_proven
            FROM provider_actions
           WHERE run_id='run-stage1' AND adapter_id='missing-adapter'
             AND action_id='restart-rotation-action'
        `).get()).toEqual({
          status: "terminal",
          execution_count: 0,
          effect_count: 0,
          idempotency_proven: 1,
        });
      } finally {
        inspection.close();
      }
    } finally {
      await restarted.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});

import { rm } from "node:fs/promises";

import Database from "better-sqlite3";
import type {
  AgentId,
  CoordinationRunId,
  MessageId,
  ProjectId,
  ProjectSessionId,
  ProviderActionId,
  Sha256Digest,
  TaskId,
} from "@local/agent-fabric-protocol";
import { describe, expect, it } from "vitest";

import { ProviderActionAdmissionCoordinator } from "../../src/application/provider-action-admission.ts";
import { HerdrFabricPorts } from "../../src/integrations/herdr-fabric-ports.ts";
import { openFabric } from "../../src/index.ts";
import { createStage1Fixture } from "../support/stage1-fixture.ts";

function seedHerdrIntegrationIdentity(database: Database.Database): void {
  database.prepare(`
    INSERT INTO integration_availability(
      integration_id,state,discovered_contract_json,checked_at
    ) VALUES ('herdr-control-v1','available',?,1)
    ON CONFLICT(integration_id) DO UPDATE SET
      state=excluded.state,
      discovered_contract_json=excluded.discovered_contract_json,
      checked_at=excluded.checked_at
  `).run(JSON.stringify({
    schemaVersion: 1,
    generation: 1,
    operationFamily: "herdr-control-v1",
    mode: "required",
    detail: "test identity",
    presence: [],
    degradedRunIds: [],
    recoveryRunIds: [],
    recoverySessionIds: [],
  }));
}

describe("daemon-owned Herdr Fabric ports", () => {
  it("authoritatively validates a stable task reference and journals one action lifecycle", async () => {
    const fixture = await createStage1Fixture();
    const ready = await fixture.chair.createTask({
      taskId: "herdr-steer-task",
      authorityId: fixture.authorities.bob,
      eligibleAgentIds: ["bob"],
      participantAgentIds: ["chair"],
      objective: "receive one-way steering",
      baseRevision: "base-01",
      commandId: "herdr:task:create",
    });
    const active = await fixture.bob.claimTask({
      taskId: ready.taskId,
      expectedRevision: ready.revision,
      commandId: "herdr:task:claim",
    });
    const otherReady = await fixture.chair.createTask({
      taskId: "herdr-other-task",
      authorityId: fixture.authorities.bob,
      eligibleAgentIds: ["bob"],
      participantAgentIds: ["chair"],
      objective: "prove exact message task binding",
      baseRevision: "base-01",
      commandId: "herdr:other-task:create",
    });
    const otherActive = await fixture.bob.claimTask({
      taskId: otherReady.taskId,
      expectedRevision: otherReady.revision,
      commandId: "herdr:other-task:claim",
    });
    const steerMessage = await fixture.chair.sendMessage({
      audience: { kind: "task", taskId: active.taskId },
      kind: "steer",
      body: "Pause after the current check.",
      requiresAck: false,
      dedupeKey: "herdr:message:steer",
      taskRevision: active.revision,
      context: { kind: "task", taskId: active.taskId },
    });
    const answerBearingMessage = await fixture.chair.sendMessage({
      audience: { kind: "task", taskId: active.taskId },
      kind: "request",
      body: "Return an answer.",
      requiresAck: true,
      dedupeKey: "herdr:message:request",
      taskRevision: active.revision,
      context: { kind: "task", taskId: active.taskId },
    });
    await fixture.fabric.close();
    const database = new Database(fixture.databasePath);
    try {
      database.pragma("foreign_keys = ON");
      seedHerdrIntegrationIdentity(database);
      const identity = database.prepare(`
        SELECT p.project_id, s.project_session_id
          FROM projects p JOIN project_sessions s ON s.project_id=p.project_id
         WHERE s.project_session_id=(SELECT project_session_id FROM runs WHERE run_id='run-stage1')
      `).get() as { project_id: string; project_session_id: string };
      const clock = () => Date.parse("2027-01-01T00:00:00Z");
      const ports = new HerdrFabricPorts({
        database,
        clock,
        providerActionAdmission: new ProviderActionAdmissionCoordinator({ database, clock }),
      });
      const reference = {
        kind: "task" as const,
        projectId: identity.project_id as ProjectId,
        projectSessionId: identity.project_session_id as ProjectSessionId,
        coordinationRunId: "run-stage1" as CoordinationRunId,
        taskId: active.taskId as TaskId,
        expectedRevision: active.revision,
      };

      const validation = await ports.validateSteerReference(reference) as {
        status: "valid";
        referenceDigest: Sha256Digest;
      };
      expect(validation).toMatchObject({
        status: "valid",
        targetAgentId: "bob",
        purpose: "steer",
        requiresAck: false,
        expectsResult: false,
        dependentBarrierId: null,
        referenceDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      });
      const messageReference = {
        ...reference,
        kind: "message" as const,
        messageId: steerMessage.messageId as MessageId,
      };
      await expect(ports.validateSteerReference(messageReference)).resolves.toMatchObject({
        status: "valid",
        targetAgentId: "bob",
        purpose: "steer",
        requiresAck: false,
        expectsResult: false,
        dependentBarrierId: null,
      });
      await expect(ports.validateSteerReference({
        ...messageReference,
        messageId: answerBearingMessage.messageId as MessageId,
      })).resolves.toMatchObject({
        status: "rejected",
        code: "scope-mismatch",
      });
      await expect(ports.validateSteerReference({
        ...messageReference,
        taskId: otherActive.taskId as TaskId,
        expectedRevision: otherActive.revision,
      })).resolves.toMatchObject({
        status: "rejected",
        code: "scope-mismatch",
      });
      const actionId = "herdr-steer-action-01" as ProviderActionId;
      const intent = {
        kind: "steer.inject-fire-and-forget" as const,
        targetAgentId: "bob" as AgentId,
        paneRef: "w5:p7" as never,
        reference,
        validatedReferenceDigest: validation.referenceDigest,
        prompt: "Pause after the current check.",
      };

      const prepared = await ports.prepareDirectSteerAction(actionId, intent);
      expect(prepared).toMatchObject({ actionId, revision: 1, status: "prepared" });
      expect(await ports.readAction(actionId)).toEqual(prepared);
      const dispatched = await ports.markDispatched(actionId, 1) as { revision: number };
      expect(dispatched).toMatchObject({ actionId, revision: 2, status: "dispatched" });
      const terminal = await ports.completeAction(actionId, dispatched.revision, {
        status: "dispatched-unconfirmed",
        operation: "steer.inject-fire-and-forget",
        referenceValidation: "verified",
        deliveryEvidence: "none",
        canSatisfyExpectedResult: false,
        canCloseBarrier: false,
      });
      expect(terminal).toMatchObject({ actionId, revision: 3, status: "terminal" });
      const admittedPrincipal = database.prepare(`
        SELECT actor_principal_digest FROM provider_action_pair_preflights
         WHERE adapter_id='herdr-control-v1' AND action_id=?
      `).get(actionId);
      seedHerdrIntegrationIdentity(database);
      database.prepare(`
        UPDATE integration_availability
           SET discovered_contract_json=json_set(discovered_contract_json, '$.generation', 2),
               checked_at=2
         WHERE integration_id='herdr-control-v1'
      `).run();
      await expect(ports.prepareDirectSteerAction(actionId, intent)).resolves.toEqual(terminal);
      expect(database.prepare(`
        SELECT actor_principal_digest FROM provider_action_pair_preflights
         WHERE adapter_id='herdr-control-v1' AND action_id=?
      `).get(actionId)).toEqual(admittedPrincipal);
      expect(database.prepare(`
        SELECT state FROM project_session_memberships
         WHERE project_session_id=? AND coordination_run_id='run-stage1'
           AND member_kind='provider-action' AND member_id=?
      `).get(identity.project_session_id, actionId)).toEqual({ state: "reconciled" });

      const recoveryActionId = "herdr-steer-recovery-01" as ProviderActionId;
      await ports.prepareDirectSteerAction(recoveryActionId, intent);
      await ports.markDispatched(recoveryActionId, 1);
      const mismatchedActionId = "herdr-steer-mismatch-01" as ProviderActionId;
      await ports.prepareDirectSteerAction(mismatchedActionId, intent);
      await ports.markDispatched(mismatchedActionId, 1);
      const preparedActionId = "herdr-steer-prepared-01" as ProviderActionId;
      await ports.prepareDirectSteerAction(preparedActionId, intent);
      const lookups: string[] = [];
      const recovered = await ports.recover({
        lookupAction: async (requestedActionId) => {
          lookups.push(requestedActionId);
          if (requestedActionId === mismatchedActionId) {
            return { status: "observed" as const, receipt: { status: "applied" as const, operation: "agent.wake" as const } };
          }
          return {
            status: "observed" as const,
            receipt: {
              status: "dispatched-unconfirmed" as const,
              operation: "steer.inject-fire-and-forget" as const,
              referenceValidation: "verified" as const,
              deliveryEvidence: "none" as const,
              canSatisfyExpectedResult: false as const,
              canCloseBarrier: false as const,
            },
          };
        },
      });
      expect(recovered).toEqual({ observed: 1, terminal: 1, ambiguous: 1, prepared: 1 });
      expect(lookups.sort()).toEqual([mismatchedActionId, recoveryActionId].sort());
      await expect(ports.readAction(recoveryActionId)).resolves.toMatchObject({ status: "terminal" });
      await expect(ports.readAction(mismatchedActionId)).resolves.toMatchObject({ status: "ambiguous" });
      await expect(ports.readAction(preparedActionId)).resolves.toMatchObject({ status: "prepared" });

      await expect(ports.validateSteerReference({ ...reference, expectedRevision: active.revision - 1 })).resolves.toMatchObject({
        status: "rejected",
        code: "stale-reference",
      });
      await expect(ports.validateSteerReference({
        ...reference,
        coordinationRunId: "run-missing" as CoordinationRunId,
      })).resolves.toMatchObject({
        status: "rejected",
        code: "unknown-reference",
      });
      const faultActionId = "herdr-steer-admission-fault-01" as ProviderActionId;
      const faultPorts = new HerdrFabricPorts({
        database,
        clock,
        providerActionAdmission: new ProviderActionAdmissionCoordinator({
          database,
          clock,
          fault: (label) => {
            if (label === "provider-action-admission:after-action-insert") {
              throw new Error("fault:herdr-admission");
            }
          },
        }),
      });
      await expect(faultPorts.prepareDirectSteerAction(faultActionId, intent))
        .rejects.toThrow("fault:herdr-admission");
      expect(database.prepare(`
        SELECT state FROM provider_action_pair_preflights
         WHERE adapter_id='herdr-control-v1' AND action_id=?
      `).get(faultActionId)).toEqual({ state: "resolving" });
      expect(database.prepare(`
        SELECT COUNT(*) AS count FROM provider_actions
         WHERE adapter_id='herdr-control-v1' AND action_id=?
      `).get(faultActionId)).toEqual({ count: 0 });
      await expect(ports.prepareDirectSteerAction(faultActionId, intent)).resolves.toMatchObject({
        actionId: faultActionId,
        status: "prepared",
      });
      expect(database.prepare(`
        SELECT state FROM provider_action_pair_preflights
         WHERE adapter_id='herdr-control-v1' AND action_id=?
      `).get(faultActionId)).toEqual({ state: "admitted" });
      await expect(ports.prepareDirectSteerAction("herdr-secret-action" as ProviderActionId, {
        ...intent,
        prompt: `afb_${"x".repeat(32)}`,
      })).rejects.toThrow("credential-like");
      for (const state of ["unavailable", "stale"] as const) {
        database.prepare(`UPDATE integration_availability SET state=? WHERE integration_id='herdr-control-v1'`)
          .run(state);
        const unavailableActionId = `herdr-${state}-action` as ProviderActionId;
        await expect(ports.prepareDirectSteerAction(unavailableActionId, intent))
          .rejects.toThrow("integration is not available");
        expect(database.prepare(`
          SELECT COUNT(*) AS count FROM provider_action_pair_preflights
           WHERE adapter_id='herdr-control-v1' AND action_id=?
        `).get(unavailableActionId)).toEqual({ count: 0 });
      }
      database.prepare(`DELETE FROM integration_availability WHERE integration_id='herdr-control-v1'`).run();
      await expect(ports.prepareDirectSteerAction("herdr-unauthenticated-action" as ProviderActionId, intent))
        .rejects.toThrow("identity is not authenticated");
      expect(database.prepare(`
        SELECT COUNT(*) AS count FROM provider_action_pair_preflights
         WHERE adapter_id='herdr-control-v1' AND action_id='herdr-unauthenticated-action'
      `).get()).toEqual({ count: 0 });
    } finally {
      database.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("keeps Herdr-owned actions out of generic provider recovery", async () => {
    const fixture = await createStage1Fixture();
    const ready = await fixture.chair.createTask({
      taskId: "herdr-restart-task",
      authorityId: fixture.authorities.bob,
      eligibleAgentIds: ["bob"],
      objective: "survive daemon restart",
      baseRevision: "base-01",
      commandId: "herdr:restart:create",
    });
    const active = await fixture.bob.claimTask({
      taskId: ready.taskId,
      expectedRevision: ready.revision,
      commandId: "herdr:restart:claim",
    });
    await fixture.fabric.close();
    const database = new Database(fixture.databasePath);
    try {
      database.pragma("foreign_keys = ON");
      seedHerdrIntegrationIdentity(database);
      const identity = database.prepare(`
        SELECT p.project_id, s.project_session_id
          FROM projects p JOIN project_sessions s ON s.project_id=p.project_id
         WHERE s.project_session_id=(SELECT project_session_id FROM runs WHERE run_id='run-stage1')
      `).get() as { project_id: string; project_session_id: string };
      const clock = () => fixture.clock.now().getTime();
      const ports = new HerdrFabricPorts({
        database,
        clock,
        providerActionAdmission: new ProviderActionAdmissionCoordinator({ database, clock }),
      });
      const reference = {
        kind: "task" as const,
        projectId: identity.project_id as ProjectId,
        projectSessionId: identity.project_session_id as ProjectSessionId,
        coordinationRunId: "run-stage1" as CoordinationRunId,
        taskId: active.taskId as TaskId,
        expectedRevision: active.revision,
      };
      const validation = await ports.validateSteerReference(reference);
      if (validation.status !== "valid") throw new Error("expected valid Herdr task reference");
      const intent = {
        kind: "steer.inject-fire-and-forget" as const,
        targetAgentId: "bob" as AgentId,
        paneRef: "w5:p7" as never,
        reference,
        validatedReferenceDigest: validation.referenceDigest,
        prompt: "Continue without returning an answer.",
      };
      await ports.prepareDirectSteerAction("herdr-restart-prepared" as ProviderActionId, intent);
      await ports.prepareDirectSteerAction("herdr-restart-dispatched" as ProviderActionId, intent);
      await ports.markDispatched("herdr-restart-dispatched" as ProviderActionId, 1);
    } finally {
      database.close();
    }

    const restarted = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
    });
    try {
      await expect(restarted.recoverStartupState()).resolves.toMatchObject({ actionsQuarantined: 0 });
      await expect(restarted.reconcileProviderAction("run-stage1", "chair", {
        adapterId: "herdr-control-v1",
        actionId: "herdr-restart-dispatched",
        commandId: "generic-herdr-reconcile-forbidden",
      })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    } finally {
      await restarted.close();
    }
    const reopened = new Database(fixture.databasePath, { readonly: true });
    try {
      expect(reopened.prepare(`
        SELECT action_id, status FROM provider_actions
         WHERE adapter_id='herdr-control-v1' ORDER BY action_id
      `).all()).toEqual([
        { action_id: "herdr-restart-dispatched", status: "dispatched" },
        { action_id: "herdr-restart-prepared", status: "prepared" },
      ]);
    } finally {
      reopened.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});

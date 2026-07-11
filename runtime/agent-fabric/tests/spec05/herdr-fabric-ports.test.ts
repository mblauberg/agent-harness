import { rm } from "node:fs/promises";

import Database from "better-sqlite3";
import type {
  AgentId,
  CoordinationRunId,
  ProjectId,
  ProjectSessionId,
  ProviderActionId,
  Sha256Digest,
  TaskId,
} from "@local/agent-fabric-protocol";
import { describe, expect, it } from "vitest";

import { HerdrFabricPorts } from "../../src/integrations/herdr-fabric-ports.ts";
import { createStage1Fixture } from "../support/stage1-fixture.ts";

describe("daemon-owned Herdr Fabric ports", () => {
  it("authoritatively validates a stable task reference and journals one action lifecycle", async () => {
    const fixture = await createStage1Fixture();
    const ready = await fixture.chair.createTask({
      taskId: "herdr-steer-task",
      authorityId: fixture.authorities.bob,
      eligibleAgentIds: ["bob"],
      objective: "receive one-way steering",
      baseRevision: "base-01",
      commandId: "herdr:task:create",
    });
    const active = await fixture.bob.claimTask({
      taskId: ready.taskId,
      expectedRevision: ready.revision,
      commandId: "herdr:task:claim",
    });
    await fixture.fabric.close();
    const database = new Database(fixture.databasePath);
    try {
      database.pragma("foreign_keys = ON");
      const identity = database.prepare(`
        SELECT p.project_id, s.project_session_id
          FROM projects p JOIN project_sessions s ON s.project_id=p.project_id
         WHERE s.project_session_id=(SELECT project_session_id FROM runs WHERE run_id='run-stage1')
      `).get() as { project_id: string; project_session_id: string };
      const ports = new HerdrFabricPorts({ database, clock: () => Date.parse("2027-01-01T00:00:00Z") });
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
      await expect(ports.prepareDirectSteerAction("herdr-secret-action" as ProviderActionId, {
        ...intent,
        prompt: `afb_${"x".repeat(32)}`,
      })).rejects.toThrow("credential-like");
    } finally {
      database.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});

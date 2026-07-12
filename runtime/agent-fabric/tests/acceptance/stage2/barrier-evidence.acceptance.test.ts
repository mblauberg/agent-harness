import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { FABRIC_OPERATIONS, parseOperatorCapabilityGrant } from "@local/agent-fabric-protocol";
import { describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import type { PublicProtocolContext } from "../../../src/daemon/public-protocol.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
import { ROOT_AUTHORITY } from "../../support/stage1-fixture.ts";

describe("artifact, objective, gate and handoff barrier evidence", () => {
  it("keeps a stage barrier closed until every declared evidence class is satisfied", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-barrier-evidence-"));
    const databasePath = join(directory, "fabric.sqlite3");
    const fabric = await openFabric({ databasePath, workspaceRoots: [directory] });
    try {
      const run = await fabric.createRun({ runId: "run-barrier-evidence", projectRunDirectory: directory, chair: { agentId: "chair", authority: { ...ROOT_AUTHORITY, workspaceRoots: ["."], sourcePaths: ["."], artifactPaths: ["."] } } });
      const chair = fabric.connect(run.chairCapability);
      const peerAuthority = await chair.delegateAuthority({ parentAuthorityId: run.chairAuthorityId, authority: { ...ROOT_AUTHORITY, workspaceRoots: ["."], sourcePaths: ["."], artifactPaths: ["."], actions: ["read", "write"], budget: { turns: 1 } } });
      const peerRegistration = await chair.registerAgent({ agentId: "peer", authorityId: peerAuthority.authorityId });
      const peer = fabric.connect(peerRegistration.capability);
      const task = await chair.createTask({
        taskId: "evidence-task", authorityId: run.chairAuthorityId, eligibleAgentIds: ["chair"], proposedOwnerAgentId: "chair", participantAgentIds: ["peer"],
        expectedArtifacts: ["findings/evidence.md"], objectiveChecks: ["tests-pass"], humanGates: ["human-acceptance"],
        objective: "prove all closure evidence", baseRevision: "base-1", commandId: "evidence:create",
      });
      await expect(chair.claimTask({
        taskId: task.taskId,
        expectedRevision: task.revision,
        commandId: "evidence:claim:before-gate",
      })).rejects.toMatchObject({ code: "GATE_BLOCKED" });

      let projectId = "";
      let projectSessionId = "";
      let gateId = "";
      const operatorDatabase = new Database(databasePath);
      try {
        operatorDatabase.pragma("foreign_keys = ON");
        const identity = operatorDatabase.prepare(`
          SELECT p.project_id, p.authority_generation, s.project_session_id, s.generation, g.gate_id
            FROM projects p
            JOIN project_sessions s ON s.project_id=p.project_id
            JOIN scoped_gates g ON g.project_session_id=s.project_session_id
        `).get() as {
          project_id: string;
          authority_generation: number;
          project_session_id: string;
          generation: number;
          gate_id: string;
        };
        projectId = identity.project_id;
        projectSessionId = identity.project_session_id;
        gateId = identity.gate_id;
        const operators = new OperatorStore({ database: operatorDatabase });
        operators.registerPrincipal({
          operatorId: "operator_evidence",
          projectId,
          authenticatedSubjectHash: "subject_evidence",
          projectAuthorityGeneration: identity.authority_generation,
        });
        operators.issueCapability(parseOperatorCapabilityGrant({
          capabilityId: "cap_operator_evidence",
          operatorId: "operator_evidence",
          projectId,
          projectAuthorityGeneration: identity.authority_generation,
          principalGeneration: 1,
          issuedAt: "2026-01-01T00:00:00Z",
          expiresAt: "2099-01-01T00:00:00Z",
          status: "active",
          kind: "session",
          projectSessionId,
          sessionGeneration: identity.generation,
          actions: ["read", "decide"],
        }), "operator-evidence-secret");
      } finally {
        operatorDatabase.close();
      }
      const verified = fabric.verifyProtocolCredential("operator-evidence-secret");
      if (verified.principal.kind !== "operator") throw new Error("expected operator principal");
      const operatorContext: PublicProtocolContext = {
        principal: verified.principal,
        allowedOperations: new Set(verified.grantedOperations),
        features: ["scoped-gates.v1"],
        connectionNonce: "connection_evidence",
        credentialHash: createHash("sha256").update("operator-evidence-secret").digest("hex"),
        daemonInstanceGeneration: 1,
      };
      await expect(fabric.dispatchPublicProtocol(
        operatorContext,
        FABRIC_OPERATIONS.scopedGateResolve,
        {
          command: {
            credential: { capabilityId: "cap_operator_evidence", token: "operator-evidence-secret" },
            commandId: "command_gate_evidence",
            expectedRevision: 1,
            actor: "operator_evidence",
            provenance: {
              kind: "console-direct-input",
              clientId: "console_evidence",
              inputEventId: "input_gate_evidence",
            },
            evidenceRefs: [],
          },
          gateId: gateId as never,
          status: "approved",
          decisionEvidence: {
            kind: "typed-console",
            confirmationCommandId: "command_gate_evidence" as never,
          },
        },
      )).resolves.toMatchObject({
        projectSessionId,
        gateId,
        status: "approved",
        revision: 2,
      });
      const claimed = await chair.claimTask({ taskId: task.taskId, expectedRevision: task.revision, commandId: "evidence:claim" });
      const complete = await chair.updateTask({ taskId: task.taskId, expectedRevision: claimed.revision, state: "complete", commandId: "evidence:complete" });
      await expect(chair.closeBarrier({ scope: "stage", stageId: "stage-evidence", commandId: "evidence:close:missing-all" })).rejects.toThrow(/artifacts=1 checks=1 gates=0 checkpoints=0 handoffs=1/u);

      await chair.publishArtifact({ taskId: task.taskId, relativePath: "findings/evidence.md", sha256: "a".repeat(64), commandId: "evidence:artifact" });
      await chair.recordObjectiveCheck({ taskId: task.taskId, checkId: "tests-pass", status: "pass", evidence: "vitest", commandId: "evidence:check" });
      await expect(chair.closeBarrier({ scope: "stage", stageId: "stage-evidence", commandId: "evidence:close:missing-handoff" })).rejects.toThrow(/handoffs=1/u);
      await peer.acknowledgeTaskHandoff({ taskId: task.taskId, taskRevision: complete.revision, ownerLeaseGeneration: complete.ownerLeaseGeneration, commandId: "evidence:handoff" });
      await expect(chair.closeBarrier({ scope: "stage", stageId: "stage-evidence", commandId: "evidence:close:complete" })).resolves.toMatchObject({ closed: true, scope: "stage" });
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

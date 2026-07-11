import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import { ROOT_AUTHORITY } from "../../support/stage1-fixture.ts";

describe("artifact, objective, gate and handoff barrier evidence", () => {
  it("keeps a stage barrier closed until every declared evidence class is satisfied", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-barrier-evidence-"));
    const fabric = await openFabric({ databasePath: join(directory, "fabric.sqlite3"), workspaceRoots: [directory] });
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
      const claimed = await chair.claimTask({ taskId: task.taskId, expectedRevision: task.revision, commandId: "evidence:claim" });
      const complete = await chair.updateTask({ taskId: task.taskId, expectedRevision: claimed.revision, state: "complete", commandId: "evidence:complete" });
      await expect(chair.closeBarrier({ scope: "stage", stageId: "stage-evidence", commandId: "evidence:close:missing-all" })).rejects.toThrow(/artifacts=1 checks=1 gates=1 checkpoints=0 handoffs=1/u);

      await chair.publishArtifact({ taskId: task.taskId, relativePath: "findings/evidence.md", sha256: "a".repeat(64), commandId: "evidence:artifact" });
      await chair.recordObjectiveCheck({ taskId: task.taskId, checkId: "tests-pass", status: "pass", evidence: "vitest", commandId: "evidence:check" });
      await chair.resolveHumanGate({ taskId: task.taskId, gateId: "human-acceptance", status: "approved", evidence: "explicit test approval", commandId: "evidence:gate" });
      await expect(chair.closeBarrier({ scope: "stage", stageId: "stage-evidence", commandId: "evidence:close:missing-handoff" })).rejects.toThrow(/handoffs=1/u);
      await peer.acknowledgeTaskHandoff({ taskId: task.taskId, taskRevision: complete.revision, ownerLeaseGeneration: complete.ownerLeaseGeneration, commandId: "evidence:handoff" });
      await expect(chair.closeBarrier({ scope: "stage", stageId: "stage-evidence", commandId: "evidence:close:complete" })).resolves.toMatchObject({ closed: true, scope: "stage" });
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

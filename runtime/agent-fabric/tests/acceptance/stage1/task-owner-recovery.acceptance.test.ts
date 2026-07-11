import { afterEach, describe, expect, it } from "vitest";

import { createStage1Fixture } from "../../support/stage1-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("AC-005 fenced task-owner recovery", () => {
  it("reassigns with a higher generation only after chair-recorded predecessor revocation proof", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(() => fixture.fabric.close());
    const ready = await fixture.chair.createTask({
      taskId: "recover-owner",
      authorityId: fixture.authorities.alice,
      eligibleAgentIds: ["alice", "bob"],
      proposedOwnerAgentId: "alice",
      participantAgentIds: ["alice", "bob"],
      objective: "recover a lost task owner",
      baseRevision: "base",
      commandId: "task-owner:create",
    });
    const active = await fixture.alice.claimTask({
      taskId: ready.taskId,
      expectedRevision: ready.revision,
      commandId: "task-owner:claim",
    });
    await expect(fixture.chair.recordTaskOwnerRecoveryProof({
      taskId: active.taskId,
      ownerLeaseGeneration: active.ownerLeaseGeneration,
      kind: "predecessor-terminal",
      detail: { agentId: "alice" },
      commandId: "task-owner:proof-too-early",
    })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    await fixture.chair.revokeCapability({ agentId: "alice", commandId: "task-owner:revoke" });
    const proof = await fixture.chair.recordTaskOwnerRecoveryProof({
      taskId: active.taskId,
      ownerLeaseGeneration: active.ownerLeaseGeneration,
      kind: "predecessor-terminal",
      detail: { agentId: "alice" },
      commandId: "task-owner:proof",
    });
    const recovered = await fixture.chair.recoverTaskOwner({
      taskId: active.taskId,
      expectedRevision: active.revision,
      expectedOwnerLeaseGeneration: active.ownerLeaseGeneration,
      successorAgentId: "bob",
      proofId: proof.proofId,
      commandId: "task-owner:recover",
    });
    expect(recovered).toMatchObject({
      ownerAgentId: "bob",
      revision: active.revision + 1,
      ownerLeaseGeneration: active.ownerLeaseGeneration + 1,
    });
    await expect(fixture.alice.updateTask({
      taskId: active.taskId,
      expectedRevision: recovered.revision,
      state: "complete",
      commandId: "task-owner:stale-owner",
    })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });
});

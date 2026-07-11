import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createStage1Fixture } from "../../support/stage1-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("Stage 1 fenced write-lease recovery", () => {
  it("quarantines an expired scope until predecessor revocation or isolation is proven", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const lease = await fixture.alice.acquireWriteLease({
      scope: ["src/alice"],
      ttlMs: 1_000,
      commandId: "lease:alice:1",
    });
    expect(lease).toMatchObject({ holderAgentId: "alice", generation: 1, status: "active" });

    fixture.clock.advance(1_001);
    await expect(
      fixture.chair.acquireWriteLease({
        scope: ["src/alice/file.ts"],
        ttlMs: 1_000,
        commandId: "lease:bob:unproven-expired-overlap:1",
      }),
    ).rejects.toMatchObject({ code: "WRITE_SCOPE_RECOVERY_REQUIRED" });
    const recovery = await fixture.chair.recoverWriteLease({
      leaseId: lease.leaseId,
      expectedGeneration: 1,
      commandId: "lease:bob:recover:1",
      evidence: { kind: "unproven" },
    });
    expect(recovery).toMatchObject({ status: "quarantined", generation: 1 });
    await expect(
      fixture.chair.acquireWriteLease({
        scope: ["src/alice/file.ts"],
        ttlMs: 1_000,
        commandId: "lease:bob:overlap:1",
      }),
    ).rejects.toMatchObject({ code: "WRITE_SCOPE_QUARANTINED" });
    await expect(
      fixture.alice.renewWriteLease({
        leaseId: lease.leaseId,
        expectedGeneration: 1,
        ttlMs: 1_000,
        commandId: "lease:alice:stale-renew",
      }),
    ).rejects.toMatchObject({ code: "LEASE_QUARANTINED" });
  });

  it("raises the generation after terminal predecessor evidence and fences the old holder", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const lease = await fixture.alice.acquireWriteLease({
      scope: ["src/alice"],
      ttlMs: 1_000,
      commandId: "lease:alice:2",
    });
    fixture.clock.advance(1_001);

    await fixture.chair.recordRevocationProof({
      leaseId: lease.leaseId,
      generation: 1,
      kind: "predecessor-terminal",
      detail: { agentId: "alice", providerSessionRef: "session-alice" },
      commandId: "lease:chair:proof:2",
    });
    const successor = await fixture.chair.recoverWriteLease({
      leaseId: lease.leaseId,
      expectedGeneration: 1,
      commandId: "lease:bob:recover:2",
      evidence: {
        kind: "predecessor-terminal",
        agentId: "alice",
        providerSessionRef: "session-alice",
      },
    });
    expect(successor).toMatchObject({ holderAgentId: "chair", generation: 2, status: "active" });
    await expect(
      fixture.alice.renewWriteLease({
        leaseId: lease.leaseId,
        expectedGeneration: 1,
        ttlMs: 1_000,
        commandId: "lease:alice:stale-generation",
      }),
    ).rejects.toMatchObject({ code: "STALE_LEASE_GENERATION" });
  });
});

import { describe, expect, it } from "vitest";

import {
  LifecycleRotationDomain,
  lifecycleDigest,
  type LifecycleAgentSeed,
  type LifecycleProviderPort,
  type ProviderActionObservation,
  type ReplacementDispatch,
} from "../../../src/lifecycle/index.ts";

const digest = lifecycleDigest;
const PROJECT = "project-invariants";

function seed(overrides: Partial<LifecycleAgentSeed> = {}): LifecycleAgentSeed {
  return {
    projectSessionId: PROJECT,
    runId: "run-invariants",
    agentId: "chair",
    bridgeOwnerId: "chair",
    role: "chair",
    lifecycle: "ready",
    provider: {
      reference: "provider:chair:g1",
      providerGeneration: 1,
      contextRevision: 0,
      evidenceDigest: digest("e1"),
      historyDigest: digest("h1"),
    },
    sourceBinding: {
      capabilityHash: digest("source-capability"),
      custodyAction: { adapterId: "provider", actionId: "source-action" },
      adapterContractDigest: digest("source-contract"),
      bridgeRowId: "bridge:chair:1",
      bridgeRevision: 1,
      projectSessionGeneration: 1,
      runGeneration: 1,
      chairLeaseGeneration: 1,
    },
    principalGeneration: 1,
    bridgeGeneration: 1,
    taskRevision: 2,
    mailboxRevision: 3,
    childRevision: 4,
    writeRevision: 5,
    authorityRevision: 6,
    recoveryCheckpointState: "last-validated",
    recoveryCheckpointRef: "checkpoint:invariants",
    childIds: ["worker-b", "worker-a"],
    openWork: [
      { obligationId: "task-b", kind: "task", revision: 2 },
      { obligationId: "task-a", kind: "task", revision: 1 },
    ],
    turns: [{
      turnId: "caller",
      state: "active",
      providerGeneration: 1,
      principalGeneration: 1,
      bridgeGeneration: 1,
    }],
    writes: [{ custodyId: "write", state: "active" }],
    deliveries: [
      { deliveryId: "ready", sequence: 3, state: "ready", claimGeneration: null, required: true },
      { deliveryId: "accepted", sequence: 2, state: "provider-accepted", claimGeneration: 1, required: true },
      { deliveryId: "claimed", sequence: 1, state: "claimed", claimGeneration: 1, required: true },
    ],
    taskOwnerLeases: [],
    barriers: [],
    memberships: [],
    messageWatermark: 0,
    deliveryWatermark: 3,
    membershipWatermark: 0,
    archivalPlan: null,
    sourceCapabilityRevoked: false,
    principalRevoked: false,
    bridgeRevoked: false,
    ...overrides,
  };
}

const ambiguousProvider: LifecycleProviderPort = {
  async dispatchReplacement() { return { status: "ambiguous" }; },
  async lookupReplacement() { return { status: "ambiguous" }; },
};

function terminal(dispatch: ReplacementDispatch): ProviderActionObservation {
  return {
    status: "terminal",
    candidate: {
      provider: {
        reference: `provider:${dispatch.agentId}:g${String(dispatch.reservedProviderGeneration)}`,
        providerGeneration: dispatch.reservedProviderGeneration,
        contextRevision: 0,
        evidenceDigest: digest(`e-${dispatch.agentId}-2`),
        historyDigest: digest(`h-${dispatch.agentId}-2`),
      },
      principalGeneration: dispatch.reservedPrincipalGeneration,
      bridgeGeneration: dispatch.reservedBridgeGeneration,
      launchAttestation: {
        pair: dispatch.pair,
        operation: dispatch.operation,
        adapterContractDigest: dispatch.adapterContractDigest,
        projectSessionId: dispatch.projectSessionId,
        runId: dispatch.runId,
        agentId: dispatch.agentId,
        custodyRef: dispatch.custodyRef,
        challenge: dispatch.launchChallenge,
        checkpointDigest: dispatch.checkpoint.checkpointDigest,
        taskDigest: dispatch.checkpoint.taskDigest,
        mailboxDigest: dispatch.checkpoint.mailboxDigest,
        childDigest: dispatch.checkpoint.childDigest,
        openWorkDigest: dispatch.checkpoint.openWorkDigest,
        adoptionDeliveryDigest: dispatch.checkpoint.adoptionDeliveryDigest,
        providerGeneration: dispatch.reservedProviderGeneration,
        principalGeneration: dispatch.reservedPrincipalGeneration,
        bridgeGeneration: dispatch.reservedBridgeGeneration,
      },
    },
  };
}

function request(domain: LifecycleRotationDomain, agentId: string, runId = "run-invariants") {
  const agent = domain.inspectAgent(PROJECT, runId, agentId);
  return domain.requestRotation({
    commandId: `rotate-${agentId}`,
    projectSessionId: PROJECT,
    runId: agent.runId,
    agentId,
    action: "rotate",
    auth: {
      providerGeneration: agent.provider.providerGeneration,
      principalGeneration: agent.principalGeneration,
      bridgeGeneration: agent.bridgeGeneration,
    },
    checkpoint: domain.checkpoint(PROJECT, runId, agentId),
    adapterId: "provider",
    actionId: `rotate-${agentId}:daemon-action`,
    adapterContractDigest: digest("replacement-contract"),
    operation: "launch",
  });
}

describe("Spec 05 exact lifecycle vectors", () => {
  it("canonicalizes ordering while binding task, mailbox, child, open-work and adoption-delivery state", () => {
    const base = seed();
    const reordered = seed({
      childIds: [...base.childIds].reverse(),
      openWork: [...base.openWork].reverse(),
      deliveries: [...base.deliveries].reverse(),
    });
    const left = new LifecycleRotationDomain({ provider: ambiguousProvider }, [base]).checkpoint(PROJECT, "run-invariants", "chair");
    const right = new LifecycleRotationDomain({ provider: ambiguousProvider }, [reordered]).checkpoint(PROJECT, "run-invariants", "chair");
    expect(right).toEqual(left);

    const readyChanged = new LifecycleRotationDomain({ provider: ambiguousProvider }, [seed({
      deliveries: [...base.deliveries, {
        deliveryId: "successor-pending",
        sequence: 4,
        state: "ready",
        claimGeneration: null,
        required: true,
      }],
    })]).checkpoint(PROJECT, "run-invariants", "chair");
    expect(readyChanged).toEqual(left);

    const taskChanged = new LifecycleRotationDomain({ provider: ambiguousProvider }, [seed({ taskRevision: 3 })])
      .checkpoint(PROJECT, "run-invariants", "chair");
    expect(taskChanged.taskDigest).not.toBe(left.taskDigest);
    expect(taskChanged.checkpointDigest).not.toBe(left.checkpointDigest);

    const childChanged = new LifecycleRotationDomain({ provider: ambiguousProvider }, [seed({ childRevision: 5 })])
      .checkpoint(PROJECT, "run-invariants", "chair");
    expect(childChanged.childDigest).not.toBe(left.childDigest);

    const workChanged = new LifecycleRotationDomain({ provider: ambiguousProvider }, [seed({
      openWork: [{ obligationId: "task-a", kind: "task", revision: 9 }],
    })]).checkpoint(PROJECT, "run-invariants", "chair");
    expect(workChanged.openWorkDigest).not.toBe(left.openWorkDigest);

    const deliveryChanged = new LifecycleRotationDomain({ provider: ambiguousProvider }, [seed({
      deliveries: base.deliveries.map((delivery) => delivery.deliveryId === "claimed"
        ? { ...delivery, claimGeneration: 2 }
        : delivery),
    })]).checkpoint(PROJECT, "run-invariants", "chair");
    expect(deliveryChanged.mailboxDigest).not.toBe(left.mailboxDigest);
    expect(deliveryChanged.adoptionDeliveryDigest).not.toBe(left.adoptionDeliveryDigest);
    expect(deliveryChanged.openWorkDigest).not.toBe(left.openWorkDigest);
  });

  it("rolls back all admission mutations when any supplied vector digest is stale", () => {
    const domain = new LifecycleRotationDomain({ provider: ambiguousProvider }, [seed()]);
    const checkpoint = domain.checkpoint(PROJECT, "run-invariants", "chair");

    expect(() => domain.requestRotation({
      commandId: "stale",
      projectSessionId: PROJECT,
      runId: "run-invariants",
      agentId: "chair",
      action: "rotate",
      auth: { providerGeneration: 1, principalGeneration: 1, bridgeGeneration: 1 },
      checkpoint: { ...checkpoint, openWorkDigest: digest("stale") },
      adapterId: "provider",
      actionId: "stale:daemon-action",
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
    })).toThrow(expect.objectContaining({ code: "CHECKPOINT_MISMATCH" }));
    expect(domain.inspectAgent(PROJECT, "run-invariants", "chair")).toMatchObject({
      lifecycle: "ready",
      claimsFrozen: false,
      writes: [{ state: "active" }],
    });
    expect(domain.inspectHighWater(PROJECT, "run-invariants", "chair")).toEqual({
      providerGeneration: 1,
      principalGeneration: 1,
      bridgeGeneration: 1,
    });
  });
});

describe("Spec 05 lifecycle capability and custody isolation", () => {
  it("uses the canonical closed adapter/action pair and keeps operation outside identity", () => {
    const domain = new LifecycleRotationDomain({ provider: ambiguousProvider }, [seed()]);
    const accepted = request(domain, "chair");
    const custody = domain.inspectCustody(PROJECT, "run-invariants", accepted.custodyRef);

    expect(custody.pair).toEqual({
      adapterId: "provider",
      actionId: "rotate-chair:daemon-action",
    });
    expect(custody).toMatchObject({ providerOperation: "launch" });
  });

  it("scopes every agent-facing read when project sessions reuse one run and agent ID", () => {
    const first = seed({ projectSessionId: "project-a", runId: "shared-run", taskRevision: 2 });
    const second = seed({
      projectSessionId: "project-b",
      runId: "shared-run",
      taskRevision: 9,
      sourceBinding: {
        ...seed().sourceBinding,
        custodyAction: { adapterId: "provider", actionId: "source-action-project-b" },
      },
    });
    const domain = new LifecycleRotationDomain({ provider: ambiguousProvider }, [first, second]);

    expect(domain.checkpoint("project-a", "shared-run", "chair").taskDigest).not.toBe(
      domain.checkpoint("project-b", "shared-run", "chair").taskDigest,
    );
    expect(domain.inspectAgent("project-a", "shared-run", "chair").projectSessionId).toBe("project-a");
    expect(domain.inspectAgent("project-b", "shared-run", "chair").projectSessionId).toBe("project-b");
  });

  it("limits predecessor and staged capabilities and freezes both claims and acknowledgements", async () => {
    const domain = new LifecycleRotationDomain({ provider: ambiguousProvider }, [seed()]);
    const accepted = request(domain, "chair");

    expect(domain.authorizeOperation(PROJECT, "run-invariants", "chair", 1, "lifecycle.read")).toBe(true);
    expect(domain.authorizeOperation(PROJECT, "run-invariants", "chair", 1, "write.acquire")).toBe(false);
    expect(domain.authorizeOperation(PROJECT, "run-invariants", "chair", 2, "launch.attest")).toBe(true);
    expect(domain.authorizeOperation(PROJECT, "run-invariants", "chair", 2, "mailbox.claim")).toBe(false);
    expect(domain.authorizeOperation(PROJECT, "run-invariants", "chair", 99, "lifecycle.read")).toBe(false);
    expect(() => domain.claimDelivery(PROJECT, "run-invariants", "chair", "ready", 1))
      .toThrow(expect.objectContaining({ code: "DELIVERY_CLAIMS_FROZEN" }));
    expect(() => domain.acknowledgeDelivery(PROJECT, "run-invariants", "chair", "claimed", 1))
      .toThrow(expect.objectContaining({ code: "DELIVERY_ACKS_FROZEN" }));

    domain.markTurnTerminal(PROJECT, "run-invariants", "chair", "caller");
    await domain.driveRotation(PROJECT, "run-invariants", accepted.custodyRef);
  });

  it("adopts child custody without swapping chair custody or emitting a chair review cut", async () => {
    const reviewCuts: string[] = [];
    const provider: LifecycleProviderPort = {
      async dispatchReplacement(dispatch) { return terminal(dispatch); },
      async lookupReplacement() { return { status: "ambiguous" }; },
    };
    const child = seed({
      agentId: "worker",
      bridgeOwnerId: "worker",
      role: "child",
      sourceBinding: {
        ...seed().sourceBinding,
        custodyAction: { adapterId: "provider", actionId: "source-action-worker" },
        bridgeRowId: "bridge:worker:1",
        chairLeaseGeneration: null,
      },
      provider: { ...seed().provider, reference: "provider:worker:g1" },
      childIds: [],
      openWork: [],
      writes: [],
      deliveries: [],
      turns: [{ ...seed().turns[0]!, turnId: "worker-caller" }],
    });
    const domain = new LifecycleRotationDomain({
      provider,
      reviewCertification: {
        commitReviewAdoption(input) {
          reviewCuts.push(input.lifecycleCustodyRef.custodyId);
          input.commitLifecycleAdoption({ kind: "no-current-target" });
        },
      },
    }, [seed(), child]);
    const accepted = request(domain, "worker");
    domain.markTurnTerminal(PROJECT, "run-invariants", "worker", "worker-caller");

    expect(await domain.driveRotation(PROJECT, "run-invariants", accepted.custodyRef)).toMatchObject({ disposition: "adopted" });
    expect(domain.inspectAgent(PROJECT, "run-invariants", "worker")).toMatchObject({
      provider: { providerGeneration: 2, reference: "provider:worker:g2" },
      principalGeneration: 2,
      bridgeGeneration: 2,
    });
    expect(domain.inspectAgent(PROJECT, "run-invariants", "chair")).toMatchObject({
      lifecycle: "ready",
      provider: { providerGeneration: 1, reference: "provider:chair:g1" },
      principalGeneration: 1,
      bridgeGeneration: 1,
    });
    expect(reviewCuts).toEqual([]);
  });
});

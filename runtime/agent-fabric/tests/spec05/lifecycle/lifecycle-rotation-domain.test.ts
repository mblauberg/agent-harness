import { describe, expect, it } from "vitest";

import {
  LifecycleRotationDomain,
  lifecycleDigest,
  type LifecycleDomainPorts,
  type LifecycleAgentSeed,
  type LifecycleProviderPort,
  type ProviderActionObservation,
  type ReplacementDispatch,
} from "../../../src/lifecycle/index.ts";

const digest = lifecycleDigest;
const PROJECT = "project-1";

function agentSeed(overrides: Partial<LifecycleAgentSeed> = {}): LifecycleAgentSeed {
  return {
    projectSessionId: PROJECT,
    runId: "run-1",
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
      custodyAction: { adapterId: "claude-code", actionId: "source-action" },
      adapterContractDigest: digest("source-contract"),
      bridgeRowId: "bridge:chair:1",
      bridgeRevision: 1,
      projectSessionGeneration: 1,
      runGeneration: 1,
      chairLeaseGeneration: 1,
    },
    principalGeneration: 1,
    bridgeGeneration: 1,
    taskRevision: 4,
    mailboxRevision: 7,
    childRevision: 2,
    writeRevision: 3,
    authorityRevision: 1,
    recoveryCheckpointState: "last-validated",
    recoveryCheckpointRef: "checkpoint:rotation",
    childIds: ["worker-a"],
    openWork: [{ obligationId: "task-a", kind: "task", revision: 4 }],
    turns: [{
      turnId: "turn-caller",
      state: "active",
      providerGeneration: 1,
      principalGeneration: 1,
      bridgeGeneration: 1,
    }],
    writes: [{ custodyId: "lease-a", state: "active" }],
    deliveries: [{ deliveryId: "claimed-a", sequence: 1, state: "claimed", claimGeneration: 1, required: true }],
    taskOwnerLeases: [],
    barriers: [],
    memberships: [],
    messageWatermark: 0,
    deliveryWatermark: 1,
    membershipWatermark: 0,
    archivalPlan: null,
    sourceCapabilityRevoked: false,
    principalRevoked: false,
    bridgeRevoked: false,
    ...overrides,
  };
}

class RecordingProvider implements LifecycleProviderPort {
  readonly dispatches: ReplacementDispatch[] = [];
  result: ((request: ReplacementDispatch) => ProviderActionObservation) | undefined;

  async dispatchReplacement(request: ReplacementDispatch) {
    this.dispatches.push(request);
    return this.result?.(request) ?? { status: "ambiguous" as const };
  }

  async lookupReplacement() {
    return { status: "ambiguous" as const };
  }
}

function request(domain: LifecycleRotationDomain, agentId = "chair", commandId = `rotate-${agentId}-1`) {
  const agent = domain.inspectAgent(PROJECT, "run-1", agentId);
  return domain.requestRotation({
    commandId,
    projectSessionId: PROJECT,
    runId: agent.runId,
    agentId,
    action: "rotate",
    auth: {
      providerGeneration: agent.provider.providerGeneration,
      principalGeneration: agent.principalGeneration,
      bridgeGeneration: agent.bridgeGeneration,
    },
    checkpoint: domain.checkpoint(PROJECT, "run-1", agentId),
    adapterId: "claude-code",
    actionId: `${commandId}:daemon-action`,
    adapterContractDigest: digest("replacement-contract"),
    operation: "launch",
  });
}

function terminalCandidate(dispatch: ReplacementDispatch): ProviderActionObservation {
  return {
    status: "terminal",
    candidate: {
      provider: {
        reference: `provider:${dispatch.agentId}:g${String(dispatch.reservedProviderGeneration)}`,
        providerGeneration: dispatch.reservedProviderGeneration,
        contextRevision: 0,
        evidenceDigest: digest(`e${String(dispatch.reservedProviderGeneration)}`),
        historyDigest: digest(`new-history-${dispatch.agentId}`),
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

describe("Spec 05 lifecycle rotation admission", () => {
  it("returns accepted and suspended only after predecessor writes are quarantined and before provider I/O", () => {
    const provider = new RecordingProvider();
    const domain = new LifecycleRotationDomain({ provider }, [agentSeed()]);
    const checkpoint = domain.checkpoint(PROJECT, "run-1", "chair");

    const accepted = domain.requestRotation({
      commandId: "rotate-chair-1",
      projectSessionId: PROJECT,
      runId: "run-1",
      agentId: "chair",
      action: "rotate",
      auth: { providerGeneration: 1, principalGeneration: 1, bridgeGeneration: 1 },
      checkpoint,
      adapterId: "claude-code",
      actionId: "rotate-chair-1:daemon-action",
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
    });

    expect(accepted).toMatchObject({
      lifecycle: "suspended",
      phase: "awaiting-boundary",
      providerGeneration: 1,
      reservedProviderGeneration: 2,
      reservedPrincipalGeneration: 2,
      reservedBridgeGeneration: 2,
    });
    expect(domain.inspectAgent(PROJECT, "run-1", "chair")).toMatchObject({
      lifecycle: "suspended",
      claimsFrozen: true,
      writes: [{ custodyId: "lease-a", state: "lifecycle-quarantined" }],
    });
    expect(domain.inspectCustody(PROJECT, "run-1", accepted.custodyRef).phase).toBe("awaiting-boundary");
    expect(provider.dispatches).toEqual([]);
  });

  it.each([
    ["zero", [{ ...agentSeed().turns[0]!, state: "terminal" as const }]],
    ["multiple", [
      agentSeed().turns[0]!,
      { ...agentSeed().turns[0]!, turnId: "turn-other" },
    ]],
    ["foreign", [{ ...agentSeed().turns[0]!, principalGeneration: 9 }]],
    ["quarantined predecessor", [
      agentSeed().turns[0]!,
      { ...agentSeed().turns[0]!, turnId: "turn-quarantined", state: "quarantined" as const },
    ]],
  ])("rejects %s caller-turn inference without mutating custody", (_label, turns) => {
    const provider = new RecordingProvider();
    const domain = new LifecycleRotationDomain({ provider }, [agentSeed({ turns })]);

    expect(() => request(domain)).toThrow(expect.objectContaining({ code: "CALLER_TURN_NOT_UNIQUE" }));
    expect(domain.inspectAgent(PROJECT, "run-1", "chair")).toMatchObject({
      lifecycle: "ready",
      claimsFrozen: false,
      writes: [{ state: "active" }],
    });
    expect(domain.inspectHighWater(PROJECT, "run-1", "chair")).toEqual({
      providerGeneration: 1,
      principalGeneration: 1,
      bridgeGeneration: 1,
    });
    expect(provider.dispatches).toEqual([]);
  });

  it("ratchets provider and principal generations globally per agent and bridge generations per owner", () => {
    const provider = new RecordingProvider();
    const child = agentSeed({
      agentId: "worker-a",
      role: "child",
      sourceBinding: {
        ...agentSeed().sourceBinding,
        custodyAction: { adapterId: "claude-code", actionId: "source-action-worker-a" },
        bridgeRowId: "bridge:worker-a:1",
        chairLeaseGeneration: null,
      },
      bridgeOwnerId: "chair",
      bridgeGeneration: 2,
      provider: { ...agentSeed().provider, reference: "provider:worker-a:g1" },
      childIds: [],
      turns: [{ ...agentSeed().turns[0]!, turnId: "turn-worker", bridgeGeneration: 2 }],
      writes: [],
      deliveries: [],
    });
    const domain = new LifecycleRotationDomain({ provider }, [agentSeed(), child]);

    expect(request(domain, "chair")).toMatchObject({
      reservedProviderGeneration: 2,
      reservedPrincipalGeneration: 2,
      reservedBridgeGeneration: 3,
    });
    expect(request(domain, "worker-a")).toMatchObject({
      reservedProviderGeneration: 2,
      reservedPrincipalGeneration: 2,
      reservedBridgeGeneration: 4,
    });
    expect(domain.inspectHighWater(PROJECT, "run-1", "chair")).toEqual({
      providerGeneration: 2,
      principalGeneration: 2,
      bridgeGeneration: 4,
    });
    expect(domain.inspectHighWater(PROJECT, "run-1", "worker-a")).toEqual({
      providerGeneration: 2,
      principalGeneration: 2,
      bridgeGeneration: 4,
    });
  });

  it("replays one immutable acceptance and rejects changed input under the command ID", () => {
    const domain = new LifecycleRotationDomain({ provider: new RecordingProvider() }, [agentSeed()]);
    const input = {
      commandId: "rotate-chair-1",
      projectSessionId: PROJECT,
      runId: "run-1",
      agentId: "chair",
      action: "rotate" as const,
      auth: { providerGeneration: 1, principalGeneration: 1, bridgeGeneration: 1 },
      checkpoint: domain.checkpoint(PROJECT, "run-1", "chair"),
      adapterId: "claude-code",
      actionId: "rotate-chair-1:daemon-action",
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
    };
    const accepted = domain.requestRotation(input);
    const replay = domain.requestRotation(input);

    expect(replay).toBe(accepted);
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(() => domain.requestRotation({
      ...input,
      action: "compact",
    })).toThrow(expect.objectContaining({ code: "COMMAND_CONFLICT" }));
  });
});

describe("Spec 05 lifecycle adoption", () => {
  it("waits for the caller boundary, adopts an exactly attested fresh context, and leaves ready mail successor-pending", async () => {
    const provider = new RecordingProvider();
    provider.result = terminalCandidate;
    const reviewDecisions: string[] = [];
    const ports: LifecycleDomainPorts = {
      provider,
      reviewCertification: {
        commitReviewAdoption(input) {
          reviewDecisions.push(input.lifecycleCustodyRef.custodyId);
          const cutPreimage = {
            schemaVersion: 1 as const,
            runId: "run-1",
            targetGeneration: 3,
            predecessorBindingGeneration: 2,
            predecessorBindingDigest: digest("prior-binding"),
            terminalSequenceHighWater: 7,
            lifecycleCustodyRef: input.lifecycleCustodyRef,
            lifecycleAdoptionEvidenceDigest: input.lifecycleAdoptionEvidenceDigest,
          };
          const decision = {
            kind: "rebound" as const,
            cut: { ...cutPreimage, cutDigest: lifecycleDigest(cutPreimage) },
            rebindReceiptDigest: digest("rebind-receipt"),
          };
          expect(input.commitLifecycleAdoption(decision)).toBe(true);
        },
      },
    };
    const domain = new LifecycleRotationDomain(ports, [agentSeed()]);
    const accepted = request(domain);

    expect(() => domain.claimDelivery(PROJECT, "run-1", "chair", "claimed-a", 1))
      .toThrow(expect.objectContaining({ code: "DELIVERY_CLAIMS_FROZEN" }));
    expect(domain.enqueueDelivery(PROJECT, "run-1", "chair", {
      deliveryId: "ready-during-suspension",
      sequence: 2,
      state: "ready",
      claimGeneration: null,
      required: true,
    })).toMatchObject({ state: "ready", claimGeneration: null });
    expect(provider.dispatches).toHaveLength(0);

    const transitions = domain.markTurnTerminal(PROJECT, "run-1", "chair", "turn-caller");
    expect(transitions).toContainEqual(expect.objectContaining({ phase: "prepared" }));
    const adopted = await domain.driveRotation(PROJECT, "run-1", accepted.custodyRef);

    expect(adopted).toMatchObject({
      phase: "finalized",
      disposition: "adopted",
      reviewDecision: {
        kind: "rebound",
        cut: {
          targetGeneration: 3,
          predecessorBindingGeneration: 2,
          terminalSequenceHighWater: 7,
          lifecycleCustodyRef: { custodyId: accepted.custodyRef, custodyRevision: 1 },
        },
      },
    });
    expect(adopted.history).toEqual([
      "awaiting-boundary",
      "prepared",
      "dispatched",
      "provider-terminal",
      "committing",
      "adopted",
    ]);
    expect(domain.inspectAgent(PROJECT, "run-1", "chair")).toMatchObject({
      lifecycle: "ready",
      provider: { providerGeneration: 2, reference: "provider:chair:g2" },
      principalGeneration: 2,
      bridgeGeneration: 2,
      claimsFrozen: false,
      deliveries: expect.arrayContaining([
        expect.objectContaining({ deliveryId: "ready-during-suspension", state: "ready", claimGeneration: null }),
      ]),
    });
    expect(domain.claimDelivery(PROJECT, "run-1", "chair", "ready-during-suspension", 2)).toMatchObject({
      state: "claimed",
      claimGeneration: 2,
    });
    expect(reviewDecisions).toEqual([accepted.custodyRef]);
  });

  it("quarantines a same-history or incorrectly attested replacement and never publishes its generations", async () => {
    const provider = new RecordingProvider();
    provider.result = (dispatch) => {
      const result = terminalCandidate(dispatch);
      if (result.status !== "terminal") throw new Error("terminal candidate expected");
      return {
        ...result,
        candidate: {
          ...result.candidate,
          provider: { ...result.candidate.provider, historyDigest: dispatch.sourceProvider.historyDigest },
          launchAttestation: { ...result.candidate.launchAttestation, challenge: digest("wrong-challenge") },
        },
      };
    };
    const domain = new LifecycleRotationDomain({ provider }, [agentSeed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-1", "chair", "turn-caller");

    const result = await domain.driveRotation(PROJECT, "run-1", accepted.custodyRef);

    expect(result).toMatchObject({ phase: "finalized", disposition: "quarantined" });
    expect(domain.inspectAgent(PROJECT, "run-1", "chair")).toMatchObject({
      lifecycle: "recovery-required",
      provider: { providerGeneration: 1 },
      principalGeneration: 1,
      bridgeGeneration: 1,
    });
    expect(domain.inspectHighWater(PROJECT, "run-1", "chair")).toEqual({
      providerGeneration: 2,
      principalGeneration: 2,
      bridgeGeneration: 2,
    });
  });

  it("does not swallow a malformed transaction-owner review decision", async () => {
    const provider = new RecordingProvider();
    provider.result = terminalCandidate;
    const domain = new LifecycleRotationDomain({
      provider,
      reviewCertification: {
        commitReviewAdoption(input) {
          input.commitLifecycleAdoption(
            { kind: "stale", reason: "same-subject-predicate-failed" } as never,
          );
        },
      },
    }, [agentSeed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-1", "chair", "turn-caller");

    await expect(domain.driveRotation(PROJECT, "run-1", accepted.custodyRef)).rejects.toMatchObject({
      code: "REVIEW_ADOPTION_DECISION_INVALID",
    });
    expect(domain.inspectAgent(PROJECT, "run-1", "chair")).toMatchObject({
      lifecycle: "suspended",
      provider: { providerGeneration: 1 },
    });
  });

  it("emits no review decision when the source CAS loses inside the transaction owner", async () => {
    const provider = new RecordingProvider();
    provider.result = terminalCandidate;
    const committedReviewDecisions: string[] = [];
    let domain!: LifecycleRotationDomain;
    domain = new LifecycleRotationDomain({
      provider,
      reviewCertification: {
        commitReviewAdoption(input) {
          domain.advanceRevision(PROJECT, "run-1", "chair", "task");
          if (input.commitLifecycleAdoption({ kind: "no-current-target" })) {
            committedReviewDecisions.push(input.lifecycleCustodyRef.custodyId);
          }
        },
      },
    }, [agentSeed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-1", "chair", "turn-caller");

    await expect(domain.driveRotation(PROJECT, "run-1", accepted.custodyRef)).resolves.toMatchObject({
      phase: "finalized",
      disposition: "superseded",
      reviewDecision: null,
    });
    expect(committedReviewDecisions).toEqual([]);
    expect(domain.inspectAgent(PROJECT, "run-1", "chair")).toMatchObject({
      lifecycle: "ready",
      provider: { providerGeneration: 1 },
      principalGeneration: 1,
      bridgeGeneration: 1,
    });
  });

  it("serializes context observation behind active custody", () => {
    const provider = new RecordingProvider();
    const domain = new LifecycleRotationDomain({ provider }, [agentSeed()]);
    const accepted = request(domain);
    expect(() => domain.observeContext({
      sourceEventId: "unannounced-context",
      projectSessionId: PROJECT,
      runId: "run-1",
      agentId: "chair",
      providerGeneration: 3,
      contextRevision: 0,
      evidenceDigest: digest("unannounced"),
    })).toThrow(expect.objectContaining({ code: "LIFECYCLE_CUSTODY_ACTIVE" }));
    expect(domain.inspectCustody(PROJECT, "run-1", accepted.custodyRef)).toMatchObject({ phase: "awaiting-boundary" });
  });
});

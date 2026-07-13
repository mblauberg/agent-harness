import { describe, expect, it } from "vitest";

import {
  LifecycleRotationDomain,
  lifecycleDigest,
  type LifecycleAgentSeed,
  type LifecycleDomainSnapshotV1,
  type LifecycleProviderPort,
  type ProviderActionObservation,
  type ReplacementDispatch,
} from "../../../src/lifecycle/index.ts";
import { abandonRecoveryIssue, freshRecoveryIssue, trustedRecoveryAuthority } from "./recovery-issue-fixture.ts";

const digest = lifecycleDigest;
const PROJECT = "project-third";

function sourceBinding() {
  return {
    capabilityHash: digest("source-capability"),
    custodyAction: { adapterId: "claude-code", actionId: "source-action" },
    adapterContractDigest: digest("source-contract"),
    bridgeRowId: "bridge:chair:1",
    bridgeRevision: 5,
    projectSessionGeneration: 11,
    runGeneration: 13,
    chairLeaseGeneration: 17,
  };
}

function seed(overrides: Record<string, unknown> = {}): LifecycleAgentSeed {
  return {
    projectSessionId: PROJECT,
    runId: "run-third",
    agentId: "chair",
    bridgeOwnerId: "chair",
    role: "chair",
    lifecycle: "ready",
    provider: {
      reference: "provider:chair:g1",
      providerGeneration: 1,
      contextRevision: 0,
      evidenceDigest: digest("source-evidence"),
      historyDigest: digest("source-history"),
    },
    sourceBinding: sourceBinding(),
    principalGeneration: 1,
    bridgeGeneration: 1,
    taskRevision: 1,
    mailboxRevision: 1,
    childRevision: 1,
    writeRevision: 1,
    authorityRevision: 1,
    childIds: [],
    openWork: [{ obligationId: "task-a", kind: "task", revision: 1 }],
    turns: [{
      turnId: "caller",
      state: "active",
      providerGeneration: 1,
      principalGeneration: 1,
      bridgeGeneration: 1,
    }],
    writes: [{ custodyId: "write-a", state: "active" }],
    deliveries: [{ deliveryId: "delivery-a", sequence: 1, state: "claimed", claimGeneration: 1, required: true }],
    taskOwnerLeases: [{ leaseId: "task-owner-a", state: "active" }],
    barriers: [{ barrierId: "barrier-a", state: "active" }],
    memberships: [{ membershipId: "membership-a", kind: "run", state: "active" }],
    messageWatermark: 0,
    deliveryWatermark: 1,
    membershipWatermark: 0,
    archivalPlan: null,
    sourceCapabilityRevoked: false,
    principalRevoked: false,
    bridgeRevoked: false,
    ...overrides,
  } as unknown as LifecycleAgentSeed;
}

function terminal(dispatch: ReplacementDispatch): ProviderActionObservation {
  return {
    status: "terminal",
    candidate: {
      provider: {
        reference: `provider:${dispatch.agentId}:g${String(dispatch.reservedProviderGeneration)}`,
        providerGeneration: dispatch.reservedProviderGeneration,
        contextRevision: 0,
        evidenceDigest: digest("replacement-evidence"),
        historyDigest: digest(`replacement-history:${dispatch.runId}`),
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

class TerminalProvider implements LifecycleProviderPort {
  readonly dispatches: ReplacementDispatch[] = [];

  async dispatchReplacement(dispatch: ReplacementDispatch): Promise<ProviderActionObservation> {
    this.dispatches.push(dispatch);
    return terminal(dispatch);
  }

  async lookupReplacement(): Promise<ProviderActionObservation> {
    return { status: "ambiguous" };
  }
}

function request(domain: LifecycleRotationDomain, overrides: Record<string, unknown> = {}) {
  return domain.requestRotation({
    commandId: "rotate-third",
    projectSessionId: PROJECT,
    runId: "run-third",
    agentId: "chair",
    action: "rotate",
    auth: { providerGeneration: 1, principalGeneration: 1, bridgeGeneration: 1 },
    checkpoint: domain.checkpoint(PROJECT, "run-third", "chair"),
    adapterId: "claude-code",
    actionId: "daemon-action-third",
    adapterContractDigest: digest("replacement-contract"),
    operation: "launch",
    ...overrides,
  } as never);
}

function sealSnapshot(snapshot: Record<string, unknown>): LifecycleDomainSnapshotV1 {
  const { snapshotDigest: _ignored, ...preimage } = snapshot;
  return { ...preimage, snapshotDigest: lifecycleDigest(preimage) } as unknown as LifecycleDomainSnapshotV1;
}

function reboundDecision(input: {
  lifecycleCustodyRef: object;
  lifecycleAdoptionEvidenceDigest: string;
}) {
  const cutPreimage = {
    schemaVersion: 1 as const,
    runId: "run-third",
    targetGeneration: 2,
    predecessorBindingGeneration: 1,
    predecessorBindingDigest: digest("predecessor-binding"),
    terminalSequenceHighWater: 1,
    lifecycleCustodyRef: input.lifecycleCustodyRef,
    lifecycleAdoptionEvidenceDigest: input.lifecycleAdoptionEvidenceDigest,
  };
  return {
    kind: "rebound" as const,
    cut: { ...cutPreimage, cutDigest: lifecycleDigest(cutPreimage) },
    rebindReceiptDigest: digest("rebind"),
  };
}

describe("Spec 05 lifecycle closed durable snapshot", () => {
  it("seals the exact schema and rejects any unsealed field change", () => {
    const domain = new LifecycleRotationDomain({ provider: new TerminalProvider() }, [seed()]);
    const snapshot = domain.snapshot() as unknown as Record<string, unknown>;
    const { snapshotDigest, ...preimage } = snapshot;

    expect(snapshotDigest).toBe(lifecycleDigest(preimage));
    expect(Object.keys(snapshot).sort()).toEqual([
      "agents",
      "audits",
      "bridgeHighWater",
      "commands",
      "contextEvents",
      "custodies",
      "freshRotationCommitDigests",
      "freshRotations",
      "losses",
      "principalHighWater",
      "providerHighWater",
      "recoveryIssues",
      "schemaVersion",
      "snapshotDigest",
    ]);

    expect(() => LifecycleRotationDomain.hydrate(
      { provider: new TerminalProvider() },
      { ...snapshot, unexpected: true } as unknown as LifecycleDomainSnapshotV1,
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it.each([
    ["agent field", (snapshot: any) => { snapshot.agents[0].taskRevision += 1; }],
    ["custody collection", (snapshot: any) => { snapshot.custodies.push({ forged: true }); }],
    ["command collection", (snapshot: any) => { snapshot.commands.push({ key: "forged", custodyRef: "forged" }); }],
    ["high-water", (snapshot: any) => { snapshot.providerHighWater[0].value += 1; }],
    ["principal high-water", (snapshot: any) => { snapshot.principalHighWater[0].value += 1; }],
    ["bridge high-water", (snapshot: any) => { snapshot.bridgeHighWater[0].value += 1; }],
    ["context event collection", (snapshot: any) => { snapshot.contextEvents.push({ forged: true }); }],
    ["loss collection", (snapshot: any) => { snapshot.losses.push({ forged: true }); }],
    ["audit field", (snapshot: any) => { snapshot.audits.push({ kind: "forged", projectSessionId: PROJECT, runId: "run-third", agentId: "chair", sourceId: "x", detail: "x" }); }],
    ["fresh preview collection", (snapshot: any) => { snapshot.freshRotations.push({ forged: true }); }],
    ["fresh commit collection", (snapshot: any) => { snapshot.freshRotationCommitDigests.push({ forged: true }); }],
  ])("rejects an unsealed %s tamper", (_label, mutate) => {
    const domain = new LifecycleRotationDomain({ provider: new TerminalProvider() }, [seed()]);
    const tampered = structuredClone(domain.snapshot()) as any;
    mutate(tampered);

    expect(() => LifecycleRotationDomain.hydrate({ provider: new TerminalProvider() }, tampered))
      .toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it("rejects resealed dangling correlations and high-water values below durable targets", () => {
    const domain = new LifecycleRotationDomain({ provider: new TerminalProvider() }, [seed()]);
    const accepted = request(domain);
    const dangling = structuredClone(domain.snapshot()) as any;
    dangling.commands[0].custodyRef = "missing-custody";
    const lowWaters = ["providerHighWater", "principalHighWater", "bridgeHighWater"].map((field) => {
      const snapshot = structuredClone(domain.snapshot()) as any;
      snapshot[field][0].value = 1;
      return snapshot;
    });

    expect(() => LifecycleRotationDomain.hydrate(
      { provider: new TerminalProvider() },
      sealSnapshot(dangling),
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
    for (const lowWater of lowWaters) {
      expect(() => LifecycleRotationDomain.hydrate(
        { provider: new TerminalProvider() },
        sealSnapshot(lowWater),
      )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
    }
    expect(accepted.reservedProviderGeneration).toBe(2);
  });
});

describe("Spec 05 lifecycle atomic review adoption", () => {
  it("makes final custody and review decision visible inside the transaction callback", async () => {
    const provider = new TerminalProvider();
    let domain!: LifecycleRotationDomain;
    let observedInside: unknown;
    domain = new LifecycleRotationDomain({
      provider,
      reviewCertification: {
        commitReviewAdoption(input) {
          expect(input.commitLifecycleAdoption(reboundDecision(input) as never)).toBe(true);
          observedInside = domain.inspectCustody(PROJECT, "run-third", input.lifecycleCustodyRef.custodyId);
        },
      },
    }, [seed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-third", "chair", "caller");

    await domain.driveRotation(PROJECT, "run-third", accepted.custodyRef);
    expect(observedInside).toMatchObject({
      phase: "finalized",
      disposition: "adopted",
      reviewDecision: { kind: "rebound" },
    });
  });

  it("rolls back lifecycle, decision and finalization when the transaction owner throws", async () => {
    const provider = new TerminalProvider();
    const domain = new LifecycleRotationDomain({
      provider,
      reviewCertification: {
        commitReviewAdoption(input) {
          input.commitLifecycleAdoption(reboundDecision(input) as never);
          throw new Error("review transaction rollback");
        },
      },
    }, [seed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-third", "chair", "caller");

    await expect(domain.driveRotation(PROJECT, "run-third", accepted.custodyRef)).rejects.toThrow("review transaction rollback");
    expect(domain.inspectAgent(PROJECT, "run-third", "chair")).toMatchObject({
      lifecycle: "suspended",
      provider: { providerGeneration: 1 },
      principalGeneration: 1,
      bridgeGeneration: 1,
    });
    expect(domain.inspectCustody(PROJECT, "run-third", accepted.custodyRef)).toMatchObject({
      phase: "provider-terminal",
      disposition: null,
      reviewDecision: null,
    });
  });

  it("rolls back when the transaction owner returns without committing", async () => {
    const provider = new TerminalProvider();
    const domain = new LifecycleRotationDomain({
      provider,
      reviewCertification: { commitReviewAdoption() {} },
    }, [seed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-third", "chair", "caller");

    await expect(domain.driveRotation(PROJECT, "run-third", accepted.custodyRef)).rejects.toMatchObject({
      code: "REVIEW_ADOPTION_DECISION_INVALID",
    });
    expect(domain.inspectAgent(PROJECT, "run-third", "chair")).toMatchObject({
      lifecycle: "suspended",
      provider: { providerGeneration: 1 },
    });
    expect(domain.inspectCustody(PROJECT, "run-third", accepted.custodyRef)).toMatchObject({
      phase: "provider-terminal",
      disposition: null,
      reviewDecision: null,
    });
  });
});

describe("Spec 05 asynchronous operator fresh rotation", () => {
  it("Commit accepts no candidate or provider I/O and creates a distinct awaiting-boundary custody", async () => {
    const provider = new TerminalProvider();
    const domain = new LifecycleRotationDomain({ provider, recoveryAuthority: trustedRecoveryAuthority }, [seed({ turns: [] })]);
    const lossId = domain.observeContext({
      sourceEventId: "loss-for-fresh",
      projectSessionId: PROJECT,
      runId: "run-third",
      agentId: "chair",
      providerGeneration: 3,
      contextRevision: 0,
      evidenceDigest: digest("loss-for-fresh"),
    }).lossId!;
    const pair = { adapterId: "claude-code", actionId: "daemon-fresh-action" };
    const beforeHighWater = domain.inspectHighWater(PROJECT, "run-third", "chair");
    const issueId = "issue:fresh:daemon-fresh-action";
    const capability = "capability:daemon-fresh-action";
    const checkpoint = domain.inspectLoss(PROJECT, "run-third", lossId).checkpoint;
    domain.registerRecoveryIssue(freshRecoveryIssue({
      issueId,
      capability,
      projectSessionId: PROJECT,
      runId: "run-third",
      agentId: "chair",
      sessionGeneration: 11,
      lossId,
      pair,
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
      checkpointDigest: checkpoint.checkpointDigest,
    }));
    domain.prepareFreshRotation({
      projectSessionId: PROJECT,
      runId: "run-third",
      lossId,
      issueId,
      capability,
      pair,
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
      checkpoint,
    });

    expect(domain.inspectLoss(PROJECT, "run-third", lossId)).toMatchObject({ state: "open", actionPair: null });
    expect(domain.inspectHighWater(PROJECT, "run-third", "chair")).toEqual(beforeHighWater);
    const accepted = domain.commitFreshRotation({ projectSessionId: PROJECT, runId: "run-third", lossId, pair, attemptId: issueId }) as any;
    expect(accepted).toMatchObject({ phase: "awaiting-boundary", lifecycle: "suspended" });
    expect(provider.dispatches).toEqual([]);
    expect(domain.inspectLoss(PROJECT, "run-third", lossId)).toMatchObject({ state: "recovery-in-progress", actionPair: pair });

    await expect(domain.driveRotation(PROJECT, "run-third", accepted.custodyRef)).resolves.toMatchObject({
      phase: "finalized",
      disposition: "adopted",
    });
    expect(domain.inspectLoss(PROJECT, "run-third", lossId)).toMatchObject({ state: "recovered-adopted" });
    expect(provider.dispatches).toHaveLength(1);
  });
});

function abandonAuthority(recoverySourceRef: string) {
  const authorityPreimage = {
    projectSessionId: PROJECT,
    runId: "run-third",
    agentId: "chair",
    sessionGeneration: 11,
    operations: ["session.cancel"] as const,
  };
  return {
    ...authorityPreimage,
    authorityDigest: lifecycleDigest(authorityPreimage),
    consequentialGateId: "gate:lifecycle-retire",
    consequentialGateDigest: digest("gate:lifecycle-retire"),
    consequentialGateRecoverySourceRef: recoverySourceRef,
    directHumanConfirmation: {
      reason: "Human confirmed destructive lifecycle retirement",
      attestationDigest: digest("human:lifecycle-retire"),
    },
  };
}

describe("Spec 05 lifecycle abandonment archival transaction", () => {
  it("requires closed cancel/gate/human authority", () => {
    const domain = new LifecycleRotationDomain({ provider: new TerminalProvider(), recoveryAuthority: trustedRecoveryAuthority }, [seed()]);
    const lossId = domain.observeContext({
      sourceEventId: "loss-for-abandon",
      projectSessionId: PROJECT,
      runId: "run-third",
      agentId: "chair",
      providerGeneration: 3,
      contextRevision: 0,
      evidenceDigest: digest("loss-for-abandon"),
    }).lossId!;
    expect(() => domain.abandonLoss({ projectSessionId: PROJECT, runId: "run-third", lossId } as never))
      .toThrow(expect.objectContaining({ code: "RECOVERY_ABANDON_FORBIDDEN" }));
  });

  it("derives and applies the complete archival plan atomically", () => {
    const domain = new LifecycleRotationDomain({ provider: new TerminalProvider(), recoveryAuthority: trustedRecoveryAuthority }, [seed()]);
    const lossId = domain.observeContext({
      sourceEventId: "loss-for-derived-abandon",
      projectSessionId: PROJECT,
      runId: "run-third",
      agentId: "chair",
      providerGeneration: 3,
      contextRevision: 0,
      evidenceDigest: digest("loss-for-derived-abandon"),
    }).lossId!;
    const plan = domain.previewLossAbandonment(PROJECT, "run-third", lossId);
    const authority = abandonAuthority(lossId);
    domain.registerRecoveryIssue(abandonRecoveryIssue(authority, lossId, null));

    expect(domain.abandonLoss({
      projectSessionId: PROJECT,
      runId: "run-third",
      lossId,
      authority,
      expectedArchivalPlanDigest: plan.planDigest,
      expectedSourceCheckpointDigest: plan.sourceCheckpointDigest,
    } as never)).toMatchObject({ state: "abandoned", actionPair: null });
    expect(domain.inspectAgent(PROJECT, "run-third", "chair")).toMatchObject({
      lifecycle: "archived",
      claimsFrozen: true,
      turns: [{ turnId: "caller", state: "revoked" }],
      writes: [{ custodyId: "write-a", state: "revoked-abandoned" }],
      deliveries: [{ deliveryId: "delivery-a", state: "abandoned" }],
      archivalPlan: plan,
    });
  });

  it("changes nothing when the derived archival plan loses its source CAS", () => {
    const domain = new LifecycleRotationDomain({ provider: new TerminalProvider(), recoveryAuthority: trustedRecoveryAuthority }, [seed()]);
    const lossId = domain.observeContext({
      sourceEventId: "loss-for-stale-abandon",
      projectSessionId: PROJECT,
      runId: "run-third",
      agentId: "chair",
      providerGeneration: 3,
      contextRevision: 0,
      evidenceDigest: digest("loss-for-stale-abandon"),
    }).lossId!;
    const plan = domain.previewLossAbandonment(PROJECT, "run-third", lossId);
    const authority = abandonAuthority(lossId);
    domain.registerRecoveryIssue(abandonRecoveryIssue(authority, lossId, null));
    domain.advanceRevision(PROJECT, "run-third", "chair", "task");

    expect(() => domain.abandonLoss({
      projectSessionId: PROJECT,
      runId: "run-third",
      lossId,
      authority,
      expectedArchivalPlanDigest: plan.planDigest,
      expectedSourceCheckpointDigest: plan.sourceCheckpointDigest,
    })).toThrow(expect.objectContaining({ code: "ARCHIVAL_PLAN_STALE" }));
    expect(domain.inspectLoss(PROJECT, "run-third", lossId)).toMatchObject({ state: "open" });
    expect(domain.inspectAgent(PROJECT, "run-third", "chair")).toMatchObject({
      lifecycle: "recovery-required",
      archivalPlan: null,
      sourceCapabilityRevoked: true,
      principalRevoked: false,
    });
  });
});

describe("Spec 05 exact lifecycle identity and source bindings", () => {
  it("quarantines writes before capturing their exact identity/state digest", () => {
    const domain = new LifecycleRotationDomain({ provider: new TerminalProvider() }, [seed()]);
    const accepted = request(domain);
    const checkpoint = domain.inspectCustody(PROJECT, "run-third", accepted.custodyRef).checkpoint as any;

    expect(checkpoint.writeSetDigest).toBe(lifecycleDigest({
      writeRevision: 2,
      writes: [{ custodyId: "write-a", state: "lifecycle-quarantined" }],
    }));
    expect(domain.inspectAgent(PROJECT, "run-third", "chair").writes).toEqual([
      { custodyId: "write-a", state: "lifecycle-quarantined" },
    ]);
  });

  it("uses a daemon-global action pair and hashes the full launch attribution into its challenge", () => {
    const first = new LifecycleRotationDomain({ provider: new TerminalProvider() }, [
      seed(),
      seed({
        projectSessionId: "project-other",
        sourceBinding: {
          ...sourceBinding(),
          custodyAction: { adapterId: "claude-code", actionId: "source-action-project-other" },
        },
      }),
    ]);
    const accepted = request(first);
    const custody = first.inspectCustody(PROJECT, "run-third", accepted.custodyRef) as any;
    expect(custody.pair).toEqual({ adapterId: "claude-code", actionId: "daemon-action-third" });
    expect(custody.launchChallenge).toBe(lifecycleDigest({
      pair: custody.pair,
      operation: "launch",
      adapterContractDigest: digest("replacement-contract"),
      projectSessionId: PROJECT,
      runId: "run-third",
      agentId: "chair",
      custodyRef: accepted.custodyRef,
      checkpoint: custody.checkpoint,
      launchAttestContract: "launch.attest.v1",
    }));

    expect(() => first.requestRotation({
      commandId: "rotate-other",
      projectSessionId: "project-other",
      runId: "run-third",
      agentId: "chair",
      action: "rotate",
      auth: { providerGeneration: 1, principalGeneration: 1, bridgeGeneration: 1 },
      checkpoint: first.checkpoint("project-other", "run-third", "chair"),
      adapterId: "claude-code",
      actionId: "daemon-action-third",
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
    } as never)).toThrow(expect.objectContaining({ code: "ACTION_PAIR_CONFLICT" }));
  });

  it.each([
    ["provider session", (agent: any) => { agent.provider.reference = "provider:drift:g1"; }],
    ["capability", (agent: any) => { agent.sourceBinding.capabilityHash = digest("drift-capability"); }],
    ["custody action", (agent: any) => { agent.sourceBinding.custodyAction.actionId = "drift-source-action"; }],
    ["adapter contract", (agent: any) => { agent.sourceBinding.adapterContractDigest = digest("drift-contract"); }],
    ["bridge row", (agent: any) => { agent.sourceBinding.bridgeRowId = "bridge:drift"; }],
    ["bridge revision", (agent: any) => { agent.sourceBinding.bridgeRevision += 1; }],
    ["project-session generation", (agent: any) => { agent.sourceBinding.projectSessionGeneration += 1; }],
    ["run generation", (agent: any) => { agent.sourceBinding.runGeneration += 1; }],
    ["chair-lease generation", (agent: any) => { agent.sourceBinding.chairLeaseGeneration += 1; }],
    ["principal generation", (agent: any) => { agent.principalGeneration += 1; }],
    ["bridge generation", (agent: any) => { agent.bridgeGeneration += 1; }],
  ])("supersedes %s drift at the final source CAS", async (_label, mutate) => {
    const provider = new TerminalProvider();
    let fired = false;
    const domain = new LifecycleRotationDomain({
      provider,
      fault: {
        hit(label) {
          if (!fired && label === "after-provider-ack-before-commit") {
            fired = true;
            throw new Error("stop-before-source-cas");
          }
        },
      },
    }, [seed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-third", "chair", "caller");
    await expect(domain.driveRotation(PROJECT, "run-third", accepted.custodyRef)).rejects.toThrow("stop-before-source-cas");
    const tampered = structuredClone(domain.snapshot()) as any;
    mutate(tampered.agents[0]);
    const recovered = LifecycleRotationDomain.hydrate({ provider }, sealSnapshot(tampered));

    await expect(recovered.driveRotation(PROJECT, "run-third", accepted.custodyRef)).resolves.toMatchObject({
      phase: "finalized",
      disposition: "superseded",
    });
  });
});

describe("Spec 05 context observation ownership and replay", () => {
  it("serializes against nonfinal custody without creating a crossed loss", () => {
    const domain = new LifecycleRotationDomain({ provider: new TerminalProvider() }, [seed()]);
    const accepted = request(domain);

    expect(() => domain.observeContext({
      sourceEventId: "crossed-context-event",
      projectSessionId: PROJECT,
      runId: "run-third",
      agentId: "chair",
      providerGeneration: 3,
      contextRevision: 0,
      evidenceDigest: digest("crossed-context-event"),
    })).toThrow(expect.objectContaining({ code: "LIFECYCLE_CUSTODY_ACTIVE" }));
    expect(domain.inspectCustody(PROJECT, "run-third", accepted.custodyRef)).toMatchObject({ phase: "awaiting-boundary" });
  });

  it("atomically fences writes, turns and claims and replays the original immutable classification/audit", () => {
    const domain = new LifecycleRotationDomain({ provider: new TerminalProvider() }, [seed()]);
    const observation = {
      sourceEventId: "one-context-event",
      projectSessionId: PROJECT,
      runId: "run-third",
      agentId: "chair",
      providerGeneration: 3,
      contextRevision: 2,
      evidenceDigest: digest("one-context-event"),
    };
    const first = domain.observeContext(observation) as any;
    const auditCount = domain.audits(PROJECT, "run-third").length;
    const replay = domain.observeContext(observation);

    expect(first).toMatchObject({
      classification: "generation-advance",
      lossId: expect.any(String),
      audit: { kind: "context-observation-advanced", sourceId: "one-context-event" },
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(replay).toBe(first);
    expect(domain.audits(PROJECT, "run-third")).toHaveLength(auditCount);
    expect(domain.inspectAgent(PROJECT, "run-third", "chair")).toMatchObject({
      lifecycle: "recovery-required",
      claimsFrozen: true,
      sourceCapabilityRevoked: true,
      bridgeRevoked: true,
      turns: [{ turnId: "caller", state: "quarantined" }],
      writes: [{ custodyId: "write-a", state: "lifecycle-quarantined" }],
    });
  });
});

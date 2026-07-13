import { describe, expect, it } from "vitest";

import {
  LifecycleRotationDomain,
  lifecycleDigest,
  type LifecycleAgentSeed,
  type LifecycleDomainPorts,
  type LifecycleProviderPort,
  type ProviderActionObservation,
  type ProviderActionPair,
  type ReplacementDispatch,
} from "../../../src/lifecycle/index.ts";

const digest = lifecycleDigest;
const PROJECT = "project-fourth";
const RUN = "run-fourth";

function seed(overrides: Partial<LifecycleAgentSeed> = {}): LifecycleAgentSeed {
  return {
    projectSessionId: PROJECT,
    runId: RUN,
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
    sourceBinding: {
      capabilityHash: digest("source-capability"),
      custodyAction: { adapterId: "claude-code", actionId: "source-action" },
      adapterContractDigest: digest("source-contract"),
      bridgeRowId: "bridge:chair:1",
      bridgeRevision: 1,
      projectSessionGeneration: 4,
      runGeneration: 5,
      chairLeaseGeneration: 6,
    },
    principalGeneration: 1,
    bridgeGeneration: 1,
    taskRevision: 1,
    mailboxRevision: 1,
    childRevision: 1,
    writeRevision: 1,
    authorityRevision: 1,
    childIds: [],
    openWork: [{ obligationId: "task", kind: "task", revision: 1 }],
    turns: [{ turnId: "caller", state: "active", providerGeneration: 1, principalGeneration: 1, bridgeGeneration: 1 }],
    writes: [
      { custodyId: "changed-write", state: "active" },
      { custodyId: "preexisting-quarantine", state: "lifecycle-quarantined" },
    ],
    deliveries: [],
    taskOwnerLeases: [],
    barriers: [],
    memberships: [],
    messageWatermark: 0,
    deliveryWatermark: 0,
    membershipWatermark: 0,
    archivalPlan: null,
    sourceCapabilityRevoked: false,
    principalRevoked: false,
    bridgeRevoked: false,
    ...overrides,
  };
}

function terminal(dispatch: ReplacementDispatch, providerExtras: Record<string, unknown> = {}): ProviderActionObservation {
  return {
    status: "terminal",
    candidate: {
      provider: {
        reference: `provider:chair:g${String(dispatch.reservedProviderGeneration)}`,
        providerGeneration: dispatch.reservedProviderGeneration,
        contextRevision: 0,
        evidenceDigest: digest("replacement-evidence"),
        historyDigest: digest(`replacement-history:${dispatch.pair.actionId}`),
        ...providerExtras,
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
  } as ProviderActionObservation;
}

class ConfigurableProvider implements LifecycleProviderPort {
  readonly dispatches: ReplacementDispatch[] = [];
  outcome: "terminal" | "no-effect" = "terminal";
  providerExtras: Record<string, unknown> = {};

  async dispatchReplacement(dispatch: ReplacementDispatch): Promise<ProviderActionObservation> {
    this.dispatches.push(dispatch);
    return this.outcome === "no-effect"
      ? { status: "closed-no-effect", proofDigest: digest(`no-effect:${dispatch.pair.actionId}`) }
      : terminal(dispatch, this.providerExtras);
  }

  async lookupReplacement(): Promise<ProviderActionObservation> {
    return { status: "ambiguous" };
  }
}

function request(domain: LifecycleRotationDomain, actionId = "rotate-fourth-action") {
  return domain.requestRotation({
    commandId: actionId,
    projectSessionId: PROJECT,
    runId: RUN,
    agentId: "chair",
    action: "rotate",
    auth: { providerGeneration: 1, principalGeneration: 1, bridgeGeneration: 1 },
    checkpoint: domain.checkpoint(PROJECT, RUN, "chair"),
    adapterId: "claude-code",
    actionId,
    adapterContractDigest: digest("replacement-contract"),
    operation: "launch",
  });
}

function openLoss(domain: LifecycleRotationDomain, sourceEventId = "loss-event") {
  return domain.observeContext({
    sourceEventId,
    projectSessionId: PROJECT,
    runId: RUN,
    agentId: "chair",
    providerGeneration: 3,
    contextRevision: 0,
    evidenceDigest: digest(sourceEventId),
  }).lossId!;
}

function seal(snapshot: any) {
  const { snapshotDigest: _ignored, ...preimage } = snapshot;
  return { ...preimage, snapshotDigest: lifecycleDigest(preimage) };
}

function createWithIssues(
  provider: LifecycleProviderPort,
  issues: readonly Record<string, unknown>[],
  verify = true,
) {
  const ports = {
    provider,
    recoveryAuthority: {
      nowMs: () => 1_000,
      verifyIssue: () => verify,
      verifyAbandonAuthority: () => verify,
    },
  } as unknown as LifecycleDomainPorts;
  return new (LifecycleRotationDomain as any)(ports, [seed({ turns: [] })], issues) as LifecycleRotationDomain;
}

function freshIssue(lossId: string, pair: ProviderActionPair, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    issueId: `issue:${pair.actionId}`,
    capabilityHash: digest(`capability:${pair.actionId}`),
    path: "fresh-rotate",
    projectSessionId: PROJECT,
    runId: RUN,
    agentId: "chair",
    sessionGeneration: 4,
    recoverySourceRef: lossId,
    pair,
    adapterContractDigest: digest("replacement-contract"),
    operation: "launch",
    checkpointDigest: null,
    consequentialGateId: "gate:fresh",
    consequentialGateDigest: digest("gate:fresh"),
    directHumanAttestationDigest: null,
    directHumanReasonDigest: null,
    issuedAtMs: 900,
    expiresAtMs: 1_100,
    status: "active",
    issueAttestation: "trusted-native-attestation",
    ...overrides,
  };
}

describe("Spec 05 narrow recovery issue", () => {
  it("rejects a caller-manufactured fresh issue even when its fields and digests are self-consistent", () => {
    const provider = new ConfigurableProvider();
    const provisional = createWithIssues(provider, [], true);
    const lossId = openLoss(provisional);
    const pair = { adapterId: "claude-code", actionId: "fresh-untrusted" };
    const issue = freshIssue(lossId, pair, { checkpointDigest: provisional.inspectLoss(PROJECT, RUN, lossId).checkpoint.checkpointDigest });
    const domain = createWithIssues(provider, [issue], false);
    const actualLoss = openLoss(domain);

    expect(() => domain.prepareFreshRotation({
      projectSessionId: PROJECT,
      runId: RUN,
      lossId: actualLoss,
      issueId: issue.issueId,
      capability: `capability:${pair.actionId}`,
      authority: { operations: ["lifecycle.fresh-rotate"] },
      pair,
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
      checkpoint: domain.inspectLoss(PROJECT, RUN, actualLoss).checkpoint,
    } as never)).toThrow(expect.objectContaining({ code: "FRESH_RECOVERY_ISSUE_INVALID" }));
  });

  it("consumes one current, gated and unexpired issue exactly at fresh Commit", () => {
    const provider = new ConfigurableProvider();
    const provisional = createWithIssues(provider, [], true);
    const provisionalLoss = openLoss(provisional);
    const pair = { adapterId: "claude-code", actionId: "fresh-trusted" };
    const issue = freshIssue(provisionalLoss, pair, {
      checkpointDigest: provisional.inspectLoss(PROJECT, RUN, provisionalLoss).checkpoint.checkpointDigest,
    });
    const domain = createWithIssues(provider, [{ ...issue, recoverySourceRef: `loss:${PROJECT}:${RUN}:chair:loss-event` }], true);
    const lossId = openLoss(domain);
    const checkpoint = domain.inspectLoss(PROJECT, RUN, lossId).checkpoint;
    (domain as any).prepareFreshRotation({
      projectSessionId: PROJECT,
      runId: RUN,
      lossId,
      issueId: issue.issueId,
      capability: `capability:${pair.actionId}`,
      pair,
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
      checkpoint,
    });

    expect((domain as any).inspectRecoveryIssue(issue.issueId)).toMatchObject({ status: "active" });
    (domain as any).commitFreshRotation({ projectSessionId: PROJECT, runId: RUN, lossId, pair, attemptId: issue.issueId });
    expect((domain as any).inspectRecoveryIssue(issue.issueId)).toMatchObject({ status: "consumed" });
  });
});

describe("Spec 05 exact fresh attempt correlation", () => {
  it("replays the current second attempt rather than the first finalized custody and hydrates it", async () => {
    const provider = new ConfigurableProvider();
    provider.outcome = "no-effect";
    const domain = new LifecycleRotationDomain({
      provider,
      recoveryAuthority: {
        nowMs: () => 1_000,
        verifyIssue: () => true,
        verifyAbandonAuthority: () => true,
      },
    }, [seed({ turns: [] })]);
    const lossId = openLoss(domain);
    const firstPair = { adapterId: "claude-code", actionId: "fresh-first" };
    const firstIssue = freshIssue(lossId, firstPair, {
      checkpointDigest: domain.inspectLoss(PROJECT, RUN, lossId).checkpoint.checkpointDigest,
    });
    domain.registerRecoveryIssue(firstIssue as never);
    domain.prepareFreshRotation({
      projectSessionId: PROJECT, runId: RUN, lossId,
      issueId: firstIssue.issueId, capability: `capability:${firstPair.actionId}`, pair: firstPair,
      adapterContractDigest: digest("replacement-contract"), operation: "launch",
      checkpoint: domain.inspectLoss(PROJECT, RUN, lossId).checkpoint,
    });
    const first = domain.commitFreshRotation({ projectSessionId: PROJECT, runId: RUN, lossId, pair: firstPair, attemptId: firstIssue.issueId });
    await domain.driveRotation(PROJECT, RUN, first.custodyRef);

    const secondPair = { adapterId: "claude-code", actionId: "fresh-second" };
    const secondIssue = freshIssue(lossId, secondPair, {
      checkpointDigest: domain.inspectLoss(PROJECT, RUN, lossId).checkpoint.checkpointDigest,
    });
    domain.registerRecoveryIssue(secondIssue as never);
    domain.prepareFreshRotation({
      projectSessionId: PROJECT, runId: RUN, lossId,
      issueId: secondIssue.issueId, capability: `capability:${secondPair.actionId}`, pair: secondPair,
      adapterContractDigest: digest("replacement-contract"), operation: "launch",
      checkpoint: domain.inspectLoss(PROJECT, RUN, lossId).checkpoint,
    });
    const second = domain.commitFreshRotation({ projectSessionId: PROJECT, runId: RUN, lossId, pair: secondPair, attemptId: secondIssue.issueId });
    const replay = domain.commitFreshRotation({ projectSessionId: PROJECT, runId: RUN, lossId, pair: secondPair, attemptId: secondIssue.issueId });

    expect(replay).toBe(second);
    expect(replay.custodyRef).not.toBe(first.custodyRef);
    expect(() => LifecycleRotationDomain.hydrate(
      { provider, recoveryAuthority: {
        nowMs: () => 1_000,
        verifyIssue: () => true,
        verifyAbandonAuthority: () => true,
      } },
      JSON.parse(JSON.stringify(domain.snapshot())) as ReturnType<typeof domain.snapshot>,
    )).not.toThrow();
  });
});

describe("Spec 05 changed-write custody", () => {
  it.each(["no-effect", "superseded"] as const)("restores only writes changed by a %s custody", async (outcome) => {
    const provider = new ConfigurableProvider();
    provider.outcome = "no-effect";
    const domain = new LifecycleRotationDomain({ provider }, [seed()]);
    const accepted = request(domain, `write-${outcome}`);
    domain.markTurnTerminal(PROJECT, RUN, "chair", "caller");
    if (outcome === "superseded") domain.advanceRevision(PROJECT, RUN, "chair", "task");

    if (outcome === "superseded") {
      await expect(domain.driveRotation(PROJECT, RUN, accepted.custodyRef)).resolves.toMatchObject({ disposition: "superseded" });
    } else {
      await expect(domain.driveRotation(PROJECT, RUN, accepted.custodyRef)).resolves.toMatchObject({ disposition: "no-effect" });
    }
    expect(domain.inspectCustody(PROJECT, RUN, accepted.custodyRef)).toMatchObject({
      changedWriteCustodyIds: ["changed-write"],
    });
    expect(domain.inspectAgent(PROJECT, RUN, "chair").writes).toEqual([
      { custodyId: "changed-write", state: "active" },
      { custodyId: "preexisting-quarantine", state: "lifecycle-quarantined" },
    ]);
  });

  it("rejects resealed no-effect snapshots with a crossed predecessor or unrestored changed write", async () => {
    const provider = new ConfigurableProvider();
    provider.outcome = "no-effect";
    const domain = new LifecycleRotationDomain({ provider }, [seed()]);
    const accepted = request(domain, "write-no-effect-hydrate");
    domain.markTurnTerminal(PROJECT, RUN, "chair", "caller");
    await domain.driveRotation(PROJECT, RUN, accepted.custodyRef);

    for (const mutate of [
      (snapshot: any) => { snapshot.agents[0].provider.reference = "provider:crossed"; },
      (snapshot: any) => { snapshot.agents[0].writes[0].state = "lifecycle-quarantined"; },
    ]) {
      const snapshot = structuredClone(domain.snapshot()) as any;
      mutate(snapshot);
      expect(() => LifecycleRotationDomain.hydrate({ provider }, seal(snapshot)))
        .toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
    }
  });

  it.each(["adopted", "quarantined"] as const)("rejects a resealed %s snapshot that releases its changed write", async (disposition) => {
    const provider = new ConfigurableProvider();
    if (disposition === "quarantined") provider.providerExtras = { hiddenProviderField: "forged" };
    const domain = new LifecycleRotationDomain({ provider }, [seed()]);
    const accepted = request(domain, `write-${disposition}-hydrate`);
    domain.markTurnTerminal(PROJECT, RUN, "chair", "caller");
    await expect(domain.driveRotation(PROJECT, RUN, accepted.custodyRef)).resolves.toMatchObject({ disposition });
    const snapshot = structuredClone(domain.snapshot()) as any;
    snapshot.agents[0].writes[0].state = "active";

    expect(() => LifecycleRotationDomain.hydrate({ provider }, seal(snapshot)))
      .toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });
});

describe("Spec 05 closed provider terminal evidence", () => {
  it("quarantines an extra provider field without retaining the malformed candidate", async () => {
    const provider = new ConfigurableProvider();
    provider.providerExtras = { hiddenProviderField: "forged" };
    const domain = new LifecycleRotationDomain({ provider }, [seed()]);
    const accepted = request(domain, "closed-candidate");
    domain.markTurnTerminal(PROJECT, RUN, "chair", "caller");

    await expect(domain.driveRotation(PROJECT, RUN, accepted.custodyRef)).resolves.toMatchObject({
      disposition: "quarantined",
      candidate: null,
    });
    expect(domain.inspectAgent(PROJECT, RUN, "chair")).toMatchObject({ provider: { providerGeneration: 1 } });
  });
});

describe("Spec 05 exact snapshot correlations", () => {
  it.each([
    ["skipped target", (snapshot: any) => {
      snapshot.custodies[0].reservedProviderGeneration = 3;
      snapshot.custodies[0].acceptance.reservedProviderGeneration = 3;
      snapshot.providerHighWater[0].value = 3;
    }],
    ["phase history", (snapshot: any) => { snapshot.custodies[0].phase = "prepared"; }],
    ["action admission", (snapshot: any) => { snapshot.custodies[0].pair.actionId = "crossed-action"; }],
    ["source checkpoint", (snapshot: any) => { snapshot.custodies[0].checkpoint.sourceBindingDigest = digest("crossed-source"); }],
  ])("rejects a resealed %s correlation tamper", (_label, mutate) => {
    const domain = new LifecycleRotationDomain({ provider: new ConfigurableProvider() }, [seed()]);
    request(domain, "snapshot-action");
    const snapshot = structuredClone(domain.snapshot()) as any;
    mutate(snapshot);

    expect(() => LifecycleRotationDomain.hydrate({ provider: new ConfigurableProvider() }, seal(snapshot)))
      .toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });
});

describe("Spec 05 generation reservation atomicity", () => {
  it("rejects MAX_SAFE exhaustion before quarantining writes or suspending lifecycle", () => {
    const max = Number.MAX_SAFE_INTEGER;
    const domain = new LifecycleRotationDomain({ provider: new ConfigurableProvider() }, [seed({
      provider: { ...seed().provider, providerGeneration: max },
      principalGeneration: max,
      bridgeGeneration: max,
      turns: [{ turnId: "caller", state: "active", providerGeneration: max, principalGeneration: max, bridgeGeneration: max }],
    })]);

    expect(() => domain.requestRotation({
      commandId: "exhausted",
      projectSessionId: PROJECT,
      runId: RUN,
      agentId: "chair",
      action: "rotate",
      auth: { providerGeneration: max, principalGeneration: max, bridgeGeneration: max },
      checkpoint: domain.checkpoint(PROJECT, RUN, "chair"),
      adapterId: "claude-code",
      actionId: "exhausted-action",
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
    })).toThrow(expect.objectContaining({ code: "INVALID_GENERATION" }));
    expect(domain.inspectAgent(PROJECT, RUN, "chair")).toMatchObject({
      lifecycle: "ready",
      writes: expect.arrayContaining([{ custodyId: "changed-write", state: "active" }]),
    });
  });
});

describe("Spec 05 observation classification with active loss", () => {
  it("records distinct reordered/replay observations and blocks only a new advance", () => {
    const domain = new LifecycleRotationDomain({ provider: new ConfigurableProvider() }, [seed({ turns: [] })]);
    openLoss(domain, "first-advance");

    expect(domain.observeContext({
      sourceEventId: "distinct-reordered", projectSessionId: PROJECT, runId: RUN, agentId: "chair",
      providerGeneration: 2, contextRevision: 99, evidenceDigest: digest("distinct-reordered"),
    })).toMatchObject({ classification: "reordered-observation", lossId: null });
    expect(domain.observeContext({
      sourceEventId: "distinct-replay", projectSessionId: PROJECT, runId: RUN, agentId: "chair",
      providerGeneration: 3, contextRevision: 0, evidenceDigest: digest("first-advance"),
    })).toMatchObject({ classification: "replay", lossId: null });
    expect(() => domain.observeContext({
      sourceEventId: "blocked-advance", projectSessionId: PROJECT, runId: RUN, agentId: "chair",
      providerGeneration: 4, contextRevision: 0, evidenceDigest: digest("blocked-advance"),
    })).toThrow(expect.objectContaining({ code: "GENERATION_LOSS_ACTIVE" }));
  });
});

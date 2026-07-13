import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  lifecycleDigest,
  type LifecycleAgentSeed,
  type LifecycleFaultLabel,
  type LifecycleProviderPort,
  type ProviderActionObservation,
  type ProviderActionPair,
  type ReplacementDispatch,
} from "../../../src/lifecycle/index.ts";
import {
  abandonRecoveryIssue,
  ReceiptBackedLifecycleRotationDomain as LifecycleRotationDomain,
  trustedRecoveryAuthority,
} from "./recovery-issue-fixture.ts";

const digest = lifecycleDigest;
const PROJECT = "project-crash";

function seed(): LifecycleAgentSeed {
  return {
    projectSessionId: PROJECT,
    runId: "run-crash",
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
      custodyAction: { adapterId: "codex", actionId: "source-action" },
      adapterContractDigest: digest("source-contract"),
      bridgeRowId: "bridge:chair:1",
      bridgeRevision: 1,
      projectSessionGeneration: 1,
      runGeneration: 1,
      chairLeaseGeneration: 1,
    },
    principalGeneration: 1,
    bridgeGeneration: 1,
    taskRevision: 1,
    mailboxRevision: 1,
    childRevision: 1,
    writeRevision: 1,
    authorityRevision: 1,
    recoveryCheckpointState: "last-validated",
    recoveryCheckpointRef: "checkpoint:crash",
    childIds: [],
    openWork: [{ obligationId: "task", kind: "task", revision: 1 }],
    turns: [{
      turnId: "caller",
      state: "active",
      providerGeneration: 1,
      principalGeneration: 1,
      bridgeGeneration: 1,
    }],
    writes: [],
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
  };
}

function terminal(dispatch: ReplacementDispatch): ProviderActionObservation {
  return {
    status: "terminal",
    candidate: {
      provider: {
        reference: "provider:chair:g2",
        providerGeneration: dispatch.reservedProviderGeneration,
        contextRevision: 0,
        evidenceDigest: digest("replacement-evidence"),
        historyDigest: digest("replacement-history"),
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

class JournalProvider implements LifecycleProviderPort {
  readonly actions = new Map<string, { pair: ProviderActionPair; result: ProviderActionObservation }>();
  dispatchCount = 0;
  effectCount = 0;
  lookupCount = 0;
  directStatus: "terminal" | "accepted" | "ambiguous" = "terminal";
  lookupStatus: "terminal" | "accepted" | "ambiguous" = "terminal";

  async dispatchReplacement(request: ReplacementDispatch): Promise<ProviderActionObservation> {
    this.dispatchCount += 1;
    const existing = this.actions.get(request.pair.actionId);
    if (existing !== undefined) {
      if (canonicalJson(existing.pair) !== canonicalJson(request.pair)) throw new Error("provider action pair conflict");
      return existing.result;
    }
    this.effectCount += 1;
    const result = terminal(request);
    this.actions.set(request.pair.actionId, { pair: { ...request.pair }, result });
    if (this.directStatus === "accepted") return { status: "accepted" };
    if (this.directStatus === "ambiguous") return { status: "ambiguous" };
    return result;
  }

  async lookupReplacement(pair: ProviderActionPair): Promise<ProviderActionObservation> {
    this.lookupCount += 1;
    const action = this.actions.get(pair.actionId);
    if (action === undefined) return { status: "closed-no-effect", proofDigest: digest("no-effect") };
    if (canonicalJson(action.pair) !== canonicalJson(pair)) throw new Error("provider lookup pair conflict");
    if (this.lookupStatus === "accepted") return { status: "accepted" };
    if (this.lookupStatus === "ambiguous") return { status: "ambiguous" };
    return action.result;
  }
}

function admitted(domain: LifecycleRotationDomain) {
  const checkpoint = domain.checkpoint(PROJECT, "run-crash", "chair");
  return domain.requestRotation({
    commandId: "rotate-crash",
    projectSessionId: PROJECT,
    runId: "run-crash",
    agentId: "chair",
    action: "rotate",
    auth: { providerGeneration: 1, principalGeneration: 1, bridgeGeneration: 1 },
    checkpoint,
    adapterId: "codex",
    actionId: "rotate-crash:daemon-action",
    adapterContractDigest: digest("replacement-contract"),
    operation: "launch",
  });
}

describe("Spec 05 lifecycle crash and replay", () => {
  it("exports a closed JSON-roundtrippable durable snapshot seam", () => {
    const domain = new LifecycleRotationDomain({ provider: new JournalProvider() }, [seed()]);
    expect(JSON.parse(JSON.stringify(domain.snapshot()))).toMatchObject({
      schemaVersion: 1,
      agents: [expect.objectContaining({ runId: "run-crash", agentId: "chair" })],
      custodies: [],
    });
  });

  it.each([
    ["after-prepare" as const, "adopted", 1, 0],
    ["after-dispatch-before-effect" as const, "no-effect", 0, 1],
    ["after-provider-effect-before-ack" as const, "adopted", 1, 1],
    ["after-provider-ack-before-commit" as const, "adopted", 1, 0],
    ["after-commit-start" as const, "adopted", 1, 0],
    ["after-adoption-before-finalize" as const, "adopted", 1, 0],
  ])(
    "recovers %s with at most one effect and the required exact lookup",
    async (crashLabel, disposition, effects, lookups) => {
      const provider = new JournalProvider();
      let fired = false;
      const domain = new LifecycleRotationDomain({
        provider,
        fault: {
          hit(label: LifecycleFaultLabel) {
            if (!fired && label === crashLabel) {
              fired = true;
              throw new Error(`crash:${label}`);
            }
          },
        },
      }, [seed()]);
      const accepted = admitted(domain);

      if (crashLabel === "after-prepare") {
        expect(() => domain.markTurnTerminal(PROJECT, "run-crash", "chair", "caller")).toThrow(`crash:${crashLabel}`);
      } else {
        domain.markTurnTerminal(PROJECT, "run-crash", "chair", "caller");
        await expect(domain.driveRotation(PROJECT, "run-crash", accepted.custodyRef)).rejects.toThrow(`crash:${crashLabel}`);
      }

      const durable = JSON.parse(JSON.stringify(domain.snapshot())) as ReturnType<typeof domain.snapshot>;
      const recoveredDomain = LifecycleRotationDomain.hydrate({ provider }, durable);
      expect(recoveredDomain).not.toBe(domain);
      const recovered = await recoveredDomain.driveRotation(PROJECT, "run-crash", accepted.custodyRef);
      expect(recovered).toMatchObject({ phase: "finalized", disposition });
      expect(provider).toMatchObject({ effectCount: effects, lookupCount: lookups });
      expect(recoveredDomain.inspectHighWater(PROJECT, "run-crash", "chair")).toEqual({
        providerGeneration: 2,
        principalGeneration: 2,
        bridgeGeneration: 2,
      });
      expect(recoveredDomain.inspectAgent(PROJECT, "run-crash", "chair").provider.providerGeneration)
        .toBe(disposition === "adopted" ? 2 : 1);

      await expect(recoveredDomain.driveRotation(PROJECT, "run-crash", accepted.custodyRef)).resolves.toEqual(recovered);
      expect(provider).toMatchObject({ effectCount: effects, lookupCount: lookups });
    },
  );

  it("replays the exact full review cut without re-entering the transaction owner after adoption", async () => {
    const provider = new JournalProvider();
    let reviewCommits = 0;
    let fired = false;
    const domain = new LifecycleRotationDomain({
      provider,
      reviewCertification: {
        readCurrentTarget() {
          return {
            schemaVersion: 1,
            runId: "run-crash",
            targetGeneration: 8,
            predecessorBindingGeneration: 7,
            predecessorBindingDigest: digest("review-predecessor"),
            terminalSequenceHighWater: 13,
          };
        },
        commitReviewAdoption(input) {
          const cutPreimage = {
            schemaVersion: 1 as const,
            runId: "run-crash",
            targetGeneration: 8,
            predecessorBindingGeneration: 7,
            predecessorBindingDigest: digest("review-predecessor"),
            terminalSequenceHighWater: 13,
            lifecycleCustodyRef: input.lifecycleCustodyRef,
            lifecycleAdoptionEvidenceDigest: input.lifecycleAdoptionEvidenceDigest,
          };
          const decision = {
            kind: "rebound" as const,
            cut: { ...cutPreimage, cutDigest: lifecycleDigest(cutPreimage) },
            rebindReceiptDigest: digest("review-rebind"),
          };
          if (input.commitLifecycleAdoption(decision)) reviewCommits += 1;
        },
      },
      fault: {
        hit(label) {
          if (!fired && label === "after-adoption-before-finalize") {
            fired = true;
            throw new Error(`crash:${label}`);
          }
        },
      },
    }, [seed()]);
    const accepted = admitted(domain);
    domain.markTurnTerminal(PROJECT, "run-crash", "chair", "caller");
    await expect(domain.driveRotation(PROJECT, "run-crash", accepted.custodyRef))
      .rejects.toThrow("crash:after-adoption-before-finalize");

    const durable = JSON.parse(JSON.stringify(domain.snapshot())) as ReturnType<typeof domain.snapshot>;
    const storedDecision = domain.inspectCustody(PROJECT, "run-crash", accepted.custodyRef).reviewDecision;
    expect(storedDecision).toMatchObject({
      kind: "rebound",
      cut: {
        schemaVersion: 1,
        runId: "run-crash",
        targetGeneration: 8,
        predecessorBindingGeneration: 7,
        terminalSequenceHighWater: 13,
        lifecycleCustodyRef: {
          runId: "run-crash",
          agentId: "chair",
          custodyId: accepted.custodyRef,
          custodyRevision: 6,
        },
      },
    });
    const recoveredDomain = LifecycleRotationDomain.hydrate({
      provider,
      reviewCertification: {
        readCurrentTarget() {
          throw new Error("review transaction owner must not be re-entered");
        },
        commitReviewAdoption() {
          throw new Error("review transaction owner must not be re-entered");
        },
      },
    }, durable);

    await expect(recoveredDomain.driveRotation(PROJECT, "run-crash", accepted.custodyRef)).resolves.toMatchObject({
      phase: "finalized",
      disposition: "adopted",
      reviewDecision: storedDecision,
    });
    expect(reviewCommits).toBe(1);
  });

  it.each(["accepted", "ambiguous"] as const)(
    "reconciles a direct %s outcome only through the stored action pair",
    async (status) => {
      const provider = new JournalProvider();
      provider.directStatus = status;
      const domain = new LifecycleRotationDomain({ provider }, [seed()]);
      const accepted = admitted(domain);
      domain.markTurnTerminal(PROJECT, "run-crash", "chair", "caller");

      expect(await domain.driveRotation(PROJECT, "run-crash", accepted.custodyRef)).toMatchObject({ phase: status });
      expect(await domain.driveRotation(PROJECT, "run-crash", accepted.custodyRef)).toMatchObject({
        phase: "finalized",
        disposition: "adopted",
      });
      expect(provider).toMatchObject({ dispatchCount: 1, effectCount: 1, lookupCount: 1 });
    },
  );

  it("never regresses an ambiguous action to accepted on a later lookup", async () => {
    const provider = new JournalProvider();
    provider.directStatus = "ambiguous";
    const domain = new LifecycleRotationDomain({ provider }, [seed()]);
    const accepted = admitted(domain);
    domain.markTurnTerminal(PROJECT, "run-crash", "chair", "caller");
    await expect(domain.driveRotation(PROJECT, "run-crash", accepted.custodyRef))
      .resolves.toMatchObject({ phase: "ambiguous" });
    provider.lookupStatus = "accepted";

    await expect(domain.driveRotation(PROJECT, "run-crash", accepted.custodyRef))
      .resolves.toMatchObject({ phase: "ambiguous" });
    expect(domain.inspectCustody(PROJECT, "run-crash", accepted.custodyRef).history)
      .toEqual(["awaiting-boundary", "prepared", "dispatched", "ambiguous"]);

    const snapshot = structuredClone(domain.snapshot()) as any;
    snapshot.custodies[0].phase = "accepted";
    snapshot.custodies[0].history.push("accepted");
    const { snapshotDigest: _ignored, ...preimage } = snapshot;
    expect(() => LifecycleRotationDomain.hydrate(
      { provider },
      { ...preimage, snapshotDigest: lifecycleDigest(preimage) },
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });
});

describe("Spec 05 lifecycle terminal dispositions", () => {
  it("accepts exact pre-dispatch zero-effect proof and rejects a crossed action pair", () => {
    const domain = new LifecycleRotationDomain({ provider: new JournalProvider() }, [seed()]);
    const accepted = admitted(domain);
    domain.markTurnTerminal(PROJECT, "run-crash", "chair", "caller");
    const custody = domain.inspectCustody(PROJECT, "run-crash", accepted.custodyRef);

    expect(() => domain.proveNoEffect(PROJECT, "run-crash", accepted.custodyRef, {
      pair: { ...custody.pair, actionId: "crossed" },
      dispatchRecorded: false,
      evidenceDigest: digest("proof"),
    })).toThrow(expect.objectContaining({ code: "RECOVERY_ACTION_PAIR_MISMATCH" }));
    expect(domain.proveNoEffect(PROJECT, "run-crash", accepted.custodyRef, {
      pair: custody.pair,
      dispatchRecorded: false,
      evidenceDigest: digest("proof"),
    })).toMatchObject({ phase: "finalized", disposition: "no-effect" });
    expect(domain.inspectAgent(PROJECT, "run-crash", "chair")).toMatchObject({ lifecycle: "ready", claimsFrozen: false });
  });

  it("never reuses generations reserved by a no-effect custody", () => {
    const domain = new LifecycleRotationDomain({ provider: new JournalProvider() }, [seed()]);
    const first = admitted(domain);
    domain.markTurnTerminal(PROJECT, "run-crash", "chair", "caller");
    const custody = domain.inspectCustody(PROJECT, "run-crash", first.custodyRef);
    domain.proveNoEffect(PROJECT, "run-crash", first.custodyRef, {
      pair: custody.pair,
      dispatchRecorded: false,
      evidenceDigest: digest("no-effect"),
    });
    domain.openTurn(PROJECT, "run-crash", "chair", {
      turnId: "caller-two",
      state: "active",
      providerGeneration: 1,
      principalGeneration: 1,
      bridgeGeneration: 1,
    });

    const checkpoint = domain.checkpoint(PROJECT, "run-crash", "chair");
    expect(domain.requestRotation({
      commandId: "rotate-after-no-effect",
      projectSessionId: PROJECT,
      runId: "run-crash",
      agentId: "chair",
      action: "rotate",
      auth: { providerGeneration: 1, principalGeneration: 1, bridgeGeneration: 1 },
      checkpoint,
      adapterId: "codex",
      actionId: "rotate-after-no-effect:daemon-action",
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
    })).toMatchObject({
      reservedProviderGeneration: 3,
      reservedPrincipalGeneration: 3,
      reservedBridgeGeneration: 3,
    });
  });

  it("supersedes source drift before provider I/O while retaining reserved generations", async () => {
    const provider = new JournalProvider();
    const domain = new LifecycleRotationDomain({ provider }, [seed()]);
    const accepted = admitted(domain);
    domain.markTurnTerminal(PROJECT, "run-crash", "chair", "caller");
    domain.advanceRevision(PROJECT, "run-crash", "chair", "task");

    expect(await domain.driveRotation(PROJECT, "run-crash", accepted.custodyRef)).toMatchObject({
      phase: "finalized",
      disposition: "superseded",
    });
    expect(provider).toMatchObject({ dispatchCount: 0, effectCount: 0, lookupCount: 0 });
    expect(domain.inspectHighWater(PROJECT, "run-crash", "chair").providerGeneration).toBe(2);
  });

  it("abandons nonfinal custody only with destructive authority, an exact plan and action pair", () => {
    const domain = new LifecycleRotationDomain({
      provider: new JournalProvider(),
      recoveryAuthority: trustedRecoveryAuthority,
    }, [seed()]);
    const accepted = admitted(domain);
    const custody = domain.inspectCustody(PROJECT, "run-crash", accepted.custodyRef);
    const plan = domain.previewCustodyAbandonment(PROJECT, "run-crash", accepted.custodyRef);
    const authorityPreimage = {
      projectSessionId: PROJECT,
      runId: "run-crash",
      agentId: "chair",
      sessionGeneration: 1,
      operations: ["session.cancel"] as const,
    };
    const authority = {
      ...authorityPreimage,
      authorityDigest: lifecycleDigest(authorityPreimage),
      consequentialGateId: "gate:abandon",
      consequentialGateDigest: digest("gate:abandon"),
      consequentialGateRecoverySourceRef: accepted.custodyRef,
      directHumanConfirmation: { reason: "confirmed retirement", attestationDigest: digest("human:abandon") },
    };
    domain.registerRecoveryIssue(abandonRecoveryIssue(authority, accepted.custodyRef, custody.pair));

    expect(() => domain.abandonCustody({
      projectSessionId: PROJECT,
      custodyRef: accepted.custodyRef,
      runId: "run-crash",
      pair: custody.pair,
    } as never)).toThrow(expect.objectContaining({ code: "RECOVERY_ABANDON_FORBIDDEN" }));
    expect(() => domain.abandonCustody({
      projectSessionId: PROJECT,
      custodyRef: accepted.custodyRef,
      runId: "run-crash",
      pair: { ...custody.pair, actionId: "wrong" },
      authority,
      expectedArchivalPlanDigest: plan.planDigest,
      expectedSourceCheckpointDigest: plan.sourceCheckpointDigest,
    })).toThrow(expect.objectContaining({ code: "RECOVERY_ACTION_PAIR_MISMATCH" }));
    const request = {
      projectSessionId: PROJECT,
      custodyRef: accepted.custodyRef,
      runId: "run-crash",
      pair: custody.pair,
      authority,
      expectedArchivalPlanDigest: plan.planDigest,
      expectedSourceCheckpointDigest: plan.sourceCheckpointDigest,
    };
    const first = domain.abandonCustody(request);
    expect(first).toMatchObject({
      phase: "finalized",
      disposition: "abandoned",
      terminalReceipt: { kind: "custody-terminal" },
    });
    const auditCount = domain.snapshot().audits.length;
    expect(domain.abandonCustody(request)).toEqual(first);
    expect(domain.snapshot().audits).toHaveLength(auditCount);
    expect(domain.inspectAgent(PROJECT, "run-crash", "chair")).toMatchObject({ lifecycle: "archived", claimsFrozen: true });
    const tampered = structuredClone(domain.snapshot()) as any;
    const abandoned = tampered.custodies.find((entry: any) => entry.custodyRef === accepted.custodyRef);
    abandoned.terminalEvidence.proofDigest = digest("substituted-retirement-attestation");
    abandoned.terminalEvidence.terminalEvidenceDigest = lifecycleDigest({
      schemaVersion: 1,
      custodyRef: abandoned.custodyRef,
      requestDigest: abandoned.requestDigest,
      pair: abandoned.pair,
      disposition: abandoned.disposition,
      detail: abandoned.terminalEvidence.detail,
      proofDigest: abandoned.terminalEvidence.proofDigest,
      history: abandoned.history,
    });
    const { snapshotDigest: _ignored, ...preimage } = tampered;
    expect(() => LifecycleRotationDomain.hydrate({
      provider: new JournalProvider(),
      recoveryAuthority: trustedRecoveryAuthority,
    }, { ...preimage, snapshotDigest: lifecycleDigest(preimage) }))
      .toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it("retires an already-final custody without rewriting it and hydrates the durable retirement", () => {
    const ports = {
      provider: new JournalProvider(),
      recoveryAuthority: trustedRecoveryAuthority,
    };
    const domain = new LifecycleRotationDomain(ports, [seed()]);
    const accepted = admitted(domain);
    const custody = domain.inspectCustody(PROJECT, "run-crash", accepted.custodyRef);
    domain.markTurnTerminal(PROJECT, "run-crash", "chair", "caller");
    domain.proveNoEffect(PROJECT, "run-crash", accepted.custodyRef, {
      pair: custody.pair,
      dispatchRecorded: false,
      evidenceDigest: digest("final-before-retirement"),
    });
    const before = domain.inspectCustody(PROJECT, "run-crash", accepted.custodyRef);
    const plan = domain.previewCustodyAbandonment(PROJECT, "run-crash", accepted.custodyRef);
    const authorityPreimage = {
      projectSessionId: PROJECT,
      runId: "run-crash",
      agentId: "chair",
      sessionGeneration: 1,
      operations: ["session.cancel"] as const,
    };
    const authority = {
      ...authorityPreimage,
      authorityDigest: lifecycleDigest(authorityPreimage),
      consequentialGateId: "gate:retire-final",
      consequentialGateDigest: digest("gate:retire-final"),
      consequentialGateRecoverySourceRef: accepted.custodyRef,
      directHumanConfirmation: {
        reason: "confirmed final custody retirement",
        attestationDigest: digest("human:retire-final"),
      },
    };
    domain.registerRecoveryIssue(abandonRecoveryIssue(authority, accepted.custodyRef, custody.pair));
    const request = {
      projectSessionId: PROJECT,
      runId: "run-crash",
      custodyRef: accepted.custodyRef,
      pair: custody.pair,
      authority,
      expectedArchivalPlanDigest: plan.planDigest,
      expectedSourceCheckpointDigest: plan.sourceCheckpointDigest,
    };

    expect(domain.abandonCustody(request)).toEqual(before);
    expect(domain.snapshot().recoveryRetirements).toMatchObject([{
      recoverySourceKind: "custody",
      recoverySourceRef: accepted.custodyRef,
      oldTerminalDisposition: "no-effect",
      abandonKind: "finalized-custody",
      actionPair: custody.pair,
    }]);
    const restored = LifecycleRotationDomain.hydrate(ports, domain.snapshot());
    expect(restored.inspectCustody(PROJECT, "run-crash", accepted.custodyRef)).toEqual(before);
    expect(restored.inspectAgent(PROJECT, "run-crash", "chair")).toMatchObject({
      lifecycle: "archived",
      claimsFrozen: true,
    });
    expect(restored.abandonCustody(request)).toEqual(before);
  });
});

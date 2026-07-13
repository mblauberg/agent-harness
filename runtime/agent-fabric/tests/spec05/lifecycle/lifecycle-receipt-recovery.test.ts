import { beforeEach, describe, expect, it } from "vitest";

import {
  LifecycleRotationDomain,
  lifecycleDigest,
  type LifecycleAgentSeed,
  type LifecycleAuthenticatedReceipt,
  type LifecycleIntegrityReceiptLookup,
  type LifecycleIntegrityReceiptRecord,
  type LifecycleIntegrityReceiptSubject,
  type LifecycleProviderPort,
  type ProviderActionObservation,
  type ReplacementDispatch,
} from "../../../src/lifecycle/index.ts";
import {
  abandonRecoveryIssue,
  resetTrustedLifecycleIntegrityReceipts,
  trustedLifecycleIntegrityReceipts,
  trustedRecoveryAuthority,
} from "./recovery-issue-fixture.ts";

const PROJECT = "project-receipt-recovery";
const digest = lifecycleDigest;

type ReceiptFailureMode = "normal" | "throw-before" | "append-then-throw" | "verify-false";

class FaultingReceiptAuthority {
  mode: ReceiptFailureMode = "normal";
  targetKind: LifecycleIntegrityReceiptSubject["kind"] = "custody-terminal";
  hideTargetReads = false;

  appendReceipt(subject: LifecycleIntegrityReceiptSubject): LifecycleAuthenticatedReceipt {
    if (subject.kind !== this.targetKind || this.mode === "normal") {
      return trustedLifecycleIntegrityReceipts.appendReceipt(subject);
    }
    if (this.mode === "throw-before") throw new Error("receipt append unavailable");
    const receipt = trustedLifecycleIntegrityReceipts.appendReceipt(subject);
    if (this.mode === "append-then-throw") throw new Error("receipt append timed out after commit");
    return receipt;
  }

  readReceipt(lookup: LifecycleIntegrityReceiptLookup): LifecycleIntegrityReceiptRecord | null {
    if (this.hideTargetReads && lookup.kind === this.targetKind) return null;
    return trustedLifecycleIntegrityReceipts.readReceipt(lookup);
  }

  verifyReceipt(subject: LifecycleIntegrityReceiptSubject, receipt: LifecycleAuthenticatedReceipt): boolean {
    if (subject.kind === this.targetKind && this.mode === "verify-false") return false;
    return trustedLifecycleIntegrityReceipts.verifyReceipt(subject, receipt);
  }

  readLedger(): unknown {
    return (trustedLifecycleIntegrityReceipts as any).readLedger();
  }

  verifyLedger(ledger: unknown): boolean {
    return (trustedLifecycleIntegrityReceipts as any).verifyLedger(ledger);
  }
}

class ReceiptProvider implements LifecycleProviderPort {
  dispatchCount = 0;
  lookupCount = 0;
  outcome: "no-effect" | "terminal" = "no-effect";

  async dispatchReplacement(dispatch: ReplacementDispatch): Promise<ProviderActionObservation> {
    this.dispatchCount += 1;
    if (this.outcome === "no-effect") {
      return { status: "closed-no-effect", proofDigest: digest(`proof:${dispatch.pair.actionId}`) };
    }
    return {
      status: "terminal",
      candidate: {
        provider: {
          reference: `provider:${dispatch.agentId}:g${String(dispatch.reservedProviderGeneration)}`,
          providerGeneration: dispatch.reservedProviderGeneration,
          contextRevision: 0,
          evidenceDigest: digest(`replacement:${dispatch.pair.actionId}`),
          historyDigest: digest(`replacement-history:${dispatch.pair.actionId}`),
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

  async lookupReplacement(): Promise<ProviderActionObservation> {
    this.lookupCount += 1;
    return { status: "ambiguous" };
  }
}

function seed(runId = "run-receipt", agentId = "chair"): LifecycleAgentSeed {
  return {
    projectSessionId: PROJECT,
    runId,
    agentId,
    bridgeOwnerId: agentId,
    role: "chair",
    lifecycle: "ready",
    provider: {
      reference: `provider:${agentId}:g1`,
      providerGeneration: 1,
      contextRevision: 0,
      evidenceDigest: digest(`source:${runId}:${agentId}`),
      historyDigest: digest(`source-history:${runId}:${agentId}`),
    },
    sourceBinding: {
      capabilityHash: digest(`source-capability:${runId}:${agentId}`),
      custodyAction: { adapterId: "codex", actionId: `source:${runId}:${agentId}` },
      adapterContractDigest: digest(`source-contract:${runId}:${agentId}`),
      bridgeRowId: `bridge:${runId}:${agentId}`,
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
    recoveryCheckpointState: "absent",
    recoveryCheckpointRef: null,
    childIds: [],
    openWork: [],
    turns: [{
      turnId: `caller:${runId}:${agentId}`,
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

function request(domain: LifecycleRotationDomain, runId = "run-receipt", agentId = "chair", suffix = "one") {
  return domain.requestRotation({
    commandId: `rotate:${runId}:${agentId}:${suffix}`,
    projectSessionId: PROJECT,
    runId,
    agentId,
    action: "rotate",
    auth: { providerGeneration: 1, principalGeneration: 1, bridgeGeneration: 1 },
    checkpoint: domain.checkpoint(PROJECT, runId, agentId),
    adapterId: "codex",
    actionId: `replacement:${runId}:${agentId}:${suffix}`,
    adapterContractDigest: digest(`replacement-contract:${runId}:${agentId}`),
    operation: "launch",
  });
}

function seal(snapshot: any): any {
  const { snapshotDigest: _ignored, ...preimage } = snapshot;
  return { ...preimage, snapshotDigest: lifecycleDigest(preimage) };
}

function removeAgent(snapshot: any, runId: string, agentId: string): any {
  const removedCustodies = new Set(
    snapshot.custodies
      .filter((custody: any) => custody.runId === runId && custody.agentId === agentId)
      .map((custody: any) => custody.custodyRef),
  );
  snapshot.agents = snapshot.agents.filter((agent: any) => agent.runId !== runId || agent.agentId !== agentId);
  snapshot.custodies = snapshot.custodies.filter((custody: any) => !removedCustodies.has(custody.custodyRef));
  snapshot.commands = snapshot.commands.filter((command: any) => !removedCustodies.has(command.custodyRef));
  snapshot.audits = snapshot.audits.filter((audit: any) => audit.runId !== runId || audit.agentId !== agentId);
  snapshot.custodyDispositionProofs = snapshot.custodyDispositionProofs
    .filter((proof: any) => !removedCustodies.has(proof.custodyRef));
  snapshot.reviewCertificationCuts = snapshot.reviewCertificationCuts
    .filter((cut: any) => !removedCustodies.has(cut.lifecycleCustodyRef.custodyId));
  const agentKey = `${PROJECT}\u0000${runId}\u0000${agentId}`;
  const bridgeKey = `${PROJECT}\u0000${runId}\u0000${agentId}`;
  snapshot.providerHighWater = snapshot.providerHighWater.filter((entry: any) => entry.key !== agentKey);
  snapshot.principalHighWater = snapshot.principalHighWater.filter((entry: any) => entry.key !== agentKey);
  snapshot.bridgeHighWater = snapshot.bridgeHighWater.filter((entry: any) => entry.key !== bridgeKey);
  return snapshot;
}

describe("Spec 05 lifecycle receipt outbox and authoritative ledger", () => {
  beforeEach(() => resetTrustedLifecycleIntegrityReceipts());

  it.each([
    "throw-before",
    "append-then-throw",
    "verify-false",
  ] as const)("replays the exact closed-no-effect observation after %s", async (mode) => {
    const provider = new ReceiptProvider();
    const authority = new FaultingReceiptAuthority();
    authority.mode = mode;
    authority.hideTargetReads = mode === "append-then-throw";
    const domain = new LifecycleRotationDomain({ provider, integrityReceipts: authority as any }, [seed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-receipt", "chair", "caller:run-receipt:chair");

    await expect(domain.driveRotation(PROJECT, "run-receipt", accepted.custodyRef)).rejects.toMatchObject({
      code: mode === "verify-false" ? "LIFECYCLE_RECEIPT_INVALID" : "LIFECYCLE_RECEIPT_APPEND_FAILED",
    });
    expect(domain.inspectCustody(PROJECT, "run-receipt", accepted.custodyRef)).toMatchObject({
      phase: "dispatched",
      disposition: null,
      history: ["awaiting-boundary", "prepared", "dispatched"],
    });
    expect(domain.audits(PROJECT, "run-receipt").filter((event) => event.sourceId === accepted.custodyRef)).toEqual([]);
    expect((domain.snapshot() as any).integrityReceiptOutbox).toHaveLength(1);

    authority.mode = "normal";
    authority.hideTargetReads = false;
    await expect(domain.driveRotation(PROJECT, "run-receipt", accepted.custodyRef)).resolves.toMatchObject({
      phase: "finalized",
      disposition: "no-effect",
      terminalEvidence: {
        detail: "authenticated-provider-closed-no-effect",
        proofDigest: digest("proof:replacement:run-receipt:chair:one"),
      },
    });
    expect(provider).toMatchObject({ dispatchCount: 1, lookupCount: 0 });
    expect((domain.snapshot() as any).integrityReceiptOutbox).toEqual([]);
  });

  it("reconciles append-success-then-throw in the original terminal call", async () => {
    const provider = new ReceiptProvider();
    const authority = new FaultingReceiptAuthority();
    authority.mode = "append-then-throw";
    const domain = new LifecycleRotationDomain({ provider, integrityReceipts: authority as any }, [seed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-receipt", "chair", "caller:run-receipt:chair");

    await expect(domain.driveRotation(PROJECT, "run-receipt", accepted.custodyRef)).resolves.toMatchObject({
      phase: "finalized",
      disposition: "no-effect",
    });
    expect(provider).toMatchObject({ dispatchCount: 1, lookupCount: 0 });
    expect((domain.snapshot() as any).integrityReceiptOutbox).toEqual([]);
  });

  it("recovers a crash after the external terminal append without another provider observation", async () => {
    const provider = new ReceiptProvider();
    const authority = new FaultingReceiptAuthority();
    let fired = false;
    const domain = new LifecycleRotationDomain({
      provider,
      integrityReceipts: authority as any,
      fault: {
        hit(label: any) {
          if (!fired && label === "after-terminal-receipt-before-local-commit") {
            fired = true;
            throw new Error(`crash:${String(label)}`);
          }
        },
      } as any,
    }, [seed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-receipt", "chair", "caller:run-receipt:chair");
    await expect(domain.driveRotation(PROJECT, "run-receipt", accepted.custodyRef))
      .rejects.toThrow("crash:after-terminal-receipt-before-local-commit");

    const durable = JSON.parse(JSON.stringify(domain.snapshot()));
    expect(durable.integrityReceiptOutbox).toHaveLength(1);
    const restored = LifecycleRotationDomain.hydrate({ provider, integrityReceipts: authority as any }, durable);
    await expect(restored.driveRotation(PROJECT, "run-receipt", accepted.custodyRef)).resolves.toMatchObject({
      disposition: "no-effect",
    });
    expect(provider).toMatchObject({ dispatchCount: 1, lookupCount: 0 });
    expect((restored.snapshot() as any).integrityReceiptOutbox).toEqual([]);
  });

  it("pins the fallback review decision before a terminal-receipt crash", async () => {
    const provider = new ReceiptProvider();
    provider.outcome = "terminal";
    const authority = new FaultingReceiptAuthority();
    let targetReads = 0;
    let reviewCommits = 0;
    let fired = false;
    const reviewCertification = {
      readCurrentTarget() {
        targetReads += 1;
        if (targetReads > 1) throw new Error("review target was re-read");
        return {
          schemaVersion: 1 as const,
          runId: "run-receipt",
          targetGeneration: 2,
          predecessorBindingGeneration: 1,
          predecessorBindingDigest: digest("terminal-crash-predecessor"),
          terminalSequenceHighWater: 4,
        };
      },
      commitReviewAdoption() {
        reviewCommits += 1;
        throw new Error("review owner must not be entered after terminal receipt commit");
      },
    };
    const domain = new LifecycleRotationDomain({
      provider,
      integrityReceipts: authority as any,
      reviewCertification,
      fault: {
        hit(label: any) {
          if (!fired && label === "after-terminal-receipt-before-local-commit") {
            fired = true;
            throw new Error(`crash:${String(label)}`);
          }
        },
      } as any,
    }, [seed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-receipt", "chair", "caller:run-receipt:chair");

    await expect(domain.driveRotation(PROJECT, "run-receipt", accepted.custodyRef))
      .rejects.toThrow("crash:after-terminal-receipt-before-local-commit");
    const pending = (domain.snapshot() as any).integrityReceiptOutbox;
    expect(pending).toHaveLength(1);
    expect(pending[0].replay).toMatchObject({
      kind: "terminal-adoption",
      reviewDecision: { kind: "stale", reason: "same-subject-predicate-failed" },
    });

    const restored = LifecycleRotationDomain.hydrate(
      { provider, integrityReceipts: authority as any, reviewCertification },
      JSON.parse(JSON.stringify(domain.snapshot())),
    );
    await expect(restored.driveRotation(PROJECT, "run-receipt", accepted.custodyRef)).resolves.toMatchObject({
      phase: "finalized",
      disposition: "adopted",
      reviewDecision: { kind: "stale", reason: "same-subject-predicate-failed" },
    });
    expect(targetReads).toBe(1);
    expect(reviewCommits).toBe(0);
  });

  it.each([
    ["lifecycle", (snapshot: any) => { snapshot.integrityReceiptOutbox[0].replay.lifecycle = "archived"; }],
    ["audit", (snapshot: any) => { snapshot.integrityReceiptOutbox[0].replay.audits[0].detail = digest("forged-proof"); }],
  ])("rejects a resealed pending terminal %s continuation tamper", async (_label, mutate) => {
    const provider = new ReceiptProvider();
    const authority = new FaultingReceiptAuthority();
    let fired = false;
    const domain = new LifecycleRotationDomain({
      provider,
      integrityReceipts: authority as any,
      fault: {
        hit(label: any) {
          if (!fired && label === "after-terminal-receipt-before-local-commit") {
            fired = true;
            throw new Error("crash:terminal-receipt");
          }
        },
      } as any,
    }, [seed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-receipt", "chair", "caller:run-receipt:chair");
    await expect(domain.driveRotation(PROJECT, "run-receipt", accepted.custodyRef)).rejects.toThrow();
    const snapshot = structuredClone(domain.snapshot()) as any;
    mutate(snapshot);

    expect(() => LifecycleRotationDomain.hydrate(
      { provider, integrityReceipts: authority as any },
      seal(snapshot),
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it.each([
    "throw-before",
    "append-then-throw",
    "verify-false",
    "crash-after-append",
  ] as const)("replays the exact review decision after %s", async (failure) => {
    const provider = new ReceiptProvider();
    provider.outcome = "terminal";
    const authority = new FaultingReceiptAuthority();
    authority.targetKind = "review-adoption-decision";
    authority.mode = failure === "crash-after-append" ? "normal" : failure;
    authority.hideTargetReads = failure === "append-then-throw";
    let reviewCalls = 0;
    let fired = false;
    const reviewCertification = {
      readCurrentTarget() {
        return {
          schemaVersion: 1 as const,
          runId: "run-receipt",
          targetGeneration: 2,
          predecessorBindingGeneration: 1,
          predecessorBindingDigest: digest("predecessor-binding"),
          terminalSequenceHighWater: 3,
        };
      },
      commitReviewAdoption(input: any) {
        reviewCalls += 1;
        if (reviewCalls > 1) throw new Error("review owner was re-entered");
        const cutPreimage = {
          schemaVersion: 1 as const,
          runId: "run-receipt",
          targetGeneration: 2,
          predecessorBindingGeneration: 1,
          predecessorBindingDigest: digest("predecessor-binding"),
          terminalSequenceHighWater: 3,
          lifecycleCustodyRef: input.lifecycleCustodyRef,
          lifecycleAdoptionEvidenceDigest: input.lifecycleAdoptionEvidenceDigest,
        };
        input.commitLifecycleAdoption({
          kind: "rebound",
          cut: { ...cutPreimage, cutDigest: lifecycleDigest(cutPreimage) },
          rebindReceiptDigest: digest("review-rebind"),
        });
      },
    };
    const domain = new LifecycleRotationDomain({
      provider,
      integrityReceipts: authority as any,
      reviewCertification,
      fault: {
        hit(label: any) {
          if (failure === "crash-after-append" && !fired && label === "after-review-receipt-before-local-commit") {
            fired = true;
            throw new Error(`crash:${String(label)}`);
          }
        },
      } as any,
    }, [seed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-receipt", "chair", "caller:run-receipt:chair");

    await expect(domain.driveRotation(PROJECT, "run-receipt", accepted.custodyRef)).rejects.toThrow();
    expect(domain.inspectCustody(PROJECT, "run-receipt", accepted.custodyRef)).toMatchObject({
      phase: "committing",
      disposition: null,
      reviewDecision: null,
    });
    expect(domain.inspectAgent(PROJECT, "run-receipt", "chair").provider.providerGeneration).toBe(1);
    const pending = (domain.snapshot() as any).integrityReceiptOutbox;
    expect(pending.map((intent: any) => intent.subject.kind).sort()).toEqual([
      "custody-terminal",
      "review-adoption-decision",
    ]);
    const storedDecision = pending.find((intent: any) => intent.subject.kind === "review-adoption-decision").replay.decision;

    authority.mode = "normal";
    authority.hideTargetReads = false;
    const resumed = failure === "crash-after-append"
      ? LifecycleRotationDomain.hydrate({
          provider,
          integrityReceipts: authority as any,
          reviewCertification,
        }, JSON.parse(JSON.stringify(domain.snapshot())))
      : domain;
    await expect(resumed.driveRotation(PROJECT, "run-receipt", accepted.custodyRef)).resolves.toMatchObject({
      phase: "finalized",
      disposition: "adopted",
      reviewDecision: storedDecision,
    });
    expect(reviewCalls).toBe(1);
    expect((resumed.snapshot() as any).integrityReceiptOutbox).toEqual([]);
  });

  it("reconciles append-success-then-throw in the original review transaction", async () => {
    const provider = new ReceiptProvider();
    provider.outcome = "terminal";
    const authority = new FaultingReceiptAuthority();
    authority.targetKind = "review-adoption-decision";
    authority.mode = "append-then-throw";
    let reviewCalls = 0;
    const domain = new LifecycleRotationDomain({
      provider,
      integrityReceipts: authority as any,
      reviewCertification: {
        readCurrentTarget() { return null; },
        commitReviewAdoption(input) {
          reviewCalls += 1;
          input.commitLifecycleAdoption({ kind: "no-current-target" });
        },
      },
    }, [seed()]);
    const accepted = request(domain);
    domain.markTurnTerminal(PROJECT, "run-receipt", "chair", "caller:run-receipt:chair");

    await expect(domain.driveRotation(PROJECT, "run-receipt", accepted.custodyRef)).resolves.toMatchObject({
      phase: "finalized",
      disposition: "adopted",
      reviewDecision: { kind: "no-current-target" },
    });
    expect(reviewCalls).toBe(1);
    expect((domain.snapshot() as any).integrityReceiptOutbox).toEqual([]);
  });

  it("keeps custody abandonment atomic while its terminal receipt is pending", () => {
    const provider = new ReceiptProvider();
    const authority = new FaultingReceiptAuthority();
    authority.mode = "throw-before";
    const domain = new LifecycleRotationDomain({
      provider,
      integrityReceipts: authority as any,
      recoveryAuthority: trustedRecoveryAuthority,
    }, [seed()]);
    const accepted = request(domain);
    const custody = domain.inspectCustody(PROJECT, "run-receipt", accepted.custodyRef);
    const plan = domain.previewCustodyAbandonment(PROJECT, "run-receipt", accepted.custodyRef);
    const authorityPreimage = {
      projectSessionId: PROJECT,
      runId: "run-receipt",
      agentId: "chair",
      sessionGeneration: 1,
      operations: ["session.cancel"] as const,
    };
    const abandonAuthority = {
      ...authorityPreimage,
      authorityDigest: lifecycleDigest(authorityPreimage),
      consequentialGateId: "gate:abandon-receipt",
      consequentialGateDigest: digest("gate:abandon-receipt"),
      consequentialGateRecoverySourceRef: accepted.custodyRef,
      directHumanConfirmation: {
        reason: "confirmed receipt-safe retirement",
        attestationDigest: digest("human:abandon-receipt"),
      },
    };
    domain.registerRecoveryIssue(abandonRecoveryIssue(abandonAuthority, accepted.custodyRef, custody.pair));
    const abandonRequest = {
      projectSessionId: PROJECT,
      runId: "run-receipt",
      custodyRef: accepted.custodyRef,
      pair: custody.pair,
      authority: abandonAuthority,
      expectedArchivalPlanDigest: plan.planDigest,
      expectedSourceCheckpointDigest: plan.sourceCheckpointDigest,
    };

    expect(() => domain.abandonCustody(abandonRequest)).toThrow(expect.objectContaining({
      code: "LIFECYCLE_RECEIPT_APPEND_FAILED",
    }));
    expect(domain.inspectCustody(PROJECT, "run-receipt", accepted.custodyRef)).toMatchObject({
      phase: "awaiting-boundary",
      disposition: null,
    });
    expect(domain.inspectAgent(PROJECT, "run-receipt", "chair")).toMatchObject({
      lifecycle: "suspended",
      archivalPlan: null,
    });
    expect((domain.snapshot() as any)).toMatchObject({
      recoveryRetirements: [],
      integrityReceiptOutbox: [{ subject: { kind: "custody-terminal", disposition: "abandoned" } }],
    });

    authority.mode = "normal";
    expect(domain.abandonCustody(abandonRequest)).toMatchObject({
      phase: "finalized",
      disposition: "abandoned",
    });
    expect(domain.inspectAgent(PROJECT, "run-receipt", "chair")).toMatchObject({
      lifecycle: "archived",
      claimsFrozen: true,
    });
    expect((domain.snapshot() as any).integrityReceiptOutbox).toEqual([]);
  });

  it("rejects a whole custody owner deleted behind a resealed snapshot", async () => {
    const provider = new ReceiptProvider();
    const authority = new FaultingReceiptAuthority();
    const domain = new LifecycleRotationDomain(
      { provider, integrityReceipts: authority as any },
      [seed("run-receipt", "chair-a"), seed("run-receipt", "chair-b")],
    );
    for (const agentId of ["chair-a", "chair-b"]) {
      const accepted = request(domain, "run-receipt", agentId);
      domain.markTurnTerminal(PROJECT, "run-receipt", agentId, `caller:run-receipt:${agentId}`);
      await domain.driveRotation(PROJECT, "run-receipt", accepted.custodyRef);
    }
    const rolledBack = removeAgent(structuredClone(domain.snapshot()), "run-receipt", "chair-a");

    expect(() => LifecycleRotationDomain.hydrate(
      { provider, integrityReceipts: authority as any },
      seal(rolledBack),
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it("rejects a whole run deleted behind a resealed snapshot", async () => {
    const provider = new ReceiptProvider();
    const authority = new FaultingReceiptAuthority();
    const domain = new LifecycleRotationDomain(
      { provider, integrityReceipts: authority as any },
      [seed("run-a", "chair"), seed("run-b", "chair")],
    );
    for (const runId of ["run-a", "run-b"]) {
      const accepted = request(domain, runId, "chair");
      domain.markTurnTerminal(PROJECT, runId, "chair", `caller:${runId}:chair`);
      await domain.driveRotation(PROJECT, runId, accepted.custodyRef);
    }
    const rolledBack = removeAgent(structuredClone(domain.snapshot()), "run-a", "chair");

    expect(() => LifecycleRotationDomain.hydrate(
      { provider, integrityReceipts: authority as any },
      seal(rolledBack),
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it("rejects an old snapshot after the external ledger advances", async () => {
    const provider = new ReceiptProvider();
    const authority = new FaultingReceiptAuthority();
    const domain = new LifecycleRotationDomain({ provider, integrityReceipts: authority as any }, [seed()]);
    const first = request(domain, "run-receipt", "chair", "first");
    domain.markTurnTerminal(PROJECT, "run-receipt", "chair", "caller:run-receipt:chair");
    await domain.driveRotation(PROJECT, "run-receipt", first.custodyRef);
    const oldSnapshot = domain.snapshot();

    domain.openTurn(PROJECT, "run-receipt", "chair", {
      turnId: "caller:second",
      state: "active",
      providerGeneration: 1,
      principalGeneration: 1,
      bridgeGeneration: 1,
    });
    const second = request(domain, "run-receipt", "chair", "second");
    domain.markTurnTerminal(PROJECT, "run-receipt", "chair", "caller:second");
    await domain.driveRotation(PROJECT, "run-receipt", second.custodyRef);

    expect(() => LifecycleRotationDomain.hydrate(
      { provider, integrityReceipts: authority as any },
      oldSnapshot,
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });
});

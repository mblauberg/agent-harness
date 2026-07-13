import { describe, expect, it, vi } from "vitest";

import {
  lifecycleDigest,
  type ContextObservation,
  type LifecycleAgentSeed,
  type LifecycleProviderPort,
  type ProviderActionObservation,
  type ProviderActionPair,
  type ReplacementDispatch,
} from "../../../src/lifecycle/index.ts";
import {
  abandonRecoveryIssue,
  freshRecoveryIssue,
  ReceiptBackedLifecycleRotationDomain as LifecycleRotationDomain,
  trustedRecoveryAuthority,
} from "./recovery-issue-fixture.ts";

const digest = lifecycleDigest;
const PROJECT = "project-recovery";

class RecoveryProvider implements LifecycleProviderPort {
  readonly dispatches: ReplacementDispatch[] = [];

  async dispatchReplacement(dispatch: ReplacementDispatch): Promise<ProviderActionObservation> {
    this.dispatches.push(dispatch);
    return {
      status: "terminal",
      candidate: {
        provider: {
          reference: `provider:chair:g${String(dispatch.reservedProviderGeneration)}`,
          providerGeneration: dispatch.reservedProviderGeneration,
          contextRevision: 0,
          evidenceDigest: digest("fresh-evidence"),
          historyDigest: digest("fresh-history"),
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
    return { status: "ambiguous" };
  }
}

function seed(): LifecycleAgentSeed {
  return {
    projectSessionId: PROJECT,
    runId: "run-recovery",
    agentId: "chair",
    bridgeOwnerId: "chair",
    role: "chair",
    lifecycle: "ready",
    provider: {
      reference: "provider:chair:g2",
      providerGeneration: 2,
      contextRevision: 1,
      evidenceDigest: digest("current"),
      historyDigest: digest("source-history"),
    },
    sourceBinding: {
      capabilityHash: digest("source-capability"),
      custodyAction: { adapterId: "codex-app-server", actionId: "source-action" },
      adapterContractDigest: digest("source-contract"),
      bridgeRowId: "bridge:chair:2",
      bridgeRevision: 2,
      projectSessionGeneration: 3,
      runGeneration: 4,
      chairLeaseGeneration: 5,
    },
    principalGeneration: 7,
    bridgeGeneration: 9,
    taskRevision: 3,
    mailboxRevision: 4,
    childRevision: 5,
    writeRevision: 6,
    authorityRevision: 7,
    recoveryCheckpointState: "last-validated",
    recoveryCheckpointRef: "checkpoint:operator-recovery",
    childIds: ["worker"],
    openWork: [{ obligationId: "task", kind: "task", revision: 3 }],
    turns: [],
    writes: [{ custodyId: "write", state: "active" }],
    deliveries: [{ deliveryId: "ready", sequence: 1, state: "ready", claimGeneration: null, required: true }],
    taskOwnerLeases: [{ leaseId: "task-owner", state: "active" }],
    barriers: [{ barrierId: "barrier", state: "active" }],
    memberships: [{ membershipId: "run-membership", kind: "run", state: "active" }],
    messageWatermark: 0,
    deliveryWatermark: 1,
    membershipWatermark: 0,
    archivalPlan: null,
    sourceCapabilityRevoked: false,
    principalRevoked: false,
    bridgeRevoked: false,
  };
}

function openLoss(domain: LifecycleRotationDomain): string {
  const observation: ContextObservation = {
    sourceEventId: "context-jump",
    projectSessionId: PROJECT,
    runId: "run-recovery",
    agentId: "chair",
    providerGeneration: 4,
    contextRevision: 0,
    evidenceDigest: digest("context-jump"),
  };
  return domain.observeContext(observation).lossId!;
}

const pair: ProviderActionPair = {
  adapterId: "codex-app-server",
  actionId: "operator:fresh-rotate:chair",
};

function attemptId(actionPair: ProviderActionPair): string {
  return `issue:fresh:${actionPair.actionId}`;
}

function recoveryDomain(provider: LifecycleProviderPort): LifecycleRotationDomain {
  return new LifecycleRotationDomain({ provider, recoveryAuthority: trustedRecoveryAuthority }, [seed()]);
}

function preview(domain: LifecycleRotationDomain, lossId: string, actionPair = pair) {
  const issueId = attemptId(actionPair);
  const capability = `capability:${actionPair.actionId}`;
  const loss = domain.inspectLoss(PROJECT, "run-recovery", lossId);
  const checkpoint = loss.checkpoint;
  domain.registerRecoveryIssue(freshRecoveryIssue({
    issueId,
    capability,
    projectSessionId: PROJECT,
    runId: "run-recovery",
    agentId: "chair",
    sessionGeneration: 3,
    lossId,
    pair: actionPair,
    adapterContractDigest: digest("replacement-contract"),
    operation: "launch",
    checkpointDigest: checkpoint.checkpointDigest,
  }));
  return domain.prepareFreshRotation({
    projectSessionId: PROJECT,
    runId: "run-recovery",
    lossId,
    issueId,
    capability,
    pair: actionPair,
    adapterContractDigest: digest("replacement-contract"),
    operation: "launch",
    checkpoint,
    checkpointArtifactRef: loss.checkpointRef!,
  });
}

function abandonAuthority(recoverySourceRef: string) {
  const authorityPreimage = {
    projectSessionId: PROJECT,
    runId: "run-recovery",
    agentId: "chair",
    sessionGeneration: 3,
    operations: ["session.cancel"] as const,
  };
  return {
    ...authorityPreimage,
    authorityDigest: lifecycleDigest(authorityPreimage),
    consequentialGateId: "gate:recovery-abandon",
    consequentialGateDigest: digest("gate:recovery-abandon"),
    consequentialGateRecoverySourceRef: recoverySourceRef,
    directHumanConfirmation: {
      reason: "Human confirmed lifecycle recovery retirement",
      attestationDigest: digest("human:recovery-abandon"),
    },
  };
}

describe("Spec 05 operator generation-loss recovery", () => {
  it("persists the exact loss-time predecessor, observation and checkpoint tuple", () => {
    const domain = recoveryDomain(new RecoveryProvider());
    const checkpoint = domain.checkpoint(PROJECT, "run-recovery", "chair");
    const lossId = openLoss(domain);
    const loss = domain.inspectLoss(PROJECT, "run-recovery", lossId);

    expect(loss).toMatchObject({
      oldProvider: seed().provider,
      newProvider: {
        ...seed().provider,
        providerGeneration: 4,
        contextRevision: 0,
        evidenceDigest: digest("context-jump"),
      },
      sourceBinding: seed().sourceBinding,
      sourcePrincipalGeneration: seed().principalGeneration,
      sourceBridgeGeneration: seed().bridgeGeneration,
      checkpoint,
      lossEvidenceDigest: digest("context-jump"),
    });
    expect(domain.snapshot().contextEvents).toMatchObject([{
      observation: {
        sourceEventId: "context-jump",
        providerGeneration: 4,
        contextRevision: 0,
        evidenceDigest: digest("context-jump"),
      },
    }]);

    const recovered = LifecycleRotationDomain.hydrate(
      { provider: new RecoveryProvider(), recoveryAuthority: trustedRecoveryAuthority },
      JSON.parse(JSON.stringify(domain.snapshot())) as ReturnType<typeof domain.snapshot>,
    );
    expect(recovered.inspectLoss(PROJECT, "run-recovery", lossId)).toEqual(loss);

    const tampered = structuredClone(domain.snapshot()) as any;
    tampered.losses[0].sourceBinding.capabilityHash = digest("crossed-capability");
    const { snapshotDigest: _ignored, ...preimage } = tampered;
    expect(() => LifecycleRotationDomain.hydrate(
      { provider: new RecoveryProvider(), recoveryAuthority: trustedRecoveryAuthority },
      { ...preimage, snapshotDigest: lifecycleDigest(preimage) },
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it("prepares fresh recovery only from the stored loss-time checkpoint", () => {
    const domain = recoveryDomain(new RecoveryProvider());
    const lossId = openLoss(domain);
    const currentCheckpoint = domain.checkpoint(PROJECT, "run-recovery", "chair");
    const lossCheckpoint = domain.inspectLoss(PROJECT, "run-recovery", lossId).checkpoint;
    const checkpointArtifactRef = domain.inspectLoss(PROJECT, "run-recovery", lossId).checkpointRef!;
    const issueId = attemptId(pair);
    const capability = `capability:${pair.actionId}`;
    domain.registerRecoveryIssue(freshRecoveryIssue({
      issueId,
      capability,
      projectSessionId: PROJECT,
      runId: "run-recovery",
      agentId: "chair",
      sessionGeneration: 3,
      lossId,
      pair,
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
      checkpointDigest: lossCheckpoint.checkpointDigest,
    }));

    expect(currentCheckpoint).not.toEqual(lossCheckpoint);
    expect(() => domain.prepareFreshRotation({
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      issueId,
      capability,
      pair,
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
      checkpoint: currentCheckpoint,
      checkpointArtifactRef,
    })).toThrow(expect.objectContaining({ code: "CHECKPOINT_MISMATCH" }));
    expect(domain.prepareFreshRotation({
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      issueId,
      capability,
      pair,
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
      checkpoint: lossCheckpoint,
      checkpointArtifactRef,
    })).toMatchObject({ checkpoint: lossCheckpoint });

    const tampered = structuredClone(domain.snapshot()) as any;
    tampered.freshRotations[0].checkpoint = tampered.losses[0].fencedCheckpoint;
    tampered.recoveryIssues[0].checkpointDigest = tampered.losses[0].fencedCheckpoint.checkpointDigest;
    const { snapshotDigest: _ignored, ...preimage } = tampered;
    expect(() => LifecycleRotationDomain.hydrate(
      { provider: new RecoveryProvider(), recoveryAuthority: trustedRecoveryAuthority },
      { ...preimage, snapshotDigest: lifecycleDigest(preimage) },
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it.each(["absent", "invalid"] as const)(
    "persists one gate-bound checkpoint artifact validation before fresh recovery from an %s loss checkpoint",
    (checkpointState) => {
      const checkpointValidator = { validate: vi.fn(() => null) };
      const domain = new LifecycleRotationDomain({
        provider: new RecoveryProvider(),
        recoveryAuthority: trustedRecoveryAuthority,
        recoveryCheckpoint: checkpointValidator,
      } as never, [{
        ...seed(),
        recoveryCheckpointState: checkpointState,
        recoveryCheckpointRef: null,
      } as never]);
      const lossId = openLoss(domain);
      const checkpoint = domain.inspectLoss(PROJECT, "run-recovery", lossId).checkpoint;
      const issueId = attemptId(pair);
      const capability = `capability:${pair.actionId}`;
      const checkpointArtifactRef = `checkpoint:recovered:${checkpointState}`;
      domain.registerRecoveryIssue(freshRecoveryIssue({
        issueId,
        capability,
        projectSessionId: PROJECT,
        runId: "run-recovery",
        agentId: "chair",
        sessionGeneration: 3,
        lossId,
        pair,
        adapterContractDigest: digest("replacement-contract"),
        operation: "launch",
        checkpointDigest: checkpoint.checkpointDigest,
      }));
      const prepareRequest = {
        projectSessionId: PROJECT,
        runId: "run-recovery",
        lossId,
        issueId,
        capability,
        pair,
        adapterContractDigest: digest("replacement-contract"),
        operation: "launch",
        checkpoint,
        checkpointArtifactRef,
      };

      expect(() => domain.prepareFreshRotation(prepareRequest))
        .toThrow(expect.objectContaining({ code: "RECOVERY_CHECKPOINT_VALIDATION_REQUIRED" }));
      expect(checkpointValidator.validate).toHaveBeenCalledTimes(1);

      const validation = {
        schemaVersion: 1 as const,
        checkpointRef: checkpointArtifactRef,
        checkpointDigest: checkpoint.checkpointDigest,
        validationRevision: 7,
        validationEvidenceDigest: digest(`checkpoint-validation:${checkpointState}`),
      };
      checkpointValidator.validate.mockReturnValue(validation as never);
      const prepared = domain.prepareFreshRotation(prepareRequest);
      expect(prepared).toMatchObject({
        checkpoint,
        checkpointValidation: {
          ...validation,
          issueId,
          recoverySourceRef: lossId,
          consequentialGateId: `gate:${issueId}`,
          consequentialGateDigest: digest(`gate:${issueId}`),
        },
      });
      expect(domain.inspectLoss(PROJECT, "run-recovery", lossId)).toMatchObject({
        checkpointState,
        checkpointRef: null,
        checkpointDigest: null,
      });
      domain.commitFreshRotation({
        projectSessionId: PROJECT,
        runId: "run-recovery",
        lossId,
        pair,
        attemptId: issueId,
      });
      expect(checkpointValidator.validate).toHaveBeenCalledTimes(2);
      const restored = LifecycleRotationDomain.hydrate({
        provider: new RecoveryProvider(),
        recoveryAuthority: trustedRecoveryAuthority,
      }, JSON.parse(JSON.stringify(domain.snapshot())) as ReturnType<typeof domain.snapshot>);
      expect(restored.prepareFreshRotation(prepareRequest)).toEqual(prepared);
      for (const changed of [
        { ...prepareRequest, checkpointArtifactRef: `${checkpointArtifactRef}:changed` },
        { ...prepareRequest, capability: `${capability}:changed` },
        { ...prepareRequest, pair: { ...pair, actionId: `${pair.actionId}:changed` } },
        { ...prepareRequest, adapterContractDigest: digest("changed-replacement-contract") },
        { ...prepareRequest, operation: "changed-launch" },
        { ...prepareRequest, checkpoint: { ...checkpoint, taskDigest: digest("changed-task") } },
      ]) {
        expect(() => restored.prepareFreshRotation(changed))
          .toThrow(expect.objectContaining({ code: "FRESH_ROTATE_PREVIEW_CONFLICT" }));
      }
      expect(checkpointValidator.validate).toHaveBeenCalledTimes(2);
    },
  );

  it("does not float a stale last-validated checkpoint reference onto a later generation loss", () => {
    const domain = recoveryDomain(new RecoveryProvider());
    domain.advanceRevision(PROJECT, "run-recovery", "chair", "task");

    const loss = domain.inspectLoss(PROJECT, "run-recovery", openLoss(domain));

    expect(loss).toMatchObject({
      checkpointState: "invalid",
      checkpointRef: null,
      checkpointDigest: null,
      checkpointValidationRevision: null,
      checkpointValidationEvidenceDigest: null,
    });
  });

  it("previews without mutation, then Commit creates an asynchronous fresh custody", async () => {
    const provider = new RecoveryProvider();
    const domain = recoveryDomain(provider);
    const lossId = openLoss(domain);
    const before = domain.inspectHighWater(PROJECT, "run-recovery", "chair");

    const prepared = preview(domain, lossId);
    expect(prepared).toMatchObject({ reservedProviderGeneration: 5, reservedPrincipalGeneration: 8, reservedBridgeGeneration: 10 });
    expect(domain.inspectLoss(PROJECT, "run-recovery", lossId)).toMatchObject({ state: "open", actionPair: null });
    expect(domain.inspectHighWater(PROJECT, "run-recovery", "chair")).toEqual(before);

    const accepted = domain.commitFreshRotation({ projectSessionId: PROJECT, runId: "run-recovery", lossId, pair, attemptId: attemptId(pair) });
    expect(accepted).toMatchObject({ phase: "awaiting-boundary", lifecycle: "suspended" });
    expect(provider.dispatches).toEqual([]);
    expect(domain.inspectLoss(PROJECT, "run-recovery", lossId)).toMatchObject({ state: "recovery-in-progress", actionPair: pair });

    const recovered = LifecycleRotationDomain.hydrate(
      { provider, recoveryAuthority: trustedRecoveryAuthority },
      JSON.parse(JSON.stringify(domain.snapshot())) as ReturnType<typeof domain.snapshot>,
    );
    await expect(recovered.driveRotation(PROJECT, "run-recovery", accepted.custodyRef)).resolves.toMatchObject({ disposition: "adopted" });
    expect(recovered.inspectLoss(PROJECT, "run-recovery", lossId)).toMatchObject({ state: "recovered-adopted" });
    expect(recovered.inspectAgent(PROJECT, "run-recovery", "chair")).toMatchObject({ lifecycle: "ready", provider: { providerGeneration: 5 } });
    expect(provider.dispatches).toHaveLength(1);
  });

  it("rejects a recovered loss snapshot that releases a loss-fenced write", async () => {
    const provider = new RecoveryProvider();
    const domain = recoveryDomain(provider);
    const lossId = openLoss(domain);
    preview(domain, lossId);
    const accepted = domain.commitFreshRotation({
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      pair,
      attemptId: attemptId(pair),
    });
    await domain.driveRotation(PROJECT, "run-recovery", accepted.custodyRef);
    const tampered = structuredClone(domain.snapshot()) as any;
    tampered.agents[0].writes[0].state = "active";
    const { snapshotDigest: _ignored, ...preimage } = tampered;

    expect(() => LifecycleRotationDomain.hydrate(
      { provider, recoveryAuthority: trustedRecoveryAuthority },
      { ...preimage, snapshotDigest: lifecycleDigest(preimage) },
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it("rejects a recovered loss whose review decision is crossed from its adopted custody", async () => {
    const provider = new RecoveryProvider();
    const domain = recoveryDomain(provider);
    const lossId = openLoss(domain);
    preview(domain, lossId);
    const accepted = domain.commitFreshRotation({
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      pair,
      attemptId: attemptId(pair),
    });
    await domain.driveRotation(PROJECT, "run-recovery", accepted.custodyRef);
    const tampered = structuredClone(domain.snapshot()) as any;
    tampered.losses[0].reviewDecision = null;
    const { snapshotDigest: _ignored, ...preimage } = tampered;

    expect(() => LifecycleRotationDomain.hydrate(
      { provider, recoveryAuthority: trustedRecoveryAuthority },
      { ...preimage, snapshotDigest: lifecycleDigest(preimage) },
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it("rejects coordinated resealing of both adopted-custody and recovered-loss review decisions", async () => {
    const provider = new RecoveryProvider();
    const domain = recoveryDomain(provider);
    const lossId = openLoss(domain);
    preview(domain, lossId);
    const accepted = domain.commitFreshRotation({
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      pair,
      attemptId: attemptId(pair),
    });
    await domain.driveRotation(PROJECT, "run-recovery", accepted.custodyRef);
    const tampered = structuredClone(domain.snapshot()) as any;
    const custody = tampered.custodies[0];
    const lifecycleCustodyRef = {
      schemaVersion: 1,
      runId: custody.runId,
      agentId: custody.agentId,
      custodyId: custody.custodyRef,
      custodyRevision: 1,
    };
    const lifecycleAdoptionEvidenceDigest = lifecycleDigest({
      projectSessionId: custody.projectSessionId,
      lifecycleCustodyRef,
      checkpoint: custody.checkpoint,
      successorProvider: custody.candidate.provider,
      successorPrincipalGeneration: custody.candidate.principalGeneration,
      successorBridgeGeneration: custody.candidate.bridgeGeneration,
      launchAttestation: custody.candidate.launchAttestation,
    });
    const evidencePreimage = {
      schemaVersion: 1,
      runId: custody.runId,
      lifecycleCustodyRef,
      lifecycleAdoptionEvidenceDigest,
      reason: "target-read-failed",
    };
    const decision = {
      kind: "integrity-stale",
      evidence: { ...evidencePreimage, evidenceDigest: lifecycleDigest(evidencePreimage) },
    };
    custody.reviewDecision = decision;
    tampered.losses[0].reviewDecision = structuredClone(decision);
    tampered.audits.find((event: any) =>
      event.kind === "lifecycle-review-adoption-decision" && event.sourceId === custody.custodyRef
    ).detail = lifecycleDigest({
      schemaVersion: 1,
      projectSessionId: custody.projectSessionId,
      runId: custody.runId,
      agentId: custody.agentId,
      lifecycleCustodyRef,
      lifecycleAdoptionEvidenceDigest,
      sourceCheckpointDigest: custody.checkpoint.checkpointDigest,
      recoveryFromLossId: custody.recoveryFromLossId,
      reviewDecision: decision,
    });
    const { snapshotDigest: _ignored, ...preimage } = tampered;

    expect(() => LifecycleRotationDomain.hydrate(
      { provider, recoveryAuthority: trustedRecoveryAuthority },
      { ...preimage, snapshotDigest: lifecycleDigest(preimage) },
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it("rejects an open loss carrying a review decision without an adopted custody", () => {
    const provider = new RecoveryProvider();
    const domain = recoveryDomain(provider);
    openLoss(domain);
    const tampered = structuredClone(domain.snapshot()) as any;
    tampered.losses[0].reviewDecision = { kind: "no-current-target" };
    const { snapshotDigest: _ignored, ...preimage } = tampered;

    expect(() => LifecycleRotationDomain.hydrate(
      { provider, recoveryAuthority: trustedRecoveryAuthority },
      { ...preimage, snapshotDigest: lifecycleDigest(preimage) },
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it("rejects stale checkpoint, broad authority and a noncanonical pair without mutation", () => {
    const domain = recoveryDomain(new RecoveryProvider());
    const lossId = openLoss(domain);
    const checkpoint = domain.inspectLoss(PROJECT, "run-recovery", lossId).checkpoint;

    expect(() => domain.prepareFreshRotation({
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      issueId: "caller-manufactured",
      capability: "caller-manufactured",
      pair,
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
      checkpoint,
    } as never)).toThrow(expect.objectContaining({ code: "FRESH_RECOVERY_ISSUE_INVALID" }));
    expect(() => domain.prepareFreshRotation({
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      issueId: "malformed-pair",
      capability: "malformed-pair",
      pair: { ...pair, operation: "launch" } as never,
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
      checkpoint,
      checkpointArtifactRef: domain.inspectLoss(PROJECT, "run-recovery", lossId).checkpointRef!,
    })).toThrow(expect.objectContaining({ code: "RECOVERY_ACTION_PAIR_INVALID" }));
    preview(domain, lossId);
    domain.advanceRevision(PROJECT, "run-recovery", "chair", "task");
    expect(() => domain.commitFreshRotation({ projectSessionId: PROJECT, runId: "run-recovery", lossId, pair, attemptId: attemptId(pair) }))
      .toThrow(expect.objectContaining({ code: "CHECKPOINT_MISMATCH" }));
    expect(domain.inspectLoss(PROJECT, "run-recovery", lossId)).toMatchObject({ state: "open", actionPair: null });
  });

  it("replays exact Commit and rejects a crossed pair", () => {
    const domain = recoveryDomain(new RecoveryProvider());
    const lossId = openLoss(domain);
    preview(domain, lossId);
    const accepted = domain.commitFreshRotation({ projectSessionId: PROJECT, runId: "run-recovery", lossId, pair, attemptId: attemptId(pair) });

    expect(domain.commitFreshRotation({ projectSessionId: PROJECT, runId: "run-recovery", lossId, pair, attemptId: attemptId(pair) })).toBe(accepted);
    expect(() => domain.commitFreshRotation({
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      pair: { ...pair, actionId: "crossed" },
      attemptId: attemptId(pair),
    })).toThrow(expect.objectContaining({ code: "RECOVERY_ACTION_PAIR_MISMATCH" }));
  });

  it("returns a fresh no-effect attempt to open and spends its reserved generations", async () => {
    const provider: LifecycleProviderPort = {
      async dispatchReplacement() { return { status: "closed-no-effect", proofDigest: digest("closed-no-effect") }; },
      async lookupReplacement() { return { status: "ambiguous" }; },
    };
    const domain = recoveryDomain(provider);
    const lossId = openLoss(domain);
    preview(domain, lossId);
    const accepted = domain.commitFreshRotation({ projectSessionId: PROJECT, runId: "run-recovery", lossId, pair, attemptId: attemptId(pair) });

    await expect(domain.driveRotation(PROJECT, "run-recovery", accepted.custodyRef)).resolves.toMatchObject({
      disposition: "no-effect",
      history: ["awaiting-boundary", "prepared", "dispatched", "provider-terminal", "no-effect"],
    });
    expect(domain.inspectLoss(PROJECT, "run-recovery", lossId)).toMatchObject({ state: "open", actionPair: null });
    const second = preview(domain, lossId, { ...pair, actionId: "operator:fresh-rotate:chair:second" });
    expect(second).toMatchObject({
      reservedProviderGeneration: 6,
      reservedPrincipalGeneration: 9,
      reservedBridgeGeneration: 11,
    });
  });

  it.each([
    ["preview", (snapshot: any) => { snapshot.freshRotations = []; }],
    ["commit replay", (snapshot: any) => { snapshot.freshRotationCommitDigests = []; }],
    ["preview and commit replay", (snapshot: any) => {
      snapshot.freshRotations = [];
      snapshot.freshRotationCommitDigests = [];
    }],
  ])("requires the fresh-recovery custody's %s record during hydration", (_label, mutate) => {
    const provider = new RecoveryProvider();
    const domain = recoveryDomain(provider);
    const lossId = openLoss(domain);
    preview(domain, lossId);
    domain.commitFreshRotation({
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      pair,
      attemptId: attemptId(pair),
    });
    const snapshot = structuredClone(domain.snapshot()) as any;
    mutate(snapshot);
    const { snapshotDigest: _ignored, ...preimage } = snapshot;

    expect(() => LifecycleRotationDomain.hydrate(
      { provider, recoveryAuthority: trustedRecoveryAuthority },
      { ...preimage, snapshotDigest: lifecycleDigest(preimage) },
    )).toThrow(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it("replays both fresh-rotation phases after hydration without reopening the loss", () => {
    const provider = new RecoveryProvider();
    const domain = recoveryDomain(provider);
    const lossId = openLoss(domain);
    const preparation = preview(domain, lossId);
    const commitRequest = {
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      pair,
      attemptId: attemptId(pair),
    };
    const acceptance = domain.commitFreshRotation(commitRequest);
    const restored = LifecycleRotationDomain.hydrate(
      { provider, recoveryAuthority: trustedRecoveryAuthority },
      domain.snapshot(),
    );

    expect(restored.prepareFreshRotation({
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      issueId: attemptId(pair),
      capability: `capability:${pair.actionId}`,
      pair,
      adapterContractDigest: digest("replacement-contract"),
      operation: "launch",
      checkpoint: preparation.checkpoint,
      checkpointArtifactRef: preparation.checkpointValidation.checkpointRef,
    })).toEqual(preparation);
    expect(restored.commitFreshRotation(commitRequest)).toEqual(acceptance);
  });

  it("requires destructive authority and derives direct-open archival consequences", () => {
    const domain = recoveryDomain(new RecoveryProvider());
    const lossId = openLoss(domain);
    const plan = domain.previewLossAbandonment(PROJECT, "run-recovery", lossId);

    expect(() => domain.abandonLoss({ projectSessionId: PROJECT, runId: "run-recovery", lossId } as never))
      .toThrow(expect.objectContaining({ code: "RECOVERY_ABANDON_FORBIDDEN" }));
    const authority = abandonAuthority(lossId);
    domain.registerRecoveryIssue(abandonRecoveryIssue(authority, lossId, null));
    const request = {
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      authority,
      expectedArchivalPlanDigest: plan.planDigest,
      expectedSourceCheckpointDigest: plan.sourceCheckpointDigest,
    };
    const first = domain.abandonLoss(request);
    expect(first).toMatchObject({ state: "abandoned", actionPair: null });
    const auditCount = domain.snapshot().audits.length;
    expect(domain.abandonLoss(request)).toEqual(first);
    expect(domain.snapshot().audits).toHaveLength(auditCount);
    expect(domain.inspectAgent(PROJECT, "run-recovery", "chair")).toMatchObject({
      lifecycle: "archived",
      writes: [{ state: "revoked-abandoned" }],
      deliveries: [{ state: "abandoned" }],
      barriers: [{ state: "abandoned-failure" }],
      memberships: [{ state: "abandoned" }],
      sourceCapabilityRevoked: true,
      principalRevoked: true,
      bridgeRevoked: true,
    });
    expect(() => LifecycleRotationDomain.hydrate(
      { provider: new RecoveryProvider(), recoveryAuthority: trustedRecoveryAuthority },
      JSON.parse(JSON.stringify(domain.snapshot())) as ReturnType<typeof domain.snapshot>,
    )).not.toThrow();
  });

  it("attempted-recovery abandon requires the exact action pair and closes its custody", () => {
    const domain = recoveryDomain(new RecoveryProvider());
    const lossId = openLoss(domain);
    preview(domain, lossId);
    const accepted = domain.commitFreshRotation({ projectSessionId: PROJECT, runId: "run-recovery", lossId, pair, attemptId: attemptId(pair) });
    const plan = domain.previewLossAbandonment(PROJECT, "run-recovery", lossId);
    const authority = abandonAuthority(lossId);
    domain.registerRecoveryIssue(abandonRecoveryIssue(authority, lossId, pair));

    expect(() => domain.abandonLoss({
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      actionPair: { ...pair, actionId: "wrong" },
      authority,
      expectedArchivalPlanDigest: plan.planDigest,
      expectedSourceCheckpointDigest: plan.sourceCheckpointDigest,
    })).toThrow(expect.objectContaining({ code: "RECOVERY_ACTION_PAIR_MISMATCH" }));
    expect(domain.abandonLoss({
      projectSessionId: PROJECT,
      runId: "run-recovery",
      lossId,
      actionPair: pair,
      authority,
      expectedArchivalPlanDigest: plan.planDigest,
      expectedSourceCheckpointDigest: plan.sourceCheckpointDigest,
    })).toMatchObject({ state: "abandoned", actionPair: pair });
    expect(domain.inspectCustody(PROJECT, "run-recovery", accepted.custodyRef)).toMatchObject({ disposition: "abandoned" });
  });
});

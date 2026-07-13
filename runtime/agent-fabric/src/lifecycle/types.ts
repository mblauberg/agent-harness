export type AgentRole = "chair" | "child";

export type AgentLifecycleState = "ready" | "suspended" | "recovery-required" | "archived";

export type TurnState = "active" | "terminal" | "quarantined" | "revoked";

export type DeliveryState = "ready" | "claimed" | "provider-accepted" | "consumed" | "expired" | "abandoned";

export type CustodyPhase =
  | "awaiting-boundary"
  | "prepared"
  | "dispatched"
  | "accepted"
  | "ambiguous"
  | "provider-terminal"
  | "committing"
  | "finalized";

export type CustodyDisposition = "adopted" | "no-effect" | "superseded" | "quarantined" | "abandoned";

export type GenerationLossState = "open" | "recovery-in-progress" | "recovered-adopted" | "abandoned";

export type RecoveryCheckpointState = "absent" | "invalid" | "last-validated";

export type LifecycleDigest = `sha256:${string}`;

export interface ProviderContext {
  readonly reference: string;
  readonly providerGeneration: number;
  readonly contextRevision: number;
  readonly evidenceDigest: LifecycleDigest;
  readonly historyDigest: LifecycleDigest;
}

export interface LifecycleAuth {
  readonly principalGeneration: number;
  readonly bridgeGeneration: number;
  readonly providerGeneration: number;
}

export interface LifecycleTurn extends LifecycleAuth {
  readonly turnId: string;
  readonly state: TurnState;
}

export interface LifecycleWriteCustody {
  readonly custodyId: string;
  readonly state: "active" | "quarantined" | "lifecycle-quarantined" | "revoked-abandoned";
}

export interface LifecycleDelivery {
  readonly deliveryId: string;
  readonly sequence: number;
  readonly state: DeliveryState;
  readonly claimGeneration: number | null;
  readonly required: boolean;
}

export interface LifecycleOpenWork {
  readonly obligationId: string;
  readonly kind: "task" | "delivery" | "child" | "write-custody";
  readonly revision: number;
}

export interface LifecycleTaskOwnerLease {
  readonly leaseId: string;
  readonly state: "active" | "abandoned";
}

export interface LifecycleBarrier {
  readonly barrierId: string;
  readonly state: "active" | "abandoned-failure";
}

export interface LifecycleMembership {
  readonly membershipId: string;
  readonly kind: "agent" | "task" | "run";
  readonly state: "active" | "abandoned";
}

export interface LifecycleCheckpoint {
  readonly checkpointDigest: LifecycleDigest;
  readonly taskDigest: LifecycleDigest;
  readonly mailboxDigest: LifecycleDigest;
  readonly childDigest: LifecycleDigest;
  readonly openWorkDigest: LifecycleDigest;
  readonly adoptionDeliveryDigest: LifecycleDigest;
  readonly writeSetDigest: LifecycleDigest;
  readonly sourceBindingDigest: LifecycleDigest;
  readonly sourceHistoryDigest: LifecycleDigest;
}

export interface LifecycleSourceBinding {
  readonly capabilityHash: LifecycleDigest;
  readonly custodyAction: ProviderActionPair;
  readonly adapterContractDigest: LifecycleDigest;
  readonly bridgeRowId: string;
  readonly bridgeRevision: number;
  readonly projectSessionGeneration: number;
  readonly runGeneration: number;
  readonly chairLeaseGeneration: number | null;
}

export interface LifecycleAgentSeed {
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly bridgeOwnerId: string;
  readonly role: AgentRole;
  readonly lifecycle: AgentLifecycleState;
  readonly provider: ProviderContext;
  readonly sourceBinding: LifecycleSourceBinding;
  readonly principalGeneration: number;
  readonly bridgeGeneration: number;
  readonly taskRevision: number;
  readonly mailboxRevision: number;
  readonly childRevision: number;
  readonly writeRevision: number;
  readonly authorityRevision: number;
  readonly recoveryCheckpointState: RecoveryCheckpointState;
  readonly recoveryCheckpointRef: string | null;
  readonly childIds: readonly string[];
  readonly openWork: readonly LifecycleOpenWork[];
  readonly turns: readonly LifecycleTurn[];
  readonly writes: readonly LifecycleWriteCustody[];
  readonly deliveries: readonly LifecycleDelivery[];
  readonly taskOwnerLeases: readonly LifecycleTaskOwnerLease[];
  readonly barriers: readonly LifecycleBarrier[];
  readonly memberships: readonly LifecycleMembership[];
  readonly messageWatermark: number;
  readonly deliveryWatermark: number;
  readonly membershipWatermark: number;
  readonly archivalPlan: LifecycleArchivalPlan | null;
  readonly sourceCapabilityRevoked: boolean;
  readonly principalRevoked: boolean;
  readonly bridgeRevoked: boolean;
}

export interface RotationRequest {
  readonly commandId: string;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly action: "rotate" | "compact";
  readonly auth: LifecycleAuth;
  readonly checkpoint: LifecycleCheckpoint;
  readonly adapterId: string;
  readonly actionId: string;
  readonly adapterContractDigest: LifecycleDigest;
  readonly operation: string;
}

export interface RotationAcceptance {
  readonly commandId: string;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly custodyRef: string;
  readonly agentId: string;
  readonly lifecycle: "suspended";
  readonly phase: "awaiting-boundary" | "prepared";
  readonly providerGeneration: number;
  readonly reservedProviderGeneration: number;
  readonly reservedPrincipalGeneration: number;
  readonly reservedBridgeGeneration: number;
}

export interface LaunchAttestation {
  readonly pair: ProviderActionPair;
  readonly operation: string;
  readonly adapterContractDigest: LifecycleDigest;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly custodyRef: string;
  readonly challenge: LifecycleDigest;
  readonly checkpointDigest: LifecycleDigest;
  readonly taskDigest: LifecycleDigest;
  readonly mailboxDigest: LifecycleDigest;
  readonly childDigest: LifecycleDigest;
  readonly openWorkDigest: LifecycleDigest;
  readonly adoptionDeliveryDigest: LifecycleDigest;
  readonly providerGeneration: number;
  readonly principalGeneration: number;
  readonly bridgeGeneration: number;
}

export interface ReplacementCandidate {
  readonly provider: ProviderContext;
  readonly principalGeneration: number;
  readonly bridgeGeneration: number;
  readonly launchAttestation: LaunchAttestation;
}

export interface ProviderActionPair {
  readonly adapterId: string;
  readonly actionId: string;
}

export interface ReplacementDispatch {
  readonly pair: ProviderActionPair;
  readonly operation: string;
  readonly adapterContractDigest: LifecycleDigest;
  readonly stagedCapabilityHash: LifecycleDigest;
  readonly custodyRef: string;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly sourceProvider: ProviderContext;
  readonly checkpoint: LifecycleCheckpoint;
  readonly launchChallenge: LifecycleDigest;
  readonly reservedProviderGeneration: number;
  readonly reservedPrincipalGeneration: number;
  readonly reservedBridgeGeneration: number;
}

export type ProviderActionObservation =
  | { readonly status: "accepted" }
  | { readonly status: "ambiguous" }
  | { readonly status: "terminal"; readonly candidate: ReplacementCandidate }
  | { readonly status: "closed-no-effect"; readonly proofDigest: LifecycleDigest };

export interface LifecycleProviderPort {
  dispatchReplacement(request: ReplacementDispatch): Promise<ProviderActionObservation>;
  lookupReplacement(pair: ProviderActionPair): Promise<ProviderActionObservation>;
}

export interface ReviewCertificationCut {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly targetGeneration: number;
  readonly predecessorBindingGeneration: number;
  readonly predecessorBindingDigest: LifecycleDigest;
  readonly terminalSequenceHighWater: number;
  readonly lifecycleCustodyRef: LifecycleCustodyRef;
  readonly lifecycleAdoptionEvidenceDigest: LifecycleDigest;
  readonly cutDigest: LifecycleDigest;
}

export interface ReviewCertificationTargetSnapshot {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly targetGeneration: number;
  readonly predecessorBindingGeneration: number;
  readonly predecessorBindingDigest: LifecycleDigest;
  readonly terminalSequenceHighWater: number;
}

export interface LifecycleCustodyRef {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly agentId: string;
  readonly custodyId: string;
  readonly custodyRevision: number;
}

export interface ReviewCertificationIntegrityStaleEvidence {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly lifecycleCustodyRef: LifecycleCustodyRef;
  readonly lifecycleAdoptionEvidenceDigest: LifecycleDigest;
  readonly reason: "target-read-failed" | "target-snapshot-invalid";
  readonly evidenceDigest: LifecycleDigest;
}

export type ReviewAdoptionDecision =
  | { readonly kind: "no-current-target" }
  | {
      readonly kind: "integrity-stale";
      readonly evidence: ReviewCertificationIntegrityStaleEvidence;
    }
  | {
      readonly kind: "rebound";
      readonly cut: ReviewCertificationCut;
      readonly rebindReceiptDigest: LifecycleDigest;
    }
  | {
      readonly kind: "stale";
      readonly cut: ReviewCertificationCut;
      readonly reason: "same-subject-predicate-failed";
    };

export interface ReviewCertificationDecisionPort {
  readCurrentTarget(input: {
    readonly projectSessionId: string;
    readonly runId: string;
    readonly agentId: string;
  }): ReviewCertificationTargetSnapshot | null;
  commitReviewAdoption(input: {
    readonly lifecycleCustodyRef: LifecycleCustodyRef;
    readonly lifecycleAdoptionEvidenceDigest: LifecycleDigest;
    readonly checkpoint: LifecycleCheckpoint;
    readonly commitLifecycleAdoption: (decision: ReviewAdoptionDecision) => boolean;
  }): void;
}

export interface LifecycleFaultPort {
  hit(label: LifecycleFaultLabel, custodyRef: string): void;
}

export type LifecycleFaultLabel =
  | "after-prepare"
  | "after-dispatch-before-effect"
  | "after-provider-effect-before-ack"
  | "after-provider-ack-before-commit"
  | "after-commit-start"
  | "after-adoption-before-finalize";

export interface LifecycleDomainPorts {
  readonly provider: LifecycleProviderPort;
  readonly reviewCertification?: ReviewCertificationDecisionPort;
  readonly fault?: LifecycleFaultPort;
  readonly recoveryAuthority?: LifecycleRecoveryAuthorityPort;
  readonly recoveryCheckpoint?: LifecycleRecoveryCheckpointValidationPort;
  readonly integrityReceipts?: LifecycleIntegrityReceiptAuthorityPort;
}

export interface LifecycleCustodyTerminalReceiptSubject {
  readonly schemaVersion: 1;
  readonly kind: "custody-terminal";
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly custodyRef: string;
  readonly requestDigest: LifecycleDigest;
  readonly pair: ProviderActionPair;
  readonly disposition: CustodyDisposition;
  readonly terminalEvidenceDigest: LifecycleDigest;
  readonly recoveryFromLossId: string | null;
}

export interface LifecycleReviewDecisionReceiptSubject {
  readonly schemaVersion: 1;
  readonly kind: "review-adoption-decision";
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly lifecycleCustodyRef: LifecycleCustodyRef;
  readonly lifecycleAdoptionEvidenceDigest: LifecycleDigest;
  readonly reviewDecisionDigest: LifecycleDigest;
  readonly certificationCutDigest: LifecycleDigest | null;
  readonly recoveryFromLossId: string | null;
  readonly recoveryLossDecisionDigest: LifecycleDigest | null;
}

export type LifecycleIntegrityReceiptSubject =
  | LifecycleCustodyTerminalReceiptSubject
  | LifecycleReviewDecisionReceiptSubject;

export interface LifecycleAuthenticatedReceipt {
  readonly schemaVersion: 1;
  readonly kind: LifecycleIntegrityReceiptSubject["kind"];
  readonly authorityId: string;
  readonly authoritySequence: number;
  readonly previousReceiptDigest: LifecycleDigest | null;
  readonly subjectDigest: LifecycleDigest;
  readonly receiptDigest: LifecycleDigest;
  readonly attestation: string;
}

export interface LifecycleIntegrityReceiptLookup {
  readonly kind: LifecycleIntegrityReceiptSubject["kind"];
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly custodyRef: string;
}

export interface LifecycleIntegrityReceiptRecord {
  readonly subject: LifecycleIntegrityReceiptSubject;
  readonly receipt: LifecycleAuthenticatedReceipt;
}

/**
 * External append-only trust boundary. Append must be idempotent for an exact
 * subject and reject a changed subject for the same lookup key. Read and
 * verification must consult authority state outside the resealable lifecycle
 * snapshot; hydration uses the authoritative read even when mutable custody
 * state claims that no receipt is required.
 */
export interface LifecycleIntegrityReceiptAuthorityPort {
  appendReceipt(subject: LifecycleIntegrityReceiptSubject): LifecycleAuthenticatedReceipt;
  readReceipt(lookup: LifecycleIntegrityReceiptLookup): LifecycleIntegrityReceiptRecord | null;
  verifyReceipt(subject: LifecycleIntegrityReceiptSubject, receipt: LifecycleAuthenticatedReceipt): boolean;
}

export type LifecycleRecoveryIssueStatus = "active" | "consumed" | "revoked" | "expired";

export interface LifecycleRecoveryIssue {
  readonly schemaVersion: 1;
  readonly issueId: string;
  readonly capabilityHash: LifecycleDigest;
  readonly path: "fresh-rotate" | "abandon";
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly sessionGeneration: number;
  readonly recoverySourceRef: string;
  readonly pair: ProviderActionPair | null;
  readonly adapterContractDigest: LifecycleDigest | null;
  readonly operation: string | null;
  readonly checkpointDigest: LifecycleDigest | null;
  readonly consequentialGateId: string;
  readonly consequentialGateDigest: LifecycleDigest;
  readonly directHumanAttestationDigest: LifecycleDigest | null;
  readonly directHumanReasonDigest: LifecycleDigest | null;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly status: LifecycleRecoveryIssueStatus;
  readonly issueAttestation: string;
}

export interface LifecycleRecoveryAuthorityPort {
  nowMs(): number;
  verifyIssue(issue: LifecycleRecoveryIssue): boolean;
  verifyAbandonAuthority(issue: LifecycleRecoveryIssue, authority: LifecycleAbandonAuthority): boolean;
}

export interface LifecycleRecoveryCheckpointValidationPort {
  validate(input: {
    readonly projectSessionId: string;
    readonly runId: string;
    readonly agentId: string;
    readonly lossId: string;
    readonly checkpointState: Exclude<RecoveryCheckpointState, "last-validated">;
    readonly checkpointArtifactRef: string;
    readonly checkpoint: LifecycleCheckpoint;
    readonly issueId: string;
    readonly consequentialGateId: string;
    readonly consequentialGateDigest: LifecycleDigest;
  }): LifecycleRecoveryCheckpointValidationReceipt | null;
}

export interface LifecycleRecoveryCheckpointValidationReceipt {
  readonly schemaVersion: 1;
  readonly checkpointRef: string;
  readonly checkpointDigest: LifecycleDigest;
  readonly validationRevision: number;
  readonly validationEvidenceDigest: LifecycleDigest;
}

export interface LifecycleRecoveryCheckpointBinding extends LifecycleRecoveryCheckpointValidationReceipt {
  readonly issueId: string;
  readonly recoverySourceRef: string;
  readonly consequentialGateId: string;
  readonly consequentialGateDigest: LifecycleDigest;
}

export interface LifecycleAgentView {
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly role: AgentRole;
  readonly lifecycle: AgentLifecycleState;
  readonly provider: ProviderContext;
  readonly sourceBinding: LifecycleSourceBinding;
  readonly principalGeneration: number;
  readonly bridgeGeneration: number;
  readonly recoveryCheckpointState: RecoveryCheckpointState;
  readonly recoveryCheckpointRef: string | null;
  readonly claimsFrozen: boolean;
  readonly turns: readonly LifecycleTurn[];
  readonly writes: readonly LifecycleWriteCustody[];
  readonly deliveries: readonly LifecycleDelivery[];
  readonly taskOwnerLeases: readonly LifecycleTaskOwnerLease[];
  readonly barriers: readonly LifecycleBarrier[];
  readonly memberships: readonly LifecycleMembership[];
  readonly messageWatermark: number;
  readonly deliveryWatermark: number;
  readonly membershipWatermark: number;
  readonly archivalPlan: LifecycleArchivalPlan | null;
  readonly sourceCapabilityRevoked: boolean;
  readonly principalRevoked: boolean;
  readonly bridgeRevoked: boolean;
}

export interface LifecycleCustodyView {
  readonly custodyRef: string;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly commandId: string;
  readonly agentId: string;
  readonly phase: CustodyPhase;
  readonly disposition: CustodyDisposition | null;
  readonly pair: ProviderActionPair;
  readonly providerOperation: string;
  readonly adapterContractDigest: LifecycleDigest;
  readonly stagedCapabilityHash: LifecycleDigest;
  readonly sourceBinding: LifecycleSourceBinding;
  readonly recoveryFromLossId: string | null;
  readonly recoveryAttemptId: string | null;
  readonly admissionKind: "self-request" | "fresh-recovery";
  readonly requestAction: RotationRequest["action"] | null;
  readonly admissionCheckpoint: LifecycleCheckpoint;
  readonly changedWriteCustodyIds: readonly string[];
  readonly callerTurnId: string | null;
  readonly launchChallenge: LifecycleDigest;
  readonly history: readonly string[];
  readonly checkpoint: LifecycleCheckpoint;
  readonly checkpointValidation: LifecycleRecoveryCheckpointBinding | null;
  readonly candidate: ReplacementCandidate | null;
  readonly reviewDecision: ReviewAdoptionDecision | null;
  readonly reviewDecisionReceipt: LifecycleAuthenticatedReceipt | null;
  readonly terminalEvidence: LifecycleCustodyTerminalEvidence | null;
  readonly terminalReceipt: LifecycleAuthenticatedReceipt | null;
}

export interface LifecycleCustodyTerminalEvidence {
  readonly schemaVersion: 1;
  readonly disposition: CustodyDisposition;
  readonly detail: string;
  readonly proofDigest: LifecycleDigest;
  readonly terminalEvidenceDigest: LifecycleDigest;
}

export interface LifecycleCustodyDispositionProof {
  readonly schemaVersion: 1;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly custodyRef: string;
  readonly requestDigest: LifecycleDigest;
  readonly pair: ProviderActionPair;
  readonly sourceCheckpointDigest: LifecycleDigest;
  readonly disposition: "superseded" | "quarantined";
  readonly detail: string;
  readonly evidenceDigest: LifecycleDigest;
  readonly proofRecordDigest: LifecycleDigest;
}

export interface LifecycleHighWaterView {
  readonly providerGeneration: number;
  readonly principalGeneration: number;
  readonly bridgeGeneration: number;
}

export interface ContextObservation {
  readonly sourceEventId: string;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly providerGeneration: number;
  readonly contextRevision: number;
  readonly evidenceDigest: LifecycleDigest;
}

export type ContextObservationClassification =
  | "replay"
  | "reordered-observation"
  | "context-advance"
  | "generation-advance";

export interface ContextObservationResult {
  readonly classification: ContextObservationClassification;
  readonly lossId: string | null;
  readonly audit: LifecycleAuditEvent;
}

export interface GenerationLossView {
  readonly lossId: string;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly cause: "context-advance" | "generation-advance";
  readonly state: GenerationLossState;
  readonly actionPair: ProviderActionPair | null;
  readonly reviewDecision: ReviewAdoptionDecision | null;
  readonly activeRecoveryAttemptId: string | null;
  readonly activeRecoveryCustodyRef: string | null;
  readonly oldProvider: ProviderContext;
  readonly newProvider: ProviderContext;
  readonly sourceBinding: LifecycleSourceBinding;
  readonly sourcePrincipalGeneration: number;
  readonly sourceBridgeGeneration: number;
  readonly sourceBridgeOwnerId: string;
  readonly sourceRole: AgentRole;
  readonly checkpointState: RecoveryCheckpointState;
  readonly checkpointRef: string | null;
  readonly checkpointDigest: LifecycleDigest | null;
  readonly checkpointValidationRevision: number | null;
  readonly checkpointValidationEvidenceDigest: LifecycleDigest | null;
  readonly checkpoint: LifecycleCheckpoint;
  readonly fencedCheckpoint: LifecycleCheckpoint;
  readonly checkpointWriteRevision: number;
  readonly sourceWriteRevision: number;
  readonly sourceAuthorityRevision: number;
  readonly fencedWriteCustodyIds: readonly string[];
  readonly lossEvidenceDigest: LifecycleDigest;
}

export interface LifecycleOperatorAuthority {
  readonly operations: readonly string[];
}

export interface FreshRotationPrepareRequest {
  readonly projectSessionId: string;
  readonly runId: string;
  readonly lossId: string;
  readonly issueId: string;
  readonly capability: string;
  readonly pair: ProviderActionPair;
  readonly adapterContractDigest: LifecycleDigest;
  readonly operation: string;
  readonly checkpoint: LifecycleCheckpoint;
  readonly checkpointArtifactRef: string;
}

export interface FreshRotationPreparation {
  readonly attemptId: string;
  readonly issueId: string;
  readonly issueCapabilityHash: LifecycleDigest;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly lossId: string;
  readonly pair: ProviderActionPair;
  readonly checkpoint: LifecycleCheckpoint;
  readonly checkpointValidation: LifecycleRecoveryCheckpointBinding;
  readonly adapterContractDigest: LifecycleDigest;
  readonly operation: string;
  readonly reservedProviderGeneration: number;
  readonly reservedPrincipalGeneration: number;
  readonly reservedBridgeGeneration: number;
}

export interface FreshRotationCommitRequest {
  readonly projectSessionId: string;
  readonly runId: string;
  readonly lossId: string;
  readonly pair: ProviderActionPair;
  readonly attemptId: string;
}

export interface LifecycleAbandonAuthority {
  readonly operations: readonly ["session.cancel"];
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly sessionGeneration: number;
  readonly authorityDigest: LifecycleDigest;
  readonly consequentialGateId: string;
  readonly consequentialGateDigest: LifecycleDigest;
  readonly consequentialGateRecoverySourceRef: string;
  readonly directHumanConfirmation: {
    readonly reason: string;
    readonly attestationDigest: LifecycleDigest;
  };
}

export interface LifecycleArchivalPlan {
  readonly schemaVersion: 1;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly recoverySourceRef: string;
  readonly turnIds: readonly string[];
  readonly writeCustodyIds: readonly string[];
  readonly deliveryIds: readonly string[];
  readonly obligationIds: readonly string[];
  readonly taskOwnerLeaseIds: readonly string[];
  readonly barrierIds: readonly string[];
  readonly membershipIds: readonly string[];
  readonly messageWatermark: number;
  readonly deliveryWatermark: number;
  readonly membershipWatermark: number;
  readonly parentAgentIds: readonly string[];
  readonly runDisposition: "cancel-failure" | "preserve";
  readonly chairDisposition: "revoked" | "not-chair";
  readonly sourceCheckpointDigest: LifecycleDigest;
  readonly planDigest: LifecycleDigest;
}

export interface LifecycleRecoveryRetirement {
  readonly schemaVersion: 1;
  readonly retirementId: string;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly issueId: string;
  readonly recoverySourceKind: "custody" | "generation-loss";
  readonly recoverySourceRef: string;
  readonly abandonKind: "nonfinal-custody" | "finalized-custody" | "direct-open" | "recovery-attempt";
  readonly actionPair: ProviderActionPair | null;
  readonly oldTerminalDisposition: CustodyDisposition | null;
  readonly abandonReason: string;
  readonly consequenceDigest: LifecycleDigest;
  readonly sourceCheckpointDigest: LifecycleDigest;
  readonly directHumanAttestationDigest: LifecycleDigest;
  readonly requestDigest: LifecycleDigest;
  readonly retirementDigest: LifecycleDigest;
}

export interface AbandonLossRequest {
  readonly projectSessionId: string;
  readonly runId: string;
  readonly lossId: string;
  readonly actionPair?: ProviderActionPair;
  readonly authority: LifecycleAbandonAuthority;
  readonly expectedArchivalPlanDigest: LifecycleDigest;
  readonly expectedSourceCheckpointDigest: LifecycleDigest;
}

export type LifecycleRevisionKind = "task" | "mailbox" | "children" | "write" | "authority";

export interface LifecycleNoEffectProof {
  readonly pair: ProviderActionPair;
  readonly dispatchRecorded: false;
  readonly evidenceDigest: LifecycleDigest;
}

export interface LifecycleCustodyAbandonment {
  readonly projectSessionId: string;
  readonly runId: string;
  readonly custodyRef: string;
  readonly pair: ProviderActionPair;
  readonly authority: LifecycleAbandonAuthority;
  readonly expectedArchivalPlanDigest: LifecycleDigest;
  readonly expectedSourceCheckpointDigest: LifecycleDigest;
}

export interface LifecycleAgentSnapshot extends LifecycleAgentSeed {
  readonly lifecycle: AgentLifecycleState;
  readonly claimsFrozen: boolean;
  readonly archivalPlan: LifecycleArchivalPlan | null;
  readonly recoveryCheckpointDigest: LifecycleDigest | null;
  readonly recoveryCheckpointValidationRevision: number | null;
  readonly recoveryCheckpointValidationEvidenceDigest: LifecycleDigest | null;
}

export interface LifecycleCustodySnapshot {
  readonly custodyRef: string;
  readonly commandId: string;
  readonly requestDigest: string;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly phase: CustodyPhase;
  readonly disposition: CustodyDisposition | null;
  readonly pair: ProviderActionPair;
  readonly providerOperation: string;
  readonly adapterContractDigest: LifecycleDigest;
  readonly stagedCapabilityHash: LifecycleDigest;
  readonly sourceProvider: ProviderContext;
  readonly sourceBinding: LifecycleSourceBinding;
  readonly sourcePrincipalGeneration: number;
  readonly sourceBridgeGeneration: number;
  readonly reservedProviderGeneration: number;
  readonly reservedPrincipalGeneration: number;
  readonly reservedBridgeGeneration: number;
  readonly checkpoint: LifecycleCheckpoint;
  readonly checkpointValidation: LifecycleRecoveryCheckpointBinding | null;
  readonly candidate: ReplacementCandidate | null;
  readonly launchChallenge: LifecycleDigest;
  readonly recoveryFromLossId: string | null;
  readonly recoveryAttemptId: string | null;
  readonly admissionKind: "self-request" | "fresh-recovery";
  readonly requestAction: RotationRequest["action"] | null;
  readonly admissionCheckpoint: LifecycleCheckpoint;
  readonly sourceWriteRevision: number;
  readonly sourceAuthorityRevision: number;
  readonly changedWriteCustodyIds: readonly string[];
  readonly callerTurnId: string | null;
  readonly history: readonly string[];
  readonly acceptance: RotationAcceptance;
  readonly reviewDecision: ReviewAdoptionDecision | null;
  readonly reviewDecisionReceipt: LifecycleAuthenticatedReceipt | null;
  readonly terminalEvidence: LifecycleCustodyTerminalEvidence | null;
  readonly terminalReceipt: LifecycleAuthenticatedReceipt | null;
}

export interface LifecycleGenerationLossSnapshot extends GenerationLossView {}

export interface LifecycleFreshRotationSnapshot extends FreshRotationPreparation {}

export interface LifecycleContextEventSnapshot {
  readonly key: string;
  readonly observation: ContextObservation;
  readonly observationDigest: LifecycleDigest;
  readonly result: ContextObservationResult;
}

export interface LifecycleDomainSnapshotV1 {
  readonly schemaVersion: 1;
  readonly agents: readonly LifecycleAgentSnapshot[];
  readonly custodies: readonly LifecycleCustodySnapshot[];
  readonly commands: readonly { readonly key: string; readonly custodyRef: string }[];
  readonly providerHighWater: readonly { readonly key: string; readonly value: number }[];
  readonly principalHighWater: readonly { readonly key: string; readonly value: number }[];
  readonly bridgeHighWater: readonly { readonly key: string; readonly value: number }[];
  readonly contextEvents: readonly LifecycleContextEventSnapshot[];
  readonly losses: readonly LifecycleGenerationLossSnapshot[];
  readonly audits: readonly LifecycleAuditEvent[];
  readonly freshRotations: readonly LifecycleFreshRotationSnapshot[];
  readonly freshRotationCommitDigests: readonly {
    readonly attemptId: string;
    readonly digest: LifecycleDigest;
    readonly custodyRef: string;
  }[];
  readonly recoveryIssues: readonly LifecycleRecoveryIssue[];
  readonly recoveryRetirements: readonly LifecycleRecoveryRetirement[];
  readonly reviewCertificationCuts: readonly ReviewCertificationCut[];
  readonly custodyDispositionProofs: readonly LifecycleCustodyDispositionProof[];
  readonly snapshotDigest: LifecycleDigest;
}

export interface LifecycleAuditEvent {
  readonly kind: string;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly sourceId: string;
  readonly detail: string;
}

export class LifecycleDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LifecycleDomainError";
    this.code = code;
  }
}

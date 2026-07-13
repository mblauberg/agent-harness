import { canonicalJson, lifecycleDigest } from "./canonical.js";
import {
  LifecycleDomainError,
  type LifecycleAgentSeed,
  type LifecycleAgentSnapshot,
  type LifecycleAgentView,
  type LifecycleArchivalPlan,
  type AbandonLossRequest,
  type LifecycleCheckpoint,
  type LifecycleCustodyRef,
  type LifecycleAuditEvent,
  type LifecycleCustodyAbandonment,
  type LifecycleNoEffectProof,
  type LifecycleRevisionKind,
  type LifecycleRecoveryIssue,
  type LifecycleRecoveryRetirement,
  type LifecycleRecoveryCheckpointBinding,
  type LifecycleRecoveryCheckpointValidationReceipt,
  type LifecycleSourceBinding,
  type ContextObservation,
  type ContextObservationResult,
  type LifecycleCustodyView,
  type LifecycleCustodyTerminalEvidence,
  type LifecycleCustodyDispositionProof,
  type LifecycleDelivery,
  type LifecycleDigest,
  type LifecycleDomainPorts,
  type LifecycleDomainSnapshotV1,
  type LifecycleHighWaterView,
  type GenerationLossView,
  type LifecycleCustodySnapshot,
  type LifecycleFreshRotationSnapshot,
  type LifecycleGenerationLossSnapshot,
  type FreshRotationCommitRequest,
  type FreshRotationPreparation,
  type FreshRotationPrepareRequest,
  type LifecycleOpenWork,
  type LifecycleTurn,
  type LifecycleWriteCustody,
  type ProviderActionPair,
  type ProviderContext,
  type ReplacementCandidate,
  type ReviewAdoptionDecision,
  type ReviewCertificationCut,
  type ReviewCertificationTargetSnapshot,
  type RotationAcceptance,
  type RotationRequest,
} from "./types.js";

interface MutableAgent {
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly bridgeOwnerId: string;
  readonly role: "chair" | "child";
  lifecycle: "ready" | "suspended" | "recovery-required" | "archived";
  provider: LifecycleAgentSeed["provider"];
  sourceBinding: LifecycleSourceBinding;
  principalGeneration: number;
  bridgeGeneration: number;
  taskRevision: number;
  mailboxRevision: number;
  childRevision: number;
  writeRevision: number;
  authorityRevision: number;
  recoveryCheckpointState: LifecycleAgentSeed["recoveryCheckpointState"];
  recoveryCheckpointRef: string | null;
  recoveryCheckpointDigest: LifecycleDigest | null;
  recoveryCheckpointValidationRevision: number | null;
  recoveryCheckpointValidationEvidenceDigest: LifecycleDigest | null;
  childIds: string[];
  openWork: LifecycleOpenWork[];
  turns: LifecycleTurn[];
  writes: LifecycleWriteCustody[];
  deliveries: LifecycleDelivery[];
  taskOwnerLeases: LifecycleAgentSeed["taskOwnerLeases"][number][];
  barriers: LifecycleAgentSeed["barriers"][number][];
  memberships: LifecycleAgentSeed["memberships"][number][];
  messageWatermark: number;
  deliveryWatermark: number;
  membershipWatermark: number;
  archivalPlan: LifecycleArchivalPlan | null;
  sourceCapabilityRevoked: boolean;
  principalRevoked: boolean;
  bridgeRevoked: boolean;
  claimsFrozen: boolean;
}

interface MutableCustody {
  readonly custodyRef: string;
  readonly commandId: string;
  readonly requestDigest: string;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  phase: LifecycleCustodyView["phase"];
  disposition: LifecycleCustodyView["disposition"];
  readonly pair: ProviderActionPair;
  readonly providerOperation: string;
  readonly adapterContractDigest: LifecycleDigest;
  readonly stagedCapabilityHash: LifecycleDigest;
  readonly sourceProvider: LifecycleAgentSeed["provider"];
  readonly sourceBinding: LifecycleSourceBinding;
  readonly sourcePrincipalGeneration: number;
  readonly sourceBridgeGeneration: number;
  readonly reservedProviderGeneration: number;
  readonly reservedPrincipalGeneration: number;
  readonly reservedBridgeGeneration: number;
  readonly checkpoint: LifecycleCheckpoint;
  readonly checkpointValidation: LifecycleRecoveryCheckpointBinding | null;
  candidate: ReplacementCandidate | null;
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
  readonly history: string[];
  readonly acceptance: RotationAcceptance;
  reviewDecision: ReviewAdoptionDecision | null;
  terminalEvidence: LifecycleCustodyTerminalEvidence | null;
}

interface MutableLoss {
  readonly lossId: string;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly cause: GenerationLossView["cause"];
  state: GenerationLossView["state"];
  actionPair: ProviderActionPair | null;
  reviewDecision: ReviewAdoptionDecision | null;
  activeRecoveryAttemptId: string | null;
  activeRecoveryCustodyRef: string | null;
  readonly oldProvider: ProviderContext;
  readonly newProvider: ProviderContext;
  readonly sourceBinding: LifecycleSourceBinding;
  readonly sourcePrincipalGeneration: number;
  readonly sourceBridgeGeneration: number;
  readonly sourceBridgeOwnerId: string;
  readonly sourceRole: LifecycleAgentSeed["role"];
  readonly checkpointState: GenerationLossView["checkpointState"];
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

interface MutableFreshRotation extends FreshRotationPreparation {
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
}

interface MutableRecoveryIssue extends Omit<LifecycleRecoveryIssue, "status"> {
  status: LifecycleRecoveryIssue["status"];
}

interface FreshCommitRecord {
  readonly attemptId: string;
  readonly digest: LifecycleDigest;
  readonly custodyRef: string;
}

interface MutableContextEvent {
  readonly observation: ContextObservation;
  readonly observationDigest: LifecycleDigest;
  readonly result: ContextObservationResult;
}

function positiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new LifecycleDomainError("INVALID_GENERATION", `${field} must be a positive safe integer`);
  }
}

function nonnegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new LifecycleDomainError("INVALID_REVISION", `${field} must be a nonnegative safe integer`);
  }
}

function validDigest(value: string): boolean {
  return /^sha256:[0-9a-f]{64}$/u.test(value);
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
}

function validActionPair(value: unknown): value is ProviderActionPair {
  return hasExactKeys(value, ["adapterId", "actionId"]) &&
    typeof value.adapterId === "string" && value.adapterId.length > 0 && value.adapterId.length <= 256 &&
    typeof value.actionId === "string" && value.actionId.length > 0 && value.actionId.length <= 256;
}

function validProviderContext(value: unknown): value is LifecycleAgentSeed["provider"] {
  if (!hasExactKeys(value, ["reference", "providerGeneration", "contextRevision", "evidenceDigest", "historyDigest"])) return false;
  return typeof value.reference === "string" && value.reference.length > 0 &&
    Number.isSafeInteger(value.providerGeneration) && (value.providerGeneration as number) >= 1 &&
    Number.isSafeInteger(value.contextRevision) && (value.contextRevision as number) >= 0 &&
    validDigest(value.evidenceDigest as LifecycleDigest) && validDigest(value.historyDigest as LifecycleDigest);
}

function validSourceBinding(value: unknown): value is LifecycleSourceBinding {
  if (!hasExactKeys(value, [
    "capabilityHash", "custodyAction", "adapterContractDigest", "bridgeRowId", "bridgeRevision",
    "projectSessionGeneration", "runGeneration", "chairLeaseGeneration",
  ])) return false;
  return validActionPair(value.custodyAction) && validDigest(value.capabilityHash as LifecycleDigest) &&
    validDigest(value.adapterContractDigest as LifecycleDigest) && typeof value.bridgeRowId === "string" &&
    value.bridgeRowId.length > 0 && Number.isSafeInteger(value.bridgeRevision) && (value.bridgeRevision as number) >= 1 &&
    Number.isSafeInteger(value.projectSessionGeneration) && (value.projectSessionGeneration as number) >= 1 &&
    Number.isSafeInteger(value.runGeneration) && (value.runGeneration as number) >= 1 &&
    (value.chairLeaseGeneration === null || (Number.isSafeInteger(value.chairLeaseGeneration) && (value.chairLeaseGeneration as number) >= 1));
}

function validCheckpointShape(value: unknown): value is LifecycleCheckpoint {
  if (!hasExactKeys(value, [
    "checkpointDigest", "taskDigest", "mailboxDigest", "childDigest", "openWorkDigest",
    "adoptionDeliveryDigest", "writeSetDigest", "sourceBindingDigest", "sourceHistoryDigest",
  ])) return false;
  return Object.values(value).every((item) => validDigest(item as LifecycleDigest));
}

const RECOVERY_ISSUE_KEYS = [
  "schemaVersion", "issueId", "capabilityHash", "path", "projectSessionId", "runId", "agentId",
  "sessionGeneration", "recoverySourceRef", "pair", "adapterContractDigest", "operation",
  "checkpointDigest", "consequentialGateId", "consequentialGateDigest",
  "directHumanAttestationDigest", "directHumanReasonDigest", "issuedAtMs", "expiresAtMs", "status",
  "issueAttestation",
] as const;

function validRecoveryIssueShape(value: unknown): value is LifecycleRecoveryIssue {
  if (!hasExactKeys(value, RECOVERY_ISSUE_KEYS)) return false;
  const issue = value as unknown as LifecycleRecoveryIssue;
  const pathShape = issue.path === "fresh-rotate"
    ? issue.pair !== null && issue.adapterContractDigest !== null && issue.operation !== null && issue.checkpointDigest !== null &&
      issue.directHumanAttestationDigest === null && issue.directHumanReasonDigest === null
    : issue.operation === "session.cancel" && issue.adapterContractDigest === null && issue.checkpointDigest === null &&
      issue.directHumanAttestationDigest !== null && issue.directHumanReasonDigest !== null;
  return issue.schemaVersion === 1 && issue.issueId.length > 0 && validDigest(issue.capabilityHash) &&
    (issue.path === "fresh-rotate" || issue.path === "abandon") && issue.projectSessionId.length > 0 &&
    issue.runId.length > 0 && issue.agentId.length > 0 && Number.isSafeInteger(issue.sessionGeneration) &&
    issue.sessionGeneration >= 1 && issue.recoverySourceRef.length > 0 &&
    (issue.pair === null || validActionPair(issue.pair)) &&
    (issue.adapterContractDigest === null || validDigest(issue.adapterContractDigest)) &&
    (issue.operation === null || issue.operation.length > 0) &&
    (issue.checkpointDigest === null || validDigest(issue.checkpointDigest)) && issue.consequentialGateId.length > 0 &&
    validDigest(issue.consequentialGateDigest) &&
    (issue.directHumanAttestationDigest === null || validDigest(issue.directHumanAttestationDigest)) &&
    (issue.directHumanReasonDigest === null || validDigest(issue.directHumanReasonDigest)) &&
    Number.isSafeInteger(issue.issuedAtMs) && Number.isSafeInteger(issue.expiresAtMs) &&
    issue.expiresAtMs > issue.issuedAtMs && ["active", "consumed", "revoked", "expired"].includes(issue.status) &&
    issue.issueAttestation.length > 0 && pathShape;
}

function validCustodyHistory(history: readonly string[], phase: MutableCustody["phase"], disposition: MutableCustody["disposition"]): boolean {
  if (history.length === 0 || history[0] !== "awaiting-boundary") return false;
  const transitions: Readonly<Record<string, readonly string[]>> = {
    "awaiting-boundary": ["prepared", "no-effect", "abandoned"],
    prepared: ["dispatched", "superseded", "no-effect", "abandoned"],
    dispatched: ["accepted", "ambiguous", "provider-terminal", "quarantined", "abandoned"],
    accepted: ["ambiguous", "provider-terminal", "quarantined", "abandoned"],
    ambiguous: ["provider-terminal", "quarantined", "abandoned"],
    "provider-terminal": ["committing", "no-effect", "quarantined", "abandoned"],
    committing: ["adopted", "superseded", "quarantined", "abandoned"],
    adopted: [],
    "no-effect": [],
    superseded: [],
    quarantined: [],
    abandoned: [],
  };
  for (let index = 1; index < history.length; index += 1) {
    const prior = history[index - 1] as string;
    const next = history[index] as string;
    if (!(transitions[prior] ?? []).includes(next)) return false;
  }
  return history.at(-1) === (phase === "finalized" ? disposition : phase);
}

function terminalEvidenceFor(
  custody: MutableCustody,
  disposition: NonNullable<MutableCustody["disposition"]>,
  detail: string,
  proofDigest: LifecycleDigest,
): LifecycleCustodyTerminalEvidence {
  const preimage = {
    schemaVersion: 1 as const,
    custodyRef: custody.custodyRef,
    requestDigest: custody.requestDigest,
    pair: custody.pair,
    disposition,
    detail,
    proofDigest,
    history: custody.history,
  };
  return Object.freeze({
    schemaVersion: 1,
    disposition,
    detail,
    proofDigest,
    terminalEvidenceDigest: lifecycleDigest(preimage),
  });
}

function dispositionProofFor(
  custody: MutableCustody,
  disposition: LifecycleCustodyDispositionProof["disposition"],
  detail: string,
  evidenceDigest: LifecycleDigest,
): LifecycleCustodyDispositionProof {
  const preimage = {
    schemaVersion: 1 as const,
    projectSessionId: custody.projectSessionId,
    runId: custody.runId,
    agentId: custody.agentId,
    custodyRef: custody.custodyRef,
    requestDigest: custody.requestDigest as LifecycleDigest,
    pair: custody.pair,
    sourceCheckpointDigest: custody.checkpoint.checkpointDigest,
    disposition,
    detail,
    evidenceDigest,
  };
  return Object.freeze({ ...preimage, proofRecordDigest: lifecycleDigest(preimage) });
}

function validTerminalEvidence(custody: MutableCustody): boolean {
  const evidence = custody.terminalEvidence;
  if (custody.phase !== "finalized" || custody.disposition === null) return evidence === null;
  if (evidence === null || !hasExactKeys(evidence, [
    "schemaVersion", "disposition", "detail", "proofDigest", "terminalEvidenceDigest",
  ]) || evidence.schemaVersion !== 1 || evidence.disposition !== custody.disposition || evidence.detail.length === 0 ||
    !validDigest(evidence.proofDigest) || !validDigest(evidence.terminalEvidenceDigest)) return false;
  return evidence.terminalEvidenceDigest === lifecycleDigest({
    schemaVersion: 1,
    custodyRef: custody.custodyRef,
    requestDigest: custody.requestDigest,
    pair: custody.pair,
    disposition: custody.disposition,
    detail: evidence.detail,
    proofDigest: evidence.proofDigest,
    history: custody.history,
  });
}

function hasTerminalCustodyEvidence(
  custody: MutableCustody,
  audits: readonly LifecycleAuditEvent[],
  losses: ReadonlyMap<string, MutableLoss>,
): boolean {
  if (!validTerminalEvidence(custody)) return false;
  if (custody.phase !== "finalized" || custody.disposition === null || custody.terminalEvidence === null) return true;
  const finalizedDetails: Readonly<Record<Exclude<NonNullable<MutableCustody["disposition"]>, "abandoned">, readonly string[]>> = {
    adopted: ["replacement-adopted"],
    "no-effect": ["pre-dispatch-zero-effect", "authenticated-provider-closed-no-effect"],
    superseded: ["source-drift-before-dispatch", "source-drift-before-commit", "source-cas-lost"],
    quarantined: [
      "provider-observation-invalid",
      "provider-no-effect-proof-invalid",
      "replacement-attestation-invalid",
    ],
  };
  const correlatedAudit = (event: LifecycleAuditEvent, kind: string): boolean =>
    event.kind === kind &&
    event.projectSessionId === custody.projectSessionId &&
    event.runId === custody.runId &&
    event.agentId === custody.agentId &&
    event.sourceId === custody.custodyRef;
  if (custody.disposition !== "abandoned") {
    const allowed = finalizedDetails[custody.disposition];
    const evidence = audits.filter((event) => correlatedAudit(event, "lifecycle-custody-finalized"));
    if (evidence.length !== 1 || !allowed.includes(evidence[0]?.detail ?? "") ||
      evidence[0]?.detail !== custody.terminalEvidence.detail) return false;
    if (custody.disposition === "adopted") {
      return custody.candidate !== null &&
        custody.terminalEvidence.proofDigest === lifecycleDigest(custody.candidate.launchAttestation);
    }
    if (custody.disposition !== "no-effect") return true;
    const proofKind = custody.terminalEvidence.detail === "pre-dispatch-zero-effect"
      ? "lifecycle-no-effect"
      : "lifecycle-provider-no-effect";
    const proofEvidence = audits.filter((event) => correlatedAudit(event, proofKind));
    return proofEvidence.length === 1 && proofEvidence[0]?.detail === custody.terminalEvidence.proofDigest;
  }
  const directEvidence = audits.filter((event) => correlatedAudit(event, "lifecycle-custody-abandoned"));
  if (directEvidence.length === 1) return directEvidence[0]?.detail === custody.terminalEvidence.detail;
  if (directEvidence.length > 1) return false;
  if (custody.recoveryFromLossId === null) return false;
  const loss = losses.get(custody.recoveryFromLossId);
  return loss?.state === "abandoned" && canonicalJson(loss.actionPair) === canonicalJson(custody.pair) &&
    audits.filter((event) => event.kind === "generation-loss-abandoned" && event.sourceId === loss.lossId &&
      event.detail === custody.terminalEvidence?.detail).length === 1;
}

function terminalTurn(turn: LifecycleTurn): boolean {
  return turn.state === "terminal" || turn.state === "revoked";
}

function uniqueNonempty(values: readonly string[]): boolean {
  return values.every((value) => typeof value === "string" && value.length > 0) && new Set(values).size === values.length;
}

function cloneProvider(provider: LifecycleAgentSeed["provider"]): LifecycleAgentSeed["provider"] {
  return { ...provider };
}

function cloneSourceBinding(binding: LifecycleSourceBinding): LifecycleSourceBinding {
  return { ...binding, custodyAction: { ...binding.custodyAction } };
}

function cloneAgent(
  seed: LifecycleAgentSeed,
  persistedCheckpoint?: Pick<LifecycleAgentSnapshot,
    "recoveryCheckpointDigest" | "recoveryCheckpointValidationRevision" |
    "recoveryCheckpointValidationEvidenceDigest">,
): MutableAgent {
  positiveInteger(seed.provider.providerGeneration, "provider.providerGeneration");
  positiveInteger(seed.principalGeneration, "principalGeneration");
  positiveInteger(seed.bridgeGeneration, "bridgeGeneration");
  nonnegativeInteger(seed.provider.contextRevision, "provider.contextRevision");
  nonnegativeInteger(seed.taskRevision, "taskRevision");
  nonnegativeInteger(seed.mailboxRevision, "mailboxRevision");
  nonnegativeInteger(seed.childRevision, "childRevision");
  nonnegativeInteger(seed.writeRevision, "writeRevision");
  nonnegativeInteger(seed.authorityRevision, "authorityRevision");
  nonnegativeInteger(seed.messageWatermark, "messageWatermark");
  nonnegativeInteger(seed.deliveryWatermark, "deliveryWatermark");
  nonnegativeInteger(seed.membershipWatermark, "membershipWatermark");
  if (!["absent", "invalid", "last-validated"].includes(seed.recoveryCheckpointState) ||
    (seed.recoveryCheckpointState === "last-validated") !==
      (typeof seed.recoveryCheckpointRef === "string" && seed.recoveryCheckpointRef.length > 0)) {
    throw new LifecycleDomainError(
      "INVALID_RECOVERY_CHECKPOINT",
      "last-validated recovery checkpoint requires one nonempty reference; absent/invalid require null",
    );
  }
  if (!validProviderContext(seed.provider)) {
    throw new LifecycleDomainError("INVALID_PROVIDER_CONTEXT", "provider evidence and history require SHA-256 digests");
  }
  if (
    !validSourceBinding(seed.sourceBinding)
  ) {
    throw new LifecycleDomainError("INVALID_SOURCE_BINDING", "source capability, action, contract and bridge identity must be exact");
  }
  positiveInteger(seed.sourceBinding.bridgeRevision, "sourceBinding.bridgeRevision");
  positiveInteger(seed.sourceBinding.projectSessionGeneration, "sourceBinding.projectSessionGeneration");
  positiveInteger(seed.sourceBinding.runGeneration, "sourceBinding.runGeneration");
  if (seed.role === "chair") positiveInteger(seed.sourceBinding.chairLeaseGeneration ?? 0, "sourceBinding.chairLeaseGeneration");
  if (seed.role === "child" && seed.sourceBinding.chairLeaseGeneration !== null) {
    throw new LifecycleDomainError("INVALID_SOURCE_BINDING", "child source binding cannot carry chair lease generation");
  }
  if (
    !uniqueNonempty(seed.childIds) || !uniqueNonempty(seed.openWork.map((item) => item.obligationId)) ||
    !uniqueNonempty(seed.turns.map((turn) => turn.turnId)) || !uniqueNonempty(seed.writes.map((write) => write.custodyId)) ||
    !uniqueNonempty(seed.deliveries.map((delivery) => delivery.deliveryId)) ||
    !uniqueNonempty(seed.taskOwnerLeases.map((lease) => lease.leaseId)) ||
    !uniqueNonempty(seed.barriers.map((barrier) => barrier.barrierId)) ||
    !uniqueNonempty(seed.memberships.map((membership) => membership.membershipId)) ||
    new Set(seed.deliveries.map((delivery) => delivery.sequence)).size !== seed.deliveries.length
  ) throw new LifecycleDomainError("INVALID_AGENT_STATE", "lifecycle owner identities and delivery sequences must be unique");
  const agent: MutableAgent = {
    ...seed,
    lifecycle: seed.lifecycle,
    provider: cloneProvider(seed.provider),
    sourceBinding: cloneSourceBinding(seed.sourceBinding),
    childIds: [...seed.childIds],
    openWork: seed.openWork.map((item) => ({ ...item })),
    turns: seed.turns.map((turn) => ({ ...turn })),
    writes: seed.writes.map((write) => ({ ...write })),
    deliveries: seed.deliveries.map((delivery) => ({ ...delivery })),
    taskOwnerLeases: seed.taskOwnerLeases.map((lease) => ({ ...lease })),
    barriers: seed.barriers.map((barrier) => ({ ...barrier })),
    memberships: seed.memberships.map((membership) => ({ ...membership })),
    archivalPlan: seed.archivalPlan === null
      ? null
      : structuredClone(seed.archivalPlan),
    sourceCapabilityRevoked: seed.sourceCapabilityRevoked,
    principalRevoked: seed.principalRevoked,
    bridgeRevoked: seed.bridgeRevoked,
    claimsFrozen: false,
    recoveryCheckpointDigest: null,
    recoveryCheckpointValidationRevision: null,
    recoveryCheckpointValidationEvidenceDigest: null,
  };
  if (seed.recoveryCheckpointState === "last-validated") {
    const checkpointDigest = persistedCheckpoint?.recoveryCheckpointDigest ?? checkpointFor(agent).checkpointDigest;
    const validationRevision = persistedCheckpoint?.recoveryCheckpointValidationRevision ?? 1;
    const validationEvidenceDigest = persistedCheckpoint?.recoveryCheckpointValidationEvidenceDigest ?? lifecycleDigest({
      checkpointRef: seed.recoveryCheckpointRef,
      checkpointDigest,
      validationRevision,
    });
    agent.recoveryCheckpointDigest = checkpointDigest;
    agent.recoveryCheckpointValidationRevision = validationRevision;
    agent.recoveryCheckpointValidationEvidenceDigest = validationEvidenceDigest;
  }
  return agent;
}

function checkpointFor(agent: MutableAgent): LifecycleCheckpoint {
  const taskDigest = lifecycleDigest({ taskRevision: agent.taskRevision });
  const mailboxDigest = lifecycleDigest({
    mailboxRevision: agent.mailboxRevision,
    deliveries: [...agent.deliveries]
      .filter((delivery) => delivery.state !== "ready")
      .sort((left, right) => left.sequence - right.sequence || left.deliveryId.localeCompare(right.deliveryId))
      .map(({ deliveryId, sequence, state, claimGeneration, required }) => ({
        deliveryId,
        sequence,
        state,
        claimGeneration,
        required,
      })),
  });
  const childDigest = lifecycleDigest({
    childRevision: agent.childRevision,
    childIds: [...agent.childIds].sort(),
  });
  const deliveryObligations = agent.deliveries
    .filter((delivery) => delivery.required && (delivery.state === "claimed" || delivery.state === "provider-accepted"))
    .map((delivery): LifecycleOpenWork => ({
      obligationId: delivery.deliveryId,
      kind: "delivery",
      revision: delivery.claimGeneration ?? 0,
    }));
  const openWork = [...agent.openWork, ...deliveryObligations]
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.obligationId.localeCompare(right.obligationId));
  const openWorkDigest = lifecycleDigest({ openWork });
  const adoptionDeliveryDigest = lifecycleDigest({
    deliveries: agent.deliveries
      .filter((delivery) => delivery.state === "claimed" || delivery.state === "provider-accepted")
      .sort((left, right) => left.sequence - right.sequence || left.deliveryId.localeCompare(right.deliveryId))
      .map(({ deliveryId, sequence, state, claimGeneration }) => ({ deliveryId, sequence, state, claimGeneration })),
  });
  const writeSetDigest = lifecycleDigest({
    writeRevision: agent.writeRevision,
    writes: [...agent.writes]
      .sort((left, right) => left.custodyId.localeCompare(right.custodyId))
      .map(({ custodyId, state }) => ({ custodyId, state })),
  });
  const sourceBindingDigest = lifecycleDigest({
    provider: agent.provider,
    principalGeneration: agent.principalGeneration,
    bridgeGeneration: agent.bridgeGeneration,
    sourceBinding: agent.sourceBinding,
  });
  const vector = {
    taskDigest,
    mailboxDigest,
    childDigest,
    openWorkDigest,
    adoptionDeliveryDigest,
    writeSetDigest,
    sourceBindingDigest,
    sourceHistoryDigest: agent.provider.historyDigest,
    sourceProvider: agent.provider,
    writeRevision: agent.writeRevision,
    authorityRevision: agent.authorityRevision,
  };
  return {
    checkpointDigest: lifecycleDigest(vector),
    taskDigest,
    mailboxDigest,
    childDigest,
    openWorkDigest,
    adoptionDeliveryDigest,
    writeSetDigest,
    sourceBindingDigest,
    sourceHistoryDigest: agent.provider.historyDigest,
  };
}

function exactCheckpoint(left: LifecycleCheckpoint, right: LifecycleCheckpoint): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function agentKey(projectSessionId: string, runId: string, agentId: string): string {
  return `${projectSessionId}\u0000${runId}\u0000${agentId}`;
}

function bridgeKey(projectSessionId: string, runId: string, bridgeOwnerId: string): string {
  return `${projectSessionId}\u0000${runId}\u0000${bridgeOwnerId}`;
}

function actionKey(pair: ProviderActionPair): string {
  return `${pair.adapterId}\u0000${pair.actionId}`;
}

function retirementKey(kind: LifecycleRecoveryRetirement["recoverySourceKind"], sourceRef: string): string {
  return `${kind}\u0000${sourceRef}`;
}

function retirementWithDigest(
  record: Omit<LifecycleRecoveryRetirement, "retirementDigest">,
): LifecycleRecoveryRetirement {
  return Object.freeze({ ...record, retirementDigest: lifecycleDigest(record) });
}

export class LifecycleRotationDomain {
  readonly #ports: LifecycleDomainPorts;
  readonly #agents = new Map<string, MutableAgent>();
  readonly #custodies = new Map<string, MutableCustody>();
  readonly #commands = new Map<string, string>();
  readonly #providerHighWater = new Map<string, number>();
  readonly #principalHighWater = new Map<string, number>();
  readonly #bridgeHighWater = new Map<string, number>();
  readonly #contextEvents = new Map<string, MutableContextEvent>();
  readonly #actionOwners = new Map<string, string>();
  readonly #losses = new Map<string, MutableLoss>();
  readonly #audits: LifecycleAuditEvent[] = [];
  readonly #freshRotations = new Map<string, MutableFreshRotation>();
  readonly #freshRotationCommitDigests = new Map<string, FreshCommitRecord>();
  readonly #recoveryIssues = new Map<string, MutableRecoveryIssue>();
  readonly #recoveryRetirements = new Map<string, LifecycleRecoveryRetirement>();
  readonly #reviewCertificationCuts = new Map<string, ReviewCertificationCut>();
  readonly #custodyDispositionProofs = new Map<string, LifecycleCustodyDispositionProof>();

  constructor(
    ports: LifecycleDomainPorts,
    agents: readonly LifecycleAgentSeed[],
    recoveryIssues: readonly LifecycleRecoveryIssue[] = [],
  ) {
    this.#ports = ports;
    for (const seed of agents) {
      const key = agentKey(seed.projectSessionId, seed.runId, seed.agentId);
      if (this.#agents.has(key)) throw new LifecycleDomainError("AGENT_CONFLICT", `duplicate agent ${seed.agentId}`);
      const agent = cloneAgent(seed);
      this.#agents.set(key, agent);
      const sourceActionKey = actionKey(agent.sourceBinding.custodyAction);
      if (this.#actionOwners.has(sourceActionKey)) {
        throw new LifecycleDomainError("ACTION_PAIR_CONFLICT", "source provider action pair is not daemon-global unique");
      }
      this.#actionOwners.set(sourceActionKey, `source:${key}`);
      this.#providerHighWater.set(key, Math.max(this.#providerHighWater.get(key) ?? 0, seed.provider.providerGeneration));
      this.#principalHighWater.set(key, Math.max(this.#principalHighWater.get(key) ?? 0, seed.principalGeneration));
      this.#bridgeHighWater.set(
        bridgeKey(seed.projectSessionId, seed.runId, seed.bridgeOwnerId),
        Math.max(this.#bridgeHighWater.get(bridgeKey(seed.projectSessionId, seed.runId, seed.bridgeOwnerId)) ?? 0, seed.bridgeGeneration),
      );
    }
    for (const source of recoveryIssues) {
      if (!validRecoveryIssueShape(source)) {
        throw new LifecycleDomainError("RECOVERY_ISSUE_INVALID", "recovery issue must match the closed v1 schema");
      }
      if (!this.#agents.has(agentKey(source.projectSessionId, source.runId, source.agentId))) {
        throw new LifecycleDomainError("RECOVERY_ISSUE_INVALID", "recovery issue references a missing agent");
      }
      this.#setUnique(this.#recoveryIssues, source.issueId, structuredClone(source));
    }
  }

  static hydrate(ports: LifecycleDomainPorts, snapshot: LifecycleDomainSnapshotV1): LifecycleRotationDomain {
    const rootKeys = [
      "schemaVersion", "agents", "custodies", "commands", "providerHighWater", "principalHighWater",
      "bridgeHighWater", "contextEvents", "losses", "audits", "freshRotations",
      "freshRotationCommitDigests", "recoveryIssues", "recoveryRetirements", "reviewCertificationCuts",
      "custodyDispositionProofs", "snapshotDigest",
    ];
    if (!hasExactKeys(snapshot, rootKeys) || snapshot.schemaVersion !== 1) {
      throw new LifecycleDomainError("SNAPSHOT_INVALID", "lifecycle snapshot root must match the exact v1 schema");
    }
    const { snapshotDigest, ...preimage } = snapshot;
    if (!validDigest(snapshotDigest) || snapshotDigest !== lifecycleDigest(preimage)) {
      throw new LifecycleDomainError("SNAPSHOT_INVALID", "lifecycle snapshot digest does not seal its complete payload");
    }
    if (![snapshot.agents, snapshot.custodies, snapshot.commands, snapshot.providerHighWater,
      snapshot.principalHighWater, snapshot.bridgeHighWater, snapshot.contextEvents, snapshot.losses,
      snapshot.audits, snapshot.freshRotations, snapshot.freshRotationCommitDigests, snapshot.recoveryIssues,
      snapshot.recoveryRetirements, snapshot.reviewCertificationCuts, snapshot.custodyDispositionProofs].every(Array.isArray)) {
      throw new LifecycleDomainError("SNAPSHOT_INVALID", "lifecycle snapshot collections must be arrays");
    }
    const domain = new LifecycleRotationDomain(ports, []);
    for (const source of snapshot.agents) {
      if (!hasExactKeys(source, [
        "projectSessionId", "runId", "agentId", "bridgeOwnerId", "role", "lifecycle", "provider", "sourceBinding",
        "principalGeneration", "bridgeGeneration", "taskRevision", "mailboxRevision", "childRevision",
        "writeRevision", "authorityRevision", "recoveryCheckpointState", "recoveryCheckpointRef",
        "recoveryCheckpointDigest", "recoveryCheckpointValidationRevision",
        "recoveryCheckpointValidationEvidenceDigest",
        "childIds", "openWork", "turns", "writes", "deliveries",
        "taskOwnerLeases", "barriers", "memberships", "messageWatermark", "deliveryWatermark",
        "membershipWatermark", "archivalPlan", "claimsFrozen",
        "sourceCapabilityRevoked", "principalRevoked", "bridgeRevoked",
      ])) throw new LifecycleDomainError("SNAPSHOT_INVALID", "lifecycle agent snapshot is not closed");
      if (
        source.projectSessionId.length === 0 || source.runId.length === 0 || source.agentId.length === 0 ||
        (source.role !== "chair" && source.role !== "child") ||
        !["ready", "suspended", "recovery-required", "archived"].includes(source.lifecycle) ||
        typeof source.claimsFrozen !== "boolean" || source.claimsFrozen !== (source.lifecycle !== "ready") ||
        typeof source.sourceCapabilityRevoked !== "boolean" || typeof source.principalRevoked !== "boolean" ||
        typeof source.bridgeRevoked !== "boolean" ||
        !["absent", "invalid", "last-validated"].includes(source.recoveryCheckpointState) ||
        (source.recoveryCheckpointState === "last-validated"
          ? typeof source.recoveryCheckpointRef !== "string" || source.recoveryCheckpointRef.length === 0 ||
            !validDigest(source.recoveryCheckpointDigest as LifecycleDigest) ||
            !Number.isSafeInteger(source.recoveryCheckpointValidationRevision) ||
            (source.recoveryCheckpointValidationRevision ?? 0) < 1 ||
            !validDigest(source.recoveryCheckpointValidationEvidenceDigest as LifecycleDigest)
          : source.recoveryCheckpointRef !== null || source.recoveryCheckpointDigest !== null ||
            source.recoveryCheckpointValidationRevision !== null ||
            source.recoveryCheckpointValidationEvidenceDigest !== null) ||
        !validProviderContext(source.provider) || !validSourceBinding(source.sourceBinding) ||
        !source.turns.every((turn) => hasExactKeys(turn, ["turnId", "state", "providerGeneration", "principalGeneration", "bridgeGeneration"]) &&
          ["active", "terminal", "quarantined", "revoked"].includes(turn.state) && Number.isSafeInteger(turn.providerGeneration) &&
          Number.isSafeInteger(turn.principalGeneration) && Number.isSafeInteger(turn.bridgeGeneration)) ||
        !source.writes.every((write) => hasExactKeys(write, ["custodyId", "state"]) &&
          ["active", "quarantined", "lifecycle-quarantined", "revoked-abandoned"].includes(write.state)) ||
        !source.deliveries.every((delivery) => hasExactKeys(delivery, ["deliveryId", "sequence", "state", "claimGeneration", "required"])) ||
        !source.openWork.every((work) => hasExactKeys(work, ["obligationId", "kind", "revision"])) ||
        !source.taskOwnerLeases.every((lease) => hasExactKeys(lease, ["leaseId", "state"])) ||
        !source.barriers.every((barrier) => hasExactKeys(barrier, ["barrierId", "state"])) ||
        !source.memberships.every((membership) => hasExactKeys(membership, ["membershipId", "kind", "state"]))
      ) throw new LifecycleDomainError("SNAPSHOT_INVALID", "lifecycle agent nested state is invalid");
      if (source.archivalPlan === null) {
        if (source.lifecycle === "archived" || source.principalRevoked ||
          ((source.sourceCapabilityRevoked || source.bridgeRevoked) && source.lifecycle === "ready")) {
          throw new LifecycleDomainError("SNAPSHOT_INVALID", "archived or revoked agent requires its exact archival plan");
        }
      } else {
        const { planDigest, ...planPreimage } = source.archivalPlan;
        if (!hasExactKeys(source.archivalPlan, [
          "schemaVersion", "projectSessionId", "runId", "agentId", "recoverySourceRef", "turnIds",
          "writeCustodyIds", "deliveryIds", "obligationIds", "taskOwnerLeaseIds", "barrierIds",
          "membershipIds", "messageWatermark", "deliveryWatermark", "membershipWatermark", "parentAgentIds",
          "runDisposition", "chairDisposition", "sourceCheckpointDigest", "planDigest",
        ]) || source.lifecycle !== "archived" || !source.sourceCapabilityRevoked || !source.principalRevoked ||
          !source.bridgeRevoked || source.archivalPlan.projectSessionId !== source.projectSessionId ||
          source.archivalPlan.runId !== source.runId || source.archivalPlan.agentId !== source.agentId ||
          planDigest !== lifecycleDigest(planPreimage) || source.messageWatermark !== source.archivalPlan.messageWatermark ||
          source.deliveryWatermark !== source.archivalPlan.deliveryWatermark ||
          source.membershipWatermark !== source.archivalPlan.membershipWatermark) {
          throw new LifecycleDomainError("SNAPSHOT_INVALID", "agent archival plan is invalid or crossed");
        }
      }
      let agent: MutableAgent;
      try {
        agent = cloneAgent(source, source);
      } catch {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "lifecycle agent snapshot is invalid");
      }
      agent.lifecycle = source.lifecycle;
      agent.claimsFrozen = source.claimsFrozen;
      const key = agentKey(agent.projectSessionId, agent.runId, agent.agentId);
      if (domain.#agents.has(key)) throw new LifecycleDomainError("SNAPSHOT_INVALID", "duplicate lifecycle agent");
      domain.#agents.set(key, agent);
      try {
        domain.#setUnique(domain.#actionOwners, actionKey(agent.sourceBinding.custodyAction), `source:${key}`);
      } catch {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "source provider action pair is not daemon-global unique");
      }
    }
    for (const source of snapshot.recoveryIssues) {
      if (!validRecoveryIssueShape(source) || ports.recoveryAuthority === undefined ||
        !ports.recoveryAuthority.verifyIssue(source) ||
        !domain.#agents.has(agentKey(source.projectSessionId, source.runId, source.agentId))) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "recovery issue is malformed, untrusted or unowned");
      }
      domain.#setUnique(domain.#recoveryIssues, source.issueId, structuredClone(source));
    }
    for (const source of snapshot.custodies) {
      if (!hasExactKeys(source, [
        "custodyRef", "commandId", "requestDigest", "projectSessionId", "runId", "agentId", "phase", "disposition", "pair",
        "providerOperation", "adapterContractDigest", "stagedCapabilityHash", "sourceProvider", "sourceBinding",
        "sourcePrincipalGeneration", "sourceBridgeGeneration", "reservedProviderGeneration",
        "reservedPrincipalGeneration", "reservedBridgeGeneration", "checkpoint", "checkpointValidation", "candidate", "launchChallenge",
        "recoveryFromLossId", "recoveryAttemptId", "admissionKind", "requestAction", "admissionCheckpoint",
        "sourceWriteRevision", "sourceAuthorityRevision", "changedWriteCustodyIds",
        "callerTurnId", "history", "acceptance", "reviewDecision", "terminalEvidence",
      ])) throw new LifecycleDomainError("SNAPSHOT_INVALID", "lifecycle custody snapshot is not closed");
      if (domain.#custodies.has(source.custodyRef)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "duplicate lifecycle custody");
      }
      if (!domain.#agents.has(agentKey(source.projectSessionId, source.runId, source.agentId))) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "lifecycle custody references a missing agent");
      }
      if (!validActionPair(source.pair)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "provider action identity must be the canonical pair");
      }
      if (
        !validDigest(source.adapterContractDigest) || !validDigest(source.stagedCapabilityHash) ||
        !validDigest(source.launchChallenge) || source.acceptance.custodyRef !== source.custodyRef ||
        source.acceptance.commandId !== source.commandId || source.acceptance.agentId !== source.agentId ||
        !validProviderContext(source.sourceProvider) || !validSourceBinding(source.sourceBinding) ||
        !validCheckpointShape(source.checkpoint) || !validCheckpointShape(source.admissionCheckpoint) ||
        !validDigest(source.requestDigest as LifecycleDigest) ||
        (source.admissionKind !== "self-request" && source.admissionKind !== "fresh-recovery") ||
        !Array.isArray(source.changedWriteCustodyIds) || !uniqueNonempty(source.changedWriteCustodyIds) ||
        !Number.isSafeInteger(source.sourceWriteRevision) || source.sourceWriteRevision < 0 ||
        !Number.isSafeInteger(source.sourceAuthorityRevision) || source.sourceAuthorityRevision < 0 ||
        !hasExactKeys(source.acceptance, [
          "commandId", "projectSessionId", "runId", "custodyRef", "agentId", "lifecycle", "phase",
          "providerGeneration", "reservedProviderGeneration", "reservedPrincipalGeneration", "reservedBridgeGeneration",
        ]) || source.acceptance.projectSessionId !== source.projectSessionId || source.acceptance.runId !== source.runId
      ) throw new LifecycleDomainError("SNAPSHOT_INVALID", "lifecycle custody correlations are invalid");
      if (source.candidate !== null && (
        !hasExactKeys(source.candidate, ["provider", "principalGeneration", "bridgeGeneration", "launchAttestation"]) ||
        !validProviderContext(source.candidate.provider) ||
        !hasExactKeys(source.candidate.launchAttestation, [
          "pair", "operation", "adapterContractDigest", "projectSessionId", "runId", "agentId", "custodyRef",
          "challenge", "checkpointDigest", "taskDigest", "mailboxDigest", "childDigest", "openWorkDigest",
          "adoptionDeliveryDigest", "providerGeneration", "principalGeneration", "bridgeGeneration",
        ]) || !domain.#validCandidate(source as unknown as MutableCustody, source.candidate)
      )) throw new LifecycleDomainError("SNAPSHOT_INVALID", "replacement candidate snapshot is not closed");
      if ((source.phase === "finalized") !== (source.disposition !== null) ||
        (source.reviewDecision !== null && source.disposition !== "adopted")) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "custody phase, disposition and review decision are inconsistent");
      }
      const expectedAcceptance = {
        commandId: source.commandId,
        projectSessionId: source.projectSessionId,
        runId: source.runId,
        custodyRef: source.custodyRef,
        agentId: source.agentId,
        lifecycle: "suspended" as const,
        phase: "awaiting-boundary" as const,
        providerGeneration: source.sourceProvider.providerGeneration,
        reservedProviderGeneration: source.reservedProviderGeneration,
        reservedPrincipalGeneration: source.reservedPrincipalGeneration,
        reservedBridgeGeneration: source.reservedBridgeGeneration,
      };
      const expectedChallenge = lifecycleDigest({
        pair: source.pair,
        operation: source.providerOperation,
        adapterContractDigest: source.adapterContractDigest,
        projectSessionId: source.projectSessionId,
        runId: source.runId,
        agentId: source.agentId,
        custodyRef: source.custodyRef,
        checkpoint: source.checkpoint,
        launchAttestContract: "launch.attest.v1",
      });
      const recoveryLoss = source.recoveryFromLossId === null
        ? null
        : snapshot.losses.find((loss) => loss.lossId === source.recoveryFromLossId) ?? null;
      const checkpointSourceProvider = recoveryLoss?.oldProvider ?? source.sourceProvider;
      const checkpointSourceBinding = recoveryLoss?.sourceBinding ?? source.sourceBinding;
      const checkpointPrincipalGeneration = recoveryLoss?.sourcePrincipalGeneration ?? source.sourcePrincipalGeneration;
      const checkpointBridgeGeneration = recoveryLoss?.sourceBridgeGeneration ?? source.sourceBridgeGeneration;
      const checkpointAuthorityRevision = recoveryLoss?.sourceAuthorityRevision ?? source.sourceAuthorityRevision;
      const checkpointWriteRevision = recoveryLoss?.checkpointWriteRevision ?? source.sourceWriteRevision;
      const expectedCheckpointSourceBindingDigest = lifecycleDigest({
        provider: checkpointSourceProvider,
        principalGeneration: checkpointPrincipalGeneration,
        bridgeGeneration: checkpointBridgeGeneration,
        sourceBinding: checkpointSourceBinding,
      });
      const checkpointDigestFor = (
        checkpoint: LifecycleCheckpoint,
        writeRevision: number,
        provider: ProviderContext,
        authorityRevision: number,
      ): LifecycleDigest => lifecycleDigest({
        taskDigest: checkpoint.taskDigest,
        mailboxDigest: checkpoint.mailboxDigest,
        childDigest: checkpoint.childDigest,
        openWorkDigest: checkpoint.openWorkDigest,
        adoptionDeliveryDigest: checkpoint.adoptionDeliveryDigest,
        writeSetDigest: checkpoint.writeSetDigest,
        sourceBindingDigest: checkpoint.sourceBindingDigest,
        sourceHistoryDigest: checkpoint.sourceHistoryDigest,
        sourceProvider: provider,
        writeRevision,
        authorityRevision,
      });
      const admissionWriteRevision = source.admissionKind === "fresh-recovery"
        ? checkpointWriteRevision
        : source.sourceWriteRevision - (source.changedWriteCustodyIds.length > 0 ? 1 : 0);
      const reconstructedRequestDigest = source.admissionKind === "self-request"
        ? lifecycleDigest({
          admissionKind: "self-request",
          request: {
            commandId: source.commandId,
            projectSessionId: source.projectSessionId,
            runId: source.runId,
            agentId: source.agentId,
            action: source.requestAction,
            auth: {
              providerGeneration: source.sourceProvider.providerGeneration,
              principalGeneration: source.sourcePrincipalGeneration,
              bridgeGeneration: source.sourceBridgeGeneration,
            },
            checkpoint: source.admissionCheckpoint,
            adapterId: source.pair.adapterId,
            actionId: source.pair.actionId,
            adapterContractDigest: source.adapterContractDigest,
            operation: source.providerOperation,
          },
        })
        : lifecycleDigest({
          admissionKind: "fresh-recovery",
          request: {
            projectSessionId: source.projectSessionId,
            runId: source.runId,
            lossId: source.recoveryFromLossId,
            pair: source.pair,
            attemptId: source.recoveryAttemptId,
          },
        });
      const validPhase = ["awaiting-boundary", "prepared", "dispatched", "accepted", "ambiguous", "provider-terminal", "committing", "finalized"].includes(source.phase);
      const validDisposition = source.disposition === null || ["adopted", "no-effect", "superseded", "quarantined", "abandoned"].includes(source.disposition);
      const candidateRequired = source.phase === "provider-terminal" || source.phase === "committing" || source.disposition === "adopted";
      const candidateForbidden = ["awaiting-boundary", "prepared", "dispatched", "accepted", "ambiguous"].includes(source.phase) ||
        source.disposition === "no-effect";
      const admissionValid = source.admissionKind === "self-request"
        ? source.recoveryFromLossId === null && source.recoveryAttemptId === null && source.callerTurnId !== null &&
          source.checkpointValidation === null && (source.requestAction === "rotate" || source.requestAction === "compact")
        : source.recoveryFromLossId !== null && source.recoveryAttemptId !== null && source.callerTurnId === null &&
          source.requestAction === null && source.checkpointValidation !== null && source.changedWriteCustodyIds.length === 0 &&
          recoveryLoss !== null && canonicalJson(source.admissionCheckpoint) === canonicalJson(source.checkpoint) &&
          canonicalJson(source.checkpoint) === canonicalJson(recoveryLoss.checkpoint) &&
          canonicalJson(source.sourceProvider) === canonicalJson(recoveryLoss.newProvider) &&
          canonicalJson(source.sourceBinding) === canonicalJson(recoveryLoss.sourceBinding) &&
          source.sourcePrincipalGeneration === recoveryLoss.sourcePrincipalGeneration &&
          source.sourceBridgeGeneration === recoveryLoss.sourceBridgeGeneration &&
          source.sourceWriteRevision === recoveryLoss.sourceWriteRevision &&
          source.sourceAuthorityRevision === recoveryLoss.sourceAuthorityRevision;
      const ownerAgent = domain.#agents.get(agentKey(source.projectSessionId, source.runId, source.agentId));
      if (canonicalJson(source.acceptance) !== canonicalJson(expectedAcceptance) || source.launchChallenge !== expectedChallenge ||
        source.requestDigest !== reconstructedRequestDigest || admissionWriteRevision < 0 ||
        source.checkpoint.checkpointDigest !== checkpointDigestFor(source.checkpoint, checkpointWriteRevision, checkpointSourceProvider, checkpointAuthorityRevision) ||
        source.admissionCheckpoint.checkpointDigest !== checkpointDigestFor(source.admissionCheckpoint, admissionWriteRevision, checkpointSourceProvider, checkpointAuthorityRevision) ||
        source.checkpoint.sourceBindingDigest !== expectedCheckpointSourceBindingDigest ||
        source.admissionCheckpoint.sourceBindingDigest !== expectedCheckpointSourceBindingDigest ||
        source.checkpoint.sourceHistoryDigest !== checkpointSourceProvider.historyDigest ||
        source.admissionCheckpoint.sourceHistoryDigest !== checkpointSourceProvider.historyDigest || !validPhase ||
        !validDisposition || !validCustodyHistory(source.history, source.phase, source.disposition) ||
        !admissionValid || (candidateRequired && source.candidate === null) ||
        (candidateForbidden && source.candidate !== null) || ownerAgent === undefined ||
        source.changedWriteCustodyIds.some((id) => !ownerAgent.writes.some((write) => write.custodyId === id))) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "custody phase, admission, source and reservation evidence are crossed");
      }
      if (source.reviewDecision !== null) {
        if (source.candidate === null) throw new LifecycleDomainError("SNAPSHOT_INVALID", "review adoption requires its replacement candidate");
        const lifecycleCustodyRef = {
          schemaVersion: 1 as const,
          runId: source.runId,
          agentId: source.agentId,
          custodyId: source.custodyRef,
          custodyRevision: 1,
        };
        const evidenceDigest = lifecycleDigest({
          projectSessionId: source.projectSessionId,
          lifecycleCustodyRef,
          checkpoint: source.checkpoint,
          successorProvider: source.candidate.provider,
          successorPrincipalGeneration: source.candidate.principalGeneration,
          successorBridgeGeneration: source.candidate.bridgeGeneration,
          launchAttestation: source.candidate.launchAttestation,
        });
        try {
          domain.#assertReviewAdoptionDecision(source.reviewDecision, source.runId, lifecycleCustodyRef, evidenceDigest);
        } catch {
          throw new LifecycleDomainError("SNAPSHOT_INVALID", "review adoption decision is not correlated to custody");
        }
      }
      const existingActionOwner = domain.#actionOwners.get(actionKey(source.pair));
      const sourceAgent = domain.#agents.get(agentKey(source.projectSessionId, source.runId, source.agentId));
      const adoptedCurrentAction = source.disposition === "adopted" && sourceAgent !== undefined &&
        canonicalJson(sourceAgent.sourceBinding.custodyAction) === canonicalJson(source.pair);
      if (existingActionOwner !== undefined && !adoptedCurrentAction) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "provider action pair has crossed daemon-global owners");
      }
      domain.#actionOwners.set(actionKey(source.pair), source.custodyRef);
      domain.#custodies.set(source.custodyRef, {
        ...structuredClone(source),
        acceptance: Object.freeze({ ...source.acceptance }),
        history: [...source.history],
      });
    }
    for (const source of snapshot.reviewCertificationCuts) {
      if (!hasExactKeys(source, [
        "schemaVersion", "runId", "targetGeneration", "predecessorBindingGeneration",
        "predecessorBindingDigest", "terminalSequenceHighWater", "lifecycleCustodyRef",
        "lifecycleAdoptionEvidenceDigest", "cutDigest",
      ])) throw new LifecycleDomainError("SNAPSHOT_INVALID", "review certification cut is not closed");
      const custodyRef = source.lifecycleCustodyRef as LifecycleCustodyRef;
      const custody = domain.#custodies.get(custodyRef.custodyId);
      if (custody === undefined || custody.candidate === null || custody.disposition !== "adopted" ||
        custody.reviewDecision === null || custody.reviewDecision.kind === "no-current-target") {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "review certification cut lacks its adopted lifecycle custody");
      }
      const lifecycleCustodyRef = {
        schemaVersion: 1 as const,
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
      try {
        domain.#assertReviewAdoptionDecision(
          { kind: "stale", cut: source, reason: "same-subject-predicate-failed" },
          custody.runId,
          lifecycleCustodyRef,
          lifecycleAdoptionEvidenceDigest,
        );
      } catch {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "review certification cut is malformed or crossed");
      }
      if (canonicalJson(custody.reviewDecision.cut) !== canonicalJson(source)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "review decision does not name its lifecycle-owned cut");
      }
      domain.#setUnique(domain.#reviewCertificationCuts, custody.custodyRef, Object.freeze(structuredClone(source)));
    }
    for (const custody of domain.#custodies.values()) {
      const decisionOwnsCut = custody.reviewDecision !== null && custody.reviewDecision.kind !== "no-current-target";
      if (decisionOwnsCut !== domain.#reviewCertificationCuts.has(custody.custodyRef)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "review decision and lifecycle-owned certification cut diverged");
      }
    }
    for (const entry of snapshot.commands) {
      if (!hasExactKeys(entry, ["key", "custodyRef"])) throw new LifecycleDomainError("SNAPSHOT_INVALID", "command correlation is not closed");
      const custody = domain.#custodies.get(entry.custodyRef);
      if (custody === undefined || entry.key !== `${custody.projectSessionId}\u0000${custody.runId}\u0000${custody.commandId}`) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "command correlation references the wrong custody");
      }
      domain.#setUnique(domain.#commands, entry.key, entry.custodyRef);
    }
    const loadWater = (entries: readonly { readonly key: string; readonly value: number }[], target: Map<string, number>): void => {
      for (const entry of entries) {
        if (!hasExactKeys(entry, ["key", "value"]) || !Number.isSafeInteger(entry.value) || entry.value < 1) {
          throw new LifecycleDomainError("SNAPSHOT_INVALID", "high-water entry is invalid");
        }
        domain.#setUnique(target, entry.key, entry.value);
      }
    };
    loadWater(snapshot.providerHighWater, domain.#providerHighWater);
    loadWater(snapshot.principalHighWater, domain.#principalHighWater);
    loadWater(snapshot.bridgeHighWater, domain.#bridgeHighWater);
    for (const source of snapshot.losses) {
      if (!hasExactKeys(source, [
        "lossId", "projectSessionId", "runId", "agentId", "cause", "state", "actionPair", "reviewDecision",
        "activeRecoveryAttemptId", "activeRecoveryCustodyRef", "oldProvider", "newProvider", "sourceBinding",
        "sourcePrincipalGeneration", "sourceBridgeGeneration", "sourceBridgeOwnerId", "sourceRole",
        "checkpointState", "checkpointRef", "checkpointDigest", "checkpointValidationRevision",
        "checkpointValidationEvidenceDigest", "checkpoint",
        "fencedCheckpoint", "checkpointWriteRevision", "sourceWriteRevision", "sourceAuthorityRevision",
        "fencedWriteCustodyIds", "lossEvidenceDigest",
      ])) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "generation loss snapshot is not closed");
      }
      if (!domain.#agents.has(agentKey(source.projectSessionId, source.runId, source.agentId))) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "generation loss references a missing agent");
      }
      if (source.actionPair !== null && !validActionPair(source.actionPair)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "generation loss action identity must be the canonical pair");
      }
      const checkpointSourceBindingDigest = lifecycleDigest({
        provider: source.oldProvider,
        principalGeneration: source.sourcePrincipalGeneration,
        bridgeGeneration: source.sourceBridgeGeneration,
        sourceBinding: source.sourceBinding,
      });
      const fencedSourceBindingDigest = lifecycleDigest({
        provider: source.newProvider,
        principalGeneration: source.sourcePrincipalGeneration,
        bridgeGeneration: source.sourceBridgeGeneration,
        sourceBinding: source.sourceBinding,
      });
      const sealedCheckpointDigest = (
        checkpoint: LifecycleCheckpoint,
        provider: ProviderContext,
        writeRevision: number,
      ): LifecycleDigest => lifecycleDigest({
        taskDigest: checkpoint.taskDigest,
        mailboxDigest: checkpoint.mailboxDigest,
        childDigest: checkpoint.childDigest,
        openWorkDigest: checkpoint.openWorkDigest,
        adoptionDeliveryDigest: checkpoint.adoptionDeliveryDigest,
        writeSetDigest: checkpoint.writeSetDigest,
        sourceBindingDigest: checkpoint.sourceBindingDigest,
        sourceHistoryDigest: checkpoint.sourceHistoryDigest,
        sourceProvider: provider,
        writeRevision,
        authorityRevision: source.sourceAuthorityRevision,
      });
      const providersValid = validProviderContext(source.oldProvider) && validProviderContext(source.newProvider);
      const causeValid = providersValid && (source.cause === "generation-advance"
        ? source.newProvider.providerGeneration > source.oldProvider.providerGeneration
        : source.newProvider.providerGeneration === source.oldProvider.providerGeneration &&
          source.newProvider.contextRevision > source.oldProvider.contextRevision);
      if (!providersValid ||
        !validSourceBinding(source.sourceBinding) || !validCheckpointShape(source.checkpoint) ||
        !validCheckpointShape(source.fencedCheckpoint) || !validDigest(source.lossEvidenceDigest) ||
        !Number.isSafeInteger(source.sourcePrincipalGeneration) || source.sourcePrincipalGeneration < 1 ||
        !Number.isSafeInteger(source.sourceBridgeGeneration) || source.sourceBridgeGeneration < 1 ||
        !Number.isSafeInteger(source.checkpointWriteRevision) || source.checkpointWriteRevision < 0 ||
        !Array.isArray(source.fencedWriteCustodyIds) || !uniqueNonempty(source.fencedWriteCustodyIds) ||
        !Number.isSafeInteger(source.sourceWriteRevision) ||
        source.sourceWriteRevision !== source.checkpointWriteRevision + (source.fencedWriteCustodyIds.length > 0 ? 1 : 0) ||
        !Number.isSafeInteger(source.sourceAuthorityRevision) || source.sourceAuthorityRevision < 0 ||
        typeof source.sourceBridgeOwnerId !== "string" || source.sourceBridgeOwnerId.length === 0 ||
        (source.sourceRole !== "chair" && source.sourceRole !== "child") ||
        !["absent", "invalid", "last-validated"].includes(source.checkpointState) ||
        (source.checkpointState === "last-validated"
          ? typeof source.checkpointRef !== "string" || source.checkpointRef.length === 0 ||
            source.checkpointDigest !== source.checkpoint.checkpointDigest ||
            !Number.isSafeInteger(source.checkpointValidationRevision) ||
            (source.checkpointValidationRevision ?? 0) < 1 ||
            !validDigest(source.checkpointValidationEvidenceDigest as LifecycleDigest)
          : source.checkpointRef !== null || source.checkpointDigest !== null ||
            source.checkpointValidationRevision !== null || source.checkpointValidationEvidenceDigest !== null) ||
        !causeValid || source.newProvider.evidenceDigest !== source.lossEvidenceDigest ||
        source.checkpoint.sourceBindingDigest !== checkpointSourceBindingDigest ||
        source.checkpoint.sourceHistoryDigest !== source.oldProvider.historyDigest ||
        source.checkpoint.checkpointDigest !== sealedCheckpointDigest(source.checkpoint, source.oldProvider, source.checkpointWriteRevision) ||
        source.fencedCheckpoint.sourceBindingDigest !== fencedSourceBindingDigest ||
        source.fencedCheckpoint.sourceHistoryDigest !== source.newProvider.historyDigest ||
        source.fencedCheckpoint.checkpointDigest !== sealedCheckpointDigest(source.fencedCheckpoint, source.newProvider, source.sourceWriteRevision) ||
        (["taskDigest", "mailboxDigest", "childDigest", "openWorkDigest", "adoptionDeliveryDigest"] as const).some((field) =>
          source.fencedCheckpoint[field] !== source.checkpoint[field]
        ) ||
        (source.sourceRole === "chair") !== (source.sourceBinding.chairLeaseGeneration !== null)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "generation loss source tuple is malformed or crossed");
      }
      domain.#setUnique(domain.#losses, source.lossId, structuredClone(source));
    }
    for (const event of snapshot.audits) {
      if (!hasExactKeys(event, ["kind", "projectSessionId", "runId", "agentId", "sourceId", "detail"])) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "audit event is not closed");
      }
      if (!domain.#agents.has(agentKey(event.projectSessionId, event.runId, event.agentId))) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "audit event references a missing agent");
      }
      domain.#audits.push({ ...event });
    }
    if ([...domain.#custodies.values()].some((custody) =>
      !hasTerminalCustodyEvidence(custody, domain.#audits, domain.#losses)
    )) {
      throw new LifecycleDomainError("SNAPSHOT_INVALID", "finalized custody lacks its exact terminal evidence");
    }
    for (const source of snapshot.custodyDispositionProofs) {
      if (!hasExactKeys(source, [
        "schemaVersion", "projectSessionId", "runId", "agentId", "custodyRef", "requestDigest", "pair",
        "sourceCheckpointDigest", "disposition", "detail", "evidenceDigest", "proofRecordDigest",
      ])) throw new LifecycleDomainError("SNAPSHOT_INVALID", "custody disposition proof is not closed");
      const { proofRecordDigest, ...proofPreimage } = source;
      const custody = domain.#custodies.get(source.custodyRef);
      if (source.schemaVersion !== 1 ||
        (source.disposition !== "superseded" && source.disposition !== "quarantined") ||
        !validDigest(source.requestDigest) || !validActionPair(source.pair) ||
        !validDigest(source.sourceCheckpointDigest) || source.detail.length === 0 ||
        !validDigest(source.evidenceDigest) || !validDigest(proofRecordDigest) ||
        proofRecordDigest !== lifecycleDigest(proofPreimage) || custody === undefined ||
        custody.projectSessionId !== source.projectSessionId || custody.runId !== source.runId ||
        custody.agentId !== source.agentId || custody.requestDigest !== source.requestDigest ||
        canonicalJson(custody.pair) !== canonicalJson(source.pair) ||
        custody.checkpoint.checkpointDigest !== source.sourceCheckpointDigest ||
        custody.disposition !== source.disposition || custody.terminalEvidence === null ||
        custody.terminalEvidence.detail !== source.detail || custody.terminalEvidence.proofDigest !== source.evidenceDigest) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "custody disposition proof is malformed, crossed or substituted");
      }
      domain.#setUnique(domain.#custodyDispositionProofs, source.custodyRef, Object.freeze(structuredClone(source)));
    }
    for (const custody of domain.#custodies.values()) {
      const requiresDispositionProof = custody.disposition === "superseded" || custody.disposition === "quarantined";
      if (requiresDispositionProof !== domain.#custodyDispositionProofs.has(custody.custodyRef)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "custody disposition lacks one independently persisted proof record");
      }
    }
    for (const entry of snapshot.contextEvents) {
      if (!hasExactKeys(entry, ["key", "observation", "observationDigest", "result"]) || !validDigest(entry.observationDigest) ||
        !hasExactKeys(entry.observation, ["sourceEventId", "projectSessionId", "runId", "agentId", "providerGeneration", "contextRevision", "evidenceDigest"]) ||
        typeof entry.observation.sourceEventId !== "string" || entry.observation.sourceEventId.length === 0 ||
        typeof entry.observation.projectSessionId !== "string" || entry.observation.projectSessionId.length === 0 ||
        typeof entry.observation.runId !== "string" || entry.observation.runId.length === 0 ||
        typeof entry.observation.agentId !== "string" || entry.observation.agentId.length === 0 ||
        !Number.isSafeInteger(entry.observation.providerGeneration) || entry.observation.providerGeneration < 1 ||
        !Number.isSafeInteger(entry.observation.contextRevision) || entry.observation.contextRevision < 0 ||
        !validDigest(entry.observation.evidenceDigest) ||
        entry.observationDigest !== lifecycleDigest(entry.observation) ||
        !hasExactKeys(entry.result, ["classification", "lossId", "audit"])) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "context event record is not closed");
      }
      if (entry.result.lossId !== null && !domain.#losses.has(entry.result.lossId)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "context event references a missing loss");
      }
      if (!domain.#audits.some((event) => canonicalJson(event) === canonicalJson(entry.result.audit))) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "context event references a missing audit");
      }
      const result = structuredClone(entry.result);
      Object.freeze(result.audit);
      Object.freeze(result);
      domain.#setUnique(domain.#contextEvents, entry.key, {
        observation: structuredClone(entry.observation),
        observationDigest: entry.observationDigest,
        result,
      });
    }
    for (const source of snapshot.freshRotations) {
      if (!hasExactKeys(source, [
        "attemptId", "issueId", "issueCapabilityHash", "lossId", "pair", "checkpoint", "checkpointValidation",
        "adapterContractDigest", "operation", "reservedProviderGeneration",
        "reservedPrincipalGeneration", "reservedBridgeGeneration", "projectSessionId", "runId", "agentId",
      ])) throw new LifecycleDomainError("SNAPSHOT_INVALID", "fresh rotation preview is not closed");
      if (!validActionPair(source.pair) || !validCheckpointShape(source.checkpoint) || !validDigest(source.adapterContractDigest) ||
        !validDigest(source.issueCapabilityHash) || source.attemptId !== source.issueId) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "fresh rotation action identity must be the canonical pair");
      }
      const loss = domain.#losses.get(source.lossId);
      const issue = domain.#recoveryIssues.get(source.issueId);
      if (loss === undefined || loss.projectSessionId !== source.projectSessionId || loss.runId !== source.runId ||
        loss.agentId !== source.agentId || issue === undefined ||
        !domain.#recoveryCheckpointBindingAccepted(loss, source.checkpoint, source.checkpointValidation, issue)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "fresh rotation preview references the wrong loss");
      }
      if (issue.path !== "fresh-rotate" || issue.recoverySourceRef !== loss.lossId ||
        issue.capabilityHash !== source.issueCapabilityHash || canonicalJson(issue.pair) !== canonicalJson(source.pair) ||
        issue.adapterContractDigest !== source.adapterContractDigest || issue.operation !== source.operation ||
        issue.checkpointDigest !== source.checkpoint.checkpointDigest) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "fresh rotation preview crossed its recovery issue");
      }
      domain.#setUnique(domain.#freshRotations, source.attemptId, Object.freeze(structuredClone(source)));
    }
    for (const entry of snapshot.freshRotationCommitDigests) {
      const custody = domain.#custodies.get(entry.custodyRef);
      if (!hasExactKeys(entry, ["attemptId", "digest", "custodyRef"]) || !validDigest(entry.digest) ||
        custody === undefined || custody.recoveryAttemptId !== entry.attemptId || custody.requestDigest !== entry.digest) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "fresh rotation commit correlation is invalid");
      }
      domain.#setUnique(domain.#freshRotationCommitDigests, entry.attemptId, structuredClone(entry));
    }
    for (const custody of domain.#custodies.values()) {
      if (custody.recoveryFromLossId !== null) {
        const loss = domain.#losses.get(custody.recoveryFromLossId);
        const issue = custody.recoveryAttemptId === null ? undefined : domain.#recoveryIssues.get(custody.recoveryAttemptId);
        if (loss === undefined || loss.projectSessionId !== custody.projectSessionId || loss.runId !== custody.runId || loss.agentId !== custody.agentId) {
          throw new LifecycleDomainError("SNAPSHOT_INVALID", "custody recovery source correlation is invalid");
        }
        if (issue === undefined || custody.checkpointValidation === null ||
          !domain.#recoveryCheckpointBindingAccepted(loss, custody.checkpoint, custody.checkpointValidation, issue)) {
          throw new LifecycleDomainError("SNAPSHOT_INVALID", "custody recovery checkpoint is not validator-bound");
        }
      }
    }
    const retirementIds = new Set<string>();
    for (const source of snapshot.recoveryRetirements) {
      if (!hasExactKeys(source, [
        "schemaVersion", "retirementId", "projectSessionId", "runId", "agentId", "issueId",
        "recoverySourceKind", "recoverySourceRef", "abandonKind", "actionPair",
        "oldTerminalDisposition", "abandonReason", "consequenceDigest", "sourceCheckpointDigest",
        "directHumanAttestationDigest", "requestDigest", "retirementDigest",
      ])) throw new LifecycleDomainError("SNAPSHOT_INVALID", "lifecycle recovery retirement is not closed");
      const { retirementDigest, ...retirementPreimage } = source;
      const agent = domain.#agents.get(agentKey(source.projectSessionId, source.runId, source.agentId));
      const issue = domain.#recoveryIssues.get(source.issueId);
      const plan = agent?.archivalPlan ?? null;
      if (source.schemaVersion !== 1 || source.retirementId.length === 0 || source.retirementId !== source.issueId ||
        retirementIds.has(source.retirementId) || source.recoverySourceRef.length === 0 || source.abandonReason.trim().length === 0 ||
        !validDigest(source.consequenceDigest) || !validDigest(source.sourceCheckpointDigest) ||
        !validDigest(source.directHumanAttestationDigest) || !validDigest(source.requestDigest) ||
        !validDigest(retirementDigest) || retirementDigest !== lifecycleDigest(retirementPreimage) ||
        (source.actionPair !== null && !validActionPair(source.actionPair)) || agent === undefined || plan === null ||
        plan.projectSessionId !== source.projectSessionId || plan.runId !== source.runId || plan.agentId !== source.agentId ||
        plan.recoverySourceRef !== source.recoverySourceRef || plan.planDigest !== source.consequenceDigest ||
        plan.sourceCheckpointDigest !== source.sourceCheckpointDigest || issue === undefined || issue.path !== "abandon" ||
        issue.status !== "consumed" || issue.projectSessionId !== source.projectSessionId || issue.runId !== source.runId ||
        issue.agentId !== source.agentId || issue.recoverySourceRef !== source.recoverySourceRef ||
        issue.directHumanAttestationDigest !== source.directHumanAttestationDigest ||
        issue.directHumanReasonDigest !== lifecycleDigest(source.abandonReason) ||
        canonicalJson(issue.pair) !== canonicalJson(source.actionPair)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "lifecycle recovery retirement is malformed or crossed");
      }
      const authority = {
        operations: ["session.cancel"] as const,
        projectSessionId: source.projectSessionId,
        runId: source.runId,
        agentId: source.agentId,
        sessionGeneration: issue.sessionGeneration,
        authorityDigest: issue.capabilityHash,
        consequentialGateId: issue.consequentialGateId,
        consequentialGateDigest: issue.consequentialGateDigest,
        consequentialGateRecoverySourceRef: source.recoverySourceRef,
        directHumanConfirmation: {
          reason: source.abandonReason,
          attestationDigest: source.directHumanAttestationDigest,
        },
      };
      let expectedRequestDigest: LifecycleDigest;
      let auditKind: string;
      if (source.recoverySourceKind === "custody") {
        const custody = domain.#custodies.get(source.recoverySourceRef);
        const finalizedRetirement = source.abandonKind === "finalized-custody";
        if (custody === undefined || custody.projectSessionId !== source.projectSessionId || custody.runId !== source.runId ||
          custody.agentId !== source.agentId || source.actionPair === null ||
          canonicalJson(custody.pair) !== canonicalJson(source.actionPair) ||
          (finalizedRetirement
            ? source.oldTerminalDisposition === null || source.oldTerminalDisposition === "adopted" ||
              source.oldTerminalDisposition === "abandoned" || custody.disposition !== source.oldTerminalDisposition
            : source.abandonKind !== "nonfinal-custody" || source.oldTerminalDisposition !== null || custody.disposition !== "abandoned")) {
          throw new LifecycleDomainError("SNAPSHOT_INVALID", "custody retirement does not preserve its exact terminal source");
        }
        expectedRequestDigest = lifecycleDigest({
          operation: "abandon-custody",
          request: {
            projectSessionId: source.projectSessionId,
            runId: source.runId,
            custodyRef: source.recoverySourceRef,
            pair: source.actionPair,
            authority,
            expectedArchivalPlanDigest: source.consequenceDigest,
            expectedSourceCheckpointDigest: source.sourceCheckpointDigest,
          },
        });
        auditKind = "lifecycle-custody-abandoned";
      } else if (source.recoverySourceKind === "generation-loss") {
        const loss = domain.#losses.get(source.recoverySourceRef);
        const directOpen = source.abandonKind === "direct-open";
        if (loss === undefined || loss.projectSessionId !== source.projectSessionId || loss.runId !== source.runId ||
          loss.agentId !== source.agentId || loss.state !== "abandoned" || source.oldTerminalDisposition !== null ||
          (directOpen
            ? source.actionPair !== null
            : source.abandonKind !== "recovery-attempt" || source.actionPair === null ||
              canonicalJson(loss.actionPair) !== canonicalJson(source.actionPair))) {
          throw new LifecycleDomainError("SNAPSHOT_INVALID", "generation-loss retirement crossed its abandon provenance");
        }
        expectedRequestDigest = lifecycleDigest({
          operation: "abandon-loss",
          request: {
            projectSessionId: source.projectSessionId,
            runId: source.runId,
            lossId: source.recoverySourceRef,
            ...(source.actionPair === null ? {} : { actionPair: source.actionPair }),
            authority,
            expectedArchivalPlanDigest: source.consequenceDigest,
            expectedSourceCheckpointDigest: source.sourceCheckpointDigest,
          },
        });
        auditKind = "generation-loss-abandoned";
      } else {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "lifecycle recovery retirement source kind is invalid");
      }
      const audits = domain.#audits.filter((event) =>
        event.kind === auditKind && event.projectSessionId === source.projectSessionId && event.runId === source.runId &&
        event.agentId === source.agentId && event.sourceId === source.recoverySourceRef && event.detail === source.abandonReason
      );
      if (expectedRequestDigest !== source.requestDigest || audits.length !== 1) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "lifecycle recovery retirement lacks its exact request or audit");
      }
      retirementIds.add(source.retirementId);
      domain.#setUnique(
        domain.#recoveryRetirements,
        retirementKey(source.recoverySourceKind, source.recoverySourceRef),
        Object.freeze(structuredClone(source)),
      );
    }
    for (const custody of domain.#custodies.values()) {
      if (custody.disposition !== "abandoned" || custody.terminalEvidence === null) continue;
      const retirement = custody.recoveryFromLossId === null
        ? domain.#recoveryRetirements.get(retirementKey("custody", custody.custodyRef))
        : domain.#recoveryRetirements.get(retirementKey("generation-loss", custody.recoveryFromLossId));
      if (retirement === undefined ||
        custody.terminalEvidence.proofDigest !== retirement.directHumanAttestationDigest ||
        custody.terminalEvidence.detail !== retirement.abandonReason) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "abandoned custody proof is not bound to its retirement attestation");
      }
    }
    const commandCustodyRefs = snapshot.commands.map((entry) => entry.custodyRef);
    if (commandCustodyRefs.length !== domain.#custodies.size || new Set(commandCustodyRefs).size !== domain.#custodies.size) {
      throw new LifecycleDomainError("SNAPSHOT_INVALID", "every lifecycle custody requires exactly one command correlation");
    }
    for (const [key, record] of domain.#contextEvents) {
      const expectedKey = `${record.observation.projectSessionId}\u0000${record.observation.runId}\u0000${record.observation.agentId}\u0000${record.observation.sourceEventId}`;
      if (key !== expectedKey ||
        record.result.audit.projectSessionId !== record.observation.projectSessionId ||
        record.result.audit.runId !== record.observation.runId ||
        record.result.audit.agentId !== record.observation.agentId ||
        record.result.audit.sourceId !== record.observation.sourceEventId ||
        (record.result.lossId === null && (record.result.classification === "context-advance" || record.result.classification === "generation-advance")) ||
        (record.result.lossId !== null && record.result.classification !== domain.#losses.get(record.result.lossId)?.cause)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "context event classification and identity are not correlated");
      }
    }
    for (const loss of domain.#losses.values()) {
      const sourceEvents = [...domain.#contextEvents.values()].filter((record) => record.result.lossId === loss.lossId);
      const linkedCustodies = [...domain.#custodies.values()].filter((custody) => custody.recoveryFromLossId === loss.lossId);
      const reusedReservation = loss.cause === "generation-advance" && [...domain.#custodies.values()].some((custody) =>
        custody.projectSessionId === loss.projectSessionId && custody.runId === loss.runId &&
        custody.agentId === loss.agentId &&
        custody.reservedProviderGeneration === loss.newProvider.providerGeneration
      );
      const nonfinal = linkedCustodies.filter((custody) => custody.phase !== "finalized");
      const sourceObservation = sourceEvents[0]?.observation;
      const lossAgent = domain.#agents.get(agentKey(loss.projectSessionId, loss.runId, loss.agentId));
      if (sourceEvents.length !== 1 || sourceObservation === undefined || reusedReservation ||
        loss.lossId !== `loss:${loss.projectSessionId}:${loss.runId}:${loss.agentId}:${sourceObservation.sourceEventId}` ||
        sourceObservation.projectSessionId !== loss.projectSessionId || sourceObservation.runId !== loss.runId ||
        sourceObservation.agentId !== loss.agentId || sourceObservation.providerGeneration !== loss.newProvider.providerGeneration ||
        sourceObservation.contextRevision !== loss.newProvider.contextRevision ||
        sourceObservation.evidenceDigest !== loss.lossEvidenceDigest) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "generation loss requires one exact source observation");
      }
      if (loss.state === "open" && (loss.actionPair !== null || nonfinal.length !== 0 ||
        loss.activeRecoveryAttemptId !== null || loss.activeRecoveryCustodyRef !== null)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "open generation loss cannot own an action or nonfinal custody");
      }
      if (loss.state === "recovery-in-progress" && (
        loss.actionPair === null || nonfinal.length !== 1 || canonicalJson(nonfinal[0]?.pair) !== canonicalJson(loss.actionPair) ||
        loss.activeRecoveryAttemptId === null || loss.activeRecoveryCustodyRef !== nonfinal[0]?.custodyRef ||
        nonfinal[0]?.recoveryAttemptId !== loss.activeRecoveryAttemptId
      )) throw new LifecycleDomainError("SNAPSHOT_INVALID", "recovery-in-progress loss requires its exact nonfinal custody");
      if (loss.state === "recovered-adopted" && (
        loss.actionPair === null || linkedCustodies.filter((custody) => custody.disposition === "adopted").length !== 1 ||
        loss.activeRecoveryAttemptId !== null || loss.activeRecoveryCustodyRef !== null || lossAgent === undefined ||
        lossAgent.writeRevision < loss.sourceWriteRevision || loss.fencedWriteCustodyIds.some((id) =>
          !lossAgent.writes.some((write) => write.custodyId === id && write.state === "lifecycle-quarantined")
        )
      )) throw new LifecycleDomainError("SNAPSHOT_INVALID", "recovered generation loss requires one adopted custody");
      if (loss.state === "abandoned" && (nonfinal.length !== 0 || loss.activeRecoveryAttemptId !== null || loss.activeRecoveryCustodyRef !== null)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "abandoned generation loss cannot retain nonfinal custody");
      }
    }
    const validAgentKeys = new Set([...domain.#agents.keys()]);
    const validBridgeKeys = new Set([...domain.#agents.values()].map((agent) => bridgeKey(agent.projectSessionId, agent.runId, agent.bridgeOwnerId)));
    if ([...domain.#providerHighWater.keys()].some((key) => !validAgentKeys.has(key)) ||
      [...domain.#principalHighWater.keys()].some((key) => !validAgentKeys.has(key)) ||
      [...domain.#bridgeHighWater.keys()].some((key) => !validBridgeKeys.has(key))) {
      throw new LifecycleDomainError("SNAPSHOT_INVALID", "high-water key has no canonical owner");
    }
    for (const agent of domain.#agents.values()) {
      const key = agentKey(agent.projectSessionId, agent.runId, agent.agentId);
      const agentRetirements = [...domain.#recoveryRetirements.values()].filter((retirement) =>
        retirement.projectSessionId === agent.projectSessionId && retirement.runId === agent.runId &&
        retirement.agentId === agent.agentId
      );
      if ((agent.lifecycle === "archived" && (agentRetirements.length !== 1 || agent.archivalPlan === null ||
        agentRetirements[0]?.recoverySourceRef !== agent.archivalPlan.recoverySourceRef)) ||
        (agent.lifecycle !== "archived" && agentRetirements.length !== 0)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "agent archival state lacks one exact recovery retirement");
      }
      const ownedCustodies = [...domain.#custodies.values()].filter((custody) => custody.projectSessionId === agent.projectSessionId && custody.runId === agent.runId && custody.agentId === agent.agentId);
      const providerFloor = Math.max(agent.provider.providerGeneration, ...ownedCustodies.map((custody) => custody.reservedProviderGeneration));
      const principalFloor = Math.max(agent.principalGeneration, ...ownedCustodies.map((custody) => custody.reservedPrincipalGeneration));
      const providerSequence = [...ownedCustodies].sort((left, right) => left.reservedProviderGeneration - right.reservedProviderGeneration);
      const principalSequence = [...ownedCustodies].sort((left, right) => left.reservedPrincipalGeneration - right.reservedPrincipalGeneration);
      const validSequence = (
        sequence: readonly MutableCustody[],
        reserved: (custody: MutableCustody) => number,
        source: (custody: MutableCustody) => number,
      ): boolean => sequence.every((custody, index) => {
        const prior = sequence.slice(0, index).map(reserved);
        return reserved(custody) === Math.max(source(custody), ...prior) + 1;
      });
      if ((domain.#providerHighWater.get(key) ?? 0) !== providerFloor ||
        (domain.#principalHighWater.get(key) ?? 0) !== principalFloor ||
        !validSequence(providerSequence, (custody) => custody.reservedProviderGeneration, (custody) => custody.sourceProvider.providerGeneration) ||
        !validSequence(principalSequence, (custody) => custody.reservedPrincipalGeneration, (custody) => custody.sourcePrincipalGeneration)) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "generation reservations or exact high-water are not contiguous");
      }
      const latest = providerSequence.at(-1);
      const activeLoss = [...domain.#losses.values()].find((loss) =>
        loss.projectSessionId === agent.projectSessionId && loss.runId === agent.runId && loss.agentId === agent.agentId &&
        (loss.state === "open" || loss.state === "recovery-in-progress")
      );
      const hasActiveLoss = activeLoss !== undefined;
      if (activeLoss !== undefined && (
        canonicalJson(agent.provider) !== canonicalJson(activeLoss.newProvider) ||
        canonicalJson(agent.sourceBinding) !== canonicalJson(activeLoss.sourceBinding) ||
        agent.principalGeneration !== activeLoss.sourcePrincipalGeneration ||
        agent.bridgeGeneration !== activeLoss.sourceBridgeGeneration || agent.bridgeOwnerId !== activeLoss.sourceBridgeOwnerId ||
        agent.role !== activeLoss.sourceRole || agent.writeRevision !== activeLoss.sourceWriteRevision ||
        agent.authorityRevision !== activeLoss.sourceAuthorityRevision ||
        agent.recoveryCheckpointState !== activeLoss.checkpointState ||
        agent.recoveryCheckpointRef !== activeLoss.checkpointRef ||
        agent.recoveryCheckpointDigest !== activeLoss.checkpointDigest ||
        agent.recoveryCheckpointValidationRevision !== activeLoss.checkpointValidationRevision ||
        agent.recoveryCheckpointValidationEvidenceDigest !== activeLoss.checkpointValidationEvidenceDigest ||
        !exactCheckpoint(checkpointFor(agent), activeLoss.fencedCheckpoint) || !agent.sourceCapabilityRevoked ||
        !agent.bridgeRevoked || !agent.claimsFrozen ||
        (activeLoss.state === "open" ? agent.lifecycle !== "recovery-required" : agent.lifecycle !== "suspended") ||
        activeLoss.fencedWriteCustodyIds.some((id) =>
          !agent.writes.some((write) => write.custodyId === id && write.state === "lifecycle-quarantined")
        )
      )) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "active generation loss is not the agent's exact current source owner");
      }
      if (latest !== undefined) {
        const latestRetirement = domain.#recoveryRetirements.get(retirementKey("custody", latest.custodyRef));
        const latestWasFinalizedBeforeRetirement = latestRetirement?.abandonKind === "finalized-custody" &&
          latestRetirement.oldTerminalDisposition === latest.disposition;
        const predecessorSourceMatches = canonicalJson(agent.provider) === canonicalJson(latest.sourceProvider) &&
          canonicalJson(agent.sourceBinding) === canonicalJson(latest.sourceBinding) &&
          agent.principalGeneration === latest.sourcePrincipalGeneration &&
          agent.bridgeGeneration === latest.sourceBridgeGeneration;
        const changedWritesActive = latest.changedWriteCustodyIds.every((id) =>
          agent.writes.some((write) => write.custodyId === id && write.state === "active")
        );
        const changedWritesQuarantined = latest.changedWriteCustodyIds.every((id) =>
          agent.writes.some((write) => write.custodyId === id && write.state === "lifecycle-quarantined")
        );
        if (latest.phase !== "finalized" && (agent.lifecycle !== "suspended" || !agent.claimsFrozen ||
          latest.changedWriteCustodyIds.some((id) => !agent.writes.some((write) => write.custodyId === id && write.state === "lifecycle-quarantined")))) {
          throw new LifecycleDomainError("SNAPSHOT_INVALID", "nonfinal custody is not the agent's exact suspended owner");
        }
        if (latest.disposition === "adopted" && !hasActiveLoss) {
          if (latest.candidate === null || canonicalJson(agent.provider) !== canonicalJson(latest.candidate.provider) ||
            agent.principalGeneration !== latest.candidate.principalGeneration || agent.bridgeGeneration !== latest.candidate.bridgeGeneration ||
            canonicalJson(agent.sourceBinding.custodyAction) !== canonicalJson(latest.pair) ||
            agent.sourceBinding.adapterContractDigest !== latest.adapterContractDigest ||
            agent.sourceBinding.capabilityHash !== latest.stagedCapabilityHash ||
            agent.writeRevision < latest.sourceWriteRevision || !changedWritesQuarantined ||
            agent.lifecycle !== "ready" || agent.claimsFrozen) {
            throw new LifecycleDomainError("SNAPSHOT_INVALID", "adopted custody is not the agent's exact current successor");
          }
        }
        if ((latest.disposition === "no-effect" || latest.disposition === "superseded") && !hasActiveLoss &&
          !latestWasFinalizedBeforeRetirement &&
          (agent.lifecycle !== "ready" || agent.claimsFrozen || !predecessorSourceMatches ||
            agent.writeRevision < latest.sourceWriteRevision + (latest.changedWriteCustodyIds.length > 0 ? 1 : 0) ||
            !changedWritesActive)) {
          throw new LifecycleDomainError("SNAPSHOT_INVALID", "closed no-effect custody did not restore its exact predecessor");
        }
        if (latest.disposition === "quarantined" && !latestWasFinalizedBeforeRetirement &&
          (agent.lifecycle !== "recovery-required" || !agent.claimsFrozen ||
          (!hasActiveLoss && (!predecessorSourceMatches || agent.writeRevision !== latest.sourceWriteRevision ||
            !changedWritesQuarantined)))) {
          throw new LifecycleDomainError("SNAPSHOT_INVALID", "quarantined custody is not correlated to recovery-required state");
        }
        if (latest.disposition === "abandoned" && (agent.lifecycle !== "archived" || !agent.claimsFrozen)) {
          throw new LifecycleDomainError("SNAPSHOT_INVALID", "abandoned custody is not correlated to archived state");
        }
      }
    }
    for (const bridgeOwnerKey of validBridgeKeys) {
      const ownerAgents = [...domain.#agents.values()].filter((agent) =>
        bridgeKey(agent.projectSessionId, agent.runId, agent.bridgeOwnerId) === bridgeOwnerKey
      );
      const ownerCustodies = [...domain.#custodies.values()].filter((custody) => ownerAgents.some((agent) =>
        agent.projectSessionId === custody.projectSessionId && agent.runId === custody.runId && agent.agentId === custody.agentId
      )).sort((left, right) => left.reservedBridgeGeneration - right.reservedBridgeGeneration);
      const bridgeFloor = Math.max(...ownerAgents.map((agent) => agent.bridgeGeneration), ...ownerCustodies.map((custody) => custody.reservedBridgeGeneration));
      const bridgeSequenceValid = ownerCustodies.every((custody, index) =>
        custody.reservedBridgeGeneration === Math.max(
          custody.sourceBridgeGeneration,
          ...ownerCustodies.slice(0, index).map((prior) => prior.reservedBridgeGeneration),
        ) + 1
      );
      if ((domain.#bridgeHighWater.get(bridgeOwnerKey) ?? 0) !== bridgeFloor || !bridgeSequenceValid) {
        throw new LifecycleDomainError("SNAPSHOT_INVALID", "bridge reservations or exact high-water are not contiguous");
      }
    }
    return domain;
  }

  snapshot(): LifecycleDomainSnapshotV1 {
    const agents: LifecycleAgentSnapshot[] = [...this.#agents.values()]
      .sort((left, right) => agentKey(left.projectSessionId, left.runId, left.agentId).localeCompare(agentKey(right.projectSessionId, right.runId, right.agentId)))
      .map((agent) => structuredClone({
        projectSessionId: agent.projectSessionId,
        runId: agent.runId,
        agentId: agent.agentId,
        bridgeOwnerId: agent.bridgeOwnerId,
        role: agent.role,
        lifecycle: agent.lifecycle,
        provider: agent.provider,
        sourceBinding: agent.sourceBinding,
        principalGeneration: agent.principalGeneration,
        bridgeGeneration: agent.bridgeGeneration,
        taskRevision: agent.taskRevision,
        mailboxRevision: agent.mailboxRevision,
        childRevision: agent.childRevision,
        writeRevision: agent.writeRevision,
        authorityRevision: agent.authorityRevision,
        recoveryCheckpointState: agent.recoveryCheckpointState,
        recoveryCheckpointRef: agent.recoveryCheckpointRef,
        recoveryCheckpointDigest: agent.recoveryCheckpointDigest,
        recoveryCheckpointValidationRevision: agent.recoveryCheckpointValidationRevision,
        recoveryCheckpointValidationEvidenceDigest: agent.recoveryCheckpointValidationEvidenceDigest,
        childIds: agent.childIds,
        openWork: agent.openWork,
        turns: agent.turns,
        writes: agent.writes,
        deliveries: agent.deliveries,
        taskOwnerLeases: agent.taskOwnerLeases,
        barriers: agent.barriers,
        memberships: agent.memberships,
        messageWatermark: agent.messageWatermark,
        deliveryWatermark: agent.deliveryWatermark,
        membershipWatermark: agent.membershipWatermark,
        archivalPlan: agent.archivalPlan,
        sourceCapabilityRevoked: agent.sourceCapabilityRevoked,
        principalRevoked: agent.principalRevoked,
        bridgeRevoked: agent.bridgeRevoked,
        claimsFrozen: agent.claimsFrozen,
      }));
    const custodies: LifecycleCustodySnapshot[] = [...this.#custodies.values()]
      .sort((left, right) => left.custodyRef.localeCompare(right.custodyRef))
      .map((custody) => structuredClone(custody));
    const losses: LifecycleGenerationLossSnapshot[] = [...this.#losses.values()]
      .sort((left, right) => left.lossId.localeCompare(right.lossId))
      .map((loss) => structuredClone(loss));
    const freshRotations: LifecycleFreshRotationSnapshot[] = [...this.#freshRotations.values()]
      .sort((left, right) => left.attemptId.localeCompare(right.attemptId))
      .map((rotation) => structuredClone(rotation));
    const preimage = {
      schemaVersion: 1 as const,
      agents,
      custodies,
      commands: [...this.#commands].sort(([left], [right]) => left.localeCompare(right))
        .map(([key, custodyRef]) => ({ key, custodyRef })),
      providerHighWater: [...this.#providerHighWater].sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => ({ key, value })),
      principalHighWater: [...this.#principalHighWater].sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => ({ key, value })),
      bridgeHighWater: [...this.#bridgeHighWater].sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => ({ key, value })),
      contextEvents: [...this.#contextEvents].sort(([left], [right]) => left.localeCompare(right))
        .map(([key, record]) => ({
          key,
          observation: structuredClone(record.observation),
          observationDigest: record.observationDigest,
          result: structuredClone(record.result),
        })),
      losses,
      audits: this.#audits.map((event) => ({ ...event })),
      freshRotations,
      freshRotationCommitDigests: [...this.#freshRotationCommitDigests]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, record]) => structuredClone(record)),
      recoveryIssues: [...this.#recoveryIssues.values()]
        .sort((left, right) => left.issueId.localeCompare(right.issueId))
        .map((issue) => structuredClone(issue)),
      recoveryRetirements: [...this.#recoveryRetirements.values()]
        .sort((left, right) => left.retirementId.localeCompare(right.retirementId))
        .map((retirement) => structuredClone(retirement)),
      reviewCertificationCuts: [...this.#reviewCertificationCuts.values()]
        .sort((left, right) => left.lifecycleCustodyRef.custodyId.localeCompare(right.lifecycleCustodyRef.custodyId))
        .map((cut) => structuredClone(cut)),
      custodyDispositionProofs: [...this.#custodyDispositionProofs.values()]
        .sort((left, right) => left.custodyRef.localeCompare(right.custodyRef))
        .map((proof) => structuredClone(proof)),
    };
    return { ...preimage, snapshotDigest: lifecycleDigest(preimage) };
  }

  checkpoint(projectSessionId: string, runId: string, agentId: string): LifecycleCheckpoint {
    return checkpointFor(this.#agent(projectSessionId, runId, agentId));
  }

  registerRecoveryIssue(source: LifecycleRecoveryIssue): LifecycleRecoveryIssue {
    const verifier = this.#ports.recoveryAuthority;
    if (!validRecoveryIssueShape(source) || verifier === undefined || !verifier.verifyIssue(source) ||
      !this.#agents.has(agentKey(source.projectSessionId, source.runId, source.agentId))) {
      throw new LifecycleDomainError("RECOVERY_ISSUE_INVALID", "only a trusted closed recovery issue may enter lifecycle custody");
    }
    const existing = this.#recoveryIssues.get(source.issueId);
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(source)) {
        throw new LifecycleDomainError("RECOVERY_ISSUE_CONFLICT", "recovery issue ID was reused with different authority");
      }
      return structuredClone(existing);
    }
    const stored = structuredClone(source) as MutableRecoveryIssue;
    this.#recoveryIssues.set(stored.issueId, stored);
    return structuredClone(stored);
  }

  requestRotation(request: RotationRequest): RotationAcceptance {
    const agent = this.#agent(request.projectSessionId, request.runId, request.agentId);
    const requestDigest = lifecycleDigest({ admissionKind: "self-request", request });
    const commandKey = `${request.projectSessionId}\u0000${request.runId}\u0000${request.commandId}`;
    const replayRef = this.#commands.get(commandKey);
    if (replayRef !== undefined) {
      const replay = this.#custody(request.projectSessionId, request.runId, replayRef);
      if (replay.requestDigest !== requestDigest) {
        throw new LifecycleDomainError("COMMAND_CONFLICT", "commandId was reused with different lifecycle input");
      }
      return replay.acceptance;
    }
    if (agent.lifecycle !== "ready") {
      throw new LifecycleDomainError("LIFECYCLE_NOT_READY", "agent is not ready for a new lifecycle request");
    }
    const pair = { adapterId: request.adapterId, actionId: request.actionId };
    if (!validActionPair(pair) || request.operation.length === 0 || request.commandId.length === 0 ||
      !validDigest(request.adapterContractDigest)) {
      throw new LifecycleDomainError("LIFECYCLE_REQUEST_INVALID", "command and provider action pair fields must be nonempty");
    }
    if (this.#actionOwners.has(actionKey(pair))) {
      throw new LifecycleDomainError("ACTION_PAIR_CONFLICT", "provider action pair is already allocated by this daemon");
    }
    if (
      request.auth.providerGeneration !== agent.provider.providerGeneration ||
      request.auth.principalGeneration !== agent.principalGeneration ||
      request.auth.bridgeGeneration !== agent.bridgeGeneration
    ) {
      throw new LifecycleDomainError("CALLER_CONTEXT_MISMATCH", "caller authentication does not match current custody");
    }
    const predecessorTurns = agent.turns.filter((turn) => !terminalTurn(turn));
    const callerTurns = predecessorTurns.filter((turn) =>
      turn.state === "active" &&
      turn.providerGeneration === request.auth.providerGeneration &&
      turn.principalGeneration === request.auth.principalGeneration &&
      turn.bridgeGeneration === request.auth.bridgeGeneration
    );
    if (callerTurns.length !== 1 || predecessorTurns.length !== 1) {
      throw new LifecycleDomainError(
        "CALLER_TURN_NOT_UNIQUE",
        "rotation requires exactly one authenticated active caller turn and no other live predecessor turn",
      );
    }
    const admissionCheckpoint = checkpointFor(agent);
    if (!exactCheckpoint(request.checkpoint, admissionCheckpoint)) {
      throw new LifecycleDomainError("CHECKPOINT_MISMATCH", "lifecycle checkpoint is not the exact current state vector");
    }

    const key = agentKey(agent.projectSessionId, agent.runId, agent.agentId);
    const providerGeneration = (this.#providerHighWater.get(key) ?? 0) + 1;
    const principalGeneration = (this.#principalHighWater.get(key) ?? 0) + 1;
    const ownerKey = bridgeKey(agent.projectSessionId, agent.runId, agent.bridgeOwnerId);
    const bridgeGeneration = (this.#bridgeHighWater.get(ownerKey) ?? 0) + 1;
    positiveInteger(providerGeneration, "reservedProviderGeneration");
    positiveInteger(principalGeneration, "reservedPrincipalGeneration");
    positiveInteger(bridgeGeneration, "reservedBridgeGeneration");

    const changedWriteCustodyIds = agent.writes
      .filter((write) => write.state === "active")
      .map((write) => write.custodyId)
      .sort();
    const quarantinedWrites = agent.writes.map((write) =>
      write.state === "active" ? { ...write, state: "lifecycle-quarantined" as const } : write
    );
    if (canonicalJson(quarantinedWrites) !== canonicalJson(agent.writes)) agent.writeRevision += 1;
    agent.writes = quarantinedWrites;
    const currentCheckpoint = checkpointFor(agent);

    this.#providerHighWater.set(key, providerGeneration);
    this.#principalHighWater.set(key, principalGeneration);
    this.#bridgeHighWater.set(ownerKey, bridgeGeneration);

    agent.lifecycle = "suspended";
    agent.claimsFrozen = true;
    const custodyRef = `lifecycle:${request.projectSessionId}:${request.runId}:${request.agentId}:${request.commandId}`;
    const launchChallenge = lifecycleDigest({
      pair,
      operation: request.operation,
      adapterContractDigest: request.adapterContractDigest,
      projectSessionId: request.projectSessionId,
      runId: request.runId,
      agentId: request.agentId,
      custodyRef,
      checkpoint: currentCheckpoint,
      launchAttestContract: "launch.attest.v1",
    });
    const stagedCapabilityHash = lifecycleDigest({
      projectSessionId: request.projectSessionId,
      runId: request.runId,
      agentId: request.agentId,
      custodyRef,
      pair,
      adapterContractDigest: request.adapterContractDigest,
      providerGeneration,
      principalGeneration,
      bridgeGeneration,
    });
    const acceptance: RotationAcceptance = Object.freeze({
      commandId: request.commandId,
      projectSessionId: request.projectSessionId,
      runId: request.runId,
      custodyRef,
      agentId: request.agentId,
      lifecycle: "suspended",
      phase: "awaiting-boundary",
      providerGeneration: agent.provider.providerGeneration,
      reservedProviderGeneration: providerGeneration,
      reservedPrincipalGeneration: principalGeneration,
      reservedBridgeGeneration: bridgeGeneration,
    });
    const custody: MutableCustody = {
      custodyRef,
      commandId: request.commandId,
      requestDigest,
      projectSessionId: request.projectSessionId,
      runId: request.runId,
      agentId: request.agentId,
      phase: "awaiting-boundary",
      disposition: null,
      pair,
      providerOperation: request.operation,
      adapterContractDigest: request.adapterContractDigest,
      stagedCapabilityHash,
      sourceProvider: cloneProvider(agent.provider),
      sourceBinding: cloneSourceBinding(agent.sourceBinding),
      sourcePrincipalGeneration: agent.principalGeneration,
      sourceBridgeGeneration: agent.bridgeGeneration,
      reservedProviderGeneration: providerGeneration,
      reservedPrincipalGeneration: principalGeneration,
      reservedBridgeGeneration: bridgeGeneration,
      checkpoint: currentCheckpoint,
      checkpointValidation: null,
      candidate: null,
      launchChallenge,
      recoveryFromLossId: null,
      recoveryAttemptId: null,
      admissionKind: "self-request",
      requestAction: request.action,
      admissionCheckpoint: { ...admissionCheckpoint },
      sourceWriteRevision: agent.writeRevision,
      sourceAuthorityRevision: agent.authorityRevision,
      changedWriteCustodyIds,
      callerTurnId: callerTurns[0]?.turnId ?? null,
      history: ["awaiting-boundary"],
      acceptance,
      reviewDecision: null,
      terminalEvidence: null,
    };
    this.#custodies.set(custodyRef, custody);
    this.#commands.set(commandKey, custodyRef);
    this.#actionOwners.set(actionKey(pair), custodyRef);
    return acceptance;
  }

  inspectAgent(projectSessionId: string, runId: string, agentId: string): LifecycleAgentView {
    const agent = this.#agent(projectSessionId, runId, agentId);
    return {
      projectSessionId: agent.projectSessionId,
      runId: agent.runId,
      agentId: agent.agentId,
      role: agent.role,
      lifecycle: agent.lifecycle,
      provider: cloneProvider(agent.provider),
      sourceBinding: cloneSourceBinding(agent.sourceBinding),
      principalGeneration: agent.principalGeneration,
      bridgeGeneration: agent.bridgeGeneration,
      recoveryCheckpointState: agent.recoveryCheckpointState,
      recoveryCheckpointRef: agent.recoveryCheckpointRef,
      claimsFrozen: agent.claimsFrozen,
      turns: agent.turns.map((turn) => ({ ...turn })),
      writes: agent.writes.map((write) => ({ ...write })),
      deliveries: agent.deliveries.map((delivery) => ({ ...delivery })),
      taskOwnerLeases: agent.taskOwnerLeases.map((lease) => ({ ...lease })),
      barriers: agent.barriers.map((barrier) => ({ ...barrier })),
      memberships: agent.memberships.map((membership) => ({ ...membership })),
      messageWatermark: agent.messageWatermark,
      deliveryWatermark: agent.deliveryWatermark,
      membershipWatermark: agent.membershipWatermark,
      archivalPlan: agent.archivalPlan === null ? null : structuredClone(agent.archivalPlan),
      sourceCapabilityRevoked: agent.sourceCapabilityRevoked,
      principalRevoked: agent.principalRevoked,
      bridgeRevoked: agent.bridgeRevoked,
    };
  }

  inspectCustody(projectSessionId: string, runId: string, custodyRef: string): LifecycleCustodyView {
    const custody = this.#custody(projectSessionId, runId, custodyRef);
    return {
      custodyRef: custody.custodyRef,
      projectSessionId: custody.projectSessionId,
      runId: custody.runId,
      commandId: custody.commandId,
      agentId: custody.agentId,
      phase: custody.phase,
      disposition: custody.disposition,
      pair: { ...custody.pair },
      providerOperation: custody.providerOperation,
      adapterContractDigest: custody.adapterContractDigest,
      stagedCapabilityHash: custody.stagedCapabilityHash,
      sourceBinding: cloneSourceBinding(custody.sourceBinding),
      recoveryFromLossId: custody.recoveryFromLossId,
      recoveryAttemptId: custody.recoveryAttemptId,
      admissionKind: custody.admissionKind,
      requestAction: custody.requestAction,
      admissionCheckpoint: { ...custody.admissionCheckpoint },
      changedWriteCustodyIds: [...custody.changedWriteCustodyIds],
      callerTurnId: custody.callerTurnId,
      launchChallenge: custody.launchChallenge as LifecycleDigest,
      history: [...custody.history],
      checkpoint: { ...custody.checkpoint },
      checkpointValidation: custody.checkpointValidation === null
        ? null
        : structuredClone(custody.checkpointValidation),
      candidate: custody.candidate === null ? null : {
        ...custody.candidate,
        provider: { ...custody.candidate.provider },
        launchAttestation: { ...custody.candidate.launchAttestation },
      },
      reviewDecision: custody.reviewDecision === null ? null : structuredClone(custody.reviewDecision),
      terminalEvidence: custody.terminalEvidence === null ? null : structuredClone(custody.terminalEvidence),
    };
  }

  inspectHighWater(projectSessionId: string, runId: string, agentId: string): LifecycleHighWaterView {
    const agent = this.#agent(projectSessionId, runId, agentId);
    const key = agentKey(agent.projectSessionId, agent.runId, agent.agentId);
    return {
      providerGeneration: this.#providerHighWater.get(key) ?? 0,
      principalGeneration: this.#principalHighWater.get(key) ?? 0,
      bridgeGeneration: this.#bridgeHighWater.get(bridgeKey(agent.projectSessionId, agent.runId, agent.bridgeOwnerId)) ?? 0,
    };
  }

  markTurnTerminal(_projectSessionId: string, _runId: string, _agentId: string, _turnId: string): readonly LifecycleCustodyView[] {
    const agent = this.#agent(_projectSessionId, _runId, _agentId);
    const turnIndex = agent.turns.findIndex((turn) => turn.turnId === _turnId);
    if (turnIndex < 0) throw new LifecycleDomainError("TURN_NOT_FOUND", `unknown turn ${_turnId}`);
    const turn = agent.turns[turnIndex] as LifecycleTurn;
    if (!terminalTurn(turn)) {
      agent.turns[turnIndex] = { ...turn, state: "terminal" };
    }
    const transitioned: LifecycleCustodyView[] = [];
    for (const custody of this.#custodies.values()) {
      if (custody.projectSessionId !== agent.projectSessionId || custody.agentId !== agent.agentId || custody.runId !== agent.runId || custody.phase !== "awaiting-boundary") continue;
      const predecessorLive = agent.turns.some((candidate) =>
        candidate.providerGeneration === custody.sourceProvider.providerGeneration && !terminalTurn(candidate)
      );
      if (predecessorLive) continue;
      custody.phase = "prepared";
      custody.history.push("prepared");
      this.#ports.fault?.hit("after-prepare", custody.custodyRef);
      transitioned.push(this.inspectCustody(custody.projectSessionId, custody.runId, custody.custodyRef));
    }
    return transitioned;
  }

  openTurn(_projectSessionId: string, _runId: string, _agentId: string, _turn: LifecycleTurn): LifecycleTurn {
    const agent = this.#agent(_projectSessionId, _runId, _agentId);
    if (agent.lifecycle !== "ready") throw new LifecycleDomainError("LIFECYCLE_NOT_READY", "agent cannot open a turn");
    if (_turn.state !== "active") throw new LifecycleDomainError("TURN_INVALID", "a new turn must be active");
    if (
      _turn.providerGeneration !== agent.provider.providerGeneration ||
      _turn.principalGeneration !== agent.principalGeneration ||
      _turn.bridgeGeneration !== agent.bridgeGeneration
    ) throw new LifecycleDomainError("TURN_CONTEXT_MISMATCH", "new turn does not match current custody");
    if (agent.turns.some((turn) => turn.turnId === _turn.turnId)) {
      throw new LifecycleDomainError("TURN_CONFLICT", "turn ID is already present");
    }
    if (agent.turns.some((turn) => !terminalTurn(turn))) {
      throw new LifecycleDomainError("TURN_ALREADY_ACTIVE", "agent already has a live turn");
    }
    const stored = { ..._turn };
    agent.turns.push(stored);
    return { ...stored };
  }

  enqueueDelivery(_projectSessionId: string, _runId: string, _agentId: string, _delivery: LifecycleDelivery): LifecycleDelivery {
    const agent = this.#agent(_projectSessionId, _runId, _agentId);
    const existing = agent.deliveries.find((delivery) => delivery.deliveryId === _delivery.deliveryId);
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(_delivery)) {
        throw new LifecycleDomainError("DELIVERY_CONFLICT", "delivery ID was reused with different content");
      }
      return { ...existing };
    }
    if (_delivery.state !== "ready" || _delivery.claimGeneration !== null) {
      throw new LifecycleDomainError("DELIVERY_NOT_SUCCESSOR_PENDING", "new lifecycle delivery must be ready and unclaimed");
    }
    if (!Number.isSafeInteger(_delivery.sequence) || _delivery.sequence < 0) {
      throw new LifecycleDomainError("DELIVERY_INVALID", "delivery sequence must be a nonnegative safe integer");
    }
    const duplicateSequence = agent.deliveries.some((delivery) => delivery.sequence === _delivery.sequence);
    if (duplicateSequence) throw new LifecycleDomainError("DELIVERY_CONFLICT", "delivery sequence is already occupied");
    const stored = { ..._delivery };
    agent.deliveries.push(stored);
    return { ...stored };
  }

  claimDelivery(_projectSessionId: string, _runId: string, _agentId: string, _deliveryId: string, _providerGeneration: number): LifecycleDelivery {
    const agent = this.#agent(_projectSessionId, _runId, _agentId);
    if (agent.claimsFrozen) {
      throw new LifecycleDomainError("DELIVERY_CLAIMS_FROZEN", "delivery claims are frozen during lifecycle custody");
    }
    if (_providerGeneration !== agent.provider.providerGeneration) {
      throw new LifecycleDomainError("CLAIM_GENERATION_MISMATCH", "delivery claim must use the current provider generation");
    }
    const index = agent.deliveries.findIndex((delivery) => delivery.deliveryId === _deliveryId);
    if (index < 0) throw new LifecycleDomainError("DELIVERY_NOT_FOUND", `unknown delivery ${_deliveryId}`);
    const delivery = agent.deliveries[index] as LifecycleDelivery;
    if (delivery.state === "claimed" && delivery.claimGeneration === _providerGeneration) return { ...delivery };
    if (delivery.state !== "ready" || delivery.claimGeneration !== null) {
      throw new LifecycleDomainError("DELIVERY_NOT_CLAIMABLE", "delivery is not ready for a successor claim");
    }
    const claimed: LifecycleDelivery = { ...delivery, state: "claimed", claimGeneration: _providerGeneration };
    agent.deliveries[index] = claimed;
    agent.mailboxRevision += 1;
    return { ...claimed };
  }

  acknowledgeDelivery(_projectSessionId: string, _runId: string, _agentId: string, _deliveryId: string, _providerGeneration: number): LifecycleDelivery {
    const agent = this.#agent(_projectSessionId, _runId, _agentId);
    if (agent.claimsFrozen) {
      throw new LifecycleDomainError("DELIVERY_ACKS_FROZEN", "delivery acknowledgements are frozen during lifecycle custody");
    }
    if (_providerGeneration !== agent.provider.providerGeneration) {
      throw new LifecycleDomainError("ACK_GENERATION_MISMATCH", "delivery acknowledgement must use the current provider generation");
    }
    const index = agent.deliveries.findIndex((delivery) => delivery.deliveryId === _deliveryId);
    if (index < 0) throw new LifecycleDomainError("DELIVERY_NOT_FOUND", `unknown delivery ${_deliveryId}`);
    const delivery = agent.deliveries[index] as LifecycleDelivery;
    if (delivery.state === "consumed") return { ...delivery };
    if (
      (delivery.state !== "claimed" && delivery.state !== "provider-accepted") ||
      delivery.claimGeneration !== _providerGeneration
    ) throw new LifecycleDomainError("DELIVERY_NOT_ACKNOWLEDGEABLE", "delivery is not held by the current provider generation");
    const consumed: LifecycleDelivery = { ...delivery, state: "consumed" };
    agent.deliveries[index] = consumed;
    agent.mailboxRevision += 1;
    return { ...consumed };
  }

  authorizeOperation(_projectSessionId: string, _runId: string, _agentId: string, _principalGeneration: number, _operation: string): boolean {
    const agent = this.#agent(_projectSessionId, _runId, _agentId);
    const custody = [...this.#custodies.values()].find((candidate) =>
      candidate.projectSessionId === agent.projectSessionId && candidate.runId === agent.runId && candidate.agentId === agent.agentId && candidate.phase !== "finalized"
    );
    if (custody !== undefined) {
      if (_principalGeneration === custody.sourcePrincipalGeneration) {
        return _operation === "lifecycle.request" || _operation === "lifecycle.read";
      }
      if (_principalGeneration === custody.reservedPrincipalGeneration) return _operation === "launch.attest";
      return false;
    }
    if (agent.lifecycle === "recovery-required") {
      return _principalGeneration === agent.principalGeneration && _operation === "lifecycle.read";
    }
    return agent.lifecycle === "ready" && _principalGeneration === agent.principalGeneration;
  }

  async driveRotation(_projectSessionId: string, _runId: string, _custodyRef: string): Promise<LifecycleCustodyView> {
    const custody = this.#custody(_projectSessionId, _runId, _custodyRef);
    if (custody.phase === "finalized") return this.inspectCustody(_projectSessionId, _runId, _custodyRef);
    const agent = this.#agent(custody.projectSessionId, custody.runId, custody.agentId);
    if (custody.phase === "awaiting-boundary") {
      const predecessorLive = agent.turns.some((turn) => !terminalTurn(turn));
      if (custody.callerTurnId !== null || predecessorLive) {
        throw new LifecycleDomainError("PREDECESSOR_TURN_ACTIVE", "replacement I/O cannot start before every predecessor turn terminates");
      }
      custody.phase = "prepared";
      custody.history.push("prepared");
      this.#ports.fault?.hit("after-prepare", custody.custodyRef);
    }
    if (custody.phase === "prepared") {
      if (!this.#custodySourceStillCurrent(custody, agent)) {
        return this.#finalize(
          custody,
          agent,
          "superseded",
          "source-drift-before-dispatch",
          "ready",
          lifecycleDigest({ source: custody.checkpoint, current: checkpointFor(agent) }),
        );
      }
      custody.phase = "dispatched";
      custody.history.push("dispatched");
      this.#ports.fault?.hit("after-dispatch-before-effect", custody.custodyRef);
      const observation = await this.#ports.provider.dispatchReplacement({
        pair: { ...custody.pair },
        operation: custody.providerOperation,
        adapterContractDigest: custody.adapterContractDigest,
        stagedCapabilityHash: custody.stagedCapabilityHash,
        custodyRef: custody.custodyRef,
        projectSessionId: custody.projectSessionId,
        runId: custody.runId,
        agentId: custody.agentId,
        sourceProvider: cloneProvider(custody.sourceProvider),
        checkpoint: { ...custody.checkpoint },
        launchChallenge: custody.launchChallenge,
        reservedProviderGeneration: custody.reservedProviderGeneration,
        reservedPrincipalGeneration: custody.reservedPrincipalGeneration,
        reservedBridgeGeneration: custody.reservedBridgeGeneration,
      });
      this.#ports.fault?.hit("after-provider-effect-before-ack", custody.custodyRef);
      return this.#acceptObservation(custody, agent, observation);
    }
    if (custody.phase === "dispatched" || custody.phase === "accepted" || custody.phase === "ambiguous") {
      const observation = await this.#ports.provider.lookupReplacement({ ...custody.pair });
      return this.#acceptObservation(custody, agent, observation);
    }
    if (custody.phase === "provider-terminal" || custody.phase === "committing") {
      return this.#commit(custody, agent);
    }
    return this.inspectCustody(_projectSessionId, _runId, _custodyRef);
  }

  advanceRevision(_projectSessionId: string, _runId: string, _agentId: string, _kind: LifecycleRevisionKind): LifecycleCheckpoint {
    const agent = this.#agent(_projectSessionId, _runId, _agentId);
    switch (_kind) {
      case "task": agent.taskRevision += 1; break;
      case "mailbox": agent.mailboxRevision += 1; break;
      case "children": agent.childRevision += 1; break;
      case "write": agent.writeRevision += 1; break;
      case "authority": agent.authorityRevision += 1; break;
    }
    return checkpointFor(agent);
  }

  proveNoEffect(_projectSessionId: string, _runId: string, _custodyRef: string, _proof: LifecycleNoEffectProof): LifecycleCustodyView {
    const custody = this.#custody(_projectSessionId, _runId, _custodyRef);
    if (!validDigest(_proof.evidenceDigest)) {
      throw new LifecycleDomainError("ZERO_DISPATCH_PROOF_INVALID", "no-effect evidence requires a SHA-256 digest");
    }
    if (canonicalJson(custody.pair) !== canonicalJson(_proof.pair)) {
      throw new LifecycleDomainError("RECOVERY_ACTION_PAIR_MISMATCH", "no-effect proof crossed its provider action pair");
    }
    if (_proof.dispatchRecorded !== false) {
      throw new LifecycleDomainError("ZERO_DISPATCH_PROOF_REQUIRED", "pre-dispatch resolution requires zero-dispatch proof");
    }
    if (custody.phase === "finalized") {
      if (custody.disposition === "no-effect") return this.inspectCustody(custody.projectSessionId, custody.runId, custody.custodyRef);
      throw new LifecycleDomainError("CUSTODY_FINALIZED", "custody already has a different terminal disposition");
    }
    if (custody.phase !== "awaiting-boundary" && custody.phase !== "prepared") {
      throw new LifecycleDomainError("ZERO_DISPATCH_PROOF_INVALID", "provider-dispatched custody requires provider proof");
    }
    const agent = this.#agent(custody.projectSessionId, custody.runId, custody.agentId);
    this.#audit("lifecycle-no-effect", agent.projectSessionId, agent.runId, agent.agentId, custody.custodyRef, _proof.evidenceDigest);
    return this.#finalize(custody, agent, "no-effect", "pre-dispatch-zero-effect", "ready", _proof.evidenceDigest);
  }

  abandonCustody(_request: LifecycleCustodyAbandonment): LifecycleCustodyView {
    const custody = this.#custody(_request.projectSessionId, _request.runId, _request.custodyRef);
    const agent = this.#agent(custody.projectSessionId, custody.runId, custody.agentId);
    const requestDigest = lifecycleDigest({ operation: "abandon-custody", request: _request });
    const retirementRecordKey = retirementKey("custody", custody.custodyRef);
    const priorRetirement = this.#recoveryRetirements.get(retirementRecordKey);
    if (priorRetirement !== undefined) {
      if (priorRetirement.requestDigest !== requestDigest) {
        throw new LifecycleDomainError("RECOVERY_ABANDON_CONFLICT", "custody abandonment replay changed its closed request");
      }
      return this.inspectCustody(custody.projectSessionId, custody.runId, custody.custodyRef);
    }
    const recoveryIssue = this.#assertAbandonAuthority(
      _request.authority,
      agent.projectSessionId,
      agent.runId,
      agent.agentId,
      custody.custodyRef,
    );
    if (canonicalJson(custody.pair) !== canonicalJson(_request.pair)) {
      throw new LifecycleDomainError("RECOVERY_ACTION_PAIR_MISMATCH", "custody abandonment crossed its provider action pair");
    }
    if (canonicalJson(recoveryIssue.pair) !== canonicalJson(custody.pair)) {
      throw new LifecycleDomainError("RECOVERY_ABANDON_FORBIDDEN", "abandon issue crossed its custody action");
    }
    if (agent.archivalPlan !== null) {
      throw new LifecycleDomainError("RECOVERY_ABANDON_CONFLICT", "archived custody has no matching retirement record");
    }
    const oldTerminalDisposition = custody.phase === "finalized" ? custody.disposition : null;
    if (oldTerminalDisposition !== null &&
      oldTerminalDisposition !== "no-effect" && oldTerminalDisposition !== "superseded" && oldTerminalDisposition !== "quarantined") {
      throw new LifecycleDomainError("CUSTODY_NOT_ABANDONABLE", "only a nonfinal or failed finalized custody may be retired");
    }
    const plan = this.#deriveArchivalPlan(agent, custody.custodyRef);
    this.#assertArchivalExpectation(plan, _request.expectedArchivalPlanDigest, _request.expectedSourceCheckpointDigest);
    if (custody.phase !== "finalized") {
      custody.phase = "finalized";
      custody.disposition = "abandoned";
      custody.history.push("abandoned");
      custody.terminalEvidence = terminalEvidenceFor(
        custody,
        "abandoned",
        _request.authority.directHumanConfirmation.reason,
        _request.authority.directHumanConfirmation.attestationDigest,
      );
    }
    this.#applyArchivalPlan(agent, plan);
    recoveryIssue.status = "consumed";
    this.#audit("lifecycle-custody-abandoned", agent.projectSessionId, agent.runId, agent.agentId, custody.custodyRef, _request.authority.directHumanConfirmation.reason);
    const retirement = retirementWithDigest({
      schemaVersion: 1,
      retirementId: recoveryIssue.issueId,
      projectSessionId: agent.projectSessionId,
      runId: agent.runId,
      agentId: agent.agentId,
      issueId: recoveryIssue.issueId,
      recoverySourceKind: "custody",
      recoverySourceRef: custody.custodyRef,
      abandonKind: oldTerminalDisposition === null ? "nonfinal-custody" : "finalized-custody",
      actionPair: { ...custody.pair },
      oldTerminalDisposition,
      abandonReason: _request.authority.directHumanConfirmation.reason,
      consequenceDigest: plan.planDigest,
      sourceCheckpointDigest: plan.sourceCheckpointDigest,
      directHumanAttestationDigest: _request.authority.directHumanConfirmation.attestationDigest,
      requestDigest,
    });
    this.#recoveryRetirements.set(retirementRecordKey, retirement);
    return this.inspectCustody(custody.projectSessionId, custody.runId, custody.custodyRef);
  }

  observeContext(_observation: ContextObservation): ContextObservationResult {
    if (
      !hasExactKeys(_observation, [
        "sourceEventId", "projectSessionId", "runId", "agentId",
        "providerGeneration", "contextRevision", "evidenceDigest",
      ]) ||
      typeof _observation.sourceEventId !== "string" || _observation.sourceEventId.length === 0 ||
      typeof _observation.projectSessionId !== "string" || _observation.projectSessionId.length === 0 ||
      typeof _observation.runId !== "string" || _observation.runId.length === 0 ||
      typeof _observation.agentId !== "string" || _observation.agentId.length === 0 ||
      !Number.isSafeInteger(_observation.providerGeneration) ||
      _observation.providerGeneration < 1 ||
      !Number.isSafeInteger(_observation.contextRevision) ||
      _observation.contextRevision < 0 ||
      !validDigest(_observation.evidenceDigest)
    ) {
      throw new LifecycleDomainError(
        "INVALID_CONTEXT_OBSERVATION",
        "providerGeneration must be positive and contextRevision must be nonnegative safe integers",
      );
    }
    const agent = this.#agent(_observation.projectSessionId, _observation.runId, _observation.agentId);
    const eventKey = `${_observation.projectSessionId}\u0000${_observation.runId}\u0000${_observation.agentId}\u0000${_observation.sourceEventId}`;
    const observationDigest = lifecycleDigest(_observation);
    const recorded = this.#contextEvents.get(eventKey);
    if (recorded !== undefined) {
      if (recorded.observationDigest !== observationDigest) {
        throw new LifecycleDomainError("CONTEXT_EVENT_CONFLICT", "source event ID was reused with different evidence");
      }
      return recorded.result;
    }
    const record = (classification: ContextObservationResult["classification"], lossId: string | null, kind: string, detail: string) => {
      const audit = this.#audit(kind, agent.projectSessionId, agent.runId, agent.agentId, _observation.sourceEventId, detail);
      const result = Object.freeze({ classification, lossId, audit: Object.freeze({ ...audit }) });
      this.#contextEvents.set(eventKey, {
        observation: structuredClone(_observation),
        observationDigest,
        result,
      });
      return result;
    };
    const currentGeneration = agent.provider.providerGeneration;
    const currentRevision = agent.provider.contextRevision;
    const identityHighWater = this.#providerHighWater.get(
      agentKey(agent.projectSessionId, agent.runId, agent.agentId),
    ) ?? currentGeneration;
    if (_observation.providerGeneration > currentGeneration &&
      _observation.providerGeneration <= identityHighWater) {
      throw new LifecycleDomainError(
        "CONTEXT_GENERATION_REUSED",
        "provider telemetry cannot resurrect a generation spent by lifecycle custody",
      );
    }
    if (
      _observation.providerGeneration < currentGeneration ||
      (_observation.providerGeneration === currentGeneration && _observation.contextRevision < currentRevision)
    ) {
      return record("reordered-observation", null, "context-observation-reordered", "lower-high-water");
    }
    if (_observation.providerGeneration === currentGeneration && _observation.contextRevision === currentRevision) {
      if (_observation.evidenceDigest !== agent.provider.evidenceDigest) {
        throw new LifecycleDomainError("CONTEXT_EVIDENCE_CONFLICT", "same provider coordinate carried divergent evidence");
      }
      return record("replay", null, "context-observation-replay", "current-context-replay");
    }
    const activeCustody = [...this.#custodies.values()].some((custody) =>
      custody.projectSessionId === agent.projectSessionId && custody.runId === agent.runId &&
      custody.agentId === agent.agentId && custody.phase !== "finalized"
    );
    if (activeCustody) {
      throw new LifecycleDomainError("LIFECYCLE_CUSTODY_ACTIVE", "context observation must serialize after active lifecycle custody");
    }
    const activeLoss = [...this.#losses.values()].some((loss) =>
      loss.projectSessionId === agent.projectSessionId && loss.runId === agent.runId &&
      loss.agentId === agent.agentId && (loss.state === "open" || loss.state === "recovery-in-progress")
    );
    if (activeLoss) {
      throw new LifecycleDomainError("GENERATION_LOSS_ACTIVE", "context observation must serialize after active generation loss");
    }
    const cause: GenerationLossView["cause"] = _observation.providerGeneration > currentGeneration
      ? "generation-advance"
      : "context-advance";
    const oldProvider = cloneProvider(agent.provider);
    const sourceBinding = cloneSourceBinding(agent.sourceBinding);
    const sourcePrincipalGeneration = agent.principalGeneration;
    const sourceBridgeGeneration = agent.bridgeGeneration;
    const sourceBridgeOwnerId = agent.bridgeOwnerId;
    const sourceRole = agent.role;
    const checkpoint = checkpointFor(agent);
    const checkpointWriteRevision = agent.writeRevision;
    const sourceAuthorityRevision = agent.authorityRevision;
    const checkpointStillValidated = agent.recoveryCheckpointState === "last-validated" &&
      agent.recoveryCheckpointDigest === checkpoint.checkpointDigest;
    if (agent.recoveryCheckpointState === "last-validated" && !checkpointStillValidated) {
      agent.recoveryCheckpointState = "invalid";
      agent.recoveryCheckpointRef = null;
      agent.recoveryCheckpointDigest = null;
      agent.recoveryCheckpointValidationRevision = null;
      agent.recoveryCheckpointValidationEvidenceDigest = null;
    }
    const newProvider: ProviderContext = {
      ...oldProvider,
      providerGeneration: _observation.providerGeneration,
      contextRevision: _observation.contextRevision,
      evidenceDigest: _observation.evidenceDigest,
    };
    agent.provider = newProvider;
    agent.lifecycle = "recovery-required";
    agent.claimsFrozen = true;
    agent.sourceCapabilityRevoked = true;
    agent.bridgeRevoked = true;
    const fencedWriteCustodyIds = agent.writes
      .filter((write) => write.state === "active" || write.state === "quarantined")
      .map((write) => write.custodyId)
      .sort();
    const fencedWrites = agent.writes.map((write) =>
      write.state === "active" || write.state === "quarantined"
        ? { ...write, state: "lifecycle-quarantined" as const }
        : write
    );
    if (canonicalJson(fencedWrites) !== canonicalJson(agent.writes)) agent.writeRevision += 1;
    agent.writes = fencedWrites;
    const sourceWriteRevision = agent.writeRevision;
    const fencedCheckpoint = checkpointFor(agent);
    agent.turns = agent.turns.map((turn) => terminalTurn(turn) ? turn : { ...turn, state: "quarantined" });
    const key = agentKey(agent.projectSessionId, agent.runId, agent.agentId);
    this.#providerHighWater.set(
      key,
      Math.max(this.#providerHighWater.get(key) ?? 0, _observation.providerGeneration),
    );
    const lossId = `loss:${_observation.projectSessionId}:${_observation.runId}:${_observation.agentId}:${_observation.sourceEventId}`;
    this.#losses.set(lossId, {
      lossId,
      projectSessionId: _observation.projectSessionId,
      runId: _observation.runId,
      agentId: _observation.agentId,
      cause,
      state: "open",
      actionPair: null,
      reviewDecision: null,
      activeRecoveryAttemptId: null,
      activeRecoveryCustodyRef: null,
      oldProvider,
      newProvider: cloneProvider(newProvider),
      sourceBinding,
      sourcePrincipalGeneration,
      sourceBridgeGeneration,
      sourceBridgeOwnerId,
      sourceRole,
      checkpointState: agent.recoveryCheckpointState,
      checkpointRef: agent.recoveryCheckpointRef,
      checkpointDigest: agent.recoveryCheckpointState === "last-validated"
        ? checkpoint.checkpointDigest
        : null,
      checkpointValidationRevision: agent.recoveryCheckpointValidationRevision,
      checkpointValidationEvidenceDigest: agent.recoveryCheckpointValidationEvidenceDigest,
      checkpoint,
      fencedCheckpoint,
      checkpointWriteRevision,
      sourceWriteRevision,
      sourceAuthorityRevision,
      fencedWriteCustodyIds,
      lossEvidenceDigest: _observation.evidenceDigest,
    });
    return record(cause, lossId, "context-observation-advanced", cause);
  }

  inspectLoss(_projectSessionId: string, _runId: string, _lossId: string): GenerationLossView {
    const loss = this.#losses.get(_lossId);
    if (loss === undefined) throw new LifecycleDomainError("LOSS_NOT_FOUND", `unknown generation loss ${_lossId}`);
    if (loss.projectSessionId !== _projectSessionId || loss.runId !== _runId) throw new LifecycleDomainError("RUN_SCOPE_MISMATCH", "generation loss belongs to another project/run");
    return {
      lossId: loss.lossId,
      projectSessionId: loss.projectSessionId,
      runId: loss.runId,
      agentId: loss.agentId,
      cause: loss.cause,
      state: loss.state,
      actionPair: loss.actionPair === null ? null : { ...loss.actionPair },
      reviewDecision: loss.reviewDecision === null ? null : structuredClone(loss.reviewDecision),
      activeRecoveryAttemptId: loss.activeRecoveryAttemptId,
      activeRecoveryCustodyRef: loss.activeRecoveryCustodyRef,
      oldProvider: cloneProvider(loss.oldProvider),
      newProvider: cloneProvider(loss.newProvider),
      sourceBinding: cloneSourceBinding(loss.sourceBinding),
      sourcePrincipalGeneration: loss.sourcePrincipalGeneration,
      sourceBridgeGeneration: loss.sourceBridgeGeneration,
      sourceBridgeOwnerId: loss.sourceBridgeOwnerId,
      sourceRole: loss.sourceRole,
      checkpointState: loss.checkpointState,
      checkpointRef: loss.checkpointRef,
      checkpointDigest: loss.checkpointDigest,
      checkpointValidationRevision: loss.checkpointValidationRevision,
      checkpointValidationEvidenceDigest: loss.checkpointValidationEvidenceDigest,
      checkpoint: { ...loss.checkpoint },
      fencedCheckpoint: { ...loss.fencedCheckpoint },
      checkpointWriteRevision: loss.checkpointWriteRevision,
      sourceWriteRevision: loss.sourceWriteRevision,
      sourceAuthorityRevision: loss.sourceAuthorityRevision,
      fencedWriteCustodyIds: [...loss.fencedWriteCustodyIds],
      lossEvidenceDigest: loss.lossEvidenceDigest,
    };
  }

  inspectRecoveryIssue(issueId: string): LifecycleRecoveryIssue {
    const issue = this.#recoveryIssues.get(issueId);
    if (issue === undefined) throw new LifecycleDomainError("RECOVERY_ISSUE_NOT_FOUND", `unknown recovery issue ${issueId}`);
    return structuredClone(issue);
  }

  audits(_projectSessionId: string, _runId: string): readonly LifecycleAuditEvent[] {
    return this.#audits.filter((event) => event.projectSessionId === _projectSessionId && event.runId === _runId).map((event) => ({ ...event }));
  }

  prepareFreshRotation(_request: FreshRotationPrepareRequest): FreshRotationPreparation {
    if (!hasExactKeys(_request, [
      "projectSessionId", "runId", "lossId", "issueId", "capability", "pair",
      "adapterContractDigest", "operation", "checkpoint", "checkpointArtifactRef",
    ])) {
      throw new LifecycleDomainError("FRESH_RECOVERY_ISSUE_INVALID", "fresh rotation requires one exact issued capability");
    }
    const loss = this.#loss(_request.projectSessionId, _request.runId, _request.lossId);
    const existing = this.#freshRotations.get(_request.issueId);
    if (existing !== undefined) {
      const exactReplay = existing.projectSessionId === _request.projectSessionId &&
        existing.runId === _request.runId && existing.lossId === _request.lossId &&
        typeof _request.capability === "string" && lifecycleDigest(_request.capability) === existing.issueCapabilityHash &&
        canonicalJson(existing.pair) === canonicalJson(_request.pair) &&
        exactCheckpoint(existing.checkpoint, _request.checkpoint) &&
        existing.checkpointValidation.checkpointRef === _request.checkpointArtifactRef &&
        existing.adapterContractDigest === _request.adapterContractDigest && existing.operation === _request.operation;
      if (!exactReplay) {
        throw new LifecycleDomainError("FRESH_ROTATE_PREVIEW_CONFLICT", "fresh rotation preview changed immutable input");
      }
      return existing;
    }
    if (loss.state !== "open") throw new LifecycleDomainError("LOSS_NOT_OPEN", "generation loss is not direct-open");
    if (!validActionPair(_request.pair) || !validDigest(_request.adapterContractDigest) || _request.operation.length === 0) {
      throw new LifecycleDomainError("RECOVERY_ACTION_PAIR_INVALID", "fresh rotation requires the closed canonical action pair");
    }
    if (this.#actionOwners.has(actionKey(_request.pair))) {
      throw new LifecycleDomainError("ACTION_PAIR_CONFLICT", "fresh rotation action pair is already allocated");
    }
    const agent = this.#agent(loss.projectSessionId, loss.runId, loss.agentId);
    if (!this.#lossSourceStillCurrent(loss, agent)) {
      throw new LifecycleDomainError("CHECKPOINT_MISMATCH", "fresh rotation loss-time source is no longer current");
    }
    if (!exactCheckpoint(loss.checkpoint, _request.checkpoint)) {
      throw new LifecycleDomainError("CHECKPOINT_MISMATCH", "fresh rotation checkpoint is not the exact stored loss-time vector");
    }
    const issue = this.#recoveryIssues.get(_request.issueId);
    const verifier = this.#ports.recoveryAuthority;
    const now = verifier?.nowMs();
    if (issue === undefined || verifier === undefined || issue.status !== "active" || !verifier.verifyIssue(issue) ||
      now === undefined || !Number.isSafeInteger(now) || now < issue.issuedAtMs || now >= issue.expiresAtMs ||
      issue.path !== "fresh-rotate" || lifecycleDigest(_request.capability) !== issue.capabilityHash ||
      issue.projectSessionId !== loss.projectSessionId || issue.runId !== loss.runId || issue.agentId !== loss.agentId ||
      issue.sessionGeneration !== loss.sourceBinding.projectSessionGeneration || issue.recoverySourceRef !== loss.lossId ||
      canonicalJson(issue.pair) !== canonicalJson(_request.pair) || issue.adapterContractDigest !== _request.adapterContractDigest ||
      issue.operation !== _request.operation || issue.checkpointDigest !== loss.checkpoint.checkpointDigest) {
      throw new LifecycleDomainError("FRESH_RECOVERY_ISSUE_INVALID", "fresh rotation issue is untrusted, stale, crossed or expired");
    }
    const checkpointValidation = this.#bindRecoveryCheckpoint(
      loss,
      _request.checkpoint,
      _request.checkpointArtifactRef,
      issue,
    );
    if (checkpointValidation === null) {
      throw new LifecycleDomainError(
        "RECOVERY_CHECKPOINT_VALIDATION_REQUIRED",
        "fresh rotation requires one exact gate-bound daemon-valid checkpoint artifact",
      );
    }
    const key = agentKey(agent.projectSessionId, agent.runId, agent.agentId);
    const providerGeneration = (this.#providerHighWater.get(key) ?? 0) + 1;
    const principalGeneration = (this.#principalHighWater.get(key) ?? 0) + 1;
    const ownerKey = bridgeKey(agent.projectSessionId, agent.runId, agent.bridgeOwnerId);
    const bridgeGeneration = (this.#bridgeHighWater.get(ownerKey) ?? 0) + 1;
    positiveInteger(providerGeneration, "reservedProviderGeneration");
    positiveInteger(principalGeneration, "reservedPrincipalGeneration");
    positiveInteger(bridgeGeneration, "reservedBridgeGeneration");
    const preparation: MutableFreshRotation = Object.freeze({
      attemptId: issue.issueId,
      issueId: issue.issueId,
      issueCapabilityHash: issue.capabilityHash,
      lossId: loss.lossId,
      projectSessionId: loss.projectSessionId,
      runId: loss.runId,
      agentId: loss.agentId,
      pair: Object.freeze({ ..._request.pair }),
      checkpoint: Object.freeze({ ...loss.checkpoint }),
      checkpointValidation,
      adapterContractDigest: _request.adapterContractDigest,
      operation: _request.operation,
      reservedProviderGeneration: providerGeneration,
      reservedPrincipalGeneration: principalGeneration,
      reservedBridgeGeneration: bridgeGeneration,
    });
    this.#freshRotations.set(issue.issueId, preparation);
    return preparation;
  }

  commitFreshRotation(_request: FreshRotationCommitRequest): RotationAcceptance {
    if (!hasExactKeys(_request, ["projectSessionId", "runId", "lossId", "pair", "attemptId"])) {
      throw new LifecycleDomainError("FRESH_ROTATE_REPLAY_CONFLICT", "fresh rotation Commit requires its exact attempt identity");
    }
    const loss = this.#loss(_request.projectSessionId, _request.runId, _request.lossId);
    const preparation = this.#freshRotations.get(_request.attemptId);
    if (preparation === undefined) throw new LifecycleDomainError("FRESH_ROTATE_NOT_PREVIEWED", "fresh rotation has not been previewed");
    if (preparation.lossId !== loss.lossId || canonicalJson(_request.pair) !== canonicalJson(preparation.pair)) {
      throw new LifecycleDomainError("RECOVERY_ACTION_PAIR_MISMATCH", "fresh rotation commit requires its exact action pair");
    }
    const replayDigest = lifecycleDigest({ admissionKind: "fresh-recovery", request: _request });
    const prior = this.#freshRotationCommitDigests.get(_request.attemptId);
    if (prior !== undefined) {
      const priorCustody = this.#custodies.get(prior.custodyRef);
      if (prior.digest !== replayDigest || priorCustody === undefined ||
        priorCustody.recoveryAttemptId !== _request.attemptId) {
        throw new LifecycleDomainError("FRESH_ROTATE_REPLAY_CONFLICT", "fresh rotation Commit changed immutable input");
      }
      return priorCustody.acceptance;
    }
    if (loss.state !== "open") throw new LifecycleDomainError("LOSS_NOT_OPEN", "generation loss is not open for fresh rotation");
    const agent = this.#agent(loss.projectSessionId, loss.runId, loss.agentId);
    if (agent.turns.some((turn) => !terminalTurn(turn))) {
      throw new LifecycleDomainError("PREDECESSOR_TURN_ACTIVE", "fresh rotation Commit requires every predecessor turn terminal");
    }
    const key = agentKey(agent.projectSessionId, agent.runId, agent.agentId);
    const ownerKey = bridgeKey(agent.projectSessionId, agent.runId, agent.bridgeOwnerId);
    if ((this.#providerHighWater.get(key) ?? 0) + 1 !== preparation.reservedProviderGeneration ||
      (this.#principalHighWater.get(key) ?? 0) + 1 !== preparation.reservedPrincipalGeneration ||
      (this.#bridgeHighWater.get(ownerKey) ?? 0) + 1 !== preparation.reservedBridgeGeneration) {
      throw new LifecycleDomainError("FRESH_ROTATE_PREVIEW_STALE", "fresh rotation high-water preview is stale");
    }
    if (this.#actionOwners.has(actionKey(preparation.pair))) {
      throw new LifecycleDomainError("ACTION_PAIR_CONFLICT", "fresh rotation action pair is already allocated");
    }
    const issue = this.#recoveryIssues.get(preparation.issueId);
    const verifier = this.#ports.recoveryAuthority;
    const now = verifier?.nowMs();
    if (issue === undefined || verifier === undefined || issue.status !== "active" || !verifier.verifyIssue(issue) ||
      now === undefined || now < issue.issuedAtMs || now >= issue.expiresAtMs ||
      issue.capabilityHash !== preparation.issueCapabilityHash || issue.sessionGeneration !== loss.sourceBinding.projectSessionGeneration ||
      issue.recoverySourceRef !== loss.lossId || issue.checkpointDigest !== preparation.checkpoint.checkpointDigest) {
      throw new LifecycleDomainError("FRESH_RECOVERY_ISSUE_INVALID", "fresh rotation issue is no longer current at Commit");
    }
    if (!this.#recoveryCheckpointBindingAccepted(
      loss,
      preparation.checkpoint,
      preparation.checkpointValidation,
      issue,
    ) || !this.#lossSourceStillCurrent(loss, agent)) {
      throw new LifecycleDomainError("CHECKPOINT_MISMATCH", "fresh rotation loss-time source changed after preview");
    }
    this.#providerHighWater.set(key, preparation.reservedProviderGeneration);
    this.#principalHighWater.set(key, preparation.reservedPrincipalGeneration);
    this.#bridgeHighWater.set(ownerKey, preparation.reservedBridgeGeneration);
    const commandId = `fresh:${preparation.attemptId}:${preparation.pair.actionId}`;
    const custodyRef = `lifecycle:${loss.projectSessionId}:${loss.runId}:${loss.agentId}:${commandId}`;
    const launchChallenge = lifecycleDigest({
      pair: preparation.pair,
      operation: preparation.operation,
      adapterContractDigest: preparation.adapterContractDigest,
      projectSessionId: loss.projectSessionId,
      runId: loss.runId,
      agentId: loss.agentId,
      custodyRef,
      checkpoint: preparation.checkpoint,
      launchAttestContract: "launch.attest.v1",
    });
    const stagedCapabilityHash = lifecycleDigest({
      projectSessionId: loss.projectSessionId,
      runId: loss.runId,
      agentId: loss.agentId,
      custodyRef,
      pair: preparation.pair,
      adapterContractDigest: preparation.adapterContractDigest,
      providerGeneration: preparation.reservedProviderGeneration,
      principalGeneration: preparation.reservedPrincipalGeneration,
      bridgeGeneration: preparation.reservedBridgeGeneration,
    });
    const acceptance: RotationAcceptance = Object.freeze({
      commandId,
      projectSessionId: loss.projectSessionId,
      runId: loss.runId,
      custodyRef,
      agentId: loss.agentId,
      lifecycle: "suspended",
      phase: "awaiting-boundary",
      providerGeneration: agent.provider.providerGeneration,
      reservedProviderGeneration: preparation.reservedProviderGeneration,
      reservedPrincipalGeneration: preparation.reservedPrincipalGeneration,
      reservedBridgeGeneration: preparation.reservedBridgeGeneration,
    });
    const custody: MutableCustody = {
      custodyRef,
      commandId,
      requestDigest: replayDigest,
      projectSessionId: loss.projectSessionId,
      runId: loss.runId,
      agentId: loss.agentId,
      phase: "awaiting-boundary",
      disposition: null,
      pair: { ...preparation.pair },
      providerOperation: preparation.operation,
      adapterContractDigest: preparation.adapterContractDigest,
      stagedCapabilityHash,
      sourceProvider: cloneProvider(loss.newProvider),
      sourceBinding: cloneSourceBinding(loss.sourceBinding),
      sourcePrincipalGeneration: loss.sourcePrincipalGeneration,
      sourceBridgeGeneration: loss.sourceBridgeGeneration,
      reservedProviderGeneration: preparation.reservedProviderGeneration,
      reservedPrincipalGeneration: preparation.reservedPrincipalGeneration,
      reservedBridgeGeneration: preparation.reservedBridgeGeneration,
      checkpoint: { ...preparation.checkpoint },
      checkpointValidation: structuredClone(preparation.checkpointValidation),
      candidate: null,
      launchChallenge,
      recoveryFromLossId: loss.lossId,
      recoveryAttemptId: preparation.attemptId,
      admissionKind: "fresh-recovery",
      requestAction: null,
      admissionCheckpoint: { ...preparation.checkpoint },
      sourceWriteRevision: loss.sourceWriteRevision,
      sourceAuthorityRevision: loss.sourceAuthorityRevision,
      changedWriteCustodyIds: [],
      callerTurnId: null,
      history: ["awaiting-boundary"],
      acceptance,
      reviewDecision: null,
      terminalEvidence: null,
    };
    this.#custodies.set(custodyRef, custody);
    this.#commands.set(`${loss.projectSessionId}\u0000${loss.runId}\u0000${commandId}`, custodyRef);
    this.#actionOwners.set(actionKey(preparation.pair), custodyRef);
    this.#freshRotationCommitDigests.set(preparation.attemptId, {
      attemptId: preparation.attemptId,
      digest: replayDigest,
      custodyRef,
    });
    issue.status = "consumed";
    loss.state = "recovery-in-progress";
    loss.actionPair = { ...preparation.pair };
    loss.activeRecoveryAttemptId = preparation.attemptId;
    loss.activeRecoveryCustodyRef = custodyRef;
    agent.lifecycle = "suspended";
    agent.claimsFrozen = true;
    this.#audit("generation-loss-recovery-started", agent.projectSessionId, agent.runId, agent.agentId, loss.lossId, preparation.pair.actionId);
    return acceptance;
  }

  previewLossAbandonment(projectSessionId: string, runId: string, lossId: string): LifecycleArchivalPlan {
    const loss = this.#loss(projectSessionId, runId, lossId);
    if (loss.state !== "open" && loss.state !== "recovery-in-progress") {
      throw new LifecycleDomainError("LOSS_NOT_ABANDONABLE", "generation loss is not in an abandonable state");
    }
    return this.#deriveArchivalPlan(this.#agent(loss.projectSessionId, loss.runId, loss.agentId), loss.lossId);
  }

  previewCustodyAbandonment(projectSessionId: string, runId: string, custodyRef: string): LifecycleArchivalPlan {
    const custody = this.#custody(projectSessionId, runId, custodyRef);
    return this.#deriveArchivalPlan(
      this.#agent(custody.projectSessionId, custody.runId, custody.agentId),
      custody.custodyRef,
    );
  }

  abandonLoss(_request: AbandonLossRequest): GenerationLossView {
    const loss = this.#loss(_request.projectSessionId, _request.runId, _request.lossId);
    const agent = this.#agent(loss.projectSessionId, loss.runId, loss.agentId);
    const requestDigest = lifecycleDigest({ operation: "abandon-loss", request: _request });
    const retirementRecordKey = retirementKey("generation-loss", loss.lossId);
    const priorRetirement = this.#recoveryRetirements.get(retirementRecordKey);
    if (priorRetirement !== undefined) {
      if (priorRetirement.requestDigest !== requestDigest) {
        throw new LifecycleDomainError("RECOVERY_ABANDON_CONFLICT", "generation-loss abandonment replay changed its closed request");
      }
      return this.inspectLoss(loss.projectSessionId, loss.runId, loss.lossId);
    }
    const recoveryIssue = this.#assertAbandonAuthority(
      _request.authority,
      agent.projectSessionId,
      agent.runId,
      agent.agentId,
      loss.lossId,
    );
    if (loss.state === "recovered-adopted") {
      throw new LifecycleDomainError("LOSS_ALREADY_RECOVERED", "an adopted generation loss cannot be abandoned");
    }
    if (loss.state === "abandoned") {
      throw new LifecycleDomainError("RECOVERY_ABANDON_CONFLICT", "abandoned generation loss has no matching retirement record");
    }
    const abandonKind = loss.state === "open" ? "direct-open" as const : "recovery-attempt" as const;
    if (loss.state === "open" && _request.actionPair !== undefined) {
      throw new LifecycleDomainError("DIRECT_OPEN_ABANDON_REQUIRES_NO_ACTION", "direct-open generation loss has no recovery action pair");
    }
    if (loss.state === "recovery-in-progress" && (
      loss.actionPair === null || _request.actionPair === undefined ||
      canonicalJson(loss.actionPair) !== canonicalJson(_request.actionPair)
    )) {
      throw new LifecycleDomainError("RECOVERY_ACTION_PAIR_MISMATCH", "attempted recovery abandonment requires its exact action pair");
    }
    if (canonicalJson(recoveryIssue.pair) !== canonicalJson(loss.actionPair)) {
      throw new LifecycleDomainError("RECOVERY_ABANDON_FORBIDDEN", "abandon issue crossed its recovery action");
    }
    const plan = this.#deriveArchivalPlan(agent, loss.lossId);
    this.#assertArchivalExpectation(plan, _request.expectedArchivalPlanDigest, _request.expectedSourceCheckpointDigest);
    if (loss.state === "recovery-in-progress") {
      const activeCustody = [...this.#custodies.values()].find((custody) =>
        custody.recoveryFromLossId === loss.lossId && custody.phase !== "finalized"
      );
      if (activeCustody === undefined) {
        throw new LifecycleDomainError("RECOVERY_CUSTODY_MISSING", "attempted recovery abandon requires its active custody");
      }
      activeCustody.phase = "finalized";
      activeCustody.disposition = "abandoned";
      activeCustody.history.push("abandoned");
      activeCustody.terminalEvidence = terminalEvidenceFor(
        activeCustody,
        "abandoned",
        _request.authority.directHumanConfirmation.reason,
        _request.authority.directHumanConfirmation.attestationDigest,
      );
    }
    loss.state = "abandoned";
    loss.activeRecoveryAttemptId = null;
    loss.activeRecoveryCustodyRef = null;
    this.#applyArchivalPlan(agent, plan);
    recoveryIssue.status = "consumed";
    this.#audit(
      "generation-loss-abandoned",
      agent.projectSessionId,
      agent.runId,
      agent.agentId,
      loss.lossId,
      _request.authority.directHumanConfirmation.reason,
    );
    const retirement = retirementWithDigest({
      schemaVersion: 1,
      retirementId: recoveryIssue.issueId,
      projectSessionId: agent.projectSessionId,
      runId: agent.runId,
      agentId: agent.agentId,
      issueId: recoveryIssue.issueId,
      recoverySourceKind: "generation-loss",
      recoverySourceRef: loss.lossId,
      abandonKind,
      actionPair: loss.actionPair === null ? null : { ...loss.actionPair },
      oldTerminalDisposition: null,
      abandonReason: _request.authority.directHumanConfirmation.reason,
      consequenceDigest: plan.planDigest,
      sourceCheckpointDigest: plan.sourceCheckpointDigest,
      directHumanAttestationDigest: _request.authority.directHumanConfirmation.attestationDigest,
      requestDigest,
    });
    this.#recoveryRetirements.set(retirementRecordKey, retirement);
    return this.inspectLoss(loss.projectSessionId, loss.runId, loss.lossId);
  }

  #deriveArchivalPlan(agent: MutableAgent, recoverySourceRef: string): LifecycleArchivalPlan {
    const preimage = {
      schemaVersion: 1 as const,
      projectSessionId: agent.projectSessionId,
      runId: agent.runId,
      agentId: agent.agentId,
      recoverySourceRef,
      turnIds: agent.turns.filter((turn) => !terminalTurn(turn)).map((turn) => turn.turnId).sort(),
      writeCustodyIds: agent.writes.filter((write) => write.state !== "revoked-abandoned").map((write) => write.custodyId).sort(),
      deliveryIds: agent.deliveries
        .filter((delivery) => delivery.state === "ready" || delivery.state === "claimed" || delivery.state === "provider-accepted")
        .map((delivery) => delivery.deliveryId).sort(),
      obligationIds: agent.openWork.map((work) => work.obligationId).sort(),
      taskOwnerLeaseIds: agent.taskOwnerLeases.filter((lease) => lease.state === "active").map((lease) => lease.leaseId).sort(),
      barrierIds: agent.barriers.filter((barrier) => barrier.state === "active").map((barrier) => barrier.barrierId).sort(),
      membershipIds: agent.memberships.filter((membership) => membership.state === "active").map((membership) => membership.membershipId).sort(),
      messageWatermark: agent.messageWatermark + agent.deliveries.filter((delivery) =>
        delivery.state === "ready" || delivery.state === "claimed" || delivery.state === "provider-accepted"
      ).length,
      deliveryWatermark: agent.deliveryWatermark + agent.deliveries.filter((delivery) =>
        delivery.state === "ready" || delivery.state === "claimed" || delivery.state === "provider-accepted"
      ).length,
      membershipWatermark: agent.membershipWatermark + agent.memberships.filter((membership) => membership.state === "active").length,
      parentAgentIds: [...this.#agents.values()]
        .filter((parent) => parent.projectSessionId === agent.projectSessionId && parent.runId === agent.runId && parent.childIds.includes(agent.agentId))
        .map((parent) => parent.agentId).sort(),
      runDisposition: agent.role === "chair" ? "cancel-failure" as const : "preserve" as const,
      chairDisposition: agent.role === "chair" ? "revoked" as const : "not-chair" as const,
      sourceCheckpointDigest: checkpointFor(agent).checkpointDigest,
    };
    return Object.freeze({ ...preimage, planDigest: lifecycleDigest(preimage) });
  }

  #assertAbandonAuthority(
    authority: AbandonLossRequest["authority"] | undefined,
    projectSessionId: string,
    runId: string,
    agentId: string,
    recoverySourceRef: string,
  ): MutableRecoveryIssue {
    if (!hasExactKeys(authority, [
      "operations", "projectSessionId", "runId", "agentId", "sessionGeneration", "authorityDigest",
      "consequentialGateId", "consequentialGateDigest", "consequentialGateRecoverySourceRef", "directHumanConfirmation",
    ])) {
      throw new LifecycleDomainError("RECOVERY_ABANDON_FORBIDDEN", "abandon requires exact cancel authority, gate and direct-human confirmation");
    }
    const typed = authority as unknown as AbandonLossRequest["authority"];
    const authorityPreimage = {
      projectSessionId: typed.projectSessionId,
      runId: typed.runId,
      agentId: typed.agentId,
      sessionGeneration: typed.sessionGeneration,
      operations: typed.operations,
    };
    const agent = this.#agent(projectSessionId, runId, agentId);
    const issue = [...this.#recoveryIssues.values()].find((candidate) =>
      candidate.path === "abandon" && candidate.capabilityHash === typed.authorityDigest &&
      candidate.recoverySourceRef === recoverySourceRef
    );
    const verifier = this.#ports.recoveryAuthority;
    const now = verifier?.nowMs();
    if (
      canonicalJson(typed.operations) !== canonicalJson(["session.cancel"]) || typed.consequentialGateId.length === 0 ||
      typed.projectSessionId !== projectSessionId || typed.runId !== runId || typed.agentId !== agentId ||
      !Number.isSafeInteger(typed.sessionGeneration) || typed.sessionGeneration !== agent.sourceBinding.projectSessionGeneration ||
      typed.authorityDigest !== lifecycleDigest(authorityPreimage) ||
      !validDigest(typed.consequentialGateDigest) ||
      typed.consequentialGateRecoverySourceRef !== recoverySourceRef ||
      !hasExactKeys(typed.directHumanConfirmation, ["reason", "attestationDigest"]) ||
      typed.directHumanConfirmation.reason.trim().length === 0 || !validDigest(typed.directHumanConfirmation.attestationDigest) ||
      issue === undefined || verifier === undefined || issue.status !== "active" || !verifier.verifyIssue(issue) ||
      !verifier.verifyAbandonAuthority(issue, typed) || now === undefined || now < issue.issuedAtMs || now >= issue.expiresAtMs ||
      issue.projectSessionId !== projectSessionId || issue.runId !== runId || issue.agentId !== agentId ||
      issue.sessionGeneration !== agent.sourceBinding.projectSessionGeneration ||
      issue.consequentialGateId !== typed.consequentialGateId || issue.consequentialGateDigest !== typed.consequentialGateDigest ||
      issue.directHumanAttestationDigest !== typed.directHumanConfirmation.attestationDigest ||
      issue.directHumanReasonDigest !== lifecycleDigest(typed.directHumanConfirmation.reason)) {
      throw new LifecycleDomainError("RECOVERY_ABANDON_FORBIDDEN", "abandon requires exact cancel authority, gate and direct-human confirmation");
    }
    return issue;
  }

  #assertArchivalExpectation(plan: LifecycleArchivalPlan, planDigest: LifecycleDigest, checkpointDigest: LifecycleDigest): void {
    if (plan.planDigest !== planDigest || plan.sourceCheckpointDigest !== checkpointDigest) {
      throw new LifecycleDomainError("ARCHIVAL_PLAN_STALE", "canonical archival plan changed before commit");
    }
  }

  #applyArchivalPlan(agent: MutableAgent, plan: LifecycleArchivalPlan): void {
    const turns = new Set(plan.turnIds);
    const writes = new Set(plan.writeCustodyIds);
    const deliveries = new Set(plan.deliveryIds);
    const obligations = new Set(plan.obligationIds);
    const leases = new Set(plan.taskOwnerLeaseIds);
    const barriers = new Set(plan.barrierIds);
    const memberships = new Set(plan.membershipIds);
    agent.turns = agent.turns.map((turn) => turns.has(turn.turnId) ? { ...turn, state: "revoked" } : turn);
    agent.writes = agent.writes.map((write) => writes.has(write.custodyId) ? { ...write, state: "revoked-abandoned" } : write);
    agent.deliveries = agent.deliveries.map((delivery) => deliveries.has(delivery.deliveryId) ? { ...delivery, state: "abandoned" } : delivery);
    agent.openWork = agent.openWork.filter((work) => !obligations.has(work.obligationId));
    agent.taskOwnerLeases = agent.taskOwnerLeases.map((lease) => leases.has(lease.leaseId) ? { ...lease, state: "abandoned" } : lease);
    agent.barriers = agent.barriers.map((barrier) => barriers.has(barrier.barrierId) ? { ...barrier, state: "abandoned-failure" } : barrier);
    agent.memberships = agent.memberships.map((membership) => memberships.has(membership.membershipId) ? { ...membership, state: "abandoned" } : membership);
    agent.messageWatermark = plan.messageWatermark;
    agent.deliveryWatermark = plan.deliveryWatermark;
    agent.membershipWatermark = plan.membershipWatermark;
    agent.lifecycle = "archived";
    agent.claimsFrozen = true;
    agent.sourceCapabilityRevoked = true;
    agent.principalRevoked = true;
    agent.bridgeRevoked = true;
    agent.archivalPlan = structuredClone(plan);
    for (const parentId of plan.parentAgentIds) {
      const parent = this.#agent(agent.projectSessionId, agent.runId, parentId);
      parent.lifecycle = "recovery-required";
      parent.claimsFrozen = true;
    }
  }

  #audit(kind: string, projectSessionId: string, runId: string, agentId: string, sourceId: string, detail: string): LifecycleAuditEvent {
    const event = { kind, projectSessionId, runId, agentId, sourceId, detail };
    this.#audits.push(event);
    return event;
  }

  #loss(projectSessionId: string, runId: string, lossId: string): MutableLoss {
    const loss = this.#losses.get(lossId);
    if (loss === undefined) throw new LifecycleDomainError("LOSS_NOT_FOUND", `unknown generation loss ${lossId}`);
    if (loss.projectSessionId !== projectSessionId || loss.runId !== runId) throw new LifecycleDomainError("RUN_SCOPE_MISMATCH", "generation loss belongs to another project/run");
    return loss;
  }

  #bindRecoveryCheckpoint(
    loss: MutableLoss,
    checkpoint: LifecycleCheckpoint,
    checkpointArtifactRef: string,
    issue: LifecycleRecoveryIssue,
  ): LifecycleRecoveryCheckpointBinding | null {
    if (!exactCheckpoint(loss.checkpoint, checkpoint) || checkpointArtifactRef.length === 0) return null;
    let receipt: LifecycleRecoveryCheckpointValidationReceipt | null;
    if (loss.checkpointState === "last-validated") {
      if (loss.checkpointRef === null || loss.checkpointDigest === null ||
        loss.checkpointValidationRevision === null || loss.checkpointValidationEvidenceDigest === null) return null;
      receipt = {
        schemaVersion: 1 as const,
        checkpointRef: loss.checkpointRef,
        checkpointDigest: loss.checkpointDigest,
        validationRevision: loss.checkpointValidationRevision,
        validationEvidenceDigest: loss.checkpointValidationEvidenceDigest,
      };
    } else {
      receipt = this.#ports.recoveryCheckpoint?.validate({
        projectSessionId: loss.projectSessionId,
        runId: loss.runId,
        agentId: loss.agentId,
        lossId: loss.lossId,
        checkpointState: loss.checkpointState,
        checkpointArtifactRef,
        checkpoint: { ...checkpoint },
        issueId: issue.issueId,
        consequentialGateId: issue.consequentialGateId,
        consequentialGateDigest: issue.consequentialGateDigest,
      }) ?? null;
    }
    if (receipt === null || !hasExactKeys(receipt, [
      "schemaVersion", "checkpointRef", "checkpointDigest", "validationRevision", "validationEvidenceDigest",
    ]) || receipt.schemaVersion !== 1 || receipt.checkpointRef !== checkpointArtifactRef ||
      receipt.checkpointDigest !== checkpoint.checkpointDigest || !Number.isSafeInteger(receipt.validationRevision) ||
      receipt.validationRevision < 1 || !validDigest(receipt.validationEvidenceDigest)) return null;
    return Object.freeze({
      ...receipt,
      issueId: issue.issueId,
      recoverySourceRef: loss.lossId,
      consequentialGateId: issue.consequentialGateId,
      consequentialGateDigest: issue.consequentialGateDigest,
    });
  }

  #recoveryCheckpointBindingAccepted(
    loss: MutableLoss,
    checkpoint: LifecycleCheckpoint,
    binding: LifecycleRecoveryCheckpointBinding,
    issue: LifecycleRecoveryIssue,
  ): boolean {
    if (!exactCheckpoint(loss.checkpoint, checkpoint) || !hasExactKeys(binding, [
      "schemaVersion", "checkpointRef", "checkpointDigest", "validationRevision", "validationEvidenceDigest",
      "issueId", "recoverySourceRef", "consequentialGateId", "consequentialGateDigest",
    ]) || binding.schemaVersion !== 1 || binding.checkpointDigest !== checkpoint.checkpointDigest ||
      binding.checkpointRef.length === 0 || !Number.isSafeInteger(binding.validationRevision) ||
      binding.validationRevision < 1 || !validDigest(binding.validationEvidenceDigest) ||
      binding.issueId !== issue.issueId || binding.recoverySourceRef !== loss.lossId ||
      binding.consequentialGateId !== issue.consequentialGateId ||
      binding.consequentialGateDigest !== issue.consequentialGateDigest) return false;
    return loss.checkpointState !== "last-validated" || (
      binding.checkpointRef === loss.checkpointRef && binding.checkpointDigest === loss.checkpointDigest &&
      binding.validationRevision === loss.checkpointValidationRevision &&
      binding.validationEvidenceDigest === loss.checkpointValidationEvidenceDigest
    );
  }

  #lossSourceStillCurrent(loss: MutableLoss, agent: MutableAgent): boolean {
    return canonicalJson(agent.provider) === canonicalJson(loss.newProvider) &&
      canonicalJson(agent.sourceBinding) === canonicalJson(loss.sourceBinding) &&
      agent.principalGeneration === loss.sourcePrincipalGeneration &&
      agent.bridgeGeneration === loss.sourceBridgeGeneration &&
      agent.bridgeOwnerId === loss.sourceBridgeOwnerId && agent.role === loss.sourceRole &&
      agent.recoveryCheckpointState === loss.checkpointState &&
      agent.recoveryCheckpointRef === loss.checkpointRef &&
      agent.recoveryCheckpointDigest === loss.checkpointDigest &&
      agent.recoveryCheckpointValidationRevision === loss.checkpointValidationRevision &&
      agent.recoveryCheckpointValidationEvidenceDigest === loss.checkpointValidationEvidenceDigest &&
      agent.writeRevision === loss.sourceWriteRevision && agent.authorityRevision === loss.sourceAuthorityRevision &&
      exactCheckpoint(checkpointFor(agent), loss.fencedCheckpoint) && agent.sourceCapabilityRevoked &&
      agent.bridgeRevoked && loss.fencedWriteCustodyIds.every((id) =>
        agent.writes.some((write) => write.custodyId === id && write.state === "lifecycle-quarantined")
      );
  }

  #custodySourceStillCurrent(custody: MutableCustody, agent: MutableAgent): boolean {
    if (custody.recoveryFromLossId !== null) {
      const loss = this.#loss(custody.projectSessionId, custody.runId, custody.recoveryFromLossId);
      return exactCheckpoint(custody.checkpoint, loss.checkpoint) && this.#lossSourceStillCurrent(loss, agent);
    }
    return canonicalJson(agent.provider) === canonicalJson(custody.sourceProvider) &&
      canonicalJson(agent.sourceBinding) === canonicalJson(custody.sourceBinding) &&
      agent.principalGeneration === custody.sourcePrincipalGeneration &&
      agent.bridgeGeneration === custody.sourceBridgeGeneration &&
      agent.writeRevision === custody.sourceWriteRevision && agent.authorityRevision === custody.sourceAuthorityRevision &&
      exactCheckpoint(checkpointFor(agent), custody.checkpoint);
  }

  async #acceptObservation(
    custody: MutableCustody,
    agent: MutableAgent,
    observation: Awaited<ReturnType<LifecycleDomainPorts["provider"]["lookupReplacement"]>>,
  ): Promise<LifecycleCustodyView> {
    if (observation.status === "accepted") {
      if (!hasExactKeys(observation, ["status"])) {
        return this.#finalize(custody, agent, "quarantined", "provider-observation-invalid", "recovery-required", lifecycleDigest(observation));
      }
      if (custody.phase === "ambiguous") {
        return this.inspectCustody(custody.projectSessionId, custody.runId, custody.custodyRef);
      }
      if (custody.phase !== "dispatched" && custody.phase !== "accepted") {
        return this.#finalize(custody, agent, "quarantined", "provider-observation-invalid", "recovery-required", lifecycleDigest(observation));
      }
      if (custody.phase !== "accepted") custody.history.push("accepted");
      custody.phase = "accepted";
      return this.inspectCustody(custody.projectSessionId, custody.runId, custody.custodyRef);
    }
    if (observation.status === "ambiguous") {
      if (!hasExactKeys(observation, ["status"])) {
        return this.#finalize(custody, agent, "quarantined", "provider-observation-invalid", "recovery-required", lifecycleDigest(observation));
      }
      if (custody.phase !== "ambiguous") custody.history.push("ambiguous");
      custody.phase = "ambiguous";
      return this.inspectCustody(custody.projectSessionId, custody.runId, custody.custodyRef);
    }
    if (observation.status === "closed-no-effect") {
      if (!hasExactKeys(observation, ["status", "proofDigest"]) || !validDigest(observation.proofDigest)) {
        return this.#finalize(custody, agent, "quarantined", "provider-no-effect-proof-invalid", "recovery-required", lifecycleDigest(observation));
      }
      custody.phase = "provider-terminal";
      custody.history.push("provider-terminal");
      this.#audit(
        "lifecycle-provider-no-effect",
        agent.projectSessionId,
        agent.runId,
        agent.agentId,
        custody.custodyRef,
        observation.proofDigest,
      );
      return this.#finalize(custody, agent, "no-effect", "authenticated-provider-closed-no-effect", "ready", observation.proofDigest);
    }
    if (!hasExactKeys(observation, ["status", "candidate"]) || !this.#validCandidate(custody, observation.candidate)) {
      return this.#finalize(custody, agent, "quarantined", "replacement-attestation-invalid", "recovery-required", lifecycleDigest(observation));
    }
    custody.candidate = structuredClone(observation.candidate);
    if (custody.phase !== "provider-terminal") custody.history.push("provider-terminal");
    custody.phase = "provider-terminal";
    this.#ports.fault?.hit("after-provider-ack-before-commit", custody.custodyRef);
    return this.#commit(custody, agent);
  }

  #commit(custody: MutableCustody, agent: MutableAgent): LifecycleCustodyView {
    const candidate = custody.candidate;
    if (candidate === null || !this.#validCandidate(custody, candidate)) {
      return this.#finalize(custody, agent, "quarantined", "replacement-attestation-invalid", "recovery-required", lifecycleDigest({ candidate }));
    }
    const sourceStillCurrent = () => this.#custodySourceStillCurrent(custody, agent);
    if (!sourceStillCurrent()) {
      return this.#finalize(custody, agent, "superseded", "source-drift-before-commit", "ready", lifecycleDigest({
        source: custody.checkpoint,
        current: checkpointFor(agent),
      }));
    }
    const agentBefore = structuredClone(agent);
    const custodyBefore = structuredClone(custody);
    const linkedLossBefore = custody.recoveryFromLossId === null
      ? null
      : structuredClone(this.#loss(custody.projectSessionId, custody.runId, custody.recoveryFromLossId));
    const auditLengthBefore = this.#audits.length;
    if (custody.phase !== "committing") {
      custody.phase = "committing";
      custody.history.push("committing");
    }
    this.#ports.fault?.hit("after-commit-start", custody.custodyRef);
    const applyLifecycleAdoption = (decision: ReviewAdoptionDecision | null): boolean => {
      if (!sourceStillCurrent()) return false;
      agent.provider = cloneProvider(candidate.provider);
      agent.sourceBinding = {
        capabilityHash: custody.stagedCapabilityHash,
        custodyAction: { ...custody.pair },
        adapterContractDigest: custody.adapterContractDigest,
        bridgeRowId: `bridge:${custody.custodyRef}`,
        bridgeRevision: custody.sourceBinding.bridgeRevision + 1,
        projectSessionGeneration: custody.sourceBinding.projectSessionGeneration,
        runGeneration: custody.sourceBinding.runGeneration,
        chairLeaseGeneration: agent.role === "chair"
          ? (custody.sourceBinding.chairLeaseGeneration ?? 0) + 1
          : null,
      };
      agent.principalGeneration = candidate.principalGeneration;
      agent.bridgeGeneration = candidate.bridgeGeneration;
      agent.deliveries = agent.deliveries.map((delivery) =>
        delivery.state === "claimed" || delivery.state === "provider-accepted"
          ? { ...delivery, claimGeneration: candidate.provider.providerGeneration }
          : delivery
      );
      agent.lifecycle = "ready";
      agent.claimsFrozen = false;
      agent.sourceCapabilityRevoked = false;
      agent.principalRevoked = false;
      agent.bridgeRevoked = false;
      custody.reviewDecision = decision;
      custody.phase = "finalized";
      custody.disposition = "adopted";
      custody.history.push("adopted");
      custody.terminalEvidence = terminalEvidenceFor(
        custody,
        "adopted",
        "replacement-adopted",
        lifecycleDigest(candidate.launchAttestation),
      );
      if (custody.recoveryFromLossId !== null) {
        const loss = this.#loss(custody.projectSessionId, custody.runId, custody.recoveryFromLossId);
        loss.state = "recovered-adopted";
        loss.reviewDecision = decision;
        loss.activeRecoveryAttemptId = null;
        loss.activeRecoveryCustodyRef = null;
      }
      this.#audit("lifecycle-custody-finalized", agent.projectSessionId, agent.runId, agent.agentId, custody.custodyRef, "replacement-adopted");
      return true;
    };
    let adopted: boolean;
    if (agent.role === "chair") {
      try {
        adopted = this.#commitReviewAdoption(custody, candidate, applyLifecycleAdoption);
      } catch (error) {
        this.#agents.set(agentKey(agent.projectSessionId, agent.runId, agent.agentId), agentBefore);
        this.#custodies.set(custody.custodyRef, {
          ...custodyBefore,
          acceptance: Object.freeze({ ...custodyBefore.acceptance }),
          history: [...custodyBefore.history],
        });
        if (linkedLossBefore !== null) this.#losses.set(linkedLossBefore.lossId, linkedLossBefore);
        this.#audits.length = auditLengthBefore;
        throw error;
      }
    } else {
      adopted = applyLifecycleAdoption(null);
    }
    if (!adopted) {
      return this.#finalize(custody, agent, "superseded", "source-cas-lost", "ready", lifecycleDigest({
        source: custody.checkpoint,
        current: checkpointFor(agent),
      }));
    }
    this.#ports.fault?.hit("after-adoption-before-finalize", custody.custodyRef);
    return this.inspectCustody(custody.projectSessionId, custody.runId, custody.custodyRef);
  }

  #validCandidate(custody: MutableCustody, candidate: ReplacementCandidate): boolean {
    if (
      !hasExactKeys(candidate, ["provider", "principalGeneration", "bridgeGeneration", "launchAttestation"]) ||
      !validProviderContext(candidate.provider) ||
      candidate.provider.providerGeneration !== custody.reservedProviderGeneration ||
      candidate.principalGeneration !== custody.reservedPrincipalGeneration ||
      candidate.bridgeGeneration !== custody.reservedBridgeGeneration ||
      candidate.provider.reference === custody.sourceProvider.reference ||
      candidate.provider.reference.length === 0 ||
      candidate.provider.historyDigest === custody.sourceProvider.historyDigest ||
      !validDigest(candidate.provider.evidenceDigest) ||
      !validDigest(candidate.provider.historyDigest) ||
      !Number.isSafeInteger(candidate.provider.contextRevision) ||
      candidate.provider.contextRevision < 0
    ) return false;
    const expected = {
      pair: custody.pair,
      operation: custody.providerOperation,
      adapterContractDigest: custody.adapterContractDigest,
      projectSessionId: custody.projectSessionId,
      runId: custody.runId,
      agentId: custody.agentId,
      custodyRef: custody.custodyRef,
      challenge: custody.launchChallenge,
      checkpointDigest: custody.checkpoint.checkpointDigest,
      taskDigest: custody.checkpoint.taskDigest,
      mailboxDigest: custody.checkpoint.mailboxDigest,
      childDigest: custody.checkpoint.childDigest,
      openWorkDigest: custody.checkpoint.openWorkDigest,
      adoptionDeliveryDigest: custody.checkpoint.adoptionDeliveryDigest,
      providerGeneration: custody.reservedProviderGeneration,
      principalGeneration: custody.reservedPrincipalGeneration,
      bridgeGeneration: custody.reservedBridgeGeneration,
    };
    return canonicalJson(candidate.launchAttestation) === canonicalJson(expected);
  }

  #finalize(
    custody: MutableCustody,
    agent: MutableAgent,
    disposition: NonNullable<LifecycleCustodyView["disposition"]>,
    detail: string,
    lifecycle: MutableAgent["lifecycle"],
    proofDigest: LifecycleDigest,
  ): LifecycleCustodyView {
    custody.phase = "finalized";
    custody.disposition = disposition;
    custody.history.push(disposition);
    custody.terminalEvidence = terminalEvidenceFor(custody, disposition, detail, proofDigest);
    if (disposition === "superseded" || disposition === "quarantined") {
      this.#setUnique(
        this.#custodyDispositionProofs,
        custody.custodyRef,
        dispositionProofFor(custody, disposition, detail, proofDigest),
      );
    }
    if ((disposition === "no-effect" || disposition === "superseded") && custody.changedWriteCustodyIds.length > 0) {
      const changed = new Set(custody.changedWriteCustodyIds);
      let restored = false;
      agent.writes = agent.writes.map((write) => {
        if (!changed.has(write.custodyId) || write.state !== "lifecycle-quarantined") return write;
        restored = true;
        return { ...write, state: "active" };
      });
      if (restored) agent.writeRevision += 1;
    }
    if (custody.recoveryFromLossId !== null && disposition !== "adopted" && disposition !== "abandoned") {
      const loss = this.#loss(custody.projectSessionId, custody.runId, custody.recoveryFromLossId);
      loss.state = "open";
      loss.actionPair = null;
      loss.reviewDecision = null;
      loss.activeRecoveryAttemptId = null;
      loss.activeRecoveryCustodyRef = null;
    }
    const activeLoss = [...this.#losses.values()].some((loss) =>
      loss.projectSessionId === agent.projectSessionId &&
      loss.runId === agent.runId &&
      loss.agentId === agent.agentId &&
      (loss.state === "open" || loss.state === "recovery-in-progress")
    );
    agent.lifecycle = lifecycle === "ready" && activeLoss ? "recovery-required" : lifecycle;
    agent.claimsFrozen = agent.lifecycle !== "ready";
    this.#audit("lifecycle-custody-finalized", agent.projectSessionId, agent.runId, agent.agentId, custody.custodyRef, detail);
    return this.inspectCustody(custody.projectSessionId, custody.runId, custody.custodyRef);
  }

  #commitReviewAdoption(
    custody: MutableCustody,
    candidate: ReplacementCandidate,
    commitLifecycleAdoption: (decision: ReviewAdoptionDecision | null) => boolean,
  ): boolean {
    const port = this.#ports.reviewCertification;
    const lifecycleCustodyRef = {
      schemaVersion: 1 as const,
      runId: custody.runId,
      agentId: custody.agentId,
      custodyId: custody.custodyRef,
      custodyRevision: 1,
    };
    const lifecycleAdoptionEvidenceDigest = lifecycleDigest({
      projectSessionId: custody.projectSessionId,
      lifecycleCustodyRef,
      checkpoint: custody.checkpoint,
      successorProvider: candidate.provider,
      successorPrincipalGeneration: candidate.principalGeneration,
      successorBridgeGeneration: candidate.bridgeGeneration,
      launchAttestation: candidate.launchAttestation,
    });
    let target: ReviewCertificationTargetSnapshot | null = null;
    if (port !== undefined) {
      try {
        const observed = port.readCurrentTarget({
          projectSessionId: custody.projectSessionId,
          runId: custody.runId,
          agentId: custody.agentId,
        });
        if (observed !== null && hasExactKeys(observed, [
          "schemaVersion", "runId", "targetGeneration", "predecessorBindingGeneration",
          "predecessorBindingDigest", "terminalSequenceHighWater",
        ]) && observed.schemaVersion === 1 && observed.runId === custody.runId &&
          Number.isSafeInteger(observed.targetGeneration) && observed.targetGeneration >= 1 &&
          Number.isSafeInteger(observed.predecessorBindingGeneration) && observed.predecessorBindingGeneration >= 1 &&
          validDigest(observed.predecessorBindingDigest) && Number.isSafeInteger(observed.terminalSequenceHighWater) &&
          observed.terminalSequenceHighWater >= 0) {
          target = observed;
        }
      } catch {
        target = null;
      }
    }
    const cut = target === null
      ? null
      : (() => {
          const preimage = {
            schemaVersion: 1 as const,
            runId: target.runId,
            targetGeneration: target.targetGeneration,
            predecessorBindingGeneration: target.predecessorBindingGeneration,
            predecessorBindingDigest: target.predecessorBindingDigest,
            terminalSequenceHighWater: target.terminalSequenceHighWater,
            lifecycleCustodyRef,
            lifecycleAdoptionEvidenceDigest,
          };
          return Object.freeze({ ...preimage, cutDigest: lifecycleDigest(preimage) });
        })();
    const fallbackDecision: ReviewAdoptionDecision = cut === null
      ? { kind: "no-current-target" }
      : { kind: "stale", cut, reason: "same-subject-predicate-failed" };
    if (!commitLifecycleAdoption(fallbackDecision)) return false;
    if (cut !== null) this.#setUnique(this.#reviewCertificationCuts, custody.custodyRef, cut);
    if (port === undefined) return true;
    const setDecision = (decision: ReviewAdoptionDecision): void => {
      custody.reviewDecision = structuredClone(decision);
      if (custody.recoveryFromLossId !== null) {
        this.#loss(custody.projectSessionId, custody.runId, custody.recoveryFromLossId).reviewDecision = structuredClone(decision);
      }
    };
    let decisionAttempted = false;
    let committedDecision: ReviewAdoptionDecision = fallbackDecision;
    const commitDecision = (candidateDecision: ReviewAdoptionDecision): boolean => {
      this.#assertReviewAdoptionDecision(
        candidateDecision,
        custody.runId,
        lifecycleCustodyRef,
        lifecycleAdoptionEvidenceDigest,
      );
      if ((cut === null && candidateDecision.kind !== "no-current-target") ||
        (cut !== null && (candidateDecision.kind === "no-current-target" ||
          canonicalJson(candidateDecision.cut) !== canonicalJson(cut)))) {
        throw new LifecycleDomainError("REVIEW_ADOPTION_DECISION_INVALID", "review decision crossed its lifecycle-owned certification cut");
      }
      if (decisionAttempted) {
        return canonicalJson(committedDecision) === canonicalJson(candidateDecision);
      }
      decisionAttempted = true;
      committedDecision = structuredClone(candidateDecision);
      setDecision(committedDecision);
      return true;
    };
    try {
      port.commitReviewAdoption({
        lifecycleCustodyRef,
        lifecycleAdoptionEvidenceDigest,
        checkpoint: { ...custody.checkpoint },
        commitLifecycleAdoption: commitDecision,
      });
    } catch {
      setDecision(fallbackDecision);
    }
    return true;
  }

  #assertReviewAdoptionDecision(
    typed: ReviewAdoptionDecision,
    runId: string,
    lifecycleCustodyRef: LifecycleCustodyRef,
    lifecycleAdoptionEvidenceDigest: LifecycleDigest,
  ): void {
    if (typeof typed !== "object" || typed === null || !("kind" in typed)) {
      throw new LifecycleDomainError("REVIEW_ADOPTION_DECISION_INVALID", "review transaction owner supplied no decision");
    }
    if (typed.kind === "no-current-target") {
      if (!hasExactKeys(typed, ["kind"])) {
        throw new LifecycleDomainError("REVIEW_ADOPTION_DECISION_INVALID", "no-target review decision must be exact");
      }
      return;
    }
    if ((typed.kind !== "rebound" && typed.kind !== "stale") || !("cut" in typed)) {
      throw new LifecycleDomainError("REVIEW_ADOPTION_DECISION_INVALID", "review transaction owner returned a malformed decision");
    }
    const cut: ReviewCertificationCut = typed.cut;
    const exactDecision = typed.kind === "rebound"
      ? hasExactKeys(typed, ["kind", "cut", "rebindReceiptDigest"])
      : hasExactKeys(typed, ["kind", "cut", "reason"]);
    if (!exactDecision || !hasExactKeys(cut, [
      "schemaVersion",
      "runId",
      "targetGeneration",
      "predecessorBindingGeneration",
      "predecessorBindingDigest",
      "terminalSequenceHighWater",
      "lifecycleCustodyRef",
      "lifecycleAdoptionEvidenceDigest",
      "cutDigest",
    ])) {
      throw new LifecycleDomainError("REVIEW_ADOPTION_DECISION_INVALID", "review transaction owner omitted the exact cut");
    }
    const { cutDigest, ...cutPreimage } = cut;
    const validCut =
      cut.schemaVersion === 1 &&
      cut.runId === runId &&
      cut.targetGeneration >= 1 && Number.isSafeInteger(cut.targetGeneration) &&
      cut.predecessorBindingGeneration >= 1 && Number.isSafeInteger(cut.predecessorBindingGeneration) &&
      validDigest(cut.predecessorBindingDigest) &&
      cut.terminalSequenceHighWater >= 0 && Number.isSafeInteger(cut.terminalSequenceHighWater) &&
      hasExactKeys(cut.lifecycleCustodyRef, ["schemaVersion", "runId", "agentId", "custodyId", "custodyRevision"]) &&
      canonicalJson(cut.lifecycleCustodyRef) === canonicalJson(lifecycleCustodyRef) &&
      cut.lifecycleAdoptionEvidenceDigest === lifecycleAdoptionEvidenceDigest &&
      cutDigest === lifecycleDigest(cutPreimage);
    const validOutcome = typed.kind === "rebound"
      ? validDigest(typed.rebindReceiptDigest)
      : typed.reason === "same-subject-predicate-failed";
    if (!validCut || !validOutcome) {
      throw new LifecycleDomainError(
        "REVIEW_ADOPTION_DECISION_INVALID",
        "review transaction owner returned a crossed or malformed adoption decision",
      );
    }
    return;
  }

  #agent(projectSessionId: string, runId: string, agentId: string): MutableAgent {
    const agent = this.#agents.get(agentKey(projectSessionId, runId, agentId));
    if (agent === undefined) throw new LifecycleDomainError("AGENT_NOT_FOUND", `unknown agent ${agentId}`);
    return agent;
  }

  #custody(projectSessionId: string, runId: string, custodyRef: string): MutableCustody {
    const custody = this.#custodies.get(custodyRef);
    if (custody === undefined) throw new LifecycleDomainError("CUSTODY_NOT_FOUND", `unknown custody ${custodyRef}`);
    if (custody.projectSessionId !== projectSessionId || custody.runId !== runId) {
      throw new LifecycleDomainError("RUN_SCOPE_MISMATCH", "lifecycle custody belongs to another project/run");
    }
    return custody;
  }

  #setUnique<T>(target: Map<string, T>, key: string, value: T): void {
    if (target.has(key)) throw new LifecycleDomainError("SNAPSHOT_INVALID", `duplicate snapshot key ${key}`);
    target.set(key, value);
  }
}

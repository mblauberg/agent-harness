import type Database from "better-sqlite3";
import { createHash } from "node:crypto";

import { canonicalJson, integer, isRow, row, text } from "../project-session/store-support.js";

export type LifecycleCustodyState =
  | "awaiting-boundary"
  | "prepared"
  | "dispatched"
  | "accepted"
  | "ambiguous"
  | "provider-terminal"
  | "committing"
  | "finalized";

export type LifecycleCustodyDisposition =
  | "none"
  | "adopted"
  | "no-effect"
  | "quarantined"
  | "superseded"
  | "abandoned";

const MUTATION_PLAN_RELATIONS = new Set([
  "agent-state", "provider-session", "provider-lineage", "provider-action", "principal-capability",
  "agent-bridge", "chair-bridge", "turn-lease", "write-lease", "delivery",
  "task-owner", "result-obligation", "membership", "barrier", "freeze-owner",
  "custody-revision", "custody-head", "generation-loss-revision", "generation-loss-head",
  "review-cut", "review-binding", "review-binding-pointer", "recovery-issue",
  "fresh-preparation", "fresh-handoff", "fresh-commit", "recovery-retirement", "audit",
]);

type LifecycleMutationPlanWrite = Readonly<{
  relation: string;
  keyDigest: string;
  operation: "insert" | "update" | "delete";
  expectedSemanticDigest: string | null;
  afterSemanticJcs: string | null;
  afterSemanticDigest: string | null;
}>;

type LifecycleMutationPlan = Readonly<{
  schemaVersion: 1;
  writes: readonly LifecycleMutationPlanWrite[];
  writeSetDigest: string;
}>;

export type LifecycleCustodyHead = Readonly<{
  projectSessionId: string;
  runId: string;
  agentId: string;
  custodyId: string;
  revision: number;
  state: LifecycleCustodyState;
  disposition: LifecycleCustodyDisposition;
  semanticDigest: string;
  sourceRefDigest: string;
  journalDigest: string;
  terminal: boolean;
}>;

export type ReservedLifecycleGenerations = Readonly<{
  providerGeneration: number;
  principalGeneration: number;
  bridgeGeneration: number;
}>;

export type CreateLifecycleCustodyInput = Readonly<{
  projectSessionId: string;
  runId: string;
  agentId: string;
  custodyId: string;
  commandId: string;
  admissionDigest: string;
  actionRef: Readonly<{ adapterId: string; actionId: string }>;
  bridgeOwnerKind: "chair" | "child";
  callerTurnLeaseId: string;
  callerTurnGeneration: number;
  predecessorTurnSetDigest: string;
  quarantinedWriteSetDigest: string;
  deliveryCutWatermark: number;
  adoptionDeliverySetDigest: string;
  checkpointRef: string;
  checkpointDigest: string;
  taskRevision: number;
  mailboxRevision: number;
  childSetDigest: string;
  openWorkSetDigest: string;
  sourceProviderSessionRef: string;
  sourceCapabilityHash: string;
  sourceCustodyActionId: string;
  sourceAdapterId: string;
  sourceAdapterContractDigest: string;
  sourceBridgeRowId: string;
  sourceBridgeRevision: number;
  sourceProviderGeneration: number;
  sourcePrincipalGeneration: number;
  sourceBridgeGeneration: number;
  sourceProjectSessionGeneration: number;
  sourceRunGeneration: number;
  sourceChairLeaseGeneration: number;
  targetProviderGeneration: number;
  targetPrincipalGeneration: number;
  targetBridgeGeneration: number;
  replacementAdapterId: string;
  replacementContractDigest: string;
  stagedCapabilityHash: string;
  launchAttestChallengeDigest: string;
  preconditionDigest: string;
  createdAt: number;
}>;

type AppendInput = Readonly<{
  runId: string;
  agentId: string;
  custodyId: string;
  expectedRevision: number;
  state: Exclude<LifecycleCustodyState, "finalized">;
  terminalEvidenceDigest?: string;
  recordedAt: number;
}>;

export type PreparedChildCustodyTerminal = Readonly<{
  projectSessionId: string;
  runId: string;
  agentId: string;
  custodyId: string;
  preRevision: number;
  finalRevision: number;
  applyId: string;
  batchId: string;
  effectDigest: string;
  ownerRefDigest: string;
  transitionReplayDigest: string;
  subject: Readonly<Record<string, unknown>>;
  subjectJson: string;
  subjectDigest: string;
  intent: Readonly<Record<string, unknown>>;
  intentJson: string;
  intentDigest: string;
  finalSemanticDigest: string;
  finalSourceRefDigest: string;
  fromState: Exclude<LifecycleCustodyState, "finalized">;
  disposition: Extract<LifecycleCustodyDisposition, "adopted" | "no-effect" | "superseded" | "quarantined">;
  proofKind: "provider-terminal" | "zero-dispatch-no-effect" | "predispatch-superseded" |
    "postterminal-adoption-cas-superseded" | "integrity-quarantine";
  terminalEvidenceDigest: string;
  ownerKind: "chair" | "child";
  mutationPlan: LifecycleMutationPlan;
  review: PreparedReviewAdoption | null;
}>;

type PreparedReviewAdoption = Readonly<{
  reservationId: string;
  reservationDigest: string;
  decision: Readonly<Record<string, unknown>>;
  decisionDigest: string;
  cut: Readonly<Record<string, unknown>> | null;
  cutDigest: string | null;
  subject: Readonly<Record<string, unknown>>;
  subjectJson: string;
  subjectDigest: string;
  intent: Readonly<Record<string, unknown>>;
  intentJson: string;
  intentDigest: string;
  successorBinding: Readonly<Record<string, unknown>> | null;
  rebindReceipt: Readonly<Record<string, unknown>> | null;
}>;

type ReviewReservationPlan = Readonly<{
  reservationId: string;
  reservationDigest: string;
  decision: Readonly<Record<string, unknown>>;
  decisionDigest: string;
  cut: Readonly<Record<string, unknown>> | null;
  cutDigest: string | null;
  successorBinding: Readonly<Record<string, unknown>> | null;
  rebindReceipt: Readonly<Record<string, unknown>> | null;
}>;

export type PrepareChildCustodyTerminalInput = Readonly<{
  runId: string;
  agentId: string;
  custodyId: string;
  expectedRevision: number;
  applyId: string;
  transitionProof: Readonly<Record<string, unknown>>;
  mutationPlan: Readonly<Record<string, unknown>>;
  recordedAt: number;
  review?: Readonly<{
    commandId: string;
    lifecycleAdoptionEvidenceDigest: string;
    recordedAt: number;
  }>;
  terminal?: Readonly<{
    disposition: Extract<LifecycleCustodyDisposition, "adopted" | "no-effect" | "superseded" | "quarantined">;
    proofKind: "provider-terminal" | "zero-dispatch-no-effect" | "predispatch-superseded" |
      "postterminal-adoption-cas-superseded" | "integrity-quarantine";
    terminalEvidenceDigest: string;
  }>;
}>;

export type ExternallyVerifiedChildCustodyAuthorization = Readonly<{
  prepared: PreparedChildCustodyTerminal;
  expectedRevision: number;
  expectedScopeHead: Readonly<{ checkpointDigest: string; revision: number }>;
  receipt: Readonly<{
    authorityId: string;
    authoritySequence: number;
    previousReceiptDigest: string | null;
    receiptDigest: string;
    attestation: string;
    verifiedAt: number;
  }>;
  reviewReceipt?: Readonly<{
    authorityId: string;
    authoritySequence: number;
    previousReceiptDigest: string | null;
    receiptDigest: string;
    attestation: string;
    verifiedAt: number;
  }>;
  scopeCheckpoint: Readonly<{
    receiptCount: number;
    headAuthoritySequence: number;
    headReceiptDigest: string;
    orderedRecordSetDigest: string;
    checkpointDigest: string;
    attestation: string;
    verifiedAt: number;
  }>;
  authorizedAt: number;
  appliedAt: number;
  localWrites: readonly Readonly<{
    relation: string;
    key: string;
    operation: "insert" | "update" | "delete";
  }>[];
  auxiliaryLocalWrites?: readonly Readonly<{
    relation: string;
    key: string;
    operation: "insert" | "update" | "delete";
  }>[];
  revalidateAdoptionWrites: () => void;
  performAdoptionWrites: () => void;
}>;

function revisionBody(input: Readonly<{
  custodyId: string;
  revision: number;
  state: LifecycleCustodyState;
  disposition: LifecycleCustodyDisposition;
  proofKind?: string;
  terminalEvidenceDigest: string | null;
}>): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: 1,
    sourceKind: "custody",
    custodyId: input.custodyId,
    revision: input.revision,
    state: input.state,
    disposition: input.disposition,
    proofKind: input.proofKind ?? "none",
    terminalEvidenceDigest: input.terminalEvidenceDigest,
  };
}

function lifecycleDigest(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(`agent-fabric.lifecycle.v1\0${domain}\0`)
    .update(canonicalJson(value))
    .digest("hex")}`;
}

function mutationPlan(value: Readonly<Record<string, unknown>>): LifecycleMutationPlan {
  if (value.schemaVersion !== 1 || !Array.isArray(value.writes) || typeof value.writeSetDigest !== "string") {
    throw new Error("lifecycle mutation plan is not lifecycleMutationPlanV1");
  }
  const writes = value.writes.map((candidate, index) => {
    const write = row(candidate, `lifecycle mutation plan write ${index}`);
    const relation = text(write, "relation");
    if (!MUTATION_PLAN_RELATIONS.has(relation)) throw new Error("lifecycle mutation plan relation is invalid");
    const operation = text(write, "operation");
    if (!(["insert", "update", "delete"] as const).includes(operation as never)) {
      throw new Error("lifecycle mutation plan operation is invalid");
    }
    const keyDigest = text(write, "keyDigest");
    const expectedSemanticDigest = write.expectedSemanticDigest;
    const afterSemanticJcs = write.afterSemanticJcs;
    const afterSemanticDigest = write.afterSemanticDigest;
    if (operation === "insert" && expectedSemanticDigest !== null) {
      throw new Error("lifecycle mutation plan insert has an expected digest");
    }
    if (operation !== "insert" && typeof expectedSemanticDigest !== "string") {
      throw new Error("lifecycle mutation plan update/delete lacks an expected digest");
    }
    if (operation === "delete" && (afterSemanticJcs !== null || afterSemanticDigest !== null)) {
      throw new Error("lifecycle mutation plan delete has after state");
    }
    if (operation !== "delete" && (typeof afterSemanticJcs !== "string" || typeof afterSemanticDigest !== "string")) {
      throw new Error("lifecycle mutation plan write lacks after state");
    }
    return {
      relation,
      keyDigest,
      operation: operation as LifecycleMutationPlanWrite["operation"],
      expectedSemanticDigest: expectedSemanticDigest as string | null,
      afterSemanticJcs: afterSemanticJcs as string | null,
      afterSemanticDigest: afterSemanticDigest as string | null,
    };
  });
  const ordered = [...writes].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  if (canonicalJson(writes) !== canonicalJson(ordered)) {
    throw new Error("lifecycle mutation plan writes are not strictly sorted");
  }
  const writeSetDigest = lifecycleDigest("mutation-plan", { schemaVersion: 1, writes });
  if (writeSetDigest !== value.writeSetDigest) throw new Error("lifecycle mutation plan write-set digest crossed");
  return { schemaVersion: 1, writes, writeSetDigest };
}

function custodyRef(runId: string, agentId: string, custodyId: string, revision: number): Readonly<Record<string, unknown>> {
  return { schemaVersion: 1, runId, agentId, custodyId, custodyRevision: revision };
}

function custodyJournal(input: Readonly<{
  runId: string;
  agentId: string;
  custodyId: string;
  revision: number;
  priorJournalDigest: string | null;
  semanticDigest: string;
  sourceRefDigest: string;
  authorityBatchId?: string;
  authorityApplyId?: string;
  authorityApplyDigest?: string;
  recordedAt: number;
}>): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: 1,
    ownerRef: {
      kind: "custody",
      custodyRef: custodyRef(input.runId, input.agentId, input.custodyId, input.revision),
      sourceRefDigest: input.sourceRefDigest,
    },
    priorJournalDigest: input.priorJournalDigest,
    semanticDigest: input.semanticDigest,
    sourceRefDigest: input.sourceRefDigest,
    authorityBatchId: input.authorityBatchId ?? null,
    authorityApplyId: input.authorityApplyId ?? null,
    authorityApplyDigest: input.authorityApplyDigest ?? null,
    originFreshApplyId: null,
    originFreshApplyDigest: null,
    recordedAt: input.recordedAt,
  };
}

export class LifecycleRotationRepository {
  readonly #database: Database.Database;

  constructor(database: Database.Database) {
    this.#database = database;
  }

  nextGenerations(input: Readonly<{
    runId: string;
    agentId: string;
    bridgeOwnerKind: "chair" | "child";
    sourceProviderGeneration: number;
    sourcePrincipalGeneration: number;
    sourceBridgeGeneration: number;
  }>): ReservedLifecycleGenerations {
    for (const [label, value] of [
      ["provider", input.sourceProviderGeneration],
      ["principal", input.sourcePrincipalGeneration],
      ["bridge", input.sourceBridgeGeneration],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error(`source ${label} generation must be a positive safe integer`);
      }
    }
    const identityValue = this.#database.prepare(`
      SELECT provider_generation,principal_generation,revision
        FROM agent_lifecycle_identity_high_water
       WHERE run_id=? AND agent_id=?
    `).get(input.runId, input.agentId);
    const bridgeValue = this.#database.prepare(`
      SELECT bridge_generation,revision
        FROM agent_lifecycle_bridge_high_water
       WHERE run_id=? AND agent_id=? AND bridge_owner_kind=?
    `).get(input.runId, input.agentId, input.bridgeOwnerKind);
    const identity = isRow(identityValue) ? identityValue : null;
    const bridge = isRow(bridgeValue) ? bridgeValue : null;
    const providerHighWater = identity === null
      ? input.sourceProviderGeneration
      : integer(identity, "provider_generation");
    const principalHighWater = identity === null
      ? input.sourcePrincipalGeneration
      : integer(identity, "principal_generation");
    const bridgeHighWater = bridge === null
      ? input.sourceBridgeGeneration
      : integer(bridge, "bridge_generation");
    if (principalHighWater < input.sourcePrincipalGeneration || bridgeHighWater < input.sourceBridgeGeneration) {
      throw new Error("lifecycle generation high-water is behind its authoritative source");
    }
    const next = (label: string, value: number): number => {
      if (value >= Number.MAX_SAFE_INTEGER) throw new Error(`${label} generation is exhausted`);
      return value + 1;
    };
    const reserved = {
      providerGeneration: next("provider", Math.max(providerHighWater, input.sourceProviderGeneration)),
      principalGeneration: next("principal", principalHighWater),
      bridgeGeneration: next("bridge", bridgeHighWater),
    };
    return reserved;
  }

  reserveNextGenerationsInCurrentTransaction(input: Readonly<{
    runId: string;
    agentId: string;
    bridgeOwnerKind: "chair" | "child";
    sourceProviderGeneration: number;
    sourcePrincipalGeneration: number;
    sourceBridgeGeneration: number;
  }>): ReservedLifecycleGenerations {
    if (!this.#database.inTransaction) throw new Error("lifecycle generation reservation requires a transaction");
    const reserved = this.nextGenerations(input);
    const identityValue = this.#database.prepare(`
      SELECT provider_generation,principal_generation,revision
        FROM agent_lifecycle_identity_high_water
       WHERE run_id=? AND agent_id=?
    `).get(input.runId, input.agentId);
    const bridgeValue = this.#database.prepare(`
      SELECT bridge_generation,revision
        FROM agent_lifecycle_bridge_high_water
       WHERE run_id=? AND agent_id=? AND bridge_owner_kind=?
    `).get(input.runId, input.agentId, input.bridgeOwnerKind);
    const identity = isRow(identityValue) ? identityValue : null;
    const bridge = isRow(bridgeValue) ? bridgeValue : null;
    const providerHighWater = identity === null
      ? input.sourceProviderGeneration
      : integer(identity, "provider_generation");
    const principalHighWater = identity === null
      ? input.sourcePrincipalGeneration
      : integer(identity, "principal_generation");
    const bridgeHighWater = bridge === null
      ? input.sourceBridgeGeneration
      : integer(bridge, "bridge_generation");
    if (identity === null) {
      this.#database.prepare(`
        INSERT INTO agent_lifecycle_identity_high_water(
          run_id,agent_id,provider_generation,principal_generation,revision
        ) VALUES (?,?,?,?,1)
      `).run(input.runId, input.agentId, reserved.providerGeneration, reserved.principalGeneration);
    } else {
      const changed = this.#database.prepare(`
        UPDATE agent_lifecycle_identity_high_water
           SET provider_generation=?,principal_generation=?,revision=revision+1
         WHERE run_id=? AND agent_id=? AND provider_generation=?
           AND principal_generation=? AND revision=?
      `).run(
        reserved.providerGeneration,
        reserved.principalGeneration,
        input.runId,
        input.agentId,
        providerHighWater,
        principalHighWater,
        integer(identity, "revision"),
      );
      if (changed.changes !== 1) throw new Error("lifecycle identity generation reservation compare-and-set failed");
    }
    if (bridge === null) {
      this.#database.prepare(`
        INSERT INTO agent_lifecycle_bridge_high_water(
          run_id,agent_id,bridge_owner_kind,bridge_generation,revision
        ) VALUES (?,?,?,?,1)
      `).run(input.runId, input.agentId, input.bridgeOwnerKind, reserved.bridgeGeneration);
    } else {
      const changed = this.#database.prepare(`
        UPDATE agent_lifecycle_bridge_high_water
           SET bridge_generation=?,revision=revision+1
         WHERE run_id=? AND agent_id=? AND bridge_owner_kind=?
           AND bridge_generation=? AND revision=?
      `).run(
        reserved.bridgeGeneration,
        input.runId,
        input.agentId,
        input.bridgeOwnerKind,
        bridgeHighWater,
        integer(bridge, "revision"),
      );
      if (changed.changes !== 1) throw new Error("lifecycle bridge generation reservation compare-and-set failed");
    }
    this.#database.prepare(`
      INSERT INTO agent_lifecycle_context_high_water(
        run_id,agent_id,provider_generation,context_revision,revision
      ) VALUES (?,?,?,0,1)
    `).run(input.runId, input.agentId, reserved.providerGeneration);
    return reserved;
  }

  createInCurrentTransaction(input: CreateLifecycleCustodyInput): LifecycleCustodyHead {
    if (!this.#database.inTransaction) throw new Error("lifecycle custody creation requires a transaction");
    const creation = {
      schemaVersion: 1,
      custodyId: input.custodyId,
      commandId: input.commandId,
      actionRef: input.actionRef,
      checkpointDigest: input.checkpointDigest,
      sourceProviderGeneration: input.sourceProviderGeneration,
      sourcePrincipalGeneration: input.sourcePrincipalGeneration,
      sourceBridgeGeneration: input.sourceBridgeGeneration,
      targetProviderGeneration: input.targetProviderGeneration,
      targetPrincipalGeneration: input.targetPrincipalGeneration,
      targetBridgeGeneration: input.targetBridgeGeneration,
    };
    const creationJson = canonicalJson(creation);
    const creationDigest = lifecycleDigest("custody-semantic", creation);
    this.#database.prepare(`
      INSERT INTO lifecycle_rotation_custodies(
        project_session_id,run_id,agent_id,custody_id,command_id,admission_digest,
        provider_action_adapter_id,provider_action_id,recovery_source_kind,
        recovery_from_custody_id,recovery_from_custody_revision,
        recovery_from_generation_loss_id,recovery_from_generation_loss_revision,
        recovery_source_ref_digest,recovery_source_journal_digest,bridge_owner_kind,
        caller_turn_lease_id,caller_turn_generation,predecessor_turn_set_digest,
        quarantined_write_set_digest,delivery_cut_watermark,adoption_delivery_set_digest,
        checkpoint_ref,checkpoint_digest,checkpoint_validation_revision,
        checkpoint_validation_digest,checkpoint_validation_key,task_revision,
        mailbox_revision,child_set_digest,open_work_set_digest,
        source_provider_session_ref,source_capability_hash,source_custody_action_id,
        source_adapter_id,source_adapter_contract_digest,source_bridge_row_id,
        source_bridge_revision,source_provider_generation,source_principal_generation,
        source_bridge_generation,source_project_session_generation,source_run_generation,
        source_chair_lease_generation,target_provider_generation,target_principal_generation,
        target_bridge_generation,replacement_adapter_id,replacement_contract_digest,
        staged_capability_hash,launch_attest_challenge_digest,precondition_digest,
        origin_fresh_handoff_id,origin_fresh_handoff_digest,origin_operation,
        origin_fresh_apply_plan_digest,creation_json,creation_digest,created_at
      ) VALUES (
        @projectSessionId,@runId,@agentId,@custodyId,@commandId,@admissionDigest,
        @actionAdapterId,@actionId,'none',NULL,NULL,NULL,NULL,NULL,NULL,@bridgeOwnerKind,
        @callerTurnLeaseId,@callerTurnGeneration,@predecessorTurnSetDigest,
        @quarantinedWriteSetDigest,@deliveryCutWatermark,@adoptionDeliverySetDigest,
        @checkpointRef,@checkpointDigest,1,NULL,'none',@taskRevision,@mailboxRevision,
        @childSetDigest,@openWorkSetDigest,@sourceProviderSessionRef,
        @sourceCapabilityHash,@sourceCustodyActionId,@sourceAdapterId,
        @sourceAdapterContractDigest,@sourceBridgeRowId,@sourceBridgeRevision,
        @sourceProviderGeneration,@sourcePrincipalGeneration,@sourceBridgeGeneration,
        @sourceProjectSessionGeneration,@sourceRunGeneration,@sourceChairLeaseGeneration,
        @targetProviderGeneration,@targetPrincipalGeneration,@targetBridgeGeneration,
        @replacementAdapterId,@replacementContractDigest,@stagedCapabilityHash,
        @launchAttestChallengeDigest,@preconditionDigest,NULL,NULL,NULL,NULL,
        @creationJson,@creationDigest,@createdAt
      )
    `).run({
      ...input,
      actionAdapterId: input.actionRef.adapterId,
      actionId: input.actionRef.actionId,
      creationJson,
      creationDigest,
    });
    const body = revisionBody({
      custodyId: input.custodyId,
      revision: 1,
      state: "awaiting-boundary",
      disposition: "none",
      terminalEvidenceDigest: null,
    });
    const semanticJson = canonicalJson(body);
    const semanticDigest = lifecycleDigest("custody-semantic", body);
    const sourceRefDigest = semanticDigest;
    const journal = custodyJournal({
      runId: input.runId,
      agentId: input.agentId,
      custodyId: input.custodyId,
      revision: 1,
      priorJournalDigest: null,
      semanticDigest,
      sourceRefDigest,
      recordedAt: input.createdAt,
    });
    const journalJson = canonicalJson(journal);
    const journalDigest = lifecycleDigest("custody-journal", journal);
    this.#database.prepare(`
      INSERT INTO lifecycle_rotation_custody_revisions(
        project_session_id,run_id,agent_id,custody_id,revision,prior_revision,
        prior_journal_digest,state,disposition_code,proof_kind,
        terminal_evidence_digest,semantic_json,semantic_digest,source_ref_digest,
        origin_fresh_apply_id,origin_fresh_apply_digest,receipt_batch_id,
        receipt_apply_id,receipt_apply_digest,journal_json,journal_digest,recorded_at
      ) VALUES (?,?,?,?,1,NULL,NULL,'awaiting-boundary','none','none',NULL,?,?,?,
                NULL,NULL,NULL,NULL,NULL,?,?,?)
    `).run(
      input.projectSessionId, input.runId, input.agentId, input.custodyId,
      semanticJson, semanticDigest, sourceRefDigest, journalJson, journalDigest,
      input.createdAt,
    );
    this.#database.prepare(`
      INSERT INTO lifecycle_rotation_custody_heads(
        project_session_id,run_id,agent_id,custody_id,current_revision,state,
        disposition_code,semantic_digest,source_ref_digest,journal_digest,terminal,
        head_revision
      ) VALUES (?,?,?,?,1,'awaiting-boundary','none',?,?,?,0,1)
    `).run(
      input.projectSessionId, input.runId, input.agentId, input.custodyId,
      semanticDigest, sourceRefDigest, journalDigest,
    );
    return this.readHead(input.runId, input.agentId, input.custodyId);
  }

  appendInCurrentTransaction(input: AppendInput): LifecycleCustodyHead {
    if (!this.#database.inTransaction) throw new Error("lifecycle revision append requires a transaction");
    const prior = this.readHead(input.runId, input.agentId, input.custodyId);
    if (prior.revision !== input.expectedRevision || prior.terminal) {
      throw new Error("lifecycle custody head changed");
    }
    const revision = prior.revision + 1;
    const terminalEvidenceDigest = input.terminalEvidenceDigest ?? null;
    const body = revisionBody({
      custodyId: input.custodyId,
      revision,
      state: input.state,
      disposition: "none",
      terminalEvidenceDigest,
    });
    const semanticJson = canonicalJson(body);
    const semanticDigest = lifecycleDigest("custody-semantic", body);
    const sourceRefDigest = semanticDigest;
    const journal = custodyJournal({
      runId: input.runId,
      agentId: input.agentId,
      custodyId: input.custodyId,
      revision,
      priorJournalDigest: prior.journalDigest,
      semanticDigest,
      sourceRefDigest,
      recordedAt: input.recordedAt,
    });
    const journalJson = canonicalJson(journal);
    const journalDigest = lifecycleDigest("custody-journal", journal);
    this.#database.prepare(`
      INSERT INTO lifecycle_rotation_custody_revisions(
        project_session_id,run_id,agent_id,custody_id,revision,prior_revision,
        prior_journal_digest,state,disposition_code,proof_kind,
        terminal_evidence_digest,semantic_json,semantic_digest,source_ref_digest,
        origin_fresh_apply_id,origin_fresh_apply_digest,receipt_batch_id,
        receipt_apply_id,receipt_apply_digest,journal_json,journal_digest,recorded_at
      ) VALUES (?,?,?,?,?,?,? ,?,'none','none',?,?,?, ?,NULL,NULL,NULL,NULL,NULL,?,?,?)
    `).run(
      prior.projectSessionId, input.runId, input.agentId, input.custodyId,
      revision, prior.revision, prior.journalDigest, input.state,
      terminalEvidenceDigest, semanticJson, semanticDigest, sourceRefDigest,
      journalJson, journalDigest, input.recordedAt,
    );
    const changed = this.#database.prepare(`
      UPDATE lifecycle_rotation_custody_heads
         SET current_revision=?,state=?,disposition_code='none',semantic_digest=?,
             source_ref_digest=?,journal_digest=?,terminal=0,head_revision=head_revision+1
       WHERE run_id=? AND agent_id=? AND custody_id=? AND current_revision=?
         AND journal_digest=? AND terminal=0
    `).run(
      revision, input.state, semanticDigest, sourceRefDigest, journalDigest,
      input.runId, input.agentId, input.custodyId, prior.revision,
      prior.journalDigest,
    );
    if (changed.changes !== 1) throw new Error("lifecycle custody head compare-and-set failed");
    return this.readHead(input.runId, input.agentId, input.custodyId);
  }

  readPreparedChildCustodyTerminal(
    runId: string,
    agentId: string,
    custodyId: string,
    applyId: string,
  ): PreparedChildCustodyTerminal | null {
    const stored = this.#database.prepare(`
      SELECT batch.project_session_id,batch.planned_apply_id,batch.batch_id,
             batch.secondary_intent_kind,batch.review_adoption_reservation_id,
             batch.review_adoption_reservation_digest,batch.transition_replay_json,
             batch.transition_replay_digest,custody.bridge_owner_kind,
             effect.pre_revision,effect.final_revision,
             effect.effect_digest,effect.final_semantic_digest,
             effect.final_source_ref_digest,intent.subject_json,
             intent.subject_digest,intent.intent_digest,
             review_intent.subject_json AS review_subject_json,
             review_intent.subject_digest AS review_subject_digest,
             review_intent.intent_digest AS review_intent_digest
        FROM lifecycle_receipt_custody_effects effect
        JOIN lifecycle_receipt_batches batch ON batch.batch_id=effect.batch_id
        JOIN lifecycle_rotation_custodies custody
          ON custody.run_id=effect.run_id AND custody.agent_id=effect.agent_id
         AND custody.custody_id=effect.custody_id
        JOIN lifecycle_receipt_intents intent
          ON intent.batch_id=batch.batch_id AND intent.ordinal=1
        LEFT JOIN lifecycle_receipt_intents review_intent
          ON review_intent.batch_id=batch.batch_id AND review_intent.ordinal=2
       WHERE effect.run_id=? AND effect.agent_id=? AND effect.custody_id=?
         AND batch.planned_apply_id=?
    `).get(runId, agentId, custodyId, applyId);
    if (stored === undefined) return null;
    const value = row(stored, "prepared child custody terminal");
    const parsedSubject: unknown = JSON.parse(text(value, "subject_json"));
    if (typeof parsedSubject !== "object" || parsedSubject === null || Array.isArray(parsedSubject)) {
      throw new Error("prepared lifecycle receipt subject is invalid");
    }
    const subject = parsedSubject as Readonly<Record<string, unknown>>;
    const ownerRef = subject.ownerRef;
    if (typeof ownerRef !== "object" || ownerRef === null || Array.isArray(ownerRef)) {
      throw new Error("prepared lifecycle receipt owner reference is invalid");
    }
    const batchId = text(value, "batch_id");
    const subjectDigest = text(value, "subject_digest");
    const transitionReplayDigest = text(value, "transition_replay_digest");
    const fromState = subject.fromState;
    const disposition = subject.disposition;
    const proofKind = subject.terminalProofKind;
    const terminalEvidenceDigest = subject.terminalEvidenceDigest;
    if (
      !["awaiting-boundary", "prepared", "dispatched", "accepted", "ambiguous", "provider-terminal", "committing"]
        .includes(String(fromState)) ||
      !["adopted", "no-effect", "superseded", "quarantined"].includes(String(disposition)) ||
      !["provider-terminal", "zero-dispatch-no-effect", "predispatch-superseded",
        "postterminal-adoption-cas-superseded", "integrity-quarantine"].includes(String(proofKind)) ||
      typeof terminalEvidenceDigest !== "string"
    ) {
      throw new Error("prepared lifecycle terminal disposition is invalid");
    }
    const ownerKind = text(value, "bridge_owner_kind");
    if (ownerKind !== "chair" && ownerKind !== "child") throw new Error("lifecycle custody owner kind is invalid");
    const replay = row(JSON.parse(text(value, "transition_replay_json")), "prepared lifecycle transition replay");
    const parsedPlan = mutationPlan(row(replay.mutationPlan, "prepared lifecycle mutation plan"));
    const review = text(value, "secondary_intent_kind") === "review-adoption-decision"
      ? (() => {
          const reviewSubjectJson = text(value, "review_subject_json");
          const reviewSubject = row(JSON.parse(reviewSubjectJson), "prepared review subject");
          const decision = row(reviewSubject.reviewDecision, "prepared review decision");
          const reviewSubjectDigest = text(value, "review_subject_digest");
          const reviewIntent = {
            schemaVersion: 1,
            batchId,
            ordinalDec: "2",
            kind: "review-adoption-decision",
            subjectDigest: reviewSubjectDigest,
            transitionReplayDigest,
          };
          return {
            reservationId: text(value, "review_adoption_reservation_id"),
            reservationDigest: text(value, "review_adoption_reservation_digest"),
            decision,
            decisionDigest: text(reviewSubject, "reviewDecisionDigest"),
            cut: reviewSubject.certificationCut === null ? null : row(reviewSubject.certificationCut, "prepared review cut"),
            cutDigest: reviewSubject.certificationCutDigest === null ? null : text(reviewSubject, "certificationCutDigest"),
            subject: reviewSubject,
            subjectJson: reviewSubjectJson,
            subjectDigest: reviewSubjectDigest,
            intent: reviewIntent,
            intentJson: canonicalJson(reviewIntent),
            intentDigest: text(value, "review_intent_digest"),
            successorBinding: decision.successorBinding === null ? null :
              row(decision.successorBinding, "prepared successor binding"),
            rebindReceipt: reviewSubject.rebindReceipt === null ? null :
              row(reviewSubject.rebindReceipt, "prepared rebind receipt"),
          } satisfies PreparedReviewAdoption;
        })()
      : null;
    const intent = {
      schemaVersion: 1,
      batchId,
      ordinalDec: "1",
      kind: "custody-terminal",
      subjectDigest,
      transitionReplayDigest,
    };
    return {
      projectSessionId: text(value, "project_session_id"),
      runId,
      agentId,
      custodyId,
      preRevision: integer(value, "pre_revision"),
      finalRevision: integer(value, "final_revision"),
      applyId: text(value, "planned_apply_id"),
      batchId,
      effectDigest: text(value, "effect_digest"),
      ownerRefDigest: lifecycleDigest("receipt-owner-ref", ownerRef),
      transitionReplayDigest,
      subject,
      subjectJson: text(value, "subject_json"),
      subjectDigest,
      intent,
      intentJson: canonicalJson(intent),
      intentDigest: text(value, "intent_digest"),
      finalSemanticDigest: text(value, "final_semantic_digest"),
      finalSourceRefDigest: text(value, "final_source_ref_digest"),
      fromState: fromState as PreparedChildCustodyTerminal["fromState"],
      disposition: disposition as PreparedChildCustodyTerminal["disposition"],
      proofKind: proofKind as PreparedChildCustodyTerminal["proofKind"],
      terminalEvidenceDigest,
      ownerKind: ownerKind as "chair" | "child",
      mutationPlan: parsedPlan,
      review,
    };
  }

  #prepareReviewReservationInCurrentTransaction(input: Readonly<{
    runId: string;
    agentId: string;
    custodyId: string;
    applyId: string;
    commandId: string;
    head: LifecycleCustodyHead;
    finalRevision: number;
    finalSourceRefDigest: string;
    lifecycleAdoptionEvidenceDigest: string;
    recordedAt: number;
    source: Readonly<Record<string, unknown>>;
    mutationPlan: LifecycleMutationPlan;
  }>): ReviewReservationPlan {
    const highWaterRow = this.#database.prepare(`
      SELECT terminal_sequence FROM review_terminal_sequence_high_water WHERE run_id=?
    `).get(input.runId);
    const terminalSequenceHighWater = isRow(highWaterRow)
      ? integer(highWaterRow, "terminal_sequence") : 0;
    const target = this.#database.prepare(`
      SELECT * FROM review_completion_targets
       WHERE run_id=? AND state='current'
       ORDER BY target_generation DESC LIMIT 1
    `).get(input.runId);
    let targetGeneration: number | null = null;
    let predecessorBindingGeneration: number | null = null;
    let predecessorBindingDigest: string | null = null;
    let targetSnapshot: Readonly<Record<string, unknown>> | null = null;
    let bindingSnapshot: Readonly<Record<string, unknown>> | null = null;
    let reason: "no-current-target" | "target-subject-changed" | "binding-changed" | "target-head-changed" = "no-current-target";
    let sameSubject = false;
    let sourceMatches = false;
    let headMatches = false;
    if (isRow(target)) {
      targetSnapshot = target;
      targetGeneration = integer(target, "target_generation");
      const binding = this.#database.prepare(`
        SELECT binding.*,head.active_binding_generation,head.revision AS binding_head_revision
          FROM review_target_chair_bindings binding
          JOIN review_target_chair_binding_heads head
            ON head.run_id=binding.run_id AND head.target_generation=binding.target_generation
           AND head.active_binding_generation=binding.binding_generation
         WHERE binding.run_id=? AND binding.target_generation=?
      `).get(input.runId, targetGeneration);
      if (isRow(binding)) {
        bindingSnapshot = binding;
        predecessorBindingGeneration = integer(binding, "binding_generation");
        predecessorBindingDigest = text(binding, "binding_digest");
        const targetSubjectMatches = target.review_subject_digest === binding.review_subject_digest &&
          target.task_id === binding.task_id && target.reviewed_artifact_id === binding.reviewed_artifact_id &&
          target.delivery_review_basis_digest === binding.delivery_review_basis_digest &&
          target.repository_source_state_digest === binding.repository_source_state_digest &&
          target.bundle_digest === binding.bundle_digest;
        sourceMatches = binding.agent_id === input.agentId &&
          binding.adapter_id === input.source.source_adapter_id &&
          binding.adapter_contract_digest === input.source.source_adapter_contract_digest &&
          binding.principal_generation === input.source.source_principal_generation &&
          binding.provider_session_generation === input.source.source_provider_generation &&
          binding.bridge_generation === input.source.source_bridge_generation &&
          binding.chair_lease_generation === input.source.source_chair_lease_generation;
        headMatches = binding.active_binding_generation === binding.binding_generation;
        sameSubject = targetSubjectMatches;
        if (!targetSubjectMatches) reason = "target-subject-changed";
        else if (!sourceMatches) reason = "binding-changed";
        else if (!headMatches) reason = "target-head-changed";
        else reason = "binding-changed";
      } else {
        reason = "target-head-changed";
      }
    }
    const lifecycleCustodyRef = custodyRef(input.runId, input.agentId, input.custodyId, input.finalRevision);
    const cutBody = bindingSnapshot === null || targetGeneration === null || predecessorBindingGeneration === null ||
      predecessorBindingDigest === null
      ? null
      : {
          schemaVersion: 1,
          runId: input.runId,
          targetGeneration,
          predecessorBindingGeneration,
          predecessorBindingDigest,
          terminalSequenceHighWater,
          lifecycleCustodyRef,
          lifecycleAdoptionEvidenceDigest: input.lifecycleAdoptionEvidenceDigest,
        };
    const cutDigest = cutBody === null ? null : lifecycleDigest("review-certification-cut", cutBody);
    const rebound = targetSnapshot !== null && bindingSnapshot !== null && sameSubject && sourceMatches && headMatches &&
      targetGeneration !== null && predecessorBindingGeneration !== null && predecessorBindingDigest !== null &&
      cutBody !== null && cutDigest !== null;
    const successorBindingBody = rebound ? {
      run_id: input.runId,
      target_generation: targetGeneration,
      binding_generation: predecessorBindingGeneration! + 1,
      predecessor_binding_generation: predecessorBindingGeneration,
      predecessor_binding_digest: predecessorBindingDigest,
      predecessor_certification_cut_sequence: terminalSequenceHighWater,
      predecessor_certification_cut_digest: cutDigest,
      predecessor_certification_cut_custody_agent_id: input.agentId,
      predecessor_certification_cut_custody_id: input.custodyId,
      predecessor_certification_cut_custody_revision: input.finalRevision,
      agent_id: input.agentId,
      principal_generation: input.source.target_principal_generation,
      chair_lease_generation: input.source.source_chair_lease_generation,
      provider_session_generation: input.source.target_provider_generation,
      bridge_generation: input.source.target_bridge_generation,
      adapter_id: input.source.replacement_adapter_id,
      adapter_contract_digest: input.source.replacement_contract_digest,
      model_family: bindingSnapshot!.model_family,
      model: bindingSnapshot!.model,
      review_subject_digest: bindingSnapshot!.review_subject_digest,
      route_receipt_digest: bindingSnapshot!.route_receipt_digest,
      profile_digest: bindingSnapshot!.profile_digest,
      task_id: bindingSnapshot!.task_id,
      reviewed_artifact_id: bindingSnapshot!.reviewed_artifact_id,
      delivery_review_basis_digest: bindingSnapshot!.delivery_review_basis_digest,
      repository_source_state_digest: bindingSnapshot!.repository_source_state_digest,
      bundle_digest: bindingSnapshot!.bundle_digest,
      lifecycle_custody_id: input.custodyId,
      lifecycle_custody_revision: input.finalRevision,
      checkpoint_digest: input.source.checkpoint_digest,
      lifecycle_adoption_evidence_digest: input.lifecycleAdoptionEvidenceDigest,
    } : null;
    const successorBinding = successorBindingBody === null ? null : {
      ...successorBindingBody,
      binding_digest: lifecycleDigest("review-target-chair-binding", successorBindingBody),
    };
    const rebindReceiptBody = successorBinding === null || bindingSnapshot === null ? null : {
      run_id: input.runId,
      target_generation: targetGeneration,
      lifecycle_custody_agent_id: input.agentId,
      lifecycle_custody_id: input.custodyId,
      lifecycle_custody_revision: input.finalRevision,
      command_id: input.commandId,
      review_subject_digest: successorBinding.review_subject_digest,
      prior_binding_generation: predecessorBindingGeneration,
      new_binding_generation: successorBinding.binding_generation,
      prior_binding_digest: predecessorBindingDigest,
      new_binding_digest: successorBinding.binding_digest,
      lifecycle_adoption_digest: input.lifecycleAdoptionEvidenceDigest,
      bundle_digest: successorBinding.bundle_digest,
      profile_digest: successorBinding.profile_digest,
      slot_head_set_digest: lifecycleDigest("review-slot-head-set", successorBinding.route_receipt_digest),
      open_and_repair_finding_set_digest: lifecycleDigest("review-open-and-repair-finding-set", successorBinding.review_subject_digest),
    };
    const rebindReceipt = rebindReceiptBody === null ? null : {
      ...rebindReceiptBody,
      rebind_receipt_digest: lifecycleDigest("review-target-rebind-receipt", rebindReceiptBody),
    };
    const decision = {
      schemaVersion: 1,
      outcome: rebound ? "rebound" : "left-stale",
      reason: rebound ? null : reason,
      targetGeneration,
      predecessorBindingGeneration,
      predecessorBindingDigest,
      terminalSequenceHighWater,
      target: targetSnapshot,
      predecessorBinding: bindingSnapshot,
      certificationCut: cutBody === null ? null : { ...cutBody, cutDigest },
      successorBinding,
      lifecycleCustodyRef,
      lifecycleAdoptionEvidenceDigest: input.lifecycleAdoptionEvidenceDigest,
    };
    const decisionDigest = lifecycleDigest("review-adoption-decision", decision);
    const reservationId = `${input.applyId}:review`;
    const reservationBody = {
      schemaVersion: 1,
      reservationId,
      projectSessionId: input.head.projectSessionId,
      runId: input.runId,
      agentId: input.agentId,
      finalizedCustodyRef: lifecycleCustodyRef,
      adoptionEvidence: input.lifecycleAdoptionEvidenceDigest,
      terminalSequenceHighWater: String(terminalSequenceHighWater),
      target: targetSnapshot,
      predecessorBinding: bindingSnapshot,
      reviewDecision: decision,
      reviewDecisionDigest: decisionDigest,
      certificationCut: cutBody === null ? null : { ...cutBody, cutDigest },
      localMutationPlan: input.mutationPlan,
    };
    const reservationDigest = lifecycleDigest("review-adoption-reservation", reservationBody);
    this.#database.prepare(`
      INSERT INTO lifecycle_review_adoption_reservations(
        reservation_id,reservation_digest,project_session_id,run_id,agent_id,custody_id,
        finalized_custody_revision,target_generation,predecessor_binding_generation,
        predecessor_binding_digest,terminal_sequence_high_water,
        lifecycle_adoption_evidence_digest,review_decision_json,review_decision_digest,
        certification_cut_json,certification_cut_digest,certification_cut_key,
        recovery_source_kind,decision_loss_after_key,decision_loss_effect_key,
        local_write_set_digest,reservation_json,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'none','none','none',?,?,?)
    `).run(
      reservationId, reservationDigest, input.head.projectSessionId, input.runId, input.agentId,
      input.custodyId, input.finalRevision, targetGeneration, predecessorBindingGeneration,
      predecessorBindingDigest, String(terminalSequenceHighWater), input.lifecycleAdoptionEvidenceDigest,
      canonicalJson(decision), decisionDigest,
      cutBody === null ? null : canonicalJson({ ...cutBody, cutDigest }), cutDigest,
      cutDigest ?? "none", input.mutationPlan.writeSetDigest, canonicalJson(reservationBody), input.recordedAt,
    );
    return { reservationId, reservationDigest, decision, decisionDigest,
      cut: cutBody === null ? null : { ...cutBody, cutDigest }, cutDigest,
      successorBinding, rebindReceipt };
  }

  prepareChildCustodyTerminalInCurrentTransaction(
    input: PrepareChildCustodyTerminalInput,
  ): PreparedChildCustodyTerminal {
    if (!this.#database.inTransaction) throw new Error("lifecycle terminal preparation requires a transaction");
    const head = this.readHead(input.runId, input.agentId, input.custodyId);
    const terminal = input.terminal ?? {
      disposition: "adopted" as const,
      proofKind: "provider-terminal" as const,
      terminalEvidenceDigest: null,
    };
    const legalSource = terminal.disposition === "adopted"
      ? head.state === "committing" && terminal.proofKind === "provider-terminal"
      : terminal.disposition === "no-effect"
        ? (head.state === "awaiting-boundary" || head.state === "prepared") &&
          terminal.proofKind === "zero-dispatch-no-effect"
        : terminal.disposition === "superseded"
          ? ((head.state === "awaiting-boundary" || head.state === "prepared") &&
              terminal.proofKind === "predispatch-superseded") ||
            ((head.state === "provider-terminal" || head.state === "committing") &&
              terminal.proofKind === "postterminal-adoption-cas-superseded")
          : terminal.proofKind === "integrity-quarantine";
    if (head.revision !== input.expectedRevision || head.terminal || !legalSource) {
      throw new Error("lifecycle custody is not the expected terminal source head");
    }
    const source = row(this.#database.prepare(`
      SELECT custody.project_session_id,custody.bridge_owner_kind,custody.admission_digest,
             custody.provider_action_adapter_id,custody.provider_action_id,
             custody.source_adapter_id,custody.source_adapter_contract_digest,
             custody.source_provider_generation,custody.source_principal_generation,
             custody.source_bridge_generation,custody.source_chair_lease_generation,
             custody.replacement_adapter_id,custody.replacement_contract_digest,
             custody.target_provider_generation,custody.target_principal_generation,
             custody.target_bridge_generation,custody.checkpoint_digest,custody.command_id,
             revision.terminal_evidence_digest
        FROM lifecycle_rotation_custodies custody
        JOIN lifecycle_rotation_custody_revisions revision
          ON revision.run_id=custody.run_id AND revision.agent_id=custody.agent_id
         AND revision.custody_id=custody.custody_id AND revision.revision=?
       WHERE custody.run_id=? AND custody.agent_id=? AND custody.custody_id=?
    `).get(head.revision, input.runId, input.agentId, input.custodyId), "lifecycle committing custody");
    const ownerKind = text(source, "bridge_owner_kind");
    if (ownerKind !== "chair" && ownerKind !== "child") throw new Error("lifecycle custody owner kind is invalid");
    if (ownerKind === "chair" && terminal.disposition === "adopted") {
      throw new Error("true-chair lifecycle adoption requires ordinal-two review authority");
    }
    const normalizedMutationPlan = mutationPlan(input.mutationPlan);
    const terminalEvidenceDigest = terminal.terminalEvidenceDigest ?? text(source, "terminal_evidence_digest");
    const finalRevision = head.revision + 1;
    const finalBody = revisionBody({
      custodyId: input.custodyId,
      revision: finalRevision,
      state: "finalized",
      disposition: terminal.disposition,
      proofKind: terminal.proofKind,
      terminalEvidenceDigest,
    });
    const finalSemanticDigest = lifecycleDigest("custody-semantic", finalBody);
    const finalSourceRefDigest = finalSemanticDigest;
    const beforeRef = {
      kind: "custody",
      custodyRef: custodyRef(input.runId, input.agentId, input.custodyId, head.revision),
      sourceRefDigest: head.sourceRefDigest,
    };
    const afterRef = {
      kind: "custody",
      custodyRef: custodyRef(input.runId, input.agentId, input.custodyId, finalRevision),
      sourceRefDigest: finalSourceRefDigest,
    };
    const transitionProofDigest = lifecycleDigest("transition-proof", input.transitionProof);
    const mutationPlanDigest = normalizedMutationPlan.writeSetDigest;
    const reviewAdoptionEnabled = (): boolean => false;
    const reviewPlan = reviewAdoptionEnabled() && ownerKind === "chair" &&
      terminal.disposition === "adopted" && input.review !== undefined
      ? this.#prepareReviewReservationInCurrentTransaction({
          runId: input.runId,
          agentId: input.agentId,
          custodyId: input.custodyId,
          applyId: input.applyId,
          commandId: input.review.commandId,
          head,
          finalRevision,
          finalSourceRefDigest,
          lifecycleAdoptionEvidenceDigest: input.review.lifecycleAdoptionEvidenceDigest,
          recordedAt: input.recordedAt,
          source,
          mutationPlan: normalizedMutationPlan,
        })
      : null;
    const effectBody = {
      schemaVersion: 1,
      effectKind: "owner-transition",
      role: "primary",
      ownerBeforeRef: beforeRef,
      beforeJournalDigest: head.journalDigest,
      ownerAfterRef: afterRef,
      afterSemanticDigest: finalSemanticDigest,
    };
    const effectDigest = lifecycleDigest("lifecycle-effect", effectBody);
    const effectsSetDigest = lifecycleDigest("effect-set", [effectDigest]);
    const providerActionRef = {
      adapterId: text(source, "provider_action_adapter_id"),
      actionId: text(source, "provider_action_id"),
    };
    const replay = {
      schemaVersion: 1,
      transactionId: input.applyId,
      projectSessionId: head.projectSessionId,
      runId: input.runId,
      agentId: input.agentId,
      transitionKind: "custody-terminal",
      primaryOwnerBeforeRef: beforeRef,
      primaryOwnerAfterRef: afterRef,
      primaryOwnerBeforeJournalDigest: head.journalDigest,
      primaryOwnerAfterSemanticDigest: finalSemanticDigest,
      effectsSetDigest,
      admissionDigest: text(source, "admission_digest"),
      providerActionRef,
      recoverySource: { kind: "none" },
      terminalDisposition: terminal.disposition,
      terminalEvidenceDigest,
      transitionProof: input.transitionProof,
      transitionProofDigest,
      mutationPlan: normalizedMutationPlan,
      mutationPlanDigest,
      reviewReservationDigest: reviewPlan?.reservationDigest ?? null,
      freshHandoffDigest: null,
    };
    const transitionReplayDigest = lifecycleDigest("transition-replay", replay);
    const subject = {
      schemaVersion: 1,
      kind: "custody-terminal",
      projectSessionId: head.projectSessionId,
      runId: input.runId,
      agentId: input.agentId,
      ownerRef: afterRef,
      admissionDigest: text(source, "admission_digest"),
      providerActionRef,
      fromState: head.state,
      disposition: terminal.disposition,
      terminalProofKind: terminal.proofKind,
      terminalEvidenceDigest,
      recoverySource: { kind: "none" },
      recoverySourceDecisionDigest: null,
      linkedLossEffectDigest: null,
      transitionReplayDigest,
    };
    const subjectDigest = lifecycleDigest("receipt-subject", subject);
    const ownerRefDigest = lifecycleDigest("receipt-owner-ref", afterRef);
    const reviewSubject = reviewPlan === null ? null : {
      schemaVersion: 1,
      kind: "review-adoption-decision",
      projectSessionId: head.projectSessionId,
      runId: input.runId,
      agentId: input.agentId,
      ownerRef: afterRef,
      custodyTerminalSubjectDigest: subjectDigest,
      lifecycleAdoptionEvidenceDigest: input.review?.lifecycleAdoptionEvidenceDigest,
      reviewReservationDigest: reviewPlan.reservationDigest,
      reviewDecision: reviewPlan.decision,
      reviewDecisionDigest: reviewPlan.decisionDigest,
      successorBinding: reviewPlan.successorBinding,
      rebindReceipt: reviewPlan.rebindReceipt,
      certificationCut: reviewPlan.cut,
      certificationCutDigest: reviewPlan.cutDigest,
      recoverySource: { kind: "none" },
      recoverySourceDecisionDigest: null,
      transitionReplayDigest,
    };
    const reviewSubjectDigest = reviewSubject === null ? null : lifecycleDigest("receipt-subject", reviewSubject);
    const reviewIntentBody = reviewSubject === null ? null : {
      schemaVersion: 1,
      batchId: "pending",
      ordinalDec: "2",
      kind: "review-adoption-decision",
      subjectDigest: reviewSubjectDigest,
      transitionReplayDigest,
    };
    const orderedSubjectSetDigest = lifecycleDigest("receipt-subject-set", [{
      ordinalDec: "1",
      kind: "custody-terminal",
      ownerRefDigest,
      ownerRevisionDec: String(finalRevision),
      subjectDigest,
    }, ...(reviewSubject === null ? [] : [{
      ordinalDec: "2",
      kind: "review-adoption-decision",
      ownerRefDigest,
      ownerRevisionDec: String(finalRevision),
      subjectDigest: reviewSubjectDigest,
    }])]);
    const batchBody = {
      schemaVersion: 1,
      projectSessionId: head.projectSessionId,
      runId: input.runId,
      agentId: input.agentId,
      plannedApplyId: input.applyId,
      transitionKind: "custody-terminal",
      primaryOwnerBeforeRef: beforeRef,
      primaryOwnerAfterRef: afterRef,
      primaryOwnerBeforeJournalDigest: head.journalDigest,
      primaryOwnerAfterSemanticDigest: finalSemanticDigest,
      effectsSetDigest,
      transitionReplayDigest,
      orderedSubjectSetDigest,
      receiptIntentCountDec: reviewSubject === null ? "1" : "2",
      secondaryIntentKind: reviewSubject === null ? "none" : "review-adoption-decision",
      reviewReservationRef: reviewPlan === null ? null : {
        reservationId: reviewPlan.reservationId,
        reservationDigest: reviewPlan.reservationDigest,
      },
      freshHandoffRef: null,
    };
    const batchId = lifecycleDigest("receipt-batch-id", batchBody);
    const intentBody = {
      schemaVersion: 1,
      batchId,
      ordinalDec: "1",
      kind: "custody-terminal",
      subjectDigest,
      transitionReplayDigest,
    };
    const intentDigest = lifecycleDigest("receipt-intent", intentBody);
    const reviewIntent = reviewIntentBody === null ? null : {
      ...reviewIntentBody,
      batchId,
    };
    const reviewIntentDigest = reviewIntent === null ? null : lifecycleDigest("receipt-intent", reviewIntent);
    const subjectJson = canonicalJson(subject);
    const intentJson = canonicalJson(intentBody);
    this.#database.prepare(`
      INSERT INTO lifecycle_receipt_batches(
        batch_id,planned_apply_id,project_session_id,run_id,agent_id,transition_kind,
        planned_apply_kind,effects_set_digest,mutation_plan_digest,transition_replay_json,
        transition_replay_digest,ordered_subject_set_digest,receipt_intent_count,
        secondary_intent_kind,review_adoption_reservation_id,
        review_adoption_reservation_digest,review_decision_loss_effect_key,
        review_decision_loss_effect_role,review_decision_loss_effect_digest,
        review_decision_loss_after_id,review_decision_loss_after_revision,
        review_decision_loss_after_semantic_digest,review_decision_loss_after_source_ref_digest,
        fresh_handoff_id,fresh_handoff_digest,fresh_handoff_source_mode,fresh_handoff_key,
        recovery_retirement_id,recovery_retirement_plan_digest,created_at
      ) VALUES (
        @batchId,@applyId,@projectSessionId,@runId,@agentId,'custody-terminal','terminal',
        @effectsSetDigest,@mutationPlanDigest,@replayJson,@transitionReplayDigest,
        @orderedSubjectSetDigest,@intentCount,@secondaryKind,@reservationId,
        @reservationDigest,'none',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
        'none',NULL,NULL,@createdAt)
    `).run({
      batchId,
      applyId: input.applyId,
      projectSessionId: head.projectSessionId,
      runId: input.runId,
      agentId: input.agentId,
      effectsSetDigest,
      mutationPlanDigest,
      replayJson: canonicalJson(replay),
      transitionReplayDigest,
      orderedSubjectSetDigest,
      intentCount: reviewSubject === null ? 1 : 2,
      secondaryKind: reviewSubject === null ? "none" : "review-adoption-decision",
      reservationId: reviewPlan?.reservationId ?? null,
      reservationDigest: reviewPlan?.reservationDigest ?? null,
      createdAt: input.recordedAt,
    });
    this.#database.prepare(`
      INSERT INTO lifecycle_receipt_custody_effects(
        batch_id,ordinal,role,transition_kind,planned_apply_id,project_session_id,
        run_id,agent_id,custody_id,pre_revision,pre_journal_digest,final_revision,
        final_semantic_digest,final_source_ref_digest,effect_digest
      ) VALUES (?,1,'primary','custody-terminal',?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      batchId, input.applyId, head.projectSessionId, input.runId, input.agentId,
      input.custodyId, head.revision, head.journalDigest, finalRevision,
      finalSemanticDigest, finalSourceRefDigest, effectDigest,
    );
    this.#database.prepare(`
      INSERT INTO lifecycle_receipt_intents(
        batch_id,ordinal,batch_transition_kind,batch_intent_count,
        batch_secondary_intent_kind,kind,project_session_id,run_id,agent_id,
        subject_owner_kind,subject_owner_id,subject_owner_revision,
        custody_effect_digest,generation_loss_effect_role,generation_loss_effect_digest,
        recovery_retirement_effect_digest,fresh_origin_effect_digest,subject_json,
        subject_digest,intent_digest,created_at
      ) VALUES (?,1,'custody-terminal',?,?,'custody-terminal',?,?,?,
                'custody',?,?,?,NULL,NULL,NULL,NULL,?,?,?,?)
    `).run(
      batchId, reviewSubject === null ? 1 : 2, reviewSubject === null ? "none" : "review-adoption-decision",
      head.projectSessionId, input.runId, input.agentId, input.custodyId,
      finalRevision, effectDigest, subjectJson, subjectDigest, intentDigest,
      input.recordedAt,
    );
    if (reviewSubject !== null && reviewIntent !== null && reviewSubjectDigest !== null && reviewIntentDigest !== null) {
      this.#database.prepare(`
        INSERT INTO lifecycle_receipt_intents(
          batch_id,ordinal,batch_transition_kind,batch_intent_count,
          batch_secondary_intent_kind,kind,project_session_id,run_id,agent_id,
          subject_owner_kind,subject_owner_id,subject_owner_revision,
          custody_effect_digest,generation_loss_effect_role,generation_loss_effect_digest,
          recovery_retirement_effect_digest,fresh_origin_effect_digest,subject_json,
          subject_digest,intent_digest,created_at
        ) VALUES (?,2,'custody-terminal',2,'review-adoption-decision',
          'review-adoption-decision',?,?,?,'custody',?,?,?,NULL,NULL,NULL,NULL,?,?,?,?)
      `).run(
        batchId, head.projectSessionId, input.runId, input.agentId, input.custodyId,
        finalRevision, effectDigest, canonicalJson(reviewSubject), reviewSubjectDigest,
        reviewIntentDigest, input.recordedAt,
      );
    }
    const preparedReview = reviewPlan === null || reviewSubject === null || reviewIntent === null ||
      reviewSubjectDigest === null || reviewIntentDigest === null ? null : {
        reservationId: reviewPlan.reservationId,
        reservationDigest: reviewPlan.reservationDigest,
        decision: reviewPlan.decision,
        decisionDigest: reviewPlan.decisionDigest,
        cut: reviewPlan.cut,
        cutDigest: reviewPlan.cutDigest,
        subject: reviewSubject,
        subjectJson: canonicalJson(reviewSubject),
        subjectDigest: reviewSubjectDigest,
        intent: reviewIntent,
        intentJson: canonicalJson(reviewIntent),
        intentDigest: reviewIntentDigest,
        successorBinding: reviewPlan.successorBinding,
        rebindReceipt: reviewPlan.rebindReceipt,
      } satisfies PreparedReviewAdoption;
    return {
      projectSessionId: head.projectSessionId,
      runId: input.runId,
      agentId: input.agentId,
      custodyId: input.custodyId,
      preRevision: head.revision,
      finalRevision,
      applyId: input.applyId,
      batchId,
      effectDigest,
      ownerRefDigest,
      transitionReplayDigest,
      subject,
      subjectJson,
      subjectDigest,
      intent: intentBody,
      intentJson,
      intentDigest,
      finalSemanticDigest,
      finalSourceRefDigest,
      fromState: head.state as PreparedChildCustodyTerminal["fromState"],
      disposition: terminal.disposition,
      proofKind: terminal.proofKind,
      terminalEvidenceDigest,
      ownerKind: ownerKind as "chair" | "child",
      mutationPlan: normalizedMutationPlan,
      review: preparedReview,
    };
  }

  #writeReviewPostStateInCurrentTransaction(
    prepared: PreparedChildCustodyTerminal,
    reviewReceipt: NonNullable<ExternallyVerifiedChildCustodyAuthorization["reviewReceipt"]>,
    appliedAt: number,
  ): void {
    const review = prepared.review;
    if (review === null) return;
    if (review.cut !== null) {
      const cut = row(review.cut, "prepared review certification cut");
      const ref = row(cut.lifecycleCustodyRef, "prepared review custody reference");
      this.#database.prepare(`
        INSERT INTO review_certification_cuts(
          run_id,target_generation,predecessor_binding_generation,predecessor_binding_digest,
          terminal_sequence_high_water,lifecycle_custody_agent_id,lifecycle_custody_id,
          lifecycle_custody_revision,lifecycle_adoption_evidence_digest,cut_digest,created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        text(cut, "runId"), integer(cut, "targetGeneration"), integer(cut, "predecessorBindingGeneration"),
        text(cut, "predecessorBindingDigest"), integer(cut, "terminalSequenceHighWater"),
        text(ref, "agentId"), text(ref, "custodyId"), integer(ref, "custodyRevision"),
        text(cut, "lifecycleAdoptionEvidenceDigest"), text(cut, "cutDigest"), appliedAt,
      );
    }
    if (review.successorBinding !== null && review.rebindReceipt !== null) {
      const binding = row(review.successorBinding, "prepared successor review binding");
      this.#database.prepare(`
        INSERT INTO review_target_chair_bindings(
          run_id,target_generation,binding_generation,predecessor_binding_generation,
          predecessor_binding_digest,predecessor_certification_cut_sequence,
          predecessor_certification_cut_digest,predecessor_certification_cut_custody_agent_id,
          predecessor_certification_cut_custody_id,predecessor_certification_cut_custody_revision,
          agent_id,principal_generation,chair_lease_generation,provider_session_generation,
          bridge_generation,adapter_id,adapter_contract_digest,model_family,model,
          review_subject_digest,route_receipt_digest,profile_digest,task_id,reviewed_artifact_id,
          delivery_review_basis_digest,repository_source_state_digest,bundle_digest,
          lifecycle_custody_id,lifecycle_custody_revision,checkpoint_digest,
          lifecycle_adoption_evidence_digest,binding_digest,created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        binding.run_id, binding.target_generation, binding.binding_generation,
        binding.predecessor_binding_generation, binding.predecessor_binding_digest,
        binding.predecessor_certification_cut_sequence, binding.predecessor_certification_cut_digest,
        binding.predecessor_certification_cut_custody_agent_id,
        binding.predecessor_certification_cut_custody_id,
        binding.predecessor_certification_cut_custody_revision,
        binding.agent_id, binding.principal_generation, binding.chair_lease_generation,
        binding.provider_session_generation, binding.bridge_generation, binding.adapter_id,
        binding.adapter_contract_digest, binding.model_family, binding.model,
        binding.review_subject_digest, binding.route_receipt_digest, binding.profile_digest,
        binding.task_id, binding.reviewed_artifact_id, binding.delivery_review_basis_digest,
        binding.repository_source_state_digest, binding.bundle_digest,
        binding.lifecycle_custody_id, binding.lifecycle_custody_revision, binding.checkpoint_digest,
        binding.lifecycle_adoption_evidence_digest, binding.binding_digest, appliedAt,
      );
      const priorGeneration = integer(binding, "predecessor_binding_generation");
      const head = this.#database.prepare(`
        SELECT revision FROM review_target_chair_binding_heads
         WHERE run_id=? AND target_generation=? AND active_binding_generation=?
      `).get(binding.run_id, binding.target_generation, priorGeneration);
      if (!isRow(head)) throw new Error("review binding head changed before rebind");
      const headChanged = this.#database.prepare(`
        UPDATE review_target_chair_binding_heads
           SET active_binding_generation=?,revision=revision+1
         WHERE run_id=? AND target_generation=? AND active_binding_generation=? AND revision=?
      `).run(
        binding.binding_generation, binding.run_id, binding.target_generation, priorGeneration,
        integer(head, "revision"),
      );
      if (headChanged.changes !== 1) throw new Error("review binding head compare-and-set failed");
      const receipt = row(review.rebindReceipt, "prepared review rebind receipt");
      this.#database.prepare(`
        INSERT INTO review_target_rebind_receipts(
          run_id,target_generation,lifecycle_custody_agent_id,lifecycle_custody_id,
          lifecycle_custody_revision,command_id,review_subject_digest,
          prior_binding_generation,new_binding_generation,prior_binding_digest,
          new_binding_digest,lifecycle_adoption_digest,bundle_digest,profile_digest,
          slot_head_set_digest,open_and_repair_finding_set_digest,rebind_receipt_digest,created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        receipt.run_id, receipt.target_generation, receipt.lifecycle_custody_agent_id,
        receipt.lifecycle_custody_id, receipt.lifecycle_custody_revision, receipt.command_id,
        receipt.review_subject_digest, receipt.prior_binding_generation,
        receipt.new_binding_generation, receipt.prior_binding_digest, receipt.new_binding_digest,
        receipt.lifecycle_adoption_digest, receipt.bundle_digest, receipt.profile_digest,
        receipt.slot_head_set_digest, receipt.open_and_repair_finding_set_digest,
        receipt.rebind_receipt_digest, appliedAt,
      );
    }
    const decision = row(review.decision, "prepared review decision");
    const cutDigest = review.cutDigest;
    this.#database.prepare(`
      INSERT INTO lifecycle_review_authority_bindings(
        receipt_digest,intent_digest,batch_id,ordinal,subject_digest,kind,subject_owner_kind,
        project_session_id,run_id,agent_id,custody_id,custody_revision,review_reservation_digest,
        review_decision_digest,certification_cut_digest,certification_cut_key,
        decision_loss_after_key,decision_loss_effect_key,decision_loss_effect_role,
        decision_loss_effect_digest,apply_id
      ) VALUES (?,?,?,?,?,'review-adoption-decision','custody',?,?,?,?,?,?,?,?,?,'none','none',NULL,NULL,?)
    `).run(
      reviewReceipt.receiptDigest, review.intentDigest, prepared.batchId, 2,
      review.subjectDigest, prepared.projectSessionId, prepared.runId, prepared.agentId,
      prepared.custodyId, prepared.finalRevision, review.reservationDigest, review.decisionDigest,
      cutDigest, cutDigest ?? "none", prepared.applyId,
    );
    void decision;
  }

  applyAuthorizedChildCustodyTerminalInCurrentTransaction(
    input: ExternallyVerifiedChildCustodyAuthorization,
  ): LifecycleCustodyHead {
    if (!this.#database.inTransaction) throw new Error("lifecycle terminal apply requires a transaction");
    const prepared = input.prepared;
    const head = this.readHead(prepared.runId, prepared.agentId, prepared.custodyId);
    if (head.revision !== input.expectedRevision || head.revision !== prepared.preRevision ||
        head.state !== prepared.fromState || head.terminal) {
      throw new Error("lifecycle custody is not the expected terminal source head");
    }
    const plan = row(this.#database.prepare(`
      SELECT batch.transition_replay_digest,batch.mutation_plan_digest,
             batch.effects_set_digest,batch.secondary_intent_kind,
             intent.subject_json,intent.subject_digest,intent.intent_digest,
             effect.effect_digest,revision.terminal_evidence_digest
        FROM lifecycle_receipt_batches batch
        JOIN lifecycle_receipt_intents intent ON intent.batch_id=batch.batch_id AND intent.ordinal=1
        JOIN lifecycle_receipt_custody_effects effect ON effect.batch_id=batch.batch_id
        JOIN lifecycle_rotation_custody_revisions revision
          ON revision.run_id=batch.run_id AND revision.agent_id=batch.agent_id
         AND revision.custody_id=effect.custody_id AND revision.revision=effect.pre_revision
       WHERE batch.batch_id=? AND batch.planned_apply_id=?
         AND batch.project_session_id=? AND batch.run_id=? AND batch.agent_id=?
         AND effect.final_revision=? AND effect.final_semantic_digest=?
         AND effect.final_source_ref_digest=?
    `).get(
      prepared.batchId, prepared.applyId, prepared.projectSessionId, prepared.runId,
      prepared.agentId, prepared.finalRevision, prepared.finalSemanticDigest,
      prepared.finalSourceRefDigest,
    ), "prepared lifecycle terminal batch");
    const revalidatedMutationPlan = mutationPlan(
      prepared.mutationPlan as unknown as Readonly<Record<string, unknown>>,
    );
    if (text(plan, "mutation_plan_digest") !== revalidatedMutationPlan.writeSetDigest) {
      throw new Error("prepared lifecycle mutation plan changed");
    }
    const actualBusinessWrites = [...input.localWrites]
      .map((write) => ({
        relation: write.relation,
        keyDigest: lifecycleDigest("mutation-key", {
          schemaVersion: 1,
          relation: write.relation,
          key: write.key,
        }),
        operation: write.operation,
      }))
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
    const plannedBusinessWrites = revalidatedMutationPlan.writes
      .map((write) => ({
        relation: write.relation,
        keyDigest: write.keyDigest,
        operation: write.operation,
      }))
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
    if (canonicalJson(actualBusinessWrites) !== canonicalJson(plannedBusinessWrites)) {
      throw new Error("lifecycle actual write identities crossed the prepared mutation plan");
    }
    const effectRows = this.#database.prepare(`
      SELECT effect_digest,ordinal,role FROM lifecycle_receipt_custody_effects WHERE batch_id=?
      UNION ALL
      SELECT effect_digest,ordinal,role FROM lifecycle_receipt_generation_loss_effects WHERE batch_id=?
      UNION ALL
      SELECT effect_digest,receipt_ordinal AS ordinal,effect_role AS role
        FROM lifecycle_receipt_fresh_origin_effects WHERE batch_id=?
       ORDER BY ordinal,role
    `).all(prepared.batchId, prepared.batchId, prepared.batchId).map((candidate) => {
      const effect = row(candidate, "prepared lifecycle effect member");
      return [text(effect, "effect_digest"), integer(effect, "ordinal"), text(effect, "role")];
    });
    const effectsSetDigest = lifecycleDigest("effect-set", effectRows.map(([digest]) => digest));
    if (effectsSetDigest !== text(plan, "effects_set_digest")) {
      throw new Error("prepared lifecycle effect set changed");
    }
    const receiptBody = {
      schemaVersion: 1,
      kind: "custody-terminal",
      authorityId: input.receipt.authorityId,
      authoritySequence: input.receipt.authoritySequence,
      previousReceiptDigest: input.receipt.previousReceiptDigest,
      intentDigest: prepared.intentDigest,
      subjectDigest: prepared.subjectDigest,
    };
    const reviewReceipt = prepared.review === null ? null : input.reviewReceipt ?? null;
    if (prepared.review !== null && reviewReceipt === null) {
      throw new Error("true-chair review receipt is missing");
    }
    const reviewReceiptBody = reviewReceipt === null || prepared.review === null ? null : {
      schemaVersion: 1,
      kind: "review-adoption-decision",
      authorityId: reviewReceipt.authorityId,
      authoritySequence: reviewReceipt.authoritySequence,
      previousReceiptDigest: reviewReceipt.previousReceiptDigest,
      intentDigest: prepared.review.intentDigest,
      subjectDigest: prepared.review.subjectDigest,
    };
    const checkpointBody = {
      schemaVersion: 1,
      authorityId: input.receipt.authorityId,
      projectSessionId: prepared.projectSessionId,
      runId: prepared.runId,
      receiptCountDec: String(input.scopeCheckpoint.receiptCount),
      headAuthoritySequenceDec: String(input.scopeCheckpoint.headAuthoritySequence),
      headReceiptDigest: input.scopeCheckpoint.headReceiptDigest,
      orderedRecordSetDigest: input.scopeCheckpoint.orderedRecordSetDigest,
    };
    const authorizationValid = input.receipt.attestation.length > 0 &&
      input.scopeCheckpoint.attestation.length > 0 &&
      Number.isSafeInteger(input.receipt.authoritySequence) && input.receipt.authoritySequence >= 1 &&
      input.scopeCheckpoint.receiptCount >= input.receipt.authoritySequence &&
      input.scopeCheckpoint.headAuthoritySequence === input.scopeCheckpoint.receiptCount &&
      input.scopeCheckpoint.headReceiptDigest !== null &&
      input.receipt.receiptDigest === lifecycleDigest("authenticated-receipt", receiptBody) &&
      input.scopeCheckpoint.checkpointDigest === lifecycleDigest("scope-checkpoint", checkpointBody);
    if (!authorizationValid) throw new Error("externally verified lifecycle authorization is invalid");
    const reviewAuthorizationValid = reviewReceipt !== null && reviewReceiptBody !== null
      ? reviewReceipt.attestation.length > 0 &&
        Number.isSafeInteger(reviewReceipt.authoritySequence) && reviewReceipt.authoritySequence >= 1 &&
        reviewReceipt.authorityId === input.receipt.authorityId &&
        reviewReceipt.receiptDigest === lifecycleDigest("authenticated-receipt", reviewReceiptBody)
      : prepared.review === null;
    if (!reviewAuthorizationValid) throw new Error("externally verified review authorization is invalid");
    const scope = row(this.#database.prepare(`
      SELECT scope.authority_id,head.checkpoint_digest,head.revision
        FROM lifecycle_admitted_run_scopes scope
        JOIN lifecycle_receipt_scope_heads head
          ON head.project_session_id=scope.project_session_id AND head.run_id=scope.run_id
       WHERE scope.project_session_id=? AND scope.run_id=?
    `).get(prepared.projectSessionId, prepared.runId), "admitted lifecycle receipt scope");
    if (text(scope, "authority_id") !== input.receipt.authorityId ||
        text(scope, "checkpoint_digest") !== input.expectedScopeHead.checkpointDigest ||
        integer(scope, "revision") !== input.expectedScopeHead.revision) {
      throw new Error("externally verified lifecycle authorization is invalid");
    }
    const receiptJson = canonicalJson({ ...receiptBody, receiptDigest: input.receipt.receiptDigest,
      attestation: input.receipt.attestation });
    this.#database.prepare(`
      INSERT INTO lifecycle_authority_receipts(
        intent_digest,batch_id,ordinal,project_session_id,run_id,agent_id,kind,
        subject_owner_kind,subject_owner_id,subject_owner_revision,subject_digest,
        authority_id,authority_sequence,previous_authority_sequence,previous_receipt_digest,
        receipt_json,receipt_digest,attestation,verified_at
      ) VALUES (?, ?,1,?,?,?,'custody-terminal','custody',?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      prepared.intentDigest, prepared.batchId, prepared.projectSessionId, prepared.runId,
      prepared.agentId, prepared.custodyId, prepared.finalRevision, prepared.subjectDigest,
      input.receipt.authorityId, input.receipt.authoritySequence,
      input.receipt.authoritySequence === 1 ? null : input.receipt.authoritySequence - 1,
      input.receipt.previousReceiptDigest, receiptJson, input.receipt.receiptDigest,
      input.receipt.attestation, input.receipt.verifiedAt,
    );
    if (prepared.review !== null && reviewReceipt !== null) {
      const reviewReceiptJson = canonicalJson({ ...reviewReceiptBody!,
        receiptDigest: reviewReceipt.receiptDigest, attestation: reviewReceipt.attestation });
      this.#database.prepare(`
        INSERT INTO lifecycle_authority_receipts(
          intent_digest,batch_id,ordinal,project_session_id,run_id,agent_id,kind,
          subject_owner_kind,subject_owner_id,subject_owner_revision,subject_digest,
          authority_id,authority_sequence,previous_authority_sequence,previous_receipt_digest,
          receipt_json,receipt_digest,attestation,verified_at
        ) VALUES (?, ?,2,?,?,?,'review-adoption-decision','custody',?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        prepared.review.intentDigest, prepared.batchId, prepared.projectSessionId, prepared.runId,
        prepared.agentId, prepared.custodyId, prepared.finalRevision, prepared.review.subjectDigest,
        reviewReceipt.authorityId, reviewReceipt.authoritySequence,
        reviewReceipt.authoritySequence === 1 ? null : reviewReceipt.authoritySequence - 1,
        reviewReceipt.previousReceiptDigest, reviewReceiptJson, reviewReceipt.receiptDigest,
        reviewReceipt.attestation, reviewReceipt.verifiedAt,
      );
    }
    const checkpointJson = canonicalJson({ ...checkpointBody,
      checkpointDigest: input.scopeCheckpoint.checkpointDigest,
      attestation: input.scopeCheckpoint.attestation });
    this.#database.prepare(`
      INSERT INTO lifecycle_receipt_scope_checkpoints(
        project_session_id,run_id,authority_id,receipt_count,head_authority_sequence,
        head_receipt_digest,ordered_record_set_digest,checkpoint_json,checkpoint_digest,
        attestation,verified_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      prepared.projectSessionId, prepared.runId, input.receipt.authorityId,
      input.scopeCheckpoint.receiptCount, input.scopeCheckpoint.headAuthoritySequence,
      input.scopeCheckpoint.headReceiptDigest, input.scopeCheckpoint.orderedRecordSetDigest,
      checkpointJson, input.scopeCheckpoint.checkpointDigest,
      input.scopeCheckpoint.attestation, input.scopeCheckpoint.verifiedAt,
    );
    const scopeChanged = this.#database.prepare(`
      UPDATE lifecycle_receipt_scope_heads SET checkpoint_digest=?,revision=revision+1
       WHERE project_session_id=? AND run_id=? AND checkpoint_digest=? AND revision=?
    `).run(
      input.scopeCheckpoint.checkpointDigest, prepared.projectSessionId, prepared.runId,
      input.expectedScopeHead.checkpointDigest, input.expectedScopeHead.revision,
    );
    if (scopeChanged.changes !== 1) throw new Error("lifecycle receipt scope head compare-and-set failed");
    const receiptMembers = [{
      ordinalDec: "1",
      intentDigest: prepared.intentDigest,
      authorityId: input.receipt.authorityId,
      authoritySequenceDec: String(input.receipt.authoritySequence),
      receiptDigest: input.receipt.receiptDigest,
      subjectDigest: prepared.subjectDigest,
    }, ...(prepared.review === null || reviewReceipt === null ? [] : [{
      ordinalDec: "2",
      intentDigest: prepared.review.intentDigest,
      authorityId: reviewReceipt.authorityId,
      authoritySequenceDec: String(reviewReceipt.authoritySequence),
      receiptDigest: reviewReceipt.receiptDigest,
      subjectDigest: prepared.review.subjectDigest,
    }])];
    const receiptSetDigest = lifecycleDigest("authority-receipt-set", receiptMembers);
    const completionBody = {
      schemaVersion: 1,
      batchId: prepared.batchId,
      transitionKind: "custody-terminal",
      receiptIntentCountDec: prepared.review === null ? "1" : "2",
      secondaryIntentKind: prepared.review === null ? "none" : "review-adoption-decision",
      ordinalOne: {
        intentDigest: prepared.intentDigest,
        subjectDigest: prepared.subjectDigest,
        authorityReceiptDigest: input.receipt.receiptDigest,
      },
      ordinalTwo: prepared.review === null || reviewReceipt === null ? null : {
        intentDigest: prepared.review.intentDigest,
        subjectDigest: prepared.review.subjectDigest,
        authorityReceiptDigest: reviewReceipt.receiptDigest,
      },
      primaryEffect: { kind: "custody", effectDigest: prepared.effectDigest },
      linkedLossEffectDigest: null,
      secondaryEffect: null,
      effectsSetDigest,
      orderedAuthorityReceiptSetDigest: receiptSetDigest,
    };
    const completionDigest = lifecycleDigest("batch-completion", completionBody);
    this.#database.prepare(`
      INSERT INTO lifecycle_receipt_batch_completions(
        batch_id,transition_kind,receipt_intent_count,secondary_intent_kind,
        ordinal_one,ordinal_one_intent_digest,ordinal_one_subject_digest,
        ordinal_one_receipt_digest,ordinal_two,ordinal_two_intent_digest,
        ordinal_two_subject_digest,ordinal_two_receipt_digest,
        effects_set_digest,
        primary_custody_effect_digest,primary_loss_effect_role,
        primary_loss_effect_digest,primary_retirement_effect_digest,
        primary_fresh_origin_effect_role,primary_fresh_origin_effect_digest,
        linked_loss_effect_role,linked_loss_effect_digest,
        secondary_fresh_origin_effect_role,secondary_fresh_origin_effect_digest,
        ordered_authority_receipt_set_digest,completion_json,completion_digest,completed_at
      ) VALUES (?,'custody-terminal',?,?,1,?,?,?, ?,?,?,?, ?, ?,
                NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,?,?,?)
    `).run(
      prepared.batchId,
      prepared.review === null ? 1 : 2,
      prepared.review === null ? "none" : "review-adoption-decision",
      prepared.intentDigest, prepared.subjectDigest,
      input.receipt.receiptDigest,
      prepared.review === null ? null : 2,
      prepared.review?.intentDigest ?? null,
      prepared.review?.subjectDigest ?? null,
      reviewReceipt?.receiptDigest ?? null,
      effectsSetDigest,
      prepared.effectDigest, receiptSetDigest,
      canonicalJson(completionBody), completionDigest, input.authorizedAt,
    );
    const authorizationBody = {
      schemaVersion: 1,
      batchId: prepared.batchId,
      batchCompletionDigest: completionDigest,
      orderedAuthorityReceiptSetDigest: receiptSetDigest,
      verifiedScopeCheckpointDigest: input.scopeCheckpoint.checkpointDigest,
      authorizedAt: input.authorizedAt,
    };
    const authorizationDigest = lifecycleDigest("batch-authorization", authorizationBody);
    this.#database.prepare(`
      INSERT INTO lifecycle_receipt_batch_authorizations VALUES (?,?,?,?,?,?,?,?)
    `).run(
      prepared.batchId, prepared.projectSessionId, prepared.runId, completionDigest,
      receiptSetDigest, input.scopeCheckpoint.checkpointDigest, input.authorizedAt,
      authorizationDigest,
    );
    input.revalidateAdoptionWrites();
    const systemWrites: Array<Readonly<{
      relation: string;
      key: string;
      operation: "insert" | "update" | "delete";
    }>> = [
      { relation: "lifecycle_authority_receipts", key: `${prepared.batchId}:1`, operation: "insert" },
      ...(prepared.review === null ? [] : [{
        relation: "lifecycle_authority_receipts",
        key: `${prepared.batchId}:2`,
        operation: "insert" as const,
      }]),
      {
        relation: "lifecycle_receipt_scope_checkpoints",
        key: `${prepared.projectSessionId}:${prepared.runId}:${input.scopeCheckpoint.checkpointDigest}`,
        operation: "insert",
      },
      {
        relation: "lifecycle_receipt_scope_heads",
        key: `${prepared.projectSessionId}:${prepared.runId}`,
        operation: "update",
      },
      { relation: "lifecycle_receipt_batch_completions", key: prepared.batchId, operation: "insert" },
      { relation: "lifecycle_receipt_batch_authorizations", key: prepared.batchId, operation: "insert" },
      {
        relation: "lifecycle_rotation_custody_revisions",
        key: `${prepared.runId}:${prepared.agentId}:${prepared.custodyId}:${prepared.finalRevision}`,
        operation: "insert",
      },
      {
        relation: "lifecycle_rotation_custody_heads",
        key: `${prepared.runId}:${prepared.agentId}:${prepared.custodyId}`,
        operation: "update",
      },
      { relation: "lifecycle_transition_applies", key: prepared.applyId, operation: "insert" },
    ];
    const localWrites = [...input.localWrites, ...(input.auxiliaryLocalWrites ?? []), ...systemWrites]
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
    const localWriteSetDigest = lifecycleDigest("local-write-set", {
      schemaVersion: 1,
      writes: localWrites,
    });
    const applyBody = {
      schemaVersion: 1,
      applyKind: "terminal",
      applyId: prepared.applyId,
      receiptBatchId: prepared.batchId,
      batchCompletionDigest: completionDigest,
      transitionReplayDigest: text(plan, "transition_replay_digest"),
      orderedAuthorityReceiptSetDigest: receiptSetDigest,
      verifiedScopeCheckpointDigest: input.scopeCheckpoint.checkpointDigest,
      primaryOwnerAfterRef: {
        kind: "custody",
        custodyRef: custodyRef(prepared.runId, prepared.agentId, prepared.custodyId, prepared.finalRevision),
        sourceRefDigest: prepared.finalSourceRefDigest,
      },
      freshHandoffRef: null,
      freshSourceMode: null,
      freshApplyPlanDigest: null,
      newCustodyRef: null,
      generationLossAfterRef: null,
      freshOriginEffectDigest: null,
      appliedMutationPlanDigest: text(plan, "mutation_plan_digest"),
      localWriteSetDigest,
    };
    const applyDigest = lifecycleDigest("transition-apply", applyBody);
    const finalBody = revisionBody({
      custodyId: prepared.custodyId,
      revision: prepared.finalRevision,
      state: "finalized",
      disposition: prepared.disposition,
      proofKind: prepared.proofKind,
      terminalEvidenceDigest: prepared.terminalEvidenceDigest,
    });
    const finalSemanticDigest = lifecycleDigest("custody-semantic", finalBody);
    if (finalSemanticDigest !== prepared.finalSemanticDigest ||
        finalSemanticDigest !== prepared.finalSourceRefDigest) {
      throw new Error("prepared lifecycle terminal semantic changed");
    }
    const journal = custodyJournal({
      runId: prepared.runId,
      agentId: prepared.agentId,
      custodyId: prepared.custodyId,
      revision: prepared.finalRevision,
      priorJournalDigest: head.journalDigest,
      semanticDigest: finalSemanticDigest,
      sourceRefDigest: prepared.finalSourceRefDigest,
      authorityBatchId: prepared.batchId,
      authorityApplyId: prepared.applyId,
      authorityApplyDigest: applyDigest,
      recordedAt: input.appliedAt,
    });
    const journalJson = canonicalJson(journal);
    const journalDigest = lifecycleDigest("custody-journal", journal);
    this.#database.prepare(`
      INSERT INTO lifecycle_rotation_custody_revisions(
        project_session_id,run_id,agent_id,custody_id,revision,prior_revision,
        prior_journal_digest,state,disposition_code,proof_kind,terminal_evidence_digest,
        semantic_json,semantic_digest,source_ref_digest,origin_fresh_apply_id,
        origin_fresh_apply_digest,receipt_batch_id,receipt_apply_id,receipt_apply_digest,
        journal_json,journal_digest,recorded_at
      ) VALUES (?,?,?,?,?,?,?,'finalized',?,?,?,?,?,?,
                NULL,NULL,?,?,?,?,?,?)
    `).run(
      prepared.projectSessionId, prepared.runId, prepared.agentId, prepared.custodyId,
      prepared.finalRevision, head.revision, head.journalDigest,
      prepared.disposition, prepared.proofKind, prepared.terminalEvidenceDigest,
      canonicalJson(finalBody), finalSemanticDigest,
      prepared.finalSourceRefDigest, prepared.batchId, prepared.applyId, applyDigest,
      journalJson, journalDigest, input.appliedAt,
    );
    const headChanged = this.#database.prepare(`
      UPDATE lifecycle_rotation_custody_heads
         SET current_revision=?,state='finalized',disposition_code=?,
             semantic_digest=?,source_ref_digest=?,journal_digest=?,terminal=1,
             head_revision=head_revision+1
       WHERE run_id=? AND agent_id=? AND custody_id=? AND current_revision=?
         AND journal_digest=? AND terminal=0
    `).run(
      prepared.finalRevision, prepared.disposition, finalSemanticDigest, prepared.finalSourceRefDigest,
      journalDigest, prepared.runId, prepared.agentId, prepared.custodyId,
      head.revision, head.journalDigest,
    );
    if (headChanged.changes !== 1) throw new Error("lifecycle custody head compare-and-set failed");
    input.performAdoptionWrites();
    if (prepared.review !== null && reviewReceipt !== null) {
      this.#writeReviewPostStateInCurrentTransaction(prepared, reviewReceipt, input.appliedAt);
    }
    this.#database.prepare(`
      INSERT INTO lifecycle_transition_applies(
        apply_id,apply_kind,batch_transition_kind,receipt_batch_id,
        batch_completion_digest,transition_replay_digest,
        ordered_authority_receipt_set_digest,verified_scope_checkpoint_digest,
        applied_mutation_plan_digest,fresh_handoff_id,fresh_handoff_digest,
        fresh_handoff_key,fresh_project_session_id,fresh_run_id,fresh_agent_id,
        fresh_source_mode,fresh_apply_plan_digest,new_custody_id,new_custody_revision,
        new_custody_semantic_digest,new_custody_source_ref_digest,
        fresh_generation_loss_id,fresh_generation_loss_after_revision,
        fresh_generation_loss_after_semantic_digest,
        fresh_generation_loss_after_source_ref_digest,fresh_generation_loss_after_key,
        fresh_origin_effect_role,fresh_origin_effect_digest,local_write_set_digest,
        apply_json,apply_digest,applied_at
      ) VALUES (?,'terminal','custody-terminal',?,?,?,?,?,?,NULL,NULL,'none',
                NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
                'none',NULL,NULL,?,?,?,?)
    `).run(
      prepared.applyId, prepared.batchId, completionDigest,
      text(plan, "transition_replay_digest"), receiptSetDigest,
      input.scopeCheckpoint.checkpointDigest, text(plan, "mutation_plan_digest"),
      localWriteSetDigest, canonicalJson(applyBody), applyDigest, input.appliedAt,
    );
    return this.readHead(prepared.runId, prepared.agentId, prepared.custodyId);
  }

  readHead(runId: string, agentId: string, custodyId: string): LifecycleCustodyHead {
    const value = row(this.#database.prepare(`
      SELECT project_session_id,run_id,agent_id,custody_id,current_revision,state,
             disposition_code,semantic_digest,source_ref_digest,journal_digest,terminal
        FROM lifecycle_rotation_custody_heads
       WHERE run_id=? AND agent_id=? AND custody_id=?
    `).get(runId, agentId, custodyId), "lifecycle custody head");
    return {
      projectSessionId: text(value, "project_session_id"),
      runId: text(value, "run_id"),
      agentId: text(value, "agent_id"),
      custodyId: text(value, "custody_id"),
      revision: integer(value, "current_revision"),
      state: text(value, "state") as LifecycleCustodyState,
      disposition: text(value, "disposition_code") as LifecycleCustodyDisposition,
      semanticDigest: text(value, "semantic_digest"),
      sourceRefDigest: text(value, "source_ref_digest"),
      journalDigest: text(value, "journal_digest"),
      terminal: integer(value, "terminal") === 1,
    };
  }
}

import type Database from "better-sqlite3";
import { createHash } from "node:crypto";

import {
  canonicalJson,
  integer,
  nullableText,
  row,
  text,
} from "../project-session/store-support.js";

export type LifecycleRecoverySource =
  | Readonly<{ kind: "generation-loss"; generationLossId: string }>
  | Readonly<{ kind: "custody"; custodyId: string }>;

export type LifecycleRecoveryIssueStatus =
  | "active"
  | "commit-pending"
  | "consumed"
  | "revoked"
  | "expired";

export type LifecycleRecoveryIssueRecord = Readonly<{
  issueId: string;
  capabilityHash: string;
  operatorId: string;
  projectId: string;
  projectSessionId: string;
  runId: string;
  agentId: string;
  source: LifecycleRecoverySource;
  sourceRevision: number;
  sourceRefDigest: string;
  sourceJournalDigest: string;
  parentCapabilityId: string;
  consequentialGateId: string;
  issuanceDigest: string;
  issuedAt: number;
  expiresAt: number;
  status: LifecycleRecoveryIssueStatus;
}>;

export type CreateLifecycleRecoveryIssueInput = Readonly<{
  issueId: string;
  capabilityHash: string;
  operatorId: string;
  projectSessionId: string;
  runId: string;
  agentId: string;
  source: LifecycleRecoverySource;
  parentCapabilityId: string;
  consequentialGateId: string;
  issuedAt: number;
  expiresAt: number;
}>;

export type RevokeLifecycleRecoveryIssueInput = Readonly<{
  issueId: string;
  revocationKind: "operator-revoked" | "source-stale";
  evidence: unknown;
  revokedAt: number;
}>;

export type GenerationLossRecoveryHead = Readonly<{
  projectSessionId: string;
  runId: string;
  agentId: string;
  generationLossId: string;
  revision: number;
  state: "open" | "recovery-in-progress" | "recovered-adopted" | "abandoned";
  abandonKind: "none" | "direct-open" | "recovery-attempt";
  recoveryActionRef: Readonly<{ adapterId: string; actionId: string }> | null;
  activeRecoveryCustodyId: string | null;
  terminalEvidenceDigest: string | null;
  semanticDigest: string;
  sourceRefDigest: string;
  journalDigest: string;
  terminal: boolean;
}>;

export type BeginGenerationLossRecoveryInput = Readonly<{
  runId: string;
  agentId: string;
  generationLossId: string;
  custodyId: string;
  actionRef: Readonly<{ adapterId: string; actionId: string }>;
  originFreshApplyId: string;
  recordedAt: number;
}>;

export type SettleGenerationLossAttemptInput = Readonly<{
  runId: string;
  agentId: string;
  generationLossId: string;
  custodyId: string;
  actionRef: Readonly<{ adapterId: string; actionId: string }>;
  receiptApplyId: string;
  recordedAt: number;
}>;

export type AbandonGenerationLossInput = Readonly<{
  runId: string;
  agentId: string;
  generationLossId: string;
  receiptApplyId: string;
  recordedAt: number;
}>;

type ExactRecoverySourceBinding = Readonly<{
  projectId: string;
  sessionRevision: number;
  sessionGeneration: number;
  runRevision: number;
  sourceKind: LifecycleRecoverySource["kind"];
  sourceId: string;
  sourceRevision: number;
  sourceRefDigest: string;
  sourceJournalDigest: string;
  oldActionAdapterId: string | null;
  oldActionId: string | null;
  checkpointDigest: string | null;
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
  bridgeOwnerKind: "chair" | "child";
}>;

const ID_LIMIT = 256;

function requiredId(value: string, name: string): void {
  if (value.length === 0 || Buffer.byteLength(value, "utf8") > ID_LIMIT || value.includes("\0")) {
    throw new Error(`${name} must be a nonempty bounded identifier`);
  }
}

function nonnegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a nonnegative safe integer`);
  }
}

function lifecycleDigest(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(`agent-fabric.lifecycle.v1\0${domain}\0`)
    .update(canonicalJson(value))
    .digest("hex")}`;
}

function stringArray(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be a string array`);
  }
  return value;
}

function objectRecord(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

export class LifecycleRecoveryRepository {
  readonly #database: Database.Database;

  constructor(database: Database.Database) {
    this.#database = database;
  }

  createIssueInCurrentTransaction(
    input: CreateLifecycleRecoveryIssueInput,
  ): LifecycleRecoveryIssueRecord {
    if (!this.#database.inTransaction) {
      throw new Error("lifecycle recovery issue creation requires a transaction");
    }
    this.#validateIssueInput(input);
    const source = this.#exactSource(input);
    this.#assertIssueAuthority(input, source);
    const issuance = {
      schemaVersion: 1,
      issueId: input.issueId,
      capabilityHash: input.capabilityHash,
      operatorId: input.operatorId,
      projectId: source.projectId,
      projectSessionId: input.projectSessionId,
      runId: input.runId,
      agentId: input.agentId,
      sessionRevision: source.sessionRevision,
      sessionGeneration: source.sessionGeneration,
      runRevision: source.runRevision,
      recoverySource: {
        kind: source.sourceKind,
        sourceId: source.sourceId,
        sourceRevision: source.sourceRevision,
        sourceRefDigest: source.sourceRefDigest,
        sourceJournalDigest: source.sourceJournalDigest,
      },
      checkpointDigest: source.checkpointDigest,
      sourceProviderSessionRef: source.sourceProviderSessionRef,
      sourceCapabilityHash: source.sourceCapabilityHash,
      sourceActionRef: {
        adapterId: source.sourceAdapterId,
        actionId: source.sourceCustodyActionId,
      },
      sourceAdapterContractDigest: source.sourceAdapterContractDigest,
      sourceBridgeRowId: source.sourceBridgeRowId,
      sourceBridgeRevision: source.sourceBridgeRevision,
      sourceProviderGeneration: source.sourceProviderGeneration,
      sourcePrincipalGeneration: source.sourcePrincipalGeneration,
      sourceBridgeGeneration: source.sourceBridgeGeneration,
      sourceProjectSessionGeneration: source.sourceProjectSessionGeneration,
      sourceRunGeneration: source.sourceRunGeneration,
      sourceChairLeaseGeneration: source.sourceChairLeaseGeneration,
      bridgeOwnerKind: source.bridgeOwnerKind,
      parentCapabilityId: input.parentCapabilityId,
      consequentialGateId: input.consequentialGateId,
      path: "fresh-rotate",
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    };
    const issuanceJson = canonicalJson(issuance);
    const issuanceDigest = lifecycleDigest("recovery-issue", issuance);
    const existing = this.#database.prepare(`
      SELECT capability_hash,issuance_json FROM agent_lifecycle_recovery_capability_issues
       WHERE issue_id=?
    `).get(input.issueId);
    if (existing !== undefined) {
      const stored = row(existing, "lifecycle recovery issue replay");
      if (
        text(stored, "capability_hash") !== input.capabilityHash ||
        text(stored, "issuance_json") !== issuanceJson
      ) {
        throw new Error("recovery issue replay conflicts with its immutable issuance");
      }
      return this.readIssue(input.issueId, input.issuedAt);
    }
    this.#database.prepare(`
      INSERT INTO agent_lifecycle_recovery_capability_issues(
        issue_id,capability_hash,operator_id,project_id,project_session_id,run_id,agent_id,
        session_revision,session_generation,run_revision,recovery_source_kind,
        old_custody_id,old_action_adapter_id,old_action_id,old_custody_revision,
        generation_loss_id,generation_loss_revision,recovery_source_ref_digest,
        source_journal_digest,checkpoint_digest,
        source_provider_session_ref,source_capability_hash,source_custody_action_id,
        source_adapter_id,source_adapter_contract_digest,source_bridge_row_id,
        source_bridge_revision,source_provider_generation,source_principal_generation,
        source_bridge_generation,source_project_session_generation,source_run_generation,
        source_chair_lease_generation,bridge_owner_kind,parent_capability_id,
        consequential_gate_id,path,issuance_json,issuance_digest,issued_at,expires_at
      ) VALUES (
        @issueId,@capabilityHash,@operatorId,@projectId,@projectSessionId,@runId,@agentId,
        @sessionRevision,@sessionGeneration,@runRevision,@sourceKind,
        @oldCustodyId,@oldActionAdapterId,@oldActionId,@oldCustodyRevision,
        @generationLossId,@generationLossRevision,@sourceRefDigest,
        @sourceJournalDigest,@checkpointDigest,
        @sourceProviderSessionRef,@sourceCapabilityHash,@sourceCustodyActionId,
        @sourceAdapterId,@sourceAdapterContractDigest,@sourceBridgeRowId,
        @sourceBridgeRevision,@sourceProviderGeneration,@sourcePrincipalGeneration,
        @sourceBridgeGeneration,@sourceProjectSessionGeneration,@sourceRunGeneration,
        @sourceChairLeaseGeneration,@bridgeOwnerKind,@parentCapabilityId,
        @consequentialGateId,'fresh-rotate',@issuanceJson,@issuanceDigest,@issuedAt,@expiresAt
      )
    `).run({
      issueId: input.issueId,
      capabilityHash: input.capabilityHash,
      operatorId: input.operatorId,
      projectId: source.projectId,
      projectSessionId: input.projectSessionId,
      runId: input.runId,
      agentId: input.agentId,
      sessionRevision: source.sessionRevision,
      sessionGeneration: source.sessionGeneration,
      runRevision: source.runRevision,
      sourceKind: source.sourceKind,
      oldCustodyId: source.sourceKind === "custody" ? source.sourceId : null,
      oldActionAdapterId: source.oldActionAdapterId,
      oldActionId: source.oldActionId,
      oldCustodyRevision: source.sourceKind === "custody" ? source.sourceRevision : null,
      generationLossId: source.sourceKind === "generation-loss" ? source.sourceId : null,
      generationLossRevision: source.sourceKind === "generation-loss" ? source.sourceRevision : null,
      sourceRefDigest: source.sourceRefDigest,
      sourceJournalDigest: source.sourceJournalDigest,
      checkpointDigest: source.checkpointDigest,
      sourceProviderSessionRef: source.sourceProviderSessionRef,
      sourceCapabilityHash: source.sourceCapabilityHash,
      sourceCustodyActionId: source.sourceCustodyActionId,
      sourceAdapterId: source.sourceAdapterId,
      sourceAdapterContractDigest: source.sourceAdapterContractDigest,
      sourceBridgeRowId: source.sourceBridgeRowId,
      sourceBridgeRevision: source.sourceBridgeRevision,
      sourceProviderGeneration: source.sourceProviderGeneration,
      sourcePrincipalGeneration: source.sourcePrincipalGeneration,
      sourceBridgeGeneration: source.sourceBridgeGeneration,
      sourceProjectSessionGeneration: source.sourceProjectSessionGeneration,
      sourceRunGeneration: source.sourceRunGeneration,
      sourceChairLeaseGeneration: source.sourceChairLeaseGeneration,
      bridgeOwnerKind: source.bridgeOwnerKind,
      parentCapabilityId: input.parentCapabilityId,
      consequentialGateId: input.consequentialGateId,
      issuanceJson,
      issuanceDigest,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    });
    return this.readIssue(input.issueId, input.issuedAt);
  }

  readIssue(issueId: string, now: number): LifecycleRecoveryIssueRecord {
    requiredId(issueId, "issueId");
    nonnegativeInteger(now, "now");
    const stored = row(this.#database.prepare(`
      SELECT issue.*,revocation.issue_id AS revoked_issue_id,
             handoff.handoff_id,apply.apply_id
        FROM agent_lifecycle_recovery_capability_issues issue
        LEFT JOIN agent_lifecycle_recovery_issue_revocations revocation
          ON revocation.issue_id=issue.issue_id
        LEFT JOIN lifecycle_fresh_recovery_handoffs handoff
          ON handoff.issue_id=issue.issue_id
        LEFT JOIN lifecycle_transition_applies apply
          ON apply.fresh_handoff_id=handoff.handoff_id
       WHERE issue.issue_id=?
    `).get(issueId), "lifecycle recovery issue");
    const sourceKind = text(stored, "recovery_source_kind");
    const source: LifecycleRecoverySource = sourceKind === "generation-loss"
      ? { kind: "generation-loss", generationLossId: text(stored, "generation_loss_id") }
      : sourceKind === "custody"
        ? { kind: "custody", custodyId: text(stored, "old_custody_id") }
        : (() => { throw new Error("lifecycle recovery issue has an invalid source kind"); })();
    const status: LifecycleRecoveryIssueStatus = stored.apply_id !== null
      ? "consumed"
      : stored.handoff_id !== null
        ? "commit-pending"
        : stored.revoked_issue_id !== null
          ? "revoked"
          : integer(stored, "expires_at") <= now
            ? "expired"
            : "active";
    return {
      issueId: text(stored, "issue_id"),
      capabilityHash: text(stored, "capability_hash"),
      operatorId: text(stored, "operator_id"),
      projectId: text(stored, "project_id"),
      projectSessionId: text(stored, "project_session_id"),
      runId: text(stored, "run_id"),
      agentId: text(stored, "agent_id"),
      source,
      sourceRevision: source.kind === "generation-loss"
        ? integer(stored, "generation_loss_revision")
        : integer(stored, "old_custody_revision"),
      sourceRefDigest: text(stored, "recovery_source_ref_digest"),
      sourceJournalDigest: text(stored, "source_journal_digest"),
      parentCapabilityId: text(stored, "parent_capability_id"),
      consequentialGateId: text(stored, "consequential_gate_id"),
      issuanceDigest: text(stored, "issuance_digest"),
      issuedAt: integer(stored, "issued_at"),
      expiresAt: integer(stored, "expires_at"),
      status,
    };
  }

  revokeIssueInCurrentTransaction(
    input: RevokeLifecycleRecoveryIssueInput,
  ): LifecycleRecoveryIssueRecord {
    if (!this.#database.inTransaction) {
      throw new Error("lifecycle recovery issue revocation requires a transaction");
    }
    requiredId(input.issueId, "issueId");
    nonnegativeInteger(input.revokedAt, "revokedAt");
    const issue = this.readIssue(input.issueId, input.revokedAt);
    if (input.revokedAt < issue.issuedAt) {
      throw new Error("recovery issue revocation predates issuance");
    }
    const evidenceDigest = lifecycleDigest("recovery-issue-revocation", {
      schemaVersion: 1,
      issueId: input.issueId,
      revocationKind: input.revocationKind,
      evidence: input.evidence,
      revokedAt: input.revokedAt,
    });
    const existing = this.#database.prepare(`
      SELECT revocation_kind,evidence_digest,revoked_at
        FROM agent_lifecycle_recovery_issue_revocations WHERE issue_id=?
    `).get(input.issueId);
    if (existing !== undefined) {
      const stored = row(existing, "lifecycle recovery issue revocation replay");
      if (
        text(stored, "revocation_kind") !== input.revocationKind ||
        text(stored, "evidence_digest") !== evidenceDigest ||
        integer(stored, "revoked_at") !== input.revokedAt
      ) {
        throw new Error("recovery issue revocation conflicts with its immutable record");
      }
      return this.readIssue(input.issueId, input.revokedAt);
    }
    if (issue.status === "commit-pending" || issue.status === "consumed") {
      throw new Error("recovery issue cannot be revoked after its handoff");
    }
    this.#database.prepare(`
      INSERT INTO agent_lifecycle_recovery_issue_revocations(
        issue_id,revocation_kind,evidence_digest,revoked_at
      ) VALUES (?,?,?,?)
    `).run(input.issueId, input.revocationKind, evidenceDigest, input.revokedAt);
    return this.readIssue(input.issueId, input.revokedAt);
  }

  readGenerationLossHead(
    runId: string,
    agentId: string,
    generationLossId: string,
  ): GenerationLossRecoveryHead {
    requiredId(runId, "runId");
    requiredId(agentId, "agentId");
    requiredId(generationLossId, "generationLossId");
    const stored = row(this.#database.prepare(`
      SELECT head.project_session_id,head.run_id,head.agent_id,
             head.generation_loss_id,head.current_revision,head.state,
             head.abandon_kind_code,head.semantic_digest,head.source_ref_digest,
             head.journal_digest,head.terminal,revision.recovery_action_adapter_id,
             revision.recovery_action_id,revision.active_recovery_custody_id,
             revision.terminal_evidence_digest
        FROM lifecycle_generation_loss_heads head
        JOIN lifecycle_generation_loss_revisions revision
          ON revision.run_id=head.run_id AND revision.agent_id=head.agent_id
         AND revision.generation_loss_id=head.generation_loss_id
         AND revision.revision=head.current_revision
       WHERE head.run_id=? AND head.agent_id=? AND head.generation_loss_id=?
    `).get(runId, agentId, generationLossId), "generation-loss recovery head");
    const state = text(stored, "state");
    if (![
      "open", "recovery-in-progress", "recovered-adopted", "abandoned",
    ].includes(state)) throw new Error("generation-loss recovery head has an invalid state");
    const abandonKind = text(stored, "abandon_kind_code");
    if (!["none", "direct-open", "recovery-attempt"].includes(abandonKind)) {
      throw new Error("generation-loss recovery head has an invalid abandon kind");
    }
    const adapterId = nullableText(stored, "recovery_action_adapter_id");
    const actionId = nullableText(stored, "recovery_action_id");
    if ((adapterId === null) !== (actionId === null)) {
      throw new Error("generation-loss recovery head has a crossed action pair");
    }
    return {
      projectSessionId: text(stored, "project_session_id"),
      runId: text(stored, "run_id"),
      agentId: text(stored, "agent_id"),
      generationLossId: text(stored, "generation_loss_id"),
      revision: integer(stored, "current_revision"),
      state: state as GenerationLossRecoveryHead["state"],
      abandonKind: abandonKind as GenerationLossRecoveryHead["abandonKind"],
      recoveryActionRef: adapterId === null || actionId === null ? null : { adapterId, actionId },
      activeRecoveryCustodyId: nullableText(stored, "active_recovery_custody_id"),
      terminalEvidenceDigest: nullableText(stored, "terminal_evidence_digest"),
      semanticDigest: text(stored, "semantic_digest"),
      sourceRefDigest: text(stored, "source_ref_digest"),
      journalDigest: text(stored, "journal_digest"),
      terminal: integer(stored, "terminal") === 1,
    };
  }

  beginGenerationLossRecoveryInCurrentTransaction(
    input: BeginGenerationLossRecoveryInput,
  ): GenerationLossRecoveryHead {
    if (!this.#database.inTransaction) {
      throw new Error("generation-loss recovery start requires a transaction");
    }
    requiredId(input.runId, "runId");
    requiredId(input.agentId, "agentId");
    requiredId(input.generationLossId, "generationLossId");
    requiredId(input.custodyId, "custodyId");
    requiredId(input.actionRef.adapterId, "actionRef.adapterId");
    requiredId(input.actionRef.actionId, "actionRef.actionId");
    requiredId(input.originFreshApplyId, "originFreshApplyId");
    nonnegativeInteger(input.recordedAt, "recordedAt");
    const before = this.readGenerationLossHead(input.runId, input.agentId, input.generationLossId);
    if (before.state === "recovery-in-progress") {
      const replay = row(this.#database.prepare(`
        SELECT origin_fresh_apply_id,recorded_at
          FROM lifecycle_generation_loss_revisions
         WHERE run_id=? AND agent_id=? AND generation_loss_id=? AND revision=?
      `).get(input.runId, input.agentId, input.generationLossId, before.revision), "generation-loss recovery replay");
      if (
        before.activeRecoveryCustodyId !== input.custodyId ||
        canonicalJson(before.recoveryActionRef) !== canonicalJson(input.actionRef) ||
        text(replay, "origin_fresh_apply_id") !== input.originFreshApplyId ||
        integer(replay, "recorded_at") !== input.recordedAt
      ) {
        throw new Error("generation-loss recovery replay conflicts with its active attempt");
      }
      return before;
    }
    if (before.state !== "open" || before.terminal) {
      throw new Error("generation-loss recovery requires one open source");
    }
    const body = this.#generationLossRevisionBody({
      generationLossId: input.generationLossId,
      revision: before.revision + 1,
      state: "recovery-in-progress",
      abandonKind: "none",
      recoveryActionRef: input.actionRef,
      activeRecoveryCustodyId: input.custodyId,
      terminalEvidenceDigest: null,
    });
    const semanticJson = canonicalJson(body);
    const semanticDigest = lifecycleDigest("generation-loss-semantic", body);
    const sourceRefDigest = semanticDigest;
    const authorization = row(this.#database.prepare(`
      SELECT custody.project_session_id,custody.recovery_from_generation_loss_id,
             custody.recovery_from_generation_loss_revision,
             custody.recovery_source_ref_digest,custody.recovery_source_journal_digest,
             custody.provider_action_adapter_id,custody.provider_action_id,
             custody_head.current_revision AS custody_revision,
             custody_revision.semantic_digest AS custody_semantic_digest,
             custody_revision.source_ref_digest AS custody_source_ref_digest,
             custody_revision.origin_fresh_apply_id AS custody_origin_apply_id,
             custody_revision.origin_fresh_apply_digest AS custody_origin_apply_digest,
             source.source_adapter_id,source.source_custody_action_id,
             action.status AS action_status,action.execution_count,action.effect_count,
             handoff.handoff_id,handoff.handoff_digest,handoff.source_mode,
             handoff.fresh_apply_plan_digest,handoff.affected_generation_loss_after_revision,
             handoff.affected_generation_loss_after_semantic_digest,
             handoff.affected_generation_loss_after_source_ref_digest,
             batch.batch_id,batch.transition_replay_digest,batch.mutation_plan_digest,
             completion.completion_digest,completion.ordered_authority_receipt_set_digest,
             authority.verified_scope_checkpoint_digest,
             effect.effect_json,effect.effect_digest,effect.new_custody_revision,
             effect.new_custody_semantic_digest,effect.new_custody_source_ref_digest,
             effect.affected_generation_loss_after_revision AS effect_loss_revision,
             effect.affected_generation_loss_after_semantic_digest AS effect_loss_semantic_digest,
             effect.affected_generation_loss_after_source_ref_digest AS effect_loss_source_ref_digest
        FROM lifecycle_rotation_custodies custody
        JOIN lifecycle_rotation_custody_heads custody_head
          ON custody_head.run_id=custody.run_id AND custody_head.agent_id=custody.agent_id
         AND custody_head.custody_id=custody.custody_id
        JOIN lifecycle_rotation_custody_revisions custody_revision
          ON custody_revision.run_id=custody_head.run_id
         AND custody_revision.agent_id=custody_head.agent_id
         AND custody_revision.custody_id=custody_head.custody_id
         AND custody_revision.revision=custody_head.current_revision
        JOIN lifecycle_generation_losses source
          ON source.run_id=custody.run_id AND source.agent_id=custody.agent_id
         AND source.generation_loss_id=custody.recovery_from_generation_loss_id
        JOIN provider_actions action
          ON action.adapter_id=custody.provider_action_adapter_id
         AND action.action_id=custody.provider_action_id
        JOIN lifecycle_fresh_recovery_handoffs handoff
          ON handoff.handoff_id=custody.origin_fresh_handoff_id
         AND handoff.new_custody_id=custody.custody_id
         AND handoff.planned_apply_id=?
        JOIN agent_lifecycle_recovery_capability_issues issue
          ON issue.issue_id=handoff.issue_id
        JOIN agent_lifecycle_recovery_source_heads issue_head
          ON issue_head.issue_id=issue.issue_id
        LEFT JOIN agent_lifecycle_recovery_issue_revocations issue_revocation
          ON issue_revocation.issue_id=issue.issue_id
        JOIN lifecycle_receipt_batches batch
          ON batch.fresh_handoff_id=handoff.handoff_id
         AND batch.planned_apply_id=handoff.planned_apply_id
         AND batch.transition_kind='fresh-origin'
         AND batch.planned_apply_kind='fresh'
        JOIN lifecycle_receipt_fresh_origin_effects effect
          ON effect.batch_id=batch.batch_id AND effect.effect_role='primary'
        JOIN lifecycle_receipt_batch_completions completion
          ON completion.batch_id=batch.batch_id
         AND completion.primary_fresh_origin_effect_digest=effect.effect_digest
        JOIN lifecycle_receipt_batch_authorizations authority
          ON authority.batch_id=batch.batch_id
         AND authority.batch_completion_digest=completion.completion_digest
       WHERE custody.run_id=? AND custody.agent_id=? AND custody.custody_id=?
         AND custody.recovery_source_kind='generation-loss'
         AND handoff.source_mode='open-generation-loss'
         AND issue.expires_at>? AND issue_revocation.issue_id IS NULL
    `).get(
      input.originFreshApplyId, input.runId, input.agentId, input.custodyId,
      input.recordedAt,
    ), "authorized generation-loss recovery start");
    if (
      text(authorization, "project_session_id") !== before.projectSessionId ||
      text(authorization, "recovery_from_generation_loss_id") !== input.generationLossId ||
      integer(authorization, "recovery_from_generation_loss_revision") !== before.revision ||
      text(authorization, "recovery_source_ref_digest") !== before.sourceRefDigest ||
      text(authorization, "recovery_source_journal_digest") !== before.journalDigest ||
      text(authorization, "provider_action_adapter_id") !== input.actionRef.adapterId ||
      text(authorization, "provider_action_id") !== input.actionRef.actionId ||
      (
        text(authorization, "source_adapter_id") === input.actionRef.adapterId &&
        text(authorization, "source_custody_action_id") === input.actionRef.actionId
      ) ||
      text(authorization, "action_status") !== "prepared" ||
      integer(authorization, "execution_count") !== 0 ||
      integer(authorization, "effect_count") !== 0 ||
      integer(authorization, "affected_generation_loss_after_revision") !== before.revision + 1 ||
      text(authorization, "affected_generation_loss_after_semantic_digest") !== semanticDigest ||
      text(authorization, "affected_generation_loss_after_source_ref_digest") !== sourceRefDigest ||
      integer(authorization, "effect_loss_revision") !== before.revision + 1 ||
      text(authorization, "effect_loss_semantic_digest") !== semanticDigest ||
      text(authorization, "effect_loss_source_ref_digest") !== sourceRefDigest
    ) {
      throw new Error("generation-loss recovery authorization is crossed");
    }
    const freshEffect = objectRecord(
      JSON.parse(text(authorization, "effect_json")) as unknown,
      "fresh recovery effect",
    );
    const localWriteSetDigest = freshEffect.localWriteSetDigest;
    if (typeof localWriteSetDigest !== "string") {
      throw new Error("fresh recovery effect has no local write-set digest");
    }
    const applyBody = {
      schemaVersion: 1,
      applyId: input.originFreshApplyId,
      applyKind: "fresh",
      receiptBatchId: text(authorization, "batch_id"),
      batchCompletionDigest: text(authorization, "completion_digest"),
      transitionReplayDigest: text(authorization, "transition_replay_digest"),
      orderedAuthorityReceiptSetDigest: text(authorization, "ordered_authority_receipt_set_digest"),
      verifiedScopeCheckpointDigest: text(authorization, "verified_scope_checkpoint_digest"),
      appliedMutationPlanDigest: text(authorization, "mutation_plan_digest"),
      freshHandoffId: text(authorization, "handoff_id"),
      freshHandoffDigest: text(authorization, "handoff_digest"),
      projectSessionId: before.projectSessionId,
      runId: input.runId,
      agentId: input.agentId,
      sourceMode: text(authorization, "source_mode"),
      freshApplyPlanDigest: text(authorization, "fresh_apply_plan_digest"),
      newCustodyId: input.custodyId,
      newCustodyRevision: integer(authorization, "new_custody_revision"),
      newCustodySemanticDigest: text(authorization, "new_custody_semantic_digest"),
      newCustodySourceRefDigest: text(authorization, "new_custody_source_ref_digest"),
      generationLossAfter: {
        generationLossId: input.generationLossId,
        revision: before.revision + 1,
        semanticDigest,
        sourceRefDigest,
      },
      freshOriginEffectDigest: text(authorization, "effect_digest"),
      localWriteSetDigest,
      appliedAt: input.recordedAt,
    };
    const applyJson = canonicalJson(applyBody);
    const applyDigest = lifecycleDigest("transition-apply", applyBody);
    if (
      text(authorization, "custody_origin_apply_id") !== input.originFreshApplyId ||
      text(authorization, "custody_origin_apply_digest") !== applyDigest
    ) {
      throw new Error("generation-loss recovery custody is crossed from its apply");
    }
    const journal = this.#generationLossJournal({
      runId: input.runId,
      agentId: input.agentId,
      generationLossId: input.generationLossId,
      revision: before.revision + 1,
      priorJournalDigest: before.journalDigest,
      semanticDigest,
      sourceRefDigest,
      originFreshApplyId: input.originFreshApplyId,
      originFreshApplyDigest: applyDigest,
      recordedAt: input.recordedAt,
    });
    const journalJson = canonicalJson(journal);
    const journalDigest = lifecycleDigest("generation-loss-journal", journal);
    this.#database.prepare(`
      INSERT INTO lifecycle_generation_loss_revisions(
        project_session_id,run_id,agent_id,generation_loss_id,revision,
        prior_revision,prior_journal_digest,state,abandon_kind_code,
        recovery_action_adapter_id,recovery_action_id,active_recovery_custody_id,
        terminal_evidence_digest,semantic_json,semantic_digest,source_ref_digest,
        origin_fresh_apply_id,origin_fresh_apply_digest,receipt_batch_id,
        receipt_apply_id,receipt_apply_digest,journal_json,journal_digest,recorded_at
      ) VALUES (?,?,?,?,?,?,?,'recovery-in-progress','none',?,?,?,NULL,?,?,?,
                ?,?,NULL,NULL,NULL,?,?,?)
    `).run(
      before.projectSessionId, input.runId, input.agentId, input.generationLossId,
      before.revision + 1, before.revision, before.journalDigest,
      input.actionRef.adapterId, input.actionRef.actionId, input.custodyId,
      semanticJson, semanticDigest, sourceRefDigest, input.originFreshApplyId,
      applyDigest, journalJson, journalDigest, input.recordedAt,
    );
    const changed = this.#database.prepare(`
      UPDATE lifecycle_generation_loss_heads
         SET current_revision=?,state='recovery-in-progress',abandon_kind_code='none',
             semantic_digest=?,source_ref_digest=?,journal_digest=?,terminal=0,
             head_revision=head_revision+1
       WHERE run_id=? AND agent_id=? AND generation_loss_id=?
         AND current_revision=? AND state='open' AND semantic_digest=?
         AND source_ref_digest=? AND journal_digest=? AND terminal=0
    `).run(
      before.revision + 1, semanticDigest, sourceRefDigest, journalDigest,
      input.runId, input.agentId, input.generationLossId, before.revision,
      before.semanticDigest, before.sourceRefDigest, before.journalDigest,
    );
    if (changed.changes !== 1) throw new Error("generation-loss recovery head compare-and-set failed");
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
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      input.originFreshApplyId, "fresh", "fresh-origin", text(authorization, "batch_id"),
      text(authorization, "completion_digest"), text(authorization, "transition_replay_digest"),
      text(authorization, "ordered_authority_receipt_set_digest"),
      text(authorization, "verified_scope_checkpoint_digest"),
      text(authorization, "mutation_plan_digest"), text(authorization, "handoff_id"),
      text(authorization, "handoff_digest"), text(authorization, "handoff_digest"),
      before.projectSessionId, input.runId, input.agentId, text(authorization, "source_mode"),
      text(authorization, "fresh_apply_plan_digest"), input.custodyId,
      integer(authorization, "new_custody_revision"),
      text(authorization, "new_custody_semantic_digest"),
      text(authorization, "new_custody_source_ref_digest"), input.generationLossId,
      before.revision + 1, semanticDigest, sourceRefDigest, sourceRefDigest,
      "primary", text(authorization, "effect_digest"), localWriteSetDigest,
      applyJson, applyDigest, input.recordedAt,
    );
    return this.readGenerationLossHead(input.runId, input.agentId, input.generationLossId);
  }

  settleGenerationLossAttemptInCurrentTransaction(
    input: SettleGenerationLossAttemptInput,
  ): GenerationLossRecoveryHead {
    if (!this.#database.inTransaction) {
      throw new Error("generation-loss recovery settlement requires a transaction");
    }
    requiredId(input.runId, "runId");
    requiredId(input.agentId, "agentId");
    requiredId(input.generationLossId, "generationLossId");
    requiredId(input.custodyId, "custodyId");
    requiredId(input.actionRef.adapterId, "actionRef.adapterId");
    requiredId(input.actionRef.actionId, "actionRef.actionId");
    requiredId(input.receiptApplyId, "receiptApplyId");
    nonnegativeInteger(input.recordedAt, "recordedAt");

    const before = this.readGenerationLossHead(input.runId, input.agentId, input.generationLossId);
    if (before.state !== "recovery-in-progress" || before.terminal) {
      const replay = this.#database.prepare(`
        SELECT revision.receipt_apply_id,revision.recorded_at,batch.transition_replay_json
          FROM lifecycle_generation_loss_revisions revision
          LEFT JOIN lifecycle_receipt_batches batch
            ON batch.batch_id=revision.receipt_batch_id
         WHERE revision.run_id=? AND revision.agent_id=?
           AND revision.generation_loss_id=? AND revision.revision=?
      `).get(input.runId, input.agentId, input.generationLossId, before.revision);
      if (replay !== undefined) {
        const stored = row(replay, "generation-loss settlement replay");
        const replayJson = nullableText(stored, "transition_replay_json");
        if (
          nullableText(stored, "receipt_apply_id") === input.receiptApplyId &&
          integer(stored, "recorded_at") === input.recordedAt &&
          replayJson !== null
        ) {
          const replayBody = objectRecord(
            JSON.parse(replayJson) as unknown,
            "generation-loss settlement replay",
          );
          if (
            replayBody.sourceCustodyId === input.custodyId &&
            canonicalJson(replayBody.sourceActionRef) === canonicalJson(input.actionRef)
          ) return before;
        }
      }
      throw new Error("generation-loss recovery settlement conflicts with current state");
    }
    if (
      before.activeRecoveryCustodyId !== input.custodyId ||
      canonicalJson(before.recoveryActionRef) !== canonicalJson(input.actionRef)
    ) {
      throw new Error("generation-loss recovery settlement crosses its active attempt");
    }

    const custody = row(this.#database.prepare(`
      SELECT custody.project_session_id,custody.provider_action_adapter_id,
             custody.provider_action_id,head.current_revision,head.state,
             head.disposition_code,head.semantic_digest AS custody_semantic_digest,
             head.source_ref_digest AS custody_source_ref_digest,
             head.journal_digest AS custody_journal_digest,head.terminal,
             revision.terminal_evidence_digest
        FROM lifecycle_rotation_custodies custody
        JOIN lifecycle_rotation_custody_heads head
          ON head.run_id=custody.run_id AND head.agent_id=custody.agent_id
         AND head.custody_id=custody.custody_id
        JOIN lifecycle_rotation_custody_revisions revision
          ON revision.run_id=head.run_id AND revision.agent_id=head.agent_id
         AND revision.custody_id=head.custody_id
         AND revision.revision=head.current_revision
       WHERE custody.run_id=? AND custody.agent_id=? AND custody.custody_id=?
         AND custody.recovery_source_kind='generation-loss'
         AND custody.recovery_from_generation_loss_id=?
    `).get(
      input.runId, input.agentId, input.custodyId, input.generationLossId,
    ), "final recovery custody");
    const disposition = text(custody, "disposition_code");
    if (
      text(custody, "project_session_id") !== before.projectSessionId ||
      text(custody, "provider_action_adapter_id") !== input.actionRef.adapterId ||
      text(custody, "provider_action_id") !== input.actionRef.actionId ||
      text(custody, "state") !== "finalized" ||
      integer(custody, "terminal") !== 1 ||
      !["adopted", "no-effect", "superseded", "quarantined"].includes(disposition)
    ) {
      throw new Error("generation-loss recovery settlement has no exact final custody");
    }
    const terminalEvidenceDigest = text(custody, "terminal_evidence_digest");
    const adopted = disposition === "adopted";
    const nextRevision = before.revision + 1;
    const afterState = adopted ? "recovered-adopted" as const : "open" as const;
    const body = this.#generationLossRevisionBody({
      generationLossId: input.generationLossId,
      revision: nextRevision,
      state: afterState,
      abandonKind: "none",
      recoveryActionRef: adopted ? input.actionRef : null,
      activeRecoveryCustodyId: adopted ? input.custodyId : null,
      terminalEvidenceDigest: adopted ? terminalEvidenceDigest : null,
    });
    const semanticJson = canonicalJson(body);
    const semanticDigest = lifecycleDigest("generation-loss-semantic", body);
    const sourceRefDigest = semanticDigest;
    const expectedReplay = {
      schemaVersion: 1,
      generationLossId: input.generationLossId,
      beforeRevision: before.revision,
      sourceCustodyId: input.custodyId,
      sourceCustodyRevision: integer(custody, "current_revision"),
      sourceActionRef: input.actionRef,
      sourceDisposition: disposition,
      sourceTerminalEvidenceDigest: terminalEvidenceDigest,
      afterState,
      afterSemanticDigest: semanticDigest,
      afterSourceRefDigest: sourceRefDigest,
    };
    const authorization = row(this.#database.prepare(`
      SELECT batch.batch_id,batch.mutation_plan_digest,batch.transition_replay_json,
             batch.transition_replay_digest,effect.effect_digest,
             effect.pre_revision,effect.pre_journal_digest,effect.final_revision,
             effect.final_semantic_digest,effect.final_source_ref_digest,
             completion.completion_digest,
             completion.ordered_authority_receipt_set_digest,
             authority.verified_scope_checkpoint_digest
        FROM lifecycle_receipt_batches batch
        JOIN lifecycle_receipt_generation_loss_effects effect
          ON effect.batch_id=batch.batch_id AND effect.role='primary'
         AND effect.planned_apply_id=batch.planned_apply_id
        JOIN lifecycle_receipt_batch_completions completion
          ON completion.batch_id=batch.batch_id
         AND completion.primary_loss_effect_role='primary'
         AND completion.primary_loss_effect_digest=effect.effect_digest
        JOIN lifecycle_receipt_batch_authorizations authority
          ON authority.batch_id=batch.batch_id
         AND authority.batch_completion_digest=completion.completion_digest
         AND authority.ordered_authority_receipt_set_digest=
             completion.ordered_authority_receipt_set_digest
       WHERE batch.planned_apply_id=? AND batch.project_session_id=?
         AND batch.run_id=? AND batch.agent_id=?
         AND batch.transition_kind='generation-loss-terminal'
         AND batch.planned_apply_kind='terminal'
         AND effect.generation_loss_id=?
    `).get(
      input.receiptApplyId, before.projectSessionId, input.runId, input.agentId,
      input.generationLossId,
    ), "authorized generation-loss settlement");
    const replayBody = objectRecord(
      JSON.parse(text(authorization, "transition_replay_json")) as unknown,
      "generation-loss transition replay",
    );
    const localWriteSetDigest = replayBody.localWriteSetDigest;
    if (typeof localWriteSetDigest !== "string") {
      throw new Error("generation-loss transition replay has no local write-set digest");
    }
    const exactReplay = { ...expectedReplay, localWriteSetDigest };
    const expectedMutationPlanDigest = lifecycleDigest("generation-loss-mutation-plan", {
      generationLossId: input.generationLossId,
      beforeRevision: before.revision,
      afterRevision: nextRevision,
      afterSemanticDigest: semanticDigest,
      afterSourceRefDigest: sourceRefDigest,
    });
    const expectedEffectDigest = lifecycleDigest("generation-loss-effect", {
      generationLossId: input.generationLossId,
      beforeRevision: before.revision,
      afterRevision: nextRevision,
      afterSemanticDigest: semanticDigest,
      afterSourceRefDigest: sourceRefDigest,
    });
    if (
      text(authorization, "transition_replay_json") !== canonicalJson(exactReplay) ||
      text(authorization, "transition_replay_digest") !==
        lifecycleDigest("generation-loss-transition-replay", exactReplay) ||
      text(authorization, "mutation_plan_digest") !== expectedMutationPlanDigest ||
      text(authorization, "effect_digest") !== expectedEffectDigest ||
      integer(authorization, "pre_revision") !== before.revision ||
      text(authorization, "pre_journal_digest") !== before.journalDigest ||
      integer(authorization, "final_revision") !== nextRevision ||
      text(authorization, "final_semantic_digest") !== semanticDigest ||
      text(authorization, "final_source_ref_digest") !== sourceRefDigest
    ) {
      throw new Error("generation-loss recovery settlement authorization is crossed");
    }
    const applyBody = {
      schemaVersion: 1,
      applyKind: "terminal",
      applyId: input.receiptApplyId,
      receiptBatchId: text(authorization, "batch_id"),
      batchCompletionDigest: text(authorization, "completion_digest"),
      transitionReplayDigest: text(authorization, "transition_replay_digest"),
      orderedAuthorityReceiptSetDigest: text(
        authorization,
        "ordered_authority_receipt_set_digest",
      ),
      verifiedScopeCheckpointDigest: text(authorization, "verified_scope_checkpoint_digest"),
      primaryOwnerAfterRef: {
        kind: "generation-loss",
        generationLossRef: {
          schemaVersion: 1,
          runId: input.runId,
          agentId: input.agentId,
          generationLossId: input.generationLossId,
          generationLossRevision: nextRevision,
        },
        sourceRefDigest,
      },
      freshHandoffRef: null,
      freshSourceMode: null,
      freshApplyPlanDigest: null,
      newCustodyRef: null,
      generationLossAfterRef: null,
      freshOriginEffectDigest: null,
      appliedMutationPlanDigest: text(authorization, "mutation_plan_digest"),
      localWriteSetDigest,
    };
    const applyJson = canonicalJson(applyBody);
    const applyDigest = lifecycleDigest("transition-apply", applyBody);
    const journal = this.#generationLossJournal({
      runId: input.runId,
      agentId: input.agentId,
      generationLossId: input.generationLossId,
      revision: nextRevision,
      priorJournalDigest: before.journalDigest,
      semanticDigest,
      sourceRefDigest,
      authorityBatchId: text(authorization, "batch_id"),
      authorityApplyId: input.receiptApplyId,
      authorityApplyDigest: applyDigest,
      recordedAt: input.recordedAt,
    });
    const journalJson = canonicalJson(journal);
    const journalDigest = lifecycleDigest("generation-loss-journal", journal);
    this.#database.prepare(`
      INSERT INTO lifecycle_generation_loss_revisions(
        project_session_id,run_id,agent_id,generation_loss_id,revision,
        prior_revision,prior_journal_digest,state,abandon_kind_code,
        recovery_action_adapter_id,recovery_action_id,active_recovery_custody_id,
        terminal_evidence_digest,semantic_json,semantic_digest,source_ref_digest,
        origin_fresh_apply_id,origin_fresh_apply_digest,receipt_batch_id,
        receipt_apply_id,receipt_apply_digest,journal_json,journal_digest,recorded_at
      ) VALUES (?,?,?,?,?,?,?,?,'none',?,?,?,?,?,?,?,NULL,NULL,?,?,?,?,?,?)
    `).run(
      before.projectSessionId, input.runId, input.agentId, input.generationLossId,
      nextRevision, before.revision, before.journalDigest, afterState,
      adopted ? input.actionRef.adapterId : null,
      adopted ? input.actionRef.actionId : null,
      adopted ? input.custodyId : null,
      adopted ? terminalEvidenceDigest : null,
      semanticJson, semanticDigest, sourceRefDigest, text(authorization, "batch_id"),
      input.receiptApplyId, applyDigest, journalJson, journalDigest, input.recordedAt,
    );
    const changed = this.#database.prepare(`
      UPDATE lifecycle_generation_loss_heads
         SET current_revision=?,state=?,abandon_kind_code='none',semantic_digest=?,
             source_ref_digest=?,journal_digest=?,terminal=?,head_revision=head_revision+1
       WHERE run_id=? AND agent_id=? AND generation_loss_id=?
         AND current_revision=? AND state='recovery-in-progress'
         AND semantic_digest=? AND source_ref_digest=? AND journal_digest=? AND terminal=0
    `).run(
      nextRevision, afterState, semanticDigest, sourceRefDigest, journalDigest,
      adopted ? 1 : 0, input.runId, input.agentId, input.generationLossId,
      before.revision, before.semanticDigest, before.sourceRefDigest, before.journalDigest,
    );
    if (changed.changes !== 1) {
      throw new Error("generation-loss settlement head compare-and-set failed");
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
      ) VALUES (?,'terminal','generation-loss-terminal',?,?,?,?,?,?,NULL,NULL,'none',
                NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
                'none',NULL,NULL,?,?,?,?)
    `).run(
      input.receiptApplyId, text(authorization, "batch_id"),
      text(authorization, "completion_digest"),
      text(authorization, "transition_replay_digest"),
      text(authorization, "ordered_authority_receipt_set_digest"),
      text(authorization, "verified_scope_checkpoint_digest"),
      text(authorization, "mutation_plan_digest"), localWriteSetDigest,
      applyJson, applyDigest, input.recordedAt,
    );
    return this.readGenerationLossHead(input.runId, input.agentId, input.generationLossId);
  }

  abandonGenerationLossInCurrentTransaction(
    input: AbandonGenerationLossInput,
  ): GenerationLossRecoveryHead {
    if (!this.#database.inTransaction) {
      throw new Error("generation-loss abandonment requires a transaction");
    }
    requiredId(input.runId, "runId");
    requiredId(input.agentId, "agentId");
    requiredId(input.generationLossId, "generationLossId");
    requiredId(input.receiptApplyId, "receiptApplyId");
    nonnegativeInteger(input.recordedAt, "recordedAt");
    const before = this.readGenerationLossHead(input.runId, input.agentId, input.generationLossId);
    if (before.state === "abandoned") {
      const replay = row(this.#database.prepare(`
        SELECT receipt_apply_id,recorded_at FROM lifecycle_generation_loss_revisions
         WHERE run_id=? AND agent_id=? AND generation_loss_id=? AND revision=?
      `).get(
        input.runId, input.agentId, input.generationLossId, before.revision,
      ), "generation-loss abandonment replay");
      if (
        text(replay, "receipt_apply_id") === input.receiptApplyId &&
        integer(replay, "recorded_at") === input.recordedAt
      ) return before;
      throw new Error("generation-loss abandonment replay conflicts with its terminal record");
    }
    if (before.terminal || !["open", "recovery-in-progress"].includes(before.state)) {
      throw new Error("generation-loss abandonment requires an unresolved loss");
    }
    const abandonKind = before.state === "open" ? "direct-open" as const : "recovery-attempt" as const;
    let sourceCustodyRevision: number | null = null;
    let sourceTerminalEvidenceDigest: string | null = null;
    if (abandonKind === "recovery-attempt") {
      const custody = row(this.#database.prepare(`
        SELECT custody.provider_action_adapter_id,custody.provider_action_id,
               head.current_revision,head.state,head.disposition_code,head.terminal,
               revision.terminal_evidence_digest
          FROM lifecycle_rotation_custodies custody
          JOIN lifecycle_rotation_custody_heads head
            ON head.run_id=custody.run_id AND head.agent_id=custody.agent_id
           AND head.custody_id=custody.custody_id
          JOIN lifecycle_rotation_custody_revisions revision
            ON revision.run_id=head.run_id AND revision.agent_id=head.agent_id
           AND revision.custody_id=head.custody_id
           AND revision.revision=head.current_revision
         WHERE custody.run_id=? AND custody.agent_id=? AND custody.custody_id=?
      `).get(
        input.runId, input.agentId, before.activeRecoveryCustodyId,
      ), "abandoned recovery custody");
      if (
        before.recoveryActionRef === null ||
        text(custody, "provider_action_adapter_id") !== before.recoveryActionRef.adapterId ||
        text(custody, "provider_action_id") !== before.recoveryActionRef.actionId ||
        text(custody, "state") !== "finalized" ||
        text(custody, "disposition_code") !== "abandoned" ||
        integer(custody, "terminal") !== 1
      ) throw new Error("generation-loss abandonment has no exact abandoned recovery custody");
      sourceCustodyRevision = integer(custody, "current_revision");
      sourceTerminalEvidenceDigest = text(custody, "terminal_evidence_digest");
    }
    const nextRevision = before.revision + 1;
    const authorization = row(this.#database.prepare(`
      SELECT batch.batch_id,batch.mutation_plan_digest,batch.transition_replay_json,
             batch.transition_replay_digest,effect.effect_digest,
             effect.pre_revision,effect.pre_journal_digest,effect.final_revision,
             effect.final_semantic_digest,effect.final_source_ref_digest,
             completion.completion_digest,
             completion.ordered_authority_receipt_set_digest,
             authority.verified_scope_checkpoint_digest
        FROM lifecycle_receipt_batches batch
        JOIN lifecycle_receipt_generation_loss_effects effect
          ON effect.batch_id=batch.batch_id AND effect.role='primary'
         AND effect.planned_apply_id=batch.planned_apply_id
        JOIN lifecycle_receipt_batch_completions completion
          ON completion.batch_id=batch.batch_id
         AND completion.primary_loss_effect_role='primary'
         AND completion.primary_loss_effect_digest=effect.effect_digest
        JOIN lifecycle_receipt_batch_authorizations authority
          ON authority.batch_id=batch.batch_id
         AND authority.batch_completion_digest=completion.completion_digest
         AND authority.ordered_authority_receipt_set_digest=
             completion.ordered_authority_receipt_set_digest
       WHERE batch.planned_apply_id=? AND batch.project_session_id=?
         AND batch.run_id=? AND batch.agent_id=?
         AND batch.transition_kind='generation-loss-terminal'
         AND batch.planned_apply_kind='terminal'
         AND effect.generation_loss_id=?
    `).get(
      input.receiptApplyId, before.projectSessionId, input.runId, input.agentId,
      input.generationLossId,
    ), "authorized generation-loss abandonment");
    const replayBody = objectRecord(
      JSON.parse(text(authorization, "transition_replay_json")) as unknown,
      "generation-loss abandonment replay",
    );
    const operatorId = replayBody.operatorId;
    const parentCapabilityId = replayBody.parentCapabilityId;
    const consequentialGateId = replayBody.consequentialGateId;
    const confirmationDigest = replayBody.confirmationDigest;
    const localWriteSetDigest = replayBody.localWriteSetDigest;
    if (
      typeof operatorId !== "string" || typeof parentCapabilityId !== "string" ||
      typeof consequentialGateId !== "string" || typeof confirmationDigest !== "string" ||
      typeof localWriteSetDigest !== "string"
    ) throw new Error("generation-loss abandonment confirmation is incomplete");
    const expectedConfirmationDigest = lifecycleDigest("generation-loss-abandon-confirmation", {
      operatorId,
      parentCapabilityId,
      consequentialGateId,
      generationLossId: input.generationLossId,
      beforeRevision: before.revision,
      abandonKind,
      sourceCustodyId: before.activeRecoveryCustodyId,
      sourceActionRef: before.recoveryActionRef,
      confirmedAt: input.recordedAt,
    });
    if (confirmationDigest !== expectedConfirmationDigest) {
      throw new Error("generation-loss abandonment confirmation is crossed");
    }
    const authority = this.#database.prepare(`
      SELECT capability.capability_id
        FROM operator_capabilities capability
        JOIN operator_principals principal
          ON principal.operator_id=capability.operator_id
         AND principal.project_session_id=capability.project_session_id
        JOIN scoped_gates gate
          ON gate.gate_id=? AND gate.project_session_id=capability.project_session_id
         AND gate.coordination_run_id=? AND gate.status='approved'
         AND gate.human_required=1 AND gate.resolved_by_operator_id=capability.operator_id
       WHERE capability.capability_id=? AND capability.operator_id=?
         AND capability.project_session_id=? AND capability.kind='session'
         AND capability.issued_at<=? AND capability.expires_at>?
         AND principal.state='active'
         AND EXISTS (SELECT 1 FROM json_each(capability.operations_json)
                      WHERE value='agent-lifecycle-recovery-abandon')
    `).get(
      consequentialGateId, input.runId, parentCapabilityId, operatorId,
      before.projectSessionId, input.recordedAt, input.recordedAt,
    );
    if (authority === undefined) throw new Error("generation-loss abandonment lacks current operator authority");
    const terminalEvidenceDigest = abandonKind === "direct-open"
      ? confirmationDigest
      : sourceTerminalEvidenceDigest;
    if (terminalEvidenceDigest === null) {
      throw new Error("generation-loss abandonment has no terminal evidence");
    }
    const body = this.#generationLossRevisionBody({
      generationLossId: input.generationLossId,
      revision: nextRevision,
      state: "abandoned",
      abandonKind,
      recoveryActionRef: before.recoveryActionRef,
      activeRecoveryCustodyId: before.activeRecoveryCustodyId,
      terminalEvidenceDigest,
    });
    const semanticJson = canonicalJson(body);
    const semanticDigest = lifecycleDigest("generation-loss-semantic", body);
    const sourceRefDigest = semanticDigest;
    const expectedReplay = {
      schemaVersion: 1,
      generationLossId: input.generationLossId,
      beforeRevision: before.revision,
      abandonKind,
      sourceCustodyId: before.activeRecoveryCustodyId,
      sourceCustodyRevision,
      sourceActionRef: before.recoveryActionRef,
      sourceTerminalEvidenceDigest,
      operatorId,
      parentCapabilityId,
      consequentialGateId,
      confirmationDigest,
      afterState: "abandoned",
      afterSemanticDigest: semanticDigest,
      afterSourceRefDigest: sourceRefDigest,
      localWriteSetDigest,
    };
    const expectedMutationPlanDigest = lifecycleDigest("generation-loss-mutation-plan", {
      generationLossId: input.generationLossId,
      beforeRevision: before.revision,
      afterRevision: nextRevision,
      afterSemanticDigest: semanticDigest,
      afterSourceRefDigest: sourceRefDigest,
    });
    const expectedEffectDigest = lifecycleDigest("generation-loss-effect", {
      generationLossId: input.generationLossId,
      beforeRevision: before.revision,
      afterRevision: nextRevision,
      afterSemanticDigest: semanticDigest,
      afterSourceRefDigest: sourceRefDigest,
    });
    if (
      text(authorization, "transition_replay_json") !== canonicalJson(expectedReplay) ||
      text(authorization, "transition_replay_digest") !==
        lifecycleDigest("generation-loss-transition-replay", expectedReplay) ||
      text(authorization, "mutation_plan_digest") !== expectedMutationPlanDigest ||
      text(authorization, "effect_digest") !== expectedEffectDigest ||
      integer(authorization, "pre_revision") !== before.revision ||
      text(authorization, "pre_journal_digest") !== before.journalDigest ||
      integer(authorization, "final_revision") !== nextRevision ||
      text(authorization, "final_semantic_digest") !== semanticDigest ||
      text(authorization, "final_source_ref_digest") !== sourceRefDigest
    ) throw new Error("generation-loss abandonment authorization is crossed");
    const applyBody = {
      schemaVersion: 1,
      applyKind: "terminal",
      applyId: input.receiptApplyId,
      receiptBatchId: text(authorization, "batch_id"),
      batchCompletionDigest: text(authorization, "completion_digest"),
      transitionReplayDigest: text(authorization, "transition_replay_digest"),
      orderedAuthorityReceiptSetDigest: text(authorization, "ordered_authority_receipt_set_digest"),
      verifiedScopeCheckpointDigest: text(authorization, "verified_scope_checkpoint_digest"),
      primaryOwnerAfterRef: {
        kind: "generation-loss",
        generationLossRef: {
          schemaVersion: 1, runId: input.runId, agentId: input.agentId,
          generationLossId: input.generationLossId, generationLossRevision: nextRevision,
        },
        sourceRefDigest,
      },
      freshHandoffRef: null,
      freshSourceMode: null,
      freshApplyPlanDigest: null,
      newCustodyRef: null,
      generationLossAfterRef: null,
      freshOriginEffectDigest: null,
      appliedMutationPlanDigest: text(authorization, "mutation_plan_digest"),
      localWriteSetDigest,
    };
    const applyJson = canonicalJson(applyBody);
    const applyDigest = lifecycleDigest("transition-apply", applyBody);
    const journal = this.#generationLossJournal({
      runId: input.runId,
      agentId: input.agentId,
      generationLossId: input.generationLossId,
      revision: nextRevision,
      priorJournalDigest: before.journalDigest,
      semanticDigest,
      sourceRefDigest,
      authorityBatchId: text(authorization, "batch_id"),
      authorityApplyId: input.receiptApplyId,
      authorityApplyDigest: applyDigest,
      recordedAt: input.recordedAt,
    });
    const journalJson = canonicalJson(journal);
    const journalDigest = lifecycleDigest("generation-loss-journal", journal);
    this.#database.prepare(`
      INSERT INTO lifecycle_generation_loss_revisions(
        project_session_id,run_id,agent_id,generation_loss_id,revision,
        prior_revision,prior_journal_digest,state,abandon_kind_code,
        recovery_action_adapter_id,recovery_action_id,active_recovery_custody_id,
        terminal_evidence_digest,semantic_json,semantic_digest,source_ref_digest,
        origin_fresh_apply_id,origin_fresh_apply_digest,receipt_batch_id,
        receipt_apply_id,receipt_apply_digest,journal_json,journal_digest,recorded_at
      ) VALUES (?,?,?,?,?,?,?,'abandoned',?,?,?,?,?,?,?, ?,NULL,NULL,?,?,?,?,?,?)
    `).run(
      before.projectSessionId, input.runId, input.agentId, input.generationLossId,
      nextRevision, before.revision, before.journalDigest, abandonKind,
      before.recoveryActionRef?.adapterId ?? null,
      before.recoveryActionRef?.actionId ?? null,
      before.activeRecoveryCustodyId, terminalEvidenceDigest,
      semanticJson, semanticDigest, sourceRefDigest, text(authorization, "batch_id"),
      input.receiptApplyId, applyDigest, journalJson, journalDigest, input.recordedAt,
    );
    const changed = this.#database.prepare(`
      UPDATE lifecycle_generation_loss_heads
         SET current_revision=?,state='abandoned',abandon_kind_code=?,semantic_digest=?,
             source_ref_digest=?,journal_digest=?,terminal=1,head_revision=head_revision+1
       WHERE run_id=? AND agent_id=? AND generation_loss_id=? AND current_revision=?
         AND state=? AND semantic_digest=? AND source_ref_digest=? AND journal_digest=?
         AND terminal=0
    `).run(
      nextRevision, abandonKind, semanticDigest, sourceRefDigest, journalDigest,
      input.runId, input.agentId, input.generationLossId, before.revision,
      before.state, before.semanticDigest, before.sourceRefDigest, before.journalDigest,
    );
    if (changed.changes !== 1) throw new Error("generation-loss abandonment head compare-and-set failed");
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
      ) VALUES (?,'terminal','generation-loss-terminal',?,?,?,?,?,?,NULL,NULL,'none',
                NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
                'none',NULL,NULL,?,?,?,?)
    `).run(
      input.receiptApplyId, text(authorization, "batch_id"),
      text(authorization, "completion_digest"), text(authorization, "transition_replay_digest"),
      text(authorization, "ordered_authority_receipt_set_digest"),
      text(authorization, "verified_scope_checkpoint_digest"),
      text(authorization, "mutation_plan_digest"), localWriteSetDigest,
      applyJson, applyDigest, input.recordedAt,
    );
    return this.readGenerationLossHead(input.runId, input.agentId, input.generationLossId);
  }

  #generationLossRevisionBody(input: Readonly<{
    generationLossId: string;
    revision: number;
    state: GenerationLossRecoveryHead["state"];
    abandonKind: GenerationLossRecoveryHead["abandonKind"];
    recoveryActionRef: GenerationLossRecoveryHead["recoveryActionRef"];
    activeRecoveryCustodyId: string | null;
    terminalEvidenceDigest: string | null;
  }>): Readonly<Record<string, unknown>> {
    return {
      schemaVersion: 1,
      sourceKind: "generation-loss",
      generationLossId: input.generationLossId,
      revision: input.revision,
      state: input.state,
      abandonKind: input.abandonKind,
      recoveryActionRef: input.recoveryActionRef,
      activeRecoveryCustodyId: input.activeRecoveryCustodyId,
      terminalEvidenceDigest: input.terminalEvidenceDigest,
    };
  }

  #generationLossJournal(input: Readonly<{
    runId: string;
    agentId: string;
    generationLossId: string;
    revision: number;
    priorJournalDigest: string;
    semanticDigest: string;
    sourceRefDigest: string;
    originFreshApplyId?: string;
    originFreshApplyDigest?: string;
    authorityBatchId?: string;
    authorityApplyId?: string;
    authorityApplyDigest?: string;
    recordedAt: number;
  }>): Readonly<Record<string, unknown>> {
    return {
      schemaVersion: 1,
      ownerRef: {
        kind: "generation-loss",
        generationLossRef: {
          schemaVersion: 1,
          runId: input.runId,
          agentId: input.agentId,
          generationLossId: input.generationLossId,
          generationLossRevision: input.revision,
        },
        sourceRefDigest: input.sourceRefDigest,
      },
      priorJournalDigest: input.priorJournalDigest,
      semanticDigest: input.semanticDigest,
      sourceRefDigest: input.sourceRefDigest,
      authorityBatchId: input.authorityBatchId ?? null,
      authorityApplyId: input.authorityApplyId ?? null,
      authorityApplyDigest: input.authorityApplyDigest ?? null,
      originFreshApplyId: input.originFreshApplyId ?? null,
      originFreshApplyDigest: input.originFreshApplyDigest ?? null,
      recordedAt: input.recordedAt,
    };
  }

  #validateIssueInput(input: CreateLifecycleRecoveryIssueInput): void {
    requiredId(input.issueId, "issueId");
    requiredId(input.capabilityHash, "capabilityHash");
    requiredId(input.operatorId, "operatorId");
    requiredId(input.projectSessionId, "projectSessionId");
    requiredId(input.runId, "runId");
    requiredId(input.agentId, "agentId");
    requiredId(input.parentCapabilityId, "parentCapabilityId");
    requiredId(input.consequentialGateId, "consequentialGateId");
    requiredId(
      input.source.kind === "generation-loss" ? input.source.generationLossId : input.source.custodyId,
      "sourceId",
    );
    nonnegativeInteger(input.issuedAt, "issuedAt");
    nonnegativeInteger(input.expiresAt, "expiresAt");
    if (input.expiresAt <= input.issuedAt) throw new Error("recovery issue expiry must follow issuance");
  }

  #exactSource(input: CreateLifecycleRecoveryIssueInput): ExactRecoverySourceBinding {
    const sourceId = input.source.kind === "generation-loss"
      ? input.source.generationLossId
      : input.source.custodyId;
    const sourceTable = input.source.kind === "generation-loss"
      ? "lifecycle_generation_loss"
      : "lifecycle_rotation_custody";
    const stored = input.source.kind === "generation-loss"
      ? row(this.#database.prepare(`
          SELECT session.project_id,session.revision AS session_revision,
                 session.generation AS session_generation,run.revision AS run_revision,
                 head.current_revision,head.state,revision.source_ref_digest,
                 revision.journal_digest,loss.checkpoint_digest,
                 loss.old_provider_session_ref AS source_provider_session_ref,
                 loss.source_capability_hash,loss.source_custody_action_id,
                 loss.source_adapter_id,loss.source_adapter_contract_digest,
                 loss.source_bridge_row_id,loss.source_bridge_revision,
                 loss.old_provider_generation AS source_provider_generation,
                 loss.source_principal_generation,loss.source_bridge_generation,
                 loss.source_project_session_generation,loss.source_run_generation,
                 loss.source_chair_lease_generation,loss.bridge_owner_kind,
                 NULL AS old_action_adapter_id,NULL AS old_action_id
            FROM lifecycle_generation_loss_heads head
            JOIN lifecycle_generation_loss_revisions revision
              ON revision.run_id=head.run_id AND revision.agent_id=head.agent_id
             AND revision.generation_loss_id=head.generation_loss_id
             AND revision.revision=head.current_revision
            JOIN lifecycle_generation_losses loss
              ON loss.run_id=head.run_id AND loss.agent_id=head.agent_id
             AND loss.generation_loss_id=head.generation_loss_id
            JOIN runs run ON run.run_id=head.run_id
            JOIN project_sessions session ON session.project_session_id=run.project_session_id
           WHERE head.project_session_id=? AND head.run_id=? AND head.agent_id=?
             AND head.generation_loss_id=? AND head.state='open' AND head.terminal=0
        `).get(input.projectSessionId, input.runId, input.agentId, sourceId), sourceTable)
      : row(this.#database.prepare(`
          SELECT session.project_id,session.revision AS session_revision,
                 session.generation AS session_generation,run.revision AS run_revision,
                 head.current_revision,head.state,revision.source_ref_digest,
                 revision.journal_digest,custody.checkpoint_digest,
                 custody.source_provider_session_ref,custody.source_capability_hash,
                 custody.source_custody_action_id,custody.source_adapter_id,
                 custody.source_adapter_contract_digest,custody.source_bridge_row_id,
                 custody.source_bridge_revision,custody.source_provider_generation,
                 custody.source_principal_generation,custody.source_bridge_generation,
                 custody.source_project_session_generation,custody.source_run_generation,
                 custody.source_chair_lease_generation,custody.bridge_owner_kind,
                 custody.provider_action_adapter_id AS old_action_adapter_id,
                 custody.provider_action_id AS old_action_id
            FROM lifecycle_rotation_custody_heads head
            JOIN lifecycle_rotation_custody_revisions revision
              ON revision.run_id=head.run_id AND revision.agent_id=head.agent_id
             AND revision.custody_id=head.custody_id
             AND revision.revision=head.current_revision
            JOIN lifecycle_rotation_custodies custody
              ON custody.run_id=head.run_id AND custody.agent_id=head.agent_id
             AND custody.custody_id=head.custody_id
            JOIN runs run ON run.run_id=head.run_id
            JOIN project_sessions session ON session.project_session_id=run.project_session_id
           WHERE head.project_session_id=? AND head.run_id=? AND head.agent_id=?
             AND head.custody_id=? AND (
               head.terminal=0 OR head.disposition_code IN ('no-effect','superseded','quarantined')
             )
        `).get(input.projectSessionId, input.runId, input.agentId, sourceId), sourceTable);
    const bridgeOwnerKind = text(stored, "bridge_owner_kind");
    if (bridgeOwnerKind !== "chair" && bridgeOwnerKind !== "child") {
      throw new Error("lifecycle recovery source has an invalid bridge owner kind");
    }
    return {
      projectId: text(stored, "project_id"),
      sessionRevision: integer(stored, "session_revision"),
      sessionGeneration: integer(stored, "session_generation"),
      runRevision: integer(stored, "run_revision"),
      sourceKind: input.source.kind,
      sourceId,
      sourceRevision: integer(stored, "current_revision"),
      sourceRefDigest: text(stored, "source_ref_digest"),
      sourceJournalDigest: text(stored, "journal_digest"),
      oldActionAdapterId: nullableText(stored, "old_action_adapter_id"),
      oldActionId: nullableText(stored, "old_action_id"),
      checkpointDigest: nullableText(stored, "checkpoint_digest"),
      sourceProviderSessionRef: text(stored, "source_provider_session_ref"),
      sourceCapabilityHash: text(stored, "source_capability_hash"),
      sourceCustodyActionId: text(stored, "source_custody_action_id"),
      sourceAdapterId: text(stored, "source_adapter_id"),
      sourceAdapterContractDigest: text(stored, "source_adapter_contract_digest"),
      sourceBridgeRowId: text(stored, "source_bridge_row_id"),
      sourceBridgeRevision: integer(stored, "source_bridge_revision"),
      sourceProviderGeneration: integer(stored, "source_provider_generation"),
      sourcePrincipalGeneration: integer(stored, "source_principal_generation"),
      sourceBridgeGeneration: integer(stored, "source_bridge_generation"),
      sourceProjectSessionGeneration: integer(stored, "source_project_session_generation"),
      sourceRunGeneration: integer(stored, "source_run_generation"),
      sourceChairLeaseGeneration: integer(stored, "source_chair_lease_generation"),
      bridgeOwnerKind,
    };
  }

  #assertIssueAuthority(input: CreateLifecycleRecoveryIssueInput, source: ExactRecoverySourceBinding): void {
    const parent = row(this.#database.prepare(`
      SELECT capability.operator_id,capability.project_id,capability.project_session_id,
             capability.session_generation,capability.operations_json,
             capability.expires_at,capability.revoked_at,principal.state
        FROM operator_capabilities capability
        JOIN operator_principals principal ON principal.operator_id=capability.operator_id
       WHERE capability.capability_id=?
    `).get(input.parentCapabilityId), "lifecycle recovery parent capability");
    const operations = stringArray(JSON.parse(text(parent, "operations_json")), "parent capability operations");
    if (
      text(parent, "operator_id") !== input.operatorId ||
      text(parent, "project_id") !== source.projectId ||
      text(parent, "project_session_id") !== input.projectSessionId ||
      integer(parent, "session_generation") !== source.sessionGeneration ||
      integer(parent, "expires_at") <= input.issuedAt ||
      parent.revoked_at !== null ||
      text(parent, "state") !== "active" ||
      !operations.includes("agent-lifecycle-recovery-issue")
    ) {
      throw new Error("lifecycle recovery parent capability is not current and exact");
    }
    const gate = row(this.#database.prepare(`
      SELECT project_session_id,coordination_run_id,enforcement_points_json,
             expected_approver_ref,resolved_by_operator_id,status,human_required
        FROM scoped_gates WHERE gate_id=?
    `).get(input.consequentialGateId), "lifecycle recovery consequential gate");
    const enforcementPoints = stringArray(JSON.parse(text(gate, "enforcement_points_json")), "gate enforcement points");
    if (
      text(gate, "project_session_id") !== input.projectSessionId ||
      text(gate, "coordination_run_id") !== input.runId ||
      text(gate, "expected_approver_ref") !== input.operatorId ||
      text(gate, "resolved_by_operator_id") !== input.operatorId ||
      text(gate, "status") !== "approved" ||
      integer(gate, "human_required") !== 1 ||
      !enforcementPoints.includes("agent-lifecycle-recovery-issue")
    ) {
      throw new Error("lifecycle recovery consequential gate is not current and exact");
    }
    const sourceAction = row(this.#database.prepare(`
      SELECT run_id,target_agent_id,status FROM provider_actions
       WHERE adapter_id=? AND action_id=?
    `).get(source.sourceAdapterId, source.sourceCustodyActionId), "lifecycle recovery source action");
    if (
      text(sourceAction, "run_id") !== input.runId ||
      text(sourceAction, "target_agent_id") !== input.agentId ||
      text(sourceAction, "status") !== "terminal"
    ) {
      throw new Error("lifecycle recovery source action is not exact");
    }
    const sourceCapability = row(this.#database.prepare(`
      SELECT run_id,agent_id,principal_generation FROM capabilities WHERE token_hash=?
    `).get(source.sourceCapabilityHash), "lifecycle recovery source capability");
    if (
      text(sourceCapability, "run_id") !== input.runId ||
      text(sourceCapability, "agent_id") !== input.agentId ||
      integer(sourceCapability, "principal_generation") !== source.sourcePrincipalGeneration
    ) {
      throw new Error("lifecycle recovery source capability is not exact");
    }
    if (
      source.sourceProjectSessionGeneration !== source.sessionGeneration ||
      source.sourceRunGeneration !== source.runRevision
    ) {
      throw new Error("lifecycle recovery source generation binding is stale");
    }
    const bridge = source.bridgeOwnerKind === "chair"
      ? this.#database.prepare(`
          SELECT 1 FROM launched_chair_bridge_state
           WHERE project_session_id=? AND coordination_run_id=? AND chair_agent_id=?
             AND provider_adapter_id=? AND provider_action_id=?
             AND provider_session_ref=? AND provider_session_generation=?
             AND principal_generation=? AND bridge_generation=?
             AND capability_hash=? AND revision=?
        `).get(
          input.projectSessionId, input.runId, input.agentId,
          source.sourceAdapterId, source.sourceCustodyActionId,
          source.sourceProviderSessionRef, source.sourceProviderGeneration,
          source.sourcePrincipalGeneration, source.sourceBridgeGeneration,
          source.sourceCapabilityHash, source.sourceBridgeRevision,
        )
      : this.#database.prepare(`
          SELECT 1 FROM agent_bridge_state
           WHERE run_id=? AND agent_id=? AND adapter_id=? AND action_id=?
             AND provider_session_ref=? AND provider_session_generation=?
             AND bridge_generation=? AND capability_hash=? AND revision=?
        `).get(
          input.runId, input.agentId, source.sourceAdapterId,
          source.sourceCustodyActionId, source.sourceProviderSessionRef,
          source.sourceProviderGeneration, source.sourceBridgeGeneration,
          source.sourceCapabilityHash, source.sourceBridgeRevision,
        );
    if (bridge === undefined) throw new Error("lifecycle recovery source bridge is not exact");
  }
}

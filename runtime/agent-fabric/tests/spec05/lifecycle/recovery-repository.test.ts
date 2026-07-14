import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { applyMigrations } from "../../../src/core/migrations.ts";
import {
  LifecycleRecoveryRepository,
  type CreateLifecycleRecoveryIssueInput,
} from "../../../src/lifecycle/recovery-repository.ts";
import { LifecycleRotationRepository } from "../../../src/lifecycle/rotation-repository.ts";
import { canonicalJson, digest } from "../../../src/project-session/store-support.ts";
import { admitProviderActionFixture } from "../../support/provider-action-fixture.ts";

const SHA_A = `sha256:${"a".repeat(64)}`;

function lifecycleDigest(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(`agent-fabric.lifecycle.v1\0${domain}\0`)
    .update(canonicalJson(value))
    .digest("hex")}`;
}

function lossRevisionBody(input: Readonly<{
  revision: number;
  state: "open" | "recovery-in-progress" | "recovered-adopted" | "abandoned";
  abandonKind?: "none" | "direct-open" | "recovery-attempt";
  actionRef?: Readonly<{ adapterId: string; actionId: string }> | null;
  custodyId?: string | null;
  terminalEvidenceDigest?: string | null;
}>): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: 1,
    sourceKind: "generation-loss",
    generationLossId: "loss",
    revision: input.revision,
    state: input.state,
    abandonKind: input.abandonKind ?? "none",
    recoveryActionRef: input.actionRef ?? null,
    activeRecoveryCustodyId: input.custodyId ?? null,
    terminalEvidenceDigest: input.terminalEvidenceDigest ?? null,
  };
}

function openDatabase(): Database.Database {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applyMigrations(database);
  return database;
}

function seedOpenGenerationLoss(database: Database.Database): void {
  database.prepare(`
    INSERT INTO projects(
      project_id,canonical_root,revision,authority_generation,created_at,updated_at
    ) VALUES ('project','/tmp/project',1,1,1,1)
  `).run();
  database.prepare(`
    INSERT INTO project_sessions(
      project_session_id,project_id,mode,state,revision,generation,
      authority_ref,budget_ref,launch_packet_path,launch_packet_digest,
      membership_revision,origin_kind,origin_operator_id,created_at,updated_at
    ) VALUES ('session','project','coordinated','active',1,1,?,'budget-ref',
              'launch','launch-digest',1,'operator-launch','operator',1,1)
  `).run(SHA_A);
  database.prepare(`
    INSERT INTO runs(
      run_id,chair_agent_id,workspace_root,created_at,project_session_id,
      lifecycle_state,revision,chair_generation,chair_lease_id,authority_ref,
      budget_ref,dependency_revision,topology_slot
    ) VALUES ('run','chair','/tmp',1,'session','active',1,1,'chair-lease',?,
              'budget-ref',1,1)
  `).run(SHA_A);
  database.prepare(`
    INSERT INTO authorities(authority_id,run_id,authority_json,authority_hash,created_at)
    VALUES ('authority','run','{}',?,1)
  `).run("a".repeat(64));
  database.prepare(`
    INSERT INTO agents(run_id,agent_id,authority_id,lifecycle)
    VALUES ('run','chair','authority','context-unreconciled')
  `).run();
  database.prepare(`
    INSERT INTO operator_principals(
      operator_id,project_id,project_session_id,authenticated_subject_hash,
      project_authority_generation,principal_generation,state,created_at,updated_at
    ) VALUES ('operator','project','session','subject-hash',1,1,'active',1,1)
  `).run();
  database.prepare(`
    INSERT INTO operator_capabilities(
      capability_id,token_hash,operator_id,project_id,project_session_id,
      project_authority_generation,session_generation,principal_generation,
      kind,operations_json,issued_at,expires_at
    ) VALUES ('parent-capability',?,'operator','project','session',1,1,1,
              'session','["agent-lifecycle-recovery-issue","agent-lifecycle-recovery-abandon"]',1,1000)
  `).run("b".repeat(64));
  database.prepare(`
    INSERT INTO scoped_gates(
      gate_id,project_session_id,coordination_run_id,dedupe_key,scope_kind,
      scope_task_id,dependency_revision,blocked_operation_ids_json,
      enforcement_points_json,question,reason,options_json,recommendation,
      consequences_json,evidence_refs_json,created_by_ref,expected_approver_ref,
      resolved_by_operator_id,resolution_json,status,human_required,
      release_binding_json,revision,created_at,updated_at
    ) VALUES ('recovery-gate','session','run','agent-lifecycle-recovery:run:chair:loss',
              'run',NULL,1,'[]','["agent-lifecycle-recovery-issue"]',
              'Recover chair?','Stranded lifecycle','[]','fresh rotate','[]','[]',
              'fabric','operator','operator','{}','approved',1,NULL,1,1,1)
  `).run();
  database.prepare(`
    INSERT INTO capabilities(
      token_hash,run_id,agent_id,principal_generation,expires_at,revoked_at
    ) VALUES ('source-capability','run','chair',1,1000,NULL)
  `).run();
  admitProviderActionFixture(database, {
    runId: "run",
    actionId: "source-action",
    adapterId: "adapter",
    operation: "lifecycle-source",
    targetAgentId: "chair",
    providerSessionGeneration: 1,
    identityHash: "identity",
    payloadHash: "payload",
    payloadJson: "{}",
    status: "terminal",
    historyJson: "[]",
    executionCount: 1,
    effectCount: 1,
    idempotencyProven: true,
    resultJson: "{}",
    updatedAt: 1,
  });
  database.prepare(`
    INSERT INTO launched_chair_bridge_state(
      project_session_id,coordination_run_id,chair_agent_id,provider_adapter_id,
      provider_action_id,provider_contract_digest,provider_session_ref,
      provider_session_generation,principal_generation,bridge_generation,
      capability_hash,activation_evidence_digest,state,revision,created_at,updated_at
    ) VALUES ('session','run','chair','adapter','source-action',?,
              'provider-session-1',1,1,1,'source-capability',?,'active',1,1,1)
  `).run(SHA_A, SHA_A);
  const semantic = {
    schemaVersion: 1,
    sourceKind: "generation-loss",
    generationLossId: "loss",
    revision: 1,
    state: "open",
    abandonKind: "none",
    recoveryActionRef: null,
    activeRecoveryCustodyId: null,
    terminalEvidenceDigest: null,
  };
  const semanticJson = canonicalJson(semantic);
  const semanticDigest = digest(semantic);
  const journal = {
    schemaVersion: 1,
    ownerRef: {
      kind: "generation-loss",
      generationLossRef: {
        schemaVersion: 1,
        runId: "run",
        agentId: "chair",
        generationLossId: "loss",
        generationLossRevision: 1,
      },
      sourceRefDigest: semanticDigest,
    },
    priorJournalDigest: null,
    semanticDigest,
    sourceRefDigest: semanticDigest,
    authorityBatchId: null,
    authorityApplyId: null,
    authorityApplyDigest: null,
    originFreshApplyId: null,
    originFreshApplyDigest: null,
    recordedAt: 1,
  };
  const journalJson = canonicalJson(journal);
  const journalDigest = digest(journal);
  database.prepare(`
    INSERT INTO lifecycle_generation_losses(
      project_session_id,run_id,agent_id,generation_loss_id,loss_kind,
      old_provider_session_ref,new_provider_session_ref,
      old_provider_generation,new_provider_generation,
      old_context_revision,new_context_revision,
      source_custody_action_id,source_adapter_id,source_adapter_contract_digest,
      source_principal_generation,source_bridge_generation,bridge_owner_kind,
      source_bridge_row_id,source_bridge_revision,source_capability_hash,
      source_project_session_generation,source_run_generation,
      source_chair_lease_generation,checkpoint_state,checkpoint_ref,
      checkpoint_digest,loss_evidence_digest,creation_json,creation_digest,created_at
    ) VALUES ('session','run','chair','loss','generation-advance',
              'provider-session-1','provider-session-2',1,2,0,0,
              'source-action','adapter',?,1,1,'chair','run:chair',1,
              'source-capability',1,1,1,'last-validated','checkpoint',?,?,
              '{}','loss-creation',1)
  `).run(SHA_A, SHA_A, SHA_A);
  database.prepare(`
    INSERT INTO lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      prior_revision,prior_journal_digest,state,abandon_kind_code,
      recovery_action_adapter_id,recovery_action_id,active_recovery_custody_id,
      terminal_evidence_digest,semantic_json,semantic_digest,source_ref_digest,
      origin_fresh_apply_id,origin_fresh_apply_digest,receipt_batch_id,
      receipt_apply_id,receipt_apply_digest,journal_json,journal_digest,recorded_at
    ) VALUES ('session','run','chair','loss',1,NULL,NULL,'open','none',
              NULL,NULL,NULL,NULL,?,?,?,NULL,NULL,NULL,NULL,NULL,?,?,1)
  `).run(semanticJson, semanticDigest, semanticDigest, journalJson, journalDigest);
  database.prepare(`
    INSERT INTO lifecycle_generation_loss_heads(
      project_session_id,run_id,agent_id,generation_loss_id,current_revision,
      state,abandon_kind_code,semantic_digest,source_ref_digest,journal_digest,
      terminal,head_revision
    ) VALUES ('session','run','chair','loss',1,'open','none',?,?,?,0,1)
  `).run(semanticDigest, semanticDigest, journalDigest);
}

function issueInput(): CreateLifecycleRecoveryIssueInput {
  return {
    issueId: "issue",
    capabilityHash: "c".repeat(64),
    operatorId: "operator",
    projectSessionId: "session",
    runId: "run",
    agentId: "chair",
    source: { kind: "generation-loss", generationLossId: "loss" },
    parentCapabilityId: "parent-capability",
    consequentialGateId: "recovery-gate",
    issuedAt: 100,
    expiresAt: 200,
  };
}

function seedFreshRecoveryApply(database: Database.Database): Readonly<{
  actionRef: Readonly<{ adapterId: string; actionId: string }>;
  custodyId: string;
  applyId: string;
}> {
  const loss = database.prepare(`
    SELECT current_revision,source_ref_digest,journal_digest
      FROM lifecycle_generation_loss_heads WHERE generation_loss_id='loss'
  `).get() as { current_revision: number; source_ref_digest: string; journal_digest: string };
  const actionRef = { adapterId: "recovery-adapter", actionId: "recovery-action" } as const;
  const custodyId = "recovery-custody";
  const applyId = "fresh-apply";
  const nextLossBody = lossRevisionBody({
    revision: 2,
    state: "recovery-in-progress",
    actionRef,
    custodyId,
  });
  const nextLossSemanticDigest = lifecycleDigest("generation-loss-semantic", nextLossBody);
  const custodyBody = {
    schemaVersion: 1,
    sourceKind: "custody",
    custodyId,
    revision: 1,
    state: "awaiting-boundary",
    disposition: "none",
    proofKind: "none",
    terminalEvidenceDigest: null,
  };
  const custodySemanticDigest = lifecycleDigest("custody-semantic", custodyBody);
  const batchId = "fresh-batch";
  const handoffDigest = SHA_A;
  const freshEffectDigest = SHA_A;
  const applyBody = {
    schemaVersion: 1,
    applyId,
    applyKind: "fresh",
    receiptBatchId: batchId,
    batchCompletionDigest: SHA_A,
    transitionReplayDigest: SHA_A,
    orderedAuthorityReceiptSetDigest: SHA_A,
    verifiedScopeCheckpointDigest: SHA_A,
    appliedMutationPlanDigest: SHA_A,
    freshHandoffId: "fresh-handoff",
    freshHandoffDigest: handoffDigest,
    projectSessionId: "session",
    runId: "run",
    agentId: "chair",
    sourceMode: "open-generation-loss",
    freshApplyPlanDigest: SHA_A,
    newCustodyId: custodyId,
    newCustodyRevision: 1,
    newCustodySemanticDigest: custodySemanticDigest,
    newCustodySourceRefDigest: custodySemanticDigest,
    generationLossAfter: {
      generationLossId: "loss",
      revision: 2,
      semanticDigest: nextLossSemanticDigest,
      sourceRefDigest: nextLossSemanticDigest,
    },
    freshOriginEffectDigest: freshEffectDigest,
    localWriteSetDigest: SHA_A,
    appliedAt: 120,
  };
  const applyDigest = lifecycleDigest("transition-apply", applyBody);
  const custodyJournal = {
    schemaVersion: 1,
    ownerRef: {
      kind: "custody",
      custodyRef: {
        schemaVersion: 1,
        runId: "run",
        agentId: "chair",
        custodyId,
        custodyRevision: 1,
      },
      sourceRefDigest: custodySemanticDigest,
    },
    priorJournalDigest: null,
    semanticDigest: custodySemanticDigest,
    sourceRefDigest: custodySemanticDigest,
    authorityBatchId: null,
    authorityApplyId: null,
    authorityApplyDigest: null,
    originFreshApplyId: applyId,
    originFreshApplyDigest: applyDigest,
    recordedAt: 120,
  };
  const custodyJournalDigest = lifecycleDigest("custody-journal", custodyJournal);
  database.pragma("foreign_keys = OFF");
  admitProviderActionFixture(database, {
    runId: "run",
    actionId: actionRef.actionId,
    adapterId: actionRef.adapterId,
    operation: "spawn",
    targetAgentId: "chair",
    providerSessionGeneration: 2,
    identityHash: "recovery-identity",
    payloadHash: "recovery-payload",
    payloadJson: "{}",
    status: "prepared",
    historyJson: '["prepared"]',
    executionCount: 0,
    effectCount: 0,
    idempotencyProven: true,
    resultJson: null,
    updatedAt: 120,
  });
  database.prepare(`
    INSERT INTO capabilities(token_hash,run_id,agent_id,principal_generation,expires_at)
    VALUES ('staged-capability','run','chair',2,1000)
  `).run();
  database.prepare(`
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
      'session','run','chair',?,'fresh-command',?,
      ?,?,'generation-loss',NULL,NULL,'loss',1,?,?, 'chair',
      'operator-recovery',1,?,?,0,?,'checkpoint',?,1,?, ?,1,0,?,?,
      'provider-session-1','source-capability','source-action','adapter',?,
      'run:chair',1,1,1,1,1,1,1,2,2,2,?,?,
      'staged-capability',?,?,'fresh-handoff',?,'fresh-rotate',?, '{}',?,120
    )
  `).run(
    custodyId, SHA_A, actionRef.adapterId, actionRef.actionId,
    loss.source_ref_digest, loss.journal_digest, SHA_A, SHA_A, SHA_A, SHA_A,
    SHA_A, SHA_A, SHA_A, SHA_A, SHA_A, actionRef.adapterId, SHA_A, SHA_A, SHA_A,
    SHA_A, SHA_A, SHA_A,
  );
  database.prepare(`
    INSERT INTO lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,prior_revision,
      prior_journal_digest,state,disposition_code,proof_kind,
      terminal_evidence_digest,semantic_json,semantic_digest,source_ref_digest,
      origin_fresh_apply_id,origin_fresh_apply_digest,receipt_batch_id,
      receipt_apply_id,receipt_apply_digest,journal_json,journal_digest,recorded_at
    ) VALUES ('session','run','chair',?,1,NULL,NULL,'awaiting-boundary','none','none',
              NULL,?,?,?,?,?,NULL,NULL,NULL,?,?,120)
  `).run(
    custodyId, canonicalJson(custodyBody), custodySemanticDigest,
    custodySemanticDigest, applyId, applyDigest, canonicalJson(custodyJournal), custodyJournalDigest,
  );
  database.prepare(`
    INSERT INTO lifecycle_rotation_custody_heads(
      project_session_id,run_id,agent_id,custody_id,current_revision,state,
      disposition_code,semantic_digest,source_ref_digest,journal_digest,terminal,head_revision
    ) VALUES ('session','run','chair',?,1,'awaiting-boundary','none',?,?,?,0,1)
  `).run(custodyId, custodySemanticDigest, custodySemanticDigest, custodyJournalDigest);
  database.prepare(`
    INSERT INTO lifecycle_fresh_recovery_handoffs(
      handoff_id,preparation_id,attempt_id,preparation_digest,issue_id,
      project_session_id,run_id,agent_id,source_mode,recovery_source_kind,
      old_custody_id,old_custody_revision,generation_loss_id,generation_loss_revision,
      recovery_source_ref_digest,source_journal_digest,new_custody_id,planned_apply_id,
      new_custody_semantic_digest,new_custody_source_ref_digest,
      affected_generation_loss_id,affected_generation_loss_before_revision,
      affected_generation_loss_before_state,affected_generation_loss_before_source_ref_digest,
      affected_generation_loss_before_journal_digest,affected_generation_loss_after_revision,
      affected_generation_loss_after_semantic_digest,affected_generation_loss_after_source_ref_digest,
      affected_generation_loss_after_key,provider_action_adapter_id,provider_action_id,
      checkpoint_ref,checkpoint_digest,checkpoint_validation_digest,
      checkpoint_validation_key,adapter_contract_digest,operation,
      reserved_provider_generation,reserved_principal_generation,reserved_bridge_generation,
      admission_digest,fresh_apply_plan_json,fresh_apply_plan_digest,
      handoff_json,handoff_digest,created_at
    ) VALUES (
      'fresh-handoff','preparation','attempt','preparation-digest','issue',
      'session','run','chair','open-generation-loss','generation-loss',
      NULL,NULL,'loss',1,?,?,?, ?,?,?,
      'loss',1,'open',?,?,2,?,?,?, ?,?,
      'checkpoint',?,?,?,?,'fresh-rotate',2,2,2,?, '{}',?, '{}',?,120
    )
  `).run(
    loss.source_ref_digest, loss.journal_digest, custodyId, applyId,
    custodySemanticDigest, custodySemanticDigest,
    loss.source_ref_digest, loss.journal_digest,
    nextLossSemanticDigest, nextLossSemanticDigest, nextLossSemanticDigest,
    actionRef.adapterId, actionRef.actionId,
    SHA_A, SHA_A, SHA_A, SHA_A, SHA_A, SHA_A, SHA_A,
  );
  database.prepare(`
    INSERT INTO lifecycle_receipt_batches(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind,planned_apply_kind,effects_set_digest,mutation_plan_digest,
      transition_replay_json,transition_replay_digest,ordered_subject_set_digest,
      receipt_intent_count,secondary_intent_kind,review_adoption_reservation_id,
      review_adoption_reservation_digest,review_decision_loss_effect_key,
      review_decision_loss_effect_role,review_decision_loss_effect_digest,
      review_decision_loss_after_id,review_decision_loss_after_revision,
      review_decision_loss_after_semantic_digest,
      review_decision_loss_after_source_ref_digest,fresh_handoff_id,
      fresh_handoff_digest,fresh_handoff_source_mode,fresh_handoff_key,
      recovery_retirement_id,recovery_retirement_plan_digest,created_at
    ) VALUES (
      ?,?,'session','run','chair','fresh-origin','fresh',?,?, '{}',?,?,1,'none',
      NULL,NULL,'none',NULL,NULL,NULL,NULL,NULL,NULL,'fresh-handoff',?,
      'open-generation-loss',?,NULL,NULL,120
    )
  `).run(batchId, applyId, SHA_A, SHA_A, SHA_A, SHA_A, handoffDigest, handoffDigest);
  database.prepare(`
    INSERT INTO lifecycle_receipt_fresh_origin_effects(
      batch_id,receipt_ordinal,batch_transition_kind,effect_role,planned_apply_id,
      project_session_id,run_id,agent_id,source_mode,recovery_source_kind,
      recovery_source_ref_digest,source_journal_digest,handoff_id,handoff_digest,
      admission_digest,fresh_apply_plan_digest,new_custody_id,new_custody_revision,
      new_custody_semantic_digest,new_custody_source_ref_digest,
      affected_generation_loss_id,affected_generation_loss_before_revision,
      affected_generation_loss_before_state,affected_generation_loss_before_source_ref_digest,
      affected_generation_loss_before_journal_digest,affected_generation_loss_after_revision,
      affected_generation_loss_after_semantic_digest,affected_generation_loss_after_source_ref_digest,
      affected_generation_loss_after_key,effect_json,effect_digest
    ) VALUES (
      ?,1,'fresh-origin','primary',?,'session','run','chair','open-generation-loss',
      'generation-loss',?,?,'fresh-handoff',?,?,?,?,1,?,?,
      'loss',1,'open',?,?,2,?,?,?, ?,?
    )
  `).run(
    batchId, applyId, loss.source_ref_digest, loss.journal_digest, handoffDigest,
    SHA_A, SHA_A, custodyId, custodySemanticDigest, custodySemanticDigest,
    loss.source_ref_digest, loss.journal_digest, nextLossSemanticDigest,
    nextLossSemanticDigest, nextLossSemanticDigest,
    canonicalJson({ localWriteSetDigest: SHA_A }), freshEffectDigest,
  );
  database.prepare(`
    INSERT INTO lifecycle_receipt_batch_completions(
      batch_id,transition_kind,receipt_intent_count,secondary_intent_kind,
      ordinal_one,ordinal_one_intent_digest,ordinal_one_subject_digest,
      ordinal_one_receipt_digest,ordinal_two,ordinal_two_intent_digest,
      ordinal_two_subject_digest,ordinal_two_receipt_digest,
      primary_custody_effect_digest,primary_loss_effect_role,
      primary_loss_effect_digest,primary_retirement_effect_digest,
      primary_fresh_origin_effect_role,primary_fresh_origin_effect_digest,
      linked_loss_effect_role,linked_loss_effect_digest,
      secondary_fresh_origin_effect_role,secondary_fresh_origin_effect_digest,
      ordered_authority_receipt_set_digest,completion_json,completion_digest,completed_at
    ) VALUES (
      ?,'fresh-origin',1,'none',1,?,?,?,NULL,NULL,NULL,NULL,
      NULL,NULL,NULL,NULL,'primary',?,NULL,NULL,NULL,NULL,?, '{}',?,120
    )
  `).run(batchId, SHA_A, SHA_A, SHA_A, freshEffectDigest, SHA_A, SHA_A);
  database.prepare(`
    INSERT INTO lifecycle_receipt_batch_authorizations(
      batch_id,project_session_id,run_id,batch_completion_digest,
      ordered_authority_receipt_set_digest,verified_scope_checkpoint_digest,
      authorized_at,authorization_digest
    ) VALUES (?,'session','run',?,?,?,?,?)
  `).run(batchId, SHA_A, SHA_A, SHA_A, 120, SHA_A);
  database.pragma("foreign_keys = ON");
  return { actionRef, custodyId, applyId };
}

function seedAttemptTerminalAuthorization(
  database: Database.Database,
  disposition: "adopted" | "no-effect" | "superseded" | "quarantined",
): Readonly<{ applyId: string; terminalEvidenceDigest: string }> {
  if (disposition === "adopted") {
    const rotation = new LifecycleRotationRepository(database);
    database.transaction(() => {
      for (const [state, recordedAt] of [
        ["prepared", 121],
        ["dispatched", 122],
        ["accepted", 123],
        ["provider-terminal", 124],
        ["committing", 125],
      ] as const) {
        const head = rotation.readHead("run", "chair", "recovery-custody");
        rotation.appendInCurrentTransaction({
          runId: "run",
          agentId: "chair",
          custodyId: "recovery-custody",
          expectedRevision: head.revision,
          state,
          ...(state === "provider-terminal" || state === "committing"
            ? {
                terminalEvidenceDigest: lifecycleDigest(
                  "custody-provider-terminal",
                  { custodyId: "recovery-custody" },
                ),
              }
            : {}),
          recordedAt,
        });
      }
    }).immediate();
  }
  const loss = database.prepare(`
    SELECT current_revision,semantic_digest,source_ref_digest,journal_digest
      FROM lifecycle_generation_loss_heads WHERE generation_loss_id='loss'
  `).get() as {
    current_revision: number;
    semantic_digest: string;
    source_ref_digest: string;
    journal_digest: string;
  };
  const custody = database.prepare(`
    SELECT head.current_revision,head.journal_digest,custody.provider_action_adapter_id,
           custody.provider_action_id
      FROM lifecycle_rotation_custody_heads head
      JOIN lifecycle_rotation_custodies custody
        ON custody.run_id=head.run_id AND custody.agent_id=head.agent_id
       AND custody.custody_id=head.custody_id
     WHERE head.custody_id='recovery-custody'
  `).get() as {
    current_revision: number;
    journal_digest: string;
    provider_action_adapter_id: string;
    provider_action_id: string;
  };
  const terminalEvidenceDigest = lifecycleDigest("custody-terminal-evidence", {
    custodyId: "recovery-custody",
    disposition,
  });
  const custodyBody = {
    schemaVersion: 1,
    sourceKind: "custody",
    custodyId: "recovery-custody",
    revision: custody.current_revision + 1,
    state: "finalized",
    disposition,
    proofKind: disposition === "adopted"
      ? "provider-terminal"
      : disposition === "no-effect"
        ? "zero-dispatch-no-effect"
        : disposition === "superseded"
          ? "predispatch-superseded"
          : "integrity-quarantine",
    terminalEvidenceDigest,
  };
  const custodySemanticDigest = lifecycleDigest("custody-semantic", custodyBody);
  const custodyJournal = {
    schemaVersion: 1,
    ownerRef: {
      kind: "custody",
      custodyRef: {
        schemaVersion: 1,
        runId: "run",
        agentId: "chair",
        custodyId: "recovery-custody",
        custodyRevision: custody.current_revision + 1,
      },
      sourceRefDigest: custodySemanticDigest,
    },
    priorJournalDigest: custody.journal_digest,
    semanticDigest: custodySemanticDigest,
    sourceRefDigest: custodySemanticDigest,
    authorityBatchId: `custody-batch-${disposition}`,
    authorityApplyId: `custody-apply-${disposition}`,
    authorityApplyDigest: SHA_A,
    originFreshApplyId: null,
    originFreshApplyDigest: null,
    recordedAt: 130,
  };
  const custodyJournalDigest = lifecycleDigest("custody-journal", custodyJournal);
  const targetState = disposition === "adopted" ? "recovered-adopted" as const : "open" as const;
  const targetBody = lossRevisionBody({
    revision: loss.current_revision + 1,
    state: targetState,
    actionRef: disposition === "adopted"
      ? { adapterId: custody.provider_action_adapter_id, actionId: custody.provider_action_id }
      : null,
    custodyId: disposition === "adopted" ? "recovery-custody" : null,
    terminalEvidenceDigest: disposition === "adopted" ? terminalEvidenceDigest : null,
  });
  const targetSemanticDigest = lifecycleDigest("generation-loss-semantic", targetBody);
  const transitionReplay = {
    schemaVersion: 1,
    generationLossId: "loss",
    beforeRevision: loss.current_revision,
    sourceCustodyId: "recovery-custody",
    sourceCustodyRevision: custody.current_revision + 1,
    sourceActionRef: {
      adapterId: custody.provider_action_adapter_id,
      actionId: custody.provider_action_id,
    },
    sourceDisposition: disposition,
    sourceTerminalEvidenceDigest: terminalEvidenceDigest,
    afterState: targetState,
    afterSemanticDigest: targetSemanticDigest,
    afterSourceRefDigest: targetSemanticDigest,
    localWriteSetDigest: SHA_A,
  };
  const transitionReplayJson = canonicalJson(transitionReplay);
  const transitionReplayDigest = lifecycleDigest("generation-loss-transition-replay", transitionReplay);
  const mutationPlanDigest = lifecycleDigest("generation-loss-mutation-plan", {
    generationLossId: "loss",
    beforeRevision: loss.current_revision,
    afterRevision: loss.current_revision + 1,
    afterSemanticDigest: targetSemanticDigest,
    afterSourceRefDigest: targetSemanticDigest,
  });
  const applyId = `loss-apply-${disposition}`;
  const batchId = `loss-batch-${disposition}`;
  const intentDigest = lifecycleDigest("test-intent", { batchId });
  const subjectDigest = lifecycleDigest("test-subject", { batchId });
  const receiptDigest = lifecycleDigest("test-receipt", { batchId });
  const orderedReceiptDigest = lifecycleDigest("test-ordered-receipts", { batchId });
  const completionDigest = lifecycleDigest("test-completion", { batchId });
  const checkpointDigest = lifecycleDigest("test-checkpoint", { batchId });
  const authorizationDigest = lifecycleDigest("test-authorization", { batchId });
  const effectDigest = lifecycleDigest("generation-loss-effect", {
    generationLossId: "loss",
    beforeRevision: loss.current_revision,
    afterRevision: loss.current_revision + 1,
    afterSemanticDigest: targetSemanticDigest,
    afterSourceRefDigest: targetSemanticDigest,
  });
  database.pragma("foreign_keys = OFF");
  database.prepare(`
    INSERT INTO lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,prior_revision,
      prior_journal_digest,state,disposition_code,proof_kind,
      terminal_evidence_digest,semantic_json,semantic_digest,source_ref_digest,
      origin_fresh_apply_id,origin_fresh_apply_digest,receipt_batch_id,
      receipt_apply_id,receipt_apply_digest,journal_json,journal_digest,recorded_at
    ) VALUES ('session','run','chair','recovery-custody',?,?,?,'finalized',?,?,
              ?,?,?,?,NULL,NULL,?,?,?, ?,?,130)
  `).run(
    custody.current_revision + 1, custody.current_revision, custody.journal_digest,
    disposition, custodyBody.proofKind, terminalEvidenceDigest,
    canonicalJson(custodyBody), custodySemanticDigest, custodySemanticDigest,
    `custody-batch-${disposition}`, `custody-apply-${disposition}`, SHA_A,
    canonicalJson(custodyJournal), custodyJournalDigest,
  );
  database.prepare(`
    UPDATE lifecycle_rotation_custody_heads
       SET current_revision=?,state='finalized',disposition_code=?,semantic_digest=?,
           source_ref_digest=?,journal_digest=?,terminal=1,head_revision=head_revision+1
     WHERE custody_id='recovery-custody'
  `).run(
    custody.current_revision + 1, disposition, custodySemanticDigest,
    custodySemanticDigest, custodyJournalDigest,
  );
  database.prepare(`
    INSERT INTO lifecycle_receipt_batches(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind,planned_apply_kind,effects_set_digest,mutation_plan_digest,
      transition_replay_json,transition_replay_digest,ordered_subject_set_digest,
      receipt_intent_count,secondary_intent_kind,review_adoption_reservation_id,
      review_adoption_reservation_digest,review_decision_loss_effect_key,
      review_decision_loss_effect_role,review_decision_loss_effect_digest,
      review_decision_loss_after_id,review_decision_loss_after_revision,
      review_decision_loss_after_semantic_digest,
      review_decision_loss_after_source_ref_digest,fresh_handoff_id,
      fresh_handoff_digest,fresh_handoff_source_mode,fresh_handoff_key,
      recovery_retirement_id,recovery_retirement_plan_digest,created_at
    ) VALUES (
      ?,?,'session','run','chair','generation-loss-terminal','terminal',?,?,?, ?,?,
      1,'none',NULL,NULL,'none',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'none',
      NULL,NULL,130
    )
  `).run(
    batchId, applyId, effectDigest, mutationPlanDigest,
    transitionReplayJson, transitionReplayDigest, effectDigest,
  );
  database.prepare(`
    INSERT INTO lifecycle_receipt_generation_loss_effects(
      batch_id,ordinal,role,planned_apply_id,batch_transition_kind,
      project_session_id,run_id,agent_id,generation_loss_id,pre_revision,
      pre_journal_digest,final_revision,final_semantic_digest,
      final_source_ref_digest,effect_digest
    ) VALUES (?,1,'primary',?,'generation-loss-terminal','session','run','chair',
              'loss',?,?,?, ?,?,?)
  `).run(
    batchId, applyId, loss.current_revision, loss.journal_digest,
    loss.current_revision + 1, targetSemanticDigest, targetSemanticDigest, effectDigest,
  );
  database.prepare(`
    INSERT INTO lifecycle_receipt_batch_completions(
      batch_id,transition_kind,receipt_intent_count,secondary_intent_kind,
      ordinal_one,ordinal_one_intent_digest,ordinal_one_subject_digest,
      ordinal_one_receipt_digest,ordinal_two,ordinal_two_intent_digest,
      ordinal_two_subject_digest,ordinal_two_receipt_digest,
      primary_custody_effect_digest,primary_loss_effect_role,
      primary_loss_effect_digest,primary_retirement_effect_digest,
      primary_fresh_origin_effect_role,primary_fresh_origin_effect_digest,
      linked_loss_effect_role,linked_loss_effect_digest,
      secondary_fresh_origin_effect_role,secondary_fresh_origin_effect_digest,
      ordered_authority_receipt_set_digest,completion_json,completion_digest,completed_at
    ) VALUES (
      ?,'generation-loss-terminal',1,'none',1,?,?,?,NULL,NULL,NULL,NULL,
      NULL,'primary',?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?, '{}',?,130
    )
  `).run(
    batchId, intentDigest, subjectDigest, receiptDigest, effectDigest,
    orderedReceiptDigest, completionDigest,
  );
  database.prepare(`
    INSERT INTO lifecycle_receipt_batch_authorizations(
      batch_id,project_session_id,run_id,batch_completion_digest,
      ordered_authority_receipt_set_digest,verified_scope_checkpoint_digest,
      authorized_at,authorization_digest
    ) VALUES (?,'session','run',?,?,?,?,?)
  `).run(
    batchId, completionDigest, orderedReceiptDigest, checkpointDigest, 130,
    authorizationDigest,
  );
  database.pragma("foreign_keys = ON");
  return { applyId, terminalEvidenceDigest };
}

function seedAbandonAuthorization(
  database: Database.Database,
  abandonKind: "direct-open" | "recovery-attempt",
): Readonly<{ applyId: string; terminalEvidenceDigest: string }> {
  const loss = database.prepare(`
    SELECT current_revision,state,semantic_digest,source_ref_digest,journal_digest
      FROM lifecycle_generation_loss_heads WHERE generation_loss_id='loss'
  `).get() as {
    current_revision: number;
    state: string;
    semantic_digest: string;
    source_ref_digest: string;
    journal_digest: string;
  };
  const actionRef = abandonKind === "recovery-attempt"
    ? { adapterId: "recovery-adapter", actionId: "recovery-action" }
    : null;
  const custodyId = abandonKind === "recovery-attempt" ? "recovery-custody" : null;
  const confirmationDigest = lifecycleDigest("generation-loss-abandon-confirmation", {
    operatorId: "operator",
    parentCapabilityId: "parent-capability",
    consequentialGateId: "recovery-gate",
    generationLossId: "loss",
    beforeRevision: loss.current_revision,
    abandonKind,
    sourceCustodyId: custodyId,
    sourceActionRef: actionRef,
    confirmedAt: 140,
  });
  let sourceCustodyRevision: number | null = null;
  let sourceTerminalEvidenceDigest: string | null = null;
  database.pragma("foreign_keys = OFF");
  if (custodyId !== null) {
    const custody = database.prepare(`
      SELECT current_revision,journal_digest FROM lifecycle_rotation_custody_heads
       WHERE custody_id=?
    `).get(custodyId) as { current_revision: number; journal_digest: string };
    sourceCustodyRevision = custody.current_revision + 1;
    sourceTerminalEvidenceDigest = lifecycleDigest("custody-terminal-evidence", {
      custodyId,
      disposition: "abandoned",
      confirmationDigest,
    });
    const custodyBody = {
      schemaVersion: 1,
      sourceKind: "custody",
      custodyId,
      revision: sourceCustodyRevision,
      state: "finalized",
      disposition: "abandoned",
      proofKind: "confirmed-abandon",
      terminalEvidenceDigest: sourceTerminalEvidenceDigest,
    };
    const custodySemanticDigest = lifecycleDigest("custody-semantic", custodyBody);
    const custodyJournal = {
      schemaVersion: 1,
      ownerRef: {
        kind: "custody",
        custodyRef: {
          schemaVersion: 1,
          runId: "run",
          agentId: "chair",
          custodyId,
          custodyRevision: sourceCustodyRevision,
        },
        sourceRefDigest: custodySemanticDigest,
      },
      priorJournalDigest: custody.journal_digest,
      semanticDigest: custodySemanticDigest,
      sourceRefDigest: custodySemanticDigest,
      authorityBatchId: "abandon-custody-batch",
      authorityApplyId: "abandon-custody-apply",
      authorityApplyDigest: SHA_A,
      originFreshApplyId: null,
      originFreshApplyDigest: null,
      recordedAt: 139,
    };
    const custodyJournalDigest = lifecycleDigest("custody-journal", custodyJournal);
    database.prepare(`
      INSERT INTO lifecycle_rotation_custody_revisions(
        project_session_id,run_id,agent_id,custody_id,revision,prior_revision,
        prior_journal_digest,state,disposition_code,proof_kind,
        terminal_evidence_digest,semantic_json,semantic_digest,source_ref_digest,
        origin_fresh_apply_id,origin_fresh_apply_digest,receipt_batch_id,
        receipt_apply_id,receipt_apply_digest,journal_json,journal_digest,recorded_at
      ) VALUES ('session','run','chair',?,?,?,?, 'finalized','abandoned',?,
                ?,?,?,?,NULL,NULL,?,?,?, ?,?,139)
    `).run(
      custodyId, sourceCustodyRevision, custody.current_revision, custody.journal_digest,
      custodyBody.proofKind, sourceTerminalEvidenceDigest, canonicalJson(custodyBody),
      custodySemanticDigest, custodySemanticDigest, "abandon-custody-batch",
      "abandon-custody-apply", SHA_A, canonicalJson(custodyJournal), custodyJournalDigest,
    );
    database.prepare(`
      UPDATE lifecycle_rotation_custody_heads
         SET current_revision=?,state='finalized',disposition_code='abandoned',
             semantic_digest=?,source_ref_digest=?,journal_digest=?,terminal=1,
             head_revision=head_revision+1
       WHERE custody_id=?
    `).run(
      sourceCustodyRevision, custodySemanticDigest, custodySemanticDigest,
      custodyJournalDigest, custodyId,
    );
  }
  const terminalEvidenceDigest = sourceTerminalEvidenceDigest ?? confirmationDigest;
  const targetBody = lossRevisionBody({
    revision: loss.current_revision + 1,
    state: "abandoned",
    abandonKind,
    actionRef,
    custodyId,
    terminalEvidenceDigest,
  });
  const targetSemanticDigest = lifecycleDigest("generation-loss-semantic", targetBody);
  const transitionReplay = {
    schemaVersion: 1,
    generationLossId: "loss",
    beforeRevision: loss.current_revision,
    abandonKind,
    sourceCustodyId: custodyId,
    sourceCustodyRevision,
    sourceActionRef: actionRef,
    sourceTerminalEvidenceDigest,
    operatorId: "operator",
    parentCapabilityId: "parent-capability",
    consequentialGateId: "recovery-gate",
    confirmationDigest,
    afterState: "abandoned",
    afterSemanticDigest: targetSemanticDigest,
    afterSourceRefDigest: targetSemanticDigest,
    localWriteSetDigest: SHA_A,
  };
  const batchId = `abandon-loss-batch-${abandonKind}`;
  const applyId = `abandon-loss-apply-${abandonKind}`;
  const mutationPlanDigest = lifecycleDigest("generation-loss-mutation-plan", {
    generationLossId: "loss",
    beforeRevision: loss.current_revision,
    afterRevision: loss.current_revision + 1,
    afterSemanticDigest: targetSemanticDigest,
    afterSourceRefDigest: targetSemanticDigest,
  });
  const effectDigest = lifecycleDigest("generation-loss-effect", {
    generationLossId: "loss",
    beforeRevision: loss.current_revision,
    afterRevision: loss.current_revision + 1,
    afterSemanticDigest: targetSemanticDigest,
    afterSourceRefDigest: targetSemanticDigest,
  });
  const transitionReplayDigest = lifecycleDigest("generation-loss-transition-replay", transitionReplay);
  const intentDigest = lifecycleDigest("test-intent", { batchId });
  const subjectDigest = lifecycleDigest("test-subject", { batchId });
  const receiptDigest = lifecycleDigest("test-receipt", { batchId });
  const orderedReceiptDigest = lifecycleDigest("test-ordered-receipts", { batchId });
  const completionDigest = lifecycleDigest("test-completion", { batchId });
  const checkpointDigest = lifecycleDigest("test-checkpoint", { batchId });
  database.prepare(`
    INSERT INTO lifecycle_receipt_batches(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind,planned_apply_kind,effects_set_digest,mutation_plan_digest,
      transition_replay_json,transition_replay_digest,ordered_subject_set_digest,
      receipt_intent_count,secondary_intent_kind,review_adoption_reservation_id,
      review_adoption_reservation_digest,review_decision_loss_effect_key,
      review_decision_loss_effect_role,review_decision_loss_effect_digest,
      review_decision_loss_after_id,review_decision_loss_after_revision,
      review_decision_loss_after_semantic_digest,
      review_decision_loss_after_source_ref_digest,fresh_handoff_id,
      fresh_handoff_digest,fresh_handoff_source_mode,fresh_handoff_key,
      recovery_retirement_id,recovery_retirement_plan_digest,created_at
    ) VALUES (? ,?,'session','run','chair','generation-loss-terminal','terminal',
              ?,?,?,?, ?,1,'none',NULL,NULL,'none',NULL,NULL,NULL,NULL,NULL,NULL,
              NULL,NULL,NULL,'none',NULL,NULL,140)
  `).run(
    batchId, applyId, effectDigest, mutationPlanDigest, canonicalJson(transitionReplay),
    transitionReplayDigest, effectDigest,
  );
  database.prepare(`
    INSERT INTO lifecycle_receipt_generation_loss_effects(
      batch_id,ordinal,role,planned_apply_id,batch_transition_kind,
      project_session_id,run_id,agent_id,generation_loss_id,pre_revision,
      pre_journal_digest,final_revision,final_semantic_digest,
      final_source_ref_digest,effect_digest
    ) VALUES (?,1,'primary',?,'generation-loss-terminal','session','run','chair',
              'loss',?,?,?,?,?,?)
  `).run(
    batchId, applyId, loss.current_revision, loss.journal_digest,
    loss.current_revision + 1, targetSemanticDigest, targetSemanticDigest, effectDigest,
  );
  database.prepare(`
    INSERT INTO lifecycle_receipt_batch_completions(
      batch_id,transition_kind,receipt_intent_count,secondary_intent_kind,
      ordinal_one,ordinal_one_intent_digest,ordinal_one_subject_digest,
      ordinal_one_receipt_digest,ordinal_two,ordinal_two_intent_digest,
      ordinal_two_subject_digest,ordinal_two_receipt_digest,
      primary_custody_effect_digest,primary_loss_effect_role,
      primary_loss_effect_digest,primary_retirement_effect_digest,
      primary_fresh_origin_effect_role,primary_fresh_origin_effect_digest,
      linked_loss_effect_role,linked_loss_effect_digest,
      secondary_fresh_origin_effect_role,secondary_fresh_origin_effect_digest,
      ordered_authority_receipt_set_digest,completion_json,completion_digest,completed_at
    ) VALUES (?,'generation-loss-terminal',1,'none',1,?,?,?,NULL,NULL,NULL,NULL,
              NULL,'primary',?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,'{}',?,140)
  `).run(
    batchId, intentDigest, subjectDigest, receiptDigest, effectDigest,
    orderedReceiptDigest, completionDigest,
  );
  database.prepare(`
    INSERT INTO lifecycle_receipt_batch_authorizations(
      batch_id,project_session_id,run_id,batch_completion_digest,
      ordered_authority_receipt_set_digest,verified_scope_checkpoint_digest,
      authorized_at,authorization_digest
    ) VALUES (?,'session','run',?,?,?,?,?)
  `).run(
    batchId, completionDigest, orderedReceiptDigest, checkpointDigest, 140,
    lifecycleDigest("test-authorization", { batchId }),
  );
  database.pragma("foreign_keys = ON");
  return { applyId, terminalEvidenceDigest };
}

describe("lifecycle recovery repository", () => {
  it("creates one immutable exact-source issue and replays only the identical issuance", () => {
    const database = openDatabase();
    seedOpenGenerationLoss(database);
    const repository = new LifecycleRecoveryRepository(database);

    const first = database.transaction(() =>
      repository.createIssueInCurrentTransaction(issueInput())
    ).immediate();
    expect(first).toMatchObject({
      issueId: "issue",
      projectSessionId: "session",
      runId: "run",
      agentId: "chair",
      source: { kind: "generation-loss", generationLossId: "loss" },
      sourceRevision: 1,
      parentCapabilityId: "parent-capability",
      consequentialGateId: "recovery-gate",
      status: "active",
    });
    expect(repository.readIssue("issue", 100)).toEqual(first);
    expect(database.transaction(() =>
      repository.createIssueInCurrentTransaction(issueInput())
    ).immediate()).toEqual(first);
    expect(() => database.transaction(() =>
      repository.createIssueInCurrentTransaction({ ...issueInput(), expiresAt: 201 })
    ).immediate()).toThrow("recovery issue replay conflicts with its immutable issuance");
    expect(database.prepare(`
      SELECT count(*) AS count FROM agent_lifecycle_recovery_capability_issues
    `).get()).toEqual({ count: 1 });

    database.close();
  });

  it("revokes one issue immutably and rejects a crossed revocation replay", () => {
    const database = openDatabase();
    seedOpenGenerationLoss(database);
    const repository = new LifecycleRecoveryRepository(database);
    database.transaction(() => repository.createIssueInCurrentTransaction(issueInput())).immediate();

    const first = database.transaction(() => repository.revokeIssueInCurrentTransaction({
      issueId: "issue",
      revocationKind: "operator-revoked",
      evidence: { operatorId: "operator", reason: "cancelled recovery" },
      revokedAt: 150,
    })).immediate();
    expect(first).toMatchObject({ issueId: "issue", status: "revoked" });
    expect(repository.readIssue("issue", 150)).toEqual(first);
    expect(database.transaction(() => repository.revokeIssueInCurrentTransaction({
      issueId: "issue",
      revocationKind: "operator-revoked",
      evidence: { operatorId: "operator", reason: "cancelled recovery" },
      revokedAt: 150,
    })).immediate()).toEqual(first);
    expect(() => database.transaction(() => repository.revokeIssueInCurrentTransaction({
      issueId: "issue",
      revocationKind: "source-stale",
      evidence: { reason: "changed" },
      revokedAt: 151,
    })).immediate()).toThrow("recovery issue revocation conflicts with its immutable record");

    database.close();
  });

  it("moves one exact open loss to recovery-in-progress and rejects crossed attempts", () => {
    const database = openDatabase();
    seedOpenGenerationLoss(database);
    const repository = new LifecycleRecoveryRepository(database);
    database.transaction(() => repository.createIssueInCurrentTransaction(issueInput())).immediate();
    const attempt = seedFreshRecoveryApply(database);

    const first = database.transaction(() => repository.beginGenerationLossRecoveryInCurrentTransaction({
      runId: "run",
      agentId: "chair",
      generationLossId: "loss",
      custodyId: attempt.custodyId,
      actionRef: attempt.actionRef,
      originFreshApplyId: attempt.applyId,
      recordedAt: 120,
    })).immediate();
    expect(first).toMatchObject({
      generationLossId: "loss",
      revision: 2,
      state: "recovery-in-progress",
      recoveryActionRef: attempt.actionRef,
      activeRecoveryCustodyId: attempt.custodyId,
      terminal: false,
    });
    expect(database.transaction(() => repository.beginGenerationLossRecoveryInCurrentTransaction({
      runId: "run",
      agentId: "chair",
      generationLossId: "loss",
      custodyId: attempt.custodyId,
      actionRef: attempt.actionRef,
      originFreshApplyId: attempt.applyId,
      recordedAt: 120,
    })).immediate()).toEqual(first);
    expect(() => database.transaction(() => repository.beginGenerationLossRecoveryInCurrentTransaction({
      runId: "run",
      agentId: "chair",
      generationLossId: "loss",
      custodyId: attempt.custodyId,
      actionRef: { ...attempt.actionRef, actionId: "crossed-action" },
      originFreshApplyId: attempt.applyId,
      recordedAt: 120,
    })).immediate()).toThrow("generation-loss recovery replay conflicts with its active attempt");

    database.close();
  });

  it.each(["no-effect", "superseded", "quarantined"] as const)(
    "returns a %s recovery attempt to open without retaining its action",
    (disposition) => {
      const database = openDatabase();
      seedOpenGenerationLoss(database);
      const repository = new LifecycleRecoveryRepository(database);
      database.transaction(() => repository.createIssueInCurrentTransaction(issueInput())).immediate();
      const attempt = seedFreshRecoveryApply(database);
      database.transaction(() => repository.beginGenerationLossRecoveryInCurrentTransaction({
        runId: "run",
        agentId: "chair",
        generationLossId: "loss",
        custodyId: attempt.custodyId,
        actionRef: attempt.actionRef,
        originFreshApplyId: attempt.applyId,
        recordedAt: 120,
      })).immediate();
      const terminal = seedAttemptTerminalAuthorization(database, disposition);

      expect(database.transaction(() => repository.settleGenerationLossAttemptInCurrentTransaction({
        runId: "run",
        agentId: "chair",
        generationLossId: "loss",
        custodyId: attempt.custodyId,
        actionRef: attempt.actionRef,
        receiptApplyId: terminal.applyId,
        recordedAt: 130,
      })).immediate()).toMatchObject({
        revision: 3,
        state: "open",
        recoveryActionRef: null,
        activeRecoveryCustodyId: null,
        terminalEvidenceDigest: null,
        terminal: false,
      });

      database.close();
    },
  );

  it("moves an exactly adopted recovery attempt to recovered-adopted", () => {
    const database = openDatabase();
    seedOpenGenerationLoss(database);
    const repository = new LifecycleRecoveryRepository(database);
    database.transaction(() => repository.createIssueInCurrentTransaction(issueInput())).immediate();
    const attempt = seedFreshRecoveryApply(database);
    database.transaction(() => repository.beginGenerationLossRecoveryInCurrentTransaction({
      runId: "run",
      agentId: "chair",
      generationLossId: "loss",
      custodyId: attempt.custodyId,
      actionRef: attempt.actionRef,
      originFreshApplyId: attempt.applyId,
      recordedAt: 120,
    })).immediate();
    const terminal = seedAttemptTerminalAuthorization(database, "adopted");

    expect(database.transaction(() => repository.settleGenerationLossAttemptInCurrentTransaction({
      runId: "run",
      agentId: "chair",
      generationLossId: "loss",
      custodyId: attempt.custodyId,
      actionRef: attempt.actionRef,
      receiptApplyId: terminal.applyId,
      recordedAt: 130,
    })).immediate()).toMatchObject({
      revision: 3,
      state: "recovered-adopted",
      recoveryActionRef: attempt.actionRef,
      activeRecoveryCustodyId: attempt.custodyId,
      terminalEvidenceDigest: terminal.terminalEvidenceDigest,
      terminal: true,
    });

    database.close();
  });

  it("abandons an open loss only from one confirmed authorized transition", () => {
    const database = openDatabase();
    seedOpenGenerationLoss(database);
    const repository = new LifecycleRecoveryRepository(database);
    const terminal = seedAbandonAuthorization(database, "direct-open");

    const first = database.transaction(() => repository.abandonGenerationLossInCurrentTransaction({
      runId: "run",
      agentId: "chair",
      generationLossId: "loss",
      receiptApplyId: terminal.applyId,
      recordedAt: 140,
    })).immediate();
    expect(first).toMatchObject({
      revision: 2,
      state: "abandoned",
      abandonKind: "direct-open",
      recoveryActionRef: null,
      activeRecoveryCustodyId: null,
      terminalEvidenceDigest: terminal.terminalEvidenceDigest,
      terminal: true,
    });
    expect(database.transaction(() => repository.abandonGenerationLossInCurrentTransaction({
      runId: "run",
      agentId: "chair",
      generationLossId: "loss",
      receiptApplyId: terminal.applyId,
      recordedAt: 140,
    })).immediate()).toEqual(first);

    database.close();
  });

  it("abandons an active recovery only after its exact custody is abandoned", () => {
    const database = openDatabase();
    seedOpenGenerationLoss(database);
    const repository = new LifecycleRecoveryRepository(database);
    database.transaction(() => repository.createIssueInCurrentTransaction(issueInput())).immediate();
    const attempt = seedFreshRecoveryApply(database);
    database.transaction(() => repository.beginGenerationLossRecoveryInCurrentTransaction({
      runId: "run",
      agentId: "chair",
      generationLossId: "loss",
      custodyId: attempt.custodyId,
      actionRef: attempt.actionRef,
      originFreshApplyId: attempt.applyId,
      recordedAt: 120,
    })).immediate();
    const terminal = seedAbandonAuthorization(database, "recovery-attempt");

    expect(database.transaction(() => repository.abandonGenerationLossInCurrentTransaction({
      runId: "run",
      agentId: "chair",
      generationLossId: "loss",
      receiptApplyId: terminal.applyId,
      recordedAt: 140,
    })).immediate()).toMatchObject({
      revision: 3,
      state: "abandoned",
      abandonKind: "recovery-attempt",
      recoveryActionRef: attempt.actionRef,
      activeRecoveryCustodyId: attempt.custodyId,
      terminalEvidenceDigest: terminal.terminalEvidenceDigest,
      terminal: true,
    });

    database.close();
  });

  it("rolls back every terminal loss write with its caller-owned transaction", () => {
    const database = openDatabase();
    seedOpenGenerationLoss(database);
    const repository = new LifecycleRecoveryRepository(database);
    const terminal = seedAbandonAuthorization(database, "direct-open");

    expect(() => database.transaction(() => {
      repository.abandonGenerationLossInCurrentTransaction({
        runId: "run",
        agentId: "chair",
        generationLossId: "loss",
        receiptApplyId: terminal.applyId,
        recordedAt: 140,
      });
      throw new Error("caller rollback");
    }).immediate()).toThrow("caller rollback");
    expect(repository.readGenerationLossHead("run", "chair", "loss")).toMatchObject({
      revision: 1,
      state: "open",
      terminal: false,
    });
    expect(database.prepare(`
      SELECT count(*) AS count FROM lifecycle_transition_applies WHERE apply_id=?
    `).get(terminal.applyId)).toEqual({ count: 0 });

    database.close();
  });
});

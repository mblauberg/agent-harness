
### 9.22 Asynchronous lifecycle rotation persistence

Spec 01 section 32.20 owns observable behaviour.
`lifecycle_rotation_custodies` plus its append-only revisions and exact head is
the dedicated owner for rotate/compact provider and bridge effects, including a
true chair rotation.

The current baseline relations are:

~~~sql
agent_lifecycle_identity_high_water(
  run_id, agent_id, provider_generation, principal_generation, revision,
  PRIMARY KEY(run_id, agent_id)
)

agent_lifecycle_bridge_high_water(
  run_id, agent_id, bridge_owner_kind, bridge_generation, revision,
  PRIMARY KEY(run_id, agent_id, bridge_owner_kind)
)

agent_lifecycle_context_high_water(
  run_id, agent_id, provider_generation, context_revision, revision,
  PRIMARY KEY(run_id, agent_id, provider_generation)
)

provider_context_observation_audit(
  observation_id PRIMARY KEY, source_event_id, run_id, agent_id,
  provider_generation, context_revision, classification, evidence_digest,
  observed_at, UNIQUE(run_id, agent_id, source_event_id),
  UNIQUE(run_id, agent_id, source_event_id, provider_generation,
    context_revision, evidence_digest)
)

lifecycle_rotation_custodies(
  project_session_id, run_id, agent_id, custody_id, command_id,
  admission_digest, provider_action_adapter_id, provider_action_id,
  recovery_source_kind, recovery_from_custody_id,
  recovery_from_custody_revision, recovery_from_generation_loss_id,
  recovery_from_generation_loss_revision, recovery_source_ref_digest,
  recovery_source_journal_digest,
  bridge_owner_kind, caller_turn_lease_id, caller_turn_generation,
  predecessor_turn_set_digest, quarantined_write_set_digest,
  delivery_cut_watermark, adoption_delivery_set_digest,
  checkpoint_ref, checkpoint_digest, checkpoint_validation_revision,
  checkpoint_validation_digest, checkpoint_validation_key,
  task_revision, mailbox_revision, child_set_digest, open_work_set_digest,
  source_provider_session_ref, source_capability_hash,
  source_custody_action_id, source_adapter_id, source_adapter_contract_digest,
  source_bridge_row_id, source_bridge_revision,
  source_provider_generation, source_principal_generation,
  source_bridge_generation, source_project_session_generation,
  source_run_generation, source_chair_lease_generation,
  target_provider_generation, target_principal_generation,
  target_bridge_generation, replacement_adapter_id,
  replacement_contract_digest, staged_capability_hash,
  launch_attest_challenge_digest, precondition_digest,
  origin_fresh_handoff_id, origin_fresh_handoff_digest,
  origin_operation, origin_fresh_apply_plan_digest,
  creation_json, creation_digest, created_at,
  PRIMARY KEY(run_id,agent_id,custody_id),
  UNIQUE(project_session_id,run_id,agent_id,custody_id),
  UNIQUE(provider_action_adapter_id,provider_action_id),
  UNIQUE(creation_digest),
  CHECK((recovery_source_kind='none' AND
      recovery_from_custody_id IS NULL AND
      recovery_from_custody_revision IS NULL AND
      recovery_from_generation_loss_id IS NULL AND
      recovery_from_generation_loss_revision IS NULL AND
      recovery_source_ref_digest IS NULL AND
      recovery_source_journal_digest IS NULL AND
      origin_fresh_handoff_id IS NULL AND origin_fresh_handoff_digest IS NULL AND
      origin_operation IS NULL AND origin_fresh_apply_plan_digest IS NULL) OR
    (recovery_source_kind='custody' AND
      recovery_from_custody_id IS NOT NULL AND
      recovery_from_custody_revision IS NOT NULL AND
      recovery_from_generation_loss_id IS NULL AND
      recovery_from_generation_loss_revision IS NULL AND
      recovery_source_ref_digest IS NOT NULL AND
      recovery_source_journal_digest IS NOT NULL AND
      origin_fresh_handoff_id IS NOT NULL AND
      origin_fresh_handoff_digest IS NOT NULL AND
      origin_operation='fresh-rotate' AND
      origin_fresh_apply_plan_digest IS NOT NULL) OR
    (recovery_source_kind='generation-loss' AND
      recovery_from_custody_id IS NULL AND
      recovery_from_custody_revision IS NULL AND
      recovery_from_generation_loss_id IS NOT NULL AND
      recovery_from_generation_loss_revision IS NOT NULL AND
      recovery_source_ref_digest IS NOT NULL AND
      recovery_source_journal_digest IS NOT NULL AND
      origin_fresh_handoff_id IS NOT NULL AND
      origin_fresh_handoff_digest IS NOT NULL AND
      origin_operation='fresh-rotate' AND
      origin_fresh_apply_plan_digest IS NOT NULL)),
  CHECK((checkpoint_validation_digest IS NULL AND
      checkpoint_validation_key='none') OR
    (checkpoint_validation_digest IS NOT NULL AND
      checkpoint_validation_key=checkpoint_validation_digest)),
  CHECK(origin_fresh_handoff_id IS NULL OR
    (provider_action_adapter_id=replacement_adapter_id AND
      replacement_contract_digest IS NOT NULL)),
  FOREIGN KEY(provider_action_adapter_id,provider_action_id)
    REFERENCES provider_actions(adapter_id,action_id),
  FOREIGN KEY(source_adapter_id,source_custody_action_id)
    REFERENCES provider_actions(adapter_id,action_id),
  FOREIGN KEY(project_session_id,run_id,agent_id,recovery_from_custody_id,
      recovery_from_custody_revision,recovery_source_ref_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,source_ref_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,
      recovery_from_generation_loss_id,recovery_from_generation_loss_revision,
      recovery_source_ref_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      source_ref_digest),
  FOREIGN KEY(origin_fresh_handoff_id,origin_fresh_handoff_digest,
      project_session_id,run_id,agent_id,recovery_source_kind,
      recovery_source_ref_digest,recovery_source_journal_digest,custody_id,
      provider_action_adapter_id,provider_action_id,checkpoint_ref,
      checkpoint_digest,checkpoint_validation_key,replacement_contract_digest,
      origin_operation,target_provider_generation,target_principal_generation,
      target_bridge_generation,admission_digest,origin_fresh_apply_plan_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
      new_custody_id,provider_action_adapter_id,provider_action_id,checkpoint_ref,
      checkpoint_digest,checkpoint_validation_key,adapter_contract_digest,
      operation,reserved_provider_generation,reserved_principal_generation,
      reserved_bridge_generation,admission_digest,fresh_apply_plan_digest)
    DEFERRABLE INITIALLY DEFERRED
)

lifecycle_rotation_custody_revisions(
  project_session_id, run_id, agent_id, custody_id,
  revision CHECK(revision >= 1), prior_revision, prior_journal_digest,
  state CHECK(state IN ('awaiting-boundary','prepared','dispatched','accepted',
    'ambiguous','provider-terminal','committing','finalized')),
  disposition_code CHECK(disposition_code IN
    ('none','adopted','no-effect','quarantined','superseded','abandoned')),
  proof_kind CHECK(proof_kind IN ('none','zero-dispatch-no-effect',
    'predispatch-superseded','postterminal-adoption-cas-superseded',
    'fresh-handoff-superseded','provider-terminal','provider-no-effect',
    'integrity-quarantine','confirmed-abandon')),
  terminal_evidence_digest,
  semantic_json, semantic_digest, source_ref_digest,
  origin_fresh_apply_id, origin_fresh_apply_digest,
  receipt_batch_id, receipt_apply_id, receipt_apply_digest,
  journal_json, journal_digest, recorded_at,
  PRIMARY KEY(run_id,agent_id,custody_id,revision),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    source_ref_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    semantic_digest,source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    semantic_digest,source_ref_digest,journal_digest,origin_fresh_apply_id,
    origin_fresh_apply_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,state,
    disposition_code,semantic_digest,source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    disposition_code,source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    disposition_code,terminal_evidence_digest,source_ref_digest,journal_digest),
  UNIQUE(semantic_digest), UNIQUE(source_ref_digest), UNIQUE(journal_digest),
  CHECK((revision=1 AND prior_revision IS NULL AND
      prior_journal_digest IS NULL) OR
    (revision>1 AND prior_revision=revision-1 AND
      prior_journal_digest IS NOT NULL)),
  CHECK((state='finalized')=(disposition_code<>'none')),
  CHECK((state='finalized')=
    (receipt_batch_id IS NOT NULL AND receipt_apply_id IS NOT NULL AND
      receipt_apply_digest IS NOT NULL)),
  CHECK((receipt_batch_id IS NULL)=(receipt_apply_id IS NULL)),
  CHECK((receipt_batch_id IS NULL)=(receipt_apply_digest IS NULL)),
  CHECK((origin_fresh_apply_id IS NULL)=(origin_fresh_apply_digest IS NULL)),
  CHECK(origin_fresh_apply_id IS NULL OR
    (revision=1 AND state<>'finalized' AND receipt_batch_id IS NULL)),
  CHECK((state IN ('provider-terminal','committing','finalized'))=
    (terminal_evidence_digest IS NOT NULL)),
  CHECK((state='finalized')=(proof_kind<>'none')),
  FOREIGN KEY(project_session_id,run_id,agent_id,custody_id)
    REFERENCES lifecycle_rotation_custodies(
      project_session_id,run_id,agent_id,custody_id),
  FOREIGN KEY(project_session_id,run_id,agent_id,custody_id,prior_revision,
      prior_journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,journal_digest),
  FOREIGN KEY(receipt_batch_id,receipt_apply_id,project_session_id,run_id,agent_id,
      custody_id,revision,semantic_digest,source_ref_digest)
    REFERENCES lifecycle_receipt_custody_effects(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,custody_id,
      final_revision,final_semantic_digest,final_source_ref_digest)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(receipt_apply_id,receipt_apply_digest,receipt_batch_id)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,receipt_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(receipt_apply_id,receipt_batch_id)
    REFERENCES lifecycle_transition_applies(apply_id,receipt_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(origin_fresh_apply_id,origin_fresh_apply_digest,custody_id,
      semantic_digest,source_ref_digest)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,new_custody_id,new_custody_semantic_digest,
      new_custody_source_ref_digest)
    DEFERRABLE INITIALLY DEFERRED
)

lifecycle_rotation_custody_heads(
  project_session_id NOT NULL, run_id NOT NULL, agent_id NOT NULL,
  custody_id NOT NULL, current_revision NOT NULL,
  state NOT NULL, disposition_code NOT NULL, semantic_digest NOT NULL,
  source_ref_digest NOT NULL, journal_digest NOT NULL,
  terminal NOT NULL CHECK(terminal IN (0,1)),
  head_revision NOT NULL CHECK(head_revision >= 1),
  PRIMARY KEY(run_id,agent_id,custody_id),
  UNIQUE(project_session_id,run_id,agent_id,custody_id),
  FOREIGN KEY(project_session_id,run_id,agent_id,custody_id,current_revision,
      state,disposition_code,semantic_digest,source_ref_digest,journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,state,
      disposition_code,semantic_digest,source_ref_digest,journal_digest),
  CHECK((terminal=1)=(state='finalized')),
  CHECK((state='finalized')=(disposition_code<>'none'))
)

CREATE UNIQUE INDEX one_nonfinal_lifecycle_custody_per_agent
  ON lifecycle_rotation_custody_heads(run_id,agent_id)
  WHERE terminal=0;

lifecycle_scope_admission_outbox(
  admission_request_id PRIMARY KEY,
  project_id NOT NULL, project_session_id NOT NULL, run_id NOT NULL,
  authority_id NOT NULL, admission_digest NOT NULL, admitted_at NOT NULL,
  scope_json NOT NULL, scope_digest NOT NULL UNIQUE, created_at NOT NULL,
  UNIQUE(project_session_id,run_id),
  UNIQUE(admission_request_id,project_id,project_session_id,run_id,authority_id,
    admission_digest,admitted_at,scope_digest)
)

lifecycle_admitted_run_scopes(
  project_id, project_session_id, run_id, authority_id,
  admission_digest, admitted_at, admission_request_id UNIQUE,
  scope_digest UNIQUE, initial_scope_checkpoint_digest,
  scope_admission_resolution_digest UNIQUE,
  PRIMARY KEY(project_session_id,run_id),
  UNIQUE(project_id,project_session_id,run_id),
  UNIQUE(project_session_id,run_id,authority_id),
  FOREIGN KEY(admission_request_id,scope_admission_resolution_digest,
      project_id,project_session_id,run_id,authority_id,admission_digest,
      admitted_at,scope_digest,initial_scope_checkpoint_digest)
    REFERENCES lifecycle_scope_admission_resolutions(
      admission_request_id,resolution_digest,project_id,project_session_id,
      run_id,authority_id,admission_digest,admitted_at,scope_digest,
      initial_scope_checkpoint_digest)
    DEFERRABLE INITIALLY DEFERRED
)

lifecycle_receipt_scope_checkpoints(
  project_session_id, run_id, authority_id,
  receipt_count CHECK(receipt_count >= 0),
  head_authority_sequence CHECK(head_authority_sequence >= 0),
  head_receipt_digest, ordered_record_set_digest,
  checkpoint_json, checkpoint_digest, attestation, verified_at,
  PRIMARY KEY(project_session_id,run_id,receipt_count),
  UNIQUE(checkpoint_digest),
  UNIQUE(project_session_id,run_id,checkpoint_digest),
  UNIQUE(project_session_id,run_id,receipt_count,checkpoint_digest,
    head_receipt_digest),
  UNIQUE(project_session_id,run_id,authority_id,receipt_count,
    checkpoint_digest,head_receipt_digest),
  UNIQUE(project_session_id,run_id,authority_id,receipt_count,
    checkpoint_digest),
  UNIQUE(project_session_id,run_id,authority_id,receipt_count,
    head_authority_sequence,ordered_record_set_digest,checkpoint_digest),
  UNIQUE(project_session_id,run_id,authority_id,receipt_count,
    head_authority_sequence,head_receipt_digest,ordered_record_set_digest,
    checkpoint_digest),
  CHECK(receipt_count=head_authority_sequence),
  CHECK((receipt_count=0)=(head_receipt_digest IS NULL)),
  FOREIGN KEY(project_session_id,run_id,authority_id)
    REFERENCES lifecycle_admitted_run_scopes(
      project_session_id,run_id,authority_id)
)

lifecycle_scope_admission_resolutions(
  admission_request_id PRIMARY KEY,
  project_id NOT NULL, project_session_id NOT NULL, run_id NOT NULL,
  authority_id NOT NULL, admission_digest NOT NULL, admitted_at NOT NULL,
  scope_digest NOT NULL,
  initial_receipt_count NOT NULL CHECK(initial_receipt_count=0),
  initial_head_authority_sequence NOT NULL CHECK(
    initial_head_authority_sequence=0),
  initial_ordered_record_set_digest NOT NULL,
  initial_scope_checkpoint_json NOT NULL,
  initial_scope_checkpoint_digest NOT NULL,
  initial_scope_head_revision NOT NULL CHECK(initial_scope_head_revision=1),
  namespace_checkpoint_digest NOT NULL, namespace_member_json NOT NULL,
  verified_at NOT NULL, resolution_json NOT NULL, resolution_digest NOT NULL UNIQUE,
  UNIQUE(project_session_id,run_id,authority_id,
    initial_scope_checkpoint_digest),
  UNIQUE(admission_request_id,resolution_digest,project_id,project_session_id,
    run_id,authority_id,admission_digest,admitted_at,scope_digest,
    initial_scope_checkpoint_digest),
  FOREIGN KEY(admission_request_id,project_id,project_session_id,run_id,
      authority_id,admission_digest,admitted_at,scope_digest)
    REFERENCES lifecycle_scope_admission_outbox(
      admission_request_id,project_id,project_session_id,run_id,authority_id,
      admission_digest,admitted_at,scope_digest),
  FOREIGN KEY(project_session_id,run_id,authority_id,initial_receipt_count,
      initial_head_authority_sequence,initial_ordered_record_set_digest,
      initial_scope_checkpoint_digest)
    REFERENCES lifecycle_receipt_scope_checkpoints(
      project_session_id,run_id,authority_id,receipt_count,
      head_authority_sequence,ordered_record_set_digest,checkpoint_digest),
  FOREIGN KEY(project_session_id,run_id)
    REFERENCES lifecycle_receipt_scope_heads(project_session_id,run_id)
)

lifecycle_receipt_scope_heads(
  project_session_id NOT NULL, run_id NOT NULL,
  checkpoint_digest NOT NULL,
  revision NOT NULL CHECK(revision >= 1),
  PRIMARY KEY(project_session_id,run_id),
  UNIQUE(project_session_id,run_id,checkpoint_digest,revision),
  FOREIGN KEY(project_session_id,run_id,checkpoint_digest)
    REFERENCES lifecycle_receipt_scope_checkpoints(
      project_session_id,run_id,checkpoint_digest)
)

CREATE TRIGGER lifecycle_scope_resolution_requires_initial_head
BEFORE INSERT ON lifecycle_scope_admission_resolutions
WHEN NOT EXISTS (
  SELECT 1 FROM lifecycle_receipt_scope_heads h
  WHERE h.project_session_id=NEW.project_session_id
    AND h.run_id=NEW.run_id
    AND h.checkpoint_digest=NEW.initial_scope_checkpoint_digest
    AND h.revision=NEW.initial_scope_head_revision
)
BEGIN
  SELECT RAISE(ABORT,'lifecycle-scope-resolution-head-crossed');
END;

lifecycle_receipt_namespace_checkpoints(
  project_id, authority_id, scope_count CHECK(scope_count >= 0),
  ordered_scope_head_set_digest, checkpoint_json, checkpoint_digest,
  attestation, verified_at,
  PRIMARY KEY(project_id,checkpoint_digest),
  UNIQUE(checkpoint_digest),
  UNIQUE(project_id,checkpoint_digest,authority_id),
  UNIQUE(project_id,authority_id,scope_count,ordered_scope_head_set_digest,
    checkpoint_digest)
)

lifecycle_receipt_namespace_members(
  project_id, checkpoint_digest, ordinal CHECK(ordinal >= 1),
  project_session_id, run_id, authority_id, scope_checkpoint_digest, receipt_count,
  head_receipt_digest,
  PRIMARY KEY(project_id,checkpoint_digest,ordinal),
  UNIQUE(project_id,checkpoint_digest,project_session_id,run_id),
  CHECK(receipt_count >= 0),
  CHECK((receipt_count=0)=(head_receipt_digest IS NULL)),
  FOREIGN KEY(project_id,checkpoint_digest,authority_id)
    REFERENCES lifecycle_receipt_namespace_checkpoints(
      project_id,checkpoint_digest,authority_id),
  FOREIGN KEY(project_id,project_session_id,run_id)
    REFERENCES lifecycle_admitted_run_scopes(
      project_id,project_session_id,run_id),
  FOREIGN KEY(project_session_id,run_id,authority_id,receipt_count,
      scope_checkpoint_digest)
    REFERENCES lifecycle_receipt_scope_checkpoints(
      project_session_id,run_id,authority_id,receipt_count,checkpoint_digest),
  FOREIGN KEY(project_session_id,run_id,authority_id,receipt_count,
      scope_checkpoint_digest,head_receipt_digest)
    REFERENCES lifecycle_receipt_scope_checkpoints(
      project_session_id,run_id,authority_id,receipt_count,checkpoint_digest,
      head_receipt_digest)
)

lifecycle_receipt_namespace_heads(
  project_id PRIMARY KEY, authority_id, scope_count,
  ordered_scope_head_set_digest, checkpoint_digest, head_revision,
  FOREIGN KEY(project_id,authority_id,scope_count,
      ordered_scope_head_set_digest,checkpoint_digest)
    REFERENCES lifecycle_receipt_namespace_checkpoints(
      project_id,authority_id,scope_count,ordered_scope_head_set_digest,
      checkpoint_digest)
)

lifecycle_recovery_retirement_plans(
  retirement_id PRIMARY KEY, revision CHECK(revision=1),
  project_session_id, run_id, agent_id, custody_id, custody_revision,
  custody_source_ref_digest, custody_journal_digest,
  finalized_disposition CHECK(finalized_disposition IN
    ('no-effect','superseded','quarantined')),
  finalized_terminal_evidence_digest, admission_digest,
  transition_proof_json, transition_proof_digest,
  mutation_plan_json, mutation_plan_digest, retirement_evidence_digest,
  planned_apply_id UNIQUE, recorded_at, plan_json, retirement_plan_digest UNIQUE,
  UNIQUE(retirement_id,revision,retirement_plan_digest),
  UNIQUE(retirement_id,retirement_plan_digest,planned_apply_id),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,custody_revision),
  UNIQUE(retirement_id,retirement_plan_digest,planned_apply_id,
    project_session_id,run_id,agent_id,mutation_plan_digest),
  UNIQUE(retirement_id,planned_apply_id,project_session_id,run_id,agent_id,
    custody_id,custody_revision,custody_source_ref_digest,custody_journal_digest,
    finalized_disposition,retirement_plan_digest),
  UNIQUE(retirement_id,planned_apply_id,project_session_id,run_id,agent_id,
    custody_id,custody_revision,custody_source_ref_digest,custody_journal_digest,
    finalized_disposition,finalized_terminal_evidence_digest,admission_digest,
    transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
    retirement_plan_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,custody_id,custody_revision,
      finalized_disposition,finalized_terminal_evidence_digest,
      custody_source_ref_digest,custody_journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,disposition_code,
      terminal_evidence_digest,source_ref_digest,journal_digest)
)

lifecycle_receipt_batches(
  batch_id PRIMARY KEY, planned_apply_id UNIQUE,
  project_session_id, run_id, agent_id,
  transition_kind CHECK(transition_kind IN
    ('custody-terminal','generation-loss-terminal',
      'custody-recovery-retirement','fresh-origin')),
  planned_apply_kind NOT NULL CHECK(
    planned_apply_kind IN ('terminal','terminal-fresh','fresh')),
  effects_set_digest, mutation_plan_digest,
  transition_replay_json, transition_replay_digest,
  ordered_subject_set_digest,
  receipt_intent_count CHECK(receipt_intent_count IN (1,2)),
  secondary_intent_kind NOT NULL CHECK(secondary_intent_kind IN
    ('none','fresh-origin','review-adoption-decision')),
  review_adoption_reservation_id, review_adoption_reservation_digest,
  review_decision_loss_effect_key NOT NULL,
  review_decision_loss_effect_role, review_decision_loss_effect_digest,
  review_decision_loss_after_id, review_decision_loss_after_revision,
  review_decision_loss_after_semantic_digest,
  review_decision_loss_after_source_ref_digest,
  fresh_handoff_id, fresh_handoff_digest, fresh_handoff_source_mode,
  fresh_handoff_key NOT NULL,
  recovery_retirement_id, recovery_retirement_plan_digest, created_at,
  UNIQUE(project_session_id,run_id,agent_id,transition_replay_digest),
  UNIQUE(batch_id,planned_apply_id),
  UNIQUE(batch_id,transition_kind,receipt_intent_count),
  UNIQUE(batch_id,transition_kind,receipt_intent_count,secondary_intent_kind),
  UNIQUE(batch_id,planned_apply_id,transition_replay_digest,
    mutation_plan_digest),
  UNIQUE(batch_id,planned_apply_id,transition_kind,planned_apply_kind,
    transition_replay_digest,mutation_plan_digest,fresh_handoff_key),
  UNIQUE(batch_id,project_session_id,run_id),
  UNIQUE(batch_id,project_session_id,run_id,agent_id),
  UNIQUE(batch_id,planned_apply_id,project_session_id,run_id,agent_id),
  UNIQUE(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
    review_adoption_reservation_digest),
  UNIQUE(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
    transition_kind),
  UNIQUE(batch_id,planned_apply_id,transition_replay_digest,
    mutation_plan_digest,fresh_handoff_id,fresh_handoff_digest,
    fresh_handoff_key),
  UNIQUE(batch_id,review_decision_loss_effect_role,
    review_decision_loss_effect_digest),
  UNIQUE(batch_id,review_decision_loss_effect_key),
  UNIQUE(batch_id,review_decision_loss_effect_role,
    review_decision_loss_effect_digest,project_session_id,run_id,agent_id,
    review_decision_loss_after_id,review_decision_loss_after_revision,
    review_decision_loss_after_semantic_digest,
    review_decision_loss_after_source_ref_digest),
  UNIQUE(batch_id,review_decision_loss_effect_key,
    review_decision_loss_effect_role,review_decision_loss_effect_digest,
    project_session_id,run_id,agent_id,review_decision_loss_after_id,
    review_decision_loss_after_revision,
    review_decision_loss_after_semantic_digest,
    review_decision_loss_after_source_ref_digest),
  CHECK((review_adoption_reservation_id IS NULL)=
    (review_adoption_reservation_digest IS NULL)),
  CHECK((fresh_handoff_id IS NULL)=(fresh_handoff_digest IS NULL)),
  CHECK((fresh_handoff_id IS NULL)=(fresh_handoff_source_mode IS NULL)),
  CHECK((fresh_handoff_id IS NULL AND fresh_handoff_key='none') OR
    (fresh_handoff_id IS NOT NULL AND
      fresh_handoff_key=fresh_handoff_digest)),
  CHECK((recovery_retirement_id IS NULL)=
    (recovery_retirement_plan_digest IS NULL)),
  CHECK((transition_kind='custody-recovery-retirement')=
    (recovery_retirement_id IS NOT NULL)),
  CHECK(
    (transition_kind='custody-terminal' AND planned_apply_kind='terminal' AND
      secondary_intent_kind='none' AND receipt_intent_count=1 AND
      review_adoption_reservation_id IS NULL AND fresh_handoff_id IS NULL AND
      recovery_retirement_id IS NULL) OR
    (transition_kind='custody-terminal' AND planned_apply_kind='terminal' AND
      secondary_intent_kind='review-adoption-decision' AND
      receipt_intent_count=2 AND
      review_adoption_reservation_id IS NOT NULL AND
      fresh_handoff_id IS NULL AND recovery_retirement_id IS NULL) OR
    (transition_kind='custody-terminal' AND
      planned_apply_kind='terminal-fresh' AND
      secondary_intent_kind='fresh-origin' AND receipt_intent_count=2 AND
      review_adoption_reservation_id IS NULL AND fresh_handoff_id IS NOT NULL AND
      fresh_handoff_source_mode='terminalize-nonfinal-custody' AND
      recovery_retirement_id IS NULL) OR
    (transition_kind='generation-loss-terminal' AND
      planned_apply_kind='terminal' AND secondary_intent_kind='none' AND
      receipt_intent_count=1 AND review_adoption_reservation_id IS NULL AND
      fresh_handoff_id IS NULL AND recovery_retirement_id IS NULL) OR
    (transition_kind='custody-recovery-retirement' AND
      planned_apply_kind='terminal' AND secondary_intent_kind='none' AND
      receipt_intent_count=1 AND review_adoption_reservation_id IS NULL AND
      fresh_handoff_id IS NULL AND recovery_retirement_id IS NOT NULL) OR
    (transition_kind='fresh-origin' AND planned_apply_kind='fresh' AND
      secondary_intent_kind='none' AND receipt_intent_count=1 AND
      review_adoption_reservation_id IS NULL AND fresh_handoff_id IS NOT NULL AND
      fresh_handoff_source_mode IN
        ('reuse-final-custody','open-generation-loss') AND
      recovery_retirement_id IS NULL)),
  CHECK(
    (review_adoption_reservation_id IS NULL AND
      review_decision_loss_effect_key='none' AND
      review_decision_loss_effect_role IS NULL AND
      review_decision_loss_effect_digest IS NULL AND
      review_decision_loss_after_id IS NULL AND
      review_decision_loss_after_revision IS NULL AND
      review_decision_loss_after_semantic_digest IS NULL AND
      review_decision_loss_after_source_ref_digest IS NULL) OR
    (review_adoption_reservation_id IS NOT NULL AND
      review_decision_loss_effect_key='none' AND
      review_decision_loss_effect_role IS NULL AND
      review_decision_loss_effect_digest IS NULL AND
      review_decision_loss_after_id IS NULL AND
      review_decision_loss_after_revision IS NULL AND
      review_decision_loss_after_semantic_digest IS NULL AND
      review_decision_loss_after_source_ref_digest IS NULL) OR
    (review_adoption_reservation_id IS NOT NULL AND
      review_decision_loss_effect_key<>'none' AND
      review_decision_loss_effect_role IS NOT NULL AND
      review_decision_loss_effect_role='linked' AND
      review_decision_loss_effect_digest IS NOT NULL AND
      review_decision_loss_effect_digest=review_decision_loss_effect_key AND
      review_decision_loss_after_id IS NOT NULL AND
      review_decision_loss_after_revision IS NOT NULL AND
      review_decision_loss_after_semantic_digest IS NOT NULL AND
      review_decision_loss_after_source_ref_digest IS NOT NULL)),
  FOREIGN KEY(review_adoption_reservation_id,
      review_adoption_reservation_digest,review_decision_loss_effect_key)
    REFERENCES lifecycle_review_adoption_reservations(
      reservation_id,reservation_digest,decision_loss_effect_key),
  FOREIGN KEY(review_adoption_reservation_id,
      review_adoption_reservation_digest,review_decision_loss_effect_key,
      review_decision_loss_after_id,review_decision_loss_after_revision,
      review_decision_loss_after_semantic_digest,
      review_decision_loss_after_source_ref_digest)
    REFERENCES lifecycle_review_adoption_reservations(
      reservation_id,reservation_digest,decision_loss_effect_key,
      decision_loss_after_id,decision_loss_after_revision,
      decision_loss_after_semantic_digest,decision_loss_after_source_ref_digest),
  FOREIGN KEY(fresh_handoff_id,fresh_handoff_digest,planned_apply_id,
      fresh_handoff_source_mode)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,planned_apply_id,source_mode),
  FOREIGN KEY(recovery_retirement_id,recovery_retirement_plan_digest,
      planned_apply_id,project_session_id,run_id,agent_id,mutation_plan_digest)
    REFERENCES lifecycle_recovery_retirement_plans(
      retirement_id,retirement_plan_digest,planned_apply_id,
      project_session_id,run_id,agent_id,mutation_plan_digest),
  FOREIGN KEY(batch_id,review_decision_loss_effect_role,
      review_decision_loss_effect_digest,project_session_id,run_id,agent_id,
      review_decision_loss_after_id,review_decision_loss_after_revision,
      review_decision_loss_after_semantic_digest,
      review_decision_loss_after_source_ref_digest)
    REFERENCES lifecycle_receipt_generation_loss_effects(
      batch_id,role,effect_digest,project_session_id,run_id,agent_id,
      generation_loss_id,final_revision,final_semantic_digest,
      final_source_ref_digest)
    DEFERRABLE INITIALLY DEFERRED
)

lifecycle_receipt_custody_effects(
  batch_id, ordinal CHECK(ordinal=1), role CHECK(role='primary'),
  transition_kind CHECK(transition_kind='custody-terminal'),
  planned_apply_id, project_session_id, run_id, agent_id, custody_id,
  pre_revision CHECK(pre_revision >= 1), pre_journal_digest,
  final_revision CHECK(final_revision >= 2), final_semantic_digest,
  final_source_ref_digest, effect_digest,
  PRIMARY KEY(batch_id,ordinal), UNIQUE(batch_id), UNIQUE(effect_digest),
  UNIQUE(batch_id,effect_digest),
  UNIQUE(batch_id,effect_digest,project_session_id,run_id,agent_id,custody_id,
    final_revision),
  UNIQUE(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
    custody_id,final_revision,final_semantic_digest,final_source_ref_digest),
  FOREIGN KEY(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind)
    REFERENCES lifecycle_receipt_batches(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind),
  FOREIGN KEY(project_session_id,run_id,agent_id,custody_id,pre_revision,
      pre_journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,journal_digest),
  CHECK(final_revision=pre_revision+1)
)

lifecycle_receipt_generation_loss_effects(
  batch_id, ordinal CHECK(ordinal IN (1,2)),
  role CHECK(role IN ('primary','linked')), planned_apply_id,
  batch_transition_kind,
  project_session_id, run_id, agent_id, generation_loss_id,
  pre_revision CHECK(pre_revision >= 1), pre_journal_digest,
  final_revision CHECK(final_revision >= 2), final_semantic_digest,
  final_source_ref_digest, effect_digest,
  PRIMARY KEY(batch_id,ordinal), UNIQUE(batch_id,role), UNIQUE(effect_digest),
  UNIQUE(batch_id,role,effect_digest),
  UNIQUE(batch_id,role,effect_digest,project_session_id,run_id,agent_id,
    generation_loss_id,final_revision),
  UNIQUE(batch_id,role,effect_digest,project_session_id,run_id,agent_id,
    generation_loss_id,final_revision,final_semantic_digest,
    final_source_ref_digest),
  UNIQUE(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
    generation_loss_id,final_revision,final_semantic_digest,
    final_source_ref_digest),
  FOREIGN KEY(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      batch_transition_kind)
    REFERENCES lifecycle_receipt_batches(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      pre_revision,pre_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      journal_digest),
  CHECK(final_revision=pre_revision+1),
  CHECK((role='primary' AND ordinal=1 AND
      batch_transition_kind='generation-loss-terminal') OR
    (role='linked' AND ordinal=2 AND
      batch_transition_kind='custody-terminal'))
)

lifecycle_receipt_recovery_retirement_effects(
  batch_id PRIMARY KEY, ordinal CHECK(ordinal=1), role CHECK(role='primary'),
  transition_kind CHECK(transition_kind='custody-recovery-retirement'),
  planned_apply_id, project_session_id, run_id, agent_id,
  retirement_id UNIQUE, retirement_revision CHECK(retirement_revision=1),
  retirement_plan_digest,
  custody_id, custody_revision, custody_source_ref_digest,
  custody_journal_digest, finalized_disposition,
  finalized_terminal_evidence_digest, admission_digest,
  transition_proof_digest, mutation_plan_digest, retirement_evidence_digest,
  effect_digest UNIQUE,
  UNIQUE(batch_id,effect_digest),
  UNIQUE(batch_id,effect_digest,project_session_id,run_id,agent_id,
    retirement_id,retirement_revision),
  UNIQUE(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
    retirement_id,retirement_plan_digest,custody_id,custody_revision,
    custody_source_ref_digest,custody_journal_digest,finalized_disposition,
    finalized_terminal_evidence_digest,admission_digest,
    transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
    effect_digest),
  FOREIGN KEY(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind)
    REFERENCES lifecycle_receipt_batches(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind),
  FOREIGN KEY(retirement_id,planned_apply_id,project_session_id,run_id,agent_id,
      custody_id,custody_revision,custody_source_ref_digest,
      custody_journal_digest,finalized_disposition,
      finalized_terminal_evidence_digest,admission_digest,
      transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
      retirement_plan_digest)
    REFERENCES lifecycle_recovery_retirement_plans(
      retirement_id,planned_apply_id,project_session_id,run_id,agent_id,
      custody_id,custody_revision,custody_source_ref_digest,
      custody_journal_digest,finalized_disposition,
      finalized_terminal_evidence_digest,admission_digest,
      transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
      retirement_plan_digest)
)

lifecycle_receipt_fresh_origin_effects(
  batch_id, receipt_ordinal CHECK(receipt_ordinal IN (1,2)),
  batch_transition_kind CHECK(
    batch_transition_kind IN ('custody-terminal','fresh-origin')),
  effect_role CHECK(effect_role IN ('primary','secondary')), planned_apply_id,
  project_session_id, run_id, agent_id,
  source_mode CHECK(source_mode IN ('terminalize-nonfinal-custody',
    'reuse-final-custody','open-generation-loss')),
  recovery_source_kind CHECK(
    recovery_source_kind IN ('custody','generation-loss')),
  recovery_source_ref_digest, source_journal_digest,
  handoff_id UNIQUE, handoff_digest,
  admission_digest, fresh_apply_plan_digest,
  new_custody_id UNIQUE, new_custody_revision CHECK(new_custody_revision=1),
  new_custody_semantic_digest, new_custody_source_ref_digest,
  affected_generation_loss_id, affected_generation_loss_before_revision,
  affected_generation_loss_before_state,
  affected_generation_loss_before_source_ref_digest,
  affected_generation_loss_before_journal_digest,
  affected_generation_loss_after_revision,
  affected_generation_loss_after_semantic_digest,
  affected_generation_loss_after_source_ref_digest,
  affected_generation_loss_after_key NOT NULL,
  effect_json, effect_digest UNIQUE,
  PRIMARY KEY(batch_id,receipt_ordinal),
  UNIQUE(batch_id,effect_role,effect_digest),
  UNIQUE(batch_id,receipt_ordinal,effect_digest,project_session_id,run_id,
    agent_id,new_custody_id,new_custody_revision),
  UNIQUE(batch_id,effect_role,effect_digest,project_session_id,run_id,agent_id,
    handoff_id,handoff_digest,new_custody_id,new_custody_revision,
    new_custody_semantic_digest,new_custody_source_ref_digest,
    affected_generation_loss_after_key),
  FOREIGN KEY(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      batch_transition_kind)
    REFERENCES lifecycle_receipt_batches(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind),
  FOREIGN KEY(handoff_id,handoff_digest,planned_apply_id,project_session_id,
      run_id,agent_id,source_mode,recovery_source_kind,
      recovery_source_ref_digest,source_journal_digest,new_custody_id,
      new_custody_semantic_digest,new_custody_source_ref_digest,
      affected_generation_loss_after_key,admission_digest,
      fresh_apply_plan_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,planned_apply_id,project_session_id,run_id,
      agent_id,source_mode,recovery_source_kind,recovery_source_ref_digest,
      source_journal_digest,new_custody_id,new_custody_semantic_digest,
      new_custody_source_ref_digest,affected_generation_loss_after_key,
      admission_digest,fresh_apply_plan_digest),
  FOREIGN KEY(handoff_id,handoff_digest,affected_generation_loss_id,
      affected_generation_loss_before_revision,
      affected_generation_loss_before_state,
      affected_generation_loss_before_source_ref_digest,
      affected_generation_loss_before_journal_digest,
      affected_generation_loss_after_revision,
      affected_generation_loss_after_semantic_digest,
      affected_generation_loss_after_source_ref_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,affected_generation_loss_id,
      affected_generation_loss_before_revision,
      affected_generation_loss_before_state,
      affected_generation_loss_before_source_ref_digest,
      affected_generation_loss_before_journal_digest,
      affected_generation_loss_after_revision,
      affected_generation_loss_after_semantic_digest,
      affected_generation_loss_after_source_ref_digest),
  CHECK((batch_transition_kind='fresh-origin' AND receipt_ordinal=1 AND
      effect_role='primary') OR
    (batch_transition_kind='custody-terminal' AND receipt_ordinal=2 AND
      effect_role='secondary')),
  CHECK((affected_generation_loss_after_key='none' AND
      affected_generation_loss_id IS NULL AND
      affected_generation_loss_before_revision IS NULL AND
      affected_generation_loss_before_state IS NULL AND
      affected_generation_loss_before_source_ref_digest IS NULL AND
      affected_generation_loss_before_journal_digest IS NULL AND
      affected_generation_loss_after_revision IS NULL AND
      affected_generation_loss_after_semantic_digest IS NULL AND
      affected_generation_loss_after_source_ref_digest IS NULL) OR
    (affected_generation_loss_after_key<>'none' AND
      affected_generation_loss_id IS NOT NULL AND
      affected_generation_loss_before_revision IS NOT NULL AND
      affected_generation_loss_before_state IS NOT NULL AND
      affected_generation_loss_before_source_ref_digest IS NOT NULL AND
      affected_generation_loss_before_journal_digest IS NOT NULL AND
      affected_generation_loss_after_revision=
        affected_generation_loss_before_revision+1 AND
      affected_generation_loss_after_semantic_digest IS NOT NULL AND
      affected_generation_loss_after_source_ref_digest=
        affected_generation_loss_after_key)),
  CHECK((source_mode='reuse-final-custody' AND
      recovery_source_kind='custody' AND
      affected_generation_loss_after_key='none') OR
    (source_mode='open-generation-loss' AND
      recovery_source_kind='generation-loss' AND
      affected_generation_loss_id IS NOT NULL AND
      affected_generation_loss_before_source_ref_digest=
        recovery_source_ref_digest AND
      affected_generation_loss_before_journal_digest=source_journal_digest) OR
    (source_mode='terminalize-nonfinal-custody' AND
      recovery_source_kind='custody'))
)

lifecycle_receipt_intents(
  batch_id, ordinal CHECK(ordinal IN (1,2)),
  batch_transition_kind, batch_intent_count, batch_secondary_intent_kind,
  kind CHECK(kind IN ('custody-terminal','generation-loss-terminal',
    'custody-recovery-retirement','review-adoption-decision','fresh-origin')),
  project_session_id, run_id, agent_id,
  subject_owner_kind CHECK(subject_owner_kind IN
    ('custody','generation-loss','recovery-retirement')),
  subject_owner_id, subject_owner_revision CHECK(subject_owner_revision >= 1),
  custody_effect_digest, generation_loss_effect_role,
  generation_loss_effect_digest, recovery_retirement_effect_digest,
  fresh_origin_effect_digest,
  subject_json, subject_digest, intent_digest, created_at,
  PRIMARY KEY(batch_id,ordinal), UNIQUE(intent_digest),
  UNIQUE(intent_digest,batch_id,ordinal,project_session_id,run_id,agent_id,
    kind,subject_owner_kind,subject_owner_id,subject_owner_revision,
    subject_digest),
  UNIQUE(kind,project_session_id,run_id,agent_id,subject_owner_kind,
    subject_owner_id,subject_owner_revision),
  FOREIGN KEY(batch_id,project_session_id,run_id,agent_id)
    REFERENCES lifecycle_receipt_batches(
      batch_id,project_session_id,run_id,agent_id),
  FOREIGN KEY(batch_id,batch_transition_kind,batch_intent_count,
      batch_secondary_intent_kind)
    REFERENCES lifecycle_receipt_batches(
      batch_id,transition_kind,receipt_intent_count,secondary_intent_kind),
  FOREIGN KEY(batch_id,custody_effect_digest,project_session_id,run_id,
      agent_id,subject_owner_id,subject_owner_revision)
    REFERENCES lifecycle_receipt_custody_effects(
      batch_id,effect_digest,project_session_id,run_id,agent_id,custody_id,
      final_revision),
  FOREIGN KEY(batch_id,generation_loss_effect_role,
      generation_loss_effect_digest,project_session_id,run_id,agent_id,
      subject_owner_id,subject_owner_revision)
    REFERENCES lifecycle_receipt_generation_loss_effects(
      batch_id,role,effect_digest,project_session_id,run_id,agent_id,
      generation_loss_id,final_revision),
  FOREIGN KEY(batch_id,recovery_retirement_effect_digest,project_session_id,
      run_id,agent_id,subject_owner_id,subject_owner_revision)
    REFERENCES lifecycle_receipt_recovery_retirement_effects(
      batch_id,effect_digest,project_session_id,run_id,agent_id,retirement_id,
      retirement_revision),
  FOREIGN KEY(batch_id,ordinal,fresh_origin_effect_digest,project_session_id,
      run_id,agent_id,subject_owner_id,subject_owner_revision)
    REFERENCES lifecycle_receipt_fresh_origin_effects(
      batch_id,receipt_ordinal,effect_digest,project_session_id,run_id,agent_id,
      new_custody_id,new_custody_revision),
  CHECK((ordinal=1 AND kind=batch_transition_kind) OR
    (ordinal=2 AND batch_intent_count=2 AND
      batch_secondary_intent_kind<>'none' AND
      kind=batch_secondary_intent_kind)),
  CHECK(
    (kind IN ('custody-terminal','review-adoption-decision') AND
      subject_owner_kind='custody' AND custody_effect_digest IS NOT NULL AND
      generation_loss_effect_role IS NULL AND
      generation_loss_effect_digest IS NULL AND
      recovery_retirement_effect_digest IS NULL AND
      fresh_origin_effect_digest IS NULL) OR
    (kind='generation-loss-terminal' AND
      subject_owner_kind='generation-loss' AND
      custody_effect_digest IS NULL AND
      generation_loss_effect_role='primary' AND
      generation_loss_effect_digest IS NOT NULL AND
      recovery_retirement_effect_digest IS NULL AND
      fresh_origin_effect_digest IS NULL) OR
    (kind='custody-recovery-retirement' AND
      subject_owner_kind='recovery-retirement' AND
      custody_effect_digest IS NULL AND
      generation_loss_effect_role IS NULL AND
      generation_loss_effect_digest IS NULL AND
      recovery_retirement_effect_digest IS NOT NULL AND
      fresh_origin_effect_digest IS NULL) OR
    (kind='fresh-origin' AND subject_owner_kind='custody' AND
      custody_effect_digest IS NULL AND
      generation_loss_effect_role IS NULL AND
      generation_loss_effect_digest IS NULL AND
      recovery_retirement_effect_digest IS NULL AND
      fresh_origin_effect_digest IS NOT NULL))
)
~~~

~~~sql

lifecycle_authority_receipts(
  intent_digest PRIMARY KEY, batch_id, ordinal,
  project_session_id, run_id, agent_id, kind, subject_owner_kind,
  subject_owner_id, subject_owner_revision, subject_digest,
  authority_id, authority_sequence CHECK(authority_sequence >= 1),
  previous_authority_sequence, previous_receipt_digest,
  receipt_json, receipt_digest UNIQUE, attestation, verified_at,
  UNIQUE(project_session_id,run_id,authority_id,authority_sequence),
  UNIQUE(project_session_id,run_id,authority_id,authority_sequence,
    receipt_digest),
  UNIQUE(batch_id,ordinal,intent_digest,subject_digest,receipt_digest),
  UNIQUE(receipt_digest,kind,project_session_id,run_id,agent_id,
    subject_owner_kind,subject_owner_id,subject_owner_revision),
  UNIQUE(receipt_digest,intent_digest,batch_id,ordinal,kind,project_session_id,
    run_id,agent_id,subject_owner_kind,subject_owner_id,subject_owner_revision,
    subject_digest),
  UNIQUE(kind,project_session_id,run_id,agent_id,subject_owner_kind,
    subject_owner_id,subject_owner_revision),
  FOREIGN KEY(intent_digest,batch_id,ordinal,project_session_id,run_id,agent_id,
      kind,subject_owner_kind,subject_owner_id,subject_owner_revision,
      subject_digest)
    REFERENCES lifecycle_receipt_intents(
      intent_digest,batch_id,ordinal,project_session_id,run_id,agent_id,kind,
      subject_owner_kind,subject_owner_id,subject_owner_revision,subject_digest),
  FOREIGN KEY(project_session_id,run_id,authority_id)
    REFERENCES lifecycle_admitted_run_scopes(
      project_session_id,run_id,authority_id),
  FOREIGN KEY(project_session_id,run_id,authority_id,
      previous_authority_sequence,previous_receipt_digest)
    REFERENCES lifecycle_authority_receipts(
      project_session_id,run_id,authority_id,authority_sequence,receipt_digest),
  CHECK((authority_sequence=1 AND previous_authority_sequence IS NULL AND
      previous_receipt_digest IS NULL) OR
    (authority_sequence>1 AND
      previous_authority_sequence=authority_sequence-1 AND
      previous_receipt_digest IS NOT NULL))
)

lifecycle_receipt_batch_completions(
  batch_id PRIMARY KEY, transition_kind, receipt_intent_count,
  secondary_intent_kind,
  ordinal_one CHECK(ordinal_one=1), ordinal_one_intent_digest,
  ordinal_one_subject_digest,
  ordinal_one_receipt_digest,
  ordinal_two CHECK(ordinal_two IS NULL OR ordinal_two=2),
  ordinal_two_intent_digest, ordinal_two_subject_digest,
  ordinal_two_receipt_digest,
  primary_custody_effect_digest,
  primary_loss_effect_role CHECK(
    primary_loss_effect_role IS NULL OR primary_loss_effect_role='primary'),
  primary_loss_effect_digest, primary_retirement_effect_digest,
  primary_fresh_origin_effect_role CHECK(
    primary_fresh_origin_effect_role IS NULL OR
      primary_fresh_origin_effect_role='primary'),
  primary_fresh_origin_effect_digest,
  linked_loss_effect_role CHECK(
    linked_loss_effect_role IS NULL OR linked_loss_effect_role='linked'),
  linked_loss_effect_digest,
  secondary_fresh_origin_effect_role CHECK(
    secondary_fresh_origin_effect_role IS NULL OR
      secondary_fresh_origin_effect_role='secondary'),
  secondary_fresh_origin_effect_digest,
  ordered_authority_receipt_set_digest,
  completion_json, completion_digest UNIQUE, completed_at,
  UNIQUE(batch_id,completion_digest,ordered_authority_receipt_set_digest),
  FOREIGN KEY(batch_id,transition_kind,receipt_intent_count,
      secondary_intent_kind)
    REFERENCES lifecycle_receipt_batches(
      batch_id,transition_kind,receipt_intent_count,secondary_intent_kind),
  FOREIGN KEY(batch_id,ordinal_one,ordinal_one_intent_digest,
      ordinal_one_subject_digest,ordinal_one_receipt_digest)
    REFERENCES lifecycle_authority_receipts(
      batch_id,ordinal,intent_digest,subject_digest,receipt_digest),
  FOREIGN KEY(batch_id,ordinal_two,ordinal_two_intent_digest,
      ordinal_two_subject_digest,ordinal_two_receipt_digest)
    REFERENCES lifecycle_authority_receipts(
      batch_id,ordinal,intent_digest,subject_digest,receipt_digest),
  FOREIGN KEY(batch_id,primary_custody_effect_digest)
    REFERENCES lifecycle_receipt_custody_effects(batch_id,effect_digest),
  FOREIGN KEY(batch_id,primary_loss_effect_role,primary_loss_effect_digest)
    REFERENCES lifecycle_receipt_generation_loss_effects(
      batch_id,role,effect_digest),
  FOREIGN KEY(batch_id,primary_retirement_effect_digest)
    REFERENCES lifecycle_receipt_recovery_retirement_effects(
      batch_id,effect_digest),
  FOREIGN KEY(batch_id,linked_loss_effect_role,linked_loss_effect_digest)
    REFERENCES lifecycle_receipt_generation_loss_effects(
      batch_id,role,effect_digest),
  FOREIGN KEY(batch_id,primary_fresh_origin_effect_role,
      primary_fresh_origin_effect_digest)
    REFERENCES lifecycle_receipt_fresh_origin_effects(
      batch_id,effect_role,effect_digest),
  FOREIGN KEY(batch_id,secondary_fresh_origin_effect_role,
      secondary_fresh_origin_effect_digest)
    REFERENCES lifecycle_receipt_fresh_origin_effects(
      batch_id,effect_role,effect_digest),
  CHECK((primary_fresh_origin_effect_role IS NULL)=
    (primary_fresh_origin_effect_digest IS NULL)),
  CHECK((secondary_fresh_origin_effect_role IS NULL)=
    (secondary_fresh_origin_effect_digest IS NULL)),
  CHECK((secondary_intent_kind='none' AND receipt_intent_count=1 AND
      ordinal_two IS NULL AND
      ordinal_two_intent_digest IS NULL AND
      ordinal_two_subject_digest IS NULL AND ordinal_two_receipt_digest IS NULL) OR
    (secondary_intent_kind<>'none' AND receipt_intent_count=2 AND ordinal_two=2 AND
      ordinal_two_intent_digest IS NOT NULL AND
      ordinal_two_subject_digest IS NOT NULL AND
      ordinal_two_receipt_digest IS NOT NULL)),
  CHECK((linked_loss_effect_role IS NULL)=(linked_loss_effect_digest IS NULL)),
  CHECK((transition_kind='custody-terminal' AND
      secondary_intent_kind IN ('none','review-adoption-decision') AND
      primary_custody_effect_digest IS NOT NULL AND
      primary_loss_effect_role IS NULL AND primary_loss_effect_digest IS NULL AND
      primary_retirement_effect_digest IS NULL AND
      primary_fresh_origin_effect_role IS NULL AND
      primary_fresh_origin_effect_digest IS NULL AND
      secondary_fresh_origin_effect_role IS NULL AND
      secondary_fresh_origin_effect_digest IS NULL) OR
    (transition_kind='custody-terminal' AND
      secondary_intent_kind='fresh-origin' AND
      primary_custody_effect_digest IS NOT NULL AND
      primary_loss_effect_role IS NULL AND primary_loss_effect_digest IS NULL AND
      primary_retirement_effect_digest IS NULL AND
      primary_fresh_origin_effect_role IS NULL AND
      primary_fresh_origin_effect_digest IS NULL AND
      secondary_fresh_origin_effect_role='secondary' AND
      secondary_fresh_origin_effect_digest IS NOT NULL) OR
    (transition_kind='generation-loss-terminal' AND
      secondary_intent_kind='none' AND
      primary_custody_effect_digest IS NULL AND
      primary_loss_effect_role='primary' AND
      primary_loss_effect_digest IS NOT NULL AND
      primary_retirement_effect_digest IS NULL AND
      primary_fresh_origin_effect_role IS NULL AND
      primary_fresh_origin_effect_digest IS NULL AND
      linked_loss_effect_digest IS NULL AND
      secondary_fresh_origin_effect_role IS NULL AND
      secondary_fresh_origin_effect_digest IS NULL) OR
    (transition_kind='custody-recovery-retirement' AND
      secondary_intent_kind='none' AND
      primary_custody_effect_digest IS NULL AND
      primary_loss_effect_role IS NULL AND primary_loss_effect_digest IS NULL AND
      primary_retirement_effect_digest IS NOT NULL AND
      primary_fresh_origin_effect_role IS NULL AND
      primary_fresh_origin_effect_digest IS NULL AND
      linked_loss_effect_digest IS NULL AND
      secondary_fresh_origin_effect_role IS NULL AND
      secondary_fresh_origin_effect_digest IS NULL) OR
    (transition_kind='fresh-origin' AND secondary_intent_kind='none' AND
      primary_custody_effect_digest IS NULL AND
      primary_loss_effect_role IS NULL AND primary_loss_effect_digest IS NULL AND
      primary_retirement_effect_digest IS NULL AND
      primary_fresh_origin_effect_role='primary' AND
      primary_fresh_origin_effect_digest IS NOT NULL AND
      linked_loss_effect_digest IS NULL AND
      secondary_fresh_origin_effect_role IS NULL AND
      secondary_fresh_origin_effect_digest IS NULL))
)

lifecycle_review_authority_bindings(
  receipt_digest PRIMARY KEY, intent_digest UNIQUE, batch_id UNIQUE,
  ordinal CHECK(ordinal=2), subject_digest,
  kind CHECK(kind='review-adoption-decision'),
  subject_owner_kind CHECK(subject_owner_kind='custody'),
  project_session_id, run_id, agent_id, custody_id, custody_revision,
  review_reservation_digest, review_decision_digest,
  certification_cut_digest, certification_cut_key,
  decision_loss_after_id, decision_loss_after_revision,
  decision_loss_after_semantic_digest, decision_loss_after_source_ref_digest,
  decision_loss_after_key, decision_loss_effect_key NOT NULL,
  decision_loss_effect_role, decision_loss_effect_digest,
  apply_id UNIQUE,
  UNIQUE(receipt_digest,run_id,agent_id,custody_id,custody_revision,
    review_decision_digest,certification_cut_digest),
  FOREIGN KEY(receipt_digest,intent_digest,batch_id,ordinal,kind,
      project_session_id,run_id,agent_id,subject_owner_kind,custody_id,
      custody_revision,subject_digest)
    REFERENCES lifecycle_authority_receipts(
      receipt_digest,intent_digest,batch_id,ordinal,kind,project_session_id,run_id,
      agent_id,subject_owner_kind,subject_owner_id,subject_owner_revision,
      subject_digest),
  FOREIGN KEY(batch_id,apply_id,project_session_id,run_id,agent_id,
      review_reservation_digest)
    REFERENCES lifecycle_receipt_batches(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      review_adoption_reservation_digest),
  FOREIGN KEY(run_id,agent_id,custody_id,custody_revision)
    REFERENCES lifecycle_rotation_custody_revisions(
      run_id,agent_id,custody_id,revision),
  FOREIGN KEY(review_reservation_digest,project_session_id,run_id,agent_id,
      custody_id,custody_revision,review_decision_digest,certification_cut_key,
      decision_loss_after_key)
    REFERENCES lifecycle_review_adoption_reservations(
      reservation_digest,project_session_id,run_id,agent_id,custody_id,
      finalized_custody_revision,review_decision_digest,certification_cut_key,
      decision_loss_after_key),
  FOREIGN KEY(review_reservation_digest,decision_loss_after_id,
      decision_loss_after_revision,decision_loss_after_semantic_digest,
      decision_loss_after_source_ref_digest)
    REFERENCES lifecycle_review_adoption_reservations(
      reservation_digest,decision_loss_after_id,decision_loss_after_revision,
      decision_loss_after_semantic_digest,decision_loss_after_source_ref_digest),
  FOREIGN KEY(batch_id,decision_loss_effect_key)
    REFERENCES lifecycle_receipt_batches(
      batch_id,review_decision_loss_effect_key),
  FOREIGN KEY(batch_id,decision_loss_effect_key,decision_loss_effect_role,
      decision_loss_effect_digest,project_session_id,run_id,agent_id,
      decision_loss_after_id,decision_loss_after_revision,
      decision_loss_after_semantic_digest,
      decision_loss_after_source_ref_digest)
    REFERENCES lifecycle_receipt_batches(
      batch_id,review_decision_loss_effect_key,
      review_decision_loss_effect_role,review_decision_loss_effect_digest,
      project_session_id,run_id,agent_id,review_decision_loss_after_id,
      review_decision_loss_after_revision,
      review_decision_loss_after_semantic_digest,
      review_decision_loss_after_source_ref_digest),
  FOREIGN KEY(apply_id,batch_id)
    REFERENCES lifecycle_transition_applies(apply_id,receipt_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK(certification_cut_key IS NOT NULL AND
    decision_loss_after_key IS NOT NULL),
  CHECK((certification_cut_digest IS NULL AND certification_cut_key='none') OR
    (certification_cut_digest IS NOT NULL AND
      certification_cut_key=certification_cut_digest)),
  CHECK((decision_loss_after_key='none' AND decision_loss_after_id IS NULL AND
      decision_loss_after_revision IS NULL AND
      decision_loss_after_semantic_digest IS NULL AND
      decision_loss_after_source_ref_digest IS NULL) OR
    (decision_loss_after_key<>'none' AND decision_loss_after_id IS NOT NULL AND
      decision_loss_after_revision IS NOT NULL AND
      decision_loss_after_semantic_digest IS NOT NULL AND
      decision_loss_after_source_ref_digest=decision_loss_after_key)),
  CHECK((decision_loss_effect_key='none' AND
      decision_loss_effect_role IS NULL AND
      decision_loss_effect_digest IS NULL) OR
    (decision_loss_effect_key<>'none' AND
      decision_loss_effect_role IS NOT NULL AND
      decision_loss_effect_role='linked' AND
      decision_loss_effect_digest IS NOT NULL AND
      decision_loss_effect_digest=decision_loss_effect_key))
)

lifecycle_receipt_batch_authorizations(
  batch_id PRIMARY KEY, project_session_id, run_id, batch_completion_digest,
  ordered_authority_receipt_set_digest, verified_scope_checkpoint_digest,
  authorized_at, authorization_digest UNIQUE,
  UNIQUE(batch_id,verified_scope_checkpoint_digest),
  UNIQUE(batch_id,ordered_authority_receipt_set_digest,
    verified_scope_checkpoint_digest),
  UNIQUE(batch_id,batch_completion_digest,
    ordered_authority_receipt_set_digest,verified_scope_checkpoint_digest),
  FOREIGN KEY(batch_id,project_session_id,run_id)
    REFERENCES lifecycle_receipt_batches(batch_id,project_session_id,run_id),
  FOREIGN KEY(batch_id,batch_completion_digest,
      ordered_authority_receipt_set_digest)
    REFERENCES lifecycle_receipt_batch_completions(
      batch_id,completion_digest,ordered_authority_receipt_set_digest),
  FOREIGN KEY(project_session_id,run_id,verified_scope_checkpoint_digest)
    REFERENCES lifecycle_receipt_scope_checkpoints(
      project_session_id,run_id,checkpoint_digest)
)

lifecycle_transition_applies(
  apply_id PRIMARY KEY,
  apply_kind CHECK(apply_kind IN ('terminal','terminal-fresh','fresh')),
  batch_transition_kind NOT NULL CHECK(batch_transition_kind IN
    ('custody-terminal','generation-loss-terminal',
      'custody-recovery-retirement','fresh-origin')),
  receipt_batch_id UNIQUE, batch_completion_digest, transition_replay_digest,
  ordered_authority_receipt_set_digest, verified_scope_checkpoint_digest,
  applied_mutation_plan_digest,
  fresh_handoff_id UNIQUE, fresh_handoff_digest, fresh_handoff_key NOT NULL,
  fresh_project_session_id, fresh_run_id, fresh_agent_id, fresh_source_mode,
  fresh_apply_plan_digest, new_custody_id UNIQUE,
  new_custody_revision CHECK(new_custody_revision=1),
  new_custody_semantic_digest, new_custody_source_ref_digest,
  fresh_generation_loss_id,
  fresh_generation_loss_after_revision,
  fresh_generation_loss_after_semantic_digest,
  fresh_generation_loss_after_source_ref_digest,
  fresh_generation_loss_after_key NOT NULL,
  fresh_origin_effect_role CHECK(
    fresh_origin_effect_role IS NULL OR
      fresh_origin_effect_role IN ('primary','secondary')),
  fresh_origin_effect_digest, local_write_set_digest,
  apply_json, apply_digest UNIQUE, applied_at,
  UNIQUE(apply_id,apply_digest),
  UNIQUE(apply_id,apply_digest,apply_kind),
  UNIQUE(apply_id,receipt_batch_id),
  UNIQUE(apply_id,apply_digest,receipt_batch_id),
  UNIQUE(apply_id,fresh_handoff_id),
  UNIQUE(apply_id,apply_digest,fresh_handoff_id),
  UNIQUE(apply_id,apply_digest,fresh_handoff_id,apply_kind),
  UNIQUE(apply_id,apply_digest,new_custody_id,new_custody_semantic_digest,
    new_custody_source_ref_digest),
  UNIQUE(apply_id,apply_digest,fresh_generation_loss_after_key),
  UNIQUE(apply_id,apply_digest,fresh_project_session_id,fresh_run_id,
    fresh_agent_id,fresh_generation_loss_id,
    fresh_generation_loss_after_revision,
    fresh_generation_loss_after_semantic_digest,
    fresh_generation_loss_after_source_ref_digest),
  FOREIGN KEY(receipt_batch_id,apply_id,batch_transition_kind,apply_kind,
      transition_replay_digest,applied_mutation_plan_digest,fresh_handoff_key)
    REFERENCES lifecycle_receipt_batches(
      batch_id,planned_apply_id,transition_kind,planned_apply_kind,
      transition_replay_digest,mutation_plan_digest,fresh_handoff_key),
  FOREIGN KEY(receipt_batch_id,batch_completion_digest,
      ordered_authority_receipt_set_digest,verified_scope_checkpoint_digest)
    REFERENCES lifecycle_receipt_batch_authorizations(
      batch_id,batch_completion_digest,ordered_authority_receipt_set_digest,
      verified_scope_checkpoint_digest),
  FOREIGN KEY(fresh_handoff_id,fresh_handoff_digest,apply_id,
      fresh_project_session_id,fresh_run_id,fresh_agent_id,fresh_source_mode,
      new_custody_id,
      new_custody_semantic_digest,new_custody_source_ref_digest,
      fresh_apply_plan_digest,fresh_generation_loss_after_key)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,planned_apply_id,project_session_id,run_id,
      agent_id,source_mode,new_custody_id,new_custody_semantic_digest,
      new_custody_source_ref_digest,fresh_apply_plan_digest,
      affected_generation_loss_after_key),
  FOREIGN KEY(fresh_handoff_id,apply_id,fresh_generation_loss_id,
      fresh_generation_loss_after_revision,
      fresh_generation_loss_after_semantic_digest,
      fresh_generation_loss_after_source_ref_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,planned_apply_id,affected_generation_loss_id,
      affected_generation_loss_after_revision,
      affected_generation_loss_after_semantic_digest,
      affected_generation_loss_after_source_ref_digest),
  FOREIGN KEY(receipt_batch_id,fresh_origin_effect_role,
      fresh_origin_effect_digest,fresh_project_session_id,fresh_run_id,
      fresh_agent_id,fresh_handoff_id,fresh_handoff_digest,new_custody_id,
      new_custody_revision,new_custody_semantic_digest,
      new_custody_source_ref_digest,fresh_generation_loss_after_key)
    REFERENCES lifecycle_receipt_fresh_origin_effects(
      batch_id,effect_role,effect_digest,project_session_id,run_id,agent_id,
      handoff_id,handoff_digest,new_custody_id,new_custody_revision,
      new_custody_semantic_digest,new_custody_source_ref_digest,
      affected_generation_loss_after_key),
  CHECK((apply_kind='terminal' AND
      batch_transition_kind IN ('custody-terminal','generation-loss-terminal',
        'custody-recovery-retirement') AND receipt_batch_id IS NOT NULL AND
      batch_completion_digest IS NOT NULL AND
      transition_replay_digest IS NOT NULL AND
      ordered_authority_receipt_set_digest IS NOT NULL AND
      verified_scope_checkpoint_digest IS NOT NULL AND
      applied_mutation_plan_digest IS NOT NULL AND fresh_handoff_id IS NULL AND
      fresh_handoff_digest IS NULL AND fresh_handoff_key='none' AND
      fresh_project_session_id IS NULL AND
      fresh_run_id IS NULL AND fresh_agent_id IS NULL AND
      fresh_source_mode IS NULL AND fresh_apply_plan_digest IS NULL AND
      new_custody_id IS NULL AND new_custody_revision IS NULL AND
      new_custody_semantic_digest IS NULL AND
      new_custody_source_ref_digest IS NULL AND
      fresh_generation_loss_id IS NULL AND
      fresh_generation_loss_after_revision IS NULL AND
      fresh_generation_loss_after_semantic_digest IS NULL AND
      fresh_generation_loss_after_source_ref_digest IS NULL AND
      fresh_generation_loss_after_key='none' AND
      fresh_origin_effect_role IS NULL AND
      fresh_origin_effect_digest IS NULL) OR
    (apply_kind='terminal-fresh' AND
      batch_transition_kind='custody-terminal' AND receipt_batch_id IS NOT NULL AND
      batch_completion_digest IS NOT NULL AND
      transition_replay_digest IS NOT NULL AND
      ordered_authority_receipt_set_digest IS NOT NULL AND
      verified_scope_checkpoint_digest IS NOT NULL AND
      applied_mutation_plan_digest IS NOT NULL AND fresh_handoff_id IS NOT NULL AND
      fresh_handoff_digest IS NOT NULL AND
      fresh_handoff_key=fresh_handoff_digest AND
      fresh_project_session_id IS NOT NULL AND
      fresh_run_id IS NOT NULL AND fresh_agent_id IS NOT NULL AND
      fresh_source_mode='terminalize-nonfinal-custody' AND
      fresh_apply_plan_digest IS NOT NULL AND
      new_custody_id IS NOT NULL AND new_custody_revision=1 AND
      new_custody_semantic_digest IS NOT NULL AND
      new_custody_source_ref_digest IS NOT NULL AND
      fresh_origin_effect_role='secondary' AND
      fresh_origin_effect_digest IS NOT NULL AND
      ((fresh_generation_loss_after_key='none' AND
          fresh_generation_loss_id IS NULL AND
          fresh_generation_loss_after_revision IS NULL AND
          fresh_generation_loss_after_semantic_digest IS NULL AND
          fresh_generation_loss_after_source_ref_digest IS NULL) OR
        (fresh_generation_loss_after_key<>'none' AND
          fresh_generation_loss_id IS NOT NULL AND
          fresh_generation_loss_after_revision IS NOT NULL AND
          fresh_generation_loss_after_semantic_digest IS NOT NULL AND
          fresh_generation_loss_after_source_ref_digest=
            fresh_generation_loss_after_key))) OR
    (apply_kind='fresh' AND batch_transition_kind='fresh-origin' AND
      receipt_batch_id IS NOT NULL AND batch_completion_digest IS NOT NULL AND
      transition_replay_digest IS NOT NULL AND
      ordered_authority_receipt_set_digest IS NOT NULL AND
      verified_scope_checkpoint_digest IS NOT NULL AND
      applied_mutation_plan_digest IS NOT NULL AND fresh_handoff_id IS NOT NULL AND
      fresh_handoff_digest IS NOT NULL AND
      fresh_handoff_key=fresh_handoff_digest AND
      fresh_project_session_id IS NOT NULL AND
      fresh_run_id IS NOT NULL AND fresh_agent_id IS NOT NULL AND
      fresh_source_mode IN ('reuse-final-custody','open-generation-loss') AND
      fresh_apply_plan_digest IS NOT NULL AND
      new_custody_id IS NOT NULL AND new_custody_revision=1 AND
      new_custody_semantic_digest IS NOT NULL AND
      new_custody_source_ref_digest IS NOT NULL AND
      applied_mutation_plan_digest=fresh_apply_plan_digest AND
      fresh_origin_effect_role='primary' AND
      fresh_origin_effect_digest IS NOT NULL AND
      ((fresh_source_mode='reuse-final-custody' AND
          fresh_generation_loss_after_key='none' AND
          fresh_generation_loss_id IS NULL AND
          fresh_generation_loss_after_revision IS NULL AND
          fresh_generation_loss_after_semantic_digest IS NULL AND
          fresh_generation_loss_after_source_ref_digest IS NULL) OR
        (fresh_source_mode='open-generation-loss' AND
          fresh_generation_loss_after_key<>'none' AND
          fresh_generation_loss_id IS NOT NULL AND
          fresh_generation_loss_after_revision IS NOT NULL AND
          fresh_generation_loss_after_semantic_digest IS NOT NULL AND
          fresh_generation_loss_after_source_ref_digest=
            fresh_generation_loss_after_key))))
)

lifecycle_review_adoption_reservations(
  reservation_id PRIMARY KEY, reservation_digest UNIQUE,
  project_session_id, run_id, agent_id, custody_id,
  finalized_custody_revision, target_generation,
  predecessor_binding_generation, predecessor_binding_digest,
  terminal_sequence_high_water, lifecycle_adoption_evidence_digest,
  review_decision_json, review_decision_digest,
  certification_cut_json, certification_cut_digest, certification_cut_key,
  recovery_source_kind CHECK(
    recovery_source_kind IN ('none','custody','generation-loss')),
  recovery_from_custody_id, recovery_from_custody_revision,
  recovery_from_generation_loss_id, recovery_from_generation_loss_revision,
  recovery_source_ref_digest,
  decision_loss_after_id, decision_loss_after_revision,
  decision_loss_after_semantic_digest, decision_loss_after_source_ref_digest,
  decision_loss_after_key, decision_loss_effect_key NOT NULL,
  recovery_source_decision_json, recovery_source_decision_digest,
  local_write_set_digest, reservation_json, created_at,
  UNIQUE(reservation_id,reservation_digest),
  UNIQUE(reservation_id,reservation_digest,decision_loss_effect_key),
  UNIQUE(reservation_id,reservation_digest,decision_loss_effect_key,
    decision_loss_after_id,decision_loss_after_revision,
    decision_loss_after_semantic_digest,decision_loss_after_source_ref_digest),
  UNIQUE(reservation_digest,project_session_id,run_id,agent_id,custody_id,
    finalized_custody_revision,review_decision_digest,certification_cut_key,
    decision_loss_after_key),
  UNIQUE(reservation_digest,decision_loss_after_id,decision_loss_after_revision,
    decision_loss_after_semantic_digest,decision_loss_after_source_ref_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,
    finalized_custody_revision),
  CHECK(certification_cut_key IS NOT NULL AND
    decision_loss_after_key IS NOT NULL),
  FOREIGN KEY(project_session_id,run_id,agent_id,custody_id)
    REFERENCES lifecycle_rotation_custodies(
      project_session_id,run_id,agent_id,custody_id),
  CHECK((certification_cut_digest IS NULL AND certification_cut_key='none') OR
    (certification_cut_digest IS NOT NULL AND
      certification_cut_key=certification_cut_digest)),
  CHECK((recovery_source_kind='none' AND
      recovery_from_custody_id IS NULL AND
      recovery_from_custody_revision IS NULL AND
      recovery_from_generation_loss_id IS NULL AND
      recovery_from_generation_loss_revision IS NULL AND
      recovery_source_ref_digest IS NULL AND
      decision_loss_after_id IS NULL AND decision_loss_after_revision IS NULL AND
      decision_loss_after_semantic_digest IS NULL AND
      decision_loss_after_source_ref_digest IS NULL AND
      decision_loss_after_key='none' AND
      decision_loss_effect_key='none' AND
      recovery_source_decision_json IS NULL AND
      recovery_source_decision_digest IS NULL) OR
    (recovery_source_kind='custody' AND
      recovery_from_custody_id IS NOT NULL AND
      recovery_from_custody_revision IS NOT NULL AND
      recovery_from_generation_loss_id IS NULL AND
      recovery_from_generation_loss_revision IS NULL AND
      recovery_source_ref_digest IS NOT NULL AND
      decision_loss_after_id IS NULL AND decision_loss_after_revision IS NULL AND
      decision_loss_after_semantic_digest IS NULL AND
      decision_loss_after_source_ref_digest IS NULL AND
      decision_loss_after_key='none' AND
      decision_loss_effect_key='none' AND
      recovery_source_decision_json IS NOT NULL AND
      recovery_source_decision_digest IS NOT NULL) OR
    (recovery_source_kind='generation-loss' AND
      recovery_from_custody_id IS NULL AND
      recovery_from_custody_revision IS NULL AND
      recovery_from_generation_loss_id IS NOT NULL AND
      recovery_from_generation_loss_revision IS NOT NULL AND
      recovery_source_ref_digest IS NOT NULL AND
      decision_loss_after_id=recovery_from_generation_loss_id AND
      decision_loss_after_revision IS NOT NULL AND
      decision_loss_after_semantic_digest IS NOT NULL AND
      decision_loss_after_source_ref_digest IS NOT NULL AND
      decision_loss_after_key=decision_loss_after_source_ref_digest AND
      decision_loss_effect_key<>'none' AND
      recovery_source_decision_json IS NOT NULL AND
      recovery_source_decision_digest IS NOT NULL)),
  FOREIGN KEY(project_session_id,run_id,agent_id,recovery_from_custody_id,
      recovery_from_custody_revision,recovery_source_ref_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,
      source_ref_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,
      recovery_from_generation_loss_id,recovery_from_generation_loss_revision,
      recovery_source_ref_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,
      revision,source_ref_digest),
  CHECK((decision_loss_effect_key='none')=
    (decision_loss_after_id IS NULL))
)

lifecycle_fresh_rotation_preparations(
  preparation_id PRIMARY KEY, attempt_id UNIQUE, issue_id UNIQUE,
  project_session_id, run_id, agent_id,
  recovery_source_kind CHECK(
    recovery_source_kind IN ('custody','generation-loss')),
  old_custody_id, old_custody_revision,
  generation_loss_id, generation_loss_revision,
  recovery_source_ref_digest, source_journal_digest,
  provider_action_adapter_id, provider_action_id,
  checkpoint_ref, checkpoint_digest, checkpoint_validation_digest,
  checkpoint_validation_key,
  adapter_contract_digest, operation,
  reserved_provider_generation, reserved_principal_generation,
  reserved_bridge_generation, preparation_json, preparation_digest,
  created_at,
  UNIQUE(preparation_id,preparation_digest),
  UNIQUE(preparation_id,attempt_id,issue_id,project_session_id,run_id,agent_id,
    recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
    preparation_digest),
  UNIQUE(preparation_id,attempt_id,issue_id,project_session_id,run_id,agent_id,
    recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
    provider_action_adapter_id,provider_action_id,checkpoint_ref,
    checkpoint_digest,checkpoint_validation_digest,checkpoint_validation_key,
    adapter_contract_digest,
    operation,reserved_provider_generation,reserved_principal_generation,
    reserved_bridge_generation,preparation_digest),
  UNIQUE(preparation_id,attempt_id,issue_id,project_session_id,run_id,agent_id,
    recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
    provider_action_adapter_id,provider_action_id,checkpoint_ref,
    checkpoint_digest,checkpoint_validation_key,adapter_contract_digest,operation,
    reserved_provider_generation,reserved_principal_generation,
    reserved_bridge_generation,preparation_digest),
  UNIQUE(provider_action_adapter_id,provider_action_id),
  FOREIGN KEY(issue_id,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest)
    REFERENCES agent_lifecycle_recovery_capability_issues(
      issue_id,project_session_id,run_id,agent_id,recovery_source_kind,
      recovery_source_ref_digest,source_journal_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,old_custody_id,
      old_custody_revision,recovery_source_ref_digest,source_journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,
      source_ref_digest,journal_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      generation_loss_revision,recovery_source_ref_digest,source_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,
      revision,source_ref_digest,journal_digest),
  CHECK((checkpoint_validation_digest IS NULL AND
      checkpoint_validation_key='none') OR
    (checkpoint_validation_digest IS NOT NULL AND
      checkpoint_validation_key=checkpoint_validation_digest)),
  CHECK((recovery_source_kind='custody' AND old_custody_id IS NOT NULL AND
      old_custody_revision IS NOT NULL AND generation_loss_id IS NULL AND
      generation_loss_revision IS NULL) OR
    (recovery_source_kind='generation-loss' AND old_custody_id IS NULL AND
      old_custody_revision IS NULL AND generation_loss_id IS NOT NULL AND
      generation_loss_revision IS NOT NULL))
)

lifecycle_fresh_recovery_handoffs(
  handoff_id PRIMARY KEY, preparation_id UNIQUE, attempt_id UNIQUE,
  preparation_digest, issue_id UNIQUE, project_session_id, run_id, agent_id,
  source_mode CHECK(source_mode IN ('terminalize-nonfinal-custody',
    'reuse-final-custody','open-generation-loss')),
  recovery_source_kind CHECK(
    recovery_source_kind IN ('custody','generation-loss')),
  old_custody_id, old_custody_revision,
  generation_loss_id, generation_loss_revision,
  recovery_source_ref_digest, source_journal_digest,
  new_custody_id UNIQUE, planned_apply_id UNIQUE, new_custody_semantic_digest,
  new_custody_source_ref_digest,
  affected_generation_loss_id, affected_generation_loss_before_revision,
  affected_generation_loss_before_state,
  affected_generation_loss_before_source_ref_digest,
  affected_generation_loss_before_journal_digest,
  affected_generation_loss_after_revision,
  affected_generation_loss_after_semantic_digest,
  affected_generation_loss_after_source_ref_digest,
  affected_generation_loss_after_key NOT NULL,
  provider_action_adapter_id, provider_action_id,
  checkpoint_ref, checkpoint_digest, checkpoint_validation_digest,
  checkpoint_validation_key,
  adapter_contract_digest, operation,
  reserved_provider_generation, reserved_principal_generation,
  reserved_bridge_generation, admission_digest,
  fresh_apply_plan_json, fresh_apply_plan_digest,
  handoff_json, handoff_digest UNIQUE, created_at,
  UNIQUE(handoff_id,handoff_digest),
  UNIQUE(handoff_id,handoff_digest,planned_apply_id),
  UNIQUE(handoff_id,handoff_digest,planned_apply_id,source_mode),
  UNIQUE(handoff_id,handoff_digest,affected_generation_loss_after_key),
  UNIQUE(handoff_id,provider_action_adapter_id,provider_action_id),
  UNIQUE(handoff_id,admission_digest,fresh_apply_plan_digest),
  UNIQUE(handoff_id,handoff_digest,project_session_id,run_id,agent_id,
    source_mode,recovery_source_kind,old_custody_id,old_custody_revision,
    generation_loss_id,generation_loss_revision,recovery_source_ref_digest,
    source_journal_digest,new_custody_id,provider_action_adapter_id,
    provider_action_id,checkpoint_ref,checkpoint_digest,
    checkpoint_validation_digest,checkpoint_validation_key,
    adapter_contract_digest,operation,
    reserved_provider_generation,reserved_principal_generation,
    reserved_bridge_generation,admission_digest,fresh_apply_plan_digest),
  UNIQUE(handoff_id,handoff_digest,project_session_id,run_id,agent_id,
    recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
    new_custody_id,provider_action_adapter_id,provider_action_id,checkpoint_ref,
    checkpoint_digest,checkpoint_validation_key,adapter_contract_digest,operation,
    reserved_provider_generation,reserved_principal_generation,
    reserved_bridge_generation,admission_digest,fresh_apply_plan_digest),
  UNIQUE(handoff_id,handoff_digest,planned_apply_id,project_session_id,run_id,
    agent_id,source_mode,new_custody_id,new_custody_semantic_digest,
    new_custody_source_ref_digest,
    fresh_apply_plan_digest,affected_generation_loss_id,
    affected_generation_loss_after_revision,
    affected_generation_loss_after_semantic_digest,
    affected_generation_loss_after_source_ref_digest),
  UNIQUE(handoff_id,planned_apply_id,affected_generation_loss_id,
    affected_generation_loss_after_revision,
    affected_generation_loss_after_semantic_digest,
    affected_generation_loss_after_source_ref_digest),
  UNIQUE(handoff_id,handoff_digest,planned_apply_id,project_session_id,run_id,
    agent_id,source_mode,new_custody_id,new_custody_semantic_digest,
    new_custody_source_ref_digest,fresh_apply_plan_digest,
    affected_generation_loss_after_key),
  UNIQUE(handoff_id,handoff_digest,planned_apply_id,project_session_id,run_id,
    agent_id,source_mode,recovery_source_kind,recovery_source_ref_digest,
    source_journal_digest,new_custody_id,new_custody_semantic_digest,
    new_custody_source_ref_digest,affected_generation_loss_after_key,
    admission_digest,fresh_apply_plan_digest),
  UNIQUE(handoff_id,handoff_digest,affected_generation_loss_id,
    affected_generation_loss_before_revision,
    affected_generation_loss_before_state,
    affected_generation_loss_before_source_ref_digest,
    affected_generation_loss_before_journal_digest,
    affected_generation_loss_after_revision,
    affected_generation_loss_after_semantic_digest,
    affected_generation_loss_after_source_ref_digest),
  UNIQUE(handoff_id,preparation_id,attempt_id,issue_id,project_session_id,
    run_id,agent_id,source_mode,recovery_source_kind,recovery_source_ref_digest,
    source_journal_digest,preparation_digest,fresh_apply_plan_digest,
    handoff_digest),
  UNIQUE(provider_action_adapter_id,provider_action_id),
  FOREIGN KEY(issue_id)
    REFERENCES agent_lifecycle_recovery_source_heads(issue_id),
  FOREIGN KEY(preparation_id,attempt_id,issue_id,project_session_id,run_id,
      agent_id,recovery_source_kind,recovery_source_ref_digest,
      source_journal_digest,preparation_digest)
    REFERENCES lifecycle_fresh_rotation_preparations(
      preparation_id,attempt_id,issue_id,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
      preparation_digest),
  FOREIGN KEY(preparation_id,attempt_id,issue_id,project_session_id,run_id,
      agent_id,recovery_source_kind,recovery_source_ref_digest,
      source_journal_digest,provider_action_adapter_id,provider_action_id,
      checkpoint_ref,checkpoint_digest,checkpoint_validation_digest,
      checkpoint_validation_key,
      adapter_contract_digest,operation,reserved_provider_generation,
      reserved_principal_generation,reserved_bridge_generation,
      preparation_digest)
    REFERENCES lifecycle_fresh_rotation_preparations(
      preparation_id,attempt_id,issue_id,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
      provider_action_adapter_id,provider_action_id,checkpoint_ref,
      checkpoint_digest,checkpoint_validation_digest,checkpoint_validation_key,
      adapter_contract_digest,
      operation,reserved_provider_generation,reserved_principal_generation,
      reserved_bridge_generation,preparation_digest),
  FOREIGN KEY(preparation_id,attempt_id,issue_id,project_session_id,run_id,
      agent_id,recovery_source_kind,recovery_source_ref_digest,
      source_journal_digest,provider_action_adapter_id,provider_action_id,
      checkpoint_ref,checkpoint_digest,checkpoint_validation_key,
      adapter_contract_digest,operation,
      reserved_provider_generation,reserved_principal_generation,
      reserved_bridge_generation,preparation_digest)
    REFERENCES lifecycle_fresh_rotation_preparations(
      preparation_id,attempt_id,issue_id,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
      provider_action_adapter_id,provider_action_id,checkpoint_ref,
      checkpoint_digest,checkpoint_validation_key,adapter_contract_digest,operation,
      reserved_provider_generation,reserved_principal_generation,
      reserved_bridge_generation,preparation_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,old_custody_id,
      old_custody_revision,recovery_source_ref_digest,source_journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,
      source_ref_digest,journal_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      generation_loss_revision,recovery_source_ref_digest,source_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      source_ref_digest,journal_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,affected_generation_loss_id,
      affected_generation_loss_before_revision,
      affected_generation_loss_before_state,
      affected_generation_loss_before_source_ref_digest,
      affected_generation_loss_before_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      state,source_ref_digest,journal_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,affected_generation_loss_id,
      affected_generation_loss_before_revision,
      affected_generation_loss_before_state,old_custody_id,
      affected_generation_loss_before_source_ref_digest,
      affected_generation_loss_before_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,state,
      active_recovery_custody_id,source_ref_digest,journal_digest),
  CHECK((checkpoint_validation_digest IS NULL AND
      checkpoint_validation_key='none') OR
    (checkpoint_validation_digest IS NOT NULL AND
      checkpoint_validation_key=checkpoint_validation_digest)),
  CHECK((source_mode='terminalize-nonfinal-custody' AND
      recovery_source_kind='custody' AND
      old_custody_id IS NOT NULL AND old_custody_revision IS NOT NULL AND
      generation_loss_id IS NULL AND generation_loss_revision IS NULL AND
      ((affected_generation_loss_id IS NULL AND
          affected_generation_loss_before_revision IS NULL AND
          affected_generation_loss_before_state IS NULL AND
          affected_generation_loss_before_source_ref_digest IS NULL AND
          affected_generation_loss_before_journal_digest IS NULL AND
          affected_generation_loss_after_revision IS NULL AND
          affected_generation_loss_after_semantic_digest IS NULL AND
          affected_generation_loss_after_source_ref_digest IS NULL AND
          affected_generation_loss_after_key='none') OR
        (affected_generation_loss_id IS NOT NULL AND
          affected_generation_loss_before_revision IS NOT NULL AND
          affected_generation_loss_before_state='recovery-in-progress' AND
          affected_generation_loss_before_source_ref_digest IS NOT NULL AND
          affected_generation_loss_before_journal_digest IS NOT NULL AND
          affected_generation_loss_after_revision=
            affected_generation_loss_before_revision+1 AND
          affected_generation_loss_after_semantic_digest IS NOT NULL AND
          affected_generation_loss_after_source_ref_digest IS NOT NULL AND
          affected_generation_loss_after_key=
            affected_generation_loss_after_source_ref_digest))) OR
    (source_mode='reuse-final-custody' AND recovery_source_kind='custody' AND
      old_custody_id IS NOT NULL AND old_custody_revision IS NOT NULL AND
      generation_loss_id IS NULL AND generation_loss_revision IS NULL AND
      affected_generation_loss_id IS NULL AND
      affected_generation_loss_before_revision IS NULL AND
      affected_generation_loss_before_state IS NULL AND
      affected_generation_loss_before_source_ref_digest IS NULL AND
      affected_generation_loss_before_journal_digest IS NULL AND
      affected_generation_loss_after_revision IS NULL AND
      affected_generation_loss_after_semantic_digest IS NULL AND
      affected_generation_loss_after_source_ref_digest IS NULL AND
      affected_generation_loss_after_key='none') OR
    (source_mode='open-generation-loss' AND
      recovery_source_kind='generation-loss' AND old_custody_id IS NULL AND
      old_custody_revision IS NULL AND generation_loss_id IS NOT NULL AND
      generation_loss_revision IS NOT NULL AND
      affected_generation_loss_id=generation_loss_id AND
      affected_generation_loss_before_revision=generation_loss_revision AND
      affected_generation_loss_before_state='open' AND
      affected_generation_loss_before_source_ref_digest=
        recovery_source_ref_digest AND
      affected_generation_loss_before_journal_digest=source_journal_digest AND
      affected_generation_loss_after_revision=generation_loss_revision+1 AND
      affected_generation_loss_after_semantic_digest IS NOT NULL AND
      affected_generation_loss_after_source_ref_digest IS NOT NULL AND
      affected_generation_loss_after_key=
        affected_generation_loss_after_source_ref_digest))
)
~~~

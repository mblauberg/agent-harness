~~~sql

lifecycle_fresh_rotation_commits(
  commit_id PRIMARY KEY, handoff_id UNIQUE, preparation_id UNIQUE,
  handoff_digest, preparation_digest, attempt_id UNIQUE, issue_id UNIQUE,
  project_session_id, run_id, agent_id,
  source_mode, recovery_source_kind, recovery_source_ref_digest,
  source_journal_digest, new_custody_id UNIQUE,
  new_custody_revision CHECK(new_custody_revision=1),
  new_custody_semantic_digest, new_custody_source_ref_digest,
  new_custody_journal_digest,
  generation_loss_after_id, generation_loss_after_revision,
  generation_loss_after_semantic_digest,
  generation_loss_after_source_ref_digest, generation_loss_after_journal_digest,
  generation_loss_after_key NOT NULL,
  provider_action_adapter_id, provider_action_id,
  checkpoint_ref, checkpoint_digest, checkpoint_validation_digest,
  checkpoint_validation_key,
  adapter_contract_digest, operation,
  reserved_provider_generation, reserved_principal_generation,
  reserved_bridge_generation,
  admission_digest, fresh_apply_plan_digest,
  apply_kind CHECK(apply_kind IN ('terminal-fresh','fresh')), fresh_apply_digest,
  source_terminal_receipt_apply_digest, apply_id UNIQUE,
  commit_json, commit_digest UNIQUE, created_at,
  UNIQUE(handoff_id,preparation_id,attempt_id,issue_id,project_session_id,
    run_id,agent_id,source_mode,recovery_source_kind,recovery_source_ref_digest,
    source_journal_digest,preparation_digest,fresh_apply_plan_digest),
  FOREIGN KEY(handoff_id,handoff_digest,generation_loss_after_key)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,affected_generation_loss_after_key),
  FOREIGN KEY(apply_id,fresh_apply_digest,generation_loss_after_key)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,fresh_generation_loss_after_key)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(handoff_id,preparation_id,attempt_id,issue_id,
      project_session_id,run_id,agent_id,source_mode,recovery_source_kind,
      recovery_source_ref_digest,source_journal_digest,preparation_digest,
      fresh_apply_plan_digest,handoff_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,preparation_id,attempt_id,issue_id,project_session_id,run_id,
      agent_id,source_mode,recovery_source_kind,recovery_source_ref_digest,
      source_journal_digest,preparation_digest,fresh_apply_plan_digest,
      handoff_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,new_custody_id,
      new_custody_revision,new_custody_semantic_digest,
      new_custody_source_ref_digest,new_custody_journal_digest,apply_id,
      fresh_apply_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,semantic_digest,
      source_ref_digest,journal_digest,origin_fresh_apply_id,
      origin_fresh_apply_digest),
  FOREIGN KEY(handoff_id,handoff_digest,apply_id,project_session_id,run_id,
      agent_id,source_mode,new_custody_id,new_custody_semantic_digest,
      new_custody_source_ref_digest,fresh_apply_plan_digest,
      generation_loss_after_id,generation_loss_after_revision,
      generation_loss_after_semantic_digest,
      generation_loss_after_source_ref_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,planned_apply_id,project_session_id,run_id,
      agent_id,source_mode,new_custody_id,new_custody_semantic_digest,
      new_custody_source_ref_digest,fresh_apply_plan_digest,
      affected_generation_loss_id,affected_generation_loss_after_revision,
      affected_generation_loss_after_semantic_digest,
      affected_generation_loss_after_source_ref_digest),
  FOREIGN KEY(apply_id,fresh_apply_digest,project_session_id,run_id,agent_id,
      generation_loss_after_id,generation_loss_after_revision,
      generation_loss_after_semantic_digest,
      generation_loss_after_source_ref_digest)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,fresh_project_session_id,fresh_run_id,fresh_agent_id,
      fresh_generation_loss_id,fresh_generation_loss_after_revision,
      fresh_generation_loss_after_semantic_digest,
      fresh_generation_loss_after_source_ref_digest)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_after_id,
      generation_loss_after_revision,generation_loss_after_semantic_digest,
      generation_loss_after_source_ref_digest,
      generation_loss_after_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      semantic_digest,source_ref_digest,journal_digest),
  FOREIGN KEY(handoff_id,provider_action_adapter_id,provider_action_id)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,provider_action_adapter_id,provider_action_id),
  FOREIGN KEY(handoff_id,handoff_digest,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
      new_custody_id,provider_action_adapter_id,provider_action_id,checkpoint_ref,
      checkpoint_digest,checkpoint_validation_key,adapter_contract_digest,operation,
      reserved_provider_generation,reserved_principal_generation,
      reserved_bridge_generation,admission_digest,fresh_apply_plan_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
      new_custody_id,provider_action_adapter_id,provider_action_id,checkpoint_ref,
      checkpoint_digest,checkpoint_validation_key,adapter_contract_digest,operation,
      reserved_provider_generation,reserved_principal_generation,
      reserved_bridge_generation,admission_digest,fresh_apply_plan_digest),
  FOREIGN KEY(handoff_id,admission_digest,fresh_apply_plan_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,admission_digest,fresh_apply_plan_digest),
  FOREIGN KEY(apply_id,handoff_id)
    REFERENCES lifecycle_transition_applies(apply_id,fresh_handoff_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(apply_id,fresh_apply_digest,handoff_id,apply_kind)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,fresh_handoff_id,apply_kind)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(apply_id,source_terminal_receipt_apply_digest,handoff_id)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,fresh_handoff_id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK((checkpoint_validation_digest IS NULL AND
      checkpoint_validation_key='none') OR
    (checkpoint_validation_digest IS NOT NULL AND
      checkpoint_validation_key=checkpoint_validation_digest)),
  CHECK((source_mode='terminalize-nonfinal-custody' AND
      apply_kind='terminal-fresh' AND
      source_terminal_receipt_apply_digest=fresh_apply_digest AND
      ((generation_loss_after_id IS NULL AND
          generation_loss_after_revision IS NULL AND
          generation_loss_after_semantic_digest IS NULL AND
          generation_loss_after_source_ref_digest IS NULL AND
          generation_loss_after_journal_digest IS NULL AND
          generation_loss_after_key='none') OR
        (generation_loss_after_id IS NOT NULL AND
          generation_loss_after_revision IS NOT NULL AND
          generation_loss_after_semantic_digest IS NOT NULL AND
          generation_loss_after_source_ref_digest IS NOT NULL AND
          generation_loss_after_journal_digest IS NOT NULL AND
          generation_loss_after_key=
            generation_loss_after_source_ref_digest))) OR
    (source_mode='reuse-final-custody' AND apply_kind='fresh' AND
      source_terminal_receipt_apply_digest IS NULL AND
      generation_loss_after_id IS NULL AND
      generation_loss_after_revision IS NULL AND
      generation_loss_after_semantic_digest IS NULL AND
      generation_loss_after_source_ref_digest IS NULL AND
      generation_loss_after_journal_digest IS NULL AND
      generation_loss_after_key='none') OR
    (source_mode='open-generation-loss' AND apply_kind='fresh' AND
      source_terminal_receipt_apply_digest IS NULL AND
      generation_loss_after_id IS NOT NULL AND
      generation_loss_after_revision IS NOT NULL AND
      generation_loss_after_semantic_digest IS NOT NULL AND
      generation_loss_after_source_ref_digest IS NOT NULL AND
      generation_loss_after_journal_digest IS NOT NULL AND
      generation_loss_after_key=generation_loss_after_source_ref_digest)),
  CHECK(source_mode IN ('terminalize-nonfinal-custody',
    'reuse-final-custody','open-generation-loss')),
  CHECK(recovery_source_kind IN ('custody','generation-loss'))
)

lifecycle_generation_losses(
  project_session_id, run_id, agent_id, generation_loss_id, loss_kind,
  old_provider_session_ref,
  new_provider_session_ref, old_provider_generation,
  new_provider_generation, old_context_revision, new_context_revision,
  source_custody_action_id, source_adapter_id, source_adapter_contract_digest,
  source_principal_generation, source_bridge_generation, bridge_owner_kind,
  source_bridge_row_id, source_bridge_revision, source_capability_hash,
  source_project_session_generation, source_run_generation,
  source_chair_lease_generation,
  checkpoint_state, checkpoint_ref, checkpoint_digest,
  loss_evidence_digest, creation_json, creation_digest, created_at,
  PRIMARY KEY(run_id,agent_id,generation_loss_id),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id),
  UNIQUE(creation_digest),
  CHECK(loss_kind IN ('generation-advance','context-advance')),
  FOREIGN KEY(source_adapter_id, source_custody_action_id)
    REFERENCES provider_actions(adapter_id,action_id)
)

lifecycle_generation_loss_revisions(
  project_session_id, run_id, agent_id, generation_loss_id,
  revision CHECK(revision >= 1), prior_revision, prior_journal_digest,
  state CHECK(state IN
    ('open','recovery-in-progress','recovered-adopted','abandoned')),
  abandon_kind_code CHECK(
    abandon_kind_code IN ('none','direct-open','recovery-attempt')),
  recovery_action_adapter_id, recovery_action_id, active_recovery_custody_id,
  terminal_evidence_digest, semantic_json, semantic_digest, source_ref_digest,
  origin_fresh_apply_id, origin_fresh_apply_digest,
  receipt_batch_id, receipt_apply_id, receipt_apply_digest,
  journal_json, journal_digest, recorded_at,
  PRIMARY KEY(run_id,agent_id,generation_loss_id,revision),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,
    source_ref_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,
    journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,
    source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,
    semantic_digest,source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,
    semantic_digest,source_ref_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,state,
    source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,state,
    active_recovery_custody_id,source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,
    state,abandon_kind_code,semantic_digest,source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,
    semantic_digest,source_ref_digest,journal_digest,origin_fresh_apply_id,
    origin_fresh_apply_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,state,
    abandon_kind_code,recovery_action_adapter_id,recovery_action_id,
    active_recovery_custody_id,semantic_digest,source_ref_digest,journal_digest),
  UNIQUE(semantic_digest), UNIQUE(source_ref_digest), UNIQUE(journal_digest),
  CHECK((revision=1 AND prior_revision IS NULL AND
      prior_journal_digest IS NULL) OR
    (revision>1 AND prior_revision=revision-1 AND
      prior_journal_digest IS NOT NULL)),
  CHECK((receipt_batch_id IS NULL)=(receipt_apply_id IS NULL)),
  CHECK((receipt_batch_id IS NULL)=(receipt_apply_digest IS NULL)),
  CHECK((origin_fresh_apply_id IS NULL)=(origin_fresh_apply_digest IS NULL)),
  CHECK((revision=1 AND state='open' AND receipt_batch_id IS NULL AND
      origin_fresh_apply_id IS NULL) OR
    (revision>1 AND
      ((receipt_batch_id IS NOT NULL AND origin_fresh_apply_id IS NULL) OR
        (receipt_batch_id IS NULL AND origin_fresh_apply_id IS NOT NULL)))),
  CHECK(origin_fresh_apply_id IS NULL OR state='recovery-in-progress'),
  CHECK(state NOT IN ('recovered-adopted','abandoned') OR
    receipt_batch_id IS NOT NULL),
  CHECK((state='open' AND abandon_kind_code='none' AND
      recovery_action_id IS NULL AND active_recovery_custody_id IS NULL AND
      terminal_evidence_digest IS NULL) OR
    (state='recovery-in-progress' AND abandon_kind_code='none' AND
      recovery_action_id IS NOT NULL AND
      active_recovery_custody_id IS NOT NULL AND
      terminal_evidence_digest IS NULL) OR
    (state='recovered-adopted' AND abandon_kind_code='none' AND
      recovery_action_id IS NOT NULL AND
      active_recovery_custody_id IS NOT NULL AND
      terminal_evidence_digest IS NOT NULL) OR
    (state='abandoned' AND abandon_kind_code='direct-open' AND
      recovery_action_id IS NULL AND active_recovery_custody_id IS NULL AND
      terminal_evidence_digest IS NOT NULL) OR
    (state='abandoned' AND abandon_kind_code='recovery-attempt' AND
      recovery_action_id IS NOT NULL AND
      active_recovery_custody_id IS NOT NULL AND
      terminal_evidence_digest IS NOT NULL)),
  CHECK((recovery_action_adapter_id IS NULL)=(recovery_action_id IS NULL)),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id)
    REFERENCES lifecycle_generation_losses(
      project_session_id,run_id,agent_id,generation_loss_id),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      prior_revision,prior_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      journal_digest),
  FOREIGN KEY(recovery_action_adapter_id,recovery_action_id)
    REFERENCES lifecycle_rotation_custodies(
      provider_action_adapter_id,provider_action_id),
  FOREIGN KEY(run_id,agent_id,active_recovery_custody_id)
    REFERENCES lifecycle_rotation_custodies(run_id,agent_id,custody_id),
  FOREIGN KEY(receipt_batch_id,receipt_apply_id,project_session_id,run_id,agent_id,
      generation_loss_id,revision,semantic_digest,source_ref_digest)
    REFERENCES lifecycle_receipt_generation_loss_effects(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      generation_loss_id,final_revision,final_semantic_digest,
      final_source_ref_digest)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(receipt_apply_id,receipt_apply_digest,receipt_batch_id)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,receipt_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(receipt_apply_id,receipt_batch_id)
    REFERENCES lifecycle_transition_applies(apply_id,receipt_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(origin_fresh_apply_id,origin_fresh_apply_digest,
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      semantic_digest,source_ref_digest)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,fresh_project_session_id,fresh_run_id,fresh_agent_id,
      fresh_generation_loss_id,fresh_generation_loss_after_revision,
      fresh_generation_loss_after_semantic_digest,
      fresh_generation_loss_after_source_ref_digest)
    DEFERRABLE INITIALLY DEFERRED
)

lifecycle_generation_loss_heads(
  project_session_id NOT NULL, run_id NOT NULL, agent_id NOT NULL,
  generation_loss_id NOT NULL, current_revision NOT NULL,
  state NOT NULL, abandon_kind_code NOT NULL, semantic_digest NOT NULL,
  source_ref_digest NOT NULL, journal_digest NOT NULL,
  terminal NOT NULL CHECK(terminal IN (0,1)),
  head_revision NOT NULL CHECK(head_revision >= 1),
  PRIMARY KEY(run_id,agent_id,generation_loss_id),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      current_revision,state,abandon_kind_code,semantic_digest,
      source_ref_digest,journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      state,abandon_kind_code,semantic_digest,source_ref_digest,journal_digest),
  CHECK((terminal=1)=(state IN ('recovered-adopted','abandoned'))),
  CHECK((state='abandoned')=(abandon_kind_code<>'none'))
)

CREATE UNIQUE INDEX one_nonterminal_generation_loss_per_agent
  ON lifecycle_generation_loss_heads(run_id,agent_id)
  WHERE terminal=0;

lifecycle_custody_adoption_deliveries(
  run_id, agent_id, custody_id, ordinal, delivery_id,
  delivery_generation, recipient_agent_id, source_state, active_owner,
  PRIMARY KEY(run_id, agent_id, custody_id, ordinal),
  UNIQUE(run_id, agent_id, custody_id, delivery_id, delivery_generation),
  FOREIGN KEY(run_id, agent_id, custody_id)
    REFERENCES lifecycle_rotation_custodies(run_id, agent_id, custody_id)
)
CREATE UNIQUE INDEX one_nonfinal_custody_per_delivery_generation
  ON lifecycle_custody_adoption_deliveries(run_id, delivery_id,
    delivery_generation)
  WHERE active_owner = 1;

agent_lifecycle_recovery_capability_issues(
  issue_id, capability_hash, operator_id, project_id, project_session_id, run_id,
  agent_id, session_revision, session_generation, run_revision,
  recovery_source_kind, old_custody_id, old_action_adapter_id, old_action_id,
  old_custody_revision,
  generation_loss_id, generation_loss_revision,
  recovery_source_ref_digest, source_journal_digest,
  checkpoint_digest, source_provider_session_ref, source_capability_hash,
  source_custody_action_id, source_adapter_id, source_adapter_contract_digest,
  source_bridge_row_id, source_bridge_revision, source_provider_generation,
  source_principal_generation, source_bridge_generation,
  source_project_session_generation, source_run_generation,
  source_chair_lease_generation, bridge_owner_kind,
  parent_capability_id, consequential_gate_id,
  path CHECK(path='fresh-rotate'), issuance_json, issuance_digest,
  issued_at, expires_at,
  PRIMARY KEY(issue_id), UNIQUE(capability_hash), UNIQUE(issuance_digest),
  UNIQUE(issue_id,project_session_id,run_id,agent_id,
    recovery_source_kind,recovery_source_ref_digest,source_journal_digest),
  CHECK((recovery_source_kind='custody' AND old_custody_id IS NOT NULL AND
      old_custody_revision IS NOT NULL AND generation_loss_id IS NULL AND
      generation_loss_revision IS NULL) OR
    (recovery_source_kind='generation-loss' AND old_custody_id IS NULL AND
      old_custody_revision IS NULL AND generation_loss_id IS NOT NULL AND
      generation_loss_revision IS NOT NULL)),
  FOREIGN KEY(project_session_id,run_id,agent_id,old_custody_id,
      old_custody_revision,recovery_source_ref_digest,source_journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,
      source_ref_digest,journal_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      generation_loss_revision,recovery_source_ref_digest,source_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      source_ref_digest,journal_digest)
)

agent_lifecycle_recovery_source_heads(
  project_session_id NOT NULL, run_id NOT NULL, agent_id NOT NULL,
  recovery_source_kind NOT NULL CHECK(
    recovery_source_kind IN ('custody','generation-loss')),
  recovery_source_ref_digest NOT NULL,
  issue_id NOT NULL UNIQUE, source_journal_digest NOT NULL,
  head_revision NOT NULL CHECK(head_revision >= 1),
  PRIMARY KEY(project_session_id,run_id,agent_id,recovery_source_kind,
    recovery_source_ref_digest),
  UNIQUE(issue_id,project_session_id,run_id,agent_id,recovery_source_kind,
    recovery_source_ref_digest,source_journal_digest),
  FOREIGN KEY(issue_id,project_session_id,run_id,agent_id,recovery_source_kind,
      recovery_source_ref_digest,source_journal_digest)
    REFERENCES agent_lifecycle_recovery_capability_issues(
      issue_id,project_session_id,run_id,agent_id,recovery_source_kind,
      recovery_source_ref_digest,source_journal_digest)
)

agent_lifecycle_recovery_issue_revocations(
  issue_id PRIMARY KEY, revocation_kind CHECK(
    revocation_kind IN ('operator-revoked','source-stale')),
  evidence_digest, revoked_at,
  FOREIGN KEY(issue_id)
    REFERENCES agent_lifecycle_recovery_capability_issues(issue_id)
)

agent_lifecycle_recovery_retirements(
  retirement_id PRIMARY KEY, project_session_id, run_id, agent_id,
  retirement_plan_digest, custody_id, custody_revision,
  custody_source_ref_digest, custody_journal_digest, finalized_disposition,
  finalized_terminal_evidence_digest, admission_digest,
  transition_proof_digest, mutation_plan_digest, retirement_evidence_digest,
  retirement_effect_digest,
  receipt_batch_id UNIQUE, receipt_apply_id UNIQUE, receipt_apply_digest,
  retirement_json, retirement_digest UNIQUE, created_at,
  UNIQUE(retirement_id,receipt_batch_id,receipt_apply_id,receipt_apply_digest),
  UNIQUE(retirement_digest),
  FOREIGN KEY(retirement_id,receipt_apply_id,project_session_id,run_id,agent_id,
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
      retirement_plan_digest),
  FOREIGN KEY(receipt_batch_id,receipt_apply_id,project_session_id,run_id,agent_id,
      retirement_id,retirement_plan_digest,custody_id,custody_revision,
      custody_source_ref_digest,custody_journal_digest,finalized_disposition,
      finalized_terminal_evidence_digest,admission_digest,
      transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
      retirement_effect_digest)
    REFERENCES lifecycle_receipt_recovery_retirement_effects(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,retirement_id,
      retirement_plan_digest,custody_id,custody_revision,
      custody_source_ref_digest,custody_journal_digest,finalized_disposition,
      finalized_terminal_evidence_digest,admission_digest,
      transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
      effect_digest),
  FOREIGN KEY(receipt_apply_id,receipt_apply_digest,receipt_batch_id)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,receipt_batch_id)
    DEFERRABLE INITIALLY DEFERRED
)
~~~

`agent_lifecycle_recovery_source_heads` is the only mutable projection in the
issue path. It is a current-source linearization pointer, not issue status, and
it deliberately carries no copy of `issued_at` or `expires_at`: every time
predicate joins the immutable canonical issue. The daemon supplies canonical
millisecond-UTC issue, handoff and revocation times; a caller cannot supply or
backdate any of them.

Every issue, handoff and revocation writer uses `BEGIN IMMEDIATE`. The issue
`AFTER INSERT` trigger inserts its exact source head at revision one or replaces
the existing head with the current head's `head_revision+1` only when the old
issue has no handoff and either has a revocation or its canonical `expires_at`
is at or before the new issue's canonical `issued_at`. The replacement copies
only the new issue's exact candidate-key fields. A follow-up trigger assertion
requires the head to name `NEW.issue_id`; otherwise the whole issue transaction
aborts with `LIFECYCLE_RECOVERY_SOURCE_BUSY`.

Head `UPDATE` is trigger-owned. Its source primary key is immutable; its new
issue and source journal must resolve to the exact canonical issue; its revision
must advance by one; the new issue's canonical `(issued_at,issue_id)` tuple must
be strictly greater than the old issue's tuple and must be the latest immutable
issue tuple for that exact source; and its old issue must satisfy the same
canonical revoked-or-expired, no-handoff predicate. This monotone/latest guard
prevents direct SQL from rewinding a head to an older revoked or expired issue.
Head `DELETE` always aborts. These guards apply to direct SQL as well as daemon
writes.

Before a handoff insert, the immediate `issue_id` foreign key requires the
issue still to be the current source head. Reciprocal guards then reject an
existing revocation with `LIFECYCLE_RECOVERY_ISSUE_REVOKED` and reject a
canonical issue whose `expires_at` is at or before the daemon-authored handoff
`created_at` with `LIFECYCLE_RECOVERY_ISSUE_EXPIRED`. Before a revocation
insert, the reciprocal guard rejects an existing handoff with
`LIFECYCLE_RECOVERY_ISSUE_COMMIT_PENDING`. The immediate transaction serializes
issue/issue, handoff/revocation and revocation/handoff races; an application
pre-read is never authority.

Issue status remains a read projection: current unexpired head without handoff
or revocation is `active`; a handoff without its exact commit is
`commit-pending` regardless of later expiry; the exact commit is `consumed`; a
pre-handoff revocation is `revoked`; and an otherwise inactive issue at or past
canonical expiry is `expired`. `LifecycleDomainSnapshotV1` includes the closed
`recoverySourceHeads` set. Hydration requires one exact head for each active or
commit-pending issue, rejects every head/issue/source crossing, and permits a
legally replaced historical revoked or expired issue not to remain the head.

Lifecycle receipt persistence implements Spec 01 section 9.4.1 without a
mutable row that can disagree with its history. Custody and generation-loss
identity rows are immutable; every state edge appends one semantic/journal
revision and CASes the exact head to that foreign-keyed tuple. Revision one has
no predecessor, every successor names revision minus one and its journal digest,
and no terminal head accepts another successor. All shown tables are `STRICT`;
the generated DDL marks every field nonnull except the exact discriminator/null
arms shown here and in Spec 01. UPDATE/DELETE is denied for identity, revision,
batch, effect, intent, authority-receipt, checkpoint, authorization,
reservation, handoff, commit and apply rows. Only head pointers use guarded
UPDATE.

The receipt-scope head stores only its exact non-null checkpoint pointer;
authority, count, receipt head and ordered-set fields are always joined from
that checkpoint. The generation-loss head stores only the non-null revision,
state, abandon sentinel and immutable digest key needed for current/terminal
selection; nullable recovery action, custody and evidence fields are always
joined from the referenced revision. No mapper or query may read either removed
copied-head shape. The custody head retains its existing full revision pointer:
`disposition_code='none'` is its nonterminal non-null sentinel.

The TypeScript daemon validates closed RFC 8785 JCS, every Spec 01 domain-
separated digest, authority attestation and cross-object equality before opening
the write transaction. SQLite enforces identities, exact composite foreign keys,
arm nullability, monotonic revisions, legal edge/cardinality and immutable rows.
No trigger invokes a JavaScript hash UDF: production keeps
`PRAGMA trusted_schema=OFF`, so cryptographic validation cannot be delegated to
an unsafe/unavailable application-defined trigger function. Direct-SQL negative
fixtures still prove every relational and state invariant.

The prepare transaction locks the exact current head/source rows, verifies one
closed proof, and writes an immutable review reservation or fresh handoff first
when applicable. It then writes one immutable batch, its exact primary/optional
linked/optional secondary effects, and one or two immutable intents. The binding
order is reservation or handoff, batch, effects, intents; a fresh effect never
precedes its immediate-FK batch parent. The seven Spec 01 arms are exhaustive:
ordinary or adopted-review custody, terminal-fresh custody, standalone loss,
retirement, pure reuse-final fresh and pure open-loss fresh. Review and fresh
are mutually exclusive ordinal-two kinds. No lifecycle, provider, review, archive,
history, audit or issue-consumption mutation occurs before authority. No external
call occurs while SQLite is locked.

The completion `BEFORE INSERT` trigger proves the exact effect cardinality and
declared digests for the selected arm. Custody has one primary custody effect,
zero or one declared linked loss and only terminal-fresh has one secondary fresh
effect; standalone loss, retirement and pure fresh each have only their selected
primary effect. Every effect table rejects an insert after completion with
`lifecycle-effect-set-closed`. This makes completion an anti-extra fence as well
as membership proof; the daemon independently validates the canonical effect-set
digest without a trigger hash UDF.

The apply marker is the final statement. Its `BEFORE INSERT` guards require the
exact materialised revision(s), current head(s), fresh commit, retirement result
and review binding selected by the batch and effect rows; omission or crossing is
`lifecycle-apply-post-state-incomplete`. Child-to-apply FKs in custody/loss
revisions, review binding, fresh commit and retirement result are `DEFERRABLE
INITIALLY DEFERRED`; apply-to-batch, authorization, fresh effect and handoff FKs
remain immediate. No trigger creates a missing child.

The guard's witnesses are closed per arm: custody terminal requires its primary
effect's final revision carrying the exact batch/apply/apply-digest triple and a
head on that full revision tuple, plus the analogous declared linked loss;
standalone loss requires its primary effect/revision/head; retirement requires
the exact plan/effect/result/apply row; review requires the exact reservation,
ordinal-two receipt, decision-loss effect binding and apply; both fresh arms
require revision-one custody plus its exact head and commit; open-loss fresh
also requires its planned after revision/head, while terminal-fresh loss uses
the receipt batch's linked effect. Candidate-key uniqueness makes each `EXISTS`
witness exactly one.

The finalized custody candidate roots its exact
`finalized_terminal_evidence_digest`. The immutable plan binds that root with
the other four values into the nonnull tuple
`(finalized_terminal_evidence_digest,admission_digest,
transition_proof_digest,mutation_plan_digest,retirement_evidence_digest)`;
effect and result equality-copy the entire plan tuple. Proof/plan JSON remains
only in the immutable plan; no application-only join may restore a missing
evidence member.

For `terminal-fresh`, the completion/effect and handoff/apply/commit loss arms
are biconditional. A `none` sentinel requires no linked effect and all loss
members null. A non-`none` sentinel must equal the after source digest and the
one declared linked effect, materialised revision and exact head; the opposite
two crossed cases abort with `lifecycle-terminal-fresh-linked-loss-crossed`.

The worker point-reads before append, appends only on authoritative absence and
point-reads again after a return, throw or timeout. Exact verified results insert
separate immutable `lifecycle_authority_receipts`; intent rows never mutate.
Once all declared receipts belong to one verified pinned scope checkpoint, one
`lifecycle_receipt_batch_authorizations` row is inserted. The apply transaction
then equality-checks the current journal and complete semantic write/effect set,
appends final revision journal(s), advances exact heads, performs every reserved
review/archive/fresh write and inserts one `lifecycle_transition_applies` row.
Derived state is prepared, authority-complete or applied from child-row
existence; no state column duplicates it. Exact pre-state or exact post-state
replay succeeds; any third state fails integrity. Provider no-effect/history/
audit and linked loss state are never changed before apply.

Hydration is read-only and starts at the authenticated project namespace, not
local custody rows. It resolves every historical scope checkpoint named by that
pinned namespace, pages each immutable checkpoint through the 256-row API and
reconciles the exact external set against local pending/applied intents. Whole-
custody/run deletion, extra external rows, missing committed receipts, chain/
head/count/set drift, crossed authority or invalid attestation is
`SNAPSHOT_INVALID`. A pending intent alone may be externally absent. Only after
successful hydration may `LifecycleReceiptRecoveryService` resume append or
apply; point lookup is response-loss recovery, never completeness proof.

Before hydration, startup drains every immutable scope-admission outbox through
idempotent `admitScope`, proves its zero checkpoint and pinned zero namespace
member, and finalises admitted scope, checkpoint, canonical head and resolution
in one deferred-FK transaction. An unresolved outbox is `RECOVERY_PENDING`, not
hydration work. Hydration never calls admission or writes a resolution; every
admitted scope and active outbox/resolution crossing is reconciled from the
mandatory snapshot arrays.

The review reservation is immutable and has no batch back-pointer or mutable
consumed state; its exact batch points one way to it and the apply proves
consumption. Its confirmed generation-loss outcome names a prepared linked
effect through the batch's nonnull effect-key sentinel, not a future semantic
revision; a missing or crossed effect fails the prepare commit. It freezes
decision/cut/high-water/predecessor at the adoption
linearization point while permitting later provider terminals as post-cut.
Review cut, successor binding and rebind receipt equality-copy the decision and
ordinal-two external receipt; recovery never rereads later high-water or re-
enters the review owner.

Fresh preparation and handoff are immutable. A nonfinal awaiting-boundary/
prepared custody with zero dispatch uses `fresh-handoff-superseded`: the source
and issue remain unchanged while its custody-terminal batch is pending, then one
`terminal-fresh` apply finalizes the source, creates new custody revision one,
inserts the commit and derives issue consumption. A finalized custody or open
generation loss uses one `fresh-origin` batch and authorized `fresh` apply from
the same handoff; the loss moves to recovery-in-progress, not terminal. Every
new custody revision one is therefore downstream of exactly one fresh receipt.
Issue state is derived as active, commit-
pending, consumed, revoked or expired; a handoff freezes later revoke/expiry.
Composite keys enforce the preparation/handoff/commit/issue/source/custody/
action bijection and both source arms without nullable-FK vacuity.

Every copied kind, effect key, sentinel and equality-only after/effect identity
introduced for these relational checks is absent from canonical JSON, RFC 8785
JCS, digest preimages, receipt subjects, transition replay, mutation/fresh plans
and exports. They are constrained projections of existing canonical members;
crossing one fails SQL while serialization bytes remain unchanged.

Verification mutates every proof arm and arm discriminator; faults each
prepare/append/reread/receipt/checkpoint/authorization/apply statement; injects
success-then-throw, invalid attestation and live-head advance during pinned
paging; deletes whole custody/run histories; advances review high-water after
reservation; and crosses request, semantic/journal revision, source, linked loss,
issue, preparation, handoff, commit, decision, cut, effect, receipt and apply.
Every changed-input replay fails for the right reason.

Context observation classification is closed: `generation-advance`, `context-
advance`, `replay` or `reordered-observation`. Adapter input is a positive
provider generation plus nonnegative normalised context revision and stable
source event ID/evidence digest. Natural uniqueness makes replay return the one
existing classification/audit row and bounds audit growth. The high-
water trigger accepts equal replay, requires strict revision increase for
same-generation context-advance, and makes a lower generation or lower same-
generation revision append audit only with no high-water/lifecycle change. A
greater provider generation creates generation-advance regardless of context
revision and installs that generation's baseline. Final CAS repeats the order.
Only provider/context high-water moves from this telemetry. Principal and bridge
high-water move solely from authenticated daemon custody reservation/adoption
tuples; provider integers cannot infer either authority generation.

`abandon_kind_code` is the nonnull sentinel `none` outside terminal abandoned.
Direct `open -> abandoned`
requires `direct-open` and both recovery-action columns null. Abandon from
recovery-in-progress requires `recovery-attempt` and a complete global provider
action pair equal to the active recovery custody. Recovered-adopted and every
nonterminal state require `none`. Composite CHECK/foreign keys reject
half-null, crossed adapter/action and invented direct-open actions.
`lifecycle_generation_loss_revisions` has no free terminal-disposition column:
public disposition is derived exactly from state plus abandon kind. Custody
`disposition_code` is `none` before finalized and exactly one closed terminal
value at finalized; journal/head triggers enforce the Spec 01 edge table. Partial unique
indexes prevent a second nonfinal custody or nonterminal loss for one agent.

Adoption-delivery history is unique inside its custody. `active_owner=1` only
while that custody is nonfinal; terminalisation flips it to zero in the same
transaction. The partial index permits only one nonfinal custody to own a
delivery/generation, while a later retry may reinsert the same predecessor under
its new custody without deleting immutable history.

No delivery schema/state is added. `successor-pending` is the pure joined
projection for which delivery state is `ready`, delivery recipient equals the
agent, and the active lifecycle-delivery owner is exactly one of: a nonfinal
custody, a standalone open generation loss, or a recovery-in-progress loss
whose `active_recovery_custody_id` exactly names that nonfinal custody. A
standalone recovery-in-progress loss or crossed/multiple unrelated rows is an
integrity failure and remains claim-fenced. The existing recipient/state/
sequence and lifecycle-owner indexes serve it. Mailbox/operator reads expose that row as
stored state ready plus routing disposition successor-pending; receipt ready
counts include it and no successor-pending counter exists. Claim reuses the
same predicate under its CAS. Adoption finalises custody and any linked loss
without mutating the ready delivery, clearing the disposition and making it claimable; abandon
updates every matching ready row to abandoned with reason/watermark before
finalising custody. Enqueue before/after the delivery cut needs no extra field.

Identity, bridge and per-provider-generation context high-water rows plus
custody identity/source/checkpoint/target fields are
immutable except through their named CAS transactions. Custody target
provider/principal generations are each the prior run/agent-global high-water
plus one; target bridge is the prior run/agent/owner-kind bridge high-water plus
one. Each high-water increments in the reservation transaction. A superseded,
quarantined or abandoned attempt does not return a number. Activation equality-
CASes the exact provider-session, capability/action, adapter/contract and bridge
row/revision snapshots plus, for a true chair, exact project-session/run/chair-
lease generations. It then installs the reserved targets. Source-plus-one,
skipped, reused or crossed-owner values fail.

Self-request carries no turn ID. The transaction first commits delivery claim-
expiry/reclaim and membership/delivery-watermark housekeeping, then derives one active caller turn from the
authenticated capability plus current bridge/provider generations. Zero,
multiple, foreign or quarantined matches reject, as does any second active or
quarantined predecessor. Terminal predecessor states are released and revoked.
It then changes every active agent-owned write lease to
lifecycle-quarantined before computing the checkpoint/precondition digest;
fences claims, records delivery_cut_watermark, captures only claimed predecessor
delivery IDs/generations in adoption_delivery_set_digest, and captures the exact
daemon-validated checkpoint, `open_work_set_digest` and all other revision/set
digests. Open work includes every nonterminal request-result obligation and its
revision, including provider-accepted/unconsumed callbacks;
rechecks the post-housekeeping lease/freeze set; inserts custody; fences new
claims/turns; sets suspended; and commits accepted-suspended without adapter
I/O. Exact replay returns that immutable receipt; current lifecycle is a read.
Every delivery-claim transaction performs the same expiry/reclaim/watermark
housekeeping and rechecks lifecycle freeze immediately before its claim CAS.
The request transaction inserts the exact claimed rows into
lifecycle_custody_adoption_deliveries with contiguous ordinals/source state;
their canonical digest must equal adoption_delivery_set_digest. Adoption CASes
those foreign-keyed IDs/generations, never a fresh query over current claims.

Delivery enqueue remains durable, but ready/unclaimed rows at the cut and later
enqueues are successor-pending and excluded from checkpoint/precondition/
adoption digests. They cannot stale rotation; adoption makes the same rows
claimable without replay. Delivery claim/ack and write acquisition are trigger-
denied while custody owns the agent. The old grant
may finish only the captured lifecycle call and bounded reads. The staged grant
exposes only the existing launch.attest descriptor bound to custody/action,
challenge and checkpoint/open-work vector. Every other agent/task/mailbox/authority/
write/turn/barrier mutation is denied.

Triggers implement exactly the Spec 01 state-edge table and dispositions
adopted, no-effect, quarantined, superseded and abandoned. No state may skip an
edge. awaiting-boundary waits for the captured caller and every predecessor
turn to reach a terminal status at its exact generation. An operator-created
fresh rotation stores null caller turn and is not inserted until every
predecessor is terminal. Predispatch no-effect needs the durable zero-dispatch
journal. Postdispatch no-effect needs the activated adapter contract's
authenticated closed proof; timeout or absence never suffices.

Final no-effect/superseded transactions revoke the staged replacement, clear
only this custody's freeze-owner rows, retain the valid predecessor and set the
agent ready. Quarantined finalisation retains its freeze-owner rows, keeps the
agent suspended and sets recovery-required. Abandon uses the archival owner
below. Generic Resume cannot execute any of these exits.

Rotation dispatch always creates a distinct provider context under the new
action/custody. Same-history attach/resume is accepted only by crash recovery
for the same custody and cannot satisfy rotation. The adopted bridge receives
only the bounded canonical checkpoint/handoff after commit; no predecessor
transcript or hidden provider history is copied.

Dispatch marks the one-time volatile handoff before I/O. The replacement
session answers challenge and checkpoint/task/mailbox/child/open-work vector through
launch.attest. The daemon verifies and retains the exact successor volatile
bridge before beginning the final database CAS. Adoption rechecks custody,
source/high-water targets and every precondition, inserts provider lineage,
swaps a child through agent_bridge_state or a chair through
launched_chair_bridge_state, activates the staged capability, revokes the old
principal/capability, transfers the exact open-work obligations unchanged and
sets ready. Postcommit cleanup retires the exact old
volatile bridge; a crash-left transport has no credential authority. Existing
write leases remain lifecycle-quarantined. A true-chair adoption captures the
review certification cut and performs same-subject binding rebind-or-stale in
the same serialization point. Review actions/ambiguity never block or roll back
adoption; old actions retain their normal recovery owner.

LifecycleRotationRecoveryService runs before and excludes lifecycle-linked
rows from every generic provider-action/bridge recovery query.
awaiting-boundary/prepared performs no adapter call and can close no-effect only
from the zero-dispatch journal. dispatched/accepted/ambiguous permits at most
one pair lookup. Exact launch.attest terminal proof may resume adoption; closed
no-effect closes; drift supersedes; malformed/crossed/conflicting proof
quarantines. No path dispatches, redispatches, reconstructs a secret or treats
a resume reference as continuity. Checkpoint A can never adopt B; B reserves a
new action/capability/challenge and new high-water targets.

The generation-loss table is the second explicit lifecycleRecoverySourceV1
arm; custody and loss foreign keys are exclusive/non-null by discriminator.
loss_kind is generation-advance (new provider generation > old) or context-
advance (new provider generation equals old and new context revision is
strictly greater than old).
Generation-advance wins when provider and context both change, so one
observation has one canonical loss ID. checkpoint
state is absent, invalid or last-validated; ref/digest are non-null iff last-
validated. Detection requires no active custody, inserts open loss, fences the
source, and ratchets only provider/context high-water from the observation.
Principal/bridge high-water changes only under authenticated custody/adoption
CAS inputs, never by comparing provider telemetry. Generic scans exclude it.
Capability issuance equality-copies every immutable loss source action,
adapter/contract, principal/bridge/owner and chair session/run/lease field; it
never late-resolves a mutable bridge/session join.

Loss edges are open -> recovery-in-progress -> recovered-adopted|abandoned,
recovery-in-progress -> open and direct open -> abandoned.
Fresh custody no-effect/quarantine/supersession returns it to open with attempt
history; only adopted custody terminalises recovered and clears freezes.
Absent/invalid checkpoint permits fresh rotation only after the read-only
recovery-checkpoint validator binds an existing daemon-valid artifact; otherwise
only abandon is reachable. Direct-open abandon persists null recovery action;
attempted-recovery abandon persists its exact adapter/action pair. The recovery
capability/intent/retirement rows bind the exact custody-or-loss union and
phase-B CAS its revision.

Lifecycle remains the sole recovery owner for a rotating true chair until
adoption or confirmed abandon. The chair-loss scanner excludes a nonfinal
custody, open generation loss and finalized nonadopted lifecycle-recovery marker and creates no
chair_bridge_loss row. Child custody cannot update chair tables.

The private local issuer for agent-lifecycle-recovery-takeover requires the
same local subject's current session capability containing
agent-lifecycle-recovery-issue plus one independently attested consequential
gate bound to the exact recovery, validates the complete row binding above and
returns plaintext once while persisting only its hash. Its derived statuses are
active, commit-pending, consumed, revoked and expired; no mutable status column
duplicates the issue/handoff/commit/revocation facts. The narrow issue authorises only fresh-rotate;
generic session or takeover capabilities cannot reach Commit.
agent-lifecycle-recovery intent rows additionally bind path, exact replacement
adapter/activated contract/distinct canonical action pair, current daemon-validated checkpoint
row/vector and proposed high-water reservation. Preview changes no lifecycle
or provider state. Fresh-rotate Commit first persists the immutable handoff. A
nonfinal zero-dispatch predecessor becomes commit-pending until its externally
authorized terminal-fresh apply atomically supersedes it and inserts the
distinct null-caller awaiting-boundary custody/commit. A finalized custody or
open loss uses its authorized `fresh-origin` receipt batch and fresh apply;
finalized rows are never mutated and the open loss moves to
recovery-in-progress. Commit performs no provider call.

abandon instead requires exact session cancel authority, a consequential gate
and independent destructive direct-human attestation. It first prepares the
exact terminal batch; only post-authority apply moves a nonfinal custody through
abandoned or preserves a finalized custody
and inserts agent_lifecycle_recovery_retirements; an open loss takes direct-open
abandon with no recovery pair, while a recovery-in-progress loss takes recovery-
attempt abandon with its exact pair. It archives the agent; revokes
old/staged capability, principal and bridge; terminally revokes turns; and
moves lifecycle-quarantined write leases to revoked-abandoned. It terminally
abandons every owned or sole-recipient ready/claimed delivery, task owner lease,
required-result obligation and membership with reason; advances message/
delivery membership watermarks; terminalises dependent owned barriers as
abandoned-failure; appends grant revocations without changing immutable
authority envelopes; and clears only exact freeze contributions whose owners
are terminal. No required delivery/barrier is orphaned. Child abandon preserves
unrelated run work and moves affected parents to explicit failure/recovery;
chair abandon enters the existing run/session cancel-failure terminal path
atomically. Status returns intent, issue and custody state; Reconcile pair-looks
up only a new dispatched action. Generic Resume cannot mutate these rows.

Verification covers schema/catalogue and every legal/illegal state edge and
transaction crash; unique self-turn inference and operator null-caller
boundary; housekeeping/quarantine/delivery-cut ordering; successor-pending
stored-as-ready state/count and enqueue without adoption starvation versus
claim/ack fencing for custody, open loss and exact linked loss/custody owners;
adoption/abandon and crossed/multiple-owner negatives; old/staged
operation negatives; accepted/current-read separation;
global identity/owner-scoped bridge high-water A-to-B nonreuse and exact source/
target final CAS; launch.attest attribution;
retained-successor-before-CAS, child/chair table swap and postcommit retirement;
predispatch versus advertised postdispatch no-effect; sole-chair lifecycle
ownership and generic recovery exclusion. Operator fixtures cover capability
parent issuance grant/gate/revoke/consume, fresh adapter/contract/action/
checkpoint binding, finalized-custody immutability, exact abandon delivery/
watermark/barrier transitions and generic-resume/chair-loss negatives.
Generation-loss fixtures cover both loss kinds, every checkpoint state,
simultaneous provider/context advance classified once as generation-advance,
restart replay, lower generation, lower same-generation revision, arbitrary
forward context jump, strict context inequality and observed high-water
ratchet; custody-or-loss foreign keys, recovery/adopt/reopen/direct-open versus
recovery-attempt abandon edges/action-pair nullability and absent/null/generic-
resume negatives. No code in
this amendment adds automatic pressure, successor selection or research-only
routing policy.

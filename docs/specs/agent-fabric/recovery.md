# Agent Fabric recovery and reconciliation

## Recovery relations and integrity guards

~~~sql
lifecycle_generation_loss_heads(
  project_session_id NOT NULL, run_id NOT NULL, agent_id NOT NULL,
  generation_loss_id NOT NULL,
  current_revision NOT NULL CHECK(current_revision >= 1),
  state NOT NULL, abandon_kind_code NOT NULL,
  semantic_digest NOT NULL, source_ref_digest NOT NULL, journal_digest NOT NULL,
  terminal NOT NULL CHECK(terminal IN (0,1)),
  head_revision NOT NULL CHECK(head_revision >= 1),
  PRIMARY KEY(run_id,agent_id,generation_loss_id),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      current_revision,state,abandon_kind_code,semantic_digest,
      source_ref_digest,journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,state,
      abandon_kind_code,semantic_digest,source_ref_digest,journal_digest),
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
  recovery_source_ref_digest NOT NULL, issue_id NOT NULL,
  source_journal_digest NOT NULL,
  head_revision NOT NULL CHECK(head_revision >= 1),
  PRIMARY KEY(project_session_id,run_id,agent_id,recovery_source_kind,
    recovery_source_ref_digest),
  UNIQUE(project_session_id,run_id,agent_id,recovery_source_kind,
    recovery_source_ref_digest,issue_id,source_journal_digest),
  UNIQUE(issue_id),
  FOREIGN KEY(issue_id,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,
      source_journal_digest)
    REFERENCES agent_lifecycle_recovery_capability_issues(
      issue_id,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,
      source_journal_digest)
)

agent_lifecycle_recovery_issue_revocations(
  issue_id PRIMARY KEY, revocation_kind CHECK(
    revocation_kind IN ('operator-revoked','source-stale')),
  evidence_digest, revoked_at,
  FOREIGN KEY(issue_id)
    REFERENCES agent_lifecycle_recovery_capability_issues(issue_id)
)

CREATE TRIGGER lifecycle_recovery_issue_claim_source
AFTER INSERT ON agent_lifecycle_recovery_capability_issues
BEGIN
  INSERT INTO agent_lifecycle_recovery_source_heads(
    project_session_id,run_id,agent_id,recovery_source_kind,
    recovery_source_ref_digest,issue_id,source_journal_digest,head_revision)
  SELECT
    NEW.project_session_id,NEW.run_id,NEW.agent_id,NEW.recovery_source_kind,
    NEW.recovery_source_ref_digest,NEW.issue_id,NEW.source_journal_digest,1
  WHERE NOT EXISTS (
    SELECT 1 FROM agent_lifecycle_recovery_source_heads AS head
    WHERE head.project_session_id=NEW.project_session_id
      AND head.run_id=NEW.run_id
      AND head.agent_id=NEW.agent_id
      AND head.recovery_source_kind=NEW.recovery_source_kind
      AND head.recovery_source_ref_digest=NEW.recovery_source_ref_digest);

  UPDATE agent_lifecycle_recovery_source_heads
  SET
    issue_id=NEW.issue_id,
    source_journal_digest=NEW.source_journal_digest,
    head_revision=agent_lifecycle_recovery_source_heads.head_revision+1
  WHERE project_session_id=NEW.project_session_id
    AND run_id=NEW.run_id
    AND agent_id=NEW.agent_id
    AND recovery_source_kind=NEW.recovery_source_kind
    AND recovery_source_ref_digest=NEW.recovery_source_ref_digest
    AND issue_id<>NEW.issue_id
    AND NOT EXISTS (
      SELECT 1 FROM lifecycle_fresh_recovery_handoffs AS handoff
      WHERE handoff.issue_id=
        agent_lifecycle_recovery_source_heads.issue_id)
    AND (
      EXISTS (
        SELECT 1 FROM agent_lifecycle_recovery_issue_revocations AS revocation
        WHERE revocation.issue_id=
          agent_lifecycle_recovery_source_heads.issue_id)
      OR EXISTS (
        SELECT 1
        FROM agent_lifecycle_recovery_capability_issues AS old_issue
        WHERE old_issue.issue_id=
            agent_lifecycle_recovery_source_heads.issue_id
          AND old_issue.expires_at<=NEW.issued_at));

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM agent_lifecycle_recovery_source_heads AS head
    WHERE head.project_session_id=NEW.project_session_id
      AND head.run_id=NEW.run_id
      AND head.agent_id=NEW.agent_id
      AND head.recovery_source_kind=NEW.recovery_source_kind
      AND head.recovery_source_ref_digest=NEW.recovery_source_ref_digest
      AND head.issue_id=NEW.issue_id)
  THEN RAISE(ABORT,'LIFECYCLE_RECOVERY_SOURCE_BUSY') END;
END;

CREATE TRIGGER lifecycle_recovery_source_head_reinsert_denied
BEFORE INSERT ON agent_lifecycle_recovery_source_heads
WHEN EXISTS (
    SELECT 1 FROM agent_lifecycle_recovery_source_heads AS head
    WHERE (head.project_session_id=NEW.project_session_id
        AND head.run_id=NEW.run_id
        AND head.agent_id=NEW.agent_id
        AND head.recovery_source_kind=NEW.recovery_source_kind
        AND head.recovery_source_ref_digest=NEW.recovery_source_ref_digest)
      OR head.issue_id=NEW.issue_id)
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_SOURCE_HEAD_REINSERT_DENIED');
END;

CREATE TRIGGER lifecycle_recovery_source_head_update_guard
BEFORE UPDATE ON agent_lifecycle_recovery_source_heads
WHEN NEW.project_session_id<>OLD.project_session_id
  OR NEW.run_id<>OLD.run_id
  OR NEW.agent_id<>OLD.agent_id
  OR NEW.recovery_source_kind<>OLD.recovery_source_kind
  OR NEW.recovery_source_ref_digest<>OLD.recovery_source_ref_digest
  OR NEW.issue_id=OLD.issue_id
  OR NEW.head_revision<>OLD.head_revision+1
  OR EXISTS (
    SELECT 1 FROM lifecycle_fresh_recovery_handoffs AS handoff
    WHERE handoff.issue_id=OLD.issue_id)
  OR NOT EXISTS (
    SELECT 1
    FROM agent_lifecycle_recovery_capability_issues AS new_issue
    WHERE new_issue.issue_id=NEW.issue_id
      AND new_issue.project_session_id=NEW.project_session_id
      AND new_issue.run_id=NEW.run_id
      AND new_issue.agent_id=NEW.agent_id
      AND new_issue.recovery_source_kind=NEW.recovery_source_kind
      AND new_issue.recovery_source_ref_digest=NEW.recovery_source_ref_digest
      AND new_issue.source_journal_digest=NEW.source_journal_digest)
  OR NOT EXISTS (
    SELECT 1
    FROM agent_lifecycle_recovery_capability_issues AS old_issue
    JOIN agent_lifecycle_recovery_capability_issues AS new_issue
      ON new_issue.issue_id=NEW.issue_id
    WHERE old_issue.issue_id=OLD.issue_id
      AND (new_issue.issued_at>old_issue.issued_at
        OR (new_issue.issued_at=old_issue.issued_at
          AND new_issue.issue_id>old_issue.issue_id)))
  OR EXISTS (
    SELECT 1
    FROM agent_lifecycle_recovery_capability_issues AS later_issue
    JOIN agent_lifecycle_recovery_capability_issues AS new_issue
      ON new_issue.issue_id=NEW.issue_id
    WHERE later_issue.project_session_id=NEW.project_session_id
      AND later_issue.run_id=NEW.run_id
      AND later_issue.agent_id=NEW.agent_id
      AND later_issue.recovery_source_kind=NEW.recovery_source_kind
      AND later_issue.recovery_source_ref_digest=
        NEW.recovery_source_ref_digest
      AND (later_issue.issued_at>new_issue.issued_at
        OR (later_issue.issued_at=new_issue.issued_at
          AND later_issue.issue_id>new_issue.issue_id)))
  OR NOT (
    EXISTS (
      SELECT 1 FROM agent_lifecycle_recovery_issue_revocations AS revocation
      WHERE revocation.issue_id=OLD.issue_id)
    OR EXISTS (
      SELECT 1
      FROM agent_lifecycle_recovery_capability_issues AS old_issue
      JOIN agent_lifecycle_recovery_capability_issues AS new_issue
        ON new_issue.issue_id=NEW.issue_id
      WHERE old_issue.issue_id=OLD.issue_id
        AND old_issue.expires_at<=new_issue.issued_at))
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_SOURCE_BUSY');
END;

CREATE TRIGGER lifecycle_recovery_source_head_delete_guard
BEFORE DELETE ON agent_lifecycle_recovery_source_heads
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_SOURCE_HEAD_DELETE_DENIED');
END;

CREATE TRIGGER lifecycle_recovery_handoff_guard
BEFORE INSERT ON lifecycle_fresh_recovery_handoffs
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM agent_lifecycle_recovery_issue_revocations AS revocation
    WHERE revocation.issue_id=NEW.issue_id)
  THEN RAISE(ABORT,'LIFECYCLE_RECOVERY_ISSUE_REVOKED') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM agent_lifecycle_recovery_capability_issues AS issue
    WHERE issue.issue_id=NEW.issue_id
      AND issue.expires_at<=NEW.created_at)
  THEN RAISE(ABORT,'LIFECYCLE_RECOVERY_ISSUE_EXPIRED') END;
END;

CREATE TRIGGER lifecycle_recovery_handoff_reinsert_denied
BEFORE INSERT ON lifecycle_fresh_recovery_handoffs
WHEN EXISTS (
  SELECT 1 FROM lifecycle_fresh_recovery_handoffs AS handoff
  WHERE handoff.handoff_id=NEW.handoff_id OR handoff.issue_id=NEW.issue_id)
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_HANDOFF_REINSERT_DENIED');
END;

CREATE TRIGGER lifecycle_recovery_revocation_guard
BEFORE INSERT ON agent_lifecycle_recovery_issue_revocations
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM lifecycle_fresh_recovery_handoffs AS handoff
    WHERE handoff.issue_id=NEW.issue_id)
  THEN RAISE(ABORT,'LIFECYCLE_RECOVERY_ISSUE_COMMIT_PENDING') END;
END;

CREATE TRIGGER lifecycle_recovery_revocation_reinsert_denied
BEFORE INSERT ON agent_lifecycle_recovery_issue_revocations
WHEN EXISTS (
  SELECT 1 FROM agent_lifecycle_recovery_issue_revocations AS revocation
  WHERE revocation.issue_id=NEW.issue_id)
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_REVOCATION_REINSERT_DENIED');
END;

CREATE TRIGGER lifecycle_recovery_issue_update_denied
BEFORE UPDATE ON agent_lifecycle_recovery_capability_issues
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_ISSUE_IMMUTABLE');
END;

CREATE TRIGGER lifecycle_recovery_issue_delete_denied
BEFORE DELETE ON agent_lifecycle_recovery_capability_issues
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_ISSUE_IMMUTABLE');
END;

CREATE TRIGGER lifecycle_recovery_handoff_update_denied
BEFORE UPDATE ON lifecycle_fresh_recovery_handoffs
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_HANDOFF_IMMUTABLE');
END;

CREATE TRIGGER lifecycle_recovery_handoff_delete_denied
BEFORE DELETE ON lifecycle_fresh_recovery_handoffs
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_HANDOFF_IMMUTABLE');
END;

CREATE TRIGGER lifecycle_recovery_revocation_update_denied
BEFORE UPDATE ON agent_lifecycle_recovery_issue_revocations
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_REVOCATION_IMMUTABLE');
END;

CREATE TRIGGER lifecycle_recovery_revocation_delete_denied
BEFORE DELETE ON agent_lifecycle_recovery_issue_revocations
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_REVOCATION_IMMUTABLE');
END;

The source-head row is the sole current-issue pointer for one immutable
`(project_session_id,run_id,agent_id,recovery_source_kind,
recovery_source_ref_digest)` source. It does not copy issue clocks. A replacement
may advance the head only when the current issue has no handoff and is revoked,
or its authoritative `expires_at` is at or before the replacement's `issued_at`.
The new issue's canonical `(issued_at,issue_id)` tuple must be strictly greater
than the current tuple, and `head_revision` advances by exactly one. Handoffs
reference `agent_lifecycle_recovery_source_heads(issue_id)`, so an old issue
cannot commit after replacement. Issue, handoff, revocation and source-head rows
are immutable except for that guarded monotonic head advance.
Issue claim uses a plain insert-if-absent followed by the guarded monotonic
`UPDATE`; it never uses UPSERT or `INSERT OR REPLACE`. Existing source heads,
handoffs and revocations reject every colliding insert before SQLite can apply
replacement semantics, independently of `recursive_triggers`.

Every issue, handoff and revocation writer uses `BEGIN IMMEDIATE` before its
first read or write and retains the writer transaction through commit. This
makes the claim, replacement, handoff and revocation guards observe the prior
committed winner rather than independently accepting crossed decisions.

agent_lifecycle_recovery_retirements(
  retirement_id NOT NULL PRIMARY KEY, project_session_id NOT NULL,
  run_id NOT NULL, agent_id NOT NULL, retirement_plan_digest NOT NULL,
  custody_id NOT NULL, custody_revision NOT NULL,
  custody_source_ref_digest NOT NULL, custody_journal_digest NOT NULL,
  finalized_disposition NOT NULL,
  finalized_terminal_evidence_digest NOT NULL, admission_digest NOT NULL,
  transition_proof_digest NOT NULL, mutation_plan_digest NOT NULL,
  retirement_evidence_digest NOT NULL,
  retirement_effect_digest NOT NULL,
  receipt_batch_id NOT NULL UNIQUE, receipt_apply_id NOT NULL UNIQUE,
  receipt_apply_digest NOT NULL, retirement_json NOT NULL,
  retirement_digest NOT NULL UNIQUE, created_at NOT NULL,
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

CREATE TRIGGER lifecycle_completion_effect_set_exact
BEFORE INSERT ON lifecycle_receipt_batch_completions
BEGIN
  SELECT RAISE(ABORT,'lifecycle-effect-set-incomplete')
  WHERE NOT (
    (NEW.transition_kind='custody-terminal' AND
      NEW.primary_custody_effect_digest IS NOT NULL AND
      NEW.primary_loss_effect_role IS NULL AND
      NEW.primary_loss_effect_digest IS NULL AND
      NEW.primary_retirement_effect_digest IS NULL AND
      (SELECT count(*) FROM lifecycle_receipt_custody_effects
        WHERE batch_id=NEW.batch_id)=1 AND
      EXISTS (SELECT 1 FROM lifecycle_receipt_custody_effects
        WHERE batch_id=NEW.batch_id AND
          effect_digest=NEW.primary_custody_effect_digest) AND
      (SELECT count(*) FROM lifecycle_receipt_recovery_retirement_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      ((NEW.secondary_fresh_effect_digest IS NULL AND
          (SELECT count(*) FROM lifecycle_receipt_fresh_origin_effects
            WHERE batch_id=NEW.batch_id)=0) OR
        (NEW.secondary_fresh_effect_ordinal=2 AND
          NEW.secondary_fresh_effect_role='secondary' AND
          NEW.secondary_fresh_effect_digest IS NOT NULL AND
          (SELECT count(*) FROM lifecycle_receipt_fresh_origin_effects
            WHERE batch_id=NEW.batch_id)=1 AND
          EXISTS (SELECT 1 FROM lifecycle_receipt_fresh_origin_effects
            WHERE batch_id=NEW.batch_id AND ordinal=2 AND role='secondary' AND
              effect_digest=NEW.secondary_fresh_effect_digest))) AND
      ((NEW.linked_loss_effect_role IS NULL AND
          NEW.linked_loss_effect_digest IS NULL AND
          (SELECT count(*) FROM lifecycle_receipt_generation_loss_effects
            WHERE batch_id=NEW.batch_id)=0) OR
        (NEW.linked_loss_effect_role='linked' AND
          NEW.linked_loss_effect_digest IS NOT NULL AND
          (SELECT count(*) FROM lifecycle_receipt_generation_loss_effects
            WHERE batch_id=NEW.batch_id)=1 AND
          EXISTS (SELECT 1 FROM lifecycle_receipt_generation_loss_effects
            WHERE batch_id=NEW.batch_id AND role='linked' AND
              effect_digest=NEW.linked_loss_effect_digest)))) OR
    (NEW.transition_kind='generation-loss-terminal' AND
      NEW.primary_custody_effect_digest IS NULL AND
      NEW.primary_loss_effect_role='primary' AND
      NEW.primary_loss_effect_digest IS NOT NULL AND
      NEW.primary_retirement_effect_digest IS NULL AND
      NEW.linked_loss_effect_role IS NULL AND
      NEW.linked_loss_effect_digest IS NULL AND
      (SELECT count(*) FROM lifecycle_receipt_custody_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_generation_loss_effects
        WHERE batch_id=NEW.batch_id)=1 AND
      EXISTS (SELECT 1 FROM lifecycle_receipt_generation_loss_effects
        WHERE batch_id=NEW.batch_id AND role='primary' AND
          effect_digest=NEW.primary_loss_effect_digest) AND
      (SELECT count(*) FROM lifecycle_receipt_recovery_retirement_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_fresh_origin_effects
        WHERE batch_id=NEW.batch_id)=0) OR
    (NEW.transition_kind='custody-recovery-retirement' AND
      NEW.primary_custody_effect_digest IS NULL AND
      NEW.primary_loss_effect_role IS NULL AND
      NEW.primary_loss_effect_digest IS NULL AND
      NEW.primary_retirement_effect_digest IS NOT NULL AND
      NEW.linked_loss_effect_role IS NULL AND
      NEW.linked_loss_effect_digest IS NULL AND
      (SELECT count(*) FROM lifecycle_receipt_custody_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_generation_loss_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_recovery_retirement_effects
        WHERE batch_id=NEW.batch_id)=1 AND
      EXISTS (SELECT 1 FROM lifecycle_receipt_recovery_retirement_effects
        WHERE batch_id=NEW.batch_id AND
          effect_digest=NEW.primary_retirement_effect_digest) AND
      (SELECT count(*) FROM lifecycle_receipt_fresh_origin_effects
        WHERE batch_id=NEW.batch_id)=0) OR
    (NEW.transition_kind='fresh-origin' AND
      NEW.primary_custody_effect_digest IS NULL AND
      NEW.primary_loss_effect_role IS NULL AND
      NEW.primary_loss_effect_digest IS NULL AND
      NEW.primary_retirement_effect_digest IS NULL AND
      NEW.linked_loss_effect_role IS NULL AND
      NEW.linked_loss_effect_digest IS NULL AND
      NEW.primary_fresh_effect_ordinal=1 AND
      NEW.primary_fresh_effect_role='primary' AND
      NEW.primary_fresh_effect_digest IS NOT NULL AND
      NEW.secondary_fresh_effect_ordinal IS NULL AND
      NEW.secondary_fresh_effect_role IS NULL AND
      NEW.secondary_fresh_effect_digest IS NULL AND
      (SELECT count(*) FROM lifecycle_receipt_custody_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_generation_loss_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_recovery_retirement_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_fresh_origin_effects
        WHERE batch_id=NEW.batch_id)=1 AND
      EXISTS (SELECT 1 FROM lifecycle_receipt_fresh_origin_effects
        WHERE batch_id=NEW.batch_id AND ordinal=1 AND role='primary' AND
          effect_digest=NEW.primary_fresh_effect_digest))
  );
END;

CREATE TRIGGER lifecycle_custody_effect_set_closed
BEFORE INSERT ON lifecycle_receipt_custody_effects
BEGIN
  SELECT RAISE(ABORT,'lifecycle-effect-set-closed')
  WHERE EXISTS (SELECT 1 FROM lifecycle_receipt_batch_completions
    WHERE batch_id=NEW.batch_id);
END;

CREATE TRIGGER lifecycle_loss_effect_set_closed
BEFORE INSERT ON lifecycle_receipt_generation_loss_effects
BEGIN
  SELECT RAISE(ABORT,'lifecycle-effect-set-closed')
  WHERE EXISTS (SELECT 1 FROM lifecycle_receipt_batch_completions
    WHERE batch_id=NEW.batch_id);
END;

CREATE TRIGGER lifecycle_retirement_effect_set_closed
BEFORE INSERT ON lifecycle_receipt_recovery_retirement_effects
BEGIN
  SELECT RAISE(ABORT,'lifecycle-effect-set-closed')
  WHERE EXISTS (SELECT 1 FROM lifecycle_receipt_batch_completions
    WHERE batch_id=NEW.batch_id);
END;

CREATE TRIGGER lifecycle_fresh_origin_effect_set_closed
BEFORE INSERT ON lifecycle_receipt_fresh_origin_effects
BEGIN
  SELECT RAISE(ABORT,'lifecycle-effect-set-closed')
  WHERE EXISTS (SELECT 1 FROM lifecycle_receipt_batch_completions
    WHERE batch_id=NEW.batch_id);
END;

CREATE TRIGGER lifecycle_apply_post_state_complete
BEFORE INSERT ON lifecycle_transition_applies
BEGIN
  SELECT RAISE(ABORT,'lifecycle-apply-post-state-incomplete')
  WHERE NOT (
    (NEW.apply_kind='terminal' AND
      NEW.batch_transition_kind='custody-terminal' AND
      EXISTS (
        SELECT 1
        FROM lifecycle_receipt_custody_effects e
        JOIN lifecycle_rotation_custody_revisions r
          ON r.project_session_id=e.project_session_id AND
             r.run_id=e.run_id AND r.agent_id=e.agent_id AND
             r.custody_id=e.custody_id AND r.revision=e.final_revision AND
             r.semantic_digest=e.final_semantic_digest AND
             r.source_ref_digest=e.final_source_ref_digest AND
             r.receipt_batch_id=e.batch_id AND
             r.receipt_apply_id=NEW.apply_id AND
             r.receipt_apply_digest=NEW.apply_digest
        JOIN lifecycle_rotation_custody_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.custody_id=r.custody_id AND h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE e.batch_id=NEW.receipt_batch_id
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_receipt_batch_completions c
        WHERE c.batch_id=NEW.receipt_batch_id AND
          ((c.linked_loss_effect_role IS NULL AND
              c.linked_loss_effect_digest IS NULL AND
              NOT EXISTS (
                SELECT 1 FROM lifecycle_receipt_generation_loss_effects e
                WHERE e.batch_id=c.batch_id AND e.role='linked'
              )) OR
            (c.linked_loss_effect_role='linked' AND
              c.linked_loss_effect_digest IS NOT NULL AND EXISTS (
                SELECT 1
                FROM lifecycle_receipt_generation_loss_effects e
                JOIN lifecycle_generation_loss_revisions r
                  ON r.project_session_id=e.project_session_id AND
                     r.run_id=e.run_id AND r.agent_id=e.agent_id AND
                     r.generation_loss_id=e.generation_loss_id AND
                     r.revision=e.final_revision AND
                     r.semantic_digest=e.final_semantic_digest AND
                     r.source_ref_digest=e.final_source_ref_digest AND
                     r.receipt_batch_id=e.batch_id AND
                     r.receipt_apply_id=NEW.apply_id AND
                     r.receipt_apply_digest=NEW.apply_digest
                JOIN lifecycle_generation_loss_heads h
                  ON h.project_session_id=r.project_session_id AND
                     h.run_id=r.run_id AND h.agent_id=r.agent_id AND
                     h.generation_loss_id=r.generation_loss_id AND
                     h.current_revision=r.revision AND
                     h.semantic_digest=r.semantic_digest AND
                     h.source_ref_digest=r.source_ref_digest AND
                     h.journal_digest=r.journal_digest
                WHERE e.batch_id=c.batch_id AND e.role='linked' AND
                  e.effect_digest=c.linked_loss_effect_digest
              )))
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_receipt_batches b
        WHERE b.batch_id=NEW.receipt_batch_id AND
          ((b.review_adoption_reservation_id IS NULL AND NOT EXISTS (
              SELECT 1 FROM lifecycle_review_authority_bindings v
              WHERE v.batch_id=b.batch_id
            )) OR
            (b.review_adoption_reservation_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM lifecycle_review_authority_bindings v
              WHERE v.batch_id=b.batch_id AND v.apply_id=NEW.apply_id AND
                v.review_reservation_digest=
                  b.review_adoption_reservation_digest
            )))
      )) OR
    (NEW.apply_kind='terminal' AND
      NEW.batch_transition_kind='generation-loss-terminal' AND EXISTS (
        SELECT 1
        FROM lifecycle_receipt_generation_loss_effects e
        JOIN lifecycle_generation_loss_revisions r
          ON r.project_session_id=e.project_session_id AND
             r.run_id=e.run_id AND r.agent_id=e.agent_id AND
             r.generation_loss_id=e.generation_loss_id AND
             r.revision=e.final_revision AND
             r.semantic_digest=e.final_semantic_digest AND
             r.source_ref_digest=e.final_source_ref_digest AND
             r.receipt_batch_id=e.batch_id AND
             r.receipt_apply_id=NEW.apply_id AND
             r.receipt_apply_digest=NEW.apply_digest
        JOIN lifecycle_generation_loss_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.generation_loss_id=r.generation_loss_id AND
             h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE e.batch_id=NEW.receipt_batch_id AND e.role='primary'
      )) OR
    (NEW.apply_kind='terminal' AND
      NEW.batch_transition_kind='custody-recovery-retirement' AND EXISTS (
        SELECT 1
        FROM lifecycle_receipt_recovery_retirement_effects e
        JOIN agent_lifecycle_recovery_retirements r
          ON r.retirement_id=e.retirement_id AND
             r.receipt_batch_id=e.batch_id AND
             r.receipt_apply_id=NEW.apply_id AND
             r.receipt_apply_digest=NEW.apply_digest AND
             r.retirement_effect_digest=e.effect_digest
        WHERE e.batch_id=NEW.receipt_batch_id
      )) OR
    (NEW.apply_kind='terminal-fresh' AND
      NEW.batch_transition_kind='custody-terminal' AND
      EXISTS (
        SELECT 1
        FROM lifecycle_receipt_custody_effects e
        JOIN lifecycle_rotation_custody_revisions r
          ON r.project_session_id=e.project_session_id AND
             r.run_id=e.run_id AND r.agent_id=e.agent_id AND
             r.custody_id=e.custody_id AND r.revision=e.final_revision AND
             r.semantic_digest=e.final_semantic_digest AND
             r.source_ref_digest=e.final_source_ref_digest AND
             r.receipt_batch_id=e.batch_id AND
             r.receipt_apply_id=NEW.apply_id AND
             r.receipt_apply_digest=NEW.apply_digest
        JOIN lifecycle_rotation_custody_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.custody_id=r.custody_id AND h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE e.batch_id=NEW.receipt_batch_id
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_receipt_batch_completions c
        WHERE c.batch_id=NEW.receipt_batch_id AND
          ((c.linked_loss_effect_role IS NULL AND
              c.linked_loss_effect_digest IS NULL AND
              NEW.fresh_generation_loss_after_key='none' AND
              NOT EXISTS (
                SELECT 1 FROM lifecycle_receipt_generation_loss_effects e
                WHERE e.batch_id=c.batch_id AND e.role='linked'
              )) OR
            (c.linked_loss_effect_role='linked' AND
              c.linked_loss_effect_digest IS NOT NULL AND
              NEW.fresh_generation_loss_after_key<>'none' AND EXISTS (
                SELECT 1
                FROM lifecycle_receipt_generation_loss_effects e
                JOIN lifecycle_generation_loss_revisions r
                  ON r.project_session_id=e.project_session_id AND
                     r.run_id=e.run_id AND r.agent_id=e.agent_id AND
                     r.generation_loss_id=e.generation_loss_id AND
                     r.revision=e.final_revision AND
                     r.semantic_digest=e.final_semantic_digest AND
                     r.source_ref_digest=e.final_source_ref_digest AND
                     r.receipt_batch_id=e.batch_id AND
                     r.receipt_apply_id=NEW.apply_id AND
                     r.receipt_apply_digest=NEW.apply_digest
                JOIN lifecycle_generation_loss_heads h
                  ON h.project_session_id=r.project_session_id AND
                     h.run_id=r.run_id AND h.agent_id=r.agent_id AND
                     h.generation_loss_id=r.generation_loss_id AND
                     h.current_revision=r.revision AND
                     h.semantic_digest=r.semantic_digest AND
                     h.source_ref_digest=r.source_ref_digest AND
                     h.journal_digest=r.journal_digest
                WHERE e.batch_id=c.batch_id AND e.role='linked' AND
                  e.effect_digest=c.linked_loss_effect_digest AND
                  e.project_session_id=NEW.fresh_project_session_id AND
                  e.run_id=NEW.fresh_run_id AND
                  e.agent_id=NEW.fresh_agent_id AND
                  e.generation_loss_id=NEW.fresh_generation_loss_id AND
                  e.final_revision=NEW.fresh_generation_loss_after_revision AND
                  e.final_semantic_digest=
                    NEW.fresh_generation_loss_after_semantic_digest AND
                  e.final_source_ref_digest=
                    NEW.fresh_generation_loss_after_source_ref_digest
              )))
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_receipt_batches b
        WHERE b.batch_id=NEW.receipt_batch_id AND
          ((b.review_adoption_reservation_id IS NULL AND NOT EXISTS (
              SELECT 1 FROM lifecycle_review_authority_bindings v
              WHERE v.batch_id=b.batch_id
            )) OR
            (b.review_adoption_reservation_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM lifecycle_review_authority_bindings v
              WHERE v.batch_id=b.batch_id AND v.apply_id=NEW.apply_id AND
                v.review_reservation_digest=
                  b.review_adoption_reservation_digest
            )))
      ) AND
      EXISTS (
        SELECT 1
        FROM lifecycle_rotation_custody_revisions r
        JOIN lifecycle_rotation_custody_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.custody_id=r.custody_id AND h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE r.project_session_id=NEW.fresh_project_session_id AND
          r.run_id=NEW.fresh_run_id AND r.agent_id=NEW.fresh_agent_id AND
          r.custody_id=NEW.new_custody_id AND r.revision=1 AND
          r.semantic_digest=NEW.new_custody_semantic_digest AND
          r.source_ref_digest=NEW.new_custody_source_ref_digest AND
          r.origin_fresh_apply_id=NEW.apply_id AND
          r.origin_fresh_apply_digest=NEW.apply_digest
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_fresh_rotation_commits c
        WHERE c.handoff_id=NEW.fresh_handoff_id AND
          c.apply_id=NEW.apply_id AND
          c.fresh_apply_digest=NEW.apply_digest AND
          c.new_custody_id=NEW.new_custody_id AND
          c.generation_loss_after_id IS NEW.fresh_generation_loss_id AND
          c.generation_loss_after_revision IS
            NEW.fresh_generation_loss_after_revision AND
          c.generation_loss_after_semantic_digest IS
            NEW.fresh_generation_loss_after_semantic_digest AND
          c.generation_loss_after_source_ref_digest IS
            NEW.fresh_generation_loss_after_source_ref_digest
      )) OR
    (NEW.apply_kind='fresh' AND
      NEW.fresh_source_mode='reuse-final-custody' AND
      EXISTS (
        SELECT 1
        FROM lifecycle_rotation_custody_revisions r
        JOIN lifecycle_rotation_custody_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.custody_id=r.custody_id AND h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE r.project_session_id=NEW.fresh_project_session_id AND
          r.run_id=NEW.fresh_run_id AND r.agent_id=NEW.fresh_agent_id AND
          r.custody_id=NEW.new_custody_id AND r.revision=1 AND
          r.semantic_digest=NEW.new_custody_semantic_digest AND
          r.source_ref_digest=NEW.new_custody_source_ref_digest AND
          r.origin_fresh_apply_id=NEW.apply_id AND
          r.origin_fresh_apply_digest=NEW.apply_digest
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_fresh_rotation_commits c
        WHERE c.handoff_id=NEW.fresh_handoff_id AND
          c.apply_id=NEW.apply_id AND
          c.fresh_apply_digest=NEW.apply_digest AND
          c.new_custody_id=NEW.new_custody_id AND
          c.generation_loss_after_id IS NULL
      )) OR
    (NEW.apply_kind='fresh' AND
      NEW.fresh_source_mode='open-generation-loss' AND
      EXISTS (
        SELECT 1
        FROM lifecycle_rotation_custody_revisions r
        JOIN lifecycle_rotation_custody_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.custody_id=r.custody_id AND h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE r.project_session_id=NEW.fresh_project_session_id AND
          r.run_id=NEW.fresh_run_id AND r.agent_id=NEW.fresh_agent_id AND
          r.custody_id=NEW.new_custody_id AND r.revision=1 AND
          r.semantic_digest=NEW.new_custody_semantic_digest AND
          r.source_ref_digest=NEW.new_custody_source_ref_digest AND
          r.origin_fresh_apply_id=NEW.apply_id AND
          r.origin_fresh_apply_digest=NEW.apply_digest
      ) AND
      EXISTS (
        SELECT 1
        FROM lifecycle_generation_loss_revisions r
        JOIN lifecycle_generation_loss_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.generation_loss_id=r.generation_loss_id AND
             h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE r.project_session_id=NEW.fresh_project_session_id AND
          r.run_id=NEW.fresh_run_id AND r.agent_id=NEW.fresh_agent_id AND
          r.generation_loss_id=NEW.fresh_generation_loss_id AND
          r.revision=NEW.fresh_generation_loss_after_revision AND
          r.semantic_digest=NEW.fresh_generation_loss_after_semantic_digest AND
          r.source_ref_digest=
            NEW.fresh_generation_loss_after_source_ref_digest AND
          r.origin_fresh_apply_id=NEW.apply_id AND
          r.origin_fresh_apply_digest=NEW.apply_digest
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_fresh_rotation_commits c
        WHERE c.handoff_id=NEW.fresh_handoff_id AND
          c.apply_id=NEW.apply_id AND
          c.fresh_apply_digest=NEW.apply_digest AND
          c.new_custody_id=NEW.new_custody_id AND
          c.generation_loss_after_id=NEW.fresh_generation_loss_id AND
          c.generation_loss_after_revision=
            NEW.fresh_generation_loss_after_revision AND
          c.generation_loss_after_semantic_digest=
            NEW.fresh_generation_loss_after_semantic_digest AND
          c.generation_loss_after_source_ref_digest=
            NEW.fresh_generation_loss_after_source_ref_digest
      ))
  );
END;
~~~

## Recovery ownership and operations

LifecycleRotationRecoveryService runs before and excludes lifecycle-linked rows from every generic
provider-action/bridge recovery query. awaiting-boundary/prepared performs no adapter call and can close no-effect only
from the zero-dispatch journal. dispatched/accepted/ambiguous permits at most one pair lookup. Exact launch.attest
terminal proof may resume adoption; closed no-effect closes; drift supersedes; malformed/crossed/conflicting proof
quarantines. No path dispatches, redispatches, reconstructs a secret or treats a resume reference as continuity.
Checkpoint A can never adopt B; B reserves a new action/capability/challenge and new high-water targets.

The generation-loss table is the second explicit lifecycleRecoverySourceV1 arm; custody and loss foreign keys are
exclusive/non-null by discriminator. loss_kind is generation-advance (new provider generation > old) or context- advance
(new provider generation equals old and new context revision is strictly greater than old). Generation-advance wins when
provider and context both change, so one observation has one canonical loss ID. checkpoint state is absent, invalid or
last-validated; ref/digest are non-null iff last- validated. Detection requires no active custody, inserts open loss,
fences the source, and ratchets only provider/context high-water from the observation. Principal/bridge high-water
changes only under authenticated custody/adoption CAS inputs, never by comparing provider telemetry. Generic scans
exclude it. Capability issuance equality-copies every immutable loss source action, adapter/contract,
principal/bridge/owner and chair session/run/lease field; it never late-resolves a mutable bridge/session join.

Loss edges are open -> recovery-in-progress -> recovered-adopted|abandoned, recovery-in-progress -> open and direct open
-> abandoned. Fresh custody no-effect/quarantine/supersession returns it to open with attempt history; only adopted
custody terminalises recovered and clears freezes. Absent/invalid checkpoint permits fresh rotation only after the
read-only recovery-checkpoint validator binds an existing daemon-valid artifact; otherwise only abandon is reachable.
Direct-open abandon persists null recovery action; attempted-recovery abandon persists its exact adapter/action pair.
The recovery capability/intent/retirement rows bind the exact custody-or-loss union and phase-B CAS its revision.

Lifecycle remains the sole recovery owner for a rotating true chair until adoption or confirmed abandon. The chair-loss
scanner excludes a nonfinal custody, open generation loss and finalized nonadopted lifecycle-recovery marker and creates
no chair_bridge_loss row. Child custody cannot update chair tables.

The private local issuer for agent-lifecycle-recovery-takeover requires the same local subject's current session
capability containing agent-lifecycle-recovery-issue plus one independently attested consequential gate bound to the
exact recovery, validates the complete row binding above and returns plaintext once while persisting only its hash. Its
derived statuses are active, commit-pending, consumed, revoked and expired; no mutable status column duplicates the
issue/handoff/commit/revocation facts. The narrow issue authorises only fresh-rotate; generic session or takeover
capabilities cannot reach Commit. agent-lifecycle-recovery intent rows additionally bind path, exact replacement
adapter/activated contract/distinct canonical action pair, current daemon-validated checkpoint row/vector and proposed
high-water reservation. Preview changes no lifecycle or provider state. Fresh-rotate Commit first persists the immutable
handoff. A nonfinal zero-dispatch predecessor becomes commit-pending until its externally authorized terminal-fresh
apply atomically supersedes it and inserts the distinct null-caller awaiting-boundary custody/commit. A finalized
custody or open loss uses the direct fresh apply; finalized rows are never mutated and the open loss moves to
recovery-in-progress. Commit performs no provider call.

abandon instead requires exact session cancel authority, a consequential gate and independent destructive direct-human
attestation. It first prepares the exact terminal batch; only post-authority apply moves a nonfinal custody through
abandoned or preserves a finalized custody and inserts agent_lifecycle_recovery_retirements; an open loss takes
direct-open abandon with no recovery pair, while a recovery-in-progress loss takes recovery- attempt abandon with its
exact pair. It archives the agent; revokes old/staged capability, principal and bridge; terminally revokes turns; and
moves lifecycle-quarantined write leases to revoked-abandoned. It terminally abandons every owned or sole-recipient
ready/claimed delivery, task owner lease, required-result obligation and membership with reason; advances message/
delivery membership watermarks; terminalises dependent owned barriers as abandoned-failure; appends grant revocations
without changing immutable authority envelopes; and clears only exact freeze contributions whose owners are terminal. No
required delivery/barrier is orphaned. Child abandon preserves unrelated run work and moves affected parents to explicit
failure/recovery; chair abandon enters the existing run/session cancel-failure terminal path atomically. Status returns
intent, issue and custody state; Reconcile pair-looks up only a new dispatched action. Generic Resume cannot mutate
these rows.

Verification covers schema/catalogue and every legal/illegal state edge and transaction crash; unique self-turn
inference and operator null-caller boundary; housekeeping/quarantine/delivery-cut ordering; successor-pending
stored-as-ready state/count and enqueue without adoption starvation versus claim/ack fencing for custody, open loss and
exact linked loss/custody owners; adoption/abandon and crossed/multiple-owner negatives; old/staged operation negatives;
accepted/current-read separation; global identity/owner-scoped bridge high-water A-to-B nonreuse and exact source/
target final CAS; launch.attest attribution; retained-successor-before-CAS, child/chair table swap and postcommit
retirement; predispatch versus advertised postdispatch no-effect; sole-chair lifecycle ownership and generic recovery
exclusion. Operator fixtures cover capability parent issuance grant/gate/revoke/consume, fresh adapter/contract/action/
checkpoint binding, finalized-custody immutability, exact abandon delivery/ watermark/barrier transitions and
generic-resume/chair-loss negatives. Generation-loss fixtures cover both loss kinds, every checkpoint state,
simultaneous provider/context advance classified once as generation-advance, restart replay, lower generation, lower
same-generation revision, arbitrary forward context jump, strict context inequality and observed high-water ratchet;
custody-or-loss foreign keys, recovery/adopt/reopen/direct-open versus recovery-attempt abandon edges/action-pair
nullability and absent/null/generic- resume negatives. This specification adds no automatic pressure, successor
selection or research-only routing policy.

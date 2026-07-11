-- Spec 01 v0.14 / Spec 04 v1.10 launched-chair bridge loss and recovery custody.

CREATE TABLE launched_chair_bridge_state (
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  chair_agent_id TEXT NOT NULL,
  provider_adapter_id TEXT NOT NULL,
  provider_action_id TEXT NOT NULL,
  provider_contract_digest TEXT NOT NULL,
  provider_session_ref TEXT NOT NULL,
  provider_session_generation INTEGER NOT NULL CHECK (provider_session_generation >= 1),
  principal_generation INTEGER NOT NULL CHECK (principal_generation >= 1),
  bridge_generation INTEGER NOT NULL CHECK (bridge_generation >= 1),
  capability_hash TEXT NOT NULL,
  activation_evidence_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active','lost','abandoned')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (project_session_id, coordination_run_id),
  UNIQUE (provider_adapter_id, provider_action_id),
  UNIQUE (coordination_run_id, chair_agent_id, bridge_generation),
  FOREIGN KEY (project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY (coordination_run_id, chair_agent_id)
    REFERENCES agents(run_id, agent_id),
  FOREIGN KEY (provider_adapter_id, provider_action_id)
    REFERENCES provider_actions(adapter_id, action_id),
  FOREIGN KEY (capability_hash) REFERENCES capabilities(token_hash),
  CHECK (length(provider_contract_digest)=71 AND substr(provider_contract_digest,1,7)='sha256:'),
  CHECK (length(activation_evidence_digest)=71 AND substr(activation_evidence_digest,1,7)='sha256:')
);

CREATE INDEX launched_chair_bridge_state_supervision
  ON launched_chair_bridge_state(state, provider_adapter_id, updated_at, coordination_run_id);

CREATE TABLE chair_bridge_losses (
  loss_id TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  chair_agent_id TEXT NOT NULL,
  provider_adapter_id TEXT NOT NULL,
  provider_action_id TEXT NOT NULL,
  provider_contract_digest TEXT NOT NULL,
  provider_session_ref TEXT NOT NULL,
  provider_session_generation INTEGER NOT NULL CHECK (provider_session_generation >= 1),
  principal_generation INTEGER NOT NULL CHECK (principal_generation >= 1),
  lost_bridge_generation INTEGER NOT NULL CHECK (lost_bridge_generation >= 1),
  next_bridge_generation INTEGER NOT NULL CHECK (next_bridge_generation >= 2),
  capability_hash TEXT NOT NULL,
  daemon_instance_generation INTEGER NOT NULL CHECK (daemon_instance_generation >= 1),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 160),
  evidence_digest TEXT NOT NULL,
  recovery_manifest_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (coordination_run_id, lost_bridge_generation),
  FOREIGN KEY (project_session_id, coordination_run_id)
    REFERENCES launched_chair_bridge_state(project_session_id, coordination_run_id),
  FOREIGN KEY (coordination_run_id, chair_agent_id)
    REFERENCES agents(run_id, agent_id),
  FOREIGN KEY (provider_adapter_id, provider_action_id)
    REFERENCES provider_actions(adapter_id, action_id),
  FOREIGN KEY (capability_hash) REFERENCES capabilities(token_hash),
  CHECK (next_bridge_generation=lost_bridge_generation+1),
  CHECK (length(provider_contract_digest)=71 AND substr(provider_contract_digest,1,7)='sha256:'),
  CHECK (length(evidence_digest)=71 AND substr(evidence_digest,1,7)='sha256:'),
  CHECK (length(recovery_manifest_digest)=71 AND substr(recovery_manifest_digest,1,7)='sha256:')
);

CREATE TABLE chair_bridge_recovery_custody (
  recovery_id TEXT PRIMARY KEY,
  loss_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  operator_command_id TEXT NOT NULL,
  path TEXT NOT NULL CHECK (path IN ('rebind','takeover','abandon')),
  intent_digest TEXT NOT NULL,
  intent_json TEXT NOT NULL CHECK (json_valid(intent_json)=1),
  recovery_manifest_digest TEXT NOT NULL,
  expected_session_revision INTEGER NOT NULL,
  expected_session_generation INTEGER NOT NULL,
  expected_run_revision INTEGER NOT NULL,
  expected_chair_generation INTEGER NOT NULL,
  expected_principal_generation INTEGER NOT NULL,
  expected_bridge_revision INTEGER NOT NULL,
  expected_lost_bridge_generation INTEGER NOT NULL,
  expected_provider_session_generation INTEGER NOT NULL,
  provider_adapter_id TEXT NOT NULL,
  provider_contract_digest TEXT NOT NULL,
  provider_action_id TEXT,
  successor_agent_id TEXT,
  expected_successor_principal_generation INTEGER,
  expected_successor_bridge_generation INTEGER,
  expected_successor_revision INTEGER,
  new_chair_agent_id TEXT,
  new_provider_action_id TEXT,
  new_provider_session_ref TEXT,
  new_provider_session_generation INTEGER,
  new_principal_generation INTEGER,
  new_bridge_generation INTEGER,
  new_capability_hash TEXT,
  new_activation_evidence_digest TEXT,
  attestation_challenge_digest TEXT,
  state TEXT NOT NULL CHECK (state IN (
    'prepared','dispatched','accepted','ambiguous','committing','terminal','no-effect'
  )),
  result_json TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (operator_id, operator_command_id),
  UNIQUE (provider_adapter_id, provider_action_id),
  FOREIGN KEY (loss_id) REFERENCES chair_bridge_losses(loss_id),
  CHECK (length(intent_digest)=71 AND substr(intent_digest,1,7)='sha256:'),
  CHECK (length(recovery_manifest_digest)=71 AND substr(recovery_manifest_digest,1,7)='sha256:'),
  CHECK (length(provider_contract_digest)=71 AND substr(provider_contract_digest,1,7)='sha256:'),
  CHECK (new_activation_evidence_digest IS NULL OR
    (length(new_activation_evidence_digest)=71 AND substr(new_activation_evidence_digest,1,7)='sha256:')),
  CHECK (attestation_challenge_digest IS NULL OR
    (length(attestation_challenge_digest)=71 AND substr(attestation_challenge_digest,1,7)='sha256:')),
  CHECK (
    (path='rebind' AND provider_action_id IS NOT NULL AND successor_agent_id IS NULL
      AND new_capability_hash IS NOT NULL AND attestation_challenge_digest IS NOT NULL) OR
    (path='takeover' AND provider_action_id IS NULL AND successor_agent_id IS NOT NULL
      AND new_capability_hash IS NOT NULL AND attestation_challenge_digest IS NULL) OR
    (path='abandon' AND provider_action_id IS NULL AND successor_agent_id IS NULL
      AND new_capability_hash IS NULL AND attestation_challenge_digest IS NULL)
  )
);

CREATE INDEX chair_bridge_recovery_obligations
  ON chair_bridge_recovery_custody(state, provider_adapter_id, updated_at, recovery_id);
CREATE UNIQUE INDEX chair_bridge_one_open_recovery_per_loss
  ON chair_bridge_recovery_custody(loss_id)
  WHERE state NOT IN ('terminal','no-effect');

CREATE TABLE chair_bridge_loss_resolutions (
  loss_id TEXT PRIMARY KEY,
  recovery_id TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL CHECK (path IN ('rebind','takeover','abandon')),
  successor_agent_id TEXT,
  new_principal_generation INTEGER,
  new_bridge_generation INTEGER,
  evidence_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (loss_id) REFERENCES chair_bridge_losses(loss_id),
  FOREIGN KEY (recovery_id) REFERENCES chair_bridge_recovery_custody(recovery_id),
  CHECK (length(evidence_digest)=71 AND substr(evidence_digest,1,7)='sha256:')
);

CREATE TRIGGER launched_chair_bridge_identity_immutable
BEFORE UPDATE OF
  project_session_id, coordination_run_id, chair_agent_id,
  provider_adapter_id, provider_action_id, provider_contract_digest, provider_session_ref,
  provider_session_generation, principal_generation, bridge_generation,
  capability_hash, activation_evidence_digest, created_at
ON launched_chair_bridge_state
WHEN NOT EXISTS (
  SELECT 1
    FROM chair_bridge_recovery_custody recovery
    JOIN chair_bridge_losses loss ON loss.loss_id=recovery.loss_id
   WHERE recovery.state='committing' AND recovery.path IN ('rebind','takeover')
     AND OLD.state='lost' AND loss.project_session_id=OLD.project_session_id
     AND loss.coordination_run_id=OLD.coordination_run_id
     AND recovery.new_chair_agent_id=NEW.chair_agent_id
     AND recovery.provider_adapter_id=NEW.provider_adapter_id
     AND recovery.new_provider_action_id=NEW.provider_action_id
     AND recovery.provider_contract_digest=NEW.provider_contract_digest
     AND recovery.new_provider_session_ref=NEW.provider_session_ref
     AND recovery.new_provider_session_generation=NEW.provider_session_generation
     AND recovery.new_principal_generation=NEW.principal_generation
     AND recovery.new_bridge_generation=NEW.bridge_generation
     AND recovery.new_capability_hash=NEW.capability_hash
     AND recovery.new_activation_evidence_digest=NEW.activation_evidence_digest
)
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_launched_chair_bridge_identity_immutable');
END;

CREATE TRIGGER launched_chair_bridge_state_cas
BEFORE UPDATE OF state, revision ON launched_chair_bridge_state
WHEN NOT (
  (OLD.state='active' AND NEW.state='lost' AND NEW.revision=OLD.revision+1) OR
  (OLD.state='lost' AND NEW.state IN ('active','abandoned') AND NEW.revision=OLD.revision+1
    AND EXISTS (
      SELECT 1 FROM chair_bridge_recovery_custody recovery
      JOIN chair_bridge_losses loss ON loss.loss_id=recovery.loss_id
      WHERE recovery.state='committing'
        AND loss.project_session_id=OLD.project_session_id
        AND loss.coordination_run_id=OLD.coordination_run_id
        AND ((recovery.path IN ('rebind','takeover') AND NEW.state='active')
          OR (recovery.path='abandon' AND NEW.state='abandoned'))
    ))
)
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_launched_chair_bridge_state_cas');
END;

CREATE TRIGGER launched_chair_bridge_delete_forbidden
BEFORE DELETE ON launched_chair_bridge_state
BEGIN SELECT RAISE(ABORT, 'INVARIANT_launched_chair_bridge_identity_immutable'); END;

CREATE TRIGGER chair_bridge_losses_immutable_update
BEFORE UPDATE ON chair_bridge_losses
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_losses_immutable'); END;
CREATE TRIGGER chair_bridge_losses_immutable_delete
BEFORE DELETE ON chair_bridge_losses
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_losses_immutable'); END;
CREATE TRIGGER chair_bridge_loss_resolutions_immutable_update
BEFORE UPDATE ON chair_bridge_loss_resolutions
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_resolutions_immutable'); END;
CREATE TRIGGER chair_bridge_loss_resolutions_immutable_delete
BEFORE DELETE ON chair_bridge_loss_resolutions
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_resolutions_immutable'); END;

CREATE TRIGGER chair_bridge_loss_freezes_capability_grants
BEFORE INSERT ON capabilities
WHEN (
  EXISTS (
    SELECT 1 FROM launched_chair_bridge_state bridge
     WHERE bridge.coordination_run_id=NEW.run_id AND bridge.state='lost'
  ) OR EXISTS (
    SELECT 1 FROM chair_bridge_recovery_custody recovery
     WHERE recovery.path='rebind'
       AND recovery.new_capability_hash=NEW.token_hash
  )
) AND NOT EXISTS (
  SELECT 1 FROM chair_bridge_recovery_custody recovery
  JOIN chair_bridge_losses loss ON loss.loss_id=recovery.loss_id
  WHERE recovery.path='rebind' AND recovery.state='prepared'
    AND loss.coordination_run_id=NEW.run_id
    AND loss.chair_agent_id=NEW.agent_id
    AND recovery.new_capability_hash=NEW.token_hash
    AND recovery.new_principal_generation=NEW.principal_generation
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_freezes_grants'); END;

CREATE TRIGGER chair_bridge_recovery_capability_identity_immutable
BEFORE UPDATE OF token_hash, run_id, agent_id, principal_generation ON capabilities
WHEN (
  OLD.token_hash<>NEW.token_hash OR OLD.run_id<>NEW.run_id OR
  OLD.agent_id<>NEW.agent_id OR OLD.principal_generation<>NEW.principal_generation
) AND EXISTS (
  SELECT 1 FROM chair_bridge_recovery_custody recovery
   WHERE recovery.path='rebind'
     AND recovery.new_capability_hash IN (OLD.token_hash, NEW.token_hash)
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_freezes_grants'); END;

CREATE TRIGGER chair_bridge_recovery_capability_delete_forbidden
BEFORE DELETE ON capabilities
WHEN EXISTS (
  SELECT 1 FROM chair_bridge_recovery_custody recovery
   WHERE recovery.path='rebind' AND recovery.new_capability_hash=OLD.token_hash
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_freezes_grants'); END;

CREATE TRIGGER chair_bridge_loss_freezes_authority_grants
BEFORE INSERT ON authorities
WHEN EXISTS (
  SELECT 1 FROM launched_chair_bridge_state bridge
   WHERE bridge.coordination_run_id=NEW.run_id AND bridge.state='lost'
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_freezes_grants'); END;

CREATE TRIGGER chair_bridge_loss_blocks_run_reactivation
BEFORE UPDATE OF lifecycle_state ON runs
WHEN NEW.lifecycle_state='active' AND EXISTS (
  SELECT 1 FROM launched_chair_bridge_state bridge
   WHERE bridge.coordination_run_id=NEW.run_id AND bridge.state='lost'
) AND NOT EXISTS (
  SELECT 1 FROM chair_bridge_recovery_custody recovery
  JOIN chair_bridge_losses loss ON loss.loss_id=recovery.loss_id
  WHERE recovery.state='committing' AND recovery.path IN ('rebind','takeover')
    AND loss.coordination_run_id=NEW.run_id
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_requires_explicit_recovery'); END;

CREATE TRIGGER chair_bridge_loss_blocks_session_reactivation
BEFORE UPDATE OF state ON project_sessions
WHEN NEW.state='active' AND EXISTS (
  SELECT 1 FROM launched_chair_bridge_state bridge
   WHERE bridge.project_session_id=NEW.project_session_id AND bridge.state='lost'
) AND NOT EXISTS (
  SELECT 1 FROM chair_bridge_recovery_custody recovery
  JOIN chair_bridge_losses loss ON loss.loss_id=recovery.loss_id
  WHERE recovery.state='committing' AND recovery.path IN ('rebind','takeover')
    AND loss.project_session_id=NEW.project_session_id
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_requires_explicit_recovery'); END;

INSERT INTO launched_chair_bridge_state(
  project_session_id, coordination_run_id, chair_agent_id,
  provider_adapter_id, provider_action_id, provider_contract_digest, provider_session_ref,
  provider_session_generation, principal_generation, bridge_generation,
  capability_hash, activation_evidence_digest, state, revision, created_at, updated_at
)
SELECT
  c.project_session_id, c.coordination_run_id, c.chair_agent_id,
  c.provider_adapter_id, c.provider_action_id, c.provider_contract_digest, a.provider_session_ref,
  ps.provider_session_generation, cap.principal_generation, 1,
  c.capability_hash, json_extract(p.result_json, '$.outcome.effectDigest'),
  'active', 1, c.created_at, c.created_at
FROM project_session_launch_custody c
JOIN project_sessions s ON s.project_session_id=c.project_session_id AND s.state='active'
JOIN runs r ON r.run_id=c.coordination_run_id AND r.lifecycle_state='active'
JOIN agents a ON a.run_id=c.coordination_run_id AND a.agent_id=c.chair_agent_id
JOIN provider_state ps ON ps.run_id=c.coordination_run_id AND ps.agent_id=c.chair_agent_id
JOIN capabilities cap ON cap.token_hash=c.capability_hash AND cap.revoked_at IS NULL
JOIN provider_actions p ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
WHERE p.status='terminal' AND p.execution_count=1 AND p.effect_count=1
  AND a.provider_session_ref IS NOT NULL AND json_valid(p.result_json)=1
  AND json_extract(p.result_json, '$.outcome.kind')='terminal-success'
  AND json_extract(p.result_json, '$.outcome.providerSessionRef')=a.provider_session_ref
  AND json_extract(p.result_json, '$.outcome.providerSessionGeneration')=ps.provider_session_generation;

CREATE TEMP TABLE migration_0009_bridge_coverage_assert (
  covered INTEGER NOT NULL CHECK (covered=1)
);
INSERT INTO migration_0009_bridge_coverage_assert(covered)
SELECT CASE WHEN
  NOT EXISTS (
    SELECT 1 FROM runs r JOIN project_sessions s ON s.project_session_id=r.project_session_id
    WHERE r.lifecycle_state='active' AND s.state='active'
      AND EXISTS (SELECT 1 FROM project_session_launch_custody c WHERE c.coordination_run_id=r.run_id)
      AND NOT EXISTS (SELECT 1 FROM launched_chair_bridge_state b WHERE b.coordination_run_id=r.run_id AND b.state='active')
  ) AND NOT EXISTS (
    SELECT 1 FROM launched_chair_bridge_state b
    LEFT JOIN runs r ON r.run_id=b.coordination_run_id AND r.lifecycle_state='active'
    LEFT JOIN project_sessions s ON s.project_session_id=b.project_session_id AND s.state='active'
    WHERE b.state='active' AND (r.run_id IS NULL OR s.project_session_id IS NULL)
  ) THEN 1 ELSE 0 END;
DROP TABLE migration_0009_bridge_coverage_assert;

CREATE TRIGGER global_revision_launched_chair_bridge_insert
AFTER INSERT ON launched_chair_bridge_state
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_launched_chair_bridge_update
AFTER UPDATE ON launched_chair_bridge_state
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_chair_bridge_loss_insert
AFTER INSERT ON chair_bridge_losses
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_chair_bridge_recovery_insert
AFTER INSERT ON chair_bridge_recovery_custody
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_chair_bridge_recovery_update
AFTER UPDATE ON chair_bridge_recovery_custody
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_chair_bridge_resolution_insert
AFTER INSERT ON chair_bridge_loss_resolutions
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

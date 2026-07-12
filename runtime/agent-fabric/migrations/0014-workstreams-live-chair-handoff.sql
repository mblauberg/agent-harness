-- Spec 01 v0.21 / Spec 04 v1.17 coordinated workstreams and live chair handoff.

CREATE TABLE workstream_custody (
  workstream_id TEXT PRIMARY KEY REFERENCES workstreams(workstream_id),
  input_digest TEXT NOT NULL,
  launch_packet_artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id),
  launch_packet_path TEXT NOT NULL,
  launch_packet_digest TEXT NOT NULL,
  team_id TEXT NOT NULL,
  root_task_id TEXT NOT NULL,
  authority_id TEXT NOT NULL REFERENCES authorities(authority_id),
  budget_id TEXT NOT NULL,
  run_scope_id TEXT NOT NULL REFERENCES resource_scopes(scope_id),
  team_scope_id TEXT NOT NULL REFERENCES resource_scopes(scope_id),
  created_at INTEGER NOT NULL,
  CHECK (length(input_digest)=71 AND substr(input_digest,1,7)='sha256:'),
  CHECK (length(launch_packet_digest)=71 AND substr(launch_packet_digest,1,7)='sha256:')
);

CREATE TRIGGER workstream_custody_immutable_update
BEFORE UPDATE ON workstream_custody
BEGIN SELECT RAISE(ABORT, 'INVARIANT_workstream_custody_immutable'); END;
CREATE TRIGGER workstream_custody_immutable_delete
BEFORE DELETE ON workstream_custody
BEGIN SELECT RAISE(ABORT, 'INVARIANT_workstream_custody_immutable'); END;

CREATE TRIGGER global_revision_workstream_custody_insert AFTER INSERT ON workstream_custody
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TABLE chair_live_handoff_custody (
  custody_id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operator_principals(operator_id),
  operator_command_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  intent_digest TEXT NOT NULL,
  intent_json TEXT NOT NULL CHECK (json_valid(intent_json)=1),
  handoff_path TEXT NOT NULL,
  handoff_digest TEXT NOT NULL,
  predecessor_agent_id TEXT NOT NULL,
  successor_agent_id TEXT NOT NULL,
  successor_authority_id TEXT NOT NULL REFERENCES authorities(authority_id),
  successor_authority_digest TEXT NOT NULL,
  expected_session_revision INTEGER NOT NULL CHECK (expected_session_revision>=1),
  expected_session_generation INTEGER NOT NULL CHECK (expected_session_generation>=1),
  expected_membership_revision INTEGER NOT NULL CHECK (expected_membership_revision>=1),
  expected_run_revision INTEGER NOT NULL CHECK (expected_run_revision>=1),
  expected_chair_generation INTEGER NOT NULL CHECK (expected_chair_generation>=1),
  expected_chair_lease_id TEXT NOT NULL,
  expected_bridge_revision INTEGER NOT NULL CHECK (expected_bridge_revision>=1),
  expected_chair_bridge_generation INTEGER NOT NULL CHECK (expected_chair_bridge_generation>=1),
  expected_predecessor_principal_generation INTEGER NOT NULL CHECK (expected_predecessor_principal_generation>=1),
  expected_successor_principal_generation INTEGER NOT NULL CHECK (expected_successor_principal_generation>=1),
  expected_successor_bridge_revision INTEGER NOT NULL CHECK (expected_successor_bridge_revision>=1),
  expected_successor_bridge_generation INTEGER NOT NULL CHECK (expected_successor_bridge_generation>=1),
  provider_adapter_id TEXT NOT NULL,
  provider_contract_digest TEXT NOT NULL,
  source_provider_action_id TEXT NOT NULL,
  promotion_action_id TEXT NOT NULL,
  provider_session_ref TEXT NOT NULL,
  provider_session_generation INTEGER NOT NULL CHECK (provider_session_generation>=1),
  new_bridge_generation INTEGER NOT NULL CHECK (new_bridge_generation>=2),
  state TEXT NOT NULL CHECK (state IN ('prepared','dispatched','committing','terminal','no-effect','ambiguous')),
  result_json TEXT,
  revision INTEGER NOT NULL CHECK (revision>=1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(operator_id, operator_command_id),
  UNIQUE(provider_adapter_id, promotion_action_id),
  FOREIGN KEY(project_session_id, coordination_run_id) REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY(coordination_run_id, predecessor_agent_id) REFERENCES agents(run_id, agent_id),
  FOREIGN KEY(coordination_run_id, successor_agent_id) REFERENCES agents(run_id, agent_id),
  CHECK (length(intent_digest)=71 AND substr(intent_digest,1,7)='sha256:'),
  CHECK (length(handoff_digest)=71 AND substr(handoff_digest,1,7)='sha256:'),
  CHECK (length(successor_authority_digest)=71 AND substr(successor_authority_digest,1,7)='sha256:'),
  CHECK (length(provider_contract_digest)=71 AND substr(provider_contract_digest,1,7)='sha256:')
);

CREATE UNIQUE INDEX chair_live_handoff_one_open_per_run
  ON chair_live_handoff_custody(coordination_run_id)
  WHERE state NOT IN ('terminal','no-effect');

CREATE TABLE chair_live_handoff_resolutions (
  custody_id TEXT PRIMARY KEY REFERENCES chair_live_handoff_custody(custody_id),
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  predecessor_agent_id TEXT NOT NULL,
  successor_agent_id TEXT NOT NULL,
  promotion_action_id TEXT NOT NULL,
  new_chair_generation INTEGER NOT NULL CHECK (new_chair_generation>=2),
  new_bridge_generation INTEGER NOT NULL CHECK (new_bridge_generation>=2),
  evidence_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (length(evidence_digest)=71 AND substr(evidence_digest,1,7)='sha256:')
);

CREATE TRIGGER chair_live_handoff_identity_immutable
BEFORE UPDATE OF
  custody_id,operator_id,operator_command_id,project_session_id,coordination_run_id,
  intent_digest,intent_json,handoff_path,handoff_digest,predecessor_agent_id,
  successor_agent_id,successor_authority_id,successor_authority_digest,
  expected_session_revision,expected_session_generation,expected_membership_revision,
  expected_run_revision,expected_chair_generation,expected_chair_lease_id,
  expected_bridge_revision,expected_chair_bridge_generation,
  expected_predecessor_principal_generation,expected_successor_principal_generation,
  expected_successor_bridge_revision,expected_successor_bridge_generation,
  provider_adapter_id,provider_contract_digest,source_provider_action_id,
  promotion_action_id,provider_session_ref,provider_session_generation,
  new_bridge_generation,created_at
ON chair_live_handoff_custody
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_live_handoff_identity_immutable'); END;

CREATE TRIGGER chair_live_handoff_state_transition
BEFORE UPDATE OF state,revision ON chair_live_handoff_custody
WHEN NOT (
  (OLD.state='prepared' AND NEW.state='dispatched' AND NEW.revision=OLD.revision+1) OR
  (OLD.state='prepared' AND NEW.state='no-effect' AND NEW.revision=OLD.revision+1) OR
  (OLD.state IN ('dispatched','ambiguous') AND NEW.state IN ('committing','no-effect','ambiguous')
    AND NEW.revision=OLD.revision+1) OR
  (OLD.state='committing' AND NEW.state='terminal' AND NEW.revision=OLD.revision+1)
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_live_handoff_transition'); END;

CREATE TRIGGER chair_live_handoff_delete_forbidden BEFORE DELETE ON chair_live_handoff_custody
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_live_handoff_identity_immutable'); END;
CREATE TRIGGER chair_live_handoff_resolution_immutable_update BEFORE UPDATE ON chair_live_handoff_resolutions
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_live_handoff_resolution_immutable'); END;
CREATE TRIGGER chair_live_handoff_resolution_immutable_delete BEFORE DELETE ON chair_live_handoff_resolutions
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_live_handoff_resolution_immutable'); END;

CREATE TRIGGER chair_live_handoff_freezes_authority_grants BEFORE INSERT ON authorities
WHEN EXISTS (
  SELECT 1 FROM chair_live_handoff_custody custody
   WHERE custody.coordination_run_id=NEW.run_id
     AND custody.state NOT IN ('terminal','no-effect')
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_live_handoff_freezes_grants'); END;
CREATE TRIGGER chair_live_handoff_freezes_capability_grants BEFORE INSERT ON capabilities
WHEN EXISTS (
  SELECT 1 FROM chair_live_handoff_custody custody
   WHERE custody.coordination_run_id=NEW.run_id
     AND custody.state NOT IN ('terminal','no-effect')
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_live_handoff_freezes_grants'); END;
CREATE TRIGGER chair_live_handoff_freezes_provider_actions BEFORE INSERT ON provider_actions
WHEN EXISTS (
  SELECT 1 FROM chair_live_handoff_custody custody
   WHERE custody.coordination_run_id=NEW.run_id
     AND custody.state NOT IN ('terminal','no-effect')
     AND custody.promotion_action_id<>NEW.action_id
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_live_handoff_freezes_grants'); END;

DROP TRIGGER launched_chair_bridge_identity_immutable;
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
) AND NOT EXISTS (
  SELECT 1 FROM chair_live_handoff_custody custody
   WHERE custody.state='committing'
     AND OLD.state='active' AND NEW.state='active'
     AND custody.project_session_id=OLD.project_session_id
     AND custody.coordination_run_id=OLD.coordination_run_id
     AND custody.successor_agent_id=NEW.chair_agent_id
     AND custody.provider_adapter_id=NEW.provider_adapter_id
     AND custody.promotion_action_id=NEW.provider_action_id
     AND custody.provider_contract_digest=NEW.provider_contract_digest
     AND custody.provider_session_ref=NEW.provider_session_ref
     AND custody.provider_session_generation=NEW.provider_session_generation
     AND custody.expected_successor_principal_generation=NEW.principal_generation
     AND custody.new_bridge_generation=NEW.bridge_generation
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_launched_chair_bridge_identity_immutable'); END;

DROP TRIGGER launched_chair_bridge_state_cas;
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
    )) OR
  (OLD.state='active' AND NEW.state='active' AND NEW.revision=OLD.revision+1
    AND EXISTS (
      SELECT 1 FROM chair_live_handoff_custody custody
       WHERE custody.state='committing'
         AND custody.project_session_id=OLD.project_session_id
         AND custody.coordination_run_id=OLD.coordination_run_id
    ))
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_launched_chair_bridge_state_cas'); END;

DROP TRIGGER agent_bridge_active_retirement_guard;
CREATE TRIGGER agent_bridge_active_retirement_guard
BEFORE UPDATE OF bridge_state,provider_session_ref,provider_session_generation,
  capability_hash,activation_evidence_digest ON agent_bridge_state
WHEN OLD.bridge_state='active' AND NEW.bridge_state='none' AND NOT (
  EXISTS (
    SELECT 1 FROM runs run
    JOIN project_sessions session ON session.project_session_id=run.project_session_id
    JOIN capabilities capability ON capability.token_hash=OLD.capability_hash
    JOIN agents agent ON agent.run_id=OLD.run_id AND agent.agent_id=OLD.agent_id
    LEFT JOIN launched_chair_bridge_retirements retirement
      ON retirement.project_session_id=run.project_session_id
     AND retirement.coordination_run_id=run.run_id
    WHERE run.run_id=OLD.run_id
      AND run.lifecycle_state IN ('closed','cancelled','launch_failed')
      AND session.state IN ('closed','cancelled')
      AND capability.revoked_at IS NOT NULL AND agent.lifecycle='archived'
      AND retirement.coordination_run_id IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM provider_actions action
    JOIN capabilities capability ON capability.token_hash=OLD.capability_hash
    JOIN agents agent ON agent.run_id=OLD.run_id AND agent.agent_id=OLD.agent_id
    WHERE action.run_id=OLD.run_id AND action.target_agent_id=OLD.agent_id
      AND action.operation='release' AND action.status='terminal'
      AND action.provider_session_generation=OLD.provider_session_generation
      AND json_valid(action.payload_json)=1
      AND json_extract(action.payload_json,'$.resumeReference')=OLD.provider_session_ref
      AND capability.revoked_at IS NOT NULL AND agent.lifecycle='archived'
  ) OR EXISTS (
    SELECT 1 FROM chair_bridge_recovery_custody recovery
    JOIN chair_bridge_losses loss ON loss.loss_id=recovery.loss_id
    WHERE recovery.path='takeover' AND recovery.state='committing'
      AND loss.coordination_run_id=OLD.run_id
      AND recovery.successor_agent_id=OLD.agent_id
  ) OR EXISTS (
    SELECT 1 FROM chair_live_handoff_custody custody
     WHERE custody.state='committing'
       AND custody.coordination_run_id=OLD.run_id
       AND custody.successor_agent_id=OLD.agent_id
       AND custody.expected_successor_bridge_revision=OLD.revision
  )
)
BEGIN SELECT RAISE(ABORT,'INVARIANT_agent_bridge_active_retirement_proof'); END;

CREATE TRIGGER global_revision_chair_live_handoff_insert AFTER INSERT ON chair_live_handoff_custody
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_chair_live_handoff_update AFTER UPDATE ON chair_live_handoff_custody
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_chair_live_handoff_resolution_insert AFTER INSERT ON chair_live_handoff_resolutions
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

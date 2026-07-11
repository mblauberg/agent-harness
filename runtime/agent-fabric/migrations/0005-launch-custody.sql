-- Spec 01 v0.7 / Spec 04 v1.3 launch-custody extension. Additive to schema v4.

CREATE UNIQUE INDEX provider_actions_global_adapter_action
  ON provider_actions(adapter_id, action_id);

CREATE TABLE project_session_launch_custody (
  project_session_id TEXT NOT NULL,
  custody_attempt_generation INTEGER NOT NULL CHECK (custody_attempt_generation >= 1),
  coordination_run_id TEXT NOT NULL UNIQUE,
  chair_agent_id TEXT NOT NULL,
  chair_lease_id TEXT NOT NULL UNIQUE,
  operator_id TEXT NOT NULL,
  operator_command_id TEXT NOT NULL,
  provider_adapter_id TEXT NOT NULL,
  provider_action_id TEXT NOT NULL,
  capability_hash TEXT NOT NULL UNIQUE,
  capability_expires_at INTEGER NOT NULL,
  reservation_id TEXT NOT NULL UNIQUE,
  launch_packet_path TEXT NOT NULL,
  launch_packet_digest TEXT NOT NULL,
  authority_ref TEXT NOT NULL,
  budget_ref TEXT NOT NULL,
  resource_plan_path TEXT NOT NULL,
  resource_plan_digest TEXT NOT NULL,
  expected_project_revision INTEGER NOT NULL CHECK (expected_project_revision >= 1),
  expected_session_revision INTEGER NOT NULL CHECK (expected_session_revision >= 1),
  expected_session_generation INTEGER NOT NULL CHECK (expected_session_generation >= 1),
  trust_record_digest TEXT NOT NULL,
  provider_contract_digest TEXT NOT NULL,
  resource_state_digest TEXT NOT NULL,
  launch_binding_digest TEXT NOT NULL,
  retry_of_provider_adapter_id TEXT,
  retry_of_provider_action_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_session_id, custody_attempt_generation),
  UNIQUE (operator_id, operator_command_id),
  UNIQUE (provider_adapter_id, provider_action_id),
  FOREIGN KEY (project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY (coordination_run_id, chair_agent_id)
    REFERENCES agents(run_id, agent_id),
  FOREIGN KEY (chair_lease_id) REFERENCES run_chair_leases(lease_id),
  FOREIGN KEY (operator_id, operator_command_id)
    REFERENCES operator_commands(operator_id, command_id),
  FOREIGN KEY (capability_hash) REFERENCES capabilities(token_hash),
  FOREIGN KEY (reservation_id) REFERENCES resource_reservations(reservation_id),
  FOREIGN KEY (coordination_run_id, provider_action_id)
    REFERENCES provider_actions(run_id, action_id),
  FOREIGN KEY (provider_adapter_id, provider_action_id)
    REFERENCES provider_actions(adapter_id, action_id),
  FOREIGN KEY (retry_of_provider_adapter_id, retry_of_provider_action_id)
    REFERENCES provider_actions(adapter_id, action_id),
  CHECK (
    (retry_of_provider_adapter_id IS NULL AND retry_of_provider_action_id IS NULL) OR
    (retry_of_provider_adapter_id IS NOT NULL AND retry_of_provider_action_id IS NOT NULL)
  ),
  CHECK (length(launch_packet_digest)=71 AND substr(launch_packet_digest,1,7)='sha256:'),
  CHECK (length(authority_ref)=71 AND substr(authority_ref,1,7)='sha256:'),
  CHECK (length(resource_plan_digest)=71 AND substr(resource_plan_digest,1,7)='sha256:'),
  CHECK (length(trust_record_digest)=71 AND substr(trust_record_digest,1,7)='sha256:'),
  CHECK (length(provider_contract_digest)=71 AND substr(provider_contract_digest,1,7)='sha256:'),
  CHECK (length(resource_state_digest)=71 AND substr(resource_state_digest,1,7)='sha256:'),
  CHECK (length(launch_binding_digest)=71 AND substr(launch_binding_digest,1,7)='sha256:')
);

CREATE TRIGGER launch_custody_immutable_update
BEFORE UPDATE ON project_session_launch_custody
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_launch_custody_immutable');
END;

CREATE TRIGGER launch_custody_immutable_delete
BEFORE DELETE ON project_session_launch_custody
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_launch_custody_immutable');
END;

CREATE TRIGGER global_revision_project_session_launch_custody_insert
AFTER INSERT ON project_session_launch_custody
BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

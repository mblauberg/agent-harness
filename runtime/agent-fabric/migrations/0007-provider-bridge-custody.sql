-- Spec 01 v0.12 / Spec 04 v1.8 provider-session bridge custody.

ALTER TABLE project_session_launch_custody
  ADD COLUMN attestation_challenge_digest TEXT;

CREATE TRIGGER launch_custody_requires_attestation_challenge
BEFORE INSERT ON project_session_launch_custody
WHEN NEW.attestation_challenge_digest IS NULL
  OR length(NEW.attestation_challenge_digest) <> 71
  OR substr(NEW.attestation_challenge_digest, 1, 7) <> 'sha256:'
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_launch_attestation_challenge_digest');
END;

CREATE TABLE provider_agent_custody (
  run_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('spawn','attach')),
  actor_agent_id TEXT NOT NULL,
  target_agent_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  bridge_contract_digest TEXT NOT NULL,
  bridge_capable INTEGER NOT NULL CHECK (bridge_capable IN (0,1)),
  capability_hash TEXT UNIQUE,
  capability_expires_at INTEGER,
  principal_generation INTEGER CHECK (principal_generation IS NULL OR principal_generation >= 1),
  requested_provider_session_ref TEXT,
  intent_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, action_id),
  UNIQUE (adapter_id, action_id),
  FOREIGN KEY (run_id, action_id) REFERENCES provider_actions(run_id, action_id),
  FOREIGN KEY (adapter_id, action_id) REFERENCES provider_actions(adapter_id, action_id),
  FOREIGN KEY (run_id, actor_agent_id) REFERENCES agents(run_id, agent_id),
  FOREIGN KEY (run_id, target_agent_id) REFERENCES agents(run_id, agent_id),
  FOREIGN KEY (authority_id) REFERENCES authorities(authority_id),
  FOREIGN KEY (capability_hash) REFERENCES capabilities(token_hash),
  CHECK (length(bridge_contract_digest)=71 AND substr(bridge_contract_digest,1,7)='sha256:'),
  CHECK (length(intent_digest)=71 AND substr(intent_digest,1,7)='sha256:'),
  CHECK (operation <> 'spawn' OR bridge_capable=1),
  CHECK (
    (bridge_capable=1 AND capability_hash IS NOT NULL
      AND capability_expires_at IS NOT NULL AND principal_generation IS NOT NULL) OR
    (bridge_capable=0 AND capability_hash IS NULL
      AND capability_expires_at IS NULL AND principal_generation IS NULL)
  )
);

CREATE TRIGGER provider_agent_custody_immutable_update
BEFORE UPDATE ON provider_agent_custody
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_provider_agent_custody_immutable');
END;

CREATE TRIGGER provider_agent_custody_immutable_delete
BEFORE DELETE ON provider_agent_custody
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_provider_agent_custody_immutable');
END;

CREATE INDEX provider_agent_custody_by_target
  ON provider_agent_custody(run_id, target_agent_id, created_at DESC);

CREATE TABLE agent_bridge_state (
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  provider_session_ref TEXT,
  provider_session_generation INTEGER CHECK (
    provider_session_generation IS NULL OR provider_session_generation >= 1
  ),
  bridge_state TEXT NOT NULL CHECK (bridge_state IN ('pending','active','none','lost')),
  bridge_generation INTEGER NOT NULL CHECK (bridge_generation >= 1),
  capability_hash TEXT,
  activation_evidence_digest TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, agent_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id),
  FOREIGN KEY (run_id, action_id) REFERENCES provider_agent_custody(run_id, action_id),
  FOREIGN KEY (adapter_id, action_id) REFERENCES provider_agent_custody(adapter_id, action_id),
  FOREIGN KEY (capability_hash) REFERENCES capabilities(token_hash),
  CHECK ((provider_session_ref IS NULL)=(provider_session_generation IS NULL)),
  CHECK (
    (activation_evidence_digest IS NULL) OR
    (length(activation_evidence_digest)=71 AND substr(activation_evidence_digest,1,7)='sha256:')
  ),
  CHECK (
    (bridge_state='pending' AND capability_hash IS NOT NULL AND activation_evidence_digest IS NULL) OR
    (bridge_state='active' AND capability_hash IS NOT NULL AND provider_session_ref IS NOT NULL
      AND activation_evidence_digest IS NOT NULL) OR
    (bridge_state='none' AND capability_hash IS NULL AND activation_evidence_digest IS NULL) OR
    (bridge_state='lost' AND capability_hash IS NOT NULL AND provider_session_ref IS NOT NULL
      AND activation_evidence_digest IS NOT NULL)
  )
);

CREATE INDEX agent_bridge_state_by_supervision
  ON agent_bridge_state(bridge_state, adapter_id, updated_at, run_id, agent_id);

CREATE TABLE child_bridge_losses (
  loss_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  provider_session_ref TEXT NOT NULL,
  provider_session_generation INTEGER NOT NULL CHECK (provider_session_generation >= 1),
  lost_bridge_generation INTEGER NOT NULL CHECK (lost_bridge_generation >= 1),
  next_bridge_generation INTEGER NOT NULL CHECK (next_bridge_generation >= 2),
  capability_hash TEXT NOT NULL,
  daemon_instance_generation INTEGER NOT NULL CHECK (daemon_instance_generation >= 1),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 160),
  evidence_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (run_id, agent_id, lost_bridge_generation),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id),
  FOREIGN KEY (adapter_id, action_id) REFERENCES provider_agent_custody(adapter_id, action_id),
  FOREIGN KEY (capability_hash) REFERENCES capabilities(token_hash),
  CHECK (next_bridge_generation=lost_bridge_generation+1),
  CHECK (length(evidence_digest)=71 AND substr(evidence_digest,1,7)='sha256:')
);

CREATE TRIGGER child_bridge_losses_immutable_update
BEFORE UPDATE ON child_bridge_losses
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_child_bridge_losses_immutable');
END;

CREATE TRIGGER child_bridge_losses_immutable_delete
BEFORE DELETE ON child_bridge_losses
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_child_bridge_losses_immutable');
END;

CREATE TRIGGER global_revision_provider_agent_custody_insert
AFTER INSERT ON provider_agent_custody
BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_agent_bridge_state_insert
AFTER INSERT ON agent_bridge_state
BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_agent_bridge_state_update
AFTER UPDATE ON agent_bridge_state
BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_child_bridge_losses_insert
AFTER INSERT ON child_bridge_losses
BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

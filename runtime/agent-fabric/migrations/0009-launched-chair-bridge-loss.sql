-- Spec 01 v0.14 / Spec 04 v1.10 launched-chair retained-bridge custody.

CREATE TABLE launched_chair_bridge_state (
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  chair_agent_id TEXT NOT NULL,
  provider_adapter_id TEXT NOT NULL,
  provider_action_id TEXT NOT NULL,
  provider_session_ref TEXT NOT NULL,
  provider_session_generation INTEGER NOT NULL CHECK (provider_session_generation >= 1),
  principal_generation INTEGER NOT NULL CHECK (principal_generation >= 1),
  bridge_generation INTEGER NOT NULL CHECK (bridge_generation >= 1),
  capability_hash TEXT NOT NULL,
  activation_evidence_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active','lost')),
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
    REFERENCES project_session_launch_custody(provider_adapter_id, provider_action_id),
  FOREIGN KEY (capability_hash) REFERENCES capabilities(token_hash),
  CHECK (length(activation_evidence_digest)=71
    AND substr(activation_evidence_digest,1,7)='sha256:')
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
    REFERENCES project_session_launch_custody(provider_adapter_id, provider_action_id),
  FOREIGN KEY (capability_hash) REFERENCES capabilities(token_hash),
  CHECK (next_bridge_generation=lost_bridge_generation+1),
  CHECK (length(evidence_digest)=71 AND substr(evidence_digest,1,7)='sha256:'),
  CHECK (length(recovery_manifest_digest)=71 AND substr(recovery_manifest_digest,1,7)='sha256:')
);

CREATE TRIGGER launched_chair_bridge_identity_immutable
BEFORE UPDATE OF
  project_session_id, coordination_run_id, chair_agent_id,
  provider_adapter_id, provider_action_id, provider_session_ref,
  provider_session_generation, principal_generation, bridge_generation,
  capability_hash, activation_evidence_digest, created_at
ON launched_chair_bridge_state
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_launched_chair_bridge_identity_immutable');
END;

CREATE TRIGGER launched_chair_bridge_state_cas
BEFORE UPDATE OF state, revision ON launched_chair_bridge_state
WHEN OLD.state<>'active' OR NEW.state<>'lost' OR NEW.revision<>OLD.revision+1
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_launched_chair_bridge_state_cas');
END;

CREATE TRIGGER launched_chair_bridge_delete_forbidden
BEFORE DELETE ON launched_chair_bridge_state
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_launched_chair_bridge_identity_immutable');
END;

CREATE TRIGGER chair_bridge_losses_immutable_update
BEFORE UPDATE ON chair_bridge_losses
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_losses_immutable');
END;

CREATE TRIGGER chair_bridge_losses_immutable_delete
BEFORE DELETE ON chair_bridge_losses
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_losses_immutable');
END;

CREATE TRIGGER chair_bridge_loss_freezes_capability_grants
BEFORE INSERT ON capabilities
WHEN EXISTS (
  SELECT 1 FROM launched_chair_bridge_state bridge
   WHERE bridge.coordination_run_id=NEW.run_id AND bridge.state='lost'
)
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_freezes_grants');
END;

CREATE TRIGGER chair_bridge_loss_freezes_authority_grants
BEFORE INSERT ON authorities
WHEN EXISTS (
  SELECT 1 FROM launched_chair_bridge_state bridge
   WHERE bridge.coordination_run_id=NEW.run_id AND bridge.state='lost'
)
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_freezes_grants');
END;

CREATE TRIGGER chair_bridge_loss_blocks_run_reactivation
BEFORE UPDATE OF lifecycle_state ON runs
WHEN NEW.lifecycle_state='active' AND EXISTS (
  SELECT 1 FROM launched_chair_bridge_state bridge
   WHERE bridge.coordination_run_id=NEW.run_id AND bridge.state='lost'
)
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_requires_explicit_recovery');
END;

CREATE TRIGGER chair_bridge_loss_blocks_session_reactivation
BEFORE UPDATE OF state ON project_sessions
WHEN NEW.state='active' AND EXISTS (
  SELECT 1 FROM launched_chair_bridge_state bridge
   WHERE bridge.project_session_id=NEW.project_session_id AND bridge.state='lost'
)
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_requires_explicit_recovery');
END;

-- Upgrade-time active chairs become supervision obligations. The first startup
-- after migration must either find the exact volatile bridge or persist loss.
INSERT INTO launched_chair_bridge_state(
  project_session_id, coordination_run_id, chair_agent_id,
  provider_adapter_id, provider_action_id, provider_session_ref,
  provider_session_generation, principal_generation, bridge_generation,
  capability_hash, activation_evidence_digest, state, revision, created_at, updated_at
)
SELECT
  c.project_session_id, c.coordination_run_id, c.chair_agent_id,
  c.provider_adapter_id, c.provider_action_id, a.provider_session_ref,
  ps.provider_session_generation, cap.principal_generation, 1,
  c.capability_hash, json_extract(p.result_json, '$.outcome.effectDigest'),
  'active', 1, c.created_at, c.created_at
FROM project_session_launch_custody c
JOIN project_sessions s ON s.project_session_id=c.project_session_id AND s.state='active'
JOIN runs r ON r.run_id=c.coordination_run_id AND r.lifecycle_state='active'
JOIN agents a ON a.run_id=c.coordination_run_id AND a.agent_id=c.chair_agent_id
JOIN provider_state ps ON ps.run_id=c.coordination_run_id AND ps.agent_id=c.chair_agent_id
JOIN capabilities cap ON cap.token_hash=c.capability_hash AND cap.revoked_at IS NULL
JOIN provider_actions p
  ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
WHERE p.status='terminal' AND p.effect_count=1
  AND a.provider_session_ref IS NOT NULL
  AND json_valid(p.result_json)=1
  AND json_extract(p.result_json, '$.outcome.kind')='terminal-success';

CREATE TRIGGER global_revision_launched_chair_bridge_insert
AFTER INSERT ON launched_chair_bridge_state
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_launched_chair_bridge_update
AFTER UPDATE ON launched_chair_bridge_state
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_chair_bridge_loss_insert
AFTER INSERT ON chair_bridge_losses
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

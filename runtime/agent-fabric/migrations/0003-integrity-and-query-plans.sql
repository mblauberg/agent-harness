-- Additive integrity only: no table rebuilds, destructive rewrites or downgrade path.

CREATE INDEX IF NOT EXISTS deliveries_ready_mailbox
  ON deliveries(run_id, recipient_id, mailbox_sequence) WHERE state = 'ready';
CREATE INDEX IF NOT EXISTS tasks_by_state
  ON tasks(run_id, state, task_id);
CREATE INDEX IF NOT EXISTS tasks_by_owner
  ON tasks(run_id, owner_agent_id, state, task_id) WHERE owner_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leases_by_expiry
  ON leases(status, expires_at, run_id);
CREATE INDEX IF NOT EXISTS events_by_run_cursor
  ON events(run_id, event_id);
CREATE INDEX IF NOT EXISTS provider_actions_unresolved
  ON provider_actions(run_id, updated_at, action_id)
  WHERE status IN ('prepared', 'dispatched', 'ambiguous');

CREATE TRIGGER agents_values_insert BEFORE INSERT ON agents BEGIN
  SELECT CASE WHEN NEW.lifecycle NOT IN ('ready','completion-ready','suspended','context-unreconciled','archived')
    THEN RAISE(ABORT, 'INVARIANT_agents_lifecycle') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM authorities a WHERE a.authority_id=NEW.authority_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_agents_authority_same_run') END;
  SELECT CASE WHEN NEW.parent_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.parent_agent_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_agents_parent_same_run') END;
END;
CREATE TRIGGER agents_values_update BEFORE UPDATE OF lifecycle,authority_id,parent_agent_id,run_id ON agents BEGIN
  SELECT CASE WHEN NEW.lifecycle NOT IN ('ready','completion-ready','suspended','context-unreconciled','archived')
    THEN RAISE(ABORT, 'INVARIANT_agents_lifecycle') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM authorities a WHERE a.authority_id=NEW.authority_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_agents_authority_same_run') END;
  SELECT CASE WHEN NEW.parent_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.parent_agent_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_agents_parent_same_run') END;
END;

CREATE TRIGGER authorities_parent_insert BEFORE INSERT ON authorities
WHEN NEW.parent_authority_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM authorities a WHERE a.authority_id=NEW.parent_authority_id AND a.run_id=NEW.run_id)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_authorities_parent_same_run'); END;
CREATE TRIGGER authorities_parent_update BEFORE UPDATE OF parent_authority_id,run_id ON authorities
WHEN NEW.parent_authority_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM authorities a WHERE a.authority_id=NEW.parent_authority_id AND a.run_id=NEW.run_id)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_authorities_parent_same_run'); END;

CREATE TRIGGER tasks_values_insert BEFORE INSERT ON tasks BEGIN
  SELECT CASE WHEN NEW.state NOT IN ('blocked','ready','active','complete','cancelled','degraded') OR NEW.revision < 0 OR NEW.owner_lease_generation < 0
    THEN RAISE(ABORT, 'INVARIANT_tasks_values') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM authorities a WHERE a.authority_id=NEW.authority_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_tasks_authority_same_run') END;
  SELECT CASE WHEN NEW.owner_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.owner_agent_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_tasks_owner_same_run') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.created_by AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_tasks_creator_same_run') END;
END;
CREATE TRIGGER tasks_values_update BEFORE UPDATE OF state,revision,owner_lease_generation,authority_id,owner_agent_id,created_by,run_id ON tasks BEGIN
  SELECT CASE WHEN NEW.state NOT IN ('blocked','ready','active','complete','cancelled','degraded') OR NEW.revision < 0 OR NEW.owner_lease_generation < 0
    THEN RAISE(ABORT, 'INVARIANT_tasks_values') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM authorities a WHERE a.authority_id=NEW.authority_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_tasks_authority_same_run') END;
  SELECT CASE WHEN NEW.owner_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.owner_agent_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_tasks_owner_same_run') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.created_by AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_tasks_creator_same_run') END;
END;

CREATE TRIGGER messages_values_insert BEFORE INSERT ON messages BEGIN
  SELECT CASE WHEN NEW.requires_ack NOT IN (0,1) THEN RAISE(ABORT, 'INVARIANT_messages_requires_ack') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.sender_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_messages_sender_same_run') END;
  SELECT CASE WHEN NEW.reply_to_message_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.message_id=NEW.reply_to_message_id AND m.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_messages_reply_same_run') END;
END;
CREATE TRIGGER messages_values_update BEFORE UPDATE OF requires_ack,sender_id,reply_to_message_id,run_id ON messages BEGIN
  SELECT CASE WHEN NEW.requires_ack NOT IN (0,1) THEN RAISE(ABORT, 'INVARIANT_messages_requires_ack') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.sender_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_messages_sender_same_run') END;
  SELECT CASE WHEN NEW.reply_to_message_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.message_id=NEW.reply_to_message_id AND m.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_messages_reply_same_run') END;
END;

CREATE TRIGGER deliveries_values_insert BEFORE INSERT ON deliveries BEGIN
  SELECT CASE WHEN NEW.state NOT IN ('ready','claimed','acknowledged','abandoned','expired') OR NEW.attempt_count < 0 OR NEW.mailbox_sequence < 1
    THEN RAISE(ABORT, 'INVARIANT_deliveries_values') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM messages m WHERE m.message_id=NEW.message_id AND m.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_deliveries_message_same_run') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.recipient_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_deliveries_recipient_same_run') END;
END;
CREATE TRIGGER deliveries_values_update BEFORE UPDATE OF state,attempt_count,mailbox_sequence,message_id,recipient_id,run_id ON deliveries BEGIN
  SELECT CASE WHEN NEW.state NOT IN ('ready','claimed','acknowledged','abandoned','expired') OR NEW.attempt_count < 0 OR NEW.mailbox_sequence < 1
    THEN RAISE(ABORT, 'INVARIANT_deliveries_values') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM messages m WHERE m.message_id=NEW.message_id AND m.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_deliveries_message_same_run') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.recipient_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_deliveries_recipient_same_run') END;
END;

CREATE TRIGGER leases_values_insert BEFORE INSERT ON leases BEGIN
  SELECT CASE WHEN NEW.kind <> 'write' OR NEW.status NOT IN ('active','quarantined','released') OR NEW.generation < 1
    THEN RAISE(ABORT, 'INVARIANT_leases_values') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.holder_agent_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_leases_holder_same_run') END;
END;
CREATE TRIGGER leases_values_update BEFORE UPDATE OF kind,status,generation,holder_agent_id,run_id ON leases BEGIN
  SELECT CASE WHEN NEW.kind <> 'write' OR NEW.status NOT IN ('active','quarantined','released') OR NEW.generation < 1
    THEN RAISE(ABORT, 'INVARIANT_leases_values') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.holder_agent_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_leases_holder_same_run') END;
END;

CREATE TRIGGER provider_actions_values_insert BEFORE INSERT ON provider_actions BEGIN
  SELECT CASE WHEN NEW.status NOT IN ('prepared','dispatched','accepted','terminal','ambiguous','quarantined') OR NEW.execution_count < 0 OR NEW.effect_count < 0 OR NEW.idempotency_proven NOT IN (0,1) OR (NEW.provider_session_generation IS NOT NULL AND NEW.provider_session_generation < 1) OR (NEW.turn_lease_generation IS NOT NULL AND NEW.turn_lease_generation < 1)
    THEN RAISE(ABORT, 'INVARIANT_provider_actions_values') END;
  SELECT CASE WHEN NEW.operation NOT IN ('spawn','attach') AND NEW.target_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.target_agent_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_provider_actions_target_same_run') END;
END;
CREATE TRIGGER provider_actions_values_update BEFORE UPDATE OF status,execution_count,effect_count,idempotency_proven,provider_session_generation,turn_lease_generation,target_agent_id,run_id ON provider_actions BEGIN
  SELECT CASE WHEN NEW.status NOT IN ('prepared','dispatched','accepted','terminal','ambiguous','quarantined') OR NEW.execution_count < 0 OR NEW.effect_count < 0 OR NEW.idempotency_proven NOT IN (0,1) OR (NEW.provider_session_generation IS NOT NULL AND NEW.provider_session_generation < 1) OR (NEW.turn_lease_generation IS NOT NULL AND NEW.turn_lease_generation < 1)
    THEN RAISE(ABORT, 'INVARIANT_provider_actions_values') END;
  SELECT CASE WHEN NEW.operation NOT IN ('spawn','attach') AND NEW.target_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.target_agent_id AND a.run_id=NEW.run_id)
    THEN RAISE(ABORT, 'INVARIANT_provider_actions_target_same_run') END;
END;

CREATE TRIGGER authority_budget_boolean_insert BEFORE INSERT ON authority_budget
WHEN NEW.usage_unknown NOT IN (0,1) BEGIN SELECT RAISE(ABORT, 'INVARIANT_authority_budget_boolean'); END;
CREATE TRIGGER authority_budget_boolean_update BEFORE UPDATE OF usage_unknown ON authority_budget
WHEN NEW.usage_unknown NOT IN (0,1) BEGIN SELECT RAISE(ABORT, 'INVARIANT_authority_budget_boolean'); END;
CREATE TRIGGER capabilities_generation_insert BEFORE INSERT ON capabilities
WHEN NEW.principal_generation < 1 BEGIN SELECT RAISE(ABORT, 'INVARIANT_capabilities_generation'); END;
CREATE TRIGGER capabilities_generation_update BEFORE UPDATE OF principal_generation ON capabilities
WHEN NEW.principal_generation < 1 BEGIN SELECT RAISE(ABORT, 'INVARIANT_capabilities_generation'); END;
CREATE TRIGGER provider_state_generation_insert BEFORE INSERT ON provider_state
WHEN NEW.provider_session_generation < 1 BEGIN SELECT RAISE(ABORT, 'INVARIANT_provider_state_generation'); END;
CREATE TRIGGER provider_state_generation_update BEFORE UPDATE OF provider_session_generation ON provider_state
WHEN NEW.provider_session_generation < 1 BEGIN SELECT RAISE(ABORT, 'INVARIANT_provider_state_generation'); END;

CREATE TRIGGER events_actor_insert BEFORE INSERT ON events
WHEN NEW.actor_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.actor_agent_id AND a.run_id=NEW.run_id)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_events_actor_same_run'); END;
CREATE TRIGGER events_actor_update BEFORE UPDATE OF actor_agent_id,run_id ON events
WHEN NEW.actor_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.actor_agent_id AND a.run_id=NEW.run_id)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_events_actor_same_run'); END;

CREATE TRIGGER barriers_state_insert BEFORE INSERT ON barriers
WHEN NEW.state <> 'closed' BEGIN SELECT RAISE(ABORT, 'INVARIANT_barriers_state'); END;
CREATE TRIGGER barriers_state_update BEFORE UPDATE OF state ON barriers
WHEN NEW.state <> 'closed' BEGIN SELECT RAISE(ABORT, 'INVARIANT_barriers_state'); END;

CREATE TRIGGER teams_values_insert BEFORE INSERT ON teams
WHEN NEW.state NOT IN ('active','frozen','barrier-closed') OR NEW.generation < 1 OR NEW.depth < 1
BEGIN SELECT RAISE(ABORT, 'INVARIANT_teams_values'); END;
CREATE TRIGGER teams_values_update BEFORE UPDATE OF state,generation,depth ON teams
WHEN NEW.state NOT IN ('active','frozen','barrier-closed') OR NEW.generation < 1 OR NEW.depth < 1
BEGIN SELECT RAISE(ABORT, 'INVARIANT_teams_values'); END;

CREATE TRIGGER budgets_state_insert BEFORE INSERT ON budgets
WHEN NEW.state NOT IN ('active','usage-unknown','released') BEGIN SELECT RAISE(ABORT, 'INVARIANT_budgets_state'); END;
CREATE TRIGGER budgets_state_update BEFORE UPDATE OF state ON budgets
WHEN NEW.state NOT IN ('active','usage-unknown','released') BEGIN SELECT RAISE(ABORT, 'INVARIANT_budgets_state'); END;
CREATE TRIGGER budget_dimensions_values_insert BEFORE INSERT ON budget_dimensions
WHEN NEW.direct_usage_unknown NOT IN (0,1) OR NEW.usage_unknown NOT IN (0,1) OR NEW.granted < 0 OR NEW.reserved < 0 OR NEW.consumed < 0 OR NEW.reserved > NEW.granted OR NEW.consumed > NEW.granted
BEGIN SELECT RAISE(ABORT, 'INVARIANT_budget_dimensions_values'); END;
CREATE TRIGGER budget_dimensions_values_update BEFORE UPDATE OF direct_usage_unknown,usage_unknown,granted,reserved,consumed ON budget_dimensions
WHEN NEW.direct_usage_unknown NOT IN (0,1) OR NEW.usage_unknown NOT IN (0,1) OR NEW.granted < 0 OR NEW.reserved < 0 OR NEW.consumed < 0 OR NEW.reserved > NEW.granted OR NEW.consumed > NEW.granted
BEGIN SELECT RAISE(ABORT, 'INVARIANT_budget_dimensions_values'); END;

CREATE TRIGGER objective_check_status_insert BEFORE INSERT ON task_objective_checks
WHEN NEW.status NOT IN ('pending','pass','fail') BEGIN SELECT RAISE(ABORT, 'INVARIANT_objective_check_status'); END;
CREATE TRIGGER objective_check_status_update BEFORE UPDATE OF status ON task_objective_checks
WHEN NEW.status NOT IN ('pending','pass','fail') BEGIN SELECT RAISE(ABORT, 'INVARIANT_objective_check_status'); END;
CREATE TRIGGER human_gate_status_insert BEFORE INSERT ON task_human_gates
WHEN NEW.status NOT IN ('pending','approved','rejected') BEGIN SELECT RAISE(ABORT, 'INVARIANT_human_gate_status'); END;
CREATE TRIGGER human_gate_status_update BEFORE UPDATE OF status ON task_human_gates
WHEN NEW.status NOT IN ('pending','approved','rejected') BEGIN SELECT RAISE(ABORT, 'INVARIANT_human_gate_status'); END;

PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA trusted_schema = OFF;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT,
  checksum TEXT,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  chair_agent_id TEXT NOT NULL,
  workspace_root TEXT NOT NULL,
  project_run_directory TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS authorities (
  authority_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  parent_authority_id TEXT REFERENCES authorities(authority_id),
  authority_json TEXT NOT NULL,
  authority_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  agent_id TEXT NOT NULL,
  parent_agent_id TEXT,
  authority_id TEXT NOT NULL REFERENCES authorities(authority_id),
  provider_session_ref TEXT,
  lifecycle TEXT NOT NULL DEFAULT 'ready',
  PRIMARY KEY (run_id, agent_id)
);

CREATE TABLE IF NOT EXISTS authority_budget (
  authority_id TEXT NOT NULL REFERENCES authorities(authority_id),
  unit_key TEXT NOT NULL,
  granted INTEGER NOT NULL CHECK (granted >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= granted),
  consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed >= 0 AND consumed <= granted),
  usage_unknown INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (authority_id, unit_key)
);

CREATE TABLE IF NOT EXISTS tasks (
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  task_id TEXT NOT NULL,
  authority_id TEXT NOT NULL REFERENCES authorities(authority_id),
  objective TEXT NOT NULL,
  base_revision TEXT NOT NULL,
  state TEXT NOT NULL,
  owner_agent_id TEXT,
  revision INTEGER NOT NULL,
  owner_lease_generation INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  PRIMARY KEY (run_id, task_id)
);

CREATE TABLE IF NOT EXISTS task_eligible_agents (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  PRIMARY KEY (run_id, task_id, agent_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE IF NOT EXISTS artifacts (
  artifact_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  task_id TEXT,
  publisher_agent_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (run_id, relative_path, sha256),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE IF NOT EXISTS barriers (
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  scope TEXT NOT NULL,
  stage_id TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL,
  closed_at INTEGER,
  receipt_sha256 TEXT,
  PRIMARY KEY (run_id, scope, stage_id)
);

CREATE TABLE IF NOT EXISTS receipt_exports (
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  exported_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, relative_path, sha256)
);

CREATE TABLE IF NOT EXISTS capabilities (
  token_hash TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  principal_generation INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  audience_json TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  requires_ack INTEGER NOT NULL,
  conversation_id TEXT NOT NULL,
  reply_to_message_id TEXT,
  task_revision INTEGER,
  hop_count INTEGER NOT NULL DEFAULT 0 CHECK (hop_count >= 0 AND hop_count <= 4),
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (run_id, sender_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS mailbox_state (
  run_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  next_sequence INTEGER NOT NULL DEFAULT 1,
  contiguous_watermark INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, recipient_id),
  FOREIGN KEY (run_id, recipient_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE IF NOT EXISTS deliveries (
  delivery_id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(message_id),
  run_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  mailbox_sequence INTEGER NOT NULL,
  state TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  claim_deadline INTEGER,
  acknowledged_at INTEGER,
  resolution_reason TEXT,
  resolved_at INTEGER,
  UNIQUE (message_id, recipient_id),
  UNIQUE (run_id, recipient_id, mailbox_sequence)
);

CREATE TABLE IF NOT EXISTS leases (
  lease_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  holder_agent_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  status TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS write_scope_entries (
  lease_id TEXT NOT NULL REFERENCES leases(lease_id),
  canonical_path TEXT NOT NULL,
  PRIMARY KEY (lease_id, canonical_path)
);

CREATE TABLE IF NOT EXISTS revocation_proofs (
  proof_id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL REFERENCES leases(lease_id),
  generation INTEGER NOT NULL,
  kind TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS commands (
  run_id TEXT NOT NULL,
  actor_agent_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, actor_agent_id, command_id)
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  actor_agent_id TEXT,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lifecycle_checkpoints (
  checkpoint_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  agent_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  checkpoint_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (run_id, agent_id, sha256)
);

CREATE TABLE IF NOT EXISTS provider_state (
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  provider_session_generation INTEGER NOT NULL DEFAULT 1,
  context_revision TEXT,
  reconciled_checkpoint_sha256 TEXT,
  PRIMARY KEY (run_id, agent_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE IF NOT EXISTS provider_actions (
  run_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  target_agent_id TEXT,
  provider_session_generation INTEGER,
  turn_lease_generation INTEGER,
  identity_hash TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  history_json TEXT NOT NULL,
  execution_count INTEGER NOT NULL,
  effect_count INTEGER NOT NULL,
  idempotency_proven INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, action_id)
);

CREATE TABLE IF NOT EXISTS provider_session_turn_leases (
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  agent_id TEXT NOT NULL,
  provider_session_generation INTEGER NOT NULL CHECK (provider_session_generation >= 1),
  turn_lease_generation INTEGER NOT NULL CHECK (turn_lease_generation >= 1),
  action_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'quarantined', 'released')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, agent_id, turn_lease_generation),
  UNIQUE (run_id, action_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id),
  FOREIGN KEY (run_id, action_id) REFERENCES provider_actions(run_id, action_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_unresolved_provider_turn_per_session
  ON provider_session_turn_leases(run_id, agent_id)
  WHERE status IN ('active', 'quarantined');

CREATE TABLE IF NOT EXISTS provider_lifecycle_intents (
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  action_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('spawn', 'attach')),
  actor_agent_id TEXT NOT NULL,
  target_agent_id TEXT NOT NULL,
  authority_id TEXT NOT NULL REFERENCES authorities(authority_id),
  adapter_id TEXT NOT NULL,
  requested_resume_reference TEXT,
  intent_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('prepared', 'provider-terminal', 'finalized', 'quarantined')),
  provider_resume_reference TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, action_id)
);

CREATE TABLE IF NOT EXISTS model_routing_evidence (
  evidence_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  action_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (run_id, action_id)
);

CREATE TABLE IF NOT EXISTS cross_family_review_evidence (
  evidence_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  reviewer_agent_id TEXT NOT NULL,
  provider_family TEXT NOT NULL,
  status TEXT NOT NULL,
  independent INTEGER NOT NULL CHECK (independent IN (0, 1)),
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS operator_interventions (
  intervention_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  actor_agent_id TEXT NOT NULL,
  source TEXT NOT NULL,
  direct_input_provenance TEXT NOT NULL,
  task_revision INTEGER NOT NULL,
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lifecycle_operations (
  operation_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL,
  checkpoint_sha256 TEXT NOT NULL,
  prior_resume_reference TEXT,
  replacement_resume_reference TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_participants (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  PRIMARY KEY (run_id, task_id, agent_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  dependency_task_id TEXT NOT NULL,
  PRIMARY KEY (run_id, task_id, dependency_task_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id),
  FOREIGN KEY (run_id, dependency_task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE IF NOT EXISTS task_proposals (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  proposed_owner_agent_id TEXT,
  PRIMARY KEY (run_id, task_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE IF NOT EXISTS teams (
  run_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  parent_team_id TEXT,
  depth INTEGER NOT NULL,
  leader_agent_id TEXT NOT NULL,
  original_leader_agent_id TEXT NOT NULL,
  successor_agent_id TEXT,
  root_task_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  budget_id TEXT NOT NULL,
  state TEXT NOT NULL,
  generation INTEGER NOT NULL,
  handoff_evidence TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, team_id)
);

CREATE TABLE IF NOT EXISTS team_members (
  run_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  PRIMARY KEY (run_id, team_id, agent_id),
  FOREIGN KEY (run_id, team_id) REFERENCES teams(run_id, team_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE IF NOT EXISTS team_owned_tasks (
  run_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  PRIMARY KEY (run_id, team_id, task_id),
  UNIQUE (run_id, task_id),
  FOREIGN KEY (run_id, team_id) REFERENCES teams(run_id, team_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE IF NOT EXISTS discussion_groups (
  run_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  team_id TEXT,
  created_by TEXT NOT NULL,
  PRIMARY KEY (run_id, group_id)
);

CREATE TABLE IF NOT EXISTS discussion_group_members (
  run_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  PRIMARY KEY (run_id, group_id, agent_id),
  FOREIGN KEY (run_id, group_id) REFERENCES discussion_groups(run_id, group_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE IF NOT EXISTS message_contexts (
  message_id TEXT PRIMARY KEY REFERENCES messages(message_id),
  context_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  run_id TEXT NOT NULL,
  budget_id TEXT NOT NULL,
  parent_budget_id TEXT,
  team_id TEXT NOT NULL,
  owner_agent_id TEXT NOT NULL,
  state TEXT NOT NULL,
  returned_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, budget_id)
);

CREATE TABLE IF NOT EXISTS budget_dimensions (
  run_id TEXT NOT NULL,
  budget_id TEXT NOT NULL,
  unit_key TEXT NOT NULL,
  granted INTEGER NOT NULL,
  reserved INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  direct_usage_unknown INTEGER NOT NULL DEFAULT 0,
  usage_unknown INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, budget_id, unit_key),
  FOREIGN KEY (run_id, budget_id) REFERENCES budgets(run_id, budget_id)
);

CREATE TABLE IF NOT EXISTS subtree_barriers (
  run_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  closed_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, team_id, generation)
);

CREATE TABLE IF NOT EXISTS agent_adapter_bindings (
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  contract_version INTEGER NOT NULL DEFAULT 1,
  bound_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, agent_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE IF NOT EXISTS task_expected_artifacts (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  PRIMARY KEY (run_id, task_id, relative_path),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE IF NOT EXISTS task_objective_checks (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  check_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  evidence TEXT,
  PRIMARY KEY (run_id, task_id, check_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE IF NOT EXISTS task_human_gates (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  gate_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  evidence TEXT,
  PRIMARY KEY (run_id, task_id, gate_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE IF NOT EXISTS task_handoff_acknowledgements (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL,
  owner_lease_generation INTEGER NOT NULL,
  intended_next_owner_agent_id TEXT NOT NULL,
  acknowledged_by TEXT NOT NULL,
  acknowledged_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, task_id, task_revision, owner_lease_generation)
);

CREATE TABLE IF NOT EXISTS task_owner_recoveries (
  recovery_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  predecessor_agent_id TEXT NOT NULL,
  successor_agent_id TEXT NOT NULL,
  prior_generation INTEGER NOT NULL,
  new_generation INTEGER NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_owner_recovery_proofs (
  proof_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  owner_lease_generation INTEGER NOT NULL,
  predecessor_agent_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_freezes (
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, agent_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE IF NOT EXISTS run_metadata (
  run_id TEXT PRIMARY KEY REFERENCES runs(run_id),
  execution_profile TEXT NOT NULL DEFAULT 'unconfigured'
);

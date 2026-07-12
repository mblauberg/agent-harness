-- Generated pre-release Agent Fabric schema baseline.
-- Fresh databases only: existing non-current state is rejected before mutation.

CREATE TABLE fabric_schema (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  epoch TEXT NOT NULL CHECK (epoch = 'agent-fabric-pre-release-v1'),
  baseline_sha256 TEXT NOT NULL CHECK (length(baseline_sha256) = 64),
  catalog_sha256 TEXT NOT NULL CHECK (length(catalog_sha256) = 64)
);

CREATE TABLE agent_adapter_bindings (
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  contract_version INTEGER NOT NULL DEFAULT 1,
  bound_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, agent_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

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

CREATE TABLE agents (
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  agent_id TEXT NOT NULL,
  parent_agent_id TEXT,
  authority_id TEXT NOT NULL REFERENCES authorities(authority_id),
  provider_session_ref TEXT,
  lifecycle TEXT NOT NULL DEFAULT 'ready',
  PRIMARY KEY (run_id, agent_id)
);

CREATE TABLE artifact_content_cursor_keys (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  key_material TEXT NOT NULL CHECK(length(key_material) >= 43)
);

CREATE TABLE artifacts (
  artifact_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  project_session_id TEXT,
  run_id TEXT,
  task_id TEXT,
  publisher_kind TEXT NOT NULL
    CHECK (publisher_kind IN ('agent','operator','fabric','project','migration')),
  publisher_ref TEXT NOT NULL,
  publisher_agent_id TEXT,
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('project-file','run-file','git-private-diff')),
  evidence_kind TEXT NOT NULL
    CHECK (evidence_kind IN ('artifact','diff','test','review','receipt')),
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL
    CHECK (length(sha256)=71 AND substr(sha256,1,7)='sha256:'),
  registry_state TEXT NOT NULL
    CHECK (registry_state IN ('active','quarantined')),
  quarantine_reason TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at INTEGER NOT NULL,
  FOREIGN KEY(project_session_id, project_id)
    REFERENCES project_sessions(project_session_id, project_id),
  FOREIGN KEY(project_session_id, run_id)
    REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY(run_id, task_id) REFERENCES tasks(run_id, task_id),
  FOREIGN KEY(run_id, publisher_agent_id) REFERENCES agents(run_id, agent_id),
  CHECK ((registry_state='active' AND quarantine_reason IS NULL) OR
         (registry_state='quarantined' AND quarantine_reason IS NOT NULL)),
  CHECK (
    (source_kind='project-file') OR
    (source_kind='run-file' AND project_session_id IS NOT NULL AND run_id IS NOT NULL) OR
    (source_kind='git-private-diff' AND run_id IS NULL AND task_id IS NULL)
  ),
  CHECK (run_id IS NOT NULL OR task_id IS NULL),
  CHECK ((run_id IS NULL AND project_session_id IS NULL) OR project_session_id IS NOT NULL),
  CHECK ((publisher_kind='agent' AND publisher_agent_id=publisher_ref AND run_id IS NOT NULL) OR
         (publisher_kind<>'agent' AND publisher_agent_id IS NULL))
);

CREATE TABLE attention_items (
  item_id TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL REFERENCES project_sessions(project_session_id),
  coordination_run_id TEXT,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  state TEXT NOT NULL CHECK (state IN ('open','acknowledged','resolved','cancelled')),
  dedupe_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_session_id, dedupe_key)
);

CREATE TABLE authorities (
  authority_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  parent_authority_id TEXT REFERENCES authorities(authority_id),
  authority_json TEXT NOT NULL,
  authority_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE authority_budget (
  authority_id TEXT NOT NULL REFERENCES authorities(authority_id),
  unit_key TEXT NOT NULL,
  granted INTEGER NOT NULL CHECK (granted >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= granted),
  consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed >= 0 AND consumed <= granted),
  usage_unknown INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (authority_id, unit_key)
);

CREATE TABLE barriers (
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  scope TEXT NOT NULL,
  stage_id TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL,
  closed_at INTEGER,
  receipt_sha256 TEXT,
  PRIMARY KEY (run_id, scope, stage_id)
);

CREATE TABLE bootstrap_audit_receipts (
  action_id TEXT PRIMARY KEY,
  election_generation INTEGER NOT NULL UNIQUE CHECK (election_generation >= 1),
  attempt_digest TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('succeeded','failed','expired','ambiguous')),
  receipt_json TEXT NOT NULL,
  imported_instance_generation INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE budget_dimensions (
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

CREATE TABLE budgets (
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

CREATE TABLE capabilities (
  token_hash TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  principal_generation INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

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

CREATE TABLE commands (
  run_id TEXT NOT NULL,
  actor_agent_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, actor_agent_id, command_id)
);

CREATE TABLE cross_family_review_evidence (
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

CREATE TABLE daemon_global_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  revision INTEGER NOT NULL CHECK (revision >= 1)
);

CREATE TABLE daemon_runtime_epochs (
  instance_generation INTEGER PRIMARY KEY CHECK (instance_generation >= 1),
  instance_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('starting','running','quiescing','stopped','crashed')),
  observed_global_revision INTEGER CHECK (
    observed_global_revision IS NULL OR observed_global_revision >= 1
  ),
  started_at INTEGER NOT NULL,
  heartbeat_at INTEGER NOT NULL,
  stopped_at INTEGER
);

CREATE TABLE deliveries (
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

CREATE TABLE delivery_freezes (
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, agent_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE dependency_mutation_guards (
  run_id TEXT PRIMARY KEY REFERENCES runs(run_id),
  project_session_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL CHECK (target_revision >= 1),
  expected_edge_count INTEGER NOT NULL CHECK (expected_edge_count >= 0),
  expected_binding_count INTEGER NOT NULL CHECK (expected_binding_count >= 0)
);

CREATE TABLE discussion_group_members (
  run_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  PRIMARY KEY (run_id, group_id, agent_id),
  FOREIGN KEY (run_id, group_id) REFERENCES discussion_groups(run_id, group_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE discussion_groups (
  run_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  team_id TEXT,
  created_by TEXT NOT NULL,
  PRIMARY KEY (run_id, group_id)
);

CREATE TABLE events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  actor_agent_id TEXT,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE git_custody_resolutions(
  resolution_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES git_operation_drafts(draft_id),
  resolution_operation_id TEXT NOT NULL UNIQUE REFERENCES operation_admissions(operation_id),
  target_custody_id TEXT NOT NULL UNIQUE REFERENCES operator_git_effect_bindings(custody_id),
  target_operation_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  expected_lookup_generation INTEGER NOT NULL CHECK(expected_lookup_generation>=1),
  lookup_evidence_digest TEXT NOT NULL,
  eligibility_reason TEXT NOT NULL CHECK(eligibility_reason IN (
    'inspector-unavailable','remote-proof-permanently-unavailable','mixed-local-remote-evidence',
    'evidence-integrity-failure','conflict-state-unverifiable'
  )),
  adjudication TEXT NOT NULL CHECK(adjudication IN ('applied','no-effect','quarantine-accepted')),
  reason TEXT NOT NULL CHECK(length(reason)>0),
  gate_id TEXT NOT NULL,
  gate_revision INTEGER NOT NULL CHECK(gate_revision>=1),
  resolved_by_operator_id TEXT NOT NULL,
  operator_input_record_digest TEXT NOT NULL,
  reservation_disposition TEXT NOT NULL CHECK(reservation_disposition IN ('released','retired')),
  resolution_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(project_session_id,coordination_run_id) REFERENCES runs(project_session_id,run_id),
  FOREIGN KEY(target_operation_id) REFERENCES operation_admissions(operation_id),
  FOREIGN KEY(gate_id,resolution_operation_id) REFERENCES scoped_gate_operations(gate_id,operation_id),
  CHECK((adjudication='quarantine-accepted')=(reservation_disposition='retired'))
);

CREATE TABLE git_execution_profiles(
  profile_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>=1),
  profile_digest TEXT NOT NULL,
  git_binary_path TEXT NOT NULL,
  git_binary_version TEXT NOT NULL,
  git_binary_digest TEXT NOT NULL,
  object_format TEXT NOT NULL CHECK(object_format IN ('sha1','sha256')),
  merge_backend_id TEXT NOT NULL,
  rebase_backend_id TEXT NOT NULL,
  environment_digest TEXT NOT NULL,
  helper_registry_digest TEXT NOT NULL,
  inspector_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('active','revoked')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(profile_id,revision),
  UNIQUE(profile_id,revision,profile_digest),
  CHECK(length(profile_digest)=71 AND substr(profile_digest,1,7)='sha256:'),
  CHECK(length(git_binary_digest)=71 AND substr(git_binary_digest,1,7)='sha256:'),
  CHECK(length(environment_digest)=71 AND substr(environment_digest,1,7)='sha256:'),
  CHECK(length(helper_registry_digest)=71 AND substr(helper_registry_digest,1,7)='sha256:'),
  CHECK(length(inspector_digest)=71 AND substr(inspector_digest,1,7)='sha256:')
);

CREATE TABLE git_mutation_reservations(
  custody_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation>=1),
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  git_common_dir TEXT NOT NULL,
  common_dir_identity_digest TEXT NOT NULL,
  lock_plan_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN (
    'reserved','dispatching','conflict','ambiguous','quarantined','released','retired'
  )),
  owner_instance_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(custody_id,generation),
  FOREIGN KEY(custody_id) REFERENCES operator_effect_custody(custody_id),
  FOREIGN KEY(project_session_id,coordination_run_id) REFERENCES runs(project_session_id,run_id)
);

CREATE TABLE git_operation_drafts(
  draft_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK(revision>=1),
  draft_request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  observed_session_revision INTEGER NOT NULL CHECK(observed_session_revision>=1),
  session_generation INTEGER NOT NULL CHECK(session_generation>=1),
  coordination_run_id TEXT NOT NULL,
  observed_run_revision INTEGER NOT NULL CHECK(observed_run_revision>=1),
  observed_dependency_revision INTEGER NOT NULL CHECK(observed_dependency_revision>=1),
  authority_ref TEXT NOT NULL,
  authority_revision INTEGER NOT NULL CHECK(authority_revision>=1),
  git_allowlist_epoch INTEGER NOT NULL CHECK(git_allowlist_epoch>=1),
  git_allowlist_digest TEXT,
  draft_kind TEXT NOT NULL CHECK(draft_kind IN ('mutation','custody-resolution')),
  operation_id TEXT NOT NULL UNIQUE,
  operation_kind TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  binding_json TEXT NOT NULL CHECK(json_valid(binding_json)),
  draft_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('open','gate-bound','consumed','stale','expired','cancelled')),
  expires_at INTEGER NOT NULL,
  consumed_command_id TEXT,
  terminal_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(operator_id,project_id,project_session_id,draft_request_id),
  UNIQUE(draft_id,operation_id),
  FOREIGN KEY(project_session_id,coordination_run_id) REFERENCES runs(project_session_id,run_id),
  FOREIGN KEY(operation_id) REFERENCES operation_admissions(operation_id),
  CHECK((state='consumed')=(consumed_command_id IS NOT NULL)),
  CHECK((state IN ('stale','expired','cancelled'))=(terminal_reason IS NOT NULL))
);

CREATE TABLE git_remote_registrations(
  registration_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>=1),
  generation INTEGER NOT NULL CHECK(generation>=1),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  remote_name TEXT NOT NULL,
  transport_kind TEXT NOT NULL CHECK(transport_kind IN ('local','ssh','https','provider-port')),
  target_identity TEXT NOT NULL,
  target_digest TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  adapter_contract_digest TEXT NOT NULL,
  credential_selector_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('active','revoked')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(registration_id,revision),
  UNIQUE(registration_id,revision,generation,target_digest),
  CHECK(length(target_digest)=71 AND substr(target_digest,1,7)='sha256:'),
  CHECK(length(adapter_contract_digest)=71 AND substr(adapter_contract_digest,1,7)='sha256:'),
  CHECK(length(credential_selector_digest)=71 AND substr(credential_selector_digest,1,7)='sha256:')
);

CREATE TABLE intake_artifact_bindings (
  intake_id TEXT NOT NULL,
  intake_revision INTEGER NOT NULL,
  artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id),
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY(intake_id, intake_revision, artifact_id),
  UNIQUE(intake_id, intake_revision, relative_path, sha256),
  FOREIGN KEY(intake_id, intake_revision) REFERENCES intake_revisions(intake_id, revision)
);

CREATE TABLE intake_gate_bindings (
  intake_id TEXT NOT NULL,
  intake_revision INTEGER NOT NULL,
  gate_id TEXT NOT NULL,
  gate_revision INTEGER NOT NULL CHECK (gate_revision >= 1),
  PRIMARY KEY(intake_id, intake_revision, gate_id),
  FOREIGN KEY(intake_id, intake_revision) REFERENCES intake_revisions(intake_id, revision)
);

CREATE TABLE intake_revisions (
  intake_id TEXT NOT NULL REFERENCES intakes(intake_id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  state TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  actor_ref TEXT NOT NULL,
  created_at INTEGER NOT NULL, accepted_scope_artifact_id TEXT REFERENCES artifacts(artifact_id), accepted_scope_state TEXT NOT NULL DEFAULT 'not-applicable',
  PRIMARY KEY(intake_id, revision)
);

CREATE TABLE intakes (
  intake_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  project_session_id TEXT,
  coordination_run_id TEXT,
  dedupe_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft','awaiting-chair','discussing','awaiting-human','accepted','deferred','cancelled')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  chair_request_id TEXT,
  chair_request_revision INTEGER,
  summary TEXT NOT NULL,
  artifact_refs_json TEXT NOT NULL,
  gate_ids_json TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL, accepted_scope_artifact_id TEXT REFERENCES artifacts(artifact_id), accepted_scope_state TEXT NOT NULL DEFAULT 'not-applicable',
  UNIQUE(project_id, dedupe_key),
  FOREIGN KEY(project_session_id, coordination_run_id) REFERENCES runs(project_session_id, run_id),
  CHECK ((state = 'draft' AND project_session_id IS NULL AND coordination_run_id IS NULL) OR
         (state <> 'draft' AND project_session_id IS NOT NULL AND coordination_run_id IS NOT NULL))
);

CREATE TABLE integration_availability (
  integration_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('available','unavailable','stale')),
  discovered_contract_json TEXT NOT NULL,
  checked_at INTEGER NOT NULL
);

CREATE TABLE launched_chair_bridge_retirements(
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN (
    'project-session-close','project-session-stop','chair-recovery-abandon'
  )),
  terminal_kind TEXT NOT NULL CHECK(terminal_kind IN (
    'accepted','cancelled','failed','closed','launch-failed'
  )),
  terminal_ref TEXT NOT NULL CHECK(length(terminal_ref)>0),
  owner_operator_id TEXT NOT NULL CHECK(length(owner_operator_id)>0),
  owner_ref TEXT NOT NULL CHECK(length(owner_ref)>0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(project_session_id,coordination_run_id),
  FOREIGN KEY(project_session_id,coordination_run_id)
    REFERENCES launched_chair_bridge_state(project_session_id,coordination_run_id)
);

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

CREATE TABLE leases (
  lease_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  holder_agent_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  status TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE lifecycle_checkpoints (
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

CREATE TABLE lifecycle_operations (
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

CREATE TABLE mailbox_state (
  run_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  next_sequence INTEGER NOT NULL DEFAULT 1,
  contiguous_watermark INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, recipient_id),
  FOREIGN KEY (run_id, recipient_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE message_contexts (
  message_id TEXT PRIMARY KEY REFERENCES messages(message_id),
  context_json TEXT NOT NULL
);

CREATE TABLE messages (
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

CREATE TABLE model_routing_evidence (
  evidence_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  action_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (run_id, action_id)
);

CREATE TABLE notification_attempts (
  notification_id TEXT NOT NULL REFERENCES notification_deliveries(notification_id),
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  state TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(notification_id, attempt)
);

CREATE TABLE notification_deliveries (
  notification_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES attention_items(item_id),
  item_revision INTEGER NOT NULL CHECK (item_revision >= 1),
  target_integration TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('pending','claimed','sent','failed','deduplicated','ambiguous')),
  claim_generation INTEGER NOT NULL CHECK (claim_generation >= 0),
  claim_deadline INTEGER,
  effect_identity_hash TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(item_id, item_revision, target_integration)
);

CREATE TABLE observer_event_sequence (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id)
);

CREATE TABLE operation_admissions(
  operation_id TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  operation_kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN (
    'prepared','authorised','executing','conflict','ambiguous','quarantined','terminal','cancelled'
  )),
  revision INTEGER NOT NULL CHECK(revision>=1),
  payload_digest TEXT NOT NULL,
  FOREIGN KEY(project_session_id,coordination_run_id) REFERENCES runs(project_session_id,run_id)
);

CREATE TABLE operator_capabilities (
  capability_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  operator_id TEXT NOT NULL REFERENCES operator_principals(operator_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  project_session_id TEXT,
  project_authority_generation INTEGER NOT NULL CHECK (project_authority_generation >= 1),
  session_generation INTEGER CHECK (session_generation IS NULL OR session_generation >= 1),
  principal_generation INTEGER NOT NULL CHECK (principal_generation >= 1),
  kind TEXT NOT NULL CHECK (kind IN ('project-launch','session','takeover')),
  operations_json TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  handoff_digest TEXT,
  old_chair_generation INTEGER,
  expected_run_id TEXT,
  expected_run_revision INTEGER,
  expected_session_revision INTEGER,
  cas_target_revision INTEGER,
  FOREIGN KEY(project_session_id, project_id) REFERENCES project_sessions(project_session_id, project_id)
);

CREATE TABLE operator_client_attachments (
  attachment_id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operator_principals(operator_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  project_authority_generation INTEGER NOT NULL CHECK (project_authority_generation >= 1),
  project_session_id TEXT,
  session_generation INTEGER,
  daemon_instance_generation INTEGER NOT NULL CHECK (daemon_instance_generation >= 1),
  lease_generation INTEGER NOT NULL CHECK (lease_generation >= 1),
  state TEXT NOT NULL CHECK (state IN ('active','detached','expired')),
  expires_at INTEGER NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(project_session_id, project_id) REFERENCES project_sessions(project_session_id, project_id)
);

CREATE TABLE operator_commands (
  operator_id TEXT NOT NULL REFERENCES operator_principals(operator_id),
  command_id TEXT NOT NULL,
  capability_id TEXT NOT NULL REFERENCES operator_capabilities(capability_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  project_session_id TEXT,
  operation TEXT NOT NULL,
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
  payload_hash TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('committed','rejected')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(operator_id, command_id)
);

CREATE TABLE operator_control_fences (
  fence_id TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('task','subtree','run','session')),
  target_revision INTEGER NOT NULL CHECK (target_revision >= 1),
  session_generation INTEGER NOT NULL CHECK (session_generation >= 1),
  command_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('paused','released','cancelled')),
  created_at INTEGER NOT NULL,
  released_at INTEGER,
  FOREIGN KEY (project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY (coordination_run_id, task_id)
    REFERENCES tasks(run_id, task_id),
  CHECK ((state='paused' AND released_at IS NULL) OR (state<>'paused' AND released_at IS NOT NULL))
);

CREATE TABLE operator_daemon_stop_custody(
  daemon_instance_generation INTEGER NOT NULL CHECK(daemon_instance_generation>=1),
  observed_global_revision INTEGER NOT NULL CHECK(observed_global_revision>=1),
  custody_id TEXT PRIMARY KEY REFERENCES operator_effect_custody(custody_id),
  operator_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  principal_generation INTEGER NOT NULL CHECK(principal_generation>=1),
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation='daemon-stop'),
  result_correlation_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('prepared','scheduled','stopped','failed','rejected','no-effect')),
  result_json TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(operator_id,project_id,project_session_id,command_id),
  FOREIGN KEY(project_session_id,project_id) REFERENCES project_sessions(project_session_id,project_id)
);

CREATE TABLE operator_effect_custody(
  custody_id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  principal_generation INTEGER NOT NULL CHECK(principal_generation>=1),
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  intent_digest TEXT NOT NULL,
  before_state_digest TEXT NOT NULL,
  intent_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN (
    'prepared','dispatching','conflict','ambiguous','quarantined','terminal','no-effect','rejected','failed'
  )),
  effect_path TEXT,
  effect_digest TEXT,
  outcome_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(operator_id,project_id,project_session_id,command_id),
  FOREIGN KEY(project_session_id,project_id) REFERENCES project_sessions(project_session_id,project_id),
  CHECK((effect_path IS NULL)=(effect_digest IS NULL)),
  CHECK(effect_digest IS NULL OR (length(effect_digest)=71 AND substr(effect_digest,1,7)='sha256:')),
  CHECK(length(intent_digest)=71 AND substr(intent_digest,1,7)='sha256:'),
  CHECK(length(before_state_digest)=71 AND substr(before_state_digest,1,7)='sha256:')
);

CREATE TABLE operator_external_effect_bindings(
  custody_id TEXT PRIMARY KEY REFERENCES operator_effect_custody(custody_id),
  effect_kind TEXT NOT NULL CHECK(effect_kind IN ('registered-external-effect','promotion')),
  integration_id TEXT NOT NULL CHECK(length(integration_id) BETWEEN 1 AND 256),
  integration_generation INTEGER NOT NULL CHECK(integration_generation>=1),
  operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 256),
  contract_digest TEXT NOT NULL CHECK(length(contract_digest)=71 AND substr(contract_digest,1,7)='sha256:'),
  target_id TEXT NOT NULL CHECK(length(target_id) BETWEEN 1 AND 512),
  target_revision INTEGER NOT NULL CHECK(target_revision>=1),
  request_artifact_path TEXT NOT NULL CHECK(length(request_artifact_path) BETWEEN 1 AND 4096),
  request_artifact_digest TEXT NOT NULL CHECK(
    length(request_artifact_digest)=71 AND substr(request_artifact_digest,1,7)='sha256:'
  ),
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 512),
  release_gate_id TEXT REFERENCES scoped_gates(gate_id),
  release_gate_revision INTEGER CHECK(release_gate_revision IS NULL OR release_gate_revision>=1),
  release_binding_digest TEXT CHECK(
    release_binding_digest IS NULL OR
    (length(release_binding_digest)=71 AND substr(release_binding_digest,1,7)='sha256:')
  ),
  lookup_generation INTEGER NOT NULL DEFAULT 0 CHECK(lookup_generation>=0),
  lookup_evidence_digest TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(integration_id,idempotency_key),
  CHECK(
    (effect_kind='registered-external-effect'
      AND release_gate_id IS NULL
      AND release_gate_revision IS NULL
      AND release_binding_digest IS NULL) OR
    (effect_kind='promotion'
      AND release_gate_id IS NOT NULL
      AND release_gate_revision IS NOT NULL
      AND release_binding_digest IS NOT NULL)
  ),
  CHECK(
    (lookup_generation=0 AND lookup_evidence_digest IS NULL) OR
    (lookup_generation>0 AND lookup_evidence_digest IS NOT NULL
      AND length(lookup_evidence_digest)=71
      AND substr(lookup_evidence_digest,1,7)='sha256:')
  )
);

CREATE TABLE operator_git_effect_bindings(
  custody_id TEXT PRIMARY KEY REFERENCES operator_effect_custody(custody_id),
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  prepared_session_revision INTEGER NOT NULL CHECK(prepared_session_revision>=1),
  session_generation INTEGER NOT NULL CHECK(session_generation>=1),
  coordination_run_id TEXT NOT NULL,
  prepared_run_revision INTEGER NOT NULL CHECK(prepared_run_revision>=1),
  prepared_dependency_revision INTEGER NOT NULL CHECK(prepared_dependency_revision>=1),
  authority_ref TEXT NOT NULL,
  authority_revision INTEGER NOT NULL CHECK(authority_revision>=1),
  git_allowlist_epoch INTEGER NOT NULL CHECK(git_allowlist_epoch>=1),
  git_allowlist_digest TEXT,
  grant_id TEXT,
  grant_revision INTEGER,
  draft_id TEXT,
  draft_revision INTEGER,
  gate_id TEXT,
  gate_revision INTEGER,
  repository_root TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  repository_state_digest TEXT NOT NULL,
  execution_profile_id TEXT NOT NULL,
  execution_profile_revision INTEGER NOT NULL CHECK(execution_profile_revision>=1),
  execution_profile_digest TEXT NOT NULL,
  remote_registration_id TEXT,
  remote_registration_revision INTEGER,
  remote_generation INTEGER,
  remote_target_digest TEXT,
  operation_id TEXT NOT NULL UNIQUE,
  operation_variant TEXT NOT NULL,
  effect_binding_digest TEXT NOT NULL,
  result_recipe_digest TEXT NOT NULL,
  decision_digest TEXT NOT NULL,
  before_git_state_json TEXT NOT NULL CHECK(json_valid(before_git_state_json)),
  expected_terminal_state_json TEXT NOT NULL CHECK(json_valid(expected_terminal_state_json)),
  state TEXT NOT NULL CHECK(state IN (
    'prepared','dispatching','conflict','conflict-transferred','ambiguous','quarantined',
    'applied','no-effect','rejected','failed','human-resolved'
  )),
  state_revision INTEGER NOT NULL CHECK(state_revision>=1),
  terminal_basis TEXT CHECK(terminal_basis IS NULL OR terminal_basis IN ('machine-proof','conflict-transfer','human-adjudication')),
  predecessor_custody_id TEXT,
  predecessor_conflict_generation INTEGER,
  owned_conflict_generation INTEGER,
  mutation_reservation_generation INTEGER NOT NULL CHECK(mutation_reservation_generation>=1),
  lock_plan_digest TEXT NOT NULL,
  lookup_generation INTEGER NOT NULL DEFAULT 0 CHECK(lookup_generation>=0),
  lookup_evidence_digest TEXT,
  lookup_outcome TEXT CHECK(lookup_outcome IS NULL OR lookup_outcome IN (
    'exact-conflict','exact-applied','exact-no-effect','incomplete','unavailable','inconsistent',
    'inspector-unavailable','remote-proof-permanently-unavailable','mixed-local-remote-evidence',
    'evidence-integrity-failure','conflict-state-unverifiable'
  )),
  lookup_failure_signature_digest TEXT,
  lookup_observed_at INTEGER,
  resolution_eligible INTEGER NOT NULL DEFAULT 0 CHECK(resolution_eligible IN (0,1)),
  resolution_eligible_lookup_generation INTEGER,
  resolution_eligible_evidence_digest TEXT,
  resolution_eligibility_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(project_session_id,coordination_run_id) REFERENCES runs(project_session_id,run_id),
  FOREIGN KEY(project_session_id,coordination_run_id,authority_revision,authority_ref,
              git_allowlist_epoch,git_allowlist_digest)
    REFERENCES run_authority_revisions(project_session_id,coordination_run_id,authority_revision,
                                       authority_ref,git_allowlist_epoch,git_allowlist_digest),
  FOREIGN KEY(grant_id,grant_revision) REFERENCES operator_git_grants(grant_id,revision),
  FOREIGN KEY(draft_id,operation_id) REFERENCES git_operation_drafts(draft_id,operation_id),
  FOREIGN KEY(gate_id,operation_id) REFERENCES scoped_gate_operations(gate_id,operation_id),
  FOREIGN KEY(operation_id) REFERENCES operation_admissions(operation_id),
  FOREIGN KEY(execution_profile_id,execution_profile_revision) REFERENCES git_execution_profiles(profile_id,revision),
  FOREIGN KEY(remote_registration_id,remote_registration_revision) REFERENCES git_remote_registrations(registration_id,revision),
  FOREIGN KEY(predecessor_custody_id) REFERENCES operator_git_effect_bindings(custody_id),
  FOREIGN KEY(custody_id,mutation_reservation_generation) REFERENCES git_mutation_reservations(custody_id,generation),
  CHECK((grant_id IS NULL)=(grant_revision IS NULL)),
  CHECK((draft_id IS NULL)=(draft_revision IS NULL)),
  CHECK((gate_id IS NULL)=(gate_revision IS NULL)),
  CHECK((draft_id IS NULL)=(gate_id IS NULL)),
  CHECK((grant_id IS NULL)<>(gate_id IS NULL)),
  CHECK((remote_registration_id IS NULL)=(remote_registration_revision IS NULL)),
  CHECK((remote_registration_id IS NULL)=(remote_generation IS NULL)),
  CHECK((remote_registration_id IS NULL)=(remote_target_digest IS NULL)),
  CHECK((predecessor_custody_id IS NULL)=(predecessor_conflict_generation IS NULL)),
  CHECK((lookup_generation=0)=(lookup_evidence_digest IS NULL)),
  CHECK((lookup_generation=0)=(lookup_outcome IS NULL)),
  CHECK((lookup_generation=0)=(lookup_observed_at IS NULL)),
  CHECK(
    (lookup_outcome IN ('incomplete','unavailable','inconsistent','inspector-unavailable',
      'remote-proof-permanently-unavailable','mixed-local-remote-evidence','evidence-integrity-failure')
      AND lookup_failure_signature_digest IS NOT NULL)
    OR
    ((lookup_outcome IS NULL OR lookup_outcome NOT IN ('incomplete','unavailable','inconsistent','inspector-unavailable',
      'remote-proof-permanently-unavailable','mixed-local-remote-evidence','evidence-integrity-failure'))
      AND lookup_failure_signature_digest IS NULL)
  ),
  CHECK(state<>'conflict' OR owned_conflict_generation IS NOT NULL),
  CHECK((resolution_eligible=0)=(resolution_eligible_lookup_generation IS NULL)),
  CHECK((resolution_eligible=0)=(resolution_eligible_evidence_digest IS NULL)),
  CHECK((resolution_eligible=0)=(resolution_eligibility_reason IS NULL)),
  CHECK(resolution_eligible=0 OR resolution_eligible_lookup_generation=lookup_generation),
  CHECK(resolution_eligible=0 OR resolution_eligible_evidence_digest=lookup_evidence_digest),
  CHECK(resolution_eligible=0 OR resolution_eligibility_reason=lookup_outcome),
  CHECK(resolution_eligible=0 OR state IN ('ambiguous','quarantined')),
  CHECK(resolution_eligibility_reason IS NULL OR resolution_eligibility_reason IN (
    'inspector-unavailable','remote-proof-permanently-unavailable','mixed-local-remote-evidence',
    'evidence-integrity-failure','conflict-state-unverifiable'
  )),
  CHECK(resolution_eligibility_reason<>'conflict-state-unverifiable' OR
        (state='quarantined' AND (owned_conflict_generation IS NOT NULL OR predecessor_conflict_generation IS NOT NULL)))
);

CREATE TABLE operator_git_grant_paths(
  grant_id TEXT NOT NULL,
  grant_revision INTEGER NOT NULL,
  canonical_prefix TEXT NOT NULL,
  PRIMARY KEY(grant_id,grant_revision,canonical_prefix),
  FOREIGN KEY(grant_id,grant_revision) REFERENCES operator_git_grants(grant_id,revision)
);

CREATE TABLE operator_git_grant_refs(
  grant_id TEXT NOT NULL,
  grant_revision INTEGER NOT NULL,
  ref_name TEXT NOT NULL CHECK(substr(ref_name,1,5)='refs/'),
  PRIMARY KEY(grant_id,grant_revision,ref_name),
  FOREIGN KEY(grant_id,grant_revision) REFERENCES operator_git_grants(grant_id,revision)
);

CREATE TABLE operator_git_grant_remotes(
  grant_id TEXT NOT NULL,
  grant_revision INTEGER NOT NULL,
  registration_id TEXT NOT NULL,
  registration_revision INTEGER NOT NULL,
  generation INTEGER NOT NULL,
  target_digest TEXT NOT NULL,
  PRIMARY KEY(grant_id,grant_revision,registration_id,registration_revision),
  FOREIGN KEY(grant_id,grant_revision) REFERENCES operator_git_grants(grant_id,revision),
  FOREIGN KEY(registration_id,registration_revision,generation,target_digest)
    REFERENCES git_remote_registrations(registration_id,revision,generation,target_digest)
);

CREATE TABLE operator_git_grant_variants(
  grant_id TEXT NOT NULL,
  grant_revision INTEGER NOT NULL,
  operation_variant TEXT NOT NULL CHECK(operation_variant IN (
    'fetch','pull-fast-forward-only','stage','unstage','commit','push-fast-forward-only',
    'branch-create','branch-rename','branch-delete-merged-only','worktree-create-detached',
    'worktree-create-new-branch','worktree-create-existing-branch','worktree-move',
    'worktree-remove-clean','upstream-set','upstream-unset'
  )),
  PRIMARY KEY(grant_id,grant_revision,operation_variant),
  FOREIGN KEY(grant_id,grant_revision) REFERENCES operator_git_grants(grant_id,revision)
);

CREATE TABLE operator_git_grants(
  grant_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>=1),
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  session_generation INTEGER NOT NULL CHECK(session_generation>=1),
  issuing_session_revision INTEGER NOT NULL CHECK(issuing_session_revision>=1),
  coordination_run_id TEXT NOT NULL,
  issuing_run_revision INTEGER NOT NULL CHECK(issuing_run_revision>=1),
  issuing_dependency_revision INTEGER NOT NULL CHECK(issuing_dependency_revision>=1),
  authority_ref TEXT NOT NULL,
  authority_revision INTEGER NOT NULL CHECK(authority_revision>=1),
  git_allowlist_epoch INTEGER NOT NULL CHECK(git_allowlist_epoch>=1),
  git_allowlist_digest TEXT NOT NULL,
  repository_root TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  execution_profile_id TEXT NOT NULL,
  execution_profile_revision INTEGER NOT NULL CHECK(execution_profile_revision>=1),
  execution_profile_digest TEXT NOT NULL,
  allow_worktree_creation INTEGER NOT NULL CHECK(allow_worktree_creation IN (0,1)),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('launch-envelope','operator-command')),
  source_digest TEXT NOT NULL,
  constraints_json TEXT NOT NULL CHECK(json_valid(constraints_json)),
  grant_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('active','revoked')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY(grant_id,revision),
  FOREIGN KEY(project_session_id,coordination_run_id) REFERENCES runs(project_session_id,run_id),
  FOREIGN KEY(project_session_id,coordination_run_id,authority_revision,authority_ref,
              git_allowlist_epoch,git_allowlist_digest)
    REFERENCES run_authority_revisions(project_session_id,coordination_run_id,authority_revision,
                                       authority_ref,git_allowlist_epoch,git_allowlist_digest),
  FOREIGN KEY(execution_profile_id,execution_profile_revision)
    REFERENCES git_execution_profiles(profile_id,revision),
  CHECK(length(authority_ref)=71 AND substr(authority_ref,1,7)='sha256:'),
  CHECK(length(git_allowlist_digest)=71 AND substr(git_allowlist_digest,1,7)='sha256:'),
  CHECK(length(execution_profile_digest)=71 AND substr(execution_profile_digest,1,7)='sha256:'),
  CHECK(length(source_digest)=71 AND substr(source_digest,1,7)='sha256:'),
  CHECK(length(grant_digest)=71 AND substr(grant_digest,1,7)='sha256:'),
  CHECK((state='active' AND revoked_at IS NULL) OR (state='revoked' AND revoked_at IS NOT NULL))
);

CREATE TABLE operator_input_attestations (
  attestation_id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  integration_generation INTEGER NOT NULL CHECK (integration_generation >= 1),
  operator_id TEXT NOT NULL REFERENCES operator_principals(operator_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  gate_id TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  exact_utterance TEXT NOT NULL,
  provider_event_json TEXT NOT NULL,
  expected_gate_revision INTEGER NOT NULL CHECK (expected_gate_revision >= 1),
  artifact_digests_json TEXT NOT NULL,
  interpreted_decision TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  UNIQUE(project_session_id, provider_message_id),
  FOREIGN KEY(project_session_id, coordination_run_id) REFERENCES runs(project_session_id, run_id)
);

CREATE TABLE operator_interventions (
  intervention_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  actor_agent_id TEXT NOT NULL,
  source TEXT NOT NULL,
  direct_input_provenance TEXT NOT NULL,
  task_revision INTEGER NOT NULL,
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE operator_lifecycle_receipts (
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('project-session-drain','daemon-drain')),
  operator_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  authority_session_id TEXT NOT NULL,
  project_session_id TEXT,
  daemon_instance_generation INTEGER,
  session_revision INTEGER,
  session_generation INTEGER,
  global_state_revision INTEGER NOT NULL CHECK (global_state_revision >= 1),
  command_id TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (relative_path, sha256),
  UNIQUE (kind, operator_id, project_id, authority_session_id, command_id),
  FOREIGN KEY (project_session_id) REFERENCES project_sessions(project_session_id),
  CHECK (length(sha256)=71 AND substr(sha256,1,7)='sha256:'),
  CHECK (
    (kind='project-session-drain' AND project_session_id IS NOT NULL
      AND daemon_instance_generation IS NULL
      AND session_revision IS NOT NULL AND session_revision >= 1
      AND session_generation IS NOT NULL AND session_generation >= 1) OR
    (kind='daemon-drain' AND project_session_id IS NULL
      AND daemon_instance_generation IS NOT NULL AND daemon_instance_generation >= 1
      AND session_revision IS NULL AND session_generation IS NULL)
  )
);

CREATE TABLE operator_previews (
  preview_id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operator_principals(operator_id),
  project_session_id TEXT NOT NULL REFERENCES project_sessions(project_session_id),
  operation TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  preview_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  expires_at INTEGER NOT NULL,
  confirmed_command_id TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE operator_principals (
  operator_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  project_session_id TEXT,
  authenticated_subject_hash TEXT NOT NULL,
  project_authority_generation INTEGER NOT NULL CHECK (project_authority_generation >= 1),
  principal_generation INTEGER NOT NULL CHECK (principal_generation >= 1),
  state TEXT NOT NULL CHECK (state IN ('active','revoked','expired')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(project_session_id, project_id) REFERENCES project_sessions(project_session_id, project_id)
);

CREATE TABLE operator_projection_cursors (
  project_session_id TEXT NOT NULL REFERENCES project_sessions(project_session_id),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  projection_name TEXT NOT NULL,
  cursor INTEGER NOT NULL CHECK (cursor >= 0),
  snapshot_digest TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(project_session_id, schema_version, projection_name)
);

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
  created_at INTEGER NOT NULL, attestation_challenge_digest TEXT,
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

CREATE TABLE project_session_memberships (
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  member_kind TEXT NOT NULL CHECK (member_kind IN (
    'coordination-run','workstream','task','lease','provider-action','required-message',
    'artifact-obligation','gate','scoped-barrier'
  )),
  member_id TEXT NOT NULL,
  required INTEGER NOT NULL CHECK (required IN (0,1)),
  state TEXT NOT NULL CHECK (state IN ('active','reconciled','abandoned')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  abandoned_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(project_session_id, coordination_run_id, member_kind, member_id),
  FOREIGN KEY(project_session_id, coordination_run_id) REFERENCES runs(project_session_id, run_id)
);

CREATE TABLE project_sessions (
  project_session_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  mode TEXT NOT NULL CHECK (mode IN ('coordinated','independent')),
  state TEXT NOT NULL CHECK (state IN (
    'draft','awaiting_launch','launching','active','quiescing','awaiting_acceptance','closed',
    'launch_failed','launch_ambiguous','reconciling','visibility_degraded','recovery_required',
    'quarantined','cancelled'
  )),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  generation INTEGER NOT NULL CHECK (generation >= 1),
  authority_ref TEXT NOT NULL,
  budget_ref TEXT NOT NULL,
  launch_packet_path TEXT NOT NULL,
  launch_packet_digest TEXT NOT NULL,
  membership_revision INTEGER NOT NULL CHECK (membership_revision >= 1),
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('operator-launch','legacy-migration')),
  origin_operator_id TEXT,
  migration_manifest_ref TEXT,
  terminal_path_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_session_id, project_id)
);

CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  canonical_root TEXT NOT NULL UNIQUE,
  trust_record_digest TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  authority_generation INTEGER NOT NULL CHECK (authority_generation >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE provider_actions (
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
  updated_at INTEGER NOT NULL, journal_revision INTEGER NOT NULL DEFAULT 1 CHECK (journal_revision >= 1),
  PRIMARY KEY (run_id, action_id)
);

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

CREATE TABLE provider_lifecycle_intents (
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

CREATE TABLE provider_session_turn_leases (
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

CREATE TABLE provider_state (
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  provider_session_generation INTEGER NOT NULL DEFAULT 1,
  context_revision TEXT,
  reconciled_checkpoint_sha256 TEXT,
  PRIMARY KEY (run_id, agent_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE receipt_exports (
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  exported_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, relative_path, sha256)
);

CREATE TABLE resource_dimensions (
  scope_id TEXT NOT NULL REFERENCES resource_scopes(scope_id),
  unit_key TEXT NOT NULL,
  limit_value INTEGER NOT NULL CHECK (limit_value >= 0),
  used INTEGER NOT NULL CHECK (used >= 0),
  reserved INTEGER NOT NULL CHECK (reserved >= 0),
  usage_unknown INTEGER NOT NULL CHECK (usage_unknown IN (0,1)),
  PRIMARY KEY(scope_id, unit_key),
  CHECK (used + reserved <= limit_value)
);

CREATE TABLE resource_reservation_dimensions (
  reservation_id TEXT NOT NULL REFERENCES resource_reservations(reservation_id),
  scope_id TEXT NOT NULL REFERENCES resource_scopes(scope_id),
  unit_key TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  consumed INTEGER NOT NULL CHECK (consumed >= 0),
  released INTEGER NOT NULL CHECK (released >= 0),
  usage_unknown INTEGER NOT NULL CHECK (usage_unknown IN (0,1)),
  PRIMARY KEY(reservation_id, scope_id, unit_key),
  CHECK (consumed + released <= amount)
);

CREATE TABLE resource_reservations (
  reservation_id TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL REFERENCES project_sessions(project_session_id),
  coordination_run_id TEXT,
  leaf_scope_id TEXT NOT NULL REFERENCES resource_scopes(scope_id),
  operation_id TEXT,
  actor_agent_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('reserved','partially-consumed','consumed','released','ambiguous','reconciled')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  generation INTEGER NOT NULL CHECK (generation >= 1),
  identity_hash TEXT NOT NULL UNIQUE,
  path_json TEXT NOT NULL,
  amounts_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE resource_scopes (
  scope_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  project_session_id TEXT,
  coordination_run_id TEXT,
  parent_scope_id TEXT REFERENCES resource_scopes(scope_id),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('project','project-session','coordination-run','team','agent')),
  owner_ref TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active','usage-unknown','released')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  UNIQUE(project_id, scope_kind, owner_ref),
  FOREIGN KEY(project_session_id, coordination_run_id) REFERENCES runs(project_session_id, run_id)
);

CREATE TABLE result_deadline_sweep_state(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  daemon_instance_generation INTEGER NOT NULL CHECK(daemon_instance_generation>=1),
  pass_generation INTEGER NOT NULL CHECK(pass_generation>=1),
  result_json TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  FOREIGN KEY(daemon_instance_generation)
    REFERENCES daemon_runtime_epochs(instance_generation)
);

CREATE TABLE result_deliveries (
  result_delivery_id TEXT PRIMARY KEY,
  callback_id TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL UNIQUE REFERENCES task_requests(request_id),
  result_id TEXT NOT NULL UNIQUE REFERENCES task_results(result_id),
  project_session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  requester_agent_id TEXT NOT NULL,
  target_provider_session TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','claimed','provider-accepted','consumed','overdue','abandoned')),
  required INTEGER NOT NULL CHECK (required IN (0,1)),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  claim_generation INTEGER NOT NULL CHECK (claim_generation >= 0),
  assignment_generation INTEGER NOT NULL CHECK (assignment_generation >= 1),
  claimed_by TEXT,
  claim_deadline INTEGER,
  response_deadline INTEGER NOT NULL,
  provider_action_id TEXT,
  request_revision INTEGER NOT NULL CHECK (request_revision >= 1),
  reply_revision INTEGER NOT NULL CHECK (reply_revision >= 1),
  task_revision INTEGER NOT NULL CHECK (task_revision >= 1),
  payload_digest TEXT NOT NULL,
  retry_of_callback_id TEXT,
  reassignment_of_callback_id TEXT,
  abandoned_reason TEXT,
  provider_accepted_at INTEGER,
  consumed_at INTEGER,
  overdue_at INTEGER,
  abandoned_at INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(project_session_id, run_id) REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY(run_id, task_id) REFERENCES tasks(run_id, task_id),
  FOREIGN KEY(run_id, requester_agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE result_delivery_attempts (
  result_delivery_id TEXT NOT NULL REFERENCES result_deliveries(result_delivery_id),
  command_id TEXT NOT NULL,
  claim_generation INTEGER NOT NULL CHECK (claim_generation >= 0),
  transition TEXT NOT NULL,
  identity_hash TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(result_delivery_id, command_id)
);

CREATE TABLE revocation_proofs (
  proof_id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL REFERENCES leases(lease_id),
  generation INTEGER NOT NULL,
  kind TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE run_authority_revisions(
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  authority_revision INTEGER NOT NULL CHECK(authority_revision>=1),
  authority_ref TEXT NOT NULL,
  git_allowlist_epoch INTEGER NOT NULL CHECK(git_allowlist_epoch>=1),
  git_allowlist_digest TEXT,
  activated_at_run_revision INTEGER NOT NULL CHECK(activated_at_run_revision>=1),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(project_session_id,coordination_run_id,authority_revision),
  UNIQUE(project_session_id,coordination_run_id,authority_revision,authority_ref,git_allowlist_epoch,git_allowlist_digest),
  FOREIGN KEY(project_session_id,coordination_run_id) REFERENCES runs(project_session_id,run_id),
  CHECK(length(authority_ref)=71 AND substr(authority_ref,1,7)='sha256:'),
  CHECK(git_allowlist_digest IS NULL OR
    (length(git_allowlist_digest)=71 AND substr(git_allowlist_digest,1,7)='sha256:'))
);

CREATE TABLE run_chair_leases (
  project_session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  lease_id TEXT NOT NULL UNIQUE,
  holder_agent_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  status TEXT NOT NULL CHECK (status IN ('active','frozen','revoked')),
  handoff_digest TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(project_session_id, run_id, generation),
  FOREIGN KEY(project_session_id, run_id) REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY(run_id, holder_agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE run_git_allowlist_paths(
  project_session_id TEXT NOT NULL,coordination_run_id TEXT NOT NULL,authority_revision INTEGER NOT NULL,
  git_allowlist_epoch INTEGER NOT NULL,repository_root TEXT NOT NULL,worktree_path TEXT NOT NULL,canonical_prefix TEXT NOT NULL,
  PRIMARY KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch,repository_root,worktree_path,canonical_prefix),
  FOREIGN KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch)
    REFERENCES run_git_allowlists(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch)
);

CREATE TABLE run_git_allowlist_profiles(
  project_session_id TEXT NOT NULL,coordination_run_id TEXT NOT NULL,authority_revision INTEGER NOT NULL,
  git_allowlist_epoch INTEGER NOT NULL,profile_id TEXT NOT NULL,profile_revision INTEGER NOT NULL,profile_digest TEXT NOT NULL,
  PRIMARY KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch,profile_id,profile_revision),
  FOREIGN KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch)
    REFERENCES run_git_allowlists(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch),
  FOREIGN KEY(profile_id,profile_revision) REFERENCES git_execution_profiles(profile_id,revision)
);

CREATE TABLE run_git_allowlist_refs(
  project_session_id TEXT NOT NULL,coordination_run_id TEXT NOT NULL,authority_revision INTEGER NOT NULL,
  git_allowlist_epoch INTEGER NOT NULL,ref_name TEXT NOT NULL CHECK(substr(ref_name,1,5)='refs/'),
  PRIMARY KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch,ref_name),
  FOREIGN KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch)
    REFERENCES run_git_allowlists(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch)
);

CREATE TABLE run_git_allowlist_remotes(
  project_session_id TEXT NOT NULL,coordination_run_id TEXT NOT NULL,authority_revision INTEGER NOT NULL,
  git_allowlist_epoch INTEGER NOT NULL,registration_id TEXT NOT NULL,registration_revision INTEGER NOT NULL,
  generation INTEGER NOT NULL,target_digest TEXT NOT NULL,
  PRIMARY KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch,registration_id,registration_revision),
  FOREIGN KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch)
    REFERENCES run_git_allowlists(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch),
  FOREIGN KEY(registration_id,registration_revision,generation,target_digest)
    REFERENCES git_remote_registrations(registration_id,revision,generation,target_digest)
);

CREATE TABLE run_git_allowlist_variants(
  project_session_id TEXT NOT NULL,coordination_run_id TEXT NOT NULL,authority_revision INTEGER NOT NULL,
  git_allowlist_epoch INTEGER NOT NULL,operation_variant TEXT NOT NULL,
  PRIMARY KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch,operation_variant),
  FOREIGN KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch)
    REFERENCES run_git_allowlists(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch),
  CHECK(operation_variant IN (
    'fetch','pull-fast-forward-only','stage','unstage','commit','push-fast-forward-only',
    'branch-create','branch-rename','branch-delete-merged-only','worktree-create-detached',
    'worktree-create-new-branch','worktree-create-existing-branch','worktree-move','worktree-remove-clean',
    'upstream-set','upstream-unset'
  ))
);

CREATE TABLE run_git_allowlists(
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  authority_revision INTEGER NOT NULL CHECK(authority_revision>=1),
  git_allowlist_epoch INTEGER NOT NULL CHECK(git_allowlist_epoch>=1),
  git_allowlist_digest TEXT NOT NULL,
  allow_worktree_creation INTEGER NOT NULL CHECK(allow_worktree_creation IN (0,1)),
  maximum_expiry INTEGER NOT NULL,
  constraints_json TEXT NOT NULL CHECK(json_valid(constraints_json)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch),
  UNIQUE(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch,git_allowlist_digest),
  FOREIGN KEY(project_session_id,coordination_run_id,authority_revision)
    REFERENCES run_authority_revisions(project_session_id,coordination_run_id,authority_revision),
  CHECK(length(git_allowlist_digest)=71 AND substr(git_allowlist_digest,1,7)='sha256:')
);

CREATE TABLE run_metadata (
  run_id TEXT PRIMARY KEY REFERENCES runs(run_id),
  execution_profile TEXT NOT NULL DEFAULT 'unconfigured'
);

CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  chair_agent_id TEXT NOT NULL,
  workspace_root TEXT NOT NULL,
  project_run_directory TEXT,
  created_at INTEGER NOT NULL
, project_session_id TEXT REFERENCES project_sessions(project_session_id), lifecycle_state TEXT CHECK (lifecycle_state IN (
  'draft','awaiting_launch','launching','active','quiescing','awaiting_acceptance','closed',
  'launch_failed','launch_ambiguous','reconciling','visibility_degraded','recovery_required',
  'quarantined','cancelled'
)), revision INTEGER CHECK (revision >= 1), chair_generation INTEGER CHECK (chair_generation >= 1), chair_lease_id TEXT, authority_ref TEXT, budget_ref TEXT, dependency_revision INTEGER CHECK (dependency_revision >= 1), topology_slot INTEGER CHECK (topology_slot IS NULL OR topology_slot = 1), project_run_directory_basis TEXT NOT NULL DEFAULT 'none'
  CHECK (project_run_directory_basis IN ('project-relative','none')), authority_revision INTEGER NOT NULL DEFAULT 1 CHECK(authority_revision>=1), git_allowlist_epoch INTEGER NOT NULL DEFAULT 1 CHECK(git_allowlist_epoch>=1), git_allowlist_digest TEXT CHECK(
  git_allowlist_digest IS NULL OR
  (length(git_allowlist_digest)=71 AND substr(git_allowlist_digest,1,7)='sha256:')
));

CREATE TABLE scoped_gate_barriers (
  gate_id TEXT NOT NULL REFERENCES scoped_gates(gate_id),
  barrier_id TEXT NOT NULL,
  PRIMARY KEY(gate_id, barrier_id)
);

CREATE TABLE scoped_gate_operations (
  gate_id TEXT NOT NULL REFERENCES scoped_gates(gate_id),
  operation_id TEXT NOT NULL,
  PRIMARY KEY(gate_id, operation_id)
);

CREATE TABLE scoped_gate_tasks (
  gate_id TEXT NOT NULL REFERENCES scoped_gates(gate_id),
  project_session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  binding_kind TEXT NOT NULL CHECK (binding_kind IN ('direct','descendant')),
  bound_dependency_revision INTEGER NOT NULL CHECK (bound_dependency_revision >= 1),
  PRIMARY KEY(gate_id, run_id, task_id),
  FOREIGN KEY(project_session_id, run_id) REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY(run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE scoped_gates (
  gate_id TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('task','subtree','run','release')),
  scope_task_id TEXT,
  dependency_revision INTEGER NOT NULL CHECK (dependency_revision >= 1),
  blocked_operation_ids_json TEXT NOT NULL,
  enforcement_points_json TEXT NOT NULL,
  question TEXT NOT NULL,
  reason TEXT NOT NULL,
  options_json TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  consequences_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  created_by_ref TEXT NOT NULL,
  expected_approver_ref TEXT NOT NULL,
  resolved_by_operator_id TEXT,
  resolution_json TEXT,
  deadline INTEGER,
  default_action TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','deferred','cancelled','superseded')),
  human_required INTEGER NOT NULL CHECK (human_required IN (0,1)),
  release_binding_json TEXT,
  legacy_status TEXT,
  legacy_evidence TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_session_id, coordination_run_id, dedupe_key),
  FOREIGN KEY(project_session_id, coordination_run_id) REFERENCES runs(project_session_id, run_id)
);

CREATE TABLE subtree_barriers (
  run_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  closed_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, team_id, generation)
);

CREATE TABLE task_dependencies (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  dependency_task_id TEXT NOT NULL, project_session_id TEXT REFERENCES project_sessions(project_session_id), dependency_revision INTEGER CHECK (dependency_revision >= 1),
  PRIMARY KEY (run_id, task_id, dependency_task_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id),
  FOREIGN KEY (run_id, dependency_task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE task_eligible_agents (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  PRIMARY KEY (run_id, task_id, agent_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE task_expected_artifacts (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  PRIMARY KEY (run_id, task_id, relative_path),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE task_handoff_acknowledgements (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL,
  owner_lease_generation INTEGER NOT NULL,
  intended_next_owner_agent_id TEXT NOT NULL,
  acknowledged_by TEXT NOT NULL,
  acknowledged_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, task_id, task_revision, owner_lease_generation)
);

CREATE TABLE task_human_gates (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  gate_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  evidence TEXT, migrated_gate_id TEXT REFERENCES scoped_gates(gate_id),
  PRIMARY KEY (run_id, task_id, gate_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE task_objective_checks (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  check_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  evidence TEXT,
  PRIMARY KEY (run_id, task_id, check_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE task_obligation_bindings (
  coordination_run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  obligation_kind TEXT NOT NULL CHECK (obligation_kind IN ('write-lease','resource-reservation')),
  obligation_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active','reconciled','abandoned')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (coordination_run_id, task_id, obligation_kind, obligation_id),
  FOREIGN KEY (coordination_run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE task_owner_leases (
  project_session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  lease_id TEXT NOT NULL UNIQUE,
  holder_agent_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  status TEXT NOT NULL CHECK (status IN ('active','frozen','released','revoked')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(run_id, task_id, generation),
  FOREIGN KEY(project_session_id, run_id) REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY(run_id, task_id) REFERENCES tasks(run_id, task_id),
  FOREIGN KEY(run_id, holder_agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE task_owner_recoveries (
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

CREATE TABLE task_owner_recovery_proofs (
  proof_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  owner_lease_generation INTEGER NOT NULL,
  predecessor_agent_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE task_participants (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  PRIMARY KEY (run_id, task_id, agent_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE task_proposals (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  proposed_owner_agent_id TEXT,
  PRIMARY KEY (run_id, task_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE task_request_barriers (
  request_id TEXT PRIMARY KEY REFERENCES task_requests(request_id),
  barrier_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('blocked','released','abandoned'))
);

CREATE TABLE task_request_recipients (
  request_id TEXT NOT NULL REFERENCES task_requests(request_id),
  delivery_id TEXT NOT NULL REFERENCES deliveries(delivery_id),
  PRIMARY KEY(request_id, delivery_id)
);

CREATE TABLE task_requests (
  request_id TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  requester_agent_id TEXT NOT NULL,
  request_revision INTEGER NOT NULL CHECK (request_revision >= 1),
  conversation_id TEXT NOT NULL,
  request_message_id TEXT NOT NULL UNIQUE REFERENCES messages(message_id),
  target_agent_id TEXT NOT NULL,
  target_provider_session TEXT NOT NULL,
  expected_artifacts_json TEXT NOT NULL,
  acknowledgement_required INTEGER NOT NULL CHECK (acknowledgement_required IN (0,1)),
  dedupe_key TEXT NOT NULL,
  response_deadline INTEGER NOT NULL,
  callback_id TEXT NOT NULL UNIQUE,
  callback_generation INTEGER NOT NULL CHECK (callback_generation >= 1),
  dependent_barrier_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','answered','overdue','reassigned','abandoned')),
  payload_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(run_id, requester_agent_id, dedupe_key),
  FOREIGN KEY(project_session_id, run_id) REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY(run_id, task_id) REFERENCES tasks(run_id, task_id),
  FOREIGN KEY(run_id, requester_agent_id) REFERENCES agents(run_id, agent_id),
  FOREIGN KEY(run_id, target_agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE task_results (
  result_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES task_requests(request_id),
  project_session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL CHECK (task_revision >= 1),
  reply_message_id TEXT NOT NULL UNIQUE REFERENCES messages(message_id),
  reply_revision INTEGER NOT NULL CHECK (reply_revision >= 1),
  payload_digest TEXT NOT NULL,
  artifacts_json TEXT NOT NULL,
  terminal_state TEXT NOT NULL CHECK (terminal_state IN ('complete')),
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(project_session_id, run_id) REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY(run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE tasks (
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

CREATE TABLE team_members (
  run_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  PRIMARY KEY (run_id, team_id, agent_id),
  FOREIGN KEY (run_id, team_id) REFERENCES teams(run_id, team_id),
  FOREIGN KEY (run_id, agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE team_owned_tasks (
  run_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  PRIMARY KEY (run_id, team_id, task_id),
  UNIQUE (run_id, task_id),
  FOREIGN KEY (run_id, team_id) REFERENCES teams(run_id, team_id),
  FOREIGN KEY (run_id, task_id) REFERENCES tasks(run_id, task_id)
);

CREATE TABLE teams (
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

CREATE TABLE workstreams (
  workstream_id TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  fabric_task_id TEXT NOT NULL,
  lead_agent_id TEXT NOT NULL,
  delivery_run_id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  state TEXT NOT NULL CHECK (state IN ('active','complete','cancelled','degraded','abandoned')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(project_session_id, coordination_run_id) REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY(coordination_run_id, fabric_task_id) REFERENCES tasks(run_id, task_id),
  FOREIGN KEY(coordination_run_id, lead_agent_id) REFERENCES agents(run_id, agent_id)
);

CREATE TABLE write_scope_entries (
  lease_id TEXT NOT NULL REFERENCES leases(lease_id),
  canonical_path TEXT NOT NULL,
  PRIMARY KEY (lease_id, canonical_path)
);

CREATE TABLE writer_admissions (
  writer_admission_id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL UNIQUE REFERENCES resource_reservations(reservation_id),
  repository_root TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  writer_generation INTEGER NOT NULL CHECK (writer_generation >= 1),
  state TEXT NOT NULL CHECK (state IN ('active','released','revoked'))
);

CREATE TABLE writer_prefixes (
  writer_admission_id TEXT NOT NULL REFERENCES writer_admissions(writer_admission_id),
  canonical_prefix TEXT NOT NULL,
  PRIMARY KEY(writer_admission_id, canonical_prefix)
);

CREATE INDEX agent_bridge_state_by_supervision
  ON agent_bridge_state(bridge_state, adapter_id, updated_at, run_id, agent_id);

CREATE UNIQUE INDEX artifact_project_identity
  ON artifacts(project_id, source_kind, relative_path, sha256)
  WHERE project_session_id IS NULL AND run_id IS NULL AND registry_state='active';

CREATE UNIQUE INDEX artifact_run_identity
  ON artifacts(project_id, run_id, source_kind, relative_path, sha256)
  WHERE run_id IS NOT NULL AND registry_state='active';

CREATE UNIQUE INDEX artifact_session_identity
  ON artifacts(project_id, project_session_id, source_kind, relative_path, sha256)
  WHERE project_session_id IS NOT NULL AND run_id IS NULL AND registry_state='active';

CREATE INDEX artifacts_projection
  ON artifacts(project_id, project_session_id, registry_state, created_at, artifact_id);

CREATE INDEX attachment_liveness ON operator_client_attachments(state, expires_at, daemon_instance_generation, project_authority_generation);

CREATE UNIQUE INDEX chair_bridge_one_open_recovery_per_loss
  ON chair_bridge_recovery_custody(loss_id)
  WHERE state NOT IN ('terminal','no-effect');

CREATE INDEX chair_bridge_recovery_obligations
  ON chair_bridge_recovery_custody(state, provider_adapter_id, updated_at, recovery_id);

CREATE UNIQUE INDEX chair_live_handoff_one_open_per_run
  ON chair_live_handoff_custody(coordination_run_id)
  WHERE state NOT IN ('terminal','no-effect');

CREATE INDEX deliveries_ready_mailbox
  ON deliveries(run_id, recipient_id, mailbox_sequence) WHERE state = 'ready';

CREATE INDEX events_by_run_cursor
  ON events(run_id, event_id);

CREATE INDEX gate_barrier_lookup ON scoped_gate_barriers(barrier_id, gate_id);

CREATE INDEX gate_operation_lookup ON scoped_gate_operations(operation_id, gate_id);

CREATE INDEX gate_status_scope ON scoped_gates(project_session_id, coordination_run_id, status, scope_kind);

CREATE INDEX gate_task_lookup ON scoped_gate_tasks(run_id, task_id, gate_id);

CREATE INDEX intake_revision_latest ON intake_revisions(intake_id, revision DESC);

CREATE INDEX launched_chair_bridge_state_supervision
  ON launched_chair_bridge_state(state, provider_adapter_id, updated_at, coordination_run_id);

CREATE INDEX leases_by_expiry
  ON leases(status, expires_at, run_id);

CREATE INDEX membership_active ON project_session_memberships(project_session_id, coordination_run_id, member_kind, state);

CREATE INDEX notification_claim ON notification_deliveries(state, claim_deadline);

CREATE UNIQUE INDEX one_active_chair_lease_per_run
  ON run_chair_leases(project_session_id,run_id)
  WHERE status='active';

CREATE UNIQUE INDEX one_active_git_execution_profile
  ON git_execution_profiles(profile_id) WHERE state='active';

CREATE UNIQUE INDEX one_active_git_grant_revision
  ON operator_git_grants(grant_id) WHERE state='active';

CREATE UNIQUE INDEX one_active_git_mutation_per_common_dir
  ON git_mutation_reservations(git_common_dir)
  WHERE state IN ('reserved','dispatching','conflict','ambiguous','quarantined');

CREATE UNIQUE INDEX one_active_git_remote_name
  ON git_remote_registrations(project_id,remote_name) WHERE state='active';

CREATE UNIQUE INDEX one_active_operator_task_fence
  ON operator_control_fences(coordination_run_id, task_id)
  WHERE state='paused';

CREATE UNIQUE INDEX one_coordinated_nonterminal_run
  ON runs(project_session_id, topology_slot)
  WHERE topology_slot=1 AND lifecycle_state NOT IN ('closed','cancelled','launch_failed');

CREATE UNIQUE INDEX one_live_operator_daemon_stop
  ON operator_daemon_stop_custody(daemon_instance_generation)
  WHERE state IN ('prepared','scheduled','failed');

CREATE UNIQUE INDEX one_nonterminal_run_per_project_session
  ON runs(project_session_id)
  WHERE lifecycle_state NOT IN ('closed','cancelled','launch_failed');

CREATE UNIQUE INDEX one_unresolved_provider_turn_per_session
  ON provider_session_turn_leases(run_id, agent_id)
  WHERE status IN ('active', 'quarantined');

CREATE INDEX operator_control_fences_by_session
  ON operator_control_fences(project_session_id, state, coordination_run_id, task_id);

CREATE INDEX operator_external_effect_bindings_recovery
  ON operator_external_effect_bindings(lookup_generation,custody_id);

CREATE INDEX operator_git_effect_recovery
  ON operator_git_effect_bindings(state,lookup_generation,custody_id);

CREATE INDEX operator_git_grants_point_of_use
  ON operator_git_grants(project_session_id,coordination_run_id,state,expires_at,
    session_generation,authority_revision,git_allowlist_epoch,execution_profile_id,execution_profile_revision);

CREATE INDEX operator_lifecycle_receipts_by_authority
  ON operator_lifecycle_receipts(
    operator_id, project_id, authority_session_id, kind, created_at DESC
  );

CREATE INDEX projection_cursor ON operator_projection_cursors(project_session_id, schema_version, cursor);

CREATE UNIQUE INDEX provider_actions_global_adapter_action
  ON provider_actions(adapter_id, action_id);

CREATE INDEX provider_actions_unresolved
  ON provider_actions(run_id, updated_at, action_id)
  WHERE status IN ('prepared', 'dispatched', 'ambiguous');

CREATE INDEX provider_agent_custody_by_target
  ON provider_agent_custody(run_id, target_agent_id, created_at DESC);

CREATE INDEX resource_reservation_active ON resource_reservation_dimensions(scope_id, reservation_id);

CREATE INDEX resource_scope_parent ON resource_scopes(parent_scope_id, state);

CREATE INDEX result_claim ON result_deliveries(state, claim_deadline, claim_generation);

CREATE INDEX result_due ON result_deliveries(state, response_deadline);

CREATE INDEX runs_by_lifecycle ON runs(lifecycle_state, project_session_id, run_id);

CREATE UNIQUE INDEX runs_by_project_session_identity ON runs(project_session_id, run_id);

CREATE INDEX session_liveness ON project_sessions(state, project_session_id);

CREATE INDEX tasks_by_owner
  ON tasks(run_id, owner_agent_id, state, task_id) WHERE owner_agent_id IS NOT NULL;

CREATE INDEX tasks_by_state
  ON tasks(run_id, state, task_id);

CREATE INDEX writer_prefix_active ON writer_prefixes(canonical_prefix, writer_admission_id);

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

CREATE TRIGGER agent_bridge_live_delete_forbidden
BEFORE DELETE ON agent_bridge_state
WHEN OLD.bridge_state<>'none'
BEGIN SELECT RAISE(ABORT,'INVARIANT_agent_bridge_active_retirement_proof'); END;

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

CREATE TRIGGER artifact_active_identity_immutable
BEFORE UPDATE OF project_id, project_session_id, run_id, task_id, source_kind, relative_path, sha256,
                 publisher_kind, publisher_ref, publisher_agent_id
ON artifacts
WHEN OLD.registry_state='active'
BEGIN
  SELECT RAISE(ABORT, 'active artifact identity is immutable');
END;

CREATE TRIGGER artifact_active_source_shape_insert
BEFORE INSERT ON artifacts
WHEN NEW.registry_state='active' AND (
  (NEW.source_kind='git-private-diff' AND NOT (
    NEW.run_id IS NULL AND NEW.task_id IS NULL AND
    NEW.publisher_kind='fabric' AND NEW.publisher_ref='fabric-git-private-diff' AND
    NEW.publisher_agent_id IS NULL AND NEW.evidence_kind='diff' AND
    NEW.relative_path='private/git-diffs/' || substr(NEW.sha256, 8) || '.patch'
  )) OR
  (NEW.source_kind<>'git-private-diff' AND NEW.relative_path GLOB 'private/git-diffs/*')
)
BEGIN SELECT RAISE(ABORT, 'active artifact violates the private Git diff namespace'); END;

CREATE TRIGGER artifact_active_source_shape_update
BEFORE UPDATE ON artifacts
WHEN NEW.registry_state='active' AND (
  (NEW.source_kind='git-private-diff' AND NOT (
    NEW.run_id IS NULL AND NEW.task_id IS NULL AND
    NEW.publisher_kind='fabric' AND NEW.publisher_ref='fabric-git-private-diff' AND
    NEW.publisher_agent_id IS NULL AND NEW.evidence_kind='diff' AND
    NEW.relative_path='private/git-diffs/' || substr(NEW.sha256, 8) || '.patch'
  )) OR
  (NEW.source_kind<>'git-private-diff' AND NEW.relative_path GLOB 'private/git-diffs/*')
)
BEGIN SELECT RAISE(ABORT, 'active artifact violates the private Git diff namespace'); END;

CREATE TRIGGER artifact_run_file_requires_descendant_insert
BEFORE INSERT ON artifacts
WHEN NEW.registry_state='active' AND NEW.source_kind='run-file'
 AND NOT EXISTS (
   SELECT 1 FROM runs run
    WHERE run.run_id=NEW.run_id AND run.project_session_id=NEW.project_session_id
      AND run.project_run_directory_basis='project-relative'
      AND run.project_run_directory IS NOT NULL AND run.project_run_directory<>'.'
 )
BEGIN SELECT RAISE(ABORT, 'active run-file requires a strict-descendant run root'); END;

CREATE TRIGGER artifact_run_file_requires_descendant_update
BEFORE UPDATE ON artifacts
WHEN NEW.registry_state='active' AND NEW.source_kind='run-file'
 AND NOT EXISTS (
   SELECT 1 FROM runs run
    WHERE run.run_id=NEW.run_id AND run.project_session_id=NEW.project_session_id
      AND run.project_run_directory_basis='project-relative'
      AND run.project_run_directory IS NOT NULL AND run.project_run_directory<>'.'
 )
BEGIN SELECT RAISE(ABORT, 'active run-file requires a strict-descendant run root'); END;

CREATE TRIGGER attention_revision_step BEFORE UPDATE OF revision ON attention_items
WHEN NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_ATTENTION_REVISION'); END;

CREATE TRIGGER authorities_parent_insert BEFORE INSERT ON authorities
WHEN NEW.parent_authority_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM authorities a WHERE a.authority_id=NEW.parent_authority_id AND a.run_id=NEW.run_id)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_authorities_parent_same_run'); END;

CREATE TRIGGER authorities_parent_update BEFORE UPDATE OF parent_authority_id,run_id ON authorities
WHEN NEW.parent_authority_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM authorities a WHERE a.authority_id=NEW.parent_authority_id AND a.run_id=NEW.run_id)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_authorities_parent_same_run'); END;

CREATE TRIGGER authority_budget_boolean_insert BEFORE INSERT ON authority_budget
WHEN NEW.usage_unknown NOT IN (0,1) BEGIN SELECT RAISE(ABORT, 'INVARIANT_authority_budget_boolean'); END;

CREATE TRIGGER authority_budget_boolean_update BEFORE UPDATE OF usage_unknown ON authority_budget
WHEN NEW.usage_unknown NOT IN (0,1) BEGIN SELECT RAISE(ABORT, 'INVARIANT_authority_budget_boolean'); END;

CREATE TRIGGER barrier_gate_block BEFORE INSERT ON barriers
WHEN EXISTS (
  SELECT 1 FROM scoped_gates g JOIN scoped_gate_barriers gb ON gb.gate_id=g.gate_id
   WHERE gb.barrier_id=NEW.run_id || ':' || NEW.scope || ':' || NEW.stage_id
     AND g.status IN ('pending','deferred')
)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_GATE_BLOCKED'); END;

CREATE TRIGGER barriers_state_insert BEFORE INSERT ON barriers
WHEN NEW.state <> 'closed' BEGIN SELECT RAISE(ABORT, 'INVARIANT_barriers_state'); END;

CREATE TRIGGER barriers_state_update BEFORE UPDATE OF state ON barriers
WHEN NEW.state <> 'closed' BEGIN SELECT RAISE(ABORT, 'INVARIANT_barriers_state'); END;

CREATE TRIGGER budget_dimensions_values_insert BEFORE INSERT ON budget_dimensions
WHEN NEW.direct_usage_unknown NOT IN (0,1) OR NEW.usage_unknown NOT IN (0,1) OR NEW.granted < 0 OR NEW.reserved < 0 OR NEW.consumed < 0 OR NEW.reserved > NEW.granted OR NEW.consumed > NEW.granted
BEGIN SELECT RAISE(ABORT, 'INVARIANT_budget_dimensions_values'); END;

CREATE TRIGGER budget_dimensions_values_update BEFORE UPDATE OF direct_usage_unknown,usage_unknown,granted,reserved,consumed ON budget_dimensions
WHEN NEW.direct_usage_unknown NOT IN (0,1) OR NEW.usage_unknown NOT IN (0,1) OR NEW.granted < 0 OR NEW.reserved < 0 OR NEW.consumed < 0 OR NEW.reserved > NEW.granted OR NEW.consumed > NEW.granted
BEGIN SELECT RAISE(ABORT, 'INVARIANT_budget_dimensions_values'); END;

CREATE TRIGGER budgets_state_insert BEFORE INSERT ON budgets
WHEN NEW.state NOT IN ('active','usage-unknown','released') BEGIN SELECT RAISE(ABORT, 'INVARIANT_budgets_state'); END;

CREATE TRIGGER budgets_state_update BEFORE UPDATE OF state ON budgets
WHEN NEW.state NOT IN ('active','usage-unknown','released') BEGIN SELECT RAISE(ABORT, 'INVARIANT_budgets_state'); END;

CREATE TRIGGER capabilities_generation_insert BEFORE INSERT ON capabilities
WHEN NEW.principal_generation < 1 BEGIN SELECT RAISE(ABORT, 'INVARIANT_capabilities_generation'); END;

CREATE TRIGGER capabilities_generation_update BEFORE UPDATE OF principal_generation ON capabilities
WHEN NEW.principal_generation < 1 BEGIN SELECT RAISE(ABORT, 'INVARIANT_capabilities_generation'); END;

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

CREATE TRIGGER chair_bridge_loss_freezes_authority_grants
BEFORE INSERT ON authorities
WHEN EXISTS (
  SELECT 1 FROM launched_chair_bridge_state bridge
   WHERE bridge.coordination_run_id=NEW.run_id AND bridge.state='lost'
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_freezes_grants'); END;

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

CREATE TRIGGER chair_bridge_loss_resolutions_immutable_delete
BEFORE DELETE ON chair_bridge_loss_resolutions
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_resolutions_immutable'); END;

CREATE TRIGGER chair_bridge_loss_resolutions_immutable_update
BEFORE UPDATE ON chair_bridge_loss_resolutions
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_resolutions_immutable'); END;

CREATE TRIGGER chair_bridge_losses_immutable_delete
BEFORE DELETE ON chair_bridge_losses
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_losses_immutable'); END;

CREATE TRIGGER chair_bridge_losses_immutable_update
BEFORE UPDATE ON chair_bridge_losses
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_losses_immutable'); END;

CREATE TRIGGER chair_bridge_recovery_capability_delete_forbidden
BEFORE DELETE ON capabilities
WHEN EXISTS (
  SELECT 1 FROM chair_bridge_recovery_custody recovery
   WHERE recovery.path='rebind' AND recovery.new_capability_hash=OLD.token_hash
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_freezes_grants'); END;

CREATE TRIGGER chair_bridge_recovery_capability_identity_immutable
BEFORE UPDATE OF token_hash, run_id, agent_id, principal_generation ON capabilities
WHEN (
  OLD.token_hash<>NEW.token_hash OR OLD.run_id<>NEW.run_id OR
  OLD.agent_id<>NEW.agent_id OR OLD.principal_generation<>NEW.principal_generation
) AND NOT (
  OLD.token_hash=NEW.token_hash AND OLD.run_id=NEW.run_id AND OLD.agent_id=NEW.agent_id AND
  NEW.principal_generation=OLD.principal_generation+1 AND
  OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM chair_bridge_recovery_custody terminal_recovery
     WHERE terminal_recovery.path='rebind' AND terminal_recovery.state='terminal'
       AND terminal_recovery.new_capability_hash=OLD.token_hash
  )
) AND EXISTS (
  SELECT 1 FROM chair_bridge_recovery_custody recovery
   WHERE recovery.path='rebind'
     AND recovery.new_capability_hash IN (OLD.token_hash, NEW.token_hash)
)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_bridge_loss_freezes_grants'); END;

CREATE TRIGGER chair_live_handoff_delete_forbidden BEFORE DELETE ON chair_live_handoff_custody
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_live_handoff_identity_immutable'); END;

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

CREATE TRIGGER chair_live_handoff_resolution_immutable_delete BEFORE DELETE ON chair_live_handoff_resolutions
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_live_handoff_resolution_immutable'); END;

CREATE TRIGGER chair_live_handoff_resolution_immutable_update BEFORE UPDATE ON chair_live_handoff_resolutions
BEGIN SELECT RAISE(ABORT, 'INVARIANT_chair_live_handoff_resolution_immutable'); END;

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

CREATE TRIGGER child_bridge_losses_immutable_delete
BEFORE DELETE ON child_bridge_losses
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_child_bridge_losses_immutable');
END;

CREATE TRIGGER child_bridge_losses_immutable_update
BEFORE UPDATE ON child_bridge_losses
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_child_bridge_losses_immutable');
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

CREATE TRIGGER dependency_guard_complete BEFORE DELETE ON dependency_mutation_guards BEGIN
  SELECT CASE WHEN (SELECT dependency_revision FROM runs WHERE run_id=OLD.run_id)<>OLD.target_revision
    OR (SELECT count(*) FROM task_dependencies WHERE run_id=OLD.run_id)<>OLD.expected_edge_count
    OR EXISTS (SELECT 1 FROM task_dependencies WHERE run_id=OLD.run_id AND dependency_revision<>OLD.target_revision)
    OR (SELECT count(*) FROM scoped_gate_tasks gt JOIN scoped_gates g ON g.gate_id=gt.gate_id
         WHERE g.coordination_run_id=OLD.run_id AND g.status IN ('pending','deferred'))<>OLD.expected_binding_count
    OR EXISTS (SELECT 1 FROM scoped_gate_tasks gt JOIN scoped_gates g ON g.gate_id=gt.gate_id
         WHERE g.coordination_run_id=OLD.run_id AND g.status IN ('pending','deferred')
           AND gt.bound_dependency_revision<>OLD.target_revision)
    THEN RAISE(ABORT, 'AFAB_0004_DEPENDENCY_REBIND_INCOMPLETE') END;
END;

CREATE TRIGGER dependency_guard_delete BEFORE DELETE ON task_dependencies
WHEN NOT EXISTS (SELECT 1 FROM dependency_mutation_guards g WHERE g.run_id=OLD.run_id AND g.project_session_id=OLD.project_session_id)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_DEPENDENCY_MUTATOR'); END;

CREATE TRIGGER dependency_guard_insert BEFORE INSERT ON task_dependencies
WHEN NOT EXISTS (SELECT 1 FROM dependency_mutation_guards g WHERE g.run_id=NEW.run_id AND g.project_session_id=NEW.project_session_id AND g.target_revision=NEW.dependency_revision)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_DEPENDENCY_MUTATOR'); END;

CREATE TRIGGER dependency_guard_update BEFORE UPDATE ON task_dependencies
WHEN NOT EXISTS (SELECT 1 FROM dependency_mutation_guards g WHERE g.run_id=NEW.run_id AND g.project_session_id=NEW.project_session_id AND g.target_revision=NEW.dependency_revision)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_DEPENDENCY_MUTATOR'); END;

CREATE TRIGGER events_actor_insert BEFORE INSERT ON events
WHEN NEW.actor_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.actor_agent_id AND a.run_id=NEW.run_id)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_events_actor_same_run'); END;

CREATE TRIGGER events_actor_update BEFORE UPDATE OF actor_agent_id,run_id ON events
WHEN NEW.actor_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=NEW.actor_agent_id AND a.run_id=NEW.run_id)
BEGIN SELECT RAISE(ABORT, 'INVARIANT_events_actor_same_run'); END;

CREATE TRIGGER gate_human_resolution BEFORE UPDATE OF status ON scoped_gates
WHEN NEW.status='approved' AND OLD.human_required=1 AND NEW.resolved_by_operator_id IS NULL
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_GATE_HUMAN_REQUIRED'); END;

CREATE TRIGGER gate_release_binding BEFORE INSERT ON scoped_gates
WHEN NEW.scope_kind='release' AND NEW.release_binding_json IS NULL
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_GATE_RELEASE_BINDING'); END;

CREATE TRIGGER git_binding_identity_immutable
BEFORE UPDATE OF custody_id,project_id,project_session_id,prepared_session_revision,session_generation,
  coordination_run_id,prepared_run_revision,prepared_dependency_revision,authority_ref,
  authority_revision,git_allowlist_epoch,git_allowlist_digest,grant_id,grant_revision,draft_id,
  draft_revision,gate_id,gate_revision,repository_root,worktree_path,repository_state_digest,
  execution_profile_id,execution_profile_revision,execution_profile_digest,remote_registration_id,
  remote_registration_revision,remote_generation,remote_target_digest,operation_id,operation_variant,
  effect_binding_digest,result_recipe_digest,decision_digest,before_git_state_json,
  expected_terminal_state_json,mutation_reservation_generation,lock_plan_digest,created_at
ON operator_git_effect_bindings
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_binding_identity_immutable'); END;

CREATE TRIGGER git_draft_gate_association
AFTER INSERT ON scoped_gate_operations
WHEN EXISTS (
  SELECT 1 FROM git_operation_drafts draft
   WHERE draft.operation_id=NEW.operation_id AND draft.state='open'
)
BEGIN
  UPDATE git_operation_drafts
     SET state='gate-bound',revision=revision+1,updated_at=(
       SELECT updated_at FROM scoped_gates WHERE gate_id=NEW.gate_id
     )
   WHERE operation_id=NEW.operation_id AND state='open';
END;

CREATE TRIGGER git_draft_gate_association_guard
BEFORE INSERT ON scoped_gate_operations
WHEN EXISTS (SELECT 1 FROM git_operation_drafts WHERE operation_id=NEW.operation_id)
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM scoped_gate_operations WHERE operation_id=NEW.operation_id
  ) THEN RAISE(ABORT,'INVARIANT_git_draft_has_one_gate') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM git_operation_drafts draft JOIN scoped_gates gate ON gate.gate_id=NEW.gate_id
     WHERE draft.operation_id=NEW.operation_id
       AND gate.project_session_id=draft.project_session_id
       AND gate.coordination_run_id=draft.coordination_run_id
       AND gate.dependency_revision=draft.observed_dependency_revision
       AND instr(gate.enforcement_points_json,'operation')>0
  ) THEN RAISE(ABORT,'INVARIANT_git_draft_gate_scope') END;
END;

CREATE TRIGGER git_draft_identity_immutable
BEFORE UPDATE OF draft_id,draft_request_id,request_digest,operator_id,project_id,project_session_id,
  observed_session_revision,session_generation,coordination_run_id,observed_run_revision,
  observed_dependency_revision,authority_ref,authority_revision,git_allowlist_epoch,
  git_allowlist_digest,draft_kind,operation_id,operation_kind,payload_digest,binding_json,
  draft_digest,expires_at,created_at ON git_operation_drafts
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_draft_identity_immutable'); END;

CREATE TRIGGER git_draft_terminal_gate
AFTER UPDATE OF status ON scoped_gates
WHEN NEW.status IN ('rejected','cancelled','superseded')
BEGIN
  UPDATE git_operation_drafts
     SET state='cancelled',revision=revision+1,terminal_reason='gate-' || NEW.status,updated_at=NEW.updated_at
   WHERE operation_id IN (SELECT operation_id FROM scoped_gate_operations WHERE gate_id=NEW.gate_id)
     AND state IN ('open','gate-bound');
  UPDATE operation_admissions
     SET state='cancelled',revision=revision+1
   WHERE operation_id IN (SELECT operation_id FROM scoped_gate_operations WHERE gate_id=NEW.gate_id)
     AND state='prepared';
END;

CREATE TRIGGER git_execution_profile_delete_forbidden
BEFORE DELETE ON git_execution_profiles
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_profile_immutable'); END;

CREATE TRIGGER git_execution_profile_identity_immutable
BEFORE UPDATE OF profile_id,revision,profile_digest,git_binary_path,git_binary_version,
  git_binary_digest,object_format,merge_backend_id,rebase_backend_id,environment_digest,
  helper_registry_digest,inspector_digest,created_at ON git_execution_profiles
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_profile_immutable'); END;

CREATE TRIGGER git_execution_profile_state_monotonic
BEFORE UPDATE OF state ON git_execution_profiles
WHEN NOT (OLD.state='active' AND NEW.state='revoked')
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_profile_state'); END;

CREATE TRIGGER git_grant_delete_forbidden BEFORE DELETE ON operator_git_grants
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_grant_delete_forbidden'); END;

CREATE TRIGGER git_grant_identity_immutable
BEFORE UPDATE OF grant_id,revision,project_id,project_session_id,session_generation,issuing_session_revision,
  coordination_run_id,issuing_run_revision,issuing_dependency_revision,authority_ref,authority_revision,
  git_allowlist_epoch,git_allowlist_digest,repository_root,worktree_path,execution_profile_id,
  execution_profile_revision,execution_profile_digest,allow_worktree_creation,source_kind,source_digest,
  constraints_json,grant_digest,expires_at,created_at ON operator_git_grants
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_grant_identity_immutable'); END;

CREATE TRIGGER git_remote_registration_delete_forbidden
BEFORE DELETE ON git_remote_registrations
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_remote_immutable'); END;

CREATE TRIGGER git_remote_registration_identity_immutable
BEFORE UPDATE OF registration_id,revision,generation,project_id,remote_name,transport_kind,
  target_identity,target_digest,adapter_id,adapter_contract_digest,credential_selector_digest,created_at
ON git_remote_registrations
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_remote_immutable'); END;

CREATE TRIGGER git_remote_registration_state_monotonic
BEFORE UPDATE OF state ON git_remote_registrations
WHEN NOT (OLD.state='active' AND NEW.state='revoked')
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_remote_state'); END;

CREATE TRIGGER git_resolution_delete_forbidden
BEFORE DELETE ON git_custody_resolutions
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_resolution_immutable'); END;

CREATE TRIGGER git_resolution_immutable
BEFORE UPDATE ON git_custody_resolutions
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_resolution_immutable'); END;

CREATE TRIGGER global_revision_agent_adapter_bindings_delete AFTER DELETE ON agent_adapter_bindings BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_agent_adapter_bindings_insert AFTER INSERT ON agent_adapter_bindings BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_agent_adapter_bindings_update AFTER UPDATE ON agent_adapter_bindings BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

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

CREATE TRIGGER global_revision_agents_delete AFTER DELETE ON agents BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_agents_insert AFTER INSERT ON agents BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_agents_update AFTER UPDATE ON agents BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_artifacts_delete AFTER DELETE ON artifacts
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_artifacts_insert AFTER INSERT ON artifacts
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_artifacts_update AFTER UPDATE ON artifacts
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_attention_items_delete AFTER DELETE ON attention_items BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_attention_items_insert AFTER INSERT ON attention_items BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_attention_items_update AFTER UPDATE ON attention_items BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

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

CREATE TRIGGER global_revision_chair_live_handoff_insert AFTER INSERT ON chair_live_handoff_custody
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_chair_live_handoff_resolution_insert AFTER INSERT ON chair_live_handoff_resolutions
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_chair_live_handoff_update AFTER UPDATE ON chair_live_handoff_custody
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_child_bridge_losses_insert
AFTER INSERT ON child_bridge_losses
BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_cross_family_review_evidence_delete AFTER DELETE ON cross_family_review_evidence BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_cross_family_review_evidence_insert AFTER INSERT ON cross_family_review_evidence BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_cross_family_review_evidence_update AFTER UPDATE ON cross_family_review_evidence BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_events_delete AFTER DELETE ON events BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_events_insert AFTER INSERT ON events BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_events_update AFTER UPDATE ON events BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_git_binding_insert AFTER INSERT ON operator_git_effect_bindings
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_git_binding_update AFTER UPDATE ON operator_git_effect_bindings
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_git_draft_insert AFTER INSERT ON git_operation_drafts
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_git_draft_update AFTER UPDATE ON git_operation_drafts
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_git_execution_profile_insert AFTER INSERT ON git_execution_profiles
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_git_execution_profile_update AFTER UPDATE ON git_execution_profiles
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_git_grant_insert AFTER INSERT ON operator_git_grants
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_git_grant_update AFTER UPDATE ON operator_git_grants
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_git_remote_insert AFTER INSERT ON git_remote_registrations
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_git_remote_update AFTER UPDATE ON git_remote_registrations
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_intakes_delete AFTER DELETE ON intakes BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_intakes_insert AFTER INSERT ON intakes BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_intakes_update AFTER UPDATE ON intakes BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_integration_availability_delete AFTER DELETE ON integration_availability BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_integration_availability_insert AFTER INSERT ON integration_availability BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_integration_availability_update AFTER UPDATE ON integration_availability BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_launched_chair_bridge_insert
AFTER INSERT ON launched_chair_bridge_state
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_launched_chair_bridge_retirement_insert
AFTER INSERT ON launched_chair_bridge_retirements
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_launched_chair_bridge_update
AFTER UPDATE ON launched_chair_bridge_state
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_leases_delete AFTER DELETE ON leases BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_leases_insert AFTER INSERT ON leases BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_leases_update AFTER UPDATE ON leases BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_message_contexts_delete AFTER DELETE ON message_contexts BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_message_contexts_insert AFTER INSERT ON message_contexts BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_message_contexts_update AFTER UPDATE ON message_contexts BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_messages_delete AFTER DELETE ON messages BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_messages_insert AFTER INSERT ON messages BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_messages_update AFTER UPDATE ON messages BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_notification_deliveries_delete AFTER DELETE ON notification_deliveries
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_notification_deliveries_insert AFTER INSERT ON notification_deliveries
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_notification_deliveries_update AFTER UPDATE ON notification_deliveries
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_observer_event_sequence_delete AFTER DELETE ON observer_event_sequence BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_observer_event_sequence_insert AFTER INSERT ON observer_event_sequence BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_observer_event_sequence_update AFTER UPDATE ON observer_event_sequence BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_operator_client_attachments_delete AFTER DELETE ON operator_client_attachments BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_operator_client_attachments_insert AFTER INSERT ON operator_client_attachments BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_operator_client_attachments_update AFTER UPDATE ON operator_client_attachments BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_operator_control_fences_insert
AFTER INSERT ON operator_control_fences
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_operator_control_fences_update
AFTER UPDATE ON operator_control_fences
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_operator_external_effect_binding_insert
AFTER INSERT ON operator_external_effect_bindings
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_operator_external_effect_binding_update
AFTER UPDATE ON operator_external_effect_bindings
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_project_session_launch_custody_insert
AFTER INSERT ON project_session_launch_custody
BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_project_sessions_delete AFTER DELETE ON project_sessions BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_project_sessions_insert AFTER INSERT ON project_sessions BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_project_sessions_update AFTER UPDATE ON project_sessions BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_projects_delete AFTER DELETE ON projects BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_projects_insert AFTER INSERT ON projects BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_projects_update AFTER UPDATE ON projects BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_provider_actions_delete AFTER DELETE ON provider_actions BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_provider_actions_insert AFTER INSERT ON provider_actions BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_provider_actions_update AFTER UPDATE ON provider_actions BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_provider_agent_custody_insert
AFTER INSERT ON provider_agent_custody
BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_provider_state_delete AFTER DELETE ON provider_state BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_provider_state_insert AFTER INSERT ON provider_state BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_provider_state_update AFTER UPDATE ON provider_state BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_resource_dimensions_delete AFTER DELETE ON resource_dimensions BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_resource_dimensions_insert AFTER INSERT ON resource_dimensions BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_resource_dimensions_update AFTER UPDATE ON resource_dimensions BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_resource_scopes_delete AFTER DELETE ON resource_scopes BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_resource_scopes_insert AFTER INSERT ON resource_scopes BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_resource_scopes_update AFTER UPDATE ON resource_scopes BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_result_deliveries_insert AFTER INSERT ON result_deliveries
WHEN NEW.required=1 BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_result_deliveries_update AFTER UPDATE ON result_deliveries
WHEN NEW.required=1 BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_run_git_allowlist_insert AFTER INSERT ON run_git_allowlists
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_runs_delete AFTER DELETE ON runs BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_runs_insert AFTER INSERT ON runs BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_runs_update AFTER UPDATE ON runs BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_task_objective_checks_delete AFTER DELETE ON task_objective_checks BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_task_objective_checks_insert AFTER INSERT ON task_objective_checks BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_task_objective_checks_update AFTER UPDATE ON task_objective_checks BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_tasks_delete AFTER DELETE ON tasks BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_tasks_insert AFTER INSERT ON tasks BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_tasks_update AFTER UPDATE ON tasks BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER global_revision_workstream_custody_insert AFTER INSERT ON workstream_custody
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_workstreams_delete AFTER DELETE ON workstreams BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_workstreams_insert AFTER INSERT ON workstreams BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_workstreams_update AFTER UPDATE ON workstreams BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER human_gate_status_insert BEFORE INSERT ON task_human_gates
WHEN NEW.status NOT IN ('pending','approved','rejected') BEGIN SELECT RAISE(ABORT, 'INVARIANT_human_gate_status'); END;

CREATE TRIGGER human_gate_status_update BEFORE UPDATE OF status ON task_human_gates
WHEN NEW.status NOT IN ('pending','approved','rejected') BEGIN SELECT RAISE(ABORT, 'INVARIANT_human_gate_status'); END;

CREATE TRIGGER intake_accepted_scope_insert
BEFORE INSERT ON intakes
WHEN NOT (
  (NEW.state='accepted' AND NEW.accepted_scope_state='bound' AND NEW.accepted_scope_artifact_id IS NOT NULL) OR
  (NEW.state<>'accepted' AND NEW.accepted_scope_state='not-applicable' AND NEW.accepted_scope_artifact_id IS NULL)
)
BEGIN SELECT RAISE(ABORT, 'intake accepted scope state is invalid'); END;

CREATE TRIGGER intake_accepted_scope_registry_insert
BEFORE INSERT ON intakes
WHEN NEW.state='accepted' AND NEW.accepted_scope_state='bound' AND NOT EXISTS (
  SELECT 1 FROM artifacts artifact
   WHERE artifact.artifact_id=NEW.accepted_scope_artifact_id
     AND artifact.registry_state='active' AND artifact.project_id=NEW.project_id
     AND (artifact.project_session_id IS NULL OR artifact.project_session_id=NEW.project_session_id)
     AND (artifact.run_id IS NULL OR artifact.run_id=NEW.coordination_run_id)
     AND (
       SELECT COUNT(*) FROM json_each(NEW.artifact_refs_json) ref
        WHERE json_extract(ref.value, '$.path')=artifact.relative_path
          AND json_extract(ref.value, '$.digest')=artifact.sha256
     )=1
)
BEGIN SELECT RAISE(ABORT, 'accepted scope must reference one active exact-scope registry row'); END;

CREATE TRIGGER intake_accepted_scope_registry_update
BEFORE UPDATE ON intakes
WHEN NEW.state='accepted' AND NEW.accepted_scope_state='bound' AND NOT EXISTS (
  SELECT 1 FROM artifacts artifact
   WHERE artifact.artifact_id=NEW.accepted_scope_artifact_id
     AND artifact.registry_state='active' AND artifact.project_id=NEW.project_id
     AND (artifact.project_session_id IS NULL OR artifact.project_session_id=NEW.project_session_id)
     AND (artifact.run_id IS NULL OR artifact.run_id=NEW.coordination_run_id)
     AND (
       SELECT COUNT(*) FROM json_each(NEW.artifact_refs_json) ref
        WHERE json_extract(ref.value, '$.path')=artifact.relative_path
          AND json_extract(ref.value, '$.digest')=artifact.sha256
     )=1
)
BEGIN SELECT RAISE(ABORT, 'accepted scope must reference one active exact-scope registry row'); END;

CREATE TRIGGER intake_accepted_scope_update
BEFORE UPDATE ON intakes
WHEN NOT (
  (NEW.state='accepted' AND NEW.accepted_scope_state IN ('bound','recovery-required') AND
    ((NEW.accepted_scope_state='bound' AND NEW.accepted_scope_artifact_id IS NOT NULL) OR
     (NEW.accepted_scope_state='recovery-required' AND NEW.accepted_scope_artifact_id IS NULL))) OR
  (NEW.state<>'accepted' AND NEW.accepted_scope_state='not-applicable' AND NEW.accepted_scope_artifact_id IS NULL)
)
BEGIN SELECT RAISE(ABORT, 'intake accepted scope state is invalid'); END;

CREATE TRIGGER intake_artifact_binding_exact_insert
BEFORE INSERT ON intake_artifact_bindings
WHEN NOT EXISTS (
  SELECT 1
    FROM artifacts artifact JOIN intakes intake ON intake.intake_id=NEW.intake_id
   WHERE artifact.artifact_id=NEW.artifact_id AND artifact.registry_state='active'
     AND artifact.relative_path=NEW.relative_path AND artifact.sha256=NEW.sha256
     AND artifact.project_id=intake.project_id
     AND (artifact.project_session_id IS NULL OR artifact.project_session_id=intake.project_session_id)
     AND (artifact.run_id IS NULL OR artifact.run_id=intake.coordination_run_id)
)
BEGIN SELECT RAISE(ABORT, 'intake artifact binding must reference one active exact-scope registry row'); END;

CREATE TRIGGER intake_artifact_binding_exact_update
BEFORE UPDATE ON intake_artifact_bindings
WHEN NOT EXISTS (
  SELECT 1
    FROM artifacts artifact JOIN intakes intake ON intake.intake_id=NEW.intake_id
   WHERE artifact.artifact_id=NEW.artifact_id AND artifact.registry_state='active'
     AND artifact.relative_path=NEW.relative_path AND artifact.sha256=NEW.sha256
     AND artifact.project_id=intake.project_id
     AND (artifact.project_session_id IS NULL OR artifact.project_session_id=intake.project_session_id)
     AND (artifact.run_id IS NULL OR artifact.run_id=intake.coordination_run_id)
)
BEGIN SELECT RAISE(ABORT, 'intake artifact binding must reference one active exact-scope registry row'); END;

CREATE TRIGGER intake_revision_accepted_scope_insert
BEFORE INSERT ON intake_revisions
WHEN NOT (
  (NEW.state='accepted' AND NEW.accepted_scope_state='bound' AND NEW.accepted_scope_artifact_id IS NOT NULL) OR
  (NEW.state<>'accepted' AND NEW.accepted_scope_state='not-applicable' AND NEW.accepted_scope_artifact_id IS NULL)
)
BEGIN SELECT RAISE(ABORT, 'intake revision accepted scope state is invalid'); END;

CREATE TRIGGER intake_revision_accepted_scope_registry_insert
BEFORE INSERT ON intake_revisions
WHEN NEW.state='accepted' AND NEW.accepted_scope_state='bound' AND NOT EXISTS (
  SELECT 1
    FROM intakes intake JOIN artifacts artifact
      ON artifact.artifact_id=NEW.accepted_scope_artifact_id
   WHERE intake.intake_id=NEW.intake_id
     AND artifact.registry_state='active' AND artifact.project_id=intake.project_id
     AND (artifact.project_session_id IS NULL OR artifact.project_session_id=intake.project_session_id)
     AND (artifact.run_id IS NULL OR artifact.run_id=intake.coordination_run_id)
     AND (
       SELECT COUNT(*) FROM json_each(NEW.payload_json, '$.artifactRefs') ref
        WHERE json_extract(ref.value, '$.path')=artifact.relative_path
          AND json_extract(ref.value, '$.digest')=artifact.sha256
     )=1
)
BEGIN SELECT RAISE(ABORT, 'accepted scope must reference one active exact-scope registry row'); END;

CREATE TRIGGER intake_revision_accepted_scope_registry_update
BEFORE UPDATE ON intake_revisions
WHEN NEW.state='accepted' AND NEW.accepted_scope_state='bound' AND NOT EXISTS (
  SELECT 1
    FROM intakes intake JOIN artifacts artifact
      ON artifact.artifact_id=NEW.accepted_scope_artifact_id
   WHERE intake.intake_id=NEW.intake_id
     AND artifact.registry_state='active' AND artifact.project_id=intake.project_id
     AND (artifact.project_session_id IS NULL OR artifact.project_session_id=intake.project_session_id)
     AND (artifact.run_id IS NULL OR artifact.run_id=intake.coordination_run_id)
     AND (
       SELECT COUNT(*) FROM json_each(NEW.payload_json, '$.artifactRefs') ref
        WHERE json_extract(ref.value, '$.path')=artifact.relative_path
          AND json_extract(ref.value, '$.digest')=artifact.sha256
     )=1
)
BEGIN SELECT RAISE(ABORT, 'accepted scope must reference one active exact-scope registry row'); END;

CREATE TRIGGER intake_revision_accepted_scope_update
BEFORE UPDATE ON intake_revisions
WHEN NOT (
  (NEW.state='accepted' AND NEW.accepted_scope_state IN ('bound','recovery-required') AND
    ((NEW.accepted_scope_state='bound' AND NEW.accepted_scope_artifact_id IS NOT NULL) OR
     (NEW.accepted_scope_state='recovery-required' AND NEW.accepted_scope_artifact_id IS NULL))) OR
  (NEW.state<>'accepted' AND NEW.accepted_scope_state='not-applicable' AND NEW.accepted_scope_artifact_id IS NULL)
)
BEGIN SELECT RAISE(ABORT, 'intake revision accepted scope state is invalid'); END;

CREATE TRIGGER launch_custody_immutable_delete
BEFORE DELETE ON project_session_launch_custody
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_launch_custody_immutable');
END;

CREATE TRIGGER launch_custody_immutable_update
BEFORE UPDATE ON project_session_launch_custody
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_launch_custody_immutable');
END;

CREATE TRIGGER launch_custody_requires_attestation_challenge
BEFORE INSERT ON project_session_launch_custody
WHEN NEW.attestation_challenge_digest IS NULL
  OR length(NEW.attestation_challenge_digest) <> 71
  OR substr(NEW.attestation_challenge_digest, 1, 7) <> 'sha256:'
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_launch_attestation_challenge_digest');
END;

CREATE TRIGGER launched_chair_bridge_delete_forbidden
BEFORE DELETE ON launched_chair_bridge_state
BEGIN SELECT RAISE(ABORT, 'INVARIANT_launched_chair_bridge_identity_immutable'); END;

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

CREATE TRIGGER launched_chair_bridge_retirement_immutable_delete
BEFORE DELETE ON launched_chair_bridge_retirements
BEGIN SELECT RAISE(ABORT,'INVARIANT_launched_chair_bridge_retirement_immutable'); END;

CREATE TRIGGER launched_chair_bridge_retirement_immutable_update
BEFORE UPDATE ON launched_chair_bridge_retirements
BEGIN SELECT RAISE(ABORT,'INVARIANT_launched_chair_bridge_retirement_immutable'); END;

CREATE TRIGGER launched_chair_bridge_retirement_insert_guard
BEFORE INSERT ON launched_chair_bridge_retirements
WHEN NOT EXISTS (
  SELECT 1
    FROM launched_chair_bridge_state bridge
    JOIN runs run ON run.project_session_id=bridge.project_session_id
                 AND run.run_id=bridge.coordination_run_id
    JOIN project_sessions session ON session.project_session_id=bridge.project_session_id
    JOIN run_chair_leases lease
      ON lease.project_session_id=run.project_session_id
     AND lease.run_id=run.run_id
     AND lease.lease_id=run.chair_lease_id
     AND lease.generation=run.chair_generation
    JOIN capabilities capability ON capability.token_hash=bridge.capability_hash
    JOIN agents agent ON agent.run_id=bridge.coordination_run_id
                     AND agent.agent_id=bridge.chair_agent_id
   WHERE bridge.project_session_id=NEW.project_session_id
     AND bridge.coordination_run_id=NEW.coordination_run_id
     AND bridge.state IN ('active','abandoned')
     AND run.lifecycle_state IN ('closed','cancelled','launch_failed')
     AND session.state IN ('closed','cancelled')
     AND session.terminal_path_json=NEW.terminal_ref
     AND json_valid(session.terminal_path_json)=1
     AND json_extract(session.terminal_path_json,'$.kind')=NEW.terminal_kind
     AND run.chair_agent_id=bridge.chair_agent_id
     AND lease.holder_agent_id=bridge.chair_agent_id
     AND lease.status='revoked'
     AND capability.revoked_at IS NOT NULL
     AND agent.lifecycle='archived'
     AND (
       (NEW.source_kind='project-session-close' AND EXISTS (
         SELECT 1 FROM operator_commands command
         WHERE command.project_session_id=NEW.project_session_id
            AND command.operator_id=NEW.owner_operator_id
            AND command.command_id=NEW.owner_ref
            AND command.operation='decide' AND command.status='committed'
            AND json_valid(command.result_json)=1
            AND json_extract(command.result_json,'$.projectSessionId')=NEW.project_session_id
            AND json_extract(command.result_json,'$.terminalPath.kind')=NEW.terminal_kind
       )) OR
       (NEW.source_kind='project-session-stop' AND EXISTS (
         SELECT 1 FROM operator_effect_custody custody
         WHERE custody.project_session_id=NEW.project_session_id
            AND custody.operator_id=NEW.owner_operator_id
            AND custody.command_id=NEW.owner_ref
            AND custody.operation='project-session-stop'
            AND custody.state IN ('dispatching','terminal')
            AND json_valid(custody.intent_json)=1
            AND json_extract(custody.intent_json,'$.kind')='project-session-stop'
            AND json_extract(custody.intent_json,'$.projectSessionId')=NEW.project_session_id
       )) OR
       (NEW.source_kind='chair-recovery-abandon' AND EXISTS (
         SELECT 1 FROM chair_bridge_recovery_custody recovery
          JOIN chair_bridge_losses loss ON loss.loss_id=recovery.loss_id
          WHERE recovery.recovery_id=NEW.owner_ref AND recovery.path='abandon'
            AND recovery.operator_id=NEW.owner_operator_id
            AND recovery.state IN ('committing','terminal')
            AND loss.project_session_id=NEW.project_session_id
            AND loss.coordination_run_id=NEW.coordination_run_id
       ))
     )
)
BEGIN SELECT RAISE(ABORT,'INVARIANT_launched_chair_bridge_retirement_proof'); END;

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

CREATE TRIGGER legacy_task_gates_delete BEFORE DELETE ON task_human_gates
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_LEGACY_GATES_READ_ONLY'); END;

CREATE TRIGGER legacy_task_gates_insert BEFORE INSERT ON task_human_gates
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_LEGACY_GATES_READ_ONLY'); END;

CREATE TRIGGER legacy_task_gates_update BEFORE UPDATE ON task_human_gates
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_LEGACY_GATES_READ_ONLY'); END;

CREATE TRIGGER membership_same_run_insert BEFORE INSERT ON project_session_memberships
WHEN NOT EXISTS (SELECT 1 FROM runs r WHERE r.project_session_id=NEW.project_session_id AND r.run_id=NEW.coordination_run_id)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_MEMBERSHIP_RUN'); END;

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

CREATE TRIGGER notification_cannot_mutate_attention BEFORE UPDATE OF state ON attention_items
WHEN NEW.state<>OLD.state AND EXISTS (
  SELECT 1 FROM notification_deliveries d WHERE d.item_id=OLD.item_id AND d.state IN ('pending','claimed')
)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_NOTIFICATION_NOT_AUTHORITY'); END;

CREATE TRIGGER objective_check_status_insert BEFORE INSERT ON task_objective_checks
WHEN NEW.status NOT IN ('pending','pass','fail') BEGIN SELECT RAISE(ABORT, 'INVARIANT_objective_check_status'); END;

CREATE TRIGGER objective_check_status_update BEFORE UPDATE OF status ON task_objective_checks
WHEN NEW.status NOT IN ('pending','pass','fail') BEGIN SELECT RAISE(ABORT, 'INVARIANT_objective_check_status'); END;

CREATE TRIGGER operation_gate_block BEFORE UPDATE OF state ON operation_admissions
WHEN NEW.state IN ('authorised','executing') AND EXISTS (
  SELECT 1 FROM scoped_gates g JOIN scoped_gate_operations go ON go.gate_id=g.gate_id
   WHERE go.operation_id=NEW.operation_id AND g.project_session_id=NEW.project_session_id
     AND g.coordination_run_id=NEW.coordination_run_id AND g.status IN ('pending','deferred')
)
BEGIN SELECT RAISE(ABORT,'AFAB_0012_GATE_BLOCKED'); END;

CREATE TRIGGER operator_capability_bounds_insert BEFORE INSERT ON operator_capabilities BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM operator_principals p JOIN projects j ON j.project_id=p.project_id
     WHERE p.operator_id=NEW.operator_id AND p.project_id=NEW.project_id AND p.state='active'
       AND p.principal_generation=NEW.principal_generation
       AND p.project_authority_generation=NEW.project_authority_generation
       AND j.authority_generation=NEW.project_authority_generation
  ) THEN RAISE(ABORT, 'AFAB_0004_CAPABILITY_PRINCIPAL') END;
  SELECT CASE WHEN (NEW.kind='project-launch' AND (NEW.project_session_id IS NOT NULL OR NEW.session_generation IS NOT NULL)) OR
                        (NEW.kind<>'project-launch' AND (NEW.project_session_id IS NULL OR NEW.session_generation IS NULL))
    THEN RAISE(ABORT, 'AFAB_0004_CAPABILITY_SCOPE') END;
  SELECT CASE WHEN NEW.project_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM project_sessions s WHERE s.project_session_id=NEW.project_session_id
      AND s.project_id=NEW.project_id AND s.generation=NEW.session_generation
  ) THEN RAISE(ABORT, 'AFAB_0004_CAPABILITY_GENERATION') END;
END;

CREATE TRIGGER operator_effect_git_nonterminal_requires_four_owner_map
BEFORE UPDATE OF state ON operator_effect_custody
WHEN NEW.state IN ('conflict','quarantined')
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM operator_git_effect_bindings binding
    JOIN operation_admissions admission ON admission.operation_id=binding.operation_id
    JOIN git_mutation_reservations reservation
      ON reservation.custody_id=binding.custody_id
     AND reservation.generation=binding.mutation_reservation_generation
    WHERE binding.custody_id=NEW.custody_id
      AND binding.state=NEW.state
      AND admission.state=NEW.state
      AND reservation.state=NEW.state
  ) THEN RAISE(ABORT,'INVARIANT_git_four_owner_map') END;
END;

CREATE TRIGGER operator_external_effect_binding_delete_forbidden
BEFORE DELETE ON operator_external_effect_bindings
BEGIN SELECT RAISE(ABORT,'INVARIANT_external_effect_binding_immutable'); END;

CREATE TRIGGER operator_external_effect_binding_identity_immutable
BEFORE UPDATE OF custody_id,effect_kind,integration_id,integration_generation,operation_id,
  contract_digest,target_id,target_revision,request_artifact_path,request_artifact_digest,
  idempotency_key,release_gate_id,release_gate_revision,release_binding_digest,created_at
ON operator_external_effect_bindings
BEGIN SELECT RAISE(ABORT,'INVARIANT_external_effect_binding_immutable'); END;

CREATE TRIGGER operator_external_effect_binding_insert_guard
BEFORE INSERT ON operator_external_effect_bindings
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM operator_effect_custody custody
     WHERE custody.custody_id=NEW.custody_id
       AND custody.state='prepared'
       AND custody.operation='external-effect'
       AND json_valid(custody.intent_json)=1
       AND json_extract(custody.intent_json,'$.kind')=NEW.effect_kind
  ) THEN RAISE(ABORT,'INVARIANT_external_effect_parent') END;

  SELECT CASE WHEN NEW.effect_kind='registered-external-effect' AND NOT EXISTS (
    SELECT 1 FROM operator_effect_custody custody
     WHERE custody.custody_id=NEW.custody_id
       AND json_extract(custody.intent_json,'$.integrationId')=NEW.integration_id
       AND json_extract(custody.intent_json,'$.expectedIntegrationGeneration')=NEW.integration_generation
       AND json_extract(custody.intent_json,'$.operationId')=NEW.operation_id
       AND json_extract(custody.intent_json,'$.contractDigest')=NEW.contract_digest
       AND json_extract(custody.intent_json,'$.targetId')=NEW.target_id
       AND json_extract(custody.intent_json,'$.expectedTargetRevision')=NEW.target_revision
       AND json_extract(custody.intent_json,'$.requestArtifactRef.path')=NEW.request_artifact_path
       AND json_extract(custody.intent_json,'$.requestArtifactRef.digest')=NEW.request_artifact_digest
       AND json_extract(custody.intent_json,'$.idempotencyKey')=NEW.idempotency_key
  ) THEN RAISE(ABORT,'INVARIANT_external_effect_intent_binding') END;

  SELECT CASE WHEN NEW.effect_kind='promotion' AND NOT EXISTS (
    SELECT 1 FROM operator_effect_custody custody
    JOIN scoped_gates gate ON gate.gate_id=NEW.release_gate_id
     WHERE custody.custody_id=NEW.custody_id
       AND gate.project_session_id=custody.project_session_id
       AND gate.scope_kind='release'
       AND gate.status='approved'
       AND gate.revision=NEW.release_gate_revision
       AND json_extract(custody.intent_json,'$.gateId')=NEW.release_gate_id
       AND json_extract(custody.intent_json,'$.expectedGateRevision')=NEW.release_gate_revision
       AND json_extract(custody.intent_json,'$.releaseBinding.acceptedDeliveryReceiptRef.path')=NEW.request_artifact_path
       AND json_extract(custody.intent_json,'$.releaseBinding.acceptedDeliveryReceiptRef.digest')=NEW.request_artifact_digest
       AND json_extract(custody.intent_json,'$.releaseBinding.promotionAction')=NEW.operation_id
       AND json_extract(custody.intent_json,'$.releaseBinding.target')=NEW.target_id
       AND json_extract(gate.release_binding_json,'$.acceptedDeliveryReceiptRef.path')=NEW.request_artifact_path
       AND json_extract(gate.release_binding_json,'$.acceptedDeliveryReceiptRef.digest')=NEW.request_artifact_digest
       AND json_extract(gate.release_binding_json,'$.promotionAction')=NEW.operation_id
       AND json_extract(gate.release_binding_json,'$.target')=NEW.target_id
  ) THEN RAISE(ABORT,'INVARIANT_promotion_release_binding') END;
END;

CREATE TRIGGER operator_external_effect_binding_lookup_cas
BEFORE UPDATE OF lookup_generation,lookup_evidence_digest ON operator_external_effect_bindings
WHEN NEW.lookup_generation<>OLD.lookup_generation+1 OR NEW.lookup_evidence_digest IS NULL
BEGIN SELECT RAISE(ABORT,'INVARIANT_external_effect_lookup_cas'); END;

CREATE TRIGGER operator_external_effect_requires_typed_binding
BEFORE UPDATE OF state ON operator_effect_custody
WHEN json_valid(OLD.intent_json)=1
 AND json_extract(OLD.intent_json,'$.kind') IN ('registered-external-effect','promotion')
 AND NOT EXISTS(SELECT 1 FROM operator_external_effect_bindings b WHERE b.custody_id=OLD.custody_id)
BEGIN SELECT RAISE(ABORT,'INVARIANT_external_effect_binding_required'); END;

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

CREATE TRIGGER provider_agent_custody_immutable_delete
BEFORE DELETE ON provider_agent_custody
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_provider_agent_custody_immutable');
END;

CREATE TRIGGER provider_agent_custody_immutable_update
BEFORE UPDATE ON provider_agent_custody
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_provider_agent_custody_immutable');
END;

CREATE TRIGGER provider_state_generation_insert BEFORE INSERT ON provider_state
WHEN NEW.provider_session_generation < 1 BEGIN SELECT RAISE(ABORT, 'INVARIANT_provider_state_generation'); END;

CREATE TRIGGER provider_state_generation_update BEFORE UPDATE OF provider_session_generation ON provider_state
WHEN NEW.provider_session_generation < 1 BEGIN SELECT RAISE(ABORT, 'INVARIANT_provider_state_generation'); END;

CREATE TRIGGER ps_awaiting_acceptance BEFORE UPDATE OF state ON project_sessions
WHEN NEW.state='awaiting_acceptance' AND (
  EXISTS (SELECT 1 FROM project_session_memberships m WHERE m.project_session_id=NEW.project_session_id AND m.required=1 AND m.state='active') OR
  EXISTS (SELECT 1 FROM runs r WHERE r.project_session_id=NEW.project_session_id AND r.lifecycle_state NOT IN ('awaiting_acceptance','closed','cancelled','launch_failed')) OR
  EXISTS (SELECT 1 FROM result_deliveries d WHERE d.project_session_id=NEW.project_session_id AND d.required=1 AND d.state NOT IN ('consumed','abandoned'))
)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_SESSION_CLOSURE_BLOCKED'); END;

CREATE TRIGGER ps_generation_step BEFORE UPDATE OF generation ON project_sessions
WHEN NEW.generation NOT IN (OLD.generation, OLD.generation + 1)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_SESSION_GENERATION'); END;

CREATE TRIGGER ps_membership_frozen BEFORE INSERT ON project_session_memberships
WHEN (SELECT state FROM project_sessions WHERE project_session_id=NEW.project_session_id)
     IN ('quiescing','awaiting_acceptance','closed','cancelled')
BEGIN SELECT RAISE(ABORT,'AFAB_0004_MEMBERSHIP_FROZEN'); END;

CREATE TRIGGER ps_origin_insert BEFORE INSERT ON project_sessions BEGIN
  SELECT CASE WHEN
    (NEW.origin_kind='operator-launch' AND (NEW.origin_operator_id IS NULL OR NEW.migration_manifest_ref IS NOT NULL)) OR
    (NEW.origin_kind='legacy-migration' AND (NEW.origin_operator_id IS NOT NULL OR NEW.migration_manifest_ref IS NULL))
    THEN RAISE(ABORT, 'AFAB_0004_SESSION_ORIGIN') END;
END;

CREATE TRIGGER ps_origin_update BEFORE UPDATE OF origin_kind,origin_operator_id,migration_manifest_ref ON project_sessions
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_SESSION_ORIGIN_IMMUTABLE'); END;

CREATE TRIGGER ps_revision_step BEFORE UPDATE OF state,revision,authority_ref,budget_ref,launch_packet_path,launch_packet_digest,membership_revision ON project_sessions
WHEN NEW.revision <> OLD.revision + 1
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_SESSION_REVISION'); END;

CREATE TRIGGER resource_dimension_update BEFORE UPDATE OF used,reserved,usage_unknown ON resource_dimensions
WHEN NEW.used<0 OR NEW.reserved<0 OR NEW.used+NEW.reserved>NEW.limit_value OR NEW.usage_unknown NOT IN (0,1)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_RESOURCE_BOUNDS'); END;

CREATE TRIGGER result_claim_generation BEFORE UPDATE OF claim_generation ON result_deliveries
WHEN NEW.claim_generation NOT IN (OLD.claim_generation, OLD.claim_generation+1)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_RESULT_CLAIM_GENERATION'); END;

CREATE TRIGGER result_delivery_transition BEFORE UPDATE OF state ON result_deliveries
WHEN NOT (
  (OLD.state='pending' AND NEW.state IN ('claimed','overdue','abandoned')) OR
  (OLD.state='claimed' AND NEW.state IN ('provider-accepted','pending','overdue','abandoned')) OR
  (OLD.state='provider-accepted' AND NEW.state IN ('consumed','overdue','abandoned')) OR
  (OLD.state='overdue' AND NEW.state IN ('pending','abandoned')) OR
  (OLD.state=NEW.state)
)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_RESULT_TRANSITION'); END;

CREATE TRIGGER run_authority_revision_delete_forbidden
BEFORE DELETE ON run_authority_revisions
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_authority_history_immutable'); END;

CREATE TRIGGER run_authority_revision_immutable
BEFORE UPDATE ON run_authority_revisions
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_authority_history_immutable'); END;

CREATE TRIGGER run_chair_generation_step BEFORE UPDATE OF chair_generation ON runs
WHEN NEW.chair_generation NOT IN (OLD.chair_generation, OLD.chair_generation + 1)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_RUN_CHAIR_GENERATION'); END;

CREATE TRIGGER run_chair_lease_cross_owner_insert
BEFORE INSERT ON run_chair_leases
WHEN EXISTS (SELECT 1 FROM leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
  OR EXISTS (SELECT 1 FROM task_owner_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
BEGIN SELECT RAISE(ABORT,'INVARIANT_lease_identity_single_owner'); END;

CREATE TRIGGER run_chair_lease_cross_owner_update
BEFORE UPDATE OF project_session_id,run_id,lease_id ON run_chair_leases
WHEN EXISTS (SELECT 1 FROM leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
  OR EXISTS (SELECT 1 FROM task_owner_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
BEGIN SELECT RAISE(ABORT,'INVARIANT_lease_identity_single_owner'); END;

CREATE TRIGGER run_chair_lease_identity_immutable
BEFORE UPDATE OF project_session_id,run_id,lease_id,holder_agent_id,generation ON run_chair_leases
WHEN NEW.project_session_id<>OLD.project_session_id OR NEW.run_id<>OLD.run_id
  OR NEW.lease_id<>OLD.lease_id OR NEW.holder_agent_id<>OLD.holder_agent_id
  OR NEW.generation<>OLD.generation
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_chair_lease_identity_immutable'); END;

CREATE TRIGGER run_git_allowlist_delete_forbidden
BEFORE DELETE ON run_git_allowlists
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_immutable'); END;

CREATE TRIGGER run_git_allowlist_identity_immutable
BEFORE UPDATE ON run_git_allowlists
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_immutable'); END;

CREATE TRIGGER run_git_allowlist_path_delete_forbidden
BEFORE DELETE ON run_git_allowlist_paths
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;

CREATE TRIGGER run_git_allowlist_path_immutable
BEFORE UPDATE ON run_git_allowlist_paths
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;

CREATE TRIGGER run_git_allowlist_profile_delete_forbidden
BEFORE DELETE ON run_git_allowlist_profiles
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;

CREATE TRIGGER run_git_allowlist_profile_immutable
BEFORE UPDATE ON run_git_allowlist_profiles
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;

CREATE TRIGGER run_git_allowlist_ref_delete_forbidden
BEFORE DELETE ON run_git_allowlist_refs
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;

CREATE TRIGGER run_git_allowlist_ref_immutable
BEFORE UPDATE ON run_git_allowlist_refs
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;

CREATE TRIGGER run_git_allowlist_remote_delete_forbidden
BEFORE DELETE ON run_git_allowlist_remotes
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;

CREATE TRIGGER run_git_allowlist_remote_immutable
BEFORE UPDATE ON run_git_allowlist_remotes
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;

CREATE TRIGGER run_git_allowlist_variant_delete_forbidden
BEFORE DELETE ON run_git_allowlist_variants
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;

CREATE TRIGGER run_git_allowlist_variant_immutable
BEFORE UPDATE ON run_git_allowlist_variants
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;

CREATE TRIGGER run_required_session_identity_update
BEFORE UPDATE OF project_session_id,lifecycle_state,revision,chair_generation,
  chair_lease_id,authority_ref,budget_ref,dependency_revision ON runs
WHEN NEW.project_session_id IS NULL OR NEW.lifecycle_state IS NULL OR NEW.revision IS NULL
  OR NEW.chair_generation IS NULL OR NEW.chair_lease_id IS NULL OR NEW.authority_ref IS NULL
  OR NEW.budget_ref IS NULL OR NEW.dependency_revision IS NULL
  OR NEW.project_session_id<>OLD.project_session_id
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_required_session_identity'); END;

CREATE TRIGGER run_revision_step BEFORE UPDATE OF lifecycle_state,revision,chair_agent_id,chair_generation,chair_lease_id,authority_ref,budget_ref ON runs
WHEN NEW.revision <> OLD.revision + 1
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_RUN_REVISION'); END;

CREATE TRIGGER run_session_insert BEFORE INSERT ON runs
WHEN NEW.project_session_id IS NULL OR NEW.lifecycle_state IS NULL OR NEW.revision IS NULL OR
     NEW.chair_generation IS NULL OR NEW.chair_lease_id IS NULL OR NEW.authority_ref IS NULL OR
     NEW.budget_ref IS NULL OR NEW.dependency_revision IS NULL
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_RUN_SESSION_REQUIRED'); END;

CREATE TRIGGER run_topology_insert BEFORE INSERT ON runs BEGIN
  SELECT CASE WHEN
    ((SELECT mode FROM project_sessions WHERE project_session_id=NEW.project_session_id)='coordinated' AND NEW.topology_slot<>1) OR
    ((SELECT mode FROM project_sessions WHERE project_session_id=NEW.project_session_id)='independent' AND NEW.topology_slot IS NOT NULL)
    THEN RAISE(ABORT, 'AFAB_0004_RUN_TOPOLOGY') END;
END;

CREATE TRIGGER task_gate_readiness BEFORE UPDATE OF state ON tasks
WHEN NEW.state='active' AND EXISTS (
  SELECT 1 FROM scoped_gate_tasks gt JOIN scoped_gates g ON g.gate_id=gt.gate_id
   WHERE gt.run_id=NEW.run_id AND gt.task_id=NEW.task_id AND g.status IN ('pending','deferred')
     AND EXISTS (SELECT 1 FROM json_each(g.enforcement_points_json) WHERE value='task-readiness')
)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_GATE_BLOCKED'); END;

CREATE TRIGGER task_owner_lease_cross_owner_insert
BEFORE INSERT ON task_owner_leases
WHEN EXISTS (SELECT 1 FROM run_chair_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
  OR EXISTS (SELECT 1 FROM leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
BEGIN SELECT RAISE(ABORT,'INVARIANT_lease_identity_single_owner'); END;

CREATE TRIGGER task_owner_lease_cross_owner_update
BEFORE UPDATE OF project_session_id,run_id,lease_id ON task_owner_leases
WHEN EXISTS (SELECT 1 FROM run_chair_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
  OR EXISTS (SELECT 1 FROM leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
BEGIN SELECT RAISE(ABORT,'INVARIANT_lease_identity_single_owner'); END;

CREATE TRIGGER task_owner_lease_identity_immutable
BEFORE UPDATE OF project_session_id,run_id,task_id,lease_id,holder_agent_id,generation ON task_owner_leases
WHEN NEW.project_session_id<>OLD.project_session_id OR NEW.run_id<>OLD.run_id
  OR NEW.task_id<>OLD.task_id OR NEW.lease_id<>OLD.lease_id
  OR NEW.holder_agent_id<>OLD.holder_agent_id OR NEW.generation<>OLD.generation
BEGIN SELECT RAISE(ABORT,'INVARIANT_task_owner_lease_identity_immutable'); END;

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

CREATE TRIGGER teams_values_insert BEFORE INSERT ON teams
WHEN NEW.state NOT IN ('active','frozen','barrier-closed') OR NEW.generation < 1 OR NEW.depth < 1
BEGIN SELECT RAISE(ABORT, 'INVARIANT_teams_values'); END;

CREATE TRIGGER teams_values_update BEFORE UPDATE OF state,generation,depth ON teams
WHEN NEW.state NOT IN ('active','frozen','barrier-closed') OR NEW.generation < 1 OR NEW.depth < 1
BEGIN SELECT RAISE(ABORT, 'INVARIANT_teams_values'); END;

CREATE TRIGGER workstream_custody_immutable_delete
BEFORE DELETE ON workstream_custody
BEGIN SELECT RAISE(ABORT, 'INVARIANT_workstream_custody_immutable'); END;

CREATE TRIGGER workstream_custody_immutable_update
BEFORE UPDATE ON workstream_custody
BEGIN SELECT RAISE(ABORT, 'INVARIANT_workstream_custody_immutable'); END;

CREATE TRIGGER write_lease_cross_owner_insert
BEFORE INSERT ON leases
WHEN EXISTS (SELECT 1 FROM run_chair_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
  OR EXISTS (SELECT 1 FROM task_owner_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
BEGIN SELECT RAISE(ABORT,'INVARIANT_lease_identity_single_owner'); END;

CREATE TRIGGER write_lease_cross_owner_update
BEFORE UPDATE OF run_id,lease_id ON leases
WHEN EXISTS (SELECT 1 FROM run_chair_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
  OR EXISTS (SELECT 1 FROM task_owner_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
BEGIN SELECT RAISE(ABORT,'INVARIANT_lease_identity_single_owner'); END;

CREATE TRIGGER write_lease_identity_immutable
BEFORE UPDATE OF lease_id,run_id,kind ON leases
WHEN NEW.lease_id<>OLD.lease_id OR NEW.run_id<>OLD.run_id OR NEW.kind<>OLD.kind
BEGIN SELECT RAISE(ABORT,'INVARIANT_write_lease_identity_immutable'); END;

CREATE TRIGGER writer_prefix_exact_overlap BEFORE INSERT ON writer_prefixes
WHEN EXISTS (
  SELECT 1 FROM writer_prefixes p JOIN writer_admissions w ON w.writer_admission_id=p.writer_admission_id
   WHERE w.state='active' AND p.canonical_prefix=NEW.canonical_prefix
)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_WRITER_OVERLAP'); END;

INSERT INTO daemon_global_state(singleton, revision) VALUES (1, 1);

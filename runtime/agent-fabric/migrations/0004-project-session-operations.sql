-- Spec 05 project-session/operator extension. Additive to schema v3.

CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  canonical_root TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  authority_generation INTEGER NOT NULL CHECK (authority_generation >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
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

INSERT INTO projects(project_id, canonical_root, revision, authority_generation, created_at, updated_at)
SELECT project_id, canonical_root, 1, 1, 0, 0
  FROM migration_0004_legacy_import
 GROUP BY project_id, canonical_root;

INSERT INTO project_sessions(
  project_session_id, project_id, mode, state, revision, generation, authority_ref,
  budget_ref, launch_packet_path, launch_packet_digest, membership_revision,
  origin_kind, origin_operator_id, migration_manifest_ref, terminal_path_json,
  created_at, updated_at
)
SELECT project_session_id, project_id, 'independent', import_state, 1, 1, authority_ref,
       budget_ref, launch_packet_path, launch_packet_digest, 1,
       'legacy-migration', NULL, manifest_ref, terminal_path_json, 0, 0
  FROM migration_0004_legacy_import;

ALTER TABLE runs ADD COLUMN project_session_id TEXT REFERENCES project_sessions(project_session_id);
ALTER TABLE runs ADD COLUMN lifecycle_state TEXT CHECK (lifecycle_state IN (
  'draft','awaiting_launch','launching','active','quiescing','awaiting_acceptance','closed',
  'launch_failed','launch_ambiguous','reconciling','visibility_degraded','recovery_required',
  'quarantined','cancelled'
));
ALTER TABLE runs ADD COLUMN revision INTEGER CHECK (revision >= 1);
ALTER TABLE runs ADD COLUMN chair_generation INTEGER CHECK (chair_generation >= 1);
ALTER TABLE runs ADD COLUMN chair_lease_id TEXT;
ALTER TABLE runs ADD COLUMN authority_ref TEXT;
ALTER TABLE runs ADD COLUMN budget_ref TEXT;
ALTER TABLE runs ADD COLUMN dependency_revision INTEGER CHECK (dependency_revision >= 1);
ALTER TABLE runs ADD COLUMN topology_slot INTEGER CHECK (topology_slot IS NULL OR topology_slot = 1);

UPDATE runs
   SET project_session_id = (SELECT project_session_id FROM migration_0004_legacy_import i WHERE i.run_id = runs.run_id),
       lifecycle_state = (SELECT import_state FROM migration_0004_legacy_import i WHERE i.run_id = runs.run_id),
       revision = 1,
       chair_generation = 1,
       chair_lease_id = 'chair:' || run_id || ':1',
       authority_ref = (SELECT authority_ref FROM migration_0004_legacy_import i WHERE i.run_id = runs.run_id),
       budget_ref = (SELECT budget_ref FROM migration_0004_legacy_import i WHERE i.run_id = runs.run_id),
       dependency_revision = 1,
       topology_slot = NULL;

CREATE UNIQUE INDEX runs_by_project_session_identity ON runs(project_session_id, run_id);
CREATE INDEX runs_by_lifecycle ON runs(lifecycle_state, project_session_id, run_id);

ALTER TABLE task_dependencies ADD COLUMN project_session_id TEXT REFERENCES project_sessions(project_session_id);
ALTER TABLE task_dependencies ADD COLUMN dependency_revision INTEGER CHECK (dependency_revision >= 1);
UPDATE task_dependencies
   SET project_session_id = (SELECT project_session_id FROM runs WHERE runs.run_id = task_dependencies.run_id),
       dependency_revision = 1;

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

INSERT INTO run_chair_leases(project_session_id, run_id, lease_id, holder_agent_id, generation, status, updated_at)
SELECT i.project_session_id, i.run_id, 'chair:' || i.run_id || ':1', i.chair_agent_id, 1,
       CASE WHEN i.import_state = 'closed' THEN 'revoked' ELSE 'frozen' END, 0
  FROM migration_0004_legacy_import i;

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

INSERT INTO task_owner_leases(project_session_id, run_id, task_id, lease_id, holder_agent_id, generation, status, updated_at)
SELECT r.project_session_id, t.run_id, t.task_id,
       'task-owner:' || t.run_id || ':' || t.task_id || ':' || t.owner_lease_generation,
       t.owner_agent_id, t.owner_lease_generation, 'frozen', 0
  FROM tasks t JOIN runs r ON r.run_id = t.run_id
 WHERE t.owner_agent_id IS NOT NULL AND t.owner_lease_generation >= 1;

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
  updated_at INTEGER NOT NULL,
  UNIQUE(project_id, dedupe_key),
  FOREIGN KEY(project_session_id, coordination_run_id) REFERENCES runs(project_session_id, run_id),
  CHECK ((state = 'draft' AND project_session_id IS NULL AND coordination_run_id IS NULL) OR
         (state <> 'draft' AND project_session_id IS NOT NULL AND coordination_run_id IS NOT NULL))
);

CREATE TABLE intake_revisions (
  intake_id TEXT NOT NULL REFERENCES intakes(intake_id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  state TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  actor_ref TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(intake_id, revision)
);

CREATE TABLE intake_gate_bindings (
  intake_id TEXT NOT NULL,
  intake_revision INTEGER NOT NULL,
  gate_id TEXT NOT NULL,
  gate_revision INTEGER NOT NULL CHECK (gate_revision >= 1),
  PRIMARY KEY(intake_id, intake_revision, gate_id),
  FOREIGN KEY(intake_id, intake_revision) REFERENCES intake_revisions(intake_id, revision)
);

CREATE TABLE intake_artifact_bindings (
  intake_id TEXT NOT NULL,
  intake_revision INTEGER NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY(intake_id, intake_revision, relative_path, sha256),
  FOREIGN KEY(intake_id, intake_revision) REFERENCES intake_revisions(intake_id, revision)
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

CREATE TABLE operation_admissions (
  operation_id TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  operation_kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('prepared','authorised','executing','terminal','cancelled')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  payload_digest TEXT NOT NULL,
  FOREIGN KEY(project_session_id, coordination_run_id) REFERENCES runs(project_session_id, run_id)
);

CREATE TABLE scoped_gate_operations (
  gate_id TEXT NOT NULL REFERENCES scoped_gates(gate_id),
  operation_id TEXT NOT NULL,
  PRIMARY KEY(gate_id, operation_id)
);

CREATE TABLE scoped_gate_barriers (
  gate_id TEXT NOT NULL REFERENCES scoped_gates(gate_id),
  barrier_id TEXT NOT NULL,
  PRIMARY KEY(gate_id, barrier_id)
);

CREATE TABLE dependency_mutation_guards (
  run_id TEXT PRIMARY KEY REFERENCES runs(run_id),
  project_session_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL CHECK (target_revision >= 1),
  expected_edge_count INTEGER NOT NULL CHECK (expected_edge_count >= 0),
  expected_binding_count INTEGER NOT NULL CHECK (expected_binding_count >= 0)
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

CREATE TABLE task_request_recipients (
  request_id TEXT NOT NULL REFERENCES task_requests(request_id),
  delivery_id TEXT NOT NULL REFERENCES deliveries(delivery_id),
  PRIMARY KEY(request_id, delivery_id)
);

CREATE TABLE task_request_barriers (
  request_id TEXT PRIMARY KEY REFERENCES task_requests(request_id),
  barrier_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('blocked','released','abandoned'))
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

CREATE TABLE notification_attempts (
  notification_id TEXT NOT NULL REFERENCES notification_deliveries(notification_id),
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  state TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(notification_id, attempt)
);

CREATE TABLE integration_availability (
  integration_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('available','unavailable','stale')),
  discovered_contract_json TEXT NOT NULL,
  checked_at INTEGER NOT NULL
);

CREATE TABLE daemon_global_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  revision INTEGER NOT NULL CHECK (revision >= 1)
);
INSERT INTO daemon_global_state(singleton, revision) VALUES (1, 1);

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

CREATE TABLE bootstrap_audit_receipts (
  action_id TEXT PRIMARY KEY,
  election_generation INTEGER NOT NULL UNIQUE CHECK (election_generation >= 1),
  attempt_digest TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('succeeded','failed','expired','ambiguous')),
  receipt_json TEXT NOT NULL,
  imported_instance_generation INTEGER,
  created_at INTEGER NOT NULL
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

INSERT INTO resource_scopes(scope_id, project_id, project_session_id, coordination_run_id, parent_scope_id, scope_kind, owner_ref, state, revision)
SELECT 'rsp_' || substr(project_id, 5), project_id, NULL, NULL, NULL, 'project', project_id,
       CASE WHEN EXISTS (SELECT 1 FROM migration_0004_project_dimensions d WHERE d.project_id=i.project_id AND d.usage_unknown=1)
            THEN 'usage-unknown' ELSE 'active' END, 1
  FROM migration_0004_legacy_import i GROUP BY project_id;

INSERT INTO resource_dimensions(scope_id, unit_key, limit_value, used, reserved, usage_unknown)
SELECT 'rsp_' || substr(project_id, 5), unit_key, limit_value, used, reserved, usage_unknown
  FROM migration_0004_project_dimensions;

INSERT INTO resource_scopes(scope_id, project_id, project_session_id, coordination_run_id, parent_scope_id, scope_kind, owner_ref, state, revision)
SELECT session_scope_id, project_id, project_session_id, NULL, 'rsp_' || substr(project_id, 5),
       'project-session', project_session_id,
       CASE WHEN EXISTS (SELECT 1 FROM migration_0004_scope_dimensions d WHERE d.scope_id=i.session_scope_id AND d.usage_unknown=1)
            THEN 'usage-unknown' ELSE 'active' END, 1
  FROM migration_0004_legacy_import i;

INSERT INTO resource_scopes(scope_id, project_id, project_session_id, coordination_run_id, parent_scope_id, scope_kind, owner_ref, state, revision)
SELECT run_scope_id, project_id, project_session_id, run_id, session_scope_id,
       'coordination-run', run_id,
       CASE WHEN EXISTS (SELECT 1 FROM migration_0004_scope_dimensions d WHERE d.scope_id=i.run_scope_id AND d.usage_unknown=1)
            THEN 'usage-unknown' ELSE 'active' END, 1
  FROM migration_0004_legacy_import i;

INSERT INTO resource_dimensions(scope_id, unit_key, limit_value, used, reserved, usage_unknown)
SELECT scope_id, unit_key, limit_value, used, reserved, usage_unknown
  FROM migration_0004_scope_dimensions;

INSERT INTO scoped_gates(
  gate_id, project_session_id, coordination_run_id, dedupe_key, scope_kind, scope_task_id,
  dependency_revision, blocked_operation_ids_json, enforcement_points_json, question, reason,
  options_json, recommendation, consequences_json, evidence_refs_json, created_by_ref,
  expected_approver_ref, status, human_required, legacy_status, legacy_evidence, revision,
  created_at, updated_at
)
SELECT g.gate_id, i.project_session_id, g.run_id, 'legacy:' || g.legacy_gate_id,
       'task', g.task_id, 1, '[]', '["task-readiness","scoped-barrier"]',
       'Resolve migrated gate ' || g.legacy_gate_id,
       'Imported legacy identifier-only gate; authenticated approval required.',
       '["approve","reject","defer"]', '', '[]', '[]', 'legacy-migration',
       'authenticated-operator', 'pending', 1, g.legacy_status, g.legacy_evidence, 1, 0, 0
  FROM migration_0004_legacy_gates g
  JOIN migration_0004_legacy_import i ON i.run_id = g.run_id;

INSERT INTO scoped_gate_tasks(gate_id, project_session_id, run_id, task_id, binding_kind, bound_dependency_revision)
SELECT g.gate_id, i.project_session_id, g.run_id, g.task_id, 'direct', 1
  FROM migration_0004_legacy_gates g
  JOIN migration_0004_legacy_import i ON i.run_id = g.run_id;

ALTER TABLE task_human_gates ADD COLUMN migrated_gate_id TEXT REFERENCES scoped_gates(gate_id);
UPDATE task_human_gates
   SET migrated_gate_id = (
     SELECT gate_id FROM migration_0004_legacy_gates g
      WHERE g.run_id=task_human_gates.run_id AND g.task_id=task_human_gates.task_id
        AND g.legacy_gate_id=task_human_gates.gate_id
   );

INSERT INTO project_session_memberships(project_session_id, coordination_run_id, member_kind, member_id, required, state, revision, created_at, updated_at)
SELECT i.project_session_id, i.run_id, 'coordination-run', i.run_id, 1,
       CASE WHEN i.import_state='closed' THEN 'reconciled' ELSE 'active' END, 1, 0, 0
  FROM migration_0004_legacy_import i;

INSERT INTO project_session_memberships(project_session_id, coordination_run_id, member_kind, member_id, required, state, revision, created_at, updated_at)
SELECT r.project_session_id, t.run_id, 'task', t.task_id, 1,
       CASE WHEN t.state IN ('complete','cancelled','degraded') THEN 'reconciled' ELSE 'active' END, 1, 0, 0
  FROM tasks t JOIN runs r ON r.run_id=t.run_id;

INSERT INTO project_session_memberships(project_session_id, coordination_run_id, member_kind, member_id, required, state, revision, created_at, updated_at)
SELECT r.project_session_id, l.run_id, 'lease', l.lease_id, 1,
       CASE WHEN l.status='released' THEN 'reconciled' ELSE 'active' END, 1, 0, 0
  FROM leases l JOIN runs r ON r.run_id=l.run_id;

INSERT INTO project_session_memberships(project_session_id, coordination_run_id, member_kind, member_id, required, state, revision, created_at, updated_at)
SELECT r.project_session_id, p.run_id, 'provider-action', p.action_id, 1,
       CASE WHEN p.status='terminal' THEN 'reconciled' ELSE 'active' END, 1, 0, 0
  FROM provider_actions p JOIN runs r ON r.run_id=p.run_id;

INSERT INTO project_session_memberships(project_session_id, coordination_run_id, member_kind, member_id, required, state, revision, created_at, updated_at)
SELECT r.project_session_id, m.run_id, 'required-message', m.message_id, 1,
       CASE WHEN NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.message_id=m.message_id AND d.state NOT IN ('acknowledged','abandoned','expired'))
            THEN 'reconciled' ELSE 'active' END, 1, 0, 0
  FROM messages m JOIN runs r ON r.run_id=m.run_id WHERE m.requires_ack=1;

INSERT INTO project_session_memberships(project_session_id, coordination_run_id, member_kind, member_id, required, state, revision, created_at, updated_at)
SELECT r.project_session_id, a.run_id, 'artifact-obligation', a.artifact_id, 1, 'reconciled', 1, 0, 0
  FROM artifacts a JOIN runs r ON r.run_id=a.run_id;

INSERT INTO project_session_memberships(project_session_id, coordination_run_id, member_kind, member_id, required, state, revision, created_at, updated_at)
SELECT s.project_session_id, s.coordination_run_id, 'gate', s.gate_id, 1, 'active', 1, 0, 0
  FROM scoped_gates s;

INSERT INTO project_session_memberships(project_session_id, coordination_run_id, member_kind, member_id, required, state, revision, created_at, updated_at)
SELECT r.project_session_id, b.run_id, 'scoped-barrier', b.run_id || ':' || b.scope || ':' || b.stage_id,
       1, 'reconciled', 1, 0, 0
  FROM barriers b JOIN runs r ON r.run_id=b.run_id;

CREATE UNIQUE INDEX one_coordinated_nonterminal_run
  ON runs(project_session_id, topology_slot)
  WHERE topology_slot=1 AND lifecycle_state NOT IN ('closed','cancelled','launch_failed');
CREATE INDEX membership_active ON project_session_memberships(project_session_id, coordination_run_id, member_kind, state);
CREATE INDEX session_liveness ON project_sessions(state, project_session_id);
CREATE INDEX gate_status_scope ON scoped_gates(project_session_id, coordination_run_id, status, scope_kind);
CREATE INDEX gate_task_lookup ON scoped_gate_tasks(run_id, task_id, gate_id);
CREATE INDEX gate_operation_lookup ON scoped_gate_operations(operation_id, gate_id);
CREATE INDEX gate_barrier_lookup ON scoped_gate_barriers(barrier_id, gate_id);
CREATE INDEX intake_revision_latest ON intake_revisions(intake_id, revision DESC);
CREATE INDEX result_due ON result_deliveries(state, response_deadline);
CREATE INDEX result_claim ON result_deliveries(state, claim_deadline, claim_generation);
CREATE INDEX resource_scope_parent ON resource_scopes(parent_scope_id, state);
CREATE INDEX resource_reservation_active ON resource_reservation_dimensions(scope_id, reservation_id);
CREATE INDEX writer_prefix_active ON writer_prefixes(canonical_prefix, writer_admission_id);
CREATE INDEX notification_claim ON notification_deliveries(state, claim_deadline);
CREATE INDEX attachment_liveness ON operator_client_attachments(state, expires_at, daemon_instance_generation, project_authority_generation);
CREATE INDEX projection_cursor ON operator_projection_cursors(project_session_id, schema_version, cursor);

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
CREATE TRIGGER ps_generation_step BEFORE UPDATE OF generation ON project_sessions
WHEN NEW.generation NOT IN (OLD.generation, OLD.generation + 1)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_SESSION_GENERATION'); END;
CREATE TRIGGER ps_membership_frozen BEFORE INSERT ON project_session_memberships
WHEN (SELECT state FROM project_sessions WHERE project_session_id=NEW.project_session_id)
     IN ('quiescing','awaiting_acceptance','closed','cancelled')
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_MEMBERSHIP_FROZEN'); END;
CREATE TRIGGER ps_awaiting_acceptance BEFORE UPDATE OF state ON project_sessions
WHEN NEW.state='awaiting_acceptance' AND (
  EXISTS (SELECT 1 FROM project_session_memberships m WHERE m.project_session_id=NEW.project_session_id AND m.required=1 AND m.state='active') OR
  EXISTS (SELECT 1 FROM runs r WHERE r.project_session_id=NEW.project_session_id AND r.lifecycle_state NOT IN ('awaiting_acceptance','closed','cancelled','launch_failed')) OR
  EXISTS (SELECT 1 FROM result_deliveries d WHERE d.project_session_id=NEW.project_session_id AND d.required=1 AND d.state NOT IN ('consumed','abandoned'))
)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_SESSION_CLOSURE_BLOCKED'); END;

CREATE TRIGGER run_session_insert BEFORE INSERT ON runs
WHEN NEW.project_session_id IS NULL OR NEW.lifecycle_state IS NULL OR NEW.revision IS NULL OR
     NEW.chair_generation IS NULL OR NEW.chair_lease_id IS NULL OR NEW.authority_ref IS NULL OR
     NEW.budget_ref IS NULL OR NEW.dependency_revision IS NULL
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_RUN_SESSION_REQUIRED'); END;
CREATE TRIGGER run_revision_step BEFORE UPDATE OF lifecycle_state,revision,chair_agent_id,chair_generation,chair_lease_id,authority_ref,budget_ref ON runs
WHEN NEW.revision <> OLD.revision + 1
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_RUN_REVISION'); END;
CREATE TRIGGER run_chair_generation_step BEFORE UPDATE OF chair_generation ON runs
WHEN NEW.chair_generation NOT IN (OLD.chair_generation, OLD.chair_generation + 1)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_RUN_CHAIR_GENERATION'); END;
CREATE TRIGGER run_topology_insert BEFORE INSERT ON runs BEGIN
  SELECT CASE WHEN
    ((SELECT mode FROM project_sessions WHERE project_session_id=NEW.project_session_id)='coordinated' AND NEW.topology_slot<>1) OR
    ((SELECT mode FROM project_sessions WHERE project_session_id=NEW.project_session_id)='independent' AND NEW.topology_slot IS NOT NULL)
    THEN RAISE(ABORT, 'AFAB_0004_RUN_TOPOLOGY') END;
END;

CREATE TRIGGER membership_same_run_insert BEFORE INSERT ON project_session_memberships
WHEN NOT EXISTS (SELECT 1 FROM runs r WHERE r.project_session_id=NEW.project_session_id AND r.run_id=NEW.coordination_run_id)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_MEMBERSHIP_RUN'); END;

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

CREATE TRIGGER gate_human_resolution BEFORE UPDATE OF status ON scoped_gates
WHEN NEW.status='approved' AND OLD.human_required=1 AND NEW.resolved_by_operator_id IS NULL
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_GATE_HUMAN_REQUIRED'); END;
CREATE TRIGGER gate_release_binding BEFORE INSERT ON scoped_gates
WHEN NEW.scope_kind='release' AND NEW.release_binding_json IS NULL
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_GATE_RELEASE_BINDING'); END;

CREATE TRIGGER dependency_guard_insert BEFORE INSERT ON task_dependencies
WHEN NOT EXISTS (SELECT 1 FROM dependency_mutation_guards g WHERE g.run_id=NEW.run_id AND g.project_session_id=NEW.project_session_id AND g.target_revision=NEW.dependency_revision)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_DEPENDENCY_MUTATOR'); END;
CREATE TRIGGER dependency_guard_update BEFORE UPDATE ON task_dependencies
WHEN NOT EXISTS (SELECT 1 FROM dependency_mutation_guards g WHERE g.run_id=NEW.run_id AND g.project_session_id=NEW.project_session_id AND g.target_revision=NEW.dependency_revision)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_DEPENDENCY_MUTATOR'); END;
CREATE TRIGGER dependency_guard_delete BEFORE DELETE ON task_dependencies
WHEN NOT EXISTS (SELECT 1 FROM dependency_mutation_guards g WHERE g.run_id=OLD.run_id AND g.project_session_id=OLD.project_session_id)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_DEPENDENCY_MUTATOR'); END;
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

CREATE TRIGGER task_gate_readiness BEFORE UPDATE OF state ON tasks
WHEN NEW.state='active' AND EXISTS (
  SELECT 1 FROM scoped_gate_tasks gt JOIN scoped_gates g ON g.gate_id=gt.gate_id
   WHERE gt.run_id=NEW.run_id AND gt.task_id=NEW.task_id AND g.status IN ('pending','deferred')
     AND EXISTS (SELECT 1 FROM json_each(g.enforcement_points_json) WHERE value='task-readiness')
)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_GATE_BLOCKED'); END;
CREATE TRIGGER operation_gate_block BEFORE UPDATE OF state ON operation_admissions
WHEN NEW.state IN ('authorised','executing') AND EXISTS (
  SELECT 1 FROM scoped_gates g JOIN scoped_gate_operations go ON go.gate_id=g.gate_id
   WHERE go.operation_id=NEW.operation_kind AND g.project_session_id=NEW.project_session_id
     AND g.coordination_run_id=NEW.coordination_run_id AND g.status IN ('pending','deferred')
)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_GATE_BLOCKED'); END;
CREATE TRIGGER barrier_gate_block BEFORE INSERT ON barriers
WHEN EXISTS (
  SELECT 1 FROM scoped_gates g JOIN scoped_gate_barriers gb ON gb.gate_id=g.gate_id
   WHERE gb.barrier_id=NEW.run_id || ':' || NEW.scope || ':' || NEW.stage_id
     AND g.status IN ('pending','deferred')
)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_GATE_BLOCKED'); END;

CREATE TRIGGER resource_dimension_update BEFORE UPDATE OF used,reserved,usage_unknown ON resource_dimensions
WHEN NEW.used<0 OR NEW.reserved<0 OR NEW.used+NEW.reserved>NEW.limit_value OR NEW.usage_unknown NOT IN (0,1)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_RESOURCE_BOUNDS'); END;
CREATE TRIGGER writer_prefix_exact_overlap BEFORE INSERT ON writer_prefixes
WHEN EXISTS (
  SELECT 1 FROM writer_prefixes p JOIN writer_admissions w ON w.writer_admission_id=p.writer_admission_id
   WHERE w.state='active' AND p.canonical_prefix=NEW.canonical_prefix
)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_WRITER_OVERLAP'); END;

CREATE TRIGGER result_delivery_transition BEFORE UPDATE OF state ON result_deliveries
WHEN NOT (
  (OLD.state='pending' AND NEW.state IN ('claimed','overdue','abandoned')) OR
  (OLD.state='claimed' AND NEW.state IN ('provider-accepted','pending','overdue','abandoned')) OR
  (OLD.state='provider-accepted' AND NEW.state IN ('consumed','overdue','abandoned')) OR
  (OLD.state='overdue' AND NEW.state IN ('pending','abandoned')) OR
  (OLD.state=NEW.state)
)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_RESULT_TRANSITION'); END;
CREATE TRIGGER result_claim_generation BEFORE UPDATE OF claim_generation ON result_deliveries
WHEN NEW.claim_generation NOT IN (OLD.claim_generation, OLD.claim_generation+1)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_RESULT_CLAIM_GENERATION'); END;

CREATE TRIGGER attention_revision_step BEFORE UPDATE OF revision ON attention_items
WHEN NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_ATTENTION_REVISION'); END;
CREATE TRIGGER notification_cannot_mutate_attention BEFORE UPDATE OF state ON attention_items
WHEN NEW.state<>OLD.state AND EXISTS (
  SELECT 1 FROM notification_deliveries d WHERE d.item_id=OLD.item_id AND d.state IN ('pending','claimed')
)
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_NOTIFICATION_NOT_AUTHORITY'); END;

CREATE TRIGGER legacy_task_gates_insert BEFORE INSERT ON task_human_gates
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_LEGACY_GATES_READ_ONLY'); END;
CREATE TRIGGER legacy_task_gates_update BEFORE UPDATE ON task_human_gates
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_LEGACY_GATES_READ_ONLY'); END;
CREATE TRIGGER legacy_task_gates_delete BEFORE DELETE ON task_human_gates
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_LEGACY_GATES_READ_ONLY'); END;

CREATE TRIGGER global_revision_project_sessions_insert AFTER INSERT ON project_sessions BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER global_revision_project_sessions_update AFTER UPDATE ON project_sessions BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER global_revision_runs_insert AFTER INSERT ON runs BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER global_revision_runs_update AFTER UPDATE ON runs BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER global_revision_tasks_insert AFTER INSERT ON tasks BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER global_revision_tasks_update AFTER UPDATE ON tasks BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER global_revision_leases_insert AFTER INSERT ON leases BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER global_revision_leases_update AFTER UPDATE ON leases BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER global_revision_provider_actions_insert AFTER INSERT ON provider_actions BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER global_revision_provider_actions_update AFTER UPDATE ON provider_actions BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER global_revision_operator_attachments_insert AFTER INSERT ON operator_client_attachments BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER global_revision_operator_attachments_update AFTER UPDATE ON operator_client_attachments BEGIN
  UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER global_revision_result_deliveries_insert AFTER INSERT ON result_deliveries
WHEN NEW.required=1 BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_result_deliveries_update AFTER UPDATE ON result_deliveries
WHEN NEW.required=1 BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

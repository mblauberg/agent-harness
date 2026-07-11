-- Spec 01 v0.10 / Spec 04 v1.6 typed operator control and lifecycle custody.

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

CREATE UNIQUE INDEX one_active_operator_task_fence
  ON operator_control_fences(coordination_run_id, task_id)
  WHERE state='paused';
CREATE INDEX operator_control_fences_by_session
  ON operator_control_fences(project_session_id, state, coordination_run_id, task_id);

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

CREATE INDEX operator_lifecycle_receipts_by_authority
  ON operator_lifecycle_receipts(
    operator_id, project_id, authority_session_id, kind, created_at DESC
  );

CREATE TABLE operator_effect_custody (
  custody_id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  principal_generation INTEGER NOT NULL CHECK (principal_generation >= 1),
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  intent_digest TEXT NOT NULL,
  before_state_digest TEXT NOT NULL,
  intent_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'prepared','dispatching','ambiguous','terminal','no-effect','rejected','failed'
  )),
  effect_path TEXT,
  effect_digest TEXT,
  outcome_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (operator_id, project_id, project_session_id, command_id),
  FOREIGN KEY (project_session_id, project_id)
    REFERENCES project_sessions(project_session_id, project_id),
  CHECK ((effect_path IS NULL)=(effect_digest IS NULL)),
  CHECK (effect_digest IS NULL OR (length(effect_digest)=71 AND substr(effect_digest,1,7)='sha256:')),
  CHECK (length(intent_digest)=71 AND substr(intent_digest,1,7)='sha256:'),
  CHECK (length(before_state_digest)=71 AND substr(before_state_digest,1,7)='sha256:')
);

CREATE TABLE operator_daemon_stop_custody (
  daemon_instance_generation INTEGER NOT NULL CHECK (daemon_instance_generation >= 1),
  observed_global_revision INTEGER NOT NULL CHECK (observed_global_revision >= 1),
  custody_id TEXT PRIMARY KEY REFERENCES operator_effect_custody(custody_id),
  operator_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  principal_generation INTEGER NOT NULL CHECK (principal_generation >= 1),
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation='daemon-stop'),
  result_correlation_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('prepared','scheduled','stopped','failed','rejected','no-effect')),
  result_json TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE (operator_id, project_id, project_session_id, command_id),
  FOREIGN KEY (project_session_id, project_id)
    REFERENCES project_sessions(project_session_id, project_id),
  CHECK (length(result_correlation_digest)=71 AND substr(result_correlation_digest,1,7)='sha256:')
);

CREATE UNIQUE INDEX one_live_operator_daemon_stop
  ON operator_daemon_stop_custody(daemon_instance_generation)
  WHERE state IN ('prepared','scheduled','failed');

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

CREATE TRIGGER global_revision_operator_control_fences_insert
AFTER INSERT ON operator_control_fences
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_operator_control_fences_update
AFTER UPDATE ON operator_control_fences
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

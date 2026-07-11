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
  project_session_id TEXT,
  daemon_instance_generation INTEGER,
  session_revision INTEGER,
  session_generation INTEGER,
  global_state_revision INTEGER NOT NULL CHECK (global_state_revision >= 1),
  command_id TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (relative_path, sha256),
  UNIQUE (kind, command_id),
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

CREATE TRIGGER global_revision_operator_control_fences_insert
AFTER INSERT ON operator_control_fences
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_operator_control_fences_update
AFTER UPDATE ON operator_control_fences
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

import Database from "better-sqlite3";

export function createLivenessDatabase(): Database.Database {
  const database = new Database(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects(
      project_id TEXT PRIMARY KEY,
      authority_generation INTEGER NOT NULL
    );
    CREATE TABLE project_sessions(
      project_session_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(project_id),
      state TEXT NOT NULL,
      generation INTEGER NOT NULL
    );
    CREATE TABLE runs(
      run_id TEXT PRIMARY KEY,
      project_session_id TEXT NOT NULL REFERENCES project_sessions(project_session_id),
      lifecycle_state TEXT NOT NULL
    );
    CREATE TABLE leases(
      lease_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(run_id),
      status TEXT NOT NULL,
      generation INTEGER NOT NULL
    );
    CREATE TABLE provider_actions(
      run_id TEXT NOT NULL REFERENCES runs(run_id),
      action_id TEXT NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY(run_id, action_id)
    );
    CREATE TABLE operator_client_attachments(
      attachment_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(project_id),
      project_authority_generation INTEGER NOT NULL,
      project_session_id TEXT REFERENCES project_sessions(project_session_id),
      session_generation INTEGER,
      daemon_instance_generation INTEGER NOT NULL,
      lease_generation INTEGER NOT NULL DEFAULT 1,
      state TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE result_deliveries(
      result_delivery_id TEXT PRIMARY KEY,
      project_session_id TEXT NOT NULL REFERENCES project_sessions(project_session_id),
      state TEXT NOT NULL,
      required INTEGER NOT NULL
    );
    CREATE TABLE notification_deliveries(
      notification_id TEXT PRIMARY KEY,
      state TEXT NOT NULL
    );
    CREATE TABLE daemon_global_state(
      singleton INTEGER PRIMARY KEY,
      revision INTEGER NOT NULL
    );
    CREATE TABLE daemon_runtime_epochs(
      instance_generation INTEGER PRIMARY KEY,
      instance_id TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL,
      observed_global_revision INTEGER,
      started_at INTEGER NOT NULL,
      heartbeat_at INTEGER NOT NULL,
      stopped_at INTEGER
    );
    INSERT INTO daemon_global_state(singleton, revision) VALUES(1, 1);
    INSERT INTO daemon_runtime_epochs(instance_generation, instance_id, state, started_at, heartbeat_at)
      VALUES(7, 'daemon_07', 'running', 1, 1);
  `);
  return database;
}

export function seedProject(database: Database.Database, input: {
  projectId?: string;
  projectSessionId?: string;
  sessionState?: string;
  sessionGeneration?: number;
} = {}): void {
  const projectId = input.projectId ?? "project_01";
  const projectSessionId = input.projectSessionId ?? "session_01";
  database.prepare("INSERT INTO projects(project_id, authority_generation) VALUES(?, 3)").run(projectId);
  database.prepare("INSERT INTO project_sessions(project_session_id, project_id, state, generation) VALUES(?, ?, ?, ?)")
    .run(projectSessionId, projectId, input.sessionState ?? "closed", input.sessionGeneration ?? 5);
}

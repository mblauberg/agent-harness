PRAGMA user_version = 1;

CREATE TABLE authority_metadata(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  authority_id TEXT NOT NULL CHECK(length(authority_id)>0)
) STRICT;

CREATE TABLE admitted_scopes(
  project_session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  scope_attestation TEXT NOT NULL,
  PRIMARY KEY(project_session_id,run_id)
) STRICT;

CREATE TABLE receipts(
  project_session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  authority_sequence INTEGER NOT NULL CHECK(authority_sequence>0),
  kind TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  owner_ref_digest TEXT NOT NULL,
  owner_revision INTEGER NOT NULL CHECK(owner_revision>0),
  intent_digest TEXT NOT NULL,
  subject_json TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  receipt_digest TEXT NOT NULL,
  PRIMARY KEY(project_session_id,run_id,authority_sequence),
  UNIQUE(kind,project_session_id,run_id,agent_id,owner_ref_digest,owner_revision),
  FOREIGN KEY(project_session_id,run_id) REFERENCES admitted_scopes(project_session_id,run_id)
) STRICT;

CREATE TABLE scope_snapshots(
  checkpoint_digest TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  max_authority_sequence INTEGER NOT NULL CHECK(max_authority_sequence>=0),
  checkpoint_json TEXT NOT NULL,
  FOREIGN KEY(project_session_id,run_id) REFERENCES admitted_scopes(project_session_id,run_id)
) STRICT;

CREATE TABLE namespace_snapshots(
  checkpoint_digest TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  checkpoint_json TEXT NOT NULL
) STRICT;

CREATE TABLE namespace_snapshot_members(
  checkpoint_digest TEXT NOT NULL,
  member_order INTEGER NOT NULL CHECK(member_order>=0),
  scope_checkpoint_digest TEXT NOT NULL,
  PRIMARY KEY(checkpoint_digest,member_order),
  FOREIGN KEY(checkpoint_digest) REFERENCES namespace_snapshots(checkpoint_digest),
  FOREIGN KEY(scope_checkpoint_digest) REFERENCES scope_snapshots(checkpoint_digest)
) STRICT;

PRAGMA foreign_keys = OFF;

-- Spec 01 v0.14 / Spec 04 v1.10 typed Git authority and four-owner custody.

ALTER TABLE runs ADD COLUMN authority_revision INTEGER NOT NULL DEFAULT 1 CHECK(authority_revision>=1);
ALTER TABLE runs ADD COLUMN git_allowlist_epoch INTEGER NOT NULL DEFAULT 1 CHECK(git_allowlist_epoch>=1);
ALTER TABLE runs ADD COLUMN git_allowlist_digest TEXT CHECK(
  git_allowlist_digest IS NULL OR
  (length(git_allowlist_digest)=71 AND substr(git_allowlist_digest,1,7)='sha256:')
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

INSERT INTO run_authority_revisions(
  project_session_id,coordination_run_id,authority_revision,authority_ref,
  git_allowlist_epoch,git_allowlist_digest,activated_at_run_revision,created_at
)
SELECT project_session_id,run_id,1,authority_ref,1,NULL,revision,0 FROM runs;

CREATE TRIGGER run_authority_revision_immutable
BEFORE UPDATE ON run_authority_revisions
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_authority_history_immutable'); END;
CREATE TRIGGER run_authority_revision_delete_forbidden
BEFORE DELETE ON run_authority_revisions
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_authority_history_immutable'); END;

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
CREATE UNIQUE INDEX one_active_git_execution_profile
  ON git_execution_profiles(profile_id) WHERE state='active';
CREATE TRIGGER git_execution_profile_identity_immutable
BEFORE UPDATE OF profile_id,revision,profile_digest,git_binary_path,git_binary_version,
  git_binary_digest,object_format,merge_backend_id,rebase_backend_id,environment_digest,
  helper_registry_digest,inspector_digest,created_at ON git_execution_profiles
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_profile_immutable'); END;
CREATE TRIGGER git_execution_profile_state_monotonic
BEFORE UPDATE OF state ON git_execution_profiles
WHEN NOT (OLD.state='active' AND NEW.state='revoked')
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_profile_state'); END;
CREATE TRIGGER git_execution_profile_delete_forbidden
BEFORE DELETE ON git_execution_profiles
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_profile_immutable'); END;
CREATE TRIGGER global_revision_git_execution_profile_insert AFTER INSERT ON git_execution_profiles
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_git_execution_profile_update AFTER UPDATE ON git_execution_profiles
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

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
CREATE UNIQUE INDEX one_active_git_remote_name
  ON git_remote_registrations(project_id,remote_name) WHERE state='active';
CREATE TRIGGER git_remote_registration_identity_immutable
BEFORE UPDATE OF registration_id,revision,generation,project_id,remote_name,transport_kind,
  target_identity,target_digest,adapter_id,adapter_contract_digest,credential_selector_digest,created_at
ON git_remote_registrations
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_remote_immutable'); END;
CREATE TRIGGER git_remote_registration_state_monotonic
BEFORE UPDATE OF state ON git_remote_registrations
WHEN NOT (OLD.state='active' AND NEW.state='revoked')
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_remote_state'); END;
CREATE TRIGGER git_remote_registration_delete_forbidden
BEFORE DELETE ON git_remote_registrations
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_remote_immutable'); END;
CREATE TRIGGER global_revision_git_remote_insert AFTER INSERT ON git_remote_registrations
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_git_remote_update AFTER UPDATE ON git_remote_registrations
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

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
CREATE TABLE run_git_allowlist_profiles(
  project_session_id TEXT NOT NULL,coordination_run_id TEXT NOT NULL,authority_revision INTEGER NOT NULL,
  git_allowlist_epoch INTEGER NOT NULL,profile_id TEXT NOT NULL,profile_revision INTEGER NOT NULL,profile_digest TEXT NOT NULL,
  PRIMARY KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch,profile_id,profile_revision),
  FOREIGN KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch)
    REFERENCES run_git_allowlists(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch),
  FOREIGN KEY(profile_id,profile_revision) REFERENCES git_execution_profiles(profile_id,revision)
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
CREATE TABLE run_git_allowlist_refs(
  project_session_id TEXT NOT NULL,coordination_run_id TEXT NOT NULL,authority_revision INTEGER NOT NULL,
  git_allowlist_epoch INTEGER NOT NULL,ref_name TEXT NOT NULL CHECK(substr(ref_name,1,5)='refs/'),
  PRIMARY KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch,ref_name),
  FOREIGN KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch)
    REFERENCES run_git_allowlists(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch)
);
CREATE TABLE run_git_allowlist_paths(
  project_session_id TEXT NOT NULL,coordination_run_id TEXT NOT NULL,authority_revision INTEGER NOT NULL,
  git_allowlist_epoch INTEGER NOT NULL,repository_root TEXT NOT NULL,worktree_path TEXT NOT NULL,canonical_prefix TEXT NOT NULL,
  PRIMARY KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch,repository_root,worktree_path,canonical_prefix),
  FOREIGN KEY(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch)
    REFERENCES run_git_allowlists(project_session_id,coordination_run_id,authority_revision,git_allowlist_epoch)
);
CREATE TRIGGER run_git_allowlist_identity_immutable
BEFORE UPDATE ON run_git_allowlists
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_immutable'); END;
CREATE TRIGGER run_git_allowlist_delete_forbidden
BEFORE DELETE ON run_git_allowlists
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_immutable'); END;
CREATE TRIGGER global_revision_run_git_allowlist_insert AFTER INSERT ON run_git_allowlists
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER run_git_allowlist_variant_immutable
BEFORE UPDATE ON run_git_allowlist_variants
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;
CREATE TRIGGER run_git_allowlist_variant_delete_forbidden
BEFORE DELETE ON run_git_allowlist_variants
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;
CREATE TRIGGER run_git_allowlist_profile_immutable
BEFORE UPDATE ON run_git_allowlist_profiles
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;
CREATE TRIGGER run_git_allowlist_profile_delete_forbidden
BEFORE DELETE ON run_git_allowlist_profiles
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;
CREATE TRIGGER run_git_allowlist_remote_immutable
BEFORE UPDATE ON run_git_allowlist_remotes
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;
CREATE TRIGGER run_git_allowlist_remote_delete_forbidden
BEFORE DELETE ON run_git_allowlist_remotes
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;
CREATE TRIGGER run_git_allowlist_ref_immutable
BEFORE UPDATE ON run_git_allowlist_refs
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;
CREATE TRIGGER run_git_allowlist_ref_delete_forbidden
BEFORE DELETE ON run_git_allowlist_refs
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;
CREATE TRIGGER run_git_allowlist_path_immutable
BEFORE UPDATE ON run_git_allowlist_paths
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;
CREATE TRIGGER run_git_allowlist_path_delete_forbidden
BEFORE DELETE ON run_git_allowlist_paths
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_git_allowlist_child_immutable'); END;

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
CREATE UNIQUE INDEX one_active_git_grant_revision
  ON operator_git_grants(grant_id) WHERE state='active';
CREATE INDEX operator_git_grants_point_of_use
  ON operator_git_grants(project_session_id,coordination_run_id,state,expires_at,
    session_generation,authority_revision,git_allowlist_epoch,execution_profile_id,execution_profile_revision);

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
CREATE TABLE operator_git_grant_refs(
  grant_id TEXT NOT NULL,
  grant_revision INTEGER NOT NULL,
  ref_name TEXT NOT NULL CHECK(substr(ref_name,1,5)='refs/'),
  PRIMARY KEY(grant_id,grant_revision,ref_name),
  FOREIGN KEY(grant_id,grant_revision) REFERENCES operator_git_grants(grant_id,revision)
);
CREATE TABLE operator_git_grant_paths(
  grant_id TEXT NOT NULL,
  grant_revision INTEGER NOT NULL,
  canonical_prefix TEXT NOT NULL,
  PRIMARY KEY(grant_id,grant_revision,canonical_prefix),
  FOREIGN KEY(grant_id,grant_revision) REFERENCES operator_git_grants(grant_id,revision)
);

DROP TRIGGER operation_gate_block;
ALTER TABLE operation_admissions RENAME TO operation_admissions_0010;
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
INSERT INTO operation_admissions SELECT * FROM operation_admissions_0010;
DROP TABLE operation_admissions_0010;
CREATE TRIGGER operation_gate_block BEFORE UPDATE OF state ON operation_admissions
WHEN NEW.state IN ('authorised','executing') AND EXISTS (
  SELECT 1 FROM scoped_gates g JOIN scoped_gate_operations go ON go.gate_id=g.gate_id
   WHERE go.operation_id=NEW.operation_id AND g.project_session_id=NEW.project_session_id
     AND g.coordination_run_id=NEW.coordination_run_id AND g.status IN ('pending','deferred')
)
BEGIN SELECT RAISE(ABORT,'AFAB_0012_GATE_BLOCKED'); END;

DROP TRIGGER IF EXISTS operator_external_effect_binding_insert_guard;
DROP TRIGGER IF EXISTS operator_external_effect_binding_identity_immutable;
DROP TRIGGER IF EXISTS operator_external_effect_binding_lookup_cas;
DROP TRIGGER IF EXISTS operator_external_effect_binding_delete_forbidden;
DROP TRIGGER IF EXISTS operator_external_effect_requires_typed_binding;
DROP TRIGGER IF EXISTS global_revision_operator_external_effect_binding_insert;
DROP TRIGGER IF EXISTS global_revision_operator_external_effect_binding_update;

ALTER TABLE operator_daemon_stop_custody RENAME TO operator_daemon_stop_custody_0010;
ALTER TABLE operator_external_effect_bindings RENAME TO operator_external_effect_bindings_0010;
ALTER TABLE operator_effect_custody RENAME TO operator_effect_custody_0010;

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
INSERT INTO operator_effect_custody SELECT * FROM operator_effect_custody_0010;

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
INSERT INTO operator_daemon_stop_custody SELECT * FROM operator_daemon_stop_custody_0010;
DROP TABLE operator_daemon_stop_custody_0010;
DROP INDEX IF EXISTS one_live_operator_daemon_stop;
CREATE UNIQUE INDEX one_live_operator_daemon_stop
  ON operator_daemon_stop_custody(daemon_instance_generation)
  WHERE state IN ('prepared','scheduled','failed');

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
INSERT INTO operator_external_effect_bindings SELECT * FROM operator_external_effect_bindings_0010;
DROP TABLE operator_external_effect_bindings_0010;
DROP TABLE operator_effect_custody_0010;
CREATE INDEX operator_external_effect_bindings_recovery
  ON operator_external_effect_bindings(lookup_generation,custody_id);

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

CREATE TRIGGER operator_external_effect_binding_identity_immutable
BEFORE UPDATE OF custody_id,effect_kind,integration_id,integration_generation,operation_id,
  contract_digest,target_id,target_revision,request_artifact_path,request_artifact_digest,
  idempotency_key,release_gate_id,release_gate_revision,release_binding_digest,created_at
ON operator_external_effect_bindings
BEGIN SELECT RAISE(ABORT,'INVARIANT_external_effect_binding_immutable'); END;
CREATE TRIGGER operator_external_effect_binding_delete_forbidden
BEFORE DELETE ON operator_external_effect_bindings
BEGIN SELECT RAISE(ABORT,'INVARIANT_external_effect_binding_immutable'); END;
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
CREATE TRIGGER global_revision_operator_external_effect_binding_insert
AFTER INSERT ON operator_external_effect_bindings
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_operator_external_effect_binding_update
AFTER UPDATE ON operator_external_effect_bindings
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

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
CREATE UNIQUE INDEX one_active_git_mutation_per_common_dir
  ON git_mutation_reservations(git_common_dir)
  WHERE state IN ('reserved','dispatching','conflict','ambiguous','quarantined');

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
CREATE INDEX operator_git_effect_recovery
  ON operator_git_effect_bindings(state,lookup_generation,custody_id);

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

CREATE TRIGGER git_draft_identity_immutable
BEFORE UPDATE OF draft_id,draft_request_id,request_digest,operator_id,project_id,project_session_id,
  observed_session_revision,session_generation,coordination_run_id,observed_run_revision,
  observed_dependency_revision,authority_ref,authority_revision,git_allowlist_epoch,
  git_allowlist_digest,draft_kind,operation_id,operation_kind,payload_digest,binding_json,
  draft_digest,expires_at,created_at ON git_operation_drafts
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_draft_identity_immutable'); END;
CREATE TRIGGER git_grant_identity_immutable
BEFORE UPDATE OF grant_id,revision,project_id,project_session_id,session_generation,issuing_session_revision,
  coordination_run_id,issuing_run_revision,issuing_dependency_revision,authority_ref,authority_revision,
  git_allowlist_epoch,git_allowlist_digest,repository_root,worktree_path,execution_profile_id,
  execution_profile_revision,execution_profile_digest,allow_worktree_creation,source_kind,source_digest,
  constraints_json,grant_digest,expires_at,created_at ON operator_git_grants
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_grant_identity_immutable'); END;
CREATE TRIGGER git_grant_delete_forbidden BEFORE DELETE ON operator_git_grants
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_grant_delete_forbidden'); END;
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
CREATE TRIGGER git_resolution_immutable
BEFORE UPDATE ON git_custody_resolutions
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_resolution_immutable'); END;
CREATE TRIGGER git_resolution_delete_forbidden
BEFORE DELETE ON git_custody_resolutions
BEGIN SELECT RAISE(ABORT,'INVARIANT_git_resolution_immutable'); END;

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

CREATE TRIGGER global_revision_git_grant_insert AFTER INSERT ON operator_git_grants
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_git_grant_update AFTER UPDATE ON operator_git_grants
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_git_draft_insert AFTER INSERT ON git_operation_drafts
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_git_draft_update AFTER UPDATE ON git_operation_drafts
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_git_binding_insert AFTER INSERT ON operator_git_effect_bindings
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_git_binding_update AFTER UPDATE ON operator_git_effect_bindings
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

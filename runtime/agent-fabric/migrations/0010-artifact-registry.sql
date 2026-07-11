-- Specs 01 v0.15 / 04 v1.11 artifact registry and content-read substrate.

ALTER TABLE runs ADD COLUMN project_run_directory_basis TEXT NOT NULL DEFAULT 'none'
  CHECK (project_run_directory_basis IN ('project-relative','none'));
UPDATE runs
   SET project_run_directory = (
         SELECT staged.project_run_directory FROM migration_0010_run_roots staged
          WHERE staged.run_id=runs.run_id
       ),
       project_run_directory_basis = (
         SELECT staged.project_run_directory_basis FROM migration_0010_run_roots staged
          WHERE staged.run_id=runs.run_id
       );

DROP TRIGGER global_revision_artifacts_insert;
DROP TRIGGER global_revision_artifacts_update;
DROP TRIGGER global_revision_artifacts_delete;

ALTER TABLE artifacts RENAME TO artifacts_legacy_0010;

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

INSERT INTO artifacts(
  artifact_id, project_id, project_session_id, run_id, task_id,
  publisher_kind, publisher_ref, publisher_agent_id, source_kind, evidence_kind,
  relative_path, sha256, registry_state, quarantine_reason, revision, created_at
)
SELECT artifact_id, project_id, project_session_id, run_id, task_id,
       publisher_kind, publisher_ref, publisher_agent_id, source_kind, evidence_kind,
       relative_path, sha256, registry_state, quarantine_reason, revision, created_at
  FROM migration_0010_artifacts;

DROP TABLE artifacts_legacy_0010;

CREATE UNIQUE INDEX artifact_project_identity
  ON artifacts(project_id, source_kind, relative_path, sha256)
  WHERE project_session_id IS NULL AND run_id IS NULL AND registry_state='active';
CREATE UNIQUE INDEX artifact_session_identity
  ON artifacts(project_id, project_session_id, source_kind, relative_path, sha256)
  WHERE project_session_id IS NOT NULL AND run_id IS NULL AND registry_state='active';
CREATE UNIQUE INDEX artifact_run_identity
  ON artifacts(project_id, run_id, source_kind, relative_path, sha256)
  WHERE run_id IS NOT NULL AND registry_state='active';
CREATE INDEX artifacts_projection
  ON artifacts(project_id, project_session_id, registry_state, created_at, artifact_id);

CREATE TABLE artifact_content_cursor_keys (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  key_material TEXT NOT NULL CHECK(length(key_material) >= 43)
);

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

CREATE TRIGGER global_revision_artifacts_insert AFTER INSERT ON artifacts
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_artifacts_update AFTER UPDATE ON artifacts
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_artifacts_delete AFTER DELETE ON artifacts
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

ALTER TABLE intakes ADD COLUMN accepted_scope_artifact_id TEXT REFERENCES artifacts(artifact_id);
ALTER TABLE intakes ADD COLUMN accepted_scope_state TEXT NOT NULL DEFAULT 'not-applicable';
ALTER TABLE intake_revisions ADD COLUMN accepted_scope_artifact_id TEXT REFERENCES artifacts(artifact_id);
ALTER TABLE intake_revisions ADD COLUMN accepted_scope_state TEXT NOT NULL DEFAULT 'not-applicable';

UPDATE intake_revisions
   SET accepted_scope_artifact_id = (
         SELECT scope.accepted_scope_artifact_id FROM migration_0010_intake_scopes scope
          WHERE scope.intake_id=intake_revisions.intake_id
            AND scope.intake_revision=intake_revisions.revision
       ),
       accepted_scope_state = (
         SELECT scope.accepted_scope_state FROM migration_0010_intake_scopes scope
          WHERE scope.intake_id=intake_revisions.intake_id
            AND scope.intake_revision=intake_revisions.revision
       );
UPDATE intakes
   SET accepted_scope_artifact_id = (
         SELECT scope.accepted_scope_artifact_id FROM migration_0010_intake_scopes scope
          WHERE scope.intake_id=intakes.intake_id AND scope.intake_revision=intakes.revision
       ),
       accepted_scope_state = COALESCE((
         SELECT scope.accepted_scope_state FROM migration_0010_intake_scopes scope
          WHERE scope.intake_id=intakes.intake_id AND scope.intake_revision=intakes.revision
       ), 'not-applicable');

ALTER TABLE intake_artifact_bindings RENAME TO intake_artifact_bindings_legacy_0010;
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
INSERT INTO intake_artifact_bindings(intake_id, intake_revision, artifact_id, relative_path, sha256)
SELECT intake_id, intake_revision, artifact_id, relative_path, sha256
  FROM migration_0010_intake_bindings;
DROP TABLE intake_artifact_bindings_legacy_0010;

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

CREATE TRIGGER intake_accepted_scope_insert
BEFORE INSERT ON intakes
WHEN NOT (
  (NEW.state='accepted' AND NEW.accepted_scope_state='bound' AND NEW.accepted_scope_artifact_id IS NOT NULL) OR
  (NEW.state<>'accepted' AND NEW.accepted_scope_state='not-applicable' AND NEW.accepted_scope_artifact_id IS NULL)
)
BEGIN SELECT RAISE(ABORT, 'intake accepted scope state is invalid'); END;
CREATE TRIGGER intake_accepted_scope_update
BEFORE UPDATE ON intakes
WHEN NOT (
  (NEW.state='accepted' AND NEW.accepted_scope_state IN ('bound','recovery-required') AND
    ((NEW.accepted_scope_state='bound' AND NEW.accepted_scope_artifact_id IS NOT NULL) OR
     (NEW.accepted_scope_state='recovery-required' AND NEW.accepted_scope_artifact_id IS NULL))) OR
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

CREATE TRIGGER intake_revision_accepted_scope_insert
BEFORE INSERT ON intake_revisions
WHEN NOT (
  (NEW.state='accepted' AND NEW.accepted_scope_state='bound' AND NEW.accepted_scope_artifact_id IS NOT NULL) OR
  (NEW.state<>'accepted' AND NEW.accepted_scope_state='not-applicable' AND NEW.accepted_scope_artifact_id IS NULL)
)
BEGIN SELECT RAISE(ABORT, 'intake revision accepted scope state is invalid'); END;
CREATE TRIGGER intake_revision_accepted_scope_update
BEFORE UPDATE ON intake_revisions
WHEN NOT (
  (NEW.state='accepted' AND NEW.accepted_scope_state IN ('bound','recovery-required') AND
    ((NEW.accepted_scope_state='bound' AND NEW.accepted_scope_artifact_id IS NOT NULL) OR
     (NEW.accepted_scope_state='recovery-required' AND NEW.accepted_scope_artifact_id IS NULL))) OR
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

INSERT OR IGNORE INTO attention_items(
  item_id, project_session_id, coordination_run_id, kind, severity, revision,
  state, dedupe_key, payload_json, created_at, updated_at
)
SELECT 'artifact-registry:' || intake.intake_id,
       intake.project_session_id, intake.coordination_run_id,
       'artifact-registry-recovery', 'high', 1, 'open',
       'artifact-registry:' || intake.intake_id,
       json_object('intakeId', intake.intake_id, 'reason', 'accepted-scope-recovery-required'),
       intake.updated_at, intake.updated_at
  FROM intakes intake
 WHERE intake.state='accepted' AND intake.accepted_scope_state='recovery-required';

UPDATE projects
   SET revision=revision+1, updated_at=updated_at+1
 WHERE EXISTS (
   SELECT 1 FROM intakes intake
    WHERE intake.project_id=projects.project_id AND intake.state='accepted'
 );

CREATE TRIGGER global_revision_notification_deliveries_insert AFTER INSERT ON notification_deliveries
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_notification_deliveries_update AFTER UPDATE ON notification_deliveries
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER global_revision_notification_deliveries_delete AFTER DELETE ON notification_deliveries
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

-- Postflight assertions abort the migration transaction on any mixed registry.
CREATE TEMP TABLE migration_0010_postflight_guard(value INTEGER NOT NULL CHECK(value=0));
INSERT INTO migration_0010_postflight_guard(value)
SELECT abs((SELECT COUNT(*) FROM artifacts) -
           (SELECT COUNT(*) FROM migration_0010_artifacts));
INSERT INTO migration_0010_postflight_guard(value)
SELECT abs((SELECT COUNT(*) FROM intake_artifact_bindings) -
           (SELECT COUNT(*) FROM migration_0010_intake_bindings));
INSERT INTO migration_0010_postflight_guard(value)
SELECT abs((SELECT COUNT(*) FROM runs) -
           (SELECT COUNT(*) FROM migration_0010_run_roots));
INSERT INTO migration_0010_postflight_guard(value)
SELECT COUNT(*) FROM artifacts artifact
JOIN runs run ON run.run_id=artifact.run_id
WHERE artifact.registry_state='active' AND artifact.source_kind='run-file'
  AND run.project_run_directory='.';
INSERT INTO migration_0010_postflight_guard(value)
SELECT COUNT(*) FROM artifacts artifact
 WHERE artifact.registry_state='active' AND (
   length(artifact.sha256)<>71 OR substr(artifact.sha256,1,7)<>'sha256:' OR
   substr(artifact.sha256,8) GLOB '*[^a-f0-9]*' OR
   artifact.relative_path='' OR artifact.relative_path LIKE '/%' OR
   artifact.relative_path LIKE '%\\%' OR
   artifact.relative_path='.' OR artifact.relative_path='..' OR
   artifact.relative_path LIKE '../%' OR artifact.relative_path LIKE '%/../%' OR
   artifact.relative_path LIKE '%/..' OR artifact.relative_path LIKE './%' OR
   artifact.relative_path LIKE '%/./%' OR artifact.relative_path LIKE '%/.'
 );
INSERT INTO migration_0010_postflight_guard(value)
SELECT COUNT(*) FROM artifacts artifact
 WHERE artifact.registry_state='active' AND (
   (artifact.source_kind='git-private-diff' AND NOT (
     artifact.run_id IS NULL AND artifact.task_id IS NULL AND
     artifact.publisher_kind='fabric' AND artifact.publisher_ref='fabric-git-private-diff' AND
     artifact.publisher_agent_id IS NULL AND artifact.evidence_kind='diff' AND
     artifact.relative_path='private/git-diffs/' || substr(artifact.sha256,8) || '.patch'
   )) OR
   (artifact.source_kind<>'git-private-diff' AND artifact.relative_path GLOB 'private/git-diffs/*')
 );
INSERT INTO migration_0010_postflight_guard(value)
SELECT COUNT(*)
  FROM intakes intake
  LEFT JOIN artifacts artifact ON artifact.artifact_id=intake.accepted_scope_artifact_id
 WHERE intake.state='accepted' AND intake.accepted_scope_state='bound' AND (
   artifact.artifact_id IS NULL OR artifact.registry_state<>'active' OR
   artifact.project_id<>intake.project_id OR
   (artifact.project_session_id IS NOT NULL AND artifact.project_session_id<>intake.project_session_id) OR
   (artifact.run_id IS NOT NULL AND artifact.run_id<>intake.coordination_run_id) OR
   (SELECT COUNT(*) FROM json_each(intake.artifact_refs_json) ref
     WHERE json_extract(ref.value,'$.path')=artifact.relative_path
       AND json_extract(ref.value,'$.digest')=artifact.sha256)<>1
 );
INSERT INTO migration_0010_postflight_guard(value)
SELECT COUNT(*) FROM pragma_foreign_key_check;
INSERT INTO migration_0010_postflight_guard(value)
SELECT COUNT(*) FROM pragma_integrity_check WHERE integrity_check<>'ok';
DROP TABLE migration_0010_postflight_guard;

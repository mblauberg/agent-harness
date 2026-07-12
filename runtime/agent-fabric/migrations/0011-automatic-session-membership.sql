-- Spec 01 section 32.1 / Spec 04 section 9.3 automatic source membership.
-- Backfill source rows created after migration 0004; production mutations use
-- the same transaction-scoped membership helper.

CREATE TEMP TABLE migration_0011_desired_memberships(
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  member_kind TEXT NOT NULL,
  member_id TEXT NOT NULL,
  desired_state TEXT NOT NULL CHECK(desired_state IN ('active','reconciled')),
  source_timestamp INTEGER NOT NULL,
  PRIMARY KEY(project_session_id, coordination_run_id, member_kind, member_id)
);

INSERT INTO migration_0011_desired_memberships
SELECT run.project_session_id, task.run_id, 'task', task.task_id,
       CASE WHEN task.state IN ('complete','cancelled','degraded')
            THEN 'reconciled' ELSE 'active' END,
       run.created_at
  FROM tasks task JOIN runs run ON run.run_id=task.run_id;

INSERT INTO migration_0011_desired_memberships
SELECT run.project_session_id, message.run_id, 'required-message', message.message_id,
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM deliveries delivery
          WHERE delivery.run_id=message.run_id AND delivery.message_id=message.message_id
            AND delivery.state NOT IN ('acknowledged','abandoned','expired')
       ) THEN 'reconciled' ELSE 'active' END,
       message.created_at
  FROM messages message JOIN runs run ON run.run_id=message.run_id
 WHERE message.requires_ack=1;

INSERT INTO migration_0011_desired_memberships
SELECT run.project_session_id, lease.run_id, 'lease', lease.lease_id,
       CASE WHEN lease.status='released' THEN 'reconciled' ELSE 'active' END,
       lease.updated_at
  FROM leases lease JOIN runs run ON run.run_id=lease.run_id
 WHERE lease.kind='write';

CREATE TEMP TABLE migration_0011_changed_sessions(
  project_session_id TEXT PRIMARY KEY
);
INSERT INTO migration_0011_changed_sessions(project_session_id)
SELECT DISTINCT desired.project_session_id
  FROM migration_0011_desired_memberships desired
  LEFT JOIN project_session_memberships membership
    ON membership.project_session_id=desired.project_session_id
   AND membership.coordination_run_id=desired.coordination_run_id
   AND membership.member_kind=desired.member_kind
   AND membership.member_id=desired.member_id
 WHERE membership.member_id IS NULL OR membership.required<>1 OR
       (membership.state='active' AND desired.desired_state='reconciled') OR
       (membership.state='reconciled' AND desired.desired_state='active');

DROP TRIGGER ps_membership_frozen;

INSERT INTO project_session_memberships(
  project_session_id, coordination_run_id, member_kind, member_id,
  required, state, revision, abandoned_reason, created_at, updated_at
)
SELECT desired.project_session_id, desired.coordination_run_id,
       desired.member_kind, desired.member_id, 1, desired.desired_state, 1, NULL,
       desired.source_timestamp, desired.source_timestamp
  FROM migration_0011_desired_memberships desired
 WHERE 1
ON CONFLICT(project_session_id, coordination_run_id, member_kind, member_id)
DO NOTHING;

UPDATE project_session_memberships
   SET required=1,
       state=CASE
         WHEN state IN ('active','reconciled') THEN (
           SELECT desired.desired_state
             FROM migration_0011_desired_memberships desired
            WHERE desired.project_session_id=project_session_memberships.project_session_id
              AND desired.coordination_run_id=project_session_memberships.coordination_run_id
              AND desired.member_kind=project_session_memberships.member_kind
              AND desired.member_id=project_session_memberships.member_id
         )
         ELSE state
       END,
       revision=revision+1,
       updated_at=MAX(updated_at, (
         SELECT desired.source_timestamp
           FROM migration_0011_desired_memberships desired
          WHERE desired.project_session_id=project_session_memberships.project_session_id
            AND desired.coordination_run_id=project_session_memberships.coordination_run_id
            AND desired.member_kind=project_session_memberships.member_kind
            AND desired.member_id=project_session_memberships.member_id
       ))
 WHERE EXISTS (
   SELECT 1 FROM migration_0011_desired_memberships desired
    WHERE desired.project_session_id=project_session_memberships.project_session_id
      AND desired.coordination_run_id=project_session_memberships.coordination_run_id
      AND desired.member_kind=project_session_memberships.member_kind
      AND desired.member_id=project_session_memberships.member_id
      AND (project_session_memberships.required<>1 OR
           (project_session_memberships.state='active' AND desired.desired_state='reconciled') OR
           (project_session_memberships.state='reconciled' AND desired.desired_state='active'))
 );

UPDATE project_sessions
   SET membership_revision=membership_revision+1,
       revision=revision+1,
       updated_at=updated_at+1
 WHERE project_session_id IN (
   SELECT project_session_id FROM migration_0011_changed_sessions
 );

CREATE TRIGGER ps_membership_frozen BEFORE INSERT ON project_session_memberships
WHEN (SELECT state FROM project_sessions WHERE project_session_id=NEW.project_session_id)
     IN ('quiescing','awaiting_acceptance','closed','cancelled')
BEGIN SELECT RAISE(ABORT, 'AFAB_0004_MEMBERSHIP_FROZEN'); END;

CREATE TABLE result_deadline_sweep_state(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  daemon_instance_generation INTEGER NOT NULL CHECK(daemon_instance_generation>=1),
  pass_generation INTEGER NOT NULL CHECK(pass_generation>=1),
  result_json TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  FOREIGN KEY(daemon_instance_generation)
    REFERENCES daemon_runtime_epochs(instance_generation)
);

CREATE TEMP TABLE migration_0011_postflight_guard(value INTEGER NOT NULL CHECK(value=0));
INSERT INTO migration_0011_postflight_guard(value)
SELECT COUNT(*)
  FROM migration_0011_desired_memberships desired
  LEFT JOIN project_session_memberships membership
    ON membership.project_session_id=desired.project_session_id
   AND membership.coordination_run_id=desired.coordination_run_id
   AND membership.member_kind=desired.member_kind
   AND membership.member_id=desired.member_id
 WHERE membership.member_id IS NULL OR membership.required<>1 OR
       (desired.desired_state='active' AND membership.state NOT IN ('active','abandoned')) OR
       (desired.desired_state='reconciled' AND membership.state='active');
INSERT INTO migration_0011_postflight_guard(value)
SELECT COUNT(*) FROM pragma_foreign_key_check;
INSERT INTO migration_0011_postflight_guard(value)
SELECT COUNT(*) FROM pragma_integrity_check WHERE integrity_check<>'ok';
DROP TABLE migration_0011_postflight_guard;
DROP TABLE migration_0011_changed_sessions;
DROP TABLE migration_0011_desired_memberships;

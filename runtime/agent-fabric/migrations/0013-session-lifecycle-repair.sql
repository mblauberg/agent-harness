-- Spec 01 v0.21 / Spec 04 v1.17 forward-only lifecycle and membership repair.

CREATE UNIQUE INDEX one_nonterminal_run_per_project_session
  ON runs(project_session_id)
  WHERE lifecycle_state NOT IN ('closed','cancelled','launch_failed');

CREATE TRIGGER run_required_session_identity_update
BEFORE UPDATE OF project_session_id,lifecycle_state,revision,chair_generation,
  chair_lease_id,authority_ref,budget_ref,dependency_revision ON runs
WHEN NEW.project_session_id IS NULL OR NEW.lifecycle_state IS NULL OR NEW.revision IS NULL
  OR NEW.chair_generation IS NULL OR NEW.chair_lease_id IS NULL OR NEW.authority_ref IS NULL
  OR NEW.budget_ref IS NULL OR NEW.dependency_revision IS NULL
  OR NEW.project_session_id<>OLD.project_session_id
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_required_session_identity'); END;

CREATE TRIGGER run_chair_lease_cross_owner_insert
BEFORE INSERT ON run_chair_leases
WHEN EXISTS (SELECT 1 FROM leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
  OR EXISTS (SELECT 1 FROM task_owner_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
BEGIN SELECT RAISE(ABORT,'INVARIANT_lease_identity_single_owner'); END;
CREATE TRIGGER write_lease_cross_owner_insert
BEFORE INSERT ON leases
WHEN EXISTS (SELECT 1 FROM run_chair_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
  OR EXISTS (SELECT 1 FROM task_owner_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
BEGIN SELECT RAISE(ABORT,'INVARIANT_lease_identity_single_owner'); END;
CREATE TRIGGER task_owner_lease_cross_owner_insert
BEFORE INSERT ON task_owner_leases
WHEN EXISTS (SELECT 1 FROM run_chair_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
  OR EXISTS (SELECT 1 FROM leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
BEGIN SELECT RAISE(ABORT,'INVARIANT_lease_identity_single_owner'); END;
CREATE TRIGGER run_chair_lease_cross_owner_update
BEFORE UPDATE OF project_session_id,run_id,lease_id ON run_chair_leases
WHEN EXISTS (SELECT 1 FROM leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
  OR EXISTS (SELECT 1 FROM task_owner_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
BEGIN SELECT RAISE(ABORT,'INVARIANT_lease_identity_single_owner'); END;
CREATE TRIGGER write_lease_cross_owner_update
BEFORE UPDATE OF run_id,lease_id ON leases
WHEN EXISTS (SELECT 1 FROM run_chair_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
  OR EXISTS (SELECT 1 FROM task_owner_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
BEGIN SELECT RAISE(ABORT,'INVARIANT_lease_identity_single_owner'); END;
CREATE TRIGGER task_owner_lease_cross_owner_update
BEFORE UPDATE OF project_session_id,run_id,lease_id ON task_owner_leases
WHEN EXISTS (SELECT 1 FROM run_chair_leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
  OR EXISTS (SELECT 1 FROM leases WHERE run_id=NEW.run_id AND lease_id=NEW.lease_id)
BEGIN SELECT RAISE(ABORT,'INVARIANT_lease_identity_single_owner'); END;
CREATE TRIGGER run_chair_lease_identity_immutable
BEFORE UPDATE OF project_session_id,run_id,lease_id,holder_agent_id,generation ON run_chair_leases
WHEN NEW.project_session_id<>OLD.project_session_id OR NEW.run_id<>OLD.run_id
  OR NEW.lease_id<>OLD.lease_id OR NEW.holder_agent_id<>OLD.holder_agent_id
  OR NEW.generation<>OLD.generation
BEGIN SELECT RAISE(ABORT,'INVARIANT_run_chair_lease_identity_immutable'); END;
CREATE TRIGGER task_owner_lease_identity_immutable
BEFORE UPDATE OF project_session_id,run_id,task_id,lease_id,holder_agent_id,generation ON task_owner_leases
WHEN NEW.project_session_id<>OLD.project_session_id OR NEW.run_id<>OLD.run_id
  OR NEW.task_id<>OLD.task_id OR NEW.lease_id<>OLD.lease_id
  OR NEW.holder_agent_id<>OLD.holder_agent_id OR NEW.generation<>OLD.generation
BEGIN SELECT RAISE(ABORT,'INVARIANT_task_owner_lease_identity_immutable'); END;
CREATE TRIGGER write_lease_identity_immutable
BEFORE UPDATE OF lease_id,run_id,kind ON leases
WHEN NEW.lease_id<>OLD.lease_id OR NEW.run_id<>OLD.run_id OR NEW.kind<>OLD.kind
BEGIN SELECT RAISE(ABORT,'INVARIANT_write_lease_identity_immutable'); END;

CREATE TABLE launched_chair_bridge_retirements(
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN (
    'project-session-close','project-session-stop','chair-recovery-abandon','migration-backfill'
  )),
  terminal_kind TEXT NOT NULL CHECK(terminal_kind IN (
    'accepted','cancelled','failed','closed','launch-failed'
  )),
  terminal_ref TEXT NOT NULL CHECK(length(terminal_ref)>0),
  owner_operator_id TEXT,
  owner_ref TEXT NOT NULL CHECK(length(owner_ref)>0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(project_session_id,coordination_run_id),
  FOREIGN KEY(project_session_id,coordination_run_id)
    REFERENCES launched_chair_bridge_state(project_session_id,coordination_run_id),
  CHECK(
    (source_kind='migration-backfill' AND owner_operator_id IS NULL) OR
    (source_kind<>'migration-backfill' AND owner_operator_id IS NOT NULL AND length(owner_operator_id)>0)
  )
);

CREATE TRIGGER launched_chair_bridge_retirement_immutable_update
BEFORE UPDATE ON launched_chair_bridge_retirements
BEGIN SELECT RAISE(ABORT,'INVARIANT_launched_chair_bridge_retirement_immutable'); END;
CREATE TRIGGER launched_chair_bridge_retirement_immutable_delete
BEFORE DELETE ON launched_chair_bridge_retirements
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
       )) OR
       (NEW.source_kind='migration-backfill' AND NEW.owner_ref='migration-0013'
         AND NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version=13))
     )
)
BEGIN SELECT RAISE(ABORT,'INVARIANT_launched_chair_bridge_retirement_proof'); END;
CREATE TRIGGER global_revision_launched_chair_bridge_retirement_insert
AFTER INSERT ON launched_chair_bridge_retirements
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

INSERT INTO launched_chair_bridge_retirements(
  project_session_id,coordination_run_id,source_kind,terminal_kind,
  terminal_ref,owner_operator_id,owner_ref,created_at
)
SELECT bridge.project_session_id,bridge.coordination_run_id,'migration-backfill',
       CASE
         WHEN session.terminal_path_json IS NOT NULL AND json_valid(session.terminal_path_json)=1
           AND json_extract(session.terminal_path_json,'$.kind') IN ('accepted','cancelled','failed')
           THEN json_extract(session.terminal_path_json,'$.kind')
         WHEN run.lifecycle_state='launch_failed' THEN 'launch-failed'
         ELSE run.lifecycle_state
       END,
       COALESCE(
         session.terminal_path_json,
         json_object('kind','historical-run','state',run.lifecycle_state)
       ),
       NULL,'migration-0013',
       MAX(bridge.updated_at,session.updated_at)
  FROM launched_chair_bridge_state bridge
  JOIN runs run ON run.project_session_id=bridge.project_session_id
               AND run.run_id=bridge.coordination_run_id
 JOIN project_sessions session ON session.project_session_id=bridge.project_session_id
 WHERE bridge.state IN ('active','abandoned')
   AND run.lifecycle_state IN ('closed','cancelled','launch_failed')
   AND session.state IN ('closed','cancelled')
   AND session.terminal_path_json IS NOT NULL
   AND json_valid(session.terminal_path_json)=1
   AND json_extract(session.terminal_path_json,'$.kind') IN ('accepted','cancelled','failed');

UPDATE agent_bridge_state
   SET bridge_state='none',
       provider_session_ref=NULL,
       provider_session_generation=NULL,
       capability_hash=NULL,
       activation_evidence_digest=NULL,
       revision=revision+1,
       updated_at=(SELECT MAX(agent_bridge_state.updated_at,run.created_at)
                     FROM runs run WHERE run.run_id=agent_bridge_state.run_id)
 WHERE bridge_state='active'
   AND EXISTS (
     SELECT 1 FROM runs run
      WHERE run.run_id=agent_bridge_state.run_id
        AND run.lifecycle_state IN ('closed','cancelled','launch_failed')
   );

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
      AND (
        retirement.coordination_run_id IS NOT NULL OR
        (NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version=13)
          AND session.terminal_path_json IS NOT NULL AND json_valid(session.terminal_path_json)=1)
      )
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
  )
)
BEGIN SELECT RAISE(ABORT,'INVARIANT_agent_bridge_active_retirement_proof'); END;
CREATE TRIGGER agent_bridge_live_delete_forbidden
BEFORE DELETE ON agent_bridge_state
WHEN OLD.bridge_state<>'none'
BEGIN SELECT RAISE(ABORT,'INVARIANT_agent_bridge_active_retirement_proof'); END;

UPDATE run_chair_leases
   SET status='frozen',updated_at=updated_at+1
 WHERE status='active' AND EXISTS (
   SELECT 1 FROM runs run
   JOIN project_sessions session ON session.project_session_id=run.project_session_id
   JOIN project_session_launch_custody launch
     ON launch.project_session_id=run.project_session_id AND launch.coordination_run_id=run.run_id
   JOIN provider_actions action
     ON action.adapter_id=launch.provider_adapter_id AND action.action_id=launch.provider_action_id
   JOIN resource_reservations reservation ON reservation.reservation_id=launch.reservation_id
   WHERE run.project_session_id=run_chair_leases.project_session_id
     AND run.run_id=run_chair_leases.run_id
     AND run.chair_lease_id=run_chair_leases.lease_id
     AND run.lifecycle_state='recovery_required' AND session.state='recovery_required'
     AND action.status='terminal' AND action.effect_count=1 AND reservation.state='reserved'
 );

UPDATE run_chair_leases
   SET status='revoked',updated_at=updated_at+1
 WHERE status IN ('active','frozen')
   AND EXISTS (
     SELECT 1 FROM runs run
      WHERE run.project_session_id=run_chair_leases.project_session_id
        AND run.run_id=run_chair_leases.run_id
        AND run.chair_lease_id<>run_chair_leases.lease_id
   );

CREATE UNIQUE INDEX one_active_chair_lease_per_run
  ON run_chair_leases(project_session_id,run_id)
  WHERE status='active';

CREATE TEMP TABLE migration_0013_desired_memberships(
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  member_kind TEXT NOT NULL,
  member_id TEXT NOT NULL,
  desired_state TEXT NOT NULL CHECK(desired_state IN ('active','reconciled','abandoned')),
  desired_reason TEXT,
  source_timestamp INTEGER NOT NULL,
  PRIMARY KEY(project_session_id,coordination_run_id,member_kind,member_id)
);

INSERT OR REPLACE INTO migration_0013_desired_memberships
SELECT run.project_session_id,run.run_id,'coordination-run',run.run_id,
       CASE
         WHEN run.lifecycle_state IN ('awaiting_acceptance','closed') THEN 'reconciled'
         WHEN run.lifecycle_state IN ('cancelled','launch_failed') THEN 'abandoned'
         ELSE 'active'
       END,
       CASE WHEN run.lifecycle_state IN ('cancelled','launch_failed')
         THEN 'coordination-run source state '||run.lifecycle_state ELSE NULL END,
       run.created_at
  FROM runs run;

INSERT OR REPLACE INTO migration_0013_desired_memberships
SELECT run.project_session_id,lease.run_id,'lease',lease.lease_id,
       CASE
         WHEN lease.lease_id<>run.chair_lease_id THEN 'abandoned'
         WHEN run.lifecycle_state IN ('awaiting_acceptance','closed') THEN 'reconciled'
         WHEN run.lifecycle_state IN ('cancelled','launch_failed') THEN 'abandoned'
         WHEN lease.status='revoked' THEN 'abandoned'
         ELSE 'active'
       END,
       CASE
         WHEN lease.lease_id<>run.chair_lease_id THEN 'superseded chair lease'
         WHEN run.lifecycle_state IN ('cancelled','launch_failed')
           THEN 'coordination-run source state '||run.lifecycle_state
         WHEN lease.status='revoked' THEN 'chair lease source status revoked'
         ELSE NULL
       END,
       lease.updated_at
  FROM run_chair_leases lease
  JOIN runs run ON run.project_session_id=lease.project_session_id AND run.run_id=lease.run_id;

INSERT OR REPLACE INTO migration_0013_desired_memberships
SELECT run.project_session_id,task.run_id,'task',task.task_id,
       CASE
         WHEN task.state='complete' THEN 'reconciled'
         WHEN task.state IN ('cancelled','degraded') THEN 'abandoned'
         ELSE 'active'
       END,
       CASE WHEN task.state IN ('cancelled','degraded')
         THEN 'task source state '||task.state ELSE NULL END,
       run.created_at
  FROM tasks task JOIN runs run ON run.run_id=task.run_id;

INSERT OR REPLACE INTO migration_0013_desired_memberships
SELECT run.project_session_id,message.run_id,'required-message',message.message_id,
       CASE
         WHEN NOT EXISTS (
           SELECT 1 FROM deliveries delivery
            WHERE delivery.run_id=message.run_id AND delivery.message_id=message.message_id
         ) THEN 'active'
         WHEN EXISTS (
           SELECT 1 FROM deliveries delivery
            WHERE delivery.run_id=message.run_id AND delivery.message_id=message.message_id
              AND delivery.state NOT IN ('acknowledged','abandoned','expired')
         ) THEN 'active'
         WHEN EXISTS (
           SELECT 1 FROM deliveries delivery
            WHERE delivery.run_id=message.run_id AND delivery.message_id=message.message_id
              AND delivery.state IN ('abandoned','expired')
         ) THEN 'abandoned'
         ELSE 'reconciled'
       END,
       CASE WHEN EXISTS (
         SELECT 1 FROM deliveries delivery
          WHERE delivery.run_id=message.run_id AND delivery.message_id=message.message_id
            AND delivery.state IN ('abandoned','expired')
       ) AND NOT EXISTS (
         SELECT 1 FROM deliveries delivery
          WHERE delivery.run_id=message.run_id AND delivery.message_id=message.message_id
            AND delivery.state NOT IN ('acknowledged','abandoned','expired')
       ) THEN 'required-message source delivery expired or abandoned' ELSE NULL END,
       message.created_at
  FROM messages message JOIN runs run ON run.run_id=message.run_id
 WHERE message.requires_ack=1;

INSERT OR REPLACE INTO migration_0013_desired_memberships
SELECT run.project_session_id,lease.run_id,'lease',lease.lease_id,
       CASE WHEN lease.status='released' THEN 'reconciled' ELSE 'active' END,
       NULL,lease.updated_at
  FROM leases lease JOIN runs run ON run.run_id=lease.run_id
 WHERE lease.kind='write';

INSERT OR REPLACE INTO migration_0013_desired_memberships
SELECT lease.project_session_id,lease.run_id,'lease',lease.lease_id,
       CASE
         WHEN lease.status='released' THEN 'reconciled'
         WHEN lease.status='revoked' THEN 'abandoned'
         ELSE 'active'
       END,
       CASE WHEN lease.status='revoked' THEN 'task-owner lease source status revoked' ELSE NULL END,
       lease.updated_at
  FROM task_owner_leases lease;

INSERT OR REPLACE INTO migration_0013_desired_memberships
SELECT workstream.project_session_id,workstream.coordination_run_id,'workstream',workstream.workstream_id,
       CASE
         WHEN workstream.state='complete' THEN 'reconciled'
         WHEN workstream.state IN ('cancelled','degraded','abandoned') THEN 'abandoned'
         ELSE 'active'
       END,
       CASE WHEN workstream.state IN ('cancelled','degraded','abandoned')
         THEN 'workstream source state '||workstream.state ELSE NULL END,
       workstream.created_at
  FROM workstreams workstream;

INSERT OR REPLACE INTO migration_0013_desired_memberships
SELECT run.project_session_id,action.run_id,'provider-action',action.action_id,
       CASE WHEN action.status='terminal' THEN 'reconciled' ELSE 'active' END,
       NULL,action.updated_at
  FROM provider_actions action JOIN runs run ON run.run_id=action.run_id;

CREATE TEMP TABLE migration_0013_changed_sessions(project_session_id TEXT PRIMARY KEY);
INSERT INTO migration_0013_changed_sessions(project_session_id)
SELECT DISTINCT desired.project_session_id
  FROM migration_0013_desired_memberships desired
  LEFT JOIN project_session_memberships membership
    ON membership.project_session_id=desired.project_session_id
   AND membership.coordination_run_id=desired.coordination_run_id
   AND membership.member_kind=desired.member_kind
   AND membership.member_id=desired.member_id
 WHERE membership.member_id IS NULL OR membership.required<>1
    OR membership.state<>desired.desired_state
    OR COALESCE(membership.abandoned_reason,'')<>COALESCE(desired.desired_reason,'');

DROP TRIGGER ps_membership_frozen;

INSERT INTO project_session_memberships(
  project_session_id,coordination_run_id,member_kind,member_id,
  required,state,revision,abandoned_reason,created_at,updated_at
)
SELECT project_session_id,coordination_run_id,member_kind,member_id,
       1,desired_state,1,desired_reason,source_timestamp,source_timestamp
  FROM migration_0013_desired_memberships
 WHERE 1
ON CONFLICT(project_session_id,coordination_run_id,member_kind,member_id) DO NOTHING;

UPDATE project_session_memberships
   SET required=1,
       state=(SELECT desired.desired_state FROM migration_0013_desired_memberships desired
               WHERE desired.project_session_id=project_session_memberships.project_session_id
                 AND desired.coordination_run_id=project_session_memberships.coordination_run_id
                 AND desired.member_kind=project_session_memberships.member_kind
                 AND desired.member_id=project_session_memberships.member_id),
       abandoned_reason=(SELECT desired.desired_reason FROM migration_0013_desired_memberships desired
                          WHERE desired.project_session_id=project_session_memberships.project_session_id
                            AND desired.coordination_run_id=project_session_memberships.coordination_run_id
                            AND desired.member_kind=project_session_memberships.member_kind
                            AND desired.member_id=project_session_memberships.member_id),
       revision=revision+1,
       updated_at=MAX(updated_at,(SELECT desired.source_timestamp
                                   FROM migration_0013_desired_memberships desired
                                  WHERE desired.project_session_id=project_session_memberships.project_session_id
                                    AND desired.coordination_run_id=project_session_memberships.coordination_run_id
                                    AND desired.member_kind=project_session_memberships.member_kind
                                    AND desired.member_id=project_session_memberships.member_id))
 WHERE EXISTS (
   SELECT 1 FROM migration_0013_desired_memberships desired
    WHERE desired.project_session_id=project_session_memberships.project_session_id
      AND desired.coordination_run_id=project_session_memberships.coordination_run_id
      AND desired.member_kind=project_session_memberships.member_kind
      AND desired.member_id=project_session_memberships.member_id
      AND (project_session_memberships.required<>1
        OR project_session_memberships.state<>desired.desired_state
        OR COALESCE(project_session_memberships.abandoned_reason,'')<>COALESCE(desired.desired_reason,''))
 );

UPDATE project_sessions
   SET membership_revision=membership_revision+1,
       revision=revision+1,
       updated_at=updated_at+1
 WHERE project_session_id IN (SELECT project_session_id FROM migration_0013_changed_sessions);

CREATE TRIGGER ps_membership_frozen BEFORE INSERT ON project_session_memberships
WHEN (SELECT state FROM project_sessions WHERE project_session_id=NEW.project_session_id)
     IN ('quiescing','awaiting_acceptance','closed','cancelled')
BEGIN SELECT RAISE(ABORT,'AFAB_0004_MEMBERSHIP_FROZEN'); END;

CREATE TEMP TABLE migration_0013_postflight_guard(value INTEGER NOT NULL CHECK(value=0));
INSERT INTO migration_0013_postflight_guard(value)
SELECT COUNT(*)
  FROM migration_0013_desired_memberships desired
  LEFT JOIN project_session_memberships membership
    ON membership.project_session_id=desired.project_session_id
   AND membership.coordination_run_id=desired.coordination_run_id
   AND membership.member_kind=desired.member_kind
   AND membership.member_id=desired.member_id
 WHERE membership.member_id IS NULL OR membership.required<>1
    OR membership.state<>desired.desired_state
    OR COALESCE(membership.abandoned_reason,'')<>COALESCE(desired.desired_reason,'');
INSERT INTO migration_0013_postflight_guard(value)
SELECT COUNT(*) FROM (
  SELECT project_session_id FROM runs
   WHERE lifecycle_state NOT IN ('closed','cancelled','launch_failed')
   GROUP BY project_session_id HAVING COUNT(*)>1
);
INSERT INTO migration_0013_postflight_guard(value)
SELECT COUNT(*) FROM (
  SELECT project_session_id,run_id FROM run_chair_leases
   WHERE status='active' GROUP BY project_session_id,run_id HAVING COUNT(*)>1
);
INSERT INTO migration_0013_postflight_guard(value)
SELECT COUNT(*)
  FROM launched_chair_bridge_state bridge
  JOIN runs run ON run.project_session_id=bridge.project_session_id
               AND run.run_id=bridge.coordination_run_id
  LEFT JOIN launched_chair_bridge_retirements retirement
    ON retirement.project_session_id=bridge.project_session_id
   AND retirement.coordination_run_id=bridge.coordination_run_id
 WHERE bridge.state IN ('active','abandoned')
   AND run.lifecycle_state IN ('closed','cancelled','launch_failed')
   AND retirement.coordination_run_id IS NULL;
INSERT INTO migration_0013_postflight_guard(value)
SELECT COUNT(*) FROM agent_bridge_state bridge JOIN runs run ON run.run_id=bridge.run_id
 WHERE run.lifecycle_state IN ('closed','cancelled','launch_failed') AND bridge.bridge_state<>'none';
INSERT INTO migration_0013_postflight_guard(value) SELECT COUNT(*) FROM pragma_foreign_key_check;
INSERT INTO migration_0013_postflight_guard(value)
SELECT COUNT(*) FROM pragma_integrity_check WHERE integrity_check<>'ok';
DROP TABLE migration_0013_postflight_guard;
DROP TABLE migration_0013_changed_sessions;
DROP TABLE migration_0013_desired_memberships;

import type Database from "better-sqlite3";

type FailureRow = Record<string, unknown>;

export class SessionLifecycleRepairPreflightError extends Error {
  readonly code = "SESSION_LIFECYCLE_REPAIR_PREFLIGHT_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "SessionLifecycleRepairPreflightError";
  }
}

function fail(label: string, value: FailureRow | undefined): void {
  if (value === undefined) return;
  const identity = Object.values(value).map(String).join("/");
  throw new SessionLifecycleRepairPreflightError(`${label}: ${identity}`);
}

/** Refuses ambiguous topology or bridge history before deterministic forward repair. */
export function preflightSessionLifecycleRepair(database: Database.Database): void {
  fail("run has nullable required session identity", database.prepare(`
    SELECT run_id FROM runs
     WHERE project_session_id IS NULL OR lifecycle_state IS NULL OR revision IS NULL
        OR chair_generation IS NULL OR chair_lease_id IS NULL OR authority_ref IS NULL
        OR budget_ref IS NULL OR dependency_revision IS NULL
     ORDER BY run_id LIMIT 1
  `).get() as FailureRow | undefined);

  fail("project session has more than one nonterminal coordination run", database.prepare(`
    SELECT project_session_id, COUNT(*) AS run_count
      FROM runs
     WHERE lifecycle_state NOT IN ('closed','cancelled','launch_failed')
     GROUP BY project_session_id
    HAVING COUNT(*)>1
     ORDER BY project_session_id
     LIMIT 1
  `).get() as FailureRow | undefined);

  fail("current chair lease is missing", database.prepare(`
    SELECT run.project_session_id,run.run_id,run.chair_lease_id
      FROM runs run
      LEFT JOIN run_chair_leases lease
        ON lease.project_session_id=run.project_session_id
       AND lease.run_id=run.run_id
       AND lease.lease_id=run.chair_lease_id
       AND lease.generation=run.chair_generation
      LEFT JOIN agents chair
        ON chair.run_id=run.run_id AND chair.agent_id=run.chair_agent_id
     WHERE lease.lease_id IS NULL OR chair.agent_id IS NULL
        OR lease.holder_agent_id<>run.chair_agent_id
     ORDER BY run.project_session_id,run.run_id
     LIMIT 1
  `).get() as FailureRow | undefined);

  fail("nonterminal run has no live current chair lease", database.prepare(`
    SELECT run.project_session_id,run.run_id,lease.lease_id,lease.status
      FROM runs run
      JOIN run_chair_leases lease
        ON lease.project_session_id=run.project_session_id
       AND lease.run_id=run.run_id
       AND lease.lease_id=run.chair_lease_id
       AND lease.generation=run.chair_generation
     WHERE run.lifecycle_state NOT IN ('closed','cancelled','launch_failed')
       AND lease.status NOT IN ('active','frozen')
     ORDER BY run.project_session_id,run.run_id
     LIMIT 1
  `).get() as FailureRow | undefined);

  fail("current chair lease status contradicts run lifecycle", database.prepare(`
    SELECT run.project_session_id,run.run_id,run.lifecycle_state,lease.status
      FROM runs run
      JOIN run_chair_leases lease
        ON lease.project_session_id=run.project_session_id
       AND lease.run_id=run.run_id
       AND lease.lease_id=run.chair_lease_id
       AND lease.generation=run.chair_generation
     WHERE (run.lifecycle_state IN ('active','visibility_degraded','launching','launch_ambiguous','quiescing')
              AND lease.status<>'active')
        OR (run.lifecycle_state IN ('awaiting_acceptance','reconciling','recovery_required','quarantined')
              AND lease.status<>'frozen'
              AND NOT (
                run.lifecycle_state='recovery_required' AND lease.status='active' AND EXISTS (
                  SELECT 1 FROM project_session_launch_custody launch
                  JOIN provider_actions action
                    ON action.adapter_id=launch.provider_adapter_id
                   AND action.action_id=launch.provider_action_id
                  JOIN resource_reservations reservation ON reservation.reservation_id=launch.reservation_id
                 WHERE launch.project_session_id=run.project_session_id
                   AND launch.coordination_run_id=run.run_id
                   AND action.status='terminal' AND action.effect_count=1
                   AND reservation.state='reserved'
                )
              ))
        OR (run.lifecycle_state IN ('closed','cancelled','launch_failed')
              AND lease.status<>'revoked')
     ORDER BY run.project_session_id,run.run_id
     LIMIT 1
  `).get() as FailureRow | undefined);

  fail("terminal launched-chair bridge lacks clean retirement proof", database.prepare(`
    SELECT bridge.project_session_id,bridge.coordination_run_id,bridge.state
      FROM launched_chair_bridge_state bridge
      JOIN runs run ON run.project_session_id=bridge.project_session_id
                   AND run.run_id=bridge.coordination_run_id
      JOIN project_sessions session ON session.project_session_id=bridge.project_session_id
      LEFT JOIN run_chair_leases lease
        ON lease.project_session_id=run.project_session_id
       AND lease.run_id=run.run_id
       AND lease.lease_id=run.chair_lease_id
       AND lease.generation=run.chair_generation
      LEFT JOIN capabilities capability ON capability.token_hash=bridge.capability_hash
      LEFT JOIN agents agent ON agent.run_id=bridge.coordination_run_id
                            AND agent.agent_id=bridge.chair_agent_id
     WHERE run.lifecycle_state IN ('closed','cancelled','launch_failed')
       AND bridge.state IN ('active','lost','abandoned')
       AND (
         bridge.state='lost' OR
         run.chair_agent_id<>bridge.chair_agent_id OR
         lease.status<>'revoked' OR
         capability.revoked_at IS NULL OR
         agent.lifecycle<>'archived' OR
         session.state NOT IN ('closed','cancelled') OR
         session.terminal_path_json IS NULL OR json_valid(session.terminal_path_json)<>1 OR
         json_extract(session.terminal_path_json,'$.kind') NOT IN ('accepted','cancelled','failed')
       )
     ORDER BY bridge.project_session_id,bridge.coordination_run_id
     LIMIT 1
  `).get() as FailureRow | undefined);

  fail("terminal child bridge lacks clean retirement proof", database.prepare(`
    SELECT run.project_session_id,bridge.run_id,bridge.agent_id,bridge.bridge_state
      FROM agent_bridge_state bridge
      JOIN runs run ON run.run_id=bridge.run_id
      LEFT JOIN capabilities capability ON capability.token_hash=bridge.capability_hash
      LEFT JOIN agents agent ON agent.run_id=bridge.run_id AND agent.agent_id=bridge.agent_id
     WHERE run.lifecycle_state IN ('closed','cancelled','launch_failed')
       AND bridge.bridge_state<>'none'
       AND (
         bridge.bridge_state<>'active' OR
         capability.revoked_at IS NULL OR
         agent.lifecycle<>'archived'
       )
     ORDER BY run.project_session_id,bridge.run_id,bridge.agent_id
     LIMIT 1
  `).get() as FailureRow | undefined);

  fail("session has multiple live launched-chair bridge owners", database.prepare(`
    SELECT bridge.project_session_id,COUNT(*) AS bridge_count
      FROM launched_chair_bridge_state bridge
      JOIN runs run ON run.project_session_id=bridge.project_session_id
                   AND run.run_id=bridge.coordination_run_id
     WHERE bridge.state IN ('active','lost')
       AND run.lifecycle_state NOT IN ('closed','cancelled','launch_failed')
     GROUP BY bridge.project_session_id
    HAVING COUNT(*)>1
     ORDER BY bridge.project_session_id
     LIMIT 1
  `).get() as FailureRow | undefined);

  fail("lease identity has multiple source owners", database.prepare(`
    WITH lease_owners(project_session_id,run_id,lease_id) AS (
      SELECT project_session_id,run_id,lease_id FROM run_chair_leases
      UNION ALL
      SELECT run.project_session_id,lease.run_id,lease.lease_id
        FROM leases lease JOIN runs run ON run.run_id=lease.run_id
      UNION ALL
      SELECT project_session_id,run_id,lease_id FROM task_owner_leases
    )
    SELECT project_session_id,run_id,lease_id,COUNT(*) AS owner_count
      FROM lease_owners
     GROUP BY project_session_id,run_id,lease_id
    HAVING COUNT(*)>1
     ORDER BY project_session_id,run_id,lease_id
     LIMIT 1
  `).get() as FailureRow | undefined);
}

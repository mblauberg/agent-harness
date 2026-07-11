import type Database from "better-sqlite3";

type Row = Record<string, unknown>;

export class LaunchedChairBridgeLossPreflightError extends Error {
  readonly code = "LAUNCHED_CHAIR_BRIDGE_LOSS_MIGRATION_PREFLIGHT_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "LaunchedChairBridgeLossPreflightError";
  }
}

export function preflightLaunchedChairBridgeLoss(database: Database.Database): void {
  const uncovered = database.prepare(`
    WITH active_launches AS (
      SELECT r.project_session_id, r.run_id, r.chair_agent_id
        FROM runs r
        JOIN project_sessions s ON s.project_session_id=r.project_session_id
       WHERE r.lifecycle_state='active' AND s.state='active'
         AND EXISTS (
           SELECT 1 FROM project_session_launch_custody c
            WHERE c.project_session_id=r.project_session_id
              AND c.coordination_run_id=r.run_id
         )
    ), candidate_counts AS (
      SELECT active.project_session_id, active.run_id, active.chair_agent_id,
             COUNT(c.provider_action_id) AS candidate_count
        FROM active_launches active
        LEFT JOIN project_session_launch_custody c
          ON c.project_session_id=active.project_session_id
         AND c.coordination_run_id=active.run_id
         AND c.chair_agent_id=active.chair_agent_id
        LEFT JOIN agents a
          ON a.run_id=active.run_id AND a.agent_id=active.chair_agent_id
        LEFT JOIN provider_state ps
          ON ps.run_id=active.run_id AND ps.agent_id=active.chair_agent_id
        LEFT JOIN capabilities cap
          ON cap.token_hash=c.capability_hash
        LEFT JOIN provider_actions p
          ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
       WHERE a.provider_session_ref IS NOT NULL
         AND ps.provider_session_generation IS NOT NULL
         AND cap.token_hash IS NOT NULL AND cap.revoked_at IS NULL
         AND p.status='terminal' AND p.execution_count=1 AND p.effect_count=1
         AND json_valid(p.result_json)=1
         AND json_extract(p.result_json, '$.outcome.kind')='terminal-success'
         AND json_extract(p.result_json, '$.outcome.providerSessionRef')=a.provider_session_ref
         AND json_extract(p.result_json, '$.outcome.providerSessionGeneration')=ps.provider_session_generation
         AND typeof(json_extract(p.result_json, '$.outcome.effectDigest'))='text'
         AND length(json_extract(p.result_json, '$.outcome.effectDigest'))=71
         AND substr(json_extract(p.result_json, '$.outcome.effectDigest'),1,7)='sha256:'
       GROUP BY active.project_session_id, active.run_id, active.chair_agent_id
    )
    SELECT active.project_session_id, active.run_id, active.chair_agent_id,
           COALESCE(counts.candidate_count, 0) AS candidate_count
      FROM active_launches active
      LEFT JOIN candidate_counts counts
        ON counts.project_session_id=active.project_session_id AND counts.run_id=active.run_id
     WHERE COALESCE(counts.candidate_count, 0)<>1
     ORDER BY active.project_session_id, active.run_id
     LIMIT 1
  `).get() as Row | undefined;
  if (uncovered !== undefined) {
    throw new LaunchedChairBridgeLossPreflightError(
      `active launched chair has no unique authoritative bridge backfill: ${String(uncovered.project_session_id)}/${String(uncovered.run_id)}/${String(uncovered.chair_agent_id)} (${String(uncovered.candidate_count)} candidates)`,
    );
  }
}

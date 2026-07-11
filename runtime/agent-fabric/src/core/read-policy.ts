import type Database from "better-sqlite3";

type Row = Record<string, unknown>;

function found(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class FabricReadPolicy {
  readonly #database: Database.Database;

  constructor(database: Database.Database) {
    this.#database = database;
  }

  isChair(runId: string, agentId: string): boolean {
    return found(this.#database.prepare("SELECT 1 FROM runs WHERE run_id = ? AND chair_agent_id = ?").get(runId, agentId));
  }

  canReadTask(runId: string, agentId: string, taskId: string): boolean {
    if (this.isChair(runId, agentId)) return true;
    return found(this.#database.prepare(`
      SELECT 1 FROM tasks t
      WHERE t.run_id = ? AND t.task_id = ? AND (
        t.owner_agent_id = ? OR EXISTS (SELECT 1 FROM task_proposals q WHERE q.run_id = t.run_id AND q.task_id = t.task_id AND q.proposed_owner_agent_id = ?) OR
        EXISTS (SELECT 1 FROM task_eligible_agents e WHERE e.run_id = t.run_id AND e.task_id = t.task_id AND e.agent_id = ?) OR
        EXISTS (SELECT 1 FROM task_participants p WHERE p.run_id = t.run_id AND p.task_id = t.task_id AND p.agent_id = ?) OR
        EXISTS (
          SELECT 1 FROM task_dependencies d JOIN tasks related
            ON related.run_id = d.run_id
           AND related.task_id = CASE WHEN d.task_id = t.task_id THEN d.dependency_task_id ELSE d.task_id END
          WHERE d.run_id = t.run_id AND (d.task_id = t.task_id OR d.dependency_task_id = t.task_id)
            AND (
              related.owner_agent_id = ? OR EXISTS (SELECT 1 FROM task_proposals q WHERE q.run_id = related.run_id AND q.task_id = related.task_id AND q.proposed_owner_agent_id = ?) OR
              EXISTS (SELECT 1 FROM task_eligible_agents e WHERE e.run_id = related.run_id AND e.task_id = related.task_id AND e.agent_id = ?) OR
              EXISTS (SELECT 1 FROM task_participants p WHERE p.run_id = related.run_id AND p.task_id = related.task_id AND p.agent_id = ?)
            )
        )
      ) LIMIT 1
    `).get(runId, taskId, agentId, agentId, agentId, agentId, agentId, agentId, agentId, agentId));
  }

  canReadAgent(runId: string, requesterId: string, targetId: string): boolean {
    if (this.isChair(runId, requesterId) || requesterId === targetId) return true;
    return found(this.#database.prepare(`
      SELECT 1 FROM agents target WHERE target.run_id = ? AND target.agent_id = ? AND (
        target.parent_agent_id = ? OR
        EXISTS (SELECT 1 FROM agents requester WHERE requester.run_id = target.run_id AND requester.agent_id = ? AND requester.parent_agent_id = target.agent_id) OR
        EXISTS (SELECT 1 FROM discussion_group_members a JOIN discussion_group_members b ON b.run_id = a.run_id AND b.group_id = a.group_id WHERE a.run_id = target.run_id AND a.agent_id = ? AND b.agent_id = target.agent_id) OR
        EXISTS (SELECT 1 FROM team_members a JOIN team_members b ON b.run_id = a.run_id AND b.team_id = a.team_id WHERE a.run_id = target.run_id AND a.agent_id = ? AND b.agent_id = target.agent_id) OR
        EXISTS (SELECT 1 FROM tasks t WHERE t.run_id = target.run_id AND (t.owner_agent_id = ? OR EXISTS (SELECT 1 FROM task_participants p WHERE p.run_id = t.run_id AND p.task_id = t.task_id AND p.agent_id = ?)) AND (t.owner_agent_id = target.agent_id OR EXISTS (SELECT 1 FROM task_participants p WHERE p.run_id = t.run_id AND p.task_id = t.task_id AND p.agent_id = target.agent_id)))
      ) LIMIT 1
    `).get(runId, targetId, requesterId, requesterId, requesterId, requesterId, requesterId, requesterId));
  }

  canReadWriteLease(runId: string, agentId: string, leaseId: string): boolean {
    return this.isChair(runId, agentId) || found(this.#database.prepare("SELECT 1 FROM leases WHERE run_id = ? AND lease_id = ? AND holder_agent_id = ?").get(runId, leaseId, agentId));
  }

  canReadTeam(runId: string, agentId: string, teamId: string): boolean {
    return this.isChair(runId, agentId) || found(this.#database.prepare("SELECT 1 FROM team_members WHERE run_id = ? AND team_id = ? AND agent_id = ?").get(runId, teamId, agentId));
  }

  canReadBudget(runId: string, agentId: string, budgetId: string): boolean {
    return this.isChair(runId, agentId) || found(this.#database.prepare("SELECT 1 FROM budgets b JOIN team_members m ON m.run_id = b.run_id AND m.team_id = b.team_id WHERE b.run_id = ? AND b.budget_id = ? AND m.agent_id = ?").get(runId, budgetId, agentId));
  }
}

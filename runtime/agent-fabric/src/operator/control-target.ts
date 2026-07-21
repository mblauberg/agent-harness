import type { JsonValue, OperatorActionIntent } from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import { ProjectFabricCoreError } from "../project-session/contracts.js";
import type { ActiveTurn, ResolvedControlTarget } from "./control-eligibility.js";

export type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function row(value: unknown, label: string): Row {
  if (!isRow(value)) throw new ProjectFabricCoreError("NOT_FOUND", `${label} was not found`);
  return value;
}

function text(value: Row, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string") throw new Error(`${field} is not text`);
  return candidate;
}

function integer(value: Row, field: string): number {
  const candidate = value[field];
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate)) throw new Error(`${field} is not an integer`);
  return candidate;
}

function nullableText(value: Row, field: string): string | null {
  const candidate = value[field];
  if (candidate !== null && typeof candidate !== "string") throw new Error(`${field} is not nullable text`);
  return candidate;
}

/**
 * Byte-moved from `ProductionOperatorActions` (S4g): the operator-control read-side —
 * `#resolveControlTarget` and `#controlBinding`. Pure reads with no custody/transaction
 * involvement; kept as plain functions rather than a class since there is no shared
 * constructed state beyond the database handle.
 */
export function resolveControlTarget(
  database: Database.Database,
  intent: Extract<OperatorActionIntent, { kind: "control" }>,
): ResolvedControlTarget {
  const target = intent.target;
  let revision: number;
  let sessionGeneration: number;
  let runIds: string[];
  let taskRows: Row[];
  let agentRows: Row[];
  if (target.kind === "task" || target.kind === "subtree") {
    const rootTaskId = target.kind === "task" ? target.taskId : target.rootTaskId;
    const task = row(database.prepare(`
      SELECT t.revision, r.project_session_id, s.generation
        FROM tasks t
        JOIN runs r ON r.run_id=t.run_id
        JOIN project_sessions s ON s.project_session_id=r.project_session_id
       WHERE t.run_id=? AND t.task_id=? AND r.project_session_id=?
    `).get(target.coordinationRunId, rootTaskId, target.projectSessionId), "operator control task");
    revision = integer(task, "revision");
    sessionGeneration = integer(task, "generation");
    runIds = [target.coordinationRunId];
    if (target.kind === "task") {
      taskRows = database.prepare(`
        SELECT run_id, task_id, revision, state, owner_agent_id, owner_lease_generation FROM tasks
         WHERE run_id=? AND task_id=?
      `).all(target.coordinationRunId, target.taskId) as Row[];
    } else {
      taskRows = database.prepare(`
        WITH RECURSIVE scoped(task_id) AS (
          SELECT ?
          UNION
          SELECT dependency.task_id
            FROM task_dependencies dependency
            JOIN scoped parent ON dependency.dependency_task_id=parent.task_id
           WHERE dependency.run_id=?
        )
        SELECT task.run_id, task.task_id, task.revision, task.state, task.owner_agent_id,
               task.owner_lease_generation
          FROM tasks task JOIN scoped ON scoped.task_id=task.task_id
         WHERE task.run_id=? ORDER BY task.task_id
      `).all(target.rootTaskId, target.coordinationRunId, target.coordinationRunId) as Row[];
    }
    const scopedAgentIds = new Set(taskRows.flatMap((item) => {
      const owner = nullableText(item, "owner_agent_id");
      return owner === null ? [] : [owner];
    }));
    if (taskRows.length > 0) {
      const taskIds = taskRows.map((item) => text(item, "task_id"));
      const participants = database.prepare(`
        SELECT DISTINCT agent_id FROM task_participants
         WHERE run_id=? AND task_id IN (${taskIds.map(() => "?").join(",")})
         ORDER BY agent_id
      `).all(target.coordinationRunId, ...taskIds).filter(isRow);
      for (const participant of participants) scopedAgentIds.add(text(participant, "agent_id"));
    }
    agentRows = [...scopedAgentIds].sort().map((agentId) => row(database.prepare(`
      SELECT ? AS run_id, agent_id, lifecycle FROM agents WHERE run_id=? AND agent_id=?
    `).get(target.coordinationRunId, target.coordinationRunId, agentId), "operator control agent"));
  } else if (target.kind === "run") {
    const run = row(database.prepare(`
      SELECT r.revision, r.project_session_id, s.generation
        FROM runs r JOIN project_sessions s ON s.project_session_id=r.project_session_id
       WHERE r.run_id=? AND r.project_session_id=?
    `).get(target.coordinationRunId, target.projectSessionId), "operator control run");
    revision = integer(run, "revision");
    sessionGeneration = integer(run, "generation");
    runIds = [target.coordinationRunId];
    taskRows = database.prepare(`
      SELECT run_id, task_id, revision, state, owner_agent_id, owner_lease_generation
        FROM tasks WHERE run_id=? ORDER BY task_id
    `).all(target.coordinationRunId) as Row[];
    agentRows = database.prepare(`
      SELECT run_id, agent_id, lifecycle FROM agents WHERE run_id=? ORDER BY agent_id
    `).all(target.coordinationRunId) as Row[];
  } else {
    const session = row(database.prepare(`
      SELECT revision, generation FROM project_sessions WHERE project_session_id=?
    `).get(target.projectSessionId), "operator control session");
    revision = integer(session, "revision");
    sessionGeneration = integer(session, "generation");
    if (sessionGeneration !== target.expectedGeneration) {
      throw new ProjectFabricCoreError("STALE_GENERATION", "operator control session generation changed");
    }
    runIds = (database.prepare(`
      SELECT run_id FROM runs WHERE project_session_id=? ORDER BY run_id
    `).all(target.projectSessionId) as Row[]).map((item) => text(item, "run_id"));
    taskRows = database.prepare(`
      SELECT task.run_id, task.task_id, task.revision, task.state, task.owner_agent_id,
             task.owner_lease_generation
        FROM tasks task JOIN runs run ON run.run_id=task.run_id
       WHERE run.project_session_id=? ORDER BY task.run_id, task.task_id
    `).all(target.projectSessionId) as Row[];
    agentRows = database.prepare(`
      SELECT agent.run_id, agent.agent_id, agent.lifecycle
        FROM agents agent JOIN runs run ON run.run_id=agent.run_id
       WHERE run.project_session_id=? ORDER BY agent.run_id, agent.agent_id
    `).all(target.projectSessionId) as Row[];
  }
  if (revision !== target.expectedRevision) {
    throw new ProjectFabricCoreError("STALE_REVISION", "operator control target revision changed", {
      expected: target.expectedRevision,
      actual: revision,
    });
  }
  return {
    scopeKind: target.kind,
    revision,
    projectSessionId: target.projectSessionId,
    sessionGeneration,
    runs: runIds,
    tasks: taskRows.map((task) => ({
      runId: text(task, "run_id"),
      taskId: text(task, "task_id"),
      revision: integer(task, "revision"),
      state: text(task, "state"),
      ownerAgentId: nullableText(task, "owner_agent_id"),
      ownerLeaseGeneration: integer(task, "owner_lease_generation"),
    })),
    agents: agentRows.map((agent) => ({
      runId: text(agent, "run_id"),
      agentId: text(agent, "agent_id"),
      lifecycle: text(agent, "lifecycle"),
    })),
  };
}

export function controlBinding(
  database: Database.Database,
  target: ResolvedControlTarget,
  activeTurns: readonly ActiveTurn[],
): JsonValue {
  const session = row(database.prepare(`
    SELECT project_id, revision, generation, membership_revision
      FROM project_sessions WHERE project_session_id=?
  `).get(target.projectSessionId), "operator control session binding");
  return {
    projectId: text(session, "project_id"),
    projectSessionId: target.projectSessionId,
    sessionRevision: integer(session, "revision"),
    sessionGeneration: integer(session, "generation"),
    membershipRevision: integer(session, "membership_revision"),
    scopeKind: target.scopeKind,
    targetRevision: target.revision,
    runs: target.runs.map((runId) => {
      const run = row(database.prepare(`
        SELECT revision, dependency_revision, chair_generation, chair_lease_id
          FROM runs WHERE run_id=? AND project_session_id=?
      `).get(runId, target.projectSessionId), "operator control run binding");
      return {
        runId,
        revision: integer(run, "revision"),
        dependencyRevision: integer(run, "dependency_revision"),
        chairGeneration: integer(run, "chair_generation"),
        chairLeaseId: text(run, "chair_lease_id"),
      };
    }),
    tasks: target.tasks.map((task) => ({
      runId: task.runId,
      taskId: task.taskId,
      revision: task.revision,
      state: task.state,
      ownerAgentId: task.ownerAgentId,
      ownerLeaseGeneration: task.ownerLeaseGeneration,
    })),
    turns: activeTurns.map((turn) => ({
      runId: turn.runId,
      agentId: turn.agentId,
      sourceActionId: turn.actionId,
      adapterId: turn.adapterId,
      sourcePayloadHash: turn.sourcePayloadHash,
      providerSessionGeneration: turn.providerSessionGeneration,
      turnLeaseGeneration: turn.turnLeaseGeneration,
      turnId: turn.turnId,
    })),
  } as JsonValue;
}

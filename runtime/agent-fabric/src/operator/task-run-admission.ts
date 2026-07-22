import type Database from "better-sqlite3";

import { ProjectFabricCoreError } from "../project-session/contracts.js";

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

/**
 * Byte-moved from `production-action-ports.ts` (S4g): the task/run operator-admission fences
 * — `assertOperatorTaskRunnable`, `assertTaskOperationAdmitted`, `resolveTaskBindingForActiveWork`,
 * `assertRunAcceptingWork`. Pure read-side preflight checks; no transaction or custody state.
 * Re-exported unchanged from `production-action-ports.ts` so every existing importer of that
 * module keeps working without a call-site change.
 */
export function assertOperatorTaskRunnable(
  database: Database.Database,
  runId: string,
  taskId: string,
): void {
  if (isRow(database.prepare(`
    SELECT 1 FROM operator_control_fences
     WHERE coordination_run_id=? AND task_id=? AND state='paused'
  `).get(runId, taskId))) {
    throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "task is paused by an operator control fence");
  }
}

export function assertTaskOperationAdmitted(
  database: Database.Database,
  runId: string,
  taskId: string,
): void {
  assertRunAcceptingWork(database, runId);
  row(database.prepare("SELECT 1 FROM tasks WHERE run_id=? AND task_id=?").get(runId, taskId), "task operation target");
  assertOperatorTaskRunnable(database, runId, taskId);
}

export function resolveTaskBindingForActiveWork(
  database: Database.Database,
  runId: string,
  actorAgentId: string,
  taskId: string | undefined,
): string | undefined {
  if (taskId !== undefined) {
    assertTaskOperationAdmitted(database, runId, taskId);
    return taskId;
  }
  assertRunAcceptingWork(database, runId);
  const activeTasks = database.prepare(`
    SELECT task.task_id FROM tasks task
     WHERE task.run_id=? AND task.state NOT IN ('complete','cancelled','degraded')
       AND (task.owner_agent_id=? OR EXISTS (
         SELECT 1 FROM task_participants participant
          WHERE participant.run_id=task.run_id AND participant.task_id=task.task_id
            AND participant.agent_id=?
       ))
     ORDER BY task.task_id
     LIMIT 2
  `).all(runId, actorAgentId, actorAgentId).filter(isRow);
  if (activeTasks.length > 1) {
    throw new ProjectFabricCoreError(
      "LIFECYCLE_PRECONDITION_FAILED",
      "ambiguous active task work requires an exact task ID",
    );
  }
  const inferred = activeTasks[0];
  if (inferred === undefined) return undefined;
  const inferredTaskId = text(inferred, "task_id");
  assertTaskOperationAdmitted(database, runId, inferredTaskId);
  return inferredTaskId;
}

export function assertRunAcceptingWork(database: Database.Database, runId: string): void {
  const value = row(database.prepare(`
    SELECT session.state AS session_state, session.origin_kind,
           run.lifecycle_state AS run_state
      FROM runs run JOIN project_sessions session ON session.project_session_id=run.project_session_id
     WHERE run.run_id=?
  `).get(runId), "coordination run lifecycle");
  const sessionState = text(value, "session_state");
  const runState = text(value, "run_state");
  const active = ["active", "visibility_degraded"].includes(sessionState) &&
    ["active", "visibility_degraded"].includes(runState);
  if (!active) {
    throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "project session is not accepting new work");
  }
  const epoch = database.prepare(`
    SELECT state FROM daemon_runtime_epochs ORDER BY instance_generation DESC LIMIT 1
  `).get();
  if (isRow(epoch) && epoch.state !== "running") {
    throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "daemon is not accepting new work");
  }
  if (isRow(database.prepare(`
    SELECT 1 FROM delivery_freezes WHERE run_id=? AND reason LIKE 'operator-pause:%'
  `).get(runId))) {
    throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "coordination run is paused by the operator");
  }
}

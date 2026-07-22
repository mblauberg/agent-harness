import type { DeclaredRunProgress, DeclaredRunTaskStateCounts } from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import { currentRunPlanBinding } from "../project-session/run-plan-store.js";
import { integer, row, text } from "../project-session/store-support.js";

/** Project server-scoped task counts without deriving any undeclared total. */
export function projectDeclaredRunProgress(
  database: Database.Database,
  runId: string,
): DeclaredRunProgress {
  const counts: DeclaredRunTaskStateCounts = {
    blocked: 0,
    ready: 0,
    active: 0,
    complete: 0,
    cancelled: 0,
    degraded: 0,
  };
  const values = database.prepare(`
    SELECT state, COUNT(*) AS tasks FROM tasks WHERE run_id=? GROUP BY state
  `).all(runId);
  for (const value of values) {
    const stored = row(value, "run task-state count");
    const state = text(stored, "state");
    if (!Object.hasOwn(counts, state)) {
      return { plan: "unknown", reason: `unrecognised task state: ${state}` };
    }
    counts[state as keyof DeclaredRunTaskStateCounts] = integer(stored, "tasks");
  }
  const binding = currentRunPlanBinding(database, runId);
  if (binding?.declaredTaskDenominator === null || binding === null) {
    return { plan: "open", counts };
  }
  const classifiedTasks = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (classifiedTasks > binding.declaredTaskDenominator) {
    return {
      plan: "unknown",
      reason: `task count ${String(classifiedTasks)} exceeds plan r${String(binding.planRevision)} denominator ${String(binding.declaredTaskDenominator)}`,
    };
  }
  return {
    plan: "finite",
    planRevision: binding.planRevision,
    counts,
    declaredTaskDenominator: binding.declaredTaskDenominator,
  };
}

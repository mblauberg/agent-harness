import { closeSync, existsSync, lstatSync, openSync, unlinkSync } from "node:fs";

import type Database from "better-sqlite3";

export type PersistenceInvariantErrorCode =
  | "PERSISTENCE_INVARIANT_VIOLATION"
  | "PERSISTENCE_QUICK_CHECK_FAILED"
  | "PERSISTENCE_FOREIGN_KEY_CHECK_FAILED"
  | "PERSISTENCE_MARKER_UNSAFE";

export class PersistenceInvariantError extends Error {
  readonly code: PersistenceInvariantErrorCode;

  constructor(code: PersistenceInvariantErrorCode, message: string) {
    super(message);
    this.name = "PersistenceInvariantError";
    this.code = code;
  }
}

const PREFLIGHTS = [
  ["agents.lifecycle", "SELECT agent_id AS id FROM agents WHERE lifecycle NOT IN ('ready','completion-ready','suspended','context-unreconciled','archived') LIMIT 1"],
  ["tasks.state", "SELECT task_id AS id FROM tasks WHERE state NOT IN ('blocked','ready','active','complete','cancelled','degraded') LIMIT 1"],
  ["deliveries.state", "SELECT delivery_id AS id FROM deliveries WHERE state NOT IN ('ready','claimed','acknowledged','abandoned','expired') LIMIT 1"],
  ["leases.kind/status/generation", "SELECT lease_id AS id FROM leases WHERE kind <> 'write' OR status NOT IN ('active','quarantined','released') OR generation < 1 LIMIT 1"],
  ["provider_actions.status/counts/generations", "SELECT action_id AS id FROM provider_actions WHERE status NOT IN ('prepared','dispatched','accepted','terminal','ambiguous','quarantined') OR execution_count < 0 OR effect_count < 0 OR idempotency_proven NOT IN (0,1) OR (provider_session_generation IS NOT NULL AND provider_session_generation < 1) OR (turn_lease_generation IS NOT NULL AND turn_lease_generation < 1) LIMIT 1"],
  ["task/delivery numeric values", "SELECT task_id AS id FROM tasks WHERE revision < 0 OR owner_lease_generation < 0 UNION ALL SELECT delivery_id FROM deliveries WHERE attempt_count < 0 OR mailbox_sequence < 1 LIMIT 1"],
  ["workflow states", "SELECT run_id || ':' || scope AS id FROM barriers WHERE state <> 'closed' UNION ALL SELECT run_id || ':' || team_id FROM teams WHERE state NOT IN ('active','frozen','barrier-closed') OR generation < 1 OR depth < 1 UNION ALL SELECT run_id || ':' || budget_id FROM budgets WHERE state NOT IN ('active','usage-unknown','released') UNION ALL SELECT run_id || ':' || task_id || ':' || check_id FROM task_objective_checks WHERE status NOT IN ('pending','pass','fail') UNION ALL SELECT run_id || ':' || task_id || ':' || gate_id FROM task_human_gates WHERE status NOT IN ('pending','approved','rejected') LIMIT 1"],
  ["critical booleans/generations", "SELECT authority_id || ':' || unit_key AS id FROM authority_budget WHERE usage_unknown NOT IN (0,1) UNION ALL SELECT run_id || ':' || agent_id FROM capabilities WHERE principal_generation < 1 UNION ALL SELECT message_id FROM messages WHERE requires_ack NOT IN (0,1) UNION ALL SELECT run_id || ':' || agent_id FROM provider_state WHERE provider_session_generation < 1 UNION ALL SELECT run_id || ':' || budget_id || ':' || unit_key FROM budget_dimensions WHERE direct_usage_unknown NOT IN (0,1) OR usage_unknown NOT IN (0,1) OR granted < 0 OR reserved < 0 OR consumed < 0 OR reserved > granted OR consumed > granted LIMIT 1"],
  ["same-run authorities", "SELECT a.authority_id AS id FROM authorities a WHERE a.parent_authority_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM authorities p WHERE p.authority_id=a.parent_authority_id AND p.run_id=a.run_id) LIMIT 1"],
  ["same-run agents", "SELECT a.agent_id AS id FROM agents a WHERE NOT EXISTS (SELECT 1 FROM authorities u WHERE u.authority_id=a.authority_id AND u.run_id=a.run_id) OR (a.parent_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents p WHERE p.agent_id=a.parent_agent_id AND p.run_id=a.run_id)) LIMIT 1"],
  ["same-run tasks", "SELECT t.task_id AS id FROM tasks t WHERE NOT EXISTS (SELECT 1 FROM authorities a WHERE a.authority_id=t.authority_id AND a.run_id=t.run_id) OR (t.owner_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=t.owner_agent_id AND a.run_id=t.run_id)) OR NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=t.created_by AND a.run_id=t.run_id) LIMIT 1"],
  ["same-run messaging", "SELECT m.message_id AS id FROM messages m WHERE NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=m.sender_id AND a.run_id=m.run_id) OR (m.reply_to_message_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM messages p WHERE p.message_id=m.reply_to_message_id AND p.run_id=m.run_id)) UNION ALL SELECT d.delivery_id FROM deliveries d WHERE NOT EXISTS (SELECT 1 FROM messages m WHERE m.message_id=d.message_id AND m.run_id=d.run_id) OR NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=d.recipient_id AND a.run_id=d.run_id) LIMIT 1"],
  ["same-run operational references", "SELECT l.lease_id AS id FROM leases l WHERE NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=l.holder_agent_id AND a.run_id=l.run_id) UNION ALL SELECT e.event_id FROM events e WHERE e.actor_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=e.actor_agent_id AND a.run_id=e.run_id) UNION ALL SELECT p.action_id FROM provider_actions p WHERE p.operation NOT IN ('spawn','attach') AND p.target_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.agent_id=p.target_agent_id AND a.run_id=p.run_id) LIMIT 1"],
] as const;

export function preflightAdditiveInvariants(database: Database.Database): void {
  for (const [name, sql] of PREFLIGHTS) {
    const violation = database.prepare(sql).get() as { id?: unknown } | undefined;
    if (violation !== undefined) {
      throw new PersistenceInvariantError(
        "PERSISTENCE_INVARIANT_VIOLATION",
        `cannot install additive invariant ${name}; existing row ${String(violation.id ?? "unknown")} violates it`,
      );
    }
  }
}

export function assertDatabaseIntegrity(database: Database.Database): void {
  const quick = database.prepare("PRAGMA quick_check(1)").get() as Record<string, unknown> | undefined;
  const result = quick === undefined ? undefined : Object.values(quick)[0];
  if (result !== "ok") {
    throw new PersistenceInvariantError("PERSISTENCE_QUICK_CHECK_FAILED", `SQLite quick_check failed: ${String(result)}`);
  }
  const foreignKeyViolation = database.prepare("PRAGMA foreign_key_check").get() as Record<string, unknown> | undefined;
  if (foreignKeyViolation !== undefined) {
    throw new PersistenceInvariantError(
      "PERSISTENCE_FOREIGN_KEY_CHECK_FAILED",
      `SQLite foreign_key_check failed for table ${String(foreignKeyViolation.table ?? "unknown")}`,
    );
  }
}

export function prepareUncleanMarker(databasePath: string): { markerPath: string; wasUnclean: boolean } {
  const markerPath = `${databasePath}.unclean`;
  const wasUnclean = existsSync(markerPath);
  if (wasUnclean) {
    const stat = lstatSync(markerPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new PersistenceInvariantError("PERSISTENCE_MARKER_UNSAFE", `unclean marker is not a regular file: ${markerPath}`);
    }
  } else {
    closeSync(openSync(markerPath, "wx", 0o600));
  }
  return { markerPath, wasUnclean };
}

export function removeUncleanMarker(markerPath: string): void {
  try {
    unlinkSync(markerPath);
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

export function runOpenMaintenance(database: Database.Database): void {
  database.pragma("optimize = 0x10002");
}

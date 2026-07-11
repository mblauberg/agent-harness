import type Database from "better-sqlite3";

type Row = Record<string, unknown>;

export class ProviderBridgeCustodyPreflightError extends Error {
  readonly code = "PROVIDER_BRIDGE_CUSTODY_MIGRATION_PREFLIGHT_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProviderBridgeCustodyPreflightError";
  }
}

export function preflightProviderBridgeCustody(database: Database.Database): void {
  const observableLegacyLaunch = database.prepare(`
    SELECT c.project_session_id, c.provider_adapter_id, c.provider_action_id, p.status
      FROM project_session_launch_custody c
      JOIN provider_actions p
        ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
     WHERE p.status IN ('dispatched','accepted','ambiguous')
     ORDER BY c.project_session_id, c.custody_attempt_generation
     LIMIT 1
  `).get() as Row | undefined;
  if (observableLegacyLaunch !== undefined) {
    throw new ProviderBridgeCustodyPreflightError(
      `legacy launch custody lacks a provider-session challenge: ${String(observableLegacyLaunch.project_session_id)}/${String(observableLegacyLaunch.provider_adapter_id)}/${String(observableLegacyLaunch.provider_action_id)} (${String(observableLegacyLaunch.status)})`,
    );
  }
  const unresolved = database.prepare(`
    SELECT run_id, action_id, status
      FROM provider_lifecycle_intents
     WHERE status <> 'finalized'
     ORDER BY run_id, action_id
     LIMIT 1
  `).get() as Row | undefined;
  if (unresolved !== undefined) {
    throw new ProviderBridgeCustodyPreflightError(
      `legacy provider lifecycle intent is unresolved: ${String(unresolved.run_id)}/${String(unresolved.action_id)} (${String(unresolved.status)})`,
    );
  }
}

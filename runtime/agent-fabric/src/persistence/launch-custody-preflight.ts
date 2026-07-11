import type Database from "better-sqlite3";

type Row = Record<string, unknown>;

export class LaunchCustodyPreflightError extends Error {
  readonly code = "LAUNCH_CUSTODY_MIGRATION_PREFLIGHT_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "LaunchCustodyPreflightError";
  }
}

export function preflightLaunchCustody(database: Database.Database): void {
  const duplicate = database.prepare(`
    SELECT adapter_id, action_id, COUNT(*) AS count
      FROM provider_actions
     GROUP BY adapter_id, action_id
    HAVING COUNT(*) > 1
     ORDER BY adapter_id, action_id
     LIMIT 1
  `).get() as Row | undefined;
  if (duplicate !== undefined) {
    throw new LaunchCustodyPreflightError(
      `provider action identity is reused across runs: ${String(duplicate.adapter_id)}/${String(duplicate.action_id)}`,
    );
  }
}

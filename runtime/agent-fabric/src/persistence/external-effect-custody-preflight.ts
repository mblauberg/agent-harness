import type Database from "better-sqlite3";

type LegacyEffectRow = {
  custody_id: string;
  kind: string | null;
  state: string;
};

export class ExternalEffectCustodyPreflightError extends Error {
  readonly code = "EXTERNAL_EFFECT_CUSTODY_MIGRATION_PREFLIGHT_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "ExternalEffectCustodyPreflightError";
  }
}

export function preflightExternalEffectCustody(database: Database.Database): void {
  const legacy = database.prepare(`
    SELECT custody_id,
           CASE WHEN json_valid(intent_json)=1
             THEN json_extract(intent_json, '$.kind') ELSE NULL END AS kind,
           state
      FROM operator_effect_custody
     WHERE json_valid(intent_json)=0
        OR CASE WHEN json_valid(intent_json)=1
             THEN json_extract(intent_json, '$.kind') ELSE NULL END
           IN ('registered-external-effect','promotion')
     ORDER BY custody_id
     LIMIT 1
  `).get() as LegacyEffectRow | undefined;
  if (legacy !== undefined) {
    throw new ExternalEffectCustodyPreflightError(
      `legacy external-effect custody cannot be inferred: ${legacy.custody_id} (${legacy.kind ?? "invalid-json"}/${legacy.state})`,
    );
  }
}

import type Database from "better-sqlite3";

type LegacyGitRow = { custody_id: string; state: string; kind: string | null };

export class TypedGitMigrationPreflightError extends Error {
  readonly code = "TYPED_GIT_MIGRATION_PREFLIGHT_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "TypedGitMigrationPreflightError";
  }
}

/** Legacy coarse Git custody has no exact grant, operation ID, recipe, or common-dir owner to infer. */
export function preflightTypedGitCustody(database: Database.Database): void {
  const legacy = database.prepare(`
    SELECT custody_id,state,
           CASE WHEN json_valid(intent_json)=1 THEN json_extract(intent_json,'$.kind') ELSE NULL END AS kind
      FROM operator_effect_custody
     WHERE operation='git'
        OR (json_valid(intent_json)=1 AND json_extract(intent_json,'$.kind')='git')
     ORDER BY custody_id LIMIT 1
  `).get() as LegacyGitRow | undefined;
  if (legacy !== undefined) {
    throw new TypedGitMigrationPreflightError(
      `legacy Git custody cannot be inferred: ${legacy.custody_id} (${legacy.kind ?? "invalid-json"}/${legacy.state})`,
    );
  }
  const crossedGate = database.prepare(`
    SELECT association.gate_id,association.operation_id
      FROM scoped_gate_operations association
      JOIN scoped_gates gate ON gate.gate_id=association.gate_id
      JOIN operation_admissions admission ON admission.operation_id=association.operation_id
     WHERE gate.project_session_id<>admission.project_session_id
        OR gate.coordination_run_id<>admission.coordination_run_id
     ORDER BY association.gate_id,association.operation_id LIMIT 1
  `).get() as { gate_id: string; operation_id: string } | undefined;
  if (crossedGate !== undefined) {
    throw new TypedGitMigrationPreflightError(
      `cross-session operation gate cannot be preserved: ${crossedGate.gate_id}/${crossedGate.operation_id}`,
    );
  }
}

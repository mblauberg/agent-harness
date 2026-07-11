import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

import type Database from "better-sqlite3";

type Row = Record<string, unknown>;

export class ProjectSessionPreflightError extends Error {
  readonly code = "PROJECT_SESSION_MIGRATION_PREFLIGHT_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProjectSessionPreflightError";
  }
}

function text(row: Row, field: string): string {
  const value = row[field];
  if (typeof value !== "string") throw new ProjectSessionPreflightError(`${field} is not text`);
  return value;
}

function integer(row: Row, field: string): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new ProjectSessionPreflightError(`${field} is not an integer`);
  }
  return value;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digest(value: string): string {
  return `sha256:${hash(value)}`;
}

function artifact(path: string, value: string): string {
  return JSON.stringify({ path, digest: digest(value) });
}

type LegacyRun = {
  runId: string;
  chairAgentId: string;
  canonicalRoot: string;
  projectId: string;
  projectSessionId: string;
  authorityId: string;
  authorityRef: string;
  budgetRef: string;
  manifestRef: string;
  launchPacketPath: string;
  launchPacketDigest: string;
  importState: "closed" | "recovery_required";
  terminalPathJson: string | null;
  dimensions: Map<string, { granted: number; reserved: number; consumed: number; unknown: boolean }>;
};

function inspectLegacyRun(database: Database.Database, row: Row): LegacyRun {
  const runId = text(row, "run_id");
  const chairAgentId = text(row, "chair_agent_id");
  const workspaceRoot = text(row, "workspace_root");
  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(workspaceRoot);
  } catch (error: unknown) {
    throw new ProjectSessionPreflightError(
      `legacy run ${runId} workspace root cannot be canonicalised: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const authorities = database.prepare(`
    SELECT authority_id, authority_hash
      FROM authorities
     WHERE run_id = ? AND parent_authority_id IS NULL
     ORDER BY authority_id
  `).all(runId) as Row[];
  if (authorities.length !== 1) {
    throw new ProjectSessionPreflightError(`legacy run ${runId} must have exactly one root authority`);
  }
  const authority = authorities[0];
  if (authority === undefined) throw new ProjectSessionPreflightError(`legacy run ${runId} root authority is unavailable`);
  const authorityId = text(authority, "authority_id");
  const storedHash = text(authority, "authority_hash");
  const authorityRef = /^sha256:[0-9a-f]{64}$/u.test(storedHash)
    ? storedHash
    : `sha256:${storedHash}`;

  const dimensions = new Map<string, { granted: number; reserved: number; consumed: number; unknown: boolean }>();
  for (const dimension of database.prepare(`
    SELECT unit_key, granted, reserved, consumed, usage_unknown
      FROM authority_budget WHERE authority_id = ? ORDER BY unit_key
  `).all(authorityId) as Row[]) {
    const unit = text(dimension, "unit_key");
    const granted = integer(dimension, "granted");
    const reserved = integer(dimension, "reserved");
    const consumed = integer(dimension, "consumed");
    const unknown = integer(dimension, "usage_unknown") === 1;
    if (granted < 0 || reserved < 0 || consumed < 0 || reserved > granted || consumed > granted) {
      throw new ProjectSessionPreflightError(`legacy run ${runId} budget ${unit} is inconsistent`);
    }
    dimensions.set(unit, { granted, reserved, consumed, unknown });
  }

  const projectId = `prj_${hash(canonicalRoot).slice(0, 32)}`;
  const projectSessionId = `psl_${hash(`0004\0${runId}\0${canonicalRoot}`).slice(0, 32)}`;
  const manifestValue = JSON.stringify({ runId, canonicalRoot, authorityRef, dimensions: [...dimensions] });
  const launchValue = JSON.stringify({ runId, projectId, projectSessionId, authorityRef });
  const hasClosedBarrier = database.prepare(`
    SELECT 1 FROM barriers WHERE run_id = ? AND scope = 'run' AND stage_id = '' AND state = 'closed'
  `).get(runId) !== undefined;
  const hasUnresolvedState = database.prepare(`
    SELECT 1 FROM tasks WHERE run_id = ? AND state NOT IN ('complete','cancelled','degraded') LIMIT 1
  `).get(runId) !== undefined || database.prepare(`
    SELECT 1 FROM task_human_gates WHERE run_id = ? LIMIT 1
  `).get(runId) !== undefined;
  const importState = hasClosedBarrier && !hasUnresolvedState ? "closed" : "recovery_required";

  return {
    runId,
    chairAgentId,
    canonicalRoot,
    projectId,
    projectSessionId,
    authorityId,
    authorityRef,
    budgetRef: `legacy-authority:${authorityId}`,
    manifestRef: artifact(`.agent-run/migrations/0004/${runId}-manifest.json`, manifestValue),
    launchPacketPath: `.agent-run/migrations/0004/${runId}-launch.json`,
    launchPacketDigest: digest(launchValue),
    importState,
    terminalPathJson: importState === "closed"
      ? JSON.stringify({ kind: "accepted", acceptanceRef: digest(`legacy-closed\0${runId}`) })
      : null,
    dimensions,
  };
}

export function preflightProjectSessionOperations(database: Database.Database): void {
  const runs = (database.prepare(`
    SELECT run_id, chair_agent_id, workspace_root FROM runs ORDER BY run_id
  `).all() as Row[]).map((row) => inspectLegacyRun(database, row));

  const projectIdentity = new Map<string, string>();
  const sessionIdentity = new Set<string>();
  for (const run of runs) {
    const existingRoot = projectIdentity.get(run.projectId);
    if (existingRoot !== undefined && existingRoot !== run.canonicalRoot) {
      throw new ProjectSessionPreflightError(`project identity collision for ${run.projectId}`);
    }
    projectIdentity.set(run.projectId, run.canonicalRoot);
    if (sessionIdentity.has(run.projectSessionId)) {
      throw new ProjectSessionPreflightError(`project-session identity collision for ${run.projectSessionId}`);
    }
    sessionIdentity.add(run.projectSessionId);
  }

  database.exec(`
    DROP TABLE IF EXISTS temp.migration_0004_legacy_import;
    DROP TABLE IF EXISTS temp.migration_0004_project_dimensions;
    DROP TABLE IF EXISTS temp.migration_0004_scope_dimensions;
    DROP TABLE IF EXISTS temp.migration_0004_legacy_gates;
    CREATE TEMP TABLE migration_0004_legacy_import(
      run_id TEXT PRIMARY KEY,
      chair_agent_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_session_id TEXT NOT NULL UNIQUE,
      session_scope_id TEXT NOT NULL UNIQUE,
      run_scope_id TEXT NOT NULL UNIQUE,
      canonical_root TEXT NOT NULL,
      authority_ref TEXT NOT NULL,
      budget_ref TEXT NOT NULL,
      manifest_ref TEXT NOT NULL,
      launch_packet_path TEXT NOT NULL,
      launch_packet_digest TEXT NOT NULL,
      import_state TEXT NOT NULL,
      terminal_path_json TEXT
    );
    CREATE TEMP TABLE migration_0004_project_dimensions(
      project_id TEXT NOT NULL,
      unit_key TEXT NOT NULL,
      limit_value INTEGER NOT NULL,
      used INTEGER NOT NULL,
      reserved INTEGER NOT NULL,
      usage_unknown INTEGER NOT NULL,
      PRIMARY KEY(project_id, unit_key)
    );
    CREATE TEMP TABLE migration_0004_scope_dimensions(
      scope_id TEXT NOT NULL,
      unit_key TEXT NOT NULL,
      limit_value INTEGER NOT NULL,
      used INTEGER NOT NULL,
      reserved INTEGER NOT NULL,
      usage_unknown INTEGER NOT NULL,
      PRIMARY KEY(scope_id, unit_key)
    );
    CREATE TEMP TABLE migration_0004_legacy_gates(
      run_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      legacy_gate_id TEXT NOT NULL,
      gate_id TEXT NOT NULL UNIQUE,
      legacy_status TEXT NOT NULL,
      legacy_evidence TEXT,
      PRIMARY KEY(run_id, task_id, legacy_gate_id)
    );
  `);

  const insertRun = database.prepare(`
    INSERT INTO migration_0004_legacy_import(
      run_id, chair_agent_id, project_id, project_session_id, session_scope_id, run_scope_id, canonical_root,
      authority_ref, budget_ref, manifest_ref, launch_packet_path,
      launch_packet_digest, import_state, terminal_path_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertScopeDimension = database.prepare(`
    INSERT INTO migration_0004_scope_dimensions(scope_id, unit_key, limit_value, used, reserved, usage_unknown)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const run of runs) {
    insertRun.run(
      run.runId,
      run.chairAgentId,
      run.projectId,
      run.projectSessionId,
      `rss_${hash(run.projectSessionId).slice(0, 32)}`,
      `rsr_${hash(run.runId).slice(0, 32)}`,
      run.canonicalRoot,
      run.authorityRef,
      run.budgetRef,
      run.manifestRef,
      run.launchPacketPath,
      run.launchPacketDigest,
      run.importState,
      run.terminalPathJson,
    );
    for (const [unit, value] of run.dimensions) {
      for (const scopeId of [
        `rss_${hash(run.projectSessionId).slice(0, 32)}`,
        `rsr_${hash(run.runId).slice(0, 32)}`,
      ]) {
        insertScopeDimension.run(scopeId, unit, value.granted, value.consumed, value.reserved, value.unknown ? 1 : 0);
      }
    }
    const insertLegacyGate = database.prepare(`
      INSERT INTO migration_0004_legacy_gates(
        run_id, task_id, legacy_gate_id, gate_id, legacy_status, legacy_evidence
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const gate of database.prepare(`
      SELECT task_id, gate_id, status, evidence
        FROM task_human_gates WHERE run_id = ? ORDER BY task_id, gate_id
    `).all(run.runId) as Row[]) {
      const taskId = text(gate, "task_id");
      const legacyGateId = text(gate, "gate_id");
      insertLegacyGate.run(
        run.runId,
        taskId,
        legacyGateId,
        `gate_${hash(`0004\0${run.runId}\0${taskId}\0${legacyGateId}`).slice(0, 32)}`,
        text(gate, "status"),
        gate.evidence === null ? null : text(gate, "evidence"),
      );
    }
  }

  const insertProjectDimension = database.prepare(`
    INSERT INTO migration_0004_project_dimensions(project_id, unit_key, limit_value, used, reserved, usage_unknown)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const grouped = new Map<string, LegacyRun[]>();
  for (const run of runs) grouped.set(run.projectId, [...(grouped.get(run.projectId) ?? []), run]);
  for (const [projectId, projectRuns] of grouped) {
    const units = new Set(projectRuns.flatMap((run) => [...run.dimensions.keys()]));
    for (const unit of units) {
      const values = projectRuns.map((run) => run.dimensions.get(unit));
      const grants = values.map((value) => value?.granted ?? 0);
      const used = values.reduce((sum, value) => sum + (value?.consumed ?? 0), 0);
      const reserved = values.reduce((sum, value) => sum + (value?.reserved ?? 0), 0);
      const common = Math.min(...grants);
      const conflict = new Set(grants).size !== 1 || values.some((value) => value === undefined || value.unknown);
      const usageUnknown = conflict || used + reserved > common;
      insertProjectDimension.run(projectId, unit, Math.max(common, used + reserved), used, reserved, usageUnknown ? 1 : 0);
    }
  }
}

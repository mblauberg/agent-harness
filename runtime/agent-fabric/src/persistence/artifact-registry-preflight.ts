import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";

import type Database from "better-sqlite3";

export class ArtifactRegistryMigrationPreflightError extends Error {
  readonly code = "ARTIFACT_REGISTRY_MIGRATION_PREFLIGHT_FAILED" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ArtifactRegistryMigrationPreflightError";
  }
}

type RunRow = {
  run_id: string;
  project_session_id: string;
  project_id: string;
  canonical_root: string;
  project_run_directory: string | null;
};

type StagedArtifact = {
  artifactId: string;
  projectId: string;
  projectSessionId: string | null;
  runId: string | null;
  taskId: string | null;
  publisherKind: "agent" | "fabric" | "migration";
  publisherRef: string;
  publisherAgentId: string | null;
  sourceKind: "project-file" | "run-file" | "git-private-diff";
  evidenceKind: "artifact" | "receipt";
  relativePath: string;
  digest: string;
  registryState: "active" | "quarantined";
  quarantineReason: string | null;
  createdAt: number;
};

function fail(message: string, cause?: unknown): never {
  throw new ArtifactRegistryMigrationPreflightError(message, cause === undefined ? undefined : { cause });
}

function forwardSlashes(value: string): string {
  return value.replaceAll(sep, "/");
}

function contains(parent: string, child: string): boolean {
  const result = posix.relative(parent, child);
  return result === "" || (result !== ".." && !result.startsWith("../") && !posix.isAbsolute(result));
}

function canonicalRelativePath(value: string): boolean {
  const parts = value.split("/");
  return value.length > 0 && value.length <= 4096 && !isAbsolute(value) && !/^[A-Za-z]:/u.test(value) &&
    !value.includes("\\") && !value.includes("\0") && !/[*?\[\]{}]/u.test(value) &&
    parts.every((part) => part !== "" && part !== "." && part !== "..");
}

function sensitivePath(value: string): boolean {
  const segments = value.toLowerCase().split("/");
  return segments.some((segment) => [
    ".git", ".hg", ".svn", ".ssh", ".aws", ".gnupg", "credentials", "secrets",
  ].includes(segment)) || segments.some((segment) =>
    segment === ".env" || segment.startsWith(".env.") ||
    /^(?:id_rsa|id_ed25519|credentials\.json|service-account\.json)$/u.test(segment)
  );
}

function normalizedDigest(value: string): { digest: string; valid: boolean } {
  if (/^[a-f0-9]{64}$/u.test(value)) return { digest: `sha256:${value}`, valid: true };
  if (/^sha256:[a-f0-9]{64}$/u.test(value)) return { digest: value, valid: true };
  return {
    digest: `sha256:${createHash("sha256").update(`invalid-legacy-digest:${value}`).digest("hex")}`,
    valid: false,
  };
}

function deterministicId(input: {
  projectId: string;
  projectSessionId: string | null;
  runId: string | null;
  sourceKind: string;
  relativePath: string;
  digest: string;
}): string {
  const canonical = JSON.stringify({
    projectId: input.projectId,
    projectSessionId: input.projectSessionId,
    runId: input.runId,
    sourceKind: input.sourceKind,
    path: input.relativePath,
    digest: input.digest,
  });
  return `artifact_${createHash("sha256").update(canonical).digest("hex").slice(0, 24)}`;
}

function quarantinedBindingId(input: {
  intakeId: string;
  intakeRevision: number;
  projectId: string;
  projectSessionId: string | null;
  runId: string | null;
  relativePath: string;
  digest: string;
  reason: string;
}): string {
  return `artifact_q_${createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 24)}`;
}

function normalizeRunRoot(row: RunRow): { directory: string | null; basis: "project-relative" | "none" } {
  if (row.project_run_directory === null) return { directory: null, basis: "none" };
  let canonicalProject: string;
  try {
    canonicalProject = forwardSlashes(realpathSync.native(row.canonical_root));
  } catch (error: unknown) {
    fail(`project ${row.project_id} root cannot be canonicalised`, error);
  }
  if (canonicalProject !== forwardSlashes(resolve(row.canonical_root))) {
    fail(`project ${row.project_id} root is symlinked or non-canonical`);
  }

  if (!isAbsolute(row.project_run_directory)) {
    if (row.project_run_directory !== "." && !canonicalRelativePath(forwardSlashes(row.project_run_directory))) {
      fail(`run ${row.run_id} has a non-canonical relative artifact root`);
    }
    const absolute = forwardSlashes(resolve(canonicalProject, row.project_run_directory));
    if (!contains(canonicalProject, absolute)) fail(`run ${row.run_id} artifact root escapes its project`);
    if (existsSync(absolute)) {
      const actual = forwardSlashes(realpathSync.native(absolute));
      if (actual !== absolute || !contains(canonicalProject, actual)) {
        fail(`run ${row.run_id} artifact root is symlinked or outside its project`);
      }
    }
    return { directory: row.project_run_directory === "." ? "." : forwardSlashes(row.project_run_directory), basis: "project-relative" };
  }

  let canonicalRun: string;
  try {
    canonicalRun = forwardSlashes(realpathSync.native(row.project_run_directory));
  } catch (error: unknown) {
    fail(`run ${row.run_id} legacy artifact root cannot be canonicalised`, error);
  }
  if (canonicalRun !== forwardSlashes(resolve(row.project_run_directory)) || !contains(canonicalProject, canonicalRun)) {
    fail(`run ${row.run_id} legacy artifact root is symlinked or outside its project`);
  }
  const projectRelative = forwardSlashes(relative(canonicalProject, canonicalRun));
  if (projectRelative === "") return { directory: ".", basis: "project-relative" };
  if (!canonicalRelativePath(projectRelative)) fail(`run ${row.run_id} artifact root cannot be represented project-relative`);
  return { directory: projectRelative, basis: "project-relative" };
}

function authorityCovers(database: Database.Database, run: RunRow, agentId: string, relativePath: string): boolean {
  const row = database.prepare(`
    SELECT authority.authority_json
      FROM agents agent
      JOIN authorities authority ON authority.authority_id=agent.authority_id
     WHERE agent.run_id=? AND agent.agent_id=?
  `).get(run.run_id, agentId) as { authority_json?: unknown } | undefined;
  if (typeof row?.authority_json !== "string") return false;
  try {
    const value: unknown = JSON.parse(row.authority_json);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const paths = Reflect.get(value, "artifactPaths");
    if (!Array.isArray(paths) || !paths.every((path) => typeof path === "string")) return false;
    const target = forwardSlashes(resolve(run.canonical_root, relativePath));
    return paths.some((path) => contains(forwardSlashes(resolve(run.canonical_root, path)), target));
  } catch {
    return false;
  }
}

function stageRuns(database: Database.Database): Map<string, RunRow & { normalizedRoot: string | null }> {
  database.exec(`
    DROP TABLE IF EXISTS temp.migration_0010_run_roots;
    CREATE TEMP TABLE migration_0010_run_roots(
      run_id TEXT PRIMARY KEY,
      project_run_directory TEXT,
      project_run_directory_basis TEXT NOT NULL
    );
  `);
  const rows = database.prepare(`
    SELECT run.run_id, run.project_session_id, session.project_id, project.canonical_root,
           run.project_run_directory
      FROM runs run
      JOIN project_sessions session ON session.project_session_id=run.project_session_id
      JOIN projects project ON project.project_id=session.project_id
  `).all() as RunRow[];
  const count = (database.prepare("SELECT COUNT(*) AS count FROM runs").get() as { count: number }).count;
  if (rows.length !== count) fail("every run must have an exact project session before artifact migration");
  const insert = database.prepare(`
    INSERT INTO migration_0010_run_roots(run_id, project_run_directory, project_run_directory_basis)
    VALUES (?, ?, ?)
  `);
  const result = new Map<string, RunRow & { normalizedRoot: string | null }>();
  for (const row of rows) {
    const normalized = normalizeRunRoot(row);
    insert.run(row.run_id, normalized.directory, normalized.basis);
    result.set(row.run_id, { ...row, normalizedRoot: normalized.directory });
  }
  return result;
}

function stageArtifacts(database: Database.Database, runs: ReadonlyMap<string, RunRow & { normalizedRoot: string | null }>): void {
  database.exec(`
    DROP TABLE IF EXISTS temp.migration_0010_artifacts;
    CREATE TEMP TABLE migration_0010_artifacts(
      artifact_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_session_id TEXT,
      run_id TEXT,
      task_id TEXT,
      publisher_kind TEXT NOT NULL,
      publisher_ref TEXT NOT NULL,
      publisher_agent_id TEXT,
      source_kind TEXT NOT NULL,
      evidence_kind TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      registry_state TEXT NOT NULL,
      quarantine_reason TEXT,
      revision INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  const staged: StagedArtifact[] = [];
  const old = database.prepare(`
    SELECT artifact_id, run_id, task_id, publisher_agent_id, relative_path, sha256, created_at
      FROM artifacts ORDER BY artifact_id
  `).all() as Array<{
    artifact_id: string;
    run_id: string;
    task_id: string | null;
    publisher_agent_id: string;
    relative_path: string;
    sha256: string;
    created_at: number;
  }>;
  for (const artifact of old) {
    const run = runs.get(artifact.run_id);
    if (run === undefined) fail(`artifact ${artifact.artifact_id} has no scoped run`);
    const digest = normalizedDigest(artifact.sha256);
    const pathValid = canonicalRelativePath(artifact.relative_path);
    const sourceKind = run.normalizedRoot === "." ? "project-file" : "run-file";
    const authorityValid = sourceKind === "run-file" ||
      (pathValid && authorityCovers(database, run, artifact.publisher_agent_id, artifact.relative_path));
    const reasons = [
      ...(digest.valid ? [] : ["invalid-digest"]),
      ...(pathValid ? [] : ["invalid-path"]),
      ...(sensitivePath(artifact.relative_path) ? ["sensitive-path"] : []),
      ...(authorityValid ? [] : ["root-equal-authority-unproved"]),
      ...(run.normalizedRoot === null ? ["missing-run-root"] : []),
    ];
    staged.push({
      artifactId: artifact.artifact_id,
      projectId: run.project_id,
      projectSessionId: run.project_session_id,
      runId: run.run_id,
      taskId: artifact.task_id,
      publisherKind: "agent",
      publisherRef: artifact.publisher_agent_id,
      publisherAgentId: artifact.publisher_agent_id,
      sourceKind,
      evidenceKind: "artifact",
      relativePath: artifact.relative_path,
      digest: digest.digest,
      registryState: reasons.length === 0 ? "active" : "quarantined",
      quarantineReason: reasons.length === 0 ? null : reasons.join(","),
      createdAt: artifact.created_at,
    });
  }

  const receipts = database.prepare(`
    SELECT receipt.run_id, receipt.relative_path, receipt.sha256, receipt.exported_at
      FROM receipt_exports receipt ORDER BY receipt.run_id, receipt.relative_path, receipt.sha256
  `).all() as Array<{ run_id: string; relative_path: string; sha256: string; exported_at: number }>;
  for (const receipt of receipts) {
    const run = runs.get(receipt.run_id);
    if (run === undefined) fail(`receipt ${receipt.relative_path} has no scoped run`);
    const digest = normalizedDigest(receipt.sha256);
    const sourceKind = run.normalizedRoot === "." ? "project-file" : "run-file";
    const artifactId = deterministicId({
      projectId: run.project_id,
      projectSessionId: run.project_session_id,
      runId: run.run_id,
      sourceKind,
      relativePath: receipt.relative_path,
      digest: digest.digest,
    });
    if (staged.some((entry) => entry.artifactId === artifactId || (
      entry.projectId === run.project_id && entry.projectSessionId === run.project_session_id &&
      entry.runId === run.run_id && entry.sourceKind === sourceKind &&
      entry.relativePath === receipt.relative_path && entry.digest === digest.digest
    ))) continue;
    const reasons = [
      ...(digest.valid ? [] : ["invalid-digest"]),
      ...(canonicalRelativePath(receipt.relative_path) ? [] : ["invalid-path"]),
      ...(sensitivePath(receipt.relative_path) ? ["sensitive-path"] : []),
      ...(run.normalizedRoot === null ? ["missing-run-root"] : []),
    ];
    staged.push({
      artifactId,
      projectId: run.project_id,
      projectSessionId: run.project_session_id,
      runId: run.run_id,
      taskId: null,
      publisherKind: "fabric",
      publisherRef: "fabric-receipt-export",
      publisherAgentId: null,
      sourceKind,
      evidenceKind: "receipt",
      relativePath: receipt.relative_path,
      digest: digest.digest,
      registryState: reasons.length === 0 ? "active" : "quarantined",
      quarantineReason: reasons.length === 0 ? null : reasons.join(","),
      createdAt: receipt.exported_at,
    });
  }

  const identities = new Map<string, StagedArtifact[]>();
  for (const artifact of staged) {
    const key = JSON.stringify([
      artifact.projectId,
      artifact.projectSessionId,
      artifact.runId,
      artifact.sourceKind,
      artifact.relativePath,
      artifact.digest,
    ]);
    const matches = identities.get(key) ?? [];
    matches.push(artifact);
    identities.set(key, matches);
  }
  for (const matches of identities.values()) {
    if (matches.length < 2) continue;
    for (const artifact of matches) {
      artifact.registryState = "quarantined";
      artifact.quarantineReason = [artifact.quarantineReason, "identity-collision"].filter(Boolean).join(",");
    }
  }

  const insert = database.prepare(`
    INSERT INTO migration_0010_artifacts(
      artifact_id, project_id, project_session_id, run_id, task_id,
      publisher_kind, publisher_ref, publisher_agent_id, source_kind, evidence_kind,
      relative_path, sha256, registry_state, quarantine_reason, revision, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  for (const artifact of staged) {
    insert.run(
      artifact.artifactId,
      artifact.projectId,
      artifact.projectSessionId,
      artifact.runId,
      artifact.taskId,
      artifact.publisherKind,
      artifact.publisherRef,
      artifact.publisherAgentId,
      artifact.sourceKind,
      artifact.evidenceKind,
      artifact.relativePath,
      artifact.digest,
      artifact.registryState,
      artifact.quarantineReason,
      artifact.createdAt,
    );
  }
}

function stageIntakeBindings(database: Database.Database): void {
  database.exec(`
    DROP TABLE IF EXISTS temp.migration_0010_intake_bindings;
    CREATE TEMP TABLE migration_0010_intake_bindings(
      intake_id TEXT NOT NULL,
      intake_revision INTEGER NOT NULL,
      artifact_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      PRIMARY KEY(intake_id, intake_revision, artifact_id)
    );
    DROP TABLE IF EXISTS temp.migration_0010_intake_scopes;
    CREATE TEMP TABLE migration_0010_intake_scopes(
      intake_id TEXT NOT NULL,
      intake_revision INTEGER NOT NULL,
      accepted_scope_artifact_id TEXT,
      accepted_scope_state TEXT NOT NULL,
      PRIMARY KEY(intake_id, intake_revision)
    );
  `);
  const bindings = database.prepare(`
    SELECT binding.intake_id, binding.intake_revision, binding.relative_path, binding.sha256,
           intake.project_id, intake.project_session_id, intake.coordination_run_id
      FROM intake_artifact_bindings binding
      JOIN intakes intake ON intake.intake_id=binding.intake_id
     ORDER BY binding.intake_id, binding.intake_revision, binding.relative_path, binding.sha256
  `).all() as Array<{
    intake_id: string;
    intake_revision: number;
    relative_path: string;
    sha256: string;
    project_id: string;
    project_session_id: string | null;
    coordination_run_id: string | null;
  }>;
  const insertArtifact = database.prepare(`
    INSERT INTO migration_0010_artifacts(
      artifact_id, project_id, project_session_id, run_id, task_id,
      publisher_kind, publisher_ref, publisher_agent_id, source_kind, evidence_kind,
      relative_path, sha256, registry_state, quarantine_reason, revision, created_at
    ) VALUES (?, ?, ?, ?, NULL, 'migration', 'migration-0010-intake-binding', NULL, ?, 'artifact', ?, ?, ?, ?, 1, 0)
  `);
  const insertBinding = database.prepare(`
    INSERT INTO migration_0010_intake_bindings(intake_id, intake_revision, artifact_id, relative_path, sha256)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const binding of bindings) {
    const normalized = normalizedDigest(binding.sha256);
    const reservedPrivate = /^private\/git-diffs\/[a-f0-9]{64}\.patch$/u.test(binding.relative_path);
    const candidates = database.prepare(`
      SELECT artifact_id
        FROM migration_0010_artifacts
       WHERE project_id=? AND relative_path=? AND sha256=? AND registry_state='active'
         AND (
           (run_id IS ? AND project_session_id IS ?)
           OR (run_id IS NULL AND project_session_id IS ?)
           OR (run_id IS NULL AND project_session_id IS NULL)
         )
       ORDER BY CASE WHEN run_id IS NOT NULL THEN 0 WHEN project_session_id IS NOT NULL THEN 1 ELSE 2 END,
                artifact_id
    `).all(
      binding.project_id,
      binding.relative_path,
      normalized.digest,
      binding.coordination_run_id,
      binding.project_session_id,
      binding.project_session_id,
    ) as Array<{ artifact_id: string }>;
    let artifactId: string;
    if (candidates.length === 1) {
      artifactId = candidates[0]?.artifact_id ?? fail("artifact binding candidate disappeared");
    } else {
      const sourceKind = reservedPrivate ? "git-private-diff" : "project-file";
      const pathValid = canonicalRelativePath(binding.relative_path);
      const reason = candidates.length > 1
        ? "legacy-binding-ambiguous"
        : reservedPrivate
          ? "legacy-private-diff-unproved"
          : !pathValid
            ? "invalid-path"
            : !normalized.valid
              ? "invalid-digest"
              : "legacy-binding-unregistered";
      artifactId = quarantinedBindingId({
        intakeId: binding.intake_id,
        intakeRevision: binding.intake_revision,
        projectId: binding.project_id,
        projectSessionId: binding.project_session_id,
        runId: binding.coordination_run_id,
        relativePath: binding.relative_path,
        digest: normalized.digest,
        reason,
      });
      insertArtifact.run(
        artifactId,
        binding.project_id,
        binding.project_session_id,
        binding.coordination_run_id,
        sourceKind,
        binding.relative_path,
        normalized.digest,
        "quarantined",
        reason,
      );
    }
    insertBinding.run(
      binding.intake_id,
      binding.intake_revision,
      artifactId,
      binding.relative_path,
      normalized.digest,
    );
  }

  const revisions = database.prepare(`
    SELECT revision.intake_id, revision.revision, revision.state
      FROM intake_revisions revision ORDER BY revision.intake_id, revision.revision
  `).all() as Array<{ intake_id: string; revision: number; state: string }>;
  const scopeInsert = database.prepare(`
    INSERT INTO migration_0010_intake_scopes(
      intake_id, intake_revision, accepted_scope_artifact_id, accepted_scope_state
    ) VALUES (?, ?, ?, ?)
  `);
  for (const revision of revisions) {
    if (revision.state !== "accepted") {
      scopeInsert.run(revision.intake_id, revision.revision, null, "not-applicable");
      continue;
    }
    const active = database.prepare(`
      SELECT binding.artifact_id
        FROM migration_0010_intake_bindings binding
        JOIN migration_0010_artifacts artifact ON artifact.artifact_id=binding.artifact_id
       WHERE binding.intake_id=? AND binding.intake_revision=? AND artifact.registry_state='active'
       ORDER BY binding.artifact_id
    `).all(revision.intake_id, revision.revision) as Array<{ artifact_id: string }>;
    scopeInsert.run(
      revision.intake_id,
      revision.revision,
      active.length === 1 ? active[0]?.artifact_id : null,
      active.length === 1 ? "bound" : "recovery-required",
    );
  }
}

export function preflightArtifactRegistry(database: Database.Database): void {
  const runs = stageRuns(database);
  stageArtifacts(database, runs);
  stageIntakeBindings(database);
}

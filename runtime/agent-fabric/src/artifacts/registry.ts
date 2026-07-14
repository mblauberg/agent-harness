import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";

import type Database from "better-sqlite3";

import { readStoredAuthority } from "../authority/stored-authority.js";
import { FabricError } from "../errors.js";
import { pathWithin, resolveRunArtifactRoot } from "./run-root.js";

export type ArtifactSourceKind = "project-file" | "run-file" | "git-private-diff";
export type ArtifactEvidenceKind = "artifact" | "diff" | "test" | "review" | "receipt";
export type ArtifactPublisherKind = "agent" | "operator" | "fabric" | "project";

export type ArtifactRegistration = {
  evidenceId: string;
  evidenceRevision: number;
  projectId: string;
  projectSessionId: string | null;
  coordinationRunId: string | null;
  taskId: string | null;
  sourceKind: ArtifactSourceKind;
  evidenceKind: ArtifactEvidenceKind;
  artifactRef: { path: string; digest: string };
  publisherKind: ArtifactPublisherKind;
  publisherRef: string;
  createdAt: number;
};

type RegisterInput = {
  projectId: string;
  projectSessionId: string | null;
  runId: string | null;
  taskId: string | null;
  publisherKind: ArtifactPublisherKind;
  publisherRef: string;
  publisherAgentId: string | null;
  sourceKind: ArtifactSourceKind;
  evidenceKind: ArtifactEvidenceKind;
  relativePath: string;
  digest: string;
};

function canonicalRelativePath(value: string): boolean {
  const segments = value.split("/");
  return value.length > 0 && value.length <= 4096 && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value) &&
    !value.includes("\\") && !value.includes("\0") && !/[*?\[\]{}]/u.test(value) &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function sensitivePath(value: string): boolean {
  const lower = value.toLowerCase();
  const segments = lower.split("/");
  return segments.some((segment) => [
    ".git", ".hg", ".svn", ".ssh", ".aws", ".gnupg", "credentials", "secrets",
  ].includes(segment)) || segments.some((segment) =>
    segment === ".env" || segment.startsWith(".env.") ||
    /^(?:id_rsa|id_ed25519|credentials\.json|service-account\.json)$/u.test(segment)
  );
}

function normalizeDigest(value: string): string {
  if (/^[a-f0-9]{64}$/u.test(value)) return `sha256:${value}`;
  if (/^sha256:[a-f0-9]{64}$/u.test(value)) return value;
  throw new FabricError("ARTIFACT_DIGEST_INVALID", "artifact digest must be canonical lowercase SHA-256");
}

function deterministicId(input: RegisterInput): string {
  const identity = JSON.stringify({
    projectId: input.projectId,
    projectSessionId: input.projectSessionId,
    runId: input.runId,
    sourceKind: input.sourceKind,
    path: input.relativePath,
    digest: input.digest,
  });
  return `artifact_${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}

function registration(row: Record<string, unknown>): ArtifactRegistration {
  const required = (field: string): string => {
    const value = row[field];
    if (typeof value !== "string") throw new Error(`stored artifact ${field} is invalid`);
    return value;
  };
  const nullable = (field: string): string | null => {
    const value = row[field];
    if (value !== null && typeof value !== "string") throw new Error(`stored artifact ${field} is invalid`);
    return value;
  };
  const revision = row.revision;
  const createdAt = row.created_at;
  if (typeof revision !== "number" || typeof createdAt !== "number") throw new Error("stored artifact revision is invalid");
  return {
    evidenceId: required("artifact_id"),
    evidenceRevision: revision,
    projectId: required("project_id"),
    projectSessionId: nullable("project_session_id"),
    coordinationRunId: nullable("run_id"),
    taskId: nullable("task_id"),
    sourceKind: required("source_kind") as ArtifactSourceKind,
    evidenceKind: required("evidence_kind") as ArtifactEvidenceKind,
    artifactRef: { path: required("relative_path"), digest: required("sha256") },
    publisherKind: required("publisher_kind") as ArtifactPublisherKind,
    publisherRef: required("publisher_ref"),
    createdAt,
  };
}

function exactRegistration(row: Record<string, unknown>, input: RegisterInput): boolean {
  return row.project_id === input.projectId && row.project_session_id === input.projectSessionId &&
    row.run_id === input.runId && row.task_id === input.taskId && row.publisher_kind === input.publisherKind &&
    row.publisher_ref === input.publisherRef && row.publisher_agent_id === input.publisherAgentId &&
    row.source_kind === input.sourceKind && row.evidence_kind === input.evidenceKind &&
    row.relative_path === input.relativePath && row.sha256 === input.digest && row.registry_state === "active";
}

function verifyFile(path: string, digest: string): void {
  let fd: number | undefined;
  try {
    const expectedPath = resolve(path);
    if (realpathSync.native(expectedPath) !== expectedPath) {
      throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "artifact source resolves through a symlinked path");
    }
    fd = openSync(expectedPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(fd);
    const pathBefore = statSync(expectedPath);
    if (!before.isFile() || before.nlink !== 1) {
      throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "artifact source must be one unaliased regular file");
    }
    if (before.dev !== pathBefore.dev || before.ino !== pathBefore.ino) {
      throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "artifact source changed before verification");
    }
    if (before.size > 1_048_576) throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "artifact source exceeds 1 MiB");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const pathAfter = statSync(expectedPath);
    if (
      before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs || after.dev !== pathAfter.dev || after.ino !== pathAfter.ino ||
      realpathSync.native(expectedPath) !== expectedPath
    ) throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "artifact source changed during verification");
    const actual = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (actual !== digest) throw new FabricError("ARTIFACT_DIGEST_INVALID", "artifact source digest does not match bytes");
  } catch (error: unknown) {
    if (error instanceof FabricError) throw error;
    throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "artifact source cannot be opened safely", { cause: error });
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export class ArtifactRegistry {
  readonly #database: Database.Database;
  readonly #clock: () => number;

  constructor(database: Database.Database, clock: () => number) {
    this.#database = database;
    this.#clock = clock;
  }

  register(input: RegisterInput): ArtifactRegistration {
    if (!canonicalRelativePath(input.relativePath) || sensitivePath(input.relativePath)) {
      throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "artifact path is not a canonical non-sensitive relative path");
    }
    const normalized: RegisterInput = { ...input, digest: normalizeDigest(input.digest) };
    const privatePath = `private/git-diffs/${normalized.digest.slice("sha256:".length)}.patch`;
    if (
      (normalized.sourceKind === "git-private-diff" && (
        normalized.runId !== null || normalized.taskId !== null ||
        normalized.publisherKind !== "fabric" || normalized.publisherRef !== "fabric-git-private-diff" ||
        normalized.publisherAgentId !== null || normalized.evidenceKind !== "diff" ||
        normalized.relativePath !== privatePath
      )) ||
      (normalized.sourceKind !== "git-private-diff" && normalized.relativePath.startsWith("private/git-diffs/"))
    ) {
      throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "artifact violates the private Git diff namespace");
    }
    const artifactId = deterministicId(normalized);
    const existing = this.#database.prepare("SELECT * FROM artifacts WHERE artifact_id=?").get(artifactId) as
      | Record<string, unknown>
      | undefined;
    if (existing !== undefined) {
      if (!exactRegistration(existing, normalized)) {
        throw new FabricError("DEDUPE_CONFLICT", "artifact identity was replayed with changed provenance or kind");
      }
      return registration(existing);
    }
    const identity = this.#database.prepare(`
      SELECT * FROM artifacts
       WHERE project_id=? AND project_session_id IS ? AND run_id IS ? AND source_kind=?
         AND relative_path=? AND sha256=? AND registry_state='active'
    `).all(
      normalized.projectId,
      normalized.projectSessionId,
      normalized.runId,
      normalized.sourceKind,
      normalized.relativePath,
      normalized.digest,
    ) as Record<string, unknown>[];
    if (identity.length > 0) {
      const candidate = identity[0];
      if (candidate !== undefined && exactRegistration(candidate, normalized)) return registration(candidate);
      throw new FabricError("DEDUPE_CONFLICT", "artifact identity already has different provenance or kind");
    }
    const now = this.#clock();
    this.#database.prepare(`
      INSERT INTO artifacts(
        artifact_id, project_id, project_session_id, run_id, task_id,
        publisher_kind, publisher_ref, publisher_agent_id, source_kind, evidence_kind,
        relative_path, sha256, registry_state, quarantine_reason, revision, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, 1, ?)
    `).run(
      artifactId,
      normalized.projectId,
      normalized.projectSessionId,
      normalized.runId,
      normalized.taskId,
      normalized.publisherKind,
      normalized.publisherRef,
      normalized.publisherAgentId,
      normalized.sourceKind,
      normalized.evidenceKind,
      normalized.relativePath,
      normalized.digest,
      now,
    );
    const inserted = this.#database.prepare("SELECT * FROM artifacts WHERE artifact_id=?").get(artifactId) as
      | Record<string, unknown>
      | undefined;
    if (inserted === undefined) throw new Error("artifact registry insert disappeared");
    return registration(inserted);
  }

  registerAgentEvidence(input: {
    runId: string;
    agentId: string;
    taskId: string | null;
    requestedSourceKind: "project-file" | "run-file";
    evidenceKind: ArtifactEvidenceKind;
    relativePath: string;
    digest: string;
    verifyBytes?: boolean;
    enforcePathAuthority?: boolean;
  }): ArtifactRegistration {
    const root = resolveRunArtifactRoot(this.#database, input.runId);
    const digest = normalizeDigest(input.digest);
    if (root.artifactRoot === null) {
      throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "run has no artifact directory");
    }
    const effectiveSourceKind = input.requestedSourceKind === "run-file" && root.projectRelativeDirectory !== "."
      ? "run-file"
      : "project-file";
    const sourceRoot = effectiveSourceKind === "run-file" ? root.artifactRoot : root.projectRoot;
    const source = resolve(sourceRoot, input.relativePath);
    if (!pathWithin(sourceRoot, source)) throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "artifact path escapes its source owner");
    if (input.enforcePathAuthority !== false || effectiveSourceKind === "project-file") {
      this.#assertAgentPathAuthority(input.runId, input.agentId, source);
    }
    if (input.verifyBytes !== false) verifyFile(source, digest);
    return this.register({
      projectId: root.projectId,
      projectSessionId: root.projectSessionId,
      runId: root.runId,
      taskId: input.taskId,
      publisherKind: "agent",
      publisherRef: input.agentId,
      publisherAgentId: input.agentId,
      sourceKind: effectiveSourceKind,
      evidenceKind: input.evidenceKind,
      relativePath: input.relativePath,
      digest,
    });
  }

  registerProjectEvidence(input: {
    projectId: string;
    projectSessionId: string | null;
    runId: string | null;
    relativePath: string;
    digest: string;
  }): ArtifactRegistration {
    if (input.relativePath.startsWith("private/git-diffs/")) {
      throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "private Git diff namespace is producer-owned");
    }
    const project = this.#database.prepare("SELECT canonical_root FROM projects WHERE project_id=?")
      .get(input.projectId) as { canonical_root?: unknown } | undefined;
    if (typeof project?.canonical_root !== "string") throw new FabricError("NOT_FOUND", "artifact project is unavailable");
    const source = resolve(project.canonical_root, input.relativePath);
    if (!pathWithin(project.canonical_root, source)) {
      throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "project artifact path escapes the canonical project root");
    }
    const digest = normalizeDigest(input.digest);
    verifyFile(source, digest);
    return this.register({
      projectId: input.projectId,
      projectSessionId: input.projectSessionId,
      runId: input.runId,
      taskId: null,
      publisherKind: "project",
      publisherRef: "project-owned",
      publisherAgentId: null,
      sourceKind: "project-file",
      evidenceKind: "artifact",
      relativePath: input.relativePath,
      digest,
    });
  }

  #assertAgentPathAuthority(runId: string, agentId: string, source: string): void {
    const row = this.#database.prepare(`
      SELECT authority.authority_json, authority.authority_hash, run.workspace_root
        FROM agents agent JOIN authorities authority ON authority.authority_id=agent.authority_id
        JOIN runs run ON run.run_id=agent.run_id
       WHERE agent.run_id=? AND agent.agent_id=?
    `).get(runId, agentId) as { authority_json?: unknown; authority_hash?: unknown; workspace_root?: unknown } | undefined;
    if (row === undefined || typeof row.workspace_root !== "string") {
      throw new FabricError("CAPABILITY_FORBIDDEN", "agent artifact authority is unavailable");
    }
    let paths: readonly string[];
    try {
      paths = readStoredAuthority(row, "agent artifact authority").artifactPaths;
    } catch (error: unknown) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "agent artifact authority is invalid", { cause: error });
    }
    const workspaceRoot = row.workspace_root;
    if (!paths.some((path) => pathWithin(resolve(workspaceRoot, path), source))) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "artifact source is outside the agent path authority");
    }
  }
}

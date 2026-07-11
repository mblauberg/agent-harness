import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";

import type Database from "better-sqlite3";

import { FabricError } from "../errors.js";

export type ResolvedRunArtifactRoot = {
  projectId: string;
  projectSessionId: string;
  runId: string;
  projectRoot: string;
  projectRelativeDirectory: string | null;
  artifactRoot: string | null;
  basis: "project-relative" | "none";
};

export type RunArtifactRootCapture = {
  projectId: string;
  projectSessionId: string;
  runId: string;
  canonicalRoot: string;
  projectRunDirectory: string | null;
  basis: "project-relative" | "none";
};

function forward(value: string): string {
  return value.replaceAll(sep, "/");
}

function contains(parent: string, child: string): boolean {
  const result = posix.relative(parent, child);
  return result === "" || (result !== ".." && !result.startsWith("../") && !posix.isAbsolute(result));
}

function canonicalWithMissingSuffix(path: string): string {
  let cursor = resolve(path);
  const suffix: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "artifact root has no canonical ancestor");
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  return forward(resolve(realpathSync.native(cursor), ...suffix));
}

function canonicalRelative(value: string): boolean {
  const segments = value.split("/");
  return value.length > 0 && value.length <= 4096 && !isAbsolute(value) && !/^[A-Za-z]:/u.test(value) &&
    !value.includes("\\") && !value.includes("\0") && !/[*?\[\]{}]/u.test(value) &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function normalizeRunArtifactDirectory(projectRoot: string, directory: string | null): string | null {
  if (directory === null) return null;
  const canonicalProject = canonicalWithMissingSuffix(projectRoot);
  const candidate = isAbsolute(directory)
    ? canonicalWithMissingSuffix(directory)
    : canonicalWithMissingSuffix(resolve(canonicalProject, directory));
  if (!contains(canonicalProject, candidate)) {
    throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "run artifact directory escapes the canonical project root");
  }
  const projectRelative = forward(relative(canonicalProject, candidate));
  if (projectRelative === "") return ".";
  if (!canonicalRelative(projectRelative)) {
    throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "run artifact directory is not canonical project-relative authority");
  }
  return projectRelative;
}

export function captureRunArtifactRoot(
  database: Database.Database,
  runId: string,
): RunArtifactRootCapture {
  const row = database.prepare(`
    SELECT run.run_id, run.project_session_id, run.project_run_directory,
           run.project_run_directory_basis, session.project_id, project.canonical_root
      FROM runs run
      JOIN project_sessions session ON session.project_session_id=run.project_session_id
      JOIN projects project ON project.project_id=session.project_id
     WHERE run.run_id=?
  `).get(runId) as Record<string, unknown> | undefined;
  if (row === undefined) throw new FabricError("NOT_FOUND", "run artifact root is unavailable");
  const projectId = row.project_id;
  const projectSessionId = row.project_session_id;
  const stored = row.project_run_directory;
  const basis = row.project_run_directory_basis;
  const projectRootValue = row.canonical_root;
  if (
    typeof projectId !== "string" || typeof projectSessionId !== "string" ||
    typeof projectRootValue !== "string" ||
    (stored !== null && typeof stored !== "string") ||
    (basis !== "project-relative" && basis !== "none")
  ) throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "stored run artifact root is invalid");
  if ((stored === null) !== (basis === "none")) {
    throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "stored run artifact root basis is inconsistent");
  }
  return {
    projectId,
    projectSessionId,
    runId,
    canonicalRoot: projectRootValue,
    projectRunDirectory: stored,
    basis,
  };
}

export function materializeRunArtifactRoot(
  capture: RunArtifactRootCapture,
): ResolvedRunArtifactRoot {
  const projectRoot = canonicalWithMissingSuffix(capture.canonicalRoot);
  const stored = capture.projectRunDirectory;
  if (stored === null) {
    return {
      projectId: capture.projectId,
      projectSessionId: capture.projectSessionId,
      runId: capture.runId,
      projectRoot,
      projectRelativeDirectory: null,
      artifactRoot: null,
      basis: capture.basis,
    };
  }
  if (stored !== "." && !canonicalRelative(stored)) {
    throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "stored run artifact root is not canonical project-relative authority");
  }
  const artifactRoot = canonicalWithMissingSuffix(resolve(projectRoot, stored));
  if (!contains(projectRoot, artifactRoot)) {
    throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "stored run artifact root escapes the canonical project root");
  }
  return {
    projectId: capture.projectId,
    projectSessionId: capture.projectSessionId,
    runId: capture.runId,
    projectRoot,
    projectRelativeDirectory: stored,
    artifactRoot,
    basis: capture.basis,
  };
}

export function resolveRunArtifactRoot(
  database: Database.Database,
  runId: string,
): ResolvedRunArtifactRoot {
  return materializeRunArtifactRoot(captureRunArtifactRoot(database, runId));
}

export function pathWithin(root: string, path: string): boolean {
  return contains(forward(root), forward(path));
}

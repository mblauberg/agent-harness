import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  parseIdentifier,
  parseCanonicalRelativePath,
  requiredString,
  safeInteger,
  strictRecord,
  type AgentId,
  type CommandId,
  type CoordinationRunId,
  type ProjectId,
  type ProjectSessionId,
  type ReservationId,
  type ResourceScopeId,
  type TeamId,
} from "./primitives.js";

export type ResourceScopeRef =
  | { kind: "project"; scopeId: ResourceScopeId; projectId: ProjectId }
  | {
      kind: "project-session";
      scopeId: ResourceScopeId;
      projectId: ProjectId;
      projectSessionId: ProjectSessionId;
    }
  | {
      kind: "coordination-run";
      scopeId: ResourceScopeId;
      projectSessionId: ProjectSessionId;
      coordinationRunId: CoordinationRunId;
    }
  | { kind: "team"; scopeId: ResourceScopeId; coordinationRunId: CoordinationRunId; teamId: TeamId }
  | { kind: "agent"; scopeId: ResourceScopeId; teamId: TeamId; agentId: AgentId };

export type ResourceAmounts = Readonly<Record<string, number>>;

export type WriterAdmission = {
  repositoryRoot: string;
  worktreePath: string;
  sourcePrefixes: readonly string[];
  writerGeneration: number;
};

export type ResourceReservationRequest = {
  commandId: CommandId;
  reservationId: ReservationId;
  projectSessionId: ProjectSessionId;
  path: readonly ResourceScopeRef[];
  amounts: ResourceAmounts;
  writerAdmission?: WriterAdmission;
};

export type ResourceDimensionProjection =
  | { unknown: false; used: number; reserved: number; remaining: number }
  | { unknown: true; used: number | null; reserved: number; remaining: null };

export type ResourceReservation = {
  reservationId: ReservationId;
  revision: number;
  state: "active" | "released" | "ambiguous" | "reconciled";
  path: readonly ResourceScopeRef[];
  amounts: ResourceAmounts;
  capacity: Readonly<Record<string, ResourceDimensionProjection>>;
};

export type ResourceReleaseRequest = {
  commandId: CommandId;
  reservationId: ReservationId;
  expectedRevision: number;
  consumed: ResourceAmounts;
};

export type ResourceReconcileRequest = {
  commandId: CommandId;
  reservationId: ReservationId;
  expectedRevision: number;
  observedUsage: Readonly<Record<string, number | "unknown">>;
  evidence: string;
};

const baseUnitKeys = new Set([
  "provider_calls",
  "concurrent_turns",
  "descendants",
  "message_bytes",
  "artifact_bytes",
  "wall_clock_milliseconds",
]);

export function isResourceUnitKey(value: string): boolean {
  return baseUnitKeys.has(value) ||
    /^cost:[A-Z]{3}$/u.test(value) ||
    /^(?:input_tokens|output_tokens):[a-z0-9][a-z0-9._-]{0,63}$/u.test(value);
}

function parseAmounts(value: unknown, path: string): ResourceAmounts {
  const record = strictRecord(value, path, typeof value === "object" && value !== null ? Object.keys(value) : []);
  if (Object.keys(record).length === 0) throw new TypeError(`${path} must not be empty`);
  const parsed: Record<string, number> = {};
  for (const [unit, amount] of Object.entries(record)) {
    if (!isResourceUnitKey(unit)) throw new TypeError(`${path}.${unit} is not a qualified resource unit`);
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
      throw new TypeError(`${path}.${unit} must be a non-negative safe integer`);
    }
    parsed[unit] = amount;
  }
  return parsed;
}

function parseScope(value: unknown, index: number): ResourceScopeRef {
  const path = `resourceReservation.path[${String(index)}]`;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  const kind: unknown = Reflect.get(value, "kind");
  const commonScopeId = (): ResourceScopeId => parseIdentifier<"ResourceScopeId">(Reflect.get(value, "scopeId"), `${path}.scopeId`);
  if (kind === "project") {
    const record = strictRecord(value, path, ["kind", "scopeId", "projectId"]);
    return { kind, scopeId: commonScopeId(), projectId: parseIdentifier<"ProjectId">(record.projectId, `${path}.projectId`) };
  }
  if (kind === "project-session") {
    const record = strictRecord(value, path, ["kind", "scopeId", "projectId", "projectSessionId"]);
    return {
      kind,
      scopeId: commonScopeId(),
      projectId: parseIdentifier<"ProjectId">(record.projectId, `${path}.projectId`),
      projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, `${path}.projectSessionId`),
    };
  }
  if (kind === "coordination-run") {
    const record = strictRecord(value, path, ["kind", "scopeId", "projectSessionId", "coordinationRunId"]);
    return {
      kind,
      scopeId: commonScopeId(),
      projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, `${path}.projectSessionId`),
      coordinationRunId: parseIdentifier<"CoordinationRunId">(record.coordinationRunId, `${path}.coordinationRunId`),
    };
  }
  if (kind === "team") {
    const record = strictRecord(value, path, ["kind", "scopeId", "coordinationRunId", "teamId"]);
    return {
      kind,
      scopeId: commonScopeId(),
      coordinationRunId: parseIdentifier<"CoordinationRunId">(record.coordinationRunId, `${path}.coordinationRunId`),
      teamId: parseIdentifier<"TeamId">(record.teamId, `${path}.teamId`),
    };
  }
  if (kind === "agent") {
    const record = strictRecord(value, path, ["kind", "scopeId", "teamId", "agentId"]);
    return {
      kind,
      scopeId: commonScopeId(),
      teamId: parseIdentifier<"TeamId">(record.teamId, `${path}.teamId`),
      agentId: parseIdentifier<"AgentId">(record.agentId, `${path}.agentId`),
    };
  }
  throw new TypeError(`${path}.kind is invalid`);
}

const scopeRank: Record<ResourceScopeRef["kind"], number> = {
  project: 0,
  "project-session": 1,
  "coordination-run": 2,
  team: 3,
  agent: 4,
};

function isWithin(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === "" || (
    child !== ".." &&
    !child.startsWith(`..${sep}`) &&
    !isAbsolute(child)
  );
}

function nearestExistingAncestor(path: string): string {
  let candidate = path;
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) throw new TypeError("writer admission path has no existing ancestor");
    candidate = parent;
  }
  return candidate;
}

function assertSourcePrefixesContained(
  admission: WriterAdmission,
  requireExistingWorktree: boolean,
): void {
  if (requireExistingWorktree && !existsSync(admission.worktreePath)) {
    throw new TypeError("resourceReservation.writerAdmission.worktreePath must exist at admission time");
  }
  const confinementRoot = existsSync(admission.worktreePath)
    ? realpathSync(admission.worktreePath)
    : admission.repositoryRoot;
  for (const [index, prefix] of admission.sourcePrefixes.entries()) {
    const target = resolve(admission.worktreePath, prefix);
    if (!isWithin(admission.worktreePath, target)) {
      throw new TypeError(
        `resourceReservation.writerAdmission.sourcePrefixes[${String(index)}] escapes the worktree`,
      );
    }
    const resolvedAncestor = realpathSync(nearestExistingAncestor(target));
    if (!isWithin(admission.repositoryRoot, resolvedAncestor) || !isWithin(confinementRoot, resolvedAncestor)) {
      throw new TypeError(
        `resourceReservation.writerAdmission.sourcePrefixes[${String(index)}] is a symlink escape`,
      );
    }
  }
}

function parseWriterAdmission(value: unknown): WriterAdmission {
  const record = strictRecord(value, "resourceReservation.writerAdmission", [
    "repositoryRoot",
    "worktreePath",
    "sourcePrefixes",
    "writerGeneration",
  ]);
  const repositoryInput = requiredString(
    record.repositoryRoot,
    "resourceReservation.writerAdmission.repositoryRoot",
  );
  if (!isAbsolute(repositoryInput)) {
    throw new TypeError("resourceReservation.writerAdmission.repositoryRoot must be absolute");
  }
  const repositoryRoot = resolve(repositoryInput);
  const repositoryStat = lstatSync(repositoryRoot);
  if (!repositoryStat.isDirectory() || repositoryStat.isSymbolicLink() || realpathSync(repositoryRoot) !== repositoryRoot) {
    throw new TypeError("resourceReservation.writerAdmission.repositoryRoot must be a canonical non-symlink directory");
  }
  const worktreeInput = requiredString(record.worktreePath, "resourceReservation.writerAdmission.worktreePath");
  if (!isAbsolute(worktreeInput)) {
    throw new TypeError("resourceReservation.writerAdmission.worktreePath must be absolute");
  }
  const worktreePath = resolve(worktreeInput);
  const worktreesRoot = resolve(repositoryRoot, ".worktrees");
  const worktreeRelative = relative(worktreesRoot, worktreePath);
  if (
    worktreeRelative === "" ||
    worktreeRelative === ".." ||
    worktreeRelative.startsWith(`..${sep}`) ||
    isAbsolute(worktreeRelative) ||
    worktreeRelative.includes(sep)
  ) {
    throw new TypeError("resourceReservation.writerAdmission.worktreePath must be one direct child under repositoryRoot/.worktrees");
  }
  if (existsSync(worktreesRoot)) {
    const worktreesStat = lstatSync(worktreesRoot);
    if (!worktreesStat.isDirectory() || worktreesStat.isSymbolicLink() || realpathSync(worktreesRoot) !== worktreesRoot) {
      throw new TypeError("resourceReservation.writerAdmission .worktrees root must not be a symlink escape");
    }
  }
  if (existsSync(worktreePath)) {
    const worktreeStat = lstatSync(worktreePath);
    if (!worktreeStat.isDirectory() || worktreeStat.isSymbolicLink()) {
      throw new TypeError("resourceReservation.writerAdmission.worktreePath must not be a symlink escape");
    }
    if (dirname(realpathSync(worktreePath)) !== realpathSync(worktreesRoot)) {
      throw new TypeError("resourceReservation.writerAdmission.worktreePath escapes repositoryRoot/.worktrees");
    }
  }
  if (!Array.isArray(record.sourcePrefixes) || record.sourcePrefixes.length === 0) {
    throw new TypeError("resourceReservation.writerAdmission.sourcePrefixes must not be empty");
  }
  const sourcePrefixes = record.sourcePrefixes.map((prefix, index) => {
    return parseCanonicalRelativePath(
      prefix,
      `resourceReservation.writerAdmission.sourcePrefixes[${String(index)}]`,
    );
  });
  const admission = {
    repositoryRoot,
    worktreePath,
    sourcePrefixes,
    writerGeneration: safeInteger(record.writerGeneration, "resourceReservation.writerAdmission.writerGeneration", 1),
  };
  assertSourcePrefixesContained(admission, false);
  return admission;
}

/** Rechecks path and symlink containment immediately before admitting a writer. */
export function assertWriterAdmissionCurrent(value: WriterAdmission): WriterAdmission {
  const admission = parseWriterAdmission(value);
  assertSourcePrefixesContained(admission, true);
  return admission;
}

export function parseResourceReservationRequest(value: unknown): ResourceReservationRequest {
  const record = strictRecord(value, "resourceReservation", [
    "commandId",
    "reservationId",
    "projectSessionId",
    "path",
    "amounts",
    "writerAdmission",
  ]);
  if (!Array.isArray(record.path) || record.path.length < 2) {
    throw new TypeError("resourceReservation.path must include project and project-session ancestors");
  }
  const path = record.path.map((scope, index) => parseScope(scope, index));
  if (path[0]?.kind !== "project" || path[1]?.kind !== "project-session") {
    throw new TypeError("resourceReservation.path must begin with project then project-session");
  }
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    if (previous === undefined || current === undefined || scopeRank[current.kind] !== scopeRank[previous.kind] + 1) {
      throw new TypeError("resourceReservation.path must be a contiguous ancestor chain");
    }
  }
  if (path[0].projectId !== path[1].projectId) {
    throw new TypeError("resourceReservation ancestor identity mismatch: project -> project-session");
  }
  const runScope = path[2];
  if (runScope !== undefined && runScope.kind === "coordination-run" && runScope.projectSessionId !== path[1].projectSessionId) {
    throw new TypeError("resourceReservation ancestor identity mismatch: project-session -> coordination-run");
  }
  const teamScope = path[3];
  if (
    runScope !== undefined && runScope.kind === "coordination-run" &&
    teamScope !== undefined && teamScope.kind === "team" &&
    teamScope.coordinationRunId !== runScope.coordinationRunId
  ) {
    throw new TypeError("resourceReservation ancestor identity mismatch: coordination-run -> team");
  }
  const agentScope = path[4];
  if (
    teamScope !== undefined && teamScope.kind === "team" &&
    agentScope !== undefined && agentScope.kind === "agent" &&
    agentScope.teamId !== teamScope.teamId
  ) {
    throw new TypeError("resourceReservation ancestor identity mismatch: team -> agent");
  }
  const projectSessionId = parseIdentifier<"ProjectSessionId">(
    record.projectSessionId,
    "resourceReservation.projectSessionId",
  );
  if (path[1].projectSessionId !== projectSessionId) {
    throw new TypeError("resourceReservation.path project session does not match request");
  }
  return {
    commandId: parseIdentifier<"CommandId">(record.commandId, "resourceReservation.commandId"),
    reservationId: parseIdentifier<"ReservationId">(record.reservationId, "resourceReservation.reservationId"),
    projectSessionId,
    path,
    amounts: parseAmounts(record.amounts, "resourceReservation.amounts"),
    ...(record.writerAdmission === undefined ? {} : { writerAdmission: parseWriterAdmission(record.writerAdmission) }),
  };
}

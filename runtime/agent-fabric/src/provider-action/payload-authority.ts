import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, normalize, posix, relative, resolve, sep } from "node:path";

import type Database from "better-sqlite3";

import { compileProviderPayload } from "../authority/authority-compiler.js";
import { readStoredAuthority } from "../authority/stored-authority.js";
import type { AuthorityInput } from "../domain/types.js";
import { assessAdapterModelPolicy } from "../adapters/model-selection.js";
import { FabricError } from "../errors.js";

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(row: Row, field: string): string {
  const value = row[field];
  if (typeof value !== "string") {
    throw new Error(`database field ${field} is not a string`);
  }
  return value;
}

function numberField(row: Row, field: string): number {
  const value = row[field];
  if (typeof value !== "number") {
    throw new Error(`database field ${field} is not a number`);
  }
  return value;
}

function rowOrNotFound(value: unknown, label: string): Row {
  if (!isRow(value)) {
    throw new FabricError("NOT_FOUND", `${label} was not found`);
  }
  return value;
}

function isAbsoluteOnAnyPlatform(path: string): boolean {
  return isAbsolute(path) || /^[A-Za-z]:[\\/]/u.test(path) || /^[\\/]{2}/u.test(path);
}

function canonicalAuthorityPath(workspaceRoot: string, path: string): string {
  if (
    path.length === 0 ||
    path.includes("\0") ||
    isAbsoluteOnAnyPlatform(path) ||
    path.split(/[\\/]/u).includes("..") ||
    /[*?[\]{}]/u.test(path)
  ) {
    throw new FabricError("AUTHORITY_WIDENING", `unsafe workspace-relative path: ${path}`);
  }
  let cursor = resolve(workspaceRoot, path);
  const suffix: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new FabricError("AUTHORITY_WIDENING", `path has no resolvable ancestor: ${path}`);
    }
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  const resolved = resolve(realpathSync(cursor), ...suffix);
  const rel = relative(workspaceRoot, resolved);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new FabricError("AUTHORITY_WIDENING", `workspace-relative path escapes configured root: ${path}`);
  }
  return rel === "" ? "." : normalize(rel).replaceAll(sep, "/");
}

function pathContains(parent: string, child: string): boolean {
  const rel = posix.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith("../") && !posix.isAbsolute(rel));
}

/**
 * Payload, principal, model, and budget admission for generic provider actions. This is the leaf
 * authority owner in the generic provider-action vertical: it validates and compiles provider
 * payloads against stored authorities, enforces adapter model policy, checks provider principal
 * liveness, verifies ephemeral authority delegation, and reserves provider budget. It has no
 * dependency on provider-action state, executor, or recovery.
 */
export class ProviderPayloadAuthority {
  readonly #database: Database.Database;
  readonly #clock: () => number;
  readonly #workspaceRootForRun: (runId: string) => string;
  readonly #adapterModelPolicy: (adapterId: string) =>
    | { allowedFamilies: string[]; allowedModelPatterns: string[]; requiresExplicitModel: boolean }
    | undefined;

  constructor(dependencies: Readonly<{
    database: Database.Database;
    clock: () => number;
    workspaceRootForRun: (runId: string) => string;
    adapterModelPolicy: (adapterId: string) =>
      | { allowedFamilies: string[]; allowedModelPatterns: string[]; requiresExplicitModel: boolean }
      | undefined;
  }>) {
    this.#database = dependencies.database;
    this.#clock = dependencies.clock;
    this.#workspaceRootForRun = dependencies.workspaceRootForRun;
    this.#adapterModelPolicy = dependencies.adapterModelPolicy;
  }

  assertAdapterModel(adapterId: string, payload: Record<string, unknown>): void {
    const policy = this.#adapterModelPolicy(adapterId);
    if (policy === undefined) return;
    const assessment = assessAdapterModelPolicy({
      modelFamily: typeof payload.modelFamily === "string" ? payload.modelFamily : "",
      modelId: typeof payload.model === "string" ? payload.model : null,
      allowedFamilies: policy.allowedFamilies,
      allowedModelPatterns: policy.allowedModelPatterns,
      requiresExplicitModel: policy.requiresExplicitModel,
    });
    if (assessment.allowed) return;
    if (assessment.reason === "model-required") {
      throw new FabricError("ADAPTER_MODEL_REQUIRED", `${adapterId} requires an explicit model`);
    }
    if (assessment.reason === "model-forbidden") {
      throw new FabricError("MODEL_NOT_ALLOWED", `${adapterId} model is outside trusted compatibility patterns`);
    }
    throw new FabricError("ADAPTER_FAMILY_FORBIDDEN", `${adapterId} model family is outside trusted compatibility policy`);
  }

  providerBudgetReservation(
    authorityId: string,
    modelFamily: string,
    maximumTurns: number,
  ): Record<string, number> {
    const reservation: Record<string, number> = {};
    for (const value of this.#database.prepare(`
      SELECT unit_key,granted,reserved,consumed,usage_unknown
        FROM authority_budget WHERE authority_id=? ORDER BY unit_key
    `).all(authorityId)) {
      const row = rowOrNotFound(value, "provider authority budget");
      const unit = stringField(row, "unit_key");
      const relevant = unit === "turns" || unit === "provider_calls" ||
        unit === "concurrent_turns" || unit === "wall_clock_milliseconds" ||
        unit.startsWith("cost:") || unit === `input_tokens:${modelFamily}` ||
        unit === `output_tokens:${modelFamily}`;
      if (!relevant) continue;
      if (numberField(row, "usage_unknown") === 1) {
        throw new FabricError("BUDGET_USAGE_UNKNOWN", `delegated provider usage is unknown for ${unit}`);
      }
      const available = numberField(row, "granted") - numberField(row, "reserved") - numberField(row, "consumed");
      const amount = unit === "turns" ? maximumTurns
        : unit === "provider_calls" || unit === "concurrent_turns" ? 1
          : available;
      if (amount < 1 || amount > available) {
        throw new FabricError("BUDGET_EXCEEDED", `delegated provider budget is exhausted for ${unit}`);
      }
      reservation[unit] = amount;
    }
    if (reservation.turns !== maximumTurns) {
      throw new FabricError("BUDGET_EXCEEDED", "delegated provider authority has no positive hard turns ceiling");
    }
    return reservation;
  }

  admitProviderPayload(
    runId: string,
    authorityId: string,
    payload: Record<string, unknown>,
    validateCurrent = true,
    projectionContext?:
      | { actorAgentId: string; taskId: string | undefined }
      | { workspacePath: string },
  ): Record<string, unknown> {
    const row = rowOrNotFound(
      this.#database.prepare("SELECT authority_json, authority_hash FROM authorities WHERE run_id = ? AND authority_id = ?").get(runId, authorityId),
      "provider authority",
    );
    const authority = readStoredAuthority(row);
    const trustedProjection = projectionContext === undefined
      ? undefined
      : "workspacePath" in projectionContext
        ? this.#replayWorkspaceWriteOfflineProjection(runId, authority, payload, projectionContext.workspacePath)
        : this.#workspaceWriteOfflineProjection(
          runId,
          projectionContext.actorAgentId,
          projectionContext.taskId,
          authority,
          payload,
        );
    const admittedPayload = trustedProjection === undefined
      ? payload
      : { ...payload, cwd: trustedProjection.workspacePath };
    return compileProviderPayload({
      authority,
      workspaceRoot: () => this.#workspaceRootForRun(runId),
      payload: admittedPayload,
      ...(trustedProjection === undefined ? {} : { trustedProjection }),
      ...(validateCurrent
        ? { now: this.#clock(), validateCurrent: true }
        : { now: null, validateCurrent: false }),
    });
  }

  #replayWorkspaceWriteOfflineProjection(
    runId: string,
    authority: AuthorityInput,
    payload: Record<string, unknown>,
    workspacePath: string,
  ): { kind: "workspace-write-offline"; workspacePath: string } | undefined {
    if (payload.cwd !== undefined && typeof payload.cwd !== "string") return undefined;
    try {
      const workspaceRoot = this.#workspaceRootForRun(runId);
      const relativeWorkspacePath = relative(workspaceRoot, workspacePath);
      if (
        relativeWorkspacePath === ".." || relativeWorkspacePath.startsWith(`..${sep}`) ||
        isAbsolute(relativeWorkspacePath)
      ) return undefined;
      const replayPath = relativeWorkspacePath === ""
        ? "."
        : normalize(relativeWorkspacePath).replaceAll(sep, "/");
      const requestedPath = canonicalAuthorityPath(
        workspaceRoot,
        payload.cwd ?? authority.sourcePaths[0] ?? ".",
      );
      return requestedPath === replayPath ? { kind: "workspace-write-offline", workspacePath: replayPath } : undefined;
    } catch {
      return undefined;
    }
  }

  #workspaceWriteOfflineProjection(
    runId: string,
    actorAgentId: string,
    taskId: string | undefined,
    authority: AuthorityInput,
    payload: Record<string, unknown>,
  ): { kind: "workspace-write-offline"; workspacePath: string } | undefined {
    if (taskId === undefined) return undefined;
    if (payload.cwd !== undefined && typeof payload.cwd !== "string") return undefined;
    const requestedCwd = payload.cwd ?? authority.sourcePaths[0] ?? ".";
    let workspacePath: string;
    try {
      workspacePath = canonicalAuthorityPath(this.#workspaceRootForRun(runId), requestedCwd);
    } catch {
      return undefined;
    }
    const leaseRows = this.#database.prepare(`
      SELECT scope.canonical_path
        FROM leases lease
        JOIN write_scope_entries scope ON scope.lease_id=lease.lease_id
        JOIN task_obligation_bindings binding
          ON binding.coordination_run_id=lease.run_id
         AND binding.obligation_kind='write-lease'
         AND binding.obligation_id=lease.lease_id
       WHERE lease.run_id=? AND lease.kind='write' AND lease.holder_agent_id=?
         AND lease.status='active' AND lease.expires_at>?
         AND binding.task_id=? AND binding.state='active'
    `).all(runId, actorAgentId, this.#clock(), taskId);
    if (!leaseRows.some((value) => isRow(value) && pathContains(stringField(value, "canonical_path"), workspacePath))) {
      return undefined;
    }
    return { kind: "workspace-write-offline", workspacePath };
  }

  assertProviderPrincipalActive(runId: string, agentId: string): void {
    const principal = rowOrNotFound(this.#database.prepare(`
      SELECT c.revoked_at, c.expires_at, agent.lifecycle
        FROM capabilities c
        JOIN agents agent ON agent.run_id=c.run_id AND agent.agent_id=c.agent_id
       WHERE c.run_id = ? AND c.agent_id = ?
       ORDER BY c.principal_generation DESC LIMIT 1
    `).get(runId, agentId), "provider principal");
    if (principal.revoked_at !== null || numberField(principal, "expires_at") <= this.#clock()) {
      throw new FabricError("AUTHENTICATION_FAILED", "provider principal is revoked or expired");
    }
    if (principal.lifecycle === "suspended" || principal.lifecycle === "context-unreconciled") {
      throw new FabricError("CONTEXT_UNRECONCILED", "provider principal requires explicit lifecycle recovery");
    }
  }

  assertEphemeralProviderAuthority(runId: string, actorAgentId: string, authorityId: string): void {
    const actor = rowOrNotFound(
      this.#database.prepare("SELECT authority_id FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, actorAgentId),
      "provider actor",
    );
    const delegated = rowOrNotFound(
      this.#database.prepare("SELECT parent_authority_id FROM authorities WHERE run_id = ? AND authority_id = ?")
        .get(runId, authorityId),
      "ephemeral provider authority",
    );
    if (delegated.parent_authority_id !== stringField(actor, "authority_id")) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "ephemeral provider authority is not delegated by the chair");
    }
  }
}

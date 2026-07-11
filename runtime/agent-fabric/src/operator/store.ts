import {
  assertOperatorCapabilityAuthority,
  type JsonValue,
  type OperatorAction,
  type OperatorCapabilityGrant,
  type OperatorMutationContext,
  type OperatorAuthorityBinding,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import {
  ProjectFabricCoreError,
  type AuthenticatedOperatorContext,
  type CoreServiceOptions,
} from "../project-session/contracts.js";
import {
  canonicalJson,
  integer,
  isRow,
  nullableText,
  row,
  sha256,
  text,
  timestampToMillis,
  type Row,
} from "../project-session/store-support.js";

export type OperatorCommandTarget = {
  projectId: string;
  projectSessionId?: string;
  sessionGeneration?: number;
  requiredAction: OperatorAction;
};

type CapabilityRow = Row & {
  capability_id: string;
};

export class OperatorStore {
  readonly database: Database.Database;
  readonly #clock: () => number;

  constructor(options: CoreServiceOptions) {
    this.database = options.database;
    this.#clock = options.clock ?? Date.now;
  }

  registerPrincipal(input: {
    operatorId: string;
    projectId: string;
    authenticatedSubjectHash: string;
    projectAuthorityGeneration: number;
    principalGeneration?: number;
  }): void {
    const principalGeneration = input.principalGeneration ?? 1;
    const project = row(
      this.database.prepare("SELECT authority_generation FROM projects WHERE project_id=?").get(input.projectId),
      "project",
    );
    if (integer(project, "authority_generation") !== input.projectAuthorityGeneration) {
      throw new ProjectFabricCoreError("STALE_GENERATION", "project authority generation changed");
    }
    const existing = this.database.prepare(`
      SELECT project_id, authenticated_subject_hash, project_authority_generation, principal_generation, state
        FROM operator_principals WHERE operator_id=?
    `).get(input.operatorId);
    if (isRow(existing)) {
      if (
        text(existing, "project_id") !== input.projectId ||
        text(existing, "authenticated_subject_hash") !== input.authenticatedSubjectHash ||
        integer(existing, "project_authority_generation") !== input.projectAuthorityGeneration ||
        integer(existing, "principal_generation") !== principalGeneration ||
        text(existing, "state") !== "active"
      ) {
        throw new ProjectFabricCoreError("CONFLICT", "operator principal registration conflicts with stored identity");
      }
      return;
    }
    const now = this.#clock();
    this.database.prepare(`
      INSERT INTO operator_principals(
        operator_id, project_id, project_session_id, authenticated_subject_hash,
        project_authority_generation, principal_generation, state, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, ?, 'active', ?, ?)
    `).run(
      input.operatorId,
      input.projectId,
      input.authenticatedSubjectHash,
      input.projectAuthorityGeneration,
      principalGeneration,
      now,
      now,
    );
  }

  issueCapability(grant: OperatorCapabilityGrant, token: string): void {
    if (token.length === 0) throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "capability token is empty");
    const principal = row(this.database.prepare(`
      SELECT project_id, project_authority_generation, principal_generation, state
        FROM operator_principals WHERE operator_id=?
    `).get(grant.operatorId), "operator principal");
    if (text(principal, "state") !== "active") {
      throw new ProjectFabricCoreError("CAPABILITY_REVOKED", "operator principal is not active");
    }
    const project = row(this.database.prepare(`
      SELECT authority_generation FROM projects WHERE project_id=?
    `).get(grant.projectId), "project");
    const authorityBinding: OperatorAuthorityBinding = grant.kind === "project-launch"
      ? {
          projectId: grant.projectId,
          projectAuthorityGeneration: integer(project, "authority_generation"),
          principalGeneration: integer(principal, "principal_generation"),
        }
      : {
          projectId: grant.projectId,
          projectAuthorityGeneration: integer(project, "authority_generation"),
          principalGeneration: integer(principal, "principal_generation"),
          projectSessionId: grant.projectSessionId,
          sessionGeneration: integer(row(this.database.prepare(`
            SELECT generation FROM project_sessions WHERE project_session_id=? AND project_id=?
          `).get(grant.projectSessionId, grant.projectId), "project session"), "generation"),
        };
    try {
      assertOperatorCapabilityAuthority(grant, authorityBinding);
    } catch (error: unknown) {
      throw new ProjectFabricCoreError("STALE_GENERATION", error instanceof Error ? error.message : String(error));
    }
    const existing = this.database.prepare(`
      SELECT token_hash FROM operator_capabilities WHERE capability_id=?
    `).get(grant.capabilityId);
    const tokenHash = sha256(token);
    if (isRow(existing)) {
      if (text(existing, "token_hash") !== tokenHash) {
        throw new ProjectFabricCoreError("CONFLICT", "capability ID was reused with another token");
      }
      return;
    }
    const takeover = grant.kind === "takeover" ? grant.takeoverBinding : undefined;
    this.database.prepare(`
      INSERT INTO operator_capabilities(
        capability_id, token_hash, operator_id, project_id, project_session_id,
        project_authority_generation, session_generation, principal_generation,
        kind, operations_json, issued_at, expires_at, revoked_at, handoff_digest,
        old_chair_generation, expected_run_id, expected_run_revision,
        expected_session_revision, cas_target_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
    `).run(
      grant.capabilityId,
      tokenHash,
      grant.operatorId,
      grant.projectId,
      grant.kind === "project-launch" ? null : grant.projectSessionId,
      grant.projectAuthorityGeneration,
      grant.kind === "project-launch" ? null : grant.sessionGeneration,
      grant.principalGeneration,
      grant.kind,
      canonicalJson(grant.actions),
      timestampToMillis(grant.issuedAt),
      timestampToMillis(grant.expiresAt),
      takeover?.handoffDigest ?? null,
      takeover?.oldChairGeneration ?? null,
      takeover?.expectedRunId ?? null,
      takeover?.expectedRunRevision ?? null,
      takeover?.expectedSessionRevision ?? null,
      takeover?.targetRevision ?? null,
    );
  }

  revokeCapability(capabilityId: string): void {
    const changed = this.database.prepare(`
      UPDATE operator_capabilities SET revoked_at=? WHERE capability_id=? AND revoked_at IS NULL
    `).run(this.#clock(), capabilityId);
    if (changed.changes !== 1) throw new ProjectFabricCoreError("NOT_FOUND", "capability was not active");
  }

  executeCommand<Result>(
    context: AuthenticatedOperatorContext,
    command: OperatorMutationContext,
    target: OperatorCommandTarget,
    load: () => { revision: number; value: JsonValue },
    mutate: () => Result,
  ): Result {
    const execute = this.database.transaction((): Result => {
      const capability = this.#authenticate(context, command, target);
      const payload = {
        capabilityId: command.credential.capabilityId,
        commandId: command.commandId,
        expectedRevision: command.expectedRevision,
        actor: command.actor,
        provenance: command.provenance,
        evidenceRefs: command.evidenceRefs,
        target,
      };
      const payloadHash = sha256(canonicalJson(payload));
      const existing = this.database.prepare(`
        SELECT payload_hash, result_json FROM operator_commands
         WHERE operator_id=? AND command_id=?
      `).get(context.operatorId, command.commandId);
      if (isRow(existing)) {
        if (text(existing, "payload_hash") !== payloadHash) {
          throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "command ID was reused with changed input");
        }
        return JSON.parse(text(existing, "result_json")) as Result;
      }

      const before = load();
      if (before.revision !== command.expectedRevision) {
        throw new ProjectFabricCoreError("STALE_REVISION", "operator command revision changed", {
          expected: command.expectedRevision,
          actual: before.revision,
          current: before.value,
        });
      }
      const result = mutate();
      const after = load();
      this.database.prepare(`
        INSERT INTO operator_commands(
          operator_id, command_id, capability_id, project_id, project_session_id,
          operation, expected_revision, payload_hash, provenance_json, before_json,
          after_json, evidence_json, result_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'committed', ?)
      `).run(
        context.operatorId,
        command.commandId,
        text(capability, "capability_id"),
        target.projectId,
        target.projectSessionId ?? null,
        target.requiredAction,
        command.expectedRevision,
        payloadHash,
        canonicalJson(command.provenance),
        canonicalJson(before.value),
        canonicalJson(after.value),
        canonicalJson(command.evidenceRefs),
        canonicalJson(result),
        this.#clock(),
      );
      return result;
    });
    return execute();
  }

  #authenticate(
    context: AuthenticatedOperatorContext,
    command: OperatorMutationContext,
    target: OperatorCommandTarget,
  ): CapabilityRow {
    if (command.actor !== context.operatorId || context.projectId !== target.projectId) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "operator connection does not own the command target");
    }
    const capabilityValue = this.database.prepare(`
      SELECT * FROM operator_capabilities WHERE capability_id=? AND token_hash=?
    `).get(command.credential.capabilityId, sha256(command.credential.token));
    if (!isRow(capabilityValue)) throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "capability credential is invalid");
    const capability = capabilityValue as CapabilityRow;
    if (capability.revoked_at !== null) throw new ProjectFabricCoreError("CAPABILITY_REVOKED", "capability is revoked");
    if (integer(capability, "expires_at") <= this.#clock()) {
      throw new ProjectFabricCoreError("CAPABILITY_EXPIRED", "capability is expired");
    }
    if (text(capability, "operator_id") !== context.operatorId || text(capability, "project_id") !== target.projectId) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "capability is bound to another project or operator");
    }
    const principal = row(this.database.prepare(`
      SELECT project_id, project_authority_generation, principal_generation, state
        FROM operator_principals WHERE operator_id=?
    `).get(context.operatorId), "operator principal");
    if (text(principal, "state") !== "active") throw new ProjectFabricCoreError("CAPABILITY_REVOKED", "operator principal is revoked");
    const project = row(this.database.prepare("SELECT authority_generation FROM projects WHERE project_id=?").get(target.projectId), "project");
    const currentProjectGeneration = integer(project, "authority_generation");
    if (
      context.projectAuthorityGeneration !== currentProjectGeneration ||
      integer(principal, "project_authority_generation") !== currentProjectGeneration ||
      integer(capability, "project_authority_generation") !== currentProjectGeneration
    ) throw new ProjectFabricCoreError("STALE_GENERATION", "project authority generation is stale");
    if (
      context.principalGeneration !== integer(principal, "principal_generation") ||
      integer(capability, "principal_generation") !== context.principalGeneration
    ) throw new ProjectFabricCoreError("STALE_PRINCIPAL_GENERATION", "operator principal generation is stale");
    const capabilitySession = nullableText(capability, "project_session_id");
    if (target.projectSessionId !== undefined) {
      if (capabilitySession !== target.projectSessionId) {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "capability is not bound to the target session");
      }
      const session = row(this.database.prepare(`
        SELECT generation FROM project_sessions WHERE project_session_id=? AND project_id=?
      `).get(target.projectSessionId, target.projectId), "project session");
      const generation = integer(session, "generation");
      if (generation !== target.sessionGeneration || capability.session_generation !== generation) {
        throw new ProjectFabricCoreError("STALE_GENERATION", "project-session generation is stale");
      }
    } else if (text(capability, "kind") !== "project-launch") {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "session capability cannot perform a project-only command");
    }
    const operations: unknown = JSON.parse(text(capability, "operations_json"));
    if (!Array.isArray(operations) || !operations.includes(target.requiredAction)) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", `capability lacks ${target.requiredAction}`);
    }
    return capability;
  }
}

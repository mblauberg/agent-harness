import {
  OPERATOR_ACTIONS,
  assertOperatorCapabilityAuthority,
  type JsonValue,
  type OperatorAction,
  type OperatorCapabilityGrant,
  type OperatorMutationContext,
  type OperatorAuthorityBinding,
  type OperatorAttachRequest,
  type OperatorAttachment,
  type OperatorDetachRequest,
  type OperatorHeartbeatRequest,
  type IntegrationInputAttestationRequest,
  type OperatorInputAttestation,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import {
  ProjectFabricCoreError,
  type AuthenticatedOperatorContext,
  type AuthenticatedIntegrationContext,
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
  commandPayload: JsonValue;
};

export type AuthenticatedOperatorCredential = {
  context: AuthenticatedOperatorContext;
  capabilityId: string;
  kind: "project-launch" | "session" | "takeover";
  projectSessionId?: string;
  sessionGeneration?: number;
  actions: OperatorAction[];
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

  authenticateCredential(token: string): AuthenticatedOperatorCredential {
    if (token.length === 0) throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "capability token is empty");
    return this.authenticateCredentialHash(sha256(token));
  }

  authenticateCredentialHash(tokenHash: string): AuthenticatedOperatorCredential {
    if (!/^[0-9a-f]{64}$/u.test(tokenHash)) {
      throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "capability token hash is invalid");
    }
    const capability = this.database.prepare(`
      SELECT * FROM operator_capabilities WHERE token_hash=?
    `).get(tokenHash);
    if (!isRow(capability)) throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "capability credential is invalid");
    if (capability.revoked_at !== null) throw new ProjectFabricCoreError("CAPABILITY_REVOKED", "capability is revoked");
    if (integer(capability, "expires_at") <= this.#clock()) {
      throw new ProjectFabricCoreError("CAPABILITY_EXPIRED", "capability is expired");
    }
    const projectId = text(capability, "project_id");
    const operatorId = text(capability, "operator_id");
    const principal = row(this.database.prepare(`
      SELECT project_id, project_authority_generation, principal_generation, state
        FROM operator_principals WHERE operator_id=?
    `).get(operatorId), "operator principal");
    if (text(principal, "state") !== "active") {
      throw new ProjectFabricCoreError("CAPABILITY_REVOKED", "operator principal is revoked");
    }
    if (text(principal, "project_id") !== projectId) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "operator principal changed project");
    }
    const projectGeneration = integer(row(this.database.prepare(`
      SELECT authority_generation FROM projects WHERE project_id=?
    `).get(projectId), "project"), "authority_generation");
    if (
      integer(capability, "project_authority_generation") !== projectGeneration ||
      integer(principal, "project_authority_generation") !== projectGeneration
    ) {
      throw new ProjectFabricCoreError("STALE_GENERATION", "project authority generation is stale");
    }
    const principalGeneration = integer(principal, "principal_generation");
    if (integer(capability, "principal_generation") !== principalGeneration) {
      throw new ProjectFabricCoreError("STALE_PRINCIPAL_GENERATION", "operator principal generation is stale");
    }
    const kind = text(capability, "kind");
    if (kind !== "project-launch" && kind !== "session" && kind !== "takeover") {
      throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "operator capability kind is invalid");
    }
    const projectSessionId = nullableText(capability, "project_session_id");
    const sessionGeneration = capability.session_generation === null
      ? null
      : integer(capability, "session_generation");
    if (kind === "project-launch") {
      if (projectSessionId !== null || sessionGeneration !== null) {
        throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "project capability has a session binding");
      }
    } else {
      if (projectSessionId === null || sessionGeneration === null) {
        throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "session capability has no session binding");
      }
      const currentSessionGeneration = integer(row(this.database.prepare(`
        SELECT generation FROM project_sessions WHERE project_session_id=? AND project_id=?
      `).get(projectSessionId, projectId), "project session"), "generation");
      if (sessionGeneration !== currentSessionGeneration) {
        throw new ProjectFabricCoreError("STALE_GENERATION", "project-session generation is stale");
      }
    }
    const parsedActions: unknown = JSON.parse(text(capability, "operations_json"));
    if (
      !Array.isArray(parsedActions) ||
      parsedActions.length === 0 ||
      !parsedActions.every((action): action is OperatorAction => (
        typeof action === "string" && OPERATOR_ACTIONS.includes(action as OperatorAction)
      ))
    ) {
      throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "operator capability actions are invalid");
    }
    return {
      context: {
        operatorId: operatorId as never,
        projectId: projectId as never,
        projectAuthorityGeneration: projectGeneration,
        principalGeneration,
      },
      capabilityId: text(capability, "capability_id"),
      kind,
      ...(projectSessionId === null ? {} : { projectSessionId }),
      ...(sessionGeneration === null ? {} : { sessionGeneration }),
      actions: [...parsedActions],
    };
  }

  attach(
    context: AuthenticatedOperatorContext,
    request: OperatorAttachRequest,
    daemonInstanceGeneration: number,
  ): OperatorAttachment {
    const clientId = this.#clientId(request.command);
    const session = request.projectSessionId === undefined
      ? undefined
      : row(this.database.prepare(`
          SELECT generation, revision FROM project_sessions WHERE project_session_id=? AND project_id=?
        `).get(request.projectSessionId, request.projectId), "project session");
    return this.executeCommand(
      context,
      request.command,
      {
        projectId: request.projectId,
        ...(request.projectSessionId === undefined ? {} : {
          projectSessionId: request.projectSessionId,
          sessionGeneration: integer(session as Row, "generation"),
        }),
        requiredAction: "read",
        commandPayload: {
          projectId: request.projectId,
          ...(request.projectSessionId === undefined ? {} : { projectSessionId: request.projectSessionId }),
          ...(request.expectedAttachmentGeneration === undefined
            ? {}
            : { expectedAttachmentGeneration: request.expectedAttachmentGeneration }),
          requestedExpiresAt: request.requestedExpiresAt,
          daemonInstanceGeneration,
        },
      },
      () => request.projectSessionId === undefined
        ? this.#projectRevision(request.projectId)
        : {
            revision: integer(session as Row, "revision"),
            value: { projectSessionId: request.projectSessionId, revision: integer(session as Row, "revision") },
          },
      () => {
        const requestedExpiry = timestampToMillis(request.requestedExpiresAt);
        const capability = row(this.database.prepare(`
          SELECT expires_at FROM operator_capabilities WHERE capability_id=?
        `).get(request.command.credential.capabilityId), "operator capability");
        if (requestedExpiry > integer(capability, "expires_at")) {
          throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "attachment cannot outlive its capability");
        }
        const existing = this.database.prepare(`
          SELECT lease_generation, state, project_id, project_session_id
            FROM operator_client_attachments WHERE attachment_id=?
        `).get(clientId);
        const now = this.#clock();
        if (isRow(existing)) {
          if (
            text(existing, "project_id") !== request.projectId ||
            text(existing, "state") !== "active" ||
            integer(existing, "lease_generation") !== request.expectedAttachmentGeneration
          ) {
            throw new ProjectFabricCoreError("STALE_GENERATION", "operator attachment generation changed");
          }
          const priorSession = nullableText(existing, "project_session_id");
          if (priorSession !== null && priorSession !== request.projectSessionId) {
            throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "attachment cannot widen or switch sessions");
          }
          this.database.prepare(`
            UPDATE operator_client_attachments
               SET project_session_id=?, session_generation=?, daemon_instance_generation=?,
                   lease_generation=lease_generation+1, expires_at=?, revision=revision+1,
                   updated_at=?
             WHERE attachment_id=?
          `).run(
            request.projectSessionId ?? null,
            session === undefined ? null : integer(session, "generation"),
            daemonInstanceGeneration,
            requestedExpiry,
            now,
            clientId,
          );
        } else {
          if (request.expectedAttachmentGeneration !== undefined) {
            throw new ProjectFabricCoreError("STALE_GENERATION", "operator attachment does not exist");
          }
          this.database.prepare(`
            INSERT INTO operator_client_attachments(
              attachment_id, operator_id, project_id, project_authority_generation,
              project_session_id, session_generation, daemon_instance_generation,
              lease_generation, state, expires_at, revision, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, 1, ?, ?)
          `).run(
            clientId,
            context.operatorId,
            request.projectId,
            context.projectAuthorityGeneration,
            request.projectSessionId ?? null,
            session === undefined ? null : integer(session, "generation"),
            daemonInstanceGeneration,
            requestedExpiry,
            now,
            now,
          );
        }
        return this.#attachment(clientId);
      },
    );
  }

  heartbeat(
    context: AuthenticatedOperatorContext,
    request: OperatorHeartbeatRequest,
  ): OperatorAttachment {
    const clientId = this.#clientId(request.command);
    const current = this.#attachmentRow(clientId);
    const projectSessionId = nullableText(current, "project_session_id");
    return this.executeCommand(
      context,
      request.command,
      {
        projectId: text(current, "project_id"),
        ...(projectSessionId === null ? {} : {
          projectSessionId,
          sessionGeneration: integer(current, "session_generation"),
        }),
        requiredAction: "read",
        commandPayload: {
          attachmentGeneration: request.attachmentGeneration,
          extendUntil: request.extendUntil,
        },
      },
      () => ({ revision: integer(this.#attachmentRow(clientId), "revision"), value: this.#attachment(clientId) }),
      () => {
        if (integer(current, "lease_generation") !== request.attachmentGeneration) {
          throw new ProjectFabricCoreError("STALE_GENERATION", "operator attachment generation changed");
        }
        const expiry = timestampToMillis(request.extendUntil);
        const capability = row(this.database.prepare(`
          SELECT expires_at FROM operator_capabilities WHERE capability_id=?
        `).get(request.command.credential.capabilityId), "operator capability");
        if (expiry > integer(capability, "expires_at")) {
          throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "attachment cannot outlive its capability");
        }
        this.database.prepare(`
          UPDATE operator_client_attachments
             SET lease_generation=lease_generation+1, expires_at=?, revision=revision+1, updated_at=?
           WHERE attachment_id=? AND state='active'
        `).run(expiry, this.#clock(), clientId);
        return this.#attachment(clientId);
      },
    );
  }

  detach(
    context: AuthenticatedOperatorContext,
    request: OperatorDetachRequest,
  ): { detached: true; revision: number } {
    const clientId = this.#clientId(request.command);
    const current = this.#attachmentRow(clientId);
    const projectSessionId = nullableText(current, "project_session_id");
    return this.executeCommand(
      context,
      request.command,
      {
        projectId: text(current, "project_id"),
        ...(projectSessionId === null ? {} : {
          projectSessionId,
          sessionGeneration: integer(current, "session_generation"),
        }),
        requiredAction: "read",
        commandPayload: { attachmentGeneration: request.attachmentGeneration },
      },
      () => ({ revision: integer(this.#attachmentRow(clientId), "revision"), value: this.#attachment(clientId) }),
      () => {
        if (integer(current, "lease_generation") !== request.attachmentGeneration) {
          throw new ProjectFabricCoreError("STALE_GENERATION", "operator attachment generation changed");
        }
        const revision = integer(current, "revision") + 1;
        this.database.prepare(`
          UPDATE operator_client_attachments SET state='detached', revision=?, updated_at=?
           WHERE attachment_id=? AND state='active'
        `).run(revision, this.#clock(), clientId);
        return { detached: true as const, revision };
      },
    );
  }

  recordInputAttestation(
    context: AuthenticatedIntegrationContext,
    request: IntegrationInputAttestationRequest,
  ): OperatorInputAttestation {
    const action = this.database.transaction((): OperatorInputAttestation => {
      if (
        context.integrationId !== request.context.integrationId ||
        context.integrationId !== request.attestation.integrationId ||
        context.principalGeneration !== request.context.expectedIntegrationGeneration ||
        context.principalGeneration !== request.attestation.integrationGeneration
      ) {
        throw new ProjectFabricCoreError("STALE_PRINCIPAL_GENERATION", "integration identity or generation changed");
      }
      if (context.projectId !== request.attestation.projectId) {
        throw new ProjectFabricCoreError("WRONG_PROJECT", "attestation is bound to another project");
      }
      if (
        request.context.eventId !== request.attestation.providerEvent.inputEventId ||
        request.context.eventDigest !== request.attestation.providerEvent.eventDigest ||
        request.attestation.providerEvent.classification !== "direct-human"
      ) {
        throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "attestation does not match the immutable direct-human event");
      }
      const existing = this.database.prepare(`
        SELECT provider_event_json, exact_utterance, artifact_digests_json,
               expected_gate_revision, interpreted_decision
          FROM operator_input_attestations
         WHERE attestation_id=? OR (project_session_id=? AND provider_message_id=?)
      `).get(
        request.attestation.attestationId,
        request.attestation.projectSessionId,
        request.attestation.providerEvent.providerMessageId,
      );
      if (isRow(existing)) {
        const reconstructed = canonicalJson({
          providerEvent: JSON.parse(text(existing, "provider_event_json")),
          humanUtterance: text(existing, "exact_utterance"),
          expectedGateRevision: integer(existing, "expected_gate_revision"),
          artifactDigests: JSON.parse(text(existing, "artifact_digests_json")),
          interpretedDecision: text(existing, "interpreted_decision"),
        });
        const incoming = canonicalJson({
          providerEvent: request.attestation.providerEvent,
          humanUtterance: request.attestation.humanUtterance,
          expectedGateRevision: request.attestation.gateBinding.expectedGateRevision,
          artifactDigests: request.attestation.gateBinding.artifactDigests,
          interpretedDecision: request.attestation.gateBinding.interpretedDecision,
        });
        if (reconstructed !== incoming) {
          throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "attestation identity was reused with changed evidence");
        }
        return request.attestation;
      }
      const gate = row(this.database.prepare(`
        SELECT g.coordination_run_id, g.revision, g.expected_approver_ref, s.project_id
          FROM scoped_gates g
          JOIN project_sessions s ON s.project_session_id=g.project_session_id
         WHERE g.gate_id=? AND g.project_session_id=?
      `).get(request.attestation.gateBinding.gateId, request.attestation.projectSessionId), "scoped gate");
      if (text(gate, "project_id") !== context.projectId) {
        throw new ProjectFabricCoreError("WRONG_PROJECT", "gate is outside the integration project");
      }
      if (integer(gate, "revision") !== request.attestation.gateBinding.expectedGateRevision) {
        throw new ProjectFabricCoreError("STALE_REVISION", "gate revision changed");
      }
      const principal = row(this.database.prepare(`
        SELECT project_id, state FROM operator_principals WHERE operator_id=?
      `).get(request.attestation.operatorId), "operator principal");
      if (text(principal, "project_id") !== context.projectId || text(principal, "state") !== "active") {
        throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "attested operator is not active for the project");
      }
      const expectedApprover = text(gate, "expected_approver_ref");
      if (expectedApprover !== request.attestation.operatorId && expectedApprover !== "authenticated-operator") {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "attested operator is not the expected approver");
      }
      this.database.prepare(`
        INSERT INTO operator_input_attestations(
          attestation_id, integration_id, integration_generation, operator_id,
          project_id, project_session_id, coordination_run_id, gate_id,
          provider_message_id, exact_utterance, provider_event_json,
          expected_gate_revision, artifact_digests_json, interpreted_decision, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        request.attestation.attestationId,
        context.integrationId,
        context.principalGeneration,
        request.attestation.operatorId,
        context.projectId,
        request.attestation.projectSessionId,
        text(gate, "coordination_run_id"),
        request.attestation.gateBinding.gateId,
        request.attestation.providerEvent.providerMessageId,
        request.attestation.humanUtterance,
        canonicalJson(request.attestation.providerEvent),
        request.attestation.gateBinding.expectedGateRevision,
        canonicalJson(request.attestation.gateBinding.artifactDigests),
        request.attestation.gateBinding.interpretedDecision,
        timestampToMillis(request.attestation.recordedAt),
      );
      return request.attestation;
    });
    return action();
  }

  executeCommand<Result>(
    context: AuthenticatedOperatorContext,
    command: OperatorMutationContext,
    target: OperatorCommandTarget,
    load: () => { revision: number; value: JsonValue },
    mutate: () => Result,
  ): Result {
    const execute = this.database.transaction((): Result => {
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
        this.#authenticate(context, command, target, true);
        return JSON.parse(text(existing, "result_json")) as Result;
      }

      const capability = this.#authenticate(context, command, target, false);
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
    replay: boolean,
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
      if (
        capability.session_generation !== target.sessionGeneration ||
        (!replay && generation !== target.sessionGeneration)
      ) {
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

  #projectRevision(projectId: string): { revision: number; value: { projectId: string; revision: number } } {
    const project = row(this.database.prepare("SELECT revision FROM projects WHERE project_id=?").get(projectId), "project");
    const revision = integer(project, "revision");
    return { revision, value: { projectId, revision } };
  }

  #clientId(command: OperatorMutationContext): string {
    if (command.provenance.kind !== "console-direct-input") {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator attachment requires direct Console provenance");
    }
    return command.provenance.clientId;
  }

  #attachmentRow(clientId: string): Row {
    return row(this.database.prepare(`
      SELECT * FROM operator_client_attachments WHERE attachment_id=?
    `).get(clientId), "operator attachment");
  }

  #attachment(clientId: string): OperatorAttachment {
    const stored = this.#attachmentRow(clientId);
    const session = nullableText(stored, "project_session_id");
    return {
      clientId,
      projectId: text(stored, "project_id") as never,
      projectAuthorityGeneration: integer(stored, "project_authority_generation"),
      projectSessionId: session as never,
      generation: integer(stored, "lease_generation"),
      expiresAt: new Date(integer(stored, "expires_at")).toISOString() as never,
    };
  }
}

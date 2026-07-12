import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

import {
  parseOperatorCapabilityGrant,
  type OperatorId,
  type ProjectId,
  type OperatorMutationContext,
  type OperatorAttachRequest,
  type IntegrationInputAttestationRequest,
  type IntegrationId,
  type ScopedGateResolveRequest,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations, type Migration } from "../../../src/core/migrations.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
import { ScopedGateStore } from "../../../src/gates/store.ts";
import type { AuthenticatedOperatorContext } from "../../../src/project-session/contracts.ts";
import { preflightProjectSessionOperations } from "../../../src/persistence/project-session-preflight.ts";

const databases: Database.Database[] = [];
const digestA = `sha256:${"a".repeat(64)}`;
const digest = `sha256:${"b".repeat(64)}`;
const digestC = `sha256:${"c".repeat(64)}`;

function migration(version: number, filename: string, preflight?: Migration["preflight"]): Migration {
  return {
    version,
    name: filename.replace(/^[0-9]+-/u, "").replace(/\.sql$/u, ""),
    sql: readFileSync(new URL(`../../../migrations/${filename}`, import.meta.url), "utf8"),
    ...(preflight === undefined ? {} : { preflight }),
  };
}

function setup(options: { now?: number; actions?: string[]; expiresAt?: string } = {}) {
  const database = new Database(":memory:");
  databases.push(database);
  applyMigrations(database, [
    migration(1, "0001-core.sql"),
    migration(2, "0002-observer-event-sequence.sql"),
    migration(3, "0003-integrity-and-query-plans.sql"),
    migration(4, "0004-project-session-operations.sql", preflightProjectSessionOperations),
  ]);
  database.exec(`
    INSERT INTO projects(project_id, canonical_root, revision, authority_generation, created_at, updated_at)
    VALUES ('project_01', '/project/one', 1, 1, 1, 1);
    INSERT INTO project_sessions(
      project_session_id, project_id, mode, state, revision, generation, authority_ref,
      budget_ref, launch_packet_path, launch_packet_digest, membership_revision,
      origin_kind, origin_operator_id, created_at, updated_at
    ) VALUES (
      'session_01', 'project_01', 'coordinated', 'active', 1, 1,
      '${digest}', 'budget_01', 'docs/spec.md', '${digest}', 1,
      'operator-launch', 'operator_01', 1, 1
    );
  `);
  const store = new OperatorStore({ database, clock: () => options.now ?? Date.parse("2027-01-01T00:00:00Z") });
  store.registerPrincipal({
    operatorId: "operator_01",
    projectId: "project_01",
    authenticatedSubjectHash: "subject-hash",
    projectAuthorityGeneration: 1,
  });
  const grant = parseOperatorCapabilityGrant({
    capabilityId: "cap_session",
    operatorId: "operator_01",
    projectId: "project_01",
    projectAuthorityGeneration: 1,
    principalGeneration: 1,
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: options.expiresAt ?? "2099-01-01T00:00:00Z",
    status: "active",
    kind: "session",
    projectSessionId: "session_01",
    sessionGeneration: 1,
    actions: options.actions ?? ["read", "decide"],
  });
  store.issueCapability(grant, "session-secret");
  const context: AuthenticatedOperatorContext = {
    operatorId: "operator_01" as OperatorId,
    projectId: "project_01" as ProjectId,
    projectAuthorityGeneration: 1,
    principalGeneration: 1,
  };
  const command = {
    credential: { capabilityId: "cap_session", token: "session-secret" },
    commandId: "command_01",
    expectedRevision: 1,
    actor: "operator_01",
    provenance: { kind: "console-direct-input", clientId: "console_01", inputEventId: "input_01" },
    evidenceRefs: [{ path: "docs/spec.md", digest }],
  } as unknown as OperatorMutationContext;
  const target = {
    projectId: "project_01",
    projectSessionId: "session_01",
    sessionGeneration: 1,
    requiredAction: "decide" as const,
    commandPayload: { decision: "continue" },
  };
  const execute = (commandOverride = command, contextOverride = context) => store.executeCommand(
    contextOverride,
    commandOverride,
    target,
    () => {
      const current = database.prepare("SELECT revision FROM projects WHERE project_id='project_01'").get() as { revision: number };
      return { revision: current.revision, value: { revision: current.revision } };
    },
    () => {
      database.prepare("UPDATE projects SET revision=revision+1 WHERE project_id='project_01'").run();
      return { committed: true, revision: 2 };
    },
  );
  return { database, store, context, command, target, execute };
}

function seedAttestationGate(fixture: ReturnType<typeof setup>): void {
  fixture.database.exec(`
    INSERT INTO runs(
      run_id, chair_agent_id, workspace_root, project_run_directory, created_at,
      project_session_id, lifecycle_state, revision, chair_generation, chair_lease_id,
      authority_ref, budget_ref, dependency_revision, topology_slot
    ) VALUES (
      'run_01', 'chair_01', '/project/one', NULL, 1,
      'session_01', 'active', 1, 1, 'chair:run_01:1',
      '${digest}', 'budget_01', 1, 1
    );
    INSERT INTO authorities(authority_id, run_id, parent_authority_id, authority_json, authority_hash, created_at)
    VALUES ('authority_01', 'run_01', NULL, '{}', '${"d".repeat(64)}', 1);
    INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, provider_session_ref, lifecycle)
    VALUES ('run_01', 'chair_01', NULL, 'authority_01', 'provider_01', 'ready');
  `);
  fixture.database.prepare(`
    INSERT INTO scoped_gates(
      gate_id, project_session_id, coordination_run_id, dedupe_key, scope_kind,
      scope_task_id, dependency_revision, blocked_operation_ids_json,
      enforcement_points_json, question, reason, options_json, recommendation,
      consequences_json, evidence_refs_json, created_by_ref, expected_approver_ref,
      status, human_required, revision, created_at, updated_at
    ) VALUES (
      'gate_01', 'session_01', 'run_01', 'gate-dedupe', 'run', NULL, 1,
      '[]', '["scoped-barrier"]', 'Proceed?', 'Human decision', '["approve","reject"]',
      '', '[]', ?, 'policy:spec', 'authenticated-human-operator', 'pending', 1, 1, 1, 1
    )
  `).run(JSON.stringify([
    { path: "evidence/a.json", digest: digestA },
    { path: "evidence/b.json", digest },
  ]));
}

function attestationRequest(options: {
  suffix?: string;
  artifactDigests?: readonly string[];
} = {}): IntegrationInputAttestationRequest {
  const suffix = options.suffix ?? "01";
  const eventDigest = digestC;
  return {
    context: {
      commandId: `attest_command_${suffix}`,
      integrationId: "integration_01",
      expectedIntegrationGeneration: 3,
      eventId: `input_event_${suffix}`,
      eventDigest,
    },
    attestation: {
      attestationId: `attestation_${suffix}`,
      integrationId: "integration_01",
      integrationGeneration: 3,
      operatorId: "operator_01",
      projectId: "project_01",
      projectSessionId: "session_01",
      providerEvent: {
        providerId: "codex",
        providerSessionRef: "provider_01",
        providerMessageId: `provider_message_${suffix}`,
        inputEventId: `input_event_${suffix}`,
        eventDigest,
        classification: "direct-human",
      },
      humanUtterance: "Approve.",
      gateBinding: {
        gateId: "gate_01",
        expectedGateRevision: 1,
        artifactDigests: options.artifactDigests ?? [digestA, digest],
        interpretedDecision: "approve",
      },
      recordedAt: "2027-01-01T00:00:00Z",
    },
  } as unknown as IntegrationInputAttestationRequest;
}

const integrationContext = {
  integrationId: "integration_01" as IntegrationId,
  projectId: "project_01" as ProjectId,
  principalGeneration: 3,
};

function attestedResolution(fixture: ReturnType<typeof setup>): ScopedGateResolveRequest {
  return {
    command: {
      ...fixture.command,
      commandId: "resolve_attested_gate",
      provenance: {
        kind: "attested-provider-input",
        attestationId: "attestation_01",
        integrationId: "integration_01",
        integrationGeneration: 3,
      },
    },
    gateId: "gate_01",
    status: "approved",
    decisionEvidence: {
      kind: "attested-input",
      attestationId: "attestation_01",
      expectedIntegrationGeneration: 3,
    },
  } as unknown as ScopedGateResolveRequest;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("operator capability and command boundary", () => {
  it("resolves a bearer token to its current principal and abstract actions without returning the token", () => {
    const fixture = setup();
    expect(fixture.store.authenticateCredential("session-secret")).toEqual({
      context: fixture.context,
      capabilityId: "cap_session",
      kind: "session",
      projectSessionId: "session_01",
      sessionGeneration: 1,
      actions: ["read", "decide"],
    });
    expect(() => fixture.store.authenticateCredential("wrong-secret")).toThrowError(
      expect.objectContaining({ code: "AUTHENTICATION_FAILED" }),
    );
    fixture.store.revokeCapability("cap_session");
    expect(() => fixture.store.authenticateCredential("session-secret")).toThrowError(
      expect.objectContaining({ code: "CAPABILITY_REVOKED" }),
    );
  });

  it("rejects an absent capability with zero state or audit mutation", () => {
    const fixture = setup();
    const missing = {
      ...fixture.command,
      credential: { capabilityId: "cap_missing", token: "wrong" },
    } as unknown as OperatorMutationContext;
    expect(() => fixture.execute(missing)).toThrowError(expect.objectContaining({ code: "AUTHENTICATION_FAILED" }));
    expect(fixture.database.prepare("SELECT revision FROM projects WHERE project_id='project_01'").get()).toEqual({ revision: 1 });
    expect(fixture.database.prepare("SELECT count(*) AS count FROM operator_commands").get()).toEqual({ count: 0 });
  });

  it("rejects expired, revoked, wrong-project, stale-generation, insufficient-action and stale-revision commands", () => {
    const expired = setup({ now: Date.parse("2030-01-01T00:00:00Z"), expiresAt: "2029-01-01T00:00:00Z" });
    expect(() => expired.execute()).toThrowError(expect.objectContaining({ code: "CAPABILITY_EXPIRED" }));

    const revoked = setup();
    revoked.store.revokeCapability("cap_session");
    expect(() => revoked.execute()).toThrowError(expect.objectContaining({ code: "CAPABILITY_REVOKED" }));

    const wrongProject = setup();
    expect(() => wrongProject.execute(wrongProject.command, {
      ...wrongProject.context,
      projectId: "project_other" as ProjectId,
    })).toThrowError(expect.objectContaining({ code: "WRONG_PROJECT" }));

    const staleProject = setup();
    staleProject.database.prepare("UPDATE projects SET authority_generation=2 WHERE project_id='project_01'").run();
    expect(() => staleProject.execute()).toThrowError(expect.objectContaining({ code: "STALE_GENERATION" }));

    const stalePrincipal = setup();
    stalePrincipal.database.prepare("UPDATE operator_principals SET principal_generation=2 WHERE operator_id='operator_01'").run();
    expect(() => stalePrincipal.execute()).toThrowError(expect.objectContaining({ code: "STALE_PRINCIPAL_GENERATION" }));

    const staleSession = setup();
    staleSession.database.prepare("UPDATE project_sessions SET generation=2 WHERE project_session_id='session_01'").run();
    expect(() => staleSession.execute()).toThrowError(expect.objectContaining({ code: "STALE_GENERATION" }));

    const insufficient = setup({ actions: ["read"] });
    expect(() => insufficient.execute()).toThrowError(expect.objectContaining({ code: "CAPABILITY_FORBIDDEN" }));

    const staleRevision = setup();
    const staleCommand = { ...staleRevision.command, expectedRevision: 2 } as unknown as OperatorMutationContext;
    expect(() => staleRevision.execute(staleCommand)).toThrowError(expect.objectContaining({ code: "STALE_REVISION" }));
  });

  it("replays one effect, conflicts on a changed payload, and never audits the token", () => {
    const fixture = setup();
    const first = fixture.execute();
    expect(fixture.execute()).toEqual(first);
    expect(fixture.database.prepare("SELECT revision FROM projects WHERE project_id='project_01'").get()).toEqual({ revision: 2 });
    const audit = fixture.database.prepare("SELECT * FROM operator_commands").get() as Record<string, unknown>;
    expect(audit).toMatchObject({
      operator_id: "operator_01",
      command_id: "command_01",
      operation: "decide",
      expected_revision: 1,
      status: "committed",
    });
    expect(JSON.stringify(audit)).not.toContain("session-secret");
    expect(() => fixture.store.executeCommand(
      fixture.context,
      fixture.command,
      { ...fixture.target, commandPayload: { decision: "stop" } },
      () => ({ revision: 2, value: { revision: 2 } }),
      () => ({ committed: true }),
    )).toThrowError(expect.objectContaining({ code: "DEDUPE_CONFLICT" }));
  });

  it("persists a generation-fenced project-only attachment before a session is selected", () => {
    const fixture = setup();
    const launchGrant = parseOperatorCapabilityGrant({
      capabilityId: "cap_launch",
      operatorId: "operator_01",
      projectId: "project_01",
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2099-01-01T00:00:00Z",
      status: "active",
      kind: "project-launch",
      actions: ["read", "launch"],
    });
    fixture.store.issueCapability(launchGrant, "launch-secret");
    const request = {
      command: {
        ...fixture.command,
        credential: { capabilityId: "cap_launch", token: "launch-secret" },
        commandId: "command_attach",
      },
      projectId: "project_01",
      requestedExpiresAt: "2028-01-01T00:00:00Z",
    } as unknown as OperatorAttachRequest;

    expect(fixture.store.attach(fixture.context, request, 7)).toMatchObject({
      clientId: "console_01",
      projectId: "project_01",
      projectAuthorityGeneration: 1,
      projectSessionId: null,
      generation: 1,
      expiresAt: "2028-01-01T00:00:00.000Z",
    });
    expect(fixture.database.prepare(`
      SELECT project_session_id, project_authority_generation, daemon_instance_generation, state
        FROM operator_client_attachments
    `).get()).toEqual({
      project_session_id: null,
      project_authority_generation: 1,
      daemon_instance_generation: 7,
      state: "active",
    });
  });

  it("accepts only an exact direct-human attestation bound to the current gate revision", () => {
    const fixture = setup();
    seedAttestationGate(fixture);
    const request = attestationRequest();

    expect(fixture.store.recordInputAttestation(integrationContext, request)).toEqual(request.attestation);
    expect(fixture.store.recordInputAttestation(integrationContext, request)).toEqual(request.attestation);
    for (const [suffix, artifactDigests] of [
      ["missing", [digestA]],
      ["extra", [digestA, digest, digestC]],
      ["wrong", [digestA, digestC]],
      ["duplicate", [digestA, digestA, digest]],
      ["reordered", [digest, digestA]],
    ] as const) {
      expect(() => fixture.store.recordInputAttestation(
        integrationContext,
        attestationRequest({ suffix, artifactDigests }),
      )).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
    }
    const stale = {
      ...request,
      attestation: {
        ...request.attestation,
        gateBinding: { ...request.attestation.gateBinding, expectedGateRevision: 2 },
      },
    } as IntegrationInputAttestationRequest;
    expect(() => fixture.store.recordInputAttestation(integrationContext, stale)).toThrowError(
      expect.objectContaining({ code: "DEDUPE_CONFLICT" }),
    );
    const gates = new ScopedGateStore({ database: fixture.database, operatorStore: fixture.store, clock: () => 1 });
    expect(gates.resolveGate(fixture.context, attestedResolution(fixture))).toMatchObject({
      status: "approved",
      revision: 2,
      resolution: { kind: "attested-input", attestationId: "attestation_01" },
    });
  });

  it("rechecks the attested canonical artifact digests when resolving the gate", () => {
    const fixture = setup();
    seedAttestationGate(fixture);
    const request = attestationRequest();
    fixture.store.recordInputAttestation(integrationContext, request);
    fixture.database.prepare(`
      UPDATE operator_input_attestations SET artifact_digests_json=? WHERE attestation_id='attestation_01'
    `).run(JSON.stringify([digestC]));
    const gates = new ScopedGateStore({ database: fixture.database, operatorStore: fixture.store, clock: () => 1 });

    expect(() => gates.resolveGate(fixture.context, attestedResolution(fixture))).toThrowError(
      expect.objectContaining({ code: "STALE_REVISION" }),
    );
    expect(gates.getGate("gate_01")).toMatchObject({ status: "pending", revision: 1 });
  });
});

import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FABRIC_OPERATIONS,
  parseIntakeRevisionRequest,
  parseOperatorCapabilityGrant,
  type IntakeRevisionRequest,
} from "@local/agent-fabric-protocol";
import { describe, expect, it } from "vitest";

import { openFabric, type Fabric } from "../../../src/index.ts";
import type { PublicProtocolContext } from "../../../src/daemon/public-protocol.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
import { ROOT_AUTHORITY } from "../../support/stage1-fixture.ts";

const now = Date.parse("2027-01-01T00:00:00Z");
const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;

type RoutingFixture = {
  fabric: Fabric;
  directory: string;
  databasePath: string;
  projectId: string;
  projectSessionId: string;
  operatorContext: PublicProtocolContext;
  chairContext: PublicProtocolContext;
};

async function setupRoutingFixture(): Promise<RoutingFixture> {
  const directory = await mkdtemp(join(tmpdir(), "fabric-intake-revision-routing-"));
  const databasePath = join(directory, "fabric.sqlite3");
  const initial = await openFabric({ databasePath, workspaceRoots: [directory], clock: () => now });
  const created = await initial.createRun({
    runId: "run_intake_revision",
    workspaceRoot: directory,
    chair: {
      agentId: "chair_01",
      authority: {
        ...ROOT_AUTHORITY,
        actions: [...new Set([...ROOT_AUTHORITY.actions, FABRIC_OPERATIONS.intakeRevise])],
      },
    },
  });
  await initial.close();

  const database = new Database(databasePath);
  let projectId = "";
  let projectSessionId = "";
  try {
    database.pragma("foreign_keys = ON");
    const identity = database.prepare(`
      SELECT p.project_id, p.authority_generation, s.project_session_id, s.generation
        FROM projects p JOIN project_sessions s ON s.project_id=p.project_id
       JOIN runs r ON r.project_session_id=s.project_session_id
       WHERE r.run_id='run_intake_revision'
    `).get() as {
      project_id: string;
      authority_generation: number;
      project_session_id: string;
      generation: number;
    };
    projectId = identity.project_id;
    projectSessionId = identity.project_session_id;
    database.prepare(`
      UPDATE run_chair_leases SET status='active'
       WHERE project_session_id=? AND run_id='run_intake_revision' AND generation=1
    `).run(projectSessionId);
    database.prepare(`
      INSERT INTO scoped_gates(
        gate_id, project_session_id, coordination_run_id, dedupe_key, scope_kind,
        scope_task_id, dependency_revision, blocked_operation_ids_json,
        enforcement_points_json, question, reason, options_json, recommendation,
        consequences_json, evidence_refs_json, created_by_ref, expected_approver_ref,
        deadline, default_action, status, human_required, release_binding_json,
        revision, created_at, updated_at
      ) VALUES (
        'gate_routing', ?, 'run_intake_revision', 'gate-routing', 'run', NULL, 1, '[]',
        '["scoped-barrier"]', 'Routing gate?', 'Required.', '["approve"]', 'approve',
        '[]', '[]', 'agent:chair_01', 'authenticated-human-operator', NULL, NULL,
        'pending', 1, NULL, 2, ?, ?
      )
    `).run(projectSessionId, now, now);
    database.prepare(`
      INSERT INTO intakes(
        intake_id, project_id, project_session_id, coordination_run_id, dedupe_key,
        state, revision, chair_request_id, chair_request_revision, summary,
        artifact_refs_json, gate_ids_json, payload_digest, created_at, updated_at
      ) VALUES (
        'intake_routing', ?, ?, 'run_intake_revision', 'intake-routing',
        'awaiting-chair', 2, 'message_intake_routing', 1, 'Discuss routing', ?,
        '["gate_routing"]', ?, ?, ?
      )
    `).run(
      projectId,
      projectSessionId,
      JSON.stringify([{ path: "docs/spec.md", digest: digestA }]),
      digestA,
      now,
      now,
    );
    database.prepare(`
      INSERT INTO intake_revisions(intake_id, revision, state, payload_json, payload_digest, actor_ref, created_at)
      VALUES
        ('intake_routing', 1, 'draft', '{}', ?, 'operator_routing', ?),
        ('intake_routing', 2, 'awaiting-chair', '{}', ?, 'operator_routing', ?)
    `).run(digestA, now, digestA, now);
    database.prepare(`
      INSERT INTO intake_artifact_bindings(intake_id, intake_revision, relative_path, sha256)
      VALUES ('intake_routing', 2, 'docs/spec.md', ?)
    `).run(digestA);
    database.prepare(`
      INSERT INTO intake_gate_bindings(intake_id, intake_revision, gate_id, gate_revision)
      VALUES ('intake_routing', 2, 'gate_routing', 2)
    `).run();
    database.prepare(`
      INSERT INTO messages(
        message_id, run_id, sender_id, dedupe_key, payload_hash, audience_json,
        kind, body, requires_ack, conversation_id, reply_to_message_id,
        task_revision, hop_count, expires_at, created_at
      ) VALUES (
        'message_intake_routing', 'run_intake_revision', 'chair_01', 'intake-routing-one',
        'payload-one', '{"agentId":"chair_01","kind":"agent"}', 'request',
        'Discuss routing', 1, 'conversation_intake_routing', NULL, 1, 0, ?, ?
      )
    `).run(Date.parse("2099-01-01T00:00:00Z"), now);

    const operatorStore = new OperatorStore({ database, clock: () => now });
    operatorStore.registerPrincipal({
      operatorId: "operator_routing",
      projectId,
      authenticatedSubjectHash: "routing-subject-hash",
      projectAuthorityGeneration: identity.authority_generation,
    });
    operatorStore.issueCapability(parseOperatorCapabilityGrant({
      capabilityId: "cap_intake_routing",
      operatorId: "operator_routing",
      projectId,
      projectSessionId,
      projectAuthorityGeneration: identity.authority_generation,
      sessionGeneration: identity.generation,
      principalGeneration: 1,
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2099-01-01T00:00:00Z",
      status: "active",
      kind: "session",
      actions: ["read", "decide"],
    }), "intake-routing-secret");
  } finally {
    database.close();
  }

  const fabric = await openFabric({ databasePath, workspaceRoots: [directory], clock: () => now });
  const operator = fabric.verifyProtocolCredential("intake-routing-secret");
  if (operator.principal.kind !== "operator") throw new Error("expected operator principal");
  const chair = fabric.verifyProtocolCredential(created.chairCapability);
  if (chair.principal.kind !== "agent") throw new Error("expected chair principal");
  return {
    fabric,
    directory,
    databasePath,
    projectId,
    projectSessionId,
    operatorContext: {
      principal: operator.principal,
      allowedOperations: new Set(operator.grantedOperations),
      features: ["intakes.v1"],
      connectionNonce: "connection_intake_operator",
      credentialHash: createHash("sha256").update("intake-routing-secret").digest("hex"),
      daemonInstanceGeneration: 1,
    },
    chairContext: {
      principal: chair.principal,
      allowedOperations: new Set(chair.grantedOperations),
      features: ["intakes.v1"],
      connectionNonce: "connection_intake_chair",
      credentialHash: createHash("sha256").update(created.chairCapability).digest("hex"),
      daemonInstanceGeneration: 1,
    },
  };
}

function operatorRequest(fixture: RoutingFixture): Extract<IntakeRevisionRequest, { origin: "operator" }> {
  const parsed = parseIntakeRevisionRequest({
    origin: "operator",
    command: {
      credential: { capabilityId: "cap_intake_routing", token: "intake-routing-secret" },
      commandId: "command_intake_routing_operator",
      expectedRevision: 2,
      actor: "operator_routing",
      provenance: { kind: "console-direct-input", clientId: "console_routing", inputEventId: "input_routing" },
      evidenceRefs: [{ path: "plans/routing.md", digest: digestB }],
    },
    intakeId: "intake_routing",
    projectSessionId: fixture.projectSessionId,
    coordinationRunId: "run_intake_revision",
    expectedRevision: 2,
    state: "discussing",
    summary: "Discuss authenticated routing",
    artifactRefs: [{ path: "plans/routing.md", digest: digestB }],
    gateIds: ["gate_routing"],
  });
  if (parsed.origin !== "operator") throw new Error("expected operator revision");
  return parsed;
}

function chairRequest(fixture: RoutingFixture): Extract<IntakeRevisionRequest, { origin: "chair" }> {
  const parsed = parseIntakeRevisionRequest({
    origin: "chair",
    command: {
      commandId: "command_intake_routing_chair",
      agentId: "chair_01",
      projectSessionId: fixture.projectSessionId,
      coordinationRunId: "run_intake_revision",
      principalGeneration: 1,
      chairLeaseId: "chair:run_intake_revision:1",
      chairLeaseGeneration: 1,
      expectedRunRevision: 1,
      expectedRevision: 2,
    },
    intakeId: "intake_routing",
    projectSessionId: fixture.projectSessionId,
    coordinationRunId: "run_intake_revision",
    expectedRevision: 2,
    state: "awaiting-human",
    summary: "Chair requests a human routing decision",
    artifactRefs: [{ path: "plans/routing.md", digest: digestB }],
    gateIds: ["gate_routing"],
  });
  if (parsed.origin !== "chair") throw new Error("expected chair revision");
  return parsed;
}

describe("intake revision public routing", () => {
  it("dispatches an authenticated operator revision through the public protocol", async () => {
    const fixture = await setupRoutingFixture();
    try {
      const request = operatorRequest(fixture);
      const revised = await fixture.fabric.dispatchPublicProtocol(
        fixture.operatorContext,
        FABRIC_OPERATIONS.intakeRevise,
        request,
      );
      expect(revised).toMatchObject({
        intakeId: "intake_routing",
        projectId: fixture.projectId,
        revision: 3,
        state: "discussing",
      });
      await expect(fixture.fabric.dispatchPublicProtocol(
        fixture.operatorContext,
        FABRIC_OPERATIONS.intakeRevise,
        request,
      )).resolves.toEqual(revised);
    } finally {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("dispatches an authenticated active-chair revision through the agent protocol", async () => {
    const fixture = await setupRoutingFixture();
    try {
      const request = chairRequest(fixture);
      const revised = await fixture.fabric.dispatchPublicProtocol(
        fixture.chairContext,
        FABRIC_OPERATIONS.intakeRevise,
        request,
      );
      expect(revised).toMatchObject({
        intakeId: "intake_routing",
        projectId: fixture.projectId,
        revision: 3,
        state: "awaiting-human",
      });
      await expect(fixture.fabric.dispatchPublicProtocol(
        fixture.chairContext,
        FABRIC_OPERATIONS.intakeRevise,
        request,
      )).resolves.toEqual(revised);
    } finally {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("replays one durable intake history after daemon restart", async () => {
    const fixture = await setupRoutingFixture();
    let initialClosed = false;
    let reopened: Fabric | undefined;
    try {
      const request = operatorRequest(fixture);
      const revised = await fixture.fabric.dispatchPublicProtocol(
        fixture.operatorContext,
        FABRIC_OPERATIONS.intakeRevise,
        request,
      );
      await fixture.fabric.close();
      initialClosed = true;

      reopened = await openFabric({
        databasePath: fixture.databasePath,
        workspaceRoots: [fixture.directory],
        clock: () => now,
      });
      const verified = reopened.verifyProtocolCredential("intake-routing-secret");
      if (verified.principal.kind !== "operator") throw new Error("expected operator principal");
      const context: PublicProtocolContext = {
        principal: verified.principal,
        allowedOperations: new Set(verified.grantedOperations),
        features: ["intakes.v1"],
        connectionNonce: "connection_intake_operator_restarted",
        credentialHash: createHash("sha256").update("intake-routing-secret").digest("hex"),
        daemonInstanceGeneration: 2,
      };
      await expect(reopened.dispatchPublicProtocol(
        context,
        FABRIC_OPERATIONS.intakeRevise,
        request,
      )).resolves.toEqual(revised);
      await reopened.close();
      reopened = undefined;

      const database = new Database(fixture.databasePath, { readonly: true });
      try {
        expect(database.prepare(`
          SELECT count(*) AS count FROM intake_revisions WHERE intake_id='intake_routing'
        `).get()).toEqual({ count: 3 });
        expect(database.prepare(`
          SELECT count(*) AS count FROM operator_commands
           WHERE operator_id='operator_routing' AND command_id='command_intake_routing_operator'
        `).get()).toEqual({ count: 1 });
      } finally {
        database.close();
      }
    } finally {
      if (!initialClosed) await fixture.fabric.close();
      if (reopened !== undefined) await reopened.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("rejects a revision whose declared origin differs from its authenticated principal", async () => {
    const fixture = await setupRoutingFixture();
    try {
      await expect(fixture.fabric.dispatchPublicProtocol(
        fixture.operatorContext,
        FABRIC_OPERATIONS.intakeRevise,
        chairRequest(fixture),
      )).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
      await expect(fixture.fabric.dispatchPublicProtocol(
        fixture.chairContext,
        FABRIC_OPERATIONS.intakeRevise,
        operatorRequest(fixture),
      )).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    } finally {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});

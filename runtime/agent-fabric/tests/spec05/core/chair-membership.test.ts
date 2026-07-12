import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FABRIC_OPERATIONS,
  parseMembershipBindRequest,
  parseOperatorCapabilityGrant,
  type MembershipBindRequest,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { openFabric, type Fabric } from "../../../src/index.ts";
import type { PublicProtocolContext } from "../../../src/daemon/public-protocol.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
import { ROOT_AUTHORITY } from "../../support/stage1-fixture.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";

const now = Date.parse("2027-01-01T00:00:00Z");
const digest = `sha256:${"a".repeat(64)}`;
const cleanups: Array<() => Promise<void>> = [];

type Fixture = {
  fabric: Fabric;
  directory: string;
  databasePath: string;
  projectId: string;
  projectSessionId: string;
  chairLeaseId: string;
  runRevision: number;
  chairCapability: string;
  chairContext: PublicProtocolContext;
  peerCapability: string;
  peerContext: PublicProtocolContext;
};

function contextFor(fabric: Fabric, capability: string): PublicProtocolContext {
  const verified = fabric.verifyProtocolCredential(capability);
  if (verified.principal.kind !== "agent") throw new Error("expected agent principal");
  return {
    principal: verified.principal,
    allowedOperations: new Set(verified.grantedOperations),
    features: ["project-sessions.v1"],
    connectionNonce: "connection_membership_chair",
    credentialHash: createHash("sha256").update(capability).digest("hex"),
    daemonInstanceGeneration: 1,
  };
}

async function setup(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "fabric-chair-membership-"));
  const databasePath = join(directory, "fabric.sqlite3");
  const initial = await openFabric({ databasePath, workspaceRoots: [directory], clock: () => now });
  const created = await createCurrentSessionRun({
    databasePath,
    workspaceRoot: directory,
    runId: "run_membership",
    chair: {
      agentId: "chair_membership",
      authority: {
        ...ROOT_AUTHORITY,
        actions: [...new Set([...ROOT_AUTHORITY.actions, FABRIC_OPERATIONS.membershipBind])],
      },
    },
  });
  const chairClient = initial.connect(created.chairCapability);
  const peerAuthority = await chairClient.delegateAuthority({
    parentAuthorityId: created.chairAuthorityId,
    commandId: "command_membership_peer_authority",
    authority: {
      ...ROOT_AUTHORITY,
      sourcePaths: ["src/peer"],
      artifactPaths: [".agent-run/peer"],
      actions: [FABRIC_OPERATIONS.membershipBind],
      budget: { turns: 2, "cost:USD": 1 },
    },
  });
  const peerRegistration = await chairClient.registerAgent({
    agentId: "peer_membership",
    authorityId: peerAuthority.authorityId,
  });
  await initial.close();

  const database = new Database(databasePath);
  let projectId = "";
  let projectSessionId = "";
  let chairLeaseId = "";
  let runRevision = 0;
  try {
    database.pragma("foreign_keys = ON");
    const identity = database.prepare(`
      SELECT r.project_session_id, r.chair_lease_id, r.revision, s.project_id
        FROM runs r JOIN project_sessions s ON s.project_session_id=r.project_session_id
       WHERE r.run_id='run_membership'
    `).get() as { project_id: string; project_session_id: string; chair_lease_id: string; revision: number };
    projectId = identity.project_id;
    projectSessionId = identity.project_session_id;
    chairLeaseId = identity.chair_lease_id;
    runRevision = identity.revision;
    database.prepare(`
      UPDATE run_chair_leases SET status='active'
       WHERE project_session_id=? AND run_id='run_membership' AND generation=1
    `).run(projectSessionId);
    database.exec(`
      INSERT INTO tasks(
        run_id, task_id, authority_id, objective, base_revision, state,
        owner_agent_id, revision, owner_lease_generation, created_by
      ) VALUES (
        'run_membership', 'task_membership', '${created.chairAuthorityId}',
        'Exercise membership targets', 'base_01', 'active',
        'chair_membership', 1, 1, 'chair_membership'
      );
      INSERT INTO workstreams(
        workstream_id, project_session_id, coordination_run_id, fabric_task_id,
        lead_agent_id, delivery_run_id, revision, state, created_at, updated_at
      ) VALUES (
        'workstream_membership', '${projectSessionId}', 'run_membership',
        'task_membership', 'chair_membership', 'delivery_membership', 1, 'active', ${now}, ${now}
      );
      INSERT INTO leases(
        lease_id, run_id, kind, holder_agent_id, generation, status, expires_at, updated_at
      ) VALUES (
        'lease_membership', 'run_membership', 'write', 'chair_membership', 1,
        'active', ${Date.parse("2099-01-01T00:00:00Z")}, ${now}
      );
      INSERT INTO provider_actions(
        run_id, action_id, adapter_id, operation, target_agent_id,
        provider_session_generation, turn_lease_generation, identity_hash,
        payload_hash, payload_json, status, history_json, execution_count,
        effect_count, idempotency_proven, result_json, updated_at
      ) VALUES (
        'run_membership', 'action_membership', 'adapter_membership', 'turn',
        'chair_membership', 1, 1, 'identity_membership', 'payload_membership', '{}',
        'prepared', '[]', 0, 0, 0, NULL, ${now}
      );
      INSERT INTO messages(
        message_id, run_id, sender_id, dedupe_key, payload_hash, audience_json,
        kind, body, requires_ack, conversation_id, reply_to_message_id,
        task_revision, hop_count, expires_at, created_at
      ) VALUES (
        'message_membership', 'run_membership', 'chair_membership',
        'message-membership', 'payload-message',
        '{"kind":"agent","agentId":"chair_membership"}', 'request',
        'Membership target', 1, 'conversation_membership', NULL, 1, 0,
        ${Date.parse("2099-01-01T00:00:00Z")}, ${now}
      );
      INSERT INTO artifacts(
        artifact_id, project_id, project_session_id, run_id, task_id,
        publisher_kind, publisher_ref, publisher_agent_id, source_kind, evidence_kind,
        relative_path, sha256, registry_state, quarantine_reason, revision, created_at
      ) VALUES (
        'artifact_membership', '${projectId}', '${projectSessionId}', 'run_membership', 'task_membership',
        'agent', 'chair_membership', 'chair_membership', 'project-file', 'artifact',
        'evidence/membership.md', '${digest}', 'active', NULL, 1, ${now}
      );
      INSERT INTO scoped_gates(
        gate_id, project_session_id, coordination_run_id, dedupe_key, scope_kind,
        scope_task_id, dependency_revision, blocked_operation_ids_json,
        enforcement_points_json, question, reason, options_json, recommendation,
        consequences_json, evidence_refs_json, created_by_ref, expected_approver_ref,
        deadline, default_action, status, human_required, release_binding_json,
        revision, created_at, updated_at
      ) VALUES (
        'gate_membership', '${projectSessionId}', 'run_membership', 'gate-membership',
        'run', NULL, 1, '[]', '["scoped-barrier"]', 'Continue?', 'Membership gate',
        '["approve"]', 'approve', '[]', '[]', 'agent:chair_membership',
        'authenticated-human-operator', NULL, NULL, 'pending', 1, NULL, 1, ${now}, ${now}
      );
      INSERT INTO task_requests(
        request_id, project_session_id, run_id, task_id, requester_agent_id,
        request_revision, conversation_id, request_message_id, target_agent_id,
        target_provider_session, expected_artifacts_json, acknowledgement_required,
        dedupe_key, response_deadline, callback_id, callback_generation,
        dependent_barrier_id, state, payload_digest, created_at, updated_at
      ) VALUES (
        'request_membership', '${projectSessionId}', 'run_membership', 'task_membership',
        'chair_membership', 1, 'conversation_membership', 'message_membership',
        'chair_membership', 'provider_membership', '[]', 1, 'request-membership',
        ${Date.parse("2099-01-01T00:00:00Z")}, 'callback_membership', 1,
        'barrier_membership', 'pending', '${digest}', ${now}, ${now}
      );
      INSERT INTO task_request_barriers(request_id, barrier_id, state)
      VALUES ('request_membership', 'barrier_membership', 'blocked');
    `);
  } finally {
    database.close();
  }

  const fabric = await openFabric({ databasePath, workspaceRoots: [directory], clock: () => now });
  const fixture = {
    fabric,
    directory,
    databasePath,
    projectId,
    projectSessionId,
    chairLeaseId,
    runRevision,
    chairCapability: created.chairCapability,
    chairContext: contextFor(fabric, created.chairCapability),
    peerCapability: peerRegistration.capability,
    peerContext: contextFor(fabric, peerRegistration.capability),
  };
  cleanups.unshift(async () => {
    await fixture.fabric.close();
    await rm(directory, { recursive: true, force: true });
  });
  return fixture;
}

function fullRequest(fixture: Fixture): MembershipBindRequest {
  return parseMembershipBindRequest({
    origin: "chair",
    command: {
      commandId: "command_membership_bind",
      agentId: "chair_membership",
      projectSessionId: fixture.projectSessionId,
      coordinationRunId: "run_membership",
      principalGeneration: 1,
      chairLeaseId: fixture.chairLeaseId,
      chairLeaseGeneration: 1,
      expectedRunRevision: fixture.runRevision,
      expectedRevision: 1,
    },
    projectSessionId: fixture.projectSessionId,
    coordinationRunId: "run_membership",
    expectedMembershipRevision: 1,
    members: [
      { kind: "coordination-run", membershipId: "membership_run", coordinationRunId: "run_membership", runId: "run_membership", state: "active" },
      { kind: "workstream", membershipId: "membership_workstream", coordinationRunId: "run_membership", workstreamId: "workstream_membership", state: "active" },
      { kind: "task", membershipId: "membership_task", coordinationRunId: "run_membership", taskId: "task_membership", state: "active" },
      { kind: "lease", membershipId: "membership_lease", coordinationRunId: "run_membership", leaseId: "lease_membership", state: "active" },
      { kind: "provider-action", membershipId: "membership_action", coordinationRunId: "run_membership", providerActionId: "action_membership", state: "active" },
      { kind: "required-message", membershipId: "membership_message", coordinationRunId: "run_membership", messageId: "message_membership", state: "active" },
      { kind: "artifact-obligation", membershipId: "membership_artifact", coordinationRunId: "run_membership", artifactObligationId: "artifact_membership", state: "terminal" },
      { kind: "gate", membershipId: "membership_gate", coordinationRunId: "run_membership", gateId: "gate_membership", state: "active" },
      { kind: "scoped-barrier", membershipId: "membership_barrier", coordinationRunId: "run_membership", barrierId: "barrier_membership", state: "active" },
    ],
  });
}

afterEach(async () => {
  await Promise.allSettled(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe("chair project-session membership", () => {
  it("recognises the exact current chair lease as a membership target", async () => {
    const fixture = await setup();
    const request = parseMembershipBindRequest({
      origin: "chair",
      command: {
        commandId: "command_bind_chair_lease",
        agentId: "chair_membership",
        projectSessionId: fixture.projectSessionId,
        coordinationRunId: "run_membership",
        principalGeneration: 1,
        chairLeaseId: fixture.chairLeaseId,
        chairLeaseGeneration: 1,
        expectedRunRevision: fixture.runRevision,
        expectedRevision: 1,
      },
      projectSessionId: fixture.projectSessionId,
      coordinationRunId: "run_membership",
      expectedMembershipRevision: 1,
      members: [{
        kind: "lease",
        membershipId: "membership_chair_lease",
        coordinationRunId: "run_membership",
        leaseId: fixture.chairLeaseId,
        state: "active",
      }],
    });
    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.membershipBind,
      request,
    )).resolves.toMatchObject({ membershipRevision: 2 });
  });

  it("binds every existing member kind through the authenticated chair public protocol", async () => {
    const fixture = await setup();
    const request = fullRequest(fixture);

    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.membershipBind,
      request,
    )).resolves.toMatchObject({
      projectSessionId: fixture.projectSessionId,
      coordinationRunId: "run_membership",
      membershipRevision: 2,
      members: request.members,
    });

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      expect(database.prepare(`
        SELECT member_kind, member_id, state
          FROM project_session_memberships
         WHERE project_session_id=? AND coordination_run_id='run_membership'
         ORDER BY member_kind, member_id
      `).all(fixture.projectSessionId)).toEqual([
        { member_kind: "artifact-obligation", member_id: "artifact_membership", state: "reconciled" },
        { member_kind: "coordination-run", member_id: "run_membership", state: "active" },
        { member_kind: "gate", member_id: "gate_membership", state: "active" },
        { member_kind: "lease", member_id: "chair:run_membership:1", state: "active" },
        { member_kind: "lease", member_id: "lease_membership", state: "active" },
        { member_kind: "provider-action", member_id: "action_membership", state: "active" },
        { member_kind: "required-message", member_id: "message_membership", state: "active" },
        { member_kind: "scoped-barrier", member_id: "barrier_membership", state: "active" },
        { member_kind: "task", member_id: "task_membership", state: "active" },
        { member_kind: "workstream", member_id: "workstream_membership", state: "active" },
      ]);
    } finally {
      database.close();
    }
  });

  it("replays one chair command across restart and rejects command ID reuse with changed input", async () => {
    const fixture = await setup();
    const request = fullRequest(fixture);
    const committed = await fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.membershipBind,
      request,
    );
    await fixture.fabric.close();
    fixture.fabric = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: () => now,
    });
    fixture.chairContext = contextFor(fixture.fabric, fixture.chairCapability);

    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.membershipBind,
      request,
    )).resolves.toEqual(committed);

    if (request.origin !== "chair") throw new Error("expected chair membership request");
    const changed = parseMembershipBindRequest({
      ...request,
      members: request.members.map((member, index) => index === 2
        ? { ...member, state: "terminal" }
        : member),
    });
    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.membershipBind,
      changed,
    )).rejects.toMatchObject({ code: "DEDUPE_CONFLICT" });

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      expect(database.prepare(`
        SELECT membership_revision FROM project_sessions WHERE project_session_id=?
      `).get(fixture.projectSessionId)).toEqual({ membership_revision: 2 });
      expect(database.prepare(`
        SELECT count(*) AS count FROM commands
         WHERE run_id='run_membership' AND actor_agent_id='chair_membership'
           AND command_id='command_membership_bind'
      `).get()).toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });

  it("permits only source-valid settlement of an existing member while quiescing", async () => {
    const fixture = await setup();
    await fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.membershipBind,
      fullRequest(fixture),
    );
    const writer = new Database(fixture.databasePath);
    try {
      writer.prepare("UPDATE tasks SET state='complete', revision=revision+1 WHERE run_id='run_membership' AND task_id='task_membership'").run();
      writer.prepare("UPDATE project_sessions SET state='quiescing', revision=revision+1 WHERE project_session_id=?")
        .run(fixture.projectSessionId);
    } finally {
      writer.close();
    }
    const settle = parseMembershipBindRequest({
      origin: "chair",
      command: {
        commandId: "command_settle_during_quiesce",
        agentId: "chair_membership",
        projectSessionId: fixture.projectSessionId,
        coordinationRunId: "run_membership",
        principalGeneration: 1,
        chairLeaseId: fixture.chairLeaseId,
        chairLeaseGeneration: 1,
        expectedRunRevision: fixture.runRevision,
        expectedRevision: 2,
      },
      projectSessionId: fixture.projectSessionId,
      coordinationRunId: "run_membership",
      expectedMembershipRevision: 2,
      members: [{
        kind: "task",
        membershipId: "membership_task",
        coordinationRunId: "run_membership",
        taskId: "task_membership",
        state: "terminal",
      }],
    });
    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.membershipBind,
      settle,
    )).resolves.toMatchObject({ membershipRevision: 3 });

    const reader = new Database(fixture.databasePath, { readonly: true });
    try {
      expect(reader.prepare(`
        SELECT state, abandoned_reason FROM project_session_memberships
         WHERE project_session_id=? AND member_kind='task' AND member_id='task_membership'
      `).get(fixture.projectSessionId)).toEqual({ state: "reconciled", abandoned_reason: null });
    } finally {
      reader.close();
    }
  });

  it("does not let an exact replay bypass a chair lease frozen after commit", async () => {
    const fixture = await setup();
    const request = fullRequest(fixture);
    await fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.membershipBind,
      request,
    );
    const database = new Database(fixture.databasePath);
    try {
      database.prepare(`
        UPDATE run_chair_leases SET status='frozen' WHERE lease_id=?
      `).run(fixture.chairLeaseId);
    } finally {
      database.close();
    }

    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.membershipBind,
      request,
    )).rejects.toMatchObject({ code: "TASK_NOT_OWNER" });
  });

  it("rejects a non-chair agent and preserves membership state", async () => {
    const fixture = await setup();
    const base = fullRequest(fixture);
    if (base.origin !== "chair") throw new Error("expected chair membership request");
    const forged = parseMembershipBindRequest({
      ...base,
      command: {
        ...base.command,
        commandId: "command_membership_wrong_chair",
        agentId: "peer_membership",
      },
    });

    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.peerContext,
      FABRIC_OPERATIONS.membershipBind,
      forged,
    )).rejects.toMatchObject({ code: "TASK_NOT_OWNER" });

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      expect(database.prepare(`
        SELECT membership_revision FROM project_sessions WHERE project_session_id=?
      `).get(fixture.projectSessionId)).toEqual({ membership_revision: 1 });
      expect(database.prepare(`
        SELECT count(*) AS count FROM commands WHERE command_id='command_membership_wrong_chair'
      `).get()).toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });

  it.each([
    ["principal generation", { principalGeneration: 2 }, "STALE_PRINCIPAL_GENERATION"],
    ["chair lease ID", { chairLeaseId: "lease_other" }, "STALE_LEASE_GENERATION"],
    ["chair lease generation", { chairLeaseGeneration: 2 }, "STALE_LEASE_GENERATION"],
    ["run revision", { expectedRunRevision: 999 }, "STALE_REVISION"],
  ] as const)("rejects a stale %s fence", async (_label, commandPatch, code) => {
    const fixture = await setup();
    const base = fullRequest(fixture);
    if (base.origin !== "chair") throw new Error("expected chair membership request");
    const stale = parseMembershipBindRequest({
      ...base,
      command: {
        ...base.command,
        ...commandPatch,
        commandId: `command_membership_stale_${String(Object.values(commandPatch)[0])}`,
      },
    });

    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.membershipBind,
      stale,
    )).rejects.toMatchObject({ code });
  });

  it("rejects a stale membership revision before any member changes", async () => {
    const fixture = await setup();
    const base = fullRequest(fixture);
    if (base.origin !== "chair") throw new Error("expected chair membership request");
    const stale = parseMembershipBindRequest({
      ...base,
      command: {
        ...base.command,
        commandId: "command_membership_stale_revision",
        expectedRevision: 2,
      },
      expectedMembershipRevision: 2,
    });

    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.membershipBind,
      stale,
    )).rejects.toMatchObject({ code: "STALE_REVISION" });
  });

  it("cannot falsify terminal membership while the source run or task is still active", async () => {
    const fixture = await setup();
    const base = fullRequest(fixture);
    if (base.origin !== "chair") throw new Error("expected chair membership request");
    for (const [suffix, member] of [
      ["run", {
        kind: "coordination-run",
        membershipId: "membership_run_terminal_forgery",
        coordinationRunId: "run_membership",
        runId: "run_membership",
        state: "terminal",
      }],
      ["task", {
        kind: "task",
        membershipId: "membership_task_abandon_forgery",
        coordinationRunId: "run_membership",
        taskId: "task_membership",
        state: "abandoned",
        reason: "caller assertion is not source truth",
      }],
    ] as const) {
      const request = parseMembershipBindRequest({
        ...base,
        command: { ...base.command, commandId: `command_membership_forged_${suffix}` },
        members: [member],
      });
      await expect(fixture.fabric.dispatchPublicProtocol(
        fixture.chairContext,
        FABRIC_OPERATIONS.membershipBind,
        request,
      )).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
    }

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      expect(database.prepare(`
        SELECT membership_revision FROM project_sessions WHERE project_session_id=?
      `).get(fixture.projectSessionId)).toEqual({ membership_revision: 1 });
      expect(database.prepare(`
        SELECT member_kind, member_id, state
          FROM project_session_memberships WHERE project_session_id=?
          ORDER BY member_kind, member_id
      `).all(fixture.projectSessionId)).toEqual([
        { member_kind: "coordination-run", member_id: "run_membership", state: "active" },
        { member_kind: "lease", member_id: "chair:run_membership:1", state: "active" },
      ]);
    } finally {
      database.close();
    }
  });

  it("does not add membership to a terminal cancelled project session", async () => {
    const fixture = await setup();
    const database = new Database(fixture.databasePath);
    try {
      database.prepare(`
        UPDATE project_sessions
           SET state='cancelled', terminal_path_json=?, revision=revision+1, updated_at=?
         WHERE project_session_id=?
      `).run(
        JSON.stringify({ kind: "cancelled", reason: "terminal fixture" }),
        now,
        fixture.projectSessionId,
      );
    } finally {
      database.close();
    }

    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.membershipBind,
      fullRequest(fixture),
    )).rejects.toMatchObject({ code: "LIFECYCLE_PRECONDITION_FAILED" });
  });

  it.each([
    ["project session", { projectSessionId: "session_other", coordinationRunId: "run_membership" }],
    ["coordination run", { projectSessionId: undefined, coordinationRunId: "run_other" }],
  ] as const)("rejects a cross-%s command", async (_label, target) => {
    const fixture = await setup();
    const base = fullRequest(fixture);
    if (base.origin !== "chair") throw new Error("expected chair membership request");
    const projectSessionId = target.projectSessionId ?? fixture.projectSessionId;
    const crossBound = parseMembershipBindRequest({
      ...base,
      projectSessionId,
      coordinationRunId: target.coordinationRunId,
      command: {
        ...base.command,
        commandId: `command_membership_cross_${_label.replace(" ", "_")}`,
        projectSessionId,
        coordinationRunId: target.coordinationRunId,
      },
      members: [{
        kind: "coordination-run",
        membershipId: "membership_cross",
        coordinationRunId: target.coordinationRunId,
        runId: target.coordinationRunId,
        state: "active",
      }],
    });

    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.membershipBind,
      crossBound,
    )).rejects.toMatchObject({ code: "WRONG_PROJECT" });
  });

  it("rejects every missing run-bound target, including artifacts and scoped barriers", async () => {
    const fixture = await setup();
    const base = fullRequest(fixture);
    if (base.origin !== "chair") throw new Error("expected chair membership request");
    const missingMembers = [
      { kind: "workstream", membershipId: "missing_workstream", coordinationRunId: "run_membership", workstreamId: "workstream_missing", state: "active" },
      { kind: "task", membershipId: "missing_task", coordinationRunId: "run_membership", taskId: "task_missing", state: "active" },
      { kind: "lease", membershipId: "missing_lease", coordinationRunId: "run_membership", leaseId: "lease_missing", state: "active" },
      { kind: "provider-action", membershipId: "missing_action", coordinationRunId: "run_membership", providerActionId: "action_missing", state: "active" },
      { kind: "required-message", membershipId: "missing_message", coordinationRunId: "run_membership", messageId: "message_missing", state: "active" },
      { kind: "artifact-obligation", membershipId: "missing_artifact", coordinationRunId: "run_membership", artifactObligationId: "artifact_missing", state: "active" },
      { kind: "gate", membershipId: "missing_gate", coordinationRunId: "run_membership", gateId: "gate_missing", state: "active" },
      { kind: "scoped-barrier", membershipId: "missing_barrier", coordinationRunId: "run_membership", barrierId: "barrier_missing", state: "active" },
    ] as const;

    for (const [index, member] of missingMembers.entries()) {
      const request = parseMembershipBindRequest({
        ...base,
        command: {
          ...base.command,
          commandId: `command_membership_missing_${String(index)}`,
        },
        members: [member],
      });
      await expect(fixture.fabric.dispatchPublicProtocol(
        fixture.chairContext,
        FABRIC_OPERATIONS.membershipBind,
        request,
      )).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: `${member.kind} membership target was not found`,
      });
    }

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      expect(database.prepare(`
        SELECT membership_revision FROM project_sessions WHERE project_session_id=?
      `).get(fixture.projectSessionId)).toEqual({ membership_revision: 1 });
      expect(database.prepare(`
        SELECT count(*) AS count FROM commands WHERE command_id LIKE 'command_membership_missing_%'
      `).get()).toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });

  it("preserves the authenticated operator membership path", async () => {
    const fixture = await setup();
    await fixture.fabric.close();
    const database = new Database(fixture.databasePath);
    try {
      const operatorStore = new OperatorStore({ database, clock: () => now });
      operatorStore.registerPrincipal({
        operatorId: "operator_membership",
        projectId: fixture.projectId,
        authenticatedSubjectHash: "subject-membership",
        projectAuthorityGeneration: 1,
      });
      operatorStore.issueCapability(parseOperatorCapabilityGrant({
        capabilityId: "cap_operator_membership",
        operatorId: "operator_membership",
        projectId: fixture.projectId,
        projectSessionId: fixture.projectSessionId,
        projectAuthorityGeneration: 1,
        sessionGeneration: 1,
        principalGeneration: 1,
        issuedAt: "2026-01-01T00:00:00Z",
        expiresAt: "2099-01-01T00:00:00Z",
        status: "active",
        kind: "session",
        actions: ["read", "decide"],
      }), "operator-membership-secret");
    } finally {
      database.close();
    }
    fixture.fabric = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: () => now,
    });
    const verified = fixture.fabric.verifyProtocolCredential("operator-membership-secret");
    if (verified.principal.kind !== "operator") throw new Error("expected operator principal");
    const operatorContext: PublicProtocolContext = {
      principal: verified.principal,
      allowedOperations: new Set(verified.grantedOperations),
      features: ["project-sessions.v1"],
      connectionNonce: "connection_membership_operator",
      credentialHash: createHash("sha256").update("operator-membership-secret").digest("hex"),
      daemonInstanceGeneration: 1,
    };
    const request = parseMembershipBindRequest({
      origin: "operator",
      command: {
        credential: { capabilityId: "cap_operator_membership", token: "operator-membership-secret" },
        commandId: "command_operator_membership",
        expectedRevision: 1,
        actor: "operator_membership",
        provenance: {
          kind: "console-direct-input",
          clientId: "console_membership",
          inputEventId: "input_membership",
        },
        evidenceRefs: [{ path: "evidence/membership.md", digest }],
      },
      projectSessionId: fixture.projectSessionId,
      coordinationRunId: "run_membership",
      expectedMembershipRevision: 1,
      members: [{
        kind: "task",
        membershipId: "operator_membership_task",
        coordinationRunId: "run_membership",
        taskId: "task_membership",
        state: "active",
      }],
    });

    await expect(fixture.fabric.dispatchPublicProtocol(
      operatorContext,
      FABRIC_OPERATIONS.membershipBind,
      request,
    )).resolves.toMatchObject({ membershipRevision: 2, members: request.members });
  });
});

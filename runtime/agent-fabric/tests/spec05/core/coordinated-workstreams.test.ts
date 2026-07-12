import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import {
  FABRIC_OPERATIONS,
  parseOperationInput,
  type WorkstreamCreateRequest,
  type WorkstreamSettleRequest,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { openFabric, type Fabric } from "../../../src/index.ts";
import type { PublicProtocolContext } from "../../../src/daemon/public-protocol.ts";
import { ROOT_AUTHORITY } from "../../support/stage1-fixture.ts";

const now = Date.parse("2027-01-01T00:00:00.000Z");
const digest = `sha256:${"a".repeat(64)}` as const;
const cleanups: Array<() => Promise<void>> = [];

type Fixture = {
  fabric: Fabric;
  databasePath: string;
  projectSessionId: string;
  chairLeaseId: string;
  chairContext: PublicProtocolContext;
  sessionRevision: number;
  sessionGeneration: number;
  membershipRevision: number;
  runRevision: number;
  runScopeId: string;
};

function contextFor(fabric: Fabric, capability: string): PublicProtocolContext {
  const verified = fabric.verifyProtocolCredential(capability);
  if (verified.principal.kind !== "agent") throw new Error("expected agent principal");
  return {
    principal: verified.principal,
    allowedOperations: new Set(verified.grantedOperations),
    features: ["workstreams.v1"],
    connectionNonce: "connection_workstream",
    credentialHash: createHash("sha256").update(capability).digest("hex"),
    daemonInstanceGeneration: 1,
  };
}

async function setup(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "fabric-workstream-"));
  const databasePath = join(directory, "fabric.sqlite3");
  const initial = await openFabric({ databasePath, workspaceRoots: [directory], clock: () => now });
  const created = await initial.createRun({
    runId: "run_workstream",
    workspaceRoot: directory,
    chair: {
      agentId: "chair_workstream",
      authority: {
        ...ROOT_AUTHORITY,
        actions: [...new Set([
          ...ROOT_AUTHORITY.actions,
          FABRIC_OPERATIONS.workstreamCreate,
          FABRIC_OPERATIONS.workstreamSettle,
          FABRIC_OPERATIONS.getTask,
        ])],
        budget: { turns: 20, "cost:USD": 10 },
      },
    },
  });
  await initial.close();
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  const identity = database.prepare(`
    SELECT run.project_session_id, run.chair_lease_id, run.revision AS run_revision,
           session.revision AS session_revision, session.generation AS session_generation,
           session.membership_revision
      FROM runs run JOIN project_sessions session USING(project_session_id)
     WHERE run.run_id='run_workstream'
  `).get() as {
    project_session_id: string;
    chair_lease_id: string;
    run_revision: number;
    session_revision: number;
    session_generation: number;
    membership_revision: number;
  };
  const runScope = database.prepare("SELECT scope_id FROM resource_scopes WHERE scope_kind='coordination-run' AND owner_ref='run_workstream'")
    .get() as { scope_id: string };
  database.prepare("UPDATE project_sessions SET mode='coordinated', state='active', revision=revision+1 WHERE project_session_id=?")
    .run(identity.project_session_id);
  database.prepare("UPDATE runs SET lifecycle_state='active', revision=revision+1 WHERE run_id='run_workstream'").run();
  database.prepare(`
    UPDATE run_chair_leases SET status='active'
     WHERE project_session_id=? AND run_id='run_workstream' AND generation=1
  `).run(identity.project_session_id);
  database.prepare(`
    INSERT INTO artifacts(
      artifact_id, project_id, project_session_id, run_id, task_id,
      publisher_kind, publisher_ref, publisher_agent_id, source_kind, evidence_kind,
      relative_path, sha256, registry_state, quarantine_reason, revision, created_at
    )
    SELECT 'artifact_workstream_launch', session.project_id, session.project_session_id,
           'run_workstream', NULL, 'agent', 'chair_workstream', 'chair_workstream',
           'project-file', 'artifact', '.agent-run/delivery_1/RUN.json', ?,
           'active', NULL, 1, ?
      FROM project_sessions session WHERE session.project_session_id=?
  `).run(digest, now, identity.project_session_id);
  database.close();

  const fabric = await openFabric({ databasePath, workspaceRoots: [directory], clock: () => now });
  const fixture: Fixture = {
    fabric,
    databasePath,
    projectSessionId: identity.project_session_id,
    chairLeaseId: identity.chair_lease_id,
    chairContext: contextFor(fabric, created.chairCapability),
    sessionRevision: identity.session_revision + 1,
    sessionGeneration: identity.session_generation,
    membershipRevision: identity.membership_revision,
    runRevision: identity.run_revision + 1,
    runScopeId: runScope.scope_id,
  };
  cleanups.unshift(async () => {
    await fixture.fabric.close();
    await rm(directory, { recursive: true, force: true });
  });
  return fixture;
}

function createRequest(fixture: Fixture): WorkstreamCreateRequest {
  return parseOperationInput(FABRIC_OPERATIONS.workstreamCreate, {
    command: {
      commandId: "command_workstream_create",
      agentId: "chair_workstream",
      projectSessionId: fixture.projectSessionId,
      coordinationRunId: "run_workstream",
      principalGeneration: 1,
      chairLeaseId: fixture.chairLeaseId,
      chairLeaseGeneration: 1,
      expectedRunRevision: fixture.runRevision,
      expectedRevision: fixture.sessionRevision,
    },
    expectedSessionGeneration: fixture.sessionGeneration,
    expectedMembershipRevision: fixture.membershipRevision,
    workstreamId: "workstream_1",
    deliveryRunId: "delivery_1",
    launchPacketRef: { path: ".agent-run/delivery_1/RUN.json", digest },
    team: {
      teamId: "team_1",
      leader: {
        agentId: "lead_1",
        authority: {
          ...ROOT_AUTHORITY,
          sourcePaths: ["src/workstream"],
          artifactPaths: [".agent-run/delivery_1"],
          actions: [FABRIC_OPERATIONS.getTask],
          budget: { turns: 2 },
        },
      },
      rootTask: { taskId: "task_1", objective: "Deliver workstream", baseRevision: "abc123" },
      initialMembers: [{
        agentId: "worker_1",
        authority: {
          ...ROOT_AUTHORITY,
          sourcePaths: ["src/workstream/worker"],
          artifactPaths: [".agent-run/delivery_1/worker"],
          actions: [FABRIC_OPERATIONS.getTask],
          budget: { turns: 1 },
        },
      }],
      discussionGroups: [{ groupId: "group_1", memberAgentIds: ["lead_1", "worker_1"] }],
      reservedBudget: { turns: 2 },
    },
    resources: {
      runScopeId: fixture.runScopeId,
      teamScopeId: "scope_team_1",
      teamLimits: { turns: 2 },
      agentScopes: [
        { agentId: "lead_1", scopeId: "scope_lead_1", limits: { turns: 2 } },
        { agentId: "worker_1", scopeId: "scope_worker_1", limits: { turns: 1 } },
      ],
    },
  });
}

afterEach(async () => {
  await Promise.allSettled(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe("coordinated workstreams", () => {
  it("creates the narrowed team, resources and memberships atomically without another run or chair", async () => {
    const fixture = await setup();
    const request = createRequest(fixture);
    const before = new Database(fixture.databasePath, { readonly: true });
    const counts = before.prepare(`
      SELECT (SELECT COUNT(*) FROM runs) AS runs,
             (SELECT COUNT(*) FROM run_chair_leases) AS chairs,
             (SELECT COUNT(*) FROM capabilities) AS capabilities,
             (SELECT COUNT(*) FROM provider_actions) AS provider_actions
    `).get();
    before.close();

    const result = await fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.workstreamCreate,
      request,
    );
    expect(result).toMatchObject({
      workstreamId: "workstream_1",
      teamId: "team_1",
      rootTaskId: "task_1",
      leadAgentId: "lead_1",
      state: "active",
      membershipRevision: fixture.membershipRevision + 1,
    });
    expect(await fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.workstreamCreate,
      request,
    )).toEqual(result);

    const database = new Database(fixture.databasePath, { readonly: true });
    expect(database.prepare(`
      SELECT (SELECT COUNT(*) FROM runs) AS runs,
             (SELECT COUNT(*) FROM run_chair_leases) AS chairs,
             (SELECT COUNT(*) FROM capabilities) AS capabilities,
             (SELECT COUNT(*) FROM provider_actions) AS provider_actions
    `).get()).toEqual(counts);
    expect(database.prepare(`
      SELECT member_kind, member_id, state FROM project_session_memberships
       WHERE project_session_id=? AND member_kind IN ('task','workstream') ORDER BY member_kind
    `).all(fixture.projectSessionId)).toEqual([
      { member_kind: "task", member_id: "task_1", state: "active" },
        { member_kind: "workstream", member_id: "workstream_1", state: "active" },
      ]);
    expect(database.prepare("SELECT membership_revision FROM project_sessions WHERE project_session_id=?")
      .get(fixture.projectSessionId)).toEqual({ membership_revision: fixture.membershipRevision + 1 });
    expect(database.prepare("SELECT launch_packet_artifact_id FROM workstream_custody WHERE workstream_id='workstream_1'").get())
      .toEqual({ launch_packet_artifact_id: "artifact_workstream_launch" });
    expect(database.prepare("SELECT scope_kind, owner_ref FROM resource_scopes WHERE scope_id IN ('scope_team_1','scope_lead_1','scope_worker_1') ORDER BY scope_kind, owner_ref").all())
      .toEqual([
        { scope_kind: "agent", owner_ref: "lead_1" },
        { scope_kind: "agent", owner_ref: "worker_1" },
        { scope_kind: "team", owner_ref: "team_1" },
      ]);
    database.close();
  });

  it.each([
    ["missing", (scopes: WorkstreamCreateRequest["resources"]["agentScopes"]) => scopes.slice(0, 1)],
    ["outsider", (scopes: WorkstreamCreateRequest["resources"]["agentScopes"]) => [
      ...scopes,
      { agentId: "outsider_1" as never, scopeId: "scope_outsider_1", limits: { turns: 1 } },
    ]],
    ["duplicate owner", (scopes: WorkstreamCreateRequest["resources"]["agentScopes"]) => [
      scopes[0]!,
      { ...scopes[1]!, agentId: scopes[0]!.agentId },
    ]],
    ["duplicate scope", (scopes: WorkstreamCreateRequest["resources"]["agentScopes"]) => [
      scopes[0]!,
      { ...scopes[1]!, scopeId: scopes[0]!.scopeId },
    ]],
  ])("rejects a %s agent-scope mapping before any workstream state is created", async (_label, mutate) => {
    const fixture = await setup();
    const base = createRequest(fixture);
    const request = {
      ...base,
      resources: { ...base.resources, agentScopes: mutate(base.resources.agentScopes) },
    } as WorkstreamCreateRequest;
    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.workstreamCreate,
      request,
    )).rejects.toMatchObject({ code: "PROTOCOL_INVALID" });
    const database = new Database(fixture.databasePath, { readonly: true });
    expect(database.prepare(`
      SELECT (SELECT COUNT(*) FROM workstreams) AS workstreams,
             (SELECT COUNT(*) FROM teams WHERE team_id='team_1') AS teams,
             (SELECT COUNT(*) FROM resource_scopes WHERE scope_id='scope_team_1') AS scopes
    `).get()).toEqual({ workstreams: 0, teams: 0, scopes: 0 });
    expect(database.prepare("SELECT membership_revision FROM project_sessions WHERE project_session_id=?")
      .get(fixture.projectSessionId)).toEqual({ membership_revision: fixture.membershipRevision });
    database.close();
  });

  it.each(["unregistered", "quarantined", "wrong-project", "wrong-kind"])(
    "rejects a %s launch packet before atomic workstream creation",
    async (variant) => {
      const fixture = await setup();
      const database = new Database(fixture.databasePath);
      database.pragma("foreign_keys = ON");
      if (variant === "unregistered") {
        database.prepare("DELETE FROM artifacts WHERE artifact_id='artifact_workstream_launch'").run();
      } else if (variant === "quarantined") {
        database.prepare(`
          UPDATE artifacts SET registry_state='quarantined', quarantine_reason='superseded launch packet'
           WHERE artifact_id='artifact_workstream_launch'
        `).run();
      } else if (variant === "wrong-kind") {
        database.prepare("UPDATE artifacts SET evidence_kind='review' WHERE artifact_id='artifact_workstream_launch'").run();
      } else {
        database.prepare("DELETE FROM artifacts WHERE artifact_id='artifact_workstream_launch'").run();
        database.prepare(`
          INSERT INTO projects(project_id, canonical_root, revision, authority_generation, created_at, updated_at)
          VALUES ('project_wrong', '/wrong-project', 1, 1, ?, ?)
        `).run(now, now);
        database.prepare(`
          INSERT INTO artifacts(
            artifact_id, project_id, project_session_id, run_id, task_id,
            publisher_kind, publisher_ref, publisher_agent_id, source_kind, evidence_kind,
            relative_path, sha256, registry_state, quarantine_reason, revision, created_at
          ) VALUES (
            'artifact_wrong_project', 'project_wrong', NULL, NULL, NULL,
            'project', 'project_wrong', NULL, 'project-file', 'artifact',
            '.agent-run/delivery_1/RUN.json', ?, 'active', NULL, 1, ?
          )
        `).run(digest, now);
      }
      database.close();
      const rejection = fixture.fabric.dispatchPublicProtocol(
        fixture.chairContext,
        FABRIC_OPERATIONS.workstreamCreate,
        createRequest(fixture),
      );
      await expect(rejection).rejects.toMatchObject({
        code: variant === "wrong-project" ? "WRONG_PROJECT" : "BARRIER_PRECONDITION_FAILED",
      });
      const after = new Database(fixture.databasePath, { readonly: true });
      expect(after.prepare("SELECT COUNT(*) AS count FROM workstreams").get()).toEqual({ count: 0 });
      expect(after.prepare("SELECT COUNT(*) AS count FROM teams WHERE team_id='team_1'").get()).toEqual({ count: 0 });
      after.close();
    },
  );

  it("derives settlement from terminal sources and rejects a live team obligation", async () => {
    const fixture = await setup();
    const created = await fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.workstreamCreate,
      createRequest(fixture),
    ) as { membershipRevision: number };
    const database = new Database(fixture.databasePath);
    database.pragma("foreign_keys = ON");
    database.prepare("UPDATE tasks SET state='complete', revision=2 WHERE run_id='run_workstream' AND task_id='task_1'").run();
    database.prepare("UPDATE teams SET state='barrier-closed' WHERE run_id='run_workstream' AND team_id='team_1'").run();
    database.prepare("INSERT INTO subtree_barriers(run_id, team_id, generation, closed_at) VALUES ('run_workstream','team_1',1,?)").run(now);
    const team = database.prepare("SELECT authority_id, budget_id FROM teams WHERE run_id='run_workstream' AND team_id='team_1'")
      .get() as { authority_id: string; budget_id: string };
    database.prepare(`
      INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, lifecycle)
      VALUES ('run_workstream', 'child_worker_1', 'lead_1', ?, 'ready')
    `).run(team.authority_id);
    database.prepare("INSERT INTO mailbox_state(run_id, recipient_id) VALUES ('run_workstream','child_worker_1')").run();
    database.prepare(`
      INSERT INTO tasks(
        run_id, task_id, authority_id, objective, base_revision, state,
        owner_agent_id, revision, owner_lease_generation, created_by
      ) VALUES ('run_workstream', 'task_child_1', ?, 'Descendant delivery', 'abc123',
                'complete', NULL, 1, 0, 'lead_1')
    `).run(team.authority_id);
    database.prepare(`
      INSERT INTO budgets(run_id, budget_id, parent_budget_id, team_id, owner_agent_id, state, created_at)
      VALUES ('run_workstream', 'team_child_1:budget', ?, 'team_child_1', 'child_worker_1', 'active', ?)
    `).run(team.budget_id, now);
    database.prepare(`
      INSERT INTO teams(
        run_id, team_id, parent_team_id, depth, leader_agent_id, original_leader_agent_id,
        root_task_id, authority_id, budget_id, state, generation, created_at
      ) VALUES ('run_workstream', 'team_child_1', 'team_1', 2, 'child_worker_1', 'child_worker_1',
                'task_child_1', ?, 'team_child_1:budget', 'barrier-closed', 1, ?)
    `).run(team.authority_id, now);
    database.prepare("INSERT INTO team_members(run_id, team_id, agent_id) VALUES ('run_workstream','team_child_1','child_worker_1')").run();
    database.prepare("INSERT INTO team_owned_tasks(run_id, team_id, task_id) VALUES ('run_workstream','team_child_1','task_child_1')").run();
    database.prepare("INSERT INTO subtree_barriers(run_id, team_id, generation, closed_at) VALUES ('run_workstream','team_child_1',1,?)").run(now);
    database.prepare(`
      INSERT INTO project_session_memberships(
        project_session_id, coordination_run_id, member_kind, member_id,
        required, state, revision, abandoned_reason, created_at, updated_at
      ) VALUES (?, 'run_workstream', 'task', 'task_child_1', 1, 'active', 1, NULL, ?, ?)
    `).run(fixture.projectSessionId, now, now);
    database.prepare(`
      INSERT INTO leases(lease_id, run_id, kind, holder_agent_id, generation, status, expires_at, updated_at)
      VALUES ('lease_blocker','run_workstream','write','child_worker_1',1,'active',?,?)
    `).run(Date.parse("2099-01-01T00:00:00Z"), now);
    database.prepare(`
      INSERT INTO task_obligation_bindings(
        coordination_run_id, task_id, obligation_kind, obligation_id, state, created_at, updated_at
      ) VALUES ('run_workstream','task_child_1','write-lease','lease_blocker','active',?,?)
    `).run(now, now);
    const session = database.prepare("SELECT revision, membership_revision FROM project_sessions WHERE project_session_id=?")
      .get(fixture.projectSessionId) as { revision: number; membership_revision: number };
    database.close();
    const settle = parseOperationInput(FABRIC_OPERATIONS.workstreamSettle, {
      command: {
        ...createRequest(fixture).command,
        commandId: "command_workstream_settle",
        expectedRevision: session.revision,
      },
      expectedSessionGeneration: fixture.sessionGeneration,
      expectedMembershipRevision: session.membership_revision,
      workstreamId: "workstream_1",
      expectedWorkstreamRevision: 1,
      expectedRootTaskRevision: 2,
      expectedTeamGeneration: 1,
    }) satisfies WorkstreamSettleRequest;
    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.workstreamSettle,
      settle,
    )).rejects.toMatchObject({ code: "BARRIER_PRECONDITION_FAILED" });

    const repair = new Database(fixture.databasePath);
    repair.prepare("UPDATE leases SET status='released' WHERE lease_id='lease_blocker'").run();
    repair.close();
    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.workstreamSettle,
      settle,
    )).rejects.toMatchObject({ code: "BARRIER_PRECONDITION_FAILED" });

    const requiredMessage = new Database(fixture.databasePath);
    requiredMessage.prepare("UPDATE task_obligation_bindings SET state='reconciled' WHERE obligation_id='lease_blocker'").run();
    requiredMessage.prepare(`
      INSERT INTO messages(
        message_id, run_id, sender_id, dedupe_key, payload_hash, audience_json,
        kind, body, requires_ack, conversation_id, hop_count, created_at
      ) VALUES (
        'message_child_required', 'run_workstream', 'lead_1', 'child-required', 'payload-child-required',
        '{"kind":"agents","agentIds":["child_worker_1"]}', 'request', 'Acknowledge child result',
        1, 'conversation_child_required', 0, ?
      )
    `).run(now);
    requiredMessage.prepare(`
      INSERT INTO deliveries(
        delivery_id, message_id, run_id, recipient_id, mailbox_sequence, state, attempt_count
      ) VALUES (
        'delivery_child_required', 'message_child_required', 'run_workstream',
        'child_worker_1', 1, 'ready', 0
      )
    `).run();
    requiredMessage.close();
    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.workstreamSettle,
      settle,
    )).rejects.toMatchObject({ code: "BARRIER_PRECONDITION_FAILED" });

    const outgoingMessage = new Database(fixture.databasePath);
    outgoingMessage.prepare(`
      UPDATE deliveries SET state='acknowledged', acknowledged_at=?
       WHERE delivery_id='delivery_child_required'
    `).run(now);
    outgoingMessage.prepare(`
      INSERT INTO messages(
        message_id, run_id, sender_id, dedupe_key, payload_hash, audience_json,
        kind, body, requires_ack, conversation_id, hop_count, created_at
      ) VALUES
        ('message_outgoing_required', 'run_workstream', 'lead_1', 'outgoing-required',
         'payload-outgoing-required', '{"kind":"agents","agentIds":["chair_workstream"]}',
         'request', 'Acknowledge workstream result', 1, 'conversation_outgoing_required', 0, ?),
        ('message_unrelated_required', 'run_workstream', 'chair_workstream', 'unrelated-required',
         'payload-unrelated-required', '{"kind":"agents","agentIds":["chair_workstream"]}',
         'request', 'Unrelated chair traffic', 1, 'conversation_unrelated_required', 0, ?)
    `).run(now, now);
    outgoingMessage.prepare(`
      INSERT INTO deliveries(
        delivery_id, message_id, run_id, recipient_id, mailbox_sequence, state, attempt_count
      ) VALUES
        ('delivery_outgoing_required', 'message_outgoing_required', 'run_workstream',
         'chair_workstream', 1, 'ready', 0),
        ('delivery_unrelated_required', 'message_unrelated_required', 'run_workstream',
         'chair_workstream', 2, 'ready', 0)
    `).run();
    outgoingMessage.close();
    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.workstreamSettle,
      settle,
    )).rejects.toMatchObject({ code: "BARRIER_PRECONDITION_FAILED" });

    const expectedArtifact = new Database(fixture.databasePath);
    expectedArtifact.prepare(`
      UPDATE deliveries SET state='acknowledged', acknowledged_at=?
       WHERE delivery_id='delivery_outgoing_required'
    `).run(now);
    expectedArtifact.prepare(`
      INSERT INTO task_expected_artifacts(run_id, task_id, relative_path)
      VALUES ('run_workstream','task_child_1','findings/child-result.md')
    `).run();
    expectedArtifact.close();
    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.workstreamSettle,
      settle,
    )).rejects.toMatchObject({ code: "BARRIER_PRECONDITION_FAILED" });

    const artifactMembership = new Database(fixture.databasePath);
    artifactMembership.pragma("foreign_keys = ON");
    artifactMembership.prepare(`
      INSERT INTO artifacts(
        artifact_id, project_id, project_session_id, run_id, task_id,
        publisher_kind, publisher_ref, publisher_agent_id, source_kind, evidence_kind,
        relative_path, sha256, registry_state, quarantine_reason, revision, created_at
      )
      SELECT 'artifact_child_result', session.project_id, session.project_session_id,
             'run_workstream', 'task_child_1', 'agent', 'child_worker_1', 'child_worker_1',
             'project-file', 'artifact', 'findings/child-result.md', ?, 'active', NULL, 1, ?
        FROM project_sessions session WHERE session.project_session_id=?
    `).run(digest, now, fixture.projectSessionId);
    artifactMembership.prepare(`
      INSERT INTO project_session_memberships(
        project_session_id, coordination_run_id, member_kind, member_id,
        required, state, revision, abandoned_reason, created_at, updated_at
      ) VALUES (?, 'run_workstream', 'artifact-obligation', 'artifact_child_result',
                1, 'active', 1, NULL, ?, ?)
    `).run(fixture.projectSessionId, now, now);
    artifactMembership.close();
    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.workstreamSettle,
      settle,
    )).rejects.toMatchObject({ code: "BARRIER_PRECONDITION_FAILED" });

    const finalRepair = new Database(fixture.databasePath);
    finalRepair.prepare(`
      UPDATE project_session_memberships SET state='reconciled', revision=revision+1, updated_at=?
       WHERE project_session_id=? AND member_kind='artifact-obligation' AND member_id='artifact_child_result'
    `).run(now, fixture.projectSessionId);
    finalRepair.close();
    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.chairContext,
      FABRIC_OPERATIONS.workstreamSettle,
      settle,
    )).resolves.toMatchObject({
      state: "complete",
      revision: 2,
      membershipRevision: created.membershipRevision + 1,
    });
    const terminal = new Database(fixture.databasePath, { readonly: true });
    expect(terminal.prepare(`
      SELECT member_id, state FROM project_session_memberships
       WHERE project_session_id=? AND member_kind IN ('task','workstream') ORDER BY member_id
    `).all(fixture.projectSessionId)).toEqual([
      { member_id: "task_1", state: "reconciled" },
      { member_id: "task_child_1", state: "reconciled" },
      { member_id: "workstream_1", state: "reconciled" },
    ]);
    expect(terminal.prepare("SELECT state FROM budgets WHERE budget_id='team_child_1:budget'").get())
      .toEqual({ state: "released" });
    expect(terminal.prepare("SELECT state FROM deliveries WHERE delivery_id='delivery_unrelated_required'").get())
      .toEqual({ state: "ready" });
    terminal.close();
  });
});

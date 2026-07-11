import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

import {
  parseOperatorCapabilityGrant,
  type ProjectId,
  type OperatorId,
  type ProjectSessionCreateRequest,
  type ProjectSessionTransitionRequest,
  type ChairTakeoverRequest,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations, type Migration } from "../../../src/core/migrations.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
import { ProjectSessionStore } from "../../../src/project-session/store.ts";
import { preflightProjectSessionOperations } from "../../../src/persistence/project-session-preflight.ts";

const databases: Database.Database[] = [];
const digest = `sha256:${"a".repeat(64)}`;
const artifact = { path: "docs/spec.md", digest };

function migration(version: number, filename: string, preflight?: Migration["preflight"]): Migration {
  return {
    version,
    name: filename.replace(/^[0-9]+-/u, "").replace(/\.sql$/u, ""),
    sql: readFileSync(new URL(`../../../migrations/${filename}`, import.meta.url), "utf8"),
    ...(preflight === undefined ? {} : { preflight }),
  };
}

function openDatabase(): Database.Database {
  const database = new Database(":memory:");
  databases.push(database);
  applyMigrations(database, [
    migration(1, "0001-core.sql"),
    migration(2, "0002-observer-event-sequence.sql"),
    migration(3, "0003-integrity-and-query-plans.sql"),
    migration(4, "0004-project-session-operations.sql", preflightProjectSessionOperations),
  ]);
  database.prepare(`
    INSERT INTO projects(project_id, canonical_root, revision, authority_generation, created_at, updated_at)
    VALUES ('project_01', '/project/one', 1, 1, 1, 1)
  `).run();
  return database;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("project-session store", () => {
  it("creates one revisioned session and replays the exact launch command once", () => {
    const database = openDatabase();
    const operatorStore = new OperatorStore({ database, clock: () => 1_000 });
    const sessions = new ProjectSessionStore({ database, operatorStore, clock: () => 1_000 });
    operatorStore.registerPrincipal({
      operatorId: "operator_01",
      projectId: "project_01",
      authenticatedSubjectHash: "subject-hash",
      projectAuthorityGeneration: 1,
    });
    const grant = parseOperatorCapabilityGrant({
      capabilityId: "cap_launch",
      operatorId: "operator_01",
      projectId: "project_01",
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
      issuedAt: "2026-07-11T00:00:00Z",
      expiresAt: "2099-01-01T00:00:00Z",
      status: "active",
      kind: "project-launch",
      actions: ["read", "launch"],
    });
    operatorStore.issueCapability(grant, "launch-secret");
    const request = {
      command: {
        credential: { capabilityId: "cap_launch", token: "launch-secret" },
        commandId: "command_launch",
        expectedRevision: 1,
        actor: "operator_01",
        provenance: { kind: "console-direct-input", clientId: "console_01", inputEventId: "input_01" },
        evidenceRefs: [artifact],
      },
      projectSessionId: "session_01",
      projectId: "project_01",
      mode: "coordinated",
      generation: 1,
      authorityRef: digest,
      budgetRef: "budget_01",
      launchPacketRef: artifact,
    } as unknown as ProjectSessionCreateRequest;
    const context = {
      operatorId: "operator_01" as OperatorId,
      projectId: "project_01" as ProjectId,
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
    };

    const created = sessions.createProjectSession(context, request);
    expect(created).toMatchObject({
      projectSessionId: "session_01",
      projectId: "project_01",
      state: "draft",
      revision: 1,
      generation: 1,
      membershipRevision: 1,
      origin: { kind: "operator-launch", operatorId: "operator_01" },
    });
    expect(sessions.createProjectSession(context, request)).toEqual(created);
    expect(database.prepare("SELECT count(*) AS count FROM project_sessions WHERE project_session_id='session_01'").get()).toEqual({ count: 1 });
    expect(database.prepare("SELECT revision FROM projects WHERE project_id='project_01'").get()).toEqual({ revision: 2 });

    const sessionGrant = parseOperatorCapabilityGrant({
      ...grant,
      capabilityId: "cap_session",
      kind: "session",
      projectSessionId: "session_01",
      sessionGeneration: 1,
      actions: ["read", "decide"],
    });
    operatorStore.issueCapability(sessionGrant, "session-secret");
    const transitionRequest = {
      command: {
        credential: { capabilityId: "cap_session", token: "session-secret" },
        commandId: "command_transition",
        expectedRevision: 1,
        actor: "operator_01",
        provenance: { kind: "console-direct-input", clientId: "console_01", inputEventId: "input_02" },
        evidenceRefs: [artifact],
      },
      projectSessionId: "session_01",
      expectedGeneration: 1,
      transition: { to: "awaiting_launch", reason: "reviewed" },
    } as unknown as ProjectSessionTransitionRequest;
    const transitioned = sessions.transitionProjectSession(context, transitionRequest);
    expect(transitioned).toMatchObject({ state: "awaiting_launch", revision: 2 });

    const publicLaunchTransition = {
      ...transitionRequest,
      command: {
        ...transitionRequest.command,
        commandId: "command_public_launch",
        expectedRevision: 2,
        provenance: { kind: "console-direct-input", clientId: "console_01", inputEventId: "input_public_launch" },
      },
      transition: { to: "launching", reason: "public path must not own launch custody" },
    } as unknown as ProjectSessionTransitionRequest;
    expect(() => sessions.transitionProjectSession(context, publicLaunchTransition)).toThrowError(
      expect.objectContaining({ code: "LIFECYCLE_PRECONDITION_FAILED" }),
    );
    expect(database.prepare("SELECT state, revision FROM project_sessions WHERE project_session_id='session_01'").get())
      .toEqual({ state: "awaiting_launch", revision: 2 });

    const changedRetry = {
      ...transitionRequest,
      transition: { to: "cancelled", reason: "changed after commit" },
    } as unknown as ProjectSessionTransitionRequest;
    expect(() => sessions.transitionProjectSession(context, changedRetry)).toThrowError(
      expect.objectContaining({ code: "DEDUPE_CONFLICT" }),
    );
  });

  it("takes over only after the old generation is fenced and the exact handoff is bound", () => {
    const database = openDatabase();
    database.exec(`
      INSERT INTO project_sessions(
        project_session_id, project_id, mode, state, revision, generation, authority_ref,
        budget_ref, launch_packet_path, launch_packet_digest, membership_revision,
        origin_kind, origin_operator_id, created_at, updated_at
      ) VALUES (
        'session_takeover', 'project_01', 'coordinated', 'active', 1, 1,
        '${digest}', 'budget_01', 'docs/spec.md', '${digest}', 1,
        'operator-launch', 'operator_01', 1, 1
      );
      INSERT INTO runs(
        run_id, chair_agent_id, workspace_root, project_run_directory, created_at,
        project_session_id, lifecycle_state, revision, chair_generation, chair_lease_id,
        authority_ref, budget_ref, dependency_revision, topology_slot
      ) VALUES (
        'run_takeover', 'chair_old', '/project/one', NULL, 1,
        'session_takeover', 'active', 3, 2, 'chair:run_takeover:2',
        '${digest}', 'budget_01', 1, 1
      );
      INSERT INTO authorities(authority_id, run_id, parent_authority_id, authority_json, authority_hash, created_at)
      VALUES ('authority_takeover', 'run_takeover', NULL, '{}', '${"e".repeat(64)}', 1);
      INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, provider_session_ref, lifecycle)
      VALUES ('run_takeover', 'chair_old', NULL, 'authority_takeover', 'provider_old', 'ready');
      INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, provider_session_ref, lifecycle)
      VALUES ('run_takeover', 'chair_new', 'chair_old', 'authority_takeover', 'provider_new', 'ready');
      INSERT INTO run_chair_leases(
        project_session_id, run_id, lease_id, holder_agent_id, generation, status, handoff_digest, updated_at
      ) VALUES ('session_takeover', 'run_takeover', 'chair:run_takeover:2', 'chair_old', 2, 'active', NULL, 1);
      INSERT INTO artifacts(artifact_id, run_id, task_id, publisher_agent_id, relative_path, sha256, created_at)
      VALUES ('artifact_handoff', 'run_takeover', NULL, 'chair_old', 'handoff.md', '${digest}', 1);
      INSERT INTO leases(lease_id, run_id, kind, holder_agent_id, generation, status, expires_at, updated_at)
      VALUES ('write_old', 'run_takeover', 'write', 'chair_old', 1, 'active', 9999999999999, 1);
    `);
    const operatorStore = new OperatorStore({ database, clock: () => 1_000 });
    const sessions = new ProjectSessionStore({ database, operatorStore, clock: () => 1_000 });
    operatorStore.registerPrincipal({
      operatorId: "operator_01",
      projectId: "project_01",
      authenticatedSubjectHash: "subject-hash",
      projectAuthorityGeneration: 1,
    });
    operatorStore.issueCapability(parseOperatorCapabilityGrant({
      capabilityId: "cap_takeover",
      operatorId: "operator_01",
      projectId: "project_01",
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2099-01-01T00:00:00Z",
      status: "active",
      kind: "takeover",
      projectSessionId: "session_takeover",
      sessionGeneration: 1,
      actions: ["takeover"],
      takeoverBinding: {
        handoffDigest: digest,
        oldChairGeneration: 2,
        expectedRunId: "run_takeover",
        expectedRunRevision: 3,
        expectedSessionRevision: 1,
        targetRevision: 4,
      },
    }), "takeover-secret");
    const context = {
      operatorId: "operator_01" as OperatorId,
      projectId: "project_01" as ProjectId,
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
    };
    const request = {
      command: {
        credential: { capabilityId: "cap_takeover", token: "takeover-secret" },
        commandId: "command_takeover",
        expectedRevision: 1,
        actor: "operator_01",
        provenance: { kind: "console-direct-input", clientId: "console_01", inputEventId: "input_takeover" },
        evidenceRefs: [{ path: "handoff.md", digest }],
      },
      projectSessionId: "session_takeover",
      runId: "run_takeover",
      expectedChairAgentId: "chair_old",
      successorChairAgentId: "chair_new",
      expectedChairGeneration: 2,
      expectedSessionGeneration: 1,
      handoffRef: { path: "handoff.md", digest },
      targetRevision: 4,
    } as unknown as ChairTakeoverRequest;

    expect(() => sessions.takeoverChair(context, request)).toThrowError(
      expect.objectContaining({ code: "WRITE_SCOPE_RECOVERY_REQUIRED" }),
    );
    database.prepare("UPDATE leases SET status='released' WHERE lease_id='write_old'").run();
    const takeover = sessions.takeoverChair(context, request);
    expect(takeover).toMatchObject({
      projectSessionId: "session_takeover",
      sessionRevision: 2,
      runRevision: 4,
      chairAgentId: "chair_new",
      chairGeneration: 3,
    });
    expect(sessions.takeoverChair(context, request)).toEqual(takeover);
    expect(database.prepare(`
      SELECT chair_agent_id, chair_generation, chair_lease_id, revision FROM runs WHERE run_id='run_takeover'
    `).get()).toEqual({
      chair_agent_id: "chair_new",
      chair_generation: 3,
      chair_lease_id: "chair:run_takeover:3",
      revision: 4,
    });
    expect(database.prepare("SELECT reason FROM delivery_freezes WHERE run_id='run_takeover' AND agent_id='chair_old'").get())
      .toEqual({ reason: "chair-takeover" });
  });
});

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

import {
  parseOperatorCapabilityGrant,
  type ProjectId,
  type OperatorId,
  type ProjectSessionCreateRequest,
  type ProjectSessionTransitionRequest,
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
  });
});

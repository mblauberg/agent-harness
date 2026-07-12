import Database from "better-sqlite3";

import {
  parseOperatorCapabilityGrant,
  type IntakeDraftCreateRequest,
  type IntakeSubmission,
  type OperatorId,
  type ProjectId,
  type TaskRequestCommit,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../../src/core/migrations.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
import { IntakeStore } from "../../../src/project-session/intake-store.ts";

const databases: Database.Database[] = [];
const digest = `sha256:${"c".repeat(64)}`;

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("revisioned intake", () => {
  it("creates and exactly replays one project-bound pre-session draft", () => {
    const database = new Database(":memory:");
    databases.push(database);
    applyMigrations(database);
    database.exec(`
      INSERT INTO projects(project_id, canonical_root, revision, authority_generation, created_at, updated_at)
      VALUES ('project_01', '/project/one', 1, 1, 1, 1);
      INSERT INTO artifacts(
        artifact_id,project_id,project_session_id,run_id,task_id,publisher_kind,
        publisher_ref,publisher_agent_id,source_kind,evidence_kind,relative_path,
        sha256,registry_state,quarantine_reason,revision,created_at
      ) VALUES (
        'artifact_spec_01','project_01',NULL,NULL,NULL,'project','project_01',NULL,
        'project-file','artifact','docs/spec.md','${digest}','active',NULL,1,1
      )
    `);
    const operatorStore = new OperatorStore({ database, clock: () => 1_000 });
    operatorStore.registerPrincipal({
      operatorId: "operator_01",
      projectId: "project_01",
      authenticatedSubjectHash: "subject-hash",
      projectAuthorityGeneration: 1,
    });
    operatorStore.issueCapability(parseOperatorCapabilityGrant({
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
    }), "launch-secret");
    const store = new IntakeStore({ database, operatorStore, clock: () => 1_000 });
    const context = {
      operatorId: "operator_01" as OperatorId,
      projectId: "project_01" as ProjectId,
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
    };
    const request = {
      command: {
        credential: { capabilityId: "cap_launch", token: "launch-secret" },
        commandId: "command_draft",
        expectedRevision: 0,
        actor: "operator_01",
        provenance: { kind: "console-direct-input", clientId: "console_01", inputEventId: "input_01" },
        evidenceRefs: [{ path: "docs/spec.md", digest }],
      },
      intakeId: "intake_01",
      dedupeKey: "intake-dedupe",
      summary: "Discuss the daemon design",
      artifactRefs: [{ path: "docs/spec.md", digest }],
      gateIds: [],
    } as unknown as IntakeDraftCreateRequest;

    const draft = store.createDraft(context, request);
    expect(draft).toMatchObject({
      intakeId: "intake_01",
      projectId: "project_01",
      state: "draft",
      revision: 1,
      dedupeKey: "intake-dedupe",
    });
    expect(store.createDraft(context, request)).toEqual(draft);
    expect(database.prepare("SELECT count(*) AS count FROM intakes").get()).toEqual({ count: 1 });
    expect(database.prepare("SELECT count(*) AS count FROM intake_revisions").get()).toEqual({ count: 1 });
  });

  it("binds submission to an existing run and atomically commits its exact chair request once", () => {
    const database = new Database(":memory:");
    databases.push(database);
    applyMigrations(database);
    database.exec(`
      INSERT INTO projects(project_id, canonical_root, revision, authority_generation, created_at, updated_at)
      VALUES ('project_01', '/project/one', 1, 1, 1, 1);
      INSERT INTO artifacts(
        artifact_id,project_id,project_session_id,run_id,task_id,publisher_kind,
        publisher_ref,publisher_agent_id,source_kind,evidence_kind,relative_path,
        sha256,registry_state,quarantine_reason,revision,created_at
      ) VALUES (
        'artifact_spec_01','project_01',NULL,NULL,NULL,'project','project_01',NULL,
        'project-file','artifact','docs/spec.md','${digest}','active',NULL,1,1
      );
      INSERT INTO project_sessions(
        project_session_id, project_id, mode, state, revision, generation, authority_ref,
        budget_ref, launch_packet_path, launch_packet_digest, membership_revision,
        origin_kind, origin_operator_id, created_at, updated_at
      ) VALUES (
        'session_01', 'project_01', 'coordinated', 'active', 1, 1, '${digest}',
        'budget_01', 'docs/spec.md', '${digest}', 1, 'operator-launch', 'operator_01', 1, 1
      );
      INSERT INTO runs(
        run_id, chair_agent_id, workspace_root, project_run_directory, created_at,
        project_session_id, lifecycle_state, revision, chair_generation, chair_lease_id,
        authority_ref, budget_ref, dependency_revision, topology_slot
      ) VALUES (
        'run_01', 'chair_01', '/project/one', NULL, 1, 'session_01', 'active', 1, 1,
        'chair:run_01:1', '${digest}', 'budget_01', 1, 1
      );
      CREATE TABLE request_commit_probe(message_id TEXT PRIMARY KEY);
    `);
    const operatorStore = new OperatorStore({ database, clock: () => 1_000 });
    operatorStore.registerPrincipal({
      operatorId: "operator_01",
      projectId: "project_01",
      authenticatedSubjectHash: "subject-hash",
      projectAuthorityGeneration: 1,
    });
    operatorStore.issueCapability(parseOperatorCapabilityGrant({
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
    }), "launch-secret");
    operatorStore.issueCapability(parseOperatorCapabilityGrant({
      capabilityId: "cap_session",
      operatorId: "operator_01",
      projectId: "project_01",
      projectSessionId: "session_01",
      projectAuthorityGeneration: 1,
      sessionGeneration: 1,
      principalGeneration: 1,
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2099-01-01T00:00:00Z",
      status: "active",
      kind: "session",
      actions: ["read", "decide"],
    }), "session-secret");
    let commitCalls = 0;
    const store = new IntakeStore({
      database,
      operatorStore,
      clock: () => 1_000,
      requestCommitter: {
        commitTaskRequest(request): TaskRequestCommit {
          commitCalls += 1;
          database.prepare("INSERT INTO request_commit_probe(message_id) VALUES (?)")
            .run(request.request.messageId);
          return {
            taskRevision: request.task.taskRevision,
            requestRevision: request.request.requestRevision,
            callbackId: request.request.callbackId,
            callbackGeneration: request.request.callbackGeneration,
          };
        },
      },
    });
    const context = {
      operatorId: "operator_01" as OperatorId,
      projectId: "project_01" as ProjectId,
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
    };
    store.createDraft(context, {
      command: {
        credential: { capabilityId: "cap_launch", token: "launch-secret" },
        commandId: "command_draft",
        expectedRevision: 0,
        actor: "operator_01",
        provenance: { kind: "console-direct-input", clientId: "console_01", inputEventId: "input_01" },
        evidenceRefs: [{ path: "docs/spec.md", digest }],
      },
      intakeId: "intake_01",
      dedupeKey: "intake-dedupe",
      summary: "Discuss the daemon design",
      artifactRefs: [{ path: "docs/spec.md", digest }],
      gateIds: [],
    } as unknown as IntakeDraftCreateRequest);
    const request = {
      command: {
        credential: { capabilityId: "cap_session", token: "session-secret" },
        commandId: "command_submit",
        expectedRevision: 1,
        actor: "operator_01",
        provenance: { kind: "console-direct-input", clientId: "console_01", inputEventId: "input_02" },
        evidenceRefs: [{ path: "docs/spec.md", digest }],
      },
      intakeId: "intake_01",
      expectedRevision: 1,
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      summary: "Discuss the daemon design with the chair",
      artifactRefs: [{ path: "docs/spec.md", digest }],
      gateIds: [],
      chairRequest: {
        commandId: "command_request",
        projectSessionId: "session_01",
        coordinationRunId: "run_01",
        task: {
          taskId: "task_discuss",
          taskRevision: 1,
          objective: "Discuss intake 01",
          baseRevision: "c2fc623",
          expectedArtifactPaths: ["docs/spec.md"],
        },
        request: {
          requestRevision: 1,
          messageId: "message_intake",
          conversationId: "conversation_intake",
          targetAgentId: "chair_01",
          targetProviderSessionRef: "provider_chair",
          requiresAck: true,
          dedupeKey: "intake-discussion",
          responseDeadline: "2099-01-01T00:00:00Z",
          callbackId: "callback_intake",
          callbackGeneration: 1,
          dependentBarrierId: "barrier_intake",
          intakeBinding: {
            intakeId: "intake_01",
            intakeRevision: 2,
            gateIds: [],
            artifactDigests: [digest],
          },
        },
      },
    } as unknown as IntakeSubmission;

    const wrongRun = {
      ...request,
      coordinationRunId: "run_missing",
      chairRequest: {
        ...request.chairRequest,
        coordinationRunId: "run_missing",
      },
    } as unknown as IntakeSubmission;
    expect(() => store.submit(context, wrongRun)).toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
    expect(commitCalls).toBe(0);

    const submitted = store.submit(context, request);
    expect(submitted).toMatchObject({
      intakeId: "intake_01",
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      state: "awaiting-chair",
      revision: 2,
    });
    expect(store.submit(context, request)).toEqual(submitted);
    expect(commitCalls).toBe(1);
    expect(database.prepare("SELECT count(*) AS count FROM request_commit_probe").get()).toEqual({ count: 1 });
    expect(database.prepare("SELECT chair_request_id, chair_request_revision FROM intakes WHERE intake_id='intake_01'").get())
      .toEqual({ chair_request_id: "message_intake", chair_request_revision: 1 });
    expect(() => store.submit(context, {
      ...request,
      summary: "Changed after commit",
    } as unknown as IntakeSubmission)).toThrowError(expect.objectContaining({ code: "DEDUPE_CONFLICT" }));
  });
});

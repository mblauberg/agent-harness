import Database from "better-sqlite3";

import {
  parseIntakeRevisionRequest,
  parseIdentifier,
  parseOperatorCapabilityGrant,
  type IntakeRevisionRequest,
  type OperatorId,
  type ProjectId,
  type TaskRequestCommit,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../../src/core/migrations.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
import type { AuthenticatedAgentContext } from "../../../src/project-session/contracts.ts";
import {
  IntakeStore,
  type IntakeTaskRequestCommitter,
} from "../../../src/project-session/intake-store.ts";

const databases: Database.Database[] = [];
const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;

function setupStore(options: { requestCommitter?: IntakeTaskRequestCommitter } = {}): {
  database: Database.Database;
  store: IntakeStore;
  context: { operatorId: OperatorId; projectId: ProjectId; projectAuthorityGeneration: number; principalGeneration: number };
  chairContext: AuthenticatedAgentContext;
} {
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
      'project-file','artifact','docs/spec.md','${digestA}','active',NULL,1,1
    ), (
      'artifact_revised_01','project_01',NULL,NULL,NULL,'project','project_01',NULL,
      'project-file','artifact','plans/revised.md','${digestB}','active',NULL,1,1
    );
    INSERT INTO project_sessions(
      project_session_id, project_id, mode, state, revision, generation, authority_ref,
      budget_ref, launch_packet_path, launch_packet_digest, membership_revision,
      origin_kind, origin_operator_id, created_at, updated_at
    ) VALUES (
      'session_01', 'project_01', 'coordinated', 'active', 1, 1, '${digestA}',
      'budget_01', 'launch/packet.json', '${digestA}', 1, 'operator-launch', 'operator_01', 1, 1
    );
    INSERT INTO runs(
      run_id, chair_agent_id, workspace_root, project_run_directory, created_at,
      project_session_id, lifecycle_state, revision, chair_generation, chair_lease_id,
      authority_ref, budget_ref, dependency_revision, topology_slot
    ) VALUES (
      'run_01', 'chair_01', '/project/one', NULL, 1, 'session_01', 'active', 4, 1,
      'chair:run_01:1', '${digestA}', 'budget_01', 1, 1
    );
    INSERT INTO authorities(authority_id, run_id, parent_authority_id, authority_json, authority_hash, created_at)
    VALUES ('authority_chair_01', 'run_01', NULL, '{}', 'authority-hash', 1);
    INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, provider_session_ref, lifecycle)
    VALUES ('run_01', 'chair_01', NULL, 'authority_chair_01', 'provider_chair_01', 'ready');
    INSERT INTO capabilities(token_hash, run_id, agent_id, principal_generation, expires_at, revoked_at)
    VALUES ('chair-token-hash', 'run_01', 'chair_01', 1, 4070908800000, NULL);
    INSERT INTO run_chair_leases(
      project_session_id, run_id, lease_id, holder_agent_id, generation, status, updated_at
    ) VALUES ('session_01', 'run_01', 'chair:run_01:1', 'chair_01', 1, 'active', 1);
    INSERT INTO scoped_gates(
      gate_id, project_session_id, coordination_run_id, dedupe_key, scope_kind,
      scope_task_id, dependency_revision, blocked_operation_ids_json,
      enforcement_points_json, question, reason, options_json, recommendation,
      consequences_json, evidence_refs_json, created_by_ref, expected_approver_ref,
      deadline, default_action, status, human_required, release_binding_json,
      revision, created_at, updated_at
    ) VALUES (
      'gate_01', 'session_01', 'run_01', 'gate-one', 'run', NULL, 1, '[]',
      '["scoped-barrier"]', 'First gate?', 'Required.', '["approve"]', 'approve',
      '[]', '[]', 'agent:chair_01', 'authenticated-human-operator', NULL, NULL,
      'pending', 1, NULL, 3, 1, 1
    ), (
      'gate_02', 'session_01', 'run_01', 'gate-two', 'run', NULL, 1, '[]',
      '["scoped-barrier"]', 'Second gate?', 'Revised.', '["approve"]', 'approve',
      '[]', '[]', 'agent:chair_01', 'authenticated-human-operator', NULL, NULL,
      'pending', 1, NULL, 5, 1, 1
    );
    INSERT INTO intakes(
      intake_id, project_id, project_session_id, coordination_run_id, dedupe_key,
      state, revision, chair_request_id, chair_request_revision, summary,
      artifact_refs_json, gate_ids_json, payload_digest, created_at, updated_at
    ) VALUES (
      'intake_01', 'project_01', 'session_01', 'run_01', 'intake-dedupe',
      'awaiting-chair', 2, 'message_intake_01', 1, 'Discuss the daemon design',
      '[{"digest":"${digestA}","path":"docs/spec.md"}]', '["gate_01"]', '${digestA}', 1, 1
    );
    INSERT INTO intake_revisions(intake_id, revision, state, payload_json, payload_digest, actor_ref, created_at)
    VALUES
      ('intake_01', 1, 'draft', '{}', '${digestA}', 'operator_01', 1),
      ('intake_01', 2, 'awaiting-chair', '{}', '${digestA}', 'operator_01', 1);
    INSERT INTO intake_artifact_bindings(intake_id, intake_revision, artifact_id, relative_path, sha256)
    VALUES ('intake_01', 2, 'artifact_spec_01', 'docs/spec.md', '${digestA}');
    INSERT INTO intake_gate_bindings(intake_id, intake_revision, gate_id, gate_revision)
    VALUES ('intake_01', 2, 'gate_01', 3);
    INSERT INTO messages(
      message_id, run_id, sender_id, dedupe_key, payload_hash, audience_json,
      kind, body, requires_ack, conversation_id, reply_to_message_id,
      task_revision, hop_count, expires_at, created_at
    ) VALUES (
      'message_intake_01', 'run_01', 'chair_01', 'intake-request-one', 'payload-one',
      '{"agentId":"chair_01","kind":"agent"}', 'request', 'Discuss intake', 1,
      'conversation_intake', NULL, 1, 0, 4070908800000, 1
    );
  `);

  const operatorStore = new OperatorStore({ database, clock: () => 1_000 });
  operatorStore.registerPrincipal({
    operatorId: "operator_01",
    projectId: "project_01",
    authenticatedSubjectHash: "subject-hash",
    projectAuthorityGeneration: 1,
  });
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
  return {
    database,
    store: new IntakeStore({
      database,
      operatorStore,
      clock: () => 1_000,
      ...(options.requestCommitter === undefined ? {} : { requestCommitter: options.requestCommitter }),
    }),
    context: {
      operatorId: "operator_01" as OperatorId,
      projectId: "project_01" as ProjectId,
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
    },
    chairContext: {
      agentId: "chair_01" as never,
      projectSessionId: "session_01" as never,
      coordinationRunId: "run_01" as never,
      principalGeneration: 1,
    },
  };
}

function operatorRevisionWithChairRequest(): Extract<IntakeRevisionRequest, { origin: "operator" }> {
  const base = operatorRevision();
  const parsed = parseIntakeRevisionRequest({
    ...base,
    command: { ...base.command, commandId: "command_revise_request_01" },
    chairRequest: {
      commandId: "command_chair_request_02",
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      task: {
        taskId: "task_discuss_02",
        taskRevision: 1,
        objective: "Continue discussing intake 01",
        baseRevision: "925bf01",
        expectedArtifactPaths: ["plans/revised.md"],
      },
      request: {
        requestRevision: 1,
        messageId: "message_intake_02",
        conversationId: "conversation_intake",
        targetAgentId: "chair_01",
        targetProviderSessionRef: "provider_chair_01",
        requiresAck: true,
        dedupeKey: "intake-discussion-two",
        responseDeadline: "2099-01-01T00:00:00Z",
        callbackId: "callback_intake_02",
        callbackGeneration: 1,
        dependentBarrierId: "barrier_intake_02",
        intakeBinding: {
          intakeId: "intake_01",
          intakeRevision: 3,
          gateIds: ["gate_02"],
          artifactDigests: [digestB],
        },
      },
    },
  });
  if (parsed.origin !== "operator") throw new Error("expected operator intake revision");
  return parsed;
}

function persistedChairRequest(conversationId = "conversation_intake") {
  return {
    commandId: "command_chair_request_01",
    projectSessionId: "session_01",
    coordinationRunId: "run_01",
    task: {
      taskId: "task_discuss_01",
      taskRevision: 1,
      objective: "Discuss intake 01",
      baseRevision: "base_revision_01",
      expectedArtifactPaths: ["docs/spec.md"],
    },
    request: {
      requestRevision: 1,
      messageId: "message_intake_01",
      conversationId,
      targetAgentId: "chair_01",
      targetProviderSessionRef: "provider_chair_01",
      requiresAck: true as const,
      dedupeKey: "intake-request-one",
      responseDeadline: "2099-01-01T00:00:00.000Z",
      callbackId: "callback_intake_01",
      callbackGeneration: 1,
      dependentBarrierId: "barrier_intake_01",
      intakeBinding: {
        intakeId: "intake_01",
        intakeRevision: 2,
        gateIds: ["gate_01"],
        artifactDigests: [digestA],
      },
    },
  };
}

function chairRevision(): Extract<IntakeRevisionRequest, { origin: "chair" }> {
  const parsed = parseIntakeRevisionRequest({
    origin: "chair",
    command: {
      commandId: "command_chair_revise_01",
      agentId: "chair_01",
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      principalGeneration: 1,
      chairLeaseId: "chair:run_01:1",
      chairLeaseGeneration: 1,
      expectedRunRevision: 4,
      expectedRevision: 2,
    },
    intakeId: "intake_01",
    projectSessionId: "session_01",
    coordinationRunId: "run_01",
    expectedRevision: 2,
    state: "awaiting-human",
    summary: "The chair needs a human decision",
    artifactRefs: [{ path: "plans/revised.md", digest: digestB }],
    gateIds: ["gate_02"],
  });
  if (parsed.origin !== "chair") throw new Error("expected chair intake revision");
  return parsed;
}

function operatorRevision(): Extract<IntakeRevisionRequest, { origin: "operator" }> {
  const parsed = parseIntakeRevisionRequest({
    origin: "operator",
    command: {
      credential: { capabilityId: "cap_session", token: "session-secret" },
      commandId: "command_revise_01",
      expectedRevision: 2,
      actor: "operator_01",
      provenance: { kind: "console-direct-input", clientId: "console_01", inputEventId: "input_03" },
      evidenceRefs: [{ path: "plans/revised.md", digest: digestB }],
    },
    intakeId: "intake_01",
    projectSessionId: "session_01",
    coordinationRunId: "run_01",
    expectedRevision: 2,
    state: "discussing",
    summary: "Discuss the revised daemon design",
    artifactRefs: [{ path: "plans/revised.md", digest: digestB }],
    gateIds: ["gate_02"],
  });
  if (parsed.origin !== "operator") throw new Error("expected operator intake revision");
  return parsed;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("intake revision", () => {
  it("updates the same operator-owned intake exactly once and appends its bound durable revision", () => {
    const fixture = setupStore();
    const request = operatorRevision();

    const revised = fixture.store.revise(fixture.context, request);

    expect(revised).toMatchObject({
      intakeId: "intake_01",
      projectId: "project_01",
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      revision: 3,
      state: "discussing",
      summary: "Discuss the revised daemon design",
      artifactRefs: [{ path: "plans/revised.md", digest: digestB }],
      gateIds: ["gate_02"],
    });
    expect(fixture.store.revise(fixture.context, request)).toEqual(revised);
    const changedReplay = parseIntakeRevisionRequest({ ...request, summary: "Changed replay" });
    if (changedReplay.origin !== "operator") throw new Error("expected operator intake revision");
    expect(() => fixture.store.revise(fixture.context, changedReplay))
      .toThrowError(expect.objectContaining({ code: "DEDUPE_CONFLICT" }));
    expect(fixture.database.prepare(`
      SELECT revision, state, actor_ref FROM intake_revisions
       WHERE intake_id='intake_01' ORDER BY revision
    `).all()).toEqual([
      { revision: 1, state: "draft", actor_ref: "operator_01" },
      { revision: 2, state: "awaiting-chair", actor_ref: "operator_01" },
      { revision: 3, state: "discussing", actor_ref: "operator_01" },
    ]);
    expect(fixture.database.prepare(`
      SELECT relative_path, sha256 FROM intake_artifact_bindings
       WHERE intake_id='intake_01' AND intake_revision=3
    `).all()).toEqual([{ relative_path: "plans/revised.md", sha256: digestB }]);
    expect(fixture.database.prepare(`
      SELECT gate_id, gate_revision FROM intake_gate_bindings
       WHERE intake_id='intake_01' AND intake_revision=3
    `).all()).toEqual([{ gate_id: "gate_02", gate_revision: 5 }]);
    expect(fixture.database.prepare(`
      SELECT count(*) AS count FROM operator_commands WHERE command_id='command_revise_01'
    `).get()).toEqual({ count: 1 });
  });

  it("commits one next chair request on the persisted discussion correlation", () => {
    let commitCalls = 0;
    const requestCommitter: IntakeTaskRequestCommitter = {
      commitTaskRequest(request): TaskRequestCommit {
        commitCalls += 1;
        return {
          taskRevision: request.task.taskRevision,
          requestRevision: request.request.requestRevision,
          callbackId: request.request.callbackId,
          callbackGeneration: request.request.callbackGeneration,
        };
      },
    };
    const fixture = setupStore({ requestCommitter });
    const request = operatorRevisionWithChairRequest();

    const revised = fixture.store.revise(fixture.context, request);

    expect(revised).toMatchObject({ intakeId: "intake_01", revision: 3, state: "discussing" });
    expect(fixture.store.revise(fixture.context, request)).toEqual(revised);
    expect(commitCalls).toBe(1);
    expect(fixture.database.prepare(`
      SELECT chair_request_id, chair_request_revision FROM intakes WHERE intake_id='intake_01'
    `).get()).toEqual({ chair_request_id: "message_intake_02", chair_request_revision: 1 });
  });

  it("reads a current chair-bound seed for the next atomic discussion request", () => {
    const fixture = setupStore();
    fixture.database.prepare(`
      INSERT INTO message_contexts(message_id, context_json) VALUES (?, ?)
    `).run("message_intake_01", JSON.stringify(persistedChairRequest()));

    expect(fixture.store.get("intake_01")).toMatchObject({
      chairRequestSeed: {
        conversationId: "conversation_intake",
        targetAgentId: "chair_01",
        targetProviderSessionRef: "provider_chair_01",
        baseRevision: "base_revision_01",
      },
    });
  });

  it("omits chair request preparation when durable request context is absent", () => {
    const fixture = setupStore();

    expect(fixture.store.get("intake_01")).not.toHaveProperty("chairRequestSeed");
  });

  it("fails closed when durable chair request context changes conversation", () => {
    const fixture = setupStore();
    fixture.database.prepare(`
      INSERT INTO message_contexts(message_id, context_json) VALUES (?, ?)
    `).run(
      "message_intake_01",
      JSON.stringify(persistedChairRequest("conversation_other")),
    );

    expect(() => fixture.store.get("intake_01")).toThrowError(
      expect.objectContaining({ code: "RECOVERY_REQUIRED" }),
    );
  });

  it("rejects a revised chair request that changes the persisted discussion conversation", () => {
    let commitCalls = 0;
    const fixture = setupStore({
      requestCommitter: {
        commitTaskRequest(request): TaskRequestCommit {
          commitCalls += 1;
          return {
            taskRevision: request.task.taskRevision,
            requestRevision: request.request.requestRevision,
            callbackId: request.request.callbackId,
            callbackGeneration: request.request.callbackGeneration,
          };
        },
      },
    });
    const original = operatorRevisionWithChairRequest();
    if (original.chairRequest === undefined) throw new Error("expected revised chair request");
    const changed = parseIntakeRevisionRequest({
      ...original,
      chairRequest: {
        ...original.chairRequest,
        request: { ...original.chairRequest.request, conversationId: "conversation_other" },
      },
    });
    if (changed.origin !== "operator") throw new Error("expected operator intake revision");

    expect(() => fixture.store.revise(fixture.context, changed))
      .toThrowError(expect.objectContaining({ code: "CONFLICT" }));
    expect(commitCalls).toBe(0);
  });

  it("rejects a revised discussion request that targets a foreign chair", () => {
    let commitCalls = 0;
    const fixture = setupStore({
      requestCommitter: {
        commitTaskRequest(request): TaskRequestCommit {
          commitCalls += 1;
          return {
            taskRevision: request.task.taskRevision,
            requestRevision: request.request.requestRevision,
            callbackId: request.request.callbackId,
            callbackGeneration: request.request.callbackGeneration,
          };
        },
      },
    });
    const original = operatorRevisionWithChairRequest();
    if (original.chairRequest === undefined) throw new Error("expected revised chair request");
    const changed = parseIntakeRevisionRequest({
      ...original,
      chairRequest: {
        ...original.chairRequest,
        request: { ...original.chairRequest.request, targetAgentId: "chair_foreign" },
      },
    });
    if (changed.origin !== "operator") throw new Error("expected operator intake revision");

    expect(() => fixture.store.revise(fixture.context, changed))
      .toThrowError(expect.objectContaining({ code: "TASK_NOT_OWNER" }));
    expect(commitCalls).toBe(0);
  });

  it("lets only the generation-fenced active chair append an exactly replayable revision", () => {
    const fixture = setupStore();
    const request = chairRevision();

    const revised = fixture.store.revise(fixture.chairContext, request);

    expect(revised).toMatchObject({
      intakeId: "intake_01",
      revision: 3,
      state: "awaiting-human",
      summary: "The chair needs a human decision",
    });
    expect(fixture.store.revise(fixture.chairContext, request)).toEqual(revised);
    expect(fixture.database.prepare(`
      SELECT actor_ref FROM intake_revisions WHERE intake_id='intake_01' AND revision=3
    `).get()).toEqual({ actor_ref: "chair_01" });
    expect(fixture.database.prepare(`
      SELECT count(*) AS count FROM commands
       WHERE run_id='run_01' AND actor_agent_id='chair_01' AND command_id='command_chair_revise_01'
    `).get()).toEqual({ count: 1 });
  });

  it("rejects a stale operator session generation without revising the intake", () => {
    const fixture = setupStore();
    fixture.database.prepare("UPDATE project_sessions SET generation=2 WHERE project_session_id='session_01'").run();

    expect(() => fixture.store.revise(fixture.context, operatorRevision()))
      .toThrowError(expect.objectContaining({ code: "STALE_GENERATION" }));
    expect(fixture.store.get("intake_01")).toMatchObject({ revision: 2, state: "awaiting-chair" });
  });

  it("rejects an operator context from another project", () => {
    const fixture = setupStore();

    expect(() => fixture.store.revise({
      ...fixture.context,
      projectId: parseIdentifier<"ProjectId">("project_foreign", "test.projectId"),
    }, operatorRevision())).toThrowError(expect.objectContaining({ code: "WRONG_PROJECT" }));
    expect(fixture.store.get("intake_01")).toMatchObject({ revision: 2, state: "awaiting-chair" });
  });

  it("rejects a missing gate before writing revised intake history", () => {
    const fixture = setupStore();
    const original = operatorRevision();
    const changed = parseIntakeRevisionRequest({
      ...original,
      command: { ...original.command, commandId: "command_revise_missing_gate" },
      gateIds: ["gate_missing"],
    });
    if (changed.origin !== "operator") throw new Error("expected operator intake revision");

    expect(() => fixture.store.revise(fixture.context, changed))
      .toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
    expect(fixture.store.get("intake_01")).toMatchObject({ revision: 2, state: "awaiting-chair" });
    expect(fixture.database.prepare(`
      SELECT count(*) AS count FROM intake_revisions WHERE intake_id='intake_01'
    `).get()).toEqual({ count: 2 });
  });

  it("rejects stale chair principal generation with a typed generation error", () => {
    const fixture = setupStore();
    const original = chairRevision();
    const changed = parseIntakeRevisionRequest({
      ...original,
      command: { ...original.command, principalGeneration: 2 },
    });
    if (changed.origin !== "chair") throw new Error("expected chair intake revision");

    expect(() => fixture.store.revise(
      { ...fixture.chairContext, principalGeneration: 2 },
      changed,
    )).toThrowError(expect.objectContaining({ code: "STALE_PRINCIPAL_GENERATION" }));
    expect(fixture.store.get("intake_01")).toMatchObject({ revision: 2, state: "awaiting-chair" });
  });

  it("rejects a foreign chair before any intake mutation", () => {
    const fixture = setupStore();
    const original = chairRevision();
    const changed = parseIntakeRevisionRequest({
      ...original,
      command: { ...original.command, agentId: "chair_foreign" },
    });
    if (changed.origin !== "chair") throw new Error("expected chair intake revision");

    expect(() => fixture.store.revise(
      {
        ...fixture.chairContext,
        agentId: parseIdentifier<"AgentId">("chair_foreign", "test.agentId"),
      },
      changed,
    )).toThrowError(expect.objectContaining({ code: "TASK_NOT_OWNER" }));
    expect(fixture.store.get("intake_01")).toMatchObject({ revision: 2, state: "awaiting-chair" });
  });

  it.each([
    ["chair lease generation", { chairLeaseGeneration: 2 }, "STALE_LEASE_GENERATION"],
    ["run revision", { expectedRunRevision: 3 }, "STALE_LEASE_GENERATION"],
    ["intake revision", { expectedRevision: 1 }, "STALE_REVISION"],
  ] as const)("rejects stale %s fencing", (_label, commandChange, code) => {
    const fixture = setupStore();
    const original = chairRevision();
    const changed = parseIntakeRevisionRequest({
      ...original,
      expectedRevision: "expectedRevision" in commandChange
        ? commandChange.expectedRevision
        : original.expectedRevision,
      command: { ...original.command, ...commandChange },
    });
    if (changed.origin !== "chair") throw new Error("expected chair intake revision");

    expect(() => fixture.store.revise(fixture.chairContext, changed))
      .toThrowError(expect.objectContaining({ code }));
    expect(fixture.store.get("intake_01")).toMatchObject({ revision: 2, state: "awaiting-chair" });
  });
});

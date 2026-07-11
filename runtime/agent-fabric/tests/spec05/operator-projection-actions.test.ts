import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

import {
  parseIdentifier,
  parseArtifactRef,
  parseOperatorCapabilityGrant,
  parseSha256Digest,
  parseTimestamp,
  type OperatorActionCommitRequest,
  type OperatorActionIntent,
  type OperatorActionPreview,
  type OperatorActionPreviewRequest,
  type OperatorCapabilityCredential,
  type OperatorDetailReadRequest,
  type OperatorViewPageRequest,
  type ProjectDiscoveryRequest,
  type ProjectionEventsRequest,
  type ProjectionSnapshotRequest,
  type ScopedGate,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations, type Migration } from "../../src/core/migrations.ts";
import {
  OperatorActionStore,
  type OperatorActionCurrentState,
  type OperatorActionEffectPort,
  type OperatorEffectOutcome,
  type OperatorActionStatePort,
} from "../../src/operator/action-store.ts";
import { OperatorProjectionStore } from "../../src/operator/projection-store.ts";
import { OperatorStore } from "../../src/operator/store.ts";
import type { AuthenticatedOperatorContext } from "../../src/project-session/contracts.ts";
import { preflightProjectSessionOperations } from "../../src/persistence/project-session-preflight.ts";

const databases: Database.Database[] = [];
const digest = `sha256:${"a".repeat(64)}`;
const now = Date.parse("2027-01-01T00:00:00Z");

function migration(version: number, filename: string, preflight?: Migration["preflight"]): Migration {
  return {
    version,
    name: filename.replace(/^[0-9]+-/u, "").replace(/\.sql$/u, ""),
    sql: readFileSync(new URL(`../../migrations/${filename}`, import.meta.url), "utf8"),
    ...(preflight === undefined ? {} : { preflight }),
  };
}

function identifier<Kind extends string>(value: string): ReturnType<typeof parseIdentifier<Kind>> {
  return parseIdentifier<Kind>(value, "test.identifier");
}

function setupProjection(): {
  database: Database.Database;
  projections: OperatorProjectionStore;
  operatorStore: OperatorStore;
  context: AuthenticatedOperatorContext;
  credential: OperatorCapabilityCredential;
} {
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
    VALUES ('project_01', '/project/one', 3, 1, ${now - 10_000}, ${now - 1_000});
    INSERT INTO project_sessions(
      project_session_id, project_id, mode, state, revision, generation, authority_ref,
      budget_ref, launch_packet_path, launch_packet_digest, membership_revision,
      origin_kind, origin_operator_id, created_at, updated_at
    ) VALUES (
      'session_01', 'project_01', 'coordinated', 'active', 2, 1, '${digest}',
      'budget_01', 'docs/spec.md', '${digest}', 1,
      'operator-launch', 'operator_01', ${now - 9_000}, ${now - 900}
    );
    INSERT INTO runs(
      run_id, chair_agent_id, workspace_root, project_run_directory, created_at,
      project_session_id, lifecycle_state, revision, chair_generation, chair_lease_id,
      authority_ref, budget_ref, dependency_revision, topology_slot
    ) VALUES (
      'run_01', 'chair_01', '/project/one', '.agent-run/AFAB-001', ${now - 8_000},
      'session_01', 'active', 4, 1, 'chair:run_01:1', '${digest}', 'budget_01', 1, 1
    );
    INSERT INTO authorities(authority_id, run_id, authority_json, authority_hash, created_at)
    VALUES ('authority_01', 'run_01', '{}', '${"b".repeat(64)}', ${now - 8_000});
    INSERT INTO agents(run_id, agent_id, authority_id, provider_session_ref, lifecycle)
    VALUES ('run_01', 'chair_01', 'authority_01', 'provider_session_01', 'ready');
    INSERT INTO provider_state(run_id, agent_id, provider_session_generation, context_revision)
    VALUES ('run_01', 'chair_01', 2, 'context_01');
    INSERT INTO tasks(
      run_id, task_id, authority_id, objective, base_revision, state,
      owner_agent_id, revision, owner_lease_generation, created_by
    ) VALUES (
      'run_01', 'task_01', 'authority_01', 'Implement projection', 'base_01', 'active',
      'chair_01', 3, 1, 'chair_01'
    );
    INSERT INTO artifacts(artifact_id, run_id, task_id, publisher_agent_id, relative_path, sha256, created_at)
    VALUES ('artifact_01', 'run_01', 'task_01', 'chair_01', 'reports/result.md', '${digest}', ${now - 500});
    INSERT INTO attention_items(
      item_id, project_session_id, coordination_run_id, kind, severity, revision,
      state, dedupe_key, payload_json, created_at, updated_at
    ) VALUES (
      'attention_01', 'session_01', 'run_01', 'approval', 'critical', 2,
      'open', 'approval:01',
      '{"title":"Approve result","priority":"safety-integrity","duplicateCount":1}',
      ${now - 600}, ${now - 400}
    );
    INSERT INTO messages(
      message_id, run_id, sender_id, dedupe_key, payload_hash, audience_json, kind,
      body, requires_ack, conversation_id, hop_count, created_at
    ) VALUES (
      'message_01', 'run_01', 'chair_01', 'message:01', '${"c".repeat(64)}',
      '{"kind":"task","taskId":"task_01"}', 'event', 'Projection ready', 0,
      'conversation_01', 0, ${now - 300}
    );
    INSERT INTO events(event_id, run_id, type, actor_agent_id, payload_json, created_at)
    VALUES ('event_01', 'run_01', 'message-sent', 'chair_01', '{"messageId":"message_01"}', ${now - 300});
    INSERT INTO observer_event_sequence(event_id) VALUES ('event_01');
    INSERT INTO resource_scopes(
      scope_id, project_id, project_session_id, coordination_run_id,
      scope_kind, owner_ref, state, revision
    ) VALUES ('scope_session_01', 'project_01', 'session_01', NULL, 'project-session', 'session_01', 'active', 1);
    INSERT INTO resource_dimensions(scope_id, unit_key, limit_value, used, reserved, usage_unknown)
    VALUES ('scope_session_01', 'provider_calls', 100, 5, 10, 0);
    INSERT INTO integration_availability(integration_id, state, discovered_contract_json, checked_at)
    VALUES ('integration_01', 'available', '{"generation":2,"detail":"Herdr control available"}', ${now - 200});
  `);

  const operatorStore = new OperatorStore({ database, clock: () => now });
  operatorStore.registerPrincipal({
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
    expiresAt: "2099-01-01T00:00:00Z",
    status: "active",
    kind: "session",
    projectSessionId: "session_01",
    sessionGeneration: 1,
    actions: ["read", "pause", "resume", "cancel", "steer", "drain", "stop", "git", "external-effect"],
  });
  operatorStore.issueCapability(grant, "session-secret");
  return {
    database,
    operatorStore,
    projections: new OperatorProjectionStore({ database, operatorStore, clock: () => now }),
    context: {
      operatorId: identifier<"OperatorId">("operator_01"),
      projectId: identifier<"ProjectId">("project_01"),
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
    },
    credential: {
      capabilityId: identifier<"CapabilityId">("cap_session"),
      token: "session-secret",
    },
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("operator projection store", () => {
  it("discovers the selected project and returns one authoritative revisioned snapshot", () => {
    const fixture = setupProjection();
    const projectId = identifier<"ProjectId">("project_01");
    const projectSessionId = identifier<"ProjectSessionId">("session_01");
    const discoveryRequest: ProjectDiscoveryRequest = {
      credential: fixture.credential,
      projectId,
      after: 0,
      limit: 10,
    };

    expect(fixture.projections.discover(discoveryRequest)).toMatchObject({
      project: {
        freshness: "live",
        source: "fabric",
        revision: 3,
        value: { projectId: "project_01", canonicalRoot: "/project/one" },
      },
      sessions: {
        freshness: "live",
        source: "fabric",
        value: {
          items: [{ projectSessionId: "session_01", state: "active", revision: 2, generation: 1 }],
          nextCursor: 1,
          hasMore: false,
        },
      },
    });

    const snapshotRequest: ProjectionSnapshotRequest = {
      credential: fixture.credential,
      projectId,
      projectSessionId,
    };
    const snapshot = fixture.projections.snapshot(snapshotRequest);
    const globalRevision = fixture.database.prepare(
      "SELECT revision FROM daemon_global_state WHERE singleton=1",
    ).get() as { revision: number };

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      snapshotRevision: globalRevision.revision,
      project: { freshness: "live", revision: 3 },
      session: { freshness: "live", value: { projectSessionId: "session_01", revision: 2 } },
      runs: { freshness: "live", value: [{ runId: "run_01", chairAgentId: "chair_01" }] },
      attention: { freshness: "live", value: [{ itemId: "attention_01", revision: 2 }] },
      cursor: 1,
    });
    expect(snapshot.readTransactionId).toMatch(/^projection:/u);
    expect(snapshot.stateDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("pages v2 attention rows at one snapshot and resolves an exact revision-bound detail", () => {
    const fixture = setupProjection();
    const projectId = identifier<"ProjectId">("project_01");
    const projectSessionId = identifier<"ProjectSessionId">("session_01");
    const snapshot = fixture.projections.snapshot({
      credential: fixture.credential,
      projectId,
      projectSessionId,
    });
    const pageRequest: OperatorViewPageRequest<"attention"> = {
      credential: fixture.credential,
      projectId,
      projectSessionId,
      view: "attention",
      snapshotRevision: snapshot.snapshotRevision,
      cursor: 0,
      limit: 1,
    };
    const page = fixture.projections.viewPage(pageRequest);

    expect(page).toMatchObject({
      status: "page",
      view: "attention",
      rows: [{
        itemId: "attention_01",
        itemRevision: 2,
        fact: {
          freshness: "live",
          source: "fabric",
          value: {
            summary: {
              kind: "attention",
              label: "Approval",
              priority: "safety-integrity",
              title: "Approve result",
            },
            detailRef: { kind: "run", coordinationRunId: "run_01", expectedRevision: 4 },
            actionAvailability: { state: "available", requiresPreview: true },
          },
        },
      }],
      nextCursor: 1,
      hasMore: false,
      snapshotRevision: snapshot.snapshotRevision,
    });
    if (page.status !== "page") throw new Error("expected an attention page");
    const rowValue = page.rows[0]?.fact;
    if (rowValue?.freshness !== "live") throw new Error("expected a live attention row");
    const detailRequest: OperatorDetailReadRequest = {
      credential: fixture.credential,
      projectId,
      projectSessionId,
      snapshotRevision: snapshot.snapshotRevision,
      detailRef: rowValue.value.detailRef,
    };
    expect(fixture.projections.detail(detailRequest)).toMatchObject({
      status: "current",
      detailRef: { kind: "run", coordinationRunId: "run_01", expectedRevision: 4 },
      detail: {
        freshness: "live",
        value: {
          kind: "run",
          coordinationRunId: "run_01",
          chairAgentId: "chair_01",
          chairGeneration: 1,
        },
      },
    });

    expect(fixture.projections.detail({
      ...detailRequest,
      detailRef: { ...detailRequest.detailRef, expectedRevision: 3 },
    })).toEqual({
      status: "resnapshot-required",
      reason: "detail-revision-changed",
      currentSnapshotRevision: snapshot.snapshotRevision,
    });

    fixture.database.prepare("UPDATE tasks SET revision=revision+1 WHERE run_id='run_01' AND task_id='task_01'").run();
    expect(fixture.projections.viewPage(pageRequest)).toMatchObject({
      status: "resnapshot-required",
      view: "attention",
      reason: "snapshot-mismatch",
    });
  });

  it("pages monotonic events and reads a revision-bound terminal-safe full message", () => {
    const fixture = setupProjection();
    const projectId = identifier<"ProjectId">("project_01");
    const projectSessionId = identifier<"ProjectSessionId">("session_01");
    const eventRequest: ProjectionEventsRequest = {
      credential: fixture.credential,
      projectId,
      projectSessionId,
      after: 0,
      limit: 1,
    };

    expect(fixture.projections.events(eventRequest)).toMatchObject({
      status: "continuation",
      events: [{
        cursor: 1,
        projectSessionId: "session_01",
        kind: "message-sent",
        revision: 1,
        payload: { messageId: "message_01" },
      }],
      nextCursor: 1,
      hasMore: false,
    });
    expect(fixture.projections.events({ ...eventRequest, after: 99 })).toMatchObject({
      status: "resnapshot-required",
      reason: "cursor-overflow",
      snapshotCursor: 1,
    });

    const capability = `afb_${"z".repeat(43)}`;
    fixture.database.prepare("UPDATE messages SET body=? WHERE message_id='message_01'")
      .run(`line 1\u001b[31m ${capability}\nline 2`);
    fixture.database.prepare(`
      INSERT INTO message_contexts(message_id, context_json)
      VALUES ('message_01', '{"kind":"task","taskId":"task_01"}')
    `).run();
    const body = fixture.projections.messageBody({
      credential: fixture.credential,
      projectSessionId,
      messageId: identifier<"MessageId">("message_01"),
      expectedRevision: 1,
    });

    expect(body).toMatchObject({
      available: true,
      messageId: "message_01",
      revision: 1,
      terminalNeutralised: true,
      capabilityValuesRedacted: true,
      artifactRefs: [{ path: "reports/result.md", digest }],
    });
    if (!body.available) throw new Error("expected a readable message body");
    expect(body.body).toContain("line 1");
    expect(body.body).toContain("line 2");
    expect(body.body).not.toContain("\u001b");
    expect(body.body).not.toContain(capability);
    expect(body.body).toContain("afb_<redacted>");

    expect(() => fixture.projections.messageBody({
      credential: fixture.credential,
      projectSessionId,
      messageId: identifier<"MessageId">("message_01"),
      expectedRevision: 2,
    })).toThrowError(expect.objectContaining({ code: "STALE_REVISION" }));
  });

  it("pages every v2 view and resolves each emitted detail reference", () => {
    const fixture = setupProjection();
    const projectId = identifier<"ProjectId">("project_01");
    const projectSessionId = identifier<"ProjectSessionId">("session_01");
    const snapshot = fixture.projections.snapshot({
      credential: fixture.credential,
      projectId,
      projectSessionId,
    });
    const expectedItems = [
      ["attention", "attention_01"],
      ["project", "project_01"],
      ["runs", "run_01"],
      ["work", "task_01"],
      ["agents", "chair_01"],
      ["evidence", "artifact_01"],
      ["activity", "event_01"],
      ["system", "integration_01"],
    ] as const;

    for (const [view, expectedItemId] of expectedItems) {
      const page = fixture.projections.viewPage({
        credential: fixture.credential,
        projectId,
        projectSessionId,
        view,
        snapshotRevision: snapshot.snapshotRevision,
        cursor: 0,
        limit: 10,
      });
      if (page.status !== "page") throw new Error(`expected ${view} page`);
      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]).toMatchObject({ itemId: expectedItemId });
      const fact = page.rows[0]?.fact;
      if (fact?.freshness !== "live") throw new Error(`expected live ${view} row`);
      const detail = fixture.projections.detail({
        credential: fixture.credential,
        projectId,
        projectSessionId,
        snapshotRevision: snapshot.snapshotRevision,
        detailRef: fact.value.detailRef,
      });
      expect(detail).toMatchObject({ status: "current", detailRef: fact.value.detailRef });
    }
  });

  it("keeps an omitted session selector inside the credential's exact session scope", () => {
    const fixture = setupProjection();
    const projectId = identifier<"ProjectId">("project_01");
    fixture.database.exec(`
      INSERT INTO project_sessions(
        project_session_id, project_id, mode, state, revision, generation, authority_ref,
        budget_ref, launch_packet_path, launch_packet_digest, membership_revision,
        origin_kind, origin_operator_id, created_at, updated_at
      ) VALUES (
        'session_02', 'project_01', 'independent', 'active', 1, 1, '${digest}',
        'budget_02', 'docs/other.md', '${digest}', 1,
        'operator-launch', 'operator_01', ${now - 800}, ${now - 700}
      );
    `);

    const snapshot = fixture.projections.snapshot({ credential: fixture.credential, projectId });
    expect(snapshot.session).toMatchObject({ value: { projectSessionId: "session_01" } });
    expect(snapshot.runs).toMatchObject({ value: [{ runId: "run_01" }] });

    const discovery = fixture.projections.discover({
      credential: fixture.credential,
      projectId,
      after: 0,
      limit: 10,
    });
    expect(discovery.sessions).toMatchObject({
      value: { items: [{ projectSessionId: "session_01" }], hasMore: false },
    });

    expect(() => fixture.projections.detail({
      credential: fixture.credential,
      projectId,
      snapshotRevision: snapshot.snapshotRevision,
      detailRef: {
        kind: "session",
        projectSessionId: identifier<"ProjectSessionId">("session_02"),
        expectedRevision: 1,
      },
    })).toThrowError(expect.objectContaining({ code: "CAPABILITY_FORBIDDEN" }));
  });
});

describe("operator action store", () => {
  it("persists a revision-bound preview and dispatches one effect for an idempotent confirmed command", async () => {
    const fixture = setupProjection();
    const projectId = identifier<"ProjectId">("project_01");
    const statePort: OperatorActionStatePort = {
      read: async () => ({
        kind: "control",
        revision: 4,
        lifecycleState: "active",
        eligibleActions: ["pause"],
      }),
    };
    let dispatches = 0;
    const effectPort: OperatorActionEffectPort = {
      dispatch: async () => {
        dispatches += 1;
        return { status: "committed", afterState: { lifecycleState: "paused" } };
      },
      observe: async () => {
        throw new Error("not expected");
      },
    };
    const actions = new OperatorActionStore({
      database: fixture.database,
      operatorStore: fixture.operatorStore,
      statePort,
      effectPort,
      clock: () => now,
    });
    const artifact = parseArtifactRef({ path: "reports/result.md", digest }, "test.artifact");
    const previewRequest: OperatorActionPreviewRequest = {
      command: {
        credential: fixture.credential,
        commandId: identifier<"CommandId">("preview_command_01"),
        expectedRevision: 4,
        actor: identifier<"OperatorId">("operator_01"),
        provenance: {
          kind: "console-direct-input",
          clientId: identifier<"OperatorClientId">("console_01"),
          inputEventId: "input_preview_01",
        },
        evidenceRefs: [artifact],
      },
      projectId,
      intent: {
        kind: "control",
        action: "pause",
        target: {
          kind: "run",
          projectSessionId: identifier<"ProjectSessionId">("session_01"),
          coordinationRunId: identifier<"CoordinationRunId">("run_01"),
          expectedRevision: 4,
        },
      },
    };
    const preview = await actions.preview(fixture.context, previewRequest);

    expect(preview).toMatchObject({
      previewRevision: 1,
      intent: previewRequest.intent,
      consequenceClass: "routine",
      confirmationMode: "explicit",
      evidenceRefs: [artifact],
    });
    expect(preview.previewDigest).toMatch(/^sha256:/u);
    expect(preview.intentDigest).toMatch(/^sha256:/u);
    expect(preview.beforeStateDigest).toMatch(/^sha256:/u);

    const commitRequest: OperatorActionCommitRequest = {
      command: {
        ...previewRequest.command,
        commandId: identifier<"CommandId">("commit_command_01"),
        provenance: {
          kind: "console-direct-input",
          clientId: identifier<"OperatorClientId">("console_01"),
          inputEventId: "input_commit_01",
        },
      },
      projectId,
      previewId: preview.previewId,
      expectedPreviewRevision: preview.previewRevision,
      previewDigest: preview.previewDigest,
      expectedIntentDigest: preview.intentDigest,
      confirmation: { kind: "explicit", confirmationId: "confirm_01" },
    };
    const receipt = await actions.commit(fixture.context, commitRequest);

    expect(receipt).toMatchObject({
      commandId: "commit_command_01",
      previewId: preview.previewId,
      previewRevision: 1,
      intentDigest: preview.intentDigest,
      beforeStateDigest: preview.beforeStateDigest,
      evidenceRefs: [artifact],
    });
    expect(receipt.afterStateDigest).toBe(parseSha256Digest(
      receipt.afterStateDigest,
      "test.receipt.afterStateDigest",
    ));
    expect(await actions.commit(fixture.context, commitRequest)).toEqual(receipt);
    expect(dispatches).toBe(1);
    expect(actions.status({
      credential: fixture.credential,
      projectId,
      commandId: "commit_command_01",
    })).toEqual({ status: "committed", commandId: "commit_command_01", receipt });
  });

  it("collapses concurrent identical confirmations to one durable effect", async () => {
    const control = setupControlAction();
    const preview = await control.actions.preview(control.fixture.context, control.previewRequest);
    const commitRequest = control.commitRequest(preview, "commit_concurrent_01");

    const [first, second] = await Promise.all([
      control.actions.commit(control.fixture.context, commitRequest),
      control.actions.commit(control.fixture.context, commitRequest),
    ]);

    expect(second).toEqual(first);
    expect(control.dispatches()).toBe(1);
  });

  it("rejects a commit whose target revision changed after preview and persists that terminal status", async () => {
    const control = setupControlAction();
    const preview = await control.actions.preview(control.fixture.context, control.previewRequest);
    control.setRevision(5);
    const commitRequest = control.commitRequest(preview, "commit_stale_01");

    await expect(control.actions.commit(control.fixture.context, commitRequest)).rejects.toMatchObject({
      code: "STALE_REVISION",
    });
    expect(control.dispatches()).toBe(0);
    expect(control.actions.status({
      credential: control.fixture.credential,
      projectId: control.previewRequest.projectId,
      commandId: "commit_stale_01",
    })).toEqual({
      status: "rejected",
      commandId: "commit_stale_01",
      intentDigest: preview.intentDigest,
      code: "state-changed",
      evidenceRefs: preview.evidenceRefs,
    });
    await expect(control.actions.commit(control.fixture.context, commitRequest)).rejects.toMatchObject({
      code: "STALE_REVISION",
    });
    expect(control.dispatches()).toBe(0);
  });

  it("expires an unconfirmed preview without dispatching its effect", async () => {
    const control = setupControlAction({ previewTtlMs: 100 });
    const preview = await control.actions.preview(control.fixture.context, control.previewRequest);
    control.advanceTime(101);
    const commitRequest = control.commitRequest(preview, "commit_expired_01");

    await expect(control.actions.commit(control.fixture.context, commitRequest)).rejects.toMatchObject({
      code: "CAPABILITY_EXPIRED",
    });
    expect(control.dispatches()).toBe(0);
    expect(control.actions.status({
      credential: control.fixture.credential,
      projectId: control.previewRequest.projectId,
      commandId: "commit_expired_01",
    })).toEqual({
      status: "rejected",
      commandId: "commit_expired_01",
      intentDigest: preview.intentDigest,
      code: "preview-expired",
      evidenceRefs: preview.evidenceRefs,
    });
  });

  it("rejects reuse of one preview command ID with changed input", async () => {
    const control = setupControlAction();
    await control.actions.preview(control.fixture.context, control.previewRequest);

    await expect(control.actions.preview(control.fixture.context, {
      ...control.previewRequest,
      command: {
        ...control.previewRequest.command,
        provenance: {
          kind: "console-direct-input",
          clientId: identifier<"OperatorClientId">("console_01"),
          inputEventId: "changed_input_for_same_command",
        },
      },
    })).rejects.toMatchObject({ code: "DEDUPE_CONFLICT" });
  });

  it("does not let a failed second confirmation replace an already committed preview", async () => {
    const control = setupControlAction();
    const preview = await control.actions.preview(control.fixture.context, control.previewRequest);
    const firstCommit = control.commitRequest(preview, "commit_first_01");
    await control.actions.commit(control.fixture.context, firstCommit);
    const secondCommit = {
      ...control.commitRequest(preview, "commit_second_01"),
      previewDigest: parseSha256Digest(`sha256:${"f".repeat(64)}`, "test.changedPreviewDigest"),
    };

    await expect(control.actions.commit(control.fixture.context, secondCommit)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(control.fixture.database.prepare(`
      SELECT confirmed_command_id FROM operator_previews WHERE preview_id=?
    `).get(preview.previewId)).toEqual({ confirmed_command_id: "commit_first_01" });
  });

  it("reconciles an ambiguous effect by observation without redispatch", async () => {
    const effectRef = parseArtifactRef({ path: "effects/pause.json", digest }, "test.effectRef");
    const control = setupControlAction({
      dispatchOutcome: { status: "ambiguous", effectRef },
      observeOutcome: { status: "committed", afterState: { lifecycleState: "paused" }, effectRef },
    });
    const preview = await control.actions.preview(control.fixture.context, control.previewRequest);
    const commitRequest = control.commitRequest(preview, "commit_ambiguous_01");
    await control.actions.commit(control.fixture.context, commitRequest);

    expect(control.actions.status({
      credential: control.fixture.credential,
      projectId: control.previewRequest.projectId,
      commandId: "commit_ambiguous_01",
    })).toEqual({
      status: "ambiguous",
      commandId: "commit_ambiguous_01",
      intentDigest: preview.intentDigest,
      attemptGeneration: 1,
      effectRef,
    });

    const reconcileRequest = {
      command: {
        ...control.previewRequest.command,
        commandId: identifier<"CommandId">("reconcile_ambiguous_01"),
        provenance: {
          kind: "console-direct-input" as const,
          clientId: identifier<"OperatorClientId">("console_01"),
          inputEventId: "input_reconcile_01",
        },
      },
      projectId: control.previewRequest.projectId,
      targetCommandId: "commit_ambiguous_01",
      expectedStatus: "ambiguous" as const,
      expectedAttemptGeneration: 1,
      mode: "observe-only" as const,
    };
    const reconciled = await control.actions.reconcile(control.fixture.context, reconcileRequest);

    expect(reconciled).toMatchObject({
      status: "committed",
      commandId: "commit_ambiguous_01",
      receipt: { effectRef },
    });
    expect(await control.actions.reconcile(control.fixture.context, reconcileRequest)).toEqual(reconciled);
    expect(control.dispatches()).toBe(1);
    expect(control.observes()).toBe(1);
  });

  it("keeps the incremented observation generation when reconciliation remains pending", async () => {
    const effectRef = parseArtifactRef({ path: "effects/pause-pending.json", digest }, "test.pendingEffectRef");
    const control = setupControlAction({
      dispatchOutcome: { status: "ambiguous", effectRef },
      observeOutcome: { status: "pending", phase: "accepted" },
    });
    const preview = await control.actions.preview(control.fixture.context, control.previewRequest);
    await control.actions.commit(control.fixture.context, control.commitRequest(preview, "commit_pending_observe_01"));
    const reconcileRequest = {
      command: {
        ...control.previewRequest.command,
        commandId: identifier<"CommandId">("reconcile_pending_observe_01"),
        provenance: {
          kind: "console-direct-input" as const,
          clientId: identifier<"OperatorClientId">("console_01"),
          inputEventId: "input_reconcile_pending_observe_01",
        },
      },
      projectId: control.previewRequest.projectId,
      targetCommandId: "commit_pending_observe_01",
      expectedStatus: "ambiguous" as const,
      expectedAttemptGeneration: 1,
      mode: "observe-only" as const,
    };

    const status = await control.actions.reconcile(control.fixture.context, reconcileRequest);
    expect(status).toEqual({
      status: "pending",
      commandId: "commit_pending_observe_01",
      intentDigest: preview.intentDigest,
      phase: "accepted",
      attemptGeneration: 2,
    });
    expect(await control.actions.reconcile(control.fixture.context, reconcileRequest)).toEqual(status);
    expect(control.dispatches()).toBe(1);
    expect(control.observes()).toBe(1);
  });

  it("binds session-neutral action previews and status reads to the issuing session capability", async () => {
    const fixture = setupProjection();
    fixture.database.exec(`
      INSERT INTO project_sessions(
        project_session_id, project_id, mode, state, revision, generation, authority_ref,
        budget_ref, launch_packet_path, launch_packet_digest, membership_revision,
        origin_kind, origin_operator_id, created_at, updated_at
      ) VALUES (
        'session_02', 'project_01', 'independent', 'active', 1, 1, '${digest}',
        'budget_02', 'docs/other.md', '${digest}', 1,
        'operator-launch', 'operator_01', ${now - 800}, ${now - 700}
      );
    `);
    const secondCredential: OperatorCapabilityCredential = {
      capabilityId: identifier<"CapabilityId">("cap_session_02"),
      token: "session-secret-02",
    };
    fixture.operatorStore.issueCapability(parseOperatorCapabilityGrant({
      capabilityId: secondCredential.capabilityId,
      operatorId: "operator_01",
      projectId: "project_01",
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2099-01-01T00:00:00Z",
      status: "active",
      kind: "session",
      projectSessionId: "session_02",
      sessionGeneration: 1,
      actions: ["read", "drain"],
    }), secondCredential.token);
    let dispatches = 0;
    const actions = new OperatorActionStore({
      database: fixture.database,
      operatorStore: fixture.operatorStore,
      statePort: {
        read: async () => ({
          kind: "daemon-lifecycle",
          revision: 10,
          daemonGeneration: 2,
          globalStateRevision: 10,
          lifecycleState: "running",
          drainReceiptRef: null,
        }),
      },
      effectPort: {
        dispatch: async () => {
          dispatches += 1;
          return { status: "committed", afterState: { lifecycleState: "quiescing" } };
        },
        observe: async () => { throw new Error("not expected"); },
      },
      clock: () => now,
    });
    const previewRequest: OperatorActionPreviewRequest = {
      command: {
        credential: secondCredential,
        commandId: identifier<"CommandId">("preview_session_02_daemon_01"),
        expectedRevision: 10,
        actor: identifier<"OperatorId">("operator_01"),
        provenance: {
          kind: "console-direct-input",
          clientId: identifier<"OperatorClientId">("console_02"),
          inputEventId: "input_preview_session_02_daemon_01",
        },
        evidenceRefs: [],
      },
      projectId: identifier<"ProjectId">("project_01"),
      intent: {
        kind: "daemon-drain",
        expectedDaemonGeneration: 2,
        expectedGlobalStateRevision: 10,
      },
    };
    const preview = await actions.preview(fixture.context, previewRequest);
    const commitRequest: OperatorActionCommitRequest = {
      command: {
        ...previewRequest.command,
        credential: fixture.credential,
        commandId: identifier<"CommandId">("commit_wrong_session_01"),
        provenance: {
          kind: "console-direct-input",
          clientId: identifier<"OperatorClientId">("console_01"),
          inputEventId: "input_commit_wrong_session_01",
        },
      },
      projectId: previewRequest.projectId,
      previewId: preview.previewId,
      expectedPreviewRevision: preview.previewRevision,
      previewDigest: preview.previewDigest,
      expectedIntentDigest: preview.intentDigest,
      confirmation: { kind: "explicit", confirmationId: "confirm_wrong_session_01" },
    };

    await expect(actions.commit(fixture.context, commitRequest)).rejects.toMatchObject({
      code: "CAPABILITY_FORBIDDEN",
    });
    expect(dispatches).toBe(0);

    const committed = await actions.commit(fixture.context, {
      ...commitRequest,
      command: {
        ...commitRequest.command,
        credential: secondCredential,
        commandId: identifier<"CommandId">("commit_session_02_daemon_01"),
      },
    });
    expect(actions.status({
      credential: fixture.credential,
      projectId: previewRequest.projectId,
      commandId: committed.commandId,
    })).toEqual({ status: "not-found", commandId: committed.commandId });
    expect(actions.status({
      credential: secondCredential,
      projectId: previewRequest.projectId,
      commandId: committed.commandId,
    })).toMatchObject({ status: "committed", commandId: committed.commandId });
  });

  it("validates lifecycle, Git, registered-external and promotion bindings before persisting previews", async () => {
    const projectSessionId = identifier<"ProjectSessionId">("session_01");
    const coordinationRunId = identifier<"CoordinationRunId">("run_01");
    const artifact = parseArtifactRef({ path: "reports/result.md", digest }, "test.validatorArtifact");
    const sha = parseSha256Digest(digest, "test.validatorDigest");

    await expectValidPreview(
      {
        kind: "project-session-drain",
        projectSessionId,
        expectedSessionRevision: 2,
        expectedSessionGeneration: 1,
        expectedGlobalStateRevision: 10,
      },
      {
        kind: "project-session-lifecycle",
        revision: 2,
        sessionGeneration: 1,
        globalStateRevision: 10,
        lifecycleState: "active",
        drainReceiptRef: null,
      },
      2,
      "consequential",
      "preview_lifecycle_01",
    );
    await expectValidPreview(
      {
        kind: "daemon-drain",
        expectedDaemonGeneration: 7,
        expectedGlobalStateRevision: 10,
      },
      {
        kind: "daemon-lifecycle",
        revision: 10,
        daemonGeneration: 7,
        globalStateRevision: 10,
        lifecycleState: "running",
        drainReceiptRef: null,
      },
      10,
      "consequential",
      "preview_daemon_01",
    );
    await expectValidPreview(
      {
        kind: "git",
        repository: {
          repositoryRoot: "/project/one",
          worktreePath: "/project/one/.worktrees/operator",
          remoteName: "origin",
          expectedHeadDigest: sha,
          expectedIndexDigest: sha,
          expectedWorktreeDigest: sha,
          expectedRemoteDigest: sha,
        },
        operation: { effect: "stage", paths: ["src/operator/action-store.ts"] },
      },
      {
        kind: "git",
        revision: 6,
        state: {
          headDigest: sha,
          indexDigest: sha,
          worktreeDigest: sha,
          remoteDigest: sha,
          objectDigests: {},
        },
      },
      6,
      "consequential",
      "preview_git_01",
    );
    await expectValidPreview(
      {
        kind: "registered-external-effect",
        integrationId: identifier<"IntegrationId">("integration_01"),
        expectedIntegrationGeneration: 2,
        operationId: "notify.create",
        contractDigest: sha,
        requestArtifactRef: artifact,
        targetId: "target_01",
        expectedTargetRevision: 5,
        idempotencyKey: "effect_01",
      },
      {
        kind: "registered-external-effect",
        revision: 5,
        state: {
          integrationId: identifier<"IntegrationId">("integration_01"),
          integrationGeneration: 2,
          operationContracts: { "notify.create": sha },
          targetRevisions: { target_01: 5 },
        },
      },
      5,
      "external",
      "preview_external_01",
    );
    const releaseBinding = {
      acceptedDeliveryReceiptRef: artifact,
      artifactDigest: sha,
      promotionAction: "release",
      target: "local:test",
    };
    const gate: ScopedGate = {
      gateId: identifier<"GateId">("gate_release_01"),
      projectSessionId,
      coordinationRunId,
      scope: { kind: "release" },
      affectedTaskIds: [],
      dependencyRevision: 1,
      blockedOperationIds: [],
      enforcementPoints: ["operation"],
      question: "Release?",
      reason: "Exact promotion boundary",
      options: ["approve", "reject"],
      recommendation: "approve",
      consequences: ["promotes artifact"],
      evidenceRefs: [artifact],
      revision: 3,
      createdByRef: "policy:release",
      expectedApproverRef: "operator_01",
      status: "approved",
      resolution: {
        operatorId: identifier<"OperatorId">("operator_01"),
        decidedAt: identifierTimestamp("2027-01-01T00:00:00Z"),
        evidenceRefs: [artifact],
        kind: "typed-console",
        confirmationCommandId: identifier<"CommandId">("gate_confirmation_01"),
      },
      releaseBinding,
    };
    await expectValidPreview(
      {
        kind: "promotion",
        projectSessionId,
        coordinationRunId,
        gateId: gate.gateId,
        expectedGateRevision: 3,
        expectedGateStatus: "approved",
        releaseBinding,
      },
      { kind: "promotion", revision: 3, gate },
      3,
      "promotion",
      "preview_promotion_01",
    );
  });

  it("validates every reviewed project-session launch custody binding before preview", async () => {
    const fixture = setupProjection();
    fixture.database.exec(`
      INSERT INTO project_sessions(
        project_session_id, project_id, mode, state, revision, generation, authority_ref,
        budget_ref, launch_packet_path, launch_packet_digest, membership_revision,
        origin_kind, origin_operator_id, created_at, updated_at
      ) VALUES (
        'session_launch_01', 'project_01', 'coordinated', 'awaiting_launch', 1, 1, '${digest}',
        'budget_01', 'launch/packet.json', '${digest}', 1,
        'operator-launch', 'operator_01', ${now - 200}, ${now - 100}
      );
    `);
    const projectLaunchCredential: OperatorCapabilityCredential = {
      capabilityId: identifier<"CapabilityId">("cap_project_launch_01"),
      token: "project-launch-secret-01",
    };
    fixture.operatorStore.issueCapability(parseOperatorCapabilityGrant({
      capabilityId: projectLaunchCredential.capabilityId,
      operatorId: "operator_01",
      projectId: "project_01",
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2099-01-01T00:00:00Z",
      status: "active",
      kind: "project-launch",
      actions: ["read", "launch"],
    }), projectLaunchCredential.token);
    const launchCredential: OperatorCapabilityCredential = {
      capabilityId: identifier<"CapabilityId">("cap_session_launch_01"),
      token: "session-launch-secret-01",
    };
    fixture.operatorStore.issueCapability(parseOperatorCapabilityGrant({
      capabilityId: launchCredential.capabilityId,
      operatorId: "operator_01",
      projectId: "project_01",
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2099-01-01T00:00:00Z",
      status: "active",
      kind: "session",
      projectSessionId: "session_launch_01",
      sessionGeneration: 1,
      actions: ["read", "launch"],
    }), launchCredential.token);
    const projectId = identifier<"ProjectId">("project_01");
    const projectSessionId = identifier<"ProjectSessionId">("session_launch_01");
    const launchPacketRef = parseArtifactRef({ path: "launch/packet.json", digest }, "test.launchPacketRef");
    const resourcePlanRef = parseArtifactRef({ path: "launch/resources.json", digest }, "test.resourcePlanRef");
    const authorityRef = parseSha256Digest(digest, "test.launchAuthorityRef");
    const providerActionId = identifier<"ProviderActionId">("provider_action_launch_01");
    const intent: OperatorActionIntent = {
      kind: "project-session-launch",
      projectId,
      projectSessionId,
      expectedSessionRevision: 1,
      expectedSessionGeneration: 1,
      launchPacketRef,
      authorityRef,
      budgetRef: "budget_01",
      resourcePlanRef,
      providerAdapterId: "claude-agent-sdk",
      providerActionId,
    };
    let current: OperatorActionCurrentState = {
      kind: "project-session-launch",
      revision: 1,
      projectId,
      projectSessionId,
      sessionGeneration: 1,
      lifecycleState: "awaiting_launch",
      launchPacketRef,
      authorityRef,
      budgetRef: "budget_01",
      resourcePlanRef,
      providerAdapterId: "claude-agent-sdk",
      providerActionId,
    };
    const actions = new OperatorActionStore({
      database: fixture.database,
      operatorStore: fixture.operatorStore,
      statePort: { read: async () => current },
      effectPort: {
        dispatch: async () => ({ status: "committed", afterState: { lifecycleState: "launching" } }),
        observe: async () => { throw new Error("not expected"); },
      },
      clock: () => now,
    });
    const request: OperatorActionPreviewRequest = {
      command: {
        credential: launchCredential,
        commandId: identifier<"CommandId">("preview_launch_01"),
        expectedRevision: 1,
        actor: identifier<"OperatorId">("operator_01"),
        provenance: {
          kind: "console-direct-input",
          clientId: identifier<"OperatorClientId">("console_launch_01"),
          inputEventId: "input_preview_launch_01",
        },
        evidenceRefs: [],
      },
      projectId,
      intent,
    };

    await expect(actions.preview(fixture.context, {
      ...request,
      command: {
        ...request.command,
        credential: projectLaunchCredential,
        commandId: identifier<"CommandId">("preview_launch_project_capability_01"),
      },
    })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });

    const preview = await actions.preview(fixture.context, request);
    expect(preview).toMatchObject({
      intent,
      consequenceClass: "consequential",
      evidenceRefs: [launchPacketRef, resourcePlanRef],
    });
    const receipt = await actions.commit(fixture.context, {
      command: {
        ...request.command,
        commandId: identifier<"CommandId">("commit_launch_01"),
        provenance: {
          kind: "console-direct-input",
          clientId: identifier<"OperatorClientId">("console_launch_01"),
          inputEventId: "input_commit_launch_01",
        },
      },
      projectId,
      previewId: preview.previewId,
      expectedPreviewRevision: preview.previewRevision,
      previewDigest: preview.previewDigest,
      expectedIntentDigest: preview.intentDigest,
      confirmation: { kind: "explicit", confirmationId: "confirm_launch_01" },
    });
    expect(actions.status({
      credential: launchCredential,
      projectId,
      commandId: receipt.commandId,
    })).toEqual({ status: "committed", commandId: receipt.commandId, receipt });

    current = {
      ...current,
      providerActionId: identifier<"ProviderActionId">("provider_action_changed_01"),
    };
    await expect(actions.preview(fixture.context, {
      ...request,
      command: {
        ...request.command,
        commandId: identifier<"CommandId">("preview_launch_changed_01"),
      },
    })).rejects.toMatchObject({ code: "STALE_REVISION" });

    fixture.database.exec(`
      INSERT INTO projects(project_id, canonical_root, revision, authority_generation, created_at, updated_at)
      VALUES ('project_02', '/project/two', 1, 1, ${now - 100}, ${now - 100});
      INSERT INTO project_sessions(
        project_session_id, project_id, mode, state, revision, generation, authority_ref,
        budget_ref, launch_packet_path, launch_packet_digest, membership_revision,
        origin_kind, origin_operator_id, created_at, updated_at
      ) VALUES (
        'session_foreign_01', 'project_02', 'coordinated', 'awaiting_launch', 1, 1, '${digest}',
        'budget_01', 'launch/packet.json', '${digest}', 1,
        'operator-launch', 'operator_01', ${now - 100}, ${now - 100}
      );
    `);
    const foreignSessionId = identifier<"ProjectSessionId">("session_foreign_01");
    current = {
      ...current,
      projectSessionId: foreignSessionId,
      providerActionId,
    };
    await expect(actions.preview(fixture.context, {
      ...request,
      command: {
        ...request.command,
        commandId: identifier<"CommandId">("preview_launch_foreign_session_01"),
      },
      intent: { ...intent, projectSessionId: foreignSessionId },
    })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
  });
});

async function expectValidPreview(
  intent: OperatorActionIntent,
  current: OperatorActionCurrentState,
  expectedRevision: number,
  consequenceClass: OperatorActionPreview["consequenceClass"],
  commandId: string,
): Promise<void> {
  const fixture = setupProjection();
  const actions = new OperatorActionStore({
    database: fixture.database,
    operatorStore: fixture.operatorStore,
    statePort: { read: async () => current },
    effectPort: {
      dispatch: async () => { throw new Error("not expected"); },
      observe: async () => { throw new Error("not expected"); },
    },
    clock: () => now,
  });
  const preview = await actions.preview(fixture.context, {
    command: {
      credential: fixture.credential,
      commandId: identifier<"CommandId">(commandId),
      expectedRevision,
      actor: identifier<"OperatorId">("operator_01"),
      provenance: {
        kind: "console-direct-input",
        clientId: identifier<"OperatorClientId">("console_01"),
        inputEventId: `input_${commandId}`,
      },
      evidenceRefs: [],
    },
    projectId: identifier<"ProjectId">("project_01"),
    intent,
  });
  expect(preview).toMatchObject({ intent, consequenceClass, confirmationMode: "explicit" });
}

function identifierTimestamp(value: string) {
  return parseTimestamp(value, "test.timestamp");
}

function setupControlAction(options: {
  outcome?: OperatorEffectOutcome;
  dispatchOutcome?: OperatorEffectOutcome;
  observeOutcome?: OperatorEffectOutcome;
  previewTtlMs?: number;
} = {}) {
  const fixture = setupProjection();
  let revision = 4;
  let currentTime = now;
  let dispatchCount = 0;
  let observeCount = 0;
  const statePort: OperatorActionStatePort = {
    read: async () => ({
      kind: "control",
      revision,
      lifecycleState: revision === 4 ? "active" : "changed",
      eligibleActions: ["pause"],
    }),
  };
  const effectPort: OperatorActionEffectPort = {
    dispatch: async () => {
      dispatchCount += 1;
      return options.dispatchOutcome ?? options.outcome ?? {
        status: "committed",
        afterState: { lifecycleState: "paused" },
      };
    },
    observe: async () => {
      observeCount += 1;
      return options.observeOutcome ?? options.outcome ?? {
        status: "committed",
        afterState: { lifecycleState: "paused" },
      };
    },
  };
  const actions = new OperatorActionStore({
    database: fixture.database,
    operatorStore: fixture.operatorStore,
    statePort,
    effectPort,
    clock: () => currentTime,
    ...(options.previewTtlMs === undefined ? {} : { previewTtlMs: options.previewTtlMs }),
  });
  const artifact = parseArtifactRef({ path: "reports/result.md", digest }, "test.controlArtifact");
  const previewRequest: OperatorActionPreviewRequest = {
    command: {
      credential: fixture.credential,
      commandId: identifier<"CommandId">("preview_control_01"),
      expectedRevision: 4,
      actor: identifier<"OperatorId">("operator_01"),
      provenance: {
        kind: "console-direct-input",
        clientId: identifier<"OperatorClientId">("console_01"),
        inputEventId: "input_preview_control",
      },
      evidenceRefs: [artifact],
    },
    projectId: identifier<"ProjectId">("project_01"),
    intent: {
      kind: "control",
      action: "pause",
      target: {
        kind: "run",
        projectSessionId: identifier<"ProjectSessionId">("session_01"),
        coordinationRunId: identifier<"CoordinationRunId">("run_01"),
        expectedRevision: 4,
      },
    },
  };
  return {
    fixture,
    actions,
    previewRequest,
    setRevision(value: number): void {
      revision = value;
    },
    advanceTime(milliseconds: number): void {
      currentTime += milliseconds;
    },
    dispatches: (): number => dispatchCount,
    observes: (): number => observeCount,
    commitRequest(preview: OperatorActionPreview, commandId: string): OperatorActionCommitRequest {
      return {
        command: {
          ...previewRequest.command,
          commandId: identifier<"CommandId">(commandId),
          provenance: {
            kind: "console-direct-input",
            clientId: identifier<"OperatorClientId">("console_01"),
            inputEventId: `input_${commandId}`,
          },
        },
        projectId: previewRequest.projectId,
        previewId: preview.previewId,
        expectedPreviewRevision: preview.previewRevision,
        previewDigest: preview.previewDigest,
        expectedIntentDigest: preview.intentDigest,
        confirmation: { kind: "explicit", confirmationId: `confirm_${commandId}` },
      };
    },
  };
}

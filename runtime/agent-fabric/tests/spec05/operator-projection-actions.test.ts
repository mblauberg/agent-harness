import Database from "better-sqlite3";

import {
  parseIdentifier,
  parseArtifactRef,
  parseOperatorCapabilityGrant,
  parseLaunchProviderActionJournalRefV1,
  parseSha256Digest,
  parseTimestamp,
  type OperatorActionCommitRequest,
  type OperatorActionIntent,
  type OperatorActionPreview,
  type OperatorActionPreviewRequest,
  type OperatorActionReconcileRequest,
  type OperatorCapabilityCredential,
  type OperatorDetailReadRequest,
  type OperatorViewPageRequest,
  type ProjectDiscoveryRequest,
  type ProjectionEventsRequest,
  type ProjectionPageRequest,
  type ProjectionSnapshotRequest,
  type ScopedGate,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/core/migrations.ts";
import {
  OperatorActionStore,
  type OperatorActionCurrentState,
  type OperatorActionEffectPort,
  type OperatorEffectRequest,
  type OperatorEffectOutcome,
  type OperatorActionStatePort,
  type OperatorLaunchCustodyPort,
  type OperatorLifecycleRecoveryCustodyPort,
} from "../../src/operator/action-store.ts";
import { OperatorProjectionStore } from "../../src/operator/projection-store.ts";
import { OperatorStore } from "../../src/operator/store.ts";
import { ScopedGateStore } from "../../src/gates/store.ts";
import type { AuthenticatedOperatorContext } from "../../src/project-session/contracts.ts";

const databases: Database.Database[] = [];
const digest = `sha256:${"a".repeat(64)}`;
const now = Date.parse("2027-01-01T00:00:00Z");

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
  applyMigrations(database);
  database.exec(`
    INSERT INTO projects(project_id, canonical_root, trust_record_digest, revision, authority_generation, created_at, updated_at)
    VALUES ('project_01', '/project/one', '${digest}', 3, 1, ${now - 10_000}, ${now - 1_000});
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
      authority_ref, budget_ref, dependency_revision, topology_slot, project_run_directory_basis
    ) VALUES (
      'run_01', 'chair_01', '/project/one', '.agent-run/AFAB-001', ${now - 8_000},
      'session_01', 'active', 4, 1, 'chair:run_01:1', '${digest}', 'budget_01', 1, 1, 'project-relative'
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
    INSERT INTO artifacts(
      artifact_id,project_id,project_session_id,run_id,task_id,publisher_kind,
      publisher_ref,publisher_agent_id,source_kind,evidence_kind,relative_path,
      sha256,registry_state,quarantine_reason,revision,created_at
    ) VALUES (
      'artifact_01','project_01','session_01','run_01','task_01','agent',
      'chair_01','chair_01','run-file','artifact','reports/result.md',
      '${digest}','active',NULL,1,${now - 500}
    );
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
    actions: ["read", "decide", "pause", "resume", "cancel", "steer", "drain", "stop", "git", "agent-lifecycle-recovery-issue", "external-effect"],
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

function createProjectedGate(
  fixture: ReturnType<typeof setupProjection>,
  suffix: string,
  question: string,
) {
  const store = new ScopedGateStore({
    database: fixture.database,
    operatorStore: fixture.operatorStore,
    clock: () => now,
  });
  const commandId = `create_projected_gate_${suffix}`;
  const gate = store.createGate(fixture.context, {
    origin: "operator",
    command: {
      credential: fixture.credential,
      commandId,
      expectedRevision: 1,
      actor: "operator_01",
      provenance: {
        kind: "console-direct-input",
        clientId: "console_projection",
        inputEventId: `${commandId}:input`,
      },
      evidenceRefs: [],
    },
    intent: {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      dedupeKey: `projection-gate:${suffix}`,
      scope: { kind: "run" },
      blockedOperationIds: ["fabric.v1.provider-action.dispatch"],
      enforcementPoints: ["operation"],
      question,
      reason: "Review required.",
      options: ["approve", "request changes", "defer"],
      recommendation: "defer",
      consequences: ["The run remains blocked."],
      evidenceRefs: [],
    },
  } as never);
  return { gate, store };
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
    const snapshot = fixture.projections.snapshot(snapshotRequest, "include");
    const globalRevision = fixture.database.prepare(
      "SELECT revision FROM daemon_global_state WHERE singleton=1",
    ).get() as { revision: number };

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      snapshotRevision: globalRevision.revision,
      project: { freshness: "live", revision: 3 },
      session: { freshness: "live", value: { projectSessionId: "session_01", revision: 2 } },
      runs: {
        freshness: "live",
        value: [{
          projectSessionId: "session_01",
          runId: "run_01",
          chairAgentId: "chair_01",
        }],
      },
      attention: { freshness: "live", value: [{ itemId: "attention_01", revision: 2 }] },
      cursor: 1,
    });
    expect(snapshot.readTransactionId).toMatch(/^projection:/u);
    expect(snapshot.stateDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);

    const runPage = fixture.projections.viewPage({
      credential: fixture.credential,
      projectId,
      view: "runs",
      snapshotRevision: snapshot.snapshotRevision,
      cursor: 0,
      limit: 10,
    }, "include");
    expect(runPage).toMatchObject({
      status: "page",
      rows: [{
        fact: {
          value: {
            summary: { kind: "run", projectSessionId: "session_01" },
            detailRef: {
              kind: "run",
              projectSessionId: "session_01",
              coordinationRunId: "run_01",
            },
          },
        },
      }],
    });
    if (runPage.status !== "page") throw new Error("run page unavailable");
    const detailRef = runPage.rows[0]?.fact.freshness === "live"
      ? runPage.rows[0].fact.value.detailRef
      : undefined;
    if (detailRef?.kind !== "run") throw new Error("run detail reference unavailable");
    expect(fixture.projections.detail({
      credential: fixture.credential,
      projectId,
      snapshotRevision: snapshot.snapshotRevision,
      detailRef,
    })).toMatchObject({
      status: "current",
      detailRef: { kind: "run", projectSessionId: "session_01" },
      detail: {
        value: { kind: "run", projectSessionId: "session_01" },
      },
    });
  });

  it("projects persisted Herdr presence without treating pane identity as Fabric authority", () => {
    const fixture = setupProjection();
    fixture.database.prepare(`
      INSERT INTO integration_availability(
        integration_id, state, discovered_contract_json, checked_at
      ) VALUES ('herdr-control-v1', 'available', ?, ?)
    `).run(JSON.stringify({
      schemaVersion: 1,
      generation: 3,
      operationFamily: "herdr-control-v1",
      detail: "Herdr control and presence available",
      degradedRunIds: [],
      presence: [{
        projectId: "project_01",
        projectSessionId: "session_01",
        coordinationRunId: "run_01",
        agentId: "chair_01",
        state: "available",
        paneRef: "w3:p4",
        readiness: "identity-unverified",
        observedAt: now - 50,
      }],
    }), now - 50);
    const projectId = identifier<"ProjectId">("project_01");
    const projectSessionId = identifier<"ProjectSessionId">("session_01");
    const page = fixture.projections.page({
      credential: fixture.credential,
      projectId,
      projectSessionId,
      view: "agents",
      after: 0,
      limit: 10,
    }, "include");
    expect(page).toMatchObject({
      view: "agents",
      page: {
        freshness: "live",
        value: {
          items: [{
            agentId: "chair_01",
            visibility: {
              freshness: "snapshot",
              source: "herdr",
              revision: 3,
              observedAt: new Date(now - 50).toISOString(),
              value: { paneRef: "w3:p4" },
            },
          }],
        },
      },
    });
    expect(fixture.database.prepare(`
      SELECT lifecycle FROM agents WHERE run_id='run_01' AND agent_id='chair_01'
    `).get()).toEqual({ lifecycle: "ready" });
  });

  it("keeps agent projection operable when the optional Herdr contract is malformed", () => {
    const fixture = setupProjection();
    fixture.database.prepare(`
      INSERT INTO integration_availability(
        integration_id, state, discovered_contract_json, checked_at
      ) VALUES ('herdr-control-v1', 'available', '{', ?)
    `).run(now - 50);
    const page = fixture.projections.page({
      credential: fixture.credential,
      projectId: identifier<"ProjectId">("project_01"),
      projectSessionId: identifier<"ProjectSessionId">("session_01"),
      view: "agents",
      after: 0,
      limit: 10,
    }, "include");
    expect(page).toMatchObject({
      page: {
        freshness: "live",
        value: {
          items: [{
            agentId: "chair_01",
            visibility: {
              freshness: "unavailable",
              source: "herdr",
              reason: "malformed-presence-contract",
            },
          }],
        },
      },
    });
  });

  it("pages v2 attention rows at one snapshot and resolves an exact revision-bound detail", () => {
    const fixture = setupProjection();
    const { gate } = createProjectedGate(fixture, "positive", "Approve result?");
    const attention = fixture.database.prepare(`
      SELECT item_id FROM attention_items
       WHERE json_extract(payload_json, '$.gateId')=?
    `).get(gate.gateId) as { item_id: string };
    const projectId = identifier<"ProjectId">("project_01");
    const projectSessionId = identifier<"ProjectSessionId">("session_01");
    const snapshot = fixture.projections.snapshot({
      credential: fixture.credential,
      projectId,
      projectSessionId,
    }, "include");
    const pageRequest: OperatorViewPageRequest<"attention"> = {
      credential: fixture.credential,
      projectId,
      projectSessionId,
      view: "attention",
      snapshotRevision: snapshot.snapshotRevision,
      cursor: 0,
      limit: 1,
    };
    const page = fixture.projections.viewPage(pageRequest, "include");

    expect(page).toMatchObject({
      status: "page",
      view: "attention",
      rows: [{
        itemId: attention.item_id,
        itemRevision: 1,
        fact: {
          freshness: "live",
          source: "fabric",
          value: {
            summary: {
              kind: "attention",
              label: "Decision",
              priority: "critical-path",
              title: "Approve result?",
              gateBinding: {
                gateId: gate.gateId,
                gateRevision: 1,
                coordinationRunId: "run_01",
              },
            },
            detailRef: { kind: "run", coordinationRunId: "run_01", expectedRevision: 4 },
            actionAvailability: { state: "available", requiresPreview: true },
          },
        },
      }],
      nextCursor: 1,
      hasMore: true,
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
    expect(fixture.projections.viewPage(pageRequest, "include")).toMatchObject({
      status: "resnapshot-required",
      view: "attention",
      reason: "snapshot-mismatch",
    });
  });

  it("projects only exact active, paused and terminal run-control actions and invalidates stale pages", () => {
    const fixture = setupProjection();
    const projectId = identifier<"ProjectId">("project_01");
    const projectSessionId = identifier<"ProjectSessionId">("session_01");
    const snapshotRevision = () => fixture.projections.snapshot(
      { credential: fixture.credential, projectId, projectSessionId },
      "include",
    ).snapshotRevision;
    const request: OperatorViewPageRequest<"runs"> = {
      credential: fixture.credential,
      projectId,
      projectSessionId,
      view: "runs",
      snapshotRevision: snapshotRevision(),
      cursor: 0,
      limit: 1,
    };
    const controlActions = () => {
      const page = fixture.projections.viewPage(request, "include");
      if (page.status !== "page" || page.rows[0]?.fact.freshness !== "live") {
        throw new Error("expected one live run row");
      }
      const availability = page.rows[0].fact.value.actionAvailability;
      if (availability.state !== "available") return [];
      return availability.actions.filter(
        (action) => action === "pause" || action === "resume" || action === "cancel" || action === "steer",
      );
    };
    const nonControlActions = () => {
      const page = fixture.projections.viewPage(request, "include");
      if (page.status !== "page" || page.rows[0]?.fact.freshness !== "live") {
        throw new Error("expected one live run row");
      }
      const availability = page.rows[0].fact.value.actionAvailability;
      if (availability.state !== "available") return [];
      return availability.actions.filter(
        (action) => action !== "pause" && action !== "resume" && action !== "cancel" && action !== "steer",
      );
    };

    expect(controlActions()).toStrictEqual(["pause", "cancel"]);
    expect(nonControlActions()).toEqual(expect.arrayContaining([
      "project-session-drain",
      "project-session-stop",
      "git",
      "registered-external-effect",
      "promotion",
    ]));
    fixture.database.prepare(`
      INSERT INTO operator_control_fences(
        fence_id, project_session_id, coordination_run_id, task_id, scope_kind,
        target_revision, session_generation, command_id, state, created_at, released_at
      ) VALUES (
        'fence_projection_run', 'session_01', 'run_01', 'task_01', 'run',
        4, 1, 'pause_projection_run', 'paused', ?, NULL
      )
    `).run(now);
    expect(fixture.projections.viewPage(request, "include")).toMatchObject({
      status: "resnapshot-required",
      reason: "snapshot-mismatch",
    });
    request.snapshotRevision = snapshotRevision();
    expect(controlActions()).toStrictEqual(["resume", "cancel"]);
    expect(nonControlActions()).toEqual(expect.arrayContaining(["git", "promotion"]));

    fixture.database.prepare(`
      UPDATE operator_control_fences SET state='released', released_at=?
       WHERE fence_id='fence_projection_run'
    `).run(now + 1);
    fixture.database.prepare(`
      UPDATE tasks SET state='complete', revision=revision+1
       WHERE run_id='run_01' AND task_id='task_01'
    `).run();
    request.snapshotRevision = snapshotRevision();
    expect(controlActions()).toStrictEqual([]);
    expect(nonControlActions()).toEqual(expect.arrayContaining(["git", "promotion"]));
  });

  it("omits Attention gate actions when the persisted gate is closed or outside the item run", () => {
    const fixture = setupProjection();
    const first = createProjectedGate(fixture, "negative", "Proceed?");
    const projectId = identifier<"ProjectId">("project_01");
    const projectSessionId = identifier<"ProjectSessionId">("session_01");
    const snapshot = fixture.projections.snapshot({ credential: fixture.credential, projectId, projectSessionId }, "include");
    const request: OperatorViewPageRequest<"attention"> = {
      credential: fixture.credential,
      projectId,
      projectSessionId,
      view: "attention",
      snapshotRevision: snapshot.snapshotRevision,
      cursor: 0,
      limit: 1,
    };
    const summary = () => {
      const page = fixture.projections.viewPage(request, "include");
      if (page.status !== "page" || page.rows[0]?.fact.freshness !== "live") {
        throw new Error("expected a live Attention row");
      }
      return page.rows[0].fact.value.summary;
    };

    expect(summary()).toHaveProperty("gateBinding.gateId", first.gate.gateId);
    const resolveCommandId = "resolve_projected_gate_negative";
    first.store.resolveGate(fixture.context, {
      command: {
        credential: fixture.credential,
        commandId: resolveCommandId,
        expectedRevision: first.gate.revision,
        actor: "operator_01",
        provenance: {
          kind: "console-direct-input",
          clientId: "console_projection",
          inputEventId: `${resolveCommandId}:input`,
        },
        evidenceRefs: [],
      },
      gateId: first.gate.gateId,
      status: "rejected",
      decisionEvidence: { kind: "typed-console", confirmationCommandId: resolveCommandId },
    } as never);
    request.snapshotRevision = fixture.projections.snapshot(
      { credential: fixture.credential, projectId, projectSessionId },
      "include",
    ).snapshotRevision;
    expect(summary()).not.toHaveProperty("gateBinding");

    const second = createProjectedGate(fixture, "wrong-run", "Proceed elsewhere?");
    fixture.database.prepare(`
      UPDATE attention_items SET coordination_run_id=NULL
       WHERE json_extract(payload_json, '$.gateId')=?
    `).run(second.gate.gateId);
    request.snapshotRevision = fixture.projections.snapshot(
      { credential: fixture.credential, projectId, projectSessionId },
      "include",
    ).snapshotRevision;
    expect(summary()).not.toHaveProperty("gateBinding");
  });

  it.each([
    ["pending", "available", 2, "available"],
    ["claimed", "available", 2, "available"],
    ["sent", "available", 2, "available"],
    ["deduplicated", "available", 2, "available"],
    ["failed", "available", 2, "unavailable"],
    ["ambiguous", "available", 2, "stale"],
    ["pending", "unavailable", 2, "unavailable"],
    ["pending", "stale", 2, "stale"],
    ["sent", "available", 1, "stale"],
    ["missing", "available", null, "unavailable"],
    ["missing", "absent", null, "unavailable"],
  ] as const)(
    "projects native delivery %s with %s integration at revision %s as %s without mutating authority",
    (journalState, integrationState, deliveryItemRevision, expectedStatus) => {
      const fixture = setupProjection();
      if (integrationState !== "absent") {
        fixture.database.prepare(`
          INSERT INTO integration_availability(integration_id, state, discovered_contract_json, checked_at)
          VALUES ('native-desktop', ?, '{}', ?)
        `).run(integrationState, now - 150);
      }
      if (journalState !== "missing" && deliveryItemRevision !== null) {
        fixture.database.prepare(`
          INSERT INTO notification_deliveries(
            notification_id, item_id, item_revision, target_integration, dedupe_key,
            state, claim_generation, claim_deadline, effect_identity_hash, updated_at
          ) VALUES ('notification_native_01', 'attention_01', ?, 'native-desktop',
                    'notification:native:01', ?, 3, NULL, NULL, ?)
        `).run(deliveryItemRevision, journalState, now - 100);
      }
      const before = fixture.database.prepare(`
        SELECT item_id, revision, state FROM attention_items
        UNION ALL
        SELECT notification_id, item_revision, state FROM notification_deliveries
        ORDER BY 1
      `).all();
      const projectId = identifier<"ProjectId">("project_01");
      const projectSessionId = identifier<"ProjectSessionId">("session_01");
      const snapshot = fixture.projections.snapshot({
        credential: fixture.credential,
        projectId,
        projectSessionId,
      }, "include");
      const page = fixture.projections.viewPage({
        credential: fixture.credential,
        projectId,
        projectSessionId,
        view: "attention",
        snapshotRevision: snapshot.snapshotRevision,
        cursor: 0,
        limit: 10,
      }, "include");
      const expectedNotification = {
        targetIntegration: "native-desktop",
        status: expectedStatus,
        journalState,
        deliveryItemRevision,
        claimGeneration: journalState === "missing" ? null : 3,
        integrationState,
        observedAt: new Date(
          journalState !== "missing" ? now - 100 : integrationState !== "absent" ? now - 150 : now - 400,
        ).toISOString(),
      };

      expect(page).toMatchObject({
        status: "page",
        rows: [{
          itemId: "attention_01",
          itemRevision: 2,
          fact: {
            value: {
              summary: {
                nativeNotification: expectedNotification,
              },
              actionAvailability: { state: "available", requiresPreview: true },
            },
          },
        }],
      });
      expect(snapshot.attention).toMatchObject({
        freshness: "live",
        value: [{ itemId: "attention_01", nativeNotification: expectedNotification }],
      });
      expect(fixture.database.prepare(`
        SELECT item_id, revision, state FROM attention_items
        UNION ALL
        SELECT notification_id, item_revision, state FROM notification_deliveries
        ORDER BY 1
      `).all()).toEqual(before);
    },
  );

  it("projects native notification fields only when the caller explicitly includes them", () => {
    const fixture = setupProjection();
    const request = {
      credential: fixture.credential,
      projectId: identifier<"ProjectId">("project_01"),
      projectSessionId: identifier<"ProjectSessionId">("session_01"),
    };

    const extendedSnapshot = fixture.projections.snapshot(request, "include");
    const legacySnapshot = fixture.projections.snapshot(request, "omit");
    if (extendedSnapshot.attention.freshness !== "live" || legacySnapshot.attention.freshness !== "live") {
      throw new Error("expected live attention projections");
    }
    expect(extendedSnapshot.attention.value[0]).toHaveProperty("nativeNotification");
    expect(legacySnapshot.attention.value[0]).not.toHaveProperty("nativeNotification");

    const pageRequest: OperatorViewPageRequest<"attention"> = {
      ...request,
      view: "attention",
      snapshotRevision: extendedSnapshot.snapshotRevision,
      cursor: 0,
      limit: 10,
    };
    const extendedPage = fixture.projections.viewPage(pageRequest, "include");
    const legacyPage = fixture.projections.viewPage(pageRequest, "omit");
    if (extendedPage.status !== "page" || legacyPage.status !== "page") {
      throw new Error("expected current attention pages");
    }
    expect(extendedPage.rows[0]?.fact).toMatchObject({
      freshness: "live",
      value: { summary: { nativeNotification: expect.any(Object) } },
    });
    expect(legacyPage.rows[0]?.fact).not.toHaveProperty("value.summary.nativeNotification");

    const projectionPageRequest: ProjectionPageRequest<"attention"> = {
      ...request,
      view: "attention",
      after: 0,
      limit: 10,
    };
    const extendedProjectionPage = fixture.projections.page(projectionPageRequest, "include");
    const legacyProjectionPage = fixture.projections.page(projectionPageRequest, "omit");
    if (extendedProjectionPage.page.freshness !== "live" || legacyProjectionPage.page.freshness !== "live") {
      throw new Error("expected live v1 attention pages");
    }
    expect(extendedProjectionPage.page.value.items[0]).toHaveProperty("nativeNotification");
    expect(legacyProjectionPage.page.value.items[0]).not.toHaveProperty("nativeNotification");
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
    const agentCapability = `afc_${"x".repeat(43)}`;
    const operatorCapability = `afop_${"y".repeat(43)}`;
    const credential = "password=message-secret-value";
    fixture.database.prepare("UPDATE messages SET body=? WHERE message_id='message_01'")
      .run(`line 1\u001b[31m ${capability} ${agentCapability} ${operatorCapability} ${credential}\nline 2`);
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
    expect(body.body).not.toContain(agentCapability);
    expect(body.body).not.toContain(operatorCapability);
    expect(body.body).not.toContain("message-secret-value");
    expect(body.body).not.toMatch(/\b(?:afb_|afc_|afop_)/u);
    expect(body.body).toContain("█");

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
    }, "include");
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
      }, "include");
      if (page.status !== "page") throw new Error(`expected ${view} page`);
      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]).toMatchObject({ itemId: expectedItemId });
      const fact = page.rows[0]?.fact;
      if (fact?.freshness !== "live") throw new Error(`expected live ${view} row`);
      if (view === "activity") {
        expect(fact.value.summary).toMatchObject({
          activityKind: "message",
          messageBodyRef: {
            projectSessionId,
            messageId: "message_01",
            expectedRevision: 1,
          },
        });
      }
      const detail = fixture.projections.detail({
        credential: fixture.credential,
        projectId,
        projectSessionId,
        snapshotRevision: snapshot.snapshotRevision,
        detailRef: fact.value.detailRef,
      });
      expect(detail).toMatchObject({ status: "current", detailRef: fact.value.detailRef });
      if (view === "activity") {
        expect(detail).toMatchObject({
          detail: {
            value: {
              activityKind: "message",
              messageBodyRef: {
                projectSessionId,
                messageId: "message_01",
                expectedRevision: 1,
              },
            },
          },
        });
      }
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

    const snapshot = fixture.projections.snapshot({ credential: fixture.credential, projectId }, "include");
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
    let dispatchedRequest: OperatorEffectRequest | null = null;
    const effectPort: OperatorActionEffectPort = {
      dispatch: async (request) => {
        dispatches += 1;
        dispatchedRequest = request;
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
    expect(dispatchedRequest).toMatchObject({
      operatorInputRecordDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
    expect((dispatchedRequest as OperatorEffectRequest | null)?.operatorInputRecordDigest).not.toBe(preview.intentDigest);
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
    const gitRepository = {
      repositoryRoot: "/project/one",
      worktreePath: "/project/one/.worktrees/operator",
      gitCommonDir: "/project/one/.git",
      commonDirectoryIdentityDigest: sha,
      repositoryStateDigest: sha,
      headDigest: sha,
      indexDigest: sha,
      worktreeDigest: sha,
      remoteStateDigest: sha,
      configDigest: sha,
      worktreeRegistryDigest: sha,
    };
    const gitProfile = {
      profileId: "sealed-git-v1",
      revision: 1,
      digest: sha,
      gitBinaryDigest: sha,
      objectFormat: "sha1" as const,
    };
    const gitGrant = {
      grantId: "grant_01",
      revision: 1,
      projectId: identifier<"ProjectId">("project_01"),
      projectSessionId,
      sessionGeneration: 1,
      issuingSessionRevision: 2,
      coordinationRunId,
      issuingRunRevision: 4,
      issuingDependencyRevision: 1,
      authorityRef: sha,
      authorityRevision: 1,
      gitAllowlistEpoch: 1,
      gitAllowlistDigest: sha,
      repositoryRoot: gitRepository.repositoryRoot,
      worktreePath: gitRepository.worktreePath,
      executionProfileId: gitProfile.profileId,
      executionProfileRevision: gitProfile.revision,
      executionProfileDigest: gitProfile.digest,
      constraints: {
        operationVariants: ["stage" as const],
        remoteBindings: [],
        refs: [],
        pathPrefixes: ["src"],
        allowWorktreeCreation: false,
      },
      sourceAuthority: { kind: "operator-command" as const, digest: sha },
      expiresAt: identifierTimestamp("2027-01-01T01:00:00Z"),
      grantDigest: sha,
    };

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
        authorisation: {
          projectId: identifier<"ProjectId">("project_01"),
          projectSessionId,
          expectedSessionRevision: 2,
          expectedSessionGeneration: 1,
          coordinationRunId,
          expectedRunRevision: 4,
          expectedDependencyRevision: 1,
          authorityRef: sha,
          expectedAuthorityRevision: 1,
          expectedGitAllowlistEpoch: 1,
          gitAllowlistDigest: sha,
          repositoryRoot: gitRepository.repositoryRoot,
          worktreePath: gitRepository.worktreePath,
          repositoryStateDigest: sha,
          executionProfileId: gitProfile.profileId,
          executionProfileRevision: gitProfile.revision,
          executionProfileDigest: gitProfile.digest,
          operationVariant: "stage",
          remoteBinding: null,
          resultRecipeDigest: sha,
          operationId: "git_operation_01",
          effectBindingDigest: sha,
          decision: { kind: "preauthorised", grantId: "grant_01", expectedGrantRevision: 1, grantDigest: sha },
        },
        repository: gitRepository,
        executionProfile: gitProfile,
        operation: { variant: "stage", paths: ["src/operator/action-store.ts"] },
        resultRecipe: {
          schemaVersion: 1,
          executionProfileDigest: sha,
          resultRecipeDigest: sha,
          beforeRepositoryStateDigest: sha,
          expectedSuccessRepositoryStateDigest: sha,
          expectedConflict: null,
          refUpdates: [],
          configUpdates: [],
          commitMappings: [],
          affectedPaths: [{ path: "src/operator/action-store.ts", beforeDigest: null, afterDigest: sha }],
          bounds: { maximumRefOrConfigUpdates: 64, maximumCommitMappings: 128, maximumConflictPaths: 4096 },
        },
      },
      {
        kind: "git",
        revision: 6,
        state: {
          revision: 6,
          projectId: identifier<"ProjectId">("project_01"),
          projectSessionId,
          sessionRevision: 2,
          sessionGeneration: 1,
          coordinationRunId,
          runRevision: 4,
          dependencyRevision: 1,
          authorityRef: sha,
          authorityRevision: 1,
          gitAllowlistEpoch: 1,
          gitAllowlistDigest: sha,
          repository: gitRepository,
          executionProfile: gitProfile,
          remoteBinding: null,
          grant: gitGrant,
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
    const intent: Extract<OperatorActionIntent, { kind: "project-session-launch" }> = {
      kind: "project-session-launch",
      projectId,
      projectSessionId,
      expectedProjectRevision: 3,
      expectedSessionRevision: 1,
      expectedSessionGeneration: 1,
      trustRecordDigest: authorityRef,
      launchPacketRef,
      authorityRef,
      budgetRef: "budget_01",
      resourcePlanRef,
      providerAdapterId: "claude-agent-sdk",
      providerActionId,
      providerContractDigest: authorityRef,
      resourceStateDigest: authorityRef,
    };
    let current: OperatorActionCurrentState = {
      kind: "project-session-launch",
      revision: 1,
      state: {
        schemaVersion: 1,
        projectId,
        projectRevision: 3,
        projectSessionId,
        sessionRevision: 1,
        sessionGeneration: 1,
        currentLaunchPacketRef: launchPacketRef,
        trustRecordDigest: authorityRef,
        providerAdapterId: "claude-agent-sdk",
        providerContractDigest: authorityRef,
        resourceStateDigest: authorityRef,
        sessionState: "awaiting_launch",
        provedFailedAttempt: null,
      },
    };
    let launchTerminal = false;
    const launchCustody: OperatorLaunchCustodyPort = {
      readCurrentState: async () => {
        if (current.kind !== "project-session-launch") throw new Error("launch state changed family");
        return current.state;
      },
      inspect: async () => ({} as never),
      preflightLaunch: () => ({} as never),
      prepareInTransaction: () => ({
        schemaVersion: 1,
        providerAdapterId: "claude-agent-sdk",
        providerActionId: "provider_action_launch_01",
        providerContractDigest: authorityRef,
        publicPayload: {},
        capability: "volatile-chair-capability",
        socketPath: "/private/fabric.sock",
        attestationChallenge: "ab".repeat(32),
        attestationChallengeDigest: authorityRef,
        expectedPrincipal: {
          agentId: "chair",
          projectSessionId,
          runId: "run_launch_01",
          principalGeneration: 1,
        },
      }),
      dispatchPrepared: async () => {
        launchTerminal = true;
        return {};
      },
      launchProviderActionJournalRefForCommand: () => parseLaunchProviderActionJournalRefV1({
        schemaVersion: 1,
        projectSessionId,
        coordinationRunId: "run_launch_01",
        actionRef: {
          adapterId: "claude-agent-sdk",
          actionId: providerActionId,
        },
        providerContractDigest: authorityRef,
        custodyAttemptGeneration: 1,
        journalRevision: launchTerminal ? 2 : 1,
        journalState: launchTerminal ? "terminal" : "prepared",
        outcomeKind: launchTerminal ? "terminal-success" : null,
        outcomeDigest: launchTerminal ? authorityRef : null,
      }),
    };
    const actions = new OperatorActionStore({
      database: fixture.database,
      operatorStore: fixture.operatorStore,
      statePort: { read: async () => current },
      effectPort: {
        dispatch: async () => { throw new Error("generic effect port must not own launch"); },
        observe: async () => { throw new Error("not expected"); },
      },
      launchCustody,
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

    await expect(actions.reconcile(fixture.context, {
      command: {
        ...request.command,
        commandId: identifier<"CommandId">("reconcile_launch_public_01"),
        provenance: {
          kind: "console-direct-input",
          clientId: identifier<"OperatorClientId">("console_launch_01"),
          inputEventId: "input_reconcile_launch_public_01",
        },
      },
      projectId,
      targetCommandId: receipt.commandId,
      expectedStatus: "pending",
      expectedAttemptGeneration: 1,
      mode: "observe-only",
    } as OperatorActionReconcileRequest)).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });

    current = {
      ...current,
      state: { ...current.state, providerAdapterId: "changed-adapter" },
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
      state: { ...current.state, projectSessionId: foreignSessionId },
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

describe("operator lifecycle recovery action store", () => {
  it("previews one exact lifecycle recovery without preparing or dispatching it", async () => {
    const fixture = setupProjection();
    const intent = lifecycleRecoveryIntent();
    const recoveryDigest = parseSha256Digest(digest, "test.lifecycleRecoveryDigest");
    let reads = 0;
    let inspections = 0;
    let preparations = 0;
    let dispatches = 0;
    const statusPairs: string[][] = [];
    const reconcilePairs: string[][] = [];
    const lifecycleRecoveryCustody: OperatorLifecycleRecoveryCustodyPort = {
      readLifecycleRecoveryCurrentState: async () => {
        reads += 1;
        return lifecycleRecoveryCurrentState(intent);
      },
      inspectLifecycleRecovery: async () => {
        inspections += 1;
        return { intent, inspectionDigest: recoveryDigest };
      },
      prepareLifecycleFreshRotateInTransaction: () => {
        preparations += 1;
        return {
          status: "pending", recoveryId: "recovery_01", path: "fresh-rotate", evidenceDigest: recoveryDigest,
        };
      },
      prepareLifecycleAbandonInTransaction: () => {
        throw new Error("not expected");
      },
      lifecycleRecoveryStatus: (operatorId: string, commandId: string) => {
        statusPairs.push([operatorId, commandId]);
        return {
          status: "pending" as const,
          recoveryId: "recovery_01",
          path: "fresh-rotate" as const,
          evidenceDigest: recoveryDigest,
        };
      },
      reconcileLifecycleRecovery: async (operatorId: string, commandId: string) => {
        reconcilePairs.push([operatorId, commandId]);
        return {
          status: "committed" as const,
          recoveryId: "recovery_01",
          path: "fresh-rotate" as const,
          evidenceDigest: recoveryDigest,
        };
      },
    };
    const actions = new OperatorActionStore({
      database: fixture.database,
      operatorStore: fixture.operatorStore,
      statePort: { read: async () => { throw new Error("generic state port not expected"); } },
      effectPort: {
        dispatch: async () => {
          dispatches += 1;
          throw new Error("provider dispatch not expected");
        },
        observe: async () => { throw new Error("provider observe not expected"); },
      },
      lifecycleRecoveryCustody,
      clock: () => now,
    });

    const preview = await actions.preview(fixture.context, lifecycleRecoveryPreviewRequest(fixture, intent));

    expect(preview).toMatchObject({
      intent,
      consequenceClass: "consequential",
      gateIds: ["recovery_gate_01"],
    });
    expect({ reads, preparations, dispatches }).toEqual({ reads: 1, preparations: 0, dispatches: 0 });

    const commitRequest: OperatorActionCommitRequest = {
      command: {
        ...lifecycleRecoveryPreviewRequest(fixture, intent).command,
        commandId: identifier<"CommandId">("commit_lifecycle_recovery_01"),
        provenance: {
          kind: "console-direct-input",
          clientId: identifier<"OperatorClientId">("console_01"),
          inputEventId: "input_commit_lifecycle_recovery_01",
        },
      },
      projectId: identifier<"ProjectId">("project_01"),
      previewId: preview.previewId,
      expectedPreviewRevision: preview.previewRevision,
      previewDigest: preview.previewDigest,
      expectedIntentDigest: preview.intentDigest,
      confirmation: { kind: "explicit", confirmationId: "confirm_lifecycle_recovery_01" },
    };
    const receipt = await actions.commit(fixture.context, commitRequest);
    expect(await actions.commit(fixture.context, commitRequest)).toEqual(receipt);
    expect({ reads, inspections, preparations, dispatches }).toEqual({
      reads: 2,
      inspections: 1,
      preparations: 1,
      dispatches: 0,
    });
    await expect(actions.commit(fixture.context, {
      ...commitRequest,
      confirmation: { kind: "explicit", confirmationId: "changed-confirmation" },
    })).rejects.toMatchObject({ code: "DEDUPE_CONFLICT" });

    expect(actions.status({
      credential: fixture.credential,
      projectId: identifier<"ProjectId">("project_01"),
      commandId: receipt.commandId,
    })).toMatchObject({ status: "pending", commandId: receipt.commandId });
    expect(statusPairs).toEqual([["operator_01", "commit_lifecycle_recovery_01"]]);

    const reconciled = await actions.reconcile(fixture.context, {
      command: {
        ...commitRequest.command,
        commandId: identifier<"CommandId">("reconcile_lifecycle_recovery_01"),
        provenance: {
          kind: "console-direct-input",
          clientId: identifier<"OperatorClientId">("console_01"),
          inputEventId: "input_reconcile_lifecycle_recovery_01",
        },
      },
      projectId: commitRequest.projectId,
      targetCommandId: receipt.commandId,
      expectedStatus: "pending",
      expectedAttemptGeneration: 1,
      mode: "observe-only",
    });
    expect(reconciled).toMatchObject({ status: "committed", commandId: receipt.commandId });
    expect(reconcilePairs).toEqual([["operator_01", "commit_lifecycle_recovery_01"]]);
  });

  it("fails closed before generic state or effect ports when lifecycle recovery custody is missing", async () => {
    const fixture = setupProjection();
    const intent = lifecycleRecoveryIntent();
    let genericReads = 0;
    const actions = new OperatorActionStore({
      database: fixture.database,
      operatorStore: fixture.operatorStore,
      statePort: {
        read: async () => {
          genericReads += 1;
          throw new Error("generic state port not expected");
        },
      },
      effectPort: {
        dispatch: async () => { throw new Error("generic effect port not expected"); },
        observe: async () => { throw new Error("generic effect port not expected"); },
      },
      clock: () => now,
    });

    await expect(actions.preview(
      fixture.context,
      lifecycleRecoveryPreviewRequest(fixture, intent),
    )).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    expect(genericReads).toBe(0);
  });

  it.each([
    ["session generation", (state: ReturnType<typeof lifecycleRecoveryCurrentState>) => ({
      ...state,
      sessionGeneration: state.sessionGeneration + 1,
    }), "STALE_GENERATION"],
    ["exact source", (state: ReturnType<typeof lifecycleRecoveryCurrentState>) => ({
      ...state,
      sourceRevision: state.sourceRevision + 1,
    }), "STALE_GENERATION"],
    ["gate", (state: ReturnType<typeof lifecycleRecoveryCurrentState>) => ({
      ...state,
      gate: { ...state.gate, revision: state.gate.revision + 1 },
    }), "GATE_BLOCKED"],
    ["recovery capability", (state: ReturnType<typeof lifecycleRecoveryCurrentState>) => ({
      ...state,
      recoveryCapability: state.recoveryCapability === null ? null : {
        ...state.recoveryCapability,
        revision: state.recoveryCapability.revision + 1,
      },
    }), "STALE_REVISION"],
    ["checkpoint", (state: ReturnType<typeof lifecycleRecoveryCurrentState>) => ({
      ...state,
      checkpoint: state.checkpoint === null ? null : { ...state.checkpoint, digest: `sha256:${"b".repeat(64)}` },
    }), "STALE_REVISION"],
  ] as const)("rejects a stale lifecycle recovery %s binding", async (_name, change, code) => {
    const fixture = setupProjection();
    const intent = lifecycleRecoveryIntent();
    const recoveryDigest = parseSha256Digest(digest, "test.lifecycleRecoveryValidationDigest");
    const lifecycleRecoveryCustody: OperatorLifecycleRecoveryCustodyPort = {
      readLifecycleRecoveryCurrentState: async () => change(lifecycleRecoveryCurrentState(intent)),
      inspectLifecycleRecovery: async () => ({ intent, inspectionDigest: recoveryDigest }),
      prepareLifecycleFreshRotateInTransaction: () => { throw new Error("not expected"); },
      prepareLifecycleAbandonInTransaction: () => { throw new Error("not expected"); },
      lifecycleRecoveryStatus: () => { throw new Error("not expected"); },
      reconcileLifecycleRecovery: async () => { throw new Error("not expected"); },
    };
    const actions = new OperatorActionStore({
      database: fixture.database,
      operatorStore: fixture.operatorStore,
      statePort: { read: async () => { throw new Error("not expected"); } },
      effectPort: {
        dispatch: async () => { throw new Error("not expected"); },
        observe: async () => { throw new Error("not expected"); },
      },
      lifecycleRecoveryCustody,
      clock: () => now,
    });

    await expect(actions.preview(
      fixture.context,
      lifecycleRecoveryPreviewRequest(fixture, intent),
    )).rejects.toMatchObject({ code });
  });

  it("commits confirmed abandonment through its preparation port without provider I/O", async () => {
    const fixture = setupProjection();
    const freshIntent = lifecycleRecoveryIntent();
    const {
      recoveryCapabilityId: _recoveryCapabilityId,
      expectedRecoveryCapabilityRevision: _expectedRecoveryCapabilityRevision,
      recoveryCapabilityHash: _recoveryCapabilityHash,
      replacementAdapterId: _replacementAdapterId,
      replacementContractDigest: _replacementContractDigest,
      replacementActionRef: _replacementActionRef,
      checkpointRef: _checkpointRef,
      checkpointDigest: _checkpointDigest,
      checkpointValidationReceiptDigest: _checkpointValidationReceiptDigest,
      ...common
    } = freshIntent;
    const intent: Extract<
      Extract<OperatorActionIntent, { kind: "agent-lifecycle-recovery" }>,
      { path: "abandon" }
    > = {
      ...common,
      path: "abandon",
      reason: "Human confirmed unrecoverable context.",
      directInputAttestationId: "direct_input_01",
      destructiveConfirmationDigest: digest,
    };
    let abandonPreparations = 0;
    let dispatches = 0;
    const recoveryDigest = parseSha256Digest(digest, "test.lifecycleAbandonDigest");
    const actions = new OperatorActionStore({
      database: fixture.database,
      operatorStore: fixture.operatorStore,
      statePort: { read: async () => { throw new Error("generic state port not expected"); } },
      effectPort: {
        dispatch: async () => {
          dispatches += 1;
          throw new Error("provider dispatch not expected");
        },
        observe: async () => { throw new Error("provider observe not expected"); },
      },
      lifecycleRecoveryCustody: {
        readLifecycleRecoveryCurrentState: async () => ({
          ...lifecycleRecoveryCurrentState(freshIntent),
          recoveryCapability: null,
          checkpoint: null,
        }),
        inspectLifecycleRecovery: async () => ({ intent, inspectionDigest: recoveryDigest }),
        prepareLifecycleFreshRotateInTransaction: () => { throw new Error("fresh rotate not expected"); },
        prepareLifecycleAbandonInTransaction: () => {
          abandonPreparations += 1;
          return {
            status: "committed",
            recoveryId: "abandon_01",
            path: "abandon",
            evidenceDigest: recoveryDigest,
          };
        },
        lifecycleRecoveryStatus: () => ({
          status: "committed",
          recoveryId: "abandon_01",
          path: "abandon",
          evidenceDigest: recoveryDigest,
        }),
        reconcileLifecycleRecovery: async () => ({
          status: "committed",
          recoveryId: "abandon_01",
          path: "abandon",
          evidenceDigest: recoveryDigest,
        }),
      },
      clock: () => now,
    });
    const previewRequest = lifecycleRecoveryPreviewRequest(fixture, intent);
    const preview = await actions.preview(fixture.context, previewRequest);
    expect(preview).toMatchObject({ consequenceClass: "destructive", gateIds: ["recovery_gate_01"] });

    const receipt = await actions.commit(fixture.context, {
      command: {
        ...previewRequest.command,
        commandId: identifier<"CommandId">("commit_lifecycle_abandon_01"),
        provenance: {
          kind: "console-direct-input",
          clientId: identifier<"OperatorClientId">("console_01"),
          inputEventId: "input_commit_lifecycle_abandon_01",
        },
      },
      projectId: previewRequest.projectId,
      previewId: preview.previewId,
      expectedPreviewRevision: preview.previewRevision,
      previewDigest: preview.previewDigest,
      expectedIntentDigest: preview.intentDigest,
      confirmation: { kind: "explicit", confirmationId: "confirm_lifecycle_abandon_01" },
    });
    expect(actions.status({
      credential: fixture.credential,
      projectId: previewRequest.projectId,
      commandId: receipt.commandId,
    })).toEqual({ status: "committed", commandId: receipt.commandId, receipt });
    expect({ abandonPreparations, dispatches }).toEqual({ abandonPreparations: 1, dispatches: 0 });
  });
});

function lifecycleRecoveryIntent(): Extract<
  Extract<OperatorActionIntent, { kind: "agent-lifecycle-recovery" }>,
  { path: "fresh-rotate" }
> {
  return {
    kind: "agent-lifecycle-recovery",
    schemaVersion: 1,
    path: "fresh-rotate",
    projectSessionId: "session_01",
    coordinationRunId: "run_01",
    agentId: "chair_01",
    source: {
      kind: "generation-loss",
      oldCustodyRef: null,
      generationLossRef: {
        schemaVersion: 1,
        runId: "run_01",
        agentId: "chair_01",
        generationLossId: "loss_01",
        generationLossRevision: 2,
      },
      lossKind: "generation-advance",
      oldProviderSessionRef: "provider_session_01",
      newProviderSessionRef: "provider_session_02",
      oldProviderGeneration: 2,
      newProviderGeneration: 3,
      oldContextRevision: 5,
      newContextRevision: 6,
      sourceBridgeRef: { bridgeId: "run_01:chair_01", bridgeRevision: 4 },
      sourceCapabilityHash: digest,
      checkpointState: "last-validated",
      checkpointRef: { checkpointId: "checkpoint_01", checkpointRevision: 7 },
      checkpointDigest: digest,
      lossEvidenceDigest: digest,
    },
    expectedSessionRevision: 2,
    expectedSessionGeneration: 1,
    expectedRunRevision: 4,
    expectedAgentRevision: 3,
    expectedSourceRevision: 2,
    expectedPrincipalGeneration: 1,
    expectedProviderGeneration: 3,
    expectedBridgeGeneration: 4,
    expectedContextRevision: 6,
    bridgeOwnerKind: "chair",
    expectedChairLeaseGeneration: 1,
    gateId: "recovery_gate_01",
    expectedGateRevision: 5,
    expectedGateStatus: "approved",
    recoveryCapabilityId: "recovery_capability_01",
    expectedRecoveryCapabilityRevision: 6,
    recoveryCapabilityHash: digest,
    replacementAdapterId: "replacement_adapter",
    replacementContractDigest: digest,
    replacementActionRef: { adapterId: "replacement_adapter", actionId: "replacement_action_01" },
    checkpointRef: { checkpointId: "checkpoint_01", checkpointRevision: 7 },
    checkpointDigest: digest,
    checkpointValidationReceiptDigest: null,
  };
}

function lifecycleRecoveryCurrentState(
  intent: ReturnType<typeof lifecycleRecoveryIntent>,
) {
  return {
    revision: intent.expectedAgentRevision,
    projectSessionId: intent.projectSessionId,
    coordinationRunId: intent.coordinationRunId,
    agentId: intent.agentId,
    sessionRevision: intent.expectedSessionRevision,
    sessionGeneration: intent.expectedSessionGeneration,
    runRevision: intent.expectedRunRevision,
    agentRevision: intent.expectedAgentRevision,
    source: intent.source,
    sourceRevision: intent.expectedSourceRevision,
    principalGeneration: intent.expectedPrincipalGeneration,
    providerGeneration: intent.expectedProviderGeneration,
    bridgeGeneration: intent.expectedBridgeGeneration,
    contextRevision: intent.expectedContextRevision,
    bridgeOwnerKind: intent.bridgeOwnerKind,
    chairLeaseGeneration: intent.expectedChairLeaseGeneration,
    gate: {
      gateId: intent.gateId,
      revision: intent.expectedGateRevision,
      status: intent.expectedGateStatus,
    },
    recoveryCapability: {
      capabilityId: intent.recoveryCapabilityId,
      revision: intent.expectedRecoveryCapabilityRevision,
      capabilityHash: intent.recoveryCapabilityHash,
    },
    checkpoint: {
      ref: intent.checkpointRef,
      digest: intent.checkpointDigest,
      validationReceiptDigest: intent.checkpointValidationReceiptDigest,
    },
  } as const;
}

function lifecycleRecoveryPreviewRequest(
  fixture: ReturnType<typeof setupProjection>,
  intent: Extract<OperatorActionIntent, { kind: "agent-lifecycle-recovery" }>,
): OperatorActionPreviewRequest {
  return {
    command: {
      credential: fixture.credential,
      commandId: identifier<"CommandId">("preview_lifecycle_recovery_01"),
      expectedRevision: intent.expectedAgentRevision,
      actor: identifier<"OperatorId">("operator_01"),
      provenance: {
        kind: "console-direct-input",
        clientId: identifier<"OperatorClientId">("console_01"),
        inputEventId: "input_preview_lifecycle_recovery_01",
      },
      evidenceRefs: [],
    },
    projectId: identifier<"ProjectId">("project_01"),
    intent,
  };
}

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

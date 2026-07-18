import type {
  AttentionItem,
  ArtifactRef,
  ConsoleView,
  JsonValue,
  MessageBodyRef,
  MessageBodyReadRequest,
  MessageBodyReadResult,
  NativeNotificationDeliverySummary,
  OperatorDetailReadRequest,
  OperatorDetailReadResult,
  OperatorDetail,
  OperatorDetailRef,
  OperatorProjectionSnapshot,
  OperatorViewRow,
  OperatorActionAvailability,
  OperatorAvailableAction,
  ProjectionFact,
  ProjectionPageRequest,
  ProjectionPageResult,
  ProjectionSnapshotRequest,
  ProjectionViewItemMap,
  ProjectId,
  ProjectSession,
  ProjectSessionDiscovery,
  ProjectSessionId,
  OperatorViewPageRequest,
  OperatorViewPageResult,
  OperatorViewSummaryMap,
  ProjectDiscoveryRequest,
  ProjectDiscoveryResult,
  ProjectionEventsRequest,
  ProjectionEventsResult,
  ProjectionEvent,
  DeclaredRunProgress,
  RunIdentity,
  RunProjection,
  RunWorkstreamIdentity,
  Timestamp,
} from "@local/agent-fabric-protocol";
import {
  parseIdentifier,
  parseArtifactRef,
  parseJsonValue,
  parseProjectSession,
  parseSha256Digest,
  parseTimestamp,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import { readStoredAuthority } from "../authority/stored-authority.js";
import { ProjectFabricCoreError, type CoreServiceOptions } from "../project-session/contracts.js";
import { digest, integer, isRow, nullableText, row, text, type Row } from "../project-session/store-support.js";
import type { AuthenticatedOperatorCredential, OperatorStore } from "./store.js";
import { renderSafeMessageBody } from "./message-safety.js";
import { HERDR_CONTROL_ADAPTER_ID } from "../integrations/herdr-fabric-ports.js";
import { readControlEligibility, type ResolvedControlTarget } from "./control-eligibility.js";

export type OperatorProjectionStoreOptions = CoreServiceOptions & {
  operatorStore: OperatorStore;
};

export type NativeNotificationProjection = "include" | "omit";
export type RunSessionProjection = "include" | "omit";
export type DeclaredRunProgressProjection = "include" | "omit";
export type RunIdentityProjection = "include" | "omit";

type LoadedOperatorDetail = {
  revision: number;
  observedAt: Timestamp;
  detail: OperatorDetail;
};

type ConcreteOperatorViewPageResult<View extends ConsoleView> =
  | {
      status: "page";
      view: View;
      rows: readonly OperatorViewRow<View>[];
      nextCursor: number;
      hasMore: boolean;
      snapshotRevision: number;
      readTransactionId: string;
    }
  | {
      status: "resnapshot-required";
      view: View;
      reason: "snapshot-mismatch";
      currentSnapshotRevision: number;
      snapshotCursor: number;
    };

export class OperatorProjectionStore {
  readonly #database: Database.Database;
  readonly #operatorStore: OperatorStore;
  readonly #clock: () => number;
  readonly #registryV1: boolean;

  constructor(options: OperatorProjectionStoreOptions) {
    this.#database = options.database;
    this.#operatorStore = options.operatorStore;
    this.#clock = options.clock ?? Date.now;
    this.#registryV1 = (this.#database.prepare("PRAGMA table_info(artifacts)").all() as Array<{ name?: unknown }>)
      .some(({ name }) => name === "project_id");
  }

  discover(request: ProjectDiscoveryRequest): ProjectDiscoveryResult {
    const authenticated = this.#authoriseRead(request.credential, request.projectId);
    const selectedSessionId = this.#selectedSessionId(authenticated, undefined);
    assertPageBounds(request.after, request.limit);
    const read = this.#database.transaction((): ProjectDiscoveryResult => {
      const project = this.#projectRow(request.projectId);
      const stored = this.#database.prepare(`
        SELECT project_session_id, mode, state, revision, generation, updated_at
          FROM project_sessions
         WHERE project_id=? AND (? IS NULL OR project_session_id=?)
         ORDER BY updated_at DESC, project_session_id
         LIMIT ? OFFSET ?
      `).all(
        request.projectId,
        selectedSessionId ?? null,
        selectedSessionId ?? null,
        request.limit + 1,
        request.after,
      );
      const hasMore = stored.length > request.limit;
      const selected = hasMore ? stored.slice(0, request.limit) : stored;
      const items = selected.map((value): ProjectSessionDiscovery => {
        const session = row(value, "project session discovery");
        const mode = text(session, "mode");
        if (mode !== "coordinated" && mode !== "independent") {
          throw new Error("stored project-session mode is invalid");
        }
        const parsed = this.#sessionFromRow(row(this.#database.prepare(`
          SELECT * FROM project_sessions WHERE project_session_id=? AND project_id=?
        `).get(text(session, "project_session_id"), request.projectId), "project session"));
        return {
          projectSessionId: parsed.projectSessionId,
          mode,
          state: parsed.state,
          revision: integer(session, "revision"),
          generation: integer(session, "generation"),
          lastEventAt: toTimestamp(integer(session, "updated_at"), "projectDiscovery.lastEventAt"),
        };
      });
      const observedAt = toTimestamp(integer(project, "updated_at"), "projectDiscovery.observedAt");
      const revision = integer(project, "revision");
      return {
        project: liveFact(revision, observedAt, {
          projectId: parseIdentifier<"ProjectId">(text(project, "project_id"), "project.projectId"),
          canonicalRoot: text(project, "canonical_root"),
        }),
        sessions: liveFact(revision, observedAt, {
          items,
          nextCursor: request.after + items.length,
          hasMore,
        }),
      };
    });
    return read();
  }

  snapshot(
    request: ProjectionSnapshotRequest,
    nativeNotificationProjection: NativeNotificationProjection,
    runSessionProjection: RunSessionProjection = "include",
  ): OperatorProjectionSnapshot {
    const authenticated = this.#authoriseRead(request.credential, request.projectId, request.projectSessionId);
    const selectedSessionId = this.#selectedSessionId(authenticated, request.projectSessionId);
    const read = this.#database.transaction((): OperatorProjectionSnapshot => {
      const project = this.#projectRow(request.projectId);
      const snapshotRevision = this.#globalRevision();
      const observedAt = toTimestamp(this.#clock(), "projectionSnapshot.observedAt");
      const sessionRow = selectedSessionId === undefined
        ? undefined
        : row(this.#database.prepare(`
            SELECT * FROM project_sessions WHERE project_session_id=? AND project_id=?
          `).get(selectedSessionId, request.projectId), "project session");
      const session = sessionRow === undefined ? null : this.#sessionFromRow(sessionRow);
      const runs = this.#runs(request.projectId, selectedSessionId, runSessionProjection);
      const attention = this.#attention(request.projectId, selectedSessionId, nativeNotificationProjection);
      const capacity = this.#capacity(request.projectId, selectedSessionId);
      const cursor = this.#eventCursor(request.projectId, selectedSessionId);
      const projectValue = {
        projectId: parseIdentifier<"ProjectId">(text(project, "project_id"), "projectionSnapshot.projectId"),
        canonicalRoot: text(project, "canonical_root"),
      };
      const stateValue = {
        snapshotRevision,
        project: projectValue,
        session,
        runs,
        attention,
        capacity,
        cursor,
      };
      return {
        schemaVersion: 1,
        snapshotRevision,
        readTransactionId: readTransactionId(request.projectId, selectedSessionId, snapshotRevision),
        project: liveFact(integer(project, "revision"), observedAt, projectValue),
        session: liveFact(session?.revision ?? integer(project, "revision"), observedAt, session),
        runs: liveFact(maximumRevision(runs.map((run) => runRevision(run.runId, this.#database))), observedAt, runs),
        attention: liveFact(maximumRevision(attention.map((item) => item.revision)), observedAt, attention),
        capacity: liveFact(snapshotRevision, observedAt, capacity),
        cursor,
        stateDigest: parseSha256Digest(digest(stateValue), "projectionSnapshot.stateDigest"),
      };
    });
    return read();
  }

  viewPage(
    request: OperatorViewPageRequest,
    nativeNotificationProjection: NativeNotificationProjection,
    runSessionProjection: RunSessionProjection = "include",
    declaredRunProgressProjection: DeclaredRunProgressProjection = "include",
    runIdentityProjection: RunIdentityProjection = "include",
  ): OperatorViewPageResult {
    const authenticated = this.#authoriseRead(request.credential, request.projectId, request.projectSessionId);
    const selectedSessionId = this.#selectedSessionId(authenticated, request.projectSessionId);
    assertPageBounds(request.cursor, request.limit);
    switch (request.view) {
      case "attention": return this.#viewPage(request, "attention", () => (
        this.#attentionRows(
          request.projectId,
          selectedSessionId,
          authenticated,
          nativeNotificationProjection,
          runSessionProjection,
        )
      ), selectedSessionId);
      case "project": return this.#viewPage(request, "project", () => (
        this.#projectRows(request.projectId, authenticated)
      ), selectedSessionId);
      case "runs": return this.#viewPage(request, "runs", () => (
        this.#runRows(
          request.projectId,
          selectedSessionId,
          authenticated,
          runSessionProjection,
          declaredRunProgressProjection,
          runIdentityProjection,
        )
      ), selectedSessionId);
      case "work": return this.#viewPage(request, "work", () => (
        this.#workRows(request.projectId, selectedSessionId, authenticated)
      ), selectedSessionId);
      case "agents": return this.#viewPage(request, "agents", () => (
        this.#agentRows(request.projectId, selectedSessionId, authenticated)
      ), selectedSessionId);
      case "evidence": return this.#viewPage(request, "evidence", () => (
        this.#evidenceRows(request.projectId, selectedSessionId, authenticated)
      ), selectedSessionId);
      case "activity": return this.#viewPage(request, "activity", () => (
        this.#activityRows(request.projectId, selectedSessionId, authenticated)
      ), selectedSessionId);
      case "system": return this.#viewPage(request, "system", () => (
        this.#systemRows(request.projectId, authenticated)
      ), selectedSessionId);
      default: return assertNever(request.view);
    }
  }

  page<View extends ConsoleView>(
    request: ProjectionPageRequest<View>,
    nativeNotificationProjection: NativeNotificationProjection,
    runSessionProjection: RunSessionProjection = "include",
  ): ProjectionPageResult<View> {
    const authenticated = this.#authoriseRead(request.credential, request.projectId, request.projectSessionId);
    const selectedSessionId = this.#selectedSessionId(authenticated, request.projectSessionId);
    assertPageBounds(request.after, request.limit);
    const read = this.#database.transaction((): ProjectionPageResult<View> => {
      const allItems = this.#projectionItems(
        request.view,
        request.projectId,
        selectedSessionId,
        nativeNotificationProjection,
        runSessionProjection,
      );
      // The closed view switch above preserves the View-to-item correlation that
      // TypeScript cannot retain through an indexed conditional return type.
      const items = allItems.slice(request.after, request.after + request.limit) as unknown as
        readonly ProjectionViewItemMap[View][];
      const observedAt = toTimestamp(this.#clock(), "projectionPage.observedAt");
      const result = {
        view: request.view,
        page: liveFact(this.#globalRevision(), observedAt, {
          items,
          nextCursor: request.after + items.length,
          hasMore: request.after + items.length < allItems.length,
        }),
      };
      return result as ProjectionPageResult<View>;
    });
    return read();
  }

  #viewPage<View extends ConsoleView>(
    request: OperatorViewPageRequest,
    view: View,
    loadRows: () => readonly OperatorViewRow<View>[],
    selectedSessionId: ProjectSessionId | undefined,
  ): ConcreteOperatorViewPageResult<View> {
    const read = this.#database.transaction((): ConcreteOperatorViewPageResult<View> => {
      const currentSnapshotRevision = this.#globalRevision();
      if (request.snapshotRevision !== currentSnapshotRevision) {
        return {
          status: "resnapshot-required",
          view,
          reason: "snapshot-mismatch",
          currentSnapshotRevision,
          snapshotCursor: this.#eventCursor(request.projectId, selectedSessionId),
        };
      }
      const allRows = loadRows();
      const rows = allRows.slice(request.cursor, request.cursor + request.limit);
      return {
        status: "page",
        view,
        rows,
        nextCursor: request.cursor + rows.length,
        hasMore: request.cursor + rows.length < allRows.length,
        snapshotRevision: currentSnapshotRevision,
        readTransactionId: readTransactionId(request.projectId, selectedSessionId, currentSnapshotRevision),
      };
    });
    return read();
  }

  detail(
    request: OperatorDetailReadRequest,
    runSessionProjection: RunSessionProjection = "include",
    declaredRunProgressProjection: DeclaredRunProgressProjection = "include",
    runIdentityProjection: RunIdentityProjection = "include",
  ): OperatorDetailReadResult {
    const authenticated = this.#authoriseRead(request.credential, request.projectId, request.projectSessionId);
    const selectedSessionId = this.#selectedSessionId(authenticated, request.projectSessionId);
    const read = this.#database.transaction((): OperatorDetailReadResult => {
      const currentSnapshotRevision = this.#globalRevision();
      if (request.snapshotRevision !== currentSnapshotRevision) {
        return { status: "resnapshot-required", reason: "snapshot-mismatch", currentSnapshotRevision };
      }
      const loaded = this.#loadDetail(
        request.detailRef,
        request.projectId,
        selectedSessionId,
        runSessionProjection,
        declaredRunProgressProjection,
        runIdentityProjection,
      );
      if (request.detailRef.expectedRevision !== loaded.revision) {
        return {
          status: "resnapshot-required",
          reason: "detail-revision-changed",
          currentSnapshotRevision,
        };
      }
      const detailRef = request.detailRef.kind === "run"
        ? {
            kind: "run" as const,
            coordinationRunId: request.detailRef.coordinationRunId,
            expectedRevision: request.detailRef.expectedRevision,
            ...(runSessionProjection === "include" && loaded.detail.kind === "run"
              ? { projectSessionId: loaded.detail.projectSessionId }
              : {}),
          }
        : request.detailRef;
      return {
        status: "current",
        detailRef,
        detail: liveFact(loaded.revision, loaded.observedAt, loaded.detail),
        snapshotRevision: currentSnapshotRevision,
        readTransactionId: readTransactionId(request.projectId, selectedSessionId, currentSnapshotRevision),
      };
    });
    return read();
  }

  events(request: ProjectionEventsRequest): ProjectionEventsResult {
    const authenticated = this.#authoriseRead(request.credential, request.projectId, request.projectSessionId);
    const selectedSessionId = this.#selectedSessionId(authenticated, request.projectSessionId);
    assertPageBounds(request.after, request.limit);
    const read = this.#database.transaction((): ProjectionEventsResult => {
      const currentSnapshotRevision = this.#globalRevision();
      const snapshotCursor = this.#eventCursor(request.projectId, selectedSessionId);
      if (request.after > snapshotCursor) {
        return {
          status: "resnapshot-required",
          reason: "cursor-overflow",
          currentSnapshotRevision,
          snapshotCursor,
        };
      }
      const minimumCursor = this.#minimumEventCursor(request.projectId, selectedSessionId);
      if (minimumCursor > 0 && request.after < minimumCursor - 1) {
        return {
          status: "resnapshot-required",
          reason: "retention-gap",
          currentSnapshotRevision,
          snapshotCursor,
        };
      }
      const values = selectedSessionId === undefined
        ? this.#database.prepare(`
            SELECT seq.sequence, e.*, r.project_session_id
              FROM observer_event_sequence seq
              JOIN events e ON e.event_id=seq.event_id
              JOIN runs r ON r.run_id=e.run_id
              JOIN project_sessions s ON s.project_session_id=r.project_session_id
             WHERE s.project_id=? AND seq.sequence>?
             ORDER BY seq.sequence LIMIT ?
          `).all(request.projectId, request.after, request.limit + 1)
        : this.#database.prepare(`
            SELECT seq.sequence, e.*, r.project_session_id
              FROM observer_event_sequence seq
              JOIN events e ON e.event_id=seq.event_id
              JOIN runs r ON r.run_id=e.run_id
             WHERE r.project_session_id=? AND seq.sequence>?
             ORDER BY seq.sequence LIMIT ?
          `).all(selectedSessionId, request.after, request.limit + 1);
      const hasMore = values.length > request.limit;
      const selected = hasMore ? values.slice(0, request.limit) : values;
      const events = selected.map((value): ProjectionEvent => {
        const event = row(value, "projection event");
        const cursor = integer(event, "sequence");
        return {
          cursor,
          projectSessionId: parseIdentifier<"ProjectSessionId">(
            text(event, "project_session_id"),
            "projectionEvent.projectSessionId",
          ),
          kind: text(event, "type"),
          revision: cursor,
          occurredAt: toTimestamp(integer(event, "created_at"), "projectionEvent.occurredAt"),
          payload: parseJsonValue(JSON.parse(text(event, "payload_json")), "projectionEvent.payload"),
        };
      });
      return {
        status: "continuation",
        events,
        nextCursor: events.at(-1)?.cursor ?? request.after,
        hasMore,
        snapshotRevision: currentSnapshotRevision,
        readTransactionId: readTransactionId(request.projectId, selectedSessionId, currentSnapshotRevision),
      };
    });
    return read();
  }

  messageBody(request: MessageBodyReadRequest): MessageBodyReadResult {
    const session = row(this.#database.prepare(`
      SELECT project_id FROM project_sessions WHERE project_session_id=?
    `).get(request.projectSessionId), "project session");
    const projectId = parseIdentifier<"ProjectId">(text(session, "project_id"), "messageBody.projectId");
    this.#authoriseRead(request.credential, projectId, request.projectSessionId);
    const read = this.#database.transaction((): MessageBodyReadResult => {
      const value = this.#database.prepare(`
        SELECT m.* FROM messages m JOIN runs r ON r.run_id=m.run_id
         WHERE m.message_id=? AND r.project_session_id=?
      `).get(request.messageId, request.projectSessionId);
      if (!isRow(value)) {
        const exists = isRow(this.#database.prepare("SELECT message_id FROM messages WHERE message_id=?").get(request.messageId));
        return {
          available: false,
          messageId: request.messageId,
          revision: request.expectedRevision,
          reason: exists ? "forbidden" : "not-found",
        };
      }
      const revision = 1;
      if (request.expectedRevision !== revision) {
        throw new ProjectFabricCoreError("STALE_REVISION", "message revision changed", {
          expected: request.expectedRevision,
          actual: revision,
        });
      }
      const expiresAt = value.expires_at;
      if (typeof expiresAt === "number" && Number.isSafeInteger(expiresAt) && expiresAt <= this.#clock()) {
        return {
          available: false,
          messageId: request.messageId,
          revision,
          reason: "expired",
        };
      }
      return {
        available: true,
        messageId: request.messageId,
        revision,
        body: renderSafeMessageBody(text(value, "body")),
        terminalNeutralised: true,
        capabilityValuesRedacted: true,
        artifactRefs: this.#messageArtifacts(value),
      };
    });
    return read();
  }

  #authoriseRead(
    credential: ProjectDiscoveryRequest["credential"],
    projectId: ProjectId,
    projectSessionId?: ProjectSessionId,
  ): AuthenticatedOperatorCredential {
    const authenticated = this.#operatorStore.authenticateCredential(credential.token);
    if (authenticated.capabilityId !== credential.capabilityId) {
      throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "operator credential identity does not match");
    }
    if (authenticated.context.projectId !== projectId) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "operator credential is bound to another project");
    }
    if (!authenticated.actions.includes("read")) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator capability lacks read");
    }
    if (projectSessionId !== undefined && authenticated.projectSessionId !== projectSessionId) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator capability is not bound to the selected session");
    }
    return authenticated;
  }

  #projectRow(projectId: ProjectId): Row {
    return row(this.#database.prepare(`
      SELECT project_id, canonical_root, revision, updated_at FROM projects WHERE project_id=?
    `).get(projectId), "project");
  }

  #selectedSessionId(
    authenticated: AuthenticatedOperatorCredential,
    requestedSessionId: ProjectSessionId | undefined,
  ): ProjectSessionId | undefined {
    if (requestedSessionId !== undefined) return requestedSessionId;
    return authenticated.projectSessionId === undefined
      ? undefined
      : parseIdentifier<"ProjectSessionId">(
          authenticated.projectSessionId,
          "operatorCredential.projectSessionId",
        );
  }

  #globalRevision(): number {
    return integer(row(this.#database.prepare(`
      SELECT revision FROM daemon_global_state WHERE singleton=1
    `).get(), "daemon global state"), "revision");
  }

  #sessionFromRow(stored: Row): ProjectSession {
    const originKind = text(stored, "origin_kind");
    if (originKind !== "operator-launch") throw new Error("stored project-session origin is invalid");
    const origin = {
      kind: "operator-launch" as const,
      operatorId: text(stored, "origin_operator_id"),
    };
    const terminalPath = nullableText(stored, "terminal_path_json");
    return parseProjectSession({
      projectSessionId: text(stored, "project_session_id"),
      projectId: text(stored, "project_id"),
      mode: text(stored, "mode"),
      state: text(stored, "state"),
      revision: integer(stored, "revision"),
      generation: integer(stored, "generation"),
      authorityRef: text(stored, "authority_ref"),
      budgetRef: text(stored, "budget_ref"),
      launchPacketRef: {
        path: text(stored, "launch_packet_path"),
        digest: text(stored, "launch_packet_digest"),
      },
      membershipRevision: integer(stored, "membership_revision"),
      origin,
      ...(terminalPath === null ? {} : { terminalPath: JSON.parse(terminalPath) }),
    });
  }

  #runs(
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
    runSessionProjection: RunSessionProjection,
  ): RunProjection[] {
    const values = projectSessionId === undefined
      ? this.#database.prepare(`
          SELECT r.* FROM runs r JOIN project_sessions s ON s.project_session_id=r.project_session_id
           WHERE s.project_id=? ORDER BY r.created_at, r.run_id
        `).all(projectId)
      : this.#database.prepare(`
          SELECT * FROM runs WHERE project_session_id=? ORDER BY created_at, run_id
        `).all(projectSessionId);
    return values.map((value): RunProjection => {
      const run = row(value, "coordination run");
      const phase = text(run, "lifecycle_state");
      return {
        ...(runSessionProjection === "include"
          ? {
              projectSessionId: parseIdentifier<"ProjectSessionId">(
                text(run, "project_session_id"),
                "projectionSnapshot.projectSessionId",
              ),
            }
          : {}),
        runId: parseIdentifier<"CoordinationRunId">(text(run, "run_id"), "projectionSnapshot.runId"),
        phase,
        chairAgentId: parseIdentifier<"AgentId">(text(run, "chair_agent_id"), "projectionSnapshot.chairAgentId"),
        nextMilestone: nextMilestone(phase),
        health: runHealth(phase),
      };
    });
  }

  #attention(
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
    nativeNotificationProjection: NativeNotificationProjection,
  ): AttentionItem[] {
    const values = projectSessionId === undefined
      ? this.#database.prepare(`
          SELECT a.* FROM attention_items a
          JOIN project_sessions s ON s.project_session_id=a.project_session_id
          WHERE s.project_id=? AND a.state='open'
          ORDER BY a.updated_at DESC, a.item_id
        `).all(projectId)
      : this.#database.prepare(`
          SELECT * FROM attention_items WHERE project_session_id=? AND state='open'
          ORDER BY updated_at DESC, item_id
        `).all(projectSessionId);
    return values.map((value): AttentionItem => {
      const item = row(value, "attention item");
      const payload = jsonObject(text(item, "payload_json"), "attention payload");
      return {
        itemId: text(item, "item_id"),
        revision: integer(item, "revision"),
        label: attentionLabel(text(item, "kind")),
        priority: attentionPriority(payload.priority, text(item, "severity")),
        title: typeof payload.title === "string" ? payload.title : text(item, "kind"),
        sourceFreshness: "live",
        lastEventAt: toTimestamp(integer(item, "updated_at"), "attention.lastEventAt"),
        duplicateCount: typeof payload.duplicateCount === "number" && Number.isSafeInteger(payload.duplicateCount)
          ? Math.max(1, payload.duplicateCount)
          : 1,
        ...(nativeNotificationProjection === "include"
          ? { nativeNotification: this.#nativeNotification(item) }
          : {}),
      };
    });
  }

  #projectionItems(
    view: ConsoleView,
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
    nativeNotificationProjection: NativeNotificationProjection,
    runSessionProjection: RunSessionProjection,
  ): readonly ProjectionViewItemMap[ConsoleView][] {
    switch (view) {
      case "attention": return this.#attention(projectId, projectSessionId, nativeNotificationProjection);
      case "project": return this.#projectItems(projectId);
      case "runs": return this.#runs(projectId, projectSessionId, runSessionProjection);
      case "work": return this.#workItems(projectId, projectSessionId);
      case "agents": return this.#agentItems(projectId, projectSessionId);
      case "evidence": return this.#evidenceItems(projectId, projectSessionId);
      case "activity": return this.#activityItems(projectId, projectSessionId);
      case "system": return this.#systemItems(projectId);
      default: return assertNever(view);
    }
  }

  #projectItems(projectId: ProjectId): ProjectionViewItemMap["project"][] {
    const project = this.#projectRow(projectId);
    const revision = integer(project, "revision");
    const observedAt = toTimestamp(integer(project, "updated_at"), "projectPage.observedAt");
    return [{
      projectId,
      goal: this.#projectGoal(projectId),
      acceptedScopeRef: null,
      repositoryRevision: "unavailable",
      github: {
        freshness: "unavailable",
        source: "github",
        revision,
        observedAt,
        reason: "not-observed",
      },
    }];
  }

  #workItems(
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
  ): ProjectionViewItemMap["work"][] {
    const values = this.#sessionQuery(
      projectId,
      projectSessionId,
      `SELECT t.*, r.project_session_id FROM tasks t JOIN runs r ON r.run_id=t.run_id`,
      "ORDER BY t.task_id",
    );
    return values.map((task): ProjectionViewItemMap["work"] => {
      const taskId = parseIdentifier<"TaskId">(text(task, "task_id"), "workPage.taskId");
      const workstreamValue = this.#database.prepare(`
        SELECT workstream_id FROM workstreams
         WHERE coordination_run_id=? AND fabric_task_id=?
         ORDER BY workstream_id LIMIT 1
      `).get(text(task, "run_id"), taskId);
      const workstreamId = isRow(workstreamValue)
        ? parseIdentifier<"WorkstreamId">(text(workstreamValue, "workstream_id"), "workPage.workstreamId")
        : null;
      const authority = row(this.#database.prepare(`
        SELECT authority_json, authority_hash FROM authorities WHERE authority_id=?
      `).get(text(task, "authority_id")), "task authority");
      const sourcePrefixes = [...readStoredAuthority(authority, "task authority").sourcePaths];
      const ownerAgentId = nullableText(task, "owner_agent_id");
      const barrierIds = this.#database.prepare(`
        SELECT scope, stage_id FROM barriers WHERE run_id=? ORDER BY scope, stage_id
      `).all(text(task, "run_id")).map((value) => {
        const barrier = row(value, "work barrier");
        return `${text(task, "run_id")}:${text(barrier, "scope")}:${text(barrier, "stage_id")}`;
      });
      return {
        taskId,
        workstreamId,
        parentTaskId: null,
        state: text(task, "state"),
        ownerAgentId: ownerAgentId === null
          ? null
          : parseIdentifier<"AgentId">(ownerAgentId, "workPage.ownerAgentId"),
        sourcePrefixes,
        worktreePath: null,
        barrierIds,
        checkState: this.#taskCheckState(text(task, "run_id"), taskId),
      };
    });
  }

  #agentItems(
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
  ): ProjectionViewItemMap["agents"][] {
    const values = this.#sessionQuery(
      projectId,
      projectSessionId,
      `SELECT a.*, r.project_session_id, r.chair_agent_id,
              COALESCE(ps.provider_session_generation, 1) AS provider_generation,
              COALESCE(ab.adapter_id, 'unbound') AS provider
         FROM agents a JOIN runs r ON r.run_id=a.run_id
         LEFT JOIN provider_state ps ON ps.run_id=a.run_id AND ps.agent_id=a.agent_id
         LEFT JOIN agent_adapter_bindings ab ON ab.run_id=a.run_id AND ab.agent_id=a.agent_id`,
      "ORDER BY a.agent_id",
    );
    return values.map((agent): ProjectionViewItemMap["agents"] => {
      const agentId = parseIdentifier<"AgentId">(text(agent, "agent_id"), "agentPage.agentId");
      const taskValue = this.#database.prepare(`
        SELECT task_id FROM tasks WHERE run_id=? AND owner_agent_id=? ORDER BY task_id LIMIT 1
      `).get(text(agent, "run_id"), agentId);
      const workstreamValue = this.#database.prepare(`
        SELECT workstream_id FROM workstreams
         WHERE coordination_run_id=? AND lead_agent_id=? ORDER BY workstream_id LIMIT 1
      `).get(text(agent, "run_id"), agentId);
      const generation = integer(agent, "provider_generation");
      const observedAt = toTimestamp(this.#clock(), "agentPage.observedAt");
      return {
        agentId,
        stableTaskId: isRow(taskValue)
          ? parseIdentifier<"TaskId">(text(taskValue, "task_id"), "agentPage.stableTaskId")
          : null,
        stableWorkstreamId: isRow(workstreamValue)
          ? parseIdentifier<"WorkstreamId">(text(workstreamValue, "workstream_id"), "agentPage.stableWorkstreamId")
          : null,
        role: this.#agentRole(text(agent, "run_id"), agentId, text(agent, "chair_agent_id")),
        provider: text(agent, "provider"),
        modelFamily: "unknown",
        providerSessionRef: nullableText(agent, "provider_session_ref"),
        providerSessionGeneration: generation,
        lifecycle: text(agent, "lifecycle"),
        contextPressure: "unknown",
        visibility: this.#herdrVisibility(text(agent, "run_id"), agentId, generation, observedAt),
      };
    });
  }

  #herdrVisibility(
    coordinationRunId: string,
    agentId: string,
    fallbackRevision: number,
    fallbackObservedAt: Timestamp,
  ): ProjectionFact<{ paneRef: string | null }, "herdr"> {
    const value = this.#database.prepare(`
      SELECT state, discovered_contract_json, checked_at
        FROM integration_availability WHERE integration_id=?
    `).get(HERDR_CONTROL_ADAPTER_ID);
    if (!isRow(value)) {
      return {
        freshness: "unavailable",
        source: "herdr",
        revision: fallbackRevision,
        observedAt: fallbackObservedAt,
        reason: "not-observed",
      };
    }
    const integrationState = text(value, "state");
    const checkedAtValue = integer(value, "checked_at");
    const checkedAt = toTimestamp(checkedAtValue, "Herdr integration checkedAt");
    let contract: Row;
    let generation: number;
    try {
      contract = jsonObject(text(value, "discovered_contract_json"), "Herdr integration contract");
      if (contract.schemaVersion !== 1 || contract.operationFamily !== HERDR_CONTROL_ADAPTER_ID) {
        throw new TypeError("Herdr integration contract identity is incompatible");
      }
      generation = contractGeneration(contract);
    } catch {
      return {
        freshness: "unavailable",
        source: "herdr",
        revision: fallbackRevision,
        observedAt: checkedAt,
        reason: "malformed-presence-contract",
      };
    }
    if (!Array.isArray(contract.presence) || contract.presence.length > 256) {
      return {
        freshness: "unavailable",
        source: "herdr",
        revision: generation,
        observedAt: checkedAt,
        reason: "malformed-presence-contract",
      };
    }
    const candidates = contract.presence.filter((entry): entry is Row =>
      isRow(entry) && entry.coordinationRunId === coordinationRunId && entry.agentId === agentId
    );
    if (candidates.length !== 1) {
      return {
        freshness: "unavailable",
        source: "herdr",
        revision: generation,
        observedAt: checkedAt,
        reason: candidates.length === 0 ? "not-observed" : "conflicting-presence-observation",
      };
    }
    const presence = candidates[0] as Row;
    const paneRef = presence.paneRef;
    const observedAtValue = presence.observedAt;
    if (
      (paneRef !== null && (typeof paneRef !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u.test(paneRef))) ||
      typeof observedAtValue !== "number" || !Number.isSafeInteger(observedAtValue) ||
      observedAtValue < 0 || observedAtValue > checkedAtValue ||
      (presence.state !== "available" && presence.state !== "unavailable") ||
      typeof presence.readiness !== "string"
    ) {
      return {
        freshness: "unavailable",
        source: "herdr",
        revision: generation,
        observedAt: checkedAt,
        reason: "malformed-presence-observation",
      };
    }
    const observedAt = toTimestamp(observedAtValue, "Herdr presence observedAt");
    if (integrationState === "stale") {
      return {
        freshness: "stale",
        source: "herdr",
        revision: generation,
        observedAt,
        value: { paneRef },
      };
    }
    if (integrationState !== "available" || presence.state !== "available") {
      return {
        freshness: "unavailable",
        source: "herdr",
        revision: generation,
        observedAt,
        reason: typeof presence.readiness === "string" ? presence.readiness : "presence-unavailable",
      };
    }
    return {
      freshness: "snapshot",
      source: "herdr",
      revision: generation,
      observedAt,
      value: { paneRef },
    };
  }

  #evidenceItems(
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
  ): ProjectionViewItemMap["evidence"][] {
    const values = this.#sessionQuery(
      projectId,
      projectSessionId,
      `SELECT a.*, r.project_session_id FROM artifacts a JOIN runs r ON r.run_id=a.run_id`,
      "ORDER BY a.created_at DESC, a.artifact_id",
    );
    return values.map((artifact): ProjectionViewItemMap["evidence"] => {
      const taskId = nullableText(artifact, "task_id");
      return {
        evidenceId: text(artifact, "artifact_id"),
        kind: "artifact",
        artifactRef: parseArtifactRef({
          path: text(artifact, "relative_path"),
          digest: text(artifact, "sha256"),
        }, "evidencePage.artifactRef"),
        taskId: taskId === null ? null : parseIdentifier<"TaskId">(taskId, "evidencePage.taskId"),
        provenance: `fabric:${text(artifact, "publisher_agent_id")}`,
        status: "informational",
      };
    });
  }

  #activityItems(
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
  ): ProjectionViewItemMap["activity"][] {
    const values = this.#sessionQuery(
      projectId,
      projectSessionId,
      `SELECT e.*, seq.sequence, r.project_session_id FROM events e
         JOIN observer_event_sequence seq ON seq.event_id=e.event_id
         JOIN runs r ON r.run_id=e.run_id`,
      "ORDER BY seq.sequence DESC",
    );
    return values.map((event): ProjectionViewItemMap["activity"] => {
      const payload = jsonObject(text(event, "payload_json"), "activity page payload");
      const taskId = typeof payload.taskId === "string"
        ? parseIdentifier<"TaskId">(payload.taskId, "activityPage.taskId")
        : null;
      const occurredAt = toTimestamp(integer(event, "created_at"), "activityPage.occurredAt");
      const kind = activityKind(text(event, "type"));
      const base = {
        eventId: text(event, "event_id"),
        actorId: nullableText(event, "actor_agent_id"),
        taskId,
        summary: text(event, "type"),
        occurredAt,
        sourceRevision: integer(event, "sequence"),
      };
      return kind === "message"
        ? { ...base, kind, messageBodyRef: this.#messageBodyRef(event) }
        : { ...base, kind };
    });
  }

  #systemItems(projectId: ProjectId): ProjectionViewItemMap["system"][] {
    this.#projectRow(projectId);
    return this.#database.prepare(`
      SELECT * FROM integration_availability ORDER BY integration_id
    `).all().map((value): ProjectionViewItemMap["system"] => {
      const integration = row(value, "integration availability");
      const contract = jsonObject(text(integration, "discovered_contract_json"), "integration contract");
      const componentId = text(integration, "integration_id");
      return {
        componentId,
        kind: "integration",
        state: systemState(text(integration, "state")),
        generation: contractGeneration(contract),
        expiresAt: null,
        detail: typeof contract.detail === "string" ? contract.detail : `Integration ${componentId}`,
      };
    });
  }

  #capacity(projectId: ProjectId, projectSessionId?: ProjectSessionId): Readonly<Record<string, JsonValue>> {
    const values = projectSessionId === undefined
      ? this.#database.prepare(`
          SELECT d.* FROM resource_dimensions d JOIN resource_scopes s ON s.scope_id=d.scope_id
           WHERE s.project_id=? ORDER BY s.scope_kind, d.unit_key
        `).all(projectId)
      : this.#database.prepare(`
          SELECT d.* FROM resource_dimensions d JOIN resource_scopes s ON s.scope_id=d.scope_id
           WHERE s.project_session_id=? ORDER BY s.scope_kind, d.unit_key
        `).all(projectSessionId);
    const capacity: Record<string, JsonValue> = {};
    for (const value of values) {
      const dimension = row(value, "resource dimension");
      capacity[text(dimension, "unit_key")] = parseJsonValue({
        limit: integer(dimension, "limit_value"),
        used: integer(dimension, "used"),
        reserved: integer(dimension, "reserved"),
        usageUnknown: integer(dimension, "usage_unknown") === 1,
      }, "projectionSnapshot.capacity");
    }
    return capacity;
  }

  #eventCursor(projectId: ProjectId, projectSessionId?: ProjectSessionId): number {
    const value = projectSessionId === undefined
      ? this.#database.prepare(`
          SELECT COALESCE(MAX(seq.sequence), 0) AS cursor
            FROM observer_event_sequence seq
            JOIN events e ON e.event_id=seq.event_id
            JOIN runs r ON r.run_id=e.run_id
            JOIN project_sessions s ON s.project_session_id=r.project_session_id
           WHERE s.project_id=?
        `).get(projectId)
      : this.#database.prepare(`
          SELECT COALESCE(MAX(seq.sequence), 0) AS cursor
            FROM observer_event_sequence seq
            JOIN events e ON e.event_id=seq.event_id
            JOIN runs r ON r.run_id=e.run_id
           WHERE r.project_session_id=?
        `).get(projectSessionId);
    return integer(row(value, "projection event cursor"), "cursor");
  }

  #minimumEventCursor(projectId: ProjectId, projectSessionId?: ProjectSessionId): number {
    const value = projectSessionId === undefined
      ? this.#database.prepare(`
          SELECT COALESCE(MIN(seq.sequence), 0) AS cursor
            FROM observer_event_sequence seq
            JOIN events e ON e.event_id=seq.event_id
            JOIN runs r ON r.run_id=e.run_id
            JOIN project_sessions s ON s.project_session_id=r.project_session_id
           WHERE s.project_id=?
        `).get(projectId)
      : this.#database.prepare(`
          SELECT COALESCE(MIN(seq.sequence), 0) AS cursor
            FROM observer_event_sequence seq
            JOIN events e ON e.event_id=seq.event_id
            JOIN runs r ON r.run_id=e.run_id
           WHERE r.project_session_id=?
        `).get(projectSessionId);
    return integer(row(value, "minimum projection event cursor"), "cursor");
  }

  #messageArtifacts(message: Row): ArtifactRef[] {
    const contextValue = this.#database.prepare(`
      SELECT context_json FROM message_contexts WHERE message_id=?
    `).get(text(message, "message_id"));
    if (!isRow(contextValue)) return [];
    const context = jsonObject(text(contextValue, "context_json"), "message context");
    const taskId = context.taskId;
    if (typeof taskId !== "string") return [];
    return this.#database.prepare(`
      SELECT relative_path, sha256 FROM artifacts WHERE run_id=? AND task_id=?
      ORDER BY relative_path, sha256
    `).all(text(message, "run_id"), taskId).map((value) => {
      const artifact = row(value, "message artifact");
      return parseArtifactRef({
        path: text(artifact, "relative_path"),
        digest: text(artifact, "sha256"),
      }, "messageBody.artifactRef");
    });
  }

  #attentionRows(
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
    authenticated: AuthenticatedOperatorCredential,
    nativeNotificationProjection: NativeNotificationProjection,
    runSessionProjection: RunSessionProjection,
  ): OperatorViewRow<"attention">[] {
    const values = projectSessionId === undefined
      ? this.#database.prepare(`
          SELECT a.*, r.revision AS run_revision
            FROM attention_items a
            JOIN project_sessions s ON s.project_session_id=a.project_session_id
            LEFT JOIN runs r ON r.run_id=a.coordination_run_id
           WHERE s.project_id=? AND a.state='open'
           ORDER BY a.updated_at DESC, a.item_id
        `).all(projectId)
      : this.#database.prepare(`
          SELECT a.*, r.revision AS run_revision
            FROM attention_items a
            LEFT JOIN runs r ON r.run_id=a.coordination_run_id
           WHERE a.project_session_id=? AND a.state='open'
           ORDER BY a.updated_at DESC, a.item_id
        `).all(projectSessionId);
    const availability = actionAvailability(authenticated);
    return values.map((value): OperatorViewRow<"attention"> => {
      const item = row(value, "attention item row");
      const payload = jsonObject(text(item, "payload_json"), "attention payload");
      const runId = nullableText(item, "coordination_run_id");
      const runRevisionValue = item.run_revision;
      const detailRef = runId !== null && typeof runRevisionValue === "number" && Number.isSafeInteger(runRevisionValue)
        ? {
            kind: "run" as const,
            ...(runSessionProjection === "include"
              ? {
                  projectSessionId: parseIdentifier<"ProjectSessionId">(
                    text(item, "project_session_id"),
                    "attention.detailRef.projectSessionId",
                  ),
                }
              : {}),
            coordinationRunId: parseIdentifier<"CoordinationRunId">(runId, "attention.detailRef.runId"),
            expectedRevision: runRevisionValue,
          }
        : {
            kind: "session" as const,
            projectSessionId: parseIdentifier<"ProjectSessionId">(
              text(item, "project_session_id"),
              "attention.detailRef.projectSessionId",
            ),
            expectedRevision: this.#sessionRevision(text(item, "project_session_id")),
          };
      const label = attentionLabel(text(item, "kind"));
      const priority = attentionPriority(payload.priority, text(item, "severity"));
      const title = typeof payload.title === "string" ? payload.title : text(item, "kind");
      const revision = integer(item, "revision");
      const gateBinding = this.#attentionGateBinding(item, payload, runId);
      return {
        itemId: text(item, "item_id"),
        itemRevision: revision,
        fact: liveFact(revision, toTimestamp(integer(item, "updated_at"), "attentionRow.observedAt"), {
          summary: {
            kind: "attention",
            label,
            priority,
            title,
            ...(gateBinding === undefined ? {} : { gateBinding }),
            ...(nativeNotificationProjection === "include"
              ? { nativeNotification: this.#nativeNotification(item) }
              : {}),
          },
          detailRef,
          actionAvailability: availability,
        }),
      };
    });
  }

  #attentionGateBinding(
    item: Row,
    payload: Row,
    runId: string | null,
  ): OperatorViewSummaryMap["attention"]["gateBinding"] | undefined {
    if (typeof payload.gateId !== "string" || runId === null) return undefined;
    const value = this.#database.prepare(`
      SELECT gate_id, project_session_id, coordination_run_id, revision, status
        FROM scoped_gates WHERE gate_id=?
    `).get(payload.gateId);
    if (!isRow(value)) return undefined;
    if (
      text(value, "project_session_id") !== text(item, "project_session_id") ||
      text(value, "coordination_run_id") !== runId ||
      (text(value, "status") !== "pending" && text(value, "status") !== "deferred")
    ) return undefined;
    return {
      gateId: parseIdentifier<"GateId">(text(value, "gate_id"), "attention.gateBinding.gateId"),
      gateRevision: integer(value, "revision"),
      coordinationRunId: parseIdentifier<"CoordinationRunId">(
        runId,
        "attention.gateBinding.coordinationRunId",
      ),
    };
  }

  #sessionRevision(projectSessionId: string): number {
    return integer(row(this.#database.prepare(`
      SELECT revision FROM project_sessions WHERE project_session_id=?
    `).get(projectSessionId), "project session"), "revision");
  }

  #nativeNotification(item: Row): NativeNotificationDeliverySummary {
    const itemId = text(item, "item_id");
    const itemRevision = integer(item, "revision");
    const deliveryValue = this.#database.prepare(`
      SELECT item_revision, state, claim_generation, updated_at
        FROM notification_deliveries
       WHERE item_id=? AND target_integration='native-desktop'
       ORDER BY (item_revision=?) DESC, item_revision DESC, updated_at DESC
       LIMIT 1
    `).get(itemId, itemRevision);
    const integrationValue = this.#database.prepare(`
      SELECT state, checked_at FROM integration_availability
       WHERE integration_id='native-desktop'
    `).get();
    const delivery = isRow(deliveryValue) ? deliveryValue : null;
    const integration = isRow(integrationValue) ? integrationValue : null;
    const integrationState = integration === null ? "absent" : text(integration, "state");
    if (
      integrationState !== "absent" && integrationState !== "available" &&
      integrationState !== "unavailable" && integrationState !== "stale"
    ) throw new Error("stored native notification integration state is invalid");
    const journalState = delivery === null ? "missing" : text(delivery, "state");
    if (
      journalState !== "missing" && journalState !== "pending" && journalState !== "claimed" &&
      journalState !== "sent" && journalState !== "failed" && journalState !== "deduplicated" &&
      journalState !== "ambiguous"
    ) throw new Error("stored native notification journal state is invalid");
    const deliveryItemRevision = delivery === null ? null : integer(delivery, "item_revision");
    const status = integrationState === "stale" ||
      (deliveryItemRevision !== null && deliveryItemRevision !== itemRevision) || journalState === "ambiguous"
      ? "stale"
      : integrationState === "absent" || integrationState === "unavailable" ||
          journalState === "missing" || journalState === "failed"
        ? "unavailable"
        : "available";
    const observedAtMillis = Math.max(
      integer(item, "updated_at"),
      delivery === null ? 0 : integer(delivery, "updated_at"),
      integration === null ? 0 : integer(integration, "checked_at"),
    );
    return {
      targetIntegration: "native-desktop",
      status,
      journalState,
      deliveryItemRevision,
      claimGeneration: delivery === null ? null : integer(delivery, "claim_generation"),
      integrationState,
      observedAt: toTimestamp(observedAtMillis, "attention.nativeNotification.observedAt"),
    };
  }

  #projectRows(projectId: ProjectId, authenticated: AuthenticatedOperatorCredential): OperatorViewRow<"project">[] {
    const project = this.#projectRow(projectId);
    const revision = integer(project, "revision");
    const goal = this.#projectGoal(projectId);
    const acceptedScopeRef = this.#acceptedScopeRef(projectId);
    return [{
      itemId: text(project, "project_id"),
      itemRevision: revision,
      fact: liveFact(revision, toTimestamp(integer(project, "updated_at"), "projectRow.observedAt"), {
        summary: {
          kind: "project",
          goal,
          acceptedScopeRef,
          repositoryRevision: "unavailable",
        },
        detailRef: { kind: "project", projectId, expectedRevision: revision },
        actionAvailability: actionAvailability(authenticated),
      }),
    }];
  }

  #runRows(
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
    authenticated: AuthenticatedOperatorCredential,
    runSessionProjection: RunSessionProjection,
    declaredRunProgressProjection: DeclaredRunProgressProjection,
    runIdentityProjection: RunIdentityProjection,
  ): OperatorViewRow<"runs">[] {
    return this.#rowsForRuns(projectId, projectSessionId).map((run): OperatorViewRow<"runs"> => {
      const phase = text(run, "lifecycle_state");
      const revision = integer(run, "revision");
      const runId = parseIdentifier<"CoordinationRunId">(text(run, "run_id"), "runRow.runId");
      const runProjectSessionId = parseIdentifier<"ProjectSessionId">(
        text(run, "project_session_id"),
        "runRow.projectSessionId",
      );
      const controlAvailability = this.#runControlAvailability(
        runId,
        runProjectSessionId,
        revision,
        authenticated,
      );
      return {
        itemId: runId,
        itemRevision: revision,
        fact: liveFact(revision, toTimestamp(integer(run, "created_at"), "runRow.observedAt"), {
          summary: {
            kind: "run",
            ...(runSessionProjection === "include"
              ? { projectSessionId: runProjectSessionId }
              : {}),
            phase,
            health: runHealth(phase),
            nextMilestone: nextMilestone(phase),
            ...(declaredRunProgressProjection === "include"
              ? { declaredProgress: this.#declaredRunProgress(runId) }
              : {}),
            ...(runIdentityProjection === "include"
              ? { identity: this.#runIdentity(run) }
              : {}),
          },
          detailRef: {
            kind: "run",
            ...(runSessionProjection === "include"
              ? { projectSessionId: runProjectSessionId }
              : {}),
            coordinationRunId: runId,
            expectedRevision: revision,
          },
          actionAvailability: controlAvailability,
        }),
      };
    });
  }

  #runControlAvailability(
    runId: string,
    projectSessionId: string,
    revision: number,
    authenticated: AuthenticatedOperatorCredential,
  ): OperatorActionAvailability {
    const session = row(this.#database.prepare(`
      SELECT generation FROM project_sessions WHERE project_session_id=?
    `).get(projectSessionId), "run control session");
    const tasks = this.#database.prepare(`
      SELECT run_id, task_id, revision, state, owner_agent_id, owner_lease_generation
        FROM tasks WHERE run_id=? ORDER BY task_id
    `).all(runId).map((value) => row(value, "run control task"));
    const agents = this.#database.prepare(`
      SELECT run_id, agent_id, lifecycle FROM agents WHERE run_id=? ORDER BY agent_id
    `).all(runId).map((value) => row(value, "run control agent"));
    const target: ResolvedControlTarget = {
      scopeKind: "run",
      revision,
      projectSessionId,
      sessionGeneration: integer(session, "generation"),
      runs: [runId],
      tasks: tasks.map((task) => ({
        runId: text(task, "run_id"),
        taskId: text(task, "task_id"),
        revision: integer(task, "revision"),
        state: text(task, "state"),
        ownerAgentId: nullableText(task, "owner_agent_id"),
        ownerLeaseGeneration: integer(task, "owner_lease_generation"),
      })),
      agents: agents.map((agent) => ({
        runId: text(agent, "run_id"),
        agentId: text(agent, "agent_id"),
        lifecycle: text(agent, "lifecycle"),
      })),
    };
    const baseAvailability = actionAvailability(authenticated);
    if (baseAvailability.state !== "available") return baseAvailability;
    const eligible = new Set(readControlEligibility(this.#database, target).eligibleActions);
    const actions = baseAvailability.actions.filter((action) =>
      (action !== "pause" && action !== "resume" && action !== "cancel" && action !== "steer") ||
      eligible.has(action));
    if (actions.length > 0) return { state: "available", actions, requiresPreview: true };
    return { state: "read-only", reason: "state-ineligible" };
  }

  #workRows(
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
    authenticated: AuthenticatedOperatorCredential,
  ): OperatorViewRow<"work">[] {
    const values = this.#sessionQuery(
      projectId,
      projectSessionId,
      `SELECT t.*, r.project_session_id FROM tasks t JOIN runs r ON r.run_id=t.run_id`,
      "ORDER BY t.task_id",
    );
    return values.map((task): OperatorViewRow<"work"> => {
      const revision = integer(task, "revision");
      const taskId = parseIdentifier<"TaskId">(text(task, "task_id"), "workRow.taskId");
      const checkState = this.#taskCheckState(text(task, "run_id"), taskId);
      return {
        itemId: taskId,
        itemRevision: revision,
        fact: liveFact(revision, toTimestamp(this.#clock(), "workRow.observedAt"), {
          summary: { kind: "work", state: text(task, "state"), checkState },
          detailRef: { kind: "task", taskId, expectedRevision: revision },
          actionAvailability: actionAvailability(authenticated),
        }),
      };
    });
  }

  #agentRows(
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
    authenticated: AuthenticatedOperatorCredential,
  ): OperatorViewRow<"agents">[] {
    const values = this.#sessionQuery(
      projectId,
      projectSessionId,
      `SELECT a.*, r.project_session_id, r.chair_agent_id,
              COALESCE(ps.provider_session_generation, 1) AS provider_generation
         FROM agents a JOIN runs r ON r.run_id=a.run_id
         LEFT JOIN provider_state ps ON ps.run_id=a.run_id AND ps.agent_id=a.agent_id`,
      "ORDER BY a.agent_id",
    );
    return values.map((agent): OperatorViewRow<"agents"> => {
      const generation = integer(agent, "provider_generation");
      const agentId = parseIdentifier<"AgentId">(text(agent, "agent_id"), "agentRow.agentId");
      const role = this.#agentRole(text(agent, "run_id"), agentId, text(agent, "chair_agent_id"));
      return {
        itemId: agentId,
        itemRevision: generation,
        fact: liveFact(generation, toTimestamp(this.#clock(), "agentRow.observedAt"), {
          summary: { kind: "agent", role, lifecycle: text(agent, "lifecycle"), contextPressure: "unknown" },
          detailRef: { kind: "agent", agentId, expectedRevision: generation },
          actionAvailability: actionAvailability(authenticated),
        }),
      };
    });
  }

  #evidenceRows(
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
    authenticated: AuthenticatedOperatorCredential,
  ): OperatorViewRow<"evidence">[] {
    const values = (this.#registryV1 ? (projectSessionId === undefined
      ? this.#database.prepare(`
          SELECT * FROM artifacts
           WHERE project_id=? AND registry_state='active'
           ORDER BY created_at DESC, artifact_id
        `).all(projectId)
      : this.#database.prepare(`
          SELECT * FROM artifacts
           WHERE project_id=? AND registry_state='active'
             AND (project_session_id IS NULL OR project_session_id=?)
           ORDER BY created_at DESC, artifact_id
        `).all(projectId, projectSessionId)
    ) : this.#sessionQuery(
      projectId,
      projectSessionId,
      `SELECT a.*, r.project_session_id, 1 AS revision,
              'artifact' AS evidence_kind, 'agent' AS publisher_kind,
              a.publisher_agent_id AS publisher_ref, 'run-file' AS source_kind
         FROM artifacts a JOIN runs r ON r.run_id=a.run_id`,
      "ORDER BY a.created_at DESC, a.artifact_id",
    )).map((value) => row(value, "evidence registry row"));
    return values.map((artifact): OperatorViewRow<"evidence"> => {
      const evidenceId = text(artifact, "artifact_id");
      const revision = integer(artifact, "revision");
      return {
        itemId: evidenceId,
        itemRevision: revision,
        fact: liveFact(revision, toTimestamp(integer(artifact, "created_at"), "evidenceRow.observedAt"), {
          summary: {
            kind: "evidence",
            evidenceKind: text(artifact, "evidence_kind") as "artifact" | "diff" | "test" | "review" | "receipt",
            status: "informational",
            provenance: `${text(artifact, "publisher_kind")}:${text(artifact, "publisher_ref")}`,
          },
          detailRef: { kind: "evidence", evidenceId, expectedRevision: revision },
          actionAvailability: actionAvailability(authenticated),
        }),
      };
    });
  }

  #activityRows(
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
    authenticated: AuthenticatedOperatorCredential,
  ): OperatorViewRow<"activity">[] {
    const values = this.#sessionQuery(
      projectId,
      projectSessionId,
      `SELECT e.*, seq.sequence, r.project_session_id FROM events e
         JOIN observer_event_sequence seq ON seq.event_id=e.event_id
         JOIN runs r ON r.run_id=e.run_id`,
      "ORDER BY seq.sequence DESC",
    );
    return values.map((event): OperatorViewRow<"activity"> => {
      const sequence = integer(event, "sequence");
      const eventId = text(event, "event_id");
      const kind = activityKind(text(event, "type"));
      const occurredAt = toTimestamp(integer(event, "created_at"), "activityRow.occurredAt");
      const summary = kind === "message"
        ? {
            kind: "activity" as const,
            activityKind: "message" as const,
            summary: text(event, "type"),
            occurredAt,
            messageBodyRef: this.#messageBodyRef(event),
          }
        : {
            kind: "activity" as const,
            activityKind: kind,
            summary: text(event, "type"),
            occurredAt,
          };
      return {
        itemId: eventId,
        itemRevision: sequence,
        fact: liveFact(sequence, occurredAt, {
          summary,
          detailRef: { kind: "activity", eventId, expectedRevision: sequence },
          actionAvailability: actionAvailability(authenticated),
        }),
      };
    });
  }

  #systemRows(projectId: ProjectId, authenticated: AuthenticatedOperatorCredential): OperatorViewRow<"system">[] {
    this.#projectRow(projectId);
    return this.#database.prepare(`
      SELECT * FROM integration_availability ORDER BY integration_id
    `).all().map((value): OperatorViewRow<"system"> => {
      const integration = row(value, "integration availability");
      const contract = jsonObject(text(integration, "discovered_contract_json"), "integration contract");
      const generation = contractGeneration(contract);
      const componentId = text(integration, "integration_id");
      const state = systemState(text(integration, "state"));
      const detail = typeof contract.detail === "string" ? contract.detail : `Integration ${componentId}`;
      return {
        itemId: componentId,
        itemRevision: generation,
        fact: liveFact(generation, toTimestamp(integer(integration, "checked_at"), "systemRow.observedAt"), {
          summary: { kind: "system", systemKind: "integration", state, detail },
          detailRef: { kind: "system", componentId, expectedRevision: generation },
          actionAvailability: actionAvailability(authenticated),
        }),
      };
    });
  }

  #rowsForRuns(projectId: ProjectId, projectSessionId: ProjectSessionId | undefined): Row[] {
    const values = projectSessionId === undefined
      ? this.#database.prepare(`
          SELECT r.* FROM runs r
          JOIN project_sessions s ON s.project_session_id=r.project_session_id
          WHERE s.project_id=? ORDER BY r.created_at, r.run_id
        `).all(projectId)
      : this.#database.prepare(`
          SELECT r.* FROM runs r WHERE r.project_session_id=? ORDER BY r.created_at, r.run_id
        `).all(projectSessionId);
    return values.map((value) => row(value, "coordination run row"));
  }

  #sessionQuery(
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
    baseSql: string,
    orderBy: string,
  ): Row[] {
    const values = projectSessionId === undefined
      ? this.#database.prepare(`
          ${baseSql}
          JOIN project_sessions s ON s.project_session_id=r.project_session_id
          WHERE s.project_id=? ${orderBy}
        `).all(projectId)
      : this.#database.prepare(`
          ${baseSql}
          WHERE r.project_session_id=? ${orderBy}
        `).all(projectSessionId);
    return values.map((value) => row(value, "operator projection row"));
  }

  #taskCheckState(runId: string, taskId: string): "pending" | "passing" | "failing" | "unknown" {
    const values = this.#database.prepare(`
      SELECT status FROM task_objective_checks WHERE run_id=? AND task_id=? ORDER BY check_id
    `).all(runId, taskId).map((value) => text(row(value, "task objective check"), "status"));
    if (values.length === 0) return "unknown";
    if (values.includes("fail")) return "failing";
    if (values.includes("pending")) return "pending";
    return values.every((value) => value === "pass") ? "passing" : "unknown";
  }

  #loadDetail(
    detailRef: OperatorDetailRef,
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
    runSessionProjection: RunSessionProjection,
    declaredRunProgressProjection: DeclaredRunProgressProjection,
    runIdentityProjection: RunIdentityProjection,
  ): LoadedOperatorDetail {
    switch (detailRef.kind) {
      case "project": return this.#loadProjectDetail(detailRef, projectId);
      case "session": return this.#loadSessionDetail(detailRef, projectId, projectSessionId);
      case "run": return this.#loadRunDetail(
        detailRef,
        projectId,
        projectSessionId,
        runSessionProjection,
        declaredRunProgressProjection,
        runIdentityProjection,
      );
      case "task": return this.#loadTaskDetail(detailRef, projectId, projectSessionId);
      case "agent": return this.#loadAgentDetail(detailRef, projectId, projectSessionId);
      case "evidence": return this.#loadEvidenceDetail(detailRef, projectId, projectSessionId);
      case "activity": return this.#loadActivityDetail(detailRef, projectId, projectSessionId);
      case "system": return this.#loadSystemDetail(detailRef, projectId);
      default: return assertNever(detailRef);
    }
  }

  #loadProjectDetail(
    detailRef: Extract<OperatorDetailRef, { kind: "project" }>,
    projectId: ProjectId,
  ): LoadedOperatorDetail {
    if (detailRef.projectId !== projectId) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "project detail belongs to another project");
    }
    const project = this.#projectRow(projectId);
    const revision = integer(project, "revision");
    const canonicalRoot = text(project, "canonical_root");
    return {
      revision,
      observedAt: toTimestamp(integer(project, "updated_at"), "projectDetail.observedAt"),
      detail: {
        kind: "project",
        projectId,
        canonicalRoot,
        goal: this.#projectGoal(projectId),
        acceptedScopeRef: this.#acceptedScopeRef(projectId),
        repositoryRevision: "unavailable",
      },
    };
  }

  #loadSessionDetail(
    detailRef: Extract<OperatorDetailRef, { kind: "session" }>,
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
  ): LoadedOperatorDetail {
    this.#assertDetailSession(detailRef.projectSessionId, projectSessionId);
    const stored = row(this.#database.prepare(`
      SELECT * FROM project_sessions WHERE project_session_id=? AND project_id=?
    `).get(detailRef.projectSessionId, projectId), "project session detail");
    const session = this.#sessionFromRow(stored);
    return {
      revision: session.revision,
      observedAt: toTimestamp(integer(stored, "updated_at"), "sessionDetail.observedAt"),
      detail: {
        kind: "session",
        projectSessionId: session.projectSessionId,
        mode: session.mode,
        state: session.state,
        generation: session.generation,
        membershipRevision: session.membershipRevision,
      },
    };
  }

  #loadRunDetail(
    detailRef: Extract<OperatorDetailRef, { kind: "run" }>,
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
    runSessionProjection: RunSessionProjection,
    declaredRunProgressProjection: DeclaredRunProgressProjection,
    runIdentityProjection: RunIdentityProjection,
  ): LoadedOperatorDetail {
    const stored = row(this.#database.prepare(`
      SELECT r.* FROM runs r
      JOIN project_sessions s ON s.project_session_id=r.project_session_id
      WHERE r.run_id=? AND s.project_id=?
        AND (? IS NULL OR r.project_session_id=?)
    `).get(detailRef.coordinationRunId, projectId, projectSessionId ?? null, projectSessionId ?? null), "run detail");
    const revision = integer(stored, "revision");
    const phase = text(stored, "lifecycle_state");
    const runProjectSessionId = parseIdentifier<"ProjectSessionId">(
      text(stored, "project_session_id"),
      "runDetail.projectSessionId",
    );
    if (
      detailRef.projectSessionId !== undefined &&
      detailRef.projectSessionId !== runProjectSessionId
    ) {
      throw new ProjectFabricCoreError(
        "CAPABILITY_FORBIDDEN",
        "run detail reference belongs to another project session",
      );
    }
    return {
      revision,
      observedAt: toTimestamp(integer(stored, "created_at"), "runDetail.observedAt"),
      detail: {
        kind: "run",
        ...(runSessionProjection === "include"
          ? { projectSessionId: runProjectSessionId }
          : {}),
        coordinationRunId: detailRef.coordinationRunId,
        phase,
        chairAgentId: parseIdentifier<"AgentId">(text(stored, "chair_agent_id"), "runDetail.chairAgentId"),
        chairGeneration: integer(stored, "chair_generation"),
        health: runHealth(phase),
        ...(declaredRunProgressProjection === "include"
          ? { declaredProgress: this.#declaredRunProgress(detailRef.coordinationRunId) }
          : {}),
        ...(runIdentityProjection === "include"
          ? { identity: this.#runIdentity(stored) }
          : {}),
      },
    };
  }

  /**
   * Fabric-declared run identity for one coordination run row: the run kind,
   * the chair as coordination lead, the explicit delivery-workstream
   * parent/child group and the run's last committed event time. Every field
   * is read from the runs/workstreams/events tables in the caller's open
   * transaction; a stored workstream state outside the closed contract fails
   * the read rather than projecting a fabricated state. Accepted-scope and
   * current-plan refs are deferred to the plan-declaration package.
   */
  #runIdentity(run: Row): RunIdentity {
    const runId = text(run, "run_id");
    const workstreams = this.#database.prepare(`
      SELECT workstream_id, delivery_run_id, lead_agent_id, state, updated_at
        FROM workstreams WHERE coordination_run_id=?
       ORDER BY workstream_id
    `).all(runId).map((value): RunWorkstreamIdentity => {
      const workstream = row(value, "run workstream identity");
      const state = text(workstream, "state");
      if (
        state !== "active" && state !== "complete" && state !== "cancelled" &&
        state !== "degraded" && state !== "abandoned"
      ) {
        throw new ProjectFabricCoreError(
          "RECOVERY_REQUIRED",
          `stored workstream state is outside the closed contract: ${state}`,
        );
      }
      return {
        workstreamId: parseIdentifier<"WorkstreamId">(
          text(workstream, "workstream_id"),
          "runIdentity.workstreamId",
        ),
        deliveryRunId: parseIdentifier<"DeliveryRunId">(
          text(workstream, "delivery_run_id"),
          "runIdentity.deliveryRunId",
        ),
        leadAgentId: parseIdentifier<"AgentId">(
          text(workstream, "lead_agent_id"),
          "runIdentity.leadAgentId",
        ),
        state,
        lastEventAt: toTimestamp(integer(workstream, "updated_at"), "runIdentity.workstreamLastEventAt"),
      };
    });
    const lastEvent = this.#database.prepare(`
      SELECT MAX(created_at) AS last_event_at FROM events WHERE run_id=?
    `).get(runId);
    const lastEventAt = isRow(lastEvent) &&
        typeof lastEvent.last_event_at === "number" &&
        Number.isSafeInteger(lastEvent.last_event_at)
      ? lastEvent.last_event_at
      : integer(run, "created_at");
    return {
      runKind: "coordination",
      chairAgentId: parseIdentifier<"AgentId">(text(run, "chair_agent_id"), "runIdentity.chairAgentId"),
      workstreams,
      lastEventAt: toTimestamp(lastEventAt, "runIdentity.lastEventAt"),
    };
  }

  /**
   * Server-scoped task-state counts for one run, read in the caller's open
   * transaction. No run-level finite plan denominator exists yet, so the
   * daemon declares the open arm; a task ledger it cannot classify fails
   * closed to the unknown arm rather than dropping tasks from the counts.
   */
  #declaredRunProgress(runId: string): DeclaredRunProgress {
    const counts = {
      blocked: 0,
      ready: 0,
      active: 0,
      complete: 0,
      cancelled: 0,
      degraded: 0,
    };
    const values = this.#database.prepare(`
      SELECT state, COUNT(*) AS tasks FROM tasks WHERE run_id=? GROUP BY state
    `).all(runId);
    for (const value of values) {
      const stored = row(value, "run task-state count");
      const state = text(stored, "state");
      if (!Object.hasOwn(counts, state)) {
        return { plan: "unknown", reason: `unrecognised task state: ${state}` };
      }
      counts[state as keyof typeof counts] = integer(stored, "tasks");
    }
    return { plan: "open", counts };
  }

  #loadTaskDetail(
    detailRef: Extract<OperatorDetailRef, { kind: "task" }>,
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
  ): LoadedOperatorDetail {
    const task = this.#oneScopedRow(`
      SELECT t.*, r.project_session_id FROM tasks t
      JOIN runs r ON r.run_id=t.run_id
      JOIN project_sessions s ON s.project_session_id=r.project_session_id
      WHERE t.task_id=? AND s.project_id=?
        AND (? IS NULL OR r.project_session_id=?)
    `, [detailRef.taskId, projectId, projectSessionId ?? null, projectSessionId ?? null], "task detail");
    const ownerAgentId = nullableText(task, "owner_agent_id");
    return {
      revision: integer(task, "revision"),
      observedAt: toTimestamp(this.#clock(), "taskDetail.observedAt"),
      detail: {
        kind: "task",
        taskId: detailRef.taskId,
        objective: text(task, "objective"),
        state: text(task, "state"),
        ownerAgentId: ownerAgentId === null
          ? null
          : parseIdentifier<"AgentId">(ownerAgentId, "taskDetail.ownerAgentId"),
      },
    };
  }

  #loadAgentDetail(
    detailRef: Extract<OperatorDetailRef, { kind: "agent" }>,
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
  ): LoadedOperatorDetail {
    const agent = this.#oneScopedRow(`
      SELECT a.*, r.project_session_id, r.chair_agent_id,
             COALESCE(ps.provider_session_generation, 1) AS provider_generation,
             COALESCE(ab.adapter_id, 'unbound') AS provider
        FROM agents a
        JOIN runs r ON r.run_id=a.run_id
        JOIN project_sessions s ON s.project_session_id=r.project_session_id
        LEFT JOIN provider_state ps ON ps.run_id=a.run_id AND ps.agent_id=a.agent_id
        LEFT JOIN agent_adapter_bindings ab ON ab.run_id=a.run_id AND ab.agent_id=a.agent_id
       WHERE a.agent_id=? AND s.project_id=?
         AND (? IS NULL OR r.project_session_id=?)
    `, [detailRef.agentId, projectId, projectSessionId ?? null, projectSessionId ?? null], "agent detail");
    const generation = integer(agent, "provider_generation");
    return {
      revision: generation,
      observedAt: toTimestamp(this.#clock(), "agentDetail.observedAt"),
      detail: {
        kind: "agent",
        agentId: detailRef.agentId,
        role: this.#agentRole(
          text(agent, "run_id"),
          detailRef.agentId,
          text(agent, "chair_agent_id"),
        ),
        lifecycle: text(agent, "lifecycle"),
        provider: text(agent, "provider"),
        providerSessionGeneration: generation,
      },
    };
  }

  #loadEvidenceDetail(
    detailRef: Extract<OperatorDetailRef, { kind: "evidence" }>,
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
  ): LoadedOperatorDetail {
    const artifact = row(this.#database.prepare(this.#registryV1 ? `
      SELECT * FROM artifacts
       WHERE artifact_id=? AND project_id=? AND registry_state='active'
         AND (? IS NULL OR project_session_id IS NULL OR project_session_id=?)
    ` : `
      SELECT a.*, r.project_session_id, 1 AS revision,
             'artifact' AS evidence_kind, 'agent' AS publisher_kind,
             a.publisher_agent_id AS publisher_ref, 'run-file' AS source_kind
        FROM artifacts a
        JOIN runs r ON r.run_id=a.run_id
        JOIN project_sessions s ON s.project_session_id=r.project_session_id
       WHERE a.artifact_id=? AND s.project_id=?
         AND (? IS NULL OR r.project_session_id=?)
    `).get(detailRef.evidenceId, projectId, projectSessionId ?? null, projectSessionId ?? null), "evidence detail");
    const revision = integer(artifact, "revision");
    return {
      revision,
      observedAt: toTimestamp(integer(artifact, "created_at"), "evidenceDetail.observedAt"),
      detail: {
        kind: "evidence",
        evidenceId: detailRef.evidenceId,
        evidenceKind: text(artifact, "evidence_kind") as "artifact" | "diff" | "test" | "review" | "receipt",
        artifactRef: parseArtifactRef({
          path: text(artifact, "relative_path"),
          digest: text(artifact, "sha256"),
        }, "evidenceDetail.artifactRef"),
        sourceKind: text(artifact, "source_kind") as "project-file" | "run-file" | "git-private-diff",
        publisherKind: text(artifact, "publisher_kind") as "agent" | "operator" | "fabric" | "project",
        publisherRef: text(artifact, "publisher_ref"),
        projectSessionId: nullableText(artifact, "project_session_id") as never,
        coordinationRunId: nullableText(artifact, "run_id") as never,
        taskId: nullableText(artifact, "task_id") as never,
        createdAt: toTimestamp(integer(artifact, "created_at"), "evidenceDetail.createdAt"),
        status: "informational",
      },
    };
  }

  #loadActivityDetail(
    detailRef: Extract<OperatorDetailRef, { kind: "activity" }>,
    projectId: ProjectId,
    projectSessionId: ProjectSessionId | undefined,
  ): LoadedOperatorDetail {
    const event = row(this.#database.prepare(`
      SELECT e.*, seq.sequence, r.project_session_id FROM events e
      JOIN observer_event_sequence seq ON seq.event_id=e.event_id
      JOIN runs r ON r.run_id=e.run_id
      JOIN project_sessions s ON s.project_session_id=r.project_session_id
      WHERE e.event_id=? AND s.project_id=?
        AND (? IS NULL OR r.project_session_id=?)
    `).get(detailRef.eventId, projectId, projectSessionId ?? null, projectSessionId ?? null), "activity detail");
    const occurredAt = toTimestamp(integer(event, "created_at"), "activityDetail.occurredAt");
    const kind = activityKind(text(event, "type"));
    const detail: OperatorDetail = kind === "message"
      ? {
          kind: "activity",
          eventId: detailRef.eventId,
          activityKind: "message",
          summary: text(event, "type"),
          occurredAt,
          messageBodyRef: this.#messageBodyRef(event),
        }
      : {
          kind: "activity",
          eventId: detailRef.eventId,
          activityKind: kind,
          summary: text(event, "type"),
          occurredAt,
        };
    return {
      revision: integer(event, "sequence"),
      observedAt: occurredAt,
      detail,
    };
  }

  #messageBodyRef(event: Row): MessageBodyRef {
    const payload = jsonObject(text(event, "payload_json"), "message activity payload");
    if (typeof payload.messageId !== "string") {
      throw new Error("message activity has no exact message ID binding");
    }
    if (!isRow(this.#database.prepare(`
      SELECT message_id FROM messages WHERE run_id=? AND message_id=?
    `).get(text(event, "run_id"), payload.messageId))) {
      throw new Error("message activity references a message outside its run");
    }
    return {
      projectSessionId: parseIdentifier<"ProjectSessionId">(
        text(event, "project_session_id"),
        "messageBodyRef.projectSessionId",
      ),
      messageId: parseIdentifier<"MessageId">(payload.messageId, "messageBodyRef.messageId"),
      expectedRevision: 1,
    };
  }

  #loadSystemDetail(
    detailRef: Extract<OperatorDetailRef, { kind: "system" }>,
    projectId: ProjectId,
  ): LoadedOperatorDetail {
    this.#projectRow(projectId);
    const integration = row(this.#database.prepare(`
      SELECT * FROM integration_availability WHERE integration_id=?
    `).get(detailRef.componentId), "system detail");
    const contract = jsonObject(text(integration, "discovered_contract_json"), "integration contract");
    const generation = contractGeneration(contract);
    return {
      revision: generation,
      observedAt: toTimestamp(integer(integration, "checked_at"), "systemDetail.observedAt"),
      detail: {
        kind: "system",
        componentId: detailRef.componentId,
        systemKind: "integration",
        state: systemState(text(integration, "state")),
        generation,
        detail: typeof contract.detail === "string" ? contract.detail : `Integration ${detailRef.componentId}`,
      },
    };
  }

  #oneScopedRow(sql: string, bindings: readonly (string | number | null)[], label: string): Row {
    const values = this.#database.prepare(sql).all(...bindings);
    if (values.length !== 1) {
      throw new ProjectFabricCoreError(
        values.length === 0 ? "NOT_FOUND" : "CONFLICT",
        values.length === 0 ? `${label} was not found in scope` : `${label} is ambiguous in scope`,
      );
    }
    return row(values[0], label);
  }

  #assertDetailSession(detailSessionId: ProjectSessionId, selectedSessionId: ProjectSessionId | undefined): void {
    if (selectedSessionId !== undefined && detailSessionId !== selectedSessionId) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "detail belongs to another project session");
    }
  }

  #agentRole(runId: string, agentId: string, chairAgentId: string): "chair" | "lead" | "worker" | "reviewer" {
    if (agentId === chairAgentId) return "chair";
    if (isRow(this.#database.prepare(`
      SELECT workstream_id FROM workstreams WHERE coordination_run_id=? AND lead_agent_id=? LIMIT 1
    `).get(runId, agentId))) return "lead";
    if (isRow(this.#database.prepare(`
      SELECT evidence_id FROM cross_family_review_evidence WHERE run_id=? AND reviewer_agent_id=? LIMIT 1
    `).get(runId, agentId))) return "reviewer";
    return "worker";
  }

  #projectGoal(projectId: ProjectId): string {
    const value = this.#database.prepare(`
      SELECT summary FROM intakes WHERE project_id=? AND state='accepted'
      ORDER BY updated_at DESC, intake_id LIMIT 1
    `).get(projectId);
    return isRow(value) ? text(value, "summary") : "No accepted project goal recorded";
  }

  #acceptedScopeRef(projectId: ProjectId): ArtifactRef | null {
    if (!this.#registryV1) return null;
    const value = this.#database.prepare(`
      SELECT artifact.relative_path, artifact.sha256
        FROM intakes intake
        JOIN artifacts artifact ON artifact.artifact_id=intake.accepted_scope_artifact_id
       WHERE intake.project_id=? AND intake.state='accepted'
         AND intake.accepted_scope_state='bound' AND artifact.registry_state='active'
       ORDER BY intake.updated_at DESC, intake.intake_id LIMIT 1
    `).get(projectId);
    if (!isRow(value)) return null;
    return parseArtifactRef({
      path: text(value, "relative_path"),
      digest: text(value, "sha256"),
    }, "project.acceptedScopeRef");
  }
}

function liveFact<T>(revision: number, observedAt: Timestamp, value: T): ProjectionFact<T> {
  return { freshness: "live", source: "fabric", revision, observedAt, value };
}

function toTimestamp(milliseconds: number, path: string): Timestamp {
  return parseTimestamp(new Date(milliseconds).toISOString(), path);
}

function assertPageBounds(after: number, limit: number): void {
  if (!Number.isSafeInteger(after) || after < 0) throw new TypeError("projection cursor must be a non-negative safe integer");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError("projection page limit must be a safe integer from 1 to 100");
  }
}

function readTransactionId(projectId: ProjectId, projectSessionId: ProjectSessionId | undefined, revision: number): string {
  return `projection:${projectId}:${projectSessionId ?? "project"}:${String(revision)}`;
}

function runHealth(phase: string): RunProjection["health"] {
  if (phase === "active" || phase === "awaiting_acceptance") return "healthy";
  if (phase === "quarantined") return "quarantined";
  if (phase === "recovery_required" || phase === "launch_ambiguous") return "blocked";
  if (phase === "visibility_degraded" || phase === "reconciling") return "degraded";
  return "unknown";
}

function nextMilestone(phase: string): string {
  if (phase === "active") return "quiescing";
  if (phase === "quiescing") return "awaiting_acceptance";
  if (phase === "awaiting_acceptance") return "closed";
  if (phase === "reconciling" || phase === "launch_ambiguous") return "reconciled state";
  return "next valid lifecycle transition";
}

function maximumRevision(revisions: readonly number[]): number {
  return revisions.length === 0 ? 0 : Math.max(...revisions);
}

function runRevision(runId: RunProjection["runId"], database: Database.Database): number {
  return integer(row(database.prepare("SELECT revision FROM runs WHERE run_id=?").get(runId), "run"), "revision");
}

function jsonObject(serialized: string, label: string): Row {
  const parsed: unknown = JSON.parse(serialized);
  if (!isRow(parsed)) throw new Error(`${label} is not an object`);
  return parsed;
}

function attentionLabel(kind: string): AttentionItem["label"] {
  if (kind === "approval") return "Approval";
  if (kind === "decision" || kind === "consequential-gate") return "Decision";
  if (kind === "blocked" || kind === "quarantine") return "Blocked";
  return "FYI";
}

function attentionPriority(value: unknown, severity: string): AttentionItem["priority"] {
  if (
    value === "safety-integrity" ||
    value === "critical-path" ||
    value === "expiring-authority" ||
    value === "acceptance-ready" ||
    value === "advisory"
  ) return value;
  return severity === "critical" ? "critical-path" : "advisory";
}

function actionAvailability(authenticated: AuthenticatedOperatorCredential): OperatorActionAvailability {
  const actions: OperatorAvailableAction[] = [];
  for (const action of authenticated.actions) {
    if (action === "launch") {
      actions.push("project-session-launch");
    } else if (action === "takeover") {
      actions.push("chair-bridge-recovery");
    } else if (action === "pause" || action === "resume" || action === "cancel" || action === "steer" || action === "git") {
      actions.push(action);
    } else if (action === "drain") {
      actions.push("project-session-drain", "daemon-drain");
    } else if (action === "stop") {
      actions.push("project-session-stop", "daemon-stop");
    } else if (action === "external-effect") {
      actions.push("registered-external-effect", "promotion");
    }
  }
  return actions.length === 0
    ? { state: "read-only", reason: "authority-insufficient" }
    : { state: "available", actions, requiresPreview: true };
}

function activityKind(type: string): "message" | "decision" | "lifecycle" | "operation" {
  if (type.includes("message")) return "message";
  if (type.includes("decision") || type.includes("gate") || type.includes("approval")) return "decision";
  if (
    type.includes("lifecycle") ||
    type.includes("launch") ||
    type.includes("quiesc") ||
    type.includes("closed") ||
    type.includes("cancel")
  ) return "lifecycle";
  return "operation";
}

function systemState(state: string): "healthy" | "stale" | "unavailable" {
  if (state === "available") return "healthy";
  if (state === "stale") return "stale";
  if (state === "unavailable") return "unavailable";
  throw new Error("stored integration availability state is invalid");
}

function contractGeneration(contract: Row): number {
  return typeof contract.generation === "number" &&
    Number.isSafeInteger(contract.generation) &&
    contract.generation >= 1
    ? contract.generation
    : 1;
}

function assertNever(value: never): never {
  throw new Error(`unhandled operator projection variant: ${JSON.stringify(value)}`);
}

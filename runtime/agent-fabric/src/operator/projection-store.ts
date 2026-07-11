import type {
  AttentionItem,
  ArtifactRef,
  ConsoleView,
  JsonValue,
  MessageBodyReadRequest,
  MessageBodyReadResult,
  OperatorDetailReadRequest,
  OperatorDetailReadResult,
  OperatorDetail,
  OperatorDetailRef,
  OperatorProjectionSnapshot,
  OperatorViewRow,
  OperatorActionAvailability,
  OperatorAvailableAction,
  ProjectionFact,
  ProjectionSnapshotRequest,
  ProjectId,
  ProjectSession,
  ProjectSessionDiscovery,
  ProjectSessionId,
  OperatorViewPageRequest,
  OperatorViewPageResult,
  ProjectDiscoveryRequest,
  ProjectDiscoveryResult,
  ProjectionEventsRequest,
  ProjectionEventsResult,
  ProjectionEvent,
  RunProjection,
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

import { ProjectFabricCoreError, type CoreServiceOptions } from "../project-session/contracts.js";
import { digest, integer, isRow, nullableText, row, text, type Row } from "../project-session/store-support.js";
import type { AuthenticatedOperatorCredential, OperatorStore } from "./store.js";
import { renderSafeMessageBody } from "./message-safety.js";

export type OperatorProjectionStoreOptions = CoreServiceOptions & {
  operatorStore: OperatorStore;
};

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

  constructor(options: OperatorProjectionStoreOptions) {
    this.#database = options.database;
    this.#operatorStore = options.operatorStore;
    this.#clock = options.clock ?? Date.now;
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

  snapshot(request: ProjectionSnapshotRequest): OperatorProjectionSnapshot {
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
      const runs = this.#runs(request.projectId, selectedSessionId);
      const attention = this.#attention(request.projectId, selectedSessionId);
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

  viewPage(request: OperatorViewPageRequest): OperatorViewPageResult {
    const authenticated = this.#authoriseRead(request.credential, request.projectId, request.projectSessionId);
    const selectedSessionId = this.#selectedSessionId(authenticated, request.projectSessionId);
    assertPageBounds(request.cursor, request.limit);
    switch (request.view) {
      case "attention": return this.#viewPage(request, "attention", () => (
        this.#attentionRows(request.projectId, selectedSessionId, authenticated)
      ), selectedSessionId);
      case "project": return this.#viewPage(request, "project", () => (
        this.#projectRows(request.projectId, authenticated)
      ), selectedSessionId);
      case "runs": return this.#viewPage(request, "runs", () => (
        this.#runRows(request.projectId, selectedSessionId, authenticated)
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

  detail(request: OperatorDetailReadRequest): OperatorDetailReadResult {
    const authenticated = this.#authoriseRead(request.credential, request.projectId, request.projectSessionId);
    const selectedSessionId = this.#selectedSessionId(authenticated, request.projectSessionId);
    const read = this.#database.transaction((): OperatorDetailReadResult => {
      const currentSnapshotRevision = this.#globalRevision();
      if (request.snapshotRevision !== currentSnapshotRevision) {
        return { status: "resnapshot-required", reason: "snapshot-mismatch", currentSnapshotRevision };
      }
      const loaded = this.#loadDetail(request.detailRef, request.projectId, selectedSessionId);
      if (request.detailRef.expectedRevision !== loaded.revision) {
        return {
          status: "resnapshot-required",
          reason: "detail-revision-changed",
          currentSnapshotRevision,
        };
      }
      return {
        status: "current",
        detailRef: request.detailRef,
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
    const origin = originKind === "operator-launch"
      ? {
          kind: "operator-launch",
          operatorId: text(stored, "origin_operator_id"),
        }
      : originKind === "legacy-migration"
        ? {
            kind: "legacy-migration",
            migrationManifestRef: JSON.parse(text(stored, "migration_manifest_ref")),
          }
        : (() => { throw new Error("stored project-session origin is invalid"); })();
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

  #runs(projectId: ProjectId, projectSessionId?: ProjectSessionId): RunProjection[] {
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
        runId: parseIdentifier<"CoordinationRunId">(text(run, "run_id"), "projectionSnapshot.runId"),
        phase,
        chairAgentId: parseIdentifier<"AgentId">(text(run, "chair_agent_id"), "projectionSnapshot.chairAgentId"),
        nextMilestone: nextMilestone(phase),
        health: runHealth(phase),
      };
    });
  }

  #attention(projectId: ProjectId, projectSessionId?: ProjectSessionId): AttentionItem[] {
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
      return {
        itemId: text(item, "item_id"),
        itemRevision: revision,
        fact: liveFact(revision, toTimestamp(integer(item, "updated_at"), "attentionRow.observedAt"), {
          summary: { kind: "attention", label, priority, title },
          detailRef,
          actionAvailability: availability,
        }),
      };
    });
  }

  #sessionRevision(projectSessionId: string): number {
    return integer(row(this.#database.prepare(`
      SELECT revision FROM project_sessions WHERE project_session_id=?
    `).get(projectSessionId), "project session"), "revision");
  }

  #projectRows(projectId: ProjectId, authenticated: AuthenticatedOperatorCredential): OperatorViewRow<"project">[] {
    const project = this.#projectRow(projectId);
    const revision = integer(project, "revision");
    const goal = this.#projectGoal(projectId);
    return [{
      itemId: text(project, "project_id"),
      itemRevision: revision,
      fact: liveFact(revision, toTimestamp(integer(project, "updated_at"), "projectRow.observedAt"), {
        summary: {
          kind: "project",
          goal,
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
  ): OperatorViewRow<"runs">[] {
    return this.#rowsForRuns(projectId, projectSessionId).map((run): OperatorViewRow<"runs"> => {
      const phase = text(run, "lifecycle_state");
      const revision = integer(run, "revision");
      const runId = parseIdentifier<"CoordinationRunId">(text(run, "run_id"), "runRow.runId");
      return {
        itemId: runId,
        itemRevision: revision,
        fact: liveFact(revision, toTimestamp(integer(run, "created_at"), "runRow.observedAt"), {
          summary: { kind: "run", phase, health: runHealth(phase), nextMilestone: nextMilestone(phase) },
          detailRef: { kind: "run", coordinationRunId: runId, expectedRevision: revision },
          actionAvailability: actionAvailability(authenticated),
        }),
      };
    });
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
    const values = this.#sessionQuery(
      projectId,
      projectSessionId,
      `SELECT a.*, r.project_session_id FROM artifacts a JOIN runs r ON r.run_id=a.run_id`,
      "ORDER BY a.created_at DESC, a.artifact_id",
    );
    return values.map((artifact): OperatorViewRow<"evidence"> => {
      const evidenceId = text(artifact, "artifact_id");
      return {
        itemId: evidenceId,
        itemRevision: 1,
        fact: liveFact(1, toTimestamp(integer(artifact, "created_at"), "evidenceRow.observedAt"), {
          summary: {
            kind: "evidence",
            evidenceKind: "artifact",
            status: "informational",
            provenance: `fabric:${text(artifact, "publisher_agent_id")}`,
          },
          detailRef: { kind: "evidence", evidenceId, expectedRevision: 1 },
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
      return {
        itemId: eventId,
        itemRevision: sequence,
        fact: liveFact(sequence, occurredAt, {
          summary: { kind: "activity", activityKind: kind, summary: text(event, "type"), occurredAt },
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
  ): LoadedOperatorDetail {
    switch (detailRef.kind) {
      case "project": return this.#loadProjectDetail(detailRef, projectId);
      case "session": return this.#loadSessionDetail(detailRef, projectId, projectSessionId);
      case "run": return this.#loadRunDetail(detailRef, projectId, projectSessionId);
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
  ): LoadedOperatorDetail {
    const stored = row(this.#database.prepare(`
      SELECT r.* FROM runs r
      JOIN project_sessions s ON s.project_session_id=r.project_session_id
      WHERE r.run_id=? AND s.project_id=?
        AND (? IS NULL OR r.project_session_id=?)
    `).get(detailRef.coordinationRunId, projectId, projectSessionId ?? null, projectSessionId ?? null), "run detail");
    const revision = integer(stored, "revision");
    const phase = text(stored, "lifecycle_state");
    return {
      revision,
      observedAt: toTimestamp(integer(stored, "created_at"), "runDetail.observedAt"),
      detail: {
        kind: "run",
        coordinationRunId: detailRef.coordinationRunId,
        phase,
        chairAgentId: parseIdentifier<"AgentId">(text(stored, "chair_agent_id"), "runDetail.chairAgentId"),
        chairGeneration: integer(stored, "chair_generation"),
        health: runHealth(phase),
      },
    };
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
    const artifact = row(this.#database.prepare(`
      SELECT a.* FROM artifacts a
      JOIN runs r ON r.run_id=a.run_id
      JOIN project_sessions s ON s.project_session_id=r.project_session_id
      WHERE a.artifact_id=? AND s.project_id=?
        AND (? IS NULL OR r.project_session_id=?)
    `).get(detailRef.evidenceId, projectId, projectSessionId ?? null, projectSessionId ?? null), "evidence detail");
    return {
      revision: 1,
      observedAt: toTimestamp(integer(artifact, "created_at"), "evidenceDetail.observedAt"),
      detail: {
        kind: "evidence",
        evidenceId: detailRef.evidenceId,
        evidenceKind: "artifact",
        artifactRef: parseArtifactRef({
          path: text(artifact, "relative_path"),
          digest: text(artifact, "sha256"),
        }, "evidenceDetail.artifactRef"),
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
      SELECT e.*, seq.sequence FROM events e
      JOIN observer_event_sequence seq ON seq.event_id=e.event_id
      JOIN runs r ON r.run_id=e.run_id
      JOIN project_sessions s ON s.project_session_id=r.project_session_id
      WHERE e.event_id=? AND s.project_id=?
        AND (? IS NULL OR r.project_session_id=?)
    `).get(detailRef.eventId, projectId, projectSessionId ?? null, projectSessionId ?? null), "activity detail");
    const occurredAt = toTimestamp(integer(event, "created_at"), "activityDetail.occurredAt");
    return {
      revision: integer(event, "sequence"),
      observedAt: occurredAt,
      detail: {
        kind: "activity",
        eventId: detailRef.eventId,
        activityKind: activityKind(text(event, "type")),
        summary: text(event, "type"),
        occurredAt,
      },
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
  if (kind === "decision") return "Decision";
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
    if (action === "pause" || action === "resume" || action === "cancel" || action === "steer" || action === "git") {
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

import {
  parseProjectSession,
  type MembershipBindRequest,
  type MembershipBindResult,
  type ProjectSession,
  type ProjectSessionCloseRequest,
  type ProjectSessionCreateRequest,
  type ProjectSessionGetRequest,
  type ProjectSessionMember,
  type ProjectSessionState,
  type ProjectSessionTransitionRequest,
  type ProjectId,
  type ProjectSessionId,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import { OperatorStore } from "../operator/store.js";
import {
  ProjectFabricCoreError,
  type AuthenticatedOperatorContext,
  type CoreServiceOptions,
} from "./contracts.js";
import { canonicalJson, integer, nullableText, row, text, type Row } from "./store-support.js";

const legalTransitions: Readonly<Record<ProjectSessionState, readonly ProjectSessionState[]>> = {
  draft: ["awaiting_launch", "cancelled"],
  awaiting_launch: ["launching", "launch_failed", "cancelled"],
  launching: ["active", "launch_failed", "launch_ambiguous", "cancelled"],
  active: ["quiescing", "visibility_degraded", "reconciling", "recovery_required", "quarantined", "cancelled"],
  quiescing: ["awaiting_acceptance", "active", "reconciling", "recovery_required", "quarantined", "cancelled"],
  awaiting_acceptance: ["active", "reconciling", "cancelled"],
  closed: [],
  launch_failed: ["awaiting_launch", "cancelled"],
  launch_ambiguous: ["launching", "active", "reconciling", "recovery_required", "cancelled"],
  reconciling: ["active", "recovery_required", "quarantined", "cancelled"],
  visibility_degraded: ["active", "quiescing", "reconciling", "cancelled"],
  recovery_required: ["reconciling", "active", "quarantined", "cancelled"],
  quarantined: ["reconciling", "recovery_required", "cancelled"],
  cancelled: [],
};

export class ProjectSessionStore {
  readonly #database: Database.Database;
  readonly #operatorStore: OperatorStore;
  readonly #clock: () => number;
  readonly #fault: (label: string) => void;

  constructor(options: CoreServiceOptions & { operatorStore: OperatorStore }) {
    this.#database = options.database;
    this.#operatorStore = options.operatorStore;
    this.#clock = options.clock ?? Date.now;
    this.#fault = options.fault ?? (() => undefined);
  }

  createProjectSession(
    context: AuthenticatedOperatorContext,
    request: ProjectSessionCreateRequest,
  ): ProjectSession {
    return this.#operatorStore.executeCommand(
      context,
      request.command,
      { projectId: request.projectId, requiredAction: "launch" },
      () => this.#projectRevision(request.projectId),
      () => {
        this.#fault("session:create");
        const now = this.#clock();
        this.#database.prepare(`
          INSERT INTO project_sessions(
            project_session_id, project_id, mode, state, revision, generation,
            authority_ref, budget_ref, launch_packet_path, launch_packet_digest,
            membership_revision, origin_kind, origin_operator_id,
            migration_manifest_ref, terminal_path_json, created_at, updated_at
          ) VALUES (?, ?, ?, 'draft', 1, 1, ?, ?, ?, ?, 1, 'operator-launch', ?, NULL, NULL, ?, ?)
        `).run(
          request.projectSessionId,
          request.projectId,
          request.mode,
          request.authorityRef,
          request.budgetRef,
          request.launchPacketRef.path,
          request.launchPacketRef.digest,
          context.operatorId,
          now,
          now,
        );
        this.#database.prepare(`
          UPDATE projects SET revision=revision+1, updated_at=? WHERE project_id=?
        `).run(now, request.projectId);
        return this.getProjectSession({
          projectId: request.projectId,
          projectSessionId: request.projectSessionId,
          expectedGeneration: 1,
        });
      },
    );
  }

  getProjectSession(request: ProjectSessionGetRequest): ProjectSession {
    const stored = row(this.#database.prepare(`
      SELECT * FROM project_sessions WHERE project_session_id=? AND project_id=?
    `).get(request.projectSessionId, request.projectId), "project session");
    if (integer(stored, "generation") !== request.expectedGeneration) {
      throw new ProjectFabricCoreError("STALE_GENERATION", "project-session generation changed");
    }
    return this.#sessionFromRow(stored);
  }

  transitionProjectSession(
    context: AuthenticatedOperatorContext,
    request: ProjectSessionTransitionRequest,
  ): ProjectSession {
    const identity = this.#sessionIdentity(request.projectSessionId);
    return this.#operatorStore.executeCommand(
      context,
      request.command,
      {
        projectId: identity.projectId,
        projectSessionId: request.projectSessionId,
        sessionGeneration: request.expectedGeneration,
        requiredAction: "decide",
      },
      () => this.#sessionRevision(request.projectSessionId),
      () => {
        const current = this.#sessionIdentity(request.projectSessionId);
        if (current.generation !== request.expectedGeneration) {
          throw new ProjectFabricCoreError("STALE_GENERATION", "project-session generation changed");
        }
        if (!legalTransitions[current.state].includes(request.transition.to)) {
          throw new ProjectFabricCoreError(
            "LIFECYCLE_PRECONDITION_FAILED",
            `illegal project-session transition ${current.state} -> ${request.transition.to}`,
          );
        }
        this.#fault("session:transition");
        this.#database.prepare(`
          UPDATE project_sessions
             SET state=?, revision=revision+1, updated_at=?
           WHERE project_session_id=? AND revision=? AND generation=?
        `).run(
          request.transition.to,
          this.#clock(),
          request.projectSessionId,
          current.revision,
          request.expectedGeneration,
        );
        return this.getProjectSession({
          projectId: current.projectId as ProjectId,
          projectSessionId: request.projectSessionId,
          expectedGeneration: request.expectedGeneration,
        });
      },
    );
  }

  closeProjectSession(
    context: AuthenticatedOperatorContext,
    request: ProjectSessionCloseRequest,
  ): ProjectSession {
    const identity = this.#sessionIdentity(request.projectSessionId);
    return this.#operatorStore.executeCommand(
      context,
      request.command,
      {
        projectId: identity.projectId,
        projectSessionId: request.projectSessionId,
        sessionGeneration: request.expectedGeneration,
        requiredAction: "decide",
      },
      () => this.#sessionRevision(request.projectSessionId),
      () => {
        const current = this.#sessionIdentity(request.projectSessionId);
        if (current.state !== "awaiting_acceptance" && request.terminalPath.kind === "accepted") {
          throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "accepted close requires awaiting acceptance");
        }
        this.#assertClosure(request.projectSessionId);
        this.#fault("session:close");
        this.#database.prepare(`
          UPDATE project_sessions
             SET state='closed', terminal_path_json=?, revision=revision+1, updated_at=?
           WHERE project_session_id=? AND revision=? AND generation=?
        `).run(
          canonicalJson(request.terminalPath),
          this.#clock(),
          request.projectSessionId,
          current.revision,
          request.expectedGeneration,
        );
        return this.getProjectSession({
          projectId: current.projectId as ProjectId,
          projectSessionId: request.projectSessionId,
          expectedGeneration: request.expectedGeneration,
        });
      },
    );
  }

  bindMembership(
    context: AuthenticatedOperatorContext,
    request: MembershipBindRequest,
  ): MembershipBindResult {
    if (request.origin !== "operator") {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "chair membership wiring is integrated by the serial chair");
    }
    const identity = this.#sessionIdentity(request.projectSessionId);
    return this.#operatorStore.executeCommand(
      context,
      request.command,
      {
        projectId: identity.projectId,
        projectSessionId: request.projectSessionId,
        sessionGeneration: identity.generation,
        requiredAction: "decide",
      },
      () => this.#membershipRevision(request.projectSessionId),
      () => {
        const session = this.#sessionIdentity(request.projectSessionId);
        if (session.state === "quiescing" || session.state === "awaiting_acceptance" || session.state === "closed") {
          throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "project-session membership is frozen");
        }
        if (session.membershipRevision !== request.expectedMembershipRevision) {
          throw new ProjectFabricCoreError("STALE_REVISION", "membership revision changed");
        }
        this.#assertRun(request.projectSessionId, request.coordinationRunId);
        for (const member of request.members) {
          this.#assertMemberTarget(request.coordinationRunId, member);
          const disposition = member.state === "terminal" ? "reconciled" : member.state;
          this.#database.prepare(`
            INSERT INTO project_session_memberships(
              project_session_id, coordination_run_id, member_kind, member_id,
              required, state, revision, abandoned_reason, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 1, ?, 1, ?, ?, ?)
            ON CONFLICT(project_session_id, coordination_run_id, member_kind, member_id)
            DO UPDATE SET state=excluded.state,
                          revision=project_session_memberships.revision+1,
                          abandoned_reason=excluded.abandoned_reason,
                          updated_at=excluded.updated_at
          `).run(
            request.projectSessionId,
            request.coordinationRunId,
            member.kind,
            this.#memberId(member),
            disposition,
            member.state === "abandoned" ? member.reason : null,
            this.#clock(),
            this.#clock(),
          );
        }
        this.#fault("session:membership");
        this.#database.prepare(`
          UPDATE project_sessions
             SET membership_revision=membership_revision+1, revision=revision+1, updated_at=?
           WHERE project_session_id=? AND membership_revision=?
        `).run(this.#clock(), request.projectSessionId, request.expectedMembershipRevision);
        return {
          projectSessionId: request.projectSessionId,
          coordinationRunId: request.coordinationRunId,
          membershipRevision: request.expectedMembershipRevision + 1,
          members: request.members,
        };
      },
    );
  }

  #projectRevision(projectId: string): { revision: number; value: { projectId: string; revision: number } } {
    const project = row(this.#database.prepare("SELECT revision FROM projects WHERE project_id=?").get(projectId), "project");
    const revision = integer(project, "revision");
    return { revision, value: { projectId, revision } };
  }

  #sessionRevision(projectSessionId: string): { revision: number; value: ProjectSession } {
    const identity = this.#sessionIdentity(projectSessionId);
    const value = this.getProjectSession({
      projectId: identity.projectId as ProjectId,
      projectSessionId: projectSessionId as ProjectSessionId,
      expectedGeneration: identity.generation,
    });
    return { revision: identity.revision, value };
  }

  #membershipRevision(projectSessionId: string): { revision: number; value: { membershipRevision: number } } {
    const identity = this.#sessionIdentity(projectSessionId);
    return { revision: identity.membershipRevision, value: { membershipRevision: identity.membershipRevision } };
  }

  #sessionIdentity(projectSessionId: string): {
    projectId: string;
    state: ProjectSessionState;
    revision: number;
    generation: number;
    membershipRevision: number;
  } {
    const stored = row(this.#database.prepare(`
      SELECT project_id, state, revision, generation, membership_revision
        FROM project_sessions WHERE project_session_id=?
    `).get(projectSessionId), "project session");
    return {
      projectId: text(stored, "project_id"),
      state: text(stored, "state") as ProjectSessionState,
      revision: integer(stored, "revision"),
      generation: integer(stored, "generation"),
      membershipRevision: integer(stored, "membership_revision"),
    };
  }

  #sessionFromRow(stored: Row): ProjectSession {
    const state = text(stored, "state") as ProjectSessionState;
    const origin = text(stored, "origin_kind") === "operator-launch"
      ? { kind: "operator-launch" as const, operatorId: text(stored, "origin_operator_id") }
      : { kind: "legacy-migration" as const, migrationManifestRef: JSON.parse(text(stored, "migration_manifest_ref")) };
    const base = {
      projectSessionId: text(stored, "project_session_id"),
      projectId: text(stored, "project_id"),
      mode: text(stored, "mode") as "coordinated" | "independent",
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
    };
    const terminal = nullableText(stored, "terminal_path_json");
    if (state === "closed") {
      if (terminal === null) throw new Error("closed session has no terminal path");
      return parseProjectSession({ ...base, state, terminalPath: JSON.parse(terminal) });
    }
    if (state === "cancelled") {
      if (terminal === null) throw new Error("cancelled session has no terminal path");
      return parseProjectSession({ ...base, state, terminalPath: JSON.parse(terminal) });
    }
    return parseProjectSession({ ...base, state });
  }

  #assertClosure(projectSessionId: string): void {
    const blocker = this.#database.prepare(`
      SELECT member_kind, member_id FROM project_session_memberships
       WHERE project_session_id=? AND required=1 AND state='active' LIMIT 1
    `).get(projectSessionId);
    if (blocker !== undefined) {
      throw new ProjectFabricCoreError("BARRIER_PRECONDITION_FAILED", "required project-session membership remains active");
    }
  }

  #assertRun(projectSessionId: string, runId: string): void {
    if (this.#database.prepare(`
      SELECT 1 FROM runs WHERE project_session_id=? AND run_id=?
    `).get(projectSessionId, runId) === undefined) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "coordination run is outside the project session");
    }
  }

  #assertMemberTarget(runId: string, member: ProjectSessionMember): void {
    const exists = member.kind === "coordination-run"
      ? this.#database.prepare("SELECT 1 FROM runs WHERE run_id=?").get(member.runId)
      : member.kind === "task"
        ? this.#database.prepare("SELECT 1 FROM tasks WHERE run_id=? AND task_id=?").get(runId, member.taskId)
        : member.kind === "lease"
          ? this.#database.prepare("SELECT 1 FROM leases WHERE run_id=? AND lease_id=?").get(runId, member.leaseId)
          : member.kind === "provider-action"
            ? this.#database.prepare("SELECT 1 FROM provider_actions WHERE run_id=? AND action_id=?").get(runId, member.providerActionId)
            : member.kind === "required-message"
              ? this.#database.prepare("SELECT 1 FROM messages WHERE run_id=? AND message_id=?").get(runId, member.messageId)
              : member.kind === "workstream"
                ? this.#database.prepare("SELECT 1 FROM workstreams WHERE coordination_run_id=? AND workstream_id=?").get(runId, member.workstreamId)
                : member.kind === "gate"
                  ? this.#database.prepare("SELECT 1 FROM scoped_gates WHERE coordination_run_id=? AND gate_id=?").get(runId, member.gateId)
                  : 1;
    if (exists === undefined) throw new ProjectFabricCoreError("NOT_FOUND", `${member.kind} membership target was not found`);
  }

  #memberId(member: ProjectSessionMember): string {
    switch (member.kind) {
      case "coordination-run": return member.runId;
      case "workstream": return member.workstreamId;
      case "task": return member.taskId;
      case "lease": return member.leaseId;
      case "provider-action": return member.providerActionId;
      case "required-message": return member.messageId;
      case "artifact-obligation": return member.artifactObligationId;
      case "gate": return member.gateId;
      case "scoped-barrier": return member.barrierId;
    }
  }
}

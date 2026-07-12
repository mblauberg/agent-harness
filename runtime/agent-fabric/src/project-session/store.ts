import {
  assertChairMutationAuthority,
  parseIdentifier,
  parseMembershipBindRequest,
  parseMembershipBindResult,
  parseProjectSession,
  type ChairMutationContext,
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
  type ChairTakeoverRequest,
  type ChairTakeoverResult,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import { CommandJournal } from "../application/command-journal.js";
import { OperatorStore } from "../operator/store.js";
import {
  ProjectFabricCoreError,
  type AuthenticatedAgentContext,
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
  readonly #commandJournal: CommandJournal;
  readonly #clock: () => number;
  readonly #fault: (label: string) => void;

  constructor(options: CoreServiceOptions & {
    operatorStore: OperatorStore;
    commandJournal?: CommandJournal;
  }) {
    this.#database = options.database;
    this.#operatorStore = options.operatorStore;
    this.#clock = options.clock ?? Date.now;
    this.#fault = options.fault ?? (() => undefined);
    this.#commandJournal = options.commandJournal ?? new CommandJournal(this.#database, this.#clock);
  }

  createProjectSession(
    context: AuthenticatedOperatorContext,
    request: ProjectSessionCreateRequest,
  ): ProjectSession {
    return this.#operatorStore.executeCommand(
      context,
      request.command,
      {
        projectId: request.projectId,
        requiredAction: "launch",
        commandPayload: {
          projectSessionId: request.projectSessionId,
          projectId: request.projectId,
          mode: request.mode,
          generation: request.generation,
          authorityRef: request.authorityRef,
          budgetRef: request.budgetRef,
          launchPacketRef: request.launchPacketRef,
        },
      },
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
    const targetState: string = request.transition.to;
    if (
      identity.state === "launching" ||
      identity.state === "launch_ambiguous" ||
      targetState === "launching" ||
      targetState === "launch_ambiguous"
    ) {
      throw new ProjectFabricCoreError(
        "LIFECYCLE_PRECONDITION_FAILED",
        "public project-session transition cannot enter or leave a launch-custody-owned state",
      );
    }
    return this.#operatorStore.executeCommand(
      context,
      request.command,
      {
        projectId: identity.projectId,
        projectSessionId: request.projectSessionId,
        sessionGeneration: request.expectedGeneration,
        requiredAction: "decide",
        commandPayload: {
          projectSessionId: request.projectSessionId,
          expectedGeneration: request.expectedGeneration,
          transition: request.transition,
        },
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
        if (request.transition.to === "awaiting_launch") {
          this.#database.prepare(`
            UPDATE project_sessions
               SET state='awaiting_launch', launch_packet_path=?, launch_packet_digest=?,
                   revision=revision+1, updated_at=?
             WHERE project_session_id=? AND revision=? AND generation=? AND state='draft'
          `).run(
            request.transition.launchPacketRef.path,
            request.transition.launchPacketRef.digest,
            this.#clock(),
            request.projectSessionId,
            current.revision,
            request.expectedGeneration,
          );
        } else {
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
        }
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
        commandPayload: {
          projectSessionId: request.projectSessionId,
          expectedGeneration: request.expectedGeneration,
          terminalPath: request.terminalPath,
        },
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
    context: AuthenticatedOperatorContext | AuthenticatedAgentContext,
    input: MembershipBindRequest,
  ): MembershipBindResult {
    const request = parseMembershipBindRequest(input);
    if (request.origin === "chair") {
      if (!("agentId" in context)) {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "chair membership binding requires an agent principal");
      }
      return this.#executeChairMembership(context, request);
    }
    if (!("operatorId" in context)) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator membership binding requires an operator principal");
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
        commandPayload: {
          projectSessionId: request.projectSessionId,
          coordinationRunId: request.coordinationRunId,
          expectedMembershipRevision: request.expectedMembershipRevision,
          members: request.members,
        },
      },
      () => this.#membershipRevision(request.projectSessionId),
      () => this.#applyMembership(request),
    );
  }

  #executeChairMembership(
    context: AuthenticatedAgentContext,
    request: Extract<MembershipBindRequest, { origin: "chair" }>,
  ): MembershipBindResult {
    const execute = this.#database.transaction(() => {
      this.#assertChairMembershipAuthority(context, request.command);
      return this.#commandJournal.execute(
        context.coordinationRunId,
        context.agentId,
        request.command.commandId,
        request,
        (value): value is MembershipBindResult => {
          try {
            parseMembershipBindResult(value);
            return true;
          } catch {
            return false;
          }
        },
        () => this.#applyMembership(request),
      );
    });
    return execute();
  }

  #applyMembership(request: MembershipBindRequest): MembershipBindResult {
    const session = this.#sessionIdentity(request.projectSessionId);
    if (
      session.state === "quiescing" ||
      session.state === "awaiting_acceptance" ||
      session.state === "closed" ||
      session.state === "cancelled"
    ) {
      throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "project-session membership is frozen");
    }
    if (session.membershipRevision !== request.expectedMembershipRevision) {
      throw new ProjectFabricCoreError("STALE_REVISION", "membership revision changed");
    }
    this.#assertRun(request.projectSessionId, request.coordinationRunId);
    for (const member of request.members) {
      this.#assertMemberTarget(request.projectSessionId, request.coordinationRunId, member);
      const disposition = member.state === "terminal" ? "reconciled" : member.state;
      const timestamp = this.#clock();
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
        timestamp,
        timestamp,
      );
    }
    this.#fault("session:membership");
    const changed = this.#database.prepare(`
      UPDATE project_sessions
         SET membership_revision=membership_revision+1, revision=revision+1, updated_at=?
       WHERE project_session_id=? AND membership_revision=?
    `).run(this.#clock(), request.projectSessionId, request.expectedMembershipRevision);
    if (changed.changes !== 1) {
      throw new ProjectFabricCoreError("STALE_REVISION", "membership revision changed before commit");
    }
    return {
      projectSessionId: request.projectSessionId,
      coordinationRunId: request.coordinationRunId,
      membershipRevision: request.expectedMembershipRevision + 1,
      members: request.members,
    };
  }

  takeoverChair(
    context: AuthenticatedOperatorContext,
    request: ChairTakeoverRequest,
  ): ChairTakeoverResult {
    const session = this.#sessionIdentity(request.projectSessionId);
    return this.#operatorStore.executeCommand(
      context,
      request.command,
      {
        projectId: session.projectId,
        projectSessionId: request.projectSessionId,
        sessionGeneration: request.expectedSessionGeneration,
        requiredAction: "takeover",
        commandPayload: {
          projectSessionId: request.projectSessionId,
          runId: request.runId,
          expectedChairAgentId: request.expectedChairAgentId,
          successorChairAgentId: request.successorChairAgentId,
          expectedChairGeneration: request.expectedChairGeneration,
          expectedSessionGeneration: request.expectedSessionGeneration,
          handoffRef: request.handoffRef,
          targetRevision: request.targetRevision,
        },
      },
      () => this.#sessionRevision(request.projectSessionId),
      () => {
        const currentSession = this.#sessionIdentity(request.projectSessionId);
        if (currentSession.generation !== request.expectedSessionGeneration) {
          throw new ProjectFabricCoreError("STALE_GENERATION", "project-session generation changed");
        }
        const run = row(this.#database.prepare(`
          SELECT chair_agent_id, chair_generation, chair_lease_id, revision
            FROM runs WHERE project_session_id=? AND run_id=?
        `).get(request.projectSessionId, request.runId), "coordination run");
        if (
          text(run, "chair_agent_id") !== request.expectedChairAgentId ||
          integer(run, "chair_generation") !== request.expectedChairGeneration ||
          integer(run, "revision") + 1 !== request.targetRevision
        ) {
          throw new ProjectFabricCoreError("STALE_REVISION", "chair identity, generation or target revision changed");
        }
        const capability = row(this.#database.prepare(`
          SELECT kind, handoff_digest, old_chair_generation, expected_run_id,
                 expected_run_revision, expected_session_revision, cas_target_revision
            FROM operator_capabilities WHERE capability_id=?
        `).get(request.command.credential.capabilityId), "takeover capability");
        if (
          text(capability, "kind") !== "takeover" ||
          text(capability, "handoff_digest") !== request.handoffRef.digest ||
          integer(capability, "old_chair_generation") !== request.expectedChairGeneration ||
          text(capability, "expected_run_id") !== request.runId ||
          integer(capability, "expected_run_revision") !== integer(run, "revision") ||
          integer(capability, "expected_session_revision") !== currentSession.revision ||
          integer(capability, "cas_target_revision") !== request.targetRevision
        ) {
          throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "takeover capability binding does not match current state");
        }
        const handoff = this.#database.prepare(`
          SELECT 1 FROM artifacts
           WHERE run_id=? AND relative_path=? AND sha256=? AND publisher_agent_id=?
        `).get(request.runId, request.handoffRef.path, request.handoffRef.digest, request.expectedChairAgentId);
        if (handoff === undefined) {
          throw new ProjectFabricCoreError("RECOVERY_REQUIRED", "persisted chair handoff does not match the takeover binding");
        }
        const currentLease = this.#database.prepare(`
          SELECT 1 FROM run_chair_leases
           WHERE project_session_id=? AND run_id=? AND lease_id=? AND holder_agent_id=?
             AND generation=? AND status='active'
        `).get(
          request.projectSessionId,
          request.runId,
          text(run, "chair_lease_id"),
          request.expectedChairAgentId,
          request.expectedChairGeneration,
        );
        if (currentLease === undefined) {
          throw new ProjectFabricCoreError("RECOVERY_REQUIRED", "old chair generation is not an active fenced lease");
        }
        if (this.#database.prepare(`
          SELECT 1 FROM leases
           WHERE run_id=? AND holder_agent_id=? AND status IN ('active','quarantined') LIMIT 1
        `).get(request.runId, request.expectedChairAgentId) !== undefined) {
          throw new ProjectFabricCoreError(
            "WRITE_SCOPE_RECOVERY_REQUIRED",
            "old chair still owns an unreconciled write scope",
          );
        }
        if (this.#database.prepare(`
          SELECT 1 FROM agents WHERE run_id=? AND agent_id=?
        `).get(request.runId, request.successorChairAgentId) === undefined) {
          throw new ProjectFabricCoreError("NOT_FOUND", "successor chair agent was not found");
        }
        const nextGeneration = request.expectedChairGeneration + 1;
        const nextLeaseId = `chair:${request.runId}:${String(nextGeneration)}`;
        this.#fault("takeover:fence");
        this.#database.prepare(`
          UPDATE run_chair_leases
             SET status='frozen', handoff_digest=?, updated_at=?
           WHERE project_session_id=? AND run_id=? AND generation=? AND status='active'
        `).run(
          request.handoffRef.digest,
          this.#clock(),
          request.projectSessionId,
          request.runId,
          request.expectedChairGeneration,
        );
        this.#database.prepare(`
          INSERT INTO delivery_freezes(run_id, agent_id, reason, created_at)
          VALUES (?, ?, 'chair-takeover', ?)
          ON CONFLICT(run_id, agent_id) DO UPDATE SET reason=excluded.reason
        `).run(request.runId, request.expectedChairAgentId, this.#clock());
        this.#fault("takeover:chair");
        this.#database.prepare(`
          UPDATE runs
             SET chair_agent_id=?, chair_generation=?, chair_lease_id=?, revision=revision+1
           WHERE run_id=? AND project_session_id=? AND revision=? AND chair_generation=?
        `).run(
          request.successorChairAgentId,
          nextGeneration,
          nextLeaseId,
          request.runId,
          request.projectSessionId,
          integer(run, "revision"),
          request.expectedChairGeneration,
        );
        this.#database.prepare(`
          UPDATE project_sessions
             SET generation=generation+1, revision=revision+1, updated_at=?
           WHERE project_session_id=? AND generation=? AND revision=?
        `).run(
          this.#clock(),
          request.projectSessionId,
          request.expectedSessionGeneration,
          currentSession.revision,
        );
        this.#fault("takeover:lease");
        this.#database.prepare(`
          INSERT INTO run_chair_leases(
            project_session_id, run_id, lease_id, holder_agent_id, generation, status, handoff_digest, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
        `).run(
          request.projectSessionId,
          request.runId,
          nextLeaseId,
          request.successorChairAgentId,
          nextGeneration,
          request.handoffRef.digest,
          this.#clock(),
        );
        return {
          projectSessionId: request.projectSessionId,
          sessionRevision: currentSession.revision + 1,
          runRevision: request.targetRevision,
          chairAgentId: request.successorChairAgentId,
          chairGeneration: nextGeneration,
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
    if (this.#database.prepare(`
      SELECT 1 FROM operator_effect_custody
       WHERE project_session_id=? AND state IN ('prepared','dispatching','ambiguous','failed')
       LIMIT 1
    `).get(projectSessionId) !== undefined) {
      throw new ProjectFabricCoreError("BARRIER_PRECONDITION_FAILED", "unresolved operator-effect custody remains active");
    }
  }

  #assertRun(projectSessionId: string, runId: string): void {
    if (this.#database.prepare(`
      SELECT 1 FROM runs WHERE project_session_id=? AND run_id=?
    `).get(projectSessionId, runId) === undefined) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "coordination run is outside the project session");
    }
  }

  #assertChairMembershipAuthority(
    context: AuthenticatedAgentContext,
    command: ChairMutationContext,
  ): void {
    if (
      context.projectSessionId !== command.projectSessionId ||
      context.coordinationRunId !== command.coordinationRunId
    ) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "agent context is bound to another project session or run");
    }
    const runValue = this.#database.prepare(`
      SELECT project_session_id, chair_agent_id, chair_generation, chair_lease_id, revision
        FROM runs WHERE run_id=?
    `).get(context.coordinationRunId);
    if (runValue === undefined) {
      throw new ProjectFabricCoreError("NOT_FOUND", "membership coordination run was not found");
    }
    const run = row(runValue, "membership coordination run");
    if (text(run, "project_session_id") !== context.projectSessionId) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "coordination run is outside the authenticated project session");
    }
    if (text(run, "chair_agent_id") !== context.agentId) {
      throw new ProjectFabricCoreError("TASK_NOT_OWNER", "authenticated agent is not the active membership chair");
    }
    const leaseValue = this.#database.prepare(`
      SELECT lease_id, holder_agent_id, generation, status
        FROM run_chair_leases
       WHERE project_session_id=? AND run_id=? AND lease_id=? AND generation=?
    `).get(
      context.projectSessionId,
      context.coordinationRunId,
      text(run, "chair_lease_id"),
      integer(run, "chair_generation"),
    );
    if (leaseValue === undefined) {
      throw new ProjectFabricCoreError("STALE_LEASE_GENERATION", "active chair lease binding was not found");
    }
    const lease = row(leaseValue, "membership chair lease");
    if (text(lease, "holder_agent_id") !== context.agentId || text(lease, "status") !== "active") {
      throw new ProjectFabricCoreError("TASK_NOT_OWNER", "authenticated agent does not hold the active chair lease");
    }
    const capabilityValue = this.#database.prepare(`
      SELECT 1 FROM capabilities
       WHERE run_id=? AND agent_id=? AND principal_generation=?
         AND revoked_at IS NULL AND expires_at>?
       LIMIT 1
    `).get(context.coordinationRunId, context.agentId, context.principalGeneration, this.#clock());
    if (capabilityValue === undefined) {
      throw new ProjectFabricCoreError(
        "STALE_PRINCIPAL_GENERATION",
        "chair principal generation is stale, expired or revoked",
      );
    }
    const current = {
      agentId: context.agentId,
      projectSessionId: context.projectSessionId,
      coordinationRunId: context.coordinationRunId,
      principalGeneration: context.principalGeneration,
      chairLeaseId: parseIdentifier<"LeaseId">(text(lease, "lease_id"), "membership.chairLeaseId"),
      chairLeaseGeneration: integer(lease, "generation"),
      runRevision: integer(run, "revision"),
    };
    if (command.agentId !== current.agentId) {
      throw new ProjectFabricCoreError("TASK_NOT_OWNER", "chair command authenticated agent is not the current chair");
    }
    if (command.principalGeneration !== current.principalGeneration) {
      throw new ProjectFabricCoreError("STALE_PRINCIPAL_GENERATION", "chair command principal generation is stale");
    }
    if (
      command.chairLeaseId !== current.chairLeaseId ||
      command.chairLeaseGeneration !== current.chairLeaseGeneration
    ) {
      throw new ProjectFabricCoreError("STALE_LEASE_GENERATION", "chair command lease generation is stale");
    }
    if (command.expectedRunRevision !== current.runRevision) {
      throw new ProjectFabricCoreError("STALE_REVISION", "chair command run revision is stale");
    }
    assertChairMutationAuthority(command, current);
  }

  #assertMemberTarget(
    projectSessionId: string,
    runId: string,
    member: ProjectSessionMember,
  ): void {
    let exists: unknown;
    switch (member.kind) {
      case "coordination-run":
        exists = this.#database.prepare(`
          SELECT 1 FROM runs WHERE project_session_id=? AND run_id=?
        `).get(projectSessionId, member.runId);
        break;
      case "workstream":
        exists = this.#database.prepare(`
          SELECT 1 FROM workstreams
           WHERE project_session_id=? AND coordination_run_id=? AND workstream_id=?
        `).get(projectSessionId, runId, member.workstreamId);
        break;
      case "task":
        exists = this.#database.prepare("SELECT 1 FROM tasks WHERE run_id=? AND task_id=?")
          .get(runId, member.taskId);
        break;
      case "lease":
        exists = this.#database.prepare("SELECT 1 FROM leases WHERE run_id=? AND lease_id=?")
          .get(runId, member.leaseId);
        break;
      case "provider-action":
        exists = this.#database.prepare("SELECT 1 FROM provider_actions WHERE run_id=? AND action_id=?")
          .get(runId, member.providerActionId);
        break;
      case "required-message":
        exists = this.#database.prepare("SELECT 1 FROM messages WHERE run_id=? AND message_id=?")
          .get(runId, member.messageId);
        break;
      case "artifact-obligation":
        exists = this.#database.prepare("SELECT 1 FROM artifacts WHERE run_id=? AND artifact_id=?")
          .get(runId, member.artifactObligationId);
        break;
      case "gate":
        exists = this.#database.prepare(`
          SELECT 1 FROM scoped_gates
           WHERE project_session_id=? AND coordination_run_id=? AND gate_id=?
        `).get(projectSessionId, runId, member.gateId);
        break;
      case "scoped-barrier":
        exists = this.#database.prepare(`
          SELECT 1
            FROM task_request_barriers b
            JOIN task_requests r ON r.request_id=b.request_id
           WHERE r.project_session_id=? AND r.run_id=? AND b.barrier_id=?
          UNION ALL
          SELECT 1
            FROM scoped_gate_barriers b
            JOIN scoped_gates g ON g.gate_id=b.gate_id
           WHERE g.project_session_id=? AND g.coordination_run_id=? AND b.barrier_id=?
          LIMIT 1
        `).get(
          projectSessionId,
          runId,
          member.barrierId,
          projectSessionId,
          runId,
          member.barrierId,
        );
        break;
    }
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

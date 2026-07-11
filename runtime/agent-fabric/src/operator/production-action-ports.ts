import type {
  ArtifactRef,
  OperatorActionIntent,
} from "@local/agent-fabric-protocol";
import { parseArtifactRef } from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import type {
  OperatorActionEffectPort,
  OperatorActionStatePort,
  OperatorEffectOutcome,
  OperatorEffectRequest,
} from "./action-store.js";
import { ProjectFabricCoreError } from "../project-session/contracts.js";
import { canonicalJson, sha256 } from "../project-session/store-support.js";
import { readGlobalLiveness, type QuiesceToken } from "../daemon/global-liveness.js";

type Row = Record<string, unknown>;

export type ProductionOperatorAdapterPort = {
  capabilities(adapterId: string): Promise<unknown>;
  dispatch(
    adapterId: string,
    input: { actionId: string; operation: "interrupt" | "steer"; payload: Record<string, unknown> },
  ): Promise<unknown>;
  lookup(adapterId: string, actionId: string): Promise<unknown>;
};

export type ProductionOperatorActionPorts = {
  statePort: OperatorActionStatePort;
  effectPort: OperatorActionEffectPort;
};

export type ProductionDaemonStopPort = {
  request(input: Readonly<{ commandId: string; token: QuiesceToken }>): Promise<"stopped" | "scheduled" | "busy">;
};

export function assertOperatorTaskRunnable(
  database: Database.Database,
  runId: string,
  taskId: string,
): void {
  if (isRow(database.prepare(`
    SELECT 1 FROM operator_control_fences
     WHERE coordination_run_id=? AND task_id=? AND state='paused'
  `).get(runId, taskId))) {
    throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "task is paused by an operator control fence");
  }
}

export function assertRunAcceptingWork(database: Database.Database, runId: string): void {
  const value = row(database.prepare(`
    SELECT session.state AS session_state
      FROM runs run JOIN project_sessions session ON session.project_session_id=run.project_session_id
     WHERE run.run_id=?
  `).get(runId), "coordination run lifecycle");
  if (["quiescing", "awaiting_acceptance", "closed", "cancelled"].includes(text(value, "session_state"))) {
    throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "project session is not accepting new work");
  }
  const epoch = database.prepare(`
    SELECT state FROM daemon_runtime_epochs ORDER BY instance_generation DESC LIMIT 1
  `).get();
  if (isRow(epoch) && epoch.state === "quiescing") {
    throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "daemon is draining and not accepting new work");
  }
  if (isRow(database.prepare(`
    SELECT 1 FROM delivery_freezes WHERE run_id=? AND reason LIKE 'operator-pause:%'
  `).get(runId))) {
    throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "coordination run is paused by the operator");
  }
}

type ResolvedControlTarget = {
  scopeKind: "task" | "subtree" | "run" | "session";
  revision: number;
  projectSessionId: string;
  sessionGeneration: number;
  runs: readonly string[];
  tasks: readonly {
    runId: string;
    taskId: string;
    revision: number;
    state: string;
    ownerAgentId: string | null;
    ownerLeaseGeneration: number;
  }[];
  agents: readonly { runId: string; agentId: string; lifecycle: string }[];
};

type ActiveTurn = {
  runId: string;
  agentId: string;
  actionId: string;
  turnLeaseGeneration: number;
};

type StoredControlAction = {
  runId: string;
  actionId: string;
  adapterId: string;
  operation: "interrupt" | "steer";
  status: "prepared" | "dispatched" | "accepted" | "terminal" | "ambiguous" | "quarantined";
};

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function row(value: unknown, label: string): Row {
  if (!isRow(value)) throw new ProjectFabricCoreError("NOT_FOUND", `${label} was not found`);
  return value;
}

function text(value: Row, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string") throw new Error(`${field} is not text`);
  return candidate;
}

function integer(value: Row, field: string): number {
  const candidate = value[field];
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate)) throw new Error(`${field} is not an integer`);
  return candidate;
}

function nullableText(value: Row, field: string): string | null {
  const candidate = value[field];
  if (candidate !== null && typeof candidate !== "string") throw new Error(`${field} is not nullable text`);
  return candidate;
}

function unsupported(): never {
  throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator action runtime is unavailable for this intent");
}

class ProductionOperatorActions {
  readonly #database: Database.Database;
  readonly #clock: () => number;
  readonly #adapter: ProductionOperatorAdapterPort;
  readonly #daemonStop: ProductionDaemonStopPort | undefined;

  constructor(options: {
    database: Database.Database;
    clock: () => number;
    adapter: ProductionOperatorAdapterPort;
    daemonStop?: ProductionDaemonStopPort;
  }) {
    this.#database = options.database;
    this.#clock = options.clock;
    this.#adapter = options.adapter;
    this.#daemonStop = options.daemonStop;
  }

  readonly statePort: OperatorActionStatePort = {
    read: async (intent) => this.#read(intent),
  };

  readonly effectPort: OperatorActionEffectPort = {
    dispatch: async (request) => this.#dispatch(request),
    observe: async (request) => this.#observe(request),
  };

  #read(intent: OperatorActionIntent): Promise<Awaited<ReturnType<OperatorActionStatePort["read"]>>> {
    if (intent.kind === "project-session-drain" || intent.kind === "project-session-stop") {
      const session = row(this.#database.prepare(`
        SELECT revision, generation, state FROM project_sessions WHERE project_session_id=?
      `).get(intent.projectSessionId), "project session lifecycle");
      return Promise.resolve({
        kind: "project-session-lifecycle",
        revision: integer(session, "revision"),
        sessionGeneration: integer(session, "generation"),
        globalStateRevision: this.#globalRevision(),
        lifecycleState: text(session, "state"),
        drainReceiptRef: this.#latestReceipt("project-session-drain", intent.projectSessionId),
      });
    }
    if (intent.kind === "daemon-drain" || intent.kind === "daemon-stop") {
      const epoch = row(this.#database.prepare(`
        SELECT instance_generation, state FROM daemon_runtime_epochs
         WHERE instance_generation=?
      `).get(intent.expectedDaemonGeneration), "daemon runtime epoch");
      const globalStateRevision = this.#globalRevision();
      return Promise.resolve({
        kind: "daemon-lifecycle",
        revision: globalStateRevision,
        daemonGeneration: integer(epoch, "instance_generation"),
        globalStateRevision,
        lifecycleState: text(epoch, "state"),
        drainReceiptRef: this.#latestDaemonReceipt(intent.expectedDaemonGeneration),
      });
    }
    if (intent.kind !== "control") unsupported();
    const target = this.#resolveControlTarget(intent);
    const tasksPaused = target.tasks.length > 0 && target.tasks.every((task) => isRow(this.#database.prepare(`
      SELECT 1 FROM operator_control_fences
       WHERE coordination_run_id=? AND task_id=? AND state='paused'
    `).get(task.runId, task.taskId)));
    const agentsPaused = target.tasks.length === 0 && target.agents.length > 0 && target.agents.every((agent) => {
      const freeze = this.#database.prepare(`
        SELECT reason FROM delivery_freezes WHERE run_id=? AND agent_id=?
      `).get(agent.runId, agent.agentId);
      return isRow(freeze) && typeof freeze.reason === "string" && freeze.reason.startsWith("operator-pause:");
    });
    const paused = tasksPaused || agentsPaused;
    const terminal = target.tasks.length > 0 && target.tasks.every((task) =>
      ["complete", "cancelled", "degraded"].includes(task.state));
    const activeTurn = this.#activeTurns(target).length > 0;
    return Promise.resolve({
      kind: "control",
      revision: target.revision,
      lifecycleState: terminal ? "terminal" : paused ? "paused" : "active",
      eligibleActions: terminal
        ? []
        : paused
        ? ["resume", "cancel"]
        : activeTurn
          ? ["pause", "cancel", "steer"]
          : ["pause", "cancel"],
    });
  }

  async #dispatch(request: OperatorEffectRequest): Promise<OperatorEffectOutcome> {
    if (request.intent.kind === "project-session-drain") return this.#drainProject({ ...request, intent: request.intent });
    if (request.intent.kind === "project-session-stop") return this.#stopProject({ ...request, intent: request.intent });
    if (request.intent.kind === "daemon-drain") return this.#drainDaemon({ ...request, intent: request.intent });
    if (request.intent.kind === "daemon-stop") return await this.#stopDaemon({ ...request, intent: request.intent });
    if (request.intent.kind !== "control") unsupported();
    const target = this.#resolveControlTarget(request.intent);
    if (request.intent.action === "resume") {
      return this.#resume(request.commandId, target);
    }
    if (request.intent.action === "pause") {
      const activeTurns = this.#activeTurns(target);
      if (activeTurns.length > 0) {
        return await this.#dispatchExternalControl(request, activeTurns, "interrupt");
      }
      this.#freeze(target, `operator-pause:${request.commandId}`);
      return { status: "committed", afterState: { lifecycleState: "paused" } };
    }
    if (request.intent.action === "cancel") {
      const activeTurns = this.#activeTurns(target);
      if (activeTurns.length > 0) {
        return await this.#dispatchExternalControl(request, activeTurns, "interrupt");
      }
      return this.#cancel(target, request.intent.reason);
    }
    if (request.intent.action === "steer") {
      const activeTurns = this.#activeTurns(target);
      if (activeTurns.length === 0) {
        return { status: "rejected", code: "state-changed", evidenceRefs: [] };
      }
      return await this.#dispatchExternalControl(request, activeTurns, "steer");
    }
    unsupported();
  }

  async #observe(
    request: OperatorEffectRequest & { effectRef: ArtifactRef | null },
  ): Promise<OperatorEffectOutcome> {
    if (request.intent.kind === "project-session-drain") {
      const session = row(this.#database.prepare(`
        SELECT revision, generation, state FROM project_sessions WHERE project_session_id=?
      `).get(request.intent.projectSessionId), "project session lifecycle");
      if (text(session, "state") !== "quiescing") {
        return { status: "rejected", code: "state-changed", evidenceRefs: [] };
      }
      const obligations = this.#projectObligations(request.intent.projectSessionId);
      if (!obligations.settled) return { status: "pending", phase: "observing" };
      const receipt = this.#persistLifecycleReceipt({
        kind: "project-session-drain",
        commandId: request.commandId,
        projectSessionId: request.intent.projectSessionId,
        sessionRevision: integer(session, "revision"),
        sessionGeneration: integer(session, "generation"),
        globalStateRevision: this.#globalRevision(),
        obligations,
      });
      return {
        status: "committed",
        afterState: { lifecycleState: "quiescing", obligationsSettled: true },
        effectRef: receipt,
      };
    }
    if (request.intent.kind === "daemon-drain") {
      return this.#finishDaemonDrain(request.commandId, request.intent.expectedDaemonGeneration);
    }
    if (request.intent.kind === "daemon-stop") {
      const epoch = row(this.#database.prepare(`
        SELECT state, observed_global_revision FROM daemon_runtime_epochs WHERE instance_generation=?
      `).get(request.intent.expectedDaemonGeneration), "daemon runtime epoch");
      if (text(epoch, "state") === "stopped") {
        return { status: "committed", afterState: { lifecycleState: "stopped" } };
      }
      if (text(epoch, "state") === "quiescing") return { status: "pending", phase: "observing" };
      return { status: "rejected", code: "state-changed", evidenceRefs: [] };
    }
    if (request.intent.kind !== "control") unsupported();
    const stored = this.#controlActions(request.commandId);
    if (stored.length === 0) {
      return { status: "rejected", code: "state-changed", evidenceRefs: [] };
    }
    const expectedEffectRef = this.#effectRef(request.commandId, stored);
    if (
      request.effectRef === null ||
      request.effectRef.path !== expectedEffectRef.path ||
      request.effectRef.digest !== expectedEffectRef.digest
    ) {
      throw new ProjectFabricCoreError("STALE_REVISION", "operator control effect reference changed");
    }
    for (const action of stored) {
      if (action.status === "prepared") continue;
      if (action.status === "terminal") continue;
      if (action.status === "quarantined") {
        return { status: "ambiguous", effectRef: expectedEffectRef };
      }
      let result: unknown;
      try {
        result = await this.#adapter.lookup(action.adapterId, action.actionId);
      } catch {
        this.#quarantine(action);
        return { status: "ambiguous", effectRef: this.#effectRef(request.commandId, this.#controlActions(request.commandId)) };
      }
      this.#persistAdapterResult(action, result);
    }
    const reconciled = this.#controlActions(request.commandId);
    if (!reconciled.every((action) => action.status === "terminal")) {
      return { status: "ambiguous", effectRef: this.#effectRef(request.commandId, reconciled) };
    }
    const target = this.#resolveControlTarget(request.intent);
    if (request.intent.action === "pause") {
      this.#freeze(target, `operator-pause:${request.commandId}`);
      return { status: "committed", afterState: { lifecycleState: "paused" } };
    }
    if (request.intent.action === "steer") {
      return { status: "committed", afterState: { lifecycleState: "active", steered: true } };
    }
    if (request.intent.action === "cancel") return this.#cancel(target, request.intent.reason);
    unsupported();
  }

  #resolveControlTarget(intent: Extract<OperatorActionIntent, { kind: "control" }>): ResolvedControlTarget {
    const target = intent.target;
    let revision: number;
    let sessionGeneration: number;
    let runIds: string[];
    let taskRows: Row[];
    let agentRows: Row[];
    if (target.kind === "task" || target.kind === "subtree") {
      const rootTaskId = target.kind === "task" ? target.taskId : target.rootTaskId;
      const task = row(this.#database.prepare(`
        SELECT t.revision, r.project_session_id, s.generation
          FROM tasks t
          JOIN runs r ON r.run_id=t.run_id
          JOIN project_sessions s ON s.project_session_id=r.project_session_id
         WHERE t.run_id=? AND t.task_id=? AND r.project_session_id=?
      `).get(target.coordinationRunId, rootTaskId, target.projectSessionId), "operator control task");
      revision = integer(task, "revision");
      sessionGeneration = integer(task, "generation");
      runIds = [target.coordinationRunId];
      if (target.kind === "task") {
        taskRows = this.#database.prepare(`
          SELECT run_id, task_id, revision, state, owner_agent_id, owner_lease_generation FROM tasks
           WHERE run_id=? AND task_id=?
        `).all(target.coordinationRunId, target.taskId) as Row[];
      } else {
        taskRows = this.#database.prepare(`
          WITH RECURSIVE scoped(task_id) AS (
            SELECT ?
            UNION
            SELECT dependency.task_id
              FROM task_dependencies dependency
              JOIN scoped parent ON dependency.dependency_task_id=parent.task_id
             WHERE dependency.run_id=?
          )
          SELECT task.run_id, task.task_id, task.revision, task.state, task.owner_agent_id,
                 task.owner_lease_generation
            FROM tasks task JOIN scoped ON scoped.task_id=task.task_id
           WHERE task.run_id=? ORDER BY task.task_id
        `).all(target.rootTaskId, target.coordinationRunId, target.coordinationRunId) as Row[];
      }
      const owners = [...new Set(taskRows.flatMap((item) => {
        const owner = nullableText(item, "owner_agent_id");
        return owner === null ? [] : [owner];
      }))].sort();
      agentRows = owners.map((agentId) => row(this.#database.prepare(`
        SELECT ? AS run_id, agent_id, lifecycle FROM agents WHERE run_id=? AND agent_id=?
      `).get(target.coordinationRunId, target.coordinationRunId, agentId), "operator control agent"));
    } else if (target.kind === "run") {
      const run = row(this.#database.prepare(`
        SELECT r.revision, r.project_session_id, s.generation
          FROM runs r JOIN project_sessions s ON s.project_session_id=r.project_session_id
         WHERE r.run_id=? AND r.project_session_id=?
      `).get(target.coordinationRunId, target.projectSessionId), "operator control run");
      revision = integer(run, "revision");
      sessionGeneration = integer(run, "generation");
      runIds = [target.coordinationRunId];
      taskRows = this.#database.prepare(`
        SELECT run_id, task_id, revision, state, owner_agent_id, owner_lease_generation
          FROM tasks WHERE run_id=? ORDER BY task_id
      `).all(target.coordinationRunId) as Row[];
      agentRows = this.#database.prepare(`
        SELECT run_id, agent_id, lifecycle FROM agents WHERE run_id=? ORDER BY agent_id
      `).all(target.coordinationRunId) as Row[];
    } else {
      const session = row(this.#database.prepare(`
        SELECT revision, generation FROM project_sessions WHERE project_session_id=?
      `).get(target.projectSessionId), "operator control session");
      revision = integer(session, "revision");
      sessionGeneration = integer(session, "generation");
      if (sessionGeneration !== target.expectedGeneration) {
        throw new ProjectFabricCoreError("STALE_GENERATION", "operator control session generation changed");
      }
      runIds = (this.#database.prepare(`
        SELECT run_id FROM runs WHERE project_session_id=? ORDER BY run_id
      `).all(target.projectSessionId) as Row[]).map((item) => text(item, "run_id"));
      taskRows = this.#database.prepare(`
        SELECT task.run_id, task.task_id, task.revision, task.state, task.owner_agent_id,
               task.owner_lease_generation
          FROM tasks task JOIN runs run ON run.run_id=task.run_id
         WHERE run.project_session_id=? ORDER BY task.run_id, task.task_id
      `).all(target.projectSessionId) as Row[];
      agentRows = this.#database.prepare(`
        SELECT agent.run_id, agent.agent_id, agent.lifecycle
          FROM agents agent JOIN runs run ON run.run_id=agent.run_id
         WHERE run.project_session_id=? ORDER BY agent.run_id, agent.agent_id
      `).all(target.projectSessionId) as Row[];
    }
    if (revision !== target.expectedRevision) {
      throw new ProjectFabricCoreError("STALE_REVISION", "operator control target revision changed", {
        expected: target.expectedRevision,
        actual: revision,
      });
    }
    return {
      scopeKind: target.kind,
      revision,
      projectSessionId: target.projectSessionId,
      sessionGeneration,
      runs: runIds,
      tasks: taskRows.map((task) => ({
        runId: text(task, "run_id"),
        taskId: text(task, "task_id"),
        revision: integer(task, "revision"),
        state: text(task, "state"),
        ownerAgentId: nullableText(task, "owner_agent_id"),
        ownerLeaseGeneration: integer(task, "owner_lease_generation"),
      })),
      agents: agentRows.map((agent) => ({
        runId: text(agent, "run_id"),
        agentId: text(agent, "agent_id"),
        lifecycle: text(agent, "lifecycle"),
      })),
    };
  }

  #activeTurns(target: ResolvedControlTarget): readonly ActiveTurn[] {
    const turns: ActiveTurn[] = [];
    for (const agent of target.agents) {
      const value = this.#database.prepare(`
        SELECT lease.action_id, lease.turn_lease_generation, action.payload_json
          FROM provider_session_turn_leases lease
          JOIN provider_actions action ON action.run_id=lease.run_id AND action.action_id=lease.action_id
         WHERE lease.run_id=? AND lease.agent_id=? AND lease.status='active'
      `).get(agent.runId, agent.agentId);
      if (!isRow(value)) continue;
      const payload: unknown = JSON.parse(text(value, "payload_json"));
      const attributedTaskId = isRow(payload) && typeof payload.taskId === "string" ? payload.taskId : null;
      if (
        (target.scopeKind === "task" || target.scopeKind === "subtree") &&
        (attributedTaskId === null || !target.tasks.some((task) => task.runId === agent.runId && task.taskId === attributedTaskId))
      ) continue;
      turns.push({
        runId: agent.runId,
        agentId: agent.agentId,
        actionId: text(value, "action_id"),
        turnLeaseGeneration: integer(value, "turn_lease_generation"),
      });
    }
    return turns;
  }

  async #dispatchExternalControl(
    request: OperatorEffectRequest,
    turns: readonly ActiveTurn[],
    operation: "interrupt" | "steer",
  ): Promise<OperatorEffectOutcome> {
    const planned: Array<{
      runId: string;
      agentId: string;
      sourceActionId: string;
      turnLeaseGeneration: number;
      providerSessionGeneration: number;
      adapterId: string;
      actionId: string;
      identityHash: string;
      payloadJson: string;
    }> = [];
    for (const turn of turns) {
      const target = row(this.#database.prepare(`
        SELECT a.provider_session_ref, b.adapter_id,
               COALESCE(p.provider_session_generation, 1) AS provider_session_generation,
               action.result_json AS source_result_json
          FROM agents a
          JOIN agent_adapter_bindings b ON b.run_id=a.run_id AND b.agent_id=a.agent_id
          LEFT JOIN provider_state p ON p.run_id=a.run_id AND p.agent_id=a.agent_id
          JOIN provider_actions action ON action.run_id=a.run_id AND action.action_id=?
         WHERE a.run_id=? AND a.agent_id=?
      `).get(turn.actionId, turn.runId, turn.agentId), "operator provider target");
      const adapterId = text(target, "adapter_id");
      const capabilities = await this.#adapter.capabilities(adapterId);
      if (
        !isRow(capabilities) || capabilities.actionJournal !== true ||
        !Array.isArray(capabilities.operations) ||
        !capabilities.operations.includes(operation) ||
        !capabilities.operations.includes("lookup_action")
      ) {
        return { status: "rejected", code: "state-changed", evidenceRefs: [] };
      }
      const sourceResult = typeof target.source_result_json === "string"
        ? JSON.parse(target.source_result_json) as unknown
        : undefined;
      const turnId = isRow(sourceResult) && typeof sourceResult.turnId === "string"
        ? sourceResult.turnId
        : undefined;
      const payload = {
        operatorCommandId: request.commandId,
        operatorIntentDigest: request.intentDigest,
        sourceActionId: turn.actionId,
        agentId: turn.agentId,
        resumeReference: text(target, "provider_session_ref"),
        providerSessionGeneration: integer(target, "provider_session_generation"),
        turnLeaseGeneration: turn.turnLeaseGeneration,
        ...(turnId === undefined ? {} : { turnId, expectedTurnId: turnId }),
        ...(request.intent.kind === "control" && request.intent.action === "steer"
          ? { instruction: request.intent.instruction, prompt: request.intent.instruction }
          : {}),
      };
      const actionId = `operator-${sha256(canonicalJson({
        commandId: request.commandId,
        adapterId,
        runId: turn.runId,
        agentId: turn.agentId,
        providerSessionGeneration: payload.providerSessionGeneration,
        operation,
      })).slice(0, 48)}`;
      const identityHash = sha256(canonicalJson({ adapterId, actionId, operation, payload }));
      const payloadJson = canonicalJson(payload);
      planned.push({
        runId: turn.runId,
        agentId: turn.agentId,
        sourceActionId: turn.actionId,
        turnLeaseGeneration: turn.turnLeaseGeneration,
        providerSessionGeneration: payload.providerSessionGeneration,
        adapterId,
        actionId,
        identityHash,
        payloadJson,
      });
    }
    this.#database.transaction(() => {
      for (const plan of planned) {
        const current = this.#database.prepare(`
          SELECT lease.action_id, lease.turn_lease_generation,
                 COALESCE(state.provider_session_generation, 1) AS provider_session_generation
            FROM provider_session_turn_leases lease
            LEFT JOIN provider_state state ON state.run_id=lease.run_id AND state.agent_id=lease.agent_id
           WHERE lease.run_id=? AND lease.agent_id=? AND lease.action_id=? AND lease.status='active'
        `).get(plan.runId, plan.agentId, plan.sourceActionId);
        if (
          !isRow(current) || current.action_id !== plan.sourceActionId ||
          current.turn_lease_generation !== plan.turnLeaseGeneration ||
          current.provider_session_generation !== plan.providerSessionGeneration
        ) {
          throw new ProjectFabricCoreError("STALE_GENERATION", "operator provider turn changed during preflight");
        }
        const existing = this.#database.prepare(`
          SELECT adapter_id, operation, identity_hash FROM provider_actions
           WHERE run_id=? AND action_id=?
        `).get(plan.runId, plan.actionId);
        if (isRow(existing)) {
          if (
            existing.adapter_id !== plan.adapterId || existing.operation !== operation ||
            existing.identity_hash !== plan.identityHash
          ) {
            throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "operator provider action identity changed");
          }
          continue;
        }
        this.#database.prepare(`
          INSERT INTO provider_actions(
            run_id, action_id, adapter_id, operation, target_agent_id,
            provider_session_generation, turn_lease_generation, identity_hash,
            payload_hash, payload_json, status, history_json, execution_count,
            effect_count, idempotency_proven, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'prepared', '["prepared"]', 0, 0, 0, ?)
        `).run(
          plan.runId,
          plan.actionId,
          plan.adapterId,
          operation,
          plan.agentId,
          plan.providerSessionGeneration,
          plan.turnLeaseGeneration,
          plan.identityHash,
          sha256(plan.payloadJson),
          plan.payloadJson,
          this.#clock(),
        );
      }
    })();

    for (const action of this.#controlActions(request.commandId)) {
      if (action.status !== "prepared") continue;
      this.#database.prepare(`
        UPDATE provider_actions
           SET status='dispatched', history_json='["prepared","dispatched"]',
               execution_count=1, journal_revision=journal_revision+1, updated_at=?
         WHERE run_id=? AND action_id=? AND status='prepared'
      `).run(this.#clock(), action.runId, action.actionId);
      try {
        const stored = row(this.#database.prepare("SELECT payload_json FROM provider_actions WHERE run_id=? AND action_id=?")
          .get(action.runId, action.actionId), "operator provider payload");
        const payload: unknown = JSON.parse(text(stored, "payload_json"));
        if (!isRow(payload)) throw new Error("operator provider payload is invalid");
        const result = await this.#adapter.dispatch(action.adapterId, {
          actionId: action.actionId,
          operation,
          payload,
        });
        this.#persistAdapterResult(action, result);
      } catch {
        this.#database.prepare(`
          UPDATE provider_actions
             SET status='ambiguous', history_json='["prepared","dispatched","ambiguous"]',
                 journal_revision=journal_revision+1, updated_at=?
           WHERE run_id=? AND action_id=?
        `).run(this.#clock(), action.runId, action.actionId);
      }
    }
    const completed = this.#controlActions(request.commandId);
    if (!completed.every((action) => action.status === "terminal")) {
      return { status: "ambiguous", effectRef: this.#effectRef(request.commandId, completed) };
    }
    if (request.intent.kind === "control" && request.intent.action === "pause") {
      const target = this.#resolveControlTarget(request.intent);
      this.#freeze(target, `operator-pause:${request.commandId}`);
      return { status: "committed", afterState: { lifecycleState: "paused" } };
    }
    if (request.intent.kind === "control" && request.intent.action === "cancel") {
      return this.#cancel(this.#resolveControlTarget(request.intent), request.intent.reason);
    }
    return { status: "committed", afterState: { lifecycleState: "active", steered: true } };
  }

  #controlActions(commandId: string): StoredControlAction[] {
    return this.#database.prepare(`
      SELECT run_id, action_id, adapter_id, operation, status
        FROM provider_actions
       WHERE json_extract(payload_json, '$.operatorCommandId')=?
       ORDER BY run_id, action_id
    `).all(commandId).map((value) => {
      const stored = row(value, "operator provider action");
      const status = text(stored, "status");
      const operation = text(stored, "operation");
      if (operation !== "interrupt" && operation !== "steer") {
        throw new Error("operator provider action operation is invalid");
      }
      if (!["prepared", "dispatched", "accepted", "terminal", "ambiguous", "quarantined"].includes(status)) {
        throw new Error("operator provider action status is invalid");
      }
      return {
        runId: text(stored, "run_id"),
        actionId: text(stored, "action_id"),
        adapterId: text(stored, "adapter_id"),
        operation,
        status: status as StoredControlAction["status"],
      };
    });
  }

  #effectRef(commandId: string, actions: readonly StoredControlAction[]): ArtifactRef {
    return parseArtifactRef({
      path: `.agent-fabric/operator-effects/${sha256(commandId).slice(0, 32)}.json`,
      digest: `sha256:${sha256(canonicalJson(actions))}`,
    }, "productionOperatorAction.effectRef");
  }

  #persistAdapterResult(action: StoredControlAction, result: unknown): void {
    if (!isRow(result) || result.actionId !== action.actionId || result.operation !== action.operation ||
      !Array.isArray(result.history) ||
      !result.history.every((item) => typeof item === "string") ||
      !Number.isSafeInteger(result.executionCount) || result.executionCount !== 1 ||
      !Number.isSafeInteger(result.effectCount) || (result.effectCount as number) < 0) {
      this.#quarantine(action);
      return;
    }
    const status = result.status;
    if (status !== "terminal" && status !== "ambiguous" && status !== "dispatched" && status !== "accepted") {
      this.#quarantine(action);
      return;
    }
    if (status === "terminal") {
      const effect = result.result;
      const proved = result.effectCount === 1 && isRow(effect) && (
        (action.operation === "interrupt" && effect.interrupted === true) ||
        (action.operation === "steer" && effect.steered === true)
      );
      if (!proved) {
        this.#quarantine(action);
        return;
      }
    }
    this.#database.prepare(`
      UPDATE provider_actions
         SET status=?, history_json=?, execution_count=?, effect_count=?, result_json=?,
             journal_revision=journal_revision+1, updated_at=?
       WHERE run_id=? AND action_id=?
    `).run(
      status,
      canonicalJson(result.history),
      result.executionCount,
      result.effectCount,
      result.result === undefined ? null : canonicalJson(result.result),
      this.#clock(),
      action.runId,
      action.actionId,
    );
  }

  #quarantine(action: StoredControlAction): void {
    this.#database.prepare(`
      UPDATE provider_actions
         SET status='quarantined', journal_revision=journal_revision+1, updated_at=?
       WHERE run_id=? AND action_id=?
    `).run(this.#clock(), action.runId, action.actionId);
  }

  #freeze(target: ResolvedControlTarget, reason: string): void {
    this.#database.transaction(() => {
      const commandId = reason.slice("operator-pause:".length);
      for (const task of target.tasks) {
        const fenceId = `operator-fence-${sha256(canonicalJson({
          commandId,
          runId: task.runId,
          taskId: task.taskId,
        })).slice(0, 48)}`;
        const existing = this.#database.prepare(`
          SELECT command_id FROM operator_control_fences
           WHERE coordination_run_id=? AND task_id=? AND state='paused'
        `).get(task.runId, task.taskId);
        if (isRow(existing)) {
          if (existing.command_id !== commandId) {
            throw new ProjectFabricCoreError("CONFLICT", "task is paused by another operator command");
          }
          continue;
        }
        this.#database.prepare(`
          INSERT INTO operator_control_fences(
            fence_id, project_session_id, coordination_run_id, task_id, scope_kind,
            target_revision, session_generation, command_id, state, created_at, released_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paused', ?, NULL)
        `).run(
          fenceId,
          target.projectSessionId,
          task.runId,
          task.taskId,
          target.scopeKind,
          task.revision,
          target.sessionGeneration,
          commandId,
          this.#clock(),
        );
      }
      if (target.scopeKind !== "run" && target.scopeKind !== "session") return;
      for (const agent of target.agents) {
        const existing = this.#database.prepare(`
          SELECT reason FROM delivery_freezes WHERE run_id=? AND agent_id=?
        `).get(agent.runId, agent.agentId);
        if (isRow(existing) && existing.reason !== reason) {
          throw new ProjectFabricCoreError("CONFLICT", "agent delivery is frozen by another lifecycle owner");
        }
        if (!isRow(existing)) {
          this.#database.prepare(`
            INSERT INTO delivery_freezes(run_id, agent_id, reason, created_at)
            VALUES (?, ?, ?, ?)
          `).run(agent.runId, agent.agentId, reason, this.#clock());
        }
        this.#database.prepare(`
          UPDATE agents SET lifecycle='suspended' WHERE run_id=? AND agent_id=? AND lifecycle='ready'
        `).run(agent.runId, agent.agentId);
      }
    })();
  }

  #resume(commandId: string, target: ResolvedControlTarget): OperatorEffectOutcome {
    this.#database.transaction(() => {
      for (const task of target.tasks) {
        const changed = this.#database.prepare(`
          UPDATE operator_control_fences
             SET state='released', released_at=?
           WHERE coordination_run_id=? AND task_id=? AND state='paused'
        `).run(this.#clock(), task.runId, task.taskId);
        if (changed.changes !== 1) {
          throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "resume requires an exact paused task fence");
        }
      }
      if (target.scopeKind !== "run" && target.scopeKind !== "session") return;
      for (const agent of target.agents) {
        const freeze = row(this.#database.prepare(`
          SELECT reason FROM delivery_freezes WHERE run_id=? AND agent_id=?
        `).get(agent.runId, agent.agentId), "operator pause fence");
        if (!text(freeze, "reason").startsWith("operator-pause:")) {
          throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "resume cannot release another lifecycle owner");
        }
        this.#database.prepare("DELETE FROM delivery_freezes WHERE run_id=? AND agent_id=?")
          .run(agent.runId, agent.agentId);
        this.#database.prepare("UPDATE agents SET lifecycle='ready' WHERE run_id=? AND agent_id=? AND lifecycle='suspended'")
          .run(agent.runId, agent.agentId);
      }
      void commandId;
    })();
    return { status: "committed", afterState: { lifecycleState: "active" } };
  }

  #cancel(target: ResolvedControlTarget, reason: string): OperatorEffectOutcome {
    let cancelledTasks = 0;
    this.#database.transaction(() => {
      for (const task of target.tasks) {
        const changed = this.#database.prepare(`
          UPDATE tasks
             SET state='cancelled', revision=revision+1
           WHERE run_id=? AND task_id=? AND revision=?
             AND state NOT IN ('complete','cancelled','degraded')
        `).run(task.runId, task.taskId, task.revision);
        cancelledTasks += changed.changes;
        if (changed.changes === 1) {
          this.#database.prepare(`
            UPDATE task_owner_leases SET status='released', updated_at=?
             WHERE run_id=? AND task_id=? AND generation=? AND status IN ('active','frozen')
          `).run(this.#clock(), task.runId, task.taskId, task.ownerLeaseGeneration);
          this.#database.prepare(`
            UPDATE project_session_memberships
               SET state='abandoned', abandoned_reason=?, revision=revision+1, updated_at=?
             WHERE project_session_id=? AND coordination_run_id=?
               AND member_kind='task' AND member_id=? AND state='active'
          `).run(reason, this.#clock(), target.projectSessionId, task.runId, task.taskId);
        }
        this.#database.prepare(`
          UPDATE operator_control_fences SET state='cancelled', released_at=?
           WHERE coordination_run_id=? AND task_id=? AND state='paused'
        `).run(this.#clock(), task.runId, task.taskId);
      }
    })();
    return { status: "committed", afterState: { lifecycleState: "cancelled", cancelledTasks } };
  }

  #drainProject(
    request: OperatorEffectRequest & { intent: Extract<OperatorActionIntent, { kind: "project-session-drain" }> },
  ): OperatorEffectOutcome {
    const intent = request.intent;
    this.#database.transaction(() => {
      const session = row(this.#database.prepare(`
        SELECT revision, generation, state FROM project_sessions WHERE project_session_id=?
      `).get(intent.projectSessionId), "project session lifecycle");
      if (
        integer(session, "revision") !== intent.expectedSessionRevision ||
        integer(session, "generation") !== intent.expectedSessionGeneration ||
        this.#globalRevision() !== intent.expectedGlobalStateRevision
      ) {
        throw new ProjectFabricCoreError("STALE_GENERATION", "project drain authority changed");
      }
      if (!["active", "visibility_degraded"].includes(text(session, "state"))) {
        throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "project drain requires an active session");
      }
      const changed = this.#database.prepare(`
        UPDATE project_sessions
           SET state='quiescing', revision=revision+1, updated_at=?
         WHERE project_session_id=? AND revision=? AND generation=?
      `).run(this.#clock(), intent.projectSessionId, intent.expectedSessionRevision, intent.expectedSessionGeneration);
      if (changed.changes !== 1) throw new ProjectFabricCoreError("STALE_REVISION", "project drain raced another transition");
      const runs = this.#database.prepare(`
        SELECT run_id, revision FROM runs
         WHERE project_session_id=? AND lifecycle_state NOT IN ('closed','cancelled','launch_failed')
         ORDER BY run_id
      `).all(intent.projectSessionId) as Row[];
      for (const run of runs) {
        this.#database.prepare(`
          UPDATE runs SET lifecycle_state='quiescing', revision=revision+1
           WHERE run_id=? AND revision=?
        `).run(text(run, "run_id"), integer(run, "revision"));
      }
    })();
    const session = row(this.#database.prepare(`
      SELECT revision, generation FROM project_sessions WHERE project_session_id=?
    `).get(intent.projectSessionId), "drained project session");
    const obligations = this.#projectObligations(intent.projectSessionId);
    if (!obligations.settled) return { status: "pending", phase: "accepted" };
    const receipt = this.#persistLifecycleReceipt({
      kind: "project-session-drain",
      commandId: request.commandId,
      projectSessionId: intent.projectSessionId,
      sessionRevision: integer(session, "revision"),
      sessionGeneration: integer(session, "generation"),
      globalStateRevision: this.#globalRevision(),
      obligations,
    });
    return {
      status: "committed",
      afterState: { lifecycleState: "quiescing", obligationsSettled: true },
      effectRef: receipt,
    };
  }

  #stopProject(
    request: OperatorEffectRequest & { intent: Extract<OperatorActionIntent, { kind: "project-session-stop" }> },
  ): OperatorEffectOutcome {
    const intent = request.intent;
    const receipt = this.#lifecycleReceipt(intent.drainReceiptRef);
    if (
      receipt.kind !== "project-session-drain" ||
      receipt.project_session_id !== intent.projectSessionId ||
      receipt.session_revision !== intent.expectedSessionRevision ||
      receipt.session_generation !== intent.expectedSessionGeneration ||
      receipt.global_state_revision !== intent.expectedGlobalStateRevision
    ) {
      throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "project stop drain receipt does not bind current state");
    }
    const obligations = this.#projectObligations(intent.projectSessionId);
    if (!obligations.settled || this.#globalRevision() !== intent.expectedGlobalStateRevision) {
      throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "project stop obligations changed after drain");
    }
    this.#database.transaction(() => {
      const session = row(this.#database.prepare(`
        SELECT revision, generation, state FROM project_sessions WHERE project_session_id=?
      `).get(intent.projectSessionId), "project session stop");
      if (
        integer(session, "revision") !== intent.expectedSessionRevision ||
        integer(session, "generation") !== intent.expectedSessionGeneration ||
        text(session, "state") !== "quiescing"
      ) throw new ProjectFabricCoreError("STALE_GENERATION", "project stop authority changed");
      const runs = this.#database.prepare(`
        SELECT run_id, revision FROM runs WHERE project_session_id=? AND lifecycle_state='quiescing'
      `).all(intent.projectSessionId) as Row[];
      for (const run of runs) {
        this.#database.prepare(`
          UPDATE runs SET lifecycle_state='cancelled', revision=revision+1 WHERE run_id=? AND revision=?
        `).run(text(run, "run_id"), integer(run, "revision"));
      }
      this.#database.prepare(`
        UPDATE run_chair_leases SET status='revoked', updated_at=?
         WHERE project_session_id=? AND status IN ('active','frozen')
           AND EXISTS (
             SELECT 1 FROM runs run
              WHERE run.project_session_id=run_chair_leases.project_session_id
                AND run.run_id=run_chair_leases.run_id
                AND run.chair_lease_id=run_chair_leases.lease_id
                AND run.chair_generation=run_chair_leases.generation
           )
      `).run(this.#clock(), intent.projectSessionId);
      this.#database.prepare(`
        UPDATE task_owner_leases SET status='revoked', updated_at=?
         WHERE project_session_id=? AND status IN ('active','frozen')
      `).run(this.#clock(), intent.projectSessionId);
      this.#database.prepare(`
        UPDATE capabilities SET revoked_at=?
         WHERE run_id IN (SELECT run_id FROM runs WHERE project_session_id=?) AND revoked_at IS NULL
      `).run(this.#clock(), intent.projectSessionId);
      this.#database.prepare(`
        UPDATE agents SET lifecycle='archived'
         WHERE run_id IN (SELECT run_id FROM runs WHERE project_session_id=?)
      `).run(intent.projectSessionId);
      const stopReason = `operator stop ${request.commandId}`;
      this.#database.prepare(`
        UPDATE project_session_memberships
           SET state='abandoned', abandoned_reason=?, revision=revision+1, updated_at=?
         WHERE project_session_id=? AND state='active' AND (
           (member_kind='coordination-run' AND member_id=coordination_run_id) OR
           (member_kind='lease' AND EXISTS (
             SELECT 1 FROM runs run
              WHERE run.project_session_id=project_session_memberships.project_session_id
                AND run.run_id=project_session_memberships.coordination_run_id
                AND run.chair_lease_id=project_session_memberships.member_id
           ))
         )
      `).run(stopReason, this.#clock(), intent.projectSessionId);
      const terminalPath = canonicalJson({ kind: "cancelled", reason: stopReason });
      const changed = this.#database.prepare(`
        UPDATE project_sessions
           SET state='cancelled', terminal_path_json=?, revision=revision+1, updated_at=?
         WHERE project_session_id=? AND revision=? AND generation=? AND state='quiescing'
      `).run(
        terminalPath,
        this.#clock(),
        intent.projectSessionId,
        intent.expectedSessionRevision,
        intent.expectedSessionGeneration,
      );
      if (changed.changes !== 1) throw new ProjectFabricCoreError("STALE_REVISION", "project stop raced another transition");
    })();
    return { status: "committed", afterState: { lifecycleState: "cancelled" } };
  }

  #drainDaemon(
    request: OperatorEffectRequest & { intent: Extract<OperatorActionIntent, { kind: "daemon-drain" }> },
  ): OperatorEffectOutcome {
    const intent = request.intent;
    const updated = this.#database.prepare(`
      UPDATE daemon_runtime_epochs
         SET state='quiescing', observed_global_revision=?, heartbeat_at=?
       WHERE instance_generation=? AND state='running'
         AND ?=(SELECT revision FROM daemon_global_state WHERE singleton=1)
    `).run(
      intent.expectedGlobalStateRevision,
      this.#clock(),
      intent.expectedDaemonGeneration,
      intent.expectedGlobalStateRevision,
    );
    if (updated.changes !== 1) {
      throw new ProjectFabricCoreError("STALE_GENERATION", "daemon drain epoch or global revision changed");
    }
    return this.#finishDaemonDrain(request.commandId, intent.expectedDaemonGeneration);
  }

  #finishDaemonDrain(commandId: string, daemonInstanceGeneration: number): OperatorEffectOutcome {
    const epoch = row(this.#database.prepare(`
      SELECT state FROM daemon_runtime_epochs WHERE instance_generation=?
    `).get(daemonInstanceGeneration), "daemon runtime epoch");
    if (text(epoch, "state") !== "quiescing") {
      return { status: "rejected", code: "state-changed", evidenceRefs: [] };
    }
    const liveness = readGlobalLiveness(this.#database, {
      now: this.#clock(),
      daemonInstanceGeneration,
    });
    if (liveness.failClosed || !liveness.idle || liveness.globalStateRevision === null) {
      return { status: "pending", phase: "observing" };
    }
    this.#database.prepare(`
      UPDATE daemon_runtime_epochs SET observed_global_revision=?, heartbeat_at=?
       WHERE instance_generation=? AND state='quiescing'
    `).run(liveness.globalStateRevision, this.#clock(), daemonInstanceGeneration);
    const receipt = this.#persistLifecycleReceipt({
      kind: "daemon-drain",
      commandId,
      daemonInstanceGeneration,
      globalStateRevision: liveness.globalStateRevision,
      obligations: liveness.contributors,
    });
    return {
      status: "committed",
      afterState: { lifecycleState: "quiescing", obligationsSettled: true },
      effectRef: receipt,
    };
  }

  async #stopDaemon(
    request: OperatorEffectRequest & { intent: Extract<OperatorActionIntent, { kind: "daemon-stop" }> },
  ): Promise<OperatorEffectOutcome> {
    const intent = request.intent;
    const receipt = this.#lifecycleReceipt(intent.drainReceiptRef);
    if (
      receipt.kind !== "daemon-drain" ||
      receipt.daemon_instance_generation !== intent.expectedDaemonGeneration ||
      receipt.global_state_revision !== intent.expectedGlobalStateRevision ||
      this.#globalRevision() !== intent.expectedGlobalStateRevision
    ) {
      throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "daemon stop drain receipt does not bind current state");
    }
    const epoch = row(this.#database.prepare(`
      SELECT state, observed_global_revision FROM daemon_runtime_epochs WHERE instance_generation=?
    `).get(intent.expectedDaemonGeneration), "daemon runtime epoch");
    if (text(epoch, "state") !== "quiescing" || integer(epoch, "observed_global_revision") !== intent.expectedGlobalStateRevision) {
      throw new ProjectFabricCoreError("STALE_GENERATION", "daemon stop epoch changed");
    }
    const liveness = readGlobalLiveness(this.#database, {
      now: this.#clock(),
      daemonInstanceGeneration: intent.expectedDaemonGeneration,
    });
    if (!liveness.idle || liveness.failClosed || liveness.globalStateRevision !== intent.expectedGlobalStateRevision) {
      throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "daemon stop is busy or global state changed");
    }
    const port = this.#daemonStop;
    if (port === undefined) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "guarded daemon stop owner is unavailable");
    }
    const outcome = await port.request({
      commandId: request.commandId,
      token: {
        daemonInstanceGeneration: intent.expectedDaemonGeneration,
        observedGlobalStateRevision: intent.expectedGlobalStateRevision,
      },
    });
    if (outcome === "stopped") {
      return { status: "committed", afterState: { lifecycleState: "stopped" } };
    }
    if (outcome === "scheduled") return { status: "pending", phase: "accepted" };
    return { status: "rejected", code: "state-changed", evidenceRefs: [intent.drainReceiptRef] };
  }

  #projectObligations(projectSessionId: string): {
    settled: boolean;
    tasks: number;
    leases: number;
    providerActions: number;
    memberships: number;
    requiredDeliveries: number;
    gates: number;
    barriers: number;
    artifacts: number;
  } {
    const count = (sql: string): number => integer(row(this.#database.prepare(sql).get(projectSessionId), "project obligation"), "count");
    const result = {
      tasks: count(`SELECT COUNT(*) AS count FROM tasks task JOIN runs run ON run.run_id=task.run_id
        WHERE run.project_session_id=? AND task.state NOT IN ('complete','cancelled','degraded')`),
      leases: count(`SELECT
        (SELECT COUNT(*) FROM leases lease JOIN runs run ON run.run_id=lease.run_id
          WHERE run.project_session_id=session.project_session_id
            AND lease.status IN ('active','quarantined')) +
        (SELECT COUNT(*) FROM task_owner_leases lease
          WHERE lease.project_session_id=session.project_session_id
            AND lease.status IN ('active','frozen')) +
        (SELECT COUNT(*) FROM run_chair_leases lease JOIN runs run ON run.run_id=lease.run_id
          WHERE lease.project_session_id=session.project_session_id
            AND lease.status IN ('active','frozen')
            AND (lease.lease_id<>run.chair_lease_id OR lease.generation<>run.chair_generation)) AS count
        FROM project_sessions session WHERE session.project_session_id=?`),
      providerActions: count(`SELECT COUNT(*) AS count FROM provider_actions action JOIN runs run ON run.run_id=action.run_id
        WHERE run.project_session_id=? AND action.status IN ('prepared','dispatched','accepted','ambiguous','quarantined')`),
      memberships: count(`SELECT COUNT(*) AS count FROM project_session_memberships membership
        WHERE membership.project_session_id=? AND membership.required=1 AND membership.state='active'
          AND NOT (
            (membership.member_kind='coordination-run'
              AND membership.member_id=membership.coordination_run_id) OR
            (membership.member_kind='lease' AND EXISTS (
              SELECT 1 FROM runs run JOIN run_chair_leases lease
                ON lease.project_session_id=run.project_session_id
               AND lease.run_id=run.run_id
               AND lease.lease_id=run.chair_lease_id
               AND lease.generation=run.chair_generation
               AND lease.status IN ('active','frozen')
             WHERE run.project_session_id=membership.project_session_id
               AND run.run_id=membership.coordination_run_id
               AND membership.member_id=run.chair_lease_id
            ))
          )`),
      requiredDeliveries: count(`SELECT COUNT(*) AS count FROM result_deliveries
        WHERE project_session_id=? AND required=1 AND state NOT IN ('consumed','abandoned')`),
      gates: count(`SELECT COUNT(*) AS count FROM scoped_gates
        WHERE project_session_id=? AND status IN ('pending','deferred')`),
      barriers: count(`SELECT COUNT(*) AS count FROM barriers barrier JOIN runs run ON run.run_id=barrier.run_id
        WHERE run.project_session_id=? AND barrier.state<>'closed'`),
      artifacts: count(`SELECT COUNT(*) AS count FROM task_expected_artifacts expected
        JOIN runs run ON run.run_id=expected.run_id
        WHERE run.project_session_id=? AND NOT EXISTS (
          SELECT 1 FROM artifacts artifact WHERE artifact.run_id=expected.run_id
            AND artifact.task_id=expected.task_id AND artifact.relative_path=expected.relative_path
        )`),
    };
    return { settled: Object.values(result).every((value) => value === 0), ...result };
  }

  #globalRevision(): number {
    return integer(row(this.#database.prepare(`
      SELECT revision FROM daemon_global_state WHERE singleton=1
    `).get(), "daemon global state"), "revision");
  }

  #latestReceipt(kind: "project-session-drain" | "daemon-drain", projectSessionId?: string): ArtifactRef | null {
    const value = projectSessionId === undefined
      ? this.#database.prepare(`
          SELECT relative_path, sha256 FROM operator_lifecycle_receipts
           WHERE kind=? ORDER BY created_at DESC, relative_path DESC LIMIT 1
        `).get(kind)
      : this.#database.prepare(`
          SELECT relative_path, sha256 FROM operator_lifecycle_receipts
           WHERE kind=? AND project_session_id=? ORDER BY created_at DESC, relative_path DESC LIMIT 1
        `).get(kind, projectSessionId);
    if (!isRow(value)) return null;
    return parseArtifactRef({ path: text(value, "relative_path"), digest: text(value, "sha256") }, "operatorLifecycle.receipt");
  }

  #latestDaemonReceipt(daemonInstanceGeneration: number): ArtifactRef | null {
    const value = this.#database.prepare(`
      SELECT relative_path, sha256 FROM operator_lifecycle_receipts
       WHERE kind='daemon-drain' AND daemon_instance_generation=?
       ORDER BY created_at DESC, relative_path DESC LIMIT 1
    `).get(daemonInstanceGeneration);
    if (!isRow(value)) return null;
    return parseArtifactRef({ path: text(value, "relative_path"), digest: text(value, "sha256") }, "operatorLifecycle.daemonReceipt");
  }

  #persistLifecycleReceipt(input: {
    kind: "project-session-drain" | "daemon-drain";
    commandId: string;
    projectSessionId?: string;
    daemonInstanceGeneration?: number;
    sessionRevision?: number;
    sessionGeneration?: number;
    globalStateRevision: number;
    obligations: unknown;
  }): ArtifactRef {
    const receiptValue = {
      schemaVersion: 1,
      kind: input.kind,
      commandId: input.commandId,
      projectSessionId: input.projectSessionId ?? null,
      daemonInstanceGeneration: input.daemonInstanceGeneration ?? null,
      sessionRevision: input.sessionRevision ?? null,
      sessionGeneration: input.sessionGeneration ?? null,
      globalStateRevision: input.globalStateRevision,
      obligations: input.obligations,
    };
    const digest = `sha256:${sha256(canonicalJson(receiptValue))}`;
    const path = `.agent-fabric/lifecycle-receipts/${input.kind}-${sha256(input.commandId).slice(0, 32)}.json`;
    this.#database.prepare(`
      INSERT INTO operator_lifecycle_receipts(
        relative_path, sha256, kind, project_session_id, daemon_instance_generation,
        session_revision, session_generation, global_state_revision, command_id,
        receipt_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(kind, command_id) DO NOTHING
    `).run(
      path,
      digest,
      input.kind,
      input.projectSessionId ?? null,
      input.daemonInstanceGeneration ?? null,
      input.sessionRevision ?? null,
      input.sessionGeneration ?? null,
      input.globalStateRevision,
      input.commandId,
      canonicalJson(receiptValue),
      this.#clock(),
    );
    const stored = row(this.#database.prepare(`
      SELECT relative_path, sha256 FROM operator_lifecycle_receipts WHERE kind=? AND command_id=?
    `).get(input.kind, input.commandId), "operator lifecycle receipt");
    if (text(stored, "relative_path") !== path || text(stored, "sha256") !== digest) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "lifecycle receipt command changed");
    }
    return parseArtifactRef({ path, digest }, "operatorLifecycle.receipt");
  }

  #lifecycleReceipt(reference: ArtifactRef): Row {
    return row(this.#database.prepare(`
      SELECT * FROM operator_lifecycle_receipts WHERE relative_path=? AND sha256=?
    `).get(reference.path, reference.digest), "operator lifecycle drain receipt");
  }
}

export function createProductionOperatorActionPorts(options: {
  database: Database.Database;
  clock?: () => number;
  adapter: ProductionOperatorAdapterPort;
  daemonStop?: ProductionDaemonStopPort;
}): ProductionOperatorActionPorts {
  const owner = new ProductionOperatorActions({
    database: options.database,
    clock: options.clock ?? Date.now,
    adapter: options.adapter,
    ...(options.daemonStop === undefined ? {} : { daemonStop: options.daemonStop }),
  });
  return { statePort: owner.statePort, effectPort: owner.effectPort };
}

import type {
  ArtifactRef,
  JsonValue,
  OperatorActionIntent,
  Sha256Digest,
} from "@local/agent-fabric-protocol";
import { parseArtifactRef, parseSha256Digest } from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import type {
  OperatorActionEffectPort,
  OperatorActionStatePort,
  OperatorEffectOutcome,
  OperatorEffectRequest,
} from "./action-store.js";
import type {
  ExternalEffectDispatchHandle,
} from "./external-effect-service.js";
import { ExternalEffectService } from "./external-effect-service.js";
import { ProjectFabricCoreError } from "../project-session/contracts.js";
import { supersedeFinalAcceptanceGates } from "../project-session/acceptance-cycle.js";
import { retireProjectSessionBridges } from "../project-session/bridge-retirement.js";
import { canonicalJson, sha256 } from "../project-session/store-support.js";
import {
  touchProjectSessionMembershipRevision,
  touchProjectSessionMembershipRevisionForRun,
} from "../project-session/membership-store.js";
import { readGlobalLiveness, type QuiesceToken } from "../daemon/global-liveness.js";
import {
  TypedGitService,
  type TypedGitAdministrativeRequest,
  type TypedGitEffectRequest,
} from "./typed-git-service.js";
import {
  readControlActiveTurns,
  readControlEligibility,
  type ActiveTurn,
  type ResolvedControlTarget,
} from "./control-eligibility.js";

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
  request(input: Readonly<{
    custodyId: string;
    resultCorrelationDigest: string;
    operatorId: string;
    projectId: string;
    projectSessionId: string;
    principalGeneration: number;
    commandId: string;
    operation: "daemon-stop";
    token: QuiesceToken;
  }>): Promise<"stopped" | "scheduled" | "busy">;
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

export function assertTaskOperationAdmitted(
  database: Database.Database,
  runId: string,
  taskId: string,
): void {
  assertRunAcceptingWork(database, runId);
  row(database.prepare("SELECT 1 FROM tasks WHERE run_id=? AND task_id=?").get(runId, taskId), "task operation target");
  assertOperatorTaskRunnable(database, runId, taskId);
}

export function resolveTaskBindingForActiveWork(
  database: Database.Database,
  runId: string,
  actorAgentId: string,
  taskId: string | undefined,
): string | undefined {
  if (taskId !== undefined) {
    assertTaskOperationAdmitted(database, runId, taskId);
    return taskId;
  }
  assertRunAcceptingWork(database, runId);
  const activeTasks = database.prepare(`
    SELECT task.task_id FROM tasks task
     WHERE task.run_id=? AND task.state NOT IN ('complete','cancelled','degraded')
       AND (task.owner_agent_id=? OR EXISTS (
         SELECT 1 FROM task_participants participant
          WHERE participant.run_id=task.run_id AND participant.task_id=task.task_id
            AND participant.agent_id=?
       ))
     ORDER BY task.task_id
     LIMIT 2
  `).all(runId, actorAgentId, actorAgentId).filter(isRow);
  if (activeTasks.length > 1) {
    throw new ProjectFabricCoreError(
      "LIFECYCLE_PRECONDITION_FAILED",
      "ambiguous active task work requires an exact task ID",
    );
  }
  const inferred = activeTasks[0];
  if (inferred === undefined) return undefined;
  const inferredTaskId = text(inferred, "task_id");
  assertTaskOperationAdmitted(database, runId, inferredTaskId);
  return inferredTaskId;
}

export function assertRunAcceptingWork(database: Database.Database, runId: string): void {
  const value = row(database.prepare(`
    SELECT session.state AS session_state, session.origin_kind,
           run.lifecycle_state AS run_state
      FROM runs run JOIN project_sessions session ON session.project_session_id=run.project_session_id
     WHERE run.run_id=?
  `).get(runId), "coordination run lifecycle");
  const sessionState = text(value, "session_state");
  const runState = text(value, "run_state");
  const active = ["active", "visibility_degraded"].includes(sessionState) &&
    ["active", "visibility_degraded"].includes(runState);
  if (!active) {
    throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "project session is not accepting new work");
  }
  const epoch = database.prepare(`
    SELECT state FROM daemon_runtime_epochs ORDER BY instance_generation DESC LIMIT 1
  `).get();
  if (isRow(epoch) && epoch.state !== "running") {
    throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "daemon is not accepting new work");
  }
  if (isRow(database.prepare(`
    SELECT 1 FROM delivery_freezes WHERE run_id=? AND reason LIKE 'operator-pause:%'
  `).get(runId))) {
    throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "coordination run is paused by the operator");
  }
}

type EffectScope = {
  operatorId: string;
  projectId: string;
  projectSessionId: string;
  principalGeneration: number;
  operation: string;
};

type StoredControlAction = {
  runId: string;
  actionId: string;
  adapterId: string;
  operation: "interrupt" | "steer";
  status: "prepared" | "dispatched" | "accepted" | "terminal" | "ambiguous" | "quarantined";
  payloadHash: string;
  sourceActionId: string;
  sourcePayloadHash: string;
  agentId: string;
  resumeReference: string;
  providerSessionGeneration: number;
  turnLeaseGeneration: number;
  turnId: string;
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

function isTypedGitAdministration(
  intent: OperatorActionIntent,
): intent is Extract<OperatorActionIntent, { kind: "git-authorise" | "git-operation-draft" | "git-custody-resolve" }> {
  return intent.kind === "git-authorise" || intent.kind === "git-operation-draft" || intent.kind === "git-custody-resolve";
}

function digestValue(value: unknown, path: string): Sha256Digest {
  return parseSha256Digest(`sha256:${sha256(canonicalJson(value))}`, path);
}

class ProductionOperatorActions {
  readonly #database: Database.Database;
  readonly #clock: () => number;
  readonly #adapter: ProductionOperatorAdapterPort;
  readonly #daemonStop: ProductionDaemonStopPort | undefined;
  readonly #externalEffects: ExternalEffectService | undefined;
  readonly #typedGit: TypedGitService | undefined;
  readonly #retireVolatileProjectSession: ((projectSessionId: string) => void) | undefined;
  readonly #externalEffectHandles = new Map<string, ExternalEffectDispatchHandle>();
  readonly #fault: (label: string) => void;

  constructor(options: {
    database: Database.Database;
    clock: () => number;
    adapter: ProductionOperatorAdapterPort;
    daemonStop?: ProductionDaemonStopPort;
    externalEffects?: ExternalEffectService;
    typedGit?: TypedGitService;
    retireVolatileProjectSession?: (projectSessionId: string) => void;
    fault?: (label: string) => void;
  }) {
    this.#database = options.database;
    this.#clock = options.clock;
    this.#adapter = options.adapter;
    this.#daemonStop = options.daemonStop;
    this.#externalEffects = options.externalEffects;
    this.#typedGit = options.typedGit;
    this.#retireVolatileProjectSession = options.retireVolatileProjectSession;
    this.#fault = options.fault ?? (() => undefined);
  }

  readonly statePort: OperatorActionStatePort = {
    read: async (intent) => this.#read(intent),
  };

  readonly effectPort: OperatorActionEffectPort = {
    prepare: (request) => this.#prepareEffect(request),
    dispatch: async (request) => await this.#dispatch(request),
    observe: async (request) => await this.#observe(request),
    status: (commandId, intentDigest) => this.#typedGit?.status(commandId, intentDigest) ?? null,
    reconcileGit: async (input) => {
      if (this.#typedGit === undefined || input.request.gitConflict === undefined) unsupported();
      return await this.#typedGit.reconcileConflict({
        reconciliationCommandId: input.request.command.commandId,
        targetCommandId: input.request.targetCommandId,
        intentDigest: input.intentDigest,
        nextAttemptGeneration: input.nextAttemptGeneration,
        binding: input.request.gitConflict,
      });
    },
  };

  #read(intent: OperatorActionIntent): Promise<Awaited<ReturnType<OperatorActionStatePort["read"]>>> {
    if (intent.kind === "git") {
      if (this.#typedGit === undefined) unsupported();
      return this.#typedGit.readCurrentState(intent).then((state) => ({ kind: "git", revision: state.revision, state }));
    }
    if (isTypedGitAdministration(intent)) {
      if (this.#typedGit === undefined) unsupported();
      const current = this.#typedGit.readAdministrativeCurrentState(intent);
      return Promise.resolve({ kind: "git-administration", ...current });
    }
    if (intent.kind === "registered-external-effect" || intent.kind === "promotion") {
      if (this.#externalEffects === undefined) unsupported();
      return this.#externalEffects.readCurrentState(intent);
    }
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
        drainReceiptRef: intent.kind === "project-session-stop" ? intent.drainReceiptRef : null,
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
        drainReceiptRef: intent.kind === "daemon-stop" ? intent.drainReceiptRef : null,
      });
    }
    if (intent.kind !== "control") unsupported();
    const target = this.#resolveControlTarget(intent);
    const activeTurns = this.#activeTurns(target);
    const eligibility = readControlEligibility(this.#database, target, activeTurns);
    return Promise.resolve({
      kind: "control",
      revision: target.revision,
      ...eligibility,
      binding: this.#controlBinding(target, activeTurns),
    });
  }

  #effectScope(request: OperatorEffectRequest): EffectScope {
    let projectSessionId = request.projectSessionId;
    if (projectSessionId === undefined) {
      if (request.intent.kind === "control") projectSessionId = request.intent.target.projectSessionId;
      else if (request.intent.kind === "project-session-drain" || request.intent.kind === "project-session-stop") {
        projectSessionId = request.intent.projectSessionId;
      } else {
        const fallback = row(this.#database.prepare(`
          SELECT project_session_id FROM project_sessions ORDER BY project_session_id LIMIT 1
        `).get(), "operator effect authority session");
        projectSessionId = text(fallback, "project_session_id");
      }
    }
    const session = row(this.#database.prepare(`
      SELECT project_id FROM project_sessions WHERE project_session_id=?
    `).get(projectSessionId), "operator effect authority session");
    const projectId = request.projectId ?? text(session, "project_id");
    if (projectId !== text(session, "project_id")) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "operator effect scope is bound to another project");
    }
    const principalGeneration = request.principalGeneration ?? 1;
    if (!Number.isSafeInteger(principalGeneration) || principalGeneration < 1) {
      throw new ProjectFabricCoreError("STALE_GENERATION", "operator effect principal generation is invalid");
    }
    return {
      operatorId: request.operatorId ?? "operator_direct_test",
      projectId,
      projectSessionId,
      principalGeneration,
      operation: request.operation ?? (request.intent.kind === "control" ? request.intent.action : request.intent.kind),
    };
  }

  #custodyId(scope: EffectScope, commandId: string): string {
    return `operator-effect-${sha256(canonicalJson({
      operatorId: scope.operatorId,
      projectId: scope.projectId,
      projectSessionId: scope.projectSessionId,
      principalGeneration: scope.principalGeneration,
      operation: scope.operation,
      commandId,
    })).slice(0, 48)}`;
  }

  #effectCustody(scope: EffectScope, commandId: string): Row | null {
    const value = this.#database.prepare(`
      SELECT * FROM operator_effect_custody
       WHERE operator_id=? AND project_id=? AND project_session_id=? AND command_id=?
    `).get(scope.operatorId, scope.projectId, scope.projectSessionId, commandId);
    return isRow(value) ? value : null;
  }

  #assertCustodyIdentity(custody: Row, scope: EffectScope, request: OperatorEffectRequest): void {
    if (
      text(custody, "custody_id") !== this.#custodyId(scope, request.commandId) ||
      integer(custody, "principal_generation") !== scope.principalGeneration ||
      text(custody, "operation") !== scope.operation ||
      text(custody, "intent_digest") !== request.intentDigest ||
      (request.operatorId !== undefined && text(custody, "before_state_digest") !== request.beforeStateDigest) ||
      text(custody, "intent_json") !== canonicalJson(request.intent)
    ) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "operator effect custody identity changed");
    }
  }

  #prepareEffect(request: OperatorEffectRequest): void {
    if (isTypedGitAdministration(request.intent)) {
      if (this.#typedGit === undefined) unsupported();
      this.#typedGit.prepareAdministrative(this.#typedGitAdministrativeRequest(request));
      return;
    }
    const scope = this.#effectScope(request);
    const custodyId = this.#custodyId(scope, request.commandId);
    const intentJson = canonicalJson(request.intent);
    const external = request.intent.kind === "registered-external-effect" || request.intent.kind === "promotion";
    const git = request.intent.kind === "git";
    if (external && this.#externalEffects === undefined) unsupported();
    if (git && this.#typedGit === undefined) unsupported();
    const externalHandle = this.#database.transaction((): ExternalEffectDispatchHandle | undefined => {
      const existing = this.#effectCustody(scope, request.commandId);
      if (existing !== null) {
        this.#assertCustodyIdentity(existing, scope, request);
        if (git) this.#typedGit?.prepare(this.#typedGitRequest(request, scope));
        return external ? this.#externalEffects?.prepareInTransaction(request) : undefined;
      }
      this.#database.prepare(`
        INSERT INTO operator_effect_custody(
          custody_id, operator_id, project_id, project_session_id, principal_generation, command_id,
          operation, intent_digest, before_state_digest, intent_json, state,
          effect_path, effect_digest, outcome_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'prepared', NULL, NULL, NULL, ?, ?)
      `).run(
        custodyId,
        scope.operatorId,
        scope.projectId,
        scope.projectSessionId,
        scope.principalGeneration,
        request.commandId,
        scope.operation,
        request.intentDigest,
        request.beforeStateDigest,
        intentJson,
        this.#clock(),
        this.#clock(),
      );
      const preparedExternal = external
        ? this.#externalEffects?.prepareInTransaction(request)
        : undefined;
      if (git) this.#typedGit?.prepare(this.#typedGitRequest(request, scope));
      if (request.intent.kind === "daemon-stop") {
        const correlationDigest = `sha256:${sha256(canonicalJson({
          custodyId,
          operatorId: scope.operatorId,
          projectId: scope.projectId,
          projectSessionId: scope.projectSessionId,
          principalGeneration: scope.principalGeneration,
          commandId: request.commandId,
          operation: scope.operation,
          intentDigest: request.intentDigest,
        }))}`;
        try {
          this.#database.prepare(`
            INSERT INTO operator_daemon_stop_custody(
              daemon_instance_generation, observed_global_revision, custody_id,
              operator_id, project_id, project_session_id, principal_generation, command_id, operation,
              result_correlation_digest, state, result_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'daemon-stop', ?, 'prepared', NULL, ?)
          `).run(
            request.intent.expectedDaemonGeneration,
            request.intent.expectedGlobalStateRevision,
            custodyId,
            scope.operatorId,
            scope.projectId,
            scope.projectSessionId,
            scope.principalGeneration,
            request.commandId,
            correlationDigest,
            this.#clock(),
          );
        } catch (error: unknown) {
          if (error instanceof Error && /UNIQUE constraint failed/u.test(error.message)) {
            throw new ProjectFabricCoreError("CONFLICT", "another operator command owns daemon stop custody");
          }
          throw error;
        }
      }
      return preparedExternal;
    })();
    if (externalHandle !== undefined) this.#externalEffectHandles.set(custodyId, externalHandle);
  }

  #custodyEffectRef(custody: Row): ArtifactRef {
    return parseArtifactRef({
      path: `.agent-fabric/operator-effects/${text(custody, "custody_id")}.json`,
      digest: `sha256:${sha256(canonicalJson({
        custodyId: text(custody, "custody_id"),
        intentDigest: text(custody, "intent_digest"),
        beforeStateDigest: text(custody, "before_state_digest"),
      }))}`,
    }, "productionOperatorAction.custodyEffectRef");
  }

  #storedCustodyOutcome(custody: Row): OperatorEffectOutcome | null {
    const serialized = nullableText(custody, "outcome_json");
    if (serialized === null) return null;
    const value: unknown = JSON.parse(serialized);
    if (!isRow(value) || typeof value.status !== "string") throw new Error("operator effect custody outcome is invalid");
    return value as OperatorEffectOutcome;
  }

  #storeCustodyOutcome(scope: EffectScope, commandId: string, outcome: OperatorEffectOutcome): void {
    const state = outcome.status === "committed"
      ? "terminal"
      : outcome.status === "rejected"
        ? "rejected"
        : outcome.status === "ambiguous"
          ? "ambiguous"
          : "dispatching";
    const effectRef = outcome.status === "ambiguous" || (outcome.status === "committed" && outcome.effectRef !== undefined)
      ? outcome.effectRef
      : null;
    this.#database.prepare(`
      UPDATE operator_effect_custody
         SET state=?, effect_path=?, effect_digest=?, outcome_json=?, updated_at=?
       WHERE operator_id=? AND project_id=? AND project_session_id=? AND command_id=?
    `).run(
      state,
      effectRef?.path ?? null,
      effectRef?.digest ?? null,
      canonicalJson(outcome),
      this.#clock(),
      scope.operatorId,
      scope.projectId,
      scope.projectSessionId,
      commandId,
    );
  }

  async #dispatch(request: OperatorEffectRequest): Promise<OperatorEffectOutcome> {
    if (isTypedGitAdministration(request.intent)) {
      if (this.#typedGit === undefined) unsupported();
      return this.#typedGit.administrativeOutcome(request.intent);
    }
    if (request.intent.kind === "git") {
      if (this.#typedGit === undefined) unsupported();
      const scope = this.#effectScope(request);
      if (this.#effectCustody(scope, request.commandId) === null) this.#prepareEffect(request);
      return await this.#typedGit.dispatch(this.#typedGitRequest(request, scope));
    }
    let effective = request;
    let scope = this.#effectScope(effective);
    let custody = this.#effectCustody(scope, effective.commandId);
    if (custody === null) {
      if (effective.operatorId === undefined) {
        const current = await this.#read(effective.intent);
        effective = { ...effective, beforeStateDigest: digestValue(current, "operatorEffect.directBeforeState") };
        scope = this.#effectScope(effective);
      }
      this.#prepareEffect(effective);
      custody = row(this.#effectCustody(scope, effective.commandId), "operator effect custody");
    }
    this.#assertCustodyIdentity(custody, scope, effective);
    const existingOutcome = this.#storedCustodyOutcome(custody);
    const custodyState = text(custody, "state");
    if (["terminal", "rejected", "no-effect"].includes(custodyState) && existingOutcome !== null) return existingOutcome;
    if (custodyState !== "prepared") {
      return existingOutcome ?? { status: "ambiguous", effectRef: this.#custodyEffectRef(custody) };
    }
    const current = await this.#read(effective.intent);
    const currentDigest = digestValue(current, "operatorEffect.currentState");
    if (currentDigest !== text(custody, "before_state_digest")) {
      const rejected: OperatorEffectOutcome = { status: "rejected", code: "state-changed", evidenceRefs: [] };
      this.#database.prepare(`
        UPDATE operator_effect_custody SET state='no-effect', outcome_json=?, updated_at=?
         WHERE custody_id=? AND state='prepared'
      `).run(canonicalJson(rejected), this.#clock(), text(custody, "custody_id"));
      return rejected;
    }
    const claimed = this.#database.prepare(`
      UPDATE operator_effect_custody SET state='dispatching', updated_at=?
       WHERE custody_id=? AND state='prepared'
    `).run(this.#clock(), text(custody, "custody_id"));
    if (claimed.changes !== 1) {
      const raced = row(this.#effectCustody(scope, effective.commandId), "operator effect custody");
      return this.#storedCustodyOutcome(raced) ?? { status: "ambiguous", effectRef: this.#custodyEffectRef(raced) };
    }
    try {
      const outcome = await this.#dispatchOwned(effective);
      this.#fault("operator-effect:after-owned-dispatch");
      this.#storeCustodyOutcome(scope, effective.commandId, outcome);
      return outcome;
    } catch (error: unknown) {
      if (effective.intent.kind === "project-session-drain" || effective.intent.kind === "project-session-stop") {
        const rejected: OperatorEffectOutcome = { status: "rejected", code: "state-changed", evidenceRefs: [] };
        this.#database.prepare(`
          UPDATE operator_effect_custody SET state='no-effect',outcome_json=?,updated_at=?
           WHERE custody_id=? AND state='dispatching'
        `).run(canonicalJson(rejected), this.#clock(), text(custody, "custody_id"));
      } else {
        this.#database.prepare(`
          UPDATE operator_effect_custody SET state='failed', updated_at=?
           WHERE custody_id=? AND state='dispatching'
        `).run(this.#clock(), text(custody, "custody_id"));
      }
      throw error;
    }
  }

  async #observe(
    request: OperatorEffectRequest & { effectRef: ArtifactRef | null },
  ): Promise<OperatorEffectOutcome> {
    if (isTypedGitAdministration(request.intent)) {
      if (this.#typedGit === undefined) unsupported();
      return this.#typedGit.administrativeOutcome(request.intent);
    }
    if (request.intent.kind === "git") {
      if (this.#typedGit === undefined) unsupported();
      return await this.#typedGit.observe(this.#typedGitRequest(request, this.#effectScope(request)));
    }
    const scope = this.#effectScope(request);
    const custody = this.#effectCustody(scope, request.commandId);
    if (custody === null) return { status: "rejected", code: "state-changed", evidenceRefs: [] };
    this.#assertCustodyIdentity(custody, scope, request);
    const state = text(custody, "state");
    const existing = this.#storedCustodyOutcome(custody);
    if (state === "prepared") {
      const rejected: OperatorEffectOutcome = { status: "rejected", code: "state-changed", evidenceRefs: [] };
      this.#database.transaction(() => {
        this.#database.prepare(`
          UPDATE operator_effect_custody SET state='no-effect', outcome_json=?, updated_at=?
           WHERE custody_id=? AND state='prepared'
        `).run(canonicalJson(rejected), this.#clock(), text(custody, "custody_id"));
        if (request.intent.kind === "daemon-stop") {
          this.#database.prepare(`
            UPDATE operator_daemon_stop_custody SET state='no-effect', result_json=?, updated_at=?
             WHERE custody_id=? AND state='prepared'
          `).run(
            canonicalJson({ provedNoEffect: true, reason: "dispatch-not-started" }),
            this.#clock(),
            text(custody, "custody_id"),
          );
        }
      })();
      return rejected;
    }
    if (["terminal", "rejected", "no-effect"].includes(state) && existing !== null) return existing;
    const outcome = await this.#observeOwned(request);
    this.#storeCustodyOutcome(scope, request.commandId, outcome);
    return outcome;
  }

  async #dispatchOwned(request: OperatorEffectRequest): Promise<OperatorEffectOutcome> {
    if (request.intent.kind === "registered-external-effect" || request.intent.kind === "promotion") {
      if (this.#externalEffects === undefined) unsupported();
      const custodyId = this.#custodyId(this.#effectScope(request), request.commandId);
      const handle = this.#externalEffectHandles.get(custodyId);
      if (handle === undefined) {
        throw new ProjectFabricCoreError("RECOVERY_REQUIRED", "external-effect dispatch handle is unavailable");
      }
      this.#externalEffectHandles.delete(custodyId);
      return await this.#externalEffects.dispatchPrepared(handle);
    }
    if (request.intent.kind === "project-session-drain") return this.#drainProject({ ...request, intent: request.intent });
    if (request.intent.kind === "project-session-stop") return this.#stopProject({ ...request, intent: request.intent });
    if (request.intent.kind === "daemon-drain") return this.#drainDaemon({ ...request, intent: request.intent });
    if (request.intent.kind === "daemon-stop") return await this.#stopDaemon({ ...request, intent: request.intent });
    if (request.intent.kind !== "control") unsupported();
    const target = this.#resolveControlTarget(request.intent);
    if (request.intent.action === "resume") {
      return this.#resume(request, target);
    }
    if (request.intent.action === "pause") {
      const activeTurns = this.#activeTurns(target);
      if (activeTurns.length > 0) {
        return await this.#dispatchExternalControl(request, activeTurns, "interrupt");
      }
      return this.#freeze(target, `operator-pause:${request.commandId}`, request);
    }
    if (request.intent.action === "cancel") {
      const activeTurns = this.#activeTurns(target);
      if (activeTurns.length > 0) {
        return await this.#dispatchExternalControl(request, activeTurns, "interrupt");
      }
      return this.#cancel(target, request);
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

  #typedGitRequest(request: OperatorEffectRequest, scope: EffectScope): TypedGitEffectRequest {
    if (request.intent.kind !== "git") throw new TypeError("typed Git request requires a Git intent");
    return {
      commandId: request.commandId,
      previewId: request.previewId ?? request.commandId,
      operatorId: scope.operatorId,
      projectId: scope.projectId,
      projectSessionId: scope.projectSessionId,
      principalGeneration: scope.principalGeneration,
      operation: scope.operation,
      intent: request.intent,
      intentDigest: request.intentDigest,
      beforeStateDigest: request.beforeStateDigest,
      attemptGeneration: request.attemptGeneration,
    };
  }

  #typedGitAdministrativeRequest(request: OperatorEffectRequest): TypedGitAdministrativeRequest {
    if (!isTypedGitAdministration(request.intent)) throw new TypeError("typed Git administration requires its closed intent");
    if (request.operatorInputRecordDigest === undefined) {
      throw new ProjectFabricCoreError(
        "CAPABILITY_FORBIDDEN",
        "typed Git administration requires the exact independently attested operator input record",
      );
    }
    const scope = this.#effectScope(request);
    return {
      commandId: request.commandId,
      previewId: request.previewId ?? request.commandId,
      operatorId: scope.operatorId,
      projectId: scope.projectId,
      projectSessionId: scope.projectSessionId,
      principalGeneration: scope.principalGeneration,
      operation: scope.operation,
      intent: request.intent,
      intentDigest: request.intentDigest,
      beforeStateDigest: request.beforeStateDigest,
      attemptGeneration: request.attemptGeneration,
      operatorInputRecordDigest: request.operatorInputRecordDigest,
    };
  }

  async #observeOwned(
    request: OperatorEffectRequest & { effectRef: ArtifactRef | null },
  ): Promise<OperatorEffectOutcome> {
    if (request.intent.kind === "registered-external-effect" || request.intent.kind === "promotion") {
      if (this.#externalEffects === undefined) unsupported();
      return await this.#externalEffects.observe(request);
    }
    if (request.intent.kind === "project-session-drain") {
      const session = row(this.#database.prepare(`
        SELECT revision, generation, state FROM project_sessions WHERE project_session_id=?
      `).get(request.intent.projectSessionId), "project session lifecycle");
      if (text(session, "state") !== "quiescing") {
        return { status: "rejected", code: "state-changed", evidenceRefs: [] };
      }
      const obligations = this.#projectObligations(
        request.intent.projectSessionId,
        this.#custodyId(this.#effectScope(request), request.commandId),
      );
      if (!obligations.settled) return { status: "pending", phase: "observing" };
      const receipt = this.#persistLifecycleReceipt({
        scope: this.#effectScope(request),
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
    if (request.intent.kind === "project-session-stop") {
      const session = row(this.#database.prepare(`
        SELECT state, terminal_path_json FROM project_sessions WHERE project_session_id=?
      `).get(request.intent.projectSessionId), "project session stop observation");
      const expectedTerminal = canonicalJson({
        kind: "cancelled",
        reason: `operator stop ${request.commandId}`,
      });
      if (text(session, "state") === "cancelled" && session.terminal_path_json === expectedTerminal) {
        return { status: "committed", afterState: { lifecycleState: "cancelled" } };
      }
      if (text(session, "state") === "quiescing") {
        return { status: "rejected", code: "state-changed", evidenceRefs: [] };
      }
      const effectCustody = row(this.#effectCustody(this.#effectScope(request), request.commandId), "operator effect custody");
      return { status: "ambiguous", effectRef: this.#custodyEffectRef(effectCustody) };
    }
    if (request.intent.kind === "daemon-drain") {
      return this.#finishDaemonDrain(
        request.commandId,
        request.intent.expectedDaemonGeneration,
        this.#effectScope(request),
      );
    }
    if (request.intent.kind === "daemon-stop") {
      const scope = this.#effectScope(request);
      const custodyId = this.#custodyId(scope, request.commandId);
      const stopCustody = row(this.#database.prepare(`
        SELECT state FROM operator_daemon_stop_custody
         WHERE daemon_instance_generation=? AND custody_id=?
           AND operator_id=? AND project_id=? AND project_session_id=?
           AND principal_generation=? AND command_id=? AND operation='daemon-stop'
      `).get(
        request.intent.expectedDaemonGeneration,
        custodyId,
        scope.operatorId,
        scope.projectId,
        scope.projectSessionId,
        scope.principalGeneration,
        request.commandId,
      ), "daemon stop custody");
      const stopState = text(stopCustody, "state");
      const epoch = row(this.#database.prepare(`
        SELECT state, observed_global_revision FROM daemon_runtime_epochs WHERE instance_generation=?
      `).get(request.intent.expectedDaemonGeneration), "daemon runtime epoch");
      if (text(epoch, "state") === "stopped") {
        this.#database.prepare(`
          UPDATE operator_daemon_stop_custody
             SET state='stopped', result_json=?, updated_at=?
           WHERE daemon_instance_generation=? AND custody_id=?
             AND operator_id=? AND project_id=? AND project_session_id=?
             AND principal_generation=? AND command_id=? AND operation='daemon-stop'
             AND state IN ('prepared','scheduled','failed')
        `).run(
          canonicalJson({ stopped: true, observedBy: "daemon-runtime-epoch" }),
          this.#clock(),
          request.intent.expectedDaemonGeneration,
          custodyId,
          scope.operatorId,
          scope.projectId,
          scope.projectSessionId,
          scope.principalGeneration,
          request.commandId,
        );
        return { status: "committed", afterState: { lifecycleState: "stopped" } };
      }
      if (stopState === "rejected") {
        return { status: "rejected", code: "state-changed", evidenceRefs: [request.intent.drainReceiptRef] };
      }
      if (stopState === "failed") {
        const effectCustody = row(this.#effectCustody(scope, request.commandId), "operator effect custody");
        return { status: "ambiguous", effectRef: this.#custodyEffectRef(effectCustody) };
      }
      if (text(epoch, "state") === "quiescing") return { status: "pending", phase: "observing" };
      return { status: "rejected", code: "state-changed", evidenceRefs: [] };
    }
    if (request.intent.kind !== "control") unsupported();
    const stored = this.#controlActions(request);
    if (stored.length === 0) {
      return { status: "rejected", code: "state-changed", evidenceRefs: [] };
    }
    const expectedEffectRef = this.#effectRef(request, stored);
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
        return { status: "ambiguous", effectRef: this.#effectRef(request, this.#controlActions(request)) };
      }
      this.#persistAdapterResult(action, result);
    }
    const reconciled = this.#controlActions(request);
    if (!reconciled.every((action) => action.status === "terminal")) {
      return { status: "ambiguous", effectRef: this.#effectRef(request, reconciled) };
    }
    const target = this.#resolveControlTarget(request.intent);
    if (request.intent.action === "pause") {
      return this.#freeze(target, `operator-pause:${request.commandId}`, request);
    }
    if (request.intent.action === "steer") {
      return { status: "committed", afterState: { lifecycleState: "active", steered: true } };
    }
    if (request.intent.action === "cancel") return this.#cancel(target, request);
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
      const scopedAgentIds = new Set(taskRows.flatMap((item) => {
        const owner = nullableText(item, "owner_agent_id");
        return owner === null ? [] : [owner];
      }));
      if (taskRows.length > 0) {
        const taskIds = taskRows.map((item) => text(item, "task_id"));
        const participants = this.#database.prepare(`
          SELECT DISTINCT agent_id FROM task_participants
           WHERE run_id=? AND task_id IN (${taskIds.map(() => "?").join(",")})
           ORDER BY agent_id
        `).all(target.coordinationRunId, ...taskIds).filter(isRow);
        for (const participant of participants) scopedAgentIds.add(text(participant, "agent_id"));
      }
      agentRows = [...scopedAgentIds].sort().map((agentId) => row(this.#database.prepare(`
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
    return readControlActiveTurns(this.#database, target);
  }

  #controlBinding(target: ResolvedControlTarget, activeTurns: readonly ActiveTurn[]): JsonValue {
    const session = row(this.#database.prepare(`
      SELECT project_id, revision, generation, membership_revision
        FROM project_sessions WHERE project_session_id=?
    `).get(target.projectSessionId), "operator control session binding");
    return {
      projectId: text(session, "project_id"),
      projectSessionId: target.projectSessionId,
      sessionRevision: integer(session, "revision"),
      sessionGeneration: integer(session, "generation"),
      membershipRevision: integer(session, "membership_revision"),
      scopeKind: target.scopeKind,
      targetRevision: target.revision,
      runs: target.runs.map((runId) => {
        const run = row(this.#database.prepare(`
          SELECT revision, dependency_revision, chair_generation, chair_lease_id
            FROM runs WHERE run_id=? AND project_session_id=?
        `).get(runId, target.projectSessionId), "operator control run binding");
        return {
          runId,
          revision: integer(run, "revision"),
          dependencyRevision: integer(run, "dependency_revision"),
          chairGeneration: integer(run, "chair_generation"),
          chairLeaseId: text(run, "chair_lease_id"),
        };
      }),
      tasks: target.tasks.map((task) => ({
        runId: task.runId,
        taskId: task.taskId,
        revision: task.revision,
        state: task.state,
        ownerAgentId: task.ownerAgentId,
        ownerLeaseGeneration: task.ownerLeaseGeneration,
      })),
      turns: activeTurns.map((turn) => ({
        runId: turn.runId,
        agentId: turn.agentId,
        sourceActionId: turn.actionId,
        adapterId: turn.adapterId,
        sourcePayloadHash: turn.sourcePayloadHash,
        providerSessionGeneration: turn.providerSessionGeneration,
        turnLeaseGeneration: turn.turnLeaseGeneration,
        turnId: turn.turnId,
      })),
    } as JsonValue;
  }

  async #dispatchExternalControl(
    request: OperatorEffectRequest,
    turns: readonly ActiveTurn[],
    operation: "interrupt" | "steer",
  ): Promise<OperatorEffectOutcome> {
    if (turns.some((turn) => turn.turnId === null)) {
      return { status: "rejected", code: "state-changed", evidenceRefs: [] };
    }
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
    const scope = this.#effectScope(request);
    const custodyId = this.#custodyId(scope, request.commandId);
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
      const turnId = turn.turnId;
      if (turnId === null) throw new Error("operator provider turn ID changed after preflight");
      const payload = {
        operatorCommandId: request.commandId,
        operatorCustodyId: custodyId,
        operatorId: scope.operatorId,
        projectId: scope.projectId,
        projectSessionId: scope.projectSessionId,
        operatorIntentDigest: request.intentDigest,
        sourceActionId: turn.actionId,
        sourcePayloadHash: turn.sourcePayloadHash,
        agentId: turn.agentId,
        resumeReference: text(target, "provider_session_ref"),
        providerSessionGeneration: integer(target, "provider_session_generation"),
        turnLeaseGeneration: turn.turnLeaseGeneration,
        turnId,
        expectedTurnId: turnId,
        ...(request.intent.kind === "control" && request.intent.action === "steer"
          ? { instruction: request.intent.instruction, prompt: request.intent.instruction }
          : {}),
      };
      const actionId = `operator-${sha256(canonicalJson({
        commandId: request.commandId,
        custodyId,
        adapterId,
        runId: turn.runId,
        agentId: turn.agentId,
        providerSessionGeneration: payload.providerSessionGeneration,
        sourceActionId: turn.actionId,
        turnLeaseGeneration: turn.turnLeaseGeneration,
        turnId,
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
    const rebound = await this.#read(request.intent);
    if (digestValue(rebound, "operatorControl.preDispatchState") !== request.beforeStateDigest) {
      return { status: "rejected", code: "state-changed", evidenceRefs: [] };
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

    for (const action of this.#controlActions(request)) {
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
    const completed = this.#controlActions(request);
    if (!completed.every((action) => action.status === "terminal")) {
      return { status: "ambiguous", effectRef: this.#effectRef(request, completed) };
    }
    if (request.intent.kind === "control" && request.intent.action === "pause") {
      const target = this.#resolveControlTarget(request.intent);
      return this.#freeze(target, `operator-pause:${request.commandId}`, request);
    }
    if (request.intent.kind === "control" && request.intent.action === "cancel") {
      return this.#cancel(this.#resolveControlTarget(request.intent), request);
    }
    return { status: "committed", afterState: { lifecycleState: "active", steered: true } };
  }

  #controlActions(request: OperatorEffectRequest): StoredControlAction[] {
    const custodyId = this.#custodyId(this.#effectScope(request), request.commandId);
    return this.#database.prepare(`
      SELECT run_id, action_id, adapter_id, operation, status, payload_hash, payload_json
        FROM provider_actions
       WHERE json_extract(payload_json, '$.operatorCustodyId')=?
       ORDER BY run_id, action_id
    `).all(custodyId).map((value) => {
      const stored = row(value, "operator provider action");
      const status = text(stored, "status");
      const operation = text(stored, "operation");
      const payload: unknown = JSON.parse(text(stored, "payload_json"));
      if (!isRow(payload)) throw new Error("operator provider action payload is invalid");
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
        payloadHash: text(stored, "payload_hash"),
        sourceActionId: text(payload, "sourceActionId"),
        sourcePayloadHash: text(payload, "sourcePayloadHash"),
        agentId: text(payload, "agentId"),
        resumeReference: text(payload, "resumeReference"),
        providerSessionGeneration: integer(payload, "providerSessionGeneration"),
        turnLeaseGeneration: integer(payload, "turnLeaseGeneration"),
        turnId: text(payload, "turnId"),
      };
    });
  }

  #effectRef(request: OperatorEffectRequest, actions: readonly StoredControlAction[]): ArtifactRef {
    const custodyId = this.#custodyId(this.#effectScope(request), request.commandId);
    return parseArtifactRef({
      path: `.agent-fabric/operator-effects/${custodyId}.json`,
      digest: `sha256:${sha256(canonicalJson(actions))}`,
    }, "productionOperatorAction.effectRef");
  }

  #persistAdapterResult(action: StoredControlAction, result: unknown): void {
    if (!isRow(result) || result.actionId !== action.actionId || result.operation !== action.operation ||
      result.payloadHash !== action.payloadHash ||
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
      const proved = result.effectCount === 1 && result.history.at(-1) === "terminal" && isRow(effect) &&
        effect.resumeReference === action.resumeReference && effect.turnId === action.turnId && (
        (action.operation === "interrupt" && effect.interrupted === true) ||
        (action.operation === "steer" && effect.steered === true)
      );
      if (!proved) {
        this.#quarantine(action);
        return;
      }
      if (!this.#sourceTupleCurrent(action)) {
        this.#quarantine(action);
        return;
      }
    }
    this.#database.transaction(() => {
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
      if (status === "terminal" && action.operation === "interrupt") {
        this.#settleInterruptedSource(action);
      }
    })();
  }

  #sourceTupleCurrent(action: StoredControlAction): boolean {
    const current = this.#database.prepare(`
      SELECT lease.status AS lease_status, source.adapter_id AS source_adapter_id,
             source.payload_hash AS source_payload_hash, source.status AS source_status,
             source.execution_count AS source_execution_count, source.result_json,
             agent.provider_session_ref, binding.adapter_id AS bound_adapter_id,
             COALESCE(provider.provider_session_generation, 1) AS current_provider_generation
        FROM provider_session_turn_leases lease
        JOIN provider_actions source ON source.run_id=lease.run_id AND source.action_id=lease.action_id
        JOIN agents agent ON agent.run_id=lease.run_id AND agent.agent_id=lease.agent_id
        JOIN agent_adapter_bindings binding ON binding.run_id=agent.run_id AND binding.agent_id=agent.agent_id
        LEFT JOIN provider_state provider ON provider.run_id=agent.run_id AND provider.agent_id=agent.agent_id
       WHERE lease.run_id=? AND lease.agent_id=? AND lease.action_id=?
         AND lease.provider_session_generation=? AND lease.turn_lease_generation=?
    `).get(
      action.runId,
      action.agentId,
      action.sourceActionId,
      action.providerSessionGeneration,
      action.turnLeaseGeneration,
    );
    if (!isRow(current) || current.lease_status !== "active" ||
      current.source_adapter_id !== action.adapterId || current.bound_adapter_id !== action.adapterId ||
      current.source_payload_hash !== action.sourcePayloadHash ||
      !["dispatched", "accepted", "ambiguous"].includes(String(current.source_status)) ||
      current.source_execution_count !== 1 || current.provider_session_ref !== action.resumeReference ||
      current.current_provider_generation !== action.providerSessionGeneration ||
      typeof current.result_json !== "string") return false;
    const sourceResult: unknown = JSON.parse(current.result_json);
    return isRow(sourceResult) && sourceResult.turnId === action.turnId;
  }

  #settleInterruptedSource(action: StoredControlAction): void {
    const source = row(this.#database.prepare(`
      SELECT history_json, result_json FROM provider_actions WHERE run_id=? AND action_id=?
    `).get(action.runId, action.sourceActionId), "interrupted source action");
    const historyValue: unknown = JSON.parse(text(source, "history_json"));
    if (!Array.isArray(historyValue) || !historyValue.every((item) => typeof item === "string")) {
      throw new Error("interrupted source action history is invalid");
    }
    const originalResult = nullableText(source, "result_json");
    const sourceOutcome = {
      interrupted: true,
      sourceActionId: action.sourceActionId,
      operatorActionId: action.actionId,
      resumeReference: action.resumeReference,
      providerSessionGeneration: action.providerSessionGeneration,
      turnLeaseGeneration: action.turnLeaseGeneration,
      turnId: action.turnId,
      originalResult: originalResult === null ? null : JSON.parse(originalResult) as unknown,
    };
    const lease = this.#database.prepare(`
      UPDATE provider_session_turn_leases SET status='released', updated_at=?
       WHERE run_id=? AND agent_id=? AND action_id=?
         AND provider_session_generation=? AND turn_lease_generation=? AND status='active'
    `).run(
      this.#clock(),
      action.runId,
      action.agentId,
      action.sourceActionId,
      action.providerSessionGeneration,
      action.turnLeaseGeneration,
    );
    if (lease.changes !== 1) throw new ProjectFabricCoreError("STALE_GENERATION", "source provider turn changed after interrupt");
    this.#database.prepare(`
      UPDATE provider_actions
         SET status='terminal', history_json=?, effect_count=1, idempotency_proven=1,
             result_json=?, journal_revision=journal_revision+1, updated_at=?
       WHERE run_id=? AND action_id=? AND status<>'terminal'
    `).run(
      canonicalJson([...historyValue, "terminal"]),
      canonicalJson(sourceOutcome),
      this.#clock(),
      action.runId,
      action.sourceActionId,
    );
    const membership = this.#database.prepare(`
      UPDATE project_session_memberships
         SET state='reconciled', revision=revision+1, updated_at=?
       WHERE coordination_run_id=? AND member_kind='provider-action' AND member_id=? AND state='active'
    `).run(this.#clock(), action.runId, action.sourceActionId);
    touchProjectSessionMembershipRevisionForRun(
      this.#database,
      action.runId,
      this.#clock(),
      membership.changes,
    );
  }

  #quarantine(action: StoredControlAction): void {
    this.#database.prepare(`
      UPDATE provider_actions
         SET status='quarantined', journal_revision=journal_revision+1, updated_at=?
       WHERE run_id=? AND action_id=?
    `).run(this.#clock(), action.runId, action.actionId);
  }

  #freeze(
    target: ResolvedControlTarget,
    reason: string,
    request: OperatorEffectRequest,
  ): OperatorEffectOutcome {
    const outcome: OperatorEffectOutcome = { status: "committed", afterState: { lifecycleState: "paused" } };
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
      if (target.scopeKind === "run" || target.scopeKind === "session") {
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
      }
      this.#storeCustodyOutcome(this.#effectScope(request), request.commandId, outcome);
    })();
    return outcome;
  }

  #resume(request: OperatorEffectRequest, target: ResolvedControlTarget): OperatorEffectOutcome {
    const outcome: OperatorEffectOutcome = { status: "committed", afterState: { lifecycleState: "active" } };
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
      if (target.scopeKind === "run" || target.scopeKind === "session") {
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
      }
      this.#storeCustodyOutcome(this.#effectScope(request), request.commandId, outcome);
    })();
    return outcome;
  }

  #cancel(target: ResolvedControlTarget, request: OperatorEffectRequest): OperatorEffectOutcome {
    if (request.intent.kind !== "control" || request.intent.action !== "cancel") unsupported();
    const reason = request.intent.reason;
    const commandId = request.commandId;
    let cancelledTasks = 0;
    let outcome: OperatorEffectOutcome;
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
          this.#settleCancelledTask(target.projectSessionId, task, reason, commandId);
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
      touchProjectSessionMembershipRevision(
        this.#database,
        target.projectSessionId,
        this.#clock(),
        cancelledTasks,
      );
      outcome = { status: "committed", afterState: { lifecycleState: "cancelled", cancelledTasks } };
      this.#storeCustodyOutcome(this.#effectScope(request), request.commandId, outcome);
    })();
    return outcome!;
  }

  #settleCancelledTask(
    projectSessionId: string,
    task: ResolvedControlTarget["tasks"][number],
    reason: string,
    commandId: string,
  ): void {
    const unsafeReservation = this.#database.prepare(`
      SELECT 1 FROM task_obligation_bindings binding
      JOIN resource_reservations reservation ON reservation.reservation_id=binding.obligation_id
      WHERE binding.coordination_run_id=? AND binding.task_id=?
        AND binding.obligation_kind='resource-reservation' AND binding.state='active'
        AND (reservation.state='ambiguous' OR EXISTS (
          SELECT 1 FROM resource_reservation_dimensions dimension
           WHERE dimension.reservation_id=reservation.reservation_id AND dimension.usage_unknown=1
        ))
    `).get(task.runId, task.taskId);
    const unsafeLease = this.#database.prepare(`
      SELECT 1 FROM task_obligation_bindings binding
      JOIN leases lease ON lease.lease_id=binding.obligation_id
      WHERE binding.coordination_run_id=? AND binding.task_id=?
        AND binding.obligation_kind='write-lease' AND binding.state='active'
        AND lease.status='quarantined'
    `).get(task.runId, task.taskId);
    if (isRow(unsafeReservation) || isRow(unsafeLease)) {
      throw new ProjectFabricCoreError("RECOVERY_REQUIRED", "task cancellation has an ambiguous resource or write obligation");
    }

    const providerRows = this.#database.prepare(`
      SELECT action_id, status, execution_count FROM provider_actions
       WHERE run_id=? AND json_extract(payload_json, '$.taskId')=?
         AND status IN ('prepared','dispatched','accepted','ambiguous','quarantined')
    `).all(task.runId, task.taskId).filter(isRow);
    if (providerRows.some((action) => text(action, "status") !== "prepared" || integer(action, "execution_count") !== 0)) {
      throw new ProjectFabricCoreError("RECOVERY_REQUIRED", "task cancellation has an unresolved provider effect");
    }
    for (const action of providerRows) {
      const actionId = text(action, "action_id");
      this.#database.prepare(`
        UPDATE provider_actions
           SET status='terminal', history_json='["prepared","terminal"]',
               effect_count=0, idempotency_proven=1, result_json=?,
               journal_revision=journal_revision+1, updated_at=?
         WHERE run_id=? AND action_id=? AND status='prepared' AND execution_count=0
      `).run(
        canonicalJson({ cancelled: true, reason, commandId, provedNoEffect: true }),
        this.#clock(),
        task.runId,
        actionId,
      );
      this.#database.prepare(`
        UPDATE provider_session_turn_leases SET status='released', updated_at=?
         WHERE run_id=? AND action_id=? AND status='active'
      `).run(this.#clock(), task.runId, actionId);
      this.#database.prepare(`
        UPDATE project_session_memberships
           SET state='abandoned', abandoned_reason=?, revision=revision+1, updated_at=?
         WHERE project_session_id=? AND coordination_run_id=?
           AND member_kind='provider-action' AND member_id=? AND state='active'
      `).run(reason, this.#clock(), projectSessionId, task.runId, actionId);
    }

    const requests = this.#database.prepare(`
      SELECT request_id, request_message_id, dependent_barrier_id
        FROM task_requests WHERE run_id=? AND task_id=?
    `).all(task.runId, task.taskId).filter(isRow);
    for (const request of requests) {
      const requestId = text(request, "request_id");
      this.#database.prepare(`
        UPDATE task_requests SET state='abandoned', updated_at=?
         WHERE request_id=? AND state<>'abandoned'
      `).run(this.#clock(), requestId);
      this.#database.prepare(`
        UPDATE task_request_barriers SET state='abandoned'
         WHERE request_id=? AND state='blocked'
      `).run(requestId);
      this.#database.prepare(`
        UPDATE deliveries SET state='abandoned', resolution_reason=?, resolved_at=?
         WHERE delivery_id IN (
           SELECT delivery_id FROM task_request_recipients WHERE request_id=?
         ) AND state NOT IN ('acknowledged','abandoned','expired')
      `).run(reason, this.#clock(), requestId);
      this.#database.prepare(`
        UPDATE project_session_memberships
           SET state='abandoned', abandoned_reason=?, revision=revision+1, updated_at=?
         WHERE project_session_id=? AND coordination_run_id=? AND state='active' AND (
           (member_kind='required-message' AND member_id=?) OR
           (member_kind='scoped-barrier' AND member_id=?)
         )
      `).run(
        reason,
        this.#clock(),
        projectSessionId,
        task.runId,
        text(request, "request_message_id"),
        text(request, "dependent_barrier_id"),
      );
    }
    this.#database.prepare(`
      UPDATE result_deliveries
         SET state='abandoned', required=0, abandoned_reason=?, abandoned_at=?, updated_at=?, revision=revision+1
       WHERE run_id=? AND task_id=? AND state NOT IN ('consumed','abandoned')
    `).run(reason, this.#clock(), this.#clock(), task.runId, task.taskId);
    this.#database.prepare(`
      UPDATE deliveries SET state='abandoned', resolution_reason=?, resolved_at=?
       WHERE message_id IN (
         SELECT reply_message_id FROM task_results WHERE run_id=? AND task_id=?
       ) AND state NOT IN ('acknowledged','abandoned','expired')
    `).run(reason, this.#clock(), task.runId, task.taskId);
    this.#database.prepare(`
      UPDATE project_session_memberships
         SET state='abandoned', abandoned_reason=?, revision=revision+1, updated_at=?
       WHERE project_session_id=? AND coordination_run_id=? AND member_kind='required-message'
         AND member_id IN (SELECT reply_message_id FROM task_results WHERE run_id=? AND task_id=?)
         AND state='active'
    `).run(reason, this.#clock(), projectSessionId, task.runId, task.runId, task.taskId);

    const bindings = this.#database.prepare(`
      SELECT obligation_kind, obligation_id FROM task_obligation_bindings
       WHERE coordination_run_id=? AND task_id=? AND state='active'
       ORDER BY obligation_kind, obligation_id
    `).all(task.runId, task.taskId).filter(isRow);
    for (const binding of bindings) {
      const kind = text(binding, "obligation_kind");
      const obligationId = text(binding, "obligation_id");
      if (kind === "write-lease") {
        this.#database.prepare(`
          UPDATE leases SET status='released', updated_at=?
           WHERE lease_id=? AND run_id=? AND status='active'
        `).run(this.#clock(), obligationId, task.runId);
        this.#database.prepare(`
          UPDATE project_session_memberships
             SET state='abandoned', abandoned_reason=?, revision=revision+1, updated_at=?
           WHERE project_session_id=? AND coordination_run_id=?
             AND member_kind='lease' AND member_id=? AND state='active'
        `).run(reason, this.#clock(), projectSessionId, task.runId, obligationId);
      } else if (kind === "resource-reservation") {
        const dimensions = this.#database.prepare(`
          SELECT scope_id, unit_key, amount-consumed-released AS remainder
            FROM resource_reservation_dimensions WHERE reservation_id=?
        `).all(obligationId).filter(isRow);
        for (const dimension of dimensions) {
          const remainder = integer(dimension, "remainder");
          if (remainder > 0) {
            const released = this.#database.prepare(`
              UPDATE resource_dimensions SET reserved=reserved-?
               WHERE scope_id=? AND unit_key=? AND reserved>=?
            `).run(
              remainder,
              text(dimension, "scope_id"),
              text(dimension, "unit_key"),
              remainder,
            );
            if (released.changes !== 1) throw new ProjectFabricCoreError("RECOVERY_REQUIRED", "resource cancellation ledger changed");
            this.#database.prepare(`
              UPDATE resource_reservation_dimensions SET released=released+?
               WHERE reservation_id=? AND scope_id=? AND unit_key=?
            `).run(remainder, obligationId, text(dimension, "scope_id"), text(dimension, "unit_key"));
          }
        }
        this.#database.prepare(`
          UPDATE resource_reservations SET state='released', revision=revision+1, updated_at=?
           WHERE reservation_id=? AND state IN ('reserved','partially-consumed')
        `).run(this.#clock(), obligationId);
        this.#database.prepare(`
          UPDATE writer_admissions SET state='revoked'
           WHERE reservation_id=? AND state='active'
        `).run(obligationId);
      }
      this.#database.prepare(`
        UPDATE task_obligation_bindings SET state='abandoned', updated_at=?
         WHERE coordination_run_id=? AND task_id=? AND obligation_kind=? AND obligation_id=? AND state='active'
      `).run(this.#clock(), task.runId, task.taskId, kind, obligationId);
    }

    const dedupeKey = `operator-cancel:${task.runId}:${task.taskId}:${String(task.revision)}`;
    const itemId = `attention_${sha256(`${projectSessionId}\0${dedupeKey}`).slice(0, 24)}`;
    this.#database.prepare(`
      INSERT INTO attention_items(
        item_id, project_session_id, coordination_run_id, kind, severity,
        revision, state, dedupe_key, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, 'operator-task-cancelled', 'info', 1, 'open', ?, ?, ?, ?)
      ON CONFLICT(project_session_id, dedupe_key) DO NOTHING
    `).run(
      itemId,
      projectSessionId,
      task.runId,
      dedupeKey,
      canonicalJson({ taskId: task.taskId, taskRevision: task.revision, reason, commandId }),
      this.#clock(),
      this.#clock(),
    );
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
    const obligations = this.#projectObligations(
      intent.projectSessionId,
      this.#custodyId(this.#effectScope(request), request.commandId),
    );
    if (!obligations.settled) return { status: "pending", phase: "accepted" };
    const receipt = this.#persistLifecycleReceipt({
      scope: this.#effectScope(request),
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
    const receipt = this.#lifecycleReceipt(intent.drainReceiptRef, this.#effectScope(request));
    if (
      receipt.kind !== "project-session-drain" ||
      receipt.project_session_id !== intent.projectSessionId ||
      receipt.session_revision !== intent.expectedSessionRevision ||
      receipt.session_generation !== intent.expectedSessionGeneration ||
      receipt.global_state_revision !== intent.expectedGlobalStateRevision
    ) {
      throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "project stop drain receipt does not bind current state");
    }
    const obligations = this.#projectObligations(
      intent.projectSessionId,
      this.#custodyId(this.#effectScope(request), request.commandId),
    );
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
      const superseded = supersedeFinalAcceptanceGates({
        database: this.#database,
        projectSessionId: intent.projectSessionId,
        cause: { kind: "operator-command", ref: request.commandId },
        reason: "project session stopped from quiescing",
        now: this.#clock(),
      });
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
      const membership = this.#database.prepare(`
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
           SET state='cancelled', terminal_path_json=?,
               membership_revision=membership_revision+?,
               revision=revision+1, updated_at=?
         WHERE project_session_id=? AND revision=? AND generation=? AND state='quiescing'
      `).run(
        terminalPath,
        membership.changes + superseded.membershipChanges + superseded.gateChanges > 0 ? 1 : 0,
        this.#clock(),
        intent.projectSessionId,
        intent.expectedSessionRevision,
        intent.expectedSessionGeneration,
      );
      if (changed.changes !== 1) throw new ProjectFabricCoreError("STALE_REVISION", "project stop raced another transition");
      retireProjectSessionBridges(this.#database, {
        projectSessionId: intent.projectSessionId,
        sourceKind: "project-session-stop",
        terminalKind: "cancelled",
        terminalRef: terminalPath,
        ownerOperatorId: this.#effectScope(request).operatorId,
        ownerRef: request.commandId,
        now: this.#clock(),
      });
      this.#fault("project-stop:after-bridges");
      this.#storeCustodyOutcome(this.#effectScope(request), request.commandId, {
        status: "committed",
        afterState: { lifecycleState: "cancelled" },
      });
    })();
    try { this.#retireVolatileProjectSession?.(intent.projectSessionId); } catch { /* durable fencing already committed */ }
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
    return this.#finishDaemonDrain(request.commandId, intent.expectedDaemonGeneration, this.#effectScope(request));
  }

  #finishDaemonDrain(
    commandId: string,
    daemonInstanceGeneration: number,
    scope: EffectScope,
  ): OperatorEffectOutcome {
    const epoch = row(this.#database.prepare(`
      SELECT state FROM daemon_runtime_epochs WHERE instance_generation=?
    `).get(daemonInstanceGeneration), "daemon runtime epoch");
    if (text(epoch, "state") !== "quiescing") {
      return { status: "rejected", code: "state-changed", evidenceRefs: [] };
    }
    const liveness = readGlobalLiveness(this.#database, {
      now: this.#clock(),
      daemonInstanceGeneration,
      excludeOperatorEffectCustodyId: this.#custodyId(scope, commandId),
    });
    if (liveness.failClosed || !liveness.idle || liveness.globalStateRevision === null) {
      return { status: "pending", phase: "observing" };
    }
    this.#database.prepare(`
      UPDATE daemon_runtime_epochs SET observed_global_revision=?, heartbeat_at=?
       WHERE instance_generation=? AND state='quiescing'
    `).run(liveness.globalStateRevision, this.#clock(), daemonInstanceGeneration);
    const receipt = this.#persistLifecycleReceipt({
      scope,
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
    const receipt = this.#lifecycleReceipt(intent.drainReceiptRef, this.#effectScope(request));
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
    const scope = this.#effectScope(request);
    const liveness = readGlobalLiveness(this.#database, {
      now: this.#clock(),
      daemonInstanceGeneration: intent.expectedDaemonGeneration,
      excludeOperatorEffectCustodyId: this.#custodyId(scope, request.commandId),
    });
    if (!liveness.idle || liveness.failClosed || liveness.globalStateRevision !== intent.expectedGlobalStateRevision) {
      throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "daemon stop is busy or global state changed");
    }
    const port = this.#daemonStop;
    if (port === undefined) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "guarded daemon stop owner is unavailable");
    }
    const custodyId = this.#custodyId(scope, request.commandId);
    const stopCustody = row(this.#database.prepare(`
      SELECT result_correlation_digest, state FROM operator_daemon_stop_custody
       WHERE daemon_instance_generation=? AND custody_id=?
         AND operator_id=? AND project_id=? AND project_session_id=?
         AND principal_generation=? AND command_id=? AND operation='daemon-stop'
    `).get(
      intent.expectedDaemonGeneration,
      custodyId,
      scope.operatorId,
      scope.projectId,
      scope.projectSessionId,
      scope.principalGeneration,
      request.commandId,
    ), "daemon stop custody");
    if (text(stopCustody, "state") !== "prepared") {
      const state = text(stopCustody, "state");
      if (state === "scheduled") return { status: "pending", phase: "accepted" };
      if (state === "stopped") return { status: "committed", afterState: { lifecycleState: "stopped" } };
      return { status: "rejected", code: "state-changed", evidenceRefs: [intent.drainReceiptRef] };
    }
    const resultCorrelationDigest = text(stopCustody, "result_correlation_digest");
    let outcome: "stopped" | "scheduled" | "busy";
    try {
      outcome = await port.request({
        custodyId,
        resultCorrelationDigest,
        operatorId: scope.operatorId,
        projectId: scope.projectId,
        projectSessionId: scope.projectSessionId,
        principalGeneration: scope.principalGeneration,
        commandId: request.commandId,
        operation: "daemon-stop",
        token: {
          daemonInstanceGeneration: intent.expectedDaemonGeneration,
          observedGlobalStateRevision: intent.expectedGlobalStateRevision,
        },
      });
    } catch (error: unknown) {
      this.#database.prepare(`
        UPDATE operator_daemon_stop_custody SET state='failed', result_json=?, updated_at=?
         WHERE custody_id=? AND state='prepared'
      `).run(
        canonicalJson({ message: error instanceof Error ? error.message : String(error), resultCorrelationDigest }),
        this.#clock(),
        custodyId,
      );
      throw error;
    }
    if (outcome === "stopped") {
      this.#database.prepare(`
        UPDATE operator_daemon_stop_custody SET state='stopped', result_json=?, updated_at=?
         WHERE custody_id=? AND state='prepared'
      `).run(canonicalJson({ outcome: "stopped", resultCorrelationDigest }), this.#clock(), custodyId);
      return { status: "committed", afterState: { lifecycleState: "stopped" } };
    }
    if (outcome === "scheduled") {
      const scheduled = this.#database.prepare(`
        UPDATE operator_daemon_stop_custody SET state='scheduled', result_json=?, updated_at=?
         WHERE custody_id=? AND state='prepared'
      `).run(canonicalJson({ outcome: "scheduled", resultCorrelationDigest }), this.#clock(), custodyId);
      if (scheduled.changes !== 1) throw new ProjectFabricCoreError("CONFLICT", "daemon stop custody changed while scheduling");
      return { status: "pending", phase: "accepted" };
    }
    this.#database.prepare(`
      UPDATE operator_daemon_stop_custody SET state='rejected', result_json=?, updated_at=?
       WHERE custody_id=? AND state='prepared'
    `).run(canonicalJson({ outcome: "busy", resultCorrelationDigest }), this.#clock(), custodyId);
    return { status: "rejected", code: "state-changed", evidenceRefs: [intent.drainReceiptRef] };
  }

  #projectObligations(projectSessionId: string, excludeOperatorEffectCustodyId?: string): {
    settled: boolean;
    tasks: number;
    leases: number;
    providerActions: number;
    operatorEffects: number;
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
      operatorEffects: integer(row(this.#database.prepare(`
        SELECT COUNT(*) AS count FROM operator_effect_custody
         WHERE project_session_id=?
           AND state IN ('prepared','dispatching','conflict','ambiguous','quarantined','failed')
           AND (? IS NULL OR custody_id<>?)
      `).get(
        projectSessionId,
        excludeOperatorEffectCustodyId ?? null,
        excludeOperatorEffectCustodyId ?? null,
      ), "project operator-effect obligation"), "count"),
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
        JOIN tasks task ON task.run_id=expected.run_id AND task.task_id=expected.task_id
        WHERE run.project_session_id=? AND task.state NOT IN ('cancelled','degraded') AND NOT EXISTS (
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

  #persistLifecycleReceipt(input: {
    scope: EffectScope;
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
      operatorId: input.scope.operatorId,
      projectId: input.scope.projectId,
      authoritySessionId: input.scope.projectSessionId,
      commandId: input.commandId,
      projectSessionId: input.projectSessionId ?? null,
      daemonInstanceGeneration: input.daemonInstanceGeneration ?? null,
      sessionRevision: input.sessionRevision ?? null,
      sessionGeneration: input.sessionGeneration ?? null,
      globalStateRevision: input.globalStateRevision,
      obligations: input.obligations,
    };
    const digest = `sha256:${sha256(canonicalJson(receiptValue))}`;
    const identity = sha256(canonicalJson({
      operatorId: input.scope.operatorId,
      projectId: input.scope.projectId,
      authoritySessionId: input.scope.projectSessionId,
      commandId: input.commandId,
    })).slice(0, 32);
    const path = `.agent-fabric/lifecycle-receipts/${input.kind}-${identity}.json`;
    this.#database.prepare(`
      INSERT INTO operator_lifecycle_receipts(
        relative_path, sha256, kind, operator_id, project_id, authority_session_id,
        project_session_id, daemon_instance_generation,
        session_revision, session_generation, global_state_revision, command_id,
        receipt_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(kind, operator_id, project_id, authority_session_id, command_id) DO NOTHING
    `).run(
      path,
      digest,
      input.kind,
      input.scope.operatorId,
      input.scope.projectId,
      input.scope.projectSessionId,
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
      SELECT relative_path, sha256 FROM operator_lifecycle_receipts
       WHERE kind=? AND operator_id=? AND project_id=? AND authority_session_id=? AND command_id=?
    `).get(
      input.kind,
      input.scope.operatorId,
      input.scope.projectId,
      input.scope.projectSessionId,
      input.commandId,
    ), "operator lifecycle receipt");
    if (text(stored, "relative_path") !== path || text(stored, "sha256") !== digest) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "lifecycle receipt command changed");
    }
    return parseArtifactRef({ path, digest }, "operatorLifecycle.receipt");
  }

  #lifecycleReceipt(reference: ArtifactRef, scope: EffectScope): Row {
    return row(this.#database.prepare(`
      SELECT * FROM operator_lifecycle_receipts
       WHERE relative_path=? AND sha256=?
         AND operator_id=? AND project_id=? AND authority_session_id=?
    `).get(
      reference.path,
      reference.digest,
      scope.operatorId,
      scope.projectId,
      scope.projectSessionId,
    ), "operator lifecycle drain receipt");
  }
}

export function createProductionOperatorActionPorts(options: {
  database: Database.Database;
  clock?: () => number;
  adapter: ProductionOperatorAdapterPort;
  daemonStop?: ProductionDaemonStopPort;
  externalEffects?: ExternalEffectService;
  typedGit?: TypedGitService;
  retireVolatileProjectSession?: (projectSessionId: string) => void;
  fault?: (label: string) => void;
}): ProductionOperatorActionPorts {
  const owner = new ProductionOperatorActions({
    database: options.database,
    clock: options.clock ?? Date.now,
    adapter: options.adapter,
    ...(options.daemonStop === undefined ? {} : { daemonStop: options.daemonStop }),
    ...(options.externalEffects === undefined ? {} : { externalEffects: options.externalEffects }),
    ...(options.typedGit === undefined ? {} : { typedGit: options.typedGit }),
    ...(options.retireVolatileProjectSession === undefined
      ? {}
      : { retireVolatileProjectSession: options.retireVolatileProjectSession }),
    ...(options.fault === undefined ? {} : { fault: options.fault }),
  });
  return { statePort: owner.statePort, effectPort: owner.effectPort };
}

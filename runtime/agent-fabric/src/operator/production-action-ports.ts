import type {
  ArtifactRef,
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
import { canonicalJson, sha256 } from "../project-session/store-support.js";
import { readGlobalLiveness, type QuiesceToken } from "../daemon/global-liveness.js";
import {
  TypedGitService,
  type TypedGitAdministrativeRequest,
  type TypedGitEffectRequest,
} from "./typed-git-service.js";
import {
  readControlActiveTurns,
  readControlEligibility,
} from "./control-eligibility.js";
import { controlBinding, resolveControlTarget } from "./control-target.js";
import {
  ProviderActionAdmissionCoordinator,
} from "../application/provider-action-admission.js";
import { ProviderActionOwnerError } from "../application/provider-action-owner.js";
import {
  ProjectDaemonLifecycleActions,
  type ProjectDaemonLifecycleDaemonStopPort,
  type ProjectDaemonLifecycleHostPort,
} from "./project-daemon-lifecycle-actions.js";
import {
  OperatorControlActions,
  type OperatorControlAdapterPort,
  type OperatorControlHostPort,
} from "./operator-control-actions.js";
import {
  assertOperatorTaskRunnable as taskRunAdmissionAssertOperatorTaskRunnable,
  assertRunAcceptingWork as taskRunAdmissionAssertRunAcceptingWork,
  assertTaskOperationAdmitted as taskRunAdmissionAssertTaskOperationAdmitted,
  resolveTaskBindingForActiveWork as taskRunAdmissionResolveTaskBindingForActiveWork,
} from "./task-run-admission.js";

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

/**
 * Re-exported from `task-run-admission.ts` (S4g move) so every existing importer of
 * `production-action-ports.js` keeps working without a call-site change.
 */
export const assertOperatorTaskRunnable = taskRunAdmissionAssertOperatorTaskRunnable;
export const assertTaskOperationAdmitted = taskRunAdmissionAssertTaskOperationAdmitted;
export const resolveTaskBindingForActiveWork = taskRunAdmissionResolveTaskBindingForActiveWork;
export const assertRunAcceptingWork = taskRunAdmissionAssertRunAcceptingWork;

type EffectScope = {
  operatorId: string;
  projectId: string;
  projectSessionId: string;
  principalGeneration: number;
  operation: string;
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
  readonly #providerActionAdmission: ProviderActionAdmissionCoordinator;
  readonly #daemonStop: ProductionDaemonStopPort | undefined;
  readonly #externalEffects: ExternalEffectService | undefined;
  readonly #typedGit: TypedGitService | undefined;
  readonly #retireVolatileProjectSession: ((projectSessionId: string) => void) | undefined;
  readonly #externalEffectHandles = new Map<string, ExternalEffectDispatchHandle>();
  readonly #fault: (label: string) => void;
  readonly #projectDaemonLifecycle: ProjectDaemonLifecycleActions;
  readonly #operatorControl: OperatorControlActions;

  constructor(options: {
    database: Database.Database;
    clock: () => number;
    adapter: ProductionOperatorAdapterPort;
    providerActionAdmission: ProviderActionAdmissionCoordinator;
    daemonStop?: ProductionDaemonStopPort;
    externalEffects?: ExternalEffectService;
    typedGit?: TypedGitService;
    retireVolatileProjectSession?: (projectSessionId: string) => void;
    fault?: (label: string) => void;
  }) {
    this.#database = options.database;
    this.#clock = options.clock;
    this.#adapter = options.adapter;
    this.#providerActionAdmission = options.providerActionAdmission;
    this.#daemonStop = options.daemonStop;
    this.#externalEffects = options.externalEffects;
    this.#typedGit = options.typedGit;
    this.#retireVolatileProjectSession = options.retireVolatileProjectSession;
    this.#fault = options.fault ?? (() => undefined);
    const host: ProjectDaemonLifecycleHostPort = {
      effectScope: (request) => this.#effectScope(request),
      custodyId: (scope, commandId) => this.#custodyId(scope, commandId),
      effectCustody: (scope, commandId) => this.#effectCustody(scope, commandId),
      custodyEffectRef: (custody) => this.#custodyEffectRef(custody),
      storeCustodyOutcome: (scope, commandId, outcome) => this.#storeCustodyOutcome(scope, commandId, outcome),
    };
    const daemonStop: ProjectDaemonLifecycleDaemonStopPort | undefined = this.#daemonStop === undefined
      ? undefined
      : { request: (input) => this.#daemonStop!.request(input) };
    this.#projectDaemonLifecycle = new ProjectDaemonLifecycleActions({
      database: this.#database,
      clock: this.#clock,
      host,
      liveness: (input) => readGlobalLiveness(this.#database, input),
      ...(daemonStop === undefined ? {} : { daemonStop }),
      ...(this.#retireVolatileProjectSession === undefined
        ? {}
        : { retireVolatileProjectSession: this.#retireVolatileProjectSession }),
      fault: this.#fault,
    });
    const controlHost: OperatorControlHostPort = {
      effectScope: (request) => this.#effectScope(request),
      storeCustodyOutcome: (scope, commandId, outcome) => this.#storeCustodyOutcome(scope, commandId, outcome),
      custodyId: (scope, commandId) => this.#custodyId(scope, commandId),
      read: (intent) => this.#read(intent),
    };
    const controlAdapter: OperatorControlAdapterPort = {
      capabilities: (adapterId) => this.#adapter.capabilities(adapterId),
      dispatch: (adapterId, input) => this.#adapter.dispatch(adapterId, input),
      lookup: (adapterId, actionId) => this.#adapter.lookup(adapterId, actionId),
    };
    this.#operatorControl = new OperatorControlActions({
      database: this.#database,
      clock: this.#clock,
      adapter: controlAdapter,
      providerActionAdmission: this.#providerActionAdmission,
      host: controlHost,
      ...(this.#retireVolatileProjectSession === undefined
        ? {}
        : { retireVolatileProjectSession: this.#retireVolatileProjectSession }),
    });
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
      return Promise.resolve(this.#projectDaemonLifecycle.readProjectSessionLifecycle(intent));
    }
    if (intent.kind === "daemon-drain" || intent.kind === "daemon-stop") {
      return Promise.resolve(this.#projectDaemonLifecycle.readDaemonLifecycle(intent));
    }
    if (intent.kind !== "control") unsupported();
    const target = resolveControlTarget(this.#database, intent);
    const activeTurns = readControlActiveTurns(this.#database, target);
    const eligibility = readControlEligibility(this.#database, target, activeTurns);
    return Promise.resolve({
      kind: "control",
      revision: target.revision,
      ...eligibility,
      binding: controlBinding(this.#database, target, activeTurns),
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
      SELECT session.project_id, project.authority_generation
        FROM project_sessions session
        JOIN projects project ON project.project_id=session.project_id
       WHERE session.project_session_id=?
    `).get(projectSessionId), "operator effect authority session");
    const projectId = request.projectId ?? text(session, "project_id");
    if (projectId !== text(session, "project_id")) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "operator effect scope is bound to another project");
    }
    const operatorId = request.operatorId ?? "operator_direct_test";
    const livePrincipal = this.#database.prepare(`
      SELECT project_authority_generation, principal_generation, state
        FROM operator_principals
       WHERE operator_id=? AND project_id=?
    `).get(operatorId, projectId);
    let principalGeneration = request.principalGeneration;
    if (isRow(livePrincipal)) {
      if (text(livePrincipal, "state") !== "active") {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator principal is not active");
      }
      if (integer(livePrincipal, "project_authority_generation") !== integer(session, "authority_generation")) {
        throw new ProjectFabricCoreError("STALE_GENERATION", "operator project authority generation changed");
      }
      const liveGeneration = integer(livePrincipal, "principal_generation");
      if (principalGeneration !== undefined && principalGeneration !== liveGeneration) {
        throw new ProjectFabricCoreError("STALE_PRINCIPAL_GENERATION", "operator principal generation changed");
      }
      principalGeneration = liveGeneration;
    }
    if (typeof principalGeneration !== "number" || !Number.isSafeInteger(principalGeneration) || principalGeneration < 1) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator effect has no live principal generation");
    }
    return {
      operatorId,
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
    if (effective.intent.kind === "control") this.#operatorControl.assertPersistedControlActionOwners(effective);
    const current = await this.#read(effective.intent);
    if (effective.intent.kind === "control") this.#operatorControl.assertPersistedControlActionOwners(effective);
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
      if (error instanceof ProviderActionOwnerError) throw error;
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
    if (request.intent.kind === "project-session-drain") {
      return this.#projectDaemonLifecycle.drainProject({ ...request, intent: request.intent });
    }
    if (request.intent.kind === "project-session-stop") {
      return this.#projectDaemonLifecycle.stopProject({ ...request, intent: request.intent });
    }
    if (request.intent.kind === "daemon-drain") {
      return this.#projectDaemonLifecycle.drainDaemon({ ...request, intent: request.intent });
    }
    if (request.intent.kind === "daemon-stop") {
      return await this.#projectDaemonLifecycle.stopDaemon({ ...request, intent: request.intent });
    }
    if (request.intent.kind !== "control") unsupported();
    return await this.#operatorControl.dispatchControl({ ...request, intent: request.intent });
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
      return this.#projectDaemonLifecycle.observeProjectDrain({ ...request, intent: request.intent });
    }
    if (request.intent.kind === "project-session-stop") {
      return this.#projectDaemonLifecycle.observeProjectStop({ ...request, intent: request.intent });
    }
    if (request.intent.kind === "daemon-drain") {
      return this.#projectDaemonLifecycle.observeDaemonDrain(
        request.commandId,
        request.intent.expectedDaemonGeneration,
        request,
      );
    }
    if (request.intent.kind === "daemon-stop") {
      return this.#projectDaemonLifecycle.observeDaemonStop({ ...request, intent: request.intent });
    }
    if (request.intent.kind !== "control") unsupported();
    return await this.#operatorControl.observeControl({ ...request, intent: request.intent });
  }
}

export function createProductionOperatorActionPorts(options: {
  database: Database.Database;
  clock?: () => number;
  adapter: ProductionOperatorAdapterPort;
  providerActionAdmission: ProviderActionAdmissionCoordinator;
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
    providerActionAdmission: options.providerActionAdmission,
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

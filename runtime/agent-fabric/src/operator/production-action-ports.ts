import type {
  OperatorActionIntent,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import type {
  OperatorActionEffectPort,
  OperatorActionStatePort,
} from "./action-store.js";
import { ExternalEffectService } from "./external-effect-service.js";
import { ProjectFabricCoreError } from "../project-session/contracts.js";
import { readGlobalLiveness, type QuiesceToken } from "../lifecycle/global-liveness.js";
import { TypedGitService } from "./typed-git-service.js";
import {
  readControlActiveTurns,
  readControlEligibility,
} from "./control-eligibility.js";
import { controlBinding, resolveControlTarget } from "./control-target.js";
import {
  ProviderActionAdmissionCoordinator,
} from "../application/provider-action-admission.js";
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
  OperatorEffectCustodyActions,
  type OperatorEffectCustodyControlPort,
  type OperatorEffectCustodyExternalPort,
  type OperatorEffectCustodyGitPort,
  type OperatorEffectCustodyLifecyclePort,
} from "./operator-effect-custody.js";
import {
  assertOperatorTaskRunnable as taskRunAdmissionAssertOperatorTaskRunnable,
  assertRunAcceptingWork as taskRunAdmissionAssertRunAcceptingWork,
  assertTaskOperationAdmitted as taskRunAdmissionAssertTaskOperationAdmitted,
  resolveTaskBindingForActiveWork as taskRunAdmissionResolveTaskBindingForActiveWork,
} from "./task-run-admission.js";

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

function unsupported(): never {
  throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator action runtime is unavailable for this intent");
}

function isTypedGitAdministration(
  intent: OperatorActionIntent,
): intent is Extract<OperatorActionIntent, { kind: "git-authorise" | "git-operation-draft" | "git-custody-resolve" }> {
  return intent.kind === "git-authorise" || intent.kind === "git-operation-draft" || intent.kind === "git-custody-resolve";
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
  readonly #fault: (label: string) => void;
  readonly #projectDaemonLifecycle: ProjectDaemonLifecycleActions;
  readonly #operatorControl: OperatorControlActions;
  readonly #custody: OperatorEffectCustodyActions;

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
    // Forward reference: the lifecycle/control host closures below are only ever invoked once
    // `this.#custody` is assigned at the end of the constructor (never during construction of
    // `ProjectDaemonLifecycleActions`/`OperatorControlActions` themselves), so capturing `this`
    // here is safe. This breaks the otherwise-circular construction order: the shared custody
    // class needs lifecycle/control as owned-effect ports, while lifecycle/control need the
    // shared custody primitives (effectScope/custodyId/effectCustody/custodyEffectRef/
    // storeCustodyOutcome) as their host.
    const host: ProjectDaemonLifecycleHostPort = {
      effectScope: (request) => this.#custody.effectScope(request),
      custodyId: (scope, commandId) => this.#custody.custodyId(scope, commandId),
      effectCustody: (scope, commandId) => this.#custody.effectCustody(scope, commandId),
      custodyEffectRef: (custody) => this.#custody.custodyEffectRef(custody),
      storeCustodyOutcome: (scope, commandId, outcome) => this.#custody.storeCustodyOutcome(scope, commandId, outcome),
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
      effectScope: (request) => this.#custody.effectScope(request),
      storeCustodyOutcome: (scope, commandId, outcome) => this.#custody.storeCustodyOutcome(scope, commandId, outcome),
      custodyId: (scope, commandId) => this.#custody.custodyId(scope, commandId),
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
    const lifecyclePort: OperatorEffectCustodyLifecyclePort = {
      drainProject: (request) => this.#projectDaemonLifecycle.drainProject(request),
      stopProject: (request) => this.#projectDaemonLifecycle.stopProject(request),
      drainDaemon: (request) => this.#projectDaemonLifecycle.drainDaemon(request),
      stopDaemon: (request) => this.#projectDaemonLifecycle.stopDaemon(request),
      observeProjectDrain: (request) => this.#projectDaemonLifecycle.observeProjectDrain(request),
      observeProjectStop: (request) => this.#projectDaemonLifecycle.observeProjectStop(request),
      observeDaemonDrain: (commandId, daemonInstanceGeneration, request) =>
        this.#projectDaemonLifecycle.observeDaemonDrain(commandId, daemonInstanceGeneration, request),
      observeDaemonStop: (request) => this.#projectDaemonLifecycle.observeDaemonStop(request),
    };
    const controlPort: OperatorEffectCustodyControlPort = {
      assertPersistedControlActionOwners: (request) => this.#operatorControl.assertPersistedControlActionOwners(request),
      dispatchControl: (request) => this.#operatorControl.dispatchControl(request),
      observeControl: (request) => this.#operatorControl.observeControl(request),
    };
    const gitPort: OperatorEffectCustodyGitPort | undefined = this.#typedGit === undefined ? undefined : {
      prepare: (request) => this.#typedGit!.prepare(request),
      dispatch: (request) => this.#typedGit!.dispatch(request),
      observe: (request) => this.#typedGit!.observe(request),
      prepareAdministrative: (request) => this.#typedGit!.prepareAdministrative(request),
      administrativeOutcome: (intent) => this.#typedGit!.administrativeOutcome(intent),
    };
    const externalPort: OperatorEffectCustodyExternalPort | undefined = this.#externalEffects === undefined
      ? undefined
      : {
        prepareInTransaction: (request) => this.#externalEffects!.prepareInTransaction(request),
        dispatchPrepared: (handle) => this.#externalEffects!.dispatchPrepared(handle),
        observe: (request) => this.#externalEffects!.observe(request),
      };
    this.#custody = new OperatorEffectCustodyActions({
      database: this.#database,
      clock: this.#clock,
      host: { read: (intent) => this.#read(intent) },
      lifecycle: lifecyclePort,
      control: controlPort,
      ...(gitPort === undefined ? {} : { git: gitPort }),
      ...(externalPort === undefined ? {} : { external: externalPort }),
      fault: this.#fault,
    });
  }

  readonly statePort: OperatorActionStatePort = {
    read: async (intent) => this.#read(intent),
  };

  readonly effectPort: OperatorActionEffectPort = {
    prepare: (request) => this.#custody.prepareEffect(request),
    dispatch: async (request) => await this.#custody.dispatch(request),
    observe: async (request) => await this.#custody.observe(request),
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

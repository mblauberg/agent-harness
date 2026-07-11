import type {
  CommandId,
  OperatorActionClient,
  OperatorCapabilityCredential,
  OperatorMutationContext,
  ProjectId,
  ProjectSessionId,
} from "@local/agent-fabric-protocol";

import {
  ConsoleController,
  type ConsoleActionRequest,
  type ConsoleConfirmationInput,
  type ConsoleControllerState,
  type ConsoleSelection,
  type DirectConsoleActivation,
} from "./controller.js";
import {
  FABRIC_VIEWS,
  type FabricView,
} from "./model.js";
import {
  ConsoleProtocolAdapter,
  createBootstrapUnavailableDataset,
  type BootstrapUnavailableReason,
  type ConsoleProtocolBinding,
  type FabricConsoleDataset,
} from "./protocol-adapter.js";
import {
  FabricConsoleRuntime,
  type FabricConsoleRuntimeOptions,
  type FabricDetachReason,
  type FabricRuntimeActivation,
  type FabricRuntimeController,
} from "./runtime.js";
import type { FabricViewport } from "./presenter.js";
import type { FabricConsoleFrame } from "./index.js";

export type ConsoleBootstrapRequest = Readonly<{
  projectRoot: string;
  surface: "standalone" | "herdr";
}>;

export type ConsoleBootstrapConnection = Readonly<{
  status: "connected";
  binding: ConsoleProtocolBinding;
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  projectSessionId?: ProjectSessionId;
  detach(input: Readonly<{ reason: FabricDetachReason }>): Promise<void>;
  close(): Promise<void>;
}>;

export type ConsoleBootstrapResult =
  | ConsoleBootstrapConnection
  | Readonly<{
      status: "unavailable";
      reason: BootstrapUnavailableReason;
    }>;

export type ConsoleBootstrapPort = Readonly<{
  startOrAttach(request: ConsoleBootstrapRequest): Promise<ConsoleBootstrapResult>;
}>;

export type ConsoleActionPlanner = Readonly<{
  plan(input: Readonly<{
    activation: FabricRuntimeActivation;
    dataset: FabricConsoleDataset;
    state: ConsoleControllerState;
    draft: string;
  }>): Promise<ConsoleActionRequest | null>;
  confirmation(input: Readonly<{
    activation: FabricRuntimeActivation;
    dataset: FabricConsoleDataset;
    state: ConsoleControllerState;
    draft: string;
  }>): Promise<Readonly<{
    command: OperatorMutationContext;
    echoText?: string;
  }>>;
  reconcile?(input: Readonly<{
    targetCommandId: CommandId;
    activation: FabricRuntimeActivation;
    dataset: FabricConsoleDataset;
    state: ConsoleControllerState;
  }>): Promise<OperatorMutationContext>;
}>;

export type ConsoleApplicationOptions = Readonly<{
  bootstrap: ConsoleBootstrapPort;
  projectRoot: string;
  surface: "standalone" | "herdr";
  viewport: FabricViewport;
  draw: FabricConsoleRuntimeOptions["draw"];
  eventId: () => string;
  confirmationId: () => string;
  actionPlanner?: ConsoleActionPlanner;
  render: FabricConsoleRuntimeOptions["render"];
  reducePointer: FabricConsoleRuntimeOptions["reducePointer"];
  setMouseCapture?: (enabled: boolean) => void;
}>;

function viewRecord<Value>(value: Value): Record<FabricView, Value> {
  return Object.fromEntries(FABRIC_VIEWS.map((view) => [view, value])) as Record<
    FabricView,
    Value
  >;
}

class ReadOnlyProjectionController implements FabricRuntimeController {
  #dataset: FabricConsoleDataset;
  #state: ConsoleControllerState;

  constructor(dataset: FabricConsoleDataset) {
    this.#dataset = dataset;
    const firstSystem = dataset.pages.system.rows[0];
    const selectionByView = viewRecord<ConsoleSelection | null>(null);
    if (firstSystem !== undefined) {
      selectionByView.system = {
        stableId: firstSystem.stableId,
        revision: firstSystem.revision,
      };
    }
    this.#state = {
      activeView: firstSystem === undefined ? "attention" : "system",
      selectionByView,
      scrollAnchorByView: viewRecord<string | null>(null),
      review: null,
      pendingCommandIds: [],
      lastActionStatus: null,
      lastReceipt: null,
    };
  }

  get dataset(): FabricConsoleDataset {
    return this.#dataset;
  }

  get state(): ConsoleControllerState {
    return this.#state;
  }

  activateView(view: FabricView): void {
    this.#state = { ...this.#state, activeView: view };
  }

  select(view: FabricView, stableId: string): void {
    const row = this.#dataset.pages[view].rows.find(
      (candidate) => candidate.stableId === stableId,
    );
    if (row === undefined) return;
    this.#state = {
      ...this.#state,
      activeView: view,
      selectionByView: {
        ...this.#state.selectionByView,
        [view]: { stableId, revision: row.revision },
      },
    };
  }

  setScrollAnchor(view: FabricView, stableId: string | null): void {
    this.#state = {
      ...this.#state,
      scrollAnchorByView: {
        ...this.#state.scrollAnchorByView,
        [view]: stableId,
      },
    };
  }

  updateDataset(dataset: FabricConsoleDataset): void {
    this.#dataset = dataset;
  }
}

const rejectingActions: OperatorActionClient = {
  preview: async () => Promise.reject(new Error("operator actions unavailable")),
  commit: async () => Promise.reject(new Error("operator actions unavailable")),
  status: async () => Promise.reject(new Error("operator actions unavailable")),
  reconcile: async () => Promise.reject(new Error("operator actions unavailable")),
};

function directActivation(
  activation: FabricRuntimeActivation,
): DirectConsoleActivation {
  return { eventId: activation.eventId, source: activation.provenance };
}

export class FabricConsoleApplication {
  readonly #runtime: FabricConsoleRuntime;
  readonly #controller: FabricRuntimeController;
  readonly #adapter: ConsoleProtocolAdapter | null;
  readonly #planner: ConsoleActionPlanner | undefined;
  readonly #mutationController: ConsoleController | null;
  readonly #plannerEnablesMutation: boolean;

  constructor(input: Readonly<{
    runtime: FabricConsoleRuntime;
    controller: FabricRuntimeController;
    adapter: ConsoleProtocolAdapter | null;
    planner: ConsoleActionPlanner | undefined;
    mutationController: ConsoleController | null;
    plannerEnablesMutation: boolean;
  }>) {
    this.#runtime = input.runtime;
    this.#controller = input.controller;
    this.#adapter = input.adapter;
    this.#planner = input.planner;
    this.#mutationController = input.mutationController;
    this.#plannerEnablesMutation = input.plannerEnablesMutation;
  }

  get controller(): FabricRuntimeController {
    return this.#controller;
  }

  get dataset(): FabricConsoleDataset {
    return this.controller.dataset;
  }

  get frame(): FabricConsoleFrame {
    return this.#runtime.frame;
  }

  get closed(): boolean {
    return this.#runtime.closed;
  }

  handleInput(event: Parameters<FabricConsoleRuntime["handleInput"]>[0]): Promise<void> {
    return this.#runtime.handleInput(event);
  }

  resize(viewport: FabricViewport): FabricConsoleFrame {
    return this.#runtime.resize(viewport);
  }

  repaint(): FabricConsoleFrame {
    return this.#runtime.repaint();
  }

  async refresh(): Promise<FabricConsoleDataset> {
    if (this.#adapter === null) return this.dataset;
    const next = await this.#adapter.poll();
    const visible = this.#plannerEnablesMutation
      ? next
      : { ...next, canMutate: false };
    this.#runtime.updateDataset(visible);
    return visible;
  }

  close(reason: FabricDetachReason): Promise<void> {
    return this.#runtime.close(reason);
  }

  async handleActivation(activation: FabricRuntimeActivation): Promise<void> {
    const controller = this.#mutationController;
    const planner = this.#planner;
    if (controller === null || planner === undefined) return;
    if (activation.regionId === "review:continue") {
      controller.armConfirmation(directActivation(activation));
      return;
    }
    if (activation.regionId === "review:cancel") {
      controller.cancelReview();
      return;
    }
    if (activation.regionId === "review:close") {
      controller.closeReview();
      return;
    }
    if (activation.regionId === "review:refresh") {
      await this.refresh();
      return;
    }
    if (activation.regionId === "review:observe") {
      const status = controller.state.lastActionStatus;
      if (
        planner.reconcile !== undefined &&
        (status?.status === "pending" || status?.status === "ambiguous")
      ) {
        const targetCommandId = status.commandId as CommandId;
        const command = await planner.reconcile({
          targetCommandId,
          activation,
          dataset: controller.dataset,
          state: controller.state,
        });
        await controller.reconcilePending(targetCommandId, command);
      }
      return;
    }
    if (activation.regionId === "review:confirm") {
      const confirmation = await planner.confirmation({
        activation,
        dataset: controller.dataset,
        state: controller.state,
        draft: this.#runtime.ui.draft,
      });
      const input: ConsoleConfirmationInput = {
        eventId: activation.eventId,
        source: activation.provenance,
        ...(confirmation.echoText === undefined
          ? {}
          : { echoText: confirmation.echoText }),
      };
      await controller.confirmAction(input, confirmation.command);
      return;
    }
    const request = await planner.plan({
      activation,
      dataset: controller.dataset,
      state: controller.state,
      draft: this.#runtime.ui.draft,
    });
    if (request === null) return;
    if (
      request.activation.eventId !== activation.eventId ||
      request.activation.source !== activation.provenance ||
      request.itemId !== activation.binding?.itemId ||
      request.itemRevision !== activation.binding.itemRevision ||
      request.projectionRevision !== activation.binding.projectionRevision
    ) {
      throw new Error("action planner changed the activated revision binding");
    }
    await controller.beginAction(request);
  }
}

export async function startFabricConsoleApplication(
  options: ConsoleApplicationOptions,
): Promise<FabricConsoleApplication> {
  const bootstrap = await options.bootstrap.startOrAttach({
    projectRoot: options.projectRoot,
    surface: options.surface,
  });
  let adapter: ConsoleProtocolAdapter | null = null;
  let mutationController: ConsoleController | null = null;
  let controller: FabricRuntimeController;
  let connected: ConsoleBootstrapConnection | null = null;
  let dataset: FabricConsoleDataset;
  let plannerEnablesMutation = false;
  if (bootstrap.status === "unavailable") {
    dataset = createBootstrapUnavailableDataset(bootstrap.reason);
    controller = new ReadOnlyProjectionController(dataset);
  } else {
    connected = bootstrap;
    adapter = new ConsoleProtocolAdapter({
      binding: bootstrap.binding,
      credential: bootstrap.credential,
      projectId: bootstrap.projectId,
      ...(bootstrap.projectSessionId === undefined
        ? {}
        : { projectSessionId: bootstrap.projectSessionId }),
    });
    dataset = await adapter.open();
    const actionClient = adapter.actionClient;
    plannerEnablesMutation =
      actionClient !== null && options.actionPlanner !== undefined;
    if (!plannerEnablesMutation) dataset = { ...dataset, canMutate: false };
    mutationController = new ConsoleController({
      dataset,
      actions: actionClient ?? rejectingActions,
      credential: bootstrap.credential,
      projectId: bootstrap.projectId,
      ...(bootstrap.projectSessionId === undefined
        ? {}
        : { projectSessionId: bootstrap.projectSessionId }),
      ...(bootstrap.binding.ok
        ? { readGate: bootstrap.binding.port.readGate }
        : {}),
      confirmationId: options.confirmationId,
    });
    controller = mutationController;
  }

  let application: FabricConsoleApplication | null = null;
  const runtime = new FabricConsoleRuntime({
    controller,
    viewport: options.viewport,
    draw: options.draw,
    eventId: options.eventId,
    render: options.render,
    reducePointer: options.reducePointer,
    ...(options.setMouseCapture === undefined
      ? {}
      : { setMouseCapture: options.setMouseCapture }),
    activate: async (activation) => {
      await application?.handleActivation(activation);
    },
    detach: async ({ reason }) => {
      if (connected === null) return;
      try {
        await connected.detach({ reason });
      } finally {
        await connected.close();
      }
    },
  });
  application = new FabricConsoleApplication({
    runtime,
    controller,
    adapter,
    planner: options.actionPlanner,
    mutationController,
    plannerEnablesMutation,
  });
  // The runtime constructor is side-effect free so the bootstrap result is
  // complete before the first frame reaches the terminal.
  runtime.repaint();
  return application;
}

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
  GUIDED_WORKFLOW_ACTIONS,
  type GuidedWorkflowAction,
  type FabricView,
} from "./model.js";
import {
  ConsoleProtocolAdapter,
  createBootstrapUnavailableDataset,
  createProtocolIncompatibleDataset,
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
import type { FabricConsoleUiState, FabricViewport } from "./presenter.js";
import type { FabricConsoleFrame } from "./index.js";
import type { ConsoleWorkflowPlanner } from "./workflow.js";

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
  actionPlanner?: ConsoleActionPlanner;
  workflowPlanner?: ConsoleWorkflowPlanner;
  detach(input: Readonly<{ reason: FabricDetachReason }>): Promise<void>;
  close(): Promise<void>;
}>;

export type ConsoleBootstrapResult =
  | ConsoleBootstrapConnection
  | Readonly<{
      status: "unavailable";
      reason: BootstrapUnavailableReason;
    }>
  | Readonly<{
      status: "protocol-incompatible";
      primary: Readonly<{ code: string; message: string }>;
      retry?: Readonly<{
        status: "succeeded" | "failed";
        profile: "strict-v1";
        failure?: Readonly<{ code: string; message: string }>;
      }>;
      result?: Readonly<{
        code: string;
        message: string;
        operation?: string;
        closedReason?: string;
      }>;
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
  setEditorActive?: (enabled: boolean) => void;
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

class SwappableProjectionController implements FabricRuntimeController {
  #target: FabricRuntimeController;

  constructor(target: FabricRuntimeController) {
    this.#target = target;
  }

  get dataset(): FabricConsoleDataset {
    return this.#target.dataset;
  }

  get state(): ConsoleControllerState {
    return this.#target.state;
  }

  swap(target: FabricRuntimeController): void {
    this.#target = target;
  }

  activateView(view: FabricView): void {
    this.#target.activateView(view);
  }

  select(view: FabricView, stableId: string): void {
    this.#target.select(view, stableId);
  }

  setScrollAnchor(view: FabricView, stableId: string | null): void {
    this.#target.setScrollAnchor(view, stableId);
  }

  updateDataset(dataset: FabricConsoleDataset): void {
    this.#target.updateDataset(dataset);
  }
}

const rejectingActions: OperatorActionClient = {
  preview: async () => Promise.reject(new Error("operator actions unavailable")),
  commit: async () => Promise.reject(new Error("operator actions unavailable")),
  status: async () => Promise.reject(new Error("operator actions unavailable")),
  reconcile: async () => Promise.reject(new Error("operator actions unavailable")),
};

function guidedWorkflowPrompt(action: GuidedWorkflowAction): string {
  if (
    action === "discuss" || action === "accept" ||
    action === "request-changes" || action === "defer"
  ) {
    return `GUIDED ${action}: enter intake=<stable-id>; optional summary=<text>; Enter reviews; Esc cancels`;
  }
  return `GUIDED ${action}: enter named key=value fields; projection values are supplied by the typed planner; Enter reviews; Esc cancels`;
}

function directActivation(
  activation: FabricRuntimeActivation,
): DirectConsoleActivation {
  return { eventId: activation.eventId, source: activation.provenance };
}

type ConsoleApplicationConnection = Readonly<{
  controller: FabricRuntimeController;
  adapter: ConsoleProtocolAdapter | null;
  planner: ConsoleActionPlanner | undefined;
  workflowPlanner: ConsoleWorkflowPlanner | undefined;
  mutationController: ConsoleController | null;
  plannerEnablesMutation: boolean;
  connected: ConsoleBootstrapConnection | null;
}>;

export class FabricConsoleApplication {
  readonly #runtime: FabricConsoleRuntime;
  readonly #controller: SwappableProjectionController;
  readonly #connect: () => Promise<ConsoleApplicationConnection>;
  #adapter: ConsoleProtocolAdapter | null;
  #planner: ConsoleActionPlanner | undefined;
  #workflowPlanner: ConsoleWorkflowPlanner | undefined;
  #mutationController: ConsoleController | null;
  #plannerEnablesMutation: boolean;
  #connected: ConsoleBootstrapConnection | null;

  constructor(input: Readonly<{
    runtime: FabricConsoleRuntime;
    controller: SwappableProjectionController;
    connection: ConsoleApplicationConnection;
    connect: () => Promise<ConsoleApplicationConnection>;
  }>) {
    this.#runtime = input.runtime;
    this.#controller = input.controller;
    this.#connect = input.connect;
    this.#adapter = input.connection.adapter;
    this.#planner = input.connection.planner;
    this.#workflowPlanner = input.connection.workflowPlanner;
    this.#mutationController = input.connection.mutationController;
    this.#plannerEnablesMutation = input.connection.plannerEnablesMutation;
    this.#connected = input.connection.connected;
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

  get ui(): FabricConsoleUiState {
    return this.#runtime.ui;
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
    const inspection = this.dataset.inspection;
    const next = await this.#adapter.poll();
    const localCapabilities = {
      ...(this.dataset.workflowCapabilities === undefined
        ? {}
        : { workflowCapabilities: this.dataset.workflowCapabilities }),
      ...(this.dataset.productionActionPlanning === true
        ? { productionActionPlanning: true as const }
        : {}),
    };
    const mutationVisible = this.#plannerEnablesMutation
      ? { ...next, ...localCapabilities }
      : { ...next, ...localCapabilities, canMutate: false };
    const visible =
      inspection !== undefined &&
      inspection.binding.projectionRevision === mutationVisible.snapshotRevision
        ? { ...mutationVisible, inspection }
        : mutationVisible;
    this.#runtime.updateDataset(visible);
    return visible;
  }

  close(reason: FabricDetachReason): Promise<void> {
    return this.#runtime.close(reason);
  }

  async detachCurrent(reason: FabricDetachReason): Promise<void> {
    const connected = this.#connected;
    this.#connected = null;
    if (connected === null) return;
    try {
      await connected.detach({ reason });
    } finally {
      await connected.close();
    }
  }

  async #reconnectAfterProjectSessionCreate(): Promise<void> {
    const next = await this.#connect();
    if (
      next.connected === null ||
      next.connected.projectSessionId === undefined ||
      next.workflowPlanner === undefined
    ) {
      if (next.connected !== null) {
        try {
          await next.connected.detach({ reason: "safety" });
        } finally {
          await next.connected.close();
        }
      }
      throw Object.assign(new Error("created project session could not be attached"), {
        code: "CONSOLE_REATTACH_FAILED",
      });
    }
    const previous = this.#connected;
    this.#controller.swap(next.controller);
    this.#adapter = next.adapter;
    this.#planner = next.planner;
    this.#workflowPlanner = next.workflowPlanner;
    this.#mutationController = next.mutationController;
    this.#plannerEnablesMutation = next.plannerEnablesMutation;
    this.#connected = next.connected;
    this.#runtime.updateDataset(next.controller.dataset);
    if (previous !== null) {
      try {
        await previous.detach({ reason: "operator" });
      } finally {
        await previous.close();
      }
    }
  }

  async handleActivation(activation: FabricRuntimeActivation): Promise<void> {
    if (
      activation.regionId.startsWith("row:") &&
      activation.binding !== null &&
      this.#adapter !== null
    ) {
      const inspection = await this.#adapter.inspect(activation.binding);
      if (inspection !== null) {
        this.#runtime.updateDataset({ ...this.dataset, inspection });
      }
      return;
    }
    if (activation.regionId === "artifact:confirm-terminal-neutralised") {
      const inspection = this.dataset.inspection;
      if (
        activation.binding === null ||
        inspection?.kind !== "artifact" ||
        inspection.state !== "current" ||
        inspection.result.reviewDisposition !== "confirm-terminal-neutralised" ||
        activation.binding.view !== "evidence" ||
        activation.binding.itemId !== inspection.binding.itemId ||
        activation.binding.itemRevision !== inspection.binding.itemRevision ||
        activation.binding.projectionRevision !== inspection.binding.projectionRevision
      ) {
        throw new Error("terminal-neutralised artifact confirmation is stale");
      }
      this.#runtime.setArtifactConfirmation({
        evidenceId: inspection.binding.itemId,
        evidenceRevision: inspection.result.evidenceRevision,
        sourceDigest: inspection.result.artifactRef.digest,
        renderedDigest: inspection.result.renderedArtifactDigest,
        transformation: "terminal-neutralised",
        pageCount: inspection.result.coverage.pageCount,
      });
      return;
    }
    const workflowPlanner = this.#workflowPlanner;
    const workflowReview = this.#runtime.ui.workflowReview;
    if (activation.regionId.startsWith("workflow:")) {
      const action = activation.regionId.slice("workflow:".length);
      if (
        workflowPlanner === undefined ||
        activation.binding === null ||
        !(GUIDED_WORKFLOW_ACTIONS as readonly string[]).includes(action)
      ) {
        throw new Error("guided typed workflow is unavailable");
      }
      const binding = activation.binding;
      const currentRegion = this.#runtime.frame.hitRegions.find(
        (region) =>
          region.id === activation.regionId &&
          region.enabled &&
          region.geometryKey === this.#runtime.frame.geometryKey &&
          region.binding?.view === binding.view &&
          region.binding.itemId === binding.itemId &&
          region.binding.itemRevision === binding.itemRevision &&
          region.binding.projectionRevision === binding.projectionRevision,
      );
      if (currentRegion === undefined) {
        throw new Error("guided typed workflow is unavailable");
      }
      this.#runtime.beginGuidedWorkflow({
        action: action as GuidedWorkflowAction,
        binding,
        prompt: guidedWorkflowPrompt(action as GuidedWorkflowAction),
      });
      return;
    }
    if (activation.regionId === "guided:cancel") {
      this.#runtime.cancelGuidedWorkflow();
      return;
    }
    if (activation.regionId === "guided:submit") {
      const guided = this.#runtime.ui.guidedWorkflow;
      if (
        workflowPlanner === undefined ||
        guided === null ||
        activation.binding === null ||
        activation.binding.view !== guided.binding.view ||
        activation.binding.itemId !== guided.binding.itemId ||
        activation.binding.itemRevision !== guided.binding.itemRevision ||
        activation.binding.projectionRevision !== guided.binding.projectionRevision
      ) {
        throw new Error("guided typed workflow binding is stale");
      }
      const review = await workflowPlanner.prepareGuided({
        action: guided.action,
        binding: guided.binding,
        raw: this.#runtime.ui.draft,
        dataset: this.dataset,
        eventId: activation.eventId,
        ...(this.#runtime.ui.artifactConfirmation === null
          ? {}
          : { artifactConfirmation: this.#runtime.ui.artifactConfirmation }),
      });
      this.#runtime.setWorkflowReview(review);
      return;
    }
    if (activation.regionId === "palette:submit") {
      if (workflowPlanner === undefined) {
        throw new Error("typed Console workflows are unavailable");
      }
      const review = await workflowPlanner.prepare({
        raw: this.#runtime.ui.draft,
        dataset: this.dataset,
        eventId: activation.eventId,
      });
      this.#runtime.setWorkflowReview(review);
      return;
    }
    if (workflowReview !== null && activation.regionId.startsWith("review:")) {
      if (workflowPlanner === undefined) {
        throw new Error("typed Console workflow Review is unavailable");
      }
      if (
        activation.regionId === "review:cancel" ||
        activation.regionId === "review:close"
      ) {
        this.#runtime.setWorkflowReview(null);
        return;
      }
      if (activation.regionId === "review:continue") {
        this.#runtime.setWorkflowReview(
          workflowPlanner.arm(workflowReview, activation.eventId),
        );
        return;
      }
      if (activation.regionId === "review:confirm") {
        const committed = await workflowPlanner.commit({
          review: workflowReview,
          eventId: activation.eventId,
          echoText: this.#runtime.ui.draft,
        });
        this.#runtime.setWorkflowReview(committed.review);
        if (committed.reconnectRequired) {
          await this.#reconnectAfterProjectSessionCreate();
        } else {
          await this.refresh();
        }
        return;
      }
      return;
    }
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

async function openConsoleApplicationConnection(
  options: ConsoleApplicationOptions,
): Promise<ConsoleApplicationConnection> {
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
  let planner = options.actionPlanner;
  let workflowPlanner: ConsoleWorkflowPlanner | undefined;
  if (bootstrap.status === "unavailable") {
    dataset = createBootstrapUnavailableDataset(bootstrap.reason);
    controller = new ReadOnlyProjectionController(dataset);
  } else if (bootstrap.status === "protocol-incompatible") {
    dataset = createProtocolIncompatibleDataset(bootstrap);
    controller = new ReadOnlyProjectionController(dataset);
  } else {
    connected = bootstrap;
    try {
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
      planner ??= bootstrap.actionPlanner;
      workflowPlanner = bootstrap.workflowPlanner;
      dataset = {
        ...dataset,
        ...(workflowPlanner === undefined
          ? {}
          : { workflowCapabilities: workflowPlanner.capabilities }),
        ...(planner === undefined ? {} : { productionActionPlanning: true }),
      };
      plannerEnablesMutation =
        (actionClient !== null && planner !== undefined) ||
        workflowPlanner !== undefined;
      dataset = { ...dataset, canMutate: plannerEnablesMutation };
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
    } catch (error: unknown) {
      try {
        await bootstrap.detach({ reason: "safety" });
      } finally {
        await bootstrap.close();
      }
      throw error;
    }
  }

  return {
    controller,
    adapter,
    planner,
    workflowPlanner,
    mutationController,
    plannerEnablesMutation,
    connected,
  };
}

export async function startFabricConsoleApplication(
  options: ConsoleApplicationOptions,
): Promise<FabricConsoleApplication> {
  const connect = async (): Promise<ConsoleApplicationConnection> =>
    await openConsoleApplicationConnection(options);
  const connection = await connect();
  const controller = new SwappableProjectionController(connection.controller);

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
    ...(options.setEditorActive === undefined
      ? {}
      : { setEditorActive: options.setEditorActive }),
    activate: async (activation) => {
      await application?.handleActivation(activation);
    },
    detach: async ({ reason }) => {
      await application?.detachCurrent(reason);
    },
  });
  application = new FabricConsoleApplication({
    runtime,
    controller,
    connection,
    connect,
  });
  // The runtime constructor is side-effect free so the bootstrap result is
  // complete before the first frame reaches the terminal.
  runtime.repaint();
  return application;
}

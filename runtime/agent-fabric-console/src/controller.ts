import type {
  CommandId,
  GateId,
  OperatorActionClient,
  OperatorActionConfirmation,
  OperatorActionIntent,
  OperatorActionPreview,
  OperatorActionReceipt,
  OperatorActionStatus,
  OperatorAvailableAction,
  OperatorCapabilityCredential,
  OperatorMutationContext,
  ProjectId,
  ProjectSessionId,
  ScopedGate,
  ScopedGateReadRequest,
  ScopedGateReadResult,
  Sha256Digest,
} from "@local/agent-fabric-protocol";

import { operatorIntentRevision } from "./action-revision.js";

import {
  FABRIC_VIEWS,
  type ConsoleRow,
  type FabricView,
  type Revision,
} from "./model.js";
import type {
  ConsoleProtocolPort,
  FabricConsoleDataset,
} from "./protocol-adapter.js";

export type DirectConsoleActivation = Readonly<{
  eventId: string;
  source: "keyboard" | "mouse";
}>;

export type ConsoleConfirmationInput = Readonly<{
  eventId: string;
  source: "keyboard" | "mouse" | "paste" | "echo" | "injection";
  echoText?: string;
}>;

export type ConsoleActionRequest = Readonly<{
  view: FabricView;
  itemId: string;
  itemRevision: Revision;
  projectionRevision: Revision;
  availableAction: OperatorAvailableAction;
  intent: OperatorActionIntent;
  command: OperatorMutationContext;
  activation: DirectConsoleActivation;
}>;

export type ConsoleSelection = Readonly<{
  stableId: string;
  revision: Revision;
}>;

export type ReviewBinding = Readonly<{
  view: FabricView;
  itemId: string;
  itemRevision: Revision;
  projectionRevision: Revision;
}>;

export type ReviewGate = Readonly<{
  gateId: GateId;
  gate: ScopedGate;
  stateDigest: Sha256Digest;
  readTransactionId: string;
  changedFromRevision: number | null;
}>;

export type ReviewChange = Readonly<{
  field: "projectionRevision" | "itemRevision" | "connection";
  before: string;
  after: string;
}>;

export type ActionReviewStage =
  | "review"
  | "confirm"
  | "pending"
  | "ambiguous"
  | "committed"
  | "rejected"
  | "unresolved"
  | "conflict";

export type ActionReview = Readonly<{
  stage: ActionReviewStage;
  binding: ReviewBinding;
  availableAction: OperatorAvailableAction;
  preview: OperatorActionPreview;
  gates: readonly ReviewGate[];
  openedByEventId: string;
  armedByEventId: string | null;
  changes: readonly ReviewChange[];
  status: OperatorActionStatus | null;
}>;

type SelectionByView = Readonly<{
  [View in FabricView]: ConsoleSelection | null;
}>;

type ScrollAnchorByView = Readonly<{
  [View in FabricView]: string | null;
}>;

export type ConsoleControllerState = Readonly<{
  activeView: FabricView;
  selectionByView: SelectionByView;
  scrollAnchorByView: ScrollAnchorByView;
  review: ActionReview | null;
  pendingCommandIds: readonly string[];
  lastActionStatus: OperatorActionStatus | null;
  lastReceipt: OperatorActionReceipt | null;
  lastFailure?: ConsoleActionFailure | null;
}>;

export type ConsoleActionFailure = Readonly<{
  code: string;
  name: string;
}>;

function safeFailureToken(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(value)
    ? value
    : fallback;
}

export function consoleFailureFromUnknown(error: unknown): ConsoleActionFailure {
  if (typeof error !== "object" || error === null) {
    return { code: "OPERATOR_ACTION_FAILED", name: "Error" };
  }
  return {
    code: safeFailureToken(
      Reflect.get(error, "code"),
      "OPERATOR_ACTION_FAILED",
    ),
    name: safeFailureToken(Reflect.get(error, "name"), "Error"),
  };
}

export type ConsoleControllerOptions = Readonly<{
  dataset: FabricConsoleDataset;
  actions: OperatorActionClient;
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  projectSessionId?: ProjectSessionId;
  readGate?: ConsoleProtocolPort["readGate"];
  confirmationId: () => string;
  now?: () => number;
}>;

function nullableViewRecord<Value>(value: Value): Record<FabricView, Value> {
  return Object.fromEntries(FABRIC_VIEWS.map((view) => [view, value])) as Record<
    FabricView,
    Value
  >;
}

function directActivation(
  input: ConsoleConfirmationInput | DirectConsoleActivation,
): input is DirectConsoleActivation {
  return input.source === "keyboard" || input.source === "mouse";
}

function intentAvailableAction(
  intent: OperatorActionIntent,
): OperatorAvailableAction {
  if (intent.kind === "control") {
    return intent.action;
  }
  if (
    intent.kind === "project-session-drain" ||
    intent.kind === "project-session-stop" ||
    intent.kind === "daemon-drain" ||
    intent.kind === "daemon-stop"
  ) {
    return intent.kind;
  }
  if (intent.kind === "git") {
    return "git";
  }
  if (intent.kind === "registered-external-effect") {
    return "registered-external-effect";
  }
  return "promotion";
}

function structuralKey(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => structuralKey(item)).join(",")}]`;
  }
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${structuralKey(item)}`)
    .join(",")}}`;
}

function connectionLabel(dataset: FabricConsoleDataset): string {
  return dataset.connection.state;
}

export class ConsoleController {
  readonly #actions: OperatorActionClient;
  readonly #credential: OperatorCapabilityCredential;
  readonly #projectId: ProjectId;
  readonly #projectSessionId: ProjectSessionId | undefined;
  readonly #readGate: ConsoleProtocolPort["readGate"] | undefined;
  readonly #confirmationId: () => string;
  readonly #now: () => number;
  readonly #commitPromises = new Map<string, Promise<OperatorActionStatus>>();
  readonly #reconcilePromises = new Map<
    string,
    Promise<OperatorActionStatus>
  >();
  #dataset: FabricConsoleDataset;
  #state: ConsoleControllerState;

  constructor(options: ConsoleControllerOptions) {
    this.#dataset = options.dataset;
    this.#actions = options.actions;
    this.#credential = options.credential;
    this.#projectId = options.projectId;
    this.#projectSessionId = options.projectSessionId;
    this.#readGate = options.readGate;
    this.#confirmationId = options.confirmationId;
    this.#now = options.now ?? Date.now;
    this.#state = {
      activeView: "attention",
      selectionByView: nullableViewRecord<ConsoleSelection | null>(null),
      scrollAnchorByView: nullableViewRecord<string | null>(null),
      review: null,
      pendingCommandIds: [],
      lastActionStatus: null,
      lastReceipt: null,
      lastFailure: null,
    };
  }

  get state(): ConsoleControllerState {
    return this.#state;
  }

  get dataset(): FabricConsoleDataset {
    return this.#dataset;
  }

  activateView(view: FabricView): void {
    this.#state = { ...this.#state, activeView: view };
  }

  select(view: FabricView, stableId: string): void {
    const row = this.#row(view, stableId);
    if (row === null) {
      throw new RangeError("Console selection is not present in the current projection");
    }
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
    if (stableId !== null && this.#row(view, stableId) === null) {
      throw new RangeError("Console scroll anchor is not present in the current projection");
    }
    this.#state = {
      ...this.#state,
      scrollAnchorByView: {
        ...this.#state.scrollAnchorByView,
        [view]: stableId,
      },
    };
  }

  updateDataset(dataset: FabricConsoleDataset): void {
    const previous = this.#dataset;
    this.#dataset = dataset;
    const selections = { ...this.#state.selectionByView };
    const anchors = { ...this.#state.scrollAnchorByView };
    for (const view of FABRIC_VIEWS) {
      const selection = selections[view];
      if (selection !== null) {
        const current = this.#row(view, selection.stableId);
        selections[view] =
          current === null
            ? null
            : { stableId: selection.stableId, revision: current.revision };
      }
      const anchor = anchors[view];
      if (anchor !== null && this.#row(view, anchor) === null) {
        anchors[view] = dataset.pages[view].rows[0]?.stableId ?? null;
      }
    }

    let review = this.#state.review;
    if (
      review !== null &&
      (review.stage === "review" || review.stage === "confirm")
    ) {
      const changes: ReviewChange[] = [];
      if (dataset.snapshotRevision !== review.binding.projectionRevision) {
        changes.push({
          field: "projectionRevision",
          before: review.binding.projectionRevision,
          after: dataset.snapshotRevision ?? "unavailable",
        });
      }
      const current = this.#row(review.binding.view, review.binding.itemId);
      if (current?.revision !== review.binding.itemRevision) {
        changes.push({
          field: "itemRevision",
          before: review.binding.itemRevision,
          after: current?.revision ?? "removed",
        });
      }
      if (dataset.connection.state !== "live") {
        changes.push({
          field: "connection",
          before: connectionLabel(previous),
          after: connectionLabel(dataset),
        });
      }
      if (changes.length > 0) {
        review = { ...review, stage: "conflict", changes };
      }
    }

    this.#state = {
      ...this.#state,
      selectionByView: selections,
      scrollAnchorByView: anchors,
      review,
    };
  }

  async beginAction(request: ConsoleActionRequest): Promise<ActionReview> {
    this.#assertLiveMutation();
    if (!directActivation(request.activation)) {
      throw new TypeError("action activation must be direct keyboard or mouse input");
    }
    this.#assertCommand(
      request.command,
      request.activation.eventId,
      request.intent,
    );
    if (request.projectionRevision !== this.#dataset.snapshotRevision) {
      throw new Error("action projection revision is stale");
    }
    const selection = this.#state.selectionByView[request.view];
    const row = this.#row(request.view, request.itemId);
    if (
      row === null ||
      selection?.stableId !== request.itemId ||
      row.revision !== request.itemRevision ||
      selection.revision !== request.itemRevision
    ) {
      throw new Error("action item revision or selection is stale");
    }
    if (row.freshness.state !== "live") {
      throw new Error("actions require a live item fact");
    }
    if (
      row.actionAvailability.state !== "available" ||
      !row.actionAvailability.actions.includes(request.availableAction)
    ) {
      throw new Error("action is not available for the selected item");
    }
    if (intentAvailableAction(request.intent) !== request.availableAction) {
      throw new Error("typed action intent does not match the selected action");
    }

    let preview: OperatorActionPreview;
    try {
      preview = await this.#actions.preview({
        command: request.command,
        projectId: this.#projectId,
        intent: request.intent,
      });
    } catch (error) {
      this.#state = {
        ...this.#state,
        lastFailure: consoleFailureFromUnknown(error),
      };
      throw error;
    }
    if (structuralKey(preview.intent) !== structuralKey(request.intent)) {
      throw new Error("action preview intent does not match the requested intent");
    }
    if (Date.parse(preview.expiresAt) <= this.#now()) {
      throw new Error("action preview expired before Review opened");
    }
    const gates = await this.#readReviewGates(preview.gateIds);
    const review: ActionReview = {
      stage: "review",
      binding: {
        view: request.view,
        itemId: request.itemId,
        itemRevision: request.itemRevision,
        projectionRevision: request.projectionRevision,
      },
      availableAction: request.availableAction,
      preview,
      gates,
      openedByEventId: request.activation.eventId,
      armedByEventId: null,
      changes: [],
      status: null,
    };
    this.#state = { ...this.#state, review };
    return review;
  }

  armConfirmation(activation: DirectConsoleActivation): ActionReview {
    const review = this.#state.review;
    if (review === null || review.stage !== "review") {
      throw new Error("Review is not available to arm");
    }
    if (!directActivation(activation)) {
      throw new TypeError("confirmation must use direct keyboard or mouse input");
    }
    if (activation.eventId === review.openedByEventId) {
      throw new Error("confirmation requires a distinct input event");
    }
    const armed: ActionReview = {
      ...review,
      stage: "confirm",
      armedByEventId: activation.eventId,
    };
    this.#state = { ...this.#state, review: armed };
    return armed;
  }

  cancelReview(): void {
    const stage = this.#state.review?.stage;
    if (stage === "pending" || stage === "ambiguous") {
      throw new Error("a dispatched action cannot be cancelled from the Console");
    }
    this.#state = { ...this.#state, review: null };
  }

  closeReview(): void {
    const stage = this.#state.review?.stage;
    if (stage === "review" || stage === "confirm") {
      throw new Error("an uncommitted Review must be explicitly cancelled");
    }
    this.#state = { ...this.#state, review: null };
  }

  confirmAction(
    input: ConsoleConfirmationInput,
    command: OperatorMutationContext,
  ): Promise<OperatorActionStatus> {
    const commandId = command.commandId as string;
    const existing = this.#commitPromises.get(commandId);
    if (existing !== undefined) {
      return existing;
    }
    const operation = this.#commitAction(input, command);
    this.#commitPromises.set(commandId, operation);
    void operation.then(
      () => this.#commitPromises.delete(commandId),
      () => this.#commitPromises.delete(commandId),
    );
    return operation;
  }

  reconcilePending(
    targetCommandId: CommandId,
    command: OperatorMutationContext,
  ): Promise<OperatorActionStatus> {
    const target = targetCommandId as string;
    const existing = this.#reconcilePromises.get(target);
    if (existing !== undefined) {
      return existing;
    }
    this.#assertLiveMutation();
    this.#assertCommand(command);
    const operation = this.#reconcile(targetCommandId, command);
    this.#reconcilePromises.set(target, operation);
    void operation.then(
      () => this.#reconcilePromises.delete(target),
      () => this.#reconcilePromises.delete(target),
    );
    return operation;
  }

  async #commitAction(
    input: ConsoleConfirmationInput,
    command: OperatorMutationContext,
  ): Promise<OperatorActionStatus> {
    this.#assertLiveMutation();
    const review = this.#state.review;
    if (review === null || review.stage !== "confirm") {
      throw new Error("Review is not armed for confirmation");
    }
    if (!directActivation(input)) {
      throw new TypeError("confirmation must use direct keyboard or mouse input");
    }
    if (
      input.eventId === review.openedByEventId ||
      input.eventId === review.armedByEventId
    ) {
      throw new Error("commit requires a distinct confirmation input event");
    }
    this.#assertCommand(command, input.eventId, review.preview.intent);
    this.#assertReviewCurrent(review);
    const confirmation: OperatorActionConfirmation =
      review.preview.confirmationMode === "echo"
        ? this.#echoConfirmation(input, review.preview.previewDigest)
        : { kind: "explicit", confirmationId: this.#confirmationId() };
    const pendingReview: ActionReview = { ...review, stage: "pending" };
    this.#state = {
      ...this.#state,
      review: pendingReview,
      pendingCommandIds: [
        ...new Set([
          ...this.#state.pendingCommandIds,
          command.commandId as string,
        ]),
      ],
    };

    try {
      const committed = await this.#actions.commit({
        command,
        projectId: this.#projectId,
        previewId: review.preview.previewId,
        expectedPreviewRevision: review.preview.previewRevision,
        previewDigest: review.preview.previewDigest,
        expectedIntentDigest: review.preview.intentDigest,
        confirmation,
      });
      this.#assertReceipt(committed, command.commandId, review.preview);
      const status: OperatorActionStatus = {
        status: "committed",
        commandId: command.commandId,
        receipt: committed,
      };
      this.#applyStatus(status);
      return status;
    } catch (error) {
      this.#state = {
        ...this.#state,
        lastFailure: consoleFailureFromUnknown(error),
      };
      let status: OperatorActionStatus;
      try {
        status = await this.#actions.status({
          credential: this.#credential,
          projectId: this.#projectId,
          commandId: command.commandId,
        });
      } catch (statusError) {
        this.#state = {
          ...this.#state,
          lastFailure: consoleFailureFromUnknown(statusError),
        };
        throw statusError;
      }
      this.#applyStatus(status);
      return status;
    }
  }

  async #reconcile(
    targetCommandId: CommandId,
    command: OperatorMutationContext,
  ): Promise<OperatorActionStatus> {
    let status = await this.#actions.status({
      credential: this.#credential,
      projectId: this.#projectId,
      commandId: targetCommandId,
    });
    if (status.status === "pending" || status.status === "ambiguous") {
      status = await this.#actions.reconcile({
        command,
        projectId: this.#projectId,
        targetCommandId,
        expectedStatus: status.status,
        expectedAttemptGeneration: status.attemptGeneration,
        mode: "observe-only",
      });
    }
    this.#applyStatus(status);
    return status;
  }

  #echoConfirmation(
    input: ConsoleConfirmationInput,
    previewDigest: Sha256Digest,
  ): OperatorActionConfirmation {
    if (input.echoText !== previewDigest) {
      throw new Error("destructive confirmation requires the exact preview digest");
    }
    return { kind: "echo", echoedPreviewDigest: previewDigest };
  }

  #assertLiveMutation(): void {
    if (
      this.#dataset.connection.state !== "live" ||
      !this.#dataset.canMutate ||
      this.#dataset.snapshotRevision === null
    ) {
      throw new Error("Console mutations require a live canonical projection");
    }
  }

  #assertCommand(
    command: OperatorMutationContext,
    inputEventId?: string,
    intent?: OperatorActionIntent,
  ): void {
    if (
      command.credential.capabilityId !== this.#credential.capabilityId ||
      command.credential.token !== this.#credential.token
    ) {
      throw new Error("operator command capability does not match this Console");
    }
    if (
      !Number.isSafeInteger(command.expectedRevision) ||
      command.expectedRevision < 0 ||
      (intent !== undefined &&
        operatorIntentRevision(intent) !== null &&
        command.expectedRevision !== operatorIntentRevision(intent))
    ) {
      throw new Error("operator command expected revision is stale");
    }
    if (command.provenance.kind !== "console-direct-input") {
      throw new Error("Console command provenance is not direct input");
    }
    if (
      inputEventId !== undefined &&
      command.provenance.inputEventId !== inputEventId
    ) {
      throw new Error("operator command provenance input event does not match");
    }
  }

  #assertReviewCurrent(review: ActionReview): void {
    if (review.binding.projectionRevision !== this.#dataset.snapshotRevision) {
      throw new Error("Review projection revision changed");
    }
    const row = this.#row(review.binding.view, review.binding.itemId);
    if (
      row === null ||
      row.revision !== review.binding.itemRevision ||
      row.freshness.state !== "live"
    ) {
      throw new Error("Review item revision changed");
    }
    if (Date.parse(review.preview.expiresAt) <= this.#now()) {
      throw new Error("Review preview expired");
    }
  }

  #assertReceipt(
    receipt: OperatorActionReceipt,
    commandId: CommandId,
    preview: OperatorActionPreview,
  ): void {
    if (
      receipt.commandId !== commandId ||
      receipt.previewId !== preview.previewId ||
      receipt.previewRevision !== preview.previewRevision ||
      receipt.intentDigest !== preview.intentDigest ||
      receipt.beforeStateDigest !== preview.beforeStateDigest
    ) {
      throw new Error("operator action receipt does not match the confirmed Review");
    }
  }

  #applyStatus(status: OperatorActionStatus): void {
    const terminal =
      status.status === "committed" ||
      status.status === "rejected" ||
      status.status === "not-found";
    const pendingCommandIds = terminal
      ? this.#state.pendingCommandIds.filter(
          (commandId) => commandId !== (status.commandId as string),
        )
      : [
          ...new Set([
            ...this.#state.pendingCommandIds,
            status.commandId as string,
          ]),
        ];
    const stage: ActionReviewStage =
      status.status === "committed"
        ? "committed"
        : status.status === "rejected"
          ? "rejected"
          : status.status === "ambiguous"
            ? "ambiguous"
            : status.status === "pending"
              ? "pending"
              : "unresolved";
    this.#state = {
      ...this.#state,
      pendingCommandIds,
      lastActionStatus: status,
      lastReceipt:
        status.status === "committed"
          ? status.receipt
          : this.#state.lastReceipt,
      lastFailure:
        status.status === "committed" ? null : this.#state.lastFailure ?? null,
      review:
        this.#state.review === null
          ? null
          : { ...this.#state.review, stage, status },
    };
  }

  async #readReviewGates(
    gateIds: readonly GateId[],
  ): Promise<readonly ReviewGate[]> {
    if (gateIds.length === 0) {
      return [];
    }
    if (this.#readGate === undefined || this.#projectSessionId === undefined) {
      throw new Error("Review gate detail is unavailable");
    }
    const readGate = this.#readGate;
    const projectSessionId = this.#projectSessionId;
    return Promise.all(
      gateIds.map(async (gateId): Promise<ReviewGate> => {
        const request: ScopedGateReadRequest = {
          credential: this.#credential,
          projectId: this.#projectId,
          projectSessionId,
          gateId,
        };
        const result: ScopedGateReadResult = await readGate(request);
        return {
          gateId,
          gate: result.gate,
          stateDigest: result.stateDigest,
          readTransactionId: result.readTransactionId,
          changedFromRevision:
            result.status === "changed" ? result.expectedRevision : null,
        };
      }),
    );
  }

  #row(view: FabricView, stableId: string): ConsoleRow | null {
    return (
      this.#dataset.pages[view].rows.find(
        (candidate) => candidate.stableId === stableId,
      ) ?? null
    );
  }
}

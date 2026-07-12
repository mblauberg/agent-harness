import stringWidth from "string-width";
import { splitGraphemes } from "unicode-segmenter/grapheme";

import type { TerminalInputEvent } from "./input.js";
import {
  consoleFailureFromUnknown,
  type ConsoleControllerState,
} from "./controller.js";
import type {
  FabricConsoleFrame,
  FabricHitBinding,
  FabricHitRegion,
  FabricPointerIntent,
  FabricPointerState,
} from "./index.js";
import { FABRIC_VIEWS, type FabricView } from "./model.js";
import {
  createFabricUiState,
  matchesArtifactConfirmation,
  type ArtifactReviewConfirmation,
  type ConsoleGuidedWorkflowDraft,
  type FabricConsoleUiState,
  type FabricViewport,
} from "./presenter.js";
import type { FabricConsoleDataset } from "./protocol-adapter.js";

export type FabricRuntimeController = {
  readonly state: ConsoleControllerState;
  readonly dataset: FabricConsoleDataset;
  activateView(view: FabricView): void;
  select(view: FabricView, stableId: string): void;
  setScrollAnchor(view: FabricView, stableId: string | null): void;
  updateDataset(dataset: FabricConsoleDataset): void;
};

export type FabricRuntimeActivation = Readonly<{
  regionId: string;
  binding: FabricHitBinding | null;
  provenance: "keyboard" | "mouse";
  eventId: string;
}>;

export type FabricDetachReason = "operator" | "safety" | "signal";

export type FabricConsoleRuntimeOptions = Readonly<{
  controller: FabricRuntimeController;
  viewport: FabricViewport;
  ui?: FabricConsoleUiState;
  maxDraftBytes?: number;
  draw: (frame: FabricConsoleFrame) => void;
  detach: (input: Readonly<{ reason: FabricDetachReason }>) => Promise<void>;
  activate: (activation: FabricRuntimeActivation) => Promise<void>;
  eventId: () => string;
  setMouseCapture?: (enabled: boolean) => void;
  setEditorActive?: (enabled: boolean) => void;
  render: (
    dataset: FabricConsoleDataset,
    controller: ConsoleControllerState,
    ui: FabricConsoleUiState,
    viewport: FabricViewport,
  ) => FabricConsoleFrame;
  reducePointer: (
    state: FabricPointerState,
    event: Extract<TerminalInputEvent, { kind: "mouse" }>,
    frame: FabricConsoleFrame,
    dataset: FabricConsoleDataset,
  ) => Readonly<{
    state: FabricPointerState;
    intents: readonly Readonly<{
      kind: "activate-region" | "scroll" | "move-splitter";
      regionId: string | null;
      binding: FabricHitBinding | null;
      direction?: -1 | 1;
      x?: number;
      y?: number;
      provenance: "mouse";
    }>[];
  }>;
}>;

function maxDraftBytes(value: number | undefined): number {
  if (value === undefined) return 16_384;
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_048_576) {
    throw new TypeError("maxDraftBytes must be an integer from 1 to 1048576");
  }
  return value;
}

function boundedUtf8(value: string, maximumBytes: number): string {
  const encoded = Buffer.from(value);
  if (encoded.byteLength <= maximumBytes) return value;
  let end = maximumBytes;
  while (end > 0 && (encoded[end] ?? 0) >= 0x80 && (encoded[end] ?? 0) < 0xc0) {
    end -= 1;
  }
  return encoded.subarray(0, end).toString("utf8");
}

function nextView(view: FabricView, delta: -1 | 1): FabricView {
  const current = FABRIC_VIEWS.indexOf(view);
  const index = (current + delta + FABRIC_VIEWS.length) % FABRIC_VIEWS.length;
  return FABRIC_VIEWS[index] ?? "attention";
}

function cellSlice(value: string, start: number, end: number): string {
  let column = 0;
  let output = "";
  for (const grapheme of splitGraphemes(value)) {
    const nextColumn = column + stringWidth(grapheme);
    if (nextColumn > start && column < end) output += grapheme;
    column = nextColumn;
    if (column >= end) break;
  }
  return output;
}

type CapturedActionTarget =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "shortcut";
      actionContext: boolean;
      region: FabricHitRegion | null;
    }>
  | Readonly<{
      kind: "focused-region";
      region: FabricHitRegion | null;
    }>;

type CapturedPointerIntent = Readonly<{
  intent: FabricPointerIntent;
  region: FabricHitRegion | null;
}>;

type CapturedInput = Readonly<{
  event: TerminalInputEvent;
  frame: FabricConsoleFrame;
  reviewEpoch: string | null;
  actionTarget: CapturedActionTarget;
  pointerIntents: readonly CapturedPointerIntent[];
}>;

function reviewEpoch(frame: FabricConsoleFrame): string | null {
  const review = frame.presentation.review;
  return review === null
    ? null
    : JSON.stringify([
        review.stage,
        review.workflowId,
        review.itemId,
        review.itemRevision,
        review.projectionRevision,
        review.previewRevision,
        review.previewDigest,
        review.confirmationMode,
      ]);
}

export class FabricConsoleRuntime {
  readonly #controller: FabricRuntimeController;
  readonly #draw: (frame: FabricConsoleFrame) => void;
  readonly #detach: FabricConsoleRuntimeOptions["detach"];
  readonly #activate: FabricConsoleRuntimeOptions["activate"];
  readonly #eventId: () => string;
  readonly #setMouseCapture: ((enabled: boolean) => void) | undefined;
  readonly #setEditorActive: ((enabled: boolean) => void) | undefined;
  readonly #render: FabricConsoleRuntimeOptions["render"];
  readonly #reducePointer: FabricConsoleRuntimeOptions["reducePointer"];
  readonly #maxDraftBytes: number;
  #viewport: FabricViewport;
  #ui: FabricConsoleUiState;
  #frame: FabricConsoleFrame;
  #pointer: FabricPointerState = { pressed: null };
  #restorableResizeFocus: Readonly<{
    focusId: string;
    migratedFocusId: string | null;
  }> | null = null;
  #reviewFocusSession: {
    openerFocusId: string | null;
    editorSurrogateId: string | null;
  } | null = null;
  #inputFocusSession: Readonly<{ openerFocusId: string | null }> | null = null;
  #pendingReviewOpener: Readonly<{ focusId: string | null }> | null = null;
  #closed = false;
  #closePromise: Promise<void> | null = null;
  #inputTail: Promise<void> = Promise.resolve();

  constructor(options: FabricConsoleRuntimeOptions) {
    this.#controller = options.controller;
    this.#viewport = options.viewport;
    this.#ui = options.ui ?? createFabricUiState();
    this.#draw = options.draw;
    this.#detach = options.detach;
    this.#activate = options.activate;
    this.#eventId = options.eventId;
    this.#setMouseCapture = options.setMouseCapture;
    this.#setEditorActive = options.setEditorActive;
    this.#render = options.render;
    this.#reducePointer = options.reducePointer;
    this.#maxDraftBytes = maxDraftBytes(options.maxDraftBytes);
    this.#frame = this.#renderCurrentFrame();
  }

  get ui(): FabricConsoleUiState {
    return this.#ui;
  }

  get frame(): FabricConsoleFrame {
    return this.#frame;
  }

  get closed(): boolean {
    return this.#closed;
  }

  repaint(): FabricConsoleFrame {
    this.#frame = this.#reconcileFocus(this.#renderCurrentFrame());
    if (!this.#closed) {
      this.#draw(this.#frame);
      this.#recordReviewCoverage(this.#frame);
    }
    return this.#frame;
  }

  #renderCurrentFrame(): FabricConsoleFrame {
    return this.#render(
      this.#controller.dataset,
      this.#controller.state,
      this.#ui,
      this.#viewport,
    );
  }

  #recordReviewCoverage(frame: FabricConsoleFrame): void {
    const observation = frame.reviewCoverage;
    const nextCoverage = frame.presentation.review === null
      ? null
      : observation === undefined || observation === null
        ? this.#ui.reviewCoverage
        : {
            reviewKey: observation.reviewKey,
            coveredThrough: observation.coveredThrough,
            requiredEnd: observation.requiredEnd,
          };
    const current = this.#ui.reviewCoverage;
    if (
      current?.reviewKey !== nextCoverage?.reviewKey ||
      current?.coveredThrough !== nextCoverage?.coveredThrough ||
      current?.requiredEnd !== nextCoverage?.requiredEnd
    ) {
      this.#ui = { ...this.#ui, reviewCoverage: nextCoverage };
    }
  }

  #reconcileFocus(frame: FabricConsoleFrame): FabricConsoleFrame {
    const review = frame.presentation.review;
    if (review !== null && this.#reviewFocusSession === null) {
      this.#reviewFocusSession = {
        openerFocusId: this.#pendingReviewOpener === null
          ? this.#ui.focusId
          : this.#pendingReviewOpener.focusId,
        editorSurrogateId: null,
      };
      this.#pendingReviewOpener = null;
    }
    if (this.#ui.inputMode !== "browse") {
      const inputFocusId = frame.hitRegions.find(
        ({ enabled, id, kind }) =>
          enabled && kind === "input" && id === `input:${this.#ui.inputMode}`,
      )?.id ?? frame.hitRegions.find(
        ({ enabled, id }) => enabled && id === "detach",
      )?.id ?? this.#visibleSafeFocus(frame);
      if (review !== null && this.#reviewFocusSession !== null) {
        this.#reviewFocusSession.editorSurrogateId = inputFocusId;
      }
      if (this.#ui.focusId === inputFocusId) return frame;
      this.#ui = { ...this.#ui, focusId: inputFocusId };
      return this.#renderCurrentFrame();
    }
    if (review === null) {
      const session = this.#reviewFocusSession;
      if (session !== null) {
        this.#reviewFocusSession = null;
        const openerVisible =
          session.openerFocusId !== null && frame.hitRegions.some(
            ({ enabled, id }) => enabled && id === session.openerFocusId,
          );
        const restoredFocusId = openerVisible
          ? session.openerFocusId
          : this.#visibleSafeFocus(frame);
        if (this.#ui.focusId === restoredFocusId) {
          return this.#reconcileBrowseFocus(frame);
        }
        this.#ui = { ...this.#ui, focusId: restoredFocusId };
        return this.#reconcileBrowseFocus(this.#renderCurrentFrame());
      }
      const inputSession = this.#inputFocusSession;
      this.#inputFocusSession = null;
      if (inputSession === null) return this.#reconcileBrowseFocus(frame);
      const openerVisible = inputSession.openerFocusId !== null && frame.hitRegions.some(
        ({ enabled, id }) => enabled && id === inputSession.openerFocusId,
      );
      const restoredFocusId = openerVisible
        ? inputSession.openerFocusId
        : this.#visibleSafeFocus(frame);
      this.#ui = { ...this.#ui, focusId: restoredFocusId };
      return this.#reconcileBrowseFocus(this.#renderCurrentFrame());
    }
    this.#inputFocusSession = null;

    const editorSurrogateId = this.#reviewFocusSession?.editorSurrogateId ?? null;
    if (this.#reviewFocusSession !== null) {
      this.#reviewFocusSession.editorSurrogateId = null;
    }
    if (
      this.#ui.focusId !== editorSurrogateId &&
      frame.hitRegions.some(
        ({ enabled, id }) => enabled && id === this.#ui.focusId,
      )
    ) {
      return this.#reconcileBrowseFocus(frame);
    }

    const preferredId =
      review.stage === "review"
        ? "review:continue"
        : review.stage === "confirm"
          ? "review:cancel"
          : review.stage === "conflict"
            ? "review:refresh"
            : review.stage === "pending" || review.stage === "ambiguous"
              ? "review:observe"
              : "review:close";
    const reviewFocusId = frame.hitRegions.find(
      ({ enabled, id, kind }) =>
        enabled && kind === "action" && id === preferredId,
    )?.id ?? frame.hitRegions.find(
      ({ enabled, id, kind }) =>
        enabled && kind === "action" && id.startsWith("review:"),
    )?.id ?? this.#visibleSafeFocus(frame);
    if (this.#ui.focusId === reviewFocusId) {
      return this.#reconcileBrowseFocus(frame);
    }
    this.#ui = { ...this.#ui, focusId: reviewFocusId };
    return this.#reconcileBrowseFocus(this.#renderCurrentFrame());
  }

  #reconcileBrowseFocus(frame: FabricConsoleFrame): FabricConsoleFrame {
    if (
      frame.mode === "inert" ||
      this.#hasEnabledVisibleFocus(frame)
    ) {
      return frame;
    }
    const previousFocusId = this.#ui.focusId;
    const currentFocusEnabled = frame.hitRegions.some(
      ({ enabled, id }) => enabled && id === previousFocusId,
    );
    const nextFocusId = this.#visibleSafeFocus(
      frame,
      currentFocusEnabled ? previousFocusId : null,
    );
    this.#ui = { ...this.#ui, focusId: nextFocusId };
    if (
      this.#restorableResizeFocus?.migratedFocusId === previousFocusId
    ) {
      this.#restorableResizeFocus = {
        ...this.#restorableResizeFocus,
        migratedFocusId: nextFocusId,
      };
    }
    return this.#renderCurrentFrame();
  }

  #hasEnabledVisibleFocus(frame: FabricConsoleFrame): boolean {
    const focusId = this.#ui.focusId;
    if (focusId === null || frame.presentation.focusId !== focusId) return false;
    const region = frame.hitRegions.find(
      ({ enabled, id }) => enabled && id === focusId,
    );
    if (region === undefined) return false;
    const firstRow = frame.rows[region.rect.y1 - 1];
    return firstRow !== undefined &&
      cellSlice(firstRow, region.rect.x1 - 1, region.rect.x1) === ">";
  }

  resize(viewport: FabricViewport): FabricConsoleFrame {
    if (this.#closed) return this.#frame;
    const previousFocus = this.#ui.focusId;
    this.#viewport = viewport;
    this.#pointer = { pressed: null };
    let frame = this.#renderCurrentFrame();
    if (this.#restorableResizeFocus !== null) {
      const restorable = this.#restorableResizeFocus;
      const originalVisible = frame.hitRegions.some(
        ({ enabled, id }) => enabled && id === restorable.focusId,
      );
      if (originalVisible) {
        this.#restorableResizeFocus = null;
        if (this.#ui.focusId === restorable.migratedFocusId) {
          this.#ui = { ...this.#ui, focusId: restorable.focusId };
          frame = this.#renderCurrentFrame();
        }
      } else if (!frame.hitRegions.some(
        ({ enabled, id }) => enabled && id === this.#ui.focusId,
      )) {
        const migratedFocusId = this.#visibleSafeFocus(frame);
        this.#ui = { ...this.#ui, focusId: migratedFocusId };
        this.#restorableResizeFocus = {
          ...restorable,
          migratedFocusId,
        };
        frame = this.#renderCurrentFrame();
      }
    } else if (
      previousFocus !== null &&
      !frame.hitRegions.some(({ enabled, id }) => enabled && id === previousFocus)
    ) {
      const migratedFocusId = this.#visibleSafeFocus(frame);
      this.#ui = { ...this.#ui, focusId: migratedFocusId };
      this.#restorableResizeFocus = {
        focusId: previousFocus,
        migratedFocusId,
      };
      frame = this.#renderCurrentFrame();
    }
    this.#frame = this.#reconcileFocus(frame);
    this.#draw(this.#frame);
    this.#recordReviewCoverage(this.#frame);
    return this.#frame;
  }

  #visibleSafeFocus(
    frame: FabricConsoleFrame,
    excludedFocusId: string | null = null,
  ): string | null {
    const preferredKinds = frame.mode === "compact"
      ? this.#ui.compactPane === "master"
        ? ["row", "session", "tab", "action", "detach"] as const
        : ["pager", "action", "tab", "detach"] as const
      : ["row", "session", "pager", "tab", "action", "detach"] as const;
    for (const kind of preferredKinds) {
      const region = frame.hitRegions.find(
        (candidate) =>
          candidate.enabled &&
          candidate.id !== excludedFocusId &&
          candidate.kind === kind,
      );
      if (region !== undefined) return region.id;
    }
    return frame.hitRegions.find(
      ({ enabled, id }) => enabled && id !== excludedFocusId,
    )?.id ?? null;
  }

  updateDataset(dataset: FabricConsoleDataset): FabricConsoleFrame {
    if (this.#closed) return this.#frame;
    this.#controller.updateDataset(dataset);
    const confirmation = this.#ui.artifactConfirmation;
    const inspection = dataset.inspection;
    const retainConfirmation = confirmation !== null &&
      inspection?.kind === "artifact" &&
      inspection.state === "current" &&
      matchesArtifactConfirmation(
        confirmation,
        inspection.binding.itemId,
        inspection.result,
      );
    if (!retainConfirmation) {
      this.#ui = { ...this.#ui, artifactConfirmation: null };
    }
    this.#pointer = { pressed: null };
    return this.repaint();
  }

  setArtifactConfirmation(
    confirmation: ArtifactReviewConfirmation | null,
  ): FabricConsoleFrame {
    if (this.#closed) return this.#frame;
    this.#ui = {
      ...this.#ui,
      artifactConfirmation: confirmation,
      notice: confirmation === null
        ? null
        : `${confirmation.transformation} confirmed for ${confirmation.sourceDigest}`,
    };
    return this.repaint();
  }

  setInputMode(mode: FabricConsoleUiState["inputMode"]): FabricConsoleFrame {
    if (this.#closed) return this.#frame;
    if (this.#ui.inputMode === "browse" && mode !== "browse") {
      this.#rememberInputOpener();
    }
    this.#ui = { ...this.#ui, inputMode: mode, notice: null };
    this.#setEditorActive?.(
      mode === "editor" || mode === "palette" || mode === "guided",
    );
    return this.repaint();
  }

  beginGuidedWorkflow(draft: ConsoleGuidedWorkflowDraft): FabricConsoleFrame {
    if (this.#closed) return this.#frame;
    this.#rememberInputOpener();
    this.#pendingReviewOpener = { focusId: this.#ui.focusId };
    this.#ui = {
      ...this.#ui,
      guidedWorkflow: draft,
      inputMode: "guided",
      draft: "",
      focusId: null,
      notice: draft.prompt,
    };
    this.#setEditorActive?.(true);
    return this.repaint();
  }

  cancelGuidedWorkflow(): FabricConsoleFrame {
    if (this.#closed) return this.#frame;
    const pendingOpener = this.#pendingReviewOpener;
    this.#pendingReviewOpener = null;
    this.#inputFocusSession = null;
    this.#ui = {
      ...this.#ui,
      guidedWorkflow: null,
      inputMode: "browse",
      draft: "",
      focusId: pendingOpener?.focusId ?? this.#ui.focusId,
      notice: null,
    };
    this.#setEditorActive?.(false);
    return this.repaint();
  }

  setWorkflowReview(
    review: FabricConsoleUiState["workflowReview"],
  ): FabricConsoleFrame {
    if (this.#closed) return this.#frame;
    const echoInput =
      review?.stage === "confirm" && review.confirmationMode === "echo";
    if (review === null) this.#pendingReviewOpener = null;
    this.#ui = {
      ...this.#ui,
      workflowReview: review,
      guidedWorkflow: null,
      inputMode: echoInput ? "editor" : "browse",
      draft: echoInput ? "" : this.#ui.draft,
      reviewScrollOffset: 0,
      notice: echoInput
        ? "Enter the exact preview digest; Esc returns; then activate Confirm"
        : null,
    };
    this.#setEditorActive?.(echoInput);
    return this.repaint();
  }

  setFocus(focusId: string | null): FabricConsoleFrame {
    if (this.#closed) return this.#frame;
    this.#restorableResizeFocus = null;
    this.#ui = { ...this.#ui, focusId };
    return this.repaint();
  }

  #rememberInputOpener(): void {
    if (this.#inputFocusSession === null) {
      this.#inputFocusSession = { openerFocusId: this.#ui.focusId };
    }
  }

  handleInput(event: TerminalInputEvent): Promise<void> {
    const input = this.#captureInput(event);
    const operation = this.#inputTail.then(async () => {
      if (!this.#closed) await this.#handleInput(input);
    });
    this.#inputTail = operation.catch(() => {});
    return operation;
  }

  #captureInput(event: TerminalInputEvent): CapturedInput {
    const frame = this.#frame;
    let actionTarget: CapturedActionTarget = { kind: "none" };
    let pointerIntents: readonly CapturedPointerIntent[] = [];
    if (event.kind === "mouse" && this.#ui.mouseCapture) {
      const reduced = this.#reducePointer(
        this.#pointer,
        event,
        frame,
        this.#controller.dataset,
      );
      this.#pointer = reduced.state;
      pointerIntents = reduced.intents.map((intent) => ({
        intent,
        region: intent.regionId === null
          ? null
          : frame.hitRegions.find(({ id }) => id === intent.regionId) ?? null,
      }));
    } else if (
      this.#ui.inputMode === "browse" &&
      event.kind === "key" &&
      event.key === "text" &&
      event.text !== undefined &&
      /^[1-8]$/u.test(event.text)
    ) {
      const actionRegions = frame.hitRegions.filter(
        (region) => region.kind === "action",
      );
      const actionContext = actionRegions.some(
        ({ id }) => id === this.#ui.focusId,
      );
      actionTarget = {
        kind: "shortcut",
        actionContext,
        region: actionContext
          ? actionRegions.find(
              (region, index) =>
                (region.shortcut ?? String(index + 1)) === event.text,
            ) ?? null
          : null,
      };
    } else if (
      this.#ui.inputMode === "browse" &&
      event.kind === "key" &&
      (event.key === "enter" || event.key === "space")
    ) {
      actionTarget = {
        kind: "focused-region",
        region: frame.hitRegions.find(
          ({ id }) => id === this.#ui.focusId,
        ) ?? null,
      };
    }
    return {
      event,
      frame,
      reviewEpoch: reviewEpoch(frame),
      actionTarget,
      pointerIntents,
    };
  }

  #reviewInputIsCurrent(input: CapturedInput): boolean {
    const currentReviewEpoch = reviewEpoch(this.#frame);
    if (
      input.reviewEpoch === currentReviewEpoch &&
      input.frame === this.#frame
    ) return true;
    const reviewContext = input.reviewEpoch !== null || currentReviewEpoch !== null;
    this.#ui = {
      ...this.#ui,
      notice: reviewContext
        ? "Stale Review input ignored; use a control from the current Review stage."
        : "Stale action input ignored; use a control from the current frame.",
    };
    this.repaint();
    return false;
  }

  close(reason: FabricDetachReason): Promise<void> {
    if (this.#closePromise !== null) return this.#closePromise;
    this.#closed = true;
    this.#pointer = { pressed: null };
    this.#closePromise = this.#detach({ reason });
    return this.#closePromise;
  }

  async #handleInput(input: CapturedInput): Promise<void> {
    const { event } = input;
    this.#restorableResizeFocus = null;
    if (event.kind === "fatal") {
      await this.close("safety");
      return;
    }
    if (event.kind === "rejected") {
      const count = this.#ui.rejectedInputCount + 1;
      this.#ui = {
        ...this.#ui,
        rejectedInputCount: count,
        notice: `Input dropped (${String(count)}): ${event.reason}`.slice(0, 120),
      };
      this.repaint();
      return;
    }
    if (event.kind === "key" && event.key === "ctrl-c") {
      await this.close("safety");
      return;
    }
    if (
      event.kind === "key" &&
      event.key === "text" &&
      event.text === "q" &&
      this.#frame.mode === "inert"
    ) {
      await this.close("operator");
      return;
    }
    if (this.#ui.inputMode !== "browse" && event.kind === "mouse") {
      await this.#handleModalMouse(input);
      return;
    }
    if (this.#ui.inputMode !== "browse") {
      await this.#handleEditorInput(event);
      return;
    }
    if (event.kind === "paste") {
      return;
    }
    if (event.kind === "mouse") {
      await this.#handleMouse(input);
      return;
    }
    await this.#handleBrowseKey(input);
  }

  async #handleModalMouse(
    input: CapturedInput,
  ): Promise<void> {
    for (const { intent, region } of input.pointerIntents) {
      if (
        intent.kind === "scroll" &&
        intent.regionId === "review:scroll" &&
        this.#frame.presentation.review !== null
      ) {
        if (!this.#reviewInputIsCurrent(input)) return;
        this.#page(intent.direction ?? 1, intent.regionId);
        continue;
      }
      if (intent.kind !== "activate-region" || intent.regionId !== "detach") {
        continue;
      }
      if (region?.kind === "detach") await this.#activateRegion(region, "mouse");
    }
  }

  async #handleEditorInput(
    event: Exclude<TerminalInputEvent, { kind: "fatal" | "rejected" }>,
  ): Promise<void> {
    if (event.kind === "mouse") return;
    if (event.kind === "paste") {
      this.#appendDraft(event.text);
      return;
    }
    if (event.key === "escape") {
      if (this.#ui.inputMode === "guided") {
        this.cancelGuidedWorkflow();
        return;
      }
      this.#ui = { ...this.#ui, inputMode: "browse", notice: null };
      this.#setEditorActive?.(false);
      this.repaint();
      return;
    }
    if (event.key === "backspace") {
      this.#ui = {
        ...this.#ui,
        draft: [...this.#ui.draft].slice(0, -1).join(""),
        notice: null,
      };
      this.repaint();
      return;
    }
    if (event.key === "enter") {
      if (this.#ui.inputMode === "guided") {
        const guided = this.#ui.guidedWorkflow;
        if (guided === null) {
          this.cancelGuidedWorkflow();
          return;
        }
        try {
          await this.#activate({
            regionId: "guided:submit",
            binding: guided.binding,
            provenance: "keyboard",
            eventId: this.#eventId(),
          });
        } catch (error) {
          const failure = consoleFailureFromUnknown(error);
          this.#ui = { ...this.#ui, notice: `Workflow failed: ${failure.code}` };
        }
        this.repaint();
        return;
      }
      if (this.#ui.inputMode === "palette") {
        this.#ui = {
          ...this.#ui,
          inputMode: "browse",
          notice: null,
        };
        this.#setEditorActive?.(false);
        this.repaint();
        try {
          await this.#activate({
            regionId: "palette:submit",
            binding: null,
            provenance: "keyboard",
            eventId: this.#eventId(),
          });
        } catch (error) {
          const failure = consoleFailureFromUnknown(error);
          this.#ui = { ...this.#ui, notice: `Workflow failed: ${failure.code}` };
        }
        this.repaint();
        return;
      }
      this.#appendDraft("\n");
      return;
    }
    if (event.key === "space") {
      this.#appendDraft(" ");
      return;
    }
    if (event.key === "text" && event.text !== undefined) {
      this.#appendDraft(event.text);
    }
  }

  #appendDraft(value: string): void {
    const combined = `${this.#ui.draft}${value}`;
    const draft = boundedUtf8(combined, this.#maxDraftBytes);
    this.#ui = {
      ...this.#ui,
      draft,
      notice:
        draft === combined
          ? null
          : `Draft limited to ${String(this.#maxDraftBytes)} bytes`,
    };
    this.repaint();
  }

  async #handleBrowseKey(
    input: CapturedInput,
  ): Promise<void> {
    const event = input.event;
    if (event.kind !== "key") return;
    if (event.key === "alt-m") {
      const enabled = !this.#ui.mouseCapture;
      this.#setMouseCapture?.(enabled);
      this.#ui = { ...this.#ui, mouseCapture: enabled, notice: null };
      this.repaint();
      return;
    }
    const altView = /^alt-([1-8])$/u.exec(event.key)?.[1];
    if (altView !== undefined) {
      this.#activateView(Number(altView) - 1);
      return;
    }
    if (event.key === "text" && event.text !== undefined) {
      if (
        event.text === ":" &&
        this.#frame.presentation.review === null
      ) {
        this.#rememberInputOpener();
        this.#ui = {
          ...this.#ui,
          inputMode: "palette",
          draft: "",
          notice: "Paste one closed workflow JSON envelope; Enter reviews; Esc cancels",
        };
        this.#setEditorActive?.(true);
        this.repaint();
        return;
      }
      if (event.text === "q") {
        await this.close("operator");
        return;
      }
      if (
        event.text === "s" &&
        this.#controller.dataset.projectSessions !== undefined
      ) {
        const sessions = this.#controller.dataset.projectSessions;
        if (sessions.selectedProjectSessionId === null) {
          this.#controller.activateView("project");
          this.#ui = {
            ...this.#ui,
            focusId: sessions.choices[0] === undefined
              ? null
              : `session:select:${sessions.choices[0].projectSessionId}`,
            notice: sessions.choices.length === 0
              ? "No attachable project sessions"
              : "Choose an exact project session",
          };
          this.repaint();
          return;
        }
        try {
          await this.#activate({
            regionId: "session:switch-project",
            binding: null,
            provenance: "keyboard",
            eventId: this.#eventId(),
          });
        } catch (error: unknown) {
          const failure = consoleFailureFromUnknown(error);
          this.#ui = { ...this.#ui, notice: `Session switch failed: ${failure.code}` };
          this.repaint();
        }
        return;
      }
      if (event.text === "e") {
        this.#rememberInputOpener();
        const echoInput =
          this.#frame.presentation.review?.confirmationMode === "echo";
        this.#ui = {
          ...this.#ui,
          inputMode: "editor",
          draft: echoInput ? "" : this.#ui.draft,
          notice: echoInput
            ? "Enter the exact preview digest; Esc returns; then activate Confirm"
            : "Edit bounded draft text; Esc returns to browse",
        };
        this.#setEditorActive?.(true);
        this.repaint();
        return;
      }
      if (event.text === "[") {
        this.#controller.activateView(nextView(this.#controller.state.activeView, -1));
        this.repaint();
        return;
      }
      if (event.text === "]") {
        this.#controller.activateView(nextView(this.#controller.state.activeView, 1));
        this.repaint();
        return;
      }
      if (/^[1-8]$/u.test(event.text)) {
        const index = Number(event.text) - 1;
        const target = input.actionTarget;
        if (target.kind !== "shortcut") return;
        if (!target.actionContext) {
          this.#activateView(index);
          return;
        }
        const region = target.region;
        if (!this.#reviewInputIsCurrent(input)) return;
        if (region?.id === "review:confirm" && event.text !== "3") {
          this.#ui = {
            ...this.#ui,
            notice: "Confirm requires the explicit [3] binding from the current Confirm stage.",
          };
          this.repaint();
          return;
        }
        if (region?.enabled === true) {
          await this.#activateRegion(region, "keyboard");
        } else if (region !== null) {
          const reason = input.frame.presentation.actions.find(
            ({ id }) => id === region.id,
          )?.reason;
          this.#ui = {
            ...this.#ui,
            notice: reason === undefined
              ? "Action unavailable"
              : `Action unavailable: ${reason}`,
          };
          this.repaint();
        }
        return;
      }
      if (event.text === "?") {
        this.#ui = {
          ...this.#ui,
          notice: "Help: Alt-1..8 views; [ ] cycle; Enter open; s sessions; e draft; : workflow; PgUp/PgDn; Alt-M mouse; q detach",
        };
        this.repaint();
      }
      return;
    }
    if (event.key === "page-up" || event.key === "page-down") {
      this.#page(event.key === "page-up" ? -1 : 1);
      return;
    }
    if (event.key === "home" || event.key === "end") {
      if (this.#frame.presentation.review !== null) {
        this.#ui = {
          ...this.#ui,
          reviewScrollOffset: event.key === "home"
            ? 0
            : this.#frame.reviewCoverage?.endAnchor ?? this.#ui.reviewScrollOffset,
          notice: event.key === "home"
            ? null
            : "End previews only; locked actions require Home + PgDn in order.",
        };
        this.repaint();
        return;
      }
      const rows = this.#controller.dataset.pages[this.#controller.state.activeView].rows;
      const selected = event.key === "home" ? rows[0] : rows.at(-1);
      if (selected !== undefined) {
        this.#controller.select(selected.view, selected.stableId);
        this.#controller.setScrollAnchor(selected.view, selected.stableId);
        this.#resetDetailScroll(selected.view);
        this.repaint();
      }
      return;
    }
    if (event.key === "up" || event.key === "down") {
      if (this.#ui.focusId?.startsWith("splitter:") === true) {
        this.#moveSplitter(event.key === "up" ? -0.05 : 0.05);
        return;
      }
      this.#moveSelection(event.key === "up" ? -1 : 1);
      return;
    }
    if (event.key === "left" || event.key === "right") {
      if (this.#ui.focusId?.startsWith("splitter:") === true) {
        this.#moveSplitter(event.key === "left" ? -0.05 : 0.05);
      } else if (this.#frame.mode === "compact") {
        this.#ui = {
          ...this.#ui,
          compactPane: event.key === "left" ? "master" : "detail",
          notice: null,
        };
        this.repaint();
      }
      return;
    }
    if (event.key === "tab" || event.key === "shift-tab") {
      this.#moveFocus(event.key === "tab" ? 1 : -1);
      return;
    }
    if (event.key === "escape") {
      this.#ui = { ...this.#ui, notice: null };
      this.repaint();
      return;
    }
    if (event.key === "enter" || event.key === "space") {
      const target = input.actionTarget;
      const region = target.kind === "focused-region" ? target.region : null;
      if (
        region?.kind === "action" &&
        !this.#reviewInputIsCurrent(input)
      ) return;
      if (region?.id === "review:confirm") {
        this.#ui = {
          ...this.#ui,
          notice: "Bare Enter/Space cannot confirm; use the explicit numbered confirmation binding.",
        };
        this.repaint();
        return;
      }
      if (region?.enabled === true) await this.#activateRegion(region, "keyboard");
    }
  }

  async #handleMouse(
    input: CapturedInput,
  ): Promise<void> {
    for (const { intent, region } of input.pointerIntents) {
      const crossedReviewBoundary =
        intent.kind === "activate-region" &&
        region?.kind !== "detach" &&
        input.reviewEpoch !== reviewEpoch(this.#frame);
      if (
        (crossedReviewBoundary ||
          region?.kind === "action" ||
          intent.regionId === "review:scroll") &&
        !this.#reviewInputIsCurrent(input)
      ) return;
      if (intent.kind === "scroll") {
        this.#page(intent.direction ?? 1, intent.regionId);
        continue;
      }
      if (intent.kind === "move-splitter") {
        const ratio =
          input.frame.mode === "wide"
            ? (intent.x ?? 1) / Math.max(1, input.frame.columns)
            : (intent.y ?? 1) / Math.max(1, input.frame.rows.length);
        this.#setSplitterRatio(ratio);
        continue;
      }
      if (region !== null) await this.#activateRegion(region, "mouse");
    }
  }

  #activateView(index: number): void {
    const view = FABRIC_VIEWS[index];
    if (view === undefined) return;
    this.#controller.activateView(view);
    this.#ui = { ...this.#ui, notice: null };
    this.repaint();
  }

  #page(direction: -1 | 1, regionId: string | null = null): void {
    if (this.#frame.presentation.review !== null) {
      const coverage = this.#frame.reviewCoverage;
      this.#ui = {
        ...this.#ui,
        reviewScrollOffset: direction < 0
          ? coverage?.previousAnchor ?? 0
          : coverage?.nextAnchor ?? this.#ui.reviewScrollOffset,
        notice: null,
      };
      this.repaint();
      return;
    }
    const view = this.#controller.state.activeView;
    const detailFocused =
      regionId?.startsWith("detail:") === true ||
      this.#ui.focusId?.startsWith("detail:") === true ||
      (this.#frame.mode === "compact" && this.#ui.compactPane === "detail");
    if (detailFocused) {
      const detailRegion = this.#frame.hitRegions.find(
        (region) =>
          region.kind === "pager" &&
          (region.id === regionId ||
            region.id === this.#ui.focusId ||
            region.binding?.view === view),
      );
      const maximum = Math.max(0, detailRegion?.scrollMaximum ?? 0);
      const current = Math.min(
        maximum,
        Math.max(
          0,
          Math.trunc(this.#ui.detailScrollOffsetByView[view] ?? 0),
        ),
      );
      const offset = Math.min(maximum, Math.max(0, current + direction * 5));
      this.#ui = {
        ...this.#ui,
        detailScrollOffsetByView: {
          ...this.#ui.detailScrollOffsetByView,
          [view]: offset,
        },
        notice: null,
      };
      this.repaint();
      return;
    }
    const current = Math.max(0, Math.trunc(this.#ui.scrollOffsetByView[view] ?? 0));
    const selectorCount =
      view === "project" &&
      this.#controller.dataset.projectSessions?.selectedProjectSessionId === null
        ? this.#controller.dataset.projectSessions.choices.length
        : 0;
    const maximum = Math.max(
      0,
      selectorCount + this.#controller.dataset.pages[view].rows.length - 1,
    );
    const offset = Math.min(maximum, Math.max(0, current + direction * 5));
    this.#ui = {
      ...this.#ui,
      scrollOffsetByView: { ...this.#ui.scrollOffsetByView, [view]: offset },
      notice: null,
    };
    const anchor = this.#controller.dataset.pages[view].rows[
      Math.max(0, offset - selectorCount)
    ]?.stableId ?? null;
    this.#controller.setScrollAnchor(view, anchor);
    this.repaint();
  }

  #moveSelection(direction: -1 | 1): void {
    const view = this.#controller.state.activeView;
    const rows = this.#controller.dataset.pages[view].rows;
    if (rows.length === 0) return;
    const selected = this.#controller.state.selectionByView[view]?.stableId;
    const current = rows.findIndex((row) => row.stableId === selected);
    const target = Math.min(
      rows.length - 1,
      Math.max(0, (current < 0 ? 0 : current) + direction),
    );
    const row = rows[target];
    if (row === undefined) return;
    this.#controller.select(view, row.stableId);
    this.#controller.setScrollAnchor(view, row.stableId);
    this.#resetDetailScroll(view);
    this.#ui = { ...this.#ui, focusId: `row:${view}:${row.stableId}`, notice: null };
    this.repaint();
  }

  #resetDetailScroll(view: FabricView): void {
    this.#ui = {
      ...this.#ui,
      detailScrollOffsetByView: {
        ...this.#ui.detailScrollOffsetByView,
        [view]: 0,
      },
    };
  }

  #moveFocus(direction: -1 | 1): void {
    const regions = this.#frame.hitRegions.filter(
      (region) => region.enabled,
    );
    if (regions.length === 0) return;
    const current = regions.findIndex((region) => region.id === this.#ui.focusId);
    const start = current < 0 ? (direction === 1 ? -1 : 0) : current;
    const target = (start + direction + regions.length) % regions.length;
    this.#ui = { ...this.#ui, focusId: regions[target]?.id ?? null, notice: null };
    this.repaint();
  }

  #moveSplitter(delta: number): void {
    this.#setSplitterRatio(this.#ui.splitterRatio + delta);
  }

  #setSplitterRatio(value: number): void {
    this.#ui = {
      ...this.#ui,
      splitterRatio: Math.min(0.75, Math.max(0.25, value)),
      notice: null,
    };
    this.repaint();
  }

  async #activateRegion(
    region: FabricHitRegion,
    provenance: "keyboard" | "mouse",
  ): Promise<void> {
    if (!region.enabled || region.geometryKey !== this.#frame.geometryKey) return;
    this.#ui = { ...this.#ui, focusId: region.id, notice: null };
    if (region.kind === "tab") {
      const view = region.id.slice("view:".length) as FabricView;
      if (FABRIC_VIEWS.includes(view)) this.#controller.activateView(view);
      this.repaint();
      return;
    }
    if (region.kind === "row" && region.binding !== null) {
      this.#controller.select(region.binding.view, region.binding.itemId);
      this.#controller.setScrollAnchor(region.binding.view, region.binding.itemId);
      this.#resetDetailScroll(region.binding.view);
      if (this.#frame.mode === "compact") {
        this.#ui = { ...this.#ui, compactPane: "detail" };
      }
      this.repaint();
      try {
        await this.#activate({
          regionId: region.id,
          binding: region.binding,
          provenance,
          eventId: this.#eventId(),
        });
      } catch (error) {
        const failure = consoleFailureFromUnknown(error);
        this.#ui = { ...this.#ui, notice: `Read failed: ${failure.code}` };
      }
      const detailId = `detail:${region.binding.view}:${region.binding.itemId}`;
      if (
        this.#frame.hitRegions.some(
          (candidate) => candidate.kind === "pager" && candidate.id === detailId,
        )
      ) {
        this.#ui = { ...this.#ui, focusId: detailId };
      }
      this.repaint();
      return;
    }
    if (region.kind === "detach") {
      await this.close("operator");
      return;
    }
    if (region.kind === "pager") {
      this.repaint();
      return;
    }
    if (region.kind === "splitter") return;
    if (region.kind === "input") return;
    try {
      await this.#activate({
        regionId: region.id,
        binding: region.binding,
        provenance,
        eventId: this.#eventId(),
      });
    } catch (error) {
      const failure = consoleFailureFromUnknown(error);
      this.#ui = { ...this.#ui, notice: `Action failed: ${failure.code}` };
    }
    this.repaint();
  }
}

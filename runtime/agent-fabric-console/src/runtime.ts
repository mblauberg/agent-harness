import type { TerminalInputEvent } from "./input.js";
import {
  consoleFailureFromUnknown,
  type ConsoleControllerState,
} from "./controller.js";
import type {
  FabricConsoleFrame,
  FabricHitBinding,
  FabricHitRegion,
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
    this.#frame = this.#render(
      this.#controller.dataset,
      this.#controller.state,
      this.#ui,
      this.#viewport,
    );
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
    this.#frame = this.#render(
      this.#controller.dataset,
      this.#controller.state,
      this.#ui,
      this.#viewport,
    );
    if (!this.#closed) this.#draw(this.#frame);
    return this.#frame;
  }

  resize(viewport: FabricViewport): FabricConsoleFrame {
    if (this.#closed) return this.#frame;
    this.#viewport = viewport;
    this.#pointer = { pressed: null };
    return this.repaint();
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
    this.#ui = { ...this.#ui, inputMode: mode, notice: null };
    this.#setEditorActive?.(
      mode === "editor" || mode === "palette" || mode === "guided",
    );
    return this.repaint();
  }

  beginGuidedWorkflow(draft: ConsoleGuidedWorkflowDraft): FabricConsoleFrame {
    if (this.#closed) return this.#frame;
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
    this.#ui = {
      ...this.#ui,
      guidedWorkflow: null,
      inputMode: "browse",
      draft: "",
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
    this.#ui = {
      ...this.#ui,
      workflowReview: review,
      guidedWorkflow: null,
      inputMode: echoInput ? "editor" : "browse",
      draft: echoInput ? "" : this.#ui.draft,
      focusId:
        review === null
          ? null
          : review.stage === "review"
            ? "review:continue"
            : review.stage === "confirm"
              ? "review:confirm"
              : "review:close",
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
    this.#ui = { ...this.#ui, focusId };
    return this.repaint();
  }

  handleInput(event: TerminalInputEvent): Promise<void> {
    const operation = this.#inputTail.then(async () => {
      if (!this.#closed) await this.#handleInput(event);
    });
    this.#inputTail = operation.catch(() => {});
    return operation;
  }

  close(reason: FabricDetachReason): Promise<void> {
    if (this.#closePromise !== null) return this.#closePromise;
    this.#closed = true;
    this.#pointer = { pressed: null };
    this.#closePromise = this.#detach({ reason });
    return this.#closePromise;
  }

  async #handleInput(event: TerminalInputEvent): Promise<void> {
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
    if (this.#ui.inputMode !== "browse") {
      await this.#handleEditorInput(event);
      return;
    }
    if (event.kind === "paste") {
      return;
    }
    if (event.kind === "mouse") {
      await this.#handleMouse(event);
      return;
    }
    await this.#handleBrowseKey(event);
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
    event: Extract<TerminalInputEvent, { kind: "key" }>,
  ): Promise<void> {
    if (event.key === "ctrl-c") {
      await this.close("safety");
      return;
    }
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
      if (event.text === "e") {
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
        const actionRegions = this.#frame.hitRegions.filter(
          (region) => region.kind === "action",
        );
        const actionContext = actionRegions.some(
          ({ id }) => id === this.#ui.focusId,
        );
        const index = Number(event.text) - 1;
        if (!actionContext) {
          this.#activateView(index);
          return;
        }
        const region = actionRegions[index];
        if (region?.enabled === true) {
          await this.#activateRegion(region, "keyboard");
        } else if (region !== undefined) {
          const reason = this.#frame.presentation.actions.find(
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
          notice: "Help: Alt-1..8 views; [ ] cycle; e draft; : advanced workflow; PgUp/PgDn; Alt-M mouse; q detach",
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
          reviewScrollOffset: event.key === "home" ? 0 : 10_000,
          notice: null,
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
      if (event.key === "enter" && this.#ui.focusId === "review:confirm") {
        this.#ui = {
          ...this.#ui,
          notice: "Bare Enter cannot confirm; use the explicit confirmation binding.",
        };
        this.repaint();
        return;
      }
      const region = this.#frame.hitRegions.find(
        (candidate) => candidate.id === this.#ui.focusId && candidate.enabled,
      );
      if (region !== undefined) await this.#activateRegion(region, "keyboard");
    }
  }

  async #handleMouse(
    event: Extract<TerminalInputEvent, { kind: "mouse" }>,
  ): Promise<void> {
    if (!this.#ui.mouseCapture) return;
    const reduced = this.#reducePointer(
      this.#pointer,
      event,
      this.#frame,
      this.#controller.dataset,
    );
    this.#pointer = reduced.state;
    for (const intent of reduced.intents) {
      if (intent.kind === "scroll") {
        this.#page(intent.direction ?? 1, intent.regionId);
        continue;
      }
      if (intent.kind === "move-splitter") {
        const ratio =
          this.#frame.mode === "wide"
            ? (intent.x ?? 1) / Math.max(1, this.#frame.columns)
            : (intent.y ?? 1) / Math.max(1, this.#frame.rows.length);
        this.#setSplitterRatio(ratio);
        continue;
      }
      const region =
        intent.regionId === null
          ? undefined
          : this.#frame.hitRegions.find(
              (candidate) => candidate.id === intent.regionId,
            );
      if (region !== undefined) await this.#activateRegion(region, "mouse");
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
      this.#ui = {
        ...this.#ui,
        reviewScrollOffset: Math.min(
          10_000,
          Math.max(0, this.#ui.reviewScrollOffset + direction * 5),
        ),
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
    const maximum = Math.max(0, this.#controller.dataset.pages[view].rows.length - 1);
    const offset = Math.min(maximum, Math.max(0, current + direction * 5));
    this.#ui = {
      ...this.#ui,
      scrollOffsetByView: { ...this.#ui.scrollOffsetByView, [view]: offset },
      notice: null,
    };
    const anchor = this.#controller.dataset.pages[view].rows[offset]?.stableId ?? null;
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
      (region) => region.enabled && region.kind !== "splitter",
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

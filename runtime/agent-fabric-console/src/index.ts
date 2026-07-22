import type { TerminalInputEvent } from "./input.js";
import type { ConsoleControllerState } from "./controller.js";
import {
  cellWidth,
  chromeText,
  fabricDimensions,
  fitCells,
  renderedDraftInput,
  writeFixedCells,
  type FabricViewport,
  type Rect,
} from "./layout.js";
import { FABRIC_BROWSE_HELP, fabricActionShortcut } from "./keymap.js";
import {
  presentFabricConsole,
  responsiveModeFor,
  type FabricConsolePresentation,
  type FabricConsoleUiState,
  type PresentedAction,
  type PresentedRow,
} from "./presenter.js";
import type { FabricConsoleDataset } from "./protocol-adapter.js";
import { compactAttentionRowText, filteredDeckLabel, renderFabricAttentionDeck, renderFabricDeckRoster, stripHeaderLines } from "./attention-deck.js";
import {
  FABRIC_COMPACT_ACTION_LABELS,
} from "./theme.js";
import { renderFabricDetail } from "./renderer-detail.js";
import {
  renderFabricHeader,
  renderFabricMaster,
  renderFabricTabs,
} from "./renderer-main.js";
import {
  fabricGeometryKey,
  presentedBinding,
  reviewBinding,
  rowText,
  setFabricRow,
  type FabricConsoleFrame,
  type FabricHitBinding,
  type FabricHitRegion,
  type FabricReviewCoverageObservation,
} from "./renderer-primitives.js";
import {
  renderFabricReview,
  reviewProgressLabel,
} from "./renderer-review.js";

export * from "./input.js";
export * from "./application.js";
export * from "./controller.js";
export * from "./evaluation.js";
export * from "./message.js";
export * from "./model.js";
export {
  cellWidth,
  clipCells,
  graphemes,
  MAX_FRAME_CELLS,
  sanitizeDisplayText,
  UNICODE_POLICY,
  writeFixedCells,
} from "./layout.js";
export type { Rect } from "./layout.js";
export * from "./presenter.js";
export * from "./protocol-adapter.js";
export * from "./runtime.js";
export * from "./snapshot.js";
export * from "./terminal.js";
export * from "./workflow.js";
export * from "./typed-entry-planner.js";
export type {
  FabricConsoleFrame,
  FabricHitBinding,
  FabricHitRegion,
  FabricReviewCoverageObservation,
} from "./renderer-primitives.js";

function actionBindingFor(
  action: PresentedAction,
  presentation: FabricConsolePresentation,
  dataset: FabricConsoleDataset,
): FabricHitBinding | null {
  if (action.id === "review:cancel" || action.id === "review:close") {
    return null;
  }
  const review = reviewBinding(presentation);
  if (review !== null) return review;
  const selected = presentation.masterRows.find((row) => row.selected);
  return selected === undefined ? null : presentedBinding(dataset, selected);
}

function renderFabricActions(
  rows: string[],
  columns: number,
  row: number,
  presentation: FabricConsolePresentation,
  dataset: FabricConsoleDataset,
  geometryKey: string,
  hitRegions: FabricHitRegion[],
  actionVisible: (action: PresentedAction) => boolean = () => true,
): void {
  const actions = presentation.actions.filter(actionVisible);
  if (actions.length === 0) {
    setFabricRow(
      rows,
      row,
      columns,
      presentation.actions.length > 0
        ? "Actions unavailable in this geometry"
        : presentation.connection === "LIVE"
        ? "Actions: select an actionable item"
        : `Actions disabled: ${presentation.connection}`,
    );
    return;
  }
  const actionLabel = (action: PresentedAction, index: number, compact: boolean): string => {
    const marker = presentation.focusId === action.id ? ">" : "";
    const text = compact
      ? FABRIC_COMPACT_ACTION_LABELS[action.id] ?? action.label
      : action.label;
    return `${marker}[${fabricActionShortcut(action.id, index)} ${action.enabled ? "" : "×"}${text}]`;
  };
  const fullWidth = actions.reduce(
    (width, action, index) =>
      width + (index === 0 ? 0 : 1) + cellWidth(actionLabel(action, index, false)),
    0,
  );
  const compact = fullWidth > columns;
  let line = "";
  let x = 1;
  for (const [index, action] of actions.entries()) {
    const label = actionLabel(action, index, compact);
    const gap = x === 1 ? "" : " ";
    const width = cellWidth(label);
    const x1 = x + cellWidth(gap);
    if (x1 + width - 1 > columns) break;
    line += `${gap}${label}`;
    hitRegions.push({
      id: action.id,
      kind: "action",
      rect: { x1, y1: row, x2: x1 + width - 1, y2: row },
      enabled: action.enabled,
      geometryKey,
      binding: actionBindingFor(action, presentation, dataset),
      shortcut: fabricActionShortcut(action.id, index),
    });
    x = x1 + width;
  }
  setFabricRow(rows, row, columns, line);
}

function renderFabricDetachRow(
  rows: string[],
  columns: number,
  row: number,
  prefix: string,
  presentation: FabricConsolePresentation,
  geometryKey: string,
  hitRegions: FabricHitRegion[],
): void {
  if (columns < 8 || row < 1 || row > rows.length) {
    setFabricRow(rows, row, columns, prefix);
    return;
  }
  const label = presentation.inputMode === "browse"
    ? presentation.focusId === "detach" ? ">Detach" : columns === 30 ? "[q]Detach" : "q detach"
    : presentation.focusId === "detach" ? ">Detach " : "[Detach]";
  const labelWidth = cellWidth(label);
  const prefixWidth = Math.max(0, columns - labelWidth - 1);
  const inputId = `input:${presentation.inputMode}`;
  const value = prefixWidth === 0
    ? label
    : `${
        presentation.inputMode === "browse"
          ? fitCells(chromeText(prefix), prefixWidth)
          : renderedDraftInput(presentation, inputId, prefixWidth)
      } ${label}`;
  setFabricRow(rows, row, columns, value);
  if (presentation.inputMode !== "browse" && prefixWidth > 0) {
    hitRegions.push({
      id: inputId,
      kind: "input",
      rect: { x1: 1, y1: row, x2: prefixWidth, y2: row },
      enabled: true,
      geometryKey,
      binding: null,
    });
  }
  hitRegions.push({
    id: "detach",
    kind: "detach",
    rect: { x1: columns - labelWidth + 1, y1: row, x2: columns, y2: row },
    enabled: true,
    geometryKey,
    binding: null,
  });
}
function renderFabricFooter(
  rows: string[],
  columns: number,
  presentation: FabricConsolePresentation,
  dataset: FabricConsoleDataset,
  geometryKey: string,
  hitRegions: FabricHitRegion[],
): void {
  const statusRow = rows.length - 1;
  const helpRow = rows.length;
  const inputModal = presentation.inputMode !== "browse";
  setFabricRow(
    rows,
    statusRow,
    columns,
    presentation.notice ??
      (presentation.inputMode === "palette"
        ? `WORKFLOW JSON: ${String(Buffer.byteLength(presentation.draft))} bytes | Enter opens Review | Esc cancels | Ctrl-C safety`
        : presentation.inputMode === "guided"
          ? `GUIDED FORM: ${String(Buffer.byteLength(presentation.draft))} bytes | Enter opens Review | Esc cancels | Ctrl-C safety`
        : presentation.inputMode === "editor"
          ? `DRAFT: ${String(Buffer.byteLength(presentation.draft))} bytes | Esc returns to browse | Ctrl-C safety`
          : (presentation.failureCode === null
            ? `V:${presentation.activeView} F:${presentation.focusId ?? "browse"} ${presentation.connection} r${dataset.snapshotRevision ?? "?"} MOUSE:${presentation.mouseCapture ? "ON" : "OFF"} DROP:${String(presentation.rejectedInputCount)}${presentation.review === null ? "" : ` REVIEW+${String(presentation.reviewScrollOffset)}`}`
            : `Action failed: ${presentation.failureCode}`)),
  );
  renderFabricDetachRow(
    rows,
    columns,
    helpRow,
    inputModal
      ? presentation.inputMode === "editor"
        ? "Esc browse | Ctrl-C safety detach"
        : "Esc cancel | Ctrl-C safety detach"
      : FABRIC_BROWSE_HELP,
    presentation,
    geometryKey,
    hitRegions,
  );
}

function renderFabricStrip(
  rows: string[],
  columns: number,
  presentation: FabricConsolePresentation,
  dataset: FabricConsoleDataset,
  ui: FabricConsoleUiState,
  geometryKey: string,
  hitRegions: FabricHitRegion[],
): FabricReviewCoverageObservation | null {
  const header = presentation.header;
  const inputModal = presentation.inputMode !== "browse";
  const footerRow = rows.length;
  const bodyEnd = Math.max(0, footerRow - 1);
  const footerPrefix = inputModal
    ? presentation.inputMode === "editor"
      ? "Esc browse | Ctrl-C safety"
      : "Esc cancel | Ctrl-C safety"
    : "[enter]open";

  if (presentation.review !== null && bodyEnd >= 1) {
    const actionRow = !inputModal && bodyEnd >= 2 ? bodyEnd : null;
    const reviewEnd = actionRow === null ? bodyEnd : actionRow - 1;
    const reviewState = renderFabricReview(
      rows,
      columns,
      presentation,
      { x1: 1, y1: 1, x2: columns, y2: Math.max(1, reviewEnd) },
      geometryKey,
      hitRegions,
      !inputModal,
    );
    if (actionRow !== null) {
      renderFabricActions(
        rows,
        columns,
        actionRow,
        presentation,
        dataset,
        geometryKey,
        hitRegions,
        (action) =>
          (action.id !== "review:continue" && action.id !== "review:confirm") ||
          reviewState.contextVisible,
      );
    }
    renderFabricDetachRow(
      rows,
      columns,
      footerRow,
      inputModal
        ? footerPrefix
        : presentation.notice ?? reviewProgressLabel(reviewState.coverage, true),
      presentation,
      geometryKey,
      hitRegions,
    );
    return reviewState.coverage;
  }

  const actionRow = !inputModal && presentation.actions.length > 0 && bodyEnd >= 2
    ? bodyEnd
    : null;
  const contentEnd = actionRow === null ? bodyEnd : actionRow - 1;
  const selected = presentation.masterRows.find((row) => row.selected);
  const primaryRows = presentation.activeView === "attention"
    ? presentation.needsYouRows
    : presentation.masterRows;
  const work = selected?.view !== "attention" || selected === undefined ||
      presentation.needsYouRows.some(({ stableId }) => stableId === selected.stableId)
    ? selected ?? presentation.topAttention ?? primaryRows[0]
    : presentation.topAttention ?? primaryRows[0];
  const topAttention = presentation.topAttention?.stableId === work?.stableId
    ? null
    : presentation.topAttention;
  const fullHeader = stripHeaderLines(header);
  let nextRow = 1;
  const renderWork = (item: PresentedRow): void => {
    if (nextRow > contentEnd) return;
    const id = `row:${item.view}:${item.stableId}`;
    setFabricRow(
      rows,
      nextRow,
      columns,
      presentation.activeView === "attention" && columns === 30 ? compactAttentionRowText(item, presentation.focusId === id, ui.pinnedRowIds) : rowText(item, presentation.focusId === id, ui.pinnedRowIds.includes(id)),
    );
    if (!inputModal) {
      hitRegions.push({
        id,
        kind: "row",
        rect: { x1: 1, y1: nextRow, x2: columns, y2: nextRow },
        enabled: true,
        geometryKey,
        binding: presentedBinding(dataset, item),
      });
    }
    nextRow += 1;
  };

  if (presentation.activeView === "attention") {
    if (contentEnd >= 12) {
      for (const value of fullHeader) {
        if (nextRow > contentEnd) break;
        setFabricRow(rows, nextRow, columns, value);
        nextRow += 1;
      }
    } else {
      setFabricRow(
        rows,
        nextRow,
        columns,
        presentation.deckFilterActive
          ? filteredDeckLabel(presentation, true)
          : `${header.project} NEEDS ${String(header.needsYouCount)} RUNS ${String(header.runCount)} ${header.needsYouCount > 0 ? "!" : header.freshness === "live" ? "" : "?"}`,
      );
      nextRow += 1;
    }
    if (work !== undefined) renderWork(work);
    if (nextRow <= contentEnd) {
      renderFabricDeckRoster({
        rows,
        columns,
        presentation,
        dataset,
        ui,
        geometryKey,
        hitRegions,
        bounds: { x1: 1, y1: nextRow, x2: columns, y2: contentEnd },
      });
    }
    if (actionRow !== null) {
      renderFabricActions(
        rows,
        columns,
        actionRow,
        presentation,
        dataset,
        geometryKey,
        hitRegions,
      );
    }
    renderFabricDetachRow(
      rows,
      columns,
      footerRow,
      footerPrefix,
      presentation,
      geometryKey,
      hitRegions,
    );
    return null;
  }

  if (contentEnd >= 12) {
    for (const value of fullHeader) {
      if (nextRow > contentEnd) break;
      setFabricRow(rows, nextRow, columns, value);
      nextRow += 1;
    }
    if (work !== undefined) renderWork(work);
  } else {
    setFabricRow(
      rows,
      nextRow,
      columns,
      `P:${header.project} S:${header.session} R:${header.run} r${header.revision ?? "?"} ${header.freshness.toUpperCase()} N:${String(header.needsYouCount)} W:${String(header.watchCount)}`,
    );
    nextRow += 1;
    if (work !== undefined) renderWork(work);
    for (const value of fullHeader.slice(1)) {
      if (nextRow > contentEnd) break;
      setFabricRow(rows, nextRow, columns, value);
      nextRow += 1;
    }
  }
  if (topAttention !== null && topAttention !== undefined) {
    renderWork(topAttention);
  }
  for (const detail of presentation.detail?.lines ?? []) {
    if (nextRow > contentEnd) break;
    setFabricRow(rows, nextRow, columns, `${detail.label}:${detail.value}`);
    nextRow += 1;
  }
  for (const item of primaryRows) {
    if (
      nextRow > contentEnd ||
      item.stableId === work?.stableId ||
      item.stableId === topAttention?.stableId
    ) {
      continue;
    }
    renderWork(item);
  }
  if (nextRow <= contentEnd) {
    setFabricRow(
      rows,
      nextRow,
      columns,
      presentation.notice ??
        (inputModal
          ? `${presentation.inputMode.toUpperCase()}:${String(Buffer.byteLength(
              presentation.draft,
            ))}B | Esc | Ctrl-C`
          : `View:${presentation.activeView} | ${presentation.connection}`),
    );
  }
  if (actionRow !== null) {
    renderFabricActions(
      rows,
      columns,
      actionRow,
      presentation,
      dataset,
      geometryKey,
      hitRegions,
    );
  }
  renderFabricDetachRow(
    rows,
    columns,
    footerRow,
    footerPrefix,
    presentation,
    geometryKey,
    hitRegions,
  );
  return null;
}

export function renderFabricConsoleFrame(
  dataset: FabricConsoleDataset,
  controller: ConsoleControllerState,
  ui: FabricConsoleUiState,
  viewport: FabricViewport,
): FabricConsoleFrame {
  const dimensions = fabricDimensions(viewport);
  const normalizedViewport = {
    columns: dimensions.columns,
    rows: dimensions.rows,
  };
  const presentation = presentFabricConsole(
    dataset,
    controller,
    ui,
    normalizedViewport,
  );
  const mode = responsiveModeFor(normalizedViewport);
  const rows = Array.from({ length: dimensions.rows }, () =>
    fitCells("", dimensions.columns),
  );
  const geometryKey = fabricGeometryKey(
    dimensions.columns,
    dimensions.rows,
    dataset,
    controller,
  );
  const hitRegions: FabricHitRegion[] = [];
  if (mode === "inert") {
    if (rows.length > 0) {
      const showsDetach = dimensions.columns >= 8;
      setFabricRow(
        rows,
        1,
        dimensions.columns,
        showsDetach ? "q detach" : "",
      );
      if (showsDetach) {
        hitRegions.push({
          id: "detach",
          kind: "detach",
          rect: { x1: 1, y1: 1, x2: 8, y2: 1 },
          enabled: false,
          geometryKey,
          binding: null,
        });
      }
    }
    return {
      columns: dimensions.columns,
      rows,
      mode,
      geometryKey,
      hitRegions,
      presentation,
    };
  }
  if (mode === "strip") {
    const reviewCoverage = renderFabricStrip(
      rows,
      dimensions.columns,
      presentation,
      dataset,
      ui,
      geometryKey,
      hitRegions,
    );
    return {
      columns: dimensions.columns,
      rows,
      mode,
      geometryKey,
      hitRegions,
      presentation,
      reviewCoverage,
    };
  }

  const inputModal = presentation.inputMode !== "browse";
  const contentHitRegions = inputModal ? [] : hitRegions;
  renderFabricHeader(rows, dimensions.columns, presentation);
  if (presentation.review !== null) {
    setFabricRow(
      rows,
      4,
      dimensions.columns,
      inputModal
        ? "REVIEW INPUT MODAL | Esc returns | Ctrl-C safety | Detach local"
        : "REVIEW MODAL | PgUp/PgDn or wheel scroll | Detach local",
    );
  } else if (inputModal) {
    setFabricRow(
      rows,
      4,
      dimensions.columns,
      presentation.inputMode === "editor"
        ? "EDITOR INPUT MODAL | Esc returns | Ctrl-C safety | Detach local"
        : `${presentation.inputMode.toUpperCase()} INPUT MODAL | Esc cancels | Ctrl-C safety | Detach local`,
    );
  } else {
    renderFabricTabs(
      rows,
      dimensions.columns,
      presentation,
      geometryKey,
      hitRegions,
    );
  }
  const actionRow = dimensions.rows - 2;
  const body: Rect = {
    x1: 1,
    y1: 5,
    x2: dimensions.columns,
    y2: Math.max(5, actionRow - 1),
  };
  let reviewContextVisible = true;
  let reviewCoverage: FabricReviewCoverageObservation | null = null;
  if (presentation.review !== null) {
    const reviewState = renderFabricReview(
      rows,
      dimensions.columns,
      presentation,
      body,
      geometryKey,
      hitRegions,
      !inputModal,
    );
    reviewContextVisible = reviewState.contextVisible;
    reviewCoverage = reviewState.coverage;
    if (!inputModal) {
      setFabricRow(
        rows,
        4,
        dimensions.columns,
        reviewProgressLabel(reviewState.coverage),
      );
    }
  } else if (presentation.activeView === "attention") {
    renderFabricAttentionDeck({
      rows,
      columns: dimensions.columns,
      presentation,
      dataset,
      ui,
      geometryKey,
      hitRegions: contentHitRegions,
      bounds: body,
    });
  } else if (mode === "wide") {
    const masterWidth = Math.min(
      dimensions.columns - 32,
      Math.max(32, Math.round(dimensions.columns * ui.splitterRatio)),
    );
    const master = { ...body, x2: masterWidth };
    const detail = { ...body, x1: masterWidth + 2 };
    const splitterFocused = presentation.focusId === "splitter:master-detail";
    renderFabricMaster(
      rows,
      dimensions.columns,
      presentation,
      dataset,
      ui,
      geometryKey,
      contentHitRegions,
      master,
    );
    for (let y = body.y1; y <= body.y2; y += 1) {
      rows[y - 1] = writeFixedCells(
        rows[y - 1] ?? " ".repeat(dimensions.columns),
        masterWidth + 1,
        1,
        splitterFocused && y === body.y1 ? ">" : "|",
      );
    }
    if (!inputModal) {
      hitRegions.push({
        id: "splitter:master-detail",
        kind: "splitter",
        rect: { x1: masterWidth + 1, y1: body.y1, x2: masterWidth + 1, y2: body.y2 },
        enabled: true,
        geometryKey,
        binding: null,
      });
    }
    renderFabricDetail(
      rows,
      dimensions.columns,
      presentation,
      dataset,
      ui,
      geometryKey,
      contentHitRegions,
      detail,
    );
  } else if (mode === "reference") {
    const splitRow = Math.min(
      body.y2 - 2,
      Math.max(
        body.y1 + 2,
        Math.round(body.y1 + (body.y2 - body.y1) * ui.splitterRatio),
      ),
    );
    renderFabricMaster(
      rows,
      dimensions.columns,
      presentation,
      dataset,
      ui,
      geometryKey,
      contentHitRegions,
      { ...body, y2: splitRow - 1 },
    );
    setFabricRow(
      rows,
      splitRow,
      dimensions.columns,
      presentation.focusId === "splitter:master-detail"
        ? ">=== DETAIL ===="
        : "==== DETAIL ====",
    );
    if (!inputModal) {
      hitRegions.push({
        id: "splitter:master-detail",
        kind: "splitter",
        rect: { x1: 1, y1: splitRow, x2: dimensions.columns, y2: splitRow },
        enabled: true,
        geometryKey,
        binding: null,
      });
    }
    renderFabricDetail(
      rows,
      dimensions.columns,
      presentation,
      dataset,
      ui,
      geometryKey,
      contentHitRegions,
      { ...body, y1: splitRow + 1 },
    );
  } else if (presentation.compactPane === "master") {
    renderFabricMaster(
      rows,
      dimensions.columns,
      presentation,
      dataset,
      ui,
      geometryKey,
      contentHitRegions,
      body,
    );
  } else {
    renderFabricDetail(
      rows,
      dimensions.columns,
      presentation,
      dataset,
      ui,
      geometryKey,
      contentHitRegions,
      body,
    );
  }
  if (inputModal) {
    setFabricRow(
      rows,
      actionRow,
      dimensions.columns,
      presentation.inputMode === "editor"
        ? "Draft input owns keys | Esc returns | Ctrl-C detaches safely"
        : presentation.inputMode === "filter"
          ? "Filter input owns keys | Enter applies view | Esc cancels | Ctrl-C detaches safely"
        : "Form input owns keys | Enter reviews | Esc cancels | Ctrl-C detaches safely",
    );
  } else {
    renderFabricActions(
      rows,
      dimensions.columns,
      actionRow,
      presentation,
      dataset,
      geometryKey,
      hitRegions,
      (action) =>
        (action.id !== "review:continue" && action.id !== "review:confirm") ||
        reviewContextVisible,
    );
  }
  renderFabricFooter(
    rows,
    dimensions.columns,
    presentation,
    dataset,
    geometryKey,
    hitRegions,
  );
  return {
    columns: dimensions.columns,
    rows,
    mode,
    geometryKey,
    hitRegions,
    presentation,
    reviewCoverage,
  };
}

export type FabricPointerState = Readonly<{
  pressed: Readonly<{
    regionId: string;
    geometryKey: string;
  }> | null;
}>;

export type FabricPointerIntent = Readonly<{
  kind: "activate-region" | "scroll" | "move-splitter";
  regionId: string | null;
  binding: FabricHitBinding | null;
  direction?: -1 | 1;
  x?: number;
  y?: number;
  provenance: "mouse";
}>;

export type FabricPointerReduction = Readonly<{
  state: FabricPointerState;
  intents: readonly FabricPointerIntent[];
}>;

function fabricRegionAt(
  frame: FabricConsoleFrame,
  x: number,
  y: number,
): FabricHitRegion | null {
  return (
    frame.hitRegions.find(
      (region) =>
        region.enabled &&
        x >= region.rect.x1 &&
        x <= region.rect.x2 &&
        y >= region.rect.y1 &&
        y <= region.rect.y2,
    ) ?? null
  );
}

function fabricBindingCurrent(
  binding: FabricHitBinding | null,
  dataset: FabricConsoleDataset,
): boolean {
  if (binding === null) return true;
  if (dataset.snapshotRevision !== binding.projectionRevision) return false;
  const row = dataset.pages[binding.view].rows.find(
    (candidate) => candidate.stableId === binding.itemId,
  );
  return row?.revision === binding.itemRevision;
}

export function reduceFabricPointer(
  state: FabricPointerState,
  event: Extract<TerminalInputEvent, { kind: "mouse" }>,
  frame: FabricConsoleFrame,
  dataset: FabricConsoleDataset,
): FabricPointerReduction {
  if (event.button === "left" && event.modifiers.shift) {
    return { state: { pressed: null }, intents: [] };
  }
  const region = fabricRegionAt(frame, event.x, event.y);
  if (event.phase === "wheel") {
    return {
      state,
      intents: [
        {
          kind: "scroll",
          regionId: region?.id ?? null,
          binding: region?.binding ?? null,
          direction: event.button === "wheel-up" ? -1 : 1,
          provenance: "mouse",
        },
      ],
    };
  }
  if (event.button !== "left") return { state, intents: [] };
  if (event.phase === "press") {
    return {
      state: {
        pressed:
          region === null
            ? null
            : { regionId: region.id, geometryKey: frame.geometryKey },
      },
      intents: [],
    };
  }
  if (event.phase === "drag" && state.pressed !== null) {
    const pressedRegion = frame.hitRegions.find(
      (candidate) => candidate.id === state.pressed?.regionId,
    );
    const move =
      pressedRegion?.kind === "splitter" &&
      state.pressed.geometryKey === frame.geometryKey;
    return {
      state,
      intents: move
        ? [
            {
              kind: "move-splitter",
              regionId: pressedRegion.id,
              binding: null,
              x: event.x,
              y: event.y,
              provenance: "mouse",
            },
          ]
        : [],
    };
  }
  if (event.phase === "release") {
    const activate =
      region !== null &&
      region.kind !== "splitter" &&
      region.kind !== "input" &&
      state.pressed?.regionId === region.id &&
      state.pressed.geometryKey === frame.geometryKey &&
      region.geometryKey === frame.geometryKey &&
      fabricBindingCurrent(region.binding, dataset);
    return {
      state: { pressed: null },
      intents: activate
        ? [
            {
              kind: "activate-region",
              regionId: region.id,
              binding: region.binding,
              provenance: "mouse",
            },
          ]
        : [],
    };
  }
  return { state, intents: [] };
}

import type { FabricConsoleUiState } from "./presenter.js";
import type { ConsoleControllerState } from "./controller.js";
import type { FabricConsoleFrame, FabricHitRegion } from "./index.js";
import type { FabricView } from "./model.js";
import type { FabricConsoleDataset } from "./protocol-adapter.js";
import { boundedUtf8 } from "./runtime-support.js";

export const FILTER_INPUT_NOTICE =
  "Filter: status:urgent|degraded|stale|ok plus identity text; Enter applies; Esc cancels";

export function openDeckFilter(ui: FabricConsoleUiState): FabricConsoleUiState {
  return { ...ui, inputMode: "filter", filterDraft: ui.filterQuery, notice: FILTER_INPUT_NOTICE };
}

export function cancelDeckFilter(ui: FabricConsoleUiState): FabricConsoleUiState {
  return { ...ui, inputMode: "browse", filterDraft: ui.filterQuery, notice: null };
}

export function commitDeckFilter(ui: FabricConsoleUiState): FabricConsoleUiState {
  return {
    ...ui,
    inputMode: "browse",
    filterQuery: ui.filterDraft.trim(),
    deckScrollOffset: 0,
    scrollOffsetByView: { ...ui.scrollOffsetByView, attention: 0 },
    notice: null,
  };
}

export function editModalInput(
  ui: FabricConsoleUiState,
  value: string,
  maximumBytes: number,
): FabricConsoleUiState {
  const field = ui.inputMode === "filter" ? "filterDraft" : "draft";
  const combined = `${ui[field]}${value}`;
  const next = boundedUtf8(combined, maximumBytes);
  return {
    ...ui,
    [field]: next,
    notice: next === combined
      ? null
      : `${field === "filterDraft" ? "Filter" : "Draft"} limited to ${String(maximumBytes)} bytes`,
  };
}

export function backspaceModalInput(
  ui: FabricConsoleUiState,
): FabricConsoleUiState {
  const field = ui.inputMode === "filter" ? "filterDraft" : "draft";
  return { ...ui, [field]: [...ui[field]].slice(0, -1).join(""), notice: null };
}

export function toggleFocusedDeckPin(
  ui: FabricConsoleUiState,
  activeView: FabricView,
): FabricConsoleUiState | null {
  const focusId = ui.focusId;
  if (
    activeView !== "attention" || focusId === null ||
    (!focusId.startsWith("deck:") && !focusId.startsWith("row:attention:"))
  ) return null;
  const pinned = !ui.pinnedRowIds.includes(focusId);
  return {
    ...ui,
    pinnedRowIds: pinned
      ? [focusId, ...ui.pinnedRowIds]
      : ui.pinnedRowIds.filter((id) => id !== focusId),
    deckScrollOffset: 0,
    scrollOffsetByView: { ...ui.scrollOffsetByView, attention: 0 },
    notice: pinned ? "Row pinned for this Console session" : "Row unpinned",
  };
}

export function stepVisibleDeckRegion(
  regions: readonly FabricHitRegion[],
  focusId: string | null,
  direction: -1 | 1,
): FabricHitRegion | null {
  const visibleRows = regions.filter(({ enabled, kind }) => enabled && kind === "row");
  if (visibleRows.length === 0) return null;
  const current = visibleRows.findIndex(({ id }) => id === focusId);
  const target = Math.min(
    visibleRows.length - 1,
    Math.max(0, (current < 0 ? 0 : current) + direction),
  );
  return visibleRows[target] ?? null;
}

type DeckSelectionController = Readonly<{
  state: ConsoleControllerState;
  dataset: FabricConsoleDataset;
  select(view: FabricView, stableId: string): void;
  setScrollAnchor(view: FabricView, stableId: string | null): void;
}>;

function selectedUi(
  ui: FabricConsoleUiState,
  view: FabricView,
  focusId: string,
): FabricConsoleUiState {
  return {
    ...ui,
    focusId,
    detailScrollOffsetByView: { ...ui.detailScrollOffsetByView, [view]: 0 },
    notice: null,
  };
}

export function moveVisibleSelection(
  controller: DeckSelectionController,
  frame: FabricConsoleFrame,
  ui: FabricConsoleUiState,
  direction: -1 | 1,
): FabricConsoleUiState {
  const view = controller.state.activeView;
  if (view === "attention") {
    const region = stepVisibleDeckRegion(frame.hitRegions, ui.focusId, direction);
    if (region === null) return ui;
    if (region.binding?.view === "attention") {
      controller.select("attention", region.binding.itemId);
      controller.setScrollAnchor("attention", region.binding.itemId);
      return selectedUi(ui, "attention", region.id);
    }
    return { ...ui, focusId: region.id, notice: null };
  }
  const rows = controller.dataset.pages[view].rows;
  if (rows.length === 0) return ui;
  const selected = controller.state.selectionByView[view]?.stableId;
  const current = rows.findIndex((row) => row.stableId === selected);
  const target = Math.min(
    rows.length - 1,
    Math.max(0, (current < 0 ? 0 : current) + direction),
  );
  const row = rows[target];
  if (row === undefined) return ui;
  controller.select(view, row.stableId);
  controller.setScrollAnchor(view, row.stableId);
  return selectedUi(ui, view, `row:${view}:${row.stableId}`);
}

export function pageDeck(
  ui: FabricConsoleUiState,
  maximum: number,
  direction: -1 | 1,
  stride: number,
): FabricConsoleUiState {
  return {
    ...ui,
    deckScrollOffset: Math.min(
      maximum,
      Math.max(0, Math.trunc(ui.deckScrollOffset) + direction * Math.max(1, stride)),
    ),
    notice: null,
  };
}

export function pageFocusedDeck(
  ui: FabricConsoleUiState,
  rows: readonly Readonly<{ stableId: string }>[],
  visibleCount: number,
  maximum: number,
  direction: -1 | 1,
): FabricConsoleUiState {
  const paged = pageDeck(ui, maximum, direction, Math.max(1, visibleCount - 1));
  const row = rows[paged.deckScrollOffset];
  return row === undefined ? paged : { ...paged, focusId: `deck:${row.stableId}` };
}

export function clampDeckScroll(
  ui: FabricConsoleUiState,
  maximum: number,
): FabricConsoleUiState {
  const offset = Math.min(maximum, Math.max(0, Math.trunc(ui.deckScrollOffset)));
  return offset === ui.deckScrollOffset ? ui : { ...ui, deckScrollOffset: offset };
}

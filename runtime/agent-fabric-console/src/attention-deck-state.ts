import type { FabricConsoleUiState } from "./presenter.js";

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

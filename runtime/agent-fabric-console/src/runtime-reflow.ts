import type { ConsoleControllerState } from "./controller.js";
import type { FabricHitBinding } from "./index.js";
import { FABRIC_VIEWS } from "./model.js";
import { matchesArtifactConfirmation, type FabricConsoleUiState } from "./presenter.js";
import type { FabricConsoleDataset } from "./protocol-adapter.js";
import { presentDeckRows } from "./attention-deck-presentation.js";

type RefreshUiInput = Readonly<{
  previousDataset: FabricConsoleDataset;
  dataset: FabricConsoleDataset;
  previousAnchors: ConsoleControllerState["scrollAnchorByView"];
  nextAnchors: ConsoleControllerState["scrollAnchorByView"];
  ui: FabricConsoleUiState;
  focusBinding: FabricHitBinding | null;
}>;

export function refreshUiForDataset(input: RefreshUiInput): FabricConsoleUiState {
  const {
    previousDataset,
    dataset,
    previousAnchors,
    nextAnchors,
    ui,
    focusBinding,
  } = input;
  const scrollOffsetByView = { ...ui.scrollOffsetByView };
  for (const view of FABRIC_VIEWS) {
    const previousAnchor = previousAnchors[view];
    const nextAnchor = nextAnchors[view];
    if (previousAnchor === null || nextAnchor === null) continue;
    const previousIndex = previousDataset.pages[view].rows.findIndex(
      ({ stableId }) => stableId === previousAnchor,
    );
    const nextIndex = dataset.pages[view].rows.findIndex(
      ({ stableId }) => stableId === nextAnchor,
    );
    if (previousIndex < 0 || nextIndex < 0) continue;
    const previousOffset = Math.max(
      0,
      Math.trunc(ui.scrollOffsetByView[view] ?? 0),
    );
    scrollOffsetByView[view] = Math.max(
      0,
      nextIndex - (previousIndex - previousOffset),
    );
  }

  let deckScrollOffset = ui.deckScrollOffset;
  let focusId = ui.focusId;
  let deckNotice: string | null = null;
  const previousDeckRows = presentDeckRows(previousDataset).rows;
  const nextDeckRows = presentDeckRows(dataset).rows;
  const focusedDeckId = ui.focusId?.startsWith("deck:") === true
    ? ui.focusId.slice("deck:".length)
    : null;
  const anchorIndex = focusedDeckId === null
    ? Math.min(ui.deckScrollOffset, Math.max(0, previousDeckRows.length - 1))
    : previousDeckRows.findIndex(({ stableId }) => stableId === focusedDeckId);
  const anchor = previousDeckRows[anchorIndex];
  if (anchor !== undefined) {
    let nextIndex = nextDeckRows.findIndex(({ stableId }) => stableId === anchor.stableId);
    if (nextIndex < 0 && nextDeckRows.length > 0) {
      nextIndex = Math.min(Math.max(0, anchorIndex), nextDeckRows.length - 1);
    }
    if (nextIndex >= 0) {
      const visualIndex = anchorIndex - ui.deckScrollOffset;
      deckScrollOffset = Math.max(0, nextIndex - visualIndex);
    }
    if (focusedDeckId !== null && anchor.stableId === focusedDeckId &&
      !nextDeckRows.some(({ stableId }) => stableId === focusedDeckId)) {
      const fallback = nextDeckRows[nextIndex];
      focusId = fallback === undefined ? null : `deck:${fallback.stableId}`;
      deckNotice = `Removed ${anchor.primary}; focus moved to the nearest projected roster row.`;
    }
  }

  const confirmation = ui.artifactConfirmation;
  const inspection = dataset.inspection;
  const retainConfirmation = confirmation !== null &&
    inspection?.kind === "artifact" &&
    inspection.state === "current" &&
    matchesArtifactConfirmation(
      confirmation,
      inspection.binding.itemId,
      inspection.result,
    );
  const focusedItemRemoved = focusBinding !== null &&
    !dataset.pages[focusBinding.view].rows.some(
      ({ stableId }) => stableId === focusBinding.itemId,
    );
  return {
    ...ui,
    focusId,
    scrollOffsetByView,
    deckScrollOffset,
    ...(!retainConfirmation ? { artifactConfirmation: null } : {}),
    ...(focusedItemRemoved
      ? { notice: `Removed ${focusBinding.itemId}; focus moved to the nearest projected row.` }
      : {}),
    ...(deckNotice === null ? {} : { notice: deckNotice }),
  };
}

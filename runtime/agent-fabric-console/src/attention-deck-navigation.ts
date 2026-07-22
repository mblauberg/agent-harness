import type { PresentedDeckRow } from "./presenter-model.js";

export function compactDeckRosterRows(
  rows: readonly PresentedDeckRow[],
  pinnedRowIds: readonly string[],
): readonly PresentedDeckRow[] {
  const pins = new Set(pinnedRowIds);
  const unpinned = rows.filter(({ stableId }) => !pins.has(`deck:${stableId}`));
  return [
    ...rows.filter(({ stableId }) => pins.has(`deck:${stableId}`)),
    ...unpinned.filter(({ kind }) => kind === "coordination"),
    ...unpinned.filter(({ kind }) => kind !== "coordination"),
  ];
}

export function visibleDeckOffset(
  rows: readonly Readonly<{ stableId: string }>[],
  focusId: string | null,
  requestedOffset: number,
  capacity: number,
): number {
  const maximum = Math.max(0, rows.length - capacity);
  const offset = Math.min(maximum, Math.max(0, Math.trunc(requestedOffset)));
  if (capacity <= 0 || focusId === null) return offset;
  const focusedIndex = rows.findIndex(({ stableId }) => focusId === `deck:${stableId}`);
  if (focusedIndex < 0 || (focusedIndex >= offset && focusedIndex < offset + capacity)) {
    return offset;
  }
  return focusedIndex < offset
    ? focusedIndex
    : Math.min(maximum, focusedIndex - capacity + 1);
}

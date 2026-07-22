import type { PresentedDeckRow, PresentedRow } from "./presenter-model.js";

export type DeckStatusClass = "urgent" | "degraded" | "stale" | "ok";

export type AppliedDeckView = Readonly<{
  needsYouRows: readonly PresentedRow[];
  watchRows: readonly PresentedRow[];
  deckRows: readonly PresentedDeckRow[];
  active: boolean;
  shownCount: number;
  unfilteredCount: number;
}>;

const STATUS_TOKEN = /^status:(urgent|degraded|stale|ok)$/iu;

export function attentionPinId(row: PresentedRow): string {
  return `row:${row.view}:${row.stableId}`;
}

export function deckPinId(row: PresentedDeckRow): string {
  return `deck:${row.stableId}`;
}

function stablePinsFirst<Row>(
  rows: readonly Row[],
  pinId: (row: Row) => string,
  pins: ReadonlySet<string>,
): readonly Row[] {
  return [
    ...rows.filter((row) => pins.has(pinId(row))),
    ...rows.filter((row) => !pins.has(pinId(row))),
  ];
}

function parseFilter(query: string): Readonly<{
  active: boolean;
  statuses: ReadonlySet<DeckStatusClass>;
  text: string;
}> {
  const trimmed = query.trim();
  const statuses = new Set<DeckStatusClass>();
  const text: string[] = [];
  for (const token of trimmed.split(/\s+/u)) {
    const match = STATUS_TOKEN.exec(token);
    if (match === null) {
      if (token !== "") text.push(token);
      continue;
    }
    statuses.add(match[1]!.toLowerCase() as DeckStatusClass);
  }
  return { active: trimmed !== "", statuses, text: text.join(" ").toLowerCase() };
}

function stale(value: string | null): boolean {
  return /\b(?:STALE|UNAVAILABLE|CONFLICT)\b/iu.test(value ?? "");
}

function attentionStatuses(
  row: PresentedRow,
  base: "urgent" | "ok",
): ReadonlySet<DeckStatusClass> {
  const result = new Set<DeckStatusClass>([base]);
  if (stale(row.freshness)) result.add("stale");
  return result;
}

function deckStatuses(row: PresentedDeckRow): ReadonlySet<DeckStatusClass> {
  if (stale(`${row.statusLabel} ${row.freshness ?? ""}`)) return new Set(["stale"]);
  if (row.health === "blocked") return new Set(["urgent"]);
  if (
    row.statusLabel === "DEGRADED" || row.state === "visibility_degraded" ||
    row.health === "degraded"
  ) return new Set(["degraded"]);
  return new Set(["ok"]);
}

function matchesStatuses(
  rowStatuses: ReadonlySet<DeckStatusClass>,
  required: ReadonlySet<DeckStatusClass>,
): boolean {
  return required.size === 0 || [...required].some((status) => rowStatuses.has(status));
}

function matchesText(values: readonly (string | null)[], text: string): boolean {
  return text === "" || values.some((value) => value?.toLowerCase().includes(text) === true);
}

export function applyDeckView(
  needsYouRows: readonly PresentedRow[],
  watchRows: readonly PresentedRow[],
  deckRows: readonly PresentedDeckRow[],
  query: string,
  pinnedRowIds: readonly string[],
): AppliedDeckView {
  const filter = parseFilter(query);
  const pins = new Set(pinnedRowIds);
  const visibleNeeds = stablePinsFirst(
    needsYouRows.filter((row) =>
      pins.has(attentionPinId(row)) || !filter.active || (
        matchesStatuses(attentionStatuses(row, "urgent"), filter.statuses) &&
        matchesText([row.stableId, row.primary], filter.text)
      )),
    attentionPinId,
    pins,
  );
  const visibleWatch = stablePinsFirst(
    watchRows.filter((row) =>
      pins.has(attentionPinId(row)) || !filter.active || (
        matchesStatuses(attentionStatuses(row, "ok"), filter.statuses) &&
        matchesText([row.stableId, row.primary], filter.text)
      )),
    attentionPinId,
    pins,
  );
  const visibleDeck = stablePinsFirst(
    deckRows.filter((row) =>
      pins.has(deckPinId(row)) || !filter.active || (
        matchesStatuses(deckStatuses(row), filter.statuses) &&
        matchesText([
          row.stableId,
          row.entityId,
          row.projectSessionId,
          row.coordinationRunId,
          row.deliveryRunId,
          row.owner,
          row.primary,
        ], filter.text)
      )),
    deckPinId,
    pins,
  );
  return {
    needsYouRows: visibleNeeds,
    watchRows: visibleWatch,
    deckRows: visibleDeck,
    active: filter.active,
    shownCount: visibleNeeds.length + visibleWatch.length + visibleDeck.length,
    unfilteredCount: needsYouRows.length + watchRows.length + deckRows.length,
  };
}

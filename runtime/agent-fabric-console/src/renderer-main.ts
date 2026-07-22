import {
  cellWidth,
  chromeText,
  composeFields,
  writeFixedCells,
  type Rect,
} from "./layout.js";
import type {
  FabricConsolePresentation,
  FabricConsoleUiState,
} from "./presenter.js";
import type { FabricConsoleDataset } from "./protocol-adapter.js";
import {
  presentedBinding,
  rowText,
  setFabricRow,
  type FabricHitRegion,
} from "./renderer-primitives.js";
import { FABRIC_VIEW_SHORT_LABELS } from "./theme.js";

export function renderFabricHeader(
  rows: string[],
  columns: number,
  presentation: FabricConsolePresentation,
): void {
  const header = presentation.header;
  setFabricRow(
    rows,
    1,
    columns,
    composeFields(
      columns,
      [
        `P:${header.project}`,
        `S:${header.session}`,
        `R:${header.run}`,
        `r${header.revision ?? "?"}`,
        header.freshness.toUpperCase(),
      ],
      [18, 16, 14, 21, 7],
      [4, 4, 4, 2, 4],
      [0, 1, 2, 3, 4],
    ),
  );
  setFabricRow(
    rows,
    2,
    columns,
    composeFields(
      columns,
      [
        `Phase:${header.phase}`,
        `Owner:${header.owner}`,
        `Health:${header.health}`,
        `Attn:${String(header.attentionCount)}`,
        `Runs:${String(header.runCount)}`,
      ],
      [25, 19, 18, 7, 7],
      [6, 6, 7, 6, 6],
      [0, 1, 2, 3, 4],
    ),
  );
  setFabricRow(
    rows,
    3,
    columns,
    composeFields(
      columns,
      [`Next:${header.nextMilestone}`, `Capacity:${header.capacity}`],
      [52, 27],
      [6, 9],
      [0, 1],
    ),
  );
}

export function renderFabricTabs(
  rows: string[],
  columns: number,
  presentation: FabricConsolePresentation,
  geometryKey: string,
  hitRegions: FabricHitRegion[],
  row = 4,
): void {
  let line = "";
  let x = 1;
  for (const view of presentation.views) {
    const id = `view:${view.view}`;
    const focused = presentation.focusId === id;
    const label = `${focused ? ">" : ""}${view.key}:${FABRIC_VIEW_SHORT_LABELS[view.view]}${view.active ? "*" : ""}`;
    const width = cellWidth(label);
    if (x + width - 1 > columns) break;
    line += `${line.length === 0 ? "" : " "}${label}`;
    const x1 = x + (x === 1 ? 0 : 1);
    hitRegions.push({
      id,
      kind: "tab",
      rect: { x1, y1: row, x2: x1 + width - 1, y2: row },
      enabled: true,
      geometryKey,
      binding: null,
    });
    x = x1 + width;
  }
  setFabricRow(rows, row, columns, line);
}

export function renderFabricMaster(
  rows: string[],
  columns: number,
  presentation: FabricConsolePresentation,
  dataset: FabricConsoleDataset,
  ui: FabricConsoleUiState,
  geometryKey: string,
  hitRegions: FabricHitRegion[],
  bounds: Rect,
): void {
  const sessionChoices =
    presentation.activeView === "project" &&
    dataset.projectSessions?.selectedProjectSessionId === null
      ? dataset.projectSessions.choices
      : [];
  const masterItems = [
    ...sessionChoices.map((choice) => ({ kind: "session" as const, choice })),
    ...(presentation.activeView === "attention" &&
      (presentation.header.needsYouCount > 0 || presentation.watchRows.length > 0)
      ? [{ kind: "watch" as const }]
      : []),
    ...(presentation.activeView === "attention"
      ? presentation.needsYouRows
      : presentation.masterRows
    ).map((item) => ({ kind: "row" as const, item })),
  ];
  const visibleCapacity = bounds.y2 - bounds.y1 + 1;
  const offset = Math.min(
    Math.max(0, masterItems.length - visibleCapacity),
    Math.max(
      0,
      Math.trunc(ui.scrollOffsetByView[presentation.activeView] ?? 0),
    ),
  );
  const visibleRows = masterItems.slice(
    offset,
    offset + visibleCapacity,
  );
  for (const [index, visible] of visibleRows.entries()) {
    const y = bounds.y1 + index;
    if (visible.kind === "session") {
      const { choice } = visible;
      const id = `session:select:${choice.projectSessionId}`;
      const text = `${presentation.focusId === id ? ">" : " "} SESSION ${choice.projectSessionId} | ${choice.mode} | ${choice.state} | r${String(choice.revision)}`;
      if (bounds.x1 === 1 && bounds.x2 === columns) {
        setFabricRow(rows, y, columns, text);
      } else {
        const existing = rows[y - 1] ?? " ".repeat(columns);
        const leftWidth = bounds.x2 - bounds.x1 + 1;
        rows[y - 1] = writeFixedCells(
          existing,
          bounds.x1,
          leftWidth,
          chromeText(text),
        );
      }
      hitRegions.push({
        id,
        kind: "session",
        rect: { x1: bounds.x1, y1: y, x2: bounds.x2, y2: y },
        enabled: true,
        geometryKey,
        binding: null,
      });
      continue;
    }
    if (visible.kind === "watch") {
      const text = `NEEDS YOU:${String(presentation.header.needsYouCount)} | WATCH:${String(presentation.header.watchCount)} collapsed`;
      if (bounds.x1 === 1 && bounds.x2 === columns) {
        setFabricRow(rows, y, columns, text);
      } else {
        const existing = rows[y - 1] ?? " ".repeat(columns);
        rows[y - 1] = writeFixedCells(
          existing,
          bounds.x1,
          bounds.x2 - bounds.x1 + 1,
          chromeText(text),
        );
      }
      continue;
    }
    const { item } = visible;
    const id = `row:${item.view}:${item.stableId}`;
    const text = rowText(item, presentation.focusId === id);
    if (bounds.x1 === 1 && bounds.x2 === columns) {
      setFabricRow(rows, y, columns, text);
    } else {
      const existing = rows[y - 1] ?? " ".repeat(columns);
      const leftWidth = bounds.x2 - bounds.x1 + 1;
      rows[y - 1] = writeFixedCells(
        existing,
        bounds.x1,
        leftWidth,
        chromeText(text),
      );
    }
    hitRegions.push({
      id,
      kind: "row",
      rect: { x1: bounds.x1, y1: y, x2: bounds.x2, y2: y },
      enabled: true,
      geometryKey,
      binding: presentedBinding(dataset, item),
    });
  }
  if (masterItems.length === 0) {
    const message = "No projected items in this view.";
    if (bounds.x1 === 1 && bounds.x2 === columns) {
      setFabricRow(rows, bounds.y1, columns, message);
    } else {
      rows[bounds.y1 - 1] = writeFixedCells(
        rows[bounds.y1 - 1] ?? " ".repeat(columns),
        bounds.x1,
        bounds.x2 - bounds.x1 + 1,
        message,
      );
    }
  }
}

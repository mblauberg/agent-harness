import stringWidth from "string-width";
import { splitGraphemes } from "unicode-segmenter/grapheme";
import type { TerminalInputEvent } from "./input.js";
import type { ConsoleControllerState } from "./controller.js";
import type { FabricView, Revision } from "./model.js";
import {
  presentFabricConsole,
  responsiveModeFor,
  type FabricConsolePresentation,
  type FabricConsoleUiState,
  type FabricResponsiveMode,
  type FabricViewport,
  type PresentedAction,
  type PresentedRow,
} from "./presenter.js";
import type { FabricConsoleDataset } from "./protocol-adapter.js";

export * from "./input.js";
export * from "./application.js";
export * from "./controller.js";
export * from "./evaluation.js";
export * from "./message.js";
export * from "./model.js";
export * from "./presenter.js";
export * from "./protocol-adapter.js";
export * from "./runtime.js";
export * from "./terminal.js";

export const UNICODE_POLICY = Object.freeze({
  segmentation: "unicode-segmenter@0.17.0",
  width: "string-width@8.2.2",
  ambiguousWidth: "narrow",
} as const);

export const MAX_FRAME_CELLS = 250_000;

export type ConsoleProjection = Readonly<{
  project: string;
  session: string;
  run: string;
  revision: bigint;
  freshness: "LIVE" | "STALE" | "CONFLT" | "UNAVAIL" | "UNKNOWN";
  age: string;
  phase: string;
  owner: string;
  health: "HEALTHY" | "ATTN" | "BLOCKED" | "QUARANTINE" | "DEGRADED" | "UNKNOWN";
  attentionCount: number;
  runCount: number;
  currentMilestone: string;
  nextMilestone: string;
  declaredCount: string;
}>;

export type ConsoleState = Readonly<{
  selectedId: string | null;
  focus: "tabs" | "master" | "splitter" | "detail" | "actions" | "input";
  draft: string;
  pendingCommandId: string | null;
  scrollByView: Readonly<Partial<Record<ConsoleView, number>>>;
  focusedRegionId: string | null;
  mouseCapture: boolean;
  pressedRegionId: string | null;
  pressedGeometryKey: string | null;
  splitterRatio: number;
  activeView: ConsoleView;
}>;

export type ConsoleView =
  | "Attention"
  | "Project"
  | "Runs"
  | "Work"
  | "Agents"
  | "Evidence"
  | "Activity"
  | "System";

const CONSOLE_VIEWS: readonly ConsoleView[] = [
  "Attention",
  "Project",
  "Runs",
  "Work",
  "Agents",
  "Evidence",
  "Activity",
  "System",
];

export type Rect = Readonly<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}>;

export type HitRegion = Readonly<{
  id: string;
  kind: "tab" | "action" | "splitter" | "detach";
  rect: Rect;
  enabled: boolean;
}>;

export type ConsoleFrame = Readonly<{
  columns: number;
  rows: readonly string[];
  mode: "full" | "compact" | "inert";
  hitRegions: readonly HitRegion[];
  geometryKey: string;
  splitterBounds: Readonly<{ minY: number; maxY: number }> | null;
}>;

export type TerminalViewport = Readonly<{
  columns?: number;
  rows?: number;
}>;

export function createConsoleState(
  overrides: Partial<ConsoleState> = {},
): ConsoleState {
  return {
    selectedId: overrides.selectedId ?? null,
    focus: overrides.focus ?? "master",
    draft: overrides.draft ?? "",
    pendingCommandId: overrides.pendingCommandId ?? null,
    scrollByView: overrides.scrollByView ?? {},
    focusedRegionId: overrides.focusedRegionId ?? null,
    mouseCapture: overrides.mouseCapture ?? false,
    pressedRegionId: overrides.pressedRegionId ?? null,
    pressedGeometryKey: overrides.pressedGeometryKey ?? null,
    splitterRatio:
      overrides.splitterRatio === undefined ||
      !Number.isFinite(overrides.splitterRatio)
        ? 5 / 9
        : Math.min(1, Math.max(0, overrides.splitterRatio)),
    activeView: overrides.activeView ?? "Attention",
  };
}

export function cellWidth(_text: string): number {
  return stringWidth(_text);
}

export function graphemes(text: string): IterableIterator<string> {
  return splitGraphemes(text);
}

const C0_NAMES: Readonly<Partial<Record<number, string>>> = Object.freeze({
  0x00: "NUL",
  0x07: "BEL",
  0x08: "BS",
  0x09: "HT",
  0x0a: "LF",
  0x0d: "CR",
  0x1b: "ESC",
});

function visibleCodePoint(prefix: "C0" | "C1", codePoint: number): string {
  const common = C0_NAMES[codePoint];
  return common === undefined
    ? `<${prefix}-${codePoint.toString(16).toUpperCase().padStart(2, "0")}>`
    : `<${common}>`;
}

function isBidiFormatting(codePoint: number): boolean {
  return (
    codePoint === 0x061c ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}

export function sanitizeDisplayText(
  input: string,
  options: Readonly<{ lineBreaks?: "preserve" | "visible" }> = {},
): string {
  const lineBreaks = options.lineBreaks ?? "preserve";
  const normalized = input.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  let output = "";
  let column = 0;

  for (const value of normalized) {
    const codePoint = value.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    if (value === "\n") {
      if (lineBreaks === "preserve") {
        output += "\n";
        column = 0;
      } else {
        output += "<LF>";
        column += 4;
      }
      continue;
    }
    if (value === "\t") {
      const spaces = 4 - (column % 4);
      output += " ".repeat(spaces);
      column += spaces;
      continue;
    }

    let safe = value;
    if (codePoint <= 0x1f) {
      safe = visibleCodePoint("C0", codePoint);
    } else if (codePoint >= 0x80 && codePoint <= 0x9f) {
      safe = visibleCodePoint("C1", codePoint);
    } else if (codePoint === 0x7f) {
      safe = "<DEL>";
    } else if (isBidiFormatting(codePoint)) {
      safe = `<BIDI-U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}>`;
    } else if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      safe = "\uFFFD";
    }
    output += safe;
    column += cellWidth(safe);
  }
  return output;
}

export function clipCells(text: string, columns: number): string {
  if (columns <= 0) {
    return "";
  }

  const clusters = [...splitGraphemes(text)];
  const total = clusters.reduce(
    (sum, grapheme) => sum + cellWidth(grapheme),
    0,
  );
  if (total <= columns) {
    return text + " ".repeat(columns - total);
  }

  const contentLimit = Math.max(0, columns - 1);
  let rendered = "";
  let used = 0;
  for (const grapheme of clusters) {
    const width = cellWidth(grapheme);
    if (used + width > contentLimit) {
      break;
    }
    rendered += grapheme;
    used += width;
  }
  rendered += "~";
  used += 1;
  return rendered + " ".repeat(columns - used);
}

function fitCells(text: string, columns: number): string {
  return clipCells(text, columns);
}

function chromeText(text: string): string {
  return sanitizeDisplayText(text, { lineBreaks: "visible" });
}

function composeFields(
  columns: number,
  fields: readonly string[],
  baseWidths: readonly number[],
  minimumWidths: readonly number[],
  expansionOrder: readonly number[],
): string {
  if (fields.length === 0 || columns <= 0) {
    return "";
  }
  const gapCells = fields.length - 1;
  if (columns <= gapCells) {
    return fitCells(fields.join("|"), columns);
  }
  const widths = baseWidths.map((width) => width);
  const target = columns - gapCells;
  let total = widths.reduce((sum, width) => sum + width, 0);
  while (total > target) {
    let changed = false;
    for (const index of expansionOrder) {
      const width = widths[index];
      const minimum = minimumWidths[index];
      if (width !== undefined && minimum !== undefined && width > minimum) {
        widths[index] = width - 1;
        total -= 1;
        changed = true;
        if (total === target) {
          break;
        }
      }
    }
    if (!changed) {
      return fitCells(fields.join("|"), columns);
    }
  }
  let expansionIndex = 0;
  while (total < target) {
    const fieldIndex = expansionOrder[expansionIndex % expansionOrder.length];
    if (fieldIndex === undefined || widths[fieldIndex] === undefined) {
      break;
    }
    widths[fieldIndex] += 1;
    total += 1;
    expansionIndex += 1;
  }
  return fields
    .map((field, index) => fitCells(chromeText(field), widths[index] ?? 0))
    .join("|");
}

function writeFixedCells(
  row: string,
  start: number,
  width: number,
  value: string,
): string {
  if (start < 1 || width < 1 || start > cellWidth(row)) {
    return row;
  }
  const fitted = fitCells(value, width);
  const startIndex = start - 1;
  return `${row.slice(0, startIndex)}${fitted}${row.slice(startIndex + width)}`;
}

function renderTabRow(
  columns: number,
  state: ConsoleState,
  regions: readonly HitRegion[],
): string {
  let row = " ".repeat(columns);
  for (const region of regions) {
    if (region.kind !== "tab") {
      continue;
    }
    const view = viewForTab(region.id);
    if (view === null) {
      continue;
    }
    const focused = state.focusedRegionId === region.id;
    const label = focused ? `>${view.slice(1)}` : view;
    row = writeFixedCells(
      row,
      region.rect.x1,
      region.rect.x2 - region.rect.x1 + 1,
      label,
    );
    if (state.activeView === view && region.rect.x2 < columns) {
      row = writeFixedCells(row, region.rect.x2 + 1, 1, "*");
    }
  }
  if (columns >= 70) {
    row = writeFixedCells(
      row,
      61,
      Math.min(10, columns - 60),
      `MOUSE:${state.mouseCapture ? "ON" : "OFF"}`,
    );
  }
  return row;
}

export function renderConsoleFrame(
  _projection: ConsoleProjection,
  _state: ConsoleState,
  _viewport: TerminalViewport,
): ConsoleFrame {
  const rawColumns = _viewport.columns;
  const rawRows = _viewport.rows;
  const validDimensions =
    rawColumns !== undefined &&
    rawRows !== undefined &&
    Number.isFinite(rawColumns) &&
    Number.isFinite(rawRows) &&
    rawColumns >= 0 &&
    rawRows >= 0;
  const requestedColumns = validDimensions ? Math.trunc(rawColumns) : 0;
  const requestedRows = validDimensions ? Math.trunc(rawRows) : 0;
  const boundedDimensions =
    requestedColumns <= MAX_FRAME_CELLS &&
    requestedRows <= MAX_FRAME_CELLS &&
    requestedColumns * requestedRows <= MAX_FRAME_CELLS;
  const columns = boundedDimensions ? requestedColumns : 0;
  const rowCount = boundedDimensions ? requestedRows : 0;
  const rows = Array.from({ length: rowCount }, () => fitCells("", columns));
  const geometryKey = `${columns}x${rowCount}`;
  const mode =
    columns >= 80 && rowCount >= 24
      ? "full"
      : columns >= 20 && rowCount >= 8
        ? "compact"
        : "inert";
  if (mode === "inert") {
    if (rowCount > 0) {
      rows[0] = fitCells(columns >= 8 ? "q detach" : "", columns);
    }
    return {
      columns,
      rows,
      mode,
      hitRegions: [],
      geometryKey,
      splitterBounds: null,
    };
  }

  const sourceRows = [
    composeFields(
      columns,
      [
        `P: ${_projection.project}`,
        `S: ${_projection.session}`,
        `R: ${_projection.run}`,
        `r${_projection.revision}`,
        `${_projection.freshness} ${_projection.age}`,
      ],
      [18, 16, 14, 21, 7],
      [4, 4, 4, 2, 4],
      [0, 1, 2, 3, 4],
    ),
    composeFields(
      columns,
      [
        `Phase: ${_projection.phase}`,
        `Owner: ${_projection.owner}`,
        `Health: ${_projection.health}`,
        `Attn: ${_projection.attentionCount}`,
        `Runs: ${_projection.runCount}`,
      ],
      [20, 20, 16, 10, 10],
      [5, 5, 7, 5, 5],
      [0, 1, 2, 3, 4],
    ),
    composeFields(
      columns,
      [
        `Now: ${_projection.currentMilestone}`,
        `Next: ${_projection.nextMilestone}`,
        _projection.declaredCount,
      ],
      [36, 34, 8],
      [5, 6, 4],
      [0, 1, 2],
    ),
    "",
  ];
  for (const [index, text] of sourceRows.entries()) {
    if (index >= rowCount) {
      break;
    }
    rows[index] = fitCells(text, columns);
  }

  const actionRow = rowCount - 2;
  const statusRow = rowCount - 1;
  const helpRow = rowCount;
  const hitRegions: HitRegion[] = [];
  let tabX = 1;
  for (const view of CONSOLE_VIEWS) {
    if (tabX > columns) {
      break;
    }
    const x2 = tabX + cellWidth(view) - 1;
    if (x2 > columns) {
      break;
    }
    hitRegions.push({
      id: `tab:${view}`,
      kind: "tab",
      rect: { x1: tabX, y1: 4, x2, y2: 4 },
      enabled: true,
    });
    tabX = x2 + 2;
  }

  const minSplitter = mode === "full" ? 9 : Math.min(5, actionRow - 1);
  const maxSplitter =
    mode === "full"
      ? rowCount === 24
        ? 18
        : Math.max(minSplitter, actionRow - 4)
      : Math.max(minSplitter, actionRow - 1);
  const splitterBounds = { minY: minSplitter, maxY: maxSplitter };
  const splitterRow = Math.round(
    minSplitter + (maxSplitter - minSplitter) * _state.splitterRatio,
  );
  if (splitterRow >= 5) {
    const splitterPrefix =
      _state.focusedRegionId === "splitter" ? ">" : "=";
    rows[splitterRow - 1] = fitCells(
      `${splitterPrefix}===[ drag split: row ${splitterRow} ]====`,
      columns,
    );
    hitRegions.push({
      id: "splitter",
      kind: "splitter",
      rect: { x1: 1, y1: splitterRow, x2: columns, y2: splitterRow },
      enabled: true,
    });
  }

  if (columns >= 64) {
    const labels = [
      ["discuss", "[Discuss]", 10],
      ["accept", "[Accept]", 10],
      ["request-changes", "[Request changes]", 19],
      ["defer", "[Defer]", 9],
      ["implement", "[Implement...]", 16],
    ] as const;
    const actionWidth = Math.max(64, Math.floor(columns * 0.8));
    let x1 = 1;
    let line = "";
    let assigned = 0;
    for (const [index, [id, label, referenceWidth]] of labels.entries()) {
      const isLast = index === labels.length - 1;
      const width = isLast
        ? actionWidth - assigned
        : Math.max(1, Math.round((referenceWidth / 64) * actionWidth));
      const x2 = Math.min(columns, x1 + width - 1);
      const focusMarker =
        _state.focusedRegionId === `action:${id}` ? ">" : " ";
      line += fitCells(`${focusMarker}${label}`, x2 - x1 + 1);
      hitRegions.push({
        id: `action:${id}`,
        kind: "action",
        rect: { x1, y1: actionRow, x2, y2: actionRow },
        enabled: true,
      });
      assigned += width;
      x1 = x2 + 1;
    }
    rows[actionRow - 1] = fitCells(line, columns);
  } else {
    rows[actionRow - 1] = fitCells("Actions hidden: grow terminal", columns);
  }

  rows[helpRow - 1] = fitCells(
    _state.focusedRegionId === "detach"
      ? "? help | q>detach"
      : "? help | q detach",
    columns,
  );
  if (columns >= 17) {
    hitRegions.push({
      id: "detach",
      kind: "detach",
      rect: { x1: 10, y1: helpRow, x2: 17, y2: helpRow },
      enabled: true,
    });
  }
  const focusedRegion =
    _state.focusedRegionId === null
      ? null
      : hitRegions.find(
          ({ enabled, id }) => enabled && id === _state.focusedRegionId,
        );
  const focusToken =
    _state.focusedRegionId === null
      ? _state.focus
      : focusedRegion === undefined
        ? `!${_state.focusedRegionId}`
        : _state.focusedRegionId;
  const pendingToken =
    _state.pendingCommandId === null
      ? "READY"
      : chromeText(`P:${_state.pendingCommandId}`);
  rows[statusRow - 1] = fitCells(
    `V:${_state.activeView} F:${focusToken} M:${_state.mouseCapture ? "ON" : "OFF"} | ${pendingToken}`,
    columns,
  );
  rows[3] = renderTabRow(columns, _state, hitRegions);

  return {
    columns,
    rows,
    mode,
    hitRegions,
    geometryKey,
    splitterBounds,
  };
}

export type ConsoleIntent =
  | Readonly<{
      kind: "activate-region";
      regionId: string;
      provenance: "keyboard" | "mouse";
    }>
  | Readonly<{ kind: "detach"; provenance: "keyboard" | "safety" }>
  | Readonly<{
      kind: "scroll";
      regionId: string | null;
      delta: -1 | 1;
      provenance: "mouse";
    }>
  | Readonly<{
      kind: "set-mouse-capture";
      enabled: boolean;
      provenance: "keyboard";
    }>;

export type ConsoleReduction = Readonly<{
  state: ConsoleState;
  intents: readonly ConsoleIntent[];
}>;

export function resizeConsoleSurface(
  projection: ConsoleProjection,
  state: ConsoleState,
  viewport: TerminalViewport,
): Readonly<{
  state: ConsoleState;
  frame: ConsoleFrame;
  intents: readonly ConsoleIntent[];
}> {
  return {
    state,
    frame: renderConsoleFrame(projection, state, viewport),
    intents: [],
  };
}

function regionAt(frame: ConsoleFrame, x: number, y: number): HitRegion | null {
  return (
    frame.hitRegions.find(
      ({ enabled, rect }) =>
        enabled &&
        x >= rect.x1 &&
        x <= rect.x2 &&
        y >= rect.y1 &&
        y <= rect.y2,
    ) ?? null
  );
}

function focusForRegion(region: HitRegion): ConsoleState["focus"] {
  switch (region.kind) {
    case "tab":
      return "tabs";
    case "action":
      return "actions";
    case "splitter":
      return "splitter";
    case "detach":
      return "actions";
  }
}

function focusRegion(state: ConsoleState, region: HitRegion): ConsoleState {
  return {
    ...state,
    focus: focusForRegion(region),
    focusedRegionId: region.id,
  };
}

function cycleFocus(
  state: ConsoleState,
  frame: ConsoleFrame,
  delta: -1 | 1,
): ConsoleState {
  const regions = frame.hitRegions.filter(({ enabled }) => enabled);
  if (regions.length === 0) {
    return { ...state, focus: "master", focusedRegionId: null };
  }
  const current = regions.findIndex(({ id }) => id === state.focusedRegionId);
  const next =
    current === -1
      ? delta === 1
        ? 0
        : regions.length - 1
      : (current + delta + regions.length) % regions.length;
  const region = regions[next];
  return region === undefined ? state : focusRegion(state, region);
}

function moveWithinRegionKind(
  state: ConsoleState,
  frame: ConsoleFrame,
  delta: -1 | 1,
): ConsoleState {
  const current = frame.hitRegions.find(
    ({ enabled, id }) => enabled && id === state.focusedRegionId,
  );
  if (current === undefined) {
    return cycleFocus(state, frame, delta);
  }
  const peers = frame.hitRegions.filter(
    ({ enabled, kind }) => enabled && kind === current.kind,
  );
  const index = peers.findIndex(({ id }) => id === current.id);
  const next = peers[(index + delta + peers.length) % peers.length];
  return next === undefined ? state : focusRegion(state, next);
}

function viewForTab(regionId: string): ConsoleView | null {
  const view = CONSOLE_VIEWS.find((candidate) => `tab:${candidate}` === regionId);
  return view ?? null;
}

export function reduceConsoleInput(
  state: ConsoleState,
  event: TerminalInputEvent,
  frame: ConsoleFrame,
): ConsoleReduction {
  if (event.kind === "fatal") {
    return {
      state,
      intents: [{ kind: "detach", provenance: "safety" }],
    };
  }
  if (event.kind === "rejected") {
    return { state, intents: [] };
  }
  if (event.kind === "paste") {
    if (state.focus !== "input") {
      return { state, intents: [] };
    }
    return {
      state: {
        ...state,
        draft:
          state.draft + sanitizeDisplayText(event.text, { lineBreaks: "preserve" }),
      },
      intents: [],
    };
  }
  if (event.kind === "key") {
    if (event.key === "alt-m") {
      return {
        state: {
          ...state,
          pressedRegionId: null,
          pressedGeometryKey: null,
        },
        intents: [
          {
            kind: "set-mouse-capture",
            enabled: !state.mouseCapture,
            provenance: "keyboard",
          },
        ],
      };
    }
    if (event.key === "ctrl-c") {
      return {
        state,
        intents: [{ kind: "detach", provenance: "keyboard" }],
      };
    }
    if (event.key === "escape") {
      return {
        state: {
          ...state,
          focus: "master",
          focusedRegionId: null,
          pressedRegionId: null,
          pressedGeometryKey: null,
        },
        intents: [],
      };
    }
    if (event.key === "tab" || event.key === "shift-tab") {
      return {
        state: cycleFocus(state, frame, event.key === "tab" ? 1 : -1),
        intents: [],
      };
    }
    if (event.key.startsWith("alt-")) {
      const index = Number(event.key.slice(4)) - 1;
      const view = CONSOLE_VIEWS[index];
      const region =
        view === undefined
          ? undefined
          : frame.hitRegions.find(
              ({ enabled, id }) => enabled && id === `tab:${view}`,
            );
      if (view === undefined || region === undefined) {
        return { state, intents: [] };
      }
      return {
        state: { ...focusRegion(state, region), activeView: view },
        intents: [],
      };
    }
    if (
      state.focus === "splitter" &&
      (event.key === "up" || event.key === "down") &&
      frame.splitterBounds !== null
    ) {
      const splitter = frame.hitRegions.find(
        ({ enabled, id }) => enabled && id === "splitter",
      );
      if (splitter === undefined) {
        return { state, intents: [] };
      }
      const target = Math.min(
        frame.splitterBounds.maxY,
        Math.max(
          frame.splitterBounds.minY,
          splitter.rect.y1 + (event.key === "up" ? -1 : 1),
        ),
      );
      const range = frame.splitterBounds.maxY - frame.splitterBounds.minY;
      return {
        state: {
          ...state,
          splitterRatio:
            range === 0 ? state.splitterRatio : (target - frame.splitterBounds.minY) / range,
        },
        intents: [],
      };
    }
    if (event.key === "left" || event.key === "right") {
      return {
        state: moveWithinRegionKind(
          state,
          frame,
          event.key === "left" ? -1 : 1,
        ),
        intents: [],
      };
    }
    if (event.key === "up" || event.key === "down") {
      return {
        state: cycleFocus(state, frame, event.key === "up" ? -1 : 1),
        intents: [],
      };
    }
    if (event.key === "text" && event.text !== undefined) {
      if (state.focus === "input") {
        return {
          state: {
            ...state,
            draft:
              state.draft +
              sanitizeDisplayText(event.text, { lineBreaks: "preserve" }),
          },
          intents: [],
        };
      }
      if (event.text === "q") {
        return {
          state,
          intents: [{ kind: "detach", provenance: "keyboard" }],
        };
      }
      const shortcutRegions: Readonly<Record<string, string>> = {
        d: "action:discuss",
        a: "action:accept",
        c: "action:request-changes",
        f: "action:defer",
        i: "action:implement",
      };
      const regionId = shortcutRegions[event.text];
      const region =
        regionId === undefined
          ? undefined
          : frame.hitRegions.find(
              ({ enabled, id }) => enabled && id === regionId,
            );
      if (region !== undefined) {
        return { state: focusRegion(state, region), intents: [] };
      }
    }
    if (event.key === "space" && state.focus === "input") {
      return {
        state: { ...state, draft: `${state.draft} ` },
        intents: [],
      };
    }
    if (
      (event.key === "enter" || event.key === "space") &&
      state.focusedRegionId !== null
    ) {
      const currentRegion = frame.hitRegions.find(
        ({ enabled, id }) => enabled && id === state.focusedRegionId,
      );
      if (currentRegion === undefined) {
        return {
          state: { ...state, focusedRegionId: null },
          intents: [],
        };
      }
      const selectedView = viewForTab(currentRegion.id);
      if (selectedView !== null) {
        return {
          state: { ...state, activeView: selectedView },
          intents: [],
        };
      }
      return {
        state,
        intents: [
          {
            kind: "activate-region",
            regionId: state.focusedRegionId,
            provenance: "keyboard",
          },
        ],
      };
    }
    return { state, intents: [] };
  }

  if (!state.mouseCapture || (event.button === "left" && event.modifiers.shift)) {
    return {
      state:
        state.pressedRegionId === null
          ? state
          : { ...state, pressedRegionId: null, pressedGeometryKey: null },
      intents: [],
    };
  }
  const region = regionAt(frame, event.x, event.y);
  if (event.phase === "wheel") {
    return {
      state,
      intents: [
        {
          kind: "scroll",
          regionId: region?.id ?? null,
          delta: event.button === "wheel-up" ? -1 : 1,
          provenance: "mouse",
        },
      ],
    };
  }
  if (event.button !== "left") {
    return { state, intents: [] };
  }
  if (event.phase === "press") {
    return {
      state:
        region === null
          ? { ...state, pressedRegionId: null, pressedGeometryKey: null }
          : {
              ...state,
              focus: focusForRegion(region),
              focusedRegionId: region.id,
              pressedRegionId: region.id,
              pressedGeometryKey: frame.geometryKey,
            },
      intents: [],
    };
  }
  if (
    event.phase === "drag" &&
    state.pressedRegionId === "splitter" &&
    state.pressedGeometryKey === frame.geometryKey &&
    frame.splitterBounds !== null
  ) {
    const target = Math.min(
      frame.splitterBounds.maxY,
      Math.max(frame.splitterBounds.minY, event.y),
    );
    const range = frame.splitterBounds.maxY - frame.splitterBounds.minY;
    return {
      state: {
        ...state,
        splitterRatio:
          range === 0 ? state.splitterRatio : (target - frame.splitterBounds.minY) / range,
      },
      intents: [],
    };
  }
  if (event.phase === "release") {
    const activate =
      region !== null &&
      region.kind !== "splitter" &&
      state.pressedRegionId === region.id &&
      state.pressedGeometryKey === frame.geometryKey;
    const selectedView = region === null ? null : viewForTab(region.id);
    return {
      state: {
        ...state,
        pressedRegionId: null,
        pressedGeometryKey: null,
        activeView: selectedView ?? state.activeView,
      },
      intents: activate && selectedView === null
        ? [
            {
              kind: "activate-region",
              regionId: region.id,
              provenance: "mouse",
            },
          ]
        : [],
    };
  }
  return { state, intents: [] };
}

export type MouseModeOwner = {
  readonly mouseCapture: boolean;
  setMouseCapture(enabled: boolean): void;
};

export function applyConsoleTerminalIntent(
  state: ConsoleState,
  intent: ConsoleIntent | undefined,
  terminal: MouseModeOwner,
): ConsoleState {
  if (intent?.kind !== "set-mouse-capture") {
    return state;
  }
  terminal.setMouseCapture(intent.enabled);
  return { ...state, mouseCapture: terminal.mouseCapture };
}

export type FabricHitBinding = Readonly<{
  view: FabricView;
  itemId: string;
  itemRevision: Revision;
  projectionRevision: Revision;
}>;

export type FabricHitRegion = Readonly<{
  id: string;
  kind: "tab" | "row" | "action" | "detach" | "pager" | "splitter";
  rect: Rect;
  enabled: boolean;
  geometryKey: string;
  binding: FabricHitBinding | null;
}>;

export type FabricConsoleFrame = Readonly<{
  columns: number;
  rows: readonly string[];
  mode: FabricResponsiveMode;
  geometryKey: string;
  hitRegions: readonly FabricHitRegion[];
  presentation: FabricConsolePresentation;
}>;

function fabricDimensions(viewport: FabricViewport): Readonly<{
  columns: number;
  rows: number;
}> {
  const columns = viewport.columns;
  const rows = viewport.rows;
  if (
    columns === undefined ||
    rows === undefined ||
    !Number.isFinite(columns) ||
    !Number.isFinite(rows) ||
    columns < 0 ||
    rows < 0
  ) {
    return { columns: 0, rows: 0 };
  }
  const width = Math.trunc(columns);
  const height = Math.trunc(rows);
  if (
    width > MAX_FRAME_CELLS ||
    height > MAX_FRAME_CELLS ||
    width * height > MAX_FRAME_CELLS
  ) {
    return { columns: 0, rows: 0 };
  }
  return { columns: width, rows: height };
}

function fabricGeometryKey(
  columns: number,
  rows: number,
  dataset: FabricConsoleDataset,
  controller: ConsoleControllerState,
): string {
  const revisions = dataset.pages[controller.activeView].rows
    .map((row) => `${row.stableId}@${row.revision}`)
    .join(",");
  return `${String(columns)}x${String(rows)}:r${dataset.snapshotRevision ?? "none"}:${controller.activeView}:${revisions}`;
}

function setFabricRow(
  rows: string[],
  row: number,
  columns: number,
  value: string,
): void {
  if (row < 1 || row > rows.length) return;
  rows[row - 1] = fitCells(chromeText(value), columns);
}

function presentedBinding(
  dataset: FabricConsoleDataset,
  row: PresentedRow,
): FabricHitBinding | null {
  return dataset.snapshotRevision === null
    ? null
    : {
        view: row.view,
        itemId: row.stableId,
        itemRevision: row.revision,
        projectionRevision: dataset.snapshotRevision,
      };
}

function reviewBinding(
  presentation: FabricConsolePresentation,
): FabricHitBinding | null {
  const review = presentation.review;
  return review === null
    ? null
    : {
        view: presentation.activeView,
        itemId: review.itemId,
        itemRevision: review.itemRevision,
        projectionRevision: review.projectionRevision,
      };
}

function renderFabricHeader(
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

function renderFabricTabs(
  rows: string[],
  columns: number,
  presentation: FabricConsolePresentation,
  geometryKey: string,
  hitRegions: FabricHitRegion[],
  row = 4,
): void {
  const shortLabels: Readonly<Record<FabricView, string>> = {
    attention: "Attn",
    project: "Proj",
    runs: "Runs",
    work: "Work",
    agents: "Agents",
    evidence: "Evid",
    activity: "Act",
    system: "Sys",
  };
  let line = "";
  let x = 1;
  for (const view of presentation.views) {
    const id = `view:${view.view}`;
    const focused = presentation.focusId === id;
    const label = `${focused ? ">" : ""}${view.key}:${shortLabels[view.view]}${view.active ? "*" : ""}`;
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

function rowText(row: PresentedRow, focused: boolean): string {
  return `${focused ? ">" : " "}${row.selected ? "*" : " "}${row.urgencyMarker.padEnd(2, " ")} ${row.primary} | ${row.secondary} | ${row.freshness} | r${row.revision}`;
}

function renderFabricMaster(
  rows: string[],
  columns: number,
  presentation: FabricConsolePresentation,
  dataset: FabricConsoleDataset,
  ui: FabricConsoleUiState,
  geometryKey: string,
  hitRegions: FabricHitRegion[],
  bounds: Rect,
): void {
  const offset = Math.max(
    0,
    Math.trunc(ui.scrollOffsetByView[presentation.activeView] ?? 0),
  );
  const visibleRows = presentation.masterRows.slice(
    offset,
    offset + (bounds.y2 - bounds.y1 + 1),
  );
  for (const [index, item] of visibleRows.entries()) {
    const y = bounds.y1 + index;
    const id = `row:${item.view}:${item.stableId}`;
    const text = rowText(item, presentation.focusId === id);
    if (bounds.x1 === 1 && bounds.x2 === columns) {
      setFabricRow(rows, y, columns, text);
    } else {
      const existing = rows[y - 1] ?? " ".repeat(columns);
      const leftWidth = bounds.x2 - bounds.x1 + 1;
      const right = existing.slice(bounds.x2);
      rows[y - 1] = `${fitCells(chromeText(text), leftWidth)}${right}`;
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
  if (presentation.masterRows.length === 0) {
    const message = "No projected items in this view.";
    if (bounds.x1 === 1 && bounds.x2 === columns) {
      setFabricRow(rows, bounds.y1, columns, message);
    } else {
      const rightWidth = columns - bounds.x2;
      rows[bounds.y1 - 1] = `${fitCells(message, bounds.x2)}${" ".repeat(rightWidth)}`;
    }
  }
}

function renderFabricDetail(
  rows: string[],
  columns: number,
  presentation: FabricConsolePresentation,
  bounds: Rect,
): void {
  const lines = presentation.detail?.lines ?? [
    { label: "Detail", value: "Select an item to inspect canonical facts." },
  ];
  for (const [index, detail] of lines
    .slice(0, bounds.y2 - bounds.y1 + 1)
    .entries()) {
    const y = bounds.y1 + index;
    const value = `${detail.label}: ${detail.value}`;
    if (bounds.x1 === 1 && bounds.x2 === columns) {
      setFabricRow(rows, y, columns, value);
    } else {
      const left = (rows[y - 1] ?? " ".repeat(columns)).slice(0, bounds.x1 - 1);
      rows[y - 1] = `${left}${fitCells(chromeText(value), bounds.x2 - bounds.x1 + 1)}`;
    }
  }
}

function reviewLines(presentation: FabricConsolePresentation): readonly string[] {
  const review = presentation.review;
  if (review === null) return [];
  const lines = [
    `REVIEW ${review.stage.toUpperCase()} — ${review.consequenceClass}`,
    `Item: ${review.itemId}`,
    `Projection revision: ${review.projectionRevision} | Item revision: ${review.itemRevision} | Preview revision: ${review.previewRevision}`,
    `Preview:${review.previewDigest}`,
    `Intent:${review.intentDigest}`,
    `Before:${review.beforeStateDigest}`,
    `Confirmation: ${review.confirmationMode}`,
    ...review.intent.map((item) => {
      const prefixes: Readonly<Record<string, string>> = {
        "Accepted receipt": "Receipt",
        "Accepted receipt digest": "RcptDig",
        "Artifact digest": "Artifact",
        "Promotion action": "Action",
        "Promotion target": "Target",
      };
      return `${prefixes[item.label] ?? `Intent ${item.label}`}:${item.value}`;
    }),
  ];
  for (const gate of review.gates) {
    lines.push(
      `Gate ${gate.gateId} r${gate.gateRevision} | Scope ${gate.scope}`,
      `Question: ${gate.question}`,
      `Reason: ${gate.reason}`,
      `Recommendation: ${gate.recommendation}`,
      ...gate.consequences.map((value) => `Consequence: ${value}`),
      ...gate.evidence.map((value) => `Evidence: ${value}`),
    );
  }
  lines.push(...review.evidence.map((value) => `Preview evidence: ${value}`));
  lines.push(
    ...review.changes.map(
      (change) => `CHANGED ${change.field}: ${change.before} -> ${change.after}`,
    ),
  );
  if (review.receipt !== null) {
    lines.push(
      `Receipt command: ${review.receipt.commandId}`,
      "After-state digest:",
      review.receipt.afterStateDigest,
      `Effect: ${review.receipt.effect ?? "none"}`,
      `Committed: ${review.receipt.committedAt}`,
    );
  }
  return lines;
}

function renderFabricReview(
  rows: string[],
  columns: number,
  presentation: FabricConsolePresentation,
  bounds: Rect,
): void {
  const lines = reviewLines(presentation);
  const visibleCount = bounds.y2 - bounds.y1 + 1;
  const offset = Math.min(
    presentation.reviewScrollOffset,
    Math.max(0, lines.length - visibleCount),
  );
  for (const [index, line] of lines
    .slice(offset, offset + visibleCount)
    .entries()) {
    setFabricRow(rows, bounds.y1 + index, columns, line);
  }
}

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
): void {
  if (presentation.actions.length === 0) {
    setFabricRow(
      rows,
      row,
      columns,
      presentation.connection === "LIVE"
        ? "Actions: select an actionable item"
        : `Actions disabled: ${presentation.connection}`,
    );
    return;
  }
  let line = "";
  let x = 1;
  for (const [index, action] of presentation.actions.entries()) {
    const marker = presentation.focusId === action.id ? ">" : "";
    const label = `${marker}[${String(index + 1)} ${action.label}]${action.enabled ? "" : "(disabled)"}`;
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
    });
    x = x1 + width;
  }
  setFabricRow(rows, row, columns, line);
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
  setFabricRow(
    rows,
    statusRow,
    columns,
    presentation.notice ??
      (presentation.failureCode === null
        ? `V:${presentation.activeView} F:${presentation.focusId ?? "browse"} ${presentation.connection} r${dataset.snapshotRevision ?? "?"} MOUSE:${presentation.mouseCapture ? "ON" : "OFF"} DROP:${String(presentation.rejectedInputCount)}${presentation.review === null ? "" : ` REVIEW+${String(presentation.reviewScrollOffset)}`}`
        : `Action failed: ${presentation.failureCode}`),
  );
  const help = "? help | [ ] views | PgUp/PgDn | q detach";
  setFabricRow(rows, helpRow, columns, help);
  const detachIndex = help.indexOf("q detach");
  if (detachIndex >= 0 && detachIndex + 8 <= columns) {
    hitRegions.push({
      id: "detach",
      kind: "detach",
      rect: {
        x1: detachIndex + 1,
        y1: helpRow,
        x2: detachIndex + 8,
        y2: helpRow,
      },
      enabled: true,
      geometryKey,
      binding: null,
    });
  }
}

function renderFabricStrip(
  rows: string[],
  columns: number,
  presentation: FabricConsolePresentation,
  dataset: FabricConsoleDataset,
  geometryKey: string,
  hitRegions: FabricHitRegion[],
): void {
  const header = presentation.header;
  setFabricRow(
    rows,
    1,
    columns,
    `P:${header.project} R:${header.run} ${presentation.connection}`,
  );
  const top = presentation.topAttention ?? presentation.masterRows[0];
  if (top !== undefined && rows.length >= 2) {
    setFabricRow(rows, 2, columns, rowText(top, false));
    hitRegions.push({
      id: `row:${top.view}:${top.stableId}`,
      kind: "row",
      rect: { x1: 1, y1: 2, x2: columns, y2: 2 },
      enabled: true,
      geometryKey,
      binding: presentedBinding(dataset, top),
    });
  }
  if (rows.length >= 3) {
    setFabricRow(
      rows,
      rows.length - 1,
      columns,
      `Health:${header.health} Attn:${String(header.attentionCount)} Next:${header.nextMilestone}`,
    );
    const help = "? help | q detach";
    setFabricRow(rows, rows.length, columns, help);
    if (columns >= 17) {
      hitRegions.push({
        id: "detach",
        kind: "detach",
        rect: { x1: 10, y1: rows.length, x2: 17, y2: rows.length },
        enabled: true,
        geometryKey,
        binding: null,
      });
    }
  }
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
      setFabricRow(
        rows,
        1,
        dimensions.columns,
        dimensions.columns >= 8 ? "q detach" : "",
      );
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
    renderFabricStrip(
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
    };
  }

  renderFabricHeader(rows, dimensions.columns, presentation);
  renderFabricTabs(
    rows,
    dimensions.columns,
    presentation,
    geometryKey,
    hitRegions,
  );
  const actionRow = dimensions.rows - 2;
  const body: Rect = {
    x1: 1,
    y1: 5,
    x2: dimensions.columns,
    y2: Math.max(5, actionRow - 1),
  };
  if (presentation.review !== null) {
    renderFabricReview(rows, dimensions.columns, presentation, body);
  } else if (mode === "wide") {
    const masterWidth = Math.min(
      dimensions.columns - 32,
      Math.max(32, Math.round(dimensions.columns * ui.splitterRatio)),
    );
    const master = { ...body, x2: masterWidth };
    const detail = { ...body, x1: masterWidth + 2 };
    renderFabricMaster(
      rows,
      dimensions.columns,
      presentation,
      dataset,
      ui,
      geometryKey,
      hitRegions,
      master,
    );
    for (let y = body.y1; y <= body.y2; y += 1) {
      rows[y - 1] = writeFixedCells(
        rows[y - 1] ?? " ".repeat(dimensions.columns),
        masterWidth + 1,
        1,
        "|",
      );
    }
    hitRegions.push({
      id: "splitter:master-detail",
      kind: "splitter",
      rect: { x1: masterWidth + 1, y1: body.y1, x2: masterWidth + 1, y2: body.y2 },
      enabled: true,
      geometryKey,
      binding: null,
    });
    renderFabricDetail(rows, dimensions.columns, presentation, detail);
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
      hitRegions,
      { ...body, y2: splitRow - 1 },
    );
    setFabricRow(rows, splitRow, dimensions.columns, "==== DETAIL ====");
    hitRegions.push({
      id: "splitter:master-detail",
      kind: "splitter",
      rect: { x1: 1, y1: splitRow, x2: dimensions.columns, y2: splitRow },
      enabled: true,
      geometryKey,
      binding: null,
    });
    renderFabricDetail(rows, dimensions.columns, presentation, {
      ...body,
      y1: splitRow + 1,
    });
  } else if (presentation.compactPane === "master") {
    renderFabricMaster(
      rows,
      dimensions.columns,
      presentation,
      dataset,
      ui,
      geometryKey,
      hitRegions,
      body,
    );
  } else {
    renderFabricDetail(rows, dimensions.columns, presentation, body);
  }
  renderFabricActions(
    rows,
    dimensions.columns,
    actionRow,
    presentation,
    dataset,
    geometryKey,
    hitRegions,
  );
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

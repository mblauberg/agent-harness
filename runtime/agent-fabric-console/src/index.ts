import stringWidth from "string-width";
import { splitGraphemes } from "unicode-segmenter/grapheme";
import type { TerminalInputEvent } from "./input.js";

export * from "./input.js";
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
      : columns >= 20 && rowCount >= 6
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
    chromeText(`P: ${_projection.project} |S: ${_projection.session} |R: ${_projection.run} |r${_projection.revision} |${_projection.freshness} ${_projection.age}`),
    chromeText(`Phase: ${_projection.phase} |Owner: ${_projection.owner} |Health: ${_projection.health} |Attn: ${_projection.attentionCount} |Runs: ${_projection.runCount}`),
    chromeText(`Now: ${_projection.currentMilestone} |Next: ${_projection.nextMilestone} |${_projection.declaredCount}`),
    "Attention Project Runs Work Agents Evidence Activity System |MOUSE:OFF",
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
  const views: readonly ConsoleView[] = [
    "Attention",
    "Project",
    "Runs",
    "Work",
    "Agents",
    "Evidence",
    "Activity",
    "System",
  ];
  let tabX = 1;
  for (const view of views) {
    if (tabX > columns) {
      break;
    }
    const x2 = Math.min(columns, tabX + cellWidth(view) - 1);
    hitRegions.push({
      id: `tab:${view}`,
      kind: "tab",
      rect: { x1: tabX, y1: 4, x2, y2: 4 },
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
    rows[splitterRow - 1] = fitCells(
      `====[ drag split: row ${splitterRow} ]====`,
      columns,
    );
    hitRegions.push({
      id: "splitter",
      kind: "splitter",
      rect: { x1: 1, y1: splitterRow, x2: columns, y2: splitterRow },
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
      line += fitCells(` ${label}`, x2 - x1 + 1);
      hitRegions.push({
        id: `action:${id}`,
        kind: "action",
        rect: { x1, y1: actionRow, x2, y2: actionRow },
      });
      assigned += width;
      x1 = x2 + 1;
    }
    rows[actionRow - 1] = fitCells(line, columns);
  } else {
    rows[actionRow - 1] = fitCells("Actions hidden: grow terminal", columns);
  }

  rows[statusRow - 1] = fitCells(
    _state.pendingCommandId === null
      ? `READY | focus ${_state.focus}`
      : chromeText(`PENDING | ${_state.pendingCommandId}`),
    columns,
  );
  rows[helpRow - 1] = fitCells("? help | q detach", columns);
  const detachStart = Math.max(1, columns - 7);
  hitRegions.push({
    id: "detach",
    kind: "detach",
    rect: { x1: detachStart, y1: helpRow, x2: columns, y2: helpRow },
  });

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
  | Readonly<{ kind: "detach"; provenance: "keyboard" }>
  | Readonly<{
      kind: "scroll";
      regionId: string | null;
      delta: -1 | 1;
      provenance: "mouse";
    }>;

export type ConsoleReduction = Readonly<{
  state: ConsoleState;
  intents: readonly ConsoleIntent[];
}>;

function regionAt(frame: ConsoleFrame, x: number, y: number): HitRegion | null {
  return (
    frame.hitRegions.find(
      ({ rect }) => x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2,
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

export function reduceConsoleInput(
  state: ConsoleState,
  event: TerminalInputEvent,
  frame: ConsoleFrame,
): ConsoleReduction {
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
          mouseCapture: !state.mouseCapture,
          pressedRegionId: null,
          pressedGeometryKey: null,
        },
        intents: [],
      };
    }
    if (event.key === "ctrl-c") {
      return {
        state,
        intents: [{ kind: "detach", provenance: "keyboard" }],
      };
    }
    if (
      state.focus === "splitter" &&
      (event.key === "up" || event.key === "down") &&
      frame.splitterBounds !== null
    ) {
      const splitter = frame.hitRegions.find(({ id }) => id === "splitter");
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
    }
    if (event.key === "enter" && state.focusedRegionId !== null) {
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
      state.pressedRegionId === region.id &&
      state.pressedGeometryKey === frame.geometryKey;
    return {
      state: { ...state, pressedRegionId: null, pressedGeometryKey: null },
      intents: activate
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

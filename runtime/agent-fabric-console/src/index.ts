import stringWidth from "string-width";
import { splitGraphemes } from "unicode-segmenter/grapheme";
import type {
  GitPathPage,
  GitRepositoryProjection,
} from "@local/agent-fabric-protocol";
import type { TerminalInputEvent } from "./input.js";
import { presentMessageBodyWindow, presentSafeTextWindow } from "./message.js";
import type { ConsoleControllerState } from "./controller.js";
import type { FabricView, Revision } from "./model.js";
import {
  matchesArtifactConfirmation,
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
export * from "./snapshot.js";
export * from "./terminal.js";
export * from "./workflow.js";
export * from "./typed-entry-planner.js";

export const UNICODE_POLICY = Object.freeze({
  segmentation: "unicode-segmenter@0.17.0",
  width: "string-width@8.2.2",
  ambiguousWidth: "narrow",
} as const);

export const MAX_FRAME_CELLS = 250_000;

export type Rect = Readonly<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}>;

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

const CAPABILITY_VALUE_PATTERN =
  /\b(?:afb|afc|afop)_[A-Za-z0-9._~+/=-]{4,}\b/gu;

function safeDraftText(text: string): string {
  return chromeText(text).replaceAll(CAPABILITY_VALUE_PATTERN, "[REDACTED]");
}

function tailCells(text: string, columns: number): string {
  if (columns <= 0) return "";
  const clusters = [...splitGraphemes(text)];
  const total = clusters.reduce(
    (sum, grapheme) => sum + cellWidth(grapheme),
    0,
  );
  if (total <= columns) return text;
  const contentLimit = Math.max(0, columns - 1);
  let rendered = "";
  let used = 0;
  for (const grapheme of clusters.toReversed()) {
    const width = cellWidth(grapheme);
    if (used + width > contentLimit) break;
    rendered = grapheme + rendered;
    used += width;
  }
  return `~${rendered}`;
}

function renderedDraftInput(
  presentation: FabricConsolePresentation,
  inputId: string,
  columns: number,
): string {
  const marker = presentation.focusId === inputId ? ">" : " ";
  const byteCount = ` ${String(Buffer.byteLength(presentation.draft))}B`;
  const cursor = "▏";
  const tailWidth = Math.max(
    0,
    columns - cellWidth(marker) - cellWidth(cursor) - cellWidth(byteCount),
  );
  const tail = tailCells(safeDraftText(presentation.draft), tailWidth);
  return fitCells(`${marker}${tail}${cursor}${byteCount}`, columns);
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

export function writeFixedCells(
  row: string,
  start: number,
  width: number,
  value: string,
): string {
  const rowWidth = cellWidth(row);
  if (start < 1 || width < 1 || start > rowWidth) {
    return row;
  }
  const replacementWidth = Math.min(width, rowWidth - start + 1);
  const cells: Array<string | null> = Array.from(
    { length: rowWidth },
    () => " ",
  );
  const place = (text: string, firstCell: number): void => {
    let cursor = firstCell;
    for (const grapheme of graphemes(text)) {
      const graphemeWidth = cellWidth(grapheme);
      if (graphemeWidth <= 0) {
        for (let previous = cursor - 1; previous >= firstCell; previous -= 1) {
          const valueAtCell = cells[previous];
          if (valueAtCell !== null) {
            cells[previous] = `${valueAtCell}${grapheme}`;
            break;
          }
        }
        continue;
      }
      if (cursor < 0 || cursor + graphemeWidth > cells.length) break;
      cells[cursor] = grapheme;
      for (let continuation = 1; continuation < graphemeWidth; continuation += 1) {
        cells[cursor + continuation] = null;
      }
      cursor += graphemeWidth;
    }
  };
  place(row, 0);

  const replacementStart = start - 1;
  const replacementEnd = replacementStart + replacementWidth;
  for (let cell = 0; cell < cells.length;) {
    const grapheme = cells[cell];
    if (grapheme === null || grapheme === undefined) {
      cell += 1;
      continue;
    }
    const graphemeWidth = Math.max(1, cellWidth(grapheme));
    const graphemeEnd = cell + graphemeWidth;
    if (cell < replacementEnd && graphemeEnd > replacementStart) {
      for (let occupied = cell; occupied < graphemeEnd; occupied += 1) {
        cells[occupied] = " ";
      }
    }
    cell = graphemeEnd;
  }
  place(fitCells(value, replacementWidth), replacementStart);
  return cells.filter((cell): cell is string => cell !== null).join("");
}

export type FabricHitBinding = Readonly<{
  view: FabricView;
  itemId: string;
  itemRevision: Revision;
  projectionRevision: Revision;
}>;

export type FabricHitRegion = Readonly<{
  id: string;
  kind: "tab" | "row" | "session" | "action" | "detach" | "pager" | "splitter" | "input";
  rect: Rect;
  enabled: boolean;
  geometryKey: string;
  binding: FabricHitBinding | null;
  shortcut?: string;
  scrollMaximum?: number;
}>;

export type FabricConsoleFrame = Readonly<{
  columns: number;
  rows: readonly string[];
  mode: FabricResponsiveMode;
  geometryKey: string;
  hitRegions: readonly FabricHitRegion[];
  presentation: FabricConsolePresentation;
  reviewCoverage?: FabricReviewCoverageObservation | null;
}>;

export type FabricReviewCoverageObservation = Readonly<{
  reviewKey: string;
  coveredThrough: number;
  requiredEnd: number;
  visibleStart: number;
  visibleEnd: number;
  visibleLineCount: number;
  previousAnchor: number;
  nextAnchor: number;
  endAnchor: number;
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
    !Number.isSafeInteger(columns) ||
    !Number.isSafeInteger(rows) ||
    columns < 0 ||
    rows < 0
  ) {
    return { columns: 0, rows: 0 };
  }
  const width = columns;
  const height = rows;
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
  return review === null || review.workflowId !== null
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
  const sessionChoices =
    presentation.activeView === "project" &&
    dataset.projectSessions?.selectedProjectSessionId === null
      ? dataset.projectSessions.choices
      : [];
  const masterItems = [
    ...sessionChoices.map((choice) => ({ kind: "session" as const, choice })),
    ...presentation.masterRows.map((item) => ({ kind: "row" as const, item })),
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

function renderFabricDetail(
  rows: string[],
  columns: number,
  presentation: FabricConsolePresentation,
  dataset: FabricConsoleDataset,
  ui: FabricConsoleUiState,
  geometryKey: string,
  hitRegions: FabricHitRegion[],
  bounds: Rect,
): void {
  const inspection = dataset.inspection;
  const height = bounds.y2 - bounds.y1 + 1;
  const selected = presentation.masterRows.find(
    (row) => row.stableId === presentation.detail?.stableId,
  );
  const detailId = selected === undefined
    ? null
    : `detail:${presentation.activeView}:${selected.stableId}`;
  let detailScrollMaximum = 0;
  let lines: readonly string[];
  if (
    inspection?.kind === "message" &&
    inspection.binding.view === presentation.activeView &&
    inspection.binding.itemId === presentation.detail?.stableId
  ) {
    if (inspection.state === "current") {
      const window = presentMessageBodyWindow(
        inspection.result,
        {
          columns: Math.max(1, bounds.x2 - bounds.x1 - 5),
          rows: Math.max(1, height - 2),
          offset: Math.max(
            0,
            Math.trunc(ui.detailScrollOffsetByView[presentation.activeView] ?? 0),
          ),
        },
        { sanitizeDisplayText, graphemes, cellWidth },
      );
      detailScrollMaximum = Math.max(0, window.totalLines - 1);
      lines = [
        `Message: ${inspection.result.messageId} r${String(inspection.result.revision)}`,
        "Safety: terminal-neutralised | capability-values-redacted",
        ...window.lines.map((line) => `Body: ${line}`),
      ];
    } else {
      lines = [
        `Message: ${inspection.binding.itemId}`,
        `Read: unavailable | ${inspection.reason}`,
      ];
    }
  } else if (
    inspection?.kind === "artifact" &&
    inspection.binding.view === presentation.activeView &&
    inspection.binding.itemId === presentation.detail?.stableId
  ) {
    if (inspection.state === "current") {
      const result = inspection.result;
      const scope = [
        result.projectSessionId === null ? null : `session:${result.projectSessionId}`,
        result.coordinationRunId === null ? null : `run:${result.coordinationRunId}`,
        result.taskId === null ? null : `task:${result.taskId}`,
      ].filter((value): value is string => value !== null).join(" | ") || "project";
      const confirmed = matchesArtifactConfirmation(
        ui.artifactConfirmation,
        inspection.binding.itemId,
        result,
      );
      const review = result.reviewDisposition === "eligible"
        ? "COMPLETE | Accept/Implement eligible"
        : confirmed
          ? `CONFIRMED ${result.transformation} + ${result.artifactRef.digest}`
        : result.reviewDisposition === "confirm-terminal-neutralised"
          ? `CONFIRM ${result.transformation} + source digest before Accept/Implement`
          : "BLOCKED | hidden source bytes";
      const detailText = [
        `Evidence: ${result.evidenceKind} r${String(result.evidenceRevision)} | ${result.sourceKind}`,
        `Publisher: ${result.publisherKind}:${result.publisherRef} | ${result.createdAt}`,
        `Scope: ${scope}`,
        `Path: ${result.artifactRef.path}`,
        `Source digest: ${result.artifactRef.digest}`,
        `Coverage: ${String(result.coverage.pageCount)}/${String(result.pages.length)} VERIFIED | source ${String(result.totalBytes)}B/${String(result.totalLines)}L | rendered ${String(result.renderedTotalBytes)}B/${String(result.renderedTotalLines)}L`,
        `Rendered digest: ${result.renderedArtifactDigest}`,
        `Transformation: ${result.transformation} | Review: ${review}`,
        "--- CONTENT ---",
        result.content,
      ].join("\n");
      const window = presentSafeTextWindow(
        detailText,
        {
          columns: Math.max(1, bounds.x2 - bounds.x1),
          rows: Math.max(1, height),
          offset: Math.max(
            0,
            Math.trunc(ui.detailScrollOffsetByView[presentation.activeView] ?? 0),
          ),
        },
        { sanitizeDisplayText, graphemes, cellWidth },
      );
      detailScrollMaximum = Math.max(0, window.totalLines - 1);
      lines = window.lines;
    } else {
      lines = [
        `Artifact: ${inspection.binding.itemId}`,
        `Read: unavailable | ${inspection.reason}`,
        "Accept/Implement: DISABLED | complete verified content required",
      ];
    }
  } else if (
    inspection?.kind === "repository" &&
    inspection.binding.view === presentation.activeView &&
    inspection.binding.itemId === presentation.detail?.stableId
  ) {
    if (inspection.state === "current") {
      const offset = Math.max(
        0,
        Math.trunc(ui.detailScrollOffsetByView[presentation.activeView] ?? 0),
      );
      const window = presentSafeTextWindow(
        repositoryDetailLines(inspection.repository).join("\n"),
        {
          columns: Math.max(1, bounds.x2 - bounds.x1),
          rows: Math.max(1, height),
          offset,
        },
        { sanitizeDisplayText, graphemes, cellWidth },
      );
      detailScrollMaximum = Math.max(0, window.totalLines - 1);
      lines = window.lines;
    } else {
      lines = [
        `Repository: ${inspection.binding.itemId}`,
        `Read: unavailable | ${inspection.reason}`,
      ];
    }
  } else {
    const detailText = (presentation.detail?.lines ?? [
      { label: "Detail", value: "Select an item to inspect canonical facts." },
    ]).map((detail) => `${detail.label}: ${detail.value}`).join("\n");
    const window = presentSafeTextWindow(
      detailText,
      {
        columns: Math.max(1, bounds.x2 - bounds.x1),
        rows: Math.max(1, height),
        offset: Math.max(
          0,
          Math.trunc(ui.detailScrollOffsetByView[presentation.activeView] ?? 0),
        ),
      },
      { sanitizeDisplayText, graphemes, cellWidth },
    );
    detailScrollMaximum = Math.max(0, window.totalLines - 1);
    lines = window.lines;
  }
  for (const [index, value] of lines.slice(0, height).entries()) {
    const y = bounds.y1 + index;
    const displayed = index === 0 && presentation.focusId === detailId
      ? `>${value}`
      : value;
    if (bounds.x1 === 1 && bounds.x2 === columns) {
      setFabricRow(rows, y, columns, displayed);
    } else {
      rows[y - 1] = writeFixedCells(
        rows[y - 1] ?? " ".repeat(columns),
        bounds.x1,
        bounds.x2 - bounds.x1 + 1,
        chromeText(displayed),
      );
    }
  }
  if (selected !== undefined && detailId !== null) {
    hitRegions.push({
      id: detailId,
      kind: "pager",
      rect: bounds,
      enabled: true,
      geometryKey,
      binding: presentedBinding(dataset, selected),
      scrollMaximum: detailScrollMaximum,
    });
  }
}

function gitPathLines(label: string, page: GitPathPage): readonly string[] {
  return [
    `${label}: ${String(page.paths.length)}${page.truncated ? " | TRUNCATED" : ""}`,
    ...page.paths.map((path) => `${label} path: ${path}`),
  ];
}

function hostedCheckLines(
  hosted: GitRepositoryProjection["hostedChecks"],
): readonly string[] {
  const header = `GitHub checks: ${hosted.freshness.toUpperCase()} r${String(hosted.revision)} @ ${hosted.observedAt}`;
  if (hosted.freshness === "unavailable") {
    return [`${header} | ${hosted.reason}`];
  }
  if (hosted.freshness === "conflict") {
    return [
      `${header} | ${String(hosted.candidates.length)} candidates`,
      ...hosted.candidates.map(
        (candidate) =>
          candidate === null
            ? "GitHub candidate: none"
            : `GitHub candidate: ${candidate.repository} | ${candidate.headObjectDigest} | ${candidate.state} ${String(candidate.passing)}/${String(candidate.total)}`,
      ),
    ];
  }
  if (hosted.value === null) return [`${header} | none`];
  return [
    `${header} | ${hosted.value.state} ${String(hosted.value.passing)}/${String(hosted.value.total)}`,
    `GitHub target: ${hosted.value.repository} | ${hosted.value.headObjectDigest}`,
    `GitHub counts: pass ${String(hosted.value.passing)} | fail ${String(hosted.value.failing)} | pending ${String(hosted.value.pending)} | total ${String(hosted.value.total)}`,
  ];
}

function repositoryDetailLines(
  repository: GitRepositoryProjection,
): readonly string[] {
  const head = repository.head.detached
    ? `detached@${repository.head.objectDigest}`
    : `${repository.head.refName}@${repository.head.objectDigest}`;
  const upstream = repository.upstream === null
    ? "none"
    : `${repository.upstream.remoteName}/${repository.upstream.branchName} +${String(repository.upstream.ahead)} -${String(repository.upstream.behind)}`;
  const logLines = repository.log.items.map(
    (entry) => `Log: ${entry.objectDigest} | ${entry.authorTimestamp} | ${entry.subject}`,
  );
  const logCursorLines = repository.log.hasMore
    ? [
        `Next log cursor: state ${repository.log.nextCursor.repositoryStateDigest} | after ${repository.log.nextCursor.afterObjectDigest}`,
      ]
    : [];
  const branchLines = repository.branches.items.map((branch) =>
    `Branch: ${branch.checkedOut ? "*" : " "} ${branch.refName}@${branch.objectDigest}${
      branch.upstream === null
        ? ""
        : ` -> ${branch.upstream.remoteName}/${branch.upstream.branchName}`
    }`,
  );
  const worktreeLines = repository.worktrees.items.map((worktree) =>
    `Worktree: ${worktree.current ? "CURRENT" : "other"}${worktree.locked ? " LOCKED" : ""} | ${worktree.canonicalPath}`,
  );
  return [
    `Git: ${repository.freshness.toUpperCase()} r${String(repository.revision)} | ${repository.operationState.kind}`,
    `Git observed: ${repository.observedAt}`,
    `HEAD: ${head}`,
    `Upstream: ${upstream}`,
    ...hostedCheckLines(repository.hostedChecks),
    `Root: ${repository.canonicalRepositoryRoot}`,
    `Worktree: ${repository.canonicalWorktreePath}`,
    `Repository state: ${repository.repositoryStateDigest}`,
    `State digests: HEAD ${repository.headDigest} | index ${repository.indexDigest}`,
    `State digests: worktree ${repository.worktreeDigest} | remote ${repository.remoteDigest}`,
    ...gitPathLines("Staged", repository.changes.staged),
    ...gitPathLines("Unstaged", repository.changes.unstaged),
    ...gitPathLines("Untracked", repository.changes.untracked),
    ...gitPathLines("Conflicted", repository.changes.conflicted),
    `Diff: ${repository.diff.selector.kind} | ${repository.diff.baseDigest} -> ${repository.diff.targetDigest}`,
    `Diff artifact: ${repository.diff.artifactRef.path}@${repository.diff.artifactRef.digest}`,
    `Log page: ${String(repository.log.items.length)} | ${repository.log.hasMore ? "MORE" : "END"}`,
    ...logLines,
    ...logCursorLines,
    `Branches: ${String(repository.branches.items.length)}${repository.branches.truncated ? " | TRUNCATED" : ""}`,
    ...branchLines,
    `Worktrees: ${String(repository.worktrees.items.length)}${repository.worktrees.truncated ? " | TRUNCATED" : ""}`,
    ...worktreeLines,
  ];
}

type FabricReviewContent = Readonly<{
  lines: readonly string[];
  requiredContextLineCount: number;
}>;

function reviewLines(presentation: FabricConsolePresentation): FabricReviewContent {
  const review = presentation.review;
  if (review === null) return { lines: [], requiredContextLineCount: 0 };
  const scopes = review.gates.map(
    (gate) => `${gate.gateId} r${gate.gateRevision} ${gate.scope}`,
  );
  const consequences = review.gates.flatMap((gate) => gate.consequences);
  const evidence = [...new Set([
    ...review.gates.flatMap((gate) => gate.evidence),
    ...review.evidence,
  ])];
  const gateDecisionLines = review.gates.flatMap((gate) => [
    `Question: ${gate.question}`,
    `Reason: ${gate.reason}`,
    `Recommendation: ${gate.recommendation}`,
  ]);
  const contextLines = [
    `REVIEW ${review.stage.toUpperCase()} | ${review.consequenceClass}`,
    `Revisions: projection r${review.projectionRevision} | item r${review.itemRevision} | preview r${review.previewRevision}`,
    `Scope: ${scopes.join(" | ") || `${presentation.activeView}:${review.itemId}`}`,
    ...gateDecisionLines,
    `Consequence: ${consequences.join(" | ") || review.consequenceClass}`,
    `Evidence: ${evidence.join(" | ") || "none declared"}`,
  ];
  const intentLines = review.intent.map((item) => {
    const prefixes: Readonly<Record<string, string>> = {
      "Accepted receipt": "Receipt",
      "Accepted receipt digest": "RcptDig",
      "Artifact digest": "Artifact",
      "Promotion action": "Action",
      "Promotion target": "Target",
    };
    return `${prefixes[item.label] ?? `Intent ${item.label}`}:${item.value}`;
  });
  const bindingLines = [
    `Preview:${review.previewDigest}`,
    `Intent:${review.intentDigest}`,
    `Before:${review.beforeStateDigest}`,
    `Confirmation: ${review.confirmationMode}`,
  ];
  const requiredContext = [
    ...contextLines,
    ...intentLines,
    ...bindingLines,
  ];
  const lines = [
    ...requiredContext,
    ...(review.workflowId === null
      ? []
      : [
          `Workflow: ${review.summary ?? review.itemId}`,
          `Workflow ID: ${review.workflowId}`,
        ]),
    `Item: ${review.itemId}`,
  ];
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
  if (review.result !== null) lines.push(`Result: ${review.result}`);
  if (review.failure !== null) lines.push(`Failure: ${review.failure}`);
  return {
    lines,
    requiredContextLineCount: requiredContext.length,
  };
}

type WrappedFabricReviewLine = Readonly<{
  value: string;
  start: number;
  end: number;
}>;

function wrapFabricReviewContent(
  content: FabricReviewContent,
  columns: number,
): Readonly<{ lines: readonly WrappedFabricReviewLine[]; requiredEnd: number }> {
  if (columns <= 0) return { lines: [], requiredEnd: 0 };
  const lines: WrappedFabricReviewLine[] = [];
  let cursor = 0;
  let requiredEnd = 0;
  for (const [lineIndex, value] of content.lines.entries()) {
    const safe = chromeText(value);
    const clusters = [...graphemes(safe)];
    let segment = "";
    let segmentWidth = 0;
    let segmentStart = cursor;
    for (const [clusterIndex, cluster] of clusters.entries()) {
      const clusterWidth = cellWidth(cluster);
      if (segment !== "" && segmentWidth + clusterWidth > columns) {
        lines.push({
          value: segment,
          start: segmentStart,
          end: cursor + clusterIndex,
        });
        segment = "";
        segmentWidth = 0;
        segmentStart = cursor + clusterIndex;
      }
      segment += cluster;
      segmentWidth += clusterWidth;
    }
    const logicalEnd = cursor + clusters.length + 1;
    lines.push({ value: segment, start: segmentStart, end: logicalEnd });
    cursor = logicalEnd;
    if (lineIndex + 1 === content.requiredContextLineCount) {
      requiredEnd = cursor;
    }
  }
  return { lines, requiredEnd };
}

function reviewCoverageKey(presentation: FabricConsolePresentation): string {
  const review = presentation.review;
  if (review === null) return "";
  return JSON.stringify([
    review.stage,
    review.workflowId,
    review.itemId,
    review.itemRevision,
    review.projectionRevision,
    review.previewRevision,
    review.previewDigest,
    review.intentDigest,
    review.beforeStateDigest,
  ]);
}

function renderFabricReview(
  rows: string[],
  columns: number,
  presentation: FabricConsolePresentation,
  bounds: Rect,
  geometryKey: string,
  hitRegions: FabricHitRegion[],
  pointerEnabled: boolean,
): Readonly<{
  contextVisible: boolean;
  coverage: FabricReviewCoverageObservation;
}> {
  const content = reviewLines(presentation);
  const wrapped = wrapFabricReviewContent(content, columns);
  const lines = wrapped.lines;
  const visibleCount = bounds.y2 - bounds.y1 + 1;
  const scrollMaximum = Math.max(0, lines.length - visibleCount);
  const requestedAnchor = presentation.reviewScrollOffset;
  const containingLine = lines.findIndex(({ end }) => end > requestedAnchor);
  const offset = Math.min(
    scrollMaximum,
    Math.max(0, containingLine < 0 ? scrollMaximum : containingLine),
  );
  for (const [index, line] of lines
    .slice(offset, offset + visibleCount)
    .entries()) {
    setFabricRow(rows, bounds.y1 + index, columns, line.value);
  }
  if (pointerEnabled && scrollMaximum > 0) {
    hitRegions.push({
      id: "review:scroll",
      kind: "pager",
      rect: bounds,
      enabled: true,
      geometryKey,
      binding: null,
      scrollMaximum,
    });
  }
  const visible = lines.slice(offset, offset + visibleCount);
  const visibleStart = visible[0]?.start ?? 0;
  const visibleEnd = visible.at(-1)?.end ?? 0;
  const reviewKey = reviewCoverageKey(presentation);
  const previous = presentation.reviewCoverage;
  let coveredThrough =
    previous?.reviewKey === reviewKey &&
      previous.requiredEnd === wrapped.requiredEnd
      ? Math.min(previous.coveredThrough, wrapped.requiredEnd)
      : 0;
  if (visibleStart <= coveredThrough) {
    coveredThrough = Math.max(
      coveredThrough,
      Math.min(visibleEnd, wrapped.requiredEnd),
    );
  }
  const stride = Math.max(1, visibleCount - 1);
  return {
    contextVisible: coveredThrough >= wrapped.requiredEnd,
    coverage: {
      reviewKey,
      coveredThrough,
      requiredEnd: wrapped.requiredEnd,
      visibleStart,
      visibleEnd,
      visibleLineCount: visible.length,
      previousAnchor: lines[Math.max(0, offset - stride)]?.start ?? 0,
      nextAnchor: lines[Math.min(scrollMaximum, offset + stride)]?.start ?? 0,
      endAnchor: lines[scrollMaximum]?.start ?? 0,
    },
  };
}

function reviewProgressLabel(
  coverage: FabricReviewCoverageObservation,
  compact = false,
): string {
  const ready = coverage.coveredThrough >= coverage.requiredEnd;
  return compact
    ? `C${String(coverage.coveredThrough)}/${String(coverage.requiredEnd)} ${ready ? "READY" : "LOCK PgDn"}`
    : `REVIEW | Context read ${String(coverage.coveredThrough)}/${String(coverage.requiredEnd)} chars | ${ready ? "Actions ready" : "LOCKED: Home + PgDn unlocks"} | End previews only`;
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
  const compactLabels: Readonly<Record<string, string>> = {
    "review:continue": "Continue",
    "review:cancel": "Cancel",
    "review:confirm": "Confirm",
    "review:refresh": "Refresh",
    "review:observe": "Observe",
    "review:close": "Close",
  };
  const stableReviewShortcuts: Readonly<Record<string, string>> = {
    "review:continue": "1",
    "review:cancel": "2",
    "review:confirm": "3",
  };
  const actionShortcut = (action: PresentedAction, index: number): string =>
    stableReviewShortcuts[action.id] ?? String(index + 1);
  const actionLabel = (action: PresentedAction, index: number, compact: boolean): string => {
    const marker = presentation.focusId === action.id ? ">" : "";
    const text = compact ? compactLabels[action.id] ?? action.label : action.label;
    return `${marker}[${actionShortcut(action, index)} ${action.enabled ? "" : "×"}${text}]`;
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
      shortcut: actionShortcut(action, index),
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
    ? presentation.focusId === "detach" ? ">detach " : "q detach"
    : presentation.focusId === "detach" ? ">Detach " : "[Detach]";
  const prefixWidth = Math.max(0, columns - 9);
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
    rect: { x1: columns - 7, y1: row, x2: columns, y2: row },
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
          :
          (presentation.failureCode === null
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
      : "? help | [ ] view | Enter open | s sessions | e edit | Pg scroll",
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
    : "? help";

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
  const work = selected ?? presentation.topAttention ?? presentation.masterRows[0];
  const topAttention = presentation.topAttention?.stableId === work?.stableId
    ? null
    : presentation.topAttention;
  const fullHeader = [
    `Project:${header.project}`,
    `Session:${header.session}`,
    `Run:${header.run}`,
    `Revision:r${header.revision ?? "?"}`,
    `Fresh:${header.freshness.toUpperCase()}`,
    `Phase:${header.phase}`,
    `Owner:${header.owner}`,
    `Next:${header.nextMilestone}`,
    `Health:${header.health}`,
  ];
  let nextRow = 1;
  const renderWork = (item: PresentedRow): void => {
    if (nextRow > contentEnd) return;
    const id = `row:${item.view}:${item.stableId}`;
    setFabricRow(
      rows,
      nextRow,
      columns,
      rowText(item, presentation.focusId === id),
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
      `P:${header.project} S:${header.session} R:${header.run} r${header.revision ?? "?"} ${header.freshness.toUpperCase()}`,
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
  for (const item of presentation.masterRows) {
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
          ? `${presentation.inputMode.toUpperCase()}:${String(Buffer.byteLength(presentation.draft))}B | Esc | Ctrl-C`
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

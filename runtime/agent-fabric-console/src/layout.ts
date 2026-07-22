import stringWidth from "string-width";
import { splitGraphemes } from "unicode-segmenter/grapheme";

import type { FabricConsolePresentation } from "./presenter-model.js";

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

export type FabricResponsiveMode =
  | "wide"
  | "reference"
  | "compact"
  | "strip"
  | "inert";

export type FabricViewport = Readonly<{
  columns?: number;
  rows?: number;
}>;

export type AttentionDeckLayout = "simultaneous" | "stacked";

export function attentionDeckLayoutFor(
  viewport: FabricViewport,
): AttentionDeckLayout {
  const { columns, rows } = fabricDimensions(viewport);
  return columns >= 100 && rows >= 8 ? "simultaneous" : "stacked";
}

export function cellWidth(text: string): number {
  return stringWidth(text);
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
  return codePoint === 0x061c ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069);
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
    if (codePoint === undefined) continue;
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
  if (columns <= 0) return "";
  const clusters = [...splitGraphemes(text)];
  const total = clusters.reduce(
    (sum, grapheme) => sum + cellWidth(grapheme),
    0,
  );
  if (total <= columns) return text + " ".repeat(columns - total);

  const contentLimit = Math.max(0, columns - 1);
  let rendered = "";
  let used = 0;
  for (const grapheme of clusters) {
    const width = cellWidth(grapheme);
    if (used + width > contentLimit) break;
    rendered += grapheme;
    used += width;
  }
  rendered += "~";
  used += 1;
  return rendered + " ".repeat(columns - used);
}

export function fitCells(text: string, columns: number): string {
  return clipCells(text, columns);
}

export function chromeText(text: string): string {
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

export function renderedDraftInput(
  presentation: FabricConsolePresentation,
  inputId: string,
  columns: number,
): string {
  const marker = presentation.focusId === inputId ? ">" : " ";
  const inputValue = presentation.draft;
  const byteCount = ` ${String(Buffer.byteLength(inputValue))}B`;
  const cursor = "▏";
  const tailWidth = Math.max(
    0,
    columns - cellWidth(marker) - cellWidth(cursor) - cellWidth(byteCount),
  );
  const tail = tailCells(safeDraftText(inputValue), tailWidth);
  return fitCells(`${marker}${tail}${cursor}${byteCount}`, columns);
}

export function composeFields(
  columns: number,
  fields: readonly string[],
  baseWidths: readonly number[],
  minimumWidths: readonly number[],
  expansionOrder: readonly number[],
): string {
  if (fields.length === 0 || columns <= 0) return "";
  const gapCells = fields.length - 1;
  if (columns <= gapCells) return fitCells(fields.join("|"), columns);
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
        if (total === target) break;
      }
    }
    if (!changed) return fitCells(fields.join("|"), columns);
  }
  let expansionIndex = 0;
  while (total < target) {
    const fieldIndex = expansionOrder[expansionIndex % expansionOrder.length];
    if (fieldIndex === undefined || widths[fieldIndex] === undefined) break;
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
  if (start < 1 || width < 1 || start > rowWidth) return row;
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

export function responsiveModeFor(
  viewport: FabricViewport,
): FabricResponsiveMode {
  const dimensions = fabricDimensions(viewport);
  const width = dimensions.columns;
  const height = dimensions.rows;
  if (width === 0 || height === 0 || width < 30 || height < 6) return "inert";
  if (width < 40 || height < 8) return "strip";
  if (width < 80 || height < 24) return "compact";
  if (width >= 120 && height >= 30) return "wide";
  return "reference";
}

export function fabricDimensions(viewport: FabricViewport): Readonly<{
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
  if (
    columns > MAX_FRAME_CELLS ||
    rows > MAX_FRAME_CELLS ||
    columns * rows > MAX_FRAME_CELLS
  ) {
    return { columns: 0, rows: 0 };
  }
  return { columns, rows };
}

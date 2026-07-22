import {
  cellWidth,
  chromeText,
  graphemes,
  type Rect,
} from "./layout.js";
import type { FabricConsolePresentation } from "./presenter.js";
import {
  setFabricRow,
  type FabricHitRegion,
  type FabricReviewCoverageObservation,
} from "./renderer-primitives.js";

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

export function wrapFabricReviewContent(
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

export function renderFabricReview(
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

export function reviewProgressLabel(
  coverage: FabricReviewCoverageObservation,
  compact = false,
): string {
  const ready = coverage.coveredThrough >= coverage.requiredEnd;
  return compact
    ? `C${String(coverage.coveredThrough)}/${String(coverage.requiredEnd)} ${ready ? "READY" : "LOCK PgDn"}`
    : `REVIEW | Context read ${String(coverage.coveredThrough)}/${String(coverage.requiredEnd)} chars | ${ready ? "Actions ready" : "LOCKED: Home + PgDn unlocks"} | End previews only`;
}

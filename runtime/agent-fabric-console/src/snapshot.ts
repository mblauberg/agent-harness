import type { ConsoleControllerState } from "./controller.js";
import { FABRIC_VIEWS } from "./model.js";
import { presentFabricConsole, type FabricConsoleUiState, type FabricViewport } from "./presenter.js";
import type { ConsoleConnectionDiagnosis } from "./connection-diagnosis.js";
import type { FabricConsoleDataset } from "./protocol-adapter.js";

export type ConsoleSnapshotFormat = "json" | "markdown";

export type ConsoleSnapshotInput = Readonly<{
  dataset: FabricConsoleDataset;
  controller: ConsoleControllerState;
  ui: FabricConsoleUiState;
  viewport: FabricViewport;
}>;

const CAPABILITY_VALUE = /\b(?:afb|afc|afop)_[A-Za-z0-9._~+/=-]{4,}\b/gu;
const SENSITIVE_KEY = /credential|capability|token|secret/iu;

function neutraliseText(value: string): string {
  let output = "";
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point === 0x1b) {
      output += "<ESC>";
    } else if (point >= 0x80 && point <= 0x9f) {
      output += `<C1-${point.toString(16).toUpperCase()}>`;
    } else if (point < 0x20 && character !== "\n" && character !== "\t") {
      output += " ";
    } else if (point === 0x7f) {
      output += "<DEL>";
    } else {
      output += character;
    }
  }
  return output.replace(CAPABILITY_VALUE, "[REDACTED capability]");
}

function safeValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED capability]";
  if (typeof value === "string") return neutraliseText(value);
  if (Array.isArray(value)) return value.map((item) => safeValue(item));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, safeValue(item, name)]),
    );
  }
  return value;
}

function snapshotConnectionDiagnosis(
  dataset: FabricConsoleDataset,
): Record<string, unknown> | null {
  const diagnosis = dataset.connectionDiagnosis;
  if (diagnosis === undefined) return null;
  const freshness = (stage: ConsoleConnectionDiagnosis["stages"][number]) => ({
    state: stage.freshness.state,
    source: stage.freshness.source,
    revision: stage.freshness.revision,
    ...("reason" in stage.freshness ? { reason: stage.freshness.reason } : {}),
  });
  return {
    schemaVersion: diagnosis.schemaVersion,
    causalStage: diagnosis.causalStage,
    firstFailureCode: diagnosis.firstFailureCode,
    stages: diagnosis.stages.map((stage) => ({
      id: stage.id,
      label: stage.label,
      state: stage.state,
      code: stage.code,
      summary: stage.summary,
      remediation: stage.remediation,
      source: stage.source,
      revision: stage.revision,
      freshness: freshness(stage),
      references: stage.references,
    })),
  };
}

function snapshotValue(input: ConsoleSnapshotInput): Record<string, unknown> {
  const presentation = presentFabricConsole(
    input.dataset,
    input.controller,
    input.ui,
    input.viewport,
  );
  const views = Object.fromEntries(FABRIC_VIEWS.map((view) => {
    const projected = presentFabricConsole(
      input.dataset,
      { ...input.controller, activeView: view },
      input.ui,
      input.viewport,
    );
    const page = input.dataset.pages[view];
    return [view, {
      rows: projected.masterRows,
      needsYouRows: projected.needsYouRows,
      watchRows: projected.watchRows,
      watchCollapsed: projected.watchCollapsed,
      detail: projected.detail,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      readTransactionId: page.readTransactionId,
    }];
  }));
  return safeValue({
    schemaVersion: 1,
    kind: "agent-fabric-console-snapshot",
    activeView: presentation.activeView,
    inputMode: presentation.inputMode,
    mode: presentation.mode,
    connection: presentation.connection,
    connectionDetail: input.dataset.connection,
    connectionDiagnosis: snapshotConnectionDiagnosis(input.dataset),
    header: presentation.header,
    navigation: presentation.views,
    views,
    actions: presentation.actions,
    review: presentation.review,
    focusId: presentation.focusId,
    mouseCapture: presentation.mouseCapture,
    rejectedInputCount: presentation.rejectedInputCount,
    notice: presentation.notice,
    failureCode: presentation.failureCode,
  }) as Record<string, unknown>;
}

function markdownText(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string") return value.replace(/\r?\n/gu, " ");
  return JSON.stringify(value);
}

function markdownSnapshot(snapshot: Record<string, unknown>): string {
  const header = snapshot.header as Record<string, unknown>;
  const views = snapshot.views as Record<string, Record<string, unknown>>;
  const actions = snapshot.actions as readonly Record<string, unknown>[];
  const review = snapshot.review as Record<string, unknown> | null;
  const activeView = markdownText(snapshot.activeView);
  const title = `${activeView.slice(0, 1).toUpperCase()}${activeView.slice(1)}`;
  const lines = [
    "# Agent Fabric Console snapshot",
    "",
    `- Connection: ${markdownText(snapshot.connection)}`,
    `- Connection detail: ${markdownText(snapshot.connectionDetail)}`,
    `- Mode: ${markdownText(snapshot.mode)}`,
    `- Project: ${markdownText(header.project)}`,
    `- Session: ${markdownText(header.session)}`,
    `- Projection revision: ${markdownText(header.revision)}`,
    `- Active view: ${title}`,
  ];
  for (const [view, projected] of Object.entries(views)) {
    const viewTitle = `${view.slice(0, 1).toUpperCase()}${view.slice(1)}`;
    const rows = projected.rows as readonly Record<string, unknown>[];
    const needsYouRows = projected.needsYouRows as readonly Record<string, unknown>[];
    const watchRows = projected.watchRows as readonly Record<string, unknown>[];
    const detail = projected.detail as Record<string, unknown> | null;
    lines.push("", `## ${viewTitle}`, "");
    if (rows.length === 0) lines.push("No projected rows.");
    for (const row of rows) {
      lines.push(
        `- ${markdownText(row.urgencyMarker)} ${markdownText(row.primary)} — ${markdownText(row.secondary)} (${markdownText(row.freshness)})`,
      );
    }
    if (view === "attention") {
      lines.push(
        `- Needs you: ${String(needsYouRows.length)}`,
        `- Watch: ${String(watchRows.length)} item${watchRows.length === 1 ? "" : "s"} (${projected.watchCollapsed === true ? "collapsed" : "expanded"})`,
      );
    }
    if (detail !== null) {
      lines.push("", "Selected detail:");
      const detailLines = detail.lines as readonly Record<string, unknown>[];
      for (const line of detailLines) {
        lines.push(`- ${markdownText(line.label)}: ${markdownText(line.value)}`);
      }
    }
  }
  lines.push("", "## Actions", "");
  if (actions.length === 0) lines.push("No available actions.");
  for (const action of actions) {
    lines.push(`- ${markdownText(action.label)}: ${action.enabled === true ? "enabled" : "disabled"}`);
  }
  if (review !== null) {
    lines.push(
      "",
      "## Review",
      "",
      `- Stage: ${markdownText(review.stage)}`,
      `- Summary: ${markdownText(review.summary)}`,
      `- Preview digest: ${markdownText(review.previewDigest)}`,
      `- Result: ${markdownText(review.result)}`,
      `- Failure: ${markdownText(review.failure)}`,
    );
  }
  if (snapshot.notice !== null) {
    lines.push("", `Notice: ${markdownText(snapshot.notice)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderConsoleSnapshot(
  input: ConsoleSnapshotInput,
  format: ConsoleSnapshotFormat,
): string {
  const snapshot = snapshotValue(input);
  if (format === "json") return `${JSON.stringify(snapshot, null, 2)}\n`;
  return markdownSnapshot(snapshot);
}

import type {
  OperatorAvailableAction,
  ProjectionFact,
} from "@local/agent-fabric-protocol";

import type {
  ActionReview,
  ConsoleControllerState,
  ReviewGate,
} from "./controller.js";
import {
  FABRIC_VIEWS,
  revisionFromProtocol,
  type ConsoleFreshness,
  type ConsoleRow,
  type ConsoleUrgency,
  type FabricView,
  type Revision,
} from "./model.js";
import type { FabricConsoleDataset } from "./protocol-adapter.js";

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

export type FabricConsoleUiState = Readonly<{
  focusId: string | null;
  compactPane: "master" | "detail";
  draft: string;
  mouseCapture: boolean;
  inputMode: "browse" | "editor" | "palette";
  scrollOffsetByView: Readonly<Partial<Record<FabricView, number>>>;
  rejectedInputCount: number;
  notice: string | null;
}>;

export function createFabricUiState(
  overrides: Partial<FabricConsoleUiState> = {},
): FabricConsoleUiState {
  return {
    focusId: overrides.focusId ?? null,
    compactPane: overrides.compactPane ?? "master",
    draft: overrides.draft ?? "",
    mouseCapture: overrides.mouseCapture ?? false,
    inputMode: overrides.inputMode ?? "browse",
    scrollOffsetByView: overrides.scrollOffsetByView ?? {},
    rejectedInputCount: overrides.rejectedInputCount ?? 0,
    notice: overrides.notice ?? null,
  };
}

const MAX_PRESENTATION_CELLS = 250_000;

export function responsiveModeFor(
  viewport: FabricViewport,
): FabricResponsiveMode {
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
    return "inert";
  }
  const width = Math.trunc(columns);
  const height = Math.trunc(rows);
  if (
    width > MAX_PRESENTATION_CELLS ||
    height > MAX_PRESENTATION_CELLS ||
    width * height > MAX_PRESENTATION_CELLS ||
    width < 12 ||
    height < 3
  ) {
    return "inert";
  }
  if (width < 40 || height < 8) {
    return "strip";
  }
  if (width < 80 || height < 24) {
    return "compact";
  }
  if (width >= 120 && height >= 30) {
    return "wide";
  }
  return "reference";
}

export type PresentedHeader = Readonly<{
  project: string;
  session: string;
  run: string;
  revision: Revision | null;
  freshness: "live" | "snapshot" | "stale" | "unavailable" | "conflict";
  phase: string;
  owner: string;
  nextMilestone: string;
  health: string;
  attentionCount: number;
  runCount: number;
  capacity: string;
}>;

export type PresentedView = Readonly<{
  view: FabricView;
  label: string;
  active: boolean;
  key: string;
}>;

export type PresentedRow = Readonly<{
  view: FabricView;
  stableId: string;
  revision: Revision;
  selected: boolean;
  urgencyMarker: string;
  primary: string;
  secondary: string;
  freshness: string;
  actionable: boolean;
}>;

export type PresentedDetail = Readonly<{
  stableId: string;
  revision: Revision;
  lines: readonly Readonly<{ label: string; value: string }>[];
}>;

export type PresentedAction = Readonly<{
  id: string;
  label: string;
  enabled: boolean;
  availableAction: OperatorAvailableAction | null;
}>;

export type PresentedReviewGate = Readonly<{
  gateId: string;
  gateRevision: Revision;
  scope: string;
  question: string;
  reason: string;
  recommendation: string;
  consequences: readonly string[];
  evidence: readonly string[];
}>;

export type PresentedReview = Readonly<{
  stage: ActionReview["stage"];
  itemId: string;
  itemRevision: Revision;
  projectionRevision: Revision;
  previewRevision: Revision;
  previewDigest: string;
  intentDigest: string;
  beforeStateDigest: string;
  consequenceClass: string;
  confirmationMode: "explicit" | "echo";
  evidence: readonly string[];
  gates: readonly PresentedReviewGate[];
  changes: ActionReview["changes"];
}>;

export type FabricConsolePresentation = Readonly<{
  mode: FabricResponsiveMode;
  connection: string;
  header: PresentedHeader;
  views: readonly PresentedView[];
  activeView: FabricView;
  masterRows: readonly PresentedRow[];
  detail: PresentedDetail | null;
  actions: readonly PresentedAction[];
  review: PresentedReview | null;
  focusId: string | null;
  compactPane: "master" | "detail";
  draft: string;
  mouseCapture: boolean;
  rejectedInputCount: number;
  notice: string | null;
}>;

function titleCase(view: FabricView): string {
  return `${view.slice(0, 1).toUpperCase()}${view.slice(1)}`;
}

function factState<T>(
  fact: ProjectionFact<T> | undefined,
): PresentedHeader["freshness"] {
  return fact?.freshness ?? "unavailable";
}

function factValue<T>(fact: ProjectionFact<T> | undefined): T | null {
  return fact !== undefined &&
    (fact.freshness === "live" ||
      fact.freshness === "snapshot" ||
      fact.freshness === "stale")
    ? fact.value
    : null;
}

const FACT_SEVERITY: Readonly<Record<PresentedHeader["freshness"], number>> = {
  live: 0,
  snapshot: 1,
  stale: 2,
  conflict: 3,
  unavailable: 4,
};

function headerFreshness(
  dataset: FabricConsoleDataset,
): PresentedHeader["freshness"] {
  if (dataset.connection.state === "unsupported" || dataset.snapshot === null) {
    return "unavailable";
  }
  if (dataset.connection.state !== "live") {
    return "stale";
  }
  const states = [
    factState(dataset.snapshot.project),
    factState(dataset.snapshot.session),
    factState(dataset.snapshot.runs),
  ];
  return states.sort((left, right) => FACT_SEVERITY[right] - FACT_SEVERITY[left])[0] ?? "unavailable";
}

function capacityLabel(dataset: FabricConsoleDataset): string {
  const value = factValue(dataset.snapshot?.capacity);
  if (value === null) {
    return "unknown";
  }
  return Object.entries(value)
    .map(([name, capacity]) => {
      if (
        typeof capacity === "object" &&
        capacity !== null &&
        !Array.isArray(capacity)
      ) {
        const used = Reflect.get(capacity, "used");
        const reserved = Reflect.get(capacity, "reserved");
        const limit = Reflect.get(capacity, "limit");
        if (
          typeof used === "number" &&
          typeof reserved === "number" &&
          typeof limit === "number"
        ) {
          return `${name}:${String(used)}+${String(reserved)}/${String(limit)}`;
        }
      }
      return `${name}:declared`;
    })
    .join(" ") || "declared";
}

function presentHeader(dataset: FabricConsoleDataset): PresentedHeader {
  const project = factValue(dataset.snapshot?.project);
  const session = factValue(dataset.snapshot?.session);
  const runs = factValue(dataset.snapshot?.runs) ?? [];
  const activeRun = runs[0];
  return {
    project: project?.projectId ?? "unavailable",
    session: session?.projectSessionId ?? "none",
    run: activeRun?.runId ?? "none",
    revision: dataset.snapshotRevision,
    freshness: headerFreshness(dataset),
    phase: activeRun?.phase ?? session?.state ?? "unknown",
    owner: activeRun?.chairAgentId ?? "unassigned",
    nextMilestone: activeRun?.nextMilestone ?? "not declared",
    health: activeRun?.health ?? "unknown",
    attentionCount: dataset.pages.attention.rows.length,
    runCount: runs.length,
    capacity: capacityLabel(dataset),
  };
}

function ageLabel(ageMs: number): string {
  if (ageMs < 1_000) return "now";
  const seconds = Math.floor(ageMs / 1_000);
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  return `${String(hours)}h`;
}

function freshnessLabel(freshness: ConsoleFreshness): string {
  return `${freshness.state.toUpperCase()} ${ageLabel(freshness.ageMs)}`;
}

const URGENCY_MARKER: Readonly<Record<ConsoleUrgency, string>> = {
  "safety-integrity": "!!",
  "critical-path": "!>",
  "expiring-authority": "!",
  "acceptance-ready": "+",
  advisory: ".",
  normal: " ",
};

function summaryText(row: ConsoleRow): readonly [string, string] {
  const summary = row.summary;
  if (summary === null) {
    const reason =
      row.freshness.state === "unavailable"
        ? row.freshness.reason
        : row.freshness.state === "conflict"
          ? `${String(row.freshness.candidateCount)} conflicting candidates`
          : "detail unavailable";
    return [row.stableId, reason];
  }
  switch (summary.kind) {
    case "attention":
      return [summary.title, `${summary.label} | ${summary.priority}`];
    case "project":
      return [summary.goal, `repository ${summary.repositoryRevision}`];
    case "run":
      return [summary.phase, `${summary.health} | next ${summary.nextMilestone}`];
    case "work":
      return [summary.state, `checks ${summary.checkState}`];
    case "agent":
      return [summary.role, `${summary.lifecycle} | context ${summary.contextPressure}`];
    case "evidence":
      return [summary.evidenceKind, `${summary.status} | ${summary.provenance}`];
    case "activity":
      return [summary.summary, `${summary.activityKind} | ${summary.occurredAt}`];
    case "system":
      return [summary.systemKind, `${summary.state} | ${summary.detail}`];
  }
}

function presentRow(
  row: ConsoleRow,
  selected: boolean,
  canMutate: boolean,
): PresentedRow {
  const [primary, secondary] = summaryText(row);
  return {
    view: row.view,
    stableId: row.stableId,
    revision: row.revision,
    selected,
    urgencyMarker: URGENCY_MARKER[row.urgency],
    primary,
    secondary,
    freshness: freshnessLabel(row.freshness),
    actionable:
      canMutate &&
      row.freshness.state === "live" &&
      row.actionAvailability.state === "available",
  };
}

function detailLines(row: ConsoleRow): PresentedDetail {
  const [primary, secondary] = summaryText(row);
  const lines: Array<Readonly<{ label: string; value: string }>> = [
    { label: "ID", value: row.stableId },
    { label: "Revision", value: row.revision },
    { label: "Kind", value: row.summary?.kind ?? "unavailable" },
    { label: "Summary", value: primary },
    { label: "State", value: secondary },
    { label: "Source", value: row.freshness.source },
    { label: "Freshness", value: freshnessLabel(row.freshness) },
  ];
  if (row.actionAvailability.state === "read-only") {
    lines.push({ label: "Actions", value: `read-only: ${row.actionAvailability.reason}` });
  } else {
    lines.push({ label: "Actions", value: row.actionAvailability.actions.join(", ") });
  }
  return { stableId: row.stableId, revision: row.revision, lines };
}

function actionLabel(action: OperatorAvailableAction): string {
  const labels: Readonly<Record<OperatorAvailableAction, string>> = {
    pause: "Pause",
    resume: "Resume",
    cancel: "Cancel",
    steer: "Steer",
    "project-session-drain": "Drain session",
    "project-session-stop": "Stop session",
    "daemon-drain": "Drain daemon",
    "daemon-stop": "Stop daemon",
    git: "Git operation",
    "registered-external-effect": "External effect",
    promotion: "Promote release",
  };
  return labels[action];
}

function rowActions(
  row: ConsoleRow | null,
  canMutate: boolean,
): readonly PresentedAction[] {
  if (row === null || row.actionAvailability.state !== "available") {
    return [];
  }
  return row.actionAvailability.actions.map((action) => ({
    id: `action:${action}`,
    label: actionLabel(action),
    enabled: canMutate && row.freshness.state === "live",
    availableAction: action,
  }));
}

function scopeLabel(gate: ReviewGate): string {
  const scope = gate.gate.scope;
  if (scope.kind === "task") return `task:${scope.taskId}`;
  if (scope.kind === "subtree") return `subtree:${scope.rootTaskId}`;
  return scope.kind;
}

function presentReviewGate(gate: ReviewGate): PresentedReviewGate {
  return {
    gateId: gate.gateId,
    gateRevision: revisionFromProtocol(gate.gate.revision),
    scope: scopeLabel(gate),
    question: gate.gate.question,
    reason: gate.gate.reason,
    recommendation: gate.gate.recommendation,
    consequences: gate.gate.consequences,
    evidence: gate.gate.evidenceRefs.map(
      (reference) => `${reference.path}@${reference.digest}`,
    ),
  };
}

function presentReview(review: ActionReview): PresentedReview {
  return {
    stage: review.stage,
    itemId: review.binding.itemId,
    itemRevision: review.binding.itemRevision,
    projectionRevision: review.binding.projectionRevision,
    previewRevision: revisionFromProtocol(review.preview.previewRevision),
    previewDigest: review.preview.previewDigest,
    intentDigest: review.preview.intentDigest,
    beforeStateDigest: review.preview.beforeStateDigest,
    consequenceClass: review.preview.consequenceClass,
    confirmationMode: review.preview.confirmationMode,
    evidence: review.preview.evidenceRefs.map(
      (reference) => `${reference.path}@${reference.digest}`,
    ),
    gates: review.gates.map(presentReviewGate),
    changes: review.changes,
  };
}

function reviewActions(review: ActionReview): readonly PresentedAction[] {
  if (review.stage === "review") {
    return [
      { id: "review:continue", label: "Continue to confirmation", enabled: true, availableAction: null },
      { id: "review:cancel", label: "Cancel Review", enabled: true, availableAction: null },
    ];
  }
  if (review.stage === "confirm") {
    return [
      {
        id: "review:confirm",
        label: review.preview.confirmationMode === "echo" ? "Confirm exact digest" : "Confirm action",
        enabled: true,
        availableAction: null,
      },
      { id: "review:cancel", label: "Cancel Review", enabled: true, availableAction: null },
    ];
  }
  if (review.stage === "conflict") {
    return [
      { id: "review:refresh", label: "Review changed state", enabled: true, availableAction: null },
      { id: "review:cancel", label: "Cancel Review", enabled: true, availableAction: null },
    ];
  }
  return [
    { id: "review:observe", label: "Observe command status", enabled: true, availableAction: null },
    { id: "review:close", label: "Close Review", enabled: true, availableAction: null },
  ];
}

export function presentFabricConsole(
  dataset: FabricConsoleDataset,
  controller: ConsoleControllerState,
  ui: FabricConsoleUiState,
  viewport: FabricViewport,
): FabricConsolePresentation {
  const activeRows = dataset.pages[controller.activeView].rows;
  const selected = controller.selectionByView[controller.activeView];
  const selectedRow =
    selected === null
      ? null
      : activeRows.find((candidate) => candidate.stableId === selected.stableId) ?? null;
  const review = controller.review;
  return {
    mode: responsiveModeFor(viewport),
    connection:
      dataset.connection.state === "live"
        ? "LIVE"
        : dataset.connection.state.toUpperCase(),
    header: presentHeader(dataset),
    views: FABRIC_VIEWS.map((view, index) => ({
      view,
      label: titleCase(view),
      active: view === controller.activeView,
      key: String(index + 1),
    })),
    activeView: controller.activeView,
    masterRows: activeRows.map((candidate) =>
      presentRow(
        candidate,
        candidate.stableId === selected?.stableId,
        dataset.canMutate && dataset.connection.state === "live",
      ),
    ),
    detail: selectedRow === null ? null : detailLines(selectedRow),
    actions:
      review === null
        ? rowActions(
            selectedRow,
            dataset.canMutate && dataset.connection.state === "live",
          )
        : reviewActions(review),
    review: review === null ? null : presentReview(review),
    focusId: ui.focusId,
    compactPane: ui.compactPane,
    draft: ui.draft,
    mouseCapture: ui.mouseCapture,
    rejectedInputCount: ui.rejectedInputCount,
    notice: ui.notice,
  };
}

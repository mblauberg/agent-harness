import type {
  OperatorAvailableAction,
  OperatorActionIntent,
  ProjectionFact,
} from "@local/agent-fabric-protocol";

import { parseArtifactReferenceDraft } from "./action-input.js";
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
  type ConsoleWorkflowCapability,
  type GuidedWorkflowAction,
  type FabricView,
  type Revision,
} from "./model.js";
import type {
  ConsoleArtifactContentResult,
  ConsoleInspectionBinding,
  FabricConsoleDataset,
} from "./protocol-adapter.js";
import type { ConsoleWorkflowReview } from "./workflow.js";

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
  inputMode: "browse" | "editor" | "palette" | "guided";
  scrollOffsetByView: Readonly<Partial<Record<FabricView, number>>>;
  detailScrollOffsetByView: Readonly<Partial<Record<FabricView, number>>>;
  rejectedInputCount: number;
  notice: string | null;
  splitterRatio: number;
  reviewScrollOffset: number;
  workflowReview: ConsoleWorkflowReview | null;
  artifactConfirmation: ArtifactReviewConfirmation | null;
  guidedWorkflow: ConsoleGuidedWorkflowDraft | null;
}>;

export type ConsoleGuidedWorkflowDraft = Readonly<{
  action: GuidedWorkflowAction;
  binding: ConsoleInspectionBinding;
  prompt: string;
}>;

export type ArtifactReviewConfirmation = Readonly<{
  evidenceId: string;
  evidenceRevision: number;
  sourceDigest: string;
  renderedDigest: string;
  transformation: "terminal-neutralised";
  pageCount: number;
}>;

export function createFabricUiState(
  overrides: Partial<FabricConsoleUiState> = {},
): FabricConsoleUiState {
  const requestedSplitter = overrides.splitterRatio;
  return {
    focusId: overrides.focusId ?? null,
    compactPane: overrides.compactPane ?? "master",
    draft: overrides.draft ?? "",
    mouseCapture: overrides.mouseCapture ?? false,
    inputMode: overrides.inputMode ?? "browse",
    scrollOffsetByView: overrides.scrollOffsetByView ?? {},
    detailScrollOffsetByView: overrides.detailScrollOffsetByView ?? {},
    rejectedInputCount: overrides.rejectedInputCount ?? 0,
    notice: overrides.notice ?? null,
    splitterRatio:
      requestedSplitter === undefined || !Number.isFinite(requestedSplitter)
        ? 0.45
        : Math.min(0.75, Math.max(0.25, requestedSplitter)),
    reviewScrollOffset:
      overrides.reviewScrollOffset === undefined ||
      !Number.isSafeInteger(overrides.reviewScrollOffset)
        ? 0
        : Math.max(0, overrides.reviewScrollOffset),
    workflowReview: overrides.workflowReview ?? null,
    artifactConfirmation: overrides.artifactConfirmation ?? null,
    guidedWorkflow: overrides.guidedWorkflow ?? null,
  };
}

export function matchesArtifactConfirmation(
  confirmation: ArtifactReviewConfirmation | null,
  evidenceId: string,
  result: ConsoleArtifactContentResult,
): boolean {
  return confirmation !== null &&
    result.reviewDisposition === "confirm-terminal-neutralised" &&
    confirmation.evidenceId === evidenceId &&
    confirmation.evidenceRevision === result.evidenceRevision &&
    confirmation.sourceDigest === result.artifactRef.digest &&
    confirmation.renderedDigest === result.renderedArtifactDigest &&
    confirmation.transformation === result.transformation &&
    confirmation.pageCount === result.coverage.pageCount;
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
  reason?: string;
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
  intent: readonly Readonly<{ label: string; value: string }>[];
  evidence: readonly string[];
  gates: readonly PresentedReviewGate[];
  changes: ActionReview["changes"];
  receipt: Readonly<{
    commandId: string;
    afterStateDigest: string;
    effect: string | null;
    committedAt: string;
  }> | null;
  workflowId: string | null;
  summary: string | null;
  result: string | null;
  failure: string | null;
}>;

export type FabricConsolePresentation = Readonly<{
  mode: FabricResponsiveMode;
  connection: string;
  header: PresentedHeader;
  views: readonly PresentedView[];
  activeView: FabricView;
  masterRows: readonly PresentedRow[];
  topAttention: PresentedRow | null;
  detail: PresentedDetail | null;
  actions: readonly PresentedAction[];
  review: PresentedReview | null;
  focusId: string | null;
  compactPane: "master" | "detail";
  draft: string;
  inputMode: FabricConsoleUiState["inputMode"];
  mouseCapture: boolean;
  rejectedInputCount: number;
  notice: string | null;
  failureCode: string | null;
  reviewScrollOffset: number;
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
  const sessionChoices = dataset.projectSessions?.choices ?? [];
  return {
    project: project?.projectId ?? "unavailable",
    session: session?.projectSessionId ?? (
      sessionChoices.length === 0
        ? "none"
        : `choose:${String(sessionChoices.length)}`
    ),
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
      if (summary.nativeNotification.kind === "feature-unavailable") {
        return [
          summary.title,
          `${summary.label} | ${summary.priority} | notify unavailable/feature-not-negotiated`,
        ];
      }
      return [
        summary.title,
        `${summary.label} | ${summary.priority} | notify ${summary.nativeNotification.status}/${summary.nativeNotification.journalState}`,
      ];
    case "project":
      return [
        summary.goal,
        summary.acceptedScopeRef === null
          ? `scope unaccepted | repository ${summary.repositoryRevision}`
          : `scope ${summary.acceptedScopeRef.path}@${summary.acceptedScopeRef.digest} | repository ${summary.repositoryRevision}`,
      ];
    case "run":
      if (summary.projectSessionId === undefined) {
        throw new TypeError("exact run projection has no project-session identity");
      }
      return [
        `${summary.projectSessionId} | ${summary.phase}`,
        `${summary.health} | next ${summary.nextMilestone}`,
      ];
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
  ];
  if (row.summary?.kind === "attention") {
    const notification = row.summary.nativeNotification;
    if (notification.kind === "feature-unavailable") {
      lines.push({
        label: "Native notification",
        value: "unavailable | feature-not-negotiated",
      });
    } else {
      lines.push(
        {
          label: "Native notification",
          value: `${notification.status} | journal ${notification.journalState}`,
        },
        {
          label: "Notification basis",
          value: `integration ${notification.integrationState} | delivery ${
            notification.deliveryItemRevision === null
              ? "missing"
              : `r${String(notification.deliveryItemRevision)}`
          } | claim ${
            notification.claimGeneration === null
              ? "none"
              : `g${String(notification.claimGeneration)}`
          } | observed ${notification.observedAt}`,
        },
      );
    }
  }
  lines.push(
    { label: "Source", value: row.freshness.source },
    { label: "Freshness", value: freshnessLabel(row.freshness) },
  );
  if (row.actionAvailability.state === "read-only") {
    lines.push({ label: "Actions", value: `read-only: ${row.actionAvailability.reason}` });
  } else {
    lines.push({ label: "Actions", value: row.actionAvailability.actions.join(", ") });
  }
  if (row.summary?.kind === "project") {
    lines.push({
      label: "Accepted scope",
      value: row.summary.acceptedScopeRef === null
        ? "unaccepted"
        : `${row.summary.acceptedScopeRef.path}@${row.summary.acceptedScopeRef.digest}`,
    });
  }
  if (row.summary?.kind === "run") {
    if (row.summary.projectSessionId === undefined) {
      throw new TypeError("exact run projection has no project-session identity");
    }
    lines.push({
      label: "Project session",
      value: row.summary.projectSessionId,
    });
  }
  return { stableId: row.stableId, revision: row.revision, lines };
}

function actionLabel(action: OperatorAvailableAction): string {
  const labels: Readonly<Record<OperatorAvailableAction, string>> = {
    pause: "Pause",
    resume: "Resume",
    cancel: "Cancel",
    steer: "Steer",
    "project-session-launch": "Launch run",
    "chair-bridge-recovery": "Recover chair bridge",
    "chair-live-handoff": "Handoff chair",
    "project-session-drain": "Drain session",
    "project-session-stop": "Stop session",
    "daemon-drain": "Drain daemon",
    "daemon-stop": "Stop daemon",
    git: "Git operation",
    "git-authorise": "Git authority",
    "git-operation-draft": "Git draft",
    "git-custody-resolve": "Resolve Git custody",
    "registered-external-effect": "External effect",
    promotion: "Promote release",
  };
  return labels[action];
}

function rowActions(
  row: ConsoleRow | null,
  canMutate: boolean,
  dataset: FabricConsoleDataset,
  ui: FabricConsoleUiState,
): readonly PresentedAction[] {
  if (row === null || row.actionAvailability.state !== "available") {
    return [];
  }
  const currentArtifact = row.view === "evidence" &&
    dataset.inspection?.kind === "artifact" &&
    dataset.inspection.state === "current" &&
    dataset.inspection.binding.itemId === row.stableId &&
    dataset.inspection.binding.itemRevision === row.revision &&
    dataset.inspection.binding.projectionRevision === dataset.snapshotRevision
      ? dataset.inspection
      : null;
  const artifactReviewEligible = row.view !== "evidence" || (
    currentArtifact !== null && (
      currentArtifact.result.reviewDisposition === "eligible" ||
      matchesArtifactConfirmation(
        ui.artifactConfirmation,
        row.stableId,
        currentArtifact.result,
      )
    )
  );
  const guidedServerActions = dataset.workflowCapabilities === undefined
    ? null
    : new Set<OperatorAvailableAction>(["project-session-launch", "git", "promotion"]);
  return row.actionAvailability.actions
    .filter((action) => guidedServerActions?.has(action) !== true)
    .map((action) => {
    const reason = dataset.productionActionPlanning === true
      ? productionActionUnavailableReason(action, row, dataset, ui)
      : null;
    const enabled = canMutate && row.freshness.state === "live" &&
      artifactReviewEligible && reason === null;
    return {
      id: `action:${action}`,
      label: actionLabel(action),
      enabled,
      availableAction: action,
      ...(!enabled && reason !== null ? { reason } : {}),
    };
    });
}

function productionActionUnavailableReason(
  action: OperatorAvailableAction,
  row: ConsoleRow,
  dataset: FabricConsoleDataset,
  ui: FabricConsoleUiState,
): string | null {
  if (
    action === "pause" || action === "resume" || action === "cancel" ||
    action === "steer"
  ) {
    if (row.detailRef?.kind !== "run" && row.detailRef?.kind !== "session") {
      return "selected-row-has-no-control-target";
    }
    if (action === "pause" || action === "resume") return null;
    if (action === "cancel" && ui.draft.trim().length === 0) {
      return "enter-a-reason";
    }
    if (action === "steer" && ui.draft.trim().length === 0) {
      return "enter-an-instruction";
    }
    return null;
  }
  if (action === "project-session-drain") {
    const session = dataset.snapshot?.session;
    if (session?.freshness !== "live" || session.value === null) {
      return "live-session-required";
    }
    return session.value.state === "active" ||
      session.value.state === "visibility_degraded" ||
      session.value.state === "recovery_required" ||
      session.value.state === "quarantined"
      ? null
      : "session-is-not-drainable";
  }
  if (action === "project-session-stop") {
    const session = dataset.snapshot?.session;
    if (session?.freshness !== "live" || session.value === null) {
      return "live-session-required";
    }
    if (session.value.state !== "quiescing") return "drain-session-first";
    return parseArtifactReferenceDraft(ui.draft) !== null
      ? null
      : "enter-drain-receipt-ref";
  }
  return "typed-guided-entry-required";
}

const GUIDED_ACTION_LABELS: Readonly<Record<GuidedWorkflowAction, string>> = {
  discuss: "Discuss",
  accept: "Accept",
  "request-changes": "Request changes",
  defer: "Defer",
  implement: "Implement...",
  launch: "Launch...",
  git: "Git...",
  promotion: "Promote...",
};

function capabilityReason(
  capability: ConsoleWorkflowCapability | undefined,
): string | null {
  if (capability === undefined) return "typed-workflow-unavailable";
  return capability.state === "available" ? null : capability.reason;
}

function guidedAction(
  action: GuidedWorkflowAction,
  reason: string | null,
): PresentedAction {
  return {
    id: `workflow:${action}`,
    label: GUIDED_ACTION_LABELS[action],
    enabled: reason === null,
    availableAction: null,
    ...(reason === null ? {} : { reason }),
  };
}

function evidenceWorkflowActions(
  row: ConsoleRow,
  canMutate: boolean,
  dataset: FabricConsoleDataset,
  ui: FabricConsoleUiState,
): readonly PresentedAction[] {
  if (row.view !== "evidence") return [];
  const capabilities = dataset.workflowCapabilities;
  if (capabilities === undefined) return [];
  const intakeReason = canMutate
    ? capabilityReason(capabilities.intake)
    : "operator-mutation-unavailable";
  const discussionReason = canMutate
    ? capabilityReason(capabilities.intake)
    : "operator-mutation-unavailable";
  const inspection = dataset.inspection;
  const currentArtifact = inspection?.kind === "artifact" &&
    inspection.state === "current" &&
    inspection.binding.itemId === row.stableId &&
    inspection.binding.itemRevision === row.revision &&
    inspection.binding.projectionRevision === dataset.snapshotRevision
      ? inspection
      : null;
  const artifactReason = currentArtifact === null
    ? "artifact-content-unverified"
    : currentArtifact.result.reviewDisposition === "eligible" ||
        matchesArtifactConfirmation(ui.artifactConfirmation, row.stableId, currentArtifact.result)
      ? null
      : currentArtifact.result.reviewDisposition === "confirm-terminal-neutralised"
        ? "confirm-terminal-neutralised"
        : "artifact-content-redacted";
  const decisionReason = intakeReason ?? artifactReason;
  const launchReason = decisionReason ?? capabilityReason(capabilities.launch);
  return [
    guidedAction("discuss", discussionReason),
    guidedAction("accept", decisionReason),
    guidedAction("request-changes", discussionReason),
    guidedAction("defer", intakeReason),
    guidedAction("implement", launchReason),
  ];
}

function projectWorkflowActions(
  row: ConsoleRow,
  canMutate: boolean,
  dataset: FabricConsoleDataset,
): readonly PresentedAction[] {
  if (row.view !== "project") return [];
  const capabilities = dataset.workflowCapabilities;
  if (capabilities === undefined) return [];
  const mutationReason = canMutate ? null : "operator-mutation-unavailable";
  const authorityReason = (action: OperatorAvailableAction): string | null =>
    row.actionAvailability.state === "available" &&
      row.actionAvailability.actions.includes(action)
      ? null
      : "authority-insufficient";
  return [
    guidedAction(
      "launch",
      mutationReason ?? capabilityReason(capabilities.launch) ??
        authorityReason("project-session-launch"),
    ),
    guidedAction(
      "git",
      mutationReason ?? capabilityReason(capabilities.git) ?? authorityReason("git"),
    ),
    guidedAction(
      "promotion",
      mutationReason ?? capabilityReason(capabilities.promotion) ??
        authorityReason("promotion"),
    ),
  ];
}

function attentionWorkflowActions(
  row: ConsoleRow,
  canMutate: boolean,
  dataset: FabricConsoleDataset,
): readonly PresentedAction[] {
  if (
    row.view !== "attention" || row.summary?.kind !== "attention" ||
    (row.summary.label !== "Decision" && row.summary.label !== "Approval")
  ) return [];
  const capabilities = dataset.workflowCapabilities;
  if (capabilities === undefined) return [];
  const mutationReason = canMutate ? null : "operator-mutation-unavailable";
  const discussionReason = mutationReason ??
    capabilityReason(capabilities.intake) ?? "attention-intake-binding-unavailable";
  const gateReason = mutationReason ??
    capabilityReason(capabilities.gate) ??
    (row.summary.gateBinding === undefined ? "attention-gate-binding-unavailable" : null);
  return [
    guidedAction("discuss", discussionReason),
    guidedAction("accept", gateReason),
    guidedAction("request-changes", gateReason),
    guidedAction("defer", gateReason),
  ];
}

function guidedRowActions(
  row: ConsoleRow,
  canMutate: boolean,
  dataset: FabricConsoleDataset,
  ui: FabricConsoleUiState,
): readonly PresentedAction[] {
  return [
    ...evidenceWorkflowActions(row, canMutate, dataset, ui),
    ...projectWorkflowActions(row, canMutate, dataset),
    ...attentionWorkflowActions(row, canMutate, dataset),
  ];
}

function rowAndArtifactActions(
  row: ConsoleRow | null,
  canMutate: boolean,
  dataset: FabricConsoleDataset,
  ui: FabricConsoleUiState,
): readonly PresentedAction[] {
  const actions = rowActions(row, canMutate, dataset, ui);
  const workflowActions = row === null
    ? []
    : guidedRowActions(row, canMutate, dataset, ui);
  if (row?.view !== "evidence") return [...actions, ...workflowActions];
  const inspection = dataset.inspection;
  if (
    inspection?.kind !== "artifact" ||
    inspection.state !== "current" ||
    inspection.binding.itemId !== row.stableId ||
    inspection.binding.itemRevision !== row.revision ||
    inspection.binding.projectionRevision !== dataset.snapshotRevision ||
    inspection.result.reviewDisposition !== "confirm-terminal-neutralised" ||
    matchesArtifactConfirmation(ui.artifactConfirmation, row.stableId, inspection.result)
  ) return [...workflowActions, ...actions];
  const pendingActions = workflowActions.map((action) =>
    action.id === "workflow:request-changes"
      ? { ...action, label: "Revise" }
      : action.id === "workflow:implement"
        ? { ...action, label: "Build" }
        : action
  );
  return [{
    id: "artifact:confirm-terminal-neutralised",
    label: "Confirm digest",
    enabled: true,
    availableAction: null,
  }, ...pendingActions, ...actions];
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

function presentIntent(
  intent: OperatorActionIntent,
): readonly Readonly<{ label: string; value: string }>[] {
  if (intent.kind === "control") {
    const target = intent.target;
    return [
      { label: "Kind", value: `control:${intent.action}` },
      { label: "Target", value: target.kind },
      {
        label: "Identity",
        value:
          target.kind === "task"
            ? target.taskId
            : target.kind === "subtree"
              ? target.rootTaskId
              : target.kind === "run"
                ? target.coordinationRunId
                : target.projectSessionId,
      },
      { label: "Expected revision", value: String(target.expectedRevision) },
    ];
  }
  if (intent.kind === "git") {
    const remote = "remote" in intent.operation ? intent.operation.remote : null;
    return [
      { label: "Kind", value: `git:${intent.operation.variant}` },
      { label: "Repository", value: intent.repository.repositoryRoot },
      { label: "Worktree", value: intent.repository.worktreePath },
      { label: "Common directory", value: intent.repository.gitCommonDir },
      { label: "Expected state", value: intent.repository.repositoryStateDigest },
      { label: "Expected HEAD", value: intent.repository.headDigest },
      { label: "Expected index", value: intent.repository.indexDigest },
      { label: "Expected worktree", value: intent.repository.worktreeDigest },
      { label: "Expected remote state", value: intent.repository.remoteStateDigest },
      ...(remote === null ? [] : [{ label: "Remote", value: remote.remoteName }]),
      { label: "Operation", value: JSON.stringify(intent.operation) },
    ];
  }
  if (intent.kind === "git-authorise") {
    return [
      { label: "Kind", value: `${intent.kind}:${intent.action}` },
      { label: "Session", value: intent.projectSessionId },
      { label: "Run", value: intent.coordinationRunId },
      { label: "Authority", value: intent.authorityRef },
      { label: "Allow-list", value: intent.gitAllowlistDigest },
    ];
  }
  if (intent.kind === "git-operation-draft") {
    return intent.action === "create"
      ? [
          { label: "Kind", value: `${intent.kind}:create` },
          { label: "Draft request", value: intent.draftRequestId },
          { label: "Binding", value: intent.binding.kind },
          { label: "Expires", value: intent.expiresAt },
        ]
      : [
          { label: "Kind", value: `${intent.kind}:cancel` },
          { label: "Draft", value: `${intent.draftId}@r${String(intent.expectedDraftRevision)}` },
          { label: "Session", value: intent.projectSessionId },
          { label: "Run", value: intent.coordinationRunId },
        ];
  }
  if (intent.kind === "git-custody-resolve") {
    return [
      { label: "Kind", value: intent.kind },
      { label: "Custody", value: intent.custodyId },
      { label: "Expected state", value: intent.expectedCustodyState },
      { label: "Adjudication", value: intent.adjudication },
      { label: "Gate", value: `${intent.gateId}@r${String(intent.expectedGateRevision)}` },
    ];
  }
  if (intent.kind === "project-session-launch") {
    return [
      { label: "Kind", value: intent.kind },
      { label: "Project", value: intent.projectId },
      { label: "Session", value: intent.projectSessionId },
      { label: "Expected revision", value: String(intent.expectedSessionRevision) },
      { label: "Expected generation", value: String(intent.expectedSessionGeneration) },
      {
        label: "Launch packet",
        value: `${intent.launchPacketRef.path}@${intent.launchPacketRef.digest}`,
      },
      { label: "Authority", value: intent.authorityRef },
      { label: "Budget", value: intent.budgetRef },
      {
        label: "Resource plan",
        value: `${intent.resourcePlanRef.path}@${intent.resourcePlanRef.digest}`,
      },
      { label: "Adapter", value: intent.providerAdapterId },
      { label: "Provider action", value: intent.providerActionId },
    ];
  }
  if (intent.kind === "registered-external-effect") {
    return [
      { label: "Kind", value: intent.kind },
      { label: "Integration", value: intent.integrationId },
      { label: "Operation", value: intent.operationId },
      { label: "Target", value: intent.targetId },
      { label: "Expected target revision", value: String(intent.expectedTargetRevision) },
      { label: "Contract digest", value: intent.contractDigest },
      {
        label: "Request artifact",
        value: `${intent.requestArtifactRef.path}@${intent.requestArtifactRef.digest}`,
      },
    ];
  }
  if (intent.kind === "chair-bridge-recovery") {
    return [
      { label: "Kind", value: intent.kind },
      { label: "Path", value: intent.path },
      { label: "Run", value: intent.coordinationRunId },
      { label: "Loss", value: intent.lossId },
      { label: "Expected session revision", value: String(intent.expectedSessionRevision) },
      { label: "Expected run revision", value: String(intent.expectedRunRevision) },
      { label: "Expected chair generation", value: String(intent.expectedChairGeneration) },
      { label: "Recovery manifest digest", value: intent.recoveryManifestDigest },
    ];
  }
  if (intent.kind === "chair-live-handoff") {
    return [
      { label: "Kind", value: intent.kind },
      { label: "Session", value: intent.projectSessionId },
      { label: "Run", value: intent.coordinationRunId },
      { label: "Predecessor", value: intent.predecessorAgentId },
      { label: "Successor", value: intent.successorAgentId },
      { label: "Handoff", value: `${intent.handoffRef.path}@${intent.handoffRef.digest}` },
      { label: "Expected chair generation", value: String(intent.expectedChairGeneration) },
    ];
  }
  if (intent.kind === "promotion") {
    const release = intent.releaseBinding;
    return [
      { label: "Kind", value: intent.kind },
      { label: "Gate", value: `${intent.gateId}@r${String(intent.expectedGateRevision)}` },
      { label: "Gate status", value: intent.expectedGateStatus },
      {
        label: "Accepted receipt",
        value: release.acceptedDeliveryReceiptRef.path,
      },
      {
        label: "Accepted receipt digest",
        value: release.acceptedDeliveryReceiptRef.digest,
      },
      { label: "Artifact digest", value: release.artifactDigest },
      { label: "Promotion action", value: release.promotionAction },
      { label: "Promotion target", value: release.target },
    ];
  }
  if (intent.kind === "project-session-drain" || intent.kind === "project-session-stop") {
    return [
      { label: "Kind", value: intent.kind },
      { label: "Expected revision", value: String(intent.expectedSessionRevision) },
    ];
  }
  if (intent.kind === "daemon-drain" || intent.kind === "daemon-stop") {
    return [
      { label: "Kind", value: intent.kind },
      { label: "Expected revision", value: String(intent.expectedGlobalStateRevision) },
    ];
  }
  const exhaustive: never = intent;
  throw new TypeError(`unsupported operator intent: ${JSON.stringify(exhaustive)}`);
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
    intent: presentIntent(review.preview.intent),
    evidence: review.preview.evidenceRefs.map(
      (reference) => `${reference.path}@${reference.digest}`,
    ),
    gates: review.gates.map(presentReviewGate),
    changes: review.changes,
    receipt:
      review.status?.status === "committed"
        ? {
            commandId: review.status.receipt.commandId,
            afterStateDigest: review.status.receipt.afterStateDigest,
            effect:
              review.status.receipt.effectRef === undefined
                ? null
                : `${review.status.receipt.effectRef.path}@${review.status.receipt.effectRef.digest}`,
            committedAt: review.status.receipt.committedAt,
          }
        : null,
    workflowId: null,
    summary: null,
    result: null,
    failure: null,
  };
}

function presentWorkflowReview(
  review: ConsoleWorkflowReview,
  dataset: FabricConsoleDataset,
): PresentedReview {
  const projectionRevision = dataset.snapshotRevision ?? review.expectedRevision;
  return {
    stage: review.stage,
    itemId: review.kind,
    itemRevision: review.expectedRevision,
    projectionRevision,
    previewRevision: review.expectedRevision,
    previewDigest: review.previewDigest,
    intentDigest: review.previewDigest,
    beforeStateDigest: dataset.snapshot?.stateDigest ?? "unavailable",
    consequenceClass: review.consequenceClass,
    confirmationMode: review.confirmationMode,
    intent: review.details,
    evidence: review.evidence,
    gates: [],
    changes: [],
    receipt: null,
    workflowId: review.workflowId,
    summary: review.summary,
    result: review.result,
    failure: review.failure,
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

function workflowReviewActions(
  review: ConsoleWorkflowReview,
): readonly PresentedAction[] {
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
        label: review.confirmationMode === "echo" ? "Confirm exact digest" : "Confirm workflow",
        enabled: true,
        availableAction: null,
      },
      { id: "review:cancel", label: "Cancel Review", enabled: true, availableAction: null },
    ];
  }
  return [
    { id: "review:close", label: "Close Review", enabled: true, availableAction: null },
  ];
}

function guidedWorkflowActions(): readonly PresentedAction[] {
  return [
    {
      id: "guided:submit",
      label: "Review typed workflow",
      enabled: true,
      availableAction: null,
    },
    {
      id: "guided:cancel",
      label: "Cancel form",
      enabled: true,
      availableAction: null,
    },
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
  const workflowReview = review === null ? ui.workflowReview : null;
  const actions = review === null && workflowReview === null && ui.guidedWorkflow !== null
    ? guidedWorkflowActions()
    : review === null && workflowReview === null
      ? rowAndArtifactActions(
          selectedRow,
          dataset.canMutate && dataset.connection.state === "live",
          dataset,
          ui,
        )
      : review === null
        ? workflowReviewActions(workflowReview as ConsoleWorkflowReview)
        : reviewActions(review);
  const baseDetail = selectedRow === null ? null : detailLines(selectedRow);
  const unavailableActions = actions.filter(
    (action): action is PresentedAction & { reason: string } =>
      !action.enabled && action.reason !== undefined,
  );
  const detail = baseDetail === null || unavailableActions.length === 0
    ? baseDetail
    : {
        ...baseDetail,
        lines: [
          ...baseDetail.lines,
          ...unavailableActions.map((action) => ({
            label: `${action.label} unavailable`,
            value: action.reason,
          })),
        ],
      };
  return {
    mode: responsiveModeFor(viewport),
    connection: dataset.connection.state === "live"
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
    topAttention:
      dataset.pages.attention.rows[0] === undefined
        ? null
        : presentRow(
            dataset.pages.attention.rows[0],
            controller.selectionByView.attention?.stableId ===
              dataset.pages.attention.rows[0].stableId,
            dataset.canMutate && dataset.connection.state === "live",
          ),
    detail,
    actions,
    review:
      review !== null
        ? presentReview(review)
        : workflowReview === null
          ? null
          : presentWorkflowReview(workflowReview, dataset),
    focusId: ui.focusId,
    compactPane: ui.compactPane,
    draft: ui.draft,
    inputMode: ui.inputMode,
    mouseCapture: ui.mouseCapture,
    rejectedInputCount: ui.rejectedInputCount,
    notice: ui.notice,
    failureCode: controller.lastFailure?.code ?? null,
    reviewScrollOffset: ui.reviewScrollOffset,
  };
}

import type { OperatorAvailableAction } from "@local/agent-fabric-protocol";

import type { ActionReview } from "./controller.js";
import type {
  FabricView,
  GuidedWorkflowAction,
  Revision,
} from "./model.js";
import type {
  ConsoleArtifactContentResult,
  ConsoleInspectionBinding,
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
  reviewCoverage: FabricReviewCoverageState | null;
  workflowReview: ConsoleWorkflowReview | null;
  artifactConfirmation: ArtifactReviewConfirmation | null;
  guidedWorkflow: ConsoleGuidedWorkflowDraft | null;
}>;

export type FabricReviewCoverageState = Readonly<{
  reviewKey: string;
  coveredThrough: number;
  requiredEnd: number;
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
    reviewCoverage: overrides.reviewCoverage ?? null,
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
    !Number.isSafeInteger(columns) ||
    !Number.isSafeInteger(rows) ||
    columns < 0 ||
    rows < 0
  ) {
    return "inert";
  }
  const width = columns;
  const height = rows;
  if (
    width > MAX_PRESENTATION_CELLS ||
    height > MAX_PRESENTATION_CELLS ||
    width * height > MAX_PRESENTATION_CELLS ||
    width < 30 ||
    height < 6
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
  reviewCoverage: FabricReviewCoverageState | null;
}>;

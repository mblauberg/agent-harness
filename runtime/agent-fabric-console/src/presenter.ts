import type {
  OperatorAvailableAction,
  OperatorActionIntent,
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
  type ConsoleRow,
  type ConsoleWorkflowCapability,
  type GuidedWorkflowAction,
} from "./model.js";
import type { FabricConsoleDataset } from "./protocol-adapter.js";
import {
  matchesArtifactConfirmation,
  responsiveModeFor,
  type FabricConsolePresentation,
  type FabricConsoleUiState,
  type FabricViewport,
  type PresentedAction,
  type PresentedReview,
  type PresentedReviewGate,
} from "./presenter-model.js";
import {
  detailLines,
  presentHeader,
  presentRows,
  titleCase,
} from "./row-presentation.js";
import type { ConsoleWorkflowReview } from "./workflow.js";

export * from "./presenter-model.js";

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
    "agent-lifecycle-recovery": "Recover agent lifecycle",
    "registered-external-effect": "External effect",
    "provider-route-integrity-retire": "Retire provider reservation",
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
    .filter((action) => !isControlAction(action) || hasExactRunControlState(row))
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

function isControlAction(action: OperatorAvailableAction): boolean {
  return action === "pause" || action === "resume" || action === "cancel" || action === "steer";
}

function hasExactRunControlState(row: ConsoleRow): boolean {
  return row.view === "runs" && row.detailRef?.kind === "run";
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
    if (!hasExactRunControlState(row)) {
      return "open-runs-for-current-control-state";
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
  // Evidence-to-session implementation planning has no production binding yet.
  // Do not let availability of Project-row launch preparation expose it.
  const implementationReason = decisionReason ?? "implementation-planning-unavailable";
  return [
    guidedAction("discuss", discussionReason),
    guidedAction("accept", decisionReason),
    guidedAction("request-changes", discussionReason),
    guidedAction("defer", intakeReason),
    guidedAction("implement", implementationReason),
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
  const launchRecovery = dataset.snapshot?.session?.freshness === "live" &&
    (dataset.snapshot.session.value?.state === "launching" ||
      dataset.snapshot.session.value?.state === "launch_ambiguous");
  return [
    guidedAction(
      "launch",
      mutationReason ?? capabilityReason(capabilities.launch) ??
        (launchRecovery ? null : authorityReason("project-session-launch")),
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
  if (intent.kind === "provider-route-integrity-retire") {
    return [
      { label: "Kind", value: intent.kind },
      { label: "Session", value: intent.projectSessionId },
      { label: "Run", value: intent.coordinationRunId },
      {
        label: "Provider action",
        value: `${intent.actionRef.adapterId}:${intent.actionRef.actionId}`,
      },
      { label: "Recovery generation", value: String(intent.recoveryGeneration) },
      { label: "Expected state", value: intent.expectedState },
      { label: "Reservation digest", value: intent.reservationDigest },
      { label: "Gate", value: `${intent.gateId}@r${String(intent.expectedGateRevision)}` },
      { label: "Direct input attestation", value: intent.directInputAttestationId },
    ];
  }
  if (intent.kind === "agent-lifecycle-recovery") {
    const source = intent.source.kind === "custody"
      ? `custody:${intent.source.custodyRef.custodyId}@r${String(intent.source.custodyRef.custodyRevision)}`
      : `generation-loss:${intent.source.generationLossRef.generationLossId}@r${String(intent.source.generationLossRef.generationLossRevision)}`;
    const common = [
      { label: "Kind", value: `${intent.kind}:${intent.path}` },
      { label: "Session", value: intent.projectSessionId },
      { label: "Run", value: intent.coordinationRunId },
      { label: "Agent", value: intent.agentId },
      { label: "Recovery source", value: source },
      { label: "Expected session", value: `r${String(intent.expectedSessionRevision)} g${String(intent.expectedSessionGeneration)}` },
      { label: "Expected run revision", value: String(intent.expectedRunRevision) },
      { label: "Expected agent revision", value: String(intent.expectedAgentRevision) },
      { label: "Expected source revision", value: String(intent.expectedSourceRevision) },
      { label: "Expected principal generation", value: String(intent.expectedPrincipalGeneration) },
      { label: "Expected provider generation", value: String(intent.expectedProviderGeneration) },
      { label: "Expected bridge generation", value: String(intent.expectedBridgeGeneration) },
      { label: "Expected context revision", value: String(intent.expectedContextRevision) },
      { label: "Bridge owner", value: intent.bridgeOwnerKind },
      {
        label: "Expected chair lease generation",
        value: intent.expectedChairLeaseGeneration === null
          ? "inapplicable"
          : String(intent.expectedChairLeaseGeneration),
      },
      { label: "Gate", value: `${intent.gateId}@r${String(intent.expectedGateRevision)} ${intent.expectedGateStatus}` },
    ];
    return intent.path === "fresh-rotate"
      ? [
          ...common,
          { label: "Recovery capability", value: `${intent.recoveryCapabilityId}@r${String(intent.expectedRecoveryCapabilityRevision)}` },
          { label: "Recovery capability hash", value: intent.recoveryCapabilityHash },
          { label: "Replacement adapter", value: intent.replacementAdapterId },
          { label: "Replacement contract", value: intent.replacementContractDigest },
          { label: "Replacement action", value: `${intent.replacementActionRef.adapterId}:${intent.replacementActionRef.actionId}` },
          { label: "Checkpoint", value: `${intent.checkpointRef.checkpointId}@r${String(intent.checkpointRef.checkpointRevision)}` },
          { label: "Checkpoint digest", value: intent.checkpointDigest },
          {
            label: "Checkpoint validation receipt",
            value: intent.checkpointValidationReceiptDigest ?? "observed-null",
          },
        ]
      : [
          ...common,
          { label: "Reason", value: intent.reason },
          { label: "Direct input attestation", value: intent.directInputAttestationId },
          { label: "Destructive confirmation", value: intent.destructiveConfirmationDigest },
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
      { id: "review:cancel", label: "Cancel Review", enabled: true, availableAction: null },
      {
        id: "review:confirm",
        label: review.preview.confirmationMode === "echo" ? "Confirm exact digest" : "Confirm action",
        enabled: true,
        availableAction: null,
      },
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
      { id: "review:cancel", label: "Cancel Review", enabled: true, availableAction: null },
      {
        id: "review:confirm",
        label: review.confirmationMode === "echo" ? "Confirm exact digest" : "Confirm workflow",
        enabled: true,
        availableAction: null,
      },
    ];
  }
  if (review.stage === "pending" || review.stage === "ambiguous") {
    return [
      { id: "review:observe", label: "Observe launch status", enabled: true, availableAction: null },
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
  const presentedRows = presentRows(dataset, controller, activeRows, selected);
  const selectedRow = presentedRows.selectedRow;
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
  const baseDetail = selectedRow === null ? null : detailLines(selectedRow, dataset);
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
    masterRows: presentedRows.masterRows,
    topAttention: presentedRows.topAttention,
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
    reviewCoverage: ui.reviewCoverage,
  };
}

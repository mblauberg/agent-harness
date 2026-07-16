import type { ReleaseBinding, ScopedGate } from "./gates.js";
import type {
  GitAuthoriseIntent,
  GitConflictReconcileBinding,
  GitCustodyResolveIntent,
  GitCustodyStatus,
  GitOperationDraftIntent,
  OperatorGitIntent,
} from "./git-actions.js";
export {
  assertGitIntentState,
  gitOperationVariant,
  isPreauthorisedGitOperationVariant,
} from "./git-actions.js";
import type { LaunchProviderActionJournalRefV1, ProviderActionRefV1 } from "./launch.js";
import type { AgentLifecycleRecoveryIntentV1 } from "./lifecycle.js";
import type { OperatorAction, OperatorCapabilityCredential, OperatorMutationContext } from "./operator.js";
import type {
  AgentId,
  ArtifactRef,
  CoordinationRunId,
  GateId,
  IntegrationId,
  LeaseId,
  ProjectId,
  ProjectSessionId,
  ProviderActionId,
  Sha256Digest,
  TaskId,
  Timestamp,
} from "./primitives.js";
import type { ChairLiveHandoffIntent } from "./workstreams.js";

export type OperatorRevisionTarget =
  | {
      kind: "task";
      projectSessionId: ProjectSessionId;
      coordinationRunId: CoordinationRunId;
      taskId: TaskId;
      expectedRevision: number;
    }
  | {
      kind: "subtree";
      projectSessionId: ProjectSessionId;
      coordinationRunId: CoordinationRunId;
      rootTaskId: TaskId;
      expectedRevision: number;
    }
  | {
      kind: "run";
      projectSessionId: ProjectSessionId;
      coordinationRunId: CoordinationRunId;
      expectedRevision: number;
    }
  | {
      kind: "session";
      projectSessionId: ProjectSessionId;
      expectedRevision: number;
      expectedGeneration: number;
    };

export type OperatorControlIntent =
  | { kind: "control"; action: "pause" | "resume"; target: OperatorRevisionTarget }
  | { kind: "control"; action: "cancel"; target: OperatorRevisionTarget; reason: string }
  | {
      kind: "control";
      action: "steer";
      target: OperatorRevisionTarget;
      instruction: string;
      evidenceRefs: readonly ArtifactRef[];
    };

export type OperatorLifecycleIntent =
  | {
      kind: "project-session-drain";
      projectSessionId: ProjectSessionId;
      expectedSessionRevision: number;
      expectedSessionGeneration: number;
      expectedGlobalStateRevision: number;
    }
  | {
      kind: "project-session-stop";
      projectSessionId: ProjectSessionId;
      expectedSessionRevision: number;
      expectedSessionGeneration: number;
      expectedGlobalStateRevision: number;
      drainReceiptRef: ArtifactRef;
    }
  | {
      kind: "daemon-drain";
      expectedDaemonGeneration: number;
      expectedGlobalStateRevision: number;
    }
  | {
      kind: "daemon-stop";
      expectedDaemonGeneration: number;
      expectedGlobalStateRevision: number;
      drainReceiptRef: ArtifactRef;
    };

export type ProjectSessionLaunchIntent = {
  kind: "project-session-launch";
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  expectedProjectRevision: number;
  expectedSessionRevision: number;
  expectedSessionGeneration: number;
  trustRecordDigest: Sha256Digest;
  launchPacketRef: ArtifactRef;
  authorityRef: Sha256Digest;
  budgetRef: string;
  resourcePlanRef: ArtifactRef;
  providerAdapterId: string;
  providerActionId: ProviderActionId;
  providerContractDigest: Sha256Digest;
  resourceStateDigest: Sha256Digest;
  retryOf?: {
    providerAdapterId: string;
    providerActionId: ProviderActionId;
  };
};

type ChairBridgeRecoveryCommon = {
  kind: "chair-bridge-recovery";
  schemaVersion: 1;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  lossId: string;
  recoveryManifestDigest: Sha256Digest;
  expectedSessionRevision: number;
  expectedSessionGeneration: number;
  expectedRunRevision: number;
  expectedChairGeneration: number;
  expectedPrincipalGeneration: number;
  expectedBridgeRevision: number;
  expectedLostBridgeGeneration: number;
  expectedProviderSessionGeneration: number;
  providerAdapterId: string;
  providerContractDigest: Sha256Digest;
};

export type ChairBridgeRecoveryIntent = ChairBridgeRecoveryCommon & (
  | { path: "rebind"; providerActionId: ProviderActionId }
  | {
      path: "takeover";
      successorAgentId: string;
      expectedSuccessorPrincipalGeneration: number;
      expectedSuccessorBridgeGeneration: number;
      expectedSuccessorRevision: number;
    }
  | { path: "abandon"; reason: string }
);

export type RegisteredExternalEffectIntent = {
  kind: "registered-external-effect";
  integrationId: IntegrationId;
  expectedIntegrationGeneration: number;
  operationId: string;
  contractDigest: Sha256Digest;
  requestArtifactRef: ArtifactRef;
  targetId: string;
  expectedTargetRevision: number;
  idempotencyKey: string;
};

export type RegisteredExternalEffectState = {
  integrationId: IntegrationId;
  integrationGeneration: number;
  operationContracts: Readonly<Record<string, Sha256Digest>>;
  targetRevisions: Readonly<Record<string, number>>;
};

export function assertRegisteredExternalEffectContract(
  intent: RegisteredExternalEffectIntent,
  current: RegisteredExternalEffectState,
): void {
  if (intent.integrationId !== current.integrationId) throw new TypeError("external integration does not match");
  if (intent.expectedIntegrationGeneration !== current.integrationGeneration) {
    throw new TypeError("external integration generation is stale");
  }
  const contract = current.operationContracts[intent.operationId];
  if (contract === undefined) throw new TypeError("external operation is not registered");
  if (contract !== intent.contractDigest) throw new TypeError("external operation contract digest is stale");
  if (current.targetRevisions[intent.targetId] !== intent.expectedTargetRevision) {
    throw new TypeError("external target revision is stale");
  }
}

export type PromotionIntent = {
  kind: "promotion";
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  gateId: GateId;
  expectedGateRevision: number;
  expectedGateStatus: "approved";
  releaseBinding: ReleaseBinding;
};

export type ProviderRouteIntegrityRetireIntent = {
  kind: "provider-route-integrity-retire";
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  actionRef: ProviderActionRefV1;
  recoveryGeneration: number;
  expectedState: "awaiting-human-retire";
  reservationDigest: Sha256Digest;
  gateId: GateId;
  expectedGateRevision: number;
  directInputAttestationId: string;
};

function sameReleaseBinding(left: ReleaseBinding | undefined, right: ReleaseBinding): boolean {
  return left !== undefined &&
    left.acceptedDeliveryReceiptRef.path === right.acceptedDeliveryReceiptRef.path &&
    left.acceptedDeliveryReceiptRef.digest === right.acceptedDeliveryReceiptRef.digest &&
    left.artifactDigest === right.artifactDigest &&
    left.promotionAction === right.promotionAction &&
    left.target === right.target;
}

export function assertPromotionIntentGate(intent: PromotionIntent, gate: ScopedGate): void {
  if (
    gate.gateId !== intent.gateId ||
    gate.projectSessionId !== intent.projectSessionId ||
    gate.coordinationRunId !== intent.coordinationRunId
  ) {
    throw new TypeError("promotion gate identity does not match");
  }
  if (gate.revision !== intent.expectedGateRevision) throw new TypeError("promotion gate revision is stale");
  if (gate.scope.kind !== "release" || gate.status !== "approved") {
    throw new TypeError("promotion requires an approved release gate");
  }
  if (!sameReleaseBinding(gate.releaseBinding, intent.releaseBinding)) {
    throw new TypeError("promotion release binding does not match");
  }
}

export type OperatorActionIntent =
  | OperatorControlIntent
  | ProjectSessionLaunchIntent
  | ChairBridgeRecoveryIntent
  | ChairLiveHandoffIntent
  | OperatorLifecycleIntent
  | OperatorGitIntent
  | GitAuthoriseIntent
  | GitOperationDraftIntent
  | GitCustodyResolveIntent
  | AgentLifecycleRecoveryIntentV1
  | RegisteredExternalEffectIntent
  | ProviderRouteIntegrityRetireIntent
  | PromotionIntent;

export function requiredOperatorActionForIntent(intent: OperatorActionIntent): OperatorAction {
  if (intent.kind === "control") return intent.action;
  if (intent.kind === "project-session-launch") return "launch";
  if (intent.kind === "chair-bridge-recovery") return "takeover";
  if (intent.kind === "chair-live-handoff") return "takeover";
  if (intent.kind === "project-session-drain" || intent.kind === "daemon-drain") return "drain";
  if (intent.kind === "project-session-stop" || intent.kind === "daemon-stop") return "stop";
  if (intent.kind === "git") return "git";
  if (intent.kind === "git-authorise") return "git-authorise";
  if (intent.kind === "git-operation-draft") {
    return intent.action === "create" && intent.binding.kind === "custody-resolution"
      ? "git-custody-resolve"
      : "git";
  }
  if (intent.kind === "git-custody-resolve") return "git-custody-resolve";
  if (intent.kind === "agent-lifecycle-recovery") {
    return intent.path === "fresh-rotate" ? "agent-lifecycle-recovery-issue" : "cancel";
  }
  if (intent.kind === "registered-external-effect" || intent.kind === "provider-route-integrity-retire" || intent.kind === "promotion") return "external-effect";
  const exhaustive: never = intent;
  return exhaustive;
}

export type OperatorAvailableAction =
  | "pause"
  | "resume"
  | "cancel"
  | "steer"
  | "project-session-launch"
  | "chair-bridge-recovery"
  | "chair-live-handoff"
  | "project-session-drain"
  | "project-session-stop"
  | "daemon-drain"
  | "daemon-stop"
  | "git"
  | "git-authorise"
  | "git-operation-draft"
  | "git-custody-resolve"
  | "agent-lifecycle-recovery"
  | "registered-external-effect"
  | "provider-route-integrity-retire"
  | "promotion";

export type OperatorActionAvailability =
  | { state: "read-only"; reason: "feature-unavailable" | "authority-insufficient" | "state-ineligible" }
  | { state: "available"; actions: readonly OperatorAvailableAction[]; requiresPreview: true };

export type OperatorActionPreviewRequest = {
  command: OperatorMutationContext;
  projectId: ProjectId;
  intent: OperatorActionIntent;
};

export type OperatorActionPreview = {
  previewId: string;
  previewRevision: number;
  previewDigest: Sha256Digest;
  intent: OperatorActionIntent;
  intentDigest: Sha256Digest;
  beforeStateDigest: Sha256Digest;
  consequenceClass: "routine" | "consequential" | "destructive" | "external" | "promotion";
  evidenceRefs: readonly ArtifactRef[];
  gateIds: readonly GateId[];
  confirmationMode: "explicit" | "echo";
  expiresAt: Timestamp;
};

export type OperatorActionPreviewCurrentState = {
  previewId: string;
  previewRevision: number;
  previewDigest: Sha256Digest;
  intentDigest: Sha256Digest;
  beforeStateDigest: Sha256Digest;
  observedAt: Timestamp;
};

export function assertOperatorActionPreviewCurrent(
  preview: OperatorActionPreview,
  current: OperatorActionPreviewCurrentState,
): void {
  if (preview.previewId !== current.previewId) throw new TypeError("operator action preview ID does not match");
  if (preview.previewRevision !== current.previewRevision) throw new TypeError("operator action preview revision is stale");
  if (preview.previewDigest !== current.previewDigest) throw new TypeError("operator action preview digest is stale");
  if (preview.intentDigest !== current.intentDigest) throw new TypeError("operator action intent digest is stale");
  if (preview.beforeStateDigest !== current.beforeStateDigest) throw new TypeError("operator action before-state changed");
  if (Date.parse(current.observedAt) >= Date.parse(preview.expiresAt)) throw new TypeError("operator action preview expired");
}

export type OperatorActionConfirmation =
  | { kind: "explicit"; confirmationId: string }
  | { kind: "echo"; echoedPreviewDigest: Sha256Digest };

export type OperatorActionCommitRequest = {
  command: OperatorMutationContext;
  projectId: ProjectId;
  previewId: string;
  expectedPreviewRevision: number;
  previewDigest: Sha256Digest;
  expectedIntentDigest: Sha256Digest;
  confirmation: OperatorActionConfirmation;
};

type OperatorActionReceiptBase = {
  commandId: string;
  previewId: string;
  previewRevision: number;
  intentDigest: Sha256Digest;
  beforeStateDigest: Sha256Digest;
  afterStateDigest: Sha256Digest;
  evidenceRefs: readonly ArtifactRef[];
  committedAt: Timestamp;
};

export type McpSeatProvisioningDescriptorV1 = Readonly<{
  schemaVersion: 1;
  projectSessionId: ProjectSessionId;
  sessionRevision: number;
  sessionGeneration: number;
  coordinationRunId: CoordinationRunId;
  runRevision: number;
  chairAgentId: AgentId;
  chairGeneration: number;
  chairLeaseId: LeaseId;
}>;

type NonLaunchOperatorActionReceipt = OperatorActionReceiptBase & {
  effectRef?: ArtifactRef;
  launchProviderActionJournalRef?: never;
};
type LaunchOperatorActionReceipt = OperatorActionReceiptBase & {
  effectRef?: ArtifactRef;
  launchProviderActionJournalRef: LaunchProviderActionJournalRefV1;
};
export type OperatorActionReceipt = NonLaunchOperatorActionReceipt | LaunchOperatorActionReceipt;
type TerminalSuccessLaunchJournal = Extract<
  LaunchProviderActionJournalRefV1,
  { journalState: "terminal"; outcomeKind: "terminal-success" }
>;
type TerminalNoEffectLaunchJournal = Extract<
  LaunchProviderActionJournalRefV1,
  { journalState: "terminal"; outcomeKind: "terminal-no-effect" }
>;

export type OperatorActionStatusRequest = {
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  commandId: string;
};

export type OperatorActionRejectionCode =
  | "authority-insufficient"
  | "preview-expired"
  | "preview-stale"
  | "state-changed"
  | "generation-stale"
  | "git-state-changed"
  | "external-contract-unknown"
  | "external-contract-stale"
  | "release-binding-mismatch"
  | "dedupe-conflict";

export type OperatorActionStatus =
  | { status: "not-found"; commandId: string }
  | {
      status: "pending";
      commandId: string;
      intentDigest: Sha256Digest;
      phase: "prepared" | "dispatched" | "accepted" | "observing";
      attemptGeneration: number;
      launchProviderActionJournalRef?: LaunchProviderActionJournalRefV1;
      gitCustody?: GitCustodyStatus;
    }
  | ({
      status: "ambiguous";
      commandId: string;
      intentDigest: Sha256Digest;
      attemptGeneration: number;
    } & (
      | { effectRef: ArtifactRef; launchProviderActionJournalRef?: never }
      | { effectRef?: ArtifactRef; launchProviderActionJournalRef: LaunchProviderActionJournalRefV1 }
      | { effectRef?: ArtifactRef; launchProviderActionJournalRef?: never; gitCustody: GitCustodyStatus }
    ))
  | {
      status: "conflict" | "quarantined";
      commandId: string;
      intentDigest: Sha256Digest;
      attemptGeneration: number;
      gitCustody: GitCustodyStatus;
    }
  | {
      status: "committed";
      commandId: string;
      receipt: NonLaunchOperatorActionReceipt;
      launchProviderActionJournalRef?: never;
      seatProvisioning?: never;
    }
  | {
      status: "committed";
      commandId: string;
      receipt: LaunchOperatorActionReceipt;
      launchProviderActionJournalRef: TerminalSuccessLaunchJournal;
      seatProvisioning: McpSeatProvisioningDescriptorV1;
    }
  | {
      status: "committed";
      commandId: string;
      receipt: LaunchOperatorActionReceipt;
      launchProviderActionJournalRef: TerminalNoEffectLaunchJournal;
      seatProvisioning?: never;
    }
  | {
      status: "rejected";
      commandId: string;
      intentDigest: Sha256Digest;
      code: OperatorActionRejectionCode;
      evidenceRefs: readonly ArtifactRef[];
    };

type OperatorActionReconcileBase = {
  command: OperatorMutationContext;
  projectId: ProjectId;
  targetCommandId: string;
  expectedAttemptGeneration: number;
  mode: "observe-only";
};

export type OperatorActionReconcileRequest =
  | (OperatorActionReconcileBase & {
      expectedStatus: "pending" | "ambiguous";
      gitConflict?: never;
    })
  | (OperatorActionReconcileBase & {
      expectedStatus: "conflict";
      gitConflict: Extract<GitConflictReconcileBinding, { kind: "owned-conflict" }>;
    })
  | (OperatorActionReconcileBase & {
      expectedStatus: "pending" | "ambiguous" | "quarantined";
      gitConflict: Extract<GitConflictReconcileBinding, { kind: "inherited-successor" }>;
    });

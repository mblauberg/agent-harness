import type { ReleaseBinding, ScopedGate } from "./gates.js";
import type { OperatorAction, OperatorCapabilityCredential, OperatorMutationContext } from "./operator.js";
import type {
  ArtifactRef,
  CoordinationRunId,
  GateId,
  IntegrationId,
  ProjectId,
  ProjectSessionId,
  Sha256Digest,
  TaskId,
  Timestamp,
} from "./primitives.js";

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

export type GitRepositoryBinding = {
  repositoryRoot: string;
  worktreePath: string;
  remoteName: string;
  expectedHeadDigest: Sha256Digest;
  expectedIndexDigest: Sha256Digest;
  expectedWorktreeDigest: Sha256Digest;
  expectedRemoteDigest: Sha256Digest;
};

export type GitObjectIntent =
  | { kind: "commit"; objectName: string; objectDigest: Sha256Digest }
  | { kind: "tag"; objectName: string; objectDigest: Sha256Digest }
  | { kind: "local-branch"; objectName: string; objectDigest: Sha256Digest }
  | { kind: "remote-ref"; remoteName: string; objectName: string; objectDigest: Sha256Digest }
  | { kind: "tracking-ref"; remoteName: string; objectName: string; objectDigest: Sha256Digest };

export type GitPushPolicy =
  | { kind: "fast-forward-only" }
  | { kind: "force-with-lease"; expectedRemoteObjectDigest: Sha256Digest };

export type GitBranchEffect =
  | { action: "create"; destination: Extract<GitObjectIntent, { kind: "local-branch" }>; source: GitObjectIntent }
  | { action: "delete"; source: Extract<GitObjectIntent, { kind: "local-branch" }> }
  | {
      action: "rename";
      source: Extract<GitObjectIntent, { kind: "local-branch" }>;
      destination: Extract<GitObjectIntent, { kind: "local-branch" }>;
    };

export type GitWorktreeEffect =
  | { action: "create"; destinationWorktreePath: string; source: GitObjectIntent }
  | { action: "remove"; sourceWorktreePath: string; expectedWorktreeDigest: Sha256Digest }
  | {
      action: "move";
      sourceWorktreePath: string;
      destinationWorktreePath: string;
      expectedWorktreeDigest: Sha256Digest;
    };

export type GitEffect =
  | {
      effect: "fetch";
      source: Extract<GitObjectIntent, { kind: "remote-ref" }>;
      destination: Extract<GitObjectIntent, { kind: "tracking-ref" }>;
    }
  | {
      effect: "pull";
      source: Extract<GitObjectIntent, { kind: "remote-ref" }>;
      destination: Extract<GitObjectIntent, { kind: "local-branch" }>;
      strategy: "fast-forward-only" | "merge" | "rebase";
    }
  | { effect: "stage"; paths: readonly string[] }
  | { effect: "unstage"; paths: readonly string[] }
  | {
      effect: "commit";
      sourceIndexDigest: Sha256Digest;
      destination: Extract<GitObjectIntent, { kind: "commit" }>;
      message: string;
    }
  | {
      effect: "merge";
      source: GitObjectIntent;
      destination: Extract<GitObjectIntent, { kind: "local-branch" }>;
    }
  | {
      effect: "rebase";
      source: Extract<GitObjectIntent, { kind: "local-branch" }>;
      destination: GitObjectIntent;
    }
  | {
      effect: "push";
      source: Extract<GitObjectIntent, { kind: "local-branch" }>;
      destination: Extract<GitObjectIntent, { kind: "remote-ref" }>;
      policy: GitPushPolicy;
    }
  | ({ effect: "branch" } & GitBranchEffect)
  | ({ effect: "worktree" } & GitWorktreeEffect);

export type OperatorGitIntent = {
  kind: "git";
  repository: GitRepositoryBinding;
  operation: GitEffect;
};

export type GitCurrentState = {
  headDigest: Sha256Digest;
  indexDigest: Sha256Digest;
  worktreeDigest: Sha256Digest;
  remoteDigest: Sha256Digest;
  objectDigests: Readonly<Record<string, Sha256Digest>>;
};

function gitObjectKey(object: GitObjectIntent): string {
  return object.kind === "remote-ref" || object.kind === "tracking-ref"
    ? `${object.kind}:${object.remoteName}:${object.objectName}`
    : `${object.kind}:${object.objectName}`;
}

export function assertGitIntentState(intent: OperatorGitIntent, current: GitCurrentState): void {
  const expected = intent.repository;
  if (expected.expectedHeadDigest !== current.headDigest) throw new TypeError("operator Git HEAD state changed");
  if (expected.expectedIndexDigest !== current.indexDigest) throw new TypeError("operator Git index state changed");
  if (expected.expectedWorktreeDigest !== current.worktreeDigest) throw new TypeError("operator Git worktree state changed");
  if (expected.expectedRemoteDigest !== current.remoteDigest) throw new TypeError("operator Git remote state changed");
  const operation = intent.operation as unknown as { source?: GitObjectIntent; destination?: GitObjectIntent };
  for (const [label, object] of [["source", operation.source], ["destination", operation.destination]] as const) {
    if (object !== undefined && current.objectDigests[gitObjectKey(object)] !== object.objectDigest) {
      throw new TypeError(`operator Git ${label} object state changed`);
    }
  }
}

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
  | OperatorLifecycleIntent
  | OperatorGitIntent
  | RegisteredExternalEffectIntent
  | PromotionIntent;

export function requiredOperatorActionForIntent(intent: OperatorActionIntent): OperatorAction {
  if (intent.kind === "control") return intent.action;
  if (intent.kind === "project-session-drain" || intent.kind === "daemon-drain") return "drain";
  if (intent.kind === "project-session-stop" || intent.kind === "daemon-stop") return "stop";
  if (intent.kind === "git") return "git";
  if (intent.kind === "registered-external-effect" || intent.kind === "promotion") return "external-effect";
  const exhaustive: never = intent;
  return exhaustive;
}

export type OperatorAvailableAction =
  | "pause"
  | "resume"
  | "cancel"
  | "steer"
  | "project-session-drain"
  | "project-session-stop"
  | "daemon-drain"
  | "daemon-stop"
  | "git"
  | "registered-external-effect"
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

export type OperatorActionReceipt = {
  commandId: string;
  previewId: string;
  previewRevision: number;
  intentDigest: Sha256Digest;
  beforeStateDigest: Sha256Digest;
  afterStateDigest: Sha256Digest;
  effectRef?: ArtifactRef;
  evidenceRefs: readonly ArtifactRef[];
  committedAt: Timestamp;
};

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
    }
  | {
      status: "ambiguous";
      commandId: string;
      intentDigest: Sha256Digest;
      attemptGeneration: number;
      effectRef: ArtifactRef;
    }
  | { status: "committed"; commandId: string; receipt: OperatorActionReceipt }
  | {
      status: "rejected";
      commandId: string;
      intentDigest: Sha256Digest;
      code: OperatorActionRejectionCode;
      evidenceRefs: readonly ArtifactRef[];
    };

export type OperatorActionReconcileRequest = {
  command: OperatorMutationContext;
  projectId: ProjectId;
  targetCommandId: string;
  expectedStatus: "pending" | "ambiguous";
  expectedAttemptGeneration: number;
  mode: "observe-only";
};

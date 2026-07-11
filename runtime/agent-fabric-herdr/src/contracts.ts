import type {
  AgentId,
  BarrierId,
  ConsoleView,
  CoordinationRunId,
  JsonValue,
  MessageId,
  ProjectId,
  ProjectSessionId,
  ProviderActionId,
  ProviderSessionRef,
  Sha256Digest,
  TaskId,
  Timestamp,
} from "@local/agent-fabric-protocol";

declare const herdrPaneRefBrand: unique symbol;

/** Opaque Herdr-owned pane location. It is presence metadata, never a provider session. */
export type HerdrPaneRef = string & { readonly [herdrPaneRefBrand]: "HerdrPaneRef" };

export type FabricAgentIdentity = {
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  agentId: AgentId;
  provider: string;
  modelFamily: string;
  providerSessionRef: ProviderSessionRef;
  providerSessionGeneration: number;
};

export type HerdrObservedIdentity = FabricAgentIdentity;

export type HerdrPaneObservation =
  | {
      state: "present";
      paneRef: HerdrPaneRef;
      observedAt: Timestamp;
      /** Structured metadata supplied for reconciliation; null means pane-only presence. */
      identity: HerdrObservedIdentity | null;
    }
  | {
      state: "absent" | "unavailable";
      observedAt: Timestamp;
      reason: string;
    };

export type IdentityField = keyof FabricAgentIdentity;

export type IdentityReconciliation =
  | {
      readiness: "ready";
      ready: true;
      paneRef: HerdrPaneRef;
    }
  | {
      readiness: "identity-unverified";
      ready: false;
      paneRef: HerdrPaneRef;
      reason: "pane presence is not provider-session evidence";
    }
  | {
      readiness: "identity-conflict";
      ready: false;
      paneRef: HerdrPaneRef;
      mismatches: readonly IdentityField[];
    }
  | {
      readiness: "visibility-degraded";
      ready: false;
      paneRef: null;
      reason: string;
      /** Herdr visibility cannot prove provider liveness or loss. */
      providerState: "unknown";
    };

export type ConsoleEnsurePaneIntent = {
  kind: "console.ensure-pane";
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  profileId: "agent-fabric-console";
};

export type AgentPaneClass = "chair" | "paired-primary" | "selected-long-running-worker";

export type AgentEnsurePaneIntent = {
  kind: "agent.ensure-pane";
  identity: FabricAgentIdentity;
  paneClass: AgentPaneClass;
  surface: "provider-tui" | "observer";
  placement: "beside-chair" | "workspace-default";
};

export type ArrangePanesIntent = {
  kind: "panes.arrange";
  paneRefs: readonly [HerdrPaneRef, ...HerdrPaneRef[]];
  layout: "side-by-side" | "workspace-default";
};

export type ProjectAgentMetadataIntent = {
  kind: "agent.project-metadata";
  agentId: AgentId;
  paneRef: HerdrPaneRef;
  metadata: {
    role: "chair" | "lead" | "worker" | "reviewer";
    provider: string;
    modelFamily: string;
    taskLabel: string;
    lifecycle: string;
    contextPressure: "low" | "medium" | "high" | "unknown";
  };
};

export type ProjectAttentionIntent = {
  kind: "attention.project";
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  itemId: string;
  revision: number;
  label: "Decision" | "Approval" | "Blocked" | "FYI";
  title: string;
};

export type FocusTargetIntent = {
  kind: "target.focus";
  target:
    | { kind: "agent-pane"; agentId: AgentId; paneRef: HerdrPaneRef }
    | { kind: "console-item"; view: ConsoleView; itemId: string; revision: number };
};

export type WakeAgentIntent = {
  kind: "agent.wake";
  agentId: AgentId;
  paneRef: HerdrPaneRef;
};

export type ShowNotificationIntent = {
  kind: "notification.show";
  attentionItemId: string;
  attentionRevision: number;
  title: string;
  body: string;
  focusTarget: Extract<FocusTargetIntent["target"], { kind: "console-item" }> | null;
};

export type FabricSteerReference =
  | {
      kind: "task";
      projectId: ProjectId;
      projectSessionId: ProjectSessionId;
      coordinationRunId: CoordinationRunId;
      taskId: TaskId;
      expectedRevision: number;
    }
  | {
      kind: "message";
      projectId: ProjectId;
      projectSessionId: ProjectSessionId;
      coordinationRunId: CoordinationRunId;
      taskId: TaskId;
      messageId: MessageId;
      expectedRevision: number;
    };

export type DirectSteerIntent = {
  kind: "steer.inject-fire-and-forget";
  targetAgentId: AgentId;
  paneRef: HerdrPaneRef;
  reference: FabricSteerReference;
  validatedReferenceDigest: Sha256Digest;
  prompt: string;
};

export type DirectSteerRequest = {
  actionId: ProviderActionId;
  fireAndForget: boolean;
  targetAgentId: AgentId;
  paneRef: HerdrPaneRef;
  reference: FabricSteerReference;
  prompt: string;
};

export type DirectSteerReferenceRejectionCode =
  | "unknown-reference"
  | "stale-reference"
  | "scope-mismatch";

export type FabricSteerReferenceValidation =
  | {
      status: "valid";
      referenceDigest: Sha256Digest;
      targetAgentId: AgentId;
      purpose: "steer" | "request" | "response";
      requiresAck: boolean;
      expectsResult: boolean;
      dependentBarrierId: BarrierId | null;
    }
  | {
      status: "rejected";
      code: DirectSteerReferenceRejectionCode;
      reason: string;
    };

export type HerdrIntent =
  | ConsoleEnsurePaneIntent
  | AgentEnsurePaneIntent
  | ArrangePanesIntent
  | ProjectAgentMetadataIntent
  | ProjectAttentionIntent
  | FocusTargetIntent
  | WakeAgentIntent
  | ShowNotificationIntent
  | DirectSteerIntent;

export type HerdrAppliedReceipt = {
  status: "applied";
  operation: HerdrIntent["kind"];
  /** Serialized evidence is revalidated on read and does not confer pane identity. */
  paneRef?: string;
  detail?: JsonValue;
};

export type HerdrDirectSteerReceipt = {
  status: "dispatched-unconfirmed";
  operation: "steer.inject-fire-and-forget";
  referenceValidation: "verified";
  deliveryEvidence: "none";
  canSatisfyExpectedResult: false;
  canCloseBarrier: false;
};

export type HerdrEffectReceipt = HerdrAppliedReceipt | HerdrDirectSteerReceipt;

export type HerdrActionRecord = {
  actionId: ProviderActionId;
  revision: number;
  intentDigest: Sha256Digest;
  status: "prepared" | "dispatched" | "ambiguous" | "terminal";
  receipt?: HerdrEffectReceipt;
  ambiguityReason?: string;
};

/** Fabric owns and persists these records; the Herdr package only consumes this port. */
export interface FabricActionJournalPort {
  readAction(actionId: ProviderActionId): Promise<HerdrActionRecord | null>;
  markDispatched(actionId: ProviderActionId, expectedRevision: number): Promise<HerdrActionRecord>;
  completeAction(
    actionId: ProviderActionId,
    expectedRevision: number,
    receipt: HerdrEffectReceipt,
  ): Promise<HerdrActionRecord>;
  markAmbiguous(
    actionId: ProviderActionId,
    expectedRevision: number,
    reason: string,
  ): Promise<HerdrActionRecord>;
}

/** Authoritative validation and action preparation are delegated back to Fabric. */
export interface FabricDirectSteerPort {
  validateSteerReference(reference: FabricSteerReference): Promise<FabricSteerReferenceValidation>;
  prepareDirectSteerAction(
    actionId: ProviderActionId,
    intent: DirectSteerIntent,
  ): Promise<HerdrActionRecord>;
}

/** Structured presence only. Implementations must not derive it from pane scrollback. */
export interface HerdrPresencePort {
  observeAgent(agentId: AgentId): Promise<HerdrPaneObservation>;
}

export type HerdrEffectLookup =
  | { status: "observed"; receipt: HerdrEffectReceipt }
  | { status: "absent" }
  | { status: "unknown" };

/** The only external-effect boundary. It intentionally exposes no arbitrary shell operation. */
export interface HerdrControlPort {
  lookupAction(actionId: ProviderActionId): Promise<HerdrEffectLookup>;
  ensureConsolePane(actionId: ProviderActionId, intent: ConsoleEnsurePaneIntent): Promise<HerdrEffectReceipt>;
  ensureAgentPane(actionId: ProviderActionId, intent: AgentEnsurePaneIntent): Promise<HerdrEffectReceipt>;
  arrangePanes(actionId: ProviderActionId, intent: ArrangePanesIntent): Promise<HerdrEffectReceipt>;
  projectAgentMetadata(actionId: ProviderActionId, intent: ProjectAgentMetadataIntent): Promise<HerdrEffectReceipt>;
  projectAttention(actionId: ProviderActionId, intent: ProjectAttentionIntent): Promise<HerdrEffectReceipt>;
  focusTarget(actionId: ProviderActionId, intent: FocusTargetIntent): Promise<HerdrEffectReceipt>;
  wakeAgent(actionId: ProviderActionId, intent: WakeAgentIntent): Promise<HerdrEffectReceipt>;
  showNotification(actionId: ProviderActionId, intent: ShowNotificationIntent): Promise<HerdrEffectReceipt>;
  injectDirectSteer(actionId: ProviderActionId, intent: DirectSteerIntent): Promise<void>;
}

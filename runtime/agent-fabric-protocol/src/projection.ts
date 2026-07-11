import type { OperatorCapabilityCredential, OperatorMutationContext } from "./operator.js";
import type { OperatorActionAvailability } from "./operator-actions.js";
import type {
  AgentId,
  ArtifactRef,
  CoordinationRunId,
  JsonValue,
  MessageId,
  ProjectId,
  ProjectSessionId,
  ProjectionCursor,
  Sha256Digest,
  TaskId,
  WorkstreamId,
  Timestamp,
} from "./primitives.js";
import type { ProjectSession } from "./project-session.js";

export type ProjectionSource = "fabric" | "delivery-run" | "git" | "github" | "herdr" | "provider";

export type ProjectionFact<T> =
  | {
      freshness: "live" | "snapshot" | "stale";
      source: ProjectionSource;
      revision: number;
      observedAt: Timestamp;
      value: T;
    }
  | {
      freshness: "unavailable";
      source: ProjectionSource;
      revision: number;
      observedAt: Timestamp;
      reason: string;
    }
  | {
      freshness: "conflict";
      source: ProjectionSource;
      revision: number;
      observedAt: Timestamp;
      candidates: readonly [T, T, ...T[]];
    };

export type AttentionItem = {
  itemId: string;
  revision: number;
  label: "Decision" | "Approval" | "Blocked" | "FYI";
  priority: "safety-integrity" | "critical-path" | "expiring-authority" | "acceptance-ready" | "advisory";
  title: string;
  sourceFreshness: "live" | "snapshot" | "stale" | "unavailable" | "conflict";
  lastEventAt: Timestamp;
  duplicateCount: number;
};

export type RunProjection = {
  runId: CoordinationRunId;
  phase: string;
  chairAgentId: AgentId;
  nextMilestone: string;
  health: "healthy" | "degraded" | "blocked" | "quarantined" | "unknown";
};

export type OperatorProjectionSnapshot = {
  schemaVersion: 1;
  snapshotRevision: number;
  readTransactionId: string;
  project: ProjectionFact<{ projectId: ProjectId; canonicalRoot: string }>;
  session: ProjectionFact<ProjectSession | null>;
  runs: ProjectionFact<readonly RunProjection[]>;
  attention: ProjectionFact<readonly AttentionItem[]>;
  capacity: ProjectionFact<Readonly<Record<string, JsonValue>>>;
  cursor: ProjectionCursor;
  stateDigest: Sha256Digest;
};

export type ProjectionEvent = {
  cursor: ProjectionCursor;
  projectSessionId: ProjectSessionId;
  kind: string;
  revision: number;
  occurredAt: Timestamp;
  payload: JsonValue;
};

export type ProjectionSnapshotRequest = {
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  projectSessionId?: ProjectSessionId;
};

export type ProjectionEventsRequest = ProjectionSnapshotRequest & {
  after: ProjectionCursor;
  limit: number;
};

export type ProjectionEventsResult = {
  status: "continuation";
  events: readonly ProjectionEvent[];
  nextCursor: ProjectionCursor;
  hasMore: boolean;
  snapshotRevision: number;
  readTransactionId: string;
} | {
  status: "resnapshot-required";
  reason: "retention-gap" | "project-cursor-mismatch" | "cursor-overflow";
  currentSnapshotRevision: number;
  snapshotCursor: ProjectionCursor;
};

export type ProjectSessionDiscovery = {
  projectSessionId: ProjectSessionId;
  mode: "coordinated" | "independent";
  state: ProjectSession["state"];
  revision: number;
  generation: number;
  lastEventAt: Timestamp;
};

export type ProjectDiscoveryRequest = {
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  after: number;
  limit: number;
};

export type ProjectDiscoveryResult = {
  project: ProjectionFact<{ projectId: ProjectId; canonicalRoot: string }>;
  sessions: ProjectionFact<{
    items: readonly ProjectSessionDiscovery[];
    nextCursor: number;
    hasMore: boolean;
  }>;
};

export type ConsoleView =
  | "attention"
  | "project"
  | "runs"
  | "work"
  | "agents"
  | "evidence"
  | "activity"
  | "system";

export type ProjectViewItem = {
  projectId: ProjectId;
  goal: string;
  acceptedScopeRef: ArtifactRef | null;
  repositoryRevision: string;
  github: ProjectionFact<{ repository: string; openPullRequests: number }>;
};

export type WorkViewItem = {
  taskId: TaskId;
  workstreamId: WorkstreamId | null;
  parentTaskId: TaskId | null;
  state: string;
  ownerAgentId: AgentId | null;
  sourcePrefixes: readonly string[];
  worktreePath: string | null;
  barrierIds: readonly string[];
  checkState: "pending" | "passing" | "failing" | "unknown";
};

export type AgentViewItem = {
  agentId: AgentId;
  stableTaskId: TaskId | null;
  stableWorkstreamId: WorkstreamId | null;
  role: "chair" | "lead" | "worker" | "reviewer";
  provider: string;
  modelFamily: string;
  providerSessionRef: string | null;
  providerSessionGeneration: number;
  lifecycle: string;
  contextPressure: "low" | "medium" | "high" | "unknown";
  visibility: ProjectionFact<{ paneRef: string | null }>;
};

export type EvidenceViewItem = {
  evidenceId: string;
  kind: "artifact" | "diff" | "test" | "review" | "receipt";
  artifactRef: ArtifactRef;
  taskId: TaskId | null;
  provenance: string;
  status: "pass" | "fail" | "pending" | "informational";
};

export type ActivityViewItem = {
  eventId: string;
  kind: "message" | "decision" | "lifecycle" | "operation";
  actorId: string | null;
  taskId: TaskId | null;
  summary: string;
  occurredAt: Timestamp;
  sourceRevision: number;
};

export type SystemViewItem = {
  componentId: string;
  kind: "daemon" | "adapter" | "trust" | "seat" | "integration";
  state: "healthy" | "degraded" | "stale" | "unavailable" | "conflict";
  generation: number;
  expiresAt: Timestamp | null;
  detail: string;
};

export type ProjectionViewItemMap = {
  attention: AttentionItem;
  project: ProjectViewItem;
  runs: RunProjection;
  work: WorkViewItem;
  agents: AgentViewItem;
  evidence: EvidenceViewItem;
  activity: ActivityViewItem;
  system: SystemViewItem;
};

export type ProjectionPageRequest<View extends ConsoleView = ConsoleView> = {
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  projectSessionId?: ProjectSessionId;
  view: View;
  after: number;
  limit: number;
};

export type ProjectionPageResult<View extends ConsoleView = ConsoleView> = View extends ConsoleView
  ? {
      view: View;
      page: ProjectionFact<{
        items: readonly ProjectionViewItemMap[View][];
        nextCursor: number;
        hasMore: boolean;
      }>;
    }
  : never;

export type OperatorDetailRef =
  | { kind: "project"; projectId: ProjectId; expectedRevision: number }
  | { kind: "session"; projectSessionId: ProjectSessionId; expectedRevision: number }
  | { kind: "run"; coordinationRunId: CoordinationRunId; expectedRevision: number }
  | { kind: "task"; taskId: TaskId; expectedRevision: number }
  | { kind: "agent"; agentId: AgentId; expectedRevision: number }
  | { kind: "evidence"; evidenceId: string; expectedRevision: number }
  | { kind: "activity"; eventId: string; expectedRevision: number }
  | { kind: "system"; componentId: string; expectedRevision: number };

export type OperatorViewSummaryMap = {
  attention: {
    kind: "attention";
    label: AttentionItem["label"];
    priority: AttentionItem["priority"];
    title: string;
  };
  project: { kind: "project"; goal: string; repositoryRevision: string };
  runs: { kind: "run"; phase: string; health: RunProjection["health"]; nextMilestone: string };
  work: { kind: "work"; state: string; checkState: WorkViewItem["checkState"] };
  agents: {
    kind: "agent";
    role: AgentViewItem["role"];
    lifecycle: string;
    contextPressure: AgentViewItem["contextPressure"];
  };
  evidence: {
    kind: "evidence";
    evidenceKind: EvidenceViewItem["kind"];
    status: EvidenceViewItem["status"];
    provenance: string;
  };
  activity: { kind: "activity"; activityKind: ActivityViewItem["kind"]; summary: string; occurredAt: Timestamp };
  system: { kind: "system"; systemKind: SystemViewItem["kind"]; state: SystemViewItem["state"]; detail: string };
};

export type OperatorViewDetailRefMap = {
  attention: OperatorDetailRef;
  project: Extract<OperatorDetailRef, { kind: "project" }>;
  runs: Extract<OperatorDetailRef, { kind: "run" }>;
  work: Extract<OperatorDetailRef, { kind: "task" }>;
  agents: Extract<OperatorDetailRef, { kind: "agent" }>;
  evidence: Extract<OperatorDetailRef, { kind: "evidence" }>;
  activity: Extract<OperatorDetailRef, { kind: "activity" }>;
  system: Extract<OperatorDetailRef, { kind: "system" }>;
};

export type OperatorViewRow<View extends ConsoleView = ConsoleView> = View extends ConsoleView
  ? {
      itemId: string;
      itemRevision: number;
      fact: ProjectionFact<{
        summary: OperatorViewSummaryMap[View];
        detailRef: OperatorViewDetailRefMap[View];
        actionAvailability: OperatorActionAvailability;
      }>;
    }
  : never;

export type OperatorViewPageRequest<View extends ConsoleView = ConsoleView> = {
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  projectSessionId?: ProjectSessionId;
  view: View;
  snapshotRevision: number;
  cursor: number;
  limit: number;
};

export type OperatorViewPageResult<View extends ConsoleView = ConsoleView> = View extends ConsoleView
  ?
      | {
          status: "page";
          view: View;
          rows: readonly OperatorViewRow<View>[];
          nextCursor: number;
          hasMore: boolean;
          snapshotRevision: number;
          readTransactionId: string;
        }
      | {
          status: "resnapshot-required";
          view: View;
          reason: "snapshot-mismatch" | "retention-gap" | "project-cursor-mismatch" | "cursor-overflow";
          currentSnapshotRevision: number;
          snapshotCursor: number;
        }
  : never;

export type OperatorDetail =
  | { kind: "project"; projectId: ProjectId; canonicalRoot: string; goal: string; repositoryRevision: string }
  | {
      kind: "session";
      projectSessionId: ProjectSessionId;
      mode: ProjectSession["mode"];
      state: ProjectSession["state"];
      generation: number;
      membershipRevision: number;
    }
  | {
      kind: "run";
      coordinationRunId: CoordinationRunId;
      phase: string;
      chairAgentId: AgentId;
      chairGeneration: number;
      health: RunProjection["health"];
    }
  | { kind: "task"; taskId: TaskId; objective: string; state: string; ownerAgentId: AgentId | null }
  | {
      kind: "agent";
      agentId: AgentId;
      role: AgentViewItem["role"];
      lifecycle: string;
      provider: string;
      providerSessionGeneration: number;
    }
  | {
      kind: "evidence";
      evidenceId: string;
      evidenceKind: EvidenceViewItem["kind"];
      artifactRef: ArtifactRef;
      status: EvidenceViewItem["status"];
    }
  | { kind: "activity"; eventId: string; activityKind: ActivityViewItem["kind"]; summary: string; occurredAt: Timestamp }
  | {
      kind: "system";
      componentId: string;
      systemKind: SystemViewItem["kind"];
      state: SystemViewItem["state"];
      generation: number;
      detail: string;
    };

export type OperatorDetailReadRequest = {
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  projectSessionId?: ProjectSessionId;
  snapshotRevision: number;
  detailRef: OperatorDetailRef;
};

export type OperatorDetailReadResult =
  | {
      status: "current";
      detailRef: OperatorDetailRef;
      detail: ProjectionFact<OperatorDetail>;
      snapshotRevision: number;
      readTransactionId: string;
    }
  | {
      status: "resnapshot-required";
      reason: "snapshot-mismatch" | "detail-revision-changed";
      currentSnapshotRevision: number;
    };

export type MessageBodyReadRequest = {
  credential: OperatorCapabilityCredential;
  projectSessionId: ProjectSessionId;
  messageId: MessageId;
  expectedRevision: number;
};

export type MessageBodyReadResult =
  | {
      available: true;
      messageId: MessageId;
      revision: number;
      body: string;
      terminalNeutralised: true;
      capabilityValuesRedacted: true;
      artifactRefs: readonly ArtifactRef[];
    }
  | { available: false; messageId: MessageId; revision: number; reason: "not-found" | "forbidden" | "expired" };

export type OperatorAttachment = {
  clientId: string;
  projectId: ProjectId;
  projectAuthorityGeneration: number;
  projectSessionId: ProjectSessionId | null;
  generation: number;
  expiresAt: Timestamp;
};

export type OperatorAttachRequest = {
  command: OperatorMutationContext;
  projectId: ProjectId;
  projectSessionId?: ProjectSessionId;
  expectedAttachmentGeneration?: number;
  requestedExpiresAt: Timestamp;
};
export type OperatorDetachRequest = { command: OperatorMutationContext; attachmentGeneration: number };
export type OperatorHeartbeatRequest = OperatorDetachRequest & { extendUntil: Timestamp };
export type OperatorCommandRequest = {
  command: OperatorMutationContext;
  action: "decide" | "steer" | "pause" | "resume" | "cancel" | "launch" | "git" | "external-effect";
  targetTaskId?: TaskId;
  payload: JsonValue;
};

import type { OperatorCapabilityCredential, OperatorMutationContext } from "./operator.js";
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
  events: readonly ProjectionEvent[];
  nextCursor: ProjectionCursor;
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
  projectSessionId: ProjectSessionId;
  generation: number;
  expiresAt: Timestamp;
};

export type OperatorAttachRequest = {
  command: OperatorMutationContext;
  projectSessionId: ProjectSessionId;
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

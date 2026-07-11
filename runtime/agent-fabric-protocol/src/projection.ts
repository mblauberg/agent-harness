import type {
  OperatorCapabilityCredential,
  OperatorInputAttestation,
  OperatorMutationContext,
} from "./operator.js";
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
  session: ProjectionFact<ProjectSession>;
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
  projectSessionId: ProjectSessionId;
};

export type ProjectionEventsRequest = ProjectionSnapshotRequest & {
  after: ProjectionCursor;
  limit: number;
};

export type ProjectionEventsResult = {
  events: readonly ProjectionEvent[];
  nextCursor: ProjectionCursor;
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
export type OperatorInputAttestRequest = { command: OperatorMutationContext; attestation: OperatorInputAttestation };

import type { ProtocolFeature } from "./features.js";
import type {
  ScopedGate,
  ScopedGateCheckRequest,
  ScopedGateCheckResult,
  ScopedGateCreateRequest,
  ScopedGateRebindRequest,
  ScopedGateResolveRequest,
} from "./gates.js";
import type { Intake, IntakeRevisionRequest, IntakeSubmission } from "./intake.js";
import type { MembershipBindRequest, MembershipBindResult } from "./membership.js";
import { FABRIC_OPERATIONS, type FabricOperation } from "./operations.js";
import type {
  ChairTakeoverRequest,
  OperatorCommandAudit,
  OperatorInputAttestation,
} from "./operator.js";
import type {
  MessageBodyReadRequest,
  MessageBodyReadResult,
  OperatorAttachRequest,
  OperatorAttachment,
  OperatorCommandRequest,
  OperatorDetachRequest,
  OperatorHeartbeatRequest,
  OperatorInputAttestRequest,
  OperatorProjectionSnapshot,
  ProjectionEventsRequest,
  ProjectionEventsResult,
  ProjectionSnapshotRequest,
} from "./projection.js";
import type {
  DaemonDrainRequest,
  DaemonStopRequest,
  ProjectSession,
  ProjectSessionCloseRequest,
  ProjectSessionCreateRequest,
  ProjectSessionDrainRequest,
  ProjectSessionGetRequest,
  ProjectSessionStopRequest,
  ProjectSessionTransitionRequest,
} from "./project-session.js";
import type {
  AgentId,
  CallbackId,
  CommandId,
  JsonValue,
  OperatorId,
  ProjectId,
  ProjectSessionId,
  Sha256Digest,
  Timestamp,
} from "./primitives.js";
import type {
  ResultDelivery,
  ResultDeliveryAbandonRequest,
  ResultDeliveryClaimRequest,
  ResultDeliveryConsumeRequest,
  ResultDeliveryProviderAcceptRequest,
  ResultDeliveryReassignRequest,
  ResultDeliveryRetryRequest,
  TaskCompleteWithReply,
  TaskRequest,
} from "./request-result.js";
import type {
  ResourceReconcileRequest,
  ResourceReleaseRequest,
  ResourceReservation,
  ResourceReservationRequest,
} from "./resources.js";

export type ProtocolLimits = {
  maximumFrameBytes: number;
  maximumPendingCalls: number;
  maximumInFlightPerConnection: number;
  idleTimeoutMs: number;
  requestTimeoutMs: number;
};

export const PROTOCOL_LIMITS: Readonly<ProtocolLimits> = Object.freeze({
  maximumFrameBytes: 1_048_576,
  maximumPendingCalls: 32,
  maximumInFlightPerConnection: 16,
  idleTimeoutMs: 300_000,
  requestTimeoutMs: 30_000,
});

export type ProtocolPrincipal =
  | { kind: "operator"; operatorId: OperatorId; projectId: ProjectId; principalGeneration: number }
  | {
      kind: "agent";
      agentId: AgentId;
      projectSessionId: ProjectSessionId;
      runId: string;
      principalGeneration: number;
    };

export type ProtocolInitializeRequest = {
  protocolVersion: 1;
  client: { name: string; version: string };
  principal: ProtocolPrincipal;
  requiredFeatures: readonly ProtocolFeature[];
  optionalFeatures: readonly ProtocolFeature[];
};

export type ProtocolInitializeResult = {
  protocolVersion: 1;
  daemonVersion: string;
  daemonInstanceGeneration: number;
  features: readonly ProtocolFeature[];
  limits: ProtocolLimits;
};

export type OperationInputMap = {
  [FABRIC_OPERATIONS.projectSessionCreate]: ProjectSessionCreateRequest;
  [FABRIC_OPERATIONS.projectSessionGet]: ProjectSessionGetRequest;
  [FABRIC_OPERATIONS.projectSessionTransition]: ProjectSessionTransitionRequest;
  [FABRIC_OPERATIONS.projectSessionClose]: ProjectSessionCloseRequest;
  [FABRIC_OPERATIONS.membershipBind]: MembershipBindRequest;
  [FABRIC_OPERATIONS.operatorAttach]: OperatorAttachRequest;
  [FABRIC_OPERATIONS.operatorDetach]: OperatorDetachRequest;
  [FABRIC_OPERATIONS.operatorHeartbeat]: OperatorHeartbeatRequest;
  [FABRIC_OPERATIONS.operatorCommand]: OperatorCommandRequest;
  [FABRIC_OPERATIONS.operatorInputAttest]: OperatorInputAttestRequest;
  [FABRIC_OPERATIONS.intakeSubmit]: IntakeSubmission;
  [FABRIC_OPERATIONS.intakeRevise]: IntakeRevisionRequest;
  [FABRIC_OPERATIONS.scopedGateCreate]: ScopedGateCreateRequest;
  [FABRIC_OPERATIONS.scopedGateRebind]: ScopedGateRebindRequest;
  [FABRIC_OPERATIONS.scopedGateResolve]: ScopedGateResolveRequest;
  [FABRIC_OPERATIONS.scopedGateCheck]: ScopedGateCheckRequest;
  [FABRIC_OPERATIONS.resourceReserve]: ResourceReservationRequest;
  [FABRIC_OPERATIONS.resourceRelease]: ResourceReleaseRequest;
  [FABRIC_OPERATIONS.resourceReconcile]: ResourceReconcileRequest;
  [FABRIC_OPERATIONS.taskRequest]: TaskRequest;
  [FABRIC_OPERATIONS.taskCompleteWithReply]: TaskCompleteWithReply;
  [FABRIC_OPERATIONS.resultDeliveryClaim]: ResultDeliveryClaimRequest;
  [FABRIC_OPERATIONS.resultDeliveryProviderAccept]: ResultDeliveryProviderAcceptRequest;
  [FABRIC_OPERATIONS.resultDeliveryConsume]: ResultDeliveryConsumeRequest;
  [FABRIC_OPERATIONS.resultDeliveryRetry]: ResultDeliveryRetryRequest;
  [FABRIC_OPERATIONS.resultDeliveryReassign]: ResultDeliveryReassignRequest;
  [FABRIC_OPERATIONS.resultDeliveryAbandon]: ResultDeliveryAbandonRequest;
  [FABRIC_OPERATIONS.chairTakeover]: ChairTakeoverRequest;
  [FABRIC_OPERATIONS.projectionSnapshot]: ProjectionSnapshotRequest;
  [FABRIC_OPERATIONS.projectionEvents]: ProjectionEventsRequest;
  [FABRIC_OPERATIONS.messageBodyRead]: MessageBodyReadRequest;
  [FABRIC_OPERATIONS.projectSessionDrain]: ProjectSessionDrainRequest;
  [FABRIC_OPERATIONS.projectSessionStop]: ProjectSessionStopRequest;
  [FABRIC_OPERATIONS.daemonDrain]: DaemonDrainRequest;
  [FABRIC_OPERATIONS.daemonStop]: DaemonStopRequest;
};

export type ChairTakeoverResult = {
  projectSessionId: ProjectSessionId;
  sessionRevision: number;
  runRevision: number;
  chairAgentId: AgentId;
  chairGeneration: number;
};

export type TaskRequestCommit = {
  taskRevision: number;
  requestRevision: number;
  callbackId: CallbackId;
  callbackGeneration: number;
};

export type TaskCompletionCommit = {
  taskRevision: number;
  replyRevision: number;
  resultDelivery: ResultDelivery;
};

export type DaemonLifecycleResult = {
  daemonInstanceGeneration: number;
  globalStateRevision: number;
  state: "running" | "quiescing" | "stopped" | "busy";
  receiptDigest: Sha256Digest;
};

export type OperationResultMap = {
  [FABRIC_OPERATIONS.projectSessionCreate]: ProjectSession;
  [FABRIC_OPERATIONS.projectSessionGet]: ProjectSession;
  [FABRIC_OPERATIONS.projectSessionTransition]: ProjectSession;
  [FABRIC_OPERATIONS.projectSessionClose]: ProjectSession;
  [FABRIC_OPERATIONS.membershipBind]: MembershipBindResult;
  [FABRIC_OPERATIONS.operatorAttach]: OperatorAttachment;
  [FABRIC_OPERATIONS.operatorDetach]: { detached: true; revision: number };
  [FABRIC_OPERATIONS.operatorHeartbeat]: OperatorAttachment;
  [FABRIC_OPERATIONS.operatorCommand]: OperatorCommandAudit;
  [FABRIC_OPERATIONS.operatorInputAttest]: OperatorInputAttestation;
  [FABRIC_OPERATIONS.intakeSubmit]: Intake;
  [FABRIC_OPERATIONS.intakeRevise]: Intake;
  [FABRIC_OPERATIONS.scopedGateCreate]: ScopedGate;
  [FABRIC_OPERATIONS.scopedGateRebind]: ScopedGate;
  [FABRIC_OPERATIONS.scopedGateResolve]: ScopedGate;
  [FABRIC_OPERATIONS.scopedGateCheck]: ScopedGateCheckResult;
  [FABRIC_OPERATIONS.resourceReserve]: ResourceReservation;
  [FABRIC_OPERATIONS.resourceRelease]: ResourceReservation;
  [FABRIC_OPERATIONS.resourceReconcile]: ResourceReservation;
  [FABRIC_OPERATIONS.taskRequest]: TaskRequestCommit;
  [FABRIC_OPERATIONS.taskCompleteWithReply]: TaskCompletionCommit;
  [FABRIC_OPERATIONS.resultDeliveryClaim]: ResultDelivery;
  [FABRIC_OPERATIONS.resultDeliveryProviderAccept]: ResultDelivery;
  [FABRIC_OPERATIONS.resultDeliveryConsume]: ResultDelivery;
  [FABRIC_OPERATIONS.resultDeliveryRetry]: ResultDelivery;
  [FABRIC_OPERATIONS.resultDeliveryReassign]: ResultDelivery;
  [FABRIC_OPERATIONS.resultDeliveryAbandon]: ResultDelivery;
  [FABRIC_OPERATIONS.chairTakeover]: ChairTakeoverResult;
  [FABRIC_OPERATIONS.projectionSnapshot]: OperatorProjectionSnapshot;
  [FABRIC_OPERATIONS.projectionEvents]: ProjectionEventsResult;
  [FABRIC_OPERATIONS.messageBodyRead]: MessageBodyReadResult;
  [FABRIC_OPERATIONS.projectSessionDrain]: ProjectSession;
  [FABRIC_OPERATIONS.projectSessionStop]: ProjectSession;
  [FABRIC_OPERATIONS.daemonDrain]: DaemonLifecycleResult;
  [FABRIC_OPERATIONS.daemonStop]: DaemonLifecycleResult;
};

export type ProtocolRequest<Operation extends FabricOperation = FabricOperation> = {
  id: string;
  operation: Operation;
  input: OperationInputMap[Operation];
};

export type ProtocolErrorCode =
  | "PROTOCOL_INVALID"
  | "PROTOCOL_UNSUPPORTED"
  | "FEATURE_UNAVAILABLE"
  | "AUTHENTICATION_FAILED"
  | "CAPABILITY_FORBIDDEN"
  | "CAPABILITY_EXPIRED"
  | "CAPABILITY_REVOKED"
  | "WRONG_PROJECT"
  | "STALE_GENERATION"
  | "STALE_REVISION"
  | "DEDUPE_CONFLICT"
  | "GATE_BLOCKED"
  | "RESOURCE_EXHAUSTED"
  | "RESOURCE_USAGE_UNKNOWN"
  | "NOT_FOUND"
  | "OVERLOADED"
  | "DEADLINE_EXCEEDED"
  | "CONFLICT"
  | "RECOVERY_REQUIRED";

export type ProtocolFailure = {
  code: ProtocolErrorCode;
  message: string;
  retryable: boolean;
  details?: JsonValue;
};

export type ProtocolResponse<Operation extends FabricOperation = FabricOperation> =
  | { id: string; ok: true; operation: Operation; result: OperationResultMap[Operation] }
  | { id: string; ok: false; operation: Operation; error: ProtocolFailure };

export type AuditedCommandReceipt = {
  commandId: CommandId;
  committedAt: Timestamp;
  beforeDigest: Sha256Digest;
  afterDigest: Sha256Digest;
};

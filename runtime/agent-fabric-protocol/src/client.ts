import type { ProtocolFeature } from "./features.js";
import type {
  ScopedGate,
  ScopedGateCheckRequest,
  ScopedGateCheckResult,
  ScopedGateCreateRequest,
  ScopedGateResolveRequest,
} from "./gates.js";
import type { Intake, IntakeRevisionRequest, IntakeSubmission } from "./intake.js";
import type { MembershipBindRequest, MembershipBindResult } from "./membership.js";
import { FABRIC_OPERATIONS, type BaselineOperation, type FabricOperation } from "./operations.js";
import type {
  ChairTakeoverRequest,
  IntegrationInputAttestationRequest,
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
  OperatorProjectionSnapshot,
  ProjectDiscoveryRequest,
  ProjectDiscoveryResult,
  ProjectionPageRequest,
  ProjectionPageResult,
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
  ChairTakeoverResult,
  DaemonLifecycleResult,
  OperationInputMap,
  OperationResultMap,
  TaskCompletionCommit,
  TaskRequestCommit,
} from "./rpc-contract.js";
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

export interface ProtocolRpcTransport {
  readonly features: readonly ProtocolFeature[];
  call<Operation extends keyof OperationInputMap & FabricOperation>(
    operation: Operation,
    input: OperationInputMap[Operation],
  ): Promise<OperationResultMap[Operation]>;
  close(): Promise<void>;
}

export interface ProjectSessionClient {
  create(input: ProjectSessionCreateRequest): Promise<ProjectSession>;
  get(input: ProjectSessionGetRequest): Promise<ProjectSession>;
  transition(input: ProjectSessionTransitionRequest): Promise<ProjectSession>;
  close(input: ProjectSessionCloseRequest): Promise<ProjectSession>;
  bindMembership(input: MembershipBindRequest): Promise<MembershipBindResult>;
}

export interface BaselineFabricClient {
  call<Operation extends BaselineOperation>(
    operation: Operation,
    input: OperationInputMap[Operation],
  ): Promise<OperationResultMap[Operation]>;
}

export interface OperatorControlClient {
  attach(input: OperatorAttachRequest): Promise<OperatorAttachment>;
  detach(input: OperatorDetachRequest): Promise<{ detached: true; revision: number }>;
  heartbeat(input: OperatorHeartbeatRequest): Promise<OperatorAttachment>;
  command(input: OperatorCommandRequest): Promise<OperatorCommandAudit>;
}

export interface IntakeClient {
  submit(input: IntakeSubmission): Promise<Intake>;
  revise(input: IntakeRevisionRequest): Promise<Intake>;
}

export interface ScopedGateClient {
  create(input: ScopedGateCreateRequest): Promise<ScopedGate>;
  resolve(input: ScopedGateResolveRequest): Promise<ScopedGate>;
  check(input: ScopedGateCheckRequest): Promise<ScopedGateCheckResult>;
}

export interface ResourceReservationClient {
  reserve(input: ResourceReservationRequest): Promise<ResourceReservation>;
  release(input: ResourceReleaseRequest): Promise<ResourceReservation>;
  reconcile(input: ResourceReconcileRequest): Promise<ResourceReservation>;
}

export interface RequestResultClient {
  request(input: TaskRequest): Promise<TaskRequestCommit>;
  completeWithReply(input: TaskCompleteWithReply): Promise<TaskCompletionCommit>;
  claim(input: ResultDeliveryClaimRequest): Promise<ResultDelivery>;
  providerAccept(input: ResultDeliveryProviderAcceptRequest): Promise<ResultDelivery>;
  consume(input: ResultDeliveryConsumeRequest): Promise<ResultDelivery>;
  retry(input: ResultDeliveryRetryRequest): Promise<ResultDelivery>;
  reassign(input: ResultDeliveryReassignRequest): Promise<ResultDelivery>;
  abandon(input: ResultDeliveryAbandonRequest): Promise<ResultDelivery>;
}

export interface TakeoverClient {
  takeOver(input: ChairTakeoverRequest): Promise<ChairTakeoverResult>;
}

export interface ProjectionClient {
  discover(input: ProjectDiscoveryRequest): Promise<ProjectDiscoveryResult>;
  snapshot(input: ProjectionSnapshotRequest): Promise<OperatorProjectionSnapshot>;
  page(input: ProjectionPageRequest): Promise<ProjectionPageResult>;
  events(input: ProjectionEventsRequest): Promise<ProjectionEventsResult>;
}

export interface InputAttestationClient {
  attestInput(input: IntegrationInputAttestationRequest): Promise<OperatorInputAttestation>;
}

export interface MessageBodyClient {
  read(input: MessageBodyReadRequest): Promise<MessageBodyReadResult>;
}

export interface LifecycleControlClient {
  drainProjectSession(input: ProjectSessionDrainRequest): Promise<ProjectSession>;
  stopProjectSession(input: ProjectSessionStopRequest): Promise<ProjectSession>;
  drainDaemon(input: DaemonDrainRequest): Promise<DaemonLifecycleResult>;
  stopDaemon(input: DaemonStopRequest): Promise<DaemonLifecycleResult>;
}

export type NegotiatedOperatorClient = {
  kind: "operator";
  features: readonly ProtocolFeature[];
  projectSessions?: ProjectSessionClient;
  operatorControl?: OperatorControlClient;
  intakes?: IntakeClient;
  gates?: ScopedGateClient;
  resources?: ResourceReservationClient;
  takeover?: TakeoverClient;
  projection?: ProjectionClient;
  messages?: MessageBodyClient;
  lifecycle?: LifecycleControlClient;
  close(): Promise<void>;
};

export type NegotiatedAgentClient = {
  kind: "agent";
  features: readonly ProtocolFeature[];
  core?: BaselineFabricClient;
  gates?: Pick<ScopedGateClient, "check">;
  resources?: ResourceReservationClient;
  requestResults?: RequestResultClient;
  close(): Promise<void>;
};

export type NegotiatedIntegrationClient = {
  kind: "integration";
  features: readonly ProtocolFeature[];
  inputAttestation?: InputAttestationClient;
  close(): Promise<void>;
};

function hasFeature(transport: ProtocolRpcTransport, feature: ProtocolFeature): boolean {
  return transport.features.includes(feature);
}

function projectSessions(transport: ProtocolRpcTransport): ProjectSessionClient {
  return {
    create: (input) => transport.call(FABRIC_OPERATIONS.projectSessionCreate, input),
    get: (input) => transport.call(FABRIC_OPERATIONS.projectSessionGet, input),
    transition: (input) => transport.call(FABRIC_OPERATIONS.projectSessionTransition, input),
    close: (input) => transport.call(FABRIC_OPERATIONS.projectSessionClose, input),
    bindMembership: (input) => transport.call(FABRIC_OPERATIONS.membershipBind, input),
  };
}

function operatorControl(transport: ProtocolRpcTransport): OperatorControlClient {
  return {
    attach: (input) => transport.call(FABRIC_OPERATIONS.operatorAttach, input),
    detach: (input) => transport.call(FABRIC_OPERATIONS.operatorDetach, input),
    heartbeat: (input) => transport.call(FABRIC_OPERATIONS.operatorHeartbeat, input),
    command: (input) => transport.call(FABRIC_OPERATIONS.operatorCommand, input),
  };
}

function intakes(transport: ProtocolRpcTransport): IntakeClient {
  return {
    submit: (input) => transport.call(FABRIC_OPERATIONS.intakeSubmit, input),
    revise: (input) => transport.call(FABRIC_OPERATIONS.intakeRevise, input),
  };
}

function gates(transport: ProtocolRpcTransport): ScopedGateClient {
  return {
    create: (input) => transport.call(FABRIC_OPERATIONS.scopedGateCreate, input),
    resolve: (input) => transport.call(FABRIC_OPERATIONS.scopedGateResolve, input),
    check: (input) => transport.call(FABRIC_OPERATIONS.scopedGateCheck, input),
  };
}

function resources(transport: ProtocolRpcTransport): ResourceReservationClient {
  return {
    reserve: (input) => transport.call(FABRIC_OPERATIONS.resourceReserve, input),
    release: (input) => transport.call(FABRIC_OPERATIONS.resourceRelease, input),
    reconcile: (input) => transport.call(FABRIC_OPERATIONS.resourceReconcile, input),
  };
}

function requestResults(transport: ProtocolRpcTransport): RequestResultClient {
  return {
    request: (input) => transport.call(FABRIC_OPERATIONS.taskRequest, input),
    completeWithReply: (input) => transport.call(FABRIC_OPERATIONS.taskCompleteWithReply, input),
    claim: (input) => transport.call(FABRIC_OPERATIONS.resultDeliveryClaim, input),
    providerAccept: (input) => transport.call(FABRIC_OPERATIONS.resultDeliveryProviderAccept, input),
    consume: (input) => transport.call(FABRIC_OPERATIONS.resultDeliveryConsume, input),
    retry: (input) => transport.call(FABRIC_OPERATIONS.resultDeliveryRetry, input),
    reassign: (input) => transport.call(FABRIC_OPERATIONS.resultDeliveryReassign, input),
    abandon: (input) => transport.call(FABRIC_OPERATIONS.resultDeliveryAbandon, input),
  };
}

function lifecycle(transport: ProtocolRpcTransport): LifecycleControlClient {
  return {
    drainProjectSession: (input) => transport.call(FABRIC_OPERATIONS.projectSessionDrain, input),
    stopProjectSession: (input) => transport.call(FABRIC_OPERATIONS.projectSessionStop, input),
    drainDaemon: (input) => transport.call(FABRIC_OPERATIONS.daemonDrain, input),
    stopDaemon: (input) => transport.call(FABRIC_OPERATIONS.daemonStop, input),
  };
}

export function createOperatorClient(transport: ProtocolRpcTransport): NegotiatedOperatorClient {
  return {
    kind: "operator",
    features: [...transport.features],
    ...(hasFeature(transport, "project-sessions.v1") ? { projectSessions: projectSessions(transport) } : {}),
    ...(hasFeature(transport, "operator-control.v1") ? { operatorControl: operatorControl(transport) } : {}),
    ...(hasFeature(transport, "intakes.v1") ? { intakes: intakes(transport) } : {}),
    ...(hasFeature(transport, "scoped-gates.v1") ? { gates: gates(transport) } : {}),
    ...(hasFeature(transport, "resource-reservations.v1") ? { resources: resources(transport) } : {}),
    ...(hasFeature(transport, "chair-takeover.v1")
      ? { takeover: { takeOver: (input: ChairTakeoverRequest) => transport.call(FABRIC_OPERATIONS.chairTakeover, input) } }
      : {}),
    ...(hasFeature(transport, "operator-projection.v1")
      ? {
          projection: {
            discover: (input: ProjectDiscoveryRequest) => transport.call(FABRIC_OPERATIONS.projectDiscover, input),
            snapshot: (input: ProjectionSnapshotRequest) => transport.call(FABRIC_OPERATIONS.projectionSnapshot, input),
            page: (input: ProjectionPageRequest) => transport.call(FABRIC_OPERATIONS.projectionPage, input),
            events: (input: ProjectionEventsRequest) => transport.call(FABRIC_OPERATIONS.projectionEvents, input),
          },
        }
      : {}),
    ...(hasFeature(transport, "message-body-read.v1")
      ? { messages: { read: (input: MessageBodyReadRequest) => transport.call(FABRIC_OPERATIONS.messageBodyRead, input) } }
      : {}),
    ...(hasFeature(transport, "lifecycle-control.v1") ? { lifecycle: lifecycle(transport) } : {}),
    close: () => transport.close(),
  };
}

export function createAgentClient(transport: ProtocolRpcTransport): NegotiatedAgentClient {
  return {
    kind: "agent",
    features: [...transport.features],
    ...(hasFeature(transport, "fabric-core.v1")
      ? {
          core: {
            call: <Operation extends BaselineOperation>(
              operation: Operation,
              input: OperationInputMap[Operation],
            ) => transport.call(operation, input),
          },
        }
      : {}),
    ...(hasFeature(transport, "scoped-gates.v1")
      ? { gates: { check: (input: ScopedGateCheckRequest) => transport.call(FABRIC_OPERATIONS.scopedGateCheck, input) } }
      : {}),
    ...(hasFeature(transport, "resource-reservations.v1") ? { resources: resources(transport) } : {}),
    ...(hasFeature(transport, "request-results.v1") ? { requestResults: requestResults(transport) } : {}),
    close: () => transport.close(),
  };
}

export function createIntegrationClient(transport: ProtocolRpcTransport): NegotiatedIntegrationClient {
  return {
    kind: "integration",
    features: [...transport.features],
    ...(hasFeature(transport, "input-attestation.v1")
      ? {
          inputAttestation: {
            attestInput: (input: IntegrationInputAttestationRequest) =>
              transport.call(FABRIC_OPERATIONS.integrationInputAttest, input),
          },
        }
      : {}),
    close: () => transport.close(),
  };
}

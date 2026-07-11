import type { OperatorMutationContext } from "./operator.js";
import type {
  ArtifactObligationId,
  BarrierId,
  CoordinationRunId,
  GateId,
  LeaseId,
  MembershipId,
  MessageId,
  ProjectSessionId,
  ProviderActionId,
  TaskId,
  WorkstreamId,
} from "./primitives.js";

export type MembershipDisposition =
  | { state: "active" }
  | { state: "terminal" }
  | { state: "abandoned"; reason: string };

export type ProjectSessionMember = MembershipDisposition & (
  | { kind: "coordination-run"; membershipId: MembershipId; runId: CoordinationRunId }
  | { kind: "workstream"; membershipId: MembershipId; workstreamId: WorkstreamId }
  | { kind: "task"; membershipId: MembershipId; taskId: TaskId }
  | { kind: "lease"; membershipId: MembershipId; leaseId: LeaseId }
  | { kind: "provider-action"; membershipId: MembershipId; providerActionId: ProviderActionId }
  | { kind: "required-message"; membershipId: MembershipId; messageId: MessageId }
  | { kind: "artifact-obligation"; membershipId: MembershipId; artifactObligationId: ArtifactObligationId }
  | { kind: "gate"; membershipId: MembershipId; gateId: GateId }
  | { kind: "scoped-barrier"; membershipId: MembershipId; barrierId: BarrierId }
);

export type MembershipBindRequest = {
  command: OperatorMutationContext;
  projectSessionId: ProjectSessionId;
  expectedMembershipRevision: number;
  members: readonly ProjectSessionMember[];
};

export type MembershipBindResult = {
  projectSessionId: ProjectSessionId;
  membershipRevision: number;
  members: readonly ProjectSessionMember[];
};

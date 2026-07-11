import {
  parseChairMutationContext,
  parseOperatorMutationContext,
  type ChairMutationContext,
  type OperatorMutationContext,
} from "./operator.js";
import { parseIdentifier, requiredString, safeInteger, strictRecord } from "./primitives.js";
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

type MembershipBindBase = {
  projectSessionId: ProjectSessionId;
  expectedMembershipRevision: number;
  members: readonly ProjectSessionMember[];
};

export type MembershipBindRequest = MembershipBindBase & (
  | { origin: "operator"; command: OperatorMutationContext }
  | { origin: "chair"; command: ChairMutationContext }
);

export type MembershipBindResult = {
  projectSessionId: ProjectSessionId;
  membershipRevision: number;
  members: readonly ProjectSessionMember[];
};

const memberIdentityFields = {
  "coordination-run": "runId",
  workstream: "workstreamId",
  task: "taskId",
  lease: "leaseId",
  "provider-action": "providerActionId",
  "required-message": "messageId",
  "artifact-obligation": "artifactObligationId",
  gate: "gateId",
  "scoped-barrier": "barrierId",
} as const;

function parseProjectSessionMember(value: unknown, index: number): ProjectSessionMember {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`membershipBind.members[${String(index)}] must be an object`);
  }
  const kind: unknown = Reflect.get(value, "kind");
  if (typeof kind !== "string" || !Object.hasOwn(memberIdentityFields, kind)) {
    throw new TypeError(`membershipBind.members[${String(index)}].kind is invalid`);
  }
  const memberKind = kind as keyof typeof memberIdentityFields;
  const identityField = memberIdentityFields[memberKind];
  const state: unknown = Reflect.get(value, "state");
  const fields = ["kind", "membershipId", identityField, "state", ...(state === "abandoned" ? ["reason"] : [])];
  const record = strictRecord(value, `membershipBind.members[${String(index)}]`, fields);
  const identity = parseIdentifier<string>(record[identityField], `membershipBind.members[${String(index)}].${identityField}`);
  const common = {
    kind: memberKind,
    membershipId: parseIdentifier<"MembershipId">(
      record.membershipId,
      `membershipBind.members[${String(index)}].membershipId`,
    ),
    [identityField]: identity,
  };
  if (state === "active" || state === "terminal") {
    return { ...common, state } as ProjectSessionMember;
  }
  if (state === "abandoned") {
    return {
      ...common,
      state,
      reason: requiredString(record.reason, `membershipBind.members[${String(index)}].reason`),
    } as ProjectSessionMember;
  }
  throw new TypeError(`membershipBind.members[${String(index)}].state is invalid`);
}

export function parseMembershipBindRequest(value: unknown): MembershipBindRequest {
  const record = strictRecord(value, "membershipBind", [
    "origin",
    "command",
    "projectSessionId",
    "expectedMembershipRevision",
    "members",
  ]);
  if (!Array.isArray(record.members)) throw new TypeError("membershipBind.members must be an array");
  const base = {
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, "membershipBind.projectSessionId"),
    expectedMembershipRevision: safeInteger(
      record.expectedMembershipRevision,
      "membershipBind.expectedMembershipRevision",
    ),
    members: record.members.map(parseProjectSessionMember),
  };
  if (record.origin === "operator") {
    const command = parseOperatorMutationContext(record.command, "membershipBind.command");
    if (command.expectedRevision !== base.expectedMembershipRevision) {
      throw new TypeError("membershipBind command revision does not match membership revision");
    }
    return { ...base, origin: "operator", command };
  }
  if (record.origin === "chair") {
    const command = parseChairMutationContext(record.command, "membershipBind.command");
    if (command.expectedRevision !== base.expectedMembershipRevision) {
      throw new TypeError("membershipBind command revision does not match membership revision");
    }
    return { ...base, origin: "chair", command };
  }
  throw new TypeError("membershipBind.origin must be operator or chair");
}

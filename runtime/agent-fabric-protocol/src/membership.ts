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
  | { kind: "coordination-run"; membershipId: MembershipId; coordinationRunId: CoordinationRunId; runId: CoordinationRunId }
  | { kind: "workstream"; membershipId: MembershipId; coordinationRunId: CoordinationRunId; workstreamId: WorkstreamId }
  | { kind: "task"; membershipId: MembershipId; coordinationRunId: CoordinationRunId; taskId: TaskId }
  | { kind: "lease"; membershipId: MembershipId; coordinationRunId: CoordinationRunId; leaseId: LeaseId }
  | { kind: "provider-action"; membershipId: MembershipId; coordinationRunId: CoordinationRunId; providerAdapterId: string; providerActionId: ProviderActionId }
  | { kind: "required-message"; membershipId: MembershipId; coordinationRunId: CoordinationRunId; messageId: MessageId }
  | { kind: "artifact-obligation"; membershipId: MembershipId; coordinationRunId: CoordinationRunId; artifactObligationId: ArtifactObligationId }
  | { kind: "gate"; membershipId: MembershipId; coordinationRunId: CoordinationRunId; gateId: GateId }
  | { kind: "scoped-barrier"; membershipId: MembershipId; coordinationRunId: CoordinationRunId; barrierId: BarrierId }
);

type MembershipBindBase = {
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  expectedMembershipRevision: number;
  members: readonly ProjectSessionMember[];
};

export type MembershipBindRequest = MembershipBindBase & (
  | { origin: "operator"; command: OperatorMutationContext }
  | { origin: "chair"; command: ChairMutationContext }
);

export type MembershipBindResult = {
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
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
  const fields = [
    "kind",
    "membershipId",
    "coordinationRunId",
    identityField,
    ...(memberKind === "provider-action" ? ["providerAdapterId"] : []),
    "state",
    ...(state === "abandoned" ? ["reason"] : []),
  ];
  const record = strictRecord(value, `membershipBind.members[${String(index)}]`, fields);
  const identity = parseIdentifier<string>(record[identityField], `membershipBind.members[${String(index)}].${identityField}`);
  const common = {
    kind: memberKind,
    membershipId: parseIdentifier<"MembershipId">(
      record.membershipId,
      `membershipBind.members[${String(index)}].membershipId`,
    ),
    coordinationRunId: parseIdentifier<"CoordinationRunId">(
      record.coordinationRunId,
      `membershipBind.members[${String(index)}].coordinationRunId`,
    ),
    [identityField]: identity,
    ...(memberKind === "provider-action"
      ? {
          providerAdapterId: parseIdentifier<"ProviderAdapterId">(
            record.providerAdapterId,
            `membershipBind.members[${String(index)}].providerAdapterId`,
          ),
        }
      : {}),
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

function assertMemberRunBinding(
  coordinationRunId: CoordinationRunId,
  members: readonly ProjectSessionMember[],
): void {
  for (const [index, member] of members.entries()) {
    if (member.coordinationRunId !== coordinationRunId) {
      throw new TypeError(`membershipBind.members[${String(index)}] coordination run does not match batch`);
    }
    if (member.kind === "coordination-run" && member.runId !== coordinationRunId) {
      throw new TypeError(`membershipBind.members[${String(index)}] run ID does not match batch`);
    }
  }
}

export function parseMembershipBindRequest(value: unknown): MembershipBindRequest {
  const record = strictRecord(value, "membershipBind", [
    "origin",
    "command",
    "projectSessionId",
    "coordinationRunId",
    "expectedMembershipRevision",
    "members",
  ]);
  if (!Array.isArray(record.members)) throw new TypeError("membershipBind.members must be an array");
  const projectSessionId = parseIdentifier<"ProjectSessionId">(
    record.projectSessionId,
    "membershipBind.projectSessionId",
  );
  const coordinationRunId = parseIdentifier<"CoordinationRunId">(
    record.coordinationRunId,
    "membershipBind.coordinationRunId",
  );
  const members = record.members.map(parseProjectSessionMember);
  assertMemberRunBinding(coordinationRunId, members);
  const base = {
    projectSessionId,
    coordinationRunId,
    expectedMembershipRevision: safeInteger(
      record.expectedMembershipRevision,
      "membershipBind.expectedMembershipRevision",
    ),
    members,
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
    if (command.projectSessionId !== projectSessionId || command.coordinationRunId !== coordinationRunId) {
      throw new TypeError("membershipBind chair command session or run does not match batch");
    }
    return { ...base, origin: "chair", command };
  }
  throw new TypeError("membershipBind.origin must be operator or chair");
}

export function parseMembershipBindResult(value: unknown): MembershipBindResult {
  const record = strictRecord(value, "membershipBindResult", [
    "projectSessionId",
    "coordinationRunId",
    "membershipRevision",
    "members",
  ]);
  if (!Array.isArray(record.members)) throw new TypeError("membershipBindResult.members must be an array");
  const coordinationRunId = parseIdentifier<"CoordinationRunId">(
    record.coordinationRunId,
    "membershipBindResult.coordinationRunId",
  );
  const members = record.members.map(parseProjectSessionMember);
  assertMemberRunBinding(coordinationRunId, members);
  return {
    projectSessionId: parseIdentifier<"ProjectSessionId">(
      record.projectSessionId,
      "membershipBindResult.projectSessionId",
    ),
    coordinationRunId,
    membershipRevision: safeInteger(record.membershipRevision, "membershipBindResult.membershipRevision", 1),
    members,
  };
}

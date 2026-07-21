import { FABRIC_OPERATIONS } from "../operations.js";
import { LAUNCH_PACKET_V1_CODEC, LAUNCH_RESOURCE_PLAN_V1_CODEC } from "../launch.js";
import { parseMembershipBindRequest, parseMembershipBindResult } from "../membership.js";
import { parseProjectSession } from "../project-session.js";
import { arrayOf, boundedString, enumeration, identifier, integer, literal, objectCodec, parserBacked, sha256, unionOf, type Codec } from "../codec.js";
import { artifactRefCodec, chairMutationCodec, object, operatorMutationCodec, parsedBy, positiveInteger, semanticShapeCodec, text, type OperationCodecFragment, type OperationShapeFragment } from "./common.js";

export const PROJECT_SESSION_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.launchAttest]: object(["challengeResponse"]),
  [FABRIC_OPERATIONS.projectSessionCreate]: object(["command", "projectSessionId", "projectId", "mode", "generation", "authorityRef", "budgetRef", "launchPacketRef"]),
  [FABRIC_OPERATIONS.projectSessionGet]: object(["projectId", "projectSessionId", "expectedGeneration"]),
  [FABRIC_OPERATIONS.projectSessionTransition]: object(["command", "projectSessionId", "expectedGeneration", "transition"]),
  [FABRIC_OPERATIONS.projectSessionClose]: object(["command", "projectSessionId", "expectedGeneration", "terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionLaunchPacketPrepare]: object(["command", "projectId", "projectSessionId", "expectedSessionGeneration", "intakeId", "acceptedScopeRef", "launchPacketRef", "resourcePlanRef", "launchPacket", "resourcePlan"]),
  [FABRIC_OPERATIONS.projectSessionLaunchPrepare]: object(["command", "projectId", "projectSessionId", "expectedSessionGeneration", "launchPacketRef"]),
  [FABRIC_OPERATIONS.membershipBind]: object(["origin", "command", "projectSessionId", "coordinationRunId", "expectedMembershipRevision", "members"]),
} as const satisfies OperationShapeFragment;

export const PROJECT_SESSION_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.launchAttest]: object(["attested", "challengeDigest"]),
  [FABRIC_OPERATIONS.projectSessionCreate]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionGet]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionTransition]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionClose]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin", "terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionLaunchPacketPrepare]: object(["projectSession", "launchPacketRef", "resourcePlanRef", "acceptedScopeRef"]),
  [FABRIC_OPERATIONS.membershipBind]: object(["projectSessionId", "coordinationRunId", "membershipRevision", "members"]),
  [FABRIC_OPERATIONS.projectSessionLaunchPrepare]: object(["previewId", "previewRevision", "previewDigest", "intent", "intentDigest", "beforeStateDigest", "consequenceClass", "evidenceRefs", "gateIds", "confirmationMode", "expiresAt"]),
} as const satisfies OperationShapeFragment;

export const projectSessionOriginCodec = objectCodec({ kind: literal("operator-launch"), operatorId: identifier });

export const cancelledTerminalPathCodec = objectCodec({ kind: literal("cancelled"), reason: text });

export const terminalPathCodec = unionOf([
  objectCodec({ kind: literal("accepted"), acceptanceRef: sha256 }),
  cancelledTerminalPathCodec,
  objectCodec({ kind: literal("failed"), reason: text, failureRef: sha256 }),
]);

export const projectSessionCommonFields = {
  projectSessionId: identifier,
  projectId: identifier,
  mode: enumeration(["coordinated", "independent"]),
  revision: positiveInteger,
  generation: positiveInteger,
  authorityRef: sha256,
  budgetRef: identifier,
  launchPacketRef: artifactRefCodec,
  membershipRevision: integer(),
  origin: projectSessionOriginCodec,
};

export const projectSessionWireCodec = unionOf([
  objectCodec({
    ...projectSessionCommonFields,
    state: enumeration([
      "draft",
      "awaiting_launch",
      "launching",
      "active",
      "quiescing",
      "awaiting_acceptance",
      "launch_failed",
      "launch_ambiguous",
      "reconciling",
      "visibility_degraded",
      "recovery_required",
      "quarantined",
    ]),
  }),
  objectCodec({ ...projectSessionCommonFields, state: literal("closed"), terminalPath: terminalPathCodec }),
  objectCodec({ ...projectSessionCommonFields, state: literal("cancelled"), terminalPath: cancelledTerminalPathCodec }),
]);

export const projectSessionCodec = parserBacked(
  projectSessionWireCodec,
  parseProjectSession,
  parseProjectSession(projectSessionWireCodec.example),
);

export const projectSessionTransitionInputCodec = objectCodec({
  command: operatorMutationCodec,
  projectSessionId: identifier,
  expectedGeneration: positiveInteger,
  transition: unionOf([
    objectCodec({
      to: literal("awaiting_launch"),
      reason: text,
      launchPacketRef: artifactRefCodec,
    }),
    objectCodec({
      to: enumeration([
        "draft",
        "active",
        "reconciling",
        "visibility_degraded",
        "recovery_required",
        "quarantined",
      ]),
      reason: text,
    }),
    objectCodec({ to: literal("awaiting_acceptance"), closureEvidence: artifactRefCodec }),
  ]),
});

export const projectSessionLaunchPacketPrepareInputCodec = objectCodec({
  command: operatorMutationCodec,
  projectId: identifier,
  projectSessionId: identifier,
  expectedSessionGeneration: positiveInteger,
  intakeId: identifier,
  acceptedScopeRef: artifactRefCodec,
  launchPacketRef: artifactRefCodec,
  resourcePlanRef: artifactRefCodec,
  launchPacket: LAUNCH_PACKET_V1_CODEC,
  resourcePlan: LAUNCH_RESOURCE_PLAN_V1_CODEC,
});

export const projectSessionLaunchPacketPreparationCodec = objectCodec({
  projectSession: projectSessionCodec,
  launchPacketRef: artifactRefCodec,
  resourcePlanRef: artifactRefCodec,
  acceptedScopeRef: artifactRefCodec,
});

export const projectSessionLaunchPrepareInputCodec = objectCodec({
  command: operatorMutationCodec,
  projectId: identifier,
  projectSessionId: identifier,
  expectedSessionGeneration: positiveInteger,
  launchPacketRef: artifactRefCodec,
});

export function memberVariants(
  kind: string,
  identityField: string,
  additionalIdentity: Readonly<Record<string, Codec<unknown>>> = {},
): Codec<unknown>[] {
  const identity = {
    kind: literal(kind),
    membershipId: identifier,
    coordinationRunId: identifier,
    [identityField]: identifier,
    ...additionalIdentity,
  };
  return [
    objectCodec({ ...identity, state: literal("active") }),
    objectCodec({ ...identity, state: literal("terminal") }),
    objectCodec({ ...identity, state: literal("abandoned"), reason: text }),
  ];
}

export const projectSessionMemberCodec = unionOf([
  ...memberVariants("coordination-run", "runId"),
  ...memberVariants("workstream", "workstreamId"),
  ...memberVariants("task", "taskId"),
  ...memberVariants("lease", "leaseId"),
  ...memberVariants("provider-action", "providerActionId", { providerAdapterId: identifier }),
  ...memberVariants("required-message", "messageId"),
  ...memberVariants("artifact-obligation", "artifactObligationId"),
  ...memberVariants("gate", "gateId"),
  ...memberVariants("scoped-barrier", "barrierId"),
] as [Codec<unknown>, ...Codec<unknown>[]]);

export const membershipBindCodec = unionOf([
  objectCodec({
    origin: literal("operator"),
    command: operatorMutationCodec,
    projectSessionId: identifier,
    coordinationRunId: identifier,
    expectedMembershipRevision: integer(),
    members: arrayOf(projectSessionMemberCodec, { maximum: 256 }),
  }),
  objectCodec({
    origin: literal("chair"),
    command: chairMutationCodec,
    projectSessionId: identifier,
    coordinationRunId: identifier,
    expectedMembershipRevision: positiveInteger,
    members: arrayOf(projectSessionMemberCodec, { maximum: 256 }),
  }),
]);

export const launchAttestationInputCodec = objectCodec({
  challengeResponse: boundedString({
    minBytes: 64,
    maxBytes: 64,
    pattern: "^[a-f0-9]{64}$",
    example: "ab".repeat(32),
  }),
});

export const launchAttestationResultCodec = objectCodec({
  attested: literal(true),
  challengeDigest: sha256,
});

export type ProjectSessionFragmentDependencies = Readonly<{ operatorActionPreviewCodec: Codec<unknown> }>;

const projectSessionFieldCodec = (_operation: Parameters<typeof semanticShapeCodec>[0], field: string): Codec<unknown> | undefined => {
  if (field === "mode") return enumeration(["coordinated", "independent"]);
  if (field === "terminalPath") return terminalPathCodec;
  return undefined;
};

export function createProjectSessionOperationCodecFragment(dependencies: ProjectSessionFragmentDependencies): OperationCodecFragment {
  const membershipResultBase = semanticShapeCodec(FABRIC_OPERATIONS.membershipBind, "result", PROJECT_SESSION_RESULT_SHAPES[FABRIC_OPERATIONS.membershipBind], (_operation, field) =>
    field === "members" ? arrayOf(projectSessionMemberCodec, { maximum: 256 }) : undefined);
  return {
    [FABRIC_OPERATIONS.launchAttest]: { input: launchAttestationInputCodec, result: launchAttestationResultCodec },
    [FABRIC_OPERATIONS.projectSessionCreate]: { input: semanticShapeCodec(FABRIC_OPERATIONS.projectSessionCreate, "input", PROJECT_SESSION_INPUT_SHAPES[FABRIC_OPERATIONS.projectSessionCreate], projectSessionFieldCodec), result: projectSessionCodec },
    [FABRIC_OPERATIONS.projectSessionGet]: { input: semanticShapeCodec(FABRIC_OPERATIONS.projectSessionGet, "input", PROJECT_SESSION_INPUT_SHAPES[FABRIC_OPERATIONS.projectSessionGet], projectSessionFieldCodec), result: projectSessionCodec },
    [FABRIC_OPERATIONS.projectSessionTransition]: { input: projectSessionTransitionInputCodec, result: projectSessionCodec },
    [FABRIC_OPERATIONS.projectSessionClose]: { input: semanticShapeCodec(FABRIC_OPERATIONS.projectSessionClose, "input", PROJECT_SESSION_INPUT_SHAPES[FABRIC_OPERATIONS.projectSessionClose], projectSessionFieldCodec), result: projectSessionCodec },
    [FABRIC_OPERATIONS.projectSessionLaunchPacketPrepare]: { input: projectSessionLaunchPacketPrepareInputCodec, result: projectSessionLaunchPacketPreparationCodec },
    [FABRIC_OPERATIONS.projectSessionLaunchPrepare]: { input: projectSessionLaunchPrepareInputCodec, result: dependencies.operatorActionPreviewCodec },
    [FABRIC_OPERATIONS.membershipBind]: { input: parsedBy(membershipBindCodec, parseMembershipBindRequest), result: parsedBy(membershipResultBase, parseMembershipBindResult) },
  } satisfies OperationCodecFragment;
}

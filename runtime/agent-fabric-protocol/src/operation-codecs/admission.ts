import {
  arrayOf,
  enumeration,
  identifier,
  integer,
  literal,
  nullable,
  objectCodec,
  parserBacked,
  recordOf,
  relativePath,
  sha256,
  timestamp,
  unionOf,
  type Codec,
} from "../codec.js";
import {
  parseIntake,
  parseIntakeDraftCreateRequest,
  parseIntakeReadRequest,
  parseIntakeRevisionRequest,
  parseIntakeSubmission,
} from "../intake.js";
import {
  parseScopedGate,
  parseScopedGateCheckRequest,
  parseScopedGateCreateRequest,
  parseScopedGateResolveRequest,
} from "../gates.js";
import { FABRIC_OPERATIONS } from "../operations.js";
import { parseResourceReservationRequest } from "../resources.js";
import { budgetUnitKey } from "../resource-unit-keys.js";
import {
  absoluteFilesystemPathCodec,
  activeOperationCodec,
  artifactRefCodec,
  artifactRefsCodec,
  chairMutationCodec,
  credentialCodec,
  nonEmptyNumberRecord,
  object,
  operatorMutationCodec,
  optionalText,
  parsedBy,
  positiveInteger,
  releaseBindingCodec,
  semanticShapeCodec,
  stringList,
  text,
  textList,
  type OperationCodecFragment,
  type OperationShapeFragment,
} from "./common.js";

export const ADMISSION_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.intakeDraftCreate]: object(["command", "intakeId", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.intakeRead]: object(["credential", "intakeId"]),
  [FABRIC_OPERATIONS.intakeSubmit]: object(["command", "intakeId", "expectedRevision", "projectSessionId", "coordinationRunId", "summary", "artifactRefs", "gateIds", "chairRequest"]),
  [FABRIC_OPERATIONS.intakeRevise]: object(["origin", "command", "intakeId", "projectSessionId", "coordinationRunId", "expectedRevision", "state", "summary", "artifactRefs", "gateIds"], ["chairRequest", "acceptedScopeRef"]),
  [FABRIC_OPERATIONS.scopedGateCreate]: object(["origin", "command", "intent"]),
  [FABRIC_OPERATIONS.scopedGateResolve]: object(["command", "gateId", "status", "decisionEvidence"]),
  [FABRIC_OPERATIONS.scopedGateCheck]: object(["projectSessionId", "coordinationRunId", "dependencyRevision", "enforcementPoint"], ["taskId", "operationId", "operationTarget", "barrierId"]),
  [FABRIC_OPERATIONS.scopedGateRead]: object(["credential", "projectId", "projectSessionId", "gateId"], ["expectedRevision"]),
  [FABRIC_OPERATIONS.resourceReserve]: object(["commandId", "reservationId", "projectSessionId", "path", "amounts"], ["writerAdmission", "taskId"]),
  [FABRIC_OPERATIONS.resourceRelease]: object(["commandId", "reservationId", "expectedRevision", "consumed"]),
  [FABRIC_OPERATIONS.resourceReconcile]: object(["commandId", "reservationId", "expectedRevision", "observedUsage", "evidence"]),
  [FABRIC_OPERATIONS.chairTakeover]: object(["command", "projectSessionId", "runId", "expectedChairAgentId", "successorChairAgentId", "expectedChairGeneration", "expectedSessionGeneration", "handoffRef", "targetRevision"]),
} as const satisfies OperationShapeFragment;

export const ADMISSION_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.intakeDraftCreate]: object(["intakeId", "projectId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.intakeRead]: object(["intakeId", "projectId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"], ["projectSessionId", "coordinationRunId", "acceptedScopeRef"]),
  [FABRIC_OPERATIONS.intakeSubmit]: object(["intakeId", "projectId", "projectSessionId", "coordinationRunId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.intakeRevise]: object(["intakeId", "projectId", "projectSessionId", "coordinationRunId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"], ["acceptedScopeRef"]),
  [FABRIC_OPERATIONS.scopedGateCreate]: object(["gateId", "projectSessionId", "coordinationRunId", "scope", "affectedTaskIds", "dependencyRevision", "blockedOperationIds", "enforcementPoints", "question", "reason", "options", "recommendation", "consequences", "evidenceRefs", "revision", "createdByRef", "expectedApproverRef", "status"], ["deadline", "default", "resolution", "releaseBinding"]),
  [FABRIC_OPERATIONS.scopedGateResolve]: object(["gateId", "projectSessionId", "coordinationRunId", "scope", "affectedTaskIds", "dependencyRevision", "blockedOperationIds", "enforcementPoints", "question", "reason", "options", "recommendation", "consequences", "evidenceRefs", "revision", "createdByRef", "expectedApproverRef", "status"], ["deadline", "default", "resolution", "releaseBinding"]),
  [FABRIC_OPERATIONS.scopedGateCheck]: object(["allowed", "checkedGateRevisions"], ["blockingGateIds"]),
  [FABRIC_OPERATIONS.scopedGateRead]: object(["status", "gate", "readTransactionId", "stateDigest"], ["expectedRevision"]),
  [FABRIC_OPERATIONS.resourceReserve]: object(["reservationId", "revision", "state", "path", "amounts", "capacity"]),
  [FABRIC_OPERATIONS.resourceRelease]: object(["reservationId", "revision", "state", "path", "amounts", "capacity"]),
  [FABRIC_OPERATIONS.resourceReconcile]: object(["reservationId", "revision", "state", "path", "amounts", "capacity"]),
  [FABRIC_OPERATIONS.chairTakeover]: object(["projectSessionId", "sessionRevision", "runRevision", "chairAgentId", "chairGeneration"]),
} as const satisfies OperationShapeFragment;

const resourceScopeCodec = unionOf([
  objectCodec({ kind: literal("project"), scopeId: identifier, projectId: identifier }),
  objectCodec({ kind: literal("project-session"), scopeId: identifier, projectId: identifier, projectSessionId: identifier }),
  objectCodec({ kind: literal("coordination-run"), scopeId: identifier, projectSessionId: identifier, coordinationRunId: identifier }),
  objectCodec({ kind: literal("team"), scopeId: identifier, coordinationRunId: identifier, teamId: identifier }),
  objectCodec({ kind: literal("agent"), scopeId: identifier, teamId: identifier, agentId: identifier }),
]);

const writerAdmissionCodec = objectCodec({
  repositoryRoot: absoluteFilesystemPathCodec,
  worktreePath: absoluteFilesystemPathCodec,
  sourcePrefixes: arrayOf(relativePath, { minimum: 1, maximum: 128, unique: true }),
  writerGeneration: positiveInteger,
});

const intakeDraftCodec = objectCodec({
  intakeId: identifier,
  projectId: identifier,
  revision: positiveInteger,
  state: literal("draft"),
  dedupeKey: text,
  summary: text,
  artifactRefs: artifactRefsCodec,
  gateIds: stringList,
});

const intakeChairRequestSeedCodec = objectCodec({
  conversationId: identifier,
  targetAgentId: identifier,
  targetProviderSessionRef: identifier,
  baseRevision: text,
});

const boundIntakeCommonFields = {
  intakeId: identifier,
  projectId: identifier,
  projectSessionId: identifier,
  coordinationRunId: identifier,
  revision: positiveInteger,
  dedupeKey: text,
  summary: text,
  artifactRefs: artifactRefsCodec,
  gateIds: stringList,
};

const boundIntakeCodec = unionOf([
  objectCodec({
    ...boundIntakeCommonFields,
    state: enumeration(["awaiting-chair", "discussing", "awaiting-human", "deferred", "cancelled"]),
  }, { chairRequestSeed: intakeChairRequestSeedCodec }),
  objectCodec({
    ...boundIntakeCommonFields,
    state: literal("accepted"),
    acceptedScopeRef: artifactRefCodec,
  }, { chairRequestSeed: intakeChairRequestSeedCodec }),
]);

const intakeCodec = unionOf([intakeDraftCodec, boundIntakeCodec]);

const intakeDraftCreateBaseCodec = objectCodec({
  command: operatorMutationCodec,
  intakeId: identifier,
  dedupeKey: text,
  summary: text,
  artifactRefs: artifactRefsCodec,
  gateIds: stringList,
});

const intakeDraftCreateCodec = parserBacked(
  intakeDraftCreateBaseCodec,
  parseIntakeDraftCreateRequest,
  parseIntakeDraftCreateRequest({
    ...intakeDraftCreateBaseCodec.example,
    command: { ...operatorMutationCodec.example, expectedRevision: 0 },
  }),
);

const gateScopeCodec = unionOf([
  objectCodec({ kind: literal("task"), taskId: identifier }),
  objectCodec({ kind: literal("subtree"), rootTaskId: identifier }),
  objectCodec({ kind: literal("run") }),
  objectCodec({ kind: literal("release") }),
]);

const gateIntentCodec = objectCodec({
  projectSessionId: identifier,
  coordinationRunId: identifier,
  dedupeKey: text,
  scope: gateScopeCodec,
  blockedOperationIds: arrayOf(activeOperationCodec, { maximum: 128, unique: true }),
  enforcementPoints: arrayOf(enumeration(["task-readiness", "operation", "scoped-barrier"]), {
    minimum: 1,
    maximum: 3,
    unique: true,
  }),
  question: text,
  reason: text,
  options: arrayOf(text, { minimum: 1, maximum: 64 }),
  recommendation: optionalText,
  consequences: textList,
  evidenceRefs: artifactRefsCodec,
}, { deadline: timestamp, default: text, releaseBinding: releaseBindingCodec });

const gateCreateCodec = unionOf([
  objectCodec({ origin: literal("operator"), command: operatorMutationCodec, intent: gateIntentCodec }),
  objectCodec({ origin: literal("chair"), command: chairMutationCodec, intent: gateIntentCodec }),
]);

const typedDecisionEvidenceCodec = objectCodec({
  kind: literal("typed-console"),
  confirmationCommandId: identifier,
});

const attestedDecisionEvidenceCodec = objectCodec({
  kind: literal("attested-input"),
  attestationId: identifier,
  expectedIntegrationGeneration: positiveInteger,
});

const decisionEvidenceCodec = unionOf([typedDecisionEvidenceCodec, attestedDecisionEvidenceCodec]);

const scopedGateCheckCodec = unionOf([
  objectCodec({
    projectSessionId: identifier,
    coordinationRunId: identifier,
    dependencyRevision: positiveInteger,
    enforcementPoint: literal("task-readiness"),
    taskId: identifier,
  }),
  objectCodec({
    projectSessionId: identifier,
    coordinationRunId: identifier,
    dependencyRevision: positiveInteger,
    enforcementPoint: literal("operation"),
    operationId: activeOperationCodec,
    operationTarget: unionOf([
      objectCodec({ kind: literal("run") }),
      objectCodec({ kind: literal("task"), taskId: identifier }),
    ]),
  }),
  objectCodec({
    projectSessionId: identifier,
    coordinationRunId: identifier,
    dependencyRevision: positiveInteger,
    enforcementPoint: literal("scoped-barrier"),
    barrierId: identifier,
  }),
]);

const scopedGateReadInputCodec = objectCodec({
  credential: credentialCodec,
  projectId: identifier,
  projectSessionId: identifier,
  gateId: identifier,
}, { expectedRevision: positiveInteger });

const resourceDimensionCodec = unionOf([
  objectCodec({ unknown: literal(false), used: integer(), reserved: integer(), remaining: integer() }),
  objectCodec({ unknown: literal(true), used: nullable(integer()), reserved: integer(), remaining: literal(null) }),
]);

const typedGateResolutionCodec = objectCodec({
  kind: literal("typed-console"),
  operatorId: identifier,
  confirmationCommandId: identifier,
  decidedAt: timestamp,
  evidenceRefs: artifactRefsCodec,
});

const attestedGateResolutionCodec = objectCodec({
  kind: literal("attested-input"),
  operatorId: identifier,
  attestationId: identifier,
  integrationId: identifier,
  integrationGeneration: positiveInteger,
  decidedAt: timestamp,
  evidenceRefs: artifactRefsCodec,
});

const systemGateSupersessionCodec = objectCodec({
  kind: literal("system-supersession"),
  cause: unionOf([
    objectCodec({ kind: literal("operator-command"), ref: identifier }),
    objectCodec({ kind: literal("chair-bridge-loss"), ref: identifier }),
    objectCodec({ kind: literal("system-recovery"), ref: identifier }),
  ]),
  reason: text,
  decidedAt: timestamp,
});

const gateResolutionCodec = unionOf([
  typedGateResolutionCodec,
  attestedGateResolutionCodec,
  systemGateSupersessionCodec,
]);

const resourceReservationResultCodec = objectCodec({
  reservationId: identifier,
  revision: positiveInteger,
  state: enumeration(["active", "released", "ambiguous", "reconciled"]),
  path: arrayOf(resourceScopeCodec, { minimum: 2, maximum: 5 }),
  amounts: nonEmptyNumberRecord,
  capacity: recordOf(resourceDimensionCodec, { maximum: 128, keyCodec: budgetUnitKey }),
});

const admissionFieldCodec = (
  operation: Parameters<typeof semanticShapeCodec>[0],
  field: string,
  direction: Parameters<typeof semanticShapeCodec>[1],
  taskRequestCodec: Codec<unknown>,
): Codec<unknown> | undefined => {
  if (field === "status" && operation === FABRIC_OPERATIONS.scopedGateResolve && direction === "input") {
    return enumeration(["approved", "rejected", "deferred", "cancelled"]);
  }
  if (field === "status" && (operation === FABRIC_OPERATIONS.scopedGateCreate || operation === FABRIC_OPERATIONS.scopedGateResolve) && direction === "result") {
    return enumeration(["pending", "deferred", "approved", "rejected", "cancelled", "superseded"]);
  }
  if (field === "chairRequest" || field === "request") return taskRequestCodec;
  if (field === "intent") return gateIntentCodec;
  if (field === "decisionEvidence") return decisionEvidenceCodec;
  if (field === "scope") return gateScopeCodec;
  if (field === "path") return arrayOf(resourceScopeCodec, { minimum: 2, maximum: 5 });
  if (field === "writerAdmission") return writerAdmissionCodec;
  if (field === "amounts" || field === "consumed") return nonEmptyNumberRecord;
  if (field === "observedUsage") return recordOf(unionOf([integer(), literal("unknown")]), {
    minimum: 1,
    maximum: 128,
    keyCodec: budgetUnitKey,
    exampleKey: "concurrent_turns",
  });
  if (field === "capacity") return recordOf(resourceDimensionCodec, { maximum: 128, keyCodec: budgetUnitKey });
  if (field === "checkedGateRevisions") return recordOf(positiveInteger, { maximum: 128 });
  if (field === "releaseBinding") return releaseBindingCodec;
  if (field === "resolution") return gateResolutionCodec;
  if (field === "enforcementPoints") {
    return arrayOf(enumeration(["task-readiness", "operation", "scoped-barrier"]), { minimum: 1, maximum: 3, unique: true });
  }
  return undefined;
};

export function createAdmissionOperationCodecFragment(
  dependencies: Readonly<{ taskRequestCodec: Codec<unknown> }>,
) {
  const fieldCodec = (
    operation: Parameters<typeof semanticShapeCodec>[0],
    field: string,
    direction: Parameters<typeof semanticShapeCodec>[1],
  ): Codec<unknown> | undefined => admissionFieldCodec(operation, field, direction, dependencies.taskRequestCodec);
  const semantic = (
    operation: keyof typeof ADMISSION_INPUT_SHAPES,
    direction: Parameters<typeof semanticShapeCodec>[1],
  ): Codec<unknown> => semanticShapeCodec(
    operation,
    direction,
    direction === "input" ? ADMISSION_INPUT_SHAPES[operation] : ADMISSION_RESULT_SHAPES[operation],
    fieldCodec,
  );

  const intakeRevisionCommonFields = {
    intakeId: identifier,
    projectSessionId: identifier,
    coordinationRunId: identifier,
    expectedRevision: positiveInteger,
    summary: text,
    artifactRefs: artifactRefsCodec,
    gateIds: stringList,
  };
  const intakeRevisionCodec = unionOf([
    objectCodec({
      origin: literal("operator"),
      command: operatorMutationCodec,
      ...intakeRevisionCommonFields,
      state: enumeration(["awaiting-chair", "discussing", "awaiting-human", "deferred", "cancelled"]),
    }, { chairRequest: dependencies.taskRequestCodec }),
    objectCodec({
      origin: literal("operator"),
      command: operatorMutationCodec,
      ...intakeRevisionCommonFields,
      state: literal("accepted"),
      acceptedScopeRef: artifactRefCodec,
    }, { chairRequest: dependencies.taskRequestCodec }),
    objectCodec({
      origin: literal("chair"),
      command: chairMutationCodec,
      ...intakeRevisionCommonFields,
      state: enumeration(["awaiting-chair", "discussing", "awaiting-human", "deferred", "cancelled"]),
    }, { chairRequest: dependencies.taskRequestCodec }),
    objectCodec({
      origin: literal("chair"),
      command: chairMutationCodec,
      ...intakeRevisionCommonFields,
      state: literal("accepted"),
      acceptedScopeRef: artifactRefCodec,
    }, { chairRequest: dependencies.taskRequestCodec }),
  ]);

  const gateBase = semanticShapeCodec(
    FABRIC_OPERATIONS.scopedGateCreate,
    "result",
    ADMISSION_RESULT_SHAPES[FABRIC_OPERATIONS.scopedGateCreate],
    fieldCodec,
  );
  const gateExample = parseScopedGate({ ...gateBase.example as Record<string, unknown>, options: ["Approve"] });
  const gate = parserBacked(gateBase, parseScopedGate, gateExample);
  const scopedGateReadResultBase = unionOf([
    objectCodec({
      status: literal("current"),
      gate,
      readTransactionId: identifier,
      stateDigest: sha256,
    }),
    objectCodec({
      status: literal("changed"),
      expectedRevision: positiveInteger,
      gate,
      readTransactionId: identifier,
      stateDigest: sha256,
    }),
  ]);
  const scopedGateReadResultCodec = parserBacked(scopedGateReadResultBase, (value) => {
    if (Reflect.get(value as object, "status") !== "changed") return value;
    const gateValue = Reflect.get(value as object, "gate") as Record<string, unknown>;
    if (Reflect.get(value as object, "expectedRevision") === gateValue.revision) {
      throw new TypeError("scopedGateRead changed revision must differ from the current gate revision");
    }
    return value;
  }, scopedGateReadResultBase.example);

  return {
    [FABRIC_OPERATIONS.intakeDraftCreate]: { input: intakeDraftCreateCodec, result: parsedBy(intakeDraftCodec, parseIntake) },
    [FABRIC_OPERATIONS.intakeRead]: { input: parsedBy(semantic(FABRIC_OPERATIONS.intakeRead, "input"), parseIntakeReadRequest), result: parsedBy(intakeCodec, parseIntake) },
    [FABRIC_OPERATIONS.intakeSubmit]: { input: parsedBy(semantic(FABRIC_OPERATIONS.intakeSubmit, "input"), parseIntakeSubmission), result: parsedBy(boundIntakeCodec, parseIntake) },
    [FABRIC_OPERATIONS.intakeRevise]: { input: parsedBy(intakeRevisionCodec, parseIntakeRevisionRequest), result: parsedBy(boundIntakeCodec, parseIntake) },
    [FABRIC_OPERATIONS.scopedGateCreate]: { input: parsedBy(gateCreateCodec, parseScopedGateCreateRequest), result: parsedBy(semantic(FABRIC_OPERATIONS.scopedGateCreate, "result"), parseScopedGate) },
    [FABRIC_OPERATIONS.scopedGateResolve]: { input: parsedBy(semantic(FABRIC_OPERATIONS.scopedGateResolve, "input"), parseScopedGateResolveRequest), result: parsedBy(semantic(FABRIC_OPERATIONS.scopedGateResolve, "result"), parseScopedGate) },
    [FABRIC_OPERATIONS.scopedGateCheck]: { input: parsedBy(scopedGateCheckCodec, parseScopedGateCheckRequest), result: semantic(FABRIC_OPERATIONS.scopedGateCheck, "result") },
    [FABRIC_OPERATIONS.scopedGateRead]: { input: scopedGateReadInputCodec, result: scopedGateReadResultCodec },
    [FABRIC_OPERATIONS.resourceReserve]: { input: parsedBy(semantic(FABRIC_OPERATIONS.resourceReserve, "input"), parseResourceReservationRequest), result: resourceReservationResultCodec },
    [FABRIC_OPERATIONS.resourceRelease]: { input: semantic(FABRIC_OPERATIONS.resourceRelease, "input"), result: resourceReservationResultCodec },
    [FABRIC_OPERATIONS.resourceReconcile]: { input: semantic(FABRIC_OPERATIONS.resourceReconcile, "input"), result: resourceReservationResultCodec },
    [FABRIC_OPERATIONS.chairTakeover]: { input: semantic(FABRIC_OPERATIONS.chairTakeover, "input"), result: semantic(FABRIC_OPERATIONS.chairTakeover, "result") },
  } satisfies OperationCodecFragment;
}

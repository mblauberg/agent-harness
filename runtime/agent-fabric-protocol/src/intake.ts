import {
  parseArtifactRef,
  parseIdentifier,
  requiredString,
  safeInteger,
  strictRecord,
  type ArtifactRef,
  type GateId,
  type IntakeId,
  type ProjectSessionId,
} from "./primitives.js";
import {
  parseChairMutationContext,
  parseOperatorMutationContext,
  type ChairMutationContext,
  type OperatorMutationContext,
} from "./operator.js";
import { parseTaskRequest, type TaskRequest } from "./request-result.js";

export const INTAKE_STATES = [
  "draft",
  "awaiting-chair",
  "discussing",
  "awaiting-human",
  "accepted",
  "deferred",
  "cancelled",
] as const;

export type IntakeState = (typeof INTAKE_STATES)[number];

export type Intake = {
  intakeId: IntakeId;
  projectSessionId: ProjectSessionId;
  revision: number;
  state: IntakeState;
  dedupeKey: string;
  summary: string;
  artifactRefs: readonly ArtifactRef[];
  gateIds: readonly GateId[];
};

export type IntakeSubmission = {
  command: OperatorMutationContext;
  intake: Intake & { revision: 1; state: "awaiting-chair" };
  chairRequest: TaskRequest & {
    request: TaskRequest["request"] & { intakeBinding: NonNullable<TaskRequest["request"]["intakeBinding"]> };
  };
};

type IntakeRevision = {
  intakeId: IntakeId;
  projectSessionId: ProjectSessionId;
  expectedRevision: number;
  state: IntakeState;
  summary: string;
  artifactRefs: readonly ArtifactRef[];
  gateIds: readonly GateId[];
  chairRequest?: TaskRequest;
};

export type IntakeRevisionRequest =
  | (IntakeRevision & { origin: "operator"; command: OperatorMutationContext })
  | (IntakeRevision & { origin: "chair"; command: ChairMutationContext });

function parseIntake(value: unknown): Intake {
  const record = strictRecord(value, "intakeSubmission.intake", [
    "intakeId",
    "projectSessionId",
    "revision",
    "state",
    "dedupeKey",
    "summary",
    "artifactRefs",
    "gateIds",
  ]);
  if (!Array.isArray(record.artifactRefs)) throw new TypeError("intakeSubmission.intake.artifactRefs must be an array");
  if (!Array.isArray(record.gateIds)) throw new TypeError("intakeSubmission.intake.gateIds must be an array");
  const state = INTAKE_STATES.find((candidate) => candidate === record.state);
  if (state === undefined) throw new TypeError("intakeSubmission.intake.state is invalid");
  return {
    intakeId: parseIdentifier<"IntakeId">(record.intakeId, "intakeSubmission.intake.intakeId"),
    projectSessionId: parseIdentifier<"ProjectSessionId">(
      record.projectSessionId,
      "intakeSubmission.intake.projectSessionId",
    ),
    revision: safeInteger(record.revision, "intakeSubmission.intake.revision", 1),
    state,
    dedupeKey: requiredString(record.dedupeKey, "intakeSubmission.intake.dedupeKey"),
    summary: requiredString(record.summary, "intakeSubmission.intake.summary"),
    artifactRefs: record.artifactRefs.map((artifact, index) => parseArtifactRef(
      artifact,
      `intakeSubmission.intake.artifactRefs[${String(index)}]`,
    )),
    gateIds: record.gateIds.map((gateId, index) => parseIdentifier<"GateId">(
      gateId,
      `intakeSubmission.intake.gateIds[${String(index)}]`,
    )),
  };
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function parseIntakeSubmission(value: unknown): IntakeSubmission {
  const record = strictRecord(value, "intakeSubmission", ["command", "intake", "chairRequest"]);
  const command = parseOperatorMutationContext(record.command, "intakeSubmission.command");
  const intake = parseIntake(record.intake);
  if (intake.revision !== 1 || intake.state !== "awaiting-chair") {
    throw new TypeError("intakeSubmission.intake must start at revision 1 in awaiting-chair state");
  }
  const chairRequest = parseTaskRequest(record.chairRequest);
  const binding = chairRequest.request.intakeBinding;
  if (binding === undefined) throw new TypeError("intakeSubmission.chairRequest intake binding is required");
  if (binding.intakeId !== intake.intakeId || binding.intakeRevision !== intake.revision) {
    throw new TypeError("intakeSubmission chair request intake revision does not match");
  }
  if (!sameOrderedStrings(binding.gateIds, intake.gateIds)) {
    throw new TypeError("intakeSubmission chair request gate IDs do not match");
  }
  if (!sameOrderedStrings(binding.artifactDigests, intake.artifactRefs.map((artifact) => artifact.digest))) {
    throw new TypeError("intakeSubmission chair request artifact digests do not match");
  }
  if (chairRequest.projectSessionId !== intake.projectSessionId) {
    throw new TypeError("intakeSubmission chair request project session does not match");
  }
  return {
    command,
    intake: { ...intake, revision: 1, state: "awaiting-chair" },
    chairRequest: { ...chairRequest, request: { ...chairRequest.request, intakeBinding: binding } },
  };
}

export function parseIntakeRevisionRequest(value: unknown): IntakeRevisionRequest {
  const record = strictRecord(value, "intakeRevision", [
    "origin",
    "command",
    "intakeId",
    "projectSessionId",
    "expectedRevision",
    "state",
    "summary",
    "artifactRefs",
    "gateIds",
    "chairRequest",
  ]);
  const state = INTAKE_STATES.find((candidate) => candidate === record.state);
  if (state === undefined) throw new TypeError("intakeRevision.state is invalid");
  if (!Array.isArray(record.artifactRefs)) throw new TypeError("intakeRevision.artifactRefs must be an array");
  if (!Array.isArray(record.gateIds)) throw new TypeError("intakeRevision.gateIds must be an array");
  const revision = {
    intakeId: parseIdentifier<"IntakeId">(record.intakeId, "intakeRevision.intakeId"),
    projectSessionId: parseIdentifier<"ProjectSessionId">(
      record.projectSessionId,
      "intakeRevision.projectSessionId",
    ),
    expectedRevision: safeInteger(record.expectedRevision, "intakeRevision.expectedRevision", 1),
    state,
    summary: requiredString(record.summary, "intakeRevision.summary"),
    artifactRefs: record.artifactRefs.map((artifact, index) => parseArtifactRef(
      artifact,
      `intakeRevision.artifactRefs[${String(index)}]`,
    )),
    gateIds: record.gateIds.map((gateId, index) => parseIdentifier<"GateId">(
      gateId,
      `intakeRevision.gateIds[${String(index)}]`,
    )),
    ...(record.chairRequest === undefined ? {} : { chairRequest: parseTaskRequest(record.chairRequest) }),
  };
  if (revision.chairRequest !== undefined) {
    const binding = revision.chairRequest.request.intakeBinding;
    if (binding === undefined) throw new TypeError("intakeRevision chair request intake binding is required");
    if (binding.intakeId !== revision.intakeId || binding.intakeRevision !== revision.expectedRevision + 1) {
      throw new TypeError("intakeRevision chair request intake revision does not match");
    }
    if (!sameOrderedStrings(binding.gateIds, revision.gateIds)) {
      throw new TypeError("intakeRevision chair request gate IDs do not match");
    }
    if (!sameOrderedStrings(binding.artifactDigests, revision.artifactRefs.map((artifact) => artifact.digest))) {
      throw new TypeError("intakeRevision chair request artifact digests do not match");
    }
    if (revision.chairRequest.projectSessionId !== revision.projectSessionId) {
      throw new TypeError("intakeRevision chair request project session does not match");
    }
  }
  if (record.origin === "operator") {
    const command = parseOperatorMutationContext(record.command, "intakeRevision.command");
    if (command.expectedRevision !== revision.expectedRevision) {
      throw new TypeError("intakeRevision operator command revision does not match");
    }
    return {
      ...revision,
      origin: "operator",
      command,
    };
  }
  if (record.origin === "chair") {
    const command = parseChairMutationContext(record.command, "intakeRevision.command");
    if (command.expectedRevision !== revision.expectedRevision) {
      throw new TypeError("intakeRevision chair command revision does not match");
    }
    return {
      ...revision,
      origin: "chair",
      command,
    };
  }
  throw new TypeError("intakeRevision.origin must be operator or chair");
}

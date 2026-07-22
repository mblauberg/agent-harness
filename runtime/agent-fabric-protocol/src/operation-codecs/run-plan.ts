import { identifier, nullable, objectCodec, timestamp } from "../codec.js";
import { FABRIC_OPERATIONS } from "../operations.js";
import {
  artifactRefCodec,
  object,
  positiveInteger,
  type OperationCodecFragment,
  type OperationResultPrincipalContext,
  type OperationShapeFragment,
  type ProtocolOperation,
} from "./common.js";

export const RUN_PLAN_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.runPlanDeclare]: object(
    ["runId", "planArtifactRef", "expectedAcceptedScopeRevision"],
    ["declaredTaskDenominator"],
  ),
} as const satisfies OperationShapeFragment;

export const RUN_PLAN_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.runPlanDeclare]: object([
    "runId", "planArtifactRef", "acceptedScopeRef", "acceptedScopeRevision",
    "planRevision", "declaredTaskDenominator", "declaredByAgentId", "declaredAt",
  ]),
} as const satisfies OperationShapeFragment;

export const runPlanDeclareCodec = objectCodec({
  runId: identifier,
  planArtifactRef: artifactRefCodec,
  expectedAcceptedScopeRevision: positiveInteger,
}, {
  declaredTaskDenominator: positiveInteger,
});

export const runPlanDeclarationCodec = objectCodec({
  runId: identifier,
  planArtifactRef: artifactRefCodec,
  acceptedScopeRef: artifactRefCodec,
  acceptedScopeRevision: positiveInteger,
  planRevision: positiveInteger,
  declaredTaskDenominator: nullable(positiveInteger),
  declaredByAgentId: identifier,
  declaredAt: timestamp,
});

export function validateRunPlanResultForInput(
  operation: ProtocolOperation,
  input: unknown,
  value: unknown,
  principal: OperationResultPrincipalContext | undefined,
): void {
  if (operation !== FABRIC_OPERATIONS.runPlanDeclare) return;
  const request = input as Readonly<Record<string, unknown>>;
  const result = value as Readonly<Record<string, unknown>>;
  const requestedPlan = request.planArtifactRef as Readonly<Record<string, unknown>>;
  const declaredPlan = result.planArtifactRef as Readonly<Record<string, unknown>>;
  if (
    result.runId !== request.runId ||
    declaredPlan.path !== requestedPlan.path ||
    declaredPlan.digest !== requestedPlan.digest ||
    result.acceptedScopeRevision !== request.expectedAcceptedScopeRevision ||
    result.declaredTaskDenominator !== (request.declaredTaskDenominator ?? null)
  ) throw new TypeError(`${operation}.result binding must equal the exact declaration request`);
  if (
    principal?.kind !== "agent" ||
    result.runId !== principal.runId ||
    result.declaredByAgentId !== principal.agentId
  ) throw new TypeError(`${operation}.result run and declaring chair must equal the authenticated agent principal`);
}

export const runPlanOperationCodecFragment = {
  [FABRIC_OPERATIONS.runPlanDeclare]: {
    input: runPlanDeclareCodec,
    result: runPlanDeclarationCodec,
  },
} satisfies OperationCodecFragment;

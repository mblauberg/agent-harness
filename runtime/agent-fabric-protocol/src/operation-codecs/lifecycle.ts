import { FABRIC_OPERATIONS } from "../operations.js";
import {
  LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC,
  LIFECYCLE_CURRENT_STATE_V1_CODEC,
  LIFECYCLE_RECOVERY_CHECKPOINT_VALIDATE_REQUEST_V1_CODEC,
  LIFECYCLE_RECOVERY_CHECKPOINT_VALIDATION_V1_CODEC,
} from "../lifecycle.js";
import { integerList, semanticShapeCodec, stringList, text, textList, type OperationCodecFragment, type OperationShapeFragment, type OperationResultPrincipalContext, object } from "./common.js";
import { enumeration, identifier, integer, objectCodec, relativePath, sha256, sha256Hex, unionOf, type Codec as BaseCodec } from "../codec.js";

export const LIFECYCLE_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.requestLifecycle]: object(["action", "agentId", "taskId", "taskRevision", "checkpoint", "commandId"]),
  [FABRIC_OPERATIONS.getAgentLifecycle]: object(["agentId"]),
  [FABRIC_OPERATIONS.reportProviderState]: object([
    "sourceEventId", "providerSessionRef", "providerSessionGeneration", "contextRevision",
    "evidenceDigest", "agentId", "commandId",
  ], ["checkpointSha256"]),
  [FABRIC_OPERATIONS.agentLifecycleRecoveryCheckpointValidate]: object(["schemaVersion", "projectSessionId", "coordinationRunId", "agentId", "source", "checkpointArtifactRef", "expectedSessionRevision", "expectedSessionGeneration", "expectedRunRevision", "expectedAgentRevision", "expectedSourceRevision", "gateId", "expectedGateRevision", "expectedGateStatus"]),
} as const satisfies OperationShapeFragment;

export const LIFECYCLE_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.requestLifecycle]: object(["schemaVersion", "kind", "agentId"]),
  [FABRIC_OPERATIONS.getAgentLifecycle]: object(["schemaVersion", "kind", "agentId"]),
  [FABRIC_OPERATIONS.reportProviderState]: object(["schemaVersion", "kind", "agentId"]),
  [FABRIC_OPERATIONS.agentLifecycleRecoveryCheckpointValidate]: object(["schemaVersion", "status"], ["source", "checkpointRef", "checkpointDigest", "checkpointVectorDigest", "validationReceiptDigest", "reason", "evidenceDigest"]),
} as const satisfies OperationShapeFragment;

export const lifecycleCheckpointCodec = objectCodec({
  relativePath,
  sha256: sha256Hex,
  mailboxWatermark: integer(),
  acknowledgedAboveWatermark: integerList,
  inFlightChildren: stringList,
  openWork: textList,
  nextAction: text,
  providerResumeReference: identifier,
});

const lifecycleFieldCodec = (operation: Parameters<typeof semanticShapeCodec>[0], field: string, direction: Parameters<typeof semanticShapeCodec>[1]): BaseCodec<unknown> | undefined => {
  if (field === "action" && operation === FABRIC_OPERATIONS.requestLifecycle) return enumeration(["compact", "rotate", "completion-ready", "release"]);
  if (field === "evidenceDigest" && operation === FABRIC_OPERATIONS.reportProviderState && direction === "input") return sha256;
  if (field === "checkpointSha256" && operation === FABRIC_OPERATIONS.reportProviderState) return sha256Hex;
  if (field === "checkpoint") return lifecycleCheckpointCodec;
  return undefined;
};

export const lifecycleOperationCodecFragment = {
  [FABRIC_OPERATIONS.requestLifecycle]: {
    input: semanticShapeCodec(FABRIC_OPERATIONS.requestLifecycle, "input", LIFECYCLE_INPUT_SHAPES[FABRIC_OPERATIONS.requestLifecycle], lifecycleFieldCodec),
    result: unionOf([LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC, LIFECYCLE_CURRENT_STATE_V1_CODEC]),
  },
  [FABRIC_OPERATIONS.getAgentLifecycle]: {
    input: semanticShapeCodec(FABRIC_OPERATIONS.getAgentLifecycle, "input", LIFECYCLE_INPUT_SHAPES[FABRIC_OPERATIONS.getAgentLifecycle]),
    result: LIFECYCLE_CURRENT_STATE_V1_CODEC,
  },
  [FABRIC_OPERATIONS.reportProviderState]: {
    input: semanticShapeCodec(FABRIC_OPERATIONS.reportProviderState, "input", LIFECYCLE_INPUT_SHAPES[FABRIC_OPERATIONS.reportProviderState], lifecycleFieldCodec),
    result: LIFECYCLE_CURRENT_STATE_V1_CODEC,
  },
  [FABRIC_OPERATIONS.agentLifecycleRecoveryCheckpointValidate]: {
    input: LIFECYCLE_RECOVERY_CHECKPOINT_VALIDATE_REQUEST_V1_CODEC,
    result: LIFECYCLE_RECOVERY_CHECKPOINT_VALIDATION_V1_CODEC,
  },
} satisfies OperationCodecFragment;

export function validateLifecycleResultForInput(
  operation: string,
  input: unknown,
  value: unknown,
  principal: OperationResultPrincipalContext | undefined,
): void {
  if (operation !== FABRIC_OPERATIONS.requestLifecycle && operation !== FABRIC_OPERATIONS.agentLifecycleRecoveryCheckpointValidate) return;
  if (operation === FABRIC_OPERATIONS.requestLifecycle) {
    const request = input as Readonly<Record<string, unknown>>;
    const parsed = value as Readonly<Record<string, unknown>>;
    const action = request.action;
    if (action === "rotate" || action === "compact") {
      if (parsed.kind !== "accepted-suspended") throw new TypeError(operation + ".result for " + String(action) + " must be accepted-suspended, not current-state");
      if (parsed.action !== action || parsed.agentId !== request.agentId || parsed.taskId !== request.taskId || parsed.taskRevision !== request.taskRevision) {
        throw new TypeError(operation + ".result accepted-suspended identity must equal the exact lifecycle request");
      }
      if (principal?.kind !== "agent" || parsed.projectSessionId !== principal.projectSessionId || parsed.coordinationRunId !== principal.runId || parsed.agentId !== principal.agentId) {
        throw new TypeError(operation + ".result accepted-suspended session and run must equal the authenticated agent principal");
      }
      const checkpoint = request.checkpoint as Readonly<Record<string, unknown>>;
      if (parsed.checkpointDigest !== "sha256:" + String(checkpoint.sha256)) throw new TypeError(operation + ".result checkpointDigest must equal the exact lifecycle request checkpoint");
    } else if (parsed.kind !== "current-state" || parsed.agentId !== request.agentId) {
      throw new TypeError(operation + ".result for " + String(action) + " must be current-state for the exact agent");
    }
  }
  if (operation === FABRIC_OPERATIONS.agentLifecycleRecoveryCheckpointValidate) {
    const request = input as Readonly<Record<string, unknown>>;
    const parsed = value as Readonly<Record<string, unknown>>;
    if (parsed.status === "validated" && JSON.stringify(parsed.source) !== JSON.stringify(request.source)) {
      throw new TypeError(operation + ".result source must equal the exact checkpoint validation request source");
    }
  }
}

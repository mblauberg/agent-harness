import { FABRIC_OPERATIONS } from "../operations.js";
import { enumeration, type Codec } from "../codec.js";
import { PROVIDER_ACTION_DISPATCH_INPUT_V1_CODEC, PROVIDER_ACTION_RESULT_V1_CODEC } from "../provider-action.js";
import { object, semanticShapeCodec, type OperationCodecFragment, type OperationShapeFragment, type ProtocolOperation } from "./common.js";

export const PROVIDER_ACTION_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.dispatchProviderAction]: object(
    ["adapterId", "actionId", "operation", "payload", "commandId", "certifyingReview"],
    ["authorityId", "taskId", "routeRequest"],
  ),
  [FABRIC_OPERATIONS.reconcileProviderAction]: object(["adapterId", "actionId", "expectedActionKind", "commandId"]),
  [FABRIC_OPERATIONS.getProviderAction]: object(["adapterId", "actionId", "expectedActionKind"]),
} as const satisfies OperationShapeFragment;

export const PROVIDER_ACTION_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.dispatchProviderAction]: object(["kind"], ["actionRef", "status", "history", "executionCount", "effectCount", "resultDigest", "providerAnswer", "action"]),
  [FABRIC_OPERATIONS.reconcileProviderAction]: object(["kind"], ["actionRef", "status", "history", "executionCount", "effectCount", "resultDigest", "providerAnswer", "action"]),
  [FABRIC_OPERATIONS.getProviderAction]: object(["kind"], ["actionRef", "status", "history", "executionCount", "effectCount", "resultDigest", "providerAnswer", "action"]),
} as const satisfies OperationShapeFragment;

const providerActionResultOperations: ReadonlySet<ProtocolOperation> = new Set([
  FABRIC_OPERATIONS.dispatchProviderAction,
  FABRIC_OPERATIONS.reconcileProviderAction,
  FABRIC_OPERATIONS.getProviderAction,
]);

const providerActionFieldCodec = (operation: ProtocolOperation, field: string): Codec<unknown> | undefined => {
  if (field === "operation" && operation === FABRIC_OPERATIONS.dispatchProviderAction) return enumeration(["spawn", "send_turn", "wakeup", "release", "steer"]);
  if (field === "expectedActionKind" && (operation === FABRIC_OPERATIONS.reconcileProviderAction || operation === FABRIC_OPERATIONS.getProviderAction)) return enumeration(["non-review", "certifying-review"]);
  return undefined;
};

export const providerActionOperationCodecFragment = {
  [FABRIC_OPERATIONS.dispatchProviderAction]: { input: PROVIDER_ACTION_DISPATCH_INPUT_V1_CODEC, result: PROVIDER_ACTION_RESULT_V1_CODEC },
  [FABRIC_OPERATIONS.reconcileProviderAction]: {
    input: semanticShapeCodec(FABRIC_OPERATIONS.reconcileProviderAction, "input", PROVIDER_ACTION_INPUT_SHAPES[FABRIC_OPERATIONS.reconcileProviderAction], providerActionFieldCodec),
    result: PROVIDER_ACTION_RESULT_V1_CODEC,
  },
  [FABRIC_OPERATIONS.getProviderAction]: {
    input: semanticShapeCodec(FABRIC_OPERATIONS.getProviderAction, "input", PROVIDER_ACTION_INPUT_SHAPES[FABRIC_OPERATIONS.getProviderAction], providerActionFieldCodec),
    result: PROVIDER_ACTION_RESULT_V1_CODEC,
  },
} satisfies OperationCodecFragment;

function providerActionIdentity(value: unknown, path: string): Readonly<{ adapterId: unknown; actionId: unknown }> {
  const result = value as Readonly<Record<string, unknown>>;
  const ref = result.kind === "certifying-review"
    ? ((result.action as Readonly<Record<string, unknown>>).actionRef as Readonly<Record<string, unknown>>)
    : result.actionRef as Readonly<Record<string, unknown>>;
  if (ref === undefined || ref === null || typeof ref !== "object") throw new TypeError(path + " has no canonical actionRef");
  return { adapterId: ref.adapterId, actionId: ref.actionId };
}

export function validateProviderActionResultForInput(operation: ProtocolOperation, input: unknown, value: unknown): void {
  if (!providerActionResultOperations.has(operation)) return;
  const request = input as Readonly<Record<string, unknown>>;
  const parsed = value as Readonly<Record<string, unknown>>;
  const identity = providerActionIdentity(parsed, operation + ".result");
  if (identity.adapterId !== request.adapterId || identity.actionId !== request.actionId) throw new TypeError(operation + ".result action identity must equal the exact requested actionRef");
  const dispatchKind = operation === FABRIC_OPERATIONS.dispatchProviderAction ? (request.certifyingReview === null ? "non-review" : "certifying-review") : undefined;
  const expectedKind = dispatchKind ?? request.expectedActionKind;
  if (parsed.kind !== expectedKind) throw new TypeError(operation + ".result kind must be " + String(expectedKind) + " for the classified provider action");
  if (operation === FABRIC_OPERATIONS.dispatchProviderAction && parsed.kind === "non-review" && parsed.providerAnswer !== undefined && request.operation !== "spawn") {
    throw new TypeError(operation + ".result providerAnswer is available only for a task-bound non-review spawn");
  }
}

import { FABRIC_OPERATIONS } from "./operations.js";
import type {
  AttentionItem,
  OperatorProjectionSnapshot,
  OperatorViewPageResult,
  OperatorViewSummaryMap,
  ProjectionFact,
  ProjectionPageResult,
} from "./projection.js";
import type { OperationResultMap, ProtocolOperation } from "./rpc-contract.js";

export const NATIVE_NOTIFICATION_PROJECTION_FEATURE =
  "native-notification-projection.v1" as const;

export type ProtocolResultShapeFailureReason =
  | "missing-negotiated-field"
  | "unnegotiated-field"
  | "mixed-presence";

export class ProtocolResultShapeError extends TypeError {
  readonly code = "PROTOCOL_INCOMPATIBLE" as const;
  readonly operation: ProtocolOperation;
  readonly reason: ProtocolResultShapeFailureReason;

  constructor(
    operation: ProtocolOperation,
    reason: ProtocolResultShapeFailureReason,
  ) {
    super(`protocol result for ${operation} has ${reason}`);
    this.name = "ProtocolResultShapeError";
    this.operation = operation;
    this.reason = reason;
  }
}

function factValues<Value>(fact: ProjectionFact<Value>): readonly Value[] {
  if (fact.freshness === "unavailable") return [];
  if (fact.freshness === "conflict") return fact.candidates;
  return [fact.value];
}

function snapshotAttention(result: OperatorProjectionSnapshot): readonly AttentionItem[] {
  return factValues(result.attention).flatMap((items) => items);
}

function projectionPageAttention(
  result: ProjectionPageResult,
): readonly AttentionItem[] {
  if (result.view !== "attention") return [];
  const page = result as ProjectionPageResult<"attention">;
  return factValues(page.page).flatMap((value) => value.items);
}

function viewPageAttention(
  result: OperatorViewPageResult,
): readonly OperatorViewSummaryMap["attention"][] {
  if (result.status !== "page" || result.view !== "attention") return [];
  const page = result as Extract<OperatorViewPageResult<"attention">, { status: "page" }>;
  return page.rows.flatMap((row) =>
    factValues(row.fact).map((candidate) => candidate.summary)
  );
}

function notificationPresence(
  operation: ProtocolOperation,
  result: OperationResultMap[ProtocolOperation],
): readonly boolean[] {
  if (operation === FABRIC_OPERATIONS.projectionSnapshot) {
    return snapshotAttention(
      result as OperationResultMap[typeof FABRIC_OPERATIONS.projectionSnapshot],
    ).map((item) => item.nativeNotification !== undefined);
  }
  if (operation === FABRIC_OPERATIONS.projectionPage) {
    return projectionPageAttention(
      result as OperationResultMap[typeof FABRIC_OPERATIONS.projectionPage],
    ).map((item) => item.nativeNotification !== undefined);
  }
  if (operation === FABRIC_OPERATIONS.projectionViewPage) {
    return viewPageAttention(
      result as OperationResultMap[typeof FABRIC_OPERATIONS.projectionViewPage],
    ).map((summary) => summary.nativeNotification !== undefined);
  }
  return [];
}

/** Restores the negotiated closed result shape after context-free wire decoding. */
export function assertOperationResultFeatureShape<Operation extends ProtocolOperation>(
  operation: Operation,
  features: readonly string[],
  result: OperationResultMap[Operation],
): OperationResultMap[Operation] {
  const presence = notificationPresence(
    operation,
    result as OperationResultMap[ProtocolOperation],
  );
  if (presence.length === 0) return result;
  const includesNotification = features.includes(
    NATIVE_NOTIFICATION_PROJECTION_FEATURE,
  );
  const presentCount = presence.filter(Boolean).length;
  if (presentCount !== 0 && presentCount !== presence.length) {
    throw new ProtocolResultShapeError(operation, "mixed-presence");
  }
  if (includesNotification && presentCount === 0) {
    throw new ProtocolResultShapeError(operation, "missing-negotiated-field");
  }
  if (!includesNotification && presentCount > 0) {
    throw new ProtocolResultShapeError(operation, "unnegotiated-field");
  }
  return result;
}

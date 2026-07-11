import { FABRIC_OPERATIONS, type FabricOperation } from "./operations.js";

export const FABRIC_PROTOCOL_VERSION = 1 as const;

export const PROTOCOL_FEATURES = [
  "project-sessions.v1",
  "operator-control.v1",
  "intakes.v1",
  "scoped-gates.v1",
  "resource-reservations.v1",
  "request-results.v1",
  "chair-takeover.v1",
  "operator-projection.v1",
  "message-body-read.v1",
  "lifecycle-control.v1",
] as const;

export type ProtocolFeature = (typeof PROTOCOL_FEATURES)[number];

export const FEATURE_OPERATIONS = Object.freeze({
  "project-sessions.v1": [
    FABRIC_OPERATIONS.projectSessionCreate,
    FABRIC_OPERATIONS.projectSessionGet,
    FABRIC_OPERATIONS.projectSessionTransition,
    FABRIC_OPERATIONS.projectSessionClose,
    FABRIC_OPERATIONS.membershipBind,
  ],
  "operator-control.v1": [
    FABRIC_OPERATIONS.operatorAttach,
    FABRIC_OPERATIONS.operatorDetach,
    FABRIC_OPERATIONS.operatorHeartbeat,
    FABRIC_OPERATIONS.operatorCommand,
    FABRIC_OPERATIONS.operatorInputAttest,
  ],
  "intakes.v1": [FABRIC_OPERATIONS.intakeSubmit, FABRIC_OPERATIONS.intakeRevise],
  "scoped-gates.v1": [
    FABRIC_OPERATIONS.scopedGateCreate,
    FABRIC_OPERATIONS.scopedGateRebind,
    FABRIC_OPERATIONS.scopedGateResolve,
    FABRIC_OPERATIONS.scopedGateCheck,
  ],
  "resource-reservations.v1": [
    FABRIC_OPERATIONS.resourceReserve,
    FABRIC_OPERATIONS.resourceRelease,
    FABRIC_OPERATIONS.resourceReconcile,
  ],
  "request-results.v1": [
    FABRIC_OPERATIONS.taskRequest,
    FABRIC_OPERATIONS.taskCompleteWithReply,
    FABRIC_OPERATIONS.resultDeliveryClaim,
    FABRIC_OPERATIONS.resultDeliveryProviderAccept,
    FABRIC_OPERATIONS.resultDeliveryConsume,
    FABRIC_OPERATIONS.resultDeliveryRetry,
    FABRIC_OPERATIONS.resultDeliveryReassign,
    FABRIC_OPERATIONS.resultDeliveryAbandon,
  ],
  "chair-takeover.v1": [FABRIC_OPERATIONS.chairTakeover],
  "operator-projection.v1": [FABRIC_OPERATIONS.projectionSnapshot, FABRIC_OPERATIONS.projectionEvents],
  "message-body-read.v1": [FABRIC_OPERATIONS.messageBodyRead],
  "lifecycle-control.v1": [
    FABRIC_OPERATIONS.projectSessionDrain,
    FABRIC_OPERATIONS.projectSessionStop,
    FABRIC_OPERATIONS.daemonDrain,
    FABRIC_OPERATIONS.daemonStop,
  ],
} as const satisfies Record<ProtocolFeature, readonly FabricOperation[]>);

export function operationsForFeatures(features: readonly ProtocolFeature[]): ReadonlySet<FabricOperation> {
  return new Set(features.flatMap((feature) => FEATURE_OPERATIONS[feature]));
}

export type ProtocolNegotiationRequest = {
  protocolVersion: number;
  requiredFeatures: readonly ProtocolFeature[];
  optionalFeatures: readonly ProtocolFeature[];
};

export type ProtocolOffer = {
  protocolVersion: number;
  features: readonly ProtocolFeature[];
};

export type ProtocolNegotiationResult =
  | {
      ok: true;
      protocolVersion: typeof FABRIC_PROTOCOL_VERSION;
      features: ProtocolFeature[];
    }
  | {
      ok: false;
      reason: "protocol-version-unsupported";
      requestedVersion: number;
      offeredVersion: number;
    }
  | {
      ok: false;
      reason: "required-features-unavailable";
      missingFeatures: ProtocolFeature[];
    };

export function negotiateProtocol(
  request: ProtocolNegotiationRequest,
  offer: ProtocolOffer,
): ProtocolNegotiationResult {
  if (
    request.protocolVersion !== FABRIC_PROTOCOL_VERSION ||
    offer.protocolVersion !== FABRIC_PROTOCOL_VERSION
  ) {
    return {
      ok: false,
      reason: "protocol-version-unsupported",
      requestedVersion: request.protocolVersion,
      offeredVersion: offer.protocolVersion,
    };
  }

  const available = new Set(offer.features);
  const missingFeatures = request.requiredFeatures.filter((feature) => !available.has(feature));
  if (missingFeatures.length > 0) {
    return { ok: false, reason: "required-features-unavailable", missingFeatures };
  }

  const requested = new Set([...request.requiredFeatures, ...request.optionalFeatures]);
  return {
    ok: true,
    protocolVersion: FABRIC_PROTOCOL_VERSION,
    features: offer.features.filter((feature) => requested.has(feature)),
  };
}

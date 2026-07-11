import {
  OPERATION_REGISTRY,
  type FabricOperation,
  type OperationFeature,
} from "./operations.js";

export const FABRIC_PROTOCOL_VERSION = 1 as const;

export const PROTOCOL_FEATURES = [
  "fabric-core.v1",
  "project-sessions.v1",
  "operator-control.v1",
  "input-attestation.v1",
  "intakes.v1",
  "scoped-gates.v1",
  "scoped-gate-read.v1",
  "resource-reservations.v1",
  "request-results.v1",
  "chair-takeover.v1",
  "operator-projection.v1",
  "operator-projection.v2",
  "operator-actions.v1",
  "message-body-read.v1",
  "operator-repository-read.v1",
  "lifecycle-control.v1",
] as const;

export type ProtocolFeature = OperationFeature;

function buildFeatureOperations(): Readonly<Record<ProtocolFeature, readonly FabricOperation[]>> {
  const grouped = Object.fromEntries(PROTOCOL_FEATURES.map((feature) => [feature, [] as FabricOperation[]])) as
    Record<ProtocolFeature, FabricOperation[]>;
  for (const [operation, definition] of Object.entries(OPERATION_REGISTRY)) {
    if (definition.kind === "retired") continue;
    grouped[definition.feature].push(operation as FabricOperation);
  }
  for (const operations of Object.values(grouped)) Object.freeze(operations);
  return Object.freeze(grouped);
}

export const FEATURE_OPERATIONS = buildFeatureOperations();

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

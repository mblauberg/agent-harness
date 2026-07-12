import type {
  FabricAgentIdentity,
  HerdrPaneObservation,
  IdentityField,
  IdentityReconciliation,
} from "./contracts.js";

const IDENTITY_FIELDS = [
  "projectId",
  "projectSessionId",
  "coordinationRunId",
  "agentId",
  "provider",
  "modelFamily",
  "providerSessionRef",
  "providerSessionGeneration",
] as const satisfies readonly IdentityField[];

/**
 * Reconciles Herdr presence with Fabric/provider identity without mutating either.
 * A pane alone is deliberately insufficient evidence for readiness.
 */
export function reconcileIdentity(
  expected: FabricAgentIdentity,
  observation: HerdrPaneObservation,
): IdentityReconciliation {
  if (observation.state !== "present") {
    return {
      readiness: "visibility-degraded",
      ready: false,
      paneRef: null,
      reason: observation.reason,
      providerState: "unknown",
    };
  }

  if (observation.identity === null) {
    return {
      readiness: "identity-unverified",
      ready: false,
      paneRef: observation.paneRef,
      reason: "pane presence is not provider-session evidence",
    };
  }

  const mismatches = IDENTITY_FIELDS.filter(
    (field) => expected[field] !== observation.identity?.[field],
  );
  if (mismatches.length > 0) {
    return {
      readiness: "identity-conflict",
      ready: false,
      paneRef: observation.paneRef,
      mismatches,
    };
  }

  return { readiness: "ready", ready: true, paneRef: observation.paneRef };
}

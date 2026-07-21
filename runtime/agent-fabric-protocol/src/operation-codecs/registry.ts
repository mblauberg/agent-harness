// Proof-bearing operation-codec registry composer (#354 S5a).
//
// This module owns the fragment contract and the composition/exhaustiveness machinery only. It
// must not own any operation-specific codec logic — domain fragments (moved in S5b/S5c) and the
// temporary catch-all legacy fragment (operation-codecs.ts, S5a-S5c) supply the actual codec
// pairs; this module only proves, at compose time, that every canonical operation is covered
// exactly once.
import { OPERATION_REGISTRY } from "../operations.js";
import type { ProtocolOperation } from "../rpc-contract.js";
import type { OperationCodecFragment, OperationCodecPair } from "./common.js";

/**
 * Compose an ordered list of domain codec fragments into one registry record, throwing on the
 * first key contributed by more than one fragment. Duplicate detection runs before any
 * assignment, so a colliding key never silently overwrites an earlier fragment's entry.
 */
export function composeOperationCodecFragments(
  fragments: readonly OperationCodecFragment[],
): Readonly<Record<ProtocolOperation, OperationCodecPair>> {
  const seen = new Set<ProtocolOperation>();
  for (const fragment of fragments) {
    for (const key of Object.keys(fragment) as ProtocolOperation[]) {
      if (seen.has(key)) {
        throw new Error(`operation codec registry: duplicate fragment entry for operation "${key}"`);
      }
      seen.add(key);
    }
  }
  const composed: Partial<Record<ProtocolOperation, OperationCodecPair>> = {};
  for (const fragment of fragments) {
    Object.assign(composed, fragment);
  }
  return Object.freeze(composed) as Readonly<Record<ProtocolOperation, OperationCodecPair>>;
}

/**
 * Hardened, symmetric exhaustiveness check: compares the canonical operation key set
 * (`OPERATION_REGISTRY`) against the composed registry's key set in both directions and reports
 * every missing and every unexpected key. A count-only comparison (the prior implementation) can
 * pass while two disjoint keys are simultaneously missing and unexpected; this cannot.
 */
export function assertComposedRegistryExhaustive(
  registry: Readonly<Record<string, OperationCodecPair>>,
): void {
  const canonical = new Set(Object.keys(OPERATION_REGISTRY));
  const actual = new Set(Object.keys(registry));
  const missing = [...canonical].filter((key) => !actual.has(key)).sort();
  const unexpected = [...actual].filter((key) => !canonical.has(key)).sort();
  if (missing.length > 0 || unexpected.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing=[${missing.join(", ")}]`);
    if (unexpected.length > 0) parts.push(`unexpected=[${unexpected.join(", ")}]`);
    throw new Error(`operation codec registry is not exhaustive: ${parts.join(" ")}`);
  }
}

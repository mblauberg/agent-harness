// Proof-bearing operation-codec registry composer (#354 S5a).
//
// This module owns the fragment contract and the composition/exhaustiveness machinery only. It
// must not own any operation-specific codec logic — domain fragments (moved in S5b/S5c) and the
// temporary catch-all legacy fragment (operation-codecs.ts, S5a-S5c) supply the actual codec
// pairs; this module only proves, at compose time, that every canonical operation is covered
// exactly once.
import { OPERATION_REGISTRY } from "../operations.js";
import type { ProtocolOperation } from "../rpc-contract.js";
import type {
  OperationCodecFragment,
  OperationCodecPair,
  OperationShapeFragment,
  WireShape,
} from "./common.js";

/**
 * Compose an ordered list of domain codec fragments into one registry record, throwing on the
 * first key contributed by more than one fragment. Duplicate detection runs before any
 * assignment, so a colliding key never silently overwrites an earlier fragment's entry.
 */
export function composeOperationCodecFragments(
  fragments: readonly OperationCodecFragment[],
): Readonly<Record<ProtocolOperation, OperationCodecPair>> {
  const seen = new Set<ProtocolOperation>();
  const canonical = new Set(Object.keys(OPERATION_REGISTRY));
  for (const fragment of fragments) {
    for (const key of Object.keys(fragment)) {
      if (!canonical.has(key)) {
        throw new Error(`operation codec registry: unexpected fragment entry for operation "${key}"`);
      }
      if (seen.has(key as ProtocolOperation)) {
        throw new Error(`operation codec registry: duplicate fragment entry for operation "${key}"`);
      }
      if (fragment[key as ProtocolOperation] === undefined) {
        throw new Error(`operation codec registry: undefined fragment entry for operation "${key}"`);
      }
      seen.add(key as ProtocolOperation);
    }
  }
  const composed: Partial<Record<ProtocolOperation, OperationCodecPair>> = {};
  for (const fragment of fragments) {
    Object.assign(composed, fragment);
  }
  const ordered: Partial<Record<ProtocolOperation, OperationCodecPair>> = {};
  for (const operation of Object.keys(OPERATION_REGISTRY) as ProtocolOperation[]) {
    if (Object.hasOwn(composed, operation)) ordered[operation] = composed[operation]!;
  }
  return Object.freeze(ordered) as Readonly<Record<ProtocolOperation, OperationCodecPair>>;
}

/** Compose shape fragments with the same duplicate and canonical-order guarantees as codecs. */
export function composeOperationShapeFragments(
  fragments: readonly OperationShapeFragment[],
): Readonly<Record<ProtocolOperation, WireShape>> {
  const seen = new Set<ProtocolOperation>();
  const canonical = new Set(Object.keys(OPERATION_REGISTRY));
  const composed: Partial<Record<ProtocolOperation, WireShape>> = {};
  for (const fragment of fragments) {
    for (const key of Object.keys(fragment)) {
      if (!canonical.has(key)) {
        throw new Error(`operation shape registry: unexpected fragment entry for operation "${key}"`);
      }
      if (seen.has(key as ProtocolOperation)) {
        throw new Error(`operation shape registry: duplicate fragment entry for operation "${key}"`);
      }
      seen.add(key as ProtocolOperation);
      composed[key as ProtocolOperation] = fragment[key as ProtocolOperation]!;
    }
  }
  const ordered: Partial<Record<ProtocolOperation, WireShape>> = {};
  for (const operation of Object.keys(OPERATION_REGISTRY) as ProtocolOperation[]) {
    if (Object.hasOwn(composed, operation)) ordered[operation] = composed[operation]!;
  }
  return Object.freeze(ordered) as Readonly<Record<ProtocolOperation, WireShape>>;
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
  const missing = [...canonical].filter((key) => !actual.has(key) || Reflect.get(registry, key) === undefined).sort();
  const unexpected = [...actual].filter((key) => !canonical.has(key)).sort();
  if (missing.length > 0 || unexpected.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing=[${missing.join(", ")}]`);
    if (unexpected.length > 0) parts.push(`unexpected=[${unexpected.join(", ")}]`);
    throw new Error(`operation codec registry is not exhaustive: ${parts.join(" ")}`);
  }
}

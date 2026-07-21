// Shared cross-domain primitives for the operation-codecs registry split (#354 S5).
//
// This module owns only genuinely cross-domain wire-shape/codec-pair types and the fragment
// contract used to compose the per-domain codec registry. It must not own operation-membership
// logic (which operation belongs to which domain) — that stays with the registry composer and,
// once extracted, the domain fragment modules themselves.
import type { Codec } from "../codec.js";
import type { ProtocolOperation } from "../rpc-contract.js";

/** The wire-level required/optional property shape of a JSON object operation payload. */
export type ObjectWireShape = {
  kind: "object";
  required: readonly string[];
  optional: readonly string[];
};

/** The wire-level shape of any operation input/result payload. */
export type WireShape = ObjectWireShape | { kind: "array" } | { kind: "null" };

/** The parse/validate codec pair bound to one canonical protocol operation. */
export type OperationCodecPair = {
  readonly input: Codec<unknown>;
  readonly result: Codec<unknown>;
};

/**
 * One domain's contribution to the operation codec registry: a partial map from the operations
 * that domain owns to their codec pair. The registry composer spreads every fragment together and
 * proves, at compile time, that the union covers every `ProtocolOperation` exactly once.
 */
export type OperationCodecFragment = Readonly<Partial<Record<ProtocolOperation, OperationCodecPair>>>;

/**
 * Compile-time exhaustiveness helper: a type that only type-checks when instantiated with `never`.
 * Used both directions — `AssertNever<Exclude<ProtocolOperation, keyof Composed>>` proves no
 * canonical operation is missing from a composed registry, and
 * `AssertNever<Exclude<keyof Composed, ProtocolOperation>>` proves the composed registry has no
 * unexpected extra key. A non-`never` argument is a compile error, so this doubles as
 * self-documentation for the two directions of the proof.
 */
export type AssertNever<T extends never> = T;

// Proof-bearing operation-codec registry composer (#354 S5a).
//
// This module owns the fragment contract and the composition/exhaustiveness machinery only. It
// must not own any operation-specific codec logic — the 13 domain fragments supply the actual
// codec pairs; this module only wires cross-domain dependencies and proves, at compose time, that
// every canonical operation is covered exactly once.
import { OPERATION_REGISTRY } from "../operations.js";
import type { ProtocolOperation } from "../rpc-contract.js";
import type {
  AssertNever,
  OperationCodecFragment,
  OperationCodecPair,
  OperationShapeFragment,
  WireShape,
} from "./common.js";
import { artifactsOperationCodecFragment, ARTIFACTS_INPUT_SHAPES, ARTIFACTS_RESULT_SHAPES } from "./artifacts.js";
import { coreOperationCodecFragment, CORE_INPUT_SHAPES, CORE_RESULT_SHAPES } from "./core.js";
import { controlPlaneOperationCodecFragment, CONTROL_PLANE_INPUT_SHAPES, CONTROL_PLANE_RESULT_SHAPES } from "./control-plane.js";
import { createAdmissionOperationCodecFragment, ADMISSION_INPUT_SHAPES, ADMISSION_RESULT_SHAPES } from "./admission.js";
import {
  gitActionsOperationCodecFragment,
  gitAuthoriseIntentCodec,
  gitCustodyResolveIntentCodec,
  gitIntentCodec,
  gitOperationDraftIntentCodec,
  gitRepositoryProjectionCodec,
  gitRepositorySummaryCodec,
  gitResolutionEligibilityReasonCodec,
  GIT_ACTIONS_INPUT_SHAPES,
  GIT_ACTIONS_RESULT_SHAPES,
} from "./git-actions.js";
import { lifecycleOperationCodecFragment, LIFECYCLE_INPUT_SHAPES, LIFECYCLE_RESULT_SHAPES } from "./lifecycle.js";
import { messagingOperationCodecFragment, MESSAGING_INPUT_SHAPES, MESSAGING_RESULT_SHAPES } from "./messaging.js";
import { createOperatorActionsCodecs, OPERATOR_ACTIONS_INPUT_SHAPES, OPERATOR_ACTIONS_RESULT_SHAPES } from "./operator-actions.js";
import { createOperatorProjectionOperationCodecFragment, OPERATOR_PROJECTION_INPUT_SHAPES, OPERATOR_PROJECTION_RESULT_SHAPES } from "./operator-projection.js";
import { createProjectSessionOperationCodecFragment, projectSessionCodec, PROJECT_SESSION_INPUT_SHAPES, PROJECT_SESSION_RESULT_SHAPES } from "./project-session.js";
import { providerActionOperationCodecFragment, PROVIDER_ACTION_INPUT_SHAPES, PROVIDER_ACTION_RESULT_SHAPES } from "./provider-action.js";
import { providerReviewOperationCodecFragment, PROVIDER_REVIEW_INPUT_SHAPES, PROVIDER_REVIEW_RESULT_SHAPES } from "./provider-review.js";
import { requestResultOperationCodecFragment, REQUEST_RESULT_INPUT_SHAPES, REQUEST_RESULT_RESULT_SHAPES, taskRequestCodec } from "./request-result.js";
import { runPlanOperationCodecFragment, RUN_PLAN_INPUT_SHAPES, RUN_PLAN_RESULT_SHAPES } from "./run-plan.js";

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

type UnionToIntersection<Union> = (
  Union extends unknown ? (value: Union) => void : never
) extends (value: infer Intersection) => void ? Intersection : never;

/** Compose shape fragments with the same duplicate and canonical-order guarantees as codecs. */
export function composeOperationShapeFragments<const Fragments extends readonly OperationShapeFragment[]>(
  fragments: Fragments,
): Readonly<UnionToIntersection<Fragments[number]>> {
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
  return Object.freeze(ordered) as Readonly<UnionToIntersection<Fragments[number]>>;
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

const operatorActionsCodecs = createOperatorActionsCodecs({
  gitIntentCodec,
  gitAuthoriseIntentCodec,
  gitOperationDraftIntentCodec,
  gitCustodyResolveIntentCodec,
  gitResolutionEligibilityReasonCodec,
});

const projectSessionOperationCodecFragment = createProjectSessionOperationCodecFragment({
  operatorActionPreviewCodec: operatorActionsCodecs.operatorActionPreviewCodec,
});
const admissionOperationCodecFragment = createAdmissionOperationCodecFragment({ taskRequestCodec });
const operatorActionsOperationCodecFragment = operatorActionsCodecs.fragment;
const operatorProjectionOperationCodecFragment = createOperatorProjectionOperationCodecFragment({
  projectSessionCodec,
  gitRepositorySummaryCodec,
  gitRepositoryProjectionCodec,
});

const operationCodecFragments = [
  coreOperationCodecFragment,
  messagingOperationCodecFragment,
  lifecycleOperationCodecFragment,
  providerActionOperationCodecFragment,
  projectSessionOperationCodecFragment,
  requestResultOperationCodecFragment,
  runPlanOperationCodecFragment,
  controlPlaneOperationCodecFragment,
  admissionOperationCodecFragment,
  gitActionsOperationCodecFragment,
  operatorActionsOperationCodecFragment,
  operatorProjectionOperationCodecFragment,
  artifactsOperationCodecFragment,
  providerReviewOperationCodecFragment,
] as const;

const exactOperationCodecs = {
  ...coreOperationCodecFragment,
  ...messagingOperationCodecFragment,
  ...lifecycleOperationCodecFragment,
  ...providerActionOperationCodecFragment,
  ...projectSessionOperationCodecFragment,
  ...requestResultOperationCodecFragment,
  ...runPlanOperationCodecFragment,
  ...controlPlaneOperationCodecFragment,
  ...admissionOperationCodecFragment,
  ...gitActionsOperationCodecFragment,
  ...operatorActionsOperationCodecFragment,
  ...operatorProjectionOperationCodecFragment,
  ...artifactsOperationCodecFragment,
  ...providerReviewOperationCodecFragment,
} as const satisfies Record<ProtocolOperation, OperationCodecPair>;

export type OperationCodecMissingKeyProof = AssertNever<Exclude<ProtocolOperation, keyof typeof exactOperationCodecs>>;
export type OperationCodecExtraKeyProof = AssertNever<Exclude<keyof typeof exactOperationCodecs, ProtocolOperation>>;

export const OPERATION_CODECS = composeOperationCodecFragments(operationCodecFragments);
assertComposedRegistryExhaustive(OPERATION_CODECS);

const s5cInputShapes = composeOperationShapeFragments([
  CORE_INPUT_SHAPES,
  MESSAGING_INPUT_SHAPES,
  ADMISSION_INPUT_SHAPES,
  GIT_ACTIONS_INPUT_SHAPES,
  OPERATOR_ACTIONS_INPUT_SHAPES,
  OPERATOR_PROJECTION_INPUT_SHAPES,
] as const);

const inputShapeFragments = [
  s5cInputShapes,
  LIFECYCLE_INPUT_SHAPES,
  PROVIDER_ACTION_INPUT_SHAPES,
  PROJECT_SESSION_INPUT_SHAPES,
  REQUEST_RESULT_INPUT_SHAPES,
  RUN_PLAN_INPUT_SHAPES,
  CONTROL_PLANE_INPUT_SHAPES,
  ARTIFACTS_INPUT_SHAPES,
  PROVIDER_REVIEW_INPUT_SHAPES,
] as const;

composeOperationShapeFragments(inputShapeFragments);
export const OPERATION_INPUT_SHAPES = {
  ...s5cInputShapes,
  ...LIFECYCLE_INPUT_SHAPES,
  ...PROVIDER_ACTION_INPUT_SHAPES,
  ...PROJECT_SESSION_INPUT_SHAPES,
  ...REQUEST_RESULT_INPUT_SHAPES,
  ...RUN_PLAN_INPUT_SHAPES,
  ...CONTROL_PLANE_INPUT_SHAPES,
  ...ARTIFACTS_INPUT_SHAPES,
  ...PROVIDER_REVIEW_INPUT_SHAPES,
} as const satisfies Record<ProtocolOperation, WireShape>;

const s5cResultShapes = composeOperationShapeFragments([
  CORE_RESULT_SHAPES,
  MESSAGING_RESULT_SHAPES,
  ADMISSION_RESULT_SHAPES,
  GIT_ACTIONS_RESULT_SHAPES,
  OPERATOR_ACTIONS_RESULT_SHAPES,
  OPERATOR_PROJECTION_RESULT_SHAPES,
] as const);

const resultShapeFragments = [
  s5cResultShapes,
  LIFECYCLE_RESULT_SHAPES,
  PROVIDER_ACTION_RESULT_SHAPES,
  PROJECT_SESSION_RESULT_SHAPES,
  REQUEST_RESULT_RESULT_SHAPES,
  RUN_PLAN_RESULT_SHAPES,
  CONTROL_PLANE_RESULT_SHAPES,
  ARTIFACTS_RESULT_SHAPES,
  PROVIDER_REVIEW_RESULT_SHAPES,
] as const;

composeOperationShapeFragments(resultShapeFragments);
export const OPERATION_RESULT_SHAPES = {
  ...s5cResultShapes,
  ...LIFECYCLE_RESULT_SHAPES,
  ...PROVIDER_ACTION_RESULT_SHAPES,
  ...PROJECT_SESSION_RESULT_SHAPES,
  ...REQUEST_RESULT_RESULT_SHAPES,
  ...RUN_PLAN_RESULT_SHAPES,
  ...CONTROL_PLANE_RESULT_SHAPES,
  ...ARTIFACTS_RESULT_SHAPES,
  ...PROVIDER_REVIEW_RESULT_SHAPES,
} as const satisfies Record<ProtocolOperation, WireShape>;

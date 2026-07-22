// Shared cross-domain primitives for the operation-codecs registry split (#354 S5).
//
// This file contains only primitives and mechanics referenced by more than one operation domain.
// Operation membership, shape ownership, and specialised operation codecs stay in fragments.
import {
  FABRIC_OPERATIONS,
  isActiveFabricOperation,
  OPERATION_REGISTRY,
  type FabricOperation,
  type OperationPrincipalKind,
} from "../operations.js";
import {
  arrayOf,
  boolean,
  boundedString,
  defineCodec,
  enumeration,
  identifier,
  integer,
  jsonValue,
  literal,
  nullable,
  objectCodec,
  parserBacked,
  recordOf,
  relativePath,
  secret,
  sha256,
  timestamp,
  unionOf,
  type Codec,
} from "../codec.js";
import { AUTHORITY_ENVELOPE_V2_CODEC } from "../authority.js";
import { parseChairMutationContext, parseOperatorMutationContext } from "../operator.js";
import { budgetUnitKey } from "../resource-unit-keys.js";
import type { ProtocolOperation } from "../rpc-contract.js";
export type { ProtocolOperation } from "../rpc-contract.js";

export type ObjectWireShape = {
  kind: "object";
  required: readonly string[];
  optional: readonly string[];
};
export type WireShape = ObjectWireShape | { kind: "array" } | { kind: "null" };
export type OperationCodecPair = { readonly input: Codec<unknown>; readonly result: Codec<unknown> };
export type OperationCodecFragment = Readonly<Partial<Record<ProtocolOperation, OperationCodecPair>>>;
export type OperationShapeFragment = Readonly<Partial<Record<ProtocolOperation, WireShape>>>;
export type AssertNever<T extends never> = T;
export type ProviderActionResultKind = "non-review" | "certifying-review";
export type OperationResultPrincipalContext = Readonly<{
  kind: OperationPrincipalKind;
  agentId?: string;
  projectSessionId?: string;
  runId?: string;
}>;

export const object = (required: readonly string[], optional: readonly string[] = []): ObjectWireShape => ({
  kind: "object",
  required,
  optional,
});

export const nil = { kind: "null" } as const;

export const text = boundedString();

export const optionalText = boundedString({ minBytes: 0 });

export const positiveInteger = integer({ minimum: 1 });

export const stringList = arrayOf(identifier, { maximum: 256, unique: true });

export const textList = arrayOf(text, { maximum: 256 });

export const integerList = arrayOf(integer(), { maximum: 256, unique: true });

export const numberRecord = recordOf(integer(), { maximum: 128, keyCodec: budgetUnitKey });

export const nonEmptyNumberRecord = recordOf(integer(), {
  minimum: 1,
  maximum: 128,
  keyCodec: budgetUnitKey,
  exampleKey: "concurrent_turns",
});

export const nullableNumberRecord = recordOf(nullable(integer()), {
  minimum: 1,
  maximum: 128,
  keyCodec: budgetUnitKey,
  exampleKey: "concurrent_turns",
});

export const stringRecord = recordOf(text, { maximum: 128 });

export const jsonRecord = recordOf(jsonValue, { maximum: 128 });

export const activeOperationValues = Object.keys(OPERATION_REGISTRY).filter(isActiveFabricOperation);

export const activeOperationCodec = defineCodec<FabricOperation>({
  type: "string",
  enum: activeOperationValues,
}, FABRIC_OPERATIONS.acknowledgeDelivery, (value, path) => {
  if (typeof value !== "string" || !isActiveFabricOperation(value)) {
    throw new TypeError(`${path} must be an active protocol operation`);
  }
  return value;
});

export const artifactRefCodec = objectCodec({ path: relativePath, digest: sha256 });

export const artifactRefsCodec = arrayOf(artifactRefCodec, { maximum: 128 });

export const absoluteFilesystemPathCodec = boundedString({
  maxBytes: 4096,
  pattern: "^/",
  example: "/workspace/project",
});

export const releaseBindingCodec = objectCodec({
  acceptedDeliveryReceiptRef: artifactRefCodec,
  artifactDigest: sha256,
  promotionAction: text,
  target: text,
});

export const projectionSourceCodec = enumeration(["fabric", "delivery-run", "git", "github", "herdr", "provider"]);

export function projectionFact(
  valueCodec: Codec<unknown>,
  sourceCodec: Codec<unknown> = projectionSourceCodec,
): Codec<unknown> {
  return unionOf([
    objectCodec({
      freshness: enumeration(["live", "snapshot", "stale"]),
      source: sourceCodec,
      revision: integer(),
      observedAt: timestamp,
      value: valueCodec,
    }),
    objectCodec({
      freshness: literal("unavailable"),
      source: sourceCodec,
      revision: integer(),
      observedAt: timestamp,
      reason: text,
    }),
    objectCodec({
      freshness: literal("conflict"),
      source: sourceCodec,
      revision: integer(),
      observedAt: timestamp,
      candidates: arrayOf(valueCodec, { minimum: 2, maximum: 16 }),
    }),
  ]);
}

export const credentialCodec = objectCodec({ capabilityId: identifier, token: secret });

export const consoleProvenanceCodec = objectCodec({
  kind: literal("console-direct-input"),
  clientId: identifier,
  inputEventId: identifier,
});

export const attestedProvenanceCodec = objectCodec({
  kind: literal("attested-provider-input"),
  attestationId: identifier,
  integrationId: identifier,
  integrationGeneration: positiveInteger,
});

export const provenanceCodec = unionOf([consoleProvenanceCodec, attestedProvenanceCodec]);

export const operatorMutationBaseCodec = objectCodec({
  credential: credentialCodec,
  commandId: identifier,
  expectedRevision: integer(),
  actor: identifier,
  provenance: provenanceCodec,
  evidenceRefs: artifactRefsCodec,
});

export const operatorMutationCodec = parserBacked(
  operatorMutationBaseCodec,
  parseOperatorMutationContext,
  parseOperatorMutationContext(operatorMutationBaseCodec.example),
);

export const chairMutationBaseCodec = objectCodec({
  commandId: identifier,
  agentId: identifier,
  projectSessionId: identifier,
  coordinationRunId: identifier,
  principalGeneration: positiveInteger,
  chairLeaseId: identifier,
  chairLeaseGeneration: positiveInteger,
  expectedRunRevision: integer(),
  expectedRevision: positiveInteger,
});

export const chairMutationCodec = parserBacked(
  chairMutationBaseCodec,
  parseChairMutationContext,
  parseChairMutationContext(chairMutationBaseCodec.example),
);

export const authorityCodec = AUTHORITY_ENVELOPE_V2_CODEC;

export const messageAudienceCodec = unionOf([
  objectCodec({ kind: literal("agents"), agentIds: arrayOf(identifier, { minimum: 1, maximum: 64, unique: true }) }),
  objectCodec({ kind: literal("team"), teamId: identifier }),
  objectCodec({ kind: literal("task"), taskId: identifier }),
]);

export const messageContextCodec = unionOf([
  objectCodec({ kind: literal("direct") }),
  objectCodec({ kind: literal("task"), taskId: identifier }),
  objectCodec({ kind: literal("task-dependency"), fromTaskId: identifier, toTaskId: identifier }),
  objectCodec({ kind: literal("discussion-group"), groupId: identifier }),
]);

export const recoveryEvidenceCodec = unionOf([
  objectCodec({ kind: literal("unproven") }),
  objectCodec({ kind: literal("predecessor-terminal"), agentId: identifier, providerSessionRef: identifier }),
  objectCodec({ kind: literal("os-isolated"), proofRef: identifier }),
  objectCodec({ kind: literal("patch-only"), serialApplierRef: identifier }),
]);

export const teamMemberCodec = objectCodec({ agentId: identifier, authority: authorityCodec });

export const discussionGroupCodec = objectCodec({
  groupId: identifier,
  memberAgentIds: arrayOf(identifier, { minimum: 2, maximum: 64, unique: true }),
});

export const teamLeaderCodec = objectCodec({ agentId: identifier, authority: authorityCodec });

export const rootTaskInputCodec = objectCodec({ taskId: identifier, objective: text, baseRevision: text });

export function parsedBy(codec: Codec<unknown>, parser: (value: unknown) => unknown): Codec<unknown> {
  return parserBacked(codec, (value) => parser(value), codec.example);
}

export type SemanticFieldCodec = (
  operation: ProtocolOperation,
  field: string,
  direction: "input" | "result",
) => Codec<unknown> | undefined;

const timestampFields = new Set([
  "abandonedAt", "claimDeadline", "committedAt", "consumedAt", "deadline", "expiresAt", "extendUntil",
  "lastEventAt", "occurredAt", "overdueAt", "providerAcceptedAt", "recordedAt", "requestedExpiresAt", "responseDeadline",
]);
const booleanFields = new Set([
  "allowed", "available", "closed", "detached", "hasMore", "required", "requiresAck",
  "terminalNeutralised", "capabilityValuesRedacted", "acknowledged",
]);
const integerFields = new Set([
  "after", "assignmentGeneration", "attachmentGeneration", "callbackGeneration", "chairGeneration", "claimGeneration",
  "committedRevision", "confirmedPreviewRevision", "contextRevision", "contiguousWatermark", "cursor", "currentSnapshotRevision",
  "daemonInstanceGeneration", "dependencyRevision", "depth", "effectCount", "executionCount", "expectedAttachmentGeneration",
  "expectedChairGeneration", "expectedClaimGeneration", "expectedDaemonGeneration", "expectedGeneration", "expectedGlobalStateRevision",
  "expectedMembershipRevision", "expectedOwnerLeaseGeneration", "expectedPrincipalGeneration", "expectedRequestRevision", "expectedRevision",
  "expectedSessionGeneration", "expectedTaskRevision", "expectedTeamGeneration", "generation", "globalStateRevision", "hopCount",
  "integrationGeneration", "limit", "membershipRevision", "nextCursor", "ownerLeaseGeneration", "principalGeneration",
  "providerSessionGeneration", "replyRevision", "requestRevision", "revision", "runRevision", "schemaVersion", "sessionRevision",
  "snapshotCursor", "snapshotRevision", "sourceRevision", "targetRevision", "taskRevision", "ttlMs", "visibilityTimeoutMs",
]);

export function semanticShapeCodec(
  operation: ProtocolOperation,
  direction: "input" | "result",
  shape: WireShape,
  resolveSpecializedField: SemanticFieldCodec = () => undefined,
): Codec<unknown> {
  if (shape.kind === "null") return literal(null);
  if (shape.kind === "array") return arrayOf(jsonValue, { maximum: 256 });
  const semanticFieldCodec = (field: string): Codec<unknown> => {
    const specialized = resolveSpecializedField(operation, field, direction);
    if (specialized !== undefined) return specialized;
    if (field === "command") return operatorMutationCodec;
    if (field === "credential") return credentialCodec;
    if (field === "provenance") return provenanceCodec;
    if (field === "authority") return authorityCodec;
    if (field === "audience") return messageAudienceCodec;
    if (field === "context") return messageContextCodec;
    if (field === "payload" || field === "result") return jsonValue;
    if (field === "detail") return stringRecord;
    if (field === "relativePath") return relativePath;
    if (["sha256", "authorityRef", "before", "after", "checkpointSha256", "payloadDigest", "receiptDigest", "stateDigest"].includes(field)) {
      return sha256;
    }
    if (timestampFields.has(field)) return timestamp;
    if (booleanFields.has(field)) {
      if (["closed", "detached", "acknowledged", "terminalNeutralised", "capabilityValuesRedacted"].includes(field)) return literal(true);
      return boolean;
    }
    if (integerFields.has(field)) return field.toLowerCase().includes("generation") ? positiveInteger : integer();
    if (field.endsWith("Ids")) return stringList;
    if (["dependencies", "eligibleAgentIds", "participantAgentIds", "ownedTaskIds", "memberAgentIds", "objectiveChecks", "blockingGateIds", "affectedTaskIds"].includes(field)) return stringList;
    if (field === "expectedArtifacts") return arrayOf(relativePath, { maximum: 128, unique: true });
    if (["options", "consequences", "history"].includes(field)) return textList;
    if (field === "acknowledgedAboveWatermark") return integerList;
    if (field === "sourcePrefixes") return arrayOf(relativePath, { minimum: 1, maximum: 128, unique: true });
    if (field === "artifactRefs" || field === "evidenceRefs") return artifactRefsCodec;
    if (["launchPacketRef", "handoffRef", "consequencePreviewRef", "drainReceiptRef"].includes(field)) return artifactRefCodec;
    if (field.endsWith("Id") || field.endsWith("Ref") || field === "capability" || field === "actor") return field === "capability" ? secret : identifier;
    if (["baseRevision", "body", "default", "evidence", "handoffEvidence", "humanUtterance", "lifecycle", "objective", "question", "reason", "recommendation", "summary", "target", "title", "type"].includes(field)) return field === "recommendation" ? optionalText : text;
    if (["status", "state", "kind", "origin", "action", "source", "directInputProvenance", "visibility", "providerSession", "delivery", "recovery"].includes(field)) return text;
    throw new Error("semantic codec missing for " + direction + " " + operation + "." + field);
  };
  const required = Object.fromEntries(shape.required.map((field) => [field, semanticFieldCodec(field)]));
  const optional = Object.fromEntries(shape.optional.map((field) => [field, semanticFieldCodec(field)]));
  return objectCodec(required, optional);
}

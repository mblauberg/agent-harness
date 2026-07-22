import { FABRIC_OPERATIONS } from "../operations.js";
import { HERDR_STEER_DISPATCH_REQUEST_CODEC, HERDR_STEER_DISPATCH_RESULT_CODEC } from "../herdr-control.js";
import { parseIntegrationInputAttestationRequest, parseOperatorInputAttestation } from "../operator.js";
import { TOPOLOGY_WAVE_APPEND_RECEIPT_V1_CODEC, TOPOLOGY_WAVE_APPEND_REQUEST_V1_CODEC, TOPOLOGY_WAVE_CURRENT_READ_REQUEST_V1_CODEC, TOPOLOGY_WAVE_CURRENT_READ_V1_CODEC, TOPOLOGY_WAVE_LIST_REQUEST_V1_CODEC, TOPOLOGY_WAVE_LIST_V1_CODEC } from "../topology-evaluation.js";
import { arrayOf, identifier, nullable, objectCodec, enumeration, literal, sha256, timestamp, type Codec } from "../codec.js";
import { object, parsedBy, positiveInteger, semanticShapeCodec, text, type OperationCodecFragment, type OperationShapeFragment } from "./common.js";

export const CONTROL_PLANE_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.operatorAttach]: object(["command", "projectId", "requestedExpiresAt"], ["projectSessionId", "expectedAttachmentGeneration"]),
  [FABRIC_OPERATIONS.operatorDetach]: object(["command", "attachmentGeneration"]),
  [FABRIC_OPERATIONS.operatorHeartbeat]: object(["command", "attachmentGeneration", "extendUntil"]),
  [FABRIC_OPERATIONS.integrationInputAttest]: object(["context", "attestation"]),
  [FABRIC_OPERATIONS.herdrSteerDispatch]: object(["actionId", "fireAndForget", "targetAgentId", "paneRef", "reference", "prompt"]),
  [FABRIC_OPERATIONS.topologyWaveAppend]: object(["schemaVersion", "commandId", "projectSessionId", "coordinationRunId", "expectedCurrent", "plan"]),
  [FABRIC_OPERATIONS.topologyWaveCurrentRead]: object(["schemaVersion", "projectSessionId", "coordinationRunId", "taskId"]),
  [FABRIC_OPERATIONS.topologyWaveList]: object(["schemaVersion", "projectSessionId", "coordinationRunId", "taskId", "pageSize", "cursor"]),
} as const satisfies OperationShapeFragment;

export const CONTROL_PLANE_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.operatorAttach]: object(["clientId", "projectId", "projectAuthorityGeneration", "projectSessionId", "generation", "expiresAt"]),
  [FABRIC_OPERATIONS.operatorDetach]: object(["detached", "revision"]),
  [FABRIC_OPERATIONS.operatorHeartbeat]: object(["clientId", "projectId", "projectAuthorityGeneration", "projectSessionId", "generation", "expiresAt"]),
  [FABRIC_OPERATIONS.integrationInputAttest]: object(["attestationId", "integrationId", "integrationGeneration", "operatorId", "projectId", "projectSessionId", "providerEvent", "humanUtterance", "gateBinding", "recordedAt"]),
  [FABRIC_OPERATIONS.herdrSteerDispatch]: object(["status"], ["actionId", "revision", "reason", "integration", "receipt"]),
  [FABRIC_OPERATIONS.topologyWaveAppend]: object(["schemaVersion", "commandId", "status", "priorPlanRef", "planRef", "pointer", "receiptDigest"]),
  [FABRIC_OPERATIONS.topologyWaveCurrentRead]: object(["schemaVersion", "currency", "plan", "pointer"]),
  [FABRIC_OPERATIONS.topologyWaveList]: object(["schemaVersion", "plans", "nextCursor", "watermarkRevision"]),
} as const satisfies OperationShapeFragment;

export const integrationContextCodec = objectCodec({
  commandId: identifier,
  integrationId: identifier,
  expectedIntegrationGeneration: positiveInteger,
  eventId: identifier,
  eventDigest: sha256,
});

export const providerEventCodec = objectCodec({
  providerId: identifier,
  providerSessionRef: identifier,
  providerMessageId: identifier,
  inputEventId: identifier,
  eventDigest: sha256,
  classification: literal("direct-human"),
});

export const gateBindingCodec = objectCodec({
  gateId: identifier,
  expectedGateRevision: positiveInteger,
  artifactDigests: arrayOf(sha256, { minimum: 1, maximum: 128, unique: true }),
  interpretedDecision: enumeration(["approve", "reject", "defer", "request-changes"]),
});

export const attestationCodec = objectCodec({
  attestationId: identifier,
  integrationId: identifier,
  integrationGeneration: positiveInteger,
  operatorId: identifier,
  projectId: identifier,
  projectSessionId: identifier,
  providerEvent: providerEventCodec,
  humanUtterance: text,
  gateBinding: gateBindingCodec,
  recordedAt: timestamp,
});

export const operatorAttachmentCodec = objectCodec({
  clientId: identifier,
  projectId: identifier,
  projectAuthorityGeneration: positiveInteger,
  projectSessionId: nullable(identifier),
  generation: positiveInteger,
  expiresAt: timestamp,
});

const controlPlaneFieldCodec = (_operation: Parameters<typeof semanticShapeCodec>[0], field: string, _direction: Parameters<typeof semanticShapeCodec>[1]): Codec<unknown> | undefined => {
  if (field === "context") return integrationContextCodec;
  if (field === "attestation") return attestationCodec;
  return undefined;
};

export const controlPlaneOperationCodecFragment = {
  [FABRIC_OPERATIONS.operatorAttach]: { input: semanticShapeCodec(FABRIC_OPERATIONS.operatorAttach, "input", CONTROL_PLANE_INPUT_SHAPES[FABRIC_OPERATIONS.operatorAttach]), result: operatorAttachmentCodec },
  [FABRIC_OPERATIONS.operatorDetach]: { input: semanticShapeCodec(FABRIC_OPERATIONS.operatorDetach, "input", CONTROL_PLANE_INPUT_SHAPES[FABRIC_OPERATIONS.operatorDetach]), result: semanticShapeCodec(FABRIC_OPERATIONS.operatorDetach, "result", CONTROL_PLANE_RESULT_SHAPES[FABRIC_OPERATIONS.operatorDetach]) },
  [FABRIC_OPERATIONS.operatorHeartbeat]: { input: semanticShapeCodec(FABRIC_OPERATIONS.operatorHeartbeat, "input", CONTROL_PLANE_INPUT_SHAPES[FABRIC_OPERATIONS.operatorHeartbeat]), result: operatorAttachmentCodec },
  [FABRIC_OPERATIONS.integrationInputAttest]: { input: parsedBy(semanticShapeCodec(FABRIC_OPERATIONS.integrationInputAttest, "input", CONTROL_PLANE_INPUT_SHAPES[FABRIC_OPERATIONS.integrationInputAttest], controlPlaneFieldCodec), parseIntegrationInputAttestationRequest), result: parsedBy(attestationCodec, parseOperatorInputAttestation) },
  [FABRIC_OPERATIONS.herdrSteerDispatch]: { input: HERDR_STEER_DISPATCH_REQUEST_CODEC, result: HERDR_STEER_DISPATCH_RESULT_CODEC },
  [FABRIC_OPERATIONS.topologyWaveAppend]: { input: TOPOLOGY_WAVE_APPEND_REQUEST_V1_CODEC, result: TOPOLOGY_WAVE_APPEND_RECEIPT_V1_CODEC },
  [FABRIC_OPERATIONS.topologyWaveCurrentRead]: { input: TOPOLOGY_WAVE_CURRENT_READ_REQUEST_V1_CODEC, result: TOPOLOGY_WAVE_CURRENT_READ_V1_CODEC },
  [FABRIC_OPERATIONS.topologyWaveList]: { input: TOPOLOGY_WAVE_LIST_REQUEST_V1_CODEC, result: TOPOLOGY_WAVE_LIST_V1_CODEC },
} satisfies OperationCodecFragment;

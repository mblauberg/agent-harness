import {
  arrayOf,
  boolean,
  boundedString,
  enumeration,
  identifier,
  integer,
  literal,
  objectCodec,
  timestamp,
  unionOf,
  type Codec,
} from "../codec.js";
import { FABRIC_OPERATIONS } from "../operations.js";
import {
  artifactRefsCodec,
  integerList,
  messageAudienceCodec,
  messageContextCodec,
  object,
  positiveInteger,
  semanticShapeCodec,
  text,
  type OperationCodecFragment,
  type OperationShapeFragment,
} from "./common.js";

export const MESSAGING_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.sendMessage]: object(["audience", "kind", "body", "requiresAck", "dedupeKey"], ["conversationId", "replyToMessageId", "taskRevision", "hopCount", "expiresAt", "context"]),
  [FABRIC_OPERATIONS.createDiscussionGroup]: object(["groupId", "memberAgentIds", "commandId"], ["teamId"]),
  [FABRIC_OPERATIONS.receiveMessages]: object(["limit", "visibilityTimeoutMs"]),
  [FABRIC_OPERATIONS.acknowledgeDelivery]: object(["deliveryId"]),
  [FABRIC_OPERATIONS.abandonDelivery]: object(["deliveryId", "reason", "commandId"]),
  [FABRIC_OPERATIONS.getMailboxState]: object([]),
  [FABRIC_OPERATIONS.messageBodyRead]: object(["credential", "projectSessionId", "messageId", "expectedRevision"]),
} as const satisfies OperationShapeFragment;

export const MESSAGING_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.sendMessage]: object(["messageId"]),
  [FABRIC_OPERATIONS.createDiscussionGroup]: object(["groupId", "memberAgentIds"]),
  [FABRIC_OPERATIONS.receiveMessages]: object(["deliveries"]),
  [FABRIC_OPERATIONS.acknowledgeDelivery]: object(["acknowledged"]),
  [FABRIC_OPERATIONS.abandonDelivery]: object(["deliveryId", "status", "reason"]),
  [FABRIC_OPERATIONS.getMailboxState]: object(["contiguousWatermark", "acknowledgedAboveWatermark"]),
  [FABRIC_OPERATIONS.messageBodyRead]: object(["available", "messageId", "revision"], ["body", "terminalNeutralised", "capabilityValuesRedacted", "artifactRefs", "reason"]),
} as const satisfies OperationShapeFragment;

const messageCodec = objectCodec({
  audience: messageAudienceCodec,
  kind: enumeration(["request", "response", "event", "steer", "cancel", "escalate", "ack"]),
  body: boundedString({ maxBytes: 4096 }),
  requiresAck: boolean,
  dedupeKey: text,
}, {
  conversationId: identifier,
  replyToMessageId: identifier,
  taskRevision: positiveInteger,
  hopCount: integer({ maximum: 16 }),
  expiresAt: timestamp,
  context: messageContextCodec,
});

const deliveryItemCodec = objectCodec({
  deliveryId: identifier,
  messageId: identifier,
  sequence: positiveInteger,
  body: boundedString({ maxBytes: 4096 }),
  attempt: positiveInteger,
  senderId: identifier,
  kind: enumeration(["request", "response", "event", "steer", "cancel", "escalate", "ack"]),
  requiresAck: boolean,
});

const messageBodyResultCodec = unionOf([
  objectCodec({
    available: literal(true),
    messageId: identifier,
    revision: positiveInteger,
    body: boundedString({ maxBytes: 4096 }),
    terminalNeutralised: literal(true),
    capabilityValuesRedacted: literal(true),
    artifactRefs: artifactRefsCodec,
  }),
  objectCodec({
    available: literal(false),
    messageId: identifier,
    revision: positiveInteger,
    reason: enumeration(["not-found", "forbidden", "expired"]),
  }),
]);

const messagingFieldCodec = (
  operation: Parameters<typeof semanticShapeCodec>[0],
  field: string,
  direction: Parameters<typeof semanticShapeCodec>[1],
): Codec<unknown> | undefined => {
  if (field === "status" && operation === FABRIC_OPERATIONS.abandonDelivery && direction === "result") {
    return literal("abandoned");
  }
  if (field === "deliveries" && operation === FABRIC_OPERATIONS.receiveMessages && direction === "result") {
    return arrayOf(deliveryItemCodec, { maximum: 256 });
  }
  if (field === "acknowledgedAboveWatermark") return integerList;
  return undefined;
};

function messagingSemanticCodec(
  operation: Parameters<typeof semanticShapeCodec>[0],
  direction: Parameters<typeof semanticShapeCodec>[1],
  shape: Parameters<typeof semanticShapeCodec>[2],
): Codec<unknown> {
  return semanticShapeCodec(operation, direction, shape, messagingFieldCodec);
}

export const messagingOperationCodecFragment = {
  [FABRIC_OPERATIONS.sendMessage]: {
    input: messageCodec,
    result: messagingSemanticCodec(FABRIC_OPERATIONS.sendMessage, "result", MESSAGING_RESULT_SHAPES[FABRIC_OPERATIONS.sendMessage]),
  },
  [FABRIC_OPERATIONS.createDiscussionGroup]: {
    input: messagingSemanticCodec(FABRIC_OPERATIONS.createDiscussionGroup, "input", MESSAGING_INPUT_SHAPES[FABRIC_OPERATIONS.createDiscussionGroup]),
    result: messagingSemanticCodec(FABRIC_OPERATIONS.createDiscussionGroup, "result", MESSAGING_RESULT_SHAPES[FABRIC_OPERATIONS.createDiscussionGroup]),
  },
  [FABRIC_OPERATIONS.receiveMessages]: {
    input: messagingSemanticCodec(FABRIC_OPERATIONS.receiveMessages, "input", MESSAGING_INPUT_SHAPES[FABRIC_OPERATIONS.receiveMessages]),
    result: messagingSemanticCodec(FABRIC_OPERATIONS.receiveMessages, "result", MESSAGING_RESULT_SHAPES[FABRIC_OPERATIONS.receiveMessages]),
  },
  [FABRIC_OPERATIONS.acknowledgeDelivery]: {
    input: messagingSemanticCodec(FABRIC_OPERATIONS.acknowledgeDelivery, "input", MESSAGING_INPUT_SHAPES[FABRIC_OPERATIONS.acknowledgeDelivery]),
    result: messagingSemanticCodec(FABRIC_OPERATIONS.acknowledgeDelivery, "result", MESSAGING_RESULT_SHAPES[FABRIC_OPERATIONS.acknowledgeDelivery]),
  },
  [FABRIC_OPERATIONS.abandonDelivery]: {
    input: messagingSemanticCodec(FABRIC_OPERATIONS.abandonDelivery, "input", MESSAGING_INPUT_SHAPES[FABRIC_OPERATIONS.abandonDelivery]),
    result: messagingSemanticCodec(FABRIC_OPERATIONS.abandonDelivery, "result", MESSAGING_RESULT_SHAPES[FABRIC_OPERATIONS.abandonDelivery]),
  },
  [FABRIC_OPERATIONS.getMailboxState]: {
    input: messagingSemanticCodec(FABRIC_OPERATIONS.getMailboxState, "input", MESSAGING_INPUT_SHAPES[FABRIC_OPERATIONS.getMailboxState]),
    result: messagingSemanticCodec(FABRIC_OPERATIONS.getMailboxState, "result", MESSAGING_RESULT_SHAPES[FABRIC_OPERATIONS.getMailboxState]),
  },
  [FABRIC_OPERATIONS.messageBodyRead]: {
    input: messagingSemanticCodec(FABRIC_OPERATIONS.messageBodyRead, "input", MESSAGING_INPUT_SHAPES[FABRIC_OPERATIONS.messageBodyRead]),
    result: messageBodyResultCodec,
  },
} satisfies OperationCodecFragment;

import {
  boundedString,
  enumeration,
  identifier,
  integer,
  literal,
  objectCodec,
  parserBacked,
  unionOf,
  type Codec,
} from "./codec.js";
import type { AgentId, MessageId, ProviderActionId, TaskId } from "./primitives.js";

export type HerdrSteerReference =
  | Readonly<{ kind: "task"; taskId: TaskId; expectedRevision: number }>
  | Readonly<{
      kind: "message";
      taskId: TaskId;
      messageId: MessageId;
      expectedRevision: number;
    }>;

export type HerdrSteerDispatchRequest = Readonly<{
  actionId: ProviderActionId;
  fireAndForget: true;
  targetAgentId: AgentId;
  paneRef: string;
  reference: HerdrSteerReference;
  prompt: string;
}>;

export type HerdrSteerDispatchResult =
  | Readonly<{ actionId: ProviderActionId; revision: number; status: "prepared" | "dispatched" }>
  | Readonly<{ actionId: ProviderActionId; revision: number; status: "ambiguous"; reason: string }>
  | Readonly<{
      actionId: ProviderActionId;
      revision: number;
      status: "terminal";
      receipt: {
        status: "dispatched-unconfirmed";
        operation: "steer.inject-fire-and-forget";
        referenceValidation: "verified";
        deliveryEvidence: "none";
        canSatisfyExpectedResult: false;
        canCloseBarrier: false;
      };
    }>
  | Readonly<{
      status: "rejected";
      reason: "unknown-reference" | "stale-reference" | "scope-mismatch" | "target-mismatch" | "answer-bearing-reference";
    }>
  | Readonly<{ status: "unavailable"; integration: "herdr-control-v1"; reason: "disabled" | "unavailable" }>;

const positive = integer({ minimum: 1 });
const taskReference = objectCodec({
  kind: literal("task"),
  taskId: identifier,
  expectedRevision: positive,
});
const messageReference = objectCodec({
  kind: literal("message"),
  taskId: identifier,
  messageId: identifier,
  expectedRevision: positive,
});

export const HERDR_STEER_REFERENCE_CODEC = unionOf([
  taskReference,
  messageReference,
]) as Codec<HerdrSteerReference>;

const promptBase: Codec<string> = boundedString({ maxBytes: 4_096 });
const promptText: Codec<string> = parserBacked(
  promptBase,
  (value, path) => {
    if (typeof value !== "string") throw new TypeError(`${path} must be a string`);
    if (/\b(?:afb|afc|afop)_[A-Za-z0-9_-]{8,}|\bghp_[A-Za-z0-9_]{8,}|\bgithub_pat_[A-Za-z0-9_]{8,}/u.test(value)) {
      throw new TypeError(`${path} resembles a credential`);
    }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u009b]/u.test(value)) {
      throw new TypeError(`${path} must be terminal-neutral text`);
    }
    return value;
  },
  "Pause after the current check.",
);

export const HERDR_STEER_DISPATCH_REQUEST_CODEC = objectCodec({
  actionId: identifier,
  fireAndForget: literal(true),
  targetAgentId: identifier,
  paneRef: identifier,
  reference: HERDR_STEER_REFERENCE_CODEC,
  prompt: promptText,
}) as Codec<HerdrSteerDispatchRequest>;

const receipt = objectCodec({
  status: literal("dispatched-unconfirmed"),
  operation: literal("steer.inject-fire-and-forget"),
  referenceValidation: literal("verified"),
  deliveryEvidence: literal("none"),
  canSatisfyExpectedResult: literal(false),
  canCloseBarrier: literal(false),
});

export const HERDR_STEER_DISPATCH_RESULT_CODEC = unionOf([
  objectCodec({ actionId: identifier, revision: positive, status: enumeration(["prepared", "dispatched"]) }),
  objectCodec({ actionId: identifier, revision: positive, status: literal("ambiguous"), reason: boundedString({ maxBytes: 1_024 }) }),
  objectCodec({ actionId: identifier, revision: positive, status: literal("terminal"), receipt }),
  objectCodec({
    status: literal("rejected"),
    reason: enumeration(["unknown-reference", "stale-reference", "scope-mismatch", "target-mismatch", "answer-bearing-reference"]),
  }),
  objectCodec({
    status: literal("unavailable"),
    integration: literal("herdr-control-v1"),
    reason: enumeration(["disabled", "unavailable"]),
  }),
]) as Codec<HerdrSteerDispatchResult>;

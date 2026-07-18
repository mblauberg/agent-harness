import {
  type Query,
  type SDKMessage,
  type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";

import { isRecord, ProviderAdapterError } from "./types.js";

export type ClaudeQueryResult = {
  resumeReference: string;
  result: string;
  usage: unknown;
  costUsd: number;
  numTurns: unknown;
};

export async function consumeClaudeQuery(
  active: Query,
  onSession?: (sessionId: string) => void,
  onMessage?: (message: SDKMessage) => void,
): Promise<ClaudeQueryResult> {
  let sessionId: string | undefined;
  let terminal: SDKResultMessage | undefined;
  let rejectedRateLimit: Extract<SDKMessage, { type: "rate_limit_event" }>["rate_limit_info"] | undefined;
  const rejectedRateLimitSessions = new Set<string>();
  const zeroUsageRateLimitAssistantSessions = new Set<string>();
  let answerBearingMessage = false;
  let iterationError: unknown;
  try {
    for await (const message of active) {
      sessionId = message.session_id;
      if (typeof message.session_id === "string") onSession?.(message.session_id);
      onMessage?.(message);
      if (message.type === "rate_limit_event" && message.rate_limit_info.status === "rejected") {
        rejectedRateLimit = message.rate_limit_info;
        rejectedRateLimitSessions.add(message.session_id);
      }
      if (message.type === "assistant" && isZeroUsageRateLimitAssistant(message)) {
        zeroUsageRateLimitAssistantSessions.add(message.session_id);
      } else if (message.type === "assistant" || message.type === "stream_event") {
        answerBearingMessage = true;
      }
      if (message.type === "result") terminal = message;
    }
  } catch (error: unknown) {
    iterationError = error;
  } finally {
    active.close();
  }
  if (
    terminal?.subtype === "error_during_execution" &&
    rejectedRateLimit !== undefined &&
    rejectedRateLimitSessions.size === 1 &&
    rejectedRateLimitSessions.has(terminal.session_id) &&
    zeroUsageRateLimitAssistantSessions.size === 1 &&
    zeroUsageRateLimitAssistantSessions.has(terminal.session_id) &&
    !answerBearingMessage &&
    terminal.num_turns === 0 &&
    terminal.total_cost_usd === 0 &&
    Object.keys(terminal.modelUsage).length === 0 &&
    terminal.permission_denials.length === 0 &&
    !containsNonZeroNumber(terminal.usage)
  ) {
    throw new ProviderAdapterError(
      "PROVIDER_SUBSCRIPTION_LIMIT",
      "Claude subscription limit rejected the turn before any answer or provider effect",
      {
        retryable: true,
        noEffect: true,
        ...(rejectedRateLimit.resetsAt === undefined ? {} : { resetsAt: rejectedRateLimit.resetsAt }),
        ...(rejectedRateLimit.rateLimitType === undefined ? {} : { rateLimitType: rejectedRateLimit.rateLimitType }),
      },
      { cause: iterationError },
    );
  }
  if (iterationError !== undefined) throw iterationError;
  if (terminal === undefined || sessionId === undefined) {
    throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "Claude Agent SDK ended without a terminal result");
  }
  if (terminal.subtype !== "success") {
    throw new ProviderAdapterError("PROVIDER_TURN_FAILED", terminal.errors.join("; "), {
      resumeReference: sessionId,
      subtype: terminal.subtype,
    });
  }
  return {
    resumeReference: sessionId,
    result: terminal.result,
    usage: terminal.usage,
    costUsd: terminal.total_cost_usd,
    numTurns: terminal.num_turns,
  };
}

export function claudeSubscriptionNoEffectResult(error: unknown): Record<string, unknown> | undefined {
  if (
    !(error instanceof ProviderAdapterError) ||
    error.code !== "PROVIDER_SUBSCRIPTION_LIMIT" ||
    error.details?.retryable !== true ||
    error.details.noEffect !== true
  ) return undefined;
  return {
    status: "no-effect",
    retryable: true,
    errorCode: error.code,
    ...(typeof error.details.resetsAt === "number" ? { resetsAt: error.details.resetsAt } : {}),
    ...(typeof error.details.rateLimitType === "string" ? { rateLimitType: error.details.rateLimitType } : {}),
  };
}

export function throwClaudeSubscriptionNoEffect(result: Record<string, unknown>): void {
  if (
    result.status !== "no-effect" ||
    result.retryable !== true ||
    result.errorCode !== "PROVIDER_SUBSCRIPTION_LIMIT"
  ) return;
  throw new ProviderAdapterError(
    "PROVIDER_SUBSCRIPTION_LIMIT",
    "Claude subscription limit rejected the turn before any answer or provider effect",
    {
      retryable: true,
      noEffect: true,
      ...(typeof result.resetsAt === "number" ? { resetsAt: result.resetsAt } : {}),
      ...(typeof result.rateLimitType === "string" ? { rateLimitType: result.rateLimitType } : {}),
    },
  );
}

function containsNonZeroNumber(value: unknown): boolean {
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) return value.some(containsNonZeroNumber);
  return isRecord(value) && Object.values(value).some(containsNonZeroNumber);
}

function isZeroUsageRateLimitAssistant(message: Extract<SDKMessage, { type: "assistant" }>): boolean {
  return message.error === "rate_limit" &&
    !containsNonZeroNumber(message.message.usage) &&
    message.message.content.length > 0 &&
    message.message.content.every((block) => block.type === "text");
}

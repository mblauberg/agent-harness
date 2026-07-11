type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function audienceLabel(value: unknown): string {
  if (!isRecord(value)) return "recipient";
  if (value.kind === "agents" && Array.isArray(value.agentIds)) return `agents:${value.agentIds.join(",")}`;
  if (value.kind === "team") return `team:${string(value.teamId) ?? "unknown"}`;
  if (value.kind === "task") return `task:${string(value.taskId) ?? "unknown"}`;
  return "recipient";
}

function deliveryLine(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const messageId = string(value.messageId) ?? "unknown";
  const sequence = typeof value.sequence === "number" ? ` seq ${String(value.sequence)}` : "";
  const sender = string(value.senderId);
  const kind = string(value.kind);
  const attempt = typeof value.attempt === "number" ? ` · attempt ${String(value.attempt)}` : "";
  return `msg ${messageId}${sequence}${sender === undefined ? "" : ` from ${sender}`}${kind === undefined ? "" : ` · ${kind}`}${attempt} · claimed`;
}

/**
 * Human-only projection of a validated tool result. Never parse this text:
 * structuredContent remains the protocol contract and the mailbox remains the
 * source of truth.
 */
export function renderToolReceipt(
  toolName: string,
  args: RecordValue,
  structured: RecordValue,
): string {
  if (toolName === "fabric_message_send") {
    const messageId = string(structured.messageId) ?? "unknown";
    const kind = string(args.kind) ?? "message";
    const acknowledgement = args.requiresAck === true ? "ack required" : "no ack";
    return `sent ${kind} → ${audienceLabel(args.audience)} · msg ${messageId} · ${acknowledgement} · delivery pending`;
  }
  if (toolName === "fabric_message_receive") {
    const deliveries = Array.isArray(structured.deliveries) ? structured.deliveries : [];
    if (deliveries.length === 0) return "0 deliveries";
    const lines = deliveries.map(deliveryLine).filter((line): line is string => line !== undefined);
    return `${String(deliveries.length)} ${deliveries.length === 1 ? "delivery" : "deliveries"} · ${lines.join(" | ")}`;
  }
  if (toolName === "fabric_message_ack") {
    return `delivery ${string(args.deliveryId) ?? "unknown"} acknowledged`;
  }
  if (toolName === "fabric_message_abandon") {
    return `delivery ${string(args.deliveryId) ?? "unknown"} abandoned · reason recorded`;
  }
  if (toolName === "fabric_agent_spawn" || toolName === "fabric_agent_attach") {
    const verb = toolName.endsWith("spawn") ? "spawned" : "attached";
    return `${verb} ${string(args.agentId) ?? "agent"} via ${string(args.adapterId) ?? "adapter"} · action ${string(args.actionId) ?? "unknown"} · capability issued (redacted)`;
  }
  if (toolName === "fabric_run_create") {
    return `created run ${string(structured.runId) ?? string(args.runId) ?? "unknown"} · chair capability issued (redacted)`;
  }
  if (toolName === "fabric_task_assign") {
    return `task ${string(structured.taskId) ?? string(args.taskId) ?? "unknown"} · rev ${String(structured.revision ?? "unknown")} · ${string(structured.state) ?? "created"}`;
  }
  return `${toolName} completed`;
}

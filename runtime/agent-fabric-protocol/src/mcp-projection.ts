import { createHash } from "node:crypto";

import { OPERATION_CODECS } from "./operation-codecs/registry.js";
import { operationInputSchemaForPrincipal } from "./operation-codecs.js";
import {
  FABRIC_OPERATIONS,
  OPERATION_REGISTRY,
  type FabricOperation,
  type PrincipalOperation,
} from "./operations.js";
import type { JsonSchema } from "./codec.js";

export const MCP_PROJECTION_LIMITS = Object.freeze({
  maximumTools: 96,
  maximumDescriptorBytes: 32 * 1_024,
  maximumDescriptorSetBytes: 512 * 1_024,
});

type AgentOperation = PrincipalOperation<"agent">;

export type McpProjection =
  | Readonly<{
      projection: "tool";
      name: `fabric_${string}`;
      description: string;
      receiptRenderer: McpReceiptRenderer;
      resource?: Readonly<{
        uriTemplate: `fabric://runs/{run_id}/${string}`;
        name: string;
        description: string;
        mimeType: "application/json";
      }>;
    }>
  | Readonly<{ projection: "none"; reason: string }>;

export type McpToolDescriptor = Readonly<{
  operation: AgentOperation;
  name: `fabric_${string}`;
  description: string;
  feature: string;
  receiptRenderer: McpReceiptRenderer;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  inputCodecDigest: `sha256:${string}`;
  outputCodecDigest: `sha256:${string}`;
}>;

export type McpReceiptRenderer =
  | "agent-custody-v1"
  | "delivery-ack-v1"
  | "delivery-abandon-v1"
  | "generic-v1"
  | "launch-attestation-v1"
  | "message-receive-v1"
  | "message-send-v1"
  | "task-v1";

export type McpResourceDescriptor = Readonly<{
  operation: AgentOperation;
  toolName: `fabric_${string}`;
  uriTemplate: `fabric://runs/{run_id}/${string}`;
  name: string;
  description: string;
  mimeType: "application/json";
}>;

function stableToolName(operation: AgentOperation): `fabric_${string}` {
  return `fabric_${operation.slice("fabric.v1.".length).replace(/[.-]/gu, "_")}`;
}

function tool(
  operation: AgentOperation,
  resource?: Extract<McpProjection, { projection: "tool" }>["resource"],
  description?: string,
): Extract<McpProjection, { projection: "tool" }> {
  const receiptRenderer: McpReceiptRenderer = operation === FABRIC_OPERATIONS.launchAttest
    ? "launch-attestation-v1"
    : operation === FABRIC_OPERATIONS.sendMessage
    ? "message-send-v1"
    : operation === FABRIC_OPERATIONS.receiveMessages
      ? "message-receive-v1"
      : operation === FABRIC_OPERATIONS.acknowledgeDelivery
        ? "delivery-ack-v1"
        : operation === FABRIC_OPERATIONS.abandonDelivery
          ? "delivery-abandon-v1"
          : operation === FABRIC_OPERATIONS.spawnAgent || operation === FABRIC_OPERATIONS.attachAgent
            ? "agent-custody-v1"
            : operation === FABRIC_OPERATIONS.createTask || operation === FABRIC_OPERATIONS.updateTask
              ? "task-v1"
              : "generic-v1";
  return Object.freeze({
    projection: "tool",
    name: stableToolName(operation),
    description: description ?? `Invoke the closed ${operation} operation as the authenticated Agent Fabric principal.`,
    receiptRenderer,
    ...(resource === undefined ? {} : { resource }),
  });
}

function none(reason: string): Extract<McpProjection, { projection: "none" }> {
  return Object.freeze({ projection: "none", reason });
}

const resource = (
  suffix: "status" | "tasks" | "agents" | "receipts",
  name: string,
  description: string,
): Extract<McpProjection, { projection: "tool" }>["resource"] => Object.freeze({
  uriTemplate: `fabric://runs/{run_id}/${suffix}`,
  name,
  description,
  mimeType: "application/json",
});

export const MCP_PROJECTION_REGISTRY = Object.freeze({
  [FABRIC_OPERATIONS.delegateAuthority]: tool(FABRIC_OPERATIONS.delegateAuthority),
  [FABRIC_OPERATIONS.registerAgent]: none("result contains a bearer capability"),
  [FABRIC_OPERATIONS.spawnAgent]: tool(FABRIC_OPERATIONS.spawnAgent),
  [FABRIC_OPERATIONS.attachAgent]: tool(FABRIC_OPERATIONS.attachAgent),
  [FABRIC_OPERATIONS.sendMessage]: tool(FABRIC_OPERATIONS.sendMessage),
  [FABRIC_OPERATIONS.createDiscussionGroup]: tool(FABRIC_OPERATIONS.createDiscussionGroup),
  [FABRIC_OPERATIONS.receiveMessages]: tool(FABRIC_OPERATIONS.receiveMessages),
  [FABRIC_OPERATIONS.acknowledgeDelivery]: tool(FABRIC_OPERATIONS.acknowledgeDelivery),
  [FABRIC_OPERATIONS.abandonDelivery]: tool(FABRIC_OPERATIONS.abandonDelivery),
  [FABRIC_OPERATIONS.getMailboxState]: tool(FABRIC_OPERATIONS.getMailboxState),
  [FABRIC_OPERATIONS.createTask]: tool(FABRIC_OPERATIONS.createTask),
  [FABRIC_OPERATIONS.claimTask]: tool(FABRIC_OPERATIONS.claimTask),
  [FABRIC_OPERATIONS.refreshTaskReadiness]: tool(FABRIC_OPERATIONS.refreshTaskReadiness),
  [FABRIC_OPERATIONS.recordObjectiveCheck]: tool(FABRIC_OPERATIONS.recordObjectiveCheck),
  [FABRIC_OPERATIONS.acknowledgeTaskHandoff]: tool(FABRIC_OPERATIONS.acknowledgeTaskHandoff),
  [FABRIC_OPERATIONS.getTask]: tool(FABRIC_OPERATIONS.getTask),
  [FABRIC_OPERATIONS.updateTask]: tool(FABRIC_OPERATIONS.updateTask),
  [FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof]: tool(FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof),
  [FABRIC_OPERATIONS.recoverTaskOwner]: tool(FABRIC_OPERATIONS.recoverTaskOwner),
  [FABRIC_OPERATIONS.recordRevocationProof]: tool(FABRIC_OPERATIONS.recordRevocationProof),
  [FABRIC_OPERATIONS.revokeCapability]: none("result is not a structured MCP object"),
  [FABRIC_OPERATIONS.rotateCapability]: none("result contains a bearer capability"),
  [FABRIC_OPERATIONS.acquireWriteLease]: tool(FABRIC_OPERATIONS.acquireWriteLease),
  [FABRIC_OPERATIONS.recoverWriteLease]: tool(FABRIC_OPERATIONS.recoverWriteLease),
  [FABRIC_OPERATIONS.renewWriteLease]: tool(FABRIC_OPERATIONS.renewWriteLease),
  [FABRIC_OPERATIONS.getWriteLease]: tool(FABRIC_OPERATIONS.getWriteLease),
  [FABRIC_OPERATIONS.releaseWriteLease]: tool(FABRIC_OPERATIONS.releaseWriteLease),
  [FABRIC_OPERATIONS.requestLifecycle]: tool(
    FABRIC_OPERATIONS.requestLifecycle,
    undefined,
    "Checkpoint first. Use compact to continue the same retained task with fresh bounded context. For retained Claude, compact at each stage or work-unit boundary, by four answer-bearing turns, or before an idle pause over five minutes; fresh one-task workers and reviewers release. Use rotate/clear for a new task, independent review, stale, confused, or unreconciled context, or a role or model change. Codex rotates at stage boundaries; native auto-compaction is fallback. Never clear silently.",
  ),
  [FABRIC_OPERATIONS.getAgentLifecycle]: tool(FABRIC_OPERATIONS.getAgentLifecycle),
  [FABRIC_OPERATIONS.reportProviderState]: tool(FABRIC_OPERATIONS.reportProviderState),
  [FABRIC_OPERATIONS.dispatchProviderAction]: tool(
    FABRIC_OPERATIONS.dispatchProviderAction,
    undefined,
    "Admit one durable provider action and return its immutable initial receipt; read that action to observe completion.",
  ),
  [FABRIC_OPERATIONS.reconcileProviderAction]: tool(
    FABRIC_OPERATIONS.reconcileProviderAction,
    undefined,
    "Recover a non-local or stalled provider action by stable lookup; do not use reconciliation to poll live work.",
  ),
  [FABRIC_OPERATIONS.getProviderAction]: tool(
    FABRIC_OPERATIONS.getProviderAction,
    undefined,
    "Read durable provider-action state; poll this operation until the terminal bounded provider answer is available.",
  ),
  [FABRIC_OPERATIONS.recordOperatorIntervention]: tool(FABRIC_OPERATIONS.recordOperatorIntervention),
  [FABRIC_OPERATIONS.recordVisibilityFailure]: tool(FABRIC_OPERATIONS.recordVisibilityFailure),
  [FABRIC_OPERATIONS.createTeam]: tool(FABRIC_OPERATIONS.createTeam),
  [FABRIC_OPERATIONS.getTeam]: tool(FABRIC_OPERATIONS.getTeam),
  [FABRIC_OPERATIONS.freezeSubtree]: tool(FABRIC_OPERATIONS.freezeSubtree),
  [FABRIC_OPERATIONS.adoptSubtree]: tool(FABRIC_OPERATIONS.adoptSubtree),
  [FABRIC_OPERATIONS.closeSubtreeBarrier]: tool(FABRIC_OPERATIONS.closeSubtreeBarrier),
  [FABRIC_OPERATIONS.reserveBudget]: tool(FABRIC_OPERATIONS.reserveBudget),
  [FABRIC_OPERATIONS.recordBudgetUsage]: tool(FABRIC_OPERATIONS.recordBudgetUsage),
  [FABRIC_OPERATIONS.reconcileBudgetUsage]: tool(FABRIC_OPERATIONS.reconcileBudgetUsage),
  [FABRIC_OPERATIONS.releaseBudget]: tool(FABRIC_OPERATIONS.releaseBudget),
  [FABRIC_OPERATIONS.getBudget]: tool(FABRIC_OPERATIONS.getBudget),
  [FABRIC_OPERATIONS.publishArtifact]: tool(FABRIC_OPERATIONS.publishArtifact),
  [FABRIC_OPERATIONS.closeBarrier]: tool(FABRIC_OPERATIONS.closeBarrier),
  [FABRIC_OPERATIONS.getRunStatus]: tool(
    FABRIC_OPERATIONS.getRunStatus,
    resource("status", "Run status", "Chair, lifecycle counts and barrier state for one run."),
  ),
  [FABRIC_OPERATIONS.observeEvents]: tool(FABRIC_OPERATIONS.observeEvents),
  [FABRIC_OPERATIONS.listTasks]: tool(
    FABRIC_OPERATIONS.listTasks,
    resource("tasks", "Run tasks", "Task graph records for one run."),
  ),
  [FABRIC_OPERATIONS.listAgents]: tool(
    FABRIC_OPERATIONS.listAgents,
    resource("agents", "Run agents", "Registered agents and lifecycle states for one run."),
  ),
  [FABRIC_OPERATIONS.listReceipts]: tool(
    FABRIC_OPERATIONS.listReceipts,
    resource("receipts", "Run receipts", "Exported coordination receipts for one run."),
  ),
  [FABRIC_OPERATIONS.exportReceipt]: tool(FABRIC_OPERATIONS.exportReceipt),
  [FABRIC_OPERATIONS.evidencePublish]: tool(FABRIC_OPERATIONS.evidencePublish),
  [FABRIC_OPERATIONS.membershipBind]: tool(FABRIC_OPERATIONS.membershipBind),
  [FABRIC_OPERATIONS.intakeRevise]: tool(FABRIC_OPERATIONS.intakeRevise),
  [FABRIC_OPERATIONS.scopedGateCreate]: tool(FABRIC_OPERATIONS.scopedGateCreate),
  [FABRIC_OPERATIONS.scopedGateCheck]: tool(FABRIC_OPERATIONS.scopedGateCheck),
  [FABRIC_OPERATIONS.resourceReserve]: tool(FABRIC_OPERATIONS.resourceReserve),
  [FABRIC_OPERATIONS.resourceRelease]: tool(FABRIC_OPERATIONS.resourceRelease),
  [FABRIC_OPERATIONS.resourceReconcile]: tool(FABRIC_OPERATIONS.resourceReconcile),
  [FABRIC_OPERATIONS.taskRequest]: tool(FABRIC_OPERATIONS.taskRequest),
  [FABRIC_OPERATIONS.taskCompleteWithReply]: tool(FABRIC_OPERATIONS.taskCompleteWithReply),
  [FABRIC_OPERATIONS.resultDeliveryClaim]: tool(FABRIC_OPERATIONS.resultDeliveryClaim),
  [FABRIC_OPERATIONS.resultDeliveryConsume]: tool(FABRIC_OPERATIONS.resultDeliveryConsume),
  [FABRIC_OPERATIONS.resultDeliveryRetry]: tool(FABRIC_OPERATIONS.resultDeliveryRetry),
  [FABRIC_OPERATIONS.resultDeliveryReassign]: tool(FABRIC_OPERATIONS.resultDeliveryReassign),
  [FABRIC_OPERATIONS.resultDeliveryAbandon]: tool(FABRIC_OPERATIONS.resultDeliveryAbandon),
  [FABRIC_OPERATIONS.workstreamCreate]: tool(FABRIC_OPERATIONS.workstreamCreate),
  [FABRIC_OPERATIONS.workstreamSettle]: tool(FABRIC_OPERATIONS.workstreamSettle),
  [FABRIC_OPERATIONS.launchAttest]: tool(FABRIC_OPERATIONS.launchAttest),
  [FABRIC_OPERATIONS.reviewTargetPrepare]: tool(FABRIC_OPERATIONS.reviewTargetPrepare),
  [FABRIC_OPERATIONS.reviewTargetPreparationRead]: tool(FABRIC_OPERATIONS.reviewTargetPreparationRead),
  [FABRIC_OPERATIONS.reviewTargetRebind]: tool(FABRIC_OPERATIONS.reviewTargetRebind),
  [FABRIC_OPERATIONS.reviewEvidenceRead]: tool(FABRIC_OPERATIONS.reviewEvidenceRead),
  [FABRIC_OPERATIONS.reviewEvidenceList]: tool(FABRIC_OPERATIONS.reviewEvidenceList),
  [FABRIC_OPERATIONS.reviewEvidenceAnnotate]: tool(FABRIC_OPERATIONS.reviewEvidenceAnnotate),
  [FABRIC_OPERATIONS.reviewEvidenceAnnotationCurrentRead]: tool(FABRIC_OPERATIONS.reviewEvidenceAnnotationCurrentRead),
  [FABRIC_OPERATIONS.reviewFindingPageRead]: tool(FABRIC_OPERATIONS.reviewFindingPageRead),
  [FABRIC_OPERATIONS.reviewCompletionRead]: tool(FABRIC_OPERATIONS.reviewCompletionRead),
  [FABRIC_OPERATIONS.providerRouteIntegrityRecoveryRead]: tool(FABRIC_OPERATIONS.providerRouteIntegrityRecoveryRead),
  [FABRIC_OPERATIONS.providerContextPressureRead]: tool(FABRIC_OPERATIONS.providerContextPressureRead),
  [FABRIC_OPERATIONS.herdrSteerDispatch]: tool(
    FABRIC_OPERATIONS.herdrSteerDispatch,
    undefined,
    "Dispatch one validated fire-and-forget Herdr steering effect; this cannot return an answer or close a barrier.",
  ),
  [FABRIC_OPERATIONS.topologyWaveAppend]: tool(FABRIC_OPERATIONS.topologyWaveAppend),
  [FABRIC_OPERATIONS.topologyWaveCurrentRead]: tool(FABRIC_OPERATIONS.topologyWaveCurrentRead),
  [FABRIC_OPERATIONS.topologyWaveList]: tool(FABRIC_OPERATIONS.topologyWaveList),
} as const satisfies Record<AgentOperation, McpProjection>);

function hasSensitiveSchema(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSensitiveSchema);
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record["x-agent-fabric-sensitive"] === true || Object.values(record).some(hasSensitiveSchema);
}

function schemaDigest(schema: JsonSchema): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(JSON.stringify(schema)).digest("hex")}`;
}

const schemaMapKeywords = new Set(["$defs", "properties", "patternProperties", "dependentSchemas"]);
const schemaArrayKeywords = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);
const schemaSingleKeywords = new Set([
  "additionalProperties", "contains", "else", "if", "items", "not", "propertyNames", "then", "unevaluatedProperties",
]);

function schemaChildren(schema: Record<string, unknown>): Array<Record<string, unknown>> {
  const children: Array<Record<string, unknown>> = [];
  for (const [keyword, value] of Object.entries(schema)) {
    if (schemaMapKeywords.has(keyword) && typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const child of Object.values(value)) {
        if (typeof child === "object" && child !== null && !Array.isArray(child)) children.push(child as Record<string, unknown>);
      }
    } else if (schemaArrayKeywords.has(keyword) && Array.isArray(value)) {
      for (const child of value) {
        if (typeof child === "object" && child !== null && !Array.isArray(child)) children.push(child as Record<string, unknown>);
      }
    } else if (schemaSingleKeywords.has(keyword) && typeof value === "object" && value !== null && !Array.isArray(value)) {
      children.push(value as Record<string, unknown>);
    }
  }
  return children;
}

function compactSchema(schema: JsonSchema): JsonSchema {
  const counts = new Map<string, number>();
  const collect = (node: Record<string, unknown>): void => {
    const encoded = JSON.stringify(node);
    if (Buffer.byteLength(encoded, "utf8") >= 96) counts.set(encoded, (counts.get(encoded) ?? 0) + 1);
    for (const child of schemaChildren(node)) collect(child);
  };
  collect(schema as Record<string, unknown>);
  const selected = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([encoded]) => encoded)
    .sort();
  if (selected.length === 0) return schema;
  const keys = new Map(selected.map((encoded, index) => [encoded, `generated_${String(index + 1)}`]));
  const transform = (node: Record<string, unknown>, keepRoot = false): Record<string, unknown> => {
    const encoded = JSON.stringify(node);
    const definitionKey = keys.get(encoded);
    if (!keepRoot && definitionKey !== undefined) return { $ref: `#/$defs/${definitionKey}` };
    const result: Record<string, unknown> = {};
    for (const [keyword, value] of Object.entries(node)) {
      if (schemaMapKeywords.has(keyword) && typeof value === "object" && value !== null && !Array.isArray(value)) {
        result[keyword] = Object.fromEntries(Object.entries(value).map(([key, child]) => [
          key,
          typeof child === "object" && child !== null && !Array.isArray(child)
            ? transform(child as Record<string, unknown>)
            : child,
        ]));
      } else if (schemaArrayKeywords.has(keyword) && Array.isArray(value)) {
        result[keyword] = value.map((child) => (
          typeof child === "object" && child !== null && !Array.isArray(child)
            ? transform(child as Record<string, unknown>)
            : child
        ));
      } else if (schemaSingleKeywords.has(keyword) && typeof value === "object" && value !== null && !Array.isArray(value)) {
        result[keyword] = transform(value as Record<string, unknown>);
      } else {
        result[keyword] = value;
      }
    }
    return result;
  };
  const compacted = transform(schema as Record<string, unknown>, true);
  const existingDefinitions = typeof compacted.$defs === "object" && compacted.$defs !== null && !Array.isArray(compacted.$defs)
    ? compacted.$defs as Record<string, unknown>
    : {};
  const generatedDefinitions = Object.fromEntries(selected.map((encoded) => {
    const key = keys.get(encoded);
    if (key === undefined) throw new Error("generated MCP schema definition is missing");
    return [key, transform(JSON.parse(encoded) as Record<string, unknown>, true)];
  }));
  return Object.freeze({ ...compacted, $defs: { ...existingDefinitions, ...generatedDefinitions } }) as JsonSchema;
}

function assertObjectSchema(schema: JsonSchema, label: string): void {
  if (schema.type !== "object") throw new TypeError(`${label} must have an object root`);
  if (hasSensitiveSchema(schema)) throw new TypeError(`${label} contains sensitive protocol material`);
}

function ensureObjectRoot(schema: JsonSchema, label: string): JsonSchema {
  if (schema.type === "object") return schema;
  if (
    Array.isArray(schema.oneOf) &&
    schema.oneOf.length > 0 &&
    schema.oneOf.every((variant) => (
      typeof variant === "object" && variant !== null && !Array.isArray(variant) && variant.type === "object"
    ))
  ) {
    return Object.freeze({ type: "object", ...schema });
  }
  throw new TypeError(`${label} must resolve only to object variants`);
}

export function buildMcpDescriptorSet(allowedOperations: ReadonlySet<FabricOperation>): Readonly<{
  tools: readonly McpToolDescriptor[];
  resources: readonly McpResourceDescriptor[];
}> {
  const tools: McpToolDescriptor[] = [];
  const resources: McpResourceDescriptor[] = [];
  for (const operation of [...allowedOperations].sort()) {
    const projection = MCP_PROJECTION_REGISTRY[operation as AgentOperation] as McpProjection | undefined;
    if (projection === undefined || projection.projection === "none") continue;
    const definition = OPERATION_REGISTRY[operation];
    if (!definition.principals.includes("agent")) {
      throw new TypeError(`MCP projection contains an illegal agent operation: ${operation}`);
    }
    const codecs = OPERATION_CODECS[operation];
    const inputSchema = operationInputSchemaForPrincipal(operation, "agent");
    if (hasSensitiveSchema(inputSchema)) throw new TypeError(`${projection.name} input contains sensitive protocol material`);
    if (hasSensitiveSchema(codecs.result.schema)) throw new TypeError(`${projection.name} output contains sensitive protocol material`);
    const projectedInputSchema = compactSchema(ensureObjectRoot(inputSchema, `${projection.name} input`));
    const projectedOutputSchema = compactSchema(ensureObjectRoot(codecs.result.schema, `${projection.name} output`));
    assertObjectSchema(projectedInputSchema, `${projection.name} input`);
    assertObjectSchema(projectedOutputSchema, `${projection.name} output`);
    const descriptor: McpToolDescriptor = Object.freeze({
      operation: operation as AgentOperation,
      name: projection.name,
      description: projection.description,
      feature: definition.feature,
      receiptRenderer: projection.receiptRenderer,
      inputSchema: projectedInputSchema,
      outputSchema: projectedOutputSchema,
      inputCodecDigest: schemaDigest(inputSchema),
      outputCodecDigest: schemaDigest(codecs.result.schema),
    });
    const bytes = Buffer.byteLength(JSON.stringify(descriptor), "utf8");
    if (bytes > MCP_PROJECTION_LIMITS.maximumDescriptorBytes) {
      throw new TypeError(`MCP descriptor exceeds ${String(MCP_PROJECTION_LIMITS.maximumDescriptorBytes)} bytes: ${descriptor.name}`);
    }
    tools.push(descriptor);
    if (projection.resource !== undefined) {
      resources.push(Object.freeze({
        operation: operation as AgentOperation,
        toolName: projection.name,
        ...projection.resource,
      }));
    }
  }
  if (tools.length > MCP_PROJECTION_LIMITS.maximumTools) {
    throw new TypeError(`MCP descriptor set exceeds ${String(MCP_PROJECTION_LIMITS.maximumTools)} tools`);
  }
  const setBytes = Buffer.byteLength(JSON.stringify(tools), "utf8");
  if (setBytes > MCP_PROJECTION_LIMITS.maximumDescriptorSetBytes) {
    throw new TypeError(`MCP descriptor set exceeds ${String(MCP_PROJECTION_LIMITS.maximumDescriptorSetBytes)} bytes`);
  }
  resources.sort((left, right) => left.uriTemplate.localeCompare(right.uriTemplate));
  return Object.freeze({ tools: Object.freeze(tools), resources: Object.freeze(resources) });
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function audienceLabel(value: unknown): string {
  if (!isRecord(value)) return "recipient";
  if (value.kind === "agents" && Array.isArray(value.agentIds)) return `agents:${value.agentIds.join(",")}`;
  if (value.kind === "team") return `team:${stringValue(value.teamId) ?? "unknown"}`;
  if (value.kind === "task") return `task:${stringValue(value.taskId) ?? "unknown"}`;
  return "recipient";
}

function deliveryLine(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const messageId = stringValue(value.messageId) ?? "unknown";
  const sequence = typeof value.sequence === "number" ? ` seq ${String(value.sequence)}` : "";
  const sender = stringValue(value.senderId);
  const kind = stringValue(value.kind);
  const attempt = typeof value.attempt === "number" ? ` · attempt ${String(value.attempt)}` : "";
  return `msg ${messageId}${sequence}${sender === undefined ? "" : ` from ${sender}`}${kind === undefined ? "" : ` · ${kind}`}${attempt} · claimed`;
}

/** Human-only projection. Structured protocol results remain authoritative. */
export function renderMcpReceipt(
  descriptor: Pick<McpToolDescriptor, "name" | "receiptRenderer">,
  args: RecordValue,
  structured: RecordValue,
): string {
  switch (descriptor.receiptRenderer) {
    case "message-send-v1": {
      const messageId = stringValue(structured.messageId) ?? "unknown";
      const kind = stringValue(args.kind) ?? "message";
      const acknowledgement = args.requiresAck === true ? "ack required" : "no ack";
      return `sent ${kind} → ${audienceLabel(args.audience)} · msg ${messageId} · ${acknowledgement} · delivery pending`;
    }
    case "message-receive-v1": {
      const deliveries = Array.isArray(structured.deliveries) ? structured.deliveries : [];
      if (deliveries.length === 0) return "0 deliveries";
      const lines = deliveries.map(deliveryLine).filter((line): line is string => line !== undefined);
      return `${String(deliveries.length)} ${deliveries.length === 1 ? "delivery" : "deliveries"} · ${lines.join(" | ")}`;
    }
    case "delivery-ack-v1":
      return `delivery ${stringValue(args.deliveryId) ?? "unknown"} acknowledged`;
    case "delivery-abandon-v1":
      return `delivery ${stringValue(args.deliveryId) ?? "unknown"} abandoned · reason recorded`;
    case "agent-custody-v1":
      return `${descriptor.name.endsWith("spawn") ? "spawned" : "attached"} ${stringValue(structured.agentId) ?? stringValue(args.agentId) ?? "agent"} · bridge ${stringValue(structured.bridgeState) ?? "unknown"}`;
    case "task-v1":
      return `task ${stringValue(structured.taskId) ?? stringValue(args.taskId) ?? "unknown"} · rev ${String(structured.revision ?? "unknown")} · ${stringValue(structured.state) ?? "updated"}`;
    case "launch-attestation-v1":
      return "launch continuity attested";
    case "generic-v1":
      return `${descriptor.name} completed`;
  }
}

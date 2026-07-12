import type { FabricClient } from "../core/fabric.js";
import type { CurrentMcpSeatBindingInput } from "../core/contracts.js";
import type { AuthorityInput, MessageInput, RecoveryEvidence } from "../domain/types.js";
import { isBudgetUnitKey } from "../domain/unit-keys.js";
import { FABRIC_PROTOCOL_LIMITS, type FabricProtocolLimits } from "../transport/bounded-ndjson.js";
import { OPERATOR_ACTIONS, type OperatorAction } from "@local/agent-fabric-protocol";

export const FABRIC_PROTOCOL_VERSION = 1 as const;
export const FABRIC_DAEMON_VERSION = "0.1.0";

export type DaemonInitializeParams = {
  protocolVersion: number;
  client: { name: string; version: string };
  capabilities: string[];
};

export type DaemonInitializeResult = {
  protocolVersion: typeof FABRIC_PROTOCOL_VERSION;
  daemonVersion: string;
  capabilities: string[];
  limits: FabricProtocolLimits;
  activeAdapters: string[];
};

export function daemonInitializeResult(activeAdapters: string[]): DaemonInitializeResult {
  return {
    protocolVersion: FABRIC_PROTOCOL_VERSION,
    daemonVersion: FABRIC_DAEMON_VERSION,
    capabilities: ["rpc"],
    limits: FABRIC_PROTOCOL_LIMITS,
    activeAdapters: [...new Set(activeAdapters)].sort(),
  };
}

export type DaemonRequest = {
  id: string;
  capability: string;
  method: string;
  params: Record<string, unknown>;
};

export type DaemonResponse =
  | { id: string; result: unknown }
  | { id: string; error: { name: string; code: string; message: string } };

export type ProvisionLocalOperatorInput = {
  canonicalRoot: string;
  trustRecordDigest: string;
  projectAuthorityGeneration: number;
  principalGeneration: number;
  actions: Array<"read" | "launch">;
  expiresAt: string;
};

export type OpenLocalOperatorConsoleCapabilityInput = Omit<
  ProvisionLocalOperatorInput,
  "principalGeneration"
>;

export type IssueLocalOperatorSessionCapabilityInput = {
  projectId: string;
  canonicalRoot: string;
  trustRecordDigest: string;
  projectCapability: { capabilityId: string; token: string };
  projectSessionId: string;
  sessionGeneration: number;
  actions: Array<Exclude<OperatorAction, "takeover">>;
  expiresAt: string;
  launchEnvelopeExpiresAt: string;
};

export type RotateLocalOperatorPrincipalInput = {
  projectId: string;
  operatorId: string;
  canonicalRoot: string;
  trustRecordDigest: string;
  projectAuthorityGeneration: number;
  expectedPrincipalGeneration: number;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDaemonRequest(value: unknown): value is DaemonRequest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.capability === "string" &&
    typeof value.method === "string" &&
    isRecord(value.params)
  );
}

export function isDaemonResponse(value: unknown): value is DaemonResponse {
  if (!isRecord(value) || typeof value.id !== "string") {
    return false;
  }
  const hasResult = Object.hasOwn(value, "result");
  const hasError = Object.hasOwn(value, "error");
  return hasResult !== hasError && (
    hasResult || (
      isRecord(value.error) &&
      typeof value.error.name === "string" &&
      typeof value.error.code === "string" &&
      typeof value.error.message === "string"
    )
  );
}

export function daemonInitializeParams(value: Record<string, unknown>): DaemonInitializeParams {
  if (
    Object.keys(value).some((key) => !["protocolVersion", "client", "capabilities"].includes(key)) ||
    typeof value.protocolVersion !== "number" ||
    !Number.isSafeInteger(value.protocolVersion) ||
    !isRecord(value.client) ||
    typeof value.client.name !== "string" ||
    typeof value.client.version !== "string" ||
    Object.keys(value.client).some((key) => !["name", "version"].includes(key)) ||
    !Array.isArray(value.capabilities) ||
    !value.capabilities.every((capability) => typeof capability === "string")
  ) {
    throw new TypeError("daemon initialize parameters are invalid");
  }
  return {
    protocolVersion: value.protocolVersion,
    client: { name: value.client.name, version: value.client.version },
    capabilities: value.capabilities,
  };
}

export function isDaemonInitializeResult(value: unknown): value is DaemonInitializeResult {
  const limits = isRecord(value) ? value.limits : undefined;
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !["protocolVersion", "daemonVersion", "capabilities", "limits", "activeAdapters"].includes(key)) ||
    value.protocolVersion !== FABRIC_PROTOCOL_VERSION ||
    typeof value.daemonVersion !== "string" ||
    !Array.isArray(value.capabilities) ||
    !value.capabilities.every((capability) => typeof capability === "string") ||
    !value.capabilities.includes("rpc") ||
    !Array.isArray(value.activeAdapters) ||
    !value.activeAdapters.every((adapter) => typeof adapter === "string") ||
    new Set(value.activeAdapters).size !== value.activeAdapters.length ||
    !isRecord(limits)
  ) return false;
  if (Object.keys(limits).some((key) => !Object.hasOwn(FABRIC_PROTOCOL_LIMITS, key))) return false;
  return Object.entries(FABRIC_PROTOCOL_LIMITS).every(([key, maximum]) => {
    const effective = limits[key];
    return typeof effective === "number" && Number.isSafeInteger(effective) && effective > 0 && effective <= maximum;
  });
}

function requiredString(params: Record<string, unknown>, field: string): string {
  const value = params[field];
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a string`);
  }
  return value;
}

function requiredNumber(params: Record<string, unknown>, field: string): number {
  const value = params[field];
  if (typeof value !== "number") {
    throw new TypeError(`${field} must be a number`);
  }
  return value;
}

function requiredPositiveInteger(params: Record<string, unknown>, field: string): number {
  const value = requiredNumber(params, field);
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return value;
}

function requiredRecord(params: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = params[field];
  if (!isRecord(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  return value;
}

function exactFields(value: Record<string, unknown>, fields: readonly string[], name: string): void {
  const expected = new Set(fields);
  const unknown = Object.keys(value).filter((field) => !expected.has(field));
  const missing = fields.filter((field) => !Object.hasOwn(value, field));
  if (unknown.length > 0 || missing.length > 0) {
    throw new TypeError(`${name} fields are invalid`);
  }
}

function uniqueActions<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T[] {
  const actions = stringArray(value, field);
  if (
    actions.length === 0 ||
    new Set(actions).size !== actions.length ||
    actions.some((action) => !allowed.includes(action as T))
  ) {
    throw new TypeError(`${field} must contain unique allowed actions`);
  }
  return actions as T[];
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new TypeError(`${field} must be a string array`);
  }
  return value;
}

const disclosureTargets = new Set(["local", "approved-provider", "external"]);

function disclosurePolicy(value: unknown): AuthorityInput["disclosure"] {
  if (Array.isArray(value)) {
    const scopes = stringArray(value, "disclosure");
    if (scopes.some((scope) => !disclosureTargets.has(scope))) {
      throw new TypeError("disclosure contains an unknown scope");
    }
    return scopes;
  }
  if (!isRecord(value) || typeof value.level !== "string") {
    throw new TypeError("disclosure must be a policy object or legacy string array");
  }
  if ((value.level === "allowed" || value.level === "forbidden") && Object.keys(value).length === 1) {
    return { level: value.level };
  }
  if (value.level === "scoped" && Object.keys(value).length === 2 && "scopes" in value) {
    const scopes = stringArray(value.scopes, "disclosure.scopes");
    if (scopes.some((scope) => !disclosureTargets.has(scope))) {
      throw new TypeError("disclosure.scopes contains an unknown scope");
    }
    return { level: "scoped", scopes: scopes as Array<"local" | "approved-provider" | "external"> };
  }
  throw new TypeError("disclosure policy is invalid");
}

function budgetRecord(
  value: unknown,
  field: string,
  allowUnknown: false,
): Record<string, number>;
function budgetRecord(
  value: unknown,
  field: string,
  allowUnknown: true,
): Record<string, number | null>;
function budgetRecord(
  value: unknown,
  field: string,
  allowUnknown: boolean,
): Record<string, number | null> {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new TypeError(`${field} must be a non-empty object`);
  }
  const result: Record<string, number | null> = {};
  for (const [unit, amount] of Object.entries(value)) {
    if (
      !isBudgetUnitKey(unit) ||
      (amount !== null && (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0))
    ) {
      throw new TypeError(`${field}.${unit} must be a non-negative integer`);
    }
    if (amount === null && !allowUnknown) {
      throw new TypeError(`${field}.${unit} must be a non-negative integer`);
    }
    result[unit] = amount;
  }
  return result;
}

function authority(value: unknown): AuthorityInput {
  if (!isRecord(value)) {
    throw new TypeError("authority must be an object");
  }
  const allowedFields = new Set([
    "workspaceRoots",
    "sourcePaths",
    "artifactPaths",
    "actions",
    "deniedPaths",
    "deniedActions",
    "disclosure",
    "expiresAt",
    "budget",
  ]);
  const unknownFields = Object.keys(value).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    throw new TypeError(`authority contains unknown fields: ${unknownFields.sort().join(", ")}`);
  }
  const budgetValue = requiredRecord(value, "budget");
  const budget: Record<string, number> = {};
  for (const [unit, amount] of Object.entries(budgetValue)) {
    if (!isBudgetUnitKey(unit) || typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
      throw new TypeError(`budget.${unit} must be a qualified non-negative integer`);
    }
    budget[unit] = amount;
  }
  return {
    workspaceRoots: stringArray(value.workspaceRoots, "workspaceRoots"),
    sourcePaths: stringArray(value.sourcePaths, "sourcePaths"),
    artifactPaths: stringArray(value.artifactPaths, "artifactPaths"),
    actions: stringArray(value.actions, "actions"),
    ...(value.deniedPaths === undefined ? {} : { deniedPaths: stringArray(value.deniedPaths, "deniedPaths") }),
    ...(value.deniedActions === undefined ? {} : { deniedActions: stringArray(value.deniedActions, "deniedActions") }),
    disclosure: disclosurePolicy(value.disclosure),
    expiresAt: requiredString(value, "expiresAt"),
    budget,
  };
}

function message(value: Record<string, unknown>): MessageInput {
  const audienceValue = requiredRecord(value, "audience");
  const audience: MessageInput["audience"] =
    audienceValue.kind === "agents"
      ? { kind: "agents", agentIds: stringArray(audienceValue.agentIds, "audience.agentIds") }
      : audienceValue.kind === "team"
        ? { kind: "team", teamId: requiredString(audienceValue, "teamId") }
        : audienceValue.kind === "task"
          ? { kind: "task", taskId: requiredString(audienceValue, "taskId") }
          : (() => {
              throw new TypeError("invalid message audience");
            })();
  const kind = value.kind;
  if (![
    "request",
    "response",
    "event",
    "steer",
    "cancel",
    "escalate",
    "ack",
  ].includes(typeof kind === "string" ? kind : "")) {
    throw new TypeError("invalid message kind");
  }
  if (typeof kind !== "string") {
    throw new TypeError("message kind is required");
  }
  const validKind = kind === "request" || kind === "response" || kind === "event" || kind === "steer" || kind === "cancel" || kind === "escalate" || kind === "ack";
  if (!validKind) {
    throw new TypeError("invalid message kind");
  }
  const requiresAck = value.requiresAck;
  if (typeof requiresAck !== "boolean") {
    throw new TypeError("requiresAck must be a boolean");
  }
  let context: MessageInput["context"];
  if (value.context !== undefined) {
    const contextValue = requiredRecord(value, "context");
    if (contextValue.kind === "direct") context = { kind: "direct" };
    else if (contextValue.kind === "task") context = { kind: "task", taskId: requiredString(contextValue, "taskId") };
    else if (contextValue.kind === "task-dependency") {
      context = {
        kind: "task-dependency",
        fromTaskId: requiredString(contextValue, "fromTaskId"),
        toTaskId: requiredString(contextValue, "toTaskId"),
      };
    } else if (contextValue.kind === "discussion-group") {
      context = { kind: "discussion-group", groupId: requiredString(contextValue, "groupId") };
    } else throw new TypeError("invalid message context");
  }
  return {
    audience,
    kind,
    body: requiredString(value, "body"),
    requiresAck,
    dedupeKey: requiredString(value, "dedupeKey"),
    ...(typeof value.conversationId === "string" ? { conversationId: value.conversationId } : {}),
    ...(typeof value.replyToMessageId === "string" ? { replyToMessageId: value.replyToMessageId } : {}),
    ...(typeof value.taskRevision === "number" ? { taskRevision: value.taskRevision } : {}),
    ...(typeof value.hopCount === "number" ? { hopCount: value.hopCount } : {}),
    ...(typeof value.expiresAt === "string" ? { expiresAt: value.expiresAt } : {}),
    ...(context === undefined ? {} : { context }),
  };
}

function recoveryEvidence(value: unknown): RecoveryEvidence {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new TypeError("recovery evidence is invalid");
  }
  if (value.kind === "unproven") {
    return { kind: "unproven" };
  }
  if (value.kind === "predecessor-terminal") {
    return {
      kind: "predecessor-terminal",
      agentId: requiredString(value, "agentId"),
      providerSessionRef: requiredString(value, "providerSessionRef"),
    };
  }
  if (value.kind === "os-isolated") {
    return { kind: "os-isolated", proofRef: requiredString(value, "proofRef") };
  }
  if (value.kind === "patch-only") {
    return { kind: "patch-only", serialApplierRef: requiredString(value, "serialApplierRef") };
  }
  throw new TypeError("recovery evidence kind is invalid");
}

function lifecycleCheckpoint(value: unknown): {
  relativePath: string;
  sha256: string;
  mailboxWatermark: number;
  acknowledgedAboveWatermark: number[];
  inFlightChildren: string[];
  openWork: string[];
  nextAction: string;
  providerResumeReference: string;
} {
  if (!isRecord(value)) throw new TypeError("checkpoint must be an object");
  const acknowledged = value.acknowledgedAboveWatermark;
  if (!Array.isArray(acknowledged) || !acknowledged.every((item) => typeof item === "number")) {
    throw new TypeError("acknowledgedAboveWatermark must be a number array");
  }
  return {
    relativePath: requiredString(value, "relativePath"),
    sha256: requiredString(value, "sha256"),
    mailboxWatermark: requiredNumber(value, "mailboxWatermark"),
    acknowledgedAboveWatermark: acknowledged,
    inFlightChildren: stringArray(value.inFlightChildren, "inFlightChildren"),
    openWork: stringArray(value.openWork, "openWork"),
    nextAction: requiredString(value, "nextAction"),
    providerResumeReference: requiredString(value, "providerResumeReference"),
  };
}

function teamMembers(value: unknown): Array<{ agentId: string; authority: AuthorityInput }> {
  if (!Array.isArray(value)) throw new TypeError("initialMembers must be an array");
  return value.map((item) => {
    if (!isRecord(item)) throw new TypeError("team member must be an object");
    return { agentId: requiredString(item, "agentId"), authority: authority(item.authority) };
  });
}

function discussionGroups(value: unknown): Array<{ groupId: string; memberAgentIds: string[] }> {
  if (!Array.isArray(value)) throw new TypeError("discussionGroups must be an array");
  return value.map((item) => {
    if (!isRecord(item)) throw new TypeError("discussion group must be an object");
    return { groupId: requiredString(item, "groupId"), memberAgentIds: stringArray(item.memberAgentIds, "memberAgentIds") };
  });
}

export async function dispatchClientMethod(client: FabricClient, method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case "delegateAuthority": {
      return client.delegateAuthority({
        parentAuthorityId: requiredString(params, "parentAuthorityId"),
        authority: authority(params.authority),
        ...(typeof params.commandId === "string" ? { commandId: params.commandId } : {}),
      });
    }
    case "createTeam": {
      const leader = requiredRecord(params, "leader");
      const rootTask = requiredRecord(params, "rootTask");
      const budgetValue = requiredRecord(params, "reservedBudget");
      const reservedBudget: Record<string, number> = {};
      for (const [unit, amount] of Object.entries(budgetValue)) {
        if (typeof amount !== "number") throw new TypeError(`reservedBudget.${unit} must be a number`);
        reservedBudget[unit] = amount;
      }
      return client.createTeam({
        teamId: requiredString(params, "teamId"),
        ...(typeof params.parentTeamId === "string" ? { parentTeamId: params.parentTeamId } : {}),
        leader: { agentId: requiredString(leader, "agentId"), authority: authority(leader.authority) },
        rootTask: {
          taskId: requiredString(rootTask, "taskId"),
          objective: requiredString(rootTask, "objective"),
          baseRevision: requiredString(rootTask, "baseRevision"),
        },
        initialMembers: teamMembers(params.initialMembers),
        discussionGroups: discussionGroups(params.discussionGroups),
        reservedBudget,
        commandId: requiredString(params, "commandId"),
      });
    }
    case "freezeSubtree":
      return client.freezeSubtree({
        teamId: requiredString(params, "teamId"),
        expectedGeneration: requiredPositiveInteger(params, "expectedGeneration"),
        reason: requiredString(params, "reason"),
        commandId: requiredString(params, "commandId"),
      });
    case "adoptSubtree":
      return client.adoptSubtree({
        teamId: requiredString(params, "teamId"),
        successorAgentId: requiredString(params, "successorAgentId"),
        expectedGeneration: requiredPositiveInteger(params, "expectedGeneration"),
        handoffEvidence: requiredString(params, "handoffEvidence"),
        commandId: requiredString(params, "commandId"),
      });
    case "closeSubtreeBarrier":
      return client.closeSubtreeBarrier({
        teamId: requiredString(params, "teamId"),
        expectedGeneration: requiredPositiveInteger(params, "expectedGeneration"),
        commandId: requiredString(params, "commandId"),
      });
    case "reserveBudget":
      return client.reserveBudget({
        teamId: requiredString(params, "teamId"),
        expectedTeamGeneration: requiredPositiveInteger(params, "expectedTeamGeneration"),
        parentBudgetId: requiredString(params, "parentBudgetId"),
        budgetId: requiredString(params, "budgetId"),
        dimensions: budgetRecord(params.dimensions, "dimensions", false),
        commandId: requiredString(params, "commandId"),
      });
    case "recordBudgetUsage":
      return client.recordBudgetUsage({
        budgetId: requiredString(params, "budgetId"),
        usage: budgetRecord(params.usage, "usage", true),
        commandId: requiredString(params, "commandId"),
      });
    case "reconcileBudgetUsage":
      return client.reconcileBudgetUsage({
        budgetId: requiredString(params, "budgetId"),
        consumed: budgetRecord(params.consumed, "consumed", false),
        commandId: requiredString(params, "commandId"),
      });
    case "releaseBudget":
      return client.releaseBudget({
        budgetId: requiredString(params, "budgetId"),
        commandId: requiredString(params, "commandId"),
      });
    case "getBudget":
      return client.getBudget({ budgetId: requiredString(params, "budgetId") });
    case "acknowledgeTaskHandoff":
      return client.acknowledgeTaskHandoff({
        taskId: requiredString(params, "taskId"),
        taskRevision: requiredPositiveInteger(params, "taskRevision"),
        ownerLeaseGeneration: requiredPositiveInteger(params, "ownerLeaseGeneration"),
        commandId: requiredString(params, "commandId"),
      });
    case "registerAgent": {
      return client.registerAgent({
        agentId: requiredString(params, "agentId"),
        authorityId: requiredString(params, "authorityId"),
        ...(typeof params.providerSessionRef === "string" ? { providerSessionRef: params.providerSessionRef } : {}),
        ...(typeof params.adapterId === "string" ? { adapterId: params.adapterId } : {}),
      });
    }
    case "spawnAgent":
      return client.spawnAgent({
        agentId: requiredString(params, "agentId"),
        authorityId: requiredString(params, "authorityId"),
        adapterId: requiredString(params, "adapterId"),
        actionId: requiredString(params, "actionId"),
        payload: requiredRecord(params, "payload"),
      });
    case "attachAgent":
      return client.attachAgent({
        agentId: requiredString(params, "agentId"),
        authorityId: requiredString(params, "authorityId"),
        adapterId: requiredString(params, "adapterId"),
        actionId: requiredString(params, "actionId"),
        providerSessionRef: requiredString(params, "providerSessionRef"),
      });
    case "steerAgent":
      return client.dispatchProviderAction({
        adapterId: requiredString(params, "adapterId"),
        actionId: requiredString(params, "actionId"),
        operation: "steer",
        payload: requiredRecord(params, "payload"),
        commandId: requiredString(params, "commandId"),
      });
    case "dispatchProviderAction": {
      const operation = params.operation;
      if (operation !== "send_turn" && operation !== "wakeup" && operation !== "release" && operation !== "steer") throw new TypeError("invalid provider action operation");
      return client.dispatchProviderAction({
        adapterId: requiredString(params, "adapterId"), actionId: requiredString(params, "actionId"), operation,
        payload: requiredRecord(params, "payload"), commandId: requiredString(params, "commandId"),
      });
    }
    case "requestLifecycle":
    case "releaseAgent": {
      const action = method === "releaseAgent" ? "release" : params.action;
      if (action !== "compact" && action !== "rotate" && action !== "completion-ready" && action !== "release") {
        throw new TypeError("invalid lifecycle action");
      }
      return client.requestLifecycle({
        action,
        agentId: requiredString(params, "agentId"),
        taskId: requiredString(params, "taskId"),
        taskRevision: requiredNumber(params, "taskRevision"),
        checkpoint: lifecycleCheckpoint(params.checkpoint),
        commandId: requiredString(params, "commandId"),
      });
    }
    case "recordOperatorIntervention": {
      const source = params.source;
      const provenance = params.directInputProvenance;
      if (source !== "fabric" && source !== "integration") throw new TypeError("invalid intervention source");
      if (provenance !== "complete" && provenance !== "partial" && provenance !== "unavailable") {
        throw new TypeError("invalid direct-input provenance");
      }
      return client.recordOperatorIntervention({
        source,
        directInputProvenance: provenance,
        taskRevision: requiredNumber(params, "taskRevision"),
        summary: requiredString(params, "summary"),
        commandId: requiredString(params, "commandId"),
      });
    }
    case "sendMessage":
      return client.sendMessage(message(params));
    case "createDiscussionGroup":
      return client.createDiscussionGroup({
        groupId: requiredString(params, "groupId"),
        memberAgentIds: stringArray(params.memberAgentIds, "memberAgentIds"),
        ...(typeof params.teamId === "string" ? { teamId: params.teamId } : {}),
        commandId: requiredString(params, "commandId"),
      });
    case "receiveMessages":
      return client.receiveMessages({
        limit: requiredNumber(params, "limit"),
        visibilityTimeoutMs: requiredNumber(params, "visibilityTimeoutMs"),
      });
    case "acknowledgeDelivery":
      return client.acknowledgeDelivery({ deliveryId: requiredString(params, "deliveryId") });
    case "abandonDelivery":
      return client.abandonDelivery({
        deliveryId: requiredString(params, "deliveryId"),
        reason: requiredString(params, "reason"),
        commandId: requiredString(params, "commandId"),
      });
    case "getMailboxState":
      return client.getMailboxState();
    case "eventsAfter":
      return client.eventsAfter({
        cursor: requiredNumber(params, "cursor"),
        limit: requiredNumber(params, "limit"),
      });
    case "createTask":
      return client.createTask({
        taskId: requiredString(params, "taskId"),
        authorityId: requiredString(params, "authorityId"),
        eligibleAgentIds: stringArray(params.eligibleAgentIds, "eligibleAgentIds"),
        ...(typeof params.proposedOwnerAgentId === "string" ? { proposedOwnerAgentId: params.proposedOwnerAgentId } : {}),
        ...(params.participantAgentIds === undefined ? {} : { participantAgentIds: stringArray(params.participantAgentIds, "participantAgentIds") }),
        ...(params.dependencies === undefined ? {} : { dependencies: stringArray(params.dependencies, "dependencies") }),
        ...(params.expectedArtifacts === undefined ? {} : { expectedArtifacts: stringArray(params.expectedArtifacts, "expectedArtifacts") }),
        ...(params.objectiveChecks === undefined ? {} : { objectiveChecks: stringArray(params.objectiveChecks, "objectiveChecks") }),
        ...(params.humanGates === undefined ? {} : { humanGates: stringArray(params.humanGates, "humanGates") }),
        objective: requiredString(params, "objective"),
        baseRevision: requiredString(params, "baseRevision"),
        commandId: requiredString(params, "commandId"),
      });
    case "claimTask":
      return client.claimTask({
        taskId: requiredString(params, "taskId"),
        expectedRevision: requiredNumber(params, "expectedRevision"),
        commandId: requiredString(params, "commandId"),
      });
    case "getTask":
      return client.getTask({ taskId: requiredString(params, "taskId") });
    case "refreshTaskReadiness":
      return client.refreshTaskReadiness({
        taskId: requiredString(params, "taskId"),
        expectedRevision: requiredNumber(params, "expectedRevision"),
        commandId: requiredString(params, "commandId"),
      });
    case "updateTask": {
      const state = params.state;
      if (state !== "complete" && state !== "cancelled" && state !== "degraded") {
        throw new TypeError("invalid terminal task state");
      }
      return client.updateTask({
        taskId: requiredString(params, "taskId"),
        expectedRevision: requiredNumber(params, "expectedRevision"),
        state,
        commandId: requiredString(params, "commandId"),
      });
    }
    case "recordTaskOwnerRecoveryProof": {
      const kind = params.kind;
      if (kind !== "predecessor-terminal" && kind !== "os-isolated" && kind !== "patch-only") throw new TypeError("invalid task-owner recovery proof kind");
      const detailValue = requiredRecord(params, "detail");
      const detail: Record<string, string> = {};
      for (const [key, value] of Object.entries(detailValue)) {
        if (typeof value !== "string") throw new TypeError(`detail.${key} must be a string`);
        detail[key] = value;
      }
      return client.recordTaskOwnerRecoveryProof({ taskId: requiredString(params, "taskId"), ownerLeaseGeneration: requiredNumber(params, "ownerLeaseGeneration"), kind, detail, commandId: requiredString(params, "commandId") });
    }
    case "recoverTaskOwner":
      return client.recoverTaskOwner({
        taskId: requiredString(params, "taskId"), expectedRevision: requiredNumber(params, "expectedRevision"),
        expectedOwnerLeaseGeneration: requiredNumber(params, "expectedOwnerLeaseGeneration"), successorAgentId: requiredString(params, "successorAgentId"),
        proofId: requiredString(params, "proofId"), commandId: requiredString(params, "commandId"),
      });
    case "recordRevocationProof": {
      const kind = params.kind;
      if (kind !== "predecessor-terminal" && kind !== "os-isolated" && kind !== "patch-only") {
        throw new TypeError("invalid revocation proof kind");
      }
      const detailValue = requiredRecord(params, "detail");
      const detail: Record<string, string> = {};
      for (const [key, value] of Object.entries(detailValue)) {
        if (typeof value !== "string") {
          throw new TypeError(`detail.${key} must be a string`);
        }
        detail[key] = value;
      }
      return client.recordRevocationProof({
        leaseId: requiredString(params, "leaseId"),
        generation: requiredNumber(params, "generation"),
        kind,
        detail,
        commandId: requiredString(params, "commandId"),
      });
    }
    case "revokeCapability":
      return client.revokeCapability({
        agentId: requiredString(params, "agentId"),
        commandId: requiredString(params, "commandId"),
      });
    case "rotateCapability":
      return client.rotateCapability({
        agentId: requiredString(params, "agentId"),
        expectedPrincipalGeneration: requiredNumber(params, "expectedPrincipalGeneration"),
        commandId: requiredString(params, "commandId"),
      });
    case "acquireWriteLease":
      return client.acquireWriteLease({
        scope: stringArray(params.scope, "scope"),
        ttlMs: requiredNumber(params, "ttlMs"),
        commandId: requiredString(params, "commandId"),
        ...(params.taskId === undefined ? {} : { taskId: requiredString(params, "taskId") }),
      });
    case "recoverWriteLease":
      return client.recoverWriteLease({
        leaseId: requiredString(params, "leaseId"),
        expectedGeneration: requiredNumber(params, "expectedGeneration"),
        commandId: requiredString(params, "commandId"),
        evidence: recoveryEvidence(params.evidence),
      });
    case "renewWriteLease":
      return client.renewWriteLease({
        leaseId: requiredString(params, "leaseId"),
        expectedGeneration: requiredNumber(params, "expectedGeneration"),
        ttlMs: requiredNumber(params, "ttlMs"),
        commandId: requiredString(params, "commandId"),
      });
    case "getWriteLease":
      return client.getWriteLease({ leaseId: requiredString(params, "leaseId") });
    case "publishArtifact":
      return client.publishArtifact({
        ...(typeof params.taskId === "string" ? { taskId: params.taskId } : {}),
        relativePath: requiredString(params, "relativePath"),
        sha256: requiredString(params, "sha256"),
        commandId: requiredString(params, "commandId"),
      });
    case "closeBarrier": {
      const scope = params.scope;
      if (scope !== "run" && scope !== "stage") {
        throw new TypeError("barrier scope must be run or stage");
      }
      return client.closeBarrier({
        scope,
        ...(typeof params.stageId === "string" ? { stageId: params.stageId } : {}),
        commandId: requiredString(params, "commandId"),
      });
    }
    case "getRunStatus":
      return client.getRunStatus({ runId: requiredString(params, "runId") });
    case "listTasks":
      return client.listTasks({ runId: requiredString(params, "runId") });
    case "listAgents":
      return client.listAgents({ runId: requiredString(params, "runId") });
    case "listReceipts":
      return client.listReceipts({ runId: requiredString(params, "runId") });
    case "exportReceipt":
      return client.exportReceipt({ commandId: requiredString(params, "commandId") });
    default:
      throw new TypeError(`unsupported daemon method ${method}`);
  }
}

export function bindCurrentMcpSeatsInput(params: Record<string, unknown>): CurrentMcpSeatBindingInput {
  exactFields(params, [
    "canonicalRoot",
    "projectSessionId",
    "expectedSessionRevision",
    "expectedSessionGeneration",
    "runId",
    "expectedRunRevision",
    "chairAgentId",
    "expectedChairGeneration",
    "chairLeaseId",
    "expiresAt",
    "bindings",
  ], "current MCP seat binding");
  if (!Array.isArray(params.bindings) || params.bindings.length === 0) {
    throw new TypeError("current MCP seat binding requires a non-empty bindings array");
  }
  const bindings = params.bindings.map((value, index) => {
    const binding = requiredRecord({ binding: value }, "binding");
    exactFields(binding, ["seat", "agentId", "expectedPrincipalGeneration"], `current MCP seat binding ${String(index)}`);
    return {
      seat: requiredString(binding, "seat"),
      agentId: requiredString(binding, "agentId"),
      expectedPrincipalGeneration: requiredPositiveInteger(binding, "expectedPrincipalGeneration"),
    };
  });
  return {
    canonicalRoot: requiredString(params, "canonicalRoot"),
    projectSessionId: requiredString(params, "projectSessionId"),
    expectedSessionRevision: requiredPositiveInteger(params, "expectedSessionRevision"),
    expectedSessionGeneration: requiredPositiveInteger(params, "expectedSessionGeneration"),
    runId: requiredString(params, "runId"),
    expectedRunRevision: requiredPositiveInteger(params, "expectedRunRevision"),
    chairAgentId: requiredString(params, "chairAgentId"),
    expectedChairGeneration: requiredPositiveInteger(params, "expectedChairGeneration"),
    chairLeaseId: requiredString(params, "chairLeaseId"),
    expiresAt: requiredString(params, "expiresAt"),
    bindings,
  };
}

export function provisionLocalOperatorInput(
  params: Record<string, unknown>,
): ProvisionLocalOperatorInput {
  exactFields(params, [
    "canonicalRoot",
    "trustRecordDigest",
    "projectAuthorityGeneration",
    "principalGeneration",
    "actions",
    "expiresAt",
  ], "local operator provisioning");
  return {
    canonicalRoot: requiredString(params, "canonicalRoot"),
    trustRecordDigest: requiredString(params, "trustRecordDigest"),
    projectAuthorityGeneration: requiredPositiveInteger(params, "projectAuthorityGeneration"),
    principalGeneration: requiredPositiveInteger(params, "principalGeneration"),
    actions: uniqueActions(params.actions, ["read", "launch"] as const, "actions"),
    expiresAt: requiredString(params, "expiresAt"),
  };
}

export function openLocalOperatorConsoleCapabilityInput(
  params: Record<string, unknown>,
): OpenLocalOperatorConsoleCapabilityInput {
  exactFields(params, [
    "canonicalRoot",
    "trustRecordDigest",
    "projectAuthorityGeneration",
    "actions",
    "expiresAt",
  ], "local Console operator capability");
  return {
    canonicalRoot: requiredString(params, "canonicalRoot"),
    trustRecordDigest: requiredString(params, "trustRecordDigest"),
    projectAuthorityGeneration: requiredPositiveInteger(params, "projectAuthorityGeneration"),
    actions: uniqueActions(params.actions, ["read", "launch"] as const, "actions"),
    expiresAt: requiredString(params, "expiresAt"),
  };
}

export function issueLocalOperatorSessionCapabilityInput(
  params: Record<string, unknown>,
): IssueLocalOperatorSessionCapabilityInput {
  exactFields(params, [
    "projectId",
    "canonicalRoot",
    "trustRecordDigest",
    "projectCapability",
    "projectSessionId",
    "sessionGeneration",
    "actions",
    "expiresAt",
    "launchEnvelopeExpiresAt",
  ], "local operator session capability");
  const projectCapability = requiredRecord(params, "projectCapability");
  exactFields(projectCapability, ["capabilityId", "token"], "project capability credential");
  const allowed = OPERATOR_ACTIONS.filter((action): action is Exclude<OperatorAction, "takeover"> => action !== "takeover");
  return {
    projectId: requiredString(params, "projectId"),
    canonicalRoot: requiredString(params, "canonicalRoot"),
    trustRecordDigest: requiredString(params, "trustRecordDigest"),
    projectCapability: {
      capabilityId: requiredString(projectCapability, "capabilityId"),
      token: requiredString(projectCapability, "token"),
    },
    projectSessionId: requiredString(params, "projectSessionId"),
    sessionGeneration: requiredPositiveInteger(params, "sessionGeneration"),
    actions: uniqueActions(params.actions, allowed, "actions"),
    expiresAt: requiredString(params, "expiresAt"),
    launchEnvelopeExpiresAt: requiredString(params, "launchEnvelopeExpiresAt"),
  };
}

export function rotateLocalOperatorPrincipalInput(
  params: Record<string, unknown>,
): RotateLocalOperatorPrincipalInput {
  exactFields(params, [
    "projectId",
    "operatorId",
    "canonicalRoot",
    "trustRecordDigest",
    "projectAuthorityGeneration",
    "expectedPrincipalGeneration",
  ], "local operator principal rotation");
  return {
    projectId: requiredString(params, "projectId"),
    operatorId: requiredString(params, "operatorId"),
    canonicalRoot: requiredString(params, "canonicalRoot"),
    trustRecordDigest: requiredString(params, "trustRecordDigest"),
    projectAuthorityGeneration: requiredPositiveInteger(params, "projectAuthorityGeneration"),
    expectedPrincipalGeneration: requiredPositiveInteger(params, "expectedPrincipalGeneration"),
  };
}

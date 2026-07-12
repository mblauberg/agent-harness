import { FABRIC_OPERATIONS } from "./operations.js";
import type { JsonValue } from "./primitives.js";

export type DisclosurePolicy =
  | { level: "allowed" }
  | { level: "scoped"; scopes: readonly ("local" | "approved-provider" | "external")[] }
  | { level: "forbidden" };

export type AuthorityInput = {
  workspaceRoots: readonly string[];
  sourcePaths: readonly string[];
  artifactPaths: readonly string[];
  actions: readonly string[];
  deniedPaths?: readonly string[];
  deniedActions?: readonly string[];
  disclosure: DisclosurePolicy;
  expiresAt: string;
  budget: Readonly<Record<string, number>>;
};

export type MessageInput = {
  audience:
    | { kind: "agents"; agentIds: readonly string[] }
    | { kind: "team"; teamId: string }
    | { kind: "task"; taskId: string };
  kind: "request" | "response" | "event" | "steer" | "cancel" | "escalate" | "ack";
  body: string;
  requiresAck: boolean;
  dedupeKey: string;
  conversationId?: string;
  replyToMessageId?: string;
  taskRevision?: number;
  hopCount?: number;
  expiresAt?: string;
  context?:
    | { kind: "direct" }
    | { kind: "task"; taskId: string }
    | { kind: "task-dependency"; fromTaskId: string; toTaskId: string }
    | { kind: "discussion-group"; groupId: string };
};

export type RecoveryEvidence =
  | { kind: "unproven" }
  | { kind: "predecessor-terminal"; agentId: string; providerSessionRef: string }
  | { kind: "os-isolated"; proofRef: string }
  | { kind: "patch-only"; serialApplierRef: string };

export type TaskResult = {
  taskId: string;
  ownerAgentId: string | null;
  state: "blocked" | "ready" | "active" | "complete" | "cancelled" | "degraded";
  revision: number;
  ownerLeaseGeneration: number;
  proposedOwnerAgentId: string | null;
  dependencies: readonly string[];
};

export type LeaseResult = {
  leaseId: string;
  holderAgentId: string;
  generation: number;
  status: "active" | "quarantined";
  scope: readonly string[];
};

export type ReceiptResult = { relativePath: string; schemaVersion: 1 | 2; sha256: string };
export type ObserverEvent = {
  cursor: number;
  eventId: string;
  type: string;
  actorAgentId: string | null;
  createdAt: number;
  summary: string;
};
export type LifecycleCheckpoint = {
  relativePath: string;
  sha256: string;
  mailboxWatermark: number;
  acknowledgedAboveWatermark: readonly number[];
  inFlightChildren: readonly string[];
  openWork: readonly string[];
  nextAction: string;
  providerResumeReference: string;
};
export type LifecycleResult = {
  agentId: string;
  lifecycle: string;
  providerSessionGeneration: number;
  rotation?: { kind: "in-place" | "replacement-session"; priorResumeReference: string };
};
export type ProviderActionResult = {
  actionId: string;
  status: "prepared" | "dispatched" | "accepted" | "terminal" | "ambiguous" | "quarantined";
  history: readonly string[];
  executionCount: number;
  effectCount: number;
  resultDigest?: string;
};
export type TeamCreateInput = {
  teamId: string;
  parentTeamId?: string;
  leader: { agentId: string; authority: AuthorityInput };
  rootTask: { taskId: string; objective: string; baseRevision: string };
  initialMembers: readonly { agentId: string; authority: AuthorityInput }[];
  discussionGroups: readonly { groupId: string; memberAgentIds: readonly string[] }[];
  reservedBudget: Readonly<Record<string, number>>;
  commandId: string;
};
export type TeamResult = {
  teamId: string;
  parentTeamId: string | null;
  depth: number;
  leaderAgentId: string;
  rootTaskId: string;
  ownedTaskIds: readonly string[];
  memberAgentIds: readonly string[];
  budgetId: string;
  state: "active" | "frozen" | "barrier-closed";
  generation: number;
  successorAgentId: string | null;
  leader?: { agentId: string; authorityId: string };
  rootTask?: TaskResult;
  initialMembers?: readonly { agentId: string; authorityId: string }[];
  discussionGroups: readonly { groupId: string; memberAgentIds: readonly string[] }[];
  reservedBudget: Readonly<Record<string, number>>;
};

export type AgentCustodyResult = {
  agentId: string;
  authorityId: string;
  adapterId: string;
  actionId: string;
  providerSessionRef: string;
  providerSessionGeneration: number;
  bridgeState: "active" | "none";
  bridgeGeneration: number;
  evidenceDigest: `sha256:${string}`;
};
export type BudgetResult = {
  budgetId: string;
  parentBudgetId: string | null;
  state: "active" | "usage-unknown" | "released";
  dimensions: Readonly<Record<string, {
    granted: number;
    reserved: number;
    consumed: number;
    available: number;
    usageUnknown: boolean;
  }>>;
  returned: Readonly<Record<string, number>>;
};

export type BaselineOperationInputMap = {
  [FABRIC_OPERATIONS.delegateAuthority]: { parentAuthorityId: string; authority: AuthorityInput; commandId?: string };
  [FABRIC_OPERATIONS.registerAgent]: { agentId: string; authorityId: string; providerSessionRef?: string; adapterId?: string };
  [FABRIC_OPERATIONS.spawnAgent]: { agentId: string; authorityId: string; adapterId: string; actionId: string; payload: Readonly<Record<string, JsonValue>> };
  [FABRIC_OPERATIONS.attachAgent]: { agentId: string; authorityId: string; adapterId: string; actionId: string; providerSessionRef: string };
  [FABRIC_OPERATIONS.sendMessage]: MessageInput;
  [FABRIC_OPERATIONS.createDiscussionGroup]: { groupId: string; memberAgentIds: readonly string[]; teamId?: string; commandId: string };
  [FABRIC_OPERATIONS.receiveMessages]: { limit: number; visibilityTimeoutMs: number };
  [FABRIC_OPERATIONS.acknowledgeDelivery]: { deliveryId: string };
  [FABRIC_OPERATIONS.abandonDelivery]: { deliveryId: string; reason: string; commandId: string };
  [FABRIC_OPERATIONS.getMailboxState]: Record<never, never>;
  [FABRIC_OPERATIONS.createTask]: {
    taskId: string;
    authorityId: string;
    eligibleAgentIds: readonly string[];
    proposedOwnerAgentId?: string;
    participantAgentIds?: readonly string[];
    dependencies?: readonly string[];
    expectedArtifacts?: readonly string[];
    objectiveChecks?: readonly string[];
    objective: string;
    baseRevision: string;
    commandId: string;
  };
  [FABRIC_OPERATIONS.claimTask]: { taskId: string; expectedRevision: number; commandId: string };
  [FABRIC_OPERATIONS.refreshTaskReadiness]: { taskId: string; expectedRevision: number; commandId: string };
  [FABRIC_OPERATIONS.recordObjectiveCheck]: { taskId: string; checkId: string; status: "pass" | "fail"; evidence: string; commandId: string };
  [FABRIC_OPERATIONS.acknowledgeTaskHandoff]: { taskId: string; taskRevision: number; ownerLeaseGeneration: number; commandId: string };
  [FABRIC_OPERATIONS.getTask]: { taskId: string };
  [FABRIC_OPERATIONS.updateTask]: { taskId: string; expectedRevision: number; state: "complete" | "cancelled" | "degraded"; commandId: string };
  [FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof]: { taskId: string; ownerLeaseGeneration: number; kind: "predecessor-terminal" | "os-isolated" | "patch-only"; detail: Readonly<Record<string, string>>; commandId: string };
  [FABRIC_OPERATIONS.recoverTaskOwner]: { taskId: string; expectedRevision: number; expectedOwnerLeaseGeneration: number; successorAgentId: string; proofId: string; commandId: string };
  [FABRIC_OPERATIONS.recordRevocationProof]: { leaseId: string; generation: number; kind: "predecessor-terminal" | "os-isolated" | "patch-only"; detail: Readonly<Record<string, string>>; commandId: string };
  [FABRIC_OPERATIONS.revokeCapability]: { agentId: string; commandId: string };
  [FABRIC_OPERATIONS.rotateCapability]: { agentId: string; expectedPrincipalGeneration: number; commandId: string };
  [FABRIC_OPERATIONS.acquireWriteLease]: { scope: readonly string[]; ttlMs: number; commandId: string; taskId?: string };
  [FABRIC_OPERATIONS.recoverWriteLease]: { leaseId: string; expectedGeneration: number; commandId: string; evidence: RecoveryEvidence };
  [FABRIC_OPERATIONS.renewWriteLease]: { leaseId: string; expectedGeneration: number; ttlMs: number; commandId: string };
  [FABRIC_OPERATIONS.getWriteLease]: { leaseId: string };
  [FABRIC_OPERATIONS.releaseWriteLease]: { leaseId: string; expectedGeneration: number; commandId: string };
  [FABRIC_OPERATIONS.requestLifecycle]: { action: "compact" | "rotate" | "completion-ready" | "release"; agentId: string; taskId: string; taskRevision: number; checkpoint: LifecycleCheckpoint; commandId: string };
  [FABRIC_OPERATIONS.getAgentLifecycle]: { agentId: string };
  [FABRIC_OPERATIONS.reportProviderState]: { agentId: string; providerSessionGeneration: number; contextRevision: string; checkpointSha256?: string; commandId: string };
  [FABRIC_OPERATIONS.dispatchProviderAction]: { adapterId: string; actionId: string; operation: "send_turn" | "wakeup" | "release" | "steer"; payload: Readonly<Record<string, JsonValue>>; commandId: string };
  [FABRIC_OPERATIONS.reconcileProviderAction]: { actionId: string; commandId: string };
  [FABRIC_OPERATIONS.getProviderAction]: { actionId: string };
  [FABRIC_OPERATIONS.recordOperatorIntervention]: { source: "fabric" | "integration"; directInputProvenance: "complete" | "partial" | "unavailable"; taskRevision: number; summary: string; commandId: string };
  [FABRIC_OPERATIONS.recordVisibilityFailure]: { kind: "herdr-telemetry" | "observer-pane" | "interactive-tui"; agentId: string; commandId: string };
  [FABRIC_OPERATIONS.createTeam]: TeamCreateInput;
  [FABRIC_OPERATIONS.getTeam]: { teamId: string };
  [FABRIC_OPERATIONS.freezeSubtree]: { teamId: string; expectedGeneration: number; reason: string; commandId: string };
  [FABRIC_OPERATIONS.adoptSubtree]: { teamId: string; successorAgentId: string; expectedGeneration: number; handoffEvidence: string; commandId: string };
  [FABRIC_OPERATIONS.closeSubtreeBarrier]: { teamId: string; expectedGeneration: number; commandId: string };
  [FABRIC_OPERATIONS.reserveBudget]: { teamId: string; expectedTeamGeneration: number; parentBudgetId: string; budgetId: string; dimensions: Readonly<Record<string, number>>; commandId: string };
  [FABRIC_OPERATIONS.recordBudgetUsage]: { budgetId: string; usage: Readonly<Record<string, number | null>>; commandId: string };
  [FABRIC_OPERATIONS.reconcileBudgetUsage]: { budgetId: string; consumed: Readonly<Record<string, number>>; commandId: string };
  [FABRIC_OPERATIONS.releaseBudget]: { budgetId: string; commandId: string };
  [FABRIC_OPERATIONS.getBudget]: { budgetId: string };
  [FABRIC_OPERATIONS.publishArtifact]: { taskId?: string; relativePath: string; sha256: string; commandId: string };
  [FABRIC_OPERATIONS.closeBarrier]: { scope: "run" | "stage"; stageId?: string; commandId: string };
  [FABRIC_OPERATIONS.getRunStatus]: { runId: string };
  [FABRIC_OPERATIONS.observeEvents]: { cursor: number; limit: number };
  [FABRIC_OPERATIONS.listTasks]: { runId: string };
  [FABRIC_OPERATIONS.listAgents]: { runId: string };
  [FABRIC_OPERATIONS.listReceipts]: { runId: string };
  [FABRIC_OPERATIONS.exportReceipt]: { commandId: string };
};

export type BaselineOperationResultMap = {
  [FABRIC_OPERATIONS.delegateAuthority]: { authorityId: string };
  [FABRIC_OPERATIONS.registerAgent]: { capability: string };
  [FABRIC_OPERATIONS.spawnAgent]: AgentCustodyResult;
  [FABRIC_OPERATIONS.attachAgent]: AgentCustodyResult;
  [FABRIC_OPERATIONS.sendMessage]: { messageId: string };
  [FABRIC_OPERATIONS.createDiscussionGroup]: { groupId: string; memberAgentIds: readonly string[] };
  [FABRIC_OPERATIONS.receiveMessages]: { deliveries: readonly { deliveryId: string; messageId: string; sequence: number; body: string; attempt: number; senderId: string; kind: MessageInput["kind"]; requiresAck: boolean }[] };
  [FABRIC_OPERATIONS.acknowledgeDelivery]: { acknowledged: true };
  [FABRIC_OPERATIONS.abandonDelivery]: { deliveryId: string; status: "abandoned"; reason: string };
  [FABRIC_OPERATIONS.getMailboxState]: { contiguousWatermark: number; acknowledgedAboveWatermark: readonly number[] };
  [FABRIC_OPERATIONS.createTask]: TaskResult;
  [FABRIC_OPERATIONS.claimTask]: TaskResult;
  [FABRIC_OPERATIONS.refreshTaskReadiness]: TaskResult;
  [FABRIC_OPERATIONS.recordObjectiveCheck]: { taskId: string; checkId: string; status: "pass" | "fail" };
  [FABRIC_OPERATIONS.acknowledgeTaskHandoff]: { acknowledged: true };
  [FABRIC_OPERATIONS.getTask]: TaskResult;
  [FABRIC_OPERATIONS.updateTask]: TaskResult;
  [FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof]: { proofId: string };
  [FABRIC_OPERATIONS.recoverTaskOwner]: TaskResult;
  [FABRIC_OPERATIONS.recordRevocationProof]: { proofId: string };
  [FABRIC_OPERATIONS.revokeCapability]: null;
  [FABRIC_OPERATIONS.rotateCapability]: { agentId: string; principalGeneration: number; capability: string };
  [FABRIC_OPERATIONS.acquireWriteLease]: LeaseResult;
  [FABRIC_OPERATIONS.recoverWriteLease]: LeaseResult;
  [FABRIC_OPERATIONS.renewWriteLease]: LeaseResult;
  [FABRIC_OPERATIONS.getWriteLease]: LeaseResult;
  [FABRIC_OPERATIONS.releaseWriteLease]: { leaseId: string; status: "released"; generation: number };
  [FABRIC_OPERATIONS.requestLifecycle]: LifecycleResult;
  [FABRIC_OPERATIONS.getAgentLifecycle]: LifecycleResult;
  [FABRIC_OPERATIONS.reportProviderState]: LifecycleResult;
  [FABRIC_OPERATIONS.dispatchProviderAction]: ProviderActionResult;
  [FABRIC_OPERATIONS.reconcileProviderAction]: ProviderActionResult;
  [FABRIC_OPERATIONS.getProviderAction]: ProviderActionResult;
  [FABRIC_OPERATIONS.recordOperatorIntervention]: { interventionId: string };
  [FABRIC_OPERATIONS.recordVisibilityFailure]: { visibility: "degraded" | "lost"; providerSession: "healthy" | "lost"; delivery: "active" | "frozen"; recovery?: "reattach-or-rotate" };
  [FABRIC_OPERATIONS.createTeam]: TeamResult;
  [FABRIC_OPERATIONS.getTeam]: TeamResult;
  [FABRIC_OPERATIONS.freezeSubtree]: TeamResult;
  [FABRIC_OPERATIONS.adoptSubtree]: TeamResult;
  [FABRIC_OPERATIONS.closeSubtreeBarrier]: { teamId: string; generation: number; closed: true };
  [FABRIC_OPERATIONS.reserveBudget]: BudgetResult;
  [FABRIC_OPERATIONS.recordBudgetUsage]: BudgetResult;
  [FABRIC_OPERATIONS.reconcileBudgetUsage]: BudgetResult;
  [FABRIC_OPERATIONS.releaseBudget]: BudgetResult;
  [FABRIC_OPERATIONS.getBudget]: BudgetResult;
  [FABRIC_OPERATIONS.publishArtifact]: { artifactId: string; relativePath: string; sha256: string };
  [FABRIC_OPERATIONS.closeBarrier]: { scope: "run" | "stage"; closed: true; receipt: ReceiptResult };
  [FABRIC_OPERATIONS.getRunStatus]: { runId: string; chairAgentId: string; barrier: { state: "open" | "closed" }; counts: { agents: number; tasks: number; tasksTerminal: number; messages: number; deliveriesUnacknowledged: number; leasesActive: number } };
  [FABRIC_OPERATIONS.observeEvents]: { events: readonly ObserverEvent[]; nextCursor: number };
  [FABRIC_OPERATIONS.listTasks]: { tasks: readonly TaskResult[] };
  [FABRIC_OPERATIONS.listAgents]: { agents: readonly {
    agentId: string;
    parentAgentId: string | null;
    lifecycle: string;
    bridgeState: "active" | "none" | "lost";
    bridgeGeneration: number;
  }[] };
  [FABRIC_OPERATIONS.listReceipts]: { receipts: readonly { relativePath: string; sha256: string; exportedAt: number }[] };
  [FABRIC_OPERATIONS.exportReceipt]: ReceiptResult;
};

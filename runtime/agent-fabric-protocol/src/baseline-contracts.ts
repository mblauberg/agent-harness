import { FABRIC_OPERATIONS } from "./operations.js";
import type { JsonValue } from "./primitives.js";

export type LegacyDisclosurePolicy =
  | { level: "allowed" }
  | { level: "scoped"; scopes: readonly ("local" | "approved-provider" | "external")[] }
  | { level: "forbidden" };

export type LegacyAuthorityInput = {
  workspaceRoots: readonly string[];
  sourcePaths: readonly string[];
  artifactPaths: readonly string[];
  actions: readonly string[];
  deniedPaths?: readonly string[];
  deniedActions?: readonly string[];
  disclosure: LegacyDisclosurePolicy | readonly string[];
  expiresAt: string;
  budget: Readonly<Record<string, number>>;
};

export type LegacyMessageInput = {
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

export type LegacyRecoveryEvidence =
  | { kind: "unproven" }
  | { kind: "predecessor-terminal"; agentId: string; providerSessionRef: string }
  | { kind: "os-isolated"; proofRef: string }
  | { kind: "patch-only"; serialApplierRef: string };

export type LegacyTaskResult = {
  taskId: string;
  ownerAgentId: string | null;
  state: "blocked" | "ready" | "active" | "complete" | "cancelled" | "degraded";
  revision: number;
  ownerLeaseGeneration: number;
  proposedOwnerAgentId: string | null;
  dependencies: readonly string[];
};

export type LegacyLeaseResult = {
  leaseId: string;
  holderAgentId: string;
  generation: number;
  status: "active" | "quarantined";
  scope: readonly string[];
};

export type LegacyReceiptResult = { relativePath: string; schemaVersion: 1 | 2; sha256: string };
export type LegacyObserverEvent = {
  cursor: number;
  eventId: string;
  type: string;
  actorAgentId: string | null;
  createdAt: number;
  summary: string;
};
export type LegacyLifecycleCheckpoint = {
  relativePath: string;
  sha256: string;
  mailboxWatermark: number;
  acknowledgedAboveWatermark: readonly number[];
  inFlightChildren: readonly string[];
  openWork: readonly string[];
  nextAction: string;
  providerResumeReference: string;
};
export type LegacyLifecycleResult = {
  agentId: string;
  lifecycle: string;
  providerSessionGeneration: number;
  rotation?: { kind: "in-place" | "replacement-session"; priorResumeReference: string };
};
export type LegacyProviderActionResult = {
  actionId: string;
  status: "prepared" | "dispatched" | "accepted" | "terminal" | "ambiguous" | "quarantined";
  history: readonly string[];
  executionCount: number;
  effectCount: number;
  result?: JsonValue;
};
export type LegacyTeamCreateInput =
  | {
      teamId: string;
      parentTeamId?: string;
      leader: { agentId: string; authority: LegacyAuthorityInput };
      rootTask: { taskId: string; objective: string; baseRevision: string };
      initialMembers: readonly { agentId: string; authority: LegacyAuthorityInput }[];
      discussionGroups: readonly { groupId: string; memberAgentIds: readonly string[] }[];
      reservedBudget: Readonly<Record<string, number>>;
      commandId: string;
    }
  | {
      teamId: string;
      parentTeamId?: string;
      leaderAgentId: string;
      rootTaskId: string;
      ownedTaskIds?: readonly string[];
      memberAgentIds?: readonly string[];
      initialMemberAgentIds?: readonly string[];
      authorityId?: string;
      budget?: Readonly<Record<string, number>>;
      reservedBudget?: Readonly<Record<string, number>>;
      discussionGroups?: readonly { groupId: string; memberAgentIds: readonly string[] }[];
      commandId: string;
    };
export type LegacyTeamResult = {
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
  leader?: { agentId: string; authorityId: string; capability: string };
  rootTask?: LegacyTaskResult;
  initialMemberAgentIds?: readonly string[];
  discussionGroups: readonly { groupId: string; memberAgentIds: readonly string[] }[];
  reservedBudget: Readonly<Record<string, number>>;
};
export type LegacyBudgetResult = {
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
  [FABRIC_OPERATIONS.delegateAuthority]: { parentAuthorityId: string; authority: LegacyAuthorityInput; commandId?: string };
  [FABRIC_OPERATIONS.registerAgent]: { agentId: string; authorityId: string; providerSessionRef?: string; adapterId?: string };
  [FABRIC_OPERATIONS.spawnAgent]: { agentId: string; authorityId: string; adapterId: string; actionId: string; payload: Readonly<Record<string, JsonValue>> };
  [FABRIC_OPERATIONS.attachAgent]: { agentId: string; authorityId: string; adapterId: string; actionId: string; providerSessionRef: string };
  [FABRIC_OPERATIONS.sendMessage]: LegacyMessageInput;
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
    humanGates?: readonly string[];
    objective: string;
    baseRevision: string;
    commandId: string;
  };
  [FABRIC_OPERATIONS.claimTask]: { taskId: string; expectedRevision: number; commandId: string };
  [FABRIC_OPERATIONS.refreshTaskReadiness]: { taskId: string; expectedRevision: number; commandId: string };
  [FABRIC_OPERATIONS.recordObjectiveCheck]: { taskId: string; checkId: string; status: "pass" | "fail"; evidence: string; commandId: string };
  [FABRIC_OPERATIONS.resolveHumanGate]: { taskId: string; gateId: string; status: "approved" | "rejected"; evidence: string; commandId: string };
  [FABRIC_OPERATIONS.acknowledgeTaskHandoff]: { taskId: string; taskRevision: number; ownerLeaseGeneration: number; commandId: string };
  [FABRIC_OPERATIONS.getTask]: { taskId: string };
  [FABRIC_OPERATIONS.updateTask]: { taskId: string; expectedRevision: number; state: "complete" | "cancelled" | "degraded"; commandId: string };
  [FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof]: { taskId: string; ownerLeaseGeneration: number; kind: "predecessor-terminal" | "os-isolated" | "patch-only"; detail: Readonly<Record<string, string>>; commandId: string };
  [FABRIC_OPERATIONS.recoverTaskOwner]: { taskId: string; expectedRevision: number; expectedOwnerLeaseGeneration: number; successorAgentId: string; proofId: string; commandId: string };
  [FABRIC_OPERATIONS.recordRevocationProof]: { leaseId: string; generation: number; kind: "predecessor-terminal" | "os-isolated" | "patch-only"; detail: Readonly<Record<string, string>>; commandId: string };
  [FABRIC_OPERATIONS.revokeCapability]: { agentId: string; commandId: string };
  [FABRIC_OPERATIONS.rotateCapability]: { agentId: string; expectedPrincipalGeneration: number; commandId: string };
  [FABRIC_OPERATIONS.acquireWriteLease]: { scope: readonly string[]; ttlMs: number; commandId: string };
  [FABRIC_OPERATIONS.recoverWriteLease]: { leaseId: string; expectedGeneration: number; commandId: string; evidence: LegacyRecoveryEvidence };
  [FABRIC_OPERATIONS.renewWriteLease]: { leaseId: string; expectedGeneration: number; ttlMs: number; commandId: string };
  [FABRIC_OPERATIONS.getWriteLease]: { leaseId: string };
  [FABRIC_OPERATIONS.releaseWriteLease]: { leaseId: string; expectedGeneration: number; commandId: string };
  [FABRIC_OPERATIONS.requestLifecycle]: { action: "compact" | "rotate" | "completion-ready" | "release"; agentId: string; taskId: string; taskRevision: number; checkpoint: LegacyLifecycleCheckpoint; commandId: string };
  [FABRIC_OPERATIONS.getAgentLifecycle]: { agentId: string };
  [FABRIC_OPERATIONS.reportProviderState]: { agentId: string; providerSessionGeneration: number; contextRevision: string; checkpointSha256?: string; commandId: string };
  [FABRIC_OPERATIONS.dispatchProviderAction]: { adapterId: string; actionId: string; operation: "send_turn" | "wakeup" | "release" | "steer"; payload: Readonly<Record<string, JsonValue>>; commandId: string };
  [FABRIC_OPERATIONS.reconcileProviderAction]: { actionId: string; commandId: string };
  [FABRIC_OPERATIONS.getProviderAction]: { actionId: string };
  [FABRIC_OPERATIONS.recordOperatorIntervention]: { source: "fabric" | "integration"; directInputProvenance: "complete" | "partial" | "unavailable"; taskRevision: number; summary: string; commandId: string };
  [FABRIC_OPERATIONS.recordVisibilityFailure]: { kind: "herdr-telemetry" | "observer-pane" | "interactive-tui"; agentId: string; commandId: string };
  [FABRIC_OPERATIONS.createTeam]: LegacyTeamCreateInput;
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
  [FABRIC_OPERATIONS.spawnAgent]: { capability: string; providerSessionRef: string; adapterId: string; actionId: string };
  [FABRIC_OPERATIONS.attachAgent]: { capability: string; providerSessionRef: string; adapterId: string; actionId: string };
  [FABRIC_OPERATIONS.sendMessage]: { messageId: string };
  [FABRIC_OPERATIONS.createDiscussionGroup]: { groupId: string; memberAgentIds: readonly string[] };
  [FABRIC_OPERATIONS.receiveMessages]: readonly { deliveryId: string; messageId: string; sequence: number; body: string; attempt: number; senderId: string; kind: LegacyMessageInput["kind"]; requiresAck: boolean }[];
  [FABRIC_OPERATIONS.acknowledgeDelivery]: null;
  [FABRIC_OPERATIONS.abandonDelivery]: { deliveryId: string; status: "abandoned"; reason: string };
  [FABRIC_OPERATIONS.getMailboxState]: { contiguousWatermark: number; acknowledgedAboveWatermark: readonly number[] };
  [FABRIC_OPERATIONS.createTask]: LegacyTaskResult;
  [FABRIC_OPERATIONS.claimTask]: LegacyTaskResult;
  [FABRIC_OPERATIONS.refreshTaskReadiness]: LegacyTaskResult;
  [FABRIC_OPERATIONS.recordObjectiveCheck]: { taskId: string; checkId: string; status: "pass" | "fail" };
  [FABRIC_OPERATIONS.resolveHumanGate]: { taskId: string; gateId: string; status: "approved" | "rejected" };
  [FABRIC_OPERATIONS.acknowledgeTaskHandoff]: { acknowledged: true };
  [FABRIC_OPERATIONS.getTask]: LegacyTaskResult;
  [FABRIC_OPERATIONS.updateTask]: LegacyTaskResult;
  [FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof]: { proofId: string };
  [FABRIC_OPERATIONS.recoverTaskOwner]: LegacyTaskResult;
  [FABRIC_OPERATIONS.recordRevocationProof]: { proofId: string };
  [FABRIC_OPERATIONS.revokeCapability]: null;
  [FABRIC_OPERATIONS.rotateCapability]: { agentId: string; principalGeneration: number; capability: string };
  [FABRIC_OPERATIONS.acquireWriteLease]: LegacyLeaseResult;
  [FABRIC_OPERATIONS.recoverWriteLease]: LegacyLeaseResult;
  [FABRIC_OPERATIONS.renewWriteLease]: LegacyLeaseResult;
  [FABRIC_OPERATIONS.getWriteLease]: LegacyLeaseResult;
  [FABRIC_OPERATIONS.releaseWriteLease]: { leaseId: string; status: "released"; generation: number };
  [FABRIC_OPERATIONS.requestLifecycle]: LegacyLifecycleResult;
  [FABRIC_OPERATIONS.getAgentLifecycle]: LegacyLifecycleResult;
  [FABRIC_OPERATIONS.reportProviderState]: LegacyLifecycleResult;
  [FABRIC_OPERATIONS.dispatchProviderAction]: LegacyProviderActionResult;
  [FABRIC_OPERATIONS.reconcileProviderAction]: LegacyProviderActionResult;
  [FABRIC_OPERATIONS.getProviderAction]: LegacyProviderActionResult;
  [FABRIC_OPERATIONS.recordOperatorIntervention]: { interventionId: string };
  [FABRIC_OPERATIONS.recordVisibilityFailure]: { visibility: "degraded" | "lost"; providerSession: "healthy" | "lost"; delivery: "active" | "frozen"; recovery?: "reattach-or-rotate" };
  [FABRIC_OPERATIONS.createTeam]: LegacyTeamResult;
  [FABRIC_OPERATIONS.getTeam]: LegacyTeamResult;
  [FABRIC_OPERATIONS.freezeSubtree]: LegacyTeamResult;
  [FABRIC_OPERATIONS.adoptSubtree]: LegacyTeamResult;
  [FABRIC_OPERATIONS.closeSubtreeBarrier]: { teamId: string; generation: number; closed: true };
  [FABRIC_OPERATIONS.reserveBudget]: LegacyBudgetResult;
  [FABRIC_OPERATIONS.recordBudgetUsage]: LegacyBudgetResult;
  [FABRIC_OPERATIONS.reconcileBudgetUsage]: LegacyBudgetResult;
  [FABRIC_OPERATIONS.releaseBudget]: LegacyBudgetResult;
  [FABRIC_OPERATIONS.getBudget]: LegacyBudgetResult;
  [FABRIC_OPERATIONS.publishArtifact]: { artifactId: string; relativePath: string; sha256: string };
  [FABRIC_OPERATIONS.closeBarrier]: { scope: "run" | "stage"; closed: true; receipt: LegacyReceiptResult };
  [FABRIC_OPERATIONS.getRunStatus]: { runId: string; chairAgentId: string; barrier: { state: "open" | "closed" }; counts: { agents: number; tasks: number; tasksTerminal: number; messages: number; deliveriesUnacknowledged: number; leasesActive: number } };
  [FABRIC_OPERATIONS.observeEvents]: { events: readonly LegacyObserverEvent[]; nextCursor: number };
  [FABRIC_OPERATIONS.listTasks]: { tasks: readonly LegacyTaskResult[] };
  [FABRIC_OPERATIONS.listAgents]: { agents: readonly { agentId: string; parentAgentId: string | null; lifecycle: string }[] };
  [FABRIC_OPERATIONS.listReceipts]: { receipts: readonly { relativePath: string; sha256: string; exportedAt: number }[] };
  [FABRIC_OPERATIONS.exportReceipt]: LegacyReceiptResult;
};

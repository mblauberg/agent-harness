import type { AuthorityInput } from "../domain/types.js";

export type RunCreation = {
  runId: string;
  workspaceRoot?: string;
  projectRunDirectory?: string;
  chair: { agentId: string; authority: AuthorityInput };
};

export type LeaseResult = {
  leaseId: string;
  holderAgentId: string;
  generation: number;
  status: "active" | "quarantined";
  scope: string[];
};

export type AuthorityResult = { authorityId: string };

export type TaskResult = {
  taskId: string;
  ownerAgentId: string | null;
  state: "blocked" | "ready" | "active" | "complete" | "cancelled" | "degraded";
  revision: number;
  ownerLeaseGeneration: number;
  proposedOwnerAgentId: string | null;
  dependencies: string[];
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
export type EventsAfterResult = {
  events: ObserverEvent[];
  nextCursor: number;
};
export type ProofResult = { proofId: string };
export type RevocationResult = { revoked: true };
export type CapabilityRotationResult = { agentId: string; principalGeneration: number; capability: string };
export type ArtifactResult = { artifactId: string; relativePath: string; sha256: string };
export type BarrierResult = { scope: "run" | "stage"; closed: true; receipt: ReceiptResult };
export type LifecycleCheckpoint = {
  relativePath: string;
  sha256: string;
  mailboxWatermark: number;
  acknowledgedAboveWatermark: number[];
  inFlightChildren: string[];
  openWork: string[];
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
  history: string[];
  executionCount: number;
  effectCount: number;
  result?: unknown;
};
export type InterventionResult = { interventionId: string };
export type DiscussionGroupInput = { groupId: string; memberAgentIds: string[] };
export type TeamResult = {
  teamId: string;
  parentTeamId: string | null;
  depth: number;
  leaderAgentId: string;
  rootTaskId: string;
  ownedTaskIds: string[];
  memberAgentIds: string[];
  budgetId: string;
  state: "active" | "frozen" | "barrier-closed";
  generation: number;
  successorAgentId: string | null;
  leader?: { agentId: string; authorityId: string };
  rootTask?: TaskResult;
  initialMemberAgentIds?: string[];
  discussionGroups: DiscussionGroupInput[];
  reservedBudget: Record<string, number>;
};
export type BudgetDimensionResult = {
  granted: number;
  reserved: number;
  consumed: number;
  available: number;
  usageUnknown: boolean;
};
export type BudgetResult = {
  budgetId: string;
  parentBudgetId: string | null;
  state: "active" | "usage-unknown" | "released";
  dimensions: Record<string, BudgetDimensionResult>;
  returned: Record<string, number>;
};
export type AtomicTeamCreateInput = {
  teamId: string;
  parentTeamId?: string;
  leader: { agentId: string; authority: AuthorityInput };
  rootTask: { taskId: string; objective: string; baseRevision: string };
  initialMembers: Array<{ agentId: string; authority: AuthorityInput }>;
  discussionGroups: DiscussionGroupInput[];
  reservedBudget: Record<string, number>;
  commandId: string;
};
export type ExistingTeamCreateInput = {
  teamId: string;
  parentTeamId?: string;
  leaderAgentId: string;
  rootTaskId: string;
  ownedTaskIds?: string[];
  memberAgentIds?: string[];
  initialMemberAgentIds?: string[];
  authorityId?: string;
  budget?: Record<string, number>;
  reservedBudget?: Record<string, number>;
  discussionGroups?: DiscussionGroupInput[];
  commandId: string;
};
export type TeamCreateInput = AtomicTeamCreateInput | ExistingTeamCreateInput;

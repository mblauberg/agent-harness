import type { LegacyAuthorityInput } from "./baseline-contracts.js";
import type { ChairMutationContext } from "./operator.js";
import type {
  AgentId,
  ArtifactRef,
  CoordinationRunId,
  ProjectSessionId,
  Sha256Digest,
  TaskId,
} from "./primitives.js";

export type WorkstreamAgentDefinition = Readonly<{
  agentId: AgentId;
  authority: LegacyAuthorityInput;
}>;

export type WorkstreamCreateRequest = Readonly<{
  command: ChairMutationContext;
  expectedSessionGeneration: number;
  expectedMembershipRevision: number;
  workstreamId: string;
  deliveryRunId: string;
  launchPacketRef: ArtifactRef;
  team: Readonly<{
    teamId: string;
    leader: WorkstreamAgentDefinition;
    rootTask: Readonly<{ taskId: TaskId; objective: string; baseRevision: string }>;
    initialMembers: readonly WorkstreamAgentDefinition[];
    discussionGroups: readonly Readonly<{ groupId: string; memberAgentIds: readonly AgentId[] }>[];
    reservedBudget: Readonly<Record<string, number>>;
  }>;
  resources: Readonly<{
    runScopeId: string;
    teamScopeId: string;
    teamLimits: Readonly<Record<string, number>>;
    agentScopes: readonly Readonly<{
      agentId: AgentId;
      scopeId: string;
      limits: Readonly<Record<string, number>>;
    }>[];
  }>;
}>;

export type WorkstreamSettleRequest = Readonly<{
  command: ChairMutationContext;
  expectedSessionGeneration: number;
  expectedMembershipRevision: number;
  workstreamId: string;
  expectedWorkstreamRevision: number;
  expectedRootTaskRevision: number;
  expectedTeamGeneration: number;
}>;

export type WorkstreamProjection = Readonly<{
  workstreamId: string;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  deliveryRunId: string;
  teamId: string;
  rootTaskId: TaskId;
  leadAgentId: AgentId;
  authorityId: string;
  budgetId: string;
  teamScopeId: string;
  state: "active" | "complete" | "cancelled" | "degraded";
  revision: number;
  membershipRevision: number;
}>;

export function assertWorkstreamCreateSemantics(value: WorkstreamCreateRequest): WorkstreamCreateRequest {
  const members = [value.team.leader, ...value.team.initialMembers];
  const agentIds = members.map((member) => member.agentId);
  if (new Set(agentIds).size !== agentIds.length) {
    throw new TypeError("workstream team agent IDs must be unique");
  }
  if (value.team.initialMembers.length > 5) {
    throw new TypeError("workstream team exceeds five initial members");
  }
  const scopedAgents = value.resources.agentScopes.map((scope) => scope.agentId);
  const scopeIds = value.resources.agentScopes.map((scope) => scope.scopeId);
  if (
    scopedAgents.length !== agentIds.length ||
    new Set(scopedAgents).size !== scopedAgents.length ||
    [...scopedAgents].sort().join("\0") !== [...agentIds].sort().join("\0") ||
    new Set(scopeIds).size !== scopeIds.length
  ) {
    throw new TypeError("workstream resource agent scopes must map one-to-one to exactly the team agents");
  }
  const groups = new Set<string>();
  for (const group of value.team.discussionGroups) {
    if (groups.has(group.groupId)) throw new TypeError("workstream discussion group IDs must be unique");
    groups.add(group.groupId);
    if (group.memberAgentIds.some((agentId) => !agentIds.includes(agentId))) {
      throw new TypeError("workstream discussion group cannot name a non-team agent");
    }
  }
  const teamUnits = Object.keys(value.resources.teamLimits);
  if (teamUnits.length === 0 || Object.keys(value.team.reservedBudget).length === 0) {
    throw new TypeError("workstream budgets and resource limits must be non-empty");
  }
  for (const [unit, reserved] of Object.entries(value.team.reservedBudget)) {
    if (value.resources.teamLimits[unit] === undefined || reserved > value.resources.teamLimits[unit]) {
      throw new TypeError(`workstream team budget widens resource limit ${unit}`);
    }
  }
  for (const scope of value.resources.agentScopes) {
    if (Object.keys(scope.limits).length === 0) throw new TypeError("workstream agent resource limits must be non-empty");
    for (const [unit, limit] of Object.entries(scope.limits)) {
      if (value.resources.teamLimits[unit] === undefined || limit > value.resources.teamLimits[unit]) {
        throw new TypeError(`workstream agent resource scope widens ${unit}`);
      }
    }
  }
  return value;
}

export type ChairLiveHandoffIntent = Readonly<{
  kind: "chair-live-handoff";
  schemaVersion: 1;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  handoffRef: ArtifactRef;
  predecessorAgentId: AgentId;
  successorAgentId: AgentId;
  successorAuthorityId: string;
  successorAuthorityDigest: Sha256Digest;
  expectedSessionRevision: number;
  expectedSessionGeneration: number;
  expectedMembershipRevision: number;
  expectedRunRevision: number;
  expectedChairGeneration: number;
  expectedChairLeaseId: string;
  expectedBridgeRevision: number;
  expectedChairBridgeGeneration: number;
  expectedPredecessorPrincipalGeneration: number;
  expectedSuccessorPrincipalGeneration: number;
  expectedSuccessorBridgeRevision: number;
  expectedSuccessorBridgeGeneration: number;
  providerAdapterId: string;
  providerContractDigest: Sha256Digest;
}>;

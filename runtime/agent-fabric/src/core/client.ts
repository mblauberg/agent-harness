import { FABRIC_OPERATIONS, type FabricOperation } from "../domain/operations.js";
import type {
  AgentCustodyResult,
  EvidenceArtifactRegistration,
  EvidencePublishRequest,
} from "@local/agent-fabric-protocol";
import type { AuthorityInput, MessageInput, RecoveryEvidence } from "../domain/types.js";
import { FabricError } from "../errors.js";
import type {
  ArtifactResult,
  AuthorityResult,
  BarrierResult,
  BudgetResult,
  CapabilityRotationResult,
  InterventionResult,
  EventsAfterResult,
  LeaseResult,
  LifecycleCheckpoint,
  LifecycleResult,
  ProofResult,
  ProviderActionResult,
  ReceiptResult,
  TaskResult,
  TeamCreateInput,
  TeamResult,
} from "./contracts.js";
import type { Fabric } from "./fabric.js";

export class FabricClient {
  readonly #fabric: Fabric;
  readonly #runId: string;
  readonly #agentId: string;
  readonly #tokenHash: string;

  constructor(fabric: Fabric, runId: string, agentId: string, tokenHash: string) {
    this.#fabric = fabric;
    this.#runId = runId;
    this.#agentId = agentId;
    this.#tokenHash = tokenHash;
  }

  #authorise(requiredOperation: FabricOperation): void {
    this.#fabric.assertCapability(this.#runId, this.#agentId, this.#tokenHash, requiredOperation);
  }

  async delegateAuthority(input: {
    parentAuthorityId: string;
    authority: AuthorityInput;
    commandId?: string;
  }): Promise<AuthorityResult> {
    this.#authorise(FABRIC_OPERATIONS.delegateAuthority);
    return this.#fabric.delegateAuthority(this.#runId, this.#agentId, input);
  }

  async registerAgent(input: {
    agentId: string;
    authorityId: string;
    providerSessionRef?: string;
    adapterId?: string;
  }): Promise<{ capability: string }> {
    this.#authorise(FABRIC_OPERATIONS.registerAgent);
    return this.#fabric.registerAgent(this.#runId, this.#agentId, input);
  }

  async spawnAgent(input: {
    agentId: string;
    authorityId: string;
    adapterId: string;
    actionId: string;
    payload: Record<string, unknown>;
  }): Promise<AgentCustodyResult> {
    this.#authorise(FABRIC_OPERATIONS.spawnAgent);
    return await this.#fabric.spawnAgent(this.#runId, this.#agentId, input);
  }

  async attachAgent(input: {
    agentId: string;
    authorityId: string;
    adapterId: string;
    actionId: string;
    providerSessionRef: string;
  }): Promise<AgentCustodyResult> {
    this.#authorise(FABRIC_OPERATIONS.attachAgent);
    return await this.#fabric.attachAgent(this.#runId, this.#agentId, input);
  }

  async sendMessage(input: MessageInput): Promise<{ messageId: string }> {
    this.#authorise(FABRIC_OPERATIONS.sendMessage);
    return this.#fabric.sendMessage(this.#runId, this.#agentId, input);
  }

  async createDiscussionGroup(input: {
    groupId: string;
    memberAgentIds: string[];
    teamId?: string;
    commandId: string;
  }): Promise<{ groupId: string; memberAgentIds: string[] }> {
    this.#authorise(FABRIC_OPERATIONS.createDiscussionGroup);
    return this.#fabric.createDiscussionGroup(this.#runId, this.#agentId, input);
  }

  async receiveMessages(input: { limit: number; visibilityTimeoutMs: number }): Promise<
    Array<{
      deliveryId: string;
      messageId: string;
      sequence: number;
      body: string;
      attempt: number;
      senderId: string;
      kind: MessageInput["kind"];
      requiresAck: boolean;
    }>
  > {
    this.#authorise(FABRIC_OPERATIONS.receiveMessages);
    return this.#fabric.receiveMessages(this.#runId, this.#agentId, input);
  }

  async acknowledgeDelivery(input: { deliveryId: string }): Promise<void> {
    this.#authorise(FABRIC_OPERATIONS.acknowledgeDelivery);
    this.#fabric.acknowledgeDelivery(this.#runId, this.#agentId, input.deliveryId);
  }

  async abandonDelivery(input: {
    deliveryId: string;
    reason: string;
    commandId: string;
  }): Promise<{ deliveryId: string; status: "abandoned"; reason: string }> {
    this.#authorise(FABRIC_OPERATIONS.abandonDelivery);
    return this.#fabric.abandonDelivery(this.#runId, this.#agentId, input);
  }

  async getMailboxState(): Promise<{ contiguousWatermark: number; acknowledgedAboveWatermark: number[] }> {
    this.#authorise(FABRIC_OPERATIONS.getMailboxState);
    return this.#fabric.getMailboxState(this.#runId, this.#agentId);
  }

  async eventsAfter(input: { cursor: number; limit: number }): Promise<EventsAfterResult> {
    this.#authorise(FABRIC_OPERATIONS.observeEvents);
    return this.#fabric.eventsAfter(this.#runId, input);
  }

  async createTask(input: {
    taskId: string;
    authorityId: string;
    eligibleAgentIds: string[];
    proposedOwnerAgentId?: string;
    participantAgentIds?: string[];
    dependencies?: string[];
    expectedArtifacts?: string[];
    objectiveChecks?: string[];
    objective: string;
    baseRevision: string;
    commandId: string;
  }): Promise<TaskResult> {
    this.#authorise(FABRIC_OPERATIONS.createTask);
    return this.#fabric.createTask(this.#runId, this.#agentId, input);
  }

  async claimTask(input: { taskId: string; expectedRevision: number; commandId: string }): Promise<TaskResult> {
    this.#authorise(FABRIC_OPERATIONS.claimTask);
    return this.#fabric.claimTask(this.#runId, this.#agentId, input);
  }

  async refreshTaskReadiness(input: {
    taskId: string;
    expectedRevision: number;
    commandId: string;
  }): Promise<TaskResult> {
    this.#authorise(FABRIC_OPERATIONS.refreshTaskReadiness);
    return this.#fabric.refreshTaskReadiness(this.#runId, this.#agentId, input);
  }

  async recordObjectiveCheck(input: {
    taskId: string;
    checkId: string;
    status: "pass" | "fail";
    evidence: string;
    commandId: string;
  }): Promise<{ taskId: string; checkId: string; status: "pass" | "fail" }> {
    this.#authorise(FABRIC_OPERATIONS.recordObjectiveCheck);
    return this.#fabric.recordObjectiveCheck(this.#runId, this.#agentId, input);
  }

  async acknowledgeTaskHandoff(input: {
    taskId: string;
    taskRevision: number;
    ownerLeaseGeneration: number;
    commandId: string;
  }): Promise<{ acknowledged: true }> {
    this.#authorise(FABRIC_OPERATIONS.acknowledgeTaskHandoff);
    return this.#fabric.acknowledgeTaskHandoff(this.#runId, this.#agentId, input);
  }

  async getTask(input: { taskId: string }): Promise<TaskResult> {
    this.#authorise(FABRIC_OPERATIONS.getTask);
    this.#fabric.assertTaskReadable(this.#runId, this.#agentId, input.taskId);
    return this.#fabric.getTask(this.#runId, input.taskId);
  }

  async updateTask(input: {
    taskId: string;
    expectedRevision: number;
    state: "complete" | "cancelled" | "degraded";
    commandId: string;
  }): Promise<TaskResult> {
    this.#authorise(FABRIC_OPERATIONS.updateTask);
    return this.#fabric.updateTask(this.#runId, this.#agentId, input);
  }

  async recordTaskOwnerRecoveryProof(input: {
    taskId: string;
    ownerLeaseGeneration: number;
    kind: "predecessor-terminal" | "os-isolated" | "patch-only";
    detail: Record<string, string>;
    commandId: string;
  }): Promise<ProofResult> {
    this.#authorise(FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof);
    return this.#fabric.recordTaskOwnerRecoveryProof(this.#runId, this.#agentId, input);
  }

  async recoverTaskOwner(input: {
    taskId: string;
    expectedRevision: number;
    expectedOwnerLeaseGeneration: number;
    successorAgentId: string;
    proofId: string;
    commandId: string;
  }): Promise<TaskResult> {
    this.#authorise(FABRIC_OPERATIONS.recoverTaskOwner);
    return this.#fabric.recoverTaskOwner(this.#runId, this.#agentId, input);
  }

  async recordRevocationProof(input: {
    leaseId: string;
    generation: number;
    kind: "predecessor-terminal" | "os-isolated" | "patch-only";
    detail: Record<string, string>;
    commandId: string;
  }): Promise<ProofResult> {
    this.#authorise(FABRIC_OPERATIONS.recordRevocationProof);
    return this.#fabric.recordRevocationProof(this.#runId, this.#agentId, input);
  }

  async revokeCapability(input: { agentId: string; commandId: string }): Promise<void> {
    this.#authorise(FABRIC_OPERATIONS.revokeCapability);
    this.#fabric.revokeCapability(this.#runId, this.#agentId, input);
  }

  async rotateCapability(input: { agentId: string; expectedPrincipalGeneration: number; commandId: string }): Promise<CapabilityRotationResult> {
    this.#authorise(FABRIC_OPERATIONS.rotateCapability);
    return this.#fabric.rotateCapability(this.#runId, this.#agentId, input);
  }

  async acquireWriteLease(input: { scope: string[]; ttlMs: number; commandId: string; taskId?: string }): Promise<LeaseResult> {
    this.#authorise(FABRIC_OPERATIONS.acquireWriteLease);
    return this.#fabric.acquireWriteLease(this.#runId, this.#agentId, input);
  }

  async recoverWriteLease(input: {
    leaseId: string;
    expectedGeneration: number;
    commandId: string;
    evidence: RecoveryEvidence;
  }): Promise<LeaseResult> {
    this.#authorise(FABRIC_OPERATIONS.recoverWriteLease);
    return this.#fabric.recoverWriteLease(this.#runId, this.#agentId, input);
  }

  async renewWriteLease(input: {
    leaseId: string;
    expectedGeneration: number;
    ttlMs: number;
    commandId: string;
  }): Promise<LeaseResult> {
    this.#authorise(FABRIC_OPERATIONS.renewWriteLease);
    return this.#fabric.renewWriteLease(this.#runId, this.#agentId, input);
  }

  async getWriteLease(input: { leaseId: string }): Promise<LeaseResult> {
    this.#authorise(FABRIC_OPERATIONS.getWriteLease);
    this.#fabric.assertWriteLeaseReadable(this.#runId, this.#agentId, input.leaseId);
    return this.#fabric.getWriteLease(this.#runId, input.leaseId);
  }

  async releaseWriteLease(input: {
    leaseId: string;
    expectedGeneration: number;
    commandId: string;
  }): Promise<{ leaseId: string; status: "released"; generation: number }> {
    this.#authorise(FABRIC_OPERATIONS.releaseWriteLease);
    return this.#fabric.releaseWriteLease(this.#runId, this.#agentId, input);
  }

  async requestLifecycle(input: {
    action: "compact" | "rotate" | "completion-ready" | "release";
    agentId: string;
    taskId: string;
    taskRevision: number;
    checkpoint: LifecycleCheckpoint;
    commandId: string;
  }): Promise<LifecycleResult> {
    this.#fabric.assertCapability(
      this.#runId,
      this.#agentId,
      this.#tokenHash,
      FABRIC_OPERATIONS.requestLifecycle,
      input.action === "rotate",
    );
    return await this.#fabric.requestLifecycle(this.#runId, this.#agentId, input);
  }

  async getAgentLifecycle(input: { agentId: string }): Promise<LifecycleResult> {
    this.#authorise(FABRIC_OPERATIONS.getAgentLifecycle);
    this.#fabric.assertAgentReadable(this.#runId, this.#agentId, input.agentId);
    return this.#fabric.getAgentLifecycle(this.#runId, input.agentId);
  }

  async reportProviderState(input: {
    agentId: string;
    providerSessionGeneration: number;
    contextRevision: string;
    checkpointSha256?: string;
    commandId: string;
  }): Promise<LifecycleResult> {
    this.#authorise(FABRIC_OPERATIONS.reportProviderState);
    return this.#fabric.reportProviderState(this.#runId, this.#agentId, input);
  }

  async dispatchProviderAction(input: {
    adapterId: string;
    actionId: string;
    operation: "spawn" | "send_turn" | "wakeup" | "release" | "steer";
    authorityId?: string;
    payload: Record<string, unknown>;
    commandId: string;
  }): Promise<ProviderActionResult> {
    this.#authorise(FABRIC_OPERATIONS.dispatchProviderAction);
    return await this.#fabric.dispatchProviderAction(this.#runId, this.#agentId, input);
  }

  async reconcileProviderAction(input: { actionId: string; commandId: string }): Promise<ProviderActionResult> {
    this.#authorise(FABRIC_OPERATIONS.reconcileProviderAction);
    return await this.#fabric.reconcileProviderAction(this.#runId, this.#agentId, input);
  }

  async getProviderAction(input: { actionId: string }): Promise<ProviderActionResult> {
    this.#authorise(FABRIC_OPERATIONS.getProviderAction);
    this.#fabric.assertProviderActionReadable(this.#runId, this.#agentId);
    return this.#fabric.getProviderAction(this.#runId, input.actionId);
  }

  async recordOperatorIntervention(input: {
    source: "fabric" | "integration";
    directInputProvenance: "complete" | "partial" | "unavailable";
    taskRevision: number;
    summary: string;
    commandId: string;
  }): Promise<InterventionResult> {
    this.#authorise(FABRIC_OPERATIONS.recordOperatorIntervention);
    return this.#fabric.recordOperatorIntervention(this.#runId, this.#agentId, input);
  }

  async recordVisibilityFailure(input: {
    kind: "herdr-telemetry" | "observer-pane" | "interactive-tui";
    agentId: string;
    commandId: string;
  }): Promise<{ visibility: "degraded" | "lost"; providerSession: "healthy" | "lost"; delivery: "active" | "frozen"; recovery?: "reattach-or-rotate" }> {
    this.#authorise(FABRIC_OPERATIONS.recordVisibilityFailure);
    return this.#fabric.recordVisibilityFailure(this.#runId, this.#agentId, input);
  }

  async createTeam(input: TeamCreateInput): Promise<TeamResult> {
    this.#authorise(FABRIC_OPERATIONS.createTeam);
    return this.#fabric.createTeam(this.#runId, this.#agentId, input);
  }

  async getTeam(input: { teamId: string }): Promise<TeamResult> {
    this.#authorise(FABRIC_OPERATIONS.getTeam);
    this.#fabric.assertTeamReadable(this.#runId, this.#agentId, input.teamId);
    return this.#fabric.getTeam(this.#runId, input.teamId);
  }

  async freezeSubtree(input: {
    teamId: string;
    expectedGeneration: number;
    reason: string;
    commandId: string;
  }): Promise<TeamResult> {
    this.#authorise(FABRIC_OPERATIONS.freezeSubtree);
    return this.#fabric.freezeSubtree(this.#runId, this.#agentId, input);
  }

  async adoptSubtree(input: {
    teamId: string;
    successorAgentId: string;
    expectedGeneration: number;
    handoffEvidence: string;
    commandId: string;
  }): Promise<TeamResult> {
    this.#authorise(FABRIC_OPERATIONS.adoptSubtree);
    return this.#fabric.adoptSubtree(this.#runId, this.#agentId, input);
  }

  async closeSubtreeBarrier(input: {
    teamId: string;
    expectedGeneration: number;
    commandId: string;
  }): Promise<{ teamId: string; generation: number; closed: true }> {
    this.#authorise(FABRIC_OPERATIONS.closeSubtreeBarrier);
    return this.#fabric.closeSubtreeBarrier(this.#runId, this.#agentId, input);
  }

  async reserveBudget(input: {
    teamId: string;
    expectedTeamGeneration: number;
    parentBudgetId: string;
    budgetId: string;
    dimensions: Record<string, number>;
    commandId: string;
  }): Promise<BudgetResult> {
    this.#authorise(FABRIC_OPERATIONS.reserveBudget);
    return this.#fabric.reserveBudget(this.#runId, this.#agentId, input);
  }

  async recordBudgetUsage(input: {
    budgetId: string;
    usage: Record<string, number | null>;
    commandId: string;
  }): Promise<BudgetResult> {
    this.#authorise(FABRIC_OPERATIONS.recordBudgetUsage);
    return this.#fabric.recordBudgetUsage(this.#runId, this.#agentId, input);
  }

  async reconcileBudgetUsage(input: {
    budgetId: string;
    consumed: Record<string, number>;
    commandId: string;
  }): Promise<BudgetResult> {
    this.#authorise(FABRIC_OPERATIONS.reconcileBudgetUsage);
    return this.#fabric.reconcileBudgetUsage(this.#runId, this.#agentId, input);
  }

  async releaseBudget(input: { budgetId: string; commandId: string }): Promise<BudgetResult> {
    this.#authorise(FABRIC_OPERATIONS.releaseBudget);
    return this.#fabric.releaseBudget(this.#runId, this.#agentId, input);
  }

  async getBudget(input: { budgetId: string }): Promise<BudgetResult> {
    this.#authorise(FABRIC_OPERATIONS.getBudget);
    this.#fabric.assertBudgetReadable(this.#runId, this.#agentId, input.budgetId);
    return this.#fabric.getBudget(this.#runId, input.budgetId);
  }

  async publishArtifact(input: {
    taskId?: string;
    relativePath: string;
    sha256: string;
    commandId: string;
  }): Promise<ArtifactResult> {
    this.#authorise(FABRIC_OPERATIONS.publishArtifact);
    return this.#fabric.publishArtifact(this.#runId, this.#agentId, input);
  }

  async publishEvidence(input: EvidencePublishRequest): Promise<EvidenceArtifactRegistration> {
    this.#authorise(FABRIC_OPERATIONS.evidencePublish);
    return this.#fabric.publishEvidence(this.#runId, this.#agentId, input);
  }

  async closeBarrier(input: {
    scope: "run" | "stage";
    stageId?: string;
    commandId: string;
  }): Promise<BarrierResult> {
    this.#authorise(FABRIC_OPERATIONS.closeBarrier);
    return this.#fabric.closeBarrier(this.#runId, this.#agentId, input);
  }

  async getRunStatus(input: { runId: string }): Promise<ReturnType<Fabric["getRunStatus"]>> {
    this.#authorise(FABRIC_OPERATIONS.getRunStatus);
    return this.#fabric.getRunStatus(this.#runId, input.runId);
  }

  async listTasks(input: { runId: string }): Promise<ReturnType<Fabric["listTasks"]>> {
    this.#authorise(FABRIC_OPERATIONS.listTasks);
    if (input.runId !== this.#runId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "cross-run reads are forbidden");
    }
    return this.#fabric.listTasks(this.#runId, this.#agentId);
  }

  async listAgents(input: { runId: string }): Promise<ReturnType<Fabric["listAgents"]>> {
    this.#authorise(FABRIC_OPERATIONS.listAgents);
    if (input.runId !== this.#runId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "cross-run reads are forbidden");
    }
    return this.#fabric.listAgents(this.#runId, this.#agentId);
  }

  async listReceipts(input: { runId: string }): Promise<ReturnType<Fabric["listReceipts"]>> {
    this.#authorise(FABRIC_OPERATIONS.listReceipts);
    if (input.runId !== this.#runId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "cross-run reads are forbidden");
    }
    return this.#fabric.listReceipts(this.#runId, this.#agentId);
  }

  async exportReceipt(input: { commandId: string }): Promise<ReceiptResult> {
    this.#authorise(FABRIC_OPERATIONS.exportReceipt);
    return this.#fabric.exportReceipt(this.#runId, this.#agentId, input.commandId);
  }
}

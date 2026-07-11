export const FABRIC_OPERATIONS = {
  delegateAuthority: "fabric.v1.authority.delegate",
  registerAgent: "fabric.v1.agent.register",
  spawnAgent: "fabric.v1.agent.spawn",
  attachAgent: "fabric.v1.agent.attach",
  sendMessage: "fabric.v1.message.send",
  createDiscussionGroup: "fabric.v1.discussion-group.create",
  receiveMessages: "fabric.v1.message.receive",
  acknowledgeDelivery: "fabric.v1.delivery.acknowledge",
  abandonDelivery: "fabric.v1.delivery.abandon",
  getMailboxState: "fabric.v1.mailbox.read",
  createTask: "fabric.v1.task.create",
  claimTask: "fabric.v1.task.claim",
  refreshTaskReadiness: "fabric.v1.task.readiness.refresh",
  recordObjectiveCheck: "fabric.v1.task.objective-check.record",
  resolveHumanGate: "fabric.v1.task.human-gate.resolve",
  acknowledgeTaskHandoff: "fabric.v1.task.handoff.acknowledge",
  getTask: "fabric.v1.task.read",
  updateTask: "fabric.v1.task.update",
  recordTaskOwnerRecoveryProof: "fabric.v1.task.owner-recovery-proof.record",
  recoverTaskOwner: "fabric.v1.task.owner.recover",
  recordRevocationProof: "fabric.v1.lease.revocation-proof.record",
  revokeCapability: "fabric.v1.capability.revoke",
  rotateCapability: "fabric.v1.capability.rotate",
  acquireWriteLease: "fabric.v1.write-lease.acquire",
  recoverWriteLease: "fabric.v1.write-lease.recover",
  renewWriteLease: "fabric.v1.write-lease.renew",
  getWriteLease: "fabric.v1.write-lease.read",
  releaseWriteLease: "fabric.v1.write-lease.release",
  requestLifecycle: "fabric.v1.lifecycle.request",
  getAgentLifecycle: "fabric.v1.lifecycle.read",
  reportProviderState: "fabric.v1.provider-state.report",
  dispatchProviderAction: "fabric.v1.provider-action.dispatch",
  reconcileProviderAction: "fabric.v1.provider-action.reconcile",
  getProviderAction: "fabric.v1.provider-action.read",
  recordOperatorIntervention: "fabric.v1.operator-intervention.record",
  recordVisibilityFailure: "fabric.v1.visibility-failure.record",
  createTeam: "fabric.v1.team.create",
  getTeam: "fabric.v1.team.read",
  freezeSubtree: "fabric.v1.subtree.freeze",
  adoptSubtree: "fabric.v1.subtree.adopt",
  closeSubtreeBarrier: "fabric.v1.subtree-barrier.close",
  reserveBudget: "fabric.v1.budget.reserve",
  recordBudgetUsage: "fabric.v1.budget.usage.record",
  reconcileBudgetUsage: "fabric.v1.budget.usage.reconcile",
  releaseBudget: "fabric.v1.budget.release",
  getBudget: "fabric.v1.budget.read",
  publishArtifact: "fabric.v1.artifact.publish",
  closeBarrier: "fabric.v1.barrier.close",
  getRunStatus: "fabric.v1.run-status.read",
  listTasks: "fabric.v1.task.list",
  listAgents: "fabric.v1.agent.list",
  listReceipts: "fabric.v1.receipt.list",
  exportReceipt: "fabric.v1.receipt.export",
} as const satisfies Record<string, `fabric.v1.${string}`>;

export type FabricOperation = (typeof FABRIC_OPERATIONS)[keyof typeof FABRIC_OPERATIONS];

export const LEGACY_AUTHORITY_ACTIONS = ["read", "write", "delegate", "message", "team"] as const;

export type LegacyAuthorityAction = (typeof LEGACY_AUTHORITY_ACTIONS)[number];

export const LEGACY_OPERATION_BUNDLES: Record<LegacyAuthorityAction, readonly FabricOperation[]> = {
  read: [
    FABRIC_OPERATIONS.getMailboxState,
    FABRIC_OPERATIONS.getTask,
    FABRIC_OPERATIONS.getWriteLease,
    FABRIC_OPERATIONS.getAgentLifecycle,
    FABRIC_OPERATIONS.getProviderAction,
    FABRIC_OPERATIONS.getTeam,
    FABRIC_OPERATIONS.getBudget,
    FABRIC_OPERATIONS.getRunStatus,
    FABRIC_OPERATIONS.listTasks,
    FABRIC_OPERATIONS.listAgents,
    FABRIC_OPERATIONS.listReceipts,
    FABRIC_OPERATIONS.exportReceipt,
  ],
  write: [
    FABRIC_OPERATIONS.abandonDelivery,
    FABRIC_OPERATIONS.createTask,
    FABRIC_OPERATIONS.claimTask,
    FABRIC_OPERATIONS.refreshTaskReadiness,
    FABRIC_OPERATIONS.recordObjectiveCheck,
    FABRIC_OPERATIONS.resolveHumanGate,
    FABRIC_OPERATIONS.acknowledgeTaskHandoff,
    FABRIC_OPERATIONS.updateTask,
    FABRIC_OPERATIONS.acquireWriteLease,
    FABRIC_OPERATIONS.recoverWriteLease,
    FABRIC_OPERATIONS.renewWriteLease,
    FABRIC_OPERATIONS.releaseWriteLease,
    FABRIC_OPERATIONS.requestLifecycle,
    FABRIC_OPERATIONS.recordOperatorIntervention,
    FABRIC_OPERATIONS.recordVisibilityFailure,
    FABRIC_OPERATIONS.publishArtifact,
    FABRIC_OPERATIONS.closeBarrier,
  ],
  delegate: [
    FABRIC_OPERATIONS.delegateAuthority,
    FABRIC_OPERATIONS.registerAgent,
    FABRIC_OPERATIONS.spawnAgent,
    FABRIC_OPERATIONS.attachAgent,
    FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof,
    FABRIC_OPERATIONS.recoverTaskOwner,
    FABRIC_OPERATIONS.recordRevocationProof,
    FABRIC_OPERATIONS.revokeCapability,
    FABRIC_OPERATIONS.rotateCapability,
    FABRIC_OPERATIONS.reportProviderState,
    FABRIC_OPERATIONS.dispatchProviderAction,
    FABRIC_OPERATIONS.reconcileProviderAction,
  ],
  message: [
    FABRIC_OPERATIONS.sendMessage,
    FABRIC_OPERATIONS.createDiscussionGroup,
    FABRIC_OPERATIONS.receiveMessages,
    FABRIC_OPERATIONS.acknowledgeDelivery,
  ],
  team: [
    FABRIC_OPERATIONS.createTeam,
    FABRIC_OPERATIONS.freezeSubtree,
    FABRIC_OPERATIONS.adoptSubtree,
    FABRIC_OPERATIONS.closeSubtreeBarrier,
    FABRIC_OPERATIONS.reserveBudget,
    FABRIC_OPERATIONS.recordBudgetUsage,
    FABRIC_OPERATIONS.reconcileBudgetUsage,
    FABRIC_OPERATIONS.releaseBudget,
  ],
};

export const AUTHORITY_ACTION_VOCABULARY: readonly string[] = Object.freeze([
  ...LEGACY_AUTHORITY_ACTIONS,
  ...Object.values(FABRIC_OPERATIONS),
]);

const fabricOperationSet: ReadonlySet<string> = new Set(Object.values(FABRIC_OPERATIONS));
const readOperationSet = new Set<FabricOperation>(LEGACY_OPERATION_BUNDLES.read);

export function isFabricOperation(value: string): value is FabricOperation {
  return fabricOperationSet.has(value);
}

export function isReadFabricOperation(value: FabricOperation): boolean {
  return readOperationSet.has(value);
}

function isLegacyAuthorityAction(value: string): value is LegacyAuthorityAction {
  return LEGACY_AUTHORITY_ACTIONS.some((candidate) => candidate === value);
}

export type AuthorityActionExpansion =
  | { ok: true; operations: FabricOperation[] }
  | { ok: false; unknownActions: string[] };

export function expandAuthorityActions(actions: readonly string[]): AuthorityActionExpansion {
  const operations = new Set<FabricOperation>();
  const unknownActions = new Set<string>();
  for (const action of actions) {
    if (isFabricOperation(action)) {
      operations.add(action);
    } else if (isLegacyAuthorityAction(action)) {
      for (const operation of LEGACY_OPERATION_BUNDLES[action]) operations.add(operation);
    } else {
      unknownActions.add(action);
    }
  }
  if (unknownActions.size > 0) return { ok: false, unknownActions: [...unknownActions].sort() };
  return { ok: true, operations: [...operations].sort() };
}

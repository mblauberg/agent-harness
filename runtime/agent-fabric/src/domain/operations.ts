import {
  FABRIC_OPERATIONS,
  isActiveFabricOperation,
  OPERATION_REGISTRY,
  operationsForPrincipal,
  type FabricOperation,
} from "@local/agent-fabric-protocol";

export { FABRIC_OPERATIONS, OPERATION_REGISTRY, type FabricOperation };

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

export const AGENT_AUTHORITY_OPERATIONS: readonly FabricOperation[] = Object.freeze([
  ...operationsForPrincipal("agent"),
]);

export const AUTHORITY_ACTION_VOCABULARY: readonly string[] = Object.freeze([
  ...LEGACY_AUTHORITY_ACTIONS,
  ...AGENT_AUTHORITY_OPERATIONS,
]);

const readOperationSet = new Set<FabricOperation>(LEGACY_OPERATION_BUNDLES.read);
const agentAuthorityOperationSet = new Set<FabricOperation>(AGENT_AUTHORITY_OPERATIONS);

export function isFabricOperation(value: string): value is FabricOperation {
  return isActiveFabricOperation(value);
}

export function isReadFabricOperation(value: FabricOperation): boolean {
  return readOperationSet.has(value);
}

function isLegacyAuthorityAction(value: string): value is LegacyAuthorityAction {
  return LEGACY_AUTHORITY_ACTIONS.some((candidate) => candidate === value);
}

export function isAgentAuthorityOperation(value: string): value is FabricOperation {
  return isFabricOperation(value) && agentAuthorityOperationSet.has(value);
}

export type AuthorityActionExpansion =
  | { ok: true; operations: FabricOperation[] }
  | { ok: false; unknownActions: string[] };

export function expandAuthorityActions(actions: readonly string[]): AuthorityActionExpansion {
  const operations = new Set<FabricOperation>();
  const unknownActions = new Set<string>();
  for (const action of actions) {
    if (isAgentAuthorityOperation(action)) {
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

import {
  FABRIC_OPERATIONS,
  isActiveFabricOperation,
  isDaemonGrantableOperation,
  OPERATION_REGISTRY,
  operationsForPrincipal,
  type FabricOperation,
} from "@local/agent-fabric-protocol";

export { FABRIC_OPERATIONS, OPERATION_REGISTRY, type FabricOperation };

export const AGENT_AUTHORITY_OPERATIONS: readonly FabricOperation[] = Object.freeze([
  ...operationsForPrincipal("agent"),
].filter(isDaemonGrantableOperation));

export const AUTHORITY_ACTION_VOCABULARY: readonly FabricOperation[] = Object.freeze([
  ...AGENT_AUTHORITY_OPERATIONS,
]);

const readOperationSet = new Set<FabricOperation>([
  FABRIC_OPERATIONS.getMailboxState,
  FABRIC_OPERATIONS.getTask,
  FABRIC_OPERATIONS.getWriteLease,
  FABRIC_OPERATIONS.getAgentLifecycle,
  FABRIC_OPERATIONS.getProviderAction,
  FABRIC_OPERATIONS.getTeam,
  FABRIC_OPERATIONS.getBudget,
  FABRIC_OPERATIONS.whoami,
  FABRIC_OPERATIONS.getRunStatus,
  FABRIC_OPERATIONS.listTasks,
  FABRIC_OPERATIONS.listAgents,
  FABRIC_OPERATIONS.listReceipts,
  FABRIC_OPERATIONS.exportReceipt,
]);
const agentAuthorityOperationSet = new Set<FabricOperation>(AGENT_AUTHORITY_OPERATIONS);

export function isFabricOperation(value: string): value is FabricOperation {
  return isActiveFabricOperation(value);
}

export function isReadFabricOperation(value: FabricOperation): boolean {
  return readOperationSet.has(value);
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
    } else {
      unknownActions.add(action);
    }
  }
  if (unknownActions.size > 0) return { ok: false, unknownActions: [...unknownActions].sort() };
  return { ok: true, operations: [...operations].sort() };
}

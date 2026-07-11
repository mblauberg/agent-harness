import { Fabric, type FabricRuntimeOpenOptions } from "./core/fabric.js";

export { Fabric, FabricClient } from "./core/fabric.js";
export type { FabricOperatorActionPorts, FabricRuntimeOpenOptions } from "./core/fabric.js";
export {
  connectFabricDaemon,
  FabricDaemonClient,
  FabricRemoteError,
  startFabricDaemon,
} from "./daemon/client.js";
export { FabricError } from "./errors.js";
export {
  AUTHORITY_ACTION_VOCABULARY,
  FABRIC_OPERATIONS,
  LEGACY_AUTHORITY_ACTIONS,
  expandAuthorityActions,
} from "./domain/operations.js";
export type { FabricOperation, LegacyAuthorityAction } from "./domain/operations.js";
export { runAdapterConformance } from "./adapters/conformance.js";
export { verifyAdapterCompatibility } from "./adapters/compatibility.js";
export { startOptionalAdapterLeg } from "./adapters/optional-leg.js";
export { assessAdapterModelPolicy, resolveProviderAdapterSelection, validateAdapterModelSelection } from "./adapters/model-selection.js";
export { resolveExecutionProfile, ExecutionProfileError } from "./profiles/execution.js";
export { createVisibilityCoordinator, VisibilityCoordinator } from "./visibility/coordinator.js";
export { resolveModelRouteReceipt } from "./routing/model-route.js";
export { FabricReceiptError, verifyFabricReceiptLink } from "./exports/receipt.js";
export { resolveFabricPaths } from "./cli/paths.js";
export { MESSAGE_POLICY } from "./domain/types.js";
export type * from "./domain/types.js";

export async function openFabric(options: FabricRuntimeOpenOptions): Promise<Fabric> {
  return new Fabric(options);
}

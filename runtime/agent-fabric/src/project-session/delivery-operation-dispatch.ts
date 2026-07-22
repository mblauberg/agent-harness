import {
  FABRIC_OPERATIONS,
  type OperationInputMap,
} from "@local/agent-fabric-protocol";

import type { AuthenticatedAgentContext } from "./contracts.js";
import type { RunPlanStore } from "./run-plan-store.js";
import type { CoordinatedWorkstreamStore } from "./workstream-store.js";

type DeliveryOperation =
  | typeof FABRIC_OPERATIONS.workstreamCreate
  | typeof FABRIC_OPERATIONS.workstreamSettle
  | typeof FABRIC_OPERATIONS.runPlanDeclare;

export function dispatchProjectDeliveryOperation(
  operation: DeliveryOperation,
  context: AuthenticatedAgentContext,
  input: unknown,
  workstreams: CoordinatedWorkstreamStore,
  runPlans: RunPlanStore,
): unknown {
  switch (operation) {
    case FABRIC_OPERATIONS.workstreamCreate:
      return workstreams.create(context, input as OperationInputMap[typeof operation]);
    case FABRIC_OPERATIONS.workstreamSettle:
      return workstreams.settle(context, input as OperationInputMap[typeof operation]);
    case FABRIC_OPERATIONS.runPlanDeclare:
      return runPlans.declare(context, input as OperationInputMap[typeof operation]);
  }
}

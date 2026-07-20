import { ProjectFabricCoreError } from "../project-session/contracts.js";

/** The generic Fabric boundary is intentionally closed to certifying-review dispatch. */
export type ProviderActionDispatchRequest =
  | {
      adapterId: string;
      actionId: string;
      operation: "spawn";
      taskId: string;
      authorityId: string;
      certifyingReview: null;
      payload: Record<string, unknown>;
      commandId: string;
    }
  | {
      adapterId: string;
      actionId: string;
      operation: "send_turn" | "wakeup" | "release" | "steer";
      authorityId?: string;
      certifyingReview: null;
      payload: Record<string, unknown>;
      commandId: string;
    };

export function canonicaliseProviderActionDispatchRequest(
  input: ProviderActionDispatchRequest,
): ProviderActionDispatchRequest {
  if (input.certifyingReview !== null) {
    throw new ProjectFabricCoreError(
      "PROTOCOL_INVALID",
      "certifying review dispatch requires the review evidence daemon owner",
    );
  }
  if ("routeRequest" in input) {
    throw new ProjectFabricCoreError(
      "PROTOCOL_INVALID",
      "provider route requests require the review evidence daemon owner",
    );
  }
  if (input.operation !== "spawn") {
    if ("taskId" in input) {
      throw new ProjectFabricCoreError(
        "PROTOCOL_INVALID",
        "top-level provider task ID is spawn-only",
      );
    }
    return input;
  }
  if (typeof input.taskId !== "string" || input.taskId.length === 0) {
    throw new ProjectFabricCoreError(
      "PROTOCOL_INVALID",
      "ephemeral provider spawn requires an exact top-level task ID",
    );
  }
  const payloadTaskId = input.payload.taskId;
  if (payloadTaskId !== undefined && payloadTaskId !== input.taskId) {
    throw new ProjectFabricCoreError(
      "PROTOCOL_INVALID",
      "provider payload task ID conflicts with the canonical top-level task ID",
    );
  }
  const { taskId: _payloadTaskId, ...payload } = input.payload;
  return { ...input, payload };
}

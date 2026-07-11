import { isRecord } from "../daemon/protocol.js";
import { AdapterProcessTransport } from "./process.js";

type ActionReport = {
  actionId: string;
  status: string;
  executionCount: number;
};

function actionReport(value: unknown): ActionReport {
  if (
    !isRecord(value) ||
    typeof value.actionId !== "string" ||
    typeof value.status !== "string" ||
    typeof value.executionCount !== "number"
  ) {
    throw new Error("adapter returned an invalid action record");
  }
  return { actionId: value.actionId, status: value.status, executionCount: value.executionCount };
}

export async function runAdapterConformance(options: {
  command: string[];
  environment: Record<string, string>;
  action: { actionId: string; operation: string; payload: Record<string, unknown> };
  responseTimeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{
  passed: true;
  protocolVersion: number;
  capabilities: Record<string, unknown>;
  action: ActionReport & { retryMatched: boolean; changedPayloadRejected: boolean };
}> {
  const adapter = new AdapterProcessTransport({
    command: options.command,
    environment: options.environment,
    ...(options.responseTimeoutMs === undefined ? {} : { responseTimeoutMs: options.responseTimeoutMs }),
  });
  const requestOptions = {
    ...(options.responseTimeoutMs === undefined ? {} : { timeoutMs: options.responseTimeoutMs }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
  try {
    const capabilities = await adapter.request("capabilities", {}, requestOptions);
    if (!isRecord(capabilities) || capabilities.protocolVersion !== 1 || capabilities.actionJournal !== true) {
      throw new Error("adapter capability handshake failed");
    }
    const first = actionReport(
      await adapter.request(
        "dispatch",
        {
          actionId: options.action.actionId,
          operation: options.action.operation,
          payload: options.action.payload,
        },
        requestOptions,
      ),
    );
    const retry = actionReport(
      await adapter.request(
        "dispatch",
        {
          actionId: options.action.actionId,
          operation: options.action.operation,
          payload: options.action.payload,
        },
        requestOptions,
      ),
    );
    const lookup = actionReport(
      await adapter.request("lookup_action", { actionId: options.action.actionId }, requestOptions),
    );
    const changedPayloadRejected = await adapter
      .request(
        "dispatch",
        {
          actionId: options.action.actionId,
          operation: options.action.operation,
          payload: { ...options.action.payload, conformanceMutation: true },
        },
        requestOptions,
      )
      .then(
        () => false,
        (error: unknown) => error instanceof Error && error.name === "ACTION_CONFLICT",
      );
    await adapter.request("release", {}, requestOptions);
    return {
      passed: true,
      protocolVersion: 1,
      capabilities,
      action: {
        ...lookup,
        retryMatched:
          first.actionId === retry.actionId &&
          first.status === retry.status &&
          first.executionCount === retry.executionCount,
        changedPayloadRejected,
      },
    };
  } finally {
    await adapter.close();
  }
}

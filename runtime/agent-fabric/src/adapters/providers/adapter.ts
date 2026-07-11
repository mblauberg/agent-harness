import {
  actionPayload,
  isRecord,
  ProviderAdapterError,
  requiredString,
  type AdapterActionRecord,
  type AdapterRequestHandler,
  type ProviderAdapterCapabilities,
} from "./types.js";
import type { SqliteAdapterActionJournal } from "./journal.js";

export type ProviderBoundary = {
  status(input: { resumeReference?: string }): Promise<Record<string, unknown>>;
  spawn(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  attach(input: { resumeReference: string; payload: Record<string, unknown> }): Promise<Record<string, unknown>>;
  sendTurn(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  interrupt(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  release(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  steer?(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  compact?(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
};

type SupportedOperation = "spawn" | "attach" | "send_turn" | "interrupt" | "release" | "steer" | "compact";

function capabilityUnavailable(operation: string): never {
  throw new ProviderAdapterError(
    "CAPABILITY_UNAVAILABLE",
    `adapter does not support ${operation}`,
    { capability: operation },
  );
}

function responseRecord(value: unknown, operation: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", `${operation} returned a non-object response`);
  }
  return value;
}

export function createProviderAdapter(options: {
  capabilities: ProviderAdapterCapabilities;
  boundary: ProviderBoundary;
  journal: SqliteAdapterActionJournal;
}): AdapterRequestHandler {
  const supported = new Set(options.capabilities.operations);

  async function effect(operation: SupportedOperation, actionId: string, payload: Record<string, unknown>): Promise<{
    record: AdapterActionRecord;
    result: Record<string, unknown>;
  }> {
    if (!supported.has(operation)) capabilityUnavailable(operation);
    const prepared = options.journal.prepare(actionId, operation, payload);
    if (!prepared.created) {
      if (prepared.record.status === "terminal" && isRecord(prepared.record.result)) {
        return { record: prepared.record, result: prepared.record.result };
      }
      return {
        record: prepared.record,
        result: isRecord(prepared.record.result) ? prepared.record.result : {},
      };
    }

    options.journal.markDispatched(actionId);
    try {
      let value: Record<string, unknown>;
      switch (operation) {
        case "spawn":
          value = responseRecord(await options.boundary.spawn(payload), operation);
          break;
        case "attach":
          value = responseRecord(
            await options.boundary.attach({
              resumeReference: requiredString(payload.resumeReference, "resumeReference"),
              payload,
            }),
            operation,
          );
          break;
        case "send_turn":
          value = responseRecord(await options.boundary.sendTurn(payload), operation);
          break;
        case "interrupt":
          value = responseRecord(await options.boundary.interrupt(payload), operation);
          break;
        case "release":
          value = responseRecord(await options.boundary.release(payload), operation);
          break;
        case "steer":
          if (options.boundary.steer === undefined) capabilityUnavailable(operation);
          value = responseRecord(await options.boundary.steer(payload), operation);
          break;
        case "compact":
          if (options.boundary.compact === undefined) capabilityUnavailable(operation);
          value = responseRecord(await options.boundary.compact(payload), operation);
          break;
      }
      options.journal.markAccepted(actionId);
      const record = options.journal.markTerminal(actionId, value, false);
      return { record, result: value };
    } catch (error: unknown) {
      const current = options.journal.get(actionId);
      if (current.status === "dispatched") options.journal.markAmbiguous(actionId);
      throw error;
    }
  }

  return {
    async request(method: string, params: Record<string, unknown>): Promise<unknown> {
      if (method === "capabilities") return options.capabilities;
      if (method === "status") {
        return await options.boundary.status({
          ...(typeof params.providerSessionRef === "string"
            ? { resumeReference: params.providerSessionRef }
            : typeof params.resumeReference === "string"
              ? { resumeReference: params.resumeReference }
              : {}),
        });
      }
      if (method === "lookup_action") {
        return options.journal.get(requiredString(params.actionId, "actionId"));
      }
      if (method === "cancel_action") {
        return options.journal.cancel(requiredString(params.actionId, "actionId"));
      }
      if (method === "resume_reference") {
        const resumeReference = params.resumeReference ?? params.providerSessionRef;
        return { resumeReference: requiredString(resumeReference, "resumeReference") };
      }
      if (method === "wakeup" || method === "follow_up" || method === "fork") {
        capabilityUnavailable(method);
      }
      if (method === "dispatch") {
        const operation = requiredString(params.operation, "operation");
        if (
          operation !== "send_turn" &&
          operation !== "steer" &&
          operation !== "interrupt" &&
          operation !== "release" &&
          operation !== "compact"
        ) {
          capabilityUnavailable(operation);
        }
        const executed = await effect(
          operation,
          requiredString(params.actionId, "actionId"),
          actionPayload(params),
        );
        return executed.record;
      }
      if (
        method === "spawn" ||
        method === "attach" ||
        method === "interrupt" ||
        method === "release" ||
        method === "compact"
      ) {
        const payload = actionPayload(params);
        const actionId = params.actionId;
        if (method === "release" && actionId === undefined && Object.keys(payload).length === 0) {
          return { released: true, deleted: false };
        }
        const executed = await effect(method, requiredString(actionId, "actionId"), payload);
        if (executed.record.status !== "terminal") {
          throw new ProviderAdapterError(
            "ACTION_RECONCILIATION_REQUIRED",
            `adapter action ${executed.record.actionId} is ${executed.record.status}; lookup is required before retry`,
            { actionId: executed.record.actionId, status: executed.record.status },
          );
        }
        return executed.result;
      }
      capabilityUnavailable(method);
    },
  };
}

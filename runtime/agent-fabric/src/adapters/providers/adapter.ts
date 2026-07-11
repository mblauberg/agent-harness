import {
  actionPayload,
  chairLaunchChallengeDigest,
  isRecord,
  parseChairLaunchCapability,
  parseChairLaunchContinuityUnprovenEvidence,
  parseChairLaunchProviderResult,
  ProviderAdapterError,
  requiredString,
  type AdapterActionRecord,
  type AdapterRequestHandler,
  type ChairLaunchBoundaryInput,
  type ChairLaunchHandoff,
  type ChairLaunchProviderResult,
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
  launchChair?(input: ChairLaunchBoundaryInput): Promise<ChairLaunchProviderResult>;
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
  chairLaunch?: {
    handoff?: ChairLaunchHandoff;
    validatePayload(payload: Record<string, unknown>): Record<string, unknown>;
  };
}): AdapterRequestHandler {
  const capabilities: ProviderAdapterCapabilities = options.capabilities.chairLaunch === undefined
    ? options.capabilities
    : { ...options.capabilities, chairLaunch: parseChairLaunchCapability(options.capabilities.chairLaunch) };
  const supported = new Set(capabilities.operations);
  let chairLaunchHandoff = options.chairLaunch?.handoff;
  const chairLaunchChallengeDigestValue = chairLaunchHandoff === undefined
    ? undefined
    : chairLaunchChallengeDigest(chairLaunchHandoff.attestationChallenge);
  const liveChairLaunchActions = new Set<string>();
  const liveChairActionBySession = new Map<string, string>();

  function chairLaunchRequest(params: Record<string, unknown>): {
    actionId: string;
    providerContractDigest: string;
    payload: Record<string, unknown>;
  } {
    if (
      Object.keys(params).length !== 4 ||
      !Object.hasOwn(params, "schemaVersion") ||
      !Object.hasOwn(params, "actionId") ||
      !Object.hasOwn(params, "providerContractDigest") ||
      !Object.hasOwn(params, "payload")
    ) {
      throw new ProviderAdapterError("INVALID_PARAMS", "chair launch request does not match its closed schema");
    }
    if (params.schemaVersion !== 1) {
      throw new ProviderAdapterError("INVALID_PARAMS", "chair launch schemaVersion must be 1");
    }
    const providerContractDigest = requiredString(params.providerContractDigest, "providerContractDigest");
    if (!/^sha256:[0-9a-f]{64}$/u.test(providerContractDigest)) {
      throw new ProviderAdapterError("INVALID_PARAMS", "providerContractDigest must be a sha256 digest");
    }
    if (!isRecord(params.payload)) {
      throw new ProviderAdapterError("INVALID_PARAMS", "chair launch payload must be an object");
    }
    if (options.chairLaunch === undefined) capabilityUnavailable("launch_chair");
    return {
      actionId: requiredString(params.actionId, "actionId"),
      providerContractDigest,
      payload: options.chairLaunch.validatePayload(params.payload),
    };
  }

  function containsPrivateValue(value: unknown, privateValues: readonly string[]): boolean {
    if (typeof value === "string") return privateValues.some((candidate) => value.includes(candidate));
    if (Array.isArray(value)) return value.some((entry) => containsPrivateValue(entry, privateValues));
    return isRecord(value) && Object.values(value).some((entry) => containsPrivateValue(entry, privateValues));
  }

  async function launchChair(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!supported.has("launch_chair") || options.boundary.launchChair === undefined) {
      capabilityUnavailable("launch_chair");
    }
    const request = chairLaunchRequest(params);
    const attestationBinding = (): {
      providerAdapterId: string;
      providerActionId: string;
      providerContractDigest: string;
      challengeDigest: string;
    } => {
      if (chairLaunchChallengeDigestValue === undefined) {
        throw new ProviderAdapterError("CHAIR_BRIDGE_LOST", "chair launch challenge is no longer available");
      }
      return {
        providerAdapterId: capabilities.adapterId,
        providerActionId: request.actionId,
        providerContractDigest: request.providerContractDigest,
        challengeDigest: chairLaunchChallengeDigestValue,
      };
    };
    const journalPayload = {
      schemaVersion: 1,
      providerContractDigest: request.providerContractDigest,
      payload: request.payload,
    };
    function replayOrConsumed(record: AdapterActionRecord): ChairLaunchProviderResult {
      if (
        record.status === "terminal" &&
        record.idempotencyProven &&
        liveChairLaunchActions.has(request.actionId)
      ) {
        return parseChairLaunchProviderResult(record.result, attestationBinding());
      }
      if (record.status === "terminal" && record.idempotencyProven) {
        throw new ProviderAdapterError(
          "CHAIR_BRIDGE_LOST",
          "chair launch result is durable but its volatile provider bridge is unavailable",
          { actionId: request.actionId },
        );
      }
      throw new ProviderAdapterError(
        "CHAIR_LAUNCH_ALREADY_CONSUMED",
        "chair launch private handoff was already consumed",
        { actionId: request.actionId },
      );
    }
    if (chairLaunchHandoff === undefined) {
      let existing: AdapterActionRecord;
      try {
        existing = options.journal.get(request.actionId);
      } catch (error: unknown) {
        if (error instanceof ProviderAdapterError && error.code === "ACTION_NOT_FOUND") {
          throw new ProviderAdapterError("PRIVATE_HANDOFF_UNAVAILABLE", "chair launch private handoff is unavailable");
        }
        throw error;
      }
      options.journal.prepare(request.actionId, "launch_chair", journalPayload);
      return replayOrConsumed(existing);
    }
    const handoff = chairLaunchHandoff;
    const credentialValues = [handoff.capability, handoff.socketPath];
    const privateInputValues = [...credentialValues, handoff.attestationChallenge];
    if (containsPrivateValue({ actionId: request.actionId, payload: request.payload }, privateInputValues)) {
      throw new ProviderAdapterError("PRIVATE_HANDOFF_DISCLOSED", "chair launch payload contains private handoff material");
    }
    const prepared = options.journal.prepare(request.actionId, "launch_chair", journalPayload);
    if (!prepared.created) {
      chairLaunchHandoff = undefined;
      return replayOrConsumed(prepared.record);
    }
    options.journal.markDispatched(request.actionId);
    chairLaunchHandoff = undefined;
    try {
      const result = parseChairLaunchProviderResult(await options.boundary.launchChair({
        ...request,
        providerAdapterId: capabilities.adapterId,
        challengeDigest: attestationBinding().challengeDigest,
        environment: {
          AGENT_FABRIC_CAPABILITY: handoff.capability,
          AGENT_FABRIC_SOCKET_PATH: handoff.socketPath,
          AGENT_FABRIC_ATTESTATION_CHALLENGE: handoff.attestationChallenge,
        },
      }), attestationBinding());
      if (containsPrivateValue(result, credentialValues)) {
        throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "chair launch result contains private handoff material");
      }
      options.journal.markAccepted(request.actionId);
      options.journal.markTerminal(request.actionId, result, true);
      liveChairLaunchActions.add(request.actionId);
      liveChairActionBySession.set(result.resumeReference, request.actionId);
      return result;
    } catch (error: unknown) {
      let current = options.journal.get(request.actionId);
      if (
        current.status === "dispatched" &&
        error instanceof ProviderAdapterError &&
        error.code === "CHAIR_CONTINUITY_UNPROVEN"
      ) {
        try {
          const evidence = parseChairLaunchContinuityUnprovenEvidence(
            error.details,
            request.providerContractDigest,
          );
          if (containsPrivateValue(evidence, credentialValues)) {
            throw new ProviderAdapterError(
              "PROVIDER_RESPONSE_INVALID",
              "chair launch continuity evidence contains private handoff material",
            );
          }
          options.journal.markAccepted(request.actionId);
          options.journal.markAmbiguous(request.actionId, evidence);
          current = options.journal.get(request.actionId);
        } catch {
          current = options.journal.get(request.actionId);
        }
      }
      if (current.status === "dispatched") options.journal.markAmbiguous(request.actionId);
      throw new ProviderAdapterError(
        "CHAIR_LAUNCH_FAILED",
        "chair launch provider handoff failed",
        { actionId: request.actionId },
      );
    }
  }

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
          if (typeof payload.resumeReference === "string") {
            const launchActionId = liveChairActionBySession.get(payload.resumeReference);
            liveChairActionBySession.delete(payload.resumeReference);
            if (launchActionId !== undefined) liveChairLaunchActions.delete(launchActionId);
          }
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

  function lookupAction(actionId: string): AdapterActionRecord {
    const record = options.journal.get(actionId);
    if (record.operation !== "launch_chair" || record.status !== "terminal") return record;
    if (!isRecord(record.result) || !isRecord(record.result.fabricContinuity)) {
      throw new ProviderAdapterError("JOURNAL_INVALID", "terminal chair launch journal evidence is malformed");
    }
    const continuity = record.result.fabricContinuity;
    if (typeof continuity.providerContractDigest !== "string" || typeof continuity.challengeDigest !== "string") {
      throw new ProviderAdapterError("JOURNAL_INVALID", "terminal chair launch journal binding is malformed");
    }
    return {
      ...record,
      result: parseChairLaunchProviderResult(record.result, {
        providerAdapterId: capabilities.adapterId,
        providerActionId: record.actionId,
        providerContractDigest: continuity.providerContractDigest,
        challengeDigest: continuity.challengeDigest,
      }),
    };
  }

  return {
    async request(method: string, params: Record<string, unknown>): Promise<unknown> {
      if (method === "capabilities") return capabilities;
      if (method === "launch_chair") return await launchChair(params);
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
        return lookupAction(requiredString(params.actionId, "actionId"));
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

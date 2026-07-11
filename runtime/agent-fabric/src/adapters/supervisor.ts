import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

import { AdapterProcessTransport, AdapterTransportError } from "./process.js";
import { assessAdapterModelPolicy } from "./model-selection.js";
import { FabricError } from "../errors.js";
import {
  chairLaunchChallengeDigest,
  parseAgentProvisionProviderResult,
  parseChairLaunchProviderResult,
  ProviderAdapterError,
  type AgentBridgeHandoff,
  type AgentProvisionProviderResult,
  type ChairLaunchHandoff,
  type ChairLaunchProviderResult,
} from "./providers/types.js";

export type AdapterProcessDefinition = {
  command: string[];
  environment: Record<string, string>;
  modelPolicy?: { allowedFamilies: string[]; allowedModelPatterns: string[]; requiresExplicitModel: boolean };
};

export type AdapterSupervisorOptions = {
  controlTimeoutMs?: number;
  providerTurnTimeoutMs?: number;
};

export type AdapterChairLaunchRequest = {
  schemaVersion: 1;
  actionId: string;
  providerContractDigest: string;
  payload: Record<string, unknown>;
};

export type AdapterAgentProvisionRequest = {
  schemaVersion: 1;
  runId: string;
  operation: "spawn" | "attach";
  actionId: string;
  targetAgentId: string;
  authorityId: string;
  bridgeGeneration: number;
  bridgeContractDigest: string;
  payload: Record<string, unknown>;
  providerSessionRef?: string;
};

export type RetainedChildBridge = Readonly<{
  runId: string;
  agentId: string;
  adapterId: string;
  actionId: string;
  providerSessionRef: string;
  providerSessionGeneration: number;
  bridgeGeneration: number;
}>;

const DEFAULT_CONTROL_TIMEOUT_MS = 30_000;
const DEFAULT_PROVIDER_TURN_TIMEOUT_MS = 30 * 60_000;

function isLongProviderOperation(method: string, params: Record<string, unknown>): boolean {
  if (method === "spawn" || method === "compact") return true;
  return method === "dispatch" && (
    params.operation === "send_turn" ||
    params.operation === "steer" ||
    params.operation === "compact"
  );
}

function modelPayload(method: string, params: Record<string, unknown>): Record<string, unknown> | undefined {
  const requires = method === "spawn" || (
    method === "dispatch" && (params.operation === "send_turn" || params.operation === "steer")
  );
  if (!requires) return undefined;
  if (typeof params.payload !== "object" || params.payload === null || Array.isArray(params.payload)) return {};
  return params.payload as Record<string, unknown>;
}

function providerSessionReferences(params: Record<string, unknown>): string[] {
  const references: string[] = [];
  for (const key of ["resumeReference", "providerSessionRef", "threadId"] as const) {
    if (typeof params[key] === "string" && params[key].length > 0) references.push(params[key]);
  }
  if (typeof params.payload === "object" && params.payload !== null && !Array.isArray(params.payload)) {
    references.push(...providerSessionReferences(params.payload as Record<string, unknown>));
  }
  return references;
}

function providerSessionGenerations(params: Record<string, unknown>): unknown[] {
  const generations = Object.hasOwn(params, "providerSessionGeneration")
    ? [params.providerSessionGeneration]
    : [];
  if (typeof params.payload === "object" && params.payload !== null && !Array.isArray(params.payload)) {
    generations.push(...providerSessionGenerations(params.payload as Record<string, unknown>));
  }
  return generations;
}

function chairTransportKey(adapterId: string, providerSessionRef: string): string {
  return `${adapterId}\0${providerSessionRef}`;
}

function chairActionKey(adapterId: string, actionId: string): string {
  return `${adapterId}\0${actionId}`;
}

function isReleaseRequest(method: string, params: Record<string, unknown>): boolean {
  return method === "release" || (method === "dispatch" && params.operation === "release");
}

function isRetainedChairLoss(error: unknown, transport: AdapterProcessTransport): boolean {
  return (
    transport.closed ||
    error instanceof AdapterTransportError ||
    (error instanceof Error && [
      "CHAIR_BRIDGE_LOST",
      "PROVIDER_CLOSED",
      "PROVIDER_EXITED",
      "PROVIDER_SPAWN_FAILED",
      "PROVIDER_STDIN_FAILED",
    ].includes(error.name))
  );
}

function isRetainedChildLoss(error: unknown, transport: AdapterProcessTransport): boolean {
  return (
    transport.closed ||
    error instanceof AdapterTransportError ||
    (error instanceof Error && [
      "AGENT_BRIDGE_LOST",
      "PROVIDER_CLOSED",
      "PROVIDER_EXITED",
      "PROVIDER_SPAWN_FAILED",
      "PROVIDER_STDIN_FAILED",
    ].includes(error.name))
  );
}

function enforceModelPolicy(adapterId: string, definition: AdapterProcessDefinition, method: string, params: Record<string, unknown>): void {
  const policy = definition.modelPolicy;
  const payload = modelPayload(method, params);
  if (policy === undefined || payload === undefined) return;
  const assessment = assessAdapterModelPolicy({
    modelFamily: typeof payload.modelFamily === "string" ? payload.modelFamily : "",
    modelId: typeof payload.model === "string" ? payload.model : null,
    allowedFamilies: policy.allowedFamilies,
    allowedModelPatterns: policy.allowedModelPatterns,
    requiresExplicitModel: policy.requiresExplicitModel,
  });
  if (assessment.allowed) return;
  if (assessment.reason === "model-required") throw new FabricError("ADAPTER_MODEL_REQUIRED", `${adapterId} requires an explicit model`);
  if (assessment.reason === "model-forbidden") {
    throw new FabricError("MODEL_NOT_ALLOWED", `${adapterId} model is outside trusted compatibility patterns`);
  }
  throw new FabricError("ADAPTER_FAMILY_FORBIDDEN", `${adapterId} model family is outside trusted compatibility policy`);
}

export class AdapterSupervisor {
  readonly #definitions: Record<string, AdapterProcessDefinition>;
  readonly #transports = new Map<string, AdapterProcessTransport>();
  readonly #chairTransports = new Map<string, AdapterProcessTransport>();
  readonly #knownChairSessions = new Map<string, number>();
  readonly #chairSessionByAction = new Map<string, string>();
  readonly #consumedChairHandoffHashes = new Set<string>();
  readonly #childTransports = new Map<string, AdapterProcessTransport>();
  readonly #knownChildSessions = new Map<string, number>();
  readonly #childSessionByAction = new Map<string, string>();
  readonly #childEntryBySession = new Map<string, RetainedChildBridge>();
  readonly #lostChildSessions = new Set<string>();
  readonly #consumedChildHandoffHashes = new Set<string>();
  #childLossHandler: ((entry: RetainedChildBridge, reason: string) => void) | undefined;
  readonly #controlTimeoutMs: number;
  readonly #providerTurnTimeoutMs: number;

  constructor(definitions: Record<string, AdapterProcessDefinition>, options: AdapterSupervisorOptions = {}) {
    this.#definitions = definitions;
    this.#controlTimeoutMs = options.controlTimeoutMs ?? DEFAULT_CONTROL_TIMEOUT_MS;
    this.#providerTurnTimeoutMs = options.providerTurnTimeoutMs ?? DEFAULT_PROVIDER_TURN_TIMEOUT_MS;
  }

  setChildBridgeLossHandler(handler: (entry: RetainedChildBridge, reason: string) => void): void {
    this.#childLossHandler = handler;
  }

  async request(adapterId: string, method: string, params: Record<string, unknown>): Promise<unknown> {
    const definition = this.#definitions[adapterId];
    if (definition === undefined) throw new Error(`adapter is not configured: ${adapterId}`);
    enforceModelPolicy(adapterId, definition, method, params);
    const sessionRefs = [...new Set(providerSessionReferences(params))];
    if (sessionRefs.length > 1) {
      throw new ProviderAdapterError(
        "STALE_LEASE_GENERATION",
        `${adapterId} chair request contains conflicting provider-session references`,
      );
    }
    const sessionRef = sessionRefs[0];
    const sessionChairKey = sessionRef === undefined ? undefined : chairTransportKey(adapterId, sessionRef);
    const actionChairKey = method === "lookup_action" && typeof params.actionId === "string"
      ? this.#chairSessionByAction.get(chairActionKey(adapterId, params.actionId))
      : undefined;
    const actionChildKey = method === "lookup_action" && typeof params.actionId === "string"
      ? this.#childSessionByAction.get(chairActionKey(adapterId, params.actionId))
      : undefined;
    const sessionChildKey = sessionRef === undefined ? undefined : chairTransportKey(adapterId, sessionRef);
    if (sessionChildKey !== undefined && this.#lostChildSessions.has(sessionChildKey) && method !== "lookup_action") {
      throw new ProviderAdapterError(
        "AGENT_BRIDGE_LOST",
        `${adapterId} child session cannot be resumed without a newly provisioned bridge`,
      );
    }
    const childKey = actionChildKey ?? (
      sessionChildKey !== undefined && this.#knownChildSessions.has(sessionChildKey)
        ? sessionChildKey
        : undefined
    );
    if (sessionChairKey !== undefined && actionChairKey !== undefined && sessionChairKey !== actionChairKey) {
      throw new ProviderAdapterError(
        "STALE_LEASE_GENERATION",
        `${adapterId} chair lookup action does not match its provider-session reference`,
      );
    }
    const chairKey = actionChairKey ?? sessionChairKey;
    const actionRoutedLookup = actionChairKey !== undefined;
    const knownChairGeneration = chairKey === undefined ? undefined : this.#knownChairSessions.get(chairKey);
    const requestedGenerations = providerSessionGenerations(params);
    if (
      knownChairGeneration !== undefined &&
      (
        (requestedGenerations.length === 0 && !actionRoutedLookup) ||
        requestedGenerations.some((generation) => (
          typeof generation !== "number" ||
          !Number.isSafeInteger(generation) ||
          generation !== knownChairGeneration
        ))
      )
    ) {
      throw new ProviderAdapterError(
        "STALE_LEASE_GENERATION",
        `${adapterId} chair request does not match its retained provider-session generation`,
      );
    }
    const retainedChairTransport = chairKey === undefined ? undefined : this.#chairTransports.get(chairKey);
    if (chairKey !== undefined && knownChairGeneration !== undefined && retainedChairTransport === undefined) {
      throw new ProviderAdapterError(
        "CHAIR_BRIDGE_LOST",
        `${adapterId} chair session cannot be resumed without its retained bridge`,
      );
    }
    const retainedChildTransport = childKey === undefined ? undefined : this.#childTransports.get(childKey);
    const knownChildGeneration = childKey === undefined ? undefined : this.#knownChildSessions.get(childKey);
    if (
      childKey !== undefined && knownChildGeneration !== undefined &&
      (retainedChildTransport === undefined || retainedChildTransport.closed)
    ) {
      this.#loseChildBridge(childKey, "retained child bridge is unavailable");
      throw new ProviderAdapterError("AGENT_BRIDGE_LOST", `${adapterId} retained child bridge is unavailable`);
    }
    if (
      knownChildGeneration !== undefined &&
      requestedGenerations.length > 0 &&
      requestedGenerations.some((generation) => generation !== knownChildGeneration)
    ) {
      throw new ProviderAdapterError(
        "STALE_LEASE_GENERATION",
        `${adapterId} child request does not match its retained provider-session generation`,
      );
    }
    let transport = retainedChairTransport ?? retainedChildTransport ?? this.#transports.get(adapterId);
    if (transport === undefined || transport.closed) {
      if (retainedChairTransport?.closed === true && chairKey !== undefined) {
        this.#chairTransports.delete(chairKey);
        throw new ProviderAdapterError("CHAIR_BRIDGE_LOST", `${adapterId} retained chair bridge is unavailable`);
      }
      transport = new AdapterProcessTransport(definition);
      this.#transports.set(adapterId, transport);
    }
    try {
      const result = await transport.request(method, params, {
        timeoutMs: isLongProviderOperation(method, params) ? this.#providerTurnTimeoutMs : this.#controlTimeoutMs,
      });
      if (retainedChairTransport !== undefined && chairKey !== undefined && isReleaseRequest(method, params)) {
        this.#chairTransports.delete(chairKey);
        await transport.close().catch(() => undefined);
      }
      if (retainedChildTransport !== undefined && childKey !== undefined && isReleaseRequest(method, params)) {
        this.#removeChildBridge(childKey);
        await transport.close().catch(() => undefined);
      }
      return result;
    } catch (error: unknown) {
      if (retainedChairTransport !== undefined && chairKey !== undefined) {
        if (!isRetainedChairLoss(error, transport)) throw error;
        this.#chairTransports.delete(chairKey);
      } else if (retainedChildTransport !== undefined && childKey !== undefined) {
        if (!isRetainedChildLoss(error, transport)) throw error;
        this.#loseChildBridge(childKey, error instanceof Error ? error.message : "retained child bridge lost");
      } else {
        this.#transports.delete(adapterId);
      }
      await transport.close().catch(() => undefined);
      if (retainedChairTransport !== undefined) {
        throw new ProviderAdapterError("CHAIR_BRIDGE_LOST", `${adapterId} retained chair bridge was lost`);
      }
      throw error;
    }
  }

  async provisionAgent(
    adapterId: string,
    request: AdapterAgentProvisionRequest,
    handoff: AgentBridgeHandoff,
  ): Promise<AgentProvisionProviderResult> {
    const definition = this.#definitions[adapterId];
    if (definition === undefined) throw new Error(`adapter is not configured: ${adapterId}`);
    if (
      typeof handoff.capability !== "string" || handoff.capability.length === 0 ||
      typeof handoff.socketPath !== "string" || !isAbsolute(handoff.socketPath)
    ) {
      throw new ProviderAdapterError("PRIVATE_HANDOFF_UNAVAILABLE", "agent bridge private handoff is invalid");
    }
    enforceModelPolicy(adapterId, definition, request.operation, { payload: request.payload });
    const handoffHash = createHash("sha256").update(handoff.capability).digest("hex");
    if (this.#consumedChildHandoffHashes.has(handoffHash)) {
      throw new ProviderAdapterError("PRIVATE_HANDOFF_UNAVAILABLE", "agent bridge private handoff was already consumed");
    }
    this.#consumedChildHandoffHashes.add(handoffHash);
    const transport = new AdapterProcessTransport({
      ...definition,
      environment: {
        ...definition.environment,
        AGENT_FABRIC_HANDOFF_KIND: "agent",
        AGENT_FABRIC_CAPABILITY: handoff.capability,
        AGENT_FABRIC_SOCKET_PATH: handoff.socketPath,
      },
    });
    try {
      const publicRequest = {
        schemaVersion: request.schemaVersion,
        operation: request.operation,
        actionId: request.actionId,
        targetAgentId: request.targetAgentId,
        authorityId: request.authorityId,
        bridgeGeneration: request.bridgeGeneration,
        bridgeContractDigest: request.bridgeContractDigest,
        payload: request.payload,
        ...(request.providerSessionRef === undefined ? {} : { providerSessionRef: request.providerSessionRef }),
      };
      const result = parseAgentProvisionProviderResult(
        await transport.request("provision_agent", publicRequest, { timeoutMs: this.#providerTurnTimeoutMs }),
        {
          adapterId,
          actionId: request.actionId,
          targetAgentId: request.targetAgentId,
          bridgeGeneration: request.bridgeGeneration,
          bridgeContractDigest: request.bridgeContractDigest,
        },
      );
      await transport.request("capabilities", {}, { timeoutMs: this.#controlTimeoutMs });
      if (transport.closed) throw new ProviderAdapterError("AGENT_BRIDGE_LOST", "agent bridge closed before retention");
      const key = chairTransportKey(adapterId, result.providerSessionRef);
      if (this.#childTransports.has(key) || this.#chairTransports.has(key)) {
        throw new ProviderAdapterError("AGENT_BRIDGE_CONFLICT", "provider session already has a retained bridge");
      }
      const entry: RetainedChildBridge = Object.freeze({
        runId: request.runId,
        agentId: request.targetAgentId,
        adapterId,
        actionId: request.actionId,
        providerSessionRef: result.providerSessionRef,
        providerSessionGeneration: result.providerSessionGeneration,
        bridgeGeneration: result.bridgeGeneration,
      });
      this.#childTransports.set(key, transport);
      this.#lostChildSessions.delete(key);
      this.#knownChildSessions.set(key, result.providerSessionGeneration);
      this.#childSessionByAction.set(chairActionKey(adapterId, request.actionId), key);
      this.#childEntryBySession.set(key, entry);
      transport.onClose(() => {
        if (this.#childTransports.get(key) === transport) this.#loseChildBridge(key, "retained adapter transport closed");
      });
      return result;
    } catch (error: unknown) {
      await transport.close().catch(() => undefined);
      throw error;
    }
  }

  hasRetainedChildBridge(entry: RetainedChildBridge): boolean {
    const key = chairTransportKey(entry.adapterId, entry.providerSessionRef);
    const current = this.#childEntryBySession.get(key);
    return current !== undefined && current.actionId === entry.actionId &&
      current.runId === entry.runId && current.agentId === entry.agentId &&
      current.providerSessionGeneration === entry.providerSessionGeneration &&
      current.bridgeGeneration === entry.bridgeGeneration &&
      this.#childTransports.get(key)?.closed === false;
  }

  #removeChildBridge(key: string): void {
    const entry = this.#childEntryBySession.get(key);
    this.#childTransports.delete(key);
    this.#knownChildSessions.delete(key);
    this.#childEntryBySession.delete(key);
    if (entry !== undefined) this.#childSessionByAction.delete(chairActionKey(entry.adapterId, entry.actionId));
  }

  #loseChildBridge(key: string, reason: string): void {
    const entry = this.#childEntryBySession.get(key);
    this.#removeChildBridge(key);
    if (entry !== undefined) {
      this.#lostChildSessions.add(key);
      this.#childLossHandler?.(entry, reason);
    }
  }

  async launchChair(
    adapterId: string,
    request: AdapterChairLaunchRequest,
    handoff: ChairLaunchHandoff,
  ): Promise<ChairLaunchProviderResult> {
    const definition = this.#definitions[adapterId];
    if (definition === undefined) throw new Error(`adapter is not configured: ${adapterId}`);
    if (
      typeof handoff.capability !== "string" ||
      handoff.capability.length === 0 ||
      typeof handoff.socketPath !== "string" ||
      handoff.socketPath.length === 0 ||
      !isAbsolute(handoff.socketPath) ||
      typeof handoff.attestationChallenge !== "string" ||
      !/^[0-9a-f]{64}$/u.test(handoff.attestationChallenge)
    ) {
      throw new ProviderAdapterError(
        "PRIVATE_HANDOFF_UNAVAILABLE",
        "chair launch private handoff is unavailable or invalid",
      );
    }
    enforceModelPolicy(adapterId, definition, "spawn", { payload: request.payload });
    const handoffHash = createHash("sha256").update(handoff.capability).digest("hex");
    if (this.#consumedChairHandoffHashes.has(handoffHash)) {
      throw new ProviderAdapterError("PRIVATE_HANDOFF_UNAVAILABLE", "chair launch private handoff was already consumed");
    }
    this.#consumedChairHandoffHashes.add(handoffHash);
    const transport = new AdapterProcessTransport({
      ...definition,
      environment: {
        ...definition.environment,
        AGENT_FABRIC_HANDOFF_KIND: "chair",
        AGENT_FABRIC_CAPABILITY: handoff.capability,
        AGENT_FABRIC_SOCKET_PATH: handoff.socketPath,
        AGENT_FABRIC_ATTESTATION_CHALLENGE: handoff.attestationChallenge,
      },
    });
    try {
      const result = parseChairLaunchProviderResult(await transport.request("launch_chair", request, {
        timeoutMs: this.#providerTurnTimeoutMs,
      }), {
        providerAdapterId: adapterId,
        providerActionId: request.actionId,
        providerContractDigest: request.providerContractDigest,
        challengeDigest: chairLaunchChallengeDigest(handoff.attestationChallenge),
      });
      // This is a liveness handshake only; the provider-originated attestation
      // above remains the sole continuity proof.
      await transport.request("capabilities", {}, { timeoutMs: this.#controlTimeoutMs });
      if (transport.closed) {
        throw new ProviderAdapterError("CHAIR_BRIDGE_LOST", `${adapterId} chair bridge closed before terminal handoff`);
      }
      const key = chairTransportKey(adapterId, result.resumeReference);
      if (this.#chairTransports.has(key)) {
        throw new ProviderAdapterError("CHAIR_BRIDGE_CONFLICT", `${adapterId} already owns the provider chair session`);
      }
      this.#chairTransports.set(key, transport);
      this.#knownChairSessions.set(key, result.providerSessionGeneration);
      this.#chairSessionByAction.set(chairActionKey(adapterId, request.actionId), key);
      return result;
    } catch {
      await transport.close().catch(() => undefined);
      throw new ProviderAdapterError("CHAIR_LAUNCH_FAILED", `${adapterId} chair launch adapter handoff failed`);
    }
  }

  async close(): Promise<void> {
    const transports = [...new Set([...this.#transports.values(), ...this.#chairTransports.values(), ...this.#childTransports.values()])];
    this.#transports.clear();
    this.#chairTransports.clear();
    this.#lostChildSessions.clear();
    for (const key of [...this.#childTransports.keys()]) this.#removeChildBridge(key);
    await Promise.allSettled(transports.map((transport) => transport.close()));
  }
}

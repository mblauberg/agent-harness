import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

import { AdapterProcessTransport, AdapterTransportError } from "./process.js";
import { assessAdapterModelPolicy } from "./model-selection.js";
import { FabricError } from "../errors.js";
import {
  chairLaunchChallengeDigest,
  parseChairLaunchProviderResult,
  ProviderAdapterError,
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
  readonly #consumedChairHandoffHashes = new Set<string>();
  readonly #controlTimeoutMs: number;
  readonly #providerTurnTimeoutMs: number;

  constructor(definitions: Record<string, AdapterProcessDefinition>, options: AdapterSupervisorOptions = {}) {
    this.#definitions = definitions;
    this.#controlTimeoutMs = options.controlTimeoutMs ?? DEFAULT_CONTROL_TIMEOUT_MS;
    this.#providerTurnTimeoutMs = options.providerTurnTimeoutMs ?? DEFAULT_PROVIDER_TURN_TIMEOUT_MS;
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
    const chairKey = sessionRef === undefined ? undefined : chairTransportKey(adapterId, sessionRef);
    const knownChairGeneration = chairKey === undefined ? undefined : this.#knownChairSessions.get(chairKey);
    const requestedGenerations = providerSessionGenerations(params);
    if (
      knownChairGeneration !== undefined &&
      (
        requestedGenerations.length === 0 ||
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
    let transport = retainedChairTransport ?? this.#transports.get(adapterId);
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
      return result;
    } catch (error: unknown) {
      if (retainedChairTransport !== undefined && chairKey !== undefined) {
        if (!isRetainedChairLoss(error, transport)) throw error;
        this.#chairTransports.delete(chairKey);
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
      return result;
    } catch {
      await transport.close().catch(() => undefined);
      throw new ProviderAdapterError("CHAIR_LAUNCH_FAILED", `${adapterId} chair launch adapter handoff failed`);
    }
  }

  async close(): Promise<void> {
    const transports = [...new Set([...this.#transports.values(), ...this.#chairTransports.values()])];
    this.#transports.clear();
    this.#chairTransports.clear();
    this.#knownChairSessions.clear();
    await Promise.allSettled(transports.map((transport) => transport.close()));
  }
}

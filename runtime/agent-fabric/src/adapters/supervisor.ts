import { AdapterProcessTransport } from "./process.js";
import { assessAdapterModelPolicy } from "./model-selection.js";
import { FabricError } from "../errors.js";

export type AdapterProcessDefinition = {
  command: string[];
  environment: Record<string, string>;
  modelPolicy?: { allowedFamilies: string[]; allowedModelPatterns: string[]; requiresExplicitModel: boolean };
};

export type AdapterSupervisorOptions = {
  controlTimeoutMs?: number;
  providerTurnTimeoutMs?: number;
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
    let transport = this.#transports.get(adapterId);
    if (transport === undefined || transport.closed) {
      transport = new AdapterProcessTransport(definition);
      this.#transports.set(adapterId, transport);
    }
    try {
      return await transport.request(method, params, {
        timeoutMs: isLongProviderOperation(method, params) ? this.#providerTurnTimeoutMs : this.#controlTimeoutMs,
      });
    } catch (error: unknown) {
      this.#transports.delete(adapterId);
      await transport.close().catch(() => undefined);
      throw error;
    }
  }

  async close(): Promise<void> {
    const transports = [...this.#transports.values()];
    this.#transports.clear();
    await Promise.allSettled(transports.map((transport) => transport.close()));
  }
}

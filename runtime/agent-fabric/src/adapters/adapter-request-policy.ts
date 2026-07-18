import { FabricError } from "../errors.js";
import { assessAdapterModelPolicy } from "./model-selection.js";
import { AdapterProcessTransport, AdapterTransportError } from "./process.js";
import {
  ProviderAdapterError,
  type AgentFabricPrincipalBinding,
} from "./providers/types.js";

export type AdapterModelPolicy = {
  allowedFamilies: string[];
  allowedModelPatterns: string[];
  requiresExplicitModel: boolean;
};

export function isLongProviderOperation(method: string, params: Record<string, unknown>): boolean {
  if (method === "spawn" || method === "attach" || method === "compact") return true;
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

export function providerSessionReferences(params: Record<string, unknown>): string[] {
  const references: string[] = [];
  for (const key of ["resumeReference", "providerSessionRef", "threadId"] as const) {
    if (typeof params[key] === "string" && params[key].length > 0) references.push(params[key]);
  }
  if (typeof params.payload === "object" && params.payload !== null && !Array.isArray(params.payload)) {
    references.push(...providerSessionReferences(params.payload as Record<string, unknown>));
  }
  return references;
}

export function providerSessionGenerations(params: Record<string, unknown>): unknown[] {
  const generations = Object.hasOwn(params, "providerSessionGeneration")
    ? [params.providerSessionGeneration]
    : [];
  if (typeof params.payload === "object" && params.payload !== null && !Array.isArray(params.payload)) {
    generations.push(...providerSessionGenerations(params.payload as Record<string, unknown>));
  }
  return generations;
}

export function chairTransportKey(adapterId: string, providerSessionRef: string): string {
  return `${adapterId}\0${providerSessionRef}`;
}

export function chairActionKey(adapterId: string, actionId: string): string {
  return `${adapterId}\0${actionId}`;
}

export function isReleaseRequest(method: string, params: Record<string, unknown>): boolean {
  return method === "release" || (method === "dispatch" && params.operation === "release");
}

export function isRetainedChairLoss(error: unknown, transport: AdapterProcessTransport): boolean {
  return (
    transport.closed ||
    error instanceof AdapterTransportError ||
    (error instanceof ProviderAdapterError && error.code === "CHAIR_BRIDGE_LOST") ||
    (error instanceof Error && [
      "CHAIR_BRIDGE_LOST",
      "PROVIDER_CLOSED",
      "PROVIDER_EXITED",
      "PROVIDER_SPAWN_FAILED",
      "PROVIDER_STDIN_FAILED",
    ].includes(error.name))
  );
}

export function isRetainedChildLoss(error: unknown, transport: AdapterProcessTransport): boolean {
  return (
    transport.closed ||
    error instanceof AdapterTransportError ||
    (error instanceof ProviderAdapterError && error.code === "AGENT_BRIDGE_LOST") ||
    (error instanceof Error && [
      "AGENT_BRIDGE_LOST",
      "PROVIDER_CLOSED",
      "PROVIDER_EXITED",
      "PROVIDER_SPAWN_FAILED",
      "PROVIDER_STDIN_FAILED",
    ].includes(error.name))
  );
}

export function validExpectedPrincipal(value: AgentFabricPrincipalBinding): boolean {
  return typeof value === "object" && value !== null &&
    typeof value.agentId === "string" && value.agentId.length > 0 &&
    typeof value.projectSessionId === "string" && value.projectSessionId.length > 0 &&
    typeof value.runId === "string" && value.runId.length > 0 &&
    Number.isSafeInteger(value.principalGeneration) && value.principalGeneration >= 1;
}

export function enforceModelPolicy(
  adapterId: string,
  policy: AdapterModelPolicy | undefined,
  method: string,
  params: Record<string, unknown>,
): void {
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

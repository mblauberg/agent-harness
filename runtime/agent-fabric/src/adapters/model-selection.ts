import { readFile } from "node:fs/promises";

import { parse } from "yaml";

import { FabricError } from "../errors.js";
import { resolveCompatibilityArtifact, verifyAdapterCompatibility } from "./compatibility.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", "adapter model constraints are invalid");
  }
  return value;
}

export async function loadAdapterModelConstraints(input: {
  compatibilityPath: string;
  schemaPath: string;
  adapterId: string;
  requireEnabled?: boolean;
}): Promise<{ enabled: boolean; allowed: string[]; patterns: string[]; requiresExplicitModel: boolean; wrapperEntrypoint?: string; providerExecutable?: string }> {
  await verifyAdapterCompatibility({
    compatibilityPath: input.compatibilityPath,
    schemaPath: input.schemaPath,
    adapterIds: [input.adapterId],
    requireEnabled: input.requireEnabled ?? true,
  });
  const document: unknown = parse(await readFile(input.compatibilityPath, "utf8"));
  if (!isRecord(document) || !isRecord(document.adapters)) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", "adapter compatibility entry is missing");
  }
  const adapter = document.adapters[input.adapterId];
  if (!isRecord(adapter)) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", "adapter compatibility entry is missing");
  }
  if (!isRecord(adapter.model_family_constraints)) {
    throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", "adapter model constraints are missing");
  }
  const implementation = isRecord(adapter.implementation) ? adapter.implementation : {};
  const wrapperEntrypoint = typeof implementation.wrapper_entrypoint === "string"
    ? resolveCompatibilityArtifact(input.compatibilityPath, implementation.wrapper_entrypoint)
    : undefined;
  const providerExecutable = typeof implementation.executable === "string"
    ? resolveCompatibilityArtifact(input.compatibilityPath, implementation.executable)
    : undefined;
  return {
    enabled: adapter.enabled === true,
    allowed: stringArray(adapter.model_family_constraints.allowed),
    patterns: adapter.model_family_constraints.allowed_model_patterns === undefined
      ? []
      : stringArray(adapter.model_family_constraints.allowed_model_patterns),
    requiresExplicitModel: adapter.model_family_constraints.requires_explicit_model === true,
    ...(wrapperEntrypoint === undefined ? {} : { wrapperEntrypoint }),
    ...(providerExecutable === undefined ? {} : { providerExecutable }),
  };
}

function patternMatches(model: string, pattern: string): boolean {
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}$`, "iu").test(model);
}

export function assessAdapterModelPolicy(input: {
  modelFamily: string;
  modelId?: string | null;
  allowedFamilies: readonly string[];
  allowedModelPatterns?: readonly string[];
  requiresExplicitModel: boolean;
}): { allowed: true; reason: "allowed" } | { allowed: false; reason: "model-required" | "family-forbidden" | "model-forbidden" } {
  if (input.requiresExplicitModel && (input.modelId === undefined || input.modelId === null || input.modelId.length === 0)) {
    return { allowed: false, reason: "model-required" };
  }
  const patterns = input.allowedModelPatterns ?? [];
  const patternMatch = patterns.length === 0 || patterns.some((pattern) => patternMatches(input.modelId ?? "", pattern));
  const familyAllowed = input.allowedFamilies.includes(input.modelFamily) || (
    patterns.length > 0 && input.allowedFamilies.includes("open-weight") && patternMatch
  );
  if (!familyAllowed) return { allowed: false, reason: "family-forbidden" };
  if (!patternMatch) {
    return { allowed: false, reason: "model-forbidden" };
  }
  return { allowed: true, reason: "allowed" };
}

export async function resolveProviderAdapterSelection(input: {
  compatibilityPath: string;
  schemaPath: string;
  adapterId: string;
  modelFamily: string;
  model?: string;
}): Promise<{ adapterId: string; modelFamily: string; model: string; enabled: true }> {
  const policy = await loadAdapterModelConstraints(input);
  const assessment = assessAdapterModelPolicy({
    modelFamily: input.modelFamily,
    ...(input.model === undefined ? {} : { modelId: input.model }),
    allowedFamilies: policy.allowed,
    allowedModelPatterns: policy.patterns,
    requiresExplicitModel: policy.requiresExplicitModel,
  });
  if (!assessment.allowed && assessment.reason === "model-required") {
    throw new FabricError("ADAPTER_MODEL_REQUIRED", "adapter requires an explicit model");
  }
  if (!assessment.allowed) {
    throw new FabricError("ADAPTER_FAMILY_FORBIDDEN", "model family is outside the adapter allow-list");
  }
  const model = input.model ?? "";
  return { adapterId: input.adapterId, modelFamily: input.modelFamily, model, enabled: true };
}

export async function validateAdapterModelSelection(input: {
  compatibilityPath: string;
  schemaPath: string;
  adapterId: string;
  requireEnabled: boolean;
  modelId: string | null;
  modelFamily: string;
}): Promise<{ valid: true; adapterId: string; modelFamily: string; modelId: string }> {
  const policy = await loadAdapterModelConstraints(input);
  const assessment = assessAdapterModelPolicy({
    modelFamily: input.modelFamily,
    modelId: input.modelId,
    allowedFamilies: policy.allowed,
    allowedModelPatterns: policy.patterns,
    requiresExplicitModel: policy.requiresExplicitModel,
  });
  if (!assessment.allowed && assessment.reason === "model-required") {
    throw new FabricError("MODEL_REQUIRED", "adapter requires an explicit model");
  }
  if (!assessment.allowed && assessment.reason === "family-forbidden") {
    const code = input.adapterId === "kiro-acp" ? "MODEL_FAMILY_NOT_ALLOWED" : "MODEL_NOT_ALLOWED";
    throw new FabricError(code, "model family is outside the adapter allow-list");
  }
  const modelId = input.modelId ?? "";
  if (!assessment.allowed) {
    throw new FabricError("MODEL_NOT_ALLOWED", "model identifier is outside the adapter pattern allow-list");
  }
  return { valid: true, adapterId: input.adapterId, modelFamily: input.modelFamily, modelId };
}

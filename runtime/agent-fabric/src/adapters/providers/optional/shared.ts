import { actionPayload, ProviderAdapterError, requiredString, type AdapterRequestHandler } from "../types.js";
import { createProviderAdapter, type ProviderBoundary } from "../adapter.js";
import type { SqliteAdapterActionJournal } from "../journal.js";
import { assessAdapterModelPolicy } from "../../model-selection.js";

export type OptionalProviderBoundary = ProviderBoundary;

type ModelPolicy = {
  adapterId: string;
  allowedFamilies: readonly string[];
  allowedModelPatterns?: readonly string[];
};

export type OptionalProviderCapabilities = {
  protocolVersion: 1;
  adapterId: string;
  operations: string[];
  actionJournal: true;
  persistentSession: boolean;
  ephemeralWorker: true;
  answerBearingSpawn?: true;
  answerBearingSpawnTurns?: "one-shot";
  controlModes: ["managed"];
  inboxDeliveryModes: ["structured-push"];
  recoveryOperations: string[];
  compactInPlace: boolean;
  idempotencyEvidence: "per-action-fail-closed";
  adapterContractVersion: 1;
  allowedModelFamilies: string[];
  requiresExplicitModel: true;
};

function validateModel(payload: Record<string, unknown>, policy: ModelPolicy): void {
  const model = requiredString(payload.model, "model");
  const modelFamily = requiredString(payload.modelFamily, "modelFamily");
  const assessment = assessAdapterModelPolicy({
    modelFamily,
    modelId: model,
    allowedFamilies: policy.allowedFamilies,
    ...(policy.allowedModelPatterns === undefined ? {} : { allowedModelPatterns: policy.allowedModelPatterns }),
    requiresExplicitModel: true,
  });
  if (!assessment.allowed && assessment.reason === "family-forbidden") {
    throw new ProviderAdapterError(
      "ADAPTER_FAMILY_FORBIDDEN",
      `${policy.adapterId} does not allow model family ${modelFamily}`,
      { adapterId: policy.adapterId, modelFamily },
    );
  }
  if (!assessment.allowed) {
    throw new ProviderAdapterError(
      "ADAPTER_MODEL_FORBIDDEN",
      `${policy.adapterId} does not allow model ${model}`,
      { adapterId: policy.adapterId, model },
    );
  }
}

function requiresModel(method: string, params: Record<string, unknown>): boolean {
  if (method === "spawn") return true;
  return method === "dispatch" && (params.operation === "send_turn" || params.operation === "steer");
}

export function createOptionalProviderAdapter(options: {
  capabilities: OptionalProviderCapabilities;
  boundary: OptionalProviderBoundary;
  journal: SqliteAdapterActionJournal;
  modelPolicy?: Pick<ModelPolicy, "allowedModelPatterns">;
}): AdapterRequestHandler {
  const modelPolicy: ModelPolicy = {
    adapterId: options.capabilities.adapterId,
    allowedFamilies: options.capabilities.allowedModelFamilies,
    ...(options.modelPolicy?.allowedModelPatterns === undefined ? {} : {
      allowedModelPatterns: options.modelPolicy.allowedModelPatterns,
    }),
  };
  const delegate = createProviderAdapter({
    capabilities: options.capabilities,
    boundary: options.boundary,
    journal: options.journal,
  });
  return {
    async request(method, params) {
      if (requiresModel(method, params)) validateModel(actionPayload(params), modelPolicy);
      return await delegate.request(method, params);
    },
  };
}

export function optionalCapabilities(input: {
  adapterId: string;
  operations: string[];
  modelFamilies: string[];
  compactInPlace: boolean;
  persistentSession?: boolean;
  recoveryOperations?: string[];
  answerBearingSpawn?: true;
  answerBearingSpawnTurns?: "one-shot";
}): OptionalProviderCapabilities {
  return {
    protocolVersion: 1,
    adapterContractVersion: 1,
    adapterId: input.adapterId,
    operations: input.operations,
    actionJournal: true,
    persistentSession: input.persistentSession ?? true,
    ephemeralWorker: true,
    ...(input.answerBearingSpawn === true ? { answerBearingSpawn: true } : {}),
    ...(input.answerBearingSpawnTurns === undefined ? {} : {
      answerBearingSpawnTurns: input.answerBearingSpawnTurns,
    }),
    controlModes: ["managed"],
    inboxDeliveryModes: ["structured-push"],
    recoveryOperations: input.recoveryOperations ?? ["resume_reference", "lookup_action"],
    compactInPlace: input.compactInPlace,
    idempotencyEvidence: "per-action-fail-closed",
    allowedModelFamilies: input.modelFamilies,
    requiresExplicitModel: true,
  };
}

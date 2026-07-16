import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { assessAdapterModelPolicy } from "../../src/index.ts";

type PolicyCase = {
  id: string;
  modelFamily: string;
  modelId: string | null;
  allowedFamilies: string[];
  allowedModelPatterns: string[];
  requiresExplicitModel: boolean;
  expected: { allowed: boolean; reason: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function policyCase(value: unknown): PolicyCase {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.modelFamily !== "string" ||
    (typeof value.modelId !== "string" && value.modelId !== null) ||
    !Array.isArray(value.allowedFamilies) || !value.allowedFamilies.every((item) => typeof item === "string") ||
    !Array.isArray(value.allowedModelPatterns) || !value.allowedModelPatterns.every((item) => typeof item === "string") ||
    typeof value.requiresExplicitModel !== "boolean" ||
    !isRecord(value.expected) || typeof value.expected.allowed !== "boolean" || typeof value.expected.reason !== "string"
  ) throw new TypeError("evaluation case is invalid");
  return {
    id: value.id,
    modelFamily: value.modelFamily,
    modelId: value.modelId,
    allowedFamilies: value.allowedFamilies,
    allowedModelPatterns: value.allowedModelPatterns,
    requiresExplicitModel: value.requiresExplicitModel,
    expected: { allowed: value.expected.allowed, reason: value.expected.reason },
  };
}

describe("Stage 5 adapter-model policy evaluation", () => {
  it("matches every predeclared safe and adversarial routing oracle", async () => {
    const raw: unknown = JSON.parse(await readFile(new URL("./adapter-model-policy-cases.json", import.meta.url), "utf8"));
    if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.cases)) throw new TypeError("evaluation dataset is invalid");
    const cases = raw.cases.map(policyCase);
    expect(cases).toHaveLength(17);
    for (const item of cases) {
      expect(assessAdapterModelPolicy({
        modelFamily: item.modelFamily,
        modelId: item.modelId,
        allowedFamilies: item.allowedFamilies,
        allowedModelPatterns: item.allowedModelPatterns,
        requiresExplicitModel: item.requiresExplicitModel,
      }), item.id).toEqual(item.expected);
    }
  });
});

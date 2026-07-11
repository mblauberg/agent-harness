import { describe, expect, it } from "vitest";

import { assessAdapterModelPolicy } from "../../src/adapters/model-selection.ts";

describe("adapter model matching conformance", () => {
  it("matches Python-style wildcards case-insensitively", () => {
    expect(assessAdapterModelPolicy({
      modelFamily: "cursor-composer",
      modelId: "COMPOSER-2-HIGH",
      allowedFamilies: ["cursor-composer"],
      allowedModelPatterns: ["composer-*-high"],
      requiresExplicitModel: true,
    })).toEqual({ allowed: true, reason: "allowed" });
  });

  it("bridges concrete open-weight families only through an explicit matching pattern", () => {
    expect(assessAdapterModelPolicy({
      modelFamily: "zhipu",
      modelId: "GLM-5",
      allowedFamilies: ["open-weight"],
      allowedModelPatterns: ["glm-*"],
      requiresExplicitModel: true,
    })).toEqual({ allowed: true, reason: "allowed" });
    expect(assessAdapterModelPolicy({
      modelFamily: "google",
      modelId: "gemini-3.1-pro",
      allowedFamilies: ["open-weight"],
      requiresExplicitModel: true,
    })).toEqual({ allowed: false, reason: "family-forbidden" });
  });
});

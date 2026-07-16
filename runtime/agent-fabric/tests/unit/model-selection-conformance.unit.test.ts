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

  it("permits account-default dispatch only when an explicit model is not required", () => {
    // ChatGPT-subscription Codex rejects explicit model ids; an absent id is
    // an account-default dispatch and skips the pattern gate (#190).
    expect(assessAdapterModelPolicy({
      modelFamily: "openai",
      modelId: null,
      allowedFamilies: ["openai"],
      allowedModelPatterns: ["gpt-*", "codex*"],
      requiresExplicitModel: false,
    })).toEqual({ allowed: true, reason: "allowed" });
    expect(assessAdapterModelPolicy({
      modelFamily: "openai",
      modelId: null,
      allowedFamilies: ["openai"],
      allowedModelPatterns: ["gpt-*", "codex*"],
      requiresExplicitModel: true,
    })).toEqual({ allowed: false, reason: "model-required" });
    // The family gate still applies to account-default dispatch.
    expect(assessAdapterModelPolicy({
      modelFamily: "anthropic",
      modelId: null,
      allowedFamilies: ["openai"],
      allowedModelPatterns: ["gpt-*"],
      requiresExplicitModel: false,
    })).toEqual({ allowed: false, reason: "family-forbidden" });
    // Account-default is exclusive: ANY explicit id fails closed, even one
    // matching the allow-list, because the runtime rejects explicit ids.
    expect(assessAdapterModelPolicy({
      modelFamily: "openai",
      modelId: "gpt-5.6-sol",
      allowedFamilies: ["openai"],
      allowedModelPatterns: ["gpt-*"],
      requiresExplicitModel: false,
    })).toEqual({ allowed: false, reason: "model-forbidden" });
    expect(assessAdapterModelPolicy({
      modelFamily: "openai",
      modelId: "grok-4",
      allowedFamilies: ["openai"],
      allowedModelPatterns: ["gpt-*"],
      requiresExplicitModel: false,
    })).toEqual({ allowed: false, reason: "model-forbidden" });
  });

  it("never bridges the open-weight family through an absent model", () => {
    expect(assessAdapterModelPolicy({
      modelFamily: "zhipu",
      modelId: null,
      allowedFamilies: ["open-weight"],
      allowedModelPatterns: ["glm-*"],
      requiresExplicitModel: false,
    })).toEqual({ allowed: false, reason: "family-forbidden" });
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

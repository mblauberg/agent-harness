import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyAdapterCompatibility } from "../../../src/index.ts";
import {
  createCursorKiroCompatibilityFixture,
  repositoryPath,
  requireStage4PublicFunction,
  runStage4Fixture,
} from "../../support/stage4-cursor-kiro-testkit.ts";

describe("Stage 4 Kiro ACP adapter public contract", () => {
  it("keeps the checked-in real Kiro adapter disabled while ACP pins are unresolved", async () => {
    await expect(
      verifyAdapterCompatibility({
        compatibilityPath: repositoryPath("config/adapter-compatibility.yaml"),
        schemaPath: repositoryPath("runtime/agent-fabric/schemas/adapter-compatibility.schema.json"),
        adapterIds: ["kiro-acp"],
        requireEnabled: true,
      }),
    ).rejects.toMatchObject({ code: "ADAPTER_DISABLED" });
  });

  it("runs a fixture through the same durable adapter protocol without invoking Kiro", async () => {
    const fixture = await createCursorKiroCompatibilityFixture();
    try {
      const report = await runStage4Fixture({
        adapterId: "kiro-acp",
        model: "qwen3-coder",
        modelFamily: "open-weight",
        journalPath: join(fixture.directory, "kiro-journal.json"),
      });
      expect(report).toMatchObject({
        passed: true,
        protocolVersion: 1,
        capabilities: {
          adapterContractVersion: 1,
          adapterId: "kiro-acp",
          requiresExplicitModel: true,
          modelFamilies: ["open-weight"],
        },
        action: { status: "terminal", executionCount: 1, retryMatched: true, changedPayloadRejected: true },
      });
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("requires an explicit open-weight model and rejects closed-family rebroadcasts", async () => {
    const validate = requireStage4PublicFunction("validateAdapterModelSelection");
    const fixture = await createCursorKiroCompatibilityFixture();
    const base = {
      compatibilityPath: fixture.compatibilityPath,
      schemaPath: fixture.schemaPath,
      adapterId: "kiro-acp",
      requireEnabled: true,
    };
    try {
      await expect(validate({ ...base, modelId: "qwen3-coder", modelFamily: "open-weight" })).resolves.toMatchObject({
        valid: true,
        adapterId: "kiro-acp",
        modelFamily: "open-weight",
      });
      await expect(validate({ ...base, modelId: null, modelFamily: "open-weight" })).rejects.toMatchObject({
        code: "MODEL_REQUIRED",
      });
      for (const [modelId, modelFamily] of [
        ["claude-fable-5", "anthropic"],
        ["gpt-5.6", "openai"],
        ["gemini-3.5-pro", "google"],
        ["grok-4.5", "xai"],
        ["composer-2.5", "cursor-composer"],
      ]) {
        await expect(validate({ ...base, modelId, modelFamily })).rejects.toMatchObject({
          code: "MODEL_FAMILY_NOT_ALLOWED",
        });
      }
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("does not activate an enabled fixture while its ACP version/schema pins are unresolved", async () => {
    const fixture = await createCursorKiroCompatibilityFixture({ unresolvedAdapters: ["kiro-acp"] });
    try {
      await expect(
        verifyAdapterCompatibility({
          compatibilityPath: fixture.compatibilityPath,
          schemaPath: fixture.schemaPath,
          adapterIds: ["kiro-acp"],
          requireEnabled: true,
        }),
      ).rejects.toMatchObject({ code: "ADAPTER_PIN_UNRESOLVED" });
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});

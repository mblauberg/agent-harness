import { describe, expect, it } from "vitest";

import { AdapterSupervisor } from "../../src/adapters/supervisor.ts";

describe("daemon adapter supervisor model admission", () => {
  it("rejects incompatible selections before starting the provider wrapper", async () => {
    const supervisor = new AdapterSupervisor({
      cursor: {
        command: ["/definitely/not/a/provider-wrapper"],
        environment: {},
        modelPolicy: {
          allowedFamilies: ["cursor-composer", "xai"],
          allowedModelPatterns: ["composer-*", "grok-*"],
          requiresExplicitModel: true,
        },
      },
    });
    try {
      await expect(supervisor.request("cursor", "spawn", {
        actionId: "invalid-before-spawn",
        payload: { modelFamily: "google", model: "gemini-3.1-pro" },
      })).rejects.toMatchObject({ code: "ADAPTER_FAMILY_FORBIDDEN" });
      await expect(supervisor.request("cursor", "spawn", {})).rejects.toMatchObject({
        code: "ADAPTER_MODEL_REQUIRED",
      });
      await expect(supervisor.request("cursor", "spawn", {
        actionId: "invalid-model-before-spawn",
        payload: { modelFamily: "xai", model: "claude-opus" },
      })).rejects.toMatchObject({ code: "MODEL_NOT_ALLOWED" });
    } finally {
      await supervisor.close();
    }
  });
});

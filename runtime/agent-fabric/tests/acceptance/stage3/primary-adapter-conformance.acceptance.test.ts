import { describe, expect, it } from "vitest";

import { runAdapterConformance } from "../../../src/index.ts";
import {
  primaryAdapterFixtureCommand,
} from "../../support/primary-adapter-testkit.ts";

describe("primary adapter protocol-fixture capability negotiation", () => {
  it.each(["claude-agent-sdk", "codex-app-server"])(
    "retains the shared protocol fixture capabilities for %s without claiming a real wrapper smoke",
    async (adapterId) => {
      const result = await runAdapterConformance({
        command: primaryAdapterFixtureCommand(adapterId),
        environment: {},
        action: {
          actionId: `action-${adapterId}`,
          operation: "steer",
          payload: { resumeReference: "fixture-session", prompt: "fixture-turn" },
        },
      });

      expect(result.passed).toBe(true);
      expect(Reflect.get(result, "capabilities")).toEqual({
        protocolVersion: 1,
        adapterId,
        actionJournal: true,
        persistentSession: true,
        ephemeralWorker: true,
        controlModes: ["managed"],
        inboxDeliveryModes: ["structured-push"],
        recoveryOperations: ["resume_reference", "lookup_action"],
      });
    },
  );
});

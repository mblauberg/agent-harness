import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  parseOperationInput,
  requiredOperatorActionForIntent,
} from "../src/index.js";

const digest = `sha256:${"a".repeat(64)}`;
const command = {
  credential: { capabilityId: "capability_recovery_01", token: "test-recovery-capability" },
  commandId: "command_recovery_preview_01",
  expectedRevision: 2,
  actor: "operator_01",
  provenance: { kind: "console-direct-input", clientId: "client_01", inputEventId: "input_recovery_01" },
  evidenceRefs: [],
} as const;
const common = {
  kind: "chair-bridge-recovery" as const,
  schemaVersion: 1 as const,
  projectSessionId: "session_01",
  coordinationRunId: "run_01",
  lossId: "chair-bridge-loss:aaaaaaaa",
  recoveryManifestDigest: digest,
  expectedSessionRevision: 8,
  expectedSessionGeneration: 2,
  expectedRunRevision: 9,
  expectedChairGeneration: 1,
  expectedPrincipalGeneration: 1,
  expectedBridgeRevision: 2,
  expectedLostBridgeGeneration: 1,
  expectedProviderSessionGeneration: 3,
  providerAdapterId: "claude-agent-sdk",
  providerContractDigest: digest,
};

const intents = [
  {
    ...common,
    path: "rebind",
    providerActionId: "recovery_action_01",
  },
  {
    ...common,
    path: "takeover",
    successorAgentId: "successor_01",
    expectedSuccessorPrincipalGeneration: 2,
    expectedSuccessorBridgeGeneration: 1,
    expectedSuccessorRevision: 2,
  },
  { ...common, path: "abandon", reason: "operator accepted terminal provider loss" },
] as const;

describe("chair bridge recovery operator intent", () => {
  it.each(intents)("round-trips the closed $path variant under takeover authority", (intent) => {
    const parsed = parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command,
      projectId: "project_01",
      intent,
    });
    expect(parsed.intent).toStrictEqual(intent);
    expect(requiredOperatorActionForIntent(parsed.intent)).toBe("takeover");
  });

  it("rejects stale-shape and widened recovery variants", () => {
    for (const intent of [
      { ...intents[0], recoveryManifestDigest: "not-a-digest" },
      { ...intents[1], expectedSuccessorRevision: 0 },
      { ...intents[2], capability: "forbidden-secret" },
      { ...intents[0], providerActionId: undefined },
    ]) {
      expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
        command,
        projectId: "project_01",
        intent,
      })).toThrow();
    }
  });
});

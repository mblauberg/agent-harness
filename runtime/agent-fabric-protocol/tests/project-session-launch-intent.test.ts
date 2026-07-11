import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  OPERATION_REGISTRY,
  parseOperationInput,
  requiredOperatorActionForIntent,
} from "../src/index.js";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const artifact = { path: "launch/packet.json", digest } as const;
const command = {
  credential: { capabilityId: "capability_launch_01", token: "test-launch-capability" },
  commandId: "command_launch_preview_01",
  expectedRevision: 7,
  actor: "operator_01",
  provenance: { kind: "console-direct-input", clientId: "client_01", inputEventId: "input_launch_01" },
  evidenceRefs: [artifact],
} as const;
const intent = {
  kind: "project-session-launch",
  projectId: "project_01",
  projectSessionId: "ps_01",
  expectedSessionRevision: 4,
  expectedSessionGeneration: 2,
  launchPacketRef: artifact,
  authorityRef: digest,
  budgetRef: "budget_01",
  resourcePlanRef: { path: "launch/resources.json", digest },
  providerAdapterId: "claude-agent-sdk",
  providerActionId: "provider_action_launch_01",
} as const;

describe("reviewed project-session launch intent", () => {
  it("round-trips the complete closed intent and maps it only to launch authority", () => {
    const parsed = parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command,
      projectId: "project_01",
      intent,
    });
    expect(parsed).toMatchObject({ intent });
    expect(requiredOperatorActionForIntent(parsed.intent)).toBe("launch");
    expect(OPERATION_REGISTRY[FABRIC_OPERATIONS.operatorActionPreview].principals).toStrictEqual(["operator"]);
  });

  it.each([
    "projectId",
    "projectSessionId",
    "expectedSessionRevision",
    "expectedSessionGeneration",
    "launchPacketRef",
    "authorityRef",
    "budgetRef",
    "resourcePlanRef",
    "providerAdapterId",
    "providerActionId",
  ] as const)("rejects a launch intent missing %s", (field) => {
    const incomplete = { ...intent } as Record<string, unknown>;
    delete incomplete[field];
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command,
      projectId: "project_01",
      intent: incomplete,
    })).toThrowError(new RegExp(field, "iu"));
  });

  it("rejects malformed or widened launch authority", () => {
    for (const changed of [
      { ...intent, authorityRef: "not-a-digest" },
      { ...intent, resourcePlanRef: { path: "/outside/root", digest } },
      { ...intent, shell: "claude --dangerously-skip-permissions" },
    ]) {
      expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
        command,
        projectId: "project_01",
        intent: changed,
      })).toThrow();
    }
  });
});

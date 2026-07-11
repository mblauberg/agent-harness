import { describe, expect, it } from "vitest";

import type {
  AgentId,
  CoordinationRunId,
  ProjectId,
  ProjectSessionId,
  ProviderSessionRef,
  Timestamp,
} from "@local/agent-fabric-protocol";

import { reconcileIdentity } from "../src/identity-reconciliation.js";
import type { FabricAgentIdentity, HerdrPaneObservation, HerdrPaneRef } from "../src/contracts.js";

const fabricIdentity: FabricAgentIdentity = {
  projectId: "project-01" as ProjectId,
  projectSessionId: "session-01" as ProjectSessionId,
  coordinationRunId: "run-01" as CoordinationRunId,
  agentId: "agent-01" as AgentId,
  provider: "claude",
  modelFamily: "opus",
  providerSessionRef: "claude-session-01" as ProviderSessionRef,
  providerSessionGeneration: 3,
};

const exactObservation: HerdrPaneObservation = {
  state: "present",
  paneRef: "window-1:pane-2" as HerdrPaneRef,
  observedAt: "2026-07-11T01:00:00Z" as Timestamp,
  identity: {
    projectId: fabricIdentity.projectId,
    projectSessionId: fabricIdentity.projectSessionId,
    coordinationRunId: fabricIdentity.coordinationRunId,
    agentId: fabricIdentity.agentId,
    provider: fabricIdentity.provider,
    modelFamily: fabricIdentity.modelFamily,
    providerSessionRef: fabricIdentity.providerSessionRef,
    providerSessionGeneration: fabricIdentity.providerSessionGeneration,
  },
};

describe("Herdr identity reconciliation", () => {
  it("becomes ready only when Fabric and structured pane identity agree exactly", () => {
    expect(reconcileIdentity(fabricIdentity, exactObservation)).toEqual({
      readiness: "ready",
      ready: true,
      paneRef: exactObservation.paneRef,
    });
  });

  it("treats a present pane without provider identity as presence-only", () => {
    const observation: HerdrPaneObservation = {
      state: "present",
      paneRef: exactObservation.paneRef,
      observedAt: exactObservation.observedAt,
      identity: null,
    };

    expect(reconcileIdentity(fabricIdentity, observation)).toEqual({
      readiness: "identity-unverified",
      ready: false,
      paneRef: exactObservation.paneRef,
      reason: "pane presence is not provider-session evidence",
    });
  });

  it("quarantines mismatched provider-session identity", () => {
    const observation: HerdrPaneObservation = {
      ...exactObservation,
      identity: {
        ...exactObservation.identity!,
        providerSessionGeneration: 2,
      },
    };

    const result = reconcileIdentity(fabricIdentity, observation);

    expect(result.ready).toBe(false);
    expect(result.readiness).toBe("identity-conflict");
    expect(result).toMatchObject({
      paneRef: exactObservation.paneRef,
      mismatches: ["providerSessionGeneration"],
    });
  });

  it("does not infer provider loss from absent or unavailable Herdr presence", () => {
    expect(
      reconcileIdentity(fabricIdentity, {
        state: "absent",
        observedAt: exactObservation.observedAt,
        reason: "pane closed",
      }),
    ).toEqual({
      readiness: "visibility-degraded",
      ready: false,
      paneRef: null,
      reason: "pane closed",
      providerState: "unknown",
    });
  });
});

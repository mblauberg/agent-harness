import { describe, expect, it } from "vitest";

import {
  LifecycleRotationDomain,
  lifecycleDigest,
  type ContextObservation,
  type LifecycleAgentSeed,
  type LifecycleProviderPort,
} from "../../../src/lifecycle/index.ts";

const digest = lifecycleDigest;
const PROJECT = "project-observation";

const provider: LifecycleProviderPort = {
  async dispatchReplacement() { return { status: "ambiguous" }; },
  async lookupReplacement() { return { status: "ambiguous" }; },
};

function seed(): LifecycleAgentSeed {
  return {
    projectSessionId: PROJECT,
    runId: "run-observation",
    agentId: "worker",
    bridgeOwnerId: "chair",
    role: "child",
    lifecycle: "ready",
    provider: {
      reference: "provider:worker:g2",
      providerGeneration: 2,
      contextRevision: 5,
      evidenceDigest: digest("current"),
      historyDigest: digest("history"),
    },
    sourceBinding: {
      capabilityHash: digest("source-capability"),
      custodyAction: { adapterId: "provider", actionId: "source-action" },
      adapterContractDigest: digest("source-contract"),
      bridgeRowId: "bridge:worker:1",
      bridgeRevision: 1,
      projectSessionGeneration: 1,
      runGeneration: 1,
      chairLeaseGeneration: null,
    },
    principalGeneration: 7,
    bridgeGeneration: 9,
    taskRevision: 1,
    mailboxRevision: 1,
    childRevision: 1,
    writeRevision: 1,
    authorityRevision: 1,
    childIds: [],
    openWork: [],
    turns: [],
    writes: [],
    deliveries: [],
    taskOwnerLeases: [],
    barriers: [],
    memberships: [],
    messageWatermark: 0,
    deliveryWatermark: 0,
    membershipWatermark: 0,
    archivalPlan: null,
    sourceCapabilityRevoked: false,
    principalRevoked: false,
    bridgeRevoked: false,
  };
}

function observation(overrides: Partial<ContextObservation> = {}): ContextObservation {
  return {
    sourceEventId: "event-1",
    projectSessionId: PROJECT,
    runId: "run-observation",
    agentId: "worker",
    providerGeneration: 2,
    contextRevision: 5,
    evidenceDigest: digest("current"),
    ...overrides,
  };
}

describe("Spec 05 provider context observations", () => {
  it.each([
    ["lower generation", { providerGeneration: 1, contextRevision: 99 }],
    ["lower same-generation revision", { providerGeneration: 2, contextRevision: 4 }],
  ])("records %s as reordered audit-only and never infers principal or bridge custody", (_label, delta) => {
    const domain = new LifecycleRotationDomain({ provider }, [seed()]);

    expect(domain.observeContext(observation(delta))).toMatchObject({ classification: "reordered-observation", lossId: null });
    expect(domain.inspectAgent(PROJECT, "run-observation", "worker")).toMatchObject({
      lifecycle: "ready",
      provider: { providerGeneration: 2, contextRevision: 5 },
      principalGeneration: 7,
      bridgeGeneration: 9,
    });
    expect(domain.inspectHighWater(PROJECT, "run-observation", "worker")).toEqual({
      providerGeneration: 2,
      principalGeneration: 7,
      bridgeGeneration: 9,
    });
    expect(domain.audits(PROJECT, "run-observation")).toContainEqual(expect.objectContaining({ kind: "context-observation-reordered" }));
  });

  it("treats an exact observation and its source-event replay as no-mutation replays", () => {
    const domain = new LifecycleRotationDomain({ provider }, [seed()]);
    const exact = observation();

    const first = domain.observeContext(exact);
    expect(first).toMatchObject({ classification: "replay", lossId: null });
    expect(domain.observeContext(exact)).toBe(first);
    expect(domain.inspectAgent(PROJECT, "run-observation", "worker")).toMatchObject({
      lifecycle: "ready",
      principalGeneration: 7,
      bridgeGeneration: 9,
    });
  });

  it("rejects a reused event ID with divergent evidence without advancing any high-water", () => {
    const domain = new LifecycleRotationDomain({ provider }, [seed()]);
    const first = observation({ providerGeneration: 1, contextRevision: 1 });
    domain.observeContext(first);

    expect(() => domain.observeContext({ ...first, providerGeneration: 8, evidenceDigest: digest("changed") }))
      .toThrow(expect.objectContaining({ code: "CONTEXT_EVENT_CONFLICT" }));
    expect(domain.inspectHighWater(PROJECT, "run-observation", "worker")).toEqual({
      providerGeneration: 2,
      principalGeneration: 7,
      bridgeGeneration: 9,
    });
    expect(domain.audits(PROJECT, "run-observation")).toHaveLength(1);
  });

  it.each([
    ["context-advance" as const, { providerGeneration: 2, contextRevision: 6 }],
    ["generation-advance" as const, { providerGeneration: 4, contextRevision: 0 }],
  ])("opens one %s loss while ratcheting only provider context", (cause, delta) => {
    const domain = new LifecycleRotationDomain({ provider }, [seed()]);

    const result = domain.observeContext(observation({ ...delta, evidenceDigest: digest(cause) }));

    expect(result).toMatchObject({ classification: cause, lossId: expect.any(String) });
    expect(domain.inspectLoss(PROJECT, "run-observation", result.lossId!)).toMatchObject({ cause, state: "open", actionPair: null });
    expect(domain.inspectAgent(PROJECT, "run-observation", "worker")).toMatchObject({
      lifecycle: "recovery-required",
      provider: delta,
      principalGeneration: 7,
      bridgeGeneration: 9,
    });
    expect(domain.inspectHighWater(PROJECT, "run-observation", "worker")).toEqual({
      providerGeneration: delta.providerGeneration,
      principalGeneration: 7,
      bridgeGeneration: 9,
    });
  });

  it("rehydrates the one immutable source-event classification and audit", () => {
    const domain = new LifecycleRotationDomain({ provider }, [seed()]);
    const input = observation({
      sourceEventId: "durable-event",
      providerGeneration: 4,
      contextRevision: 3,
      evidenceDigest: digest("durable-event"),
    });
    const original = domain.observeContext(input);
    const recovered = LifecycleRotationDomain.hydrate(
      { provider },
      JSON.parse(JSON.stringify(domain.snapshot())) as ReturnType<typeof domain.snapshot>,
    );
    const replay = recovered.observeContext(input);

    expect(replay).toEqual(original);
    expect(Object.isFrozen(replay)).toBe(true);
    expect(Object.isFrozen(replay.audit)).toBe(true);
    expect(recovered.audits(PROJECT, "run-observation")).toHaveLength(1);
  });

  it.each([
    { providerGeneration: 0, contextRevision: 1 },
    { providerGeneration: 2, contextRevision: -1 },
    { providerGeneration: Number.NaN, contextRevision: 1 },
    { providerGeneration: 2, contextRevision: 6, evidenceDigest: "sha256:not-a-digest" as const },
  ])("rejects malformed telemetry before recording its source event", (delta) => {
    const domain = new LifecycleRotationDomain({ provider }, [seed()]);
    expect(() => domain.observeContext(observation(delta)))
      .toThrow(expect.objectContaining({ code: "INVALID_CONTEXT_OBSERVATION" }));
    expect(domain.audits(PROJECT, "run-observation")).toEqual([]);
  });
});

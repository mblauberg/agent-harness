import { describe, expect, it, vi } from "vitest";
import {
  FABRIC_OPERATIONS,
  buildMcpDescriptorSet,
  ProtocolRemoteError,
  ProtocolTransportError,
} from "@local/agent-fabric-protocol";

import {
  createChairLaunchFabricBridge,
} from "../../src/adapters/providers/chair-launch-continuity.ts";
import { AgentSessionFabricBridge } from "../../src/adapters/providers/agent-session-continuity.ts";
import type { ProviderSessionProtocolTransport } from "../../src/adapters/providers/provider-session-fabric-surface.ts";
import {
  chairLaunchChallengeDigest,
  parseChairLaunchProviderResult,
} from "../../src/adapters/providers/types.ts";

const baseBinding = {
  providerAdapterId: "codex-app-server",
  providerActionId: "chair-action-1",
  providerContractDigest: `sha256:${"a".repeat(64)}`,
};

const expectedPrincipal = {
  agentId: "chair",
  projectSessionId: "session-1",
  runId: "run-1",
  principalGeneration: 1,
} as const;

function binding(challenge: string) {
  return {
    ...baseBinding,
    challengeDigest: chairLaunchChallengeDigest(challenge),
    expectedPrincipal,
  };
}

function protocolTransport(
  call: ProviderSessionProtocolTransport["call"],
  close: ProviderSessionProtocolTransport["close"],
  allowedOperations: ReadonlySet<typeof FABRIC_OPERATIONS.getMailboxState> = new Set([FABRIC_OPERATIONS.getMailboxState]),
): ProviderSessionProtocolTransport {
  return {
    features: ["fabric-core.v1", "launch-attestation.v1"],
    principal: {
      kind: "agent",
      agentId: "chair" as never,
      projectSessionId: "session-1" as never,
      runId: "run-1",
      principalGeneration: 1,
    },
    allowedOperations,
    call,
    close,
  };
}

describe("provider-session Fabric continuity", () => {
  it.each([
    ["agent", { agentId: "another-chair" }],
    ["project session", { projectSessionId: "another-session" }],
    ["run", { runId: "another-run" }],
    ["principal generation", { principalGeneration: 2 }],
  ])("rejects the wrong authenticated %s before projecting tools", async (_label, principalChange) => {
    const challenge = "fe".repeat(32);
    const call = vi.fn(async () => ({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] }));
    const close = vi.fn(async () => undefined);

    await expect(createChairLaunchFabricBridge({
      ...binding(challenge),
      capability: "wrong-principal-capability-canary",
      socketPath: "/private/fabric.sock",
      attestationChallenge: challenge,
    }, {
      connect: vi.fn(async () => ({
        ...protocolTransport(call, close),
        principal: {
          kind: "agent" as const,
          ...expectedPrincipal,
          ...principalChange,
        } as ProviderSessionProtocolTransport["principal"],
      })),
    })).rejects.toMatchObject({ code: "CHAIR_PRINCIPAL_MISMATCH" });
    expect(call).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects a launch-local operation when its feature was not negotiated", async () => {
    const challenge = "ff".repeat(32);
    const close = vi.fn(async () => undefined);

    await expect(createChairLaunchFabricBridge({
      ...binding(challenge),
      capability: "missing-feature-capability-canary",
      socketPath: "/private/fabric.sock",
      attestationChallenge: challenge,
    }, {
      connect: vi.fn(async () => ({
        ...protocolTransport(
          vi.fn(async () => ({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] })),
          close,
        ),
        features: ["fabric-core.v1"] as const,
      })),
    })).rejects.toThrow(/feature was not negotiated/iu);
    expect(close).toHaveBeenCalledOnce();
  });

  it("classifies a retained chair grant without mailbox read as unavailable", async () => {
    const challenge = "09".repeat(32);
    const close = vi.fn(async () => undefined);

    await expect(createChairLaunchFabricBridge({
      ...binding(challenge),
      capability: "missing-chair-mailbox-capability-canary",
      socketPath: "/private/fabric.sock",
      attestationChallenge: challenge,
    }, {
      connect: vi.fn(async () => protocolTransport(vi.fn(), close, new Set())),
    })).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("projects and dispatches the complete generated launch grant over the public protocol", async () => {
    const challenge = "00".repeat(32);
    const allowedOperations = new Set([FABRIC_OPERATIONS.getMailboxState]);
    const call = vi.fn(async () => ({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] }));
    const close = vi.fn(async () => undefined);
    const bridge = await createChairLaunchFabricBridge({
      ...binding(challenge),
      capability: "public-protocol-capability-canary",
      socketPath: "/private/fabric.sock",
      attestationChallenge: challenge,
    }, {
      connect: vi.fn(async () => ({
        ...protocolTransport(call, close, allowedOperations),
      })),
    });
    const descriptors = Reflect.get(bridge, "descriptors") as unknown;
    const invokeTool = Reflect.get(bridge, "invokeTool") as unknown;

    expect(descriptors).toStrictEqual(buildMcpDescriptorSet(new Set([
      ...allowedOperations,
      FABRIC_OPERATIONS.launchAttest,
    ])).tools);
    expect(typeof invokeTool).toBe("function");
    expect(JSON.stringify(descriptors)).not.toContain("public-protocol-capability-canary");
    expect(JSON.stringify(descriptors)).not.toContain(challenge);
  });

  it("cannot turn a wrapper-owned Fabric connection into session attestation", async () => {
    const challenge = "01".repeat(32);
    const call = vi.fn(async () => ({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] }));
    const close = vi.fn(async () => undefined);
    const bridge = await createChairLaunchFabricBridge({
      ...binding(challenge),
      capability: "wrapper-only-capability-canary",
      socketPath: "/private/fabric.sock",
      attestationChallenge: challenge,
    }, {
      connect: vi.fn(async () => protocolTransport(call, close)),
    });
    bridge.bindProviderSession("thread-1", 1);

    await expect(bridge.result()).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    expect(call).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    await bridge.close();
  });

  it("accepts exactly one provider-originated challenge invocation and retains the bridge", async () => {
    const challenge = "02".repeat(32);
    const call = vi.fn(async () => ({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] }));
    const close = vi.fn(async () => undefined);
    const bridge = await createChairLaunchFabricBridge({
      ...binding(challenge),
      capability: "provider-origin-capability-canary",
      socketPath: "/private/fabric.sock",
      attestationChallenge: challenge,
    }, {
      connect: vi.fn(async () => protocolTransport(call, close)),
    });
    bridge.bindProviderSession("thread-1", 1);

    await expect(bridge.invokeTool(bridge.challengeToolName, {
      challengeResponse: challenge,
    }, {
      providerSessionRef: "wrong-thread",
      providerSessionGeneration: 1,
      providerTurnRef: "wrong-turn",
      providerInvocationRef: "wrong-call",
    })).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    await expect(bridge.invokeTool(bridge.challengeToolName, {}, {
      providerSessionRef: "thread-1",
      providerSessionGeneration: 1,
      providerTurnRef: "turn-1",
      providerInvocationRef: "missing-challenge",
    } as never)).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    await expect(bridge.invokeTool(bridge.challengeToolName, {
      challengeResponse: Buffer.alloc(32, 9).toString("hex"),
    }, {
      providerSessionRef: "thread-1",
      providerSessionGeneration: 1,
      providerTurnRef: "turn-1",
      providerInvocationRef: "wrong-challenge",
    })).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    const attested = await bridge.invokeTool(bridge.challengeToolName, {
      challengeResponse: challenge,
    }, {
      providerSessionRef: "thread-1",
      providerSessionGeneration: 1,
      providerTurnRef: "turn-1",
      providerInvocationRef: "tool-call-1",
    });
    expect(attested).toMatchObject({
      receipt: "launch continuity attested",
      structuredContent: { attested: true, challengeDigest: chairLaunchChallengeDigest(challenge) },
    });
    expect(JSON.stringify(attested)).not.toContain(challenge);
    expect(() => bridge.challengeResponse).toThrow(/challenge was consumed/iu);
    await expect(bridge.invokeTool(bridge.challengeToolName, {
      challengeResponse: challenge,
    }, {
      providerSessionRef: "thread-1",
      providerSessionGeneration: 1,
      providerTurnRef: "turn-1",
      providerInvocationRef: "tool-call-replay",
    })).rejects.toMatchObject({ code: "CHAIR_ATTESTATION_REPLAY" });

    const result = await bridge.result();
    expect(result).toMatchObject({
      resumeReference: "thread-1",
      providerSessionGeneration: 1,
      fabricContinuity: {
        schemaVersion: 1,
        kind: "provider-session-fabric-attestation",
        method: "provider-session-random-challenge-v1",
        bridgeContract: "agent-fabric-session-bridge-v1",
        ...baseBinding,
        providerSessionRef: "thread-1",
        providerSessionGeneration: 1,
        providerTurnRef: "turn-1",
        challengeDigest: chairLaunchChallengeDigest(challenge),
        providerInvocationRef: "tool-call-1",
        attestationDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
    });
    expect(() => parseChairLaunchProviderResult(result, binding(challenge))).not.toThrow();
    expect(JSON.stringify(result)).not.toContain("provider-origin-capability-canary");
    expect(JSON.stringify(result)).not.toContain(challenge);
    expect(close).not.toHaveBeenCalled();

    await expect(bridge.invokeTool("fabric_mailbox_read", {}, {
      providerSessionRef: "thread-1",
      providerSessionGeneration: 1,
      providerTurnRef: "turn-2",
      providerInvocationRef: "tool-call-2",
    })).resolves.toMatchObject({
      receipt: "fabric_mailbox_read completed",
      structuredContent: { contiguousWatermark: 0, acknowledgedAboveWatermark: [] },
    });
    expect(call).toHaveBeenCalledTimes(2);
    await bridge.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps an authenticated retained chair bridge alive across negotiated idle windows", async () => {
    vi.useFakeTimers();
    try {
      const challenge = "04".repeat(32);
      const call = vi.fn<ProviderSessionProtocolTransport["call"]>(async () => (
        { contiguousWatermark: 0, acknowledgedAboveWatermark: [] }
      ));
      const close = vi.fn(async () => undefined);
      const transport = Object.assign(protocolTransport(call, close), { idleTimeoutMs: 1_000 });
      const bridge = await createChairLaunchFabricBridge({
        ...binding(challenge),
        capability: "retained-keepalive-capability-canary",
        socketPath: "/private/fabric.sock",
        attestationChallenge: challenge,
      }, {
        connect: vi.fn(async () => transport),
      });
      bridge.bindProviderSession("retained-thread-1", 1);
      await bridge.invokeTool(bridge.challengeToolName, { challengeResponse: challenge }, {
        providerSessionRef: "retained-thread-1",
        providerSessionGeneration: 1,
        providerTurnRef: "turn-1",
        providerInvocationRef: "tool-call-1",
      });
      await bridge.result();
      const activationCalls = call.mock.calls.length;

      await vi.advanceTimersByTimeAsync(2_500);

      expect(call.mock.calls.length).toBeGreaterThan(activationCalls);
      expect(call.mock.calls.slice(activationCalls).every(([operation, input]) => (
        operation === FABRIC_OPERATIONS.getMailboxState && JSON.stringify(input) === "{}"
      ))).toBe(true);
      expect(bridge.closed).toBe(false);
      await bridge.close();
      const callsAtClose = call.mock.calls.length;
      await vi.advanceTimersByTimeAsync(2_000);
      expect(call).toHaveBeenCalledTimes(callsAtClose);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the same negotiated keepalive for an authenticated retained child bridge", async () => {
    vi.useFakeTimers();
    try {
      const call = vi.fn(async () => ({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] }));
      const close = vi.fn(async () => undefined);
      const transport = Object.assign(protocolTransport(call, close), { idleTimeoutMs: 1_000 });
      const bridge = Reflect.construct(
        AgentSessionFabricBridge as unknown as new (...args: never[]) => AgentSessionFabricBridge,
        [{
          providerAdapterId: "codex-app-server",
          providerActionId: "child-action-1",
          targetAgentId: expectedPrincipal.agentId,
          expectedPrincipal,
          bridgeGeneration: 1,
          bridgeContractDigest: `sha256:${"b".repeat(64)}`,
          capability: "retained-child-capability-canary",
          socketPath: "/private/fabric.sock",
        }, transport],
      ) as AgentSessionFabricBridge;
      bridge.bindProviderSession("retained-child-thread-1", 1);
      const mailbox = bridge.descriptors.find(({ operation }) => operation === FABRIC_OPERATIONS.getMailboxState);
      expect(mailbox).toBeDefined();
      await bridge.invokeTool(mailbox!.name, {}, {
        providerSessionRef: "retained-child-thread-1",
        providerSessionGeneration: 1,
        providerTurnRef: "turn-1",
        providerInvocationRef: "tool-call-1",
      });
      bridge.result();
      const activationCalls = call.mock.calls.length;

      await vi.advanceTimersByTimeAsync(2_500);

      expect(call.mock.calls.length).toBeGreaterThan(activationCalls);
      expect(bridge.closed).toBe(false);
      await bridge.close();
      const callsAtClose = call.mock.calls.length;
      await vi.advanceTimersByTimeAsync(2_000);
      expect(call).toHaveBeenCalledTimes(callsAtClose);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes a retained bridge when its authenticated keepalive fails", async () => {
    vi.useFakeTimers();
    try {
      const challenge = "05".repeat(32);
      let closed = false;
      const call = vi.fn()
        .mockResolvedValueOnce({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] })
        .mockImplementationOnce(async () => {
          closed = true;
          throw new ProtocolTransportError("PROTOCOL_DISCONNECTED", "inner Fabric transport lost");
        });
      const close = vi.fn(async () => { closed = true; });
      const transport = Object.assign(protocolTransport(call, close), { idleTimeoutMs: 1_000 });
      Object.defineProperty(transport, "closed", { get: () => closed });
      const bridge = await createChairLaunchFabricBridge({
        ...binding(challenge),
        capability: "failed-keepalive-capability-canary",
        socketPath: "/private/fabric.sock",
        attestationChallenge: challenge,
      }, {
        connect: vi.fn(async () => transport),
      });
      bridge.bindProviderSession("failed-keepalive-thread-1", 1);
      await bridge.invokeTool(bridge.challengeToolName, { challengeResponse: challenge }, {
        providerSessionRef: "failed-keepalive-thread-1",
        providerSessionGeneration: 1,
        providerTurnRef: "turn-1",
        providerInvocationRef: "tool-call-1",
      });
      await bridge.result();

      await vi.advanceTimersByTimeAsync(500);

      expect(close).toHaveBeenCalledOnce();
      expect(bridge.closed).toBe(true);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(call).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the keepalive timer when the retained transport closes between ticks", async () => {
    vi.useFakeTimers();
    try {
      const challenge = "08".repeat(32);
      let closed = false;
      const call = vi.fn(async () => ({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] }));
      const transport = Object.assign(protocolTransport(call, vi.fn(async () => undefined)), { idleTimeoutMs: 1_000 });
      Object.defineProperty(transport, "closed", { get: () => closed });
      const bridge = await createChairLaunchFabricBridge({
        ...binding(challenge),
        capability: "externally-closed-keepalive-capability-canary",
        socketPath: "/private/fabric.sock",
        attestationChallenge: challenge,
      }, { connect: vi.fn(async () => transport) });
      bridge.bindProviderSession("externally-closed-thread-1", 1);
      await bridge.invokeTool(bridge.challengeToolName, { challengeResponse: challenge }, {
        providerSessionRef: "externally-closed-thread-1",
        providerSessionGeneration: 1,
        providerTurnRef: "turn-1",
        providerInvocationRef: "tool-call-1",
      });
      await bridge.result();
      expect(vi.getTimerCount()).toBe(1);

      closed = true;
      await vi.advanceTimersByTimeAsync(334);

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    new ProtocolTransportError("PROTOCOL_OVERLOADED", "protocol pending-call limit reached"),
    new ProtocolTransportError("PROTOCOL_TIMEOUT", "queued protocol request timed out: fabric.v1.mailbox.read"),
    new ProtocolRemoteError({ code: "OVERLOADED", message: "daemon busy", retryable: true }),
  ])("retries a live retained bridge after a non-terminal keepalive error", async (transientError) => {
    vi.useFakeTimers();
    try {
      const challenge = "06".repeat(32);
      const call = vi.fn()
        .mockResolvedValueOnce({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] })
        .mockRejectedValueOnce(transientError)
        .mockResolvedValue({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] });
      const close = vi.fn(async () => undefined);
      const transport = Object.assign(protocolTransport(call, close), { idleTimeoutMs: 1_000, closed: false });
      const bridge = await createChairLaunchFabricBridge({
        ...binding(challenge),
        capability: "transient-keepalive-capability-canary",
        socketPath: "/private/fabric.sock",
        attestationChallenge: challenge,
      }, { connect: vi.fn(async () => transport) });
      bridge.bindProviderSession("transient-keepalive-thread-1", 1);
      await bridge.invokeTool(bridge.challengeToolName, { challengeResponse: challenge }, {
        providerSessionRef: "transient-keepalive-thread-1",
        providerSessionGeneration: 1,
        providerTurnRef: "turn-1",
        providerInvocationRef: "tool-call-1",
      });
      await bridge.result();

      await vi.advanceTimersByTimeAsync(500);
      expect(close).not.toHaveBeenCalled();
      expect(bridge.closed).toBe(false);
      await vi.advanceTimersByTimeAsync(500);
      expect(call.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(close).not.toHaveBeenCalled();
      await bridge.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a retained lifecycle child whose narrow grant cannot carry the keepalive", () => {
    const expectedChild = { ...expectedPrincipal, agentId: "narrow-child", principalGeneration: 2 } as const;
    const challenge = "07".repeat(32);
    const transport = {
      ...protocolTransport(vi.fn(), vi.fn(async () => undefined), new Set()),
      principal: { kind: "agent", ...expectedChild } as ProviderSessionProtocolTransport["principal"],
    };
    expect(() => Reflect.construct(
      AgentSessionFabricBridge as unknown as new (...args: never[]) => AgentSessionFabricBridge,
      [{
        providerAdapterId: "codex-app-server",
        providerActionId: "narrow-child-action",
        targetAgentId: expectedChild.agentId,
        expectedPrincipal: expectedChild,
        bridgeGeneration: 2,
        bridgeContractDigest: `sha256:${"c".repeat(64)}`,
        capability: "narrow-child-capability-canary",
        socketPath: "/private/fabric.sock",
        lifecycleAttestation: {
          custodyId: "narrow-child-custody",
          checkpointDigest: `sha256:${"d".repeat(64)}`,
          challengeDigest: chairLaunchChallengeDigest(challenge),
          challenge,
        },
      }, transport],
    )).toThrow(expect.objectContaining({ code: "CAPABILITY_UNAVAILABLE" }));
  });

  it("cannot succeed after the owning bridge is torn down", async () => {
    const challenge = "03".repeat(32);
    const bridge = await createChairLaunchFabricBridge({
      ...binding(challenge),
      capability: "closed-bridge-capability-canary",
      socketPath: "/private/fabric.sock",
      attestationChallenge: challenge,
    }, {
      connect: vi.fn(async () => protocolTransport(
        vi.fn(async () => ({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] })),
        vi.fn(async () => undefined),
      )),
    });
    bridge.bindProviderSession("thread-1", 1);
    await bridge.invokeTool(bridge.challengeToolName, { challengeResponse: challenge }, {
      providerSessionRef: "thread-1",
      providerSessionGeneration: 1,
      providerTurnRef: "turn-1",
      providerInvocationRef: "tool-call-1",
    });
    await bridge.close();

    await expect(bridge.result()).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
  });

  it("rejects open daemon results before projecting them to the provider session", async () => {
    const challenge = "04".repeat(32);
    let calls = 0;
    const bridge = await createChairLaunchFabricBridge({
      ...binding(challenge),
      capability: "closed-result-capability-canary",
      socketPath: "/private/fabric.sock",
      attestationChallenge: challenge,
    }, {
      connect: vi.fn(async () => protocolTransport(
        vi.fn(async () => {
          calls += 1;
          return calls === 1
            ? { contiguousWatermark: 0, acknowledgedAboveWatermark: [] }
            : { contiguousWatermark: 0, acknowledgedAboveWatermark: [], rawProviderOutput: "forbidden" };
        }),
        vi.fn(async () => undefined),
      )),
    });
    bridge.bindProviderSession("thread-1", 1);
    await bridge.invokeTool(bridge.challengeToolName, { challengeResponse: challenge }, {
      providerSessionRef: "thread-1",
      providerSessionGeneration: 1,
      providerTurnRef: "turn-1",
      providerInvocationRef: "tool-call-1",
    });

    await expect(bridge.invokeTool("fabric_mailbox_read", {}, {
      providerSessionRef: "thread-1",
      providerSessionGeneration: 1,
      providerTurnRef: "turn-2",
      providerInvocationRef: "tool-call-2",
    })).rejects.toThrow(/unknown field/iu);
  });
});

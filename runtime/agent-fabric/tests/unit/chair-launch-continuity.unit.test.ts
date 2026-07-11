import { describe, expect, it, vi } from "vitest";
import {
  FABRIC_OPERATIONS,
  buildMcpDescriptorSet,
} from "@local/agent-fabric-protocol";

import {
  createChairLaunchFabricBridge,
} from "../../src/adapters/providers/chair-launch-continuity.ts";
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

function binding(challenge: string) {
  return { ...baseBinding, challengeDigest: chairLaunchChallengeDigest(challenge) };
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
        features: ["fabric-core.v1"],
      })),
    })).rejects.toThrow(/feature was not negotiated/iu);
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
        challengeResponse: challenge,
        challengeDigest: chairLaunchChallengeDigest(challenge),
        providerInvocationRef: "tool-call-1",
        attestationDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
    });
    expect(() => parseChairLaunchProviderResult(result, binding(challenge))).not.toThrow();
    expect(JSON.stringify(result)).not.toContain("provider-origin-capability-canary");
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

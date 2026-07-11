import { describe, expect, it, vi } from "vitest";

import {
  createChairLaunchFabricBridge,
} from "../../src/adapters/providers/chair-launch-continuity.ts";
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

describe("provider-session Fabric continuity", () => {
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
      connect: vi.fn(async () => ({ call, close })),
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
      connect: vi.fn(async () => ({ call, close })),
    });
    bridge.bindProviderSession("thread-1", 1);

    await expect(bridge.attest({
      providerSessionRef: "wrong-thread",
      providerSessionGeneration: 1,
      providerTurnRef: "wrong-turn",
      providerInvocationRef: "wrong-call",
      challengeResponse: challenge,
    })).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    await expect(bridge.attest({
      providerSessionRef: "thread-1",
      providerSessionGeneration: 1,
      providerTurnRef: "turn-1",
      providerInvocationRef: "missing-challenge",
    } as never)).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    await expect(bridge.attest({
      providerSessionRef: "thread-1",
      providerSessionGeneration: 1,
      providerTurnRef: "turn-1",
      providerInvocationRef: "wrong-challenge",
      challengeResponse: Buffer.alloc(32, 9).toString("hex"),
    })).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    await bridge.attest({
      providerSessionRef: "thread-1",
      providerSessionGeneration: 1,
      providerTurnRef: "turn-1",
      providerInvocationRef: "tool-call-1",
      challengeResponse: challenge,
    });
    await expect(bridge.attest({
      providerSessionRef: "thread-1",
      providerSessionGeneration: 1,
      providerTurnRef: "turn-1",
      providerInvocationRef: "tool-call-replay",
      challengeResponse: challenge,
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

    await expect(bridge.call("getMailboxState", {})).resolves.toEqual({
      contiguousWatermark: 0,
      acknowledgedAboveWatermark: [],
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
      connect: vi.fn(async () => ({
        call: vi.fn(async () => ({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] })),
        close: vi.fn(async () => undefined),
      })),
    });
    bridge.bindProviderSession("thread-1", 1);
    await bridge.attest({
      providerSessionRef: "thread-1",
      providerSessionGeneration: 1,
      providerTurnRef: "turn-1",
      providerInvocationRef: "tool-call-1",
      challengeResponse: challenge,
    });
    await bridge.close();

    await expect(bridge.result()).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
  });
});

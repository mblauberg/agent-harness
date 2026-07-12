import { describe, expect, it } from "vitest";

import { parseLaunchAdapterContract } from "../../src/project-session/launch-custody.ts";

const contract = {
  schemaVersion: 1,
  method: "launch_chair",
  oneUse: true,
  secretTransport: "private-environment",
  environment: {
    capability: "AGENT_FABRIC_CAPABILITY",
    socketPath: "AGENT_FABRIC_SOCKET_PATH",
    attestationChallenge: "AGENT_FABRIC_ATTESTATION_CHALLENGE",
  },
  inputSchemaId: "chair-launch-input.v1",
  publicPayloadSchema: {
    type: "object",
    additionalProperties: false,
    required: ["model"],
    properties: { model: { type: "string" } },
  },
  noEffectProofSchemas: {},
  attestation: {
    method: "provider-session-random-challenge-v1",
    bridgeContract: "agent-fabric-session-bridge-v1",
    origin: "provider-session-tool-call",
    oneUse: true,
    bridgeLifetime: "provider-session",
    digestAlgorithm: "sha256",
    nativeAttribution: "claude-sdk-assistant-request-tool-use-v1",
  },
} as const;

describe("launch adapter contract", () => {
  it("requires the exact provider-session attestation contract", () => {
    expect(parseLaunchAdapterContract(contract)).toEqual(contract);
    expect(() => parseLaunchAdapterContract({
      ...contract,
      attestation: { ...contract.attestation, method: "wrapper-mailbox-probe-v1" },
    })).toThrow(/attestation/u);
    expect(() => parseLaunchAdapterContract({
      ...contract,
      attestation: { ...contract.attestation, wrapperMayAttest: true },
    })).toThrow(/unknown field/u);
    expect(() => parseLaunchAdapterContract({
      ...contract,
      attestation: { ...contract.attestation, nativeAttribution: "wrapper-generated-call-v1" },
    })).toThrow(/attestation/u);
  });
});

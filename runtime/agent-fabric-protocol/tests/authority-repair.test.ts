import { describe, expect, it } from "vitest";

import {
  createOperatorClient,
  FABRIC_OPERATIONS,
  parseOperationInput,
  parseIntegrationInputAttestationRequest,
  parseScopedGateCheckRequest,
  type FabricOperation,
  type OperationInputMap,
  type OperationResultMap,
  type ProtocolFeature,
  type ProtocolPrincipal,
  type ProtocolRpcTransport,
} from "../src/index.js";

class NoopTransport implements ProtocolRpcTransport {
  readonly features: readonly ProtocolFeature[] = ["scoped-gates.v1", "input-attestation.v1"];
  readonly principal: ProtocolPrincipal = {
    kind: "operator",
    operatorId: "operator_01" as never,
    projectId: "project_01" as never,
    projectAuthorityGeneration: 1,
    principalGeneration: 1,
  };
  readonly allowedOperations: ReadonlySet<FabricOperation> = new Set([
    "fabric.v1.scoped-gate.create",
    "fabric.v1.scoped-gate.resolve",
  ]);

  call<Operation extends keyof OperationInputMap & FabricOperation>(
    _operation: Operation,
    _input: OperationInputMap[Operation],
  ): Promise<OperationResultMap[Operation]> {
    return Promise.reject(new Error("not called"));
  }

  async close(): Promise<void> {}
}

describe("operator mutation surface", () => {
  it("does not expose gate rebind or integration attestation to an operator", () => {
    const client = createOperatorClient(new NoopTransport());

    expect(client.gates).toBeDefined();
    expect(Object.hasOwn(client.gates ?? {}, "rebind")).toBe(false);
    expect(Object.hasOwn(client, "attestInput")).toBe(false);
  });

  it.each([
    [FABRIC_OPERATIONS.scopedGateCreate, { command: { spoof: true }, gate: {} }],
    [FABRIC_OPERATIONS.scopedGateResolve, {
      command: { spoof: true },
      gateId: "gate_01",
      status: "approved",
      decisionEvidence: { kind: "typed-console" },
    }],
    [FABRIC_OPERATIONS.intakeRevise, {
      origin: "operator",
      command: { spoof: true },
      intakeId: "intake_01",
      expectedRevision: 1,
      state: "accepted",
      summary: "accepted",
      artifactRefs: [],
      gateIds: [],
    }],
  ] as const)("rejects a malformed authenticated command for %s", (operation, input) => {
    expect(() => parseOperationInput(operation, input)).toThrowError(/unknown field|command must be an object|credential/);
  });
});

describe("discriminated gate enforcement checks", () => {
  it.each([
    { enforcementPoint: "task-readiness", taskId: "task_01" },
    { enforcementPoint: "operation", operationId: "fabric.v1.operator-action.preview" },
    { enforcementPoint: "scoped-barrier", barrierId: "barrier_01" },
  ] as const)("accepts a targeted $enforcementPoint check", (target) => {
    expect(parseScopedGateCheckRequest({
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      dependencyRevision: 3,
      ...target,
    })).toMatchObject(target);
  });

  it("rejects a targetless operation check", () => {
    expect(() => parseScopedGateCheckRequest({
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      dependencyRevision: 3,
      enforcementPoint: "operation",
    })).toThrowError(/operationId is required/);
  });
});

const integrationAttestation = {
  context: {
    commandId: "command_attest_01",
    integrationId: "integration_codex",
    expectedIntegrationGeneration: 4,
    eventId: "input_event_01",
    eventDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  attestation: {
    attestationId: "attestation_01",
    integrationId: "integration_codex",
    integrationGeneration: 4,
    operatorId: "operator_01",
    projectId: "project_01",
    projectSessionId: "ps_01",
    providerEvent: {
      providerId: "codex",
      providerSessionRef: "thread_01",
      providerMessageId: "message_provider_01",
      inputEventId: "input_event_01",
      eventDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      classification: "direct-human",
    },
    humanUtterance: "Approve gate 1.",
    gateBinding: {
      gateId: "gate_01",
      expectedGateRevision: 2,
      artifactDigests: ["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
      interpretedDecision: "approve",
    },
    recordedAt: "2026-07-11T10:00:00Z",
  },
} as const;

describe("integration-origin input attestation", () => {
  it("accepts an immutable provider event bound to the authenticated integration generation", () => {
    expect(parseIntegrationInputAttestationRequest(integrationAttestation)).toStrictEqual(integrationAttestation);
  });

  it("rejects a stale or self-selected integration generation", () => {
    expect(() => parseIntegrationInputAttestationRequest({
      ...integrationAttestation,
      attestation: { ...integrationAttestation.attestation, integrationGeneration: 3 },
    })).toThrowError(/integration generation does not match/);
  });

  it.each(["echo", "pane-injection", "agent-authored"])("rejects %s input classification", (classification) => {
    expect(() => parseIntegrationInputAttestationRequest({
      ...integrationAttestation,
      attestation: {
        ...integrationAttestation.attestation,
        providerEvent: { ...integrationAttestation.attestation.providerEvent, classification },
      },
    })).toThrowError(/classification must be direct-human/);
  });
});

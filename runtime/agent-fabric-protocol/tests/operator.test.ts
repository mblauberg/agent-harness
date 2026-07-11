import { describe, expect, it } from "vitest";

import {
  parseOperatorCapabilityGrant,
  parseOperatorInputAttestation,
} from "../src/index.js";

const baseCapability = {
  capabilityId: "cap_01",
  operatorId: "operator_01",
  projectId: "project_01",
  principalGeneration: 3,
  issuedAt: "2026-07-11T08:00:00.000Z",
  expiresAt: "2026-07-11T09:00:00.000Z",
  status: "active",
} as const;

describe("operator capability schema", () => {
  it("accepts a project-bound launch grant before a session exists", () => {
    const grant = {
      ...baseCapability,
      kind: "project-launch",
      actions: ["read", "launch"],
    } as const;

    expect(parseOperatorCapabilityGrant(grant)).toStrictEqual(grant);
  });

  it("rejects takeover authority without exact handoff and generation bindings", () => {
    expect(() => parseOperatorCapabilityGrant({
      ...baseCapability,
      kind: "takeover",
      projectSessionId: "ps_01",
      sessionGeneration: 2,
      actions: ["read", "takeover"],
    })).toThrowError(/takeoverBinding is required/);
  });

  it("rejects a plain session grant that smuggles takeover authority", () => {
    expect(() => parseOperatorCapabilityGrant({
      ...baseCapability,
      kind: "session",
      projectSessionId: "ps_01",
      sessionGeneration: 2,
      actions: ["read", "takeover"],
    })).toThrowError(/takeover action requires a takeover capability/);
  });
});

const directInputAttestation = {
  attestationId: "attest_01",
  integrationId: "integration_codex",
  integrationGeneration: 3,
  operatorId: "operator_01",
  projectId: "project_01",
  projectSessionId: "ps_01",
  humanUtterance: "Accept gate G-1 for the reviewed digest.",
  providerEvent: {
    providerId: "codex",
    providerSessionRef: "thread_01",
    providerMessageId: "provider-message-01",
    inputEventId: "input_01",
    eventDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    classification: "direct-human",
  },
  gateBinding: {
    gateId: "gate_01",
    expectedGateRevision: 4,
    artifactDigests: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    interpretedDecision: "approve",
  },
  recordedAt: "2026-07-11T08:15:00.000Z",
} as const;

describe("operator direct-input attestation schema", () => {
  it("accepts integration-recorded direct provider input", () => {
    expect(parseOperatorInputAttestation(directInputAttestation)).toStrictEqual(directInputAttestation);
  });

  it("rejects pane-injected text as approval provenance", () => {
    expect(() => parseOperatorInputAttestation({
      ...directInputAttestation,
      providerEvent: { ...directInputAttestation.providerEvent, classification: "pane-injection" },
    })).toThrowError(/classification must be direct-human/);
  });

  it("rejects agent-authored input provenance", () => {
    expect(() => parseOperatorInputAttestation({
      ...directInputAttestation,
      providerEvent: { ...directInputAttestation.providerEvent, classification: "agent-authored" },
    })).toThrowError(/classification must be direct-human/);
  });
});

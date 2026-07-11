import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  OPERATION_CONTRACT_FIXTURES,
  OPERATION_INPUT_SHAPES,
  OPERATION_RESULT_SHAPES,
  parseOperationInput,
  parseOperationResult,
  parseScopedGate,
  type ProtocolOperation,
} from "../src/index.js";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const timestamp = "2026-07-11T10:00:00Z";
const operatorCommand = {
  credential: { capabilityId: "capability_01", token: "secret-token-0001" },
  commandId: "command_01",
  expectedRevision: 1,
  actor: "operator_01",
  provenance: { kind: "console-direct-input", clientId: "client_01", inputEventId: "input_01" },
  evidenceRefs: [],
} as const;

describe("retired gate wire operation", () => {
  it("recognises but terminally rejects the legacy agent approval operation", () => {
    const fixture = OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.resolveHumanGate];
    expect(() => parseOperationInput(FABRIC_OPERATIONS.resolveHumanGate, fixture.input)).toThrowError(/retired.*scoped-gate/iu);
  });
});

describe("daemon-derived scoped-gate records", () => {
  it("rejects gate creation that authors persisted identity, graph, revision, creator or approver fields", () => {
    const oldFixture = OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.scopedGateCreate];
    expect(() => parseOperationInput(FABRIC_OPERATIONS.scopedGateCreate, {
      command: operatorCommand,
      gate: oldFixture.result,
    })).toThrowError(
      /unknown field|daemon-derived/iu,
    );
  });

  it("rejects an operation enforcement point without a blocked operation target", () => {
    expect(() => parseOperationInput(FABRIC_OPERATIONS.scopedGateCreate, {
      command: operatorCommand,
      intent: {
        projectSessionId: "ps_01",
        coordinationRunId: "run_01",
        dedupeKey: "gate_intent_01",
        scope: { kind: "task", taskId: "task_01" },
        blockedOperationIds: [],
        enforcementPoints: ["operation"],
        question: "Proceed?",
        reason: "Human decision required.",
        options: ["Approve", "Reject"],
        recommendation: "Approve",
        consequences: ["Implementation proceeds."],
        evidenceRefs: [],
      },
    })).toThrowError(/blockedOperationIds.*non-empty/iu);
  });

  it("represents typed-console resolution without a fabricated input attestation", () => {
    expect(() => parseScopedGate({
      gateId: "gate_01",
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      scope: { kind: "task", taskId: "task_01" },
      affectedTaskIds: ["task_01"],
      dependencyRevision: 1,
      blockedOperationIds: [FABRIC_OPERATIONS.taskCompleteWithReply],
      enforcementPoints: ["operation"],
      question: "Proceed?",
      reason: "Human decision required.",
      options: ["Approve", "Reject"],
      recommendation: "Approve",
      consequences: ["Implementation proceeds."],
      evidenceRefs: [],
      revision: 2,
      createdByRef: "operator_01",
      expectedApproverRef: "operator_01",
      status: "approved",
      resolution: {
        kind: "typed-console",
        operatorId: "operator_01",
        confirmationCommandId: "command_confirm_01",
        decidedAt: timestamp,
        evidenceRefs: [],
      },
    })).not.toThrow();
  });

  it("requires an immutable command binding for typed-console decisions", () => {
    expect(() => parseOperationInput(FABRIC_OPERATIONS.scopedGateResolve, {
      command: operatorCommand,
      gateId: "gate_01",
      status: "approved",
      decisionEvidence: { kind: "typed-console" },
    })).toThrowError(/confirmationCommandId.*required/iu);
  });
});

describe("project-bound operator attachment", () => {
  it("accepts a project attachment before a project session exists", () => {
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorAttach, {
      command: operatorCommand,
      projectId: "project_01",
      requestedExpiresAt: timestamp,
    })).not.toThrow();
  });
});

describe("semantic operation boundaries", () => {
  it("rejects unsafe message-body literals", () => {
    expect(() => parseOperationResult(FABRIC_OPERATIONS.messageBodyRead, {
      available: true,
      messageId: "message_01",
      revision: 1,
      body: "safe body",
      terminalNeutralised: false,
      capabilityValuesRedacted: false,
      artifactRefs: [],
    })).toThrowError(/terminalNeutralised|capabilityValuesRedacted/);
  });

  it("requires explicit projection continuation state", () => {
    expect(() => parseOperationResult(FABRIC_OPERATIONS.projectionEvents, {
      events: [],
      nextCursor: 1,
    })).toThrowError(/status|hasMore|snapshotRevision|resnapshot/iu);
  });

  it.each(Object.keys(OPERATION_CONTRACT_FIXTURES) as ProtocolOperation[])(
    "rejects a wrong-type required input boundary for %s",
    (operation) => {
      const shape = OPERATION_INPUT_SHAPES[operation];
      const fixture = OPERATION_CONTRACT_FIXTURES[operation];
      const field = shape.required[0];
      if (field === undefined) return;
      expect(() => parseOperationInput(operation, { ...(fixture.input as object), [field]: null })).toThrow();
    },
  );

  it.each(Object.keys(OPERATION_CONTRACT_FIXTURES) as ProtocolOperation[])(
    "rejects a wrong-type required result boundary for %s",
    (operation) => {
      const shape = OPERATION_RESULT_SHAPES[operation];
      const fixture = OPERATION_CONTRACT_FIXTURES[operation];
      if (shape.kind === "null") {
        expect(() => parseOperationResult(operation, {})).toThrow();
        return;
      }
      if (shape.kind === "array") {
        expect(() => parseOperationResult(operation, {})).toThrow();
        return;
      }
      const field = shape.required[0];
      if (field === undefined) return;
      expect(() => parseOperationResult(operation, { ...(fixture.result as object), [field]: null })).toThrow();
    },
  );

  it("rejects malformed nested projection credentials", () => {
    expect(() => parseOperationInput(FABRIC_OPERATIONS.projectionSnapshot, {
      credential: { spoof: true },
      projectId: "project_01",
    })).toThrowError(/credential/);
  });

  it("rejects malformed digest and path results instead of casting them", () => {
    expect(() => parseOperationResult(FABRIC_OPERATIONS.publishArtifact, {
      artifactId: "artifact_01",
      relativePath: "../escape",
      sha256: digest.slice(0, -1),
    })).toThrow();
  });
});

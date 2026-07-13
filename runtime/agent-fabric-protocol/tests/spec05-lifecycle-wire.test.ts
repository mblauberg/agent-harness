import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC,
  LIFECYCLE_CURRENT_STATE_V1_CODEC,
  LIFECYCLE_CUSTODY_ROW_V1_CODEC,
  LIFECYCLE_GENERATION_LOSS_ROW_V1_CODEC,
  OPERATION_REGISTRY,
  addProtocolSchemaKeywords,
  parseOperationInput,
  parseOperationResult,
  parseOperationResultForInput,
  protocolResponseSchemasFor,
  protocolRequestSchemaFor,
  operationsForPrincipal,
  requiredOperatorActionForIntent,
} from "../src/index.js";

const digestA = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const digestB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const digestC = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const credential = { capabilityId: "capability_01", token: "test-capability-token" } as const;
const command = {
  credential,
  commandId: "command_preview_01",
  expectedRevision: 1,
  actor: "operator_01",
  provenance: { kind: "console-direct-input", clientId: "client_01", inputEventId: "input_01" },
  evidenceRefs: [],
} as const;

function generationLossSource(checkpointState: "absent" | "invalid" | "last-validated" = "last-validated") {
  return {
    kind: "generation-loss",
    oldCustodyRef: null,
    generationLossRef: {
      schemaVersion: 1,
      runId: "run_01",
      agentId: "agent_01",
      generationLossId: "loss_01",
      generationLossRevision: 1,
    },
    lossKind: "generation-advance",
    oldProviderSessionRef: "provider_session_01",
    newProviderSessionRef: "provider_session_02",
    oldProviderGeneration: 3,
    newProviderGeneration: 4,
    oldContextRevision: 20,
    newContextRevision: 0,
    sourceBridgeRef: { bridgeId: "bridge_01", bridgeRevision: 2 },
    sourceCapabilityHash: digestA,
    checkpointState,
    checkpointRef: checkpointState === "last-validated" ? { checkpointId: "checkpoint_01", checkpointRevision: 3 } : null,
    checkpointDigest: checkpointState === "last-validated" ? digestB : null,
    lossEvidenceDigest: digestC,
  } as const;
}

describe("Spec 05 lifecycle wire", () => {
  it("separates immutable accepted suspension from current lifecycle state", () => {
    const accepted = LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC.example;
    expect(parseOperationResult(FABRIC_OPERATIONS.requestLifecycle, accepted)).toStrictEqual(accepted);
    expect(() => parseOperationResult(FABRIC_OPERATIONS.requestLifecycle, {
      agentId: "agent_01",
      lifecycle: "suspended",
      providerSessionGeneration: 4,
    })).toThrow(/schemaVersion|kind|allowed variant/);

    const current = LIFECYCLE_CURRENT_STATE_V1_CODEC.example;
    expect(parseOperationResult(FABRIC_OPERATIONS.getAgentLifecycle, current)).toStrictEqual(current);
    expect(() => parseOperationResult(FABRIC_OPERATIONS.getAgentLifecycle, accepted)).toThrow(/current-state|allowed variant|unknown field/);

    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addProtocolSchemaKeywords(ajv);
    expect(protocolResponseSchemasFor(FABRIC_OPERATIONS.requestLifecycle).some((schema) => ajv.compile(schema)({
      id: "request_01",
      operation: FABRIC_OPERATIONS.requestLifecycle,
      ok: true,
      result: accepted,
    }))).toBe(true);

    const request = {
      action: "rotate",
      agentId: "agent_01",
      taskId: "task_01",
      taskRevision: 1,
      checkpoint: {
        relativePath: "artifacts/checkpoint.json",
        sha256: "a".repeat(64),
        mailboxWatermark: 0,
        acknowledgedAboveWatermark: [],
        inFlightChildren: [],
        openWork: [],
        nextAction: "continue",
        providerResumeReference: "provider_session_01",
      },
      commandId: "command_01",
    } as const;
    expect(() => parseOperationResultForInput(FABRIC_OPERATIONS.requestLifecycle, request, current))
      .toThrow(/accepted-suspended|rotate|current-state/);
  });

  it("correlates lifecycle receipts and current source projections intrinsically", () => {
    const accepted = {
      ...LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC.example,
      coordinationRunId: "run_01",
      agentId: "agent_01",
      action: "rotate",
      custodyRef: {
        ...LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC.example.custodyRef,
        runId: "run_01",
        agentId: "agent_01",
      },
      sourceProviderGeneration: 3,
      targetProviderGeneration: 4,
      sourcePrincipalGeneration: 5,
      targetPrincipalGeneration: 6,
      sourceBridgeGeneration: 7,
      targetBridgeGeneration: 8,
    } as const;
    expect(LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC.parse(accepted, "accepted")).toStrictEqual(accepted);
    const acceptedValidator = ajv().compile(LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC.schema);
    for (const invalid of [
      { ...accepted, projectSessionId: undefined },
      { ...accepted, coordinationRunId: "crossed_run" },
      { ...accepted, targetProviderGeneration: 5 },
      { ...accepted, agentId: "crossed_agent" },
    ]) {
      expect(() => LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC.parse(invalid, "accepted"))
        .toThrow(/projectSessionId|run|agent|generation|source|target|custody/);
      expect(acceptedValidator(invalid)).toBe(false);
    }

    const custody = {
      ...LIFECYCLE_CUSTODY_ROW_V1_CODEC.example,
      agentId: "agent_01",
      sourceProviderGeneration: 3,
      targetProviderGeneration: 4,
      sourcePrincipalGeneration: 5,
      targetPrincipalGeneration: 6,
      sourceBridgeGeneration: 7,
      targetBridgeGeneration: 8,
    } as const;
    const current = {
      ...LIFECYCLE_CURRENT_STATE_V1_CODEC.example,
      agentId: "agent_01",
      lifecycle: "suspended",
      contextState: "current",
      principalGeneration: 5,
      providerSessionGeneration: 3,
      bridgeGeneration: 7,
      contextRevision: 0,
      currentSource: custody,
    } as const;
    expect(LIFECYCLE_CURRENT_STATE_V1_CODEC.parse(current, "current")).toStrictEqual(current);
    const currentValidator = ajv().compile(LIFECYCLE_CURRENT_STATE_V1_CODEC.schema);
    for (const invalid of [
      { ...current, agentId: "crossed_agent" },
      { ...current, providerSessionGeneration: 4 },
      { ...current, contextState: "context-unreconciled" },
    ]) {
      expect(() => LIFECYCLE_CURRENT_STATE_V1_CODEC.parse(invalid, "current"))
        .toThrow(/agent|generation|contextState|source/);
      expect(currentValidator(invalid)).toBe(false);
    }
  });

  it("enforces the exact generation-loss state, action and context correlations", () => {
    const directAbandon = {
      schemaVersion: 1,
      sourceKind: "generation-loss",
      agentId: "agent_01",
      generationLossId: "loss_01",
      generationLossRevision: 2,
      lossKind: "context-advance",
      recoveryActionRef: null,
      abandonKind: "direct-open",
      state: "abandoned",
      disposition: "abandoned",
      oldProviderGeneration: 4,
      newProviderGeneration: 4,
      oldContextRevision: 20,
      newContextRevision: 21,
      checkpointState: "absent",
      checkpointDigest: null,
      lossEvidenceDigest: digestA,
      terminalEvidenceDigest: digestB,
    } as const;
    expect(LIFECYCLE_GENERATION_LOSS_ROW_V1_CODEC.parse(directAbandon, "loss")).toStrictEqual(directAbandon);
    expect(() => LIFECYCLE_GENERATION_LOSS_ROW_V1_CODEC.parse({
      ...directAbandon,
      recoveryActionRef: { adapterId: "agy", actionId: "action_01" },
    }, "loss")).toThrow(/allowed variant|recoveryActionRef/);
    expect(() => LIFECYCLE_GENERATION_LOSS_ROW_V1_CODEC.parse({
      ...directAbandon,
      newContextRevision: 20,
    }, "loss")).toThrow(/context revision/);
  });

  it("binds accepted lifecycle custody to the exact request checkpoint", () => {
    const accepted = LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC.example;
    const principal = {
      kind: "agent",
      agentId: accepted.agentId,
      projectSessionId: accepted.projectSessionId,
      runId: accepted.coordinationRunId,
      principalGeneration: accepted.sourcePrincipalGeneration,
    } as const;
    const request = {
      action: accepted.action,
      agentId: accepted.agentId,
      taskId: accepted.taskId,
      taskRevision: accepted.taskRevision,
      checkpoint: {
        relativePath: "artifacts/checkpoint.json",
        sha256: "a".repeat(64),
        mailboxWatermark: 0,
        acknowledgedAboveWatermark: [],
        inFlightChildren: [],
        openWork: [],
        nextAction: "continue",
        providerResumeReference: "provider_session_01",
      },
      commandId: "command_01",
    } as const;

    expect(() => parseOperationResultForInput(FABRIC_OPERATIONS.requestLifecycle, request, {
      ...accepted,
      checkpointDigest: digestB,
    }, principal)).toThrow(/checkpoint|exact lifecycle request/);
    expect(() => parseOperationResultForInput(FABRIC_OPERATIONS.requestLifecycle, request, {
      ...accepted,
      coordinationRunId: "crossed_run",
      custodyRef: { ...accepted.custodyRef, runId: "crossed_run" },
    }, principal)).toThrow(/authenticated agent principal|session|run/);
  });

  it("admits only closed fresh-rotate and destructive abandon recovery intents", () => {
    const common = {
      kind: "agent-lifecycle-recovery",
      schemaVersion: 1,
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      agentId: "agent_01",
      source: generationLossSource(),
      expectedSessionRevision: 2,
      expectedSessionGeneration: 3,
      expectedRunRevision: 4,
      expectedAgentRevision: 5,
      expectedSourceRevision: 1,
      expectedPrincipalGeneration: 6,
      expectedProviderGeneration: 4,
      expectedBridgeGeneration: 7,
      expectedContextRevision: 0,
      bridgeOwnerKind: "child",
      expectedChairLeaseGeneration: null,
      gateId: "gate_01",
      expectedGateRevision: 2,
      expectedGateStatus: "approved",
    } as const;
    const freshRotate = {
      ...common,
      path: "fresh-rotate",
      recoveryCapabilityId: "recovery_capability_01",
      expectedRecoveryCapabilityRevision: 1,
      recoveryCapabilityHash: digestA,
      replacementAdapterId: "agy",
      replacementContractDigest: digestB,
      replacementActionRef: { adapterId: "agy", actionId: "replacement_01" },
      checkpointRef: { checkpointId: "checkpoint_01", checkpointRevision: 3 },
      checkpointDigest: digestB,
      checkpointValidationReceiptDigest: null,
    } as const;
    expect(parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command,
      projectId: "project_01",
      intent: freshRotate,
    })).toMatchObject({ intent: freshRotate });
    expect(requiredOperatorActionForIntent(freshRotate)).toBe("agent-lifecycle-recovery-issue");
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command,
      projectId: "project_01",
      intent: { ...freshRotate, replacementActionRef: { adapterId: "cursor", actionId: "replacement_01" } },
    })).toThrow(/adapter|action/);
    const previewValidator = ajv().compile(protocolRequestSchemaFor(FABRIC_OPERATIONS.operatorActionPreview));
    for (const invalidIntent of [
      { ...freshRotate, expectedSourceRevision: 2 },
      { ...freshRotate, expectedContextRevision: 1 },
      { ...freshRotate, agentId: "crossed_agent" },
    ]) {
      const request = { command, projectId: "project_01", intent: invalidIntent };
      expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, request))
        .toThrow(/source|revision|context|agent/);
      expect(previewValidator({ id: "preview_invalid", operation: FABRIC_OPERATIONS.operatorActionPreview, input: request })).toBe(false);
    }

    const abandon = {
      ...common,
      path: "abandon",
      reason: "Human confirmed retirement after unreconciled provider state.",
      directInputAttestationId: "attestation_01",
      destructiveConfirmationDigest: digestC,
    } as const;
    expect(parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command,
      projectId: "project_01",
      intent: abandon,
    })).toMatchObject({ intent: abandon });
    expect(requiredOperatorActionForIntent(abandon)).toBe("cancel");
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command,
      projectId: "project_01",
      intent: { ...abandon, directInputAttestationId: null },
    })).toThrow(/directInputAttestationId|allowed variant/);
  });

  it("exposes checkpoint validation as an operator-only read operation", () => {
    const operation = FABRIC_OPERATIONS.agentLifecycleRecoveryCheckpointValidate;
    expect(OPERATION_REGISTRY[operation]).toMatchObject({
      feature: "lifecycle-control.v1",
      principals: ["operator"],
      gateOwner: "scoped-gate",
    });
    expect(operationsForPrincipal("agent")).not.toContain(operation);

    const source = generationLossSource("invalid");
    const input = {
      schemaVersion: 1,
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      agentId: "agent_01",
      source,
      checkpointArtifactRef: { path: "artifacts/checkpoint.json", digest: digestA },
      expectedSessionRevision: 2,
      expectedSessionGeneration: 3,
      expectedRunRevision: 4,
      expectedAgentRevision: 5,
      expectedSourceRevision: 1,
      gateId: "gate_01",
      expectedGateRevision: 2,
      expectedGateStatus: "approved",
    } as const;
    expect(parseOperationInput(operation, input)).toStrictEqual(input);
    const result = {
      schemaVersion: 1,
      status: "validated",
      source,
      checkpointRef: { checkpointId: "checkpoint_02", checkpointRevision: 1 },
      checkpointDigest: digestA,
      checkpointVectorDigest: digestB,
      validationReceiptDigest: digestC,
    } as const;
    expect(parseOperationResult(operation, result)).toStrictEqual(result);
    expect(parseOperationResultForInput(operation, input, result)).toStrictEqual(result);
    expect(() => parseOperationResultForInput(operation, input, {
      ...result,
      source: {
        ...source,
        generationLossRef: {
          ...source.generationLossRef,
          generationLossId: "crossed_loss",
        },
      },
    })).toThrow(/source|exact checkpoint validation request/);

    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addProtocolSchemaKeywords(ajv);
    expect(ajv.compile(protocolRequestSchemaFor(operation))({ id: "request_01", operation, input })).toBe(true);
    expect(protocolResponseSchemasFor(operation).some((schema) => ajv.compile(schema)({
      id: "request_01",
      operation,
      ok: true,
      result,
    }))).toBe(true);

    const crossedInput = { ...input, coordinationRunId: "crossed_run" };
    expect(() => parseOperationInput(operation, crossedInput)).toThrow(/source|run/);
    expect(ajv.compile(protocolRequestSchemaFor(operation))({ id: "request_crossed", operation, input: crossedInput })).toBe(false);
  });
});

function ajv() {
  const instance = new Ajv2020({ strict: false, allErrors: true });
  addProtocolSchemaKeywords(instance);
  return instance;
}

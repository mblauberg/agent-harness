import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  OPERATION_REGISTRY,
  PROTOCOL_FEATURES,
  parseOperationInput,
  parseOperationResult,
  parseIntakeRevisionRequest,
} from "../src/index.ts";

const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;
const artifactRef = { path: "docs/spec.md", digest: digestA };
const credential = { capabilityId: "capability_01", token: "afop_exact_read_token" };

describe("artifact registry protocol", () => {
  it("advertises the registry and content-read features through exact public operations", () => {
    expect(PROTOCOL_FEATURES).toContain("artifact-registry.v1");
    expect(PROTOCOL_FEATURES).toContain("artifact-content-read.v1");
    expect(Object.keys(OPERATION_REGISTRY)).toContain("fabric.v1.evidence.publish");
    expect(Object.keys(OPERATION_REGISTRY)).toContain("fabric.v1.operator-artifact-content.read");
  });

  it("parses the exact evidence registration request and result", () => {
    const request = {
      commandId: "command_01",
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      taskId: "task_01",
      requestedSourceKind: "run-file",
      evidenceKind: "review",
      relativePath: "docs/spec.md",
      sourceDigest: digestA,
    };
    expect(parseOperationInput(FABRIC_OPERATIONS.evidencePublish, request)).toStrictEqual(request);
    expect(parseOperationResult(FABRIC_OPERATIONS.evidencePublish, {
      evidenceId: "evidence_01",
      evidenceRevision: 1,
      projectId: "project_01",
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      taskId: "task_01",
      sourceKind: "run-file",
      evidenceKind: "review",
      artifactRef,
      publisherKind: "agent",
      publisherRef: "agent_01",
      createdAt: "2026-07-12T00:00:00.000Z",
    })).toMatchObject({ evidenceId: "evidence_01", artifactRef });

    expect(() => parseOperationInput(FABRIC_OPERATIONS.evidencePublish, {
      ...request,
      root: "/caller-selected",
    })).toThrow(/unknown field/iu);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.evidencePublish, {
      ...request,
      requestedSourceKind: "git-private-diff",
    })).toThrow(/requestedSourceKind/iu);
  });

  it("keeps content reads and both result variants closed and bounded", () => {
    const request = {
      credential,
      projectId: "project_01",
      projectSessionId: "session_01",
      evidenceId: "evidence_01",
      expectedEvidenceRevision: 2,
      artifactRef,
      cursor: null,
      maximumBytes: 131_072,
      maximumLines: 2_000,
    };
    expect(parseOperationInput(FABRIC_OPERATIONS.operatorArtifactContentRead, request)).toStrictEqual(request);
    for (const invalid of [
      { ...request, cursor: undefined },
      { ...request, maximumBytes: 3 },
      { ...request, maximumBytes: 131_073 },
      { ...request, maximumLines: 0 },
      { ...request, maximumLines: 2_001 },
      { ...request, sourceRoot: "/caller-selected" },
    ]) {
      expect(() => parseOperationInput(
        FABRIC_OPERATIONS.operatorArtifactContentRead,
        invalid,
      )).toThrow();
    }

    const content = "reviewed\ncontent";
    const available = {
      available: true,
      artifactRef,
      mediaType: "text/markdown",
      content,
      totalBytes: 16,
      totalLines: 2,
      renderedTotalBytes: 16,
      renderedTotalLines: 2,
      pageIndex: 0,
      lineFragment: "whole",
      pageContentDigest: digestB,
      renderedArtifactDigest: digestB,
      nextCursor: null,
      transformation: "terminal-neutralised",
      terminalNeutralised: true,
      capabilityValuesRedacted: true,
      credentialValuesRedacted: true,
    };
    expect(parseOperationResult(
      FABRIC_OPERATIONS.operatorArtifactContentRead,
      available,
    )).toStrictEqual(available);
    expect(parseOperationResult(FABRIC_OPERATIONS.operatorArtifactContentRead, {
      available: false,
      artifactRef,
      reason: "unsafe-content",
    })).toMatchObject({ available: false, reason: "unsafe-content" });
    expect(() => parseOperationResult(FABRIC_OPERATIONS.operatorArtifactContentRead, {
      ...available,
      credentialValuesRedacted: false,
    })).toThrow(/credentialValuesRedacted/iu);
    expect(() => parseOperationResult(FABRIC_OPERATIONS.operatorArtifactContentRead, {
      ...available,
      totalBytes: 1_048_577,
    })).toThrow(/totalBytes/iu);
    expect(() => parseOperationResult(FABRIC_OPERATIONS.operatorArtifactContentRead, {
      ...available,
      renderedTotalBytes: 2_097_153,
    })).toThrow(/renderedTotalBytes/iu);
    expect(() => parseOperationResult(FABRIC_OPERATIONS.operatorArtifactContentRead, {
      available: false,
      artifactRef,
      reason: "unsafe-content",
      content: "partial",
    })).toThrow(/unknown field/iu);
  });

  it("requires accepted scope exactly once and forbids it in every other intake state", () => {
    const scope = { path: "docs/spec.md", digest: digestA };
    const accepted = {
      origin: "operator",
      command: {
        credential,
        commandId: "command_accept_01",
        expectedRevision: 2,
        actor: "operator_01",
        provenance: {
          kind: "console-direct-input",
          clientId: "console_01",
          inputEventId: "input_01",
        },
        evidenceRefs: [scope],
      },
      intakeId: "intake_01",
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      expectedRevision: 2,
      state: "accepted",
      summary: "Accepted exact scope",
      artifactRefs: [scope],
      gateIds: [],
      acceptedScopeRef: scope,
    } as const;
    expect(parseIntakeRevisionRequest(accepted)).toMatchObject({
      state: "accepted",
      acceptedScopeRef: scope,
    });
    const { acceptedScopeRef: _missing, ...withoutScope } = accepted;
    expect(() => parseIntakeRevisionRequest(withoutScope)).toThrow(/acceptedScopeRef is required/iu);
    expect(() => parseIntakeRevisionRequest({
      ...accepted,
      artifactRefs: [scope, scope],
    })).toThrow(/exactly once/iu);
    expect(() => parseIntakeRevisionRequest({
      ...accepted,
      state: "discussing",
    })).toThrow(/forbidden unless accepted/iu);
  });
});

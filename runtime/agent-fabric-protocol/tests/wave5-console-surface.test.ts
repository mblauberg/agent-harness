import { describe, expect, it } from "vitest";

import * as protocol from "../src/index.js";
import {
  FABRIC_OPERATIONS,
  OPERATION_CONTRACT_FIXTURES,
  OPERATION_REGISTRY,
  createOperatorClient,
  parseOperationInput,
  parseOperationResult,
} from "../src/index.js";

const credential = { capabilityId: "capability_01", token: "test-capability-token" } as const;
const digestA = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const digestB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const artifact = { path: "artifacts/evidence.json", digest: digestA } as const;
const operatorCommand = {
  credential,
  commandId: "command_preview_01",
  expectedRevision: 1,
  actor: "operator_01",
  provenance: { kind: "console-direct-input", clientId: "client_01", inputEventId: "input_01" },
  evidenceRefs: [artifact],
} as const;

describe("closed operator Console surface", () => {
  it("publishes the seven additive operator-only operations", () => {
    expect(FABRIC_OPERATIONS).toMatchObject({
      scopedGateRead: "fabric.v1.scoped-gate.read",
      projectionViewPage: "fabric.v1.operator-projection.view-page",
      projectionDetailRead: "fabric.v1.operator-projection.detail.read",
      operatorActionPreview: "fabric.v1.operator-action.preview",
      operatorActionCommit: "fabric.v1.operator-action.commit",
      operatorActionStatus: "fabric.v1.operator-action.status",
      operatorActionReconcile: "fabric.v1.operator-action.reconcile",
    });
  });

  it("registers every additive operation for the operator principal only", () => {
    const operations = [
      FABRIC_OPERATIONS.scopedGateRead,
      FABRIC_OPERATIONS.projectionViewPage,
      FABRIC_OPERATIONS.projectionDetailRead,
      FABRIC_OPERATIONS.operatorActionPreview,
      FABRIC_OPERATIONS.operatorActionCommit,
      FABRIC_OPERATIONS.operatorActionStatus,
      FABRIC_OPERATIONS.operatorActionReconcile,
    ] as const;
    expect(operations.map((operation) => OPERATION_REGISTRY[operation].principals)).toStrictEqual(
      operations.map(() => ["operator"]),
    );
  });
});

describe("canonical scoped-gate read", () => {
  const gate = OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.scopedGateCreate].result as Record<string, unknown>;

  it("reads an exact project/session/gate revision without adding a mutation surface", () => {
    const input = {
      credential,
      projectId: "project_01",
      projectSessionId: "ps_01",
      gateId: gate.gateId,
      expectedRevision: gate.revision,
    };
    expect(parseOperationInput(FABRIC_OPERATIONS.scopedGateRead, input)).toStrictEqual(input);
    expect(parseOperationResult(FABRIC_OPERATIONS.scopedGateRead, {
      status: "current",
      gate,
      readTransactionId: "read_tx_01",
      stateDigest: digestA,
    })).toMatchObject({ status: "current", gate });
  });

  it("rejects a changed result that echoes the allegedly stale revision", () => {
    expect(() => parseOperationResult(FABRIC_OPERATIONS.scopedGateRead, {
      status: "changed",
      expectedRevision: gate.revision,
      gate,
      readTransactionId: "read_tx_01",
      stateDigest: digestA,
    })).toThrowError(/changed.*revision/iu);
  });
});

const observedAt = "2026-07-11T10:00:00.000Z";
const rowCases = [
  ["attention", { kind: "attention", label: "Decision", priority: "critical-path", title: "Choose" }, { kind: "task", taskId: "task_01", expectedRevision: 1 }],
  ["project", { kind: "project", goal: "Ship", repositoryRevision: "revision_01" }, { kind: "project", projectId: "project_01", expectedRevision: 1 }],
  ["runs", { kind: "run", phase: "reviewing", health: "healthy", nextMilestone: "acceptance" }, { kind: "run", coordinationRunId: "run_01", expectedRevision: 1 }],
  ["work", { kind: "work", state: "active", checkState: "passing" }, { kind: "task", taskId: "task_01", expectedRevision: 1 }],
  ["agents", { kind: "agent", role: "worker", lifecycle: "active", contextPressure: "low" }, { kind: "agent", agentId: "agent_01", expectedRevision: 1 }],
  ["evidence", { kind: "evidence", evidenceKind: "test", status: "pass", provenance: "vitest" }, { kind: "evidence", evidenceId: "evidence_01", expectedRevision: 1 }],
  ["activity", { kind: "activity", activityKind: "operation", summary: "Checked", occurredAt: observedAt }, { kind: "activity", eventId: "event_01", expectedRevision: 1 }],
  ["system", { kind: "system", systemKind: "daemon", state: "healthy", detail: "ready" }, { kind: "system", componentId: "daemon_01", expectedRevision: 1 }],
] as const;

function row(summary: unknown, detailRef: unknown) {
  return {
    itemId: "item_01",
    itemRevision: 1,
    fact: {
      freshness: "live",
      source: "fabric",
      revision: 1,
      observedAt,
      value: {
        summary,
        detailRef,
        actionAvailability: { state: "read-only", reason: "feature-unavailable" },
      },
    },
  };
}

describe("rich operator projection v2", () => {
  it.each(rowCases)("carries semantic %s row revision, source, detail and action availability", (view, summary, detailRef) => {
    expect(parseOperationResult(FABRIC_OPERATIONS.projectionViewPage, {
      status: "page",
      view,
      rows: [row(summary, detailRef)],
      nextCursor: 1,
      hasMore: false,
      snapshotRevision: 4,
      readTransactionId: "read_tx_01",
    })).toMatchObject({ status: "page", view });
  });

  it("rejects a row whose stable item revision differs from its fact revision", () => {
    expect(() => parseOperationResult(FABRIC_OPERATIONS.projectionViewPage, {
      status: "page",
      view: "work",
      rows: [{ ...row(rowCases[3][1], rowCases[3][2]), itemRevision: 2 }],
      nextCursor: 1,
      hasMore: false,
      snapshotRevision: 4,
      readTransactionId: "read_tx_01",
    })).toThrowError(/item revision does not match fact revision/iu);
  });

  it("represents snapshot mismatch only as an explicit resnapshot requirement", () => {
    expect(parseOperationResult(FABRIC_OPERATIONS.projectionViewPage, {
      status: "resnapshot-required",
      view: "attention",
      reason: "snapshot-mismatch",
      currentSnapshotRevision: 5,
      snapshotCursor: 9,
    })).toMatchObject({ status: "resnapshot-required", reason: "snapshot-mismatch" });
  });
});

describe("typed operator detail read", () => {
  const detailRef = { kind: "project", projectId: "project_01", expectedRevision: 1 } as const;

  it("returns a source-labelled detail that matches the exact typed reference", () => {
    expect(parseOperationResult(FABRIC_OPERATIONS.projectionDetailRead, {
      status: "current",
      detailRef,
      detail: {
        freshness: "live",
        source: "fabric",
        revision: 1,
        observedAt,
        value: {
          kind: "project",
          projectId: "project_01",
          canonicalRoot: "/workspace/project",
          goal: "Ship",
          repositoryRevision: "revision_01",
        },
      },
      snapshotRevision: 4,
      readTransactionId: "read_tx_01",
    })).toMatchObject({ status: "current", detailRef });
  });

  it("rejects a detail discriminant that does not match its reference", () => {
    expect(() => parseOperationResult(FABRIC_OPERATIONS.projectionDetailRead, {
      status: "current",
      detailRef,
      detail: {
        freshness: "live",
        source: "fabric",
        revision: 1,
        observedAt,
        value: {
          kind: "run",
          coordinationRunId: "run_01",
          phase: "active",
          chairAgentId: "agent_01",
          chairGeneration: 1,
          health: "healthy",
        },
      },
      snapshotRevision: 4,
      readTransactionId: "read_tx_01",
    })).toThrowError(/detail kind does not match reference/iu);
  });
});

describe("closed operator action capability mapping", () => {
  it("maps every intent family to one existing capability without generic payload dispatch", () => {
    const requiredAction: unknown = Reflect.get(protocol, "requiredOperatorActionForIntent");
    expect(typeof requiredAction).toBe("function");
    if (typeof requiredAction !== "function") return;

    const cases = [
      [{ kind: "control", action: "pause" }, "pause"],
      [{ kind: "control", action: "resume" }, "resume"],
      [{ kind: "control", action: "cancel" }, "cancel"],
      [{ kind: "control", action: "steer" }, "steer"],
      [{ kind: "project-session-drain" }, "drain"],
      [{ kind: "project-session-stop" }, "stop"],
      [{ kind: "daemon-drain" }, "drain"],
      [{ kind: "daemon-stop" }, "stop"],
      [{ kind: "git" }, "git"],
      [{ kind: "registered-external-effect" }, "external-effect"],
      [{ kind: "promotion" }, "external-effect"],
    ] as const;
    expect(cases.map(([intent]) => Reflect.apply(requiredAction, undefined, [intent]))).toStrictEqual(
      cases.map(([, action]) => action),
    );
  });
});

const taskTarget = {
  kind: "task",
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  taskId: "task_01",
  expectedRevision: 4,
} as const;
const controlIntent = { kind: "control", action: "pause", target: taskTarget } as const;

const gitIntent = {
  kind: "git",
  repository: {
    repositoryRoot: "/workspace/project",
    worktreePath: "/workspace/project/.worktrees/writer",
    remoteName: "origin",
    expectedHeadDigest: digestA,
    expectedIndexDigest: digestA,
    expectedWorktreeDigest: digestA,
    expectedRemoteDigest: digestA,
  },
  operation: {
    effect: "push",
    source: { kind: "local-branch", objectName: "feature", objectDigest: digestA },
    destination: { kind: "remote-ref", remoteName: "origin", objectName: "feature", objectDigest: digestA },
    policy: { kind: "force-with-lease", expectedRemoteObjectDigest: digestA },
  },
} as const;

const externalIntent = {
  kind: "registered-external-effect",
  integrationId: "integration_release_01",
  expectedIntegrationGeneration: 2,
  operationId: "deploy_release",
  contractDigest: digestA,
  requestArtifactRef: artifact,
  targetId: "environment_staging",
  expectedTargetRevision: 3,
  idempotencyKey: "deploy_release_01",
} as const;

const releaseBinding = {
  acceptedDeliveryReceiptRef: artifact,
  artifactDigest: digestA,
  promotionAction: "promote-staging",
  target: "staging",
} as const;
const promotionIntent = {
  kind: "promotion",
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  gateId: "gate_release_01",
  expectedGateRevision: 5,
  expectedGateStatus: "approved",
  releaseBinding,
} as const;

describe("closed two-phase action intents", () => {
  it.each([
    controlIntent,
    { kind: "control", action: "resume", target: taskTarget },
    { kind: "control", action: "cancel", target: taskTarget, reason: "Scope cancelled" },
    { kind: "control", action: "steer", target: taskTarget, instruction: "Use the accepted design.", evidenceRefs: [artifact] },
    { kind: "project-session-drain", projectSessionId: "ps_01", expectedSessionRevision: 4, expectedSessionGeneration: 2, expectedGlobalStateRevision: 8 },
    { kind: "project-session-stop", projectSessionId: "ps_01", expectedSessionRevision: 4, expectedSessionGeneration: 2, expectedGlobalStateRevision: 8, drainReceiptRef: artifact },
    { kind: "daemon-drain", expectedDaemonGeneration: 2, expectedGlobalStateRevision: 8 },
    { kind: "daemon-stop", expectedDaemonGeneration: 2, expectedGlobalStateRevision: 8, drainReceiptRef: artifact },
    gitIntent,
    externalIntent,
    promotionIntent,
  ] as const)("accepts the exact preview intent %# without a free-form payload", (intent) => {
    expect(parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command: operatorCommand,
      projectId: "project_01",
      intent,
    })).toMatchObject({ intent });
  });

  it("rejects shell, argv and a free Git operation name", () => {
    for (const extra of [
      { shell: "git push" },
      { argv: ["git", "push"] },
      { operationName: "arbitrary-git-effect" },
    ]) {
      expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
        command: operatorCommand,
        projectId: "project_01",
        intent: { ...gitIntent, ...extra },
      })).toThrowError(/unknown field|allowed variant/iu);
    }
  });

  it.each([
    "expectedHeadDigest",
    "expectedIndexDigest",
    "expectedWorktreeDigest",
    "expectedRemoteDigest",
  ] as const)("requires Git state fence %s", (field) => {
    const repository = { ...gitIntent.repository } as Record<string, unknown>;
    delete repository[field];
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command: operatorCommand,
      projectId: "project_01",
      intent: { ...gitIntent, repository },
    })).toThrowError(new RegExp(field, "iu"));
  });

  it("rejects an illegal Git source/destination combination and an unbound force push", () => {
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command: operatorCommand,
      projectId: "project_01",
      intent: {
        ...gitIntent,
        operation: { ...gitIntent.operation, source: gitIntent.operation.destination },
      },
    })).toThrowError(/source|allowed variant/iu);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command: operatorCommand,
      projectId: "project_01",
      intent: {
        ...gitIntent,
        operation: { ...gitIntent.operation, policy: { kind: "force-with-lease" } },
      },
    })).toThrowError(/expectedRemoteObjectDigest|allowed variant/iu);
  });

  it("keeps promotion distinct from broad registered external-effect authority", () => {
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command: operatorCommand,
      projectId: "project_01",
      intent: { ...externalIntent, releaseBinding },
    })).toThrowError(/releaseBinding|allowed variant/iu);
  });

  it("rejects a Git preview after any bound repository state changes", () => {
    const assertCurrent: unknown = Reflect.get(protocol, "assertGitIntentState");
    expect(typeof assertCurrent).toBe("function");
    if (typeof assertCurrent !== "function") return;

    expect(() => Reflect.apply(assertCurrent, undefined, [gitIntent, {
      headDigest: digestB,
      indexDigest: digestA,
      worktreeDigest: digestA,
      remoteDigest: digestA,
      objectDigests: {
        "local-branch:feature": digestA,
        "remote-ref:origin:feature": digestA,
      },
    }])).toThrowError(/Git HEAD state changed/iu);
  });

  it("rejects unknown or stale registered external-effect contracts", () => {
    const assertContract: unknown = Reflect.get(protocol, "assertRegisteredExternalEffectContract");
    expect(typeof assertContract).toBe("function");
    if (typeof assertContract !== "function") return;

    expect(() => Reflect.apply(assertContract, undefined, [externalIntent, {
      integrationId: "integration_release_01",
      integrationGeneration: 2,
      operationContracts: {},
      targetRevisions: { environment_staging: 3 },
    }])).toThrowError(/external operation is not registered/iu);
  });

  it("requires the exact approved release gate and binding for promotion", () => {
    const assertGate: unknown = Reflect.get(protocol, "assertPromotionIntentGate");
    expect(typeof assertGate).toBe("function");
    if (typeof assertGate !== "function") return;
    const gate = {
      ...(OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.scopedGateCreate].result as Record<string, unknown>),
      gateId: "gate_release_01",
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      revision: 5,
      scope: { kind: "release" },
      status: "approved",
      releaseBinding,
    };

    expect(() => Reflect.apply(assertGate, undefined, [
      { ...promotionIntent, releaseBinding: { ...releaseBinding, target: "production" } },
      gate,
    ])).toThrowError(/release binding does not match/iu);
  });
});

const preview = {
  previewId: "preview_01",
  previewRevision: 1,
  previewDigest: digestA,
  intent: controlIntent,
  intentDigest: digestB,
  beforeStateDigest: digestA,
  consequenceClass: "consequential",
  evidenceRefs: [artifact],
  gateIds: ["gate_01"],
  confirmationMode: "echo",
  expiresAt: "2026-07-11T11:00:00.000Z",
} as const;

describe("preview, confirmation, status and observe-only reconciliation", () => {
  it("returns an immutable intent-bound preview and exact commit receipt", () => {
    expect(parseOperationResult(FABRIC_OPERATIONS.operatorActionPreview, preview)).toStrictEqual(preview);
    const commit = {
      command: { ...operatorCommand, commandId: "command_commit_01" },
      projectId: "project_01",
      previewId: "preview_01",
      expectedPreviewRevision: 1,
      previewDigest: digestA,
      expectedIntentDigest: digestB,
      confirmation: { kind: "echo", echoedPreviewDigest: digestA },
    } as const;
    expect(parseOperationInput(FABRIC_OPERATIONS.operatorActionCommit, commit)).toStrictEqual(commit);
    expect(parseOperationResult(FABRIC_OPERATIONS.operatorActionCommit, {
      commandId: "command_commit_01",
      previewId: "preview_01",
      previewRevision: 1,
      intentDigest: digestB,
      beforeStateDigest: digestA,
      afterStateDigest: digestB,
      evidenceRefs: [artifact],
      committedAt: observedAt,
    })).toMatchObject({ commandId: "command_commit_01", intentDigest: digestB });
  });

  it("rejects an echoed confirmation for another preview digest", () => {
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionCommit, {
      command: { ...operatorCommand, commandId: "command_commit_01" },
      projectId: "project_01",
      previewId: "preview_01",
      expectedPreviewRevision: 1,
      previewDigest: digestA,
      expectedIntentDigest: digestB,
      confirmation: { kind: "echo", echoedPreviewDigest: digestB },
    })).toThrowError(/echoed preview digest does not match/iu);
  });

  it("rejects commit after the preview revision, digest, intent or before-state changes", () => {
    const assertPreview: unknown = Reflect.get(protocol, "assertOperatorActionPreviewCurrent");
    expect(typeof assertPreview).toBe("function");
    if (typeof assertPreview !== "function") return;

    expect(() => Reflect.apply(assertPreview, undefined, [preview, {
      previewId: "preview_01",
      previewRevision: 2,
      previewDigest: digestA,
      intentDigest: digestB,
      beforeStateDigest: digestA,
      observedAt: "2026-07-11T10:30:00.000Z",
    }])).toThrowError(/preview revision is stale/iu);
  });

  it("preserves ambiguous state and permits only a new observe-only reconciliation command", () => {
    expect(parseOperationResult(FABRIC_OPERATIONS.operatorActionStatus, {
      status: "ambiguous",
      commandId: "command_commit_01",
      intentDigest: digestB,
      attemptGeneration: 2,
      effectRef: artifact,
    })).toMatchObject({ status: "ambiguous", attemptGeneration: 2 });
    const reconcile = {
      command: { ...operatorCommand, commandId: "command_reconcile_01" },
      projectId: "project_01",
      targetCommandId: "command_commit_01",
      expectedStatus: "ambiguous",
      expectedAttemptGeneration: 2,
      mode: "observe-only",
    } as const;
    expect(parseOperationInput(FABRIC_OPERATIONS.operatorActionReconcile, reconcile)).toStrictEqual(reconcile);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionReconcile, {
      ...reconcile,
      mode: "redispatch",
    })).toThrowError(/observe-only|allowed variant/iu);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionReconcile, {
      ...reconcile,
      command: { ...reconcile.command, commandId: reconcile.targetCommandId },
    })).toThrowError(/new command ID/iu);
  });

  it("represents changed-intent dedupe and external-contract rejection without effect redispatch", () => {
    for (const code of ["dedupe-conflict", "external-contract-unknown"] as const) {
      expect(parseOperationResult(FABRIC_OPERATIONS.operatorActionStatus, {
        status: "rejected",
        commandId: "command_commit_01",
        intentDigest: digestB,
        code,
        evidenceRefs: [artifact],
      })).toMatchObject({ status: "rejected", code });
    }
  });
});

function consoleClient(allowedOperations: readonly string[], features: readonly string[]) {
  return createOperatorClient({
    features,
    principal: {
      kind: "operator",
      operatorId: "operator_01",
      projectId: "project_01",
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
    },
    allowedOperations: new Set(allowedOperations),
    call: () => Promise.reject(new Error("not called")),
    close: () => Promise.resolve(),
  } as never);
}

describe("complete-grant Console facade", () => {
  const reads = [
    FABRIC_OPERATIONS.scopedGateRead,
    FABRIC_OPERATIONS.projectionViewPage,
    FABRIC_OPERATIONS.projectionDetailRead,
  ] as const;
  const mutations = [
    FABRIC_OPERATIONS.operatorActionPreview,
    FABRIC_OPERATIONS.operatorActionCommit,
    FABRIC_OPERATIONS.operatorActionStatus,
    FABRIC_OPERATIONS.operatorActionReconcile,
  ] as const;

  it("degrades honestly to read-only when mutation grants are absent or partial", () => {
    const readOnly = consoleClient(reads, ["scoped-gate-read.v1", "operator-projection.v2"]);
    expect(readOnly.console).toMatchObject({ readOnly: true });
    expect(readOnly.console).not.toHaveProperty("actions");
    const partial = consoleClient([...reads, mutations[0]], [
      "scoped-gate-read.v1",
      "operator-projection.v2",
      "operator-actions.v1",
    ]);
    expect(partial.console).toMatchObject({ readOnly: true });
    expect(partial.console).not.toHaveProperty("actions");
  });

  it("exposes mutations only after all four action operations are granted", () => {
    const full = consoleClient([...reads, ...mutations], [
      "scoped-gate-read.v1",
      "operator-projection.v2",
      "operator-actions.v1",
    ]);
    expect(full.console).toMatchObject({ readOnly: false });
    expect(full.console?.actions?.preview).toBeTypeOf("function");
    expect(full.console?.actions?.commit).toBeTypeOf("function");
    expect(full.console?.actions?.status).toBeTypeOf("function");
    expect(full.console?.actions?.reconcile).toBeTypeOf("function");
  });

  it("omits the Console facade when any canonical read operation is missing", () => {
    expect(consoleClient(reads.slice(0, 2), ["scoped-gate-read.v1", "operator-projection.v2"])).not.toHaveProperty(
      "console",
    );
  });
});

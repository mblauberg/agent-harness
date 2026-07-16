import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type {
  CommandId,
  CoordinationRunId,
  OperatorActionClient,
  OperatorActionIntent,
  OperatorActionPreview,
  OperatorActionReceipt,
  OperatorActionStatus,
  OperatorAvailableAction,
  OperatorCapabilityCredential,
  OperatorId,
  OperatorMutationContext,
  ProjectId,
  ProjectSessionId,
  Sha256Digest,
  TaskId,
  Timestamp,
} from "@local/agent-fabric-protocol";
import {
  ConsoleController,
  type ConsoleActionRequest,
  type DirectConsoleActivation,
} from "../src/controller.js";
import {
  createEmptyViewPages,
  revisionFromProtocol,
  type ConsoleRow,
} from "../src/model.js";
import type { FabricConsoleDataset } from "../src/protocol-adapter.js";

const projectId = "project-1" as ProjectId;
const sessionId = "session-1" as ProjectSessionId;
const runId = "run-1" as CoordinationRunId;
const taskId = "task-1" as TaskId;
const actor = "operator-1" as OperatorId;
const credential = {
  capabilityId: "capability-1",
  token: "credential-secret",
} as OperatorCapabilityCredential;
const timestamp = "2026-07-11T12:00:00.000Z" as Timestamp;
const nativeNotification = {
  kind: "daemon-journal",
  targetIntegration: "native-desktop",
  status: "available",
  journalState: "sent",
  deliveryItemRevision: 7,
  claimGeneration: null,
  integrationState: "available",
  observedAt: timestamp,
} as const;
const digestA = (`sha256:${"a".repeat(64)}`) as Sha256Digest;
const digestB = (`sha256:${"b".repeat(64)}`) as Sha256Digest;
const digestC = (`sha256:${"c".repeat(64)}`) as Sha256Digest;

function context(commandId: string, inputEventId: string, revision = 7): OperatorMutationContext {
  return {
    credential,
    commandId: commandId as CommandId,
    expectedRevision: revision,
    actor,
    provenance: {
      kind: "console-direct-input",
      clientId: "console-client-1" as never,
      inputEventId,
    },
    evidenceRefs: [],
  };
}

function controlIntent(revision = 7): OperatorActionIntent {
  return {
    kind: "control",
    action: "resume",
    target: {
      kind: "task",
      projectSessionId: sessionId,
      coordinationRunId: runId,
      taskId,
      expectedRevision: revision,
    },
  };
}

function preview(
  intent: OperatorActionIntent = controlIntent(),
  confirmationMode: "explicit" | "echo" = "explicit",
): OperatorActionPreview {
  return {
    previewId: "preview-1",
    previewRevision: 3,
    previewDigest: digestA,
    intent,
    intentDigest: digestB,
    beforeStateDigest: digestC,
    consequenceClass: confirmationMode === "echo" ? "destructive" : "consequential",
    evidenceRefs: [],
    gateIds: [],
    confirmationMode,
    expiresAt: "2099-07-11T13:00:00.000Z" as Timestamp,
  };
}

function receipt(commandId = "commit-1"): OperatorActionReceipt {
  return {
    commandId,
    previewId: "preview-1",
    previewRevision: 3,
    intentDigest: digestB,
    beforeStateDigest: digestC,
    afterStateDigest: digestA,
    evidenceRefs: [],
    committedAt: timestamp,
  } as OperatorActionReceipt;
}

function actions(
  overrides: Partial<OperatorActionClient> = {},
): OperatorActionClient {
  return {
    preview: vi.fn(async (request) => preview(request.intent)),
    commit: vi.fn(async (request) => receipt(request.command.commandId)),
    status: vi.fn(async (request): Promise<OperatorActionStatus> => ({
      status: "not-found",
      commandId: request.commandId,
    })),
    reconcile: vi.fn(async (request): Promise<OperatorActionStatus> => ({
      status: "pending",
      commandId: request.targetCommandId,
      intentDigest: digestB,
      phase: "observing",
      attemptGeneration: request.expectedAttemptGeneration,
    })),
    ...overrides,
  };
}

function row(itemRevision = 7): ConsoleRow<"attention"> {
  return {
    view: "attention",
    stableId: "attention:task-1",
    revision: revisionFromProtocol(itemRevision),
    urgency: "critical-path",
    freshness: {
      state: "live",
      source: "fabric",
      revision: revisionFromProtocol(itemRevision),
      observedAt: timestamp,
      ageMs: 0,
    },
    summary: {
      kind: "attention",
      label: "Blocked",
      priority: "critical-path",
      title: "Resume blocked task",
      nativeNotification: {
        ...nativeNotification,
        deliveryItemRevision: itemRevision,
      },
    },
    detailRef: { kind: "task", taskId, expectedRevision: itemRevision },
    actionAvailability: {
      state: "available",
      actions: ["resume"],
      requiresPreview: true,
    },
  };
}

function dataset(
  itemRevision = 7,
  snapshotRevision = 11,
  connection: FabricConsoleDataset["connection"] = {
    state: "live",
    compatibility: { mode: "current" },
  },
): FabricConsoleDataset {
  const pages = createEmptyViewPages();
  return {
    connection,
    snapshot: { snapshotRevision, cursor: snapshotRevision } as never,
    snapshotRevision: revisionFromProtocol(snapshotRevision),
    cursor: snapshotRevision,
    pages: {
      ...pages,
      attention: {
        view: "attention",
        rows: [row(itemRevision)],
        nextCursor: 1,
        hasMore: false,
        snapshotRevision: revisionFromProtocol(snapshotRevision),
        readTransactionId: `read-${String(snapshotRevision)}`,
      },
    },
    loadedAtMs: Date.parse(timestamp),
    canMutate: connection.state === "live",
  };
}

function activation(
  eventId: string,
  source: DirectConsoleActivation["source"] = "keyboard",
): DirectConsoleActivation {
  return { eventId, source };
}

function actionRequest(
  command: OperatorMutationContext = context("preview-command", "event-open"),
  intent: OperatorActionIntent = controlIntent(),
  availableAction: OperatorAvailableAction = "resume",
): ConsoleActionRequest {
  return {
    view: "attention",
    itemId: "attention:task-1",
    itemRevision: revisionFromProtocol(7),
    projectionRevision: revisionFromProtocol(11),
    availableAction,
    intent,
    command,
    activation: activation("event-open"),
  };
}

describe("Console controller and two-phase actions", () => {
  it("keeps projection and mutation-target revisions distinct", async () => {
    const service = actions();
    const controller = new ConsoleController({
      dataset: dataset(),
      actions: service,
      credential,
      projectId,
      projectSessionId: sessionId,
      confirmationId: () => "confirmation-1",
    });
    controller.select("attention", "attention:task-1");

    const targetBound = actionRequest(
      context("preview-target-revision", "event-open", 7),
    );
    await expect(controller.beginAction(targetBound)).resolves.toMatchObject({
      binding: { projectionRevision: "11", itemRevision: "7" },
      preview: { intent: { target: { expectedRevision: 7 } } },
    });
    expect(service.preview).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({ expectedRevision: 7 }),
    }));
  });

  it("preserves stable selection and scroll anchors while revisions advance", () => {
    const controller = new ConsoleController({
      dataset: dataset(),
      actions: actions(),
      credential,
      projectId,
      projectSessionId: sessionId,
      confirmationId: () => "confirmation-1",
    });
    controller.select("attention", "attention:task-1");
    controller.setScrollAnchor("attention", "attention:task-1");

    controller.updateDataset(dataset(8, 12));

    expect(controller.state.selectionByView.attention).toStrictEqual({
      stableId: "attention:task-1",
      revision: "8",
    });
    expect(controller.state.scrollAnchorByView.attention).toBe(
      "attention:task-1",
    );
  });

  it("opens a revision-bound Review and requires a distinct explicit confirmation", async () => {
    const service = actions();
    const controller = new ConsoleController({
      dataset: dataset(),
      actions: service,
      credential,
      projectId,
      projectSessionId: sessionId,
      confirmationId: () => "confirmation-1",
    });
    controller.select("attention", "attention:task-1");

    const review = await controller.beginAction(actionRequest());

    expect(service.preview).toHaveBeenCalledWith({
      command: context("preview-command", "event-open"),
      projectId,
      intent: controlIntent(),
    });
    expect(review).toMatchObject({
      stage: "review",
      binding: {
        view: "attention",
        itemId: "attention:task-1",
        itemRevision: "7",
        projectionRevision: "11",
      },
      preview: {
        previewRevision: 3,
        previewDigest: digestA,
        intentDigest: digestB,
        beforeStateDigest: digestC,
        consequenceClass: "consequential",
      },
    });
    await expect(
      controller.confirmAction(
        activation("event-enter"),
        context("commit-1", "event-enter"),
      ),
    ).rejects.toThrow(/not armed/);
    expect(service.commit).not.toHaveBeenCalled();

    expect(() => controller.armConfirmation(activation("event-open"))).toThrow(
      /distinct input event/,
    );
    controller.armConfirmation(activation("event-arm"));
    await expect(
      controller.confirmAction(
        { eventId: "event-paste", source: "paste" },
        context("commit-1", "event-paste"),
      ),
    ).rejects.toThrow(/direct keyboard or mouse/);

    const status = await controller.confirmAction(
      activation("event-confirm", "mouse"),
      context("commit-1", "event-confirm"),
    );

    expect(status).toMatchObject({ status: "committed", receipt: receipt() });
    expect(service.commit).toHaveBeenCalledWith({
      command: context("commit-1", "event-confirm"),
      projectId,
      previewId: "preview-1",
      expectedPreviewRevision: 3,
      previewDigest: digestA,
      expectedIntentDigest: digestB,
      confirmation: { kind: "explicit", confirmationId: "confirmation-1" },
    });
    expect(controller.state.review).toMatchObject({ stage: "committed" });
  });

  it("requires exact direct echo for destructive previews", async () => {
    const service = actions({
      preview: vi.fn(async (request) => preview(request.intent, "echo")),
    });
    const controller = new ConsoleController({
      dataset: dataset(),
      actions: service,
      credential,
      projectId,
      projectSessionId: sessionId,
      confirmationId: () => "unused",
    });
    controller.select("attention", "attention:task-1");
    await controller.beginAction(actionRequest());
    controller.armConfirmation(activation("event-arm"));

    await expect(
      controller.confirmAction(
        { eventId: "event-injected", source: "injection", echoText: digestA },
        context("commit-echo", "event-injected"),
      ),
    ).rejects.toThrow(/direct keyboard or mouse/);
    await expect(
      controller.confirmAction(
        { eventId: "event-wrong", source: "keyboard", echoText: "yes" },
        context("commit-echo", "event-wrong"),
      ),
    ).rejects.toThrow(/exact preview digest/);

    await controller.confirmAction(
      { eventId: "event-exact", source: "keyboard", echoText: digestA },
      context("commit-echo", "event-exact"),
    );
    expect(service.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmation: { kind: "echo", echoedPreviewDigest: digestA },
      }),
    );
  });

  it("invalidates Review with a visible changed-state diff before commit", async () => {
    const service = actions();
    const controller = new ConsoleController({
      dataset: dataset(),
      actions: service,
      credential,
      projectId,
      projectSessionId: sessionId,
      confirmationId: () => "confirmation-1",
    });
    controller.select("attention", "attention:task-1");
    await controller.beginAction(actionRequest());
    controller.armConfirmation(activation("event-arm"));

    controller.updateDataset(dataset(8, 12));

    expect(controller.state.review).toMatchObject({
      stage: "conflict",
      changes: [
        { field: "projectionRevision", before: "11", after: "12" },
        { field: "itemRevision", before: "7", after: "8" },
      ],
    });
    await expect(
      controller.confirmAction(
        activation("event-confirm"),
        context("commit-1", "event-confirm", 12),
      ),
    ).rejects.toThrow(/Review is not armed/);
    expect(service.commit).not.toHaveBeenCalled();
  });

  it("keeps last-good rows readable but disables every action while non-live", async () => {
    const degraded = dataset(7, 11, {
      state: "degraded",
      reason: "transport-failure",
    });
    const service = actions();
    const controller = new ConsoleController({
      dataset: degraded,
      actions: service,
      credential,
      projectId,
      projectSessionId: sessionId,
      confirmationId: () => "confirmation-1",
    });
    controller.select("attention", "attention:task-1");

    expect(controller.dataset.pages.attention.rows[0]?.stableId).toBe(
      "attention:task-1",
    );
    await expect(controller.beginAction(actionRequest())).rejects.toThrow(
      /live canonical projection/,
    );
    expect(service.preview).not.toHaveBeenCalled();
    expect(service.commit).not.toHaveBeenCalled();
  });

  it("preserves capability failure classes without retaining messages or tokens", async () => {
    const failure = Object.assign(
      new Error("credential-secret must never reach the screen"),
      { code: "CAPABILITY_EXPIRED" },
    );
    const service = actions({ preview: vi.fn(async () => Promise.reject(failure)) });
    const controller = new ConsoleController({
      dataset: dataset(),
      actions: service,
      credential,
      projectId,
      projectSessionId: sessionId,
      confirmationId: () => "confirmation-1",
    });
    controller.select("attention", "attention:task-1");

    await expect(controller.beginAction(actionRequest())).rejects.toBe(failure);
    expect(controller.state.lastFailure).toStrictEqual({
      code: "CAPABILITY_EXPIRED",
      name: "Error",
    });
    expect(JSON.stringify(controller.state)).not.toContain("credential-secret");
    expect(JSON.stringify(controller.state)).not.toContain(
      "must never reach the screen",
    );
  });

  it("loads gate scope, exact revision, evidence and consequences into Review", async () => {
    const gateId = "gate-1" as never;
    const gatePreview: OperatorActionPreview = {
      ...preview(),
      gateIds: [gateId],
      evidenceRefs: [{ path: "evidence/review.json" as never, digest: digestA }],
    };
    const service = actions({ preview: vi.fn(async () => gatePreview) });
    const readGate = vi.fn(async () => ({
      status: "current" as const,
      gate: {
        gateId,
        projectSessionId: sessionId,
        coordinationRunId: runId,
        scope: { kind: "task" as const, taskId },
        affectedTaskIds: [taskId],
        dependencyRevision: 6,
        blockedOperationIds: [],
        enforcementPoints: ["task-readiness" as const],
        question: "Resume this quarantined task?",
        reason: "The replacement evidence is now available.",
        options: ["approve", "reject"],
        recommendation: "approve",
        consequences: ["Task execution may continue."],
        evidenceRefs: [
          { path: "evidence/review.json" as never, digest: digestA },
        ],
        revision: 7,
        createdByRef: "chair-1",
        expectedApproverRef: "operator-1",
        status: "pending" as const,
      },
      readTransactionId: "gate-read-1",
      stateDigest: digestC,
    }));
    const controller = new ConsoleController({
      dataset: dataset(),
      actions: service,
      credential,
      projectId,
      projectSessionId: sessionId,
      readGate,
      confirmationId: () => "confirmation-1",
    });
    controller.select("attention", "attention:task-1");

    const review = await controller.beginAction(actionRequest());

    expect(readGate).toHaveBeenCalledWith({
      credential,
      projectId,
      projectSessionId: sessionId,
      gateId,
    });
    expect(review.gates[0]).toMatchObject({
      gateId,
      stateDigest: digestC,
      gate: {
        revision: 7,
        scope: { kind: "task", taskId },
        question: "Resume this quarantined task?",
        consequences: ["Task execution may continue."],
        evidenceRefs: [{ digest: digestA }],
      },
    });
  });

  it("deduplicates a pending command and retains the exact acceptance receipt", async () => {
    let resolveCommit: ((value: OperatorActionReceipt) => void) | undefined;
    const service = actions({
      commit: vi.fn(
        () =>
          new Promise<OperatorActionReceipt>((resolve) => {
            resolveCommit = resolve;
          }),
      ),
    });
    const controller = new ConsoleController({
      dataset: dataset(),
      actions: service,
      credential,
      projectId,
      projectSessionId: sessionId,
      confirmationId: () => "confirmation-1",
    });
    controller.select("attention", "attention:task-1");
    controller.setScrollAnchor("attention", "attention:task-1");
    await controller.beginAction(actionRequest());
    controller.armConfirmation(activation("event-arm"));
    const command = context("commit-1", "event-confirm");

    const first = controller.confirmAction(activation("event-confirm"), command);
    const duplicate = controller.confirmAction(activation("event-confirm"), command);
    expect(service.commit).toHaveBeenCalledTimes(1);
    expect(controller.state.pendingCommandIds).toStrictEqual(["commit-1"]);
    controller.updateDataset(dataset(7, 12));
    expect(controller.state.pendingCommandIds).toStrictEqual(["commit-1"]);
    expect(controller.state.selectionByView.attention).toStrictEqual({
      stableId: "attention:task-1",
      revision: "7",
    });
    expect(controller.state.scrollAnchorByView.attention).toBe("attention:task-1");
    resolveCommit?.(receipt());

    await expect(first).resolves.toMatchObject({ status: "committed" });
    await expect(duplicate).resolves.toMatchObject({ status: "committed" });
    expect(controller.state.lastReceipt).toStrictEqual(receipt());
    expect(controller.state.pendingCommandIds).toStrictEqual([]);
  });

  it("reconciles restart ambiguity observe-only and never redispatches", async () => {
    const committed: OperatorActionStatus = {
      status: "committed",
      commandId: "target-command" as CommandId,
      receipt: receipt("target-command") as Exclude<
        OperatorActionReceipt,
        { launchProviderActionJournalRef: unknown }
      >,
    };
    const service = actions({
      status: vi.fn(async (): Promise<OperatorActionStatus> => ({
        status: "ambiguous",
        commandId: "target-command" as CommandId,
        intentDigest: digestB,
        attemptGeneration: 4,
        effectRef: { path: "effects/target.json" as never, digest: digestA },
      })),
      reconcile: vi.fn(async () => committed),
    });
    const controller = new ConsoleController({
      dataset: dataset(),
      actions: service,
      credential,
      projectId,
      projectSessionId: sessionId,
      confirmationId: () => "confirmation-1",
    });

    const status = await controller.reconcilePending(
      "target-command" as CommandId,
      context("reconcile-command", "event-reconcile"),
    );

    expect(status).toStrictEqual(committed);
    expect(service.status).toHaveBeenCalledWith({
      credential,
      projectId,
      commandId: "target-command",
    });
    expect(service.reconcile).toHaveBeenCalledWith({
      command: context("reconcile-command", "event-reconcile"),
      projectId,
      targetCommandId: "target-command",
      expectedStatus: "ambiguous",
      expectedAttemptGeneration: 4,
      mode: "observe-only",
    });
    expect(service.commit).not.toHaveBeenCalled();
    expect(service.preview).not.toHaveBeenCalled();
  });

  it("keeps the mutation boundary typed for Git and contains no shell escape hatch", async () => {
    const gitIntent: OperatorActionIntent = {
      kind: "git",
      authorisation: {
        projectId,
        projectSessionId: sessionId,
        expectedSessionRevision: 7,
        expectedSessionGeneration: 1,
        coordinationRunId: runId,
        expectedRunRevision: 7,
        expectedDependencyRevision: 1,
        authorityRef: digestA,
        expectedAuthorityRevision: 1,
        expectedGitAllowlistEpoch: 1,
        gitAllowlistDigest: digestB,
        repositoryRoot: "/repo",
        worktreePath: "/repo/.worktrees/task-agent",
        repositoryStateDigest: digestA,
        executionProfileId: "git-profile",
        executionProfileRevision: 1,
        executionProfileDigest: digestB,
        operationVariant: "stage",
        remoteBinding: null,
        resultRecipeDigest: digestC,
        operationId: "git-operation-1",
        effectBindingDigest: digestA,
        decision: {
          kind: "preauthorised",
          grantId: "git-grant-1",
          expectedGrantRevision: 1,
          grantDigest: digestB,
        },
      },
      repository: {
        repositoryRoot: "/repo",
        worktreePath: "/repo/.worktrees/task-agent",
        gitCommonDir: "/repo/.git",
        commonDirectoryIdentityDigest: digestA,
        repositoryStateDigest: digestA,
        headDigest: digestA,
        indexDigest: digestB,
        worktreeDigest: digestC,
        remoteStateDigest: digestA,
        configDigest: digestB,
        worktreeRegistryDigest: digestC,
      },
      executionProfile: {
        profileId: "git-profile",
        revision: 1,
        digest: digestB,
        gitBinaryDigest: digestC,
        objectFormat: "sha1",
      },
      operation: { variant: "stage", paths: ["src/controller.ts"] },
      resultRecipe: {
        schemaVersion: 1,
        executionProfileDigest: digestB,
        resultRecipeDigest: digestC,
        beforeRepositoryStateDigest: digestA,
        expectedSuccessRepositoryStateDigest: digestB,
        expectedConflict: null,
        refUpdates: [],
        configUpdates: [],
        commitMappings: [],
        affectedPaths: [{ path: "src/controller.ts", beforeDigest: digestA, afterDigest: digestB }],
        bounds: {
          maximumRefOrConfigUpdates: 64,
          maximumCommitMappings: 128,
          maximumConflictPaths: 4096,
        },
      },
    };
    const gitRow = row();
    const gitDataset = dataset();
    const controller = new ConsoleController({
      dataset: {
        ...gitDataset,
        pages: {
          ...gitDataset.pages,
          attention: {
            ...gitDataset.pages.attention,
            rows: [
              {
                ...gitRow,
                actionAvailability: {
                  state: "available",
                  actions: ["git"],
                  requiresPreview: true,
                },
              },
            ],
          },
        },
      },
      actions: actions(),
      credential,
      projectId,
      projectSessionId: sessionId,
      confirmationId: () => "confirmation-1",
    });
    controller.select("attention", "attention:task-1");

    const review = await controller.beginAction(
      actionRequest(context("git-preview", "event-open"), gitIntent, "git"),
    );
    expect(review.preview.intent).toStrictEqual(gitIntent);

    const source = await readFile(
      fileURLToPath(new URL("../src/controller.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/node:child_process|execFile|spawn\(|arbitrary shell/i);
    expect(source).not.toContain("OperatorCommandRequest");
  });
});

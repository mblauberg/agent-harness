import { describe, expect, it } from "vitest";

import type {
  AgentId,
  OperatorActionPreview,
  ProjectId,
  ProjectSession,
  ProjectSessionId,
  RunProjection,
  Sha256Digest,
  Timestamp,
} from "@local/agent-fabric-protocol";
import {
  cellWidth,
  createFabricUiState,
  renderFabricConsoleFrame,
  reduceFabricPointer,
  type FabricPointerState,
} from "../src/index.js";
import type {
  ActionReview,
  ConsoleControllerState,
} from "../src/controller.js";
import {
  FABRIC_VIEWS,
  createEmptyViewPages,
  revisionFromProtocol,
  type ConsoleRow,
  type FabricView,
} from "../src/model.js";
import { presentFabricConsole } from "../src/presenter.js";
import type { FabricConsoleDataset } from "../src/protocol-adapter.js";
import { renderConsoleSnapshot } from "../src/snapshot.js";

const timestamp = "2026-07-11T12:00:00.000Z" as Timestamp;
const digestA = (`sha256:${"a".repeat(64)}`) as Sha256Digest;
const digestB = (`sha256:${"b".repeat(64)}`) as Sha256Digest;
const projectId = "project-1" as ProjectId;
const sessionId = "session-1" as ProjectSessionId;

function row(
  view: FabricView,
  stableId: string,
  summary: ConsoleRow["summary"],
  urgency: ConsoleRow["urgency"] = "normal",
  freshness: ConsoleRow["freshness"]["state"] = "live",
): ConsoleRow {
  return {
    view,
    stableId,
    revision: revisionFromProtocol(7),
    urgency,
    freshness:
      freshness === "unavailable"
        ? {
            state: "unavailable",
            source: "github",
            revision: revisionFromProtocol(7),
            observedAt: timestamp,
            ageMs: 5_000,
            reason: "adapter disabled",
          }
        : {
            state: freshness,
            source: "fabric",
            revision: revisionFromProtocol(7),
            observedAt: timestamp,
            ageMs: 5_000,
          },
    summary,
    detailRef:
      view === "attention"
        ? { kind: "system", componentId: stableId, expectedRevision: 7 }
        : null,
    actionAvailability:
      view === "attention" && freshness === "live"
        ? {
            state: "available",
            actions: ["resume"],
            requiresPreview: true,
          }
        : { state: "read-only", reason: "state-ineligible" },
  } as ConsoleRow;
}

function richDataset(
  snapshotRevision = 11,
  systemFreshness: ConsoleRow["freshness"]["state"] = "live",
): FabricConsoleDataset {
  const session: ProjectSession = {
    projectSessionId: sessionId,
    projectId,
    mode: "coordinated",
    state: "active",
    revision: 8,
    generation: 2,
    authorityRef: digestA,
    budgetRef: "budget-1",
    launchPacketRef: { path: "launch/packet.json" as never, digest: digestB },
    membershipRevision: 4,
    origin: { kind: "operator-launch", operatorId: "operator-1" as never },
  };
  const run: RunProjection = {
    runId: "AFAB-004" as never,
    phase: "implement",
    chairAgentId: "codex-chair" as AgentId,
    nextMilestone: "Console GREEN",
    health: "blocked",
  };
  const base = createEmptyViewPages();
  const rows: Record<FabricView, readonly ConsoleRow[]> = {
    attention: [
      row(
        "attention",
        "attention:safety",
        {
          kind: "attention",
          label: "Approval",
          priority: "safety-integrity",
          title: "Approve quarantine recovery",
          nativeNotification: {
            kind: "daemon-journal",
            targetIntegration: "native-desktop",
            status: "stale",
            journalState: "ambiguous",
            deliveryItemRevision: 7,
            claimGeneration: 3,
            integrationState: "available",
            observedAt: timestamp,
          },
        },
        "safety-integrity",
      ),
      row(
        "attention",
        "attention:fyi",
        {
          kind: "attention",
          label: "FYI",
          priority: "advisory",
          title: "Routine evaluation complete",
          nativeNotification: {
            kind: "daemon-journal",
            targetIntegration: "native-desktop",
            status: "unavailable",
            journalState: "missing",
            deliveryItemRevision: null,
            claimGeneration: null,
            integrationState: "absent",
            observedAt: timestamp,
          },
        },
        "advisory",
      ),
    ],
    project: [
      row("project", "project-1", {
        kind: "project",
        goal: "Ship the project Console",
        acceptedScopeRef: null,
        repositoryRevision: "c2fc623",
      }),
    ],
    runs: [
      row("runs", "AFAB-004", {
        kind: "run",
        projectSessionId: "session-1" as never,
        phase: "implement",
        health: "blocked",
        nextMilestone: "Console GREEN",
      }),
    ],
    work: [
      row("work", "task-1", {
        kind: "work",
        state: "active",
        checkState: "passing",
      }),
    ],
    agents: [
      row("agents", "codex-chair", {
        kind: "agent",
        role: "chair",
        lifecycle: "working",
        contextPressure: "medium",
      }),
    ],
    evidence: [
      row("evidence", "evidence-1", {
        kind: "evidence",
        evidenceKind: "test",
        status: "pass",
        provenance: "native harness",
      }),
    ],
    activity: [
      row("activity", "event-1", {
        kind: "activity",
        activityKind: "decision",
        summary: "Spec 05 approved",
        occurredAt: timestamp,
      }),
    ],
    system: [
      row(
        "system",
        "github",
        systemFreshness === "unavailable"
          ? null
          : {
              kind: "system",
              systemKind: "integration",
              state: "healthy",
              detail: "optional GitHub adapter",
            },
        "normal",
        systemFreshness,
      ),
    ],
  };
  const pages = Object.fromEntries(
    FABRIC_VIEWS.map((view) => [
      view,
      {
        ...base[view],
        rows: rows[view],
        snapshotRevision: revisionFromProtocol(snapshotRevision),
        readTransactionId: `read-${view}`,
      },
    ]),
  ) as never;
  return {
    connection: { state: "live", compatibility: { mode: "current" } },
    snapshot: {
      schemaVersion: 1,
      snapshotRevision,
      readTransactionId: `snapshot-${String(snapshotRevision)}`,
      project: {
        freshness: "live",
        source: "fabric",
        revision: snapshotRevision,
        observedAt: timestamp,
        value: { projectId, canonicalRoot: "/workspace/project" },
      },
      session: {
        freshness: "live",
        source: "fabric",
        revision: snapshotRevision,
        observedAt: timestamp,
        value: session,
      },
      runs: {
        freshness: "live",
        source: "fabric",
        revision: snapshotRevision,
        observedAt: timestamp,
        value: [run],
      },
      attention: {
        freshness: "live",
        source: "fabric",
        revision: snapshotRevision,
        observedAt: timestamp,
        value: [],
      },
      capacity: {
        freshness: "live",
        source: "fabric",
        revision: snapshotRevision,
        observedAt: timestamp,
        value: { tasks: { used: 3, reserved: 1, limit: 8 } },
      },
      cursor: snapshotRevision,
      stateDigest: digestA,
    },
    snapshotRevision: revisionFromProtocol(snapshotRevision),
    cursor: snapshotRevision,
    pages,
    loadedAtMs: Date.parse(timestamp),
    canMutate: true,
  };
}

function controllerState(review: ActionReview | null = null): ConsoleControllerState {
  const selectionByView = Object.fromEntries(
    FABRIC_VIEWS.map((view) => [view, null]),
  ) as Record<FabricView, null | { stableId: string; revision: ReturnType<typeof revisionFromProtocol> }>;
  selectionByView.attention = {
    stableId: "attention:safety",
    revision: revisionFromProtocol(7),
  };
  return {
    activeView: "attention",
    selectionByView,
    scrollAnchorByView: Object.fromEntries(
      FABRIC_VIEWS.map((view) => [view, null]),
    ) as never,
    review,
    pendingCommandIds: [],
    lastActionStatus: null,
    lastReceipt: null,
  };
}

function review(stage: ActionReview["stage"] = "review"): ActionReview {
  const actionPreview: OperatorActionPreview = {
    previewId: "preview-1",
    previewRevision: 3,
    previewDigest: digestA,
    intent: {
      kind: "control",
      action: "resume",
      target: {
        kind: "task",
        projectSessionId: sessionId,
        coordinationRunId: "AFAB-004" as never,
        taskId: "task-1" as never,
        expectedRevision: 7,
      },
    },
    intentDigest: digestB,
    beforeStateDigest: digestA,
    consequenceClass: "consequential",
    evidenceRefs: [{ path: "evidence/test.json" as never, digest: digestB }],
    gateIds: ["gate-1" as never],
    confirmationMode: "explicit",
    expiresAt: "2099-07-11T13:00:00.000Z" as Timestamp,
  };
  return {
    stage,
    binding: {
      view: "attention",
      itemId: "attention:safety",
      itemRevision: revisionFromProtocol(7),
      projectionRevision: revisionFromProtocol(11),
    },
    availableAction: "resume",
    preview: actionPreview,
    gates: [
      {
        gateId: "gate-1" as never,
        stateDigest: digestA,
        readTransactionId: "gate-read-1",
        changedFromRevision: null,
        gate: {
          gateId: "gate-1" as never,
          projectSessionId: sessionId,
          coordinationRunId: "AFAB-004" as never,
          scope: { kind: "task", taskId: "task-1" as never },
          affectedTaskIds: ["task-1" as never],
          dependencyRevision: 6,
          blockedOperationIds: [],
          enforcementPoints: ["task-readiness"],
          question: "Resume quarantined task?",
          reason: "Replacement evidence passed.",
          options: ["approve", "reject"],
          recommendation: "approve",
          consequences: ["Task execution may continue."],
          evidenceRefs: [{ path: "evidence/test.json" as never, digest: digestB }],
          revision: 7,
          createdByRef: "chair-1",
          expectedApproverRef: "operator-1",
          status: "pending",
        },
      },
    ],
    openedByEventId: "event-open",
    armedByEventId: stage === "confirm" ? "event-arm" : null,
    changes: [],
    status: null,
  };
}

describe("structured presenter and responsive Fabric renderer", () => {
  it("shows the exact registered accepted scope in Project row and detail", () => {
    const dataset = richDataset();
    const projectRow = dataset.pages.project.rows[0];
    if (projectRow === undefined || projectRow.summary?.kind !== "project") {
      throw new Error("project fixture unavailable");
    }
    const acceptedScopeRef = {
      path: "docs/specs/05-project-fabric-console.md" as never,
      digest: digestB,
    };
    const scopedDataset: FabricConsoleDataset = {
      ...dataset,
      pages: {
        ...dataset.pages,
        project: {
          ...dataset.pages.project,
          rows: [{
            ...projectRow,
            summary: { ...projectRow.summary, acceptedScopeRef },
          }],
        },
      },
    };
    const baseController = controllerState();
    const controller: ConsoleControllerState = {
      ...baseController,
      activeView: "project",
      selectionByView: {
        ...baseController.selectionByView,
        project: {
          stableId: projectRow.stableId,
          revision: projectRow.revision,
        },
      },
    };
    const presented = presentFabricConsole(
      scopedDataset,
      controller,
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );
    expect(presented.masterRows[0]?.secondary).toContain(
      `${acceptedScopeRef.path}@${acceptedScopeRef.digest}`,
    );
    expect(presented.detail?.lines).toContainEqual({
      label: "Accepted scope",
      value: `${acceptedScopeRef.path}@${acceptedScopeRef.digest}`,
    });
  });

  it("requires an exact explicit terminal-neutralisation confirmation before evidence actions", () => {
    const dataset = richDataset();
    const evidenceRow = dataset.pages.evidence.rows[0];
    if (evidenceRow === undefined) throw new Error("evidence fixture unavailable");
    const actionableRow: ConsoleRow<"evidence"> = {
      ...evidenceRow,
      view: "evidence",
      actionAvailability: {
        state: "available",
        actions: ["promotion"],
        requiresPreview: true,
      },
    };
    const reviewed: FabricConsoleDataset = {
      ...dataset,
      pages: {
        ...dataset.pages,
        evidence: { ...dataset.pages.evidence, rows: [actionableRow] },
      },
      inspection: {
        kind: "artifact",
        state: "current",
        binding: {
          view: "evidence",
          itemId: actionableRow.stableId,
          itemRevision: actionableRow.revision,
          projectionRevision: revisionFromProtocol(11),
        },
        readTransactionId: "artifact-review",
        result: {
          artifactRef: { path: "docs/spec.md" as never, digest: digestA },
          evidenceRevision: 7,
          evidenceKind: "artifact",
          sourceKind: "project-file",
          publisherKind: "agent",
          publisherRef: "chair-1",
          projectSessionId: sessionId,
          coordinationRunId: "run-1" as never,
          taskId: null,
          createdAt: timestamp,
          mediaType: "text/markdown",
          content: "reviewed",
          totalBytes: 12,
          totalLines: 1,
          renderedTotalBytes: 8,
          renderedTotalLines: 1,
          renderedArtifactDigest: digestB,
          transformation: "terminal-neutralised",
          terminalNeutralised: true,
          capabilityValuesRedacted: true,
          credentialValuesRedacted: true,
          pages: [{ pageIndex: 0, lineFragment: "whole", pageContentDigest: digestB, bytes: 8 }],
          coverage: { complete: true, verified: true, pageCount: 1 },
          reviewDisposition: "confirm-terminal-neutralised",
        },
      },
    };
    const baseController = controllerState();
    const controller: ConsoleControllerState = {
      ...baseController,
      activeView: "evidence",
      selectionByView: {
        ...baseController.selectionByView,
        evidence: {
          stableId: actionableRow.stableId,
          revision: actionableRow.revision,
        },
      },
    };
    const pending = presentFabricConsole(
      reviewed,
      controller,
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );
    expect(pending.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "artifact:confirm-terminal-neutralised", enabled: true }),
      expect.objectContaining({ id: "action:promotion", enabled: false }),
    ]));

    const confirmed = presentFabricConsole(
      reviewed,
      controller,
      createFabricUiState({
        artifactConfirmation: {
          evidenceId: actionableRow.stableId,
          evidenceRevision: 7,
          sourceDigest: digestA,
          renderedDigest: digestB,
          transformation: "terminal-neutralised",
          pageCount: 1,
        },
      }),
      { columns: 80, rows: 24 },
    );
    expect(confirmed.actions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "artifact:confirm-terminal-neutralised" }),
    ]));
    expect(confirmed.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "action:promotion", enabled: true }),
    ]));
  });

  it("presents the evidence decision ladder and explains unavailable typed entry points", () => {
    const dataset = richDataset();
    const evidenceRow = dataset.pages.evidence.rows[0];
    if (evidenceRow === undefined) throw new Error("evidence fixture unavailable");
    const reviewable: FabricConsoleDataset = {
      ...dataset,
      workflowCapabilities: {
        intake: { state: "available" },
        gate: { state: "available" },
        launch: { state: "unavailable", reason: "typed-planner-unregistered" },
        git: { state: "unavailable", reason: "typed-planner-unregistered" },
        promotion: { state: "unavailable", reason: "typed-planner-unregistered" },
      },
      pages: {
        ...dataset.pages,
        evidence: {
          ...dataset.pages.evidence,
          rows: [{
            ...evidenceRow,
            detailRef: {
              kind: "evidence",
              evidenceId: evidenceRow.stableId,
              expectedRevision: 7,
            },
          }],
        },
      },
      inspection: {
        kind: "artifact",
        state: "current",
        binding: {
          view: "evidence",
          itemId: evidenceRow.stableId,
          itemRevision: evidenceRow.revision,
          projectionRevision: revisionFromProtocol(11),
        },
        readTransactionId: "artifact-decision-ladder",
        result: {
          artifactRef: { path: "docs/spec.md" as never, digest: digestA },
          evidenceRevision: 7,
          evidenceKind: "artifact",
          sourceKind: "project-file",
          publisherKind: "agent",
          publisherRef: "chair-1",
          projectSessionId: sessionId,
          coordinationRunId: "AFAB-004" as never,
          taskId: null,
          createdAt: timestamp,
          mediaType: "text/markdown",
          content: "reviewed",
          totalBytes: 8,
          totalLines: 1,
          renderedTotalBytes: 8,
          renderedTotalLines: 1,
          renderedArtifactDigest: digestA,
          transformation: "none",
          terminalNeutralised: true,
          capabilityValuesRedacted: true,
          credentialValuesRedacted: true,
          pages: [{ pageIndex: 0, lineFragment: "whole", pageContentDigest: digestA, bytes: 8 }],
          coverage: { complete: true, verified: true, pageCount: 1 },
          reviewDisposition: "eligible",
        },
      },
    };
    const base = controllerState();
    const controller: ConsoleControllerState = {
      ...base,
      activeView: "evidence",
      selectionByView: {
        ...base.selectionByView,
        evidence: { stableId: evidenceRow.stableId, revision: evidenceRow.revision },
      },
    };

    const presentation = presentFabricConsole(
      reviewable,
      controller,
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );

    expect(presentation.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "workflow:discuss",
        label: "Discuss",
        enabled: false,
        reason: "daemon-chair-request-preparation-unavailable",
      }),
      expect.objectContaining({ id: "workflow:accept", label: "Accept", enabled: true }),
      expect.objectContaining({
        id: "workflow:request-changes",
        label: "Request changes",
        enabled: false,
        reason: "daemon-chair-request-preparation-unavailable",
      }),
      expect.objectContaining({ id: "workflow:defer", label: "Defer", enabled: true }),
      expect.objectContaining({
        id: "workflow:implement",
        label: "Implement...",
        enabled: false,
        reason: "typed-planner-unregistered",
      }),
    ]));
  });

  it("never enables a selected-row action until the production planner can build it", () => {
    const dataset = richDataset();
    const run = dataset.pages.runs.rows[0];
    if (run === undefined || run.summary?.kind !== "run") {
      throw new Error("run fixture unavailable");
    }
    const guarded: FabricConsoleDataset = {
      ...dataset,
      productionActionPlanning: true,
      pages: {
        ...dataset.pages,
        runs: {
          ...dataset.pages.runs,
          rows: [{
            ...run,
            detailRef: {
              kind: "run",
              coordinationRunId: "AFAB-004" as never,
              expectedRevision: 7,
            },
            actionAvailability: {
              state: "available",
              actions: ["pause", "resume", "cancel", "steer"],
              requiresPreview: true,
            },
          }],
        },
      },
    };
    const base = controllerState();
    const controller: ConsoleControllerState = {
      ...base,
      activeView: "runs",
      selectionByView: {
        ...base.selectionByView,
        runs: { stableId: run.stableId, revision: run.revision },
      },
    };

    const presentation = presentFabricConsole(
      guarded,
      controller,
      createFabricUiState({ draft: "" }),
      { columns: 80, rows: 24 },
    );

    expect(presentation.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "action:pause",
        enabled: false,
        reason: "run-control-state-projection-unavailable",
      }),
      expect.objectContaining({
        id: "action:resume",
        enabled: false,
        reason: "run-control-state-projection-unavailable",
      }),
      expect.objectContaining({ id: "action:cancel", enabled: false, reason: "enter-a-reason" }),
      expect.objectContaining({ id: "action:steer", enabled: false, reason: "enter-an-instruction" }),
    ]));
  });

  it("keeps typed launch, Git and promotion entry points discoverable with capability reasons", () => {
    const dataset = richDataset();
    const project = dataset.pages.project.rows[0];
    if (project === undefined) throw new Error("project fixture unavailable");
    const typedEntries: FabricConsoleDataset = {
      ...dataset,
      pages: {
        ...dataset.pages,
        project: {
          ...dataset.pages.project,
          rows: [{
            ...project,
            detailRef: { kind: "project", projectId, expectedRevision: 7 },
            actionAvailability: {
              state: "available",
              actions: ["project-session-launch", "promotion"],
              requiresPreview: true,
            },
          }],
        },
      },
      workflowCapabilities: {
        intake: { state: "available" },
        gate: { state: "available" },
        launch: { state: "available" },
        git: { state: "unavailable", reason: "git-contract-not-negotiated" },
        promotion: { state: "available" },
      },
    };
    const base = controllerState();
    const controller: ConsoleControllerState = {
      ...base,
      activeView: "project",
      selectionByView: {
        ...base.selectionByView,
        project: { stableId: project.stableId, revision: project.revision },
      },
    };

    const presentation = presentFabricConsole(
      typedEntries,
      controller,
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );

    expect(presentation.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "workflow:launch", enabled: true }),
      expect.objectContaining({
        id: "workflow:git",
        enabled: false,
        reason: "git-contract-not-negotiated",
      }),
      expect.objectContaining({ id: "workflow:promotion", enabled: true }),
    ]));

    const withoutPromotionAuthority = presentFabricConsole(
      {
        ...typedEntries,
        pages: {
          ...typedEntries.pages,
          project: {
            ...typedEntries.pages.project,
            rows: [{
              ...typedEntries.pages.project.rows[0]!,
              actionAvailability: {
                state: "available",
                actions: ["project-session-launch"],
                requiresPreview: true,
              },
            }],
          },
        },
      },
      controller,
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );
    expect(withoutPromotionAuthority.actions).toContainEqual(expect.objectContaining({
      id: "workflow:promotion",
      enabled: false,
      reason: "authority-insufficient",
    }));
  });

  it("offers gate decisions only on judgement-bearing Attention rows", () => {
    const dataset = richDataset();
    const withCapabilities: FabricConsoleDataset = {
      ...dataset,
      workflowCapabilities: {
        intake: { state: "available" },
        gate: { state: "available" },
        launch: { state: "unavailable", reason: "fixture" },
        git: { state: "unavailable", reason: "fixture" },
        promotion: { state: "unavailable", reason: "fixture" },
      },
    };
    const decision = presentFabricConsole(
      withCapabilities,
      controllerState(),
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );
    expect(decision.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "workflow:discuss",
        enabled: false,
        reason: "daemon-chair-request-preparation-unavailable",
      }),
      expect.objectContaining({
        id: "workflow:accept",
        enabled: false,
        reason: "attention-gate-binding-projection-unavailable",
      }),
      expect.objectContaining({
        id: "workflow:request-changes",
        enabled: false,
        reason: "attention-gate-binding-projection-unavailable",
      }),
      expect.objectContaining({
        id: "workflow:defer",
        enabled: false,
        reason: "attention-gate-binding-projection-unavailable",
      }),
    ]));

    const fyiController = controllerState();
    const fyi = dataset.pages.attention.rows[1];
    if (fyi === undefined) throw new Error("FYI fixture unavailable");
    const fyiPresentation = presentFabricConsole(
      withCapabilities,
      {
        ...fyiController,
        selectionByView: {
          ...fyiController.selectionByView,
          attention: { stableId: fyi.stableId, revision: fyi.revision },
        },
      },
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );
    expect(fyiPresentation.actions.some(({ id }) => id.startsWith("workflow:"))).toBe(false);
  });

  it("shares the exact drain-receipt parser between stop availability and planning", () => {
    const dataset = richDataset();
    const project = dataset.pages.project.rows[0];
    const snapshot = dataset.snapshot;
    const session = snapshot?.session;
    if (
      project === undefined || snapshot === null ||
      session?.freshness !== "live" ||
      session.value === null
    ) throw new Error("project/session fixture unavailable");
    const stopping: FabricConsoleDataset = {
      ...dataset,
      productionActionPlanning: true,
      snapshot: {
        ...snapshot,
        session: {
          ...session,
          value: { ...session.value, state: "quiescing" },
        },
      },
      pages: {
        ...dataset.pages,
        project: {
          ...dataset.pages.project,
          rows: [{
            ...project,
            detailRef: {
              kind: "project",
              projectId,
              expectedRevision: 7,
            },
            actionAvailability: {
              state: "available",
              actions: ["project-session-stop"],
              requiresPreview: true,
            },
          }],
        },
      },
    };
    const base = controllerState();
    const controller: ConsoleControllerState = {
      ...base,
      activeView: "project",
      selectionByView: {
        ...base.selectionByView,
        project: { stableId: project.stableId, revision: project.revision },
      },
    };
    const invalid = presentFabricConsole(
      stopping,
      controller,
      createFabricUiState({ draft: `../private/drain.json@${digestA}` }),
      { columns: 80, rows: 24 },
    );
    expect(invalid.actions).toContainEqual(expect.objectContaining({
      id: "action:project-session-stop",
      enabled: false,
      reason: "enter-drain-receipt-ref",
    }));
    const valid = presentFabricConsole(
      stopping,
      controller,
      createFabricUiState({ draft: `receipts/drain.json@${digestA}` }),
      { columns: 80, rows: 24 },
    );
    expect(valid.actions).toContainEqual(expect.objectContaining({
      id: "action:project-session-stop",
      enabled: true,
    }));
  });

  it("answers the reference questions from canonical facts without inferred progress", () => {
    const presentation = presentFabricConsole(
      richDataset(),
      controllerState(),
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );

    expect(presentation.mode).toBe("reference");
    expect(presentation.header).toMatchObject({
      project: "project-1",
      session: "session-1",
      run: "AFAB-004",
      phase: "implement",
      owner: "codex-chair",
      nextMilestone: "Console GREEN",
      health: "blocked",
      attentionCount: 2,
      freshness: "live",
    });
    expect(presentation.views.map(({ view }) => view)).toStrictEqual(FABRIC_VIEWS);
    expect(presentation.masterRows[0]).toMatchObject({
      stableId: "attention:safety",
      urgencyMarker: "!!",
      freshness: "LIVE 5s",
    });
    expect(JSON.stringify(presentation)).not.toMatch(/\d+%|percentage/i);
  });

  it.each([
    ["available", "sent"],
    ["unavailable", "failed"],
    ["stale", "ambiguous"],
  ] as const)(
    "renders native notification %s status at reference and compact dimensions without granting an action",
    (status, journalState) => {
      const dataset = richDataset();
      const first = dataset.pages.attention.rows[0];
      if (
        first?.summary?.kind !== "attention" ||
        first.summary.nativeNotification.kind !== "daemon-journal"
      ) {
        throw new Error("expected attention fixture");
      }
      const notification = {
        ...first.summary.nativeNotification,
        status,
        journalState,
      };
      const attentionRows = [
        {
          ...first,
          summary: { ...first.summary, nativeNotification: notification },
        },
        ...dataset.pages.attention.rows.slice(1),
      ];
      const projected = {
        ...dataset,
        pages: {
          ...dataset.pages,
          attention: { ...dataset.pages.attention, rows: attentionRows },
        },
      };
      const state = controllerState();
      const stateBefore = structuredClone(state);
      const datasetBefore = structuredClone(projected);

      const presentation = presentFabricConsole(
        projected,
        state,
        createFabricUiState(),
        { columns: 80, rows: 24 },
      );
      expect(presentation.masterRows[0]?.secondary).toContain(
        `notify ${status}/${journalState}`,
      );
      expect(presentation.detail?.lines).toEqual(
        expect.arrayContaining([
          {
            label: "Native notification",
            value: `${status} | journal ${journalState}`,
          },
          {
            label: "Notification basis",
            value: expect.stringContaining("integration available | delivery r7 | claim g3"),
          },
        ]),
      );
      expect(presentation.actions).toStrictEqual([
        {
          id: "action:resume",
          label: "Resume",
          enabled: true,
          availableAction: "resume",
        },
      ]);

      const reference = renderFabricConsoleFrame(
        projected,
        state,
        createFabricUiState(),
        { columns: 80, rows: 24 },
      );
      const compact = renderFabricConsoleFrame(
        projected,
        state,
        createFabricUiState({ compactPane: "detail" }),
        { columns: 60, rows: 18 },
      );
      expect(reference.rows.join("\n")).toContain(
        `Native notification: ${status} | journal ${journalState}`,
      );
      expect(compact.rows.join("\n")).toContain(
        `Native notification: ${status} | journal ${journalState}`,
      );
      expect(state).toStrictEqual(stateBefore);
      expect(projected).toStrictEqual(datasetBefore);
    },
  );

  it("renders and exports an unavailable optional notification without synthetic journal observations", () => {
    const dataset = richDataset();
    const first = dataset.pages.attention.rows[0];
    if (first?.summary?.kind !== "attention") throw new Error("expected Attention fixture");
    const unavailableRow: ConsoleRow<"attention"> = {
      ...first,
      summary: {
        ...first.summary,
        nativeNotification: {
          kind: "feature-unavailable",
          status: "unavailable",
          reason: "feature-not-negotiated",
        },
      },
    };
    const unavailable: FabricConsoleDataset = {
      ...dataset,
      connection: {
        state: "live",
        compatibility: { mode: "current" },
      },
      pages: {
        ...dataset.pages,
        attention: {
          ...dataset.pages.attention,
          rows: [unavailableRow, ...dataset.pages.attention.rows.slice(1)],
        },
      },
    };
    const state = controllerState();
    const ui = createFabricUiState();
    const presentation = presentFabricConsole(unavailable, state, ui, { columns: 80, rows: 24 });

    expect(presentation.connection).toBe("LIVE");
    expect(presentation.masterRows[0]?.secondary).toContain(
      "notify unavailable/feature-not-negotiated",
    );
    expect(presentation.detail?.lines).toEqual(expect.arrayContaining([{
      label: "Native notification",
      value: "unavailable | feature-not-negotiated",
    }]));
    expect(presentation.detail?.lines.some((line) => line.label === "Notification basis")).toBe(false);

    const exported = JSON.parse(renderConsoleSnapshot({
      dataset: unavailable,
      controller: state,
      ui,
      viewport: { columns: 80, rows: 24 },
    }, "json")) as {
      connection: string;
      connectionDetail: FabricConsoleDataset["connection"];
      views: { attention: { rows: readonly { secondary: string }[]; detail: { lines: readonly { label: string; value: string }[] } } };
    };
    expect(exported.connection).toBe("LIVE");
    expect(exported.connectionDetail).toMatchObject({
      state: "live",
      compatibility: { mode: "current" },
    });
    expect(exported.views.attention.rows[0]?.secondary).toContain("feature-not-negotiated");
    const notificationLines = exported.views.attention.detail.lines.filter((line) =>
      line.label.startsWith("Notification") || line.label === "Native notification"
    );
    expect(notificationLines).toStrictEqual([{
      label: "Native notification",
      value: "unavailable | feature-not-negotiated",
    }]);
    expect(JSON.stringify(notificationLines)).not.toMatch(/journal|timestamp|observed|delivery|claim|integration|\b0\b/iu);
  });

  it("uses a full-frame Review containing every consequential binding", () => {
    const presentation = presentFabricConsole(
      richDataset(),
      controllerState(review()),
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );

    expect(presentation.review).toMatchObject({
      stage: "review",
      itemId: "attention:safety",
      itemRevision: "7",
      projectionRevision: "11",
      previewRevision: "3",
      previewDigest: digestA,
      intentDigest: digestB,
      beforeStateDigest: digestA,
      consequenceClass: "consequential",
      confirmationMode: "explicit",
      gates: [
        {
          gateId: "gate-1",
          gateRevision: "7",
          scope: "task:task-1",
          question: "Resume quarantined task?",
          consequences: ["Task execution may continue."],
        },
      ],
    });
    expect(presentation.actions).toStrictEqual([
      {
        id: "review:continue",
        label: "Continue to confirmation",
        enabled: true,
        availableAction: null,
      },
      {
        id: "review:cancel",
        label: "Cancel Review",
        enabled: true,
        availableAction: null,
      },
    ]);
    const frame = renderFabricConsoleFrame(
      richDataset(),
      controllerState(review()),
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );
    expect(frame.rows.join("\n")).toContain(
      "Consequence: Task execution may continue.",
    );
  });

  it("presents exact accepted artifact, action and target for promotion", () => {
    const base = review("committed");
    const promotion: ActionReview = {
      ...base,
      preview: {
        ...base.preview,
        consequenceClass: "promotion",
        intent: {
          kind: "promotion",
          projectSessionId: sessionId,
          coordinationRunId: "AFAB-004" as never,
          gateId: "gate-release" as never,
          expectedGateRevision: 9,
          expectedGateStatus: "approved",
          releaseBinding: {
            acceptedDeliveryReceiptRef: {
              path: "receipts/accepted.json" as never,
              digest: digestA,
            },
            artifactDigest: digestB,
            promotionAction: "publish",
            target: "registry:stable",
          },
        },
      },
      status: {
        status: "committed",
        commandId: "promotion-command",
        receipt: {
          commandId: "promotion-command",
          previewId: "preview-1",
          previewRevision: 3,
          intentDigest: digestB,
          beforeStateDigest: digestA,
          afterStateDigest: digestB,
          effectRef: {
            path: "effects/promotion.json" as never,
            digest: digestA,
          },
          evidenceRefs: [],
          committedAt: timestamp,
        },
      },
    };
    const presentation = presentFabricConsole(
      richDataset(),
      controllerState(promotion),
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );

    expect(presentation.review?.intent).toEqual(
      expect.arrayContaining([
        { label: "Accepted receipt", value: "receipts/accepted.json" },
        { label: "Accepted receipt digest", value: digestA },
        { label: "Artifact digest", value: digestB },
        { label: "Promotion action", value: "publish" },
        { label: "Promotion target", value: "registry:stable" },
      ]),
    );
    expect(presentation.review?.receipt).toStrictEqual({
      commandId: "promotion-command",
      afterStateDigest: digestB,
      effect: `effects/promotion.json@${digestA}`,
      committedAt: timestamp,
    });
    const frame = renderFabricConsoleFrame(
      richDataset(),
      controllerState(promotion),
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );
    const text = frame.rows.join("\n");
    expect(text).toContain(`RcptDig:${digestA}`);
    expect(text).toContain(`Artifact:${digestB}`);
    expect(text).toContain("Action:publish");
    expect(text).toContain("Target:registry:stable");
  });

  it("keeps optional GitHub failure explicit without degrading local projection", () => {
    const dataset = richDataset(11, "unavailable");
    const state = { ...controllerState(), activeView: "system" as const };
    const presentation = presentFabricConsole(
      dataset,
      state,
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );

    expect(presentation.connection).toBe("LIVE");
    expect(presentation.masterRows[0]).toMatchObject({
      stableId: "github",
      primary: "github",
      secondary: "adapter disabled",
      freshness: "UNAVAILABLE 5s",
    });
    expect(dataset.pages.work.rows).toHaveLength(1);
  });

  it("renders the responsive ladder at exact current terminal dimensions", () => {
    const dataset = richDataset();
    const state = controllerState();
    const ui = createFabricUiState({ draft: "preserve me", focusId: "row:attention:safety" });
    const cases = [
      [140, 36, "wide"],
      [80, 24, "reference"],
      [60, 18, "compact"],
      [30, 6, "strip"],
      [5, 2, "inert"],
      [0, 0, "inert"],
    ] as const;

    for (const [columns, rows, mode] of cases) {
      const before = structuredClone(ui);
      const frame = renderFabricConsoleFrame(dataset, state, ui, { columns, rows });
      expect(frame.mode).toBe(mode);
      expect(frame.columns).toBe(columns);
      expect(frame.rows).toHaveLength(rows);
      expect(frame.rows.every((line) => cellWidth(line) === columns)).toBe(true);
      expect(ui).toStrictEqual(before);
    }
  });

  it("retains the authoritative top attention item in strip mode from every view", () => {
    const state = { ...controllerState(), activeView: "system" as const };
    const frame = renderFabricConsoleFrame(
      richDataset(),
      state,
      createFabricUiState(),
      { columns: 30, rows: 6 },
    );
    expect(frame.mode).toBe("strip");
    expect(frame.presentation.activeView).toBe("system");
    expect(frame.presentation.topAttention?.stableId).toBe("attention:safety");
    expect(frame.rows[1]).toContain("Approve quarantine");
  });

  it("binds row and action hit geometry to item and projection revisions", () => {
    const dataset = richDataset();
    const frame = renderFabricConsoleFrame(
      dataset,
      controllerState(),
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );
    const rowRegion = frame.hitRegions.find(
      ({ id }) => id === "row:attention:attention:safety",
    );
    const actionRegion = frame.hitRegions.find(({ id }) => id === "action:resume");

    expect(rowRegion).toMatchObject({
      enabled: true,
      binding: {
        view: "attention",
        itemId: "attention:safety",
        itemRevision: "7",
        projectionRevision: "11",
      },
    });
    expect(actionRegion).toMatchObject({
      enabled: true,
      binding: rowRegion?.binding,
    });
    expect(frame.geometryKey).toContain("80x24:r11");
  });

  it("invalidates pointer activation after resize or revision change", () => {
    const dataset = richDataset();
    const frame = renderFabricConsoleFrame(
      dataset,
      controllerState(),
      createFabricUiState({ mouseCapture: true }),
      { columns: 80, rows: 24 },
    );
    const region = frame.hitRegions.find(({ id }) => id === "action:resume");
    expect(region).toBeDefined();
    if (region === undefined) return;
    const x = region.rect.x1;
    const y = region.rect.y1;
    const initial: FabricPointerState = { pressed: null };
    const pressed = reduceFabricPointer(
      initial,
      { kind: "mouse", phase: "press", button: "left", x, y, modifiers: { shift: false, alt: false, ctrl: false } },
      frame,
      dataset,
    );
    const resized = renderFabricConsoleFrame(
      dataset,
      controllerState(),
      createFabricUiState({ mouseCapture: true }),
      { columns: 120, rows: 30 },
    );
    const resizedAction = resized.hitRegions.find(({ id }) => id === "action:resume");
    expect(resizedAction).toBeDefined();
    if (resizedAction === undefined) return;

    const afterResize = reduceFabricPointer(
      pressed.state,
      {
        kind: "mouse",
        phase: "release",
        button: "left",
        x: resizedAction.rect.x1,
        y: resizedAction.rect.y1,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
      resized,
      dataset,
    );
    expect(afterResize.intents).toStrictEqual([]);

    const currentPress = reduceFabricPointer(
      initial,
      { kind: "mouse", phase: "press", button: "left", x, y, modifiers: { shift: false, alt: false, ctrl: false } },
      frame,
      dataset,
    );
    const changed = richDataset(12);
    const afterRevision = reduceFabricPointer(
      currentPress.state,
      { kind: "mouse", phase: "release", button: "left", x, y, modifiers: { shift: false, alt: false, ctrl: false } },
      frame,
      changed,
    );
    expect(afterRevision.intents).toStrictEqual([]);
  });
});

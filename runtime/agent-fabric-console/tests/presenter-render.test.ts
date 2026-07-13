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
  graphemes,
  renderFabricConsoleFrame,
  reduceFabricPointer,
  responsiveModeFor,
  writeFixedCells,
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
import type { ConsoleWorkflowReview } from "../src/workflow.js";

const timestamp = "2026-07-11T12:00:00.000Z" as Timestamp;
const digestA = (`sha256:${"a".repeat(64)}`) as Sha256Digest;
const digestB = (`sha256:${"b".repeat(64)}`) as Sha256Digest;
const projectId = "project-1" as ProjectId;
const sessionId = "session-1" as ProjectSessionId;

function cellAt(value: string, target: number): string | null {
  let offset = 1;
  for (const grapheme of graphemes(value)) {
    const width = cellWidth(grapheme);
    if (target >= offset && target < offset + width) return grapheme;
    offset += width;
  }
  return null;
}

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
          gateBinding: {
            gateId: "gate_quarantine_recovery" as never,
            gateRevision: 3,
            coordinationRunId: "AFAB-004" as never,
          },
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

function datasetWithHeader(
  overrides: Readonly<{
    project?: ProjectId;
    session?: ProjectSessionId;
    run?: RunProjection["runId"];
    phase?: string;
    owner?: AgentId;
    nextMilestone?: string;
  }>,
): FabricConsoleDataset {
  const dataset = richDataset();
  const snapshot = dataset.snapshot;
  if (
    snapshot === null ||
    !("value" in snapshot.project) ||
    !("value" in snapshot.session) ||
    snapshot.session.value === null ||
    !("value" in snapshot.runs)
  ) {
    throw new Error("live header fixture unavailable");
  }
  const run = snapshot.runs.value[0];
  if (run === undefined) throw new Error("run header fixture unavailable");
  return {
    ...dataset,
    snapshotRevision: revisionFromProtocol(Number.MAX_SAFE_INTEGER),
    snapshot: {
      ...snapshot,
      snapshotRevision: Number.MAX_SAFE_INTEGER,
      project: {
        ...snapshot.project,
        value: {
          ...snapshot.project.value,
          projectId: overrides.project ?? snapshot.project.value.projectId,
        },
      },
      session: {
        ...snapshot.session,
        value: {
          ...snapshot.session.value,
          projectSessionId:
            overrides.session ?? snapshot.session.value.projectSessionId,
        },
      },
      runs: {
        ...snapshot.runs,
        value: [{
          ...run,
          runId: overrides.run ?? run.runId,
          phase: overrides.phase ?? run.phase,
          chairAgentId: overrides.owner ?? run.chairAgentId,
          nextMilestone: overrides.nextMilestone ?? run.nextMilestone,
        }],
      },
    },
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

function controllableRunDataset(snapshotRevision = 11): FabricConsoleDataset {
  const dataset = richDataset(snapshotRevision);
  const run = dataset.pages.runs.rows[0];
  if (run === undefined) throw new Error("run fixture unavailable");
  return {
    ...dataset,
    pages: {
      ...dataset.pages,
      runs: {
        ...dataset.pages.runs,
        rows: [{
          ...run,
          detailRef: {
            kind: "run",
            projectSessionId: sessionId,
            coordinationRunId: "AFAB-004" as never,
            expectedRevision: 7,
          },
          actionAvailability: {
            state: "available",
            actions: ["resume"],
            requiresPreview: true,
          },
        }],
      },
    },
  };
}

function closedProjectionDataset(): FabricConsoleDataset {
  return {
    ...richDataset(),
    spec05: {
      reviewRuns: [{
        projectSessionId: sessionId,
        coordinationRunId: "AFAB-004",
        preparation: {
          state: "unavailable",
          reason: "preparation-id-not-projected",
          code: null,
        },
        completion: {
          state: "current",
          value: {
            schemaVersion: 1,
            blockers: [],
            targetGeneration: 4,
            targetChair: null,
            reviewedArtifactRef: "artifact-4",
            publicationLineageDigest: digestA,
            bundleDigest: digestB,
            manifestRootDigest: digestA,
            coverageDigest: digestB,
            riskReadMapDigest: digestA,
            mandatoryReadSetDigest: digestB,
            profileDigest: digestA,
            unavailableSlots: [],
            slots: [{
              slot: "native",
              headGeneration: 2,
              attemptGeneration: 1,
              actionRef: { adapterId: "adapter-native", actionId: "action-native" },
              evidenceId: "evidence-1",
              terminalKind: "safe-answer",
              verdict: "CLEAN",
              resultDigest: digestA,
              providerFailureCode: null,
              providerFailureDigest: null,
              routeReceiptDigest: digestB,
              adapterId: "adapter-native",
              endpointProvider: "openai",
              providerFamily: "gpt",
              model: "gpt-5.4",
              routeObservationDigest: digestA,
              actualRouteIdentityDigest: digestB,
              readCoverageDigest: digestA,
              reviewerFamilyRelation: "same-family-exempt",
              currentCertificationBasis: null,
              certifying: true,
              openFindingSet: { findingSetDigest: digestA, findingCount: 0, pageDigests: [] },
              blockers: [],
            }],
            finalReviewComplete: false,
          },
        },
        evidence: {
          state: "current",
          value: [{
            schemaVersion: 1,
            record: {
              evidenceId: "evidence-1",
              targetGeneration: 4,
              slot: "native",
              actionRef: { adapterId: "adapter-native", actionId: "action-native" },
              endpointProvider: "openai",
              providerFamily: "gpt",
              model: "gpt-5.4",
              routeReceiptDigest: digestB,
              routeObservationDigest: digestA,
              actualRouteIdentityDigest: digestB,
            },
            currency: {
              target: "current",
              source: "current",
              chair: "current",
              profile: "current",
              certifying: true,
              blockerCodes: [],
            },
            annotation: null,
          }],
        },
        recoveries: [],
        providerRoute: {
          state: "unavailable",
          reason: "operator-route-projection-unavailable",
          code: null,
        },
        capabilityFreshness: {
          state: "unavailable",
          reason: "operator-route-projection-unavailable",
          code: null,
        },
      }],
      topology: [{
        taskId: "task-1",
        coordinationRunId: "AFAB-004",
        read: {
          state: "current",
          value: {
            schemaVersion: 1,
            currency: "stale",
            pointer: { revision: 8 },
            plan: {
              waveId: "wave-7",
              waveRevision: 3,
              state: "started",
              predecessor: null,
              dependencies: [],
              decomposability: { kind: "decomposable", evidenceRef: "evidence-topology" },
              topology: { executionShape: "fabric-explicit", mode: "parallel", maximumConcurrentAgents: 3 },
              chair: { agentId: "codex-chair", principalGeneration: 2, chairLeaseGeneration: 4 },
              stageOwners: [{ stageId: "implementation", taskId: "task-1", ownerAgentId: "worker-1", writePartitionId: "partition-1" }],
              writePartitions: [{ partitionId: "partition-1", ownerAgentId: "worker-1", mode: "exclusive-write", pathSetDigest: digestA, authorityRef: "authority-1" }],
              contention: { mode: "disjoint-partitions", serializationOwnerAgentId: null, evidenceRef: "evidence-contention" },
              budget: { providerTurns: 12, toolCalls: 40, wallClockSeconds: 900, maximumParallelAgents: 3 },
              stopConditions: [{ conditionId: "stop-complete", kind: "objective-complete", predicateRef: "predicate-1" }],
              authority: { authorityRevision: 5, authorityRef: "authority-1", authorityDigest: digestA },
              policy: { policyRevision: 6, policyRef: "policy-1", policyDigest: digestB },
              rationaleRef: "rationale-evidence-1",
              planDigest: digestA,
            },
          },
        },
      }],
      contextPressure: [{
        agentId: "codex-chair",
        coordinationRunId: "AFAB-004",
        read: {
          state: "current",
          value: {
            schemaVersion: 1,
            currency: "current",
            readAt: timestamp,
            ageSeconds: 5,
            pressure: {
              pressure: "high",
              source: "native-exact",
              confidence: "exact",
              windowTokens: 100_000,
              usedTokens: 81_000,
              remainingTokens: 19_000,
              observedAt: timestamp,
              expiresAt: "2026-07-11T12:05:00.000Z",
              providerGeneration: 3,
              contextRevision: 9,
              revision: 4,
              evidenceDigest: digestB,
            },
          },
        },
      }],
    },
  } as unknown as FabricConsoleDataset;
}

function runControllerState(): ConsoleControllerState {
  const state = controllerState();
  return {
    ...state,
    activeView: "runs",
    selectionByView: {
      ...state.selectionByView,
      runs: { stableId: "AFAB-004", revision: revisionFromProtocol(7) },
    },
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

  it("wraps ordinary detail facts so long canonical identities remain revealable", () => {
    const dataset = richDataset();
    const projectRow = dataset.pages.project.rows[0];
    if (projectRow?.summary?.kind !== "project") {
      throw new Error("project fixture unavailable");
    }
    const longPath = `${"deep-segment/".repeat(18)}scope-tail.json` as never;
    const projected: FabricConsoleDataset = {
      ...dataset,
      pages: {
        ...dataset.pages,
        project: {
          ...dataset.pages.project,
          rows: [{
            ...projectRow,
            summary: {
              ...projectRow.summary,
              acceptedScopeRef: { path: longPath, digest: digestB },
            },
          }],
        },
      },
    };
    const base = controllerState();
    const state: ConsoleControllerState = {
      ...base,
      activeView: "project",
      selectionByView: {
        ...base.selectionByView,
        project: { stableId: projectRow.stableId, revision: projectRow.revision },
      },
    };
    const frame = renderFabricConsoleFrame(
      projected,
      state,
      createFabricUiState({ focusId: `detail:project:${projectRow.stableId}` }),
      { columns: 120, rows: 36 },
    );

    const revealed = frame.rows.join("").replaceAll(" ", "").replaceAll("|", "");
    expect(revealed).toContain("scope-tail.json");
    expect(revealed).toContain("b".repeat(32));
  });

  it("presents closed review, actual-route, topology, and context projections without legacy substitutes", () => {
    const dataset = closedProjectionDataset();
    const expectedByView = {
      runs: [
        ["Review preparation", "unavailable | preparation-id-not-projected"],
        ["Review target generation", "4"],
        ["Review completion", "INCOMPLETE"],
        ["Review slot native", "CLEAN | certifying"],
        ["Provider route", "unavailable | operator-route-projection-unavailable"],
        ["Capability freshness", "unavailable | operator-route-projection-unavailable"],
      ],
      work: [
        ["Topology currency", "STALE"],
        ["Topology wave", "wave-7@r3 | started"],
        ["Topology rationale", "rationale-evidence-1"],
        ["Topology execution", "fabric-explicit | parallel | max 3"],
      ],
      agents: [
        ["Context pressure", "HIGH | CURRENT | age 5s"],
        ["Context source", "native-exact | exact"],
        ["Context tokens", "window 100000 | used 81000 | remaining 19000"],
      ],
      evidence: [
        ["Actual review route", "openai | gpt | gpt-5.4"],
        ["Actual route proof", `proved | ${digestB}`],
        ["Review currency", "target current | source current | chair current | profile current"],
      ],
    } as const;

    for (const [view, expected] of Object.entries(expectedByView) as readonly [
      "runs" | "work" | "agents" | "evidence",
      readonly (readonly [string, string])[],
    ][]) {
      const base = controllerState();
      const stableId = dataset.pages[view].rows[0]?.stableId;
      if (stableId === undefined) throw new Error(`${view} fixture unavailable`);
      const state: ConsoleControllerState = {
        ...base,
        activeView: view,
        selectionByView: {
          ...base.selectionByView,
          [view]: { stableId, revision: revisionFromProtocol(7) },
        },
      };
      const lines = presentFabricConsole(
        dataset,
        state,
        createFabricUiState(),
        { columns: 120, rows: 36 },
      ).detail?.lines;
      expect(lines).toEqual(expect.arrayContaining(
        expected.map(([label, value]) => ({ label, value })),
      ));
    }
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
        enabled: true,
      }),
      expect.objectContaining({ id: "workflow:accept", label: "Accept", enabled: true }),
      expect.objectContaining({
        id: "workflow:request-changes",
        label: "Request changes",
        enabled: true,
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

  it("enables only the selected run's exact projected control eligibility", () => {
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
              actions: ["pause", "cancel"],
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
        enabled: true,
      }),
      expect.objectContaining({ id: "action:cancel", enabled: false, reason: "enter-a-reason" }),
    ]));
    expect(presentation.actions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "action:resume" }),
      expect.objectContaining({ id: "action:steer" }),
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
        reason: "attention-intake-binding-unavailable",
      }),
      expect.objectContaining({
        id: "workflow:accept",
        enabled: true,
      }),
      expect.objectContaining({
        id: "workflow:request-changes",
        enabled: true,
      }),
      expect.objectContaining({
        id: "workflow:defer",
        enabled: true,
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
          detailRef: {
            kind: "run" as const,
            coordinationRunId: "AFAB-004" as never,
            expectedRevision: 7,
          },
          actionAvailability: {
            state: "available" as const,
            actions: ["pause", "resume"] as const,
            requiresPreview: true as const,
          },
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
      expect(presentation.actions).toStrictEqual([]);

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

  it.each(FABRIC_VIEWS.filter((view) => view !== "runs"))(
    "suppresses raw control capability leakage from the %s view",
    (view) => {
      const dataset = richDataset();
      const selected = dataset.pages[view].rows[0];
      if (selected === undefined) throw new Error(`${view} fixture unavailable`);
      const leaked = {
        ...selected,
        detailRef: {
          kind: "run" as const,
          projectSessionId: sessionId,
          coordinationRunId: "AFAB-004" as never,
          expectedRevision: 7,
        },
        actionAvailability: {
          state: "available" as const,
          actions: ["pause", "resume", "cancel", "steer"] as const,
          requiresPreview: true as const,
        },
      };
      const projected: FabricConsoleDataset = {
        ...dataset,
        pages: {
          ...dataset.pages,
          [view]: { ...dataset.pages[view], rows: [leaked] },
        } as FabricConsoleDataset["pages"],
      };
      const base = controllerState();
      const state: ConsoleControllerState = {
        ...base,
        activeView: view,
        selectionByView: {
          ...base.selectionByView,
          [view]: { stableId: selected.stableId, revision: selected.revision },
        },
      };
      const presentation = presentFabricConsole(
        projected,
        state,
        createFabricUiState({ draft: "unsafe control draft" }),
        { columns: 80, rows: 24 },
      );
      expect(presentation.actions.filter(({ id }) =>
        id === "action:pause" || id === "action:resume" ||
        id === "action:cancel" || id === "action:steer"
      )).toStrictEqual([]);
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

  it("keeps a projected conflict visible while the transport is degraded", () => {
    const dataset = richDataset();
    if (dataset.snapshot === null) throw new Error("snapshot fixture unavailable");
    const conflicted: FabricConsoleDataset = {
      ...dataset,
      connection: { state: "degraded", reason: "transport-failure" },
      snapshot: {
        ...dataset.snapshot,
        runs: {
          freshness: "conflict",
          source: "fabric",
          revision: dataset.snapshot.snapshotRevision,
          observedAt: timestamp,
          candidates: [
            dataset.snapshot.runs.freshness === "conflict"
              ? dataset.snapshot.runs.candidates[0]
              : dataset.snapshot.runs.freshness === "unavailable"
                ? []
                : dataset.snapshot.runs.value,
            [],
          ],
        },
      },
    };

    expect(presentFabricConsole(
      conflicted,
      controllerState(),
      createFabricUiState(),
      { columns: 80, rows: 24 },
    ).header.freshness).toBe("conflict");
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

  it("enforces 30x6 as the exact interactive minimum without coercing invalid dimensions", () => {
    const cases = [
      [{ columns: 30, rows: 6 }, "strip"],
      [{ columns: 29, rows: 6 }, "inert"],
      [{ columns: 30, rows: 5 }, "inert"],
      [{ columns: 29, rows: 5 }, "inert"],
      [{ columns: 29, rows: 24 }, "inert"],
      [{ columns: 80, rows: 5 }, "inert"],
      [{ columns: 30.5, rows: 6 }, "inert"],
      [{ columns: 30, rows: 6.5 }, "inert"],
      [{ columns: Number.MAX_SAFE_INTEGER, rows: 6 }, "inert"],
      [{ columns: 80, rows: 24 }, "reference"],
      [{ columns: 140, rows: 36 }, "wide"],
    ] as const;

    for (const [viewport, mode] of cases) {
      expect(responsiveModeFor(viewport)).toBe(mode);
      expect(renderFabricConsoleFrame(
        richDataset(),
        controllerState(),
        createFabricUiState(),
        viewport,
      ).mode).toBe(mode);
    }
  });

  it("keeps one safe selected-item action reachable at the 30x6 minimum", () => {
    const frame = renderFabricConsoleFrame(
      controllableRunDataset(),
      runControllerState(),
      createFabricUiState({ focusId: "action:resume" }),
      { columns: 30, rows: 6 },
    );

    expect(frame.mode).toBe("strip");
    expect(frame.rows[4]).toContain("Resume");
    expect(frame.hitRegions.find(({ id }) => id === "action:resume"))
      .toMatchObject({ enabled: true, rect: { y1: 5, y2: 5 } });
  });

  it("allocates every mandatory 80x24 header field before clipping its value", () => {
    const frame = renderFabricConsoleFrame(
      datasetWithHeader({
        project: "project-".repeat(20) as ProjectId,
        session: "session-".repeat(20) as ProjectSessionId,
        run: "run-".repeat(20) as RunProjection["runId"],
        phase: "phase-".repeat(20),
        owner: "owner-".repeat(20) as AgentId,
        nextMilestone: "next-".repeat(30),
      }),
      controllerState(),
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );
    const [identity = "", lifecycle = "", next = ""] = frame.rows;

    expect(identity.slice(0, 18)).toMatch(/^P:.*~$/u);
    expect(identity.slice(19, 35)).toMatch(/^S:.*~$/u);
    expect(identity.slice(36, 50)).toMatch(/^R:.*~$/u);
    expect(identity.slice(51, 72)).toMatch(/^r9007199254740991/u);
    expect(identity.slice(73, 80)).toBe("LIVE   ");
    expect([identity[18], identity[35], identity[50], identity[72]])
      .toStrictEqual(["|", "|", "|", "|"]);

    expect(lifecycle.slice(0, 25)).toMatch(/^Phase:.*~$/u);
    expect(lifecycle.slice(26, 45)).toMatch(/^Owner:.*~$/u);
    expect(lifecycle.slice(46, 64)).toMatch(/^Health:/u);
    expect(lifecycle.slice(65, 72)).toMatch(/^Attn:/u);
    expect(lifecycle.slice(73, 80)).toMatch(/^Runs:/u);
    expect([lifecycle[25], lifecycle[45], lifecycle[64], lifecycle[72]])
      .toStrictEqual(["|", "|", "|", "|"]);

    expect(next.slice(0, 52)).toMatch(/^Next:.*~$/u);
    expect(next.slice(53, 80)).toMatch(/^Capacity:/u);
    expect(next[52]).toBe("|");
  });

  it("keeps every responsive hit region visible, bounded, and non-overlapping", () => {
    const dataset = richDataset();
    const state = controllerState();
    const ui = createFabricUiState();
    const viewports = [
      { columns: 140, rows: 36 },
      { columns: 80, rows: 24 },
      { columns: 60, rows: 18 },
      { columns: 30, rows: 6 },
      { columns: 8, rows: 1 },
      { columns: 0, rows: 0 },
    ] as const;

    for (const viewport of viewports) {
      const frame = renderFabricConsoleFrame(dataset, state, ui, viewport);
      for (const region of frame.hitRegions) {
        expect(region.rect.x1).toBeGreaterThanOrEqual(1);
        expect(region.rect.y1).toBeGreaterThanOrEqual(1);
        expect(region.rect.x2).toBeLessThanOrEqual(viewport.columns);
        expect(region.rect.y2).toBeLessThanOrEqual(viewport.rows);
        const visible = frame.rows
          .slice(region.rect.y1 - 1, region.rect.y2)
          .map((line) => line.slice(region.rect.x1 - 1, region.rect.x2))
          .join("\n");
        expect(visible.trim(), `${frame.mode}:${region.id}`).not.toBe("");
      }
      for (const [index, region] of frame.hitRegions.entries()) {
        for (const other of frame.hitRegions.slice(index + 1)) {
          const overlaps =
            region.rect.x1 <= other.rect.x2 &&
            other.rect.x1 <= region.rect.x2 &&
            region.rect.y1 <= other.rect.y2 &&
            other.rect.y1 <= region.rect.y2;
          expect(overlaps, `${frame.mode}:${region.id}:${other.id}`).toBe(false);
        }
      }
    }
  });

  it("composes wide CJK and emoji master/detail rows around cell-bound splitters", () => {
    const dataset = richDataset();
    const attention = dataset.pages.attention.rows[0];
    if (attention?.summary?.kind !== "attention") {
      throw new Error("attention fixture unavailable");
    }
    const wideDataset: FabricConsoleDataset = {
      ...dataset,
      pages: {
        ...dataset.pages,
        attention: {
          ...dataset.pages.attention,
          rows: [{
            ...attention,
            summary: {
              ...attention.summary,
              title: `👩‍💻 ${"界漢".repeat(30)} 🧑🏽‍🚀`,
            },
          }, ...dataset.pages.attention.rows.slice(1)],
        },
      },
    };
    const frame = renderFabricConsoleFrame(
      wideDataset,
      controllerState(),
      createFabricUiState({ focusId: "splitter:master-detail", splitterRatio: 0.45 }),
      { columns: 140, rows: 36 },
    );
    const splitter = frame.hitRegions.find(({ id }) => id === "splitter:master-detail");
    const master = frame.hitRegions.find(({ id }) => id === "row:attention:attention:safety");
    const detail = frame.hitRegions.find(({ id }) => id === "detail:attention:attention:safety");

    expect(splitter).toBeDefined();
    expect(master).toBeDefined();
    expect(detail).toBeDefined();
    if (splitter === undefined || master === undefined || detail === undefined) return;
    expect(frame.rows.every((row) => cellWidth(row) === 140)).toBe(true);
    expect(cellAt(frame.rows[splitter.rect.y1 - 1] ?? "", splitter.rect.x1)).toBe(">");
    expect(master.rect.x2 + 1).toBe(splitter.rect.x1);
    expect(splitter.rect.x2 + 1).toBe(detail.rect.x1);
    expect(frame.rows.join("\n")).toContain("界");
    expect(frame.rows.join("\n")).toContain("漢");
  });

  it("blanks a whole wide grapheme when fixed-cell replacement intersects it", () => {
    const source = "A界B👩‍💻C ";
    const cjkIntersection = writeFixedCells(source, 3, 1, "|");
    const emojiIntersection = writeFixedCells(source, 6, 1, "|");

    expect(cellWidth(cjkIntersection)).toBe(cellWidth(source));
    expect(cellAt(cjkIntersection, 2)).toBe(" ");
    expect(cellAt(cjkIntersection, 3)).toBe("|");
    expect(cellWidth(emojiIntersection)).toBe(cellWidth(source));
    expect(cellAt(emojiIntersection, 5)).toBe(" ");
    expect(cellAt(emojiIntersection, 6)).toBe("|");
    expect(cjkIntersection).not.toContain("界");
    expect(emojiIntersection).not.toContain("👩‍💻");
  });

  it("terminal-neutralises hostile projected chrome in the canonical renderer", () => {
    const frame = renderFabricConsoleFrame(
      datasetWithHeader({
        project: "p\u001b" as ProjectId,
        session: "s\u009b" as ProjectSessionId,
        run: "r\u202e" as RunProjection["runId"],
        phase: "ph\u2066",
        owner: "o\u0007" as AgentId,
        nextMilestone: "n\u007f",
      }),
      controllerState(),
      createFabricUiState(),
      { columns: 140, rows: 36 },
    );
    const output = frame.rows.join("\n");

    expect(output).not.toContain("\u001b");
    expect(output).not.toContain("\u009b");
    expect(output).not.toContain("\u202e");
    expect(output).not.toContain("\u2066");
    expect(output).toContain("<ESC>");
    expect(output).toContain("<C1-9B>");
    expect(output).toContain("<BIDI-U+202E>");
    expect(output).toContain("<BIDI-U+2066>");
    expect(output).toContain("<BEL>");
    expect(output).toContain("<DEL>");
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

  it("makes every height below six inert even when the detach label fits", () => {
    const frame = renderFabricConsoleFrame(
      richDataset(),
      controllerState(),
      createFabricUiState(),
      { columns: 30, rows: 3 },
    );

    expect(frame.mode).toBe("inert");
    expect(frame.rows[0]).toContain("q detach");
    expect(frame.rows.join("\n")).not.toContain("Approve quarantine");
    expect(frame.hitRegions.map(({ id }) => id)).toStrictEqual(["detach"]);
  });

  it("uses narrow tall strip rows for identity, operating state, and selected work", () => {
    const frame = renderFabricConsoleFrame(
      richDataset(),
      controllerState(),
      createFabricUiState({ focusId: "row:attention:attention:safety" }),
      { columns: 30, rows: 24 },
    );
    const visible = frame.rows.join("\n");

    expect(frame.mode).toBe("strip");
    expect(visible).toContain("Project:project-1");
    expect(visible).toContain("Session:session-1");
    expect(visible).toContain("Run:AFAB-004");
    expect(visible).toContain("Revision:r11");
    expect(visible).toContain("Fresh:LIVE");
    expect(visible).toContain("Phase:implement");
    expect(visible).toContain("Owner:codex-chair");
    expect(visible).toContain("Next:Console GREEN");
    expect(visible).toContain("Health:blocked");
    expect(visible).toContain(">*!! Approve quarantine");
    expect(frame.rows.filter((line) => line.trim().length > 0).length).toBeGreaterThanOrEqual(12);
    expect(frame.hitRegions.find(({ id }) => id === "detach")).toMatchObject({
      rect: { y1: 24, y2: 24 },
      enabled: true,
    });
  });

  it("withholds strip confirmation at widths 30 and 39 until exact context fits", () => {
    const dataset = richDataset();
    const state = controllerState(review("confirm"));
    const width30 = renderFabricConsoleFrame(
      dataset,
      state,
      createFabricUiState({ focusId: "review:confirm" }),
      { columns: 30, rows: 8 },
    );
    const width39 = renderFabricConsoleFrame(
      dataset,
      state,
      createFabricUiState({ focusId: "review:confirm" }),
      { columns: 39, rows: 8 },
    );
    const reference = renderFabricConsoleFrame(
      dataset,
      state,
      createFabricUiState({ focusId: "review:confirm" }),
      { columns: 80, rows: 24 },
    );

    for (const frame of [width30, width39]) {
      expect(frame.rows.join("\n")).toContain("REVIEW CONFIRM");
      expect(frame.hitRegions.some(({ id }) => id === "review:confirm"))
        .toBe(false);
      expect(frame.hitRegions.some(
        ({ kind }) => kind === "row" || kind === "tab" || kind === "splitter",
      )).toBe(false);
    }
    const visibleReference = reference.rows.join("\n");
    expect(visibleReference).toContain("Evidence:");
    expect(visibleReference).toContain("Question: Resume quarantined task?");
    expect(visibleReference).toContain("Reason: Replacement evidence passed.");
    expect(visibleReference).toContain("Recommendation: approve");
    expect(visibleReference).toContain(`Preview:${digestA}`);
    expect(visibleReference).toContain(`Intent:${digestB}`);
    expect(visibleReference).toContain(`Before:${digestA}`);
    expect(visibleReference).toContain("Confirmation: explicit");
    expect(reference.hitRegions.find(({ id }) => id === "review:confirm"))
      .toMatchObject({
      kind: "action",
      enabled: true,
    });
  });

  it("reports exact review coverage without inventing a percentage", () => {
    const frame = renderFabricConsoleFrame(
      richDataset(),
      controllerState(review()),
      createFabricUiState(),
      { columns: 30, rows: 8 },
    );
    const visible = frame.rows.join("\n");

    expect(visible).toMatch(/C\d+\/\d+/u);
    expect(visible).not.toContain("%");
  });

  it("counts every workflow intent line before enabling review continuation", () => {
    const workflow: ConsoleWorkflowReview = {
      workflowId: "workflow-intent-visibility",
      kind: "project-session-transition",
      source: "daemon-preview",
      stage: "review",
      previewDigest: "sha256:preview",
      expectedRevision: revisionFromProtocol(11),
      consequenceClass: "consequential",
      confirmationMode: "explicit",
      summary: "Transition the exact session",
      details: [
        { label: "Session", value: "session-1" },
        { label: "Expected revision", value: "11" },
      ],
      evidence: ["evidence/session-transition.json"],
      openedByEventId: "event-workflow-open",
      armedByEventId: null,
      result: null,
      failure: null,
    };
    const short = renderFabricConsoleFrame(
      richDataset(),
      controllerState(),
      createFabricUiState({ workflowReview: workflow }),
      { columns: 200, rows: 12 },
    );
    const complete = renderFabricConsoleFrame(
      richDataset(),
      controllerState(),
      createFabricUiState({ workflowReview: workflow }),
      { columns: 200, rows: 18 },
    );

    expect(short.rows.join("\n")).not.toContain("Intent Expected revision:11");
    expect(short.hitRegions.some(({ id }) => id === "review:continue"))
      .toBe(false);
    expect(complete.rows.join("\n")).toContain("Intent Expected revision:11");
    expect(complete.hitRegions.find(({ id }) => id === "review:continue"))
      .toMatchObject({ enabled: true });
  });

  it.each(["editor", "guided", "palette"] as const)(
    "renders honest %s modal help with explicit input focus and local Detach authority",
    (inputMode) => {
      const frame = renderFabricConsoleFrame(
        richDataset(),
        controllerState(),
        createFabricUiState({
          inputMode,
          draft: "q? remains draft",
          mouseCapture: true,
        }),
        { columns: 80, rows: 24 },
      );
      const visible = frame.rows.join("\n");

      expect(visible).toContain("Esc");
      expect(visible).toContain("Ctrl-C");
      expect(visible).toContain("Detach");
      expect(visible).not.toContain("? help");
      expect(visible).not.toContain("q detach");
      expect(frame.hitRegions.map(({ id }) => id)).toStrictEqual([
        `input:${inputMode}`,
        "detach",
      ]);
    },
  );

  it("makes a full-size review modal pointer-local and removes underlying hit geometry", () => {
    const frame = renderFabricConsoleFrame(
      richDataset(),
      controllerState(review()),
      createFabricUiState({ mouseCapture: true }),
      { columns: 80, rows: 24 },
    );
    const ids = frame.hitRegions.map(({ id }) => id);

    expect(ids).toContain("review:scroll");
    expect(ids).toContain("review:continue");
    expect(ids).toContain("review:cancel");
    expect(ids).toContain("detach");
    expect(frame.hitRegions.some(({ kind }) => kind === "row" || kind === "tab" || kind === "splitter")).toBe(false);
    expect(ids.some((id) => id.startsWith("action:") || id.startsWith("view:"))).toBe(false);
  });

  it("exposes inert detach geometry only when its label is visible", () => {
    const dataset = richDataset();
    const state = controllerState();
    const ui = createFabricUiState();
    const visible = renderFabricConsoleFrame(dataset, state, ui, {
      columns: 8,
      rows: 1,
    });
    const clipped = renderFabricConsoleFrame(dataset, state, ui, {
      columns: 7,
      rows: 1,
    });

    expect(visible).toMatchObject({ mode: "inert", rows: ["q detach"] });
    expect(visible.hitRegions).toStrictEqual([
      {
        id: "detach",
        kind: "detach",
        rect: { x1: 1, y1: 1, x2: 8, y2: 1 },
        enabled: true,
        geometryKey: visible.geometryKey,
        binding: null,
      },
    ]);
    expect(clipped.rows[0]?.trim()).toBe("");
    expect(clipped.hitRegions).toStrictEqual([]);
  });

  it("binds row and action hit geometry to item and projection revisions", () => {
    const dataset = controllableRunDataset();
    const frame = renderFabricConsoleFrame(
      dataset,
      runControllerState(),
      createFabricUiState(),
      { columns: 80, rows: 24 },
    );
    const rowRegion = frame.hitRegions.find(
      ({ id }) => id === "row:runs:AFAB-004",
    );
    const actionRegion = frame.hitRegions.find(({ id }) => id === "action:resume");

    expect(rowRegion).toMatchObject({
      enabled: true,
      binding: {
        view: "runs",
        itemId: "AFAB-004",
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
    const dataset = controllableRunDataset();
    const frame = renderFabricConsoleFrame(
      dataset,
      runControllerState(),
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
      runControllerState(),
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
    const changed = controllableRunDataset(12);
    const afterRevision = reduceFabricPointer(
      currentPress.state,
      { kind: "mouse", phase: "release", button: "left", x, y, modifiers: { shift: false, alt: false, ctrl: false } },
      frame,
      changed,
    );
    expect(afterRevision.intents).toStrictEqual([]);
  });
});

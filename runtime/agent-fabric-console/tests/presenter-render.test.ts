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
        repositoryRevision: "c2fc623",
      }),
    ],
    runs: [
      row("runs", "AFAB-004", {
        kind: "run",
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
    connection: { state: "live" },
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
      if (first?.summary?.kind !== "attention") {
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

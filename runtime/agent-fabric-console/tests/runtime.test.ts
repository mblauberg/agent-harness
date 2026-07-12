import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type {
  OperatorActionAvailability,
  ProjectId,
  Sha256Digest,
  Timestamp,
} from "@local/agent-fabric-protocol";
import type { ConsoleControllerState } from "../src/controller.js";
import {
  FabricConsoleRuntime,
  type FabricRuntimeController,
} from "../src/runtime.js";
import {
  FABRIC_VIEWS,
  createEmptyViewPages,
  revisionFromProtocol,
  type ConsoleRow,
  type FabricView,
} from "../src/model.js";
import { createFabricUiState } from "../src/presenter.js";
import type { FabricConsoleDataset } from "../src/protocol-adapter.js";
import {
  reduceFabricPointer,
  renderFabricConsoleFrame,
} from "../src/index.js";

const timestamp = "2026-07-11T12:00:00.000Z" as Timestamp;
const digest = (`sha256:${"a".repeat(64)}`) as Sha256Digest;
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
const available: OperatorActionAvailability = {
  state: "available",
  actions: ["resume"],
  requiresPreview: true,
};

function fixtureDataset(revision = 11): FabricConsoleDataset {
  const row: ConsoleRow<"attention"> = {
    view: "attention",
    stableId: "attention:1",
    revision: revisionFromProtocol(7),
    urgency: "critical-path",
    freshness: {
      state: "live",
      source: "fabric",
      revision: revisionFromProtocol(7),
      observedAt: timestamp,
      ageMs: 0,
    },
    summary: {
      kind: "attention",
      label: "Blocked",
      priority: "critical-path",
      title: "Resume blocked task",
      nativeNotification,
    },
    detailRef: {
      kind: "system",
      componentId: "attention:1",
      expectedRevision: 7,
    },
    actionAvailability: available,
  };
  const empty = createEmptyViewPages();
  return {
    connection: { state: "live", compatibility: { mode: "current" } },
    snapshot: {
      schemaVersion: 1,
      snapshotRevision: revision,
      readTransactionId: "snapshot-read",
      project: {
        freshness: "live",
        source: "fabric",
        revision,
        observedAt: timestamp,
        value: {
          projectId: "project-1" as ProjectId,
          canonicalRoot: "/repo",
        },
      },
      session: {
        freshness: "unavailable",
        source: "fabric",
        revision,
        observedAt: timestamp,
        reason: "no session",
      },
      runs: {
        freshness: "live",
        source: "fabric",
        revision,
        observedAt: timestamp,
        value: [],
      },
      attention: {
        freshness: "live",
        source: "fabric",
        revision,
        observedAt: timestamp,
        value: [],
      },
      capacity: {
        freshness: "unavailable",
        source: "fabric",
        revision,
        observedAt: timestamp,
        reason: "unknown",
      },
      cursor: revision,
      stateDigest: digest,
    },
    snapshotRevision: revisionFromProtocol(revision),
    cursor: revision,
    pages: {
      ...empty,
      attention: {
        view: "attention",
        rows: [row],
        nextCursor: 1,
        hasMore: false,
        snapshotRevision: revisionFromProtocol(revision),
        readTransactionId: "attention-read",
      },
    },
    loadedAtMs: Date.parse(timestamp),
    canMutate: true,
  };
}

function emptyViewRecord<Value>(value: Value): Record<FabricView, Value> {
  return Object.fromEntries(FABRIC_VIEWS.map((view) => [view, value])) as Record<
    FabricView,
    Value
  >;
}

class FakeController implements FabricRuntimeController {
  dataset = fixtureDataset();
  state: ConsoleControllerState = {
    activeView: "attention",
    selectionByView: {
      ...emptyViewRecord(null),
      attention: {
        stableId: "attention:1",
        revision: revisionFromProtocol(7),
      },
    },
    scrollAnchorByView: emptyViewRecord(null),
    review: null,
    pendingCommandIds: ["pending-1"],
    lastActionStatus: null,
    lastReceipt: null,
  } as ConsoleControllerState;

  activateView(view: FabricView): void {
    this.state = { ...this.state, activeView: view };
  }

  select(view: FabricView, stableId: string): void {
    const selected = this.dataset.pages[view].rows.find(
      (row) => row.stableId === stableId,
    );
    if (selected === undefined) return;
    this.state = {
      ...this.state,
      selectionByView: {
        ...this.state.selectionByView,
        [view]: { stableId, revision: selected.revision },
      },
    };
  }

  setScrollAnchor(view: FabricView, stableId: string | null): void {
    this.state = {
      ...this.state,
      scrollAnchorByView: {
        ...this.state.scrollAnchorByView,
        [view]: stableId,
      },
    };
  }

  updateDataset(dataset: FabricConsoleDataset): void {
    this.dataset = dataset;
  }
}

describe("Fabric Console runtime routing", () => {
  it("uses s to return an exact session to the project selector", async () => {
    const controller = new FakeController();
    controller.dataset = {
      ...controller.dataset,
      projectSessions: {
        choices: [{
          projectSessionId: "session_switch_01" as never,
          mode: "independent",
          state: "active",
          revision: 1,
          generation: 1,
          lastEventAt: timestamp,
        }],
        selectedProjectSessionId: "session_switch_01" as never,
      },
    };
    const activate = vi.fn(async () => {});
    const runtime = new FabricConsoleRuntime({
      controller,
      viewport: { columns: 80, rows: 24 },
      draw: () => {},
      detach: async () => {},
      activate,
      eventId: () => "switch-session-event",
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });

    await runtime.handleInput({ kind: "key", key: "text", text: "s" });

    expect(activate).toHaveBeenCalledWith({
      regionId: "session:switch-project",
      binding: null,
      provenance: "keyboard",
      eventId: "switch-session-event",
    });
  });

  it("routes all eight views and paging without stealing editor digits", async () => {
    const controller = new FakeController();
    const setEditorActive = vi.fn();
    const runtime = new FabricConsoleRuntime({
      controller,
      viewport: { columns: 80, rows: 24 },
      draw: () => {},
      detach: async () => {},
      activate: async () => {},
      eventId: (() => {
        let value = 0;
        return () => `event-${String(++value)}`;
      })(),
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
      setEditorActive,
    });

    for (const [index, view] of FABRIC_VIEWS.entries()) {
      await runtime.handleInput({ kind: "key", key: "text", text: String(index + 1) });
      expect(controller.state.activeView).toBe(view);
    }
    await runtime.handleInput({ kind: "key", key: "text", text: "[" });
    expect(controller.state.activeView).toBe("activity");
    await runtime.handleInput({ kind: "key", key: "text", text: "]" });
    expect(controller.state.activeView).toBe("system");
    await runtime.handleInput({ kind: "key", key: "alt-1" });
    expect(controller.state.activeView).toBe("attention");

    runtime.setInputMode("editor");
    await runtime.handleInput({ kind: "key", key: "text", text: "8" });
    await runtime.handleInput({ kind: "key", key: "page-down" });
    expect(controller.state.activeView).toBe("attention");
    expect(runtime.ui.draft).toBe("8");
    expect(setEditorActive).toHaveBeenCalledWith(true);
    await runtime.handleInput({ kind: "key", key: "escape" });
    expect(setEditorActive).toHaveBeenLastCalledWith(false);
  });

  it("keeps displayed action numbers stable across disabled and workflow entries", async () => {
    const controller = new FakeController();
    const activate = vi.fn(async () => {});
    const render: typeof renderFabricConsoleFrame = (
      dataset,
      state,
      ui,
      viewport,
    ) => {
      const frame = renderFabricConsoleFrame(dataset, state, ui, viewport);
      const binding = frame.hitRegions.find(({ kind }) => kind === "action")?.binding ?? null;
      const y = frame.rows.length - 2;
      const actions = [
        {
          id: "workflow:discuss",
          label: "Discuss",
          enabled: false,
          availableAction: null,
          reason: "daemon-chair-request-preparation-unavailable",
        },
        {
          id: "workflow:accept",
          label: "Accept",
          enabled: true,
          availableAction: null,
        },
      ] as const;
      return {
        ...frame,
        presentation: { ...frame.presentation, actions, focusId: ui.focusId },
        hitRegions: [
          ...frame.hitRegions.filter(({ kind }) => kind !== "action"),
          {
            id: actions[0].id,
            kind: "action" as const,
            rect: { x1: 1, y1: y, x2: 12, y2: y },
            enabled: false,
            geometryKey: frame.geometryKey,
            binding,
          },
          {
            id: actions[1].id,
            kind: "action" as const,
            rect: { x1: 14, y1: y, x2: 24, y2: y },
            enabled: true,
            geometryKey: frame.geometryKey,
            binding,
          },
        ],
      };
    };
    const runtime = new FabricConsoleRuntime({
      controller,
      viewport: { columns: 80, rows: 24 },
      ui: createFabricUiState({ focusId: "workflow:accept" }),
      draw: () => {},
      detach: async () => {},
      activate,
      eventId: () => "numbered-workflow-action",
      render,
      reducePointer: reduceFabricPointer,
    });

    await runtime.handleInput({ kind: "key", key: "text", text: "1" });
    expect(activate).not.toHaveBeenCalled();
    expect(runtime.ui.notice).toBe(
      "Action unavailable: daemon-chair-request-preparation-unavailable",
    );
    expect(controller.state.activeView).toBe("attention");
    await runtime.handleInput({ kind: "key", key: "text", text: "2" });
    expect(activate).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledWith(expect.objectContaining({
      regionId: "workflow:accept",
      provenance: "keyboard",
    }));
    expect(controller.state.activeView).toBe("attention");
  });

  it("opens the typed workflow palette and submits inert JSON only to Review", async () => {
    const activate = vi.fn(async () => {});
    const runtime = new FabricConsoleRuntime({
      controller: new FakeController(),
      viewport: { columns: 80, rows: 24 },
      draw: () => {},
      detach: async () => {},
      activate,
      eventId: () => "palette-event",
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });

    await runtime.handleInput({ kind: "key", key: "text", text: ":" });
    expect(runtime.ui.inputMode).toBe("palette");
    await runtime.handleInput({
      kind: "paste",
      text: '{"kind":"intake-draft-create","request":{"summary":"Discuss first"}}',
    });
    expect(activate).not.toHaveBeenCalled();
    expect(runtime.frame.rows.join("\n")).toContain("WORKFLOW JSON:");
    expect(runtime.frame.rows.join("\n")).toContain("Enter opens Review");

    await runtime.handleInput({ kind: "key", key: "enter" });

    expect(activate).toHaveBeenCalledWith({
      regionId: "palette:submit",
      binding: null,
      provenance: "keyboard",
      eventId: "palette-event",
    });
    expect(runtime.ui.inputMode).toBe("browse");
  });

  it("collects an echo confirmation as inert editor text before activation", async () => {
    const setEditorActive = vi.fn();
    const runtime = new FabricConsoleRuntime({
      controller: new FakeController(),
      viewport: { columns: 80, rows: 24 },
      draw: () => {},
      detach: async () => {},
      activate: async () => {},
      eventId: () => "echo-event",
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
      setEditorActive,
    });
    runtime.setWorkflowReview({
      workflowId: "workflow_echo",
      kind: "operator-action",
      source: "daemon-preview",
      stage: "confirm",
      previewDigest: digest,
      expectedRevision: revisionFromProtocol(7),
      consequenceClass: "consequential",
      confirmationMode: "echo",
      summary: "operator-action:project-session-stop",
      details: [],
      evidence: [],
      openedByEventId: "echo-open",
      armedByEventId: "echo-arm",
      result: null,
      failure: null,
    });

    expect(runtime.ui.inputMode).toBe("editor");
    expect(runtime.ui.draft).toBe("");
    await runtime.handleInput({ kind: "paste", text: digest });
    expect(runtime.ui.draft).toBe(digest);
    await runtime.handleInput({ kind: "key", key: "escape" });
    expect(runtime.ui.inputMode).toBe("browse");
    expect(setEditorActive).toHaveBeenLastCalledWith(false);
  });

  it("keeps bounded raw drafts, makes paste inert for actions and surfaces input drops", async () => {
    const activate = vi.fn(async () => {});
    const runtime = new FabricConsoleRuntime({
      controller: new FakeController(),
      viewport: { columns: 80, rows: 24 },
      ui: createFabricUiState({ inputMode: "editor" }),
      maxDraftBytes: 16,
      draw: () => {},
      detach: async () => {},
      activate,
      eventId: () => "event-1",
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });

    await runtime.handleInput({
      kind: "paste",
      text: "q\nconfirm\u001b[31m",
    });
    expect(Buffer.byteLength(runtime.ui.draft)).toBeLessThanOrEqual(16);
    expect(runtime.ui.draft).toContain("\u001b");
    expect(activate).not.toHaveBeenCalled();

    await runtime.handleInput({ kind: "rejected", reason: "sequence-overflow" });
    await runtime.handleInput({ kind: "rejected", reason: "chunk-overflow" });
    expect(runtime.ui.rejectedInputCount).toBe(2);
    expect(runtime.ui.notice).toMatch(/^Input dropped \(2\): chunk-overflow/);
    expect(runtime.frame.rows.some((row) => row.includes("Input dropped"))).toBe(true);
  });

  it("uses the same bound activation for keyboard and mouse while preserving selection gesture", async () => {
    const activations: unknown[] = [];
    const runtime = new FabricConsoleRuntime({
      controller: new FakeController(),
      viewport: { columns: 80, rows: 24 },
      ui: createFabricUiState({
        focusId: "action:resume",
        mouseCapture: true,
      }),
      draw: () => {},
      detach: async () => {},
      activate: async (activation) => {
        activations.push(activation);
      },
      eventId: (() => {
        let value = 0;
        return () => `event-${String(++value)}`;
      })(),
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });

    await runtime.handleInput({ kind: "key", key: "enter" });
    const action = runtime.frame.hitRegions.find(({ id }) => id === "action:resume");
    expect(action).toBeDefined();
    if (action === undefined) return;
    await runtime.handleInput({
      kind: "mouse",
      phase: "press",
      button: "left",
      x: action.rect.x1,
      y: action.rect.y1,
      modifiers: { shift: false, alt: false, ctrl: false },
    });
    await runtime.handleInput({
      kind: "mouse",
      phase: "release",
      button: "left",
      x: action.rect.x1,
      y: action.rect.y1,
      modifiers: { shift: false, alt: false, ctrl: false },
    });
    await runtime.handleInput({
      kind: "mouse",
      phase: "press",
      button: "left",
      x: action.rect.x1,
      y: action.rect.y1,
      modifiers: { shift: true, alt: false, ctrl: false },
    });

    expect(activations).toHaveLength(2);
    expect(activations).toEqual([
      expect.objectContaining({ regionId: "action:resume", provenance: "keyboard" }),
      expect.objectContaining({ regionId: "action:resume", provenance: "mouse" }),
    ]);
    expect(activations[0]).toMatchObject({ binding: action.binding });
    expect(activations[1]).toMatchObject({ binding: action.binding });
  });

  it("uses the same exact row binding for keyboard and mouse reads", async () => {
    const activations: unknown[] = [];
    const runtime = new FabricConsoleRuntime({
      controller: new FakeController(),
      viewport: { columns: 80, rows: 24 },
      ui: createFabricUiState({
        focusId: "row:attention:attention:1",
        mouseCapture: true,
      }),
      draw: () => {},
      detach: async () => {},
      activate: async (activation) => {
        activations.push(activation);
      },
      eventId: (() => {
        let value = 0;
        return () => `event-row-${String(++value)}`;
      })(),
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });

    const row = runtime.frame.hitRegions.find(
      ({ id }) => id === "row:attention:attention:1",
    );
    expect(row).toBeDefined();
    if (row === undefined) return;
    await runtime.handleInput({ kind: "key", key: "enter" });
    await runtime.handleInput({
      kind: "mouse",
      phase: "press",
      button: "left",
      x: row.rect.x1,
      y: row.rect.y1,
      modifiers: { shift: false, alt: false, ctrl: false },
    });
    await runtime.handleInput({
      kind: "mouse",
      phase: "release",
      button: "left",
      x: row.rect.x1,
      y: row.rect.y1,
      modifiers: { shift: false, alt: false, ctrl: false },
    });

    expect(activations).toEqual([
      expect.objectContaining({
        regionId: row.id,
        binding: row.binding,
        provenance: "keyboard",
      }),
      expect.objectContaining({
        regionId: row.id,
        binding: row.binding,
        provenance: "mouse",
      }),
    ]);
  });

  it("reflows on every resize without changing drafts, selection, scroll or pending commands", () => {
    const controller = new FakeController();
    const activate = vi.fn(async () => {});
    const detach = vi.fn(async () => {});
    const runtime = new FabricConsoleRuntime({
      controller,
      viewport: { columns: 80, rows: 24 },
      ui: createFabricUiState({
        draft: "keep this draft",
        scrollOffsetByView: { attention: 4 },
        detailScrollOffsetByView: { attention: 7 },
        focusId: "row:attention:attention:1",
      }),
      draw: () => {},
      detach,
      activate,
      eventId: () => "event-resize",
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });
    const beforeUi = structuredClone(runtime.ui);
    const beforeController = structuredClone(controller.state);
    const modes = [
      runtime.resize({ columns: 140, rows: 36 }).mode,
      runtime.resize({ columns: 80, rows: 24 }).mode,
      runtime.resize({ columns: 60, rows: 18 }).mode,
      runtime.resize({ columns: 30, rows: 6 }).mode,
      runtime.resize({ columns: 5, rows: 2 }).mode,
      runtime.resize({ columns: 80, rows: 24 }).mode,
    ];

    expect(modes).toStrictEqual([
      "wide",
      "reference",
      "compact",
      "strip",
      "inert",
      "reference",
    ]);
    expect(runtime.ui).toStrictEqual(beforeUi);
    expect(controller.state).toStrictEqual(beforeController);
    expect(activate).not.toHaveBeenCalled();
    expect(detach).not.toHaveBeenCalled();
  });

  it("uses local keyboard and mouse paths for split resizing without commands", async () => {
    const activate = vi.fn(async () => {});
    const runtime = new FabricConsoleRuntime({
      controller: new FakeController(),
      viewport: { columns: 140, rows: 36 },
      ui: createFabricUiState({
        focusId: "splitter:master-detail",
        mouseCapture: true,
        splitterRatio: 0.45,
        draft: "split-safe",
      }),
      draw: () => {},
      detach: async () => {},
      activate,
      eventId: () => "event-split",
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });

    await runtime.handleInput({ kind: "key", key: "right" });
    const keyboardRatio = runtime.ui.splitterRatio;
    const splitter = runtime.frame.hitRegions.find(
      ({ id }) => id === "splitter:master-detail",
    );
    expect(splitter).toBeDefined();
    if (splitter === undefined) return;
    await runtime.handleInput({
      kind: "mouse",
      phase: "press",
      button: "left",
      x: splitter.rect.x1,
      y: splitter.rect.y1,
      modifiers: { shift: false, alt: false, ctrl: false },
    });
    await runtime.handleInput({
      kind: "mouse",
      phase: "drag",
      button: "left",
      x: splitter.rect.x1 + 12,
      y: splitter.rect.y1,
      modifiers: { shift: false, alt: false, ctrl: false },
    });

    expect(keyboardRatio).toBeCloseTo(0.5);
    expect(runtime.ui.splitterRatio).toBeGreaterThan(keyboardRatio);
    expect(runtime.ui.draft).toBe("split-safe");
    expect(activate).not.toHaveBeenCalled();
  });

  it("keeps compact master and detail reachable without hiding state", async () => {
    const runtime = new FabricConsoleRuntime({
      controller: new FakeController(),
      viewport: { columns: 60, rows: 18 },
      ui: createFabricUiState({ compactPane: "master", draft: "compact-safe" }),
      draw: () => {},
      detach: async () => {},
      activate: async () => {},
      eventId: () => "event-compact",
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });

    await runtime.handleInput({ kind: "key", key: "right" });
    expect(runtime.ui.compactPane).toBe("detail");
    expect(runtime.frame.rows.join("\n")).toContain("ID: attention:1");
    await runtime.handleInput({ kind: "key", key: "left" });
    expect(runtime.ui.compactPane).toBe("master");
    expect(runtime.frame.rows.join("\n")).toContain("Resume blocked task");
    expect(runtime.ui.draft).toBe("compact-safe");
  });

  it("keeps a bounded independently scrollable message detail window", async () => {
    const controller = new FakeController();
    const messageRow: ConsoleRow<"activity"> = {
      view: "activity",
      stableId: "event-message",
      revision: revisionFromProtocol(4),
      urgency: "normal",
      freshness: {
        state: "live",
        source: "fabric",
        revision: revisionFromProtocol(4),
        observedAt: timestamp,
        ageMs: 0,
      },
      summary: {
        kind: "activity",
        activityKind: "message",
        summary: "Long message",
        occurredAt: timestamp,
        messageBodyRef: {
          projectSessionId: "session-1" as never,
          messageId: "message-1" as never,
          expectedRevision: 4,
        },
      },
      detailRef: { kind: "activity", eventId: "event-message", expectedRevision: 4 },
      actionAvailability: { state: "read-only", reason: "state-ineligible" },
    };
    controller.dataset = {
      ...controller.dataset,
      pages: {
        ...controller.dataset.pages,
        activity: {
          view: "activity",
          rows: [messageRow],
          nextCursor: 1,
          hasMore: false,
          snapshotRevision: revisionFromProtocol(11),
          readTransactionId: "activity-read",
        },
      },
      inspection: {
        kind: "message",
        state: "current",
        binding: {
          view: "activity",
          itemId: "event-message",
          itemRevision: revisionFromProtocol(4),
          projectionRevision: revisionFromProtocol(11),
        },
        result: {
          available: true,
          messageId: "message-1" as never,
          revision: 4,
          body: Array.from({ length: 30 }, (_, index) => `line-${String(index).padStart(2, "0")}`).join("\n"),
          terminalNeutralised: true,
          capabilityValuesRedacted: true,
          artifactRefs: [],
        },
      },
    };
    controller.state = {
      ...controller.state,
      activeView: "activity",
      selectionByView: {
        ...controller.state.selectionByView,
        activity: { stableId: "event-message", revision: revisionFromProtocol(4) },
      },
    };
    const runtime = new FabricConsoleRuntime({
      controller,
      viewport: { columns: 60, rows: 18 },
      ui: createFabricUiState({ compactPane: "detail", mouseCapture: true }),
      draw: () => {},
      detach: async () => {},
      activate: async () => {},
      eventId: () => "event-scroll",
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });

    expect(runtime.frame.rows.join("\n")).toContain("line-00");
    expect(runtime.frame.rows.join("\n")).not.toContain("line-13");
    await runtime.handleInput({ kind: "key", key: "page-down" });

    expect(runtime.ui.detailScrollOffsetByView.activity).toBe(5);
    expect(runtime.frame.rows.join("\n")).toContain("line-13");
    expect(runtime.ui.scrollOffsetByView.activity).toBeUndefined();

    const detail = runtime.frame.hitRegions.find(
      ({ id }) => id === "detail:activity:event-message",
    );
    expect(detail).toBeDefined();
    if (detail === undefined) return;
    await runtime.handleInput({
      kind: "mouse",
      phase: "wheel",
      button: "wheel-down",
      x: detail.rect.x1,
      y: detail.rect.y1,
      modifiers: { shift: false, alt: false, ctrl: false },
    });

    expect(runtime.ui.detailScrollOffsetByView.activity).toBe(10);
    expect(runtime.frame.rows.join("\n")).toContain("line-18");
    expect(runtime.ui.scrollOffsetByView.activity).toBeUndefined();

    for (let index = 0; index < 10; index += 1) {
      await runtime.handleInput({ kind: "key", key: "page-down" });
    }
    expect(runtime.ui.detailScrollOffsetByView.activity).toBe(29);
    expect(runtime.frame.rows.join("\n")).toContain("line-29");
  });

  it("renders bounded artifact content as inert text in the Evidence detail pane", async () => {
    const rendered = "# Actual reviewed spec\n\u001b[31mred must stay inert\nafop_hidden-token";
    const renderedDigest = `sha256:${createHash("sha256").update(rendered).digest("hex")}` as Sha256Digest;
    const controller = new FakeController();
    const row: ConsoleRow<"evidence"> = {
      view: "evidence",
      stableId: "artifact-spec",
      revision: revisionFromProtocol(7),
      urgency: "normal",
      freshness: {
        state: "live",
        source: "fabric",
        revision: revisionFromProtocol(7),
        observedAt: timestamp,
        ageMs: 0,
      },
      summary: {
        kind: "evidence",
        evidenceKind: "artifact",
        status: "informational",
        provenance: "fabric:chair",
      },
      detailRef: {
        kind: "evidence",
        evidenceId: "artifact-spec" as never,
        expectedRevision: 7,
      },
      actionAvailability: {
        state: "available",
        actions: ["promotion"],
        requiresPreview: true,
      },
    };
    controller.dataset = {
      ...controller.dataset,
      pages: {
        ...controller.dataset.pages,
        evidence: {
          view: "evidence",
          rows: [row],
          nextCursor: 1,
          hasMore: false,
          snapshotRevision: revisionFromProtocol(11),
          readTransactionId: "evidence-read",
        },
      },
      inspection: {
        kind: "artifact",
        state: "current",
        binding: {
          view: "evidence",
          itemId: "artifact-spec",
          itemRevision: revisionFromProtocol(7),
          projectionRevision: revisionFromProtocol(11),
        },
        readTransactionId: "artifact-read",
        result: {
          artifactRef: { path: "docs/spec.md" as never, digest },
          evidenceRevision: 7,
          evidenceKind: "artifact",
          sourceKind: "project-file",
          publisherKind: "agent",
          publisherRef: "chair-1",
          projectSessionId: null,
          coordinationRunId: null,
          taskId: null,
          createdAt: timestamp,
          mediaType: "text/markdown",
          content: rendered,
          totalBytes: 100,
          totalLines: 3,
          renderedTotalBytes: Buffer.byteLength(rendered),
          renderedTotalLines: 3,
          renderedArtifactDigest: renderedDigest,
          transformation: "combined",
          terminalNeutralised: true,
          capabilityValuesRedacted: true,
          credentialValuesRedacted: true,
          pages: [{
            pageIndex: 0,
            lineFragment: "whole",
            pageContentDigest: renderedDigest,
            bytes: Buffer.byteLength(rendered),
          }],
          coverage: {
            complete: true,
            verified: true,
            pageCount: 1,
          },
          reviewDisposition: "blocked-redacted",
        },
      },
    };
    controller.state = {
      ...controller.state,
      activeView: "evidence",
      selectionByView: {
        ...controller.state.selectionByView,
        evidence: { stableId: "artifact-spec", revision: revisionFromProtocol(7) },
      },
    };

    const runtime = new FabricConsoleRuntime({
      controller,
      viewport: { columns: 80, rows: 24 },
      ui: createFabricUiState({
        compactPane: "detail",
        focusId: "detail:evidence:artifact-spec",
      }),
      draw: () => {},
      detach: async () => {},
      activate: async () => {},
      eventId: () => "event-artifact",
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });
    const frame = runtime.frame.rows.join("\n");

    expect(frame).toContain("Evidence: artifact r7");
    expect(frame).toContain("Publisher: agent:chair-1");
    expect(frame).toContain("Coverage: 1/1 VERIFIED");
    expect(runtime.frame.hitRegions.find(({ id }) => id === "action:promotion")?.enabled).toBe(false);
    await runtime.handleInput({ kind: "key", key: "page-down" });
    expect(runtime.frame.rows.join("\n")).toContain("Review: BLOCKED | hidden source bytes");
    await runtime.handleInput({ kind: "key", key: "page-down" });
    const contentFrame = runtime.frame.rows.join("\n");
    expect(contentFrame).toContain("# Actual reviewed spec");
    expect(contentFrame).toContain("<ESC>[31mred must stay inert");
    expect(contentFrame).toContain("[REDACTED capability]");
    expect(contentFrame).not.toContain("afop_hidden-token");
    expect(contentFrame).not.toContain("\u001b");

    runtime.resize({ columns: 44, rows: 15 });
    expect(runtime.frame.mode).toBe("compact");
    expect(controller.dataset.inspection).toBeDefined();
    runtime.resize({ columns: 120, rows: 32 });
    expect(runtime.frame.mode).toBe("wide");
    await runtime.handleInput({ kind: "key", key: "page-up" });
    await runtime.handleInput({ kind: "key", key: "page-up" });
    expect(runtime.frame.rows.join("\n")).toContain("Coverage: 1/1 VERIFIED");
    expect(controller.state.selectionByView.evidence?.stableId).toBe("artifact-spec");
  });

  it("detaches exactly once, never stops work, and ignores late input", async () => {
    const detach = vi.fn(async () => {});
    const activate = vi.fn(async () => {});
    const runtime = new FabricConsoleRuntime({
      controller: new FakeController(),
      viewport: { columns: 80, rows: 24 },
      draw: () => {},
      detach,
      activate,
      eventId: () => "event-late",
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });

    await Promise.all([runtime.close("operator"), runtime.close("operator")]);
    await runtime.handleInput({ kind: "key", key: "text", text: "q" });
    await runtime.handleInput({ kind: "key", key: "enter" });

    expect(detach).toHaveBeenCalledTimes(1);
    expect(detach).toHaveBeenCalledWith({ reason: "operator" });
    expect(activate).not.toHaveBeenCalled();
    expect(runtime.closed).toBe(true);
  });

  it("shows only a bounded failure code when an action callback rejects", async () => {
    const runtime = new FabricConsoleRuntime({
      controller: new FakeController(),
      viewport: { columns: 80, rows: 24 },
      ui: createFabricUiState({ focusId: "action:resume" }),
      draw: () => {},
      detach: async () => {},
      activate: async () =>
        Promise.reject(
          Object.assign(new Error("token-never-render"), {
            code: "WRONG_PROJECT",
          }),
        ),
      eventId: () => "event-failure",
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });

    await runtime.handleInput({ kind: "key", key: "enter" });

    expect(runtime.ui.notice).toBe("Action failed: WRONG_PROJECT");
    expect(runtime.frame.rows.join("\n")).toContain(
      "Action failed: WRONG_PROJECT",
    );
    expect(runtime.frame.rows.join("\n")).not.toContain("token-never-render");
  });

  it("fatal decoder quarantine takes the same idempotent safety detach path", async () => {
    const detach = vi.fn(async () => {});
    const runtime = new FabricConsoleRuntime({
      controller: new FakeController(),
      viewport: { columns: 80, rows: 24 },
      draw: () => {},
      detach,
      activate: async () => {},
      eventId: () => "event-fatal",
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });

    await runtime.handleInput({ kind: "fatal", reason: "input-quarantine-lost" });
    await runtime.handleInput({ kind: "fatal", reason: "input-quarantine-lost" });

    expect(detach).toHaveBeenCalledTimes(1);
    expect(detach).toHaveBeenCalledWith({ reason: "safety" });
  });
});

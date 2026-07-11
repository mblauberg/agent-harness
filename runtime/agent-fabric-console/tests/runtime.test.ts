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
    connection: { state: "live" },
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
  it("routes all eight views and paging without stealing editor digits", async () => {
    const controller = new FakeController();
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

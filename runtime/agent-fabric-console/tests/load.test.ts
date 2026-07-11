import { performance } from "node:perf_hooks";

import { describe, expect, it, vi } from "vitest";

import type {
  OperatorCapabilityCredential,
  OperatorProjectionSnapshot,
  OperatorViewPageResult,
  ProjectId,
  Sha256Digest,
  Timestamp,
} from "@local/agent-fabric-protocol";
import type { ConsoleControllerState } from "../src/controller.js";
import {
  MAX_FRAME_CELLS,
  cellWidth,
  renderFabricConsoleFrame,
} from "../src/index.js";
import {
  ConsoleProtocolAdapter,
  type ConsoleProtocolPort,
} from "../src/protocol-adapter.js";
import {
  FABRIC_VIEWS,
  createEmptyViewPages,
  revisionFromProtocol,
  type ConsoleRow,
  type FabricView,
} from "../src/model.js";
import { createFabricUiState } from "../src/presenter.js";
import { TerminalInputDecoder } from "../src/input.js";

const timestamp = "2026-07-11T12:00:00.000Z" as Timestamp;
const digest = (`sha256:${"e".repeat(64)}`) as Sha256Digest;

function largeFixture(count: number) {
  const rows: ConsoleRow<"attention">[] = Array.from(
    { length: count },
    (_, index) => ({
      view: "attention",
      stableId: `attention:${String(index).padStart(6, "0")}`,
      revision: revisionFromProtocol(index + 1),
      urgency: index % 17 === 0 ? "critical-path" : "advisory",
      freshness: {
        state: "live",
        source: "fabric",
        revision: revisionFromProtocol(index + 1),
        observedAt: timestamp,
        ageMs: index * 10,
      },
      summary: {
        kind: "attention",
        label: index % 17 === 0 ? "Blocked" : "FYI",
        priority: index % 17 === 0 ? "critical-path" : "advisory",
        title: `Bounded load item ${String(index)}`,
      },
      detailRef: {
        kind: "system",
        componentId: `component-${String(index)}`,
        expectedRevision: index + 1,
      },
      actionAvailability: {
        state: "read-only",
        reason: "state-ineligible",
      },
    }),
  );
  const empty = createEmptyViewPages();
  const dataset = {
    connection: { state: "live" as const },
    snapshot: {
      schemaVersion: 1 as const,
      snapshotRevision: 11,
      readTransactionId: "load",
      project: {
        freshness: "live" as const,
        source: "fabric" as const,
        revision: 11,
        observedAt: timestamp,
        value: {
          projectId: "project-load" as ProjectId,
          canonicalRoot: "/load",
        },
      },
      session: {
        freshness: "unavailable" as const,
        source: "fabric" as const,
        revision: 11,
        observedAt: timestamp,
        reason: "not selected",
      },
      runs: {
        freshness: "live" as const,
        source: "fabric" as const,
        revision: 11,
        observedAt: timestamp,
        value: [],
      },
      attention: {
        freshness: "live" as const,
        source: "fabric" as const,
        revision: 11,
        observedAt: timestamp,
        value: [],
      },
      capacity: {
        freshness: "unavailable" as const,
        source: "fabric" as const,
        revision: 11,
        observedAt: timestamp,
        reason: "unknown",
      },
      cursor: 11,
      stateDigest: digest,
    },
    snapshotRevision: revisionFromProtocol(11),
    cursor: 11,
    pages: {
      ...empty,
      attention: {
        view: "attention" as const,
        rows,
        nextCursor: count,
        hasMore: false,
        snapshotRevision: revisionFromProtocol(11),
        readTransactionId: "load-attention",
      },
    },
    loadedAtMs: 0,
    canMutate: false,
  };
  const selections = Object.fromEntries(
    FABRIC_VIEWS.map((view) => [view, null]),
  ) as Record<FabricView, null | { stableId: string; revision: ReturnType<typeof revisionFromProtocol> }>;
  if (rows[0] !== undefined) {
    selections.attention = {
      stableId: rows[0].stableId,
      revision: rows[0].revision,
    };
  }
  const controller: ConsoleControllerState = {
    activeView: "attention",
    selectionByView: selections,
    scrollAnchorByView: Object.fromEntries(
      FABRIC_VIEWS.map((view) => [view, null]),
    ) as never,
    review: null,
    pendingCommandIds: [],
    lastActionStatus: null,
    lastReceipt: null,
  };
  return { dataset, controller };
}

describe("Console bounded load gates", () => {
  it("renders 10,000 projected rows through repeated dynamic resize within the cell bound", () => {
    const { dataset, controller } = largeFixture(10_000);
    const ui = createFabricUiState({
      focusId: "row:attention:attention:000000",
      scrollOffsetByView: { attention: 9_950 },
      draft: "load-preserved",
    });
    const before = structuredClone(ui);
    const started = performance.now();
    const sizes = [
      [80, 24],
      [160, 50],
      [60, 18],
      [30, 6],
      [5, 2],
    ] as const;
    let renderedCells = 0;
    for (let index = 0; index < 500; index += 1) {
      const [columns, rows] = sizes[index % sizes.length] ?? [80, 24];
      const frame = renderFabricConsoleFrame(dataset, controller, ui, {
        columns,
        rows,
      });
      renderedCells += frame.columns * frame.rows.length;
      expect(frame.columns * frame.rows.length).toBeLessThanOrEqual(
        MAX_FRAME_CELLS,
      );
      expect(frame.rows.every((row) => cellWidth(row) === frame.columns)).toBe(
        true,
      );
    }
    const durationMs = performance.now() - started;

    expect(renderedCells).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(5_000);
    expect(ui).toStrictEqual(before);
  }, 10_000);

  it("rejects frames beyond the shared cell budget without allocation", () => {
    const { dataset, controller } = largeFixture(1);
    const frame = renderFabricConsoleFrame(
      dataset,
      controller,
      createFabricUiState(),
      { columns: MAX_FRAME_CELLS, rows: MAX_FRAME_CELLS },
    );
    expect(frame).toMatchObject({ columns: 0, rows: [], mode: "inert" });
  });

  it("bounds hostile decoder traffic and never grows pending state", () => {
    const decoder = new TerminalInputDecoder({
      maxPendingBytes: 32,
      maxPasteBytes: 64,
      maxChunkBytes: 128,
    });
    let rejected = 0;
    for (let index = 0; index < 10_000; index += 1) {
      const events = decoder.push(Buffer.from("\u001b[<999;99999;99999M"));
      rejected += events.filter((event) => event.kind === "rejected").length;
    }
    expect(rejected).toBe(10_000);
    expect(decoder.end()).toStrictEqual([]);
  });

  it("fails closed when a protocol page cursor is endless", async () => {
    const credential = {
      capabilityId: "capability-load",
      token: "token",
    } as OperatorCapabilityCredential;
    const projectId = "project-load" as ProjectId;
    const snapshot: OperatorProjectionSnapshot = largeFixture(0).dataset
      .snapshot as OperatorProjectionSnapshot;
    const viewPage = vi.fn(async (request) => ({
      status: "page" as const,
      view: request.view,
      rows: [],
      nextCursor: request.cursor + 1,
      hasMore: true,
      snapshotRevision: request.snapshotRevision,
      readTransactionId: "endless",
    }) as OperatorViewPageResult);
    const port: ConsoleProtocolPort = {
      snapshot: async () => snapshot,
      events: async () => ({
        status: "continuation",
        events: [],
        nextCursor: 11,
        hasMore: false,
        snapshotRevision: 11,
        readTransactionId: "events",
      }),
      viewPage,
      readDetail: async () => ({
        status: "resnapshot-required",
        reason: "snapshot-mismatch",
        currentSnapshotRevision: 11,
      }),
      readGate: async () => {
        throw new Error("unused");
      },
      readMessageBody: null,
      readRepository: null,
      readArtifactContent: null,
    };
    const adapter = new ConsoleProtocolAdapter({
      binding: { ok: true, port, readOnly: true, actions: null },
      credential,
      projectId,
      maxPagesPerView: 3,
      maxResnapshotAttempts: 1,
    });

    const result = await adapter.open();

    expect(result).toMatchObject({
      connection: { state: "unavailable", reason: "projection-invalid" },
      canMutate: false,
    });
    expect(viewPage).toHaveBeenCalledTimes(3);
  });
});

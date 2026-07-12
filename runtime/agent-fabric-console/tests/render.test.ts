import { describe, expect, it } from "vitest";
import * as Console from "../src/index.js";

import {
  cellWidth,
  createConsoleState,
  renderConsoleFrame,
  type ConsoleProjection,
} from "../src/index.js";

const projection: ConsoleProjection = {
  project: ".agents",
  session: "project-01",
  run: "AFAB-004",
  revision: 42n,
  freshness: "LIVE",
  age: "2s",
  phase: "implement",
  owner: "codex-chair",
  health: "BLOCKED",
  attentionCount: 3,
  runCount: 2,
  currentMilestone: "Console RED 3/8",
  nextMilestone: "Console GREEN",
  declaredCount: "T:3/8",
};

describe("responsive semantic cell grid", () => {
  it("renders the reference frame as exactly 80 cells by 24 rows", () => {
    const frame = renderConsoleFrame(
      projection,
      createConsoleState(),
      { columns: 80, rows: 24 },
    );

    expect(frame.columns).toBe(80);
    expect(frame.rows).toHaveLength(24);
    expect(frame.rows.every((row) => cellWidth(row) === 80)).toBe(true);
    expect(frame.rows[0]).toContain("P: .agents");
    expect(frame.rows[3]).toContain("Attention");
    expect(frame.rows.at(-1)).toContain("q detach");
  });

  it("renders exact current dimensions and recomputes regions without clearing operator state", () => {
    const state = createConsoleState({
      selectedId: "attention-7",
      focus: "input",
      draft: "request safer wording",
      pendingCommandId: "command-9",
      scrollByView: { Attention: 7 },
    });
    const before = structuredClone(state);
    const viewports = [
      { columns: 80, rows: 24, mode: "full" },
      { columns: 100, rows: 30, mode: "full" },
      { columns: 120, rows: 40, mode: "full" },
      { columns: 79, rows: 23, mode: "compact" },
      { columns: 40, rows: 8, mode: "compact" },
      { columns: 1, rows: 1, mode: "inert" },
      { columns: 0, rows: 0, mode: "inert" },
    ] as const;

    const frames = viewports.map(({ columns, rows, mode }) => {
      const frame = renderConsoleFrame(projection, state, { columns, rows });
      expect(frame.columns).toBe(columns);
      expect(frame.rows).toHaveLength(rows);
      expect(frame.rows.every((row) => cellWidth(row) === columns)).toBe(true);
      expect(frame.mode).toBe(mode);
      expect(
        frame.hitRegions.every(
          ({ rect }) =>
            rect.x1 >= 1 &&
            rect.y1 >= 1 &&
            rect.x2 <= columns &&
            rect.y2 <= rows,
        ),
      ).toBe(true);
      return frame;
    });

    const referenceAccept = frames[0]?.hitRegions.find(({ id }) => id === "action:accept");
    const wideAccept = frames[2]?.hitRegions.find(({ id }) => id === "action:accept");
    expect(referenceAccept?.rect).not.toStrictEqual(wideAccept?.rect);
    expect(frames[4]?.rows.at(-1)).toContain("q detach");
    expect(frames[5]?.hitRegions).toStrictEqual([]);
    expect(state).toStrictEqual(before);
  });

  it("keeps absent and hostile viewport dimensions bounded and inert", () => {
    const hostileViewports = [
      {},
      { columns: Number.NaN, rows: 24 },
      { columns: 80, rows: Number.POSITIVE_INFINITY },
      { columns: 1_000_000, rows: 1_000_000 },
    ];

    for (const viewport of hostileViewports) {
      const frame = renderConsoleFrame(
        projection,
        createConsoleState({ pendingCommandId: "must-remain-pending" }),
        viewport,
      );
      expect(frame).toMatchObject({
        columns: 0,
        rows: [],
        mode: "inert",
        hitRegions: [],
      });
    }
  });

  it("never exposes overlapping or invisible compact hit regions", () => {
    for (const viewport of [
      { columns: 20, rows: 6 },
      { columns: 64, rows: 6 },
    ]) {
      const frame = renderConsoleFrame(
        projection,
        createConsoleState(),
        viewport,
      );
      expect(frame.mode).toBe("inert");
      expect(frame.hitRegions).toStrictEqual([]);
    }

    const compact = renderConsoleFrame(
      projection,
      createConsoleState(),
      { columns: 40, rows: 8 },
    );
    for (const region of compact.hitRegions) {
      const row = compact.rows[region.rect.y1 - 1] ?? "";
      const visible = row.slice(region.rect.x1 - 1, region.rect.x2);
      expect(visible.trim()).not.toBe("");
      expect(visible).not.toContain("~");
      if (region.id === "detach") {
        expect(visible).toContain("q detach");
      }
    }
    for (const [index, region] of compact.hitRegions.entries()) {
      for (const other of compact.hitRegions.slice(index + 1)) {
        const overlap =
          region.rect.x1 <= other.rect.x2 &&
          other.rect.x1 <= region.rect.x2 &&
          region.rect.y1 <= other.rect.y2 &&
          other.rect.y1 <= region.rect.y2;
        expect(overlap).toBe(false);
      }
    }
  });

  it("allocates every mandatory 80x24 header field before clipping values", () => {
    const frame = renderConsoleFrame(
      {
        ...projection,
        project: "project-".repeat(20),
        session: "session-".repeat(20),
        run: "run-".repeat(20),
        revision: 18_446_744_073_709_551_615n,
        age: "2s",
        phase: "phase-".repeat(20),
        owner: "owner-".repeat(20),
        currentMilestone: "current-".repeat(20),
        nextMilestone: "next-".repeat(20),
      },
      createConsoleState(),
      { columns: 80, rows: 24 },
    );
    const [identity = "", lifecycle = "", milestones = ""] = frame.rows;

    expect(identity.slice(0, 18)).toMatch(/^P:/);
    expect(identity.slice(19, 35)).toMatch(/^S:/);
    expect(identity.slice(36, 50)).toMatch(/^R:/);
    expect(identity.slice(51, 72)).toBe("r18446744073709551615");
    expect(identity.slice(73, 80)).toBe("LIVE 2s");
    expect(lifecycle.slice(0, 20)).toMatch(/^Phase:/);
    expect(lifecycle.slice(21, 41)).toMatch(/^Owner:/);
    expect(lifecycle.slice(42, 58)).toMatch(/^Health:/);
    expect(lifecycle.slice(59, 69)).toMatch(/^Attn:/);
    expect(lifecycle.slice(70, 80)).toMatch(/^Runs:/);
    expect(milestones.slice(0, 36)).toMatch(/^Now:/);
    expect(milestones.slice(37, 71)).toMatch(/^Next:/);
    expect(milestones.slice(72, 80)).toBe("T:3/8   ");
  });

  it("handles live resize frames without changing operator state or emitting intents", () => {
    const state = createConsoleState({
      selectedId: "attention-stable",
      focus: "input",
      draft: "keep this draft",
      pendingCommandId: "pending-stable",
      scrollByView: { Attention: 9 },
      focusedRegionId: null,
    });
    const before = structuredClone(state);
    const dimensions = [
      [80, 24],
      [100, 30],
      [40, 8],
      [1, 1],
      [120, 40],
      [1, 1],
      [40, 8],
      [100, 30],
      [80, 24],
    ] as const;
    let priorActionRect: Console.Rect | undefined;

    for (const [columns, rows] of dimensions) {
      const resized = Console.resizeConsoleSurface(
        projection,
        state,
        { columns, rows },
      );
      expect(resized.state).toStrictEqual(before);
      expect(resized.intents).toStrictEqual([]);
      expect(resized.frame).toMatchObject({ columns, mode: expect.any(String) });
      const actionRect = resized.frame.hitRegions.find(
        ({ id }) => id === "action:accept",
      )?.rect;
      if (actionRect !== undefined && priorActionRect !== undefined) {
        expect(actionRect).not.toStrictEqual(priorActionRect);
      }
      priorActionRect = actionRect;
    }
  });
});

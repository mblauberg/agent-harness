import { describe, expect, it } from "vitest";

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
});

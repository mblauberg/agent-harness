import { describe, expect, it } from "vitest";

import {
  createConsoleState,
  reduceConsoleInput,
  renderConsoleFrame,
  type ConsoleFrame,
  type ConsoleProjection,
  type ConsoleState,
  type ConsoleView,
  type KeyInputEvent,
} from "../src/index.js";

const projection: ConsoleProjection = {
  project: ".agents",
  session: "session",
  run: "run",
  revision: 1n,
  freshness: "LIVE",
  age: "now",
  phase: "implement",
  owner: "chair",
  health: "HEALTHY",
  attentionCount: 1,
  runCount: 1,
  currentMilestone: "focus markers",
  nextMilestone: "review",
  declaredCount: "T:1/2",
};

function frameFor(
  state: ConsoleState,
  columns = 80,
  rows = 24,
): ConsoleFrame {
  return renderConsoleFrame(projection, state, { columns, rows });
}

function press(
  state: ConsoleState,
  key: KeyInputEvent,
): ConsoleState {
  return reduceConsoleInput(state, key, frameFor(state)).state;
}

function expectExactMarkers(state: ConsoleState, frame: ConsoleFrame): void {
  const status = frame.rows.at(-2) ?? "";
  expect(status).toContain(`V:${state.activeView}`);
  const regionId = state.focusedRegionId;
  if (regionId === null) {
    expect(status).toContain(`F:${state.focus}`);
  } else {
    const region = frame.hitRegions.find(
      ({ enabled, id }) => enabled && id === regionId,
    );
    if (region === undefined) {
      expect(status).toContain(`F:!${regionId}`);
    } else {
      const row = frame.rows[region.rect.y1 - 1] ?? "";
      expect(row.slice(region.rect.x1 - 1, region.rect.x2)).toContain(">");
      expect(status).toContain(`F:${regionId}`);
    }
  }

  const active = frame.hitRegions.find(
    ({ id }) => id === `tab:${state.activeView}`,
  );
  if (active !== undefined && active.rect.x2 < frame.columns) {
    const row = frame.rows[active.rect.y1 - 1] ?? "";
    expect(row[active.rect.x2]).toBe("*");
  }
}

describe("non-colour exact focus rendering", () => {
  it("renders unequal 80x24 frames for exact action targets without moving geometry", () => {
    const accept = createConsoleState({
      focus: "actions",
      focusedRegionId: "action:accept",
      activeView: "Attention",
    });
    const defer = createConsoleState({
      focus: "actions",
      focusedRegionId: "action:defer",
      activeView: "Attention",
    });
    const acceptFrame = frameFor(accept);
    const deferFrame = frameFor(defer);

    expect(acceptFrame.rows).not.toStrictEqual(deferFrame.rows);
    expect(acceptFrame.hitRegions).toStrictEqual(deferFrame.hitRegions);
    expectExactMarkers(accept, acceptFrame);
    expectExactMarkers(defer, deferFrame);
    expect(acceptFrame.rows[21]).toContain(">[Accept]");
    expect(deferFrame.rows[21]).toContain(">[Defer]");
  });

  it("marks every keyboard view, action, splitter, detach, and Escape transition", () => {
    const views: readonly ConsoleView[] = [
      "Attention",
      "Project",
      "Runs",
      "Work",
      "Agents",
      "Evidence",
      "Activity",
      "System",
    ];
    const altKeys: readonly KeyInputEvent[] = [
      { kind: "key", key: "alt-1" },
      { kind: "key", key: "alt-2" },
      { kind: "key", key: "alt-3" },
      { kind: "key", key: "alt-4" },
      { kind: "key", key: "alt-5" },
      { kind: "key", key: "alt-6" },
      { kind: "key", key: "alt-7" },
      { kind: "key", key: "alt-8" },
    ];
    let state = createConsoleState();
    expectExactMarkers(state, frameFor(state));
    for (const [index, view] of views.entries()) {
      const altKey = altKeys[index];
      if (altKey === undefined) {
        throw new Error(`missing Alt key fixture for ${view}`);
      }
      state = press(state, altKey);
      expect(state.activeView).toBe(view);
      expectExactMarkers(state, frameFor(state));
    }

    state = press(createConsoleState(), { kind: "key", key: "tab" });
    expect(state.focusedRegionId).toBe("tab:Attention");
    expectExactMarkers(state, frameFor(state));
    state = press(state, { kind: "key", key: "right" });
    expect(state.focusedRegionId).toBe("tab:Project");
    expectExactMarkers(state, frameFor(state));
    state = press(state, { kind: "key", key: "enter" });
    expect(state.activeView).toBe("Project");
    expectExactMarkers(state, frameFor(state));
    state = press(state, { kind: "key", key: "left" });
    expect(state.focusedRegionId).toBe("tab:Attention");
    expectExactMarkers(state, frameFor(state));
    state = press(state, { kind: "key", key: "shift-tab" });
    expect(state.focusedRegionId).toBe("detach");
    expectExactMarkers(state, frameFor(state));

    const actions = [
      ["d", "action:discuss"],
      ["a", "action:accept"],
      ["c", "action:request-changes"],
      ["f", "action:defer"],
      ["i", "action:implement"],
    ] as const;
    for (const [shortcut, regionId] of actions) {
      state = press(createConsoleState(), {
        kind: "key",
        key: "text",
        text: shortcut,
      });
      expect(state.focusedRegionId).toBe(regionId);
      expectExactMarkers(state, frameFor(state));
      const afterSpace = press(state, { kind: "key", key: "space" });
      expectExactMarkers(afterSpace, frameFor(afterSpace));
    }

    state = createConsoleState();
    for (let count = 0; count < 9; count += 1) {
      state = press(state, { kind: "key", key: "tab" });
    }
    expect(state.focusedRegionId).toBe("splitter");
    expectExactMarkers(state, frameFor(state));
    state = press(state, { kind: "key", key: "down" });
    expectExactMarkers(state, frameFor(state));

    state = press(state, { kind: "key", key: "escape" });
    expect(state.focusedRegionId).toBeNull();
    expectExactMarkers(state, frameFor(state));
  });

  it("keeps exact active and hidden-focus markers visible in compact mode", () => {
    const state = createConsoleState({
      activeView: "System",
      focus: "actions",
      focusedRegionId: "action:accept",
      draft: "preserved",
      pendingCommandId: "pending",
    });
    const compact = frameFor(state, 40, 8);

    expectExactMarkers(state, compact);
    expect(compact.rows.at(-2)).toContain("V:System F:!action:accept");
    expect(compact.hitRegions.some(({ id }) => id === "action:accept")).toBe(
      false,
    );
  });
});

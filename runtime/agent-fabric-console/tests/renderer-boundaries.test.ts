import { describe, expect, it } from "vitest";

import { renderFabricDetail } from "../src/renderer-detail.js";
import { renderFabricTabs } from "../src/renderer-main.js";
import { setFabricRow, type FabricHitRegion } from "../src/renderer-primitives.js";
import { wrapFabricReviewContent } from "../src/renderer-review.js";
import {
  createFabricUiState,
  type FabricConsolePresentation,
} from "../src/presenter.js";
import type { FabricConsoleDataset } from "../src/protocol-adapter.js";

describe("renderer component boundaries", () => {
  it("writes fixed-width rows through the renderer primitive seam", () => {
    const rows = ["unchanged", "unchanged"];

    setFabricRow(rows, 1, 6, "status");
    setFabricRow(rows, 3, 6, "outside");

    expect(rows).toStrictEqual(["status", "unchanged"]);
  });

  it("renders tab labels and hit geometry through the main surface seam", () => {
    const rows = [" ".repeat(24)];
    const hitRegions: FabricHitRegion[] = [];
    const presentation = {
      views: [
        { view: "attention", label: "Attention", active: true, key: "1" },
        { view: "project", label: "Project", active: false, key: "2" },
      ],
      focusId: "view:attention",
    } as unknown as FabricConsolePresentation;

    renderFabricTabs(rows, 24, presentation, "geometry", hitRegions, 1);

    expect(rows[0]).toBe(">1:Attn* 2:Proj         ");
    expect(hitRegions).toStrictEqual([
      {
        id: "view:attention",
        kind: "tab",
        rect: { x1: 1, y1: 1, x2: 8, y2: 1 },
        enabled: true,
        geometryKey: "geometry",
        binding: null,
      },
      {
        id: "view:project",
        kind: "tab",
        rect: { x1: 10, y1: 1, x2: 15, y2: 1 },
        enabled: true,
        geometryKey: "geometry",
        binding: null,
      },
    ]);
  });

  it("renders fallback detail lines through the detail surface seam", () => {
    const rows = [" ".repeat(20), " ".repeat(20)];
    const presentation = {
      activeView: "project",
      masterRows: [],
      detail: {
        stableId: "project-1",
        revision: 1,
        lines: [{ label: "Owner", value: "renderer" }],
      },
      focusId: null,
    } as unknown as FabricConsolePresentation;
    const dataset = { inspection: null } as unknown as FabricConsoleDataset;
    const hitRegions: FabricHitRegion[] = [];

    renderFabricDetail(
      rows,
      20,
      presentation,
      dataset,
      createFabricUiState(),
      "geometry",
      hitRegions,
      { x1: 1, y1: 1, x2: 20, y2: 2 },
    );

    expect(rows[0]).toBe(">Owner: renderer    ");
    expect(hitRegions).toStrictEqual([]);
  });

  it("preserves logical review anchors through the review surface seam", () => {
    const wrapped = wrapFabricReviewContent(
      { lines: ["abcdef", "xy"], requiredContextLineCount: 1 },
      3,
    );

    expect(wrapped).toStrictEqual({
      lines: [
        { value: "abc", start: 0, end: 3 },
        { value: "def", start: 3, end: 7 },
        { value: "xy", start: 7, end: 10 },
      ],
      requiredEnd: 7,
    });
  });
});

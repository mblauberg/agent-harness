import { describe, expect, it } from "vitest";

import * as Console from "../src/index.js";

const baseProjection: Console.ConsoleProjection = {
  project: ".agents",
  session: "session",
  run: "run",
  revision: 1n,
  freshness: "LIVE",
  age: "now",
  phase: "implement",
  owner: "chair",
  health: "HEALTHY",
  attentionCount: 0,
  runCount: 1,
  currentMilestone: "text safety",
  nextMilestone: "input",
  declaredCount: "T:1/2",
};

describe("pinned Unicode and terminal-neutral text", () => {
  it("pins grapheme segmentation and cell widths for combining, CJK, and emoji", () => {
    expect(Console.UNICODE_POLICY).toStrictEqual({
      segmentation: "unicode-segmenter@0.17.0",
      width: "string-width@8.2.2",
      ambiguousWidth: "narrow",
    });
    expect(Console.cellWidth("e\u0301")).toBe(1);
    expect(Console.cellWidth("界")).toBe(2);
    expect(Console.cellWidth("👩‍💻")).toBe(2);
    expect([...Console.graphemes("e\u0301界👩‍💻")]).toStrictEqual([
      "e\u0301",
      "界",
      "👩‍💻",
    ]);
    expect(Console.clipCells("e\u0301界👩‍💻Z", 5)).toBe("e\u0301界~ ");
  });

  it("renders controls and bidi formatting visibly without emitting terminal escapes", () => {
    const hostile = "ok\u001b[31m\u0007\u009b\u007f\u202e\u2066\r\n\tend";
    const frame = Console.renderConsoleFrame(
      { ...baseProjection, project: hostile },
      Console.createConsoleState(),
      { columns: 120, rows: 40 },
    );
    const output = frame.rows.join("\n");
    const sanitized = Console.sanitizeDisplayText(hostile, {
      lineBreaks: "visible",
    });

    expect(output).not.toContain("\u001b");
    expect(output).not.toContain("\u009b");
    expect(output).not.toContain("\u202e");
    expect(output).not.toContain("\u2066");
    expect(output).toContain("<ESC>");
    expect(output).toContain("<BEL>");
    expect(sanitized).toContain("<C1-9B>");
    expect(sanitized).toContain("<DEL>");
    expect(sanitized).toContain("<BIDI-U+202E>");
    expect(sanitized).toContain("<BIDI-U+2066>");
    expect(sanitized).toContain("<LF>");
  });
});

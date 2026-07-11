import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type PtyEvidence = Readonly<{
  returncode: number;
  restored: boolean;
  platform: string;
  immediate_mode: "exact" | "darwin-pendin-only" | "invalid";
  queued_input_bytes: number;
  post_settlement_exact: boolean;
  transcript: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const driver = fileURLToPath(new URL("fixtures/pty-driver.py", import.meta.url));
const child = fileURLToPath(
  new URL("fixtures/terminal-child.mjs", import.meta.url),
);

function runPty(scenario: string): PtyEvidence {
  const result = spawnSync("python3", [driver, child, scenario], {
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  const parsed: unknown = JSON.parse(result.stdout);
  expect(parsed).toEqual(
    expect.objectContaining({
      returncode: expect.any(Number),
      restored: expect.any(Boolean),
      transcript: expect.any(String),
    }),
  );
  if (!isRecord(parsed)) {
    throw new Error("invalid PTY evidence");
  }
  const returncode = parsed["returncode"];
  const restored = parsed["restored"];
  const platform = parsed["platform"];
  const immediateMode = parsed["immediate_mode"];
  const queuedInputBytes = parsed["queued_input_bytes"];
  const postSettlementExact = parsed["post_settlement_exact"];
  const transcript = parsed["transcript"];
  if (
    typeof returncode !== "number" ||
    typeof restored !== "boolean" ||
    typeof platform !== "string" ||
    (immediateMode !== "exact" &&
      immediateMode !== "darwin-pendin-only" &&
      immediateMode !== "invalid") ||
    typeof queuedInputBytes !== "number" ||
    typeof postSettlementExact !== "boolean" ||
    typeof transcript !== "string"
  ) {
    throw new Error("invalid PTY evidence fields");
  }
  return {
    returncode,
    restored,
    platform,
    immediate_mode: immediateMode,
    queued_input_bytes: queuedInputBytes,
    post_settlement_exact: postSettlementExact,
    transcript,
  };
}

describe("actual PTY terminal lifecycle", () => {
  it.each([
    ["normal", 0],
    ["error", 1],
    ["sigterm", 143],
    ["mouse-off", 0],
    ["explicit-exit", 23],
    ["mouse-toggle", 0],
  ])("restores termios and exact modes after %s", (scenario, expectedCode) => {
    const evidence = runPty(scenario);
    const transcript = Buffer.from(evidence.transcript, "base64").toString(
      "utf8",
    );

    expect(evidence.returncode).toBe(expectedCode);
    expect(evidence.restored).toBe(true);
    expect(evidence.queued_input_bytes).toBe(0);
    expect(evidence.post_settlement_exact).toBe(true);
    if (evidence.platform === "darwin") {
      expect(["exact", "darwin-pendin-only"]).toContain(
        evidence.immediate_mode,
      );
    } else {
      expect(evidence.immediate_mode).toBe("exact");
    }
    expect(transcript).toContain("\u001b[?2004h");
    if (scenario === "mouse-off") {
      expect(transcript).not.toContain("\u001b[?1002h");
      expect(transcript).not.toContain("\u001b[?1006h");
    } else if (scenario === "mouse-toggle") {
      expect(transcript).toContain("\u001b[?2004h");
    } else {
      expect(transcript).toContain("\u001b[?1002h\u001b[?1006h");
    }
    expect(transcript).toContain("\u001b[?1006l\u001b[?1002l\u001b[?2004l");
    expect(transcript).not.toMatch(/\u001b\[\?(?:1000|1003|1015)h/);
    expect(transcript.indexOf("\u001b[?2004h")).toBeLessThan(
      transcript.indexOf("READY"),
    );
    expect(transcript.indexOf("READY")).toBeLessThan(
      transcript.indexOf("\u001b[?2004l"),
    );
  });

  it("reports authoritative TIOCSWINSZ grow and shrink dimensions", () => {
    const evidence = runPty("resize");
    const transcript = Buffer.from(evidence.transcript, "base64").toString(
      "utf8",
    );
    const dimensions = [...transcript.matchAll(/RESIZE:(\d+)x(\d+)/g)].map(
      (match) => `${match[1]}x${match[2]}`,
    );

    expect(evidence.returncode).toBe(0);
    expect(dimensions).toStrictEqual([
      "80x24",
      "100x30",
      "40x8",
      "1x1",
      "120x40",
      "1x1",
      "40x8",
      "100x30",
      "80x24",
    ]);
    expect(evidence.restored).toBe(true);
    expect(transcript).toContain("\u001b[?1006l\u001b[?1002l\u001b[?2004l");
  });

  it("owns idempotent runtime mouse-mode transitions", () => {
    const evidence = runPty("mouse-toggle");
    const transcript = Buffer.from(evidence.transcript, "base64").toString(
      "utf8",
    );
    const mouseOn = transcript.match(/\u001b\[\?1002h\u001b\[\?1006h/g) ?? [];
    const mouseOff = transcript.match(/\u001b\[\?1006l\u001b\[\?1002l/g) ?? [];

    expect(mouseOn).toHaveLength(1);
    expect(mouseOff).toHaveLength(2);
    expect(evidence.restored).toBe(true);
  });
});

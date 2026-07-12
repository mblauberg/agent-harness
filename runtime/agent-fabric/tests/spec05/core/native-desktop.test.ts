import { describe, expect, it } from "vitest";

import { MacOsNativeDesktopAdapter } from "../../../src/attention/native-desktop.ts";

describe("macOS native desktop adapter", () => {
  it("uses fixed osascript argv with title/body as data and advertises no focus action", async () => {
    const calls: Array<{ file: string; argv: readonly string[]; options: Record<string, unknown> }> = [];
    const adapter = new MacOsNativeDesktopAdapter({
      platform: "darwin",
      access: async () => undefined,
      execute: async (file, argv, options) => {
        calls.push({ file, argv, options });
        return { stdout: "", stderr: "" };
      },
    });

    await expect(adapter.discover()).resolves.toEqual({
      state: "available",
      contract: {
        schemaVersion: 1,
        adapter: "macos-osascript-notification-v1",
        exactAttentionFocus: { supported: false, contractTested: false },
      },
    });
    await expect(adapter.send({
      notificationId: "notification_01",
      itemId: "attention_01",
      itemRevision: 1,
      title: "quoted \" title",
      body: "body; do shell script \"false\"",
    })).resolves.toEqual({ adapter: "macos-osascript-notification-v1", exit: "success" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.file).toBe("/usr/bin/osascript");
    expect(calls[0]?.argv.slice(-3)).toEqual(["--", "quoted \" title", "body; do shell script \"false\""]);
    expect(calls[0]?.argv[0]).toBe("-e");
    expect(calls[0]?.argv[1]).not.toContain("quoted");
    expect(calls[0]?.options).toMatchObject({ timeoutMs: 5_000, maximumOutputBytes: 8_192 });
  });

  it("reports unsupported platforms unavailable without process execution", async () => {
    let executed = false;
    const adapter = new MacOsNativeDesktopAdapter({
      platform: "linux",
      access: async () => undefined,
      execute: async () => {
        executed = true;
        return { stdout: "", stderr: "" };
      },
    });
    await expect(adapter.discover()).resolves.toMatchObject({ state: "unavailable" });
    expect(executed).toBe(false);
  });
});

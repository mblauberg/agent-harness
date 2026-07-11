import { describe, expect, it } from "vitest";

import { renderSafePreview } from "../../src/visibility/safe-preview.ts";

describe("human-safe fabric previews", () => {
  it("keeps ordinary local message content readable", () => {
    expect(renderSafePreview("please review src/core/fabric.ts\nand reply with findings", 160))
      .toBe("please review src/core/fabric.ts ⏎ and reply with findings");
  });

  it("neutralises terminal controls and redacts only fabric bearer prefixes", () => {
    const capability = `afc_${"A".repeat(43)}`;
    const splitCapability = `afc_${"B".repeat(20)}\u200b${"B".repeat(23)}`;
    const hash = "c".repeat(64);
    const rendered = renderSafePreview(`\u001b]2;title\u0007 ${capability} ${splitCapability} ${hash}`, 300);
    expect(rendered).toBe(`]2;title afc_<redacted> afc_<redacted> ${hash}`);
  });

  it("truncates by Unicode character with an explicit marker", () => {
    expect(renderSafePreview("🙂🙂🙂🙂", 3)).toBe("🙂🙂…");
  });
});

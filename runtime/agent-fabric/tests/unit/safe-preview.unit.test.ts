import { describe, expect, it } from "vitest";

import { renderSafePreview } from "../../src/visibility/safe-preview.ts";

describe("human-safe fabric previews", () => {
  it("keeps ordinary local message content readable", () => {
    expect(renderSafePreview("please review src/core/fabric.ts\nand reply with findings", 160))
      .toBe("please review src/core/fabric.ts ⏎ and reply with findings");
  });

  it("neutralises terminal controls and fully redacts shared credential families", () => {
    const capability = `afc_${"A".repeat(43)}`;
    const splitCapability = `afc_${"B".repeat(20)}\u200b${"B".repeat(23)}`;
    const operatorCapability = `afop_${"C".repeat(43)}`;
    const credential = "password=preview-secret-value";
    const hash = "c".repeat(64);
    const rendered = renderSafePreview(
      `\u001b]2;title\u0007 ${capability} ${splitCapability} ${operatorCapability} ${credential} ${hash}`,
      300,
    );
    expect(rendered).not.toMatch(/\b(?:afb_|afc_|afop_)|preview-secret-value/u);
    expect(rendered).toBe(`█ █ █ password=█ ${hash}`);
  });

  it("truncates by Unicode character with an explicit marker", () => {
    expect(renderSafePreview("🙂🙂🙂🙂", 3)).toBe("🙂🙂…");
  });
});

import { readFile, stat } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const forbidden = [
  "legacy-compatibility",
  "strict-v1",
  "STRICT_V1_OPTIONAL_FEATURES",
  "legacy-fallback",
  "console-operators",
] as const;

const currentSources = [
  new URL("../src/application.ts", import.meta.url),
  new URL("../src/evaluation.ts", import.meta.url),
  new URL("../src/model.ts", import.meta.url),
  new URL("../src/presenter.ts", import.meta.url),
  new URL("../src/production-composition.ts", import.meta.url),
  new URL("../src/protocol-adapter.ts", import.meta.url),
  new URL("../../agent-fabric/src/operator/local-console-session.ts", import.meta.url),
] as const;

describe("pre-release Console baseline", () => {
  it("contains no vintage protocol, retry, notification, or credential-cleanup path", async () => {
    for (const source of currentSources) {
      const text = await readFile(source, "utf8");
      for (const token of forbidden) expect(text, `${source.pathname}: ${token}`).not.toContain(token);
    }
  });

  it("does not package vintage daemon fixtures", async () => {
    const fixtures = new URL("../../agent-fabric/tests/spec05/fixtures/vintage-daemons", import.meta.url);
    await expect(stat(fixtures)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { CONSOLE_CLI_USAGE, runConsoleCli } from "../src/cli.js";

describe("standalone Console executable", () => {
  it("ships a non-interactive help path and honestly describes bootstrap state", () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    return runConsoleCli(["--help"]).then(() => {
      expect(write).toHaveBeenCalledWith(CONSOLE_CLI_USAGE);
      expect(CONSOLE_CLI_USAGE).toContain("typed injected bootstrap boundary");
      expect(CONSOLE_CLI_USAGE).toContain("mutations remain disabled");
      write.mockRestore();
    });
  });

  it("maps the package bin to the compiled shebang entrypoint", async () => {
    const packageValue: unknown = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    const source = await readFile(new URL("../src/cli.ts", import.meta.url), "utf8");
    expect(packageValue).toMatchObject({
      bin: { "agent-fabric-console": "dist/cli.js" },
    });
    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });
});

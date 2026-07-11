import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { CONSOLE_CLI_USAGE, runConsoleCli } from "../src/cli.js";

describe("standalone Console executable", () => {
  it("ships a non-interactive help path and honestly describes production bootstrap", () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    return runConsoleCli(["--help"]).then(() => {
      expect(write).toHaveBeenCalledWith(CONSOLE_CLI_USAGE);
      expect(CONSOLE_CLI_USAGE).toContain("lock-safe local Fabric bootstrap");
      expect(CONSOLE_CLI_USAGE).toContain("unavailable state remains read-only");
      write.mockRestore();
    });
  });

  it("maps the package bin to the compiled shebang entrypoint", async () => {
    const packageValue: unknown = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    const fabricPackageValue: unknown = JSON.parse(
      await readFile(new URL("../../agent-fabric/package.json", import.meta.url), "utf8"),
    );
    const source = await readFile(new URL("../src/cli.ts", import.meta.url), "utf8");
    expect(packageValue).toMatchObject({
      bin: { "agent-fabric-console": "dist/cli.js" },
      dependencies: { "@local/agent-fabric": "file:../agent-fabric" },
    });
    expect(fabricPackageValue).toMatchObject({
      exports: {
        ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      },
    });
    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(source).toContain("createProductionConsoleBootstrap()");
    expect(source).not.toContain("unavailableBootstrap");
  });
});

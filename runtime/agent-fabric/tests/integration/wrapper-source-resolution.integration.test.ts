import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const packageDirectory = fileURLToPath(new URL("../../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const tsxLoader = `${repositoryRoot}node_modules/tsx/dist/loader.mjs`;

async function resolveProtocol(withSourceCondition: boolean): Promise<string> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      ...(withSourceCondition ? ["--conditions=source"] : []),
      "--import",
      tsxLoader,
      "--input-type=module",
      "-e",
      "console.log(import.meta.resolve('@local/agent-fabric-protocol'));",
    ],
    { cwd: packageDirectory },
  );
  return stdout.trim();
}

describe("wrapper first-party source execution", () => {
  it("resolves the protocol workspace package to tracked source under --conditions=source", async () => {
    await expect(resolveProtocol(true)).resolves.toMatch(/agent-fabric-protocol\/src\/index\.ts$/u);
  });

  it("keeps resolving the protocol workspace package to its built output without the condition", async () => {
    await expect(resolveProtocol(false)).resolves.toMatch(/agent-fabric-protocol\/dist\/index\.js$/u);
  });
});

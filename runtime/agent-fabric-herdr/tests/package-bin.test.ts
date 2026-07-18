import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

type CommandResult = Readonly<{
  status: number | null;
  stdout: string;
  stderr: string;
}>;

function run(command: string, arguments_: readonly string[]): CommandResult {
  const result = spawnSync(command, arguments_, {
    cwd: workspaceRoot,
    encoding: "utf8",
  });
  if (result.error !== undefined) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("agent-fabric-herdr package bin", () => {
  it("runs the same help entrypoint through npm as through its compiled target", async () => {
    const packageValue = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    ) as { bin: Record<string, string> };
    const target = packageValue.bin["agent-fabric-herdr"];
    if (target === undefined) throw new Error("package bin is not declared");

    const direct = run(process.execPath, [path.join(packageRoot, target), "--help"]);
    const installed = run("npm", [
      "exec",
      "--workspace=@local/agent-fabric-herdr",
      "--",
      "agent-fabric-herdr",
      "--help",
    ]);

    expect(installed).toEqual(direct);
    expect(installed.status).toBe(0);
    expect(installed.stdout).toBe("usage: agent-fabric-herdr doctor --config PATH\n");
    expect(installed.stderr).toBe("");
  });
});

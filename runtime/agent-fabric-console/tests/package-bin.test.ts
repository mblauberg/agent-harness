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

describe("agent-fabric-console package bin", () => {
  async function directTarget(): Promise<string> {
    const packageValue = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    ) as { bin: Record<string, string> };
    const target = packageValue.bin["agent-fabric-console"];
    if (target === undefined) throw new Error("package bin is not declared");
    return path.join(packageRoot, target);
  }

  it("runs the same help entrypoint through npm as through its compiled target", async () => {
    const direct = run(process.execPath, [await directTarget(), "--help"]);
    const installed = run("npm", [
      "exec",
      "--workspace=@local/agent-fabric-console",
      "--",
      "agent-fabric-console",
      "--help",
    ]);

    expect(installed).toEqual(direct);
    expect(installed.status).toBe(0);
    expect(installed.stdout).toContain("usage: agent-fabric-console");
    expect(installed.stderr).toBe("");
  });

  it("exports the same snapshot through npm as through its compiled target", async () => {
    const arguments_ = ["--project", workspaceRoot, "--export", "json"];
    const direct = run(process.execPath, [await directTarget(), ...arguments_]);
    const installed = run("npm", [
      "exec",
      "--workspace=@local/agent-fabric-console",
      "--",
      "agent-fabric-console",
      ...arguments_,
    ]);

    expect(installed).toEqual(direct);
    expect(installed.status).toBe(0);
    expect(JSON.parse(installed.stdout)).toMatchObject({
      schemaVersion: 1,
      kind: "agent-fabric-console-snapshot",
    });
    expect(installed.stderr).toBe("");
  });
});

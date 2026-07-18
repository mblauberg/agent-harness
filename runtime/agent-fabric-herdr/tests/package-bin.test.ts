import { readFile, stat } from "node:fs/promises";
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
  async function declaredBinTarget(): Promise<string> {
    const packageValue = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    ) as { bin: Record<string, string> };
    const target = packageValue.bin["agent-fabric-herdr"];
    if (target === undefined) throw new Error("package bin is not declared");
    return path.join(packageRoot, target);
  }

  it("ships a tracked executable wrapper before compiled output exists", async () => {
    const target = await declaredBinTarget();
    const relative = path.relative(workspaceRoot, target).split(path.sep).join("/");
    const source = await readFile(target, "utf8");
    const metadata = await stat(target);
    const tracked = run("git", ["ls-files", "--stage", "--", relative]);

    expect(path.relative(packageRoot, target)).not.toMatch(/^dist(?:\/|$)/u);
    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(source).toContain("../dist/bin.js");
    expect(metadata.mode & 0o111).not.toBe(0);
    expect(tracked.status).toBe(0);
    expect(tracked.stdout).toMatch(/^100755 /u);
  });

  it("runs the same help entrypoint through npm as through its compiled target", async () => {

    const direct = run(process.execPath, [path.join(packageRoot, "dist/bin.js"), "--help"]);
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

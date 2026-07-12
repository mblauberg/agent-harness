import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { runHerdrCli } from "../src/cli.js";

describe("agent-fabric-herdr CLI", () => {
  it("requires and labels explicit degraded fire-and-forget steering", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "fabric-herdr-cli-")));
    try {
      const stateDirectory = join(root, "state");
      const projectRoot = join(root, "project");
      await mkdir(stateDirectory, { mode: 0o700 });
      await mkdir(projectRoot, { mode: 0o700 });
      const executable = join(root, "herdr-fixture");
      const consoleExecutable = join(root, "console-fixture");
      const log = join(root, "calls.log");
      const body = "#!/bin/sh\n" +
        `printf '%s\\n' \"$*\" >> '${log}'\n` +
        "if [ \"$1\" = \"--version\" ]; then printf '%s\\n' 'herdr 0.7.3'; exit 0; fi\n" +
        "if [ \"$1 $2\" = \"api snapshot\" ]; then printf '%s' '{\"id\":\"fixture\",\"result\":{\"type\":\"session_snapshot\",\"snapshot\":{\"version\":\"0.7.3\",\"protocol\":16,\"agents\":[],\"panes\":[]}}}'; exit 0; fi\n" +
        "printf '%s' '{\"id\":\"fixture\",\"result\":{\"accepted\":true}}'\n";
      const consoleBody = "#!/bin/sh\nexit 0\n";
      await writeFile(executable, body, { encoding: "utf8", mode: 0o700 });
      await writeFile(consoleExecutable, consoleBody, { encoding: "utf8", mode: 0o700 });
      await chmod(executable, 0o700);
      await chmod(consoleExecutable, 0o700);
      const config = join(root, "config.json");
      await writeFile(config, JSON.stringify({
        schemaVersion: 1,
        executable,
        executableDigest: digest(body),
        expectedVersion: "0.7.3",
        expectedProtocol: 16,
        stateDirectory,
        projectId: "project-01",
        projectSessionId: "session-01",
        canonicalProjectRoot: projectRoot,
        consoleExecutable,
        consoleExecutableDigest: digest(consoleBody),
      }), { encoding: "utf8", mode: 0o600 });
      const output = new PassThrough();
      const error = new PassThrough();
      let stdout = "";
      let stderr = "";
      output.on("data", (chunk) => { stdout += chunk.toString(); });
      error.on("data", (chunk) => { stderr += chunk.toString(); });

      const withoutFlag = await runHerdrCli([
        "steer", "--config", config, "--pane", "w5:p7", "--task-ref", "task-01", "--prompt", "Pause.",
      ], { stdin: new PassThrough(), stdout: output, stderr: error });
      expect(withoutFlag).toBe(2);
      expect(stderr).toContain("--fire-and-forget");
      stdout = "";
      stderr = "";

      const result = await runHerdrCli([
        "steer", "--config", config, "--pane", "w5:p7", "--fire-and-forget",
        "--task-ref", "task-01", "--prompt", "Pause after the current check.",
      ], { stdin: new PassThrough(), stdout: output, stderr: error });

      expect(result).toBe(0);
      expect(JSON.parse(stdout)).toEqual({
        status: "dispatched-unconfirmed",
        operation: "steer.inject-fire-and-forget",
        referenceValidation: "unverified",
        taskRef: "task-01",
        deliveryEvidence: "none",
        canSatisfyExpectedResult: false,
        canCloseBarrier: false,
      });
      expect((await readFile(log, "utf8")).trim().split("\n").slice(-2)).toEqual([
        "pane run w5:p7 Pause after the current check.",
        "pane send-keys w5:p7 enter",
      ]);
      stdout = "";
      stderr = "";

      const messageResult = await runHerdrCli([
        "steer", "--config", config, "--pane", "w5:p7", "--fire-and-forget",
        "--message-ref", "message-01", "--prompt", "Pause after this command.",
      ], { stdin: new PassThrough(), stdout: output, stderr: error });

      expect(messageResult).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({
        status: "dispatched-unconfirmed",
        referenceValidation: "unverified",
        messageRef: "message-01",
        canSatisfyExpectedResult: false,
        canCloseBarrier: false,
      });
      stdout = "";
      stderr = "";
      await expect(runHerdrCli([
        "steer", "--config", config, "--pane", "w5:p7", "--fire-and-forget",
        "--task-ref", "task-01", "--message-ref", "message-01", "--prompt", "Pause.",
      ], { stdin: new PassThrough(), stdout: output, stderr: error })).resolves.toBe(2);
      expect(stderr).toContain("exactly one");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

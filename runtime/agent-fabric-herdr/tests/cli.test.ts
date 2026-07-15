import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { runHerdrCli } from "../src/cli.js";

describe("agent-fabric-herdr CLI", () => {
  it("does not expose a direct steering command", async () => {
    const output = new PassThrough();
    const error = new PassThrough();
    let stderr = "";
    error.on("data", (chunk) => { stderr += chunk.toString(); });

    await expect(runHerdrCli([
      "steer", "--config", "/tmp/herdr.json", "--pane", "w5:p7",
    ], { stdin: new PassThrough(), stdout: output, stderr: error })).resolves.toBe(2);
    expect(stderr).toBe("usage: agent-fabric-herdr doctor --config PATH\n");
  });
});

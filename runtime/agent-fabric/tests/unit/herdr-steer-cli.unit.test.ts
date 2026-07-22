import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { checkHerdrSteer, herdrUnavailableReason, parseHerdrSteerArguments } from "../../src/cli/herdr-steer.ts";

const execFileAsync = promisify(execFile);
const cliMain = fileURLToPath(new URL("../../src/cli/main.ts", import.meta.url));
const tsxLoader = fileURLToPath(import.meta.resolve("tsx"));

describe("Herdr steer CLI", () => {
  it("checks environment, capability and integration in order", async () => {
    const capability = async () => "afc_valid";
    const integration = async () => undefined;
    await expect(checkHerdrSteer({}, { resolveCapability: capability, checkIntegration: integration }))
      .resolves.toEqual({
        status: "unavailable",
        integration: "herdr-control-v1",
        reason: "missing environment variable AGENT_FABRIC_STATE_DIRECTORY",
      });
    await expect(checkHerdrSteer({
      AGENT_FABRIC_STATE_DIRECTORY: "/state",
      AGENT_FABRIC_SEAT: "codex",
      AGENT_FABRIC_CLIENT_LABEL: "bogus",
    }, { resolveCapability: capability, checkIntegration: integration }))
      .resolves.toMatchObject({ reason: "invalid AGENT_FABRIC_CLIENT_LABEL" });
    await expect(checkHerdrSteer({
      AGENT_FABRIC_STATE_DIRECTORY: "/state",
      AGENT_FABRIC_SEAT: "codex",
      AGENT_FABRIC_CLIENT_LABEL: "codex",
    }, {
      resolveCapability: async () => { throw new Error("seat metadata missing"); },
      checkIntegration: integration,
    })).resolves.toMatchObject({ reason: "capability check failed: seat metadata missing" });
    await expect(checkHerdrSteer({
      AGENT_FABRIC_STATE_DIRECTORY: "/state",
      AGENT_FABRIC_SEAT: "codex",
      AGENT_FABRIC_CLIENT_LABEL: "codex",
    }, {
      resolveCapability: capability,
      checkIntegration: async () => { throw Object.assign(new Error("connect failed"), { code: "ENOENT" }); },
    })).resolves.toMatchObject({ reason: "integration check failed: ENOENT" });
    await expect(checkHerdrSteer({
      AGENT_FABRIC_STATE_DIRECTORY: "/state",
      AGENT_FABRIC_SEAT: "codex",
      AGENT_FABRIC_CLIENT_LABEL: "codex",
    }, { resolveCapability: capability, checkIntegration: integration })).resolves.toEqual({
      status: "ready",
      integration: "herdr-control-v1",
    });
  });

  it("exposes the ordered preflight through herdr steer --check", async () => {
    let failure: unknown;
    try {
      await execFileAsync(process.execPath, ["--import", tsxLoader, cliMain, "herdr", "steer", "--check"], {
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin", TMPDIR: process.env.TMPDIR ?? "/tmp" },
      });
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toMatchObject({
      code: 1,
      stdout: `${JSON.stringify({
        status: "unavailable",
        integration: "herdr-control-v1",
        reason: "missing environment variable AGENT_FABRIC_STATE_DIRECTORY",
      })}\n`,
    });
  });

  it("names the failed direct steering check in unavailable results", () => {
    expect(herdrUnavailableReason(Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" })))
      .toBe("daemon connection check failed: ECONNREFUSED");
  });

  it("builds one closed public dispatch request", async () => {
    await expect(parseHerdrSteerArguments([
      "review-claude",
      "--fire-and-forget",
      "--action-id", "herdr-action-17",
      "--pane-ref", "w9:p3",
      "--task-ref", "task-review-17",
      "--message-ref", "message-steer-17",
      "--expected-revision", "2",
      "--prompt", "Pause after the current check.",
    ])).resolves.toEqual({
      actionId: "herdr-action-17",
      fireAndForget: true,
      targetAgentId: "review-claude",
      paneRef: "w9:p3",
      reference: {
        kind: "message",
        taskId: "task-review-17",
        messageId: "message-steer-17",
        expectedRevision: 2,
      },
      prompt: "Pause after the current check.",
    });
  });

  it("requires explicit idempotency, reference revision and one-way acknowledgement", async () => {
    await expect(parseHerdrSteerArguments([
      "review-claude", "--task-ref", "task-review-17", "--prompt", "Pause.",
    ])).rejects.toThrow("--fire-and-forget");
  });

  it("rejects prompts above the public operation bound", async () => {
    await expect(parseHerdrSteerArguments([
      "review-claude",
      "--fire-and-forget",
      "--action-id", "herdr-action-large",
      "--pane-ref", "w9:p3",
      "--task-ref", "task-review-large",
      "--expected-revision", "1",
      "--prompt", "x".repeat(4097),
    ])).rejects.toThrow("1-4096 UTF-8 bytes");
  });
});

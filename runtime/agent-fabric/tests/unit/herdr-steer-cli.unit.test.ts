import { describe, expect, it } from "vitest";

import { parseHerdrSteerArguments } from "../../src/cli/herdr-steer.ts";

describe("Herdr steer CLI", () => {
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

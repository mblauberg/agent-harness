import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runAdapterConformance } from "../../../src/index.ts";
import { describe, expect, it } from "vitest";

describe("Stage 1 fake adapter action journal", () => {
  it("prepares before dispatch, records terminal before reply and deduplicates one action ID", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-fake-adapter-"));
    const journalPath = join(directory, "action-journal.json");
    const executable = join(dirname(fileURLToPath(import.meta.url)), "../../support/daemon-fake-adapter.ts");

    try {
      const report = await runAdapterConformance({
        command: [process.execPath, executable],
        environment: { FAKE_ADAPTER_JOURNAL: journalPath },
        action: {
          actionId: "action-1",
          operation: "steer",
          payload: { taskId: "task-1", prompt: "inspect" },
        },
      });
      expect(report).toMatchObject({
        passed: true,
        protocolVersion: 1,
        action: {
          actionId: "action-1",
          status: "terminal",
          executionCount: 1,
          retryMatched: true,
          changedPayloadRejected: true,
        },
      });
      const journal = JSON.parse(await readFile(journalPath, "utf8"));
      expect(journal.actions["action-1"]).toMatchObject({
        status: "terminal",
        history: ["prepared", "dispatched", "accepted", "terminal"],
        executionCount: 1,
      });
      expect(journal.released).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

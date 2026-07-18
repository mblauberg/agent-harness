import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SqliteAdapterActionJournal } from "../../src/adapters/providers/journal.ts";
import { createOpenCodeAcpAdapter } from "../../src/adapters/providers/optional/opencode-acp.ts";

describe("OpenCode ACP adapter", () => {
  it("admits only explicit OpenCode account models through the generic-open family", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opencode-acp-policy-"));
    const journal = new SqliteAdapterActionJournal(join(directory, "actions.sqlite3"));
    const boundary = {
      status: async () => ({ healthy: true }),
      spawn: async () => ({ resumeReference: "session-1" }),
      attach: async () => { throw new Error("attach disabled"); },
      sendTurn: async () => ({ resumeReference: "session-1" }),
      interrupt: async () => { throw new Error("interrupt disabled"); },
      release: async () => ({ released: true }),
    };
    try {
      const adapter = createOpenCodeAcpAdapter({ boundary, journal });
      await expect(adapter.request("spawn", {
        actionId: "allowed",
        payload: { model: "opencode/deepseek-v4-flash-free", modelFamily: "generic-open" },
      })).resolves.toMatchObject({ resumeReference: "session-1" });
      await expect(adapter.request("spawn", {
        actionId: "wrong-provider",
        payload: { model: "anthropic/claude-opus", modelFamily: "generic-open" },
      })).rejects.toMatchObject({ code: "ADAPTER_MODEL_FORBIDDEN" });
      await expect(adapter.request("spawn", {
        actionId: "wrong-family",
        payload: { model: "opencode/deepseek-v4-flash-free", modelFamily: "anthropic" },
      })).rejects.toMatchObject({ code: "ADAPTER_FAMILY_FORBIDDEN" });
    } finally {
      journal.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

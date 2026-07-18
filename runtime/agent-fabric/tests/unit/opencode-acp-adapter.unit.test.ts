import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SqliteAdapterActionJournal } from "../../src/adapters/providers/journal.ts";
import { KiroAcpStdioClient } from "../../src/adapters/providers/optional/kiro-acp-client.ts";
import { createManagedAcpBoundary } from "../../src/adapters/providers/optional/kiro-acp.ts";
import { createOpenCodeAcpAdapter } from "../../src/adapters/providers/optional/opencode-acp.ts";

async function failureFixture(scenario: string) {
  const directory = await mkdtemp(join(tmpdir(), `opencode-acp-${scenario}-`));
  const journal = new SqliteAdapterActionJournal(join(directory, "actions.sqlite3"));
  const source = fileURLToPath(new URL("../support/kiro-acp-fake.ts", import.meta.url));
  const loader = fileURLToPath(import.meta.resolve("tsx"));
  const boundary = createManagedAcpBoundary({
    providerName: "OpenCode ACP",
    clientFactory: ({ model, effort, cwd }) => new KiroAcpStdioClient({
      executable: process.execPath,
      args: ["--import", loader, source, scenario],
      cwd,
      model,
      ...(effort === undefined ? {} : { effort }),
      configureModelOnSessionStart: true,
      configureEffortOnSessionStart: effort !== undefined,
      requestTimeoutMs: 500,
      closeTimeoutMs: 100,
    }),
  });
  return { directory, journal, boundary, adapter: createOpenCodeAcpAdapter({ boundary, journal }) };
}

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
      await expect(adapter.request("spawn", {
        actionId: "supported-effort",
        payload: { model: "opencode/deepseek-v4-flash-free", modelFamily: "generic-open", effort: "high" },
      })).resolves.toMatchObject({ resumeReference: "session-1" });
      await expect(adapter.request("spawn", {
        actionId: "unsupported-effort",
        payload: { model: "opencode/deepseek-v4-flash-free", modelFamily: "generic-open", effort: "turbo" },
      })).rejects.toMatchObject({ code: "INVALID_PARAMS" });
      await expect(adapter.request("lookup_action", {
        actionId: "unsupported-effort",
      })).rejects.toMatchObject({ code: "ACTION_NOT_FOUND" });
    } finally {
      journal.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["empty-answer", "PROVIDER_RESPONSE_INVALID"],
    ["unsupported-update", "PROVIDER_PROTOCOL_INVALID"],
    ["partial-answer", "PROVIDER_EXITED"],
    ["timeout", "PROVIDER_RESPONSE_TIMEOUT"],
  ])("journals an ambiguous no-effect turn for %s", async (scenario, code) => {
    const fixture = await failureFixture(scenario);
    const spawnActionId = `opencode:${scenario}:spawn`;
    const turnActionId = `opencode:${scenario}:turn`;
    try {
      const spawned = await fixture.adapter.request("spawn", {
        actionId: spawnActionId,
        payload: {
          cwd: fixture.directory,
          model: "opencode/deepseek-v4-flash-free",
          modelFamily: "generic-open",
          effort: "high",
        },
      }) as { resumeReference: string };
      await expect(fixture.adapter.request("dispatch", {
        actionId: turnActionId,
        operation: "send_turn",
        payload: {
          cwd: fixture.directory,
          resumeReference: spawned.resumeReference,
          prompt: "return the exact sentinel",
          model: "opencode/deepseek-v4-flash-free",
          modelFamily: "generic-open",
          effort: "high",
        },
      })).rejects.toMatchObject({ code });
      await expect(fixture.adapter.request("lookup_action", { actionId: turnActionId })).resolves.toMatchObject({
        status: "ambiguous",
        history: ["prepared", "dispatched", "ambiguous"],
        executionCount: 1,
        effectCount: 0,
      });
    } finally {
      await fixture.boundary.shutdown();
      fixture.journal.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});

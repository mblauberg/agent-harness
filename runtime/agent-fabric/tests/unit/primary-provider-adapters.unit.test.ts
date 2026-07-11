import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import {
  claudeReadOnlyOptions,
  createClaudeAgentSdkAdapter,
  type ClaudeAgentSdkBoundary,
} from "../../src/adapters/providers/claude-agent-sdk.ts";
import {
  codexAppServerCommand,
  codexCompletedTurnResult,
  codexThreadConfiguration,
  createCodexAppServerAdapter,
  type CodexAppServerBoundary,
} from "../../src/adapters/providers/codex-app-server.ts";
import { SqliteAdapterActionJournal } from "../../src/adapters/providers/journal.ts";

const temporaryDirectories: string[] = [];

async function journal(): Promise<SqliteAdapterActionJournal> {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-provider-adapter-"));
  temporaryDirectories.push(directory);
  return new SqliteAdapterActionJournal(join(directory, "actions.sqlite3"));
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function claudeBoundary(): ClaudeAgentSdkBoundary {
  return {
    status: vi.fn(async () => ({ healthy: true })),
    spawn: vi.fn(async () => ({ resumeReference: "claude-session-1" })),
    attach: vi.fn(async ({ resumeReference }) => ({ resumeReference })),
    sendTurn: vi.fn(async () => ({ resumeReference: "claude-session-1", result: "done" })),
    interrupt: vi.fn(async () => ({ interrupted: true })),
    release: vi.fn(async () => ({ released: true, deleted: false })),
  };
}

function codexBoundary(): CodexAppServerBoundary {
  return {
    status: vi.fn(async () => ({ healthy: true })),
    spawn: vi.fn(async () => ({ resumeReference: "codex-thread-1" })),
    attach: vi.fn(async ({ resumeReference }) => ({ resumeReference })),
    sendTurn: vi.fn(async () => ({ resumeReference: "codex-thread-1", turnId: "turn-1" })),
    steer: vi.fn(async () => ({ turnId: "turn-1", steered: true })),
    interrupt: vi.fn(async () => ({ interrupted: true })),
    compact: vi.fn(async () => ({ compacted: true, resumeReference: "codex-thread-1" })),
    release: vi.fn(async () => ({ released: true, deleted: false })),
  };
}

describe("Claude Agent SDK fabric adapter", () => {
  it("translates the fabric boundary into explicit SDK plan and no-tools isolation", () => {
    expect(claudeReadOnlyOptions({
      cwd: "/workspace/src",
      model: "claude-sonnet-4-5",
      allowedTools: ["Bash"],
      disallowedTools: [],
      sandbox: "read-only",
      approvalPolicy: "never",
    }, undefined, "/trusted/claude")).toMatchObject({
      cwd: "/workspace/src",
      model: "claude-sonnet-4-5",
      tools: [],
      permissionMode: "plan",
      settingSources: [],
      skills: [],
      plugins: [],
      pathToClaudeCodeExecutable: "/trusted/claude",
    });
  });

  it("journals a provider effect before returning it and replays the terminal result without a second effect", async () => {
    const actionJournal = await journal();
    const boundary = claudeBoundary();
    const adapter = createClaudeAgentSdkAdapter({ boundary, journal: actionJournal });
    const params = {
      actionId: "claude-spawn-1",
      payload: { prompt: "bounded task", cwd: ".", model: "claude-test" },
    };

    const first = await adapter.request("spawn", params);
    const replay = await adapter.request("spawn", params);

    expect(first).toEqual({ resumeReference: "claude-session-1" });
    expect(replay).toEqual(first);
    expect(boundary.spawn).toHaveBeenCalledTimes(1);
    expect(await adapter.request("lookup_action", { actionId: "claude-spawn-1" })).toMatchObject({
      actionId: "claude-spawn-1",
      operation: "spawn",
      status: "terminal",
      history: ["prepared", "dispatched", "accepted", "terminal"],
      executionCount: 1,
      effectCount: 1,
    });
    actionJournal.close();
  });

  it("replays a terminal action after the wrapper process journal is reopened", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-provider-adapter-reopen-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "actions.sqlite3");
    const firstJournal = new SqliteAdapterActionJournal(path);
    const firstBoundary = claudeBoundary();
    await createClaudeAgentSdkAdapter({ boundary: firstBoundary, journal: firstJournal }).request("spawn", {
      actionId: "claude-reopen-1",
      payload: { prompt: "persist me" },
    });
    firstJournal.close();

    const reopenedJournal = new SqliteAdapterActionJournal(path);
    const replacementBoundary = claudeBoundary();
    const replay = await createClaudeAgentSdkAdapter({ boundary: replacementBoundary, journal: reopenedJournal }).request(
      "spawn",
      { actionId: "claude-reopen-1", payload: { prompt: "persist me" } },
    );

    expect(replay).toEqual({ resumeReference: "claude-session-1" });
    expect(replacementBoundary.spawn).not.toHaveBeenCalled();
    reopenedJournal.close();
  });

  it("rejects changed payloads and unsupported interactive controls with typed errors", async () => {
    const actionJournal = await journal();
    const adapter = createClaudeAgentSdkAdapter({ boundary: claudeBoundary(), journal: actionJournal });
    await adapter.request("spawn", { actionId: "claude-spawn-2", payload: { prompt: "one" } });

    await expect(
      adapter.request("spawn", { actionId: "claude-spawn-2", payload: { prompt: "two" } }),
    ).rejects.toMatchObject({ code: "ACTION_CONFLICT" });
    await expect(
      adapter.request("dispatch", {
        actionId: "claude-steer-1",
        operation: "steer",
        payload: { resumeReference: "claude-session-1", prompt: "change course" },
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    actionJournal.close();
  });

  it("advertises managed SDK capabilities without claiming an interactive TUI or in-place compaction", async () => {
    const actionJournal = await journal();
    const adapter = createClaudeAgentSdkAdapter({ boundary: claudeBoundary(), journal: actionJournal });

    await expect(adapter.request("capabilities", {})).resolves.toMatchObject({
      adapterId: "claude-agent-sdk",
      protocolVersion: 1,
      actionJournal: true,
      controlModes: ["managed"],
      inboxDeliveryModes: ["structured-push"],
      compactInPlace: false,
    });
    actionJournal.close();
  });
});

describe("Codex app-server response validation", () => {
  it("extracts only the final agent message from a completed turn", () => {
    expect(codexCompletedTurnResult({
      id: "turn-1",
      status: "completed",
      items: [
        { type: "userMessage", id: "user-1", content: [] },
        { type: "agentMessage", id: "agent-1", text: "FABRIC_SMOKE_TURN_OK" },
      ],
    })).toBe("FABRIC_SMOKE_TURN_OK");
  });

  it("fails closed for failed turns or missing agent output", () => {
    expect(() => codexCompletedTurnResult({ status: "failed", error: { message: "provider error" }, items: [] }))
      .toThrow("provider error");
    expect(() => codexCompletedTurnResult({ status: "completed", items: [] }))
      .toThrow("no agent message");
  });
});

describe("trusted primary adapter configuration", () => {
  it("routes both primaries through pinned built fabric wrappers after activation", async () => {
    const root = fileURLToPath(new URL("../../../../", import.meta.url));
    const config: unknown = parse(await readFile(join(root, "config/agent-fabric.yaml"), "utf8"));
    const compatibility: unknown = parse(await readFile(join(root, "config/adapter-compatibility.yaml"), "utf8"));
    expect(config).toMatchObject({
      adapters: {
        "claude-agent-sdk": {
          command: expect.arrayContaining([expect.stringContaining("dist/adapters/providers/claude-agent-sdk.js")]),
        },
        "codex-app-server": {
          command: expect.arrayContaining([expect.stringContaining("dist/adapters/providers/codex-app-server.js")]),
        },
      },
    });
    expect(compatibility).toMatchObject({
      activation_policy: { default_enabled: false, real_adapters_require_separate_gate: true },
      adapters: {
        "claude-agent-sdk": {
          enabled: true,
          unresolved_pins: [],
        },
        "codex-app-server": {
          enabled: true,
          unresolved_pins: [],
        },
      },
    });
  });
});

describe("Codex app-server fabric adapter", () => {
  it("requires an absolute pinned provider executable", () => {
    expect(codexAppServerCommand("/trusted/codex")).toEqual(["/trusted/codex", "app-server"]);
    expect(() => codexAppServerCommand("codex")).toThrow(/absolute/u);
  });
  it("forces read-only sandboxing regardless of caller-supplied permissions", () => {
    expect(codexThreadConfiguration({
      cwd: "/workspace/src",
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
      permissions: "read-only",
    })).toEqual({ cwd: "/workspace/src", sandbox: "read-only", approvalPolicy: "never" });
  });
  it("maps fabric turn, steer, compact and release actions to an injected app-server boundary", async () => {
    const actionJournal = await journal();
    const boundary = codexBoundary();
    const adapter = createCodexAppServerAdapter({ boundary, journal: actionJournal });

    await expect(
      adapter.request("dispatch", {
        actionId: "codex-turn-1",
        operation: "send_turn",
        payload: { resumeReference: "codex-thread-1", prompt: "implement slice" },
      }),
    ).resolves.toMatchObject({ actionId: "codex-turn-1", status: "terminal", effectCount: 1 });
    await expect(
      adapter.request("dispatch", {
        actionId: "codex-steer-1",
        operation: "steer",
        payload: { resumeReference: "codex-thread-1", expectedTurnId: "turn-1", prompt: "focus tests" },
      }),
    ).resolves.toMatchObject({ status: "terminal" });
    await expect(
      adapter.request("compact", {
        actionId: "codex-compact-1",
        payload: { resumeReference: "codex-thread-1" },
      }),
    ).resolves.toEqual({ compacted: true, resumeReference: "codex-thread-1" });
    await expect(
      adapter.request("release", {
        actionId: "codex-release-1",
        payload: { resumeReference: "codex-thread-1" },
      }),
    ).resolves.toEqual({ released: true, deleted: false });

    expect(boundary.sendTurn).toHaveBeenCalledTimes(1);
    expect(boundary.steer).toHaveBeenCalledTimes(1);
    expect(boundary.compact).toHaveBeenCalledTimes(1);
    expect(boundary.release).toHaveBeenCalledTimes(1);
    actionJournal.close();
  });

  it("does not claim verified interactive injection even though app-server supports managed steering", async () => {
    const actionJournal = await journal();
    const adapter = createCodexAppServerAdapter({ boundary: codexBoundary(), journal: actionJournal });

    await expect(adapter.request("capabilities", {})).resolves.toMatchObject({
      adapterId: "codex-app-server",
      controlModes: ["managed"],
      inboxDeliveryModes: ["structured-push"],
      operations: expect.arrayContaining(["spawn", "attach", "send_turn", "steer", "interrupt", "compact"]),
    });
    await expect(adapter.request("wakeup", { actionId: "wake-1", payload: {} })).rejects.toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
    });
    actionJournal.close();
  });
});

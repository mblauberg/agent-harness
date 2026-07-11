import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import {
  claudeReadOnlyOptions,
  createClaudeAgentSdkAdapter,
  InstalledClaudeAgentSdkBoundary,
  type ClaudeAgentSdkBoundary,
} from "../../src/adapters/providers/claude-agent-sdk.ts";
import {
  codexAppServerCommand,
  codexCompletedTurnResult,
  codexThreadConfiguration,
  createCodexAppServerAdapter,
  InstalledCodexAppServerBoundary,
  type CodexAppServerBoundary,
} from "../../src/adapters/providers/codex-app-server.ts";
import { SqliteAdapterActionJournal } from "../../src/adapters/providers/journal.ts";
import { probeChairLaunchFabricContinuity } from "../../src/adapters/providers/chair-launch-continuity.ts";
import * as providerTypes from "../../src/adapters/providers/types.ts";

const temporaryDirectories: string[] = [];

async function journal(): Promise<SqliteAdapterActionJournal> {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-provider-adapter-"));
  temporaryDirectories.push(directory);
  return new SqliteAdapterActionJournal(join(directory, "actions.sqlite3"));
}

function provedChairLaunch(resumeReference: string, providerContractDigest: string) {
  return {
    resumeReference,
    providerSessionGeneration: 1,
    fabricContinuity: {
      schemaVersion: 1,
      kind: "authenticated-fabric-continuity",
      providerContractDigest,
      providerSessionRef: resumeReference,
      providerSessionGeneration: 1,
      authenticated: true,
    },
  } as const;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("private chair launch environment", () => {
  it("takes the complete handoff once and removes both values from the adapter process environment", () => {
    const takeChairLaunchHandoff: unknown = Reflect.get(providerTypes, "takeChairLaunchHandoff");
    expect(takeChairLaunchHandoff).toBeTypeOf("function");
    const environment: NodeJS.ProcessEnv = {
      AGENT_FABRIC_CAPABILITY: "environment-capability-canary",
      AGENT_FABRIC_SOCKET_PATH: "/private/environment-fabric.sock",
      KEEP: "retained",
    };

    expect(Reflect.apply(
      takeChairLaunchHandoff as (...arguments_: unknown[]) => unknown,
      undefined,
      [environment],
    )).toEqual({
      capability: "environment-capability-canary",
      socketPath: "/private/environment-fabric.sock",
    });
    expect(environment).toEqual({ KEEP: "retained" });
    expect(Reflect.apply(
      takeChairLaunchHandoff as (...arguments_: unknown[]) => unknown,
      undefined,
      [environment],
    )).toBeUndefined();
  });

  it("rejects and removes a handoff whose socket path is not absolute", () => {
    const takeChairLaunchHandoff: unknown = Reflect.get(providerTypes, "takeChairLaunchHandoff");
    const environment: NodeJS.ProcessEnv = {
      AGENT_FABRIC_CAPABILITY: "relative-socket-capability-canary",
      AGENT_FABRIC_SOCKET_PATH: "relative/fabric.sock",
    };

    expect(() => Reflect.apply(
      takeChairLaunchHandoff as (...arguments_: unknown[]) => unknown,
      undefined,
      [environment],
    )).toThrowError("chair launch private environment must contain a capability and absolute socket path");
    expect(environment).toEqual({});
  });

  it("closes a bounded authenticated mailbox probe and returns only contract-bound evidence", async () => {
    const call = vi.fn(async () => ({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] }));
    const close = vi.fn(async () => undefined);
    const connect = vi.fn(async () => ({ call, close }));
    const input = {
      capability: "mailbox-probe-capability-canary",
      socketPath: "/private/mailbox-probe.sock",
      resumeReference: "provider-chair-session",
      providerSessionGeneration: 1,
      providerContractDigest: `sha256:${"6".repeat(64)}`,
    };

    const result = await probeChairLaunchFabricContinuity(input, { connect });

    expect(connect).toHaveBeenCalledWith({
      capability: input.capability,
      socketPath: input.socketPath,
    });
    expect(call).toHaveBeenCalledWith("getMailboxState", {});
    expect(close).toHaveBeenCalledOnce();
    expect(result).toEqual(provedChairLaunch(input.resumeReference, input.providerContractDigest));
    expect(JSON.stringify(result)).not.toContain(input.capability);
    expect(JSON.stringify(result)).not.toContain(input.socketPath);
  });

  it("closes the authenticated mailbox probe when its response is invalid", async () => {
    const close = vi.fn(async () => undefined);
    const connect = vi.fn(async () => ({
      call: vi.fn(async () => ({ unexpected: true })),
      close,
    }));

    await expect(probeChairLaunchFabricContinuity({
      capability: "invalid-probe-capability-canary",
      socketPath: "/private/invalid-probe.sock",
      resumeReference: "provider-chair-invalid-probe",
      providerSessionGeneration: 1,
      providerContractDigest: `sha256:${"7".repeat(64)}`,
    }, { connect })).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    expect(close).toHaveBeenCalledOnce();
  });
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

  it("accepts one advertised private-environment chair launch without journalling its credential", async () => {
    const actionJournal = await journal();
    const boundary = claudeBoundary();
    const launchChair = vi.fn(async (input: { providerContractDigest: string }) => (
      provedChairLaunch("claude-chair-session-1", input.providerContractDigest)
    ));
    Reflect.set(boundary, "launchChair", launchChair);
    const capability = "chair-capability-secret-canary";
    const socketPath = "/private/agent-fabric.sock";
    const adapterOptions = {
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: { capability, socketPath },
    };
    const adapter = createClaudeAgentSdkAdapter(adapterOptions);
    const request = {
      schemaVersion: 1,
      actionId: "claude-chair-launch-1",
      providerContractDigest: `sha256:${"a".repeat(64)}`,
      payload: {
        cwd: "/workspace/project",
        modelFamily: "anthropic",
        model: "claude-test",
        prompt: "continue the reviewed project session",
      },
    };

    await expect(adapter.request("capabilities", {})).resolves.toMatchObject({
      operations: expect.arrayContaining(["launch_chair"]),
      chairLaunch: {
        schemaVersion: 1,
        method: "launch_chair",
        inputSchemaId: "claude-agent-sdk.chair-launch.v1",
        oneUse: true,
        secretTransport: "private-environment",
        environment: {
          capability: "AGENT_FABRIC_CAPABILITY",
          socketPath: "AGENT_FABRIC_SOCKET_PATH",
        },
        noEffectProofSchemas: {},
      },
    });
    const advertised = await adapter.request("capabilities", {});
    const chairLaunch = Reflect.get(advertised as object, "chairLaunch");
    const parseChairLaunchCapability: unknown = Reflect.get(providerTypes, "parseChairLaunchCapability");
    expect(parseChairLaunchCapability).toBeTypeOf("function");
    expect(Reflect.apply(
      parseChairLaunchCapability as (...arguments_: unknown[]) => unknown,
      undefined,
      [chairLaunch],
    )).toEqual(chairLaunch);
    expect(() => Reflect.apply(
      parseChairLaunchCapability as (...arguments_: unknown[]) => unknown,
      undefined,
      [{ ...chairLaunch, providerContractDigest: request.providerContractDigest }],
    )).toThrowError("chair launch capability does not match its closed schema");
    await expect(adapter.request("launch_chair", request)).resolves.toEqual(
      provedChairLaunch("claude-chair-session-1", request.providerContractDigest),
    );
    expect(launchChair).toHaveBeenCalledWith({
      actionId: "claude-chair-launch-1",
      providerContractDigest: request.providerContractDigest,
      payload: request.payload,
      environment: {
        AGENT_FABRIC_CAPABILITY: capability,
        AGENT_FABRIC_SOCKET_PATH: socketPath,
      },
    });
    const persisted = await adapter.request("lookup_action", { actionId: request.actionId });
    expect(JSON.stringify(persisted)).not.toContain(capability);
    expect(JSON.stringify(persisted)).not.toContain(socketPath);
    await expect(adapter.request("launch_chair", request)).resolves.toEqual(
      provedChairLaunch("claude-chair-session-1", request.providerContractDigest),
    );
    expect(launchChair).toHaveBeenCalledOnce();
    actionJournal.close();
  });

  it("rejects a changed chair-launch replay against the persisted public contract digest", async () => {
    const actionJournal = await journal();
    const boundary = claudeBoundary();
    const launchChair = vi.fn(async (input: { providerContractDigest: string }) => (
      provedChairLaunch("claude-chair-session-2", input.providerContractDigest)
    ));
    Reflect.set(boundary, "launchChair", launchChair);
    const adapterOptions = {
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: {
        capability: "changed-replay-capability-canary",
        socketPath: "/private/changed-replay.sock",
      },
    };
    const adapter = createClaudeAgentSdkAdapter(adapterOptions);
    const request = {
      schemaVersion: 1,
      actionId: "claude-chair-launch-2",
      providerContractDigest: `sha256:${"e".repeat(64)}`,
      payload: {
        cwd: "/workspace/project",
        modelFamily: "anthropic",
        model: "claude-test",
        prompt: "original reviewed work",
      },
    };

    await adapter.request("launch_chair", request);
    await expect(adapter.request("launch_chair", {
      ...request,
      payload: { ...request.payload, prompt: "changed work" },
    })).rejects.toMatchObject({ code: "ACTION_CONFLICT" });
    expect(launchChair).toHaveBeenCalledOnce();
    actionJournal.close();
  });

  it("rejects a private capability reused as a journalled chair-launch identifier", async () => {
    const actionJournal = await journal();
    const boundary = claudeBoundary();
    const launchChair = vi.fn(async () => ({ resumeReference: "must-not-launch" }));
    Reflect.set(boundary, "launchChair", launchChair);
    const capability = "identifier-capability-secret-canary";
    const adapterOptions = {
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: {
        capability,
        socketPath: "/private/identifier.sock",
      },
    };
    const adapter = createClaudeAgentSdkAdapter(adapterOptions);

    await expect(adapter.request("launch_chair", {
      schemaVersion: 1,
      actionId: `launch-${capability}`,
      providerContractDigest: `sha256:${"f".repeat(64)}`,
      payload: {
        cwd: "/workspace/project",
        modelFamily: "anthropic",
        model: "claude-test",
        prompt: "reviewed work",
      },
    })).rejects.toMatchObject({ code: "PRIVATE_HANDOFF_DISCLOSED" });
    expect(launchChair).not.toHaveBeenCalled();
    actionJournal.close();
  });

  it("rejects an open provider launch result before core outcome binding", async () => {
    const actionJournal = await journal();
    const boundary = claudeBoundary();
    const launchChair = vi.fn(async (input: { providerContractDigest: string }) => ({
      ...provedChairLaunch("claude-chair-session-open", input.providerContractDigest),
      unexpected: "must-not-cross-the-launch-boundary",
    }));
    Reflect.set(boundary, "launchChair", launchChair);
    const adapter = createClaudeAgentSdkAdapter({
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: {
        capability: "open-result-capability-canary",
        socketPath: "/private/open-result.sock",
      },
    });

    await expect(adapter.request("launch_chair", {
      schemaVersion: 1,
      actionId: "claude-chair-open-result",
      providerContractDigest: `sha256:${"0".repeat(64)}`,
      payload: {
        cwd: "/workspace/project",
        modelFamily: "anthropic",
        model: "claude-test",
        prompt: "reviewed work",
      },
    })).rejects.toMatchObject({
      code: "CHAIR_LAUNCH_FAILED",
      message: "chair launch provider handoff failed",
    });
    const persisted = await adapter.request("lookup_action", {
      actionId: "claude-chair-open-result",
    });
    expect(persisted).toMatchObject({ status: "ambiguous" });
    expect(persisted).not.toHaveProperty("result");
    actionJournal.close();
  });

  it("rejects Fabric continuity evidence bound to another provider contract", async () => {
    const actionJournal = await journal();
    const boundary = claudeBoundary();
    const launchChair = vi.fn(async () => provedChairLaunch(
      "claude-chair-wrong-contract",
      `sha256:${"3".repeat(64)}`,
    ));
    Reflect.set(boundary, "launchChair", launchChair);
    const adapter = createClaudeAgentSdkAdapter({
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: {
        capability: "wrong-contract-capability-canary",
        socketPath: "/private/wrong-contract.sock",
      },
    });

    await expect(adapter.request("launch_chair", {
      schemaVersion: 1,
      actionId: "claude-chair-wrong-contract",
      providerContractDigest: `sha256:${"4".repeat(64)}`,
      payload: {
        cwd: "/workspace/project",
        modelFamily: "anthropic",
        model: "claude-test",
        prompt: "reviewed work",
      },
    })).rejects.toMatchObject({ code: "CHAIR_LAUNCH_FAILED" });
    await expect(adapter.request("lookup_action", {
      actionId: "claude-chair-wrong-contract",
    })).resolves.toMatchObject({ status: "ambiguous", idempotencyProven: false });
    actionJournal.close();
  });

  it("redacts private handoff material from provider launch failures", async () => {
    const actionJournal = await journal();
    const boundary = claudeBoundary();
    const capability = "failure-capability-secret-canary";
    const socketPath = "/private/failure-socket-canary.sock";
    Reflect.set(boundary, "launchChair", vi.fn(async () => {
      throw new Error(`provider leaked ${capability} at ${socketPath}`);
    }));
    const adapter = createClaudeAgentSdkAdapter({
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: { capability, socketPath },
    });

    const error = await adapter.request("launch_chair", {
      schemaVersion: 1,
      actionId: "claude-chair-redacted-failure",
      providerContractDigest: `sha256:${"1".repeat(64)}`,
      payload: {
        cwd: "/workspace/project",
        modelFamily: "anthropic",
        model: "claude-test",
        prompt: "reviewed work",
      },
    }).catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      code: "CHAIR_LAUNCH_FAILED",
      message: "chair launch provider handoff failed",
      details: { actionId: "claude-chair-redacted-failure" },
    });
    expect(JSON.stringify(error)).not.toContain(capability);
    expect(JSON.stringify(error)).not.toContain(socketPath);
    expect(String(error)).not.toContain(capability);
    expect(String(error)).not.toContain(socketPath);
    const persisted = await adapter.request("lookup_action", {
      actionId: "claude-chair-redacted-failure",
    });
    expect(JSON.stringify(persisted)).not.toContain(capability);
    expect(JSON.stringify(persisted)).not.toContain(socketPath);
    actionJournal.close();
  });
});

describe("installed Claude chair launch boundary", () => {
  it("passes private Fabric access only through the Claude process environment", async () => {
    const actionJournal = await journal();
    const close = vi.fn();
    const queryFactory = vi.fn((_input: unknown) => ({
      close,
      async *[Symbol.asyncIterator]() {
        yield {
          type: "result",
          subtype: "success",
          session_id: "claude-chair-session-1",
          result: "chair ready",
          usage: {},
          total_cost_usd: 0,
        };
      },
    }));
    const providerContractDigest = `sha256:${"c".repeat(64)}`;
    const continuityProbe = vi.fn(async () => (
      provedChairLaunch("claude-chair-session-1", providerContractDigest)
    ));
    const boundary = Reflect.construct(InstalledClaudeAgentSdkBoundary, [{
      executable: "/trusted/claude",
      query: queryFactory,
      continuityProbe,
    }]);
    const capability = "claude-private-capability-canary";
    const socketPath = "/private/claude-fabric.sock";
    const adapter = createClaudeAgentSdkAdapter({
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: { capability, socketPath },
    });

    await expect(adapter.request("launch_chair", {
      schemaVersion: 1,
      actionId: "claude-launch-1",
      providerContractDigest,
      payload: {
        cwd: "/workspace/project",
        modelFamily: "anthropic",
        model: "claude-test",
        prompt: "continue reviewed work",
      },
    })).resolves.toEqual(provedChairLaunch("claude-chair-session-1", providerContractDigest));

    const queryInput = queryFactory.mock.calls[0]?.[0] as {
      prompt: string;
      options: Record<string, unknown> & { env?: Record<string, string> };
    };
    expect(queryInput.prompt).toBe("continue reviewed work");
    expect(queryInput.options.env).toMatchObject({
      AGENT_FABRIC_CAPABILITY: capability,
      AGENT_FABRIC_SOCKET_PATH: socketPath,
    });
    const { env: _privateEnvironment, ...publicOptions } = queryInput.options;
    expect(JSON.stringify({ prompt: queryInput.prompt, options: publicOptions })).not.toContain(capability);
    expect(JSON.stringify({ prompt: queryInput.prompt, options: publicOptions })).not.toContain(socketPath);
    expect(close).toHaveBeenCalledOnce();
    expect(continuityProbe).toHaveBeenCalledWith({
      capability,
      socketPath,
      resumeReference: "claude-chair-session-1",
      providerSessionGeneration: 1,
      providerContractDigest,
    });
    await expect(adapter.request("lookup_action", { actionId: "claude-launch-1" })).resolves.toMatchObject({
      status: "terminal",
      idempotencyProven: true,
    });
    actionJournal.close();
  });

  it("preserves safe resume evidence when the authenticated continuity probe fails", async () => {
    const actionJournal = await journal();
    const capability = "claude-probe-failure-capability-canary";
    const socketPath = "/private/claude-probe-failure.sock";
    const queryFactory = vi.fn((_input: unknown) => ({
      close: vi.fn(),
      async *[Symbol.asyncIterator]() {
        yield {
          type: "result",
          subtype: "success",
          session_id: "claude-chair-orphan-session",
          result: "bootstrap complete",
          usage: {},
          total_cost_usd: 0,
        };
      },
    }));
    const continuityProbe = vi.fn(async () => {
      throw new Error(`probe rejected ${capability} ${socketPath}`);
    });
    const boundary = Reflect.construct(InstalledClaudeAgentSdkBoundary, [{
      query: queryFactory,
      continuityProbe,
    }]);
    const adapter = createClaudeAgentSdkAdapter({
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: { capability, socketPath },
    });
    const providerContractDigest = `sha256:${"5".repeat(64)}`;

    const error = await adapter.request("launch_chair", {
      schemaVersion: 1,
      actionId: "claude-launch-probe-failure",
      providerContractDigest,
      payload: {
        cwd: "/workspace/project",
        modelFamily: "anthropic",
        model: "claude-test",
        prompt: "begin reviewed coordination",
      },
    }).catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      code: "CHAIR_LAUNCH_FAILED",
      message: "chair launch provider handoff failed",
    });
    expect(String(error)).not.toContain(capability);
    expect(String(error)).not.toContain(socketPath);
    await expect(adapter.request("lookup_action", {
      actionId: "claude-launch-probe-failure",
    })).resolves.toMatchObject({
      status: "ambiguous",
      history: ["prepared", "dispatched", "accepted", "ambiguous"],
      effectCount: 1,
      idempotencyProven: false,
      result: {
        kind: "continuity-unproven",
        providerContractDigest,
        resumeReference: "claude-chair-orphan-session",
        providerSessionGeneration: 1,
      },
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

describe("installed Codex chair launch boundary", () => {
  it("starts and completes the initial Codex chair turn with private Fabric environment", async () => {
    const actionJournal = await journal();
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const connection = {
      initialize: vi.fn(async () => undefined),
      request: vi.fn(async (method: string, params: Record<string, unknown>) => {
        requests.push({ method, params });
        if (method === "thread/start") return { thread: { id: "codex-chair-thread-1" } };
        if (method === "turn/start") return { turn: { id: "codex-chair-turn-1", status: "inProgress" } };
        return {
          thread: {
            id: "codex-chair-thread-1",
            turns: [{
              id: "codex-chair-turn-1",
              status: "completed",
              items: [{ type: "agentMessage", text: "chair bootstrap complete" }],
            }],
          },
        };
      }),
      close: vi.fn(async () => undefined),
      waitForNotification: vi.fn(async () => ({
        threadId: "codex-chair-thread-1",
        turn: { id: "codex-chair-turn-1", status: "completed" },
      })),
    };
    const connectionFactory = vi.fn(() => connection);
    const providerContractDigest = `sha256:${"d".repeat(64)}`;
    const continuityProbe = vi.fn(async () => (
      provedChairLaunch("codex-chair-thread-1", providerContractDigest)
    ));
    const boundary = Reflect.construct(InstalledCodexAppServerBoundary, [connectionFactory, continuityProbe]);
    const capability = "codex-private-capability-canary";
    const socketPath = "/private/codex-fabric.sock";
    const adapter = createCodexAppServerAdapter({
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: { capability, socketPath },
    });

    await expect(adapter.request("launch_chair", {
      schemaVersion: 1,
      actionId: "codex-launch-1",
      providerContractDigest,
      payload: {
        cwd: "/workspace/project",
        modelFamily: "openai",
        model: "gpt-test",
        prompt: "begin chair coordination",
        ephemeral: false,
      },
    })).resolves.toEqual(provedChairLaunch("codex-chair-thread-1", providerContractDigest));

    expect(connectionFactory).toHaveBeenCalledWith({
      AGENT_FABRIC_CAPABILITY: capability,
      AGENT_FABRIC_SOCKET_PATH: socketPath,
    });
    expect(requests).toEqual([
      {
        method: "thread/start",
        params: {
          cwd: "/workspace/project",
          model: "gpt-test",
          ephemeral: false,
          sandbox: "read-only",
          approvalPolicy: "never",
        },
      },
      {
        method: "turn/start",
        params: {
          threadId: "codex-chair-thread-1",
          input: [{ type: "text", text: "begin chair coordination" }],
          model: "gpt-test",
        },
      },
      {
        method: "thread/read",
        params: { threadId: "codex-chair-thread-1", includeTurns: true },
      },
    ]);
    expect(JSON.stringify(requests)).not.toContain(capability);
    expect(JSON.stringify(requests)).not.toContain(socketPath);
    expect(connectionFactory).toHaveBeenCalledOnce();
    expect(connection.close).not.toHaveBeenCalled();
    expect(continuityProbe).toHaveBeenCalledWith({
      capability,
      socketPath,
      resumeReference: "codex-chair-thread-1",
      providerSessionGeneration: 1,
      providerContractDigest,
    });
    await expect(adapter.request("lookup_action", { actionId: "codex-launch-1" })).resolves.toMatchObject({
      status: "terminal",
      idempotencyProven: true,
    });
    await boundary.closeAll();
    expect(connection.close).toHaveBeenCalledOnce();

    const failingProbe = vi.fn(async () => {
      throw new Error("continuity unavailable");
    });
    const failingBoundary = Reflect.construct(InstalledCodexAppServerBoundary, [connectionFactory, failingProbe]);
    const failingLaunch: unknown = Reflect.get(failingBoundary, "launchChair");
    await expect(Reflect.apply(
      failingLaunch as (...arguments_: unknown[]) => unknown,
      failingBoundary,
      [{
        actionId: "codex-launch-probe-failure",
        providerContractDigest,
        payload: {
          cwd: "/workspace/project",
          modelFamily: "openai",
          model: "gpt-test",
          prompt: "begin chair coordination",
          ephemeral: false,
        },
        environment: {
          AGENT_FABRIC_CAPABILITY: capability,
          AGENT_FABRIC_SOCKET_PATH: socketPath,
        },
      }],
    )).rejects.toMatchObject({
      code: "CHAIR_CONTINUITY_UNPROVEN",
      details: {
        kind: "continuity-unproven",
        providerContractDigest,
        resumeReference: "codex-chair-thread-1",
        providerSessionGeneration: 1,
      },
    });
    expect(connection.close).toHaveBeenCalledTimes(2);
    actionJournal.close();
  });
});

describe("Codex chair launch contract", () => {
  it("advertises and enforces a closed public payload before launch I/O", async () => {
    const actionJournal = await journal();
    const boundary = codexBoundary();
    const launchChair = vi.fn(async (input: { providerContractDigest: string }) => (
      provedChairLaunch("codex-chair-contract-thread", input.providerContractDigest)
    ));
    Reflect.set(boundary, "launchChair", launchChair);
    const adapter = createCodexAppServerAdapter({
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: {
        capability: "codex-contract-capability-canary",
        socketPath: "/private/codex-contract.sock",
      },
    });
    const request = {
      schemaVersion: 1,
      providerContractDigest: `sha256:${"2".repeat(64)}`,
      payload: {
        cwd: "/workspace/project",
        modelFamily: "openai",
        model: "gpt-test",
        prompt: "begin reviewed coordination",
      },
    };

    await expect(adapter.request("capabilities", {})).resolves.toMatchObject({
      chairLaunch: {
        inputSchemaId: "codex-app-server.chair-launch.v1",
        noEffectProofSchemas: {},
        publicPayloadSchema: {
          additionalProperties: false,
          required: ["cwd", "modelFamily", "model", "prompt"],
          properties: {
            cwd: { pattern: "^/" },
            modelFamily: { const: "openai" },
            ephemeral: { const: false },
          },
        },
      },
    });
    await expect(adapter.request("launch_chair", {
      ...request,
      actionId: "codex-chair-missing-prompt",
      payload: { cwd: "/workspace/project", modelFamily: "openai", model: "gpt-test" },
    })).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    await expect(adapter.request("launch_chair", {
      ...request,
      actionId: "codex-chair-public-environment",
      payload: { ...request.payload, environment: { inherit: true } },
    })).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    await expect(adapter.request("launch_chair", {
      ...request,
      actionId: "codex-chair-provider-override",
      payload: { ...request.payload, modelProvider: "unreviewed-provider" },
    })).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    await expect(adapter.request("launch_chair", {
      ...request,
      actionId: "codex-chair-ephemeral",
      payload: { ...request.payload, ephemeral: true },
    })).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    await expect(adapter.request("launch_chair", {
      ...request,
      actionId: "codex-chair-wrong-family",
      payload: { ...request.payload, modelFamily: "anthropic" },
    })).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    expect(launchChair).not.toHaveBeenCalled();
    await expect(adapter.request("launch_chair", {
      ...request,
      actionId: "codex-chair-valid-contract",
    })).resolves.toEqual(provedChairLaunch(
      "codex-chair-contract-thread",
      request.providerContractDigest,
    ));
    expect(launchChair).toHaveBeenCalledOnce();
    actionJournal.close();
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

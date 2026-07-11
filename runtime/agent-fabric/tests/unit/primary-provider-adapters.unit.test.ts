import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Socket } from "node:net";
import { createInterface } from "node:readline";

import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import {
  claudeReadOnlyOptions,
  createClaudeChairMcpBridge,
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
import { createChairLaunchFabricBridge } from "../../src/adapters/providers/chair-launch-continuity.ts";
import { SqliteAdapterActionJournal } from "../../src/adapters/providers/journal.ts";
import * as providerTypes from "../../src/adapters/providers/types.ts";
import {
  chairLaunchAttestationDigest,
  chairLaunchChallengeDigest,
} from "../../src/adapters/providers/types.ts";

const ATTESTATION_CHALLENGE = "ab".repeat(32);
const ATTESTATION_CHALLENGE_DIGEST = chairLaunchChallengeDigest(ATTESTATION_CHALLENGE);

const temporaryDirectories: string[] = [];
const temporaryClosures: Array<() => Promise<void>> = [];

async function journal(): Promise<SqliteAdapterActionJournal> {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-provider-adapter-"));
  temporaryDirectories.push(directory);
  return new SqliteAdapterActionJournal(join(directory, "actions.sqlite3"));
}

async function fabricSocketFixture(): Promise<{
  socketPath: string;
  rpcCall: ReturnType<typeof vi.fn>;
  drop(): Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-chair-socket-"));
  temporaryDirectories.push(directory);
  const socketPath = join(directory, "fabric.sock");
  const sockets = new Set<Socket>();
  const rpcCall = vi.fn();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    const lines = createInterface({ input: socket, crlfDelay: Infinity });
    lines.on("line", (line) => {
      const request = JSON.parse(line) as { id: string; method: string };
      if (request.method === "initialize") {
        socket.write(`${JSON.stringify({
          id: request.id,
          result: {
            protocolVersion: 1,
            daemonVersion: "0.1.0",
            capabilities: ["rpc"],
            activeAdapters: [],
            limits: {
              maximumFrameBytes: 1_048_576,
              maximumConnections: 32,
              maximumInFlightPerConnection: 16,
              maximumTotalInFlight: 128,
              maximumClientPending: 32,
              maximumAdapterInFlight: 8,
              idleTimeoutMs: 300_000,
            },
          },
        })}\n`);
        return;
      }
      rpcCall(request.method);
      socket.write(`${JSON.stringify({
        id: request.id,
        result: { contiguousWatermark: 0, acknowledgedAboveWatermark: [] },
      })}\n`);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  const drop = async (): Promise<void> => {
    await Promise.all([...sockets].map(async (socket) => await new Promise<void>((resolve) => {
      socket.once("close", resolve);
      socket.destroy();
    })));
  };
  temporaryClosures.push(async () => {
    await drop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { socketPath, rpcCall, drop };
}

function provedChairLaunch(
  resumeReference: string,
  providerContractDigest: string,
  providerAdapterId: string,
  providerActionId: string,
  challengeDigest = ATTESTATION_CHALLENGE_DIGEST,
  providerInvocationRef = "provider-tool-call-1",
  providerTurnRef = "provider-turn-1",
  challengeResponse = ATTESTATION_CHALLENGE,
) {
  const unsigned = {
    schemaVersion: 1 as const,
    kind: "provider-session-fabric-attestation" as const,
    method: "provider-session-random-challenge-v1" as const,
    bridgeContract: "agent-fabric-session-bridge-v1" as const,
    providerAdapterId,
    providerActionId,
    providerContractDigest,
    providerSessionRef: resumeReference,
    providerSessionGeneration: 1,
    providerTurnRef,
    challengeResponse,
    challengeDigest,
    providerInvocationRef,
  };
  return {
    resumeReference,
    providerSessionGeneration: 1,
    fabricContinuity: {
      ...unsigned,
      attestationDigest: chairLaunchAttestationDigest(unsigned),
    },
  } as const;
}

afterEach(async () => {
  await Promise.allSettled(temporaryClosures.splice(0).map((close) => close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("private chair launch environment", () => {
  it("takes the complete handoff once and removes both values from the adapter process environment", () => {
    const takeChairLaunchHandoff: unknown = Reflect.get(providerTypes, "takeChairLaunchHandoff");
    expect(takeChairLaunchHandoff).toBeTypeOf("function");
    const environment: NodeJS.ProcessEnv = {
      AGENT_FABRIC_CAPABILITY: "environment-capability-canary",
      AGENT_FABRIC_SOCKET_PATH: "/private/environment-fabric.sock",
      AGENT_FABRIC_ATTESTATION_CHALLENGE: ATTESTATION_CHALLENGE,
      KEEP: "retained",
    };

    expect(Reflect.apply(
      takeChairLaunchHandoff as (...arguments_: unknown[]) => unknown,
      undefined,
      [environment],
    )).toEqual({
      capability: "environment-capability-canary",
      socketPath: "/private/environment-fabric.sock",
      attestationChallenge: ATTESTATION_CHALLENGE,
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
      AGENT_FABRIC_ATTESTATION_CHALLENGE: ATTESTATION_CHALLENGE,
    };

    expect(() => Reflect.apply(
      takeChairLaunchHandoff as (...arguments_: unknown[]) => unknown,
      undefined,
      [environment],
    )).toThrowError("chair launch private environment must contain a capability, 32-byte challenge and absolute socket path");
    expect(environment).toEqual({});
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
    hasLiveChairSession: vi.fn(() => true),
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
    hasLiveChairSession: vi.fn(() => true),
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
    const launchChair = vi.fn(async (input: { providerContractDigest: string; providerAdapterId: string; actionId: string }) => (
      provedChairLaunch("claude-chair-session-1", input.providerContractDigest, input.providerAdapterId, input.actionId)
    ));
    Reflect.set(boundary, "launchChair", launchChair);
    const capability = "chair-capability-secret-canary";
    const socketPath = "/private/agent-fabric.sock";
    const adapterOptions = {
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: { capability, socketPath, attestationChallenge: ATTESTATION_CHALLENGE },
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
          attestationChallenge: "AGENT_FABRIC_ATTESTATION_CHALLENGE",
        },
        noEffectProofSchemas: {},
        attestation: {
          method: "provider-session-random-challenge-v1",
          bridgeContract: "agent-fabric-session-bridge-v1",
          origin: "provider-session-tool-call",
          oneUse: true,
          bridgeLifetime: "provider-session",
          digestAlgorithm: "sha256",
          nativeAttribution: "claude-sdk-assistant-request-tool-use-v1",
        },
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
      provedChairLaunch("claude-chair-session-1", request.providerContractDigest, "claude-agent-sdk", request.actionId),
    );
    expect(launchChair).toHaveBeenCalledWith({
      actionId: "claude-chair-launch-1",
      providerAdapterId: "claude-agent-sdk",
      providerContractDigest: request.providerContractDigest,
      challengeDigest: ATTESTATION_CHALLENGE_DIGEST,
      payload: request.payload,
      environment: {
        AGENT_FABRIC_CAPABILITY: capability,
        AGENT_FABRIC_SOCKET_PATH: socketPath,
        AGENT_FABRIC_ATTESTATION_CHALLENGE: ATTESTATION_CHALLENGE,
      },
    });
    const persisted = await adapter.request("lookup_action", { actionId: request.actionId });
    expect(JSON.stringify(persisted)).not.toContain(capability);
    expect(JSON.stringify(persisted)).not.toContain(socketPath);
    await expect(adapter.request("launch_chair", request)).resolves.toEqual(
      provedChairLaunch("claude-chair-session-1", request.providerContractDigest, "claude-agent-sdk", request.actionId),
    );
    expect(launchChair).toHaveBeenCalledOnce();
    await adapter.request("release", {
      actionId: "claude-chair-release-1",
      payload: { resumeReference: "claude-chair-session-1" },
    });
    await expect(adapter.request("lookup_action", { actionId: request.actionId })).rejects.toMatchObject({
      code: "CHAIR_BRIDGE_LOST",
    });
    actionJournal.close();
  });

  it("does not recreate chair continuity from a durable result after wrapper restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-chair-journal-restart-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "actions.sqlite3");
    const request = {
      schemaVersion: 1,
      actionId: "claude-chair-restart-1",
      providerContractDigest: `sha256:${"b".repeat(64)}`,
      payload: {
        cwd: "/workspace/project",
        modelFamily: "anthropic",
        model: "claude-test",
        prompt: "start chair",
      },
    };
    const firstJournal = new SqliteAdapterActionJournal(path);
    const firstBoundary = claudeBoundary();
    Reflect.set(firstBoundary, "launchChair", vi.fn(async (input: {
      providerContractDigest: string;
      providerAdapterId: string;
      actionId: string;
    }) => provedChairLaunch(
      "claude-chair-restart-session",
      input.providerContractDigest,
      input.providerAdapterId,
      input.actionId,
    )));
    await createClaudeAgentSdkAdapter({
      boundary: firstBoundary,
      journal: firstJournal,
      chairLaunchHandoff: {
        capability: "chair-restart-capability-canary",
        socketPath: "/private/chair-restart.sock",
        attestationChallenge: ATTESTATION_CHALLENGE,
      },
    }).request("launch_chair", request);
    for (const journalFile of [path, `${path}-wal`, `${path}-shm`]) {
      expect((await stat(journalFile)).mode & 0o777).toBe(0o600);
    }
    firstJournal.close();

    const reopenedJournal = new SqliteAdapterActionJournal(path);
    const replacementBoundary = claudeBoundary();
    Reflect.set(replacementBoundary, "launchChair", vi.fn(async () => {
      throw new Error("must not relaunch");
    }));
    const replacement = createClaudeAgentSdkAdapter({ boundary: replacementBoundary, journal: reopenedJournal });
    await expect(replacement.request("lookup_action", { actionId: request.actionId })).rejects.toMatchObject({
      code: "CHAIR_BRIDGE_LOST",
    });
    await expect(replacement.request("launch_chair", request)).rejects.toMatchObject({
      code: "CHAIR_BRIDGE_LOST",
    });
    reopenedJournal.close();
  });

  it("rejects a changed chair-launch replay against the persisted public contract digest", async () => {
    const actionJournal = await journal();
    const boundary = claudeBoundary();
    const launchChair = vi.fn(async (input: { providerContractDigest: string; providerAdapterId: string; actionId: string }) => (
      provedChairLaunch("claude-chair-session-2", input.providerContractDigest, input.providerAdapterId, input.actionId)
    ));
    Reflect.set(boundary, "launchChair", launchChair);
    const adapterOptions = {
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: {
        capability: "changed-replay-capability-canary",
        socketPath: "/private/changed-replay.sock",
        attestationChallenge: ATTESTATION_CHALLENGE,
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
        attestationChallenge: ATTESTATION_CHALLENGE,
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
    const launchChair = vi.fn(async (input: { providerContractDigest: string; providerAdapterId: string; actionId: string }) => ({
      ...provedChairLaunch("claude-chair-session-open", input.providerContractDigest, input.providerAdapterId, input.actionId),
      unexpected: "must-not-cross-the-launch-boundary",
    }));
    Reflect.set(boundary, "launchChair", launchChair);
    const adapter = createClaudeAgentSdkAdapter({
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: {
        capability: "open-result-capability-canary",
        socketPath: "/private/open-result.sock",
        attestationChallenge: ATTESTATION_CHALLENGE,
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
      "claude-agent-sdk",
      "claude-chair-wrong-contract",
    ));
    Reflect.set(boundary, "launchChair", launchChair);
    const adapter = createClaudeAgentSdkAdapter({
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: {
        capability: "wrong-contract-capability-canary",
        socketPath: "/private/wrong-contract.sock",
        attestationChallenge: ATTESTATION_CHALLENGE,
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
      chairLaunchHandoff: { capability, socketPath, attestationChallenge: ATTESTATION_CHALLENGE },
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
  it("requires a provider MCP callback and reuses the retained bridge on a later turn", async () => {
    const actionJournal = await journal();
    const fabricServer = await fabricSocketFixture();
    const rpcCall = fabricServer.rpcCall;
    let bridge: Awaited<ReturnType<typeof createChairLaunchFabricBridge>> | undefined;
    let mcp: ReturnType<typeof createClaudeChairMcpBridge> | undefined;
    let queryCount = 0;
    const queryClose = vi.fn();
    let directMailboxError: unknown;
    let mismatchedMailboxError: unknown;
    let replayedMailboxError: unknown;
    const queryFactory = vi.fn((input: unknown) => {
      queryCount += 1;
      const thisQuery = queryCount;
      return {
        close: queryClose,
        async *[Symbol.asyncIterator]() {
          yield { type: "system", subtype: "init", session_id: "claude-chair-session-1" };
          if (mcp === undefined || bridge === undefined) throw new Error("MCP bridge missing");
          if (thisQuery === 1) {
            yield {
              type: "assistant",
              session_id: "claude-chair-session-1",
              uuid: "claude-message-1",
              request_id: "claude-turn-1",
              parent_tool_use_id: null,
              message: {
                content: [{
                  type: "tool_use",
                  name: mcp.attestationToolName,
                  id: "claude-tool-call-1",
                  input: { challengeResponse: bridge.challengeResponse },
                }],
              },
            };
            await mcp.attestationTool.handler({ challengeResponse: bridge.challengeResponse }, {});
          } else {
            directMailboxError = await mcp.mailboxTool.handler({}, {}).catch((error: unknown) => error);
            yield {
              type: "assistant",
              session_id: "claude-chair-session-1",
              uuid: "claude-message-mailbox-mismatch",
              request_id: "claude-turn-2",
              parent_tool_use_id: null,
              message: {
                content: [{
                  type: "tool_use",
                  name: mcp.mailboxToolName,
                  id: "claude-tool-mailbox-mismatch",
                  input: { unexpected: true },
                }],
              },
            };
            mismatchedMailboxError = await mcp.mailboxTool.handler({}, {}).catch((error: unknown) => error);
            yield {
              type: "assistant",
              session_id: "claude-chair-session-1",
              uuid: "claude-message-mailbox-1",
              request_id: "claude-turn-2",
              parent_tool_use_id: null,
              message: {
                content: [{
                  type: "tool_use",
                  name: mcp.mailboxToolName,
                  id: "claude-tool-mailbox-1",
                  input: {},
                }],
              },
            };
            await mcp.mailboxTool.handler({}, {});
            replayedMailboxError = await mcp.mailboxTool.handler({}, {}).catch((error: unknown) => error);
          }
          yield {
            type: "result",
            subtype: "success",
            session_id: "claude-chair-session-1",
            result: thisQuery === 1 ? "chair ready" : "later turn ready",
            usage: {},
            total_cost_usd: 0,
          };
        },
        input,
      };
    });
    const providerContractDigest = `sha256:${"c".repeat(64)}`;
    const mcpBridgeFactory = vi.fn((session: Parameters<typeof createClaudeChairMcpBridge>[0]) => {
      mcp = createClaudeChairMcpBridge(session);
      return mcp;
    });
    const boundary = Reflect.construct(InstalledClaudeAgentSdkBoundary, [{
      executable: "/trusted/claude",
      query: queryFactory,
      bridgeFactory: async (input: Parameters<typeof createChairLaunchFabricBridge>[0]) => {
        bridge = await createChairLaunchFabricBridge(input);
        return bridge;
      },
      mcpBridgeFactory,
    }]);
    const capability = "claude-private-capability-canary";
    const socketPath = fabricServer.socketPath;
    const adapter = createClaudeAgentSdkAdapter({
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: { capability, socketPath, attestationChallenge: ATTESTATION_CHALLENGE },
    });

    const launched = await adapter.request("launch_chair", {
      schemaVersion: 1,
      actionId: "claude-launch-1",
      providerContractDigest,
      payload: {
        cwd: "/workspace/project",
        modelFamily: "anthropic",
        model: "claude-test",
        prompt: "continue reviewed work",
      },
    });
    expect(launched).toEqual(provedChairLaunch(
      "claude-chair-session-1",
      providerContractDigest,
      "claude-agent-sdk",
      "claude-launch-1",
      bridge?.challengeDigest,
      "claude-tool-call-1",
      "claude-turn-1",
      bridge?.challengeResponse,
    ));
    expect(launched).toMatchObject({
      fabricContinuity: { challengeResponse: ATTESTATION_CHALLENGE },
    });

    const queryInput = queryFactory.mock.calls[0]?.[0] as {
      prompt: string;
      options: Record<string, unknown> & { env?: Record<string, string> };
    };
    expect(queryInput.prompt).toContain("challengeResponse");
    expect(queryInput.options.env).toBeUndefined();
    expect(queryInput.prompt).not.toContain(capability);
    expect(queryInput.prompt).not.toContain(socketPath);
    expect(rpcCall).toHaveBeenCalledOnce();
    await boundary.sendTurn({ resumeReference: "claude-chair-session-1", prompt: "later work" });
    expect(directMailboxError).toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    expect(mismatchedMailboxError).toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    expect(replayedMailboxError).toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    expect(rpcCall).toHaveBeenCalledTimes(2);
    expect(mcpBridgeFactory).toHaveBeenCalledOnce();
    expect(queryClose).toHaveBeenCalledTimes(2);
    await expect(adapter.request("lookup_action", { actionId: "claude-launch-1" })).resolves.toMatchObject({
      status: "terminal",
      idempotencyProven: true,
    });
    if (bridge === undefined) throw new Error("Claude bridge missing");
    await fabricServer.drop();
    await vi.waitFor(() => expect(bridge?.closed).toBe(true));
    await expect(adapter.request("lookup_action", { actionId: "claude-launch-1" })).rejects.toMatchObject({
      code: "CHAIR_BRIDGE_LOST",
    });
    await boundary.closeAll();
    actionJournal.close();
  });

  it("rejects an MCP handler call without a native provider tool event and preserves resume evidence", async () => {
    const actionJournal = await journal();
    const capability = "claude-probe-failure-capability-canary";
    const socketPath = "/private/claude-probe-failure.sock";
    let bridge: Awaited<ReturnType<typeof createChairLaunchFabricBridge>> | undefined;
    let mcp: ReturnType<typeof createClaudeChairMcpBridge> | undefined;
    let directInvocationError: unknown;
    let preAttestationMailboxError: unknown;
    const queryFactory = vi.fn((_input: unknown) => ({
      close: vi.fn(),
      async *[Symbol.asyncIterator]() {
        yield { type: "system", subtype: "init", session_id: "claude-chair-orphan-session" };
        if (bridge === undefined || mcp === undefined) throw new Error("test bridge missing");
        preAttestationMailboxError = await mcp.mailboxTool.handler({}, {}).catch((error: unknown) => error);
        directInvocationError = await mcp.attestationTool.handler({
          challengeResponse: bridge.challengeResponse,
        }, {}).catch((error: unknown) => error);
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
    const rpcClose = vi.fn(async () => undefined);
    const boundary = Reflect.construct(InstalledClaudeAgentSdkBoundary, [{
      query: queryFactory,
      bridgeFactory: async (input: Parameters<typeof createChairLaunchFabricBridge>[0]) => {
        bridge = await createChairLaunchFabricBridge(input, {
          connect: vi.fn(async () => ({
            call: vi.fn(async () => ({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] })),
            close: rpcClose,
          })),
        });
        return bridge;
      },
      mcpBridgeFactory: (session: Parameters<typeof createClaudeChairMcpBridge>[0]) => {
        mcp = createClaudeChairMcpBridge(session);
        return mcp;
      },
    }]);
    const adapter = createClaudeAgentSdkAdapter({
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: { capability, socketPath, attestationChallenge: ATTESTATION_CHALLENGE },
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
    expect(preAttestationMailboxError).toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    expect(directInvocationError).toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    expect(rpcClose).toHaveBeenCalledOnce();
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
  it("requires an attributed dynamic-tool callback and reuses it on a later turn", async () => {
    const actionJournal = await journal();
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const fabricServer = await fabricSocketFixture();
    const rpcCall = fabricServer.rpcCall;
    let bridge: Awaited<ReturnType<typeof createChairLaunchFabricBridge>> | undefined;
    let serverRequestHandler: ((params: Record<string, unknown>) => Promise<unknown>) | undefined;
    const providerServerRequestIds: number[] = [];
    let turnCount = 0;
    let currentTurnId = "";
    let connectionClosed = false;
    const connection = {
      get closed() {
        return connectionClosed;
      },
      initialize: vi.fn(async () => undefined),
      setServerRequestHandler: vi.fn((_method: string, handler: (params: Record<string, unknown>) => Promise<unknown>) => {
        serverRequestHandler = handler;
      }),
      request: vi.fn(async (method: string, params: Record<string, unknown>) => {
        requests.push({ method, params });
        if (method === "thread/start") return { thread: { id: "codex-chair-thread-1" } };
        if (method === "turn/start") {
          turnCount += 1;
          currentTurnId = `codex-chair-turn-${turnCount}`;
          return { turn: { id: currentTurnId, status: "inProgress" } };
        }
        return {
          thread: {
            id: "codex-chair-thread-1",
            turns: [{
              id: currentTurnId,
              status: "completed",
              items: [{ type: "agentMessage", text: "chair bootstrap complete" }],
            }],
          },
        };
      }),
      close: vi.fn(async () => {
        connectionClosed = true;
      }),
      waitForNotification: vi.fn(async () => {
        if (serverRequestHandler === undefined || bridge === undefined) throw new Error("dynamic tool handler missing");
        if (turnCount === 1) {
          await expect(serverRequestHandler({
            arguments: {},
            callId: "missing-challenge-call",
            threadId: "codex-chair-thread-1",
            tool: bridge.challengeToolName,
            turnId: currentTurnId,
          })).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
          await expect(serverRequestHandler({
            arguments: { challengeResponse: Buffer.alloc(32, 9).toString("hex") },
            callId: "wrong-challenge-call",
            threadId: "codex-chair-thread-1",
            tool: bridge.challengeToolName,
            turnId: currentTurnId,
          })).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
          await expect(serverRequestHandler({
            arguments: { challengeResponse: bridge.challengeResponse, extra: true },
            callId: "open-arguments-call",
            threadId: "codex-chair-thread-1",
            tool: bridge.challengeToolName,
            turnId: currentTurnId,
          })).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
          await serverRequestHandler({
            arguments: { challengeResponse: bridge.challengeResponse },
            callId: "codex-provider-tool-call-1",
            threadId: "codex-chair-thread-1",
            tool: bridge.challengeToolName,
            turnId: currentTurnId,
          });
        } else {
          const mailboxInvocation = {
            arguments: {},
            callId: "codex-provider-mailbox-call-1",
            threadId: "codex-chair-thread-1",
            tool: "fabric_get_mailbox_state",
            turnId: currentTurnId,
          };
          const invokeServerRequest = async (jsonRpcId: number): Promise<unknown> => {
            providerServerRequestIds.push(jsonRpcId);
            return await serverRequestHandler?.({ ...mailboxInvocation });
          };
          await invokeServerRequest(901);
          await expect(invokeServerRequest(902)).rejects.toMatchObject({
            code: "CHAIR_CONTINUITY_UNPROVEN",
          });
        }
        return {
          threadId: "codex-chair-thread-1",
          turn: { id: currentTurnId, status: "completed" },
        };
      }),
    };
    const connectionFactory = vi.fn(() => connection);
    const providerContractDigest = `sha256:${"d".repeat(64)}`;
    const bridgeFactory = async (input: Parameters<typeof createChairLaunchFabricBridge>[0]) => {
      bridge = await createChairLaunchFabricBridge(input);
      return bridge;
    };
    const boundary = Reflect.construct(InstalledCodexAppServerBoundary, [connectionFactory, bridgeFactory]);
    const capability = "codex-private-capability-canary";
    const socketPath = fabricServer.socketPath;
    const adapter = createCodexAppServerAdapter({
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: { capability, socketPath, attestationChallenge: ATTESTATION_CHALLENGE },
    });

    const launched = await adapter.request("launch_chair", {
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
    });
    expect(launched).toEqual(provedChairLaunch(
      "codex-chair-thread-1",
      providerContractDigest,
      "codex-app-server",
      "codex-launch-1",
      bridge?.challengeDigest,
      "codex-provider-tool-call-1",
      "codex-chair-turn-1",
      bridge?.challengeResponse,
    ));

    expect(connectionFactory).toHaveBeenCalledWith(undefined);
    expect(requests[0]).toMatchObject({
      method: "thread/start",
      params: { dynamicTools: expect.arrayContaining([
        expect.objectContaining({
          name: bridge?.challengeToolName,
          inputSchema: expect.objectContaining({ required: ["challengeResponse"] }),
        }),
        expect.objectContaining({ name: "fabric_get_mailbox_state" }),
      ]) },
    });
    expect(requests[1]).toMatchObject({
      method: "turn/start",
      params: { threadId: "codex-chair-thread-1", model: "gpt-test" },
    });
    expect(JSON.stringify(requests)).not.toContain(capability);
    expect(JSON.stringify(requests)).not.toContain(socketPath);
    expect(connectionFactory).toHaveBeenCalledOnce();
    expect(connection.close).not.toHaveBeenCalled();
    expect(rpcCall).toHaveBeenCalledOnce();
    await expect(serverRequestHandler?.({
      arguments: {},
      callId: "late-provider-call",
      threadId: "codex-chair-thread-1",
      tool: "fabric_get_mailbox_state",
      turnId: "codex-chair-turn-1",
    })).rejects.toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    await boundary.sendTurn({ resumeReference: "codex-chair-thread-1", prompt: "later work" });
    expect(rpcCall).toHaveBeenCalledTimes(2);
    expect(providerServerRequestIds).toEqual([901, 902]);
    expect(connectionFactory).toHaveBeenCalledOnce();
    await expect(adapter.request("lookup_action", { actionId: "codex-launch-1" })).resolves.toMatchObject({
      status: "terminal",
      idempotencyProven: true,
    });
    await fabricServer.drop();
    await vi.waitFor(() => expect(bridge?.closed).toBe(true));
    await expect(adapter.request("lookup_action", { actionId: "codex-launch-1" })).rejects.toMatchObject({
      code: "CHAIR_BRIDGE_LOST",
    });
    await boundary.closeAll();
    expect(connection.close).toHaveBeenCalledOnce();
    actionJournal.close();
  });

  it("fences a Codex chair before a 257th distinct native tuple and retains replay history", async () => {
    let bridge: Awaited<ReturnType<typeof createChairLaunchFabricBridge>> | undefined;
    let serverRequestHandler: ((params: Record<string, unknown>) => Promise<unknown>) | undefined;
    let turnCount = 0;
    let currentTurnId = "";
    let connectionClosed = false;
    let capacityError: unknown;
    let replayError: unknown;
    const rpcCall = vi.fn(async () => ({ contiguousWatermark: 0, acknowledgedAboveWatermark: [] }));
    const connection = {
      get closed() {
        return connectionClosed;
      },
      initialize: vi.fn(async () => undefined),
      setServerRequestHandler: vi.fn((_method: string, handler: (params: Record<string, unknown>) => Promise<unknown>) => {
        serverRequestHandler = handler;
      }),
      request: vi.fn(async (method: string) => {
        if (method === "thread/start") return { thread: { id: "codex-capacity-thread" } };
        if (method === "turn/start") {
          turnCount += 1;
          currentTurnId = `codex-capacity-turn-${turnCount}`;
          return { turn: { id: currentTurnId, status: "inProgress" } };
        }
        return {
          thread: {
            id: "codex-capacity-thread",
            turns: [{
              id: currentTurnId,
              status: "completed",
              items: [{ type: "agentMessage", text: "capacity turn" }],
            }],
          },
        };
      }),
      close: vi.fn(async () => {
        connectionClosed = true;
      }),
      waitForNotification: vi.fn(async () => {
        if (serverRequestHandler === undefined || bridge === undefined) throw new Error("capacity handler missing");
        if (turnCount === 1) {
          await serverRequestHandler({
            arguments: { challengeResponse: bridge.challengeResponse },
            callId: "capacity-attestation",
            threadId: "codex-capacity-thread",
            tool: bridge.challengeToolName,
            turnId: currentTurnId,
          });
          return {
            threadId: "codex-capacity-thread",
            turn: { id: currentTurnId, status: "completed" },
          };
        }
        for (let index = 0; index < 256; index += 1) {
          await serverRequestHandler({
            arguments: {},
            callId: `capacity-call-${index}`,
            threadId: "codex-capacity-thread",
            tool: "fabric_get_mailbox_state",
            turnId: currentTurnId,
          });
        }
        capacityError = await serverRequestHandler({
          arguments: {},
          callId: "capacity-call-256",
          threadId: "codex-capacity-thread",
          tool: "fabric_get_mailbox_state",
          turnId: currentTurnId,
        }).catch((error: unknown) => error);
        replayError = await serverRequestHandler({
          arguments: {},
          callId: "capacity-call-0",
          threadId: "codex-capacity-thread",
          tool: "fabric_get_mailbox_state",
          turnId: currentTurnId,
        }).catch((error: unknown) => error);
        throw new Error("capacity-fenced provider connection");
      }),
    };
    const boundary = Reflect.construct(InstalledCodexAppServerBoundary, [
      vi.fn(() => connection),
      async (input: Parameters<typeof createChairLaunchFabricBridge>[0]) => {
        bridge = await createChairLaunchFabricBridge(input, {
          connect: vi.fn(async () => ({
            call: rpcCall,
            close: vi.fn(async () => undefined),
          })),
        });
        return bridge;
      },
    ]);
    await boundary.launchChair({
      actionId: "codex-capacity-launch",
      providerAdapterId: "codex-app-server",
      providerContractDigest: `sha256:${"8".repeat(64)}`,
      challengeDigest: ATTESTATION_CHALLENGE_DIGEST,
      payload: {
        cwd: "/workspace/project",
        modelFamily: "openai",
        model: "gpt-test",
        prompt: "begin capacity test",
      },
      environment: {
        AGENT_FABRIC_CAPABILITY: "codex-capacity-capability",
        AGENT_FABRIC_SOCKET_PATH: "/private/codex-capacity.sock",
        AGENT_FABRIC_ATTESTATION_CHALLENGE: ATTESTATION_CHALLENGE,
      },
    });

    await expect(boundary.sendTurn({
      resumeReference: "codex-capacity-thread",
      prompt: "exercise native tuple capacity",
    })).rejects.toThrow("capacity-fenced provider connection");
    expect(capacityError).toMatchObject({ code: "CHAIR_BRIDGE_LOST" });
    expect(replayError).toMatchObject({ code: "CHAIR_CONTINUITY_UNPROVEN" });
    expect(rpcCall).toHaveBeenCalledTimes(257);
    expect(connectionClosed).toBe(true);
    expect(bridge?.closed).toBe(true);
    expect(boundary.hasLiveChairSession("codex-capacity-thread", 1)).toBe(false);
    await boundary.closeAll();
  });
});

describe("Codex chair launch contract", () => {
  it("advertises and enforces a closed public payload before launch I/O", async () => {
    const actionJournal = await journal();
    const boundary = codexBoundary();
    const launchChair = vi.fn(async (input: { providerContractDigest: string; providerAdapterId: string; actionId: string }) => (
      provedChairLaunch("codex-chair-contract-thread", input.providerContractDigest, input.providerAdapterId, input.actionId)
    ));
    Reflect.set(boundary, "launchChair", launchChair);
    const adapter = createCodexAppServerAdapter({
      boundary,
      journal: actionJournal,
      chairLaunchHandoff: {
        capability: "codex-contract-capability-canary",
        socketPath: "/private/codex-contract.sock",
        attestationChallenge: ATTESTATION_CHALLENGE,
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
      "codex-app-server",
      "codex-chair-valid-contract",
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

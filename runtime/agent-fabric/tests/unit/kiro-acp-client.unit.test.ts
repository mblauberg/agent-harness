import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  KiroAcpStdioClient,
  type KiroAcpClientOptions,
} from "../../src/adapters/providers/optional/kiro-acp-client.ts";
import {
  createKiroAcpAdapter,
  createKiroAcpBoundary,
  type KiroAcpClient,
} from "../../src/adapters/providers/optional/kiro-acp.ts";
import { SqliteAdapterActionJournal } from "../../src/adapters/providers/journal.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(scenario = "happy", overrides: Partial<KiroAcpClientOptions> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "kiro-acp-client-"));
  temporaryDirectories.push(directory);
  const transcript = join(directory, "transcript.jsonl");
  const source = fileURLToPath(new URL("../support/kiro-acp-fake.ts", import.meta.url));
  const loader = fileURLToPath(import.meta.resolve("tsx"));
  const client = new KiroAcpStdioClient({
    executable: process.execPath,
    args: ["--import", loader, source, scenario, transcript],
    cwd: directory,
    model: "qwen3-coder",
    requestTimeoutMs: 1_000,
    closeTimeoutMs: 200,
    ...overrides,
  });
  return { client, directory, transcript };
}

describe("Kiro ACP stdio client", () => {
  it("negotiates ACP v1, creates a session with an absolute cwd, streams bounded text, and closes it", async () => {
    const { client, directory, transcript } = await fixture();
    await client.start();
    await expect(client.newSession(directory)).resolves.toEqual({ sessionId: "kiro-session-1" });
    await expect(client.prompt("kiro-session-1", "bounded task")).resolves.toEqual({
      stopReason: "end_turn",
      text: "bounded response",
    });
    await client.closeSession("kiro-session-1");
    await client.stop();

    const records = (await readFile(transcript, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        direction: "in",
        value: expect.objectContaining({
          jsonrpc: "2.0",
          method: "initialize",
          params: expect.objectContaining({
            protocolVersion: 1,
            clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
          }),
        }),
      }),
      expect.objectContaining({
        direction: "in",
        value: expect.objectContaining({ method: "session/new", params: { cwd: directory, mcpServers: [] } }),
      }),
      expect.objectContaining({
        direction: "in",
        value: expect.objectContaining({ method: "session/close", params: { sessionId: "kiro-session-1" } }),
      }),
    ]));
  });

  it("fails closed when the agent negotiates an unsupported protocol", async () => {
    const { client } = await fixture("protocol-mismatch");
    await expect(client.start()).rejects.toMatchObject({ code: "PROVIDER_PROTOCOL_MISMATCH" });
    await client.stop();
  });

  it("terminates the provider when streamed output exceeds the configured bound", async () => {
    const { client, directory } = await fixture("oversized-output", { maximumOutputBytes: 128 });
    await client.start();
    await client.newSession(directory);
    await expect(client.prompt("kiro-session-1", "too much")).rejects.toMatchObject({ code: "PROVIDER_OUTPUT_LIMIT" });
    await client.stop();
  });

  it.each([
    ["read-permission", "permission:allow"],
    ["edit-permission", "permission:reject"],
    ["outside-read-permission", "permission:reject"],
  ])("applies the read-only permission policy for %s", async (scenario, expected) => {
    const { client, directory } = await fixture(scenario);
    await client.start();
    await client.newSession(directory);
    await expect(client.prompt("kiro-session-1", "use a tool")).resolves.toMatchObject({ text: expected });
    await client.stop();
  });

  it("uses session/load for stable resume and rejects relative working directories", async () => {
    const { client, directory, transcript } = await fixture();
    await client.start();
    await expect(client.newSession("relative/path")).rejects.toMatchObject({ code: "PROVIDER_CWD_INVALID" });
    await expect(client.loadSession("existing-session", directory)).resolves.toEqual({ sessionId: "existing-session" });
    await client.stop();
    expect(await readFile(transcript, "utf8")).toContain('"method":"session/load"');
  });
});

describe("Kiro adapter model policy", () => {
  it("allows explicit Kiro open-weight models without exact-name locks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kiro-acp-policy-"));
    temporaryDirectories.push(directory);
    const journal = new SqliteAdapterActionJournal(join(directory, "actions.sqlite3"));
    const boundary = {
      status: async () => ({ healthy: true }),
      spawn: async () => ({ resumeReference: "session-1" }),
      attach: async ({ resumeReference }: { resumeReference: string }) => ({ resumeReference }),
      sendTurn: async () => ({ resumeReference: "session-1" }),
      interrupt: async () => ({ interrupted: true }),
      release: async () => ({ released: true }),
    };
    const adapter = createKiroAcpAdapter({ boundary, journal });
    await expect(adapter.request("spawn", {
      actionId: "allowed",
      payload: { model: "qwen3-coder", modelFamily: "open-weight" },
    })).resolves.toMatchObject({ resumeReference: "session-1" });
    await expect(adapter.request("spawn", {
      actionId: "allowed-future",
      payload: { model: "qwen-future-coder", modelFamily: "open-weight" },
    })).resolves.toMatchObject({ resumeReference: "session-1" });
    await expect(adapter.request("spawn", {
      actionId: "forbidden",
      payload: { model: "llama-4", modelFamily: "open-weight" },
    })).rejects.toMatchObject({ code: "ADAPTER_MODEL_FORBIDDEN" });
    journal.close();
  });
});

describe("Kiro ACP managed session boundary", () => {
  it("binds spawn, stable resume, turns, and release to one admitted session", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kiro-acp-boundary-"));
    temporaryDirectories.push(directory);
    const client: KiroAcpClient = {
      start: async () => undefined,
      newSession: async () => ({ sessionId: "kiro-session-1" }),
      loadSession: async (sessionId) => ({ sessionId }),
      prompt: async () => ({ stopReason: "end_turn", text: "done" }),
      closeSession: async () => undefined,
      stop: async () => undefined,
    };
    const created: Array<{ model?: string; cwd: string }> = [];
    const boundary = createKiroAcpBoundary({
      clientFactory: (options) => {
        created.push(options);
        return client;
      },
    });

    await expect(boundary.spawn({ cwd: directory, model: "qwen3-coder" })).resolves.toEqual({
      resumeReference: "kiro-session-1",
      sessionId: "kiro-session-1",
    });
    await expect(boundary.sendTurn({
      cwd: directory,
      resumeReference: "kiro-session-1",
      model: "qwen3-coder",
      prompt: "bounded task",
    })).resolves.toEqual({
      resumeReference: "kiro-session-1",
      sessionId: "kiro-session-1",
      stopReason: "end_turn",
      text: "done",
    });
    await expect(boundary.release({ resumeReference: "kiro-session-1" })).resolves.toEqual({
      released: true,
      deleted: false,
    });
    expect(created).toEqual([{ model: "qwen3-coder", cwd: directory }]);
  });

  it("manages two sessions independently and reports unmanaged sessions unhealthy", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kiro-acp-multi-session-"));
    temporaryDirectories.push(directory);
    let sequence = 0;
    const stopped: string[] = [];
    const boundary = createKiroAcpBoundary({
      clientFactory: () => {
        const sessionId = `kiro-session-${String(++sequence)}`;
        return {
          start: async () => undefined,
          newSession: async () => ({ sessionId }),
          loadSession: async (loadedSessionId) => ({ sessionId: loadedSessionId }),
          prompt: async () => ({ stopReason: "end_turn", text: sessionId }),
          closeSession: async () => undefined,
          stop: async () => { stopped.push(sessionId); },
        } satisfies KiroAcpClient;
      },
    });

    await expect(boundary.spawn({ cwd: directory, model: "qwen3-coder" })).resolves.toMatchObject({
      resumeReference: "kiro-session-1",
    });
    await expect(boundary.spawn({ cwd: directory, model: "glm-5" })).resolves.toMatchObject({
      resumeReference: "kiro-session-2",
    });
    await expect(boundary.status({ resumeReference: "kiro-session-1" })).resolves.toEqual({
      healthy: true,
      matches: true,
      resumeReference: "kiro-session-1",
    });
    await expect(boundary.status({ resumeReference: "lost-after-restart" })).resolves.toEqual({
      healthy: false,
      matches: false,
      resumeReference: "lost-after-restart",
    });
    await expect(boundary.sendTurn({
      cwd: directory,
      resumeReference: "kiro-session-1",
      model: "qwen3-coder",
      prompt: "first",
    })).resolves.toMatchObject({ resumeReference: "kiro-session-1", text: "kiro-session-1" });
    await expect(boundary.sendTurn({
      cwd: directory,
      resumeReference: "kiro-session-2",
      model: "glm-5",
      prompt: "second",
    })).resolves.toMatchObject({ resumeReference: "kiro-session-2", text: "kiro-session-2" });
    await boundary.release({ resumeReference: "kiro-session-1" });
    await expect(boundary.status({ resumeReference: "kiro-session-2" })).resolves.toMatchObject({ healthy: true });
    expect(stopped).toEqual(["kiro-session-1"]);
    await boundary.shutdown();
    expect(stopped).toEqual(["kiro-session-1", "kiro-session-2"]);
  });

  it("does not advertise or execute attach without verified model lineage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kiro-acp-no-attach-"));
    temporaryDirectories.push(directory);
    const journal = new SqliteAdapterActionJournal(join(directory, "journal.sqlite3"));
    const boundary = createKiroAcpBoundary({
      clientFactory: () => { throw new Error("attach must not start a provider"); },
    });
    const adapter = createKiroAcpAdapter({ boundary, journal });
    await expect(adapter.request("capabilities", {})).resolves.toMatchObject({
      operations: expect.not.arrayContaining(["attach"]),
    });
    await expect(adapter.request("attach", {
      actionId: "kiro:attach:disabled",
      payload: { cwd: directory, resumeReference: "existing-session" },
    })).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    journal.close();
  });
});

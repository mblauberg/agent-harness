import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgyAdapter, type AgyBoundary } from "../../src/adapters/providers/optional/agy.ts";
import {
  createCursorAgentAdapter,
  type CursorAgentBoundary,
} from "../../src/adapters/providers/optional/cursor-agent.ts";
import { createKiroAcpAdapter, type KiroAcpBoundary } from "../../src/adapters/providers/optional/kiro-acp.ts";
import {
  createPiRpcAdapter,
  createManagedPiRpcBoundary,
  createPiRpcBoundary,
  type PiRpcBoundary,
  type PiRpcClient,
} from "../../src/adapters/providers/optional/pi-rpc.ts";
import { SqliteAdapterActionJournal } from "../../src/adapters/providers/journal.ts";
import { serveAdapter } from "../../src/adapters/providers/server.ts";

const temporaryDirectories: string[] = [];

async function journal(): Promise<SqliteAdapterActionJournal> {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-optional-provider-"));
  temporaryDirectories.push(directory);
  return new SqliteAdapterActionJournal(join(directory, "actions.sqlite3"));
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function boundary(): PiRpcBoundary & AgyBoundary & CursorAgentBoundary & KiroAcpBoundary {
  return {
    status: vi.fn(async () => ({ healthy: true })),
    spawn: vi.fn(async () => ({ resumeReference: "session-1" })),
    attach: vi.fn(async ({ resumeReference }) => ({ resumeReference })),
    sendTurn: vi.fn(async () => ({ resumeReference: "session-1", result: "done" })),
    steer: vi.fn(async () => ({ steered: true })),
    interrupt: vi.fn(async () => ({ interrupted: true })),
    compact: vi.fn(async () => ({ compacted: true })),
    release: vi.fn(async () => ({ released: true, deleted: false })),
  };
}

describe("optional production provider wrappers", () => {
  it("starts Pi per admitted cwd and rejects providers outside the trusted allow-list", async () => {
    const clients: Array<PiRpcClient & { start(): Promise<void> }> = [];
    const createClient = vi.fn((_cwd: string) => {
      const id = clients.length + 1;
      const client: PiRpcClient & { start(): Promise<void> } = {
        start: vi.fn(async () => undefined),
        getState: vi.fn(async () => ({ sessionId: `pi-${String(id)}`, sessionFile: `/sessions/pi-${String(id)}.jsonl`, isStreaming: false })),
        newSession: vi.fn(async () => ({ cancelled: false })),
        setModel: vi.fn(async () => ({})),
        switchSession: vi.fn(async () => ({ cancelled: false })),
        promptAndWait: vi.fn(async () => [{ type: "agent_end" }]),
        getLastAssistantText: vi.fn(async () => "done"),
        steer: vi.fn(async () => undefined),
        abort: vi.fn(async () => undefined),
        compact: vi.fn(async () => ({})),
        stop: vi.fn(async () => undefined),
      };
      clients.push(client);
      return client;
    });
    const provider = createManagedPiRpcBoundary({ createClient, allowedProviders: ["openrouter"] });

    await expect(provider.spawn({ cwd: "/workspace/a", provider: "openrouter", model: "qwen3-coder" }))
      .resolves.toMatchObject({ resumeReference: "/sessions/pi-1.jsonl" });
    expect(createClient).toHaveBeenCalledWith("/workspace/a");
    await expect(provider.sendTurn({ cwd: "/workspace/a", resumeReference: "/sessions/pi-1.jsonl", prompt: "read only" }))
      .resolves.toMatchObject({ text: "done" });
    expect(createClient).toHaveBeenCalledTimes(1);

    await expect(provider.spawn({ cwd: "/workspace/b", provider: "untrusted", model: "qwen3-coder" }))
      .rejects.toMatchObject({ code: "MODEL_NOT_ALLOWED" });
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("serves the same correlated NDJSON contract as primary adapters", async () => {
    const actionJournal = await journal();
    const adapter = createAgyAdapter({ boundary: boundary(), journal: actionJournal });
    let output = "";
    await serveAdapter(adapter, {
      input: Readable.from([
        `${JSON.stringify({ id: "caps-1", method: "capabilities", params: {} })}\n`,
        `${JSON.stringify({ id: "bad-1", method: "steer", params: {} })}\n`,
      ]),
      output: new Writable({
        write(chunk, _encoding, callback) {
          output += chunk.toString();
          callback();
        },
      }),
    });
    const envelopes: unknown[] = output.trim().split("\n").map((line) => JSON.parse(line));
    expect(envelopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "caps-1", result: expect.objectContaining({ adapterId: "agy" }) }),
        expect.objectContaining({ id: "bad-1", error: expect.objectContaining({ code: "CAPABILITY_UNAVAILABLE" }) }),
      ]),
    );
    actionJournal.close();
  });

  it("maps the locally typed Pi RPC client into managed session operations", async () => {
    const client: PiRpcClient = {
      getState: vi.fn(async () => ({ sessionId: "pi-session-1", sessionFile: "/sessions/pi-1.jsonl", isStreaming: false })),
      newSession: vi.fn(async () => ({ cancelled: false })),
      setModel: vi.fn(async () => ({ provider: "openrouter", id: "qwen3-coder" })),
      switchSession: vi.fn(async () => ({ cancelled: false })),
      promptAndWait: vi.fn(async () => [{ type: "agent_end" }]),
      getLastAssistantText: vi.fn(async () => "done"),
      steer: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
      compact: vi.fn(async () => ({ summary: "compacted" })),
      stop: vi.fn(async () => undefined),
    };
    const provider = createPiRpcBoundary({ client, turnTimeoutMs: 45_000 });

    await expect(
      provider.spawn({ provider: "openrouter", model: "qwen3-coder" }),
    ).resolves.toMatchObject({ resumeReference: "/sessions/pi-1.jsonl", sessionId: "pi-session-1" });
    await expect(provider.sendTurn({ prompt: "bounded task" })).resolves.toMatchObject({
      resumeReference: "/sessions/pi-1.jsonl",
      text: "done",
      eventCount: 1,
    });
    expect(client.setModel).toHaveBeenCalledWith("openrouter", "qwen3-coder");
    expect(client.promptAndWait).toHaveBeenCalledWith("bounded task", undefined, 45_000);
  });

  it("routes Pi through the durable contract and accepts only explicit generic/open selections", async () => {
    const actionJournal = await journal();
    const provider = boundary();
    const adapter = createPiRpcAdapter({ boundary: provider, journal: actionJournal });

    await expect(
      adapter.request("spawn", {
        actionId: "pi-spawn-1",
        payload: { model: "qwen3-coder", modelFamily: "open-weight", provider: "openrouter" },
      }),
    ).resolves.toEqual({ resumeReference: "session-1" });
    await expect(
      adapter.request("spawn", {
        actionId: "pi-spawn-1",
        payload: { model: "qwen3-coder", modelFamily: "open-weight", provider: "openrouter" },
      }),
    ).resolves.toEqual({ resumeReference: "session-1" });
    expect(provider.spawn).toHaveBeenCalledTimes(1);

    await expect(
      adapter.request("spawn", {
        actionId: "pi-wrong-family",
        payload: { model: "gemini-test", modelFamily: "google", provider: "google" },
      }),
    ).rejects.toMatchObject({ code: "ADAPTER_FAMILY_FORBIDDEN" });
    await expect(adapter.request("capabilities", {})).resolves.toMatchObject({
      adapterId: "pi-rpc",
      operations: expect.arrayContaining(["spawn", "attach", "send_turn", "steer", "compact"]),
      allowedModelFamilies: ["generic-open", "open-weight"],
      requiresExplicitModel: true,
    });
    actionJournal.close();
  });

  it("keeps Agy Google-only and fails closed for unsupported session controls", async () => {
    const actionJournal = await journal();
    const provider = boundary();
    const adapter = createAgyAdapter({ boundary: provider, journal: actionJournal });

    await expect(
      adapter.request("spawn", {
        actionId: "agy-spawn-1",
        payload: { model: "Gemini 3.5 Flash (High)", modelFamily: "google", prompt: "bounded task" },
      }),
    ).resolves.toEqual({ resumeReference: "session-1" });
    await expect(
      adapter.request("spawn", {
        actionId: "agy-openai",
        payload: { model: "gpt-5", modelFamily: "openai", prompt: "wrong family" },
      }),
    ).rejects.toMatchObject({ code: "ADAPTER_FAMILY_FORBIDDEN" });
    await expect(
      adapter.request("spawn", {
        actionId: "agy-google-non-gemini",
        payload: { model: "gpt-5", modelFamily: "google", prompt: "wrong model" },
      }),
    ).rejects.toMatchObject({ code: "ADAPTER_MODEL_FORBIDDEN" });
    await expect(
      adapter.request("dispatch", {
        actionId: "agy-steer-1",
        operation: "steer",
        payload: { model: "Gemini 3.5 Flash (High)", modelFamily: "google", prompt: "change course" },
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(provider.steer).not.toHaveBeenCalled();
    actionJournal.close();
  });

  it("accepts Cursor Composer and Grok patterns but rejects branded family rebroadcasts", async () => {
    const actionJournal = await journal();
    const provider = boundary();
    const adapter = createCursorAgentAdapter({ boundary: provider, journal: actionJournal });

    for (const selection of [
      { model: "composer-2.5", modelFamily: "cursor-composer" },
      { model: "cursor-grok-4.5-high", modelFamily: "xai" },
    ]) {
      await expect(
        adapter.request("spawn", {
          actionId: `cursor-${selection.model}`,
          payload: { ...selection, prompt: "bounded task" },
        }),
      ).resolves.toEqual({ resumeReference: "session-1" });
    }
    await expect(
      adapter.request("spawn", {
        actionId: "cursor-gpt",
        payload: { model: "gpt-5", modelFamily: "openai", prompt: "wrong model" },
      }),
    ).rejects.toMatchObject({ code: "ADAPTER_FAMILY_FORBIDDEN" });
    await expect(
      adapter.request("spawn", {
        actionId: "cursor-pattern",
        payload: { model: "sonnet-4", modelFamily: "cursor-composer", prompt: "wrong pattern" },
      }),
    ).rejects.toMatchObject({ code: "ADAPTER_MODEL_FORBIDDEN" });
    actionJournal.close();
  });

  it("keeps Kiro on explicit open-weight models and does not claim unsupported controls", async () => {
    const actionJournal = await journal();
    const provider = boundary();
    const adapter = createKiroAcpAdapter({ boundary: provider, journal: actionJournal });

    await expect(
      adapter.request("spawn", {
        actionId: "kiro-spawn-1",
        payload: { model: "qwen3-coder", modelFamily: "open-weight", prompt: "bounded task" },
      }),
    ).resolves.toEqual({ resumeReference: "session-1" });
    await expect(
      adapter.request("spawn", {
        actionId: "kiro-closed",
        payload: { model: "cursor-grok-4.5-high", modelFamily: "xai", prompt: "wrong family" },
      }),
    ).rejects.toMatchObject({ code: "ADAPTER_FAMILY_FORBIDDEN" });
    await expect(
      adapter.request("compact", {
        actionId: "kiro-compact-1",
        payload: { resumeReference: "session-1" },
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(provider.compact).not.toHaveBeenCalled();
    actionJournal.close();
  });
});

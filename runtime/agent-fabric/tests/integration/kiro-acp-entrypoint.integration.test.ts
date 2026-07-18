import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { AdapterProcessTransport } from "../../src/adapters/process.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Kiro ACP provider entrypoint", () => {
  it("runs a managed spawn, turn, and release over the real ACP stdio boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kiro-acp-entrypoint-"));
    temporaryDirectories.push(directory);
    const wrapper = fileURLToPath(new URL("../support/provider-wrapper-entrypoint.ts", import.meta.url));
    const fake = fileURLToPath(new URL("../support/kiro-acp-fake.ts", import.meta.url));
    const loader = fileURLToPath(import.meta.resolve("tsx"));
    const transcript = join(directory, "provider-transcript.jsonl");
    const transport = new AdapterProcessTransport({
      command: [
        process.execPath,
        "--import",
        "tsx",
        wrapper,
        "--journal",
        join(directory, "adapter.sqlite3"),
        "--provider-executable",
        process.execPath,
        "--provider-argument",
        "--import",
        "--provider-argument",
        loader,
        "--provider-argument",
        fake,
        "--provider-argument",
        "happy",
        "--provider-argument",
        transcript,
        "--request-timeout-ms",
        "1000",
      ],
      environment: { AGENT_FABRIC_TEST_ADAPTER: "kiro-acp" },
      responseTimeoutMs: 3_000,
    });
    try {
      await expect(transport.request("capabilities", {})).resolves.toMatchObject({
        adapterId: "kiro-acp",
        operations: ["spawn", "send_turn", "release"],
      });
      await expect(transport.request("spawn", {
        actionId: "kiro:spawn:1",
        payload: { cwd: directory, model: "qwen3-coder", modelFamily: "open-weight" },
      })).resolves.toEqual({ resumeReference: "kiro-session-1", sessionId: "kiro-session-1" });
      await expect(transport.request("dispatch", {
        actionId: "kiro:turn:1",
        operation: "send_turn",
        payload: {
          cwd: directory,
          resumeReference: "kiro-session-1",
          model: "qwen3-coder",
          modelFamily: "open-weight",
          prompt: "bounded task",
        },
      })).resolves.toMatchObject({ status: "terminal", result: { text: "bounded response" } });
      await expect(transport.request("dispatch", {
        actionId: "kiro:release:1",
        operation: "release",
        payload: { cwd: directory, resumeReference: "kiro-session-1" },
      })).resolves.toMatchObject({ status: "terminal", result: { released: true, deleted: false } });
    } finally {
      await transport.close();
    }
  });
});

import { access, chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { AdapterProcessTransport } from "../../src/adapters/process.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function providerFixture(directory: string): Promise<string> {
  const path = join(directory, "provider-fixture.mjs");
  await writeFile(
    path,
    `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ conversationId: "provider-session-1", result: "done" }) + "\\n");\n`,
  );
  await chmod(path, 0o700);
  return path;
}

describe("optional provider executable wrappers", () => {
  it("fails Kiro ACP capabilities closed without spawning the provider while the installed wire contract is unverified", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-kiro-entrypoint-"));
    temporaryDirectories.push(directory);
    const markerPath = join(directory, "provider-spawned");
    const providerExecutable = join(directory, "kiro-provider-fixture.mjs");
    await writeFile(
      providerExecutable,
      `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "spawned");\n`,
    );
    await chmod(providerExecutable, 0o700);
    const wrapperPath = fileURLToPath(new URL("../../src/adapters/providers/optional/kiro-acp.ts", import.meta.url));
    const transport = new AdapterProcessTransport({
      command: [
        process.execPath,
        "--import",
        "tsx",
        wrapperPath,
        "--journal",
        join(directory, "adapter.sqlite3"),
        "--provider-executable",
        providerExecutable,
      ],
      environment: {},
      responseTimeoutMs: 2_000,
    });
    try {
      await expect(transport.request("capabilities", {})).rejects.toMatchObject({
        name: "KIRO_ACP_PROTOCOL_UNVERIFIED",
      });
      await expect(access(markerPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await transport.close();
    }
  });

  it("serves Pi through one persistent bounded JSONL RPC process without inheriting the full environment", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-pi-entrypoint-"));
    temporaryDirectories.push(directory);
    const wrapperPath = fileURLToPath(new URL("../../src/adapters/providers/optional/pi-rpc.ts", import.meta.url));
    const providerPath = fileURLToPath(new URL("../support/pi-jsonl-rpc-fake.ts", import.meta.url));
    const tsxLoaderPath = fileURLToPath(new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url));
    process.env.AGENT_FABRIC_TEST_SECRET = "must-not-cross-provider-boundary";
    const transport = new AdapterProcessTransport({
      command: [
        process.execPath,
        "--import",
        "tsx",
        wrapperPath,
        "--journal",
        join(directory, "adapter.sqlite3"),
        "--provider-executable",
        process.execPath,
        "--provider-argument",
        "--import",
        "--provider-argument",
        tsxLoaderPath,
        "--provider-argument",
        providerPath,
        "--cwd",
        directory,
        "--turn-timeout-ms",
        "30",
      ],
      environment: {},
      responseTimeoutMs: 2_000,
    });
    try {
      await expect(transport.request("capabilities", {})).resolves.toMatchObject({
        protocolVersion: 1,
        adapterId: "pi-rpc",
        actionJournal: true,
      });
      await expect(
        transport.request("spawn", {
          actionId: "pi-rpc:spawn:1",
          payload: {
            provider: "fixture-provider",
            model: "fixture-open-model",
            modelFamily: "open-weight",
          },
        }),
      ).resolves.toMatchObject({
        resumeReference: "/sessions/pi-session-1.jsonl",
        sessionId: "pi-session-1",
      });
      await expect(
        transport.request("dispatch", {
          actionId: "pi-rpc:turn:1",
          operation: "send_turn",
          payload: {
            prompt: "bounded task",
            model: "fixture-open-model",
            modelFamily: "open-weight",
          },
        }),
      ).resolves.toMatchObject({ status: "terminal", executionCount: 1, effectCount: 1 });
      await expect(
        transport.request("dispatch", {
          actionId: "pi-rpc:abort:1",
          operation: "interrupt",
          payload: {},
        }),
      ).resolves.toMatchObject({ status: "terminal" });
      await expect(
        transport.request("dispatch", {
          actionId: "pi-rpc:turn-timeout:1",
          operation: "send_turn",
          payload: {
            prompt: "hang",
            model: "fixture-open-model",
            modelFamily: "open-weight",
          },
        }),
      ).rejects.toMatchObject({ name: "PROVIDER_RESPONSE_TIMEOUT" });
    } finally {
      delete process.env.AGENT_FABRIC_TEST_SECRET;
      await transport.close();
    }
  });

  it.each([
    {
      adapterId: "agy",
      source: "../../src/adapters/providers/optional/agy.ts",
      model: "gemini-fixture",
      modelFamily: "google",
    },
    {
      adapterId: "cursor-agent",
      source: "../../src/adapters/providers/optional/cursor-agent.ts",
      model: "composer-fixture",
      modelFamily: "cursor-composer",
    },
  ])("serves the fabric NDJSON protocol for $adapterId around its bounded CLI boundary", async (fixture) => {
    const directory = await mkdtemp(join(tmpdir(), `fabric-${fixture.adapterId}-entrypoint-`));
    temporaryDirectories.push(directory);
    const providerExecutable = await providerFixture(directory);
    const wrapperPath = fileURLToPath(new URL(fixture.source, import.meta.url));
    const transport = new AdapterProcessTransport({
      command: [
        process.execPath,
        "--import",
        "tsx",
        wrapperPath,
        "--journal",
        join(directory, "adapter.sqlite3"),
        "--provider-executable",
        providerExecutable,
        "--cwd",
        directory,
      ],
      environment: {},
      responseTimeoutMs: 2_000,
    });
    try {
      await expect(transport.request("capabilities", {})).resolves.toMatchObject({
        protocolVersion: 1,
        adapterId: fixture.adapterId,
        actionJournal: true,
      });
      await expect(
        transport.request("spawn", {
          actionId: `${fixture.adapterId}:spawn:1`,
          payload: {
            model: fixture.model,
            modelFamily: fixture.modelFamily,
            prompt: "bounded fixture task",
          },
        }),
      ).resolves.toMatchObject({ resumeReference: "provider-session-1", result: "done" });
      await expect(
        transport.request("lookup_action", { actionId: `${fixture.adapterId}:spawn:1` }),
      ).resolves.toMatchObject({ status: "terminal", executionCount: 1, effectCount: 1 });
    } finally {
      await transport.close();
    }
  });
});

import { describe, expect, it } from "vitest";

import { CodexJsonRpcConnection } from "../../src/adapters/providers/codex-json-rpc.ts";

const FAKE_SERVER = String.raw`
const readline = require("node:readline");
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + "\n");
  } else if (message.method === "emit") {
    process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + "\n");
    process.stdout.write(JSON.stringify({ method: "thread/compacted", params: { threadId: "thread-1", sequence: 1 } }) + "\n");
    process.stdout.write(JSON.stringify({ method: "thread/compacted", params: { threadId: "thread-1", sequence: 2 } }) + "\n");
  } else if (message.method === "exit") {
    process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + "\n", () => process.exit(7));
  }
});
`;

describe("Codex JSON-RPC notification consumption", () => {
  it("consumes each buffered notification exactly once", async () => {
    const connection = new CodexJsonRpcConnection([process.execPath, "-e", FAKE_SERVER]);
    try {
      await connection.initialize();
      await connection.request("emit", {});
      await new Promise((resolve) => setTimeout(resolve, 20));

      await expect(connection.waitForNotification("thread/compacted", () => true, 100))
        .resolves.toMatchObject({ sequence: 1 });
      await expect(connection.waitForNotification("thread/compacted", () => true, 100))
        .resolves.toMatchObject({ sequence: 2 });
      await expect(connection.waitForNotification("thread/compacted", () => true, 20))
        .rejects.toMatchObject({ code: "PROVIDER_RESPONSE_TIMEOUT" });
    } finally {
      await connection.close();
    }
  });

  it("rejects notification waits immediately when the provider exits", async () => {
    const connection = new CodexJsonRpcConnection([process.execPath, "-e", FAKE_SERVER]);
    await connection.initialize();
    const waiting = connection.waitForNotification("turn/completed", () => true, 10_000);
    await connection.request("exit", {});
    await expect(waiting).rejects.toMatchObject({ code: "PROVIDER_EXITED" });
    await connection.close();
  });
});

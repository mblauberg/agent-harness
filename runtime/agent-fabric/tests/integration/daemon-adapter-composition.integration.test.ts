import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { connectFabricDaemon, startFabricDaemon } from "../../src/index.ts";
import { DAEMON_ROOT_AUTHORITY } from "../support/daemon-testkit.ts";

const fakeAdapter = fileURLToPath(new URL("../support/daemon-fake-adapter.ts", import.meta.url));

describe("daemon adapter composition", () => {
  it("passes an explicitly activated adapter into the authoritative daemon and journals a real fake-process action", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-daemon-adapter-"));
    const stateDirectory = join(directory, "state");
    const runtimeDirectory = join(directory, "runtime");
    const socketPath = join(runtimeDirectory, "fabric.sock");
    const daemon = await startFabricDaemon({
      databasePath: join(stateDirectory, "fabric.sqlite3"), stateDirectory, runtimeDirectory, socketPath,
      adapters: { fake: { command: [process.execPath, "--import", "tsx", fakeAdapter], environment: { FAKE_ADAPTER_JOURNAL: join(directory, "fake-journal.json") } } },
    });
    const bootstrap = await connectFabricDaemon({ socketPath, capability: daemon.bootstrapCapability });
    try {
      const run = await bootstrap.createRun({
        runId: "run-daemon-adapter",
        chair: { agentId: "chair", authority: { ...DAEMON_ROOT_AUTHORITY, disclosure: ["local", "approved-provider"] } },
      });
      const chair = await connectFabricDaemon({ socketPath, capability: run.chairCapability });
      try {
        const action = await chair.dispatchProviderAction({ adapterId: "fake", actionId: "daemon-adapter:1", operation: "steer", payload: { instruction: "bounded review" }, commandId: "daemon-adapter:dispatch:1" });
        expect(action).toMatchObject({ actionId: "daemon-adapter:1", status: "terminal", executionCount: 1, effectCount: 1 });
      } finally {
        await chair.close();
      }
    } finally {
      await bootstrap.close();
      await daemon.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

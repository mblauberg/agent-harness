import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";
import { ROOT_AUTHORITY } from "../../support/stage1-fixture.ts";

const adapterPath = fileURLToPath(new URL("../../support/crash-after-acceptance-adapter.ts", import.meta.url));

describe("AC-011 crash after provider acceptance", () => {
  it("reconciles by stable action ID without replaying the accepted effect", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-crash-acceptance-"));
    const journalPath = join(directory, "adapter-journal.json");
    const databasePath = join(directory, "fabric.sqlite3");
    const fabric = await openFabric({
      databasePath,
      workspaceRoots: [directory],
      adapters: { crash: { command: [process.execPath, "--import", "tsx", adapterPath], environment: { CRASH_ADAPTER_JOURNAL: journalPath } } },
    });
    try {
      const run = await createCurrentSessionRun({
        databasePath,
        workspaceRoot: directory,
        runId: "run-crash-after-acceptance",
        chair: { agentId: "chair", authority: { ...ROOT_AUTHORITY, disclosure: { level: "scoped", scopes: ["local", "approved-provider"] } as const } },
      });
      const chair = fabric.connect(run.chairCapability);
      const ambiguous = await chair.dispatchProviderAction({ adapterId: "crash", actionId: "crash-action-1", operation: "steer", payload: { instruction: "once" }, commandId: "crash:dispatch" });
      expect(ambiguous).toMatchObject({ status: "ambiguous", executionCount: 1 });
      const reconciled = await chair.reconcileProviderAction({ actionId: "crash-action-1", commandId: "crash:reconcile" });
      expect(reconciled).toMatchObject({ status: "terminal", effectCount: 1, result: { acceptedBeforeCrash: true } });
      expect(JSON.parse(await readFile(journalPath, "utf8"))).toEqual({ actionId: "crash-action-1", dispatchCount: 1 });
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

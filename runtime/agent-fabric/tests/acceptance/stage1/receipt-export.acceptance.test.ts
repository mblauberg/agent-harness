import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import { assertFabricReceiptSchema } from "../../../src/exports/schema.ts";
import { ManualClock } from "../../support/manual-clock.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("Stage 1 fabric receipt export", () => {
  it("writes the standard relative path and returns the SHA-256 of the exact exported bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-receipt-"));
    const runDirectory = join(root, ".agent-run", "run-receipt");
    await mkdir(runDirectory, { recursive: true });
    const clock = new ManualClock();
    const fabric = await openFabric({
      databasePath: join(root, "fabric.sqlite3"),
      workspaceRoots: [root],
      clock: clock.now,
    });
    cleanup.push(async () => {
      await fabric.close();
      await rm(root, { recursive: true, force: true });
    });
    const run = await fabric.createRun({
      runId: "run-receipt",
      projectRunDirectory: runDirectory,
      chair: {
        agentId: "chair",
        authority: {
          workspaceRoots: ["."],
          sourcePaths: ["."],
          artifactPaths: [".agent-run/run-receipt"],
          actions: ["read", "write", "delegate", "message"],
          disclosure: ["local"],
          expiresAt: "2099-01-01T00:00:00.000Z",
          budget: { turns: 10, "cost:USD": 5 },
        },
      },
    });
    const chair = fabric.connect(run.chairCapability);

    const exported = await chair.exportReceipt({ commandId: "receipt:export:1" });
    expect(exported).toMatchObject({ schemaVersion: 1 });
    expect(exported.relativePath).toBe(`fabric-receipt-${exported.sha256}.json`);
    const bytes = await readFile(join(runDirectory, exported.relativePath));
    expect(exported.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    const receipt: unknown = JSON.parse(bytes.toString("utf8"));
    expect(receipt).toMatchObject({
      schemaVersion: 1,
      runId: "run-receipt",
      chair: { agentId: "chair", adapterId: null },
      stageOwners: [],
      executionProfile: "headless",
      directInputProvenance: "unavailable",
      modelRoutingReceipts: [],
      taskAndWriteLeases: [],
      messagesSentReceivedAbandoned: { sent: 0, delivered: 0, acknowledged: 0, abandoned: 0, expired: 0 },
      objectiveChecks: [],
      crossFamilyReviews: [],
      providerFailuresAndSubstitutions: [],
      operatorInterventions: [],
      compactionsAndRotations: [],
    });
    expect(JSON.stringify(receipt)).not.toContain("provider_session_ref");
    if (typeof receipt !== "object" || receipt === null || Array.isArray(receipt)) throw new Error("receipt fixture is invalid");
    expect(() => assertFabricReceiptSchema({ ...receipt, observedAt: "not-a-date" })).toThrow(/format/u);

    await chair.recordOperatorIntervention({ source: "fabric", directInputProvenance: "complete", taskRevision: 1, summary: "force a second observed receipt", commandId: "receipt:intervention" });
    const second = await chair.exportReceipt({ commandId: "receipt:export:2" });
    expect(second.sha256).not.toBe(exported.sha256);
    expect(await readFile(join(runDirectory, exported.relativePath))).toEqual(bytes);
    expect(await chair.exportReceipt({ commandId: "receipt:export:1" })).toEqual(exported);
  });
});

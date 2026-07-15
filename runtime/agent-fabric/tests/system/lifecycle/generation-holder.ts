import { createInterface } from "node:readline";

import { BootstrapElection } from "../../../src/daemon/bootstrap-election.ts";

const runtimeDirectory = process.env.FABRIC_TEST_RUNTIME_DIRECTORY;
if (runtimeDirectory === undefined) throw new Error("FABRIC_TEST_RUNTIME_DIRECTORY is required");
const election = new BootstrapElection({ runtimeDirectory, leaseDurationMs: 80, waitTimeoutMs: 2_000 });
await election.withExclusiveLock("holder_action", async (held) => {
  const generation = await held.beginGeneration();
  process.stdout.write(`${String(generation.electionGeneration)}\n`);
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  await new Promise<void>((resolve) => lines.once("line", () => resolve()));
  lines.close();
  await generation.recordTerminal({ status: "failed", code: "TEST_RELEASE", message: "test holder released" });
});

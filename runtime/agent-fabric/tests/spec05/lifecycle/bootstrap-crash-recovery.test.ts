import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { attachOrStartDaemon, BootstrapSpawnPhaseError } from "../../../src/daemon/bootstrap-client.ts";
import { BootstrapElection } from "../../../src/daemon/bootstrap-election.ts";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("bootstrap crash recovery", () => {
  for (const phase of [
    "socket-recheck",
    "spawn",
    "database-owned",
    "migrations-complete",
    "recovery-complete",
    "socket-bound",
    "ready-receipt",
    "handshake",
  ] as const) {
    it(`journals ${phase} loss as ambiguous and requires reconciliation before another spawn`, async () => {
      const root = await mkdtemp(join(tmpdir(), "fabric-bootstrap-crash-"));
      cleanup.push(root);
      const runtimeDirectory = join(root, "runtime");
      const socketPath = join(runtimeDirectory, "fabric.sock");
      const election = new BootstrapElection({ runtimeDirectory });
      const handshake = vi.fn().mockResolvedValue({ status: "unavailable", reason: "unreachable", message: "no response" });
      const spawn = vi.fn().mockImplementation(async () => ({
        ready: new Promise<never>((_resolve, reject) => setTimeout(() => reject(new BootstrapSpawnPhaseError(phase, `crash during ${phase}`)), 0)),
      }));
      const options = {
        actionId: `crash_${phase.replaceAll(" ", "_")}`,
        socketPath,
        requiredProtocolVersion: 1,
        requiredFeatures: ["project-sessions.v1"],
        election,
        handshake,
        spawn,
      } as const;

      await expect(attachOrStartDaemon(options)).rejects.toMatchObject({ code: "BOOTSTRAP_READY_AMBIGUOUS" });
      await expect(election.readGenerationOutcome(1)).resolves.toMatchObject({
        kind: "terminal",
        receipt: { status: "ambiguous", code: "BOOTSTRAP_READY_AMBIGUOUS" },
      });
      const attempts = (await readFile(election.paths.attemptsPath, "utf8")).trim().split("\n")
        .map((line) => JSON.parse(line) as { phase: string; status: string });
      expect(attempts.at(-1)).toMatchObject({ phase, status: "ambiguous" });
      await expect(attachOrStartDaemon(options)).rejects.toMatchObject({ code: "BOOTSTRAP_RECONCILIATION_REQUIRED" });
      expect(spawn).toHaveBeenCalledTimes(1);
    });
  }
});

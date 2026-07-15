import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { attachOrStartDaemon } from "../../../src/daemon/bootstrap-client.ts";
import { BootstrapElection } from "../../../src/daemon/bootstrap-election.ts";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function readyInput(socketPath: string, daemonInstanceGeneration: number) {
  return {
    daemonInstanceGeneration,
    socketPath,
    protocolVersion: 1,
    features: ["project-sessions.v1"],
    evidence: {
      databaseOwned: true as const,
      migrationsComplete: true as const,
      recoveryComplete: true as const,
      socketBound: true as const,
    },
  };
}

describe("bootstrap ready receipt binding", () => {
  it("records a terminal failure instead of publishing a ready outcome for the wrong socket", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-ready-socket-"));
    cleanup.push(root);
    const runtimeDirectory = join(root, "runtime");
    const socketPath = join(runtimeDirectory, "fabric.sock");
    const election = new BootstrapElection({ runtimeDirectory });
    const handshake = vi.fn().mockResolvedValue({ status: "unavailable", reason: "absent", message: "missing" });

    await expect(attachOrStartDaemon({
      actionId: "ready_wrong_socket",
      socketPath,
      requiredProtocolVersion: 1,
      requiredFeatures: ["project-sessions.v1"],
      election,
      handshake,
      spawn: async () => ({ ready: Promise.resolve(readyInput(join(runtimeDirectory, "attacker.sock"), 1)) }),
    })).rejects.toMatchObject({ code: "BOOTSTRAP_SOCKET_MISMATCH" });
    await expect(election.readGenerationOutcome(1)).resolves.toMatchObject({
      kind: "terminal",
      receipt: { status: "failed", code: "BOOTSTRAP_SOCKET_MISMATCH" },
    });
  });

  it("does not release a ready generation when authenticated daemon generation disagrees", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-ready-generation-"));
    cleanup.push(root);
    const runtimeDirectory = join(root, "runtime");
    const socketPath = join(runtimeDirectory, "fabric.sock");
    const election = new BootstrapElection({ runtimeDirectory });
    const handshake = vi.fn()
      .mockResolvedValueOnce({ status: "unavailable", reason: "absent", message: "missing" })
      .mockResolvedValueOnce({ status: "unavailable", reason: "absent", message: "missing" })
      .mockResolvedValueOnce({
        status: "compatible",
        client: { id: "wrong-generation" },
        protocolVersion: 1,
        daemonInstanceGeneration: 32,
        features: ["project-sessions.v1"],
      });

    await expect(attachOrStartDaemon({
      actionId: "ready_wrong_generation",
      socketPath,
      requiredProtocolVersion: 1,
      requiredFeatures: ["project-sessions.v1"],
      election,
      handshake,
      spawn: async () => ({ ready: Promise.resolve(readyInput(socketPath, 31)) }),
    })).rejects.toMatchObject({ code: "BOOTSTRAP_DAEMON_GENERATION_MISMATCH" });
    await expect(election.readGenerationOutcome(1)).resolves.toMatchObject({
      kind: "terminal",
      receipt: { status: "ambiguous", code: "BOOTSTRAP_DAEMON_GENERATION_MISMATCH" },
    });
  });

  it("rejects a ready receipt whose action no longer matches its confirmed lease", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-ready-action-"));
    cleanup.push(root);
    const runtimeDirectory = join(root, "runtime");
    const election = new BootstrapElection({ runtimeDirectory });
    await election.withExclusiveLock("bound_action", async (held) => {
      const generation = await held.beginGeneration();
      await generation.publishReady(readyInput(join(runtimeDirectory, "fabric.sock"), 1));
      await generation.confirmReady();
    });
    const receipt = JSON.parse(await readFile(election.paths.readyPath, "utf8")) as Record<string, unknown>;
    receipt.actionId = "substituted_action";
    await writeFile(election.paths.readyPath, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });

    await expect(election.readGenerationOutcome(1)).rejects.toMatchObject({ code: "BOOTSTRAP_RECEIPT_INVALID" });
  });
});

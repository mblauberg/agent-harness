import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { attachOrStartDaemon } from "../../../src/daemon/bootstrap-client.ts";
import { BootstrapElection } from "../../../src/daemon/bootstrap-election.ts";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("attachOrStartDaemon", () => {
  it("returns a compatible initialized daemon without entering election or spawning", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-bootstrap-client-"));
    cleanup.push(root);
    const socketPath = join(root, "runtime", "fabric.sock");
    const client = { close: vi.fn() };
    const handshake = vi.fn().mockResolvedValue({
      status: "compatible",
      client,
      protocolVersion: 1,
      daemonInstanceGeneration: 4,
      features: ["fabric-core.v1", "project-sessions.v1"],
    });
    const spawn = vi.fn();

    await expect(attachOrStartDaemon({
      actionId: "bootstrap_first_read_01",
      socketPath,
      requiredProtocolVersion: 1,
      requiredFeatures: ["project-sessions.v1"],
      election: new BootstrapElection({ runtimeDirectory: join(root, "runtime") }),
      handshake,
      spawn,
    })).resolves.toEqual({
      client,
      daemonInstanceGeneration: 4,
      electionGeneration: null,
      started: false,
    });
    expect(handshake).toHaveBeenCalledTimes(1);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rechecks under the election lock and suppresses spawn when an incumbent becomes ready", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-bootstrap-recheck-"));
    cleanup.push(root);
    const socketPath = join(root, "runtime", "fabric.sock");
    const client = { id: "incumbent" };
    const handshake = vi.fn()
      .mockResolvedValueOnce({ status: "unavailable", reason: "absent", message: "missing" })
      .mockResolvedValueOnce({
        status: "compatible",
        client,
        protocolVersion: 1,
        daemonInstanceGeneration: 9,
        features: ["project-sessions.v1"],
      });
    const spawn = vi.fn();

    await expect(attachOrStartDaemon({
      actionId: "bootstrap_recheck_01",
      socketPath,
      requiredProtocolVersion: 1,
      requiredFeatures: ["project-sessions.v1"],
      election: new BootstrapElection({ runtimeDirectory: join(root, "runtime") }),
      handshake,
      spawn,
    })).resolves.toEqual({
      client,
      daemonInstanceGeneration: 9,
      electionGeneration: null,
      started: false,
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("retains election ownership through exact ready receipt and authenticated generation handshake", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-bootstrap-start-"));
    cleanup.push(root);
    const runtimeDirectory = join(root, "runtime");
    const socketPath = join(runtimeDirectory, "fabric.sock");
    const client = { id: "started" };
    let ready = false;
    const handshake = vi.fn().mockImplementation(async () => ready
      ? {
          status: "compatible",
          client,
          protocolVersion: 1,
          daemonInstanceGeneration: 12,
          features: ["fabric-core.v1", "project-sessions.v1"],
        }
      : { status: "unavailable", reason: "absent", message: "missing" });
    const spawn = vi.fn().mockImplementation(async (input: { actionId: string; electionGeneration: number; socketPath: string }) => ({
      ready: (async () => {
        ready = true;
        return {
          daemonInstanceGeneration: 12,
          socketPath: input.socketPath,
          protocolVersion: 1,
          features: ["fabric-core.v1", "project-sessions.v1"],
          evidence: {
            databaseOwned: true,
            migrationsComplete: true,
            recoveryComplete: true,
            socketBound: true,
          },
        };
      })(),
    }));

    await expect(attachOrStartDaemon({
      actionId: "bootstrap_start_01",
      socketPath,
      requiredProtocolVersion: 1,
      requiredFeatures: ["project-sessions.v1"],
      election: new BootstrapElection({ runtimeDirectory, waitTimeoutMs: 1_000 }),
      handshake,
      spawn,
    })).resolves.toEqual({
      client,
      daemonInstanceGeneration: 12,
      electionGeneration: 1,
      started: true,
    });
    expect(spawn).toHaveBeenCalledWith({
      actionId: "bootstrap_start_01",
      electionGeneration: 1,
      socketPath,
    });
  });

  it("returns a typed failure for a responsive incompatible incumbent without spawning", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-bootstrap-incompatible-"));
    cleanup.push(root);
    const runtimeDirectory = join(root, "runtime");
    const socketPath = join(runtimeDirectory, "fabric.sock");
    const handshake = vi.fn()
      .mockResolvedValueOnce({ status: "unavailable", reason: "timeout", message: "bounded timeout" })
      .mockResolvedValueOnce({ status: "incompatible", responsive: true, message: "missing project-sessions.v1" });
    const spawn = vi.fn();

    await expect(attachOrStartDaemon({
      actionId: "bootstrap_incompatible_01",
      socketPath,
      requiredProtocolVersion: 1,
      requiredFeatures: ["project-sessions.v1"],
      election: new BootstrapElection({ runtimeDirectory }),
      handshake,
      spawn,
    })).rejects.toMatchObject({ code: "BOOTSTRAP_INCOMPATIBLE_INCUMBENT" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("coalesces twelve simultaneous first reads onto one spawned generation", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-bootstrap-concurrent-"));
    cleanup.push(root);
    const runtimeDirectory = join(root, "runtime");
    const socketPath = join(runtimeDirectory, "fabric.sock");
    const election = new BootstrapElection({
      runtimeDirectory,
      leaseDurationMs: 2_000,
      waitTimeoutMs: 3_000,
      pollIntervalMs: 2,
    });
    const client = { id: "shared" };
    let ready = false;
    const handshake = vi.fn().mockImplementation(async () => ready
      ? {
          status: "compatible",
          client,
          protocolVersion: 1,
          daemonInstanceGeneration: 23,
          features: ["project-sessions.v1"],
        }
      : { status: "unavailable", reason: "absent", message: "missing" });
    const spawn = vi.fn().mockImplementation(async (input: { socketPath: string }) => ({
      ready: (async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        ready = true;
        return {
          daemonInstanceGeneration: 23,
          socketPath: input.socketPath,
          protocolVersion: 1,
          features: ["project-sessions.v1"],
          evidence: {
            databaseOwned: true,
            migrationsComplete: true,
            recoveryComplete: true,
            socketBound: true,
          },
        };
      })(),
    }));

    const attached = await Promise.all(Array.from({ length: 12 }, (_, index) => attachOrStartDaemon({
      actionId: `bootstrap_concurrent_${String(index)}`,
      socketPath,
      requiredProtocolVersion: 1,
      requiredFeatures: ["project-sessions.v1"],
      election,
      handshake,
      spawn,
    })));

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(attached.filter((item) => item.started)).toHaveLength(1);
    expect(new Set(attached.map((item) => item.daemonInstanceGeneration))).toEqual(new Set([23]));
    expect(new Set(attached.map((item) => item.electionGeneration))).toEqual(new Set([1]));
  });
});

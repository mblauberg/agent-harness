import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { connectFabricDaemon, startFabricDaemon } from "../../src/index.ts";
import { describe, expect, it } from "vitest";

import { createDaemonFixture } from "../support/daemon-testkit.ts";

describe("Stage 1 daemon restart replay", () => {
  it("replays a committed unacknowledged message after SIGKILL and never replays it after acknowledgement", async () => {
    const fixture = await createDaemonFixture("run-replay");
    const sent = await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "survive restart",
      requiresAck: true,
      dedupeKey: "restart:committed-message",
    });
    await Promise.allSettled([fixture.chair.close(), fixture.peer.close(), fixture.bootstrap.close()]);
    const initialEpoch = JSON.parse(await readFile(join(fixture.runtimeDirectory, "fabric-v1.discovery-owner.json"), "utf8")) as {
      daemonInstanceGeneration: number;
    };
    process.kill(fixture.daemon.pid, "SIGKILL");
    await fixture.daemon.waitForExit();
    await expect(readFile(join(fixture.runtimeDirectory, "fabric-v1.discovery-owner.json"), "utf8").then((value) => JSON.parse(value)))
      .resolves.toMatchObject({ state: "crashed", daemonInstanceGeneration: initialEpoch.daemonInstanceGeneration });

    const restarted = await startFabricDaemon({
      databasePath: fixture.databasePath,
      stateDirectory: fixture.stateDirectory,
      runtimeDirectory: fixture.runtimeDirectory,
      socketPath: fixture.socketPath,
      workspaceRoots: [fixture.directory],
    });
    await expect(readFile(join(fixture.runtimeDirectory, "fabric-v1.discovery-owner.json"), "utf8").then((value) => JSON.parse(value)))
      .resolves.toMatchObject({ state: "active", daemonInstanceGeneration: initialEpoch.daemonInstanceGeneration + 1 });
    const peer = await connectFabricDaemon({ socketPath: fixture.socketPath, capability: fixture.peerCapability });
    const delivery = await peer.receiveMessages({ limit: 1, visibilityTimeoutMs: 5_000 });
    expect(delivery).toHaveLength(1);
    const firstDelivery = delivery.at(0);
    if (firstDelivery === undefined) {
      throw new Error("expected the committed message after restart");
    }
    expect(firstDelivery).toMatchObject({ messageId: sent.messageId, sequence: 1, attempt: 1 });
    await peer.acknowledgeDelivery({ deliveryId: firstDelivery.deliveryId });
    await peer.close();
    await restarted.stop();

    const restartedAgain = await startFabricDaemon({
      databasePath: fixture.databasePath,
      stateDirectory: fixture.stateDirectory,
      runtimeDirectory: fixture.runtimeDirectory,
      socketPath: fixture.socketPath,
      workspaceRoots: [fixture.directory],
    });
    const peerAgain = await connectFabricDaemon({ socketPath: fixture.socketPath, capability: fixture.peerCapability });
    expect(await peerAgain.receiveMessages({ limit: 1, visibilityTimeoutMs: 5_000 })).toEqual([]);
    expect(await peerAgain.getMailboxState()).toEqual({
      contiguousWatermark: 1,
      acknowledgedAboveWatermark: [],
    });
    await peerAgain.close();
    await restartedAgain.stop();
    await rm(fixture.directory, { recursive: true, force: true });
  });

  it("quarantines an expired write lease before accepting mutations after restart", async () => {
    const fixture = await createDaemonFixture("run-restart-lease-recovery");
    const lease = await fixture.peer.acquireWriteLease({
      scope: ["src/peer"],
      ttlMs: 1,
      commandId: "restart:lease:acquire",
    });
    await Promise.allSettled([fixture.chair.close(), fixture.peer.close(), fixture.bootstrap.close()]);
    process.kill(fixture.daemon.pid, "SIGKILL");
    await fixture.daemon.waitForExit();

    const restarted = await startFabricDaemon({
      databasePath: fixture.databasePath,
      stateDirectory: fixture.stateDirectory,
      runtimeDirectory: fixture.runtimeDirectory,
      socketPath: fixture.socketPath,
      workspaceRoots: [fixture.directory],
    });
    const peer = await connectFabricDaemon({ socketPath: fixture.socketPath, capability: fixture.peerCapability });
    expect(await peer.getWriteLease({ leaseId: lease.leaseId })).toMatchObject({
      leaseId: lease.leaseId,
      status: "quarantined",
      generation: 1,
    });
    await peer.close();
    await restarted.stop();
    await rm(fixture.directory, { recursive: true, force: true });
  });
});

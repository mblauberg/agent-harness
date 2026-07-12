import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { connectFabricDaemon, startFabricDaemon } from "../../src/index.ts";
import { AUTHORITY_ACTION_VOCABULARY } from "../../src/domain/operations.ts";
import {
  terminateTrackedTestProcess,
  trackTestProcess,
  untrackTestProcess,
} from "./test-process-registry.ts";
import { createCurrentSessionRun } from "./current-session-testkit.ts";

export const DAEMON_ROOT_AUTHORITY = {
  workspaceRoots: ["."],
  sourcePaths: ["src"],
  artifactPaths: [".agent-run"],
  actions: [...AUTHORITY_ACTION_VOCABULARY],
  disclosure: { level: "scoped", scopes: ["local"] } as const,
  expiresAt: "2099-01-01T00:00:00.000Z",
  budget: { turns: 128, "cost:USD": 128 },
};

export async function createDaemonFixture(runId = "run-daemon") {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-daemon-"));
  const stateDirectory = join(directory, "state");
  const runtimeDirectory = join(directory, "runtime");
  const databasePath = join(stateDirectory, "fabric.sqlite3");
  const socketPath = join(runtimeDirectory, "fabric.sock");
  let daemon: Awaited<ReturnType<typeof startFabricDaemon>>;
  try {
    daemon = await startFabricDaemon({
      databasePath,
      stateDirectory,
      runtimeDirectory,
      socketPath,
      workspaceRoots: [directory],
    });
  } catch (error: unknown) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  trackTestProcess(daemon.pid, `fabric daemon ${directory}`);
  let bootstrap: Awaited<ReturnType<typeof connectFabricDaemon>> | undefined;
  let chair: Awaited<ReturnType<typeof connectFabricDaemon>> | undefined;
  let peer: Awaited<ReturnType<typeof connectFabricDaemon>> | undefined;
  let cleaned = false;
  const cleanup = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    await Promise.allSettled([
      chair?.close() ?? Promise.resolve(),
      peer?.close() ?? Promise.resolve(),
      bootstrap?.close() ?? Promise.resolve(),
    ]);
    try {
      await daemon.stop();
      untrackTestProcess(daemon.pid);
    } finally {
      await terminateTrackedTestProcess(daemon.pid);
      await rm(directory, { recursive: true, force: true });
    }
  };

  try {
  bootstrap = await connectFabricDaemon({
    socketPath,
    capability: daemon.bootstrapCapability,
  });
  const run = await createCurrentSessionRun({
    databasePath,
    workspaceRoot: directory,
    runId,
    chair: { agentId: "chair", authority: DAEMON_ROOT_AUTHORITY },
  });
  chair = await connectFabricDaemon({ socketPath, capability: run.chairCapability });
  const peerAuthority = await chair.delegateAuthority({
    parentAuthorityId: run.chairAuthorityId,
    commandId: `${runId}:peer-authority`,
    authority: {
      ...DAEMON_ROOT_AUTHORITY,
      sourcePaths: ["src/peer"],
      artifactPaths: [".agent-run/peer"],
      actions: [...DAEMON_ROOT_AUTHORITY.actions],
      budget: { turns: 8, "cost:USD": 8 },
    },
  });
  const peerRegistration = await chair.registerAgent({
    agentId: "peer",
    authorityId: peerAuthority.authorityId,
  });
  await chair.createDiscussionGroup({
    groupId: `${runId}:default-group`,
    memberAgentIds: ["chair", "peer"],
    commandId: `${runId}:default-group:create`,
  });
  peer = await connectFabricDaemon({ socketPath, capability: peerRegistration.capability });

  return {
    directory,
    stateDirectory,
    runtimeDirectory,
    databasePath,
    socketPath,
    daemon,
    bootstrap,
    run,
    chair,
    peer,
    peerCapability: peerRegistration.capability,
    cleanup,
  };
  } catch (error: unknown) {
    await cleanup();
    throw error;
  }
}

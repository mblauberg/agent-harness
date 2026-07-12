import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openFabric } from "../../src/index.ts";
import { FABRIC_OPERATIONS } from "../../src/domain/operations.ts";

import { createCurrentSessionRun } from "./current-session-testkit.ts";
import { ManualClock } from "./manual-clock.ts";

export const ROOT_AUTHORITY = {
  workspaceRoots: ["."],
  sourcePaths: ["src"],
  artifactPaths: [".agent-run"],
  actions: ["read", "write", "delegate", "message", FABRIC_OPERATIONS.observeEvents],
  disclosure: ["local"],
  expiresAt: "2099-01-01T00:00:00.000Z",
  budget: { turns: 20, "cost:USD": 10 },
};

export async function createStage1Fixture() {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-stage1-"));
  const databasePath = join(directory, "fabric.sqlite3");
  const clock = new ManualClock();
  const fabric = await openFabric({ databasePath, workspaceRoots: [directory], clock: clock.now });
  const run = await createCurrentSessionRun({
    databasePath,
    workspaceRoot: directory,
    runId: "run-stage1",
    chair: { agentId: "chair", authority: ROOT_AUTHORITY },
  });
  const chair = fabric.connect(run.chairCapability);

  const aliceAuthority = await chair.delegateAuthority({
    parentAuthorityId: run.chairAuthorityId,
    authority: {
      ...ROOT_AUTHORITY,
      sourcePaths: ["src/alice"],
      artifactPaths: [".agent-run/alice"],
      actions: ["read", "write", "message"],
      budget: { turns: 5, "cost:USD": 2 },
    },
  });
  const bobAuthority = await chair.delegateAuthority({
    parentAuthorityId: run.chairAuthorityId,
    authority: {
      ...ROOT_AUTHORITY,
      sourcePaths: ["src/bob"],
      artifactPaths: [".agent-run/bob"],
      actions: ["read", "write", "message"],
      budget: { turns: 5, "cost:USD": 2 },
    },
  });
  const aliceRegistration = await chair.registerAgent({
    agentId: "alice",
    authorityId: aliceAuthority.authorityId,
  });
  const bobRegistration = await chair.registerAgent({
    agentId: "bob",
    authorityId: bobAuthority.authorityId,
  });
  await chair.createDiscussionGroup({
    groupId: "stage1-default",
    memberAgentIds: ["chair", "alice", "bob"],
    commandId: "stage1:group:default",
  });

  return {
    directory,
    databasePath,
    clock,
    fabric,
    run,
    authorities: {
      chair: run.chairAuthorityId,
      alice: aliceAuthority.authorityId,
      bob: bobAuthority.authorityId,
    },
    capabilities: {
      chair: run.chairCapability,
      alice: aliceRegistration.capability,
      bob: bobRegistration.capability,
    },
    chair,
    alice: fabric.connect(aliceRegistration.capability),
    bob: fabric.connect(bobRegistration.capability),
  };
}

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import { ROOT_AUTHORITY } from "../../support/stage1-fixture.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => Promise.all(cleanup.splice(0).map((close) => close())));

describe("chair, owner and participant scoped reads", () => {
  it("does not expose an unrelated agent's task or agent record through direct or resource projections", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-read-policy-"));
    const databasePath = join(directory, "fabric.sqlite3");
    const fabric = await openFabric({ databasePath, workspaceRoots: [directory] });
    cleanup.push(async () => {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    });
    const run = await createCurrentSessionRun({
      databasePath,
      workspaceRoot: directory,
      runId: "run-read-policy",
      chair: { agentId: "chair", authority: ROOT_AUTHORITY },
    });
    const chair = fabric.connect(run.chairCapability);
    const aliceAuthority = await chair.delegateAuthority({
      parentAuthorityId: run.chairAuthorityId,
      authority: { ...ROOT_AUTHORITY, sourcePaths: ["src/alice"], actions: ["read", "write"], budget: { turns: 5 } },
    });
    const bobAuthority = await chair.delegateAuthority({
      parentAuthorityId: run.chairAuthorityId,
      authority: { ...ROOT_AUTHORITY, sourcePaths: ["src/bob"], actions: ["read", "write"], budget: { turns: 5 } },
    });
    const aliceRegistration = await chair.registerAgent({ agentId: "alice", authorityId: aliceAuthority.authorityId });
    const bobRegistration = await chair.registerAgent({ agentId: "bob", authorityId: bobAuthority.authorityId });
    await chair.createTask({
      taskId: "alice-private",
      authorityId: aliceAuthority.authorityId,
      eligibleAgentIds: ["alice"],
      proposedOwnerAgentId: "alice",
      objective: "private bounded task",
      baseRevision: "base-1",
      commandId: "read-policy:create-task",
    });
    const alice = fabric.connect(aliceRegistration.capability);
    const bob = fabric.connect(bobRegistration.capability);

    expect((await alice.listTasks({ runId: run.runId })).tasks.map((task) => task.taskId)).toEqual(["alice-private"]);
    expect(await bob.listTasks({ runId: run.runId })).toEqual({ tasks: [] });
    await expect(bob.getTask({ taskId: "alice-private" })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    expect((await bob.listAgents({ runId: run.runId })).agents.map((agent) => agent.agentId)).toEqual(["bob", "chair"]);
  });
});

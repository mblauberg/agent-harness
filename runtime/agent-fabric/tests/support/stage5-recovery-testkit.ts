import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AUTHORITY_ACTION_VOCABULARY, openFabric } from "../../src/index.ts";
import type { Fabric, FabricClient, TeamResult } from "../../src/index.ts";
import { createCurrentSessionRun } from "./current-session-testkit.ts";

export type Stage5Fixture = {
  directory: string;
  runDirectory: string;
  fabric: Fabric;
  chair: FabricClient;
  leaderA: FabricClient;
  leaderB: FabricClient;
  replacement: FabricClient;
  workerA: FabricClient;
  authorities: { leaderA: string; leaderB: string; replacement: string; workerA: string };
  tasks: {
    rootA: { taskId: string; revision: number };
    workerA: { taskId: string; revision: number };
    rootB: { taskId: string; revision: number };
  };
};

function stage5(client: FabricClient): FabricClient {
  return client;
}

export async function createStage5RecoveryFixture(): Promise<Stage5Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-stage5-recovery-"));
  const runDirectory = join(directory, ".agent-run", "run-stage5");
  await mkdir(join(directory, "src", "team-a", "worker"), { recursive: true });
  await mkdir(join(directory, "src", "team-b"), { recursive: true });
  await mkdir(join(directory, "src", "replacement"), { recursive: true });
  await mkdir(runDirectory, { recursive: true });
  const databasePath = join(directory, "fabric.sqlite3");
  const fabric = await openFabric({ databasePath, workspaceRoots: [directory] });
  const rootAuthority = {
    workspaceRoots: ["."],
    sourcePaths: ["src"],
    artifactPaths: [".agent-run/run-stage5"],
    actions: [...AUTHORITY_ACTION_VOCABULARY],
    disclosure: { level: "scoped", scopes: ["local"] } as const,
    expiresAt: "2099-01-01T00:00:00.000Z",
    budget: { turns: 200, "cost:USD": 200, descendants: 20 },
  };
  const run = await createCurrentSessionRun({
    databasePath,
    workspaceRoot: directory,
    runId: "run-stage5",
    projectRunDirectory: runDirectory,
    chair: { agentId: "chair", authority: rootAuthority },
  });
  const chairBase = fabric.connect(run.chairCapability);
  const teamA = await chairBase.createTeam({
    teamId: "team-a",
    leader: {
      agentId: "leader-a",
      authority: {
        ...rootAuthority,
        sourcePaths: ["src/team-a"],
        budget: { turns: 30, "cost:USD": 15 },
      },
    },
    rootTask: {
      taskId: "team-a-root",
      objective: "manage team A",
      baseRevision: "stage5-base",
    },
    initialMembers: [{
      agentId: "worker-a",
      authority: {
        ...rootAuthority,
        sourcePaths: ["src/team-a/worker"],
        budget: { turns: 5, "cost:USD": 2 },
      },
    }],
    discussionGroups: [],
    reservedBudget: { turns: 10, "cost:USD": 5 },
    commandId: "stage5:team-a:create",
  });
  const leaderA = teamA.leader;
  const workerA = teamA.initialMembers?.[0];
  const rootAReady = teamA.rootTask;
  if (leaderA === undefined || workerA === undefined || rootAReady === undefined) {
    throw new Error("atomic team creation omitted registered identities or root task");
  }
  const leaderB = await chairBase.delegateAuthority({
    parentAuthorityId: run.chairAuthorityId,
    authority: {
      ...rootAuthority,
      sourcePaths: ["src/team-b"],
      budget: { turns: 20, "cost:USD": 10 },
    },
  });
  const replacement = await chairBase.delegateAuthority({
    parentAuthorityId: run.chairAuthorityId,
    authority: {
      ...rootAuthority,
      sourcePaths: ["src/replacement"],
      budget: { turns: 20, "cost:USD": 10 },
    },
  });
  const leaderARegistration = await chairBase.registerAgent(leaderA);
  const leaderBRegistration = await chairBase.registerAgent({ agentId: "leader-b", authorityId: leaderB.authorityId });
  const replacementRegistration = await chairBase.registerAgent({
    agentId: "leader-replacement",
    authorityId: replacement.authorityId,
  });
  const leaderABase = fabric.connect(leaderARegistration.capability);
  const workerARegistration = await leaderABase.registerAgent(workerA);
  const leaderBBase = fabric.connect(leaderBRegistration.capability);
  const rootA = await leaderABase.claimTask({
    taskId: rootAReady.taskId,
    expectedRevision: rootAReady.revision,
    commandId: "stage5:claim:root-a",
  });
  const workerAReady = await leaderABase.createTask({
    taskId: "team-a-worker",
    authorityId: workerA.authorityId,
    eligibleAgentIds: ["worker-a"],
    objective: "perform team A worker task",
    baseRevision: "stage5-base",
    commandId: "stage5:create:worker-a",
  });
  const workerABase = fabric.connect(workerARegistration.capability);
  const workerATask = await workerABase.claimTask({
    taskId: workerAReady.taskId,
    expectedRevision: workerAReady.revision,
    commandId: "stage5:claim:worker-a",
  });
  const rootBReady = await chairBase.createTask({
    taskId: "team-b-root",
    authorityId: leaderB.authorityId,
    eligibleAgentIds: ["leader-b"],
    objective: "manage team B",
    baseRevision: "stage5-base",
    commandId: "stage5:create:root-b",
  });
  const rootB = await leaderBBase.claimTask({
    taskId: rootBReady.taskId,
    expectedRevision: rootBReady.revision,
    commandId: "stage5:claim:root-b",
  });

  return {
    directory,
    runDirectory,
    fabric,
    chair: stage5(chairBase),
    leaderA: stage5(leaderABase),
    leaderB: stage5(leaderBBase),
    replacement: stage5(fabric.connect(replacementRegistration.capability)),
    workerA: stage5(workerABase),
    authorities: {
      leaderA: leaderA.authorityId,
      leaderB: leaderB.authorityId,
      replacement: replacement.authorityId,
      workerA: workerA.authorityId,
    },
    tasks: { rootA, workerA: workerATask, rootB },
  };
}

export async function createTeamA(fixture: Stage5Fixture): Promise<TeamResult> {
  return await fixture.chair.getTeam({ teamId: "team-a" });
}

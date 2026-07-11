import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openFabric } from "../../src/index.ts";
import type { Fabric, FabricClient } from "../../src/index.ts";

export type TeamResult = {
  teamId: string;
  leaderAgentId: string;
  rootTaskId: string;
  ownedTaskIds: string[];
  memberAgentIds: string[];
  budgetId: string;
  state: "active" | "frozen" | "barrier-closed";
  generation: number;
  successorAgentId: string | null;
};

export type BudgetResult = {
  budgetId: string;
  parentBudgetId: string | null;
  state: "active" | "usage-unknown" | "released";
  dimensions: Record<
    string,
    { granted: number; reserved: number; consumed: number; available: number; usageUnknown: boolean }
  >;
  returned: Record<string, number>;
};

export type Stage5Client = {
  createTeam(input: {
    teamId: string;
    leaderAgentId: string;
    rootTaskId: string;
    ownedTaskIds: string[];
    memberAgentIds: string[];
    authorityId: string;
    budget: Record<string, number>;
    commandId: string;
  }): Promise<TeamResult>;
  getTeam(input: { teamId: string }): Promise<TeamResult>;
  freezeSubtree(input: {
    teamId: string;
    expectedGeneration: number;
    reason: string;
    commandId: string;
  }): Promise<TeamResult>;
  adoptSubtree(input: {
    teamId: string;
    successorAgentId: string;
    expectedGeneration: number;
    handoffEvidence: string;
    commandId: string;
  }): Promise<TeamResult>;
  closeSubtreeBarrier(input: {
    teamId: string;
    expectedGeneration: number;
    commandId: string;
  }): Promise<{ teamId: string; generation: number; closed: true }>;
  reserveBudget(input: {
    teamId: string;
    expectedTeamGeneration: number;
    parentBudgetId: string;
    budgetId: string;
    dimensions: Record<string, number>;
    commandId: string;
  }): Promise<BudgetResult>;
  recordBudgetUsage(input: {
    budgetId: string;
    usage: Record<string, number | null>;
    commandId: string;
  }): Promise<BudgetResult>;
  reconcileBudgetUsage(input: {
    budgetId: string;
    consumed: Record<string, number>;
    commandId: string;
  }): Promise<BudgetResult>;
  releaseBudget(input: { budgetId: string; commandId: string }): Promise<BudgetResult>;
  getBudget(input: { budgetId: string }): Promise<BudgetResult>;
};

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
  const fabric = await openFabric({ databasePath: join(directory, "fabric.sqlite3"), workspaceRoots: [directory] });
  const rootAuthority = {
    workspaceRoots: ["."],
    sourcePaths: ["src"],
    artifactPaths: [".agent-run/run-stage5"],
    actions: ["read", "write", "delegate", "message", "team"],
    disclosure: ["local"],
    expiresAt: "2099-01-01T00:00:00.000Z",
    budget: { turns: 100, "cost:USD": 50 },
  };
  const run = await fabric.createRun({
    runId: "run-stage5",
    projectRunDirectory: runDirectory,
    chair: { agentId: "chair", authority: rootAuthority },
  });
  const chairBase = fabric.connect(run.chairCapability);
  const leaderA = await chairBase.delegateAuthority({
    parentAuthorityId: run.chairAuthorityId,
    authority: {
      ...rootAuthority,
      sourcePaths: ["src/team-a"],
      budget: { turns: 30, "cost:USD": 15 },
    },
  });
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
  const leaderARegistration = await chairBase.registerAgent({ agentId: "leader-a", authorityId: leaderA.authorityId });
  const leaderBRegistration = await chairBase.registerAgent({ agentId: "leader-b", authorityId: leaderB.authorityId });
  const replacementRegistration = await chairBase.registerAgent({
    agentId: "leader-replacement",
    authorityId: replacement.authorityId,
  });
  const leaderABase = fabric.connect(leaderARegistration.capability);
  const workerA = await leaderABase.delegateAuthority({
    parentAuthorityId: leaderA.authorityId,
    authority: {
      ...rootAuthority,
      sourcePaths: ["src/team-a/worker"],
      actions: ["read", "write", "message"],
      budget: { turns: 5, "cost:USD": 2 },
    },
  });
  const workerARegistration = await leaderABase.registerAgent({ agentId: "worker-a", authorityId: workerA.authorityId });
  const leaderBBase = fabric.connect(leaderBRegistration.capability);
  const rootAReady = await chairBase.createTask({
    taskId: "team-a-root",
    authorityId: leaderA.authorityId,
    eligibleAgentIds: ["leader-a"],
    objective: "manage team A",
    baseRevision: "stage5-base",
    commandId: "stage5:create:root-a",
  });
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
  return await fixture.chair.createTeam({
    teamId: "team-a",
    leaderAgentId: "leader-a",
    rootTaskId: fixture.tasks.rootA.taskId,
    ownedTaskIds: [fixture.tasks.rootA.taskId, fixture.tasks.workerA.taskId],
    memberAgentIds: ["leader-a", "worker-a"],
    authorityId: fixture.authorities.leaderA,
    budget: { turns: 10, "cost:USD": 5 },
    commandId: "stage5:team-a:create",
  });
}

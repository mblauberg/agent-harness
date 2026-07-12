import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AUTHORITY_ACTION_VOCABULARY, openFabric } from "../../src/index.ts";
import type {
  AuthorityInput,
  FabricClient,
  TeamCreateInput,
  TeamResult,
} from "../../src/index.ts";
import { createCurrentSessionRun } from "./current-session-testkit.ts";

export const TEAM_ROOT_AUTHORITY: AuthorityInput = {
  workspaceRoots: ["."],
  sourcePaths: ["src"],
  artifactPaths: [".agent-run"],
  actions: [...AUTHORITY_ACTION_VOCABULARY],
  disclosure: { level: "scoped", scopes: ["local"] } as const,
  expiresAt: "2099-01-01T00:00:00.000Z",
  budget: { turns: 200, "cost:USD": 200, descendants: 20 },
};

type TeamMemberInput = {
  agentId: string;
  authority: AuthorityInput;
};

export function teamAuthority(options: {
  sourcePath: string;
  artifactPath: string;
  turns: number;
  costUsd: number;
  descendants: number;
}): AuthorityInput {
  return {
    ...TEAM_ROOT_AUTHORITY,
    sourcePaths: [options.sourcePath],
    artifactPaths: [options.artifactPath],
    budget: {
      turns: options.turns,
      "cost:USD": options.costUsd,
      descendants: options.descendants,
    },
  };
}

export function teamCreateInput(options: {
  teamId: string;
  parentTeamId?: string;
  sourcePath?: string;
  artifactPath?: string;
  leaderId?: string;
  memberAuthorities?: TeamMemberInput[];
  reservedBudget?: Record<string, number>;
}): TeamCreateInput {
  const leaderId = options.leaderId ?? `${options.teamId}-leader`;
  const sourcePath = options.sourcePath ?? `src/${options.teamId}`;
  const artifactPath = options.artifactPath ?? `.agent-run/${options.teamId}`;
  const leaderAuthority = teamAuthority({
    sourcePath,
    artifactPath,
    turns: 40,
    costUsd: 40,
    descendants: 6,
  });
  const initialMembers = options.memberAuthorities ?? [
    {
      agentId: `${options.teamId}-worker-a`,
      authority: teamAuthority({
        sourcePath: `${sourcePath}/worker-a`,
        artifactPath: `${artifactPath}/worker-a`,
        turns: 5,
        costUsd: 5,
        descendants: 0,
      }),
    },
    {
      agentId: `${options.teamId}-worker-b`,
      authority: teamAuthority({
        sourcePath: `${sourcePath}/worker-b`,
        artifactPath: `${artifactPath}/worker-b`,
        turns: 5,
        costUsd: 5,
        descendants: 0,
      }),
    },
  ];
  return {
    teamId: options.teamId,
    ...(options.parentTeamId === undefined ? {} : { parentTeamId: options.parentTeamId }),
    leader: { agentId: leaderId, authority: leaderAuthority },
    rootTask: {
      taskId: `${options.teamId}-root-task`,
      objective: `Deliver ${options.teamId}`,
      baseRevision: "revision-1",
    },
    initialMembers,
    discussionGroups: [
      {
        groupId: `${options.teamId}-coordination`,
        memberAgentIds: [leaderId, ...initialMembers.map((member) => member.agentId)],
      },
    ],
    reservedBudget: options.reservedBudget ?? { turns: 40, "cost:USD": 40, descendants: 6 },
    commandId: `create-team:${options.teamId}`,
  };
}

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function createTeam(
  client: Pick<FabricClient, "createTeam">,
  input: TeamCreateInput,
): Promise<TeamResult> {
  return await client.createTeam(input);
}

export async function issueTeamLeaderCapability(
  parentClient: Pick<FabricClient, "registerAgent">,
  team: TeamResult,
): Promise<string> {
  const leader = team.leader;
  if (leader === undefined) throw new TypeError("team leader identity is incomplete");
  const registration = await parentClient.registerAgent(leader);
  return registration.capability;
}

export async function createStage5TeamFixture(runId: string) {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-stage5-team-"));
  const databasePath = join(directory, "fabric.sqlite3");
  const fabric = await openFabric({ databasePath, workspaceRoots: [directory] });
  const run = await createCurrentSessionRun({
    databasePath,
    workspaceRoot: directory,
    runId,
    projectRunDirectory: directory,
    chair: { agentId: "chair", authority: TEAM_ROOT_AUTHORITY },
  });
  return {
    directory,
    fabric,
    run,
    chair: fabric.connect(run.chairCapability),
  };
}

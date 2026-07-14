import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AUTHORITY_ACTION_VOCABULARY, openFabric } from "../../src/index.ts";
import { createCurrentSessionRun } from "./current-session-testkit.ts";
import { TEST_AUTHORITY_V2_FIELDS } from "./authority-v2-testkit.ts";

const ROOT_AUTHORITY = {
  ...TEST_AUTHORITY_V2_FIELDS,
  workspaceRoots: ["."],
  sourcePaths: ["src"],
  artifactPaths: [".agent-run"],
  actions: [...AUTHORITY_ACTION_VOCABULARY],
  disclosure: { level: "scoped", scopes: ["local"] } as const,
  expiresAt: "2099-01-01T00:00:00.000Z",
  budget: { turns: 200, "cost:USD": 200, descendants: 40 },
};

type MessagingAgentId = "alice" | "bob" | "carol" | "dave";

type AtomicMessagingTeamInput = {
  teamId: string;
  leaderAgentId: string;
  memberAgentIds: string[];
  discussionGroups: Array<{ groupId: string; memberAgentIds: string[] }>;
};

export async function createStage5MessagingFixture() {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-stage5-messaging-"));
  const databasePath = join(directory, "fabric.sqlite3");
  const fabric = await openFabric({ databasePath, workspaceRoots: [directory] });
  const run = await createCurrentSessionRun({
    databasePath,
    workspaceRoot: directory,
    runId: "run-stage5-messaging",
    chair: { agentId: "chair", authority: ROOT_AUTHORITY },
  });
  const chair = fabric.connect(run.chairCapability);
  const clients: Record<string, ReturnType<typeof fabric.connect>> = { chair };
  const authorities: Record<string, string> = { chair: run.chairAuthorityId };

  for (const agentId of ["alice", "bob", "carol", "dave"]) {
    const delegated = await chair.delegateAuthority({
      parentAuthorityId: run.chairAuthorityId,
      commandId: `stage5:authority:${agentId}`,
      authority: {
        ...ROOT_AUTHORITY,
        sourcePaths: [`src/${agentId}`],
        artifactPaths: [`.agent-run/${agentId}`],
        actions: [...ROOT_AUTHORITY.actions],
        budget: { turns: 20, "cost:USD": 20 },
      },
    });
    const registration = await chair.registerAgent({ agentId, authorityId: delegated.authorityId });
    authorities[agentId] = delegated.authorityId;
    clients[agentId] = fabric.connect(registration.capability);
  }

  function client(agentId: MessagingAgentId) {
    const value = clients[agentId];
    if (value === undefined) throw new Error(`fixture client missing: ${agentId}`);
    return value;
  }

  function authority(agentId: MessagingAgentId): string {
    const value = authorities[agentId];
    if (value === undefined) throw new Error(`fixture authority missing: ${agentId}`);
    return value;
  }

  async function createAtomicTeam(input: AtomicMessagingTeamInput) {
    const leaderAuthority = {
      ...ROOT_AUTHORITY,
      sourcePaths: [`src/${input.teamId}`],
      artifactPaths: [`.agent-run/${input.teamId}`],
      budget: { turns: 30, "cost:USD": 30, descendants: input.memberAgentIds.length },
    };
    const result = await chair.createTeam({
      teamId: input.teamId,
      leader: { agentId: input.leaderAgentId, authority: leaderAuthority },
      rootTask: {
        taskId: `${input.teamId}-root-task`,
        objective: `Coordinate ${input.teamId}`,
        baseRevision: "rev-1",
      },
      initialMembers: input.memberAgentIds.map((agentId) => ({
        agentId,
        authority: {
          ...ROOT_AUTHORITY,
          sourcePaths: [`src/${input.teamId}/${agentId}`],
          artifactPaths: [`.agent-run/${input.teamId}/${agentId}`],
          budget: { turns: 3, "cost:USD": 3, descendants: 0 },
        },
      })),
      discussionGroups: input.discussionGroups,
      reservedBudget: {
        turns: input.memberAgentIds.length * 3,
        "cost:USD": input.memberAgentIds.length * 3,
        descendants: 0,
      },
      commandId: `team:create:${input.teamId}`,
    });
    if (result.leader === undefined || result.initialMembers === undefined) {
      throw new Error("atomic team result omitted provisioned identities");
    }
    const leaderRegistration = await chair.registerAgent(result.leader);
    const leader = fabric.connect(leaderRegistration.capability);
    const members: Record<string, { authorityId: string; client: ReturnType<typeof fabric.connect> }> = {};
    for (const member of result.initialMembers) {
      const registration = await leader.registerAgent(member);
      members[member.agentId] = {
        authorityId: member.authorityId,
        client: fabric.connect(registration.capability),
      };
    }
    return { result, leader, members };
  }

  return {
    directory,
    fabric,
    run,
    chair,
    alice: client("alice"),
    bob: client("bob"),
    carol: client("carol"),
    dave: client("dave"),
    authorities: {
      chair: run.chairAuthorityId,
      alice: authority("alice"),
      bob: authority("bob"),
      carol: authority("carol"),
      dave: authority("dave"),
    },
    createAtomicTeam,
    async cleanup(): Promise<void> {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

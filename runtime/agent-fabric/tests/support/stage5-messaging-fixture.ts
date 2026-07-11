import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openFabric } from "../../src/index.ts";

const ROOT_AUTHORITY = {
  workspaceRoots: ["."],
  sourcePaths: ["src"],
  artifactPaths: [".agent-run"],
  actions: ["read", "write", "delegate", "message", "team"],
  disclosure: ["local"],
  expiresAt: "2099-01-01T00:00:00.000Z",
  budget: { turns: 100, "cost:USD": 100 },
};

export async function createStage5MessagingFixture() {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-stage5-messaging-"));
  const fabric = await openFabric({ databasePath: join(directory, "fabric.sqlite3"), workspaceRoots: [directory] });
  const run = await fabric.createRun({
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
        actions: ["read", "write", "message"],
        budget: { turns: 20, "cost:USD": 20 },
      },
    });
    const registration = await chair.registerAgent({ agentId, authorityId: delegated.authorityId });
    authorities[agentId] = delegated.authorityId;
    clients[agentId] = fabric.connect(registration.capability);
  }

  function client(agentId: "alice" | "bob" | "carol" | "dave") {
    const value = clients[agentId];
    if (value === undefined) throw new Error(`fixture client missing: ${agentId}`);
    return value;
  }

  function authority(agentId: "alice" | "bob" | "carol" | "dave"): string {
    const value = authorities[agentId];
    if (value === undefined) throw new Error(`fixture authority missing: ${agentId}`);
    return value;
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
    async cleanup(): Promise<void> {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

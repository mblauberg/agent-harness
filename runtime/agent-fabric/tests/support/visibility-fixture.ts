import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openFabric } from "../../src/index.ts";

import { FakeHerdrBoundary, FakeProviderBoundary, VisibilityClock } from "./visibility-fakes.ts";

export const MANAGED_CAPABILITIES = [
  "status",
  "spawn",
  "send_turn",
  "interrupt",
  "resume_reference",
  "dispatch",
  "lookup_action",
  "cancel_action",
  "event_stream",
];

export const INTERACTIVE_CAPABILITIES = ["attach", "status", "wakeup", "resume_reference"];

export async function createVisibilityFixture(runId = "run-visibility") {
  const directory = await mkdtemp(join(tmpdir(), "fabric-visibility-"));
  const clock = new VisibilityClock();
  const fabric = await openFabric({ databasePath: join(directory, "fabric.sqlite3"), workspaceRoots: [directory], clock: clock.now });
  const authority = {
    workspaceRoots: ["."],
    sourcePaths: ["src"],
    artifactPaths: [".agent-run"],
    actions: ["read", "write", "delegate", "message"],
    disclosure: ["local"],
    expiresAt: "2099-01-01T00:00:00.000Z",
    budget: { turns: 20, "cost:USD": 20 },
  };
  const run = await fabric.createRun({ runId, chair: { agentId: "chair", authority } });
  const chair = fabric.connect(run.chairCapability);
  const peerAuthority = await chair.delegateAuthority({
    parentAuthorityId: run.chairAuthorityId,
    commandId: `${runId}:peer-authority`,
    authority: {
      ...authority,
      sourcePaths: ["src/peer"],
      artifactPaths: [".agent-run/peer"],
      actions: ["read", "write", "message"],
      budget: { turns: 8, "cost:USD": 8 },
    },
  });
  const peerRegistration = await chair.registerAgent({
    agentId: "peer",
    authorityId: peerAuthority.authorityId,
    providerSessionRef: "codex-session-1",
  });
  await chair.createDiscussionGroup({
    groupId: `${runId}:default-group`,
    memberAgentIds: ["chair", "peer"],
    commandId: `${runId}:default-group:create`,
  });
  const peer = fabric.connect(peerRegistration.capability);
  const herdr = new FakeHerdrBoundary();
  const provider = new FakeProviderBoundary();

  return {
    directory,
    clock,
    fabric,
    run,
    peerAuthorityId: peerAuthority.authorityId,
    chair,
    peer,
    herdr,
    provider,
    async cleanup(): Promise<void> {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

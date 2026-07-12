import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";
import { ROOT_AUTHORITY } from "../../support/stage1-fixture.ts";

describe("retryable token-bearing creation", () => {
  it("re-derives run and agent capabilities without storing plaintext tokens", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-capability-issuance-"));
    const databasePath = join(directory, "fabric.sqlite3");
    const capabilityKey = "k".repeat(43);
    try {
      const first = await openFabric({ databasePath, workspaceRoots: [directory], capabilityKey });
      const creation = { runId: "run-retryable-capabilities", chair: { agentId: "chair", authority: ROOT_AUTHORITY } };
      const run = await createCurrentSessionRun({ databasePath, workspaceRoot: directory, ...creation });
      expect(await createCurrentSessionRun({ databasePath, workspaceRoot: directory, ...creation })).toEqual(run);
      const chair = first.connect(run.chairCapability);
      const delegated = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        commandId: "capability:delegate",
        authority: { ...ROOT_AUTHORITY, sourcePaths: ["src/peer"], actions: ["read"], budget: { turns: 1 } },
      });
      const registration = await chair.registerAgent({ agentId: "peer", authorityId: delegated.authorityId });
      expect(await chair.registerAgent({ agentId: "peer", authorityId: delegated.authorityId })).toEqual(registration);
      const rotated = await chair.rotateCapability({ agentId: "peer", expectedPrincipalGeneration: 1, commandId: "capability:rotate" });
      expect(rotated).toMatchObject({ agentId: "peer", principalGeneration: 2 });
      expect(await chair.rotateCapability({ agentId: "peer", expectedPrincipalGeneration: 1, commandId: "capability:rotate" })).toEqual(rotated);
      expect(() => first.connect(registration.capability)).toThrow(expect.objectContaining({ code: "AUTHENTICATION_FAILED" }));
      await first.close();

      const reopened = await openFabric({ databasePath, workspaceRoots: [directory], capabilityKey });
      expect(await createCurrentSessionRun({ databasePath, workspaceRoot: directory, ...creation })).toEqual(run);
      expect(reopened.connect(rotated.capability)).toBeDefined();
      await reopened.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

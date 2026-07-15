import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AUTHORITY_ACTION_VOCABULARY, connectFabricDaemon, startFabricDaemon } from "../../src/index.ts";
import type { AuthorityInput } from "../../src/index.ts";
import { TEST_AUTHORITY_V2_FIELDS } from "../support/authority-v2-testkit.ts";
import { callTool, spawnMcpProxy } from "../support/mcp-testkit.ts";
import { requireRecord, teamCreateInput } from "../support/stage5-team-testkit.ts";
import { createCurrentSessionRun } from "../support/current-session-testkit.ts";

function storedAuthority(databasePath: string, authorityId: string): Record<string, unknown> {
  const database = new Database(databasePath, { readonly: true });
  try {
    const row = database.prepare("SELECT authority_json FROM authorities WHERE authority_id = ?").get(authorityId);
    if (typeof row !== "object" || row === null || !("authority_json" in row) || typeof row.authority_json !== "string") {
      throw new TypeError(`authority ${authorityId} was not persisted`);
    }
    const value: unknown = JSON.parse(row.authority_json);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError(`authority ${authorityId} is not an object`);
    }
    return value as Record<string, unknown>;
  } finally {
    database.close();
  }
}

describe("public authority contract", () => {
  it("preserves denial, ordered disclosure and qualified budgets through daemon and MCP boundaries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "afpc-"));
    const stateDirectory = join(directory, "state");
    const runtimeDirectory = join(directory, "runtime");
    const databasePath = join(stateDirectory, "fabric.sqlite3");
    const socketPath = join(runtimeDirectory, "fabric.sock");
    const daemon = await startFabricDaemon({
      databasePath,
      stateDirectory,
      runtimeDirectory,
      socketPath,
      workspaceRoots: [directory],
    });
    const bootstrap = await connectFabricDaemon({ socketPath, capability: daemon.bootstrapCapability });
    let chairProxy: Awaited<ReturnType<typeof spawnMcpProxy>> | undefined;
    try {
      const rootAuthority: AuthorityInput = {
        ...TEST_AUTHORITY_V2_FIELDS,
        workspaceRoots: ["."],
        sourcePaths: ["src"],
        artifactPaths: [".agent-run"],
        actions: [...AUTHORITY_ACTION_VOCABULARY],
        deniedPaths: ["src/public-contract/private"],
        deniedActions: ["fabric.v1.task.update"],
        disclosure: { level: "scoped", scopes: ["local", "approved-provider"] } as const,
        expiresAt: "2099-01-01T00:00:00.000Z",
        budget: { turns: 100, "cost:USD": 100, "input_tokens:google": 1_000, descendants: 20 },
      };
      const run = await createCurrentSessionRun({
        databasePath,
        workspaceRoot: directory,
        runId: "run-public-authority",
        chair: { agentId: "chair", authority: rootAuthority },
      });
      const expectedRootAuthority: AuthorityInput = {
        ...rootAuthority,
        actions: [...rootAuthority.actions].sort(),
        deniedPaths: [...rootAuthority.deniedPaths].sort(),
        deniedActions: [...rootAuthority.deniedActions].sort(),
        prohibitedActions: [...rootAuthority.prohibitedActions].sort(),
        disclosure: { level: "scoped", scopes: ["approved-provider", "local"] } as const,
        budget: Object.fromEntries(Object.entries(rootAuthority.budget).sort(([left], [right]) => left.localeCompare(right))),
      };
      expect(storedAuthority(databasePath, run.chairAuthorityId)).toEqual(expectedRootAuthority);

      const second = await createCurrentSessionRun({
        databasePath,
        workspaceRoot: directory,
        runId: "run-public-authority-local-only",
        chair: {
          agentId: "local-chair",
          authority: { ...rootAuthority, deniedPaths: [], deniedActions: [], disclosure: { level: "scoped", scopes: ["local"] } as const },
        },
      });
      expect(storedAuthority(databasePath, second.chairAuthorityId)).toEqual({
        ...expectedRootAuthority,
        deniedPaths: [],
        deniedActions: [],
        disclosure: { level: "scoped", scopes: ["local"] } as const,
      });

      chairProxy = await spawnMcpProxy({
        socketPath,
        capability: run.chairCapability,
        label: "public-authority-chair",
      });
      const invalidBudget = await callTool(chairProxy.client, "fabric_budget_usage_record", {
        budgetId: "invalid-public-budget",
        usage: { costUsd: 1 },
        commandId: "public-authority:invalid-budget",
      });
      expect(invalidBudget).toMatchObject({ isError: true, structured: { code: "MCP_INPUT_INVALID" } });
      const invalidCurrency = await callTool(chairProxy.client, "fabric_budget_usage_record", {
        budgetId: "invalid-public-currency",
        usage: { "cost:ZZZ": 1 },
        commandId: "public-authority:invalid-currency",
      });
      expect(invalidCurrency).toMatchObject({ isError: true, structured: { code: "MCP_INPUT_INVALID" } });

      const input = teamCreateInput({
        teamId: "public-contract",
        memberAuthorities: [],
        reservedBudget: { turns: 40, "cost:USD": 40, "input_tokens:google": 400, descendants: 6 },
      });
      const leader = requireRecord(input.leader, "team leader");
      const leaderAuthority = requireRecord(leader.authority, "team leader authority");
      const created = await callTool(chairProxy.client, "fabric_team_create", {
        ...input,
        leader: {
          ...leader,
          authority: {
            ...rootAuthority,
            workspaceRoots: ["."],
            sourcePaths: ["src/public-contract"],
            artifactPaths: [".agent-run/public-contract"],
            actions: leaderAuthority.actions,
            deniedPaths: ["src/public-contract/private"],
            deniedActions: ["fabric.v1.task.update"],
            disclosure: { level: "scoped", scopes: ["approved-provider"] } as const,
            expiresAt: "2099-01-01T00:00:00.000Z",
            budget: { turns: 40, "cost:USD": 40, "input_tokens:google": 400, descendants: 6 },
          },
        },
        discussionGroups: [],
      });
      expect(created.isError, created.text).toBe(false);
      const createdLeader = requireRecord(created.structured.leader, "created leader");
      if (typeof createdLeader.authorityId !== "string") throw new TypeError("created leader authority is missing");
      expect(storedAuthority(databasePath, createdLeader.authorityId)).toEqual({
        ...expectedRootAuthority,
        sourcePaths: ["src/public-contract"],
        artifactPaths: [".agent-run/public-contract"],
        actions: [...(leaderAuthority.actions as string[])].sort(),
        disclosure: { level: "scoped", scopes: ["approved-provider"] } as const,
        budget: { turns: 40, "cost:USD": 40, "input_tokens:google": 400, descendants: 6 },
      });
    } finally {
      await Promise.allSettled([chairProxy?.close(), bootstrap.close()]);
      await daemon.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

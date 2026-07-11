import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { connectFabricDaemon, startFabricDaemon } from "../../src/index.ts";
import {
  callTool,
  MCP_ROOT_AUTHORITY,
  spawnMcpProxy,
  type McpProxy,
} from "../support/mcp-testkit.ts";
import { requireRecord, teamCreateInput } from "../support/stage5-team-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe("Stage 5 lifecycle through the shared daemon and MCP", () => {
  it("runs recovery, budget reconciliation and barrier close through chair and leader proxies", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-stage5-mcp-"));
    const stateDirectory = join(directory, "state");
    const runtimeDirectory = join(directory, "runtime");
    const socketPath = join(runtimeDirectory, "fabric.sock");
    const daemon = await startFabricDaemon({
      databasePath: join(stateDirectory, "fabric.sqlite3"),
      stateDirectory,
      runtimeDirectory,
      socketPath,
      workspaceRoots: [directory],
    });
    const bootstrap = await connectFabricDaemon({
      socketPath,
      capability: daemon.bootstrapCapability,
    });
    const run = await bootstrap.createRun({
      runId: "run-stage5-daemon-mcp",
      projectRunDirectory: join(directory, "project-run"),
      chair: { agentId: "chair", authority: MCP_ROOT_AUTHORITY },
    });
    const chairProxy = await spawnMcpProxy({
      socketPath,
      capability: run.chairCapability,
      label: "stage5-chair",
    });
    const chairDaemon = await connectFabricDaemon({
      socketPath,
      capability: run.chairCapability,
    });
    let leaderProxy: McpProxy | undefined;
    let leaderDaemon: Awaited<ReturnType<typeof connectFabricDaemon>> | undefined;
    cleanup.push(async () => {
      await Promise.allSettled([
        chairProxy.close(),
        leaderProxy?.close(),
        leaderDaemon?.close(),
        chairDaemon.close(),
        bootstrap.close(),
      ]);
      await daemon.stop();
      await rm(directory, { recursive: true, force: true });
    });

    const tools = await chairProxy.client.listTools();
    const stage5ToolNames = [
      "fabric_subtree_freeze",
      "fabric_subtree_adopt",
      "fabric_subtree_barrier_close",
      "fabric_budget_reserve",
      "fabric_budget_usage_record",
      "fabric_budget_usage_reconcile",
      "fabric_budget_release",
      "fabric_budget_get",
      "fabric_task_handoff_acknowledge",
    ];
    expect(tools.tools.filter((tool) => stage5ToolNames.includes(tool.name)).map((tool) => tool.name)).toEqual(stage5ToolNames);
    expect(tools.tools.find((tool) => tool.name === "fabric_budget_get")?.outputSchema).toMatchObject({
      type: "object",
      required: ["budgetId", "parentBudgetId", "state", "dimensions", "returned"],
    });

    const created = await callTool(
      chairProxy.client,
      "fabric_team_create",
      {
        ...teamCreateInput({
          teamId: "stage5-mcp-team",
          memberAuthorities: [],
          reservedBudget: { turns: 40, "cost:USD": 40, descendants: 6 },
        }),
        discussionGroups: [],
      },
    );
    expect(created.isError).toBe(false);
    const leader = requireRecord(created.structured.leader, "created leader");
    if (typeof leader.capability !== "string") throw new TypeError("leader capability is missing");
    leaderProxy = await spawnMcpProxy({
      socketPath,
      capability: leader.capability,
      label: "stage5-leader",
    });
    leaderDaemon = await connectFabricDaemon({ socketPath, capability: leader.capability });

    await expect(leaderDaemon.freezeSubtree({
      teamId: "stage5-mcp-team",
      expectedGeneration: 1,
      reason: "leader attempted self-promotion",
      commandId: "stage5:mcp:freeze:not-chair",
    })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });

    const frozen = await callTool(chairProxy.client, "fabric_subtree_freeze", {
      teamId: "stage5-mcp-team",
      expectedGeneration: 1,
      reason: "leader session lost",
      commandId: "stage5:mcp:freeze",
    });
    expect(frozen).toMatchObject({
      isError: false,
      structured: { teamId: "stage5-mcp-team", state: "frozen", generation: 2 },
    });

    const adopted = await callTool(chairProxy.client, "fabric_subtree_adopt", {
      teamId: "stage5-mcp-team",
      successorAgentId: "stage5-mcp-team-leader",
      expectedGeneration: 2,
      handoffEvidence: "checkpoints/stage5-mcp-team.json#sha256",
      commandId: "stage5:mcp:adopt",
    });
    expect(adopted).toMatchObject({
      isError: false,
      structured: {
        teamId: "stage5-mcp-team",
        leaderAgentId: "stage5-mcp-team-leader",
        state: "active",
        generation: 3,
      },
    });

    const invalidUsage = await callTool(leaderProxy.client, "fabric_budget_usage_record", {
      budgetId: "stage5-mcp-child-budget",
      usage: { turns: -1 },
      commandId: "stage5:mcp:usage:invalid",
    });
    expect(invalidUsage).toMatchObject({
      isError: true,
      structured: { code: "MCP_INPUT_INVALID" },
    });

    const reserved = await callTool(leaderProxy.client, "fabric_budget_reserve", {
      teamId: "stage5-mcp-team",
      expectedTeamGeneration: 3,
      parentBudgetId: "stage5-mcp-team:budget",
      budgetId: "stage5-mcp-child-budget",
      dimensions: { turns: 10 },
      commandId: "stage5:mcp:budget:reserve",
    });
    expect(reserved).toMatchObject({
      isError: false,
      structured: {
        budgetId: "stage5-mcp-child-budget",
        state: "active",
        dimensions: { turns: { granted: 10, consumed: 0, available: 10 } },
      },
    });

    const unknown = await callTool(leaderProxy.client, "fabric_budget_usage_record", {
      budgetId: "stage5-mcp-child-budget",
      usage: { turns: null },
      commandId: "stage5:mcp:budget:unknown",
    });
    expect(unknown).toMatchObject({
      isError: false,
      structured: { dimensions: { turns: { usageUnknown: true } } },
    });
    const frozenBudget = await callTool(leaderProxy.client, "fabric_budget_release", {
      budgetId: "stage5-mcp-child-budget",
      commandId: "stage5:mcp:budget:release-unknown",
    });
    expect(frozenBudget).toMatchObject({
      isError: false,
      structured: { state: "usage-unknown" },
    });

    const reconciled = await callTool(chairProxy.client, "fabric_budget_usage_reconcile", {
      budgetId: "stage5-mcp-child-budget",
      consumed: { turns: 4 },
      commandId: "stage5:mcp:budget:reconcile",
    });
    expect(reconciled).toMatchObject({
      isError: false,
      structured: { state: "active", dimensions: { turns: { consumed: 4, usageUnknown: false } } },
    });
    const released = await callTool(leaderProxy.client, "fabric_budget_release", {
      budgetId: "stage5-mcp-child-budget",
      commandId: "stage5:mcp:budget:release",
    });
    expect(released).toMatchObject({
      isError: false,
      structured: { state: "released", returned: { turns: 6 } },
    });
    const readBudget = await callTool(chairProxy.client, "fabric_budget_get", {
      budgetId: "stage5-mcp-child-budget",
    });
    expect(readBudget).toMatchObject({
      isError: false,
      structured: { state: "released", returned: { turns: 6 } },
    });
    await expect(chairDaemon.getBudget({
      budgetId: "stage5-mcp-child-budget",
    })).resolves.toMatchObject({ state: "released", returned: { turns: 6 } });

    const prematureClose = await callTool(leaderProxy.client, "fabric_subtree_barrier_close", {
      teamId: "stage5-mcp-team",
      expectedGeneration: 3,
      commandId: "stage5:mcp:barrier:premature",
    });
    expect(prematureClose).toMatchObject({
      isError: true,
      structured: { code: "BARRIER_PRECONDITION_FAILED" },
    });

    const claimed = await callTool(leaderProxy.client, "fabric_task_claim", {
      taskId: "stage5-mcp-team-root-task",
      expectedRevision: 1,
      commandId: "stage5:mcp:root:claim",
    });
    expect(claimed.isError).toBe(false);
    const completed = await callTool(leaderProxy.client, "fabric_task_complete", {
      taskId: "stage5-mcp-team-root-task",
      expectedRevision: 2,
      state: "complete",
      commandId: "stage5:mcp:root:complete",
    });
    expect(completed).toMatchObject({ isError: false, structured: { revision: 3 } });
    const handoff = await callTool(chairProxy.client, "fabric_task_handoff_acknowledge", {
      taskId: "stage5-mcp-team-root-task",
      taskRevision: 3,
      ownerLeaseGeneration: 1,
      commandId: "stage5:mcp:root:handoff",
    });
    expect(handoff).toMatchObject({
      isError: false,
      structured: { acknowledged: true },
    });

    const closed = await callTool(leaderProxy.client, "fabric_subtree_barrier_close", {
      teamId: "stage5-mcp-team",
      expectedGeneration: 3,
      commandId: "stage5:mcp:barrier:close",
    });
    expect(closed).toEqual({
      isError: false,
      structured: { teamId: "stage5-mcp-team", generation: 3, closed: true },
      text: "fabric_subtree_barrier_close completed",
    });
  });
});

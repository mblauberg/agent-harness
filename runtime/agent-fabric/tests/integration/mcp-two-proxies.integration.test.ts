import { afterEach, describe, expect, it } from "vitest";

import { callTool, createMcpFixture, recordArray } from "../support/mcp-testkit.ts";

// Stage 2 assignment (AFAB-001): FR-002 and AC-012 — two independently started
// stdio proxy processes (labelled Claude and Codex) connect through the same
// per-user unix socket to one daemon and observe one run, task revision,
// command journal and mailbox store.

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) {
    await close();
  }
});

describe("Stage 2 shared daemon through two stdio MCP proxies (FR-002, AC-012)", () => {
  it("a task assigned by the Claude chair proxy is claimed and completed by the Codex peer proxy", async () => {
    const fixture = await createMcpFixture("run-mcp-tasks");
    cleanup.push(() => fixture.cleanup());

    const assigned = await callTool(fixture.chairProxy.client, "fabric_task_create", {
      taskId: "task-mcp-1",
      authorityId: fixture.peerAuthorityId,
      eligibleAgentIds: ["peer"],
      objective: "exercise the shared task graph over MCP",
      baseRevision: "base-1",
      commandId: "mcp:tasks:assign-1",
    });
    expect(assigned.isError).toBe(false);
    expect(assigned.structured).toMatchObject({ taskId: "task-mcp-1", state: "ready", revision: 1 });

    // The Codex-labelled proxy sees the task created by the Claude-labelled
    // proxy: one store, no per-client fork.
    const claimed = await callTool(fixture.peerProxy.client, "fabric_task_claim", {
      taskId: "task-mcp-1",
      expectedRevision: 1,
      commandId: "mcp:tasks:claim-1",
    });
    expect(claimed.isError).toBe(false);
    expect(claimed.structured).toMatchObject({
      taskId: "task-mcp-1",
      ownerAgentId: "peer",
      state: "active",
      revision: 2,
    });

    // Stale revision from either client is rejected by the same
    // compare-and-set state.
    const stale = await callTool(fixture.peerProxy.client, "fabric_task_claim", {
      taskId: "task-mcp-1",
      expectedRevision: 1,
      commandId: "mcp:tasks:claim-stale",
    });
    expect(stale.isError).toBe(true);
    expect(stale.structured).toMatchObject({ code: "TASK_REVISION_CONFLICT" });

    const completed = await callTool(fixture.peerProxy.client, "fabric_task_update", {
      taskId: "task-mcp-1",
      expectedRevision: 2,
      state: "complete",
      commandId: "mcp:tasks:complete-1",
    });
    expect(completed.isError).toBe(false);
    expect(completed.structured).toMatchObject({ state: "complete", revision: 3 });

    // Retrying the original assignment through the chair proxy replays the
    // committed result from the shared command journal — it does not recreate
    // or observe a different task state.
    const replay = await callTool(fixture.chairProxy.client, "fabric_task_create", {
      taskId: "task-mcp-1",
      authorityId: fixture.peerAuthorityId,
      eligibleAgentIds: ["peer"],
      objective: "exercise the shared task graph over MCP",
      baseRevision: "base-1",
      commandId: "mcp:tasks:assign-1",
    });
    expect(replay.isError).toBe(false);
    expect(replay.structured).toMatchObject({ taskId: "task-mcp-1", state: "ready", revision: 1 });
  });

  it("messages sent by one proxy are received, acknowledged and sequenced through the other", async () => {
    const fixture = await createMcpFixture("run-mcp-mailbox");
    cleanup.push(() => fixture.cleanup());

    const first = await callTool(fixture.chairProxy.client, "fabric_message_send", {
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "first over mcp",
      requiresAck: true,
      dedupeKey: "mcp:mailbox:first",
    });
    expect(first.isError).toBe(false);
    const second = await callTool(fixture.chairProxy.client, "fabric_message_send", {
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "second over mcp",
      requiresAck: true,
      dedupeKey: "mcp:mailbox:second",
    });
    expect(second.isError).toBe(false);

    const received = await callTool(fixture.peerProxy.client, "fabric_message_receive", {
      limit: 10,
      visibilityTimeoutMs: 30_000,
    });
    expect(received.isError).toBe(false);
    const deliveries = recordArray(received.structured.deliveries, "deliveries");
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((delivery) => delivery.sequence)).toEqual([1, 2]);
    expect(deliveries.map((delivery) => delivery.body)).toEqual(["first over mcp", "second over mcp"]);

    const firstDelivery = deliveries[0];
    if (firstDelivery === undefined || typeof firstDelivery.deliveryId !== "string") {
      throw new Error("expected a delivery id from the peer proxy");
    }
    const acknowledged = await callTool(fixture.peerProxy.client, "fabric_delivery_acknowledge", {
      deliveryId: firstDelivery.deliveryId,
    });
    expect(acknowledged.isError).toBe(false);

    // The peer replies through its own proxy; the chair consumes it through
    // the shared mailbox store, completing the symmetric round trip.
    const reply = await callTool(fixture.peerProxy.client, "fabric_message_send", {
      audience: { kind: "agents", agentIds: ["chair"] },
      kind: "response",
      body: "ack first",
      requiresAck: false,
      dedupeKey: "mcp:mailbox:reply",
    });
    expect(reply.isError).toBe(false);
    const chairInbox = await callTool(fixture.chairProxy.client, "fabric_message_receive", {
      limit: 10,
      visibilityTimeoutMs: 30_000,
    });
    expect(chairInbox.isError).toBe(false);
    const chairDeliveries = recordArray(chairInbox.structured.deliveries, "deliveries");
    expect(chairDeliveries.map((delivery) => delivery.body)).toEqual(["ack first"]);
  });
});

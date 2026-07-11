import { afterEach, describe, expect, it } from "vitest";

import { callTool, createMcpFixture, recordArray } from "../../support/mcp-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("AC-001 symmetric paired messaging", () => {
  it.each([
    { chair: "claude-chair", peer: "codex-peer" },
    { chair: "codex-chair", peer: "claude-peer" },
  ])("persists and acknowledges request/reply with $chair and $peer", async (labels) => {
    const fixture = await createMcpFixture(`run-pair-${labels.chair}`, labels);
    cleanup.push(fixture.cleanup);
    const request = await callTool(fixture.chairProxy.client, "fabric_message_send", {
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "review the bounded artifact",
      requiresAck: true,
      dedupeKey: `${labels.chair}:request`,
    });
    const peerInbox = await callTool(fixture.peerProxy.client, "fabric_message_receive", {
      limit: 10,
      visibilityTimeoutMs: 30_000,
    });
    const requestDeliveries = recordArray(peerInbox.structured.deliveries, "peer deliveries");
    expect(requestDeliveries).toHaveLength(1);
    const requestDelivery = requestDeliveries[0];
    if (requestDelivery === undefined || typeof requestDelivery.deliveryId !== "string") {
      throw new TypeError("peer delivery is invalid");
    }
    expect(requestDelivery.messageId).toBe(request.structured.messageId);
    await callTool(fixture.peerProxy.client, "fabric_message_ack", { deliveryId: requestDelivery.deliveryId });

    const response = await callTool(fixture.peerProxy.client, "fabric_message_send", {
      audience: { kind: "agents", agentIds: ["chair"] },
      kind: "response",
      body: "bounded review complete",
      requiresAck: true,
      dedupeKey: `${labels.peer}:response`,
    });
    const chairInbox = await callTool(fixture.chairProxy.client, "fabric_message_receive", {
      limit: 10,
      visibilityTimeoutMs: 30_000,
    });
    const responseDeliveries = recordArray(chairInbox.structured.deliveries, "chair deliveries");
    expect(responseDeliveries).toHaveLength(1);
    const responseDelivery = responseDeliveries[0];
    if (responseDelivery === undefined || typeof responseDelivery.deliveryId !== "string") {
      throw new TypeError("chair delivery is invalid");
    }
    expect(responseDelivery.messageId).toBe(response.structured.messageId);
    await callTool(fixture.chairProxy.client, "fabric_message_ack", { deliveryId: responseDelivery.deliveryId });
    const assigned = await callTool(fixture.chairProxy.client, "fabric_task_assign", {
      taskId: `pair-task-${labels.peer}`,
      authorityId: fixture.peerAuthorityId,
      eligibleAgentIds: ["peer"],
      objective: "publish paired review evidence",
      baseRevision: "pair-base",
      commandId: `${labels.chair}:task:assign`,
    });
    const claimed = await callTool(fixture.peerProxy.client, "fabric_task_claim", {
      taskId: assigned.structured.taskId,
      expectedRevision: assigned.structured.revision,
      commandId: `${labels.peer}:task:claim`,
    });
    const artifactHash = "a".repeat(64);
    const artifact = await callTool(fixture.peerProxy.client, "fabric_artifact_publish", {
      taskId: assigned.structured.taskId,
      relativePath: `paired/${labels.peer}.json`,
      sha256: artifactHash,
      commandId: `${labels.peer}:artifact:publish`,
    });
    expect(artifact.structured.sha256).toBe(artifactHash);
    const completed = await callTool(fixture.peerProxy.client, "fabric_task_complete", {
      taskId: assigned.structured.taskId,
      expectedRevision: claimed.structured.revision,
      state: "complete",
      commandId: `${labels.peer}:task:complete`,
    });
    expect(completed.structured.revision).toBe(3);
    expect(await fixture.peerProxy.client.readResource({ uri: `fabric://runs/${fixture.run.runId}/status` })).toBeDefined();
  });
});

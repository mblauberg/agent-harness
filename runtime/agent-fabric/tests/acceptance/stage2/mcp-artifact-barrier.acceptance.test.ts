import { afterEach, describe, expect, it } from "vitest";

import { callTool, createMcpFixture, recordArray } from "../../support/mcp-testkit.ts";

// Stage 2 assignment (AFAB-001): public contracts for fabric_artifact_publish,
// fabric_barrier_close, fabric_run_status_read and the four run resources.
//
// BLOCKED SUB-SLICE: these tests are the failing public contract required by
// the assignment. The MCP facade forwards each operation to the daemon, but
// the core lacks publishArtifact, closeBarrier, getRunStatus, listTasks,
// listAgents and listReceipts. The exact serial core request is recorded in
// .agent-run/AFAB-001/pair/anthropic/stage2-core-request.md. These tests go
// GREEN with no facade change once the requested core/daemon operations land.

const SHA256_OF_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) {
    await close();
  }
});

describe("Stage 2 fabric_artifact_publish contract (blocked on core publishArtifact)", () => {
  it("publishes a workspace-bounded relative path with its SHA-256 and returns the recorded reference", async () => {
    const fixture = await createMcpFixture("run-mcp-artifact");
    cleanup.push(() => fixture.cleanup());

    const published = await callTool(fixture.chairProxy.client, "fabric_artifact_publish", {
      relativePath: "findings/report.md",
      sha256: SHA256_OF_EMPTY,
      commandId: "mcp:artifact:publish-1",
    });
    expect(published.isError).toBe(false);
    expect(published.structured).toMatchObject({
      relativePath: "findings/report.md",
      sha256: SHA256_OF_EMPTY,
    });
    expect(typeof published.structured.artifactId).toBe("string");
  });

  it("rejects traversal, absolute and malformed-digest publications with typed errors", async () => {
    const fixture = await createMcpFixture("run-mcp-artifact-reject");
    cleanup.push(() => fixture.cleanup());

    const traversal = await callTool(fixture.chairProxy.client, "fabric_artifact_publish", {
      relativePath: "../outside.md",
      sha256: SHA256_OF_EMPTY,
      commandId: "mcp:artifact:traversal",
    });
    expect(traversal.isError).toBe(true);
    expect(traversal.structured).toMatchObject({ code: "MCP_INPUT_INVALID" });

    const absolute = await callTool(fixture.chairProxy.client, "fabric_artifact_publish", {
      relativePath: "/etc/report.md",
      sha256: SHA256_OF_EMPTY,
      commandId: "mcp:artifact:absolute",
    });
    expect(absolute.isError).toBe(true);
    expect(absolute.structured).toMatchObject({ code: "MCP_INPUT_INVALID" });

    const badDigest = await callTool(fixture.chairProxy.client, "fabric_artifact_publish", {
      relativePath: "findings/ok.md",
      sha256: "not-a-digest",
      commandId: "mcp:artifact:bad-digest",
    });
    expect(badDigest.isError).toBe(true);
    expect(badDigest.structured).toMatchObject({ code: "MCP_INPUT_INVALID" });
  });
});

describe("Stage 2 fabric_barrier_close contract (blocked on core closeBarrier)", () => {
  it("is chair-only and refuses closure while required work is unresolved", async () => {
    const fixture = await createMcpFixture("run-mcp-barrier");
    cleanup.push(() => fixture.cleanup());

    // Non-chair callers are refused outright.
    const forbidden = await callTool(fixture.peerProxy.client, "fabric_barrier_close", {
      scope: "run",
      commandId: "mcp:barrier:peer-attempt",
    });
    expect(forbidden.isError).toBe(true);
    expect(forbidden.structured).toMatchObject({ code: "CAPABILITY_FORBIDDEN" });

    // An unacknowledged requires_ack delivery is an unmet closure predicate
    // (spec section 12: required messages acknowledged or abandoned).
    const send = await callTool(fixture.chairProxy.client, "fabric_message_send", {
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "must be consumed before closure",
      requiresAck: true,
      dedupeKey: "mcp:barrier:pending-ack",
    });
    expect(send.isError).toBe(false);
    const refused = await callTool(fixture.chairProxy.client, "fabric_barrier_close", {
      scope: "run",
      commandId: "mcp:barrier:premature",
    });
    expect(refused.isError).toBe(true);
    expect(refused.structured).toMatchObject({ code: "BARRIER_PRECONDITION_FAILED" });

    // Drain and acknowledge, then closure succeeds and reports the receipt
    // reference (FR-018: schema-valid receipt exported before barrier close).
    const received = await callTool(fixture.peerProxy.client, "fabric_message_receive", {
      limit: 10,
      visibilityTimeoutMs: 30_000,
    });
    const deliveries = recordArray(received.structured.deliveries, "deliveries");
    for (const delivery of deliveries) {
      if (typeof delivery.deliveryId !== "string") {
        throw new Error("expected a delivery id");
      }
      const acked = await callTool(fixture.peerProxy.client, "fabric_delivery_acknowledge", {
        deliveryId: delivery.deliveryId,
      });
      expect(acked.isError).toBe(false);
    }
    const closed = await callTool(fixture.chairProxy.client, "fabric_barrier_close", {
      scope: "run",
      commandId: "mcp:barrier:close",
    });
    expect(closed.isError).toBe(false);
    expect(closed.structured).toMatchObject({ scope: "run", closed: true });
    expect(closed.structured.receipt).toMatchObject({ schemaVersion: 2 });
    expect(String((closed.structured.receipt as Record<string, unknown>).relativePath)).toMatch(/^fabric-receipt-[0-9a-f]{64}\.json$/u);
  });

  it("lets only the chair abandon a stranded delivery with a reason and then close the barrier", async () => {
    const fixture = await createMcpFixture("run-mcp-barrier-abandon");
    cleanup.push(() => fixture.cleanup());
    await callTool(fixture.chairProxy.client, "fabric_message_send", {
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "recipient session was lost",
      requiresAck: true,
      dedupeKey: "mcp:barrier:abandon",
    });
    const received = await callTool(fixture.peerProxy.client, "fabric_message_receive", {
      limit: 1,
      visibilityTimeoutMs: 30_000,
    });
    const delivery = recordArray(received.structured.deliveries, "deliveries")[0];
    if (typeof delivery?.deliveryId !== "string") throw new Error("expected a delivery id");

    const forbidden = await callTool(fixture.peerProxy.client, "fabric_delivery_abandon", {
      deliveryId: delivery.deliveryId,
      reason: "self-abandon is forbidden",
      commandId: "mcp:barrier:peer-abandon",
    });
    expect(forbidden).toMatchObject({ isError: true, structured: { code: "CAPABILITY_FORBIDDEN" } });
    const abandoned = await callTool(fixture.chairProxy.client, "fabric_delivery_abandon", {
      deliveryId: delivery.deliveryId,
      reason: "peer session irrecoverably lost; operator approved abandonment",
      commandId: "mcp:barrier:chair-abandon",
    });
    expect(abandoned).toMatchObject({
      isError: false,
      structured: { deliveryId: delivery.deliveryId, status: "abandoned" },
    });
    const closed = await callTool(fixture.chairProxy.client, "fabric_barrier_close", {
      scope: "run",
      commandId: "mcp:barrier:close-after-abandon",
    });
    expect(closed).toMatchObject({ isError: false, structured: { closed: true } });
  });
});

describe("Stage 2 fabric_run_status_read and run resources contract (blocked on core read surface)", () => {
  it("reports one shared run status to both clients", async () => {
    const fixture = await createMcpFixture("run-mcp-status");
    cleanup.push(() => fixture.cleanup());

    const viaChair = await callTool(fixture.chairProxy.client, "fabric_run_status_read", {
      runId: "run-mcp-status",
    });
    expect(viaChair.isError).toBe(false);
    expect(viaChair.structured).toMatchObject({
      runId: "run-mcp-status",
      chairAgentId: "chair",
    });
    const viaPeer = await callTool(fixture.peerProxy.client, "fabric_run_status_read", {
      runId: "run-mcp-status",
    });
    expect(viaPeer.isError).toBe(false);
    expect(viaPeer.structured).toEqual(viaChair.structured);
  });

  it("round-trips the four run resources identically from both clients (AC-012)", async () => {
    const fixture = await createMcpFixture("run-mcp-resource-read");
    cleanup.push(() => fixture.cleanup());

    for (const view of ["status", "tasks", "agents", "receipts"]) {
      const uri = `fabric://runs/run-mcp-resource-read/${view}`;
      const viaChair = await fixture.chairProxy.client.readResource({ uri });
      const viaPeer = await fixture.peerProxy.client.readResource({ uri });
      expect(viaChair.contents).toHaveLength(1);
      const chairContent = viaChair.contents[0];
      expect(chairContent).toMatchObject({ uri, mimeType: "application/json" });
      expect(viaPeer.contents).toEqual(viaChair.contents);
      if (chairContent === undefined || !("text" in chairContent) || typeof chairContent.text !== "string") {
        throw new Error(`resource ${view} returned no text content`);
      }
      const text = chairContent.text;
      expect(() => JSON.parse(text)).not.toThrow();
    }
  });
});

import { afterEach, describe, expect, it } from "vitest";

import { callTool, createMcpFixture, recordArray, spawnMcpProxy } from "../../support/mcp-testkit.ts";

// Stage 2 assignment (AFAB-001): FR-001 and NFR-007 — Claude and Codex MCP
// clients expose the same fabric tool and resource semantics with no
// harness-specific fork. Both proxies here run the same entry point with only
// the client label and capability differing.

const STAGE_2_TOOL_NAMES = [
  "fabric_artifact_publish",
  "fabric_barrier_close",
  "fabric_delivery_acknowledge",
  "fabric_message_receive",
  "fabric_message_send",
  "fabric_run_status_read",
  "fabric_task_create",
  "fabric_task_claim",
  "fabric_task_update",
];

const STAGE_2_RESOURCE_TEMPLATES = [
  "fabric://runs/{run_id}/agents",
  "fabric://runs/{run_id}/receipts",
  "fabric://runs/{run_id}/status",
  "fabric://runs/{run_id}/tasks",
];

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  // LIFO: proxies must close before the daemon they are connected to, or the
  // daemon's server.close() waits on their open sockets.
  for (const close of cleanup.splice(0).reverse()) {
    await close();
  }
});

describe("Stage 2 MCP facade symmetry (FR-001, NFR-007)", () => {
  it("exposes identical generated schemas for the Stage 2 operations granted to both clients", async () => {
    const fixture = await createMcpFixture("run-mcp-symmetry");
    cleanup.push(() => fixture.cleanup());

    const claudeTools = await fixture.chairProxy.client.listTools();
    const codexTools = await fixture.peerProxy.client.listTools();

    const names = claudeTools.tools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(STAGE_2_TOOL_NAMES));
    const codexByName = new Map(codexTools.tools.map((tool) => [tool.name, tool]));
    for (const name of STAGE_2_TOOL_NAMES) {
      expect(codexByName.get(name)).toStrictEqual(claudeTools.tools.find((tool) => tool.name === name));
    }
    expect(names).not.toContain("fabric_run_create");
    for (const tool of claudeTools.tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(tool.outputSchema).toMatchObject({ type: "object" });
    }
  });

  it("exposes the four Stage 2 resource templates identically to both clients", async () => {
    const fixture = await createMcpFixture("run-mcp-resources");
    cleanup.push(() => fixture.cleanup());

    const claude = await fixture.chairProxy.client.listResourceTemplates();
    const codex = await fixture.peerProxy.client.listResourceTemplates();

    expect(claude.resourceTemplates.map((template) => template.uriTemplate)).toEqual(
      STAGE_2_RESOURCE_TEMPLATES,
    );
    expect(codex.resourceTemplates).toEqual(claude.resourceTemplates);
  });

  it("rejects a bootstrap capability before any tool advertisement", async () => {
    const fixture = await createMcpFixture("run-mcp-create-base");
    cleanup.push(() => fixture.cleanup());

    await expect(spawnMcpProxy({
      socketPath: fixture.socketPath,
      capability: fixture.daemon.bootstrapCapability,
      label: "claude-bootstrap",
    })).rejects.toThrow();
  });

  it("returns typed fabric error codes across the MCP boundary, never raw driver errors", async () => {
    const fixture = await createMcpFixture("run-mcp-errors");
    cleanup.push(() => fixture.cleanup());

    const missing = await callTool(fixture.peerProxy.client, "fabric_task_claim", {
      taskId: "task-does-not-exist",
      expectedRevision: 1,
      commandId: "mcp:errors:claim-missing",
    });
    expect(missing.isError).toBe(true);
    // Unknown task identity is reported as a typed public NOT_FOUND error,
    // never a raw SQLite/driver failure.
    expect(missing.structured).toMatchObject({ code: "NOT_FOUND" });

    const original = await callTool(fixture.chairProxy.client, "fabric_message_send", {
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "original",
      requiresAck: false,
      dedupeKey: "mcp:errors:dedupe",
    });
    expect(original.isError).toBe(false);
    expect(original.text).toMatch(/^sent request → agents:peer · msg .+ · no ack · delivery pending$/u);
    expect(original.text).not.toContain("original");
    const conflict = await callTool(fixture.chairProxy.client, "fabric_message_send", {
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "changed",
      requiresAck: false,
      dedupeKey: "mcp:errors:dedupe",
    });
    expect(conflict.isError).toBe(true);
    expect(conflict.structured).toMatchObject({ code: "DEDUPE_CONFLICT" });
    expect(JSON.stringify(conflict.structured)).not.toMatch(/SqliteError|SQLITE_/u);
  });

  it("validates tool arguments at the shared MCP boundary before daemon dispatch", async () => {
    const fixture = await createMcpFixture("run-mcp-input-validation");
    cleanup.push(() => fixture.cleanup());
    const invalid = await callTool(fixture.chairProxy.client, "fabric_message_receive", {
      limit: 1,
      visibilityTimeoutMs: 1_000,
      unexpected: true,
    });
    expect(invalid).toMatchObject({ isError: true, structured: { code: "MCP_INPUT_INVALID" } });

    const excessiveHop = await callTool(fixture.chairProxy.client, "fabric_message_send", {
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "event",
      body: "too many hops",
      requiresAck: false,
      hopCount: 5,
      dedupeKey: "mcp:errors:hop-limit",
    });
    expect(excessiveHop).toMatchObject({
      isError: true,
      structured: { code: "MESSAGE_HOP_LIMIT_EXCEEDED" },
    });
  });

  it("expands a task audience through the shared MCP and daemon path", async () => {
    const fixture = await createMcpFixture("run-mcp-task-audience");
    cleanup.push(() => fixture.cleanup());
    const assigned = await callTool(fixture.chairProxy.client, "fabric_task_create", {
      taskId: "task-audience",
      authorityId: fixture.peerAuthorityId,
      eligibleAgentIds: ["peer"],
      participantAgentIds: ["chair", "peer"],
      objective: "MCP task audience",
      baseRevision: "rev-1",
      commandId: "mcp:task-audience:assign",
    });
    expect(assigned.isError).toBe(false);

    const sent = await callTool(fixture.chairProxy.client, "fabric_message_send", {
      audience: { kind: "task", taskId: "task-audience" },
      kind: "event",
      body: "task-wide",
      requiresAck: false,
      dedupeKey: "mcp:task-audience:send",
    });
    expect(sent.isError).toBe(false);
    const chairDeliveries = await callTool(fixture.chairProxy.client, "fabric_message_receive", {
      limit: 10,
      visibilityTimeoutMs: 1_000,
    });
    const peerDeliveries = await callTool(fixture.peerProxy.client, "fabric_message_receive", {
      limit: 10,
      visibilityTimeoutMs: 1_000,
    });
    const chairRecords = recordArray(
      chairDeliveries.structured.deliveries,
      "chair deliveries",
    );
    const peerRecords = recordArray(peerDeliveries.structured.deliveries, "peer deliveries");
    expect(chairRecords).toHaveLength(1);
    expect(peerRecords).toHaveLength(1);
    expect(chairRecords[0]).toMatchObject({
      senderId: "chair",
      kind: "event",
      requiresAck: false,
    });
    expect(peerRecords[0]).toMatchObject({
      senderId: "chair",
      kind: "event",
      requiresAck: false,
    });
  });
});

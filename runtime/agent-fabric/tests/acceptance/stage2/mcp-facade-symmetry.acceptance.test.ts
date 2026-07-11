import { afterEach, describe, expect, it } from "vitest";

import { callTool, createMcpFixture, MCP_ROOT_AUTHORITY, recordArray, spawnMcpProxy } from "../../support/mcp-testkit.ts";

// Stage 2 assignment (AFAB-001): FR-001 and NFR-007 — Claude and Codex MCP
// clients expose the same fabric tool and resource semantics with no
// harness-specific fork. Both proxies here run the same entry point with only
// the client label and capability differing.

const STAGE_2_TOOL_NAMES = [
  "fabric_artifact_publish",
  "fabric_barrier_close",
  "fabric_message_ack",
  "fabric_message_receive",
  "fabric_message_send",
  "fabric_run_create",
  "fabric_run_status",
  "fabric_task_assign",
  "fabric_task_claim",
  "fabric_task_complete",
];

const STAGE_2_RESOURCE_TEMPLATES = [
  "fabric://runs/{run_id}/status",
  "fabric://runs/{run_id}/tasks",
  "fabric://runs/{run_id}/agents",
  "fabric://runs/{run_id}/receipts",
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
  it("exposes the full Stage 2 tool set with identical schemas to both clients", async () => {
    const fixture = await createMcpFixture("run-mcp-symmetry");
    cleanup.push(() => fixture.cleanup());

    const claudeTools = await fixture.chairProxy.client.listTools();
    const codexTools = await fixture.peerProxy.client.listTools();

    const names = claudeTools.tools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(STAGE_2_TOOL_NAMES));
    // NFR-007: identical protocol surface — names, descriptions and JSON
    // schemas byte-equal between the Claude-labelled and Codex-labelled client.
    expect(codexTools.tools).toEqual(claudeTools.tools);
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

  it("creates a run through fabric_run_create under the bootstrap capability only", async () => {
    const fixture = await createMcpFixture("run-mcp-create-base");
    cleanup.push(() => fixture.cleanup());

    const bootstrapProxy = await spawnMcpProxy({
      socketPath: fixture.socketPath,
      capability: fixture.daemon.bootstrapCapability,
      label: "claude-bootstrap",
    });
    cleanup.push(() => bootstrapProxy.close());

    const created = await callTool(bootstrapProxy.client, "fabric_run_create", {
      runId: "run-mcp-created",
      chair: { agentId: "chair", authority: MCP_ROOT_AUTHORITY },
    });
    expect(created.isError).toBe(false);
    expect(created.structured).toMatchObject({ runId: "run-mcp-created" });
    expect(typeof created.structured.chairCapability).toBe("string");
    expect(typeof created.structured.chairAuthorityId).toBe("string");
    expect(created.text).toBe("created run run-mcp-created · chair capability issued (redacted)");
    expect(created.text).not.toContain(String(created.structured.chairCapability));

    // A non-bootstrap capability must not create runs.
    const forbidden = await callTool(fixture.peerProxy.client, "fabric_run_create", {
      runId: "run-mcp-forbidden",
      chair: { agentId: "chair2", authority: MCP_ROOT_AUTHORITY },
    });
    expect(forbidden.isError).toBe(true);
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
    // Core checks claim eligibility before task existence, so an unknown task
    // surfaces as CAPABILITY_FORBIDDEN; the contract here is a typed fabric
    // code either way.
    expect(missing.structured).toMatchObject({ code: "CAPABILITY_FORBIDDEN" });

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
      structured: { code: "MCP_INPUT_INVALID" },
    });
  });

  it("expands a task audience through the shared MCP and daemon path", async () => {
    const fixture = await createMcpFixture("run-mcp-task-audience");
    cleanup.push(() => fixture.cleanup());
    const assigned = await callTool(fixture.chairProxy.client, "fabric_task_assign", {
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

import { afterEach, describe, expect, it } from "vitest";

import { callTool, createMcpFixture } from "../../support/mcp-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("Stage 3 MCP client-surface symmetry", () => {
  it("serves identical Stage 3 schemas to Claude and Codex proxies", async () => {
    const fixture = await createMcpFixture("run-stage3-mcp-symmetry");
    cleanup.push(fixture.cleanup);
    const [chairTools, peerTools] = await Promise.all([
      fixture.chairProxy.client.listTools(),
      fixture.peerProxy.client.listTools(),
    ]);
    expect(chairTools.tools).toEqual(peerTools.tools);
    const names = new Set(chairTools.tools.map((tool) => tool.name));
    for (const name of [
      "fabric_agent_spawn",
      "fabric_agent_attach",
      "fabric_agent_steer",
      "fabric_agent_release",
      "fabric_lifecycle_request",
      "fabric_operator_intervention",
    ]) {
      expect(names.has(name), `${name} missing`).toBe(true);
    }
  });

  it("routes an intervention through the shared daemon and into the receipt", async () => {
    const fixture = await createMcpFixture("run-stage3-mcp-intervention");
    cleanup.push(fixture.cleanup);
    const recorded = await callTool(fixture.chairProxy.client, "fabric_operator_intervention", {
      source: "fabric",
      directInputProvenance: "complete",
      taskRevision: 1,
      summary: "bounded MCP steering",
      commandId: "mcp:intervention:1",
    });
    expect(recorded.isError).toBe(false);
    const barrier = await callTool(fixture.chairProxy.client, "fabric_barrier_close", {
      scope: "run",
      commandId: "mcp:intervention:barrier",
    });
    expect(barrier.isError).toBe(false);
    const receipt = await fixture.chairProxy.client.readResource({
      uri: `fabric://runs/${fixture.run.runId}/receipts`,
    });
    expect(JSON.stringify(receipt)).toMatch(/fabric-receipt-[0-9a-f]{64}\.json/u);
  });
});

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");

describe("registered MCP smoke contract", () => {
  it("uses only current generated tool names and exact registered agent identities", async () => {
    const [manifestText, health, roundtrip] = await Promise.all([
      readFile(resolve(root, "runtime/agent-fabric-protocol/schemas/mcp-agent-tools.json"), "utf8"),
      readFile(resolve(root, "runtime/agent-fabric/smoke/registered-mcp-health.mjs"), "utf8"),
      readFile(resolve(root, "runtime/agent-fabric/smoke/registered-mcp-roundtrip.mjs"), "utf8"),
    ]);
    const manifest = JSON.parse(manifestText) as {
      tools: Array<{ name: string }>;
    };
    const currentTools = new Set(manifest.tools.map(({ name }) => name));
    const referenced = [...`${health}\n${roundtrip}`.matchAll(/"(fabric_[a-z_]+)"/gu)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined);

    expect(referenced.length).toBeGreaterThan(0);
    expect(referenced.filter((name) => !currentTools.has(name))).toStrictEqual([]);
    expect(roundtrip).toContain("agentIds: [claudeMetadata.agentId]");
    expect(roundtrip).toContain("agentIds: [codexMetadata.agentId]");
    expect(roundtrip).toContain('"fabric_discussion_group_create"');
    expect(roundtrip).toContain('context: { kind: "discussion-group", groupId }');
    expect(roundtrip).not.toMatch(/agentIds:\s*\["(?:claude|codex)"\]/u);
  });
});

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";

import {
  NdjsonRpcTransport,
  PROTOCOL_FEATURES,
  buildMcpDescriptorSet,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { createFabricMcpServer } from "../../../src/mcp/server.ts";
import { callTool, createMcpFixture } from "../../support/mcp-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).reverse().map(async (close) => close()));
});

describe("registry-owned MCP projection", () => {
  it("advertises only the negotiated generated agent descriptors and calls the public protocol", async () => {
    const fixture = await createMcpFixture("run-mcp-registry");
    cleanup.push(fixture.cleanup);
    const transport = await NdjsonRpcTransport.connect(createConnection(fixture.socketPath), {
      protocolVersion: 1,
      client: { name: "mcp-registry-oracle", version: "1.0.0" },
      authentication: {
        scheme: "capability",
        credential: fixture.run.chairCapability,
        clientNonce: `mcp_registry_${randomUUID()}`,
      },
      expectedPrincipalKind: "agent",
      requiredFeatures: ["fabric-core.v1"],
      optionalFeatures: PROTOCOL_FEATURES.filter((feature) => feature !== "fabric-core.v1"),
    });
    cleanup.push(async () => transport.close());
    const expected = buildMcpDescriptorSet(transport.allowedOperations);

    const listed = await fixture.chairProxy.client.listTools();
    expect(listed.tools).toStrictEqual(expected.tools.map(({ name, description, inputSchema, outputSchema }) => ({
      name,
      description,
      inputSchema,
      outputSchema,
    })));
    expect(listed.tools.map(({ name }) => name)).not.toEqual(expect.arrayContaining([
      "fabric_run_create",
      "fabric_launch_attest",
      "fabric_agent_steer",
      "fabric_agent_release",
    ]));

    const statusDescriptor = expected.tools.find(({ operation }) => operation === "fabric.v1.run-status.read");
    expect(statusDescriptor).toBeDefined();
    const status = await callTool(fixture.chairProxy.client, statusDescriptor?.name ?? "missing", {
      runId: fixture.run.runId,
    });
    expect(status).toMatchObject({
      isError: false,
      structured: { runId: fixture.run.runId, chairAgentId: "chair" },
    });

    const evidenceContent = "MCP registered review\n";
    const evidenceDigest = `sha256:${createHash("sha256").update(evidenceContent).digest("hex")}`;
    await mkdir(join(fixture.directory, ".agent-run"), { recursive: true });
    await writeFile(join(fixture.directory, ".agent-run", "review.md"), evidenceContent);
    const database = new Database(fixture.databasePath, { readonly: true });
    const identity = database.prepare("SELECT project_session_id FROM runs WHERE run_id=?")
      .get(fixture.run.runId) as { project_session_id: string };
    database.close();
    const evidence = await callTool(fixture.chairProxy.client, "fabric_evidence_publish", {
      commandId: "mcp_evidence_publish_01",
      projectSessionId: identity.project_session_id,
      coordinationRunId: fixture.run.runId,
      requestedSourceKind: "project-file",
      evidenceKind: "review",
      relativePath: ".agent-run/review.md",
      sourceDigest: evidenceDigest,
    });
    expect(evidence).toMatchObject({
      isError: false,
      structured: {
        evidenceRevision: 1,
        sourceKind: "project-file",
        evidenceKind: "review",
        artifactRef: {
          path: ".agent-run/review.md",
          digest: evidenceDigest,
        },
      },
    });
    const callerRoot = await callTool(fixture.chairProxy.client, "fabric_evidence_publish", {
      commandId: "mcp_evidence_publish_invalid",
      projectSessionId: identity.project_session_id,
      coordinationRunId: fixture.run.runId,
      requestedSourceKind: "project-file",
      evidenceKind: "review",
      relativePath: ".agent-run/review.md",
      sourceDigest: evidenceDigest,
      sourceRoot: fixture.directory,
    });
    expect(callerRoot).toMatchObject({
      isError: true,
      structured: { code: "MCP_INPUT_INVALID" },
    });
    const missing = await callTool(fixture.chairProxy.client, "fabric_provider_action_read", {
      actionId: "missing-action",
    });
    expect(missing).toMatchObject({ isError: true, structured: { code: "NOT_FOUND" } });

    const templates = await fixture.chairProxy.client.listResourceTemplates();
    expect(templates.resourceTemplates).toStrictEqual(expected.resources.map((descriptor) => ({
      uriTemplate: descriptor.uriTemplate,
      name: descriptor.name,
      description: descriptor.description,
      mimeType: descriptor.mimeType,
    })));
  });

  it("rejects a bootstrap capability before an MCP server can advertise tools", async () => {
    const fixture = await createMcpFixture("run-mcp-bootstrap-reject");
    cleanup.push(fixture.cleanup);
    let handle: Awaited<ReturnType<typeof createFabricMcpServer>> | undefined;
    let failure: unknown;
    try {
      handle = await createFabricMcpServer({
        socketPath: fixture.socketPath,
        capability: fixture.daemon.bootstrapCapability,
      });
    } catch (error: unknown) {
      failure = error;
    } finally {
      await handle?.close();
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toMatch(/agent capability|principal|authentication/iu);
  });
});

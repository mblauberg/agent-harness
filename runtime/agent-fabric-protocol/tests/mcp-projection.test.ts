import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FABRIC_OPERATIONS,
  MCP_PROJECTION_LIMITS,
  MCP_PROJECTION_REGISTRY,
  OPERATION_CODECS,
  buildMcpDescriptorSet,
  operationInputSchemaForPrincipal,
  operationsForPrincipal,
  renderMcpReceipt,
  type FabricOperation,
} from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const temporarilyNonProjectable = new Set<FabricOperation>([
  FABRIC_OPERATIONS.registerAgent,
  FABRIC_OPERATIONS.revokeCapability,
  FABRIC_OPERATIONS.rotateCapability,
]);

function containsSensitiveSchema(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveSchema);
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record["x-agent-fabric-sensitive"] === true || Object.values(record).some(containsSensitiveSchema);
}

function containsBearerProperty(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsBearerProperty);
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const properties = record.properties;
  if (
    typeof properties === "object" && properties !== null && !Array.isArray(properties) &&
    Object.keys(properties).some((name) => /^(?:capability|credential|token)$/iu.test(name))
  ) return true;
  return Object.values(record).some(containsBearerProperty);
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

describe("registry-owned current-agent MCP projection", () => {
  it("teaches retained providers when to compact or rotate", () => {
    const lifecycle = MCP_PROJECTION_REGISTRY[FABRIC_OPERATIONS.requestLifecycle];
    expect(lifecycle).toMatchObject({ projection: "tool" });
    if (lifecycle.projection !== "tool") throw new Error("lifecycle request is not projected");
    expect(lifecycle.description).toContain("Checkpoint first");
    expect(lifecycle.description).toContain("compact");
    expect(lifecycle.description).toContain("rotate/clear");
    expect(lifecycle.description).toContain("four answer-bearing turns");
    expect(lifecycle.description).toContain("five minutes");
    expect(lifecycle.description).toContain("Codex");
  });

  it("owns a launch-scoped one-use attestation descriptor", () => {
    const launchAttestation = FABRIC_OPERATIONS.launchAttest;

    expect(launchAttestation).toBe("fabric.v1.launch.attest");
    const descriptor = buildMcpDescriptorSet(new Set<FabricOperation>([launchAttestation])).tools[0];
    expect(descriptor).toMatchObject({
      operation: "fabric.v1.launch.attest",
      name: "fabric_launch_attest",
      feature: "launch-attestation.v1",
      receiptRenderer: "launch-attestation-v1",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["challengeResponse"],
      },
      outputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["attested", "challengeDigest"],
      },
    });
    if (descriptor === undefined) throw new Error("launch attestation descriptor is missing");
    expect(renderMcpReceipt(
      descriptor,
      { challengeResponse: "challenge-must-not-render" },
      { attested: true, challengeDigest: `sha256:${"a".repeat(64)}` },
    )).toBe("launch continuity attested");
  });

  it("classifies every active agent operation exactly once", () => {
    const activeAgentOperations = [...operationsForPrincipal("agent")].sort();

    expect(Object.keys(MCP_PROJECTION_REGISTRY).sort()).toStrictEqual(activeAgentOperations);
    for (const operation of activeAgentOperations) {
      const projection = MCP_PROJECTION_REGISTRY[operation];
      expect(projection).toBeDefined();
      expect(projection?.projection).toBe(temporarilyNonProjectable.has(operation) ? "none" : "tool");
    }
  });

  it("derives exact closed schemas and stable unique names for the authorised tool set", () => {
    const allowed = new Set(operationsForPrincipal("agent"));
    const generated = buildMcpDescriptorSet(allowed);
    const names = generated.tools.map(({ name }) => name);

    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("fabric_run_create");
    expect(generated.tools.length).toBeLessThanOrEqual(MCP_PROJECTION_LIMITS.maximumTools);
    for (const descriptor of generated.tools) {
      expect(descriptor.name).toMatch(/^fabric_[a-z0-9_]+$/u);
      expect(descriptor.inputCodecDigest).toBe(digest(operationInputSchemaForPrincipal(descriptor.operation, "agent")));
      expect(descriptor.outputCodecDigest).toBe(digest(OPERATION_CODECS[descriptor.operation].result.schema));
      expect(descriptor.receiptRenderer).toMatch(/-v1$/u);
      expect(descriptor.inputSchema.type).toBe("object");
      expect(descriptor.outputSchema.type).toBe("object");
      expect(containsSensitiveSchema(descriptor.inputSchema)).toBe(false);
      expect(containsSensitiveSchema(descriptor.outputSchema)).toBe(false);
      expect(Buffer.byteLength(JSON.stringify(descriptor), "utf8"))
        .toBeLessThanOrEqual(MCP_PROJECTION_LIMITS.maximumDescriptorBytes);
    }
    expect(Buffer.byteLength(JSON.stringify(generated.tools), "utf8"))
      .toBeLessThanOrEqual(MCP_PROJECTION_LIMITS.maximumDescriptorSetBytes);
  });

  it("projects spawn, attach and identity-only team creation without bearer material", () => {
    const generated = buildMcpDescriptorSet(new Set(operationsForPrincipal("agent"))).tools;
    for (const operation of [
      FABRIC_OPERATIONS.spawnAgent,
      FABRIC_OPERATIONS.attachAgent,
      FABRIC_OPERATIONS.createTeam,
    ]) {
      const descriptor = generated.find((candidate) => candidate.operation === operation);
      expect(descriptor, operation).toBeDefined();
      expect(containsSensitiveSchema(descriptor?.outputSchema)).toBe(false);
      expect(containsBearerProperty(descriptor?.outputSchema)).toBe(false);
    }

    const spawn = generated.find(({ operation }) => operation === FABRIC_OPERATIONS.spawnAgent);
    expect(spawn?.outputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: [
        "agentId", "authorityId", "adapterId", "actionId", "providerSessionRef",
        "providerSessionGeneration", "bridgeState", "bridgeGeneration", "evidenceDigest",
      ],
      properties: { bridgeState: { enum: ["active", "none"] } },
    });

    const team = generated.find(({ operation }) => operation === FABRIC_OPERATIONS.createTeam);
    expect(team?.outputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    const output = record(team?.outputSchema, "team output schema");
    const properties = record(output.properties, "team output properties");
    const leader = record(properties.leader, "team leader schema");
    expect(leader.$ref).toMatch(/^#\/\$defs\/[A-Za-z0-9_]+$/u);
    const definitionName = String(leader.$ref).slice("#/$defs/".length);
    const definitions = record(output.$defs, "team output definitions");
    expect(definitions[definitionName]).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["agentId", "authorityId"],
    });
  });

  it("projects the four resources through their generated read tools", () => {
    const generated = buildMcpDescriptorSet(new Set(operationsForPrincipal("agent")));
    expect(generated.resources.map(({ uriTemplate, operation }) => ({ uriTemplate, operation }))).toStrictEqual([
      { uriTemplate: "fabric://runs/{run_id}/agents", operation: FABRIC_OPERATIONS.listAgents },
      { uriTemplate: "fabric://runs/{run_id}/receipts", operation: FABRIC_OPERATIONS.listReceipts },
      { uriTemplate: "fabric://runs/{run_id}/status", operation: FABRIC_OPERATIONS.getRunStatus },
      { uriTemplate: "fabric://runs/{run_id}/tasks", operation: FABRIC_OPERATIONS.listTasks },
    ]);
  });

  it("renders human receipts through the registry-owned renderer without secret material", () => {
    const descriptor = buildMcpDescriptorSet(new Set(operationsForPrincipal("agent"))).tools
      .find(({ operation }) => operation === FABRIC_OPERATIONS.sendMessage);
    expect(descriptor).toBeDefined();
    const receipt = renderMcpReceipt(
      descriptor ?? { name: "fabric_missing", receiptRenderer: "generic-v1" },
      { audience: { kind: "agents", agentIds: ["peer"] }, kind: "request", requiresAck: true },
      { messageId: "message-1", credential: "afc_must-not-render" },
    );
    expect(receipt).toBe("sent request → agents:peer · msg message-1 · ack required · delivery pending");
    expect(receipt).not.toContain("afc_must-not-render");
  });

  it("publishes the generated descriptor reference without a second vocabulary", () => {
    const published = JSON.parse(readFileSync(join(root, "schemas/mcp-agent-tools.json"), "utf8")) as unknown;
    const descriptors = buildMcpDescriptorSet(new Set(operationsForPrincipal("agent")));
    expect(published).toStrictEqual({
      schemaVersion: 1,
      principalKind: "agent",
      limits: MCP_PROJECTION_LIMITS,
      classifications: MCP_PROJECTION_REGISTRY,
      tools: descriptors.tools,
      resources: descriptors.resources,
    });
  });

  it("projects provider actions through discriminated review-safe and bounded ordinary results", () => {
    const descriptors = buildMcpDescriptorSet(new Set(operationsForPrincipal("agent"))).tools;
    for (const operation of [
      FABRIC_OPERATIONS.dispatchProviderAction,
      FABRIC_OPERATIONS.reconcileProviderAction,
      FABRIC_OPERATIONS.getProviderAction,
    ]) {
      const descriptor = descriptors.find((candidate) => candidate.operation === operation);
      expect(descriptor).toBeDefined();
      const serialized = JSON.stringify(descriptor?.outputSchema);
      expect(serialized).toContain('"oneOf"');
      expect(serialized).toContain('"non-review"');
      expect(serialized).toContain('"certifying-review"');
      expect(serialized).toContain('"providerAnswer"');
      expect(serialized).toContain('"x-maxUtf8Bytes":262144');
      expect(serialized.indexOf('"providerAnswer"')).toBeLessThan(serialized.indexOf('"certifying-review"'));
      expect(serialized).not.toContain('"result"');
    }
  });
});

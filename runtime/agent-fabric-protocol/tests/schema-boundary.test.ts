import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";

import { FABRIC_OPERATIONS, PROTOCOL_SCHEMA } from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const addFormats = createRequire(import.meta.url)("ajv-formats") as FormatsPlugin;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);

describe("published protocol schema", () => {
  it("enumerates the exact public operation vocabulary", () => {
    const schema = JSON.parse(readFileSync(join(root, "schemas/protocol.schema.json"), "utf8"));

    expect(schema.$defs.fabricOperation.enum).toStrictEqual(Object.values(FABRIC_OPERATIONS));
  });

  it("closes every published object schema against unknown fields", () => {
    const schema = JSON.parse(readFileSync(join(root, "schemas/protocol.schema.json"), "utf8"));
    const objectDefinitions = Object.values(schema.$defs).filter(
      (definition): definition is Record<string, unknown> =>
        typeof definition === "object" && definition !== null && Reflect.get(definition, "type") === "object",
    );

    expect(objectDefinitions.length).toBeGreaterThan(5);
    expect(objectDefinitions.every((definition) => definition.additionalProperties === false)).toBe(true);
  });

  it("publishes the generated schema without hand-maintained drift", () => {
    const schema = JSON.parse(readFileSync(join(root, "schemas/protocol.schema.json"), "utf8"));
    expect(schema).toStrictEqual(PROTOCOL_SCHEMA);
  });

  it("rejects mixed principals and capability variants that widen authority", () => {
    const principal = ajv.compile({
      $schema: PROTOCOL_SCHEMA.$schema,
      $ref: "#/$defs/initializeRequest",
      $defs: PROTOCOL_SCHEMA.$defs,
    });
    const capability = ajv.compile({
      $schema: PROTOCOL_SCHEMA.$schema,
      $ref: "#/$defs/operatorCapability",
      $defs: PROTOCOL_SCHEMA.$defs,
    });

    expect(principal({
      protocolVersion: 1,
      client: { name: "test", version: "1" },
      principal: {
        kind: "operator",
        operatorId: "operator_01",
        agentId: "agent_01",
        projectId: "project_01",
        principalGeneration: 1,
      },
      requiredFeatures: [],
      optionalFeatures: [],
    })).toBe(false);
    expect(capability({
      capabilityId: "capability_01",
      operatorId: "operator_01",
      projectId: "project_01",
      principalGeneration: 1,
      issuedAt: "2026-07-11T10:00:00Z",
      expiresAt: "2026-07-11T11:00:00Z",
      status: "active",
      kind: "project-launch",
      actions: ["read", "launch"],
      takeoverBinding: {
        handoffDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        oldChairGeneration: 1,
        expectedRunId: "run_01",
        expectedRunRevision: 1,
        expectedSessionRevision: 1,
        targetRevision: 2,
      },
    })).toBe(false);

    const gateCreate = ajv.compile(PROTOCOL_SCHEMA.$defs.rpcRequest);
    expect(gateCreate({
      id: "request_01",
      operation: FABRIC_OPERATIONS.scopedGateCreate,
      input: { command: { spoof: true }, gate: {} },
    })).toBe(false);
  });
});

describe("standalone package boundary", () => {
  it("never imports daemon or legacy runtime internals", () => {
    const sources = readdirSync(join(root, "src"), { recursive: true })
      .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".ts"))
      .map((entry) => readFileSync(join(root, "src", entry), "utf8"));

    expect(sources.join("\n")).not.toMatch(/agent-fabric\/src|\.\.\/agent-fabric|\/daemon\//u);
  });
});

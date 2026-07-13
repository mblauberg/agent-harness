import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PROTOCOL_SCHEMA, SPEC05_CONTRACT_SCHEMAS } from "../dist/schema.js";
import {
  MCP_PROJECTION_LIMITS,
  MCP_PROJECTION_REGISTRY,
  buildMcpDescriptorSet,
} from "../dist/mcp-projection.js";
import { operationsForPrincipal } from "../dist/operations.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemasDirectory = join(root, "schemas");
const generated = new Map([
  ["protocol.schema.json", `${JSON.stringify(PROTOCOL_SCHEMA)}\n`],
]);
for (const [name, schema] of Object.entries(SPEC05_CONTRACT_SCHEMAS)) {
  const definitions = {
    boundedJsonValue: PROTOCOL_SCHEMA.$defs.boundedJsonValue,
    jsonValueNode: PROTOCOL_SCHEMA.$defs.jsonValueNode,
    ...(schema.$defs ?? {}),
  };
  generated.set(
    `${name}.schema.json`,
    `${JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", ...schema, $defs: definitions }, null, 2)}\n`,
  );
}
const mcpDescriptors = buildMcpDescriptorSet(operationsForPrincipal("agent"));
const mcpReference = {
  schemaVersion: 1,
  principalKind: "agent",
  limits: MCP_PROJECTION_LIMITS,
  classifications: MCP_PROJECTION_REGISTRY,
  tools: mcpDescriptors.tools,
  resources: mcpDescriptors.resources,
};
generated.set("mcp-agent-tools.json", `${JSON.stringify(mcpReference, null, 2)}\n`);

const mode = process.argv[2] ?? "--write";
if (!new Set(["--check", "--write"]).has(mode) || process.argv.length > 3) {
  throw new Error("usage: node scripts/write-schema.mjs [--check|--write]");
}

const expectedNames = [...generated.keys()].sort();
const existingNames = (await readdir(schemasDirectory))
  .filter((name) => name.endsWith(".json"))
  .sort();

if (mode === "--check") {
  if (JSON.stringify(existingNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `generated schema file set differs: expected ${expectedNames.join(", ")}; found ${existingNames.join(", ")}`,
    );
  }
  for (const [name, expected] of generated) {
    const actual = await readFile(join(schemasDirectory, name), "utf8");
    if (actual !== expected) {
      throw new Error(`generated schema differs: ${name}`);
    }
  }
} else {
  const expected = new Set(expectedNames);
  for (const name of existingNames) {
    if (!expected.has(name)) {
      await unlink(join(schemasDirectory, name));
    }
  }
  for (const [name, contents] of generated) {
    await writeFile(join(schemasDirectory, name), contents, "utf8");
  }
}

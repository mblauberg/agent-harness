import { writeFile } from "node:fs/promises";
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
await writeFile(join(root, "schemas/protocol.schema.json"), `${JSON.stringify(PROTOCOL_SCHEMA, null, 2)}\n`, "utf8");
for (const [name, schema] of Object.entries(SPEC05_CONTRACT_SCHEMAS)) {
  const definitions = {
    boundedJsonValue: PROTOCOL_SCHEMA.$defs.boundedJsonValue,
    jsonValueNode: PROTOCOL_SCHEMA.$defs.jsonValueNode,
    ...(schema.$defs ?? {}),
  };
  await writeFile(
    join(root, "schemas", `${name}.schema.json`),
    `${JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", ...schema, $defs: definitions }, null, 2)}\n`,
    "utf8",
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
await writeFile(join(root, "schemas/mcp-agent-tools.json"), `${JSON.stringify(mcpReference, null, 2)}\n`, "utf8");

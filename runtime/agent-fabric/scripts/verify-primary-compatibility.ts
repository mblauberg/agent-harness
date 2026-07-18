import { join, resolve } from "node:path";

import { verifyAdapterCompatibility } from "../src/adapters/compatibility.js";

const root = resolve(import.meta.dirname, "../../..");
const adapterIds = ["claude-agent-sdk", "codex-app-server"];
const result = await verifyAdapterCompatibility({
  compatibilityPath: join(root, "config/adapter-compatibility.yaml"),
  schemaPath: join(root, "runtime/agent-fabric/schemas/adapter-compatibility.schema.json"),
  adapterIds,
  requireEnabled: true,
});

process.stdout.write(`${JSON.stringify({
  status: "pass",
  adapterIds: result.adapterIds,
  verifiedArtifactCount: result.verifiedArtifactCount,
})}\n`);

import { join, resolve } from "node:path";

import { verifyAdapterCompatibility } from "../src/adapters/compatibility.js";
import { verifyProviderExecutableIdentity } from "../src/adapters/provider-identity.js";
import { probeProviderInterface } from "../src/adapters/provider-interface.js";

const root = resolve(import.meta.dirname, "../../..");
const adapterIds = ["claude-agent-sdk", "codex-app-server"];
const result = await verifyAdapterCompatibility({
  compatibilityPath: join(root, "config/adapter-compatibility.yaml"),
  schemaPath: join(root, "runtime/agent-fabric/schemas/adapter-compatibility.schema.json"),
  adapterIds,
  requireEnabled: true,
});
const observations = [];
for (const adapterId of adapterIds) {
  const executable = result.resolvedExecutables[adapterId];
  if (executable === undefined) throw new Error(`provider executable is missing: ${adapterId}`);
  const identity = await verifyProviderExecutableIdentity({ adapterId, executable });
  const contract = await probeProviderInterface({ adapterId, executable });
  observations.push({ adapterId, canonicalPath: identity.canonicalPath, version: contract.version, sha256: identity.sha256, assurance: identity.assurance, signing: identity.signing });
}

process.stdout.write(`${JSON.stringify({
  status: "pass",
  adapterIds: result.adapterIds,
  verifiedArtifactCount: result.verifiedArtifactCount,
  observations,
})}\n`);

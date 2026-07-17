import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { verifyAdapterCompatibility } from "../adapters/compatibility.js";
import { loadFabricConfig } from "../config/index.js";
import { FabricError } from "../errors.js";

function option(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index === -1 ? undefined : arguments_[index + 1];
}

export async function resolveAdapterExecutableCli(arguments_: string[]): Promise<string> {
  const adapterId = option(arguments_, "--adapter");
  if (adapterId === undefined || adapterId.length === 0) {
    throw new Error("adapter executable requires --adapter <id>");
  }
  const agentsHome = resolve(
    option(arguments_, "--agents-home") ?? process.env.AGENTS_HOME ?? join(homedir(), ".agents"),
  );
  const compatibilityPath = resolve(
    option(arguments_, "--compatibility") ?? join(agentsHome, "config", "adapter-compatibility.yaml"),
  );
  const configPath = resolve(
    option(arguments_, "--config") ?? join(agentsHome, "config", "agent-fabric.yaml"),
  );
  const schemaPath = resolve(
    option(arguments_, "--compatibility-schema") ??
      join(agentsHome, "runtime", "agent-fabric", "schemas", "adapter-compatibility.schema.json"),
  );
  const config = await loadFabricConfig({ globalPath: configPath, agentsHome });
  if (!config.adapterIds.includes(adapterId)) {
    throw new FabricError("ADAPTER_DISABLED", `adapter is not active in trusted Fabric configuration: ${adapterId}`);
  }
  const verification = await verifyAdapterCompatibility({
    compatibilityPath,
    schemaPath,
    adapterIds: [adapterId],
    requireEnabled: true,
  });
  const executable = verification.resolvedExecutables[adapterId];
  if (executable === undefined) {
    throw new FabricError(
      "ADAPTER_COMPATIBILITY_INVALID",
      `activated adapter has no hash-pinned executable: ${adapterId}`,
    );
  }
  return executable;
}

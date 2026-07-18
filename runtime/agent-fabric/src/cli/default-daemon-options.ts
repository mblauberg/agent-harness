import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { DaemonStartOptions } from "../daemon/client.js";
import type { FabricPaths } from "./paths.js";

export function defaultDaemonStartOptions(
  paths: FabricPaths,
  agentsHomeValue: string | undefined,
): DaemonStartOptions {
  const agentsHome = resolve(agentsHomeValue ?? join(homedir(), ".agents"));
  return {
    ...paths,
    configuration: {
      globalConfigPath: join(agentsHome, "config", "agent-fabric.yaml"),
      compatibilityPath: join(agentsHome, "config", "adapter-compatibility.yaml"),
      compatibilitySchemaPath: join(
        agentsHome,
        "runtime",
        "agent-fabric",
        "schemas",
        "adapter-compatibility.schema.json",
      ),
      agentsHome,
    },
  };
}

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  createFabricMcpServer,
  createUnprovisionedMcpServer,
  type FabricMcpServerHandle,
} from "./server.js";
import { McpSeatNotProvisionedError, resolveMcpCapability } from "./credentials.js";
import { resolveFabricPaths } from "../cli/paths.js";

// Stdio MCP proxy entry point (spec section 14): one proxy process per client,
// each connecting to the shared daemon socket with its own capability. The
// proxy holds no fabric state and enforces no policy; the daemon derives the
// principal from the capability, never from MCP arguments.

const socketPath = process.env.AGENT_FABRIC_SOCKET_PATH ?? resolveFabricPaths().socketPath;

let handle: FabricMcpServerHandle;
try {
  const capability = await resolveMcpCapability(
    process.env,
    process.cwd(),
    (message) => process.stderr.write(`warning: ${message}\n`),
  );
  handle = await createFabricMcpServer({
    socketPath,
    capability,
    ...(process.env.AGENT_FABRIC_CLIENT_LABEL === undefined
      ? {}
      : { clientLabel: process.env.AGENT_FABRIC_CLIENT_LABEL }),
  });
} catch (error: unknown) {
  if (!(error instanceof McpSeatNotProvisionedError)) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
  process.stderr.write(`warning: ${error.message}; Fabric tools are unavailable until seats are provisioned\n`);
  handle = createUnprovisionedMcpServer();
}
delete process.env.AGENT_FABRIC_CAPABILITY;

const transport = new StdioServerTransport();
await handle.server.connect(transport);

let shutdownPromise: Promise<void> | undefined;
const shutdown = (): void => {
  shutdownPromise ??= handle.close().finally(() => process.exit(0));
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.stdin.on("end", shutdown);
process.stdin.on("close", shutdown);

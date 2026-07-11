import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createFabricMcpServer } from "./server.js";
import { resolveMcpCapability } from "./credentials.js";

// Stdio MCP proxy entry point (spec section 14): one proxy process per client,
// each connecting to the shared daemon socket with its own capability. The
// proxy holds no fabric state and enforces no policy; the daemon derives the
// principal from the capability, never from MCP arguments.

const socketPath = process.env.AGENT_FABRIC_SOCKET_PATH;

if (socketPath === undefined) {
  process.stderr.write("agent-fabric-mcp requires AGENT_FABRIC_SOCKET_PATH\n");
  process.exit(2);
}

let capability: string;
try {
  capability = await resolveMcpCapability(process.env);
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}
delete process.env.AGENT_FABRIC_CAPABILITY;

const handle = await createFabricMcpServer({
  socketPath,
  capability,
  ...(process.env.AGENT_FABRIC_CLIENT_LABEL === undefined
    ? {}
    : { clientLabel: process.env.AGENT_FABRIC_CLIENT_LABEL }),
});

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

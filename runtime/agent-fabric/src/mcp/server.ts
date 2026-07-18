import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  AGENT_RESULT_SHAPE_FEATURES,
  NdjsonRpcTransport,
  OPERATION_REGISTRY,
  ProtocolRemoteError,
  ProtocolTransportError,
  buildMcpDescriptorSet,
  isDaemonGrantableOperation,
  operationsForPrincipal,
  parseOperationInputForPrincipal,
  parseOperationResult,
  renderMcpReceipt,
  type FabricOperation,
  type McpResourceDescriptor,
  type McpToolDescriptor,
  type ProtocolFeature,
} from "@local/agent-fabric-protocol";

export type FabricMcpServerOptions = {
  socketPath: string;
  capability: string;
  clientLabel?: string;
};

export type FabricMcpServerHandle = {
  server: Server;
  close(): Promise<void>;
};

export function createUnprovisionedMcpServer(options?: {
  bootstrap: () => Promise<FabricMcpServerOptions>;
}): FabricMcpServerHandle {
  const server = new Server(
    { name: "agent-fabric", version: "1.0.0" },
    { capabilities: { tools: { listChanged: true }, resources: {} } },
  );
  let protocolClose: (() => Promise<void>) | undefined;
  const bootstrapTool = {
    name: "fabric_bootstrap",
    description: "Create the exact trusted project's first narrow scoping custody and install this primary seat.",
    inputSchema: { type: "object" as const, additionalProperties: false, properties: {} },
  };
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: options === undefined ? [] : [bootstrapTool] }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (options === undefined || request.params.name !== "fabric_bootstrap") throw new Error(`unknown tool: ${request.params.name}`);
    const args = request.params.arguments ?? {};
    if (Object.keys(args).length !== 0) throw new TypeError("fabric_bootstrap accepts no arguments");
    try {
      let activated: FabricMcpServerOptions;
      try {
        activated = await options.bootstrap();
      } catch (error: unknown) {
        if (!isRecord(error) || error.code !== "BOOTSTRAP_GENERATION_CHANGED") throw error;
        activated = await options.bootstrap();
      }
      try {
        protocolClose = await configureFabricMcpServer(server, activated);
      } catch (error: unknown) {
        if (!(error instanceof ProtocolRemoteError) || error.code !== "AUTHENTICATION_FAILED") throw error;
        activated = await options.bootstrap();
        protocolClose = await configureFabricMcpServer(server, activated);
      }
      await server.sendToolListChanged();
      return {
        content: [{ type: "text", text: "Agent Fabric bootstrap complete; normal Fabric tools are now active." }],
        structuredContent: { bootstrapped: true },
      };
    } catch (error: unknown) {
      const payload = errorPayload(error);
      return { content: [{ type: "text", text: JSON.stringify(payload) }], isError: true };
    }
  });
  server.setRequestHandler(ListResourcesRequestSchema, () => ({ resources: [] }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({ resourceTemplates: [] }));
  return {
    server,
    async close(): Promise<void> {
      await Promise.allSettled([server.close(), protocolClose?.() ?? Promise.resolve()]);
    },
  };
}

const agentFeatures = Object.freeze([...new Set(
  [
    ...[...operationsForPrincipal("agent")]
      .filter(isDaemonGrantableOperation)
      .map((operation) => OPERATION_REGISTRY[operation].feature),
    ...AGENT_RESULT_SHAPE_FEATURES,
  ],
)].sort()) as readonly ProtocolFeature[];

function errorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof ProtocolRemoteError) return { code: error.code, message: error.message };
  if (error instanceof ProtocolTransportError) {
    return { code: error.code, message: "Agent Fabric protocol request failed" };
  }
  if (error instanceof TypeError) return { code: "MCP_INPUT_INVALID", message: error.message };
  if (isRecord(error) && typeof error.code === "string" && typeof error.message === "string") {
    return { code: error.code, message: error.message };
  }
  return { code: "FABRIC_MCP_REQUEST_FAILED", message: "Agent Fabric MCP request failed" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resourceCall(
  uri: string,
  resources: readonly McpResourceDescriptor[],
): { descriptor: McpResourceDescriptor; runId: string } {
  const match = /^fabric:\/\/runs\/([^/]+)\/(status|tasks|agents|receipts)$/u.exec(uri);
  if (match?.[1] === undefined || match[2] === undefined) throw new TypeError("unknown Fabric resource URI");
  const template = `fabric://runs/{run_id}/${match[2]}`;
  const descriptor = resources.find((candidate) => candidate.uriTemplate === template);
  if (descriptor === undefined) throw new TypeError("Fabric resource is outside the negotiated grant");
  return { descriptor, runId: decodeURIComponent(match[1]) };
}

function advertisedTool(descriptor: McpToolDescriptor): {
  name: string;
  description: string;
  inputSchema: McpToolDescriptor["inputSchema"];
  outputSchema: McpToolDescriptor["outputSchema"];
} {
  return {
    name: descriptor.name,
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
    outputSchema: descriptor.outputSchema,
  };
}

async function configureFabricMcpServer(server: Server, options: FabricMcpServerOptions): Promise<() => Promise<void>> {
  if (!/^afc_[A-Za-z0-9_-]{43}$/u.test(options.capability)) {
    throw new TypeError("MCP requires an Agent Fabric agent capability");
  }
  const protocol = await NdjsonRpcTransport.connect(createConnection(options.socketPath), {
    protocolVersion: 1,
    client: { name: options.clientLabel ?? "agent-fabric-mcp", version: "1.0.0" },
    authentication: {
      scheme: "capability",
      credential: options.capability,
      clientNonce: `mcp_${randomUUID()}`,
    },
    expectedPrincipalKind: "agent",
    requiredFeatures: ["fabric-core.v1"],
    optionalFeatures: agentFeatures.filter((feature) => feature !== "fabric-core.v1"),
  });
  if (protocol.principal.kind !== "agent") {
    await protocol.close();
    throw new TypeError("MCP protocol credential did not resolve to an agent principal");
  }
  const descriptors = buildMcpDescriptorSet(protocol.allowedOperations);
  const toolsByName = new Map(descriptors.tools.map((descriptor) => [descriptor.name, descriptor]));
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: descriptors.tools.map(advertisedTool),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const descriptor = toolsByName.get(request.params.name as `fabric_${string}`);
    if (descriptor === undefined) throw new Error(`unknown tool: ${request.params.name}`);
    const args = request.params.arguments ?? {};
    try {
      const parsedInput = parseOperationInputForPrincipal(descriptor.operation, "agent", args);
      const raw = await protocol.call(descriptor.operation as never, parsedInput as never);
      const result = parseOperationResult(descriptor.operation, raw);
      if (!isRecord(result)) throw new TypeError("projected Fabric result must be an object");
      return {
        content: [{ type: "text", text: renderMcpReceipt(descriptor, args, result) }],
        structuredContent: result,
      };
    } catch (error: unknown) {
      const payload = errorPayload(error);
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, () => ({ resources: [] }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({
    resourceTemplates: descriptors.resources,
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { descriptor, runId } = resourceCall(request.params.uri, descriptors.resources);
    const operation = descriptor.operation as FabricOperation;
    const input = parseOperationInputForPrincipal(operation, "agent", { runId });
    const raw = await protocol.call(operation as never, input as never);
    const result = parseOperationResult(operation, raw);
    return {
      contents: [{
        uri: request.params.uri,
        mimeType: descriptor.mimeType,
        text: JSON.stringify(result),
      }],
    };
  });

  return async () => protocol.close();
}

export async function createFabricMcpServer(options: FabricMcpServerOptions): Promise<FabricMcpServerHandle> {
  const server = new Server(
    { name: "agent-fabric", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {} } },
  );
  const closeProtocol = await configureFabricMcpServer(server, options);
  let closed = false;
  return {
    server,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await Promise.allSettled([server.close(), closeProtocol()]);
    },
  };
}

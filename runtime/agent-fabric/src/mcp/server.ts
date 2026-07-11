import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Ajv2020 } from "ajv/dist/2020.js";

import { FabricRemoteError } from "../daemon/client.js";
import { DaemonRpc } from "./daemon-rpc.js";
import { renderToolReceipt } from "./receipt-renderer.js";
import { FABRIC_MCP_RESOURCE_TEMPLATES, FABRIC_MCP_TOOLS, resolveResourceUri } from "./schemas.js";

export type FabricMcpServerOptions = {
  socketPath: string;
  capability: string;
  clientLabel?: string;
};

export type FabricMcpServerHandle = {
  server: Server;
  close(): Promise<void>;
};

function errorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof FabricRemoteError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    // Never forward driver or transport internals as the error surface.
    return { code: "FABRIC_MCP_REQUEST_FAILED", message: error.message };
  }
  return { code: "FABRIC_MCP_REQUEST_FAILED", message: String(error) };
}

function asStructured(result: unknown): Record<string, unknown> {
  if (Array.isArray(result)) {
    return { deliveries: result };
  }
  if (isRecord(result)) {
    return result;
  }
  return { result: result ?? null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function createFabricMcpServer(options: FabricMcpServerOptions): Promise<FabricMcpServerHandle> {
  const rpc = await DaemonRpc.connect({ socketPath: options.socketPath, capability: options.capability });
  // One shared server identity: the client label only names the connection in
  // logs. Serving the label as the server name would fork the surface that
  // NFR-007 requires to stay identical, so it deliberately does not.
  const server = new Server(
    { name: "agent-fabric", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } },
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const inputValidators = new Map(FABRIC_MCP_TOOLS.map((tool) => [tool.name, ajv.compile(tool.inputSchema)]));
  const outputValidators = new Map(FABRIC_MCP_TOOLS.map((tool) => [tool.name, ajv.compile(tool.outputSchema)]));

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: FABRIC_MCP_TOOLS.map(({ name, description, inputSchema, outputSchema }) => ({ name, description, inputSchema, outputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = FABRIC_MCP_TOOLS.find((candidate) => candidate.name === request.params.name);
    if (tool === undefined) {
      throw new Error(`unknown tool: ${request.params.name}`);
    }
    const args = request.params.arguments ?? {};
    try {
      const validateInput = inputValidators.get(tool.name);
      if (validateInput === undefined || !validateInput(args)) {
        throw new FabricRemoteError("MCP_INPUT_INVALID", `arguments do not match the ${tool.name} contract`);
      }
      const result = await rpc.call(tool.daemonMethod, args);
      const structured = asStructured(result);
      const validate = outputValidators.get(tool.name);
      if (validate === undefined || !validate(structured)) {
        throw new Error(`daemon returned output outside the ${tool.name} contract`);
      }
      return {
        content: [{ type: "text", text: renderToolReceipt(tool.name, args, structured) }],
        structuredContent: structured,
      };
    } catch (error: unknown) {
      const payload = errorPayload(error);
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError: true,
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, () => ({ resources: [] }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({
    resourceTemplates: FABRIC_MCP_RESOURCE_TEMPLATES,
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { runId, daemonMethod } = resolveResourceUri(request.params.uri);
    const result = await rpc.call(daemonMethod, { runId });
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(result ?? null),
        },
      ],
    };
  });

  return {
    server,
    async close(): Promise<void> {
      await server.close();
      await rpc.close();
    },
  };
}

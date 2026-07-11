import { createHash, randomUUID } from "node:crypto";
import { createConnection } from "node:net";

import {
  FABRIC_OPERATIONS,
  NdjsonRpcTransport,
  OPERATION_REGISTRY,
  operationsForPrincipal,
  parseOperationInput,
  type FabricOperation,
  type McpToolDescriptor,
  type ProtocolFeature,
} from "@local/agent-fabric-protocol";

import { ProviderAdapterError, type AgentProvisionProviderResult } from "./types.js";
import {
  ProviderSessionFabricSurface,
  type ProviderSessionProtocolTransport,
  type ProviderSessionToolResult,
} from "./provider-session-fabric-surface.js";

export type AgentSessionFabricBridgeInput = {
  providerAdapterId: string;
  providerActionId: string;
  targetAgentId: string;
  expectedPrincipal: Readonly<{
    agentId: string;
    projectSessionId: string;
    runId: string;
    principalGeneration: number;
  }>;
  bridgeGeneration: number;
  bridgeContractDigest: string;
  capability: string;
  socketPath: string;
};

export type AgentSessionProviderInvocation = {
  providerSessionRef: string;
  providerSessionGeneration: number;
  providerTurnRef: string;
  providerInvocationRef: string;
};

const agentFeatures = Object.freeze([...new Set(
  [...operationsForPrincipal("agent")].map((operation) => OPERATION_REGISTRY[operation].feature),
)].sort()) as readonly ProtocolFeature[];

async function connect(input: AgentSessionFabricBridgeInput): Promise<ProviderSessionProtocolTransport> {
  const socket = createConnection(input.socketPath);
  let closed = false;
  socket.once("close", () => { closed = true; });
  const protocol = await NdjsonRpcTransport.connect(socket, {
    protocolVersion: 1,
    client: { name: "agent-fabric-child-session", version: "1.0.0" },
    authentication: {
      scheme: "capability",
      credential: input.capability,
      clientNonce: `child_${randomUUID()}`,
    },
    expectedPrincipalKind: "agent",
    requiredFeatures: ["fabric-core.v1"],
    optionalFeatures: agentFeatures.filter((feature) => feature !== "fabric-core.v1"),
  });
  return {
    get closed() { return closed; },
    features: protocol.features,
    principal: protocol.principal,
    allowedOperations: protocol.allowedOperations,
    async call(operation: FabricOperation, value: unknown): Promise<unknown> {
      return await protocol.call(operation, parseOperationInput(operation, value) as never);
    },
    async close(): Promise<void> {
      closed = true;
      await protocol.close();
    },
  };
}

function bounded(value: string): boolean {
  return value.length > 0 && Buffer.byteLength(value, "utf8") <= 512;
}

export class AgentSessionFabricBridge {
  readonly descriptors: readonly McpToolDescriptor[];
  readonly activationToolName: McpToolDescriptor["name"];
  readonly #binding: Omit<AgentSessionFabricBridgeInput, "capability" | "socketPath" | "expectedPrincipal">;
  readonly #transport: ProviderSessionProtocolTransport;
  readonly #surface: ProviderSessionFabricSurface;
  #session: { ref: string; generation: number } | undefined;
  #activation: { turnRef: string; invocationRef: string; operation: FabricOperation } | undefined;
  #closed = false;

  private constructor(input: AgentSessionFabricBridgeInput, transport: ProviderSessionProtocolTransport) {
    const principal = transport.principal;
    if (
      principal.kind !== "agent" ||
      principal.agentId !== input.expectedPrincipal.agentId ||
      principal.projectSessionId !== input.expectedPrincipal.projectSessionId ||
      principal.runId !== input.expectedPrincipal.runId ||
      principal.principalGeneration !== input.expectedPrincipal.principalGeneration ||
      input.targetAgentId !== input.expectedPrincipal.agentId
    ) {
      throw new ProviderAdapterError(
        "AGENT_BRIDGE_UNPROVEN",
        "child Fabric principal does not match the exact custody binding",
      );
    }
    this.#binding = {
      providerAdapterId: input.providerAdapterId,
      providerActionId: input.providerActionId,
      targetAgentId: input.targetAgentId,
      bridgeGeneration: input.bridgeGeneration,
      bridgeContractDigest: input.bridgeContractDigest,
    };
    this.#transport = transport;
    this.#surface = new ProviderSessionFabricSurface(transport);
    this.descriptors = this.#surface.descriptors;
    const descriptor = this.descriptors.find(({ operation }) => operation === FABRIC_OPERATIONS.getMailboxState);
    if (descriptor === undefined) {
      throw new ProviderAdapterError("CAPABILITY_UNAVAILABLE", "child grant lacks the mailbox activation tool");
    }
    this.activationToolName = descriptor.name;
  }

  static async create(input: AgentSessionFabricBridgeInput): Promise<AgentSessionFabricBridge> {
    const transport = await connect(input);
    try {
      return new AgentSessionFabricBridge(input, transport);
    } catch (error: unknown) {
      await transport.close();
      throw error;
    }
  }

  get closed(): boolean { return this.#closed || this.#transport.closed === true; }

  bindProviderSession(providerSessionRef: string, providerSessionGeneration: number): void {
    if (!bounded(providerSessionRef) || !Number.isSafeInteger(providerSessionGeneration) || providerSessionGeneration < 1) {
      throw new ProviderAdapterError("AGENT_BRIDGE_UNPROVEN", "child provider session binding is invalid");
    }
    if (this.#session !== undefined && (this.#session.ref !== providerSessionRef || this.#session.generation !== providerSessionGeneration)) {
      throw new ProviderAdapterError("AGENT_BRIDGE_UNPROVEN", "child bridge cannot be rebound");
    }
    this.#session = { ref: providerSessionRef, generation: providerSessionGeneration };
  }

  async invokeTool(
    name: string,
    args: unknown,
    invocation: AgentSessionProviderInvocation,
  ): Promise<ProviderSessionToolResult> {
    if (this.closed || this.#session === undefined ||
      invocation.providerSessionRef !== this.#session.ref ||
      invocation.providerSessionGeneration !== this.#session.generation ||
      !bounded(invocation.providerTurnRef) || !bounded(invocation.providerInvocationRef)) {
      throw new ProviderAdapterError("AGENT_BRIDGE_UNPROVEN", "child Fabric invocation is not provider-attributable");
    }
    const descriptor = this.#surface.descriptor(name);
    if (descriptor === undefined) throw new ProviderAdapterError("CAPABILITY_UNAVAILABLE", "unknown child Fabric tool");
    const result = await this.#surface.invoke(name, args, invocation);
    if (this.#activation === undefined) {
      this.#activation = {
        turnRef: invocation.providerTurnRef,
        invocationRef: invocation.providerInvocationRef,
        operation: descriptor.operation,
      };
    }
    return result;
  }

  result(): AgentProvisionProviderResult {
    if (this.closed || this.#session === undefined || this.#activation === undefined) {
      throw new ProviderAdapterError("AGENT_BRIDGE_UNPROVEN", "provider session made no attributable Fabric call");
    }
    const evidenceDigest = `sha256:${createHash("sha256").update(JSON.stringify({
      schemaVersion: 1,
      adapterId: this.#binding.providerAdapterId,
      actionId: this.#binding.providerActionId,
      targetAgentId: this.#binding.targetAgentId,
      providerSessionRef: this.#session.ref,
      providerSessionGeneration: this.#session.generation,
      bridgeGeneration: this.#binding.bridgeGeneration,
      bridgeContractDigest: this.#binding.bridgeContractDigest,
      providerTurnRef: this.#activation.turnRef,
      providerInvocationRef: this.#activation.invocationRef,
      operation: this.#activation.operation,
    })).digest("hex")}`;
    return {
      schemaVersion: 1,
      adapterId: this.#binding.providerAdapterId,
      actionId: this.#binding.providerActionId,
      targetAgentId: this.#binding.targetAgentId,
      providerSessionRef: this.#session.ref,
      providerSessionGeneration: this.#session.generation,
      bridgeGeneration: this.#binding.bridgeGeneration,
      bridgeContractDigest: this.#binding.bridgeContractDigest,
      activationEvidenceDigest: evidenceDigest,
    };
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#transport.close();
  }
}

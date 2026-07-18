import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createConnection } from "node:net";

import {
  AGENT_RESULT_SHAPE_FEATURES,
  FABRIC_OPERATIONS,
  NdjsonRpcTransport,
  OPERATION_REGISTRY,
  PROTOCOL_LIMITS,
  operationsForPrincipal,
  parseOperationInput,
  type FabricOperation,
  type McpToolDescriptor,
  type ProtocolFeature,
} from "@local/agent-fabric-protocol";

import {
  agentLifecycleAttestationDigest,
  ProviderAdapterError,
  type AgentLifecycleAttestationBinding,
  type AgentProvisionProviderResult,
} from "./types.js";
import {
  ProviderSessionFabricSurface,
  RetainedProviderSessionKeepalive,
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
  lifecycleAttestation?: AgentLifecycleAttestationBinding & { challenge: string };
};

export type AgentSessionProviderInvocation = {
  providerSessionRef: string;
  providerSessionGeneration: number;
  providerTurnRef: string;
  providerInvocationRef: string;
};

const agentFeatures = Object.freeze([...new Set(
  [
    ...[...operationsForPrincipal("agent")].map((operation) => OPERATION_REGISTRY[operation].feature),
    ...AGENT_RESULT_SHAPE_FEATURES,
  ],
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
    idleTimeoutMs: typeof Reflect.get(protocol, "idleTimeoutMs") === "number"
      ? Number(Reflect.get(protocol, "idleTimeoutMs"))
      : PROTOCOL_LIMITS.idleTimeoutMs,
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
  readonly #keepalive: RetainedProviderSessionKeepalive;
  #session: { ref: string; generation: number } | undefined;
  #activation: { turnRef: string; invocationRef: string; operation: FabricOperation } | undefined;
  readonly #lifecycleAttestation: (AgentLifecycleAttestationBinding & { challenge: Buffer }) | undefined;
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
    if (input.lifecycleAttestation !== undefined) {
      const observedChallengeDigest = `sha256:${createHash("sha256")
        .update(Buffer.from(input.lifecycleAttestation.challenge, "hex")).digest("hex")}`;
      if (!/^[0-9a-f]{64}$/u.test(input.lifecycleAttestation.challenge) ||
        observedChallengeDigest !== input.lifecycleAttestation.challengeDigest ||
        !/^sha256:[0-9a-f]{64}$/u.test(input.lifecycleAttestation.checkpointDigest) ||
        !bounded(input.lifecycleAttestation.custodyId)) {
        throw new ProviderAdapterError("AGENT_BRIDGE_UNPROVEN", "agent lifecycle challenge is invalid");
      }
      this.#lifecycleAttestation = {
        ...input.lifecycleAttestation,
        challenge: Buffer.from(input.lifecycleAttestation.challenge, "hex"),
      };
    }
    this.#surface = new ProviderSessionFabricSurface(transport, this.#lifecycleAttestation === undefined ? [] : [{
      operation: FABRIC_OPERATIONS.launchAttest,
      invoke: async (value, context) => await this.#attest(value, context),
    }]);
    this.#keepalive = new RetainedProviderSessionKeepalive(transport);
    this.descriptors = this.#surface.descriptors;
    const descriptor = this.descriptors.find(({ operation }) => operation === (
      this.#lifecycleAttestation === undefined ? FABRIC_OPERATIONS.getMailboxState : FABRIC_OPERATIONS.launchAttest
    ));
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

  get challengeResponse(): string | undefined {
    return this.#lifecycleAttestation?.challenge.toString("hex");
  }

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
    if (this.#lifecycleAttestation !== undefined && this.#activation === undefined &&
      descriptor.operation !== FABRIC_OPERATIONS.launchAttest) {
      throw new ProviderAdapterError("AGENT_BRIDGE_UNPROVEN", "agent Fabric tools are unavailable before lifecycle attestation");
    }
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

  async #attest(value: unknown, context: unknown): Promise<unknown> {
    const binding = this.#lifecycleAttestation;
    if (binding === undefined || this.#activation !== undefined || this.#session === undefined ||
      typeof value !== "object" || value === null || Array.isArray(value) ||
      typeof context !== "object" || context === null || Array.isArray(context)) {
      throw new ProviderAdapterError("AGENT_BRIDGE_UNPROVEN", "agent lifecycle attestation is not attributable");
    }
    const request = value as Record<string, unknown>;
    const invocation = context as Record<string, unknown>;
    if (Object.keys(request).length !== 1 || typeof request.challengeResponse !== "string" ||
      invocation.providerSessionRef !== this.#session.ref ||
      invocation.providerSessionGeneration !== this.#session.generation ||
      typeof invocation.providerTurnRef !== "string" || !bounded(invocation.providerTurnRef) ||
      typeof invocation.providerInvocationRef !== "string" || !bounded(invocation.providerInvocationRef)) {
      throw new ProviderAdapterError("AGENT_BRIDGE_UNPROVEN", "agent lifecycle attestation fields crossed");
    }
    const response = Buffer.from(request.challengeResponse, "hex");
    const matches = response.byteLength === binding.challenge.byteLength && timingSafeEqual(response, binding.challenge);
    response.fill(0);
    if (!matches) throw new ProviderAdapterError("AGENT_BRIDGE_UNPROVEN", "agent lifecycle challenge did not match");
    binding.challenge.fill(0);
    this.#activation = {
      turnRef: invocation.providerTurnRef,
      invocationRef: invocation.providerInvocationRef,
      operation: FABRIC_OPERATIONS.launchAttest,
    };
    return { attested: true, challengeDigest: binding.challengeDigest };
  }

  result(): AgentProvisionProviderResult {
    if (this.closed || this.#session === undefined || this.#activation === undefined ||
      (this.#lifecycleAttestation !== undefined && this.#activation.operation !== FABRIC_OPERATIONS.launchAttest)) {
      throw new ProviderAdapterError("AGENT_BRIDGE_UNPROVEN", "provider session made no attributable Fabric call");
    }
    const ordinaryEvidenceDigest = `sha256:${createHash("sha256").update(JSON.stringify({
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
    const lifecycleAttestation = this.#lifecycleAttestation === undefined ? undefined : {
      schemaVersion: 1 as const,
      kind: "provider-session-lifecycle-attestation" as const,
      custodyId: this.#lifecycleAttestation.custodyId,
      actionId: this.#binding.providerActionId,
      checkpointDigest: this.#lifecycleAttestation.checkpointDigest,
      challengeDigest: this.#lifecycleAttestation.challengeDigest,
      providerSessionRef: this.#session.ref,
      providerSessionGeneration: this.#session.generation,
      bridgeGeneration: this.#binding.bridgeGeneration,
      providerTurnRef: this.#activation.turnRef,
      providerInvocationRef: this.#activation.invocationRef,
    };
    const attested = lifecycleAttestation === undefined ? undefined : {
      ...lifecycleAttestation,
      attestationDigest: agentLifecycleAttestationDigest(lifecycleAttestation),
    };
    this.#keepalive.start();
    return {
      schemaVersion: 1,
      adapterId: this.#binding.providerAdapterId,
      actionId: this.#binding.providerActionId,
      targetAgentId: this.#binding.targetAgentId,
      providerSessionRef: this.#session.ref,
      providerSessionGeneration: this.#session.generation,
      bridgeGeneration: this.#binding.bridgeGeneration,
      bridgeContractDigest: this.#binding.bridgeContractDigest,
      activationEvidenceDigest: attested?.attestationDigest ?? ordinaryEvidenceDigest,
      ...(attested === undefined ? {} : { lifecycleAttestation: attested }),
    };
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#keepalive.stop();
    await this.#transport.close();
  }
}

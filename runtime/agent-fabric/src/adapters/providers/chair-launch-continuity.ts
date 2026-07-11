import { randomUUID, timingSafeEqual } from "node:crypto";
import { createConnection } from "node:net";

import {
  FABRIC_OPERATIONS,
  NdjsonRpcTransport,
  OPERATION_REGISTRY,
  operationsForPrincipal,
  parseOperationInput,
  parseOperationResult,
  type FabricOperation,
  type McpToolDescriptor,
  type ProtocolFeature,
} from "@local/agent-fabric-protocol";
import {
  CHAIR_ATTESTATION_METHOD,
  CHAIR_BRIDGE_CONTRACT,
  chairLaunchAttestationDigest,
  chairLaunchChallengeDigest,
  isRecord,
  ProviderAdapterError,
  type ChairLaunchAttestationBinding,
  type ChairLaunchProviderResult,
} from "./types.js";
import {
  ProviderSessionFabricSurface,
  type ProviderSessionProtocolTransport,
  type ProviderSessionToolResult,
} from "./provider-session-fabric-surface.js";

export type ChairLaunchFabricBridgeInput = ChairLaunchAttestationBinding & {
  capability: string;
  socketPath: string;
  attestationChallenge: string;
};

export type ChairLaunchFabricBridgeDependencies = {
  connect(input: { socketPath: string; capability: string }): Promise<ProviderSessionProtocolTransport>;
};

const agentFeatures = Object.freeze([...new Set(
  [...operationsForPrincipal("agent")]
    .map((operation) => OPERATION_REGISTRY[operation].feature),
)].sort()) as readonly ProtocolFeature[];

const defaultDependencies: ChairLaunchFabricBridgeDependencies = {
  async connect(input) {
    if (!/^afc_[A-Za-z0-9_-]{43}$/u.test(input.capability)) {
      throw new TypeError("provider-session bridge requires an Agent Fabric agent capability");
    }
    const socket = createConnection(input.socketPath);
    let closed = false;
    socket.once("close", () => {
      closed = true;
    });
    const protocol = await NdjsonRpcTransport.connect(socket, {
      protocolVersion: 1,
      client: { name: "agent-fabric-provider-session", version: "1.0.0" },
      authentication: {
        scheme: "capability",
        credential: input.capability,
        clientNonce: `provider_${randomUUID()}`,
      },
      expectedPrincipalKind: "agent",
      requiredFeatures: ["fabric-core.v1"],
      optionalFeatures: agentFeatures.filter((feature) => feature !== "fabric-core.v1"),
    });
    if (protocol.principal.kind !== "agent") {
      await protocol.close();
      throw new TypeError("provider-session bridge credential did not resolve to an agent principal");
    }
    return {
      get closed() {
        return closed;
      },
      features: protocol.features,
      principal: protocol.principal,
      allowedOperations: protocol.allowedOperations,
      async call(operation: FabricOperation, value: unknown): Promise<unknown> {
        return await protocol.call(operation, parseOperationInput(operation, value));
      },
      async close(): Promise<void> {
        closed = true;
        await protocol.close();
      },
    };
  },
};

function boundedNativeRef(value: string): boolean {
  return value.length > 0 && Buffer.byteLength(value, "utf8") <= 512;
}

export type ChairLaunchProviderInvocation = {
  providerSessionRef: string;
  providerSessionGeneration: number;
  providerTurnRef: string;
  providerInvocationRef: string;
};

export class ChairLaunchFabricBridge {
  readonly challengeToolName: McpToolDescriptor["name"];
  readonly challengeDigest: string;
  readonly #challenge: Buffer;
  readonly #binding: ChairLaunchAttestationBinding;
  readonly #transport: ProviderSessionProtocolTransport;
  readonly #surface: ProviderSessionFabricSurface;
  #session: { providerSessionRef: string; providerSessionGeneration: number } | undefined;
  #providerTurnRef: string | undefined;
  #invocationRef: string | undefined;
  #invoked = false;
  #closed = false;

  constructor(
    input: ChairLaunchFabricBridgeInput,
    transport: Awaited<ReturnType<ChairLaunchFabricBridgeDependencies["connect"]>>,
  ) {
    if (!/^[0-9a-f]{64}$/u.test(input.attestationChallenge)) {
      throw new ProviderAdapterError("CHAIR_CONTINUITY_UNPROVEN", "chair attestation challenge must contain 32 random bytes");
    }
    if (chairLaunchChallengeDigest(input.attestationChallenge) !== input.challengeDigest) {
      throw new ProviderAdapterError("CHAIR_CONTINUITY_UNPROVEN", "chair attestation challenge does not match launch custody");
    }
    this.#binding = {
      providerAdapterId: input.providerAdapterId,
      providerActionId: input.providerActionId,
      providerContractDigest: input.providerContractDigest,
      challengeDigest: input.challengeDigest,
    };
    this.#transport = transport;
    this.#challenge = Buffer.from(input.attestationChallenge, "hex");
    this.challengeDigest = input.challengeDigest;
    this.#surface = new ProviderSessionFabricSurface(transport, [{
      operation: FABRIC_OPERATIONS.launchAttest,
      invoke: async (value, context) => await this.#attest(value, context),
    }]);
    const challengeDescriptor = this.#surface.descriptors.find(
      (descriptor) => descriptor.operation === FABRIC_OPERATIONS.launchAttest,
    );
    if (challengeDescriptor === undefined) throw new TypeError("launch attestation descriptor is unavailable");
    this.challengeToolName = challengeDescriptor.name;
  }

  get descriptors(): readonly McpToolDescriptor[] {
    return this.#surface.descriptors;
  }

  get challengeResponse(): string {
    return this.#challenge.toString("hex");
  }

  get closed(): boolean {
    return this.#closed || this.#transport.closed === true;
  }

  bindProviderSession(providerSessionRef: string, providerSessionGeneration: number): void {
    if (!boundedNativeRef(providerSessionRef) || !Number.isSafeInteger(providerSessionGeneration) || providerSessionGeneration <= 0) {
      throw new ProviderAdapterError("CHAIR_CONTINUITY_UNPROVEN", "chair provider session binding is invalid");
    }
    if (
      this.#session !== undefined &&
      (this.#session.providerSessionRef !== providerSessionRef ||
        this.#session.providerSessionGeneration !== providerSessionGeneration)
    ) {
      throw new ProviderAdapterError("CHAIR_CONTINUITY_UNPROVEN", "chair bridge cannot be rebound to another provider session");
    }
    this.#session = { providerSessionRef, providerSessionGeneration };
  }

  async #attest(value: unknown, context: unknown): Promise<unknown> {
    if (this.closed) throw continuityError("chair bridge is closed");
    if (this.#invoked) {
      throw new ProviderAdapterError("CHAIR_ATTESTATION_REPLAY", "chair attestation challenge was already invoked");
    }
    if (
      !isRecord(value) ||
      !isRecord(context) ||
      this.#session === undefined ||
      typeof context.providerSessionRef !== "string" ||
      typeof context.providerSessionGeneration !== "number" ||
      typeof context.providerTurnRef !== "string" ||
      typeof context.providerInvocationRef !== "string" ||
      context.providerSessionRef !== this.#session.providerSessionRef ||
      context.providerSessionGeneration !== this.#session.providerSessionGeneration ||
      !boundedNativeRef(context.providerTurnRef) ||
      !boundedNativeRef(context.providerInvocationRef) ||
      typeof value.challengeResponse !== "string"
    ) {
      throw continuityError("chair attestation invocation is not attributable to the bound provider session");
    }
    let response: Buffer;
    try {
      response = Buffer.from(value.challengeResponse, "hex");
    } catch {
      throw continuityError("chair attestation challenge response is invalid");
    }
    if (response.byteLength !== this.#challenge.byteLength || !timingSafeEqual(response, this.#challenge)) {
      throw continuityError("chair attestation challenge response does not match");
    }
    this.#invoked = true;
    parseOperationResult(
      FABRIC_OPERATIONS.getMailboxState,
      await this.#transport.call(FABRIC_OPERATIONS.getMailboxState, {}),
    );
    this.#providerTurnRef = context.providerTurnRef;
    this.#invocationRef = context.providerInvocationRef;
    return { attested: true, challengeDigest: this.challengeDigest };
  }

  async invokeTool(
    name: string,
    args: unknown,
    invocation: ChairLaunchProviderInvocation,
  ): Promise<ProviderSessionToolResult> {
    if (this.closed) throw continuityError("chair bridge is closed");
    const descriptor = this.#surface.descriptor(name);
    if (descriptor === undefined) throw new ProviderAdapterError("CAPABILITY_UNAVAILABLE", "provider requested an unknown Fabric tool");
    if (descriptor.operation !== FABRIC_OPERATIONS.launchAttest && !this.#invoked) {
      throw continuityError("chair Fabric tools are unavailable before launch attestation");
    }
    try {
      return await this.#surface.invoke(name, args, invocation);
    } catch (error: unknown) {
      if (descriptor.operation === FABRIC_OPERATIONS.launchAttest && error instanceof TypeError) {
        throw continuityError("chair attestation input is invalid");
      }
      throw error;
    }
  }

  async result(): Promise<ChairLaunchProviderResult> {
    if (
      this.closed ||
      this.#session === undefined ||
      this.#providerTurnRef === undefined ||
      this.#invocationRef === undefined
    ) {
      throw continuityError("provider session did not originate the Fabric attestation");
    }
    const unsigned = {
      schemaVersion: 1 as const,
      kind: "provider-session-fabric-attestation" as const,
      method: CHAIR_ATTESTATION_METHOD,
      bridgeContract: CHAIR_BRIDGE_CONTRACT,
      ...this.#binding,
      ...this.#session,
      providerTurnRef: this.#providerTurnRef,
      challengeResponse: this.challengeResponse,
      providerInvocationRef: this.#invocationRef,
    };
    return {
      resumeReference: this.#session.providerSessionRef,
      providerSessionGeneration: this.#session.providerSessionGeneration,
      fabricContinuity: {
        ...unsigned,
        attestationDigest: chairLaunchAttestationDigest(unsigned),
      },
    };
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#transport.close();
  }
}

function continuityError(message: string): ProviderAdapterError {
  return new ProviderAdapterError("CHAIR_CONTINUITY_UNPROVEN", message);
}

export async function createChairLaunchFabricBridge(
  input: ChairLaunchFabricBridgeInput,
  dependencies: ChairLaunchFabricBridgeDependencies = defaultDependencies,
): Promise<ChairLaunchFabricBridge> {
  const transport = await dependencies.connect({
    socketPath: input.socketPath,
    capability: input.capability,
  });
  try {
    return new ChairLaunchFabricBridge(input, transport);
  } catch (error: unknown) {
    await transport.close();
    throw error;
  }
}

export function chairLaunchContinuityUnproven(
  input: {
    providerContractDigest: string;
    resumeReference: string;
    providerSessionGeneration: number;
  },
): ProviderAdapterError {
  return new ProviderAdapterError(
    "CHAIR_CONTINUITY_UNPROVEN",
    "chair bootstrap did not prove authenticated Fabric continuity",
    {
      kind: "continuity-unproven",
      providerContractDigest: input.providerContractDigest,
      resumeReference: input.resumeReference,
      providerSessionGeneration: input.providerSessionGeneration,
    },
  );
}

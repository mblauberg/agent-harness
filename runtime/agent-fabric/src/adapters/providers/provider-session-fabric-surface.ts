import {
  buildMcpDescriptorSet,
  OPERATION_REGISTRY,
  parseOperationInputForPrincipal,
  parseOperationResult,
  renderMcpReceipt,
  type FabricOperation,
  type McpToolDescriptor,
  type ProtocolFeature,
  type ProtocolPrincipal,
} from "@local/agent-fabric-protocol";

export type ProviderSessionProtocolTransport = {
  readonly features: readonly ProtocolFeature[];
  readonly principal: ProtocolPrincipal;
  readonly allowedOperations: ReadonlySet<FabricOperation>;
  readonly closed?: boolean;
  call(operation: FabricOperation, input: unknown): Promise<unknown>;
  close(): Promise<void>;
};

export type ProviderSessionToolResult = Readonly<{
  descriptor: McpToolDescriptor;
  receipt: string;
  structuredContent: Record<string, unknown>;
}>;

export type ProviderSessionLocalOperation = Readonly<{
  operation: FabricOperation;
  invoke(input: unknown, context: unknown): Promise<unknown>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Provider-neutral generated tool surface. Chair launch is its first owner;
 * retained child bridges can reuse it without acquiring persistence custody.
 */
export class ProviderSessionFabricSurface {
  readonly descriptors: readonly McpToolDescriptor[];
  readonly #descriptorsByName: ReadonlyMap<string, McpToolDescriptor>;
  readonly #localOperations: ReadonlyMap<FabricOperation, ProviderSessionLocalOperation>;
  readonly #transport: ProviderSessionProtocolTransport;

  constructor(
    transport: ProviderSessionProtocolTransport,
    localOperations: readonly ProviderSessionLocalOperation[] = [],
  ) {
    if (transport.principal.kind !== "agent") {
      throw new TypeError("provider-session Fabric surface requires an agent principal");
    }
    const negotiatedFeatures = new Set(transport.features);
    for (const operation of transport.allowedOperations) {
      if (!negotiatedFeatures.has(OPERATION_REGISTRY[operation].feature)) {
        throw new TypeError(`provider-session Fabric operation feature was not negotiated: ${operation}`);
      }
    }
    const localByOperation = new Map<FabricOperation, ProviderSessionLocalOperation>();
    for (const local of localOperations) {
      if (OPERATION_REGISTRY[local.operation].grantScope !== "provider-launch") {
        throw new TypeError(`provider-session local operation lacks a bridge grant scope: ${local.operation}`);
      }
      if (!negotiatedFeatures.has(OPERATION_REGISTRY[local.operation].feature)) {
        throw new TypeError(`provider-session Fabric operation feature was not negotiated: ${local.operation}`);
      }
      if (localByOperation.has(local.operation) || transport.allowedOperations.has(local.operation)) {
        throw new TypeError(`provider-session Fabric operation has multiple owners: ${local.operation}`);
      }
      localByOperation.set(local.operation, local);
    }
    this.#transport = transport;
    this.#localOperations = localByOperation;
    this.descriptors = buildMcpDescriptorSet(new Set([
      ...transport.allowedOperations,
      ...localByOperation.keys(),
    ])).tools;
    this.#descriptorsByName = new Map(this.descriptors.map((descriptor) => [descriptor.name, descriptor]));
  }

  descriptor(name: string): McpToolDescriptor | undefined {
    return this.#descriptorsByName.get(name);
  }

  async invoke(name: string, args: unknown, context?: unknown): Promise<ProviderSessionToolResult> {
    const descriptor = this.#descriptorsByName.get(name);
    if (descriptor === undefined) throw new TypeError(`unknown provider-session Fabric tool: ${name}`);
    const input = parseOperationInputForPrincipal(descriptor.operation, "agent", args);
    const local = this.#localOperations.get(descriptor.operation);
    const raw = local === undefined
      ? await this.#transport.call(descriptor.operation, input)
      : await local.invoke(input, context);
    const parsed = parseOperationResult(descriptor.operation, raw);
    if (!isRecord(parsed)) throw new TypeError("provider-session Fabric tool result must be an object");
    return Object.freeze({
      descriptor,
      receipt: renderMcpReceipt(
        descriptor,
        isRecord(input) ? input : {},
        parsed,
      ),
      structuredContent: parsed,
    });
  }
}

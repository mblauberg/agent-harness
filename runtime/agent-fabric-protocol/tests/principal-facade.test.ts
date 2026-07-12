import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  PROTOCOL_FEATURES,
  allowedOperationsForPrincipal,
  createAgentClient,
  createIntegrationClient,
  createOperatorClient,
  type FabricOperation,
  type OperationInputMap,
  type OperationResultMap,
  type ProtocolFeature,
  type ProtocolPrincipal,
  type ProtocolRpcTransport,
} from "../src/index.js";

class FacadeTransport implements ProtocolRpcTransport {
  readonly features: readonly ProtocolFeature[] = PROTOCOL_FEATURES;
  readonly allowedOperations: ReadonlySet<FabricOperation>;

  constructor(readonly principal: ProtocolPrincipal) {
    this.allowedOperations = new Set(allowedOperationsForPrincipal(principal, this.features));
  }

  call<Operation extends keyof OperationInputMap & FabricOperation>(
    _operation: Operation,
    _input: OperationInputMap[Operation],
  ): Promise<OperationResultMap[Operation]> {
    return Promise.reject(new Error("not called"));
  }

  async close(): Promise<void> {}
}

const principals = {
  operator: {
    kind: "operator",
    operatorId: "operator_01" as never,
    projectId: "project_01" as never,
    projectAuthorityGeneration: 1,
    principalGeneration: 1,
  },
  agent: {
    kind: "agent",
    agentId: "agent_01" as never,
    projectSessionId: "ps_01" as never,
    runId: "run_01",
    principalGeneration: 1,
  },
  integration: {
    kind: "integration",
    integrationId: "integration_01" as never,
    projectId: "project_01" as never,
    principalGeneration: 1,
  },
} as const satisfies Record<string, ProtocolPrincipal>;

describe("registry-generated principal facades", () => {
  it("exposes exactly the server-authorized operator operations and no agent-only resource or gate check", () => {
    const transport = new FacadeTransport(principals.operator);
    const client = createOperatorClient(transport);
    expect(Object.keys(client.operations).sort()).toStrictEqual([...transport.allowedOperations].sort());
    expect(Reflect.get(client.operations, FABRIC_OPERATIONS.scopedGateCheck)).toBeUndefined();
    expect(Reflect.get(client.operations, FABRIC_OPERATIONS.resourceReserve)).toBeUndefined();
    expect(Object.hasOwn(client, "resources")).toBe(false);
  });

  it("exposes agent chair operations but never integration-only provider acceptance", () => {
    const transport = new FacadeTransport(principals.agent);
    const client = createAgentClient(transport);
    expect(Object.keys(client.operations).sort()).toStrictEqual([...transport.allowedOperations].sort());
    expect(client.operations[FABRIC_OPERATIONS.scopedGateCreate]).toBeTypeOf("function");
    expect(client.operations[FABRIC_OPERATIONS.membershipBind]).toBeTypeOf("function");
    expect(Reflect.get(client.operations, FABRIC_OPERATIONS.resultDeliveryProviderAccept)).toBeUndefined();
    expect(client.requestResults).not.toHaveProperty("providerAccept");
  });

  it("exposes all integration callbacks granted by the registry", () => {
    const transport = new FacadeTransport(principals.integration);
    const client = createIntegrationClient(transport);
    expect(Object.keys(client.operations).sort()).toStrictEqual([...transport.allowedOperations].sort());
    expect(client.operations[FABRIC_OPERATIONS.integrationInputAttest]).toBeTypeOf("function");
    expect(client.operations[FABRIC_OPERATIONS.resourceReconcile]).toBeTypeOf("function");
    expect(client.operations[FABRIC_OPERATIONS.resultDeliveryProviderAccept]).toBeTypeOf("function");
  });

  it("refuses to build a facade whose requested kind differs from the bound connection", () => {
    expect(() => createOperatorClient(new FacadeTransport(principals.agent))).toThrow(/not operator/);
  });
});

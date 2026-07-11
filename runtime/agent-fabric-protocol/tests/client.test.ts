import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  createAgentClient,
  createOperatorClient,
  type FabricOperation,
  type OperationInputMap,
  type OperationResultMap,
  type ProtocolFeature,
  type ProtocolRpcTransport,
} from "../src/index.js";

class RecordingTransport implements ProtocolRpcTransport {
  readonly features: readonly ProtocolFeature[];
  readonly calls: Array<{ operation: FabricOperation; input: unknown }> = [];
  readonly #result: unknown;

  constructor(features: readonly ProtocolFeature[], result: unknown) {
    this.features = features;
    this.#result = result;
  }

  call<Operation extends FabricOperation>(
    operation: Operation,
    input: OperationInputMap[Operation],
  ): Promise<OperationResultMap[Operation]> {
    this.calls.push({ operation, input });
    return Promise.resolve(this.#result as OperationResultMap[Operation]);
  }

  async close(): Promise<void> {}
}

describe("negotiated operator client", () => {
  it("omits feature groups the daemon did not negotiate", () => {
    const transport = new RecordingTransport(["project-sessions.v1"], {});

    const client = createOperatorClient(transport);

    expect(Object.hasOwn(client, "projectSessions")).toBe(true);
    expect(Object.hasOwn(client, "intakes")).toBe(false);
    expect(Object.hasOwn(client, "takeover")).toBe(false);
  });

  it("sends project-session reads through the stable typed operation", async () => {
    const session = {
      projectSessionId: "ps_01",
      projectId: "project_01",
      mode: "coordinated",
      state: "active",
      revision: 1,
      generation: 1,
      authorityRef: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      budgetRef: "budget_01",
      launchPacketRef: {
        path: "launch.json",
        digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
      membershipRevision: 0,
      origin: { kind: "operator-launch", operatorId: "operator_01" },
    };
    const transport = new RecordingTransport(["project-sessions.v1"], session);
    const client = createOperatorClient(transport);
    if (client.projectSessions === undefined) throw new Error("expected project-session feature");

    const result = await client.projectSessions.get({
      projectId: "project_01" as never,
      projectSessionId: "ps_01" as never,
      expectedGeneration: 1,
    });

    expect(result).toBe(session);
    expect(transport.calls).toStrictEqual([{
      operation: FABRIC_OPERATIONS.projectSessionGet,
      input: { projectId: "project_01", projectSessionId: "ps_01", expectedGeneration: 1 },
    }]);
  });
});

describe("negotiated baseline agent client", () => {
  it("exposes the full typed baseline call surface only when fabric-core is negotiated", async () => {
    const transport = new RecordingTransport(["fabric-core.v1"], { messageId: "message_01" });
    const client = createAgentClient(transport);
    if (client.core === undefined) throw new Error("expected baseline core feature");

    await client.core.call(FABRIC_OPERATIONS.sendMessage, {
      audience: { kind: "agents", agentIds: ["agent_02"] },
      kind: "event",
      body: "ready",
      requiresAck: false,
      dedupeKey: "message_01",
    });

    expect(transport.calls.at(-1)?.operation).toBe(FABRIC_OPERATIONS.sendMessage);
  });
});

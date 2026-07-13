import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  OPERATION_REGISTRY,
  createAgentClient,
  createOperatorClient,
  operationsForFeatures,
  type FabricOperation,
  type OperationInputMap,
  type OperationResultMap,
  type ProtocolFeature,
  type ProtocolRpcTransport,
  type ProtocolPrincipal,
} from "../src/index.js";

class RecordingTransport implements ProtocolRpcTransport {
  readonly features: readonly ProtocolFeature[];
  readonly calls: Array<{ operation: FabricOperation; input: unknown }> = [];
  readonly principal: ProtocolPrincipal;
  readonly allowedOperations: ReadonlySet<FabricOperation>;
  readonly #result: unknown;

  constructor(
    features: readonly ProtocolFeature[],
    result: unknown,
    kind: ProtocolPrincipal["kind"] = "operator",
    allowedOperations?: readonly FabricOperation[],
  ) {
    this.features = features;
    this.#result = result;
    this.principal = kind === "operator"
      ? {
          kind,
          operatorId: "operator_01" as never,
          projectId: "project_01" as never,
          projectAuthorityGeneration: 1,
          principalGeneration: 1,
        }
      : kind === "agent"
        ? { kind, agentId: "agent_01" as never, projectSessionId: "ps_01" as never, runId: "run_01", principalGeneration: 1 }
        : {
            kind,
            integrationId: "integration_01" as never,
            projectId: "project_01" as never,
            projectSessionId: "ps_01" as never,
            runId: "run_01",
            principalGeneration: 1,
            providerId: "anthropic",
            providerSessionRef: "provider_session_01",
          };
    this.allowedOperations = new Set(allowedOperations ??
      [...operationsForFeatures(features)].filter((operation) => OPERATION_REGISTRY[operation].principals.includes(kind)));
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

  it("exposes only the current attachment lifecycle controls", () => {
    const transport = new RecordingTransport(
      ["operator-control.v1"],
      {},
      "operator",
      [
        FABRIC_OPERATIONS.operatorAttach,
        FABRIC_OPERATIONS.operatorDetach,
        FABRIC_OPERATIONS.operatorHeartbeat,
      ],
    );

    const client = createOperatorClient(transport);

    expect(client.operatorControl).toMatchObject({
      attach: expect.any(Function),
      detach: expect.any(Function),
      heartbeat: expect.any(Function),
    });
    expect(Object.hasOwn(client.operatorControl ?? {}, "command")).toBe(false);
  });

  it("exposes artifact content only with the exact negotiated operation", async () => {
    const unavailable = createOperatorClient(new RecordingTransport([], {}));
    expect(unavailable.artifacts).toBeUndefined();

    const result = {
      available: false,
      artifactRef: {
        path: "docs/spec.md",
        digest: `sha256:${"a".repeat(64)}`,
      },
      reason: "not-found",
    };
    const transport = new RecordingTransport(["artifact-content-read.v1"], result);
    const client = createOperatorClient(transport);
    if (client.artifacts === undefined) throw new Error("expected artifact content feature");
    const input = {
      credential: { capabilityId: "capability_01", token: "afop_read_token" },
      projectId: "project_01",
      evidenceId: "evidence_01",
      expectedEvidenceRevision: 1,
      artifactRef: result.artifactRef,
      cursor: null,
      maximumBytes: 131_072,
      maximumLines: 2_000,
    } as never;
    await expect(client.artifacts.readContent(input)).resolves.toBe(result);
    expect(transport.calls).toStrictEqual([{
      operation: FABRIC_OPERATIONS.operatorArtifactContentRead,
      input,
    }]);
  });
});

describe("negotiated baseline agent client", () => {
  it("exposes the full typed baseline call surface only when fabric-core is negotiated", async () => {
    const transport = new RecordingTransport(["fabric-core.v1"], { messageId: "message_01" }, "agent");
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

  it("exposes evidence publication only with the registry feature", async () => {
    const result = { evidenceId: "evidence_01" };
    const unavailable = createAgentClient(new RecordingTransport([], result, "agent"));
    expect(unavailable.evidence).toBeUndefined();
    const transport = new RecordingTransport(["artifact-registry.v1"], result, "agent");
    const client = createAgentClient(transport);
    if (client.evidence === undefined) throw new Error("expected evidence registry feature");
    const input = {
      commandId: "command_01",
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      requestedSourceKind: "run-file",
      evidenceKind: "test",
      relativePath: "test/results.txt",
      sourceDigest: `sha256:${"b".repeat(64)}`,
    } as never;
    await expect(client.evidence.publish(input)).resolves.toBe(result);
    expect(transport.calls).toStrictEqual([{
      operation: FABRIC_OPERATIONS.evidencePublish,
      input,
    }]);
  });

  it("preserves the exact run/task target on a scoped operation check", async () => {
    const result = { allowed: true, checkedGateRevisions: {} };
    const transport = new RecordingTransport(["scoped-gates.v1"], result, "agent");
    const client = createAgentClient(transport);
    if (client.gates === undefined) throw new Error("expected scoped-gate feature");
    const input = {
      projectSessionId: "ps_01" as never,
      coordinationRunId: "run_01" as never,
      dependencyRevision: 4,
      enforcementPoint: "operation",
      operationId: FABRIC_OPERATIONS.taskCompleteWithReply,
      operationTarget: { kind: "task", taskId: "task_01" as never },
    } as const;

    await expect(client.gates.check(input)).resolves.toBe(result);
    expect(transport.calls).toStrictEqual([{
      operation: FABRIC_OPERATIONS.scopedGateCheck,
      input,
    }]);
  });
});

import { createConnection, type Socket } from "node:net";
import { createInterface } from "node:readline";
import Database from "better-sqlite3";

import {
  FABRIC_OPERATIONS,
  NdjsonRpcTransport,
  type ProtocolInitializeRequest,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { createDaemonFixture } from "../../support/daemon-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

async function rawConnection(socketPath: string): Promise<{
  socket: Socket;
  nextResponse(): Promise<Record<string, unknown>>;
}> {
  const socket = createConnection(socketPath);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  const lines = createInterface({ input: socket, crlfDelay: Infinity });
  const responses: Array<(value: Record<string, unknown>) => void> = [];
  lines.on("line", (line) => responses.shift()?.(JSON.parse(line) as Record<string, unknown>));
  cleanup.unshift(async () => {
    lines.close();
    socket.destroy();
  });
  return {
    socket,
    async nextResponse() {
      return await new Promise<Record<string, unknown>>((resolve) => responses.push(resolve));
    },
  };
}

afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).map(async (close) => close()));
});

describe("daemon public protocol routing", () => {
  it("enforces a task-scoped named-operation gate at the public mutation boundary", async () => {
    const fixture = await createDaemonFixture("run-public-gate-enforcement");
    cleanup.push(fixture.cleanup);
    const database = new Database(fixture.databasePath);
    try {
      const identity = database.prepare(`
        SELECT run.project_session_id, run.dependency_revision, agent.authority_id
          FROM runs run JOIN agents agent
            ON agent.run_id=run.run_id AND agent.agent_id='peer'
         WHERE run.run_id='run-public-gate-enforcement'
      `).get() as { project_session_id: string; dependency_revision: number; authority_id: string };
      const insertTask = database.prepare(`
        INSERT INTO tasks(
          run_id, task_id, authority_id, objective, base_revision, state,
          owner_agent_id, revision, owner_lease_generation, created_by
        ) VALUES ('run-public-gate-enforcement', ?, ?, ?, 'base-publish', 'active', 'peer', 1, 1, 'chair')
      `);
      insertTask.run("task_gated_publish", identity.authority_id, "Publish gated artifact");
      insertTask.run("task_sibling_publish", identity.authority_id, "Publish sibling artifact");
      database.prepare(`
        INSERT INTO scoped_gates(
          gate_id, project_session_id, coordination_run_id, dedupe_key, scope_kind,
          scope_task_id, dependency_revision, blocked_operation_ids_json,
          enforcement_points_json, question, reason, options_json, recommendation,
          consequences_json, evidence_refs_json, created_by_ref, expected_approver_ref,
          status, human_required, revision, created_at, updated_at
        ) VALUES ('gate_publish', ?, 'run-public-gate-enforcement', 'gate:publish', 'task',
                  'task_gated_publish', ?, '["fabric.v1.artifact.publish"]', '["operation"]',
                  'Publish?', 'Human decision required', '["approve","defer"]', 'defer',
                  '[]', '[]', 'agent:chair', 'authenticated-human-operator', 'pending', 1, 1, 1, 1)
      `).run(identity.project_session_id, identity.dependency_revision);
      database.prepare(`
        INSERT INTO scoped_gate_tasks(
          gate_id, project_session_id, run_id, task_id, binding_kind, bound_dependency_revision
        ) VALUES ('gate_publish', ?, 'run-public-gate-enforcement', 'task_gated_publish', 'direct', ?)
      `).run(identity.project_session_id, identity.dependency_revision);
      database.prepare(`
        INSERT INTO scoped_gate_operations(gate_id, operation_id)
        VALUES ('gate_publish', 'fabric.v1.artifact.publish')
      `).run();
    } finally {
      database.close();
    }

    const transport = await NdjsonRpcTransport.connect(createConnection(fixture.socketPath), {
      protocolVersion: 1,
      client: { name: "public-gate-enforcement", version: "1.0.0" },
      authentication: {
        scheme: "capability",
        credential: fixture.peerCapability,
        clientNonce: "public_gate_enforcement_nonce_01",
      },
      expectedPrincipalKind: "agent",
      requiredFeatures: ["fabric-core.v1"],
      optionalFeatures: [],
    });
    cleanup.unshift(async () => transport.close());

    await expect(transport.call(FABRIC_OPERATIONS.publishArtifact, {
      taskId: "task_gated_publish",
      relativePath: "findings/gated.md",
      sha256: "a".repeat(64),
      commandId: "publish_gated",
    })).rejects.toMatchObject({ code: "GATE_BLOCKED" });
    await expect(transport.call(FABRIC_OPERATIONS.publishArtifact, {
      taskId: "task_sibling_publish",
      relativePath: "findings/sibling.md",
      sha256: "b".repeat(64),
      commandId: "publish_sibling",
    })).rejects.toMatchObject({ code: "ARTIFACT_PATH_FORBIDDEN" });
  });

  it("serves an authenticated chair getRunStatus call over the legacy daemon Unix socket", async () => {
    const fixture = await createDaemonFixture("run-public-protocol");
    cleanup.push(fixture.cleanup);
    const stream = createConnection(fixture.socketPath);
    const initialize: ProtocolInitializeRequest = {
      protocolVersion: 1,
      client: { name: "daemon-public-protocol-integration", version: "1.0.0" },
      authentication: {
        scheme: "capability",
        credential: fixture.run.chairCapability,
        clientNonce: "daemon_public_protocol_nonce_01",
      },
      expectedPrincipalKind: "agent",
      requiredFeatures: ["fabric-core.v1"],
      optionalFeatures: [],
    };

    const transport = await NdjsonRpcTransport.connect(stream, initialize);
    cleanup.unshift(async () => transport.close());

    expect(transport.principal).toMatchObject({
      kind: "agent",
      agentId: "chair",
      runId: fixture.run.runId,
    });
    expect(transport.features).toContain("fabric-core.v1");
    await expect(transport.call(FABRIC_OPERATIONS.getRunStatus, {
      runId: fixture.run.runId,
    })).resolves.toMatchObject({
      runId: fixture.run.runId,
      chairAgentId: "chair",
      barrier: { state: "open" },
    });
  });

  it("rejects a first frame that mixes public and legacy protocol fields", async () => {
    const fixture = await createDaemonFixture("run-ambiguous-protocol");
    cleanup.push(fixture.cleanup);
    const raw = await rawConnection(fixture.socketPath);
    const response = raw.nextResponse();
    raw.socket.write(`${JSON.stringify({
      id: "ambiguous_request",
      operation: "initialize",
      input: {},
      capability: fixture.run.chairCapability,
      method: "initialize",
      params: {},
    })}\n`);

    await expect(response).resolves.toMatchObject({
      id: "connection",
      error: { code: "DAEMON_PROTOCOL_AMBIGUOUS" },
    });
  });

  it("never authenticates the bootstrap discovery capability as a public principal", async () => {
    const fixture = await createDaemonFixture("run-bootstrap-not-principal");
    cleanup.push(fixture.cleanup);
    const stream = createConnection(fixture.socketPath);
    cleanup.unshift(async () => {
      stream.destroy();
    });

    await expect(NdjsonRpcTransport.connect(stream, {
      protocolVersion: 1,
      client: { name: "bootstrap-negative", version: "1.0.0" },
      authentication: {
        scheme: "capability",
        credential: fixture.daemon.bootstrapCapability,
        clientNonce: "bootstrap_negative_nonce_01",
      },
      expectedPrincipalKind: "agent",
      requiredFeatures: ["fabric-core.v1"],
      optionalFeatures: [],
    })).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
      message: "bootstrap discovery capability is not a public protocol principal",
    });
  });
});

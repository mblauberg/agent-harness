import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PROTOCOL_FEATURES, PROTOCOL_LIMITS } from "@local/agent-fabric-protocol";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { openFabric, type Fabric, type FabricClient } from "../../../src/index.ts";
import { servePublicProtocolConnection } from "../../../src/daemon/public-protocol.ts";
import {
  TestLifecycleReceiptAuthority,
  type LifecycleReceiptAuthorityCorruption,
} from "../../support/lifecycle-receipt-authority-fake.ts";
import {
  createLifecycleFixture,
  type LifecycleFixture,
} from "../../support/lifecycle-testkit.ts";

const fakeProvider = fileURLToPath(new URL("../../support/lifecycle-fake-provider.ts", import.meta.url));
const cleanup: Array<() => Promise<void>> = [];

type ConfiguredFixture = {
  fixture: LifecycleFixture;
  fabric: Fabric;
  chair: FabricClient;
  authority: TestLifecycleReceiptAuthority;
  agentId: string;
  task: { taskId: string; revision: number };
};

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

async function eventually(assertion: () => Promise<void> | void, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let failure: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error: unknown) {
      failure = error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw failure;
}

async function configuredFixture(
  corruption: LifecycleReceiptAuthorityCorruption = "none",
): Promise<ConfiguredFixture> {
  const fixture = await createLifecycleFixture();
  await fixture.fabric.close();
  const authority = new TestLifecycleReceiptAuthority();
  authority.corruption = corruption;
  const socketPath = join(fixture.directory, "authority-worker.sock");
  const fabric = await openFabric({
    databasePath: fixture.databasePath,
    workspaceRoots: [fixture.directory],
    clock: fixture.clock.now,
    fabricSocketPath: socketPath,
    lifecycleReceiptAuthority: authority,
    adapters: {
      "fake-lifecycle": {
        command: [process.execPath, "--import", "tsx", fakeProvider],
        environment: { LIFECYCLE_FAKE_JOURNAL: fixture.providerJournalPath },
      },
    },
  });
  const server = createServer((socket) => {
    servePublicProtocolConnection(socket, {
      daemonVersion: "test-authority-worker",
      daemonInstanceGeneration: 1,
      offeredFeatures: PROTOCOL_FEATURES,
      limits: PROTOCOL_LIMITS,
      verifyCredential: (credential) => fabric.verifyProtocolCredential(credential),
      dispatch: async (protocolContext, operation, input) =>
        await fabric.dispatchPublicProtocol(protocolContext, operation, input),
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const chair = fabric.connect(fixture.capabilities.chair);
  const agentId = "authority-worker";
  const workerAuthority = await chair.delegateAuthority({
    parentAuthorityId: fixture.chairAuthorityId,
    authority: {
      ...fixture.rootAuthority,
      sourcePaths: ["src/leader/child"],
      budget: { turns: 10, provider_calls: 10, concurrent_turns: 2 },
    },
  });
  await chair.attachAgent({
    agentId,
    authorityId: workerAuthority.authorityId,
    adapterId: "fake-lifecycle",
    actionId: "authority-worker:attach",
    providerSessionRef: `fake-session:${agentId}:g1`,
  });
  const task = await chair.createTask({
    taskId: "authority-worker-task",
    authorityId: workerAuthority.authorityId,
    eligibleAgentIds: [agentId],
    participantAgentIds: ["chair", agentId],
    objective: "exercise the external lifecycle receipt authority worker",
    baseRevision: "authority-worker-base",
    commandId: "authority-worker:create-task",
  });
  cleanup.push(async () => {
    await fabric.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(fixture.directory, { recursive: true, force: true });
  });
  return {
    fixture,
    fabric,
    chair,
    authority,
    agentId,
    task,
  };
}

async function requestRetainedRotation(context: ConfiguredFixture, commandId: string) {
  const relativePath = join("checkpoints", `${context.agentId}-${commandId.replaceAll(":", "-")}.json`);
  const document = {
    schemaVersion: 1,
    agentId: context.agentId,
    mailboxWatermark: 0,
    acknowledgedAboveWatermark: [],
    inFlightChildren: [],
    openWork: [context.task.taskId],
    nextAction: "resume the exact task graph after authenticated adoption",
    providerResumeReference: `fake-session:${context.agentId}:g1`,
  };
  const bytes = `${JSON.stringify(document, null, 2)}\n`;
  await mkdir(join(context.fixture.runDirectory, "checkpoints"), { recursive: true });
  await writeFile(join(context.fixture.runDirectory, relativePath), bytes, { mode: 0o600 });
  const action = await context.chair.dispatchProviderAction({
    adapterId: "fake-lifecycle",
    actionId: `${commandId}:send-turn`,
    operation: "send_turn",
    payload: {
      agentId: context.agentId,
      providerSessionGeneration: 1,
      taskId: context.task.taskId,
      instruction: "claim the task and rotate from this retained provider turn",
      scenario: "retained-lifecycle-callback",
      lifecycleRequest: {
        action: "rotate",
        taskId: context.task.taskId,
        expectedTaskRevision: context.task.revision,
        checkpoint: {
          relativePath,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          mailboxWatermark: 0,
          acknowledgedAboveWatermark: [],
          inFlightChildren: [],
          openWork: [context.task.taskId],
          nextAction: document.nextAction,
          providerResumeReference: document.providerResumeReference,
        },
        commandId,
      },
    },
    commandId: `${commandId}:dispatch`,
  });
  const result = action.result;
  if (
    result === null || typeof result !== "object" || Array.isArray(result) ||
    !("lifecycleAcceptance" in result) || result.lifecycleAcceptance === null ||
    typeof result.lifecycleAcceptance !== "object" || Array.isArray(result.lifecycleAcceptance)
  ) {
    throw new Error("retained provider did not return lifecycle acceptance");
  }
  return result.lifecycleAcceptance as {
    lifecycle: string;
    agentId: string;
    projectSessionId: string;
  };
}

describe("Spec 05 external lifecycle receipt authority worker", () => {
  it("admits a zero scope, recovers a lost append response, and atomically adopts from a later pinned head", async () => {
    const context = await configuredFixture();
    context.authority.appendSuccessThenThrowOnce = true;
    context.authority.appendUnrelatedAfterNextReceipt = true;

    const accepted = await requestRetainedRotation(context, "lifecycle:authority-worker:adopt");
    expect(accepted).toMatchObject({ lifecycle: "suspended", agentId: context.agentId });
    const projectSessionId = accepted.projectSessionId;

    await eventually(async () => {
      await expect(context.chair.getAgentLifecycle({ agentId: context.agentId })).resolves.toMatchObject({
        lifecycle: "ready",
        providerSessionGeneration: 2,
        principalGeneration: 2,
        bridgeGeneration: 2,
        currentSource: { state: "finalized", disposition: "adopted" },
      });
    });

    expect(context.authority).toMatchObject({ admitCalls: 1, appendCalls: 1, appendThrowCount: 1 });
    expect(context.authority.scopeRecords(projectSessionId, context.fixture.runId)).toHaveLength(2);
    const authorityCheckpoint = context.authority.latestScopeCheckpoint(
      projectSessionId,
      context.fixture.runId,
    );
    expect(authorityCheckpoint).toMatchObject({ receiptCount: 2, headAuthoritySequence: 2 });

    const database = new Database(context.fixture.databasePath, { readonly: true });
    try {
      expect(database.prepare(`
        SELECT initial_receipt_count,initial_head_authority_sequence
          FROM lifecycle_scope_admission_resolutions
         WHERE project_session_id=? AND run_id=?
      `).get(projectSessionId, context.fixture.runId)).toEqual({
        initial_receipt_count: 0,
        initial_head_authority_sequence: 0,
      });
      expect(database.prepare(`
        SELECT receipt_count,head_receipt_digest
          FROM lifecycle_receipt_namespace_members
         WHERE project_session_id=? AND run_id=?
      `).get(projectSessionId, context.fixture.runId)).toEqual({
        receipt_count: 0,
        head_receipt_digest: null,
      });
      expect(database.prepare(`
        SELECT receipt_count,head_authority_sequence,ordered_record_set_digest
          FROM lifecycle_receipt_scope_checkpoints
         WHERE project_session_id=? AND run_id=? AND receipt_count=2
      `).get(projectSessionId, context.fixture.runId)).toEqual({
        receipt_count: 2,
        head_authority_sequence: 2,
        ordered_record_set_digest: authorityCheckpoint.orderedRecordSetDigest,
      });
      expect(database.prepare(`
        SELECT agent.lifecycle,head.state,head.disposition_code,head.terminal,
               bridge.provider_session_generation,bridge.bridge_generation
          FROM agents agent
          JOIN lifecycle_rotation_custody_heads head
            ON head.run_id=agent.run_id AND head.agent_id=agent.agent_id
          JOIN agent_bridge_state bridge
            ON bridge.run_id=agent.run_id AND bridge.agent_id=agent.agent_id
         WHERE agent.run_id=? AND agent.agent_id=?
      `).get(context.fixture.runId, context.agentId)).toEqual({
        lifecycle: "ready",
        state: "finalized",
        disposition_code: "adopted",
        terminal: 1,
        provider_session_generation: 2,
        bridge_generation: 2,
      });
      expect(database.prepare("SELECT count(*) AS count FROM lifecycle_authority_receipts").get())
        .toEqual({ count: 1 });
      expect(database.prepare("SELECT count(*) AS count FROM lifecycle_transition_applies").get())
        .toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });

  it.each([
    ["gap", "checkpoint page is crossed"],
    ["duplicate", "checkpoint page is crossed"],
    ["wrong-set-digest", "absent from its pinned checkpoint"],
  ] as const)("fails closed when the pinned scope contains a %s corruption", async (corruption, message) => {
    const context = await configuredFixture(corruption);
    context.authority.appendUnrelatedAfterNextReceipt = true;

    const accepted = await requestRetainedRotation(context, `lifecycle:authority-worker:${corruption}`);
    await eventually(() => {
      const database = new Database(context.fixture.databasePath, { readonly: true });
      try {
        const failure = database.prepare(`
          SELECT payload_json FROM events
           WHERE run_id=? AND type='lifecycle-continuation-failed'
           ORDER BY created_at DESC LIMIT 1
        `).get(context.fixture.runId) as { payload_json: string } | undefined;
        expect(failure).toBeDefined();
        expect(JSON.parse(failure?.payload_json ?? "{}")).toMatchObject({ message: expect.stringContaining(message) });
      } finally {
        database.close();
      }
    });

    await expect(context.chair.getAgentLifecycle({ agentId: context.agentId })).resolves.toMatchObject({
      lifecycle: "suspended",
      providerSessionGeneration: 1,
      principalGeneration: 1,
      bridgeGeneration: 1,
      currentSource: { state: "committing", disposition: null },
    });
    expect(context.authority.scopeRecords(accepted.projectSessionId, context.fixture.runId)).toHaveLength(2);

    const database = new Database(context.fixture.databasePath, { readonly: true });
    try {
      expect(database.prepare(`
        SELECT agent.lifecycle,head.state,head.disposition_code,head.terminal,
               bridge.provider_session_generation,bridge.bridge_generation
          FROM agents agent
          JOIN lifecycle_rotation_custody_heads head
            ON head.run_id=agent.run_id AND head.agent_id=agent.agent_id
          JOIN agent_bridge_state bridge
            ON bridge.run_id=agent.run_id AND bridge.agent_id=agent.agent_id
         WHERE agent.run_id=? AND agent.agent_id=?
      `).get(context.fixture.runId, context.agentId)).toEqual({
        lifecycle: "suspended",
        state: "committing",
        disposition_code: "none",
        terminal: 0,
        provider_session_generation: 1,
        bridge_generation: 1,
      });
      expect(database.prepare("SELECT count(*) AS count FROM lifecycle_authority_receipts").get())
        .toEqual({ count: 0 });
      expect(database.prepare("SELECT count(*) AS count FROM lifecycle_transition_applies").get())
        .toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });
});

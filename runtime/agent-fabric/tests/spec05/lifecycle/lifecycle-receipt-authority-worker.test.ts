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
import { canonicalJson } from "../../../src/project-session/store-support.ts";
import { AtomicDeliveryStore } from "../../../src/results/store.ts";
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

function lifecycleDigest(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(`agent-fabric.lifecycle.v1\0${domain}\0${canonicalJson(value)}`)
    .digest("hex")}`;
}

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
  options: Readonly<{ wrongProviderGeneration?: boolean; spawnDelayMs?: number }> = {},
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
        environment: {
          LIFECYCLE_FAKE_JOURNAL: fixture.providerJournalPath,
          ...(options.wrongProviderGeneration === true
            ? { LIFECYCLE_FAKE_WRONG_PROVIDER_GENERATION: "1" }
            : {}),
          ...(options.spawnDelayMs === undefined
            ? {}
            : { LIFECYCLE_FAKE_SPAWN_DELAY_MS: String(options.spawnDelayMs) }),
        },
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
  it("quarantines a live provider result whose generation crosses the reserved target", async () => {
    const context = await configuredFixture("none", { wrongProviderGeneration: true });

    await requestRetainedRotation(context, "lifecycle:authority-worker:wrong-provider-generation");
    await eventually(async () => {
      await expect(context.chair.getAgentLifecycle({ agentId: context.agentId })).resolves.toMatchObject({
        lifecycle: "suspended",
        providerSessionGeneration: 1,
        bridgeGeneration: 1,
        currentSource: { state: "finalized", disposition: "quarantined" },
      });
    });
    const database = new Database(context.fixture.databasePath, { readonly: true });
    try {
      const action = database.prepare(`
        SELECT status,result_json FROM provider_actions
         WHERE run_id=? AND action_id=?
      `).get(
        context.fixture.runId,
        "lifecycle:authority-worker:wrong-provider-generation:spawn",
      ) as { status: string; result_json: string };
      expect(action.status).toBe("quarantined");
      expect(JSON.parse(action.result_json)).toMatchObject({
        kind: "integrity-quarantine",
        reason: "provider-result-reserved-generation-crossed",
      });
      expect(database.prepare(`
        SELECT count(*) AS count FROM lifecycle_rotation_custody_revisions
         WHERE state='provider-terminal'
      `).get()).toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });

  it("keeps an absent authority receipt pending for exact retry", async () => {
    const context = await configuredFixture();
    context.authority.readReceiptAlwaysAbsent = true;

    await requestRetainedRotation(context, "lifecycle:authority-worker:receipt-pending");
    await eventually(() => {
      const database = new Database(context.fixture.databasePath, { readonly: true });
      try {
        const failure = database.prepare(`
          SELECT payload_json FROM events
           WHERE run_id=? AND type='lifecycle-continuation-failed'
           ORDER BY created_at DESC LIMIT 1
        `).get(context.fixture.runId) as { payload_json: string } | undefined;
        expect(JSON.parse(failure?.payload_json ?? "{}")).toMatchObject({
          message: expect.stringContaining("receipt remains pending"),
        });
      } finally {
        database.close();
      }
    });
    await expect(context.chair.getAgentLifecycle({ agentId: context.agentId })).resolves.toMatchObject({
      lifecycle: "suspended",
      currentSource: { state: "committing", disposition: null },
    });
    const database = new Database(context.fixture.databasePath, { readonly: true });
    try {
      expect(database.prepare("SELECT count(*) AS count FROM lifecycle_authority_receipts").get())
        .toEqual({ count: 0 });
      expect(database.prepare("SELECT count(*) AS count FROM lifecycle_transition_applies").get())
        .toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });

  it("admits a zero scope, recovers a lost append response, and atomically adopts from a later pinned head", async () => {
    const context = await configuredFixture("none", { spawnDelayMs: 200 });
    context.authority.appendSuccessThenThrowOnce = true;
    context.authority.appendUnrelatedAfterNextReceipt = true;
    const capturedWriteLeases = [
      { leaseId: "lifecycle-write-lease-a", generation: 3 },
      { leaseId: "lifecycle-write-lease-b", generation: 7 },
    ];
    const leaseSeed = new Database(context.fixture.databasePath);
    try {
      const projectSessionId = leaseSeed.prepare(
        "SELECT project_session_id FROM runs WHERE run_id=?",
      ).pluck().get(context.fixture.runId) as string;
      const insert = leaseSeed.prepare(`
        INSERT INTO leases(lease_id,run_id,kind,holder_agent_id,generation,status,expires_at,updated_at)
        VALUES (?,?,'write',?,?,'active',999999,1)
      `);
      capturedWriteLeases.forEach((lease) => insert.run(
        lease.leaseId,
        context.fixture.runId,
        context.agentId,
        lease.generation,
      ));
      leaseSeed.prepare(`
        INSERT INTO leases(lease_id,run_id,kind,holder_agent_id,generation,status,expires_at,updated_at)
        VALUES ('lifecycle-write-lease-prequarantined',?,'write',?,9,'quarantined',999999,1)
      `).run(context.fixture.runId, context.agentId);
      for (const [index, state] of (["claimed", "provider-accepted", "pending", "claimed"] as const).entries()) {
        const suffix = String(index + 1);
        leaseSeed.prepare(`
          INSERT INTO messages(
            message_id,run_id,sender_id,dedupe_key,payload_hash,audience_json,kind,body,
            requires_ack,conversation_id,task_revision,hop_count,created_at
          ) VALUES (?,?,?,?,?,'{"kind":"agent"}','request','request',1,?,?,0,1),
                   (?,?,?,?,?,'{"kind":"agent"}','reply','reply',1,?,?,0,1)
        `).run(
          `lifecycle-request-message-${suffix}`, context.fixture.runId, context.agentId,
          `lifecycle-request-${suffix}`, "a".repeat(64), `lifecycle-conversation-${suffix}`, context.task.revision,
          `lifecycle-reply-message-${suffix}`, context.fixture.runId, context.agentId,
          `lifecycle-reply-${suffix}`, "b".repeat(64), `lifecycle-conversation-${suffix}`, context.task.revision,
        );
        leaseSeed.prepare(`
          INSERT INTO task_requests(
            request_id,project_session_id,run_id,task_id,requester_agent_id,request_revision,
            conversation_id,request_message_id,target_agent_id,target_provider_session,
            expected_artifacts_json,acknowledgement_required,dedupe_key,response_deadline,
            callback_id,callback_generation,dependent_barrier_id,state,payload_digest,created_at,updated_at
          ) VALUES (?,?,?,?,?,1,?,?,?,?, '[]',1,?,999999,?,1,?,'answered',?,1,1)
        `).run(
          `lifecycle-request-${suffix}`, projectSessionId, context.fixture.runId, context.task.taskId,
          context.agentId, `lifecycle-conversation-${suffix}`, `lifecycle-request-message-${suffix}`,
          context.agentId, `fake-session:${context.agentId}:g1`, `lifecycle-request-dedupe-${suffix}`,
          `lifecycle-callback-${suffix}`, `lifecycle-barrier-${suffix}`, "c".repeat(64),
        );
        leaseSeed.prepare(`
          INSERT INTO task_results(
            result_id,request_id,project_session_id,run_id,task_id,task_revision,
            reply_message_id,reply_revision,payload_digest,artifacts_json,terminal_state,summary,created_at
          ) VALUES (?,?,?,?,?,?,?,1,?,'[]','complete','complete',1)
        `).run(
          `lifecycle-result-${suffix}`, `lifecycle-request-${suffix}`, projectSessionId,
          context.fixture.runId, context.task.taskId, context.task.revision,
          `lifecycle-reply-message-${suffix}`, "d".repeat(64),
        );
        leaseSeed.prepare(`
          INSERT INTO result_deliveries(
            result_delivery_id,callback_id,request_id,result_id,project_session_id,run_id,
            task_id,requester_agent_id,target_provider_session,state,required,revision,
            claim_generation,assignment_generation,response_deadline,request_revision,
            reply_revision,task_revision,payload_digest,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,1,1,3,1,999999,1,1,?,?,1)
        `).run(
          `lifecycle-result-delivery-${suffix}`, `lifecycle-callback-${suffix}`,
          `lifecycle-request-${suffix}`, `lifecycle-result-${suffix}`, projectSessionId,
          context.fixture.runId, context.task.taskId, context.agentId,
          `fake-session:${context.agentId}:g1`, state, context.task.revision, "e".repeat(64),
        );
      }
      leaseSeed.prepare(`
        UPDATE result_deliveries SET claim_deadline=0,response_deadline=0
         WHERE result_delivery_id='lifecycle-result-delivery-4'
      `).run();
    } finally {
      leaseSeed.close();
    }

    const accepted = await requestRetainedRotation(context, "lifecycle:authority-worker:adopt");
    expect(accepted).toMatchObject({ lifecycle: "suspended", agentId: context.agentId });
    const projectSessionId = accepted.projectSessionId;
    const beforePrepare = new Database(context.fixture.databasePath);
    try {
      expect(beforePrepare.prepare(`
        UPDATE result_deliveries
           SET state='provider-accepted',revision=revision+1,updated_at=2
         WHERE result_delivery_id='lifecycle-result-delivery-1'
           AND state='claimed' AND claim_generation=3 AND revision=1
      `).run().changes).toBe(1);
      const store = new AtomicDeliveryStore({ database: beforePrepare, clock: () => 1_000 });
      expect(() => store.abandon({
        agentId: context.agentId,
        projectSessionId,
        coordinationRunId: context.fixture.runId,
        principalGeneration: 1,
      } as Parameters<AtomicDeliveryStore["abandon"]>[0], {
        commandId: "lifecycle-race-abandon",
        resultDeliveryId: "lifecycle-result-delivery-4",
        expectedRevision: 1,
        reason: "should be lifecycle fenced",
      } as Parameters<AtomicDeliveryStore["abandon"]>[1])).toThrow(
        "result delivery is owned by an active lifecycle rotation",
      );
      expect(() => beforePrepare.prepare(`
        UPDATE leases SET status='released',updated_at=2
         WHERE lease_id='lifecycle-write-lease-a'
      `).run()).toThrow("INVARIANT_write_lease_lifecycle_custody_owner");
      expect(() => beforePrepare.prepare(`
        UPDATE lifecycle_custody_write_leases SET active_owner=0
         WHERE lease_id='lifecycle-write-lease-a'
      `).run()).toThrow("INVARIANT_lifecycle_custody_write_lease_owner");
      expect(() => beforePrepare.prepare(`
        DELETE FROM lifecycle_custody_write_leases
         WHERE lease_id='lifecycle-write-lease-a'
      `).run()).toThrow("INVARIANT_lifecycle_custody_write_lease_owner");
      expect(store.recover()).toMatchObject({ returnedClaims: 0, overdueDeliveries: 0 });
    } finally {
      beforePrepare.close();
    }
    let afterPrepareRaceError: unknown;
    let deliveryDeleteRaceError: unknown;
    let ownershipUpdateRaceError: unknown;
    let ownershipDeleteRaceError: unknown;
    let recoveryRaceResult: ReturnType<AtomicDeliveryStore["recover"]> | undefined;
    let deadlineRaceResult: ReturnType<AtomicDeliveryStore["sweepDeadlines"]> | undefined;
    context.authority.onReadReceiptOnce = () => {
      const racing = new Database(context.fixture.databasePath);
      try {
        const store = new AtomicDeliveryStore({ database: racing, clock: () => 1_000 });
        recoveryRaceResult = store.recover();
        racing.prepare(`
          INSERT OR IGNORE INTO daemon_runtime_epochs(
            instance_generation,instance_id,state,started_at,heartbeat_at
          ) VALUES (1,'lifecycle-race-epoch','running',1,1)
        `).run();
        const epoch = racing.prepare(`
          SELECT instance_generation FROM daemon_runtime_epochs
           ORDER BY instance_generation DESC LIMIT 1
        `).get() as { instance_generation: number };
        deadlineRaceResult = store.sweepDeadlines({
          daemonInstanceGeneration: epoch.instance_generation,
          passGeneration: 1,
        });
        try {
          racing.prepare(`
            UPDATE lifecycle_custody_adoption_deliveries SET active_owner=0
             WHERE delivery_id='lifecycle-result-delivery-1'
          `).run();
        } catch (error: unknown) {
          ownershipUpdateRaceError = error;
        }
        try {
          racing.prepare(`
            DELETE FROM lifecycle_custody_adoption_deliveries
             WHERE delivery_id='lifecycle-result-delivery-1'
          `).run();
        } catch (error: unknown) {
          ownershipDeleteRaceError = error;
        }
        try {
          racing.prepare(`
            UPDATE result_deliveries SET state='consumed',revision=revision+1
             WHERE result_delivery_id='lifecycle-result-delivery-1'
          `).run();
        } catch (error: unknown) {
          afterPrepareRaceError = error;
        }
        try {
          racing.prepare(`
            DELETE FROM result_deliveries
             WHERE result_delivery_id='lifecycle-result-delivery-1'
          `).run();
        } catch (error: unknown) {
          deliveryDeleteRaceError = error;
        }
      } catch (error: unknown) {
        afterPrepareRaceError ??= error;
      } finally {
        racing.close();
      }
    };

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
    expect(String(ownershipUpdateRaceError)).toContain(
      "INVARIANT_lifecycle_custody_adoption_delivery_owner",
    );
    expect(String(ownershipDeleteRaceError)).toContain(
      "INVARIANT_lifecycle_custody_adoption_delivery_owner",
    );
    expect(String(afterPrepareRaceError)).toContain("INVARIANT_result_delivery_lifecycle_receipt_owner");
    expect(String(deliveryDeleteRaceError)).toContain("INVARIANT_result_delivery_lifecycle_receipt_owner");
    expect(recoveryRaceResult).toMatchObject({ returnedClaims: 0, overdueDeliveries: 0 });
    expect(deadlineRaceResult).toMatchObject({ overdueDeliveries: 0 });
    expect(context.authority.scopeRecords(projectSessionId, context.fixture.runId)).toHaveLength(2);
    const authorityCheckpoint = context.authority.latestScopeCheckpoint(
      projectSessionId,
      context.fixture.runId,
    );
    expect(authorityCheckpoint).toMatchObject({ receiptCount: 2, headAuthoritySequence: 2 });

    const database = new Database(context.fixture.databasePath);
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
      expect(database.prepare(`
        SELECT lease_id,generation,status FROM leases
         WHERE run_id=? AND holder_agent_id=? AND kind='write' ORDER BY lease_id
      `).all(context.fixture.runId, context.agentId)).toEqual([
        { lease_id: "lifecycle-write-lease-a", generation: 3, status: "quarantined" },
        { lease_id: "lifecycle-write-lease-b", generation: 7, status: "quarantined" },
        { lease_id: "lifecycle-write-lease-prequarantined", generation: 9, status: "quarantined" },
      ]);
      expect(database.prepare(`
        SELECT lease_id,lease_generation,source_status,active_owner
          FROM lifecycle_custody_write_leases ORDER BY ordinal
      `).all()).toEqual([
        { lease_id: "lifecycle-write-lease-a", lease_generation: 3, source_status: "active", active_owner: 0 },
        { lease_id: "lifecycle-write-lease-b", lease_generation: 7, source_status: "active", active_owner: 0 },
      ]);
      expect(() => database.prepare(`
        DELETE FROM lifecycle_custody_write_leases
         WHERE lease_id='lifecycle-write-lease-a'
      `).run()).toThrow("INVARIANT_lifecycle_custody_write_lease_owner");
      expect(database.prepare(`
        SELECT quarantined_write_set_digest,adoption_delivery_set_digest
          FROM lifecycle_rotation_custodies
         WHERE run_id=? AND agent_id=?
      `).get(context.fixture.runId, context.agentId)).toEqual({
        quarantined_write_set_digest: `sha256:${createHash("sha256")
          .update(canonicalJson(capturedWriteLeases)).digest("hex")}`,
        adoption_delivery_set_digest: `sha256:${createHash("sha256").update(canonicalJson([
          {
            deliveryId: "lifecycle-result-delivery-1",
            claimGeneration: 3,
            requesterAgentId: context.agentId,
            sourceState: "claimed",
          },
          {
            deliveryId: "lifecycle-result-delivery-2",
            claimGeneration: 3,
            requesterAgentId: context.agentId,
            sourceState: "provider-accepted",
          },
          {
            deliveryId: "lifecycle-result-delivery-4",
            claimGeneration: 3,
            requesterAgentId: context.agentId,
            sourceState: "claimed",
          },
        ])).digest("hex")}`,
      });
      expect(database.prepare(`
        SELECT result_delivery_id,state,claim_generation,target_provider_session,revision
          FROM result_deliveries
         WHERE result_delivery_id LIKE 'lifecycle-result-delivery-%'
         ORDER BY result_delivery_id
      `).all()).toEqual([
        {
          result_delivery_id: "lifecycle-result-delivery-1",
          claim_generation: 3,
          target_provider_session: `fake-session:${context.agentId}:g2:replacement`,
          state: "provider-accepted",
          revision: 3,
        },
        {
          result_delivery_id: "lifecycle-result-delivery-2",
          state: "provider-accepted",
          claim_generation: 3,
          target_provider_session: `fake-session:${context.agentId}:g2:replacement`,
          revision: 2,
        },
        {
          result_delivery_id: "lifecycle-result-delivery-3",
          state: "pending",
          claim_generation: 3,
          target_provider_session: `fake-session:${context.agentId}:g1`,
          revision: 1,
        },
        {
          result_delivery_id: "lifecycle-result-delivery-4",
          state: "claimed",
          claim_generation: 3,
          target_provider_session: `fake-session:${context.agentId}:g2:replacement`,
          revision: 2,
        },
      ]);
      expect(database.prepare(`
        SELECT delivery_id,delivery_generation,source_state,active_owner
          FROM lifecycle_custody_adoption_deliveries ORDER BY ordinal
      `).all()).toEqual([
        { delivery_id: "lifecycle-result-delivery-1", delivery_generation: 3, source_state: "claimed", active_owner: 0 },
        { delivery_id: "lifecycle-result-delivery-2", delivery_generation: 3, source_state: "provider-accepted", active_owner: 0 },
        { delivery_id: "lifecycle-result-delivery-4", delivery_generation: 3, source_state: "claimed", active_owner: 0 },
      ]);
      const apply = database.prepare(`
        SELECT apply_id,receipt_batch_id,verified_scope_checkpoint_digest,local_write_set_digest
          FROM lifecycle_transition_applies
      `).get() as {
        apply_id: string;
        receipt_batch_id: string;
        verified_scope_checkpoint_digest: string;
        local_write_set_digest: string;
      };
      const custody = database.prepare(`
        SELECT custody_id,current_revision FROM lifecycle_rotation_custody_heads
         WHERE run_id=? AND agent_id=?
      `).get(context.fixture.runId, context.agentId) as { custody_id: string; current_revision: number };
      expect(apply).toMatchObject({
        local_write_set_digest: lifecycleDigest("local-write-set", {
          schemaVersion: 1,
          writes: [
            { relation: "agent-bridge", key: `${context.fixture.runId}:${context.agentId}`, operation: "update" },
            { relation: "agent-state", key: `${context.fixture.runId}:${context.agentId}`, operation: "update" },
            { relation: "principal-capability", key: database.prepare(`
              SELECT source_capability_hash FROM lifecycle_rotation_custodies
               WHERE run_id=? AND agent_id=?
            `).pluck().get(context.fixture.runId, context.agentId) as string, operation: "update" },
            { relation: "freeze-owner", key: `${context.fixture.runId}:${context.agentId}`, operation: "delete" },
            { relation: "audit", key: `${context.fixture.runId}:lifecycle:authority-worker:adopt`, operation: "insert" },
            { relation: "provider-session", key: `${context.fixture.runId}:${context.agentId}`, operation: "update" },
            { relation: "delivery", key: "lifecycle-result-delivery-1", operation: "update" },
            { relation: "delivery", key: "lifecycle-result-delivery-2", operation: "update" },
            { relation: "delivery", key: "lifecycle-result-delivery-4", operation: "update" },
            { relation: "lifecycle_custody_adoption_deliveries", key: `${context.fixture.runId}:${context.agentId}:${custody.custody_id}:lifecycle-result-delivery-1:3`, operation: "update" },
            { relation: "lifecycle_custody_adoption_deliveries", key: `${context.fixture.runId}:${context.agentId}:${custody.custody_id}:lifecycle-result-delivery-2:3`, operation: "update" },
            { relation: "lifecycle_custody_adoption_deliveries", key: `${context.fixture.runId}:${context.agentId}:${custody.custody_id}:lifecycle-result-delivery-4:3`, operation: "update" },
            { relation: "lifecycle_custody_write_leases", key: `${context.fixture.runId}:${context.agentId}:${custody.custody_id}:lifecycle-write-lease-a:3`, operation: "update" },
            { relation: "lifecycle_custody_write_leases", key: `${context.fixture.runId}:${context.agentId}:${custody.custody_id}:lifecycle-write-lease-b:7`, operation: "update" },
            { relation: "lifecycle_authority_receipts", key: `${apply.receipt_batch_id}:1`, operation: "insert" },
            { relation: "lifecycle_receipt_scope_checkpoints", key: `${projectSessionId}:${context.fixture.runId}:${apply.verified_scope_checkpoint_digest}`, operation: "insert" },
            { relation: "lifecycle_receipt_scope_heads", key: `${projectSessionId}:${context.fixture.runId}`, operation: "update" },
            { relation: "lifecycle_receipt_batch_completions", key: apply.receipt_batch_id, operation: "insert" },
            { relation: "lifecycle_receipt_batch_authorizations", key: apply.receipt_batch_id, operation: "insert" },
            { relation: "lifecycle_rotation_custody_revisions", key: `${context.fixture.runId}:${context.agentId}:${custody.custody_id}:${custody.current_revision}`, operation: "insert" },
            { relation: "lifecycle_rotation_custody_heads", key: `${context.fixture.runId}:${context.agentId}:${custody.custody_id}`, operation: "update" },
            { relation: "lifecycle_transition_applies", key: apply.apply_id, operation: "insert" },
          ].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
        }),
      });
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

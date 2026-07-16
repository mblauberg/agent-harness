import type { AgentLifecycleRecoveryIntentV1 } from "@local/agent-fabric-protocol";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  GenerationLossRepository,
  type GenerationLossSource,
  type RecordGenerationLossObservationInput,
} from "../../../src/lifecycle/generation-loss-repository.ts";
import { LifecycleReceiptRepository } from "../../../src/lifecycle/receipt-repository.ts";
import { LifecycleRotationRepository } from "../../../src/lifecycle/rotation-repository.ts";
import { LifecycleRecoveryCustodyService } from "../../../src/operator/lifecycle-recovery-custody.ts";
import { ProjectFabricCoreError } from "../../../src/project-session/contracts.ts";
import { admitProviderActionFixture } from "../../support/provider-action-fixture.ts";
import { TestLifecycleReceiptAuthority } from "../../support/lifecycle-receipt-authority-fake.ts";
import { createStage1Fixture } from "../../support/stage1-fixture.ts";

const CONFIRMATION_PHRASE =
  "I confirm abandoning this generation loss and accept the permanent loss of its unreconciled context.";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function lifecycleDigest(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(`agent-fabric.lifecycle.v1\0${domain}\0`)
    .update(canonical(value))
    .digest("hex")}`;
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function seedLifecycleScope(database: Database.Database, input: Readonly<{
  projectId: string;
  projectSessionId: string;
  runId: string;
  authorityId: string;
}>): Readonly<{ checkpointDigest: string }> {
  const scope = { schemaVersion: 1, ...input };
  const admissionDigest = lifecycleDigest("admission", scope);
  const scopeDigest = lifecycleDigest("admitted-scope", scope);
  const requestId = lifecycleDigest("scope-admission-outbox", scope);
  const orderedRecordSetDigest = lifecycleDigest("scope-record-set", []);
  const checkpointBody = {
    schemaVersion: 1,
    authorityId: input.authorityId,
    projectSessionId: input.projectSessionId,
    runId: input.runId,
    receiptCountDec: "0",
    headAuthoritySequenceDec: "0",
    headReceiptDigest: null,
    orderedRecordSetDigest,
  };
  const checkpointDigest = lifecycleDigest("scope-checkpoint", checkpointBody);
  const namespaceMember = {
    projectSessionId: input.projectSessionId,
    runId: input.runId,
    authorityId: input.authorityId,
    scopeCheckpointDigest: checkpointDigest,
    receiptCountDec: "0",
    headReceiptDigest: null,
  };
  const orderedScopeHeadSetDigest = lifecycleDigest("namespace-scope-head-set", [namespaceMember]);
  const namespaceBody = {
    schemaVersion: 1,
    authorityId: input.authorityId,
    projectId: input.projectId,
    scopeCountDec: "1",
    orderedScopeHeadSetDigest,
  };
  const namespaceDigest = lifecycleDigest("namespace-checkpoint", namespaceBody);
  const resolutionBody = {
    schemaVersion: 1,
    admissionRequestId: requestId,
    scopeDigest,
    initialScopeCheckpointDigest: checkpointDigest,
    namespaceCheckpointDigest: namespaceDigest,
  };
  const resolutionDigest = lifecycleDigest("scope-admission-resolution", resolutionBody);
  database.transaction(() => {
    database.prepare("INSERT INTO lifecycle_receipt_projects VALUES (?,?,?)")
      .run(input.projectId, input.authorityId, 1);
    database.prepare("INSERT INTO lifecycle_scope_admission_outbox VALUES (?,?,?,?,?,?,?,?,?,?)").run(
      requestId, input.projectId, input.projectSessionId, input.runId, input.authorityId,
      admissionDigest, 1, canonical(scope), scopeDigest, 1,
    );
    database.prepare("INSERT INTO lifecycle_admitted_run_scopes VALUES (?,?,?,?,?,?,?,?,?,?)").run(
      input.projectId, input.projectSessionId, input.runId, input.authorityId,
      admissionDigest, 1, requestId, scopeDigest, checkpointDigest, resolutionDigest,
    );
    database.prepare("INSERT INTO lifecycle_receipt_scope_checkpoints VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
      input.projectSessionId, input.runId, input.authorityId, 0, 0, null,
      orderedRecordSetDigest, canonical(checkpointBody), checkpointDigest, "scope-attestation-0", 1,
    );
    database.prepare("INSERT INTO lifecycle_receipt_scope_heads VALUES (?,?,?,1)").run(
      input.projectSessionId, input.runId, checkpointDigest,
    );
    database.prepare("INSERT INTO lifecycle_receipt_namespace_checkpoints VALUES (?,?,?,?,?,?,?,?)").run(
      input.projectId, input.authorityId, 1, orderedScopeHeadSetDigest,
      canonical(namespaceBody), namespaceDigest, "namespace-attestation-0", 1,
    );
    database.prepare("INSERT INTO lifecycle_receipt_namespace_members VALUES (?,?,?,?,?,?,?,?,?)").run(
      input.projectId, namespaceDigest, 1, input.projectSessionId, input.runId,
      input.authorityId, checkpointDigest, 0, null,
    );
    database.prepare("INSERT INTO lifecycle_receipt_namespace_heads VALUES (?,?,?,?,?,1)").run(
      input.projectId, input.authorityId, 1, orderedScopeHeadSetDigest, namespaceDigest,
    );
    database.prepare("INSERT INTO lifecycle_scope_admission_resolutions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      requestId, input.projectId, input.projectSessionId, input.runId, input.authorityId,
      admissionDigest, 1, scopeDigest, 0, 0, orderedRecordSetDigest,
      canonical(checkpointBody), checkpointDigest, 1, namespaceDigest,
      canonical(namespaceMember), 1, canonical(resolutionBody), resolutionDigest,
    );
  }).immediate();
  return { checkpointDigest };
}

type AbandonFixture = Readonly<{
  database: Database.Database;
  projectId: string;
  projectSessionId: string;
  principalGeneration: number;
  generationLossId: string;
  lossEvidenceDigest: string;
  directory: string;
  databasePath: string;
}>;

const OPERATOR_ID = "operator-lifecycle-abandon";
const GATE_ID = "gate-lifecycle-abandon";
const GATE_REVISION = 3;
const ATTESTATION_ID = "attestation-lifecycle-abandon";

async function createAbandonFixture(): Promise<AbandonFixture> {
  const stage1 = await createStage1Fixture();
  await stage1.fabric.close();
  const database = new Database(stage1.databasePath);
  database.pragma("foreign_keys = ON");
  const identity = database.prepare(`
    SELECT run.project_session_id,session.project_id,capability.principal_generation
      FROM runs run
      JOIN project_sessions session ON session.project_session_id=run.project_session_id
      JOIN capabilities capability
        ON capability.run_id=run.run_id AND capability.agent_id=run.chair_agent_id
     WHERE run.run_id='run-stage1' AND capability.revoked_at IS NULL
     ORDER BY capability.principal_generation DESC LIMIT 1
  `).get() as { project_session_id: string; project_id: string; principal_generation: number };
  const projectSessionId = identity.project_session_id;
  const principalGeneration = identity.principal_generation;
  const capabilityHash = digest("abandon-source-capability");
  database.prepare(`
    INSERT INTO provider_state(
      run_id,agent_id,provider_session_generation,context_revision,
      reconciled_checkpoint_sha256
    ) VALUES ('run-stage1','chair',2,'5',NULL)
  `).run();
  database.prepare(`
    UPDATE agents SET provider_session_ref='provider-session:g2'
     WHERE run_id='run-stage1' AND agent_id='chair'
  `).run();
  database.prepare(`
    UPDATE capabilities SET token_hash=?,expires_at=999999
     WHERE run_id='run-stage1' AND agent_id='chair' AND principal_generation=?
  `).run(capabilityHash, principalGeneration);
  admitProviderActionFixture(database, {
    runId: "run-stage1",
    adapterId: "fake-primary",
    actionId: "abandon-source-action",
    operation: "launch_chair",
    targetAgentId: "chair",
    providerSessionGeneration: 2,
    identityHash: digest("abandon-source-identity"),
    payloadHash: digest("abandon-source-payload"),
    payloadJson: "{}",
    status: "terminal",
    historyJson: '["prepared","terminal"]',
    executionCount: 1,
    effectCount: 1,
    idempotencyProven: true,
    resultJson: "{}",
    updatedAt: 1,
  });
  database.prepare(`
    INSERT INTO launched_chair_bridge_state(
      project_session_id,coordination_run_id,chair_agent_id,provider_adapter_id,
      provider_action_id,provider_contract_digest,provider_session_ref,
      provider_session_generation,principal_generation,bridge_generation,
      capability_hash,activation_evidence_digest,state,revision,created_at,updated_at
    ) VALUES (?,'run-stage1','chair','fake-primary','abandon-source-action',?,
              'provider-session:g2',2,?,4,?,?,'active',6,1,1)
  `).run(
    projectSessionId,
    digest("abandon-source-contract"),
    principalGeneration,
    capabilityHash,
    digest("abandon-activation-evidence"),
  );
  const source: GenerationLossSource = {
    oldProviderSessionRef: "provider-session:g2",
    newProviderSessionRef: "provider-session:observed",
    sourceActionRef: { adapterId: "fake-primary", actionId: "abandon-source-action" },
    sourceAdapterContractDigest: digest("abandon-source-contract"),
    sourcePrincipalGeneration: principalGeneration,
    sourceBridgeGeneration: 4,
    bridgeOwnerKind: "chair",
    sourceBridgeRowId: "run-stage1:chair",
    sourceBridgeRevision: 6,
    sourceCapabilityHash: capabilityHash,
    sourceProjectSessionGeneration: 1,
    sourceRunGeneration: 1,
    sourceChairLeaseGeneration: 1,
    checkpoint: { state: "absent", ref: null, digest: null },
  };
  const observationInput: RecordGenerationLossObservationInput = {
    sourceEventId: "abandon-event-01",
    projectSessionId,
    runId: "run-stage1",
    agentId: "chair",
    providerGeneration: 3,
    contextRevision: 9,
    evidenceDigest: digest("abandon-event-01"),
    observedAt: 20,
    lossSource: source,
  };
  const observed = database.transaction(() =>
    new GenerationLossRepository(database).recordObservationInCurrentTransaction(observationInput)).immediate();
  const generationLossId = observed.generationLossId;
  if (generationLossId === null) throw new Error("abandon fixture did not open a generation loss");
  const now = 21;
  database.transaction(() => {
    database.prepare(`
      INSERT INTO scoped_gates(
        gate_id,project_session_id,coordination_run_id,dedupe_key,scope_kind,
        scope_task_id,dependency_revision,blocked_operation_ids_json,
        enforcement_points_json,question,reason,options_json,recommendation,
        consequences_json,evidence_refs_json,created_by_ref,expected_approver_ref,
        resolved_by_operator_id,resolution_json,deadline,default_action,status,
        human_required,release_binding_json,revision,created_at,updated_at
      ) VALUES (?,?,'run-stage1','abandon-gate','run',NULL,1,'[]','[]',
                'Abandon this generation loss?','Provider context is unrecoverable.',
                '[]','abandon','[]','[]','agent:chair','authenticated-human-operator',
                ?,NULL,NULL,NULL,'approved',1,NULL,?,?,?)
    `).run(GATE_ID, projectSessionId, OPERATOR_ID, GATE_REVISION, now, now);
    database.prepare(`
      INSERT INTO operator_principals(
        operator_id,project_id,project_session_id,authenticated_subject_hash,
        project_authority_generation,principal_generation,state,created_at,updated_at
      ) VALUES (?,?,?,?,1,1,'active',?,?)
    `).run(OPERATOR_ID, identity.project_id, projectSessionId, digest("abandon-operator-subject"), now, now);
    database.prepare(`
      INSERT INTO operator_input_attestations(
        attestation_id,integration_id,integration_generation,operator_id,project_id,
        project_session_id,coordination_run_id,gate_id,provider_message_id,
        exact_utterance,provider_event_json,expected_gate_revision,
        artifact_digests_json,interpreted_decision,recorded_at
      ) VALUES (?,'console-direct-input',1,?,?,?,'run-stage1',?,'message-abandon-01',
                ?,'{}',?,?,'abandon',?)
    `).run(
      ATTESTATION_ID, OPERATOR_ID, identity.project_id, projectSessionId, GATE_ID,
      CONFIRMATION_PHRASE, GATE_REVISION,
      JSON.stringify([digest("abandon-event-01")]), now,
    );
  }).immediate();
  return {
    database,
    projectId: identity.project_id,
    projectSessionId,
    principalGeneration,
    generationLossId,
    lossEvidenceDigest: digest("abandon-event-01"),
    directory: stage1.directory,
    databasePath: stage1.databasePath,
  };
}

function abandonIntent(
  fixture: Pick<AbandonFixture, "database" | "projectSessionId" | "principalGeneration" | "generationLossId" | "lossEvidenceDigest">,
  delta: Partial<AgentLifecycleRecoveryIntentV1> = {},
): Extract<AgentLifecycleRecoveryIntentV1, { path: "abandon" }> {
  const session = fixture.database.prepare(`
    SELECT revision,generation FROM project_sessions WHERE project_session_id=?
  `).get(fixture.projectSessionId) as { revision: number; generation: number };
  const run = fixture.database.prepare(`
    SELECT revision,chair_generation FROM runs WHERE run_id='run-stage1'
  `).get() as { revision: number; chair_generation: number };
  return {
    kind: "agent-lifecycle-recovery",
    schemaVersion: 1,
    path: "abandon",
    projectSessionId: fixture.projectSessionId,
    coordinationRunId: "run-stage1",
    agentId: "chair",
    source: {
      kind: "generation-loss",
      oldCustodyRef: null,
      generationLossRef: {
        schemaVersion: 1,
        runId: "run-stage1",
        agentId: "chair",
        generationLossId: fixture.generationLossId,
        generationLossRevision: 1,
      },
      lossKind: "generation-advance",
      oldProviderSessionRef: "provider-session:g2",
      newProviderSessionRef: "provider-session:observed",
      oldProviderGeneration: 2,
      newProviderGeneration: 3,
      oldContextRevision: 5,
      newContextRevision: 9,
      sourceBridgeRef: { bridgeId: "run-stage1:chair", bridgeRevision: 6 },
      sourceCapabilityHash: digest("abandon-source-capability"),
      checkpointState: "absent",
      checkpointRef: null,
      checkpointDigest: null,
      lossEvidenceDigest: fixture.lossEvidenceDigest,
    },
    expectedSessionRevision: session.revision,
    expectedSessionGeneration: session.generation,
    expectedRunRevision: run.revision,
    expectedAgentRevision: 6,
    expectedSourceRevision: 1,
    expectedPrincipalGeneration: fixture.principalGeneration,
    expectedProviderGeneration: 3,
    expectedBridgeGeneration: 4,
    expectedContextRevision: 9,
    bridgeOwnerKind: "chair",
    expectedChairLeaseGeneration: run.chair_generation,
    gateId: GATE_ID,
    expectedGateRevision: GATE_REVISION,
    expectedGateStatus: "approved",
    reason: "Provider context is unrecoverable; the user directed abandonment.",
    directInputAttestationId: ATTESTATION_ID,
    destructiveConfirmationDigest: digest(CONFIRMATION_PHRASE),
    ...delta,
  } as Extract<AgentLifecycleRecoveryIntentV1, { path: "abandon" }>;
}

function createService(
  database: Database.Database,
  authority: TestLifecycleReceiptAuthority,
): Readonly<{ service: LifecycleRecoveryCustodyService; receipts: LifecycleReceiptRepository }> {
  const receipts = new LifecycleReceiptRepository(database, new LifecycleRotationRepository(database));
  return {
    service: new LifecycleRecoveryCustodyService({
      database,
      receipts,
      authority,
      clock: () => 33,
    }),
    receipts,
  };
}

async function admitAuthority(
  fixture: AbandonFixture,
  authority: TestLifecycleReceiptAuthority,
): Promise<void> {
  await authority.admitScope({
    schemaVersion: 1,
    projectId: fixture.projectId,
    projectSessionId: fixture.projectSessionId,
    runId: "run-stage1",
    authorityId: authority.authorityId,
    admissionDigest: digest("abandon-authority-admission") as `sha256:${string}`,
    admittedAt: 1,
  });
  seedLifecycleScope(fixture.database, {
    projectId: fixture.projectId,
    projectSessionId: fixture.projectSessionId,
    runId: "run-stage1",
    authorityId: authority.authorityId,
  });
}

function receiptCounts(database: Database.Database, generationLossId: string): unknown {
  return database.prepare(`
    SELECT
      (SELECT count(*) FROM lifecycle_receipt_batches) AS batches,
      (SELECT count(*) FROM lifecycle_receipt_generation_loss_effects) AS effects,
      (SELECT count(*) FROM lifecycle_authority_receipts) AS receipts,
      (SELECT count(*) FROM lifecycle_transition_applies) AS applies,
      (SELECT count(*) FROM agent_lifecycle_recovery_custody) AS custody,
      (SELECT count(*) FROM lifecycle_generation_loss_revisions
        WHERE generation_loss_id=?) AS revisions
  `).get(generationLossId);
}

async function closeAbandonFixture(fixture: AbandonFixture): Promise<void> {
  if (fixture.database.open) fixture.database.close();
  await rm(fixture.directory, { recursive: true, force: true });
}

describe("direct-open generation-loss abandon custody", () => {
  it("abandons an exact open head once through operator custody, surviving response loss and restart", async () => {
    const fixture = await createAbandonFixture();
    try {
      const authority = new TestLifecycleReceiptAuthority("abandon-authority");
      await admitAuthority(fixture, authority);
      const { service } = createService(fixture.database, authority);
      const intent = abandonIntent(fixture);

      const state = await service.readLifecycleRecoveryCurrentState(intent);
      expect(canonical(state.source)).toBe(canonical(intent.source));
      expect(state).toMatchObject({
        revision: intent.expectedAgentRevision,
        sourceRevision: 1,
        providerGeneration: 3,
        contextRevision: 9,
        bridgeOwnerKind: "chair",
        gate: { gateId: GATE_ID, revision: GATE_REVISION, status: "approved" },
        recoveryCapability: null,
        checkpoint: null,
      });

      const inspection = await service.inspectLifecycleRecovery(intent);
      const prepared = fixture.database.transaction(() =>
        service.prepareLifecycleAbandonInTransaction({
          inspection,
          operatorId: OPERATOR_ID,
          operatorCommandId: "command-abandon-01",
        })).immediate();
      expect(prepared).toMatchObject({ status: "pending", path: "abandon" });
      expect(new GenerationLossRepository(fixture.database)
        .readHead("run-stage1", "chair", fixture.generationLossId))
        .toMatchObject({ revision: 1, state: "open", terminal: false });
      expect(service.lifecycleRecoveryStatus(OPERATOR_ID, "command-abandon-01"))
        .toMatchObject({ status: "pending", recoveryId: prepared.recoveryId });

      authority.appendSuccessThenThrowOnce = true;
      const committed = await service.reconcileLifecycleRecovery(OPERATOR_ID, "command-abandon-01");
      expect(committed).toEqual({
        status: "committed",
        recoveryId: prepared.recoveryId,
        path: "abandon",
        evidenceDigest: prepared.evidenceDigest,
      });
      expect(authority).toMatchObject({ appendCalls: 1, appendThrowCount: 1 });
      expect(new GenerationLossRepository(fixture.database)
        .readHead("run-stage1", "chair", fixture.generationLossId))
        .toMatchObject({ revision: 2, state: "abandoned", abandonKind: "direct-open", terminal: true });
      const finalRevision = fixture.database.prepare(`
        SELECT receipt_apply_id,terminal_evidence_digest
          FROM lifecycle_generation_loss_revisions
         WHERE run_id='run-stage1' AND agent_id='chair' AND generation_loss_id=? AND revision=2
      `).get(fixture.generationLossId) as { receipt_apply_id: string; terminal_evidence_digest: string };
      expect(finalRevision.receipt_apply_id).toBe(prepared.recoveryId);
      expect(finalRevision.terminal_evidence_digest).toBe(prepared.evidenceDigest);
      const subject = fixture.database.prepare(`
        SELECT subject_json FROM lifecycle_receipt_intents
      `).get() as { subject_json: string };
      expect(JSON.parse(subject.subject_json)).toMatchObject({
        kind: "generation-loss-terminal",
        agentId: "chair",
        fromState: "open",
        terminalState: "abandoned",
        abandonKind: "direct-open",
        recoveryActionRef: null,
      });
      expect(receiptCounts(fixture.database, fixture.generationLossId))
        .toEqual({ batches: 1, effects: 1, receipts: 1, applies: 1, custody: 1, revisions: 2 });

      const replayed = await service.reconcileLifecycleRecovery(OPERATOR_ID, "command-abandon-01");
      expect(replayed).toEqual(committed);
      expect(authority.appendCalls).toBe(1);

      fixture.database.close();
      const restarted = new Database(fixture.databasePath);
      restarted.pragma("foreign_keys = ON");
      try {
        const after = createService(restarted, authority);
        expect(after.service.lifecycleRecoveryStatus(OPERATOR_ID, "command-abandon-01")).toEqual(committed);
        expect(await after.service.reconcileLifecycleRecovery(OPERATOR_ID, "command-abandon-01"))
          .toEqual(committed);
        expect(authority.appendCalls).toBe(1);
        expect(receiptCounts(restarted, fixture.generationLossId))
          .toEqual({ batches: 1, effects: 1, receipts: 1, applies: 1, custody: 1, revisions: 2 });
      } finally {
        restarted.close();
      }
    } finally {
      await closeAbandonFixture(fixture);
    }
  });

  it("recovers a prepared abandon across restart and reconciles ambiguity without replaying the effect", async () => {
    const fixture = await createAbandonFixture();
    try {
      const authority = new TestLifecycleReceiptAuthority("abandon-ambiguity-authority");
      await admitAuthority(fixture, authority);
      const first = createService(fixture.database, authority);
      const inspection = await first.service.inspectLifecycleRecovery(abandonIntent(fixture));
      const prepared = fixture.database.transaction(() =>
        first.service.prepareLifecycleAbandonInTransaction({
          inspection,
          operatorId: OPERATOR_ID,
          operatorCommandId: "command-abandon-02",
        })).immediate();

      authority.readReceiptAlwaysAbsent = true;
      const ambiguous = await first.service.reconcileLifecycleRecovery(OPERATOR_ID, "command-abandon-02");
      expect(ambiguous).toMatchObject({ status: "ambiguous", recoveryId: prepared.recoveryId });
      expect(authority.appendCalls).toBe(1);
      expect(new GenerationLossRepository(fixture.database)
        .readHead("run-stage1", "chair", fixture.generationLossId))
        .toMatchObject({ revision: 1, state: "open", terminal: false });
      expect(first.service.lifecycleRecoveryStatus(OPERATOR_ID, "command-abandon-02"))
        .toMatchObject({ status: "ambiguous" });

      fixture.database.close();
      const restarted = new Database(fixture.databasePath);
      restarted.pragma("foreign_keys = ON");
      try {
        authority.readReceiptAlwaysAbsent = false;
        const after = createService(restarted, authority);
        const committed = await after.service.reconcileLifecycleRecovery(OPERATOR_ID, "command-abandon-02");
        expect(committed).toMatchObject({
          status: "committed",
          recoveryId: prepared.recoveryId,
          evidenceDigest: prepared.evidenceDigest,
        });
        expect(authority.appendCalls).toBe(1);
        expect(new GenerationLossRepository(restarted)
          .readHead("run-stage1", "chair", fixture.generationLossId))
          .toMatchObject({ revision: 2, state: "abandoned", abandonKind: "direct-open", terminal: true });
        expect(receiptCounts(restarted, fixture.generationLossId))
          .toEqual({ batches: 1, effects: 1, receipts: 1, applies: 1, custody: 1, revisions: 2 });
      } finally {
        restarted.close();
      }
    } finally {
      await closeAbandonFixture(fixture);
    }
  });

  it("surfaces crossed authority evidence instead of absorbing it as retriable ambiguity", async () => {
    const fixture = await createAbandonFixture();
    try {
      class CrossedAuthority extends TestLifecycleReceiptAuthority {
        override async verifyReceipt(): Promise<boolean> {
          return await Promise.resolve(false);
        }
      }
      const authority = new CrossedAuthority("abandon-crossed-authority");
      await admitAuthority(fixture, authority);
      const { service } = createService(fixture.database, authority);
      const inspection = await service.inspectLifecycleRecovery(abandonIntent(fixture));
      fixture.database.transaction(() =>
        service.prepareLifecycleAbandonInTransaction({
          inspection,
          operatorId: OPERATOR_ID,
          operatorCommandId: "command-abandon-crossed",
        })).immediate();

      await expect(service.reconcileLifecycleRecovery(OPERATOR_ID, "command-abandon-crossed"))
        .rejects.toThrow("lifecycle receipt authority returned crossed evidence");
      expect(service.lifecycleRecoveryStatus(OPERATOR_ID, "command-abandon-crossed"))
        .toMatchObject({ status: "pending" });
      expect(new GenerationLossRepository(fixture.database)
        .readHead("run-stage1", "chair", fixture.generationLossId))
        .toMatchObject({ revision: 1, state: "open", terminal: false });
    } finally {
      await closeAbandonFixture(fixture);
    }
  });

  it("rejects stale source revision and crossed identity before any receipt mutation", async () => {
    const fixture = await createAbandonFixture();
    try {
      const authority = new TestLifecycleReceiptAuthority("abandon-stale-authority");
      await admitAuthority(fixture, authority);
      const { service } = createService(fixture.database, authority);

      const stale = abandonIntent(fixture, { expectedSourceRevision: 2 });
      const staleInspection = await service.inspectLifecycleRecovery(stale);
      expect(() => fixture.database.transaction(() =>
        service.prepareLifecycleAbandonInTransaction({
          inspection: staleInspection,
          operatorId: OPERATOR_ID,
          operatorCommandId: "command-abandon-stale",
        })).immediate()).toThrow("generation-loss is not the expected terminal source head");

      const base = abandonIntent(fixture);
      if (base.source.kind !== "generation-loss") throw new Error("abandon intent lost its source arm");
      const crossedAgent = abandonIntent(fixture, {
        agentId: "crossed-agent",
        source: {
          ...base.source,
          generationLossRef: { ...base.source.generationLossRef, agentId: "crossed-agent" },
        },
      });
      await expect(service.inspectLifecycleRecovery(crossedAgent))
        .rejects.toThrow("lifecycle recovery generation loss was not found");

      const crossedSession = abandonIntent(fixture, { projectSessionId: "crossed-session" });
      await expect(service.inspectLifecycleRecovery(crossedSession))
        .rejects.toMatchObject({ code: "WRONG_PROJECT" });

      expect(receiptCounts(fixture.database, fixture.generationLossId))
        .toEqual({ batches: 0, effects: 0, receipts: 0, applies: 0, custody: 0, revisions: 1 });
    } finally {
      await closeAbandonFixture(fixture);
    }
  });

  it("rejects an invalid, retargeted or foreign attestation without preparing custody", async () => {
    const fixture = await createAbandonFixture();
    try {
      const authority = new TestLifecycleReceiptAuthority("abandon-attestation-authority");
      await admitAuthority(fixture, authority);
      const { service } = createService(fixture.database, authority);
      const prepareWith = async (
        intent: AgentLifecycleRecoveryIntentV1,
        operatorId: string,
        commandId: string,
      ): Promise<void> => {
        const inspection = await service.inspectLifecycleRecovery(intent);
        fixture.database.transaction(() =>
          service.prepareLifecycleAbandonInTransaction({
            inspection,
            operatorId,
            operatorCommandId: commandId,
          })).immediate();
      };

      await expect(prepareWith(
        abandonIntent(fixture, { destructiveConfirmationDigest: digest("another phrase entirely") }),
        OPERATOR_ID,
        "command-attest-phrase",
      )).rejects.toMatchObject({
        code: "GATE_BLOCKED",
        message: expect.stringContaining("byte-exact phrase") as string,
      });

      await expect(prepareWith(
        abandonIntent(fixture, { directInputAttestationId: "attestation-unknown" }),
        OPERATOR_ID,
        "command-attest-unknown",
      )).rejects.toMatchObject({ code: "GATE_BLOCKED" });

      fixture.database.prepare(`
        INSERT INTO operator_principals(
          operator_id,project_id,project_session_id,authenticated_subject_hash,
          project_authority_generation,principal_generation,state,created_at,updated_at
        ) VALUES ('operator-foreign',?,?,?,1,1,'active',22,22)
      `).run(fixture.projectId, fixture.projectSessionId, digest("foreign-operator-subject"));
      await expect(prepareWith(
        abandonIntent(fixture),
        "operator-foreign",
        "command-attest-foreign",
      )).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });

      fixture.database.prepare(`
        UPDATE operator_input_attestations SET artifact_digests_json=? WHERE attestation_id=?
      `).run(JSON.stringify([digest("unrelated-artifact")]), ATTESTATION_ID);
      await expect(prepareWith(
        abandonIntent(fixture),
        OPERATOR_ID,
        "command-attest-unbound",
      )).rejects.toMatchObject({
        code: "GATE_BLOCKED",
        message: expect.stringContaining("generation-loss evidence") as string,
      });

      fixture.database.prepare(`
        UPDATE scoped_gates SET status='pending' WHERE gate_id=?
      `).run(GATE_ID);
      await expect(service.readLifecycleRecoveryCurrentState(abandonIntent(fixture)))
        .rejects.toMatchObject({ code: "GATE_BLOCKED" });

      expect(receiptCounts(fixture.database, fixture.generationLossId))
        .toEqual({ batches: 0, effects: 0, receipts: 0, applies: 0, custody: 0, revisions: 1 });
    } finally {
      await closeAbandonFixture(fixture);
    }
  });

  it("keeps fresh-rotate custody closed as a deferred slice", async () => {
    const fixture = await createAbandonFixture();
    try {
      const authority = new TestLifecycleReceiptAuthority("abandon-deferred-authority");
      const { service } = createService(fixture.database, authority);
      expect(() => service.prepareLifecycleFreshRotateInTransaction()).toThrow(ProjectFabricCoreError);
    } finally {
      await closeAbandonFixture(fixture);
    }
  });
});

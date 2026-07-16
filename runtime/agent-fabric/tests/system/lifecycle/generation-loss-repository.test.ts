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
import { recoverTerminalAuthorityReceipt } from "../../../src/lifecycle/terminal-receipt-authority.ts";
import { admitProviderActionFixture } from "../../support/provider-action-fixture.ts";
import { TestLifecycleReceiptAuthority } from "../../support/lifecycle-receipt-authority-fake.ts";
import { createStage1Fixture } from "../../support/stage1-fixture.ts";

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

type RepositoryFixture = Readonly<{
  database: Database.Database;
  repository: GenerationLossRepository;
  projectSessionId: string;
  principalGeneration: number;
  source: GenerationLossSource;
  directory: string;
  databasePath: string;
}>;

async function createRepositoryFixture(): Promise<RepositoryFixture> {
  const stage1 = await createStage1Fixture();
  await stage1.fabric.close();
  const database = new Database(stage1.databasePath);
  database.pragma("foreign_keys = ON");
  const identity = database.prepare(`
    SELECT run.project_session_id,capability.principal_generation
      FROM runs run
      JOIN capabilities capability
        ON capability.run_id=run.run_id AND capability.agent_id=run.chair_agent_id
     WHERE run.run_id='run-stage1' AND capability.revoked_at IS NULL
     ORDER BY capability.principal_generation DESC LIMIT 1
  `).get() as { project_session_id: string; principal_generation: number };
  const projectSessionId = identity.project_session_id;
  const principalGeneration = identity.principal_generation;
  const capabilityHash = digest("generation-loss-source-capability");
  database.prepare(`
    INSERT INTO provider_state(
      run_id,agent_id,provider_session_generation,context_revision,
      reconciled_checkpoint_sha256
    ) VALUES ('run-stage1','chair',2,'5',NULL)
  `).run();
  database.prepare(`UPDATE agents SET provider_session_ref='provider-session:g2' WHERE run_id='run-stage1' AND agent_id='chair'`).run();
  database.prepare(`
    UPDATE capabilities SET token_hash=?,expires_at=999999
     WHERE run_id='run-stage1' AND agent_id='chair' AND principal_generation=?
  `).run(capabilityHash, principalGeneration);
  admitProviderActionFixture(database, {
    runId: "run-stage1",
    adapterId: "fake-primary",
    actionId: "generation-loss-source-action",
    operation: "launch_chair",
    targetAgentId: "chair",
    providerSessionGeneration: 2,
    identityHash: digest("source-identity"),
    payloadHash: digest("source-payload"),
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
    ) VALUES (?,'run-stage1','chair','fake-primary','generation-loss-source-action',?,
              'provider-session:g2',2,?,4,?,?,'active',6,1,1)
  `).run(
    projectSessionId,
    digest("generation-loss-source-contract"),
    principalGeneration,
    capabilityHash,
    digest("activation-evidence"),
  );
  return {
    database,
    repository: new GenerationLossRepository(database),
    projectSessionId,
    principalGeneration,
    directory: stage1.directory,
    databasePath: stage1.databasePath,
    source: {
      oldProviderSessionRef: "provider-session:g2",
      newProviderSessionRef: "provider-session:observed",
      sourceActionRef: {
        adapterId: "fake-primary",
        actionId: "generation-loss-source-action",
      },
      sourceAdapterContractDigest: digest("generation-loss-source-contract"),
      sourcePrincipalGeneration: principalGeneration,
      sourceBridgeGeneration: 4,
      bridgeOwnerKind: "chair",
      sourceBridgeRowId: "run-stage1:chair",
      sourceBridgeRevision: 6,
      sourceCapabilityHash: capabilityHash,
      sourceProjectSessionGeneration: 1,
      sourceRunGeneration: 1,
      sourceChairLeaseGeneration: 1,
      checkpoint: {
        state: "last-validated",
        ref: "checkpoint:chair",
        digest: digest("generation-loss-checkpoint"),
      },
    },
  };
}

function observation(
  fixture: RepositoryFixture,
  delta: Partial<RecordGenerationLossObservationInput> = {},
): RecordGenerationLossObservationInput {
  return {
    sourceEventId: "provider-event-01",
    projectSessionId: fixture.projectSessionId,
    runId: "run-stage1",
    agentId: "chair",
    providerGeneration: 3,
    contextRevision: 9,
    evidenceDigest: digest("provider-event-01"),
    observedAt: 20,
    lossSource: fixture.source,
    ...delta,
  };
}

async function closeFixture(fixture: RepositoryFixture): Promise<void> {
  if (fixture.database.open) fixture.database.close();
  await rm(fixture.directory, { recursive: true, force: true });
}

function seedNonterminalCustody(fixture: RepositoryFixture): void {
  fixture.database.transaction(() => new LifecycleRotationRepository(fixture.database).createInCurrentTransaction({
    projectSessionId: fixture.projectSessionId,
    runId: "run-stage1",
    agentId: "chair",
    custodyId: "active-custody",
    commandId: "active-custody-command",
    admissionDigest: digest("active-custody-admission"),
    actionRef: fixture.source.sourceActionRef,
    bridgeOwnerKind: "chair",
    callerTurnLeaseId: "active-custody-turn",
    callerTurnGeneration: 1,
    predecessorTurnSetDigest: digest("active-predecessors"),
    quarantinedWriteSetDigest: digest("active-writes"),
    deliveryCutWatermark: 0,
    adoptionDeliverySetDigest: digest("active-deliveries"),
    checkpointRef: "active-checkpoint.json",
    checkpointDigest: digest("active-checkpoint"),
    taskRevision: 1,
    mailboxRevision: 0,
    childSetDigest: digest("active-children"),
    openWorkSetDigest: digest("active-work"),
    sourceProviderSessionRef: fixture.source.oldProviderSessionRef,
    sourceCapabilityHash: fixture.source.sourceCapabilityHash,
    sourceCustodyActionId: fixture.source.sourceActionRef.actionId,
    sourceAdapterId: fixture.source.sourceActionRef.adapterId,
    sourceAdapterContractDigest: fixture.source.sourceAdapterContractDigest,
    sourceBridgeRowId: fixture.source.sourceBridgeRowId,
    sourceBridgeRevision: fixture.source.sourceBridgeRevision,
    sourceProviderGeneration: 2,
    sourcePrincipalGeneration: fixture.principalGeneration,
    sourceBridgeGeneration: fixture.source.sourceBridgeGeneration,
    sourceProjectSessionGeneration: 1,
    sourceRunGeneration: 1,
    sourceChairLeaseGeneration: 1,
    targetProviderGeneration: 3,
    targetPrincipalGeneration: fixture.principalGeneration + 1,
    targetBridgeGeneration: fixture.source.sourceBridgeGeneration + 1,
    replacementAdapterId: fixture.source.sourceActionRef.adapterId,
    replacementContractDigest: fixture.source.sourceAdapterContractDigest,
    stagedCapabilityHash: digest("active-staged-capability"),
    launchAttestChallengeDigest: digest("active-attestation"),
    preconditionDigest: digest("active-precondition"),
    createdAt: 1,
  })).immediate();
}

describe("generation-loss persistence repository", () => {
  it("rejects crossed generation-loss identity and stale source revision before receipt mutation", async () => {
    const fixture = await createRepositoryFixture();
    try {
      const observed = fixture.database.transaction(() =>
        fixture.repository.recordObservationInCurrentTransaction(observation(fixture)))();
      const generationLossId = observed.generationLossId!;
      const receiptRepository = new LifecycleReceiptRepository(
        fixture.database,
        new LifecycleRotationRepository(fixture.database),
      );
      const base = {
        runId: "run-stage1",
        agentId: "chair",
        generationLossId,
        expectedRevision: 1,
        applyId: "generation-loss-rejected-apply",
        admissionDigest: digest("generation-loss-rejected-admission"),
        operatorDecisionDigest: digest("generation-loss-rejected-decision"),
        transitionProof: { schemaVersion: 1, kind: "direct-open" },
        mutationPlan: {
          schemaVersion: 1,
          writes: [],
          writeSetDigest: lifecycleDigest("mutation-plan", { schemaVersion: 1, writes: [] }),
        },
        terminalEvidenceDigest: digest("generation-loss-rejected-evidence"),
        recordedAt: 21,
      } as const;
      expect(() => fixture.database.transaction(() =>
        receiptRepository.prepareGenerationLossTerminalInCurrentTransaction({
          ...base,
          agentId: "crossed-agent",
        }))()).toThrow("generation-loss head");
      expect(() => fixture.database.transaction(() =>
        receiptRepository.prepareGenerationLossTerminalInCurrentTransaction({
          ...base,
          expectedRevision: 2,
        }))()).toThrow("generation-loss is not the expected terminal source head");
      expect(fixture.database.prepare(`
        SELECT
          (SELECT count(*) FROM lifecycle_receipt_batches) AS batches,
          (SELECT count(*) FROM lifecycle_receipt_generation_loss_effects) AS effects,
          (SELECT count(*) FROM lifecycle_receipt_intents) AS intents,
          (SELECT count(*) FROM lifecycle_generation_loss_revisions
            WHERE generation_loss_id=?) AS revisions
      `).get(generationLossId)).toEqual({ batches: 0, effects: 0, intents: 0, revisions: 1 });
    } finally {
      await closeFixture(fixture);
    }
  });

  it("prepares an exact open generation-loss head for authenticated direct-open abandonment", async () => {
    const fixture = await createRepositoryFixture();
    try {
      const observed = fixture.database.transaction(() =>
        fixture.repository.recordObservationInCurrentTransaction(observation(fixture)))();
      const generationLossId = observed.generationLossId!;
      const receiptRepository = new LifecycleReceiptRepository(
        fixture.database,
        new LifecycleRotationRepository(fixture.database),
      );
      const mutationPlan = {
        schemaVersion: 1,
        writes: [],
        writeSetDigest: lifecycleDigest("mutation-plan", { schemaVersion: 1, writes: [] }),
      };
      const prepared = fixture.database.transaction(() =>
        receiptRepository.prepareGenerationLossTerminalInCurrentTransaction({
          runId: "run-stage1",
          agentId: "chair",
          generationLossId,
          expectedRevision: 1,
          applyId: "generation-loss-direct-open-apply",
          admissionDigest: digest("generation-loss-direct-open-admission"),
          operatorDecisionDigest: digest("generation-loss-direct-open-decision"),
          transitionProof: { schemaVersion: 1, kind: "direct-open" },
          mutationPlan,
          terminalEvidenceDigest: digest("generation-loss-direct-open-evidence"),
          recordedAt: 21,
        }))();

      expect(prepared).toMatchObject({
        generationLossId,
        preRevision: 1,
        finalRevision: 2,
        fromState: "open",
        finalState: "abandoned",
        abandonKind: "direct-open",
        recoveryActionRef: null,
      });
      expect(prepared.subject).toMatchObject({
        kind: "generation-loss-terminal",
        fromState: "open",
        terminalState: "abandoned",
        abandonKind: "direct-open",
        recoveryActionRef: null,
      });
      expect(fixture.database.prepare(`
        SELECT role,batch_transition_kind,generation_loss_id,pre_revision,final_revision,effect_digest
          FROM lifecycle_receipt_generation_loss_effects
      `).get()).toEqual({
        role: "primary",
        batch_transition_kind: "generation-loss-terminal",
        generation_loss_id: generationLossId,
        pre_revision: 1,
        final_revision: 2,
        effect_digest: prepared.effectDigest,
      });
      expect(fixture.repository.readHead("run-stage1", "chair", generationLossId))
        .toMatchObject({ revision: 1, state: "open", abandonKind: "none", terminal: false });
      const recoveredPrepared = new LifecycleReceiptRepository(
        fixture.database,
        new LifecycleRotationRepository(fixture.database),
      ).readPreparedGenerationLossTerminal(
        "run-stage1",
        "chair",
        generationLossId,
        "generation-loss-direct-open-apply",
      );
      expect(recoveredPrepared).toEqual(prepared);

      const project = fixture.database.prepare(`
        SELECT session.project_id FROM runs run
        JOIN project_sessions session ON session.project_session_id=run.project_session_id
        WHERE run.run_id='run-stage1'
      `).get() as { project_id: string };
      const authority = new TestLifecycleReceiptAuthority("generation-loss-test-authority");
      const authorityId = authority.authorityId;
      await authority.admitScope({
        schemaVersion: 1,
        projectId: project.project_id,
        projectSessionId: fixture.projectSessionId,
        runId: "run-stage1",
        authorityId,
        admissionDigest: digest("generation-loss-authority-admission") as `sha256:${string}`,
        admittedAt: 1,
      });
      const initialScope = seedLifecycleScope(fixture.database, {
        projectId: project.project_id,
        projectSessionId: fixture.projectSessionId,
        runId: "run-stage1",
        authorityId,
      });
      authority.appendSuccessThenThrowOnce = true;
      const recoveredAuthority = await recoverTerminalAuthorityReceipt(authority, recoveredPrepared!);
      expect(authority).toMatchObject({ appendCalls: 1, appendThrowCount: 1 });
      const applyWith = (database: Database.Database, repository: LifecycleReceiptRepository) =>
        database.transaction(() => repository.applyAuthorizedGenerationLossTerminalInCurrentTransaction({
          prepared: recoveredPrepared!,
          expectedRevision: 1,
          expectedScopeHead: { checkpointDigest: initialScope.checkpointDigest, revision: 1 },
          receipt: {
            authorityId: recoveredAuthority.record.receipt.authorityId,
            authoritySequence: recoveredAuthority.record.receipt.authoritySequence,
            previousReceiptDigest: recoveredAuthority.record.receipt.previousReceiptDigest,
            receiptDigest: recoveredAuthority.record.receipt.receiptDigest,
            attestation: recoveredAuthority.record.receipt.attestation,
            verifiedAt: 22,
          },
          scopeCheckpoint: {
            receiptCount: recoveredAuthority.checkpoint.receiptCount,
            headAuthoritySequence: recoveredAuthority.checkpoint.headAuthoritySequence,
            headReceiptDigest: recoveredAuthority.checkpoint.headReceiptDigest!,
            orderedRecordSetDigest: recoveredAuthority.checkpoint.orderedRecordSetDigest,
            checkpointDigest: recoveredAuthority.checkpoint.checkpointDigest,
            attestation: recoveredAuthority.checkpoint.attestation,
            verifiedAt: 22,
          },
          authorizedAt: 22,
          appliedAt: 23,
          localWrites: [],
          revalidateAdoptionWrites: () => undefined,
          performAdoptionWrites: () => undefined,
        }))();
      expect(applyWith(fixture.database, receiptRepository)).toMatchObject({
        revision: 2,
        state: "abandoned",
        abandonKind: "direct-open",
        terminal: true,
      });
      expect(fixture.database.prepare(`
        SELECT recovery_action_adapter_id,recovery_action_id,active_recovery_custody_id,
               receipt_batch_id,receipt_apply_id
          FROM lifecycle_generation_loss_revisions
         WHERE run_id='run-stage1' AND agent_id='chair' AND generation_loss_id=? AND revision=2
      `).get(generationLossId)).toEqual({
        recovery_action_adapter_id: null,
        recovery_action_id: null,
        active_recovery_custody_id: null,
        receipt_batch_id: prepared.batchId,
        receipt_apply_id: prepared.applyId,
      });
      fixture.database.close();
      const restartedDatabase = new Database(fixture.databasePath);
      restartedDatabase.pragma("foreign_keys = ON");
      try {
        const restartedReceipts = new LifecycleReceiptRepository(
          restartedDatabase,
          new LifecycleRotationRepository(restartedDatabase),
        );
        const afterRestart = restartedReceipts.readPreparedGenerationLossTerminal(
          "run-stage1",
          "chair",
          generationLossId,
          prepared.applyId,
        );
        expect(afterRestart).toEqual(prepared);
        const recoveredAfterRestart = await recoverTerminalAuthorityReceipt(authority, afterRestart!);
        expect(recoveredAfterRestart.record.receipt.receiptDigest)
          .toBe(recoveredAuthority.record.receipt.receiptDigest);
        expect(authority.appendCalls).toBe(1);
        expect(() => applyWith(restartedDatabase, restartedReceipts))
          .toThrow("generation-loss is not the expected terminal source head");
        expect(restartedDatabase.prepare(`
        SELECT
          (SELECT count(*) FROM lifecycle_authority_receipts) AS receipts,
          (SELECT count(*) FROM lifecycle_receipt_generation_loss_effects) AS effects,
          (SELECT count(*) FROM lifecycle_generation_loss_revisions
            WHERE generation_loss_id=?) AS revisions,
          (SELECT count(*) FROM lifecycle_transition_applies) AS applies
      `).get(generationLossId)).toEqual({ receipts: 1, effects: 1, revisions: 2, applies: 1 });
      } finally {
        restartedDatabase.close();
      }
    } finally {
      await closeFixture(fixture);
    }
  });

  it("classifies a provider-generation advance and durably replays its revision-one loss", async () => {
    const fixture = await createRepositoryFixture();
    try {
      const input = observation(fixture);
      expect(fixture.database.prepare("SELECT count(*) AS count FROM agent_lifecycle_identity_high_water").get())
        .toEqual({ count: 0 });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM agent_lifecycle_context_high_water").get())
        .toEqual({ count: 0 });
      expect(() => fixture.repository.recordObservationInCurrentTransaction(input))
        .toThrow("generation-loss observation requires a transaction");

      const recorded = fixture.database.transaction(() =>
        fixture.repository.recordObservationInCurrentTransaction(input)
      ).immediate();

      expect(recorded).toMatchObject({
        sourceEventId: input.sourceEventId,
        classification: "generation-advance",
        generationLossId: `loss:${fixture.projectSessionId}:run-stage1:chair:provider-event-01`,
      });
      expect(fixture.repository.readHead("run-stage1", "chair", recorded.generationLossId!))
        .toMatchObject({ revision: 1, state: "open", abandonKind: "none", terminal: false });
      expect(fixture.database.prepare(`
        SELECT provider_generation,principal_generation,revision
          FROM agent_lifecycle_identity_high_water
         WHERE run_id='run-stage1' AND agent_id='chair'
      `).get()).toEqual({
        provider_generation: 3,
        principal_generation: fixture.principalGeneration,
        revision: 2,
      });
      expect(fixture.database.prepare(`
        SELECT provider_generation,context_revision,revision
          FROM agent_lifecycle_context_high_water
         WHERE run_id='run-stage1' AND agent_id='chair'
         ORDER BY provider_generation
      `).all()).toEqual([
        { provider_generation: 2, context_revision: 5, revision: 1 },
        { provider_generation: 3, context_revision: 9, revision: 1 },
      ]);

      const identity = fixture.database.prepare(`
        SELECT creation_json,creation_digest FROM lifecycle_generation_losses
         WHERE run_id='run-stage1' AND agent_id='chair' AND generation_loss_id=?
      `).get(recorded.generationLossId) as { creation_json: string; creation_digest: string };
      expect(identity.creation_digest).toBe(
        lifecycleDigest("generation-loss-semantic", JSON.parse(identity.creation_json)),
      );

      const revision = fixture.database.prepare(`
        SELECT semantic_json,semantic_digest,source_ref_digest,journal_json,journal_digest,
               prior_revision,prior_journal_digest
          FROM lifecycle_generation_loss_revisions
         WHERE run_id='run-stage1' AND agent_id='chair' AND generation_loss_id=?
      `).get(recorded.generationLossId) as {
        semantic_json: string;
        semantic_digest: string;
        source_ref_digest: string;
        journal_json: string;
        journal_digest: string;
        prior_revision: null;
        prior_journal_digest: null;
      };
      expect(revision.prior_revision).toBeNull();
      expect(revision.prior_journal_digest).toBeNull();
      expect(revision.semantic_digest).toBe(
        lifecycleDigest("generation-loss-semantic", JSON.parse(revision.semantic_json)),
      );
      expect(revision.source_ref_digest).toBe(revision.semantic_digest);
      expect(revision.journal_digest).toBe(
        lifecycleDigest("generation-loss-journal", JSON.parse(revision.journal_json)),
      );

      const replay = fixture.database.transaction(() =>
        fixture.repository.recordObservationInCurrentTransaction(input)
      ).immediate();
      expect(replay).toEqual(recorded);
      expect(fixture.database.prepare("SELECT count(*) AS count FROM provider_context_observation_audit").get())
        .toEqual({ count: 1 });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM lifecycle_generation_loss_revisions").get())
        .toEqual({ count: 1 });

      for (const conflict of [
        { providerGeneration: input.providerGeneration + 1 },
        { contextRevision: input.contextRevision + 1 },
        { evidenceDigest: digest("conflicting-provider-event-01") },
      ]) {
        expect(() => fixture.database.transaction(() =>
          fixture.repository.recordObservationInCurrentTransaction({ ...input, ...conflict })
        ).immediate()).toThrow("generation-loss source event conflicts with its durable observation");
      }
      expect(fixture.database.prepare("SELECT count(*) AS count FROM provider_context_observation_audit").get())
        .toEqual({ count: 1 });
    } finally {
      await closeFixture(fixture);
    }
  });

  it("rejects a crossed checkpoint arm before any generation-loss mutation", async () => {
    const fixture = await createRepositoryFixture();
    try {
      const crossedSource = {
        ...fixture.source,
        checkpoint: {
          state: "absent",
          ref: "checkpoint:must-be-null",
          digest: digest("must-also-be-null"),
        },
      } as unknown as GenerationLossSource;
      expect(() => fixture.database.transaction(() =>
        fixture.repository.recordObservationInCurrentTransaction(observation(fixture, {
          lossSource: crossedSource,
        }))
      ).immediate()).toThrow("generation-loss checkpoint arm is crossed");
      expect(fixture.database.prepare("SELECT count(*) AS count FROM agent_lifecycle_identity_high_water").get())
        .toEqual({ count: 0 });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM agent_lifecycle_context_high_water").get())
        .toEqual({ count: 0 });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM provider_context_observation_audit").get())
        .toEqual({ count: 0 });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM lifecycle_generation_losses").get())
        .toEqual({ count: 0 });
    } finally {
      await closeFixture(fixture);
    }
  });

  it.each([
    ["action", { sourceActionRef: { adapterId: "fake-primary", actionId: "crossed-action" } }],
    ["contract", { sourceAdapterContractDigest: digest("crossed-contract") }],
    ["session", { oldProviderSessionRef: "provider-session:crossed" }],
    ["capability", { sourceCapabilityHash: digest("crossed-capability") }],
    ["bridge revision", { sourceBridgeRevision: 5 }],
    ["row id", { sourceBridgeRowId: "run-stage1:other" }],
  ] as const)("rejects a crossed predecessor %s before loss insertion", async (_name, delta) => {
    const fixture = await createRepositoryFixture();
    try {
      expect(() => fixture.database.transaction(() =>
        fixture.repository.recordObservationInCurrentTransaction(observation(fixture, {
          lossSource: { ...fixture.source, ...delta },
        }))
      ).immediate()).toThrow(/generation-loss source/);
      expect(fixture.database.prepare("SELECT count(*) AS count FROM lifecycle_generation_losses").get())
        .toEqual({ count: 0 });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM provider_context_observation_audit").get())
        .toEqual({ count: 0 });
    } finally {
      await closeFixture(fixture);
    }
  });

  it("serializes an advancing observation after active lifecycle custody without bootstrapping or auditing", async () => {
    const fixture = await createRepositoryFixture();
    try {
      seedNonterminalCustody(fixture);
      expect(() => fixture.database.transaction(() =>
        fixture.repository.recordObservationInCurrentTransaction(observation(fixture))
      ).immediate()).toThrow("agent has active lifecycle custody");
      expect(fixture.database.prepare("SELECT count(*) AS count FROM agent_lifecycle_identity_high_water").get())
        .toEqual({ count: 0 });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM agent_lifecycle_context_high_water").get())
        .toEqual({ count: 0 });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM provider_context_observation_audit").get())
        .toEqual({ count: 0 });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM lifecycle_generation_losses").get())
        .toEqual({ count: 0 });
    } finally {
      await closeFixture(fixture);
    }
  });

  it.each([
    {
      name: "equal-coordinate replay",
      delta: { providerGeneration: 2, contextRevision: 5 },
      classification: "replay",
      loss: false,
    },
    {
      name: "lower-provider reordered observation",
      delta: { providerGeneration: 1, contextRevision: 99 },
      classification: "reordered-observation",
      loss: false,
    },
    {
      name: "lower-context reordered observation",
      delta: { providerGeneration: 2, contextRevision: 4 },
      classification: "reordered-observation",
      loss: false,
    },
    {
      name: "arbitrary same-generation context advance",
      delta: { providerGeneration: 2, contextRevision: 12 },
      classification: "context-advance",
      loss: true,
    },
    {
      name: "simultaneous provider and context advance",
      delta: { providerGeneration: 5, contextRevision: 12 },
      classification: "generation-advance",
      loss: true,
    },
  ] as const)("classifies $name from the durable high-water pair", async ({ delta, classification, loss }) => {
    const fixture = await createRepositoryFixture();
    try {
      const withSource = observation(fixture, delta);
      const input = loss
        ? withSource
        : (({ lossSource: _lossSource, ...withoutSource }) => withoutSource)(withSource);
      const result = fixture.database.transaction(() =>
        fixture.repository.recordObservationInCurrentTransaction(input)
      ).immediate();
      expect(result).toMatchObject({
        classification,
        generationLossId: loss ? expect.any(String) : null,
      });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM provider_context_observation_audit").get())
        .toEqual({ count: 1 });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM lifecycle_generation_losses").get())
        .toEqual({ count: loss ? 1 : 0 });
      const identity = fixture.database.prepare(`
        SELECT provider_generation,principal_generation,revision
          FROM agent_lifecycle_identity_high_water
         WHERE run_id='run-stage1' AND agent_id='chair'
      `).get();
      if (classification === "replay" || classification === "reordered-observation") {
        expect(identity).toBeUndefined();
      } else {
        expect(identity).toEqual({
          provider_generation: classification === "generation-advance" ? delta.providerGeneration : 2,
          principal_generation: fixture.principalGeneration,
          revision: classification === "generation-advance" ? 2 : 1,
        });
      }
      const contexts = fixture.database.prepare(`
        SELECT provider_generation,context_revision,revision
          FROM agent_lifecycle_context_high_water
         WHERE run_id='run-stage1' AND agent_id='chair'
         ORDER BY provider_generation
      `).all();
      if (classification === "context-advance") {
        expect(contexts).toEqual([{ provider_generation: 2, context_revision: 12, revision: 2 }]);
      } else if (classification === "generation-advance") {
        expect(contexts).toEqual([
          { provider_generation: 2, context_revision: 5, revision: 1 },
          { provider_generation: 5, context_revision: 12, revision: 1 },
        ]);
      } else {
        expect(contexts).toEqual([]);
      }
    } finally {
      await closeFixture(fixture);
    }
  });

  it("jumps to MAX_SAFE provider generation with one bounded identity CAS", async () => {
    const fixture = await createRepositoryFixture();
    try {
      const recorded = fixture.database.transaction(() =>
        fixture.repository.recordObservationInCurrentTransaction(observation(fixture, {
          sourceEventId: "provider-event-max-safe",
          providerGeneration: Number.MAX_SAFE_INTEGER,
          contextRevision: 12,
          evidenceDigest: digest("provider-event-max-safe"),
        }))
      ).immediate();
      expect(recorded.classification).toBe("generation-advance");
      expect(fixture.database.prepare(`
        SELECT provider_generation,principal_generation,revision
          FROM agent_lifecycle_identity_high_water
         WHERE run_id='run-stage1' AND agent_id='chair'
      `).get()).toEqual({
        provider_generation: Number.MAX_SAFE_INTEGER,
        principal_generation: fixture.principalGeneration,
        revision: 2,
      });
      expect(fixture.database.prepare(`
        SELECT provider_generation,context_revision,revision
          FROM agent_lifecycle_context_high_water
         WHERE run_id='run-stage1' AND agent_id='chair'
         ORDER BY provider_generation
      `).all()).toEqual([
        { provider_generation: 2, context_revision: 5, revision: 1 },
        { provider_generation: Number.MAX_SAFE_INTEGER, context_revision: 12, revision: 1 },
      ]);
    } finally {
      await closeFixture(fixture);
    }
  });

  it("keeps one nonterminal loss and leaves a second advancing source event unrecorded", async () => {
    const fixture = await createRepositoryFixture();
    try {
      fixture.database.transaction(() =>
        fixture.repository.recordObservationInCurrentTransaction(observation(fixture, {
          providerGeneration: 2,
          contextRevision: 12,
        }))
      ).immediate();
      expect(() => fixture.database.transaction(() =>
        fixture.repository.recordObservationInCurrentTransaction(observation(fixture, {
          sourceEventId: "provider-event-02",
          providerGeneration: 2,
          contextRevision: 13,
          evidenceDigest: digest("provider-event-02"),
          observedAt: 21,
        }))
      ).immediate()).toThrow("agent already has a nonterminal generation loss");
      expect(fixture.database.prepare("SELECT count(*) AS count FROM provider_context_observation_audit").get())
        .toEqual({ count: 1 });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM lifecycle_generation_losses").get())
        .toEqual({ count: 1 });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM lifecycle_generation_loss_revisions").get())
        .toEqual({ count: 1 });
      expect(fixture.database.prepare("SELECT count(*) AS count FROM lifecycle_generation_loss_heads").get())
        .toEqual({ count: 1 });
      expect(fixture.database.prepare(`
        SELECT context_revision,revision FROM agent_lifecycle_context_high_water
         WHERE run_id='run-stage1' AND agent_id='chair' AND provider_generation=2
      `).get()).toEqual({ context_revision: 12, revision: 2 });
    } finally {
      await closeFixture(fixture);
    }
  });

  it("rolls back loss, head, and audit when the final context CAS goes stale", async () => {
    const fixture = await createRepositoryFixture();
    try {
      fixture.database.prepare(`
        INSERT INTO agent_lifecycle_identity_high_water(
          run_id,agent_id,provider_generation,principal_generation,revision
        ) VALUES ('run-stage1','chair',2,?,1)
      `).run(fixture.principalGeneration);
      fixture.database.prepare(`
        INSERT INTO agent_lifecycle_context_high_water(
          run_id,agent_id,provider_generation,context_revision,revision
        ) VALUES ('run-stage1','chair',2,5,1)
      `).run();
      fixture.database.exec(`
        CREATE TRIGGER generation_loss_test_stale_context_cas
        BEFORE INSERT ON lifecycle_generation_loss_heads
        BEGIN
          UPDATE agent_lifecycle_context_high_water
             SET context_revision=context_revision+1,revision=revision+1
           WHERE run_id=NEW.run_id AND agent_id=NEW.agent_id
             AND provider_generation=2;
        END;
      `);
      expect(() => fixture.database.transaction(() =>
        fixture.repository.recordObservationInCurrentTransaction(observation(fixture, {
          providerGeneration: 2,
          contextRevision: 12,
        }))
      ).immediate()).toThrow("generation-loss context high-water compare-and-set failed");
      expect(fixture.database.prepare(`
        SELECT provider_generation,principal_generation,revision
          FROM agent_lifecycle_identity_high_water
         WHERE run_id='run-stage1' AND agent_id='chair'
      `).get()).toEqual({
        provider_generation: 2,
        principal_generation: fixture.principalGeneration,
        revision: 1,
      });
      expect(fixture.database.prepare(`
        SELECT provider_generation,context_revision,revision
          FROM agent_lifecycle_context_high_water
         WHERE run_id='run-stage1' AND agent_id='chair'
      `).get()).toEqual({ provider_generation: 2, context_revision: 5, revision: 1 });
      for (const table of [
        "provider_context_observation_audit",
        "lifecycle_generation_losses",
        "lifecycle_generation_loss_revisions",
        "lifecycle_generation_loss_heads",
      ]) {
        expect(fixture.database.prepare(`SELECT count(*) AS count FROM ${table}`).get(), table)
          .toEqual({ count: 0 });
      }
    } finally {
      await closeFixture(fixture);
    }
  });
});

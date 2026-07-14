import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { LifecycleRotationRepository } from "../../../src/lifecycle/rotation-repository.ts";
import { sha256 } from "../../../src/project-session/store-support.ts";
import { admitProviderActionFixture } from "../../support/provider-action-fixture.ts";
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
    database.prepare(`INSERT INTO lifecycle_scope_admission_outbox VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      requestId, input.projectId, input.projectSessionId, input.runId, input.authorityId,
      admissionDigest, 1, canonical(scope), scopeDigest, 1,
    );
    database.prepare(`INSERT INTO lifecycle_admitted_run_scopes VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      input.projectId, input.projectSessionId, input.runId, input.authorityId,
      admissionDigest, 1, requestId, scopeDigest, checkpointDigest, resolutionDigest,
    );
    database.prepare(`INSERT INTO lifecycle_receipt_scope_checkpoints VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      input.projectSessionId, input.runId, input.authorityId, 0, 0, null,
      orderedRecordSetDigest, canonical(checkpointBody), checkpointDigest, "scope-attestation-0", 1,
    );
    database.prepare(`INSERT INTO lifecycle_receipt_scope_heads VALUES (?,?,?,1)`).run(
      input.projectSessionId, input.runId, checkpointDigest,
    );
    database.prepare(`INSERT INTO lifecycle_receipt_namespace_checkpoints VALUES (?,?,?,?,?,?,?,?)`).run(
      input.projectId, input.authorityId, 1, orderedScopeHeadSetDigest,
      canonical(namespaceBody), namespaceDigest, "namespace-attestation-0", 1,
    );
    database.prepare(`INSERT INTO lifecycle_receipt_namespace_members VALUES (?,?,?,?,?,?,?,?,?)`).run(
      input.projectId, namespaceDigest, 1, input.projectSessionId, input.runId,
      input.authorityId, checkpointDigest, 0, null,
    );
    database.prepare(`INSERT INTO lifecycle_receipt_namespace_heads VALUES (?,?,?,?,?,1)`).run(
      input.projectId, input.authorityId, 1, orderedScopeHeadSetDigest, namespaceDigest,
    );
    database.prepare(`INSERT INTO lifecycle_scope_admission_resolutions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      requestId, input.projectId, input.projectSessionId, input.runId, input.authorityId,
      admissionDigest, 1, scopeDigest, 0, 0, orderedRecordSetDigest,
      canonical(checkpointBody), checkpointDigest, 1, namespaceDigest,
      canonical(namespaceMember), 1, canonical(resolutionBody), resolutionDigest,
    );
  }).immediate();
  return { checkpointDigest };
}

describe("lifecycle rotation repository", () => {
  it("creates one immutable custody and appends only through the exact head", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const database = new Database(fixture.databasePath);
    database.pragma("foreign_keys = ON");
    try {
      const identity = database.prepare(`
        SELECT run.project_session_id, capability.token_hash,
               capability.principal_generation
          FROM runs run
          JOIN capabilities capability
            ON capability.run_id=run.run_id AND capability.agent_id=run.chair_agent_id
         WHERE run.run_id='run-stage1' AND capability.revoked_at IS NULL
         ORDER BY capability.principal_generation DESC LIMIT 1
      `).get() as {
        project_session_id: string;
        token_hash: string;
        principal_generation: number;
      };
      admitProviderActionFixture(database, {
        runId: "run-stage1",
        adapterId: "fake-primary",
        actionId: "rotation-action-01",
        operation: "spawn",
        targetAgentId: "chair",
        identityHash: sha256("rotation-identity"),
        payloadHash: sha256("rotation-payload"),
        payloadJson: "{}",
        status: "prepared",
        historyJson: '["prepared"]',
        executionCount: 0,
        updatedAt: 10,
      });
      const repository = new LifecycleRotationRepository(database);
      const created = database.transaction(() => repository.createInCurrentTransaction({
        projectSessionId: identity.project_session_id,
        runId: "run-stage1",
        agentId: "chair",
        custodyId: "rotation-custody-01",
        commandId: "rotation-command-01",
        admissionDigest: sha256("admission"),
        actionRef: { adapterId: "fake-primary", actionId: "rotation-action-01" },
        bridgeOwnerKind: "child",
        callerTurnLeaseId: "rotation-turn-01",
        callerTurnGeneration: 1,
        predecessorTurnSetDigest: sha256("predecessor-turns"),
        quarantinedWriteSetDigest: sha256("writes"),
        deliveryCutWatermark: 0,
        adoptionDeliverySetDigest: sha256("deliveries"),
        checkpointRef: "checkpoint-01",
        checkpointDigest: sha256("checkpoint"),
        taskRevision: 1,
        mailboxRevision: 0,
        childSetDigest: sha256("children"),
        openWorkSetDigest: sha256("open-work"),
        sourceProviderSessionRef: "source-session",
        sourceCapabilityHash: identity.token_hash,
        sourceCustodyActionId: "rotation-action-01",
        sourceAdapterId: "fake-primary",
        sourceAdapterContractDigest: sha256("source-contract"),
        sourceBridgeRowId: "source-bridge",
        sourceBridgeRevision: 1,
        sourceProviderGeneration: 1,
        sourcePrincipalGeneration: identity.principal_generation,
        sourceBridgeGeneration: 1,
        sourceProjectSessionGeneration: 1,
        sourceRunGeneration: 1,
        sourceChairLeaseGeneration: 1,
        targetProviderGeneration: 2,
        targetPrincipalGeneration: identity.principal_generation + 1,
        targetBridgeGeneration: 2,
        replacementAdapterId: "fake-primary",
        replacementContractDigest: sha256("replacement-contract"),
        stagedCapabilityHash: sha256("staged-capability"),
        launchAttestChallengeDigest: sha256("challenge"),
        preconditionDigest: sha256("precondition"),
        createdAt: 11,
      }))();
      expect(created).toMatchObject({ revision: 1, state: "awaiting-boundary", terminal: false });
      const createdRow = database.prepare(`
        SELECT semantic_json,semantic_digest,source_ref_digest,journal_json,journal_digest
          FROM lifecycle_rotation_custody_revisions
         WHERE run_id='run-stage1' AND agent_id='chair' AND custody_id='rotation-custody-01'
           AND revision=1
      `).get() as {
        semantic_json: string;
        semantic_digest: string;
        source_ref_digest: string;
        journal_json: string;
        journal_digest: string;
      };
      expect(createdRow.semantic_digest).toBe(
        lifecycleDigest("custody-semantic", JSON.parse(createdRow.semantic_json)),
      );
      expect(createdRow.source_ref_digest).toBe(createdRow.semantic_digest);
      expect(createdRow.journal_digest).toBe(
        lifecycleDigest("custody-journal", JSON.parse(createdRow.journal_json)),
      );

      const prepared = database.transaction(() => repository.appendInCurrentTransaction({
        runId: "run-stage1",
        agentId: "chair",
        custodyId: "rotation-custody-01",
        expectedRevision: 1,
        state: "prepared",
        recordedAt: 12,
      }))();
      expect(prepared).toMatchObject({ revision: 2, state: "prepared", terminal: false });
      const preparedRow = database.prepare(`
        SELECT semantic_json,semantic_digest,source_ref_digest,journal_json,journal_digest
          FROM lifecycle_rotation_custody_revisions
         WHERE run_id='run-stage1' AND agent_id='chair' AND custody_id='rotation-custody-01'
           AND revision=2
      `).get() as typeof createdRow;
      expect(preparedRow.semantic_digest).toBe(
        lifecycleDigest("custody-semantic", JSON.parse(preparedRow.semantic_json)),
      );
      expect(preparedRow.source_ref_digest).toBe(preparedRow.semantic_digest);
      expect(preparedRow.journal_digest).toBe(
        lifecycleDigest("custody-journal", JSON.parse(preparedRow.journal_json)),
      );
      expect(() => database.transaction(() => repository.appendInCurrentTransaction({
        runId: "run-stage1",
        agentId: "chair",
        custodyId: "rotation-custody-01",
        expectedRevision: 1,
        state: "dispatched",
        recordedAt: 13,
      }))()).toThrow("lifecycle custody head changed");
      expect(database.prepare(`
        SELECT revision FROM lifecycle_rotation_custody_revisions
         WHERE run_id='run-stage1' AND agent_id='chair' AND custody_id='rotation-custody-01'
         ORDER BY revision
      `).all()).toEqual([{ revision: 1 }, { revision: 2 }]);

      let head = database.transaction(() => repository.appendInCurrentTransaction({
        runId: "run-stage1", agentId: "chair", custodyId: "rotation-custody-01",
        expectedRevision: 2, state: "dispatched", recordedAt: 14,
      }))();
      head = database.transaction(() => repository.appendInCurrentTransaction({
        runId: "run-stage1", agentId: "chair", custodyId: "rotation-custody-01",
        expectedRevision: head.revision, state: "provider-terminal",
        terminalEvidenceDigest: lifecycleDigest("transition-proof", { terminal: true }), recordedAt: 15,
      }))();
      head = database.transaction(() => repository.appendInCurrentTransaction({
        runId: "run-stage1", agentId: "chair", custodyId: "rotation-custody-01",
        expectedRevision: head.revision, state: "committing",
        terminalEvidenceDigest: lifecycleDigest("transition-proof", { terminal: true }), recordedAt: 16,
      }))();
      const mutationPlan = {
        schemaVersion: 1,
        writes: [],
        writeSetDigest: lifecycleDigest("mutation-plan", { schemaVersion: 1, writes: [] }),
      };
      const preparedTerminal = database.transaction(() => repository.prepareChildCustodyTerminalInCurrentTransaction({
        runId: "run-stage1",
        agentId: "chair",
        custodyId: "rotation-custody-01",
        expectedRevision: head.revision,
        applyId: "rotation-apply-01",
        transitionProof: { schemaVersion: 1, kind: "provider-terminal", evidence: "verified" },
        mutationPlan,
        recordedAt: 17,
      }))();
      expect(preparedTerminal.subjectDigest).toBe(
        lifecycleDigest("receipt-subject", preparedTerminal.subject),
      );
      expect(preparedTerminal.subjectJson).toBe(canonical(preparedTerminal.subject));
      expect(preparedTerminal.intentDigest).toBe(
        lifecycleDigest("receipt-intent", preparedTerminal.intent),
      );
      expect(preparedTerminal.intentJson).toBe(canonical(preparedTerminal.intent));
      expect(database.prepare("SELECT count(*) AS count FROM lifecycle_receipt_batches").get())
        .toEqual({ count: 1 });
      expect(database.prepare("SELECT count(*) AS count FROM lifecycle_transition_applies").get())
        .toEqual({ count: 0 });

      expect(() => database.transaction(() => repository.applyAuthorizedChildCustodyTerminalInCurrentTransaction({
        prepared: preparedTerminal,
        expectedRevision: head.revision,
        expectedScopeHead: { checkpointDigest: "missing", revision: 1 },
        receipt: {
          authorityId: fixture.authorities.chair,
          authoritySequence: 1,
          previousReceiptDigest: null,
          receiptDigest: lifecycleDigest("authenticated-receipt", { wrong: true }),
          attestation: "external-attestation",
          verifiedAt: 18,
        },
        scopeCheckpoint: {
          receiptCount: 1,
          headAuthoritySequence: 1,
          headReceiptDigest: lifecycleDigest("authenticated-receipt", { wrong: true }),
          orderedRecordSetDigest: lifecycleDigest("scope-record-set", []),
          checkpointDigest: lifecycleDigest("scope-checkpoint", { wrong: true }),
          attestation: "scope-attestation-1",
          verifiedAt: 18,
        },
        authorizedAt: 18,
        appliedAt: 19,
        localWriteIdentities: [],
        performAdoptionWrites: () => undefined,
      }))()).toThrow("externally verified lifecycle authorization is invalid");
      expect(repository.readHead("run-stage1", "chair", "rotation-custody-01"))
        .toMatchObject({ revision: head.revision, state: "committing", terminal: false });

      const project = database.prepare(`
        SELECT session.project_id FROM runs run
        JOIN project_sessions session ON session.project_session_id=run.project_session_id
        WHERE run.run_id='run-stage1'
      `).get() as { project_id: string };
      const initialScope = seedLifecycleScope(database, {
        projectId: project.project_id,
        projectSessionId: identity.project_session_id,
        runId: "run-stage1",
        authorityId: fixture.authorities.chair,
      });
      const receiptBody = {
        schemaVersion: 1,
        kind: "custody-terminal",
        authorityId: fixture.authorities.chair,
        authoritySequence: 1,
        previousReceiptDigest: null,
        intentDigest: preparedTerminal.intentDigest,
        subjectDigest: preparedTerminal.subjectDigest,
      };
      const receiptDigest = lifecycleDigest("authenticated-receipt", receiptBody);
      const laterReceiptDigest = lifecycleDigest("authenticated-receipt", { sequence: 2 });
      const orderedRecordSetDigest = lifecycleDigest("scope-record-set", [[
        "1", receiptDigest, preparedTerminal.intentDigest, "custody-terminal", "chair",
        "custody", "rotation-custody-01", String(preparedTerminal.finalRevision),
      ], [
        "2", laterReceiptDigest, lifecycleDigest("receipt-intent", { later: true }),
        "generation-loss-terminal", "other-agent", "generation-loss", "loss-02", "2",
      ]]);
      const scopeCheckpointBody = {
        schemaVersion: 1,
        authorityId: fixture.authorities.chair,
        projectSessionId: identity.project_session_id,
        runId: "run-stage1",
        receiptCountDec: "2",
        headAuthoritySequenceDec: "2",
        headReceiptDigest: laterReceiptDigest,
        orderedRecordSetDigest,
      };
      const scopeCheckpointDigest = lifecycleDigest("scope-checkpoint", scopeCheckpointBody);
      let callbackObservedApply = true;
      const finalized = database.transaction(() => repository.applyAuthorizedChildCustodyTerminalInCurrentTransaction({
        prepared: preparedTerminal,
        expectedRevision: head.revision,
        expectedScopeHead: { checkpointDigest: initialScope.checkpointDigest, revision: 1 },
        receipt: {
          authorityId: fixture.authorities.chair,
          authoritySequence: 1,
          previousReceiptDigest: null,
          receiptDigest,
          attestation: "external-attestation",
          verifiedAt: 18,
        },
        scopeCheckpoint: {
          receiptCount: 2,
          headAuthoritySequence: 2,
          headReceiptDigest: laterReceiptDigest,
          orderedRecordSetDigest,
          checkpointDigest: scopeCheckpointDigest,
          attestation: "scope-attestation-1",
          verifiedAt: 18,
        },
        authorizedAt: 18,
        appliedAt: 19,
        localWriteIdentities: ["agent:run-stage1:chair"],
        performAdoptionWrites: () => {
          callbackObservedApply = (database.prepare(
            "SELECT count(*) FROM lifecycle_transition_applies",
          ).pluck().get() as number) > 0;
        },
      }))();
      expect(callbackObservedApply).toBe(false);
      expect(finalized).toMatchObject({
        revision: head.revision + 1, state: "finalized", disposition: "adopted", terminal: true,
      });
      expect(database.prepare(`
        SELECT revision,state,disposition_code FROM lifecycle_rotation_custody_revisions
        WHERE run_id='run-stage1' AND agent_id='chair' AND custody_id='rotation-custody-01'
        ORDER BY revision
      `).all()).toEqual([
        { revision: 1, state: "awaiting-boundary", disposition_code: "none" },
        { revision: 2, state: "prepared", disposition_code: "none" },
        { revision: 3, state: "dispatched", disposition_code: "none" },
        { revision: 4, state: "provider-terminal", disposition_code: "none" },
        { revision: 5, state: "committing", disposition_code: "none" },
        { revision: 6, state: "finalized", disposition_code: "adopted" },
      ]);
    } finally {
      database.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});

import { createHash, randomBytes } from "node:crypto";

import type Database from "better-sqlite3";

import {
  LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC,
  LIFECYCLE_CURRENT_STATE_V1_CODEC,
  type LifecycleAcceptedSuspendedV1,
} from "@local/agent-fabric-protocol";

import { FabricError } from "../errors.js";
import { CommandJournal } from "../application/command-journal.js";
import { ProviderActionAdmissionCoordinator } from "../application/provider-action-admission.js";
import { LifecycleRotationRepository } from "./rotation-repository.js";
import type {
  LifecycleAdmittedRunScope,
  LifecycleAuthenticatedScopeCheckpoint,
  LifecycleDigest,
  LifecycleIntegrityReceiptAuthorityPort,
} from "./receipt-authority.js";
import type { LifecycleCheckpoint, LifecycleResult } from "../core/contracts.js";

const MAXIMUM_LIFECYCLE_HANDOFF_BYTES = 65_536;

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(row: Row, field: string): string {
  const value = row[field];
  if (typeof value !== "string") {
    throw new Error(`database field ${field} is not a string`);
  }
  return value;
}

function numberField(row: Row, field: string): number {
  const value = row[field];
  if (typeof value !== "number") {
    throw new Error(`database field ${field} is not a number`);
  }
  return value;
}

function rowOrNotFound(value: unknown, label: string): Row {
  if (!isRow(value)) {
    throw new FabricError("NOT_FOUND", `${label} was not found`);
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRow(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("value is not JSON-compatible");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Digest(value: string): string {
  return `sha256:${sha256(value)}`;
}

function lifecycleDigest(domain: string, value: unknown): string {
  return sha256Digest(`agent-fabric.lifecycle.v1\0${domain}\0${canonicalJson(value)}`);
}

// Moved byte-for-byte from fabric.ts (isLifecycleResult, at 0880553 lines 688-699). Fabric
// imports this back for its two lifecycle public methods that have not yet been extracted
// (reportProviderState / requestLifecycle's non-rotation path).
export function isLifecycleResult(value: unknown): value is LifecycleResult {
  try {
    if (isRow(value) && value.kind === "accepted-suspended") {
      LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC.parse(value, "lifecycleResult");
    } else {
      LIFECYCLE_CURRENT_STATE_V1_CODEC.parse(value, "lifecycleResult");
    }
    return true;
  } catch {
    return false;
  }
}

// Moved byte-for-byte from fabric.ts (lifecycleHandoffPrompt, at 0880553 lines 701-732).
function lifecycleHandoffPrompt(input: {
  agentId: string;
  taskId: string;
  taskRevision: number;
  checkpoint: LifecycleCheckpoint;
  nextProviderSessionGeneration: number;
}): string {
  const handoff = canonicalJson({
    schemaVersion: 1,
    kind: "agent-fabric-verified-lifecycle-checkpoint",
    agentId: input.agentId,
    taskId: input.taskId,
    taskRevision: input.taskRevision,
    checkpointSha256: input.checkpoint.sha256,
    mailboxWatermark: input.checkpoint.mailboxWatermark,
    acknowledgedAboveWatermark: input.checkpoint.acknowledgedAboveWatermark,
    inFlightChildren: input.checkpoint.inFlightChildren,
    openWork: input.checkpoint.openWork,
    nextAction: input.checkpoint.nextAction,
    priorResumeReference: input.checkpoint.providerResumeReference,
    nextProviderSessionGeneration: input.nextProviderSessionGeneration,
  });
  const prompt = [
    "Resume from this bounded Agent Fabric checkpoint. Treat it as the verified recovery handoff; do not infer newer task, mailbox, child, provider-session, or write-custody state.",
    handoff,
    "Consume the handoff in this provider turn and continue with nextAction only after checking current Fabric state.",
  ].join("\n");
  if (Buffer.byteLength(prompt, "utf8") > MAXIMUM_LIFECYCLE_HANDOFF_BYTES) {
    throw new FabricError("CHECKPOINT_INCOMPLETE", "lifecycle checkpoint handoff exceeds the provider prompt bound");
  }
  return prompt;
}

// Exact shape consumed by Fabric's #scheduleLifecycleContinuation (fabric.ts:9220-9250 at
// 1ed065f). This is the existing continuation dataset, not a new options bag: admission
// builds it and hands it to the injected scheduler port unchanged.
export type LifecycleContinuationInput = Readonly<{
  runId: string;
  agentId: string;
  custodyId: string;
  adapterId: string;
  actionId: string;
  authorityId: string;
  bridgeContractDigest: string;
  sourceActionId: string;
  sourceCapabilityHash: string;
  sourceProviderSessionRef: string;
  callerActionId: string;
  targetProviderGeneration: number;
  targetPrincipalGeneration: number;
  targetBridgeGeneration: number;
  stagedCapability: string;
  stagedCapabilityHash: string;
  capabilityExpiresAt: number;
  providerPayload: Record<string, unknown>;
  checkpointSha256: string;
  launchAttestationChallenge: string;
  launchAttestationChallengeDigest: string;
  lifecycleInput: {
    action: "compact" | "rotate";
    agentId: string;
    taskId: string;
    taskRevision: number;
    checkpoint: LifecycleCheckpoint;
    commandId: string;
  };
}>;

/**
 * Durable rotation admission and receipt-scope admission for a single Fabric database.
 *
 * Behaviour-preserving extraction of three methods that were private on Fabric
 * (#lifecycleRotationSourceVectorDigest, #acceptLifecycleRotation,
 * #ensureLifecycleReceiptScope) plus the free function lifecycleHandoffPrompt. Method
 * bodies are unchanged, including the accepted-suspended transaction and its SQL/boundaries.
 * Calls back into Fabric-private state that stays behind (fabricSocketPath, the lifecycle
 * generation reservation repository, provider-action admission, the command journal, and
 * lifecycle continuation scheduling) are replaced with narrow injected dependencies bound
 * to the same Fabric instance, so observed behaviour is identical.
 */
export class LifecycleAdmission {
  readonly #database: Database.Database;
  readonly #clock: () => number;
  readonly #fault: (label: string) => void;
  readonly #fabricSocketPath: string | undefined;
  readonly #commandJournal: CommandJournal;
  readonly #providerActionAdmission: ProviderActionAdmissionCoordinator;
  readonly #lifecycleRotations: LifecycleRotationRepository;
  readonly #lifecycleReceiptAuthority: LifecycleIntegrityReceiptAuthorityPort | undefined;
  readonly #scheduleLifecycleContinuation: (input: LifecycleContinuationInput) => void;

  constructor(dependencies: Readonly<{
    database: Database.Database;
    clock: () => number;
    fault: (label: string) => void;
    fabricSocketPath: string | undefined;
    commandJournal: CommandJournal;
    providerActionAdmission: ProviderActionAdmissionCoordinator;
    lifecycleRotations: LifecycleRotationRepository;
    lifecycleReceiptAuthority: LifecycleIntegrityReceiptAuthorityPort | undefined;
    scheduleLifecycleContinuation: (input: LifecycleContinuationInput) => void;
  }>) {
    this.#database = dependencies.database;
    this.#clock = dependencies.clock;
    this.#fault = dependencies.fault;
    this.#fabricSocketPath = dependencies.fabricSocketPath;
    this.#commandJournal = dependencies.commandJournal;
    this.#providerActionAdmission = dependencies.providerActionAdmission;
    this.#lifecycleRotations = dependencies.lifecycleRotations;
    this.#lifecycleReceiptAuthority = dependencies.lifecycleReceiptAuthority;
    this.#scheduleLifecycleContinuation = dependencies.scheduleLifecycleContinuation;
  }

  sourceVectorDigest(
    runId: string,
    agentId: string,
    taskId: string,
    checkpoint: LifecycleCheckpoint,
    adoptionDeliveries: readonly Readonly<{
      deliveryId: string;
      claimGeneration: number;
      requesterAgentId: string;
      targetProviderSession: string;
    }>[],
  ): string {
    const task = rowOrNotFound(this.#database.prepare(`
      SELECT task_id,authority_id,state,owner_agent_id,revision,owner_lease_generation
        FROM tasks WHERE run_id=? AND task_id=?
    `).get(runId, taskId), "lifecycle task");
    const mailbox = rowOrNotFound(this.#database.prepare(`
      SELECT next_sequence,contiguous_watermark
        FROM mailbox_state WHERE run_id=? AND recipient_id=?
    `).get(runId, agentId), "lifecycle mailbox");
    const deliveries = this.#database.prepare(`
      SELECT delivery_id,message_id,mailbox_sequence,state,attempt_count,claim_deadline,
             acknowledged_at,resolution_reason,resolved_at
        FROM deliveries WHERE run_id=? AND recipient_id=?
       ORDER BY mailbox_sequence,delivery_id
    `).all(runId, agentId);
    const children = this.#database.prepare(`
      SELECT agent_id,lifecycle,provider_session_ref
        FROM agents WHERE run_id=? AND parent_agent_id=?
       ORDER BY agent_id
    `).all(runId, agentId);
    const childTasks = this.#database.prepare(`
      SELECT task.task_id,task.state,task.owner_agent_id,task.revision,task.owner_lease_generation
        FROM tasks task JOIN agents child
          ON child.run_id=task.run_id AND child.agent_id=task.owner_agent_id
       WHERE task.run_id=? AND child.parent_agent_id=?
       ORDER BY task.task_id
    `).all(runId, agentId);
    const ownedTasks = this.#database.prepare(`
      SELECT task_id,state,revision,owner_lease_generation
        FROM tasks WHERE run_id=? AND owner_agent_id=?
       ORDER BY task_id
    `).all(runId, agentId);
    const capturedDeliveries = adoptionDeliveries.map((captured) => {
      const live = this.#database.prepare(`
        SELECT result_delivery_id AS deliveryId,claim_generation AS claimGeneration,
               requester_agent_id AS requesterAgentId,target_provider_session AS targetProviderSession,state
          FROM result_deliveries WHERE result_delivery_id=? AND run_id=?
      `).get(captured.deliveryId, runId);
      return isRow(live) && ["claimed", "provider-accepted"].includes(String(live.state))
        ? { deliveryId: live.deliveryId, claimGeneration: live.claimGeneration,
            requesterAgentId: live.requesterAgentId, targetProviderSession: live.targetProviderSession,
            eligibility: "captured" }
        : null;
    });
    return sha256Digest(canonicalJson({
      schemaVersion: 1,
      task,
      mailbox,
      deliveries,
      children,
      childTasks,
      ownedTasks,
      checkpoint: {
        relativePath: checkpoint.relativePath,
        sha256: checkpoint.sha256,
        mailboxWatermark: checkpoint.mailboxWatermark,
        acknowledgedAboveWatermark: [...checkpoint.acknowledgedAboveWatermark].sort(),
        inFlightChildren: [...checkpoint.inFlightChildren].sort(),
        openWork: [...checkpoint.openWork].sort(),
      },
      capturedDeliveries,
    }));
  }

  acceptRotation(
    runId: string,
    agentId: string,
    input: {
      action: "compact" | "rotate";
      agentId: string;
      taskId: string;
      taskRevision: number;
      checkpoint: LifecycleCheckpoint;
      commandId: string;
    },
  ): LifecycleAcceptedSuspendedV1 {
    if (this.#fabricSocketPath === undefined) {
      throw new FabricError("CAPABILITY_UNAVAILABLE", "retained lifecycle rotation requires the Fabric daemon socket");
    }
    const source = rowOrNotFound(this.#database.prepare(`
      SELECT run.project_session_id,run.revision AS run_revision,
             COALESCE(run.chair_generation,1) AS chair_generation,
             session.generation AS session_generation,agent.authority_id,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.provider_session_ref ELSE child_bridge.provider_session_ref END AS provider_session_ref,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.provider_adapter_id ELSE child_bridge.adapter_id END AS adapter_id,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.provider_action_id ELSE child_bridge.action_id END AS source_action_id,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.provider_session_generation ELSE child_bridge.provider_session_generation END AS provider_session_generation,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.bridge_generation ELSE child_bridge.bridge_generation END AS bridge_generation,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.revision ELSE child_bridge.revision END AS bridge_revision,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.capability_hash ELSE child_bridge.capability_hash END AS capability_hash,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.provider_contract_digest ELSE custody.bridge_contract_digest END AS bridge_contract_digest,
             CASE WHEN agent.agent_id=run.chair_agent_id THEN 'chair' ELSE 'child' END AS bridge_owner_kind,
             capability.principal_generation,capability.expires_at,
             turn.action_id AS caller_action_id,turn.turn_lease_generation,
             mailbox.contiguous_watermark
        FROM runs run
        JOIN project_sessions session ON session.project_session_id=run.project_session_id
        JOIN agents agent ON agent.run_id=run.run_id AND agent.agent_id=?
        LEFT JOIN agent_bridge_state child_bridge
          ON child_bridge.run_id=agent.run_id AND child_bridge.agent_id=agent.agent_id
         AND child_bridge.bridge_state='active'
        LEFT JOIN launched_chair_bridge_state chair_bridge
          ON chair_bridge.project_session_id=run.project_session_id
         AND chair_bridge.coordination_run_id=run.run_id
         AND chair_bridge.chair_agent_id=agent.agent_id
         AND chair_bridge.state='active'
        LEFT JOIN provider_agent_custody custody
          ON custody.run_id=child_bridge.run_id AND custody.adapter_id=child_bridge.adapter_id
         AND custody.action_id=child_bridge.action_id
        JOIN capabilities capability
          ON capability.run_id=agent.run_id AND capability.agent_id=agent.agent_id
         AND capability.token_hash=CASE WHEN agent.agent_id=run.chair_agent_id
           THEN chair_bridge.capability_hash ELSE child_bridge.capability_hash END
         AND capability.revoked_at IS NULL
        JOIN provider_session_turn_leases turn
          ON turn.run_id=agent.run_id AND turn.agent_id=agent.agent_id
         AND turn.adapter_id=CASE WHEN agent.agent_id=run.chair_agent_id
           THEN chair_bridge.provider_adapter_id ELSE child_bridge.adapter_id END AND turn.status='active'
        JOIN mailbox_state mailbox
          ON mailbox.run_id=agent.run_id AND mailbox.recipient_id=agent.agent_id
       WHERE run.run_id=? AND (
         (agent.agent_id=run.chair_agent_id AND chair_bridge.state='active') OR
         (agent.agent_id<>run.chair_agent_id AND child_bridge.bridge_state='active' AND custody.action_id IS NOT NULL)
       )
    `).get(agentId, runId), "active lifecycle caller turn");
    const adapterId = stringField(source, "adapter_id");
    const actionId = `${input.commandId}:spawn`;
    const custodyId = `lifecycle:${sha256(canonicalJson({ runId, agentId, commandId: input.commandId }))}`;
    const sourceProviderGeneration = numberField(source, "provider_session_generation");
    const sourcePrincipalGeneration = numberField(source, "principal_generation");
    const sourceBridgeGeneration = numberField(source, "bridge_generation");
    const bridgeOwnerKind = stringField(source, "bridge_owner_kind") as "chair" | "child";
    if (bridgeOwnerKind === "chair") {
      throw new FabricError(
        "CAPABILITY_UNAVAILABLE",
        "true-chair lifecycle rotation requires the disabled ordinal-two review authority path",
      );
    }
    const generationReservation = {
      runId,
      agentId,
      bridgeOwnerKind,
      sourceProviderGeneration,
      sourcePrincipalGeneration,
      sourceBridgeGeneration,
    };
    const targetGenerations = this.#lifecycleRotations.nextGenerations(generationReservation);
    const targetProviderGeneration = targetGenerations.providerGeneration;
    const targetPrincipalGeneration = targetGenerations.principalGeneration;
    const targetBridgeGeneration = targetGenerations.bridgeGeneration;
    const checkpointDigest = `sha256:${input.checkpoint.sha256}`;
    const launchAttestationChallenge = randomBytes(32).toString("hex");
    const launchAttestationChallengeDigest = `sha256:${createHash("sha256")
      .update(Buffer.from(launchAttestationChallenge, "hex")).digest("hex")}`;
    const stagedCapability = `afc_${randomBytes(32).toString("base64url")}`;
    const stagedCapabilityHash = sha256(stagedCapability);
    const prompt = lifecycleHandoffPrompt({
      agentId,
      taskId: input.taskId,
      taskRevision: input.taskRevision,
      checkpoint: input.checkpoint,
      nextProviderSessionGeneration: targetProviderGeneration,
    });
    const actionPayload = (storedActionId: string): Row => {
      const action = rowOrNotFound(this.#database.prepare(`
        SELECT payload_json FROM provider_actions
         WHERE run_id=? AND adapter_id=? AND action_id=?
      `).get(runId, adapterId, storedActionId), "lifecycle provider action");
      const payload: unknown = JSON.parse(stringField(action, "payload_json"));
      if (!isRow(payload)) throw new Error("lifecycle provider action payload is not an object");
      return payload;
    };
    const sessionControls: Record<string, string> = {};
    for (const payload of [
      actionPayload(stringField(source, "source_action_id")),
      actionPayload(stringField(source, "caller_action_id")),
    ]) {
      for (const key of ["cwd", "model", "modelFamily", "effort"] as const) {
        if (typeof payload[key] === "string") sessionControls[key] = payload[key];
      }
    }
    const providerPayload = {
      schemaVersion: 1,
      action: input.action,
      agentId,
      ...sessionControls,
      priorResumeReference: stringField(source, "provider_session_ref"),
      generation: targetProviderGeneration,
      prompt,
    };
    const ticket = this.#providerActionAdmission.preflightAgentAction({
      runId,
      actorAgentId: agentId,
      actionRef: { adapterId, actionId },
      canonicalInput: {
        schemaVersion: 1,
        owner: "lifecycle-rotation",
        action: input.action,
        taskId: input.taskId,
        taskRevision: input.taskRevision,
        checkpoint: input.checkpoint,
        sourceActionId: stringField(source, "source_action_id"),
        callerActionId: stringField(source, "caller_action_id"),
        targetProviderGeneration,
        targetPrincipalGeneration,
        targetBridgeGeneration,
      },
    });
    if (ticket.disposition === "admitted") {
      const replay = this.#commandJournal.read(runId, agentId, input.commandId, input, isLifecycleResult);
      if (replay?.kind === "accepted-suspended") return replay;
      throw new FabricError("DEDUPE_CONFLICT", "admitted lifecycle rotation lacks its command receipt");
    }
    let capturedWriteLeases: Array<Readonly<{ leaseId: string; generation: number }>> = [];
    const capturedAdoptionDeliveries = this.#database.prepare(`
      SELECT result_delivery_id AS deliveryId,claim_generation AS claimGeneration,
             requester_agent_id AS requesterAgentId,target_provider_session AS targetProviderSession,
             state,revision
        FROM result_deliveries
       WHERE run_id=? AND requester_agent_id=? AND target_provider_session=?
         AND state IN ('claimed','provider-accepted')
       ORDER BY result_delivery_id
    `).all(runId, agentId, stringField(source, "provider_session_ref")).map((candidate) => {
      const delivery = rowOrNotFound(candidate, "lifecycle adoption delivery");
      return {
        deliveryId: stringField(delivery, "deliveryId"),
        claimGeneration: numberField(delivery, "claimGeneration"),
        requesterAgentId: stringField(delivery, "requesterAgentId"),
        targetProviderSession: stringField(delivery, "targetProviderSession"),
        state: stringField(delivery, "state") as "claimed" | "provider-accepted",
        revision: numberField(delivery, "revision"),
      };
    });
    let quarantinedWriteSetDigest = sha256Digest(canonicalJson(capturedWriteLeases));
    const adoptionDeliverySetDigest = sha256Digest(canonicalJson(capturedAdoptionDeliveries.map((delivery) => ({
      deliveryId: delivery.deliveryId,
      claimGeneration: delivery.claimGeneration,
      requesterAgentId: delivery.requesterAgentId,
      sourceState: delivery.state,
    }))));
    const stableSourceVectorDigest = this.sourceVectorDigest(
      runId, agentId, input.taskId, input.checkpoint, capturedAdoptionDeliveries,
    );
    const openWorkSetDigest = sha256Digest(canonicalJson([...input.checkpoint.openWork].sort()));
    const predecessorTurnSetDigest = sha256Digest(canonicalJson([{
      adapterId,
      actionId: stringField(source, "caller_action_id"),
      turnLeaseGeneration: numberField(source, "turn_lease_generation"),
    }]));
    const acceptedBase = {
      schemaVersion: 1 as const,
      kind: "accepted-suspended" as const,
      projectSessionId: stringField(source, "project_session_id"),
      coordinationRunId: runId,
      action: input.action,
      agentId,
      taskId: input.taskId,
      taskRevision: input.taskRevision,
      lifecycle: "suspended" as const,
      custodyRef: {
        schemaVersion: 1 as const,
        runId,
        agentId,
        custodyId,
        custodyRevision: 1,
      },
      actionRef: { adapterId, actionId },
      checkpointDigest,
      openWorkSetDigest,
      deliveryCutWatermark: numberField(source, "contiguous_watermark"),
      predecessorTurnSetDigest,
      sourceProviderGeneration,
      sourcePrincipalGeneration,
      sourceBridgeGeneration,
      targetProviderGeneration,
      targetPrincipalGeneration,
      targetBridgeGeneration,
    };
    const accepted = LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC.parse({
      ...acceptedBase,
      acceptedReceiptDigest: sha256Digest(canonicalJson(acceptedBase)),
    }, "lifecycleAcceptance");
    this.#database.transaction(() => {
      const reserved = this.#lifecycleRotations.reserveNextGenerationsInCurrentTransaction(generationReservation);
      if (canonicalJson(reserved) !== canonicalJson(targetGenerations)) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle generation reservation changed");
      }
      const freezeReason = `lifecycle-rotation:${sha256(custodyId).slice(0, 32)}`;
      this.#database.prepare(`
        INSERT INTO delivery_freezes(run_id,agent_id,reason,created_at)
        VALUES (?,?,?,?)
        ON CONFLICT(run_id,agent_id) DO UPDATE SET
          reason=excluded.reason,created_at=excluded.created_at
      `).run(runId, agentId, freezeReason, this.#clock());
      const suspended = this.#database.prepare(`
        UPDATE agents SET lifecycle='suspended'
         WHERE run_id=? AND agent_id=? AND lifecycle IN ('ready','busy','idle','checkpointing','context-unreconciled')
      `).run(runId, agentId);
      if (suspended.changes !== 1) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle source changed before suspension");
      }
      capturedWriteLeases = this.#database.prepare(`
        SELECT lease_id AS leaseId,generation
          FROM leases
         WHERE run_id=? AND holder_agent_id=? AND kind='write' AND status='active'
         ORDER BY lease_id
      `).all(runId, agentId).map((candidate) => {
        const lease = rowOrNotFound(candidate, "lifecycle active write lease");
        return { leaseId: stringField(lease, "leaseId"), generation: numberField(lease, "generation") };
      });
      const quarantineLease = this.#database.prepare(`
        UPDATE leases SET status='quarantined',updated_at=?
         WHERE lease_id=? AND run_id=? AND holder_agent_id=? AND kind='write'
           AND generation=? AND status='active'
      `);
      capturedWriteLeases.forEach((lease) => {
        const changed = quarantineLease.run(this.#clock(), lease.leaseId, runId, agentId, lease.generation);
        if (changed.changes !== 1) {
          throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle write lease changed before quarantine");
        }
      });
      quarantinedWriteSetDigest = sha256Digest(canonicalJson(capturedWriteLeases));
      if (this.sourceVectorDigest(
        runId, agentId, input.taskId, input.checkpoint, capturedAdoptionDeliveries,
      ) !== stableSourceVectorDigest) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle accepted source vector changed before custody capture");
      }
      const payloadJson = canonicalJson(providerPayload);
      this.#providerActionAdmission.admitUnroutedInCurrentTransaction(ticket, {
        runId,
        adapterId,
        actionId,
        operation: "spawn",
        targetAgentId: agentId,
        providerSessionGeneration: targetProviderGeneration,
        identityHash: sha256(canonicalJson({ custodyId, providerPayload })),
        payloadHash: sha256(payloadJson),
        payloadJson,
        status: "prepared",
        historyJson: '["prepared"]',
        executionCount: 0,
        updatedAt: this.#clock(),
      }, "lifecycle", () => {
        this.#lifecycleRotations.createInCurrentTransaction({
        projectSessionId: accepted.projectSessionId,
        runId,
        agentId,
        custodyId,
        commandId: input.commandId,
        admissionDigest: accepted.acceptedReceiptDigest,
        actionRef: accepted.actionRef,
        bridgeOwnerKind,
        callerTurnLeaseId: stringField(source, "caller_action_id"),
        callerTurnGeneration: numberField(source, "turn_lease_generation"),
        predecessorTurnSetDigest,
        quarantinedWriteSetDigest,
        deliveryCutWatermark: accepted.deliveryCutWatermark,
        adoptionDeliverySetDigest,
        checkpointRef: input.checkpoint.relativePath,
        checkpointDigest,
        taskRevision: input.taskRevision,
        mailboxRevision: accepted.deliveryCutWatermark,
        childSetDigest: sha256(canonicalJson([...input.checkpoint.inFlightChildren].sort())),
        openWorkSetDigest,
        sourceProviderSessionRef: stringField(source, "provider_session_ref"),
        sourceCapabilityHash: stringField(source, "capability_hash"),
        sourceCustodyActionId: stringField(source, "source_action_id"),
        sourceAdapterId: adapterId,
        sourceAdapterContractDigest: stringField(source, "bridge_contract_digest"),
        sourceBridgeRowId: stringField(source, "bridge_owner_kind") === "chair"
          ? `${accepted.projectSessionId}:${runId}` : `${runId}:${agentId}`,
        sourceBridgeRevision: numberField(source, "bridge_revision"),
        sourceProviderGeneration,
        sourcePrincipalGeneration,
        sourceBridgeGeneration,
        sourceProjectSessionGeneration: numberField(source, "session_generation"),
        sourceRunGeneration: numberField(source, "run_revision"),
        sourceChairLeaseGeneration: numberField(source, "chair_generation"),
        targetProviderGeneration,
        targetPrincipalGeneration,
        targetBridgeGeneration,
        replacementAdapterId: adapterId,
        replacementContractDigest: stringField(source, "bridge_contract_digest"),
        stagedCapabilityHash,
        launchAttestChallengeDigest: launchAttestationChallengeDigest,
        preconditionDigest: stableSourceVectorDigest,
          createdAt: this.#clock(),
        });
      });
      const ownLease = this.#database.prepare(`
        INSERT INTO lifecycle_custody_write_leases(
          run_id,agent_id,custody_id,ordinal,lease_id,lease_generation,source_status,active_owner
        ) VALUES (?,?,?,?,?,?,'active',1)
      `);
      capturedWriteLeases.forEach((lease, index) => {
        ownLease.run(runId, agentId, custodyId, index + 1, lease.leaseId, lease.generation);
      });
      const ownDelivery = this.#database.prepare(`
        INSERT INTO lifecycle_custody_adoption_deliveries(
          run_id,agent_id,custody_id,ordinal,delivery_id,delivery_generation,
          recipient_agent_id,source_state,active_owner
        ) VALUES (?,?,?,?,?,?,?,?,1)
      `);
      const capturedDeliveryStillExact = this.#database.prepare(`
        SELECT 1 FROM result_deliveries
         WHERE result_delivery_id=? AND run_id=? AND requester_agent_id=?
           AND state=? AND claim_generation=? AND target_provider_session=? AND revision=?
      `);
      capturedAdoptionDeliveries.forEach((delivery, index) => {
        if (capturedDeliveryStillExact.get(
          delivery.deliveryId,
          runId,
          delivery.requesterAgentId,
          delivery.state,
          delivery.claimGeneration,
          delivery.targetProviderSession,
          delivery.revision,
        ) === undefined) {
          throw new FabricError(
            "LIFECYCLE_PRECONDITION_FAILED",
            "lifecycle adoption delivery changed before custody capture",
          );
        }
        ownDelivery.run(
          runId,
          agentId,
          custodyId,
          index + 1,
          delivery.deliveryId,
          delivery.claimGeneration,
          delivery.requesterAgentId,
          delivery.state,
        );
      });
      this.#commandJournal.write(runId, agentId, input.commandId, input, accepted);
    }).immediate();
    this.#fault("lifecycle-rotation:prepared");
    this.#scheduleLifecycleContinuation({
      runId,
      agentId,
      custodyId,
      adapterId,
      actionId,
      authorityId: stringField(source, "authority_id"),
      bridgeContractDigest: stringField(source, "bridge_contract_digest"),
      sourceActionId: stringField(source, "source_action_id"),
      sourceCapabilityHash: stringField(source, "capability_hash"),
      sourceProviderSessionRef: stringField(source, "provider_session_ref"),
      callerActionId: stringField(source, "caller_action_id"),
      targetProviderGeneration,
      targetPrincipalGeneration,
      targetBridgeGeneration,
      stagedCapability,
      stagedCapabilityHash,
      capabilityExpiresAt: numberField(source, "expires_at"),
      providerPayload,
      checkpointSha256: input.checkpoint.sha256,
      launchAttestationChallenge,
      launchAttestationChallengeDigest,
      lifecycleInput: input,
    });
    return accepted;
  }

  async ensureReceiptScope(runId: string, agentId: string): Promise<void> {
    const authority = this.#lifecycleReceiptAuthority;
    if (authority === undefined) return;
    void agentId;
    const source = rowOrNotFound(this.#database.prepare(`
      SELECT session.project_id,run.project_session_id,custody.admission_digest
        FROM runs run
        JOIN project_sessions session ON session.project_session_id=run.project_session_id
        JOIN lifecycle_rotation_custodies custody
          ON custody.run_id=run.run_id
       WHERE run.run_id=?
       ORDER BY custody.created_at,custody.custody_id LIMIT 1
    `).get(runId), "lifecycle receipt scope source");
    const projectId = stringField(source, "project_id");
    const projectSessionId = stringField(source, "project_session_id");
    const admissionDigest = stringField(source, "admission_digest") as LifecycleDigest;
    this.#database.prepare(`
      INSERT OR IGNORE INTO lifecycle_receipt_projects(project_id,authority_id,registered_at)
      VALUES (?,?,?)
    `).run(projectId, authority.authorityId, this.#clock());
    const receiptProject = rowOrNotFound(this.#database.prepare(`
      SELECT authority_id FROM lifecycle_receipt_projects WHERE project_id=?
    `).get(projectId), "lifecycle receipt project");
    if (stringField(receiptProject, "authority_id") !== authority.authorityId) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt project authority crossed");
    }
    const existing = this.#database.prepare(`
      SELECT authority_id,admission_digest FROM lifecycle_admitted_run_scopes
       WHERE project_session_id=? AND run_id=?
    `).get(projectSessionId, runId);
    if (isRow(existing)) {
      if (existing.authority_id !== authority.authorityId || existing.admission_digest !== admissionDigest) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt scope admission crossed");
      }
      return;
    }
    const recorded = this.#database.prepare(`
      SELECT admission_request_id,scope_json,scope_digest,admitted_at,authority_id,admission_digest
        FROM lifecycle_scope_admission_outbox WHERE project_session_id=? AND run_id=?
    `).get(projectSessionId, runId);
    let requestId: string;
    let scopeDigest: LifecycleDigest;
    let scope: LifecycleAdmittedRunScope;
    if (isRow(recorded)) {
      scope = JSON.parse(stringField(recorded, "scope_json")) as LifecycleAdmittedRunScope;
      requestId = stringField(recorded, "admission_request_id");
      scopeDigest = stringField(recorded, "scope_digest") as LifecycleDigest;
      if (
        stringField(recorded, "authority_id") !== authority.authorityId ||
        stringField(recorded, "admission_digest") !== admissionDigest ||
        lifecycleDigest("admitted-scope", scope) !== scopeDigest
      ) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt scope outbox crossed");
      }
    } else {
      scope = {
        schemaVersion: 1,
        projectId,
        projectSessionId,
        runId,
        authorityId: authority.authorityId,
        admissionDigest,
        admittedAt: this.#clock(),
      };
      scopeDigest = lifecycleDigest("admitted-scope", scope) as LifecycleDigest;
      requestId = lifecycleDigest("scope-admission-outbox", { schemaVersion: 1, scopeDigest });
      this.#database.prepare(`
        INSERT INTO lifecycle_scope_admission_outbox(
          admission_request_id,project_id,project_session_id,run_id,authority_id,
          admission_digest,admitted_at,scope_json,scope_digest,created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(
        requestId, projectId, projectSessionId, runId, authority.authorityId,
        admissionDigest, scope.admittedAt, canonicalJson(scope), scopeDigest, this.#clock(),
      );
    }
    let initial: LifecycleAuthenticatedScopeCheckpoint;
    try {
      initial = await authority.admitScope(scope);
    } catch (error: unknown) {
      throw new FabricError("CAPABILITY_UNAVAILABLE", "lifecycle receipt scope admission is pending", { cause: error });
    }
    const initialBody = {
      schemaVersion: 1,
      authorityId: initial.authorityId,
      projectSessionId: initial.projectSessionId,
      runId: initial.runId,
      receiptCountDec: String(initial.receiptCount),
      headAuthoritySequenceDec: String(initial.headAuthoritySequence),
      headReceiptDigest: initial.headReceiptDigest,
      orderedRecordSetDigest: initial.orderedRecordSetDigest,
    };
    if (
      initial.projectSessionId !== projectSessionId || initial.runId !== runId ||
      initial.authorityId !== authority.authorityId || initial.receiptCount !== 0 ||
      initial.headAuthoritySequence !== 0 || initial.headReceiptDigest !== null ||
      initial.orderedRecordSetDigest !== lifecycleDigest("scope-record-set", []) ||
      initial.checkpointDigest !== lifecycleDigest("scope-checkpoint", initialBody) ||
      !await authority.verifyScopeCheckpoint(initial)
    ) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt scope admission returned an invalid zero checkpoint");
    }
    const namespace = await authority.readNamespaceCheckpoint(projectId);
    if (
      namespace.projectId !== projectId || namespace.authorityId !== authority.authorityId ||
      !await authority.verifyNamespaceCheckpoint(namespace)
    ) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt namespace checkpoint is invalid");
    }
    const namespaceMembers: Array<Readonly<{
      projectSessionId: string;
      runId: string;
      authorityId: string;
      scopeCheckpointDigest: LifecycleDigest;
      receiptCountDec: string;
      headReceiptDigest: LifecycleDigest | null;
    }>> = [];
    let afterScopeKey: string | null = null;
    do {
      const page = await authority.readNamespacePageAt(namespace.checkpointDigest, afterScopeKey, 256);
      if (page.orderedScopeHeads.length > 256 || namespaceMembers.length + page.orderedScopeHeads.length > 65_536) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt namespace exceeds its bounded scan");
      }
      for (const head of page.orderedScopeHeads) {
        const pinned = await authority.readScopeCheckpointAt(head.checkpointDigest);
        if (
          canonicalJson(head) !== canonicalJson(pinned) || head.authorityId !== authority.authorityId ||
          !await authority.verifyScopeCheckpoint(head)
        ) {
          throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt namespace contains a crossed scope");
        }
        const key = `${head.projectSessionId}\0${head.runId}`;
        const previous = namespaceMembers.at(-1);
        if (previous !== undefined && key <= `${previous.projectSessionId}\0${previous.runId}`) {
          throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt namespace is not strictly ordered");
        }
        namespaceMembers.push({
          projectSessionId: head.projectSessionId,
          runId: head.runId,
          authorityId: head.authorityId,
          scopeCheckpointDigest: head.checkpointDigest,
          receiptCountDec: String(head.receiptCount),
          headReceiptDigest: head.headReceiptDigest,
        });
      }
      if (page.nextAfter === null) break;
      if (page.orderedScopeHeads.length === 0 || page.nextAfter.length === 0 || page.nextAfter === afterScopeKey) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt namespace pagination crossed");
      }
      afterScopeKey = page.nextAfter;
    } while (true);
    const targetMember = namespaceMembers.find((member) =>
      member.projectSessionId === projectSessionId && member.runId === runId);
    const namespaceBody = {
      schemaVersion: 1,
      authorityId: namespace.authorityId,
      projectId: namespace.projectId,
      scopeCountDec: String(namespace.scopeCount),
      orderedScopeHeadSetDigest: namespace.orderedScopeHeadSetDigest,
    };
    if (
      namespaceMembers.length !== namespace.scopeCount ||
      namespace.orderedScopeHeadSetDigest !== lifecycleDigest("namespace-scope-head-set", namespaceMembers) ||
      namespace.checkpointDigest !== lifecycleDigest("namespace-checkpoint", namespaceBody) ||
      targetMember === undefined || targetMember.scopeCheckpointDigest !== initial.checkpointDigest ||
      targetMember.receiptCountDec !== "0" || targetMember.headReceiptDigest !== null
    ) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt namespace omits the admitted zero scope");
    }
    const resolutionBody = {
      schemaVersion: 1,
      admissionRequestId: requestId,
      scopeDigest,
      initialScopeCheckpoint: initial,
      namespaceCheckpointDigest: namespace.checkpointDigest,
      namespaceMember: targetMember,
      verifiedAt: this.#clock(),
    };
    const resolutionDigest = lifecycleDigest("scope-admission-resolution", resolutionBody);
    this.#database.transaction(() => {
      this.#database.prepare(`INSERT INTO lifecycle_admitted_run_scopes VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
        projectId, projectSessionId, runId, authority.authorityId, admissionDigest,
        scope.admittedAt, requestId, scopeDigest, initial.checkpointDigest, resolutionDigest,
      );
      this.#database.prepare(`INSERT INTO lifecycle_receipt_scope_checkpoints VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        projectSessionId, runId, authority.authorityId, 0, 0, null,
        initial.orderedRecordSetDigest, canonicalJson(initialBody), initial.checkpointDigest,
        initial.attestation, resolutionBody.verifiedAt,
      );
      this.#database.prepare(`INSERT INTO lifecycle_receipt_scope_heads VALUES (?,?,?,1)`).run(
        projectSessionId, runId, initial.checkpointDigest,
      );
      this.#database.prepare(`INSERT OR IGNORE INTO lifecycle_receipt_namespace_checkpoints VALUES (?,?,?,?,?,?,?,?)`).run(
        projectId, authority.authorityId, namespace.scopeCount, namespace.orderedScopeHeadSetDigest,
        canonicalJson(namespaceBody), namespace.checkpointDigest, namespace.attestation, resolutionBody.verifiedAt,
      );
      const insertMember = this.#database.prepare(`
        INSERT OR IGNORE INTO lifecycle_receipt_namespace_members VALUES (?,?,?,?,?,?,?,?,?)
      `);
      namespaceMembers.forEach((member, index) => insertMember.run(
        projectId, namespace.checkpointDigest, index + 1, member.projectSessionId, member.runId,
        member.authorityId, member.scopeCheckpointDigest, Number(member.receiptCountDec), member.headReceiptDigest,
      ));
      const namespaceHead = this.#database.prepare(`
        SELECT checkpoint_digest,head_revision FROM lifecycle_receipt_namespace_heads WHERE project_id=?
      `).get(projectId);
      if (!isRow(namespaceHead)) {
        this.#database.prepare(`INSERT INTO lifecycle_receipt_namespace_heads VALUES (?,?,?,?,?,1)`).run(
          projectId, authority.authorityId, namespace.scopeCount,
          namespace.orderedScopeHeadSetDigest, namespace.checkpointDigest,
        );
      } else if (namespaceHead.checkpoint_digest !== namespace.checkpointDigest) {
        const changed = this.#database.prepare(`
          UPDATE lifecycle_receipt_namespace_heads
             SET authority_id=?,scope_count=?,ordered_scope_head_set_digest=?,checkpoint_digest=?,head_revision=head_revision+1
           WHERE project_id=? AND checkpoint_digest=? AND head_revision=?
        `).run(
          authority.authorityId, namespace.scopeCount, namespace.orderedScopeHeadSetDigest,
          namespace.checkpointDigest, projectId, namespaceHead.checkpoint_digest,
          numberField(namespaceHead, "head_revision"),
        );
        if (changed.changes !== 1) throw new Error("lifecycle receipt namespace head changed");
      }
      this.#database.prepare(`INSERT INTO lifecycle_scope_admission_resolutions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        requestId, projectId, projectSessionId, runId, authority.authorityId,
        admissionDigest, scope.admittedAt, scopeDigest, 0, 0, initial.orderedRecordSetDigest,
        canonicalJson(initialBody), initial.checkpointDigest, 1, namespace.checkpointDigest,
        canonicalJson(targetMember), resolutionBody.verifiedAt, canonicalJson(resolutionBody), resolutionDigest,
      );
    }).immediate();
  }
}

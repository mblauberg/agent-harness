import { createHash } from "node:crypto";

import type Database from "better-sqlite3";

import { LIFECYCLE_CURRENT_STATE_V1_CODEC, type LifecycleCustodyRowV1, type LifecycleCurrentStateV1, type LifecycleGenerationLossRowV1 } from "@local/agent-fabric-protocol";

import { assertProviderActionOwner } from "../application/provider-action-owner.js";
import { ProviderActionAdmissionCoordinator, ProviderActionAdmissionTransactionError, type ProviderActionTicket } from "../application/provider-action-admission.js";
import { assertTaskOperationAdmitted } from "../operator/task-run-admission.js";
import { FabricError } from "../errors.js";
import { CommandJournal } from "../application/command-journal.js";
import { isLifecycleCheckpoint } from "./checkpoint-policy.js";
import type { LifecycleCheckpointPolicy } from "./checkpoint-policy.js";
import { isLifecycleResult } from "./admission.js";
import type { LifecycleAdmission } from "./admission.js";
import type { GenerationLossRepository, GenerationLossSource } from "./generation-loss-repository.js";
import type { LifecycleCheckpoint, LifecycleResult, ProviderActionResult } from "../core/contracts.js";

// Behaviour-preserving extraction of Fabric's public lifecycle entry points (getAgentLifecycle,
// reportProviderState, requestLifecycle) plus the S2b lifecycle-side provider-operation tracker.
// Bodies are unchanged, including the command-journal execute wiring (with the isLifecycleResult
// guard), the same SQL, event emissions, and error codes. Calls back into Fabric-private state
// that stays behind (assertChair, adapterIdForAgent, executeGenericRelease, event emission,
// closing flag) are narrow injected function ports bound to the same Fabric instance, so observed
// behaviour is identical. #activeLifecycleProviderOperations moves here as the only lifecycle-side
// tracker user; its `size`/`pending()` surface mirrors LifecycleContinuation's, and Fabric's close()
// fixpoint spreads `pending()` exactly as it did the raw Set.

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

export class LifecycleService {
  readonly #database: Database.Database;
  readonly #clock: () => number;
  readonly #commandJournal: CommandJournal;
  readonly #checkpointPolicy: LifecycleCheckpointPolicy;
  readonly #admission: LifecycleAdmission;
  readonly #generationLosses: GenerationLossRepository;
  readonly #providerActionAdmission: ProviderActionAdmissionCoordinator;
  readonly #assertChair: (runId: string, actorAgentId: string) => void;
  readonly #adapterIdForAgent: (runId: string, agentId: string) => string;
  readonly #executeGenericRelease: (input: {
    runId: string;
    adapterId: string;
    actionId: string;
    operation: string;
    method: string;
    payload: Record<string, unknown>;
    providerActionTicket: ProviderActionTicket;
  }) => Promise<ProviderActionResult>;
  readonly #event: (runId: string, type: string, actorAgentId: string | null, payload: unknown) => void;
  readonly #isClosing: () => boolean;
  readonly #activeLifecycleProviderOperations = new Set<Promise<void>>();

  constructor(dependencies: Readonly<{
    database: Database.Database;
    clock: () => number;
    commandJournal: CommandJournal;
    checkpointPolicy: LifecycleCheckpointPolicy;
    admission: LifecycleAdmission;
    generationLosses: GenerationLossRepository;
    providerActionAdmission: ProviderActionAdmissionCoordinator;
    assertChair: (runId: string, actorAgentId: string) => void;
    adapterIdForAgent: (runId: string, agentId: string) => string;
    executeGenericRelease: (input: {
      runId: string;
      adapterId: string;
      actionId: string;
      operation: string;
      method: string;
      payload: Record<string, unknown>;
      providerActionTicket: ProviderActionTicket;
    }) => Promise<ProviderActionResult>;
    event: (runId: string, type: string, actorAgentId: string | null, payload: unknown) => void;
    isClosing: () => boolean;
  }>) {
    this.#database = dependencies.database;
    this.#clock = dependencies.clock;
    this.#commandJournal = dependencies.commandJournal;
    this.#checkpointPolicy = dependencies.checkpointPolicy;
    this.#admission = dependencies.admission;
    this.#generationLosses = dependencies.generationLosses;
    this.#providerActionAdmission = dependencies.providerActionAdmission;
    this.#assertChair = dependencies.assertChair;
    this.#adapterIdForAgent = dependencies.adapterIdForAgent;
    this.#executeGenericRelease = dependencies.executeGenericRelease;
    this.#event = dependencies.event;
    this.#isClosing = dependencies.isClosing;
  }

  get size(): number {
    return this.#activeLifecycleProviderOperations.size;
  }

  pending(): IterableIterator<Promise<void>> {
    return this.#activeLifecycleProviderOperations.values();
  }

  async #trackLifecycleProviderOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#isClosing()) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "provider operation cannot start while Fabric is closing");
    }
    let settle = (): void => undefined;
    const tracked = new Promise<void>((resolvePromise) => {
      settle = resolvePromise;
    });
    this.#activeLifecycleProviderOperations.add(tracked);
    try {
      return await operation();
    } finally {
      this.#activeLifecycleProviderOperations.delete(tracked);
      settle();
    }
  }

  getAgentLifecycle(runId: string, agentId: string): LifecycleCurrentStateV1 {
    const agent = rowOrNotFound(
      this.#database.prepare(`
        SELECT a.lifecycle,
               COALESCE(p.provider_session_generation,1) AS provider_session_generation,
               COALESCE(CAST(p.context_revision AS INTEGER),0) AS context_revision,
               COALESCE((
                 SELECT capability.principal_generation FROM capabilities capability
                  WHERE capability.run_id=a.run_id AND capability.agent_id=a.agent_id
                    AND capability.revoked_at IS NULL
                  ORDER BY capability.principal_generation DESC LIMIT 1
               ),1) AS principal_generation,
               COALESCE(bridge.bridge_generation,1) AS bridge_generation
          FROM agents a
          LEFT JOIN provider_state p ON p.run_id=a.run_id AND p.agent_id=a.agent_id
          LEFT JOIN agent_bridge_state bridge
            ON bridge.run_id=a.run_id AND bridge.agent_id=a.agent_id
         WHERE a.run_id=? AND a.agent_id=?
      `).get(runId, agentId),
      "agent",
    );
    const custodySource = this.#database.prepare(`
      SELECT head.current_revision,head.state,head.disposition_code,head.terminal,
             revision.terminal_evidence_digest,
             custody.provider_action_adapter_id,custody.provider_action_id,
             custody.source_provider_generation,custody.source_principal_generation,
             custody.source_bridge_generation,custody.target_provider_generation,
             custody.target_principal_generation,custody.target_bridge_generation,
             custody.checkpoint_digest,custody.custody_id
        FROM lifecycle_rotation_custody_heads head
        JOIN lifecycle_rotation_custodies custody
          ON custody.run_id=head.run_id AND custody.agent_id=head.agent_id
         AND custody.custody_id=head.custody_id
        JOIN lifecycle_rotation_custody_revisions revision
          ON revision.run_id=head.run_id AND revision.agent_id=head.agent_id
         AND revision.custody_id=head.custody_id
         AND revision.revision=head.current_revision
       WHERE head.run_id=? AND head.agent_id=?
       ORDER BY custody.created_at DESC LIMIT 1
    `).get(runId, agentId);
    const lossSource = this.#database.prepare(`
      SELECT head.current_revision,head.state,head.abandon_kind_code,head.terminal,
             revision.terminal_evidence_digest,loss.generation_loss_id,loss.loss_kind,
             loss.old_provider_generation,loss.new_provider_generation,
             loss.old_context_revision,loss.new_context_revision,loss.checkpoint_state,
             loss.checkpoint_digest,loss.loss_evidence_digest,
             revision.recovery_action_adapter_id,revision.recovery_action_id
        FROM lifecycle_generation_loss_heads head
        JOIN lifecycle_generation_losses loss
          ON loss.run_id=head.run_id AND loss.agent_id=head.agent_id
         AND loss.generation_loss_id=head.generation_loss_id
        JOIN lifecycle_generation_loss_revisions revision
          ON revision.run_id=head.run_id AND revision.agent_id=head.agent_id
         AND revision.generation_loss_id=head.generation_loss_id
         AND revision.revision=head.current_revision
       WHERE head.run_id=? AND head.agent_id=?
       ORDER BY loss.created_at DESC LIMIT 1
    `).get(runId, agentId);
    const storedLifecycle = stringField(agent, "lifecycle");
    const lifecycle = storedLifecycle === "context-unreconciled"
      ? "suspended"
      : storedLifecycle === "completion-ready"
        ? "idle"
        : storedLifecycle as LifecycleCurrentStateV1["lifecycle"];
    const custodyCurrentSource = isRow(custodySource) ? {
      schemaVersion: 1 as const,
      sourceKind: "custody" as const,
      agentId,
      custodyId: stringField(custodySource, "custody_id"),
      custodyRevision: numberField(custodySource, "current_revision"),
      actionRef: {
        adapterId: stringField(custodySource, "provider_action_adapter_id"),
        actionId: stringField(custodySource, "provider_action_id"),
      },
      sourceProviderGeneration: numberField(custodySource, "source_provider_generation"),
      sourcePrincipalGeneration: numberField(custodySource, "source_principal_generation"),
      sourceBridgeGeneration: numberField(custodySource, "source_bridge_generation"),
      targetProviderGeneration: numberField(custodySource, "target_provider_generation"),
      targetPrincipalGeneration: numberField(custodySource, "target_principal_generation"),
      targetBridgeGeneration: numberField(custodySource, "target_bridge_generation"),
      checkpointDigest: stringField(custodySource, "checkpoint_digest"),
      state: stringField(custodySource, "state") as LifecycleCustodyRowV1["state"],
      disposition: custodySource.disposition_code === "none"
        ? null
        : stringField(custodySource, "disposition_code") as Exclude<LifecycleCustodyRowV1["disposition"], null>,
      terminalEvidenceDigest: typeof custodySource.terminal_evidence_digest === "string"
        ? custodySource.terminal_evidence_digest
        : null,
    } as LifecycleCustodyRowV1 : null;
    const lossCurrentSource = isRow(lossSource) ? {
      schemaVersion: 1 as const,
      sourceKind: "generation-loss" as const,
      agentId,
      generationLossId: stringField(lossSource, "generation_loss_id"),
      generationLossRevision: numberField(lossSource, "current_revision"),
      lossKind: stringField(lossSource, "loss_kind") as LifecycleGenerationLossRowV1["lossKind"],
      recoveryActionRef: lossSource.recovery_action_id === null
        ? null
        : {
            adapterId: stringField(lossSource, "recovery_action_adapter_id"),
            actionId: stringField(lossSource, "recovery_action_id"),
          },
      abandonKind: stringField(lossSource, "abandon_kind_code") as LifecycleGenerationLossRowV1["abandonKind"],
      state: stringField(lossSource, "state") as LifecycleGenerationLossRowV1["state"],
      disposition: lossSource.state === "recovered-adopted"
        ? "recovered-adopted" as const
        : lossSource.state === "abandoned"
          ? "abandoned" as const
          : null,
      oldProviderGeneration: numberField(lossSource, "old_provider_generation"),
      newProviderGeneration: numberField(lossSource, "new_provider_generation"),
      oldContextRevision: typeof lossSource.old_context_revision === "number"
        ? lossSource.old_context_revision
        : null,
      newContextRevision: numberField(lossSource, "new_context_revision"),
      checkpointState: stringField(lossSource, "checkpoint_state") as LifecycleGenerationLossRowV1["checkpointState"],
      checkpointDigest: typeof lossSource.checkpoint_digest === "string" ? lossSource.checkpoint_digest : null,
      lossEvidenceDigest: stringField(lossSource, "loss_evidence_digest"),
      terminalEvidenceDigest: typeof lossSource.terminal_evidence_digest === "string"
        ? lossSource.terminal_evidence_digest
        : null,
    } as LifecycleGenerationLossRowV1 : null;
    const custodyIsNonfinal = isRow(custodySource) && numberField(custodySource, "terminal") === 0;
    const lossIsNonfinal = isRow(lossSource) && numberField(lossSource, "terminal") === 0;
    const currentSource = custodyIsNonfinal
      ? custodyCurrentSource
      : lossIsNonfinal
        ? lossCurrentSource
        : custodyCurrentSource ?? lossCurrentSource;
    const sourceIsNonfinal = custodyIsNonfinal;
    const state = {
      schemaVersion: 1 as const,
      kind: "current-state" as const,
      agentId,
      lifecycle,
      contextState: storedLifecycle === "context-unreconciled"
        ? "context-unreconciled" as const
        : "current" as const,
      principalGeneration: sourceIsNonfinal
        ? numberField(custodySource, "source_principal_generation")
        : numberField(agent, "principal_generation"),
      providerSessionGeneration: sourceIsNonfinal
        ? numberField(custodySource, "source_provider_generation")
        : numberField(agent, "provider_session_generation"),
      bridgeGeneration: sourceIsNonfinal
        ? numberField(custodySource, "source_bridge_generation")
        : numberField(agent, "bridge_generation"),
      contextRevision: numberField(agent, "context_revision"),
      currentSource,
    };
    return LIFECYCLE_CURRENT_STATE_V1_CODEC.parse({
      ...state,
      stateDigest: sha256Digest(canonicalJson(state)),
    }, "lifecycleCurrentState");
  }

  reportProviderState(
    runId: string,
    actorAgentId: string,
    input: {
      sourceEventId: string;
      providerSessionRef: string;
      agentId: string;
      providerSessionGeneration: number;
      contextRevision: number;
      evidenceDigest: `sha256:${string}`;
      checkpointSha256?: string;
      commandId: string;
    },
  ): LifecycleResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isLifecycleResult, () => {
      this.#assertChair(runId, actorAgentId);
      const checkpointValidated = input.checkpointSha256 !== undefined &&
        this.#checkpointPolicy.hasCurrentValidated(runId, input.agentId, input.checkpointSha256);
      const source = rowOrNotFound(this.#database.prepare(`
        SELECT run.project_session_id,run.chair_agent_id,run.revision AS run_revision,
               run.chair_generation,session.generation AS session_generation,
               agent.provider_session_ref,
               COALESCE(chair_bridge.provider_adapter_id,child_bridge.adapter_id) AS adapter_id,
               COALESCE(chair_bridge.provider_action_id,child_bridge.action_id) AS action_id,
               COALESCE(chair_bridge.bridge_generation,child_bridge.bridge_generation) AS bridge_generation,
               COALESCE(chair_bridge.revision,child_bridge.revision) AS bridge_revision,
               COALESCE(chair_bridge.capability_hash,child_bridge.capability_hash) AS capability_hash,
               COALESCE(chair_bridge.provider_contract_digest,custody.bridge_contract_digest) AS bridge_contract_digest,
               capability.principal_generation
          FROM runs run
          JOIN project_sessions session ON session.project_session_id=run.project_session_id
          JOIN agents agent ON agent.run_id=run.run_id AND agent.agent_id=?
          LEFT JOIN launched_chair_bridge_state chair_bridge
            ON chair_bridge.project_session_id=run.project_session_id
           AND chair_bridge.coordination_run_id=run.run_id
           AND chair_bridge.chair_agent_id=agent.agent_id
           AND run.chair_agent_id=agent.agent_id AND chair_bridge.state='active'
          LEFT JOIN agent_bridge_state child_bridge
            ON child_bridge.run_id=agent.run_id AND child_bridge.agent_id=agent.agent_id
           AND run.chair_agent_id<>agent.agent_id AND child_bridge.bridge_state='active'
          LEFT JOIN provider_agent_custody custody
            ON custody.run_id=child_bridge.run_id AND custody.adapter_id=child_bridge.adapter_id
           AND custody.action_id=child_bridge.action_id AND custody.target_agent_id=child_bridge.agent_id
          JOIN capabilities capability
            ON capability.token_hash=COALESCE(chair_bridge.capability_hash,child_bridge.capability_hash)
           AND capability.run_id=run.run_id AND capability.agent_id=agent.agent_id
           AND capability.revoked_at IS NULL
         WHERE run.run_id=?
           AND (
             (run.chair_agent_id=agent.agent_id AND chair_bridge.chair_agent_id IS NOT NULL
              AND chair_bridge.provider_session_ref=agent.provider_session_ref)
             OR
             (run.chair_agent_id<>agent.agent_id AND child_bridge.agent_id IS NOT NULL
              AND child_bridge.provider_session_ref=agent.provider_session_ref
              AND custody.action_id IS NOT NULL)
           )
      `).get(input.agentId, runId), "provider context observation source");
      const checkpointRow = checkpointValidated
        ? rowOrNotFound(this.#database.prepare(`
            SELECT relative_path FROM lifecycle_checkpoints
             WHERE run_id=? AND agent_id=? AND sha256=?
             ORDER BY created_at DESC LIMIT 1
          `).get(runId, input.agentId, input.checkpointSha256), "provider context checkpoint")
        : null;
      const chairSource = source.chair_agent_id === input.agentId;
      const lossSource: GenerationLossSource = {
        oldProviderSessionRef: stringField(source, "provider_session_ref"),
        newProviderSessionRef: input.providerSessionRef,
        sourceActionRef: {
          adapterId: stringField(source, "adapter_id"),
          actionId: stringField(source, "action_id"),
        },
        sourceAdapterContractDigest: stringField(source, "bridge_contract_digest"),
        sourcePrincipalGeneration: numberField(source, "principal_generation"),
        sourceBridgeGeneration: numberField(source, "bridge_generation"),
        bridgeOwnerKind: chairSource ? "chair" : "child",
        sourceBridgeRowId: `${runId}:${input.agentId}`,
        sourceBridgeRevision: numberField(source, "bridge_revision"),
        sourceCapabilityHash: stringField(source, "capability_hash"),
        sourceProjectSessionGeneration: chairSource ? numberField(source, "session_generation") : null,
        sourceRunGeneration: chairSource ? numberField(source, "run_revision") : null,
        sourceChairLeaseGeneration: chairSource ? numberField(source, "chair_generation") : null,
        checkpoint: checkpointRow === null
          ? input.checkpointSha256 === undefined
            ? { state: "absent", ref: null, digest: null }
            : { state: "invalid", ref: null, digest: null }
          : {
              state: "last-validated",
              ref: stringField(checkpointRow, "relative_path"),
              digest: `sha256:${input.checkpointSha256 as string}`,
            },
      };
      const observation = this.#generationLosses.recordObservationInCurrentTransaction({
        sourceEventId: input.sourceEventId,
        projectSessionId: stringField(source, "project_session_id"),
        runId,
        agentId: input.agentId,
        providerGeneration: input.providerSessionGeneration,
        contextRevision: input.contextRevision,
        evidenceDigest: input.evidenceDigest,
        observedAt: this.#clock(),
        lossSource,
      });
      const advanced = observation.classification === "generation-advance" ||
        observation.classification === "context-advance";
      if (advanced) {
        const provider = this.#database.prepare(`
          UPDATE provider_state
             SET provider_session_generation=?,context_revision=?,reconciled_checkpoint_sha256=?
           WHERE run_id=? AND agent_id=?
        `).run(
          input.providerSessionGeneration,
          input.contextRevision,
          checkpointValidated ? input.checkpointSha256 : null,
          runId,
          input.agentId,
        );
        if (provider.changes !== 1) throw new Error("provider context state changed before loss commit");
        const agent = this.#database.prepare(`
          UPDATE agents SET lifecycle='context-unreconciled',provider_session_ref=?
           WHERE run_id=? AND agent_id=?
        `).run(input.providerSessionRef, runId, input.agentId);
        if (agent.changes !== 1) throw new Error("provider context agent changed before loss commit");
        this.#database.prepare(`
          INSERT INTO delivery_freezes(run_id, agent_id, reason, created_at)
          VALUES (?, ?, 'context-unreconciled', ?)
          ON CONFLICT(run_id, agent_id)
          DO UPDATE SET reason=excluded.reason, created_at=excluded.created_at
        `).run(runId, input.agentId, this.#clock());
        this.#database.prepare(`
          UPDATE leases SET status='quarantined', updated_at=?
           WHERE run_id=? AND holder_agent_id=? AND status='active'
        `).run(this.#clock(), runId, input.agentId);
        this.#database.prepare(`
          UPDATE provider_session_turn_leases SET status='quarantined', updated_at=?
           WHERE run_id=? AND agent_id=? AND status='active'
        `).run(this.#clock(), runId, input.agentId);
      }
      const result = this.getAgentLifecycle(runId, input.agentId);
      this.#event(runId, "provider-state-reported", actorAgentId, { ...result, observation });
      return result;
    });
  }

  async requestLifecycle(
    runId: string,
    actorAgentId: string,
    input: {
      action: "compact" | "rotate" | "completion-ready" | "release";
      agentId: string;
      taskId: string;
      taskRevision: number;
      checkpoint: LifecycleCheckpoint;
      commandId: string;
    },
  ): Promise<LifecycleResult> {
    return await this.#trackLifecycleProviderOperation(
      async () => await this.#requestLifecycle(runId, actorAgentId, input),
    );
  }

  async #requestLifecycle(
    runId: string,
    actorAgentId: string,
    input: {
      action: "compact" | "rotate" | "completion-ready" | "release";
      agentId: string;
      taskId: string;
      taskRevision: number;
      checkpoint: LifecycleCheckpoint;
      commandId: string;
    },
  ): Promise<LifecycleResult> {
    if (input.action === "compact" || input.action === "rotate") {
      const owned = this.#database.prepare(`
        SELECT provider_action_adapter_id AS adapter_id,provider_action_id AS action_id
          FROM lifecycle_rotation_custodies
         WHERE run_id=? AND command_id=?
      `).get(runId, input.commandId);
      if (isRow(owned)) {
        assertProviderActionOwner(this.#database, {
          runId,
          adapterId: stringField(owned, "adapter_id"),
          actionId: stringField(owned, "action_id"),
        }, "lifecycle");
      }
    } else if (input.action === "release") {
      const release = this.#database.prepare(`
        SELECT action.adapter_id
          FROM provider_actions action
          JOIN agent_adapter_bindings binding
            ON binding.run_id=action.run_id AND binding.agent_id=?
           AND binding.adapter_id=action.adapter_id
         WHERE action.run_id=? AND action.action_id=?
      `).get(input.agentId, runId, `${input.commandId}:release`);
      if (isRow(release)) {
        assertProviderActionOwner(this.#database, {
          runId,
          adapterId: stringField(release, "adapter_id"),
          actionId: `${input.commandId}:release`,
        }, "generic");
      }
    }
    const replay = this.#commandJournal.read(runId, actorAgentId, input.commandId, input, isLifecycleResult);
    if (replay !== undefined) return replay;
    assertTaskOperationAdmitted(this.#database, runId, input.taskId);
    if (actorAgentId !== input.agentId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "agents may request lifecycle changes only for themselves");
    }
    if (!isLifecycleCheckpoint(input.checkpoint)) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "lifecycle checkpoint lacks a portable recovery field");
    }
    if (
      this.getAgentLifecycle(runId, input.agentId).contextState === "context-unreconciled" &&
      input.action !== "rotate"
    ) {
      throw new FabricError("CONTEXT_UNRECONCILED", "unreconciled provider context requires explicit rotation");
    }
    this.#checkpointPolicy.verifyAndRecord(runId, input.agentId, input.taskId, input.taskRevision, input.checkpoint);

    if (input.action === "completion-ready") {
      this.#database.prepare("UPDATE agents SET lifecycle = 'completion-ready' WHERE run_id = ? AND agent_id = ?").run(
        runId,
        actorAgentId,
      );
      const result = this.getAgentLifecycle(runId, actorAgentId);
      this.#checkpointPolicy.recordOperation(runId, input, null, null);
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }

    if (input.action === "release") {
      this.#checkpointPolicy.assertReleaseReady(runId, actorAgentId, input.taskId);
      const agent = rowOrNotFound(
        this.#database.prepare("SELECT provider_session_ref FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, actorAgentId),
        "agent",
      );
      const resumeReference = typeof agent.provider_session_ref === "string" ? agent.provider_session_ref : null;
      if (resumeReference === null) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "provider release requires a bound session reference");
      }
      const adapterId = this.#adapterIdForAgent(runId, actorAgentId);
      const state = this.getAgentLifecycle(runId, actorAgentId);
      const actionId = `${input.commandId}:release`;
      const payload = { agentId: actorAgentId, resumeReference, generation: state.providerSessionGeneration };
      const providerActionTicket = this.#providerActionAdmission.preflightAgentAction({
        runId,
        actorAgentId,
        actionRef: { adapterId, actionId },
        canonicalInput: {
          schemaVersion: 1,
          owner: "lifecycle-release",
          operation: "release",
          payload,
        },
      });
      let action: ProviderActionResult;
      try {
        action = await this.#executeGenericRelease({
          runId,
          adapterId,
          actionId,
          operation: "release",
          method: "release",
          payload,
          providerActionTicket,
        });
      } catch (error: unknown) {
        const actionExists = this.#database.prepare(`
          SELECT 1 FROM provider_actions WHERE run_id=? AND adapter_id=? AND action_id=?
        `).get(runId, adapterId, actionId) !== undefined;
        if (
          providerActionTicket.disposition === "resolving" && !actionExists &&
          !(error instanceof ProviderActionAdmissionTransactionError)
        ) {
          this.#providerActionAdmission.release(providerActionTicket, error);
        }
        throw error;
      }
      if (!isRow(action.result) || action.result.released !== true || action.result.deleted === true) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "adapter did not prove non-destructive release");
      }
      return this.#database.transaction(() => {
        this.#database.prepare(`
          UPDATE capabilities SET revoked_at=COALESCE(revoked_at,?) WHERE run_id=? AND agent_id=?
        `).run(this.#clock(), runId, actorAgentId);
        this.#database.prepare("UPDATE agents SET lifecycle = 'archived' WHERE run_id = ? AND agent_id = ?").run(
          runId,
          actorAgentId,
        );
        const bridgeState = this.#database.prepare(`
          SELECT bridge_state FROM agent_bridge_state WHERE run_id=? AND agent_id=?
        `).get(runId, actorAgentId);
        if (isRow(bridgeState) && bridgeState.bridge_state === "active") {
          const bridge = this.#database.prepare(`
            UPDATE agent_bridge_state
               SET bridge_state='none',provider_session_ref=NULL,provider_session_generation=NULL,
                   capability_hash=NULL,activation_evidence_digest=NULL,
                   revision=revision+1,updated_at=?
             WHERE run_id=? AND agent_id=? AND bridge_state='active'
          `).run(this.#clock(), runId, actorAgentId);
          if (bridge.changes !== 1) {
            throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "retained child bridge changed during release");
          }
        } else if (isRow(bridgeState) && bridgeState.bridge_state !== "none") {
          throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "provider release requires recovered child bridge custody");
        }
        const result = this.getAgentLifecycle(runId, actorAgentId);
        this.#checkpointPolicy.recordOperation(runId, input, resumeReference, null);
        this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
        return result;
      })();
    }

    if (input.action !== "compact" && input.action !== "rotate") {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "unsupported lifecycle rotation action");
    }
    return this.#admission.acceptRotation(runId, actorAgentId, {
      ...input,
      action: input.action,
    });
  }
}

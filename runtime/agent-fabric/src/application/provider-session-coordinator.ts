import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import type Database from "better-sqlite3";

import { resolveRunArtifactRoot } from "../artifacts/run-root.js";
import { FabricError } from "../errors.js";

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function row(value: unknown, label: string): Row {
  if (!isRow(value)) {
    throw new FabricError("NOT_FOUND", `${label} was not found`);
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRow(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new TypeError("provider payload is not JSON-compatible");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type ProviderRegistrationIntent = {
  runId: string;
  actorAgentId: string;
  agentId: string;
  authorityId: string;
  adapterId: string;
  providerSessionRef?: string;
};

export type ProviderActionIdentity = {
  runId: string;
  actionId: string;
  adapterId: string;
  operation: string;
  identityHash: string;
  targetAgentId?: string;
  providerSessionGeneration?: number;
};

export type ProviderSessionTarget = {
  agentId: string;
  adapterId: string;
  resumeReference: string;
  providerSessionGeneration: number;
};

export type ProviderTurnAdmission = {
  target: ProviderSessionTarget;
  turnLeaseGeneration: number;
  payload: Record<string, unknown>;
};

export type ProviderLifecycleIntent = {
  runId: string;
  actionId: string;
  operation: "spawn" | "attach";
  actorAgentId: string;
  targetAgentId: string;
  authorityId: string;
  adapterId: string;
  requestedResumeReference?: string;
  intentHash: string;
};

export type RecoverableLifecycleIntent = Omit<ProviderLifecycleIntent, "intentHash"> & {
  providerResumeReference: string;
};

export type ModelRoutingEvidenceInput = {
  evidenceId: string;
  actionId: string;
  relativePath: string;
  sha256: string;
};

export type CrossFamilyReviewEvidenceInput = {
  evidenceId: string;
  reviewerAgentId: string;
  providerFamily: string;
  status: string;
  independent: boolean;
  relativePath: string;
  sha256: string;
};

/**
 * Canonical application owner for provider-session admission and fencing.
 * Provider I/O remains outside SQLite transactions; this coordinator makes
 * every admissibility decision and durable intent before that I/O begins.
 */
export class ProviderSessionCoordinator {
  readonly #database: Database.Database;
  readonly #clock: () => number;
  readonly #maximumConcurrentTurns: number;

  constructor(input: {
    database: Database.Database;
    clock: () => number;
    maximumConcurrentTurns: number;
  }) {
    if (!Number.isInteger(input.maximumConcurrentTurns) || input.maximumConcurrentTurns < 1) {
      throw new TypeError("maximumConcurrentTurns must be a positive integer");
    }
    this.#database = input.database;
    this.#clock = input.clock;
    this.#maximumConcurrentTurns = input.maximumConcurrentTurns;
  }

  preflightRegistration(input: ProviderRegistrationIntent): void {
    const authority = row(
      this.#database
        .prepare("SELECT parent_authority_id FROM authorities WHERE run_id = ? AND authority_id = ?")
        .get(input.runId, input.authorityId),
      "provider authority",
    );
    const actor = row(
      this.#database
        .prepare("SELECT authority_id FROM agents WHERE run_id = ? AND agent_id = ?")
        .get(input.runId, input.actorAgentId),
      "provider actor",
    );
    if (authority.parent_authority_id !== actor.authority_id) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "actor cannot register an agent for this authority");
    }

    const existing = this.#database.prepare(`
      SELECT g.parent_agent_id, g.authority_id, g.provider_session_ref, b.adapter_id
        FROM agents g
        LEFT JOIN agent_adapter_bindings b ON b.run_id = g.run_id AND b.agent_id = g.agent_id
       WHERE g.run_id = ? AND g.agent_id = ?
    `).get(input.runId, input.agentId);
    if (!isRow(existing)) return;
    const sameIdentity = existing.parent_agent_id === input.actorAgentId &&
      existing.authority_id === input.authorityId;
    if (
      sameIdentity &&
      existing.provider_session_ref === null &&
      existing.adapter_id === null
    ) return;
    const same = sameIdentity &&
      (input.providerSessionRef === undefined || existing.provider_session_ref === input.providerSessionRef) &&
      existing.adapter_id === input.adapterId;
    if (!same) {
      throw new FabricError("DEDUPE_CONFLICT", "agent ID was reused with changed provider registration input");
    }
  }

  prepareLifecycleIntent(input: ProviderLifecycleIntent): void {
    const existing = this.#database.prepare(`
      SELECT operation, actor_agent_id, target_agent_id, authority_id, adapter_id,
             requested_resume_reference, intent_hash
        FROM provider_lifecycle_intents WHERE run_id = ? AND action_id = ?
    `).get(input.runId, input.actionId);
    if (isRow(existing)) {
      const same = existing.operation === input.operation &&
        existing.actor_agent_id === input.actorAgentId &&
        existing.target_agent_id === input.targetAgentId &&
        existing.authority_id === input.authorityId &&
        existing.adapter_id === input.adapterId &&
        existing.requested_resume_reference === (input.requestedResumeReference ?? null) &&
        existing.intent_hash === input.intentHash;
      if (!same) throw new FabricError("DEDUPE_CONFLICT", "lifecycle action ID was reused with changed intent");
      return;
    }
    const now = this.#clock();
    this.#database.prepare(`
      INSERT INTO provider_lifecycle_intents(
        run_id, action_id, operation, actor_agent_id, target_agent_id,
        authority_id, adapter_id, requested_resume_reference, intent_hash,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'prepared', ?, ?)
    `).run(
      input.runId,
      input.actionId,
      input.operation,
      input.actorAgentId,
      input.targetAgentId,
      input.authorityId,
      input.adapterId,
      input.requestedResumeReference ?? null,
      input.intentHash,
      now,
      now,
    );
  }

  markLifecycleProviderTerminal(runId: string, actionId: string, providerResumeReference: string): void {
    this.#database.prepare(`
      UPDATE provider_lifecycle_intents
         SET status = 'provider-terminal', provider_resume_reference = ?, updated_at = ?
       WHERE run_id = ? AND action_id = ? AND status != 'finalized'
    `).run(providerResumeReference, this.#clock(), runId, actionId);
  }

  finalizeLifecycleIntent(runId: string, actionId: string): void {
    this.#database.prepare(`
      UPDATE provider_lifecycle_intents SET status = 'finalized', updated_at = ?
       WHERE run_id = ? AND action_id = ?
    `).run(this.#clock(), runId, actionId);
  }

  recoverableLifecycleIntents(): RecoverableLifecycleIntent[] {
    return this.#database.prepare(`
      SELECT i.run_id, i.action_id, i.operation, i.actor_agent_id, i.target_agent_id,
             i.authority_id, i.adapter_id, i.requested_resume_reference,
             i.provider_resume_reference, p.status AS action_status, p.result_json
        FROM provider_lifecycle_intents i
        LEFT JOIN provider_actions p ON p.run_id = i.run_id AND p.action_id = i.action_id
       WHERE i.status IN ('prepared', 'provider-terminal')
       ORDER BY i.created_at, i.action_id
    `).all().flatMap((value): RecoverableLifecycleIntent[] => {
      const item = row(value, "recoverable lifecycle intent");
      if (
        typeof item.run_id !== "string" || typeof item.action_id !== "string" ||
        (item.operation !== "spawn" && item.operation !== "attach") ||
        typeof item.actor_agent_id !== "string" || typeof item.target_agent_id !== "string" ||
        typeof item.authority_id !== "string" || typeof item.adapter_id !== "string"
      ) throw new Error("recoverable lifecycle intent is invalid");
      let providerResumeReference = typeof item.provider_resume_reference === "string"
        ? item.provider_resume_reference
        : undefined;
      if (providerResumeReference === undefined && item.action_status === "terminal" && typeof item.result_json === "string") {
        const result: unknown = JSON.parse(item.result_json);
        if (isRow(result) && typeof result.resumeReference === "string") {
          providerResumeReference = result.resumeReference;
        } else if (item.operation === "attach" && typeof item.requested_resume_reference === "string") {
          providerResumeReference = item.requested_resume_reference;
        }
      }
      if (providerResumeReference === undefined) return [];
      this.markLifecycleProviderTerminal(item.run_id, item.action_id, providerResumeReference);
      return [{
        runId: item.run_id,
        actionId: item.action_id,
        operation: item.operation,
        actorAgentId: item.actor_agent_id,
        targetAgentId: item.target_agent_id,
        authorityId: item.authority_id,
        adapterId: item.adapter_id,
        ...(typeof item.requested_resume_reference === "string"
          ? { requestedResumeReference: item.requested_resume_reference }
          : {}),
        providerResumeReference,
      }];
    });
  }

  recordModelRoutingEvidence(runId: string, input: ModelRoutingEvidenceInput): void {
    const bytes = this.#publishedArtifactBytes(runId, input.relativePath, input.sha256);
    const receipt: unknown = JSON.parse(bytes.toString("utf8"));
    if (!isRow(receipt) || receipt.schema_version !== 1 || typeof receipt.status !== "string") {
      throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", "model routing evidence is not a version 1 router receipt");
    }
    const action = row(this.#database.prepare(`
      SELECT adapter_id, status FROM provider_actions WHERE run_id = ? AND action_id = ?
    `).get(runId, input.actionId), "routed provider action");
    if (typeof receipt.adapter !== "string" || action.adapter_id !== receipt.adapter || action.status !== "terminal") {
      throw new FabricError("ADAPTER_COMPATIBILITY_INVALID", "router receipt does not match a terminal provider action");
    }
    const receiptJson = canonicalJson(receipt);
    const existing = this.#database.prepare(`
      SELECT action_id, relative_path, sha256, receipt_json
        FROM model_routing_evidence WHERE run_id = ? AND evidence_id = ?
    `).get(runId, input.evidenceId);
    if (isRow(existing)) {
      if (
        existing.action_id !== input.actionId || existing.relative_path !== input.relativePath ||
        existing.sha256 !== input.sha256 || existing.receipt_json !== receiptJson
      ) throw new FabricError("DEDUPE_CONFLICT", "model routing evidence ID was reused with changed input");
      return;
    }
    this.#database.prepare(`
      INSERT INTO model_routing_evidence(
        evidence_id, run_id, action_id, relative_path, sha256, receipt_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(input.evidenceId, runId, input.actionId, input.relativePath, input.sha256, receiptJson, this.#clock());
  }

  recordCrossFamilyReviewEvidence(runId: string, input: CrossFamilyReviewEvidenceInput): void {
    this.#publishedArtifactBytes(runId, input.relativePath, input.sha256);
    const reviewer = this.#database.prepare(
      "SELECT 1 FROM agents WHERE run_id = ? AND agent_id = ?",
    ).get(runId, input.reviewerAgentId);
    if (!isRow(reviewer)) throw new FabricError("NOT_FOUND", "reviewer agent was not registered");
    const artifact = row(this.#database.prepare(`
      SELECT artifact_id, publisher_agent_id FROM artifacts
       WHERE run_id = ? AND relative_path = ? AND sha256 = ? AND registry_state='active'
    `).get(runId, input.relativePath, `sha256:${input.sha256}`), "review artifact");
    if (input.independent && artifact.publisher_agent_id === input.reviewerAgentId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "reviewer cannot certify its own published artifact as independent");
    }
    const existing = this.#database.prepare(`
      SELECT reviewer_agent_id, provider_family, status, independent, relative_path, sha256
        FROM cross_family_review_evidence WHERE run_id = ? AND evidence_id = ?
    `).get(runId, input.evidenceId);
    if (isRow(existing)) {
      const same = existing.reviewer_agent_id === input.reviewerAgentId &&
        existing.provider_family === input.providerFamily && existing.status === input.status &&
        existing.independent === (input.independent ? 1 : 0) &&
        existing.relative_path === input.relativePath && existing.sha256 === input.sha256;
      if (!same) throw new FabricError("DEDUPE_CONFLICT", "review evidence ID was reused with changed input");
      return;
    }
    this.#database.prepare(`
      INSERT INTO cross_family_review_evidence(
        evidence_id, run_id, reviewer_agent_id, provider_family, status,
        independent, relative_path, sha256, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.evidenceId,
      runId,
      input.reviewerAgentId,
      input.providerFamily,
      input.status,
      input.independent ? 1 : 0,
      input.relativePath,
      input.sha256,
      this.#clock(),
    );
    this.#database.prepare(`
      UPDATE artifacts SET evidence_kind='review', revision=revision+1
       WHERE artifact_id=? AND evidence_kind='artifact'
    `).run(artifact.artifact_id);
  }

  #publishedArtifactBytes(runId: string, relativePath: string, digest: string): Buffer {
    if (
      relativePath.length === 0 || isAbsolute(relativePath) ||
      relativePath.split(/[\\/]/u).includes("..") || !/^[0-9a-f]{64}$/u.test(digest)
    ) throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "evidence artifact reference is invalid");
    const root = resolveRunArtifactRoot(this.#database, runId);
    if (root.artifactRoot === null) {
      throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "evidence run has no project directory");
    }
    const artifact = this.#database.prepare(`
      SELECT source_kind FROM artifacts
       WHERE run_id = ? AND relative_path = ? AND sha256 = ? AND registry_state='active'
    `).get(runId, relativePath, `sha256:${digest}`);
    if (!isRow(artifact)) throw new FabricError("ADAPTER_ARTIFACT_MISSING", "evidence artifact is not published");
    const sourceRoot = artifact.source_kind === "project-file" ? root.projectRoot : root.artifactRoot;
    const bytes = readFileSync(join(sourceRoot, relativePath));
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== digest) throw new FabricError("ARTIFACT_DIGEST_INVALID", "evidence artifact digest changed");
    return bytes;
  }

  assertActionIdentity(input: ProviderActionIdentity): boolean {
    const existing = this.#database.prepare(`
      SELECT adapter_id, operation, identity_hash, target_agent_id,
             provider_session_generation
        FROM provider_actions
       WHERE run_id = ? AND action_id = ?
    `).get(input.runId, input.actionId);
    if (!isRow(existing)) return false;
    const matches = existing.adapter_id === input.adapterId &&
      existing.operation === input.operation &&
      existing.identity_hash === input.identityHash &&
      existing.target_agent_id === (input.targetAgentId ?? null) &&
      existing.provider_session_generation === (input.providerSessionGeneration ?? null);
    if (!matches) {
      throw new FabricError(
        "DEDUPE_CONFLICT",
        "provider action ID was reused with changed adapter, operation, target, generation or payload",
      );
    }
    return true;
  }

  resolveTarget(
    runId: string,
    adapterId: string,
    payload: Record<string, unknown>,
  ): ProviderSessionTarget | undefined {
    let agentId = typeof payload.agentId === "string" ? payload.agentId : undefined;
    if (agentId === undefined && typeof payload.taskId === "string") {
      const task = this.#database
        .prepare("SELECT owner_agent_id FROM tasks WHERE run_id = ? AND task_id = ?")
        .get(runId, payload.taskId);
      if (isRow(task) && typeof task.owner_agent_id === "string") agentId = task.owner_agent_id;
    }
    if (agentId === undefined && typeof payload.resumeReference === "string") {
      const agent = this.#database.prepare(`
        SELECT a.agent_id
          FROM agents a
          JOIN agent_adapter_bindings b ON b.run_id = a.run_id AND b.agent_id = a.agent_id
         WHERE a.run_id = ? AND a.provider_session_ref = ? AND b.adapter_id = ?
      `).get(runId, payload.resumeReference, adapterId);
      if (isRow(agent) && typeof agent.agent_id === "string") agentId = agent.agent_id;
    }
    if (agentId === undefined) return undefined;

    const target = row(this.#database.prepare(`
      SELECT a.provider_session_ref, b.adapter_id,
             COALESCE(p.provider_session_generation, 1) AS provider_session_generation
        FROM agents a
        JOIN agent_adapter_bindings b ON b.run_id = a.run_id AND b.agent_id = a.agent_id
        LEFT JOIN provider_state p ON p.run_id = a.run_id AND p.agent_id = a.agent_id
       WHERE a.run_id = ? AND a.agent_id = ?
    `).get(runId, agentId), "provider session target");
    if (target.adapter_id !== adapterId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "provider action adapter does not match the agent binding");
    }
    if (typeof target.provider_session_ref !== "string") {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "provider action target has no resume reference");
    }
    if (typeof target.provider_session_generation !== "number") {
      throw new Error("provider session generation is invalid");
    }
    const expectedGeneration = payload.providerSessionGeneration;
    if (expectedGeneration !== undefined && expectedGeneration !== target.provider_session_generation) {
      throw new FabricError("STALE_LEASE_GENERATION", "provider session generation changed before dispatch");
    }
    if (typeof payload.resumeReference === "string" && payload.resumeReference !== target.provider_session_ref) {
      throw new FabricError("STALE_LEASE_GENERATION", "provider resume reference changed before dispatch");
    }
    return {
      agentId,
      adapterId,
      resumeReference: target.provider_session_ref,
      providerSessionGeneration: target.provider_session_generation,
    };
  }

  prepareTurnAction(input: {
    runId: string;
    actionId: string;
    adapterId: string;
    operation: "send_turn";
    identityHash: string;
    target: ProviderSessionTarget;
    payload: Record<string, unknown>;
  }): ProviderTurnAdmission {
    return this.#database.transaction(() => {
      const unresolvedForSession = this.#database.prepare(`
        SELECT turn_lease_generation, status
          FROM provider_session_turn_leases
         WHERE run_id = ? AND agent_id = ? AND status IN ('active', 'quarantined')
      `).get(input.runId, input.target.agentId);
      if (isRow(unresolvedForSession)) {
        throw new FabricError("PROVIDER_TURN_ACTIVE", "provider session already has an unresolved turn");
      }
      const unresolvedCount = row(this.#database.prepare(`
        SELECT COUNT(*) AS count
          FROM provider_session_turn_leases
         WHERE run_id = ? AND status IN ('active', 'quarantined')
      `).get(input.runId), "provider turn count");
      if (typeof unresolvedCount.count !== "number" || unresolvedCount.count >= this.#maximumConcurrentTurns) {
        throw new FabricError("PROVIDER_TURN_ACTIVE", "maximum concurrent provider turns reached");
      }
      const generationRow = row(this.#database.prepare(`
        SELECT COALESCE(MAX(turn_lease_generation), 0) + 1 AS generation
          FROM provider_session_turn_leases
         WHERE run_id = ? AND agent_id = ?
      `).get(input.runId, input.target.agentId), "provider turn generation");
      if (typeof generationRow.generation !== "number") throw new Error("provider turn generation is invalid");
      const generation = generationRow.generation;
      const now = this.#clock();
      const enrichedPayload = {
        ...input.payload,
        agentId: input.target.agentId,
        resumeReference: input.target.resumeReference,
        providerSessionGeneration: input.target.providerSessionGeneration,
        turnLeaseGeneration: generation,
      };
      const payloadJson = canonicalJson(enrichedPayload);
      this.#database.prepare(`
        INSERT INTO provider_actions(
          run_id, action_id, adapter_id, operation, target_agent_id,
          provider_session_generation, turn_lease_generation, identity_hash,
          payload_hash, payload_json, status, history_json, execution_count,
          effect_count, idempotency_proven, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'prepared', '["prepared"]', 0, 0, 0, ?)
      `).run(
        input.runId,
        input.actionId,
        input.adapterId,
        input.operation,
        input.target.agentId,
        input.target.providerSessionGeneration,
        generation,
        input.identityHash,
        sha256(payloadJson),
        payloadJson,
        now,
      );
      this.#database.prepare(`
        INSERT INTO provider_session_turn_leases(
          run_id, agent_id, provider_session_generation, turn_lease_generation,
          action_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        input.runId,
        input.target.agentId,
        input.target.providerSessionGeneration,
        generation,
        input.actionId,
        now,
        now,
      );
      return {
        target: input.target,
        turnLeaseGeneration: generation,
        payload: enrichedPayload,
      };
    })();
  }

  bindSteer(input: {
    runId: string;
    target: ProviderSessionTarget;
    payload: Record<string, unknown>;
  }): ProviderTurnAdmission {
    const expected = input.payload.turnLeaseGeneration;
    if (typeof expected !== "number" || !Number.isInteger(expected)) {
      throw new FabricError("STALE_LEASE_GENERATION", "steer requires the active turn lease generation");
    }
    const lease = row(this.#database.prepare(`
      SELECT turn_lease_generation, provider_session_generation, status
        FROM provider_session_turn_leases
       WHERE run_id = ? AND agent_id = ? AND status = 'active'
    `).get(input.runId, input.target.agentId), "active provider turn");
    if (
      lease.turn_lease_generation !== expected ||
      lease.provider_session_generation !== input.target.providerSessionGeneration
    ) {
      throw new FabricError("STALE_LEASE_GENERATION", "steer turn lease generation is stale");
    }
    return {
      target: input.target,
      turnLeaseGeneration: expected,
      payload: {
        ...input.payload,
        agentId: input.target.agentId,
        resumeReference: input.target.resumeReference,
        providerSessionGeneration: input.target.providerSessionGeneration,
      },
    };
  }

  settleTurn(runId: string, actionId: string, outcome: "terminal" | "ambiguous" | "quarantined"): void {
    const action = this.#database.prepare(`
      SELECT operation, target_agent_id, turn_lease_generation
        FROM provider_actions WHERE run_id = ? AND action_id = ?
    `).get(runId, actionId);
    if (!isRow(action)) return;
    if (action.operation === "send_turn") {
      const status = outcome === "terminal" ? "released" : "quarantined";
      this.#database.prepare(`
        UPDATE provider_session_turn_leases SET status = ?, updated_at = ?
         WHERE run_id = ? AND action_id = ? AND status IN ('active', 'quarantined')
      `).run(status, this.#clock(), runId, actionId);
      return;
    }
    if (
      action.operation === "steer" && outcome !== "terminal" &&
      typeof action.target_agent_id === "string" && typeof action.turn_lease_generation === "number"
    ) {
      this.#database.prepare(`
        UPDATE provider_session_turn_leases SET status = 'quarantined', updated_at = ?
         WHERE run_id = ? AND agent_id = ? AND turn_lease_generation = ? AND status = 'active'
      `).run(this.#clock(), runId, action.target_agent_id, action.turn_lease_generation);
    }
  }

}

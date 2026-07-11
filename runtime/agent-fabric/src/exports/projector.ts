import { createHash } from "node:crypto";

import type Database from "better-sqlite3";

type Row = Record<string, unknown>;

function row(value: unknown): Row {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("receipt projection row is invalid");
  return value as Row;
}

function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("receipt projection string is invalid");
  return value;
}

function number(value: unknown): number {
  if (typeof value !== "number") throw new Error("receipt projection number is invalid");
  return value;
}

function hashOptional(value: unknown): string | null {
  return typeof value === "string" ? createHash("sha256").update(value).digest("hex") : null;
}

function observedAt(value: unknown): string {
  return new Date(number(value)).toISOString();
}

export type FabricReceipt = ReturnType<typeof projectFabricReceipt>;

export function projectFabricReceipt(database: Database.Database, runId: string, now: number) {
  const run = row(database.prepare("SELECT chair_agent_id FROM runs WHERE run_id = ?").get(runId));
  const chairAgentId = string(run.chair_agent_id);
  const count = (table: "agents" | "tasks" | "messages" | "deliveries" | "leases" | "events"): number =>
    number(row(database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE run_id = ?`).get(runId)).count);
  const interventions = database.prepare(
    "SELECT source, direct_input_provenance, task_revision, summary, created_at FROM operator_interventions WHERE run_id = ? ORDER BY created_at, intervention_id",
  ).all(runId).map((value) => {
    const item = row(value);
    return {
      source: string(item.source),
      directInputProvenance: string(item.direct_input_provenance),
      taskRevision: number(item.task_revision),
      summary: string(item.summary),
      observedAt: observedAt(item.created_at),
    };
  });
  const provenanceRank: Record<string, number> = { complete: 0, partial: 1, unavailable: 2 };
  const directInputProvenance = interventions.length === 0
    ? "unavailable"
    : interventions.reduce((worst, item) => (provenanceRank[item.directInputProvenance] ?? 2) > (provenanceRank[worst] ?? 2) ? item.directInputProvenance : worst, "complete");
  const agents = database.prepare(`
    SELECT a.agent_id, a.parent_agent_id, a.lifecycle, a.provider_session_ref, b.adapter_id,
           COALESCE(p.provider_session_generation, 1) AS provider_session_generation
      FROM agents a
      LEFT JOIN agent_adapter_bindings b ON b.run_id = a.run_id AND b.agent_id = a.agent_id
      LEFT JOIN provider_state p ON p.run_id = a.run_id AND p.agent_id = a.agent_id
     WHERE a.run_id = ? ORDER BY a.agent_id
  `).all(runId).map((value) => {
    const item = row(value);
    return {
      agentId: string(item.agent_id),
      parentAgentId: typeof item.parent_agent_id === "string" ? item.parent_agent_id : null,
      adapterId: typeof item.adapter_id === "string" ? item.adapter_id : null,
      lifecycle: string(item.lifecycle),
      providerSessionGeneration: number(item.provider_session_generation),
      providerSessionReferenceSha256: hashOptional(item.provider_session_ref),
    };
  });
  const chair = agents.find((agent) => agent.agentId === chairAgentId);
  const stageOwners = database.prepare("SELECT task_id, owner_agent_id, state, revision, owner_lease_generation FROM tasks WHERE run_id = ? AND owner_agent_id IS NOT NULL ORDER BY task_id").all(runId).map((value) => {
    const item = row(value);
    return { taskId: string(item.task_id), ownerAgentId: string(item.owner_agent_id), state: string(item.state), revision: number(item.revision), ownerLeaseGeneration: number(item.owner_lease_generation) };
  });
  const taskLeases = database.prepare("SELECT task_id, owner_agent_id, state, revision, owner_lease_generation FROM tasks WHERE run_id = ? AND owner_agent_id IS NOT NULL ORDER BY task_id").all(runId).map((value) => {
    const item = row(value);
    return { kind: "task" as const, taskId: string(item.task_id), holderAgentId: string(item.owner_agent_id), state: string(item.state), revision: number(item.revision), generation: number(item.owner_lease_generation) };
  });
  const writeLeases = database.prepare("SELECT lease_id, holder_agent_id, generation, status, expires_at FROM leases WHERE run_id = ? AND kind = 'write' ORDER BY lease_id").all(runId).map((value) => {
    const item = row(value);
    const scope = database.prepare("SELECT canonical_path FROM write_scope_entries WHERE lease_id = ? ORDER BY canonical_path").all(string(item.lease_id)).map((scopeRow) => string(row(scopeRow).canonical_path));
    return { kind: "write" as const, leaseId: string(item.lease_id), holderAgentId: string(item.holder_agent_id), generation: number(item.generation), status: string(item.status), expiresAt: observedAt(item.expires_at), scope };
  });
  const deliveryCount = (predicate: string): number => number(row(database.prepare(`SELECT COUNT(*) AS count FROM deliveries WHERE run_id = ? AND ${predicate}`).get(runId)).count);
  const objectiveChecks = database.prepare("SELECT task_id, check_id, status, evidence FROM task_objective_checks WHERE run_id = ? ORDER BY task_id, check_id").all(runId).map((value) => {
    const item = row(value);
    return { taskId: string(item.task_id), checkId: string(item.check_id), status: string(item.status), evidence: typeof item.evidence === "string" ? item.evidence : null };
  });
  const providerFailuresAndSubstitutions = database.prepare("SELECT action_id, adapter_id, operation, status, execution_count, effect_count, updated_at FROM provider_actions WHERE run_id = ? AND status IN ('ambiguous', 'quarantined') ORDER BY updated_at, action_id").all(runId).map((value) => {
    const item = row(value);
    return { actionId: string(item.action_id), adapterId: string(item.adapter_id), operation: string(item.operation), status: string(item.status), executionCount: number(item.execution_count), effectCount: number(item.effect_count), observedAt: observedAt(item.updated_at) };
  });
  const compactionsAndRotations = database.prepare("SELECT agent_id, action, task_id, task_revision, checkpoint_sha256, prior_resume_reference, replacement_resume_reference, created_at FROM lifecycle_operations WHERE run_id = ? ORDER BY created_at, operation_id").all(runId).map((value) => {
    const item = row(value);
    return {
      agentId: string(item.agent_id), action: string(item.action), taskId: string(item.task_id), taskRevision: number(item.task_revision), checkpointSha256: string(item.checkpoint_sha256),
      priorResumeReferenceSha256: hashOptional(item.prior_resume_reference), replacementResumeReferenceSha256: hashOptional(item.replacement_resume_reference), observedAt: observedAt(item.created_at),
    };
  });
  const modelRoutingReceipts = database.prepare(`
    SELECT evidence_id, action_id, relative_path, sha256, receipt_json, created_at
      FROM model_routing_evidence WHERE run_id = ? ORDER BY created_at, evidence_id
  `).all(runId).map((value) => {
    const item = row(value);
    const receipt: unknown = JSON.parse(string(item.receipt_json));
    if (typeof receipt !== "object" || receipt === null || Array.isArray(receipt)) {
      throw new Error("stored model routing receipt is invalid");
    }
    return {
      evidenceId: string(item.evidence_id),
      actionId: string(item.action_id),
      relativePath: string(item.relative_path),
      sha256: string(item.sha256),
      receipt,
      observedAt: observedAt(item.created_at),
    };
  });
  const crossFamilyReviews = database.prepare(`
    SELECT evidence_id, reviewer_agent_id, provider_family, status, independent,
           relative_path, sha256, created_at
      FROM cross_family_review_evidence WHERE run_id = ? ORDER BY created_at, evidence_id
  `).all(runId).map((value) => {
    const item = row(value);
    return {
      evidenceId: string(item.evidence_id),
      reviewerAgentId: string(item.reviewer_agent_id),
      providerFamily: string(item.provider_family),
      status: string(item.status),
      independent: number(item.independent) === 1,
      relativePath: string(item.relative_path),
      sha256: string(item.sha256),
      observedAt: observedAt(item.created_at),
    };
  });
  const metadata = database.prepare("SELECT execution_profile FROM run_metadata WHERE run_id = ?").get(runId);
  return {
    schemaVersion: 1,
    runId,
    chair: { agentId: chairAgentId, adapterId: chair?.adapterId ?? null },
    observedAt: new Date(now).toISOString(),
    stageOwners,
    agents,
    executionProfile: typeof rowOrUndefined(metadata)?.execution_profile === "string" ? string(row(metadata).execution_profile) : "unconfigured",
    directInputProvenance,
    modelRoutingReceipts,
    taskAndWriteLeases: [...taskLeases, ...writeLeases],
    messagesSentReceivedAbandoned: {
      sent: count("messages"), delivered: count("deliveries"), acknowledged: deliveryCount("state = 'acknowledged'"), abandoned: deliveryCount("state = 'abandoned'"), expired: deliveryCount("state = 'expired'"),
    },
    objectiveChecks,
    crossFamilyReviews,
    providerFailuresAndSubstitutions,
    operatorInterventions: interventions,
    compactionsAndRotations,
    counts: { agents: count("agents"), tasks: count("tasks"), messages: count("messages"), deliveries: count("deliveries"), leases: count("leases"), events: count("events") },
  };
}

function rowOrUndefined(value: unknown): Row | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Row : undefined;
}

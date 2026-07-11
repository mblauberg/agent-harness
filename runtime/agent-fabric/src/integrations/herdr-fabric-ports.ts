import { createHash } from "node:crypto";

import { parseIdentifier, parseJsonValue, parseSha256Digest } from "@local/agent-fabric-protocol";
import type {
  AgentId,
  BarrierId,
  CoordinationRunId,
  JsonValue,
  MessageId,
  ProjectId,
  ProjectSessionId,
  ProviderActionId,
  Sha256Digest,
  TaskId,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import { canonicalJson, integer, isRow, nullableText, row, text } from "../project-session/store-support.js";

export type HerdrFabricPortsOptions = Readonly<{
  database: Database.Database;
  clock?: () => number;
}>;

export type FabricSteerReference =
  | {
      kind: "task";
      projectId: ProjectId;
      projectSessionId: ProjectSessionId;
      coordinationRunId: CoordinationRunId;
      taskId: TaskId;
      expectedRevision: number;
    }
  | {
      kind: "message";
      projectId: ProjectId;
      projectSessionId: ProjectSessionId;
      coordinationRunId: CoordinationRunId;
      taskId: TaskId;
      messageId: MessageId;
      expectedRevision: number;
    };

export type FabricSteerReferenceValidation =
  | {
      status: "valid";
      referenceDigest: Sha256Digest;
      targetAgentId: AgentId;
      purpose: "steer" | "request" | "response";
      requiresAck: boolean;
      expectsResult: boolean;
      dependentBarrierId: BarrierId | null;
    }
  | {
      status: "rejected";
      code: "unknown-reference" | "stale-reference" | "scope-mismatch";
      reason: string;
    };

export type DirectSteerIntent = {
  kind: "steer.inject-fire-and-forget";
  targetAgentId: AgentId;
  paneRef: string;
  reference: FabricSteerReference;
  validatedReferenceDigest: Sha256Digest;
  prompt: string;
};

export type HerdrAppliedOperation =
  | "console.ensure-pane"
  | "agent.ensure-pane"
  | "panes.arrange"
  | "agent.project-metadata"
  | "attention.project"
  | "target.focus"
  | "agent.wake"
  | "notification.show";

export type HerdrEffectReceipt =
  | {
      status: "applied";
      operation: HerdrAppliedOperation;
      paneRef?: string;
      detail?: JsonValue;
    }
  | {
      status: "dispatched-unconfirmed";
      operation: "steer.inject-fire-and-forget";
      referenceValidation: "verified";
      deliveryEvidence: "none";
      canSatisfyExpectedResult: false;
      canCloseBarrier: false;
    };

export type HerdrActionRecord = {
  actionId: ProviderActionId;
  revision: number;
  intentDigest: Sha256Digest;
  status: "prepared" | "dispatched" | "ambiguous" | "terminal";
  receipt?: HerdrEffectReceipt;
  ambiguityReason?: string;
};

export type HerdrActionEvidence =
  | { status: "observed"; receipt: HerdrEffectReceipt }
  | { status: "absent" }
  | { status: "unknown" };

export type HerdrRecoverySummary = Readonly<{
  observed: number;
  terminal: number;
  ambiguous: number;
  prepared: number;
}>;

const ADAPTER_ID = "herdr-control-v1";
const SECRET_PATTERN = /\b(?:afb|afc|afop)_[A-Za-z0-9_-]{8,}|\bghp_[A-Za-z0-9_]{8,}|\bgithub_pat_[A-Za-z0-9_]{8,}/u;
const HERDR_APPLIED_OPERATIONS = new Set<HerdrAppliedOperation>([
  "console.ensure-pane",
  "agent.ensure-pane",
  "panes.arrange",
  "agent.project-metadata",
  "attention.project",
  "target.focus",
  "agent.wake",
  "notification.show",
]);

/** Canonical daemon-side journal/reference seam for the optional Herdr package. */
export class HerdrFabricPorts {
  readonly #database: Database.Database;
  readonly #clock: () => number;

  constructor(options: HerdrFabricPortsOptions) {
    this.#database = options.database;
    this.#clock = options.clock ?? Date.now;
  }

  async validateSteerReference(reference: FabricSteerReference): Promise<FabricSteerReferenceValidation> {
    return this.#validateSteerReference(reference);
  }

  async prepareDirectSteerAction(
    actionId: ProviderActionId,
    intent: DirectSteerIntent,
  ): Promise<HerdrActionRecord> {
    assertClosedDirectSteerIntent(intent);
    const parsedActionId = safeActionId(actionId);
    const payload = canonicalise(parseJsonValue(intent, "herdr.directSteer.intent"));
    assertNoCredentialLikeValue(payload, "Herdr direct-steer intent");
    return this.#database.transaction(() => {
      const validation = this.#validateSteerReference(intent.reference);
      if (validation.status !== "valid") throw new TypeError(`Herdr direct-steer reference is ${validation.code}`);
      if (
        validation.referenceDigest !== intent.validatedReferenceDigest ||
        validation.targetAgentId !== intent.targetAgentId || validation.purpose !== "steer" ||
        validation.requiresAck || validation.expectsResult || validation.dependentBarrierId !== null
      ) throw new TypeError("Herdr direct-steer intent does not match authoritative Fabric validation");
      return this.#prepareAction({
        actionId: parsedActionId,
        runId: intent.reference.coordinationRunId,
        projectSessionId: intent.reference.projectSessionId,
        targetAgentId: intent.targetAgentId,
        operation: intent.kind,
        payload,
      });
    })();
  }

  /** Internal daemon seam for already-authorised non-steer Herdr intents. */
  prepareAction(input: Readonly<{
    actionId: ProviderActionId;
    projectId: ProjectId;
    projectSessionId: ProjectSessionId;
    coordinationRunId: CoordinationRunId;
    targetAgentId: AgentId | null;
    intent: JsonValue;
  }>): HerdrActionRecord {
    const actionId = safeActionId(input.actionId);
    const run = this.#runIdentity(input.coordinationRunId);
    if (run.projectId !== input.projectId || run.projectSessionId !== input.projectSessionId) {
      throw new TypeError("Herdr action binding names another project session");
    }
    const intent = canonicalise(parseJsonValue(input.intent, "herdr.intent"));
    assertNoCredentialLikeValue(intent, "Herdr intent");
    if (!isRecord(intent) || typeof intent.kind !== "string" || !HERDR_APPLIED_OPERATIONS.has(intent.kind as HerdrAppliedOperation)) {
      throw new TypeError("Herdr action kind is outside the closed integration family");
    }
    return this.#database.transaction(() => this.#prepareAction({
      actionId,
      runId: input.coordinationRunId,
      projectSessionId: input.projectSessionId,
      targetAgentId: input.targetAgentId,
      operation: intent.kind as HerdrAppliedOperation,
      payload: intent,
    }))();
  }

  async readAction(actionId: ProviderActionId): Promise<HerdrActionRecord | null> {
    return this.#readAction(safeActionId(actionId));
  }

  async markDispatched(actionId: ProviderActionId, expectedRevision: number): Promise<HerdrActionRecord> {
    const parsedActionId = safeActionId(actionId);
    return this.#database.transaction(() => {
      const current = requiredAction(this.#readAction(parsedActionId), parsedActionId);
      if (current.status === "terminal" || current.status === "ambiguous" || current.status === "dispatched") return exactRevision(current, expectedRevision);
      exactRevision(current, expectedRevision);
      const changed = this.#database.prepare(`
        UPDATE provider_actions
           SET status='dispatched', history_json='["prepared","dispatched"]',
               execution_count=execution_count+1, journal_revision=journal_revision+1, updated_at=?
         WHERE adapter_id=? AND action_id=? AND status='prepared' AND journal_revision=?
      `).run(this.#clock(), ADAPTER_ID, parsedActionId, expectedRevision);
      if (changed.changes !== 1) throw new TypeError("Herdr action dispatch compare-and-set failed");
      return requiredAction(this.#readAction(parsedActionId), parsedActionId);
    })();
  }

  async completeAction(
    actionId: ProviderActionId,
    expectedRevision: number,
    receipt: HerdrEffectReceipt,
  ): Promise<HerdrActionRecord> {
    const parsedActionId = safeActionId(actionId);
    const parsedReceipt = parseReceipt(receipt);
    return this.#database.transaction(() => {
      const current = exactRevision(requiredAction(this.#readAction(parsedActionId), parsedActionId), expectedRevision);
      if (current.status === "terminal") {
        if (canonicalJson(current.receipt) !== canonicalJson(parsedReceipt)) throw new TypeError("Herdr terminal receipt conflicts with exact replay");
        return current;
      }
      if (current.status !== "dispatched" && current.status !== "ambiguous") throw new TypeError("Herdr action is not dispatch-reconcilable");
      const payload = this.#actionPayload(parsedActionId);
      if (!isRecord(payload) || payload.kind !== parsedReceipt.operation) throw new TypeError("Herdr receipt operation differs from its prepared intent");
      const changed = this.#database.prepare(`
        UPDATE provider_actions
           SET status='terminal', history_json=?, effect_count=1, idempotency_proven=1,
               result_json=?, journal_revision=journal_revision+1, updated_at=?
         WHERE adapter_id=? AND action_id=? AND journal_revision=? AND status IN ('dispatched','ambiguous')
      `).run(
        canonicalJson(current.status === "ambiguous" ? ["prepared", "dispatched", "ambiguous", "terminal"] : ["prepared", "dispatched", "terminal"]),
        canonicalJson(parsedReceipt),
        this.#clock(),
        ADAPTER_ID,
        parsedActionId,
        expectedRevision,
      );
      if (changed.changes !== 1) throw new TypeError("Herdr action completion compare-and-set failed");
      this.#database.prepare(`
        UPDATE project_session_memberships
           SET state='reconciled', revision=revision+1, updated_at=?
         WHERE member_kind='provider-action' AND member_id=? AND state='active'
      `).run(this.#clock(), parsedActionId);
      return requiredAction(this.#readAction(parsedActionId), parsedActionId);
    })();
  }

  async markAmbiguous(
    actionId: ProviderActionId,
    expectedRevision: number,
    reason: string,
  ): Promise<HerdrActionRecord> {
    const parsedActionId = safeActionId(actionId);
    boundedSafeText(reason, "Herdr ambiguity reason", 1024);
    assertNoCredentialLikeValue(reason, "Herdr ambiguity reason");
    return this.#database.transaction(() => {
      const current = exactRevision(requiredAction(this.#readAction(parsedActionId), parsedActionId), expectedRevision);
      if (current.status === "ambiguous") {
        if (current.ambiguityReason !== reason) throw new TypeError("Herdr ambiguity reason conflicts with exact replay");
        return current;
      }
      if (current.status !== "dispatched") throw new TypeError("Herdr action is not dispatch-ambiguous");
      const changed = this.#database.prepare(`
        UPDATE provider_actions
           SET status='ambiguous', history_json='["prepared","dispatched","ambiguous"]',
               result_json=?, journal_revision=journal_revision+1, updated_at=?
         WHERE adapter_id=? AND action_id=? AND status='dispatched' AND journal_revision=?
      `).run(canonicalJson({ ambiguityReason: reason }), this.#clock(), ADAPTER_ID, parsedActionId, expectedRevision);
      if (changed.changes !== 1) throw new TypeError("Herdr ambiguity compare-and-set failed");
      return requiredAction(this.#readAction(parsedActionId), parsedActionId);
    })();
  }

  /**
   * Reconciles restart evidence without replaying an external effect. Prepared
   * actions remain prepared; only already-dispatched actions reach Herdr's
   * adapter-local evidence lookup.
   */
  async recover(evidence: Readonly<{
    lookupAction(actionId: ProviderActionId): Promise<HerdrActionEvidence>;
  }>): Promise<HerdrRecoverySummary> {
    const candidates = this.#database.prepare(`
      SELECT action_id FROM provider_actions
       WHERE adapter_id=? AND status IN ('prepared','dispatched','ambiguous')
       ORDER BY updated_at ASC, action_id ASC
    `).all(ADAPTER_ID).filter(isRow).map((value) =>
      safeActionId(parseIdentifier<"ProviderActionId">(text(value, "action_id"), "herdrRecovery.actionId"))
    );
    const summary = { observed: 0, terminal: 0, ambiguous: 0, prepared: 0 };
    for (const actionId of candidates) {
      const current = await this.readAction(actionId);
      if (current === null || current.status === "terminal") continue;
      if (current.status === "prepared") {
        summary.prepared += 1;
        continue;
      }
      let lookup: HerdrActionEvidence;
      try {
        lookup = parseEvidence(await evidence.lookupAction(actionId));
      } catch {
        lookup = { status: "unknown" };
      }
      if (lookup.status === "observed") {
        const payload = this.#actionPayload(actionId);
        if (!isRecord(payload) || payload.kind !== lookup.receipt.operation) {
          if (current.status === "dispatched") {
            await this.markAmbiguous(
              actionId,
              current.revision,
              "Herdr effect evidence conflicts with the prepared intent; automatic replay is forbidden",
            );
          }
          summary.ambiguous += 1;
          continue;
        }
        summary.observed += 1;
        await this.completeAction(actionId, current.revision, lookup.receipt);
        summary.terminal += 1;
        continue;
      }
      if (current.status === "ambiguous") {
        summary.ambiguous += 1;
        continue;
      }
      const reason = lookup.status === "absent"
        ? "Herdr effect lookup reported absent; automatic replay is forbidden"
        : "Herdr effect outcome is unknown; automatic replay is forbidden";
      await this.markAmbiguous(actionId, current.revision, reason);
      summary.ambiguous += 1;
    }
    return summary;
  }

  #validateSteerReference(reference: FabricSteerReference): FabricSteerReferenceValidation {
    const parsed = parseSteerReference(reference);
    let run: { projectId: ProjectId; projectSessionId: ProjectSessionId };
    try {
      run = this.#runIdentity(parsed.coordinationRunId);
    } catch {
      return rejection("unknown-reference", "Fabric coordination run does not exist");
    }
    if (run.projectId !== parsed.projectId || run.projectSessionId !== parsed.projectSessionId) {
      return rejection("scope-mismatch", "reference belongs to another project session");
    }
    const taskRow = this.#database.prepare(`
      SELECT revision, state, owner_agent_id FROM tasks WHERE run_id=? AND task_id=?
    `).get(parsed.coordinationRunId, parsed.taskId);
    if (!isRow(taskRow)) return rejection("unknown-reference", "Fabric task does not exist");
    const revision = integer(taskRow, "revision");
    if (revision !== parsed.expectedRevision) return rejection("stale-reference", "Fabric task revision changed");
    const ownerAgentId = nullableText(taskRow, "owner_agent_id");
    if (ownerAgentId === null || text(taskRow, "state") !== "active") {
      return rejection("scope-mismatch", "Fabric task has no active target owner");
    }
    if (!isRow(this.#database.prepare("SELECT 1 FROM agents WHERE run_id=? AND agent_id=?").get(parsed.coordinationRunId, ownerAgentId))) {
      return rejection("scope-mismatch", "Fabric task owner is unavailable");
    }
    if (parsed.kind === "message") {
      return rejection("scope-mismatch", "message references lack an exact task binding in the current schema");
    }
    const request = this.#database.prepare(`
      SELECT dependent_barrier_id FROM task_requests
       WHERE run_id=? AND task_id=? AND state IN ('pending','overdue','reassigned')
       ORDER BY created_at DESC LIMIT 1
    `).get(parsed.coordinationRunId, parsed.taskId);
    const expectsResult = isRow(request);
    const dependentBarrierId = expectsResult
      ? parseIdentifier<"BarrierId">(text(request, "dependent_barrier_id"), "herdrSteer.dependentBarrierId")
      : null;
    const base = {
      targetAgentId: parseIdentifier<"AgentId">(ownerAgentId, "herdrSteer.targetAgentId"),
      purpose: expectsResult ? "request" as const : "steer" as const,
      requiresAck: expectsResult,
      expectsResult,
      dependentBarrierId,
    };
    return {
      status: "valid",
      referenceDigest: digestJson({ reference: parsed, ...base }),
      ...base,
    };
  }

  #runIdentity(runId: CoordinationRunId): { projectId: ProjectId; projectSessionId: ProjectSessionId } {
    const value = this.#database.prepare(`
      SELECT s.project_id, r.project_session_id
        FROM runs r JOIN project_sessions s ON s.project_session_id=r.project_session_id
       WHERE r.run_id=?
    `).get(runId);
    if (!isRow(value)) throw new TypeError("Herdr action run is unavailable");
    return {
      projectId: parseIdentifier<"ProjectId">(text(value, "project_id"), "herdr.projectId"),
      projectSessionId: parseIdentifier<"ProjectSessionId">(text(value, "project_session_id"), "herdr.projectSessionId"),
    };
  }

  #prepareAction(input: Readonly<{
    actionId: ProviderActionId;
    runId: CoordinationRunId;
    projectSessionId: ProjectSessionId;
    targetAgentId: AgentId | null;
    operation: string;
    payload: JsonValue;
  }>): HerdrActionRecord {
    const intentDigest = digestJson(input.payload);
    const existing = this.#database.prepare(`
      SELECT run_id, adapter_id FROM provider_actions WHERE action_id=?
    `).all(input.actionId).filter(isRow);
    if (existing.length > 0) {
      const current = this.#readAction(input.actionId);
      if (
        current === null || existing.length !== 1 ||
        existing.some((value) => text(value, "adapter_id") !== ADAPTER_ID || text(value, "run_id") !== input.runId) ||
        current.intentDigest !== intentDigest
      ) {
        throw new TypeError("Herdr stable action identity conflicts with an existing action");
      }
      return current;
    }
    if (input.targetAgentId !== null && !isRow(this.#database.prepare("SELECT 1 FROM agents WHERE run_id=? AND agent_id=?").get(input.runId, input.targetAgentId))) {
      throw new TypeError("Herdr target agent is outside the coordination run");
    }
    const generationRow = input.targetAgentId === null ? null : this.#database.prepare(`
      SELECT provider_session_generation FROM provider_state WHERE run_id=? AND agent_id=?
    `).get(input.runId, input.targetAgentId);
    const providerGeneration = isRow(generationRow) ? integer(generationRow, "provider_session_generation") : null;
    this.#database.prepare(`
      INSERT INTO provider_actions(
        run_id, action_id, adapter_id, operation, target_agent_id,
        provider_session_generation, turn_lease_generation,
        identity_hash, payload_hash, payload_json, status, history_json,
        execution_count, effect_count, idempotency_proven, result_json,
        updated_at, journal_revision
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'prepared', '["prepared"]', 0, 0, 0, NULL, ?, 1)
    `).run(
      input.runId,
      input.actionId,
      ADAPTER_ID,
      `herdr:${input.operation}`,
      input.targetAgentId,
      providerGeneration,
      digestJson({ runId: input.runId, projectSessionId: input.projectSessionId, targetAgentId: input.targetAgentId }),
      intentDigest,
      canonicalJson(input.payload),
      this.#clock(),
    );
    this.#database.prepare(`
      INSERT INTO project_session_memberships(
        project_session_id, coordination_run_id, member_kind, member_id,
        required, state, revision, abandoned_reason, created_at, updated_at
      ) VALUES (?, ?, 'provider-action', ?, 1, 'active', 1, NULL, ?, ?)
    `).run(input.projectSessionId, input.runId, input.actionId, this.#clock(), this.#clock());
    return requiredAction(this.#readAction(input.actionId), input.actionId);
  }

  #readAction(actionId: ProviderActionId): HerdrActionRecord | null {
    const value = this.#database.prepare(`
      SELECT action_id, payload_hash, status, result_json, journal_revision
        FROM provider_actions WHERE adapter_id=? AND action_id=?
    `).get(ADAPTER_ID, actionId);
    if (!isRow(value)) return null;
    const status = text(value, "status");
    const base = {
      actionId: parseIdentifier<"ProviderActionId">(text(value, "action_id"), "herdrAction.actionId"),
      revision: integer(value, "journal_revision"),
      intentDigest: parseSha256Digest(text(value, "payload_hash"), "herdrAction.intentDigest"),
    };
    if (status === "prepared" || status === "dispatched") return { ...base, status };
    if (status === "ambiguous") {
      const result = parseStoredJson(value, "result_json");
      if (!isRecord(result) || typeof result.ambiguityReason !== "string") throw new TypeError("stored Herdr ambiguity evidence is invalid");
      const ambiguityReason = boundedSafeText(result.ambiguityReason, "stored Herdr ambiguity reason", 1024);
      assertNoCredentialLikeValue(ambiguityReason, "stored Herdr ambiguity reason");
      return { ...base, status, ambiguityReason };
    }
    if (status === "terminal") return { ...base, status, receipt: parseReceipt(parseStoredJson(value, "result_json")) };
    throw new TypeError("stored Herdr action has an invalid lifecycle state");
  }

  #actionPayload(actionId: ProviderActionId): JsonValue {
    const value = row(this.#database.prepare(`
      SELECT payload_json FROM provider_actions WHERE adapter_id=? AND action_id=?
    `).get(ADAPTER_ID, actionId), "Herdr action payload");
    return parseJsonValue(JSON.parse(text(value, "payload_json")), "herdrAction.payload");
  }
}

function parseSteerReference(value: FabricSteerReference): FabricSteerReference {
  if (!isRecord(value)) throw new TypeError("Herdr steer reference must be an object");
  const expected = value.kind === "task"
    ? ["coordinationRunId", "expectedRevision", "kind", "projectId", "projectSessionId", "taskId"]
    : ["coordinationRunId", "expectedRevision", "kind", "messageId", "projectId", "projectSessionId", "taskId"];
  if ((value.kind !== "task" && value.kind !== "message") || !exactKeys(value, expected)) throw new TypeError("Herdr steer reference is not closed");
  if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0) throw new TypeError("Herdr steer reference revision is invalid");
  const base = {
    projectId: parseIdentifier<"ProjectId">(value.projectId, "herdrSteer.projectId"),
    projectSessionId: parseIdentifier<"ProjectSessionId">(value.projectSessionId, "herdrSteer.projectSessionId"),
    coordinationRunId: parseIdentifier<"CoordinationRunId">(value.coordinationRunId, "herdrSteer.coordinationRunId"),
    taskId: parseIdentifier<"TaskId">(value.taskId, "herdrSteer.taskId"),
    expectedRevision: value.expectedRevision,
  };
  return value.kind === "task"
    ? { kind: "task", ...base }
    : { kind: "message", ...base, messageId: parseIdentifier<"MessageId">(value.messageId, "herdrSteer.messageId") };
}

function assertClosedDirectSteerIntent(intent: DirectSteerIntent): void {
  if (!isRecord(intent) || !exactKeys(intent, ["kind", "paneRef", "prompt", "reference", "targetAgentId", "validatedReferenceDigest"]) || intent.kind !== "steer.inject-fire-and-forget") {
    throw new TypeError("Herdr direct-steer intent is not closed");
  }
  parseIdentifier<"AgentId">(intent.targetAgentId, "herdrSteer.targetAgentId");
  parseSha256Digest(intent.validatedReferenceDigest, "herdrSteer.validatedReferenceDigest");
  if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u.test(intent.paneRef)) throw new TypeError("Herdr direct-steer pane reference is invalid");
  boundedSafeText(intent.prompt, "Herdr direct-steer prompt", 4096);
  parseSteerReference(intent.reference);
}

function parseReceipt(value: unknown): HerdrEffectReceipt {
  if (!isRecord(value)) throw new TypeError("Herdr effect receipt must be an object");
  if (value.status === "dispatched-unconfirmed") {
    if (!exactKeys(value, ["canCloseBarrier", "canSatisfyExpectedResult", "deliveryEvidence", "operation", "referenceValidation", "status"]) ||
        value.operation !== "steer.inject-fire-and-forget" || value.referenceValidation !== "verified" ||
        value.deliveryEvidence !== "none" || value.canSatisfyExpectedResult !== false || value.canCloseBarrier !== false) {
      throw new TypeError("Herdr direct-steer receipt is invalid");
    }
    return value as HerdrEffectReceipt;
  }
  const keys = ["operation", "status"];
  if (value.paneRef !== undefined) keys.push("paneRef");
  if (value.detail !== undefined) keys.push("detail");
  if (
    !exactKeys(value, keys) || value.status !== "applied" || typeof value.operation !== "string" ||
    !HERDR_APPLIED_OPERATIONS.has(value.operation as HerdrAppliedOperation)
  ) throw new TypeError("Herdr effect receipt is invalid");
  const detail = value.detail === undefined ? undefined : parseJsonValue(value.detail, "herdrReceipt.detail");
  const parsed = {
    status: "applied" as const,
    operation: value.operation as HerdrAppliedOperation,
    ...(value.paneRef === undefined ? {} : { paneRef: boundedSafeText(value.paneRef, "Herdr receipt pane", 128) }),
    ...(detail === undefined ? {} : { detail }),
  };
  assertNoCredentialLikeValue(parsed, "Herdr receipt");
  return parsed;
}

function parseEvidence(value: unknown): HerdrActionEvidence {
  if (!isRecord(value) || typeof value.status !== "string") throw new TypeError("Herdr effect evidence is invalid");
  if (value.status === "absent" || value.status === "unknown") {
    if (!exactKeys(value, ["status"])) throw new TypeError("Herdr effect evidence is not closed");
    return { status: value.status };
  }
  if (value.status === "observed" && exactKeys(value, ["receipt", "status"])) {
    return { status: "observed", receipt: parseReceipt(value.receipt) };
  }
  throw new TypeError("Herdr effect evidence is invalid");
}

function parseStoredJson(value: Record<string, unknown>, field: string): unknown {
  const stored = text(value, field);
  if (Buffer.byteLength(stored, "utf8") > 64 * 1024) throw new TypeError(`stored ${field} exceeds its bound`);
  return JSON.parse(stored);
}

function requiredAction(value: HerdrActionRecord | null, actionId: ProviderActionId): HerdrActionRecord {
  if (value === null) throw new TypeError(`Herdr action ${actionId} is unavailable`);
  return value;
}

function exactRevision(record: HerdrActionRecord, expectedRevision: number): HerdrActionRecord {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || record.revision !== expectedRevision) {
    throw new TypeError("Herdr action revision is stale");
  }
  return record;
}

function safeActionId(value: ProviderActionId): ProviderActionId {
  const actionId = parseIdentifier<"ProviderActionId">(value, "herdrAction.actionId");
  assertNoCredentialLikeValue(actionId, "Herdr action ID");
  return actionId;
}

function rejection(code: "unknown-reference" | "stale-reference" | "scope-mismatch", reason: string): FabricSteerReferenceValidation {
  return { status: "rejected", code, reason };
}

function digestJson(value: JsonValue): Sha256Digest {
  return parseSha256Digest(`sha256:${createHash("sha256").update(JSON.stringify(canonicalise(value))).digest("hex")}`, "herdr.digest");
}

function canonicalise(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, entry]) => [key, canonicalise(entry)]));
  }
  return value;
}

function boundedSafeText(value: unknown, label: string, maximumBytes: number): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be text`);
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes < 1 || bytes > maximumBytes || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u009b]/u.test(value)) {
    throw new TypeError(`${label} is unsafe or exceeds its bound`);
  }
  return value;
}

function assertNoCredentialLikeValue(value: unknown, label: string): void {
  if (SECRET_PATTERN.test(JSON.stringify(value))) throw new TypeError(`${label} contains credential-like data`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

import type Database from "better-sqlite3";

import { FabricError } from "../errors.js";
import { assertProviderActionOwner, type ProviderActionCustodyOwner } from "../application/provider-action-owner.js";
import { isBudgetUnitKey } from "../domain/unit-keys.js";
import type { ProviderActionResult } from "../core/contracts.js";

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRow(value) && Object.values(value).every((item) => typeof item === "number");
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

function isProviderActionStatus(value: unknown): value is ProviderActionResult["status"] {
  return ["prepared", "dispatched", "accepted", "terminal", "ambiguous", "quarantined"].includes(String(value));
}

const MAXIMUM_PROVIDER_ANSWER_BYTES = 262_144;

export function providerAnswerFromAdapterResult(value: unknown): string {
  if (!isRow(value) || typeof value.result !== "string") {
    throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "answer-bearing provider spawn returned no validated answer");
  }
  const answer = value.result.trim();
  if (answer.length === 0 || Buffer.byteLength(answer, "utf8") > MAXIMUM_PROVIDER_ANSWER_BYTES) {
    throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "answer-bearing provider spawn returned an empty or oversized answer");
  }
  return answer;
}

export function isTaskBoundEphemeralProviderPayload(value: unknown): value is Record<string, unknown> {
  return isRow(value) &&
    typeof value.taskId === "string" &&
    typeof value.modelFamily === "string" &&
    typeof value.prompt === "string";
}

export function providerActionResult(value: unknown, expectedActionId?: string): ProviderActionResult {
  if (
    !isRow(value) ||
    typeof value.actionId !== "string" ||
    !isProviderActionStatus(value.status) ||
    !isStringArray(value.history) ||
    typeof value.executionCount !== "number" ||
    typeof value.effectCount !== "number"
  ) {
    throw new Error("provider returned an invalid action result");
  }
  if (expectedActionId !== undefined && value.actionId !== expectedActionId) {
    throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "provider action evidence belongs to another action");
  }
  return {
    actionId: value.actionId,
    status: value.status,
    history: value.history,
    executionCount: value.executionCount,
    effectCount: value.effectCount,
    ...(value.result === undefined ? {} : { result: value.result }),
    ...(typeof value.providerAnswer === "string" ? { providerAnswer: value.providerAnswer } : {}),
  };
}

export function providerActionResultWithRequiredAnswer(
  value: unknown,
  answerBearing: boolean,
  expectedActionId?: string,
): ProviderActionResult {
  const result = providerActionResult(value, expectedActionId);
  if (!answerBearing || result.status !== "terminal") return result;
  return {
    ...result,
    providerAnswer: providerAnswerFromAdapterResult(result.result),
  };
}

export function isProviderActionResult(value: unknown): value is ProviderActionResult {
  try {
    providerActionResult(value);
    return !isRow(value) || value.providerAnswer === undefined || (
      typeof value.providerAnswer === "string" &&
      value.providerAnswer.trim().length > 0 &&
      Buffer.byteLength(value.providerAnswer, "utf8") <= MAXIMUM_PROVIDER_ANSWER_BYTES
    );
  } catch {
    return false;
  }
}

/**
 * Transient tracking plus durable row ownership for generic provider actions: the active/owned
 * operation trackers, the deferred-dispatch queue and pump, the ownership key, the generic result
 * codecs, the durable row read, persistence, and the byte-frozen E4 budget settlement. This is a
 * leaf owner in the generic provider-action vertical: deferred entries carry their own injected
 * `execute` closure, so state has no dependency on executor or recovery.
 */
export class ProviderActionState {
  readonly #database: Database.Database;
  readonly #clock: () => number;
  readonly #fault: (label: string) => void;
  readonly #maximumConcurrentProviderTurns: number;
  readonly #isClosing: () => boolean;
  readonly #settleProviderTurn: (
    runId: string,
    adapterId: string,
    actionId: string,
    status: "terminal" | "ambiguous" | "quarantined",
  ) => void;

  readonly #ownedProviderActions = new Map<string, Promise<void>>();
  readonly #activeGenericProviderOperations = new Set<Promise<void>>();
  readonly #deferredProviderActions: Array<{
    key: string;
    runId: string;
    adapterId: string;
    actionId: string;
    owner: ProviderActionCustodyOwner;
    execute: () => Promise<ProviderActionResult>;
    settle: () => void;
  }> = [];
  #pumpingDeferredProviderActions = false;
  #deferredProviderPumpTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(dependencies: Readonly<{
    database: Database.Database;
    clock: () => number;
    fault: (label: string) => void;
    maximumConcurrentProviderTurns: number;
    isClosing: () => boolean;
    settleProviderTurn: (
      runId: string,
      adapterId: string,
      actionId: string,
      status: "terminal" | "ambiguous" | "quarantined",
    ) => void;
  }>) {
    this.#database = dependencies.database;
    this.#clock = dependencies.clock;
    this.#fault = dependencies.fault;
    this.#maximumConcurrentProviderTurns = dependencies.maximumConcurrentProviderTurns;
    this.#isClosing = dependencies.isClosing;
    this.#settleProviderTurn = dependencies.settleProviderTurn;
  }

  get size(): number {
    return this.#activeGenericProviderOperations.size + this.#ownedProviderActions.size;
  }

  pending(): Array<Promise<void>> {
    return [...this.#activeGenericProviderOperations, ...this.#ownedProviderActions.values()];
  }

  ownershipKey(runId: string, adapterId: string, actionId: string): string {
    return this.#providerActionOwnershipKey(runId, adapterId, actionId);
  }

  getGenericPredecessor(runId: string, adapterId: string, actionId: string): Promise<void> | undefined {
    return this.#ownedProviderActions.get(this.#providerActionOwnershipKey(runId, adapterId, actionId));
  }

  isOwned(runId: string, adapterId: string, actionId: string): boolean {
    return this.#ownedProviderActions.has(this.#providerActionOwnershipKey(runId, adapterId, actionId));
  }

  clearScheduledPump(): void {
    if (this.#deferredProviderPumpTimer !== undefined) clearTimeout(this.#deferredProviderPumpTimer);
    this.#deferredProviderPumpTimer = undefined;
  }

  async trackGenericOperation<T>(operation: () => Promise<T>): Promise<T> {
    return await this.#trackProviderOperationIn(this.#activeGenericProviderOperations, operation);
  }

  async #trackProviderOperationIn<T>(set: Set<Promise<void>>, operation: () => Promise<T>): Promise<T> {
    if (this.#isClosing()) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "provider operation cannot start while Fabric is closing");
    }
    let settle = (): void => undefined;
    const tracked = new Promise<void>((resolvePromise) => {
      settle = resolvePromise;
    });
    set.add(tracked);
    try {
      return await operation();
    } finally {
      set.delete(tracked);
      settle();
    }
  }

  #providerActionOwnershipKey(runId: string, adapterId: string, actionId: string): string {
    return `${runId}\u0000${adapterId}\u0000${actionId}`;
  }

  enqueueDeferred(input: {
    runId: string;
    adapterId: string;
    actionId: string;
    owner?: ProviderActionCustodyOwner;
    execute: () => Promise<ProviderActionResult>;
  }): void {
    if (this.#isClosing()) return;
    const owner = input.owner ?? "generic";
    this.#fault("provider-action-owner:before-deferred-enqueue");
    assertProviderActionOwner(this.#database, input, owner);
    const key = this.#providerActionOwnershipKey(input.runId, input.adapterId, input.actionId);
    if (this.#ownedProviderActions.has(key)) return;
    let settle = (): void => undefined;
    const tracked = new Promise<void>((resolvePromise) => {
      settle = resolvePromise;
    });
    this.#ownedProviderActions.set(key, tracked);
    this.#deferredProviderActions.push({ key, ...input, owner, settle });
    this.#pumpDeferredProviderActions();
  }

  abandonDeferred(): void {
    let work = this.#deferredProviderActions.shift();
    while (work !== undefined) {
      this.#ownedProviderActions.delete(work.key);
      work.settle();
      work = this.#deferredProviderActions.shift();
    }
  }

  #claimDeferredProviderAction(
    runId: string,
    adapterId: string,
    actionId: string,
    owner: ProviderActionCustodyOwner,
  ): "claimed" | "blocked" | "stale" {
    return this.#database.transaction(() => {
      assertProviderActionOwner(this.#database, { runId, adapterId, actionId }, owner);
      const action = this.#database.prepare(`
        SELECT status FROM provider_actions WHERE run_id=? AND adapter_id=? AND action_id=?
      `).get(runId, adapterId, actionId);
      if (!isRow(action) || action.status !== "prepared") return "stale";
      const active = rowOrNotFound(this.#database.prepare(`
        SELECT
          (SELECT COUNT(*) FROM provider_session_turn_leases
            WHERE status IN ('active','quarantined')) +
          (SELECT COUNT(*) FROM provider_actions
            WHERE budget_authority_id IS NOT NULL
              AND status IN ('dispatched','ambiguous','quarantined')) AS count
      `).get(), "active provider turn count");
      if (numberField(active, "count") >= this.#maximumConcurrentProviderTurns) return "blocked";
      const claimed = this.#database.prepare(`
        UPDATE provider_actions
           SET status='dispatched',history_json='["prepared","dispatched"]',
               execution_count=1,updated_at=?
         WHERE run_id=? AND adapter_id=? AND action_id=? AND status='prepared'
      `).run(this.#clock(), runId, adapterId, actionId);
      return claimed.changes === 1 ? "claimed" : "stale";
    })();
  }

  #pumpDeferredProviderActions(): void {
    if (this.#isClosing() || this.#pumpingDeferredProviderActions) return;
    this.#pumpingDeferredProviderActions = true;
    try {
      while (this.#deferredProviderActions.length > 0) {
        const work = this.#deferredProviderActions[0];
        if (work === undefined) return;
        let claim: "claimed" | "blocked" | "stale";
        try {
          this.#fault("provider-action-owner:before-deferred-claim");
          claim = this.#claimDeferredProviderAction(work.runId, work.adapterId, work.actionId, work.owner);
        } catch (error: unknown) {
          if (this.#deferredProviderActions[0] === work) this.#deferredProviderActions.shift();
          this.#ownedProviderActions.delete(work.key);
          work.settle();
          throw error;
        }
        if (claim === "blocked") return;
        this.#deferredProviderActions.shift();
        if (claim === "stale") {
          this.#ownedProviderActions.delete(work.key);
          work.settle();
          continue;
        }
        try {
          this.#fault("provider-action-owner:before-deferred-completion");
          assertProviderActionOwner(this.#database, {
            runId: work.runId,
            adapterId: work.adapterId,
            actionId: work.actionId,
          }, work.owner);
        } catch (error: unknown) {
          this.#ownedProviderActions.delete(work.key);
          work.settle();
          throw error;
        }
        void work.execute()
          .catch(() => undefined)
          .finally(() => {
            this.#ownedProviderActions.delete(work.key);
            work.settle();
            this.#pumpDeferredProviderActions();
          });
      }
    } finally {
      this.#pumpingDeferredProviderActions = false;
      this.#scheduleDeferredProviderPump();
    }
  }

  #scheduleDeferredProviderPump(): void {
    if (this.#isClosing() || this.#deferredProviderActions.length === 0) {
      if (this.#deferredProviderPumpTimer !== undefined) clearTimeout(this.#deferredProviderPumpTimer);
      this.#deferredProviderPumpTimer = undefined;
      return;
    }
    if (this.#deferredProviderPumpTimer !== undefined) return;
    this.#deferredProviderPumpTimer = setTimeout(() => {
      this.#deferredProviderPumpTimer = undefined;
      this.#pumpDeferredProviderActions();
    }, 100);
    this.#deferredProviderPumpTimer.unref();
  }

  settleAndPump(
    runId: string,
    adapterId: string,
    actionId: string,
    status: "terminal" | "ambiguous" | "quarantined",
  ): void {
    this.#settleProviderTurn(runId, adapterId, actionId, status);
    this.#pumpDeferredProviderActions();
  }

  assertGenericProviderAction(runId: string, adapterId: string, actionId: string): void {
    const exists = this.#database.prepare(`
      SELECT 1 FROM provider_actions WHERE run_id=? AND adapter_id=? AND action_id=?
    `).get(runId, adapterId, actionId);
    if (exists !== undefined) {
      assertProviderActionOwner(this.#database, { runId, adapterId, actionId }, "generic");
    }
  }

  get(runId: string, adapterId: string, actionId: string): ProviderActionResult {
    const row = rowOrNotFound(
      this.#database
        .prepare("SELECT operation, payload_json, status, history_json, execution_count, effect_count, result_json FROM provider_actions WHERE run_id = ? AND adapter_id = ? AND action_id = ?")
        .get(runId, adapterId, actionId),
      "provider action",
    );
    const history: unknown = JSON.parse(stringField(row, "history_json"));
    if (!isStringArray(history) || !isProviderActionStatus(row.status)) {
      throw new Error("stored provider action is invalid");
    }
    const resultJson = row.result_json;
    const result = typeof resultJson === "string" ? JSON.parse(resultJson) as unknown : undefined;
    const payload: unknown = JSON.parse(stringField(row, "payload_json"));
    const providerAnswer = row.operation === "spawn" && isTaskBoundEphemeralProviderPayload(payload) && result !== undefined
      ? providerAnswerFromAdapterResult(result)
      : undefined;
    return {
      actionId,
      status: row.status,
      history,
      executionCount: numberField(row, "execution_count"),
      effectCount: numberField(row, "effect_count"),
      ...(result === undefined ? {} : { result }),
      ...(providerAnswer === undefined ? {} : { providerAnswer }),
    };
  }

  persist(
    runId: string,
    adapterId: string,
    actionId: string,
    raw: unknown,
    result: ProviderActionResult,
    expectedOwner: ProviderActionCustodyOwner = "generic",
  ): void {
    assertProviderActionOwner(this.#database, { runId, adapterId, actionId }, expectedOwner);
    const idempotencyProven = isRow(raw) && raw.idempotencyProven === true ? 1 : 0;
    const now = this.#clock();
    const budget = this.#providerBudgetSettlement(runId, adapterId, actionId, result, now);
    this.#database
      .prepare(
        "UPDATE provider_actions SET status = ?, history_json = ?, execution_count = ?, effect_count = ?, idempotency_proven = ?, result_json = ?, updated_at = ?, budget_state = COALESCE(?, budget_state), budget_settlement_json = COALESCE(?, budget_settlement_json) WHERE run_id = ? AND adapter_id = ? AND action_id = ?",
      )
      .run(
        result.status,
        canonicalJson(result.history),
        result.executionCount,
        result.effectCount,
        idempotencyProven,
        result.result === undefined ? null : canonicalJson(result.result),
        now,
        budget?.state ?? null,
        budget === undefined ? null : canonicalJson(budget.settlement),
        runId,
        adapterId,
        actionId,
      );
  }

  #providerBudgetSettlement(
    runId: string,
    adapterId: string,
    actionId: string,
    result: ProviderActionResult,
    now: number,
  ): Readonly<{
    state: "settled" | "usage-unknown";
    settlement: Readonly<Record<string, number | "unknown">>;
  }> | undefined {
    const binding = this.#database.prepare(`
      SELECT budget_authority_id,budget_reservation_json,budget_settlement_json,
             budget_state,budget_started_at
        FROM provider_actions
       WHERE run_id=? AND adapter_id=? AND action_id=?
    `).get(runId, adapterId, actionId);
    if (!isRow(binding) || binding.budget_authority_id === null) return undefined;
    const reservationValue: unknown = JSON.parse(stringField(binding, "budget_reservation_json"));
    if (!isNumberRecord(reservationValue) || Object.values(reservationValue).some(
      (amount) => !Number.isSafeInteger(amount) || amount < 1,
    )) {
      throw new Error("stored provider action budget reservation is invalid");
    }
    const prior: Record<string, number | "unknown"> = {};
    if (binding.budget_state === "usage-unknown") {
      const priorValue: unknown = JSON.parse(stringField(binding, "budget_settlement_json"));
      if (!isRow(priorValue)) throw new Error("stored provider action settlement is invalid");
      for (const [unit, value] of Object.entries(priorValue)) {
        if (value !== "unknown" && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) {
          throw new Error("stored provider action settlement is invalid");
        }
        prior[unit] = value;
      }
    } else if (binding.budget_state !== "reserved") {
      return undefined;
    }
    const reported: Record<string, number> = {};
    if (isRow(result.result)) {
      const usage = result.result.resourceUsage;
      if (usage !== undefined) {
        if (!isRow(usage)) {
          throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "provider reported malformed resource usage");
        }
        for (const [unit, value] of Object.entries(usage)) {
          const reserved = reservationValue[unit];
          if (
            reserved === undefined || !isBudgetUnitKey(unit) ||
            typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > reserved
          ) {
            throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "provider reported unreserved or invalid resource usage");
          }
          reported[unit] = value;
        }
      }
    }
    if (result.effectCount === 0 && Object.values(reported).some((value) => value !== 0)) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "no-effect provider action reported nonzero resource usage");
    }
    const settlement: Record<string, number | "unknown"> = {};
    for (const [unit, reserved] of Object.entries(reservationValue).sort(([left], [right]) => left.localeCompare(right))) {
      const previous = prior[unit];
      if (typeof previous === "number") {
        settlement[unit] = previous;
        continue;
      }
      if (result.status !== "terminal") {
        settlement[unit] = "unknown";
      } else if (result.effectCount === 0) {
        settlement[unit] = 0;
      } else if (unit === "turns") {
        settlement[unit] = reported[unit] ?? (reserved === 1 ? 1 : "unknown");
      } else if (unit === "provider_calls") {
        settlement[unit] = 1;
      } else if (unit === "concurrent_turns") {
        settlement[unit] = 0;
      } else if (unit === "wall_clock_milliseconds") {
        const elapsed = Math.max(0, now - numberField(binding, "budget_started_at"));
        settlement[unit] = elapsed <= reserved ? elapsed : "unknown";
      } else {
        settlement[unit] = reported[unit] ?? "unknown";
      }
    }
    return {
      state: Object.values(settlement).includes("unknown") ? "usage-unknown" : "settled",
      settlement,
    };
  }
}

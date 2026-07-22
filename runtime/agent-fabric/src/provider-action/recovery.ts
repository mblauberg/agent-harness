import type Database from "better-sqlite3";

import type { CommandJournal } from "../application/command-journal.js";
import {
  assertProviderActionOwner,
  classifyProviderActionOwnerRowForStartup,
  ProviderActionOwnerError,
  quarantineProviderActionOwnerAtStartup,
  type ProviderActionCustodyOwner,
  type ProviderActionOwnerStartupRow,
} from "../application/provider-action-owner.js";
import { FabricError } from "../errors.js";
import type { ProviderActionResult } from "../core/contracts.js";
import { isProviderActionResult, isTaskBoundEphemeralProviderPayload, providerActionResultWithRequiredAnswer } from "./state.js";

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

/**
 * Public reconciliation entry point plus startup recovery for generic provider actions. This is
 * the recovery owner in the generic provider-action vertical: it holds the singleflight
 * reconciliation map, the owner-parameterised reconciliation algorithm shared by the public
 * `reconcileProviderAction` command and startup recovery, the startup quarantine helper, the
 * certifying-review recovery pass, and the generic/integrity startup scan. It depends on
 * `ProviderActionState` and `ProviderActionExecutor` only through narrow injected ports, and on
 * `ProviderPayloadAuthority` only through a narrow bound closure.
 */
export class ProviderActionRecovery {
  readonly #database: Database.Database;
  readonly #clock: () => number;
  readonly #commandJournal: CommandJournal;
  readonly #assertChair: (runId: string, actorAgentId: string) => void;
  readonly #event: (runId: string, type: string, actorAgentId: string | null, payload: unknown) => void;
  readonly #requestAdapter: (adapterId: string, method: string, params: Record<string, unknown>) => Promise<unknown>;
  readonly #assertProviderPrincipalActive: (runId: string, agentId: string) => void;
  readonly #track: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly #get: (runId: string, adapterId: string, actionId: string) => ProviderActionResult;
  readonly #persist: (
    runId: string,
    adapterId: string,
    actionId: string,
    raw: unknown,
    result: ProviderActionResult,
    expectedOwner?: ProviderActionCustodyOwner,
  ) => void;
  readonly #isOwned: (runId: string, adapterId: string, actionId: string) => boolean;
  readonly #enqueue: (input: {
    runId: string;
    adapterId: string;
    actionId: string;
    owner?: ProviderActionCustodyOwner;
    execute: () => Promise<ProviderActionResult>;
  }) => void;
  readonly #settle: (
    runId: string,
    adapterId: string,
    actionId: string,
    status: "terminal" | "ambiguous" | "quarantined",
  ) => void;
  readonly #ownershipKey: (runId: string, adapterId: string, actionId: string) => string;
  readonly #assertGenericProviderAction: (runId: string, adapterId: string, actionId: string) => void;
  readonly #completeAdapterOperation: (input: {
    runId: string;
    adapterId: string;
    actionId: string;
    operation: string;
    method: string;
    payload: Record<string, unknown>;
    requireProviderAnswer?: true;
    owner?: ProviderActionCustodyOwner;
  }) => Promise<ProviderActionResult>;

  readonly #providerActionReconciliations = new Map<string, Promise<ProviderActionResult>>();

  constructor(dependencies: Readonly<{
    database: Database.Database;
    clock: () => number;
    commandJournal: CommandJournal;
    assertChair: (runId: string, actorAgentId: string) => void;
    event: (runId: string, type: string, actorAgentId: string | null, payload: unknown) => void;
    requestAdapter: (adapterId: string, method: string, params: Record<string, unknown>) => Promise<unknown>;
    assertProviderPrincipalActive: (runId: string, agentId: string) => void;
    track: <T>(operation: () => Promise<T>) => Promise<T>;
    get: (runId: string, adapterId: string, actionId: string) => ProviderActionResult;
    persist: (
      runId: string,
      adapterId: string,
      actionId: string,
      raw: unknown,
      result: ProviderActionResult,
      expectedOwner?: ProviderActionCustodyOwner,
    ) => void;
    isOwned: (runId: string, adapterId: string, actionId: string) => boolean;
    enqueue: (input: {
      runId: string;
      adapterId: string;
      actionId: string;
      owner?: ProviderActionCustodyOwner;
      execute: () => Promise<ProviderActionResult>;
    }) => void;
    settle: (
      runId: string,
      adapterId: string,
      actionId: string,
      status: "terminal" | "ambiguous" | "quarantined",
    ) => void;
    ownershipKey: (runId: string, adapterId: string, actionId: string) => string;
    assertGenericProviderAction: (runId: string, adapterId: string, actionId: string) => void;
    completeAdapterOperation: (input: {
      runId: string;
      adapterId: string;
      actionId: string;
      operation: string;
      method: string;
      payload: Record<string, unknown>;
      requireProviderAnswer?: true;
      owner?: ProviderActionCustodyOwner;
    }) => Promise<ProviderActionResult>;
  }>) {
    this.#database = dependencies.database;
    this.#clock = dependencies.clock;
    this.#commandJournal = dependencies.commandJournal;
    this.#assertChair = dependencies.assertChair;
    this.#event = dependencies.event;
    this.#requestAdapter = dependencies.requestAdapter;
    this.#assertProviderPrincipalActive = dependencies.assertProviderPrincipalActive;
    this.#track = dependencies.track;
    this.#get = dependencies.get;
    this.#persist = dependencies.persist;
    this.#isOwned = dependencies.isOwned;
    this.#enqueue = dependencies.enqueue;
    this.#settle = dependencies.settle;
    this.#ownershipKey = dependencies.ownershipKey;
    this.#assertGenericProviderAction = dependencies.assertGenericProviderAction;
    this.#completeAdapterOperation = dependencies.completeAdapterOperation;
  }

  async reconcile(
    runId: string,
    actorAgentId: string,
    input: { adapterId: string; actionId: string; commandId: string },
  ): Promise<ProviderActionResult> {
    return await this.#track(
      async () => {
        assertProviderActionOwner(this.#database, {
          runId,
          adapterId: input.adapterId,
          actionId: input.actionId,
        }, "generic");
        const replay = this.#commandJournal.read(
          runId,
          actorAgentId,
          input.commandId,
          input,
          isProviderActionResult,
        );
        if (replay !== undefined) return replay;
        this.#assertChair(runId, actorAgentId);
        const key = this.#ownershipKey(runId, input.adapterId, input.actionId);
        const existing = this.#providerActionReconciliations.get(key);
        if (existing !== undefined) {
          await existing;
          const concurrentReplay = this.#commandJournal.read(
            runId,
            actorAgentId,
            input.commandId,
            input,
            isProviderActionResult,
          );
          if (concurrentReplay !== undefined) {
            assertProviderActionOwner(this.#database, {
              runId,
              adapterId: input.adapterId,
              actionId: input.actionId,
            }, "generic");
            return concurrentReplay;
          }
          this.#assertChair(runId, actorAgentId);
          this.#assertGenericProviderAction(runId, input.adapterId, input.actionId);
          const current = this.#get(runId, input.adapterId, input.actionId);
          if (current.status === "terminal" || current.status === "quarantined") {
            this.#commandJournal.write(runId, actorAgentId, input.commandId, input, current);
            return current;
          }
          return await this.#reconcileProviderAction(runId, actorAgentId, input);
        }
        const owned = this.#reconcileProviderAction(runId, actorAgentId, input);
        this.#providerActionReconciliations.set(key, owned);
        try {
          return await owned;
        } finally {
          if (this.#providerActionReconciliations.get(key) === owned) {
            this.#providerActionReconciliations.delete(key);
          }
        }
      },
    );
  }

  async #reconcileProviderAction(
    runId: string,
    actorAgentId: string,
    input: { adapterId: string; actionId: string; commandId: string },
    expectedOwner: ProviderActionCustodyOwner = "generic",
  ): Promise<ProviderActionResult> {
    this.#assertChair(runId, actorAgentId);
    assertProviderActionOwner(this.#database, {
      runId,
      adapterId: input.adapterId,
      actionId: input.actionId,
    }, expectedOwner);
    const replay = this.#commandJournal.read(runId, actorAgentId, input.commandId, input, isProviderActionResult);
    if (replay !== undefined) return replay;
    const stored = rowOrNotFound(
      this.#database
        .prepare("SELECT adapter_id, operation, payload_json, status, idempotency_proven, target_agent_id, budget_state FROM provider_actions WHERE run_id = ? AND adapter_id = ? AND action_id = ?")
        .get(runId, input.adapterId, input.actionId),
      "provider action",
    );
    const storedPayload: unknown = JSON.parse(stringField(stored, "payload_json"));
    if (!isRow(storedPayload)) throw new Error("stored provider action payload is invalid");
    const answerBearing = stored.operation === "spawn" && isTaskBoundEphemeralProviderPayload(storedPayload);
    const quarantine = (candidate: ProviderActionResult): ProviderActionResult => {
      const quarantined: ProviderActionResult = {
        ...candidate,
        status: "quarantined",
      };
      delete quarantined.providerAnswer;
      if (answerBearing) delete quarantined.result;
      this.#persist(runId, input.adapterId, input.actionId, { idempotencyProven: false }, quarantined, expectedOwner);
      this.#settle(runId, input.adapterId, input.actionId, "quarantined");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, quarantined);
      return quarantined;
    };
    let result = this.#get(runId, input.adapterId, input.actionId);
    if (this.#isOwned(runId, input.adapterId, input.actionId)) {
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }
    if (result.status === "prepared") {
      if (answerBearing) {
        const adapterId = stringField(stored, "adapter_id");
        this.#enqueue({
          runId,
          adapterId,
          actionId: input.actionId,
          owner: expectedOwner,
          execute: async () => await this.#completeAdapterOperation({
            runId,
            adapterId,
            actionId: input.actionId,
            operation: "spawn",
            method: "spawn",
            payload: storedPayload,
            requireProviderAnswer: true,
            owner: expectedOwner,
          }),
        });
        result = this.#get(runId, input.adapterId, input.actionId);
        this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
        return result;
      }
      if (typeof stored.target_agent_id === "string") {
        this.#assertProviderPrincipalActive(runId, stored.target_agent_id);
      }
      const adapterId = stringField(stored, "adapter_id");
      assertProviderActionOwner(this.#database, {
        runId,
        adapterId: input.adapterId,
        actionId: input.actionId,
      }, expectedOwner);
      this.#database
        .prepare("UPDATE provider_actions SET status = 'dispatched', history_json = '[\"prepared\",\"dispatched\"]', execution_count = 1, updated_at = ? WHERE run_id = ? AND adapter_id = ? AND action_id = ?")
        .run(this.#clock(), runId, input.adapterId, input.actionId);
      try {
        const response = await this.#requestAdapter(adapterId, "dispatch", { actionId: input.actionId, operation: stringField(stored, "operation"), payload: storedPayload });
        result = providerActionResultWithRequiredAnswer(response, answerBearing, input.actionId);
        this.#persist(runId, input.adapterId, input.actionId, response, result, expectedOwner);
      } catch (error: unknown) {
        if (error instanceof ProviderActionOwnerError) throw error;
        result = {
          actionId: input.actionId,
          status: "ambiguous",
          history: ["prepared", "dispatched", "ambiguous"],
          executionCount: 1,
          effectCount: 0,
        };
        this.#persist(runId, input.adapterId, input.actionId, { idempotencyProven: false }, result, expectedOwner);
      }
      this.#settle(runId, input.adapterId, input.actionId, result.status === "terminal" ? "terminal" : "ambiguous");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }
    const resolvedEffectWithUnknownUsage = answerBearing &&
      (result.status === "terminal" || result.status === "quarantined") &&
      stored.budget_state === "usage-unknown";
    const resolvedEffectResult = result;
    const preserveResolvedEffect = (): ProviderActionResult => {
      assertProviderActionOwner(this.#database, {
        runId,
        adapterId: input.adapterId,
        actionId: input.actionId,
      }, expectedOwner);
      this.#settle(
        runId,
        input.adapterId,
        input.actionId,
        resolvedEffectResult.status === "terminal" ? "terminal" : "quarantined",
      );
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, resolvedEffectResult);
      return resolvedEffectResult;
    };
    if (result.status !== "ambiguous" && result.status !== "dispatched" && !resolvedEffectWithUnknownUsage) {
      this.#settle(runId, input.adapterId, input.actionId, result.status === "terminal" ? "terminal" : "quarantined");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }
    const adapterId = stringField(stored, "adapter_id");
    let lookup: unknown;
    try {
      assertProviderActionOwner(this.#database, {
        runId,
        adapterId: input.adapterId,
        actionId: input.actionId,
      }, expectedOwner);
      lookup = await this.#requestAdapter(adapterId, "lookup_action", { actionId: input.actionId });
    } catch (error: unknown) {
      if (error instanceof ProviderActionOwnerError) throw error;
      if (resolvedEffectWithUnknownUsage) return preserveResolvedEffect();
      return quarantine(result);
    }
    let lookedUp: ProviderActionResult;
    try {
      lookedUp = providerActionResultWithRequiredAnswer(lookup, answerBearing, input.actionId);
    } catch {
      if (resolvedEffectWithUnknownUsage) return preserveResolvedEffect();
      return quarantine(result);
    }
    const idempotencyProven = numberField(stored, "idempotency_proven") === 1 ||
      (isRow(lookup) && lookup.idempotencyProven === true);
    if (lookedUp.status === "terminal") {
      result = lookedUp;
      try {
        this.#persist(runId, input.adapterId, input.actionId, lookup, result, expectedOwner);
      } catch (error: unknown) {
        if (error instanceof ProviderActionOwnerError) throw error;
        if (resolvedEffectWithUnknownUsage) return preserveResolvedEffect();
        return quarantine(this.#get(runId, input.adapterId, input.actionId));
      }
    } else if (resolvedEffectWithUnknownUsage) {
      return preserveResolvedEffect();
    } else if (idempotencyProven && !answerBearing) {
      if (typeof stored.target_agent_id === "string") {
        this.#assertProviderPrincipalActive(runId, stored.target_agent_id);
      }
      assertProviderActionOwner(this.#database, {
        runId,
        adapterId: input.adapterId,
        actionId: input.actionId,
      }, expectedOwner);
      const replayed = await this.#requestAdapter(adapterId, "dispatch", { actionId: input.actionId, operation: stringField(stored, "operation"), payload: storedPayload });
      try {
        result = providerActionResultWithRequiredAnswer(replayed, answerBearing, input.actionId);
      } catch {
        return quarantine(result);
      }
      try {
        this.#persist(runId, input.adapterId, input.actionId, replayed, result, expectedOwner);
      } catch {
        return quarantine(this.#get(runId, input.adapterId, input.actionId));
      }
    } else {
      return quarantine(lookedUp);
    }
    this.#settle(runId, input.adapterId, input.actionId, result.status === "terminal" ? "terminal" : "quarantined");
    this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
    return result;
  }

  #quarantineProviderActionOwnerAtStartup(
    recovery: ProviderActionOwnerStartupRow, now: number, payload: Readonly<{ owner: string; reason: string }>,
  ): boolean {
    const identity = recovery.diagnosticRef;
    try {
      return quarantineProviderActionOwnerAtStartup(this.#database, recovery, now, () => this.#event(
        identity.runId, "startup-provider-action-quarantined", null,
        { actionId: identity.actionId, adapterId: identity.adapterId, ...payload },
      ));
    } catch (error: unknown) {
      this.#event(identity.runId, "startup-provider-action-quarantine-failed", null, {
        actionId: identity.actionId, adapterId: identity.adapterId, rowId: recovery.rowId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async #recoverCertifyingReviewProviderActions(): Promise<{
    actionsReconciled: number;
    actionsQuarantined: number;
  }> {
    let actionsReconciled = 0;
    let actionsQuarantined = 0;
    const pending = this.#database.prepare(`
      SELECT CAST(p.rowid AS TEXT) AS provider_action_rowid,p.run_id,p.adapter_id,p.action_id,p.status,p.updated_at,r.chair_agent_id
        FROM provider_actions p LEFT JOIN runs r ON r.run_id=p.run_id
       WHERE p.status IN ('prepared','dispatched','ambiguous')
       ORDER BY p.updated_at,p.action_id
    `).all().flatMap((value) => {
      const recovery = classifyProviderActionOwnerRowForStartup(this.#database, value);
      return recovery.owner === "certifying_review" && recovery.ref !== null ? [recovery] : [];
    });
    for (const recovery of pending) {
      const { action, ref } = recovery;
      if (ref === null) throw new Error("certifying review startup provider action identity is unavailable");
      try {
        const result = await this.#reconcileProviderAction(ref.runId, stringField(action, "chair_agent_id"), {
          adapterId: ref.adapterId, actionId: ref.actionId,
          commandId: `certifying-review-recovery:${ref.actionId}:${stringField(action, "status")}:${numberField(action, "updated_at")}`,
        }, "certifying_review");
        if (result.status === "quarantined") actionsQuarantined += 1; else actionsReconciled += 1;
      } catch (error: unknown) {
        if (this.#quarantineProviderActionOwnerAtStartup(recovery, this.#clock(), {
          owner: error instanceof ProviderActionOwnerError ? error.actualOwner : recovery.owner,
          reason: error instanceof Error ? error.message : String(error),
        })) actionsQuarantined += 1;
      }
    }
    return { actionsReconciled, actionsQuarantined };
  }

  async recoverStartupProviderActions(now: number): Promise<{
    actionsReconciled: number;
    actionsQuarantined: number;
  }> {
    const certifyingReviewRecovery = await this.#recoverCertifyingReviewProviderActions();
    let { actionsReconciled, actionsQuarantined } = certifyingReviewRecovery;
    const pendingActions = this.#database.prepare(`
      SELECT CAST(p.rowid AS TEXT) AS provider_action_rowid,p.run_id,p.action_id,p.adapter_id,p.status,p.updated_at,r.chair_agent_id
       FROM provider_actions p LEFT JOIN runs r ON r.run_id = p.run_id
       WHERE p.status IN ('prepared', 'dispatched', 'ambiguous')
       ORDER BY p.updated_at, p.action_id
    `).all().flatMap((value) => {
      const recovery = classifyProviderActionOwnerRowForStartup(this.#database, value);
      if (recovery.owner === "integrity_failed") {
        if (this.#quarantineProviderActionOwnerAtStartup(
          recovery, now, { owner: recovery.owner, reason: recovery.reason },
        )) actionsQuarantined += 1;
      }
      return recovery.owner === "generic" && recovery.ref !== null ? [recovery] : [];
    });
    for (const recovery of pendingActions) {
      const { action, ref } = recovery;
      if (ref === null) throw new Error("generic startup provider action identity is unavailable");
      try {
        const result = await this.reconcile(ref.runId, stringField(action, "chair_agent_id"), {
          adapterId: ref.adapterId, actionId: ref.actionId,
          commandId: `startup-recovery:${ref.actionId}:${stringField(action, "status")}:${numberField(action, "updated_at")}`,
        });
        if (result.status === "quarantined") actionsQuarantined += 1; else actionsReconciled += 1;
      } catch (error: unknown) {
        if (this.#quarantineProviderActionOwnerAtStartup(recovery, now, {
          owner: error instanceof ProviderActionOwnerError ? error.actualOwner : recovery.owner,
          reason: error instanceof Error ? error.message : String(error),
        })) actionsQuarantined += 1;
      }
    }
    return { actionsReconciled, actionsQuarantined };
  }
}

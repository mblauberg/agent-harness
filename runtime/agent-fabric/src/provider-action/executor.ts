import type Database from "better-sqlite3";
import { createHash } from "node:crypto";

import type { CommandJournal } from "../application/command-journal.js";
import {
  ProviderActionAdmissionCoordinator,
  ProviderActionAdmissionTransactionError,
  type ProviderActionTicket,
} from "../application/provider-action-admission.js";
import {
  assertProviderActionOwner,
  ProviderActionOwnerError,
  type ProviderActionCustodyOwner,
} from "../application/provider-action-owner.js";
import type { ProviderSessionCoordinator } from "../application/provider-session-coordinator.js";
import { FabricError } from "../errors.js";
import { ProjectFabricCoreError } from "../project-session/contracts.js";
import type { ProviderActionResult } from "../core/contracts.js";
import { providerAnswerFromAdapterResult } from "./state.js";

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function rowOrNotFound(value: unknown, label: string): Row {
  if (!isRow(value)) {
    throw new FabricError("NOT_FOUND", `${label} was not found`);
  }
  return value;
}

function stringField(row: Row, field: string): string {
  const value = row[field];
  if (typeof value !== "string") {
    throw new Error(`database field ${field} is not a string`);
  }
  return value;
}

/**
 * Generic admission, provider I/O, and completion for generic provider actions. This is the
 * executor in the generic provider-action vertical: it commits the durable admission transaction
 * (immediate or deferred), performs the provider request, and translates the provider response into
 * a terminal or ambiguous result. Persistence and settlement remain owned by
 * `ProviderActionState`; this class depends on it only through the narrow `get`, `enqueueDeferred`,
 * and `persist` ports.
 */
export class ProviderActionExecutor {
  readonly #database: Database.Database;
  readonly #clock: () => number;
  readonly #commandJournal: CommandJournal;
  readonly #providerActionAdmission: ProviderActionAdmissionCoordinator;
  readonly #providerSessions: ProviderSessionCoordinator;
  readonly #requestAdapter: (adapterId: string, method: string, params: Record<string, unknown>) => Promise<unknown>;
  readonly #getProviderAction: (runId: string, adapterId: string, actionId: string) => ProviderActionResult;
  readonly #enqueueDeferred: (input: {
    runId: string;
    adapterId: string;
    actionId: string;
    owner?: ProviderActionCustodyOwner;
    execute: () => Promise<ProviderActionResult>;
  }) => void;
  readonly #persistProviderAction: (
    runId: string,
    adapterId: string,
    actionId: string,
    raw: unknown,
    result: ProviderActionResult,
    expectedOwner?: ProviderActionCustodyOwner,
  ) => void;

  constructor(dependencies: Readonly<{
    database: Database.Database;
    clock: () => number;
    commandJournal: CommandJournal;
    providerActionAdmission: ProviderActionAdmissionCoordinator;
    providerSessions: ProviderSessionCoordinator;
    requestAdapter: (adapterId: string, method: string, params: Record<string, unknown>) => Promise<unknown>;
    getProviderAction: (runId: string, adapterId: string, actionId: string) => ProviderActionResult;
    enqueueDeferred: (input: {
      runId: string;
      adapterId: string;
      actionId: string;
      owner?: ProviderActionCustodyOwner;
      execute: () => Promise<ProviderActionResult>;
    }) => void;
    persistProviderAction: (
      runId: string,
      adapterId: string,
      actionId: string,
      raw: unknown,
      result: ProviderActionResult,
      expectedOwner?: ProviderActionCustodyOwner,
    ) => void;
  }>) {
    this.#database = dependencies.database;
    this.#clock = dependencies.clock;
    this.#commandJournal = dependencies.commandJournal;
    this.#providerActionAdmission = dependencies.providerActionAdmission;
    this.#providerSessions = dependencies.providerSessions;
    this.#requestAdapter = dependencies.requestAdapter;
    this.#getProviderAction = dependencies.getProviderAction;
    this.#enqueueDeferred = dependencies.enqueueDeferred;
    this.#persistProviderAction = dependencies.persistProviderAction;
  }

  async executeGenericAdapterOperation(input: {
    runId: string;
    adapterId: string;
    actionId: string;
    operation: string;
    method: string;
    payload: Record<string, unknown>;
    requireProviderAnswer?: true;
    authorityBudget?: Readonly<{
      authorityId: string;
      reservation: Readonly<Record<string, number>>;
    }>;
    taskId?: string;
    deferCompletion?: true;
    deferredCommand?: {
      actorAgentId: string;
      commandId: string;
      payload: unknown;
    };
    revalidateAdmission?: () => void;
    providerActionTicket?: ProviderActionTicket;
  }): Promise<ProviderActionResult> {
    const payloadJson = canonicalJson(input.payload);
    const targetAgentId = typeof input.payload.agentId === "string" ? input.payload.agentId : undefined;
    const providerSessionGeneration = typeof input.payload.generation === "number"
      ? input.payload.generation
      : undefined;
    const identityHash = sha256(canonicalJson({
      adapterId: input.adapterId,
      operation: input.operation,
      targetAgentId: targetAgentId ?? null,
      providerSessionGeneration: providerSessionGeneration ?? null,
      ...(input.authorityBudget === undefined ? {} : { authorityId: input.authorityBudget.authorityId }),
      payload: input.payload,
    }));
    const existingAction = this.#database.prepare(`
      SELECT 1 FROM provider_actions
       WHERE run_id=? AND adapter_id=? AND action_id=?
    `).get(input.runId, input.adapterId, input.actionId);
    if (existingAction !== undefined) {
      assertProviderActionOwner(this.#database, input, "generic");
    }
    const existing = existingAction !== undefined && this.#providerSessions.assertActionIdentity({
      runId: input.runId,
      actionId: input.actionId,
      adapterId: input.adapterId,
      operation: input.operation,
      identityHash,
      ...(targetAgentId === undefined ? {} : { targetAgentId }),
      ...(providerSessionGeneration === undefined ? {} : { providerSessionGeneration }),
    });
    if (existing) {
      return this.#getProviderAction(input.runId, input.adapterId, input.actionId);
    }
    const deferred = input.deferCompletion === true;
    if (deferred && input.deferredCommand === undefined) {
      throw new Error("deferred provider action requires atomic command custody");
    }
    const receipt: ProviderActionResult = {
      actionId: input.actionId,
      status: deferred ? "prepared" : "dispatched",
      history: deferred ? ["prepared"] : ["prepared", "dispatched"],
      executionCount: deferred ? 0 : 1,
      effectCount: 0,
    };
    try {
      this.#database.transaction(() => {
        input.revalidateAdmission?.();
        if (input.authorityBudget !== undefined) {
          if (input.taskId === undefined) throw new Error("provider budget requires an exact task binding");
          const task = rowOrNotFound(
            this.#database.prepare("SELECT state FROM tasks WHERE run_id=? AND task_id=?").get(input.runId, input.taskId),
            "ephemeral provider task",
          );
          if (["complete", "cancelled", "degraded"].includes(stringField(task, "state"))) {
            throw new ProjectFabricCoreError(
              "LIFECYCLE_PRECONDITION_FAILED",
              "terminal task cannot admit an ephemeral provider spawn",
            );
          }
        }
        if (input.providerActionTicket === undefined) {
          throw new Error("provider action admission ticket is required");
        }
        this.#providerActionAdmission.admitUnroutedInCurrentTransaction(input.providerActionTicket, {
          runId: input.runId,
          actionId: input.actionId,
          adapterId: input.adapterId,
          operation: input.operation,
          targetAgentId: targetAgentId ?? null,
          providerSessionGeneration: providerSessionGeneration ?? null,
          identityHash,
          payloadHash: sha256(payloadJson),
          payloadJson,
          status: receipt.status,
          historyJson: canonicalJson(receipt.history),
          executionCount: receipt.executionCount,
          updatedAt: this.#clock(),
          taskId: input.taskId ?? null,
          budgetAuthorityId: input.authorityBudget?.authorityId ?? null,
          budgetReservationJson: input.authorityBudget === undefined
            ? null
            : canonicalJson(input.authorityBudget.reservation),
          budgetState: input.authorityBudget === undefined ? null : "reserved",
          budgetStartedAt: input.authorityBudget === undefined ? null : this.#clock(),
        }, "generic", () => {
          if (input.deferredCommand !== undefined) {
            this.#commandJournal.write(
              input.runId,
              input.deferredCommand.actorAgentId,
              input.deferredCommand.commandId,
              input.deferredCommand.payload,
              receipt,
            );
          }
        });
      }).immediate();
    } catch (error: unknown) {
      if (
        input.authorityBudget !== undefined && error instanceof Error &&
        error.message.includes("INVARIANT_provider_actions_budget_reservation")
      ) {
        const unknown = Object.keys(input.authorityBudget.reservation).some((unit) => isRow(
          this.#database.prepare(`
            SELECT 1 FROM authority_budget
             WHERE authority_id=? AND unit_key=? AND usage_unknown=1
          `).get(input.authorityBudget?.authorityId, unit),
        ));
        const budgetError = new FabricError(
          unknown ? "BUDGET_USAGE_UNKNOWN" : "BUDGET_EXCEEDED",
          unknown ? "delegated provider usage became unknown before admission" : "delegated provider budget was concurrently exhausted",
          { cause: error },
        );
        throw new ProviderActionAdmissionTransactionError(budgetError);
      }
      throw error;
    }
    const complete = async (): Promise<ProviderActionResult> => await this.completeAdapterOperation(input);
    if (deferred) {
      this.#enqueueDeferred({
        runId: input.runId,
        adapterId: input.adapterId,
        actionId: input.actionId,
        execute: complete,
      });
      return receipt;
    }
    return await complete();
  }

  async executeGenericRelease(input: {
    runId: string;
    adapterId: string;
    actionId: string;
    operation: string;
    method: string;
    payload: Record<string, unknown>;
    providerActionTicket?: ProviderActionTicket;
  }): Promise<ProviderActionResult> {
    return await this.executeGenericAdapterOperation(input);
  }

  async completeAdapterOperation(input: {
    runId: string;
    adapterId: string;
    actionId: string;
    operation: string;
    method: string;
    payload: Record<string, unknown>;
    requireProviderAnswer?: true;
    owner?: ProviderActionCustodyOwner;
  }): Promise<ProviderActionResult> {
    const owner = input.owner ?? "generic";
    assertProviderActionOwner(this.#database, input, owner);
    try {
      const response = await this.#requestAdapter(input.adapterId, input.method, {
        ...input.payload,
        actionId: input.actionId,
        payload: input.payload,
      });
      const providerAnswer = input.requireProviderAnswer === true
        ? providerAnswerFromAdapterResult(response)
        : undefined;
      const result: ProviderActionResult = {
        actionId: input.actionId,
        status: "terminal",
        history: ["prepared", "dispatched", "accepted", "terminal"],
        executionCount: 1,
        effectCount: 1,
        result: response,
        ...(providerAnswer === undefined ? {} : { providerAnswer }),
      };
      this.#persistProviderAction(input.runId, input.adapterId, input.actionId, { idempotencyProven: true }, result, owner);
      return result;
    } catch (error: unknown) {
      if (error instanceof ProviderActionOwnerError) throw error;
      const ambiguous: ProviderActionResult = {
        actionId: input.actionId,
        status: "ambiguous",
        history: ["prepared", "dispatched", "ambiguous"],
        executionCount: 1,
        effectCount: 0,
      };
      this.#persistProviderAction(input.runId, input.adapterId, input.actionId, { idempotencyProven: false }, ambiguous, owner);
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", `adapter ${input.operation} result is ambiguous`, { cause: error });
    }
  }
}

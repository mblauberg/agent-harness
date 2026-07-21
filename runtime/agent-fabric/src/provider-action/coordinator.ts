import type Database from "better-sqlite3";
import { createHash } from "node:crypto";

import type { CommandJournal } from "../application/command-journal.js";
import {
  ProviderActionAdmissionCoordinator,
  ProviderActionAdmissionTransactionError,
} from "../application/provider-action-admission.js";
import {
  assertProviderActionOwner,
  ProviderActionOwnerError,
} from "../application/provider-action-owner.js";
import type { ProviderSessionCoordinator } from "../application/provider-session-coordinator.js";
import {
  canonicaliseProviderActionDispatchRequest,
  type ProviderActionDispatchRequest,
} from "../application/provider-action-dispatch-request.js";
import { FABRIC_OPERATIONS } from "../domain/operations.js";
import { FabricError } from "../errors.js";
import {
  assertRunAcceptingWork,
  resolveTaskBindingForActiveWork,
} from "../operator/production-action-ports.js";
import { assertScopedOperationAllowed, assertScopedTaskReadinessAllowed } from "../gates/store.js";
import { ProjectFabricCoreError } from "../project-session/contracts.js";
import type { ProviderActionResult } from "../core/contracts.js";
import { ProviderPayloadAuthority } from "./payload-authority.js";
import { ProviderActionState, isProviderActionResult, providerActionResult } from "./state.js";
import { ProviderActionExecutor } from "./executor.js";
import { ProviderActionRecovery } from "./recovery.js";

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

const MAXIMUM_EPHEMERAL_PROVIDER_PROMPT_BYTES = 65_536;

/**
 * Public command coordination for the generic provider-action vertical. This is the sole owner of
 * `dispatch`: request canonicalisation, state tracking, replay/chair/owner fences, task/scope gates,
 * target/session binding, preflight/join, direct dispatch, journalling, and terminal/ambiguous
 * coordination. `reconcile` and `get` are thin forwards to the recovery and state modules
 * respectively.
 */
export class ProviderActionCoordinator {
  readonly #database: Database.Database;
  readonly #clock: () => number;
  readonly #fault: (label: string) => void;
  readonly #commandJournal: CommandJournal;
  readonly #providerActionAdmission: ProviderActionAdmissionCoordinator;
  readonly #providerSessions: ProviderSessionCoordinator;
  readonly #payloadAuthority: ProviderPayloadAuthority;
  readonly #providerActionState: ProviderActionState;
  readonly #providerActionExecutor: ProviderActionExecutor;
  readonly #providerActionRecovery: ProviderActionRecovery;
  readonly #assertChair: (runId: string, actorAgentId: string) => void;
  readonly #assertAdapterEnabled: (adapterId: string) => void;
  readonly #assertAdapterOperation: (capabilities: unknown, operation: string) => void;
  readonly #requestAdapter: (adapterId: string, method: string, params: Record<string, unknown>) => Promise<unknown>;
  readonly #isClosing: () => boolean;

  constructor(dependencies: Readonly<{
    database: Database.Database;
    clock: () => number;
    fault: (label: string) => void;
    commandJournal: CommandJournal;
    providerActionAdmission: ProviderActionAdmissionCoordinator;
    providerSessions: ProviderSessionCoordinator;
    payloadAuthority: ProviderPayloadAuthority;
    providerActionState: ProviderActionState;
    providerActionExecutor: ProviderActionExecutor;
    providerActionRecovery: ProviderActionRecovery;
    assertChair: (runId: string, actorAgentId: string) => void;
    assertAdapterEnabled: (adapterId: string) => void;
    assertAdapterOperation: (capabilities: unknown, operation: string) => void;
    requestAdapter: (adapterId: string, method: string, params: Record<string, unknown>) => Promise<unknown>;
    isClosing: () => boolean;
  }>) {
    this.#database = dependencies.database;
    this.#clock = dependencies.clock;
    this.#fault = dependencies.fault;
    this.#commandJournal = dependencies.commandJournal;
    this.#providerActionAdmission = dependencies.providerActionAdmission;
    this.#providerSessions = dependencies.providerSessions;
    this.#payloadAuthority = dependencies.payloadAuthority;
    this.#providerActionState = dependencies.providerActionState;
    this.#providerActionExecutor = dependencies.providerActionExecutor;
    this.#providerActionRecovery = dependencies.providerActionRecovery;
    this.#assertChair = dependencies.assertChair;
    this.#assertAdapterEnabled = dependencies.assertAdapterEnabled;
    this.#assertAdapterOperation = dependencies.assertAdapterOperation;
    this.#requestAdapter = dependencies.requestAdapter;
    this.#isClosing = dependencies.isClosing;
  }

  async dispatch(
    runId: string,
    actorAgentId: string,
    input: ProviderActionDispatchRequest,
  ): Promise<ProviderActionResult> {
    const canonicalInput = canonicaliseProviderActionDispatchRequest(input);
    return await this.#providerActionState.trackGenericOperation(
      async () => await this.#dispatch(runId, actorAgentId, canonicalInput),
    );
  }

  async reconcile(
    runId: string,
    actorAgentId: string,
    input: { adapterId: string; actionId: string; commandId: string },
  ): Promise<ProviderActionResult> {
    return await this.#providerActionRecovery.reconcile(runId, actorAgentId, input);
  }

  get(runId: string, adapterId: string, actionId: string): ProviderActionResult {
    return this.#providerActionState.get(runId, adapterId, actionId);
  }

  async #dispatch(
    runId: string,
    actorAgentId: string,
    input: ProviderActionDispatchRequest,
  ): Promise<ProviderActionResult> {
    this.#providerActionState.assertGenericProviderAction(runId, input.adapterId, input.actionId);
    const replay = this.#commandJournal.read(runId, actorAgentId, input.commandId, input, isProviderActionResult);
    if (replay !== undefined) {
      this.#fault("provider-action-owner:before-reentry-acknowledgement");
      assertProviderActionOwner(this.#database, {
        runId,
        adapterId: input.adapterId,
        actionId: input.actionId,
      }, "generic");
      return replay;
    }
    this.#assertChair(runId, actorAgentId);
    this.#providerActionState.assertGenericProviderAction(runId, input.adapterId, input.actionId);
    const existingAction = this.#database.prepare(`
      SELECT payload_json FROM provider_actions
       WHERE run_id=? AND adapter_id=? AND action_id=?
    `).get(runId, input.adapterId, input.actionId);
    let existingPayload: Record<string, unknown> | undefined;
    if (isRow(existingAction)) {
      const value: unknown = JSON.parse(stringField(existingAction, "payload_json"));
      if (!isRow(value)) throw new Error("stored provider action payload is invalid");
      existingPayload = value;
    }
    const ephemeralSpawn = input.operation === "spawn";
    let ephemeralMaxTurns: number | undefined;
    let ephemeralProviderAuthorityId: string | undefined;
    const target = ephemeralSpawn
      ? undefined
      : this.#providerSessions.resolveTarget(runId, input.adapterId, input.payload);
    if (input.operation === "send_turn" && target === undefined) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "send_turn requires a bound provider session target");
    }
    const taskValue = ephemeralSpawn ? input.taskId : input.payload.taskId;
    if (taskValue !== undefined && typeof taskValue !== "string") {
      throw new FabricError("CAPABILITY_FORBIDDEN", "provider task ID must be text");
    }
    if (ephemeralSpawn && taskValue === undefined) {
      throw new ProjectFabricCoreError("PROTOCOL_INVALID", "ephemeral provider spawn requires an exact task ID");
    }
    if (ephemeralSpawn) {
      if (input.authorityId === undefined) {
        throw new ProjectFabricCoreError("PROTOCOL_INVALID", "ephemeral provider spawn requires delegated authority");
      }
      const reservedTurns = input.payload.maxTurns === undefined ? 1 : input.payload.maxTurns;
      if (
        typeof reservedTurns !== "number" ||
        !Number.isSafeInteger(reservedTurns) ||
        reservedTurns < 1
      ) {
        throw new ProjectFabricCoreError("PROTOCOL_INVALID", "ephemeral provider spawn maxTurns must be a positive safe integer");
      }
      ephemeralMaxTurns = reservedTurns;
      if (
        typeof input.payload.modelFamily !== "string" || input.payload.modelFamily.trim().length === 0 ||
        typeof input.payload.prompt !== "string" || input.payload.prompt.trim().length === 0 ||
        Buffer.byteLength(input.payload.prompt, "utf8") > MAXIMUM_EPHEMERAL_PROVIDER_PROMPT_BYTES
      ) {
        throw new ProjectFabricCoreError(
          "PROTOCOL_INVALID",
          "ephemeral provider spawn requires a bounded prompt and explicit model family",
        );
      }
    } else if (input.authorityId !== undefined) {
      throw new ProjectFabricCoreError("PROTOCOL_INVALID", "delegated provider authority is spawn-only");
    }
    const existingTaskValue = existingPayload?.taskId;
    const replayTaskId = typeof taskValue === "string"
      ? taskValue
      : typeof existingTaskValue === "string" ? existingTaskValue : undefined;
    const taskId = input.operation === "spawn" || input.operation === "send_turn" || input.operation === "steer"
      ? existingPayload === undefined
        ? resolveTaskBindingForActiveWork(
          this.#database,
          runId,
          target?.agentId ?? actorAgentId,
          taskValue,
        )
        : replayTaskId
      : undefined;
    const operationTarget = taskId === undefined
      ? { kind: "run" as const }
      : { kind: "task" as const, taskId: taskId as never };
    if (existingPayload === undefined) {
      assertScopedOperationAllowed(
        this.#database,
        runId,
        FABRIC_OPERATIONS.dispatchProviderAction,
        operationTarget,
      );
      if (taskId !== undefined) assertScopedTaskReadinessAllowed(this.#database, runId, taskId);
      if (input.operation !== "send_turn" && input.operation !== "steer") {
        assertRunAcceptingWork(this.#database, runId);
      }
    }
    const taskBoundPayload = taskId === undefined
      ? input.payload
      : {
          ...input.payload,
          taskId,
          ...(ephemeralMaxTurns === undefined ? {} : { maxTurns: ephemeralMaxTurns }),
        };
    let admittedInputPayload = taskBoundPayload;
    if (target !== undefined) {
      if (existingPayload === undefined) this.#payloadAuthority.assertProviderPrincipalActive(runId, target.agentId);
      if (taskId !== undefined) {
        const taskMember = this.#database.prepare(`
          SELECT 1 FROM tasks task
           WHERE task.run_id=? AND task.task_id=? AND (
             task.owner_agent_id=? OR EXISTS (
               SELECT 1 FROM task_participants participant
                WHERE participant.run_id=task.run_id AND participant.task_id=task.task_id
                  AND participant.agent_id=?
             )
           )
        `).get(runId, taskId, target.agentId, target.agentId);
        if (!isRow(taskMember)) {
          throw new FabricError("CAPABILITY_FORBIDDEN", "provider target is outside the exact task scope");
        }
      }
      const targetAgent = rowOrNotFound(
        this.#database.prepare("SELECT authority_id FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, target.agentId),
        "provider target agent",
      );
      admittedInputPayload = this.#payloadAuthority.admitProviderPayload(
        runId,
        stringField(targetAgent, "authority_id"),
        taskBoundPayload,
        existingPayload === undefined,
        input.operation === "send_turn"
          ? existingPayload?.executionProfile === "workspace-write-offline" && typeof existingPayload.cwd === "string"
            ? { workspacePath: existingPayload.cwd }
            : existingPayload === undefined ? { actorAgentId, taskId } : undefined
          : undefined,
      );
    } else {
      this.#assertAdapterEnabled(input.adapterId);
      if (taskId !== undefined) {
        const taskMember = this.#database.prepare(`
          SELECT 1 FROM tasks task
           WHERE task.run_id=? AND task.task_id=? AND (
             task.owner_agent_id=? OR EXISTS (
               SELECT 1 FROM task_participants participant
                WHERE participant.run_id=task.run_id AND participant.task_id=task.task_id
                  AND participant.agent_id=?
             )
           )
        `).get(runId, taskId, actorAgentId, actorAgentId);
        if (!isRow(taskMember)) {
          throw new FabricError("CAPABILITY_FORBIDDEN", "provider actor is outside the exact task scope");
        }
      }
      const actor = rowOrNotFound(
        this.#database.prepare("SELECT authority_id FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, actorAgentId),
        "provider actor",
      );
      let providerAuthorityId = stringField(actor, "authority_id");
      if (ephemeralSpawn) {
        this.#payloadAuthority.assertEphemeralProviderAuthority(runId, actorAgentId, input.authorityId as string);
        providerAuthorityId = input.authorityId as string;
        ephemeralProviderAuthorityId = providerAuthorityId;
      }
      admittedInputPayload = this.#payloadAuthority.admitProviderPayload(
        runId,
        providerAuthorityId,
        taskBoundPayload,
        existingPayload === undefined,
        input.operation === "spawn" || input.operation === "send_turn"
          ? existingPayload?.executionProfile === "workspace-write-offline" && typeof existingPayload.cwd === "string"
            ? { workspacePath: existingPayload.cwd }
            : existingPayload === undefined ? { actorAgentId, taskId } : undefined
          : undefined,
      );
    }
    if (
      existingPayload === undefined &&
      (input.operation === "spawn" || input.operation === "send_turn" || input.operation === "steer")
    ) {
      this.#payloadAuthority.assertAdapterModel(input.adapterId, admittedInputPayload);
    }
    const identityHash = sha256(canonicalJson({
      adapterId: input.adapterId,
      operation: input.operation,
      targetAgentId: target?.agentId ?? null,
      providerSessionGeneration: target?.providerSessionGeneration ?? null,
      ...(ephemeralSpawn ? { authorityId: input.authorityId } : {}),
      payload: admittedInputPayload,
    }));
    const providerActionTicket = this.#providerActionAdmission.preflightAgentAction({
      runId,
      actorAgentId,
      actionRef: { adapterId: input.adapterId, actionId: input.actionId },
      canonicalInput: {
        schemaVersion: 1,
        scope: { kind: "run-action", runId },
        actionRef: { adapterId: input.adapterId, actionId: input.actionId },
        operation: input.operation,
        taskId: taskId ?? null,
        authorityId: ephemeralSpawn ? input.authorityId : null,
        targetAgentId: target?.agentId ?? null,
        providerSessionGeneration: target?.providerSessionGeneration ?? null,
        providerPayload: admittedInputPayload,
        routeRequest: null,
        certifyingBinding: null,
      },
    });
    if (providerActionTicket.disposition === "admitted" && existingPayload === undefined) {
      throw new Error("admitted provider action preflight has no durable action");
    }
    const existing = existingPayload !== undefined && this.#providerSessions.assertActionIdentity({
      runId,
      actionId: input.actionId,
      adapterId: input.adapterId,
      operation: input.operation,
      identityHash,
      ...(target === undefined ? {} : {
        targetAgentId: target.agentId,
        providerSessionGeneration: target.providerSessionGeneration,
      }),
    });
    if (existing) {
      const result = this.get(runId, input.adapterId, input.actionId);
      if (
        result.status === "terminal" || result.status === "quarantined" ||
        (ephemeralSpawn && ["prepared", "dispatched", "accepted"].includes(result.status))
      ) {
        this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
        return result;
      }
      return await this.reconcile(runId, actorAgentId, {
        adapterId: input.adapterId,
        actionId: input.actionId,
        commandId: `${input.commandId}:reconcile`,
      });
    }
    const genericProviderActionTicket = providerActionTicket;
    if (ephemeralSpawn) {
      if (ephemeralProviderAuthorityId === undefined || ephemeralMaxTurns === undefined || taskId === undefined) {
        throw new Error("validated ephemeral provider budget is unavailable");
      }
      const ephemeralAuthorityBudget = {
        authorityId: ephemeralProviderAuthorityId,
        reservation: this.#payloadAuthority.providerBudgetReservation(
          ephemeralProviderAuthorityId,
          stringField(admittedInputPayload, "modelFamily"),
          ephemeralMaxTurns,
        ),
      };
      const task = rowOrNotFound(
        this.#database.prepare("SELECT state FROM tasks WHERE run_id=? AND task_id=?").get(runId, taskId),
        "ephemeral provider task",
      );
      if (["complete", "cancelled", "degraded"].includes(stringField(task, "state"))) {
        throw new ProjectFabricCoreError(
          "LIFECYCLE_PRECONDITION_FAILED",
          "terminal task cannot admit an ephemeral provider spawn",
        );
      }
      const joined = await this.#providerActionAdmission.join(providerActionTicket, async () => {
        try {
        this.#fault("provider-action:before-capability-inspection");
        const capabilities = await this.#requestAdapter(input.adapterId, "capabilities", {});
        this.#assertAdapterOperation(capabilities, "spawn");
        if (
          !isRow(capabilities) ||
          capabilities.ephemeralWorker !== true ||
          capabilities.answerBearingSpawn !== true
        ) {
          throw new FabricError("CAPABILITY_UNAVAILABLE", "adapter does not advertise answer-bearing ephemeral spawn");
        }
        if (
          capabilities.answerBearingSpawnTurns !== "payload-max-turns" &&
          capabilities.answerBearingSpawnTurns !== "one-shot"
        ) {
          throw new FabricError("CAPABILITY_UNAVAILABLE", "adapter does not advertise a bounded answer-bearing turn contract");
        }
        if (capabilities.answerBearingSpawnTurns === "one-shot" && ephemeralMaxTurns !== 1) {
          throw new FabricError("CAPABILITY_UNAVAILABLE", "one-shot answer-bearing adapter accepts exactly one turn");
        }
        if (
          capabilities.answerBearingUsageUnits !== undefined &&
          (!isStringArray(capabilities.answerBearingUsageUnits) ||
            capabilities.answerBearingUsageUnits.some((unit) => !Object.hasOwn(ephemeralAuthorityBudget.reservation, unit)))
        ) {
          throw new FabricError("CAPABILITY_UNAVAILABLE", "delegated authority omits an adapter-mandatory usage dimension");
        }
        return await this.#providerActionExecutor.executeGenericAdapterOperation({
          runId,
          adapterId: input.adapterId,
          actionId: input.actionId,
          operation: "spawn",
          method: "spawn",
          payload: admittedInputPayload,
          requireProviderAnswer: true,
          authorityBudget: ephemeralAuthorityBudget,
          taskId,
          deferCompletion: true,
          deferredCommand: {
            actorAgentId,
            commandId: input.commandId,
            payload: input,
          },
          providerActionTicket,
          revalidateAdmission: () => {
            if (this.#isClosing()) {
              throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "provider admission changed while Fabric was closing");
            }
            this.#assertChair(runId, actorAgentId);
            this.#payloadAuthority.assertProviderPrincipalActive(runId, actorAgentId);
            const reboundTaskId = resolveTaskBindingForActiveWork(
              this.#database,
              runId,
              actorAgentId,
              taskValue,
            );
            if (reboundTaskId !== taskId) {
              throw new FabricError("CAPABILITY_FORBIDDEN", "provider task binding changed before dispatch");
            }
            assertScopedOperationAllowed(
              this.#database,
              runId,
              FABRIC_OPERATIONS.dispatchProviderAction,
              operationTarget,
            );
            assertScopedTaskReadinessAllowed(this.#database, runId, taskId);
            assertRunAcceptingWork(this.#database, runId);
            this.#payloadAuthority.assertEphemeralProviderAuthority(runId, actorAgentId, ephemeralProviderAuthorityId as string);
            this.#payloadAuthority.admitProviderPayload(
              runId,
              ephemeralProviderAuthorityId as string,
              taskBoundPayload,
              true,
              { actorAgentId, taskId },
            );
          },
        });
        } catch (error: unknown) {
          const actionExists = this.#database.prepare(`
            SELECT 1 FROM provider_actions WHERE run_id=? AND adapter_id=? AND action_id=?
          `).get(runId, input.adapterId, input.actionId) !== undefined;
          if (
            providerActionTicket.disposition === "resolving" && !actionExists &&
            !(error instanceof ProviderActionAdmissionTransactionError)
          ) {
            this.#providerActionAdmission.release(providerActionTicket, error);
          }
          throw error;
        }
      });
      if (joined.joined) {
        this.#commandJournal.write(runId, actorAgentId, input.commandId, input, joined.value);
      }
      return joined.value;
    }
    let providerPayload = admittedInputPayload;
    let turnLeaseGeneration: number | null = null;
    let actionPrepared = false;
    if (input.operation === "send_turn" && target !== undefined) {
      if (genericProviderActionTicket === undefined) throw new Error("provider action ticket is unavailable");
      let admission;
      try {
        admission = this.#providerSessions.prepareTurnAction({
          runId,
          actionId: input.actionId,
          adapterId: input.adapterId,
          operation: "send_turn",
          identityHash,
          target,
          payload: admittedInputPayload,
          providerActionTicket: genericProviderActionTicket,
        });
      } catch (error: unknown) {
        if (
          genericProviderActionTicket.disposition === "resolving" &&
          !(error instanceof ProviderActionAdmissionTransactionError)
        ) {
          this.#providerActionAdmission.release(genericProviderActionTicket, error);
        }
        throw error;
      }
      providerPayload = admission.payload;
      turnLeaseGeneration = admission.turnLeaseGeneration;
      actionPrepared = true;
    } else if (input.operation === "steer" && target !== undefined) {
      const admission = this.#providerSessions.bindSteer({ runId, target, payload: admittedInputPayload });
      providerPayload = admission.payload;
      turnLeaseGeneration = admission.turnLeaseGeneration;
    } else if (target !== undefined) {
      providerPayload = {
        ...admittedInputPayload,
        agentId: target.agentId,
        resumeReference: target.resumeReference,
        providerSessionGeneration: target.providerSessionGeneration,
      };
    }
    if (!actionPrepared) {
      if (genericProviderActionTicket === undefined) throw new Error("provider action ticket is unavailable");
      const payloadJson = canonicalJson(providerPayload);
      try {
        this.#database.transaction(() => {
          this.#providerActionAdmission.admitUnroutedInCurrentTransaction(genericProviderActionTicket, {
            runId,
            actionId: input.actionId,
            adapterId: input.adapterId,
            operation: input.operation,
            targetAgentId: target?.agentId ?? null,
            providerSessionGeneration: target?.providerSessionGeneration ?? null,
            turnLeaseGeneration,
            identityHash,
            payloadHash: sha256(payloadJson),
            payloadJson,
            status: "prepared",
            historyJson: '["prepared"]',
            executionCount: 0,
            updatedAt: this.#clock(),
          }, "generic");
        }).immediate();
      } catch (error: unknown) {
        if (
          genericProviderActionTicket.disposition === "resolving" &&
          !(error instanceof ProviderActionAdmissionTransactionError)
        ) {
          this.#providerActionAdmission.release(genericProviderActionTicket, error);
        }
        throw error;
      }
    }
    const persistedProviderPayload: unknown = JSON.parse(canonicalJson(providerPayload));
    if (!isRow(persistedProviderPayload)) throw new Error("provider action payload is invalid");
    providerPayload = persistedProviderPayload;
    assertProviderActionOwner(this.#database, {
      runId,
      adapterId: input.adapterId,
      actionId: input.actionId,
    }, "generic");
    const capabilities = await this.#requestAdapter(input.adapterId, "capabilities", {});
    this.#assertAdapterOperation(capabilities, input.operation);
    assertProviderActionOwner(this.#database, {
      runId,
      adapterId: input.adapterId,
      actionId: input.actionId,
    }, "generic");
    this.#database
      .prepare("UPDATE provider_actions SET status = 'dispatched', history_json = '[\"prepared\",\"dispatched\"]', execution_count = 1, updated_at = ? WHERE run_id = ? AND adapter_id = ? AND action_id = ?")
      .run(this.#clock(), runId, input.adapterId, input.actionId);
    try {
      const response = await this.#requestAdapter(input.adapterId, "dispatch", { actionId: input.actionId, operation: input.operation, payload: providerPayload });
      const result = providerActionResult(response, input.actionId);
      this.#providerActionState.persist(runId, input.adapterId, input.actionId, response, result);
      this.#providerActionState.settleAndPump(runId, input.adapterId, input.actionId, result.status === "terminal" ? "terminal" : "ambiguous");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    } catch (error: unknown) {
      if (error instanceof ProviderActionOwnerError) throw error;
      const result: ProviderActionResult = {
        actionId: input.actionId,
        status: "ambiguous",
        history: ["prepared", "dispatched", "ambiguous"],
        executionCount: 1,
        effectCount: 0,
      };
      this.#providerActionState.persist(runId, input.adapterId, input.actionId, { idempotencyProven: false }, result);
      this.#providerActionState.settleAndPump(runId, input.adapterId, input.actionId, "ambiguous");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }
  }
}

import { randomBytes } from "node:crypto";
import type {
  AgentCustodyResult,
  ChairBridgeRecoveryIntent,
  ChairLiveHandoffIntent,
  ProjectSessionLaunchCurrentState,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";
import { isAbsolute } from "node:path";
import type { ArtifactRef } from "@local/agent-fabric-protocol";

import type { AuthenticatedOperatorContext } from "./contracts.js";
import {
  ProviderAgentCustodyAdapter,
  type AgentCustodyInput,
  type AgentDispatchHandle,
} from "./provider-agent-custody.js";
import { ProviderAgentCustodyRecoveryAdapter } from "./provider-agent-custody-recovery.js";
import {
  ChairLiveHandoffCustodyAdapter,
  type ChairLiveHandoffCommit,
  type ChairLiveHandoffCurrentState,
  type ChairLiveHandoffDispatchHandle,
  type ChairLiveHandoffInspection,
} from "./chair-live-handoff-custody.js";
import { ChairLiveHandoffCustodyRecoveryAdapter } from "./chair-live-handoff-custody-recovery.js";
import {
  ChairRecoveryCustodyService,
  type ChairRecoveryCommit,
  type ChairRecoveryCurrentState,
  type ChairRecoveryDispatchHandle,
  type ChairRecoveryInspection,
} from "./chair-recovery-custody.js";
import {
  reconcileUnknownLaunchUsage as reconcileUnknownLaunchUsageOwner,
  type LaunchUsageReconciliationInput,
  type LaunchUsageReconciliationResult,
} from "./launch-usage-reconciliation.js";
import {
  ProviderActionAdmissionCoordinator,
  type ProviderActionTicket,
} from "../application/provider-action-admission.js";
import { LaunchService, type LaunchServiceAdapterEffectsPort } from "./launch-service.js";
import { LaunchSettlement, type LaunchSettlementAdapterEffectsPort } from "./launch-settlement.js";
import type {
  Digest,
  LaunchAdapterContract,
  LaunchCustodyIntent,
  LaunchDispatchHandle,
  LaunchInspection,
  LaunchRecoveryResult,
  RetainedChairBridge,
} from "./launch-contracts.js";

/**
 * Facade for the four project-session custody families (issue #354). As of S4e, the
 * project-session launch family's own body has moved to `launch-contracts.ts` (parsing/pure
 * helpers), `launch-service.ts` (public workflow) and `launch-settlement.ts` (outcome
 * settlement + recovery); this class wires those two launch pieces together with the three
 * sibling family adapters (provider-agent, chair live handoff, chair recovery) that S4b-S4d
 * already extracted, and keeps every public method signature unchanged for callers (fabric.ts,
 * action-store.ts, and the operator adapters).
 */

export type LaunchCustodyServiceOptions = Readonly<{
  database: Database.Database;
  providerActionAdmission: ProviderActionAdmissionCoordinator;
  clock?: () => number;
  fault?: (label: string) => void;
  randomCapability: () => string;
  randomAttestationChallenge?: () => string;
  fabricSocketPath: string;
  adapterContracts: {
    inspect(adapterId: string): Promise<LaunchAdapterContract>;
  };
  adapterEffects: LaunchServiceAdapterEffectsPort & LaunchSettlementAdapterEffectsPort & Readonly<{
    hasRetainedChairBridge?(entry: RetainedChairBridge): boolean;
    recoverChair?(handle: ChairRecoveryDispatchHandle): Promise<unknown>;
    lookupChairRecovery?(input: Readonly<{ adapterId: string; actionId: string }>): Promise<unknown>;
    lookupRetainedSuccessorBridge?(input: Readonly<{
      projectSessionId: string;
      runId: string;
      agentId: string;
      principalGeneration: number;
      adapterId: string;
      actionId: string;
      providerSessionRef: string;
      providerSessionGeneration: number;
      sourceBridgeGeneration: number;
      chairBridgeGeneration: number;
      sourceActionId?: string;
      promotionActionId?: string;
    }>): Promise<"child" | "chair" | "missing">;
    promoteRetainedSuccessorBridge?(input: Readonly<{
      projectSessionId: string;
      runId: string;
      agentId: string;
      principalGeneration: number;
      adapterId: string;
      actionId: string;
      providerSessionRef: string;
      providerSessionGeneration: number;
      sourceBridgeGeneration: number;
      chairBridgeGeneration: number;
      sourceActionId?: string;
      promotionActionId?: string;
    }>): Promise<boolean>;
  }>;
  agentEffects?: {
    dispatch(handle: AgentDispatchHandle): Promise<unknown>;
    attachWithoutBridge(handle: AgentDispatchHandle): Promise<unknown>;
    lookup(input: Readonly<{ adapterId: string; actionId: string }>): Promise<unknown>;
    hasRetainedBridge(result: AgentCustodyResult, handle: AgentDispatchHandle): boolean;
  };
  daemonInstanceGeneration?: () => number;
  retireVolatileProjectSession?: (projectSessionId: string) => void;
  retireVolatileChairBridge?: (entry: RetainedChairBridge) => void;
}>;

export type {
  LaunchCustodyIntent,
  NormalisedLaunchAuthority,
  LaunchAdapterContract,
  LaunchInspection,
  LaunchDispatchHandle,
  RetainedChairBridge,
  ChairBridgeLossObservation,
  LaunchAdapterOutcome,
  LaunchRecoveryResult,
} from "./launch-contracts.js";
export { parseLaunchAdapterContract, normaliseLaunchChairAuthority, computeLaunchResourceStateDigest } from "./launch-contracts.js";
export type {
  AgentBridgeContract,
  AgentCustodyInput,
  AgentDispatchHandle,
} from "./provider-agent-custody.js";
export type {
  ChairLiveHandoffCommit,
  ChairLiveHandoffCurrentState,
  ChairLiveHandoffDispatchHandle,
  ChairLiveHandoffInspection,
} from "./chair-live-handoff-custody.js";
export type {
  ChairRecoveryCommit,
  ChairRecoveryCurrentState,
  ChairRecoveryDispatchHandle,
  ChairRecoveryInspection,
} from "./chair-recovery-custody.js";

export class LaunchCustodyService {
  readonly #database: Database.Database;
  readonly #clock: () => number;
  readonly #providerActionAdmission: ProviderActionAdmissionCoordinator;
  readonly #providerAgentCustody: ProviderAgentCustodyAdapter;
  readonly #providerAgentCustodyRecovery: ProviderAgentCustodyRecoveryAdapter;
  readonly #chairLiveHandoffCustody: ChairLiveHandoffCustodyAdapter;
  readonly #chairLiveHandoffCustodyRecovery: ChairLiveHandoffCustodyRecoveryAdapter;
  readonly #chairRecoveryCustody: ChairRecoveryCustodyService;
  readonly #launchService: LaunchService;
  readonly #launchSettlement: LaunchSettlement;

  constructor(options: LaunchCustodyServiceOptions) {
    const database = options.database;
    this.#database = database;
    this.#providerActionAdmission = options.providerActionAdmission;
    const clock = options.clock ?? Date.now;
    this.#clock = clock;
    const fault = options.fault ?? (() => undefined);
    const randomCapability = options.randomCapability;
    const randomAttestationChallenge = options.randomAttestationChallenge ?? (() => randomBytes(32).toString("hex"));
    const fabricSocketPath = options.fabricSocketPath;
    const adapterContracts = options.adapterContracts;
    const adapterEffects = options.adapterEffects;
    const agentEffects = options.agentEffects;
    const retireVolatileProjectSession = options.retireVolatileProjectSession;
    const retireVolatileChairBridge = options.retireVolatileChairBridge;
    const daemonInstanceGeneration = options.daemonInstanceGeneration ?? (() => 1);
    if (!isAbsolute(fabricSocketPath)) throw new TypeError("Fabric socket path must be absolute");
    this.#providerAgentCustody = new ProviderAgentCustodyAdapter({
      database,
      providerActionAdmission: this.#providerActionAdmission,
      clock,
      fault,
      randomCapability,
      fabricSocketPath,
      agentEffects,
      daemonInstanceGeneration,
    });
    this.#providerAgentCustodyRecovery = new ProviderAgentCustodyRecoveryAdapter({
      database,
      agentEffects,
      custody: this.#providerAgentCustody.recoveryPort(),
    });
    this.#chairLiveHandoffCustody = new ChairLiveHandoffCustodyAdapter({
      database,
      providerActionAdmission: this.#providerActionAdmission,
      clock,
      fault,
      adapterContracts,
      adapterEffects,
      ...(retireVolatileChairBridge === undefined ? {} : { retireVolatileChairBridge }),
    });
    this.#chairLiveHandoffCustodyRecovery = new ChairLiveHandoffCustodyRecoveryAdapter({
      database,
      custody: this.#chairLiveHandoffCustody.recoveryPort(),
    });
    this.#chairRecoveryCustody = new ChairRecoveryCustodyService({
      database,
      providerActionAdmission: this.#providerActionAdmission,
      clock,
      fault,
      randomCapability,
      randomAttestationChallenge,
      fabricSocketPath,
      adapterContracts,
      adapterEffects,
      daemonInstanceGeneration,
      ...(retireVolatileProjectSession === undefined ? {} : { retireVolatileProjectSession }),
      reconcileUnknownLaunchUsage: (input) => this.reconcileUnknownLaunchUsage(input),
    });
    // Plan §2 "S4e": inject a transaction-safe chair-loss port instead of `LaunchSettlement`
    // reaching directly into the sibling chair-recovery family.
    this.#launchSettlement = new LaunchSettlement({
      database,
      clock,
      adapterContracts,
      adapterEffects,
      chairLoss: {
        observeChairBridgeLoss: (input) => this.#chairRecoveryCustody.observeChairBridgeLoss(input),
      },
    });
    this.#launchService = new LaunchService({
      database,
      providerActionAdmission: this.#providerActionAdmission,
      clock,
      fault,
      randomCapability,
      randomAttestationChallenge,
      fabricSocketPath,
      adapterContracts,
      adapterEffects,
      settlement: this.#launchSettlement,
    });
  }

  reconcileUnknownLaunchUsage(input: LaunchUsageReconciliationInput): LaunchUsageReconciliationResult {
    return reconcileUnknownLaunchUsageOwner(this.#database, this.#clock, input);
  }

  releaseProviderActionPreflightAfterRollback(ticket: ProviderActionTicket, failure: unknown): void {
    this.#launchService.releaseProviderActionPreflightAfterRollback(ticket, failure);
  }

  observeChairBridgeLoss(input: RetainedChairBridge & Readonly<{ reason: string }>): boolean {
    return this.#chairRecoveryCustody.observeChairBridgeLoss(input);
  }

  async prepareLaunchIntent(input: Readonly<{
    projectId: string;
    projectSessionId: string;
    expectedSessionGeneration: number;
    launchPacketRef: ArtifactRef;
  }>): Promise<LaunchCustodyIntent> {
    return await this.#launchService.prepareLaunchIntent(input);
  }

  async readChairLiveHandoffCurrentState(
    intent: ChairLiveHandoffIntent,
  ): Promise<ChairLiveHandoffCurrentState> {
    return await this.#chairLiveHandoffCustody.readChairLiveHandoffCurrentState(intent);
  }

  async inspectChairLiveHandoff(intent: ChairLiveHandoffIntent): Promise<ChairLiveHandoffInspection> {
    return await this.#chairLiveHandoffCustody.inspectChairLiveHandoff(intent);
  }

  preflightChairLiveHandoff(input: Readonly<{
    inspection: ChairLiveHandoffInspection;
    operatorCommandId: string;
    principal: AuthenticatedOperatorContext;
  }>): ProviderActionTicket {
    return this.#chairLiveHandoffCustody.preflightChairLiveHandoff(input);
  }

  prepareChairLiveHandoffInTransaction(input: Readonly<{
    inspection: ChairLiveHandoffInspection;
    operatorId: string;
    operatorCommandId: string;
    providerActionTicket: ProviderActionTicket;
  }>): ChairLiveHandoffDispatchHandle {
    return this.#chairLiveHandoffCustody.prepareChairLiveHandoffInTransaction(input);
  }

  async dispatchPreparedChairLiveHandoff(
    handle: ChairLiveHandoffDispatchHandle,
  ): Promise<ChairLiveHandoffCommit> {
    return await this.#chairLiveHandoffCustody.dispatchPreparedChairLiveHandoff(handle);
  }

  chairLiveHandoffStatus(operatorId: string, operatorCommandId: string): ChairLiveHandoffCommit {
    return this.#chairLiveHandoffCustody.chairLiveHandoffStatus(operatorId, operatorCommandId);
  }

  async reconcileChairLiveHandoff(
    operatorId: string,
    operatorCommandId: string,
  ): Promise<ChairLiveHandoffCommit> {
    return await this.#chairLiveHandoffCustody.reconcileChairLiveHandoff(operatorId, operatorCommandId);
  }

  async inspectChairRecovery(intent: ChairBridgeRecoveryIntent): Promise<ChairRecoveryInspection> {
    return await this.#chairRecoveryCustody.inspectChairRecovery(intent);
  }

  preflightChairRecovery(input: Readonly<{
    inspection: ChairRecoveryInspection;
    principal: AuthenticatedOperatorContext;
  }>): ProviderActionTicket | null {
    return this.#chairRecoveryCustody.preflightChairRecovery(input);
  }

  async readChairRecoveryCurrentState(intent: ChairBridgeRecoveryIntent): Promise<ChairRecoveryCurrentState> {
    return await this.#chairRecoveryCustody.readChairRecoveryCurrentState(intent);
  }

  prepareChairRecoveryInTransaction(input: Readonly<{
    inspection: ChairRecoveryInspection;
    operatorId: string;
    operatorCommandId: string;
    providerActionTicket: ProviderActionTicket | null;
  }>): ChairRecoveryDispatchHandle {
    return this.#chairRecoveryCustody.prepareChairRecoveryInTransaction(input);
  }

  async dispatchPreparedChairRecovery(handle: ChairRecoveryDispatchHandle): Promise<ChairRecoveryCommit> {
    return await this.#chairRecoveryCustody.dispatchPreparedChairRecovery(handle);
  }

  chairRecoveryStatus(operatorId: string, operatorCommandId: string): ChairRecoveryCommit {
    return this.#chairRecoveryCustody.chairRecoveryStatus(operatorId, operatorCommandId);
  }

  async reconcileChairRecovery(operatorId: string, operatorCommandId: string): Promise<ChairRecoveryCommit> {
    return await this.#chairRecoveryCustody.reconcileChairRecovery(operatorId, operatorCommandId);
  }

  /**
   * Byte-moved from `LaunchCustodyService#provisionAgent` (issue #354, S4b); the family's body
   * now lives in `ProviderAgentCustodyAdapter` (provider-agent-custody.ts). This delegation
   * keeps the public signature unchanged for callers (see fabric.ts).
   */
  async provisionAgent(input: AgentCustodyInput): Promise<AgentCustodyResult> {
    return await this.#providerAgentCustody.provisionAgent(input);
  }

  /**
   * Byte-moved from `LaunchCustodyService#observeChildBridgeLoss` (issue #354, S4b); the
   * family's body now lives in `ProviderAgentCustodyAdapter` (provider-agent-custody.ts). This
   * delegation keeps the public signature unchanged for callers (see fabric.ts).
   */
  observeChildBridgeLoss(input: Readonly<{
    runId: string;
    agentId: string;
    adapterId: string;
    actionId: string;
    providerSessionRef: string;
    providerSessionGeneration: number;
    bridgeGeneration: number;
    reason: string;
  }>): void {
    this.#providerAgentCustody.observeChildBridgeLoss(input);
  }

  async inspect(intent: LaunchCustodyIntent): Promise<LaunchInspection> {
    return await this.#launchService.inspect(intent);
  }

  prepareInTransaction(input: Readonly<{
    inspection: LaunchInspection;
    operatorId: string;
    operatorCommandId: string;
    principal: AuthenticatedOperatorContext;
  }>): LaunchDispatchHandle {
    return this.#launchService.prepareInTransaction(input);
  }

  async dispatchPrepared(handle: LaunchDispatchHandle) {
    return await this.#launchService.dispatchPrepared(handle);
  }

  async lookup(input: Readonly<{
    providerAdapterId: string;
    providerActionId: string;
    providerContractDigest: Digest;
  }>): Promise<unknown> {
    return await this.#launchService.lookup(input);
  }

  async readCurrentState(intent: LaunchCustodyIntent): Promise<ProjectSessionLaunchCurrentState> {
    return await this.#launchService.readCurrentState(intent);
  }

  launchProviderActionJournalRefForCommand(operatorId: string, commandId: string) {
    return this.#launchService.launchProviderActionJournalRefForCommand(operatorId, commandId);
  }

  seatProvisioningDescriptorForCommand(operatorId: string, commandId: string) {
    return this.#launchService.seatProvisioningDescriptorForCommand(operatorId, commandId);
  }

  /**
   * Byte-moved from `LaunchCustodyService#recover` (issue #354, S4d/S4e). Preserves the exact
   * original ordering — live handoff, chair recovery, provider-agent, launch, then retained-chair
   * audit — and continue-after-error semantics: every family's recovery is attempted even if an
   * earlier family throws, and only the final aggregate raises. The launch family's own recovery
   * loop now lives in `LaunchSettlement#recoverLaunchCustody` (launch-settlement.ts); this method
   * remains the single ordering/aggregation point across all four families.
   */
  async recover(): Promise<LaunchRecoveryResult> {
    const result: {
      preparedFailed: number;
      lookedUp: number;
      activated: number;
      failed: number;
      ambiguous: number;
      recoveryRequired: number;
    } = {
      preparedFailed: 0,
      lookedUp: 0,
      activated: 0,
      failed: 0,
      ambiguous: 0,
      recoveryRequired: 0,
    };
    const errors: unknown[] = [];
    await this.#chairLiveHandoffCustodyRecovery.recoverChairLiveHandoffCustody(result, errors);
    try {
      await this.#chairRecoveryCustody.recoverChairRecoveryCustody(result);
    } catch (error: unknown) {
      errors.push(error);
      result.ambiguous += 1;
    }
    await this.#providerAgentCustodyRecovery.recoverAgentCustody(result, errors);
    await this.#launchSettlement.recoverLaunchCustody(result, errors);
    this.#chairRecoveryCustody.auditRetainedChairBridges(result, errors);
    if (errors.length > 0) {
      throw new AggregateError(errors, "launch custody recovery left one or more sessions unfenced");
    }
    return result;
  }
}

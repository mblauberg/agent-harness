import type {
  AgentCustodyResult,
  ChairBridgeRecoveryIntent,
  ChairLiveHandoffIntent,
  ProjectSessionLaunchCurrentState,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";
import type { ArtifactRef } from "@local/agent-fabric-protocol";

import type { AuthenticatedOperatorContext } from "./contracts.js";
import {
  type ProviderAgentCustodyAdapter,
  type AgentCustodyInput,
} from "./provider-agent-custody.js";
import { type ProviderAgentCustodyRecoveryAdapter } from "./provider-agent-custody-recovery.js";
import {
  type ChairLiveHandoffCustodyAdapter,
  type ChairLiveHandoffCommit,
  type ChairLiveHandoffCurrentState,
  type ChairLiveHandoffDispatchHandle,
  type ChairLiveHandoffInspection,
} from "./chair-live-handoff-custody.js";
import { type ChairLiveHandoffCustodyRecoveryAdapter } from "./chair-live-handoff-custody-recovery.js";
import {
  type ChairRecoveryCustodyService,
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
  type ProviderActionTicket,
} from "../application/provider-action-admission.js";
import { type LaunchService } from "./launch-service.js";
import { type LaunchSettlement } from "./launch-settlement.js";
import { recoverLaunchCustodyFamilies } from "./custody-startup.js";
import type {
  Digest,
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
 *
 * As of S4e2, `fabric.ts` constructs each of the seven family/recovery pieces itself (each with
 * its own narrow constructor options — `ProviderAgentCustodyAdapterOptions`,
 * `ChairLiveHandoffCustodyAdapterOptions`, `ChairRecoveryCustodyServiceOptions`,
 * `LaunchServiceOptions`, plus their recovery-adapter counterparts) and passes the already-built
 * instances here; this class no longer owns any cross-family wiring or a mixed options bag.
 */

export type LaunchCustodyServiceFamilies = Readonly<{
  database: Database.Database;
  clock?: () => number;
  providerAgentCustody: ProviderAgentCustodyAdapter;
  providerAgentCustodyRecovery: ProviderAgentCustodyRecoveryAdapter;
  chairLiveHandoffCustody: ChairLiveHandoffCustodyAdapter;
  chairLiveHandoffCustodyRecovery: ChairLiveHandoffCustodyRecoveryAdapter;
  chairRecoveryCustody: ChairRecoveryCustodyService;
  launchService: LaunchService;
  launchSettlement: LaunchSettlement;
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
  readonly #providerAgentCustody: ProviderAgentCustodyAdapter;
  readonly #providerAgentCustodyRecovery: ProviderAgentCustodyRecoveryAdapter;
  readonly #chairLiveHandoffCustody: ChairLiveHandoffCustodyAdapter;
  readonly #chairLiveHandoffCustodyRecovery: ChairLiveHandoffCustodyRecoveryAdapter;
  readonly #chairRecoveryCustody: ChairRecoveryCustodyService;
  readonly #launchService: LaunchService;
  readonly #launchSettlement: LaunchSettlement;

  constructor(families: LaunchCustodyServiceFamilies) {
    this.#database = families.database;
    this.#clock = families.clock ?? Date.now;
    this.#providerAgentCustody = families.providerAgentCustody;
    this.#providerAgentCustodyRecovery = families.providerAgentCustodyRecovery;
    this.#chairLiveHandoffCustody = families.chairLiveHandoffCustody;
    this.#chairLiveHandoffCustodyRecovery = families.chairLiveHandoffCustodyRecovery;
    this.#chairRecoveryCustody = families.chairRecoveryCustody;
    this.#launchSettlement = families.launchSettlement;
    this.#launchService = families.launchService;
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
   * Byte-moved from `LaunchCustodyService#recover` (issue #354, S4d/S4e); as of S4e2 the exact
   * ordering — live handoff, chair recovery, provider-agent, launch, then retained-chair audit —
   * and continue-after-error/aggregate-error semantics live in the narrow startup coordinator
   * `custody-startup.ts` (`recoverLaunchCustodyFamilies`). This method remains the unchanged
   * public entry point for callers (fabric.ts).
   */
  async recover(): Promise<LaunchRecoveryResult> {
    return await recoverLaunchCustodyFamilies({
      chairLiveHandoffCustodyRecovery: this.#chairLiveHandoffCustodyRecovery,
      chairRecoveryCustody: this.#chairRecoveryCustody,
      providerAgentCustodyRecovery: this.#providerAgentCustodyRecovery,
      launchSettlement: this.#launchSettlement,
    });
  }
}

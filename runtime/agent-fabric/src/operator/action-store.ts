import type {
  ArtifactRef,
  GitCurrentState,
  JsonValue,
  OperatorActionCommitRequest,
  OperatorActionIntent,
  OperatorActionPreview,
  OperatorActionPreviewRequest,
  OperatorActionReceipt,
  OperatorActionRejectionCode,
  OperatorActionReconcileRequest,
  OperatorActionStatus,
  OperatorActionStatusRequest,
  ProjectSessionLaunchPrepareRequest,
  ProjectSessionLaunchCurrentState,
  LaunchProviderActionJournalRefV1,
  RegisteredExternalEffectState,
  ScopedGate,
  Sha256Digest,
  Timestamp,
} from "@local/agent-fabric-protocol";
import {
  FABRIC_OPERATIONS,
  assertGitIntentState,
  assertPromotionIntentGate,
  assertRegisteredExternalEffectContract,
  parseArtifactRef,
  parseIdentifier,
  parseOperationResult,
  parseSha256Digest,
  parseTimestamp,
  requiredOperatorActionForIntent,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import { ProjectFabricCoreError, type AuthenticatedOperatorContext, type CoreServiceOptions } from "../project-session/contracts.js";
import type {
  LaunchCustodyIntent,
  LaunchDispatchHandle,
  LaunchInspection,
  ChairRecoveryCurrentState,
  ChairRecoveryDispatchHandle,
  ChairRecoveryInspection,
  ChairRecoveryCommit,
  ChairLiveHandoffCurrentState,
  ChairLiveHandoffDispatchHandle,
  ChairLiveHandoffInspection,
  ChairLiveHandoffCommit,
} from "../project-session/launch-custody.js";
import { canonicalJson, integer, isRow, nullableText, row, sha256, text, type Row } from "../project-session/store-support.js";
import type { AuthenticatedOperatorCredential, OperatorStore } from "./store.js";
import type { ProviderActionTicket } from "../application/provider-action-admission.js";

export type OperatorActionCurrentState =
  | {
      kind: "control";
      revision: number;
      lifecycleState: string;
      eligibleActions: readonly ("pause" | "resume" | "cancel" | "steer")[];
      binding?: JsonValue;
    }
  | {
      kind: "project-session-launch";
      revision: number;
      state: ProjectSessionLaunchCurrentState;
    }
  | {
      kind: "project-session-lifecycle";
      revision: number;
      sessionGeneration: number;
      globalStateRevision: number;
      lifecycleState: string;
      drainReceiptRef: ArtifactRef | null;
    }
  | {
      kind: "daemon-lifecycle";
      revision: number;
      daemonGeneration: number;
      globalStateRevision: number;
      lifecycleState: string;
      drainReceiptRef: ArtifactRef | null;
    }
  | { kind: "chair-bridge-recovery"; revision: number; state: ChairRecoveryCurrentState }
  | { kind: "chair-live-handoff"; revision: number; state: ChairLiveHandoffCurrentState }
  | { kind: "agent-lifecycle-recovery"; revision: number; state: OperatorLifecycleRecoveryCurrentState }
  | { kind: "git"; revision: number; state: GitCurrentState }
  | { kind: "git-administration"; revision: number; state: JsonValue }
  | { kind: "registered-external-effect"; revision: number; state: RegisteredExternalEffectState }
  | { kind: "promotion"; revision: number; gate: ScopedGate };

export interface OperatorActionStatePort {
  read(intent: OperatorActionIntent): Promise<OperatorActionCurrentState>;
}

export type OperatorEffectOutcome =
  | { status: "committed"; afterState: JsonValue; effectRef?: ArtifactRef }
  | { status: "pending"; phase: "accepted" | "observing" }
  | { status: "ambiguous"; effectRef: ArtifactRef }
  | {
      status: "rejected";
      code: OperatorActionRejectionCode;
      evidenceRefs: readonly ArtifactRef[];
    };

export type OperatorEffectRequest = {
  commandId: string;
  previewId?: string;
  operatorId?: string;
  projectId?: string;
  projectSessionId?: string;
  principalGeneration?: number;
  operation?: string;
  intent: OperatorActionIntent;
  intentDigest: Sha256Digest;
  beforeStateDigest: Sha256Digest;
  attemptGeneration: number;
  operatorInputRecordDigest?: Sha256Digest;
};

export interface OperatorActionEffectPort {
  prepare?(request: OperatorEffectRequest): void;
  dispatch(request: OperatorEffectRequest): Promise<OperatorEffectOutcome>;
  observe(request: OperatorEffectRequest & { effectRef: ArtifactRef | null }): Promise<OperatorEffectOutcome>;
  status?(commandId: string, intentDigest: Sha256Digest): OperatorActionStatus | null;
  reconcileGit?(input: Readonly<{
    request: OperatorActionReconcileRequest;
    targetIntent: Extract<OperatorActionIntent, { kind: "git" }>;
    intentDigest: Sha256Digest;
    nextAttemptGeneration: number;
  }>): Promise<OperatorActionStatus>;
}

export interface OperatorLaunchCustodyPort {
  readCurrentState(intent: LaunchCustodyIntent): Promise<ProjectSessionLaunchCurrentState>;
  inspect(intent: LaunchCustodyIntent): Promise<LaunchInspection>;
  prepareInTransaction(input: Readonly<{
    inspection: LaunchInspection;
    operatorId: string;
    operatorCommandId: string;
    principal: AuthenticatedOperatorContext;
  }>): LaunchDispatchHandle;
  dispatchPrepared(handle: LaunchDispatchHandle): Promise<unknown>;
  launchProviderActionJournalRefForCommand(
    operatorId: string,
    commandId: string,
  ): LaunchProviderActionJournalRefV1;
}

export interface OperatorChairRecoveryCustodyPort {
  readChairRecoveryCurrentState(intent: Extract<OperatorActionIntent, { kind: "chair-bridge-recovery" }>): Promise<ChairRecoveryCurrentState>;
  inspectChairRecovery(intent: Extract<OperatorActionIntent, { kind: "chair-bridge-recovery" }>): Promise<ChairRecoveryInspection>;
  preflightChairRecovery(input: Readonly<{
    inspection: ChairRecoveryInspection;
    principal: AuthenticatedOperatorContext;
  }>): ProviderActionTicket | null;
  prepareChairRecoveryInTransaction(input: Readonly<{
    inspection: ChairRecoveryInspection;
    operatorId: string;
    operatorCommandId: string;
    providerActionTicket: ProviderActionTicket | null;
  }>): ChairRecoveryDispatchHandle;
  dispatchPreparedChairRecovery(handle: ChairRecoveryDispatchHandle): Promise<ChairRecoveryCommit>;
  chairRecoveryStatus(operatorId: string, operatorCommandId: string): ChairRecoveryCommit;
  reconcileChairRecovery(operatorId: string, operatorCommandId: string): Promise<ChairRecoveryCommit>;
  releaseProviderActionPreflightAfterRollback?(ticket: ProviderActionTicket, failure: unknown): void;
}

export interface OperatorChairLiveHandoffCustodyPort {
  readChairLiveHandoffCurrentState(intent: Extract<OperatorActionIntent, { kind: "chair-live-handoff" }>): Promise<ChairLiveHandoffCurrentState>;
  inspectChairLiveHandoff(intent: Extract<OperatorActionIntent, { kind: "chair-live-handoff" }>): Promise<ChairLiveHandoffInspection>;
  preflightChairLiveHandoff(input: Readonly<{
    inspection: ChairLiveHandoffInspection;
    operatorCommandId: string;
    principal: AuthenticatedOperatorContext;
  }>): ProviderActionTicket;
  prepareChairLiveHandoffInTransaction(input: Readonly<{
    inspection: ChairLiveHandoffInspection;
    operatorId: string;
    operatorCommandId: string;
    providerActionTicket: ProviderActionTicket;
  }>): ChairLiveHandoffDispatchHandle;
  dispatchPreparedChairLiveHandoff(handle: ChairLiveHandoffDispatchHandle): Promise<ChairLiveHandoffCommit>;
  chairLiveHandoffStatus(operatorId: string, operatorCommandId: string): ChairLiveHandoffCommit;
  reconcileChairLiveHandoff(operatorId: string, operatorCommandId: string): Promise<ChairLiveHandoffCommit>;
  releaseProviderActionPreflightAfterRollback?(ticket: ProviderActionTicket, failure: unknown): void;
}

function prepareProviderActionAfterPreflight<T>(
  prepare: () => T,
  custody: Readonly<{
    releaseProviderActionPreflightAfterRollback?(ticket: ProviderActionTicket, failure: unknown): void;
  }>,
  ticket: ProviderActionTicket,
): T {
  try {
    return prepare();
  } catch (error: unknown) {
    try {
      custody.releaseProviderActionPreflightAfterRollback?.(ticket, error);
    } catch {
      // Preserve the original preparation error if release races or fails.
    }
    throw error;
  }
}

type LifecycleRecoveryIntent = Extract<OperatorActionIntent, { kind: "agent-lifecycle-recovery" }>;

export type OperatorLifecycleRecoveryCurrentState = Readonly<{
  revision: number;
  projectSessionId: string;
  coordinationRunId: string;
  agentId: string;
  sessionRevision: number;
  sessionGeneration: number;
  runRevision: number;
  agentRevision: number;
  source: LifecycleRecoveryIntent["source"];
  sourceRevision: number;
  principalGeneration: number;
  providerGeneration: number;
  bridgeGeneration: number;
  contextRevision: number;
  bridgeOwnerKind: LifecycleRecoveryIntent["bridgeOwnerKind"];
  chairLeaseGeneration: number | null;
  gate: Readonly<{ gateId: string; revision: number; status: "approved" }>;
  recoveryCapability: Readonly<{
    capabilityId: string;
    revision: number;
    capabilityHash: string;
  }> | null;
  checkpoint: Readonly<{
    ref: Extract<LifecycleRecoveryIntent, { path: "fresh-rotate" }>["checkpointRef"];
    digest: string;
    validationReceiptDigest: string | null;
  }> | null;
}>;

export type OperatorLifecycleRecoveryInspection = Readonly<{
  intent: LifecycleRecoveryIntent;
  inspectionDigest: Sha256Digest;
}>;

export type OperatorLifecycleRecoveryCommit = Readonly<{
  status: "committed" | "ambiguous" | "pending" | "no-effect";
  recoveryId: string;
  path: LifecycleRecoveryIntent["path"];
  evidenceDigest: Sha256Digest;
}>;

export interface OperatorLifecycleRecoveryCustodyPort {
  readLifecycleRecoveryCurrentState(intent: LifecycleRecoveryIntent): Promise<OperatorLifecycleRecoveryCurrentState>;
  inspectLifecycleRecovery(intent: LifecycleRecoveryIntent): Promise<OperatorLifecycleRecoveryInspection>;
  prepareLifecycleFreshRotateInTransaction(input: Readonly<{
    inspection: OperatorLifecycleRecoveryInspection;
    operatorId: string;
    operatorCommandId: string;
  }>): OperatorLifecycleRecoveryCommit;
  prepareLifecycleAbandonInTransaction(input: Readonly<{
    inspection: OperatorLifecycleRecoveryInspection;
    operatorId: string;
    operatorCommandId: string;
  }>): OperatorLifecycleRecoveryCommit;
  lifecycleRecoveryStatus(operatorId: string, operatorCommandId: string): OperatorLifecycleRecoveryCommit;
  reconcileLifecycleRecovery(operatorId: string, operatorCommandId: string): Promise<OperatorLifecycleRecoveryCommit>;
}

export type OperatorActionStoreOptions = CoreServiceOptions & {
  operatorStore: OperatorStore;
  statePort: OperatorActionStatePort;
  effectPort: OperatorActionEffectPort;
  launchCustody?: OperatorLaunchCustodyPort;
  chairRecoveryCustody?: OperatorChairRecoveryCustodyPort;
  chairLiveHandoffCustody?: OperatorChairLiveHandoffCustodyPort;
  lifecycleRecoveryCustody?: OperatorLifecycleRecoveryCustodyPort;
  previewTtlMs?: number;
};

export class OperatorActionStore {
  readonly #database: Database.Database;
  readonly #operatorStore: OperatorStore;
  readonly #statePort: OperatorActionStatePort;
  readonly #effectPort: OperatorActionEffectPort;
  readonly #launchCustody: OperatorLaunchCustodyPort | undefined;
  readonly #chairRecoveryCustody: OperatorChairRecoveryCustodyPort | undefined;
  readonly #chairLiveHandoffCustody: OperatorChairLiveHandoffCustodyPort | undefined;
  readonly #lifecycleRecoveryCustody: OperatorLifecycleRecoveryCustodyPort | undefined;
  readonly #clock: () => number;
  readonly #previewTtlMs: number;
  readonly #inFlightCommits = new Map<string, { payloadHash: string; promise: Promise<OperatorActionReceipt> }>();

  constructor(options: OperatorActionStoreOptions) {
    this.#database = options.database;
    this.#operatorStore = options.operatorStore;
    this.#statePort = options.statePort;
    this.#effectPort = options.effectPort;
    this.#launchCustody = options.launchCustody;
    this.#chairRecoveryCustody = options.chairRecoveryCustody;
    this.#chairLiveHandoffCustody = options.chairLiveHandoffCustody;
    this.#lifecycleRecoveryCustody = options.lifecycleRecoveryCustody;
    this.#clock = options.clock ?? Date.now;
    this.#previewTtlMs = options.previewTtlMs ?? 5 * 60_000;
    if (!Number.isSafeInteger(this.#previewTtlMs) || this.#previewTtlMs < 1) {
      throw new TypeError("operator preview TTL must be a positive safe integer");
    }
  }

  replayLaunchPreview(
    context: AuthenticatedOperatorContext,
    request: ProjectSessionLaunchPrepareRequest,
  ): OperatorActionPreview | undefined {
    const previewId = `preview_${sha256(`${context.operatorId}:${request.command.commandId}`).slice(0, 48)}`;
    const stored = this.#database.prepare(`
      SELECT operator_id, project_session_id, operation, payload_digest, preview_json
        FROM operator_previews WHERE preview_id=?
    `).get(previewId);
    if (!isRow(stored)) return undefined;
    const envelope = parseStoredPreview(text(stored, "preview_json"));
    const intent = envelope.preview.intent;
    const exactBinding =
      text(stored, "operator_id") === context.operatorId &&
      text(stored, "project_session_id") === request.projectSessionId &&
      text(stored, "operation") === "launch" &&
      intent.kind === "project-session-launch" &&
      intent.projectId === request.projectId &&
      intent.projectSessionId === request.projectSessionId &&
      intent.expectedSessionRevision === request.command.expectedRevision &&
      intent.expectedSessionGeneration === request.expectedSessionGeneration &&
      canonicalJson(intent.launchPacketRef) === canonicalJson(request.launchPacketRef);
    const payloadDigest = intent.kind === "project-session-launch"
      ? sha256(canonicalJson(sanitisedPreviewRequest({
          command: request.command,
          projectId: request.projectId,
          intent,
        })))
      : "";
    if (!exactBinding || text(stored, "payload_digest") !== payloadDigest) {
      throw new ProjectFabricCoreError(
        "DEDUPE_CONFLICT",
        "launch preparation command identity was reused with changed input",
      );
    }
    return envelope.preview;
  }

  async preview(
    context: AuthenticatedOperatorContext,
    request: OperatorActionPreviewRequest,
  ): Promise<OperatorActionPreview> {
    const authenticated = this.#authenticateCommand(context, request.command, request.projectId, request.intent);
    const current = await this.#readCurrentState(request.intent);
    validateCurrentState(request.intent, request.command.expectedRevision, current);
    const beforeStateDigest = digestValue(current, "operatorActionPreview.beforeStateDigest");
    const intentDigest = digestValue(request.intent, "operatorActionPreview.intentDigest");
    const payloadDigest = sha256(canonicalJson(sanitisedPreviewRequest(request)));
    const previewId = `preview_${sha256(`${context.operatorId}:${request.command.commandId}`).slice(0, 48)}`;
    const expiresAt = toTimestamp(this.#clock() + this.#previewTtlMs, "operatorActionPreview.expiresAt");
    const previewBase = {
      previewId,
      previewRevision: 1,
      intent: request.intent,
      intentDigest,
      beforeStateDigest,
      consequenceClass: consequenceClass(request.intent),
      evidenceRefs: combinedEvidence(request),
      gateIds: request.intent.kind === "promotion"
        ? [request.intent.gateId]
        : request.intent.kind === "agent-lifecycle-recovery"
          ? [parseIdentifier<"GateId">(request.intent.gateId, "operatorActionPreview.gateId")]
        : [],
      confirmationMode: "explicit" as const,
      expiresAt,
    };
    const preview: OperatorActionPreview = {
      ...previewBase,
      previewDigest: digestValue(previewBase, "operatorActionPreview.previewDigest"),
    };
    const transaction = this.#database.transaction((): OperatorActionPreview => {
      const existing = this.#database.prepare(`
        SELECT payload_digest, preview_json FROM operator_previews WHERE preview_id=?
      `).get(previewId);
      if (isRow(existing)) {
        if (text(existing, "payload_digest") !== payloadDigest) {
          throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "preview command identity was reused with changed input");
        }
        return parseStoredPreview(text(existing, "preview_json")).preview;
      }
      const projectSessionId = actionSessionId(authenticated, request.intent);
      this.#database.prepare(`
        INSERT INTO operator_previews(
          preview_id, operator_id, project_session_id, operation, payload_digest,
          preview_json, revision, expires_at, confirmed_command_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, NULL, ?)
      `).run(
        previewId,
        context.operatorId,
        projectSessionId,
        requiredOperatorActionForIntent(request.intent),
        payloadDigest,
        canonicalJson({ preview, action: null }),
        this.#clock() + this.#previewTtlMs,
        this.#clock(),
      );
      return preview;
    });
    return transaction();
  }

  async commit(
    context: AuthenticatedOperatorContext,
    request: OperatorActionCommitRequest,
  ): Promise<OperatorActionReceipt> {
    const stored = this.#previewRow(request.previewId);
    const envelope = parseStoredPreview(text(stored, "preview_json"));
    const authenticated = this.#authenticateCommand(context, request.command, request.projectId, envelope.preview.intent);
    this.#assertStoredPreviewScope(stored, authenticated, request.projectId, envelope.preview.intent);
    const payloadHash = sha256(canonicalJson(sanitisedCommitRequest(request)));
    const inFlightKey = `${context.operatorId}:${request.command.commandId}`;
    const inFlight = this.#inFlightCommits.get(inFlightKey);
    if (inFlight !== undefined) {
      if (inFlight.payloadHash !== payloadHash) {
        throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "operator command ID was reused with changed input");
      }
      return inFlight.promise;
    }
    const promise = this.#commitAuthenticated(context, request, stored, envelope, authenticated, payloadHash);
    this.#inFlightCommits.set(inFlightKey, { payloadHash, promise });
    const clear = (): void => {
      if (this.#inFlightCommits.get(inFlightKey)?.promise === promise) this.#inFlightCommits.delete(inFlightKey);
    };
    void promise.then(clear, clear);
    return promise;
  }

  async #commitAuthenticated(
    context: AuthenticatedOperatorContext,
    request: OperatorActionCommitRequest,
    stored: Row,
    envelope: StoredPreviewEnvelope,
    authenticated: AuthenticatedOperatorCredential,
    payloadHash: string,
  ): Promise<OperatorActionReceipt> {
    const replay = this.#commandReplay(context.operatorId, request.command.commandId, payloadHash);
    if (replay !== null) return replay;
    this.#assertPreviewClaim(stored, request.command.commandId);
    try {
      assertCommitMatchesPreview(request, envelope.preview, integer(stored, "revision"), this.#clock());
    } catch (error: unknown) {
      const code = Date.parse(envelope.preview.expiresAt) <= this.#clock()
        ? "preview-expired"
        : "preview-stale";
      this.#recordRejected(context, request, stored, envelope, payloadHash, code);
      throw error;
    }
    const current = await this.#readCurrentState(envelope.preview.intent);
    try {
      validateCurrentState(envelope.preview.intent, request.command.expectedRevision, current);
    } catch (error: unknown) {
      this.#recordRejected(
        context,
        request,
        stored,
        envelope,
        payloadHash,
        rejectionForIntent(envelope.preview.intent),
      );
      throw error;
    }
    const currentDigest = digestValue(current, "operatorActionCommit.currentStateDigest");
    if (currentDigest !== envelope.preview.beforeStateDigest) {
      this.#recordRejected(
        context,
        request,
        stored,
        envelope,
        payloadHash,
        "state-changed",
      );
      throw new ProjectFabricCoreError("STALE_REVISION", "operator action state changed after preview");
    }
    if (envelope.preview.intent.kind === "project-session-launch") {
      return await this.#commitLaunch(
        context,
        request,
        envelope,
        envelope.preview.intent,
        authenticated,
        payloadHash,
        current,
      );
    }
    if (envelope.preview.intent.kind === "chair-bridge-recovery") {
      return await this.#commitChairRecovery(
        context,
        request,
        envelope,
        envelope.preview.intent,
        authenticated,
        payloadHash,
        current,
      );
    }
    if (envelope.preview.intent.kind === "chair-live-handoff") {
      return await this.#commitChairLiveHandoff(
        context,
        request,
        envelope,
        envelope.preview.intent,
        authenticated,
        payloadHash,
        current,
      );
    }
    if (envelope.preview.intent.kind === "agent-lifecycle-recovery") {
      return await this.#commitLifecycleRecovery(
        context,
        request,
        envelope,
        envelope.preview.intent,
        authenticated,
        payloadHash,
        current,
      );
    }
    const preparedState = {
      status: "pending" as const,
      commandId: request.command.commandId,
      phase: "prepared" as const,
      attemptGeneration: 1,
      operatorInputRecordDigest: digestValue({
        actor: request.command.actor,
        provenance: request.command.provenance,
        evidenceRefs: request.command.evidenceRefs,
        confirmation: request.confirmation,
      }, "operatorActionCommit.operatorInputRecordDigest"),
    };
    const preparedReceipt: OperatorActionReceipt = {
      commandId: request.command.commandId,
      previewId: envelope.preview.previewId,
      previewRevision: envelope.preview.previewRevision,
      intentDigest: envelope.preview.intentDigest,
      beforeStateDigest: envelope.preview.beforeStateDigest,
      afterStateDigest: digestValue(preparedState, "operatorActionCommit.preparedStateDigest"),
      evidenceRefs: envelope.preview.evidenceRefs,
      committedAt: toTimestamp(this.#clock(), "operatorActionCommit.committedAt"),
    };
    const effectRequest: OperatorEffectRequest = {
      commandId: request.command.commandId,
      previewId: envelope.preview.previewId,
      operatorId: context.operatorId,
      projectId: request.projectId,
      projectSessionId: actionSessionId(authenticated, envelope.preview.intent),
      principalGeneration: context.principalGeneration,
      operation: requiredOperatorActionForIntent(envelope.preview.intent),
      intent: envelope.preview.intent,
      intentDigest: envelope.preview.intentDigest,
      beforeStateDigest: envelope.preview.beforeStateDigest,
      attemptGeneration: 1,
      operatorInputRecordDigest: preparedState.operatorInputRecordDigest,
    };
    const prepare = this.#database.transaction((): OperatorActionReceipt | null => {
      const concurrentReplay = this.#commandReplay(
        context.operatorId,
        request.command.commandId,
        payloadHash,
      );
      if (concurrentReplay !== null) return concurrentReplay;
      const latest = this.#previewRow(request.previewId);
      this.#assertPreviewClaim(latest, request.command.commandId);
      this.#database.prepare(`
        UPDATE operator_previews SET preview_json=?, confirmed_command_id=? WHERE preview_id=?
      `).run(
        canonicalJson({ preview: envelope.preview, action: { ...preparedState, receipt: preparedReceipt } }),
        request.command.commandId,
        request.previewId,
      );
      this.#insertCommand(
        context,
        request.command,
        request.projectId,
        actionSessionId(authenticated, envelope.preview.intent),
        requiredOperatorActionForIntent(envelope.preview.intent),
        payloadHash,
        current,
        preparedState,
        preparedReceipt,
        "committed",
      );
      this.#effectPort.prepare?.(effectRequest);
      return null;
    });
    const concurrentReplay = prepare();
    if (concurrentReplay !== null) return concurrentReplay;

    let outcome: OperatorEffectOutcome;
    try {
      outcome = await this.#effectPort.dispatch(effectRequest);
    } catch {
      return preparedReceipt;
    }
    return this.#applyEffectOutcome(
      context.operatorId,
      request.command.commandId,
      envelope.preview,
      preparedReceipt,
      outcome,
      1,
    );
  }

  async #commitLaunch(
    context: AuthenticatedOperatorContext,
    request: OperatorActionCommitRequest,
    envelope: StoredPreviewEnvelope,
    intent: Extract<OperatorActionIntent, { kind: "project-session-launch" }>,
    authenticated: AuthenticatedOperatorCredential,
    payloadHash: string,
    current: OperatorActionCurrentState,
  ): Promise<OperatorActionReceipt> {
    const launchCustody = this.#launchCustody;
    if (launchCustody === undefined) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "launch custody runtime is unavailable");
    }
    const inspection = await launchCustody.inspect(intent);
    const provisionalState = {
      status: "pending" as const,
      commandId: request.command.commandId,
      phase: "prepared" as const,
      attemptGeneration: 1,
    };
    const provisionalReceipt: OperatorActionReceipt = {
      commandId: request.command.commandId,
      previewId: envelope.preview.previewId,
      previewRevision: envelope.preview.previewRevision,
      intentDigest: envelope.preview.intentDigest,
      beforeStateDigest: envelope.preview.beforeStateDigest,
      afterStateDigest: digestValue(provisionalState, "operatorLaunchCommit.provisionalStateDigest"),
      evidenceRefs: envelope.preview.evidenceRefs,
      committedAt: toTimestamp(this.#clock(), "operatorLaunchCommit.committedAt"),
    };
    const prepare = this.#database.transaction(():
      | { kind: "replay"; receipt: OperatorActionReceipt }
      | { kind: "prepared"; receipt: OperatorActionReceipt; handle: LaunchDispatchHandle } => {
      const concurrentReplay = this.#commandReplay(context.operatorId, request.command.commandId, payloadHash);
      if (concurrentReplay !== null) return { kind: "replay", receipt: concurrentReplay };
      const latest = this.#previewRow(request.previewId);
      this.#assertPreviewClaim(latest, request.command.commandId);
      this.#database.prepare(`
        UPDATE operator_previews SET preview_json=?, confirmed_command_id=? WHERE preview_id=?
      `).run(
        canonicalJson({ preview: envelope.preview, action: { ...provisionalState, receipt: provisionalReceipt } }),
        request.command.commandId,
        request.previewId,
      );
      this.#insertCommand(
        context,
        request.command,
        request.projectId,
        actionSessionId(authenticated, intent),
        "launch",
        payloadHash,
        current,
        provisionalState,
        provisionalReceipt,
        "committed",
      );
      const handle = launchCustody.prepareInTransaction({
        inspection,
        operatorId: context.operatorId,
        operatorCommandId: request.command.commandId,
        principal: context,
      });
      const launchProviderActionJournalRef = launchCustody.launchProviderActionJournalRefForCommand(
        context.operatorId,
        request.command.commandId,
      );
      const preparedState = {
        ...provisionalState,
        attemptGeneration: launchProviderActionJournalRef.custodyAttemptGeneration,
      };
      const receipt: OperatorActionReceipt = {
        ...provisionalReceipt,
        afterStateDigest: digestValue(preparedState, "operatorLaunchCommit.preparedStateDigest"),
        launchProviderActionJournalRef,
      };
      this.#database.prepare(`
        UPDATE operator_previews SET preview_json=? WHERE preview_id=?
      `).run(
        canonicalJson({ preview: envelope.preview, action: { ...preparedState, receipt } }),
        request.previewId,
      );
      this.#database.prepare(`
        UPDATE operator_commands SET after_json=?, result_json=?
         WHERE operator_id=? AND command_id=?
      `).run(
        canonicalJson(preparedState),
        canonicalJson(receipt),
        context.operatorId,
        request.command.commandId,
      );
      return { kind: "prepared", receipt, handle };
    });
    const prepared = prepare.immediate();
    if (prepared.kind === "replay") return prepared.receipt;
    await launchCustody.dispatchPrepared(prepared.handle);
    return {
      ...prepared.receipt,
      launchProviderActionJournalRef: launchCustody.launchProviderActionJournalRefForCommand(
        context.operatorId,
        request.command.commandId,
      ),
    };
  }

  async #commitChairRecovery(
    context: AuthenticatedOperatorContext,
    request: OperatorActionCommitRequest,
    envelope: StoredPreviewEnvelope,
    intent: Extract<OperatorActionIntent, { kind: "chair-bridge-recovery" }>,
    authenticated: AuthenticatedOperatorCredential,
    payloadHash: string,
    current: OperatorActionCurrentState,
  ): Promise<OperatorActionReceipt> {
    const custody = this.#chairRecoveryCustody;
    if (custody === undefined) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "chair recovery custody runtime is unavailable");
    }
    const inspection = await custody.inspectChairRecovery(intent);
    const providerActionTicket = custody.preflightChairRecovery({ inspection, principal: context });
    const provisionalState = {
      status: "pending" as const,
      commandId: request.command.commandId,
      phase: "prepared" as const,
      attemptGeneration: 1,
    };
    const provisionalReceipt: OperatorActionReceipt = {
      commandId: request.command.commandId,
      previewId: envelope.preview.previewId,
      previewRevision: envelope.preview.previewRevision,
      intentDigest: envelope.preview.intentDigest,
      beforeStateDigest: envelope.preview.beforeStateDigest,
      afterStateDigest: digestValue(provisionalState, "operatorChairRecoveryCommit.provisionalStateDigest"),
      evidenceRefs: envelope.preview.evidenceRefs,
      committedAt: toTimestamp(this.#clock(), "operatorChairRecoveryCommit.committedAt"),
    };
    const prepare = this.#database.transaction(():
      | { kind: "replay"; receipt: OperatorActionReceipt }
      | { kind: "prepared"; handle: ChairRecoveryDispatchHandle } => {
      const concurrentReplay = this.#commandReplay(context.operatorId, request.command.commandId, payloadHash);
      if (concurrentReplay !== null) return { kind: "replay", receipt: concurrentReplay };
      const latest = this.#previewRow(request.previewId);
      this.#assertPreviewClaim(latest, request.command.commandId);
      this.#database.prepare(`
        UPDATE operator_previews SET preview_json=?, confirmed_command_id=? WHERE preview_id=?
      `).run(
        canonicalJson({ preview: envelope.preview, action: { ...provisionalState, receipt: provisionalReceipt } }),
        request.command.commandId,
        request.previewId,
      );
      this.#insertCommand(
        context,
        request.command,
        request.projectId,
        actionSessionId(authenticated, intent),
        "takeover",
        payloadHash,
        current,
        provisionalState,
        provisionalReceipt,
        "committed",
      );
      return {
        kind: "prepared",
        handle: custody.prepareChairRecoveryInTransaction({
          inspection,
          operatorId: context.operatorId,
          operatorCommandId: request.command.commandId,
          providerActionTicket,
        }),
      };
    });
    const prepared = providerActionTicket === null
      ? prepare.immediate()
      : prepareProviderActionAfterPreflight(() => prepare.immediate(), custody, providerActionTicket);
    if (prepared.kind === "replay") return prepared.receipt;
    let outcome: ChairRecoveryCommit;
    try {
      outcome = await custody.dispatchPreparedChairRecovery(prepared.handle);
    } catch {
      return provisionalReceipt;
    }
    if (outcome.status !== "committed") return provisionalReceipt;
    const receipt: OperatorActionReceipt = {
      ...provisionalReceipt,
      afterStateDigest: digestValue(outcome, "operatorChairRecoveryCommit.afterStateDigest"),
    };
    const terminal: StoredTerminalAction = {
      status: "terminal",
      commandId: request.command.commandId,
      receipt,
    };
    this.#database.transaction(() => {
      this.#updateStoredAction(envelope.preview.previewId, envelope.preview, terminal);
      this.#database.prepare(`
        UPDATE operator_commands SET result_json=?, after_json=?
         WHERE operator_id=? AND command_id=? AND status='committed'
      `).run(
        canonicalJson(receipt),
        canonicalJson(outcome),
        context.operatorId,
        request.command.commandId,
      );
    })();
    return receipt;
  }

  async #commitChairLiveHandoff(
    context: AuthenticatedOperatorContext,
    request: OperatorActionCommitRequest,
    envelope: StoredPreviewEnvelope,
    intent: Extract<OperatorActionIntent, { kind: "chair-live-handoff" }>,
    authenticated: AuthenticatedOperatorCredential,
    payloadHash: string,
    current: OperatorActionCurrentState,
  ): Promise<OperatorActionReceipt> {
    const custody = this.#chairLiveHandoffCustody;
    if (custody === undefined) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "chair live handoff custody runtime is unavailable");
    }
    const inspection = await custody.inspectChairLiveHandoff(intent);
    const providerActionTicket = custody.preflightChairLiveHandoff({
      inspection,
      operatorCommandId: request.command.commandId,
      principal: context,
    });
    const provisionalState = {
      status: "pending" as const,
      commandId: request.command.commandId,
      phase: "prepared" as const,
      attemptGeneration: 1,
    };
    const provisionalReceipt: OperatorActionReceipt = {
      commandId: request.command.commandId,
      previewId: envelope.preview.previewId,
      previewRevision: envelope.preview.previewRevision,
      intentDigest: envelope.preview.intentDigest,
      beforeStateDigest: envelope.preview.beforeStateDigest,
      afterStateDigest: digestValue(provisionalState, "operatorChairLiveHandoffCommit.provisionalStateDigest"),
      evidenceRefs: envelope.preview.evidenceRefs,
      committedAt: toTimestamp(this.#clock(), "operatorChairLiveHandoffCommit.committedAt"),
    };
    const prepare = this.#database.transaction(():
      | { kind: "replay"; receipt: OperatorActionReceipt }
      | { kind: "prepared"; handle: ChairLiveHandoffDispatchHandle } => {
      const concurrentReplay = this.#commandReplay(context.operatorId, request.command.commandId, payloadHash);
      if (concurrentReplay !== null) return { kind: "replay", receipt: concurrentReplay };
      const latest = this.#previewRow(request.previewId);
      this.#assertPreviewClaim(latest, request.command.commandId);
      this.#database.prepare(`
        UPDATE operator_previews SET preview_json=?, confirmed_command_id=? WHERE preview_id=?
      `).run(
        canonicalJson({ preview: envelope.preview, action: { ...provisionalState, receipt: provisionalReceipt } }),
        request.command.commandId,
        request.previewId,
      );
      this.#insertCommand(
        context,
        request.command,
        request.projectId,
        actionSessionId(authenticated, intent),
        "takeover",
        payloadHash,
        current,
        provisionalState,
        provisionalReceipt,
        "committed",
      );
      return {
        kind: "prepared",
        handle: custody.prepareChairLiveHandoffInTransaction({
          inspection,
          operatorId: context.operatorId,
          operatorCommandId: request.command.commandId,
          providerActionTicket,
        }),
      };
    });
    const prepared = prepareProviderActionAfterPreflight(() => prepare.immediate(), custody, providerActionTicket);
    if (prepared.kind === "replay") return prepared.receipt;
    let outcome: ChairLiveHandoffCommit;
    try {
      outcome = await custody.dispatchPreparedChairLiveHandoff(prepared.handle);
    } catch {
      return provisionalReceipt;
    }
    if (outcome.status !== "committed") return provisionalReceipt;
    const receipt: OperatorActionReceipt = {
      ...provisionalReceipt,
      afterStateDigest: digestValue(outcome, "operatorChairLiveHandoffCommit.afterStateDigest"),
    };
    const terminal: StoredTerminalAction = {
      status: "terminal",
      commandId: request.command.commandId,
      receipt,
    };
    this.#database.transaction(() => {
      this.#updateStoredAction(envelope.preview.previewId, envelope.preview, terminal);
      this.#database.prepare(`
        UPDATE operator_commands SET result_json=?, after_json=?
         WHERE operator_id=? AND command_id=? AND status='committed'
      `).run(
        canonicalJson(receipt),
        canonicalJson(outcome),
        context.operatorId,
        request.command.commandId,
      );
    })();
    return receipt;
  }

  async #commitLifecycleRecovery(
    context: AuthenticatedOperatorContext,
    request: OperatorActionCommitRequest,
    envelope: StoredPreviewEnvelope,
    intent: LifecycleRecoveryIntent,
    authenticated: AuthenticatedOperatorCredential,
    payloadHash: string,
    current: OperatorActionCurrentState,
  ): Promise<OperatorActionReceipt> {
    const custody = this.#lifecycleRecoveryCustody;
    if (custody === undefined) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "lifecycle recovery custody runtime is unavailable");
    }
    const inspection = await custody.inspectLifecycleRecovery(intent);
    if (canonicalJson(inspection.intent) !== canonicalJson(intent)) {
      throw new ProjectFabricCoreError("STALE_REVISION", "lifecycle recovery inspection crossed its intent");
    }
    const provisionalState = {
      status: "pending" as const,
      commandId: request.command.commandId,
      phase: "prepared" as const,
      attemptGeneration: 1,
    };
    const provisionalReceipt: OperatorActionReceipt = {
      commandId: request.command.commandId,
      previewId: envelope.preview.previewId,
      previewRevision: envelope.preview.previewRevision,
      intentDigest: envelope.preview.intentDigest,
      beforeStateDigest: envelope.preview.beforeStateDigest,
      afterStateDigest: digestValue(provisionalState, "operatorLifecycleRecoveryCommit.provisionalStateDigest"),
      evidenceRefs: envelope.preview.evidenceRefs,
      committedAt: toTimestamp(this.#clock(), "operatorLifecycleRecoveryCommit.committedAt"),
    };
    const prepare = this.#database.transaction(():
      | { kind: "replay"; receipt: OperatorActionReceipt }
      | { kind: "prepared"; receipt: OperatorActionReceipt } => {
      const concurrentReplay = this.#commandReplay(context.operatorId, request.command.commandId, payloadHash);
      if (concurrentReplay !== null) return { kind: "replay", receipt: concurrentReplay };
      const latest = this.#previewRow(request.previewId);
      this.#assertPreviewClaim(latest, request.command.commandId);
      const outcome = intent.path === "fresh-rotate"
        ? custody.prepareLifecycleFreshRotateInTransaction({
            inspection,
            operatorId: context.operatorId,
            operatorCommandId: request.command.commandId,
          })
        : custody.prepareLifecycleAbandonInTransaction({
            inspection,
            operatorId: context.operatorId,
            operatorCommandId: request.command.commandId,
          });
      const receipt: OperatorActionReceipt = outcome.status === "committed"
        ? {
            ...provisionalReceipt,
            afterStateDigest: digestValue(outcome, "operatorLifecycleRecoveryCommit.afterStateDigest"),
          }
        : provisionalReceipt;
      const action: StoredAction = outcome.status === "committed"
        ? { status: "terminal", commandId: request.command.commandId, receipt }
        : { ...provisionalState, receipt };
      this.#database.prepare(`
        UPDATE operator_previews SET preview_json=?, confirmed_command_id=? WHERE preview_id=?
      `).run(
        canonicalJson({ preview: envelope.preview, action }),
        request.command.commandId,
        request.previewId,
      );
      this.#insertCommand(
        context,
        request.command,
        request.projectId,
        actionSessionId(authenticated, intent),
        requiredOperatorActionForIntent(intent),
        payloadHash,
        current,
        outcome,
        receipt,
        "committed",
      );
      return { kind: "prepared", receipt };
    });
    return prepare.immediate().receipt;
  }

  status(request: OperatorActionStatusRequest): OperatorActionStatus {
    const authenticated = this.#operatorStore.authenticateCredential(request.credential.token);
    if (
      authenticated.capabilityId !== request.credential.capabilityId ||
      authenticated.context.projectId !== request.projectId ||
      !authenticated.actions.includes("read")
    ) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator status credential is not authorised");
    }
    const command = this.#database.prepare(`
      SELECT status, result_json, operation FROM operator_commands
       WHERE operator_id=? AND command_id=? AND project_id=?
         AND (? IS NULL OR project_session_id=?)
    `).get(
      authenticated.context.operatorId,
      request.commandId,
      request.projectId,
      authenticated.projectSessionId ?? null,
      authenticated.projectSessionId ?? null,
    );
    if (!isRow(command)) return { status: "not-found", commandId: request.commandId };
    if (text(command, "status") === "rejected") {
      return parseRejectedStatus(text(command, "result_json"), request.commandId);
    }
    const previewValue = this.#database.prepare(`
      SELECT preview_json FROM operator_previews WHERE confirmed_command_id=? AND operator_id=?
    `).get(request.commandId, authenticated.context.operatorId);
    if (!isRow(previewValue)) {
      if (text(command, "operation") === "git-custody-resolve") {
        return parseOperationResult(
          FABRIC_OPERATIONS.operatorActionReconcile,
          JSON.parse(text(command, "result_json")),
        );
      }
      return {
        status: "committed",
        commandId: request.commandId,
        receipt: parseReceipt(text(command, "result_json")),
      };
    }
    const envelope = parseStoredPreview(text(previewValue, "preview_json"));
    if (envelope.action === null) throw new Error("confirmed operator preview has no action state");
    if (envelope.preview.intent.kind === "project-session-launch") {
      return this.#launchStatus(
        authenticated.context.operatorId,
        request.commandId,
        envelope,
      );
    }
    if (envelope.preview.intent.kind === "chair-bridge-recovery") {
      return this.#chairRecoveryStatus(
        authenticated.context.operatorId,
        request.commandId,
        envelope,
      );
    }
    if (envelope.preview.intent.kind === "chair-live-handoff") {
      return this.#chairLiveHandoffStatus(
        authenticated.context.operatorId,
        request.commandId,
        envelope,
      );
    }
    if (envelope.preview.intent.kind === "agent-lifecycle-recovery") {
      return this.#lifecycleRecoveryStatus(
        authenticated.context.operatorId,
        request.commandId,
        envelope,
      );
    }
    if (envelope.preview.intent.kind === "git") {
      const gitStatus = this.#effectPort.status?.(request.commandId, envelope.preview.intentDigest);
      if (gitStatus !== undefined && gitStatus !== null) return gitStatus;
    }
    return statusFromAction(envelope.action, envelope.preview.intentDigest);
  }

  #chairRecoveryStatus(
    operatorId: string,
    commandId: string,
    envelope: StoredPreviewEnvelope,
  ): OperatorActionStatus {
    const custody = this.#chairRecoveryCustody;
    if (custody === undefined || envelope.action === null) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "chair recovery custody runtime is unavailable");
    }
    const observed = custody.chairRecoveryStatus(operatorId, commandId);
    if (observed.status === "committed") {
      const receipt: OperatorActionReceipt = {
        ...parseStoredReceipt(envelope.action),
        afterStateDigest: digestValue(observed, "operatorChairRecoveryStatus.afterStateDigest"),
      };
      return { status: "committed", commandId, receipt };
    }
    if (observed.status === "no-effect") {
      return {
        status: "rejected",
        commandId,
        intentDigest: envelope.preview.intentDigest,
        code: "state-changed",
        evidenceRefs: [],
      };
    }
    const attemptGeneration = envelope.action.status === "pending" || envelope.action.status === "ambiguous"
      ? envelope.action.attemptGeneration
      : 1;
    return {
      status: "pending",
      commandId,
      intentDigest: envelope.preview.intentDigest,
      phase: observed.status === "ambiguous" ? "observing" : "prepared",
      attemptGeneration,
    };
  }

  #chairLiveHandoffStatus(
    operatorId: string,
    commandId: string,
    envelope: StoredPreviewEnvelope,
  ): OperatorActionStatus {
    const custody = this.#chairLiveHandoffCustody;
    if (custody === undefined || envelope.action === null) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "chair live handoff custody runtime is unavailable");
    }
    const observed = custody.chairLiveHandoffStatus(operatorId, commandId);
    if (observed.status === "committed") {
      const receipt: OperatorActionReceipt = {
        ...parseStoredReceipt(envelope.action),
        afterStateDigest: digestValue(observed, "operatorChairLiveHandoffStatus.afterStateDigest"),
      };
      return { status: "committed", commandId, receipt };
    }
    if (observed.status === "no-effect") {
      return {
        status: "rejected",
        commandId,
        intentDigest: envelope.preview.intentDigest,
        code: "state-changed",
        evidenceRefs: [],
      };
    }
    const attemptGeneration = envelope.action.status === "pending" || envelope.action.status === "ambiguous"
      ? envelope.action.attemptGeneration
      : 1;
    if (observed.status === "ambiguous") {
      if (envelope.preview.intent.kind !== "chair-live-handoff") throw new Error("chair live handoff preview changed");
      return {
        status: "ambiguous",
        commandId,
        intentDigest: envelope.preview.intentDigest,
        attemptGeneration,
        effectRef: envelope.preview.intent.handoffRef,
      };
    }
    return {
      status: "pending",
      commandId,
      intentDigest: envelope.preview.intentDigest,
      phase: "observing",
      attemptGeneration,
    };
  }

  #lifecycleRecoveryStatus(
    operatorId: string,
    commandId: string,
    envelope: StoredPreviewEnvelope,
  ): OperatorActionStatus {
    const custody = this.#lifecycleRecoveryCustody;
    if (custody === undefined || envelope.action === null) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "lifecycle recovery custody runtime is unavailable");
    }
    return lifecycleRecoveryStatusResult(
      custody.lifecycleRecoveryStatus(operatorId, commandId),
      commandId,
      envelope,
    );
  }

  #launchStatus(
    operatorId: string,
    commandId: string,
    envelope: StoredPreviewEnvelope,
  ): OperatorActionStatus {
    const launchCustody = this.#launchCustody;
    if (launchCustody === undefined || envelope.action === null) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "launch custody runtime is unavailable");
    }
    const launchProviderActionJournalRef = launchCustody.launchProviderActionJournalRefForCommand(
      operatorId,
      commandId,
    );
    const receipt: OperatorActionReceipt = {
      ...parseStoredReceipt(envelope.action),
      launchProviderActionJournalRef,
    };
    if (launchProviderActionJournalRef.journalState === "terminal") {
      return { status: "committed", commandId, receipt };
    }
    if (launchProviderActionJournalRef.journalState === "ambiguous") {
      return {
        status: "ambiguous",
        commandId,
        intentDigest: envelope.preview.intentDigest,
        attemptGeneration: launchProviderActionJournalRef.custodyAttemptGeneration,
        launchProviderActionJournalRef,
      };
    }
    return {
      status: "pending",
      commandId,
      intentDigest: envelope.preview.intentDigest,
      phase: launchProviderActionJournalRef.journalState,
      attemptGeneration: launchProviderActionJournalRef.custodyAttemptGeneration,
      launchProviderActionJournalRef,
    };
  }

  async reconcile(
    context: AuthenticatedOperatorContext,
    request: OperatorActionReconcileRequest,
  ): Promise<OperatorActionStatus> {
    if (request.mode !== "observe-only") {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator action reconciliation is observe-only");
    }
    const stored = row(this.#database.prepare(`
      SELECT * FROM operator_previews WHERE confirmed_command_id=? AND operator_id=?
    `).get(request.targetCommandId, context.operatorId), "operator action target");
    const envelope = parseStoredPreview(text(stored, "preview_json"));
    if (envelope.preview.intent.kind === "project-session-launch") {
      throw new ProjectFabricCoreError(
        "CAPABILITY_FORBIDDEN",
        "public operator reconciliation cannot own a launch provider action",
      );
    }
    if (envelope.preview.intent.kind === "chair-bridge-recovery") {
      return await this.#reconcileChairRecovery(context, request, stored, envelope);
    }
    if (envelope.preview.intent.kind === "chair-live-handoff") {
      return await this.#reconcileChairLiveHandoff(context, request, stored, envelope);
    }
    if (envelope.preview.intent.kind === "agent-lifecycle-recovery") {
      return await this.#reconcileLifecycleRecovery(context, request, stored, envelope);
    }
    if (request.gitConflict !== undefined) {
      return await this.#reconcileGitConflict(context, request, stored, envelope);
    }
    const authenticated = this.#authenticateCommand(context, request.command, request.projectId, envelope.preview.intent);
    this.#assertStoredPreviewScope(stored, authenticated, request.projectId, envelope.preview.intent);
    const payloadHash = sha256(canonicalJson(sanitisedReconcileRequest(request)));
    const replay = this.#reconcileReplay(context.operatorId, request.command.commandId, payloadHash);
    if (replay !== null) return replay;
    if (request.command.commandId === request.targetCommandId) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "reconciliation requires a distinct command ID");
    }
    const action = envelope.action;
    if (action === null || action.status === "terminal" || action.status === "rejected") {
      throw new ProjectFabricCoreError("CONFLICT", "operator action is not reconcilable");
    }
    if (action.status !== request.expectedStatus || action.attemptGeneration !== request.expectedAttemptGeneration) {
      throw new ProjectFabricCoreError("STALE_REVISION", "operator action reconciliation target changed");
    }
    const targetCommand = row(this.#database.prepare(`
      SELECT expected_revision FROM operator_commands WHERE operator_id=? AND command_id=?
    `).get(context.operatorId, request.targetCommandId), "operator action command");
    if (request.command.expectedRevision !== integer(targetCommand, "expected_revision")) {
      throw new ProjectFabricCoreError("STALE_REVISION", "reconciliation target revision changed");
    }
    const nextGeneration = action.attemptGeneration + 1;
    const effectRef = action.status === "ambiguous" ? action.effectRef : null;
    const observing: StoredPendingAction = {
      status: "pending",
      commandId: request.targetCommandId,
      phase: "observing",
      attemptGeneration: nextGeneration,
      receipt: action.receipt,
    };
    const observingStatus = statusFromAction(observing, envelope.preview.intentDigest);
    const prepare = this.#database.transaction((): OperatorActionStatus | null => {
      const concurrentReplay = this.#reconcileReplay(
        context.operatorId,
        request.command.commandId,
        payloadHash,
      );
      if (concurrentReplay !== null) return concurrentReplay;
      const latestEnvelope = parseStoredPreview(text(this.#previewRow(envelope.preview.previewId), "preview_json"));
      const latestAction = latestEnvelope.action;
      if (
        latestAction === null ||
        latestAction.status !== request.expectedStatus ||
        latestAction.attemptGeneration !== request.expectedAttemptGeneration
      ) {
        throw new ProjectFabricCoreError("STALE_REVISION", "operator action reconciliation target changed");
      }
      this.#updateStoredAction(envelope.preview.previewId, envelope.preview, observing);
      this.#insertCommand(
        context,
        request.command,
        request.projectId,
        actionSessionId(authenticated, envelope.preview.intent),
        requiredOperatorActionForIntent(envelope.preview.intent),
        payloadHash,
        action,
        observing,
        observingStatus,
        "committed",
      );
      return null;
    });
    const concurrentReplay = prepare();
    if (concurrentReplay !== null) return concurrentReplay;

    let outcome: OperatorEffectOutcome;
    try {
      outcome = await this.#effectPort.observe({
        commandId: request.targetCommandId,
        previewId: envelope.preview.previewId,
        operatorId: context.operatorId,
        projectId: request.projectId,
        projectSessionId: actionSessionId(authenticated, envelope.preview.intent),
        principalGeneration: context.principalGeneration,
        operation: requiredOperatorActionForIntent(envelope.preview.intent),
        intent: envelope.preview.intent,
        intentDigest: envelope.preview.intentDigest,
        beforeStateDigest: envelope.preview.beforeStateDigest,
        attemptGeneration: nextGeneration,
        effectRef,
      });
    } catch {
      return observingStatus;
    }
    try {
      this.#applyEffectOutcome(
        context.operatorId,
        request.targetCommandId,
        envelope.preview,
        action.receipt,
        outcome,
        nextGeneration,
      );
    } catch (error: unknown) {
      const rejected = this.status({
        credential: request.command.credential,
        projectId: request.projectId,
        commandId: request.targetCommandId,
      });
      this.#updateReconcileCommand(context.operatorId, request.command.commandId, rejected);
      throw error;
    }
    const result = this.status({
      credential: request.command.credential,
      projectId: request.projectId,
      commandId: request.targetCommandId,
    });
    this.#updateReconcileCommand(context.operatorId, request.command.commandId, result);
    return result;
  }

  async #reconcileGitConflict(
    context: AuthenticatedOperatorContext,
    request: OperatorActionReconcileRequest,
    stored: Row,
    envelope: StoredPreviewEnvelope,
  ): Promise<OperatorActionStatus> {
    if (envelope.preview.intent.kind !== "git" || request.gitConflict === undefined) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "Git conflict reconciliation requires typed Git custody");
    }
    const reconcileGit = this.#effectPort.reconcileGit;
    const status = this.#effectPort.status?.(request.targetCommandId, envelope.preview.intentDigest);
    if (reconcileGit === undefined || status === undefined || status === null) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "typed Git custody reconciliation is unavailable");
    }
    const authenticated = this.#authenticateCommand(
      context,
      request.command,
      request.projectId,
      envelope.preview.intent,
      "git-custody-resolve",
    );
    this.#assertStoredPreviewScope(stored, authenticated, request.projectId, envelope.preview.intent);
    const payloadHash = sha256(canonicalJson(sanitisedReconcileRequest(request)));
    const replay = this.#reconcileReplay(context.operatorId, request.command.commandId, payloadHash);
    if (replay !== null) return replay;
    if (
      status.status !== request.expectedStatus ||
      !("attemptGeneration" in status) ||
      status.attemptGeneration !== request.expectedAttemptGeneration
    ) throw new ProjectFabricCoreError("STALE_REVISION", "typed Git reconciliation target changed");
    if (request.command.commandId === request.targetCommandId) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "reconciliation requires a distinct command ID");
    }
    const targetCommand = row(this.#database.prepare(`
      SELECT expected_revision FROM operator_commands WHERE operator_id=? AND command_id=?
    `).get(context.operatorId, request.targetCommandId), "typed Git target command");
    if (request.command.expectedRevision !== integer(targetCommand, "expected_revision")) {
      throw new ProjectFabricCoreError("STALE_REVISION", "typed Git reconciliation target revision changed");
    }
    const action = envelope.action;
    if (action === null || action.status === "terminal" || action.status === "rejected") {
      throw new ProjectFabricCoreError("CONFLICT", "typed Git target is not reconcilable");
    }
    const nextAttemptGeneration = status.attemptGeneration + 1;
    const observing: StoredPendingAction = {
      status: "pending",
      commandId: request.targetCommandId,
      phase: "observing",
      attemptGeneration: nextAttemptGeneration,
      receipt: action.receipt,
    };
    const observingStatus = statusFromAction(observing, envelope.preview.intentDigest);
    this.#database.transaction(() => {
      const concurrentReplay = this.#reconcileReplay(context.operatorId, request.command.commandId, payloadHash);
      if (concurrentReplay !== null) return;
      const latest = this.#effectPort.status?.(request.targetCommandId, envelope.preview.intentDigest);
      if (
        latest === undefined || latest === null || latest.status !== request.expectedStatus ||
        !("attemptGeneration" in latest) || latest.attemptGeneration !== request.expectedAttemptGeneration
      ) throw new ProjectFabricCoreError("STALE_REVISION", "typed Git reconciliation target changed");
      this.#updateStoredAction(envelope.preview.previewId, envelope.preview, observing);
      this.#insertCommand(
        context,
        request.command,
        request.projectId,
        actionSessionId(authenticated, envelope.preview.intent),
        "git-custody-resolve",
        payloadHash,
        status,
        observing,
        observingStatus,
        "committed",
      );
    })();
    let result: OperatorActionStatus;
    try {
      result = await reconcileGit({
        request,
        targetIntent: envelope.preview.intent,
        intentDigest: envelope.preview.intentDigest,
        nextAttemptGeneration,
      });
    } catch (error: unknown) {
      if (error instanceof ProjectFabricCoreError) {
        const rejected: OperatorActionStatus = {
          status: "rejected",
          commandId: request.command.commandId,
          intentDigest: envelope.preview.intentDigest,
          code: error.code === "STALE_GENERATION" ? "generation-stale" : "state-changed",
          evidenceRefs: envelope.preview.evidenceRefs,
        };
        this.#updateReconcileCommand(context.operatorId, request.command.commandId, rejected);
        return rejected;
      }
      return observingStatus;
    }
    this.#updateReconcileCommand(context.operatorId, request.command.commandId, result);
    return result;
  }

  async #reconcileLifecycleRecovery(
    context: AuthenticatedOperatorContext,
    request: OperatorActionReconcileRequest,
    stored: Row,
    envelope: StoredPreviewEnvelope,
  ): Promise<OperatorActionStatus> {
    const custody = this.#lifecycleRecoveryCustody;
    if (
      custody === undefined ||
      envelope.action === null ||
      envelope.preview.intent.kind !== "agent-lifecycle-recovery"
    ) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "lifecycle recovery custody runtime is unavailable");
    }
    const authenticated = this.#authenticateCommand(
      context,
      request.command,
      request.projectId,
      envelope.preview.intent,
    );
    this.#assertStoredPreviewScope(stored, authenticated, request.projectId, envelope.preview.intent);
    const payloadHash = sha256(canonicalJson(sanitisedReconcileRequest(request)));
    const replay = this.#reconcileReplay(context.operatorId, request.command.commandId, payloadHash);
    if (replay !== null) return replay;
    if (request.command.commandId === request.targetCommandId) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "reconciliation requires a distinct command ID");
    }
    const currentStatus = this.#lifecycleRecoveryStatus(
      context.operatorId,
      request.targetCommandId,
      envelope,
    );
    if (
      currentStatus.status !== request.expectedStatus ||
      (currentStatus.status === "pending" || currentStatus.status === "ambiguous") &&
        currentStatus.attemptGeneration !== request.expectedAttemptGeneration
    ) {
      throw new ProjectFabricCoreError("STALE_REVISION", "lifecycle recovery reconciliation target changed");
    }
    const observed = await custody.reconcileLifecycleRecovery(
      context.operatorId,
      request.targetCommandId,
    );
    const result = lifecycleRecoveryStatusResult(
      observed,
      request.targetCommandId,
      envelope,
      request.expectedAttemptGeneration + 1,
    );
    const baseReceipt = parseStoredReceipt(envelope.action);
    if (result.status === "committed") {
      this.#updateStoredAction(envelope.preview.previewId, envelope.preview, {
        status: "terminal",
        commandId: request.targetCommandId,
        receipt: result.receipt,
      });
      this.#database.prepare(`
        UPDATE operator_commands SET result_json=?, after_json=?
         WHERE operator_id=? AND command_id=?
      `).run(
        canonicalJson(result.receipt),
        canonicalJson(observed),
        context.operatorId,
        request.targetCommandId,
      );
    } else if (result.status === "pending") {
      this.#updateStoredAction(envelope.preview.previewId, envelope.preview, {
        status: "pending",
        commandId: request.targetCommandId,
        phase: result.phase,
        attemptGeneration: result.attemptGeneration,
        receipt: baseReceipt,
      });
    }
    this.#database.transaction(() => {
      this.#insertCommand(
        context,
        request.command,
        request.projectId,
        actionSessionId(authenticated, envelope.preview.intent),
        requiredOperatorActionForIntent(envelope.preview.intent),
        payloadHash,
        currentStatus,
        result,
        result,
        "committed",
      );
    })();
    return result;
  }

  async #reconcileChairRecovery(
    context: AuthenticatedOperatorContext,
    request: OperatorActionReconcileRequest,
    stored: Row,
    envelope: StoredPreviewEnvelope,
  ): Promise<OperatorActionStatus> {
    const custody = this.#chairRecoveryCustody;
    if (custody === undefined || envelope.action === null) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "chair recovery custody runtime is unavailable");
    }
    const authenticated = this.#authenticateCommand(context, request.command, request.projectId, envelope.preview.intent);
    this.#assertStoredPreviewScope(stored, authenticated, request.projectId, envelope.preview.intent);
    const payloadHash = sha256(canonicalJson(sanitisedReconcileRequest(request)));
    const replay = this.#reconcileReplay(context.operatorId, request.command.commandId, payloadHash);
    if (replay !== null) return replay;
    if (request.command.commandId === request.targetCommandId) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "reconciliation requires a distinct command ID");
    }
    const currentStatus = this.#chairRecoveryStatus(context.operatorId, request.targetCommandId, envelope);
    if (
      currentStatus.status !== request.expectedStatus ||
      (currentStatus.status === "pending" || currentStatus.status === "ambiguous") &&
        currentStatus.attemptGeneration !== request.expectedAttemptGeneration
    ) throw new ProjectFabricCoreError("STALE_REVISION", "chair recovery reconciliation target changed");
    const observed = await custody.reconcileChairRecovery(context.operatorId, request.targetCommandId);
    const baseReceipt = parseStoredReceipt(envelope.action);
    let result: OperatorActionStatus;
    if (observed.status === "committed") {
      const receipt: OperatorActionReceipt = {
        ...baseReceipt,
        afterStateDigest: digestValue(observed, "operatorChairRecoveryReconcile.afterStateDigest"),
      };
      this.#updateStoredAction(envelope.preview.previewId, envelope.preview, {
        status: "terminal",
        commandId: request.targetCommandId,
        receipt,
      });
      this.#database.prepare(`
        UPDATE operator_commands SET result_json=?, after_json=?
         WHERE operator_id=? AND command_id=?
      `).run(canonicalJson(receipt), canonicalJson(observed), context.operatorId, request.targetCommandId);
      result = { status: "committed", commandId: request.targetCommandId, receipt };
    } else if (observed.status === "no-effect") {
      result = {
        status: "rejected",
        commandId: request.targetCommandId,
        intentDigest: envelope.preview.intentDigest,
        code: "state-changed",
        evidenceRefs: [],
      };
    } else {
      const pending: StoredPendingAction = {
        status: "pending",
        commandId: request.targetCommandId,
        phase: "observing",
        attemptGeneration: request.expectedAttemptGeneration + 1,
        receipt: baseReceipt,
      };
      this.#updateStoredAction(envelope.preview.previewId, envelope.preview, pending);
      result = statusFromAction(pending, envelope.preview.intentDigest);
    }
    this.#database.transaction(() => {
      this.#insertCommand(
        context,
        request.command,
        request.projectId,
        actionSessionId(authenticated, envelope.preview.intent),
        "takeover",
        payloadHash,
        currentStatus,
        result,
        result,
        "committed",
      );
    })();
    return result;
  }

  async #reconcileChairLiveHandoff(
    context: AuthenticatedOperatorContext,
    request: OperatorActionReconcileRequest,
    stored: Row,
    envelope: StoredPreviewEnvelope,
  ): Promise<OperatorActionStatus> {
    const custody = this.#chairLiveHandoffCustody;
    if (custody === undefined || envelope.action === null || envelope.preview.intent.kind !== "chair-live-handoff") {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "chair live handoff custody runtime is unavailable");
    }
    const authenticated = this.#authenticateCommand(context, request.command, request.projectId, envelope.preview.intent);
    this.#assertStoredPreviewScope(stored, authenticated, request.projectId, envelope.preview.intent);
    const payloadHash = sha256(canonicalJson(sanitisedReconcileRequest(request)));
    const replay = this.#reconcileReplay(context.operatorId, request.command.commandId, payloadHash);
    if (replay !== null) return replay;
    if (request.command.commandId === request.targetCommandId) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "reconciliation requires a distinct command ID");
    }
    const currentStatus = this.#chairLiveHandoffStatus(context.operatorId, request.targetCommandId, envelope);
    if (
      currentStatus.status !== request.expectedStatus ||
      (currentStatus.status === "pending" || currentStatus.status === "ambiguous") &&
        currentStatus.attemptGeneration !== request.expectedAttemptGeneration
    ) throw new ProjectFabricCoreError("STALE_REVISION", "chair live handoff reconciliation target changed");
    const observed = await custody.reconcileChairLiveHandoff(context.operatorId, request.targetCommandId);
    const baseReceipt = parseStoredReceipt(envelope.action);
    let result: OperatorActionStatus;
    if (observed.status === "committed") {
      const receipt: OperatorActionReceipt = {
        ...baseReceipt,
        afterStateDigest: digestValue(observed, "operatorChairLiveHandoffReconcile.afterStateDigest"),
      };
      this.#updateStoredAction(envelope.preview.previewId, envelope.preview, {
        status: "terminal",
        commandId: request.targetCommandId,
        receipt,
      });
      this.#database.prepare(`
        UPDATE operator_commands SET result_json=?, after_json=?
         WHERE operator_id=? AND command_id=?
      `).run(canonicalJson(receipt), canonicalJson(observed), context.operatorId, request.targetCommandId);
      result = { status: "committed", commandId: request.targetCommandId, receipt };
    } else if (observed.status === "no-effect") {
      result = {
        status: "rejected",
        commandId: request.targetCommandId,
        intentDigest: envelope.preview.intentDigest,
        code: "state-changed",
        evidenceRefs: [],
      };
    } else {
      const pending: StoredPendingAction = {
        status: "pending",
        commandId: request.targetCommandId,
        phase: "observing",
        attemptGeneration: request.expectedAttemptGeneration + 1,
        receipt: baseReceipt,
      };
      this.#updateStoredAction(envelope.preview.previewId, envelope.preview, pending);
      result = statusFromAction(pending, envelope.preview.intentDigest);
    }
    this.#database.transaction(() => {
      this.#insertCommand(
        context,
        request.command,
        request.projectId,
        actionSessionId(authenticated, envelope.preview.intent),
        "takeover",
        payloadHash,
        currentStatus,
        result,
        result,
        "committed",
      );
    })();
    return result;
  }

  async #readCurrentState(intent: OperatorActionIntent): Promise<OperatorActionCurrentState> {
    if (intent.kind === "agent-lifecycle-recovery") {
      if (this.#lifecycleRecoveryCustody === undefined) {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "lifecycle recovery custody runtime is unavailable");
      }
      const state = await this.#lifecycleRecoveryCustody.readLifecycleRecoveryCurrentState(intent);
      return { kind: "agent-lifecycle-recovery", revision: state.revision, state };
    }
    if (intent.kind === "chair-bridge-recovery") {
      if (this.#chairRecoveryCustody === undefined) {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "chair recovery custody runtime is unavailable");
      }
      const state = await this.#chairRecoveryCustody.readChairRecoveryCurrentState(intent);
      return { kind: "chair-bridge-recovery", revision: state.revision, state };
    }
    if (intent.kind === "chair-live-handoff") {
      if (this.#chairLiveHandoffCustody === undefined) {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "chair live handoff custody runtime is unavailable");
      }
      const state = await this.#chairLiveHandoffCustody.readChairLiveHandoffCurrentState(intent);
      return { kind: "chair-live-handoff", revision: state.revision, state };
    }
    if (intent.kind !== "project-session-launch") return await this.#statePort.read(intent);
    if (this.#launchCustody === undefined) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "launch custody runtime is unavailable");
    }
    const state = await this.#launchCustody.readCurrentState(intent);
    return { kind: "project-session-launch", revision: state.sessionRevision, state };
  }

  #authenticateCommand(
    context: AuthenticatedOperatorContext,
    command: OperatorActionPreviewRequest["command"],
    projectId: OperatorActionPreviewRequest["projectId"],
    intent: OperatorActionIntent,
    requiredActionOverride?: "git-custody-resolve",
  ): AuthenticatedOperatorCredential {
    const authenticated = this.#operatorStore.authenticateCredential(command.credential.token);
    if (
      authenticated.capabilityId !== command.credential.capabilityId ||
      authenticated.context.operatorId !== context.operatorId ||
      authenticated.context.projectId !== context.projectId ||
      authenticated.context.projectId !== projectId ||
      authenticated.context.projectAuthorityGeneration !== context.projectAuthorityGeneration ||
      authenticated.context.principalGeneration !== context.principalGeneration ||
      command.actor !== context.operatorId
    ) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "operator command does not match its authenticated context");
    }
    const requiredAction = requiredActionOverride ?? requiredOperatorActionForIntent(intent);
    if (!authenticated.actions.includes(requiredAction)) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", `operator capability lacks ${requiredAction}`);
    }
    const intentSessionId = sessionIdForIntent(intent);
    if (intent.kind === "project-session-launch") {
      if (
        authenticated.kind !== "session" ||
        authenticated.projectSessionId !== intent.projectSessionId ||
        intent.projectId !== projectId
      ) {
        throw new ProjectFabricCoreError(
          "CAPABILITY_FORBIDDEN",
          "project-session launch requires exact session-bound launch authority",
        );
      }
      if (!isRow(this.#database.prepare(`
        SELECT project_session_id FROM project_sessions WHERE project_session_id=? AND project_id=?
      `).get(intent.projectSessionId, projectId))) {
        throw new ProjectFabricCoreError("WRONG_PROJECT", "project launch session belongs to another project");
      }
    } else if (intent.kind === "agent-lifecycle-recovery") {
      if (
        authenticated.kind !== "session" ||
        authenticated.projectSessionId !== intent.projectSessionId ||
        authenticated.sessionGeneration !== intent.expectedSessionGeneration
      ) {
        throw new ProjectFabricCoreError(
          "CAPABILITY_FORBIDDEN",
          "lifecycle recovery requires exact session-bound operator authority",
        );
      }
    } else if (intent.kind === "chair-bridge-recovery") {
      const binding = row(this.#database.prepare(`
        SELECT kind, handoff_digest, old_chair_generation, expected_run_id,
               expected_run_revision, expected_session_revision, cas_target_revision
          FROM operator_capabilities WHERE capability_id=?
      `).get(authenticated.capabilityId), "chair recovery operator capability");
      if (
        authenticated.kind !== "takeover" ||
        authenticated.projectSessionId !== intent.projectSessionId ||
        authenticated.sessionGeneration !== intent.expectedSessionGeneration ||
        text(binding, "kind") !== "takeover" ||
        text(binding, "handoff_digest") !== intent.recoveryManifestDigest ||
        integer(binding, "old_chair_generation") !== intent.expectedChairGeneration ||
        text(binding, "expected_run_id") !== intent.coordinationRunId ||
        integer(binding, "expected_run_revision") !== intent.expectedRunRevision ||
        integer(binding, "expected_session_revision") !== intent.expectedSessionRevision ||
        integer(binding, "cas_target_revision") !== intent.expectedBridgeRevision
      ) {
        throw new ProjectFabricCoreError(
          "CAPABILITY_FORBIDDEN",
          "chair recovery requires exact loss-manifest takeover authority",
        );
      }
    } else if (intent.kind === "chair-live-handoff") {
      const binding = row(this.#database.prepare(`
        SELECT kind, handoff_digest, old_chair_generation, expected_run_id,
               expected_run_revision, expected_session_revision, cas_target_revision
          FROM operator_capabilities WHERE capability_id=?
      `).get(authenticated.capabilityId), "chair live handoff operator capability");
      if (
        authenticated.kind !== "takeover" ||
        authenticated.projectSessionId !== intent.projectSessionId ||
        authenticated.sessionGeneration !== intent.expectedSessionGeneration ||
        text(binding, "kind") !== "takeover" ||
        text(binding, "handoff_digest") !== intent.handoffRef.digest ||
        integer(binding, "old_chair_generation") !== intent.expectedChairGeneration ||
        text(binding, "expected_run_id") !== intent.coordinationRunId ||
        integer(binding, "expected_run_revision") !== intent.expectedRunRevision ||
        integer(binding, "expected_session_revision") !== intent.expectedSessionRevision ||
        integer(binding, "cas_target_revision") !== intent.expectedBridgeRevision
      ) {
        throw new ProjectFabricCoreError(
          "CAPABILITY_FORBIDDEN",
          "chair live handoff requires exact handoff-bound takeover authority",
        );
      }
    } else if (intentSessionId !== undefined && authenticated.projectSessionId !== intentSessionId) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator capability is bound to another session");
    }
    return authenticated;
  }

  #previewRow(previewId: string): Row {
    return row(this.#database.prepare(`
      SELECT * FROM operator_previews WHERE preview_id=?
    `).get(previewId), "operator action preview");
  }

  #assertStoredPreviewScope(
    stored: Row,
    authenticated: AuthenticatedOperatorCredential,
    projectId: string,
    intent: OperatorActionIntent,
  ): void {
    const storedSessionId = text(stored, "project_session_id");
    if (actionSessionId(authenticated, intent) !== storedSessionId) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator preview belongs to another session");
    }
    if (!isRow(this.#database.prepare(`
      SELECT project_session_id FROM project_sessions WHERE project_session_id=? AND project_id=?
    `).get(storedSessionId, projectId))) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "operator preview belongs to another project");
    }
  }

  #assertPreviewClaim(stored: Row, commandId: string): void {
    const confirmedCommandId = nullableText(stored, "confirmed_command_id");
    if (confirmedCommandId !== null && confirmedCommandId !== commandId) {
      throw new ProjectFabricCoreError("CONFLICT", "operator preview already has another confirmation command");
    }
  }

  #commandReplay(operatorId: string, commandId: string, payloadHash: string): OperatorActionReceipt | null {
    const existing = this.#database.prepare(`
      SELECT payload_hash, result_json, status FROM operator_commands
       WHERE operator_id=? AND command_id=?
    `).get(operatorId, commandId);
    if (!isRow(existing)) return null;
    if (text(existing, "payload_hash") !== payloadHash) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "operator command ID was reused with changed input");
    }
    if (text(existing, "status") === "rejected") {
      const status = parseRejectedStatus(text(existing, "result_json"), commandId);
      throw new ProjectFabricCoreError(protocolCodeForRejection(status.code), `operator action was rejected: ${status.code}`);
    }
    return parseReceipt(text(existing, "result_json"));
  }

  #reconcileReplay(operatorId: string, commandId: string, payloadHash: string): OperatorActionStatus | null {
    const existing = this.#database.prepare(`
      SELECT payload_hash, result_json FROM operator_commands
       WHERE operator_id=? AND command_id=?
    `).get(operatorId, commandId);
    if (!isRow(existing)) return null;
    if (text(existing, "payload_hash") !== payloadHash) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "reconciliation command ID was reused with changed input");
    }
    return parseOperationResult(FABRIC_OPERATIONS.operatorActionReconcile, JSON.parse(text(existing, "result_json")));
  }

  #insertCommand(
    context: AuthenticatedOperatorContext,
    command: OperatorActionCommitRequest["command"],
    projectId: OperatorActionCommitRequest["projectId"],
    projectSessionId: string,
    operation: string,
    payloadHash: string,
    before: unknown,
    after: unknown,
    result: unknown,
    status: "committed" | "rejected",
  ): void {
    this.#database.prepare(`
      INSERT INTO operator_commands(
        operator_id, command_id, capability_id, project_id, project_session_id,
        operation, expected_revision, payload_hash, provenance_json, before_json,
        after_json, evidence_json, result_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      context.operatorId,
      command.commandId,
      command.credential.capabilityId,
      projectId,
      projectSessionId,
      operation,
      command.expectedRevision,
      payloadHash,
      canonicalJson(command.provenance),
      canonicalJson(before),
      canonicalJson(after),
      canonicalJson(command.evidenceRefs),
      canonicalJson(result),
      status,
      this.#clock(),
    );
  }

  #recordRejected(
    context: AuthenticatedOperatorContext,
    request: OperatorActionCommitRequest,
    stored: Row,
    envelope: StoredPreviewEnvelope,
    payloadHash: string,
    code: OperatorActionRejectionCode,
  ): void {
    const rejected: StoredRejectedAction = {
      status: "rejected",
      commandId: request.command.commandId,
      code,
      evidenceRefs: envelope.preview.evidenceRefs,
    };
    const transaction = this.#database.transaction((): void => {
      this.#commandReplay(context.operatorId, request.command.commandId, payloadHash);
      const latest = this.#previewRow(request.previewId);
      this.#assertPreviewClaim(latest, request.command.commandId);
      this.#database.prepare(`
        UPDATE operator_previews SET preview_json=?, confirmed_command_id=? WHERE preview_id=?
      `).run(
        canonicalJson({ preview: envelope.preview, action: rejected }),
        request.command.commandId,
        request.previewId,
      );
      this.#insertCommand(
        context,
        request.command,
        request.projectId,
        text(stored, "project_session_id"),
        text(stored, "operation"),
        payloadHash,
        { beforeStateDigest: envelope.preview.beforeStateDigest },
        rejected,
        {
          status: "rejected",
          commandId: request.command.commandId,
          intentDigest: envelope.preview.intentDigest,
          code,
          evidenceRefs: envelope.preview.evidenceRefs,
        },
        "rejected",
      );
    });
    transaction();
  }

  #applyEffectOutcome(
    operatorId: string,
    commandId: string,
    preview: OperatorActionPreview,
    priorReceipt: OperatorActionReceipt,
    outcome: OperatorEffectOutcome,
    attemptGeneration: number,
  ): OperatorActionReceipt {
    if (outcome.status === "rejected") {
      const rejected: StoredRejectedAction = {
        status: "rejected",
        commandId,
        code: outcome.code,
        evidenceRefs: outcome.evidenceRefs,
      };
      const transaction = this.#database.transaction((): void => {
        this.#updateStoredAction(preview.previewId, preview, rejected);
        this.#database.prepare(`
          UPDATE operator_commands SET status='rejected', result_json=?, after_json=?
           WHERE operator_id=? AND command_id=?
        `).run(
          canonicalJson({
            status: "rejected",
            commandId,
            intentDigest: preview.intentDigest,
            code: outcome.code,
            evidenceRefs: outcome.evidenceRefs,
          }),
          canonicalJson(rejected),
          operatorId,
          commandId,
        );
      });
      transaction();
      throw new ProjectFabricCoreError(protocolCodeForRejection(outcome.code), `operator effect rejected: ${outcome.code}`);
    }
    if (outcome.status === "pending") {
      const pending: StoredPendingAction = {
        status: "pending",
        commandId,
        phase: outcome.phase,
        attemptGeneration,
        receipt: priorReceipt,
      };
      this.#updateStoredAction(preview.previewId, preview, pending);
      return priorReceipt;
    }
    if (outcome.status === "ambiguous") {
      const ambiguous: StoredAmbiguousAction = {
        status: "ambiguous",
        commandId,
        attemptGeneration,
        effectRef: outcome.effectRef,
        receipt: priorReceipt,
      };
      this.#updateStoredAction(preview.previewId, preview, ambiguous);
      return priorReceipt;
    }
    const receipt: OperatorActionReceipt = {
      ...priorReceipt,
      afterStateDigest: digestValue(outcome.afterState, "operatorActionCommit.afterStateDigest"),
      ...(outcome.effectRef === undefined ? {} : { effectRef: outcome.effectRef }),
    };
    const terminal: StoredTerminalAction = { status: "terminal", commandId, receipt };
    const transaction = this.#database.transaction((): void => {
      this.#updateStoredAction(preview.previewId, preview, terminal);
      this.#database.prepare(`
        UPDATE operator_commands SET result_json=?, after_json=?
         WHERE operator_id=? AND command_id=? AND status='committed'
      `).run(canonicalJson(receipt), canonicalJson(outcome.afterState), operatorId, commandId);
    });
    transaction();
    return receipt;
  }

  #updateStoredAction(previewId: string, preview: OperatorActionPreview, action: StoredAction): void {
    this.#database.prepare(`
      UPDATE operator_previews SET preview_json=? WHERE preview_id=?
    `).run(canonicalJson({ preview, action }), previewId);
  }

  #updateReconcileCommand(operatorId: string, commandId: string, result: OperatorActionStatus): void {
    this.#database.prepare(`
      UPDATE operator_commands SET result_json=?, after_json=?
       WHERE operator_id=? AND command_id=?
    `).run(canonicalJson(result), canonicalJson(result), operatorId, commandId);
  }
}

type StoredPendingAction = {
  status: "pending";
  commandId: string;
  phase: "prepared" | "dispatched" | "accepted" | "observing";
  attemptGeneration: number;
  receipt: OperatorActionReceipt;
};

type StoredAmbiguousAction = {
  status: "ambiguous";
  commandId: string;
  attemptGeneration: number;
  effectRef: ArtifactRef;
  receipt: OperatorActionReceipt;
};

type StoredTerminalAction = {
  status: "terminal";
  commandId: string;
  receipt: OperatorActionReceipt;
};

type StoredRejectedAction = {
  status: "rejected";
  commandId: string;
  code: OperatorActionRejectionCode;
  evidenceRefs: readonly ArtifactRef[];
};

type StoredAction = StoredPendingAction | StoredAmbiguousAction | StoredTerminalAction | StoredRejectedAction;
type StoredPreviewEnvelope = { preview: OperatorActionPreview; action: StoredAction | null };

function parseStoredPreview(serialized: string): StoredPreviewEnvelope {
  const value: unknown = JSON.parse(serialized);
  const envelope = row(value, "stored operator preview");
  const preview = parseOperationResult(FABRIC_OPERATIONS.operatorActionPreview, envelope.preview);
  return { preview, action: envelope.action === null ? null : parseStoredAction(envelope.action) };
}

function parseStoredAction(value: unknown): StoredAction {
  const action = row(value, "stored operator action");
  const status = text(action, "status");
  const commandId = text(action, "commandId");
  if (status === "terminal") return { status, commandId, receipt: parseStoredReceipt(action) };
  if (status === "pending") {
    const phase = text(action, "phase");
    if (phase !== "prepared" && phase !== "dispatched" && phase !== "accepted" && phase !== "observing") {
      throw new Error("stored operator action phase is invalid");
    }
    return {
      status,
      commandId,
      phase,
      attemptGeneration: integer(action, "attemptGeneration"),
      receipt: parseStoredReceipt(action),
    };
  }
  if (status === "ambiguous") {
    return {
      status,
      commandId,
      attemptGeneration: integer(action, "attemptGeneration"),
      effectRef: parseArtifactRef(action.effectRef, "storedOperatorAction.effectRef"),
      receipt: parseStoredReceipt(action),
    };
  }
  if (status === "rejected") {
    const code = rejectionCode(action.code);
    const evidence = action.evidenceRefs;
    if (!Array.isArray(evidence)) throw new Error("stored rejected action evidence is invalid");
    return {
      status,
      commandId,
      code,
      evidenceRefs: evidence.map((item, index) => parseArtifactRef(item, `storedOperatorAction.evidenceRefs[${String(index)}]`)),
    };
  }
  throw new Error("stored operator action status is invalid");
}

function parseStoredReceipt(action: Row): OperatorActionReceipt {
  return parseOperationResult(FABRIC_OPERATIONS.operatorActionCommit, action.receipt);
}

function parseReceipt(serialized: string): OperatorActionReceipt {
  return parseOperationResult(FABRIC_OPERATIONS.operatorActionCommit, JSON.parse(serialized));
}

function statusFromAction(action: StoredAction, intentDigest: Sha256Digest): OperatorActionStatus {
  if (action.status === "terminal") return { status: "committed", commandId: action.commandId, receipt: action.receipt };
  if (action.status === "pending") {
    return {
      status: "pending",
      commandId: action.commandId,
      intentDigest,
      phase: action.phase,
      attemptGeneration: action.attemptGeneration,
    };
  }
  if (action.status === "ambiguous") {
    return {
      status: "ambiguous",
      commandId: action.commandId,
      intentDigest,
      attemptGeneration: action.attemptGeneration,
      effectRef: action.effectRef,
    };
  }
  return {
    status: "rejected",
    commandId: action.commandId,
    intentDigest,
    code: action.code,
    evidenceRefs: action.evidenceRefs,
  };
}

function lifecycleRecoveryStatusResult(
  observed: OperatorLifecycleRecoveryCommit,
  commandId: string,
  envelope: StoredPreviewEnvelope,
  attemptGeneration?: number,
): OperatorActionStatus {
  if (envelope.action === null) throw new Error("lifecycle recovery preview has no action state");
  if (observed.status === "committed") {
    const receipt: OperatorActionReceipt = {
      ...parseStoredReceipt(envelope.action),
      afterStateDigest: digestValue(observed, "operatorLifecycleRecoveryStatus.afterStateDigest"),
    };
    return { status: "committed", commandId, receipt };
  }
  if (observed.status === "no-effect") {
    return {
      status: "rejected",
      commandId,
      intentDigest: envelope.preview.intentDigest,
      code: "state-changed",
      evidenceRefs: [],
    };
  }
  const generation = attemptGeneration ?? (
    envelope.action.status === "pending" || envelope.action.status === "ambiguous"
      ? envelope.action.attemptGeneration
      : 1
  );
  return {
    status: "pending",
    commandId,
    intentDigest: envelope.preview.intentDigest,
    phase: observed.status === "ambiguous" ? "observing" : "prepared",
    attemptGeneration: generation,
  };
}

function parseRejectedStatus(serialized: string, commandId: string): Extract<OperatorActionStatus, { status: "rejected" }> {
  const value: unknown = JSON.parse(serialized);
  const stored = row(value, "stored rejected operator action");
  if (text(stored, "status") !== "rejected" || text(stored, "commandId") !== commandId) {
    throw new Error("stored rejected operator action identity is invalid");
  }
  const evidence = stored.evidenceRefs;
  if (!Array.isArray(evidence)) throw new Error("stored rejected operator action evidence is invalid");
  return {
    status: "rejected",
    commandId,
    intentDigest: parseSha256Digest(stored.intentDigest, "storedRejectedAction.intentDigest"),
    code: rejectionCode(stored.code),
    evidenceRefs: evidence.map((item, index) => parseArtifactRef(item, `storedRejectedAction.evidenceRefs[${String(index)}]`)),
  };
}

function validateCurrentState(
  intent: OperatorActionIntent,
  commandExpectedRevision: number,
  current: OperatorActionCurrentState,
): void {
  if (current.revision !== commandExpectedRevision) {
    throw new ProjectFabricCoreError("STALE_REVISION", "operator command revision changed", {
      expected: commandExpectedRevision,
      actual: current.revision,
    });
  }
  if (intent.kind === "project-session-launch") {
    if (current.kind !== "project-session-launch") {
      throw new TypeError("project-session launch intent received another current-state family");
    }
    const launch = current.state;
    if (
      launch.projectId !== intent.projectId ||
      launch.projectRevision !== intent.expectedProjectRevision ||
      launch.projectSessionId !== intent.projectSessionId ||
      launch.sessionRevision !== intent.expectedSessionRevision ||
      launch.sessionRevision !== current.revision ||
      launch.sessionGeneration !== intent.expectedSessionGeneration ||
      launch.trustRecordDigest !== intent.trustRecordDigest ||
      launch.providerAdapterId !== intent.providerAdapterId ||
      launch.providerContractDigest !== intent.providerContractDigest ||
      launch.resourceStateDigest !== intent.resourceStateDigest
    ) {
      throw new ProjectFabricCoreError("STALE_REVISION", "project-session launch custody binding changed");
    }
    if (launch.sessionState === "awaiting_launch") {
      if (intent.retryOf !== undefined || launch.provedFailedAttempt !== null || !sameArtifact(intent.launchPacketRef, launch.currentLaunchPacketRef)) {
        throw new ProjectFabricCoreError("STALE_REVISION", "initial launch packet or retry binding changed");
      }
      return;
    }
    if (
      intent.retryOf === undefined ||
      launch.provedFailedAttempt === null ||
      intent.retryOf.providerAdapterId !== launch.provedFailedAttempt.providerAdapterId ||
      intent.retryOf.providerActionId !== launch.provedFailedAttempt.providerActionId
    ) {
      throw new ProjectFabricCoreError(
        "STALE_REVISION",
        "proved launch failure or retry identity changed",
      );
    }
    return;
  }
  if (intent.kind === "control") {
    if (current.kind !== "control") throw new TypeError("control intent received another current-state family");
    if (intent.target.expectedRevision !== current.revision) {
      throw new ProjectFabricCoreError("STALE_REVISION", "operator control target revision changed");
    }
    if (!current.eligibleActions.includes(intent.action)) {
      throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "operator control action is not eligible now");
    }
    return;
  }
  if (intent.kind === "project-session-drain" || intent.kind === "project-session-stop") {
    if (current.kind !== "project-session-lifecycle") {
      throw new TypeError("project-session lifecycle intent received another current-state family");
    }
    if (
      intent.expectedSessionRevision !== current.revision ||
      intent.expectedSessionGeneration !== current.sessionGeneration ||
      intent.expectedGlobalStateRevision !== current.globalStateRevision
    ) {
      throw new ProjectFabricCoreError("STALE_GENERATION", "project-session lifecycle binding changed");
    }
    if (intent.kind === "project-session-stop" && !sameArtifact(intent.drainReceiptRef, current.drainReceiptRef)) {
      throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "project-session stop drain receipt changed");
    }
    return;
  }
  if (intent.kind === "daemon-drain" || intent.kind === "daemon-stop") {
    if (current.kind !== "daemon-lifecycle") {
      throw new TypeError("daemon lifecycle intent received another current-state family");
    }
    if (
      intent.expectedDaemonGeneration !== current.daemonGeneration ||
      intent.expectedGlobalStateRevision !== current.globalStateRevision ||
      intent.expectedGlobalStateRevision !== current.revision
    ) {
      throw new ProjectFabricCoreError("STALE_GENERATION", "daemon lifecycle binding changed");
    }
    if (intent.kind === "daemon-stop" && !sameArtifact(intent.drainReceiptRef, current.drainReceiptRef)) {
      throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "daemon stop drain receipt changed");
    }
    return;
  }
  if (intent.kind === "git") {
    if (current.kind !== "git") throw new TypeError("Git intent received another current-state family");
    try {
      assertGitIntentState(intent, current.state);
    } catch (error: unknown) {
      throw new ProjectFabricCoreError("STALE_REVISION", "operator Git state changed", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }
  if (
    intent.kind === "git-authorise" ||
    intent.kind === "git-operation-draft" ||
    intent.kind === "git-custody-resolve"
  ) {
    if (current.kind !== "git-administration") {
      throw new TypeError("Git administration intent received another current-state family");
    }
    return;
  }
  if (intent.kind === "registered-external-effect") {
    if (current.kind !== "registered-external-effect") {
      throw new TypeError("external-effect intent received another current-state family");
    }
    try {
      assertRegisteredExternalEffectContract(intent, current.state);
    } catch (error: unknown) {
      throw new ProjectFabricCoreError("STALE_REVISION", "registered external-effect state changed", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }
  if (intent.kind === "chair-bridge-recovery") {
    if (current.kind !== "chair-bridge-recovery") {
      throw new TypeError("chair bridge recovery intent received another current-state family");
    }
    if (intent.expectedBridgeRevision !== current.revision) {
      throw new ProjectFabricCoreError("STALE_REVISION", "chair bridge recovery target revision changed");
    }
    return;
  }
  if (intent.kind === "chair-live-handoff") {
    if (current.kind !== "chair-live-handoff") {
      throw new TypeError("chair live handoff intent received another current-state family");
    }
    if (intent.expectedBridgeRevision !== current.revision) {
      throw new ProjectFabricCoreError("STALE_REVISION", "chair live handoff bridge revision changed");
    }
    return;
  }
  if (intent.kind === "agent-lifecycle-recovery") {
    if (current.kind !== "agent-lifecycle-recovery") {
      throw new TypeError("lifecycle recovery intent received another current-state family");
    }
    const state = current.state;
    if (
      state.revision !== intent.expectedAgentRevision ||
      state.projectSessionId !== intent.projectSessionId ||
      state.coordinationRunId !== intent.coordinationRunId ||
      state.agentId !== intent.agentId ||
      state.sessionRevision !== intent.expectedSessionRevision ||
      state.sessionGeneration !== intent.expectedSessionGeneration ||
      state.runRevision !== intent.expectedRunRevision ||
      state.agentRevision !== intent.expectedAgentRevision ||
      canonicalJson(state.source) !== canonicalJson(intent.source) ||
      state.sourceRevision !== intent.expectedSourceRevision ||
      state.principalGeneration !== intent.expectedPrincipalGeneration ||
      state.providerGeneration !== intent.expectedProviderGeneration ||
      state.bridgeGeneration !== intent.expectedBridgeGeneration ||
      state.contextRevision !== intent.expectedContextRevision ||
      state.bridgeOwnerKind !== intent.bridgeOwnerKind ||
      state.chairLeaseGeneration !== intent.expectedChairLeaseGeneration
    ) {
      throw new ProjectFabricCoreError("STALE_GENERATION", "lifecycle recovery source binding changed");
    }
    if (
      state.gate.gateId !== intent.gateId ||
      state.gate.revision !== intent.expectedGateRevision ||
      state.gate.status !== intent.expectedGateStatus
    ) {
      throw new ProjectFabricCoreError("GATE_BLOCKED", "lifecycle recovery gate binding changed");
    }
    if (intent.path === "fresh-rotate") {
      if (
        state.recoveryCapability === null ||
        state.recoveryCapability.capabilityId !== intent.recoveryCapabilityId ||
        state.recoveryCapability.revision !== intent.expectedRecoveryCapabilityRevision ||
        state.recoveryCapability.capabilityHash !== intent.recoveryCapabilityHash ||
        state.checkpoint === null ||
        canonicalJson(state.checkpoint.ref) !== canonicalJson(intent.checkpointRef) ||
        state.checkpoint.digest !== intent.checkpointDigest ||
        state.checkpoint.validationReceiptDigest !== intent.checkpointValidationReceiptDigest
      ) {
        throw new ProjectFabricCoreError("STALE_REVISION", "lifecycle recovery capability or checkpoint changed");
      }
    }
    return;
  }
  if (intent.kind === "provider-route-integrity-retire") {
    throw new ProjectFabricCoreError(
      "CAPABILITY_FORBIDDEN",
      `${intent.kind} current-state validation is unavailable until its daemon custody owner is composed`,
    );
  }
  if (current.kind !== "promotion") throw new TypeError("promotion intent received another current-state family");
  try {
    assertPromotionIntentGate(intent, current.gate);
  } catch (error: unknown) {
    throw new ProjectFabricCoreError("GATE_BLOCKED", "promotion release binding is not current", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function sanitisedPreviewRequest(request: OperatorActionPreviewRequest): unknown {
  return {
    command: sanitisedCommand(request.command),
    projectId: request.projectId,
    intent: request.intent,
  };
}

function sanitisedCommitRequest(request: OperatorActionCommitRequest): unknown {
  return {
    command: sanitisedCommand(request.command),
    projectId: request.projectId,
    previewId: request.previewId,
    expectedPreviewRevision: request.expectedPreviewRevision,
    previewDigest: request.previewDigest,
    expectedIntentDigest: request.expectedIntentDigest,
    confirmation: request.confirmation,
  };
}

function sanitisedReconcileRequest(request: OperatorActionReconcileRequest): unknown {
  return {
    command: sanitisedCommand(request.command),
    projectId: request.projectId,
    targetCommandId: request.targetCommandId,
    expectedStatus: request.expectedStatus,
    expectedAttemptGeneration: request.expectedAttemptGeneration,
    mode: request.mode,
    ...(request.gitConflict === undefined ? {} : { gitConflict: request.gitConflict }),
  };
}

function sanitisedCommand(command: OperatorActionPreviewRequest["command"]): unknown {
  return {
    credential: { capabilityId: command.credential.capabilityId },
    commandId: command.commandId,
    expectedRevision: command.expectedRevision,
    actor: command.actor,
    provenance: command.provenance,
    evidenceRefs: command.evidenceRefs,
  };
}

function assertCommitMatchesPreview(
  request: OperatorActionCommitRequest,
  preview: OperatorActionPreview,
  storedRevision: number,
  nowMilliseconds: number,
): void {
  if (request.expectedPreviewRevision !== storedRevision || request.expectedPreviewRevision !== preview.previewRevision) {
    throw new ProjectFabricCoreError("STALE_REVISION", "operator action preview revision is stale");
  }
  if (request.previewDigest !== preview.previewDigest || request.expectedIntentDigest !== preview.intentDigest) {
    throw new ProjectFabricCoreError("STALE_REVISION", "operator action preview digest is stale");
  }
  if (Date.parse(preview.expiresAt) <= nowMilliseconds) {
    throw new ProjectFabricCoreError("CAPABILITY_EXPIRED", "operator action preview expired");
  }
  if (preview.confirmationMode === "explicit" && request.confirmation.kind !== "explicit") {
    throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator action requires explicit confirmation");
  }
  if (
    request.confirmation.kind === "echo" &&
    request.confirmation.echoedPreviewDigest !== preview.previewDigest
  ) {
    throw new ProjectFabricCoreError("STALE_REVISION", "operator action confirmation digest is stale");
  }
}

function consequenceClass(intent: OperatorActionIntent): OperatorActionPreview["consequenceClass"] {
  if (intent.kind === "promotion") return "promotion";
  if (intent.kind === "registered-external-effect") return "external";
  if (
    (intent.kind === "chair-bridge-recovery" && intent.path === "abandon") ||
    (intent.kind === "agent-lifecycle-recovery" && intent.path === "abandon") ||
    intent.kind === "project-session-stop" ||
    intent.kind === "daemon-stop" ||
    (intent.kind === "control" && intent.action === "cancel") ||
    intent.kind === "git-custody-resolve" ||
    (intent.kind === "git" && [
      "push-force-with-lease",
      "branch-delete-force",
      "worktree-remove-force",
      "merge-abort",
      "rebase-abort",
    ].includes(intent.operation.variant))
  ) return "destructive";
  if (intent.kind === "control" && (intent.action === "pause" || intent.action === "resume" || intent.action === "steer")) {
    return "routine";
  }
  return "consequential";
}

function combinedEvidence(request: OperatorActionPreviewRequest): ArtifactRef[] {
  const evidence = [...request.command.evidenceRefs];
  if (request.intent.kind === "project-session-launch") {
    evidence.push(request.intent.launchPacketRef, request.intent.resourcePlanRef);
  } else if (request.intent.kind === "chair-live-handoff") {
    evidence.push(request.intent.handoffRef);
  } else if (request.intent.kind === "control" && request.intent.action === "steer") {
    evidence.push(...request.intent.evidenceRefs);
  } else if (request.intent.kind === "registered-external-effect") {
    evidence.push(request.intent.requestArtifactRef);
  } else if (request.intent.kind === "promotion") {
    evidence.push(request.intent.releaseBinding.acceptedDeliveryReceiptRef);
  } else if (request.intent.kind === "project-session-stop" || request.intent.kind === "daemon-stop") {
    evidence.push(request.intent.drainReceiptRef);
  }
  const unique = new Map<string, ArtifactRef>();
  for (const item of evidence) unique.set(`${item.path}:${item.digest}`, item);
  return [...unique.values()];
}

function sessionIdForIntent(intent: OperatorActionIntent): string | undefined {
  if (intent.kind === "project-session-launch") return intent.projectSessionId;
  if (intent.kind === "agent-lifecycle-recovery") return intent.projectSessionId;
  if (intent.kind === "chair-bridge-recovery") return intent.projectSessionId;
  if (intent.kind === "chair-live-handoff") return intent.projectSessionId;
  if (intent.kind === "control") return intent.target.projectSessionId;
  if (intent.kind === "project-session-drain" || intent.kind === "project-session-stop" || intent.kind === "promotion") {
    return intent.projectSessionId;
  }
  if (intent.kind === "git") return intent.authorisation.projectSessionId;
  if (intent.kind === "git-authorise" || intent.kind === "git-custody-resolve") return intent.projectSessionId;
  if (intent.kind === "git-operation-draft") {
    return intent.action === "cancel"
      ? intent.projectSessionId
      : intent.binding.kind === "mutation"
        ? intent.binding.authorisation.projectSessionId
        : intent.binding.projectSessionId;
  }
  return undefined;
}

function actionSessionId(authenticated: AuthenticatedOperatorCredential, intent: OperatorActionIntent): string {
  if (intent.kind === "project-session-launch") return intent.projectSessionId;
  if (intent.kind === "agent-lifecycle-recovery") return intent.projectSessionId;
  if (intent.kind === "chair-bridge-recovery") return intent.projectSessionId;
  if (intent.kind === "chair-live-handoff") return intent.projectSessionId;
  return requiredSession(authenticated);
}

function requiredSession(authenticated: AuthenticatedOperatorCredential): string {
  if (authenticated.projectSessionId === undefined) {
    throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "operator action requires a session-bound capability");
  }
  return authenticated.projectSessionId;
}

function digestValue(value: unknown, path: string): Sha256Digest {
  return parseSha256Digest(`sha256:${sha256(canonicalJson(value))}`, path);
}

function toTimestamp(milliseconds: number, path: string): Timestamp {
  return parseTimestamp(new Date(milliseconds).toISOString(), path);
}

function sameArtifact(left: ArtifactRef, right: ArtifactRef | null): boolean {
  return right !== null && left.path === right.path && left.digest === right.digest;
}

function rejectionCode(value: unknown): OperatorActionRejectionCode {
  if (
    value === "authority-insufficient" ||
    value === "preview-expired" ||
    value === "preview-stale" ||
    value === "state-changed" ||
    value === "generation-stale" ||
    value === "git-state-changed" ||
    value === "external-contract-unknown" ||
    value === "external-contract-stale" ||
    value === "release-binding-mismatch" ||
    value === "dedupe-conflict"
  ) return value;
  throw new Error("stored operator action rejection code is invalid");
}

function protocolCodeForRejection(code: OperatorActionRejectionCode): ConstructorParameters<typeof ProjectFabricCoreError>[0] {
  if (code === "authority-insufficient") return "CAPABILITY_FORBIDDEN";
  if (code === "preview-expired") return "CAPABILITY_EXPIRED";
  if (code === "release-binding-mismatch") return "GATE_BLOCKED";
  if (code === "dedupe-conflict") return "DEDUPE_CONFLICT";
  return "STALE_REVISION";
}

function rejectionForIntent(intent: OperatorActionIntent): OperatorActionRejectionCode {
  if (intent.kind === "git") return "git-state-changed";
  if (intent.kind === "registered-external-effect") return "external-contract-stale";
  if (intent.kind === "promotion") return "release-binding-mismatch";
  if (
    intent.kind === "project-session-launch" ||
    intent.kind === "agent-lifecycle-recovery" ||
    intent.kind === "chair-bridge-recovery" ||
    intent.kind === "chair-live-handoff" ||
    intent.kind === "project-session-drain" ||
    intent.kind === "project-session-stop" ||
    intent.kind === "daemon-drain" ||
    intent.kind === "daemon-stop"
  ) return "generation-stale";
  return "state-changed";
}

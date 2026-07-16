import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, posix, relative, resolve, sep } from "node:path";

import type Database from "better-sqlite3";
import { v7 as uuidv7 } from "uuid";
import {
  GATE_SYSTEM_SUPERSESSION_FEATURE,
  LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC,
  LIFECYCLE_CURRENT_STATE_V1_CODEC,
  DECLARED_RUN_PROGRESS_FEATURE,
  NATIVE_NOTIFICATION_PROJECTION_FEATURE,
  RUN_SESSION_PROJECTION_FEATURE,
  authorityEnvelopeV2Contained,
  parseAuthorityEnvelopeV2,
  type AgentCustodyResult,
  type EvidenceArtifactRegistration,
  type EvidencePublishRequest,
  type GateOperationTarget,
  type HerdrSteerDispatchResult,
  type LifecycleAcceptedSuspendedV1,
  type LifecycleCustodyRowV1,
  type LifecycleCurrentStateV1,
  type LifecycleGenerationLossRowV1,
  type OperationInputMap,
  type ProtocolOperation,
  type VerifiedProtocolCredential,
} from "@local/agent-fabric-protocol";
import { parseEvidenceArtifactRegistration } from "@local/agent-fabric-protocol";

import {
  parseAgentProvisionProviderResult,
  type AgentProvisionProviderResult,
} from "../adapters/providers/types.js";
import { compileProviderPayload } from "../authority/authority-compiler.js";
import { readStoredAuthority } from "../authority/stored-authority.js";

import type {
  AuthorityInput,
  DisclosurePolicy,
  DisclosureTarget,
  FabricOpenOptions,
  MessageInput,
  RecoveryEvidence,
} from "../domain/types.js";
import { MESSAGE_POLICY } from "../domain/types.js";
import { isBudgetUnitKey } from "../domain/unit-keys.js";
import {
  FABRIC_OPERATIONS,
  OPERATION_REGISTRY,
  expandAuthorityActions,
  isReadFabricOperation,
  type FabricOperation,
} from "../domain/operations.js";
import { CommandJournal } from "../application/command-journal.js";
import {
  ProviderActionAdmissionCoordinator,
  ProviderActionAdmissionTransactionError,
  type ProviderActionTicket,
} from "../application/provider-action-admission.js";
import { ProviderSessionCoordinator } from "../application/provider-session-coordinator.js";
import { FabricError } from "../errors.js";
import { AdapterSupervisor } from "../adapters/supervisor.js";
import {
  parseAgentBridgeCapability,
  parseChairLaunchProviderResult,
  ProviderAdapterError,
  type AgentBridgeCapability,
} from "../adapters/providers/types.js";
import { assessAdapterModelPolicy } from "../adapters/model-selection.js";
import { projectFabricReceipt } from "../exports/projector.js";
import { assertFabricReceiptSchema } from "../exports/schema.js";
import { openFabricDatabase } from "../persistence/sqlite.js";
import { renderSafePreview } from "../visibility/safe-preview.js";
import {
  OperatorStore,
  type AuthenticatedOperatorCredential,
  type LocalOperatorConsoleCapabilityInput,
  type LocalOperatorConsoleCapabilityResult,
  type LocalOperatorConsoleSessionCapabilityResult,
  type LocalOperatorPrincipalRotationInput,
  type LocalOperatorPrincipalRotationResult,
  type LocalOperatorProvisioningInput,
  type LocalOperatorProvisioningResult,
  type LocalOperatorSessionCapabilityInput,
  type LocalOperatorSessionCapabilityResult,
} from "../operator/store.js";
import { OperatorProjectionStore } from "../operator/projection-store.js";
import {
  GitRepositoryReadService,
  type GitHostedChecksPort,
} from "../operator/git-repository-read.js";
import { HERDR_CONTROL_ADAPTER_ID } from "../integrations/herdr-fabric-ports.js";
import {
  HerdrDaemonIntegration,
  type HerdrDaemonActionRequest,
  type HerdrDaemonActionResult,
  type HerdrDaemonIntegrationConfiguration,
  type HerdrDirectSteerRequest,
  type HerdrDirectSteerResult,
} from "../integrations/herdr-daemon-integration.js";
import { ArtifactContentReadService } from "../operator/artifact-content-read.js";
import {
  ExternalEffectService,
  type ExternalEffectEvidencePort,
  type RegisteredEffectPort,
} from "../operator/external-effect-service.js";
import { FixedGitMutationPort, type GitMutationPort } from "../operator/fixed-git-mutation-port.js";
import { TypedGitService, type GitConflictInspectorPort } from "../operator/typed-git-service.js";
import {
  TrustedGitRegistry,
  type TrustedGitConfiguration,
  type TrustedRunGitAllowlist,
} from "../operator/trusted-git-registry.js";
import {
  OperatorActionStore,
  type OperatorActionEffectPort,
  type OperatorActionStatePort,
} from "../operator/action-store.js";
import {
  assertRunAcceptingWork,
  assertTaskOperationAdmitted,
  createProductionOperatorActionPorts,
  resolveTaskBindingForActiveWork,
  type ProductionDaemonStopPort,
} from "../operator/production-action-ports.js";
import { operatorOperationsForActions } from "../daemon/protocol-credentials.js";
import type { PublicProtocolContext } from "../daemon/public-protocol.js";
import {
  attemptDrainedStop as attemptRuntimeDrainedStop,
  attemptIdleStop as attemptRuntimeIdleStop,
  markDaemonRuntimeRunning as markRuntimeEpochRunning,
  recoverDaemonRuntimeEpoch as recoverRuntimeEpoch,
  type IdleElectionPort,
  type IdleStopResult,
  type QuiesceToken,
} from "../daemon/global-liveness.js";
import { dispatchAgentProtocol } from "../daemon/agent-protocol-dispatch.js";
import { ProjectSessionStore } from "../project-session/store.js";
import { ProjectSessionMembershipStore } from "../project-session/membership-store.js";
import { CoordinatedWorkstreamStore } from "../project-session/workstream-store.js";
import {
  LaunchCustodyService,
  parseLaunchAdapterContract,
  type LaunchAdapterContract,
  type AgentBridgeContract,
  type AgentDispatchHandle,
  type LaunchDispatchHandle,
  type ChairRecoveryDispatchHandle,
} from "../project-session/launch-custody.js";
import { IntakeStore } from "../project-session/intake-store.js";
import {
  ProjectFabricCoreError,
  type AuthenticatedAgentContext,
} from "../project-session/contracts.js";
import {
  ScopedGateStore,
  assertScopedBarrierAllowed,
  assertScopedOperationAllowed,
  assertScopedTaskReadinessAllowed,
} from "../gates/store.js";
import { HierarchicalAdmissionStore } from "../resources/store.js";
import {
  AtomicDeliveryStore,
  type ResultDeadlinePassInput,
  type ResultDeadlinePassResult,
} from "../results/store.js";
import { NotificationOutbox } from "../attention/outbox.js";
import { MacOsNativeDesktopAdapter } from "../attention/native-desktop.js";
import {
  NativeNotificationWorker,
  type NotificationWorkerPassResult,
} from "../attention/notification-worker.js";
import { FabricClient } from "./client.js";
import type {
  ArtifactResult,
  AuthorityResult,
  BarrierResult,
  BudgetDimensionResult,
  BudgetResult,
  CapabilityRotationResult,
  CurrentMcpSeatBindingInput,
  CurrentMcpSeatBindingResult,
  DiscussionGroupInput,
  EventsAfterResult,
  InterventionResult,
  LeaseResult,
  LifecycleCheckpoint,
  LifecycleResult,
  ProofResult,
  ProviderActionResult,
  ReceiptResult,
  RevocationResult,
  TaskResult,
  TeamCreateInput,
  TeamResult,
} from "./contracts.js";
import { currentMcpSeatGeneration } from "./mcp-seat-generation.js";
import { FabricReadPolicy } from "./read-policy.js";
import { ArtifactRegistry } from "../artifacts/registry.js";
import { resolveRunArtifactRoot } from "../artifacts/run-root.js";
import {
  LifecycleRotationRepository,
  type LifecycleCustodyHead,
} from "../lifecycle/rotation-repository.js";
import { LifecycleReceiptRepository } from "../lifecycle/receipt-repository.js";
import { recoverTerminalAuthorityReceipt } from "../lifecycle/terminal-receipt-authority.js";
import {
  GenerationLossRepository,
  type GenerationLossSource,
} from "../lifecycle/generation-loss-repository.js";
import type {
  LifecycleAdmittedRunScope,
  LifecycleAuthenticatedScopeCheckpoint,
  LifecycleDigest,
  LifecycleIntegrityReceiptAuthorityPort,
  LifecycleReceiptRecord,
} from "../lifecycle/receipt-authority.js";
import {
  hasKnownLifecycleReceiptState,
  LifecycleReceiptRecoveryError,
  LifecycleReceiptRecoveryService,
} from "../lifecycle/receipt-recovery.js";

export { FabricClient } from "./client.js";

export type FabricOperatorActionPorts = {
  statePort: OperatorActionStatePort;
  effectPort: OperatorActionEffectPort;
};

export type FabricRuntimeOpenOptions = FabricOpenOptions & {
  operatorActionPorts?: FabricOperatorActionPorts;
  daemonStopPort?: ProductionDaemonStopPort;
  fabricSocketPath?: string;
  gitHostedChecks?: GitHostedChecksPort;
  externalEffects?: Readonly<{
    registry: readonly RegisteredEffectPort[];
    evidence: ExternalEffectEvidencePort;
  }>;
  herdr?: HerdrDaemonIntegrationConfiguration;
  gitMutationPort?: GitMutationPort;
  gitConflictInspector?: GitConflictInspectorPort;
  trustedGitConfiguration?: TrustedGitConfiguration;
  lifecycleReceiptAuthority?: LifecycleIntegrityReceiptAuthorityPort;
  fault?: (label: string) => void;
};

type Row = Record<string, unknown>;
type TaskCreateInput = {
  taskId: string;
  authorityId: string;
  eligibleAgentIds: string[];
  proposedOwnerAgentId?: string;
  participantAgentIds?: string[];
  dependencies?: string[];
  expectedArtifacts?: string[];
  objectiveChecks?: string[];
  objective: string;
  baseRevision: string;
  commandId: string;
};
const MAXIMUM_EPHEMERAL_PROVIDER_PROMPT_BYTES = 65_536;
const MAXIMUM_LIFECYCLE_HANDOFF_BYTES = 65_536;
type StoredAuthority = AuthorityInput;

class LifecycleAdoptionSourceVectorDriftError extends Error {
  constructor(readonly expectedDigest: string, readonly observedDigest: string) {
    super("lifecycle accepted source vector changed before adoption apply");
  }
}


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

function messageKindField(row: Row, field: string): MessageInput["kind"] {
  const value = stringField(row, field);
  if (
    value === "request" ||
    value === "response" ||
    value === "event" ||
    value === "steer" ||
    value === "cancel" ||
    value === "escalate" ||
    value === "ack"
  ) return value;
  throw new Error(`database field ${field} is not a message kind`);
}

function rowOrNotFound(value: unknown, label: string): Row {
  if (!isRow(value)) {
    throw new FabricError("NOT_FOUND", `${label} was not found`);
  }
  return value;
}

function assertActiveMcpSeatGeneration(row: Row): void {
  const generation = row.mcp_seat_generation;
  if (generation === null || generation === undefined) return;
  if (typeof generation !== "string" || row.active_mcp_seat_generation !== generation) {
    throw new FabricError("AUTHENTICATION_FAILED", "capability belongs to an inactive MCP seat generation");
  }
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

function privateSafeErrorMessage(error: unknown, privateValues: readonly string[], fallback: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return privateValues.some((value) => message.includes(value)) ? fallback : message;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Digest(value: string): string {
  return `sha256:${sha256(value)}`;
}

function lifecycleDigest(domain: string, value: unknown): string {
  return sha256Digest(`agent-fabric.lifecycle.v1\0${domain}\0${canonicalJson(value)}`);
}

function canonicalPath(path: string): string {
  if (
    path.length === 0 ||
    path.includes("\0") ||
    path.split(/[\\/]/u).includes("..") ||
    /[*?[\]{}]/u.test(path)
  ) {
    throw new FabricError("AUTHORITY_WIDENING", `unsafe path: ${path}`);
  }
  let cursor = resolve(path);
  const suffix: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new FabricError("AUTHORITY_WIDENING", `path has no resolvable ancestor: ${path}`);
    }
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  const resolved = resolve(realpathSync(cursor), ...suffix);
  return normalize(resolved).replaceAll(sep, "/");
}

function pathContains(parent: string, child: string): boolean {
  const rel = posix.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith("../") && !posix.isAbsolute(rel));
}

function scopesOverlap(left: string, right: string): boolean {
  return pathContains(left, right) || pathContains(right, left);
}

function isAbsoluteOnAnyPlatform(path: string): boolean {
  return isAbsolute(path) || /^[A-Za-z]:[\\/]/u.test(path) || /^[\\/]{2}/u.test(path);
}

function canonicalWorkspaceRoot(path: string): string {
  if (!isAbsoluteOnAnyPlatform(path)) {
    throw new FabricError("AUTHORITY_WIDENING", "configured workspace root must be absolute");
  }
  return canonicalPath(path);
}

function canonicalAuthorityPath(workspaceRoot: string, path: string): string {
  if (
    path.length === 0 ||
    path.includes("\0") ||
    isAbsoluteOnAnyPlatform(path) ||
    path.split(/[\\/]/u).includes("..") ||
    /[*?[\]{}]/u.test(path)
  ) {
    throw new FabricError("AUTHORITY_WIDENING", `unsafe workspace-relative path: ${path}`);
  }
  let cursor = resolve(workspaceRoot, path);
  const suffix: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new FabricError("AUTHORITY_WIDENING", `path has no resolvable ancestor: ${path}`);
    }
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  const resolved = resolve(realpathSync(cursor), ...suffix);
  const rel = relative(workspaceRoot, resolved);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new FabricError("AUTHORITY_WIDENING", `workspace-relative path escapes configured root: ${path}`);
  }
  return rel === "" ? "." : normalize(rel).replaceAll(sep, "/");
}

const DISCLOSURE_TARGETS = ["local", "approved-provider", "external"] as const satisfies readonly DisclosureTarget[];
const disclosureTargets = new Set<string>(DISCLOSURE_TARGETS);

function isDisclosureTarget(value: string): value is DisclosureTarget {
  return disclosureTargets.has(value);
}

function normaliseDisclosure(value: AuthorityInput["disclosure"]): DisclosurePolicy {
  if (!isRow(value)) throw new FabricError("AUTHORITY_WIDENING", "authority disclosure policy is invalid");
  if (value.level === "allowed" && !("scopes" in value)) return { level: "allowed" };
  if (value.level === "forbidden" && !("scopes" in value)) return { level: "forbidden" };
  if (value.level === "scoped" && "scopes" in value && isStringArray(value.scopes)) {
    const scopes = [...new Set(value.scopes)];
    if (scopes.length === 0 || scopes.length === DISCLOSURE_TARGETS.length || scopes.some((scope) => !disclosureTargets.has(scope))) {
      throw new FabricError("AUTHORITY_WIDENING", "scoped disclosure requires a non-empty proper destination subset");
    }
    return { level: "scoped", scopes: scopes.filter(isDisclosureTarget).sort() };
  }
  throw new FabricError("AUTHORITY_WIDENING", "authority disclosure policy is invalid");
}

function validateIntegerBudget(budget: Record<string, number>): void {
  for (const [dimension, value] of Object.entries(budget)) {
    if (!isBudgetUnitKey(dimension)) {
      throw new FabricError("AUTHORITY_WIDENING", `budget unit key is invalid: ${dimension}`);
    }
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      throw new FabricError("AUTHORITY_WIDENING", `budget ${dimension} must be a non-negative integer`);
    }
  }
}

function validateBudgetUnitKeys(budget: Record<string, unknown>): void {
  const invalid = Object.keys(budget).find((unit) => !isBudgetUnitKey(unit));
  if (invalid !== undefined) throw new FabricError("BUDGET_EXCEEDED", `budget unit key is invalid: ${invalid}`);
}

export function normaliseAuthority(
  authority: AuthorityInput,
  workspaceRoot: string,
): StoredAuthority {
  let parsed: AuthorityInput;
  try {
    parsed = parseAuthorityEnvelopeV2(authority, "authority");
  } catch (cause: unknown) {
    throw new FabricError(
      "AUTHORITY_WIDENING",
      cause instanceof Error ? cause.message : "authority does not match AuthorityEnvelopeV2",
      { cause },
    );
  }
  validateIntegerBudget(parsed.budget);
  const expires = Date.parse(parsed.expiresAt);
  if (!Number.isFinite(expires)) {
    throw new FabricError("AUTHORITY_WIDENING", "authority expiry must be an ISO timestamp");
  }
  const actionExpansion = expandAuthorityActions(parsed.actions);
  if (!actionExpansion.ok) {
    throw new FabricError("AUTHORITY_WIDENING", `unknown authority actions: ${actionExpansion.unknownActions.join(", ")}`);
  }
  const deniedActionExpansion = expandAuthorityActions(parsed.deniedActions);
  if (!deniedActionExpansion.ok) {
    throw new FabricError("AUTHORITY_WIDENING", `unknown denied authority actions: ${deniedActionExpansion.unknownActions.join(", ")}`);
  }
  const canonicalisePath = (path: string): string => canonicalAuthorityPath(workspaceRoot, path);
  const workspaceRoots = [...new Set(parsed.workspaceRoots.map(canonicalisePath))].sort();
  const sourcePaths = [...new Set(parsed.sourcePaths.map(canonicalisePath))].sort();
  const artifactPaths = [...new Set(parsed.artifactPaths.map(canonicalisePath))].sort();
  if (workspaceRoots.length === 0 || sourcePaths.some((path) => !workspaceRoots.some((root) => pathContains(root, path))) || artifactPaths.some((path) => !workspaceRoots.some((root) => pathContains(root, path)))) {
    throw new FabricError("AUTHORITY_WIDENING", "source and artifact paths must be inside an authority workspace root");
  }
  return {
    schemaVersion: 2,
    approval: parsed.approval,
    workspaceRoots,
    sourcePaths,
    artifactPaths,
    actions: actionExpansion.operations,
    deniedPaths: [...new Set(parsed.deniedPaths.map(canonicalisePath))].sort(),
    deniedActions: [...new Set(deniedActionExpansion.operations)].sort(),
    prohibitedActions: [...new Set(parsed.prohibitedActions)].sort(),
    disclosure: normaliseDisclosure(parsed.disclosure),
    secrets: parsed.secrets.access === "none"
      ? parsed.secrets
      : { access: "use-without-disclosure", references: [...parsed.secrets.references].sort() },
    deployment: !parsed.deployment.allowed
      ? parsed.deployment
      : { allowed: true, targets: [...parsed.deployment.targets].sort() },
    irreversibleActions: !parsed.irreversibleActions.allowed
      ? parsed.irreversibleActions
      : { allowed: true, actionIds: [...parsed.irreversibleActions.actionIds].sort() },
    network: parsed.network.toolEgress === "none"
      ? parsed.network
      : { toolEgress: "allowlist", allowedHosts: [...parsed.network.allowedHosts].sort() },
    expiresAt: new Date(expires).toISOString(),
    budget: Object.fromEntries(Object.entries(parsed.budget).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRow(value) && Object.values(value).every((item) => typeof item === "number");
}

function parseAuthority(record: Row): StoredAuthority {
  return readStoredAuthority(record);
}

function authorityContained(child: StoredAuthority, parent: StoredAuthority): boolean {
  return authorityEnvelopeV2Contained(child, parent);
}

function capabilityToken(key: string, runId: string, agentId: string, principalGeneration: number): string {
  return `afc_${createHmac("sha256", key).update(canonicalJson({ runId, agentId, principalGeneration })).digest("base64url")}`;
}

function audienceHash(input: MessageInput): string {
  const audience =
    input.audience.kind === "agents"
      ? { kind: input.audience.kind, agentIds: [...new Set(input.audience.agentIds)].sort() }
      : input.audience.kind === "team"
        ? { kind: input.audience.kind, teamId: input.audience.teamId }
        : { kind: input.audience.kind, taskId: input.audience.taskId };
  return sha256(
    canonicalJson({
      audience,
      context: input.context ?? { kind: "direct" },
      kind: input.kind,
      body: input.body,
      requiresAck: input.requiresAck,
      conversationId: input.conversationId ?? null,
      replyToMessageId: input.replyToMessageId ?? null,
      taskRevision: input.taskRevision ?? null,
      hopCount: input.hopCount ?? 0,
      expiresAt: input.expiresAt ?? null,
    }),
  );
}

function isLeaseResult(value: unknown): value is LeaseResult {
  return (
    isRow(value) &&
    typeof value.leaseId === "string" &&
    typeof value.holderAgentId === "string" &&
    typeof value.generation === "number" &&
    (value.status === "active" || value.status === "quarantined") &&
    isStringArray(value.scope)
  );
}

function isAuthorityResult(value: unknown): value is AuthorityResult {
  return isRow(value) && typeof value.authorityId === "string";
}

function isTaskState(value: unknown): value is TaskResult["state"] {
  return value === "blocked" || value === "ready" || value === "active" || value === "complete" || value === "cancelled" || value === "degraded";
}

function isTaskResult(value: unknown): value is TaskResult {
  return (
    isRow(value) &&
    typeof value.taskId === "string" &&
    (typeof value.ownerAgentId === "string" || value.ownerAgentId === null) &&
    isTaskState(value.state) &&
    typeof value.revision === "number" &&
    typeof value.ownerLeaseGeneration === "number" &&
    (typeof value.proposedOwnerAgentId === "string" || value.proposedOwnerAgentId === null) &&
    isStringArray(value.dependencies)
  );
}

function taskResultFromRow(
  row: Row,
  proposedOwnerAgentId: string | null = null,
  dependencies: string[] = [],
): TaskResult {
  const ownerValue = row.owner_agent_id;
  const stateValue = row.state;
  if ((typeof ownerValue !== "string" && ownerValue !== null) || !isTaskState(stateValue)) {
    throw new Error("stored task is invalid");
  }
  return {
    taskId: stringField(row, "task_id"),
    ownerAgentId: ownerValue,
    state: stateValue,
    revision: numberField(row, "revision"),
    ownerLeaseGeneration: numberField(row, "owner_lease_generation"),
    proposedOwnerAgentId,
    dependencies,
  };
}

function isReceiptResult(value: unknown): value is ReceiptResult {
  return (
    isRow(value) &&
    typeof value.relativePath === "string" &&
    /^fabric-receipt-[0-9a-f]{64}\.json$/u.test(value.relativePath) &&
    (value.schemaVersion === 1 || value.schemaVersion === 2) &&
    typeof value.sha256 === "string"
  );
}

function isProofResult(value: unknown): value is ProofResult {
  return isRow(value) && typeof value.proofId === "string";
}

function isRevocationResult(value: unknown): value is RevocationResult {
  return isRow(value) && value.revoked === true;
}

function isArtifactResult(value: unknown): value is ArtifactResult {
  return (
    isRow(value) &&
    typeof value.artifactId === "string" &&
    typeof value.relativePath === "string" &&
    typeof value.sha256 === "string"
  );
}

function isEvidenceArtifactRegistration(value: unknown): value is EvidenceArtifactRegistration {
  try {
    parseEvidenceArtifactRegistration(value);
    return true;
  } catch {
    return false;
  }
}

function isBarrierResult(value: unknown): value is BarrierResult {
  return (
    isRow(value) &&
    (value.scope === "run" || value.scope === "stage") &&
    value.closed === true &&
    isReceiptResult(value.receipt)
  );
}

function isLifecycleCheckpoint(value: unknown): value is LifecycleCheckpoint {
  return (
    isRow(value) &&
    typeof value.relativePath === "string" &&
    typeof value.sha256 === "string" &&
    typeof value.mailboxWatermark === "number" &&
    Array.isArray(value.acknowledgedAboveWatermark) &&
    value.acknowledgedAboveWatermark.every((item) => typeof item === "number") &&
    isStringArray(value.inFlightChildren) &&
    isStringArray(value.openWork) &&
    typeof value.nextAction === "string" &&
    typeof value.providerResumeReference === "string"
  );
}

function isLifecycleResult(value: unknown): value is LifecycleResult {
  try {
    if (isRow(value) && value.kind === "accepted-suspended") {
      LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC.parse(value, "lifecycleResult");
    } else {
      LIFECYCLE_CURRENT_STATE_V1_CODEC.parse(value, "lifecycleResult");
    }
    return true;
  } catch {
    return false;
  }
}

function lifecycleHandoffPrompt(input: {
  agentId: string;
  taskId: string;
  taskRevision: number;
  checkpoint: LifecycleCheckpoint;
  nextProviderSessionGeneration: number;
}): string {
  const handoff = canonicalJson({
    schemaVersion: 1,
    kind: "agent-fabric-verified-lifecycle-checkpoint",
    agentId: input.agentId,
    taskId: input.taskId,
    taskRevision: input.taskRevision,
    checkpointSha256: input.checkpoint.sha256,
    mailboxWatermark: input.checkpoint.mailboxWatermark,
    acknowledgedAboveWatermark: input.checkpoint.acknowledgedAboveWatermark,
    inFlightChildren: input.checkpoint.inFlightChildren,
    openWork: input.checkpoint.openWork,
    nextAction: input.checkpoint.nextAction,
    priorResumeReference: input.checkpoint.providerResumeReference,
    nextProviderSessionGeneration: input.nextProviderSessionGeneration,
  });
  const prompt = [
    "Resume from this bounded Agent Fabric checkpoint. Treat it as the verified recovery handoff; do not infer newer task, mailbox, child, provider-session, or write-custody state.",
    handoff,
    "Consume the handoff in this provider turn and continue with nextAction only after checking current Fabric state.",
  ].join("\n");
  if (Buffer.byteLength(prompt, "utf8") > MAXIMUM_LIFECYCLE_HANDOFF_BYTES) {
    throw new FabricError("CHECKPOINT_INCOMPLETE", "lifecycle checkpoint handoff exceeds the provider prompt bound");
  }
  return prompt;
}

function isProviderActionStatus(value: unknown): value is ProviderActionResult["status"] {
  return ["prepared", "dispatched", "accepted", "terminal", "ambiguous", "quarantined"].includes(String(value));
}

const MAXIMUM_PROVIDER_ANSWER_BYTES = 262_144;

function providerAnswerFromAdapterResult(value: unknown): string {
  if (!isRow(value) || typeof value.result !== "string") {
    throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "answer-bearing provider spawn returned no validated answer");
  }
  const answer = value.result.trim();
  if (answer.length === 0 || Buffer.byteLength(answer, "utf8") > MAXIMUM_PROVIDER_ANSWER_BYTES) {
    throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "answer-bearing provider spawn returned an empty or oversized answer");
  }
  return answer;
}

function isTaskBoundEphemeralProviderPayload(value: unknown): value is Record<string, unknown> {
  return isRow(value) &&
    typeof value.taskId === "string" &&
    typeof value.model === "string" &&
    typeof value.modelFamily === "string" &&
    typeof value.prompt === "string";
}

function providerActionResult(value: unknown, expectedActionId?: string): ProviderActionResult {
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

function providerActionResultWithRequiredAnswer(
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

function isProviderActionResult(value: unknown): value is ProviderActionResult {
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

function assertAdapterOperation(capabilities: unknown, operation: string): void {
  if (
    !isRow(capabilities) || capabilities.actionJournal !== true ||
    !Array.isArray(capabilities.operations) ||
    !capabilities.operations.every((value) => typeof value === "string") ||
    (!capabilities.operations.includes(operation) &&
      !(operation !== "spawn" && operation !== "attach" && capabilities.operations.includes("dispatch")))
  ) {
    throw new FabricError("CAPABILITY_FORBIDDEN", `adapter does not advertise durable ${operation}`);
  }
}

function isInterventionResult(value: unknown): value is InterventionResult {
  return isRow(value) && typeof value.interventionId === "string";
}

function isTeamResult(value: unknown): value is TeamResult {
  return (
    isRow(value) &&
    typeof value.teamId === "string" &&
    (typeof value.parentTeamId === "string" || value.parentTeamId === null) &&
    typeof value.depth === "number" &&
    typeof value.leaderAgentId === "string" &&
    typeof value.rootTaskId === "string" &&
    isStringArray(value.ownedTaskIds) &&
    isStringArray(value.memberAgentIds) &&
    typeof value.budgetId === "string" &&
    (value.state === "active" || value.state === "frozen" || value.state === "barrier-closed") &&
    typeof value.generation === "number" &&
    (typeof value.successorAgentId === "string" || value.successorAgentId === null) &&
    (value.initialMembers === undefined || (
      Array.isArray(value.initialMembers) && value.initialMembers.every((member) =>
        isRow(member) && typeof member.agentId === "string" && typeof member.authorityId === "string")
    )) &&
    Array.isArray(value.discussionGroups) &&
    isNumberRecord(value.reservedBudget)
  );
}

function isBudgetResult(value: unknown): value is BudgetResult {
  return (
    isRow(value) &&
    typeof value.budgetId === "string" &&
    (typeof value.parentBudgetId === "string" || value.parentBudgetId === null) &&
    (value.state === "active" || value.state === "usage-unknown" || value.state === "released") &&
    isRow(value.dimensions) &&
    isNumberRecord(value.returned)
  );
}

type ProviderActionDispatchRequest = {
  adapterId: string;
  actionId: string;
  operation: "spawn" | "send_turn" | "wakeup" | "release" | "steer";
  authorityId?: string;
  payload: Record<string, unknown>;
  commandId: string;
};

function publicHerdrSteerResult(result: HerdrDirectSteerResult): HerdrSteerDispatchResult {
  if (result.status === "rejected" || result.status === "unavailable") return result;
  const base = { actionId: result.actionId, revision: result.revision };
  if (result.status === "prepared" || result.status === "dispatched") {
    return { ...base, status: result.status };
  }
  if (result.status === "ambiguous") {
    if (result.ambiguityReason === undefined) {
      throw new TypeError("ambiguous Herdr steering action has no bounded reason");
    }
    return { ...base, status: "ambiguous", reason: result.ambiguityReason };
  }
  if (
    result.receipt?.status !== "dispatched-unconfirmed" ||
    result.receipt.operation !== "steer.inject-fire-and-forget"
  ) throw new TypeError("terminal Herdr steering action has no direct-steer receipt");
  return { ...base, status: "terminal", receipt: result.receipt };
}

export class Fabric {
  readonly #database: Database.Database;
  readonly #workspaceRoots: string[];
  readonly #clock: () => number;
  readonly #adapters: NonNullable<FabricOpenOptions["adapters"]>;
  readonly #readPolicy: FabricReadPolicy;
  readonly #commandJournal: CommandJournal;
  readonly #providerActionAdmission: ProviderActionAdmissionCoordinator;
  readonly #lifecycleRotations: LifecycleRotationRepository;
  readonly #lifecycleReceipts: LifecycleReceiptRepository;
  readonly #generationLosses: GenerationLossRepository;
  readonly #lifecycleReceiptAuthority: LifecycleIntegrityReceiptAuthorityPort | undefined;
  readonly #lifecycleReceiptRecovery: LifecycleReceiptRecoveryService | undefined;
  readonly #capabilityKey: string;
  readonly #fabricSocketPath: string | undefined;
  readonly #adapterSupervisor: AdapterSupervisor;
  readonly #providerSessions: ProviderSessionCoordinator;
  readonly #maximumConcurrentProviderTurns: number;
  readonly #ownedProviderActions = new Map<string, Promise<void>>();
  readonly #providerActionReconciliations = new Map<string, Promise<ProviderActionResult>>();
  readonly #lifecycleProviderActions = new Map<string, Promise<ProviderActionResult>>();
  readonly #activeProviderOperations = new Set<Promise<void>>();
  readonly #deferredProviderActions: Array<{
    key: string;
    runId: string;
    adapterId: string;
    actionId: string;
    execute: () => Promise<ProviderActionResult>;
    settle: () => void;
  }> = [];
  #pumpingDeferredProviderActions = false;
  #deferredProviderPumpTimer: ReturnType<typeof setTimeout> | undefined;
  #closing = false;
  readonly #operatorStore: OperatorStore;
  readonly #operatorProjections: OperatorProjectionStore;
  readonly #gitRepositoryReads: GitRepositoryReadService;
  readonly #artifactContentReads: ArtifactContentReadService;
  readonly #operatorActions: OperatorActionStore;
  readonly #launchCustody: LaunchCustodyService | undefined;
  readonly #projectSessions: ProjectSessionStore;
  readonly #memberships: ProjectSessionMembershipStore;
  readonly #intakes: IntakeStore;
  readonly #gates: ScopedGateStore;
  readonly #resources: HierarchicalAdmissionStore;
  readonly #workstreams: CoordinatedWorkstreamStore;
  readonly #results: AtomicDeliveryStore;
  readonly #notifications: NotificationOutbox;
  readonly #notificationWorker: NativeNotificationWorker;
  readonly #artifactRegistry: ArtifactRegistry;
  readonly #externalEffects: ExternalEffectService | undefined;
  readonly #herdr: HerdrDaemonIntegration;
  readonly #herdrConfigured: boolean;
  readonly #typedGit: TypedGitService;
  readonly #trustedGitRegistry: TrustedGitRegistry;
  readonly #trustedRunGitAllowlists: readonly TrustedRunGitAllowlist[];
  readonly #fault: (label: string) => void;

  constructor(options: FabricRuntimeOpenOptions) {
    const clock = options.clock ?? Date.now;
    this.#clock = () => {
      const value = clock();
      return value instanceof Date ? value.getTime() : value;
    };
    this.#fault = options.fault ?? (() => undefined);
    this.#workspaceRoots = [...new Set(options.workspaceRoots.map(canonicalWorkspaceRoot))].sort();
    if (this.#workspaceRoots.length === 0) {
      throw new FabricError("AUTHORITY_WIDENING", "fabric requires at least one configured workspace root");
    }
    this.#database = openFabricDatabase(options.databasePath);
    this.#readPolicy = new FabricReadPolicy(this.#database);
    this.#commandJournal = new CommandJournal(this.#database, this.#clock);
    this.#providerActionAdmission = new ProviderActionAdmissionCoordinator({
      database: this.#database,
      clock: this.#clock,
      fault: this.#fault,
    });
    this.#lifecycleRotations = new LifecycleRotationRepository(this.#database);
    this.#lifecycleReceipts = new LifecycleReceiptRepository(
      this.#database,
      this.#lifecycleRotations,
      this.#clock,
    );
    this.#generationLosses = new GenerationLossRepository(this.#database);
    this.#lifecycleReceiptAuthority = options.lifecycleReceiptAuthority;
    this.#lifecycleReceiptRecovery = options.lifecycleReceiptAuthority === undefined
      ? undefined
      : new LifecycleReceiptRecoveryService(this.#database, options.lifecycleReceiptAuthority);
    this.#artifactRegistry = new ArtifactRegistry(this.#database, this.#clock);
    this.#adapters = options.adapters ?? {};
    this.#adapterSupervisor = new AdapterSupervisor(this.#adapters);
    this.#maximumConcurrentProviderTurns = options.maximumConcurrentProviderTurns ?? 8;
    this.#providerSessions = new ProviderSessionCoordinator({
      database: this.#database,
      clock: this.#clock,
      maximumConcurrentTurns: this.#maximumConcurrentProviderTurns,
      providerActionAdmission: this.#providerActionAdmission,
    });
    this.#capabilityKey = options.capabilityKey ?? randomBytes(32).toString("base64url");
    this.#fabricSocketPath = options.fabricSocketPath;
    this.#operatorStore = new OperatorStore({ database: this.#database, clock: this.#clock });
    this.#gates = new ScopedGateStore({
      database: this.#database,
      operatorStore: this.#operatorStore,
      clock: this.#clock,
    });
    this.#externalEffects = options.externalEffects === undefined
      ? undefined
      : new ExternalEffectService({
          database: this.#database,
          registry: options.externalEffects.registry,
          evidence: options.externalEffects.evidence,
          gates: this.#gates,
          clock: this.#clock,
        });
    this.#operatorProjections = new OperatorProjectionStore({
      database: this.#database,
      operatorStore: this.#operatorStore,
      clock: this.#clock,
    });
    this.#gitRepositoryReads = new GitRepositoryReadService({
      database: this.#database,
      operatorStore: this.#operatorStore,
      privateStateRoot: dirname(realpathSync(options.databasePath)),
      clock: this.#clock,
      ...(options.gitHostedChecks === undefined ? {} : { hostedChecks: options.gitHostedChecks }),
      artifactRegistry: this.#artifactRegistry,
    });
    this.#artifactContentReads = new ArtifactContentReadService({
      database: this.#database,
      operatorStore: this.#operatorStore,
      privateStateRoot: dirname(realpathSync(options.databasePath)),
    });
    const privateStateRoot = dirname(realpathSync(options.databasePath));
    this.#trustedGitRegistry = new TrustedGitRegistry(this.#database, this.#clock);
    this.#trustedRunGitAllowlists = options.trustedGitConfiguration?.runAllowlists ?? [];
    if (options.trustedGitConfiguration !== undefined) {
      this.#trustedGitRegistry.materialize({
        ...(options.trustedGitConfiguration.executionProfiles === undefined
          ? {}
          : { executionProfiles: options.trustedGitConfiguration.executionProfiles }),
        ...(options.trustedGitConfiguration.remoteRegistrations === undefined
          ? {}
          : { remoteRegistrations: options.trustedGitConfiguration.remoteRegistrations }),
      });
    }
    const gitMutationPort = options.gitMutationPort ?? new FixedGitMutationPort({
      privateStateRoot,
      clock: this.#clock,
    });
    this.#typedGit = new TypedGitService({
      database: this.#database,
      gitPort: gitMutationPort,
      ...(options.gitConflictInspector === undefined ? {} : { conflictInspector: options.gitConflictInspector }),
      materializeTrustedRunAllowlist: (identity) => {
        const matching = this.#trustedRunGitAllowlists.filter((allowlist) =>
          allowlist.projectSessionId === identity.projectSessionId &&
          allowlist.coordinationRunId === identity.coordinationRunId);
        if (matching.length > 0) this.#trustedGitRegistry.materialize({ runAllowlists: matching });
      },
      clock: this.#clock,
      daemonInstanceId: `git-owner-${randomBytes(16).toString("hex")}`,
    });
    const productionOperatorPorts = createProductionOperatorActionPorts({
      database: this.#database,
      clock: this.#clock,
      adapter: {
        capabilities: async (adapterId) => await this.#adapterSupervisor.request(adapterId, "capabilities", {}),
        dispatch: async (adapterId, input) => await this.#adapterSupervisor.request(adapterId, "dispatch", input),
        lookup: async (adapterId, actionId) => await this.#adapterSupervisor.request(adapterId, "lookup_action", { actionId }),
      },
      providerActionAdmission: this.#providerActionAdmission,
      ...(options.daemonStopPort === undefined ? {} : { daemonStop: options.daemonStopPort }),
      ...(this.#externalEffects === undefined ? {} : { externalEffects: this.#externalEffects }),
      typedGit: this.#typedGit,
      retireVolatileProjectSession: (projectSessionId) => {
        this.#adapterSupervisor.retireProjectSessionBridges(projectSessionId);
      },
    });
    this.#launchCustody = options.fabricSocketPath === undefined
      ? undefined
      : new LaunchCustodyService({
          database: this.#database,
          providerActionAdmission: this.#providerActionAdmission,
          clock: this.#clock,
          randomCapability: () => `afc_${randomBytes(32).toString("base64url")}`,
          fabricSocketPath: options.fabricSocketPath,
          adapterContracts: {
            inspect: async (adapterId) => await this.#inspectLaunchAdapterContract(adapterId),
          },
          adapterEffects: {
            dispatch: async (handle) => await this.#dispatchLaunchAdapter(handle),
            lookup: async (input) => await this.#lookupLaunchAdapter(input),
            hasRetainedChairBridge: (entry) => this.#adapterSupervisor.hasRetainedChairBridge(entry),
            recoverChair: async (handle) => await this.#dispatchChairRecoveryAdapter(handle),
            lookupChairRecovery: async (input) => await this.#requestAdapter(
              input.adapterId,
              "lookup_action",
              { actionId: input.actionId },
            ),
            lookupRetainedSuccessorBridge: async (input) => (
              await this.#adapterSupervisor.lookupRetainedSuccessorBridge(input)
            ),
            promoteRetainedSuccessorBridge: async (input) => (
              await this.#adapterSupervisor.promoteRetainedChildBridgeToChair(input)
            ),
          },
          agentEffects: {
            dispatch: async (handle) => await this.#dispatchAgentAdapter(handle),
            attachWithoutBridge: async (handle) => await this.#attachWithoutBridge(handle),
            lookup: async (input) => await this.#requestAdapter(input.adapterId, "lookup_action", { actionId: input.actionId }),
            hasRetainedBridge: (result, handle) => this.#adapterSupervisor.hasRetainedChildBridge({
              runId: handle.runId,
              agentId: result.agentId,
              adapterId: result.adapterId,
              actionId: result.actionId,
              providerSessionRef: result.providerSessionRef,
              providerSessionGeneration: result.providerSessionGeneration,
              bridgeGeneration: result.bridgeGeneration,
            }),
          },
          retireVolatileProjectSession: (projectSessionId) => {
            this.#adapterSupervisor.retireProjectSessionBridges(projectSessionId);
          },
          retireVolatileChairBridge: (entry) => {
            this.#adapterSupervisor.retireChairBridge(entry);
          },
          daemonInstanceGeneration: () => this.#currentDaemonInstanceGeneration(),
        });
    if (this.#launchCustody !== undefined) {
      this.#adapterSupervisor.setChairBridgeLossHandler((entry, reason) => {
        this.#launchCustody?.observeChairBridgeLoss({ ...entry, reason });
      });
      this.#adapterSupervisor.setChildBridgeLossHandler((entry, reason) => {
        this.#launchCustody?.observeChildBridgeLoss({ ...entry, reason });
      });
    }
    this.#operatorActions = new OperatorActionStore({
      database: this.#database,
      operatorStore: this.#operatorStore,
      statePort: options.operatorActionPorts?.statePort ?? productionOperatorPorts.statePort,
      effectPort: options.operatorActionPorts?.effectPort ?? productionOperatorPorts.effectPort,
      ...(this.#launchCustody === undefined ? {} : { launchCustody: this.#launchCustody }),
      ...(this.#launchCustody === undefined ? {} : { chairRecoveryCustody: this.#launchCustody }),
      ...(this.#launchCustody === undefined ? {} : { chairLiveHandoffCustody: this.#launchCustody }),
      clock: this.#clock,
    });
    this.#projectSessions = new ProjectSessionStore({
      database: this.#database,
      operatorStore: this.#operatorStore,
      commandJournal: this.#commandJournal,
      clock: this.#clock,
      retireVolatileProjectSession: (projectSessionId) => {
        this.#adapterSupervisor.retireProjectSessionBridges(projectSessionId);
      },
    });
    this.#memberships = new ProjectSessionMembershipStore({
      database: this.#database,
      clock: this.#clock,
    });
    this.#results = new AtomicDeliveryStore({
      database: this.#database,
      clock: this.#clock,
      artifactRegistry: this.#artifactRegistry,
      memberships: this.#memberships,
    });
    this.#intakes = new IntakeStore({
      database: this.#database,
      operatorStore: this.#operatorStore,
      clock: this.#clock,
      requestCommitter: {
        commitTaskRequest: (request) => {
          const run = rowOrNotFound(this.#database.prepare(`
            SELECT chair_agent_id FROM runs
             WHERE run_id=? AND project_session_id=?
          `).get(request.coordinationRunId, request.projectSessionId), "intake coordination run");
          return this.#results.request(
            this.#agentContext(request.coordinationRunId, stringField(run, "chair_agent_id")),
            request,
          );
        },
      },
    });
    this.#resources = new HierarchicalAdmissionStore({ database: this.#database, clock: this.#clock });
    this.#workstreams = new CoordinatedWorkstreamStore({
      database: this.#database,
      clock: this.#clock,
      commandJournal: this.#commandJournal,
      resources: this.#resources,
      createTeam: (runId, actorAgentId, input) => this.createTeam(runId, actorAgentId, input),
    });
    this.#notifications = new NotificationOutbox({ database: this.#database, clock: this.#clock });
    this.#notificationWorker = new NativeNotificationWorker({
      outbox: this.#notifications,
      adapter: new MacOsNativeDesktopAdapter(),
      workerInstanceId: `native-notification-${randomBytes(16).toString("hex")}`,
      integrationId: "native-desktop",
      clock: this.#clock,
    });
    this.#herdr = new HerdrDaemonIntegration({
      database: this.#database,
      providerActionAdmission: this.#providerActionAdmission,
      configuration: options.herdr ?? { mode: "disabled" },
      clock: this.#clock,
    });
    this.#herdrConfigured = options.herdr !== undefined;
  }

  /** Trusted in-process daemon composition only; no protocol operation dispatches here. */
  materializeTrustedGitConfiguration(configuration: TrustedGitConfiguration): {
    profiles: number;
    remotes: number;
    runAllowlists: number;
  } {
    return this.#trustedGitRegistry.materialize(configuration);
  }

  async executeHerdrAction(request: HerdrDaemonActionRequest): Promise<HerdrDaemonActionResult> {
    return await this.#herdr.executeAction(request);
  }

  async executeHerdrDirectSteer(request: HerdrDirectSteerRequest): Promise<HerdrDirectSteerResult> {
    return await this.#herdr.executeDirectSteer(request);
  }

  async runHerdrPresencePass(): Promise<import("../integrations/herdr-daemon-integration.js").HerdrPresencePassResult> {
    return await this.#herdr.runPresencePass();
  }

  recoverDaemonRuntimeEpoch(input: {
    instanceGeneration: number;
    instanceId: string;
  }): ReturnType<typeof recoverRuntimeEpoch> {
    return recoverRuntimeEpoch(this.#database, {
      ...input,
      now: this.#clock(),
    });
  }

  markDaemonRuntimeRunning(instanceGeneration: number): ReturnType<typeof markRuntimeEpochRunning> {
    return markRuntimeEpochRunning(this.#database, {
      instanceGeneration,
      now: this.#clock(),
    });
  }

  async attemptIdleStop(input: {
    actionId: string;
    daemonInstanceGeneration: number;
    election: IdleElectionPort;
    closeSocket(): Promise<void>;
    reopenSocket(): Promise<void>;
  }): Promise<IdleStopResult> {
    return await attemptRuntimeIdleStop({
      ...input,
      database: this.#database,
      clock: this.#clock,
    });
  }

  async runNativeNotificationPass(): Promise<NotificationWorkerPassResult> {
    return await this.#notificationWorker.runOnce();
  }

  runResultDeadlinePass(input: ResultDeadlinePassInput): ResultDeadlinePassResult {
    return this.#results.sweepDeadlines(input);
  }

  async attemptDrainedStop(input: {
    actionId: string;
    token: QuiesceToken;
    excludeOperatorEffectCustodyId?: string;
    election: IdleElectionPort;
    closeSocket(): Promise<void>;
    reopenSocket(): Promise<void>;
  }): Promise<IdleStopResult> {
    return await attemptRuntimeDrainedStop({
      ...input,
      database: this.#database,
      clock: this.#clock,
    });
  }

  recordDaemonStopCustodyResult(input: {
    custodyId: string;
    resultCorrelationDigest: string;
    operatorId: string;
    projectId: string;
    projectSessionId: string;
    principalGeneration: number;
    commandId: string;
    daemonInstanceGeneration: number;
    state: "stopped" | "failed" | "rejected";
    result: unknown;
  }): void {
    const persist = this.#database.transaction(() => {
      const resultJson = canonicalJson(input.result);
      const changed = this.#database.prepare(`
        UPDATE operator_daemon_stop_custody SET state=?, result_json=?, updated_at=?
         WHERE custody_id=? AND result_correlation_digest=?
           AND operator_id=? AND project_id=? AND project_session_id=? AND command_id=?
           AND principal_generation=? AND daemon_instance_generation=? AND operation='daemon-stop'
           AND state IN ('prepared','scheduled')
      `).run(
        input.state,
        resultJson,
        this.#clock(),
        input.custodyId,
        input.resultCorrelationDigest,
        input.operatorId,
        input.projectId,
        input.projectSessionId,
        input.commandId,
        input.principalGeneration,
        input.daemonInstanceGeneration,
      );
      if (changed.changes !== 1) {
        const existing = this.#database.prepare(`
          SELECT state, result_json FROM operator_daemon_stop_custody
           WHERE custody_id=? AND result_correlation_digest=?
             AND operator_id=? AND project_id=? AND project_session_id=?
             AND principal_generation=? AND command_id=?
             AND daemon_instance_generation=? AND operation='daemon-stop'
        `).get(
          input.custodyId,
          input.resultCorrelationDigest,
          input.operatorId,
          input.projectId,
          input.projectSessionId,
          input.principalGeneration,
          input.commandId,
          input.daemonInstanceGeneration,
        );
        if (!isRow(existing) || existing.state !== input.state || existing.result_json !== resultJson) {
          throw new ProjectFabricCoreError("STALE_GENERATION", "daemon stop custody result correlation changed");
        }
      }

      const terminalOutcome = input.state === "stopped"
        ? canonicalJson({ status: "committed", afterState: { lifecycleState: "stopped" } })
        : input.state === "rejected"
          ? canonicalJson({ status: "rejected", code: "state-changed", evidenceRefs: [] })
          : null;
      const effectState = input.state === "stopped"
        ? "terminal"
        : input.state;
      const effectChanged = terminalOutcome === null
        ? this.#database.prepare(`
            UPDATE operator_effect_custody SET state='failed', updated_at=?
             WHERE custody_id=? AND operator_id=? AND project_id=? AND project_session_id=?
               AND principal_generation=? AND command_id=? AND operation='stop' AND state='dispatching'
          `).run(
            this.#clock(),
            input.custodyId,
            input.operatorId,
            input.projectId,
            input.projectSessionId,
            input.principalGeneration,
            input.commandId,
          )
        : this.#database.prepare(`
            UPDATE operator_effect_custody SET state=?, outcome_json=?, updated_at=?
             WHERE custody_id=? AND operator_id=? AND project_id=? AND project_session_id=?
               AND principal_generation=? AND command_id=? AND operation='stop' AND state='dispatching'
          `).run(
            effectState,
            terminalOutcome,
            this.#clock(),
            input.custodyId,
            input.operatorId,
            input.projectId,
            input.projectSessionId,
            input.principalGeneration,
            input.commandId,
          );
      if (effectChanged.changes === 1) return;
      const existingEffect = this.#database.prepare(`
        SELECT state, outcome_json FROM operator_effect_custody
         WHERE custody_id=? AND operator_id=? AND project_id=? AND project_session_id=?
           AND principal_generation=? AND command_id=? AND operation='stop'
      `).get(
        input.custodyId,
        input.operatorId,
        input.projectId,
        input.projectSessionId,
        input.principalGeneration,
        input.commandId,
      );
      if (
        !isRow(existingEffect) || existingEffect.state !== effectState ||
        (terminalOutcome !== null && existingEffect.outcome_json !== terminalOutcome)
      ) {
        throw new ProjectFabricCoreError("STALE_GENERATION", "daemon stop effect custody finalization changed");
      }
    });
    persist();
  }

  provisionLocalOperator(input: LocalOperatorProvisioningInput): LocalOperatorProvisioningResult {
    return this.#operatorStore.provisionLocalOperator(input);
  }

  openLocalOperatorConsoleCapability(
    input: LocalOperatorConsoleCapabilityInput,
  ): LocalOperatorConsoleCapabilityResult {
    return this.#operatorStore.openLocalOperatorConsoleCapability(input);
  }

  issueLocalOperatorSessionCapability(
    input: LocalOperatorSessionCapabilityInput,
  ): LocalOperatorSessionCapabilityResult {
    return this.#operatorStore.issueLocalOperatorSessionCapability(input);
  }

  openLocalOperatorConsoleSessionCapability(
    input: Omit<LocalOperatorSessionCapabilityInput, "fresh">,
  ): LocalOperatorConsoleSessionCapabilityResult {
    return this.#operatorStore.openLocalOperatorConsoleSessionCapability(input);
  }

  rotateLocalOperatorPrincipal(
    input: LocalOperatorPrincipalRotationInput,
  ): LocalOperatorPrincipalRotationResult {
    return this.#operatorStore.rotatePrincipal(input);
  }

  #workspaceRootForRun(runId: string): string {
    const run = rowOrNotFound(this.#database.prepare("SELECT workspace_root FROM runs WHERE run_id = ?").get(runId), "run");
    return stringField(run, "workspace_root");
  }

  #agentContext(runId: string, agentId: string): AuthenticatedAgentContext {
    const identity = rowOrNotFound(this.#database.prepare(`
      SELECT r.project_session_id, c.principal_generation
        FROM runs r
        JOIN capabilities c ON c.run_id=r.run_id AND c.agent_id=?
       WHERE r.run_id=? AND c.revoked_at IS NULL
       ORDER BY c.principal_generation DESC
       LIMIT 1
    `).get(agentId, runId), "authenticated agent context");
    return {
      agentId: agentId as never,
      projectSessionId: stringField(identity, "project_session_id") as never,
      coordinationRunId: runId as never,
      principalGeneration: numberField(identity, "principal_generation"),
    };
  }

  async close(): Promise<void> {
    this.#closing = true;
    if (this.#deferredProviderPumpTimer !== undefined) clearTimeout(this.#deferredProviderPumpTimer);
    this.#deferredProviderPumpTimer = undefined;
    this.#abandonDeferredProviderActions();
    while (
      this.#activeProviderOperations.size > 0 ||
      this.#ownedProviderActions.size > 0 ||
      this.#lifecycleProviderActions.size > 0
    ) {
      await Promise.allSettled([
        ...this.#activeProviderOperations,
        ...this.#ownedProviderActions.values(),
        ...this.#lifecycleProviderActions.values(),
      ]);
      this.#abandonDeferredProviderActions();
    }
    await this.#adapterSupervisor.close();
    if (this.#database.open) {
      this.#database.pragma("wal_checkpoint(TRUNCATE)");
      this.#database.close();
    }
  }

  async #requestAdapter(adapterId: string, method: string, params: Record<string, unknown>): Promise<unknown> {
    this.#adapter(adapterId);
    return await this.#adapterSupervisor.request(adapterId, method, params);
  }

  async #trackProviderOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#closing) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "provider operation cannot start while Fabric is closing");
    }
    let settle = (): void => undefined;
    const tracked = new Promise<void>((resolvePromise) => {
      settle = resolvePromise;
    });
    this.#activeProviderOperations.add(tracked);
    try {
      return await operation();
    } finally {
      this.#activeProviderOperations.delete(tracked);
      settle();
    }
  }

  #providerActionOwnershipKey(runId: string, adapterId: string, actionId: string): string {
    return `${runId}\u0000${adapterId}\u0000${actionId}`;
  }

  #enqueueDeferredProviderAction(input: {
    runId: string;
    adapterId: string;
    actionId: string;
    execute: () => Promise<ProviderActionResult>;
  }): void {
    if (this.#closing) return;
    const key = this.#providerActionOwnershipKey(input.runId, input.adapterId, input.actionId);
    if (this.#ownedProviderActions.has(key)) return;
    let settle = (): void => undefined;
    const tracked = new Promise<void>((resolvePromise) => {
      settle = resolvePromise;
    });
    this.#ownedProviderActions.set(key, tracked);
    this.#deferredProviderActions.push({ key, ...input, settle });
    this.#pumpDeferredProviderActions();
  }

  #abandonDeferredProviderActions(): void {
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
  ): "claimed" | "blocked" | "stale" {
    return this.#database.transaction(() => {
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
    if (this.#closing || this.#pumpingDeferredProviderActions) return;
    this.#pumpingDeferredProviderActions = true;
    try {
      while (this.#deferredProviderActions.length > 0) {
        const work = this.#deferredProviderActions[0];
        if (work === undefined) return;
        const claim = this.#claimDeferredProviderAction(work.runId, work.adapterId, work.actionId);
        if (claim === "blocked") return;
        this.#deferredProviderActions.shift();
        if (claim === "stale") {
          this.#ownedProviderActions.delete(work.key);
          work.settle();
          continue;
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
    if (this.#closing || this.#deferredProviderActions.length === 0) {
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

  #settleProviderTurnAndPump(
    runId: string,
    adapterId: string,
    actionId: string,
    status: "terminal" | "ambiguous" | "quarantined",
  ): void {
    this.#providerSessions.settleTurn(runId, adapterId, actionId, status);
    this.#pumpDeferredProviderActions();
  }

  #assertGenericProviderAction(runId: string, adapterId: string, actionId: string): void {
    if (this.#database.prepare(`
      SELECT 1 FROM project_session_launch_custody
       WHERE coordination_run_id=? AND provider_adapter_id=? AND provider_action_id=?
    `).get(runId, adapterId, actionId) !== undefined) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "launch provider actions mutate only through launch custody");
    }
    if (this.#database.prepare(`
      SELECT 1 FROM provider_agent_custody
       WHERE run_id=? AND adapter_id=? AND action_id=?
    `).get(runId, adapterId, actionId) !== undefined) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "agent provider actions mutate only through provider-session custody");
    }
    if (this.#database.prepare(`
      SELECT 1 FROM lifecycle_rotation_custodies
       WHERE run_id=? AND provider_action_adapter_id=? AND provider_action_id=?
    `).get(runId, adapterId, actionId) !== undefined) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "lifecycle provider actions mutate only through lifecycle custody");
    }
    if (adapterId === HERDR_CONTROL_ADAPTER_ID && this.#database.prepare(`
      SELECT 1 FROM provider_actions WHERE run_id=? AND adapter_id=? AND action_id=?
    `).get(runId, adapterId, actionId) !== undefined) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "Herdr actions mutate only through Herdr integration custody");
    }
    if (this.#database.prepare(`
      SELECT 1
        FROM provider_actions p
        JOIN chair_bridge_recovery_custody c
          ON c.provider_adapter_id=p.adapter_id AND c.provider_action_id=p.action_id
       WHERE p.run_id=? AND p.adapter_id=? AND p.action_id=?
    `).get(runId, adapterId, actionId) !== undefined) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "chair recovery provider actions mutate only through chair recovery custody");
    }
  }

  async #inspectLaunchAdapterContract(adapterId: string): Promise<LaunchAdapterContract> {
    const capabilities = await this.#requestAdapter(adapterId, "capabilities", {});
    assertAdapterOperation(capabilities, "launch_chair");
    if (!isRow(capabilities) || !Object.hasOwn(capabilities, "chairLaunch")) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "adapter does not advertise a chair launch contract");
    }
    return parseLaunchAdapterContract(capabilities.chairLaunch);
  }

  async #inspectAgentBridgeContract(
    adapterId: string,
    operation: "spawn" | "attach",
  ): Promise<AgentBridgeCapability | undefined> {
    const capabilities = await this.#requestAdapter(adapterId, "capabilities", {});
    assertAdapterOperation(capabilities, operation);
    if (!isRow(capabilities) || capabilities.agentBridge === undefined) return undefined;
    return parseAgentBridgeCapability(capabilities.agentBridge);
  }

  async #dispatchAgentAdapter(handle: AgentDispatchHandle): Promise<unknown> {
    if (handle.capability === undefined || handle.socketPath === undefined || handle.expectedPrincipal === undefined) {
      throw new FabricError("CAPABILITY_UNAVAILABLE", "agent bridge private handoff is unavailable");
    }
    return await this.#adapterSupervisor.provisionAgent(
      handle.adapterId,
      {
        schemaVersion: 1,
        runId: handle.runId,
        operation: handle.operation,
        actionId: handle.actionId,
        targetAgentId: handle.targetAgentId,
        authorityId: handle.authorityId,
        bridgeGeneration: handle.bridgeGeneration,
        bridgeContractDigest: handle.bridgeContractDigest,
        payload: handle.publicPayload,
        ...(handle.requestedProviderSessionRef === undefined
          ? {}
          : { providerSessionRef: handle.requestedProviderSessionRef }),
      },
      {
        capability: handle.capability,
        socketPath: handle.socketPath,
        expectedPrincipal: handle.expectedPrincipal,
      },
    );
  }

  async #attachWithoutBridge(handle: AgentDispatchHandle): Promise<unknown> {
    if (handle.operation !== "attach" || handle.requestedProviderSessionRef === undefined) {
      throw new FabricError("CAPABILITY_UNAVAILABLE", "bridge-less custody is attach-only");
    }
    const result = await this.#requestAdapter(handle.adapterId, "attach", {
      actionId: handle.actionId,
      resumeReference: handle.requestedProviderSessionRef,
      ...handle.publicPayload,
    });
    if (!isRow(result)) throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "adapter attach returned no typed result");
    return {
      providerSessionRef: typeof result.resumeReference === "string"
        ? result.resumeReference
        : handle.requestedProviderSessionRef,
      providerSessionGeneration: typeof result.providerSessionGeneration === "number"
        ? result.providerSessionGeneration
        : 1,
    };
  }

  #currentDaemonInstanceGeneration(): number {
    const current = this.#database.prepare(`
      SELECT instance_generation FROM daemon_runtime_epochs
       WHERE state IN ('starting','running','quiescing')
       ORDER BY instance_generation DESC LIMIT 1
    `).get();
    return isRow(current) && typeof current.instance_generation === "number"
      ? current.instance_generation
      : 1;
  }

  #launchResourceUsage(providerAdapterId: string, providerActionId: string): Record<string, "unknown"> {
    const reservation = rowOrNotFound(this.#database.prepare(`
      SELECT r.amounts_json
        FROM project_session_launch_custody c
        JOIN resource_reservations r ON r.reservation_id=c.reservation_id
       WHERE c.provider_adapter_id=? AND c.provider_action_id=?
    `).get(providerAdapterId, providerActionId), "launch resource reservation");
    const amounts: unknown = JSON.parse(stringField(reservation, "amounts_json"));
    if (!isRow(amounts) || Object.values(amounts).some((value) => !Number.isSafeInteger(value) || Number(value) < 0)) {
      throw new Error("launch reservation amounts are invalid");
    }
    return Object.fromEntries(Object.keys(amounts).sort().map((unit) => [unit, "unknown"]));
  }

  #terminalLaunchOutcome(
    handle: Pick<LaunchDispatchHandle, "providerAdapterId" | "providerActionId" | "providerContractDigest" | "attestationChallengeDigest">,
    raw: unknown,
    observationKind: "dispatch-return" | "lookup",
  ): unknown {
    const result = parseChairLaunchProviderResult(raw, {
      providerAdapterId: handle.providerAdapterId,
      providerActionId: handle.providerActionId,
      providerContractDigest: handle.providerContractDigest,
      challengeDigest: handle.attestationChallengeDigest,
    });
    const effectEvidence = {
      schemaVersion: 1,
      providerAdapterId: handle.providerAdapterId,
      providerActionId: handle.providerActionId,
      providerContractDigest: handle.providerContractDigest,
      resumeReference: result.resumeReference,
      providerSessionGeneration: result.providerSessionGeneration,
      fabricContinuity: result.fabricContinuity,
    };
    return {
      schemaVersion: 1,
      providerAdapterId: handle.providerAdapterId,
      providerActionId: handle.providerActionId,
      providerContractDigest: handle.providerContractDigest,
      observationKind,
      observedAt: new Date(this.#clock()).toISOString(),
      outcome: {
        kind: "terminal-success",
        providerSessionRef: result.resumeReference,
        providerSessionGeneration: result.providerSessionGeneration,
        effectDigest: sha256Digest(canonicalJson(effectEvidence)),
        resourceUsage: this.#launchResourceUsage(handle.providerAdapterId, handle.providerActionId),
      },
    };
  }

  #ambiguousLaunchOutcome(
    input: Pick<LaunchDispatchHandle, "providerAdapterId" | "providerActionId" | "providerContractDigest">,
    reasonCode: "absent" | "transport-error" | "adapter-error" | "malformed" | "incomplete" | "conflict" | "missing-resume-reference",
    evidence: unknown,
  ): unknown {
    return {
      schemaVersion: 1,
      providerAdapterId: input.providerAdapterId,
      providerActionId: input.providerActionId,
      providerContractDigest: input.providerContractDigest,
      observationKind: "lookup",
      observedAt: new Date(this.#clock()).toISOString(),
      outcome: {
        kind: "ambiguous",
        reasonCode,
        evidenceDigest: evidence === null ? null : sha256Digest(canonicalJson(evidence)),
      },
    };
  }

  async #dispatchLaunchAdapter(handle: LaunchDispatchHandle): Promise<unknown> {
    const result = await this.#adapterSupervisor.launchChair(
      handle.providerAdapterId,
      {
        schemaVersion: 1,
        actionId: handle.providerActionId,
        providerContractDigest: handle.providerContractDigest,
        payload: handle.publicPayload,
      },
      {
        capability: handle.capability,
        socketPath: handle.socketPath,
        attestationChallenge: handle.attestationChallenge,
        expectedPrincipal: handle.expectedPrincipal,
      },
    );
    if (!this.#adapterSupervisor.hasRetainedChairBridge({
      ...handle.expectedPrincipal,
      adapterId: handle.providerAdapterId,
      actionId: handle.providerActionId,
      providerSessionRef: result.resumeReference,
      providerSessionGeneration: result.providerSessionGeneration,
      bridgeGeneration: 1,
    })) {
      throw new ProviderAdapterError("CHAIR_BRIDGE_LOST", "chair bridge closed before launch activation");
    }
    return this.#terminalLaunchOutcome(handle, result, "dispatch-return");
  }

  async #dispatchChairRecoveryAdapter(handle: ChairRecoveryDispatchHandle): Promise<unknown> {
    if (
      handle.intent.path !== "rebind" || handle.capability === undefined ||
      handle.attestationChallenge === undefined || handle.socketPath === undefined
    ) throw new FabricError("CAPABILITY_UNAVAILABLE", "chair recovery private handoff is unavailable");
    const loss = rowOrNotFound(this.#database.prepare(`
      SELECT loss.*, action.payload_json
        FROM chair_bridge_losses loss
        JOIN provider_actions action
          ON action.adapter_id=loss.provider_adapter_id AND action.action_id=loss.provider_action_id
       WHERE loss.loss_id=?
    `).get(handle.intent.lossId), "chair recovery loss");
    const oldPayload: unknown = JSON.parse(stringField(loss, "payload_json"));
    const providerPayload = isRow(oldPayload) && isRow(oldPayload.input) ? oldPayload.input : {};
    const result = await this.#adapterSupervisor.recoverChair(
      handle.intent.providerAdapterId,
      {
        schemaVersion: 1,
        recoveryId: handle.recoveryId,
        lossId: handle.intent.lossId,
        actionId: handle.intent.providerActionId,
        providerContractDigest: handle.intent.providerContractDigest,
        resumeReference: stringField(loss, "provider_session_ref"),
        expectedProviderSessionGeneration: handle.intent.expectedProviderSessionGeneration,
        nextProviderSessionGeneration: handle.intent.expectedProviderSessionGeneration + 1,
        bridgeGeneration: handle.intent.expectedLostBridgeGeneration + 1,
        payload: providerPayload,
      },
      {
        capability: handle.capability,
        socketPath: handle.socketPath,
        attestationChallenge: handle.attestationChallenge,
        expectedPrincipal: {
          agentId: stringField(loss, "chair_agent_id"),
          projectSessionId: handle.intent.projectSessionId,
          runId: handle.intent.coordinationRunId,
          principalGeneration: handle.intent.expectedPrincipalGeneration + 1,
        },
      },
    );
    return {
      schemaVersion: 1,
      recoveryId: handle.recoveryId,
      providerAdapterId: handle.intent.providerAdapterId,
      providerActionId: handle.intent.providerActionId,
      providerContractDigest: handle.intent.providerContractDigest,
      providerSessionRef: result.resumeReference,
      providerSessionGeneration: result.providerSessionGeneration,
      activationEvidenceDigest: sha256Digest(canonicalJson(result.fabricContinuity)),
    };
  }

  async #lookupLaunchAdapter(input: Pick<
    LaunchDispatchHandle,
    "providerAdapterId" | "providerActionId" | "providerContractDigest" | "attestationChallengeDigest"
  >): Promise<unknown> {
    let record: unknown;
    try {
      record = await this.#requestAdapter(input.providerAdapterId, "lookup_action", {
        actionId: input.providerActionId,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "ACTION_NOT_FOUND") {
        return this.#ambiguousLaunchOutcome(input, "absent", null);
      }
      throw error;
    }
    if (!isRow(record)) return this.#ambiguousLaunchOutcome(input, "malformed", record);
    if (record.status === "terminal") {
      try {
        return this.#terminalLaunchOutcome(input, record.result, "lookup");
      } catch {
        return this.#ambiguousLaunchOutcome(input, "malformed", record);
      }
    }
    if (record.status === "ambiguous" || record.status === "accepted" || record.status === "dispatched" || record.status === "prepared") {
      return this.#ambiguousLaunchOutcome(input, "incomplete", record);
    }
    return this.#ambiguousLaunchOutcome(input, "conflict", record);
  }

  async recoverStartupState(): Promise<{
    actionsReconciled: number;
    actionsQuarantined: number;
    leasesQuarantined: number;
    sessionsDegraded: number;
    deliveriesReleased: number;
  }> {
    if (this.#lifecycleReceiptRecovery === undefined) {
      if (hasKnownLifecycleReceiptState(this.#database)) {
        throw new LifecycleReceiptRecoveryError(
          "RECOVERY_PENDING",
          "lifecycle receipt authority recovery is pending",
        );
      }
    } else {
      await this.#lifecycleReceiptRecovery.hydrateKnownProjects();
    }
    this.#results.recover();
    this.#notifications.recover();
    await this.#recoverLifecycleRotations();
    await this.#launchCustody?.recover();
    await this.#externalEffects?.recover();
    await this.#herdr.recover();
    if (this.#herdrConfigured) await this.#herdr.runPresencePass();
    await this.#typedGit.recover();
    const now = this.#clock();
    const deliveriesReleased = this.#database
      .prepare("UPDATE deliveries SET state = 'ready', claim_deadline = NULL WHERE state = 'claimed' AND claim_deadline <= ?")
      .run(now).changes;
    const expiredLeases = this.#database
      .prepare("SELECT run_id, lease_id, holder_agent_id FROM leases WHERE kind = 'write' AND status = 'active' AND expires_at <= ?")
      .all(now);
    this.#database.transaction(() => {
      for (const value of expiredLeases) {
        const lease = rowOrNotFound(value, "startup lease");
        this.#database.prepare("UPDATE leases SET status = 'quarantined', updated_at = ? WHERE run_id = ? AND lease_id = ?").run(now, stringField(lease, "run_id"), stringField(lease, "lease_id"));
        this.#event(stringField(lease, "run_id"), "startup-write-lease-quarantined", null, { leaseId: stringField(lease, "lease_id"), predecessorAgentId: stringField(lease, "holder_agent_id") });
      }
    })();
    let actionsReconciled = 0;
    let actionsQuarantined = 0;
    const pendingActions = this.#database.prepare(`
      SELECT p.run_id, p.action_id, p.adapter_id, p.status, p.updated_at, r.chair_agent_id
       FROM provider_actions p JOIN runs r ON r.run_id = p.run_id
       WHERE p.status IN ('prepared', 'dispatched', 'ambiguous')
         AND p.adapter_id<>?
         AND json_type(p.payload_json, '$.operatorCommandId') IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM project_session_launch_custody c
            WHERE c.provider_adapter_id=p.adapter_id AND c.provider_action_id=p.action_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM provider_agent_custody c
            WHERE c.adapter_id=p.adapter_id AND c.action_id=p.action_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM lifecycle_rotation_custodies custody
            WHERE custody.run_id=p.run_id
              AND custody.provider_action_adapter_id=p.adapter_id
              AND custody.provider_action_id=p.action_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM chair_bridge_recovery_custody c
            WHERE c.provider_adapter_id=p.adapter_id AND c.provider_action_id=p.action_id
         )
       ORDER BY p.updated_at, p.action_id
    `).all(HERDR_CONTROL_ADAPTER_ID);
    for (const value of pendingActions) {
      const action = rowOrNotFound(value, "startup provider action");
      const runId = stringField(action, "run_id");
      const actionId = stringField(action, "action_id");
      try {
        const result = await this.reconcileProviderAction(runId, stringField(action, "chair_agent_id"), {
          adapterId: stringField(action, "adapter_id"),
          actionId,
          commandId: `startup-recovery:${actionId}:${stringField(action, "status")}:${numberField(action, "updated_at")}`,
        });
        if (result.status === "quarantined") actionsQuarantined += 1;
        else actionsReconciled += 1;
      } catch (error: unknown) {
        this.#database.prepare("UPDATE provider_actions SET status = 'quarantined', updated_at = ? WHERE run_id = ? AND adapter_id = ? AND action_id = ?")
          .run(now, runId, stringField(action, "adapter_id"), actionId);
        this.#event(runId, "startup-provider-action-quarantined", null, { actionId, adapterId: stringField(action, "adapter_id"), reason: error instanceof Error ? error.message : String(error) });
        actionsQuarantined += 1;
      }
    }
    let sessionsDegraded = 0;
    const sessions = this.#database.prepare(`
      SELECT a.run_id,a.agent_id,a.provider_session_ref,b.adapter_id,
             run.project_session_id,bridge.action_id,bridge.bridge_generation,
             bridge.revision AS bridge_revision,bridge.capability_hash,
             custody.bridge_contract_digest,capability.principal_generation,
             provider.provider_session_generation,
             CAST(provider.context_revision AS TEXT) AS context_revision
        FROM agents a
        JOIN runs run ON run.run_id=a.run_id
        JOIN agent_adapter_bindings b ON b.run_id=a.run_id AND b.agent_id=a.agent_id
        JOIN agent_bridge_state bridge
          ON bridge.run_id=a.run_id AND bridge.agent_id=a.agent_id
         AND bridge.adapter_id=b.adapter_id AND bridge.bridge_state='active'
         AND bridge.provider_session_ref=a.provider_session_ref
        JOIN provider_agent_custody custody
          ON custody.run_id=bridge.run_id AND custody.adapter_id=bridge.adapter_id
         AND custody.action_id=bridge.action_id AND custody.target_agent_id=bridge.agent_id
         AND custody.capability_hash=bridge.capability_hash
        JOIN capabilities capability
          ON capability.token_hash=bridge.capability_hash AND capability.run_id=a.run_id
         AND capability.agent_id=a.agent_id AND capability.revoked_at IS NULL
        JOIN provider_state provider ON provider.run_id=a.run_id AND provider.agent_id=a.agent_id
       WHERE a.provider_session_ref IS NOT NULL AND a.lifecycle NOT IN ('archived', 'suspended')
         AND NOT EXISTS (
           SELECT 1 FROM project_session_launch_custody launch
            WHERE launch.coordination_run_id=a.run_id AND launch.chair_agent_id=a.agent_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM lifecycle_rotation_custody_heads rotation
            WHERE rotation.run_id=a.run_id AND rotation.agent_id=a.agent_id AND rotation.terminal=0
         )
         AND NOT EXISTS (
           SELECT 1 FROM lifecycle_generation_loss_heads loss
            WHERE loss.run_id=a.run_id AND loss.agent_id=a.agent_id AND loss.terminal=0
         )
    `).all();
    for (const value of sessions) {
      const session = rowOrNotFound(value, "startup provider session");
      const runId = stringField(session, "run_id");
      const agentId = stringField(session, "agent_id");
      try {
        const status = await this.#requestAdapter(stringField(session, "adapter_id"), "status", {
          agentId,
          providerSessionRef: stringField(session, "provider_session_ref"),
        });
        if (!isRow(status)) throw new Error("adapter returned an invalid provider session status");
        if (status.healthy !== true) throw new Error("adapter did not prove the persisted provider session healthy");
        if (status.matches !== undefined && typeof status.matches !== "boolean") {
          throw new Error("adapter returned an invalid provider session match value");
        }
        if (status.matches === false) {
          throw new Error("adapter no longer manages the persisted provider session");
        }
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        const storedContextRevision = session.context_revision;
        const currentContextRevision = storedContextRevision === null
          ? 0
          : typeof storedContextRevision === "bigint"
          ? Number(storedContextRevision)
          : typeof storedContextRevision === "number"
            ? storedContextRevision
            : typeof storedContextRevision === "string"
              ? Number(storedContextRevision)
              : Number.NaN;
        if (!Number.isSafeInteger(currentContextRevision) || currentContextRevision < 0) {
          throw new Error("startup provider context revision is invalid");
        }
        const contextRevision = currentContextRevision + 1;
        const evidence = {
          schemaVersion: 1,
          kind: "startup-provider-session-loss",
          runId,
          agentId,
          adapterId: stringField(session, "adapter_id"),
          providerSessionRef: stringField(session, "provider_session_ref"),
          providerSessionGeneration: numberField(session, "provider_session_generation"),
          contextRevision,
          reason,
        };
        const evidenceDigest = sha256Digest(canonicalJson(evidence));
        this.#database.transaction(() => {
          this.#generationLosses.recordObservationInCurrentTransaction({
            sourceEventId: `startup-provider-session-loss:${runId}:${agentId}:${contextRevision}`,
            projectSessionId: stringField(session, "project_session_id"),
            runId,
            agentId,
            providerGeneration: numberField(session, "provider_session_generation"),
            contextRevision,
            evidenceDigest,
            observedAt: this.#clock(),
            lossSource: {
              oldProviderSessionRef: stringField(session, "provider_session_ref"),
              newProviderSessionRef: stringField(session, "provider_session_ref"),
              sourceActionRef: {
                adapterId: stringField(session, "adapter_id"),
                actionId: stringField(session, "action_id"),
              },
              sourceAdapterContractDigest: stringField(session, "bridge_contract_digest"),
              sourcePrincipalGeneration: numberField(session, "principal_generation"),
              sourceBridgeGeneration: numberField(session, "bridge_generation"),
              bridgeOwnerKind: "child",
              sourceBridgeRowId: `${runId}:${agentId}`,
              sourceBridgeRevision: numberField(session, "bridge_revision"),
              sourceCapabilityHash: stringField(session, "capability_hash"),
              sourceProjectSessionGeneration: null,
              sourceRunGeneration: null,
              sourceChairLeaseGeneration: null,
              checkpoint: { state: "absent", ref: null, digest: null },
            },
          });
          const provider = this.#database.prepare(`
            UPDATE provider_state SET context_revision=?,reconciled_checkpoint_sha256=NULL
             WHERE run_id=? AND agent_id=? AND provider_session_generation=?
               AND COALESCE(CAST(context_revision AS INTEGER),0)=?
          `).run(
            contextRevision, runId, agentId,
            numberField(session, "provider_session_generation"), contextRevision - 1,
          );
          if (provider.changes !== 1) throw new Error("startup provider context changed before generation-loss commit");
          const agent = this.#database.prepare(`
            UPDATE agents SET lifecycle='context-unreconciled'
             WHERE run_id=? AND agent_id=? AND lifecycle NOT IN ('archived','suspended','context-unreconciled')
          `).run(runId, agentId);
          if (agent.changes !== 1) throw new Error("startup provider agent changed before generation-loss commit");
          this.#database.prepare(`
            INSERT INTO delivery_freezes(run_id,agent_id,reason,created_at)
            VALUES (?,?,'context-unreconciled',?)
            ON CONFLICT(run_id,agent_id) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at
          `).run(runId, agentId, this.#clock());
          this.#database.prepare(`
            UPDATE leases SET status='quarantined',updated_at=?
             WHERE run_id=? AND holder_agent_id=? AND status='active'
          `).run(this.#clock(), runId, agentId);
          this.#database.prepare(`
            UPDATE provider_session_turn_leases SET status='quarantined',updated_at=?
             WHERE run_id=? AND agent_id=? AND status='active'
          `).run(this.#clock(), runId, agentId);
        }).immediate();
        this.#event(runId, "startup-provider-session-degraded", null, { agentId, reason, evidenceDigest });
        sessionsDegraded += 1;
      }
    }
    return { actionsReconciled, actionsQuarantined, leasesQuarantined: expiredLeases.length, sessionsDegraded, deliveriesReleased };
  }

  bindCurrentMcpSeats(input: CurrentMcpSeatBindingInput): CurrentMcpSeatBindingResult {
    const canonicalRoot = canonicalWorkspaceRoot(input.canonicalRoot);
    if (canonicalRoot !== input.canonicalRoot) {
      throw new FabricError("AUTHORITY_WIDENING", "MCP binding requires the exact canonical project root");
    }
    if (!this.#workspaceRoots.some((root) => pathContains(root, canonicalRoot))) {
      throw new FabricError("AUTHORITY_WIDENING", "MCP binding project root is not configured");
    }
    const expiresAt = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== input.expiresAt || expiresAt <= this.#clock()) {
      throw new FabricError("AUTHENTICATION_FAILED", "MCP seat credential expiry is invalid or elapsed");
    }
    if (input.bindings.length === 0) throw new FabricError("DEDUPE_CONFLICT", "MCP seat binding roster is empty");
    const seatIds = input.bindings.map(({ seat }) => seat);
    const agentIds = input.bindings.map(({ agentId }) => agentId);
    if (new Set(seatIds).size !== seatIds.length || new Set(agentIds).size !== agentIds.length) {
      throw new FabricError("DEDUPE_CONFLICT", "MCP seat bindings must name distinct seats and agents");
    }
    const chairBinding = input.bindings.find(({ agentId }) => agentId === input.chairAgentId);
    if (chairBinding === undefined) {
      throw new FabricError("DEDUPE_CONFLICT", "MCP seat bindings do not contain the exact current chair");
    }
    const derivedGeneration = currentMcpSeatGeneration({
      canonicalRoot,
      projectSessionId: input.projectSessionId,
      sessionRevision: input.expectedSessionRevision,
      sessionGeneration: input.expectedSessionGeneration,
      runId: input.runId,
      runRevision: input.expectedRunRevision,
      chairAgentId: input.chairAgentId,
      chairGeneration: input.expectedChairGeneration,
      chairLeaseId: input.chairLeaseId,
      expiresAt: input.expiresAt,
      bindings: input.bindings,
    });
    if (input.generation !== derivedGeneration.generation) {
      throw new FabricError("DEDUPE_CONFLICT", "MCP seat generation does not match its immutable binding");
    }

    return this.#database.transaction((): CurrentMcpSeatBindingResult => {
      const identity = rowOrNotFound(this.#database.prepare(`
        SELECT project.project_id, project.canonical_root, session.state AS session_state,
               session.revision AS session_revision, session.generation AS session_generation,
               session.origin_kind, session.origin_operator_id,
               run.lifecycle_state AS run_state, run.revision AS run_revision,
               run.chair_agent_id, run.chair_generation, run.chair_lease_id,
               lease.holder_agent_id, lease.generation AS lease_generation, lease.status AS lease_status
          FROM project_sessions session
          JOIN projects project ON project.project_id=session.project_id
          JOIN runs run ON run.project_session_id=session.project_session_id
          JOIN run_chair_leases lease
            ON lease.project_session_id=run.project_session_id
           AND lease.run_id=run.run_id
           AND lease.lease_id=run.chair_lease_id
         WHERE session.project_session_id=? AND run.run_id=?
      `).get(input.projectSessionId, input.runId), "current MCP project-session/run identity");
      const currentStates = new Set(["active", "visibility_degraded"]);
      if (
        stringField(identity, "canonical_root") !== canonicalRoot ||
        numberField(identity, "session_revision") !== input.expectedSessionRevision ||
        numberField(identity, "session_generation") !== input.expectedSessionGeneration ||
        numberField(identity, "run_revision") !== input.expectedRunRevision ||
        stringField(identity, "chair_agent_id") !== input.chairAgentId ||
        numberField(identity, "chair_generation") !== input.expectedChairGeneration ||
        stringField(identity, "chair_lease_id") !== input.chairLeaseId ||
        stringField(identity, "holder_agent_id") !== input.chairAgentId ||
        numberField(identity, "lease_generation") !== input.expectedChairGeneration
      ) {
        throw new FabricError("DEDUPE_CONFLICT", "MCP binding identity is stale or crossed");
      }
      if (
        stringField(identity, "origin_kind") !== "operator-launch" ||
        typeof identity.origin_operator_id !== "string" ||
        !currentStates.has(stringField(identity, "session_state")) ||
        !currentStates.has(stringField(identity, "run_state")) ||
        stringField(identity, "lease_status") !== "active"
      ) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "MCP binding target is not a current active operator-launched run");
      }

      const projectId = stringField(identity, "project_id");
      const activeValue = this.#database.prepare(`
        SELECT generation FROM mcp_active_seat_generations WHERE project_id=?
      `).get(projectId);
      const activeGeneration = activeValue === undefined
        ? null
        : stringField(rowOrNotFound(activeValue, "active MCP seat generation"), "generation");
      const storedValue = this.#database.prepare(`
        SELECT project_id,project_session_id,session_revision,session_generation,
               run_id,run_revision,chair_agent_id,chair_generation,chair_lease_id,
               previous_generation,binding_json,expires_at
          FROM mcp_seat_generations WHERE generation=?
      `).get(input.generation);
      const replay = storedValue !== undefined;
      if (replay) {
        const stored = rowOrNotFound(storedValue, "stored MCP seat generation");
        if (
          activeGeneration !== input.generation ||
          stored.project_id !== projectId ||
          stored.project_session_id !== input.projectSessionId ||
          stored.session_revision !== input.expectedSessionRevision ||
          stored.session_generation !== input.expectedSessionGeneration ||
          stored.run_id !== input.runId ||
          stored.run_revision !== input.expectedRunRevision ||
          stored.chair_agent_id !== input.chairAgentId ||
          stored.chair_generation !== input.expectedChairGeneration ||
          stored.chair_lease_id !== input.chairLeaseId ||
          stored.previous_generation !== input.expectedPreviousGeneration ||
          stored.binding_json !== derivedGeneration.bindingJson ||
          stored.expires_at !== expiresAt
        ) {
          throw new FabricError("DEDUPE_CONFLICT", "MCP seat generation replay is stale, crossed or changed");
        }
      } else {
        if (activeGeneration !== input.expectedPreviousGeneration) {
          throw new FabricError("DEDUPE_CONFLICT", "active MCP seat generation changed");
        }
        if (input.expectedPreviousGeneration === input.generation) {
          throw new FabricError("DEDUPE_CONFLICT", "MCP seat generation cannot replace itself");
        }
        this.#database.prepare(`
          INSERT INTO mcp_seat_generations(
            generation,project_id,project_session_id,session_revision,session_generation,
            run_id,run_revision,chair_agent_id,chair_generation,chair_lease_id,previous_generation,
            binding_json,binding_digest,expires_at,created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          input.generation,
          projectId,
          input.projectSessionId,
          input.expectedSessionRevision,
          input.expectedSessionGeneration,
          input.runId,
          input.expectedRunRevision,
          input.chairAgentId,
          input.expectedChairGeneration,
          input.chairLeaseId,
          input.expectedPreviousGeneration,
          derivedGeneration.bindingJson,
          `sha256:${input.generation}`,
          expiresAt,
          this.#clock(),
        );
      }

      const credentials = input.bindings
        .slice()
        .sort((left, right) => left.seat.localeCompare(right.seat))
        .map((binding) => {
          const agent = rowOrNotFound(this.#database.prepare(`
            SELECT agent.lifecycle, authority.authority_json, authority.authority_hash,
                   MAX(capability.principal_generation) AS principal_generation
              FROM agents agent
              JOIN authorities authority ON authority.authority_id=agent.authority_id
              JOIN capabilities capability
                ON capability.run_id=agent.run_id AND capability.agent_id=agent.agent_id
             WHERE agent.run_id=? AND agent.agent_id=?
               AND capability.revoked_at IS NULL AND capability.expires_at>?
             GROUP BY agent.lifecycle, authority.authority_json, authority.authority_hash
          `).get(input.runId, binding.agentId, this.#clock()), `current MCP agent ${binding.agentId}`);
          if (agent.lifecycle === "archived" || agent.lifecycle === "suspended") {
            throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", `MCP agent ${binding.agentId} is not active`);
          }
          const principalGeneration = numberField(agent, "principal_generation");
          if (principalGeneration !== binding.expectedPrincipalGeneration) {
            throw new FabricError("STALE_PRINCIPAL_GENERATION", `MCP agent ${binding.agentId} principal generation changed`);
          }
          const authority = parseAuthority(agent);
          if (Date.parse(authority.expiresAt) < expiresAt) {
            throw new FabricError("AUTHORITY_WIDENING", `MCP credential for ${binding.agentId} outlives its authority`);
          }
          const capability = `afc_${createHmac("sha256", this.#capabilityKey)
            .update(canonicalJson({
              kind: "current-mcp-seat",
              canonicalRoot,
              projectSessionId: input.projectSessionId,
              sessionRevision: input.expectedSessionRevision,
              sessionGeneration: input.expectedSessionGeneration,
              runId: input.runId,
              runRevision: input.expectedRunRevision,
              chairAgentId: input.chairAgentId,
              chairGeneration: input.expectedChairGeneration,
              chairLeaseId: input.chairLeaseId,
              generation: input.generation,
              expiresAt: input.expiresAt,
              ...binding,
            }))
            .digest("base64url")}`;
          const tokenHash = sha256(capability);
          const existing = this.#database.prepare(`
            SELECT run_id, agent_id, principal_generation, expires_at, revoked_at
              FROM capabilities WHERE token_hash=?
          `).get(tokenHash);
          if (existing === undefined) {
            if (replay) {
              throw new FabricError("DEDUPE_CONFLICT", `MCP credential replay is missing for ${binding.agentId}`);
            }
            this.#database.prepare(`
              INSERT INTO capabilities(token_hash, run_id, agent_id, principal_generation, expires_at)
              VALUES (?, ?, ?, ?, ?)
            `).run(tokenHash, input.runId, binding.agentId, principalGeneration, expiresAt);
          } else if (
            !isRow(existing) ||
            existing.run_id !== input.runId ||
            existing.agent_id !== binding.agentId ||
            existing.principal_generation !== principalGeneration ||
            existing.expires_at !== expiresAt ||
            existing.revoked_at !== null
          ) {
            throw new FabricError("DEDUPE_CONFLICT", `MCP credential replay changed for ${binding.agentId}`);
          }
          const member = this.#database.prepare(`
            SELECT run_id,agent_id,principal_generation,token_hash,expires_at
              FROM mcp_seat_generation_members WHERE generation=? AND seat=?
          `).get(input.generation, binding.seat);
          if (replay) {
            if (
              !isRow(member) ||
              member.run_id !== input.runId ||
              member.agent_id !== binding.agentId ||
              member.principal_generation !== principalGeneration ||
              member.token_hash !== tokenHash ||
              member.expires_at !== expiresAt
            ) {
              throw new FabricError("DEDUPE_CONFLICT", `MCP seat generation replay changed for ${binding.seat}`);
            }
          } else {
            this.#database.prepare(`
              INSERT INTO mcp_seat_generation_members(
                generation,seat,run_id,agent_id,principal_generation,token_hash,expires_at
              ) VALUES (?,?,?,?,?,?,?)
            `).run(
              input.generation,
              binding.seat,
              input.runId,
              binding.agentId,
              principalGeneration,
              tokenHash,
              expiresAt,
            );
          }
          return { ...binding, capability };
        });
      if (!replay) {
        if (input.expectedPreviousGeneration !== null) {
          this.#database.prepare(`
            UPDATE capabilities SET revoked_at=?
             WHERE revoked_at IS NULL AND token_hash IN (
               SELECT token_hash FROM mcp_seat_generation_members WHERE generation=?
             )
          `).run(this.#clock(), input.expectedPreviousGeneration);
          const updated = this.#database.prepare(`
            UPDATE mcp_active_seat_generations
               SET generation=?,activated_at=?
             WHERE project_id=? AND generation=?
          `).run(input.generation, this.#clock(), projectId, input.expectedPreviousGeneration);
          if (updated.changes !== 1) {
            throw new FabricError("DEDUPE_CONFLICT", "active MCP seat generation changed during rotation");
          }
        } else {
          this.#database.prepare(`
            INSERT INTO mcp_active_seat_generations(project_id,generation,activated_at)
            VALUES (?,?,?)
          `).run(projectId, input.generation, this.#clock());
        }
      }
      return {
        expectedPreviousGeneration: input.expectedPreviousGeneration,
        generation: input.generation,
        projectSessionId: input.projectSessionId,
        sessionRevision: input.expectedSessionRevision,
        sessionGeneration: input.expectedSessionGeneration,
        runId: input.runId,
        runRevision: input.expectedRunRevision,
        chairAgentId: input.chairAgentId,
        chairGeneration: input.expectedChairGeneration,
        chairLeaseId: input.chairLeaseId,
        expiresAt: input.expiresAt,
        credentials,
      };
    })();
  }

  connect(token: string): FabricClient {
    const row = rowOrNotFound(
      this.#database
        .prepare(`
          SELECT capability.run_id,capability.agent_id,capability.expires_at,capability.revoked_at,
                 member.generation AS mcp_seat_generation,
                 active.generation AS active_mcp_seat_generation
            FROM capabilities capability
            LEFT JOIN mcp_seat_generation_members member ON member.token_hash=capability.token_hash
            LEFT JOIN current_mcp_seat_generation_members active ON active.token_hash=capability.token_hash
           WHERE capability.token_hash=?
        `)
        .get(sha256(token)),
      "capability",
    );
    if (row.revoked_at !== null || numberField(row, "expires_at") <= this.#clock()) {
      throw new FabricError("AUTHENTICATION_FAILED", "capability is expired or revoked");
    }
    assertActiveMcpSeatGeneration(row);
    return new FabricClient(this, stringField(row, "run_id"), stringField(row, "agent_id"), sha256(token));
  }

  verifyProtocolCredential(token: string): VerifiedProtocolCredential {
    const authenticated = this.#database.prepare(`
      SELECT c.run_id, c.agent_id, c.principal_generation, c.expires_at, c.revoked_at,
             a.authority_json, a.authority_hash, r.project_session_id,
             member.generation AS mcp_seat_generation,
             active.generation AS active_mcp_seat_generation
        FROM capabilities c
        JOIN agents g ON g.run_id=c.run_id AND g.agent_id=c.agent_id
        JOIN authorities a ON a.authority_id=g.authority_id
        JOIN runs r ON r.run_id=c.run_id
        LEFT JOIN mcp_seat_generation_members member ON member.token_hash=c.token_hash
        LEFT JOIN current_mcp_seat_generation_members active ON active.token_hash=c.token_hash
       WHERE c.token_hash=?
    `).get(sha256(token));
    if (!isRow(authenticated)) {
      const operator = this.#operatorStore.authenticateCredential(token);
      return {
        principal: {
          kind: "operator",
          operatorId: operator.context.operatorId,
          projectId: operator.context.projectId,
          projectAuthorityGeneration: operator.context.projectAuthorityGeneration,
          principalGeneration: operator.context.principalGeneration,
        },
        grantedOperations: operatorOperationsForActions(operator.actions),
      };
    }
    if (authenticated.revoked_at !== null || numberField(authenticated, "expires_at") <= this.#clock()) {
      throw new FabricError("AUTHENTICATION_FAILED", "protocol credential is expired or revoked");
    }
    assertActiveMcpSeatGeneration(authenticated);
    const authority = parseAuthority(authenticated);
    const denied = new Set(authority.deniedActions);
    return {
      principal: {
        kind: "agent",
        agentId: stringField(authenticated, "agent_id") as never,
        projectSessionId: stringField(authenticated, "project_session_id") as never,
        runId: stringField(authenticated, "run_id"),
        principalGeneration: numberField(authenticated, "principal_generation"),
      },
      grantedOperations: authority.actions.filter((operation) => !denied.has(operation)),
    };
  }

  async dispatchPublicProtocol(
    context: PublicProtocolContext,
    operation: ProtocolOperation,
    input: OperationInputMap[ProtocolOperation],
  ): Promise<unknown> {
    if (!context.allowedOperations.has(operation)) {
      throw new FabricError("CAPABILITY_FORBIDDEN", `connection does not permit ${operation}`);
    }
    if (context.principal.kind === "agent") {
      const definition = OPERATION_REGISTRY[operation];
      if (!definition.principals.includes("agent")) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "operation is not available to agent principals");
      }
      this.assertCapability(
        context.principal.runId,
        context.principal.agentId,
        context.credentialHash,
        operation,
      );
      if (definition.gateOwner !== "scoped-gate") {
        assertScopedOperationAllowed(
          this.#database,
          context.principal.runId,
          operation,
          this.#agentOperationGateTarget(
            context.principal.runId,
            context.principal.agentId,
            operation,
            input,
          ),
        );
      }
      if (definition.kind === "baseline") {
        return dispatchAgentProtocol(
          new FabricClient(
            this,
            context.principal.runId,
            context.principal.agentId,
            context.credentialHash,
          ),
          operation as never,
          input as never,
        );
      }
      const agent = {
        agentId: context.principal.agentId,
        projectSessionId: context.principal.projectSessionId,
        coordinationRunId: context.principal.runId as never,
        principalGeneration: context.principal.principalGeneration,
      };
      switch (operation) {
        case FABRIC_OPERATIONS.membershipBind: {
          const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.membershipBind];
          if (request.origin !== "chair") {
            throw new FabricError("CAPABILITY_FORBIDDEN", "agent membership binding requires chair origin");
          }
          return this.#projectSessions.bindMembership(agent, request);
        }
        case FABRIC_OPERATIONS.intakeRevise: {
          const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.intakeRevise];
          if (request.origin !== "chair") {
            throw new FabricError("CAPABILITY_FORBIDDEN", "agent intake revision requires chair origin");
          }
          return this.#intakes.revise(agent, request);
        }
        case FABRIC_OPERATIONS.scopedGateCreate: {
          const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.scopedGateCreate];
          if (request.origin !== "chair") {
            throw new FabricError("CAPABILITY_FORBIDDEN", "agent gate creation requires chair origin");
          }
          const existing = this.#gates.getGateByDedupe(
            agent,
            request.intent.projectSessionId,
            request.intent.coordinationRunId,
            request.intent.dedupeKey,
          );
          if (existing?.status === "superseded" && existing.resolution.kind === "system-supersession" &&
            !context.features.includes(GATE_SYSTEM_SUPERSESSION_FEATURE)) {
            throw new ProjectFabricCoreError("FEATURE_UNAVAILABLE", "gate system-supersession result shape was not negotiated");
          }
          return this.#gates.createGate(agent, request);
        }
        case FABRIC_OPERATIONS.scopedGateCheck:
          return this.#gates.check(
            agent,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.scopedGateCheck],
          );
        case FABRIC_OPERATIONS.resourceReserve:
          return this.#resources.reserve(
            agent,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.resourceReserve],
          );
        case FABRIC_OPERATIONS.resourceRelease:
          return this.#resources.release(
            agent,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.resourceRelease],
          );
        case FABRIC_OPERATIONS.resourceReconcile:
          return this.#resources.reconcile(
            agent,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.resourceReconcile],
          );
        case FABRIC_OPERATIONS.workstreamCreate:
          return this.#workstreams.create(
            agent,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.workstreamCreate],
          );
        case FABRIC_OPERATIONS.workstreamSettle:
          return this.#workstreams.settle(
            agent,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.workstreamSettle],
          );
        case FABRIC_OPERATIONS.taskRequest:
          return this.#results.request(
            agent,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.taskRequest],
          );
        case FABRIC_OPERATIONS.taskCompleteWithReply:
          return this.#results.completeWithReply(
            agent,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.taskCompleteWithReply],
          );
        case FABRIC_OPERATIONS.resultDeliveryClaim:
          return this.#results.claim(
            agent,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.resultDeliveryClaim],
          );
        case FABRIC_OPERATIONS.resultDeliveryConsume:
          return this.#results.consume(
            agent,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.resultDeliveryConsume],
          );
        case FABRIC_OPERATIONS.resultDeliveryRetry:
          return this.#results.retry(
            agent,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.resultDeliveryRetry],
          );
        case FABRIC_OPERATIONS.resultDeliveryReassign:
          return this.#results.reassign(
            agent,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.resultDeliveryReassign],
          );
        case FABRIC_OPERATIONS.resultDeliveryAbandon:
          return this.#results.abandon(
            agent,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.resultDeliveryAbandon],
          );
        case FABRIC_OPERATIONS.evidencePublish:
          return this.publishEvidence(
            context.principal.runId,
            context.principal.agentId,
            input as OperationInputMap[typeof FABRIC_OPERATIONS.evidencePublish],
          );
        case FABRIC_OPERATIONS.herdrSteerDispatch: {
          const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.herdrSteerDispatch];
          const run = rowOrNotFound(this.#database.prepare(`
            SELECT session.project_id, coordination.project_session_id
              FROM runs coordination
              JOIN project_sessions session
                ON session.project_session_id=coordination.project_session_id
             WHERE coordination.run_id=?
          `).get(context.principal.runId), "Herdr steering coordination run");
          const result = await this.#herdr.executeDirectSteer({
            ...request,
            reference: {
              ...request.reference,
              projectId: stringField(run, "project_id") as never,
              projectSessionId: context.principal.projectSessionId,
              coordinationRunId: context.principal.runId as never,
            },
          });
          return publicHerdrSteerResult(result);
        }
        default:
          throw Object.assign(new Error(`agent protocol operation is not wired: ${operation}`), {
            code: "PROTOCOL_UNSUPPORTED",
          });
      }
    }
    const operatorCredential = (): AuthenticatedOperatorCredential => {
      if (context.principal.kind !== "operator") {
        throw new FabricError("CAPABILITY_FORBIDDEN", "operation requires an operator principal");
      }
      const credential = this.#operatorStore.authenticateCredentialHash(context.credentialHash);
      if (
        credential.context.operatorId !== context.principal.operatorId ||
        credential.context.projectId !== context.principal.projectId ||
        credential.context.projectAuthorityGeneration !== context.principal.projectAuthorityGeneration ||
        credential.context.principalGeneration !== context.principal.principalGeneration
      ) {
        throw new FabricError("AUTHENTICATION_FAILED", "operator connection principal changed");
      }
      return credential;
    };
    const operatorCommand = (
      credential: AuthenticatedOperatorCredential,
      command: { credential: { capabilityId: string; token: string } },
    ): void => {
      if (
        command.credential.capabilityId !== credential.capabilityId ||
        sha256(command.credential.token) !== context.credentialHash
      ) {
        throw new FabricError("AUTHENTICATION_FAILED", "operator command credential differs from its connection");
      }
    };

    switch (operation) {
      case FABRIC_OPERATIONS.projectSessionCreate: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.projectSessionCreate];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        if (request.projectId !== credential.context.projectId) throw new ProjectFabricCoreError("WRONG_PROJECT", "session is outside the operator project");
        return this.#projectSessions.createProjectSession(credential.context, request);
      }
      case FABRIC_OPERATIONS.projectSessionGet: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.projectSessionGet];
        const credential = operatorCredential();
        if (request.projectId !== credential.context.projectId) throw new ProjectFabricCoreError("WRONG_PROJECT", "session is outside the operator project");
        return this.#projectSessions.getProjectSession(request);
      }
      case FABRIC_OPERATIONS.projectSessionTransition: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.projectSessionTransition];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        return this.#projectSessions.transitionProjectSession(credential.context, request);
      }
      case FABRIC_OPERATIONS.projectSessionClose: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.projectSessionClose];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        return this.#projectSessions.closeProjectSession(credential.context, request);
      }
      case FABRIC_OPERATIONS.membershipBind: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.membershipBind];
        if (request.origin !== "operator") throw new FabricError("CAPABILITY_FORBIDDEN", "agent membership binding uses the chair dispatcher");
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        return this.#projectSessions.bindMembership(credential.context, request);
      }
      case FABRIC_OPERATIONS.operatorAttach: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.operatorAttach];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        return this.#operatorStore.attach(credential.context, request, context.daemonInstanceGeneration);
      }
      case FABRIC_OPERATIONS.operatorDetach: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.operatorDetach];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        return this.#operatorStore.detach(credential.context, request);
      }
      case FABRIC_OPERATIONS.operatorHeartbeat: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.operatorHeartbeat];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        return this.#operatorStore.heartbeat(credential.context, request);
      }
      case FABRIC_OPERATIONS.intakeDraftCreate: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.intakeDraftCreate];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        return this.#intakes.createDraft(credential.context, request);
      }
      case FABRIC_OPERATIONS.intakeRead: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.intakeRead];
        const credential = operatorCredential();
        if (
          request.credential.capabilityId !== credential.capabilityId ||
          sha256(request.credential.token) !== context.credentialHash
        ) throw new FabricError("AUTHENTICATION_FAILED", "intake read credential differs from its connection");
        const intake = this.#intakes.get(request.intakeId);
        if (intake.projectId !== credential.context.projectId) throw new ProjectFabricCoreError("WRONG_PROJECT", "intake is outside the operator project");
        return intake;
      }
      case FABRIC_OPERATIONS.intakeSubmit: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.intakeSubmit];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        return this.#intakes.submit(credential.context, request);
      }
      case FABRIC_OPERATIONS.intakeRevise: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.intakeRevise];
        if (request.origin !== "operator") {
          throw new FabricError("CAPABILITY_FORBIDDEN", "agent intake revision uses the chair dispatcher");
        }
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        return this.#intakes.revise(credential.context, request);
      }
      case FABRIC_OPERATIONS.scopedGateCreate: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.scopedGateCreate];
        if (request.origin !== "operator") {
          throw new FabricError("CAPABILITY_FORBIDDEN", "operator gate creation requires operator origin");
        }
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        const existing = this.#gates.getGateByDedupe(
          credential.context,
          request.intent.projectSessionId,
          request.intent.coordinationRunId,
          request.intent.dedupeKey,
        );
        if (existing?.status === "superseded" && existing.resolution.kind === "system-supersession" &&
          !context.features.includes(GATE_SYSTEM_SUPERSESSION_FEATURE)) {
          throw new ProjectFabricCoreError("FEATURE_UNAVAILABLE", "gate system-supersession result shape was not negotiated");
        }
        const gate = this.#gates.createGate(credential.context, request);
        if (gate.status === "superseded" && gate.resolution.kind === "system-supersession" &&
          !context.features.includes(GATE_SYSTEM_SUPERSESSION_FEATURE)) {
          throw new ProjectFabricCoreError("FEATURE_UNAVAILABLE", "gate system-supersession result shape was not negotiated");
        }
        return gate;
      }
      case FABRIC_OPERATIONS.scopedGateResolve: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.scopedGateResolve];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        return this.#gates.resolveGate(credential.context, request);
      }
      case FABRIC_OPERATIONS.scopedGateRead: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.scopedGateRead];
        const credential = operatorCredential();
        if (
          request.credential.capabilityId !== credential.capabilityId ||
          sha256(request.credential.token) !== context.credentialHash
        ) {
          throw new FabricError("AUTHENTICATION_FAILED", "gate read credential differs from its connection");
        }
        if (request.projectId !== credential.context.projectId) {
          throw new ProjectFabricCoreError("WRONG_PROJECT", "gate is outside the operator project");
        }
        const gate = this.#gates.getGate(request.gateId);
        if (gate.projectSessionId !== request.projectSessionId) {
          throw new ProjectFabricCoreError("WRONG_PROJECT", "gate is outside the requested session");
        }
        if (gate.status === "superseded" && gate.resolution.kind === "system-supersession" &&
          !context.features.includes(GATE_SYSTEM_SUPERSESSION_FEATURE)) {
          throw new ProjectFabricCoreError("FEATURE_UNAVAILABLE", "gate system-supersession result shape was not negotiated");
        }
        const stateDigest = sha256Digest(canonicalJson(gate)) as never;
        const readTransactionId = `read_${sha256(`${context.connectionNonce}\0${gate.gateId}\0${String(gate.revision)}`).slice(0, 24)}`;
        if (request.expectedRevision !== undefined && request.expectedRevision !== gate.revision) {
          return {
            status: "changed",
            expectedRevision: request.expectedRevision,
            gate,
            readTransactionId,
            stateDigest,
          };
        }
        return { status: "current", gate, readTransactionId, stateDigest };
      }
      case FABRIC_OPERATIONS.projectDiscover: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.projectDiscover];
        const credential = operatorCredential();
        operatorCommand(credential, { credential: request.credential });
        return this.#operatorProjections.discover(request);
      }
      case FABRIC_OPERATIONS.projectionSnapshot: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.projectionSnapshot];
        const credential = operatorCredential();
        operatorCommand(credential, { credential: request.credential });
        return this.#operatorProjections.snapshot(
          request,
          context.features.includes(NATIVE_NOTIFICATION_PROJECTION_FEATURE) ? "include" : "omit",
          context.features.includes(RUN_SESSION_PROJECTION_FEATURE) ? "include" : "omit",
        );
      }
      case FABRIC_OPERATIONS.projectionPage: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.projectionPage];
        const credential = operatorCredential();
        operatorCommand(credential, { credential: request.credential });
        return this.#operatorProjections.page(
          request,
          context.features.includes(NATIVE_NOTIFICATION_PROJECTION_FEATURE) ? "include" : "omit",
          context.features.includes(RUN_SESSION_PROJECTION_FEATURE) ? "include" : "omit",
        );
      }
      case FABRIC_OPERATIONS.projectionEvents: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.projectionEvents];
        const credential = operatorCredential();
        operatorCommand(credential, { credential: request.credential });
        return this.#operatorProjections.events(request);
      }
      case FABRIC_OPERATIONS.projectionViewPage: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.projectionViewPage];
        const credential = operatorCredential();
        operatorCommand(credential, { credential: request.credential });
        return this.#operatorProjections.viewPage(
          request,
          context.features.includes(NATIVE_NOTIFICATION_PROJECTION_FEATURE) ? "include" : "omit",
          context.features.includes(RUN_SESSION_PROJECTION_FEATURE) ? "include" : "omit",
          context.features.includes(DECLARED_RUN_PROGRESS_FEATURE) ? "include" : "omit",
        );
      }
      case FABRIC_OPERATIONS.projectionDetailRead: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.projectionDetailRead];
        const credential = operatorCredential();
        operatorCommand(credential, { credential: request.credential });
        return this.#operatorProjections.detail(
          request,
          context.features.includes(RUN_SESSION_PROJECTION_FEATURE) ? "include" : "omit",
          context.features.includes(DECLARED_RUN_PROGRESS_FEATURE) ? "include" : "omit",
        );
      }
      case FABRIC_OPERATIONS.messageBodyRead: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.messageBodyRead];
        const credential = operatorCredential();
        operatorCommand(credential, { credential: request.credential });
        return this.#operatorProjections.messageBody(request);
      }
      case FABRIC_OPERATIONS.operatorRepositoryRead: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.operatorRepositoryRead];
        const credential = operatorCredential();
        operatorCommand(credential, { credential: request.credential });
        return this.#gitRepositoryReads.read(request);
      }
      case FABRIC_OPERATIONS.operatorArtifactContentRead: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.operatorArtifactContentRead];
        const credential = operatorCredential();
        operatorCommand(credential, { credential: request.credential });
        return this.#artifactContentReads.read(request);
      }
      case FABRIC_OPERATIONS.operatorActionPreview: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.operatorActionPreview];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        this.#assertChairLiveHandoffFeature(context, operation, request);
        return this.#operatorActions.preview(credential.context, request);
      }
      case FABRIC_OPERATIONS.operatorActionCommit: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.operatorActionCommit];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        this.#assertChairLiveHandoffFeature(context, operation, request);
        return this.#operatorActions.commit(credential.context, request);
      }
      case FABRIC_OPERATIONS.operatorActionStatus: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.operatorActionStatus];
        const credential = operatorCredential();
        operatorCommand(credential, { credential: request.credential });
        this.#assertChairLiveHandoffFeature(context, operation, request);
        return this.#operatorActions.status(request);
      }
      case FABRIC_OPERATIONS.operatorActionReconcile: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.operatorActionReconcile];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        this.#assertChairLiveHandoffFeature(context, operation, request);
        return this.#operatorActions.reconcile(credential.context, request);
      }
      case FABRIC_OPERATIONS.chairTakeover: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.chairTakeover];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        return this.#projectSessions.takeoverChair(credential.context, request);
      }
      default:
        throw Object.assign(new Error(`public protocol operation is not wired: ${operation}`), {
          code: "PROTOCOL_UNSUPPORTED",
        });
    }
  }

  #assertChairLiveHandoffFeature(
    context: PublicProtocolContext,
    operation: ProtocolOperation,
    input: unknown,
  ): void {
    if (!this.#operatorActionTargetsChairLiveHandoff(operation, input)) return;
    if (!context.features.includes("chair-live-handoff.v1")) {
      throw new ProjectFabricCoreError(
        "FEATURE_UNAVAILABLE",
        "chair live handoff requires chair-live-handoff.v1 negotiation",
      );
    }
  }

  #operatorActionTargetsChairLiveHandoff(operation: ProtocolOperation, input: unknown): boolean {
    if (!isRow(input)) return false;
    if (operation === FABRIC_OPERATIONS.operatorActionPreview) {
      return isRow(input.intent) && input.intent.kind === "chair-live-handoff";
    }
    let preview: unknown;
    if (operation === FABRIC_OPERATIONS.operatorActionCommit && typeof input.previewId === "string") {
      preview = this.#database.prepare("SELECT preview_json FROM operator_previews WHERE preview_id=?")
        .get(input.previewId);
    } else {
      const commandId = operation === FABRIC_OPERATIONS.operatorActionStatus
        ? input.commandId
        : operation === FABRIC_OPERATIONS.operatorActionReconcile
          ? input.targetCommandId
          : undefined;
      if (typeof commandId !== "string") return false;
      preview = this.#database.prepare(`
        SELECT preview_json FROM operator_previews WHERE confirmed_command_id=?
      `).get(commandId);
    }
    if (!isRow(preview) || typeof preview.preview_json !== "string") return false;
    try {
      const envelope: unknown = JSON.parse(preview.preview_json);
      return isRow(envelope) && isRow(envelope.preview) &&
        isRow(envelope.preview.intent) && envelope.preview.intent.kind === "chair-live-handoff";
    } catch {
      return false;
    }
  }

  #agentOperationGateTarget(
    runId: string,
    actorAgentId: string,
    operation: FabricOperation,
    input: unknown,
  ): GateOperationTarget {
    const request = rowOrNotFound(input, "gate operation input");
    const directTaskOperations = new Set<FabricOperation>([
      FABRIC_OPERATIONS.claimTask,
      FABRIC_OPERATIONS.refreshTaskReadiness,
      FABRIC_OPERATIONS.recordObjectiveCheck,
      FABRIC_OPERATIONS.acknowledgeTaskHandoff,
      FABRIC_OPERATIONS.getTask,
      FABRIC_OPERATIONS.updateTask,
      FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof,
      FABRIC_OPERATIONS.recoverTaskOwner,
      FABRIC_OPERATIONS.requestLifecycle,
      FABRIC_OPERATIONS.taskCompleteWithReply,
    ]);
    if (directTaskOperations.has(operation)) {
      const taskId = request.taskId;
      if (typeof taskId !== "string") throw new ProjectFabricCoreError("PROTOCOL_INVALID", "task-owned operation lacks an exact task ID");
      return { kind: "task", taskId: taskId as never };
    }
    if (operation === FABRIC_OPERATIONS.sendMessage) {
      const audience = request.audience;
      if (isRow(audience) && audience.kind === "task") {
        if (typeof audience.taskId !== "string") throw new ProjectFabricCoreError("PROTOCOL_INVALID", "task audience lacks an exact task ID");
        return { kind: "task", taskId: audience.taskId as never };
      }
      return { kind: "run" };
    }
    if (
      operation === FABRIC_OPERATIONS.acquireWriteLease ||
      operation === FABRIC_OPERATIONS.publishArtifact ||
      operation === FABRIC_OPERATIONS.evidencePublish ||
      operation === FABRIC_OPERATIONS.resourceReserve
    ) {
      const requestedTaskId = request.taskId;
      if (requestedTaskId !== undefined && typeof requestedTaskId !== "string") {
        throw new ProjectFabricCoreError("PROTOCOL_INVALID", "optional task target is invalid");
      }
      const taskId = resolveTaskBindingForActiveWork(
        this.#database,
        runId,
        actorAgentId,
        requestedTaskId,
      );
      return taskId === undefined ? { kind: "run" } : { kind: "task", taskId: taskId as never };
    }
    if (operation === FABRIC_OPERATIONS.dispatchProviderAction) {
      const providerOperation = request.operation;
      if (providerOperation !== "send_turn" && providerOperation !== "steer") return { kind: "run" };
      const payload = rowOrNotFound(request.payload, "provider action payload");
      const requestedTaskId = payload.taskId;
      if (requestedTaskId !== undefined && typeof requestedTaskId !== "string") {
        throw new ProjectFabricCoreError("PROTOCOL_INVALID", "provider task target is invalid");
      }
      const targetAgentId = typeof payload.agentId === "string" ? payload.agentId : actorAgentId;
      const taskId = resolveTaskBindingForActiveWork(
        this.#database,
        runId,
        targetAgentId,
        requestedTaskId,
      );
      if (taskId === undefined) throw new ProjectFabricCoreError("PROTOCOL_INVALID", "task-owned provider action lacks an exact task target");
      return { kind: "task", taskId: taskId as never };
    }
    if (
      operation === FABRIC_OPERATIONS.recoverWriteLease ||
      operation === FABRIC_OPERATIONS.renewWriteLease ||
      operation === FABRIC_OPERATIONS.getWriteLease ||
      operation === FABRIC_OPERATIONS.releaseWriteLease
    ) {
      const leaseId = request.leaseId;
      if (typeof leaseId !== "string") throw new ProjectFabricCoreError("PROTOCOL_INVALID", "write-lease operation lacks a lease ID");
      const binding = this.#database.prepare(`
        SELECT task_id FROM task_obligation_bindings
         WHERE coordination_run_id=? AND obligation_kind='write-lease' AND obligation_id=?
      `).get(runId, leaseId);
      return isRow(binding) && typeof binding.task_id === "string"
        ? { kind: "task", taskId: binding.task_id as never }
        : { kind: "run" };
    }
    if (
      operation === FABRIC_OPERATIONS.resultDeliveryClaim ||
      operation === FABRIC_OPERATIONS.resultDeliveryConsume ||
      operation === FABRIC_OPERATIONS.resultDeliveryRetry ||
      operation === FABRIC_OPERATIONS.resultDeliveryReassign ||
      operation === FABRIC_OPERATIONS.resultDeliveryAbandon
    ) {
      const resultDeliveryId = request.resultDeliveryId;
      if (typeof resultDeliveryId !== "string") throw new ProjectFabricCoreError("PROTOCOL_INVALID", "result operation lacks a delivery ID");
      const delivery = rowOrNotFound(this.#database.prepare(`
        SELECT task_id FROM result_deliveries WHERE run_id=? AND result_delivery_id=?
      `).get(runId, resultDeliveryId), "result delivery gate target");
      return { kind: "task", taskId: stringField(delivery, "task_id") as never };
    }
    if (operation === FABRIC_OPERATIONS.resourceRelease || operation === FABRIC_OPERATIONS.resourceReconcile) {
      const reservationId = request.reservationId;
      if (typeof reservationId !== "string") throw new ProjectFabricCoreError("PROTOCOL_INVALID", "resource operation lacks a reservation ID");
      const reservation = rowOrNotFound(this.#database.prepare(`
        SELECT operation_id FROM resource_reservations
         WHERE coordination_run_id=? AND reservation_id=?
      `).get(runId, reservationId), "resource reservation gate target");
      const taskId = reservation.operation_id;
      return typeof taskId === "string" && this.#database.prepare(`
        SELECT 1 FROM tasks WHERE run_id=? AND task_id=?
      `).get(runId, taskId) !== undefined
        ? { kind: "task", taskId: taskId as never }
        : { kind: "run" };
    }
    return { kind: "run" };
  }

  assertCapability(runId: string, agentId: string, tokenHash: string, requiredOperation: FabricOperation, allowSuspended = false): void {
    const row = this.#database
      .prepare(`
        SELECT c.expires_at,c.revoked_at,a.authority_json,a.authority_hash,g.lifecycle,
               member.generation AS mcp_seat_generation,
               active.generation AS active_mcp_seat_generation
          FROM capabilities c
          JOIN agents g ON g.run_id=c.run_id AND g.agent_id=c.agent_id
          JOIN authorities a ON a.authority_id=g.authority_id
          LEFT JOIN mcp_seat_generation_members member ON member.token_hash=c.token_hash
          LEFT JOIN current_mcp_seat_generation_members active ON active.token_hash=c.token_hash
         WHERE c.token_hash=? AND c.run_id=? AND c.agent_id=?
      `)
      .get(tokenHash, runId, agentId);
    if (
      !isRow(row) ||
      row.revoked_at !== null ||
      numberField(row, "expires_at") <= this.#clock()
    ) {
      throw new FabricError("AUTHENTICATION_FAILED", "capability is expired, revoked or unknown");
    }
    assertActiveMcpSeatGeneration(row);
    const authority = parseAuthority(row);
    if (authority.deniedActions.includes(requiredOperation) || !authority.actions.includes(requiredOperation)) {
      throw new FabricError("CAPABILITY_FORBIDDEN", `authority does not permit ${requiredOperation}`);
    }
    if (stringField(row, "lifecycle") === "archived") {
      throw new FabricError("AUTHENTICATION_FAILED", "archived agent capability is no longer active");
    }
    const lifecycle = stringField(row, "lifecycle");
    const lifecycleRecovery = requiredOperation === FABRIC_OPERATIONS.requestLifecycle;
    if (
      !allowSuspended &&
      (lifecycle === "suspended" || lifecycle === "context-unreconciled") &&
      !isReadFabricOperation(requiredOperation) &&
      !lifecycleRecovery
    ) {
      throw new FabricError("CONTEXT_UNRECONCILED", "unreconciled agent may only read until explicit lifecycle recovery");
    }
  }

  #assertChair(runId: string, actorAgentId: string): void {
    const run = rowOrNotFound(
      this.#database.prepare("SELECT chair_agent_id FROM runs WHERE run_id = ?").get(runId),
      "run",
    );
    if (stringField(run, "chair_agent_id") !== actorAgentId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "operation requires the run chair");
    }
  }

  assertTaskReadable(runId: string, actorAgentId: string, taskId: string): void {
    if (!this.#readPolicy.canReadTask(runId, actorAgentId, taskId)) throw new FabricError("CAPABILITY_FORBIDDEN", "task is outside the caller read scope");
  }

  assertAgentReadable(runId: string, actorAgentId: string, targetAgentId: string): void {
    if (!this.#readPolicy.canReadAgent(runId, actorAgentId, targetAgentId)) throw new FabricError("CAPABILITY_FORBIDDEN", "agent is outside the caller read scope");
  }

  assertWriteLeaseReadable(runId: string, actorAgentId: string, leaseId: string): void {
    if (!this.#readPolicy.canReadWriteLease(runId, actorAgentId, leaseId)) throw new FabricError("CAPABILITY_FORBIDDEN", "write lease is outside the caller read scope");
  }

  assertProviderActionReadable(runId: string, actorAgentId: string): void {
    if (!this.#readPolicy.isChair(runId, actorAgentId)) throw new FabricError("CAPABILITY_FORBIDDEN", "provider action reads are chair-only");
  }

  assertTeamReadable(runId: string, actorAgentId: string, teamId: string): void {
    if (!this.#readPolicy.canReadTeam(runId, actorAgentId, teamId)) throw new FabricError("CAPABILITY_FORBIDDEN", "team is outside the caller read scope");
  }

  assertBudgetReadable(runId: string, actorAgentId: string, budgetId: string): void {
    if (!this.#readPolicy.canReadBudget(runId, actorAgentId, budgetId)) throw new FabricError("CAPABILITY_FORBIDDEN", "budget is outside the caller read scope");
  }

  #event(runId: string, type: string, actorAgentId: string | null, payload: unknown): void {
    this.#database.transaction(() => {
      const eventId = uuidv7();
      this.#database
        .prepare("INSERT INTO events(event_id, run_id, type, actor_agent_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(eventId, runId, type, actorAgentId, canonicalJson(payload), this.#clock());
      this.#database.prepare("INSERT INTO observer_event_sequence(event_id) VALUES (?)").run(eventId);
    })();
  }

  delegateAuthority(
    runId: string,
    actorAgentId: string,
    input: { parentAuthorityId: string; authority: AuthorityInput; commandId?: string },
  ): AuthorityResult {
    const commandId = input.commandId ?? `authority:${uuidv7()}`;
    return this.#commandJournal.execute(runId, actorAgentId, commandId, input, isAuthorityResult, () => {
      assertRunAcceptingWork(this.#database, runId);
      const parentRow = rowOrNotFound(
        this.#database
          .prepare("SELECT authority_json, authority_hash FROM authorities WHERE authority_id = ? AND run_id = ?")
          .get(input.parentAuthorityId, runId),
        "parent authority",
      );
      const actorRow = rowOrNotFound(
        this.#database.prepare("SELECT authority_id FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, actorAgentId),
        "agent",
      );
      if (stringField(actorRow, "authority_id") !== input.parentAuthorityId) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "actor does not hold the parent authority");
      }
      const parent = parseAuthority(parentRow);
      const child = normaliseAuthority(input.authority, this.#workspaceRootForRun(runId));
      if (!authorityContained(child, parent)) {
        throw new FabricError("AUTHORITY_WIDENING", "child authority exceeds its parent");
      }
      for (const [unitKey, requested] of Object.entries(child.budget)) {
        const row = rowOrNotFound(
          this.#database
            .prepare("SELECT granted, reserved, consumed, usage_unknown FROM authority_budget WHERE authority_id = ? AND unit_key = ?")
            .get(input.parentAuthorityId, unitKey),
          `budget ${unitKey}`,
        );
        if (
          numberField(row, "usage_unknown") !== 0 ||
          numberField(row, "granted") - numberField(row, "reserved") - numberField(row, "consumed") < requested
        ) {
          throw new FabricError("BUDGET_EXCEEDED", `insufficient available budget for ${unitKey}`);
        }
      }
      const authorityId = uuidv7();
      const now = this.#clock();
      this.#database
        .prepare(
          "INSERT INTO authorities(authority_id, run_id, parent_authority_id, authority_json, authority_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(authorityId, runId, input.parentAuthorityId, canonicalJson(child), sha256(canonicalJson(child)), now);
      for (const [unitKey, granted] of Object.entries(child.budget)) {
        this.#database
          .prepare("UPDATE authority_budget SET reserved = reserved + ? WHERE authority_id = ? AND unit_key = ?")
          .run(granted, input.parentAuthorityId, unitKey);
        this.#database
          .prepare("INSERT INTO authority_budget(authority_id, unit_key, granted) VALUES (?, ?, ?)")
          .run(authorityId, unitKey, granted);
      }
      this.#event(runId, "authority-delegated", actorAgentId, { authorityId, parentAuthorityId: input.parentAuthorityId });
      return { authorityId };
    });
  }

  registerAgent(
    runId: string,
    actorAgentId: string,
    input: { agentId: string; authorityId: string; providerSessionRef?: string; adapterId?: string },
  ): { capability: string } {
    assertRunAcceptingWork(this.#database, runId);
    const authorityRow = rowOrNotFound(
      this.#database
        .prepare("SELECT authority_json, authority_hash, parent_authority_id FROM authorities WHERE authority_id = ? AND run_id = ?")
        .get(input.authorityId, runId),
      "authority",
    );
    const actorRow = rowOrNotFound(
      this.#database.prepare("SELECT authority_id FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, actorAgentId),
      "agent",
    );
    if (authorityRow.parent_authority_id !== stringField(actorRow, "authority_id")) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "actor cannot register an agent for this authority");
    }
    const authority = parseAuthority(authorityRow);
    const existing = this.#database.prepare(`
      SELECT g.parent_agent_id, g.authority_id, g.provider_session_ref, c.principal_generation, c.revoked_at, b.adapter_id
        FROM agents g LEFT JOIN capabilities c ON c.run_id = g.run_id AND c.agent_id = g.agent_id
        LEFT JOIN agent_adapter_bindings b ON b.run_id = g.run_id AND b.agent_id = g.agent_id
       WHERE g.run_id = ? AND g.agent_id = ? ORDER BY c.principal_generation DESC LIMIT 1
    `).get(runId, input.agentId);
    if (isRow(existing)) {
      const same = existing.parent_agent_id === actorAgentId && existing.authority_id === input.authorityId && existing.provider_session_ref === (input.providerSessionRef ?? null) && existing.adapter_id === (input.adapterId ?? null);
      if (!same) throw new FabricError("DEDUPE_CONFLICT", "agent ID was reused with changed registration input");
      if (existing.principal_generation === null) {
        const token = capabilityToken(this.#capabilityKey, runId, input.agentId, 1);
        this.#database.prepare(
          "INSERT INTO capabilities(token_hash, run_id, agent_id, principal_generation, expires_at) VALUES (?, ?, ?, 1, ?)",
        ).run(sha256(token), runId, input.agentId, Date.parse(authority.expiresAt));
        this.#event(runId, "agent-capability-issued", actorAgentId, { agentId: input.agentId, principalGeneration: 1 });
        return { capability: token };
      }
      if (existing.revoked_at !== null) throw new FabricError("AUTHENTICATION_FAILED", "agent capability was revoked");
      return { capability: capabilityToken(this.#capabilityKey, runId, input.agentId, numberField(existing, "principal_generation")) };
    }
    const token = capabilityToken(this.#capabilityKey, runId, input.agentId, 1);
    this.#database.transaction(() => {
      this.#database
        .prepare(
          "INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, provider_session_ref) VALUES (?, ?, ?, ?, ?)",
        )
        .run(runId, input.agentId, actorAgentId, input.authorityId, input.providerSessionRef ?? null);
      this.#database.prepare("INSERT INTO mailbox_state(run_id, recipient_id) VALUES (?, ?)").run(runId, input.agentId);
      this.#database
        .prepare("INSERT INTO capabilities(token_hash, run_id, agent_id, expires_at) VALUES (?, ?, ?, ?)")
        .run(sha256(token), runId, input.agentId, Date.parse(authority.expiresAt));
      if (input.adapterId !== undefined) {
        if (input.providerSessionRef === undefined) {
          throw new FabricError("CAPABILITY_FORBIDDEN", "adapter binding requires a provider session reference");
        }
        this.#database
          .prepare("INSERT INTO agent_adapter_bindings(run_id, agent_id, adapter_id, bound_at) VALUES (?, ?, ?, ?)")
          .run(runId, input.agentId, input.adapterId, this.#clock());
      }
      this.#event(runId, "agent-registered", actorAgentId, { agentId: input.agentId });
    })();
    return { capability: token };
  }

  #registerAgentIdentity(
    runId: string,
    actorAgentId: string,
    input: { agentId: string; authorityId: string },
  ): void {
    assertRunAcceptingWork(this.#database, runId);
    const authority = rowOrNotFound(
      this.#database.prepare(
        "SELECT parent_authority_id FROM authorities WHERE authority_id = ? AND run_id = ?",
      ).get(input.authorityId, runId),
      "authority",
    );
    const actor = rowOrNotFound(
      this.#database.prepare("SELECT authority_id FROM agents WHERE run_id = ? AND agent_id = ?")
        .get(runId, actorAgentId),
      "agent",
    );
    if (authority.parent_authority_id !== stringField(actor, "authority_id")) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "actor cannot register an identity for this authority");
    }
    const existing = this.#database.prepare(`
      SELECT parent_agent_id, authority_id, provider_session_ref
        FROM agents WHERE run_id=? AND agent_id=?
    `).get(runId, input.agentId);
    if (isRow(existing)) {
      if (
        existing.parent_agent_id !== actorAgentId ||
        existing.authority_id !== input.authorityId ||
        existing.provider_session_ref !== null
      ) throw new FabricError("DEDUPE_CONFLICT", "agent identity was reused with changed registration input");
      return;
    }
    this.#database.prepare(
      "INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, provider_session_ref) VALUES (?, ?, ?, ?, NULL)",
    ).run(runId, input.agentId, actorAgentId, input.authorityId);
    this.#database.prepare("INSERT INTO mailbox_state(run_id, recipient_id) VALUES (?, ?)")
      .run(runId, input.agentId);
    this.#event(runId, "agent-identity-registered", actorAgentId, { agentId: input.agentId });
  }

  async spawnAgent(
    runId: string,
    actorAgentId: string,
    input: {
      agentId: string;
      authorityId: string;
      adapterId: string;
      actionId: string;
      payload: Record<string, unknown>;
    },
  ): Promise<AgentCustodyResult> {
    assertRunAcceptingWork(this.#database, runId);
    this.#adapter(input.adapterId);
    this.#providerSessions.preflightRegistration({
      runId,
      actorAgentId,
      agentId: input.agentId,
      authorityId: input.authorityId,
      adapterId: input.adapterId,
    });
    const providerPayload = this.#admitProviderPayload(
      runId,
      input.authorityId,
      input.payload,
      true,
      { actorAgentId, taskId: typeof input.payload.taskId === "string" ? input.payload.taskId : undefined },
    );
    this.#assertAdapterModel(input.adapterId, providerPayload);
    const bridgeContract = await this.#inspectAgentBridgeContract(input.adapterId, "spawn");
    if (this.#launchCustody === undefined) {
      throw new FabricError("CAPABILITY_UNAVAILABLE", "agent custody requires an elected daemon socket");
    }
    return await this.#launchCustody.provisionAgent({
      runId,
      actorAgentId,
      operation: "spawn",
      agentId: input.agentId,
      authorityId: input.authorityId,
      adapterId: input.adapterId,
      actionId: input.actionId,
      payload: { ...providerPayload, agentId: input.agentId },
      ...(bridgeContract === undefined ? {} : { bridgeContract: bridgeContract as AgentBridgeContract }),
    });
  }

  async attachAgent(
    runId: string,
    actorAgentId: string,
    input: {
      agentId: string;
      authorityId: string;
      adapterId: string;
      actionId: string;
      providerSessionRef: string;
    },
  ): Promise<AgentCustodyResult> {
    assertRunAcceptingWork(this.#database, runId);
    this.#adapter(input.adapterId);
    this.#providerSessions.preflightRegistration({
      runId,
      actorAgentId,
      agentId: input.agentId,
      authorityId: input.authorityId,
      adapterId: input.adapterId,
      providerSessionRef: input.providerSessionRef,
    });
    const providerPayload = this.#admitProviderPayload(runId, input.authorityId, {});
    const bridgeContract = await this.#inspectAgentBridgeContract(input.adapterId, "attach");
    if (this.#launchCustody === undefined) {
      throw new FabricError("CAPABILITY_UNAVAILABLE", "agent custody requires an elected daemon socket");
    }
    return await this.#launchCustody.provisionAgent({
      runId,
      actorAgentId,
      operation: "attach",
      agentId: input.agentId,
      authorityId: input.authorityId,
      adapterId: input.adapterId,
      actionId: input.actionId,
      payload: { ...providerPayload, agentId: input.agentId },
      providerSessionRef: input.providerSessionRef,
      ...(bridgeContract === undefined ? {} : { bridgeContract: bridgeContract as AgentBridgeContract }),
    });
  }

  sendMessage(runId: string, senderId: string, input: MessageInput): { messageId: string } {
    if (Buffer.byteLength(input.body, "utf8") > MESSAGE_POLICY.maximumInlineBytes) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "inline message exceeds 4096 bytes");
    }
    const hopCount = input.hopCount ?? 0;
    if (!Number.isInteger(hopCount) || hopCount < 0 || hopCount > MESSAGE_POLICY.maximumHops) {
      throw new FabricError("MESSAGE_HOP_LIMIT_EXCEEDED", `message exceeds the ${MESSAGE_POLICY.maximumHops}-hop limit`);
    }
    const expiresAt = input.expiresAt === undefined ? null : Date.parse(input.expiresAt);
    if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= this.#clock())) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "message expiry must be a future ISO timestamp");
    }
    const payloadHash = audienceHash(input);
    const existing = this.#database
      .prepare("SELECT message_id, payload_hash FROM messages WHERE run_id = ? AND sender_id = ? AND dedupe_key = ?")
      .get(runId, senderId, input.dedupeKey);
    if (isRow(existing)) {
      if (stringField(existing, "payload_hash") !== payloadHash) {
        throw new FabricError("DEDUPE_CONFLICT", "dedupe key was reused with a changed payload or audience");
      }
      return { messageId: stringField(existing, "message_id") };
    }
    assertRunAcceptingWork(this.#database, runId);
    if (input.audience.kind === "task") assertTaskOperationAdmitted(this.#database, runId, input.audience.taskId);
    const messageId = uuidv7();
    const conversationId = input.conversationId ?? messageId;
    this.#database.transaction(() => {
      const recipients = this.#resolveAudienceRecipients(runId, senderId, input.audience);
      if (recipients.length === 0) {
        throw new FabricError("NOT_FOUND", "message has no recipients");
      }
      for (const recipientId of recipients) {
        rowOrNotFound(
          this.#database.prepare("SELECT 1 FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, recipientId),
          `recipient ${recipientId}`,
        );
        if (input.audience.kind === "agents") {
          this.#assertMessageRelationship(runId, senderId, recipientId, input.context);
        }
        if (input.requiresAck) {
          const unresolved = numberField(rowOrNotFound(this.#database.prepare("SELECT COUNT(*) AS count FROM deliveries d JOIN messages m ON m.message_id = d.message_id WHERE d.run_id = ? AND d.recipient_id = ? AND m.requires_ack = 1 AND d.state NOT IN ('acknowledged', 'abandoned', 'expired')").get(runId, recipientId), "unacknowledged delivery count"), "count");
          if (unresolved >= MESSAGE_POLICY.maximumUnacknowledgedPerAgent) throw new FabricError("MESSAGE_QUOTA_EXCEEDED", `recipient has ${MESSAGE_POLICY.maximumUnacknowledgedPerAgent} unresolved acknowledged-required messages`);
        }
      }
      if (input.replyToMessageId !== undefined) {
        const reply = rowOrNotFound(this.#database.prepare("SELECT conversation_id FROM messages WHERE run_id = ? AND message_id = ?").get(runId, input.replyToMessageId), "reply message");
        if (stringField(reply, "conversation_id") !== conversationId) throw new FabricError("MESSAGE_RELATIONSHIP_FORBIDDEN", "reply message belongs to another conversation");
      }
      this.#database
        .prepare(
          "INSERT INTO messages(message_id, run_id, sender_id, dedupe_key, payload_hash, audience_json, kind, body, requires_ack, conversation_id, reply_to_message_id, task_revision, hop_count, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          messageId,
          runId,
          senderId,
          input.dedupeKey,
          payloadHash,
          canonicalJson(input.audience),
          input.kind,
          input.body,
          input.requiresAck ? 1 : 0,
          conversationId,
          input.replyToMessageId ?? null,
          input.taskRevision ?? null,
          hopCount,
          expiresAt,
          this.#clock(),
        );
      this.#database
        .prepare("INSERT INTO message_contexts(message_id, context_json) VALUES (?, ?)")
        .run(messageId, canonicalJson(input.context ?? { kind: "direct" }));
      for (const recipientId of recipients) {
        const state = rowOrNotFound(
          this.#database
            .prepare("SELECT next_sequence FROM mailbox_state WHERE run_id = ? AND recipient_id = ?")
            .get(runId, recipientId),
          "mailbox",
        );
        const sequence = numberField(state, "next_sequence");
        this.#database
          .prepare(
            "INSERT INTO deliveries(delivery_id, message_id, run_id, recipient_id, mailbox_sequence, state) VALUES (?, ?, ?, ?, ?, 'ready')",
          )
          .run(uuidv7(), messageId, runId, recipientId, sequence);
        this.#database
          .prepare("UPDATE mailbox_state SET next_sequence = next_sequence + 1 WHERE run_id = ? AND recipient_id = ?")
          .run(runId, recipientId);
      }
      if (input.requiresAck) {
        this.#memberships.bindRequired(runId, [{ kind: "required-message", memberId: messageId }]);
      }
      this.#event(runId, "message-persisted", senderId, { messageId, recipients });
    })();
    return { messageId };
  }

  #resolveAudienceRecipients(
    runId: string,
    senderId: string,
    audience: MessageInput["audience"],
  ): string[] {
    if (audience.kind === "agents") {
      return [...new Set(audience.agentIds)].sort();
    }
    if (audience.kind === "team") {
      rowOrNotFound(
        this.#database.prepare("SELECT 1 FROM teams WHERE run_id = ? AND team_id = ?").get(runId, audience.teamId),
        `team audience ${audience.teamId}`,
      );
      const senderMembership = this.#database
        .prepare("SELECT 1 FROM team_members WHERE run_id = ? AND team_id = ? AND agent_id = ?")
        .get(runId, audience.teamId, senderId);
      if (!isRow(senderMembership)) {
        throw new FabricError("MESSAGE_RELATIONSHIP_FORBIDDEN", "sender is not a member of the named team");
      }
      return this.#database
        .prepare("SELECT agent_id FROM team_members WHERE run_id = ? AND team_id = ? ORDER BY agent_id")
        .all(runId, audience.teamId)
        .map((value) => stringField(rowOrNotFound(value, "team audience member"), "agent_id"));
    }
    rowOrNotFound(
      this.#database.prepare("SELECT 1 FROM tasks WHERE run_id = ? AND task_id = ?").get(runId, audience.taskId),
      `task audience ${audience.taskId}`,
    );
    if (!this.#taskIncludesAgent(runId, audience.taskId, senderId)) {
      throw new FabricError("MESSAGE_RELATIONSHIP_FORBIDDEN", "sender is not a participant in the named task");
    }
    return this.#database
      .prepare(
        "SELECT agent_id FROM (SELECT owner_agent_id AS agent_id FROM tasks WHERE run_id = ? AND task_id = ? AND owner_agent_id IS NOT NULL UNION SELECT agent_id FROM task_participants WHERE run_id = ? AND task_id = ?) ORDER BY agent_id",
      )
      .all(runId, audience.taskId, runId, audience.taskId)
      .map((value) => stringField(rowOrNotFound(value, "task audience member"), "agent_id"));
  }

  createDiscussionGroup(
    runId: string,
    actorAgentId: string,
    input: { groupId: string; memberAgentIds: string[]; teamId?: string; commandId: string },
  ): { groupId: string; memberAgentIds: string[] } {
    const parse = (value: unknown): value is { groupId: string; memberAgentIds: string[] } =>
      isRow(value) && typeof value.groupId === "string" && isStringArray(value.memberAgentIds);
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, parse, () => {
      this.#assertChair(runId, actorAgentId);
      const members = [...new Set(input.memberAgentIds)].sort();
      if (members.length < 2) throw new FabricError("MESSAGE_RELATIONSHIP_FORBIDDEN", "discussion group requires two members");
      for (const agentId of members) {
        rowOrNotFound(
          this.#database.prepare("SELECT 1 FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, agentId),
          `discussion member ${agentId}`,
        );
      }
      this.#database
        .prepare("INSERT INTO discussion_groups(run_id, group_id, team_id, created_by) VALUES (?, ?, ?, ?)")
        .run(runId, input.groupId, input.teamId ?? null, actorAgentId);
      for (const agentId of members) {
        this.#database
          .prepare("INSERT INTO discussion_group_members(run_id, group_id, agent_id) VALUES (?, ?, ?)")
          .run(runId, input.groupId, agentId);
      }
      return { groupId: input.groupId, memberAgentIds: members };
    });
  }

  #assertMessageRelationship(
    runId: string,
    senderId: string,
    recipientId: string,
    context: MessageInput["context"],
  ): void {
    if (senderId === recipientId) return;
    if (context?.kind === "task") {
      if (this.#taskIncludesAgent(runId, context.taskId, senderId) && this.#taskIncludesAgent(runId, context.taskId, recipientId)) return;
      throw new FabricError("MESSAGE_RELATIONSHIP_FORBIDDEN", "sender and recipient do not share the named task");
    }
    if (context?.kind === "discussion-group") {
      const count = this.#database
        .prepare(
          "SELECT COUNT(*) AS count FROM discussion_group_members WHERE run_id = ? AND group_id = ? AND agent_id IN (?, ?)",
        )
        .get(runId, context.groupId, senderId, recipientId);
      if (numberField(rowOrNotFound(count, "discussion membership"), "count") === 2) return;
      throw new FabricError("MESSAGE_RELATIONSHIP_FORBIDDEN", "sender and recipient do not share the named discussion group");
    }
    if (context?.kind === "task-dependency") {
      const edge = this.#database
        .prepare(
          "SELECT 1 FROM task_dependencies WHERE run_id = ? AND ((task_id = ? AND dependency_task_id = ?) OR (task_id = ? AND dependency_task_id = ?))",
        )
        .get(runId, context.fromTaskId, context.toTaskId, context.toTaskId, context.fromTaskId);
      if (
        isRow(edge) &&
        this.#taskIncludesAgent(runId, context.fromTaskId, senderId) &&
        this.#taskIncludesAgent(runId, context.toTaskId, recipientId)
      ) return;
      throw new FabricError("MESSAGE_RELATIONSHIP_FORBIDDEN", "sender and recipient do not own the named dependency endpoints");
    }
    if (this.#agentsHaveAnyRelationship(runId, senderId, recipientId)) return;
    throw new FabricError("MESSAGE_RELATIONSHIP_FORBIDDEN", "sender and recipient have no authorised task, dependency or group relationship");
  }

  #taskIncludesAgent(runId: string, taskId: string, agentId: string): boolean {
    return isRow(
      this.#database
        .prepare(
          "SELECT 1 FROM tasks t WHERE t.run_id = ? AND t.task_id = ? AND (t.owner_agent_id = ? OR EXISTS (SELECT 1 FROM task_participants p WHERE p.run_id = t.run_id AND p.task_id = t.task_id AND p.agent_id = ?))",
        )
        .get(runId, taskId, agentId, agentId),
    );
  }

  #agentsHaveAnyRelationship(runId: string, left: string, right: string): boolean {
    const sharedTask = this.#database
      .prepare(
        "SELECT 1 FROM tasks t WHERE t.run_id = ? AND (t.owner_agent_id = ? OR EXISTS (SELECT 1 FROM task_participants p WHERE p.run_id = t.run_id AND p.task_id = t.task_id AND p.agent_id = ?)) AND (t.owner_agent_id = ? OR EXISTS (SELECT 1 FROM task_participants p WHERE p.run_id = t.run_id AND p.task_id = t.task_id AND p.agent_id = ?)) LIMIT 1",
      )
      .get(runId, left, left, right, right);
    if (isRow(sharedTask)) return true;
    const sharedGroup = this.#database
      .prepare(
        "SELECT 1 FROM discussion_group_members l JOIN discussion_group_members r ON r.run_id = l.run_id AND r.group_id = l.group_id WHERE l.run_id = ? AND l.agent_id = ? AND r.agent_id = ? LIMIT 1",
      )
      .get(runId, left, right);
    if (isRow(sharedGroup)) return true;
    const dependency = this.#database
      .prepare(
        "SELECT 1 FROM task_dependencies d JOIN tasks a ON a.run_id = d.run_id AND a.task_id = d.task_id JOIN tasks b ON b.run_id = d.run_id AND b.task_id = d.dependency_task_id WHERE d.run_id = ? AND ((a.owner_agent_id = ? OR EXISTS (SELECT 1 FROM task_participants p WHERE p.run_id = a.run_id AND p.task_id = a.task_id AND p.agent_id = ?)) AND (b.owner_agent_id = ? OR EXISTS (SELECT 1 FROM task_participants p WHERE p.run_id = b.run_id AND p.task_id = b.task_id AND p.agent_id = ?)) OR (a.owner_agent_id = ? OR EXISTS (SELECT 1 FROM task_participants p WHERE p.run_id = a.run_id AND p.task_id = a.task_id AND p.agent_id = ?)) AND (b.owner_agent_id = ? OR EXISTS (SELECT 1 FROM task_participants p WHERE p.run_id = b.run_id AND p.task_id = b.task_id AND p.agent_id = ?))) LIMIT 1",
      )
      .get(runId, left, left, right, right, right, right, left, left);
    return isRow(dependency);
  }

  receiveMessages(
    runId: string,
    recipientId: string,
    input: { limit: number; visibilityTimeoutMs: number },
  ): Array<{
    deliveryId: string;
    messageId: string;
    sequence: number;
    body: string;
    attempt: number;
    senderId: string;
    kind: MessageInput["kind"];
    requiresAck: boolean;
  }> {
    const now = this.#clock();
    return this.#database.transaction(() => {
      const freeze = this.#database.prepare(`
        SELECT reason FROM delivery_freezes WHERE run_id=? AND agent_id=?
      `).get(runId, recipientId);
      if (isRow(freeze)) {
        throw new FabricError("CONTEXT_UNRECONCILED", "message delivery is frozen until lifecycle reconciliation");
      }
      const expiringRequiredMessageIds = this.#database.prepare(`
        SELECT DISTINCT delivery.message_id
          FROM deliveries delivery JOIN messages message USING(message_id)
         WHERE delivery.run_id=? AND delivery.recipient_id=?
           AND delivery.state IN ('ready','claimed')
           AND message.requires_ack=1 AND message.expires_at IS NOT NULL
           AND message.expires_at<=?
      `).all(runId, recipientId, now).map((value) =>
        stringField(rowOrNotFound(value, "expiring required message"), "message_id")
      );
      const expired = this.#database.prepare("UPDATE deliveries SET state = 'expired', claim_deadline = NULL, resolution_reason = 'message-expired-by-policy', resolved_at = ? WHERE run_id = ? AND recipient_id = ? AND state IN ('ready', 'claimed') AND message_id IN (SELECT message_id FROM messages WHERE run_id = ? AND expires_at IS NOT NULL AND expires_at <= ?)").run(now, runId, recipientId, runId, now);
      if (expired.changes > 0) {
        this.#advanceMailboxWatermark(runId, recipientId);
        for (const messageId of expiringRequiredMessageIds) {
          this.#memberships.reconcileRequiredMessageIfSettled(runId, messageId);
        }
      }
      this.#database
        .prepare(
          "UPDATE deliveries SET state = 'ready', claim_deadline = NULL WHERE run_id = ? AND recipient_id = ? AND state = 'claimed' AND claim_deadline <= ?",
        )
        .run(runId, recipientId, now);
      const rows = this.#database
        .prepare(
          "SELECT d.delivery_id, d.message_id, d.mailbox_sequence, d.attempt_count, m.body, m.sender_id, m.kind, m.requires_ack FROM deliveries d JOIN messages m ON m.message_id = d.message_id WHERE d.run_id = ? AND d.recipient_id = ? AND d.state = 'ready' ORDER BY d.mailbox_sequence LIMIT ?",
        )
        .all(runId, recipientId, Math.max(0, input.limit));
      return rows.map((value) => {
        const row = rowOrNotFound(value, "delivery");
        const attempt = numberField(row, "attempt_count") + 1;
        this.#database
          .prepare(
            "UPDATE deliveries SET state = 'claimed', attempt_count = ?, claim_deadline = ? WHERE delivery_id = ?",
          )
          .run(attempt, now + input.visibilityTimeoutMs, stringField(row, "delivery_id"));
        return {
          deliveryId: stringField(row, "delivery_id"),
          messageId: stringField(row, "message_id"),
          sequence: numberField(row, "mailbox_sequence"),
          body: stringField(row, "body"),
          attempt,
          senderId: stringField(row, "sender_id"),
          kind: messageKindField(row, "kind"),
          requiresAck: numberField(row, "requires_ack") === 1,
        };
      });
    })();
  }

  acknowledgeDelivery(runId: string, recipientId: string, deliveryId: string): void {
    this.#database.transaction(() => {
      const delivery = rowOrNotFound(
        this.#database
          .prepare("SELECT mailbox_sequence, state, message_id FROM deliveries WHERE delivery_id = ? AND run_id = ? AND recipient_id = ?")
          .get(deliveryId, runId, recipientId),
        "delivery",
      );
      if (stringField(delivery, "state") !== "acknowledged") {
        this.#database
          .prepare("UPDATE deliveries SET state = 'acknowledged', acknowledged_at = ?, claim_deadline = NULL WHERE delivery_id = ?")
          .run(this.#clock(), deliveryId);
      }
      this.#advanceMailboxWatermark(runId, recipientId);
      this.#memberships.reconcileRequiredMessageIfSettled(
        runId,
        stringField(delivery, "message_id"),
      );
      this.#event(runId, "delivery-acknowledged", recipientId, {
        deliveryId,
        sequence: numberField(delivery, "mailbox_sequence"),
      });
    })();
  }

  abandonDelivery(
    runId: string,
    actorAgentId: string,
    input: { deliveryId: string; reason: string; commandId: string },
  ): { deliveryId: string; status: "abandoned"; reason: string } {
    if (input.reason.trim().length === 0) {
      throw new FabricError("DELIVERY_REASON_REQUIRED", "abandoning a delivery requires a reason");
    }
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, (value): value is { deliveryId: string; status: "abandoned"; reason: string } =>
      isRow(value) && value.deliveryId === input.deliveryId && value.status === "abandoned" && typeof value.reason === "string", () => {
      this.#assertChair(runId, actorAgentId);
      const delivery = rowOrNotFound(
        this.#database
          .prepare("SELECT recipient_id, state, message_id FROM deliveries WHERE run_id = ? AND delivery_id = ?")
          .get(runId, input.deliveryId),
        "delivery",
      );
      const state = stringField(delivery, "state");
      if (state === "acknowledged" || state === "expired") {
        throw new FabricError("DELIVERY_ALREADY_RESOLVED", `delivery is already ${state}`);
      }
      this.#database
        .prepare(
          "UPDATE deliveries SET state = 'abandoned', claim_deadline = NULL, resolution_reason = ?, resolved_at = ? WHERE run_id = ? AND delivery_id = ?",
        )
        .run(input.reason.trim(), this.#clock(), runId, input.deliveryId);
      const recipientId = stringField(delivery, "recipient_id");
      this.#advanceMailboxWatermark(runId, recipientId);
      this.#memberships.reconcileRequiredMessageIfSettled(
        runId,
        stringField(delivery, "message_id"),
      );
      const result = { deliveryId: input.deliveryId, status: "abandoned" as const, reason: input.reason.trim() };
      this.#event(runId, "delivery-abandoned", actorAgentId, { ...result, recipientId });
      return result;
    });
  }

  #advanceMailboxWatermark(runId: string, recipientId: string): void {
    const state = rowOrNotFound(
      this.#database
        .prepare("SELECT contiguous_watermark FROM mailbox_state WHERE run_id = ? AND recipient_id = ?")
        .get(runId, recipientId),
      "mailbox",
    );
    let watermark = numberField(state, "contiguous_watermark");
    while (true) {
      const next = this.#database
        .prepare("SELECT state FROM deliveries WHERE run_id = ? AND recipient_id = ? AND mailbox_sequence = ?")
        .get(runId, recipientId, watermark + 1);
      if (!isRow(next) || !["acknowledged", "abandoned", "expired"].includes(stringField(next, "state"))) break;
      watermark += 1;
    }
    this.#database
      .prepare("UPDATE mailbox_state SET contiguous_watermark = ? WHERE run_id = ? AND recipient_id = ?")
      .run(watermark, runId, recipientId);
  }

  getMailboxState(runId: string, recipientId: string): {
    contiguousWatermark: number;
    acknowledgedAboveWatermark: number[];
  } {
    const state = rowOrNotFound(
      this.#database
        .prepare("SELECT contiguous_watermark FROM mailbox_state WHERE run_id = ? AND recipient_id = ?")
        .get(runId, recipientId),
      "mailbox",
    );
    const watermark = numberField(state, "contiguous_watermark");
    const above = this.#database
      .prepare(
        "SELECT mailbox_sequence FROM deliveries WHERE run_id = ? AND recipient_id = ? AND state = 'acknowledged' AND mailbox_sequence > ? ORDER BY mailbox_sequence",
      )
      .all(runId, recipientId, watermark)
      .map((value) => numberField(rowOrNotFound(value, "delivery"), "mailbox_sequence"));
    return { contiguousWatermark: watermark, acknowledgedAboveWatermark: above };
  }

  createTask(
    runId: string,
    actorAgentId: string,
    input: TaskCreateInput,
  ): TaskResult {
    return this.#createTask(runId, actorAgentId, input, true);
  }

  #createTask(
    runId: string,
    actorAgentId: string,
    input: TaskCreateInput,
    bindToLedTeam: boolean,
  ): TaskResult {
    const journalPayload = {
      ...input,
      teamOwnershipBinding: bindToLedTeam ? "active-led-team" : "atomic-team-root",
    } as const;
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, journalPayload, isTaskResult, () => {
      assertRunAcceptingWork(this.#database, runId);
      const agentContext = this.#agentContext(runId, actorAgentId);
      const dependencyRevision = numberField(
        rowOrNotFound(
          this.#database.prepare("SELECT dependency_revision FROM runs WHERE run_id=?").get(runId),
          "coordination run",
        ),
        "dependency_revision",
      );
      const actor = rowOrNotFound(
        this.#database.prepare("SELECT authority_id FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, actorAgentId),
        "agent",
      );
      const authority = rowOrNotFound(
        this.#database
          .prepare("SELECT parent_authority_id FROM authorities WHERE run_id = ? AND authority_id = ?")
          .get(runId, input.authorityId),
        "task authority",
      );
      const actorAuthorityId = stringField(actor, "authority_id");
      if (input.authorityId !== actorAuthorityId && authority.parent_authority_id !== actorAuthorityId) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "actor cannot assign this task authority");
      }
      const eligibleAgentIds = [...new Set(input.eligibleAgentIds)].sort();
      if (eligibleAgentIds.length === 0) {
        throw new FabricError("NOT_FOUND", "task has no eligible agents");
      }
      for (const agentId of eligibleAgentIds) {
        rowOrNotFound(
          this.#database.prepare("SELECT 1 FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, agentId),
          `eligible agent ${agentId}`,
        );
      }
      const proposedOwnerAgentId = input.proposedOwnerAgentId ?? (eligibleAgentIds.length === 1 ? eligibleAgentIds[0] ?? null : null);
      if (proposedOwnerAgentId !== null && !eligibleAgentIds.includes(proposedOwnerAgentId)) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "proposed owner is not eligible for the task");
      }
      const participantAgentIds = [...new Set(input.participantAgentIds ?? [])].sort();
      for (const agentId of participantAgentIds) {
        rowOrNotFound(
          this.#database.prepare("SELECT 1 FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, agentId),
          `task participant ${agentId}`,
        );
      }
      const dependencies = [...new Set(input.dependencies ?? [])].sort();
      let blocked = false;
      for (const dependencyTaskId of dependencies) {
        const dependency = rowOrNotFound(
          this.#database.prepare("SELECT state FROM tasks WHERE run_id = ? AND task_id = ?").get(runId, dependencyTaskId),
          `dependency ${dependencyTaskId}`,
        );
        if (!["complete", "cancelled", "degraded"].includes(stringField(dependency, "state"))) blocked = true;
      }
      this.#database
        .prepare(
          "INSERT INTO tasks(run_id, task_id, authority_id, objective, base_revision, state, owner_agent_id, revision, owner_lease_generation, created_by) VALUES (?, ?, ?, ?, ?, ?, NULL, 1, 0, ?)",
        )
        .run(runId, input.taskId, input.authorityId, input.objective, input.baseRevision, blocked ? "blocked" : "ready", actorAgentId);
      for (const agentId of eligibleAgentIds) {
        this.#database
          .prepare("INSERT INTO task_eligible_agents(run_id, task_id, agent_id) VALUES (?, ?, ?)")
          .run(runId, input.taskId, agentId);
      }
      this.#database
        .prepare("INSERT INTO task_proposals(run_id, task_id, proposed_owner_agent_id) VALUES (?, ?, ?)")
        .run(runId, input.taskId, proposedOwnerAgentId);
      for (const agentId of participantAgentIds) {
        this.#database.prepare("INSERT INTO task_participants(run_id, task_id, agent_id) VALUES (?, ?, ?)").run(
          runId,
          input.taskId,
          agentId,
        );
      }
      for (const relativePath of [...new Set(input.expectedArtifacts ?? [])].sort()) {
        if (relativePath.length === 0 || isAbsolute(relativePath) || relativePath.split(/[\\/]/u).includes("..")) {
          throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "expected artifact path must be relative and traversal-free");
        }
        this.#database
          .prepare("INSERT INTO task_expected_artifacts(run_id, task_id, relative_path) VALUES (?, ?, ?)")
          .run(runId, input.taskId, relativePath);
      }
      for (const checkId of [...new Set(input.objectiveChecks ?? [])].sort()) {
        this.#database
          .prepare("INSERT INTO task_objective_checks(run_id, task_id, check_id) VALUES (?, ?, ?)")
          .run(runId, input.taskId, checkId);
      }
      if (dependencies.length > 0) {
        this.#gates.setTaskDependencies(agentContext, {
            commandId: `${input.commandId}:dependencies`,
            expectedRevision: dependencyRevision,
            taskId: input.taskId,
            dependencyTaskIds: dependencies,
          });
      }
      if (bindToLedTeam) {
        const ledTeam = this.#database.prepare(`
          SELECT team_id FROM teams
           WHERE run_id=? AND leader_agent_id=? AND state='active'
           ORDER BY depth DESC, team_id
        `).all(runId, actorAgentId) as Array<{ team_id: string }>;
        if (ledTeam.length > 1) {
          throw new FabricError("TASK_SUBTREE_CONFLICT", "task creator leads more than one active team");
        }
        const ownedTeam = ledTeam[0];
        if (ownedTeam !== undefined) {
          this.#database.prepare(
            "INSERT INTO team_owned_tasks(run_id, team_id, task_id) VALUES (?, ?, ?)",
          ).run(runId, ownedTeam.team_id, input.taskId);
        }
      }
      this.#memberships.bindRequired(runId, [{ kind: "task", memberId: input.taskId }]);
      const result = this.getTask(runId, input.taskId);
      this.#event(runId, "task-created", actorAgentId, result);
      return result;
    });
  }

  claimTask(
    runId: string,
    actorAgentId: string,
    input: { taskId: string; expectedRevision: number; commandId: string },
  ): TaskResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isTaskResult, () => {
      assertRunAcceptingWork(this.#database, runId);
      const eligible = this.#database
        .prepare("SELECT 1 FROM task_eligible_agents WHERE run_id = ? AND task_id = ? AND agent_id = ?")
        .get(runId, input.taskId, actorAgentId);
      if (!isRow(eligible)) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "agent is not eligible to claim the task");
      }
      assertScopedTaskReadinessAllowed(this.#database, runId, input.taskId);
      assertScopedOperationAllowed(
        this.#database,
        runId,
        FABRIC_OPERATIONS.claimTask,
        { kind: "task", taskId: input.taskId as never },
      );
      assertTaskOperationAdmitted(this.#database, runId, input.taskId);
      const task = rowOrNotFound(
        this.#database
          .prepare("SELECT state, revision FROM tasks WHERE run_id = ? AND task_id = ?")
          .get(runId, input.taskId),
        "task",
      );
      if (stringField(task, "state") === "blocked") {
        throw new FabricError("TASK_DEPENDENCY_BLOCKED", "task dependencies are not terminal");
      }
      if (numberField(task, "revision") !== input.expectedRevision || stringField(task, "state") !== "ready") {
        throw new FabricError("TASK_REVISION_CONFLICT", "task revision or state changed");
      }
      const updated = this.#database
        .prepare(
          "UPDATE tasks SET owner_agent_id = ?, state = 'active', revision = revision + 1, owner_lease_generation = owner_lease_generation + 1 WHERE run_id = ? AND task_id = ? AND revision = ? AND state = 'ready'",
        )
        .run(actorAgentId, runId, input.taskId, input.expectedRevision);
      if (updated.changes !== 1) {
        throw new FabricError("TASK_REVISION_CONFLICT", "task was claimed concurrently");
      }
      const result = this.getTask(runId, input.taskId);
      this.#event(runId, "task-claimed", actorAgentId, result);
      return result;
    });
  }

  getTask(runId: string, taskId: string): TaskResult {
    const task = rowOrNotFound(
      this.#database
        .prepare("SELECT task_id, owner_agent_id, state, revision, owner_lease_generation FROM tasks WHERE run_id = ? AND task_id = ?")
        .get(runId, taskId),
      "task",
    );
    const proposal = this.#database
      .prepare("SELECT proposed_owner_agent_id FROM task_proposals WHERE run_id = ? AND task_id = ?")
      .get(runId, taskId);
    const proposedValue = isRow(proposal) ? proposal.proposed_owner_agent_id : null;
    if (typeof proposedValue !== "string" && proposedValue !== null) throw new Error("stored task proposal is invalid");
    const dependencies = this.#database
      .prepare("SELECT dependency_task_id FROM task_dependencies WHERE run_id = ? AND task_id = ? ORDER BY dependency_task_id")
      .all(runId, taskId)
      .map((value) => stringField(rowOrNotFound(value, "task dependency"), "dependency_task_id"));
    return taskResultFromRow(task, proposedValue, dependencies);
  }

  refreshTaskReadiness(
    runId: string,
    actorAgentId: string,
    input: { taskId: string; expectedRevision: number; commandId: string },
  ): TaskResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isTaskResult, () => {
      assertScopedTaskReadinessAllowed(this.#database, runId, input.taskId);
      assertScopedOperationAllowed(
        this.#database,
        runId,
        FABRIC_OPERATIONS.refreshTaskReadiness,
        { kind: "task", taskId: input.taskId as never },
      );
      assertTaskOperationAdmitted(this.#database, runId, input.taskId);
      const task = this.getTask(runId, input.taskId);
      if (task.revision !== input.expectedRevision) {
        throw new FabricError("TASK_REVISION_CONFLICT", "task revision changed");
      }
      if (task.state !== "blocked") return task;
      const unresolved = this.#database
        .prepare(
          "SELECT COUNT(*) AS count FROM task_dependencies d JOIN tasks t ON t.run_id = d.run_id AND t.task_id = d.dependency_task_id WHERE d.run_id = ? AND d.task_id = ? AND t.state NOT IN ('complete', 'cancelled', 'degraded')",
        )
        .get(runId, input.taskId);
      if (numberField(rowOrNotFound(unresolved, "dependency count"), "count") > 0) {
        throw new FabricError("TASK_DEPENDENCY_BLOCKED", "task dependencies are not terminal");
      }
      this.#database
        .prepare("UPDATE tasks SET state = 'ready', revision = revision + 1 WHERE run_id = ? AND task_id = ? AND revision = ?")
        .run(runId, input.taskId, input.expectedRevision);
      const result = this.getTask(runId, input.taskId);
      this.#event(runId, "task-readiness-refreshed", actorAgentId, result);
      return result;
    });
  }

  recordObjectiveCheck(
    runId: string,
    actorAgentId: string,
    input: { taskId: string; checkId: string; status: "pass" | "fail"; evidence: string; commandId: string },
  ): { taskId: string; checkId: string; status: "pass" | "fail" } {
    const parse = (value: unknown): value is { taskId: string; checkId: string; status: "pass" | "fail" } =>
      isRow(value) && typeof value.taskId === "string" && typeof value.checkId === "string" && (value.status === "pass" || value.status === "fail");
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, parse, () => {
      assertTaskOperationAdmitted(this.#database, runId, input.taskId);
      const changed = this.#database
        .prepare("UPDATE task_objective_checks SET status = ?, evidence = ? WHERE run_id = ? AND task_id = ? AND check_id = ?")
        .run(input.status, input.evidence, runId, input.taskId, input.checkId);
      if (changed.changes !== 1) throw new FabricError("NOT_FOUND", "objective check is not declared for the task");
      return { taskId: input.taskId, checkId: input.checkId, status: input.status };
    });
  }

  acknowledgeTaskHandoff(
    runId: string,
    actorAgentId: string,
    input: { taskId: string; taskRevision: number; ownerLeaseGeneration: number; commandId: string },
  ): { acknowledged: true } {
    const parse = (value: unknown): value is { acknowledged: true } => isRow(value) && value.acknowledged === true;
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, parse, () => {
      assertTaskOperationAdmitted(this.#database, runId, input.taskId);
      const task = this.getTask(runId, input.taskId);
      if (task.revision !== input.taskRevision || task.ownerLeaseGeneration !== input.ownerLeaseGeneration) {
        throw new FabricError("TASK_REVISION_CONFLICT", "handoff revision or generation changed");
      }
      const intendedNextOwner = this.#intendedTaskHandoffOwner(runId, input.taskId, task.ownerAgentId);
      if (intendedNextOwner === null || actorAgentId !== intendedNextOwner) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "only the intended next owner may acknowledge the task handoff");
      }
      this.#database
        .prepare("INSERT INTO task_handoff_acknowledgements(run_id, task_id, task_revision, owner_lease_generation, intended_next_owner_agent_id, acknowledged_by, acknowledged_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(runId, input.taskId, input.taskRevision, input.ownerLeaseGeneration, intendedNextOwner, actorAgentId, this.#clock());
      return { acknowledged: true };
    });
  }

  #intendedTaskHandoffOwner(runId: string, taskId: string, currentOwnerAgentId: string | null): string | null {
    const task = rowOrNotFound(
      this.#database.prepare("SELECT created_by FROM tasks WHERE run_id = ? AND task_id = ?").get(runId, taskId),
      "handoff task",
    );
    const creator = stringField(task, "created_by");
    if (creator !== currentOwnerAgentId) return creator;
    const participants = this.#database
      .prepare("SELECT agent_id FROM task_participants WHERE run_id = ? AND task_id = ? AND agent_id != ? ORDER BY agent_id")
      .all(runId, taskId, currentOwnerAgentId ?? "")
      .map((value) => stringField(rowOrNotFound(value, "handoff participant"), "agent_id"));
    return participants.length === 1 ? participants[0] ?? null : null;
  }

  updateTask(
    runId: string,
    actorAgentId: string,
    input: {
      taskId: string;
      expectedRevision: number;
      state: "complete" | "cancelled" | "degraded";
      commandId: string;
    },
  ): TaskResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isTaskResult, () => {
      assertTaskOperationAdmitted(this.#database, runId, input.taskId);
      const task = rowOrNotFound(
        this.#database
          .prepare("SELECT owner_agent_id, revision, state FROM tasks WHERE run_id = ? AND task_id = ?")
          .get(runId, input.taskId),
        "task",
      );
      if (numberField(task, "revision") !== input.expectedRevision || stringField(task, "state") !== "active") {
        throw new FabricError("TASK_REVISION_CONFLICT", "task revision or state changed");
      }
      if (task.owner_agent_id !== actorAgentId) {
        throw new FabricError("TASK_NOT_OWNER", "only the current owner may complete the task");
      }
      if (isRow(this.#database.prepare(`
        SELECT 1 FROM provider_actions
         WHERE run_id=? AND task_id=?
           AND status IN ('prepared','dispatched','accepted','ambiguous')
         LIMIT 1
      `).get(runId, input.taskId))) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "task has an unresolved provider action");
      }
      this.#database
        .prepare("UPDATE tasks SET state = ?, revision = revision + 1 WHERE run_id = ? AND task_id = ? AND revision = ?")
        .run(input.state, runId, input.taskId, input.expectedRevision);
      this.#memberships.reconcile(runId, [{ kind: "task", memberId: input.taskId }]);
      const result = this.getTask(runId, input.taskId);
      this.#event(runId, "task-updated", actorAgentId, result);
      return result;
    });
  }

  recordTaskOwnerRecoveryProof(
    runId: string,
    actorAgentId: string,
    input: {
      taskId: string;
      ownerLeaseGeneration: number;
      kind: "predecessor-terminal" | "os-isolated" | "patch-only";
      detail: Record<string, string>;
      commandId: string;
    },
  ): ProofResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isProofResult, () => {
      assertTaskOperationAdmitted(this.#database, runId, input.taskId);
      this.#assertChair(runId, actorAgentId);
      const task = this.getTask(runId, input.taskId);
      if (task.state !== "active" || task.ownerAgentId === null || task.ownerLeaseGeneration !== input.ownerLeaseGeneration) {
        throw new FabricError("STALE_LEASE_GENERATION", "task owner generation or state changed");
      }
      if (Object.keys(input.detail).length === 0) throw new FabricError("CAPABILITY_FORBIDDEN", "task recovery proof requires evidence");
      if (input.kind === "predecessor-terminal") {
        if (input.detail.agentId !== task.ownerAgentId) throw new FabricError("CAPABILITY_FORBIDDEN", "proof names the wrong predecessor");
        const revoked = this.#database
          .prepare("SELECT 1 FROM capabilities WHERE run_id = ? AND agent_id = ? AND revoked_at IS NOT NULL")
          .get(runId, task.ownerAgentId);
        if (!isRow(revoked)) throw new FabricError("CAPABILITY_FORBIDDEN", "predecessor capability is not revoked");
      }
      const proofId = uuidv7();
      this.#database
        .prepare(
          "INSERT INTO task_owner_recovery_proofs(proof_id, run_id, task_id, owner_lease_generation, predecessor_agent_id, kind, evidence_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          proofId,
          runId,
          input.taskId,
          input.ownerLeaseGeneration,
          task.ownerAgentId,
          input.kind,
          canonicalJson(input.detail),
          this.#clock(),
        );
      return { proofId };
    });
  }

  recoverTaskOwner(
    runId: string,
    actorAgentId: string,
    input: {
      taskId: string;
      expectedRevision: number;
      expectedOwnerLeaseGeneration: number;
      successorAgentId: string;
      proofId: string;
      commandId: string;
    },
  ): TaskResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isTaskResult, () => {
      assertTaskOperationAdmitted(this.#database, runId, input.taskId);
      this.#assertChair(runId, actorAgentId);
      const task = this.getTask(runId, input.taskId);
      if (
        task.state !== "active" ||
        task.ownerAgentId === null ||
        task.revision !== input.expectedRevision ||
        task.ownerLeaseGeneration !== input.expectedOwnerLeaseGeneration
      ) throw new FabricError("TASK_REVISION_CONFLICT", "task owner revision or generation changed");
      const proof = rowOrNotFound(
        this.#database
          .prepare("SELECT predecessor_agent_id, owner_lease_generation FROM task_owner_recovery_proofs WHERE proof_id = ? AND run_id = ? AND task_id = ?")
          .get(input.proofId, runId, input.taskId),
        "task owner recovery proof",
      );
      if (
        stringField(proof, "predecessor_agent_id") !== task.ownerAgentId ||
        numberField(proof, "owner_lease_generation") !== task.ownerLeaseGeneration
      ) throw new FabricError("STALE_LEASE_GENERATION", "task owner recovery proof is stale");
      const eligible = this.#database
        .prepare("SELECT 1 FROM task_eligible_agents WHERE run_id = ? AND task_id = ? AND agent_id = ?")
        .get(runId, input.taskId, input.successorAgentId);
      if (!isRow(eligible)) throw new FabricError("CAPABILITY_FORBIDDEN", "successor is not eligible for the task");
      this.#database
        .prepare("UPDATE tasks SET owner_agent_id = ?, revision = revision + 1, owner_lease_generation = owner_lease_generation + 1 WHERE run_id = ? AND task_id = ?")
        .run(input.successorAgentId, runId, input.taskId);
      this.#database
        .prepare(
          "INSERT INTO task_owner_recoveries(recovery_id, run_id, task_id, predecessor_agent_id, successor_agent_id, prior_generation, new_generation, evidence_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          uuidv7(),
          runId,
          input.taskId,
          task.ownerAgentId,
          input.successorAgentId,
          task.ownerLeaseGeneration,
          task.ownerLeaseGeneration + 1,
          canonicalJson({ proofId: input.proofId }),
          this.#clock(),
        );
      const result = this.getTask(runId, input.taskId);
      this.#event(runId, "task-owner-recovered", actorAgentId, result);
      return result;
    });
  }

  recordRevocationProof(
    runId: string,
    actorAgentId: string,
    input: {
      leaseId: string;
      generation: number;
      kind: "predecessor-terminal" | "os-isolated" | "patch-only";
      detail: Record<string, string>;
      commandId: string;
    },
  ): ProofResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isProofResult, () => {
      this.#assertChair(runId, actorAgentId);
      const lease = rowOrNotFound(
        this.#database
          .prepare("SELECT holder_agent_id, generation FROM leases WHERE run_id = ? AND lease_id = ?")
          .get(runId, input.leaseId),
        "lease",
      );
      if (numberField(lease, "generation") !== input.generation) {
        throw new FabricError("STALE_LEASE_GENERATION", "proof generation is stale");
      }
      if (input.kind === "predecessor-terminal" && input.detail.agentId !== stringField(lease, "holder_agent_id")) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "proof names the wrong predecessor");
      }
      if (Object.keys(input.detail).length === 0) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "revocation proof requires evidence detail");
      }
      const proofId = uuidv7();
      this.#database
        .prepare(
          "INSERT INTO revocation_proofs(proof_id, lease_id, generation, kind, evidence_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(proofId, input.leaseId, input.generation, input.kind, canonicalJson(input.detail), this.#clock());
      this.#event(runId, "revocation-proof-recorded", actorAgentId, {
        proofId,
        leaseId: input.leaseId,
        generation: input.generation,
        kind: input.kind,
      });
      return { proofId };
    });
  }

  revokeCapability(
    runId: string,
    actorAgentId: string,
    input: { agentId: string; commandId: string },
  ): void {
    this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isRevocationResult, () => {
      this.#assertChair(runId, actorAgentId);
      const result = this.#database
        .prepare(
          "UPDATE capabilities SET revoked_at = ?, principal_generation = principal_generation + 1 WHERE run_id = ? AND agent_id = ? AND revoked_at IS NULL",
        )
        .run(this.#clock(), runId, input.agentId);
      if (result.changes === 0) {
        rowOrNotFound(
          this.#database.prepare("SELECT 1 FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, input.agentId),
          "agent",
        );
      }
      this.#event(runId, "capability-revoked", actorAgentId, { agentId: input.agentId });
      return { revoked: true };
    });
  }

  rotateCapability(
    runId: string,
    actorAgentId: string,
    input: { agentId: string; expectedPrincipalGeneration: number; commandId: string },
  ): CapabilityRotationResult {
    const stored = this.#commandJournal.execute(
      runId,
      actorAgentId,
      input.commandId,
      input,
      (value): value is { agentId: string; principalGeneration: number } => isRow(value) && typeof value.agentId === "string" && typeof value.principalGeneration === "number",
      () => {
        this.#assertChair(runId, actorAgentId);
        const current = rowOrNotFound(this.#database.prepare(`
          SELECT c.principal_generation, a.authority_json, a.authority_hash
            FROM capabilities c JOIN agents g ON g.run_id = c.run_id AND g.agent_id = c.agent_id
            JOIN authorities a ON a.authority_id = g.authority_id
           WHERE c.run_id = ? AND c.agent_id = ? AND c.revoked_at IS NULL
           ORDER BY c.principal_generation DESC LIMIT 1
        `).get(runId, input.agentId), "active capability");
        const generation = numberField(current, "principal_generation");
        if (generation !== input.expectedPrincipalGeneration) throw new FabricError("STALE_PRINCIPAL_GENERATION", "principal generation changed");
        const nextGeneration = generation + 1;
        const token = capabilityToken(this.#capabilityKey, runId, input.agentId, nextGeneration);
        const authority = parseAuthority(current);
        this.#database.prepare("UPDATE capabilities SET revoked_at = ? WHERE run_id = ? AND agent_id = ? AND revoked_at IS NULL").run(this.#clock(), runId, input.agentId);
        this.#database.prepare("INSERT INTO capabilities(token_hash, run_id, agent_id, principal_generation, expires_at) VALUES (?, ?, ?, ?, ?)").run(sha256(token), runId, input.agentId, nextGeneration, Date.parse(authority.expiresAt));
        this.#event(runId, "capability-rotated", actorAgentId, { agentId: input.agentId, priorGeneration: generation, principalGeneration: nextGeneration });
        return { agentId: input.agentId, principalGeneration: nextGeneration };
      },
    );
    return { ...stored, capability: capabilityToken(this.#capabilityKey, runId, input.agentId, stored.principalGeneration) };
  }

  acquireWriteLease(
    runId: string,
    actorAgentId: string,
    input: { scope: string[]; ttlMs: number; commandId: string; taskId?: string },
  ): LeaseResult {
    const workspaceRoot = this.#workspaceRootForRun(runId);
    const scopes = [...new Set(input.scope.map((path) => canonicalAuthorityPath(workspaceRoot, path)))].sort();
    const actor = rowOrNotFound(
      this.#database
        .prepare(
          "SELECT a.authority_json, a.authority_hash FROM agents g JOIN authorities a ON a.authority_id = g.authority_id WHERE g.run_id = ? AND g.agent_id = ?",
        )
        .get(runId, actorAgentId),
      "agent authority",
    );
    const authority = parseAuthority(actor);
    if (
      scopes.some(
        (scope) =>
          !authority.workspaceRoots.some((root) => pathContains(root, scope)) ||
          !authority.sourcePaths.some((root) => pathContains(root, scope)) ||
          authority.deniedPaths.some((denied) => scopesOverlap(denied, scope)),
      )
    ) {
      throw new FabricError("AUTHORITY_WIDENING", "write scope exceeds the actor authority");
    }
    const commandPayload = {
      operation: "acquire-write",
      scopes,
      ttlMs: input.ttlMs,
      taskId: input.taskId ?? null,
    };
    const replay = this.#commandJournal.read(runId, actorAgentId, input.commandId, commandPayload, isLeaseResult);
    if (replay !== undefined) return replay;
    const taskId = resolveTaskBindingForActiveWork(this.#database, runId, actorAgentId, input.taskId);
    assertScopedOperationAllowed(
      this.#database,
      runId,
      FABRIC_OPERATIONS.acquireWriteLease,
      taskId === undefined ? { kind: "run" } : { kind: "task", taskId: taskId as never },
    );
    if (taskId !== undefined) {
      assertScopedTaskReadinessAllowed(this.#database, runId, taskId);
      const bound = this.#database.prepare(`
        SELECT 1 FROM tasks WHERE run_id=? AND task_id=?
          AND (owner_agent_id=? OR EXISTS (
            SELECT 1 FROM task_participants participant
             WHERE participant.run_id=tasks.run_id AND participant.task_id=tasks.task_id
               AND participant.agent_id=?
          ))
      `).get(runId, taskId, actorAgentId, actorAgentId);
      if (!isRow(bound)) throw new FabricError("CAPABILITY_FORBIDDEN", "write lease task is outside the actor task scope");
    }
    const lifecycle = this.getAgentLifecycle(runId, actorAgentId);
    if (lifecycle.contextState === "context-unreconciled") {
      throw new FabricError("CONTEXT_UNRECONCILED", "unreconciled provider context cannot acquire a write lease");
    }
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, commandPayload, isLeaseResult, () => {
      const conflicts = this.#writeLeaseConflicts(runId, scopes);
      if (conflicts.some((item) => item.status === "quarantined")) {
        throw new FabricError("WRITE_SCOPE_QUARANTINED", "write scope overlaps a quarantined lease");
      }
      const activeConflict = conflicts.find((item) => item.status === "active");
      if (activeConflict !== undefined) {
        if (activeConflict.expiresAt <= this.#clock()) {
          throw new FabricError(
            "WRITE_SCOPE_RECOVERY_REQUIRED",
            "write scope overlaps an expired lease whose predecessor has not been fenced",
          );
        }
        throw new FabricError("WRITE_SCOPE_CONFLICT", "write scope overlaps an active lease");
      }
      const leaseId = uuidv7();
      const now = this.#clock();
      this.#database
        .prepare(
          "INSERT INTO leases(lease_id, run_id, kind, holder_agent_id, generation, status, expires_at, updated_at) VALUES (?, ?, 'write', ?, 1, 'active', ?, ?)",
        )
        .run(leaseId, runId, actorAgentId, now + input.ttlMs, now);
      for (const scope of scopes) {
        this.#database.prepare("INSERT INTO write_scope_entries(lease_id, canonical_path) VALUES (?, ?)").run(leaseId, scope);
      }
      if (taskId !== undefined) {
        this.#database.prepare(`
          INSERT INTO task_obligation_bindings(
            coordination_run_id, task_id, obligation_kind, obligation_id, state, created_at, updated_at
          ) VALUES (?, ?, 'write-lease', ?, 'active', ?, ?)
        `).run(runId, taskId, leaseId, now, now);
      }
      this.#memberships.bindRequired(runId, [{ kind: "lease", memberId: leaseId }]);
      const result: LeaseResult = { leaseId, holderAgentId: actorAgentId, generation: 1, status: "active", scope: scopes };
      this.#event(runId, "write-lease-acquired", actorAgentId, result);
      return result;
    });
  }

  #writeLeaseConflicts(runId: string, scopes: string[]): Array<{ status: string; expiresAt: number }> {
    const rows = this.#database
      .prepare(
        "SELECT l.status, l.expires_at, w.canonical_path FROM leases l JOIN write_scope_entries w ON w.lease_id = l.lease_id WHERE l.run_id = ? AND l.kind = 'write' AND l.status IN ('active', 'quarantined')",
      )
      .all(runId);
    return rows
      .map((value) => rowOrNotFound(value, "lease"))
      .filter((row) => scopes.some((scope) => scopesOverlap(scope, stringField(row, "canonical_path"))))
      .map((row) => ({ status: stringField(row, "status"), expiresAt: numberField(row, "expires_at") }));
  }

  recoverWriteLease(
    runId: string,
    actorAgentId: string,
    input: {
      leaseId: string;
      expectedGeneration: number;
      commandId: string;
      evidence: RecoveryEvidence;
    },
  ): LeaseResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isLeaseResult, () => {
      this.#assertChair(runId, actorAgentId);
      const lease = rowOrNotFound(
        this.#database
          .prepare("SELECT holder_agent_id, generation, status, expires_at FROM leases WHERE lease_id = ? AND run_id = ?")
          .get(input.leaseId, runId),
        "lease",
      );
      const generation = numberField(lease, "generation");
      if (generation !== input.expectedGeneration) {
        throw new FabricError("STALE_LEASE_GENERATION", "lease generation is stale");
      }
      if (numberField(lease, "expires_at") > this.#clock()) {
        throw new FabricError("LEASE_NOT_EXPIRED", "lease has not expired");
      }
      const scopes = this.#database
        .prepare("SELECT canonical_path FROM write_scope_entries WHERE lease_id = ? ORDER BY canonical_path")
        .all(input.leaseId)
        .map((value) => stringField(rowOrNotFound(value, "scope"), "canonical_path"));
      if (input.evidence.kind === "unproven") {
        this.#database
          .prepare("UPDATE leases SET status = 'quarantined', updated_at = ? WHERE lease_id = ?")
          .run(this.#clock(), input.leaseId);
        const result: LeaseResult = {
          leaseId: input.leaseId,
          holderAgentId: stringField(lease, "holder_agent_id"),
          generation,
          status: "quarantined",
          scope: scopes,
        };
        this.#event(runId, "write-lease-quarantined", actorAgentId, result);
        return result;
      }
      if (
        input.evidence.kind === "predecessor-terminal" &&
        input.evidence.agentId !== stringField(lease, "holder_agent_id")
      ) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "terminal evidence names the wrong predecessor");
      }
      const evidenceDetail: Record<string, string> =
        input.evidence.kind === "predecessor-terminal"
          ? { agentId: input.evidence.agentId, providerSessionRef: input.evidence.providerSessionRef }
          : input.evidence.kind === "os-isolated"
            ? { proofRef: input.evidence.proofRef }
            : { serialApplierRef: input.evidence.serialApplierRef };
      const proof = this.#database
        .prepare(
          "SELECT proof_id FROM revocation_proofs WHERE lease_id = ? AND generation = ? AND kind = ? AND evidence_json = ?",
        )
        .get(input.leaseId, generation, input.evidence.kind, canonicalJson(evidenceDetail));
      if (!isRow(proof)) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "recovery requires chair-recorded revocation proof");
      }
      const nextGeneration = generation + 1;
      this.#database
        .prepare(
          "UPDATE leases SET holder_agent_id = ?, generation = ?, status = 'active', expires_at = ?, updated_at = ? WHERE lease_id = ?",
        )
        .run(actorAgentId, nextGeneration, this.#clock() + 30_000, this.#clock(), input.leaseId);
      const result: LeaseResult = {
        leaseId: input.leaseId,
        holderAgentId: actorAgentId,
        generation: nextGeneration,
        status: "active",
        scope: scopes,
      };
      this.#event(runId, "write-lease-recovered", actorAgentId, result);
      return result;
    });
  }

  renewWriteLease(
    runId: string,
    actorAgentId: string,
    input: { leaseId: string; expectedGeneration: number; ttlMs: number; commandId: string },
  ): LeaseResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isLeaseResult, () => {
      const lease = rowOrNotFound(
        this.#database
          .prepare("SELECT holder_agent_id, generation, status, expires_at FROM leases WHERE lease_id = ? AND run_id = ?")
          .get(input.leaseId, runId),
        "lease",
      );
      const generation = numberField(lease, "generation");
      if (generation !== input.expectedGeneration) {
        throw new FabricError("STALE_LEASE_GENERATION", "lease generation is stale");
      }
      if (stringField(lease, "status") === "quarantined") {
        throw new FabricError("LEASE_QUARANTINED", "lease is quarantined");
      }
      if (stringField(lease, "holder_agent_id") !== actorAgentId) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "actor does not hold the lease");
      }
      const now = this.#clock();
      if (numberField(lease, "expires_at") <= now) {
        throw new FabricError("LEASE_EXPIRED", "expired lease cannot be renewed");
      }
      this.#database.prepare("UPDATE leases SET expires_at = ?, updated_at = ? WHERE lease_id = ?").run(
        now + input.ttlMs,
        now,
        input.leaseId,
      );
      const scopes = this.#database
        .prepare("SELECT canonical_path FROM write_scope_entries WHERE lease_id = ? ORDER BY canonical_path")
        .all(input.leaseId)
        .map((value) => stringField(rowOrNotFound(value, "scope"), "canonical_path"));
      return {
        leaseId: input.leaseId,
        holderAgentId: actorAgentId,
        generation,
        status: "active",
        scope: scopes,
      };
    });
  }

  getWriteLease(runId: string, leaseId: string): LeaseResult {
    const lease = rowOrNotFound(
      this.#database
        .prepare("SELECT holder_agent_id, generation, status FROM leases WHERE run_id = ? AND lease_id = ? AND kind = 'write'")
        .get(runId, leaseId),
      "write lease",
    );
    const statusValue = stringField(lease, "status");
    if (statusValue !== "active" && statusValue !== "quarantined") {
      throw new FabricError("NOT_FOUND", "write lease is no longer visible");
    }
    const scope = this.#database
      .prepare("SELECT canonical_path FROM write_scope_entries WHERE lease_id = ? ORDER BY canonical_path")
      .all(leaseId)
      .map((value) => stringField(rowOrNotFound(value, "scope"), "canonical_path"));
    return {
      leaseId,
      holderAgentId: stringField(lease, "holder_agent_id"),
      generation: numberField(lease, "generation"),
      status: statusValue,
      scope,
    };
  }

  releaseWriteLease(
    runId: string,
    actorAgentId: string,
    input: { leaseId: string; expectedGeneration: number; commandId: string },
  ): { leaseId: string; status: "released"; generation: number } {
    const parse = (value: unknown): value is { leaseId: string; status: "released"; generation: number } =>
      isRow(value) && value.leaseId === input.leaseId && value.status === "released" && typeof value.generation === "number";
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, parse, () => {
      const lease = rowOrNotFound(
        this.#database
          .prepare("SELECT holder_agent_id, generation, status FROM leases WHERE run_id = ? AND lease_id = ?")
          .get(runId, input.leaseId),
        "write lease",
      );
      if (stringField(lease, "holder_agent_id") !== actorAgentId) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "only the lease holder may release it");
      }
      const generation = numberField(lease, "generation");
      if (generation !== input.expectedGeneration) {
        throw new FabricError("STALE_LEASE_GENERATION", "lease generation changed");
      }
      if (stringField(lease, "status") !== "active") {
        throw new FabricError("LEASE_QUARANTINED", "only an active lease can be released");
      }
      this.#database.prepare("UPDATE leases SET status = 'released', updated_at = ? WHERE lease_id = ?").run(
        this.#clock(),
        input.leaseId,
      );
      this.#memberships.reconcile(runId, [{ kind: "lease", memberId: input.leaseId }]);
      this.#event(runId, "write-lease-released", actorAgentId, { leaseId: input.leaseId, generation });
      return { leaseId: input.leaseId, status: "released", generation };
    });
  }

  getAgentLifecycle(runId: string, agentId: string): LifecycleCurrentStateV1 {
    const agent = rowOrNotFound(
      this.#database.prepare(`
        SELECT a.lifecycle,
               COALESCE(p.provider_session_generation,1) AS provider_session_generation,
               COALESCE(CAST(p.context_revision AS INTEGER),0) AS context_revision,
               COALESCE((
                 SELECT capability.principal_generation FROM capabilities capability
                  WHERE capability.run_id=a.run_id AND capability.agent_id=a.agent_id
                    AND capability.revoked_at IS NULL
                  ORDER BY capability.principal_generation DESC LIMIT 1
               ),1) AS principal_generation,
               COALESCE(bridge.bridge_generation,1) AS bridge_generation
          FROM agents a
          LEFT JOIN provider_state p ON p.run_id=a.run_id AND p.agent_id=a.agent_id
          LEFT JOIN agent_bridge_state bridge
            ON bridge.run_id=a.run_id AND bridge.agent_id=a.agent_id
         WHERE a.run_id=? AND a.agent_id=?
      `).get(runId, agentId),
      "agent",
    );
    const custodySource = this.#database.prepare(`
      SELECT head.current_revision,head.state,head.disposition_code,head.terminal,
             revision.terminal_evidence_digest,
             custody.provider_action_adapter_id,custody.provider_action_id,
             custody.source_provider_generation,custody.source_principal_generation,
             custody.source_bridge_generation,custody.target_provider_generation,
             custody.target_principal_generation,custody.target_bridge_generation,
             custody.checkpoint_digest,custody.custody_id
        FROM lifecycle_rotation_custody_heads head
        JOIN lifecycle_rotation_custodies custody
          ON custody.run_id=head.run_id AND custody.agent_id=head.agent_id
         AND custody.custody_id=head.custody_id
        JOIN lifecycle_rotation_custody_revisions revision
          ON revision.run_id=head.run_id AND revision.agent_id=head.agent_id
         AND revision.custody_id=head.custody_id
         AND revision.revision=head.current_revision
       WHERE head.run_id=? AND head.agent_id=?
       ORDER BY custody.created_at DESC LIMIT 1
    `).get(runId, agentId);
    const lossSource = this.#database.prepare(`
      SELECT head.current_revision,head.state,head.abandon_kind_code,head.terminal,
             revision.terminal_evidence_digest,loss.generation_loss_id,loss.loss_kind,
             loss.old_provider_generation,loss.new_provider_generation,
             loss.old_context_revision,loss.new_context_revision,loss.checkpoint_state,
             loss.checkpoint_digest,loss.loss_evidence_digest,
             revision.recovery_action_adapter_id,revision.recovery_action_id
        FROM lifecycle_generation_loss_heads head
        JOIN lifecycle_generation_losses loss
          ON loss.run_id=head.run_id AND loss.agent_id=head.agent_id
         AND loss.generation_loss_id=head.generation_loss_id
        JOIN lifecycle_generation_loss_revisions revision
          ON revision.run_id=head.run_id AND revision.agent_id=head.agent_id
         AND revision.generation_loss_id=head.generation_loss_id
         AND revision.revision=head.current_revision
       WHERE head.run_id=? AND head.agent_id=?
       ORDER BY loss.created_at DESC LIMIT 1
    `).get(runId, agentId);
    const storedLifecycle = stringField(agent, "lifecycle");
    const lifecycle = storedLifecycle === "context-unreconciled"
      ? "suspended"
      : storedLifecycle === "completion-ready"
        ? "idle"
        : storedLifecycle as LifecycleCurrentStateV1["lifecycle"];
    const custodyCurrentSource = isRow(custodySource) ? {
      schemaVersion: 1 as const,
      sourceKind: "custody" as const,
      agentId,
      custodyId: stringField(custodySource, "custody_id"),
      custodyRevision: numberField(custodySource, "current_revision"),
      actionRef: {
        adapterId: stringField(custodySource, "provider_action_adapter_id"),
        actionId: stringField(custodySource, "provider_action_id"),
      },
      sourceProviderGeneration: numberField(custodySource, "source_provider_generation"),
      sourcePrincipalGeneration: numberField(custodySource, "source_principal_generation"),
      sourceBridgeGeneration: numberField(custodySource, "source_bridge_generation"),
      targetProviderGeneration: numberField(custodySource, "target_provider_generation"),
      targetPrincipalGeneration: numberField(custodySource, "target_principal_generation"),
      targetBridgeGeneration: numberField(custodySource, "target_bridge_generation"),
      checkpointDigest: stringField(custodySource, "checkpoint_digest"),
      state: stringField(custodySource, "state") as LifecycleCustodyRowV1["state"],
      disposition: custodySource.disposition_code === "none"
        ? null
        : stringField(custodySource, "disposition_code") as Exclude<LifecycleCustodyRowV1["disposition"], null>,
      terminalEvidenceDigest: typeof custodySource.terminal_evidence_digest === "string"
        ? custodySource.terminal_evidence_digest
        : null,
    } as LifecycleCustodyRowV1 : null;
    const lossCurrentSource = isRow(lossSource) ? {
      schemaVersion: 1 as const,
      sourceKind: "generation-loss" as const,
      agentId,
      generationLossId: stringField(lossSource, "generation_loss_id"),
      generationLossRevision: numberField(lossSource, "current_revision"),
      lossKind: stringField(lossSource, "loss_kind") as LifecycleGenerationLossRowV1["lossKind"],
      recoveryActionRef: lossSource.recovery_action_id === null
        ? null
        : {
            adapterId: stringField(lossSource, "recovery_action_adapter_id"),
            actionId: stringField(lossSource, "recovery_action_id"),
          },
      abandonKind: stringField(lossSource, "abandon_kind_code") as LifecycleGenerationLossRowV1["abandonKind"],
      state: stringField(lossSource, "state") as LifecycleGenerationLossRowV1["state"],
      disposition: lossSource.state === "recovered-adopted"
        ? "recovered-adopted" as const
        : lossSource.state === "abandoned"
          ? "abandoned" as const
          : null,
      oldProviderGeneration: numberField(lossSource, "old_provider_generation"),
      newProviderGeneration: numberField(lossSource, "new_provider_generation"),
      oldContextRevision: typeof lossSource.old_context_revision === "number"
        ? lossSource.old_context_revision
        : null,
      newContextRevision: numberField(lossSource, "new_context_revision"),
      checkpointState: stringField(lossSource, "checkpoint_state") as LifecycleGenerationLossRowV1["checkpointState"],
      checkpointDigest: typeof lossSource.checkpoint_digest === "string" ? lossSource.checkpoint_digest : null,
      lossEvidenceDigest: stringField(lossSource, "loss_evidence_digest"),
      terminalEvidenceDigest: typeof lossSource.terminal_evidence_digest === "string"
        ? lossSource.terminal_evidence_digest
        : null,
    } as LifecycleGenerationLossRowV1 : null;
    const custodyIsNonfinal = isRow(custodySource) && numberField(custodySource, "terminal") === 0;
    const lossIsNonfinal = isRow(lossSource) && numberField(lossSource, "terminal") === 0;
    const currentSource = custodyIsNonfinal
      ? custodyCurrentSource
      : lossIsNonfinal
        ? lossCurrentSource
        : custodyCurrentSource ?? lossCurrentSource;
    const sourceIsNonfinal = custodyIsNonfinal;
    const state = {
      schemaVersion: 1 as const,
      kind: "current-state" as const,
      agentId,
      lifecycle,
      contextState: storedLifecycle === "context-unreconciled"
        ? "context-unreconciled" as const
        : "current" as const,
      principalGeneration: sourceIsNonfinal
        ? numberField(custodySource, "source_principal_generation")
        : numberField(agent, "principal_generation"),
      providerSessionGeneration: sourceIsNonfinal
        ? numberField(custodySource, "source_provider_generation")
        : numberField(agent, "provider_session_generation"),
      bridgeGeneration: sourceIsNonfinal
        ? numberField(custodySource, "source_bridge_generation")
        : numberField(agent, "bridge_generation"),
      contextRevision: numberField(agent, "context_revision"),
      currentSource,
    };
    return LIFECYCLE_CURRENT_STATE_V1_CODEC.parse({
      ...state,
      stateDigest: sha256Digest(canonicalJson(state)),
    }, "lifecycleCurrentState");
  }

  reportProviderState(
    runId: string,
    actorAgentId: string,
    input: {
      sourceEventId: string;
      providerSessionRef: string;
      agentId: string;
      providerSessionGeneration: number;
      contextRevision: number;
      evidenceDigest: `sha256:${string}`;
      checkpointSha256?: string;
      commandId: string;
    },
  ): LifecycleResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isLifecycleResult, () => {
      this.#assertChair(runId, actorAgentId);
      const checkpointValidated = input.checkpointSha256 !== undefined &&
        this.#hasCurrentValidatedCheckpoint(runId, input.agentId, input.checkpointSha256);
      const source = rowOrNotFound(this.#database.prepare(`
        SELECT run.project_session_id,run.chair_agent_id,run.revision AS run_revision,
               run.chair_generation,session.generation AS session_generation,
               agent.provider_session_ref,
               COALESCE(chair_bridge.provider_adapter_id,child_bridge.adapter_id) AS adapter_id,
               COALESCE(chair_bridge.provider_action_id,child_bridge.action_id) AS action_id,
               COALESCE(chair_bridge.bridge_generation,child_bridge.bridge_generation) AS bridge_generation,
               COALESCE(chair_bridge.revision,child_bridge.revision) AS bridge_revision,
               COALESCE(chair_bridge.capability_hash,child_bridge.capability_hash) AS capability_hash,
               COALESCE(chair_bridge.provider_contract_digest,custody.bridge_contract_digest) AS bridge_contract_digest,
               capability.principal_generation
          FROM runs run
          JOIN project_sessions session ON session.project_session_id=run.project_session_id
          JOIN agents agent ON agent.run_id=run.run_id AND agent.agent_id=?
          LEFT JOIN launched_chair_bridge_state chair_bridge
            ON chair_bridge.project_session_id=run.project_session_id
           AND chair_bridge.coordination_run_id=run.run_id
           AND chair_bridge.chair_agent_id=agent.agent_id
           AND run.chair_agent_id=agent.agent_id AND chair_bridge.state='active'
          LEFT JOIN agent_bridge_state child_bridge
            ON child_bridge.run_id=agent.run_id AND child_bridge.agent_id=agent.agent_id
           AND run.chair_agent_id<>agent.agent_id AND child_bridge.bridge_state='active'
          LEFT JOIN provider_agent_custody custody
            ON custody.run_id=child_bridge.run_id AND custody.adapter_id=child_bridge.adapter_id
           AND custody.action_id=child_bridge.action_id AND custody.target_agent_id=child_bridge.agent_id
          JOIN capabilities capability
            ON capability.token_hash=COALESCE(chair_bridge.capability_hash,child_bridge.capability_hash)
           AND capability.run_id=run.run_id AND capability.agent_id=agent.agent_id
           AND capability.revoked_at IS NULL
         WHERE run.run_id=?
           AND (
             (run.chair_agent_id=agent.agent_id AND chair_bridge.chair_agent_id IS NOT NULL
              AND chair_bridge.provider_session_ref=agent.provider_session_ref)
             OR
             (run.chair_agent_id<>agent.agent_id AND child_bridge.agent_id IS NOT NULL
              AND child_bridge.provider_session_ref=agent.provider_session_ref
              AND custody.action_id IS NOT NULL)
           )
      `).get(input.agentId, runId), "provider context observation source");
      const checkpointRow = checkpointValidated
        ? rowOrNotFound(this.#database.prepare(`
            SELECT relative_path FROM lifecycle_checkpoints
             WHERE run_id=? AND agent_id=? AND sha256=?
             ORDER BY created_at DESC LIMIT 1
          `).get(runId, input.agentId, input.checkpointSha256), "provider context checkpoint")
        : null;
      const chairSource = source.chair_agent_id === input.agentId;
      const lossSource: GenerationLossSource = {
        oldProviderSessionRef: stringField(source, "provider_session_ref"),
        newProviderSessionRef: input.providerSessionRef,
        sourceActionRef: {
          adapterId: stringField(source, "adapter_id"),
          actionId: stringField(source, "action_id"),
        },
        sourceAdapterContractDigest: stringField(source, "bridge_contract_digest"),
        sourcePrincipalGeneration: numberField(source, "principal_generation"),
        sourceBridgeGeneration: numberField(source, "bridge_generation"),
        bridgeOwnerKind: chairSource ? "chair" : "child",
        sourceBridgeRowId: `${runId}:${input.agentId}`,
        sourceBridgeRevision: numberField(source, "bridge_revision"),
        sourceCapabilityHash: stringField(source, "capability_hash"),
        sourceProjectSessionGeneration: chairSource ? numberField(source, "session_generation") : null,
        sourceRunGeneration: chairSource ? numberField(source, "run_revision") : null,
        sourceChairLeaseGeneration: chairSource ? numberField(source, "chair_generation") : null,
        checkpoint: checkpointRow === null
          ? input.checkpointSha256 === undefined
            ? { state: "absent", ref: null, digest: null }
            : { state: "invalid", ref: null, digest: null }
          : {
              state: "last-validated",
              ref: stringField(checkpointRow, "relative_path"),
              digest: `sha256:${input.checkpointSha256 as string}`,
            },
      };
      const observation = this.#generationLosses.recordObservationInCurrentTransaction({
        sourceEventId: input.sourceEventId,
        projectSessionId: stringField(source, "project_session_id"),
        runId,
        agentId: input.agentId,
        providerGeneration: input.providerSessionGeneration,
        contextRevision: input.contextRevision,
        evidenceDigest: input.evidenceDigest,
        observedAt: this.#clock(),
        lossSource,
      });
      const advanced = observation.classification === "generation-advance" ||
        observation.classification === "context-advance";
      if (advanced) {
        const provider = this.#database.prepare(`
          UPDATE provider_state
             SET provider_session_generation=?,context_revision=?,reconciled_checkpoint_sha256=?
           WHERE run_id=? AND agent_id=?
        `).run(
          input.providerSessionGeneration,
          input.contextRevision,
          checkpointValidated ? input.checkpointSha256 : null,
          runId,
          input.agentId,
        );
        if (provider.changes !== 1) throw new Error("provider context state changed before loss commit");
        const agent = this.#database.prepare(`
          UPDATE agents SET lifecycle='context-unreconciled',provider_session_ref=?
           WHERE run_id=? AND agent_id=?
        `).run(input.providerSessionRef, runId, input.agentId);
        if (agent.changes !== 1) throw new Error("provider context agent changed before loss commit");
        this.#database.prepare(`
          INSERT INTO delivery_freezes(run_id, agent_id, reason, created_at)
          VALUES (?, ?, 'context-unreconciled', ?)
          ON CONFLICT(run_id, agent_id)
          DO UPDATE SET reason=excluded.reason, created_at=excluded.created_at
        `).run(runId, input.agentId, this.#clock());
        this.#database.prepare(`
          UPDATE leases SET status='quarantined', updated_at=?
           WHERE run_id=? AND holder_agent_id=? AND status='active'
        `).run(this.#clock(), runId, input.agentId);
        this.#database.prepare(`
          UPDATE provider_session_turn_leases SET status='quarantined', updated_at=?
           WHERE run_id=? AND agent_id=? AND status='active'
        `).run(this.#clock(), runId, input.agentId);
      }
      const result = this.getAgentLifecycle(runId, input.agentId);
      this.#event(runId, "provider-state-reported", actorAgentId, { ...result, observation });
      return result;
    });
  }

  async requestLifecycle(
    runId: string,
    actorAgentId: string,
    input: {
      action: "compact" | "rotate" | "completion-ready" | "release";
      agentId: string;
      taskId: string;
      taskRevision: number;
      checkpoint: LifecycleCheckpoint;
      commandId: string;
    },
  ): Promise<LifecycleResult> {
    return await this.#trackProviderOperation(
      async () => await this.#requestLifecycle(runId, actorAgentId, input),
    );
  }

  async #requestLifecycle(
    runId: string,
    actorAgentId: string,
    input: {
      action: "compact" | "rotate" | "completion-ready" | "release";
      agentId: string;
      taskId: string;
      taskRevision: number;
      checkpoint: LifecycleCheckpoint;
      commandId: string;
    },
  ): Promise<LifecycleResult> {
    const replay = this.#commandJournal.read(runId, actorAgentId, input.commandId, input, isLifecycleResult);
    if (replay !== undefined) return replay;
    assertTaskOperationAdmitted(this.#database, runId, input.taskId);
    if (actorAgentId !== input.agentId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "agents may request lifecycle changes only for themselves");
    }
    if (!isLifecycleCheckpoint(input.checkpoint)) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "lifecycle checkpoint lacks a portable recovery field");
    }
    if (
      this.getAgentLifecycle(runId, input.agentId).contextState === "context-unreconciled" &&
      input.action !== "rotate"
    ) {
      throw new FabricError("CONTEXT_UNRECONCILED", "unreconciled provider context requires explicit rotation");
    }
    this.#verifyCheckpoint(runId, input.agentId, input.taskId, input.taskRevision, input.checkpoint);

    if (input.action === "completion-ready") {
      this.#database.prepare("UPDATE agents SET lifecycle = 'completion-ready' WHERE run_id = ? AND agent_id = ?").run(
        runId,
        actorAgentId,
      );
      const result = this.getAgentLifecycle(runId, actorAgentId);
      this.#recordLifecycleOperation(runId, input, null, null);
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }

    if (input.action === "release") {
      this.#assertReleaseReady(runId, actorAgentId, input.taskId);
      const agent = rowOrNotFound(
        this.#database.prepare("SELECT provider_session_ref FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, actorAgentId),
        "agent",
      );
      const resumeReference = typeof agent.provider_session_ref === "string" ? agent.provider_session_ref : null;
      if (resumeReference === null) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "provider release requires a bound session reference");
      }
      const adapterId = this.#adapterIdForAgent(runId, actorAgentId);
      const state = this.getAgentLifecycle(runId, actorAgentId);
      const actionId = `${input.commandId}:release`;
      const payload = { agentId: actorAgentId, resumeReference, generation: state.providerSessionGeneration };
      const providerActionTicket = this.#providerActionAdmission.preflightAgentAction({
        runId,
        actorAgentId,
        actionRef: { adapterId, actionId },
        canonicalInput: {
          schemaVersion: 1,
          owner: "lifecycle-release",
          operation: "release",
          payload,
        },
      });
      let action: ProviderActionResult;
      try {
        action = await this.#executeAdapterOperation({
          runId,
          adapterId,
          actionId,
          operation: "release",
          method: "release",
          payload,
          providerActionTicket,
        });
      } catch (error: unknown) {
        const actionExists = this.#database.prepare(`
          SELECT 1 FROM provider_actions WHERE run_id=? AND adapter_id=? AND action_id=?
        `).get(runId, adapterId, actionId) !== undefined;
        if (
          providerActionTicket.disposition === "resolving" && !actionExists &&
          !(error instanceof ProviderActionAdmissionTransactionError)
        ) {
          this.#providerActionAdmission.release(providerActionTicket, error);
        }
        throw error;
      }
      if (!isRow(action.result) || action.result.released !== true || action.result.deleted === true) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "adapter did not prove non-destructive release");
      }
      return this.#database.transaction(() => {
        this.#database.prepare(`
          UPDATE capabilities SET revoked_at=COALESCE(revoked_at,?) WHERE run_id=? AND agent_id=?
        `).run(this.#clock(), runId, actorAgentId);
        this.#database.prepare("UPDATE agents SET lifecycle = 'archived' WHERE run_id = ? AND agent_id = ?").run(
          runId,
          actorAgentId,
        );
        const bridgeState = this.#database.prepare(`
          SELECT bridge_state FROM agent_bridge_state WHERE run_id=? AND agent_id=?
        `).get(runId, actorAgentId);
        if (isRow(bridgeState) && bridgeState.bridge_state === "active") {
          const bridge = this.#database.prepare(`
            UPDATE agent_bridge_state
               SET bridge_state='none',provider_session_ref=NULL,provider_session_generation=NULL,
                   capability_hash=NULL,activation_evidence_digest=NULL,
                   revision=revision+1,updated_at=?
             WHERE run_id=? AND agent_id=? AND bridge_state='active'
          `).run(this.#clock(), runId, actorAgentId);
          if (bridge.changes !== 1) {
            throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "retained child bridge changed during release");
          }
        } else if (isRow(bridgeState) && bridgeState.bridge_state !== "none") {
          throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "provider release requires recovered child bridge custody");
        }
        const result = this.getAgentLifecycle(runId, actorAgentId);
        this.#recordLifecycleOperation(runId, input, resumeReference, null);
        this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
        return result;
      })();
    }

    if (input.action !== "compact" && input.action !== "rotate") {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "unsupported lifecycle rotation action");
    }
    return this.#acceptLifecycleRotation(runId, actorAgentId, {
      ...input,
      action: input.action,
    });
  }

  recordOperatorIntervention(
    runId: string,
    actorAgentId: string,
    input: {
      source: "fabric" | "integration";
      directInputProvenance: "complete" | "partial" | "unavailable";
      taskRevision: number;
      summary: string;
      commandId: string;
    },
  ): InterventionResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isInterventionResult, () => {
      const interventionId = uuidv7();
      this.#database
        .prepare(
          "INSERT INTO operator_interventions(intervention_id, run_id, actor_agent_id, source, direct_input_provenance, task_revision, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          interventionId,
          runId,
          actorAgentId,
          input.source,
          input.directInputProvenance,
          input.taskRevision,
          input.summary,
          this.#clock(),
        );
      this.#event(runId, "operator-intervention", actorAgentId, { interventionId, ...input });
      return { interventionId };
    });
  }

  recordVisibilityFailure(
    runId: string,
    actorAgentId: string,
    input: { kind: "herdr-telemetry" | "observer-pane" | "interactive-tui"; agentId: string; commandId: string },
  ): { visibility: "degraded" | "lost"; providerSession: "healthy" | "lost"; delivery: "active" | "frozen"; recovery?: "reattach-or-rotate" } {
    return this.#commandJournal.execute<{ visibility: "degraded" | "lost"; providerSession: "healthy" | "lost"; delivery: "active" | "frozen"; recovery?: "reattach-or-rotate" }>(runId, actorAgentId, input.commandId, input, (value): value is { visibility: "degraded" | "lost"; providerSession: "healthy" | "lost"; delivery: "active" | "frozen"; recovery?: "reattach-or-rotate" } =>
      isRow(value) && (value.visibility === "degraded" || value.visibility === "lost") && (value.providerSession === "healthy" || value.providerSession === "lost") && (value.delivery === "active" || value.delivery === "frozen"), () => {
      this.#assertChair(runId, actorAgentId);
      rowOrNotFound(this.#database.prepare("SELECT 1 FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, input.agentId), "visibility agent");
      if (input.kind === "interactive-tui") {
        this.#database.prepare("UPDATE agents SET lifecycle = 'suspended' WHERE run_id = ? AND agent_id = ?").run(runId, input.agentId);
        this.#database.prepare("INSERT INTO delivery_freezes(run_id, agent_id, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(run_id, agent_id) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at").run(runId, input.agentId, "interactive-tui-lost", this.#clock());
        const result = { visibility: "lost" as const, providerSession: "lost" as const, delivery: "frozen" as const, recovery: "reattach-or-rotate" as const };
        this.#event(runId, "visibility-degraded", actorAgentId, { ...input, ...result });
        return result;
      }
      const result = { visibility: "degraded" as const, providerSession: "healthy" as const, delivery: "active" as const };
      this.#event(runId, "visibility-degraded", actorAgentId, { ...input, ...result });
      return result;
    });
  }

  async dispatchProviderAction(
    runId: string,
    actorAgentId: string,
    input: ProviderActionDispatchRequest,
  ): Promise<ProviderActionResult> {
    return await this.#trackProviderOperation(
      async () => await this.#dispatchProviderAction(runId, actorAgentId, input),
    );
  }

  async #dispatchProviderAction(
    runId: string,
    actorAgentId: string,
    input: ProviderActionDispatchRequest,
  ): Promise<ProviderActionResult> {
    const replay = this.#commandJournal.read(runId, actorAgentId, input.commandId, input, isProviderActionResult);
    if (replay !== undefined) return replay;
    this.#assertChair(runId, actorAgentId);
    this.#assertGenericProviderAction(runId, input.adapterId, input.actionId);
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
    const taskValue = input.payload.taskId;
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
        typeof input.payload.model !== "string" || input.payload.model.trim().length === 0 ||
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
      if (existingPayload === undefined) this.#assertProviderPrincipalActive(runId, target.agentId);
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
      admittedInputPayload = this.#admitProviderPayload(
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
      this.#adapter(input.adapterId);
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
        this.#assertEphemeralProviderAuthority(runId, actorAgentId, input.authorityId as string);
        providerAuthorityId = input.authorityId as string;
        ephemeralProviderAuthorityId = providerAuthorityId;
      }
      admittedInputPayload = this.#admitProviderPayload(
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
      this.#assertAdapterModel(input.adapterId, admittedInputPayload);
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
      const result = this.getProviderAction(runId, input.adapterId, input.actionId);
      if (
        result.status === "terminal" || result.status === "quarantined" ||
        (ephemeralSpawn && ["prepared", "dispatched", "accepted"].includes(result.status))
      ) {
        this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
        return result;
      }
      return await this.reconcileProviderAction(runId, actorAgentId, {
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
        reservation: this.#providerBudgetReservation(
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
        assertAdapterOperation(capabilities, "spawn");
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
        return await this.#executeAdapterOperation({
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
            if (this.#closing) {
              throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "provider admission changed while Fabric was closing");
            }
            this.#assertChair(runId, actorAgentId);
            this.#assertProviderPrincipalActive(runId, actorAgentId);
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
            this.#assertEphemeralProviderAuthority(runId, actorAgentId, ephemeralProviderAuthorityId as string);
            this.#admitProviderPayload(
              runId,
              ephemeralProviderAuthorityId as string,
              taskBoundPayload,
              true,
              { actorAgentId, taskId },
            );
          },
        });
        } catch (error: unknown) {
          if (
            providerActionTicket.disposition === "resolving" &&
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
          });
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
    const capabilities = await this.#requestAdapter(input.adapterId, "capabilities", {});
    assertAdapterOperation(capabilities, input.operation);
    this.#database
      .prepare("UPDATE provider_actions SET status = 'dispatched', history_json = '[\"prepared\",\"dispatched\"]', execution_count = 1, updated_at = ? WHERE run_id = ? AND adapter_id = ? AND action_id = ?")
      .run(this.#clock(), runId, input.adapterId, input.actionId);
    try {
      const response = await this.#requestAdapter(input.adapterId, "dispatch", { actionId: input.actionId, operation: input.operation, payload: providerPayload });
      const result = providerActionResult(response, input.actionId);
      this.#persistProviderAction(runId, input.adapterId, input.actionId, response, result);
      this.#settleProviderTurnAndPump(runId, input.adapterId, input.actionId, result.status === "terminal" ? "terminal" : "ambiguous");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    } catch {
      const result: ProviderActionResult = {
        actionId: input.actionId,
        status: "ambiguous",
        history: ["prepared", "dispatched", "ambiguous"],
        executionCount: 1,
        effectCount: 0,
      };
      this.#persistProviderAction(runId, input.adapterId, input.actionId, { idempotencyProven: false }, result);
      this.#settleProviderTurnAndPump(runId, input.adapterId, input.actionId, "ambiguous");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }
  }

  async reconcileProviderAction(
    runId: string,
    actorAgentId: string,
    input: { adapterId: string; actionId: string; commandId: string },
  ): Promise<ProviderActionResult> {
    return await this.#trackProviderOperation(
      async () => {
        const replay = this.#commandJournal.read(
          runId,
          actorAgentId,
          input.commandId,
          input,
          isProviderActionResult,
        );
        if (replay !== undefined) return replay;
        this.#assertChair(runId, actorAgentId);
        this.#assertGenericProviderAction(runId, input.adapterId, input.actionId);
        const key = this.#providerActionOwnershipKey(runId, input.adapterId, input.actionId);
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
          if (concurrentReplay !== undefined) return concurrentReplay;
          this.#assertChair(runId, actorAgentId);
          this.#assertGenericProviderAction(runId, input.adapterId, input.actionId);
          const current = this.getProviderAction(runId, input.adapterId, input.actionId);
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
  ): Promise<ProviderActionResult> {
    this.#assertChair(runId, actorAgentId);
    this.#assertGenericProviderAction(runId, input.adapterId, input.actionId);
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
      this.#persistProviderAction(runId, input.adapterId, input.actionId, { idempotencyProven: false }, quarantined);
      this.#settleProviderTurnAndPump(runId, input.adapterId, input.actionId, "quarantined");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, quarantined);
      return quarantined;
    };
    let result = this.getProviderAction(runId, input.adapterId, input.actionId);
    if (this.#ownedProviderActions.has(this.#providerActionOwnershipKey(runId, input.adapterId, input.actionId))) {
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }
    if (result.status === "prepared") {
      if (answerBearing) {
        const adapterId = stringField(stored, "adapter_id");
        this.#enqueueDeferredProviderAction({
          runId,
          adapterId,
          actionId: input.actionId,
          execute: async () => await this.#completeAdapterOperation({
            runId,
            adapterId,
            actionId: input.actionId,
            operation: "spawn",
            method: "spawn",
            payload: storedPayload,
            requireProviderAnswer: true,
          }),
        });
        result = this.getProviderAction(runId, input.adapterId, input.actionId);
        this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
        return result;
      }
      if (typeof stored.target_agent_id === "string") {
        this.#assertProviderPrincipalActive(runId, stored.target_agent_id);
      }
      const adapterId = stringField(stored, "adapter_id");
      this.#database
        .prepare("UPDATE provider_actions SET status = 'dispatched', history_json = '[\"prepared\",\"dispatched\"]', execution_count = 1, updated_at = ? WHERE run_id = ? AND adapter_id = ? AND action_id = ?")
        .run(this.#clock(), runId, input.adapterId, input.actionId);
      try {
        const response = await this.#requestAdapter(adapterId, "dispatch", { actionId: input.actionId, operation: stringField(stored, "operation"), payload: storedPayload });
        result = providerActionResultWithRequiredAnswer(response, answerBearing, input.actionId);
        this.#persistProviderAction(runId, input.adapterId, input.actionId, response, result);
      } catch {
        result = {
          actionId: input.actionId,
          status: "ambiguous",
          history: ["prepared", "dispatched", "ambiguous"],
          executionCount: 1,
          effectCount: 0,
        };
        this.#persistProviderAction(runId, input.adapterId, input.actionId, { idempotencyProven: false }, result);
      }
      this.#settleProviderTurnAndPump(runId, input.adapterId, input.actionId, result.status === "terminal" ? "terminal" : "ambiguous");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }
    const resolvedEffectWithUnknownUsage = answerBearing &&
      (result.status === "terminal" || result.status === "quarantined") &&
      stored.budget_state === "usage-unknown";
    const resolvedEffectResult = result;
    const preserveResolvedEffect = (): ProviderActionResult => {
      this.#settleProviderTurnAndPump(
        runId,
        input.adapterId,
        input.actionId,
        resolvedEffectResult.status === "terminal" ? "terminal" : "quarantined",
      );
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, resolvedEffectResult);
      return resolvedEffectResult;
    };
    if (result.status !== "ambiguous" && result.status !== "dispatched" && !resolvedEffectWithUnknownUsage) {
      this.#settleProviderTurnAndPump(runId, input.adapterId, input.actionId, result.status === "terminal" ? "terminal" : "quarantined");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }
    const adapterId = stringField(stored, "adapter_id");
    let lookup: unknown;
    try {
      lookup = await this.#requestAdapter(adapterId, "lookup_action", { actionId: input.actionId });
    } catch {
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
        this.#persistProviderAction(runId, input.adapterId, input.actionId, lookup, result);
      } catch {
        if (resolvedEffectWithUnknownUsage) return preserveResolvedEffect();
        return quarantine(this.getProviderAction(runId, input.adapterId, input.actionId));
      }
    } else if (resolvedEffectWithUnknownUsage) {
      return preserveResolvedEffect();
    } else if (idempotencyProven && !answerBearing) {
      if (typeof stored.target_agent_id === "string") {
        this.#assertProviderPrincipalActive(runId, stored.target_agent_id);
      }
      const replayed = await this.#requestAdapter(adapterId, "dispatch", { actionId: input.actionId, operation: stringField(stored, "operation"), payload: storedPayload });
      try {
        result = providerActionResultWithRequiredAnswer(replayed, answerBearing, input.actionId);
      } catch {
        return quarantine(result);
      }
      try {
        this.#persistProviderAction(runId, input.adapterId, input.actionId, replayed, result);
      } catch {
        return quarantine(this.getProviderAction(runId, input.adapterId, input.actionId));
      }
    } else {
      return quarantine(lookedUp);
    }
    this.#settleProviderTurnAndPump(runId, input.adapterId, input.actionId, result.status === "terminal" ? "terminal" : "quarantined");
    this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
    return result;
  }

  getProviderAction(runId: string, adapterId: string, actionId: string): ProviderActionResult {
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

  createTeam(runId: string, actorAgentId: string, input: TeamCreateInput): TeamResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isTeamResult, () => {
      const { depth, parentTeamId } = this.#teamCreationPosition(runId, actorAgentId, input.parentTeamId);
      return this.#createTeam(runId, actorAgentId, input, depth, parentTeamId);
    });
  }

  #createTeam(
    runId: string,
    actorAgentId: string,
    input: TeamCreateInput,
    depth: number,
    parentTeamId: string | null,
  ): TeamResult {
    if (input.initialMembers.length > 5) {
      throw new FabricError("BUDGET_EXCEEDED", "team exceeds five workers");
    }
    validateIntegerBudget(input.reservedBudget);
    const leaderAuthority = normaliseAuthority(input.leader.authority, this.#workspaceRootForRun(runId));
    for (const [unit, reserved] of Object.entries(input.reservedBudget)) {
      if ((leaderAuthority.budget[unit] ?? -1) < reserved) {
        throw new FabricError("BUDGET_EXCEEDED", `team reservation exceeds leader authority for ${unit}`);
      }
      const memberTotal = input.initialMembers.reduce((sum, member) => sum + (member.authority.budget[unit] ?? 0), 0);
      if (memberTotal > reserved) throw new FabricError("BUDGET_EXCEEDED", `member reservations exceed team budget for ${unit}`);
    }
    const actorAuthority = rowOrNotFound(
      this.#database.prepare("SELECT authority_id FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, actorAgentId),
      "team creator",
    );
    const leaderGrant = this.delegateAuthority(runId, actorAgentId, {
      parentAuthorityId: stringField(actorAuthority, "authority_id"),
      authority: input.leader.authority,
      commandId: `${input.commandId}:leader-authority`,
    });
    this.#registerAgentIdentity(runId, actorAgentId, {
      agentId: input.leader.agentId,
      authorityId: leaderGrant.authorityId,
    });
    const initialMembers: Array<{ agentId: string; authorityId: string }> = [];
    for (const member of input.initialMembers) {
      const grant = this.delegateAuthority(runId, input.leader.agentId, {
        parentAuthorityId: leaderGrant.authorityId,
        authority: member.authority,
        commandId: `${input.commandId}:member-authority:${member.agentId}`,
      });
      this.#registerAgentIdentity(runId, input.leader.agentId, { agentId: member.agentId, authorityId: grant.authorityId });
      initialMembers.push({ agentId: member.agentId, authorityId: grant.authorityId });
    }
    const rootTask = this.#createTask(runId, actorAgentId, {
      taskId: input.rootTask.taskId,
      authorityId: leaderGrant.authorityId,
      proposedOwnerAgentId: input.leader.agentId,
      participantAgentIds: [input.leader.agentId, ...initialMembers.map((member) => member.agentId)],
      eligibleAgentIds: [input.leader.agentId],
      dependencies: [],
      objective: input.rootTask.objective,
      baseRevision: input.rootTask.baseRevision,
      commandId: `${input.commandId}:root-task`,
    }, false);
    const budgetId = `${input.teamId}:budget`;
    const initialReserved = Object.fromEntries(
      Object.keys(input.reservedBudget).map((unit) => [
        unit,
        input.initialMembers.reduce((sum, member) => sum + (member.authority.budget[unit] ?? 0), 0),
      ]),
    );
    this.#insertTeamRecords(runId, {
      teamId: input.teamId,
      parentTeamId,
      depth,
      leaderAgentId: input.leader.agentId,
      rootTaskId: rootTask.taskId,
      ownedTaskIds: [rootTask.taskId],
      memberAgentIds: [input.leader.agentId, ...initialMembers.map((member) => member.agentId)],
      authorityId: leaderGrant.authorityId,
      budgetId,
      budget: input.reservedBudget,
      initialReserved,
      discussionGroups: input.discussionGroups,
      actorAgentId,
    });
    return {
      ...this.getTeam(runId, input.teamId),
      leader: {
        agentId: input.leader.agentId,
        authorityId: leaderGrant.authorityId,
      },
      rootTask,
      initialMembers,
    };
  }

  #teamCreationPosition(runId: string, actorAgentId: string, requestedParentTeamId?: string): {
    depth: number;
    parentTeamId: string | null;
  } {
    const totalLeaders = numberField(
      rowOrNotFound(
        this.#database.prepare("SELECT COUNT(*) AS count FROM teams WHERE run_id = ?").get(runId),
        "leader count",
      ),
      "count",
    );
    if (totalLeaders >= 4) throw new FabricError("BUDGET_EXCEEDED", "run already has four team leaders");
    if (requestedParentTeamId === undefined) {
      this.#assertChair(runId, actorAgentId);
      return { depth: 1, parentTeamId: null };
    }
    const parent = rowOrNotFound(
      this.#database.prepare("SELECT depth, leader_agent_id, state FROM teams WHERE run_id = ? AND team_id = ?").get(runId, requestedParentTeamId),
      "parent team",
    );
    if (stringField(parent, "leader_agent_id") !== actorAgentId || stringField(parent, "state") !== "active") {
      throw new FabricError("CAPABILITY_FORBIDDEN", "only an active parent-team leader may create a child team");
    }
    const depth = numberField(parent, "depth") + 1;
    if (depth > 2) throw new FabricError("TEAM_DEPTH_EXCEEDED", "team depth exceeds two levels below the chair");
    return { depth, parentTeamId: requestedParentTeamId };
  }

  #insertTeamRecords(
    runId: string,
    input: {
      teamId: string;
      parentTeamId: string | null;
      depth: number;
      leaderAgentId: string;
      rootTaskId: string;
      ownedTaskIds: string[];
      memberAgentIds: string[];
      authorityId: string;
      budgetId: string;
      budget: Record<string, number>;
      initialReserved: Record<string, number>;
      discussionGroups: DiscussionGroupInput[];
      actorAgentId: string;
    },
  ): void {
    validateIntegerBudget(input.budget);
    validateIntegerBudget(input.initialReserved);
    for (const taskId of input.ownedTaskIds) {
      rowOrNotFound(this.#database.prepare("SELECT 1 FROM tasks WHERE run_id = ? AND task_id = ?").get(runId, taskId), `team task ${taskId}`);
      if (isRow(this.#database.prepare("SELECT 1 FROM team_owned_tasks WHERE run_id = ? AND task_id = ?").get(runId, taskId))) {
        throw new FabricError("TASK_SUBTREE_CONFLICT", `task is already owned by another team: ${taskId}`);
      }
    }
    this.#database
      .prepare(
        "INSERT INTO teams(run_id, team_id, parent_team_id, depth, leader_agent_id, original_leader_agent_id, root_task_id, authority_id, budget_id, state, generation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?)",
      )
      .run(
        runId,
        input.teamId,
        input.parentTeamId,
        input.depth,
        input.leaderAgentId,
        input.leaderAgentId,
        input.rootTaskId,
        input.authorityId,
        input.budgetId,
        this.#clock(),
      );
    for (const agentId of [...new Set(input.memberAgentIds)].sort()) {
      this.#database.prepare("INSERT INTO team_members(run_id, team_id, agent_id) VALUES (?, ?, ?)").run(runId, input.teamId, agentId);
    }
    for (const taskId of [...new Set(input.ownedTaskIds)].sort()) {
      this.#database.prepare("INSERT INTO team_owned_tasks(run_id, team_id, task_id) VALUES (?, ?, ?)").run(runId, input.teamId, taskId);
    }
    const parentBudgetId = input.parentTeamId === null ? null : this.getTeam(runId, input.parentTeamId).budgetId;
    if (parentBudgetId !== null) {
      for (const [unit, requested] of Object.entries(input.budget)) {
        const parent = rowOrNotFound(
          this.#database
            .prepare("SELECT granted, reserved, consumed, usage_unknown FROM budget_dimensions WHERE run_id = ? AND budget_id = ? AND unit_key = ?")
            .get(runId, parentBudgetId, unit),
          `parent team budget ${unit}`,
        );
        if (numberField(parent, "usage_unknown") === 1) throw new FabricError("BUDGET_USAGE_UNKNOWN", `parent team usage is unknown for ${unit}`);
        if (numberField(parent, "granted") - numberField(parent, "reserved") - numberField(parent, "consumed") < requested) {
          throw new FabricError("BUDGET_EXCEEDED", `child team exceeds inherited parent budget for ${unit}`);
        }
      }
      for (const [unit, requested] of Object.entries(input.budget)) {
        this.#database
          .prepare("UPDATE budget_dimensions SET reserved = reserved + ? WHERE run_id = ? AND budget_id = ? AND unit_key = ?")
          .run(requested, runId, parentBudgetId, unit);
      }
    }
    this.#database
      .prepare("INSERT INTO budgets(run_id, budget_id, parent_budget_id, team_id, owner_agent_id, state, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)")
      .run(runId, input.budgetId, parentBudgetId, input.teamId, input.leaderAgentId, this.#clock());
    for (const [unit, granted] of Object.entries(input.budget)) {
      this.#database
        .prepare("INSERT INTO budget_dimensions(run_id, budget_id, unit_key, granted, reserved) VALUES (?, ?, ?, ?, ?)")
        .run(runId, input.budgetId, unit, granted, input.initialReserved[unit] ?? 0);
    }
    for (const group of input.discussionGroups) {
      const members = [...new Set(group.memberAgentIds)];
      if (members.some((agentId) => !input.memberAgentIds.includes(agentId))) {
        throw new FabricError("MESSAGE_RELATIONSHIP_FORBIDDEN", "discussion group contains a non-team member");
      }
      this.#database
        .prepare("INSERT INTO discussion_groups(run_id, group_id, team_id, created_by) VALUES (?, ?, ?, ?)")
        .run(runId, group.groupId, input.teamId, input.actorAgentId);
      for (const agentId of members) {
        this.#database
          .prepare("INSERT INTO discussion_group_members(run_id, group_id, agent_id) VALUES (?, ?, ?)")
          .run(runId, group.groupId, agentId);
      }
    }
  }

  getTeam(runId: string, teamId: string): TeamResult {
    const team = rowOrNotFound(
      this.#database
        .prepare("SELECT parent_team_id, depth, leader_agent_id, successor_agent_id, root_task_id, budget_id, state, generation FROM teams WHERE run_id = ? AND team_id = ?")
        .get(runId, teamId),
      "team",
    );
    const parentValue = team.parent_team_id;
    const successorValue = team.successor_agent_id;
    if ((typeof parentValue !== "string" && parentValue !== null) || (typeof successorValue !== "string" && successorValue !== null)) {
      throw new Error("stored team relationship is invalid");
    }
    const ownedTaskIds = this.#database
      .prepare("SELECT task_id FROM team_owned_tasks WHERE run_id = ? AND team_id = ? ORDER BY task_id")
      .all(runId, teamId)
      .map((value) => stringField(rowOrNotFound(value, "team task"), "task_id"));
    const memberAgentIds = this.#database
      .prepare("SELECT agent_id FROM team_members WHERE run_id = ? AND team_id = ? ORDER BY agent_id")
      .all(runId, teamId)
      .map((value) => stringField(rowOrNotFound(value, "team member"), "agent_id"));
    const groups = this.#database
      .prepare("SELECT group_id FROM discussion_groups WHERE run_id = ? AND team_id = ? ORDER BY group_id")
      .all(runId, teamId)
      .map((value) => {
        const groupId = stringField(rowOrNotFound(value, "discussion group"), "group_id");
        const members = this.#database
          .prepare("SELECT agent_id FROM discussion_group_members WHERE run_id = ? AND group_id = ? ORDER BY agent_id")
          .all(runId, groupId)
          .map((item) => stringField(rowOrNotFound(item, "discussion member"), "agent_id"));
        return { groupId, memberAgentIds: members };
      });
    const budgetId = stringField(team, "budget_id");
    const budget = this.getBudget(runId, budgetId);
    const reservedBudget = Object.fromEntries(Object.entries(budget.dimensions).map(([unit, value]) => [unit, value.granted]));
    const state = stringField(team, "state");
    if (state !== "active" && state !== "frozen" && state !== "barrier-closed") throw new Error("stored team state is invalid");
    return {
      teamId,
      parentTeamId: parentValue,
      depth: numberField(team, "depth"),
      leaderAgentId: stringField(team, "leader_agent_id"),
      rootTaskId: stringField(team, "root_task_id"),
      ownedTaskIds,
      memberAgentIds,
      budgetId,
      state,
      generation: numberField(team, "generation"),
      successorAgentId: successorValue,
      discussionGroups: groups,
      reservedBudget,
    };
  }

  freezeSubtree(
    runId: string,
    actorAgentId: string,
    input: { teamId: string; expectedGeneration: number; reason: string; commandId: string },
  ): TeamResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isTeamResult, () => {
      this.#assertChair(runId, actorAgentId);
      const team = this.getTeam(runId, input.teamId);
      if (team.generation !== input.expectedGeneration) throw new FabricError("STALE_TEAM_GENERATION", "team generation changed");
      if (input.reason.length === 0) throw new FabricError("CAPABILITY_FORBIDDEN", "subtree freeze requires a reason");
      const teamIds = this.#teamSubtreeIds(runId, input.teamId);
      const placeholders = teamIds.map(() => "?").join(",");
      this.#database
        .prepare(`UPDATE teams SET state = 'frozen', generation = generation + 1, successor_agent_id = NULL WHERE run_id = ? AND team_id IN (${placeholders})`)
        .run(runId, ...teamIds);
      this.#event(runId, "subtree-frozen", actorAgentId, { teamId: input.teamId, teamIds, reason: input.reason });
      return this.getTeam(runId, input.teamId);
    });
  }

  #teamSubtreeIds(runId: string, teamId: string): string[] {
    return this.#database.prepare(`
      WITH RECURSIVE subtree(team_id) AS (
        SELECT team_id FROM teams WHERE run_id = ? AND team_id = ?
        UNION ALL
        SELECT child.team_id
          FROM teams child
          JOIN subtree parent ON child.parent_team_id = parent.team_id
         WHERE child.run_id = ?
      )
      SELECT team_id FROM subtree ORDER BY team_id
    `).all(runId, teamId, runId).map((value) => stringField(rowOrNotFound(value, "subtree team"), "team_id"));
  }

  adoptSubtree(
    runId: string,
    actorAgentId: string,
    input: {
      teamId: string;
      successorAgentId: string;
      expectedGeneration: number;
      handoffEvidence: string;
      commandId: string;
    },
  ): TeamResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isTeamResult, () => {
      this.#assertChair(runId, actorAgentId);
      const team = this.getTeam(runId, input.teamId);
      if (team.generation !== input.expectedGeneration) throw new FabricError("STALE_TEAM_GENERATION", "team generation changed");
      if (team.state !== "frozen" || input.handoffEvidence.length === 0) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "adoption requires a frozen team and handoff evidence");
      }
      rowOrNotFound(
        this.#database.prepare("SELECT 1 FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, input.successorAgentId),
        "successor agent",
      );
      const teamIds = this.#teamSubtreeIds(runId, input.teamId);
      const descendantIds = teamIds.filter((teamId) => teamId !== input.teamId);
      if (descendantIds.length > 0) {
        const placeholders = descendantIds.map(() => "?").join(",");
        this.#database
          .prepare(`UPDATE teams SET state = 'active', generation = generation + 1 WHERE run_id = ? AND team_id IN (${placeholders}) AND state = 'frozen'`)
          .run(runId, ...descendantIds);
      }
      this.#database
        .prepare(
          "UPDATE teams SET state = 'active', generation = generation + 1, leader_agent_id = ?, successor_agent_id = ?, handoff_evidence = ? WHERE run_id = ? AND team_id = ?",
        )
        .run(input.successorAgentId, input.successorAgentId, input.handoffEvidence, runId, input.teamId);
      this.#database
        .prepare("INSERT OR IGNORE INTO team_members(run_id, team_id, agent_id) VALUES (?, ?, ?)")
        .run(runId, input.teamId, input.successorAgentId);
      this.#database
        .prepare("UPDATE budgets SET owner_agent_id = ? WHERE run_id = ? AND budget_id = ?")
        .run(input.successorAgentId, runId, team.budgetId);
      this.#event(runId, "subtree-adopted", actorAgentId, { teamId: input.teamId, teamIds, successorAgentId: input.successorAgentId });
      return this.getTeam(runId, input.teamId);
    });
  }

  closeSubtreeBarrier(
    runId: string,
    actorAgentId: string,
    input: { teamId: string; expectedGeneration: number; commandId: string },
  ): { teamId: string; generation: number; closed: true } {
    const parse = (value: unknown): value is { teamId: string; generation: number; closed: true } =>
      isRow(value) && typeof value.teamId === "string" && typeof value.generation === "number" && value.closed === true;
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, parse, () => {
      assertScopedBarrierAllowed(this.#database, runId, input.teamId);
      const team = this.getTeam(runId, input.teamId);
      if (team.leaderAgentId !== actorAgentId) throw new FabricError("CAPABILITY_FORBIDDEN", "only the current team leader may close its barrier");
      if (team.generation !== input.expectedGeneration) throw new FabricError("STALE_TEAM_GENERATION", "team generation changed");
      if (team.state !== "active") throw new FabricError("BARRIER_PRECONDITION_FAILED", "only an active subtree may close its barrier");
      const teamIds = this.#teamSubtreeIds(runId, input.teamId);
      const teamPlaceholders = teamIds.map(() => "?").join(",");
      const taskIds = this.#database
        .prepare(`SELECT task_id FROM team_owned_tasks WHERE run_id = ? AND team_id IN (${teamPlaceholders}) ORDER BY task_id`)
        .all(runId, ...teamIds)
        .map((value) => stringField(rowOrNotFound(value, "subtree task"), "task_id"));
      const taskPlaceholders = taskIds.map(() => "?").join(",");
      const unresolved = taskIds.length === 0
        ? 0
        : numberField(
            rowOrNotFound(
              this.#database
                .prepare(`SELECT COUNT(*) AS count FROM tasks WHERE run_id = ? AND task_id IN (${taskPlaceholders}) AND state NOT IN ('complete', 'cancelled', 'degraded')`)
                .get(runId, ...taskIds),
              "subtree task count",
            ),
            "count",
          );
      const memberAgentIds = this.#database
        .prepare(`SELECT DISTINCT agent_id FROM team_members WHERE run_id = ? AND team_id IN (${teamPlaceholders}) ORDER BY agent_id`)
        .all(runId, ...teamIds)
        .map((value) => stringField(rowOrNotFound(value, "subtree member"), "agent_id"));
      const memberPlaceholders = memberAgentIds.map(() => "?").join(",");
      const activeLeases = memberAgentIds.length === 0 ? 0 : numberField(rowOrNotFound(this.#database.prepare(`SELECT COUNT(*) AS count FROM leases WHERE run_id = ? AND holder_agent_id IN (${memberPlaceholders}) AND status IN ('active', 'quarantined')`).get(runId, ...memberAgentIds), "subtree lease count"), "count");
      const openDeliveries = memberAgentIds.length === 0 ? 0 : numberField(rowOrNotFound(this.#database.prepare(`SELECT COUNT(*) AS count FROM deliveries d JOIN messages m ON m.message_id = d.message_id WHERE d.run_id = ? AND d.recipient_id IN (${memberPlaceholders}) AND m.requires_ack = 1 AND d.state NOT IN ('acknowledged', 'abandoned', 'expired')`).get(runId, ...memberAgentIds), "subtree delivery count"), "count");
      const openProviderActions = numberField(rowOrNotFound(this.#database.prepare("SELECT COUNT(*) AS count FROM provider_actions WHERE run_id = ? AND status NOT IN ('terminal', 'quarantined')").get(runId), "subtree provider action count"), "count");
      if (unresolved + activeLeases + openDeliveries + openProviderActions > 0) {
        throw new FabricError("BARRIER_PRECONDITION_FAILED", `subtree unresolved: tasks=${unresolved} leases=${activeLeases} deliveries=${openDeliveries} providerActions=${openProviderActions}`);
      }
      this.#assertTaskEvidence(runId, taskIds, true);
      const closedAt = this.#clock();
      for (const teamId of teamIds) {
        const current = this.getTeam(runId, teamId);
        this.#database
          .prepare("INSERT INTO subtree_barriers(run_id, team_id, generation, closed_at) VALUES (?, ?, ?, ?)")
          .run(runId, teamId, current.generation, closedAt);
      }
      this.#database.prepare(`UPDATE teams SET state = 'barrier-closed' WHERE run_id = ? AND team_id IN (${teamPlaceholders})`).run(runId, ...teamIds);
      return { teamId: input.teamId, generation: team.generation, closed: true };
    });
  }

  reserveBudget(
    runId: string,
    actorAgentId: string,
    input: {
      teamId: string;
      expectedTeamGeneration: number;
      parentBudgetId: string;
      budgetId: string;
      dimensions: Record<string, number>;
      commandId: string;
    },
  ): BudgetResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isBudgetResult, () => {
      const team = this.getTeam(runId, input.teamId);
      if (team.generation !== input.expectedTeamGeneration) throw new FabricError("STALE_TEAM_GENERATION", "team generation changed");
      if (team.state !== "active" || team.leaderAgentId !== actorAgentId || team.budgetId !== input.parentBudgetId) {
        throw new FabricError("CAPABILITY_FORBIDDEN", "only the current leader may reserve from the team budget");
      }
      validateIntegerBudget(input.dimensions);
      for (const [unit, requested] of Object.entries(input.dimensions)) {
        const parent = rowOrNotFound(
          this.#database
            .prepare("SELECT granted, reserved, consumed, usage_unknown FROM budget_dimensions WHERE run_id = ? AND budget_id = ? AND unit_key = ?")
            .get(runId, input.parentBudgetId, unit),
          `parent budget ${unit}`,
        );
        if (numberField(parent, "usage_unknown") === 1) throw new FabricError("BUDGET_USAGE_UNKNOWN", `budget usage is unknown for ${unit}`);
        if (numberField(parent, "granted") - numberField(parent, "reserved") - numberField(parent, "consumed") < requested) {
          throw new FabricError("BUDGET_EXCEEDED", `insufficient team budget for ${unit}`);
        }
      }
      this.#database
        .prepare("INSERT INTO budgets(run_id, budget_id, parent_budget_id, team_id, owner_agent_id, state, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)")
        .run(runId, input.budgetId, input.parentBudgetId, input.teamId, actorAgentId, this.#clock());
      for (const [unit, granted] of Object.entries(input.dimensions)) {
        this.#database
          .prepare("UPDATE budget_dimensions SET reserved = reserved + ? WHERE run_id = ? AND budget_id = ? AND unit_key = ?")
          .run(granted, runId, input.parentBudgetId, unit);
        this.#database
          .prepare("INSERT INTO budget_dimensions(run_id, budget_id, unit_key, granted) VALUES (?, ?, ?, ?)")
          .run(runId, input.budgetId, unit, granted);
      }
      return this.getBudget(runId, input.budgetId);
    });
  }

  recordBudgetUsage(
    runId: string,
    actorAgentId: string,
    input: { budgetId: string; usage: Record<string, number | null>; commandId: string },
  ): BudgetResult {
    validateBudgetUnitKeys(input.usage);
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isBudgetResult, () => {
      const budget = rowOrNotFound(
        this.#database.prepare("SELECT owner_agent_id, parent_budget_id FROM budgets WHERE run_id = ? AND budget_id = ?").get(runId, input.budgetId),
        "budget",
      );
      if (stringField(budget, "owner_agent_id") !== actorAgentId) throw new FabricError("CAPABILITY_FORBIDDEN", "only the budget owner may report usage");
      const changedUnits = new Set<string>();
      for (const [unit, amount] of Object.entries(input.usage)) {
        const dimension = rowOrNotFound(
          this.#database.prepare("SELECT granted, consumed FROM budget_dimensions WHERE run_id = ? AND budget_id = ? AND unit_key = ?").get(runId, input.budgetId, unit),
          `budget dimension ${unit}`,
        );
        if (amount === null) {
          this.#database.prepare("UPDATE budget_dimensions SET direct_usage_unknown = 1, usage_unknown = 1 WHERE run_id = ? AND budget_id = ? AND unit_key = ?").run(runId, input.budgetId, unit);
        } else {
          if (
            !Number.isInteger(amount) ||
            amount < numberField(dimension, "consumed") ||
            amount > numberField(dimension, "granted")
          ) {
            throw new FabricError("BUDGET_EXCEEDED", `invalid consumption for ${unit}`);
          }
          this.#database.prepare("UPDATE budget_dimensions SET consumed = ? WHERE run_id = ? AND budget_id = ? AND unit_key = ?").run(amount, runId, input.budgetId, unit);
        }
        changedUnits.add(unit);
      }
      for (const unit of changedUnits) this.#refreshBudgetUnknownAncestors(runId, input.budgetId, unit);
      return this.getBudget(runId, input.budgetId);
    });
  }

  reconcileBudgetUsage(
    runId: string,
    actorAgentId: string,
    input: { budgetId: string; consumed: Record<string, number>; commandId: string },
  ): BudgetResult {
    validateBudgetUnitKeys(input.consumed);
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isBudgetResult, () => {
      this.#assertChair(runId, actorAgentId);
      for (const [unit, amount] of Object.entries(input.consumed)) {
        const dimension = rowOrNotFound(
          this.#database.prepare("SELECT granted FROM budget_dimensions WHERE run_id = ? AND budget_id = ? AND unit_key = ?").get(runId, input.budgetId, unit),
          `budget dimension ${unit}`,
        );
        if (!Number.isInteger(amount) || amount < 0 || amount > numberField(dimension, "granted")) throw new FabricError("BUDGET_EXCEEDED", `invalid reconciliation for ${unit}`);
        this.#database
          .prepare("UPDATE budget_dimensions SET consumed = ?, direct_usage_unknown = 0 WHERE run_id = ? AND budget_id = ? AND unit_key = ?")
          .run(amount, runId, input.budgetId, unit);
        this.#refreshBudgetUnknownAncestors(runId, input.budgetId, unit);
      }
      return this.getBudget(runId, input.budgetId);
    });
  }

  releaseBudget(runId: string, actorAgentId: string, input: { budgetId: string; commandId: string }): BudgetResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isBudgetResult, () => {
      const budget = rowOrNotFound(
        this.#database.prepare("SELECT owner_agent_id, parent_budget_id, state FROM budgets WHERE run_id = ? AND budget_id = ?").get(runId, input.budgetId),
        "budget",
      );
      if (stringField(budget, "owner_agent_id") !== actorAgentId) throw new FabricError("CAPABILITY_FORBIDDEN", "only the budget owner may release it");
      if (stringField(budget, "state") === "released") return this.getBudget(runId, input.budgetId);
      const dimensions = this.getBudget(runId, input.budgetId).dimensions;
      if (Object.values(dimensions).some((dimension) => dimension.usageUnknown)) {
        this.#database.prepare("UPDATE budgets SET state = 'usage-unknown' WHERE run_id = ? AND budget_id = ?").run(runId, input.budgetId);
        return this.getBudget(runId, input.budgetId);
      }
      const returned: Record<string, number> = {};
      const parentBudgetId = budget.parent_budget_id;
      for (const [unit, dimension] of Object.entries(dimensions)) {
        const unused = dimension.granted - dimension.consumed;
        returned[unit] = unused;
        if (typeof parentBudgetId === "string") {
          this.#database
            .prepare("UPDATE budget_dimensions SET reserved = reserved - ?, consumed = consumed + ? WHERE run_id = ? AND budget_id = ? AND unit_key = ?")
            .run(dimension.granted, dimension.consumed, runId, parentBudgetId, unit);
        }
      }
      this.#database.prepare("UPDATE budgets SET state = 'released', returned_json = ? WHERE run_id = ? AND budget_id = ?").run(
        canonicalJson(returned),
        runId,
        input.budgetId,
      );
      return this.getBudget(runId, input.budgetId);
    });
  }

  getBudget(runId: string, budgetId: string): BudgetResult {
    const budget = rowOrNotFound(
      this.#database.prepare("SELECT parent_budget_id, state, returned_json FROM budgets WHERE run_id = ? AND budget_id = ?").get(runId, budgetId),
      "budget",
    );
    const parentValue = budget.parent_budget_id;
    if (typeof parentValue !== "string" && parentValue !== null) throw new Error("stored parent budget is invalid");
    const state = stringField(budget, "state");
    if (state !== "active" && state !== "usage-unknown" && state !== "released") throw new Error("stored budget state is invalid");
    const dimensions: Record<string, BudgetDimensionResult> = {};
    for (const value of this.#database
      .prepare("SELECT unit_key, granted, reserved, consumed, usage_unknown FROM budget_dimensions WHERE run_id = ? AND budget_id = ? ORDER BY unit_key")
      .all(runId, budgetId)) {
      const row = rowOrNotFound(value, "budget dimension");
      const granted = numberField(row, "granted");
      const reserved = numberField(row, "reserved");
      const consumed = numberField(row, "consumed");
      dimensions[stringField(row, "unit_key")] = {
        granted,
        reserved,
        consumed,
        available: granted - reserved - consumed,
        usageUnknown: numberField(row, "usage_unknown") === 1,
      };
    }
    const returnedValue: unknown = JSON.parse(stringField(budget, "returned_json"));
    if (!isNumberRecord(returnedValue)) throw new Error("stored returned budget is invalid");
    return { budgetId, parentBudgetId: parentValue, state, dimensions, returned: returnedValue };
  }

  #syncBudgetState(runId: string, budgetId: string): void {
    const unknown = numberField(
      rowOrNotFound(
        this.#database.prepare("SELECT COUNT(*) AS count FROM budget_dimensions WHERE run_id = ? AND budget_id = ? AND usage_unknown = 1").get(runId, budgetId),
        "unknown usage count",
      ),
      "count",
    );
    this.#database.prepare("UPDATE budgets SET state = ? WHERE run_id = ? AND budget_id = ? AND state != 'released'").run(
      unknown > 0 ? "usage-unknown" : "active",
      runId,
      budgetId,
    );
  }

  #refreshBudgetUnknownAncestors(runId: string, budgetId: string, unit: string): void {
    let currentBudgetId: string | null = budgetId;
    while (currentBudgetId !== null) {
      this.#database.prepare(`
        UPDATE budget_dimensions
           SET usage_unknown = CASE
             WHEN direct_usage_unknown = 1 OR EXISTS (
               SELECT 1
                 FROM budgets child
                 JOIN budget_dimensions child_dimension
                   ON child_dimension.run_id = child.run_id
                  AND child_dimension.budget_id = child.budget_id
                WHERE child.run_id = budget_dimensions.run_id
                  AND child.parent_budget_id = budget_dimensions.budget_id
                  AND child_dimension.unit_key = budget_dimensions.unit_key
                  AND child_dimension.usage_unknown = 1
             ) THEN 1 ELSE 0 END
         WHERE run_id = ? AND budget_id = ? AND unit_key = ?
      `).run(runId, currentBudgetId, unit);
      this.#syncBudgetState(runId, currentBudgetId);
      const current = rowOrNotFound(
        this.#database.prepare("SELECT parent_budget_id FROM budgets WHERE run_id = ? AND budget_id = ?").get(runId, currentBudgetId),
        "budget ancestor",
      );
      const parent = current.parent_budget_id;
      if (typeof parent !== "string" && parent !== null) throw new Error("stored parent budget is invalid");
      currentBudgetId = parent;
    }
  }

  publishArtifact(
    runId: string,
    actorAgentId: string,
    input: { taskId?: string; relativePath: string; sha256: string; commandId: string },
  ): ArtifactResult {
    if (!/^[0-9a-f]{64}$/u.test(input.sha256)) {
      throw new FabricError("ARTIFACT_DIGEST_INVALID", "artifact SHA-256 must be 64 lowercase hex characters");
    }
    if (
      input.relativePath.length === 0 ||
      isAbsolute(input.relativePath) ||
      input.relativePath.split(/[\\/]/u).includes("..")
    ) {
      throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "artifact path must be relative and traversal-free");
    }
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isArtifactResult, () => {
      const taskId = resolveTaskBindingForActiveWork(this.#database, runId, actorAgentId, input.taskId);
      if (taskId !== undefined) {
        const bound = this.#database.prepare(`
          SELECT 1 FROM tasks task WHERE task.run_id=? AND task.task_id=? AND (
            task.owner_agent_id=? OR EXISTS (
              SELECT 1 FROM task_participants participant
               WHERE participant.run_id=task.run_id AND participant.task_id=task.task_id
                 AND participant.agent_id=?
            )
          )
        `).get(runId, taskId, actorAgentId, actorAgentId);
        if (!isRow(bound)) throw new FabricError("CAPABILITY_FORBIDDEN", "artifact task is outside the actor task scope");
      }
      const registered = this.#artifactRegistry.registerAgentEvidence({
        runId,
        agentId: actorAgentId,
        taskId: taskId ?? null,
        requestedSourceKind: "run-file",
        evidenceKind: "artifact",
        relativePath: input.relativePath,
        digest: input.sha256,
        verifyBytes: false,
      });
      const result: ArtifactResult = {
        artifactId: registered.evidenceId,
        relativePath: input.relativePath,
        sha256: input.sha256,
      };
      this.#event(runId, "artifact-published", actorAgentId, result);
      return result;
    });
  }

  publishEvidence(
    runId: string,
    actorAgentId: string,
    input: EvidencePublishRequest,
  ): EvidenceArtifactRegistration {
    if (input.coordinationRunId !== runId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "evidence run binding differs from the authenticated run");
    }
    const root = resolveRunArtifactRoot(this.#database, runId);
    if (input.projectSessionId !== root.projectSessionId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "evidence session binding differs from the authenticated session");
    }
    return this.#commandJournal.execute(
      runId,
      actorAgentId,
      input.commandId,
      input,
      isEvidenceArtifactRegistration,
      () => {
        const taskId = resolveTaskBindingForActiveWork(this.#database, runId, actorAgentId, input.taskId);
        const registered = this.#artifactRegistry.registerAgentEvidence({
          runId,
          agentId: actorAgentId,
          taskId: taskId ?? null,
          requestedSourceKind: input.requestedSourceKind,
          evidenceKind: input.evidenceKind,
          relativePath: input.relativePath,
          digest: input.sourceDigest,
        });
        if (registered.projectSessionId === null || registered.coordinationRunId === null) {
          throw new Error("agent evidence registration lost its session/run binding");
        }
        return {
          evidenceId: registered.evidenceId,
          evidenceRevision: registered.evidenceRevision,
          projectId: registered.projectId as never,
          projectSessionId: registered.projectSessionId as never,
          coordinationRunId: registered.coordinationRunId as never,
          taskId: registered.taskId as never,
          sourceKind: registered.sourceKind as "project-file" | "run-file",
          evidenceKind: registered.evidenceKind,
          artifactRef: registered.artifactRef as never,
          publisherKind: "agent",
          publisherRef: registered.publisherRef as never,
          createdAt: new Date(registered.createdAt).toISOString() as never,
        };
      },
    );
  }

  closeBarrier(
    runId: string,
    actorAgentId: string,
    input: { scope: "run" | "stage"; stageId?: string; commandId: string },
  ): BarrierResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isBarrierResult, () => {
      this.#assertChair(runId, actorAgentId);
      const stageId = input.scope === "stage" ? input.stageId ?? "default" : "";
      assertScopedBarrierAllowed(this.#database, runId, `${runId}:${input.scope}:${stageId}`);
      const unreconciled = numberField(
        rowOrNotFound(
          this.#database
            .prepare("SELECT COUNT(*) AS count FROM agents WHERE run_id = ? AND lifecycle = 'context-unreconciled'")
            .get(runId),
          "unreconciled context count",
        ),
        "count",
      );
      if (unreconciled > 0) {
        throw new FabricError("CONTEXT_UNRECONCILED", "a provider context is not reconciled");
      }
      const openTasks = numberField(
        rowOrNotFound(
          this.#database
            .prepare("SELECT COUNT(*) AS count FROM tasks WHERE run_id = ? AND state NOT IN ('complete', 'cancelled', 'degraded')")
            .get(runId),
          "task count",
        ),
        "count",
      );
      const openLeases = numberField(
        rowOrNotFound(
          this.#database
            .prepare("SELECT COUNT(*) AS count FROM leases WHERE run_id = ? AND status IN ('active', 'quarantined')")
            .get(runId),
          "lease count",
        ),
        "count",
      );
      const openDeliveries = numberField(
        rowOrNotFound(
          this.#database
            .prepare(
              "SELECT COUNT(*) AS count FROM deliveries d JOIN messages m ON m.message_id = d.message_id WHERE d.run_id = ? AND m.requires_ack = 1 AND d.state NOT IN ('acknowledged', 'abandoned', 'expired')",
            )
            .get(runId),
          "delivery count",
        ),
        "count",
      );
      const openProviderActions = numberField(
        rowOrNotFound(this.#database.prepare("SELECT COUNT(*) AS count FROM provider_actions WHERE run_id = ? AND status NOT IN ('terminal', 'quarantined')").get(runId), "provider action count"),
        "count",
      );
      if (openTasks > 0 || openLeases > 0 || openDeliveries > 0 || openProviderActions > 0) {
        throw new FabricError(
          "BARRIER_PRECONDITION_FAILED",
          `barrier has unresolved work: tasks=${openTasks} leases=${openLeases} deliveries=${openDeliveries} providerActions=${openProviderActions}`,
        );
      }
      const taskIds = this.#database
        .prepare("SELECT task_id FROM tasks WHERE run_id = ? ORDER BY task_id")
        .all(runId)
        .map((value) => stringField(rowOrNotFound(value, "barrier task"), "task_id"));
      this.#assertTaskEvidence(runId, taskIds, input.scope === "stage");
      const receipt = this.exportReceipt(runId, actorAgentId, `${input.commandId}:receipt`);
      this.#database
        .prepare(
          "INSERT INTO barriers(run_id, scope, stage_id, state, closed_at, receipt_sha256) VALUES (?, ?, ?, 'closed', ?, ?) ON CONFLICT(run_id, scope, stage_id) DO UPDATE SET state = 'closed', closed_at = excluded.closed_at, receipt_sha256 = excluded.receipt_sha256",
        )
        .run(runId, input.scope, stageId, this.#clock(), receipt.sha256);
      const result: BarrierResult = { scope: input.scope, closed: true, receipt };
      this.#event(runId, "barrier-closed", actorAgentId, { scope: input.scope, stageId, receipt });
      return result;
    });
  }

  #assertTaskEvidence(runId: string, taskIds: string[], requireHandoff: boolean): void {
    if (taskIds.length === 0) return;
    const placeholders = taskIds.map(() => "?").join(",");
    const count = (sql: string): number =>
      numberField(rowOrNotFound(this.#database.prepare(sql).get(runId, ...taskIds), "barrier evidence count"), "count");
    const missingArtifacts = count(
      `SELECT COUNT(*) AS count FROM task_expected_artifacts e WHERE e.run_id = ? AND e.task_id IN (${placeholders}) AND NOT EXISTS (SELECT 1 FROM artifacts a WHERE a.run_id = e.run_id AND a.task_id = e.task_id AND a.relative_path = e.relative_path)`,
    );
    const failedChecks = count(
      `SELECT COUNT(*) AS count FROM task_objective_checks WHERE run_id = ? AND task_id IN (${placeholders}) AND status != 'pass'`,
    );
    const unresolvedGates = count(
      `SELECT COUNT(DISTINCT g.gate_id) AS count
         FROM scoped_gates g
         JOIN scoped_gate_tasks t ON t.gate_id=g.gate_id
        WHERE g.coordination_run_id=? AND t.task_id IN (${placeholders})
          AND g.status IN ('pending','deferred')`,
    );
    const missingCheckpoints = count(
      `SELECT COUNT(*) AS count FROM tasks t JOIN agents a ON a.run_id = t.run_id AND a.agent_id = t.owner_agent_id WHERE t.run_id = ? AND t.task_id IN (${placeholders}) AND a.provider_session_ref IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lifecycle_checkpoints c WHERE c.run_id = t.run_id AND c.task_id = t.task_id AND c.task_revision = t.revision)`,
    );
    const missingHandoffs = requireHandoff
      ? count(
          `SELECT COUNT(*) AS count FROM tasks t WHERE t.run_id = ? AND t.task_id IN (${placeholders}) AND NOT EXISTS (SELECT 1 FROM task_handoff_acknowledgements h WHERE h.run_id = t.run_id AND h.task_id = t.task_id AND h.task_revision = t.revision AND h.owner_lease_generation = t.owner_lease_generation AND h.acknowledged_by = h.intended_next_owner_agent_id)`,
        )
      : 0;
    if (missingArtifacts + failedChecks + unresolvedGates + missingCheckpoints + missingHandoffs > 0) {
      throw new FabricError(
        "BARRIER_PRECONDITION_FAILED",
        `barrier evidence incomplete: artifacts=${missingArtifacts} checks=${failedChecks} gates=${unresolvedGates} checkpoints=${missingCheckpoints} handoffs=${missingHandoffs}`,
      );
    }
  }

  getRunStatus(authenticatedRunId: string, requestedRunId: string): {
    runId: string;
    chairAgentId: string;
    barrier: { state: "open" | "closed" };
    counts: {
      agents: number;
      tasks: number;
      tasksTerminal: number;
      messages: number;
      deliveriesUnacknowledged: number;
      leasesActive: number;
    };
  } {
    if (authenticatedRunId !== requestedRunId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "cross-run reads are forbidden");
    }
    const run = rowOrNotFound(
      this.#database.prepare("SELECT chair_agent_id FROM runs WHERE run_id = ?").get(requestedRunId),
      "run",
    );
    const count = (sql: string): number =>
      numberField(rowOrNotFound(this.#database.prepare(sql).get(requestedRunId), "count"), "count");
    const barrier = this.#database
      .prepare("SELECT 1 FROM barriers WHERE run_id = ? AND scope = 'run' AND state = 'closed'")
      .get(requestedRunId);
    return {
      runId: requestedRunId,
      chairAgentId: stringField(run, "chair_agent_id"),
      barrier: { state: isRow(barrier) ? "closed" : "open" },
      counts: {
        agents: count("SELECT COUNT(*) AS count FROM agents WHERE run_id = ?"),
        tasks: count("SELECT COUNT(*) AS count FROM tasks WHERE run_id = ?"),
        tasksTerminal: count("SELECT COUNT(*) AS count FROM tasks WHERE run_id = ? AND state IN ('complete', 'cancelled', 'degraded')"),
        messages: count("SELECT COUNT(*) AS count FROM messages WHERE run_id = ?"),
        deliveriesUnacknowledged: count("SELECT COUNT(*) AS count FROM deliveries WHERE run_id = ? AND state NOT IN ('acknowledged', 'abandoned', 'expired')"),
        leasesActive: count("SELECT COUNT(*) AS count FROM leases WHERE run_id = ? AND status = 'active'"),
      },
    };
  }

  eventsAfter(runId: string, input: { cursor: number; limit: number }): EventsAfterResult {
    if (!Number.isSafeInteger(input.cursor) || input.cursor < 0) {
      throw new TypeError("event cursor must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new TypeError("event read limit must be an integer from 1 to 100");
    }
    const events = this.#database
      .prepare("SELECT s.sequence AS cursor, e.event_id, e.type, e.actor_agent_id, e.created_at, e.payload_json FROM observer_event_sequence s JOIN events e ON e.event_id = s.event_id WHERE e.run_id = ? AND s.sequence > ? ORDER BY s.sequence LIMIT ?")
      .all(runId, input.cursor, input.limit)
      .map((value) => {
        const row = rowOrNotFound(value, "event");
        const actor = row.actor_agent_id;
        if (actor !== null && typeof actor !== "string") throw new Error("stored event actor is invalid");
        const type = stringField(row, "type");
        let summary = actor === null ? type : `${type} by ${actor}`;
        if (type === "message-persisted" && actor !== null && typeof row.payload_json === "string") {
          const payload: unknown = JSON.parse(row.payload_json);
          if (isRow(payload) && typeof payload.messageId === "string" && isStringArray(payload.recipients)) {
            const message = rowOrNotFound(
              this.#database.prepare("SELECT kind, body FROM messages WHERE run_id = ? AND message_id = ?").get(runId, payload.messageId),
              "observer message",
            );
            const preview = renderSafePreview(stringField(message, "body"), 160);
            summary = `${stringField(message, "kind")} ${actor} → ${payload.recipients.join(", ")}: ${preview}`;
          }
        }
        return {
          cursor: numberField(row, "cursor"),
          eventId: stringField(row, "event_id"),
          type,
          actorAgentId: actor,
          createdAt: numberField(row, "created_at"),
          summary,
        };
      });
    return { events, nextCursor: events.at(-1)?.cursor ?? input.cursor };
  }

  listTasks(runId: string, requesterId: string): { tasks: TaskResult[] } {
    const tasks = this.#database
      .prepare("SELECT task_id FROM tasks WHERE run_id = ? ORDER BY task_id")
      .all(runId)
      .map((value) => stringField(rowOrNotFound(value, "task"), "task_id"))
      .filter((taskId) => this.#readPolicy.canReadTask(runId, requesterId, taskId))
      .map((taskId) => this.getTask(runId, taskId));
    return { tasks };
  }

  listAgents(runId: string, requesterId: string): { agents: Array<{
    agentId: string;
    parentAgentId: string | null;
    lifecycle: string;
    bridgeState: "active" | "none" | "lost";
    bridgeGeneration: number;
  }> } {
    const agents = this.#database
      .prepare(`
        SELECT a.agent_id, a.parent_agent_id, a.lifecycle,
               COALESCE(b.bridge_state, 'none') AS bridge_state,
               COALESCE(b.bridge_generation, 1) AS bridge_generation
          FROM agents a
          LEFT JOIN agent_bridge_state b ON b.run_id=a.run_id AND b.agent_id=a.agent_id
         WHERE a.run_id = ? ORDER BY a.agent_id
      `)
      .all(runId)
      .map((value) => {
        const row = rowOrNotFound(value, "agent");
        const parentValue = row.parent_agent_id;
        if (parentValue !== null && typeof parentValue !== "string") {
          throw new Error("stored parent agent is invalid");
        }
        const bridgeState = stringField(row, "bridge_state");
        if (bridgeState !== "active" && bridgeState !== "none" && bridgeState !== "lost") {
          throw new Error("stored agent bridge state is invalid");
        }
        return {
          agentId: stringField(row, "agent_id"),
          parentAgentId: parentValue,
          lifecycle: stringField(row, "lifecycle"),
          bridgeState: bridgeState as "active" | "none" | "lost",
          bridgeGeneration: numberField(row, "bridge_generation"),
        };
      })
      .filter((agent) => this.#readPolicy.canReadAgent(runId, requesterId, agent.agentId));
    return { agents };
  }

  listReceipts(runId: string, requesterId: string): { receipts: Array<{ relativePath: string; sha256: string; exportedAt: number }> } {
    if (!this.#readPolicy.isChair(runId, requesterId)) return { receipts: [] };
    const receipts = this.#database
      .prepare("SELECT relative_path, sha256, exported_at FROM receipt_exports WHERE run_id = ? ORDER BY exported_at, relative_path")
      .all(runId)
      .map((value) => {
        const row = rowOrNotFound(value, "receipt");
        return {
          relativePath: stringField(row, "relative_path"),
          sha256: stringField(row, "sha256"),
          exportedAt: numberField(row, "exported_at"),
        };
      });
    return { receipts };
  }

  exportReceipt(runId: string, actorAgentId: string, commandId: string): ReceiptResult {
    const payload = { operation: "export-receipt" };
    const replay = this.#commandJournal.read(runId, actorAgentId, commandId, payload, isReceiptResult);
    if (replay !== undefined) return replay;
    const run = rowOrNotFound(
      this.#database.prepare("SELECT chair_agent_id FROM runs WHERE run_id = ?").get(runId),
      "run",
    );
    if (stringField(run, "chair_agent_id") !== actorAgentId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "only the chair may export the receipt");
    }
    const artifactRoot = resolveRunArtifactRoot(this.#database, runId);
    const directoryValue = artifactRoot.artifactRoot;
    if (directoryValue === null) {
      throw new FabricError("NOT_FOUND", "run has no project receipt directory");
    }
    const receipt = this.#database.transaction(() => projectFabricReceipt(this.#database, runId))();
    assertFabricReceiptSchema(receipt);
    const bytes = `${JSON.stringify(receipt, null, 2)}\n`;
    mkdirSync(directoryValue, { recursive: true, mode: 0o700 });
    const digest = sha256(bytes);
    const relativePath = `fabric-receipt-${digest}.json`;
    writeFileSync(join(directoryValue, relativePath), bytes, { encoding: "utf8", mode: 0o600 });
    writeFileSync(join(directoryValue, "fabric-receipt.json"), bytes, { encoding: "utf8", mode: 0o600 });
    const result: ReceiptResult = { relativePath, schemaVersion: 2, sha256: digest };
    this.#database.transaction(() => {
      this.#database
        .prepare(
          "INSERT OR IGNORE INTO receipt_exports(run_id, relative_path, sha256, exported_at) VALUES (?, ?, ?, ?)",
        )
        .run(runId, relativePath, digest, this.#clock());
      this.#artifactRegistry.register({
        projectId: artifactRoot.projectId,
        projectSessionId: artifactRoot.projectSessionId,
        runId,
        taskId: null,
        publisherKind: "fabric",
        publisherRef: "fabric-receipt-export",
        publisherAgentId: null,
        sourceKind: artifactRoot.projectRelativeDirectory === "." ? "project-file" : "run-file",
        evidenceKind: "receipt",
        relativePath,
        digest,
      });
      this.#commandJournal.write(runId, actorAgentId, commandId, payload, result);
    })();
    return result;
  }

  #adapter(adapterId: string): NonNullable<FabricOpenOptions["adapters"]>[string] {
    const adapter = this.#adapters[adapterId];
    if (adapter === undefined) throw new FabricError("ADAPTER_DISABLED", `adapter is not activated: ${adapterId}`);
    return adapter;
  }

  #assertAdapterModel(adapterId: string, payload: Record<string, unknown>): void {
    const policy = this.#adapter(adapterId).modelPolicy;
    if (policy === undefined) return;
    const assessment = assessAdapterModelPolicy({
      modelFamily: typeof payload.modelFamily === "string" ? payload.modelFamily : "",
      modelId: typeof payload.model === "string" ? payload.model : null,
      allowedFamilies: policy.allowedFamilies,
      allowedModelPatterns: policy.allowedModelPatterns,
      requiresExplicitModel: policy.requiresExplicitModel,
    });
    if (assessment.allowed) return;
    if (assessment.reason === "model-required") {
      throw new FabricError("ADAPTER_MODEL_REQUIRED", `${adapterId} requires an explicit model`);
    }
    if (assessment.reason === "model-forbidden") {
      throw new FabricError("MODEL_NOT_ALLOWED", `${adapterId} model is outside trusted compatibility patterns`);
    }
    throw new FabricError("ADAPTER_FAMILY_FORBIDDEN", `${adapterId} model family is outside trusted compatibility policy`);
  }

  #providerBudgetReservation(
    authorityId: string,
    modelFamily: string,
    maximumTurns: number,
  ): Record<string, number> {
    const reservation: Record<string, number> = {};
    for (const value of this.#database.prepare(`
      SELECT unit_key,granted,reserved,consumed,usage_unknown
        FROM authority_budget WHERE authority_id=? ORDER BY unit_key
    `).all(authorityId)) {
      const row = rowOrNotFound(value, "provider authority budget");
      const unit = stringField(row, "unit_key");
      const relevant = unit === "turns" || unit === "provider_calls" ||
        unit === "concurrent_turns" || unit === "wall_clock_milliseconds" ||
        unit.startsWith("cost:") || unit === `input_tokens:${modelFamily}` ||
        unit === `output_tokens:${modelFamily}`;
      if (!relevant) continue;
      if (numberField(row, "usage_unknown") === 1) {
        throw new FabricError("BUDGET_USAGE_UNKNOWN", `delegated provider usage is unknown for ${unit}`);
      }
      const available = numberField(row, "granted") - numberField(row, "reserved") - numberField(row, "consumed");
      const amount = unit === "turns" ? maximumTurns
        : unit === "provider_calls" || unit === "concurrent_turns" ? 1
          : available;
      if (amount < 1 || amount > available) {
        throw new FabricError("BUDGET_EXCEEDED", `delegated provider budget is exhausted for ${unit}`);
      }
      reservation[unit] = amount;
    }
    if (reservation.turns !== maximumTurns) {
      throw new FabricError("BUDGET_EXCEEDED", "delegated provider authority has no positive hard turns ceiling");
    }
    return reservation;
  }

  #admitProviderPayload(
    runId: string,
    authorityId: string,
    payload: Record<string, unknown>,
    validateCurrent = true,
    projectionContext?:
      | { actorAgentId: string; taskId: string | undefined }
      | { workspacePath: string },
  ): Record<string, unknown> {
    const row = rowOrNotFound(
      this.#database.prepare("SELECT authority_json, authority_hash FROM authorities WHERE run_id = ? AND authority_id = ?").get(runId, authorityId),
      "provider authority",
    );
    const authority = parseAuthority(row);
    const trustedProjection = projectionContext === undefined
      ? undefined
      : "workspacePath" in projectionContext
        ? this.#replayWorkspaceWriteOfflineProjection(runId, authority, payload, projectionContext.workspacePath)
        : this.#workspaceWriteOfflineProjection(
          runId,
          projectionContext.actorAgentId,
          projectionContext.taskId,
          authority,
          payload,
        );
    const admittedPayload = trustedProjection === undefined
      ? payload
      : { ...payload, cwd: trustedProjection.workspacePath };
    return compileProviderPayload({
      authority,
      workspaceRoot: () => this.#workspaceRootForRun(runId),
      payload: admittedPayload,
      ...(trustedProjection === undefined ? {} : { trustedProjection }),
      ...(validateCurrent
        ? { now: this.#clock(), validateCurrent: true }
        : { now: null, validateCurrent: false }),
    });
  }

  #replayWorkspaceWriteOfflineProjection(
    runId: string,
    authority: AuthorityInput,
    payload: Record<string, unknown>,
    workspacePath: string,
  ): { kind: "workspace-write-offline"; workspacePath: string } | undefined {
    if (payload.cwd !== undefined && typeof payload.cwd !== "string") return undefined;
    try {
      const workspaceRoot = this.#workspaceRootForRun(runId);
      const relativeWorkspacePath = relative(workspaceRoot, workspacePath);
      if (
        relativeWorkspacePath === ".." || relativeWorkspacePath.startsWith(`..${sep}`) ||
        isAbsolute(relativeWorkspacePath)
      ) return undefined;
      const replayPath = relativeWorkspacePath === ""
        ? "."
        : normalize(relativeWorkspacePath).replaceAll(sep, "/");
      const requestedPath = canonicalAuthorityPath(
        workspaceRoot,
        payload.cwd ?? authority.sourcePaths[0] ?? ".",
      );
      return requestedPath === replayPath ? { kind: "workspace-write-offline", workspacePath: replayPath } : undefined;
    } catch {
      return undefined;
    }
  }

  #workspaceWriteOfflineProjection(
    runId: string,
    actorAgentId: string,
    taskId: string | undefined,
    authority: AuthorityInput,
    payload: Record<string, unknown>,
  ): { kind: "workspace-write-offline"; workspacePath: string } | undefined {
    if (taskId === undefined) return undefined;
    if (payload.cwd !== undefined && typeof payload.cwd !== "string") return undefined;
    const requestedCwd = payload.cwd ?? authority.sourcePaths[0] ?? ".";
    let workspacePath: string;
    try {
      workspacePath = canonicalAuthorityPath(this.#workspaceRootForRun(runId), requestedCwd);
    } catch {
      return undefined;
    }
    const leaseRows = this.#database.prepare(`
      SELECT scope.canonical_path
        FROM leases lease
        JOIN write_scope_entries scope ON scope.lease_id=lease.lease_id
        JOIN task_obligation_bindings binding
          ON binding.coordination_run_id=lease.run_id
         AND binding.obligation_kind='write-lease'
         AND binding.obligation_id=lease.lease_id
       WHERE lease.run_id=? AND lease.kind='write' AND lease.holder_agent_id=?
         AND lease.status='active' AND lease.expires_at>?
         AND binding.task_id=? AND binding.state='active'
    `).all(runId, actorAgentId, this.#clock(), taskId);
    if (!leaseRows.some((value) => isRow(value) && pathContains(stringField(value, "canonical_path"), workspacePath))) {
      return undefined;
    }
    return { kind: "workspace-write-offline", workspacePath };
  }

  #assertProviderPrincipalActive(runId: string, agentId: string): void {
    const principal = rowOrNotFound(this.#database.prepare(`
      SELECT c.revoked_at, c.expires_at, agent.lifecycle
        FROM capabilities c
        JOIN agents agent ON agent.run_id=c.run_id AND agent.agent_id=c.agent_id
       WHERE c.run_id = ? AND c.agent_id = ?
       ORDER BY c.principal_generation DESC LIMIT 1
    `).get(runId, agentId), "provider principal");
    if (principal.revoked_at !== null || numberField(principal, "expires_at") <= this.#clock()) {
      throw new FabricError("AUTHENTICATION_FAILED", "provider principal is revoked or expired");
    }
    if (principal.lifecycle === "suspended" || principal.lifecycle === "context-unreconciled") {
      throw new FabricError("CONTEXT_UNRECONCILED", "provider principal requires explicit lifecycle recovery");
    }
  }

  #assertEphemeralProviderAuthority(runId: string, actorAgentId: string, authorityId: string): void {
    const actor = rowOrNotFound(
      this.#database.prepare("SELECT authority_id FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, actorAgentId),
      "provider actor",
    );
    const delegated = rowOrNotFound(
      this.#database.prepare("SELECT parent_authority_id FROM authorities WHERE run_id = ? AND authority_id = ?")
        .get(runId, authorityId),
      "ephemeral provider authority",
    );
    if (delegated.parent_authority_id !== stringField(actor, "authority_id")) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "ephemeral provider authority is not delegated by the chair");
    }
  }

  #adapterIdForAgent(runId: string, agentId: string): string {
    const binding = rowOrNotFound(
      this.#database.prepare("SELECT adapter_id FROM agent_adapter_bindings WHERE run_id = ? AND agent_id = ?").get(runId, agentId),
      "agent adapter binding",
    );
    return stringField(binding, "adapter_id");
  }

  async #executeAdapterOperation(input: {
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
      return this.getProviderAction(input.runId, input.adapterId, input.actionId);
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
        }, () => {
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
    const complete = async (): Promise<ProviderActionResult> => await this.#completeAdapterOperation(input);
    if (deferred) {
      this.#enqueueDeferredProviderAction({
        runId: input.runId,
        adapterId: input.adapterId,
        actionId: input.actionId,
        execute: complete,
      });
      return receipt;
    }
    return await complete();
  }

  async #completeAdapterOperation(input: {
    runId: string;
    adapterId: string;
    actionId: string;
    operation: string;
    method: string;
    payload: Record<string, unknown>;
    requireProviderAnswer?: true;
  }): Promise<ProviderActionResult> {
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
      this.#persistProviderAction(input.runId, input.adapterId, input.actionId, { idempotencyProven: true }, result);
      return result;
    } catch (error: unknown) {
      const ambiguous: ProviderActionResult = {
        actionId: input.actionId,
        status: "ambiguous",
        history: ["prepared", "dispatched", "ambiguous"],
        executionCount: 1,
        effectCount: 0,
      };
      this.#persistProviderAction(input.runId, input.adapterId, input.actionId, { idempotencyProven: false }, ambiguous);
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", `adapter ${input.operation} result is ambiguous`, { cause: error });
    }
  }

  #lifecycleRotationSourceVectorDigest(
    runId: string,
    agentId: string,
    taskId: string,
    checkpoint: LifecycleCheckpoint,
    adoptionDeliveries: readonly Readonly<{
      deliveryId: string;
      claimGeneration: number;
      requesterAgentId: string;
      targetProviderSession: string;
    }>[],
  ): string {
    const task = rowOrNotFound(this.#database.prepare(`
      SELECT task_id,authority_id,state,owner_agent_id,revision,owner_lease_generation
        FROM tasks WHERE run_id=? AND task_id=?
    `).get(runId, taskId), "lifecycle task");
    const mailbox = rowOrNotFound(this.#database.prepare(`
      SELECT next_sequence,contiguous_watermark
        FROM mailbox_state WHERE run_id=? AND recipient_id=?
    `).get(runId, agentId), "lifecycle mailbox");
    const deliveries = this.#database.prepare(`
      SELECT delivery_id,message_id,mailbox_sequence,state,attempt_count,claim_deadline,
             acknowledged_at,resolution_reason,resolved_at
        FROM deliveries WHERE run_id=? AND recipient_id=?
       ORDER BY mailbox_sequence,delivery_id
    `).all(runId, agentId);
    const children = this.#database.prepare(`
      SELECT agent_id,lifecycle,provider_session_ref
        FROM agents WHERE run_id=? AND parent_agent_id=?
       ORDER BY agent_id
    `).all(runId, agentId);
    const childTasks = this.#database.prepare(`
      SELECT task.task_id,task.state,task.owner_agent_id,task.revision,task.owner_lease_generation
        FROM tasks task JOIN agents child
          ON child.run_id=task.run_id AND child.agent_id=task.owner_agent_id
       WHERE task.run_id=? AND child.parent_agent_id=?
       ORDER BY task.task_id
    `).all(runId, agentId);
    const ownedTasks = this.#database.prepare(`
      SELECT task_id,state,revision,owner_lease_generation
        FROM tasks WHERE run_id=? AND owner_agent_id=?
       ORDER BY task_id
    `).all(runId, agentId);
    const capturedDeliveries = adoptionDeliveries.map((captured) => {
      const live = this.#database.prepare(`
        SELECT result_delivery_id AS deliveryId,claim_generation AS claimGeneration,
               requester_agent_id AS requesterAgentId,target_provider_session AS targetProviderSession,state
          FROM result_deliveries WHERE result_delivery_id=? AND run_id=?
      `).get(captured.deliveryId, runId);
      return isRow(live) && ["claimed", "provider-accepted"].includes(String(live.state))
        ? { deliveryId: live.deliveryId, claimGeneration: live.claimGeneration,
            requesterAgentId: live.requesterAgentId, targetProviderSession: live.targetProviderSession,
            eligibility: "captured" }
        : null;
    });
    return sha256Digest(canonicalJson({
      schemaVersion: 1,
      task,
      mailbox,
      deliveries,
      children,
      childTasks,
      ownedTasks,
      checkpoint: {
        relativePath: checkpoint.relativePath,
        sha256: checkpoint.sha256,
        mailboxWatermark: checkpoint.mailboxWatermark,
        acknowledgedAboveWatermark: [...checkpoint.acknowledgedAboveWatermark].sort(),
        inFlightChildren: [...checkpoint.inFlightChildren].sort(),
        openWork: [...checkpoint.openWork].sort(),
      },
      capturedDeliveries,
    }));
  }

  #acceptLifecycleRotation(
    runId: string,
    agentId: string,
    input: {
      action: "compact" | "rotate";
      agentId: string;
      taskId: string;
      taskRevision: number;
      checkpoint: LifecycleCheckpoint;
      commandId: string;
    },
  ): LifecycleAcceptedSuspendedV1 {
    if (this.#fabricSocketPath === undefined) {
      throw new FabricError("CAPABILITY_UNAVAILABLE", "retained lifecycle rotation requires the Fabric daemon socket");
    }
    const source = rowOrNotFound(this.#database.prepare(`
      SELECT run.project_session_id,run.revision AS run_revision,
             COALESCE(run.chair_generation,1) AS chair_generation,
             session.generation AS session_generation,agent.authority_id,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.provider_session_ref ELSE child_bridge.provider_session_ref END AS provider_session_ref,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.provider_adapter_id ELSE child_bridge.adapter_id END AS adapter_id,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.provider_action_id ELSE child_bridge.action_id END AS source_action_id,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.provider_session_generation ELSE child_bridge.provider_session_generation END AS provider_session_generation,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.bridge_generation ELSE child_bridge.bridge_generation END AS bridge_generation,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.revision ELSE child_bridge.revision END AS bridge_revision,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.capability_hash ELSE child_bridge.capability_hash END AS capability_hash,
             CASE WHEN agent.agent_id=run.chair_agent_id
               THEN chair_bridge.provider_contract_digest ELSE custody.bridge_contract_digest END AS bridge_contract_digest,
             CASE WHEN agent.agent_id=run.chair_agent_id THEN 'chair' ELSE 'child' END AS bridge_owner_kind,
             capability.principal_generation,capability.expires_at,
             turn.action_id AS caller_action_id,turn.turn_lease_generation,
             mailbox.contiguous_watermark
        FROM runs run
        JOIN project_sessions session ON session.project_session_id=run.project_session_id
        JOIN agents agent ON agent.run_id=run.run_id AND agent.agent_id=?
        LEFT JOIN agent_bridge_state child_bridge
          ON child_bridge.run_id=agent.run_id AND child_bridge.agent_id=agent.agent_id
         AND child_bridge.bridge_state='active'
        LEFT JOIN launched_chair_bridge_state chair_bridge
          ON chair_bridge.project_session_id=run.project_session_id
         AND chair_bridge.coordination_run_id=run.run_id
         AND chair_bridge.chair_agent_id=agent.agent_id
         AND chair_bridge.state='active'
        LEFT JOIN provider_agent_custody custody
          ON custody.run_id=child_bridge.run_id AND custody.adapter_id=child_bridge.adapter_id
         AND custody.action_id=child_bridge.action_id
        JOIN capabilities capability
          ON capability.run_id=agent.run_id AND capability.agent_id=agent.agent_id
         AND capability.token_hash=CASE WHEN agent.agent_id=run.chair_agent_id
           THEN chair_bridge.capability_hash ELSE child_bridge.capability_hash END
         AND capability.revoked_at IS NULL
        JOIN provider_session_turn_leases turn
          ON turn.run_id=agent.run_id AND turn.agent_id=agent.agent_id
         AND turn.adapter_id=CASE WHEN agent.agent_id=run.chair_agent_id
           THEN chair_bridge.provider_adapter_id ELSE child_bridge.adapter_id END AND turn.status='active'
        JOIN mailbox_state mailbox
          ON mailbox.run_id=agent.run_id AND mailbox.recipient_id=agent.agent_id
       WHERE run.run_id=? AND (
         (agent.agent_id=run.chair_agent_id AND chair_bridge.state='active') OR
         (agent.agent_id<>run.chair_agent_id AND child_bridge.bridge_state='active' AND custody.action_id IS NOT NULL)
       )
    `).get(agentId, runId), "active lifecycle caller turn");
    const adapterId = stringField(source, "adapter_id");
    const actionId = `${input.commandId}:spawn`;
    const custodyId = `lifecycle:${sha256(canonicalJson({ runId, agentId, commandId: input.commandId }))}`;
    const sourceProviderGeneration = numberField(source, "provider_session_generation");
    const sourcePrincipalGeneration = numberField(source, "principal_generation");
    const sourceBridgeGeneration = numberField(source, "bridge_generation");
    const bridgeOwnerKind = stringField(source, "bridge_owner_kind") as "chair" | "child";
    if (bridgeOwnerKind === "chair") {
      throw new FabricError(
        "CAPABILITY_UNAVAILABLE",
        "true-chair lifecycle rotation requires the disabled ordinal-two review authority path",
      );
    }
    const generationReservation = {
      runId,
      agentId,
      bridgeOwnerKind,
      sourceProviderGeneration,
      sourcePrincipalGeneration,
      sourceBridgeGeneration,
    };
    const targetGenerations = this.#lifecycleRotations.nextGenerations(generationReservation);
    const targetProviderGeneration = targetGenerations.providerGeneration;
    const targetPrincipalGeneration = targetGenerations.principalGeneration;
    const targetBridgeGeneration = targetGenerations.bridgeGeneration;
    const checkpointDigest = `sha256:${input.checkpoint.sha256}`;
    const launchAttestationChallenge = randomBytes(32).toString("hex");
    const launchAttestationChallengeDigest = `sha256:${createHash("sha256")
      .update(Buffer.from(launchAttestationChallenge, "hex")).digest("hex")}`;
    const stagedCapability = `afc_${randomBytes(32).toString("base64url")}`;
    const stagedCapabilityHash = sha256(stagedCapability);
    const prompt = lifecycleHandoffPrompt({
      agentId,
      taskId: input.taskId,
      taskRevision: input.taskRevision,
      checkpoint: input.checkpoint,
      nextProviderSessionGeneration: targetProviderGeneration,
    });
    const actionPayload = (storedActionId: string): Row => {
      const action = rowOrNotFound(this.#database.prepare(`
        SELECT payload_json FROM provider_actions
         WHERE run_id=? AND adapter_id=? AND action_id=?
      `).get(runId, adapterId, storedActionId), "lifecycle provider action");
      const payload: unknown = JSON.parse(stringField(action, "payload_json"));
      if (!isRow(payload)) throw new Error("lifecycle provider action payload is not an object");
      return payload;
    };
    const sessionControls: Record<string, string> = {};
    for (const payload of [
      actionPayload(stringField(source, "source_action_id")),
      actionPayload(stringField(source, "caller_action_id")),
    ]) {
      for (const key of ["cwd", "model", "modelFamily", "effort"] as const) {
        if (typeof payload[key] === "string") sessionControls[key] = payload[key];
      }
    }
    const providerPayload = {
      schemaVersion: 1,
      action: input.action,
      agentId,
      ...sessionControls,
      priorResumeReference: stringField(source, "provider_session_ref"),
      generation: targetProviderGeneration,
      prompt,
    };
    const ticket = this.#providerActionAdmission.preflightAgentAction({
      runId,
      actorAgentId: agentId,
      actionRef: { adapterId, actionId },
      canonicalInput: {
        schemaVersion: 1,
        owner: "lifecycle-rotation",
        action: input.action,
        taskId: input.taskId,
        taskRevision: input.taskRevision,
        checkpoint: input.checkpoint,
        sourceActionId: stringField(source, "source_action_id"),
        callerActionId: stringField(source, "caller_action_id"),
        targetProviderGeneration,
        targetPrincipalGeneration,
        targetBridgeGeneration,
      },
    });
    if (ticket.disposition === "admitted") {
      const replay = this.#commandJournal.read(runId, agentId, input.commandId, input, isLifecycleResult);
      if (replay?.kind === "accepted-suspended") return replay;
      throw new FabricError("DEDUPE_CONFLICT", "admitted lifecycle rotation lacks its command receipt");
    }
    let capturedWriteLeases: Array<Readonly<{ leaseId: string; generation: number }>> = [];
    const capturedAdoptionDeliveries = this.#database.prepare(`
      SELECT result_delivery_id AS deliveryId,claim_generation AS claimGeneration,
             requester_agent_id AS requesterAgentId,target_provider_session AS targetProviderSession,
             state,revision
        FROM result_deliveries
       WHERE run_id=? AND requester_agent_id=? AND target_provider_session=?
         AND state IN ('claimed','provider-accepted')
       ORDER BY result_delivery_id
    `).all(runId, agentId, stringField(source, "provider_session_ref")).map((candidate) => {
      const delivery = rowOrNotFound(candidate, "lifecycle adoption delivery");
      return {
        deliveryId: stringField(delivery, "deliveryId"),
        claimGeneration: numberField(delivery, "claimGeneration"),
        requesterAgentId: stringField(delivery, "requesterAgentId"),
        targetProviderSession: stringField(delivery, "targetProviderSession"),
        state: stringField(delivery, "state") as "claimed" | "provider-accepted",
        revision: numberField(delivery, "revision"),
      };
    });
    let quarantinedWriteSetDigest = sha256Digest(canonicalJson(capturedWriteLeases));
    const adoptionDeliverySetDigest = sha256Digest(canonicalJson(capturedAdoptionDeliveries.map((delivery) => ({
      deliveryId: delivery.deliveryId,
      claimGeneration: delivery.claimGeneration,
      requesterAgentId: delivery.requesterAgentId,
      sourceState: delivery.state,
    }))));
    const stableSourceVectorDigest = this.#lifecycleRotationSourceVectorDigest(
      runId, agentId, input.taskId, input.checkpoint, capturedAdoptionDeliveries,
    );
    const openWorkSetDigest = sha256Digest(canonicalJson([...input.checkpoint.openWork].sort()));
    const predecessorTurnSetDigest = sha256Digest(canonicalJson([{
      adapterId,
      actionId: stringField(source, "caller_action_id"),
      turnLeaseGeneration: numberField(source, "turn_lease_generation"),
    }]));
    const acceptedBase = {
      schemaVersion: 1 as const,
      kind: "accepted-suspended" as const,
      projectSessionId: stringField(source, "project_session_id"),
      coordinationRunId: runId,
      action: input.action,
      agentId,
      taskId: input.taskId,
      taskRevision: input.taskRevision,
      lifecycle: "suspended" as const,
      custodyRef: {
        schemaVersion: 1 as const,
        runId,
        agentId,
        custodyId,
        custodyRevision: 1,
      },
      actionRef: { adapterId, actionId },
      checkpointDigest,
      openWorkSetDigest,
      deliveryCutWatermark: numberField(source, "contiguous_watermark"),
      predecessorTurnSetDigest,
      sourceProviderGeneration,
      sourcePrincipalGeneration,
      sourceBridgeGeneration,
      targetProviderGeneration,
      targetPrincipalGeneration,
      targetBridgeGeneration,
    };
    const accepted = LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC.parse({
      ...acceptedBase,
      acceptedReceiptDigest: sha256Digest(canonicalJson(acceptedBase)),
    }, "lifecycleAcceptance");
    this.#database.transaction(() => {
      const reserved = this.#lifecycleRotations.reserveNextGenerationsInCurrentTransaction(generationReservation);
      if (canonicalJson(reserved) !== canonicalJson(targetGenerations)) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle generation reservation changed");
      }
      const payloadJson = canonicalJson(providerPayload);
      this.#providerActionAdmission.admitUnroutedInCurrentTransaction(ticket, {
        runId,
        adapterId,
        actionId,
        operation: "spawn",
        targetAgentId: agentId,
        providerSessionGeneration: targetProviderGeneration,
        identityHash: sha256(canonicalJson({ custodyId, providerPayload })),
        payloadHash: sha256(payloadJson),
        payloadJson,
        status: "prepared",
        historyJson: '["prepared"]',
        executionCount: 0,
        updatedAt: this.#clock(),
      });
      const freezeReason = `lifecycle-rotation:${sha256(custodyId).slice(0, 32)}`;
      this.#database.prepare(`
        INSERT INTO delivery_freezes(run_id,agent_id,reason,created_at)
        VALUES (?,?,?,?)
        ON CONFLICT(run_id,agent_id) DO UPDATE SET
          reason=excluded.reason,created_at=excluded.created_at
      `).run(runId, agentId, freezeReason, this.#clock());
      const suspended = this.#database.prepare(`
        UPDATE agents SET lifecycle='suspended'
         WHERE run_id=? AND agent_id=? AND lifecycle IN ('ready','busy','idle','checkpointing','context-unreconciled')
      `).run(runId, agentId);
      if (suspended.changes !== 1) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle source changed before suspension");
      }
      capturedWriteLeases = this.#database.prepare(`
        SELECT lease_id AS leaseId,generation
          FROM leases
         WHERE run_id=? AND holder_agent_id=? AND kind='write' AND status='active'
         ORDER BY lease_id
      `).all(runId, agentId).map((candidate) => {
        const lease = rowOrNotFound(candidate, "lifecycle active write lease");
        return { leaseId: stringField(lease, "leaseId"), generation: numberField(lease, "generation") };
      });
      const quarantineLease = this.#database.prepare(`
        UPDATE leases SET status='quarantined',updated_at=?
         WHERE lease_id=? AND run_id=? AND holder_agent_id=? AND kind='write'
           AND generation=? AND status='active'
      `);
      capturedWriteLeases.forEach((lease) => {
        const changed = quarantineLease.run(this.#clock(), lease.leaseId, runId, agentId, lease.generation);
        if (changed.changes !== 1) {
          throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle write lease changed before quarantine");
        }
      });
      quarantinedWriteSetDigest = sha256Digest(canonicalJson(capturedWriteLeases));
      if (this.#lifecycleRotationSourceVectorDigest(
        runId, agentId, input.taskId, input.checkpoint, capturedAdoptionDeliveries,
      ) !== stableSourceVectorDigest) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle accepted source vector changed before custody capture");
      }
      this.#lifecycleRotations.createInCurrentTransaction({
        projectSessionId: accepted.projectSessionId,
        runId,
        agentId,
        custodyId,
        commandId: input.commandId,
        admissionDigest: accepted.acceptedReceiptDigest,
        actionRef: accepted.actionRef,
        bridgeOwnerKind,
        callerTurnLeaseId: stringField(source, "caller_action_id"),
        callerTurnGeneration: numberField(source, "turn_lease_generation"),
        predecessorTurnSetDigest,
        quarantinedWriteSetDigest,
        deliveryCutWatermark: accepted.deliveryCutWatermark,
        adoptionDeliverySetDigest,
        checkpointRef: input.checkpoint.relativePath,
        checkpointDigest,
        taskRevision: input.taskRevision,
        mailboxRevision: accepted.deliveryCutWatermark,
        childSetDigest: sha256(canonicalJson([...input.checkpoint.inFlightChildren].sort())),
        openWorkSetDigest,
        sourceProviderSessionRef: stringField(source, "provider_session_ref"),
        sourceCapabilityHash: stringField(source, "capability_hash"),
        sourceCustodyActionId: stringField(source, "source_action_id"),
        sourceAdapterId: adapterId,
        sourceAdapterContractDigest: stringField(source, "bridge_contract_digest"),
        sourceBridgeRowId: stringField(source, "bridge_owner_kind") === "chair"
          ? `${accepted.projectSessionId}:${runId}` : `${runId}:${agentId}`,
        sourceBridgeRevision: numberField(source, "bridge_revision"),
        sourceProviderGeneration,
        sourcePrincipalGeneration,
        sourceBridgeGeneration,
        sourceProjectSessionGeneration: numberField(source, "session_generation"),
        sourceRunGeneration: numberField(source, "run_revision"),
        sourceChairLeaseGeneration: numberField(source, "chair_generation"),
        targetProviderGeneration,
        targetPrincipalGeneration,
        targetBridgeGeneration,
        replacementAdapterId: adapterId,
        replacementContractDigest: stringField(source, "bridge_contract_digest"),
        stagedCapabilityHash,
        launchAttestChallengeDigest: launchAttestationChallengeDigest,
        preconditionDigest: stableSourceVectorDigest,
        createdAt: this.#clock(),
      });
      const ownLease = this.#database.prepare(`
        INSERT INTO lifecycle_custody_write_leases(
          run_id,agent_id,custody_id,ordinal,lease_id,lease_generation,source_status,active_owner
        ) VALUES (?,?,?,?,?,?,'active',1)
      `);
      capturedWriteLeases.forEach((lease, index) => {
        ownLease.run(runId, agentId, custodyId, index + 1, lease.leaseId, lease.generation);
      });
      const ownDelivery = this.#database.prepare(`
        INSERT INTO lifecycle_custody_adoption_deliveries(
          run_id,agent_id,custody_id,ordinal,delivery_id,delivery_generation,
          recipient_agent_id,source_state,active_owner
        ) VALUES (?,?,?,?,?,?,?,?,1)
      `);
      const capturedDeliveryStillExact = this.#database.prepare(`
        SELECT 1 FROM result_deliveries
         WHERE result_delivery_id=? AND run_id=? AND requester_agent_id=?
           AND state=? AND claim_generation=? AND target_provider_session=? AND revision=?
      `);
      capturedAdoptionDeliveries.forEach((delivery, index) => {
        if (capturedDeliveryStillExact.get(
          delivery.deliveryId,
          runId,
          delivery.requesterAgentId,
          delivery.state,
          delivery.claimGeneration,
          delivery.targetProviderSession,
          delivery.revision,
        ) === undefined) {
          throw new FabricError(
            "LIFECYCLE_PRECONDITION_FAILED",
            "lifecycle adoption delivery changed before custody capture",
          );
        }
        ownDelivery.run(
          runId,
          agentId,
          custodyId,
          index + 1,
          delivery.deliveryId,
          delivery.claimGeneration,
          delivery.requesterAgentId,
          delivery.state,
        );
      });
      this.#commandJournal.write(runId, agentId, input.commandId, input, accepted);
    }).immediate();
    this.#fault("lifecycle-rotation:prepared");
    this.#scheduleLifecycleContinuation({
      runId,
      agentId,
      custodyId,
      adapterId,
      actionId,
      authorityId: stringField(source, "authority_id"),
      bridgeContractDigest: stringField(source, "bridge_contract_digest"),
      sourceActionId: stringField(source, "source_action_id"),
      sourceCapabilityHash: stringField(source, "capability_hash"),
      sourceProviderSessionRef: stringField(source, "provider_session_ref"),
      callerActionId: stringField(source, "caller_action_id"),
      targetProviderGeneration,
      targetPrincipalGeneration,
      targetBridgeGeneration,
      stagedCapability,
      stagedCapabilityHash,
      capabilityExpiresAt: numberField(source, "expires_at"),
      providerPayload,
      checkpointSha256: input.checkpoint.sha256,
      launchAttestationChallenge,
      launchAttestationChallengeDigest,
      lifecycleInput: input,
    });
    return accepted;
  }

  async #ensureLifecycleReceiptScope(runId: string, agentId: string): Promise<void> {
    const authority = this.#lifecycleReceiptAuthority;
    if (authority === undefined) return;
    void agentId;
    const source = rowOrNotFound(this.#database.prepare(`
      SELECT session.project_id,run.project_session_id,custody.admission_digest
        FROM runs run
        JOIN project_sessions session ON session.project_session_id=run.project_session_id
        JOIN lifecycle_rotation_custodies custody
          ON custody.run_id=run.run_id
       WHERE run.run_id=?
       ORDER BY custody.created_at,custody.custody_id LIMIT 1
    `).get(runId), "lifecycle receipt scope source");
    const projectId = stringField(source, "project_id");
    const projectSessionId = stringField(source, "project_session_id");
    const admissionDigest = stringField(source, "admission_digest") as LifecycleDigest;
    this.#database.prepare(`
      INSERT OR IGNORE INTO lifecycle_receipt_projects(project_id,authority_id,registered_at)
      VALUES (?,?,?)
    `).run(projectId, authority.authorityId, this.#clock());
    const receiptProject = rowOrNotFound(this.#database.prepare(`
      SELECT authority_id FROM lifecycle_receipt_projects WHERE project_id=?
    `).get(projectId), "lifecycle receipt project");
    if (stringField(receiptProject, "authority_id") !== authority.authorityId) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt project authority crossed");
    }
    const existing = this.#database.prepare(`
      SELECT authority_id,admission_digest FROM lifecycle_admitted_run_scopes
       WHERE project_session_id=? AND run_id=?
    `).get(projectSessionId, runId);
    if (isRow(existing)) {
      if (existing.authority_id !== authority.authorityId || existing.admission_digest !== admissionDigest) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt scope admission crossed");
      }
      return;
    }
    const recorded = this.#database.prepare(`
      SELECT admission_request_id,scope_json,scope_digest,admitted_at,authority_id,admission_digest
        FROM lifecycle_scope_admission_outbox WHERE project_session_id=? AND run_id=?
    `).get(projectSessionId, runId);
    let requestId: string;
    let scopeDigest: LifecycleDigest;
    let scope: LifecycleAdmittedRunScope;
    if (isRow(recorded)) {
      scope = JSON.parse(stringField(recorded, "scope_json")) as LifecycleAdmittedRunScope;
      requestId = stringField(recorded, "admission_request_id");
      scopeDigest = stringField(recorded, "scope_digest") as LifecycleDigest;
      if (
        stringField(recorded, "authority_id") !== authority.authorityId ||
        stringField(recorded, "admission_digest") !== admissionDigest ||
        lifecycleDigest("admitted-scope", scope) !== scopeDigest
      ) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt scope outbox crossed");
      }
    } else {
      scope = {
        schemaVersion: 1,
        projectId,
        projectSessionId,
        runId,
        authorityId: authority.authorityId,
        admissionDigest,
        admittedAt: this.#clock(),
      };
      scopeDigest = lifecycleDigest("admitted-scope", scope) as LifecycleDigest;
      requestId = lifecycleDigest("scope-admission-outbox", { schemaVersion: 1, scopeDigest });
      this.#database.prepare(`
        INSERT INTO lifecycle_scope_admission_outbox(
          admission_request_id,project_id,project_session_id,run_id,authority_id,
          admission_digest,admitted_at,scope_json,scope_digest,created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(
        requestId, projectId, projectSessionId, runId, authority.authorityId,
        admissionDigest, scope.admittedAt, canonicalJson(scope), scopeDigest, this.#clock(),
      );
    }
    let initial: LifecycleAuthenticatedScopeCheckpoint;
    try {
      initial = await authority.admitScope(scope);
    } catch (error: unknown) {
      throw new FabricError("CAPABILITY_UNAVAILABLE", "lifecycle receipt scope admission is pending", { cause: error });
    }
    const initialBody = {
      schemaVersion: 1,
      authorityId: initial.authorityId,
      projectSessionId: initial.projectSessionId,
      runId: initial.runId,
      receiptCountDec: String(initial.receiptCount),
      headAuthoritySequenceDec: String(initial.headAuthoritySequence),
      headReceiptDigest: initial.headReceiptDigest,
      orderedRecordSetDigest: initial.orderedRecordSetDigest,
    };
    if (
      initial.projectSessionId !== projectSessionId || initial.runId !== runId ||
      initial.authorityId !== authority.authorityId || initial.receiptCount !== 0 ||
      initial.headAuthoritySequence !== 0 || initial.headReceiptDigest !== null ||
      initial.orderedRecordSetDigest !== lifecycleDigest("scope-record-set", []) ||
      initial.checkpointDigest !== lifecycleDigest("scope-checkpoint", initialBody) ||
      !await authority.verifyScopeCheckpoint(initial)
    ) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt scope admission returned an invalid zero checkpoint");
    }
    const namespace = await authority.readNamespaceCheckpoint(projectId);
    if (
      namespace.projectId !== projectId || namespace.authorityId !== authority.authorityId ||
      !await authority.verifyNamespaceCheckpoint(namespace)
    ) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt namespace checkpoint is invalid");
    }
    const namespaceMembers: Array<Readonly<{
      projectSessionId: string;
      runId: string;
      authorityId: string;
      scopeCheckpointDigest: LifecycleDigest;
      receiptCountDec: string;
      headReceiptDigest: LifecycleDigest | null;
    }>> = [];
    let afterScopeKey: string | null = null;
    do {
      const page = await authority.readNamespacePageAt(namespace.checkpointDigest, afterScopeKey, 256);
      if (page.orderedScopeHeads.length > 256 || namespaceMembers.length + page.orderedScopeHeads.length > 65_536) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt namespace exceeds its bounded scan");
      }
      for (const head of page.orderedScopeHeads) {
        const pinned = await authority.readScopeCheckpointAt(head.checkpointDigest);
        if (
          canonicalJson(head) !== canonicalJson(pinned) || head.authorityId !== authority.authorityId ||
          !await authority.verifyScopeCheckpoint(head)
        ) {
          throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt namespace contains a crossed scope");
        }
        const key = `${head.projectSessionId}\0${head.runId}`;
        const previous = namespaceMembers.at(-1);
        if (previous !== undefined && key <= `${previous.projectSessionId}\0${previous.runId}`) {
          throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt namespace is not strictly ordered");
        }
        namespaceMembers.push({
          projectSessionId: head.projectSessionId,
          runId: head.runId,
          authorityId: head.authorityId,
          scopeCheckpointDigest: head.checkpointDigest,
          receiptCountDec: String(head.receiptCount),
          headReceiptDigest: head.headReceiptDigest,
        });
      }
      if (page.nextAfter === null) break;
      if (page.orderedScopeHeads.length === 0 || page.nextAfter.length === 0 || page.nextAfter === afterScopeKey) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt namespace pagination crossed");
      }
      afterScopeKey = page.nextAfter;
    } while (true);
    const targetMember = namespaceMembers.find((member) =>
      member.projectSessionId === projectSessionId && member.runId === runId);
    const namespaceBody = {
      schemaVersion: 1,
      authorityId: namespace.authorityId,
      projectId: namespace.projectId,
      scopeCountDec: String(namespace.scopeCount),
      orderedScopeHeadSetDigest: namespace.orderedScopeHeadSetDigest,
    };
    if (
      namespaceMembers.length !== namespace.scopeCount ||
      namespace.orderedScopeHeadSetDigest !== lifecycleDigest("namespace-scope-head-set", namespaceMembers) ||
      namespace.checkpointDigest !== lifecycleDigest("namespace-checkpoint", namespaceBody) ||
      targetMember === undefined || targetMember.scopeCheckpointDigest !== initial.checkpointDigest ||
      targetMember.receiptCountDec !== "0" || targetMember.headReceiptDigest !== null
    ) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle receipt namespace omits the admitted zero scope");
    }
    const resolutionBody = {
      schemaVersion: 1,
      admissionRequestId: requestId,
      scopeDigest,
      initialScopeCheckpoint: initial,
      namespaceCheckpointDigest: namespace.checkpointDigest,
      namespaceMember: targetMember,
      verifiedAt: this.#clock(),
    };
    const resolutionDigest = lifecycleDigest("scope-admission-resolution", resolutionBody);
    this.#database.transaction(() => {
      this.#database.prepare(`INSERT INTO lifecycle_admitted_run_scopes VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
        projectId, projectSessionId, runId, authority.authorityId, admissionDigest,
        scope.admittedAt, requestId, scopeDigest, initial.checkpointDigest, resolutionDigest,
      );
      this.#database.prepare(`INSERT INTO lifecycle_receipt_scope_checkpoints VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        projectSessionId, runId, authority.authorityId, 0, 0, null,
        initial.orderedRecordSetDigest, canonicalJson(initialBody), initial.checkpointDigest,
        initial.attestation, resolutionBody.verifiedAt,
      );
      this.#database.prepare(`INSERT INTO lifecycle_receipt_scope_heads VALUES (?,?,?,1)`).run(
        projectSessionId, runId, initial.checkpointDigest,
      );
      this.#database.prepare(`INSERT OR IGNORE INTO lifecycle_receipt_namespace_checkpoints VALUES (?,?,?,?,?,?,?,?)`).run(
        projectId, authority.authorityId, namespace.scopeCount, namespace.orderedScopeHeadSetDigest,
        canonicalJson(namespaceBody), namespace.checkpointDigest, namespace.attestation, resolutionBody.verifiedAt,
      );
      const insertMember = this.#database.prepare(`
        INSERT OR IGNORE INTO lifecycle_receipt_namespace_members VALUES (?,?,?,?,?,?,?,?,?)
      `);
      namespaceMembers.forEach((member, index) => insertMember.run(
        projectId, namespace.checkpointDigest, index + 1, member.projectSessionId, member.runId,
        member.authorityId, member.scopeCheckpointDigest, Number(member.receiptCountDec), member.headReceiptDigest,
      ));
      const namespaceHead = this.#database.prepare(`
        SELECT checkpoint_digest,head_revision FROM lifecycle_receipt_namespace_heads WHERE project_id=?
      `).get(projectId);
      if (!isRow(namespaceHead)) {
        this.#database.prepare(`INSERT INTO lifecycle_receipt_namespace_heads VALUES (?,?,?,?,?,1)`).run(
          projectId, authority.authorityId, namespace.scopeCount,
          namespace.orderedScopeHeadSetDigest, namespace.checkpointDigest,
        );
      } else if (namespaceHead.checkpoint_digest !== namespace.checkpointDigest) {
        const changed = this.#database.prepare(`
          UPDATE lifecycle_receipt_namespace_heads
             SET authority_id=?,scope_count=?,ordered_scope_head_set_digest=?,checkpoint_digest=?,head_revision=head_revision+1
           WHERE project_id=? AND checkpoint_digest=? AND head_revision=?
        `).run(
          authority.authorityId, namespace.scopeCount, namespace.orderedScopeHeadSetDigest,
          namespace.checkpointDigest, projectId, namespaceHead.checkpoint_digest,
          numberField(namespaceHead, "head_revision"),
        );
        if (changed.changes !== 1) throw new Error("lifecycle receipt namespace head changed");
      }
      this.#database.prepare(`INSERT INTO lifecycle_scope_admission_resolutions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        requestId, projectId, projectSessionId, runId, authority.authorityId,
        admissionDigest, scope.admittedAt, scopeDigest, 0, 0, initial.orderedRecordSetDigest,
        canonicalJson(initialBody), initial.checkpointDigest, 1, namespace.checkpointDigest,
        canonicalJson(targetMember), resolutionBody.verifiedAt, canonicalJson(resolutionBody), resolutionDigest,
      );
    }).immediate();
  }

  async #recoverLifecycleRotations(): Promise<void> {
    const pending = this.#database.prepare(`
      SELECT head.state,head.current_revision,custody.*,
             head_revision.terminal_evidence_digest AS head_terminal_evidence_digest,
             action.status AS action_status,action.history_json,action.execution_count,
             action.effect_count,action.idempotency_proven,action.payload_json,action.result_json,
             agent.authority_id,capability.expires_at,checkpoint.checkpoint_json,
             checkpoint.task_id AS checkpoint_task_id,
             (
               SELECT 'sha256:' || observed.sha256 FROM lifecycle_checkpoints observed
                WHERE observed.run_id=custody.run_id AND observed.agent_id=custody.agent_id
                  AND observed.relative_path=custody.checkpoint_ref
                ORDER BY observed.created_at DESC,observed.checkpoint_id DESC LIMIT 1
             ) AS observed_checkpoint_digest
        FROM lifecycle_rotation_custody_heads head
        JOIN lifecycle_rotation_custodies custody
          ON custody.run_id=head.run_id AND custody.agent_id=head.agent_id
         AND custody.custody_id=head.custody_id
        JOIN lifecycle_rotation_custody_revisions head_revision
          ON head_revision.project_session_id=head.project_session_id
         AND head_revision.run_id=head.run_id AND head_revision.agent_id=head.agent_id
         AND head_revision.custody_id=head.custody_id
         AND head_revision.revision=head.current_revision
        LEFT JOIN provider_actions action
          ON action.run_id=custody.run_id
         AND action.adapter_id=custody.provider_action_adapter_id
         AND action.action_id=custody.provider_action_id
        JOIN agents agent ON agent.run_id=custody.run_id AND agent.agent_id=custody.agent_id
        LEFT JOIN capabilities capability ON capability.token_hash=custody.staged_capability_hash
        LEFT JOIN lifecycle_checkpoints checkpoint
          ON checkpoint.run_id=custody.run_id AND checkpoint.agent_id=custody.agent_id
         AND checkpoint.relative_path=custody.checkpoint_ref
         AND ('sha256:' || checkpoint.sha256)=custody.checkpoint_digest
       WHERE head.terminal=0
       ORDER BY custody.created_at,custody.custody_id
    `).all();
    for (const value of pending) {
      const row = rowOrNotFound(value, "recoverable lifecycle rotation");
      try {
      const runId = stringField(row, "run_id");
      const adapterId = stringField(row, "provider_action_adapter_id");
      const actionId = stringField(row, "provider_action_id");
      const agentId = stringField(row, "agent_id");
      const bridgeContractDigest = stringField(row, "replacement_contract_digest");
      const targetBridgeGeneration = numberField(row, "target_bridge_generation");
      const bridgeOwnerKind = stringField(row, "bridge_owner_kind") as "chair" | "child";
      const minimalInput = {
        runId,
        agentId,
        custodyId: stringField(row, "custody_id"),
        adapterId,
        actionId,
        sourceActionId: stringField(row, "source_custody_action_id"),
        sourceCapabilityHash: stringField(row, "source_capability_hash"),
        sourceProviderSessionRef: stringField(row, "source_provider_session_ref"),
        stagedCapabilityHash: stringField(row, "staged_capability_hash"),
      };
      let recoveredCheckpoint: LifecycleCheckpoint | null = null;
      try {
        const candidate: unknown = JSON.parse(stringField(row, "checkpoint_json"));
        if (isLifecycleCheckpoint(candidate)) recoveredCheckpoint = candidate;
      } catch {
        recoveredCheckpoint = null;
      }
      const recoveredAdoptionDeliveries = this.#database.prepare(`
        SELECT ownership.delivery_id AS deliveryId,
               ownership.delivery_generation AS claimGeneration,
               ownership.recipient_agent_id AS requesterAgentId,
               custody.source_provider_session_ref AS targetProviderSession
          FROM lifecycle_custody_adoption_deliveries ownership
          JOIN lifecycle_rotation_custodies custody
            ON custody.run_id=ownership.run_id AND custody.agent_id=ownership.agent_id
           AND custody.custody_id=ownership.custody_id
         WHERE ownership.run_id=? AND ownership.agent_id=? AND ownership.custody_id=?
           AND ownership.active_owner=1
         ORDER BY ownership.ordinal
      `).all(runId, agentId, minimalInput.custodyId).map((candidate) => {
        const delivery = rowOrNotFound(candidate, "recoverable lifecycle adoption delivery");
        return {
          deliveryId: stringField(delivery, "deliveryId"),
          claimGeneration: numberField(delivery, "claimGeneration"),
          requesterAgentId: stringField(delivery, "requesterAgentId"),
          targetProviderSession: stringField(delivery, "targetProviderSession"),
        };
      });
      let head = this.#lifecycleRotations.readHead(runId, agentId, minimalInput.custodyId);
      const finalizeQuarantine = async (reason: string, evidence: unknown): Promise<void> => {
        const proof = {
          schemaVersion: 1,
          kind: "integrity-quarantine",
          sourceState: head.state,
          reason,
          providerActionRef: { runId, adapterId, actionId },
          evidenceDigest: sha256Digest(canonicalJson(evidence)),
        };
        const digest = sha256Digest(canonicalJson(proof));
        await this.#ensureLifecycleReceiptScope(runId, agentId);
        await this.#finalizeLifecycleRotationAdopted(minimalInput, head, digest, null, {
          disposition: "quarantined",
          proofKind: "integrity-quarantine",
          transitionProof: proof,
        });
      };
      const lifecycleDrift = (): Readonly<Record<string, unknown>> | null => {
        const expectedCheckpointDigest = stringField(row, "checkpoint_digest");
        const observedCheckpointDigest = typeof row.observed_checkpoint_digest === "string"
          ? row.observed_checkpoint_digest
          : null;
        const checkpointChanged = typeof row.checkpoint_json !== "string" &&
          observedCheckpointDigest !== null && observedCheckpointDigest !== expectedCheckpointDigest;
        const expectedSource = {
          projectSessionGeneration: numberField(row, "source_project_session_generation"),
          runGeneration: numberField(row, "source_run_generation"),
          chairLeaseGeneration: numberField(row, "source_chair_lease_generation"),
          adapterId: stringField(row, "source_adapter_id"),
          actionId: stringField(row, "source_custody_action_id"),
          providerSessionRef: stringField(row, "source_provider_session_ref"),
          providerGeneration: numberField(row, "source_provider_generation"),
          principalGeneration: numberField(row, "source_principal_generation"),
          bridgeGeneration: numberField(row, "source_bridge_generation"),
          bridgeRevision: numberField(row, "source_bridge_revision"),
          capabilityHash: stringField(row, "source_capability_hash"),
          bridgeContractDigest: stringField(row, "source_adapter_contract_digest"),
        };
        const observedSource = bridgeOwnerKind === "chair"
          ? this.#database.prepare(`
              SELECT session.generation AS projectSessionGeneration,
                     run.revision AS runGeneration,
                     COALESCE(run.chair_generation,1) AS chairLeaseGeneration,
                     bridge.provider_adapter_id AS adapterId,
                     bridge.provider_action_id AS actionId,
                     bridge.provider_session_ref AS providerSessionRef,
                     bridge.provider_session_generation AS providerGeneration,
                     bridge.principal_generation AS principalGeneration,
                     bridge.bridge_generation AS bridgeGeneration,
                     bridge.revision AS bridgeRevision,
                     bridge.capability_hash AS capabilityHash,
                     bridge.provider_contract_digest AS bridgeContractDigest
                FROM runs run
                JOIN project_sessions session ON session.project_session_id=run.project_session_id
                JOIN launched_chair_bridge_state bridge
                  ON bridge.project_session_id=run.project_session_id
                 AND bridge.coordination_run_id=run.run_id
                 AND bridge.chair_agent_id=? AND bridge.state='active'
                JOIN capabilities capability
                  ON capability.token_hash=bridge.capability_hash AND capability.revoked_at IS NULL
               WHERE run.run_id=? AND run.chair_agent_id=bridge.chair_agent_id
            `).get(agentId, runId)
          : this.#database.prepare(`
              SELECT session.generation AS projectSessionGeneration,
                     run.revision AS runGeneration,
                     COALESCE(run.chair_generation,1) AS chairLeaseGeneration,
                     bridge.adapter_id AS adapterId,bridge.action_id AS actionId,
                     bridge.provider_session_ref AS providerSessionRef,
                     bridge.provider_session_generation AS providerGeneration,
                     capability.principal_generation AS principalGeneration,
                     bridge.bridge_generation AS bridgeGeneration,
                     bridge.revision AS bridgeRevision,bridge.capability_hash AS capabilityHash,
                     source.bridge_contract_digest AS bridgeContractDigest
                FROM runs run
                JOIN project_sessions session ON session.project_session_id=run.project_session_id
                JOIN agent_bridge_state bridge
                  ON bridge.run_id=run.run_id AND bridge.agent_id=? AND bridge.bridge_state='active'
                JOIN provider_agent_custody source
                  ON source.run_id=bridge.run_id AND source.adapter_id=bridge.adapter_id
                 AND source.action_id=bridge.action_id
                JOIN capabilities capability
                  ON capability.token_hash=bridge.capability_hash AND capability.revoked_at IS NULL
               WHERE run.run_id=? AND run.chair_agent_id<>bridge.agent_id
            `).get(agentId, runId);
        const sourceChanged = !isRow(observedSource) ||
          canonicalJson(observedSource) !== canonicalJson(expectedSource);
        const observedSourceVectorDigest = recoveredCheckpoint === null
          ? null
          : this.#lifecycleRotationSourceVectorDigest(
              runId,
              agentId,
              stringField(row, "checkpoint_task_id"),
              recoveredCheckpoint,
              recoveredAdoptionDeliveries,
            );
        const sourceVectorChanged = observedSourceVectorDigest !== null &&
          observedSourceVectorDigest !== stringField(row, "precondition_digest");
        if (!checkpointChanged && !sourceChanged && !sourceVectorChanged) return null;
        return {
          driftKind: checkpointChanged ? "checkpoint" : sourceChanged ? "source" : "accepted-source-vector",
          expectedCheckpointDigest,
          observedCheckpointDigest,
          expectedSource,
          observedSource: observedSource ?? null,
          expectedSourceVectorDigest: stringField(row, "precondition_digest"),
          observedSourceVectorDigest,
        };
      };
      const finalizeSuperseded = async (
        drift: Readonly<Record<string, unknown>>,
        terminalObservation: unknown = null,
      ): Promise<void> => {
        const postterminal = head.state === "provider-terminal" || head.state === "committing";
        const abandonedAdoption = postterminal
          ? this.#lifecycleReceipts.readPreparedChildCustodyTerminal(
              runId,
              agentId,
              minimalInput.custodyId,
              `${minimalInput.custodyId}:apply`,
            )
          : null;
        let recoveredAdoptionReceipt: LifecycleReceiptRecord | null = null;
        if (abandonedAdoption?.disposition === "adopted" && abandonedAdoption.preRevision === head.revision) {
          const localReceipt = this.#database.prepare(`
            SELECT receipt_digest FROM lifecycle_authority_receipts WHERE intent_digest=?
          `).get(abandonedAdoption.intentDigest);
          if (!isRow(localReceipt)) {
            const authority = this.#lifecycleReceiptAuthority;
            if (authority === undefined) {
              throw new FabricError("CAPABILITY_UNAVAILABLE", "lifecycle receipt authority recovery is unavailable");
            }
            const lookup = {
              kind: "custody-terminal" as const,
              projectSessionId: abandonedAdoption.projectSessionId,
              runId: abandonedAdoption.runId,
              agentId: abandonedAdoption.agentId,
              ownerRefDigest: abandonedAdoption.ownerRefDigest as LifecycleDigest,
              ownerRevision: abandonedAdoption.finalRevision,
            };
            try {
              recoveredAdoptionReceipt = await authority.readReceipt(lookup);
            } catch (error: unknown) {
              throw new FabricError("CAPABILITY_UNAVAILABLE", "stale lifecycle adoption receipt read failed", { cause: error });
            }
            if (
              recoveredAdoptionReceipt === null ||
              canonicalJson(recoveredAdoptionReceipt.subject) !== abandonedAdoption.subjectJson ||
              recoveredAdoptionReceipt.receipt.intentDigest !== abandonedAdoption.intentDigest ||
              recoveredAdoptionReceipt.receipt.subjectDigest !== abandonedAdoption.subjectDigest ||
              !await authority.verifyReceipt(abandonedAdoption.subject, recoveredAdoptionReceipt.receipt)
            ) {
              throw new FabricError(
                "LIFECYCLE_PRECONDITION_FAILED",
                "stale lifecycle adoption receipt authority evidence is absent or crossed",
              );
            }
          }
          head = this.#database.transaction(() => {
            if (recoveredAdoptionReceipt !== null) {
              this.#lifecycleReceipts.persistVerifiedAuthorityReceiptInCurrentTransaction(
                abandonedAdoption,
                recoveredAdoptionReceipt,
              );
            }
            return this.#lifecycleRotations.appendInCurrentTransaction({
              runId,
              agentId,
              custodyId: minimalInput.custodyId,
              expectedRevision: head.revision,
              state: "committing",
              terminalEvidenceDigest: abandonedAdoption.terminalEvidenceDigest,
              recordedAt: this.#clock(),
            });
          }).immediate();
        }
        const expectedSourceJournalDigest = sha256Digest(canonicalJson(drift.expectedSource));
        const observedSourceJournalDigest = sha256Digest(canonicalJson(drift.observedSource));
        const base = {
          schemaVersion: 1,
          sourceState: head.state,
          expectedSourceJournalDigest,
          observedSourceJournalDigest,
          expectedCheckpointDigest: drift.expectedCheckpointDigest,
          observedCheckpointDigest: drift.observedCheckpointDigest ?? drift.expectedCheckpointDigest,
        };
        const proof = postterminal ? {
          ...base,
          kind: "postterminal-adoption-cas-superseded",
          terminalObservationDigest: sha256Digest(canonicalJson(terminalObservation)),
          replacementCandidateDigest: sha256Digest(canonicalJson(terminalObservation)),
          expectedMutationPreconditionDigest: stringField(row, "precondition_digest"),
          failedCasEvidenceDigest: sha256Digest(canonicalJson(drift)),
        } : {
          ...base,
          kind: "predispatch-superseded",
          driftKind: drift.driftKind,
        };
        const digest = postterminal
          ? stringField(row, "head_terminal_evidence_digest")
          : sha256Digest(canonicalJson(proof));
        await this.#ensureLifecycleReceiptScope(runId, agentId);
        await this.#finalizeLifecycleRotationAdopted(minimalInput, head, digest, null, {
          disposition: "superseded",
          proofKind: postterminal
            ? "postterminal-adoption-cas-superseded"
            : "predispatch-superseded",
          transitionProof: proof,
        });
      };
      if (head.state === "awaiting-boundary" || head.state === "prepared") {
        const drift = lifecycleDrift();
        if (drift !== null) {
          await finalizeSuperseded(drift);
          continue;
        }
        const providerCustody = this.#database.prepare(`
          SELECT 1 FROM provider_agent_custody
           WHERE run_id=? AND adapter_id=? AND action_id=?
        `).get(runId, adapterId, actionId);
        if (
          row.action_status !== "prepared" || numberField(row, "execution_count") !== 0 ||
          numberField(row, "effect_count") !== 0 || providerCustody !== undefined
        ) {
          await finalizeQuarantine("zero-dispatch-evidence-conflict", {
            status: row.action_status ?? null,
            executionCount: row.execution_count ?? null,
            effectCount: row.effect_count ?? null,
            providerCustodyPresent: providerCustody !== undefined,
          });
          continue;
        }
        const proof = {
          schemaVersion: 1,
          kind: "zero-dispatch-no-effect",
          sourceState: head.state,
          providerActionRef: { runId, adapterId, actionId },
          dispatchCountDec: "0",
          effectCountDec: "0",
          journalDigest: sha256Digest(canonicalJson({
            status: row.action_status,
            historyJson: row.history_json,
            executionCount: row.execution_count,
            effectCount: row.effect_count,
          })),
        };
        const digest = sha256Digest(canonicalJson(proof));
        await this.#ensureLifecycleReceiptScope(runId, agentId);
        await this.#finalizeLifecycleRotationAdopted(minimalInput, head, digest, null, {
          disposition: "no-effect",
          proofKind: "zero-dispatch-no-effect",
          transitionProof: proof,
        });
        continue;
      }
      let rawResult: unknown;
      if (head.state === "dispatched" || head.state === "accepted" || head.state === "ambiguous") {
        let lookup: unknown;
        try {
          lookup = await this.#requestAdapter(adapterId, "lookup_action", { actionId });
        } catch (error: unknown) {
          if (error instanceof Error && error.name === "ACTION_NOT_FOUND") {
            await finalizeQuarantine("provider-action-absent", { message: error.message });
            continue;
          }
          throw new FabricError(
            "CAPABILITY_UNAVAILABLE",
            "lifecycle provider action lookup is unavailable",
            { cause: error },
          );
        }
        if (
          !isRow(lookup) || lookup.actionId !== actionId || lookup.status !== "terminal" ||
          lookup.executionCount !== 1 || lookup.effectCount !== 1 || lookup.idempotencyProven !== true ||
          !Array.isArray(lookup.history) || !lookup.history.every((entry) => typeof entry === "string") ||
          !("result" in lookup)
        ) {
          await finalizeQuarantine("provider-action-terminal-evidence-malformed", lookup);
          continue;
        }
        rawResult = lookup.result;
        try {
          const parsed = parseAgentProvisionProviderResult(rawResult, {
            adapterId, actionId, targetAgentId: agentId, bridgeGeneration: targetBridgeGeneration,
            bridgeContractDigest,
            lifecycleAttestation: {
              custodyId: minimalInput.custodyId,
              checkpointDigest: stringField(row, "checkpoint_digest"),
              challengeDigest: stringField(row, "launch_attest_challenge_digest"),
            },
          });
          if (parsed.providerSessionGeneration !== numberField(row, "target_provider_generation")) {
            throw new Error("lifecycle provider result crossed its reserved generation");
          }
        } catch {
          await finalizeQuarantine("provider-action-terminal-evidence-crossed", lookup);
          continue;
        }
        const terminalEvidenceDigest = sha256Digest(canonicalJson(rawResult));
        this.#database.transaction(() => {
          const changed = this.#database.prepare(`
            UPDATE provider_actions
               SET status='terminal',history_json=?,execution_count=1,effect_count=1,
                   idempotency_proven=1,result_json=?,journal_revision=journal_revision+1,updated_at=?
             WHERE run_id=? AND adapter_id=? AND action_id=?
               AND status IN ('dispatched','accepted','ambiguous')
          `).run(canonicalJson(lookup.history), canonicalJson(rawResult), this.#clock(), runId, adapterId, actionId);
          if (changed.changes !== 1) throw new Error("lifecycle provider action changed during recovery");
          head = this.#lifecycleRotations.appendInCurrentTransaction({
            runId, agentId, custodyId: minimalInput.custodyId, expectedRevision: head.revision,
            state: "provider-terminal", terminalEvidenceDigest, recordedAt: this.#clock(),
          });
          head = this.#lifecycleRotations.appendInCurrentTransaction({
            runId, agentId, custodyId: minimalInput.custodyId, expectedRevision: head.revision,
            state: "committing", terminalEvidenceDigest, recordedAt: this.#clock(),
          });
        }).immediate();
      } else {
        let storedHistory: unknown;
        try {
          storedHistory = JSON.parse(stringField(row, "history_json"));
        } catch {
          storedHistory = null;
        }
        if (
          row.action_status !== "terminal" || numberField(row, "execution_count") !== 1 ||
          numberField(row, "effect_count") !== 1 || numberField(row, "idempotency_proven") !== 1 ||
          !Array.isArray(storedHistory) || storedHistory.at(-1) !== "terminal" ||
          !storedHistory.every((entry) => typeof entry === "string")
        ) {
          await finalizeQuarantine("stored-provider-action-journal-conflict", {
            status: row.action_status ?? null,
            history: storedHistory,
            executionCount: row.execution_count ?? null,
            effectCount: row.effect_count ?? null,
            idempotencyProven: row.idempotency_proven ?? null,
          });
          continue;
        }
        try {
          rawResult = JSON.parse(stringField(row, "result_json"));
        } catch {
          await finalizeQuarantine("stored-provider-terminal-evidence-malformed", row.result_json ?? null);
          continue;
        }
      }
      let result: AgentProvisionProviderResult;
      try {
        result = parseAgentProvisionProviderResult(rawResult, {
          adapterId, actionId, targetAgentId: agentId, bridgeGeneration: targetBridgeGeneration,
          bridgeContractDigest,
          lifecycleAttestation: {
            custodyId: minimalInput.custodyId,
            checkpointDigest: stringField(row, "checkpoint_digest"),
            challengeDigest: stringField(row, "launch_attest_challenge_digest"),
          },
        });
        if (result.providerSessionGeneration !== numberField(row, "target_provider_generation")) {
          throw new Error("lifecycle provider result crossed its reserved generation");
        }
      } catch {
        await finalizeQuarantine("stored-provider-terminal-evidence-crossed", rawResult);
        continue;
      }
      const postterminalDrift = lifecycleDrift();
      if (postterminalDrift !== null) {
        await finalizeSuperseded(postterminalDrift, result);
        continue;
      }
      let payload: unknown;
      let checkpoint: unknown;
      try {
        payload = JSON.parse(stringField(row, "payload_json"));
        checkpoint = JSON.parse(stringField(row, "checkpoint_json"));
      } catch {
        await finalizeQuarantine("immutable-lifecycle-input-malformed", null);
        continue;
      }
      if (!isRow(payload) || !isLifecycleCheckpoint(checkpoint) || typeof row.expires_at !== "number") {
        await finalizeQuarantine("immutable-lifecycle-input-conflict", { payload, checkpoint });
        continue;
      }
      const input = {
        ...minimalInput,
        authorityId: stringField(row, "authority_id"),
        bridgeContractDigest,
        callerActionId: stringField(row, "caller_turn_lease_id"),
        targetProviderGeneration: numberField(row, "target_provider_generation"),
        targetPrincipalGeneration: numberField(row, "target_principal_generation"),
        targetBridgeGeneration,
        stagedCapability: "",
        capabilityExpiresAt: numberField(row, "expires_at"),
        providerPayload: payload,
        checkpointSha256: checkpoint.sha256,
        lifecycleInput: {
          action: payload.action === "compact" ? "compact" as const : "rotate" as const,
          agentId,
          taskId: stringField(row, "checkpoint_task_id"),
          taskRevision: numberField(row, "task_revision"),
          checkpoint,
          commandId: stringField(row, "command_id"),
        },
      };
      const terminalEvidenceDigest = sha256Digest(canonicalJson(result));
      if (head.state === "provider-terminal") {
        head = this.#database.transaction(() => this.#lifecycleRotations.appendInCurrentTransaction({
          runId, agentId, custodyId: input.custodyId, expectedRevision: head.revision,
          state: "committing", terminalEvidenceDigest, recordedAt: this.#clock(),
        })).immediate();
      }
      await this.#ensureLifecycleReceiptScope(runId, agentId);
      await this.#finalizeLifecycleRotationAdopted(input, head, terminalEvidenceDigest, result);
      } catch (error: unknown) {
        if (typeof row.run_id === "string" && typeof row.agent_id === "string") {
          this.#event(row.run_id, "lifecycle-recovery-custody-failed", row.agent_id, {
            custodyId: typeof row.custody_id === "string" ? row.custody_id : null,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  #scheduleLifecycleContinuation(input: Readonly<{
    runId: string;
    agentId: string;
    custodyId: string;
    adapterId: string;
    actionId: string;
    authorityId: string;
    bridgeContractDigest: string;
    sourceActionId: string;
    sourceCapabilityHash: string;
    sourceProviderSessionRef: string;
    callerActionId: string;
    targetProviderGeneration: number;
    targetPrincipalGeneration: number;
    targetBridgeGeneration: number;
    stagedCapability: string;
    stagedCapabilityHash: string;
    capabilityExpiresAt: number;
    providerPayload: Record<string, unknown>;
    checkpointSha256: string;
    launchAttestationChallenge: string;
    launchAttestationChallengeDigest: string;
    lifecycleInput: {
      action: "compact" | "rotate";
      agentId: string;
      taskId: string;
      taskRevision: number;
      checkpoint: LifecycleCheckpoint;
      commandId: string;
    };
  }>): void {
    const key = `lifecycle\0${input.runId}\0${input.agentId}\0${input.custodyId}`;
    if (this.#ownedProviderActions.has(key)) return;
    const predecessor = this.#ownedProviderActions.get(
      this.#providerActionOwnershipKey(input.runId, input.adapterId, input.callerActionId),
    );
    const continuation = (async () => {
      if (predecessor !== undefined) await predecessor;
      if (!this.#closing) await this.#continueLifecycleRotation(input);
    })();
    this.#ownedProviderActions.set(key, continuation);
    void continuation.catch((error: unknown) => {
      this.#event(input.runId, "lifecycle-continuation-failed", input.agentId, {
        custodyId: input.custodyId,
        message: privateSafeErrorMessage(
          error,
          [input.launchAttestationChallenge],
          "lifecycle replacement provider failed",
        ),
      });
    }).finally(() => {
      if (this.#ownedProviderActions.get(key) === continuation) this.#ownedProviderActions.delete(key);
    });
  }

  async #continueLifecycleRotation(input: Readonly<{
    runId: string;
    agentId: string;
    custodyId: string;
    adapterId: string;
    actionId: string;
    authorityId: string;
    bridgeContractDigest: string;
    sourceActionId: string;
    sourceCapabilityHash: string;
    sourceProviderSessionRef: string;
    callerActionId: string;
    targetProviderGeneration: number;
    targetPrincipalGeneration: number;
    targetBridgeGeneration: number;
    stagedCapability: string;
    stagedCapabilityHash: string;
    capabilityExpiresAt: number;
    providerPayload: Record<string, unknown>;
    checkpointSha256: string;
    launchAttestationChallenge: string;
    launchAttestationChallengeDigest: string;
    lifecycleInput: {
      action: "compact" | "rotate";
      agentId: string;
      taskId: string;
      taskRevision: number;
      checkpoint: LifecycleCheckpoint;
      commandId: string;
    };
  }>): Promise<void> {
    await this.#ensureLifecycleReceiptScope(input.runId, input.agentId);
    let head = this.#database.transaction(() => this.#lifecycleRotations.appendInCurrentTransaction({
      runId: input.runId,
      agentId: input.agentId,
      custodyId: input.custodyId,
      expectedRevision: 1,
      state: "prepared",
      recordedAt: this.#clock(),
    })).immediate();
    this.#database.transaction(() => {
      this.#database.prepare(`
        INSERT INTO capabilities(token_hash,run_id,agent_id,principal_generation,expires_at)
        VALUES (?,?,?,?,?)
      `).run(
        input.stagedCapabilityHash,
        input.runId,
        input.agentId,
        input.targetPrincipalGeneration,
        input.capabilityExpiresAt,
      );
      this.#database.prepare(`
        INSERT INTO provider_agent_custody(
          run_id,action_id,operation,actor_agent_id,target_agent_id,authority_id,
          adapter_id,bridge_contract_digest,bridge_capable,capability_hash,
          capability_expires_at,principal_generation,requested_provider_session_ref,
          intent_digest,created_at
        ) VALUES (?,?, 'spawn',?,?,?,?,?,1,?,?,?,?,?,?)
      `).run(
        input.runId, input.actionId, input.agentId, input.agentId,
        input.authorityId, input.adapterId, input.bridgeContractDigest,
        input.stagedCapabilityHash, input.capabilityExpiresAt,
        input.targetPrincipalGeneration, null,
        sha256Digest(canonicalJson(input.providerPayload)), this.#clock(),
      );
      const dispatched = this.#database.prepare(`
        UPDATE provider_actions
           SET status='dispatched',history_json='["prepared","dispatched"]',
               execution_count=1,updated_at=?
         WHERE run_id=? AND adapter_id=? AND action_id=? AND status='prepared'
      `).run(this.#clock(), input.runId, input.adapterId, input.actionId);
      if (dispatched.changes !== 1) throw new Error("lifecycle replacement dispatch claim failed");
      head = this.#lifecycleRotations.appendInCurrentTransaction({
        runId: input.runId,
        agentId: input.agentId,
        custodyId: input.custodyId,
        expectedRevision: head.revision,
        state: "dispatched",
        recordedAt: this.#clock(),
      });
    }).immediate();
    const result = await this.#adapterSupervisor.provisionAgent(input.adapterId, {
      schemaVersion: 1,
      runId: input.runId,
      operation: "spawn",
      actionId: input.actionId,
      targetAgentId: input.agentId,
      authorityId: input.authorityId,
      bridgeGeneration: input.targetBridgeGeneration,
      bridgeContractDigest: input.bridgeContractDigest,
      payload: input.providerPayload,
      lifecycleAttestation: {
        custodyId: input.custodyId,
        checkpointDigest: `sha256:${input.checkpointSha256}`,
        challengeDigest: input.launchAttestationChallengeDigest,
      },
    }, {
      capability: input.stagedCapability,
      socketPath: this.#fabricSocketPath as string,
      expectedPrincipal: {
        agentId: input.agentId,
        projectSessionId: stringField(
          rowOrNotFound(
            this.#database.prepare("SELECT project_session_id FROM runs WHERE run_id=?").get(input.runId),
            "lifecycle rotation run",
          ),
          "project_session_id",
        ),
        runId: input.runId,
        principalGeneration: input.targetPrincipalGeneration,
      },
      lifecycleAttestation: {
        challenge: input.launchAttestationChallenge,
        custodyId: input.custodyId,
        checkpointDigest: `sha256:${input.checkpointSha256}`,
        challengeDigest: input.launchAttestationChallengeDigest,
      },
    });
    if (result.providerSessionGeneration !== input.targetProviderGeneration) {
      const proof = {
        schemaVersion: 1,
        kind: "integrity-quarantine",
        sourceState: head.state,
        reason: "provider-result-reserved-generation-crossed",
        providerActionRef: { runId: input.runId, adapterId: input.adapterId, actionId: input.actionId },
        evidenceDigest: sha256Digest(canonicalJson({
          expectedProviderSessionGeneration: input.targetProviderGeneration,
          observedProviderSessionGeneration: result.providerSessionGeneration,
        })),
      };
      await this.#finalizeLifecycleRotationAdopted(
        input,
        head,
        sha256Digest(canonicalJson(proof)),
        null,
        {
          disposition: "quarantined",
          proofKind: "integrity-quarantine",
          transitionProof: proof,
        },
      );
      return;
    }
    const terminalEvidenceDigest = sha256Digest(canonicalJson(result));
    this.#database.transaction(() => {
      const terminalized = this.#database.prepare(`
        UPDATE provider_actions
           SET status='terminal',history_json='["prepared","dispatched","accepted","terminal"]',
               effect_count=1,idempotency_proven=1,result_json=?,updated_at=?
         WHERE run_id=? AND adapter_id=? AND action_id=? AND status='dispatched'
      `).run(canonicalJson(result), this.#clock(), input.runId, input.adapterId, input.actionId);
      if (terminalized.changes !== 1) throw new Error("lifecycle replacement action changed before terminal commit");
      head = this.#lifecycleRotations.appendInCurrentTransaction({
        runId: input.runId,
        agentId: input.agentId,
        custodyId: input.custodyId,
        expectedRevision: head.revision,
        state: "provider-terminal",
        terminalEvidenceDigest,
        recordedAt: this.#clock(),
      });
      head = this.#lifecycleRotations.appendInCurrentTransaction({
        runId: input.runId,
        agentId: input.agentId,
        custodyId: input.custodyId,
        expectedRevision: head.revision,
        state: "committing",
        terminalEvidenceDigest,
        recordedAt: this.#clock(),
      });
    }).immediate();
    await this.#finalizeLifecycleRotationAdopted(input, head, terminalEvidenceDigest, result);
  }

  async #finalizeLifecycleRotationAdopted(
    input: Readonly<{
      runId: string;
      agentId: string;
      custodyId: string;
      adapterId: string;
      actionId: string;
      sourceActionId: string;
      sourceCapabilityHash: string;
      sourceProviderSessionRef: string;
      stagedCapabilityHash: string;
      checkpointSha256?: string;
      lifecycleInput?: {
        action: "compact" | "rotate";
        agentId: string;
        taskId: string;
        taskRevision: number;
        checkpoint: LifecycleCheckpoint;
        commandId: string;
      };
    }>,
    head: LifecycleCustodyHead,
    terminalEvidenceDigest: string,
    result: AgentProvisionProviderResult | null,
    terminal: Readonly<{
      disposition: "adopted" | "no-effect" | "superseded" | "quarantined";
      proofKind: "provider-terminal" | "zero-dispatch-no-effect" | "predispatch-superseded" |
        "postterminal-adoption-cas-superseded" | "integrity-quarantine";
      transitionProof: Readonly<Record<string, unknown>>;
    }> = {
      disposition: "adopted",
      proofKind: "provider-terminal",
      transitionProof: { schemaVersion: 1, kind: "provider-terminal" },
    },
  ): Promise<void> {
    if (terminal.disposition === "adopted" && (result === null || input.lifecycleInput === undefined || input.checkpointSha256 === undefined)) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "lifecycle adoption lost its immutable input");
    }
    const authority = this.#lifecycleReceiptAuthority;
    if (authority === undefined) {
      throw new FabricError(
        "CAPABILITY_UNAVAILABLE",
        "lifecycle terminal apply requires an external receipt authority",
      );
    }
    const scopeHead = rowOrNotFound(this.#database.prepare(`
      SELECT scope.authority_id,head.checkpoint_digest,head.revision
        FROM lifecycle_admitted_run_scopes scope
        JOIN lifecycle_receipt_scope_heads head
          ON head.project_session_id=scope.project_session_id AND head.run_id=scope.run_id
       WHERE scope.project_session_id=? AND scope.run_id=?
    `).get(head.projectSessionId, input.runId), "admitted lifecycle receipt scope");
    const applyId = terminal.proofKind === "postterminal-adoption-cas-superseded"
      ? `${input.custodyId}:apply:postterminal-superseded`
      : `${input.custodyId}:apply`;
    const transitionProof = {
      ...terminal.transitionProof,
      actionRef: { adapterId: input.adapterId, actionId: input.actionId },
      terminalEvidenceDigest,
    };
    const custodyOwner = rowOrNotFound(this.#database.prepare(`
      SELECT bridge_owner_kind,target_provider_generation,target_principal_generation,
             target_bridge_generation,staged_capability_hash,
             source_adapter_id,source_custody_action_id,source_adapter_contract_digest,
             source_provider_session_ref,source_provider_generation,
             source_principal_generation,source_bridge_generation,source_bridge_revision,
             precondition_digest,launch_attest_challenge_digest,checkpoint_digest
        FROM lifecycle_rotation_custodies
       WHERE run_id=? AND agent_id=? AND custody_id=?
    `).get(input.runId, input.agentId, input.custodyId), "lifecycle custody owner");
    const bridgeOwnerKind = stringField(custodyOwner, "bridge_owner_kind") as "chair" | "child";
    const targetProviderGeneration = numberField(custodyOwner, "target_provider_generation");
    const targetPrincipalGeneration = numberField(custodyOwner, "target_principal_generation");
    const targetBridgeGeneration = numberField(custodyOwner, "target_bridge_generation");
    const custodyWriteLeases = this.#database.prepare(`
      SELECT ownership.lease_id AS leaseId,ownership.lease_generation AS leaseGeneration,
             lease.status,lease.generation
        FROM lifecycle_custody_write_leases ownership
        JOIN leases lease ON lease.lease_id=ownership.lease_id AND lease.run_id=ownership.run_id
       WHERE ownership.run_id=? AND ownership.agent_id=? AND ownership.custody_id=?
         AND ownership.active_owner=1
       ORDER BY ownership.ordinal
    `).all(input.runId, input.agentId, input.custodyId).map((candidate) =>
      rowOrNotFound(candidate, "lifecycle custody write lease"));
    const custodyAdoptionDeliveries = this.#database.prepare(`
      SELECT ownership.delivery_id AS deliveryId,
             ownership.delivery_generation AS claimGeneration,
             ownership.recipient_agent_id AS requesterAgentId,
             ownership.source_state AS sourceState,
             delivery.claim_generation AS liveClaimGeneration,
             delivery.target_provider_session AS targetProviderSession,
             delivery.state,delivery.revision
        FROM lifecycle_custody_adoption_deliveries ownership
        JOIN result_deliveries delivery
          ON delivery.result_delivery_id=ownership.delivery_id AND delivery.run_id=ownership.run_id
       WHERE ownership.run_id=? AND ownership.agent_id=? AND ownership.custody_id=?
         AND ownership.active_owner=1
       ORDER BY ownership.ordinal
    `).all(input.runId, input.agentId, input.custodyId).map((candidate) =>
      rowOrNotFound(candidate, "lifecycle custody adoption delivery"));
    if (terminal.disposition === "adopted") {
      for (const delivery of custodyAdoptionDeliveries) {
        if (
          !["claimed", "provider-accepted"].includes(stringField(delivery, "state")) ||
          numberField(delivery, "liveClaimGeneration") !== numberField(delivery, "claimGeneration") ||
          stringField(delivery, "requesterAgentId") !== input.agentId ||
          stringField(delivery, "targetProviderSession") !== input.sourceProviderSessionRef
        ) {
          throw new FabricError(
            "LIFECYCLE_PRECONDITION_FAILED",
            "captured lifecycle adoption delivery left its eligible source state",
          );
        }
      }
    }
    const mutationWrite = (
      relation: string,
      key: string,
      operation: "insert" | "update" | "delete",
      before: Readonly<Record<string, unknown>> | null,
      after: Readonly<Record<string, unknown>> | null,
    ) => {
      if ((operation === "insert") !== (before === null) || (operation === "delete") !== (after === null)) {
        throw new Error("lifecycle mutation plan row state is crossed");
      }
      return {
        relation,
        keyDigest: lifecycleDigest("mutation-key", { schemaVersion: 1, relation, key }),
        operation,
        expectedSemanticDigest: before === null ? null : lifecycleDigest("mutation-before", before),
        afterSemanticJcs: after === null ? null : canonicalJson(after),
        afterSemanticDigest: after === null ? null : lifecycleDigest("mutation-after", after),
      };
    };
    const agentBefore = rowOrNotFound(this.#database.prepare(`
      SELECT lifecycle,provider_session_ref FROM agents WHERE run_id=? AND agent_id=?
    `).get(input.runId, input.agentId), "lifecycle mutation agent source");
    const actionBefore = rowOrNotFound(this.#database.prepare(`
      SELECT status,execution_count,effect_count,idempotency_proven
        FROM provider_actions WHERE run_id=? AND adapter_id=? AND action_id=?
    `).get(input.runId, input.adapterId, input.actionId), "lifecycle mutation provider action source");
    const freezeReason = `lifecycle-rotation:${sha256(input.custodyId).slice(0, 32)}`;
    const freezeBeforeValue = this.#database.prepare(`
      SELECT reason FROM delivery_freezes WHERE run_id=? AND agent_id=? AND reason=?
    `).get(input.runId, input.agentId, freezeReason);
    const freezeBefore = isRow(freezeBeforeValue) ? freezeBeforeValue : null;
    const mutationWrites: Array<ReturnType<typeof mutationWrite>> = [];
    const localWrites: Array<Readonly<{
      relation: string;
      key: string;
      operation: "insert" | "update" | "delete";
    }>> = [];
    const auxiliaryLocalWrites: Array<Readonly<{
      relation: string;
      key: string;
      operation: "insert" | "update" | "delete";
    }>> = [];
    if (terminal.disposition === "adopted") {
      const adopted = result as AgentProvisionProviderResult;
      const lifecycleInput = input.lifecycleInput as NonNullable<typeof input.lifecycleInput>;
      const bridgeBefore = bridgeOwnerKind === "chair"
        ? rowOrNotFound(this.#database.prepare(`
            SELECT provider_adapter_id AS adapterId,provider_action_id AS actionId,
                   provider_session_ref AS providerSessionRef,
                   provider_session_generation AS providerGeneration,
                   principal_generation AS principalGeneration,
                   bridge_generation AS bridgeGeneration,capability_hash AS capabilityHash,
                   activation_evidence_digest AS activationEvidenceDigest,revision
              FROM launched_chair_bridge_state
             WHERE project_session_id=(SELECT project_session_id FROM runs WHERE run_id=?)
               AND coordination_run_id=? AND chair_agent_id=? AND state='active'
          `).get(input.runId, input.runId, input.agentId), "lifecycle chair bridge source")
        : rowOrNotFound(this.#database.prepare(`
            SELECT adapter_id AS adapterId,action_id AS actionId,
                   provider_session_ref AS providerSessionRef,
                   provider_session_generation AS providerGeneration,
                   bridge_generation AS bridgeGeneration,capability_hash AS capabilityHash,
                   activation_evidence_digest AS activationEvidenceDigest,revision
              FROM agent_bridge_state
             WHERE run_id=? AND agent_id=? AND bridge_state='active'
          `).get(input.runId, input.agentId), "lifecycle child bridge source");
      const bridgeAfter = {
        adapterId: input.adapterId,
        actionId: input.actionId,
        providerSessionRef: adopted.providerSessionRef,
        providerGeneration: targetProviderGeneration,
        ...(bridgeOwnerKind === "chair" ? { principalGeneration: targetPrincipalGeneration } : {}),
        bridgeGeneration: targetBridgeGeneration,
        capabilityHash: input.stagedCapabilityHash,
        activationEvidenceDigest: adopted.activationEvidenceDigest,
        revision: numberField(bridgeBefore, "revision") + 1,
      };
      mutationWrites.push(mutationWrite(
        bridgeOwnerKind === "chair" ? "chair-bridge" : "agent-bridge",
        `${input.runId}:${input.agentId}`,
        "update",
        bridgeBefore,
        bridgeAfter,
      ));
      localWrites.push({
        relation: bridgeOwnerKind === "chair" ? "chair-bridge" : "agent-bridge",
        key: `${input.runId}:${input.agentId}`,
        operation: "update",
      });
      const capabilityBefore = rowOrNotFound(this.#database.prepare(`
        SELECT principal_generation AS principalGeneration,
               CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END AS revoked
          FROM capabilities WHERE token_hash=?
      `).get(input.sourceCapabilityHash), "lifecycle source capability");
      mutationWrites.push(mutationWrite(
        "principal-capability",
        input.sourceCapabilityHash,
        "update",
        capabilityBefore,
        { principalGeneration: numberField(capabilityBefore, "principalGeneration"), revoked: 1 },
      ));
      localWrites.push({ relation: "principal-capability", key: input.sourceCapabilityHash, operation: "update" });
      mutationWrites.push(mutationWrite(
        "agent-state",
        `${input.runId}:${input.agentId}`,
        "update",
        agentBefore,
        { lifecycle: "ready", provider_session_ref: adopted.providerSessionRef },
      ));
      localWrites.push({ relation: "agent-state", key: `${input.runId}:${input.agentId}`, operation: "update" });
      const providerBeforeValue = this.#database.prepare(`
        SELECT provider_session_generation AS providerGeneration,context_revision AS contextRevision,
               reconciled_checkpoint_sha256 AS checkpointSha256
          FROM provider_state WHERE run_id=? AND agent_id=?
      `).get(input.runId, input.agentId);
      const providerBefore = isRow(providerBeforeValue) ? providerBeforeValue : null;
      mutationWrites.push(mutationWrite(
        "provider-session",
        `${input.runId}:${input.agentId}`,
        providerBefore === null ? "insert" : "update",
        providerBefore,
        { providerGeneration: targetProviderGeneration, contextRevision: 0, checkpointSha256: input.checkpointSha256 },
      ));
      localWrites.push({
        relation: "provider-session",
        key: `${input.runId}:${input.agentId}`,
        operation: providerBefore === null ? "insert" : "update",
      });
      mutationWrites.push(mutationWrite(
        "audit",
        `${input.runId}:${lifecycleInput.commandId}`,
        "insert",
        null,
        {
          agentId: input.agentId,
          action: lifecycleInput.action,
          taskId: lifecycleInput.taskId,
          taskRevision: lifecycleInput.taskRevision,
          checkpointSha256: input.checkpointSha256,
          priorResumeReference: input.sourceProviderSessionRef,
          replacementResumeReference: adopted.providerSessionRef,
        },
      ));
      localWrites.push({
        relation: "audit",
        key: `${input.runId}:${lifecycleInput.commandId}`,
        operation: "insert",
      });
    } else {
      const stagedCapabilityValue = this.#database.prepare(`
        SELECT principal_generation AS principalGeneration,
               CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END AS revoked
          FROM capabilities WHERE token_hash=? AND revoked_at IS NULL
      `).get(input.stagedCapabilityHash);
      if (isRow(stagedCapabilityValue)) {
        mutationWrites.push(mutationWrite(
          "principal-capability",
          input.stagedCapabilityHash,
          "update",
          stagedCapabilityValue,
          { principalGeneration: numberField(stagedCapabilityValue, "principalGeneration"), revoked: 1 },
        ));
        localWrites.push({
          relation: "principal-capability",
          key: input.stagedCapabilityHash,
          operation: "update",
        });
      }
      const terminalAction = terminal.disposition === "quarantined"
        ? { status: "quarantined", execution_count: actionBefore.execution_count,
            effect_count: actionBefore.effect_count, idempotency_proven: 0 }
        : { status: "terminal", execution_count: terminal.disposition === "no-effect" ? 0 : actionBefore.execution_count,
            effect_count: terminal.disposition === "no-effect" ? 0 : actionBefore.effect_count, idempotency_proven: 1 };
      if (terminal.disposition !== "superseded" || actionBefore.status === "prepared") {
        mutationWrites.push(mutationWrite(
          "provider-action",
          `${input.runId}:${input.adapterId}:${input.actionId}`,
          "update",
          actionBefore,
          terminalAction,
        ));
        localWrites.push({
          relation: "provider-action",
          key: `${input.runId}:${input.adapterId}:${input.actionId}`,
          operation: "update",
        });
      }
      if (terminal.disposition !== "quarantined") {
        mutationWrites.push(mutationWrite(
          "agent-state",
          `${input.runId}:${input.agentId}`,
          "update",
          agentBefore,
          { lifecycle: "ready", provider_session_ref: agentBefore.provider_session_ref },
        ));
        localWrites.push({ relation: "agent-state", key: `${input.runId}:${input.agentId}`, operation: "update" });
      }
    }
    if (terminal.disposition !== "quarantined" && freezeBefore !== null) {
      mutationWrites.push(mutationWrite(
        "freeze-owner",
        `${input.runId}:${input.agentId}`,
        "delete",
        freezeBefore,
        null,
      ));
      localWrites.push({ relation: "freeze-owner", key: `${input.runId}:${input.agentId}`, operation: "delete" });
    }
    if (terminal.disposition === "adopted") {
      const adopted = result as AgentProvisionProviderResult;
      for (const delivery of custodyAdoptionDeliveries) {
        const key = stringField(delivery, "deliveryId");
        const before = {
          state: stringField(delivery, "state"),
          claimGeneration: numberField(delivery, "claimGeneration"),
          targetProviderSession: stringField(delivery, "targetProviderSession"),
          revision: numberField(delivery, "revision"),
        };
        mutationWrites.push(mutationWrite("delivery", key, "update", before, {
          ...before,
          targetProviderSession: adopted.providerSessionRef,
          revision: before.revision + 1,
        }));
        localWrites.push({ relation: "delivery", key, operation: "update" });
        auxiliaryLocalWrites.push({
          relation: "lifecycle_custody_adoption_deliveries",
          key: `${input.runId}:${input.agentId}:${input.custodyId}:${key}:${before.claimGeneration}`,
          operation: "update",
        });
      }
      for (const lease of custodyWriteLeases) {
        auxiliaryLocalWrites.push({
          relation: "lifecycle_custody_write_leases",
          key: `${input.runId}:${input.agentId}:${input.custodyId}:${stringField(lease, "leaseId")}:${numberField(lease, "leaseGeneration")}`,
          operation: "update",
        });
      }
    } else if (terminal.disposition === "no-effect" || terminal.disposition === "superseded") {
      for (const lease of custodyWriteLeases) {
        const key = stringField(lease, "leaseId");
        const before = {
          status: stringField(lease, "status"),
          generation: numberField(lease, "generation"),
        };
        mutationWrites.push(mutationWrite("write-lease", key, "update", before, {
          status: "active",
          generation: before.generation,
        }));
        localWrites.push({ relation: "write-lease", key, operation: "update" });
        auxiliaryLocalWrites.push({
          relation: "lifecycle_custody_write_leases",
          key: `${input.runId}:${input.agentId}:${input.custodyId}:${key}:${before.generation}`,
          operation: "update",
        });
      }
      for (const delivery of custodyAdoptionDeliveries) {
        auxiliaryLocalWrites.push({
          relation: "lifecycle_custody_adoption_deliveries",
          key: `${input.runId}:${input.agentId}:${input.custodyId}:${stringField(delivery, "deliveryId")}:${numberField(delivery, "claimGeneration")}`,
          operation: "update",
        });
      }
    }
    if (terminal.disposition === "quarantined") {
      for (const lease of custodyWriteLeases) {
        auxiliaryLocalWrites.push({
          relation: "lifecycle_custody_write_leases",
          key: `${input.runId}:${input.agentId}:${input.custodyId}:${stringField(lease, "leaseId")}:${numberField(lease, "leaseGeneration")}`,
          operation: "update",
        });
      }
    }
    mutationWrites.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
    const exactMutationPlan = {
      schemaVersion: 1 as const,
      writes: mutationWrites,
      writeSetDigest: lifecycleDigest("mutation-plan", { schemaVersion: 1, writes: mutationWrites }),
    };
    const mutationPlan = {
      schemaVersion: 1,
      writes: mutationWrites,
      writeSetDigest: exactMutationPlan.writeSetDigest,
    };
    const revalidateMutationWrites = (): void => {
      if (terminal.disposition === "adopted") {
        const lifecycleInput = input.lifecycleInput as NonNullable<typeof input.lifecycleInput>;
        const observedSourceVector = this.#lifecycleRotationSourceVectorDigest(
          input.runId,
          input.agentId,
          lifecycleInput.taskId,
          lifecycleInput.checkpoint,
          custodyAdoptionDeliveries.map((delivery) => ({
            deliveryId: stringField(delivery, "deliveryId"),
            claimGeneration: numberField(delivery, "claimGeneration"),
            requesterAgentId: stringField(delivery, "requesterAgentId"),
            targetProviderSession: input.sourceProviderSessionRef,
          })),
        );
        const expectedSourceVector = stringField(custodyOwner, "precondition_digest");
        if (observedSourceVector !== expectedSourceVector) {
          throw new LifecycleAdoptionSourceVectorDriftError(expectedSourceVector, observedSourceVector);
        }
      }
      const observed = new Map<string, Readonly<Record<string, unknown>> | null>();
      observed.set("agent-state", rowOrNotFound(this.#database.prepare(`
        SELECT lifecycle,provider_session_ref FROM agents WHERE run_id=? AND agent_id=?
      `).get(input.runId, input.agentId), "lifecycle mutation agent revalidation"));
      observed.set("provider-action", rowOrNotFound(this.#database.prepare(`
        SELECT status,execution_count,effect_count,idempotency_proven
          FROM provider_actions WHERE run_id=? AND adapter_id=? AND action_id=?
      `).get(input.runId, input.adapterId, input.actionId), "lifecycle mutation action revalidation"));
      const currentFreeze = this.#database.prepare(`
        SELECT reason FROM delivery_freezes WHERE run_id=? AND agent_id=? AND reason=?
      `).get(input.runId, input.agentId, freezeReason);
      observed.set("freeze-owner", isRow(currentFreeze) ? currentFreeze : null);
      const capabilityHash = terminal.disposition === "adopted"
        ? input.sourceCapabilityHash
        : input.stagedCapabilityHash;
      const currentCapability = this.#database.prepare(`
        SELECT principal_generation AS principalGeneration,
               CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END AS revoked
          FROM capabilities WHERE token_hash=?
      `).get(capabilityHash);
      observed.set("principal-capability", isRow(currentCapability) ? currentCapability : null);
      if (terminal.disposition === "adopted") {
        const currentBridge = bridgeOwnerKind === "chair"
          ? this.#database.prepare(`
              SELECT provider_adapter_id AS adapterId,provider_action_id AS actionId,
                     provider_session_ref AS providerSessionRef,
                     provider_session_generation AS providerGeneration,
                     principal_generation AS principalGeneration,
                     bridge_generation AS bridgeGeneration,capability_hash AS capabilityHash,
                     activation_evidence_digest AS activationEvidenceDigest,revision
                FROM launched_chair_bridge_state
               WHERE project_session_id=(SELECT project_session_id FROM runs WHERE run_id=?)
                 AND coordination_run_id=? AND chair_agent_id=? AND state='active'
            `).get(input.runId, input.runId, input.agentId)
          : this.#database.prepare(`
              SELECT adapter_id AS adapterId,action_id AS actionId,
                     provider_session_ref AS providerSessionRef,
                     provider_session_generation AS providerGeneration,
                     bridge_generation AS bridgeGeneration,capability_hash AS capabilityHash,
                     activation_evidence_digest AS activationEvidenceDigest,revision
                FROM agent_bridge_state
               WHERE run_id=? AND agent_id=? AND bridge_state='active'
            `).get(input.runId, input.agentId);
        observed.set(bridgeOwnerKind === "chair" ? "chair-bridge" : "agent-bridge",
          isRow(currentBridge) ? currentBridge : null);
        const currentProvider = this.#database.prepare(`
          SELECT provider_session_generation AS providerGeneration,context_revision AS contextRevision,
                 reconciled_checkpoint_sha256 AS checkpointSha256
            FROM provider_state WHERE run_id=? AND agent_id=?
        `).get(input.runId, input.agentId);
        observed.set("provider-session", isRow(currentProvider) ? currentProvider : null);
        const lifecycleInput = input.lifecycleInput as NonNullable<typeof input.lifecycleInput>;
        const currentAudit = this.#database.prepare(`
          SELECT operation_id FROM lifecycle_operations
           WHERE run_id=? AND agent_id=? AND action=? AND task_id=? AND task_revision=?
             AND checkpoint_sha256=? AND prior_resume_reference=?
        `).get(
          input.runId,
          input.agentId,
          lifecycleInput.action,
          lifecycleInput.taskId,
          lifecycleInput.taskRevision,
          input.checkpointSha256,
          input.sourceProviderSessionRef,
        );
        observed.set("audit", isRow(currentAudit) ? currentAudit : null);
      }
      for (const write of mutationWrites) {
        let current = observed.get(write.relation) ?? null;
        if (write.relation === "delivery") {
          const delivery = custodyAdoptionDeliveries.find((candidate) =>
            lifecycleDigest("mutation-key", {
              schemaVersion: 1,
              relation: "delivery",
              key: stringField(candidate, "deliveryId"),
            }) === write.keyDigest);
          const live = delivery === undefined ? undefined : this.#database.prepare(`
            SELECT state,claim_generation AS claimGeneration,
                   target_provider_session AS targetProviderSession,revision
              FROM result_deliveries WHERE result_delivery_id=? AND run_id=?
          `).get(stringField(delivery, "deliveryId"), input.runId);
          current = isRow(live) ? live : null;
        } else if (write.relation === "write-lease") {
          const lease = custodyWriteLeases.find((candidate) =>
            lifecycleDigest("mutation-key", {
              schemaVersion: 1,
              relation: "write-lease",
              key: stringField(candidate, "leaseId"),
            }) === write.keyDigest);
          const live = lease === undefined ? undefined : this.#database.prepare(`
            SELECT status,generation FROM leases WHERE lease_id=? AND run_id=?
          `).get(stringField(lease, "leaseId"), input.runId);
          current = isRow(live) ? live : null;
        } else if (!observed.has(write.relation)) {
          throw new Error(`lifecycle mutation revalidation lacks ${write.relation}`);
        }
        const currentDigest = current === null ? null : lifecycleDigest("mutation-before", current);
        if (currentDigest !== write.expectedSemanticDigest) {
          throw new Error(`lifecycle ${write.relation} changed after terminal preparation`);
        }
      }
    };
    const recordedAt = this.#clock();
    const prepared = this.#lifecycleReceipts.readPreparedChildCustodyTerminal(
      input.runId,
      input.agentId,
      input.custodyId,
      applyId,
    ) ?? this.#database.transaction(() =>
      this.#lifecycleReceipts.prepareChildCustodyTerminalInCurrentTransaction({
        runId: input.runId,
        agentId: input.agentId,
        custodyId: input.custodyId,
        expectedRevision: head.revision,
        applyId,
        transitionProof,
        mutationPlan,
        recordedAt,
        terminal: {
          disposition: terminal.disposition,
          proofKind: terminal.proofKind,
          terminalEvidenceDigest,
        },
      })
    ).immediate();
    if (
      prepared.applyId !== applyId ||
      prepared.preRevision !== head.revision ||
      prepared.disposition !== terminal.disposition ||
      prepared.proofKind !== terminal.proofKind ||
      prepared.terminalEvidenceDigest !== terminalEvidenceDigest ||
      canonicalJson(prepared.mutationPlan) !== canonicalJson(mutationPlan)
    ) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "prepared lifecycle terminal apply changed");
    }
    const { record, reviewRecord, checkpoint } = await recoverTerminalAuthorityReceipt(authority, prepared);
    try {
      this.#database.transaction(() => {
        this.#lifecycleReceipts.applyAuthorizedChildCustodyTerminalInCurrentTransaction({
        prepared,
        expectedRevision: head.revision,
        expectedScopeHead: {
          checkpointDigest: stringField(scopeHead, "checkpoint_digest"),
          revision: numberField(scopeHead, "revision"),
        },
        receipt: {
          authorityId: record.receipt.authorityId,
          authoritySequence: record.receipt.authoritySequence,
          previousReceiptDigest: record.receipt.previousReceiptDigest,
          receiptDigest: record.receipt.receiptDigest,
          attestation: record.receipt.attestation,
          verifiedAt: this.#clock(),
        },
        ...(reviewRecord === null ? {} : {
          reviewReceipt: {
            authorityId: reviewRecord.receipt.authorityId,
            authoritySequence: reviewRecord.receipt.authoritySequence,
            previousReceiptDigest: reviewRecord.receipt.previousReceiptDigest,
            receiptDigest: reviewRecord.receipt.receiptDigest,
            attestation: reviewRecord.receipt.attestation,
            verifiedAt: this.#clock(),
          },
        }),
        scopeCheckpoint: {
          receiptCount: checkpoint.receiptCount,
          headAuthoritySequence: checkpoint.headAuthoritySequence,
          headReceiptDigest: checkpoint.headReceiptDigest as LifecycleDigest,
          orderedRecordSetDigest: checkpoint.orderedRecordSetDigest,
          checkpointDigest: checkpoint.checkpointDigest,
          attestation: checkpoint.attestation,
          verifiedAt: this.#clock(),
        },
        authorizedAt: this.#clock(),
        appliedAt: this.#clock(),
        localWrites,
        auxiliaryLocalWrites,
        revalidateAdoptionWrites: revalidateMutationWrites,
        performAdoptionWrites: () => {
          if (terminal.disposition !== "adopted") {
            const now = this.#clock();
            if (terminal.disposition === "no-effect" || terminal.disposition === "superseded") {
              for (const lease of custodyWriteLeases) {
                const leaseId = stringField(lease, "leaseId");
                const generation = numberField(lease, "leaseGeneration");
                const restored = this.#database.prepare(`
                  UPDATE leases SET status='active',updated_at=?
                   WHERE lease_id=? AND run_id=? AND holder_agent_id=? AND kind='write'
                     AND generation=? AND status='quarantined'
                `).run(now, leaseId, input.runId, input.agentId, generation);
                if (restored.changes !== 1) throw new Error("lifecycle custody write lease changed before restore");
                const released = this.#database.prepare(`
                  UPDATE lifecycle_custody_write_leases SET active_owner=0
                   WHERE run_id=? AND agent_id=? AND custody_id=? AND lease_id=?
                     AND lease_generation=? AND active_owner=1
                `).run(input.runId, input.agentId, input.custodyId, leaseId, generation);
                if (released.changes !== 1) throw new Error("lifecycle custody write lease ownership changed");
              }
              for (const delivery of custodyAdoptionDeliveries) {
                const released = this.#database.prepare(`
                  UPDATE lifecycle_custody_adoption_deliveries SET active_owner=0
                   WHERE run_id=? AND agent_id=? AND custody_id=? AND delivery_id=?
                     AND delivery_generation=? AND active_owner=1
                `).run(
                  input.runId,
                  input.agentId,
                  input.custodyId,
                  stringField(delivery, "deliveryId"),
                  numberField(delivery, "claimGeneration"),
                );
                if (released.changes !== 1) throw new Error("lifecycle adoption delivery ownership changed");
              }
            }
            if (terminal.disposition === "quarantined") {
              for (const lease of custodyWriteLeases) {
                const released = this.#database.prepare(`
                  UPDATE lifecycle_custody_write_leases SET active_owner=0
                   WHERE run_id=? AND agent_id=? AND custody_id=? AND lease_id=?
                     AND lease_generation=? AND active_owner=1
                `).run(
                  input.runId,
                  input.agentId,
                  input.custodyId,
                  stringField(lease, "leaseId"),
                  numberField(lease, "leaseGeneration"),
                );
                if (released.changes !== 1) throw new Error("lifecycle custody write lease ownership changed");
              }
            }
            this.#database.prepare(`
              UPDATE capabilities SET revoked_at=?
               WHERE token_hash=? AND revoked_at IS NULL
            `).run(now, input.stagedCapabilityHash);
            if (terminal.disposition === "no-effect") {
              const proof = canonicalJson({ ...transitionProof, evidenceDigest: terminalEvidenceDigest });
              const action = this.#database.prepare(`
                UPDATE provider_actions
                   SET status='terminal',history_json='["prepared","terminal"]',
                       execution_count=0,effect_count=0,idempotency_proven=1,
                       result_json=?,journal_revision=journal_revision+1,updated_at=?
                 WHERE run_id=? AND adapter_id=? AND action_id=? AND status='prepared'
                   AND execution_count=0 AND effect_count=0
              `).run(proof, now, input.runId, input.adapterId, input.actionId);
              if (action.changes !== 1) throw new Error("lifecycle zero-dispatch action changed before apply");
              const agent = this.#database.prepare(`
                UPDATE agents SET lifecycle='ready'
                 WHERE run_id=? AND agent_id=? AND lifecycle='suspended'
              `).run(input.runId, input.agentId);
              if (agent.changes !== 1) throw new Error("lifecycle no-effect agent changed before apply");
              const freeze = this.#database.prepare(`
                DELETE FROM delivery_freezes WHERE run_id=? AND agent_id=? AND reason=?
              `).run(
                input.runId,
                input.agentId,
                `lifecycle-rotation:${sha256(input.custodyId).slice(0, 32)}`,
              );
              if (freeze.changes !== 1) throw new Error("lifecycle no-effect freeze changed before apply");
              return;
            }
            if (terminal.disposition === "superseded") {
              const proof = canonicalJson({ ...transitionProof, evidenceDigest: terminalEvidenceDigest });
              const preparedAction = this.#database.prepare(`
                UPDATE provider_actions
                   SET status='terminal',history_json='["prepared","terminal"]',
                       execution_count=0,effect_count=0,idempotency_proven=1,
                       result_json=?,journal_revision=journal_revision+1,updated_at=?
                 WHERE run_id=? AND adapter_id=? AND action_id=? AND status='prepared'
                   AND execution_count=0 AND effect_count=0
              `).run(proof, now, input.runId, input.adapterId, input.actionId);
              if (preparedAction.changes === 0) {
                const terminalAction = this.#database.prepare(`
                  SELECT status,execution_count,effect_count,idempotency_proven
                    FROM provider_actions
                   WHERE run_id=? AND adapter_id=? AND action_id=?
                `).get(input.runId, input.adapterId, input.actionId);
                if (
                  !isRow(terminalAction) || terminalAction.status !== "terminal" ||
                  terminalAction.execution_count !== 1 || terminalAction.effect_count !== 1 ||
                  terminalAction.idempotency_proven !== 1
                ) throw new Error("lifecycle superseded action changed before apply");
              }
              const agent = this.#database.prepare(`
                UPDATE agents SET lifecycle='ready'
                 WHERE run_id=? AND agent_id=? AND lifecycle='suspended'
              `).run(input.runId, input.agentId);
              if (agent.changes !== 1) throw new Error("lifecycle superseded agent changed before apply");
              const freeze = this.#database.prepare(`
                DELETE FROM delivery_freezes WHERE run_id=? AND agent_id=? AND reason=?
              `).run(
                input.runId,
                input.agentId,
                `lifecycle-rotation:${sha256(input.custodyId).slice(0, 32)}`,
              );
              if (freeze.changes !== 1) throw new Error("lifecycle superseded freeze changed before apply");
              return;
            }
            this.#database.prepare(`
              UPDATE provider_actions
                 SET status='quarantined',idempotency_proven=0,
                     result_json=?,journal_revision=journal_revision+1,updated_at=?
               WHERE run_id=? AND adapter_id=? AND action_id=?
                 AND status IN ('prepared','dispatched','accepted','ambiguous','terminal')
            `).run(
              canonicalJson({ ...transitionProof, evidenceDigest: terminalEvidenceDigest }),
              now,
              input.runId,
              input.adapterId,
              input.actionId,
            );
            return;
          }
          const adopted = result as AgentProvisionProviderResult;
          const lifecycleInput = input.lifecycleInput as NonNullable<typeof input.lifecycleInput>;
          for (const delivery of custodyAdoptionDeliveries) {
            const deliveryId = stringField(delivery, "deliveryId");
            const claimGeneration = numberField(delivery, "claimGeneration");
            const revision = numberField(delivery, "revision");
            const transferred = this.#database.prepare(`
              UPDATE result_deliveries
                 SET target_provider_session=?,revision=revision+1,updated_at=?
               WHERE result_delivery_id=? AND run_id=? AND requester_agent_id=?
                 AND state=? AND claim_generation=? AND target_provider_session=? AND revision=?
            `).run(
              adopted.providerSessionRef,
              this.#clock(),
              deliveryId,
              input.runId,
              stringField(delivery, "requesterAgentId"),
              stringField(delivery, "state"),
              claimGeneration,
              input.sourceProviderSessionRef,
              revision,
            );
            if (transferred.changes !== 1) throw new Error("lifecycle adoption delivery changed before transfer");
            const released = this.#database.prepare(`
              UPDATE lifecycle_custody_adoption_deliveries SET active_owner=0
               WHERE run_id=? AND agent_id=? AND custody_id=? AND delivery_id=?
                 AND delivery_generation=? AND active_owner=1
            `).run(input.runId, input.agentId, input.custodyId, deliveryId, claimGeneration);
            if (released.changes !== 1) throw new Error("lifecycle adoption delivery ownership changed");
          }
          const bridge = bridgeOwnerKind === "chair"
            ? this.#database.prepare(`
                UPDATE launched_chair_bridge_state
                   SET provider_adapter_id=?,provider_action_id=?,provider_session_ref=?,
                       provider_session_generation=?,principal_generation=?,bridge_generation=?,capability_hash=?,
                       activation_evidence_digest=?,revision=revision+1,updated_at=?
                 WHERE project_session_id=(SELECT project_session_id FROM runs WHERE run_id=?)
                   AND coordination_run_id=? AND chair_agent_id=? AND state='active'
                   AND provider_adapter_id=? AND provider_action_id=?
                   AND provider_contract_digest=? AND provider_session_ref=?
                   AND provider_session_generation=? AND principal_generation=?
                   AND bridge_generation=? AND capability_hash=? AND revision=?
              `).run(
                input.adapterId, input.actionId, adopted.providerSessionRef,
                adopted.providerSessionGeneration, targetPrincipalGeneration, adopted.bridgeGeneration,
                input.stagedCapabilityHash, adopted.activationEvidenceDigest, this.#clock(),
                input.runId, input.runId, input.agentId,
                stringField(custodyOwner, "source_adapter_id"),
                stringField(custodyOwner, "source_custody_action_id"),
                stringField(custodyOwner, "source_adapter_contract_digest"),
                stringField(custodyOwner, "source_provider_session_ref"),
                numberField(custodyOwner, "source_provider_generation"),
                numberField(custodyOwner, "source_principal_generation"),
                numberField(custodyOwner, "source_bridge_generation"),
                input.sourceCapabilityHash, numberField(custodyOwner, "source_bridge_revision"),
              )
            : this.#database.prepare(`
                UPDATE agent_bridge_state
                   SET adapter_id=?,action_id=?,provider_session_ref=?,provider_session_generation=?,
                       bridge_state='active',bridge_generation=?,capability_hash=?,
                       activation_evidence_digest=?,revision=revision+1,updated_at=?
                 WHERE run_id=? AND agent_id=? AND bridge_state='active'
                   AND adapter_id=? AND action_id=? AND provider_session_ref=?
                   AND provider_session_generation=? AND bridge_generation=?
                   AND capability_hash=? AND revision=?
              `).run(
                input.adapterId, input.actionId, adopted.providerSessionRef,
                adopted.providerSessionGeneration, adopted.bridgeGeneration,
                input.stagedCapabilityHash, adopted.activationEvidenceDigest, this.#clock(),
                input.runId, input.agentId,
                stringField(custodyOwner, "source_adapter_id"),
                stringField(custodyOwner, "source_custody_action_id"),
                stringField(custodyOwner, "source_provider_session_ref"),
                numberField(custodyOwner, "source_provider_generation"),
                numberField(custodyOwner, "source_bridge_generation"),
                input.sourceCapabilityHash, numberField(custodyOwner, "source_bridge_revision"),
              );
          if (bridge.changes !== 1) throw new Error("lifecycle source bridge changed before apply");
          const capability = this.#database.prepare(`
            UPDATE capabilities SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL
          `).run(this.#clock(), input.sourceCapabilityHash);
          if (capability.changes !== 1) throw new Error("lifecycle source capability changed before apply");
          const agent = this.#database.prepare(`
            UPDATE agents SET lifecycle='ready',provider_session_ref=?
             WHERE run_id=? AND agent_id=? AND lifecycle='suspended'
          `).run(adopted.providerSessionRef, input.runId, input.agentId);
          if (agent.changes !== 1) throw new Error("lifecycle agent changed before apply");
          this.#database.prepare(`
            INSERT INTO provider_state(
              run_id,agent_id,provider_session_generation,context_revision,
              reconciled_checkpoint_sha256
            ) VALUES (?,?,?,0,?)
            ON CONFLICT(run_id,agent_id) DO UPDATE SET
              provider_session_generation=excluded.provider_session_generation,
              context_revision=excluded.context_revision,
              reconciled_checkpoint_sha256=excluded.reconciled_checkpoint_sha256
          `).run(input.runId, input.agentId, adopted.providerSessionGeneration, input.checkpointSha256);
          const freeze = this.#database.prepare(`
            DELETE FROM delivery_freezes WHERE run_id=? AND agent_id=? AND reason=?
          `).run(
            input.runId,
            input.agentId,
            `lifecycle-rotation:${sha256(input.custodyId).slice(0, 32)}`,
          );
          if (freeze.changes !== 1) throw new Error("lifecycle delivery freeze changed before apply");
          for (const lease of custodyWriteLeases) {
            const released = this.#database.prepare(`
              UPDATE lifecycle_custody_write_leases SET active_owner=0
               WHERE run_id=? AND agent_id=? AND custody_id=? AND lease_id=?
                 AND lease_generation=? AND active_owner=1
            `).run(
              input.runId,
              input.agentId,
              input.custodyId,
              stringField(lease, "leaseId"),
              numberField(lease, "leaseGeneration"),
            );
            if (released.changes !== 1) throw new Error("lifecycle custody write lease ownership changed");
          }
          this.#recordLifecycleOperation(
            input.runId,
            lifecycleInput,
            input.sourceProviderSessionRef,
            adopted.providerSessionRef,
          );
        },
        });
      }).immediate();
    } catch (error: unknown) {
      if (terminal.disposition !== "adopted" || !(error instanceof LifecycleAdoptionSourceVectorDriftError)) {
        throw error;
      }
      const driftEvidence = {
        schemaVersion: 1,
        expectedSourceVectorDigest: error.expectedDigest,
        observedSourceVectorDigest: error.observedDigest,
      };
      const terminalObservationDigest = sha256Digest(canonicalJson(result));
      const proof = {
        schemaVersion: 1,
        kind: "postterminal-adoption-cas-superseded",
        sourceState: head.state,
        expectedSourceJournalDigest: error.expectedDigest,
        observedSourceJournalDigest: error.observedDigest,
        expectedCheckpointDigest: stringField(custodyOwner, "checkpoint_digest"),
        observedCheckpointDigest: stringField(custodyOwner, "checkpoint_digest"),
        terminalObservationDigest,
        replacementCandidateDigest: terminalObservationDigest,
        expectedMutationPreconditionDigest: error.expectedDigest,
        failedCasEvidenceDigest: sha256Digest(canonicalJson(driftEvidence)),
      };
      this.#fault("lifecycle-rotation:after-authoritative-adoption-receipt");
      this.#database.transaction(() => {
        this.#lifecycleReceipts.persistVerifiedAuthorityReceiptInCurrentTransaction(
          prepared,
          record,
        );
      }).immediate();
      head = this.#database.transaction(() => this.#lifecycleRotations.appendInCurrentTransaction({
        runId: input.runId,
        agentId: input.agentId,
        custodyId: input.custodyId,
        expectedRevision: head.revision,
        state: "committing",
        terminalEvidenceDigest,
        recordedAt: this.#clock(),
      })).immediate();
      await this.#finalizeLifecycleRotationAdopted(
        input,
        head,
        terminalEvidenceDigest,
        null,
        {
          disposition: "superseded",
          proofKind: "postterminal-adoption-cas-superseded",
          transitionProof: proof,
        },
      );
    }
  }

  #verifyCheckpoint(
    runId: string,
    agentId: string,
    taskId: string,
    taskRevision: number,
    checkpoint: LifecycleCheckpoint,
  ): void {
    if (!/^[0-9a-f]{64}$/u.test(checkpoint.sha256)) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "checkpoint digest is invalid");
    }
    const task = this.getTask(runId, taskId);
    if (task.revision !== taskRevision || task.ownerAgentId !== agentId) {
      throw new FabricError("TASK_REVISION_CONFLICT", "checkpoint task revision or owner changed");
    }
    const resolvedRoot = resolveRunArtifactRoot(this.#database, runId);
    if (resolvedRoot.artifactRoot === null) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "run has no checkpoint directory");
    }
    const root = canonicalPath(resolvedRoot.artifactRoot);
    const checkpointPath = canonicalPath(resolve(root, checkpoint.relativePath));
    if (!pathContains(root, checkpointPath) || !existsSync(checkpointPath)) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "checkpoint path is missing or outside the run directory");
    }
    const bytes = readFileSync(checkpointPath);
    if (createHash("sha256").update(bytes).digest("hex") !== checkpoint.sha256) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "checkpoint digest does not match its bytes");
    }
    const document: unknown = JSON.parse(bytes.toString("utf8"));
    if (
      !isRow(document) ||
      document.agentId !== agentId ||
      document.mailboxWatermark !== checkpoint.mailboxWatermark ||
      canonicalJson(document.acknowledgedAboveWatermark) !== canonicalJson(checkpoint.acknowledgedAboveWatermark) ||
      canonicalJson(document.inFlightChildren) !== canonicalJson(checkpoint.inFlightChildren) ||
      canonicalJson(document.openWork) !== canonicalJson(checkpoint.openWork) ||
      document.nextAction !== checkpoint.nextAction ||
      document.providerResumeReference !== checkpoint.providerResumeReference
    ) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "checkpoint record does not match its durable document");
    }
    this.#assertCheckpointMatchesCurrentState(runId, agentId, checkpoint);
    this.#database
      .prepare(
        "INSERT OR IGNORE INTO lifecycle_checkpoints(checkpoint_id, run_id, agent_id, task_id, task_revision, relative_path, sha256, checkpoint_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        uuidv7(),
        runId,
        agentId,
        taskId,
        taskRevision,
        checkpoint.relativePath,
        checkpoint.sha256,
        canonicalJson(checkpoint),
        this.#clock(),
      );
  }

  #assertCheckpointMatchesCurrentState(
    runId: string,
    agentId: string,
    checkpoint: LifecycleCheckpoint,
  ): void {
    const mailbox = this.getMailboxState(runId, agentId);
    if (mailbox.contiguousWatermark !== checkpoint.mailboxWatermark || canonicalJson(mailbox.acknowledgedAboveWatermark) !== canonicalJson(checkpoint.acknowledgedAboveWatermark)) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "checkpoint mailbox state is stale");
    }
    const provider = rowOrNotFound(
      this.#database.prepare("SELECT provider_session_ref FROM agents WHERE run_id=? AND agent_id=?").get(runId, agentId),
      "checkpoint agent",
    );
    if (provider.provider_session_ref !== checkpoint.providerResumeReference) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "checkpoint provider session does not match current Fabric state");
    }
    const currentChildren = this.#database.prepare(`
      SELECT agent_id FROM agents
       WHERE run_id=? AND parent_agent_id=?
         AND lifecycle NOT IN ('completion-ready','archived')
       ORDER BY agent_id
    `).all(runId, agentId).map((value) => stringField(rowOrNotFound(value, "checkpoint child"), "agent_id"));
    const currentOpenWork = this.#database.prepare(`
      SELECT task_id FROM tasks
       WHERE run_id=? AND owner_agent_id=?
         AND state NOT IN ('complete','cancelled','degraded')
       ORDER BY task_id
    `).all(runId, agentId).map((value) => stringField(rowOrNotFound(value, "checkpoint task"), "task_id"));
    if (
      canonicalJson(checkpoint.inFlightChildren) !== canonicalJson(currentChildren) ||
      canonicalJson(checkpoint.openWork) !== canonicalJson(currentOpenWork)
    ) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "checkpoint children or open work do not match current Fabric state");
    }
  }

  #hasCurrentValidatedCheckpoint(runId: string, agentId: string, sha256Digest: string): boolean {
    if (!/^[0-9a-f]{64}$/u.test(sha256Digest)) return false;
    const stored = this.#database.prepare(`
      SELECT checkpoint.checkpoint_json
        FROM lifecycle_checkpoints checkpoint
        JOIN tasks task
          ON task.run_id=checkpoint.run_id AND task.task_id=checkpoint.task_id
         AND task.revision=checkpoint.task_revision AND task.owner_agent_id=checkpoint.agent_id
       WHERE checkpoint.run_id=? AND checkpoint.agent_id=? AND checkpoint.sha256=?
    `).get(runId, agentId, sha256Digest);
    if (!isRow(stored) || typeof stored.checkpoint_json !== "string") return false;
    try {
      const checkpoint: unknown = JSON.parse(stored.checkpoint_json);
      if (!isLifecycleCheckpoint(checkpoint) || checkpoint.sha256 !== sha256Digest) return false;
      this.#assertCheckpointMatchesCurrentState(runId, agentId, checkpoint);
      return true;
    } catch {
      return false;
    }
  }

  #assertReleaseReady(runId: string, agentId: string, taskId: string): void {
    const lifecycle = this.getAgentLifecycle(runId, agentId).lifecycle;
    const task = this.getTask(runId, taskId);
    const activeLeases = numberField(
      rowOrNotFound(
        this.#database
          .prepare("SELECT COUNT(*) AS count FROM leases WHERE run_id = ? AND holder_agent_id = ? AND status IN ('active', 'quarantined')")
          .get(runId, agentId),
        "lease count",
      ),
      "count",
    );
    const activeChildren = numberField(
      rowOrNotFound(
        this.#database
          .prepare("SELECT COUNT(*) AS count FROM agents WHERE run_id = ? AND parent_agent_id = ? AND lifecycle != 'archived'")
          .get(runId, agentId),
        "child count",
      ),
      "count",
    );
    const barrier = this.#database.prepare("SELECT 1 FROM barriers WHERE run_id = ? AND scope = 'run' AND state = 'closed'").get(runId);
    if (
      lifecycle !== "idle" ||
      !["complete", "cancelled", "degraded"].includes(task.state) ||
      activeLeases > 0 ||
      activeChildren > 0 ||
      !isRow(barrier)
    ) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "release requires terminal task, no lease or child, and a closed run barrier");
    }
  }

  #recordLifecycleOperation(
    runId: string,
    input: {
      action: string;
      agentId: string;
      taskId: string;
      taskRevision: number;
      checkpoint: LifecycleCheckpoint;
    },
    priorReference: string | null,
    replacementReference: string | null,
  ): void {
    this.#database
      .prepare(
        "INSERT INTO lifecycle_operations(operation_id, run_id, agent_id, action, task_id, task_revision, checkpoint_sha256, prior_resume_reference, replacement_resume_reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        uuidv7(),
        runId,
        input.agentId,
        input.action,
        input.taskId,
        input.taskRevision,
        input.checkpoint.sha256,
        priorReference,
        replacementReference,
        this.#clock(),
      );
  }

  #persistProviderAction(
    runId: string,
    adapterId: string,
    actionId: string,
    raw: unknown,
    result: ProviderActionResult,
  ): void {
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

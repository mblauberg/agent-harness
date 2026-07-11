import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, posix, relative, resolve, sep } from "node:path";

import type Database from "better-sqlite3";
import { v7 as uuidv7 } from "uuid";
import type {
  AgentCustodyResult,
  OperationInputMap,
  ProtocolOperation,
  VerifiedProtocolCredential,
} from "@local/agent-fabric-protocol";

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
  isAgentAuthorityOperation,
  isReadFabricOperation,
  type FabricOperation,
} from "../domain/operations.js";
import { CommandJournal } from "../application/command-journal.js";
import {
  ProviderSessionCoordinator,
  type CrossFamilyReviewEvidenceInput,
  type ModelRoutingEvidenceInput,
} from "../application/provider-session-coordinator.js";
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
import { GitRepositoryReadService } from "../operator/git-repository-read.js";
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
import { ScopedGateStore } from "../gates/store.js";
import { HierarchicalAdmissionStore } from "../resources/store.js";
import { AtomicDeliveryStore } from "../results/store.js";
import { NotificationOutbox } from "../attention/outbox.js";
import { MacOsNativeDesktopAdapter } from "../attention/native-desktop.js";
import {
  NativeNotificationWorker,
  type NotificationWorkerPassResult,
} from "../attention/notification-worker.js";
import { FabricClient } from "./client.js";
import type {
  ArtifactResult,
  AtomicTeamCreateInput,
  AuthorityResult,
  BarrierResult,
  BudgetDimensionResult,
  BudgetResult,
  CapabilityRotationResult,
  DiscussionGroupInput,
  ExistingTeamCreateInput,
  EventsAfterResult,
  InterventionResult,
  LeaseResult,
  LifecycleCheckpoint,
  LifecycleResult,
  ProofResult,
  ProviderActionResult,
  ReceiptResult,
  RevocationResult,
  RunCreation,
  TaskResult,
  TeamCreateInput,
  TeamResult,
} from "./contracts.js";
import { FabricReadPolicy } from "./read-policy.js";

export { FabricClient } from "./client.js";

export type FabricOperatorActionPorts = {
  statePort: OperatorActionStatePort;
  effectPort: OperatorActionEffectPort;
};

export type FabricRuntimeOpenOptions = FabricOpenOptions & {
  operatorActionPorts?: FabricOperatorActionPorts;
  daemonStopPort?: ProductionDaemonStopPort;
  fabricSocketPath?: string;
};

type Row = Record<string, unknown>;
type StoredAuthority = {
  workspaceRoots: string[];
  sourcePaths: string[];
  artifactPaths: string[];
  actions: FabricOperation[];
  deniedPaths: string[];
  deniedActions: FabricOperation[];
  disclosure: DisclosurePolicy;
  expiresAt: string;
  budget: Record<string, number>;
};


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

function sha256Digest(value: string): string {
  return `sha256:${sha256(value)}`;
}

function compatibilityRunIdentity(
  runId: string,
  canonicalRoot: string,
  authorityId: string,
  authorityHash: string,
  budget: Readonly<Record<string, number>>,
): {
  projectId: string;
  projectSessionId: string;
  authorityRef: string;
  budgetRef: string;
  manifestRef: string;
  launchPacketPath: string;
  launchPacketDigest: string;
  projectScopeId: string;
  sessionScopeId: string;
  runScopeId: string;
} {
  const projectId = `prj_${sha256(canonicalRoot).slice(0, 32)}`;
  const projectSessionId = `psl_${sha256(`0004\0${runId}\0${canonicalRoot}`).slice(0, 32)}`;
  const authorityRef = `sha256:${authorityHash}`;
  const budgetRef = `legacy-authority:${authorityId}`;
  const dimensions = Object.entries(budget)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([unit, granted]) => [unit, { granted, reserved: 0, consumed: 0, unknown: false }]);
  const manifestValue = JSON.stringify({ runId, canonicalRoot, authorityRef, dimensions });
  const launchValue = JSON.stringify({ runId, projectId, projectSessionId, authorityRef });
  return {
    projectId,
    projectSessionId,
    authorityRef,
    budgetRef,
    manifestRef: canonicalJson({
      path: `.agent-run/migrations/0004/${runId}-manifest.json`,
      digest: sha256Digest(manifestValue),
    }),
    launchPacketPath: `.agent-run/migrations/0004/${runId}-launch.json`,
    launchPacketDigest: sha256Digest(launchValue),
    projectScopeId: `rsp_${sha256(canonicalRoot).slice(0, 32)}`,
    sessionScopeId: `rss_${sha256(projectSessionId).slice(0, 32)}`,
    runScopeId: `rsr_${sha256(runId).slice(0, 32)}`,
  };
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

function canonicalStoredAuthorityPath(path: string): string {
  if (
    path.length === 0 ||
    path.includes("\0") ||
    isAbsoluteOnAnyPlatform(path) ||
    path.split(/[\\/]/u).includes("..") ||
    /[*?[\]{}]/u.test(path)
  ) {
    throw new FabricError("AUTHORITY_WIDENING", `unsafe stored workspace-relative path: ${path}`);
  }
  const slashPath = path.replaceAll("\\", "/");
  const normalised = posix.normalize(slashPath);
  if (normalised !== slashPath) {
    throw new FabricError("AUTHORITY_WIDENING", `stored workspace-relative path is not canonical: ${path}`);
  }
  return normalised;
}

const DISCLOSURE_TARGETS = ["local", "approved-provider", "external"] as const satisfies readonly DisclosureTarget[];
const disclosureTargets = new Set<string>(DISCLOSURE_TARGETS);

function isDisclosureTarget(value: string): value is DisclosureTarget {
  return disclosureTargets.has(value);
}

function normaliseDisclosure(value: AuthorityInput["disclosure"]): DisclosurePolicy {
  if (Array.isArray(value)) {
    const scopes = [...new Set(value)];
    if (scopes.some((scope) => !isDisclosureTarget(scope))) {
      throw new FabricError("AUTHORITY_WIDENING", "authority disclosure contains an unknown scope");
    }
    if (scopes.length === 0) return { level: "forbidden" };
    if (scopes.length === DISCLOSURE_TARGETS.length) return { level: "allowed" };
    return { level: "scoped", scopes: scopes.filter(isDisclosureTarget).sort() };
  }
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

function disclosureContained(child: DisclosurePolicy, parent: DisclosurePolicy): boolean {
  const rank = { allowed: 0, scoped: 1, forbidden: 2 } as const;
  if (rank[child.level] < rank[parent.level]) return false;
  if (child.level !== "scoped" || parent.level !== "scoped") return true;
  return child.scopes.every((scope) => parent.scopes.includes(scope));
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

function normaliseAuthority(
  authority: AuthorityInput,
  workspaceRoot: string,
  parent?: StoredAuthority,
  pathSource: "filesystem" | "stored" = "filesystem",
): StoredAuthority {
  validateIntegerBudget(authority.budget);
  const expires = Date.parse(authority.expiresAt);
  if (!Number.isFinite(expires)) {
    throw new FabricError("AUTHORITY_WIDENING", "authority expiry must be an ISO timestamp");
  }
  const actionExpansion = expandAuthorityActions(authority.actions);
  if (!actionExpansion.ok) {
    throw new FabricError("AUTHORITY_WIDENING", `unknown authority actions: ${actionExpansion.unknownActions.join(", ")}`);
  }
  const deniedActionExpansion = expandAuthorityActions(authority.deniedActions ?? []);
  if (!deniedActionExpansion.ok) {
    throw new FabricError("AUTHORITY_WIDENING", `unknown denied authority actions: ${deniedActionExpansion.unknownActions.join(", ")}`);
  }
  const canonicalisePath = (path: string): string => pathSource === "stored"
    ? canonicalStoredAuthorityPath(path)
    : canonicalAuthorityPath(workspaceRoot, path);
  const workspaceRoots = [...new Set(authority.workspaceRoots.map(canonicalisePath))].sort();
  const sourcePaths = [...new Set(authority.sourcePaths.map(canonicalisePath))].sort();
  const artifactPaths = [...new Set(authority.artifactPaths.map(canonicalisePath))].sort();
  if (workspaceRoots.length === 0 || sourcePaths.some((path) => !workspaceRoots.some((root) => pathContains(root, path))) || artifactPaths.some((path) => !workspaceRoots.some((root) => pathContains(root, path)))) {
    throw new FabricError("AUTHORITY_WIDENING", "source and artifact paths must be inside an authority workspace root");
  }
  return {
    workspaceRoots,
    sourcePaths,
    artifactPaths,
    actions: actionExpansion.operations,
    deniedPaths: [...new Set([
      ...(parent?.deniedPaths ?? []),
      ...(authority.deniedPaths ?? []).map(canonicalisePath),
    ])].sort(),
    deniedActions: [...new Set([...(parent?.deniedActions ?? []), ...deniedActionExpansion.operations])].sort(),
    disclosure: normaliseDisclosure(authority.disclosure),
    expiresAt: new Date(expires).toISOString(),
    budget: Object.fromEntries(Object.entries(authority.budget).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRow(value) && Object.values(value).every((item) => typeof item === "number");
}

function isStoredAuthority(value: unknown): value is StoredAuthority {
  return (
    isRow(value) &&
    isStringArray(value.workspaceRoots) &&
    isStringArray(value.sourcePaths) &&
    isStringArray(value.artifactPaths) &&
    isStringArray(value.actions) && value.actions.every(isAgentAuthorityOperation) &&
    isStringArray(value.deniedPaths) &&
    isStringArray(value.deniedActions) && value.deniedActions.every(isAgentAuthorityOperation) &&
    isRow(value.disclosure) &&
    (value.disclosure.level === "allowed" || value.disclosure.level === "forbidden" || (value.disclosure.level === "scoped" && isStringArray(value.disclosure.scopes))) &&
    typeof value.expiresAt === "string" &&
    isNumberRecord(value.budget)
  );
}

function parseAuthority(serialised: string): StoredAuthority {
  const value: unknown = JSON.parse(serialised);
  if (!isStoredAuthority(value)) {
    throw new Error("stored authority is invalid");
  }
  return value;
}

function storedAuthorityInput(value: unknown): AuthorityInput {
  if (
    !isRow(value) ||
    !isStringArray(value.workspaceRoots) ||
    !isStringArray(value.sourcePaths) ||
    !isStringArray(value.artifactPaths) ||
    !isStringArray(value.actions) ||
    (value.deniedPaths !== undefined && !isStringArray(value.deniedPaths)) ||
    (value.deniedActions !== undefined && !isStringArray(value.deniedActions)) ||
    !(isStringArray(value.disclosure) || (isRow(value.disclosure) && typeof value.disclosure.level === "string")) ||
    typeof value.expiresAt !== "string" ||
    !isNumberRecord(value.budget)
  ) {
    throw new Error("stored authority is invalid");
  }
  return {
    workspaceRoots: value.workspaceRoots,
    sourcePaths: value.sourcePaths,
    artifactPaths: value.artifactPaths,
    actions: value.actions,
    ...(value.deniedPaths === undefined ? {} : { deniedPaths: value.deniedPaths }),
    ...(value.deniedActions === undefined ? {} : { deniedActions: value.deniedActions }),
    disclosure: value.disclosure as AuthorityInput["disclosure"],
    expiresAt: value.expiresAt,
    budget: value.budget,
  };
}

function upgradeStoredAuthorities(database: Database.Database, configuredWorkspaceRoots: readonly string[]): void {
  const rows = database.prepare(`
    SELECT a.authority_id, a.parent_authority_id, a.authority_json, a.authority_hash, r.workspace_root
      FROM authorities a JOIN runs r ON r.run_id = a.run_id
     ORDER BY a.created_at, a.authority_id
  `).all();
  const pending = new Map<string, {
    parentAuthorityId: string | null;
    authority: StoredAuthority | AuthorityInput;
    canonical: boolean;
    workspaceRoot: string;
  }>();
  for (const value of rows) {
    const row = rowOrNotFound(value, "stored authority");
    const workspaceRoot = stringField(row, "workspace_root");
    if (!configuredWorkspaceRoots.some((configuredRoot) => pathContains(configuredRoot, workspaceRoot))) {
      throw new FabricError("AUTHORITY_WIDENING", `stored run workspace root is not configured: ${workspaceRoot}`);
    }
    const parsed: unknown = JSON.parse(stringField(row, "authority_json"));
    const canonical = isStoredAuthority(parsed);
    if (canonical) {
      validateIntegerBudget(parsed.budget);
      if (!Number.isFinite(Date.parse(parsed.expiresAt))) throw new Error("stored authority expiry is invalid");
      if (canonicalJson(normaliseDisclosure(parsed.disclosure)) !== canonicalJson(parsed.disclosure)) {
        throw new Error("stored authority disclosure is not canonical");
      }
      if (sha256(canonicalJson(parsed)) !== stringField(row, "authority_hash")) {
        throw new Error("stored authority hash is invalid");
      }
    }
    pending.set(stringField(row, "authority_id"), {
      parentAuthorityId: row.parent_authority_id === null ? null : stringField(row, "parent_authority_id"),
      authority: canonical ? parsed : storedAuthorityInput(parsed),
      canonical,
      workspaceRoot,
    });
  }

  const upgraded = new Map<string, StoredAuthority>();
  database.transaction(() => {
    while (pending.size > 0) {
      let progress = false;
      for (const [authorityId, value] of pending) {
        const parent = value.parentAuthorityId === null ? undefined : upgraded.get(value.parentAuthorityId);
        if (value.parentAuthorityId !== null && parent === undefined) continue;
        const authority = value.canonical
          ? value.authority as StoredAuthority
          : normaliseAuthority(value.authority as AuthorityInput, value.workspaceRoot, parent, "stored");
        if (parent !== undefined && !authorityContained(authority, parent)) {
          throw new FabricError("AUTHORITY_WIDENING", "stored delegated authority exceeds its parent");
        }
        if (!value.canonical) {
          const serialised = canonicalJson(authority);
          database.prepare("UPDATE authorities SET authority_json = ?, authority_hash = ? WHERE authority_id = ?")
            .run(serialised, sha256(serialised), authorityId);
        }
        upgraded.set(authorityId, authority);
        pending.delete(authorityId);
        progress = true;
      }
      if (!progress) throw new Error("stored authority ancestry is invalid");
    }
  })();
}

function authorityContained(child: StoredAuthority, parent: StoredAuthority): boolean {
  const pathSets: Array<[string[], string[]]> = [
    [child.workspaceRoots, parent.workspaceRoots],
    [child.sourcePaths, parent.sourcePaths],
    [child.artifactPaths, parent.artifactPaths],
  ];
  if (pathSets.some(([children, parents]) => children.some((path) => !parents.some((root) => pathContains(root, path))))) {
    return false;
  }
  if (child.actions.some((action) => !parent.actions.includes(action))) {
    return false;
  }
  if (parent.deniedPaths.some((path) => !child.deniedPaths.includes(path)) || parent.deniedActions.some((action) => !child.deniedActions.includes(action))) {
    return false;
  }
  if (!disclosureContained(child.disclosure, parent.disclosure)) {
    return false;
  }
  if (Date.parse(child.expiresAt) > Date.parse(parent.expiresAt)) {
    return false;
  }
  return Object.entries(child.budget).every(
    ([dimension, value]) => parent.budget[dimension] !== undefined && value <= parent.budget[dimension],
  );
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
  return (
    isRow(value) &&
    typeof value.agentId === "string" &&
    typeof value.lifecycle === "string" &&
    typeof value.providerSessionGeneration === "number"
  );
}

function isProviderActionStatus(value: unknown): value is ProviderActionResult["status"] {
  return ["prepared", "dispatched", "accepted", "terminal", "ambiguous", "quarantined"].includes(String(value));
}

function providerActionResult(value: unknown): ProviderActionResult {
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
  return {
    actionId: value.actionId,
    status: value.status,
    history: value.history,
    executionCount: value.executionCount,
    effectCount: value.effectCount,
    ...(value.result === undefined ? {} : { result: value.result }),
  };
}

function isProviderActionResult(value: unknown): value is ProviderActionResult {
  try {
    providerActionResult(value);
    return true;
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

export class Fabric {
  readonly #database: Database.Database;
  readonly #workspaceRoots: string[];
  readonly #clock: () => number;
  readonly #adapters: NonNullable<FabricOpenOptions["adapters"]>;
  readonly #readPolicy: FabricReadPolicy;
  readonly #commandJournal: CommandJournal;
  readonly #capabilityKey: string;
  readonly #executionProfile: string;
  readonly #adapterSupervisor: AdapterSupervisor;
  readonly #providerSessions: ProviderSessionCoordinator;
  readonly #operatorStore: OperatorStore;
  readonly #operatorProjections: OperatorProjectionStore;
  readonly #gitRepositoryReads: GitRepositoryReadService;
  readonly #operatorActions: OperatorActionStore;
  readonly #launchCustody: LaunchCustodyService | undefined;
  readonly #projectSessions: ProjectSessionStore;
  readonly #intakes: IntakeStore;
  readonly #gates: ScopedGateStore;
  readonly #resources: HierarchicalAdmissionStore;
  readonly #results: AtomicDeliveryStore;
  readonly #notifications: NotificationOutbox;
  readonly #notificationWorker: NativeNotificationWorker;

  constructor(options: FabricRuntimeOpenOptions) {
    const clock = options.clock ?? Date.now;
    this.#clock = () => {
      const value = clock();
      return value instanceof Date ? value.getTime() : value;
    };
    this.#workspaceRoots = [...new Set(options.workspaceRoots.map(canonicalWorkspaceRoot))].sort();
    if (this.#workspaceRoots.length === 0) {
      throw new FabricError("AUTHORITY_WIDENING", "fabric requires at least one configured workspace root");
    }
    this.#database = openFabricDatabase(options.databasePath);
    upgradeStoredAuthorities(this.#database, this.#workspaceRoots);
    this.#readPolicy = new FabricReadPolicy(this.#database);
    this.#commandJournal = new CommandJournal(this.#database, this.#clock);
    this.#adapters = options.adapters ?? {};
    this.#adapterSupervisor = new AdapterSupervisor(this.#adapters);
    this.#providerSessions = new ProviderSessionCoordinator({
      database: this.#database,
      clock: this.#clock,
      maximumConcurrentTurns: options.maximumConcurrentProviderTurns ?? 8,
    });
    this.#capabilityKey = options.capabilityKey ?? randomBytes(32).toString("base64url");
    this.#executionProfile = options.executionProfile ?? "headless";
    this.#operatorStore = new OperatorStore({ database: this.#database, clock: this.#clock });
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
    });
    const productionOperatorPorts = createProductionOperatorActionPorts({
      database: this.#database,
      clock: this.#clock,
      adapter: {
        capabilities: async (adapterId) => await this.#adapterSupervisor.request(adapterId, "capabilities", {}),
        dispatch: async (adapterId, input) => await this.#adapterSupervisor.request(adapterId, "dispatch", input),
        lookup: async (adapterId, actionId) => await this.#adapterSupervisor.request(adapterId, "lookup_action", { actionId }),
      },
      ...(options.daemonStopPort === undefined ? {} : { daemonStop: options.daemonStopPort }),
    });
    this.#launchCustody = options.fabricSocketPath === undefined
      ? undefined
      : new LaunchCustodyService({
          database: this.#database,
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
      clock: this.#clock,
    });
    this.#projectSessions = new ProjectSessionStore({
      database: this.#database,
      operatorStore: this.#operatorStore,
      commandJournal: this.#commandJournal,
      clock: this.#clock,
    });
    this.#results = new AtomicDeliveryStore({ database: this.#database, clock: this.#clock });
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
    this.#gates = new ScopedGateStore({
      database: this.#database,
      operatorStore: this.#operatorStore,
      clock: this.#clock,
    });
    this.#resources = new HierarchicalAdmissionStore({ database: this.#database, clock: this.#clock });
    this.#notifications = new NotificationOutbox({ database: this.#database, clock: this.#clock });
    this.#notificationWorker = new NativeNotificationWorker({
      outbox: this.#notifications,
      adapter: new MacOsNativeDesktopAdapter(),
      workerInstanceId: `native-notification-${randomBytes(16).toString("hex")}`,
      integrationId: "native-desktop",
      clock: this.#clock,
    });
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

  async attemptDrainedStop(input: {
    actionId: string;
    token: QuiesceToken;
    election: IdleElectionPort;
    closeSocket(): Promise<void>;
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
    const changed = this.#database.prepare(`
      UPDATE operator_daemon_stop_custody SET state=?, result_json=?, updated_at=?
       WHERE custody_id=? AND result_correlation_digest=?
         AND operator_id=? AND project_id=? AND project_session_id=? AND command_id=?
         AND principal_generation=? AND daemon_instance_generation=? AND operation='daemon-stop'
         AND state IN ('prepared','scheduled')
    `).run(
      input.state,
      canonicalJson(input.result),
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
    if (changed.changes === 1) return;
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
    if (!isRow(existing) || existing.state !== input.state || existing.result_json !== canonicalJson(input.result)) {
      throw new ProjectFabricCoreError("STALE_GENERATION", "daemon stop custody result correlation changed");
    }
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

  #selectWorkspaceRoot(
    projectRunDirectory: string | undefined,
    requestedWorkspaceRoot: string | undefined,
  ): { workspaceRoot: string; projectRunDirectory: string | null } {
    if (requestedWorkspaceRoot !== undefined) {
      if (!isAbsoluteOnAnyPlatform(requestedWorkspaceRoot)) {
        throw new FabricError("AUTHORITY_WIDENING", "requested workspace root must be absolute");
      }
      const workspaceRoot = canonicalPath(requestedWorkspaceRoot);
      const trusted = this.#workspaceRoots.some((root) => {
        const rel = relative(root, workspaceRoot);
        return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
      });
      if (!trusted) {
        throw new FabricError("AUTHORITY_WIDENING", "requested workspace root is outside configured workspace roots");
      }
      if (projectRunDirectory === undefined) return { workspaceRoot, projectRunDirectory: null };
      if (!isAbsoluteOnAnyPlatform(projectRunDirectory)) {
        throw new FabricError("AUTHORITY_WIDENING", "project run directory must be absolute");
      }
      const canonicalDirectory = canonicalPath(projectRunDirectory);
      const rel = relative(workspaceRoot, canonicalDirectory);
      if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new FabricError("AUTHORITY_WIDENING", "project run directory is outside the requested workspace root");
      }
      return { workspaceRoot, projectRunDirectory: canonicalDirectory };
    }
    if (projectRunDirectory === undefined) {
      if (this.#workspaceRoots.length !== 1) {
        throw new FabricError("AUTHORITY_WIDENING", "run workspace root is ambiguous without a project run directory");
      }
      const workspaceRoot = this.#workspaceRoots[0];
      if (workspaceRoot === undefined) throw new Error("configured workspace root is unavailable");
      return { workspaceRoot, projectRunDirectory: null };
    }
    if (!isAbsoluteOnAnyPlatform(projectRunDirectory)) {
      throw new FabricError("AUTHORITY_WIDENING", "project run directory must be absolute");
    }
    const canonicalDirectory = canonicalPath(projectRunDirectory);
    const candidates = this.#workspaceRoots.filter((root) => {
      const rel = relative(root, canonicalDirectory);
      return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
    });
    if (candidates.length === 0) {
      throw new FabricError("AUTHORITY_WIDENING", "project run directory is outside configured workspace roots");
    }
    candidates.sort((left, right) => right.length - left.length);
    const workspaceRoot = candidates[0];
    if (workspaceRoot === undefined) throw new Error("selected workspace root is unavailable");
    return { workspaceRoot, projectRunDirectory: canonicalDirectory };
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

  #assertGenericProviderAction(runId: string, actionId: string): void {
    if (this.#database.prepare(`
      SELECT 1
        FROM provider_actions p
        JOIN project_session_launch_custody c
          ON c.provider_adapter_id=p.adapter_id AND c.provider_action_id=p.action_id
       WHERE p.run_id=? AND p.action_id=?
    `).get(runId, actionId) !== undefined) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "launch provider actions mutate only through launch custody");
    }
    if (this.#database.prepare(`
      SELECT 1 FROM provider_agent_custody WHERE run_id=? AND action_id=?
    `).get(runId, actionId) !== undefined) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "agent provider actions mutate only through provider-session custody");
    }
    if (this.#database.prepare(`
      SELECT 1
        FROM provider_actions p
        JOIN chair_bridge_recovery_custody c
          ON c.provider_adapter_id=p.adapter_id AND c.provider_action_id=p.action_id
       WHERE p.run_id=? AND p.action_id=?
    `).get(runId, actionId) !== undefined) {
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
    this.#results.recover();
    this.#notifications.recover();
    await this.#launchCustody?.recover();
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
           SELECT 1 FROM chair_bridge_recovery_custody c
            WHERE c.provider_adapter_id=p.adapter_id AND c.provider_action_id=p.action_id
         )
       ORDER BY p.updated_at, p.action_id
    `).all();
    for (const value of pendingActions) {
      const action = rowOrNotFound(value, "startup provider action");
      const runId = stringField(action, "run_id");
      const actionId = stringField(action, "action_id");
      try {
        const result = await this.reconcileProviderAction(runId, stringField(action, "chair_agent_id"), {
          actionId,
          commandId: `startup-recovery:${actionId}:${stringField(action, "status")}:${numberField(action, "updated_at")}`,
        });
        if (result.status === "quarantined") actionsQuarantined += 1;
        else actionsReconciled += 1;
      } catch (error: unknown) {
        this.#database.prepare("UPDATE provider_actions SET status = 'quarantined', updated_at = ? WHERE run_id = ? AND action_id = ?").run(now, runId, actionId);
        this.#event(runId, "startup-provider-action-quarantined", null, { actionId, adapterId: stringField(action, "adapter_id"), reason: error instanceof Error ? error.message : String(error) });
        actionsQuarantined += 1;
      }
    }
    let sessionsDegraded = 0;
    const sessions = this.#database.prepare(`
      SELECT a.run_id, a.agent_id, a.provider_session_ref, b.adapter_id
        FROM agents a JOIN agent_adapter_bindings b ON b.run_id = a.run_id AND b.agent_id = a.agent_id
       WHERE a.provider_session_ref IS NOT NULL AND a.lifecycle NOT IN ('archived', 'suspended')
         AND NOT EXISTS (
           SELECT 1 FROM project_session_launch_custody launch
            WHERE launch.coordination_run_id=a.run_id AND launch.chair_agent_id=a.agent_id
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
        this.#database.prepare("UPDATE agents SET lifecycle = 'context-unreconciled' WHERE run_id = ? AND agent_id = ?").run(runId, agentId);
        this.#event(runId, "startup-provider-session-degraded", null, { agentId, reason: error instanceof Error ? error.message : String(error) });
        sessionsDegraded += 1;
      }
    }
    return { actionsReconciled, actionsQuarantined, leasesQuarantined: expiredLeases.length, sessionsDegraded, deliveriesReleased };
  }

  async createRun(input: RunCreation): Promise<{
    runId: string;
    chairAuthorityId: string;
    chairCapability: string;
  }> {
    const location = this.#selectWorkspaceRoot(input.projectRunDirectory, input.workspaceRoot);
    const authority = normaliseAuthority(input.chair.authority, location.workspaceRoot);
    const existing = this.#database.prepare(`
      SELECT r.chair_agent_id, r.workspace_root, r.project_run_directory, g.authority_id, a.authority_hash,
             c.principal_generation, c.revoked_at
        FROM runs r JOIN agents g ON g.run_id = r.run_id AND g.agent_id = r.chair_agent_id
        JOIN authorities a ON a.authority_id = g.authority_id
        JOIN capabilities c ON c.run_id = g.run_id AND c.agent_id = g.agent_id
       WHERE r.run_id = ? ORDER BY c.principal_generation DESC LIMIT 1
    `).get(input.runId);
    if (isRow(existing)) {
      if (existing.chair_agent_id !== input.chair.agentId || existing.workspace_root !== location.workspaceRoot || existing.project_run_directory !== location.projectRunDirectory || existing.authority_hash !== sha256(canonicalJson(authority))) {
        throw new FabricError("DEDUPE_CONFLICT", "run ID was reused with changed creation input");
      }
      if (existing.revoked_at !== null) throw new FabricError("AUTHENTICATION_FAILED", "chair capability was revoked");
      const generation = numberField(existing, "principal_generation");
      return { runId: input.runId, chairAuthorityId: stringField(existing, "authority_id"), chairCapability: capabilityToken(this.#capabilityKey, input.runId, input.chair.agentId, generation) };
    }
    const authorityId = uuidv7();
    const authorityJson = canonicalJson(authority);
    const authorityHash = sha256(authorityJson);
    const compatibility = compatibilityRunIdentity(
      input.runId,
      location.workspaceRoot,
      authorityId,
      authorityHash,
      authority.budget,
    );
    const token = capabilityToken(this.#capabilityKey, input.runId, input.chair.agentId, 1);
    const now = this.#clock();
    this.#database.transaction(() => {
      this.#database.prepare(`
        INSERT INTO projects(project_id, canonical_root, revision, authority_generation, created_at, updated_at)
        VALUES (?, ?, 1, 1, ?, ?)
        ON CONFLICT(project_id) DO NOTHING
      `).run(compatibility.projectId, location.workspaceRoot, now, now);
      const persistedProject = rowOrNotFound(this.#database.prepare(`
        SELECT canonical_root FROM projects WHERE project_id=?
      `).get(compatibility.projectId), "compatibility project");
      if (stringField(persistedProject, "canonical_root") !== location.workspaceRoot) {
        throw new FabricError("DEDUPE_CONFLICT", "compatibility project identity changed canonical root");
      }
      this.#database.prepare(`
        INSERT INTO project_sessions(
          project_session_id, project_id, mode, state, revision, generation,
          authority_ref, budget_ref, launch_packet_path, launch_packet_digest,
          membership_revision, origin_kind, origin_operator_id, migration_manifest_ref,
          terminal_path_json, created_at, updated_at
        ) VALUES (?, ?, 'independent', 'recovery_required', 1, 1, ?, ?, ?, ?, 1,
                  'legacy-migration', NULL, ?, NULL, ?, ?)
      `).run(
        compatibility.projectSessionId,
        compatibility.projectId,
        compatibility.authorityRef,
        compatibility.budgetRef,
        compatibility.launchPacketPath,
        compatibility.launchPacketDigest,
        compatibility.manifestRef,
        now,
        now,
      );
      this.#database.prepare(`
        INSERT INTO runs(
          run_id, chair_agent_id, workspace_root, project_run_directory, created_at,
          project_session_id, lifecycle_state, revision, chair_generation, chair_lease_id,
          authority_ref, budget_ref, dependency_revision, topology_slot
        ) VALUES (?, ?, ?, ?, ?, ?, 'recovery_required', 1, 1, ?, ?, ?, 1, NULL)
      `).run(
        input.runId,
        input.chair.agentId,
        location.workspaceRoot,
        location.projectRunDirectory,
        now,
        compatibility.projectSessionId,
        `chair:${input.runId}:1`,
        compatibility.authorityRef,
        compatibility.budgetRef,
      );
      this.#database
        .prepare(
          "INSERT INTO authorities(authority_id, run_id, parent_authority_id, authority_json, authority_hash, created_at) VALUES (?, ?, NULL, ?, ?, ?)",
        )
        .run(authorityId, input.runId, authorityJson, authorityHash, now);
      for (const [unitKey, granted] of Object.entries(authority.budget)) {
        this.#database
          .prepare("INSERT INTO authority_budget(authority_id, unit_key, granted) VALUES (?, ?, ?)")
          .run(authorityId, unitKey, granted);
      }
      this.#database
        .prepare("INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id) VALUES (?, ?, NULL, ?)")
        .run(input.runId, input.chair.agentId, authorityId);
      this.#database.prepare(`
        INSERT INTO run_chair_leases(
          project_session_id, run_id, lease_id, holder_agent_id, generation, status, updated_at
        ) VALUES (?, ?, ?, ?, 1, 'frozen', ?)
      `).run(
        compatibility.projectSessionId,
        input.runId,
        `chair:${input.runId}:1`,
        input.chair.agentId,
        now,
      );
      this.#database.prepare(`
        INSERT INTO project_session_memberships(
          project_session_id, coordination_run_id, member_kind, member_id,
          required, state, revision, created_at, updated_at
        ) VALUES (?, ?, 'coordination-run', ?, 1, 'active', 1, ?, ?)
      `).run(compatibility.projectSessionId, input.runId, input.runId, now, now);
      const storedProjectLimits = Object.fromEntries(this.#database.prepare(`
        SELECT unit_key, limit_value FROM resource_dimensions
         WHERE scope_id=? ORDER BY unit_key
      `).all(compatibility.projectScopeId).map((value) => {
        const dimension = rowOrNotFound(value, "compatibility project resource dimension");
        return [stringField(dimension, "unit_key"), numberField(dimension, "limit_value")];
      }));
      const projectLimits = Object.keys(storedProjectLimits).length === 0
        ? authority.budget
        : storedProjectLimits;
      this.#resources.ensureRunHierarchy(
        {
          projectId: compatibility.projectId,
          projectSessionId: compatibility.projectSessionId,
          coordinationRunId: input.runId,
          actor: { kind: "compatibility-import", migrationManifestDigest: compatibility.manifestRef },
        },
        {
          project: { scopeId: compatibility.projectScopeId, limits: projectLimits },
          session: { scopeId: compatibility.sessionScopeId, limits: authority.budget },
          run: { scopeId: compatibility.runScopeId, limits: authority.budget },
        },
      );
      this.#database
        .prepare("INSERT INTO mailbox_state(run_id, recipient_id) VALUES (?, ?)")
        .run(input.runId, input.chair.agentId);
      this.#database.prepare("INSERT INTO run_metadata(run_id, execution_profile) VALUES (?, ?)").run(input.runId, this.#executionProfile);
      this.#database
        .prepare(
          "INSERT INTO capabilities(token_hash, run_id, agent_id, expires_at) VALUES (?, ?, ?, ?)",
        )
        .run(sha256(token), input.runId, input.chair.agentId, Date.parse(authority.expiresAt));
      this.#event(input.runId, "run-created", input.chair.agentId, { authorityId });
    })();
    return { runId: input.runId, chairAuthorityId: authorityId, chairCapability: token };
  }

  connect(token: string): FabricClient {
    const row = rowOrNotFound(
      this.#database
        .prepare(
          "SELECT run_id, agent_id, expires_at, revoked_at FROM capabilities WHERE token_hash = ?",
        )
        .get(sha256(token)),
      "capability",
    );
    if (row.revoked_at !== null || numberField(row, "expires_at") <= this.#clock()) {
      throw new FabricError("AUTHENTICATION_FAILED", "capability is expired or revoked");
    }
    return new FabricClient(this, stringField(row, "run_id"), stringField(row, "agent_id"), sha256(token));
  }

  verifyProtocolCredential(token: string): VerifiedProtocolCredential {
    const authenticated = this.#database.prepare(`
      SELECT c.run_id, c.agent_id, c.principal_generation, c.expires_at, c.revoked_at,
             a.authority_json, r.project_session_id
        FROM capabilities c
        JOIN agents g ON g.run_id=c.run_id AND g.agent_id=c.agent_id
        JOIN authorities a ON a.authority_id=g.authority_id
        JOIN runs r ON r.run_id=c.run_id
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
    const authority = parseAuthority(stringField(authenticated, "authority_json"));
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
          this.assertCapability(
            context.principal.runId,
            context.principal.agentId,
            context.credentialHash,
            FABRIC_OPERATIONS.membershipBind,
          );
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
        return this.#gates.createGate(credential.context, request);
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
        return this.#operatorProjections.snapshot(request);
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
        return this.#operatorProjections.viewPage(request);
      }
      case FABRIC_OPERATIONS.projectionDetailRead: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.projectionDetailRead];
        const credential = operatorCredential();
        operatorCommand(credential, { credential: request.credential });
        return this.#operatorProjections.detail(request);
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
      case FABRIC_OPERATIONS.operatorActionPreview: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.operatorActionPreview];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        return this.#operatorActions.preview(credential.context, request);
      }
      case FABRIC_OPERATIONS.operatorActionCommit: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.operatorActionCommit];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
        return this.#operatorActions.commit(credential.context, request);
      }
      case FABRIC_OPERATIONS.operatorActionStatus: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.operatorActionStatus];
        const credential = operatorCredential();
        operatorCommand(credential, { credential: request.credential });
        return this.#operatorActions.status(request);
      }
      case FABRIC_OPERATIONS.operatorActionReconcile: {
        const request = input as OperationInputMap[typeof FABRIC_OPERATIONS.operatorActionReconcile];
        const credential = operatorCredential();
        operatorCommand(credential, request.command);
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

  assertCapability(runId: string, agentId: string, tokenHash: string, requiredOperation: FabricOperation, allowSuspended = false): void {
    const row = this.#database
      .prepare(
        "SELECT c.expires_at, c.revoked_at, a.authority_json, g.lifecycle FROM capabilities c JOIN agents g ON g.run_id = c.run_id AND g.agent_id = c.agent_id JOIN authorities a ON a.authority_id = g.authority_id WHERE c.token_hash = ? AND c.run_id = ? AND c.agent_id = ?",
      )
      .get(tokenHash, runId, agentId);
    if (
      !isRow(row) ||
      row.revoked_at !== null ||
      numberField(row, "expires_at") <= this.#clock()
    ) {
      throw new FabricError("AUTHENTICATION_FAILED", "capability is expired, revoked or unknown");
    }
    const authority = parseAuthority(stringField(row, "authority_json"));
    if (authority.deniedActions.includes(requiredOperation) || !authority.actions.includes(requiredOperation)) {
      throw new FabricError("CAPABILITY_FORBIDDEN", `authority does not permit ${requiredOperation}`);
    }
    if (!allowSuspended && stringField(row, "lifecycle") === "suspended" && !isReadFabricOperation(requiredOperation)) {
      throw new FabricError("CONTEXT_UNRECONCILED", "suspended agent may only read until explicit lifecycle recovery");
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
          .prepare("SELECT authority_json FROM authorities WHERE authority_id = ? AND run_id = ?")
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
      const parent = parseAuthority(stringField(parentRow, "authority_json"));
      const child = normaliseAuthority(input.authority, this.#workspaceRootForRun(runId), parent);
      if (!authorityContained(child, parent)) {
        throw new FabricError("AUTHORITY_WIDENING", "child authority exceeds its parent");
      }
      for (const [unitKey, requested] of Object.entries(child.budget)) {
        const row = rowOrNotFound(
          this.#database
            .prepare("SELECT granted, reserved, usage_unknown FROM authority_budget WHERE authority_id = ? AND unit_key = ?")
            .get(input.parentAuthorityId, unitKey),
          `budget ${unitKey}`,
        );
        if (numberField(row, "usage_unknown") !== 0 || numberField(row, "granted") - numberField(row, "reserved") < requested) {
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
        .prepare("SELECT authority_json, parent_authority_id FROM authorities WHERE authority_id = ? AND run_id = ?")
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
    const authority = parseAuthority(stringField(authorityRow, "authority_json"));
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
    const providerPayload = this.#admitProviderPayload(runId, input.authorityId, input.payload);
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
      const expired = this.#database.prepare("UPDATE deliveries SET state = 'expired', claim_deadline = NULL, resolution_reason = 'message-expired-by-policy', resolved_at = ? WHERE run_id = ? AND recipient_id = ? AND state IN ('ready', 'claimed') AND message_id IN (SELECT message_id FROM messages WHERE run_id = ? AND expires_at IS NOT NULL AND expires_at <= ?)").run(now, runId, recipientId, runId, now);
      if (expired.changes > 0) this.#advanceMailboxWatermark(runId, recipientId);
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
          .prepare("SELECT mailbox_sequence, state FROM deliveries WHERE delivery_id = ? AND run_id = ? AND recipient_id = ?")
          .get(deliveryId, runId, recipientId),
        "delivery",
      );
      if (stringField(delivery, "state") !== "acknowledged") {
        this.#database
          .prepare("UPDATE deliveries SET state = 'acknowledged', acknowledged_at = ?, claim_deadline = NULL WHERE delivery_id = ?")
          .run(this.#clock(), deliveryId);
      }
      this.#advanceMailboxWatermark(runId, recipientId);
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
          .prepare("SELECT recipient_id, state FROM deliveries WHERE run_id = ? AND delivery_id = ?")
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
    input: {
      taskId: string;
      authorityId: string;
      eligibleAgentIds: string[];
      proposedOwnerAgentId?: string;
      participantAgentIds?: string[];
      dependencies?: string[];
      expectedArtifacts?: string[];
      objectiveChecks?: string[];
      humanGates?: string[];
      objective: string;
      baseRevision: string;
      commandId: string;
    },
  ): TaskResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isTaskResult, () => {
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
      const dependencyMutation = dependencies.length === 0
        ? { dependencyRevision }
        : this.#gates.setTaskDependencies(agentContext, {
            commandId: `${input.commandId}:dependencies`,
            expectedRevision: dependencyRevision,
            taskId: input.taskId,
            dependencyTaskIds: dependencies,
          });
      const humanGates = [...new Set(input.humanGates ?? [])].sort();
      if (humanGates.length > 0) {
        this.#gates.createCompatibilityTaskGates(agentContext, {
          commandId: `${input.commandId}:gates`,
          expectedDependencyRevision: dependencyMutation.dependencyRevision,
          taskId: input.taskId,
          humanGateIds: humanGates,
        });
      }
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

  resolveHumanGate(
    runId: string,
    actorAgentId: string,
    input: { taskId: string; gateId: string; status: "approved" | "rejected"; evidence: string; commandId: string },
  ): { taskId: string; gateId: string; status: "approved" | "rejected" } {
    const parse = (value: unknown): value is { taskId: string; gateId: string; status: "approved" | "rejected" } =>
      isRow(value) && typeof value.taskId === "string" && typeof value.gateId === "string" && (value.status === "approved" || value.status === "rejected");
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, parse, () => {
      assertTaskOperationAdmitted(this.#database, runId, input.taskId);
      this.#assertChair(runId, actorAgentId);
      const changed = this.#database
        .prepare("UPDATE task_human_gates SET status = ?, evidence = ? WHERE run_id = ? AND task_id = ? AND gate_id = ?")
        .run(input.status, input.evidence, runId, input.taskId, input.gateId);
      if (changed.changes !== 1) throw new FabricError("NOT_FOUND", "human gate is not declared for the task");
      return { taskId: input.taskId, gateId: input.gateId, status: input.status };
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
      this.#database
        .prepare("UPDATE tasks SET state = ?, revision = revision + 1 WHERE run_id = ? AND task_id = ? AND revision = ?")
        .run(input.state, runId, input.taskId, input.expectedRevision);
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
          SELECT c.principal_generation, a.authority_json
            FROM capabilities c JOIN agents g ON g.run_id = c.run_id AND g.agent_id = c.agent_id
            JOIN authorities a ON a.authority_id = g.authority_id
           WHERE c.run_id = ? AND c.agent_id = ? AND c.revoked_at IS NULL
           ORDER BY c.principal_generation DESC LIMIT 1
        `).get(runId, input.agentId), "active capability");
        const generation = numberField(current, "principal_generation");
        if (generation !== input.expectedPrincipalGeneration) throw new FabricError("STALE_PRINCIPAL_GENERATION", "principal generation changed");
        const nextGeneration = generation + 1;
        const token = capabilityToken(this.#capabilityKey, runId, input.agentId, nextGeneration);
        const authority = parseAuthority(stringField(current, "authority_json"));
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
          "SELECT a.authority_json FROM agents g JOIN authorities a ON a.authority_id = g.authority_id WHERE g.run_id = ? AND g.agent_id = ?",
        )
        .get(runId, actorAgentId),
      "agent authority",
    );
    const authority = parseAuthority(stringField(actor, "authority_json"));
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
    if (taskId !== undefined) {
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
    const lifecycle = this.getAgentLifecycle(runId, actorAgentId).lifecycle;
    if (lifecycle === "context-unreconciled") {
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
      this.#event(runId, "write-lease-released", actorAgentId, { leaseId: input.leaseId, generation });
      return { leaseId: input.leaseId, status: "released", generation };
    });
  }

  getAgentLifecycle(runId: string, agentId: string): LifecycleResult {
    const agent = rowOrNotFound(
      this.#database
        .prepare(
          "SELECT a.lifecycle, COALESCE(p.provider_session_generation, 1) AS provider_session_generation FROM agents a LEFT JOIN provider_state p ON p.run_id = a.run_id AND p.agent_id = a.agent_id WHERE a.run_id = ? AND a.agent_id = ?",
        )
        .get(runId, agentId),
      "agent",
    );
    return {
      agentId,
      lifecycle: stringField(agent, "lifecycle"),
      providerSessionGeneration: numberField(agent, "provider_session_generation"),
    };
  }

  reportProviderState(
    runId: string,
    actorAgentId: string,
    input: {
      agentId: string;
      providerSessionGeneration: number;
      contextRevision: string;
      checkpointSha256?: string;
      commandId: string;
    },
  ): LifecycleResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isLifecycleResult, () => {
      this.#assertChair(runId, actorAgentId);
      rowOrNotFound(
        this.#database.prepare("SELECT 1 FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, input.agentId),
        "agent",
      );
      const previous = this.#database
        .prepare("SELECT provider_session_generation, context_revision FROM provider_state WHERE run_id = ? AND agent_id = ?")
        .get(runId, input.agentId);
      const changedWithoutCheckpoint =
        isRow(previous) &&
        (numberField(previous, "provider_session_generation") !== input.providerSessionGeneration ||
          previous.context_revision !== input.contextRevision) &&
        input.checkpointSha256 === undefined;
      const lifecycle = changedWithoutCheckpoint ? "context-unreconciled" : this.getAgentLifecycle(runId, input.agentId).lifecycle;
      this.#database
        .prepare(
          "INSERT INTO provider_state(run_id, agent_id, provider_session_generation, context_revision, reconciled_checkpoint_sha256) VALUES (?, ?, ?, ?, ?) ON CONFLICT(run_id, agent_id) DO UPDATE SET provider_session_generation = excluded.provider_session_generation, context_revision = excluded.context_revision, reconciled_checkpoint_sha256 = excluded.reconciled_checkpoint_sha256",
        )
        .run(runId, input.agentId, input.providerSessionGeneration, input.contextRevision, input.checkpointSha256 ?? null);
      if (changedWithoutCheckpoint) {
        this.#database.prepare("UPDATE agents SET lifecycle = 'context-unreconciled' WHERE run_id = ? AND agent_id = ?").run(
          runId,
          input.agentId,
        );
      }
      const result = { agentId: input.agentId, lifecycle, providerSessionGeneration: input.providerSessionGeneration };
      this.#event(runId, "provider-state-reported", actorAgentId, result);
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
    const replay = this.#commandJournal.read(runId, actorAgentId, input.commandId, input, isLifecycleResult);
    if (replay !== undefined) return replay;
    assertTaskOperationAdmitted(this.#database, runId, input.taskId);
    if (actorAgentId !== input.agentId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "agents may request lifecycle changes only for themselves");
    }
    if (!isLifecycleCheckpoint(input.checkpoint)) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "lifecycle checkpoint lacks a portable recovery field");
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
      const action = await this.#executeAdapterOperation({
        runId,
        adapterId,
        actionId: `${input.commandId}:release`,
        operation: "release",
        method: "release",
        payload: { resumeReference, generation: state.providerSessionGeneration },
      });
      if (!isRow(action.result) || action.result.released !== true || action.result.deleted === true) {
        throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "adapter did not prove non-destructive release");
      }
      this.#database.prepare("UPDATE agents SET lifecycle = 'archived' WHERE run_id = ? AND agent_id = ?").run(
        runId,
        actorAgentId,
      );
      const result = this.getAgentLifecycle(runId, actorAgentId);
      this.#recordLifecycleOperation(runId, input, resumeReference, null);
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }

    const agent = rowOrNotFound(
      this.#database.prepare("SELECT provider_session_ref FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, actorAgentId),
      "agent",
    );
    const priorReference = typeof agent.provider_session_ref === "string" ? agent.provider_session_ref : input.checkpoint.providerResumeReference;
    const current = this.getAgentLifecycle(runId, actorAgentId);
    const generation = current.providerSessionGeneration + 1;
    const adapterId = this.#adapterIdForAgent(runId, actorAgentId);
    const capabilities = await this.#requestAdapter(adapterId, "capabilities", {});
    const inPlace = input.action === "compact" && isRow(capabilities) && capabilities.compactInPlace === true;
    let replacementReference = priorReference;
    if (!inPlace) {
      const spawnAction = await this.#executeAdapterOperation({
        runId,
        adapterId,
        actionId: `${input.commandId}:spawn`,
        operation: "spawn",
        method: "spawn",
        payload: { priorResumeReference: priorReference, generation },
      });
      if (!isRow(spawnAction.result) || typeof spawnAction.result.resumeReference !== "string") {
        throw new Error("adapter returned an invalid replacement session");
      }
      replacementReference = spawnAction.result.resumeReference;
    } else {
      await this.#executeAdapterOperation({
        runId,
        adapterId,
        actionId: `${input.commandId}:compact`,
        operation: "compact",
        method: "compact",
        payload: { resumeReference: priorReference, generation },
      });
    }
    this.#database
      .prepare("UPDATE agents SET lifecycle = 'ready', provider_session_ref = ? WHERE run_id = ? AND agent_id = ?")
      .run(replacementReference, runId, actorAgentId);
    this.#database.prepare("DELETE FROM delivery_freezes WHERE run_id = ? AND agent_id = ?").run(runId, actorAgentId);
    this.#database
      .prepare(
        "INSERT INTO provider_state(run_id, agent_id, provider_session_generation, context_revision, reconciled_checkpoint_sha256) VALUES (?, ?, ?, NULL, ?) ON CONFLICT(run_id, agent_id) DO UPDATE SET provider_session_generation = excluded.provider_session_generation, context_revision = NULL, reconciled_checkpoint_sha256 = excluded.reconciled_checkpoint_sha256",
      )
      .run(runId, actorAgentId, generation, input.checkpoint.sha256);
    const result: LifecycleResult = {
      agentId: actorAgentId,
      lifecycle: "ready",
      providerSessionGeneration: generation,
      rotation: { kind: inPlace ? "in-place" : "replacement-session", priorResumeReference: priorReference },
    };
    this.#recordLifecycleOperation(runId, input, priorReference, replacementReference);
    this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
    return result;
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
    input: {
      adapterId: string;
      actionId: string;
      operation: "send_turn" | "wakeup" | "release" | "steer";
      payload: Record<string, unknown>;
      commandId: string;
    },
  ): Promise<ProviderActionResult> {
    this.#assertChair(runId, actorAgentId);
    this.#assertGenericProviderAction(runId, input.actionId);
    const replay = this.#commandJournal.read(runId, actorAgentId, input.commandId, input, isProviderActionResult);
    if (replay !== undefined) return replay;
    const target = this.#providerSessions.resolveTarget(runId, input.adapterId, input.payload);
    if (input.operation === "send_turn" && target === undefined) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "send_turn requires a bound provider session target");
    }
    const taskValue = input.payload.taskId;
    if (taskValue !== undefined && typeof taskValue !== "string") {
      throw new FabricError("CAPABILITY_FORBIDDEN", "provider task ID must be text");
    }
    const taskId = input.operation === "send_turn" || input.operation === "steer"
      ? resolveTaskBindingForActiveWork(
        this.#database,
        runId,
        target?.agentId ?? actorAgentId,
        taskValue,
      )
      : undefined;
    if (input.operation !== "send_turn" && input.operation !== "steer") {
      assertRunAcceptingWork(this.#database, runId);
    }
    const taskBoundPayload = taskId === undefined ? input.payload : { ...input.payload, taskId };
    let admittedInputPayload = taskBoundPayload;
    if (target !== undefined) {
      this.#assertProviderPrincipalActive(runId, target.agentId);
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
      admittedInputPayload = this.#admitProviderPayload(runId, stringField(targetAgent, "authority_id"), taskBoundPayload);
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
      admittedInputPayload = this.#admitProviderPayload(runId, stringField(actor, "authority_id"), taskBoundPayload);
    }
    if (input.operation === "send_turn" || input.operation === "steer") {
      this.#assertAdapterModel(input.adapterId, admittedInputPayload);
    }
    const identityHash = sha256(canonicalJson({
      adapterId: input.adapterId,
      operation: input.operation,
      targetAgentId: target?.agentId ?? null,
      providerSessionGeneration: target?.providerSessionGeneration ?? null,
      payload: admittedInputPayload,
    }));
    const existing = this.#providerSessions.assertActionIdentity({
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
      const result = this.getProviderAction(runId, input.actionId);
      if (result.status === "terminal" || result.status === "quarantined") {
        this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
        return result;
      }
      return await this.reconcileProviderAction(runId, actorAgentId, {
        actionId: input.actionId,
        commandId: `${input.commandId}:reconcile`,
      });
    }
    let providerPayload = admittedInputPayload;
    let turnLeaseGeneration: number | null = null;
    let actionPrepared = false;
    if (input.operation === "send_turn" && target !== undefined) {
      const admission = this.#providerSessions.prepareTurnAction({
        runId,
        actionId: input.actionId,
        adapterId: input.adapterId,
        operation: "send_turn",
        identityHash,
        target,
        payload: admittedInputPayload,
      });
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
      const payloadJson = canonicalJson(providerPayload);
      this.#database
        .prepare(
          "INSERT INTO provider_actions(run_id, action_id, adapter_id, operation, target_agent_id, provider_session_generation, turn_lease_generation, identity_hash, payload_hash, payload_json, status, history_json, execution_count, effect_count, idempotency_proven, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'prepared', '[\"prepared\"]', 0, 0, 0, ?)",
        )
        .run(
          runId,
          input.actionId,
          input.adapterId,
          input.operation,
          target?.agentId ?? null,
          target?.providerSessionGeneration ?? null,
          turnLeaseGeneration,
          identityHash,
          sha256(payloadJson),
          payloadJson,
          this.#clock(),
        );
    }
    const persistedProviderPayload: unknown = JSON.parse(canonicalJson(providerPayload));
    if (!isRow(persistedProviderPayload)) throw new Error("provider action payload is invalid");
    providerPayload = persistedProviderPayload;
    const capabilities = await this.#requestAdapter(input.adapterId, "capabilities", {});
    assertAdapterOperation(capabilities, input.operation);
    this.#database
      .prepare("UPDATE provider_actions SET status = 'dispatched', history_json = '[\"prepared\",\"dispatched\"]', execution_count = 1, updated_at = ? WHERE run_id = ? AND action_id = ?")
      .run(this.#clock(), runId, input.actionId);
    try {
      const response = await this.#requestAdapter(input.adapterId, "dispatch", { actionId: input.actionId, operation: input.operation, payload: providerPayload });
      const result = providerActionResult(response);
      this.#persistProviderAction(runId, input.actionId, response, result);
      this.#providerSessions.settleTurn(runId, input.actionId, result.status === "terminal" ? "terminal" : "ambiguous");
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
      this.#persistProviderAction(runId, input.actionId, { idempotencyProven: false }, result);
      this.#providerSessions.settleTurn(runId, input.actionId, "ambiguous");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }
  }

  async reconcileProviderAction(
    runId: string,
    actorAgentId: string,
    input: { actionId: string; commandId: string },
  ): Promise<ProviderActionResult> {
    this.#assertChair(runId, actorAgentId);
    this.#assertGenericProviderAction(runId, input.actionId);
    const replay = this.#commandJournal.read(runId, actorAgentId, input.commandId, input, isProviderActionResult);
    if (replay !== undefined) return replay;
    const stored = rowOrNotFound(
      this.#database
        .prepare("SELECT adapter_id, operation, payload_json, status, idempotency_proven, target_agent_id FROM provider_actions WHERE run_id = ? AND action_id = ?")
        .get(runId, input.actionId),
      "provider action",
    );
    let result = this.getProviderAction(runId, input.actionId);
    if (result.status === "prepared") {
      if (typeof stored.target_agent_id === "string") {
        this.#assertProviderPrincipalActive(runId, stored.target_agent_id);
      }
      const payload: unknown = JSON.parse(stringField(stored, "payload_json"));
      if (!isRow(payload)) throw new Error("stored provider action payload is invalid");
      const adapterId = stringField(stored, "adapter_id");
      this.#database
        .prepare("UPDATE provider_actions SET status = 'dispatched', history_json = '[\"prepared\",\"dispatched\"]', execution_count = 1, updated_at = ? WHERE run_id = ? AND action_id = ?")
        .run(this.#clock(), runId, input.actionId);
      try {
        const response = await this.#requestAdapter(adapterId, "dispatch", { actionId: input.actionId, operation: stringField(stored, "operation"), payload });
        result = providerActionResult(response);
        this.#persistProviderAction(runId, input.actionId, response, result);
      } catch {
        result = {
          actionId: input.actionId,
          status: "ambiguous",
          history: ["prepared", "dispatched", "ambiguous"],
          executionCount: 1,
          effectCount: 0,
        };
        this.#persistProviderAction(runId, input.actionId, { idempotencyProven: false }, result);
      }
      this.#providerSessions.settleTurn(runId, input.actionId, result.status === "terminal" ? "terminal" : "ambiguous");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }
    if (result.status !== "ambiguous" && result.status !== "dispatched") {
      this.#providerSessions.settleTurn(runId, input.actionId, result.status === "terminal" ? "terminal" : "quarantined");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }
    const adapterId = stringField(stored, "adapter_id");
    let lookup: unknown;
    try {
      lookup = await this.#requestAdapter(adapterId, "lookup_action", { actionId: input.actionId });
    } catch {
      result = { ...result, status: "quarantined" };
      this.#database
        .prepare("UPDATE provider_actions SET status = 'quarantined', updated_at = ? WHERE run_id = ? AND action_id = ?")
        .run(this.#clock(), runId, input.actionId);
      this.#providerSessions.settleTurn(runId, input.actionId, "quarantined");
      this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
      return result;
    }
    const lookedUp = providerActionResult(lookup);
    const idempotencyProven = numberField(stored, "idempotency_proven") === 1 ||
      (isRow(lookup) && lookup.idempotencyProven === true);
    if (lookedUp.status === "terminal") {
      result = lookedUp;
      this.#persistProviderAction(runId, input.actionId, lookup, result);
    } else if (idempotencyProven) {
      if (typeof stored.target_agent_id === "string") {
        this.#assertProviderPrincipalActive(runId, stored.target_agent_id);
      }
      const payload: unknown = JSON.parse(stringField(stored, "payload_json"));
      if (!isRow(payload)) throw new Error("stored provider action payload is invalid");
      const replayed = await this.#requestAdapter(adapterId, "dispatch", { actionId: input.actionId, operation: stringField(stored, "operation"), payload });
      result = providerActionResult(replayed);
      this.#persistProviderAction(runId, input.actionId, replayed, result);
    } else {
      result = { ...lookedUp, status: "quarantined" };
      this.#database
        .prepare("UPDATE provider_actions SET status = 'quarantined', updated_at = ? WHERE run_id = ? AND action_id = ?")
        .run(this.#clock(), runId, input.actionId);
    }
    this.#providerSessions.settleTurn(runId, input.actionId, result.status === "terminal" ? "terminal" : "quarantined");
    this.#commandJournal.write(runId, actorAgentId, input.commandId, input, result);
    return result;
  }

  getProviderAction(runId: string, actionId: string): ProviderActionResult {
    const row = rowOrNotFound(
      this.#database
        .prepare("SELECT status, history_json, execution_count, effect_count, result_json FROM provider_actions WHERE run_id = ? AND action_id = ?")
        .get(runId, actionId),
      "provider action",
    );
    const history: unknown = JSON.parse(stringField(row, "history_json"));
    if (!isStringArray(history) || !isProviderActionStatus(row.status)) {
      throw new Error("stored provider action is invalid");
    }
    const resultJson = row.result_json;
    return {
      actionId,
      status: row.status,
      history,
      executionCount: numberField(row, "execution_count"),
      effectCount: numberField(row, "effect_count"),
      ...(typeof resultJson === "string" ? { result: JSON.parse(resultJson) } : {}),
    };
  }

  recordModelRoutingEvidence(
    runId: string,
    actorAgentId: string,
    input: ModelRoutingEvidenceInput,
  ): void {
    this.#assertChair(runId, actorAgentId);
    this.#providerSessions.recordModelRoutingEvidence(runId, input);
    this.#event(runId, "model-routing-evidence-recorded", actorAgentId, {
      evidenceId: input.evidenceId,
      actionId: input.actionId,
      relativePath: input.relativePath,
      sha256: input.sha256,
    });
  }

  recordCrossFamilyReviewEvidence(
    runId: string,
    actorAgentId: string,
    input: CrossFamilyReviewEvidenceInput,
  ): void {
    this.#assertChair(runId, actorAgentId);
    this.#providerSessions.recordCrossFamilyReviewEvidence(runId, input);
    this.#event(runId, "cross-family-review-evidence-recorded", actorAgentId, {
      evidenceId: input.evidenceId,
      reviewerAgentId: input.reviewerAgentId,
      providerFamily: input.providerFamily,
      independent: input.independent,
      relativePath: input.relativePath,
      sha256: input.sha256,
    });
  }

  createTeam(runId: string, actorAgentId: string, input: TeamCreateInput): TeamResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isTeamResult, () => {
      const { depth, parentTeamId } = this.#teamCreationPosition(runId, actorAgentId, input.parentTeamId);
      if ("leader" in input) {
        return this.#createAtomicTeam(runId, actorAgentId, input, depth, parentTeamId);
      }
      return this.#createExistingTeam(runId, actorAgentId, input, depth, parentTeamId);
    });
  }

  #createAtomicTeam(
    runId: string,
    actorAgentId: string,
    input: AtomicTeamCreateInput,
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
    const memberIds: string[] = [];
    for (const member of input.initialMembers) {
      const grant = this.delegateAuthority(runId, input.leader.agentId, {
        parentAuthorityId: leaderGrant.authorityId,
        authority: member.authority,
        commandId: `${input.commandId}:member-authority:${member.agentId}`,
      });
      this.#registerAgentIdentity(runId, input.leader.agentId, { agentId: member.agentId, authorityId: grant.authorityId });
      memberIds.push(member.agentId);
    }
    const rootTask = this.createTask(runId, actorAgentId, {
      taskId: input.rootTask.taskId,
      authorityId: leaderGrant.authorityId,
      proposedOwnerAgentId: input.leader.agentId,
      participantAgentIds: [input.leader.agentId, ...memberIds],
      eligibleAgentIds: [input.leader.agentId],
      dependencies: [],
      objective: input.rootTask.objective,
      baseRevision: input.rootTask.baseRevision,
      commandId: `${input.commandId}:root-task`,
    });
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
      memberAgentIds: [input.leader.agentId, ...memberIds],
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
      initialMemberAgentIds: memberIds,
    };
  }

  #createExistingTeam(
    runId: string,
    actorAgentId: string,
    input: ExistingTeamCreateInput,
    depth: number,
    parentTeamId: string | null,
  ): TeamResult {
    const leader = rowOrNotFound(
      this.#database.prepare("SELECT authority_id FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, input.leaderAgentId),
      "team leader",
    );
    const authorityId = input.authorityId ?? stringField(leader, "authority_id");
    if (stringField(leader, "authority_id") !== authorityId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "team leader does not hold the named authority");
    }
    const members = [...new Set([input.leaderAgentId, ...(input.memberAgentIds ?? input.initialMemberAgentIds ?? [])])];
    if (members.length - 1 > 5) throw new FabricError("BUDGET_EXCEEDED", "team exceeds five workers");
    for (const agentId of members) {
      rowOrNotFound(
        this.#database.prepare("SELECT 1 FROM agents WHERE run_id = ? AND agent_id = ?").get(runId, agentId),
        `team member ${agentId}`,
      );
    }
    const ownedTaskIds = [...new Set(input.ownedTaskIds ?? [input.rootTaskId])];
    if (!ownedTaskIds.includes(input.rootTaskId)) throw new FabricError("TASK_SUBTREE_CONFLICT", "owned task set omits root");
    const budget = input.budget ?? input.reservedBudget ?? {};
    validateIntegerBudget(budget);
    const authority = rowOrNotFound(
      this.#database.prepare("SELECT authority_json FROM authorities WHERE run_id = ? AND authority_id = ?").get(runId, authorityId),
      "team authority",
    );
    const authorityBudget = parseAuthority(stringField(authority, "authority_json")).budget;
    for (const [unit, value] of Object.entries(budget)) {
      if ((authorityBudget[unit] ?? -1) < value) throw new FabricError("BUDGET_EXCEEDED", `team budget exceeds authority for ${unit}`);
    }
    const budgetId = `${input.teamId}:budget`;
    this.#insertTeamRecords(runId, {
      teamId: input.teamId,
      parentTeamId,
      depth,
      leaderAgentId: input.leaderAgentId,
      rootTaskId: input.rootTaskId,
      ownedTaskIds,
      memberAgentIds: members,
      authorityId,
      budgetId,
      budget,
      initialReserved: {},
      discussionGroups: input.discussionGroups ?? [],
      actorAgentId,
    });
    return this.getTeam(runId, input.teamId);
  }

  #teamCreationPosition(runId: string, actorAgentId: string, requestedParentTeamId?: string): {
    depth: number;
    parentTeamId: string | null;
  } {
    if (requestedParentTeamId === undefined) {
      this.#assertChair(runId, actorAgentId);
      const count = numberField(
        rowOrNotFound(this.#database.prepare("SELECT COUNT(*) AS count FROM teams WHERE run_id = ? AND depth = 1").get(runId), "leader count"),
        "count",
      );
      if (count >= 4) throw new FabricError("BUDGET_EXCEEDED", "run already has four top-level leaders");
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
      const run = rowOrNotFound(
        this.#database.prepare("SELECT project_run_directory FROM runs WHERE run_id = ?").get(runId),
        "run",
      );
      const directoryValue = run.project_run_directory;
      if (typeof directoryValue !== "string") {
        throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "run has no project artifact directory");
      }
      let target: string;
      try {
        target = canonicalPath(resolve(directoryValue, input.relativePath));
      } catch (error: unknown) {
        throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "artifact path cannot be canonicalised", { cause: error });
      }
      if (!pathContains(canonicalPath(directoryValue), target)) {
        throw new FabricError("ARTIFACT_PATH_FORBIDDEN", "artifact path escapes the run directory");
      }
      const artifactId = uuidv7();
      this.#database
        .prepare(
          "INSERT INTO artifacts(artifact_id, run_id, task_id, publisher_agent_id, relative_path, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          artifactId,
          runId,
          taskId ?? null,
          actorAgentId,
          input.relativePath,
          input.sha256,
          this.#clock(),
        );
      const result: ArtifactResult = {
        artifactId,
        relativePath: input.relativePath,
        sha256: input.sha256,
      };
      this.#event(runId, "artifact-published", actorAgentId, result);
      return result;
    });
  }

  closeBarrier(
    runId: string,
    actorAgentId: string,
    input: { scope: "run" | "stage"; stageId?: string; commandId: string },
  ): BarrierResult {
    return this.#commandJournal.execute(runId, actorAgentId, input.commandId, input, isBarrierResult, () => {
      this.#assertChair(runId, actorAgentId);
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
      const stageId = input.scope === "stage" ? input.stageId ?? "default" : "";
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
      this.#database.prepare("SELECT chair_agent_id, project_run_directory FROM runs WHERE run_id = ?").get(runId),
      "run",
    );
    if (stringField(run, "chair_agent_id") !== actorAgentId) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "only the chair may export the receipt");
    }
    const directoryValue = run.project_run_directory;
    if (typeof directoryValue !== "string") {
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

  #admitProviderPayload(
    runId: string,
    authorityId: string,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const row = rowOrNotFound(
      this.#database.prepare("SELECT authority_json FROM authorities WHERE run_id = ? AND authority_id = ?").get(runId, authorityId),
      "provider authority",
    );
    const authority = parseAuthority(stringField(row, "authority_json"));
    if (Date.parse(authority.expiresAt) <= this.#clock()) {
      throw new FabricError("AUTHENTICATION_FAILED", "provider authority has expired");
    }
    const providerDisclosure = authority.disclosure.level === "allowed" ||
      (authority.disclosure.level === "scoped" && authority.disclosure.scopes.includes("approved-provider"));
    if (!providerDisclosure) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "authority does not permit disclosure to an approved provider");
    }
    const forbiddenControls = [
      "allowedTools",
      "disallowedTools",
      "approvalPolicy",
      "permissions",
      "permissionMode",
      "sandbox",
      "dangerouslySkipPermissions",
      "developerInstructions",
      "baseInstructions",
      "modelProvider",
      "serviceTier",
    ];
    const forbidden = forbiddenControls.find((field) => Object.hasOwn(payload, field));
    if (forbidden !== undefined) {
      throw new FabricError("CAPABILITY_FORBIDDEN", `provider payload cannot override trusted control ${forbidden}`);
    }
    if (payload.cwd !== undefined && typeof payload.cwd !== "string") {
      throw new FabricError("CAPABILITY_FORBIDDEN", "provider cwd must be a workspace-relative path");
    }
    const root = this.#workspaceRootForRun(runId);
    const relativeCwd = canonicalAuthorityPath(root, payload.cwd ?? authority.sourcePaths[0] ?? ".");
    if (
      !authority.sourcePaths.some((allowed) => pathContains(allowed, relativeCwd)) ||
      authority.deniedPaths.some((denied) => scopesOverlap(denied, relativeCwd))
    ) {
      throw new FabricError("CAPABILITY_FORBIDDEN", "provider cwd is outside delegated authority");
    }
    return {
      ...payload,
      cwd: resolve(root, relativeCwd),
      allowedTools: [],
      approvalPolicy: "never",
      sandbox: "read-only",
    };
  }

  #assertProviderPrincipalActive(runId: string, agentId: string): void {
    const principal = rowOrNotFound(this.#database.prepare(`
      SELECT c.revoked_at, c.expires_at
        FROM capabilities c
       WHERE c.run_id = ? AND c.agent_id = ?
       ORDER BY c.principal_generation DESC LIMIT 1
    `).get(runId, agentId), "provider principal");
    if (principal.revoked_at !== null || numberField(principal, "expires_at") <= this.#clock()) {
      throw new FabricError("AUTHENTICATION_FAILED", "provider principal is revoked or expired");
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
      payload: input.payload,
    }));
    const existing = this.#providerSessions.assertActionIdentity({
      runId: input.runId,
      actionId: input.actionId,
      adapterId: input.adapterId,
      operation: input.operation,
      identityHash,
      ...(targetAgentId === undefined ? {} : { targetAgentId }),
      ...(providerSessionGeneration === undefined ? {} : { providerSessionGeneration }),
    });
    if (existing) {
      return this.getProviderAction(input.runId, input.actionId);
    }
    this.#database
      .prepare(
        "INSERT INTO provider_actions(run_id, action_id, adapter_id, operation, target_agent_id, provider_session_generation, turn_lease_generation, identity_hash, payload_hash, payload_json, status, history_json, execution_count, effect_count, idempotency_proven, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'dispatched', '[\"prepared\",\"dispatched\"]', 1, 0, 0, ?)",
      )
      .run(
        input.runId,
        input.actionId,
        input.adapterId,
        input.operation,
        targetAgentId ?? null,
        providerSessionGeneration ?? null,
        identityHash,
        sha256(payloadJson),
        payloadJson,
        this.#clock(),
      );
    try {
      const response = await this.#requestAdapter(input.adapterId, input.method, { ...input.payload, actionId: input.actionId, payload: input.payload });
      const result: ProviderActionResult = {
        actionId: input.actionId,
        status: "terminal",
        history: ["prepared", "dispatched", "accepted", "terminal"],
        executionCount: 1,
        effectCount: 1,
        result: response,
      };
      this.#persistProviderAction(input.runId, input.actionId, { idempotencyProven: true }, result);
      return result;
    } catch (error: unknown) {
      const ambiguous: ProviderActionResult = {
        actionId: input.actionId,
        status: "ambiguous",
        history: ["prepared", "dispatched", "ambiguous"],
        executionCount: 1,
        effectCount: 0,
      };
      this.#persistProviderAction(input.runId, input.actionId, { idempotencyProven: false }, ambiguous);
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", `adapter ${input.operation} result is ambiguous`, { cause: error });
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
    const run = rowOrNotFound(
      this.#database.prepare("SELECT project_run_directory FROM runs WHERE run_id = ?").get(runId),
      "run",
    );
    if (typeof run.project_run_directory !== "string") {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "run has no checkpoint directory");
    }
    const root = canonicalPath(run.project_run_directory);
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
    const mailbox = this.getMailboxState(runId, agentId);
    if (mailbox.contiguousWatermark !== checkpoint.mailboxWatermark || canonicalJson(mailbox.acknowledgedAboveWatermark) !== canonicalJson(checkpoint.acknowledgedAboveWatermark)) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "checkpoint mailbox state is stale");
    }
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
      lifecycle !== "completion-ready" ||
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
    actionId: string,
    raw: unknown,
    result: ProviderActionResult,
  ): void {
    const idempotencyProven = isRow(raw) && raw.idempotencyProven === true ? 1 : 0;
    this.#database
      .prepare(
        "UPDATE provider_actions SET status = ?, history_json = ?, execution_count = ?, effect_count = ?, idempotency_proven = ?, result_json = ?, updated_at = ? WHERE run_id = ? AND action_id = ?",
      )
      .run(
        result.status,
        canonicalJson(result.history),
        result.executionCount,
        result.effectCount,
        idempotencyProven,
        result.result === undefined ? null : canonicalJson(result.result),
        this.#clock(),
        runId,
        actionId,
      );
  }

}

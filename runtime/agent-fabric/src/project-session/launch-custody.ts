import type { ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  parseLaunchAdapterOutcomeV1,
  parseLaunchPacketV1,
  parseLaunchResourcePlanV1,
  parseProjectSessionLaunchCurrentState,
  parseArtifactRef,
  parseProviderActionRefV1,
  type ProjectSessionLaunchCurrentState,
  type ProjectSessionLaunchIntent,
  type ProviderActionRefV1,
  type ArtifactRef,
  type Sha256Digest,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { expandAuthorityActions } from "../domain/operations.js";
import { ProjectFabricCoreError } from "./contracts.js";
import { canonicalJson, integer, isRow, row, sha256, text, type Row } from "./store-support.js";

type Digest = Sha256Digest;
type ArtifactBinding = ArtifactRef;
type ResourceAmounts = Readonly<Record<string, number>>;

export type LaunchCustodyIntent = ProjectSessionLaunchIntent;

export type NormalisedLaunchAuthority = Readonly<{
  workspaceRoots: readonly string[];
  sourcePaths: readonly string[];
  artifactPaths: readonly string[];
  actions: readonly string[];
  deniedPaths: readonly string[];
  deniedActions: readonly string[];
  disclosure: Readonly<{ level: "allowed" | "forbidden" } | { level: "scoped"; scopes: readonly string[] }>;
  expiresAt: string;
  budget: ResourceAmounts;
}>;

export type LaunchAdapterContract = Readonly<{
  schemaVersion: 1;
  inputSchemaId: string;
  inputSchema: Record<string, unknown>;
  noEffectProofSchemas: Readonly<Record<string, Record<string, unknown>>>;
}>;

type LaunchPacket = Readonly<{
  schemaVersion: 1;
  projectId: string;
  projectSessionId: string;
  runId: string;
  chairAgentId: string;
  projectRunDirectory: string;
  topologyMode: "coordinated" | "independent";
  budgetRef: string;
  resourcePlanRef: ArtifactBinding;
  chairAuthority: NormalisedLaunchAuthority;
  provider: Readonly<{
    adapterId: string;
    actionId: string;
    contractDigest: Digest;
    inputSchemaId: string;
    input: Record<string, unknown>;
  }>;
}>;

type LaunchResourcePlan = Readonly<{
  schemaVersion: 1;
  projectId: string;
  projectSessionId: string;
  runId: string;
  budgetRef: string;
  scopes: Readonly<{
    project: Readonly<{ scopeId: string; limits: ResourceAmounts }>;
    projectSession: Readonly<{ scopeId: string; limits: ResourceAmounts }>;
    coordinationRun: Readonly<{ scopeId: string; limits: ResourceAmounts }>;
  }>;
  launchReservation: Readonly<{ amounts: ResourceAmounts }>;
}>;

export type LaunchInspection = Readonly<{
  intent: LaunchCustodyIntent;
  canonicalProjectRoot: string;
  packet: LaunchPacket;
  plan: LaunchResourcePlan;
  launchBindingDigest: Digest;
  inspectedProjectRevision: number;
  inspectedSessionRevision: number;
  inspectedSessionGeneration: number;
}>;

export type LaunchDispatchHandle = Readonly<{
  schemaVersion: 1;
  providerAdapterId: string;
  providerActionId: string;
  providerContractDigest: Digest;
  publicPayload: Record<string, unknown>;
  capability: string;
  socketPath: string;
}>;

type LaunchOutcomeBase = Readonly<{
  schemaVersion: 1;
  providerAdapterId: string;
  providerActionId: string;
  providerContractDigest: Digest;
  observationKind: "dispatch-return" | "lookup";
  observedAt: string;
}>;

type LaunchTerminalSuccess = LaunchOutcomeBase & Readonly<{
  outcome: Readonly<{
    kind: "terminal-success";
    providerSessionRef: string;
    providerSessionGeneration: number;
    effectDigest: Digest;
    resourceUsage: Readonly<Record<string, number | "unknown">>;
  }>;
}>;

type LaunchTerminalNoEffect = LaunchOutcomeBase & Readonly<{
  outcome: Readonly<{
    kind: "terminal-no-effect";
    failureCode: string;
    noEffectProof: Readonly<{ schemaId: string; proof: Record<string, unknown>; digest: Digest }>;
  }>;
}>;

type LaunchAmbiguous = LaunchOutcomeBase & Readonly<{
  outcome: Readonly<{
    kind: "ambiguous";
    reasonCode:
      | "absent"
      | "transport-error"
      | "adapter-error"
      | "malformed"
      | "incomplete"
      | "conflict"
      | "missing-resume-reference";
    evidenceDigest: Digest | null;
  }>;
}>;

export type LaunchAdapterOutcome = LaunchTerminalSuccess | LaunchTerminalNoEffect | LaunchAmbiguous;

export type LaunchRecoveryResult = Readonly<{
  preparedFailed: number;
  lookedUp: number;
  activated: number;
  failed: number;
  ambiguous: number;
  recoveryRequired: number;
}>;

type LaunchCustodyServiceOptions = Readonly<{
  database: Database.Database;
  clock?: () => number;
  fault?: (label: string) => void;
  randomCapability: () => string;
  fabricSocketPath: string;
  adapterContracts: {
    inspect(adapterId: string): Promise<LaunchAdapterContract>;
  };
  adapterEffects: {
    dispatch(handle: LaunchDispatchHandle): Promise<unknown>;
    lookup(input: Readonly<{
      providerAdapterId: string;
      providerActionId: string;
      providerContractDigest: Digest;
    }>): Promise<unknown>;
  };
}>;

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const UNIT_KEY = /^[a-z][a-z0-9_.:-]{0,63}$/u;
const MAX_ARTIFACT_BYTES = 1024 * 1024;
const FORBIDDEN_PROVIDER_KEYS = /(?:capability|secret|token|credential|environment|env|executable|command|socket|api[_-]?key)/iu;

function protocol(message: string): never {
  throw new ProjectFabricCoreError("PROTOCOL_INVALID", message);
}

function forbidden(message: string): never {
  throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", message);
}

function stale(message: string): never {
  throw new ProjectFabricCoreError("STALE_REVISION", message);
}

function exactRecord(
  value: unknown,
  label: string,
  required: readonly string[],
  optional: readonly string[] = [],
): Row {
  if (!isRow(value)) protocol(`${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) protocol(`${label} contains unknown field ${unknown}`);
  const missing = required.find((key) => !(key in value));
  if (missing !== undefined) protocol(`${label} is missing ${missing}`);
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || value.includes("\0")) {
    protocol(`${label} must be a bounded non-empty string`);
  }
  return value;
}

function exactDigest(value: unknown, label: string): Digest {
  if (typeof value !== "string" || !DIGEST.test(value)) protocol(`${label} must be an exact sha256 digest`);
  return value as Digest;
}

function exactArtifact(value: unknown, label: string): ArtifactBinding {
  const record = exactRecord(value, label, ["path", "digest"]);
  return parseArtifactRef({
    path: safeRelativePath(nonEmptyString(record.path, `${label}.path`), `${label}.path`),
    digest: exactDigest(record.digest, `${label}.digest`),
  }, label);
}

function stringArray(value: unknown, label: string, allowEmpty = true): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) protocol(`${label} must be a string array`);
  const result = value.map((item, index) => nonEmptyString(item, `${label}[${String(index)}]`));
  return [...new Set(result)].sort();
}

function safeRelativePath(value: string, label: string): string {
  if (isAbsolute(value) || value === "" || value.includes("\0")) forbidden(`${label} must be workspace-relative`);
  const segments = value.split(/[\\/]/u);
  if (segments.some((segment) => segment === "" || segment === "..")) forbidden(`${label} contains traversal`);
  const normal = segments.filter((segment) => segment !== ".").join("/");
  return normal.length === 0 ? "." : normal;
}

function contained(root: string, target: string): boolean {
  const child = relative(root, target);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

function resolveAuthorityPath(root: string, value: string, label: string): string {
  const relativePath = safeRelativePath(value, label);
  const absolute = resolve(root, relativePath);
  if (!contained(root, absolute)) forbidden(`${label} escapes the trusted project`);
  let cursor = root;
  if (relativePath !== ".") {
    for (const segment of relativePath.split("/")) {
      cursor = resolve(cursor, segment);
      try {
        if (lstatSync(cursor).isSymbolicLink()) forbidden(`${label} resolves through a symlink`);
      } catch (error: unknown) {
        if (isRow(error) && error.code === "ENOENT") break;
        throw error;
      }
    }
  }
  return absolute;
}

function disclosure(value: unknown): NormalisedLaunchAuthority["disclosure"] {
  if (Array.isArray(value)) {
    const scopes = stringArray(value, "chair_authority.disclosure");
    if (scopes.length === 0) return { level: "forbidden" };
    if (scopes.some((scope) => scope !== "local" && scope !== "approved-provider" && scope !== "external")) {
      protocol("chair_authority.disclosure contains an unknown scope");
    }
    if (scopes.length === 3) return { level: "allowed" };
    return { level: "scoped", scopes };
  }
  const record = exactRecord(value, "chair_authority.disclosure", ["level"], ["scopes"]);
  const level = nonEmptyString(record.level, "chair_authority.disclosure.level");
  if (level === "allowed" || level === "forbidden") {
    if ("scopes" in record) protocol(`chair_authority.disclosure ${level} cannot carry scopes`);
    return { level };
  }
  if (level !== "scoped") protocol("chair_authority.disclosure.level is invalid");
  const scopes = stringArray(record.scopes, "chair_authority.disclosure.scopes", false);
  if (scopes.length >= 3 || scopes.some((scope) => scope !== "local" && scope !== "approved-provider" && scope !== "external")) {
    protocol("chair_authority.disclosure scoped set is invalid");
  }
  return { level: "scoped", scopes };
}

function resourceAmounts(value: unknown, label: string, allowEmpty = false): ResourceAmounts {
  if (!isRow(value)) protocol(`${label} must be an object`);
  if (!allowEmpty && Object.keys(value).length === 0) protocol(`${label} must not be empty`);
  const result: Record<string, number> = {};
  for (const [unit, amount] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    if (!UNIT_KEY.test(unit)) protocol(`${label}.${unit} has an invalid unit key`);
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
      protocol(`${label}.${unit} must be a non-negative safe integer`);
    }
    result[unit] = amount;
  }
  return result;
}

export function normaliseLaunchChairAuthority(value: unknown, projectRoot: string): NormalisedLaunchAuthority {
  const root = realpathSync(projectRoot);
  const record = exactRecord(value, "chair_authority", [
    "workspaceRoots", "sourcePaths", "artifactPaths", "actions", "disclosure", "expiresAt", "budget",
  ], ["deniedPaths", "deniedActions"]);
  const expand = (input: unknown, label: string): string[] => {
    const expanded = expandAuthorityActions(stringArray(input, label));
    if (!expanded.ok) protocol(`${label} contains unknown actions: ${expanded.unknownActions.join(", ")}`);
    return expanded.operations;
  };
  const workspaceRoots = stringArray(record.workspaceRoots, "chair_authority.workspaceRoots", false)
    .map((path) => resolveAuthorityPath(root, path, "chair_authority.workspaceRoots"));
  const sourcePaths = stringArray(record.sourcePaths, "chair_authority.sourcePaths")
    .map((path) => resolveAuthorityPath(root, path, "chair_authority.sourcePaths"));
  const artifactPaths = stringArray(record.artifactPaths, "chair_authority.artifactPaths")
    .map((path) => resolveAuthorityPath(root, path, "chair_authority.artifactPaths"));
  if (
    sourcePaths.some((path) => !workspaceRoots.some((workspace) => contained(workspace, path))) ||
    artifactPaths.some((path) => !workspaceRoots.some((workspace) => contained(workspace, path)))
  ) forbidden("chair authority source or artifact path escapes its workspace roots");
  const expires = Date.parse(nonEmptyString(record.expiresAt, "chair_authority.expiresAt"));
  if (!Number.isFinite(expires)) protocol("chair_authority.expiresAt must be an ISO timestamp");
  const deniedPaths = stringArray(record.deniedPaths ?? [], "chair_authority.deniedPaths")
    .map((path) => resolveAuthorityPath(root, path, "chair_authority.deniedPaths"));
  return {
    workspaceRoots: [...new Set(workspaceRoots)].sort(),
    sourcePaths: [...new Set(sourcePaths)].sort(),
    artifactPaths: [...new Set(artifactPaths)].sort(),
    actions: expand(record.actions, "chair_authority.actions"),
    deniedPaths: [...new Set(deniedPaths)].sort(),
    deniedActions: expand(record.deniedActions ?? [], "chair_authority.deniedActions"),
    disclosure: disclosure(record.disclosure),
    expiresAt: new Date(expires).toISOString(),
    budget: resourceAmounts(record.budget, "chair_authority.budget"),
  };
}

function readArtifact(root: string, reference: ArtifactBinding, label: string): string {
  const relativePath = safeRelativePath(reference.path, `${label}.path`);
  const absolute = resolve(root, relativePath);
  if (!contained(root, absolute)) forbidden(`${label} escapes the trusted project`);
  let handle: number | undefined;
  try {
    handle = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = fstatSync(handle);
    if (!info.isFile() || info.size > MAX_ARTIFACT_BYTES) protocol(`${label} must be a bounded regular file`);
    if (realpathSync(absolute) !== absolute) forbidden(`${label} resolves through a symlink`);
    const value = readFileSync(handle, "utf8");
    if (`sha256:${sha256(value)}` !== reference.digest) stale(`${label} digest changed`);
    return value;
  } catch (error: unknown) {
    if (error instanceof ProjectFabricCoreError) throw error;
    forbidden(`${label} cannot be opened without following symlinks`);
  } finally {
    if (handle !== undefined) closeSync(handle);
  }
  throw new Error("unreachable artifact read");
}

function jsonArtifact(root: string, reference: ArtifactBinding, label: string): unknown {
  const value = readArtifact(root, reference, label);
  try {
    return JSON.parse(value) as unknown;
  } catch {
    protocol(`${label} is not JSON`);
  }
}

function assertSameArtifact(left: ArtifactBinding, right: ArtifactBinding, label: string): void {
  if (left.path !== right.path || left.digest !== right.digest) stale(`${label} changed`);
}

function assertNarrowing(parent: ResourceAmounts, child: ResourceAmounts, label: string): void {
  for (const [unit, amount] of Object.entries(child)) {
    if (parent[unit] === undefined || amount > parent[unit]) forbidden(`${label}.${unit} widens its parent`);
  }
}

function sameAmounts(left: ResourceAmounts, right: ResourceAmounts): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function parsePacket(value: unknown, projectRoot: string): LaunchPacket {
  let packet: ReturnType<typeof parseLaunchPacketV1>;
  try {
    packet = parseLaunchPacketV1(value);
  } catch {
    protocol("launch_packet_v1 does not match the closed protocol schema");
  }
  const projectRunDirectory = safeRelativePath(
    packet.projectRunDirectory,
    "launch_packet_v1.project_run_directory",
  );
  resolveAuthorityPath(projectRoot, projectRunDirectory, "launch_packet_v1.project_run_directory");
  return {
    schemaVersion: 1,
    projectId: packet.projectId,
    projectSessionId: packet.projectSessionId,
    runId: packet.runId,
    chairAgentId: packet.chairAgentId,
    projectRunDirectory,
    topologyMode: packet.topologyMode,
    budgetRef: packet.budgetRef,
    resourcePlanRef: exactArtifact(packet.resourcePlanRef, "launch_packet_v1.resourcePlanRef"),
    chairAuthority: normaliseLaunchChairAuthority(packet.chairAuthority, projectRoot),
    provider: {
      adapterId: packet.provider.adapterId,
      actionId: packet.provider.actionId,
      contractDigest: packet.provider.contractDigest as Digest,
      inputSchemaId: packet.provider.inputSchemaId,
      input: packet.provider.input,
    },
  };
}

function parsePlan(value: unknown): LaunchResourcePlan {
  let parsed: ReturnType<typeof parseLaunchResourcePlanV1>;
  try {
    parsed = parseLaunchResourcePlanV1(value);
  } catch {
    protocol("launch_resource_plan_v1 does not match the closed protocol schema");
  }
  const project = { scopeId: parsed.scopes.project.scopeId, limits: resourceAmounts(parsed.scopes.project.limits, "project limits") };
  const projectSession = { scopeId: parsed.scopes.projectSession.scopeId, limits: resourceAmounts(parsed.scopes.projectSession.limits, "project-session limits") };
  const coordinationRun = { scopeId: parsed.scopes.coordinationRun.scopeId, limits: resourceAmounts(parsed.scopes.coordinationRun.limits, "coordination-run limits") };
  assertNarrowing(project.limits, projectSession.limits, "project-session scope");
  assertNarrowing(projectSession.limits, coordinationRun.limits, "coordination-run scope");
  const amounts = resourceAmounts(parsed.launchReservation.amounts, "launch_resource_plan_v1.launchReservation.amounts");
  assertNarrowing(coordinationRun.limits, amounts, "launch reservation");
  return {
    schemaVersion: 1,
    projectId: parsed.projectId,
    projectSessionId: parsed.projectSessionId,
    runId: parsed.runId,
    budgetRef: parsed.budgetRef,
    scopes: { project, projectSession, coordinationRun },
    launchReservation: { amounts },
  };
}

function assertNoTrustedProviderControls(value: unknown, path = "provider.input"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoTrustedProviderControls(item, `${path}[${String(index)}]`));
    return;
  }
  if (!isRow(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_PROVIDER_KEYS.test(key)) forbidden(`${path}.${key} is a trusted control field`);
    assertNoTrustedProviderControls(item, `${path}.${key}`);
  }
}

function jsonEvidenceDigest(value: unknown): Digest {
  try {
    return `sha256:${sha256(canonicalJson(value))}` as Digest;
  } catch {
    return `sha256:${sha256(String(value))}` as Digest;
  }
}

function isoTimestamp(value: unknown, label: string): string {
  const timestamp = nonEmptyString(value, label);
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) protocol(`${label} must be an ISO timestamp`);
  return new Date(milliseconds).toISOString();
}

function positiveOutcomeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    protocol("launch provider session generation must be a positive safe integer");
  }
  return value;
}

export function computeLaunchResourceStateDigest(
  database: Database.Database,
  projectId: string,
  projectSessionId: string,
): Digest {
  const scopes = database.prepare(`
    SELECT scope_id, project_session_id, coordination_run_id, parent_scope_id,
           scope_kind, owner_ref, state, revision
      FROM resource_scopes
     WHERE project_id=? AND (project_session_id IS NULL OR project_session_id=?)
     ORDER BY scope_kind, owner_ref, scope_id
  `).all(projectId, projectSessionId).filter(isRow).map((value) => ({
    scopeId: text(value, "scope_id"),
    projectSessionId: value.project_session_id,
    coordinationRunId: value.coordination_run_id,
    parentScopeId: value.parent_scope_id,
    scopeKind: text(value, "scope_kind"),
    ownerRef: text(value, "owner_ref"),
    state: text(value, "state"),
    revision: integer(value, "revision"),
    dimensions: database.prepare(`
      SELECT unit_key, limit_value, used, reserved, usage_unknown
        FROM resource_dimensions WHERE scope_id=? ORDER BY unit_key
    `).all(text(value, "scope_id")),
  }));
  const reservations = database.prepare(`
    SELECT reservation_id, coordination_run_id, leaf_scope_id, operation_id,
           state, revision, generation, path_json, amounts_json
      FROM resource_reservations
     WHERE project_session_id=? AND state NOT IN ('released','reconciled')
     ORDER BY reservation_id
  `).all(projectSessionId);
  return `sha256:${sha256(canonicalJson({ scopes, reservations }))}` as Digest;
}

export class LaunchCustodyService {
  readonly #database: Database.Database;
  readonly #clock: () => number;
  readonly #fault: (label: string) => void;
  readonly #randomCapability: () => string;
  readonly #fabricSocketPath: string;
  readonly #adapterContracts: LaunchCustodyServiceOptions["adapterContracts"];
  readonly #adapterEffects: LaunchCustodyServiceOptions["adapterEffects"];
  readonly #consumedHandles = new Set<string>();

  constructor(options: LaunchCustodyServiceOptions) {
    this.#database = options.database;
    this.#clock = options.clock ?? Date.now;
    this.#fault = options.fault ?? (() => undefined);
    this.#randomCapability = options.randomCapability;
    this.#fabricSocketPath = options.fabricSocketPath;
    this.#adapterContracts = options.adapterContracts;
    this.#adapterEffects = options.adapterEffects;
    if (!isAbsolute(this.#fabricSocketPath)) throw new TypeError("Fabric socket path must be absolute");
  }

  async inspect(intent: LaunchCustodyIntent): Promise<LaunchInspection> {
    const project = row(this.#database.prepare(`
      SELECT canonical_root, trust_record_digest, revision FROM projects WHERE project_id=?
    `).get(intent.projectId), "launch project");
    const root = realpathSync(text(project, "canonical_root"));
    if (root !== text(project, "canonical_root")) forbidden("trusted project root is not canonical");
    if (integer(project, "revision") !== intent.expectedProjectRevision) stale("launch project revision changed");
    if (project.trust_record_digest !== intent.trustRecordDigest) stale("launch trust record changed");
    const session = row(this.#database.prepare(`
      SELECT * FROM project_sessions WHERE project_session_id=? AND project_id=?
    `).get(intent.projectSessionId, intent.projectId), "launch project session");
    if (
      integer(session, "revision") !== intent.expectedSessionRevision ||
      integer(session, "generation") !== intent.expectedSessionGeneration
    ) stale("launch project-session revision or generation changed");
    const sessionState = text(session, "state");
    if (intent.retryOf === undefined && sessionState !== "awaiting_launch") {
      throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "initial launch requires awaiting_launch");
    }
    if (intent.retryOf !== undefined && sessionState !== "launch_failed") {
      throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "launch retry requires proved launch_failed");
    }
    let failedAttempt: Row | undefined;
    if (intent.retryOf === undefined) {
      assertSameArtifact(intent.launchPacketRef, parseArtifactRef({
        path: text(session, "launch_packet_path"),
        digest: exactDigest(session.launch_packet_digest, "stored launch packet digest"),
      }, "stored launch packet"), "stored launch packet");
    } else {
      failedAttempt = row(this.#database.prepare(`
        SELECT c.*, p.status, p.execution_count, p.effect_count, p.idempotency_proven, p.result_json
          FROM project_session_launch_custody c
          JOIN provider_actions p
            ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
         WHERE c.project_session_id=?
         ORDER BY c.custody_attempt_generation DESC LIMIT 1
      `).get(intent.projectSessionId), "failed launch custody");
      if (
        text(failedAttempt, "provider_adapter_id") !== intent.retryOf.providerAdapterId ||
        text(failedAttempt, "provider_action_id") !== intent.retryOf.providerActionId ||
        text(failedAttempt, "status") !== "terminal" ||
        integer(failedAttempt, "effect_count") !== 0 ||
        integer(failedAttempt, "idempotency_proven") !== 1 ||
        !this.#isProvedNoEffect(failedAttempt)
      ) {
        throw new ProjectFabricCoreError("CONFLICT", "launch retry does not bind the exact proved failed attempt");
      }
      assertSameArtifact(parseArtifactRef({
        path: text(session, "launch_packet_path"),
        digest: exactDigest(session.launch_packet_digest, "stored failed launch packet digest"),
      }, "stored failed launch packet"), parseArtifactRef({
        path: text(failedAttempt, "launch_packet_path"),
        digest: exactDigest(failedAttempt.launch_packet_digest, "failed custody packet digest"),
      }, "failed custody packet"), "failed attempt packet");
    }
    if (text(session, "budget_ref") !== intent.budgetRef) stale("launch budget reference changed");
    const packet = parsePacket(jsonArtifact(root, intent.launchPacketRef, "launch packet"), root);
    const plan = parsePlan(jsonArtifact(root, intent.resourcePlanRef, "launch resource plan"));
    assertSameArtifact(packet.resourcePlanRef, intent.resourcePlanRef, "packet resource plan");
    if (
      packet.projectId !== intent.projectId || packet.projectSessionId !== intent.projectSessionId ||
      plan.projectId !== intent.projectId || plan.projectSessionId !== intent.projectSessionId ||
      packet.runId !== plan.runId || packet.topologyMode !== text(session, "mode") ||
      packet.budgetRef !== intent.budgetRef || plan.budgetRef !== intent.budgetRef ||
      packet.provider.adapterId !== intent.providerAdapterId ||
      packet.provider.actionId !== intent.providerActionId ||
      packet.provider.contractDigest !== intent.providerContractDigest
    ) stale("launch packet, plan, intent or session identity changed");
    if (
      failedAttempt !== undefined &&
      (
        packet.runId === text(failedAttempt, "coordination_run_id") ||
        (
          packet.provider.adapterId === text(failedAttempt, "provider_adapter_id") &&
          packet.provider.actionId === text(failedAttempt, "provider_action_id")
        )
      )
    ) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "launch retry requires a new run and provider action identity");
    }
    if (`sha256:${sha256(canonicalJson(packet.chairAuthority))}` !== intent.authorityRef) {
      stale("launch chair authority digest changed");
    }
    if (!sameAmounts(packet.chairAuthority.budget, plan.scopes.coordinationRun.limits)) {
      forbidden("launch chair authority budget must equal coordination-run limits");
    }
    if (Date.parse(packet.chairAuthority.expiresAt) <= this.#clock()) {
      throw new ProjectFabricCoreError("CAPABILITY_EXPIRED", "launch chair authority is expired");
    }
    const contract = await this.#adapterContracts.inspect(intent.providerAdapterId);
    if (
      contract.schemaVersion !== 1 ||
      packet.provider.inputSchemaId !== contract.inputSchemaId ||
      `sha256:${sha256(canonicalJson(contract))}` !== intent.providerContractDigest
    ) stale("launch provider contract changed");
    assertNoTrustedProviderControls(packet.provider.input);
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    let validate: ValidateFunction;
    try {
      validate = ajv.compile(contract.inputSchema);
    } catch {
      protocol("registered launch input schema is invalid");
    }
    if (!validate(packet.provider.input)) protocol("launch provider input does not match its registered strict schema");
    const resourceStateDigest = computeLaunchResourceStateDigest(this.#database, intent.projectId, intent.projectSessionId);
    if (resourceStateDigest !== intent.resourceStateDigest) stale("launch resource state changed");
    const launchBindingDigest = `sha256:${sha256(canonicalJson({
      intent,
      packet,
      plan,
      projectRevision: integer(project, "revision"),
      sessionRevision: integer(session, "revision"),
      sessionGeneration: integer(session, "generation"),
    }))}` as Digest;
    return {
      intent,
      canonicalProjectRoot: root,
      packet,
      plan,
      launchBindingDigest,
      inspectedProjectRevision: integer(project, "revision"),
      inspectedSessionRevision: integer(session, "revision"),
      inspectedSessionGeneration: integer(session, "generation"),
    };
  }

  prepareInTransaction(input: Readonly<{
    inspection: LaunchInspection;
    operatorId: string;
    operatorCommandId: string;
  }>): LaunchDispatchHandle {
    if (!this.#database.inTransaction) throw new Error("launch preparation requires the operator command transaction");
    const { inspection } = input;
    const { intent, packet } = inspection;
    this.#revalidateInspection(inspection);
    const command = row(this.#database.prepare(`
      SELECT project_id, project_session_id, operation, status
        FROM operator_commands WHERE operator_id=? AND command_id=?
    `).get(input.operatorId, input.operatorCommandId), "launch operator preparation");
    if (
      text(command, "project_id") !== intent.projectId ||
      text(command, "project_session_id") !== intent.projectSessionId ||
      text(command, "operation") !== "launch" || text(command, "status") !== "committed"
    ) forbidden("operator preparation does not own this launch");
    const existing = this.#database.prepare(`
      SELECT 1 FROM project_session_launch_custody
       WHERE operator_id=? AND operator_command_id=?
    `).get(input.operatorId, input.operatorCommandId);
    if (existing !== undefined) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "launch secret cannot be recovered or redisclosed on replay");
    }
    const attempt = integer(row(this.#database.prepare(`
      SELECT COALESCE(MAX(custody_attempt_generation), 0) + 1 AS generation
        FROM project_session_launch_custody WHERE project_session_id=?
    `).get(intent.projectSessionId), "launch attempt generation"), "generation");
    if ((intent.retryOf === undefined && attempt !== 1) || (intent.retryOf !== undefined && attempt < 2)) {
      throw new ProjectFabricCoreError("CONFLICT", "launch attempt generation does not match retry state");
    }
    const now = this.#clock();
    const authorityId = `launch-authority:${packet.runId}:${String(attempt)}`;
    const chairLeaseId = `chair:${packet.runId}:1`;
    const reservationId = `launch-reservation:${sha256(`${intent.providerAdapterId}\0${intent.providerActionId}`).slice(0, 40)}`;
    const capability = this.#randomCapability();
    if (typeof capability !== "string" || capability.length < 16) throw new Error("random launch capability is too short");
    const capabilityHash = sha256(capability);
    const expiresAt = Date.parse(packet.chairAuthority.expiresAt);

    const changed = this.#database.prepare(`
      UPDATE project_sessions
         SET state='launching', revision=revision+1,
             launch_packet_path=?, launch_packet_digest=?, updated_at=?
       WHERE project_session_id=? AND project_id=? AND revision=? AND generation=?
         AND state=?
    `).run(
      intent.launchPacketRef.path,
      intent.launchPacketRef.digest,
      now,
      intent.projectSessionId,
      intent.projectId,
      intent.expectedSessionRevision,
      intent.expectedSessionGeneration,
      intent.retryOf === undefined ? "awaiting_launch" : "launch_failed",
    );
    if (changed.changes !== 1) stale("launch session changed during commit");
    this.#fault("launch:prepare:session");

    this.#database.prepare(`
      INSERT INTO runs(
        run_id, chair_agent_id, workspace_root, project_run_directory, created_at,
        project_session_id, lifecycle_state, revision, chair_generation, chair_lease_id,
        authority_ref, budget_ref, dependency_revision, topology_slot
      ) VALUES (?, ?, ?, ?, ?, ?, 'launching', 1, 1, ?, ?, ?, 1, ?)
    `).run(
      packet.runId,
      packet.chairAgentId,
      inspection.canonicalProjectRoot,
      packet.projectRunDirectory,
      now,
      intent.projectSessionId,
      chairLeaseId,
      intent.authorityRef,
      intent.budgetRef,
      packet.topologyMode === "coordinated" ? 1 : null,
    );
    this.#fault("launch:prepare:run");
    const authorityJson = canonicalJson(packet.chairAuthority);
    this.#database.prepare(`
      INSERT INTO authorities(authority_id, run_id, parent_authority_id, authority_json, authority_hash, created_at)
      VALUES (?, ?, NULL, ?, ?, ?)
    `).run(authorityId, packet.runId, authorityJson, sha256(authorityJson), now);
    const insertBudget = this.#database.prepare(`
      INSERT INTO authority_budget(authority_id, unit_key, granted, reserved, consumed, usage_unknown)
      VALUES (?, ?, ?, 0, 0, 0)
    `);
    for (const [unit, amount] of Object.entries(packet.chairAuthority.budget)) insertBudget.run(authorityId, unit, amount);
    this.#fault("launch:prepare:authority");
    this.#database.prepare(`
      INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, provider_session_ref, lifecycle)
      VALUES (?, ?, NULL, ?, NULL, 'ready')
    `).run(packet.runId, packet.chairAgentId, authorityId);
    this.#database.prepare("INSERT INTO mailbox_state(run_id, recipient_id) VALUES (?, ?)")
      .run(packet.runId, packet.chairAgentId);
    this.#database.prepare(`
      INSERT INTO agent_adapter_bindings(run_id, agent_id, adapter_id, contract_version, bound_at)
      VALUES (?, ?, ?, 1, ?)
    `).run(packet.runId, packet.chairAgentId, intent.providerAdapterId, now);
    this.#database.prepare(`
      INSERT INTO run_chair_leases(
        project_session_id, run_id, lease_id, holder_agent_id, generation, status, updated_at
      ) VALUES (?, ?, ?, ?, 1, 'active', ?)
    `).run(intent.projectSessionId, packet.runId, chairLeaseId, packet.chairAgentId, now);
    this.#database.prepare(`
      INSERT INTO capabilities(token_hash, run_id, agent_id, principal_generation, expires_at)
      VALUES (?, ?, ?, 1, ?)
    `).run(capabilityHash, packet.runId, packet.chairAgentId, expiresAt);
    this.#fault("launch:prepare:chair");

    this.#ensureScopes(inspection, now);
    this.#fault("launch:prepare:scopes");
    this.#reserve(inspection, reservationId, now);
    this.#fault("launch:prepare:reservation");

    const publicPayload = {
      schemaVersion: 1,
      providerContractDigest: intent.providerContractDigest,
      inputSchemaId: packet.provider.inputSchemaId,
      input: packet.provider.input,
    };
    const payloadJson = canonicalJson(publicPayload);
    this.#database.prepare(`
      INSERT INTO provider_actions(
        run_id, action_id, adapter_id, operation, target_agent_id,
        provider_session_generation, turn_lease_generation, identity_hash,
        payload_hash, payload_json, status, history_json, execution_count,
        effect_count, idempotency_proven, result_json, updated_at
      ) VALUES (?, ?, ?, 'launch-chair', ?, NULL, NULL, ?, ?, ?, 'prepared',
                '["prepared"]', 0, 0, 0, NULL, ?)
    `).run(
      packet.runId,
      intent.providerActionId,
      intent.providerAdapterId,
      packet.chairAgentId,
      sha256(canonicalJson({ adapterId: intent.providerAdapterId, actionId: intent.providerActionId })),
      sha256(payloadJson),
      payloadJson,
      now,
    );
    this.#fault("launch:prepare:provider-action");

    const insertMembership = this.#database.prepare(`
      INSERT INTO project_session_memberships(
        project_session_id, coordination_run_id, member_kind, member_id,
        required, state, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, 'active', 1, ?, ?)
    `);
    insertMembership.run(intent.projectSessionId, packet.runId, "coordination-run", packet.runId, now, now);
    insertMembership.run(intent.projectSessionId, packet.runId, "lease", chairLeaseId, now, now);
    insertMembership.run(intent.projectSessionId, packet.runId, "provider-action", intent.providerActionId, now, now);
    this.#database.prepare("INSERT INTO run_metadata(run_id, execution_profile) VALUES (?, 'headless')")
      .run(packet.runId);
    this.#fault("launch:prepare:memberships");

    this.#database.prepare(`
      INSERT INTO project_session_launch_custody(
        project_session_id, custody_attempt_generation, coordination_run_id,
        chair_agent_id, chair_lease_id, operator_id, operator_command_id,
        provider_adapter_id, provider_action_id, capability_hash, capability_expires_at,
        reservation_id, launch_packet_path, launch_packet_digest, authority_ref,
        budget_ref, resource_plan_path, resource_plan_digest, expected_project_revision,
        expected_session_revision, expected_session_generation, trust_record_digest,
        provider_contract_digest, resource_state_digest, launch_binding_digest,
        retry_of_provider_adapter_id, retry_of_provider_action_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      intent.projectSessionId,
      attempt,
      packet.runId,
      packet.chairAgentId,
      chairLeaseId,
      input.operatorId,
      input.operatorCommandId,
      intent.providerAdapterId,
      intent.providerActionId,
      capabilityHash,
      expiresAt,
      reservationId,
      intent.launchPacketRef.path,
      intent.launchPacketRef.digest,
      intent.authorityRef,
      intent.budgetRef,
      intent.resourcePlanRef.path,
      intent.resourcePlanRef.digest,
      intent.expectedProjectRevision,
      intent.expectedSessionRevision,
      intent.expectedSessionGeneration,
      intent.trustRecordDigest,
      intent.providerContractDigest,
      intent.resourceStateDigest,
      inspection.launchBindingDigest,
      intent.retryOf?.providerAdapterId ?? null,
      intent.retryOf?.providerActionId ?? null,
      now,
    );
    this.#fault("launch:prepare:custody");
    return {
      schemaVersion: 1,
      providerAdapterId: intent.providerAdapterId,
      providerActionId: intent.providerActionId,
      providerContractDigest: intent.providerContractDigest,
      publicPayload,
      capability,
      socketPath: this.#fabricSocketPath,
    };
  }

  async dispatchPrepared(handle: LaunchDispatchHandle): Promise<LaunchAdapterOutcome> {
    const key = `${handle.providerAdapterId}\0${handle.providerActionId}`;
    if (this.#consumedHandles.has(key)) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "launch handoff is one-use");
    }
    const changed = this.#database.prepare(`
      UPDATE provider_actions
         SET status='dispatched', history_json='["prepared","dispatched"]',
             execution_count=1, journal_revision=journal_revision+1, updated_at=?
       WHERE adapter_id=? AND action_id=? AND status='prepared'
         AND EXISTS (
           SELECT 1 FROM project_session_launch_custody c
            WHERE c.provider_adapter_id=provider_actions.adapter_id
              AND c.provider_action_id=provider_actions.action_id
              AND c.provider_contract_digest=?
         )
    `).run(this.#clock(), handle.providerAdapterId, handle.providerActionId, handle.providerContractDigest);
    if (changed.changes !== 1) throw new ProjectFabricCoreError("CONFLICT", "launch action is not prepared");
    this.#consumedHandles.add(key);
    const custody = row(this.#database.prepare(`
      SELECT * FROM project_session_launch_custody
       WHERE provider_adapter_id=? AND provider_action_id=? AND provider_contract_digest=?
    `).get(
      handle.providerAdapterId,
      handle.providerActionId,
      handle.providerContractDigest,
    ), "launch custody");
    let contract: LaunchAdapterContract;
    try {
      contract = await this.#adapterContracts.inspect(handle.providerAdapterId);
      if (`sha256:${sha256(canonicalJson(contract))}` !== handle.providerContractDigest) {
        throw new Error("launch provider contract changed");
      }
    } catch (error: unknown) {
      const outcome = this.#ambiguousOutcome(
        custody,
        "conflict",
        jsonEvidenceDigest(error instanceof Error ? error.message : error),
        "dispatch-return",
      );
      this.#database.transaction(() => this.#applyOutcome(custody, outcome))();
      return outcome;
    }
    let raw: unknown;
    try {
      raw = await this.#adapterEffects.dispatch(handle);
    } catch (error: unknown) {
      raw = this.#ambiguousOutcome(
        custody,
        "adapter-error",
        jsonEvidenceDigest(error instanceof Error ? error.message : error),
        "dispatch-return",
      );
    }
    const outcome = this.#normaliseOutcome(custody, raw, "dispatch-return", contract);
    this.#database.transaction(() => this.#applyOutcome(custody, outcome))();
    return outcome;
  }

  async lookup(input: Readonly<{
    providerAdapterId: string;
    providerActionId: string;
    providerContractDigest: Digest;
  }>): Promise<unknown> {
    return await this.#adapterEffects.lookup(input);
  }

  async readCurrentState(intent: LaunchCustodyIntent): Promise<ProjectSessionLaunchCurrentState> {
    const inspection = await this.inspect(intent);
    const session = row(this.#database.prepare(`
      SELECT state, launch_packet_path, launch_packet_digest
        FROM project_sessions WHERE project_session_id=? AND project_id=?
    `).get(intent.projectSessionId, intent.projectId), "launch project session");
    const sessionState = text(session, "state");
    const common = {
      schemaVersion: 1 as const,
      projectId: intent.projectId,
      projectRevision: inspection.inspectedProjectRevision,
      projectSessionId: intent.projectSessionId,
      sessionRevision: inspection.inspectedSessionRevision,
      sessionGeneration: inspection.inspectedSessionGeneration,
      currentLaunchPacketRef: {
        path: text(session, "launch_packet_path"),
        digest: exactDigest(session.launch_packet_digest, "stored launch packet digest"),
      },
      trustRecordDigest: intent.trustRecordDigest,
      providerAdapterId: intent.providerAdapterId,
      providerContractDigest: intent.providerContractDigest,
      resourceStateDigest: intent.resourceStateDigest,
    };
    if (sessionState === "awaiting_launch") {
      return parseProjectSessionLaunchCurrentState({
        ...common,
        sessionState: "awaiting_launch",
        provedFailedAttempt: null,
      });
    }
    if (sessionState !== "launch_failed") throw new ProjectFabricCoreError("CONFLICT", "launch state is not inspectable");
    const failed = row(this.#database.prepare(`
      SELECT c.provider_adapter_id, c.provider_action_id, p.status, p.execution_count,
             p.effect_count, p.result_json
        FROM project_session_launch_custody c
        JOIN provider_actions p
          ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
       WHERE c.project_session_id=?
       ORDER BY c.custody_attempt_generation DESC LIMIT 1
    `).get(intent.projectSessionId), "proved failed launch attempt");
    if (text(failed, "status") !== "terminal" || integer(failed, "effect_count") !== 0) {
      throw new ProjectFabricCoreError("CONFLICT", "latest launch attempt is not a proved failure");
    }
    return parseProjectSessionLaunchCurrentState({
      ...common,
      sessionState: "launch_failed",
      provedFailedAttempt: {
        providerAdapterId: text(failed, "provider_adapter_id"),
        providerActionId: text(failed, "provider_action_id") as never,
      },
    });
  }

  providerActionRefForCommand(operatorId: string, commandId: string): ProviderActionRefV1 {
    const value = row(this.#database.prepare(`
      SELECT c.project_session_id, c.custody_attempt_generation, c.coordination_run_id,
             c.provider_adapter_id, c.provider_action_id, c.provider_contract_digest,
             p.journal_revision, p.status, p.result_json, p.execution_count, p.effect_count
        FROM project_session_launch_custody c
        JOIN provider_actions p
          ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
       WHERE c.operator_id=? AND c.operator_command_id=?
    `).get(operatorId, commandId), "launch provider action reference");
    const status = text(value, "status");
    const common = {
      schemaVersion: 1,
      projectSessionId: text(value, "project_session_id"),
      coordinationRunId: text(value, "coordination_run_id"),
      providerAdapterId: text(value, "provider_adapter_id"),
      providerActionId: text(value, "provider_action_id"),
      providerContractDigest: text(value, "provider_contract_digest"),
      custodyAttemptGeneration: integer(value, "custody_attempt_generation"),
      journalRevision: integer(value, "journal_revision"),
    };
    if (status === "prepared" || status === "dispatched" || status === "accepted") {
      return parseProviderActionRefV1({ ...common, journalState: status, outcomeKind: null, outcomeDigest: null });
    }
    if (status === "ambiguous") {
      const result = value.result_json;
      if (typeof result !== "string") throw new Error("ambiguous launch action has no outcome");
      return parseProviderActionRefV1({
        ...common,
        journalState: "ambiguous",
        outcomeKind: "ambiguous",
        outcomeDigest: `sha256:${sha256(result)}`,
      });
    }
    if (status === "terminal") {
      const result = value.result_json;
      if (typeof result !== "string") throw new Error("terminal launch action has no outcome");
      let outcomeKind: "terminal-success" | "terminal-no-effect";
      try {
        const parsed = JSON.parse(result) as unknown;
        if (isRow(parsed) && parsed.kind === "core-pre-dispatch-no-effect") outcomeKind = "terminal-no-effect";
        else {
          const adapterOutcome = parseLaunchAdapterOutcomeV1(parsed);
          if (adapterOutcome.outcome.kind === "ambiguous") throw new Error("terminal action stored ambiguity");
          outcomeKind = adapterOutcome.outcome.kind;
        }
      } catch (error: unknown) {
        throw new Error("terminal launch outcome is invalid", { cause: error });
      }
      return parseProviderActionRefV1({
        ...common,
        journalState: "terminal",
        outcomeKind,
        outcomeDigest: `sha256:${sha256(result)}`,
      });
    }
    throw new Error(`launch provider action has invalid status ${status}`);
  }

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
    const prepared = this.#database.prepare(`
      SELECT c.*
        FROM project_session_launch_custody c
        JOIN provider_actions p
          ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
       WHERE p.status='prepared'
       ORDER BY c.project_session_id, c.custody_attempt_generation
    `).all().filter(isRow);
    for (const custody of prepared) {
      this.#database.transaction(() => this.#failPrepared(custody))();
      result.preparedFailed += 1;
      result.failed += 1;
    }

    const observable = this.#database.prepare(`
      SELECT c.*
        FROM project_session_launch_custody c
        JOIN provider_actions p
          ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
       WHERE p.status IN ('dispatched','accepted','ambiguous')
       ORDER BY c.project_session_id, c.custody_attempt_generation
    `).all().filter(isRow);
    for (const custody of observable) {
      const providerAdapterId = text(custody, "provider_adapter_id");
      const providerActionId = text(custody, "provider_action_id");
      const providerContractDigest = exactDigest(custody.provider_contract_digest, "custody provider contract digest");
      let contract: LaunchAdapterContract;
      try {
        contract = await this.#adapterContracts.inspect(providerAdapterId);
        if (`sha256:${sha256(canonicalJson(contract))}` !== providerContractDigest) {
          throw new Error("launch provider contract changed");
        }
      } catch (error: unknown) {
        const outcome = this.#ambiguousOutcome(
          custody,
          "conflict",
          jsonEvidenceDigest(error instanceof Error ? error.message : error),
        );
        const disposition = this.#database.transaction(() => this.#applyOutcome(custody, outcome))();
        result[disposition] += 1;
        continue;
      }
      let raw: unknown;
      try {
        raw = await this.#adapterEffects.lookup({ providerAdapterId, providerActionId, providerContractDigest });
      } catch (error: unknown) {
        raw = this.#ambiguousOutcome(
          custody,
          "adapter-error",
          jsonEvidenceDigest(error instanceof Error ? error.message : error),
        );
      }
      result.lookedUp += 1;
      const outcome = this.#normaliseOutcome(custody, raw, "lookup", contract);
      const disposition = this.#database.transaction(() => this.#applyOutcome(custody, outcome))();
      result[disposition] += 1;
    }
    return result;
  }

  #failPrepared(custody: Row): void {
    const adapterId = text(custody, "provider_adapter_id");
    const actionId = text(custody, "provider_action_id");
    const now = this.#clock();
    const proof = {
      schemaVersion: 1,
      kind: "core-pre-dispatch-no-effect",
      providerAdapterId: adapterId,
      providerActionId: actionId,
      observedAt: new Date(now).toISOString(),
      proof: { executionCount: 0, durableStatus: "prepared" },
    };
    const changed = this.#database.prepare(`
      UPDATE provider_actions
         SET status='terminal', history_json='["prepared","terminal"]',
             execution_count=0, effect_count=0, idempotency_proven=1,
             result_json=?, journal_revision=journal_revision+1, updated_at=?
       WHERE adapter_id=? AND action_id=? AND status='prepared'
    `).run(canonicalJson({ ...proof, digest: jsonEvidenceDigest(proof) }), now, adapterId, actionId);
    if (changed.changes !== 1) stale("prepared launch changed during recovery");
    this.#releaseReservation(text(custody, "reservation_id"));
    this.#terminaliseFailedLaunch(custody, now);
  }

  #normaliseOutcome(
    custody: Row,
    value: unknown,
    observationKind: "dispatch-return" | "lookup",
    contract: LaunchAdapterContract,
  ): LaunchAdapterOutcome {
    const raw = value;
    const conflict = (reason: LaunchAmbiguous["outcome"]["reasonCode"]): LaunchAmbiguous =>
      this.#ambiguousOutcome(custody, reason, jsonEvidenceDigest(raw), observationKind);
    try {
      value = parseLaunchAdapterOutcomeV1(value);
    } catch {
      return conflict("malformed");
    }
    try {
      const root = exactRecord(value, "launch_adapter_outcome_v1", [
        "schemaVersion", "providerAdapterId", "providerActionId", "providerContractDigest",
        "observationKind", "observedAt", "outcome",
      ]);
      if (
        root.schemaVersion !== 1 ||
        root.providerAdapterId !== text(custody, "provider_adapter_id") ||
        root.providerActionId !== text(custody, "provider_action_id") ||
        root.providerContractDigest !== text(custody, "provider_contract_digest") ||
        root.observationKind !== observationKind
      ) return conflict("conflict");
      const base: LaunchOutcomeBase = {
        schemaVersion: 1,
        providerAdapterId: text(custody, "provider_adapter_id"),
        providerActionId: text(custody, "provider_action_id"),
        providerContractDigest: exactDigest(custody.provider_contract_digest, "custody provider contract digest"),
        observationKind,
        observedAt: isoTimestamp(root.observedAt, "launch_adapter_outcome_v1.observedAt"),
      };
      const tagged = exactRecord(root.outcome, "launch_adapter_outcome_v1.outcome", ["kind"], [
        "providerSessionRef", "providerSessionGeneration", "effectDigest", "resourceUsage",
        "failureCode", "noEffectProof", "reasonCode", "evidenceDigest",
      ]);
      if (tagged.kind === "terminal-success") {
        const success = exactRecord(root.outcome, "launch_adapter_outcome_v1.outcome", [
          "kind", "providerSessionRef", "providerSessionGeneration", "effectDigest", "resourceUsage",
        ]);
        const reservation = row(this.#database.prepare(`
          SELECT amounts_json FROM resource_reservations WHERE reservation_id=?
        `).get(text(custody, "reservation_id")), "launch reservation");
        const expected = resourceAmounts(
          JSON.parse(text(reservation, "amounts_json")) as unknown,
          "launch reservation amounts",
        );
        if (!isRow(success.resourceUsage)) return conflict("conflict");
        if (canonicalJson(Object.keys(success.resourceUsage).sort()) !== canonicalJson(Object.keys(expected).sort())) {
          return conflict("conflict");
        }
        const resourceUsage: Record<string, number | "unknown"> = {};
        for (const [unit, usage] of Object.entries(success.resourceUsage)) {
          if (usage !== "unknown" && (typeof usage !== "number" || !Number.isSafeInteger(usage) || usage < 0)) {
            return conflict("conflict");
          }
          resourceUsage[unit] = usage;
        }
        return {
          ...base,
          outcome: {
            kind: "terminal-success",
            providerSessionRef: nonEmptyString(success.providerSessionRef, "launch outcome providerSessionRef"),
            providerSessionGeneration: positiveOutcomeInteger(success.providerSessionGeneration),
            effectDigest: exactDigest(success.effectDigest, "launch outcome effectDigest"),
            resourceUsage,
          },
        };
      }
      if (tagged.kind === "terminal-no-effect") {
        const failure = exactRecord(root.outcome, "launch_adapter_outcome_v1.outcome", [
          "kind", "failureCode", "noEffectProof",
        ]);
        const proof = exactRecord(failure.noEffectProof, "launch no-effect proof", ["schemaId", "proof", "digest"]);
        if (!isRow(proof.proof)) return conflict("conflict");
        const proofDigest = exactDigest(proof.digest, "launch no-effect proof digest");
        if (jsonEvidenceDigest(proof.proof) !== proofDigest) return conflict("conflict");
        const proofSchemaId = nonEmptyString(proof.schemaId, "launch no-effect proof schema");
        const proofSchema = contract.noEffectProofSchemas[proofSchemaId];
        if (proofSchema === undefined) return conflict("conflict");
        try {
          const validate = new Ajv2020({ allErrors: true, strict: true }).compile(proofSchema);
          if (!validate(proof.proof)) return conflict("conflict");
        } catch {
          return conflict("conflict");
        }
        return {
          ...base,
          outcome: {
            kind: "terminal-no-effect",
            failureCode: nonEmptyString(failure.failureCode, "launch failure code"),
            noEffectProof: {
              schemaId: proofSchemaId,
              proof: proof.proof,
              digest: proofDigest,
            },
          },
        };
      }
      if (tagged.kind === "ambiguous") {
        const ambiguous = exactRecord(root.outcome, "launch_adapter_outcome_v1.outcome", [
          "kind", "reasonCode", "evidenceDigest",
        ]);
        const reason = ambiguous.reasonCode;
        if (
          reason !== "absent" && reason !== "transport-error" && reason !== "adapter-error" &&
          reason !== "malformed" && reason !== "incomplete" && reason !== "conflict" &&
          reason !== "missing-resume-reference"
        ) {
          return conflict("conflict");
        }
        if (ambiguous.evidenceDigest !== null && (typeof ambiguous.evidenceDigest !== "string" || !DIGEST.test(ambiguous.evidenceDigest))) {
          return conflict("conflict");
        }
        return {
          ...base,
          outcome: {
            kind: "ambiguous",
            reasonCode: reason,
            evidenceDigest: ambiguous.evidenceDigest as Digest | null,
          },
        };
      }
      return conflict("conflict");
    } catch (error: unknown) {
      if (error instanceof ProjectFabricCoreError) return conflict("conflict");
      return conflict("malformed");
    }
  }

  #ambiguousOutcome(
    custody: Row,
    reasonCode: LaunchAmbiguous["outcome"]["reasonCode"],
    evidenceDigest: Digest | null,
    observationKind: "dispatch-return" | "lookup" = "lookup",
  ): LaunchAmbiguous {
    return {
      schemaVersion: 1,
      providerAdapterId: text(custody, "provider_adapter_id"),
      providerActionId: text(custody, "provider_action_id"),
      providerContractDigest: exactDigest(custody.provider_contract_digest, "custody provider contract digest"),
      observationKind,
      observedAt: new Date(this.#clock()).toISOString(),
      outcome: { kind: "ambiguous", reasonCode, evidenceDigest },
    };
  }

  #applyOutcome(
    custody: Row,
    outcome: LaunchAdapterOutcome,
  ): "activated" | "failed" | "ambiguous" | "recoveryRequired" {
    const now = this.#clock();
    const adapterId = text(custody, "provider_adapter_id");
    const actionId = text(custody, "provider_action_id");
    const serialized = canonicalJson(outcome);
    if (outcome.outcome.kind === "ambiguous") {
      this.#database.prepare(`
        UPDATE provider_actions
           SET status='ambiguous', history_json='["prepared","dispatched","ambiguous"]',
               result_json=?, journal_revision=journal_revision+1, updated_at=?
         WHERE adapter_id=? AND action_id=? AND status IN ('dispatched','accepted','ambiguous')
      `).run(serialized, now, adapterId, actionId);
      this.#database.prepare(`
        UPDATE project_sessions SET state='launch_ambiguous', revision=revision+1, updated_at=?
         WHERE project_session_id=? AND state='launching'
      `).run(now, text(custody, "project_session_id"));
      this.#database.prepare(`
        UPDATE runs SET lifecycle_state='launch_ambiguous', revision=revision+1
         WHERE run_id=? AND lifecycle_state='launching'
      `).run(text(custody, "coordination_run_id"));
      return "ambiguous";
    }
    if (outcome.outcome.kind === "terminal-no-effect") {
      this.#database.prepare(`
        UPDATE provider_actions
           SET status='terminal', history_json='["prepared","dispatched","terminal"]',
               result_json=?, idempotency_proven=1,
               journal_revision=journal_revision+1, updated_at=?
         WHERE adapter_id=? AND action_id=? AND status IN ('dispatched','accepted','ambiguous')
      `).run(serialized, now, adapterId, actionId);
      this.#releaseReservation(text(custody, "reservation_id"));
      this.#terminaliseFailedLaunch(custody, now);
      return "failed";
    }

    const settlement = this.#settleSuccessfulReservation(
      text(custody, "reservation_id"),
      outcome.outcome.resourceUsage,
    );
    this.#database.prepare(`
      UPDATE provider_actions
         SET status='terminal', history_json='["prepared","dispatched","accepted","terminal"]',
             effect_count=1, idempotency_proven=1, provider_session_generation=?,
             result_json=?, journal_revision=journal_revision+1, updated_at=?
       WHERE adapter_id=? AND action_id=? AND status IN ('dispatched','accepted','ambiguous')
    `).run(
      outcome.outcome.providerSessionGeneration,
      serialized,
      now,
      adapterId,
      actionId,
    );
    if (settlement === "overrun") {
      this.#database.prepare(`
        UPDATE project_sessions SET state='recovery_required', revision=revision+1, updated_at=?
         WHERE project_session_id=? AND state IN ('launching','launch_ambiguous')
      `).run(now, text(custody, "project_session_id"));
      this.#database.prepare(`
        UPDATE runs SET lifecycle_state='recovery_required', revision=revision+1
         WHERE run_id=? AND lifecycle_state IN ('launching','launch_ambiguous')
      `).run(text(custody, "coordination_run_id"));
      return "recoveryRequired";
    }
    this.#database.prepare(`
      UPDATE agents SET provider_session_ref=?, lifecycle='ready'
       WHERE run_id=? AND agent_id=?
    `).run(
      outcome.outcome.providerSessionRef,
      text(custody, "coordination_run_id"),
      text(custody, "chair_agent_id"),
    );
    this.#database.prepare(`
      INSERT INTO provider_state(
        run_id, agent_id, provider_session_generation, context_revision, reconciled_checkpoint_sha256
      ) VALUES (?, ?, ?, NULL, NULL)
      ON CONFLICT(run_id, agent_id) DO UPDATE SET
        provider_session_generation=excluded.provider_session_generation,
        context_revision=NULL,
        reconciled_checkpoint_sha256=NULL
    `).run(
      text(custody, "coordination_run_id"),
      text(custody, "chair_agent_id"),
      outcome.outcome.providerSessionGeneration,
    );
    this.#database.prepare(`
      UPDATE project_sessions SET state='active', revision=revision+1, updated_at=?
       WHERE project_session_id=? AND state IN ('launching','launch_ambiguous')
    `).run(now, text(custody, "project_session_id"));
    this.#database.prepare(`
      UPDATE runs SET lifecycle_state='active', revision=revision+1
       WHERE run_id=? AND lifecycle_state IN ('launching','launch_ambiguous')
    `).run(text(custody, "coordination_run_id"));
    this.#database.prepare(`
      UPDATE project_session_memberships
         SET state='reconciled', revision=revision+1, updated_at=?
       WHERE project_session_id=? AND coordination_run_id=?
         AND member_kind='provider-action' AND member_id=? AND state='active'
    `).run(
      now,
      text(custody, "project_session_id"),
      text(custody, "coordination_run_id"),
      actionId,
    );
    return "activated";
  }

  #terminaliseFailedLaunch(custody: Row, now: number): void {
    this.#database.prepare("UPDATE capabilities SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL")
      .run(now, text(custody, "capability_hash"));
    this.#database.prepare(`
      UPDATE run_chair_leases SET status='revoked', updated_at=?
       WHERE lease_id=? AND status IN ('active','frozen')
    `).run(now, text(custody, "chair_lease_id"));
    this.#database.prepare(`
      UPDATE agents SET lifecycle='suspended' WHERE run_id=? AND agent_id=?
    `).run(text(custody, "coordination_run_id"), text(custody, "chair_agent_id"));
    this.#database.prepare(`
      UPDATE project_sessions SET state='launch_failed', revision=revision+1, updated_at=?
       WHERE project_session_id=? AND state IN ('launching','launch_ambiguous')
    `).run(now, text(custody, "project_session_id"));
    this.#database.prepare(`
      UPDATE runs SET lifecycle_state='launch_failed', revision=revision+1
       WHERE run_id=? AND lifecycle_state IN ('launching','launch_ambiguous')
    `).run(text(custody, "coordination_run_id"));
    this.#database.prepare(`
      UPDATE project_session_memberships
         SET state='reconciled', revision=revision+1, updated_at=?
       WHERE project_session_id=? AND coordination_run_id=? AND state='active'
    `).run(now, text(custody, "project_session_id"), text(custody, "coordination_run_id"));
  }

  #releaseReservation(reservationId: string): void {
    const dimensions = this.#database.prepare(`
      SELECT scope_id, unit_key, amount, consumed, released
        FROM resource_reservation_dimensions WHERE reservation_id=?
    `).all(reservationId).filter(isRow);
    for (const dimension of dimensions) {
      const remainder = integer(dimension, "amount") - integer(dimension, "consumed") - integer(dimension, "released");
      const changed = this.#database.prepare(`
        UPDATE resource_dimensions SET reserved=reserved-?
         WHERE scope_id=? AND unit_key=? AND reserved>=?
      `).run(remainder, text(dimension, "scope_id"), text(dimension, "unit_key"), remainder);
      if (changed.changes !== 1) throw new Error("launch reservation release ledger changed");
      this.#database.prepare(`
        UPDATE resource_reservation_dimensions SET released=released+?
         WHERE reservation_id=? AND scope_id=? AND unit_key=?
      `).run(remainder, reservationId, text(dimension, "scope_id"), text(dimension, "unit_key"));
    }
    this.#database.prepare(`
      UPDATE resource_reservations SET state='released', revision=revision+1, updated_at=?
       WHERE reservation_id=?
    `).run(this.#clock(), reservationId);
  }

  #settleSuccessfulReservation(
    reservationId: string,
    usage: Readonly<Record<string, number | "unknown">>,
  ): "settled" | "overrun" {
    const reservation = row(this.#database.prepare(`
      SELECT amounts_json FROM resource_reservations WHERE reservation_id=?
    `).get(reservationId), "launch reservation");
    const amounts = JSON.parse(text(reservation, "amounts_json")) as Record<string, number>;
    if (Object.entries(usage).some(([unit, consumed]) => consumed !== "unknown" && consumed > (amounts[unit] ?? -1))) {
      return "overrun";
    }
    const dimensions = this.#database.prepare(`
      SELECT scope_id, unit_key, amount FROM resource_reservation_dimensions WHERE reservation_id=?
    `).all(reservationId).filter(isRow);
    for (const dimension of dimensions) {
      const unit = text(dimension, "unit_key");
      const amount = integer(dimension, "amount");
      const consumed = usage[unit];
      if (consumed === undefined) throw new Error("validated launch usage dimension is missing");
      if (consumed === "unknown") {
        const changed = this.#database.prepare(`
          UPDATE resource_dimensions SET reserved=reserved-?, usage_unknown=1
           WHERE scope_id=? AND unit_key=? AND reserved>=?
        `).run(amount, text(dimension, "scope_id"), unit, amount);
        if (changed.changes !== 1) throw new Error("launch unknown-usage ledger changed");
        this.#database.prepare(`
          UPDATE resource_reservation_dimensions SET usage_unknown=1
           WHERE reservation_id=? AND scope_id=? AND unit_key=?
        `).run(reservationId, text(dimension, "scope_id"), unit);
      } else {
        const changed = this.#database.prepare(`
          UPDATE resource_dimensions SET reserved=reserved-?, used=used+?
           WHERE scope_id=? AND unit_key=? AND reserved>=?
        `).run(amount, consumed, text(dimension, "scope_id"), unit, amount);
        if (changed.changes !== 1) throw new Error("launch usage ledger changed");
        this.#database.prepare(`
          UPDATE resource_reservation_dimensions SET consumed=?, released=?
           WHERE reservation_id=? AND scope_id=? AND unit_key=?
        `).run(consumed, amount - consumed, reservationId, text(dimension, "scope_id"), unit);
      }
    }
    this.#database.prepare(`
      UPDATE resource_reservations SET state='reconciled', revision=revision+1, updated_at=?
       WHERE reservation_id=?
    `).run(this.#clock(), reservationId);
    return "settled";
  }

  #isProvedNoEffect(value: Row): boolean {
    const serialized = value.result_json;
    if (typeof serialized !== "string") return false;
    try {
      const parsed = JSON.parse(serialized) as unknown;
      if (isRow(parsed) && parsed.kind === "core-pre-dispatch-no-effect") return true;
      return parseLaunchAdapterOutcomeV1(parsed).outcome.kind === "terminal-no-effect";
    } catch {
      return false;
    }
  }

  #revalidateInspection(inspection: LaunchInspection): void {
    const { intent } = inspection;
    const project = row(this.#database.prepare(`
      SELECT canonical_root, trust_record_digest, revision FROM projects WHERE project_id=?
    `).get(intent.projectId), "launch project");
    const session = row(this.#database.prepare(`
      SELECT revision, generation, state, budget_ref, launch_packet_path, launch_packet_digest
        FROM project_sessions WHERE project_session_id=? AND project_id=?
    `).get(intent.projectSessionId, intent.projectId), "launch session");
    if (
      integer(project, "revision") !== inspection.inspectedProjectRevision ||
      integer(session, "revision") !== inspection.inspectedSessionRevision ||
      integer(session, "generation") !== inspection.inspectedSessionGeneration ||
      project.trust_record_digest !== intent.trustRecordDigest ||
      text(session, "budget_ref") !== intent.budgetRef ||
      computeLaunchResourceStateDigest(this.#database, intent.projectId, intent.projectSessionId) !== intent.resourceStateDigest
    ) stale("launch binding changed after preview");
    if (text(project, "canonical_root") !== inspection.canonicalProjectRoot) stale("launch project root changed");
    readArtifact(inspection.canonicalProjectRoot, intent.launchPacketRef, "launch packet");
    readArtifact(inspection.canonicalProjectRoot, intent.resourcePlanRef, "launch resource plan");
    if (intent.retryOf === undefined) {
      if (text(session, "state") !== "awaiting_launch") stale("launch session state changed");
      assertSameArtifact(intent.launchPacketRef, parseArtifactRef({
        path: text(session, "launch_packet_path"),
        digest: exactDigest(session.launch_packet_digest, "stored launch packet digest"),
      }, "stored launch packet"), "stored launch packet");
    } else {
      if (text(session, "state") !== "launch_failed") stale("launch retry state changed");
      const failed = row(this.#database.prepare(`
        SELECT c.provider_adapter_id, c.provider_action_id, p.status,
               p.execution_count, p.effect_count, p.idempotency_proven, p.result_json
          FROM project_session_launch_custody c
          JOIN provider_actions p
            ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
         WHERE c.project_session_id=?
         ORDER BY c.custody_attempt_generation DESC LIMIT 1
      `).get(intent.projectSessionId), "failed launch custody");
      if (
        text(failed, "provider_adapter_id") !== intent.retryOf.providerAdapterId ||
        text(failed, "provider_action_id") !== intent.retryOf.providerActionId ||
        text(failed, "status") !== "terminal" ||
        integer(failed, "effect_count") !== 0 ||
        integer(failed, "idempotency_proven") !== 1 ||
        !this.#isProvedNoEffect(failed)
      ) stale("proved launch failure changed before retry commit");
    }
  }

  #ensureScopes(inspection: LaunchInspection, now: number): void {
    const { intent, packet, plan } = inspection;
    const definitions = [
      {
        scope: plan.scopes.project,
        kind: "project",
        parent: null,
        projectSessionId: null,
        runId: null,
        owner: intent.projectId,
      },
      {
        scope: plan.scopes.projectSession,
        kind: "project-session",
        parent: plan.scopes.project.scopeId,
        projectSessionId: intent.projectSessionId,
        runId: null,
        owner: intent.projectSessionId,
      },
      {
        scope: plan.scopes.coordinationRun,
        kind: "coordination-run",
        parent: plan.scopes.projectSession.scopeId,
        projectSessionId: intent.projectSessionId,
        runId: packet.runId,
        owner: packet.runId,
      },
    ] as const;
    for (const definition of definitions) {
      const existing = this.#database.prepare(`
        SELECT project_id, project_session_id, coordination_run_id, parent_scope_id,
               scope_kind, owner_ref, state
          FROM resource_scopes WHERE scope_id=?
      `).get(definition.scope.scopeId);
      if (isRow(existing)) {
        const limits = Object.fromEntries(this.#database.prepare(`
          SELECT unit_key, limit_value FROM resource_dimensions WHERE scope_id=? ORDER BY unit_key
        `).all(definition.scope.scopeId).filter(isRow).map((dimension) => [
          text(dimension, "unit_key"),
          integer(dimension, "limit_value"),
        ]));
        if (
          text(existing, "project_id") !== intent.projectId ||
          existing.project_session_id !== definition.projectSessionId ||
          existing.coordination_run_id !== definition.runId ||
          existing.parent_scope_id !== definition.parent ||
          text(existing, "scope_kind") !== definition.kind ||
          text(existing, "owner_ref") !== definition.owner ||
          text(existing, "state") !== "active" ||
          !sameAmounts(limits, definition.scope.limits)
        ) {
          throw new ProjectFabricCoreError("CONFLICT", `${definition.kind} resource scope changed before retry`);
        }
        continue;
      }
      this.#database.prepare(`
        INSERT INTO resource_scopes(
          scope_id, project_id, project_session_id, coordination_run_id,
          parent_scope_id, scope_kind, owner_ref, state, revision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1)
      `).run(
        definition.scope.scopeId,
        intent.projectId,
        definition.projectSessionId,
        definition.runId,
        definition.parent,
        definition.kind,
        definition.owner,
      );
      const insertDimension = this.#database.prepare(`
        INSERT INTO resource_dimensions(scope_id, unit_key, limit_value, used, reserved, usage_unknown)
        VALUES (?, ?, ?, 0, 0, 0)
      `);
      for (const [unit, limit] of Object.entries(definition.scope.limits)) {
        insertDimension.run(definition.scope.scopeId, unit, limit);
      }
    }
    void now;
  }

  #reserve(inspection: LaunchInspection, reservationId: string, now: number): void {
    const { intent, packet, plan } = inspection;
    const path = [
      { scopeId: plan.scopes.project.scopeId, kind: "project", projectId: intent.projectId },
      { scopeId: plan.scopes.projectSession.scopeId, kind: "project-session", projectSessionId: intent.projectSessionId },
      { scopeId: plan.scopes.coordinationRun.scopeId, kind: "coordination-run", coordinationRunId: packet.runId },
    ];
    for (const scope of path) {
      for (const [unit, amount] of Object.entries(plan.launchReservation.amounts)) {
        const changed = this.#database.prepare(`
          UPDATE resource_dimensions
             SET reserved=reserved+?
           WHERE scope_id=? AND unit_key=? AND usage_unknown=0
             AND limit_value-used-reserved>=?
        `).run(amount, scope.scopeId, unit, amount);
        if (changed.changes !== 1) {
          throw new ProjectFabricCoreError("RESOURCE_EXHAUSTED", `${unit} changed during launch admission`);
        }
      }
    }
    this.#database.prepare(`
      INSERT INTO resource_reservations(
        reservation_id, project_session_id, coordination_run_id, leaf_scope_id,
        operation_id, actor_agent_id, state, revision, generation, identity_hash,
        path_json, amounts_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'reserved', 1, 1, ?, ?, ?, ?, ?)
    `).run(
      reservationId,
      intent.projectSessionId,
      packet.runId,
      plan.scopes.coordinationRun.scopeId,
      intent.providerActionId,
      packet.chairAgentId,
      sha256(canonicalJson({ reservationId, path, amounts: plan.launchReservation.amounts })),
      canonicalJson(path),
      canonicalJson(plan.launchReservation.amounts),
      now,
      now,
    );
    const insert = this.#database.prepare(`
      INSERT INTO resource_reservation_dimensions(
        reservation_id, scope_id, unit_key, amount, consumed, released, usage_unknown
      ) VALUES (?, ?, ?, ?, 0, 0, 0)
    `);
    for (const scope of path) {
      for (const [unit, amount] of Object.entries(plan.launchReservation.amounts)) {
        insert.run(reservationId, scope.scopeId, unit, amount);
      }
    }
  }
}

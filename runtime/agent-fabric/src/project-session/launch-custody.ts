import type { ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import type Database from "better-sqlite3";
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { expandAuthorityActions } from "../domain/operations.js";
import { ProjectFabricCoreError } from "./contracts.js";
import { canonicalJson, integer, isRow, row, sha256, text, type Row } from "./store-support.js";

type Digest = `sha256:${string}`;
type ArtifactBinding = Readonly<{ path: string; digest: Digest }>;
type ResourceAmounts = Readonly<Record<string, number>>;

export type LaunchCustodyIntent = Readonly<{
  kind: "project-session-launch";
  projectId: string;
  projectSessionId: string;
  expectedProjectRevision: number;
  expectedSessionRevision: number;
  expectedSessionGeneration: number;
  trustRecordDigest: Digest;
  launchPacketRef: ArtifactBinding;
  authorityRef: Digest;
  budgetRef: string;
  resourcePlanRef: ArtifactBinding;
  providerAdapterId: string;
  providerActionId: string;
  providerContractDigest: Digest;
  resourceStateDigest: Digest;
  retryOf?: Readonly<{ providerAdapterId: string; providerActionId: string }>;
}>;

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
  return {
    path: safeRelativePath(nonEmptyString(record.path, `${label}.path`), `${label}.path`),
    digest: exactDigest(record.digest, `${label}.digest`),
  };
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
  const packet = exactRecord(value, "launch_packet_v1", [
    "schema_version", "project_id", "project_session_id", "run_id", "chair_agent_id",
    "project_run_directory", "topology_mode", "budget_ref", "resource_plan_ref", "chair_authority", "provider",
  ]);
  if (packet.schema_version !== 1) protocol("launch_packet_v1.schema_version must be 1");
  const topology = nonEmptyString(packet.topology_mode, "launch_packet_v1.topology_mode");
  if (topology !== "coordinated" && topology !== "independent") protocol("launch_packet_v1.topology_mode is invalid");
  const provider = exactRecord(packet.provider, "launch_packet_v1.provider", [
    "adapter_id", "action_id", "contract_digest", "input_schema_id", "input",
  ]);
  if (!isRow(provider.input)) protocol("launch_packet_v1.provider.input must be an object");
  const projectRunDirectory = safeRelativePath(
    nonEmptyString(packet.project_run_directory, "launch_packet_v1.project_run_directory"),
    "launch_packet_v1.project_run_directory",
  );
  resolveAuthorityPath(projectRoot, projectRunDirectory, "launch_packet_v1.project_run_directory");
  return {
    schemaVersion: 1,
    projectId: nonEmptyString(packet.project_id, "launch_packet_v1.project_id"),
    projectSessionId: nonEmptyString(packet.project_session_id, "launch_packet_v1.project_session_id"),
    runId: nonEmptyString(packet.run_id, "launch_packet_v1.run_id"),
    chairAgentId: nonEmptyString(packet.chair_agent_id, "launch_packet_v1.chair_agent_id"),
    projectRunDirectory,
    topologyMode: topology,
    budgetRef: nonEmptyString(packet.budget_ref, "launch_packet_v1.budget_ref"),
    resourcePlanRef: exactArtifact(packet.resource_plan_ref, "launch_packet_v1.resource_plan_ref"),
    chairAuthority: normaliseLaunchChairAuthority(packet.chair_authority, projectRoot),
    provider: {
      adapterId: nonEmptyString(provider.adapter_id, "launch_packet_v1.provider.adapter_id"),
      actionId: nonEmptyString(provider.action_id, "launch_packet_v1.provider.action_id"),
      contractDigest: exactDigest(provider.contract_digest, "launch_packet_v1.provider.contract_digest"),
      inputSchemaId: nonEmptyString(provider.input_schema_id, "launch_packet_v1.provider.input_schema_id"),
      input: provider.input,
    },
  };
}

function scope(value: unknown, label: string): { scopeId: string; limits: ResourceAmounts } {
  const record = exactRecord(value, label, ["scope_id", "limits"]);
  return {
    scopeId: nonEmptyString(record.scope_id, `${label}.scope_id`),
    limits: resourceAmounts(record.limits, `${label}.limits`),
  };
}

function parsePlan(value: unknown): LaunchResourcePlan {
  const plan = exactRecord(value, "launch_resource_plan_v1", [
    "schema_version", "project_id", "project_session_id", "run_id", "budget_ref", "scopes", "launch_reservation",
  ]);
  if (plan.schema_version !== 1) protocol("launch_resource_plan_v1.schema_version must be 1");
  const scopes = exactRecord(plan.scopes, "launch_resource_plan_v1.scopes", [
    "project", "project_session", "coordination_run",
  ]);
  const reservation = exactRecord(plan.launch_reservation, "launch_resource_plan_v1.launch_reservation", ["amounts"]);
  const project = scope(scopes.project, "launch_resource_plan_v1.scopes.project");
  const projectSession = scope(scopes.project_session, "launch_resource_plan_v1.scopes.project_session");
  const coordinationRun = scope(scopes.coordination_run, "launch_resource_plan_v1.scopes.coordination_run");
  assertNarrowing(project.limits, projectSession.limits, "project-session scope");
  assertNarrowing(projectSession.limits, coordinationRun.limits, "coordination-run scope");
  const amounts = resourceAmounts(reservation.amounts, "launch_resource_plan_v1.launch_reservation.amounts");
  assertNarrowing(coordinationRun.limits, amounts, "launch reservation");
  return {
    schemaVersion: 1,
    projectId: nonEmptyString(plan.project_id, "launch_resource_plan_v1.project_id"),
    projectSessionId: nonEmptyString(plan.project_session_id, "launch_resource_plan_v1.project_session_id"),
    runId: nonEmptyString(plan.run_id, "launch_resource_plan_v1.run_id"),
    budgetRef: nonEmptyString(plan.budget_ref, "launch_resource_plan_v1.budget_ref"),
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
  return `sha256:${sha256(canonicalJson({ scopes, reservations }))}`;
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
    if (intent.retryOf === undefined) {
      assertSameArtifact(intent.launchPacketRef, {
        path: text(session, "launch_packet_path"),
        digest: exactDigest(session.launch_packet_digest, "stored launch packet digest"),
      }, "stored launch packet");
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

  async dispatchPrepared(handle: LaunchDispatchHandle): Promise<unknown> {
    const key = `${handle.providerAdapterId}\0${handle.providerActionId}`;
    if (this.#consumedHandles.has(key)) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "launch handoff is one-use");
    }
    const changed = this.#database.prepare(`
      UPDATE provider_actions
         SET status='dispatched', history_json='["prepared","dispatched"]',
             execution_count=1, updated_at=?
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
    return await this.#adapterEffects.dispatch(handle);
  }

  async lookup(input: Readonly<{
    providerAdapterId: string;
    providerActionId: string;
    providerContractDigest: Digest;
  }>): Promise<unknown> {
    return await this.#adapterEffects.lookup(input);
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
      assertSameArtifact(intent.launchPacketRef, {
        path: text(session, "launch_packet_path"),
        digest: exactDigest(session.launch_packet_digest, "stored launch packet digest"),
      }, "stored launch packet");
    } else if (text(session, "state") !== "launch_failed") {
      stale("launch retry state changed");
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

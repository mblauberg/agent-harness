import type { ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { createHash, randomBytes } from "node:crypto";
import {
  parseLaunchAdapterOutcomeV1,
  parseLaunchPacketV1,
  parseLaunchResourcePlanV1,
  parseProjectSessionLaunchCurrentState,
  parseArtifactRef,
  parseLaunchProviderActionJournalRefV1,
  parseOperationResult,
  parseAuthorityEnvelopeV2,
  FABRIC_OPERATIONS,
  type AgentCustodyResult,
  type AuthorityEnvelopeV2,
  type ChairBridgeRecoveryIntent,
  type ChairLiveHandoffIntent,
  type ProjectSessionLaunchCurrentState,
  type ProjectSessionLaunchIntent,
  type LaunchProviderActionJournalRefV1,
  type ArtifactRef,
  type Sha256Digest,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  parseChairLaunchProviderResult,
  type ChairLaunchProviderResult,
} from "../adapters/providers/types.js";
import { readStoredAuthority } from "../authority/stored-authority.js";
import { ProjectFabricCoreError, type AuthenticatedOperatorContext } from "./contracts.js";
import { supersedeFinalAcceptanceGates } from "./acceptance-cycle.js";
import { retireProjectSessionBridges } from "./bridge-retirement.js";
import { canonicalJson, integer, isRow, row, sha256, text, type Row } from "./store-support.js";
import {
  ProviderActionAdmissionCoordinator,
  type ProviderActionTicket,
} from "../application/provider-action-admission.js";

type Digest = Sha256Digest;
type ArtifactBinding = ArtifactRef;
type ResourceAmounts = Readonly<Record<string, number>>;
type ChairRecoveryIntentPath = ChairBridgeRecoveryIntent["path"];

const CLOSED_PREFLIGHT_FAILURE_CODES = new Set([
  "ACTION_INPUT_CONFLICT",
  "CAPABILITY_EXPIRED",
  "CAPABILITY_FORBIDDEN",
  "DEDUPE_CONFLICT",
  "PROTOCOL_INVALID",
  "WRONG_PROJECT",
]);

function isDeterministicClosedPreflightFailure(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (current === null || typeof current !== "object") return false;
    const record = current as { code?: unknown; cause?: unknown };
    if (typeof record.code === "string") return CLOSED_PREFLIGHT_FAILURE_CODES.has(record.code);
    if (record.cause === undefined || record.cause === current) return false;
    current = record.cause;
  }
  return false;
}

export type LaunchCustodyIntent = ProjectSessionLaunchIntent;

export type NormalisedLaunchAuthority = AuthorityEnvelopeV2;

export type LaunchAdapterContract = Readonly<{
  schemaVersion: 1;
  method: "launch_chair";
  oneUse: true;
  secretTransport: "private-environment";
  environment: Readonly<{
    capability: "AGENT_FABRIC_CAPABILITY";
    socketPath: "AGENT_FABRIC_SOCKET_PATH";
    attestationChallenge: "AGENT_FABRIC_ATTESTATION_CHALLENGE";
  }>;
  inputSchemaId: string;
  publicPayloadSchema: Record<string, unknown>;
  noEffectProofSchemas: Readonly<Record<string, Record<string, unknown>>>;
  attestation: Readonly<{
    method: "provider-session-random-challenge-v1";
    bridgeContract: "agent-fabric-session-bridge-v1";
    origin: "provider-session-tool-call";
    oneUse: true;
    bridgeLifetime: "provider-session";
    digestAlgorithm: "sha256";
    nativeAttribution:
      | "claude-sdk-assistant-request-tool-use-v1"
      | "codex-app-server-thread-turn-call-v1";
  }>;
}>;

export function parseLaunchAdapterContract(value: unknown): LaunchAdapterContract {
  const contract = exactRecord(value, "chairLaunch", [
    "schemaVersion", "method", "oneUse", "secretTransport", "environment",
    "inputSchemaId", "publicPayloadSchema", "noEffectProofSchemas", "attestation",
  ]);
  if (
    contract.schemaVersion !== 1 ||
    contract.method !== "launch_chair" ||
    contract.oneUse !== true ||
    contract.secretTransport !== "private-environment"
  ) protocol("chairLaunch contract version or private handoff semantics are invalid");
  const environment = exactRecord(contract.environment, "chairLaunch.environment", [
    "capability", "socketPath", "attestationChallenge",
  ]);
  if (
    environment.capability !== "AGENT_FABRIC_CAPABILITY" ||
    environment.socketPath !== "AGENT_FABRIC_SOCKET_PATH" ||
    environment.attestationChallenge !== "AGENT_FABRIC_ATTESTATION_CHALLENGE"
  ) protocol("chairLaunch environment contract is invalid");
  if (!isRow(contract.publicPayloadSchema)) protocol("chairLaunch public payload schema must be an object");
  if (!isRow(contract.noEffectProofSchemas)) protocol("chairLaunch no-effect proof schemas must be an object");
  const noEffectProofSchemas: Record<string, Record<string, unknown>> = {};
  for (const [schemaId, schema] of Object.entries(contract.noEffectProofSchemas)) {
    nonEmptyString(schemaId, "chairLaunch no-effect proof schema ID");
    if (!isRow(schema)) protocol(`chairLaunch no-effect proof schema ${schemaId} must be an object`);
    noEffectProofSchemas[schemaId] = schema;
  }
  const attestation = exactRecord(contract.attestation, "chairLaunch.attestation", [
    "method", "bridgeContract", "origin", "oneUse", "bridgeLifetime", "digestAlgorithm", "nativeAttribution",
  ]);
  if (
    attestation.method !== "provider-session-random-challenge-v1" ||
    attestation.bridgeContract !== "agent-fabric-session-bridge-v1" ||
    attestation.origin !== "provider-session-tool-call" ||
    attestation.oneUse !== true ||
    attestation.bridgeLifetime !== "provider-session" ||
    attestation.digestAlgorithm !== "sha256" ||
    (
      attestation.nativeAttribution !== "claude-sdk-assistant-request-tool-use-v1" &&
      attestation.nativeAttribution !== "codex-app-server-thread-turn-call-v1"
    )
  ) protocol("chairLaunch attestation contract is invalid");
  return {
    schemaVersion: 1,
    method: "launch_chair",
    oneUse: true,
    secretTransport: "private-environment",
    environment: {
      capability: "AGENT_FABRIC_CAPABILITY",
      socketPath: "AGENT_FABRIC_SOCKET_PATH",
      attestationChallenge: "AGENT_FABRIC_ATTESTATION_CHALLENGE",
    },
    inputSchemaId: nonEmptyString(contract.inputSchemaId, "chairLaunch.inputSchemaId"),
    publicPayloadSchema: contract.publicPayloadSchema,
    noEffectProofSchemas,
    attestation: {
      method: "provider-session-random-challenge-v1",
      bridgeContract: "agent-fabric-session-bridge-v1",
      origin: "provider-session-tool-call",
      oneUse: true,
      bridgeLifetime: "provider-session",
      digestAlgorithm: "sha256",
      nativeAttribution: attestation.nativeAttribution,
    },
  };
}

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
  attestationChallenge: string;
  attestationChallengeDigest: Digest;
  expectedPrincipal: Readonly<{
    agentId: string;
    projectSessionId: string;
    runId: string;
    principalGeneration: number;
  }>;
}>;

export type RetainedChairBridge = Readonly<{
  projectSessionId: string;
  runId: string;
  agentId: string;
  principalGeneration: number;
  adapterId: string;
  actionId: string;
  providerSessionRef: string;
  providerSessionGeneration: number;
  bridgeGeneration: number;
}>;

export type ChairBridgeLossObservation = RetainedChairBridge & Readonly<{ reason: string }>;

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

export type ChairRecoveryInspection = Readonly<{
  intent: ChairBridgeRecoveryIntent;
  inspectionDigest: Digest;
}>;

export type ChairRecoveryDispatchHandle = Readonly<{
  schemaVersion: 1;
  recoveryId: string;
  intent: ChairBridgeRecoveryIntent;
  intentDigest: Digest;
  inspectionDigest: Digest;
  operatorId: string;
  operatorCommandId: string;
  capability?: string;
  attestationChallenge?: string;
  socketPath?: string;
}>;

export type ChairRecoveryCommit = Readonly<{
  status: "committed" | "ambiguous" | "pending" | "no-effect";
  recoveryId: string;
  path: ChairBridgeRecoveryIntent["path"];
  evidenceDigest: Digest;
}>;

export type ChairRecoveryCurrentState = Readonly<{
  revision: number;
  inspectionDigest: Digest;
}>;

export type ChairLiveHandoffInspection = Readonly<{
  intent: ChairLiveHandoffIntent;
  inspectionDigest: Digest;
}>;

export type ChairLiveHandoffDispatchHandle = Readonly<{
  schemaVersion: 1;
  custodyId: string;
  promotionActionId: string;
  intent: ChairLiveHandoffIntent;
  intentDigest: Digest;
  inspectionDigest: Digest;
  operatorId: string;
  operatorCommandId: string;
}>;

export type ChairLiveHandoffCommit = Readonly<{
  status: "committed" | "ambiguous" | "pending" | "no-effect";
  custodyId: string;
  evidenceDigest: Digest;
}>;

export type ChairLiveHandoffCurrentState = Readonly<{
  revision: number;
  inspectionDigest: Digest;
}>;

type LaunchCustodyServiceOptions = Readonly<{
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
  adapterEffects: {
    dispatch(handle: LaunchDispatchHandle): Promise<unknown>;
    lookup(input: Readonly<{
      providerAdapterId: string;
      providerActionId: string;
      providerContractDigest: Digest;
      attestationChallengeDigest: Digest;
    }>): Promise<unknown>;
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
  };
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

export type AgentBridgeContract = Readonly<{
  schemaVersion: 1;
  method: "provision_agent";
  operations: readonly ("spawn" | "attach")[];
  secretTransport: "private-handoff";
  bridgeContract: "agent-fabric-session-bridge-v1";
  generationBound: true;
  providerOriginatedActivation: true;
}>;

export type AgentCustodyInput = Readonly<{
  runId: string;
  actorAgentId: string;
  operation: "spawn" | "attach";
  agentId: string;
  authorityId: string;
  adapterId: string;
  actionId: string;
  payload: Record<string, unknown>;
  providerSessionRef?: string;
  bridgeContract?: AgentBridgeContract;
}>;

export type AgentDispatchHandle = Readonly<{
  schemaVersion: 1;
  runId: string;
  operation: "spawn" | "attach";
  actorAgentId: string;
  targetAgentId: string;
  authorityId: string;
  adapterId: string;
  actionId: string;
  publicPayload: Record<string, unknown>;
  requestedProviderSessionRef?: string;
  bridgeCapable: boolean;
  bridgeContractDigest: Digest;
  bridgeGeneration: number;
  capability?: string;
  socketPath?: string;
  expectedPrincipal?: Readonly<{
    agentId: string;
    projectSessionId: string;
    runId: string;
    principalGeneration: number;
  }>;
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
  const parsed = parseAuthorityEnvelopeV2(value, "chair_authority");
  const canonicalPaths = (paths: readonly string[], label: string): string[] => {
    return [...new Set(paths.map((path) => {
      const absolute = resolveAuthorityPath(root, path, label);
      const relativePath = relative(root, absolute);
      return relativePath === "" ? "." : relativePath.split(sep).join("/");
    }))].sort();
  };
  const workspaceRoots = canonicalPaths(parsed.workspaceRoots, "chair_authority.workspaceRoots");
  const sourcePaths = canonicalPaths(parsed.sourcePaths, "chair_authority.sourcePaths");
  const artifactPaths = canonicalPaths(parsed.artifactPaths, "chair_authority.artifactPaths");
  if (
    sourcePaths.some((path) => !workspaceRoots.some((workspace) => contained(workspace, path))) ||
    artifactPaths.some((path) => !workspaceRoots.some((workspace) => contained(workspace, path)))
  ) forbidden("chair authority source or artifact path escapes its workspace roots");
  const expires = Date.parse(parsed.expiresAt);
  if (!Number.isFinite(expires)) protocol("chair_authority.expiresAt must be an ISO timestamp");
  const disclosure = parsed.disclosure.level === "scoped"
    ? { level: "scoped" as const, scopes: [...parsed.disclosure.scopes].sort() }
    : parsed.disclosure;
  return {
    schemaVersion: 2,
    approval: { ...parsed.approval },
    workspaceRoots,
    sourcePaths,
    artifactPaths,
    actions: [...parsed.actions].sort(),
    deniedPaths: canonicalPaths(parsed.deniedPaths, "chair_authority.deniedPaths"),
    deniedActions: [...parsed.deniedActions].sort(),
    prohibitedActions: [...parsed.prohibitedActions].sort(),
    disclosure,
    secrets: parsed.secrets.access === "none"
      ? { access: "none" }
      : { access: "use-without-disclosure", references: [...parsed.secrets.references].sort() },
    deployment: parsed.deployment.allowed
      ? { allowed: true, targets: [...parsed.deployment.targets].sort() }
      : { allowed: false },
    irreversibleActions: parsed.irreversibleActions.allowed
      ? { allowed: true, actionIds: [...parsed.irreversibleActions.actionIds].sort() }
      : { allowed: false },
    network: parsed.network.toolEgress === "none"
      ? { toolEgress: "none" }
      : { toolEgress: "allowlist", allowedHosts: [...parsed.network.allowedHosts].sort() },
    expiresAt: new Date(expires).toISOString(),
    budget: resourceAmounts(parsed.budget, "chair_authority.budget", true),
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
  readonly #providerActionAdmission: ProviderActionAdmissionCoordinator;
  readonly #clock: () => number;
  readonly #fault: (label: string) => void;
  readonly #randomCapability: () => string;
  readonly #randomAttestationChallenge: () => string;
  readonly #fabricSocketPath: string;
  readonly #adapterContracts: LaunchCustodyServiceOptions["adapterContracts"];
  readonly #adapterEffects: LaunchCustodyServiceOptions["adapterEffects"];
  readonly #agentEffects: LaunchCustodyServiceOptions["agentEffects"];
  readonly #retireVolatileProjectSession: ((projectSessionId: string) => void) | undefined;
  readonly #retireVolatileChairBridge: ((entry: RetainedChairBridge) => void) | undefined;
  readonly #daemonInstanceGeneration: () => number;
  readonly #consumedHandles = new Set<string>();
  readonly #consumedAgentHandles = new Set<string>();
  readonly #agentInFlight = new Map<string, Promise<AgentCustodyResult>>();

  constructor(options: LaunchCustodyServiceOptions) {
    this.#database = options.database;
    this.#providerActionAdmission = options.providerActionAdmission;
    this.#clock = options.clock ?? Date.now;
    this.#fault = options.fault ?? (() => undefined);
    this.#randomCapability = options.randomCapability;
    this.#randomAttestationChallenge = options.randomAttestationChallenge ?? (() => randomBytes(32).toString("hex"));
    this.#fabricSocketPath = options.fabricSocketPath;
    this.#adapterContracts = options.adapterContracts;
    this.#adapterEffects = options.adapterEffects;
    this.#agentEffects = options.agentEffects;
    this.#retireVolatileProjectSession = options.retireVolatileProjectSession;
    this.#retireVolatileChairBridge = options.retireVolatileChairBridge;
    this.#daemonInstanceGeneration = options.daemonInstanceGeneration ?? (() => 1);
    if (!isAbsolute(this.#fabricSocketPath)) throw new TypeError("Fabric socket path must be absolute");
  }

  releaseProviderActionPreflightAfterRollback(ticket: ProviderActionTicket, failure: unknown): void {
    if (ticket.disposition !== "resolving" || ticket.scope.kind !== "run-action") return;
    if (!isDeterministicClosedPreflightFailure(failure)) return;
    const actionExists = this.#database.prepare(`
      SELECT 1 FROM provider_actions WHERE run_id=? AND adapter_id=? AND action_id=?
    `).get(ticket.scope.runId, ticket.actionRef.adapterId, ticket.actionRef.actionId) !== undefined;
    if (actionExists) return;
    try {
      this.#providerActionAdmission.release(ticket, failure);
    } catch {
      // The outer preparation failure remains authoritative if release races.
    }
  }

  observeChairBridgeLoss(input: ChairBridgeLossObservation): boolean {
    return this.#database.transaction(() => this.#persistChairBridgeLoss(input))();
  }

  async readChairLiveHandoffCurrentState(
    intent: ChairLiveHandoffIntent,
  ): Promise<ChairLiveHandoffCurrentState> {
    return {
      revision: intent.expectedBridgeRevision,
      inspectionDigest: this.#chairLiveHandoffInspectionDigest(intent),
    };
  }

  async inspectChairLiveHandoff(intent: ChairLiveHandoffIntent): Promise<ChairLiveHandoffInspection> {
    const inspectionDigest = this.#chairLiveHandoffInspectionDigest(intent);
    const contract = await this.#adapterContracts.inspect(intent.providerAdapterId);
    if (`sha256:${sha256(canonicalJson(contract))}` !== intent.providerContractDigest) {
      throw new ProjectFabricCoreError("STALE_REVISION", "chair live handoff provider contract changed");
    }
    return { intent, inspectionDigest };
  }

  preflightChairLiveHandoff(input: Readonly<{
    inspection: ChairLiveHandoffInspection;
    operatorCommandId: string;
    principal: AuthenticatedOperatorContext;
  }>): ProviderActionTicket {
    const intentDigest = jsonEvidenceDigest(input.inspection.intent);
    const custodyId = `chair-live-handoff:${sha256(canonicalJson({
      intentDigest,
      operatorId: input.principal.operatorId,
      operatorCommandId: input.operatorCommandId,
    }))}`;
    const promotionActionId = `chair-promotion:${sha256(custodyId)}`;
    return this.#providerActionAdmission.preflight({
      actionRef: {
        adapterId: input.inspection.intent.providerAdapterId,
        actionId: promotionActionId,
      },
      scope: {
        kind: "run-action",
        runId: input.inspection.intent.coordinationRunId,
      },
      principal: input.principal,
      canonicalInput: {
        schemaVersion: 1,
        operation: "promote_retained_bridge",
        intent: input.inspection.intent,
      },
    });
  }

  prepareChairLiveHandoffInTransaction(input: Readonly<{
    inspection: ChairLiveHandoffInspection;
    operatorId: string;
    operatorCommandId: string;
    providerActionTicket: ProviderActionTicket;
  }>): ChairLiveHandoffDispatchHandle {
    const { intent } = input.inspection;
    if (this.#chairLiveHandoffInspectionDigest(intent) !== input.inspection.inspectionDigest) {
      stale("chair live handoff changed after inspection");
    }
    const intentDigest = jsonEvidenceDigest(intent);
    const custodyId = `chair-live-handoff:${sha256(canonicalJson({
      intentDigest,
      operatorId: input.operatorId,
      operatorCommandId: input.operatorCommandId,
    }))}`;
    const promotionActionId = `chair-promotion:${sha256(custodyId)}`;
    const existing = this.#database.prepare(`
      SELECT intent_digest, custody_id, promotion_action_id FROM chair_live_handoff_custody
       WHERE operator_id=? AND operator_command_id=?
    `).get(input.operatorId, input.operatorCommandId);
    if (isRow(existing)) {
      if (text(existing, "intent_digest") !== intentDigest) {
        throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "chair live handoff command was reused with changed intent");
      }
      return {
        schemaVersion: 1,
        custodyId: text(existing, "custody_id"),
        promotionActionId: text(existing, "promotion_action_id"),
        intent,
        intentDigest,
        inspectionDigest: input.inspection.inspectionDigest,
        operatorId: input.operatorId,
        operatorCommandId: input.operatorCommandId,
      };
    }
    const successor = this.#chairLiveHandoffSuccessor(intent);
    const now = this.#clock();
    this.#database.prepare(`
      INSERT INTO chair_live_handoff_custody(
        custody_id, operator_id, operator_command_id, project_session_id, coordination_run_id,
        intent_digest, intent_json, handoff_path, handoff_digest, predecessor_agent_id,
        successor_agent_id, successor_authority_id, successor_authority_digest,
        expected_session_revision, expected_session_generation, expected_membership_revision,
        expected_run_revision, expected_chair_generation, expected_chair_lease_id,
        expected_bridge_revision, expected_chair_bridge_generation,
        expected_predecessor_principal_generation, expected_successor_principal_generation,
        expected_successor_bridge_revision, expected_successor_bridge_generation,
        provider_adapter_id, provider_contract_digest, source_provider_action_id,
        promotion_action_id, provider_session_ref, provider_session_generation,
        new_bridge_generation, state, result_json, revision, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        'prepared', NULL, 1, ?, ?
      )
    `).run(
      custodyId,
      input.operatorId,
      input.operatorCommandId,
      intent.projectSessionId,
      intent.coordinationRunId,
      intentDigest,
      canonicalJson(intent),
      intent.handoffRef.path,
      intent.handoffRef.digest,
      intent.predecessorAgentId,
      intent.successorAgentId,
      intent.successorAuthorityId,
      intent.successorAuthorityDigest,
      intent.expectedSessionRevision,
      intent.expectedSessionGeneration,
      intent.expectedMembershipRevision,
      intent.expectedRunRevision,
      intent.expectedChairGeneration,
      intent.expectedChairLeaseId,
      intent.expectedBridgeRevision,
      intent.expectedChairBridgeGeneration,
      intent.expectedPredecessorPrincipalGeneration,
      intent.expectedSuccessorPrincipalGeneration,
      intent.expectedSuccessorBridgeRevision,
      intent.expectedSuccessorBridgeGeneration,
      intent.providerAdapterId,
      intent.providerContractDigest,
      text(successor, "action_id"),
      promotionActionId,
      text(successor, "provider_session_ref"),
      integer(successor, "provider_session_generation"),
      Math.max(intent.expectedChairBridgeGeneration, intent.expectedSuccessorBridgeGeneration) + 1,
      now,
      now,
    );
    const payload = {
      schemaVersion: 1,
      custodyId,
      handoffRef: intent.handoffRef,
      predecessorAgentId: intent.predecessorAgentId,
      successorAgentId: intent.successorAgentId,
      sourceActionId: text(successor, "action_id"),
      promotionActionId,
    };
    const promotionPayloadJson = canonicalJson(payload);
    this.#providerActionAdmission.admitUnroutedInCurrentTransaction(input.providerActionTicket, {
      runId: intent.coordinationRunId,
      actionId: promotionActionId,
      adapterId: intent.providerAdapterId,
      operation: "promote_retained_bridge",
      targetAgentId: intent.successorAgentId,
      providerSessionGeneration: integer(successor, "provider_session_generation"),
      identityHash: sha256(canonicalJson({ custodyId, intentDigest })),
      payloadHash: sha256(promotionPayloadJson),
      payloadJson: promotionPayloadJson,
      status: "prepared",
      historyJson: '["prepared"]',
      executionCount: 0,
      updatedAt: now,
    });
    const frozenLease = this.#database.prepare(`
      UPDATE run_chair_leases SET status='frozen', updated_at=?
       WHERE project_session_id=? AND run_id=? AND lease_id=? AND generation=? AND status='active'
    `).run(
      now,
      intent.projectSessionId,
      intent.coordinationRunId,
      intent.expectedChairLeaseId,
      intent.expectedChairGeneration,
    );
    if (frozenLease.changes !== 1) stale("chair live handoff predecessor lease changed");
    const reconciling = this.#database.prepare(`
      UPDATE runs SET lifecycle_state='reconciling', revision=revision+1
       WHERE project_session_id=? AND run_id=? AND lifecycle_state='active'
         AND revision=? AND chair_generation=? AND chair_agent_id=?
    `).run(
      intent.projectSessionId,
      intent.coordinationRunId,
      intent.expectedRunRevision,
      intent.expectedChairGeneration,
      intent.predecessorAgentId,
    );
    if (reconciling.changes !== 1) stale("chair live handoff run changed before fencing");
    const freeze = this.#database.prepare(`
      INSERT INTO delivery_freezes(run_id, agent_id, reason, created_at)
      VALUES (?, ?, ?, ?)
    `);
    freeze.run(intent.coordinationRunId, intent.predecessorAgentId, `chair-live-handoff:${custodyId}`, now);
    freeze.run(intent.coordinationRunId, intent.successorAgentId, `chair-live-handoff:${custodyId}`, now);
    this.#fault("chair-live-handoff:prepared");
    return {
      schemaVersion: 1,
      custodyId,
      promotionActionId,
      intent,
      intentDigest,
      inspectionDigest: input.inspection.inspectionDigest,
      operatorId: input.operatorId,
      operatorCommandId: input.operatorCommandId,
    };
  }

  async dispatchPreparedChairLiveHandoff(
    handle: ChairLiveHandoffDispatchHandle,
  ): Promise<ChairLiveHandoffCommit> {
    const current = this.chairLiveHandoffStatus(handle.operatorId, handle.operatorCommandId);
    if (current.status !== "pending") return current;
    const custody = row(this.#database.prepare(`
      SELECT state FROM chair_live_handoff_custody WHERE custody_id=?
    `).get(handle.custodyId), "chair live handoff custody");
    if (text(custody, "state") !== "prepared") return current;
    const now = this.#clock();
    this.#database.transaction(() => {
      const changed = this.#database.prepare(`
        UPDATE chair_live_handoff_custody
           SET state='dispatched', revision=revision+1, updated_at=?
         WHERE custody_id=? AND state='prepared'
      `).run(now, handle.custodyId);
      const action = this.#database.prepare(`
        UPDATE provider_actions
           SET status='dispatched', history_json='["prepared","dispatched"]',
               execution_count=1, journal_revision=journal_revision+1, updated_at=?
         WHERE adapter_id=? AND action_id=? AND status='prepared'
      `).run(now, handle.intent.providerAdapterId, handle.promotionActionId);
      if (changed.changes !== 1 || action.changes !== 1) stale("chair live handoff changed before dispatch");
    })();
    this.#fault("chair-live-handoff:dispatched");
    const successor = this.#chairLiveHandoffSuccessor(handle.intent, true);
    const promotionInput = {
      projectSessionId: handle.intent.projectSessionId,
      runId: handle.intent.coordinationRunId,
      agentId: handle.intent.successorAgentId,
      principalGeneration: handle.intent.expectedSuccessorPrincipalGeneration,
      adapterId: handle.intent.providerAdapterId,
      actionId: text(successor, "action_id"),
      sourceActionId: text(successor, "action_id"),
      promotionActionId: handle.promotionActionId,
      providerSessionRef: text(successor, "provider_session_ref"),
      providerSessionGeneration: integer(successor, "provider_session_generation"),
      sourceBridgeGeneration: handle.intent.expectedSuccessorBridgeGeneration,
      chairBridgeGeneration: Math.max(
        handle.intent.expectedChairBridgeGeneration,
        handle.intent.expectedSuccessorBridgeGeneration,
      ) + 1,
    } as const;
    const promote = this.#adapterEffects.promoteRetainedSuccessorBridge;
    if (promote === undefined) return this.#markChairLiveHandoffAmbiguous(handle, "promotion capability unavailable");
    let promoted = false;
    try {
      promoted = await promote(promotionInput);
      this.#fault("chair-live-handoff:after-adapter");
    } catch (error: unknown) {
      return this.#markChairLiveHandoffAmbiguous(handle, error);
    }
    if (promoted) return this.#commitChairLiveHandoff(handle);
    return await this.#observeChairLiveHandoff(handle, promotionInput);
  }

  chairLiveHandoffStatus(operatorId: string, operatorCommandId: string): ChairLiveHandoffCommit {
    const custody = this.#database.prepare(`
      SELECT custody_id, state, result_json FROM chair_live_handoff_custody
       WHERE operator_id=? AND operator_command_id=?
    `).get(operatorId, operatorCommandId);
    if (!isRow(custody)) throw new ProjectFabricCoreError("NOT_FOUND", "chair live handoff custody was not found");
    const state = text(custody, "state");
    if (["terminal", "no-effect", "ambiguous"].includes(state) && typeof custody.result_json === "string") {
      const parsed: unknown = JSON.parse(custody.result_json);
      if (isRow(parsed) && typeof parsed.status === "string" && typeof parsed.evidenceDigest === "string") {
        return {
          status: parsed.status as ChairLiveHandoffCommit["status"],
          custodyId: text(custody, "custody_id"),
          evidenceDigest: parsed.evidenceDigest as Digest,
        };
      }
    }
    return {
      status: state === "ambiguous" ? "ambiguous" : "pending",
      custodyId: text(custody, "custody_id"),
      evidenceDigest: jsonEvidenceDigest({ custodyId: text(custody, "custody_id"), state }),
    };
  }

  async reconcileChairLiveHandoff(
    operatorId: string,
    operatorCommandId: string,
  ): Promise<ChairLiveHandoffCommit> {
    const current = this.chairLiveHandoffStatus(operatorId, operatorCommandId);
    if (current.status !== "pending" && current.status !== "ambiguous") return current;
    const custody = row(this.#database.prepare(`
      SELECT * FROM chair_live_handoff_custody
       WHERE operator_id=? AND operator_command_id=?
    `).get(operatorId, operatorCommandId), "chair live handoff custody");
    const state = text(custody, "state");
    if (state === "prepared") return current;
    const intentValue: unknown = JSON.parse(text(custody, "intent_json"));
    if (!isRow(intentValue) || intentValue.kind !== "chair-live-handoff") {
      throw new Error("stored chair live handoff intent is invalid");
    }
    const intent = intentValue as ChairLiveHandoffIntent;
    const handle: ChairLiveHandoffDispatchHandle = {
      schemaVersion: 1,
      custodyId: text(custody, "custody_id"),
      promotionActionId: text(custody, "promotion_action_id"),
      intent,
      intentDigest: text(custody, "intent_digest") as Digest,
      inspectionDigest: jsonEvidenceDigest({ custodyId: text(custody, "custody_id") }),
      operatorId,
      operatorCommandId,
    };
    const successor = this.#chairLiveHandoffSuccessor(intent, true);
    return await this.#observeChairLiveHandoff(handle, {
      projectSessionId: intent.projectSessionId,
      runId: intent.coordinationRunId,
      agentId: intent.successorAgentId,
      principalGeneration: intent.expectedSuccessorPrincipalGeneration,
      adapterId: intent.providerAdapterId,
      actionId: text(successor, "action_id"),
      sourceActionId: text(successor, "action_id"),
      promotionActionId: text(custody, "promotion_action_id"),
      providerSessionRef: text(successor, "provider_session_ref"),
      providerSessionGeneration: integer(successor, "provider_session_generation"),
      sourceBridgeGeneration: intent.expectedSuccessorBridgeGeneration,
      chairBridgeGeneration: integer(custody, "new_bridge_generation"),
    });
  }

  async inspectChairRecovery(intent: ChairBridgeRecoveryIntent): Promise<ChairRecoveryInspection> {
    const inspectionDigest = this.#chairRecoveryInspectionDigest(intent);
    if (intent.path === "rebind") {
      const contract = await this.#adapterContracts.inspect(intent.providerAdapterId);
      if (`sha256:${sha256(canonicalJson(contract))}` !== intent.providerContractDigest) {
        throw new ProjectFabricCoreError("STALE_REVISION", "chair recovery provider contract changed");
      }
    }
    return { intent, inspectionDigest };
  }

  preflightChairRecovery(input: Readonly<{
    inspection: ChairRecoveryInspection;
    principal: AuthenticatedOperatorContext;
  }>): ProviderActionTicket | null {
    const { intent } = input.inspection;
    if (intent.path !== "rebind") return null;
    const recoveryAction = row(this.#database.prepare(`
      SELECT coordination_run_id,provider_adapter_id
        FROM chair_bridge_losses WHERE loss_id=?
    `).get(intent.lossId), "chair recovery provider action");
    return this.#providerActionAdmission.preflight({
      actionRef: {
        adapterId: text(recoveryAction, "provider_adapter_id"),
        actionId: intent.providerActionId,
      },
      scope: {
        kind: "run-action",
        runId: text(recoveryAction, "coordination_run_id"),
      },
      principal: input.principal,
      canonicalInput: { schemaVersion: 1, operation: "recover-chair", intent },
    });
  }

  async readChairRecoveryCurrentState(intent: ChairBridgeRecoveryIntent): Promise<ChairRecoveryCurrentState> {
    return {
      revision: intent.expectedBridgeRevision,
      inspectionDigest: this.#chairRecoveryInspectionDigest(intent),
    };
  }

  prepareChairRecoveryInTransaction(input: Readonly<{
    inspection: ChairRecoveryInspection;
    operatorId: string;
    operatorCommandId: string;
    providerActionTicket: ProviderActionTicket | null;
  }>): ChairRecoveryDispatchHandle {
    if (!this.#database.inTransaction) throw new Error("chair recovery preparation requires a transaction");
    const currentDigest = this.#chairRecoveryInspectionDigest(input.inspection.intent);
    if (currentDigest !== input.inspection.inspectionDigest) {
      throw new ProjectFabricCoreError("STALE_REVISION", "chair recovery state changed after inspection");
    }
    const intent = input.inspection.intent;
    const providerActionTicket = input.providerActionTicket;
    if (intent.path === "rebind" && providerActionTicket === null) {
      throw new Error("chair recovery provider action ticket is unavailable");
    }
    const intentJson = canonicalJson(intent);
    const intentDigest = jsonEvidenceDigest(intent);
    const recoveryId = `chair-bridge-recovery:${sha256(canonicalJson({
      lossId: intent.lossId,
      operatorId: input.operatorId,
      commandId: input.operatorCommandId,
    }))}`;
    const existing = this.#database.prepare(`
      SELECT intent_digest FROM chair_bridge_recovery_custody
       WHERE operator_id=? AND operator_command_id=?
    `).get(input.operatorId, input.operatorCommandId);
    if (isRow(existing)) {
      if (text(existing, "intent_digest") !== intentDigest) {
        throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "chair recovery command changed");
      }
      throw new ProjectFabricCoreError("CONFLICT", "chair recovery command is already prepared");
    }
    const openRecovery = this.#database.prepare(`
      SELECT recovery_id FROM chair_bridge_recovery_custody
       WHERE loss_id=? AND state NOT IN ('terminal','no-effect')
       LIMIT 1
    `).get(intent.lossId);
    if (isRow(openRecovery)) {
      throw new ProjectFabricCoreError("CONFLICT", "chair loss already has an open recovery custody");
    }
    const now = this.#clock();
    const loss = row(this.#database.prepare(`
      SELECT * FROM chair_bridge_losses WHERE loss_id=?
    `).get(intent.lossId), "chair recovery loss");
    let capability: string | undefined;
    let attestationChallenge: string | undefined;
    let providerActionId: string | null = null;
    let successorAgentId: string | null = null;
    let successorPrincipalGeneration: number | null = null;
    let successorBridgeGeneration: number | null = null;
    let successorRevision: number | null = null;
    let newChairAgentId: string | null = null;
    let newProviderActionId: string | null = null;
    let newProviderSessionRef: string | null = null;
    let newProviderSessionGeneration: number | null = null;
    let newPrincipalGeneration: number | null = null;
    let newBridgeGeneration: number | null = null;
    let newCapabilityHash: string | null = null;
    let newActivationEvidenceDigest: string | null = null;
    let attestationChallengeDigest: string | null = null;
    if (intent.path === "rebind") {
      capability = this.#randomCapability();
      attestationChallenge = this.#randomAttestationChallenge();
      if (capability.length === 0 || !/^[0-9a-f]{64}$/u.test(attestationChallenge)) {
        throw new Error("chair recovery private material is invalid");
      }
      providerActionId = intent.providerActionId;
      newChairAgentId = text(loss, "chair_agent_id");
      newProviderActionId = intent.providerActionId;
      newProviderSessionRef = text(loss, "provider_session_ref");
      newProviderSessionGeneration = intent.expectedProviderSessionGeneration + 1;
      newPrincipalGeneration = intent.expectedPrincipalGeneration + 1;
      newBridgeGeneration = intent.expectedLostBridgeGeneration + 1;
      newCapabilityHash = sha256(capability);
      attestationChallengeDigest = `sha256:${createHash("sha256").update(Buffer.from(attestationChallenge, "hex")).digest("hex")}`;
    } else if (intent.path === "takeover") {
      const successor = this.#chairRecoverySuccessor(intent);
      successorAgentId = intent.successorAgentId;
      successorPrincipalGeneration = intent.expectedSuccessorPrincipalGeneration;
      successorBridgeGeneration = intent.expectedSuccessorBridgeGeneration;
      successorRevision = intent.expectedSuccessorRevision;
      newChairAgentId = intent.successorAgentId;
      newProviderActionId = text(successor, "action_id");
      newProviderSessionRef = text(successor, "provider_session_ref");
      newProviderSessionGeneration = integer(successor, "provider_session_generation");
      newPrincipalGeneration = intent.expectedSuccessorPrincipalGeneration;
      newBridgeGeneration = intent.expectedLostBridgeGeneration + 1;
      newCapabilityHash = text(successor, "capability_hash");
      newActivationEvidenceDigest = text(successor, "activation_evidence_digest");
    }
    this.#database.prepare(`
      INSERT INTO chair_bridge_recovery_custody(
        recovery_id, loss_id, operator_id, operator_command_id, path,
        intent_digest, intent_json, recovery_manifest_digest,
        expected_session_revision, expected_session_generation, expected_run_revision,
        expected_chair_generation, expected_principal_generation, expected_bridge_revision,
        expected_lost_bridge_generation, expected_provider_session_generation,
        provider_adapter_id, provider_contract_digest, provider_action_id,
        successor_agent_id, expected_successor_principal_generation,
        expected_successor_bridge_generation, expected_successor_revision,
        new_chair_agent_id, new_provider_action_id, new_provider_session_ref,
        new_provider_session_generation, new_principal_generation, new_bridge_generation,
        new_capability_hash, new_activation_evidence_digest, attestation_challenge_digest,
        state, result_json, revision, created_at, updated_at
      ) VALUES (
        @recoveryId, @lossId, @operatorId, @operatorCommandId, @path,
        @intentDigest, @intentJson, @recoveryManifestDigest,
        @expectedSessionRevision, @expectedSessionGeneration, @expectedRunRevision,
        @expectedChairGeneration, @expectedPrincipalGeneration, @expectedBridgeRevision,
        @expectedLostBridgeGeneration, @expectedProviderSessionGeneration,
        @providerAdapterId, @providerContractDigest, @providerActionId,
        @successorAgentId, @successorPrincipalGeneration, @successorBridgeGeneration, @successorRevision,
        @newChairAgentId, @newProviderActionId, @newProviderSessionRef,
        @newProviderSessionGeneration, @newPrincipalGeneration, @newBridgeGeneration,
        @newCapabilityHash, @newActivationEvidenceDigest, @attestationChallengeDigest,
        'prepared', NULL, 1, @now, @now
      )
    `).run({
      recoveryId,
      lossId: intent.lossId,
      operatorId: input.operatorId,
      operatorCommandId: input.operatorCommandId,
      path: intent.path,
      intentDigest,
      intentJson,
      recoveryManifestDigest: intent.recoveryManifestDigest,
      expectedSessionRevision: intent.expectedSessionRevision,
      expectedSessionGeneration: intent.expectedSessionGeneration,
      expectedRunRevision: intent.expectedRunRevision,
      expectedChairGeneration: intent.expectedChairGeneration,
      expectedPrincipalGeneration: intent.expectedPrincipalGeneration,
      expectedBridgeRevision: intent.expectedBridgeRevision,
      expectedLostBridgeGeneration: intent.expectedLostBridgeGeneration,
      expectedProviderSessionGeneration: intent.expectedProviderSessionGeneration,
      providerAdapterId: intent.providerAdapterId,
      providerContractDigest: intent.providerContractDigest,
      providerActionId,
      successorAgentId,
      successorPrincipalGeneration,
      successorBridgeGeneration,
      successorRevision,
      newChairAgentId,
      newProviderActionId,
      newProviderSessionRef,
      newProviderSessionGeneration,
      newPrincipalGeneration,
      newBridgeGeneration,
      newCapabilityHash,
      newActivationEvidenceDigest,
      attestationChallengeDigest,
      now,
    });
    if (intent.path === "rebind") {
      this.#database.prepare(`
        INSERT INTO capabilities(token_hash, run_id, agent_id, principal_generation, expires_at)
        SELECT ?, coordination_run_id, chair_agent_id, ?, ?
          FROM chair_bridge_losses WHERE loss_id=?
      `).run(
        newCapabilityHash,
        newPrincipalGeneration,
        now + 24 * 60 * 60_000,
        intent.lossId,
      );
      const publicPayload = {
        schemaVersion: 1,
        recoveryId,
        lossId: intent.lossId,
        providerSessionRef: newProviderSessionRef,
        expectedProviderSessionGeneration: intent.expectedProviderSessionGeneration,
        nextProviderSessionGeneration: newProviderSessionGeneration,
        bridgeGeneration: newBridgeGeneration,
        providerContractDigest: intent.providerContractDigest,
      };
      const payloadJson = canonicalJson(publicPayload);
      const recoveryAction = row(this.#database.prepare(`
        SELECT coordination_run_id,provider_adapter_id,chair_agent_id,project_session_id
          FROM chair_bridge_losses WHERE loss_id=?
      `).get(intent.lossId), "chair recovery provider action");
      const recoveryRunId = text(recoveryAction, "coordination_run_id");
      const recoveryAdapterId = text(recoveryAction, "provider_adapter_id");
      this.#providerActionAdmission.admitUnroutedInCurrentTransaction(providerActionTicket as ProviderActionTicket, {
        runId: recoveryRunId,
        actionId: intent.providerActionId,
        adapterId: recoveryAdapterId,
        operation: "recover-chair",
        targetAgentId: text(recoveryAction, "chair_agent_id"),
        identityHash: sha256(canonicalJson({ recoveryId, actionId: intent.providerActionId })),
        payloadHash: sha256(payloadJson),
        payloadJson,
        status: "prepared",
        historyJson: '["prepared"]',
        executionCount: 0,
        updatedAt: now,
      });
    }
    this.#fault("chair-recovery:prepare:custody");
    return {
      schemaVersion: 1,
      recoveryId,
      intent,
      intentDigest,
      inspectionDigest: input.inspection.inspectionDigest,
      operatorId: input.operatorId,
      operatorCommandId: input.operatorCommandId,
      ...(capability === undefined ? {} : { capability }),
      ...(attestationChallenge === undefined ? {} : { attestationChallenge }),
      ...(capability === undefined ? {} : { socketPath: this.#fabricSocketPath }),
    };
  }

  async dispatchPreparedChairRecovery(handle: ChairRecoveryDispatchHandle): Promise<ChairRecoveryCommit> {
    const custody = row(this.#database.prepare(`
      SELECT * FROM chair_bridge_recovery_custody WHERE recovery_id=?
    `).get(handle.recoveryId), "chair recovery custody");
    if (
      text(custody, "operator_id") !== handle.operatorId ||
      text(custody, "operator_command_id") !== handle.operatorCommandId ||
      text(custody, "intent_digest") !== handle.intentDigest
    ) throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "chair recovery handle changed");
    if (text(custody, "state") === "terminal") {
      const stored: unknown = JSON.parse(text(custody, "result_json"));
      if (!isRow(stored) || stored.status !== "committed") throw new Error("terminal chair recovery result is invalid");
      if (handle.intent.path === "abandon") {
        try { this.#retireVolatileProjectSession?.(handle.intent.projectSessionId); } catch { /* durable fencing exists */ }
      }
      return stored as ChairRecoveryCommit;
    }
    if (text(custody, "state") !== "prepared") {
      throw new ProjectFabricCoreError("CONFLICT", "chair recovery is not prepared");
    }
    if (handle.intent.path === "rebind") {
      return await this.#dispatchChairRebind({ ...handle, intent: handle.intent });
    }
    if (handle.intent.path === "takeover") {
      return await this.#dispatchChairTakeover({ ...handle, intent: handle.intent });
    }
    const abandonIntent = handle.intent;
    const now = this.#clock();
    const result = this.#database.transaction((): ChairRecoveryCommit => {
      this.#assertChairAbandonReady(abandonIntent);
      const changed = this.#database.prepare(`
        UPDATE chair_bridge_recovery_custody
           SET state='committing', revision=revision+1, updated_at=?
         WHERE recovery_id=? AND state='prepared' AND revision=1
      `).run(now, handle.recoveryId);
      if (changed.changes !== 1) stale("chair recovery custody changed before commit");
      this.#fault("chair-recovery:abandon:committing");
      const bridge = row(this.#database.prepare(`
        SELECT revision FROM launched_chair_bridge_state
         WHERE project_session_id=? AND coordination_run_id=? AND state='lost'
      `).get(handle.intent.projectSessionId, handle.intent.coordinationRunId), "lost chair bridge");
      if (integer(bridge, "revision") !== handle.intent.expectedBridgeRevision) {
        stale("lost chair bridge revision changed");
      }
      const abandonedBridge = this.#database.prepare(`
        UPDATE launched_chair_bridge_state
           SET state='abandoned', revision=revision+1, updated_at=?
         WHERE project_session_id=? AND coordination_run_id=? AND state='lost' AND revision=?
      `).run(
        now,
        abandonIntent.projectSessionId,
        abandonIntent.coordinationRunId,
        abandonIntent.expectedBridgeRevision,
      );
      if (abandonedBridge.changes !== 1) stale("lost chair bridge changed before abandon");
      const resolution = {
        schemaVersion: 1,
        recoveryId: handle.recoveryId,
        lossId: abandonIntent.lossId,
        path: "abandon" as const,
        reason: abandonIntent.reason,
        previousBridgeGeneration: abandonIntent.expectedLostBridgeGeneration,
      };
      const evidenceDigest = jsonEvidenceDigest(resolution);
      this.#database.prepare(`
        INSERT INTO chair_bridge_loss_resolutions(
          loss_id, recovery_id, path, successor_agent_id,
          new_principal_generation, new_bridge_generation, evidence_digest, created_at
        ) VALUES (?, ?, 'abandon', NULL, NULL, NULL, ?, ?)
      `).run(abandonIntent.lossId, handle.recoveryId, evidenceDigest, now);
      const revokedLease = this.#database.prepare(`
        UPDATE run_chair_leases SET status='revoked', updated_at=?
         WHERE project_session_id=? AND run_id=? AND status='frozen'
      `).run(now, abandonIntent.projectSessionId, abandonIntent.coordinationRunId);
      if (revokedLease.changes !== 1) stale("frozen chair lease changed before abandon");
      const terminalPath = canonicalJson({ kind: "cancelled", reason: abandonIntent.reason });
      const cancelledRun = this.#database.prepare(`
        UPDATE runs SET lifecycle_state='cancelled', revision=revision+1
         WHERE run_id=? AND lifecycle_state='recovery_required' AND revision=?
      `).run(abandonIntent.coordinationRunId, abandonIntent.expectedRunRevision);
      if (cancelledRun.changes !== 1) stale("run recovery revision changed before abandon");
      const abandonmentReason = `chair-recovery-abandon:${handle.recoveryId}`;
      const memberships = this.#database.prepare(`
        UPDATE project_session_memberships
           SET state='abandoned',abandoned_reason=?,revision=revision+1,updated_at=?
         WHERE project_session_id=? AND coordination_run_id=? AND required=1 AND state='active'
           AND (
             (member_kind='coordination-run' AND member_id=coordination_run_id) OR
             (member_kind='lease' AND member_id=(
               SELECT chair_lease_id FROM runs WHERE run_id=coordination_run_id
             ))
           )
      `).run(
        abandonmentReason,
        now,
        abandonIntent.projectSessionId,
        abandonIntent.coordinationRunId,
      );
      if (memberships.changes !== 2) stale("chair abandon membership set changed");
      this.#database.prepare(`
        UPDATE capabilities SET revoked_at=COALESCE(revoked_at,?)
         WHERE run_id=?
      `).run(now, abandonIntent.coordinationRunId);
      this.#database.prepare(`
        UPDATE agents SET lifecycle='archived' WHERE run_id=?
      `).run(abandonIntent.coordinationRunId);
      const cancelledSession = this.#database.prepare(`
        UPDATE project_sessions
           SET state='cancelled',membership_revision=membership_revision+1,
               revision=revision+1,terminal_path_json=?,updated_at=?
         WHERE project_session_id=? AND state='recovery_required' AND revision=? AND generation=?
      `).run(
        terminalPath,
        now,
        abandonIntent.projectSessionId,
        abandonIntent.expectedSessionRevision,
        abandonIntent.expectedSessionGeneration,
      );
      if (cancelledSession.changes !== 1) stale("project session recovery revision changed before abandon");
      retireProjectSessionBridges(this.#database, {
        projectSessionId: abandonIntent.projectSessionId,
        sourceKind: "chair-recovery-abandon",
        terminalKind: "cancelled",
        terminalRef: terminalPath,
        ownerOperatorId: handle.operatorId,
        ownerRef: handle.recoveryId,
        now,
      });
      this.#fault("chair-recovery:abandon:after-bridges");
      const commit: ChairRecoveryCommit = {
        status: "committed",
        recoveryId: handle.recoveryId,
        path: "abandon",
        evidenceDigest,
      };
      const terminal = this.#database.prepare(`
        UPDATE chair_bridge_recovery_custody
           SET state='terminal', result_json=?, revision=revision+1, updated_at=?
         WHERE recovery_id=? AND state='committing'
      `).run(canonicalJson(commit), now, handle.recoveryId);
      if (terminal.changes !== 1) stale("chair abandon custody changed before terminal commit");
      return commit;
    })();
    try { this.#retireVolatileProjectSession?.(abandonIntent.projectSessionId); } catch { /* durable fencing already committed */ }
    return result;
  }

  #assertChairAbandonReady(intent: Extract<ChairBridgeRecoveryIntent, { path: "abandon" }>): void {
    const current = row(this.#database.prepare(`
      SELECT chair_lease_id FROM runs
       WHERE project_session_id=? AND run_id=? AND lifecycle_state='recovery_required'
    `).get(intent.projectSessionId, intent.coordinationRunId), "chair abandon run");
    const currentLeaseId = text(current, "chair_lease_id");
    const allowedMemberships = this.#database.prepare(`
      SELECT member_kind,member_id FROM project_session_memberships
       WHERE project_session_id=? AND coordination_run_id=? AND required=1 AND state='active'
         AND NOT (
           (member_kind='coordination-run' AND member_id=coordination_run_id) OR
           (member_kind='lease' AND member_id=?)
         )
       LIMIT 1
    `).get(intent.projectSessionId, intent.coordinationRunId, currentLeaseId);
    if (allowedMemberships !== undefined) {
      throw new ProjectFabricCoreError("BARRIER_PRECONDITION_FAILED", "unrelated active membership blocks chair abandon");
    }
    const exactTerminalMemberships = this.#database.prepare(`
      SELECT COUNT(*) AS count FROM project_session_memberships
       WHERE project_session_id=? AND coordination_run_id=? AND required=1 AND state='active'
         AND (
           (member_kind='coordination-run' AND member_id=coordination_run_id) OR
           (member_kind='lease' AND member_id=?)
         )
    `).get(intent.projectSessionId, intent.coordinationRunId, currentLeaseId);
    if (integer(row(exactTerminalMemberships, "chair abandon membership set"), "count") !== 2) {
      throw new ProjectFabricCoreError("RECOVERY_REQUIRED", "chair abandon requires exact run and current-chair membership");
    }
    const blockers: ReadonlyArray<readonly [string, string]> = [
      ["task", `SELECT 1 FROM tasks WHERE run_id=? AND state NOT IN ('complete','cancelled','degraded') LIMIT 1`],
      ["workstream", `SELECT 1 FROM workstreams WHERE coordination_run_id=? AND state NOT IN ('complete','cancelled','degraded','abandoned') LIMIT 1`],
      ["write lease", `SELECT 1 FROM leases WHERE run_id=? AND status IN ('active','quarantined') LIMIT 1`],
      ["task-owner lease", `SELECT 1 FROM task_owner_leases WHERE run_id=? AND status IN ('active','frozen') LIMIT 1`],
      ["provider action", `SELECT 1 FROM provider_actions WHERE run_id=? AND status IN ('prepared','dispatched','accepted','ambiguous','quarantined') LIMIT 1`],
      ["required message", `SELECT 1 FROM deliveries delivery
        JOIN messages message ON message.message_id=delivery.message_id AND message.run_id=delivery.run_id
        WHERE delivery.run_id=? AND message.requires_ack=1
          AND delivery.state NOT IN ('acknowledged','abandoned','expired') LIMIT 1`],
      ["required result", `SELECT 1 FROM result_deliveries WHERE run_id=? AND required=1 AND state NOT IN ('consumed','abandoned') LIMIT 1`],
      ["gate", `SELECT 1 FROM scoped_gates WHERE coordination_run_id=? AND status IN ('pending','deferred') LIMIT 1`],
      ["barrier", `SELECT 1 FROM barriers WHERE run_id=? AND state<>'closed' LIMIT 1`],
      ["child bridge", `SELECT 1 FROM agent_bridge_state WHERE run_id=? AND bridge_state IN ('pending','lost') LIMIT 1`],
      ["resource reservation", `SELECT 1 FROM resource_reservations WHERE coordination_run_id=? AND state IN ('reserved','partially-consumed','ambiguous') LIMIT 1`],
    ];
    for (const [label, sql] of blockers) {
      if (this.#database.prepare(sql).get(intent.coordinationRunId) !== undefined) {
        throw new ProjectFabricCoreError("BARRIER_PRECONDITION_FAILED", `${label} remains unresolved before chair abandon`);
      }
    }
    if (this.#database.prepare(`
      SELECT 1 FROM operator_effect_custody
       WHERE project_session_id=? AND state IN ('prepared','dispatching','ambiguous','conflict','quarantined','failed')
       LIMIT 1
    `).get(intent.projectSessionId) !== undefined) {
      throw new ProjectFabricCoreError("BARRIER_PRECONDITION_FAILED", "operator effect remains unresolved before chair abandon");
    }
  }

  chairRecoveryStatus(operatorId: string, operatorCommandId: string): ChairRecoveryCommit {
    const custody = row(this.#database.prepare(`
      SELECT recovery_id, path, state, result_json FROM chair_bridge_recovery_custody
       WHERE operator_id=? AND operator_command_id=?
    `).get(operatorId, operatorCommandId), "chair recovery status");
    const state = text(custody, "state");
    if (state === "terminal") {
      const value: unknown = JSON.parse(text(custody, "result_json"));
      if (!isRow(value) || value.status !== "committed") throw new Error("terminal chair recovery status is invalid");
      return value as ChairRecoveryCommit;
    }
    const path = text(custody, "path") as ChairRecoveryIntentPath;
    const evidenceDigest = jsonEvidenceDigest({
      recoveryId: text(custody, "recovery_id"),
      path,
      state,
      result: custody.result_json,
    });
    if (state === "no-effect") {
      return { status: "no-effect", recoveryId: text(custody, "recovery_id"), path, evidenceDigest };
    }
    if (state === "ambiguous") {
      return { status: "ambiguous", recoveryId: text(custody, "recovery_id"), path, evidenceDigest };
    }
    return { status: "pending", recoveryId: text(custody, "recovery_id"), path, evidenceDigest };
  }

  async reconcileChairRecovery(operatorId: string, operatorCommandId: string): Promise<ChairRecoveryCommit> {
    const custody = row(this.#database.prepare(`
      SELECT * FROM chair_bridge_recovery_custody
       WHERE operator_id=? AND operator_command_id=?
    `).get(operatorId, operatorCommandId), "chair recovery reconciliation");
    const status = this.chairRecoveryStatus(operatorId, operatorCommandId);
    if (status.status === "committed" || status.status === "no-effect") return status;
    const path = text(custody, "path");
    const custodyState = text(custody, "state");
    if (path === "takeover" && ["dispatched", "accepted", "ambiguous"].includes(custodyState)) {
      return await this.#reconcileChairTakeover(custody, operatorId, operatorCommandId, status);
    }
    if (
      path !== "rebind" || !["dispatched", "accepted", "ambiguous"].includes(custodyState) ||
      typeof custody.provider_action_id !== "string" || this.#adapterEffects.lookupChairRecovery === undefined
    ) return status;
    let record: unknown;
    try {
      record = await this.#adapterEffects.lookupChairRecovery({
        adapterId: text(custody, "provider_adapter_id"),
        actionId: custody.provider_action_id,
      });
    } catch {
      return status;
    }
    const provider = this.#chairRecoveryLookupResult(custody, record);
    if (provider === undefined) return status;
    const intentValue: unknown = JSON.parse(text(custody, "intent_json"));
    if (!isRow(intentValue) || intentValue.kind !== "chair-bridge-recovery" || intentValue.path !== "rebind") {
      throw new Error("stored chair recovery intent is invalid");
    }
    const intent = intentValue as ChairBridgeRecoveryIntent & { path: "rebind" };
    return this.#commitActiveChairRecovery({
      schemaVersion: 1,
      recoveryId: text(custody, "recovery_id"),
      intent,
      intentDigest: text(custody, "intent_digest") as Digest,
      inspectionDigest: jsonEvidenceDigest({ recovery: text(custody, "recovery_id") }),
      operatorId,
      operatorCommandId,
    }, jsonEvidenceDigest(provider.fabricContinuity));
  }

  #chairRecoveryLookupResult(custody: Row, record: unknown): ChairLaunchProviderResult | undefined {
    if (
      !isRow(record) || record.actionId !== custody.provider_action_id ||
      record.status !== "terminal" || record.operation !== "recover_chair" ||
      record.executionCount !== 1 || record.effectCount !== 1 || !isRow(record.result)
    ) return undefined;
    try {
      const provider = parseChairLaunchProviderResult(record.result, {
        providerAdapterId: text(custody, "provider_adapter_id"),
        providerActionId: text(custody, "provider_action_id"),
        providerContractDigest: text(custody, "provider_contract_digest"),
        challengeDigest: text(custody, "attestation_challenge_digest"),
      });
      return provider.resumeReference === custody.new_provider_session_ref &&
        provider.providerSessionGeneration === custody.new_provider_session_generation
        ? provider
        : undefined;
    } catch {
      return undefined;
    }
  }

  async #dispatchChairRebind(
    handle: ChairRecoveryDispatchHandle & Readonly<{ intent: Extract<ChairBridgeRecoveryIntent, { path: "rebind" }> }>,
  ): Promise<ChairRecoveryCommit> {
    if (
      this.#adapterEffects.recoverChair === undefined ||
      handle.capability === undefined ||
      handle.attestationChallenge === undefined ||
      handle.socketPath === undefined
    ) throw new ProjectFabricCoreError("CAPABILITY_UNAVAILABLE", "chair rebind adapter custody is unavailable");
    const now = this.#clock();
    this.#database.transaction(() => {
      const recovery = this.#database.prepare(`
        UPDATE chair_bridge_recovery_custody
           SET state='dispatched', revision=revision+1, updated_at=?
         WHERE recovery_id=? AND state='prepared'
      `).run(now, handle.recoveryId);
      const action = this.#database.prepare(`
        UPDATE provider_actions
           SET status='dispatched', history_json='["prepared","dispatched"]',
               execution_count=1, journal_revision=journal_revision+1, updated_at=?
         WHERE adapter_id=? AND action_id=? AND status='prepared'
      `).run(now, handle.intent.providerAdapterId, handle.intent.providerActionId);
      if (recovery.changes !== 1 || action.changes !== 1) stale("chair rebind changed before dispatch");
      this.#fault("chair-recovery:rebind:dispatched");
    })();
    let raw: unknown;
    try {
      raw = await this.#adapterEffects.recoverChair(handle);
      this.#fault("chair-recovery:rebind:after-adapter");
    } catch (error: unknown) {
      return this.#markChairRecoveryAmbiguous(handle, error);
    }
    if (!isRow(raw)) return this.#markChairRecoveryAmbiguous(handle, "malformed rebind result");
    const expectedSessionRef = text(row(this.#database.prepare(`
      SELECT * FROM chair_bridge_losses WHERE loss_id=?
    `).get(handle.intent.lossId), "chair rebind loss"), "provider_session_ref");
    const expectedGeneration = handle.intent.expectedProviderSessionGeneration + 1;
    if (
      raw.schemaVersion !== 1 || raw.recoveryId !== handle.recoveryId ||
      raw.providerAdapterId !== handle.intent.providerAdapterId ||
      raw.providerActionId !== handle.intent.providerActionId ||
      raw.providerContractDigest !== handle.intent.providerContractDigest ||
      raw.providerSessionRef !== expectedSessionRef ||
      raw.providerSessionGeneration !== expectedGeneration ||
      typeof raw.activationEvidenceDigest !== "string" || !DIGEST.test(raw.activationEvidenceDigest)
    ) return this.#markChairRecoveryAmbiguous(handle, "rebind result binding changed");
    return this.#commitActiveChairRecovery(handle, raw.activationEvidenceDigest as Digest);
  }

  async #dispatchChairTakeover(
    handle: ChairRecoveryDispatchHandle & Readonly<{ intent: Extract<ChairBridgeRecoveryIntent, { path: "takeover" }> }>,
  ): Promise<ChairRecoveryCommit> {
    const promote = this.#adapterEffects.promoteRetainedSuccessorBridge;
    if (promote === undefined) {
      throw new ProjectFabricCoreError("CAPABILITY_UNAVAILABLE", "chair takeover bridge promotion is unavailable");
    }
    const successor = this.#chairRecoverySuccessor(handle.intent);
    const now = this.#clock();
    const dispatched = this.#database.prepare(`
      UPDATE chair_bridge_recovery_custody
         SET state='dispatched', revision=revision+1, updated_at=?
       WHERE recovery_id=? AND state='prepared'
    `).run(now, handle.recoveryId);
    if (dispatched.changes !== 1) stale("chair takeover changed before dispatch");
    this.#fault("chair-recovery:takeover:dispatched");
    const promotionInput = {
      projectSessionId: handle.intent.projectSessionId,
      runId: handle.intent.coordinationRunId,
      agentId: handle.intent.successorAgentId,
      principalGeneration: handle.intent.expectedSuccessorPrincipalGeneration,
      adapterId: text(successor, "adapter_id"),
      actionId: text(successor, "action_id"),
      providerSessionRef: text(successor, "provider_session_ref"),
      providerSessionGeneration: integer(successor, "provider_session_generation"),
      sourceBridgeGeneration: handle.intent.expectedSuccessorBridgeGeneration,
      chairBridgeGeneration: handle.intent.expectedLostBridgeGeneration + 1,
    } as const;
    let promoted = false;
    try {
      promoted = await promote(promotionInput);
      this.#fault("chair-recovery:takeover:after-adapter");
    } catch (error: unknown) {
      return this.#markChairRecoveryAmbiguous(handle, error);
    }
    if (!promoted) return await this.#settleUnobservedChairTakeover(handle, promotionInput);
    return this.#commitActiveChairRecovery(
      handle,
      text(successor, "activation_evidence_digest") as Digest,
    );
  }

  async #settleUnobservedChairTakeover(
    handle: ChairRecoveryDispatchHandle & Readonly<{ intent: Extract<ChairBridgeRecoveryIntent, { path: "takeover" }> }>,
    input: Parameters<NonNullable<LaunchCustodyServiceOptions["adapterEffects"]["promoteRetainedSuccessorBridge"]>>[0],
  ): Promise<ChairRecoveryCommit> {
    const lookup = this.#adapterEffects.lookupRetainedSuccessorBridge;
    if (lookup === undefined) return this.#markChairRecoveryAmbiguous(handle, "successor bridge lookup unavailable");
    let observed: "child" | "chair" | "missing";
    try {
      observed = await lookup(input);
    } catch (error: unknown) {
      return this.#markChairRecoveryAmbiguous(handle, error);
    }
    if (observed === "chair") {
      const successor = this.#chairRecoverySuccessor(handle.intent);
      return this.#commitActiveChairRecovery(handle, text(successor, "activation_evidence_digest") as Digest);
    }
    if (observed === "child") return this.#markChairRecoveryNoEffect(handle, "successor remained a child");
    return this.#markChairRecoveryAmbiguous(handle, "successor bridge state is unobservable");
  }

  async #reconcileChairTakeover(
    custody: Row,
    operatorId: string,
    operatorCommandId: string,
    current: ChairRecoveryCommit,
  ): Promise<ChairRecoveryCommit> {
    const lookup = this.#adapterEffects.lookupRetainedSuccessorBridge;
    if (lookup === undefined) return current;
    const intentValue: unknown = JSON.parse(text(custody, "intent_json"));
    if (!isRow(intentValue) || intentValue.kind !== "chair-bridge-recovery" || intentValue.path !== "takeover") {
      throw new Error("stored chair takeover intent is invalid");
    }
    const intent = intentValue as ChairBridgeRecoveryIntent & { path: "takeover" };
    const successor = this.#chairRecoverySuccessor(intent);
    const handle: ChairRecoveryDispatchHandle & Readonly<{ intent: typeof intent }> = {
      schemaVersion: 1,
      recoveryId: text(custody, "recovery_id"),
      intent,
      intentDigest: text(custody, "intent_digest") as Digest,
      inspectionDigest: jsonEvidenceDigest({ recovery: text(custody, "recovery_id") }),
      operatorId,
      operatorCommandId,
    };
    return await this.#settleUnobservedChairTakeover(handle, {
      projectSessionId: intent.projectSessionId,
      runId: intent.coordinationRunId,
      agentId: intent.successorAgentId,
      principalGeneration: intent.expectedSuccessorPrincipalGeneration,
      adapterId: text(successor, "adapter_id"),
      actionId: text(successor, "action_id"),
      providerSessionRef: text(successor, "provider_session_ref"),
      providerSessionGeneration: integer(successor, "provider_session_generation"),
      sourceBridgeGeneration: intent.expectedSuccessorBridgeGeneration,
      chairBridgeGeneration: intent.expectedLostBridgeGeneration + 1,
    });
  }

  #markChairRecoveryNoEffect(handle: ChairRecoveryDispatchHandle, reason: string): ChairRecoveryCommit {
    const now = this.#clock();
    const evidenceDigest = jsonEvidenceDigest({
      recoveryId: handle.recoveryId,
      kind: "chair-recovery-proved-no-effect",
      reason,
    });
    const changed = this.#database.prepare(`
      UPDATE chair_bridge_recovery_custody
         SET state='no-effect', result_json=?, revision=revision+1, updated_at=?
       WHERE recovery_id=? AND state IN ('dispatched','accepted','ambiguous')
    `).run(canonicalJson({ status: "no-effect", evidenceDigest, reason }), now, handle.recoveryId);
    if (changed.changes !== 1) stale("chair recovery no-effect state changed");
    return { status: "no-effect", recoveryId: handle.recoveryId, path: handle.intent.path, evidenceDigest };
  }

  #markChairRecoveryAmbiguous(handle: ChairRecoveryDispatchHandle, evidence: unknown): ChairRecoveryCommit {
    const now = this.#clock();
    const evidenceDigest = jsonEvidenceDigest({
      recoveryId: handle.recoveryId,
      kind: "chair-recovery-ambiguous",
      evidence: evidence instanceof Error ? { name: evidence.name, message: evidence.message } : evidence,
    });
    this.#database.transaction(() => {
      this.#database.prepare(`
        UPDATE chair_bridge_recovery_custody
           SET state='ambiguous', result_json=?, revision=revision+1, updated_at=?
         WHERE recovery_id=? AND state IN ('dispatched','accepted','ambiguous')
      `).run(canonicalJson({ status: "ambiguous", evidenceDigest }), now, handle.recoveryId);
      if (handle.intent.path === "rebind") {
        this.#database.prepare(`
          UPDATE provider_actions
             SET status='ambiguous', history_json='["prepared","dispatched","ambiguous"]',
                 result_json=?, journal_revision=journal_revision+1, updated_at=?
           WHERE adapter_id=? AND action_id=? AND status IN ('dispatched','accepted','ambiguous')
        `).run(
          canonicalJson({ kind: "chair-recovery-ambiguous", evidenceDigest }),
          now,
          handle.intent.providerAdapterId,
          handle.intent.providerActionId,
        );
      }
    })();
    return { status: "ambiguous", recoveryId: handle.recoveryId, path: handle.intent.path, evidenceDigest };
  }

  #commitActiveChairRecovery(
    handle: ChairRecoveryDispatchHandle & Readonly<{
      intent: Extract<ChairBridgeRecoveryIntent, { path: "rebind" | "takeover" }>;
    }>,
    activationEvidenceDigest: Digest,
  ): ChairRecoveryCommit {
    const now = this.#clock();
    return this.#database.transaction((): ChairRecoveryCommit => {
      const custody = row(this.#database.prepare(`
        SELECT * FROM chair_bridge_recovery_custody WHERE recovery_id=?
      `).get(handle.recoveryId), "active chair recovery custody");
      const allowedState = text(custody, "state");
      if (!["dispatched", "accepted", "ambiguous"].includes(allowedState)) {
        stale("active chair recovery custody changed");
      }
      const committing = this.#database.prepare(`
        UPDATE chair_bridge_recovery_custody
           SET state='committing', new_activation_evidence_digest=?, revision=revision+1, updated_at=?
         WHERE recovery_id=? AND state=?
      `).run(activationEvidenceDigest, now, handle.recoveryId, allowedState);
      if (committing.changes !== 1) stale("active chair recovery custody changed before commit");
      this.#fault(`chair-recovery:${handle.intent.path}:committing`);
      const updatedBridge = this.#database.prepare(`
        UPDATE launched_chair_bridge_state
           SET chair_agent_id=(SELECT new_chair_agent_id FROM chair_bridge_recovery_custody WHERE recovery_id=?),
               provider_adapter_id=(SELECT provider_adapter_id FROM chair_bridge_recovery_custody WHERE recovery_id=?),
               provider_action_id=(SELECT new_provider_action_id FROM chair_bridge_recovery_custody WHERE recovery_id=?),
               provider_contract_digest=(SELECT provider_contract_digest FROM chair_bridge_recovery_custody WHERE recovery_id=?),
               provider_session_ref=(SELECT new_provider_session_ref FROM chair_bridge_recovery_custody WHERE recovery_id=?),
               provider_session_generation=(SELECT new_provider_session_generation FROM chair_bridge_recovery_custody WHERE recovery_id=?),
               principal_generation=(SELECT new_principal_generation FROM chair_bridge_recovery_custody WHERE recovery_id=?),
               bridge_generation=(SELECT new_bridge_generation FROM chair_bridge_recovery_custody WHERE recovery_id=?),
               capability_hash=(SELECT new_capability_hash FROM chair_bridge_recovery_custody WHERE recovery_id=?),
               activation_evidence_digest=?, state='active', revision=revision+1, updated_at=?
         WHERE project_session_id=? AND coordination_run_id=? AND state='lost' AND revision=?
      `).run(
        handle.recoveryId, handle.recoveryId, handle.recoveryId, handle.recoveryId,
        handle.recoveryId, handle.recoveryId, handle.recoveryId, handle.recoveryId,
        handle.recoveryId, activationEvidenceDigest, now,
        handle.intent.projectSessionId, handle.intent.coordinationRunId,
        handle.intent.expectedBridgeRevision,
      );
      if (updatedBridge.changes !== 1) stale("lost chair bridge changed during recovery");
      const target = row(this.#database.prepare(`
        SELECT new_chair_agent_id, new_provider_session_ref, new_provider_session_generation,
               new_principal_generation, new_bridge_generation
          FROM chair_bridge_recovery_custody WHERE recovery_id=?
      `).get(handle.recoveryId), "chair recovery target");
      const targetAgentId = text(target, "new_chair_agent_id");
      const newChairGeneration = handle.intent.expectedChairGeneration + 1;
      const leaseId = `chair:${handle.intent.coordinationRunId}:${String(newChairGeneration)}:recovery`;
      const predecessor = row(this.#database.prepare(`
        SELECT chair_lease_id FROM runs
         WHERE project_session_id=? AND run_id=? AND chair_generation=?
      `).get(
        handle.intent.projectSessionId,
        handle.intent.coordinationRunId,
        handle.intent.expectedChairGeneration,
      ), "recovered predecessor chair lease");
      const predecessorLeaseId = text(predecessor, "chair_lease_id");
      const revokedLease = this.#database.prepare(`
        UPDATE run_chair_leases SET status='revoked', updated_at=?
         WHERE project_session_id=? AND run_id=? AND lease_id=? AND status='frozen'
      `).run(now, handle.intent.projectSessionId, handle.intent.coordinationRunId, predecessorLeaseId);
      if (revokedLease.changes !== 1) stale("frozen chair lease changed during recovery");
      this.#database.prepare(`
        INSERT INTO run_chair_leases(
          project_session_id, run_id, lease_id, holder_agent_id, generation, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?)
      `).run(
        handle.intent.projectSessionId,
        handle.intent.coordinationRunId,
        leaseId,
        targetAgentId,
        newChairGeneration,
        now,
      );
      const retiredMembership = this.#database.prepare(`
        UPDATE project_session_memberships
           SET state='abandoned', abandoned_reason='chair-bridge-recovery',
               revision=revision+1, updated_at=?
         WHERE project_session_id=? AND coordination_run_id=?
           AND member_kind='lease' AND member_id=? AND required=1 AND state='active'
      `).run(
        now,
        handle.intent.projectSessionId,
        handle.intent.coordinationRunId,
        predecessorLeaseId,
      );
      if (retiredMembership.changes !== 1) stale("predecessor chair membership changed during recovery");
      this.#database.prepare(`
        INSERT INTO project_session_memberships(
          project_session_id, coordination_run_id, member_kind, member_id,
          required, state, revision, abandoned_reason, created_at, updated_at
        ) VALUES (?, ?, 'lease', ?, 1, 'active', 1, NULL, ?, ?)
      `).run(
        handle.intent.projectSessionId,
        handle.intent.coordinationRunId,
        leaseId,
        now,
        now,
      );
      const updatedRun = this.#database.prepare(`
        UPDATE runs
           SET chair_agent_id=?, chair_generation=?, chair_lease_id=?,
               lifecycle_state='active', revision=revision+1
         WHERE run_id=? AND lifecycle_state='recovery_required'
           AND revision=? AND chair_generation=?
      `).run(
        targetAgentId,
        newChairGeneration,
        leaseId,
        handle.intent.coordinationRunId,
        handle.intent.expectedRunRevision,
        handle.intent.expectedChairGeneration,
      );
      if (updatedRun.changes !== 1) stale("run recovery revision changed");
      const updatedSession = this.#database.prepare(`
        UPDATE project_sessions
           SET state='active', generation=generation+1,
               membership_revision=membership_revision+1,
               revision=revision+1, updated_at=?
         WHERE project_session_id=? AND state='recovery_required'
           AND revision=? AND generation=?
      `).run(
        now,
        handle.intent.projectSessionId,
        handle.intent.expectedSessionRevision,
        handle.intent.expectedSessionGeneration,
      );
      if (updatedSession.changes !== 1) stale("project session recovery revision changed");
      const suspendedChair = this.#database.prepare(`
        UPDATE agents SET lifecycle='suspended'
         WHERE run_id=? AND agent_id=(SELECT chair_agent_id FROM chair_bridge_losses WHERE loss_id=?)
      `).run(handle.intent.coordinationRunId, handle.intent.lossId);
      if (suspendedChair.changes !== 1) stale("lost chair identity changed during recovery");
      const activatedChair = this.#database.prepare(`
        UPDATE agents SET lifecycle='ready', provider_session_ref=? WHERE run_id=? AND agent_id=?
      `).run(
        text(target, "new_provider_session_ref"),
        handle.intent.coordinationRunId,
        targetAgentId,
      );
      if (activatedChair.changes !== 1) stale("recovery target identity changed");
      this.#database.prepare(`
        INSERT INTO provider_state(
          run_id, agent_id, provider_session_generation, context_revision, reconciled_checkpoint_sha256
        ) VALUES (?, ?, ?, NULL, NULL)
        ON CONFLICT(run_id, agent_id) DO UPDATE SET
          provider_session_generation=excluded.provider_session_generation,
          context_revision=NULL, reconciled_checkpoint_sha256=NULL
      `).run(
        handle.intent.coordinationRunId,
        targetAgentId,
        integer(target, "new_provider_session_generation"),
      );
      this.#database.prepare(`
        DELETE FROM delivery_freezes
         WHERE run_id=? AND agent_id=(SELECT chair_agent_id FROM chair_bridge_losses WHERE loss_id=?)
      `).run(handle.intent.coordinationRunId, handle.intent.lossId);
      if (handle.intent.path === "takeover") {
        const clearedSuccessor = this.#database.prepare(`
          UPDATE agent_bridge_state
             SET provider_session_ref=NULL, provider_session_generation=NULL,
                 bridge_state='none', capability_hash=NULL, activation_evidence_digest=NULL,
                 revision=revision+1, updated_at=?
           WHERE run_id=? AND agent_id=? AND bridge_state='active' AND revision=?
        `).run(
          now,
          handle.intent.coordinationRunId,
          handle.intent.successorAgentId,
          handle.intent.expectedSuccessorRevision,
        );
        if (clearedSuccessor.changes !== 1) stale("takeover successor bridge changed during recovery");
      }
      const resolution = {
        schemaVersion: 1,
        recoveryId: handle.recoveryId,
        lossId: handle.intent.lossId,
        path: handle.intent.path,
        successorAgentId: targetAgentId,
        newPrincipalGeneration: integer(target, "new_principal_generation"),
        newBridgeGeneration: integer(target, "new_bridge_generation"),
        activationEvidenceDigest,
      };
      const evidenceDigest = jsonEvidenceDigest(resolution);
      this.#database.prepare(`
        INSERT INTO chair_bridge_loss_resolutions(
          loss_id, recovery_id, path, successor_agent_id,
          new_principal_generation, new_bridge_generation, evidence_digest, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        handle.intent.lossId,
        handle.recoveryId,
        handle.intent.path,
        targetAgentId,
        integer(target, "new_principal_generation"),
        integer(target, "new_bridge_generation"),
        evidenceDigest,
        now,
      );
      if (handle.intent.path === "rebind") {
        const providerAction = this.#database.prepare(`
          UPDATE provider_actions
             SET status='terminal', history_json=CASE status
                   WHEN 'ambiguous' THEN '["prepared","dispatched","ambiguous","accepted","terminal"]'
                   WHEN 'accepted' THEN '["prepared","dispatched","accepted","terminal"]'
                   ELSE '["prepared","dispatched","accepted","terminal"]'
                 END,
                 provider_session_generation=?, effect_count=1, idempotency_proven=1,
                 result_json=?, journal_revision=journal_revision+1, updated_at=?
           WHERE adapter_id=? AND action_id=? AND status IN ('dispatched','accepted','ambiguous')
        `).run(
          integer(target, "new_provider_session_generation"),
          canonicalJson(resolution),
          now,
          handle.intent.providerAdapterId,
          handle.intent.providerActionId,
        );
        if (providerAction.changes !== 1) stale("chair recovery provider action changed during commit");
      }
      const commit: ChairRecoveryCommit = {
        status: "committed",
        recoveryId: handle.recoveryId,
        path: handle.intent.path,
        evidenceDigest,
      };
      const terminal = this.#database.prepare(`
        UPDATE chair_bridge_recovery_custody
           SET state='terminal', result_json=?, revision=revision+1, updated_at=?
         WHERE recovery_id=? AND state='committing'
      `).run(canonicalJson(commit), now, handle.recoveryId);
      if (terminal.changes !== 1) stale("chair recovery custody changed before terminal commit");
      return commit;
    })();
  }

  async #recoverChairRecoveryCustody(result: {
    lookedUp: number;
    activated: number;
    failed: number;
    ambiguous: number;
    recoveryRequired: number;
  }): Promise<void> {
    const prepared = this.#database.prepare(`
      SELECT * FROM chair_bridge_recovery_custody WHERE state='prepared' ORDER BY created_at, recovery_id
    `).all().filter(isRow);
    for (const custody of prepared) {
      const now = this.#clock();
      this.#database.transaction(() => {
        if (text(custody, "path") === "rebind" && typeof custody.new_capability_hash === "string") {
          this.#database.prepare(`UPDATE capabilities SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL`)
            .run(now, custody.new_capability_hash);
        }
        if (typeof custody.provider_action_id === "string") {
          const proof = {
            schemaVersion: 1,
            kind: "chair-recovery-pre-dispatch-no-effect",
            recoveryId: text(custody, "recovery_id"),
            executionCount: 0,
          };
          this.#database.prepare(`
            UPDATE provider_actions
               SET status='terminal', history_json='["prepared","terminal"]',
                   execution_count=0, effect_count=0, idempotency_proven=1,
                   result_json=?, journal_revision=journal_revision+1, updated_at=?
             WHERE adapter_id=? AND action_id=? AND status='prepared'
          `).run(
            canonicalJson({ ...proof, evidenceDigest: jsonEvidenceDigest(proof) }),
            now,
            text(custody, "provider_adapter_id"),
            custody.provider_action_id,
          );
        }
        this.#database.prepare(`
          UPDATE chair_bridge_recovery_custody
             SET state='no-effect', result_json=?, revision=revision+1, updated_at=?
           WHERE recovery_id=? AND state='prepared'
        `).run(
          canonicalJson({ status: "no-effect", reason: "prepared-before-restart" }),
          now,
          text(custody, "recovery_id"),
        );
      })();
      result.failed += 1;
      result.recoveryRequired += 1;
    }
    const observable = this.#database.prepare(`
      SELECT * FROM chair_bridge_recovery_custody
       WHERE path='rebind' AND state IN ('dispatched','accepted','ambiguous')
       ORDER BY created_at, recovery_id
    `).all().filter(isRow);
    for (const custody of observable) {
      if (this.#adapterEffects.lookupChairRecovery === undefined || typeof custody.provider_action_id !== "string") {
        result.ambiguous += 1;
        result.recoveryRequired += 1;
        continue;
      }
      let record: unknown;
      try {
        record = await this.#adapterEffects.lookupChairRecovery({
          adapterId: text(custody, "provider_adapter_id"),
          actionId: custody.provider_action_id,
        });
        result.lookedUp += 1;
      } catch {
        result.ambiguous += 1;
        result.recoveryRequired += 1;
        continue;
      }
      const provider = this.#chairRecoveryLookupResult(custody, record);
      if (provider === undefined) {
        result.ambiguous += 1;
        result.recoveryRequired += 1;
        continue;
      }
      const intentValue: unknown = JSON.parse(text(custody, "intent_json"));
      if (!isRow(intentValue) || intentValue.kind !== "chair-bridge-recovery" || intentValue.path !== "rebind") {
        throw new Error("stored chair recovery intent is invalid");
      }
      const intent = intentValue as ChairBridgeRecoveryIntent & { path: "rebind" };
      const handle: ChairRecoveryDispatchHandle & Readonly<{ intent: typeof intent }> = {
        schemaVersion: 1,
        recoveryId: text(custody, "recovery_id"),
        intent,
        intentDigest: text(custody, "intent_digest") as Digest,
        inspectionDigest: jsonEvidenceDigest({ recovery: text(custody, "recovery_id") }),
        operatorId: text(custody, "operator_id"),
        operatorCommandId: text(custody, "operator_command_id"),
      };
      this.#commitActiveChairRecovery(
        handle,
        jsonEvidenceDigest(provider.fabricContinuity),
      );
      result.activated += 1;
    }
    const takeoverObservable = this.#database.prepare(`
      SELECT operator_id, operator_command_id
        FROM chair_bridge_recovery_custody
       WHERE path='takeover' AND state IN ('dispatched','accepted','ambiguous')
       ORDER BY created_at, recovery_id
    `).all().filter(isRow);
    for (const custody of takeoverObservable) {
      const reconciled = await this.reconcileChairRecovery(
        text(custody, "operator_id"),
        text(custody, "operator_command_id"),
      );
      result.lookedUp += 1;
      if (reconciled.status === "committed") result.activated += 1;
      else if (reconciled.status === "no-effect") {
        result.failed += 1;
        result.recoveryRequired += 1;
      } else {
        result.ambiguous += 1;
        result.recoveryRequired += 1;
      }
    }
  }

  async #recoverChairLiveHandoffCustody(
    result: {
      preparedFailed: number;
      lookedUp: number;
      activated: number;
      failed: number;
      ambiguous: number;
      recoveryRequired: number;
    },
    errors: unknown[],
  ): Promise<void> {
    const prepared = this.#database.prepare(`
      SELECT * FROM chair_live_handoff_custody WHERE state='prepared'
       ORDER BY created_at, custody_id
    `).all().filter(isRow);
    for (const custody of prepared) {
      try {
        const intentValue: unknown = JSON.parse(text(custody, "intent_json"));
        if (!isRow(intentValue) || intentValue.kind !== "chair-live-handoff") {
          throw new Error("stored prepared chair live handoff intent is invalid");
        }
        const handle: ChairLiveHandoffDispatchHandle = {
          schemaVersion: 1,
          custodyId: text(custody, "custody_id"),
          promotionActionId: text(custody, "promotion_action_id"),
          intent: intentValue as ChairLiveHandoffIntent,
          intentDigest: text(custody, "intent_digest") as Digest,
          inspectionDigest: jsonEvidenceDigest({ custodyId: text(custody, "custody_id") }),
          operatorId: text(custody, "operator_id"),
          operatorCommandId: text(custody, "operator_command_id"),
        };
        this.#markChairLiveHandoffNoEffect(handle, "prepared-before-restart");
        result.preparedFailed += 1;
        result.failed += 1;
      } catch (error: unknown) {
        errors.push(error);
        result.ambiguous += 1;
        result.recoveryRequired += 1;
      }
    }
    const observable = this.#database.prepare(`
      SELECT operator_id, operator_command_id FROM chair_live_handoff_custody
       WHERE state IN ('dispatched','ambiguous')
       ORDER BY created_at, custody_id
    `).all().filter(isRow);
    for (const custody of observable) {
      try {
        const reconciled = await this.reconcileChairLiveHandoff(
          text(custody, "operator_id"),
          text(custody, "operator_command_id"),
        );
        result.lookedUp += 1;
        if (reconciled.status === "committed") result.activated += 1;
        else if (reconciled.status === "no-effect") result.failed += 1;
        else {
          result.ambiguous += 1;
          result.recoveryRequired += 1;
        }
      } catch (error: unknown) {
        errors.push(error);
        result.ambiguous += 1;
        result.recoveryRequired += 1;
      }
    }
  }

  #chairLiveHandoffInspectionDigest(intent: ChairLiveHandoffIntent): Digest {
    const session = row(this.#database.prepare(`
      SELECT project_id, mode, state, revision, generation, membership_revision
        FROM project_sessions WHERE project_session_id=?
    `).get(intent.projectSessionId), "chair live handoff session");
    const run = row(this.#database.prepare(`
      SELECT chair_agent_id, chair_generation, chair_lease_id, lifecycle_state, revision
        FROM runs WHERE project_session_id=? AND run_id=?
    `).get(intent.projectSessionId, intent.coordinationRunId), "chair live handoff run");
    const lease = row(this.#database.prepare(`
      SELECT holder_agent_id, generation, status FROM run_chair_leases
       WHERE project_session_id=? AND run_id=? AND lease_id=?
    `).get(intent.projectSessionId, intent.coordinationRunId, intent.expectedChairLeaseId), "chair live handoff lease");
    const bridge = row(this.#database.prepare(`
      SELECT * FROM launched_chair_bridge_state
       WHERE project_session_id=? AND coordination_run_id=?
    `).get(intent.projectSessionId, intent.coordinationRunId), "chair live handoff bridge");
    if (
      text(session, "mode") !== "coordinated" || text(session, "state") !== "active" ||
      integer(session, "revision") !== intent.expectedSessionRevision ||
      integer(session, "generation") !== intent.expectedSessionGeneration ||
      integer(session, "membership_revision") !== intent.expectedMembershipRevision ||
      text(run, "lifecycle_state") !== "active" || integer(run, "revision") !== intent.expectedRunRevision ||
      text(run, "chair_agent_id") !== intent.predecessorAgentId ||
      integer(run, "chair_generation") !== intent.expectedChairGeneration ||
      text(run, "chair_lease_id") !== intent.expectedChairLeaseId ||
      text(lease, "holder_agent_id") !== intent.predecessorAgentId ||
      integer(lease, "generation") !== intent.expectedChairGeneration || text(lease, "status") !== "active"
    ) throw new ProjectFabricCoreError("STALE_REVISION", "chair live handoff lifecycle binding changed");
    if (
      text(bridge, "state") !== "active" || integer(bridge, "revision") !== intent.expectedBridgeRevision ||
      text(bridge, "chair_agent_id") !== intent.predecessorAgentId ||
      integer(bridge, "bridge_generation") !== intent.expectedChairBridgeGeneration ||
      integer(bridge, "principal_generation") !== intent.expectedPredecessorPrincipalGeneration ||
      text(bridge, "provider_adapter_id") !== intent.providerAdapterId ||
      text(bridge, "provider_contract_digest") !== intent.providerContractDigest
    ) throw new ProjectFabricCoreError("STALE_REVISION", "chair live handoff bridge binding changed");
    if (!isRow(this.#database.prepare(`
      SELECT 1 FROM capabilities WHERE token_hash=? AND run_id=? AND agent_id=?
       AND principal_generation=? AND revoked_at IS NULL AND expires_at>?
    `).get(
      text(bridge, "capability_hash"),
      intent.coordinationRunId,
      intent.predecessorAgentId,
      intent.expectedPredecessorPrincipalGeneration,
      this.#clock(),
    ))) throw new ProjectFabricCoreError("STALE_PRINCIPAL_GENERATION", "chair live handoff predecessor capability is not live");
    if (isRow(this.#database.prepare(`
      SELECT 1 FROM chair_live_handoff_custody
       WHERE coordination_run_id=? AND state NOT IN ('terminal','no-effect')
    `).get(intent.coordinationRunId))) {
      throw new ProjectFabricCoreError("CONFLICT", "chair live handoff custody is already open");
    }
    if (isRow(this.#database.prepare(`
      SELECT 1 FROM chair_bridge_losses WHERE coordination_run_id=?
       AND loss_id NOT IN (SELECT loss_id FROM chair_bridge_loss_resolutions)
    `).get(intent.coordinationRunId))) {
      throw new ProjectFabricCoreError("RECOVERY_REQUIRED", "lost chair recovery owns this run");
    }
    const projectId = text(session, "project_id");
    if (!isRow(this.#database.prepare(`
      SELECT 1 FROM artifacts WHERE project_id=? AND project_session_id=? AND run_id=?
       AND relative_path=? AND sha256=? AND registry_state='active'
    `).get(
      projectId,
      intent.projectSessionId,
      intent.coordinationRunId,
      intent.handoffRef.path,
      intent.handoffRef.digest,
    ))) throw new ProjectFabricCoreError("ARTIFACT_DIGEST_INVALID", "chair live handoff artifact is not registered to the run");
    const successor = this.#chairLiveHandoffSuccessor(intent);
    if (isRow(this.#database.prepare(`
      SELECT 1 FROM delivery_freezes WHERE run_id=? AND agent_id IN (?,?) LIMIT 1
    `).get(intent.coordinationRunId, intent.predecessorAgentId, intent.successorAgentId))) {
      throw new ProjectFabricCoreError("LIFECYCLE_PRECONDITION_FAILED", "chair live handoff participants are already frozen");
    }
    return jsonEvidenceDigest({ intent, session, run, lease, bridge, successor });
  }

  #chairLiveHandoffSuccessor(intent: ChairLiveHandoffIntent, allowFrozen = false): Row {
    const successor = row(this.#database.prepare(`
      SELECT bridge.*, custody.principal_generation, custody.authority_id,
             authority.authority_hash, authority.parent_authority_id,
             action.status AS action_status, action.execution_count, action.effect_count,
             agent.parent_agent_id, agent.lifecycle
        FROM agent_bridge_state bridge
        JOIN provider_agent_custody custody
          ON custody.run_id=bridge.run_id AND custody.action_id=bridge.action_id
         AND custody.adapter_id=bridge.adapter_id AND custody.target_agent_id=bridge.agent_id
         AND custody.bridge_capable=1
        JOIN provider_actions action
          ON action.run_id=bridge.run_id AND action.adapter_id=bridge.adapter_id
         AND action.action_id=bridge.action_id AND action.target_agent_id=bridge.agent_id
        JOIN agents agent ON agent.run_id=bridge.run_id AND agent.agent_id=bridge.agent_id
        JOIN authorities authority ON authority.run_id=bridge.run_id AND authority.authority_id=custody.authority_id
        JOIN capabilities capability ON capability.token_hash=bridge.capability_hash
         AND capability.run_id=bridge.run_id AND capability.agent_id=bridge.agent_id
         AND capability.principal_generation=custody.principal_generation
       WHERE bridge.run_id=? AND bridge.agent_id=? AND bridge.bridge_state='active'
         AND capability.revoked_at IS NULL AND capability.expires_at>?
    `).get(intent.coordinationRunId, intent.successorAgentId, this.#clock()), "chair live handoff successor");
    const authorityDigest = text(successor, "authority_hash");
    const canonicalAuthorityDigest = authorityDigest.startsWith("sha256:")
      ? authorityDigest
      : `sha256:${authorityDigest}`;
    const predecessorAuthority = row(this.#database.prepare(`
      SELECT authority_id FROM agents WHERE run_id=? AND agent_id=?
    `).get(intent.coordinationRunId, intent.predecessorAgentId), "chair live handoff predecessor authority");
    if (
      text(successor, "adapter_id") !== intent.providerAdapterId ||
      integer(successor, "principal_generation") !== intent.expectedSuccessorPrincipalGeneration ||
      integer(successor, "bridge_generation") !== intent.expectedSuccessorBridgeGeneration ||
      integer(successor, "revision") !== intent.expectedSuccessorBridgeRevision ||
      text(successor, "authority_id") !== intent.successorAuthorityId ||
      canonicalAuthorityDigest !== intent.successorAuthorityDigest ||
      text(successor, "parent_authority_id") !== text(predecessorAuthority, "authority_id") ||
      text(successor, "parent_agent_id") !== intent.predecessorAgentId ||
      text(successor, "action_status") !== "terminal" ||
      integer(successor, "execution_count") !== 1 || integer(successor, "effect_count") !== 1 ||
      (!allowFrozen && text(successor, "lifecycle") !== "ready") ||
      (allowFrozen && !["ready", "suspended"].includes(text(successor, "lifecycle")))
    ) throw new ProjectFabricCoreError("STALE_REVISION", "chair live handoff successor binding changed");
    return successor;
  }

  async #observeChairLiveHandoff(
    handle: ChairLiveHandoffDispatchHandle,
    input: Parameters<NonNullable<LaunchCustodyServiceOptions["adapterEffects"]["lookupRetainedSuccessorBridge"]>>[0],
  ): Promise<ChairLiveHandoffCommit> {
    const lookup = this.#adapterEffects.lookupRetainedSuccessorBridge;
    if (lookup === undefined) return this.#markChairLiveHandoffAmbiguous(handle, "promotion lookup unavailable");
    let observed: "child" | "chair" | "missing";
    try {
      observed = await lookup(input);
    } catch (error: unknown) {
      return this.#markChairLiveHandoffAmbiguous(handle, error);
    }
    if (observed === "chair") return this.#commitChairLiveHandoff(handle);
    if (observed === "child") return this.#markChairLiveHandoffNoEffect(handle, "successor remained a child");
    return this.#markChairLiveHandoffAmbiguous(handle, "promotion state is mixed, missing or unprobeable");
  }

  #markChairLiveHandoffAmbiguous(
    handle: ChairLiveHandoffDispatchHandle,
    evidence: unknown,
  ): ChairLiveHandoffCommit {
    const now = this.#clock();
    const evidenceDigest = jsonEvidenceDigest({
      custodyId: handle.custodyId,
      kind: "chair-live-handoff-ambiguous",
      evidence: evidence instanceof Error ? { name: evidence.name, message: evidence.message } : evidence,
    });
    this.#database.transaction(() => {
      this.#database.prepare(`
        UPDATE chair_live_handoff_custody
           SET state='ambiguous', result_json=?, revision=revision+1, updated_at=?
         WHERE custody_id=? AND state IN ('dispatched','ambiguous')
      `).run(canonicalJson({ status: "ambiguous", evidenceDigest }), now, handle.custodyId);
      this.#database.prepare(`
        UPDATE provider_actions SET status='ambiguous',
               history_json='["prepared","dispatched","ambiguous"]', result_json=?,
               journal_revision=journal_revision+1, updated_at=?
         WHERE adapter_id=? AND action_id=? AND status IN ('dispatched','ambiguous')
      `).run(
        canonicalJson({ kind: "chair-live-handoff-ambiguous", evidenceDigest }),
        now,
        handle.intent.providerAdapterId,
        handle.promotionActionId,
      );
    })();
    return { status: "ambiguous", custodyId: handle.custodyId, evidenceDigest };
  }

  #markChairLiveHandoffNoEffect(
    handle: ChairLiveHandoffDispatchHandle,
    reason: string,
  ): ChairLiveHandoffCommit {
    const now = this.#clock();
    const evidenceDigest = jsonEvidenceDigest({ custodyId: handle.custodyId, kind: "chair-live-handoff-no-effect", reason });
    return this.#database.transaction((): ChairLiveHandoffCommit => {
      const custody = this.#database.prepare(`
        UPDATE chair_live_handoff_custody
           SET state='no-effect', result_json=?, revision=revision+1, updated_at=?
         WHERE custody_id=? AND state IN ('prepared','dispatched','ambiguous')
      `).run(canonicalJson({ status: "no-effect", evidenceDigest, reason }), now, handle.custodyId);
      const action = this.#database.prepare(`
        UPDATE provider_actions SET status='terminal', effect_count=0, idempotency_proven=1,
               history_json=CASE status WHEN 'prepared' THEN '["prepared","terminal"]'
                 ELSE '["prepared","dispatched","terminal"]' END, result_json=?,
               journal_revision=journal_revision+1, updated_at=?
         WHERE adapter_id=? AND action_id=? AND status IN ('prepared','dispatched','ambiguous')
      `).run(
        canonicalJson({ kind: "terminal-no-effect", evidenceDigest, reason }),
        now,
        handle.intent.providerAdapterId,
        handle.promotionActionId,
      );
      const run = this.#database.prepare(`
        UPDATE runs SET lifecycle_state='active', revision=revision+1
         WHERE run_id=? AND lifecycle_state='reconciling' AND revision=?
           AND chair_agent_id=? AND chair_generation=?
      `).run(
        handle.intent.coordinationRunId,
        handle.intent.expectedRunRevision + 1,
        handle.intent.predecessorAgentId,
        handle.intent.expectedChairGeneration,
      );
      const lease = this.#database.prepare(`
        UPDATE run_chair_leases SET status='active', updated_at=?
         WHERE project_session_id=? AND run_id=? AND lease_id=? AND status='frozen'
      `).run(
        now,
        handle.intent.projectSessionId,
        handle.intent.coordinationRunId,
        handle.intent.expectedChairLeaseId,
      );
      if (custody.changes !== 1 || action.changes !== 1 || run.changes !== 1 || lease.changes !== 1) {
        stale("chair live handoff no-effect restoration changed");
      }
      this.#database.prepare(`
        DELETE FROM delivery_freezes WHERE run_id=? AND agent_id IN (?,?)
          AND reason=?
      `).run(
        handle.intent.coordinationRunId,
        handle.intent.predecessorAgentId,
        handle.intent.successorAgentId,
        `chair-live-handoff:${handle.custodyId}`,
      );
      return { status: "no-effect", custodyId: handle.custodyId, evidenceDigest };
    })();
  }

  #commitChairLiveHandoff(handle: ChairLiveHandoffDispatchHandle): ChairLiveHandoffCommit {
    const now = this.#clock();
    const predecessorBridge = row(this.#database.prepare(`
      SELECT * FROM launched_chair_bridge_state
       WHERE project_session_id=? AND coordination_run_id=?
    `).get(handle.intent.projectSessionId, handle.intent.coordinationRunId), "chair live handoff predecessor bridge");
    const successor = this.#chairLiveHandoffSuccessor(handle.intent, true);
    const newBridgeGeneration = Math.max(
      handle.intent.expectedChairBridgeGeneration,
      handle.intent.expectedSuccessorBridgeGeneration,
    ) + 1;
    const evidence = this.#database.transaction((): ChairLiveHandoffCommit => {
      const custody = this.#database.prepare(`
        UPDATE chair_live_handoff_custody
           SET state='committing', revision=revision+1, updated_at=?
         WHERE custody_id=? AND state IN ('dispatched','ambiguous')
      `).run(now, handle.custodyId);
      if (custody.changes !== 1) stale("chair live handoff changed before commit");
      this.#fault("chair-live-handoff:committing");
      const bridge = this.#database.prepare(`
        UPDATE launched_chair_bridge_state
           SET chair_agent_id=?, provider_action_id=?, provider_session_ref=?,
               provider_session_generation=?, principal_generation=?, bridge_generation=?,
               capability_hash=?, activation_evidence_digest=?, revision=revision+1, updated_at=?
         WHERE project_session_id=? AND coordination_run_id=? AND state='active' AND revision=?
           AND chair_agent_id=? AND bridge_generation=?
      `).run(
        handle.intent.successorAgentId,
        handle.promotionActionId,
        text(successor, "provider_session_ref"),
        integer(successor, "provider_session_generation"),
        handle.intent.expectedSuccessorPrincipalGeneration,
        newBridgeGeneration,
        text(successor, "capability_hash"),
        text(successor, "activation_evidence_digest"),
        now,
        handle.intent.projectSessionId,
        handle.intent.coordinationRunId,
        handle.intent.expectedBridgeRevision,
        handle.intent.predecessorAgentId,
        handle.intent.expectedChairBridgeGeneration,
      );
      if (bridge.changes !== 1) stale("chair live handoff bridge changed during commit");
      const predecessorCapability = this.#database.prepare(`
        UPDATE capabilities SET revoked_at=?
         WHERE token_hash=? AND run_id=? AND agent_id=? AND principal_generation=? AND revoked_at IS NULL
      `).run(
        now,
        text(predecessorBridge, "capability_hash"),
        handle.intent.coordinationRunId,
        handle.intent.predecessorAgentId,
        handle.intent.expectedPredecessorPrincipalGeneration,
      );
      const predecessorLease = this.#database.prepare(`
        UPDATE run_chair_leases SET status='revoked', updated_at=?
         WHERE project_session_id=? AND run_id=? AND lease_id=? AND status='frozen'
      `).run(
        now,
        handle.intent.projectSessionId,
        handle.intent.coordinationRunId,
        handle.intent.expectedChairLeaseId,
      );
      if (predecessorCapability.changes !== 1 || predecessorLease.changes !== 1) {
        stale("chair live handoff predecessor fence changed");
      }
      const newChairGeneration = handle.intent.expectedChairGeneration + 1;
      const successorLeaseId = `chair:${handle.intent.coordinationRunId}:${String(newChairGeneration)}:live-handoff`;
      this.#database.prepare(`
        INSERT INTO run_chair_leases(
          project_session_id, run_id, lease_id, holder_agent_id, generation, status, handoff_digest, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        handle.intent.projectSessionId,
        handle.intent.coordinationRunId,
        successorLeaseId,
        handle.intent.successorAgentId,
        newChairGeneration,
        handle.intent.handoffRef.digest,
        now,
      );
      const retiredMembership = this.#database.prepare(`
        UPDATE project_session_memberships
           SET state='abandoned', abandoned_reason='chair-live-handoff',
               revision=revision+1, updated_at=?
         WHERE project_session_id=? AND coordination_run_id=? AND member_kind='lease'
           AND member_id=? AND required=1 AND state='active'
      `).run(
        now,
        handle.intent.projectSessionId,
        handle.intent.coordinationRunId,
        handle.intent.expectedChairLeaseId,
      );
      if (retiredMembership.changes !== 1) stale("chair live handoff predecessor membership changed");
      this.#database.prepare(`
        INSERT INTO project_session_memberships(
          project_session_id, coordination_run_id, member_kind, member_id,
          required, state, revision, abandoned_reason, created_at, updated_at
        ) VALUES (?, ?, 'lease', ?, 1, 'active', 1, NULL, ?, ?)
      `).run(
        handle.intent.projectSessionId,
        handle.intent.coordinationRunId,
        successorLeaseId,
        now,
        now,
      );
      const run = this.#database.prepare(`
        UPDATE runs SET chair_agent_id=?, chair_generation=?, chair_lease_id=?,
               lifecycle_state='active', revision=revision+1
         WHERE run_id=? AND project_session_id=? AND lifecycle_state='reconciling'
           AND revision=? AND chair_generation=? AND chair_agent_id=?
      `).run(
        handle.intent.successorAgentId,
        newChairGeneration,
        successorLeaseId,
        handle.intent.coordinationRunId,
        handle.intent.projectSessionId,
        handle.intent.expectedRunRevision + 1,
        handle.intent.expectedChairGeneration,
        handle.intent.predecessorAgentId,
      );
      const session = this.#database.prepare(`
        UPDATE project_sessions SET generation=generation+1,
               membership_revision=membership_revision+1, revision=revision+1, updated_at=?
         WHERE project_session_id=? AND state='active' AND revision=? AND generation=?
           AND membership_revision=?
      `).run(
        now,
        handle.intent.projectSessionId,
        handle.intent.expectedSessionRevision,
        handle.intent.expectedSessionGeneration,
        handle.intent.expectedMembershipRevision,
      );
      if (run.changes !== 1 || session.changes !== 1) stale("chair live handoff authority state changed");
      this.#database.prepare(`
        UPDATE agents SET lifecycle='suspended' WHERE run_id=? AND agent_id=?
      `).run(handle.intent.coordinationRunId, handle.intent.predecessorAgentId);
      const activated = this.#database.prepare(`
        UPDATE agents SET lifecycle='ready', authority_id=?, provider_session_ref=?
         WHERE run_id=? AND agent_id=? AND authority_id=?
      `).run(
        handle.intent.successorAuthorityId,
        text(successor, "provider_session_ref"),
        handle.intent.coordinationRunId,
        handle.intent.successorAgentId,
        handle.intent.successorAuthorityId,
      );
      const clearedBridge = this.#database.prepare(`
        UPDATE agent_bridge_state
           SET provider_session_ref=NULL, provider_session_generation=NULL,
               bridge_state='none', capability_hash=NULL, activation_evidence_digest=NULL,
               revision=revision+1, updated_at=?
         WHERE run_id=? AND agent_id=? AND bridge_state='active' AND revision=?
      `).run(
        now,
        handle.intent.coordinationRunId,
        handle.intent.successorAgentId,
        handle.intent.expectedSuccessorBridgeRevision,
      );
      if (activated.changes !== 1 || clearedBridge.changes !== 1) stale("chair live handoff successor changed");
      const resolution = {
        schemaVersion: 1,
        custodyId: handle.custodyId,
        predecessorAgentId: handle.intent.predecessorAgentId,
        successorAgentId: handle.intent.successorAgentId,
        promotionActionId: handle.promotionActionId,
        newChairGeneration,
        newBridgeGeneration,
      };
      const evidenceDigest = jsonEvidenceDigest(resolution);
      this.#database.prepare(`
        INSERT INTO chair_live_handoff_resolutions(
          custody_id, project_session_id, coordination_run_id, predecessor_agent_id,
          successor_agent_id, promotion_action_id, new_chair_generation,
          new_bridge_generation, evidence_digest, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        handle.custodyId,
        handle.intent.projectSessionId,
        handle.intent.coordinationRunId,
        handle.intent.predecessorAgentId,
        handle.intent.successorAgentId,
        handle.promotionActionId,
        newChairGeneration,
        newBridgeGeneration,
        evidenceDigest,
        now,
      );
      const action = this.#database.prepare(`
        UPDATE provider_actions SET status='terminal', effect_count=1, idempotency_proven=1,
               history_json=CASE status WHEN 'ambiguous'
                 THEN '["prepared","dispatched","ambiguous","terminal"]'
                 ELSE '["prepared","dispatched","terminal"]' END,
               result_json=?, journal_revision=journal_revision+1, updated_at=?
         WHERE adapter_id=? AND action_id=? AND status IN ('dispatched','ambiguous')
      `).run(
        canonicalJson(resolution),
        now,
        handle.intent.providerAdapterId,
        handle.promotionActionId,
      );
      if (action.changes !== 1) stale("chair live handoff promotion action changed during commit");
      const result = { status: "committed" as const, custodyId: handle.custodyId, evidenceDigest };
      const terminal = this.#database.prepare(`
        UPDATE chair_live_handoff_custody
           SET state='terminal', result_json=?, revision=revision+1, updated_at=?
         WHERE custody_id=? AND state='committing'
      `).run(canonicalJson(result), now, handle.custodyId);
      if (terminal.changes !== 1) stale("chair live handoff terminal state changed");
      this.#database.prepare(`
        DELETE FROM delivery_freezes WHERE run_id=? AND agent_id IN (?,?) AND reason=?
      `).run(
        handle.intent.coordinationRunId,
        handle.intent.predecessorAgentId,
        handle.intent.successorAgentId,
        `chair-live-handoff:${handle.custodyId}`,
      );
      this.#fault("chair-live-handoff:terminal");
      return result;
    })();
    try {
      this.#retireVolatileChairBridge?.({
        projectSessionId: handle.intent.projectSessionId,
        runId: handle.intent.coordinationRunId,
        agentId: handle.intent.predecessorAgentId,
        principalGeneration: handle.intent.expectedPredecessorPrincipalGeneration,
        adapterId: text(predecessorBridge, "provider_adapter_id"),
        actionId: text(predecessorBridge, "provider_action_id"),
        providerSessionRef: text(predecessorBridge, "provider_session_ref"),
        providerSessionGeneration: integer(predecessorBridge, "provider_session_generation"),
        bridgeGeneration: handle.intent.expectedChairBridgeGeneration,
      });
    } catch { /* durable successor fencing already committed */ }
    return evidence;
  }

  #chairRecoveryInspectionDigest(intent: ChairBridgeRecoveryIntent): Digest {
    if (isRow(this.#database.prepare(`
      SELECT 1 FROM chair_live_handoff_custody
       WHERE coordination_run_id=? AND state NOT IN ('terminal','no-effect') LIMIT 1
    `).get(intent.coordinationRunId))) {
      throw new ProjectFabricCoreError("CONFLICT", "chair live handoff custody owns this run");
    }
    const loss = row(this.#database.prepare(`
      SELECT * FROM chair_bridge_losses WHERE loss_id=?
    `).get(intent.lossId), "chair bridge loss");
    const bridge = row(this.#database.prepare(`
      SELECT * FROM launched_chair_bridge_state
       WHERE project_session_id=? AND coordination_run_id=?
    `).get(intent.projectSessionId, intent.coordinationRunId), "launched chair bridge");
    const session = row(this.#database.prepare(`
      SELECT project_id, state, revision, generation FROM project_sessions WHERE project_session_id=?
    `).get(intent.projectSessionId), "chair recovery project session");
    const run = row(this.#database.prepare(`
      SELECT lifecycle_state, revision, chair_agent_id, chair_generation FROM runs
       WHERE project_session_id=? AND run_id=?
    `).get(intent.projectSessionId, intent.coordinationRunId), "chair recovery run");
    if (
      text(loss, "project_session_id") !== intent.projectSessionId ||
      text(loss, "coordination_run_id") !== intent.coordinationRunId ||
      text(loss, "recovery_manifest_digest") !== intent.recoveryManifestDigest ||
      integer(loss, "principal_generation") !== intent.expectedPrincipalGeneration ||
      integer(loss, "lost_bridge_generation") !== intent.expectedLostBridgeGeneration ||
      integer(loss, "provider_session_generation") !== intent.expectedProviderSessionGeneration ||
      text(loss, "provider_adapter_id") !== intent.providerAdapterId ||
      text(loss, "provider_contract_digest") !== intent.providerContractDigest ||
      text(bridge, "state") !== "lost" ||
      integer(bridge, "revision") !== intent.expectedBridgeRevision ||
      text(session, "state") !== "recovery_required" ||
      integer(session, "revision") !== intent.expectedSessionRevision ||
      integer(session, "generation") !== intent.expectedSessionGeneration ||
      text(run, "lifecycle_state") !== "recovery_required" ||
      integer(run, "revision") !== intent.expectedRunRevision ||
      integer(run, "chair_generation") !== intent.expectedChairGeneration
    ) throw new ProjectFabricCoreError("STALE_REVISION", "chair recovery binding is stale");
    if (this.#hasValidBridgeRetirement(intent.projectSessionId, intent.coordinationRunId)) {
      throw new ProjectFabricCoreError("CONFLICT", "retired chair bridge cannot enter recovery");
    }
    if (this.#database.prepare(`
      SELECT 1 FROM chair_bridge_loss_resolutions WHERE loss_id=?
    `).get(intent.lossId) !== undefined) {
      throw new ProjectFabricCoreError("CONFLICT", "chair bridge loss is already resolved");
    }
    if (intent.path === "rebind" && this.#database.prepare(`
      SELECT 1 FROM provider_actions WHERE adapter_id=? AND action_id=?
    `).get(intent.providerAdapterId, intent.providerActionId) !== undefined) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "chair recovery provider action is already used");
    }
    const successor = intent.path === "takeover" ? this.#chairRecoverySuccessor(intent) : null;
    return jsonEvidenceDigest({ intent, loss, bridge, session, run, successor });
  }

  #chairRecoverySuccessor(
    intent: Extract<ChairBridgeRecoveryIntent, { path: "takeover" }>,
  ): Row {
    const successor = row(this.#database.prepare(`
      SELECT bridge.*, custody.principal_generation
        FROM agent_bridge_state bridge
        JOIN provider_agent_custody custody
          ON custody.run_id=bridge.run_id AND custody.action_id=bridge.action_id
         AND custody.adapter_id=bridge.adapter_id AND custody.target_agent_id=bridge.agent_id
         AND custody.bridge_capable=1
        JOIN provider_actions action
          ON action.adapter_id=bridge.adapter_id AND action.action_id=bridge.action_id
         AND action.run_id=bridge.run_id AND action.target_agent_id=bridge.agent_id
         AND action.status='terminal' AND action.execution_count=1 AND action.effect_count=1
        JOIN agents agent
          ON agent.run_id=bridge.run_id AND agent.agent_id=bridge.agent_id
         AND agent.authority_id=custody.authority_id AND agent.lifecycle='ready'
         AND agent.provider_session_ref=bridge.provider_session_ref
        JOIN authorities authority
          ON authority.authority_id=custody.authority_id AND authority.run_id=bridge.run_id
        JOIN capabilities capability
          ON capability.token_hash=bridge.capability_hash
         AND capability.run_id=bridge.run_id AND capability.agent_id=bridge.agent_id
         AND capability.principal_generation=custody.principal_generation
       WHERE bridge.run_id=? AND bridge.agent_id=? AND bridge.bridge_state='active'
         AND capability.revoked_at IS NULL AND capability.expires_at>?
         AND agent.parent_agent_id=(
           SELECT chair_agent_id FROM chair_bridge_losses WHERE loss_id=?
         )
    `).get(
      intent.coordinationRunId,
      intent.successorAgentId,
      this.#clock(),
      intent.lossId,
    ), "chair recovery successor bridge");
    if (
      text(successor, "adapter_id") !== intent.providerAdapterId ||
      integer(successor, "principal_generation") !== intent.expectedSuccessorPrincipalGeneration ||
      integer(successor, "bridge_generation") !== intent.expectedSuccessorBridgeGeneration ||
      integer(successor, "revision") !== intent.expectedSuccessorRevision
    ) throw new ProjectFabricCoreError("STALE_REVISION", "chair recovery successor bridge changed");
    return successor;
  }

  #persistChairBridgeLoss(input: ChairBridgeLossObservation): boolean {
    const stateValue = this.#database.prepare(`
      SELECT * FROM launched_chair_bridge_state
       WHERE project_session_id=? AND coordination_run_id=?
    `).get(input.projectSessionId, input.runId);
    if (!isRow(stateValue)) return false;
    if (this.#hasValidBridgeRetirement(input.projectSessionId, input.runId)) return false;
    const state = stateValue;
    const exact =
      text(state, "chair_agent_id") === input.agentId &&
      text(state, "provider_adapter_id") === input.adapterId &&
      text(state, "provider_action_id") === input.actionId &&
      text(state, "provider_session_ref") === input.providerSessionRef &&
      integer(state, "provider_session_generation") === input.providerSessionGeneration &&
      integer(state, "principal_generation") === input.principalGeneration &&
      integer(state, "bridge_generation") === input.bridgeGeneration;
    if (!exact) throw new ProjectFabricCoreError("STALE_GENERATION", "chair bridge loss does not match retained custody");
    if (text(state, "state") === "lost") return false;
    if (text(state, "state") !== "active") {
      throw new ProjectFabricCoreError("CONFLICT", "chair bridge is not active");
    }
    const reason = input.reason.slice(0, 160) || "retained chair bridge lost";
    const now = this.#clock();
    const daemonInstanceGeneration = this.#daemonInstanceGeneration();
    const recoveryManifestDigest = this.#chairRecoveryManifestDigest(input);
    const lossBinding = {
      projectSessionId: input.projectSessionId,
      runId: input.runId,
      agentId: input.agentId,
      principalGeneration: input.principalGeneration,
      adapterId: input.adapterId,
      actionId: input.actionId,
      providerSessionRef: input.providerSessionRef,
      providerSessionGeneration: input.providerSessionGeneration,
      bridgeGeneration: input.bridgeGeneration,
      daemonInstanceGeneration,
      reason,
      recoveryManifestDigest,
    };
    const lossId = `chair-bridge-loss:${sha256(canonicalJson({
      runId: input.runId,
      bridgeGeneration: input.bridgeGeneration,
      capabilityHash: text(state, "capability_hash"),
    }))}`;
    const sessionBeforeLoss = row(this.#database.prepare(`
      SELECT state FROM project_sessions WHERE project_session_id=?
    `).get(input.projectSessionId), "chair loss project session");
    const priorSessionState = text(sessionBeforeLoss, "state");
    const superseded = priorSessionState === "quiescing" || priorSessionState === "awaiting_acceptance"
      ? supersedeFinalAcceptanceGates({
          database: this.#database,
          projectSessionId: input.projectSessionId,
          cause: { kind: "chair-bridge-loss", ref: lossId },
          reason: "chair bridge loss exited the acceptance cycle",
          now,
        })
      : { gateChanges: 0, membershipChanges: 0 };
    const evidenceDigest = jsonEvidenceDigest(lossBinding);
    this.#database.prepare(`
      INSERT INTO chair_bridge_losses(
        loss_id, project_session_id, coordination_run_id, chair_agent_id,
        provider_adapter_id, provider_action_id, provider_contract_digest, provider_session_ref,
        provider_session_generation, principal_generation, lost_bridge_generation,
        next_bridge_generation, capability_hash, daemon_instance_generation,
        reason, evidence_digest, recovery_manifest_digest, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      lossId,
      input.projectSessionId,
      input.runId,
      input.agentId,
      input.adapterId,
      input.actionId,
      text(state, "provider_contract_digest"),
      input.providerSessionRef,
      input.providerSessionGeneration,
      input.principalGeneration,
      input.bridgeGeneration,
      input.bridgeGeneration + 1,
      text(state, "capability_hash"),
      daemonInstanceGeneration,
      reason,
      evidenceDigest,
      recoveryManifestDigest,
      now,
    );
    const changed = this.#database.prepare(`
      UPDATE launched_chair_bridge_state
         SET state='lost', revision=revision+1, updated_at=?
       WHERE project_session_id=? AND coordination_run_id=?
         AND state='active' AND revision=?
    `).run(now, input.projectSessionId, input.runId, integer(state, "revision"));
    if (changed.changes !== 1) stale("chair bridge state changed during loss fencing");
    const revokedCapability = this.#database.prepare(
      "UPDATE capabilities SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL",
    ).run(now, text(state, "capability_hash"));
    if (revokedCapability.changes !== 1) stale("chair capability changed during loss fencing");
    const frozenLease = this.#database.prepare(`
      UPDATE run_chair_leases SET status='frozen', updated_at=?
       WHERE project_session_id=? AND run_id=? AND holder_agent_id=? AND status='active'
    `).run(now, input.projectSessionId, input.runId, input.agentId);
    if (frozenLease.changes !== 1) stale("active chair lease changed during loss fencing");
    this.#database.prepare(`
      INSERT INTO delivery_freezes(run_id, agent_id, reason, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(run_id, agent_id) DO UPDATE SET
        reason=excluded.reason, created_at=excluded.created_at
    `).run(input.runId, input.agentId, lossId, now);
    const suspended = this.#database.prepare(
      "UPDATE agents SET lifecycle='suspended' WHERE run_id=? AND agent_id=?",
    ).run(input.runId, input.agentId);
    if (suspended.changes !== 1) stale("chair identity changed during loss fencing");
    const fencedRun = this.#database.prepare(`
      UPDATE runs SET lifecycle_state='recovery_required', revision=revision+1
       WHERE run_id=? AND lifecycle_state IN (
         'active','quiescing','awaiting_acceptance','visibility_degraded',
         'reconciling','quarantined'
       )
    `).run(input.runId);
    if (fencedRun.changes !== 1) stale("run state changed during chair loss fencing");
    const fencedSession = this.#database.prepare(`
      UPDATE project_sessions
         SET state='recovery_required', membership_revision=membership_revision+?,
             revision=revision+1, updated_at=?
       WHERE project_session_id=? AND state IN (
         'active','quiescing','awaiting_acceptance','visibility_degraded',
         'reconciling','quarantined'
       )
    `).run(superseded.membershipChanges + superseded.gateChanges > 0 ? 1 : 0, now, input.projectSessionId);
    if (fencedSession.changes !== 1) stale("project session state changed during chair loss fencing");
    return true;
  }

  #chairRecoveryManifestDigest(input: RetainedChairBridge): Digest {
    const manifest = {
      schemaVersion: 1,
      projectSession: this.#database.prepare(`
        SELECT project_session_id, state, revision, generation, membership_revision
          FROM project_sessions WHERE project_session_id=?
      `).get(input.projectSessionId),
      run: this.#database.prepare(`
        SELECT run_id, lifecycle_state, revision, chair_agent_id, chair_generation,
               chair_lease_id, authority_ref, dependency_revision
          FROM runs WHERE run_id=?
      `).get(input.runId),
      tasks: this.#database.prepare(`
        SELECT task_id, state, owner_agent_id, revision, owner_lease_generation
          FROM tasks WHERE run_id=? ORDER BY task_id
      `).all(input.runId),
      mailbox: this.#database.prepare(`
        SELECT recipient_id, next_sequence, contiguous_watermark
          FROM mailbox_state WHERE run_id=? ORDER BY recipient_id
      `).all(input.runId),
      leases: this.#database.prepare(`
        SELECT lease_id, kind, holder_agent_id, generation, status, expires_at
          FROM leases WHERE run_id=? ORDER BY lease_id
      `).all(input.runId),
      chairLeases: this.#database.prepare(`
        SELECT lease_id, holder_agent_id, generation, status, handoff_digest
          FROM run_chair_leases WHERE run_id=? ORDER BY generation
      `).all(input.runId),
      checkpoints: this.#database.prepare(`
        SELECT checkpoint_id, agent_id, task_id, task_revision, sha256, created_at
          FROM lifecycle_checkpoints WHERE run_id=? ORDER BY checkpoint_id
      `).all(input.runId),
      provider: this.#database.prepare(`
        SELECT provider_session_generation, context_revision, reconciled_checkpoint_sha256
          FROM provider_state WHERE run_id=? AND agent_id=?
      `).get(input.runId, input.agentId),
      providerAction: this.#database.prepare(`
        SELECT status, journal_revision, provider_session_generation, effect_count
          FROM provider_actions WHERE adapter_id=? AND action_id=?
      `).get(input.adapterId, input.actionId),
      memberships: this.#database.prepare(`
        SELECT member_kind, member_id, required, state, revision, abandoned_reason
          FROM project_session_memberships
         WHERE project_session_id=? AND coordination_run_id=?
         ORDER BY member_kind, member_id
      `).all(input.projectSessionId, input.runId),
    };
    return jsonEvidenceDigest(manifest);
  }

  #auditRetainedChairBridges(
    result: { recoveryRequired: number; ambiguous: number },
    errors: unknown[],
  ): void {
    const hasRetainedBridge = this.#adapterEffects.hasRetainedChairBridge;
    if (hasRetainedBridge === undefined) return;
    const active = this.#database.prepare(`
      SELECT * FROM launched_chair_bridge_state bridge WHERE state='active'
       ORDER BY project_session_id, coordination_run_id
    `).all().filter(isRow).filter((state) => !this.#hasValidBridgeRetirement(
      text(state, "project_session_id"),
      text(state, "coordination_run_id"),
    ));
    for (const state of active) {
      const entry: RetainedChairBridge = {
        projectSessionId: text(state, "project_session_id"),
        runId: text(state, "coordination_run_id"),
        agentId: text(state, "chair_agent_id"),
        principalGeneration: integer(state, "principal_generation"),
        adapterId: text(state, "provider_adapter_id"),
        actionId: text(state, "provider_action_id"),
        providerSessionRef: text(state, "provider_session_ref"),
        providerSessionGeneration: integer(state, "provider_session_generation"),
        bridgeGeneration: integer(state, "bridge_generation"),
      };
      let retained = false;
      let reason = "daemon startup found no exact retained chair bridge";
      try {
        retained = hasRetainedBridge(entry);
      } catch (error: unknown) {
        reason = `daemon startup chair bridge audit failed: ${error instanceof Error ? error.name : "unknown error"}`;
      }
      if (retained) continue;
      try {
        const persisted = this.#database.transaction(() => this.#persistChairBridgeLoss({
          ...entry,
          reason,
        }))();
        if (persisted) result.recoveryRequired += 1;
      } catch (error: unknown) {
        // Keep auditing sibling sessions. The unchanged row remains visible on the next recovery pass.
        result.ambiguous += 1;
        errors.push(error);
      }
    }
  }

  #hasValidBridgeRetirement(projectSessionId: string, coordinationRunId: string): boolean {
    return this.#database.prepare(`
      SELECT 1
        FROM launched_chair_bridge_retirements retirement
        JOIN launched_chair_bridge_state bridge
          ON bridge.project_session_id=retirement.project_session_id
         AND bridge.coordination_run_id=retirement.coordination_run_id
        JOIN runs run ON run.project_session_id=bridge.project_session_id
                     AND run.run_id=bridge.coordination_run_id
        JOIN project_sessions session ON session.project_session_id=bridge.project_session_id
        JOIN run_chair_leases lease
          ON lease.project_session_id=run.project_session_id
         AND lease.run_id=run.run_id
         AND lease.lease_id=run.chair_lease_id
         AND lease.generation=run.chair_generation
        JOIN capabilities capability ON capability.token_hash=bridge.capability_hash
        JOIN agents agent ON agent.run_id=bridge.coordination_run_id
                         AND agent.agent_id=bridge.chair_agent_id
       WHERE retirement.project_session_id=? AND retirement.coordination_run_id=?
         AND bridge.state IN ('active','abandoned')
         AND run.lifecycle_state IN ('closed','cancelled','launch_failed')
         AND session.state IN ('closed','cancelled')
         AND session.terminal_path_json=retirement.terminal_ref
         AND json_valid(session.terminal_path_json)=1
         AND json_extract(session.terminal_path_json,'$.kind')=retirement.terminal_kind
         AND run.chair_agent_id=bridge.chair_agent_id
         AND lease.holder_agent_id=bridge.chair_agent_id
         AND lease.status='revoked'
         AND capability.revoked_at IS NOT NULL
         AND agent.lifecycle='archived'
         AND (
           (retirement.source_kind='project-session-close' AND EXISTS (
             SELECT 1 FROM operator_commands command
              WHERE command.project_session_id=retirement.project_session_id
                AND command.command_id=retirement.owner_ref
                AND command.operator_id=retirement.owner_operator_id
                AND command.operation='decide' AND command.status='committed'
                AND json_valid(command.result_json)=1
                AND json_extract(command.result_json,'$.projectSessionId')=retirement.project_session_id
                AND json_extract(command.result_json,'$.terminalPath.kind')=retirement.terminal_kind
           )) OR
           (retirement.source_kind='project-session-stop' AND EXISTS (
             SELECT 1 FROM operator_effect_custody custody
              WHERE custody.project_session_id=retirement.project_session_id
                AND custody.command_id=retirement.owner_ref
                AND custody.operator_id=retirement.owner_operator_id
                AND custody.operation='project-session-stop'
                AND custody.state IN ('dispatching','terminal')
                AND json_valid(custody.intent_json)=1
                AND json_extract(custody.intent_json,'$.kind')='project-session-stop'
                AND json_extract(custody.intent_json,'$.projectSessionId')=retirement.project_session_id
           )) OR
           (retirement.source_kind='chair-recovery-abandon' AND EXISTS (
             SELECT 1 FROM chair_bridge_recovery_custody recovery
              JOIN chair_bridge_losses loss ON loss.loss_id=recovery.loss_id
              WHERE recovery.recovery_id=retirement.owner_ref AND recovery.path='abandon'
                AND recovery.operator_id=retirement.owner_operator_id
                AND recovery.state='terminal'
                AND loss.project_session_id=retirement.project_session_id
                AND loss.coordination_run_id=retirement.coordination_run_id
           ))
         )
       LIMIT 1
    `).get(projectSessionId, coordinationRunId) !== undefined;
  }

  async provisionAgent(input: AgentCustodyInput): Promise<AgentCustodyResult> {
    const key = `${input.adapterId}\0${input.actionId}`;
    const existing = this.#agentInFlight.get(key);
    if (existing !== undefined) return await existing;
    const work = this.#provisionAgentOnce(input);
    this.#agentInFlight.set(key, work);
    try {
      return await work;
    } finally {
      if (this.#agentInFlight.get(key) === work) this.#agentInFlight.delete(key);
    }
  }

  async #provisionAgentOnce(input: AgentCustodyInput): Promise<AgentCustodyResult> {
    if (input.operation === "spawn" && input.bridgeContract === undefined) {
      throw new ProjectFabricCoreError("CAPABILITY_UNAVAILABLE", "adapter cannot provision a retained child bridge");
    }
    if (
      input.bridgeContract !== undefined &&
      !input.bridgeContract.operations.includes(input.operation)
    ) {
      if (input.operation === "spawn") {
        throw new ProjectFabricCoreError("CAPABILITY_UNAVAILABLE", "adapter cannot provision a spawn bridge");
      }
    }
    const providerActionTicket = this.#providerActionAdmission.preflightAgentAction({
      runId: input.runId,
      actorAgentId: input.actorAgentId,
      actionRef: { adapterId: input.adapterId, actionId: input.actionId },
      canonicalInput: {
        schemaVersion: 1,
        operation: input.operation,
        actorAgentId: input.actorAgentId,
        targetAgentId: input.agentId,
        authorityId: input.authorityId,
        payload: input.payload,
        providerSessionRef: input.providerSessionRef ?? null,
      },
    });
    const prepared = this.#database.transaction(() => (
      this.prepareAgentInTransaction(input, providerActionTicket)
    )).immediate();
    if (prepared.kind === "replay") return prepared.result;
    return await this.dispatchPreparedAgent(prepared.handle);
  }

  prepareAgentInTransaction(input: AgentCustodyInput, providerActionTicket: ProviderActionTicket):
    | { kind: "dispatch"; handle: AgentDispatchHandle }
    | { kind: "replay"; result: AgentCustodyResult } {
    if (!this.#database.inTransaction) throw new Error("agent custody preparation requires a transaction");
    const bridgeCapable = input.bridgeContract?.operations.includes(input.operation) === true;
    const bridgeContractDigest = `sha256:${sha256(canonicalJson(
      input.bridgeContract ?? { schemaVersion: 1, kind: "bridge-unavailable", adapterId: input.adapterId },
    ))}` as Digest;
    const intentDigest = `sha256:${sha256(canonicalJson({
      runId: input.runId,
      actorAgentId: input.actorAgentId,
      operation: input.operation,
      agentId: input.agentId,
      authorityId: input.authorityId,
      adapterId: input.adapterId,
      actionId: input.actionId,
      payload: input.payload,
      providerSessionRef: input.providerSessionRef ?? null,
      bridgeContractDigest,
      bridgeCapable,
    }))}` as Digest;
    const existing = this.#database.prepare(`
      SELECT c.intent_digest, p.status, p.result_json,
             b.bridge_state, b.bridge_generation
        FROM provider_agent_custody c
        JOIN provider_actions p
          ON p.run_id=c.run_id AND p.adapter_id=c.adapter_id AND p.action_id=c.action_id
        LEFT JOIN agent_bridge_state b ON b.run_id=c.run_id AND b.agent_id=c.target_agent_id
       WHERE c.adapter_id=? AND c.action_id=?
    `).get(input.adapterId, input.actionId);
    if (isRow(existing)) {
      if (existing.intent_digest !== intentDigest) {
        throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "agent custody action was reused with changed input");
      }
      if (existing.status === "terminal" && typeof existing.result_json === "string") {
        const stored: unknown = JSON.parse(existing.result_json);
        if (isRow(stored) && stored.kind === "agent-custody-pre-dispatch-no-effect") {
          throw new ProjectFabricCoreError(
            "CONTEXT_UNRECONCILED",
            "agent custody was proved not dispatched before daemon restart",
          );
        }
        const parsed = parseOperationResult(
          input.operation === "spawn" ? FABRIC_OPERATIONS.spawnAgent : FABRIC_OPERATIONS.attachAgent,
          stored,
        );
        if (
          isRow(parsed) && parsed.bridgeState === "active" &&
          (
            existing.bridge_state !== "active" ||
            existing.bridge_generation !== parsed.bridgeGeneration
          )
        ) {
          throw new ProjectFabricCoreError(
            "CONTEXT_UNRECONCILED",
            "agent custody result outlived its retained provider bridge",
          );
        }
        return { kind: "replay", result: parsed as AgentCustodyResult };
      }
      throw new ProjectFabricCoreError("CONFLICT", "agent custody action is already in progress");
    }

    const actor = row(this.#database.prepare(`
      SELECT authority_id FROM agents WHERE run_id=? AND agent_id=?
    `).get(input.runId, input.actorAgentId), "agent custody actor");
    const authority = row(this.#database.prepare(`
      SELECT parent_authority_id, authority_json, authority_hash FROM authorities
       WHERE run_id=? AND authority_id=?
    `).get(input.runId, input.authorityId), "agent custody authority");
    if (authority.parent_authority_id !== actor.authority_id) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "actor cannot provision this agent authority");
    }
    const authorityValue = readStoredAuthority(authority, "agent custody authority");
    const expiresAt = Date.parse(authorityValue.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= this.#clock()) {
      throw new ProjectFabricCoreError("CAPABILITY_EXPIRED", "agent custody authority is expired");
    }

    const currentAgent = this.#database.prepare(`
      SELECT parent_agent_id, authority_id FROM agents WHERE run_id=? AND agent_id=?
    `).get(input.runId, input.agentId);
    if (isRow(currentAgent)) {
      if (currentAgent.parent_agent_id !== input.actorAgentId || currentAgent.authority_id !== input.authorityId) {
        throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "agent identity was reused with changed authority");
      }
    } else {
      this.#database.prepare(`
        INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, provider_session_ref)
        VALUES (?, ?, ?, ?, NULL)
      `).run(input.runId, input.agentId, input.actorAgentId, input.authorityId);
      this.#database.prepare("INSERT INTO mailbox_state(run_id, recipient_id) VALUES (?, ?)")
        .run(input.runId, input.agentId);
    }
    this.#fault("agent:prepare:identity");

    const priorBridge = this.#database.prepare(`
      SELECT bridge_generation, bridge_state FROM agent_bridge_state WHERE run_id=? AND agent_id=?
    `).get(input.runId, input.agentId);
    if (isRow(priorBridge) && (priorBridge.bridge_state === "active" || priorBridge.bridge_state === "pending")) {
      throw new ProjectFabricCoreError("CONFLICT", "agent already has an active or pending provider bridge");
    }
    const bridgeGeneration = !isRow(priorBridge)
      ? 1
      : priorBridge.bridge_state === "lost"
        ? integer(priorBridge, "bridge_generation")
        : integer(priorBridge, "bridge_generation") + 1;
    let capability: string | undefined;
    let capabilityHash: string | null = null;
    let principalGeneration: number | null = null;
    if (bridgeCapable) {
      principalGeneration = integer(row(this.#database.prepare(`
        SELECT COALESCE(MAX(principal_generation), 0) + 1 AS generation
          FROM capabilities WHERE run_id=? AND agent_id=?
      `).get(input.runId, input.agentId), "agent principal generation"), "generation");
      capability = this.#randomCapability();
      if (!/^afc_[A-Za-z0-9_-]{32,}$/u.test(capability)) {
        throw new Error("random agent capability has invalid format");
      }
      capabilityHash = sha256(capability);
      this.#database.prepare(`
        UPDATE capabilities SET revoked_at=?
         WHERE run_id=? AND agent_id=? AND revoked_at IS NULL
      `).run(this.#clock(), input.runId, input.agentId);
      this.#database.prepare(`
        INSERT INTO capabilities(token_hash, run_id, agent_id, principal_generation, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(capabilityHash, input.runId, input.agentId, principalGeneration, expiresAt);
    }
    const projectSessionId = text(row(this.#database.prepare(`
      SELECT project_session_id FROM runs WHERE run_id=?
    `).get(input.runId), "agent custody run"), "project_session_id");
    this.#fault("agent:prepare:capability");

    const publicPayload = {
      schemaVersion: 1,
      operation: input.operation,
      actorAgentId: input.actorAgentId,
      targetAgentId: input.agentId,
      authorityId: input.authorityId,
      bridgeGeneration,
      bridgeContractDigest,
      payload: input.payload,
      ...(input.providerSessionRef === undefined ? {} : { providerSessionRef: input.providerSessionRef }),
    };
    const payloadJson = canonicalJson(publicPayload);
    this.#providerActionAdmission.admitUnroutedInCurrentTransaction(providerActionTicket, {
      runId: input.runId,
      actionId: input.actionId,
      adapterId: input.adapterId,
      operation: input.operation,
      targetAgentId: input.agentId,
      identityHash: sha256(canonicalJson({ input: publicPayload, intentDigest })),
      payloadHash: sha256(payloadJson),
      payloadJson,
      status: "prepared",
      historyJson: '["prepared"]',
      executionCount: 0,
      updatedAt: this.#clock(),
    });
    this.#fault("agent:prepare:action");
    this.#database.prepare(`
      INSERT INTO provider_agent_custody(
        run_id, action_id, operation, actor_agent_id, target_agent_id, authority_id,
        adapter_id, bridge_contract_digest, bridge_capable, capability_hash,
        capability_expires_at, principal_generation, requested_provider_session_ref,
        intent_digest, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.runId,
      input.actionId,
      input.operation,
      input.actorAgentId,
      input.agentId,
      input.authorityId,
      input.adapterId,
      bridgeContractDigest,
      bridgeCapable ? 1 : 0,
      capabilityHash,
      bridgeCapable ? expiresAt : null,
      principalGeneration,
      input.providerSessionRef ?? null,
      intentDigest,
      this.#clock(),
    );
    this.#fault("agent:prepare:custody");
    const bridgeValues = [
      input.runId,
      input.agentId,
      input.adapterId,
      input.actionId,
      bridgeCapable ? "pending" : "none",
      bridgeGeneration,
      capabilityHash,
      this.#clock(),
      this.#clock(),
    ];
    this.#database.prepare(`
      INSERT INTO agent_bridge_state(
        run_id, agent_id, adapter_id, action_id, provider_session_ref,
        provider_session_generation, bridge_state, bridge_generation,
        capability_hash, activation_evidence_digest, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, 1, ?, ?)
      ON CONFLICT(run_id, agent_id) DO UPDATE SET
        adapter_id=excluded.adapter_id,
        action_id=excluded.action_id,
        provider_session_ref=NULL,
        provider_session_generation=NULL,
        bridge_state=excluded.bridge_state,
        bridge_generation=excluded.bridge_generation,
        capability_hash=excluded.capability_hash,
        activation_evidence_digest=NULL,
        revision=agent_bridge_state.revision+1,
        updated_at=excluded.updated_at
    `).run(...bridgeValues);
    this.#fault("agent:prepare:bridge-state");
    return {
      kind: "dispatch",
      handle: {
        schemaVersion: 1,
        runId: input.runId,
        operation: input.operation,
        actorAgentId: input.actorAgentId,
        targetAgentId: input.agentId,
        authorityId: input.authorityId,
        adapterId: input.adapterId,
        actionId: input.actionId,
        publicPayload: input.payload,
        ...(input.providerSessionRef === undefined ? {} : { requestedProviderSessionRef: input.providerSessionRef }),
        bridgeCapable,
        bridgeContractDigest,
        bridgeGeneration,
        ...(capability === undefined ? {} : {
          capability,
          socketPath: this.#fabricSocketPath,
          expectedPrincipal: {
            agentId: input.agentId,
            projectSessionId,
            runId: input.runId,
            principalGeneration: principalGeneration as number,
          },
        }),
      },
    };
  }

  async dispatchPreparedAgent(handle: AgentDispatchHandle): Promise<AgentCustodyResult> {
    if (this.#agentEffects === undefined) throw new Error("agent custody effects are unavailable");
    const key = `${handle.adapterId}\0${handle.actionId}`;
    if (this.#consumedAgentHandles.has(key)) {
      throw new ProjectFabricCoreError("DEDUPE_CONFLICT", "agent custody handoff is one-use");
    }
    const changed = this.#database.prepare(`
      UPDATE provider_actions
         SET status='dispatched', history_json='["prepared","dispatched"]',
             execution_count=1, journal_revision=journal_revision+1, updated_at=?
       WHERE adapter_id=? AND action_id=? AND status='prepared'
         AND EXISTS (
           SELECT 1 FROM provider_agent_custody c
            WHERE c.adapter_id=provider_actions.adapter_id
              AND c.action_id=provider_actions.action_id
              AND c.bridge_contract_digest=?
         )
    `).run(this.#clock(), handle.adapterId, handle.actionId, handle.bridgeContractDigest);
    if (changed.changes !== 1) throw new ProjectFabricCoreError("CONFLICT", "agent action is not prepared");
    this.#consumedAgentHandles.add(key);
    try {
      const raw = handle.bridgeCapable
        ? await this.#agentEffects.dispatch(handle)
        : await this.#agentEffects.attachWithoutBridge(handle);
      const result = this.#normaliseAgentResult(handle, raw);
      if (handle.bridgeCapable && !this.#agentEffects.hasRetainedBridge(result, handle)) {
        throw new ProjectFabricCoreError("CONTEXT_UNRECONCILED", "agent provider bridge was not retained");
      }
      this.#database.transaction(() => this.#activateAgent(handle, result))();
      if (handle.bridgeCapable && !this.#agentEffects.hasRetainedBridge(result, handle)) {
        this.observeChildBridgeLoss({
          runId: handle.runId,
          agentId: result.agentId,
          adapterId: result.adapterId,
          actionId: result.actionId,
          providerSessionRef: result.providerSessionRef,
          providerSessionGeneration: result.providerSessionGeneration,
          bridgeGeneration: result.bridgeGeneration,
          reason: "retained child bridge closed during activation commit",
        });
        throw new ProjectFabricCoreError("CONTEXT_UNRECONCILED", "agent provider bridge was lost during activation");
      }
      return result;
    } catch (error: unknown) {
      const evidence = `sha256:${sha256(canonicalJson({
        code: error instanceof Error ? error.name : "agent-dispatch-error",
        message: error instanceof Error ? error.message : String(error),
      }))}`;
      this.#database.transaction(() => this.#fenceUnprovenAgent(handle, evidence))();
      throw new ProjectFabricCoreError(
        "CONTEXT_UNRECONCILED",
        "agent provider custody is ambiguous and requires lookup recovery",
      );
    }
  }

  #normaliseAgentResult(handle: AgentDispatchHandle, value: unknown): AgentCustodyResult {
    if (!isRow(value)) protocol("agent adapter result must be an object");
    const providerSessionRef = nonEmptyString(value.providerSessionRef, "agent provider session reference");
    const providerSessionGeneration = positiveOutcomeInteger(value.providerSessionGeneration ?? 1);
    const evidenceDigest = handle.bridgeCapable
      ? exactDigest(value.activationEvidenceDigest, "agent activation evidence digest")
      : (`sha256:${sha256(canonicalJson({
          kind: "bridge-unavailable-attach",
          adapterId: handle.adapterId,
          actionId: handle.actionId,
          providerSessionRef,
          providerSessionGeneration,
        }))}` as Digest);
    const result = {
      agentId: handle.targetAgentId,
      authorityId: handle.authorityId,
      adapterId: handle.adapterId,
      actionId: handle.actionId,
      providerSessionRef,
      providerSessionGeneration,
      bridgeState: handle.bridgeCapable ? "active" as const : "none" as const,
      bridgeGeneration: handle.bridgeGeneration,
      evidenceDigest,
    };
    return parseOperationResult(
      handle.operation === "spawn" ? FABRIC_OPERATIONS.spawnAgent : FABRIC_OPERATIONS.attachAgent,
      result,
    ) as AgentCustodyResult;
  }

  #activateAgent(handle: AgentDispatchHandle, result: AgentCustodyResult): void {
    const now = this.#clock();
    const action = this.#database.prepare(`
      UPDATE provider_actions
         SET status='terminal', history_json='["prepared","dispatched","accepted","terminal"]',
             effect_count=1, idempotency_proven=1, provider_session_generation=?,
             result_json=?, journal_revision=journal_revision+1, updated_at=?
       WHERE adapter_id=? AND action_id=? AND status IN ('dispatched','accepted','ambiguous')
    `).run(
      result.providerSessionGeneration,
      canonicalJson(result),
      now,
      handle.adapterId,
      handle.actionId,
    );
    if (action.changes !== 1) throw new ProjectFabricCoreError("CONFLICT", "agent action changed before activation");
    this.#database.prepare(`
      UPDATE agents SET provider_session_ref=?, lifecycle='ready'
       WHERE run_id=? AND agent_id=?
    `).run(result.providerSessionRef, handle.runId, handle.targetAgentId);
    this.#database.prepare(`
      INSERT INTO provider_state(run_id, agent_id, provider_session_generation, context_revision, reconciled_checkpoint_sha256)
      VALUES (?, ?, ?, NULL, NULL)
      ON CONFLICT(run_id, agent_id) DO UPDATE SET
        provider_session_generation=excluded.provider_session_generation,
        context_revision=NULL,
        reconciled_checkpoint_sha256=NULL
    `).run(handle.runId, handle.targetAgentId, result.providerSessionGeneration);
    this.#database.prepare(`
      INSERT INTO agent_adapter_bindings(run_id, agent_id, adapter_id, bound_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(run_id, agent_id) DO UPDATE SET
        adapter_id=excluded.adapter_id, bound_at=excluded.bound_at
    `).run(handle.runId, handle.targetAgentId, handle.adapterId, now);
    const bridge = this.#database.prepare(`
      UPDATE agent_bridge_state
         SET provider_session_ref=?, provider_session_generation=?, bridge_state=?,
             capability_hash=CASE WHEN ?='active' THEN (
               SELECT capability_hash FROM provider_agent_custody
                WHERE adapter_id=? AND action_id=?
             ) ELSE NULL END,
             activation_evidence_digest=?, revision=revision+1, updated_at=?
       WHERE run_id=? AND agent_id=? AND adapter_id=? AND action_id=?
         AND bridge_generation=? AND bridge_state IN ('pending','none')
    `).run(
      result.providerSessionRef,
      result.providerSessionGeneration,
      result.bridgeState,
      result.bridgeState,
      handle.adapterId,
      handle.actionId,
      result.bridgeState === "active" ? result.evidenceDigest : null,
      now,
      handle.runId,
      handle.targetAgentId,
      handle.adapterId,
      handle.actionId,
      handle.bridgeGeneration,
    );
    if (bridge.changes !== 1) throw new ProjectFabricCoreError("CONFLICT", "agent bridge changed before activation");
  }

  #fenceUnprovenAgent(handle: AgentDispatchHandle, evidenceDigest: string): void {
    const now = this.#clock();
    const custody = this.#database.prepare(`
      SELECT capability_hash FROM provider_agent_custody WHERE adapter_id=? AND action_id=?
    `).get(handle.adapterId, handle.actionId);
    if (isRow(custody) && typeof custody.capability_hash === "string") {
      this.#database.prepare("UPDATE capabilities SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL")
        .run(now, custody.capability_hash);
    }
    this.#database.prepare(`
      UPDATE agent_bridge_state
         SET bridge_state='none', capability_hash=NULL, activation_evidence_digest=NULL,
             revision=revision+1, updated_at=?
       WHERE run_id=? AND agent_id=? AND adapter_id=? AND action_id=? AND bridge_state='pending'
    `).run(now, handle.runId, handle.targetAgentId, handle.adapterId, handle.actionId);
    this.#database.prepare("UPDATE agents SET lifecycle='context-unreconciled' WHERE run_id=? AND agent_id=?")
      .run(handle.runId, handle.targetAgentId);
    this.#database.prepare(`
      UPDATE provider_actions
         SET status='ambiguous', history_json='["prepared","dispatched","ambiguous"]',
             result_json=?, journal_revision=journal_revision+1, updated_at=?
       WHERE adapter_id=? AND action_id=? AND status IN ('dispatched','accepted','ambiguous')
    `).run(
      canonicalJson({ schemaVersion: 1, kind: "agent-custody-ambiguous", evidenceDigest }),
      now,
      handle.adapterId,
      handle.actionId,
    );
  }

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
    this.#database.transaction(() => this.#persistChildBridgeLoss(input))();
  }

  #persistChildBridgeLoss(input: Readonly<{
    runId: string;
    agentId: string;
    adapterId: string;
    actionId: string;
    providerSessionRef: string;
    providerSessionGeneration: number;
    bridgeGeneration: number;
    reason: string;
  }>): boolean {
    const state = this.#database.prepare(`
      SELECT capability_hash
        FROM agent_bridge_state
       WHERE run_id=? AND agent_id=? AND adapter_id=? AND action_id=?
         AND provider_session_ref=? AND provider_session_generation=?
         AND bridge_generation=? AND bridge_state='active'
    `).get(
      input.runId,
      input.agentId,
      input.adapterId,
      input.actionId,
      input.providerSessionRef,
      input.providerSessionGeneration,
      input.bridgeGeneration,
    );
    if (!isRow(state)) return false;
    const capabilityHash = text(state, "capability_hash");
    const reason = input.reason.slice(0, 160) || "retained child bridge lost";
    const evidenceDigest = `sha256:${sha256(canonicalJson({ ...input, reason }))}`;
    const lossId = `child-loss:${sha256(`${input.runId}\0${input.agentId}\0${String(input.bridgeGeneration)}`).slice(0, 40)}`;
    this.#database.prepare(`
      INSERT OR IGNORE INTO child_bridge_losses(
        loss_id, run_id, agent_id, adapter_id, action_id, provider_session_ref,
        provider_session_generation, lost_bridge_generation, next_bridge_generation,
        capability_hash, daemon_instance_generation, reason, evidence_digest, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      lossId,
      input.runId,
      input.agentId,
      input.adapterId,
      input.actionId,
      input.providerSessionRef,
      input.providerSessionGeneration,
      input.bridgeGeneration,
      input.bridgeGeneration + 1,
      capabilityHash,
      this.#daemonInstanceGeneration(),
      reason,
      evidenceDigest,
      this.#clock(),
    );
    this.#database.prepare("UPDATE capabilities SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL")
      .run(this.#clock(), capabilityHash);
    this.#database.prepare(`
      UPDATE agent_bridge_state
         SET bridge_state='lost', bridge_generation=bridge_generation+1,
             revision=revision+1, updated_at=?
       WHERE run_id=? AND agent_id=? AND bridge_state='active' AND bridge_generation=?
    `).run(this.#clock(), input.runId, input.agentId, input.bridgeGeneration);
    this.#database.prepare("UPDATE agents SET lifecycle='context-unreconciled' WHERE run_id=? AND agent_id=?")
      .run(input.runId, input.agentId);
    return true;
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
      validate = ajv.compile(contract.publicPayloadSchema);
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

  #preflightLaunchInCurrentTransaction(input: Readonly<{
    inspection: LaunchInspection;
    principal: AuthenticatedOperatorContext;
  }>): ProviderActionTicket {
    if (!this.#database.inTransaction) throw new Error("launch preflight requires the operator command transaction");
    const { intent, packet, plan } = input.inspection;
    return this.#providerActionAdmission.preflight({
      actionRef: {
        adapterId: intent.providerAdapterId,
        actionId: intent.providerActionId,
      },
      scope: { kind: "run-action", runId: packet.runId },
      principal: input.principal,
      canonicalInput: {
        schemaVersion: 1,
        operation: "launch-chair",
        intent,
        packet,
        resourcePlan: plan,
      },
    });
  }

  prepareInTransaction(input: Readonly<{
    inspection: LaunchInspection;
    operatorId: string;
    operatorCommandId: string;
    principal: AuthenticatedOperatorContext;
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
    const attestationChallenge = this.#randomAttestationChallenge();
    if (!/^[0-9a-f]{64}$/u.test(attestationChallenge)) {
      throw new Error("random launch attestation challenge must contain exactly 32 bytes");
    }
    const attestationChallengeDigest = `sha256:${createHash("sha256")
      .update(Buffer.from(attestationChallenge, "hex"))
      .digest("hex")}` as Digest;
    const expiresAt = Date.parse(packet.chairAuthority.expiresAt);

    const changed = this.#database.prepare(`
      UPDATE project_sessions
         SET state='launching', membership_revision=membership_revision+1,
             revision=revision+1,
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
        , project_run_directory_basis
      ) VALUES (?, ?, ?, ?, ?, ?, 'launching', 1, 1, ?, ?, ?, 1, ?, 'project-relative')
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
    const providerActionTicket = this.#preflightLaunchInCurrentTransaction({
      inspection,
      principal: input.principal,
    });
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
    this.#providerActionAdmission.admitUnroutedInCurrentTransaction(providerActionTicket, {
      runId: packet.runId,
      actionId: intent.providerActionId,
      adapterId: intent.providerAdapterId,
      operation: "launch-chair",
      targetAgentId: packet.chairAgentId,
      identityHash: sha256(canonicalJson({ adapterId: intent.providerAdapterId, actionId: intent.providerActionId })),
      payloadHash: sha256(payloadJson),
      payloadJson,
      status: "prepared",
      historyJson: '["prepared"]',
      executionCount: 0,
      updatedAt: now,
    });
    this.#fault("launch:prepare:provider-action");

    const insertMembership = this.#database.prepare(`
      INSERT INTO project_session_memberships(
        project_session_id, coordination_run_id, member_kind, member_id, member_adapter_id,
        required, state, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, 'active', 1, ?, ?)
    `);
    insertMembership.run(intent.projectSessionId, packet.runId, "coordination-run", packet.runId, "", now, now);
    insertMembership.run(intent.projectSessionId, packet.runId, "lease", chairLeaseId, "", now, now);
    insertMembership.run(
      intent.projectSessionId,
      packet.runId,
      "provider-action",
      intent.providerActionId,
      intent.providerAdapterId,
      now,
      now,
    );
    this.#database.prepare("INSERT INTO run_metadata(run_id, execution_profile) VALUES (?, 'headless')")
      .run(packet.runId);
    this.#fault("launch:prepare:memberships");

    this.#database.prepare(`
      INSERT INTO project_session_launch_custody(
        project_session_id, custody_attempt_generation, coordination_run_id,
        chair_agent_id, chair_lease_id, operator_id, operator_command_id,
        provider_adapter_id, provider_action_id, capability_hash, capability_expires_at,
        attestation_challenge_digest,
        reservation_id, launch_packet_path, launch_packet_digest, authority_ref,
        budget_ref, resource_plan_path, resource_plan_digest, expected_project_revision,
        expected_session_revision, expected_session_generation, trust_record_digest,
        provider_contract_digest, resource_state_digest, launch_binding_digest,
        retry_of_provider_adapter_id, retry_of_provider_action_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      attestationChallengeDigest,
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
      publicPayload: packet.provider.input,
      capability,
      socketPath: this.#fabricSocketPath,
      attestationChallenge,
      attestationChallengeDigest,
      expectedPrincipal: {
        agentId: packet.chairAgentId,
        projectSessionId: intent.projectSessionId,
        runId: packet.runId,
        principalGeneration: 1,
      },
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
    const custody = row(this.#database.prepare(`
      SELECT attestation_challenge_digest FROM project_session_launch_custody
       WHERE provider_adapter_id=? AND provider_action_id=? AND provider_contract_digest=?
    `).get(input.providerAdapterId, input.providerActionId, input.providerContractDigest), "launch custody");
    return await this.#adapterEffects.lookup({
      ...input,
      attestationChallengeDigest: exactDigest(
        custody.attestation_challenge_digest,
        "custody attestation challenge digest",
      ),
    });
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

  launchProviderActionJournalRefForCommand(
    operatorId: string,
    commandId: string,
  ): LaunchProviderActionJournalRefV1 {
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
      actionRef: {
        adapterId: text(value, "provider_adapter_id"),
        actionId: text(value, "provider_action_id"),
      },
      providerContractDigest: text(value, "provider_contract_digest"),
      custodyAttemptGeneration: integer(value, "custody_attempt_generation"),
      journalRevision: integer(value, "journal_revision"),
    };
    if (status === "prepared" || status === "dispatched" || status === "accepted") {
      return parseLaunchProviderActionJournalRefV1({
        ...common,
        journalState: status,
        outcomeKind: null,
        outcomeDigest: null,
      });
    }
    if (status === "ambiguous") {
      const result = value.result_json;
      if (typeof result !== "string") throw new Error("ambiguous launch action has no outcome");
      return parseLaunchProviderActionJournalRefV1({
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
      return parseLaunchProviderActionJournalRefV1({
        ...common,
        journalState: "terminal",
        outcomeKind,
        outcomeDigest: `sha256:${sha256(result)}`,
      });
    }
    throw new Error(`launch provider action has invalid status ${status}`);
  }

  #agentDispatchHandle(custody: Row): AgentDispatchHandle {
    const payloadValue: unknown = JSON.parse(text(custody, "payload_json"));
    if (!isRow(payloadValue) || !isRow(payloadValue.payload)) {
      throw new Error("agent custody payload is invalid");
    }
    const operation = text(custody, "operation");
    if (operation !== "spawn" && operation !== "attach") throw new Error("agent custody operation is invalid");
    const bridgeCapable = integer(custody, "bridge_capable") === 1;
    return {
      schemaVersion: 1,
      runId: text(custody, "run_id"),
      operation,
      actorAgentId: text(custody, "actor_agent_id"),
      targetAgentId: text(custody, "target_agent_id"),
      authorityId: text(custody, "authority_id"),
      adapterId: text(custody, "adapter_id"),
      actionId: text(custody, "action_id"),
      publicPayload: payloadValue.payload,
      ...(typeof custody.requested_provider_session_ref === "string"
        ? { requestedProviderSessionRef: custody.requested_provider_session_ref }
        : {}),
      bridgeCapable,
      bridgeContractDigest: exactDigest(custody.bridge_contract_digest, "agent bridge contract digest"),
      bridgeGeneration: integer(custody, "bridge_generation"),
    };
  }

  #failPreparedAgent(custody: Row): void {
    const now = this.#clock();
    const adapterId = text(custody, "adapter_id");
    const actionId = text(custody, "action_id");
    const proof = {
      schemaVersion: 1,
      kind: "agent-custody-pre-dispatch-no-effect",
      adapterId,
      actionId,
      observedAt: new Date(now).toISOString(),
      executionCount: 0,
    };
    const changed = this.#database.prepare(`
      UPDATE provider_actions
         SET status='terminal', history_json='["prepared","terminal"]',
             execution_count=0, effect_count=0, idempotency_proven=1,
             result_json=?, journal_revision=journal_revision+1, updated_at=?
       WHERE adapter_id=? AND action_id=? AND status='prepared'
    `).run(canonicalJson({ ...proof, evidenceDigest: jsonEvidenceDigest(proof) }), now, adapterId, actionId);
    if (changed.changes !== 1) throw new ProjectFabricCoreError("CONFLICT", "prepared agent custody changed during recovery");
    if (typeof custody.capability_hash === "string") {
      this.#database.prepare("UPDATE capabilities SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL")
        .run(now, custody.capability_hash);
    }
    this.#database.prepare(`
      UPDATE agent_bridge_state
         SET bridge_state='none', capability_hash=NULL, activation_evidence_digest=NULL,
             revision=revision+1, updated_at=?
       WHERE run_id=? AND agent_id=? AND adapter_id=? AND action_id=? AND bridge_state='pending'
    `).run(
      now,
      text(custody, "run_id"),
      text(custody, "target_agent_id"),
      adapterId,
      actionId,
    );
    this.#database.prepare("UPDATE agents SET lifecycle='context-unreconciled' WHERE run_id=? AND agent_id=?")
      .run(text(custody, "run_id"), text(custody, "target_agent_id"));
  }

  #agentLookupResult(handle: AgentDispatchHandle, record: unknown): AgentCustodyResult {
    const expectedOperation = handle.bridgeCapable ? "provision_agent" : "attach";
    const expectedPayload = handle.bridgeCapable
      ? {
          schemaVersion: 1,
          runId: handle.runId,
          operation: handle.operation,
          targetAgentId: handle.targetAgentId,
          authorityId: handle.authorityId,
          bridgeGeneration: handle.bridgeGeneration,
          bridgeContractDigest: handle.bridgeContractDigest,
          payload: handle.publicPayload,
          ...(handle.requestedProviderSessionRef === undefined
            ? {}
            : { providerSessionRef: handle.requestedProviderSessionRef }),
        }
      : {
          resumeReference: handle.requestedProviderSessionRef,
          ...handle.publicPayload,
        };
    if (
      !isRow(record) || record.actionId !== handle.actionId || record.status !== "terminal" ||
      record.operation !== expectedOperation ||
      record.payloadHash !== sha256(canonicalJson(expectedPayload)) ||
      record.executionCount !== 1 || record.effectCount !== 1 || !isRow(record.result)
    ) {
      throw new Error("agent custody lookup is not a terminal one-effect record");
    }
    if (handle.bridgeCapable) {
      const value = record.result;
      if (
        Object.keys(value).length !== 9 ||
        value.schemaVersion !== 1 || value.adapterId !== handle.adapterId ||
        value.actionId !== handle.actionId || value.targetAgentId !== handle.targetAgentId ||
        value.bridgeGeneration !== handle.bridgeGeneration ||
        value.bridgeContractDigest !== handle.bridgeContractDigest
      ) throw new Error("agent custody lookup binding changed");
      return this.#normaliseAgentResult(handle, value);
    }
    const resumeReference = record.result.resumeReference;
    return this.#normaliseAgentResult(handle, {
      providerSessionRef: typeof resumeReference === "string"
        ? resumeReference
        : handle.requestedProviderSessionRef,
      providerSessionGeneration: record.result.providerSessionGeneration ?? 1,
    });
  }

  async #recoverAgentCustody(result: {
    preparedFailed: number;
    lookedUp: number;
    activated: number;
    failed: number;
    ambiguous: number;
    recoveryRequired: number;
  }, errors: unknown[]): Promise<void> {
    const prepared = this.#database.prepare(`
      SELECT c.*, p.payload_json, b.bridge_generation
       FROM provider_agent_custody c
        JOIN provider_actions p
          ON p.run_id=c.run_id AND p.adapter_id=c.adapter_id AND p.action_id=c.action_id
        JOIN agent_bridge_state b ON b.run_id=c.run_id AND b.agent_id=c.target_agent_id
       WHERE p.status='prepared'
         AND NOT EXISTS (
           SELECT 1 FROM lifecycle_rotation_custodies rotation
            WHERE rotation.run_id=c.run_id
              AND (
                (rotation.provider_action_adapter_id=c.adapter_id
                  AND rotation.provider_action_id=c.action_id) OR
                (rotation.source_adapter_id=c.adapter_id
                  AND rotation.source_custody_action_id=c.action_id)
              )
         )
       ORDER BY c.created_at, c.action_id
    `).all().filter(isRow);
    for (const custody of prepared) {
      try {
        this.#database.transaction(() => this.#failPreparedAgent(custody))();
        result.preparedFailed += 1;
        result.failed += 1;
      } catch (error: unknown) {
        errors.push(error);
        result.ambiguous += 1;
      }
    }

    if (this.#agentEffects !== undefined) {
      const observable = this.#database.prepare(`
        SELECT c.*, p.payload_json, b.bridge_generation
          FROM provider_agent_custody c
          JOIN provider_actions p
            ON p.run_id=c.run_id AND p.adapter_id=c.adapter_id AND p.action_id=c.action_id
          JOIN agent_bridge_state b ON b.run_id=c.run_id AND b.agent_id=c.target_agent_id
         WHERE p.status IN ('dispatched','accepted','ambiguous')
           AND NOT EXISTS (
             SELECT 1 FROM lifecycle_rotation_custodies rotation
              WHERE rotation.run_id=c.run_id
                AND (
                  (rotation.provider_action_adapter_id=c.adapter_id
                    AND rotation.provider_action_id=c.action_id) OR
                  (rotation.source_adapter_id=c.adapter_id
                    AND rotation.source_custody_action_id=c.action_id)
                )
           )
         ORDER BY c.created_at, c.action_id
      `).all().filter(isRow);
      for (const custody of observable) {
        let handle: AgentDispatchHandle | undefined;
        let raw: unknown;
        try {
          const currentHandle = this.#agentDispatchHandle(custody);
          handle = currentHandle;
          raw = await this.#agentEffects.lookup({ adapterId: currentHandle.adapterId, actionId: currentHandle.actionId });
          result.lookedUp += 1;
          const custodyResult = this.#agentLookupResult(currentHandle, raw);
          this.#database.transaction(() => {
            this.#activateAgent(currentHandle, custodyResult);
            if (
              currentHandle.bridgeCapable &&
              !this.#agentEffects?.hasRetainedBridge(custodyResult, currentHandle)
            ) {
              this.#persistChildBridgeLoss({
                runId: currentHandle.runId,
                agentId: custodyResult.agentId,
                adapterId: custodyResult.adapterId,
                actionId: custodyResult.actionId,
                providerSessionRef: custodyResult.providerSessionRef,
                providerSessionGeneration: custodyResult.providerSessionGeneration,
                bridgeGeneration: custodyResult.bridgeGeneration,
                reason: "daemon restart found no retained child bridge",
              });
            }
          })();
          if (currentHandle.bridgeCapable) result.recoveryRequired += 1;
          else result.activated += 1;
        } catch (error: unknown) {
          if (handle === undefined) {
            errors.push(error);
            result.ambiguous += 1;
            continue;
          }
          const failedHandle = handle;
          const evidence = jsonEvidenceDigest({
            kind: "agent-custody-lookup-incomplete",
            adapterId: failedHandle.adapterId,
            actionId: failedHandle.actionId,
            error: error instanceof Error ? error.name : "lookup-error",
          });
          try {
            this.#database.transaction(() => this.#fenceUnprovenAgent(failedHandle, evidence))();
          } catch (fenceError: unknown) {
            errors.push(fenceError);
          }
          result.ambiguous += 1;
        }
      }
    }

    const active = this.#database.prepare(`
      SELECT c.*, p.payload_json, b.bridge_generation, b.provider_session_ref,
             b.provider_session_generation, b.activation_evidence_digest
        FROM agent_bridge_state b
        JOIN provider_agent_custody c
          ON c.run_id=b.run_id AND c.adapter_id=b.adapter_id AND c.action_id=b.action_id
        JOIN provider_actions p
          ON p.run_id=c.run_id AND p.adapter_id=c.adapter_id AND p.action_id=c.action_id
       WHERE b.bridge_state='active'
         AND NOT EXISTS (
           SELECT 1 FROM lifecycle_rotation_custodies rotation
            WHERE rotation.run_id=c.run_id
              AND (
                (rotation.provider_action_adapter_id=c.adapter_id
                  AND rotation.provider_action_id=c.action_id) OR
                (rotation.source_adapter_id=c.adapter_id
                  AND rotation.source_custody_action_id=c.action_id)
              )
         )
       ORDER BY c.created_at, c.action_id
    `).all().filter(isRow);
    for (const custody of active) {
      try {
        const handle = this.#agentDispatchHandle(custody);
        const storedResult = parseOperationResult(
          handle.operation === "spawn" ? FABRIC_OPERATIONS.spawnAgent : FABRIC_OPERATIONS.attachAgent,
          {
            agentId: handle.targetAgentId,
            authorityId: handle.authorityId,
            adapterId: handle.adapterId,
            actionId: handle.actionId,
            providerSessionRef: text(custody, "provider_session_ref"),
            providerSessionGeneration: integer(custody, "provider_session_generation"),
            bridgeState: "active",
            bridgeGeneration: handle.bridgeGeneration,
            evidenceDigest: exactDigest(custody.activation_evidence_digest, "agent activation evidence"),
          },
        ) as AgentCustodyResult;
        if (!this.#agentEffects?.hasRetainedBridge(storedResult, handle)) {
          this.#database.transaction(() => this.#persistChildBridgeLoss({
            runId: handle.runId,
            agentId: storedResult.agentId,
            adapterId: storedResult.adapterId,
            actionId: storedResult.actionId,
            providerSessionRef: storedResult.providerSessionRef,
            providerSessionGeneration: storedResult.providerSessionGeneration,
            bridgeGeneration: storedResult.bridgeGeneration,
            reason: "daemon restart found no retained child bridge",
          }))();
          result.recoveryRequired += 1;
        }
      } catch (error: unknown) {
        errors.push(error);
        result.ambiguous += 1;
      }
    }
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
    const errors: unknown[] = [];
    await this.#recoverChairLiveHandoffCustody(result, errors);
    try {
      await this.#recoverChairRecoveryCustody(result);
    } catch (error: unknown) {
      errors.push(error);
      result.ambiguous += 1;
    }
    await this.#recoverAgentCustody(result, errors);
    const prepared = this.#database.prepare(`
      SELECT c.*
        FROM project_session_launch_custody c
        JOIN provider_actions p
          ON p.adapter_id=c.provider_adapter_id AND p.action_id=c.provider_action_id
       WHERE p.status='prepared'
       ORDER BY c.project_session_id, c.custody_attempt_generation
    `).all().filter(isRow);
    for (const custody of prepared) {
      try {
        this.#database.transaction(() => this.#failPrepared(custody))();
        result.preparedFailed += 1;
        result.failed += 1;
      } catch (error: unknown) {
        errors.push(error);
        result.ambiguous += 1;
      }
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
      try {
        const providerAdapterId = text(custody, "provider_adapter_id");
        const providerActionId = text(custody, "provider_action_id");
        const providerContractDigest = exactDigest(custody.provider_contract_digest, "custody provider contract digest");
        const attestationChallengeDigest = exactDigest(
          custody.attestation_challenge_digest,
          "custody attestation challenge digest",
        );
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
          raw = await this.#adapterEffects.lookup({
            providerAdapterId,
            providerActionId,
            providerContractDigest,
            attestationChallengeDigest,
          });
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
      } catch (error: unknown) {
        errors.push(error);
        result.ambiguous += 1;
      }
    }
    this.#auditRetainedChairBridges(result, errors);
    if (errors.length > 0) {
      throw new AggregateError(errors, "launch custody recovery left one or more sessions unfenced");
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
      const frozen = this.#database.prepare(`
        UPDATE run_chair_leases SET status='frozen',updated_at=?
         WHERE project_session_id=? AND run_id=? AND lease_id=? AND status='active'
      `).run(
        now,
        text(custody, "project_session_id"),
        text(custody, "coordination_run_id"),
        text(custody, "chair_lease_id"),
      );
      if (frozen.changes !== 1) stale("launch overrun chair lease changed");
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
      INSERT INTO launched_chair_bridge_state(
        project_session_id, coordination_run_id, chair_agent_id,
        provider_adapter_id, provider_action_id, provider_contract_digest, provider_session_ref,
        provider_session_generation, principal_generation, bridge_generation,
        capability_hash, activation_evidence_digest, state, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, 'active', 1, ?, ?)
    `).run(
      text(custody, "project_session_id"),
      text(custody, "coordination_run_id"),
      text(custody, "chair_agent_id"),
      adapterId,
      actionId,
      text(custody, "provider_contract_digest"),
      outcome.outcome.providerSessionRef,
      outcome.outcome.providerSessionGeneration,
      text(custody, "capability_hash"),
      outcome.outcome.effectDigest,
      now,
      now,
    );
    this.#database.prepare(`
      UPDATE project_sessions
         SET state='active', membership_revision=membership_revision+1,
             revision=revision+1, updated_at=?
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
         AND member_kind='provider-action' AND member_adapter_id=? AND member_id=? AND state='active'
    `).run(
      now,
      text(custody, "project_session_id"),
      text(custody, "coordination_run_id"),
      adapterId,
      actionId,
    );
    const retainedEntry: RetainedChairBridge = {
      projectSessionId: text(custody, "project_session_id"),
      runId: text(custody, "coordination_run_id"),
      agentId: text(custody, "chair_agent_id"),
      principalGeneration: 1,
      adapterId,
      actionId,
      providerSessionRef: outcome.outcome.providerSessionRef,
      providerSessionGeneration: outcome.outcome.providerSessionGeneration,
      bridgeGeneration: 1,
    };
    if (
      this.#adapterEffects.hasRetainedChairBridge !== undefined &&
      !this.#adapterEffects.hasRetainedChairBridge(retainedEntry)
    ) {
      this.#persistChairBridgeLoss({
        ...retainedEntry,
        reason: "retained chair bridge closed during activation commit",
      });
      return "recoveryRequired";
    }
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
      UPDATE project_sessions
         SET state='launch_failed', membership_revision=membership_revision+1,
             revision=revision+1, updated_at=?
       WHERE project_session_id=? AND state IN ('launching','launch_ambiguous')
    `).run(now, text(custody, "project_session_id"));
    this.#database.prepare(`
      UPDATE runs SET lifecycle_state='launch_failed', revision=revision+1
       WHERE run_id=? AND lifecycle_state IN ('launching','launch_ambiguous')
    `).run(text(custody, "coordination_run_id"));
    this.#database.prepare(`
      UPDATE project_session_memberships
         SET state=CASE
               WHEN member_kind IN ('coordination-run','lease') THEN 'abandoned'
               ELSE 'reconciled'
             END,
             abandoned_reason=CASE
               WHEN member_kind IN ('coordination-run','lease') THEN 'launch-failed'
               ELSE NULL
             END,
             revision=revision+1, updated_at=?
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

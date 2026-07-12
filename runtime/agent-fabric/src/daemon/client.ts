import { createHash, randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { chmod, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, normalize, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { OPERATOR_ACTIONS, type OperatorAction } from "@local/agent-fabric-protocol";

import type { AuthorityInput, MessageInput } from "../domain/types.js";
import type { FabricOpenOptions } from "../domain/types.js";
import type { BudgetResult, EventsAfterResult, TeamResult } from "../core/contracts.js";
import type {
  LocalOperatorConsoleCapabilityInput,
  LocalOperatorConsoleCapabilityResult,
  LocalOperatorConsoleSessionCapabilityResult,
  LocalOperatorPrincipalRotationInput,
  LocalOperatorPrincipalRotationResult,
  LocalOperatorProvisioningInput,
  LocalOperatorProvisioningResult,
  LocalOperatorSessionCapabilityInput,
  LocalOperatorSessionCapabilityResult,
} from "../operator/store.js";
import { FabricRemoteError, TimedNdjsonTransport } from "../transport/ndjson-rpc.js";
import { attachOrStartDaemon, BootstrapSpawnPhaseError, type DaemonHandshakeResult } from "./bootstrap-client.js";
import { BootstrapElection, type BootstrapReadyReceipt } from "./bootstrap-election.js";
import {
  ensurePrivateDirectory,
  markPrivateDiscoveryTerminal,
  privateDiscoveryPaths,
  publishPrivateDiscovery,
  readPrivateDiscovery,
  type PrivateDiscoveryCapabilityReceipt,
  type PrivateDiscoveryIdentity,
  type PrivateDiscoveryOwner,
  type PrivateDiscoveryPaths,
} from "./private-discovery.js";
import { FABRIC_PROTOCOL_VERSION, isRecord, type DaemonInitializeResult } from "./protocol.js";
import { composeDaemonConfiguration } from "./composition.js";
import type { HerdrDaemonProcessConfiguration } from "./herdr-composition.js";
import type { OptionalGitHubHostedChecksConfiguration } from "../operator/github-hosted-checks.js";
import type { TrustedGitConfiguration } from "../operator/trusted-git-registry.js";

export { FabricRemoteError } from "../transport/ndjson-rpc.js";

function isMessageKind(value: unknown): value is MessageInput["kind"] {
  return value === "request" || value === "response" || value === "event" || value === "steer" || value === "cancel" || value === "escalate" || value === "ack";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "number");
}

function isBudgetDimensions(value: unknown): value is BudgetResult["dimensions"] {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (dimension) =>
        isRecord(dimension) &&
        typeof dimension.granted === "number" &&
        typeof dimension.reserved === "number" &&
        typeof dimension.consumed === "number" &&
        typeof dimension.available === "number" &&
        typeof dimension.usageUnknown === "boolean",
    )
  );
}

function teamResult(value: unknown): TeamResult {
  if (
    !isRecord(value) ||
    typeof value.teamId !== "string" ||
    (value.parentTeamId !== null && typeof value.parentTeamId !== "string") ||
    typeof value.depth !== "number" ||
    typeof value.leaderAgentId !== "string" ||
    typeof value.rootTaskId !== "string" ||
    !isStringArray(value.ownedTaskIds) ||
    !isStringArray(value.memberAgentIds) ||
    typeof value.budgetId !== "string" ||
    (value.state !== "active" && value.state !== "frozen" && value.state !== "barrier-closed") ||
    typeof value.generation !== "number" ||
    (value.successorAgentId !== null && typeof value.successorAgentId !== "string") ||
    !Array.isArray(value.discussionGroups) ||
    !value.discussionGroups.every(
      (group) => isRecord(group) && typeof group.groupId === "string" && isStringArray(group.memberAgentIds),
    ) ||
    !isNumberRecord(value.reservedBudget)
  ) {
    throw new Error("daemon returned an invalid team result");
  }
  return {
    teamId: value.teamId,
    parentTeamId: value.parentTeamId,
    depth: value.depth,
    leaderAgentId: value.leaderAgentId,
    rootTaskId: value.rootTaskId,
    ownedTaskIds: value.ownedTaskIds,
    memberAgentIds: value.memberAgentIds,
    budgetId: value.budgetId,
    state: value.state,
    generation: value.generation,
    successorAgentId: value.successorAgentId,
    discussionGroups: value.discussionGroups,
    reservedBudget: value.reservedBudget,
  };
}

function budgetResult(value: unknown): BudgetResult {
  if (
    !isRecord(value) ||
    typeof value.budgetId !== "string" ||
    (value.parentBudgetId !== null && typeof value.parentBudgetId !== "string") ||
    (value.state !== "active" && value.state !== "usage-unknown" && value.state !== "released") ||
    !isBudgetDimensions(value.dimensions) ||
    !isNumberRecord(value.returned)
  ) {
    throw new Error("daemon returned an invalid budget result");
  }
  return {
    budgetId: value.budgetId,
    parentBudgetId: value.parentBudgetId,
    state: value.state,
    dimensions: value.dimensions,
    returned: value.returned,
  };
}

function exactResultFields(value: Record<string, unknown>, fields: readonly string[], name: string): void {
  const expected = new Set(fields);
  if (Object.keys(value).some((field) => !expected.has(field))) {
    throw new Error(`daemon returned an invalid ${name}`);
  }
}

function operatorCredential(value: unknown): { capabilityId: string; token: string } | undefined {
  if (!isRecord(value)) return undefined;
  exactResultFields(value, ["capabilityId", "token"], "operator credential");
  return typeof value.capabilityId === "string" && typeof value.token === "string"
    ? { capabilityId: value.capabilityId, token: value.token }
    : undefined;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function localOperatorProvisioningResult(value: unknown): LocalOperatorProvisioningResult {
  if (!isRecord(value)) throw new Error("daemon returned an invalid local operator provisioning result");
  const fields = [
    "projectId", "operatorId", "capabilityId", "projectAuthorityGeneration", "principalGeneration",
    "kind", "actions", "issuedAt", "expiresAt", "issued",
    ...(value.issued === true ? ["credential"] : []),
  ];
  exactResultFields(value, fields, "local operator provisioning result");
  const valid =
    typeof value.projectId === "string" &&
    typeof value.operatorId === "string" &&
    typeof value.capabilityId === "string" &&
    isPositiveInteger(value.projectAuthorityGeneration) &&
    isPositiveInteger(value.principalGeneration) &&
    value.kind === "project-launch" &&
    Array.isArray(value.actions) &&
    value.actions.length > 0 &&
    new Set(value.actions).size === value.actions.length &&
    value.actions.every((action) => action === "read" || action === "launch") &&
    typeof value.issuedAt === "string" &&
    typeof value.expiresAt === "string";
  if (!valid) throw new Error("daemon returned an invalid local operator provisioning result");
  const common = {
    projectId: value.projectId as string,
    operatorId: value.operatorId as string,
    capabilityId: value.capabilityId as string,
    projectAuthorityGeneration: value.projectAuthorityGeneration as number,
    principalGeneration: value.principalGeneration as number,
    kind: "project-launch" as const,
    actions: value.actions as Array<"read" | "launch">,
    issuedAt: value.issuedAt as string,
    expiresAt: value.expiresAt as string,
  };
  if (value.issued === true) {
    const credential = operatorCredential(value.credential);
    if (credential === undefined || credential.capabilityId !== value.capabilityId) {
      throw new Error("daemon returned an invalid local operator provisioning result");
    }
    return { ...common, issued: true, credential };
  }
  if (value.issued !== false || value.credential !== undefined) {
    throw new Error("daemon returned an invalid local operator provisioning result");
  }
  return { ...common, issued: false };
}

function localOperatorSessionCapabilityResult(value: unknown): LocalOperatorSessionCapabilityResult {
  if (!isRecord(value)) throw new Error("daemon returned an invalid local operator session capability result");
  const fields = [
    "projectId", "operatorId", "capabilityId", "projectSessionId", "projectAuthorityGeneration",
    "sessionGeneration", "principalGeneration", "kind", "actions", "issuedAt", "expiresAt", "issued",
    ...(value.issued === true ? ["credential"] : []),
  ];
  exactResultFields(value, fields, "local operator session capability result");
  const actions = Array.isArray(value.actions) &&
    value.actions.length > 0 &&
    new Set(value.actions).size === value.actions.length &&
    value.actions.every((action) => typeof action === "string" && action !== "takeover" && OPERATOR_ACTIONS.includes(action as OperatorAction))
    ? value.actions as Array<Exclude<OperatorAction, "takeover">>
    : undefined;
  const valid =
    typeof value.projectId === "string" &&
    typeof value.operatorId === "string" &&
    typeof value.capabilityId === "string" &&
    typeof value.projectSessionId === "string" &&
    isPositiveInteger(value.projectAuthorityGeneration) &&
    isPositiveInteger(value.sessionGeneration) &&
    isPositiveInteger(value.principalGeneration) &&
    value.kind === "session" &&
    actions !== undefined &&
    typeof value.issuedAt === "string" &&
    typeof value.expiresAt === "string";
  if (!valid) throw new Error("daemon returned an invalid local operator session capability result");
  const common = {
    projectId: value.projectId as string,
    operatorId: value.operatorId as string,
    capabilityId: value.capabilityId as string,
    projectSessionId: value.projectSessionId as string,
    projectAuthorityGeneration: value.projectAuthorityGeneration as number,
    sessionGeneration: value.sessionGeneration as number,
    principalGeneration: value.principalGeneration as number,
    kind: "session" as const,
    actions: actions as Array<Exclude<OperatorAction, "takeover">>,
    issuedAt: value.issuedAt as string,
    expiresAt: value.expiresAt as string,
  };
  if (value.issued === true) {
    const credential = operatorCredential(value.credential);
    if (credential === undefined || credential.capabilityId !== value.capabilityId) {
      throw new Error("daemon returned an invalid local operator session capability result");
    }
    return { ...common, issued: true, credential };
  }
  if (value.issued !== false || value.credential !== undefined) {
    throw new Error("daemon returned an invalid local operator session capability result");
  }
  return { ...common, issued: false };
}

function localOperatorPrincipalRotationResult(value: unknown): LocalOperatorPrincipalRotationResult {
  if (!isRecord(value)) throw new Error("daemon returned an invalid local operator principal rotation result");
  exactResultFields(value, [
    "projectId", "operatorId", "principalGeneration", "revokedCapabilityCount",
  ], "local operator principal rotation result");
  if (
    typeof value.projectId !== "string" ||
    typeof value.operatorId !== "string" ||
    !isPositiveInteger(value.principalGeneration) ||
    typeof value.revokedCapabilityCount !== "number" ||
    !Number.isSafeInteger(value.revokedCapabilityCount) ||
    value.revokedCapabilityCount < 0
  ) {
    throw new Error("daemon returned an invalid local operator principal rotation result");
  }
  return {
    projectId: value.projectId,
    operatorId: value.operatorId,
    principalGeneration: value.principalGeneration,
    revokedCapabilityCount: value.revokedCapabilityCount,
  };
}

export type DaemonStartOptions = {
  databasePath: string;
  stateDirectory: string;
  runtimeDirectory: string;
  socketPath: string;
  adapters?: NonNullable<FabricOpenOptions["adapters"]>;
  executionProfile?: string;
  maximumConcurrentProviderTurns?: number;
  workspaceRoots?: string[];
  githubHostedChecks?: OptionalGitHubHostedChecksConfiguration;
  trustedGitConfiguration?: TrustedGitConfiguration;
  herdr?: HerdrDaemonProcessConfiguration;
  configuration?: {
    globalConfigPath: string;
    localConfigPath?: string;
    projectConfigPath?: string;
    runConfigPath?: string;
    compatibilityPath: string;
    compatibilitySchemaPath: string;
    agentsHome: string;
  };
};

export type FabricDaemonHandle = {
  bootstrapCapability: string;
  address: { transport: "unix"; path: string };
  pid: number;
  ownsProcess: boolean;
  /** Releases only this caller's process handles. It never stops the daemon. */
  release(): void;
  stop(): Promise<void>;
  waitForExit(): Promise<void>;
};

function canonicalDaemonPath(path: string): string {
  let cursor = resolve(path);
  const suffix: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) throw new TypeError(`workspace root has no resolvable ancestor: ${path}`);
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  return normalize(resolve(realpathSync(cursor), ...suffix));
}

function safeDatabasePath(path: string): string {
  const requested = resolve(path);
  if (existsSync(requested)) {
    const link = lstatSync(requested);
    if (link.isSymbolicLink()) throw new FabricRemoteError("DAEMON_DATABASE_PATH_UNSAFE", "daemon database path must not be a symbolic link");
    const info = statSync(requested);
    if (!info.isFile() || info.nlink !== 1) throw new FabricRemoteError("DAEMON_DATABASE_PATH_UNSAFE", "daemon database path must be a single-link regular file");
  } else {
    // A dangling final-component symlink is not reported by existsSync.
    try {
      if (lstatSync(requested).isSymbolicLink()) {
        throw new FabricRemoteError("DAEMON_DATABASE_PATH_UNSAFE", "daemon database path must not be a symbolic link");
      }
    } catch (error: unknown) {
      if (error instanceof FabricRemoteError) throw error;
      if (!isRecord(error) || error.code !== "ENOENT") throw error;
    }
  }
  return canonicalDaemonPath(requested);
}

type DaemonBootstrapEnvironment = {
  mode: "production-election" | "test-forced-process-locks";
  actionId: string;
  electionGeneration: number;
  daemonInstanceGeneration: number;
};

function childEnvironment(
  options: DaemonStartOptions,
  bootstrapCapability: string,
  lockPaths: string[],
  capabilityKey: string,
  bootstrap: DaemonBootstrapEnvironment,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    AGENT_FABRIC_DATABASE_PATH: options.databasePath,
    AGENT_FABRIC_SOCKET_PATH: options.socketPath,
    AGENT_FABRIC_STATE_DIRECTORY: options.stateDirectory,
    AGENT_FABRIC_RUNTIME_DIRECTORY: options.runtimeDirectory,
    AGENT_FABRIC_BOOTSTRAP_CAPABILITY: bootstrapCapability,
    AGENT_FABRIC_BOOTSTRAP_MODE: bootstrap.mode,
    AGENT_FABRIC_BOOTSTRAP_ACTION_ID: bootstrap.actionId,
    AGENT_FABRIC_BOOTSTRAP_ELECTION_GENERATION: String(bootstrap.electionGeneration),
    AGENT_FABRIC_DAEMON_INSTANCE_GENERATION: String(bootstrap.daemonInstanceGeneration),
    ...(bootstrap.mode === "test-forced-process-locks"
      ? { AGENT_FABRIC_DAEMON_LOCK_PATHS_JSON: JSON.stringify(lockPaths) }
      : {}),
    AGENT_FABRIC_CAPABILITY_KEY: capabilityKey,
    AGENT_FABRIC_EXECUTION_PROFILE: options.executionProfile ?? "headless",
    AGENT_FABRIC_MAXIMUM_CONCURRENT_PROVIDER_TURNS: String(options.maximumConcurrentProviderTurns ?? 8),
    AGENT_FABRIC_WORKSPACE_ROOTS_JSON: JSON.stringify(options.workspaceRoots ?? []),
    AGENT_FABRIC_ADAPTERS_JSON: JSON.stringify(options.adapters ?? {}),
    AGENT_FABRIC_GITHUB_HOSTED_CHECKS_JSON: JSON.stringify(options.githubHostedChecks ?? { enabled: false }),
    AGENT_FABRIC_TRUSTED_GIT_JSON: JSON.stringify(options.trustedGitConfiguration ?? {}),
    AGENT_FABRIC_HERDR_JSON: JSON.stringify(options.herdr ?? { enabled: false }),
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
  };
  for (const key of ["HOME", "CODEX_HOME", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "SSL_CERT_FILE"] as const) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

async function loadOrCreateCapabilityKey(stateDirectory: string): Promise<string> {
  const path = `${stateDirectory}/capability.key`;
  try {
    const key = (await readFile(path, "utf8")).trim();
    if (!/^[A-Za-z0-9_-]{43}$/u.test(key)) throw new Error("agent fabric capability key is invalid");
    return key;
  } catch (error: unknown) {
    if (isRecord(error) && error.code !== "ENOENT") throw error;
    const key = randomBytes(32).toString("base64url");
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(`${key}\n`);
    } finally {
      await handle.close();
    }
    return key;
  }
}

export type DaemonLock =
  | { kind: "production-election-proof"; database: null; path: string; token: string }
  | { kind: "test-forced-process-lock"; database: Database.Database; path: string; token: string };

function productionElectionProof(): { actionId: string; electionGeneration: number; daemonInstanceGeneration: number } | undefined {
  if (process.env.AGENT_FABRIC_BOOTSTRAP_MODE !== "production-election") return undefined;
  const actionId = process.env.AGENT_FABRIC_BOOTSTRAP_ACTION_ID;
  const electionGeneration = Number(process.env.AGENT_FABRIC_BOOTSTRAP_ELECTION_GENERATION);
  const daemonInstanceGeneration = Number(process.env.AGENT_FABRIC_DAEMON_INSTANCE_GENERATION);
  if (
    actionId === undefined
    || actionId.trim().length === 0
    || !Number.isSafeInteger(electionGeneration)
    || electionGeneration < 1
    || !Number.isSafeInteger(daemonInstanceGeneration)
    || daemonInstanceGeneration < 1
  ) {
    throw new FabricRemoteError("DAEMON_ELECTION_PROOF_INVALID", "production daemon election proof is incomplete");
  }
  return { actionId, electionGeneration, daemonInstanceGeneration };
}

export async function writeDaemonLockReceipt(path: string, owner: { pid: number; token: string; socketPath?: string }): Promise<void> {
  if (productionElectionProof() !== undefined) return;
  const temporaryPath = `${path}.tmp-${process.pid}-${randomBytes(12).toString("hex")}`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function acquireDaemonLock(path: string): Promise<DaemonLock> {
  const token = randomBytes(24).toString("base64url");
  const lockDatabasePath = `${path}.sqlite3`;
  let database: Database.Database | undefined;
  try {
    database = new Database(lockDatabasePath, { timeout: 0 });
    await chmod(lockDatabasePath, 0o600);
    database.pragma("journal_mode = DELETE");
    database.exec("CREATE TABLE IF NOT EXISTS daemon_lock_owner(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), pid INTEGER NOT NULL, token TEXT NOT NULL)");
    database.exec("BEGIN EXCLUSIVE");
    database.prepare("INSERT OR REPLACE INTO daemon_lock_owner(singleton, pid, token) VALUES (1, ?, ?)").run(process.pid, token);
    await writeDaemonLockReceipt(path, { pid: process.pid, token });
    return { kind: "test-forced-process-lock", database, path, token };
  } catch (error: unknown) {
    if (database !== undefined) {
      try { database.exec("ROLLBACK"); } catch { /* no active transaction */ }
      database.close();
    }
    if (isRecord(error) && (error.code === "SQLITE_BUSY" || error.code === "SQLITE_LOCKED")) {
      throw new FabricRemoteError("DAEMON_ALREADY_RUNNING", "agent fabric daemon already owns the coordination lock");
    }
    throw error;
  }
}

export async function acquireDaemonLocks(paths: string[]): Promise<DaemonLock[]> {
  const proof = productionElectionProof();
  if (proof !== undefined) {
    return [...new Set(paths)].sort().map((path) => ({
      kind: "production-election-proof" as const,
      database: null,
      path,
      token: `election-${proof.electionGeneration}-${proof.daemonInstanceGeneration}`,
    }));
  }
  const locks: DaemonLock[] = [];
  try {
    for (const path of [...new Set(paths)].sort()) locks.push(await acquireDaemonLock(path));
    return locks;
  } catch (error: unknown) {
    await Promise.allSettled(locks.reverse().map(releaseDaemonLock));
    throw error;
  }
}

async function releaseDaemonLock(lock: DaemonLock): Promise<void> {
  if (lock.kind === "production-election-proof") return;
  let record: unknown;
  try {
    record = JSON.parse(await readFile(lock.path, "utf8"));
  } catch {
    record = undefined;
  }
  if (isRecord(record) && record.token === lock.token) {
    await rm(lock.path, { force: true });
  }
  try { lock.database.exec("COMMIT"); } catch { /* process teardown */ }
  lock.database.close();
}

export async function releaseDaemonLocks(locks: DaemonLock[]): Promise<void> {
  await Promise.all(locks.map(releaseDaemonLock));
}

type PreparedDaemonStart = DaemonStartOptions & {
  adapters: NonNullable<FabricOpenOptions["adapters"]>;
  executionProfile: string;
  maximumConcurrentProviderTurns: number;
  workspaceRoots: string[];
};

type ChildExit = { code: number | null; signal: NodeJS.Signals | null };

type SpawnedDaemonChild = {
  bootstrapCapability: string;
  pid: number;
  ready: Promise<void>;
  exit: Promise<ChildExit>;
  isRunning(): boolean;
  release(): void;
  terminate(): Promise<void>;
};

type ProductionSpawn = {
  bootstrapCapability: string;
  pid: number;
  identity: Promise<PrivateDiscoveryIdentity>;
  exit: Promise<void>;
  release(): void;
  stop(clean: boolean): Promise<void>;
};

type PrivateDaemonAttachment = {
  receipt: PrivateDiscoveryCapabilityReceipt;
  owner: PrivateDiscoveryOwner;
};

function normalizedStartOptions(options: DaemonStartOptions): DaemonStartOptions {
  return {
    ...options,
    databasePath: resolve(options.databasePath),
    stateDirectory: resolve(options.stateDirectory),
    runtimeDirectory: resolve(options.runtimeDirectory),
    socketPath: resolve(options.socketPath),
  };
}

async function prepareDaemonStart(options: DaemonStartOptions): Promise<PreparedDaemonStart> {
  const databasePath = safeDatabasePath(options.databasePath);
  let adapters = options.adapters ?? {};
  let executionProfile = options.executionProfile ?? "headless";
  let maximumConcurrentProviderTurns = options.maximumConcurrentProviderTurns ?? 8;
  let workspaceRoots = options.workspaceRoots ?? [process.cwd()];
  if (options.configuration !== undefined) {
    if (options.adapters !== undefined) {
      throw new TypeError("daemon accepts explicit adapters or trusted configuration, not both");
    }
    const composition = await composeDaemonConfiguration({ ...options.configuration, stateDirectory: options.stateDirectory });
    adapters = composition.adapters;
    executionProfile = composition.executionProfile;
    maximumConcurrentProviderTurns = composition.maximumConcurrentProviderTurns;
    workspaceRoots = composition.workspaceRoots;
  }
  workspaceRoots = [...new Set(workspaceRoots.map(canonicalDaemonPath))].sort();
  return {
    ...options,
    databasePath,
    adapters,
    executionProfile,
    maximumConcurrentProviderTurns,
    workspaceRoots,
  };
}

function stableBootstrapActionId(options: Pick<DaemonStartOptions, "databasePath" | "socketPath">): string {
  return `daemon-bootstrap-${createHash("sha256")
    .update(JSON.stringify({ databasePath: options.databasePath, socketPath: options.socketPath }))
    .digest("hex")}`;
}

async function spawnDaemonChild(
  options: PreparedDaemonStart,
  bootstrap: DaemonBootstrapEnvironment,
): Promise<SpawnedDaemonChild> {
  const capabilityKey = await loadOrCreateCapabilityKey(options.stateDirectory);
  const lockPaths = bootstrap.mode === "test-forced-process-locks"
    ? [`${options.socketPath}.lock`, `${options.databasePath}.daemon.lock`]
    : [];
  const bootstrapCapability = `afb_${randomBytes(32).toString("base64url")}`;
  const sourceMode = import.meta.url.endsWith(".ts");
  const processUrl = new URL(sourceMode ? "./process.ts" : "./process.js", import.meta.url);
  const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
  const args = sourceMode
    ? ["--import", "tsx", fileURLToPath(processUrl)]
    : [fileURLToPath(processUrl)];
  const child = spawn(process.execPath, args, {
    cwd: packageRoot,
    env: childEnvironment(
      options,
      bootstrapCapability,
      lockPaths,
      capabilityKey,
      bootstrap,
    ),
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.pid === undefined || child.stdout === null || child.stderr === null) {
    child.kill("SIGKILL");
    throw new Error("failed to start agent fabric daemon process");
  }
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-8192);
  });
  const exitPromise = new Promise<ChildExit>((resolvePromise) => {
    child.once("exit", (code, signal) => resolvePromise({ code, signal }));
  });
  const pid = child.pid;
  let released = false;
  let stopPromise: Promise<void> | undefined;
  const stopChild = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) {
      await exitPromise;
      return;
    }
    child.kill("SIGTERM");
    const graceful = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 2_000);
      void exitPromise.then(() => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
    if (!graceful && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
    await exitPromise;
  };
  const ready = (async (): Promise<void> => {
    try {
      await waitUntilReady(child, () => stderr);
    } catch (error: unknown) {
      child.kill("SIGKILL");
      await exitPromise;
      if (error instanceof FabricRemoteError) throw error;
      throw new BootstrapSpawnPhaseError(
        "spawn",
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    }
  })();
  return {
    bootstrapCapability,
    pid,
    ready,
    exit: exitPromise,
    isRunning(): boolean {
      return child.exitCode === null && child.signalCode === null;
    },
    release(): void {
      if (released) return;
      released = true;
      child.unref();
      const stdout = child.stdout as typeof child.stdout & { unref?: () => void };
      const stderrStream = child.stderr as typeof child.stderr & { unref?: () => void };
      stdout.unref?.();
      stderrStream.unref?.();
    },
    terminate(): Promise<void> {
      stopPromise ??= stopChild();
      return stopPromise;
    },
  };
}

function identityMatchesOwner(identity: PrivateDiscoveryIdentity, owner: PrivateDiscoveryOwner): boolean {
  return identity.actionId === owner.actionId
    && identity.electionGeneration === owner.electionGeneration
    && identity.daemonInstanceGeneration === owner.daemonInstanceGeneration
    && identity.socketPath === owner.socketPath
    && identity.pid === owner.pid
    && identity.bootstrapCapabilityHash === owner.bootstrapCapabilityHash;
}

function readyMatchesOwner(receipt: BootstrapReadyReceipt, owner: PrivateDiscoveryOwner): boolean {
  return receipt.actionId === owner.actionId
    && receipt.electionGeneration === owner.electionGeneration
    && receipt.daemonInstanceGeneration === owner.daemonInstanceGeneration
    && receipt.socketPath === owner.socketPath;
}

function socketEntryExists(socketPath: string): boolean {
  try {
    lstatSync(socketPath);
    return true;
  } catch (error: unknown) {
    if (isRecord(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    if (isRecord(error) && error.code === "ESRCH") return false;
    return true;
  }
}

async function reconcileUnreachablePrivateDaemon(
  paths: PrivateDiscoveryPaths,
  socketPath: string,
): Promise<boolean> {
  const discovery = await readPrivateDiscovery(paths, socketPath);
  if (discovery.status !== "active" || processIsRunning(discovery.owner.pid)) {
    return false;
  }
  await markPrivateDiscoveryTerminal({
    paths,
    expected: discovery.owner,
    state: "crashed",
    exitCode: null,
    signal: null,
  });
  return true;
}

async function privateDaemonHandshake(
  paths: PrivateDiscoveryPaths,
  election: BootstrapElection,
  socketPath: string,
  provisional: PrivateDiscoveryIdentity | undefined,
): Promise<DaemonHandshakeResult<PrivateDaemonAttachment>> {
  const discovery = await readPrivateDiscovery(paths, socketPath);
  if (discovery.status === "absent") {
    if (socketEntryExists(socketPath)) {
      return {
        status: "unavailable",
        reason: "unreachable",
        message: "trusted socket exists without generation-bound private discovery",
        reconciliationRequired: true,
      };
    }
    return { status: "unavailable", reason: "absent", message: "private daemon discovery is absent" };
  }
  if (discovery.status === "terminal") {
    return {
      status: "unavailable",
      reason: "stale",
      message: `daemon generation ${String(discovery.owner.daemonInstanceGeneration)} is proved ${discovery.owner.state}`,
      terminalEvidence: {
        state: discovery.owner.state === "stopped" ? "stopped" : "crashed",
        actionId: discovery.owner.actionId,
        electionGeneration: discovery.owner.electionGeneration,
        daemonInstanceGeneration: discovery.owner.daemonInstanceGeneration,
        socketPath: discovery.owner.socketPath,
      },
    };
  }
  if (discovery.status === "ambiguous") {
    return {
      status: "unavailable",
      reason: "unreachable",
      message: discovery.message,
      reconciliationRequired: true,
    };
  }

  let client: FabricDaemonClient;
  try {
    client = await FabricDaemonClient.connect(discovery.receipt.socketPath, discovery.receipt.bootstrapCapability);
  } catch (error: unknown) {
    return {
      status: "unavailable",
      reason: error instanceof FabricRemoteError && error.code === "DAEMON_CONNECT_TIMEOUT" ? "timeout" : "unreachable",
      message: error instanceof Error ? error.message : String(error),
      reconciliationRequired: true,
    };
  }
  const initialized = client.initializeResult;
  await client.close();
  if (initialized.protocolVersion !== FABRIC_PROTOCOL_VERSION || !initialized.capabilities.includes("rpc")) {
    return { status: "incompatible", responsive: true, message: "daemon private protocol is incompatible" };
  }

  const provisionallyOwned = provisional !== undefined
    && identityMatchesOwner(provisional, discovery.owner);
  if (!provisionallyOwned) {
    let outcome;
    try {
      outcome = await election.readGenerationOutcome(discovery.owner.electionGeneration);
    } catch (error: unknown) {
      if (isRecord(error) && error.code === "BOOTSTRAP_GENERATION_SUPERSEDED") {
        return {
          status: "unavailable",
          reason: "stale",
          message: "daemon discovery generation was superseded",
          reconciliationRequired: true,
        };
      }
      throw error;
    }
    if (outcome?.kind !== "ready") {
      return {
        status: "unavailable",
        reason: "unreachable",
        message: "responsive daemon discovery has no confirmed ready generation",
        reconciliationRequired: true,
      };
    }
    if (!readyMatchesOwner(outcome.receipt, discovery.owner)) {
      throw new FabricRemoteError(
        "DAEMON_DISCOVERY_GENERATION_MISMATCH",
        "daemon discovery owner does not match the authoritative ready receipt",
      );
    }
  }
  return {
    status: "compatible",
    client: { receipt: discovery.receipt, owner: discovery.owner },
    protocolVersion: initialized.protocolVersion,
    daemonInstanceGeneration: discovery.owner.daemonInstanceGeneration,
    features: initialized.capabilities,
  };
}

async function markSpawnTerminal(
  election: BootstrapElection,
  paths: PrivateDiscoveryPaths,
  identity: PrivateDiscoveryIdentity,
  state: "stopped" | "crashed",
  exit: ChildExit,
): Promise<void> {
  const result = await election.withExclusiveLock(`terminal-${identity.actionId}`, async () => {
    await markPrivateDiscoveryTerminal({
      paths,
      expected: identity,
      state,
      exitCode: exit.code,
      signal: exit.signal,
    });
  });
  if (result.role === "observer") {
    const discovery = await readPrivateDiscovery(paths, identity.socketPath);
    if (discovery.status !== "terminal" || !identityMatchesOwner(identity, discovery.owner)) {
      throw new FabricRemoteError(
        "DAEMON_DISCOVERY_TERMINAL_UNCONFIRMED",
        "daemon exit could not confirm its generation-bound discovery transition",
      );
    }
  }
}

async function spawnProductionDaemon(input: {
  options: DaemonStartOptions;
  actionId: string;
  electionGeneration: number;
  paths: PrivateDiscoveryPaths;
  election: BootstrapElection;
}): Promise<ProductionSpawn> {
  const prepared = await prepareDaemonStart(input.options);
  const daemonInstanceGeneration = input.electionGeneration;
  const child = await spawnDaemonChild(prepared, {
    mode: "production-election",
    actionId: input.actionId,
    electionGeneration: input.electionGeneration,
    daemonInstanceGeneration,
  });
  let cleanStopRequested = false;
  const identity = (async (): Promise<PrivateDiscoveryIdentity> => {
    await child.ready;
    return await publishPrivateDiscovery({
      paths: input.paths,
      actionId: input.actionId,
      electionGeneration: input.electionGeneration,
      daemonInstanceGeneration,
      socketPath: prepared.socketPath,
      pid: child.pid,
      bootstrapCapability: child.bootstrapCapability,
    });
  })();
  const publishedIdentity = identity.then(
    (value) => value,
    () => undefined,
  );
  const exit = Promise.all([child.exit, publishedIdentity]).then(async ([childExit, owner]) => {
    if (owner === undefined) return;
    await markSpawnTerminal(
      input.election,
      input.paths,
      owner,
      cleanStopRequested ? "stopped" : "crashed",
      childExit,
    );
  });
  void exit.catch(() => undefined);
  let stopPromise: Promise<void> | undefined;
  return {
    bootstrapCapability: child.bootstrapCapability,
    pid: child.pid,
    identity,
    exit,
    release(): void {
      child.release();
    },
    stop(clean: boolean): Promise<void> {
      if (clean && child.isRunning()) cleanStopRequested = true;
      stopPromise ??= child.terminate().then(async () => await exit);
      return stopPromise;
    },
  };
}

function ownerHandle(spawned: ProductionSpawn, socketPath: string): FabricDaemonHandle {
  let stopPromise: Promise<void> | undefined;
  return {
    bootstrapCapability: spawned.bootstrapCapability,
    address: { transport: "unix", path: socketPath },
    pid: spawned.pid,
    ownsProcess: true,
    release(): void {
      spawned.release();
    },
    stop(): Promise<void> {
      stopPromise ??= spawned.stop(true);
      return stopPromise;
    },
    waitForExit(): Promise<void> {
      return spawned.exit;
    },
  };
}

function attachedHandle(
  attachment: PrivateDaemonAttachment,
  paths: PrivateDiscoveryPaths,
): FabricDaemonHandle {
  let detach: (() => void) | undefined;
  let released = false;
  const detached = new Promise<void>((resolvePromise) => { detach = resolvePromise; });
  const incumbentExit = (async (): Promise<void> => {
    while (!released) {
      const current = await readPrivateDiscovery(paths, attachment.owner.socketPath);
      if (current.status !== "active" || !identityMatchesOwner(attachment.owner, current.owner)) return;
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 50));
    }
  })();
  const localExit = Promise.race([incumbentExit, detached]);
  void localExit.catch(() => undefined);
  return {
    bootstrapCapability: attachment.receipt.bootstrapCapability,
    address: { transport: "unix", path: attachment.receipt.socketPath },
    pid: attachment.receipt.pid,
    ownsProcess: false,
    release(): void {
      released = true;
      detach?.();
    },
    async stop(): Promise<void> {
      released = true;
      detach?.();
    },
    waitForExit(): Promise<void> {
      return localExit;
    },
  };
}

export async function startFabricDaemon(options: DaemonStartOptions): Promise<FabricDaemonHandle> {
  const normalized = normalizedStartOptions(options);
  await Promise.all([
    ensurePrivateDirectory(normalized.stateDirectory),
    ensurePrivateDirectory(normalized.runtimeDirectory),
  ]);
  normalized.databasePath = safeDatabasePath(normalized.databasePath);
  const paths = privateDiscoveryPaths(normalized.runtimeDirectory);
  const election = new BootstrapElection({ runtimeDirectory: normalized.runtimeDirectory });
  const actionId = stableBootstrapActionId(normalized);
  let provisional: PrivateDiscoveryIdentity | undefined;
  let spawned: ProductionSpawn | undefined;
  let attached;
  try {
    attached = await attachOrStartDaemon<PrivateDaemonAttachment>({
      actionId,
      socketPath: normalized.socketPath,
      requiredProtocolVersion: FABRIC_PROTOCOL_VERSION,
      requiredFeatures: ["rpc"],
      election,
      handshake: async () => await privateDaemonHandshake(paths, election, normalized.socketPath, provisional),
      reconcile: async (unavailable) => {
        if (!await reconcileUnreachablePrivateDaemon(paths, normalized.socketPath)) {
          return unavailable;
        }
        return await privateDaemonHandshake(
          paths,
          election,
          normalized.socketPath,
          provisional,
        );
      },
      spawn: async (bootstrap) => {
        spawned = await spawnProductionDaemon({
          options: normalized,
          actionId: bootstrap.actionId,
          electionGeneration: bootstrap.electionGeneration,
          paths,
          election,
        });
        return {
          ready: (async () => {
            provisional = await spawned.identity;
            return {
              daemonInstanceGeneration: provisional.daemonInstanceGeneration,
              socketPath: provisional.socketPath,
              protocolVersion: FABRIC_PROTOCOL_VERSION,
              features: ["rpc"],
              evidence: {
                databaseOwned: true,
                migrationsComplete: true,
                recoveryComplete: true,
                socketBound: true,
              },
            };
          })(),
        };
      },
    });
  } catch (error: unknown) {
    await spawned?.stop(false).catch(() => undefined);
    throw error;
  }
  if (attached.started) {
    if (spawned === undefined) {
      throw new FabricRemoteError("DAEMON_BOOTSTRAP_INVALID", "bootstrap reported a started daemon without an owned child");
    }
    return ownerHandle(spawned, normalized.socketPath);
  }
  return attachedHandle(attached.client, paths);
}

/**
 * Test-only raw process launcher for process-lock cleanup and alias regression
 * coverage. Production callers must use startFabricDaemon's flock election.
 */
export async function forceStartFabricDaemonForTests(options: DaemonStartOptions): Promise<FabricDaemonHandle> {
  const normalized = normalizedStartOptions(options);
  await Promise.all([
    ensurePrivateDirectory(normalized.stateDirectory),
    ensurePrivateDirectory(normalized.runtimeDirectory),
  ]);
  const prepared = await prepareDaemonStart(normalized);
  const child = await spawnDaemonChild(prepared, {
    mode: "test-forced-process-locks",
    actionId: `test-forced-${randomBytes(16).toString("hex")}`,
    electionGeneration: 1,
    daemonInstanceGeneration: 1,
  });
  try {
    await child.ready;
  } catch (error: unknown) {
    await child.terminate().catch(() => undefined);
    throw error;
  }
  let stopPromise: Promise<void> | undefined;
  return {
    bootstrapCapability: child.bootstrapCapability,
    address: { transport: "unix", path: prepared.socketPath },
    pid: child.pid,
    ownsProcess: true,
    release(): void {
      child.release();
    },
    stop(): Promise<void> {
      stopPromise ??= child.terminate();
      return stopPromise;
    },
    async waitForExit(): Promise<void> {
      await child.exit;
    },
  };
}

async function waitUntilReady(child: ChildProcess, stderr: () => string): Promise<void> {
  if (child.stdout === null) {
    throw new Error("daemon stdout is unavailable");
  }
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("agent fabric daemon startup timed out")), 10_000);
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      clearTimeout(timeout);
      reject(new Error(`agent fabric daemon exited before ready (${String(code)}, ${String(signal)}): ${stderr()}`));
    };
    child.once("exit", onExit);
    lines.once("line", (line) => {
      clearTimeout(timeout);
      child.off("exit", onExit);
      try {
        const value: unknown = JSON.parse(line);
        if (isRecord(value) && value.ready === false && isRecord(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string") {
          reject(new FabricRemoteError(value.error.code, value.error.message));
          return;
        }
        if (!isRecord(value) || value.ready !== true) {
          reject(new Error("agent fabric daemon returned an invalid ready message"));
          return;
        }
        resolve();
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
  lines.close();
}

export class FabricDaemonClient {
  readonly #transport: TimedNdjsonTransport;

  private constructor(transport: TimedNdjsonTransport) {
    this.#transport = transport;
  }

  static async connect(socketPath: string, capability: string): Promise<FabricDaemonClient> {
    return new FabricDaemonClient(await TimedNdjsonTransport.connect({ socketPath, capability }));
  }

  get initializeResult(): DaemonInitializeResult {
    return this.#transport.initializeResult;
  }

  async #call(method: string, params: Record<string, unknown>): Promise<unknown> {
    return this.#transport.call(method, params);
  }

  async close(): Promise<void> {
    await this.#transport.close();
  }

  async createRun(input: {
    runId: string;
    workspaceRoot?: string;
    projectRunDirectory?: string;
    chair: { agentId: string; authority: AuthorityInput };
  }): Promise<{ runId: string; chairAuthorityId: string; chairCapability: string }> {
    const result = await this.#call("createRun", input);
    if (!isRecord(result) || typeof result.runId !== "string" || typeof result.chairAuthorityId !== "string" || typeof result.chairCapability !== "string") {
      throw new Error("daemon returned an invalid run result");
    }
    return { runId: result.runId, chairAuthorityId: result.chairAuthorityId, chairCapability: result.chairCapability };
  }

  async provisionLocalOperator(
    input: Omit<LocalOperatorProvisioningInput, "authenticatedSubjectHash">,
  ): Promise<LocalOperatorProvisioningResult> {
    return localOperatorProvisioningResult(await this.#call("provisionLocalOperator", input));
  }

  async openLocalOperatorConsoleCapability(
    input: Omit<LocalOperatorConsoleCapabilityInput, "authenticatedSubjectHash">,
  ): Promise<LocalOperatorConsoleCapabilityResult> {
    const result = localOperatorProvisioningResult(
      await this.#call("openLocalOperatorConsoleCapability", input),
    );
    if (!result.issued) {
      throw new Error("daemon did not issue a fresh local Console capability");
    }
    return result;
  }

  async issueLocalOperatorSessionCapability(
    input: Omit<LocalOperatorSessionCapabilityInput, "authenticatedSubjectHash">,
  ): Promise<LocalOperatorSessionCapabilityResult> {
    return localOperatorSessionCapabilityResult(
      await this.#call("issueLocalOperatorSessionCapability", input),
    );
  }

  async openLocalOperatorConsoleSessionCapability(
    input: Omit<LocalOperatorSessionCapabilityInput, "authenticatedSubjectHash" | "fresh">,
  ): Promise<LocalOperatorConsoleSessionCapabilityResult> {
    const result = localOperatorSessionCapabilityResult(
      await this.#call("openLocalOperatorConsoleSessionCapability", input),
    );
    if (!result.issued) {
      throw new Error("daemon did not issue a fresh local Console session capability");
    }
    return result;
  }

  async rotateLocalOperatorPrincipal(
    input: Omit<LocalOperatorPrincipalRotationInput, "authenticatedSubjectHash">,
  ): Promise<LocalOperatorPrincipalRotationResult> {
    return localOperatorPrincipalRotationResult(
      await this.#call("rotateLocalOperatorPrincipal", input),
    );
  }

  async delegateAuthority(input: {
    parentAuthorityId: string;
    authority: AuthorityInput;
    commandId?: string;
  }): Promise<{ authorityId: string }> {
    const result = await this.#call("delegateAuthority", input);
    if (!isRecord(result) || typeof result.authorityId !== "string") {
      throw new Error("daemon returned an invalid authority result");
    }
    return { authorityId: result.authorityId };
  }

  async registerAgent(input: { agentId: string; authorityId: string; providerSessionRef?: string; adapterId?: string }): Promise<{ capability: string }> {
    const result = await this.#call("registerAgent", input);
    if (!isRecord(result) || typeof result.capability !== "string") {
      throw new Error("daemon returned an invalid registration result");
    }
    return { capability: result.capability };
  }

  async dispatchProviderAction(input: {
    adapterId: string;
    actionId: string;
    operation: "send_turn" | "wakeup" | "release" | "steer";
    payload: Record<string, unknown>;
    commandId: string;
  }): Promise<{ actionId: string; status: string; history: string[]; executionCount: number; effectCount: number; result?: unknown }> {
    const result = await this.#call(input.operation === "steer" ? "steerAgent" : "dispatchProviderAction", input);
    if (!isRecord(result) || typeof result.actionId !== "string" || typeof result.status !== "string" || !Array.isArray(result.history) || !result.history.every((value) => typeof value === "string") || typeof result.executionCount !== "number" || typeof result.effectCount !== "number") {
      throw new Error("daemon returned an invalid provider action result");
    }
    return { actionId: result.actionId, status: result.status, history: result.history, executionCount: result.executionCount, effectCount: result.effectCount, ...(result.result === undefined ? {} : { result: result.result }) };
  }

  async createDiscussionGroup(input: {
    groupId: string;
    memberAgentIds: string[];
    teamId?: string;
    commandId: string;
  }): Promise<{ groupId: string; memberAgentIds: string[] }> {
    const result = await this.#call("createDiscussionGroup", input);
    if (!isRecord(result) || typeof result.groupId !== "string" || !Array.isArray(result.memberAgentIds) || !result.memberAgentIds.every((item) => typeof item === "string")) {
      throw new Error("daemon returned an invalid discussion group");
    }
    return { groupId: result.groupId, memberAgentIds: result.memberAgentIds };
  }

  async freezeSubtree(input: {
    teamId: string;
    expectedGeneration: number;
    reason: string;
    commandId: string;
  }): Promise<TeamResult> {
    return teamResult(await this.#call("freezeSubtree", input));
  }

  async adoptSubtree(input: {
    teamId: string;
    successorAgentId: string;
    expectedGeneration: number;
    handoffEvidence: string;
    commandId: string;
  }): Promise<TeamResult> {
    return teamResult(await this.#call("adoptSubtree", input));
  }

  async closeSubtreeBarrier(input: {
    teamId: string;
    expectedGeneration: number;
    commandId: string;
  }): Promise<{ teamId: string; generation: number; closed: true }> {
    const result = await this.#call("closeSubtreeBarrier", input);
    if (!isRecord(result) || typeof result.teamId !== "string" || typeof result.generation !== "number" || result.closed !== true) {
      throw new Error("daemon returned an invalid subtree barrier result");
    }
    return { teamId: result.teamId, generation: result.generation, closed: true };
  }

  async reserveBudget(input: {
    teamId: string;
    expectedTeamGeneration: number;
    parentBudgetId: string;
    budgetId: string;
    dimensions: Record<string, number>;
    commandId: string;
  }): Promise<BudgetResult> {
    return budgetResult(await this.#call("reserveBudget", input));
  }

  async recordBudgetUsage(input: {
    budgetId: string;
    usage: Record<string, number | null>;
    commandId: string;
  }): Promise<BudgetResult> {
    return budgetResult(await this.#call("recordBudgetUsage", input));
  }

  async reconcileBudgetUsage(input: {
    budgetId: string;
    consumed: Record<string, number>;
    commandId: string;
  }): Promise<BudgetResult> {
    return budgetResult(await this.#call("reconcileBudgetUsage", input));
  }

  async releaseBudget(input: { budgetId: string; commandId: string }): Promise<BudgetResult> {
    return budgetResult(await this.#call("releaseBudget", input));
  }

  async getBudget(input: { budgetId: string }): Promise<BudgetResult> {
    return budgetResult(await this.#call("getBudget", input));
  }

  async acknowledgeTaskHandoff(input: {
    taskId: string;
    taskRevision: number;
    ownerLeaseGeneration: number;
    commandId: string;
  }): Promise<{ acknowledged: true }> {
    const result = await this.#call("acknowledgeTaskHandoff", input);
    if (!isRecord(result) || result.acknowledged !== true) {
      throw new Error("daemon returned an invalid task handoff acknowledgement");
    }
    return { acknowledged: true };
  }

  async sendMessage(input: MessageInput): Promise<{ messageId: string }> {
    const result = await this.#call("sendMessage", input);
    if (!isRecord(result) || typeof result.messageId !== "string") {
      throw new Error("daemon returned an invalid message result");
    }
    return { messageId: result.messageId };
  }

  async receiveMessages(input: { limit: number; visibilityTimeoutMs: number }): Promise<Array<{
    deliveryId: string;
    messageId: string;
    sequence: number;
    body: string;
    attempt: number;
    senderId: string;
    kind: MessageInput["kind"];
    requiresAck: boolean;
  }>> {
    const result = await this.#call("receiveMessages", input);
    if (!Array.isArray(result)) {
      throw new Error("daemon returned invalid deliveries");
    }
    const deliveries: Array<{
      deliveryId: string;
      messageId: string;
      sequence: number;
      body: string;
      attempt: number;
      senderId: string;
      kind: MessageInput["kind"];
      requiresAck: boolean;
    }> = [];
    for (const value of result) {
      if (!isRecord(value) || typeof value.deliveryId !== "string" || typeof value.messageId !== "string" || typeof value.sequence !== "number" || typeof value.body !== "string" || typeof value.attempt !== "number" || typeof value.senderId !== "string" || !isMessageKind(value.kind) || typeof value.requiresAck !== "boolean") {
        throw new Error("daemon returned an invalid delivery");
      }
      deliveries.push({
        deliveryId: value.deliveryId,
        messageId: value.messageId,
        sequence: value.sequence,
        body: value.body,
        attempt: value.attempt,
        senderId: value.senderId,
        kind: value.kind,
        requiresAck: value.requiresAck,
      });
    }
    return deliveries;
  }

  async acknowledgeDelivery(input: { deliveryId: string }): Promise<void> {
    await this.#call("acknowledgeDelivery", input);
  }

  async abandonDelivery(input: { deliveryId: string; reason: string; commandId: string }): Promise<{
    deliveryId: string;
    status: "abandoned";
    reason: string;
  }> {
    const result = await this.#call("abandonDelivery", input);
    if (!isRecord(result) || typeof result.deliveryId !== "string" || result.status !== "abandoned" || typeof result.reason !== "string") {
      throw new Error("daemon returned an invalid delivery abandonment result");
    }
    return { deliveryId: result.deliveryId, status: result.status, reason: result.reason };
  }

  async getMailboxState(): Promise<{ contiguousWatermark: number; acknowledgedAboveWatermark: number[] }> {
    const result = await this.#call("getMailboxState", {});
    if (!isRecord(result) || typeof result.contiguousWatermark !== "number" || !Array.isArray(result.acknowledgedAboveWatermark) || !result.acknowledgedAboveWatermark.every((value) => typeof value === "number")) {
      throw new Error("daemon returned an invalid mailbox state");
    }
    return { contiguousWatermark: result.contiguousWatermark, acknowledgedAboveWatermark: result.acknowledgedAboveWatermark };
  }

  async eventsAfter(input: { cursor: number; limit: number }): Promise<EventsAfterResult> {
    const result = await this.#call("eventsAfter", input);
    if (!isRecord(result) || !Array.isArray(result.events) || typeof result.nextCursor !== "number") {
      throw new Error("daemon returned an invalid event page");
    }
    const events = result.events.map((value) => {
      if (
        !isRecord(value) || typeof value.cursor !== "number" || typeof value.eventId !== "string" ||
        typeof value.type !== "string" || (value.actorAgentId !== null && typeof value.actorAgentId !== "string") ||
        typeof value.createdAt !== "number" || typeof value.summary !== "string"
      ) throw new Error("daemon returned an invalid observer event");
      return {
        cursor: value.cursor,
        eventId: value.eventId,
        type: value.type,
        actorAgentId: value.actorAgentId,
        createdAt: value.createdAt,
        summary: value.summary,
      };
    });
    return { events, nextCursor: result.nextCursor };
  }

  async acquireWriteLease(input: { scope: string[]; ttlMs: number; commandId: string; taskId?: string }): Promise<{
    leaseId: string; holderAgentId: string; generation: number; status: "active" | "quarantined"; scope: string[];
  }> {
    return this.#leaseResult(await this.#call("acquireWriteLease", input));
  }

  async getWriteLease(input: { leaseId: string }): Promise<{
    leaseId: string; holderAgentId: string; generation: number; status: "active" | "quarantined"; scope: string[];
  }> {
    return this.#leaseResult(await this.#call("getWriteLease", input));
  }

  #leaseResult(result: unknown): { leaseId: string; holderAgentId: string; generation: number; status: "active" | "quarantined"; scope: string[] } {
    if (!isRecord(result) || typeof result.leaseId !== "string" || typeof result.holderAgentId !== "string" || typeof result.generation !== "number" || (result.status !== "active" && result.status !== "quarantined") || !Array.isArray(result.scope) || !result.scope.every((value) => typeof value === "string")) {
      throw new Error("daemon returned an invalid write lease result");
    }
    return { leaseId: result.leaseId, holderAgentId: result.holderAgentId, generation: result.generation, status: result.status, scope: result.scope };
  }
}

export async function connectFabricDaemon(options: { socketPath: string; capability: string }): Promise<FabricDaemonClient> {
  return FabricDaemonClient.connect(options.socketPath, options.capability);
}

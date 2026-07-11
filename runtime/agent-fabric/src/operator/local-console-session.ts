import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { createConnection } from "node:net";
import { join, resolve } from "node:path";

import { flock } from "fs-ext";
import {
  NdjsonRpcTransport,
  createOperatorClient,
  type CommandId,
  type NegotiatedOperatorClient,
  type NonTakeoverOperatorAction,
  type OperatorAttachment,
  type OperatorCapabilityCredential,
  type OperatorClientId,
  type OperatorId,
  type OperatorMutationContext,
  type ProjectId,
  type ProjectSessionDiscovery,
  type ProjectSessionId,
  type ProtocolFeature,
  type ProtocolInitializeRequest,
  type Timestamp,
} from "@local/agent-fabric-protocol";

import {
  FabricDaemonClient,
  startFabricDaemon,
  type DaemonStartOptions,
} from "../daemon/client.js";
import { resolveFabricPaths, type FabricPaths } from "../cli/paths.js";
import { trustedWorkspaceIdentity } from "../cli/workspace-trust.js";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const MAX_CREDENTIAL_FILE_BYTES = 128 * 1024;
const PROJECT_ACTIONS = ["launch", "read"] as const;
const SESSION_ACTIONS = [
  "read",
  "steer",
  "pause",
  "resume",
  "cancel",
  "drain",
  "stop",
] as const satisfies readonly NonTakeoverOperatorAction[];
const TERMINAL_SESSION_STATES = new Set(["closed", "cancelled", "launch_failed"]);
const REQUIRED_FEATURES = [
  "operator-control.v1",
  "operator-projection.v1",
] as const satisfies readonly ProtocolFeature[];
const OPTIONAL_FEATURES = [
  "project-sessions.v1",
  "operator-projection.v2",
  "scoped-gate-read.v1",
  "operator-actions.v1",
  "message-body-read.v1",
  "operator-repository-read.v1",
  "lifecycle-control.v1",
  "launch-custody.v1",
] as const satisfies readonly ProtocolFeature[];

export type LocalOperatorConsoleUnavailableReason =
  | "configuration-missing"
  | "start-failed"
  | "authority-unavailable";

export class LocalOperatorConsoleUnavailableError extends Error {
  readonly code:
    | "CONSOLE_CONFIGURATION_UNAVAILABLE"
    | "CONSOLE_START_FAILED"
    | "CONSOLE_AUTHORITY_UNAVAILABLE";
  readonly reason: LocalOperatorConsoleUnavailableReason;

  constructor(reason: LocalOperatorConsoleUnavailableReason) {
    super(`local Console ${reason}`);
    this.name = "LocalOperatorConsoleUnavailableError";
    this.reason = reason;
    this.code = reason === "configuration-missing"
      ? "CONSOLE_CONFIGURATION_UNAVAILABLE"
      : reason === "start-failed"
        ? "CONSOLE_START_FAILED"
        : "CONSOLE_AUTHORITY_UNAVAILABLE";
  }
}

export type LocalOperatorConsoleSessionOptions = Readonly<{
  projectRoot: string;
  surface: "standalone" | "herdr";
  paths?: FabricPaths;
  agentsHome?: string;
  daemon?: Pick<
    DaemonStartOptions,
    | "adapters"
    | "executionProfile"
    | "maximumConcurrentProviderTurns"
    | "workspaceRoots"
    | "configuration"
  >;
  clientId?: string;
  now?: () => number;
  credentialLifetimeMs?: number;
  attachmentLeaseMs?: number;
  heartbeatIntervalMs?: number;
}>;

export type LocalOperatorConsoleSession = Readonly<{
  client: NegotiatedOperatorClient;
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  operatorId: OperatorId;
  projectSessionId?: ProjectSessionId;
  clientId: OperatorClientId;
  daemonPid: number;
  detach(input: Readonly<{ reason: "operator" | "safety" | "signal" }>): Promise<void>;
  close(): Promise<void>;
}>;

type ProjectProvisionRequest = Readonly<{
  canonicalRoot: string;
  trustRecordDigest: string;
  projectAuthorityGeneration: 1;
  principalGeneration: 1;
  actions: typeof PROJECT_ACTIONS;
  expiresAt: string;
}>;

type CachedCredential = Readonly<{
  capabilityId: string;
  token: string;
}>;

type ProjectCredentialRecord = Readonly<{
  request: ProjectProvisionRequest;
  projectId: string;
  operatorId: string;
  capabilityId: string;
  expiresAt: string;
  credential: CachedCredential;
}>;

type SessionCredentialRecord = Readonly<{
  projectSessionId: string;
  sessionGeneration: number;
  actions: readonly NonTakeoverOperatorAction[];
  expiresAt: string;
  launchEnvelopeExpiresAt: string;
  capabilityId: string;
  credential: CachedCredential;
}>;

type CredentialBundle = Readonly<{
  schemaVersion: 1;
  canonicalRoot: string;
  trustRecordDigest: string;
  project: ProjectCredentialRecord;
  sessions: Readonly<Record<string, SessionCredentialRecord>>;
}>;

type StorePaths = Readonly<{
  directory: string;
  lockPath: string;
  credentialPath: string;
}>;

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function credential(value: unknown): CachedCredential | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["capabilityId", "token"]) ||
    !nonEmptyString(value.capabilityId) ||
    !nonEmptyString(value.token)
  ) return null;
  return { capabilityId: value.capabilityId, token: value.token };
}

function parseProjectRecord(value: unknown): ProjectCredentialRecord | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "request", "projectId", "operatorId", "capabilityId", "expiresAt", "credential",
    ]) ||
    !isRecord(value.request) ||
    !exactKeys(value.request, [
      "canonicalRoot", "trustRecordDigest", "projectAuthorityGeneration",
      "principalGeneration", "actions", "expiresAt",
    ]) ||
    !nonEmptyString(value.request.canonicalRoot) ||
    !nonEmptyString(value.request.trustRecordDigest) ||
    value.request.projectAuthorityGeneration !== 1 ||
    value.request.principalGeneration !== 1 ||
    !Array.isArray(value.request.actions) ||
    value.request.actions.length !== 2 ||
    value.request.actions[0] !== "launch" ||
    value.request.actions[1] !== "read" ||
    !nonEmptyString(value.request.expiresAt) ||
    !nonEmptyString(value.projectId) ||
    !nonEmptyString(value.operatorId) ||
    !nonEmptyString(value.capabilityId) ||
    !nonEmptyString(value.expiresAt)
  ) return null;
  const parsedCredential = credential(value.credential);
  if (
    parsedCredential === null ||
    parsedCredential.capabilityId !== value.capabilityId ||
    value.expiresAt !== value.request.expiresAt
  ) return null;
  return {
    request: {
      canonicalRoot: value.request.canonicalRoot,
      trustRecordDigest: value.request.trustRecordDigest,
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
      actions: PROJECT_ACTIONS,
      expiresAt: value.request.expiresAt,
    },
    projectId: value.projectId,
    operatorId: value.operatorId,
    capabilityId: value.capabilityId,
    expiresAt: value.expiresAt,
    credential: parsedCredential,
  };
}

function parseSessionRecord(value: unknown): SessionCredentialRecord | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "projectSessionId", "sessionGeneration", "actions", "expiresAt",
      "launchEnvelopeExpiresAt", "capabilityId", "credential",
    ]) ||
    !nonEmptyString(value.projectSessionId) ||
    typeof value.sessionGeneration !== "number" ||
    !Number.isSafeInteger(value.sessionGeneration) ||
    value.sessionGeneration < 1 ||
    !Array.isArray(value.actions) ||
    value.actions.length !== SESSION_ACTIONS.length ||
    value.actions.some((action, index) => action !== SESSION_ACTIONS[index]) ||
    !nonEmptyString(value.expiresAt) ||
    !nonEmptyString(value.launchEnvelopeExpiresAt) ||
    !nonEmptyString(value.capabilityId)
  ) return null;
  const parsedCredential = credential(value.credential);
  if (
    parsedCredential === null ||
    parsedCredential.capabilityId !== value.capabilityId
  ) return null;
  return {
    projectSessionId: value.projectSessionId,
    sessionGeneration: value.sessionGeneration,
    actions: SESSION_ACTIONS,
    expiresAt: value.expiresAt,
    launchEnvelopeExpiresAt: value.launchEnvelopeExpiresAt,
    capabilityId: value.capabilityId,
    credential: parsedCredential,
  };
}

function parseBundle(value: unknown): CredentialBundle {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "schemaVersion", "canonicalRoot", "trustRecordDigest", "project", "sessions",
    ]) ||
    value.schemaVersion !== 1 ||
    !nonEmptyString(value.canonicalRoot) ||
    !nonEmptyString(value.trustRecordDigest) ||
    !isRecord(value.sessions)
  ) {
    throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
  }
  const project = parseProjectRecord(value.project);
  if (project === null) {
    throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
  }
  const sessions: Record<string, SessionCredentialRecord> = {};
  for (const [key, candidate] of Object.entries(value.sessions)) {
    const session = parseSessionRecord(candidate);
    if (session === null || key !== sessionKey(session.projectSessionId, session.sessionGeneration)) {
      throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
    }
    sessions[key] = session;
  }
  return {
    schemaVersion: 1,
    canonicalRoot: value.canonicalRoot,
    trustRecordDigest: value.trustRecordDigest,
    project,
    sessions,
  };
}

function positiveDuration(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return selected;
}

function storePaths(stateDirectory: string, canonicalRoot: string): StorePaths {
  const projectKey = createHash("sha256").update(canonicalRoot).digest("hex").slice(0, 32);
  const directory = join(stateDirectory, "console-operators", projectKey);
  return {
    directory,
    lockPath: join(directory, "credential.lock"),
    credentialPath: join(directory, "credential.json"),
  };
}

async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (info.mode & 0o777) !== PRIVATE_DIRECTORY_MODE ||
    (typeof process.getuid === "function" && info.uid !== process.getuid())
  ) {
    throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
  }
}

async function validatePrivateHandle(handle: FileHandle): Promise<void> {
  const info = await handle.stat();
  if (
    !info.isFile() ||
    info.nlink !== 1 ||
    (info.mode & 0o777) !== PRIVATE_FILE_MODE ||
    (typeof process.getuid === "function" && info.uid !== process.getuid())
  ) {
    throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
  }
}

async function flockPromise(fileDescriptor: number, mode: "ex" | "un"): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    flock(fileDescriptor, mode, (error) => {
      if (error === null) resolvePromise();
      else reject(error);
    });
  });
}

async function withCredentialLock<T>(paths: StorePaths, operation: () => Promise<T>): Promise<T> {
  await ensurePrivateDirectory(paths.directory);
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      paths.lockPath,
      constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW,
      PRIVATE_FILE_MODE,
    );
    await validatePrivateHandle(handle);
    await flockPromise(handle.fd, "ex");
    try {
      await validatePrivateHandle(handle);
      return await operation();
    } finally {
      await flockPromise(handle.fd, "un");
    }
  } catch (error: unknown) {
    if (error instanceof LocalOperatorConsoleUnavailableError) throw error;
    throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function readBundle(path: string): Promise<CredentialBundle | null> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    await validatePrivateHandle(handle);
    const info = await handle.stat();
    if (info.size > MAX_CREDENTIAL_FILE_BYTES) {
      throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
    }
    return parseBundle(JSON.parse(await handle.readFile("utf8")));
  } catch (error: unknown) {
    if (isErrno(error, "ENOENT")) return null;
    if (error instanceof LocalOperatorConsoleUnavailableError) throw error;
    throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function writeBundle(paths: StorePaths, bundle: CredentialBundle): Promise<void> {
  const serialized = `${JSON.stringify(bundle)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_CREDENTIAL_FILE_BYTES) {
    throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
  }
  const temporary = `${paths.credentialPath}.tmp-${process.pid}-${randomUUID()}`;
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      PRIVATE_FILE_MODE,
    );
    await validatePrivateHandle(handle);
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      const existing = await lstat(paths.credentialPath);
      if (!existing.isFile() || existing.isSymbolicLink() || (existing.mode & 0o777) !== PRIVATE_FILE_MODE) {
        throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
      }
    } catch (error: unknown) {
      if (!isErrno(error, "ENOENT")) throw error;
    }
    await rename(temporary, paths.credentialPath);
    await chmod(paths.credentialPath, PRIVATE_FILE_MODE);
    const directory = await open(paths.directory, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error: unknown) {
    if (error instanceof LocalOperatorConsoleUnavailableError) throw error;
    throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function sessionKey(projectSessionId: string, generation: number): string {
  return `${projectSessionId}:${String(generation)}`;
}

function isoTimestamp(milliseconds: number): Timestamp {
  return new Date(milliseconds).toISOString() as Timestamp;
}

function assertFuture(expiresAt: string, now: number): void {
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed) || parsed <= now) {
    throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
  }
}

async function projectCredential(
  privateClient: FabricDaemonClient,
  paths: StorePaths,
  identity: Awaited<ReturnType<typeof trustedWorkspaceIdentity>>,
  now: number,
  credentialLifetimeMs: number,
): Promise<ProjectCredentialRecord> {
  return await withCredentialLock(paths, async () => {
    const existing = await readBundle(paths.credentialPath);
    const request: ProjectProvisionRequest = existing?.project.request ?? {
      canonicalRoot: identity.canonicalRoot,
      trustRecordDigest: identity.trustRecordDigest,
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
      actions: PROJECT_ACTIONS,
      expiresAt: isoTimestamp(now + credentialLifetimeMs),
    };
    if (
      request.canonicalRoot !== identity.canonicalRoot ||
      request.trustRecordDigest !== identity.trustRecordDigest ||
      existing !== null && (
        existing.canonicalRoot !== identity.canonicalRoot ||
        existing.trustRecordDigest !== identity.trustRecordDigest
      )
    ) {
      throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
    }
    assertFuture(request.expiresAt, now);
    const provisioned = await privateClient.provisionLocalOperator(request);
    let record: ProjectCredentialRecord;
    if (provisioned.issued) {
      record = {
        request,
        projectId: provisioned.projectId,
        operatorId: provisioned.operatorId,
        capabilityId: provisioned.capabilityId,
        expiresAt: provisioned.expiresAt,
        credential: provisioned.credential,
      };
    } else {
      const cached = existing?.project;
      if (
        cached === undefined ||
        cached.projectId !== provisioned.projectId ||
        cached.operatorId !== provisioned.operatorId ||
        cached.capabilityId !== provisioned.capabilityId ||
        cached.expiresAt !== provisioned.expiresAt
      ) {
        throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
      }
      record = cached;
    }
    const bundle: CredentialBundle = {
      schemaVersion: 1,
      canonicalRoot: identity.canonicalRoot,
      trustRecordDigest: identity.trustRecordDigest,
      project: record,
      sessions: existing?.sessions ?? {},
    };
    await writeBundle(paths, bundle);
    return record;
  });
}

async function sessionCredential(
  privateClient: FabricDaemonClient,
  paths: StorePaths,
  identity: Awaited<ReturnType<typeof trustedWorkspaceIdentity>>,
  project: ProjectCredentialRecord,
  selected: ProjectSessionDiscovery,
  now: number,
  credentialLifetimeMs: number,
): Promise<SessionCredentialRecord> {
  return await withCredentialLock(paths, async () => {
    const bundle = await readBundle(paths.credentialPath);
    if (
      bundle === null ||
      bundle.canonicalRoot !== identity.canonicalRoot ||
      bundle.trustRecordDigest !== identity.trustRecordDigest ||
      bundle.project.capabilityId !== project.capabilityId
    ) {
      throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
    }
    const key = sessionKey(selected.projectSessionId, selected.generation);
    const existing = bundle.sessions[key];
    const maximumExpiry = Math.min(
      Date.parse(project.expiresAt),
      now + credentialLifetimeMs,
    );
    const expiresAt = existing?.expiresAt ?? isoTimestamp(maximumExpiry);
    const launchEnvelopeExpiresAt = existing?.launchEnvelopeExpiresAt ?? expiresAt;
    assertFuture(expiresAt, now);
    const issued = await privateClient.issueLocalOperatorSessionCapability({
      projectId: project.projectId,
      canonicalRoot: identity.canonicalRoot,
      trustRecordDigest: identity.trustRecordDigest,
      projectCapability: project.credential,
      projectSessionId: selected.projectSessionId,
      sessionGeneration: selected.generation,
      actions: SESSION_ACTIONS,
      expiresAt,
      launchEnvelopeExpiresAt,
    });
    let record: SessionCredentialRecord;
    if (issued.issued) {
      record = {
        projectSessionId: issued.projectSessionId,
        sessionGeneration: issued.sessionGeneration,
        actions: issued.actions,
        expiresAt: issued.expiresAt,
        launchEnvelopeExpiresAt,
        capabilityId: issued.capabilityId,
        credential: issued.credential,
      };
    } else {
      if (
        existing === undefined ||
        existing.capabilityId !== issued.capabilityId ||
        existing.expiresAt !== issued.expiresAt
      ) {
        throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
      }
      record = existing;
    }
    await writeBundle(paths, {
      ...bundle,
      sessions: { ...bundle.sessions, [key]: record },
    });
    return record;
  });
}

function defaultDaemonOptions(
  paths: FabricPaths,
  agentsHomeValue: string | undefined,
): DaemonStartOptions {
  const agentsHome = resolve(
    agentsHomeValue ?? process.env.AGENTS_HOME ?? join(homedir(), ".agents"),
  );
  return {
    ...paths,
    configuration: {
      globalConfigPath: join(agentsHome, "config", "agent-fabric.yaml"),
      compatibilityPath: join(agentsHome, "config", "adapter-compatibility.yaml"),
      compatibilitySchemaPath: join(
        agentsHome,
        "runtime",
        "agent-fabric",
        "schemas",
        "adapter-compatibility.schema.json",
      ),
      agentsHome,
    },
  };
}

async function operatorClient(
  socketPath: string,
  credentialValue: OperatorCapabilityCredential,
  surface: "standalone" | "herdr",
): Promise<NegotiatedOperatorClient> {
  const initialize: ProtocolInitializeRequest = {
    protocolVersion: 1,
    client: { name: `agent-fabric-console-${surface}`, version: "0.1.0" },
    authentication: {
      scheme: "capability",
      credential: credentialValue.token,
      clientNonce: `console_${randomUUID()}`,
    },
    expectedPrincipalKind: "operator",
    requiredFeatures: REQUIRED_FEATURES,
    optionalFeatures: OPTIONAL_FEATURES,
  };
  const transport = await NdjsonRpcTransport.connect(
    createConnection(socketPath),
    initialize,
  );
  return createOperatorClient(transport);
}

function selectedSession(
  items: readonly ProjectSessionDiscovery[],
): ProjectSessionDiscovery | undefined {
  return items.find((session) => !TERMINAL_SESSION_STATES.has(session.state));
}

function mutationContext(input: {
  credential: OperatorCapabilityCredential;
  commandId: string;
  expectedRevision: number;
  operatorId: OperatorId;
  clientId: OperatorClientId;
  inputEventId: string;
}): OperatorMutationContext {
  return {
    credential: input.credential,
    commandId: input.commandId as CommandId,
    expectedRevision: input.expectedRevision,
    actor: input.operatorId,
    provenance: {
      kind: "console-direct-input",
      clientId: input.clientId,
      inputEventId: input.inputEventId,
    },
    evidenceRefs: [],
  };
}

function attachmentOwner(input: {
  client: NegotiatedOperatorClient;
  credential: OperatorCapabilityCredential;
  operatorId: OperatorId;
  clientId: OperatorClientId;
  projectId: ProjectId;
  projectSessionId?: ProjectSessionId;
  initial: OperatorAttachment;
  capabilityExpiresAt: string;
  now: () => number;
  attachmentLeaseMs: number;
  heartbeatIntervalMs: number;
}): Pick<LocalOperatorConsoleSession, "detach" | "close"> {
  const operatorControl = input.client.operatorControl;
  if (operatorControl === undefined) {
    throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
  }
  let current = input.initial;
  let detached = false;
  let detachPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;
  let leaseQueue: Promise<void> = Promise.resolve();

  const heartbeat = async (): Promise<void> => {
    if (detached) return;
    const capabilityExpiry = Date.parse(input.capabilityExpiresAt);
    const extendUntilMs = Math.min(
      capabilityExpiry,
      input.now() + input.attachmentLeaseMs,
    );
    if (extendUntilMs <= input.now()) return;
    const generation = current.generation;
    const next = await operatorControl.heartbeat({
      command: mutationContext({
        credential: input.credential,
        commandId: `${input.clientId}:heartbeat:${String(generation)}`,
        expectedRevision: generation,
        operatorId: input.operatorId,
        clientId: input.clientId,
        inputEventId: `${input.clientId}:heartbeat:${String(generation)}`,
      }),
      attachmentGeneration: generation,
      extendUntil: isoTimestamp(extendUntilMs),
    });
    current = next;
  };
  const timer = setInterval(() => {
    leaseQueue = leaseQueue.then(heartbeat).catch(() => {
      clearInterval(timer);
    });
  }, input.heartbeatIntervalMs);
  timer.unref();

  const detach = async (): Promise<void> => {
    if (detachPromise !== undefined) return await detachPromise;
    detached = true;
    clearInterval(timer);
    detachPromise = (async () => {
      await leaseQueue;
      const generation = current.generation;
      await operatorControl.detach({
        command: mutationContext({
          credential: input.credential,
          commandId: `${input.clientId}:detach:${String(generation)}`,
          expectedRevision: generation,
          operatorId: input.operatorId,
          clientId: input.clientId,
          inputEventId: `${input.clientId}:detach:${String(generation)}`,
        }),
        attachmentGeneration: generation,
      });
    })();
    return await detachPromise;
  };

  return {
    detach: async (_input) => await detach(),
    close(): Promise<void> {
      closePromise ??= (async () => {
        try {
          await detach();
        } finally {
          await input.client.close();
        }
      })();
      return closePromise;
    },
  };
}

export async function openLocalOperatorConsoleSession(
  options: LocalOperatorConsoleSessionOptions,
): Promise<LocalOperatorConsoleSession> {
  const now = options.now ?? Date.now;
  const credentialLifetimeMs = positiveDuration(
    options.credentialLifetimeMs,
    8 * 60 * 60_000,
    "credentialLifetimeMs",
  );
  const attachmentLeaseMs = positiveDuration(
    options.attachmentLeaseMs,
    30_000,
    "attachmentLeaseMs",
  );
  const heartbeatIntervalMs = positiveDuration(
    options.heartbeatIntervalMs,
    10_000,
    "heartbeatIntervalMs",
  );
  if (heartbeatIntervalMs >= attachmentLeaseMs) {
    throw new TypeError("heartbeatIntervalMs must be shorter than attachmentLeaseMs");
  }
  const paths = options.paths ?? resolveFabricPaths();
  let identity: Awaited<ReturnType<typeof trustedWorkspaceIdentity>>;
  try {
    identity = await trustedWorkspaceIdentity({
      stateDirectory: paths.stateDirectory,
      canonicalRoot: options.projectRoot,
    });
  } catch {
    throw new LocalOperatorConsoleUnavailableError("configuration-missing");
  }

  let daemon: Awaited<ReturnType<typeof startFabricDaemon>>;
  try {
    daemon = await startFabricDaemon({
      ...(options.daemon === undefined
        ? defaultDaemonOptions(paths, options.agentsHome)
        : { ...paths, ...options.daemon }),
    });
  } catch {
    throw new LocalOperatorConsoleUnavailableError("start-failed");
  }

  let privateClient: FabricDaemonClient | undefined;
  let publicClient: NegotiatedOperatorClient | undefined;
  try {
    privateClient = await FabricDaemonClient.connect(
      daemon.address.path,
      daemon.bootstrapCapability,
    );
    const custodyPaths = storePaths(paths.stateDirectory, identity.canonicalRoot);
    const project = await projectCredential(
      privateClient,
      custodyPaths,
      identity,
      now(),
      credentialLifetimeMs,
    );
    publicClient = await operatorClient(
      daemon.address.path,
      project.credential as OperatorCapabilityCredential,
      options.surface,
    );
    const discovery = await publicClient.projection?.discover({
      credential: project.credential as OperatorCapabilityCredential,
      projectId: project.projectId as ProjectId,
      after: 0,
      limit: 100,
    });
    if (
      discovery === undefined ||
      discovery.project.freshness !== "live" ||
      discovery.project.value.projectId !== project.projectId ||
      discovery.project.value.canonicalRoot !== identity.canonicalRoot ||
      discovery.sessions.freshness !== "live"
    ) {
      throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
    }
    const selected = selectedSession(discovery.sessions.value.items);
    let activeCredential = project.credential as OperatorCapabilityCredential;
    let activeCredentialExpiresAt = project.expiresAt;
    if (selected !== undefined) {
      const issued = await sessionCredential(
        privateClient,
        custodyPaths,
        identity,
        project,
        selected,
        now(),
        credentialLifetimeMs,
      );
      await publicClient.close();
      publicClient = await operatorClient(
        daemon.address.path,
        issued.credential as OperatorCapabilityCredential,
        options.surface,
      );
      activeCredential = issued.credential as OperatorCapabilityCredential;
      activeCredentialExpiresAt = issued.expiresAt;
    }
    if (publicClient.operatorControl === undefined || publicClient.projection === undefined) {
      throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
    }
    const projectId = project.projectId as ProjectId;
    const projectSessionId = selected?.projectSessionId;
    const scope = {
      credential: activeCredential,
      projectId,
      ...(projectSessionId === undefined ? {} : { projectSessionId }),
    };
    const snapshot = await publicClient.projection.snapshot(scope);
    const expectedRevision = projectSessionId === undefined
      ? snapshot.project.revision
      : snapshot.session.freshness === "live" &&
          snapshot.session.value?.projectSessionId === projectSessionId
        ? snapshot.session.value.revision
        : undefined;
    if (expectedRevision === undefined) {
      throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
    }
    const clientId = (options.clientId ?? `console_${randomUUID()}`) as OperatorClientId;
    const operatorId = project.operatorId as OperatorId;
    const attachExpiry = Math.min(
      Date.parse(activeCredentialExpiresAt),
      now() + attachmentLeaseMs,
    );
    assertFuture(isoTimestamp(attachExpiry), now());
    const attachment = await publicClient.operatorControl.attach({
      command: mutationContext({
        credential: activeCredential,
        commandId: `${clientId}:attach`,
        expectedRevision,
        operatorId,
        clientId,
        inputEventId: `${clientId}:attach`,
      }),
      projectId,
      ...(projectSessionId === undefined ? {} : { projectSessionId }),
      requestedExpiresAt: isoTimestamp(attachExpiry),
    });
    if (
      attachment.clientId !== clientId ||
      attachment.projectId !== projectId ||
      attachment.projectSessionId !== (projectSessionId ?? null)
    ) {
      throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
    }
    await privateClient.close();
    privateClient = undefined;
    daemon.release();
    const owner = attachmentOwner({
      client: publicClient,
      credential: activeCredential,
      operatorId,
      clientId,
      projectId,
      ...(projectSessionId === undefined ? {} : { projectSessionId }),
      initial: attachment,
      capabilityExpiresAt: activeCredentialExpiresAt,
      now,
      attachmentLeaseMs,
      heartbeatIntervalMs,
    });
    return {
      client: publicClient,
      credential: activeCredential,
      projectId,
      operatorId,
      ...(projectSessionId === undefined ? {} : { projectSessionId }),
      clientId,
      daemonPid: daemon.pid,
      ...owner,
    };
  } catch (error: unknown) {
    daemon.release();
    await Promise.allSettled([
      privateClient?.close() ?? Promise.resolve(),
      publicClient?.close() ?? Promise.resolve(),
    ]);
    if (error instanceof LocalOperatorConsoleUnavailableError) throw error;
    throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
  }
}

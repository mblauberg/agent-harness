import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { createConnection } from "node:net";
import { join, resolve } from "node:path";

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

const PROJECT_ACTIONS = ["launch", "read"] as const;
const SESSION_ACTIONS = [
  "read",
  "decide",
  "launch",
  "steer",
  "pause",
  "resume",
  "cancel",
  "drain",
  "stop",
] as const satisfies readonly NonTakeoverOperatorAction[];
const NON_ATTACHABLE_SESSION_STATES = new Set(["closed", "cancelled", "launch_failed"]);
const REQUIRED_FEATURES = [
  "operator-control.v1",
  "operator-projection.v1",
] as const satisfies readonly ProtocolFeature[];
const OPTIONAL_FEATURES = [
  "project-sessions.v1",
  "operator-projection.v2",
  "scoped-gate-read.v1",
  "scoped-gates.v1",
  "intakes.v1",
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

function legacyCredentialDirectory(
  stateDirectory: string,
  canonicalRoot: string,
): string {
  const projectKey = createHash("sha256").update(canonicalRoot).digest("hex").slice(0, 32);
  return join(stateDirectory, "console-operators", projectKey);
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
  stateDirectory: string,
  identity: Awaited<ReturnType<typeof trustedWorkspaceIdentity>>,
  now: number,
  credentialLifetimeMs: number,
): ReturnType<FabricDaemonClient["openLocalOperatorConsoleCapability"]> {
  await rm(legacyCredentialDirectory(stateDirectory, identity.canonicalRoot), {
    recursive: true,
    force: true,
  });
  return await privateClient.openLocalOperatorConsoleCapability({
    canonicalRoot: identity.canonicalRoot,
    trustRecordDigest: identity.trustRecordDigest,
    projectAuthorityGeneration: 1,
    actions: PROJECT_ACTIONS,
    expiresAt: isoTimestamp(now + credentialLifetimeMs),
  });
}

async function sessionCredential(
  privateClient: FabricDaemonClient,
  identity: Awaited<ReturnType<typeof trustedWorkspaceIdentity>>,
  project: Awaited<ReturnType<FabricDaemonClient["openLocalOperatorConsoleCapability"]>>,
  selected: ProjectSessionDiscovery,
  now: number,
  credentialLifetimeMs: number,
): ReturnType<FabricDaemonClient["openLocalOperatorConsoleSessionCapability"]> {
  const expiresAt = isoTimestamp(Math.min(
    Date.parse(project.expiresAt),
    now + credentialLifetimeMs,
  ));
  assertFuture(expiresAt, now);
  return await privateClient.openLocalOperatorConsoleSessionCapability({
    projectId: project.projectId,
    canonicalRoot: identity.canonicalRoot,
    trustRecordDigest: identity.trustRecordDigest,
    projectCapability: project.credential,
    projectSessionId: selected.projectSessionId,
    sessionGeneration: selected.generation,
    actions: SESSION_ACTIONS,
    expiresAt,
    launchEnvelopeExpiresAt: expiresAt,
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
  return items.find((session) => !NON_ATTACHABLE_SESSION_STATES.has(session.state));
}

async function discoverSelectedSession(input: {
  client: NegotiatedOperatorClient;
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  canonicalRoot: string;
}): Promise<ProjectSessionDiscovery | undefined> {
  const projection = input.client.projection;
  if (projection === undefined) {
    throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
  }
  let after = 0;
  for (;;) {
    const discovery = await projection.discover({
      credential: input.credential,
      projectId: input.projectId,
      after,
      limit: 100,
    });
    if (
      discovery.project.freshness !== "live" ||
      discovery.project.value.projectId !== input.projectId ||
      discovery.project.value.canonicalRoot !== input.canonicalRoot ||
      discovery.sessions.freshness !== "live"
    ) {
      throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
    }
    const selected = selectedSession(discovery.sessions.value.items);
    if (selected !== undefined || !discovery.sessions.value.hasMore) return selected;
    const next = discovery.sessions.value.nextCursor;
    if (!Number.isSafeInteger(next) || next <= after) {
      throw new LocalOperatorConsoleUnavailableError("authority-unavailable");
    }
    after = next;
  }
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
    const project = await projectCredential(
      privateClient,
      paths.stateDirectory,
      identity,
      now(),
      credentialLifetimeMs,
    );
    publicClient = await operatorClient(
      daemon.address.path,
      project.credential as OperatorCapabilityCredential,
      options.surface,
    );
    const selected = await discoverSelectedSession({
      client: publicClient,
      credential: project.credential as OperatorCapabilityCredential,
      projectId: project.projectId as ProjectId,
      canonicalRoot: identity.canonicalRoot,
    });
    let activeCredential = project.credential as OperatorCapabilityCredential;
    let activeCredentialExpiresAt = project.expiresAt;
    if (selected !== undefined) {
      const issued = await sessionCredential(
        privateClient,
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

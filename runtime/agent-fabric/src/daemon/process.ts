import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { createServer, type Socket } from "node:net";

import {
  FABRIC_OPERATIONS,
  PROTOCOL_FEATURES,
  PROTOCOL_LIMITS,
} from "@local/agent-fabric-protocol";

import { openFabric } from "../index.js";
import {
  createRunInput,
  FABRIC_DAEMON_VERSION,
  daemonInitializeParams,
  daemonInitializeResult,
  dispatchClientMethod,
  FABRIC_PROTOCOL_VERSION,
  issueLocalOperatorSessionCapabilityInput,
  isDaemonRequest,
  isRecord,
  openLocalOperatorConsoleCapabilityInput,
  provisionLocalOperatorInput,
  rotateLocalOperatorPrincipalInput,
  type DaemonRequest,
} from "./protocol.js";
import { parseDaemonAdapters } from "./composition.js";
import {
  composeHerdrDaemonIntegration,
  herdrPresencePollInterval,
  parseHerdrDaemonProcessConfiguration,
} from "./herdr-composition.js";
import { BootstrapElection } from "./bootstrap-election.js";
import { GuardedIdleStopController, type QuiesceToken } from "./global-liveness.js";
import { IdleShutdownScheduler } from "./idle-shutdown-scheduler.js";
import { ResultDeadlineScheduler } from "./result-deadline-scheduler.js";
import { finalizeDaemonShutdown } from "./shutdown-finalizer.js";
import { acquireDaemonLocks, releaseDaemonLocks, writeDaemonLockReceipt } from "./client.js";
import {
  markPrivateDiscoveryTerminal,
  privateDiscoveryPaths,
  readPrivateDiscovery,
} from "./private-discovery.js";
import { routeDaemonConnection } from "./connection-router.js";
import { servePublicProtocolConnection } from "./public-protocol.js";
import { BoundedNdjsonReader, BoundedNdjsonWriter, FABRIC_PROTOCOL_LIMITS } from "../transport/bounded-ndjson.js";
import { trustedWorkspaceIdentity } from "../cli/workspace-trust.js";
import {
  createOptionalGitHubHostedChecksAdapter,
  type OptionalGitHubHostedChecksConfiguration,
} from "../operator/github-hosted-checks.js";

class DaemonProtocolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DaemonProtocolError";
    this.code = code;
  }
}

function secretEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function localAuthenticatedSubjectHash(key: string): `sha256:${string}` {
  if (typeof process.getuid !== "function") {
    throw new DaemonProtocolError(
      "LOCAL_SUBJECT_UNAVAILABLE",
      "local operator provisioning requires an authenticated Unix process owner",
    );
  }
  return `sha256:${createHmac("sha256", key)
    .update(`agent-fabric.local-operator.v1\0uid:${String(process.getuid())}`)
    .digest("hex")}`;
}

const databasePath = process.env.AGENT_FABRIC_DATABASE_PATH;
const socketPath = process.env.AGENT_FABRIC_SOCKET_PATH;
const stateDirectory = process.env.AGENT_FABRIC_STATE_DIRECTORY;
const runtimeDirectory = process.env.AGENT_FABRIC_RUNTIME_DIRECTORY;
const bootstrapCapability = process.env.AGENT_FABRIC_BOOTSTRAP_CAPABILITY;
const bootstrapMode = process.env.AGENT_FABRIC_BOOTSTRAP_MODE;
const bootstrapActionId = process.env.AGENT_FABRIC_BOOTSTRAP_ACTION_ID;
const bootstrapElectionGeneration = Number(process.env.AGENT_FABRIC_BOOTSTRAP_ELECTION_GENERATION);
const daemonLockPathsValue: unknown = JSON.parse(process.env.AGENT_FABRIC_DAEMON_LOCK_PATHS_JSON ?? "[]");
const daemonLockPaths = Array.isArray(daemonLockPathsValue) && daemonLockPathsValue.every((value) => typeof value === "string")
  ? daemonLockPathsValue
  : undefined;
const capabilityKey = process.env.AGENT_FABRIC_CAPABILITY_KEY;
const executionProfile = process.env.AGENT_FABRIC_EXECUTION_PROFILE;
const maximumConcurrentProviderTurnsValue = process.env.AGENT_FABRIC_MAXIMUM_CONCURRENT_PROVIDER_TURNS ?? "8";
const maximumConcurrentProviderTurns = Number(maximumConcurrentProviderTurnsValue);
const workspaceRootsValue: unknown = JSON.parse(process.env.AGENT_FABRIC_WORKSPACE_ROOTS_JSON ?? "[]");
const workspaceRoots = Array.isArray(workspaceRootsValue) && workspaceRootsValue.every((value) => typeof value === "string")
  ? workspaceRootsValue
  : undefined;
const githubHostedChecksValue: unknown = JSON.parse(
  process.env.AGENT_FABRIC_GITHUB_HOSTED_CHECKS_JSON ?? '{"enabled":false}',
);
const herdrProcessConfiguration = parseHerdrDaemonProcessConfiguration(
  process.env.AGENT_FABRIC_HERDR_JSON,
);
// Temporary compatibility fallback until every launcher supplies the persisted
// runtime epoch. New bootstrap callers pass the authoritative generation.
const daemonInstanceGenerationValue = process.env.AGENT_FABRIC_DAEMON_INSTANCE_GENERATION ?? "1";
const daemonInstanceGeneration = Number(daemonInstanceGenerationValue);

if (
  databasePath === undefined ||
  socketPath === undefined ||
  stateDirectory === undefined ||
  runtimeDirectory === undefined ||
  bootstrapCapability === undefined
  || (bootstrapMode !== "production-election" && bootstrapMode !== "test-forced-process-locks")
  || (bootstrapMode === "production-election" && (
    bootstrapActionId === undefined ||
    bootstrapActionId.trim().length === 0 ||
    !Number.isSafeInteger(bootstrapElectionGeneration) ||
    bootstrapElectionGeneration < 1
  ))
  || (bootstrapMode === "test-forced-process-locks" && (
    daemonLockPaths === undefined || daemonLockPaths.length !== 2
  ))
  || capabilityKey === undefined
  || executionProfile === undefined
  || !Number.isInteger(maximumConcurrentProviderTurns)
  || maximumConcurrentProviderTurns < 1
  || workspaceRoots === undefined
  || workspaceRoots.length === 0
  || !Number.isSafeInteger(daemonInstanceGeneration)
  || daemonInstanceGeneration < 1
) {
  throw new Error("agent fabric daemon environment is incomplete");
}

const localSubjectHash = localAuthenticatedSubjectHash(capabilityKey);
const trustedStateDirectory = stateDirectory;
const trustedExecutionProfile = executionProfile;

async function withTrustedLocalSubject<T extends {
  canonicalRoot: string;
  trustRecordDigest: string;
}>(input: T): Promise<T & { authenticatedSubjectHash: string }> {
  let trusted: Awaited<ReturnType<typeof trustedWorkspaceIdentity>>;
  try {
    trusted = await trustedWorkspaceIdentity({
      stateDirectory: trustedStateDirectory,
      canonicalRoot: input.canonicalRoot,
      executionProfile: trustedExecutionProfile,
    });
  } catch {
    throw new DaemonProtocolError(
      "WORKSPACE_TRUST_INVALID",
      "local operator workspace trust could not be revalidated",
    );
  }
  if (
    trusted.canonicalRoot !== input.canonicalRoot ||
    trusted.trustRecordDigest !== input.trustRecordDigest
  ) {
    throw new DaemonProtocolError(
      "TRUST_RECORD_CHANGED",
      "local operator workspace trust binding changed",
    );
  }
  return { ...input, authenticatedSubjectHash: localSubjectHash };
}

mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
chmodSync(stateDirectory, 0o700);
chmodSync(runtimeDirectory, 0o700);
let daemonLocks: Awaited<ReturnType<typeof acquireDaemonLocks>> = [];
if (bootstrapMode === "test-forced-process-locks") {
  try {
    daemonLocks = await acquireDaemonLocks(daemonLockPaths as string[]);
    for (const lock of daemonLocks) {
      await writeDaemonLockReceipt(lock.path, { pid: process.pid, token: lock.token, socketPath });
    }
  } catch (error: unknown) {
    const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : "DAEMON_LOCKED";
    const message = error instanceof Error ? error.message : String(error);
    await new Promise<void>((resolve) => process.stdout.write(`${JSON.stringify({ ready: false, error: { code, message } })}\n`, () => resolve()));
    process.exit(1);
    throw error;
  }
}
rmSync(socketPath, { force: true });

const daemonAdapters = parseDaemonAdapters(process.env.AGENT_FABRIC_ADAPTERS_JSON);
const gitHostedChecks = await createOptionalGitHubHostedChecksAdapter(
  githubHostedChecksValue as OptionalGitHubHostedChecksConfiguration,
);
const herdrIntegration = composeHerdrDaemonIntegration(herdrProcessConfiguration, stateDirectory);
const initializeResult = daemonInitializeResult(Object.keys(daemonAdapters));
type PendingDaemonStop = Readonly<{
  custodyId: string;
  resultCorrelationDigest: string;
  operatorId: string;
  projectId: string;
  projectSessionId: string;
  principalGeneration: number;
  commandId: string;
  operation: "daemon-stop";
  token: QuiesceToken;
}>;
const pendingDaemonStops = new Map<string, PendingDaemonStop>();
let scheduleIdleStop: () => void = () => undefined;
let closeBackgroundWorkers: () => void = () => undefined;
const fabric = await openFabric({
  databasePath,
  fabricSocketPath: socketPath,
  capabilityKey,
  executionProfile,
  maximumConcurrentProviderTurns,
  workspaceRoots,
  adapters: daemonAdapters,
  ...(gitHostedChecks === undefined ? {} : { gitHostedChecks }),
  herdr: herdrIntegration,
  daemonStopPort: {
    request: async (request) => {
      const existing = pendingDaemonStops.get(request.custodyId);
      if (
        existing !== undefined &&
        (existing.resultCorrelationDigest !== request.resultCorrelationDigest ||
          existing.operatorId !== request.operatorId ||
          existing.projectId !== request.projectId ||
          existing.projectSessionId !== request.projectSessionId ||
          existing.principalGeneration !== request.principalGeneration ||
          existing.commandId !== request.commandId ||
          existing.operation !== request.operation ||
          existing.token.daemonInstanceGeneration !== request.token.daemonInstanceGeneration ||
          existing.token.observedGlobalStateRevision !== request.token.observedGlobalStateRevision)
      ) return "busy";
      pendingDaemonStops.set(request.custodyId, request);
      return "scheduled";
    },
  },
});
fabric.recoverDaemonRuntimeEpoch({
  instanceGeneration: daemonInstanceGeneration,
  instanceId: `${bootstrapActionId ?? "forced-process"}:${String(process.pid)}`,
});
await fabric.recoverStartupState();
const sockets = new Set<Socket>();
let completeQueuedDaemonStop: (commandId: string) => void = () => undefined;
let totalInFlight = 0;
const serveLegacyConnection = (socket: Socket): void => {
  const writer = new BoundedNdjsonWriter(socket, {
    maximumFrameBytes: FABRIC_PROTOCOL_LIMITS.maximumFrameBytes,
    maximumPendingWrites: FABRIC_PROTOCOL_LIMITS.maximumInFlightPerConnection,
  });
  let connectionInFlight = 0;
  let initializedCapability: string | undefined;
  let initializationComplete = false;

  const respond = async (
    id: string,
    operation: () => Promise<unknown>,
    onSuccess?: () => void,
  ): Promise<void> => {
    try {
      const result = await operation();
      await writer.write({ id, result: result === undefined ? null : result });
      onSuccess?.();
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : "Error";
      const message = error instanceof Error ? error.message : String(error);
      const code =
        typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
          ? error.code
          : "DAEMON_REQUEST_FAILED";
      await writer.write({ id, error: { name, code, message } }).catch(() => socket.destroy());
    } finally {
      connectionInFlight -= 1;
      totalInFlight -= 1;
    }
  };

  const dispatch = async (request: DaemonRequest): Promise<unknown> => {
    if (request.method === "initialize") {
      if (initializedCapability !== undefined) {
        throw new DaemonProtocolError("DAEMON_ALREADY_INITIALIZED", "daemon connection is already initialized");
      }
      const initialize = daemonInitializeParams(request.params);
      if (initialize.protocolVersion !== FABRIC_PROTOCOL_VERSION) {
        throw new DaemonProtocolError(
          "DAEMON_PROTOCOL_UNSUPPORTED",
          `daemon protocol ${String(initialize.protocolVersion)} is unsupported`,
        );
      }
      initializedCapability = request.capability;
      return initializeResult;
    }
    if (!initializationComplete || initializedCapability === undefined) {
      throw new DaemonProtocolError("DAEMON_NOT_INITIALIZED", "initialize must succeed before daemon commands");
    }
    if (!secretEqual(request.capability, initializedCapability)) {
      throw new DaemonProtocolError(
        "DAEMON_CAPABILITY_MISMATCH",
        "daemon capability cannot change after initialization",
      );
    }
    if (secretEqual(request.capability, bootstrapCapability)) {
      switch (request.method) {
        case "createRun":
          return await fabric.createRun(createRunInput(request.params));
        case "provisionLocalOperator":
          return fabric.provisionLocalOperator(await withTrustedLocalSubject(
            provisionLocalOperatorInput(request.params),
          ));
        case "openLocalOperatorConsoleCapability":
          return fabric.openLocalOperatorConsoleCapability(await withTrustedLocalSubject(
            openLocalOperatorConsoleCapabilityInput(request.params),
          ));
        case "issueLocalOperatorSessionCapability":
          return fabric.issueLocalOperatorSessionCapability(await withTrustedLocalSubject(
            issueLocalOperatorSessionCapabilityInput(request.params),
          ));
        case "openLocalOperatorConsoleSessionCapability":
          return fabric.openLocalOperatorConsoleSessionCapability(await withTrustedLocalSubject(
            issueLocalOperatorSessionCapabilityInput(request.params),
          ));
        case "rotateLocalOperatorPrincipal":
          return fabric.rotateLocalOperatorPrincipal(await withTrustedLocalSubject(
            rotateLocalOperatorPrincipalInput(request.params),
          ));
        default:
          throw new DaemonProtocolError(
            "BOOTSTRAP_SCOPE_VIOLATION",
            "bootstrap capability is limited to private local bootstrap control methods",
          );
      }
    }
    return await dispatchClientMethod(fabric.connect(request.capability), request.method, request.params);
  };

  const reader = new BoundedNdjsonReader(socket, {
    maximumFrameBytes: FABRIC_PROTOCOL_LIMITS.maximumFrameBytes,
    idleTimeoutMs: FABRIC_PROTOCOL_LIMITS.idleTimeoutMs,
    onIdle: () => socket.destroy(),
    onError: (error) => {
      void writer.write({ id: "unknown", error: { name: error.name, code: error.code, message: error.message } })
        .finally(() => socket.destroy());
    },
    onFrame: (line) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (cause: unknown) {
        void writer.write({
          id: "unknown",
          error: {
            name: "DaemonProtocolError",
            code: "DAEMON_PROTOCOL_INVALID",
            message: cause instanceof Error ? cause.message : "malformed daemon JSON",
          },
        }).catch(() => socket.destroy());
        return;
      }
      const id = isRecord(parsed) && typeof parsed.id === "string" ? parsed.id : "unknown";
      if (!isDaemonRequest(parsed)) {
        void writer.write({
          id,
          error: { name: "DaemonProtocolError", code: "DAEMON_PROTOCOL_INVALID", message: "invalid daemon request" },
        }).catch(() => socket.destroy());
        return;
      }
      if (connectionInFlight >= FABRIC_PROTOCOL_LIMITS.maximumInFlightPerConnection) {
        void writer.write({
          id,
          error: {
            name: "DaemonProtocolError",
            code: "DAEMON_CONNECTION_OVERLOADED",
            message: `connection permits ${String(FABRIC_PROTOCOL_LIMITS.maximumInFlightPerConnection)} in-flight commands`,
          },
        }).catch(() => socket.destroy());
        return;
      }
      if (totalInFlight >= FABRIC_PROTOCOL_LIMITS.maximumTotalInFlight) {
        void writer.write({
          id,
          error: {
            name: "DaemonProtocolError",
            code: "DAEMON_OVERLOADED",
            message: `daemon permits ${String(FABRIC_PROTOCOL_LIMITS.maximumTotalInFlight)} in-flight commands`,
          },
        }).catch(() => socket.destroy());
        return;
      }
      connectionInFlight += 1;
      totalInFlight += 1;
      void respond(
        id,
        () => dispatch(parsed),
        parsed.method === "initialize" ? () => { initializationComplete = true; } : undefined,
      );
    },
  });
  socket.once("close", () => reader.close());
};

const servePublicConnection = (socket: Socket): void => {
  servePublicProtocolConnection(socket, {
    daemonVersion: FABRIC_DAEMON_VERSION,
    daemonInstanceGeneration,
    offeredFeatures: PROTOCOL_FEATURES,
    limits: PROTOCOL_LIMITS,
    verifyCredential: (credential) => {
      if (secretEqual(credential, bootstrapCapability)) {
        throw new DaemonProtocolError(
          "AUTHENTICATION_FAILED",
          "bootstrap discovery capability is not a public protocol principal",
        );
      }
      return fabric.verifyProtocolCredential(credential);
    },
    dispatch: async (context, operation, input) => {
      if (totalInFlight >= FABRIC_PROTOCOL_LIMITS.maximumTotalInFlight) {
        throw Object.assign(new Error(
          `daemon permits ${String(FABRIC_PROTOCOL_LIMITS.maximumTotalInFlight)} in-flight commands`,
        ), { code: "OVERLOADED" });
      }
      totalInFlight += 1;
      try {
        return await fabric.dispatchPublicProtocol(context, operation, input);
      } finally {
        totalInFlight -= 1;
      }
    },
    afterResponse: ({ context, operation, input, result }) => {
      if (
        operation === FABRIC_OPERATIONS.operatorDetach &&
        context.principal.kind === "operator" &&
        isRecord(result) &&
        result.detached === true
      ) {
        scheduleIdleStop();
        return;
      }
      if (operation !== FABRIC_OPERATIONS.operatorActionCommit || context.principal.kind !== "operator") return;
      const value: unknown = input;
      const principal = context.principal;
      const command = isRecord(value) ? value.command : undefined;
      if (
        !isRecord(command) || typeof command.commandId !== "string" ||
        !isRecord(result) || result.commandId !== command.commandId
      ) return;
      const matches = [...pendingDaemonStops.values()].filter((pending) =>
        pending.operatorId === principal.operatorId &&
        pending.projectId === principal.projectId &&
        pending.principalGeneration === principal.principalGeneration &&
        pending.commandId === command.commandId &&
        pending.operation === "daemon-stop");
      if (matches.length !== 1) return;
      completeQueuedDaemonStop(matches[0]!.custodyId);
    },
  });
};

const server = createServer((socket) => {
  if (sockets.size >= FABRIC_PROTOCOL_LIMITS.maximumConnections) {
    const writer = new BoundedNdjsonWriter(socket, {
      maximumFrameBytes: FABRIC_PROTOCOL_LIMITS.maximumFrameBytes,
      maximumPendingWrites: FABRIC_PROTOCOL_LIMITS.maximumInFlightPerConnection,
    });
    void writer.write({
      id: "connection",
      error: {
        name: "DaemonProtocolError",
        code: "DAEMON_CONNECTION_LIMIT",
        message: `daemon accepts at most ${String(FABRIC_PROTOCOL_LIMITS.maximumConnections)} connections`,
      },
    }).catch(() => undefined).finally(() => socket.end());
    return;
  }
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
  routeDaemonConnection(socket, {
    maximumFirstFrameBytes: Math.min(
      FABRIC_PROTOCOL_LIMITS.maximumFrameBytes,
      PROTOCOL_LIMITS.maximumFrameBytes,
    ),
    idleTimeoutMs: Math.min(
      FABRIC_PROTOCOL_LIMITS.idleTimeoutMs,
      PROTOCOL_LIMITS.idleTimeoutMs,
    ),
    onRoute: (protocol, routedSocket) => {
      if (protocol === "public-v1") servePublicConnection(routedSocket);
      else serveLegacyConnection(routedSocket);
    },
  });
});

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(socketPath, () => {
    server.off("error", reject);
    chmodSync(socketPath, 0o600);
    resolve();
  });
});
fabric.markDaemonRuntimeRunning(daemonInstanceGeneration);

process.stdout.write(`${JSON.stringify({ ready: true })}\n`);

let shuttingDown = false;
const markProductionTerminal = async (
  signal: NodeJS.Signals | null,
  state: "stopped" | "crashed" = "stopped",
  exitCode: number | null = null,
): Promise<void> => {
  if (bootstrapMode !== "production-election") return;
  const paths = privateDiscoveryPaths(runtimeDirectory);
  const expected = {
    actionId: bootstrapActionId as string,
    electionGeneration: bootstrapElectionGeneration,
    daemonInstanceGeneration,
    socketPath,
    pid: process.pid,
    bootstrapCapabilityHash: createHash("sha256").update(bootstrapCapability).digest("hex"),
  };
  const election = new BootstrapElection({ runtimeDirectory });
  const result = await election.withExclusiveLock(
    `terminal-${String(bootstrapActionId)}`,
    async () => await markPrivateDiscoveryTerminal({
      paths,
      expected,
      state,
      exitCode,
      signal,
    }),
  );
  if (result.role === "observer") {
    const discovery = await readPrivateDiscovery(paths, socketPath);
    if (
      discovery.status !== "terminal" ||
      discovery.owner.actionId !== expected.actionId ||
      discovery.owner.electionGeneration !== expected.electionGeneration ||
      discovery.owner.daemonInstanceGeneration !== expected.daemonInstanceGeneration
    ) {
      throw new Error("daemon could not confirm its terminal discovery generation");
    }
  }
};

const stopElection = new BootstrapElection({ runtimeDirectory });
const closeServingSocket = async (): Promise<void> => await new Promise<void>((resolve) => {
  server.close(() => resolve());
  for (const active of sockets) active.end();
});

const finishProcess = async (input: {
  signal: NodeJS.Signals | null;
  state: "stopped" | "crashed";
  exitCode: number;
}): Promise<never> => {
  closeBackgroundWorkers();
  return await finalizeDaemonShutdown({
    requestedState: input.state,
    requestedExitCode: input.exitCode,
    closeFabric: async () => await fabric.close(),
    removeSocket: async () => { rmSync(socketPath, { force: true }); },
    releaseLocks: async () => await releaseDaemonLocks(daemonLocks),
    markTerminal: async ({ state, exitCode }) => {
      await markProductionTerminal(input.signal, state, exitCode);
    },
    reportFailure: (failure) => {
      process.stderr.write(`${failure.message}\n`);
    },
    exit: (exitCode) => process.exit(exitCode),
  });
};

const idleScheduler = new IdleShutdownScheduler({
  graceMs: 250,
  sweepMs: 30_000,
  attempt: async ({ actionId }) => await fabric.attemptIdleStop({
    actionId: `${actionId}:${String(daemonInstanceGeneration)}`,
    daemonInstanceGeneration,
    election: stopElection,
    closeSocket: closeServingSocket,
  }),
  onStopped: async () => {
    shuttingDown = true;
    await finishProcess({ signal: null, state: "stopped", exitCode: 0 });
  },
});
idleScheduler.start();
const resultDeadlineScheduler = new ResultDeadlineScheduler({
  intervalMs: 500,
  daemonInstanceGeneration,
  pass: (input) => { fabric.runResultDeadlinePass(input); },
});
resultDeadlineScheduler.start();
const notificationTimer = setInterval(() => {
  void fabric.runNativeNotificationPass().catch(() => undefined);
}, 1_000);
notificationTimer.unref();
void fabric.runNativeNotificationPass().catch(() => undefined);
const herdrPollInterval = herdrPresencePollInterval(herdrProcessConfiguration);
const herdrTimer = herdrPollInterval === null ? null : setInterval(() => {
  void fabric.runHerdrPresencePass().catch(() => undefined);
}, herdrPollInterval);
herdrTimer?.unref();
scheduleIdleStop = () => idleScheduler.schedule("operator-detach");
closeBackgroundWorkers = () => {
  idleScheduler.close();
  resultDeadlineScheduler.close();
  clearInterval(notificationTimer);
  if (herdrTimer !== null) clearInterval(herdrTimer);
};

completeQueuedDaemonStop = (custodyId: string): void => {
  const pending = pendingDaemonStops.get(custodyId);
  if (pending === undefined || shuttingDown) return;
  pendingDaemonStops.delete(custodyId);
  setImmediate(() => {
    if (shuttingDown) return;
    let socketClosed = false;
    void fabric.attemptDrainedStop({
      actionId: `operator-daemon-stop:${custodyId}`,
      token: pending.token,
      election: stopElection,
      closeSocket: async () => {
        await closeServingSocket();
        socketClosed = true;
      },
    }).then(async (result) => {
      if (result.state !== "stopped") {
        fabric.recordDaemonStopCustodyResult({
          ...pending,
          daemonInstanceGeneration: pending.token.daemonInstanceGeneration,
          state: "rejected",
          result,
        });
        return;
      }
      fabric.recordDaemonStopCustodyResult({
        ...pending,
        daemonInstanceGeneration: pending.token.daemonInstanceGeneration,
        state: "stopped",
        result,
      });
      shuttingDown = true;
      await finishProcess({ signal: null, state: "stopped", exitCode: 0 });
    }).catch(async (error: unknown) => {
      let failure = error;
      try {
        fabric.recordDaemonStopCustodyResult({
          ...pending,
          daemonInstanceGeneration: pending.token.daemonInstanceGeneration,
          state: "failed",
          result: { message: error instanceof Error ? error.message : String(error) },
        });
      } catch (custodyError: unknown) {
        failure = new AggregateError([error, custodyError], "daemon stop and custody persistence both failed");
      }
      process.stderr.write(`operator daemon stop failed: ${failure instanceof Error ? failure.message : String(failure)}\n`);
      if (!socketClosed) return;
      shuttingDown = true;
      await finishProcess({ signal: null, state: "crashed", exitCode: 1 });
    });
  });
};

const signalStop = new GuardedIdleStopController(async (signal) => {
  const result = await fabric.attemptIdleStop({
    actionId: `signal-idle-stop:${signal}:${String(daemonInstanceGeneration)}`,
    daemonInstanceGeneration,
    election: stopElection,
    closeSocket: closeServingSocket,
  });
  if (result.state === "stopped") {
    shuttingDown = true;
    await finishProcess({ signal, state: "stopped", exitCode: 0 });
  }
  return result;
});
const shutdown = (signal: "SIGINT" | "SIGTERM"): void => {
  if (shuttingDown) return;
  void signalStop.request(signal).then((result) => {
    if (result.state === "busy") {
      process.stderr.write(`daemon remains active after ${signal}: ${result.reason}\n`);
    }
  }).catch((error: unknown) => {
    process.stderr.write(`guarded daemon stop failed: ${error instanceof Error ? error.message : String(error)}\n`);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

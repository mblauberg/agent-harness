import type {
  BootstrapElection,
  BootstrapGeneration,
  BootstrapPhase,
  BootstrapReadyReceipt,
  BootstrapReadyEvidence,
} from "./bootstrap-election.js";

export type DaemonHandshakeResult<Client> =
  | {
      status: "compatible";
      client: Client;
      protocolVersion: number;
      daemonInstanceGeneration: number;
      features: readonly string[];
    }
  | { status: "unavailable"; reason: "absent" | "stale" | "unreachable" | "timeout"; message: string }
  | { status: "incompatible"; responsive: true; message: string };

export class BootstrapClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BootstrapClientError";
    this.code = code;
  }
}

export class BootstrapSpawnPhaseError extends Error {
  readonly phase: BootstrapPhase;

  constructor(phase: BootstrapPhase, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BootstrapSpawnPhaseError";
    this.phase = phase;
  }
}

export type BootstrapSpawnReady = {
  daemonInstanceGeneration: number;
  socketPath: string;
  protocolVersion: number;
  features: readonly string[];
  evidence: BootstrapReadyEvidence;
};

export type BootstrapSpawnHandle = {
  ready: Promise<BootstrapSpawnReady>;
};

export type AttachOrStartOptions<Client> = {
  actionId: string;
  socketPath: string;
  requiredProtocolVersion: number;
  requiredFeatures: readonly string[];
  election: BootstrapElection;
  handshake(): Promise<DaemonHandshakeResult<Client>>;
  spawn(input: { actionId: string; electionGeneration: number; socketPath: string }): Promise<BootstrapSpawnHandle>;
};

export type AttachedDaemon<Client> = {
  client: Client;
  daemonInstanceGeneration: number;
  electionGeneration: number | null;
  started: boolean;
};

function compatibleDaemon<Client>(
  result: Extract<DaemonHandshakeResult<Client>, { status: "compatible" }>,
  options: Pick<AttachOrStartOptions<Client>, "requiredProtocolVersion" | "requiredFeatures">,
  electionGeneration: number | null,
  started: boolean,
): AttachedDaemon<Client> {
  if (!Number.isSafeInteger(result.daemonInstanceGeneration) || result.daemonInstanceGeneration < 1) {
    throw new BootstrapClientError("BOOTSTRAP_HANDSHAKE_INVALID", "daemon handshake generation is invalid");
  }
  if (result.protocolVersion !== options.requiredProtocolVersion) {
    throw new BootstrapClientError("BOOTSTRAP_INCOMPATIBLE_INCUMBENT", "daemon protocol version is incompatible");
  }
  const available = new Set(result.features);
  const missing = options.requiredFeatures.filter((feature) => !available.has(feature));
  if (missing.length > 0) {
    throw new BootstrapClientError(
      "BOOTSTRAP_INCOMPATIBLE_INCUMBENT",
      `daemon is missing required features: ${missing.join(", ")}`,
    );
  }
  return {
    client: result.client,
    daemonInstanceGeneration: result.daemonInstanceGeneration,
    electionGeneration,
    started,
  };
}

function validateReadyReceipt(
  receipt: BootstrapReadyReceipt,
  options: Pick<AttachOrStartOptions<unknown>, "actionId" | "socketPath" | "requiredProtocolVersion" | "requiredFeatures">,
  requireRequestedAction: boolean,
): void {
  if (requireRequestedAction && receipt.actionId !== options.actionId) {
    throw new BootstrapClientError("BOOTSTRAP_ACTION_MISMATCH", "ready receipt action does not match the bootstrap request");
  }
  if (receipt.socketPath !== options.socketPath) {
    throw new BootstrapClientError("BOOTSTRAP_SOCKET_MISMATCH", "ready receipt socket does not match the trusted socket");
  }
  if (receipt.protocolVersion !== options.requiredProtocolVersion) {
    throw new BootstrapClientError("BOOTSTRAP_PROTOCOL_MISMATCH", "ready receipt protocol version is incompatible");
  }
  const available = new Set(receipt.features);
  const missing = options.requiredFeatures.filter((feature) => !available.has(feature));
  if (missing.length > 0) {
    throw new BootstrapClientError("BOOTSTRAP_FEATURE_MISMATCH", `ready receipt is missing required features: ${missing.join(", ")}`);
  }
}

function validateSpawnReady<Client>(ready: BootstrapSpawnReady, options: AttachOrStartOptions<Client>): void {
  if (!Number.isSafeInteger(ready.daemonInstanceGeneration) || ready.daemonInstanceGeneration < 1) {
    throw new BootstrapClientError("BOOTSTRAP_READY_INVALID", "spawn ready generation is invalid");
  }
  if (ready.socketPath !== options.socketPath) {
    throw new BootstrapClientError("BOOTSTRAP_SOCKET_MISMATCH", "spawn ready socket does not match the trusted socket");
  }
  if (ready.protocolVersion !== options.requiredProtocolVersion) {
    throw new BootstrapClientError("BOOTSTRAP_PROTOCOL_MISMATCH", "spawn ready protocol version is incompatible");
  }
  const available = new Set(ready.features);
  const missing = options.requiredFeatures.filter((feature) => !available.has(feature));
  if (missing.length > 0) {
    throw new BootstrapClientError("BOOTSTRAP_FEATURE_MISMATCH", `spawn ready is missing required features: ${missing.join(", ")}`);
  }
}

function validateStartedHandshake<Client>(
  result: DaemonHandshakeResult<Client>,
  receipt: BootstrapReadyReceipt,
  options: AttachOrStartOptions<Client>,
  started: boolean,
): AttachedDaemon<Client> {
  if (result.status !== "compatible") {
    throw new BootstrapClientError(
      result.status === "incompatible" ? "BOOTSTRAP_INCOMPATIBLE_INCUMBENT" : "BOOTSTRAP_HANDSHAKE_FAILED",
      result.message,
    );
  }
  const attached = compatibleDaemon(result, options, receipt.electionGeneration, started);
  if (attached.daemonInstanceGeneration !== receipt.daemonInstanceGeneration) {
    throw new BootstrapClientError(
      "BOOTSTRAP_DAEMON_GENERATION_MISMATCH",
      "authenticated daemon generation does not match the ready receipt",
    );
  }
  return attached;
}

async function recordKnownFailure(
  generation: BootstrapGeneration,
  code: string,
  error: unknown,
  status: "failed" | "ambiguous",
  phase: BootstrapPhase,
): Promise<never> {
  const message = error instanceof Error ? error.message : String(error);
  await generation.recordTerminal({ status, code, message, phase });
  throw new BootstrapClientError(code, message, { cause: error });
}

export async function attachOrStartDaemon<Client>(options: AttachOrStartOptions<Client>): Promise<AttachedDaemon<Client>> {
  const initial = await options.handshake();
  if (initial.status === "compatible") return compatibleDaemon(initial, options, null, false);
  const elected = await options.election.withExclusiveLock(options.actionId, async (held) => {
    const recheck = await options.handshake();
    if (recheck.status === "compatible") {
      return { kind: "attached" as const, attached: compatibleDaemon(recheck, options, null, false) };
    }
    if (recheck.status === "incompatible") {
      throw new BootstrapClientError("BOOTSTRAP_INCOMPATIBLE_INCUMBENT", recheck.message);
    }

    const priorOutcome = await held.readCurrentOutcome();
    if (priorOutcome?.kind === "ready") {
      throw new BootstrapClientError(
        "BOOTSTRAP_READY_UNREACHABLE",
        "a successful bootstrap generation exists but its daemon is not reachable",
      );
    }
    if (priorOutcome?.kind === "terminal" && priorOutcome.receipt.status === "ambiguous") {
      throw new BootstrapClientError(
        "BOOTSTRAP_RECONCILIATION_REQUIRED",
        "an ambiguous bootstrap generation must be reconciled before another spawn",
      );
    }

    const generation = await held.beginGeneration();
    await generation.appendAttempt("socket-recheck", "progress", recheck.message);
    await generation.appendAttempt("spawn", "progress");
    let spawned: BootstrapSpawnHandle;
    try {
      spawned = await options.spawn({
        actionId: options.actionId,
        electionGeneration: generation.electionGeneration,
        socketPath: options.socketPath,
      });
    } catch (error: unknown) {
      const phase = error instanceof BootstrapSpawnPhaseError ? error.phase : "spawn";
      return await recordKnownFailure(generation, "BOOTSTRAP_SPAWN_FAILED", error, "failed", phase);
    }
    let readyInput: BootstrapSpawnReady;
    try {
      readyInput = await spawned.ready;
    } catch (error: unknown) {
      const phase = error instanceof BootstrapSpawnPhaseError ? error.phase : "spawn";
      return await recordKnownFailure(generation, "BOOTSTRAP_READY_AMBIGUOUS", error, "ambiguous", phase);
    }
    try {
      validateSpawnReady(readyInput, options);
    } catch (error: unknown) {
      const code = error instanceof BootstrapClientError ? error.code : "BOOTSTRAP_READY_INVALID";
      return await recordKnownFailure(generation, code, error, "failed", "ready-receipt");
    }
    if (readyInput.evidence.databaseOwned) await generation.appendAttempt("database-owned", "progress");
    if (readyInput.evidence.migrationsComplete) await generation.appendAttempt("migrations-complete", "progress");
    if (readyInput.evidence.recoveryComplete) await generation.appendAttempt("recovery-complete", "progress");
    if (readyInput.evidence.socketBound) await generation.appendAttempt("socket-bound", "progress");
    const receipt = await generation.publishReady(readyInput);
    validateReadyReceipt(receipt, options, true);
    let attached: AttachedDaemon<Client>;
    try {
      attached = validateStartedHandshake(await options.handshake(), receipt, options, true);
    } catch (error: unknown) {
      const code = error instanceof BootstrapClientError ? error.code : "BOOTSTRAP_HANDSHAKE_FAILED";
      return await recordKnownFailure(generation, code, error, "ambiguous", "handshake");
    }
    await generation.confirmReady();
    return {
      kind: "started" as const,
      attached,
    };
  });

  if (elected.role === "owner") return elected.value.attached;
  if (elected.outcome.kind === "terminal") {
    throw new BootstrapClientError(elected.outcome.receipt.code, elected.outcome.receipt.message);
  }
  validateReadyReceipt(elected.outcome.receipt, options, false);
  return validateStartedHandshake(await options.handshake(), elected.outcome.receipt, options, false);
}

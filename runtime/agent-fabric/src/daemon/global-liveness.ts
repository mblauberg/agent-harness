import type Database from "better-sqlite3";
import type { BootstrapElectionResult, HeldBootstrapElection } from "./bootstrap-election.js";

const SESSION_STATES = [
  "draft", "awaiting_launch", "launching", "active", "quiescing", "awaiting_acceptance", "closed",
  "launch_failed", "launch_ambiguous", "reconciling", "visibility_degraded", "recovery_required",
  "quarantined", "cancelled",
] as const;

const CONTRIBUTING_STATES = [
  "awaiting_launch", "launching", "active", "quiescing", "awaiting_acceptance", "launch_ambiguous",
  "reconciling", "visibility_degraded", "recovery_required", "quarantined",
] as const;

const PROVIDER_STATES = ["prepared", "dispatched", "accepted", "terminal", "ambiguous", "quarantined"] as const;
const CONTRIBUTING_PROVIDER_STATES = ["prepared", "dispatched", "accepted", "ambiguous", "quarantined"] as const;
const RESULT_STATES = ["pending", "claimed", "provider-accepted", "consumed", "overdue", "abandoned"] as const;
const CONTRIBUTING_RESULT_STATES = ["pending", "claimed", "provider-accepted", "overdue"] as const;

export type GlobalLivenessSnapshot = {
  idle: boolean;
  failClosed: boolean;
  failure: "unknown-state" | "query-failed" | null;
  globalStateRevision: number | null;
  contributors: {
    projectSessions: number;
    coordinationRuns: number;
    leases: number;
    providerActions: number;
    operatorAttachments: number;
    requiredResults: number;
    total: number;
  };
};

type CountRow = { count: number };
type RevisionRow = { revision: number };

function placeholders(values: readonly string[]): string {
  return values.map(() => "?").join(", ");
}

function count(database: Database.Database, sql: string, parameters: readonly unknown[] = []): number {
  const row = database.prepare(sql).get(...parameters) as CountRow | undefined;
  if (row === undefined || !Number.isSafeInteger(row.count) || row.count < 0) throw new Error("invalid liveness count");
  return row.count;
}

function failClosed(failure: GlobalLivenessSnapshot["failure"]): GlobalLivenessSnapshot {
  return {
    idle: false,
    failClosed: true,
    failure,
    globalStateRevision: null,
    contributors: {
      projectSessions: 0,
      coordinationRuns: 0,
      leases: 0,
      providerActions: 0,
      operatorAttachments: 0,
      requiredResults: 0,
      total: 0,
    },
  };
}

function readWithinTransaction(
  database: Database.Database,
  options: { now: number; daemonInstanceGeneration: number },
): GlobalLivenessSnapshot {
  const revision = database.prepare("SELECT revision FROM daemon_global_state WHERE singleton = 1").get() as RevisionRow | undefined;
  if (revision === undefined || !Number.isSafeInteger(revision.revision) || revision.revision < 1) return failClosed("query-failed");

  const unknownStates =
    count(database, `SELECT COUNT(*) AS count FROM project_sessions WHERE state NOT IN (${placeholders(SESSION_STATES)})`, SESSION_STATES) +
    count(database, `SELECT COUNT(*) AS count FROM runs WHERE lifecycle_state NOT IN (${placeholders(SESSION_STATES)})`, SESSION_STATES) +
    count(database, "SELECT COUNT(*) AS count FROM leases WHERE status NOT IN ('active','quarantined','released')") +
    count(database, `SELECT COUNT(*) AS count FROM provider_actions WHERE status NOT IN (${placeholders(PROVIDER_STATES)})`, PROVIDER_STATES) +
    count(database, "SELECT COUNT(*) AS count FROM operator_client_attachments WHERE state NOT IN ('active','detached','expired')") +
    count(database, `SELECT COUNT(*) AS count FROM result_deliveries WHERE state NOT IN (${placeholders(RESULT_STATES)})`, RESULT_STATES) +
    count(database, "SELECT COUNT(*) AS count FROM projects WHERE authority_generation < 1") +
    count(database, "SELECT COUNT(*) AS count FROM project_sessions WHERE generation < 1") +
    count(database, "SELECT COUNT(*) AS count FROM leases WHERE generation < 1") +
    count(database, `
      SELECT COUNT(*) AS count
      FROM operator_client_attachments
      WHERE project_authority_generation < 1
         OR daemon_instance_generation < 1
         OR lease_generation < 1
         OR session_generation < 1
         OR expires_at < 0
    `) +
    count(database, "SELECT COUNT(*) AS count FROM result_deliveries WHERE required NOT IN (0,1)") +
    count(database, `
      SELECT COUNT(*) AS count
      FROM operator_client_attachments AS attachment
      WHERE (attachment.project_session_id IS NULL AND attachment.session_generation IS NOT NULL)
         OR (attachment.project_session_id IS NOT NULL AND attachment.session_generation IS NULL)
    `) +
    count(database, `
      SELECT COUNT(*) AS count
      FROM operator_client_attachments AS attachment
      LEFT JOIN project_sessions AS session ON session.project_session_id = attachment.project_session_id
      WHERE attachment.project_session_id IS NOT NULL
        AND (session.project_session_id IS NULL OR session.project_id <> attachment.project_id)
    `);
  if (unknownStates > 0) return failClosed("unknown-state");

  const projectSessions = count(
    database,
    `SELECT COUNT(*) AS count FROM project_sessions WHERE state IN (${placeholders(CONTRIBUTING_STATES)})`,
    CONTRIBUTING_STATES,
  );
  const coordinationRuns = count(
    database,
    `SELECT COUNT(*) AS count FROM runs WHERE lifecycle_state IN (${placeholders(CONTRIBUTING_STATES)})`,
    CONTRIBUTING_STATES,
  );
  const leases = count(database, `
    SELECT COUNT(*) AS count
    FROM leases AS lease
    JOIN runs AS run ON run.run_id = lease.run_id
    WHERE lease.status IN ('active','quarantined')
  `);
  const providerActions = count(
    database,
    `SELECT COUNT(*) AS count FROM provider_actions WHERE status IN (${placeholders(CONTRIBUTING_PROVIDER_STATES)})`,
    CONTRIBUTING_PROVIDER_STATES,
  );
  const operatorAttachments = count(database, `
    SELECT COUNT(*) AS count
    FROM operator_client_attachments AS attachment
    JOIN projects AS project ON project.project_id = attachment.project_id
    LEFT JOIN project_sessions AS session ON session.project_session_id = attachment.project_session_id
    WHERE attachment.state = 'active'
      AND attachment.expires_at > ?
      AND attachment.daemon_instance_generation = ?
      AND attachment.project_authority_generation = project.authority_generation
      AND (
        (attachment.project_session_id IS NULL AND attachment.session_generation IS NULL)
        OR (
          attachment.project_session_id IS NOT NULL
          AND session.project_id = attachment.project_id
          AND attachment.session_generation = session.generation
        )
      )
  `, [options.now, options.daemonInstanceGeneration]);
  const requiredResults = count(
    database,
    `SELECT COUNT(*) AS count FROM result_deliveries WHERE required = 1 AND state IN (${placeholders(CONTRIBUTING_RESULT_STATES)})`,
    CONTRIBUTING_RESULT_STATES,
  );
  const total = projectSessions + coordinationRuns + leases + providerActions + operatorAttachments + requiredResults;
  return {
    idle: total === 0,
    failClosed: false,
    failure: null,
    globalStateRevision: revision.revision,
    contributors: { projectSessions, coordinationRuns, leases, providerActions, operatorAttachments, requiredResults, total },
  };
}

export function readGlobalLiveness(
  database: Database.Database,
  options: { now: number; daemonInstanceGeneration: number },
): GlobalLivenessSnapshot {
  if (!Number.isSafeInteger(options.now) || options.now < 0 || !Number.isSafeInteger(options.daemonInstanceGeneration) || options.daemonInstanceGeneration < 1) {
    return failClosed("query-failed");
  }
  try {
    return database.transaction(() => readWithinTransaction(database, options))();
  } catch {
    return failClosed("query-failed");
  }
}

export type QuiesceToken = {
  daemonInstanceGeneration: number;
  observedGlobalStateRevision: number;
};

export type IdleStopResult =
  | { state: "stopped"; daemonInstanceGeneration: number; globalStateRevision: number }
  | { state: "busy"; reason: string; snapshot?: GlobalLivenessSnapshot };

export type IdleElectionPort = {
  withExclusiveLock<T>(
    actionId: string,
    callback: (held: HeldBootstrapElection) => Promise<T>,
  ): Promise<BootstrapElectionResult<T>>;
};

export function beginIdleQuiesce(
  database: Database.Database,
  options: { now: number; daemonInstanceGeneration: number },
): { state: "quiescing"; token: QuiesceToken } | { state: "busy"; reason: string; snapshot?: GlobalLivenessSnapshot } {
  try {
    return database.transaction(() => {
      const snapshot = readWithinTransaction(database, options);
      if (snapshot.failClosed) return { state: "busy" as const, reason: "liveness-unavailable", snapshot };
      if (!snapshot.idle) return { state: "busy" as const, reason: "contributors-active", snapshot };
      if (snapshot.globalStateRevision === null) return { state: "busy" as const, reason: "liveness-unavailable", snapshot };
      const updated = database.prepare(`
        UPDATE daemon_runtime_epochs
        SET state = 'quiescing', observed_global_revision = ?, heartbeat_at = ?
        WHERE instance_generation = ? AND state = 'running'
      `).run(snapshot.globalStateRevision, options.now, options.daemonInstanceGeneration);
      if (updated.changes !== 1) return { state: "busy" as const, reason: "epoch-not-running", snapshot };
      return {
        state: "quiescing" as const,
        token: {
          daemonInstanceGeneration: options.daemonInstanceGeneration,
          observedGlobalStateRevision: snapshot.globalStateRevision,
        },
      };
    })();
  } catch {
    return { state: "busy", reason: "liveness-unavailable", snapshot: failClosed("query-failed") };
  }
}

export function recheckIdle(
  database: Database.Database,
  options: { now: number; token: QuiesceToken },
): { state: "stop-permitted"; snapshot: GlobalLivenessSnapshot } | { state: "busy"; reason: string; snapshot?: GlobalLivenessSnapshot } {
  try {
    return database.transaction(() => {
      const epoch = database.prepare(`
        SELECT state, observed_global_revision AS observedGlobalRevision
        FROM daemon_runtime_epochs
        WHERE instance_generation = ?
      `).get(options.token.daemonInstanceGeneration) as { state: string; observedGlobalRevision: number | null } | undefined;
      if (epoch?.state !== "quiescing" || epoch.observedGlobalRevision !== options.token.observedGlobalStateRevision) {
        return { state: "busy" as const, reason: "epoch-not-quiescing" };
      }
      const snapshot = readWithinTransaction(database, {
        now: options.now,
        daemonInstanceGeneration: options.token.daemonInstanceGeneration,
      });
      const changed = snapshot.globalStateRevision !== options.token.observedGlobalStateRevision;
      if (snapshot.failClosed || !snapshot.idle || changed) {
        database.prepare(`
          UPDATE daemon_runtime_epochs
          SET state = 'running', observed_global_revision = NULL, heartbeat_at = ?
          WHERE instance_generation = ? AND state = 'quiescing' AND observed_global_revision = ?
        `).run(options.now, options.token.daemonInstanceGeneration, options.token.observedGlobalStateRevision);
        return {
          state: "busy" as const,
          reason: snapshot.failClosed ? "liveness-unavailable" : "state-changed",
          snapshot,
        };
      }
      return { state: "stop-permitted" as const, snapshot };
    })();
  } catch {
    return { state: "busy", reason: "liveness-unavailable", snapshot: failClosed("query-failed") };
  }
}

function completeIdleStop(
  database: Database.Database,
  options: { now: number; token: QuiesceToken },
): void {
  database.transaction(() => {
    const updated = database.prepare(`
      UPDATE daemon_runtime_epochs
      SET state = 'stopped', stopped_at = ?, heartbeat_at = ?
      WHERE instance_generation = ? AND state = 'quiescing' AND observed_global_revision = ?
    `).run(
      options.now,
      options.now,
      options.token.daemonInstanceGeneration,
      options.token.observedGlobalStateRevision,
    );
    if (updated.changes !== 1) throw new Error("daemon epoch changed before stop completion");
  })();
}

export async function attemptIdleStop(options: {
  actionId: string;
  election: IdleElectionPort;
  database: Database.Database;
  daemonInstanceGeneration: number;
  clock?: () => number;
  beforeFinalRecheck?: () => Promise<void>;
  closeSocket(): Promise<void>;
}): Promise<IdleStopResult> {
  const clock = options.clock ?? Date.now;
  const elected = await options.election.withExclusiveLock(options.actionId, async () => {
    const started = beginIdleQuiesce(options.database, {
      now: clock(),
      daemonInstanceGeneration: options.daemonInstanceGeneration,
    });
    if (started.state === "busy") return started;
    await options.beforeFinalRecheck?.();
    const final = recheckIdle(options.database, { now: clock(), token: started.token });
    if (final.state === "busy") return final;
    await options.closeSocket();
    completeIdleStop(options.database, { now: clock(), token: started.token });
    return {
      state: "stopped" as const,
      daemonInstanceGeneration: options.daemonInstanceGeneration,
      globalStateRevision: started.token.observedGlobalStateRevision,
    };
  });
  if (elected.role === "observer") return { state: "busy", reason: "election-active" };
  return elected.value;
}

export type DaemonRuntimeRecoveryResult = {
  instanceGeneration: number;
  recoveredGenerations: number[];
  state: "starting";
};

export function recoverDaemonRuntimeEpoch(
  database: Database.Database,
  options: { instanceGeneration: number; instanceId: string; now: number },
): DaemonRuntimeRecoveryResult {
  if (!Number.isSafeInteger(options.instanceGeneration) || options.instanceGeneration < 1) {
    throw new TypeError("daemon instance generation must be a positive safe integer");
  }
  if (!Number.isSafeInteger(options.now) || options.now < 0) throw new TypeError("daemon recovery time is invalid");
  if (options.instanceId.trim().length === 0 || Buffer.byteLength(options.instanceId, "utf8") > 1_024) {
    throw new TypeError("daemon instance ID is invalid");
  }
  return database.transaction(() => {
    const newest = database.prepare("SELECT MAX(instance_generation) AS generation FROM daemon_runtime_epochs")
      .get() as { generation: number | null };
    if (newest.generation !== null && newest.generation >= options.instanceGeneration) {
      throw new Error("daemon instance generation must advance the persisted epoch");
    }
    const rows = database.prepare(`
      SELECT instance_generation AS instanceGeneration
      FROM daemon_runtime_epochs
      WHERE state IN ('starting','running','quiescing')
      ORDER BY instance_generation
    `).all() as Array<{ instanceGeneration: number }>;
    const recoveredGenerations = rows.map((row) => row.instanceGeneration);
    database.prepare(`
      UPDATE daemon_runtime_epochs
      SET state = 'crashed', stopped_at = ?, heartbeat_at = ?
      WHERE state IN ('starting','running','quiescing')
    `).run(options.now, options.now);
    database.prepare(`
      INSERT INTO daemon_runtime_epochs(
        instance_generation, instance_id, state, observed_global_revision, started_at, heartbeat_at, stopped_at
      ) VALUES(?, ?, 'starting', NULL, ?, ?, NULL)
    `).run(options.instanceGeneration, options.instanceId, options.now, options.now);
    return { instanceGeneration: options.instanceGeneration, recoveredGenerations, state: "starting" as const };
  })();
}

export function markDaemonRuntimeRunning(
  database: Database.Database,
  options: { instanceGeneration: number; now: number },
): { instanceGeneration: number; state: "running" } {
  const updated = database.prepare(`
    UPDATE daemon_runtime_epochs
    SET state = 'running', heartbeat_at = ?
    WHERE instance_generation = ? AND state = 'starting'
  `).run(options.now, options.instanceGeneration);
  if (updated.changes !== 1) throw new Error("daemon epoch is not in starting state");
  return { instanceGeneration: options.instanceGeneration, state: "running" };
}

export class GuardedIdleStopController {
  readonly #attempt: (signal: "SIGINT" | "SIGTERM") => Promise<IdleStopResult>;
  #inFlight: Promise<IdleStopResult> | undefined;
  #terminal: Extract<IdleStopResult, { state: "stopped" }> | undefined;

  constructor(attempt: (signal: "SIGINT" | "SIGTERM") => Promise<IdleStopResult>) {
    this.#attempt = attempt;
  }

  request(signal: "SIGINT" | "SIGTERM"): Promise<IdleStopResult> {
    if (this.#terminal !== undefined) return Promise.resolve(this.#terminal);
    if (this.#inFlight !== undefined) return this.#inFlight;
    const inFlight = this.#attempt(signal).then((result) => {
      if (result.state === "stopped") this.#terminal = result;
      return result;
    }).finally(() => {
      if (this.#inFlight === inFlight) this.#inFlight = undefined;
    });
    this.#inFlight = inFlight;
    return inFlight;
  }
}

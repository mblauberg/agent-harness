import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, normalize, posix, resolve, sep } from "node:path";

import type Database from "better-sqlite3";
import { v7 as uuidv7 } from "uuid";

import type { LifecycleCurrentStateV1 } from "@local/agent-fabric-protocol";

import { FabricError } from "../errors.js";
import { resolveRunArtifactRoot } from "../artifacts/run-root.js";
import type { LifecycleCheckpoint, TaskResult } from "../core/contracts.js";

type Row = Record<string, unknown>;

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// Exact fabric.ts canonicalization/containment pair (moved byte-for-byte). Do not
// substitute the similarly-named helpers in ../artifacts/run-root.ts: they differ on
// realpath resolution (native vs non-native) and on rejected-path validation, so the
// two are not behaviourally interchangeable.
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

// Moved checkpoint guard (fabric.ts:687-700 at 0880553). Fabric imports this back for
// its remaining lifecycle call sites that have not yet been extracted (requestLifecycle
// admission gate and rotation recovery/continuation candidate parsing).
export function isLifecycleCheckpoint(value: unknown): value is LifecycleCheckpoint {
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

/**
 * Checkpoint, release, and lifecycle-audit policy for a single Fabric database.
 *
 * This is a behaviour-preserving extraction of five methods that were private on
 * Fabric. Method bodies are unchanged; direct calls back into Fabric public methods
 * (getTask, getMailboxState, getAgentLifecycle) are replaced with narrow injected
 * function references bound to the same Fabric instance, so the observed behaviour
 * (including which SQL runs and which errors are thrown) is identical.
 */
export class LifecycleCheckpointPolicy {
  readonly #database: Database.Database;
  readonly #clock: () => number;
  readonly #getTask: (runId: string, taskId: string) => TaskResult;
  readonly #getMailboxState: (runId: string, recipientId: string) => {
    contiguousWatermark: number;
    acknowledgedAboveWatermark: number[];
  };
  readonly #getAgentLifecycle: (runId: string, agentId: string) => LifecycleCurrentStateV1;

  constructor(dependencies: Readonly<{
    database: Database.Database;
    clock: () => number;
    getTask: (runId: string, taskId: string) => TaskResult;
    getMailboxState: (runId: string, recipientId: string) => {
      contiguousWatermark: number;
      acknowledgedAboveWatermark: number[];
    };
    getAgentLifecycle: (runId: string, agentId: string) => LifecycleCurrentStateV1;
  }>) {
    this.#database = dependencies.database;
    this.#clock = dependencies.clock;
    this.#getTask = dependencies.getTask;
    this.#getMailboxState = dependencies.getMailboxState;
    this.#getAgentLifecycle = dependencies.getAgentLifecycle;
  }

  verifyAndRecord(
    runId: string,
    agentId: string,
    taskId: string,
    taskRevision: number,
    checkpoint: LifecycleCheckpoint,
  ): void {
    if (!/^[0-9a-f]{64}$/u.test(checkpoint.sha256)) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "checkpoint digest is invalid");
    }
    const task = this.#getTask(runId, taskId);
    if (task.revision !== taskRevision || task.ownerAgentId !== agentId) {
      throw new FabricError("TASK_REVISION_CONFLICT", "checkpoint task revision or owner changed");
    }
    const resolvedRoot = resolveRunArtifactRoot(this.#database, runId);
    if (resolvedRoot.artifactRoot === null) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "run has no checkpoint directory");
    }
    const root = canonicalPath(resolvedRoot.artifactRoot);
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
    this.assertMatchesCurrentState(runId, agentId, checkpoint);
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

  assertMatchesCurrentState(
    runId: string,
    agentId: string,
    checkpoint: LifecycleCheckpoint,
  ): void {
    const mailbox = this.#getMailboxState(runId, agentId);
    if (mailbox.contiguousWatermark !== checkpoint.mailboxWatermark || canonicalJson(mailbox.acknowledgedAboveWatermark) !== canonicalJson(checkpoint.acknowledgedAboveWatermark)) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "checkpoint mailbox state is stale");
    }
    const provider = rowOrNotFound(
      this.#database.prepare("SELECT provider_session_ref FROM agents WHERE run_id=? AND agent_id=?").get(runId, agentId),
      "checkpoint agent",
    );
    if (provider.provider_session_ref !== checkpoint.providerResumeReference) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "checkpoint provider session does not match current Fabric state");
    }
    const currentChildren = this.#database.prepare(`
      SELECT agent_id FROM agents
       WHERE run_id=? AND parent_agent_id=?
         AND lifecycle NOT IN ('completion-ready','archived')
       ORDER BY agent_id
    `).all(runId, agentId).map((value) => stringField(rowOrNotFound(value, "checkpoint child"), "agent_id"));
    const currentOpenWork = this.#database.prepare(`
      SELECT task_id FROM tasks
       WHERE run_id=? AND owner_agent_id=?
         AND state NOT IN ('complete','cancelled','degraded')
       ORDER BY task_id
    `).all(runId, agentId).map((value) => stringField(rowOrNotFound(value, "checkpoint task"), "task_id"));
    if (
      canonicalJson(checkpoint.inFlightChildren) !== canonicalJson(currentChildren) ||
      canonicalJson(checkpoint.openWork) !== canonicalJson(currentOpenWork)
    ) {
      throw new FabricError("CHECKPOINT_INCOMPLETE", "checkpoint children or open work do not match current Fabric state");
    }
  }

  hasCurrentValidated(runId: string, agentId: string, sha256Digest: string): boolean {
    if (!/^[0-9a-f]{64}$/u.test(sha256Digest)) return false;
    const stored = this.#database.prepare(`
      SELECT checkpoint.checkpoint_json
        FROM lifecycle_checkpoints checkpoint
        JOIN tasks task
          ON task.run_id=checkpoint.run_id AND task.task_id=checkpoint.task_id
         AND task.revision=checkpoint.task_revision AND task.owner_agent_id=checkpoint.agent_id
       WHERE checkpoint.run_id=? AND checkpoint.agent_id=? AND checkpoint.sha256=?
    `).get(runId, agentId, sha256Digest);
    if (!isRow(stored) || typeof stored.checkpoint_json !== "string") return false;
    try {
      const checkpoint: unknown = JSON.parse(stored.checkpoint_json);
      if (!isLifecycleCheckpoint(checkpoint) || checkpoint.sha256 !== sha256Digest) return false;
      this.assertMatchesCurrentState(runId, agentId, checkpoint);
      return true;
    } catch {
      return false;
    }
  }

  assertReleaseReady(runId: string, agentId: string, taskId: string): void {
    const lifecycle = this.#getAgentLifecycle(runId, agentId).lifecycle;
    const task = this.#getTask(runId, taskId);
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
      lifecycle !== "idle" ||
      !["complete", "cancelled", "degraded"].includes(task.state) ||
      activeLeases > 0 ||
      activeChildren > 0 ||
      !isRow(barrier)
    ) {
      throw new FabricError("LIFECYCLE_PRECONDITION_FAILED", "release requires terminal task, no lease or child, and a closed run barrier");
    }
  }

  recordOperation(
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
}

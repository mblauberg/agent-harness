import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import {
  canonicalJson,
  isRecord,
  ProviderAdapterError,
  type AdapterActionRecord,
  type AdapterActionStatus,
} from "./types.js";

type ActionRow = {
  action_id: string;
  operation: string;
  payload_hash: string;
  status: string;
  history_json: string;
  execution_count: number;
  effect_count: number;
  idempotency_proven: number;
  result_json: string | null;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function containsPrivateValue(value: unknown, privateValues: readonly string[]): boolean {
  if (typeof value === "string") return privateValues.some((candidate) => candidate.length > 0 && value.includes(candidate));
  if (Array.isArray(value)) return value.some((entry) => containsPrivateValue(entry, privateValues));
  return isRecord(value) && Object.values(value).some((entry) => containsPrivateValue(entry, privateValues));
}

function sanitisePrivateValues(value: unknown, privateValues: readonly string[]): unknown {
  if (typeof value === "string") {
    return privateValues
      .filter((candidate) => candidate.length > 0)
      .reduce((sanitised, candidate) => sanitised.split(candidate).join("[REDACTED_PRIVATE]"), value);
  }
  if (Array.isArray(value)) return value.map((entry) => sanitisePrivateValues(entry, privateValues));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitisePrivateValues(entry, privateValues)]));
  }
  return value;
}

function isActionStatus(value: unknown): value is AdapterActionStatus {
  return (
    value === "prepared" ||
    value === "dispatched" ||
    value === "accepted" ||
    value === "terminal" ||
    value === "ambiguous" ||
    value === "cancelled"
  );
}

function actionRow(value: unknown): ActionRow {
  if (
    !isRecord(value) ||
    typeof value.action_id !== "string" ||
    typeof value.operation !== "string" ||
    typeof value.payload_hash !== "string" ||
    typeof value.status !== "string" ||
    typeof value.history_json !== "string" ||
    typeof value.execution_count !== "number" ||
    typeof value.effect_count !== "number" ||
    typeof value.idempotency_proven !== "number" ||
    (typeof value.result_json !== "string" && value.result_json !== null)
  ) {
    throw new ProviderAdapterError("JOURNAL_INVALID", "adapter action journal returned an invalid row");
  }
  return {
    action_id: value.action_id,
    operation: value.operation,
    payload_hash: value.payload_hash,
    status: value.status,
    history_json: value.history_json,
    execution_count: value.execution_count,
    effect_count: value.effect_count,
    idempotency_proven: value.idempotency_proven,
    result_json: value.result_json,
  };
}

function parseHistory(value: string): AdapterActionStatus[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every(isActionStatus)) {
    throw new ProviderAdapterError("JOURNAL_INVALID", "adapter action history is invalid");
  }
  return parsed;
}

function recordFromRow(row: ActionRow): AdapterActionRecord {
  if (!isActionStatus(row.status)) {
    throw new ProviderAdapterError("JOURNAL_INVALID", "adapter action status is invalid");
  }
  const result: unknown = row.result_json === null ? undefined : JSON.parse(row.result_json);
  return {
    actionId: row.action_id,
    operation: row.operation,
    payloadHash: row.payload_hash,
    status: row.status,
    history: parseHistory(row.history_json),
    executionCount: row.execution_count,
    effectCount: row.effect_count,
    idempotencyProven: row.idempotency_proven === 1,
    ...(result === undefined ? {} : { result }),
  };
}

export class SqliteAdapterActionJournal {
  readonly #database: Database.Database;
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#database = new Database(path);
    chmodSync(path, 0o600);
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("synchronous = FULL");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS adapter_actions (
        action_id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('prepared','dispatched','accepted','terminal','ambiguous','cancelled')),
        history_json TEXT NOT NULL,
        execution_count INTEGER NOT NULL DEFAULT 0,
        effect_count INTEGER NOT NULL DEFAULT 0,
        idempotency_proven INTEGER NOT NULL DEFAULT 0 CHECK (idempotency_proven IN (0,1)),
        result_json TEXT,
        updated_at TEXT NOT NULL
      ) STRICT;
    `);
    this.#hardenFiles();
  }

  close(): void {
    this.#database.close();
  }

  prepare(actionId: string, operation: string, payload: Record<string, unknown>, privateValues: readonly string[] = []): {
    record: AdapterActionRecord;
    created: boolean;
  } {
    if (containsPrivateValue({ actionId, operation, payload }, privateValues)) {
      throw new ProviderAdapterError("PRIVATE_HANDOFF_DISCLOSED", "adapter action input contains private handoff material");
    }
    const payloadHash = sha256(canonicalJson(payload));
    const result = this.#database.transaction(() => {
      const existing = this.#read(actionId);
      if (existing !== undefined) {
        if (existing.operation !== operation || existing.payloadHash !== payloadHash) {
          throw new ProviderAdapterError("ACTION_CONFLICT", "action ID was reused with a changed operation or payload", {
            actionId,
          });
        }
        return { record: existing, created: false };
      }
      this.#database
        .prepare(
          "INSERT INTO adapter_actions(action_id, operation, payload_hash, status, history_json, updated_at) VALUES (?, ?, ?, 'prepared', '[\"prepared\"]', ?)",
        )
        .run(actionId, operation, payloadHash, new Date().toISOString());
      return { record: this.get(actionId), created: true };
    })();
    this.#hardenFiles();
    return result;
  }

  get(actionId: string): AdapterActionRecord {
    const record = this.#read(actionId);
    if (record === undefined) {
      throw new ProviderAdapterError("ACTION_NOT_FOUND", `adapter action is unknown: ${actionId}`, { actionId });
    }
    return record;
  }

  markDispatched(actionId: string): AdapterActionRecord {
    return this.#transition(actionId, "dispatched", { executionDelta: 1 });
  }

  markAccepted(actionId: string): AdapterActionRecord {
    return this.#transition(actionId, "accepted", { effectDelta: 1 });
  }

  markTerminal(
    actionId: string,
    result: unknown,
    idempotencyProven: boolean,
    privateValues: readonly string[] = [],
  ): AdapterActionRecord {
    if (containsPrivateValue(result, privateValues)) {
      throw new ProviderAdapterError("PRIVATE_HANDOFF_DISCLOSED", "adapter terminal result contains private handoff material");
    }
    return this.#transition(actionId, "terminal", { result, idempotencyProven });
  }

  markAmbiguous(actionId: string, result?: unknown, privateValues: readonly string[] = []): AdapterActionRecord {
    return this.#transition(
      actionId,
      "ambiguous",
      result === undefined ? {} : { result: sanitisePrivateValues(result, privateValues) },
    );
  }

  cancel(actionId: string): AdapterActionRecord {
    const existing = this.get(actionId);
    if (existing.status === "terminal") {
      throw new ProviderAdapterError("ACTION_TERMINAL", "terminal action cannot be cancelled", { actionId });
    }
    if (existing.status === "dispatched" || existing.status === "accepted" || existing.status === "ambiguous") {
      throw new ProviderAdapterError(
        "CAPABILITY_UNAVAILABLE",
        "provider action cancellation cannot be proven across a process boundary",
        { actionId, capability: "cancel_action" },
      );
    }
    if (existing.status === "cancelled") return existing;
    return this.#transition(actionId, "cancelled", {});
  }

  #read(actionId: string): AdapterActionRecord | undefined {
    const value = this.#database.prepare("SELECT * FROM adapter_actions WHERE action_id = ?").get(actionId);
    return value === undefined ? undefined : recordFromRow(actionRow(value));
  }

  #transition(
    actionId: string,
    status: AdapterActionStatus,
    options: { executionDelta?: number; effectDelta?: number; result?: unknown; idempotencyProven?: boolean },
  ): AdapterActionRecord {
    const result = this.#database.transaction(() => {
      const existing = this.get(actionId);
      const history = [...existing.history, status];
      this.#database
        .prepare(
          `UPDATE adapter_actions
              SET status = ?, history_json = ?, execution_count = execution_count + ?,
                  effect_count = effect_count + ?, result_json = ?, idempotency_proven = ?, updated_at = ?
            WHERE action_id = ?`,
        )
        .run(
          status,
          JSON.stringify(history),
          options.executionDelta ?? 0,
          options.effectDelta ?? 0,
          options.result === undefined ? existing.result === undefined ? null : JSON.stringify(existing.result) : JSON.stringify(options.result),
          options.idempotencyProven === true ? 1 : existing.idempotencyProven ? 1 : 0,
          new Date().toISOString(),
          actionId,
        );
      return this.get(actionId);
    })();
    this.#hardenFiles();
    return result;
  }

  #hardenFiles(): void {
    for (const path of [this.#path, `${this.#path}-wal`, `${this.#path}-shm`]) {
      if (existsSync(path)) chmodSync(path, 0o600);
    }
  }
}

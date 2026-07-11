import { createHash } from "node:crypto";

import type Database from "better-sqlite3";

import { FabricError } from "../errors.js";

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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class CommandJournal {
  readonly #database: Database.Database;
  readonly #clock: () => number;

  constructor(database: Database.Database, clock: () => number) {
    this.#database = database;
    this.#clock = clock;
  }

  read<T>(
    runId: string,
    actorAgentId: string,
    commandId: string,
    payload: unknown,
    parseResult: (value: unknown) => value is T,
  ): T | undefined {
    const existing = this.#database
      .prepare("SELECT payload_hash, result_json FROM commands WHERE run_id = ? AND actor_agent_id = ? AND command_id = ?")
      .get(runId, actorAgentId, commandId);
    if (!isRow(existing)) return undefined;
    if (stringField(existing, "payload_hash") !== sha256(canonicalJson(payload))) {
      throw new FabricError("DEDUPE_CONFLICT", "command ID was reused with a changed payload");
    }
    const result: unknown = JSON.parse(stringField(existing, "result_json"));
    if (!parseResult(result)) throw new Error("stored command result is invalid");
    return result;
  }

  write(runId: string, actorAgentId: string, commandId: string, payload: unknown, result: unknown): void {
    this.#database
      .prepare(
        "INSERT INTO commands(run_id, actor_agent_id, command_id, payload_hash, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(runId, actorAgentId, commandId, sha256(canonicalJson(payload)), canonicalJson(result), this.#clock());
  }

  execute<T>(
    runId: string,
    actorAgentId: string,
    commandId: string,
    payload: unknown,
    parseResult: (value: unknown) => value is T,
    action: () => T,
  ): T {
    const payloadHash = sha256(canonicalJson(payload));
    const existing = this.#database
      .prepare("SELECT payload_hash, result_json FROM commands WHERE run_id = ? AND actor_agent_id = ? AND command_id = ?")
      .get(runId, actorAgentId, commandId);
    if (isRow(existing)) {
      if (stringField(existing, "payload_hash") !== payloadHash) {
        throw new FabricError("DEDUPE_CONFLICT", "command ID was reused with a changed payload");
      }
      const result: unknown = JSON.parse(stringField(existing, "result_json"));
      if (!parseResult(result)) {
        throw new Error("stored command result is invalid");
      }
      return result;
    }
    return this.#database.transaction(() => {
      const result = action();
      this.#database
        .prepare("INSERT INTO commands(run_id, actor_agent_id, command_id, payload_hash, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(runId, actorAgentId, commandId, payloadHash, canonicalJson(result), this.#clock());
      return result;
    })();
  }
}

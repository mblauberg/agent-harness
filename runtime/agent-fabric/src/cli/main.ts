#!/usr/bin/env node
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

import { verifyFabricReceiptLink } from "../exports/receipt.js";
import { runForegroundDaemon } from "./daemon-run.js";
import { mcpSeatPath, provisionMcpSeats } from "./mcp-provision.js";
import { resolveFabricPaths } from "./paths.js";

function option(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index === -1 ? undefined : arguments_[index + 1];
}

function servingSocketPath(databasePath: string, fallback: string): string {
  try {
    const value: unknown = JSON.parse(readFileSync(`${databasePath}.daemon.lock`, "utf8"));
    if (
      typeof value !== "object" || value === null ||
      !("pid" in value) || typeof value.pid !== "number" ||
      !("socketPath" in value) || typeof value.socketPath !== "string" ||
      !isAbsolute(value.socketPath)
    ) return fallback;
    process.kill(value.pid, 0);
    return value.socketPath;
  } catch {
    return fallback;
  }
}

function inspect(arguments_: string[]): void {
  const paths = resolveFabricPaths();
  const databasePath = option(arguments_, "--database") ?? paths.databasePath;
  const socketPath = servingSocketPath(databasePath, paths.socketPath);
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const rows = database.prepare("SELECT run_id, chair_agent_id FROM runs ORDER BY run_id").all();
    const runs: Array<{ runId: string; chairAgentId: string }> = [];
    for (const value of rows) {
      if (
        typeof value !== "object" ||
        value === null ||
        !("run_id" in value) ||
        typeof value.run_id !== "string" ||
        !("chair_agent_id" in value) ||
        typeof value.chair_agent_id !== "string"
      ) {
        throw new Error("database returned an invalid run row");
      }
      runs.push({ runId: value.run_id, chairAgentId: value.chair_agent_id });
    }
    const output = {
      schemaVersion: 1,
      databasePath,
      stateDirectory: paths.stateDirectory,
      runtimeDirectory: dirname(socketPath),
      socketPath,
      runs,
    };
    process.stdout.write(`${JSON.stringify(output, null, arguments_.includes("--json") ? 2 : 0)}\n`);
  } finally {
    database.close();
  }
}

async function verifyReceipt(arguments_: string[]): Promise<void> {
  const runReceiptPath = option(arguments_, "--run-receipt");
  if (runReceiptPath === undefined) {
    throw new Error("receipt verify requires --run-receipt <path>");
  }
  const result = await verifyFabricReceiptLink({ runReceiptPath });
  process.stdout.write(`verified ${result.relativePath} sha256 ${result.sha256}\n`);
}

async function main(arguments_: string[]): Promise<void> {
  if (arguments_[0] === "inspect") {
    inspect(arguments_.slice(1));
    return;
  }
  if (arguments_[0] === "receipt" && arguments_[1] === "verify") {
    await verifyReceipt(arguments_.slice(2));
    return;
  }
  if (arguments_[0] === "daemon" && arguments_[1] === "run") {
    await runForegroundDaemon(arguments_.slice(2));
    return;
  }
  if (arguments_[0] === "mcp" && arguments_[1] === "provision") {
    const output = await provisionMcpSeats(arguments_.slice(2), resolveFabricPaths());
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }
  if (arguments_[0] === "mcp" && arguments_[1] === "seat-path") {
    const output = await mcpSeatPath(arguments_.slice(2), resolveFabricPaths());
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }
  throw new Error(
    "usage: agent-fabric inspect [--database PATH] [--json] | receipt verify --run-receipt PATH | daemon run (--no-adapters | --trusted-config PATH --compatibility PATH --compatibility-schema PATH --agents-home PATH) | mcp provision --project PATH --chair SEAT --seats SEAT,... --expires-at ISO_TIMESTAMP | mcp seat-path --project PATH --seat SEAT",
  );
}

try {
  await main(process.argv.slice(2));
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

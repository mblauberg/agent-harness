import Database from "better-sqlite3";
import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { verifyAdapterCompatibility } from "../adapters/compatibility.js";
import { loadFabricConfig } from "../config/index.js";
import { assertDatabaseIntegrity } from "../persistence/invariants.js";
import { connectFabricDaemon } from "../daemon/client.js";
import { readDiscoveryReceipt } from "./mcp-provision.js";
import type { FabricPaths } from "./paths.js";
import { MCP_SEATS, resolveSeatPaths, type SeatMetadata } from "./seat-store.js";
import { trustedWorkspaceRoots } from "./workspace-trust.js";

type Check = { id: string; status: "pass" | "fail"; detail: string };

function option(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  const value = index === -1 ? undefined : arguments_[index + 1];
  if (index !== -1 && (value === undefined || value.startsWith("--"))) throw new Error(`${name} requires a value`);
  return value;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function agentsHome(arguments_: string[]): string {
  return resolve(option(arguments_, "--agents-home") ?? process.env.AGENTS_HOME ?? process.cwd());
}

function pathsFor(arguments_: string[]): { agentsHome: string; config: string; compatibility: string; compatibilitySchema: string } {
  const home = agentsHome(arguments_);
  return {
    agentsHome: home,
    config: resolve(option(arguments_, "--trusted-config") ?? join(home, "config", "agent-fabric.yaml")),
    compatibility: resolve(option(arguments_, "--compatibility") ?? join(home, "config", "adapter-compatibility.yaml")),
    compatibilitySchema: resolve(option(arguments_, "--compatibility-schema") ?? join(home, "runtime", "agent-fabric", "schemas", "adapter-compatibility.schema.json")),
  };
}

async function daemonState(paths: FabricPaths): Promise<{ reachable: boolean; pid: number | null; socketPath: string; protocolVersion: 1; activeAdapters: string[] }> {
  try {
    const discovery = await readDiscoveryReceipt(paths);
    process.kill(discovery.pid, 0);
    const client = await connectFabricDaemon({ socketPath: discovery.socketPath, capability: discovery.bootstrapCapability });
    const activeAdapters = client.initializeResult.activeAdapters;
    await client.close();
    return { reachable: true, pid: discovery.pid, socketPath: discovery.socketPath, protocolVersion: 1, activeAdapters };
  } catch {
    return { reachable: false, pid: null, socketPath: paths.socketPath, protocolVersion: 1, activeAdapters: [] };
  }
}

async function seatStatus(paths: FabricPaths, project: string): Promise<Array<Record<string, unknown>>> {
  const seats: Array<Record<string, unknown>> = [];
  for (const seat of MCP_SEATS) {
    try {
      const location = await resolveSeatPaths({ stateDirectory: paths.stateDirectory, project, seat });
      const metadata: unknown = JSON.parse(await readFile(location.metadataPath, "utf8"));
      if (typeof metadata !== "object" || metadata === null) throw new Error("metadata is invalid");
      const value = metadata as SeatMetadata;
      seats.push({ seat, agentId: value.agentId, role: value.role, runId: value.runId, expiresAt: value.expiresAt, active: Date.parse(value.expiresAt) > Date.now() });
    } catch {
      seats.push({ seat, active: false, registered: false });
    }
  }
  return seats;
}

export async function fabricStatus(arguments_: string[], paths: FabricPaths): Promise<Record<string, unknown>> {
  const selected = pathsFor(arguments_);
  const config = await loadFabricConfig({ globalPath: selected.config, agentsHome: selected.agentsHome });
  const roots = [...new Set([...config.workspaceRoots, ...await trustedWorkspaceRoots({ stateDirectory: paths.stateDirectory, executionProfile: config.executionProfile ?? "headless" })])].sort();
  const project = resolve(option(arguments_, "--project") ?? process.cwd());
  const daemon = await daemonState(paths);
  return {
    schemaVersion: 1,
    daemon,
    executionProfile: config.executionProfile ?? "headless",
    configuredAdapters: config.adapterIds,
    activeAdapters: daemon.activeAdapters,
    trustedWorkspaceRoots: roots,
    project: { path: project, seats: await seatStatus(paths, project) },
  };
}

async function check(id: string, operation: () => void | Promise<void>): Promise<Check> {
  try {
    await operation();
    return { id, status: "pass", detail: "ok" };
  } catch (error: unknown) {
    return { id, status: "fail", detail: errorDetail(error) };
  }
}

export async function fabricDoctor(arguments_: string[], paths: FabricPaths): Promise<Record<string, unknown>> {
  const selected = pathsFor(arguments_);
  let adapterIds: string[] = [];
  const checks: Check[] = [];
  checks.push(await check("configuration", async () => {
    const config = await loadFabricConfig({ globalPath: selected.config, agentsHome: selected.agentsHome });
    adapterIds = config.adapterIds;
  }));
  checks.push(await check("adapter-compatibility", async () => {
    await verifyAdapterCompatibility({ compatibilityPath: selected.compatibility, schemaPath: selected.compatibilitySchema, adapterIds, requireEnabled: true });
  }));
  for (const [id, path, expectedKind] of [
    ["state-directory", paths.stateDirectory, "directory"],
    ["runtime-directory", paths.runtimeDirectory, "directory"],
  ] as const) {
    checks.push(await check(id, async () => {
      const info = await lstat(path);
      if (info.isSymbolicLink() || (expectedKind === "directory" && !info.isDirectory()) || (info.mode & 0o077) !== 0) throw new Error(`${path} must be a private non-symlink directory`);
    }));
  }
  checks.push(await check("database-integrity", () => {
    const database = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    try { assertDatabaseIntegrity(database); } finally { database.close(); }
  }));
  checks.push(await check("daemon-socket", async () => {
    const state = await daemonState(paths);
    if (!state.reachable) throw new Error("daemon discovery, process or Unix socket is unavailable");
    const info = await lstat(paths.socketPath);
    if (!info.isSocket() || info.uid !== process.getuid?.()) throw new Error("daemon socket is not owned by the current user");
  }));
  return { schemaVersion: 1, healthy: checks.every((item) => item.status === "pass"), checks };
}

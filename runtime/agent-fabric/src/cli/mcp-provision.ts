import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";

import { connectFabricDaemon, type FabricDaemonClient } from "../daemon/client.js";
import { AGENT_AUTHORITY_OPERATIONS, FABRIC_OPERATIONS } from "../domain/operations.js";
import type { AuthorityInput } from "../domain/types.js";
import type { FabricPaths } from "./paths.js";
import {
  parseMcpSeat,
  installSeatGeneration,
  resolveSeatPaths,
  type McpSeat,
  type SeatMetadata,
} from "./seat-store.js";

const MAXIMUM_SEAT_LIFETIME_MS = 31 * 24 * 60 * 60 * 1_000;

const PEER_OPERATIONS = [
  FABRIC_OPERATIONS.sendMessage,
  FABRIC_OPERATIONS.receiveMessages,
  FABRIC_OPERATIONS.acknowledgeDelivery,
  FABRIC_OPERATIONS.abandonDelivery,
  FABRIC_OPERATIONS.getMailboxState,
  FABRIC_OPERATIONS.claimTask,
  FABRIC_OPERATIONS.acknowledgeTaskHandoff,
  FABRIC_OPERATIONS.getTask,
  FABRIC_OPERATIONS.updateTask,
  FABRIC_OPERATIONS.acquireWriteLease,
  FABRIC_OPERATIONS.renewWriteLease,
  FABRIC_OPERATIONS.getWriteLease,
  FABRIC_OPERATIONS.releaseWriteLease,
  FABRIC_OPERATIONS.requestLifecycle,
  FABRIC_OPERATIONS.getAgentLifecycle,
  FABRIC_OPERATIONS.publishArtifact,
  FABRIC_OPERATIONS.getRunStatus,
  FABRIC_OPERATIONS.listTasks,
  FABRIC_OPERATIONS.listAgents,
] as const;

export type DiscoveryReceipt = {
  schemaVersion: 1;
  socketPath: string;
  pid: number;
  bootstrapCapability: string;
};

export type McpProvisionOutput = {
  schemaVersion: 1;
  projectKey: string;
  projectPath: string;
  runId: string;
  chairSeat: McpSeat;
  expiresAt: string;
  discussionGroupId: string;
  seats: Array<{
    seat: McpSeat;
    role: "chair" | "peer";
    agentId: string;
    credentialPath: string;
    metadataPath: string;
  }>;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactOptions(arguments_: string[], names: readonly string[], command: string): void {
  if (arguments_.length !== names.length * 2) {
    throw new Error(`${command} requires ${names.map((name) => `${name} <value>`).join(" ")}`);
  }
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (name === undefined || !names.includes(name)) throw new Error(`${command} received an unknown option`);
    if (value === undefined || value.startsWith("--")) throw new Error(`${command} requires ${name} <value>`);
  }
}

function option(arguments_: string[], name: string, command: string): string {
  const indexes = arguments_.flatMap((value, index) => (value === name ? [index] : []));
  if (indexes.length !== 1) throw new Error(`${command} requires exactly one ${name} option`);
  const index = indexes[0];
  if (index === undefined) throw new Error(`${command} requires ${name} <value>`);
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${command} requires ${name} <value>`);
  return value;
}

function parseSeats(value: string): McpSeat[] {
  const values = value.split(",");
  if (values.length === 0 || values.some((seat) => seat.length === 0 || seat.trim() !== seat)) {
    throw new Error("mcp provision --seats must be a comma-separated seat roster");
  }
  const seats = values.map(parseMcpSeat);
  if (new Set(seats).size !== seats.length) throw new Error("mcp provision --seats contains a duplicate seat");
  return seats.sort((left, right) => left.localeCompare(right));
}

export async function readDiscoveryReceipt(paths: FabricPaths): Promise<DiscoveryReceipt> {
  const discoveryPath = join(paths.runtimeDirectory, "fabric-v1.discovery.json");
  const directory = await lstat(paths.runtimeDirectory);
  if (directory.isSymbolicLink() || !directory.isDirectory() || (directory.mode & 0o777) !== 0o700) {
    throw new Error(`fabric runtime directory must be a private non-symlink directory: ${paths.runtimeDirectory}`);
  }
  const before = await lstat(discoveryPath);
  if (before.isSymbolicLink()) throw new Error(`fabric discovery receipt must not be a symbolic link: ${discoveryPath}`);
  if (!before.isFile()) throw new Error(`fabric discovery receipt is not a regular file: ${discoveryPath}`);
  if ((before.mode & 0o777) !== 0o600) throw new Error(`fabric discovery receipt must have mode 0600: ${discoveryPath}`);

  const handle = await open(discoveryPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let text: string;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error(`fabric discovery receipt changed while opening: ${discoveryPath}`);
    }
    text = await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`fabric discovery receipt is not valid JSON: ${discoveryPath}`);
  }
  if (
    !record(value) ||
    Object.keys(value).sort().join(",") !== "bootstrapCapability,pid,schemaVersion,socketPath" ||
    value.schemaVersion !== 1 ||
    value.socketPath !== paths.socketPath ||
    typeof value.pid !== "number" ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 0 ||
    typeof value.bootstrapCapability !== "string" ||
    !/^afb_[A-Za-z0-9_-]{43}$/u.test(value.bootstrapCapability)
  ) {
    throw new Error(`fabric discovery receipt is invalid or does not match the configured socket: ${discoveryPath}`);
  }
  return value as DiscoveryReceipt;
}

function boundedExpiry(value: string): string {
  const expiresAt = Date.parse(value);
  const now = Date.now();
  if (!Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== value) {
    throw new Error("mcp provision --expires-at must be an ISO timestamp");
  }
  if (expiresAt <= now || expiresAt - now > MAXIMUM_SEAT_LIFETIME_MS) {
    throw new Error("mcp provision --expires-at must be in the future and no more than 31 days away");
  }
  return value;
}

function authority(actions: readonly string[], expiresAt: string): AuthorityInput {
  return {
    workspaceRoots: ["."],
    sourcePaths: ["."],
    artifactPaths: [".agent-run"],
    actions: [...actions],
    disclosure: ["local"],
    expiresAt,
    budget: {},
  };
}

function rosterDigest(seats: readonly McpSeat[]): string {
  return createHash("sha256").update(seats.join(",")).digest("hex").slice(0, 16);
}

function provisionGeneration(chairSeat: McpSeat, seats: readonly McpSeat[], expiresAt: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ chairSeat, seats, expiresAt }))
    .digest("hex")
    .slice(0, 16);
}

export async function provisionMcpSeats(arguments_: string[], paths: FabricPaths): Promise<McpProvisionOutput> {
  const command = "mcp provision";
  assertExactOptions(arguments_, ["--project", "--chair", "--seats", "--expires-at"], command);
  const project = option(arguments_, "--project", command);
  const chairSeat = parseMcpSeat(option(arguments_, "--chair", command));
  const seats = parseSeats(option(arguments_, "--seats", command));
  const expiresAt = boundedExpiry(option(arguments_, "--expires-at", command));
  if (seats.length < 2) throw new Error("mcp provision requires at least two distinct seats");
  if (!seats.includes(chairSeat)) throw new Error("mcp provision chair must be present in the supplied seat roster");
  const firstSeat = seats[0];
  if (firstSeat === undefined) throw new Error("mcp provision requires at least one seat");
  const firstPaths = await resolveSeatPaths({ stateDirectory: paths.stateDirectory, project, seat: firstSeat });
  const { projectKey, projectPath } = firstPaths;
  const runId = `project-${projectKey}-${provisionGeneration(chairSeat, seats, expiresAt)}`;
  const discovery = await readDiscoveryReceipt(paths);
  const bootstrap = await connectFabricDaemon({
    socketPath: discovery.socketPath,
    capability: discovery.bootstrapCapability,
  });
  let chair: FabricDaemonClient | undefined;
  try {
    const run = await bootstrap.createRun({
      runId,
      workspaceRoot: projectPath,
      projectRunDirectory: join(projectPath, ".agent-run", runId),
      chair: {
        agentId: chairSeat,
        authority: authority(AGENT_AUTHORITY_OPERATIONS, expiresAt),
      },
    });
    chair = await connectFabricDaemon({ socketPath: discovery.socketPath, capability: run.chairCapability });
    const registrations = new Map<McpSeat, string>([[chairSeat, run.chairCapability]]);
    for (const seat of seats) {
      if (seat === chairSeat) continue;
      const delegated = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        commandId: `mcp-provision:${projectKey}:authority:${seat}`,
        authority: authority(PEER_OPERATIONS, expiresAt),
      });
      const registration = await chair.registerAgent({ agentId: seat, authorityId: delegated.authorityId });
      registrations.set(seat, registration.capability);
    }
    const discussionGroupId = `${runId}:seats:${rosterDigest(seats)}`;
    await chair.createDiscussionGroup({
      groupId: discussionGroupId,
      memberAgentIds: seats,
      commandId: `mcp-provision:${projectKey}:discussion-group:${rosterDigest(seats)}`,
    });

    const stagedSeats: Array<{ metadata: Omit<SeatMetadata, "credentialPath">; credential: string }> = [];
    for (const seat of seats) {
      const credential = registrations.get(seat);
      if (credential === undefined) throw new Error(`daemon did not return a credential for seat ${seat}`);
      const role = seat === chairSeat ? "chair" : "peer";
      const metadata: Omit<SeatMetadata, "credentialPath"> = {
        schemaVersion: 1,
        projectKey,
        projectPath,
        runId,
        seat,
        agentId: seat,
        role,
        expiresAt,
      };
      stagedSeats.push({ metadata, credential });
    }
    const generation = provisionGeneration(chairSeat, seats, expiresAt);
    const installed = await installSeatGeneration({
      stateDirectory: paths.stateDirectory,
      projectPath,
      generation,
      seats: stagedSeats,
    });
    const outputSeats: McpProvisionOutput["seats"] = [];
    for (const seat of seats) {
      const written = installed.find((candidate) => candidate.seat === seat);
      if (written === undefined) throw new Error(`seat generation did not install ${seat}`);
      const role = seat === chairSeat ? "chair" : "peer";
      outputSeats.push({
        seat,
        role,
        agentId: seat,
        credentialPath: written.credentialPath,
        metadataPath: written.metadataPath,
      });
    }
    return {
      schemaVersion: 1,
      projectKey,
      projectPath,
      runId,
      chairSeat,
      expiresAt,
      discussionGroupId,
      seats: outputSeats,
    };
  } finally {
    await Promise.allSettled([chair?.close() ?? Promise.resolve(), bootstrap.close()]);
  }
}

export async function mcpSeatPath(arguments_: string[], paths: FabricPaths): Promise<{
  schemaVersion: 1;
  projectKey: string;
  seat: McpSeat;
  credentialPath: string;
  metadataPath: string;
}> {
  const command = "mcp seat-path";
  assertExactOptions(arguments_, ["--project", "--seat"], command);
  const project = option(arguments_, "--project", command);
  const seat = parseMcpSeat(option(arguments_, "--seat", command));
  const seatPaths = await resolveSeatPaths({ stateDirectory: paths.stateDirectory, project, seat });
  return {
    schemaVersion: 1,
    projectKey: seatPaths.projectKey,
    seat,
    credentialPath: seatPaths.credentialPath,
    metadataPath: seatPaths.metadataPath,
  };
}

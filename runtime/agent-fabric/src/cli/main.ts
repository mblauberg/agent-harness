#!/usr/bin/env node
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { dirname } from "node:path";
import {
  FABRIC_OPERATIONS,
  NdjsonRpcTransport,
  ProtocolTransportError,
  type HerdrSteerDispatchResult,
} from "@local/agent-fabric-protocol";

import { verifyFabricReceiptLink } from "../exports/receipt.js";
import { runForegroundDaemon } from "./daemon-run.js";
import { runEventObserver } from "./event-observer.js";
import { HERDR_STEER_USAGE, parseHerdrSteerArguments } from "./herdr-steer.js";
import { mcpSeatPath, provisionMcpSeats } from "./mcp-provision.js";
import { provisionObserverCredential } from "./observer-provision.js";
import { resolveFabricPaths } from "./paths.js";
import { runRetentionCli } from "./retention.js";
import { fabricDoctor, fabricStatus } from "./status.js";
import { runWorkspaceTrust } from "./workspace-trust.js";
import { resolveMcpCapability } from "../mcp/credentials.js";
import {
  privateDiscoveryPaths,
  readPrivateDiscovery,
  readPrivateDiscoveryOwner,
} from "../daemon/private-discovery.js";

function option(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index === -1 ? undefined : arguments_[index + 1];
}

async function servingSocketPath(runtimeDirectory: string, fallback: string): Promise<string> {
  try {
    const discoveryPaths = privateDiscoveryPaths(runtimeDirectory);
    const owner = await readPrivateDiscoveryOwner(discoveryPaths);
    if (owner === undefined || owner.state !== "active") return fallback;
    const discovery = await readPrivateDiscovery(discoveryPaths, owner.socketPath);
    if (discovery.status !== "active") return fallback;
    process.kill(discovery.owner.pid, 0);
    return discovery.receipt.socketPath;
  } catch {
    return fallback;
  }
}

async function inspect(arguments_: string[]): Promise<void> {
  const paths = resolveFabricPaths();
  const databasePath = option(arguments_, "--database") ?? paths.databasePath;
  const runtimeDirectory = option(arguments_, "--runtime-directory") ?? paths.runtimeDirectory;
  const socketPath = await servingSocketPath(runtimeDirectory, paths.socketPath);
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

async function herdrSteer(arguments_: string[]): Promise<void> {
  const request = await parseHerdrSteerArguments(arguments_);
  const paths = resolveFabricPaths();
  const socketPath = process.env.AGENT_FABRIC_SOCKET_PATH ??
    await servingSocketPath(paths.runtimeDirectory, paths.socketPath);
  const capability = await resolveMcpCapability(
    process.env,
    process.cwd(),
    (message) => process.stderr.write(`warning: ${message}\n`),
  );
  delete process.env.AGENT_FABRIC_CAPABILITY;
  let transport: Awaited<ReturnType<typeof NdjsonRpcTransport.connect>> | undefined;
  let result: HerdrSteerDispatchResult | {
    status: "unavailable";
    integration: "agent-fabric";
    reason: "unavailable";
  };
  try {
    transport = await NdjsonRpcTransport.connect(createConnection(socketPath), {
      protocolVersion: 1,
      client: { name: "agent-fabric-herdr-steer", version: "1.0.0" },
      authentication: {
        scheme: "capability",
        credential: capability,
        clientNonce: `herdr_steer_${randomUUID()}`,
      },
      expectedPrincipalKind: "agent",
      requiredFeatures: ["herdr-control.v1"],
      optionalFeatures: [],
    });
    result = await transport.call(FABRIC_OPERATIONS.herdrSteerDispatch, request);
  } catch (error: unknown) {
    if (!(error instanceof ProtocolTransportError) && !isConnectionFailure(error)) throw error;
    result = { status: "unavailable", integration: "agent-fabric", reason: "unavailable" };
  } finally {
    await transport?.close();
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "terminal") process.exitCode = 1;
}

function isConnectionFailure(error: unknown): boolean {
  return error instanceof Error && "code" in error &&
    typeof error.code === "string" && ["ECONNREFUSED", "ENOENT", "EPIPE", "ECONNRESET"].includes(error.code);
}

async function main(arguments_: string[]): Promise<void> {
  if (arguments_[0] === "status") {
    process.stdout.write(`${JSON.stringify(await fabricStatus(arguments_.slice(1), resolveFabricPaths()), null, 2)}\n`);
    return;
  }
  if (arguments_[0] === "doctor") {
    const output = await fabricDoctor(arguments_.slice(1), resolveFabricPaths());
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (output.healthy !== true) process.exitCode = 1;
    return;
  }
  if (arguments_[0] === "inspect") {
    await inspect(arguments_.slice(1));
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
  if (arguments_[0] === "observe") {
    await runEventObserver(arguments_.slice(1));
    return;
  }
  if (arguments_[0] === "herdr" && arguments_[1] === "steer") {
    if (arguments_.length === 3 && ["--help", "-h"].includes(arguments_[2] ?? "")) {
      process.stdout.write(`${HERDR_STEER_USAGE}\n`);
      return;
    }
    await herdrSteer(arguments_.slice(2));
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
  if (arguments_[0] === "mcp" && arguments_[1] === "observer-provision") {
    const projectIndex = arguments_.indexOf("--project");
    const project = projectIndex === -1 ? undefined : arguments_[projectIndex + 1];
    if (project === undefined || arguments_.length !== 4) throw new Error("mcp observer-provision requires --project <path>");
    const output = await provisionObserverCredential({ project, paths: resolveFabricPaths() });
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }
  if (arguments_[0] === "workspace") {
    const output = await runWorkspaceTrust(arguments_.slice(1), resolveFabricPaths());
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }
  if (arguments_[0] === "retention") {
    const output = await runRetentionCli(arguments_.slice(1), resolveFabricPaths().databasePath);
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }
  throw new Error(
    "usage: agent-fabric status|doctor [--project PATH] [--agents-home PATH] [--trusted-config PATH] [--compatibility PATH] [--compatibility-schema PATH] | inspect [--database PATH] [--runtime-directory PATH] [--json] | workspace trust|inspect|list|revoke [PATH] | retention status|preview [--database PATH] | retention archive --run-id ID --output ABSOLUTE_DIRECTORY [--database PATH] | receipt verify --run-receipt PATH | daemon run (...) | observe --socket PATH --capability-file PATH --run-id ID --cursor PATH [--once] [--interval-ms N] | herdr steer (...) | mcp provision --project PATH --project-session-id ID --session-revision N --session-generation N --run-id ID --run-revision N --chair-seat SEAT --chair-agent-id ID --chair-generation N --chair-lease-id ID --seat-bindings SEAT=AGENT@GENERATION,... --expires-at ISO_TIMESTAMP | mcp seat-path --project PATH --seat SEAT",
  );
}

try {
  await main(process.argv.slice(2));
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

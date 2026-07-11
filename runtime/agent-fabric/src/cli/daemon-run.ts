import { randomBytes } from "node:crypto";
import { chmod, open, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { startFabricDaemon, type DaemonStartOptions } from "../daemon/client.js";
import { resolveFabricPaths } from "./paths.js";

function option(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  if (index === -1) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a path`);
  }
  return resolve(value);
}

function daemonConfiguration(arguments_: string[]): DaemonStartOptions["configuration"] {
  const noAdapters = arguments_.includes("--no-adapters");
  const trustedConfigPath = option(arguments_, "--trusted-config");
  if (noAdapters === (trustedConfigPath !== undefined)) {
    throw new Error("daemon run requires exactly one of --no-adapters or --trusted-config PATH");
  }
  if (noAdapters) return undefined;
  const compatibilityPath = option(arguments_, "--compatibility");
  const compatibilitySchemaPath = option(arguments_, "--compatibility-schema");
  const agentsHome = option(arguments_, "--agents-home");
  if (
    trustedConfigPath === undefined ||
    compatibilityPath === undefined ||
    compatibilitySchemaPath === undefined ||
    agentsHome === undefined
  ) {
    throw new Error(
      "trusted daemon start requires --trusted-config, --compatibility, --compatibility-schema and --agents-home",
    );
  }
  const projectConfigPath = option(arguments_, "--project-config");
  const localConfigPath = option(arguments_, "--local-config");
  const runConfigPath = option(arguments_, "--run-config");
  return {
    globalConfigPath: trustedConfigPath,
    ...(localConfigPath === undefined ? {} : { localConfigPath }),
    ...(projectConfigPath === undefined ? {} : { projectConfigPath }),
    ...(runConfigPath === undefined ? {} : { runConfigPath }),
    compatibilityPath,
    compatibilitySchemaPath,
    agentsHome,
  };
}

async function writeDiscoveryReceipt(path: string, receipt: Record<string, unknown>): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await handle.sync();
  } catch (error: unknown) {
    await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true });
    throw error;
  }
  await handle.close();
  try {
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, path);
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function runForegroundDaemon(arguments_: string[]): Promise<void> {
  const paths = resolveFabricPaths();
  const configuration = daemonConfiguration(arguments_);
  const daemon = await startFabricDaemon({
    databasePath: paths.databasePath,
    stateDirectory: paths.stateDirectory,
    runtimeDirectory: paths.runtimeDirectory,
    socketPath: paths.socketPath,
    ...(configuration === undefined ? {} : { configuration }),
  });
  const discoveryPath = join(paths.runtimeDirectory, "fabric-v1.discovery.json");
  let stopPromise: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopPromise ??= daemon.stop();
    return stopPromise;
  };
  const onSignal = (): void => {
    void stop().catch(() => undefined);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    await writeDiscoveryReceipt(
      discoveryPath,
      {
        schemaVersion: 1,
        socketPath: daemon.address.path,
        pid: daemon.pid,
        bootstrapCapability: daemon.bootstrapCapability,
      },
    );
    const startedAt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Brisbane", dateStyle: "short", timeStyle: "medium", hourCycle: "h23",
    }).format(new Date());
    process.stdout.write(`agent-fabric ready pid=${daemon.pid} protocol=1 socket=${daemon.address.path} started=${startedAt} AEST (UTC+10)\n`);
    await daemon.waitForExit();
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await rm(discoveryPath, { force: true });
    await stop();
    process.stdout.write("agent-fabric stopped\n");
  }
}

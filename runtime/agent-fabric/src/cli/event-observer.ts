import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

import { connectFabricDaemon, type FabricDaemonClient } from "../daemon/client.js";
import { DurableEventObserver } from "../visibility/event-observer.js";

type Connector = (options: { socketPath: string; capability: string }) => Promise<Pick<FabricDaemonClient, "eventsAfter" | "close">>;

function option(arguments_: string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index === -1 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`observe requires ${name} <value>`);
  return value;
}

async function readCapability(path: string): Promise<string> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o077) !== 0) {
    throw new Error("observer capability must be a private regular file");
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error("observer capability changed while opening");
    }
    const capability = (await handle.readFile("utf8")).trim();
    if (!/^afc_[A-Za-z0-9_-]{43}$/u.test(capability)) throw new Error("observer capability is invalid");
    return capability;
  } finally {
    await handle.close();
  }
}

export async function runEventObserver(
  arguments_: string[],
  dependencies: {
    connect?: Connector;
    render?: (line: string) => Promise<void>;
    wait?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<void> {
  const known = new Set(["--socket", "--capability-file", "--run-id", "--cursor", "--interval-ms", "--once"]);
  if (arguments_.some((value) => value.startsWith("--") && !known.has(value))) throw new Error("observe received an unknown option");
  const intervalValue = arguments_.includes("--interval-ms") ? Number(option(arguments_, "--interval-ms")) : 1_000;
  if (!Number.isSafeInteger(intervalValue) || intervalValue < 100 || intervalValue > 60_000) {
    throw new Error("observe interval must be between 100 and 60000 milliseconds");
  }
  const client = await (dependencies.connect ?? connectFabricDaemon)({
    socketPath: option(arguments_, "--socket"),
    capability: await readCapability(option(arguments_, "--capability-file")),
  });
  const observer = new DurableEventObserver({
    runId: option(arguments_, "--run-id"),
    cursorPath: option(arguments_, "--cursor"),
    source: client,
    render: dependencies.render ?? (async (line) => { process.stdout.write(`[fabric] ${line}\n`); }),
  });
  try {
    do {
      await observer.poll();
      if (arguments_.includes("--once")) break;
      await (dependencies.wait ?? (async (milliseconds) => await new Promise((resolve) => setTimeout(resolve, milliseconds))))(intervalValue);
    } while (true);
  } finally {
    await client.close();
  }
}

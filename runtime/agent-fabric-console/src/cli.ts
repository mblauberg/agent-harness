#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  startFabricConsoleApplication,
  type ConsoleBootstrapPort,
} from "./application.js";
import { TerminalInputDecoder } from "./input.js";
import {
  reduceFabricPointer,
  renderFabricConsoleFrame,
  type FabricConsoleFrame,
} from "./index.js";
import { TerminalSession } from "./terminal.js";

export const CONSOLE_CLI_USAGE =
  "usage: agent-fabric-console [--project ABSOLUTE_ROOT] [--herdr]\n" +
  "This build uses the typed injected bootstrap boundary. If no lock-safe provider is installed, the System view reports bootstrap unavailable and all mutations remain disabled.\n";

function option(arguments_: readonly string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  if (index < 0) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function validateArguments(arguments_: readonly string[]): void {
  const known = new Set(["--help", "-h", "--project", "--herdr"]);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === undefined || !known.has(argument)) {
      throw new Error(`unknown Console argument: ${argument ?? ""}`);
    }
    if (argument === "--project") index += 1;
  }
}

const unavailableBootstrap: ConsoleBootstrapPort = {
  startOrAttach: async () => ({
    status: "unavailable",
    reason: "feature-unavailable",
  }),
};

export async function runConsoleCli(arguments_: readonly string[]): Promise<void> {
  validateArguments(arguments_);
  if (arguments_.includes("--help") || arguments_.includes("-h")) {
    process.stdout.write(CONSOLE_CLI_USAGE);
    return;
  }
  const projectRoot = resolve(option(arguments_, "--project") ?? process.cwd());
  let terminalReady = false;
  let application:
    | Awaited<ReturnType<typeof startFabricConsoleApplication>>
    | undefined;
  let terminal: TerminalSession | undefined;
  const draw = (frame: FabricConsoleFrame): void => {
    if (!terminalReady) return;
    process.stdout.write(`\u001b[H${frame.rows.join("\n")}`);
  };
  application = await startFabricConsoleApplication({
    bootstrap: unavailableBootstrap,
    projectRoot,
    surface: arguments_.includes("--herdr") ? "herdr" : "standalone",
    viewport: {
      columns: process.stdout.columns,
      rows: process.stdout.rows,
    },
    draw,
    eventId: (() => {
      let sequence = 0;
      return () => `cli-input-${String(++sequence)}`;
    })(),
    confirmationId: () => "bootstrap-unavailable",
    render: renderFabricConsoleFrame,
    reducePointer: reduceFabricPointer,
    setMouseCapture: (enabled) => terminal?.setMouseCapture(enabled),
    setEditorActive: (enabled) => terminal?.setEditorActive(enabled),
  });
  let finish: (() => void) | undefined;
  const finished = new Promise<void>((resolveFinished) => {
    finish = resolveFinished;
  });
  terminal = new TerminalSession({
    input: process.stdin,
    output: process.stdout,
    mouseCapture: false,
    signalTarget: process,
    onResize: (viewport) => {
      application?.resize(viewport);
    },
    onSignal: () => {
      void application?.close("signal").finally(() => finish?.());
    },
    onSuspend: () => {
      process.kill(process.pid, "SIGSTOP");
    },
    onResume: () => {
      application?.repaint();
    },
  });
  terminalReady = true;
  application.repaint();
  const decoder = new TerminalInputDecoder();
  const onData = (chunk: Buffer): void => {
    for (const event of decoder.push(chunk)) {
      void application?.handleInput(event).then(() => {
        if (application?.closed === true) finish?.();
      });
    }
  };
  process.stdin.on("data", onData);
  const timeout = setInterval(() => {
    for (const event of decoder.flushTimedOut()) {
      void application?.handleInput(event).then(() => {
        if (application?.closed === true) finish?.();
      });
    }
  }, 10);
  try {
    await finished;
  } finally {
    clearInterval(timeout);
    process.stdin.off("data", onData);
    terminal.close();
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(resolve(invokedPath)).href
) {
  runConsoleCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

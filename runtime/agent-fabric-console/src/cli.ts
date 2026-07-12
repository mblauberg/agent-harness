#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  parseIdentifier,
  type ProjectSessionId,
} from "@local/agent-fabric-protocol";

import {
  startFabricConsoleApplication,
  type ConsoleBootstrapPort,
} from "./application.js";
import { TerminalInputDecoder, type TerminalInputEvent } from "./input.js";
import {
  reduceFabricPointer,
  renderFabricConsoleFrame,
  type FabricConsoleFrame,
} from "./index.js";
import { createProductionConsoleBootstrap } from "./production-composition.js";
import { createProductionConsoleTypedEntryPlanner } from "./typed-entry-planner.js";
import { createFabricUiState } from "./presenter.js";
import { renderConsoleSnapshot, type ConsoleSnapshotFormat } from "./snapshot.js";
import {
  TerminalSession,
  type TerminalInput,
  type TerminalLifecycleTarget,
  type TerminalOutput,
  type TerminalSessionOptions,
} from "./terminal.js";

export const CONSOLE_CLI_USAGE =
  "usage: agent-fabric-console [--project ABSOLUTE_ROOT] [--session STABLE_ID] [--herdr] [--export json|markdown]\n" +
  "Starts or attaches through the lock-safe local Fabric bootstrap. If configuration, startup, or authority is unavailable, the explicit unavailable state remains read-only.\n";

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
  const known = new Set(["--help", "-h", "--project", "--session", "--herdr", "--export"]);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === undefined || !known.has(argument)) {
      throw new Error(`unknown Console argument: ${argument ?? ""}`);
    }
    if (argument === "--project" || argument === "--session" || argument === "--export") index += 1;
  }
}

type ConsoleCliInput = TerminalInput & Readonly<{
  on(event: "data", listener: (chunk: Buffer) => void): unknown;
  off(event: "data", listener: (chunk: Buffer) => void): unknown;
}>;

type ConsoleCliOutput = TerminalOutput & Readonly<{
  columns?: number;
  rows?: number;
}>;

export type ConsoleCliDependencies = Readonly<{
  input?: ConsoleCliInput;
  output?: ConsoleCliOutput;
  signalTarget?: TerminalLifecycleTarget;
  bootstrap?: ConsoleBootstrapPort;
  startApplication?: typeof startFabricConsoleApplication;
  createTerminal?: (options: TerminalSessionOptions) => TerminalSession;
}>;

export type ConsoleRefreshLoop = Readonly<{
  stop(): Promise<void>;
}>;

export function createConsoleCliBootstrap(
  createBootstrap: typeof createProductionConsoleBootstrap =
    createProductionConsoleBootstrap,
): ConsoleBootstrapPort {
  return createBootstrap({
    typedEntryPlannerFactory: createProductionConsoleTypedEntryPlanner,
  });
}

export function startConsoleRefreshLoop(options: Readonly<{
  refresh(): Promise<unknown>;
  isClosed(): boolean;
  onClosed(): void;
  intervalMs?: number;
  schedule?: (callback: () => void, intervalMs: number) => unknown;
  clear?: (handle: unknown) => void;
}>): ConsoleRefreshLoop {
  const intervalMs = options.intervalMs ?? 500;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 50 || intervalMs >= 2_000) {
    throw new TypeError("Console refresh interval must be from 50 to 1999 milliseconds");
  }
  const schedule = options.schedule ?? ((callback, milliseconds) => {
    const timer = setInterval(callback, milliseconds);
    timer.unref();
    return timer;
  });
  const clear = options.clear ?? ((handle) => clearInterval(handle as NodeJS.Timeout));
  let stopped = false;
  let closedNotified = false;
  let inFlight: Promise<void> | undefined;
  let handle: unknown;
  const stopTimer = (): void => {
    if (stopped) return;
    stopped = true;
    clear(handle);
  };
  const notifyClosed = (): void => {
    if (closedNotified) return;
    closedNotified = true;
    options.onClosed();
  };
  const tick = (): void => {
    if (stopped) return;
    if (options.isClosed()) {
      stopTimer();
      notifyClosed();
      return;
    }
    if (inFlight !== undefined) return;
    inFlight = (async () => {
      try {
        await options.refresh();
      } catch {
        // The adapter retains the last good projection and the next bounded
        // tick retries. Transport failure never permits a mutation.
      } finally {
        inFlight = undefined;
        if (options.isClosed()) {
          stopTimer();
          notifyClosed();
        }
      }
    })();
  };
  handle = schedule(tick, intervalMs);
  return {
    async stop(): Promise<void> {
      stopTimer();
      await inFlight;
    },
  };
}

function assertInteractiveTerminal(
  input: ConsoleCliInput,
  output: ConsoleCliOutput,
): void {
  if (
    input.isTTY !== true ||
    output.isTTY !== true ||
    typeof input.setRawMode !== "function"
  ) {
    throw new Error("Console terminal setup requires a TTY input and output");
  }
}

export async function runConsoleCli(
  arguments_: readonly string[],
  dependencies: ConsoleCliDependencies = {},
): Promise<void> {
  validateArguments(arguments_);
  const input = dependencies.input ?? process.stdin;
  const output = dependencies.output ?? process.stdout;
  if (arguments_.includes("--help") || arguments_.includes("-h")) {
    output.write(CONSOLE_CLI_USAGE);
    return;
  }
  const projectRoot = resolve(option(arguments_, "--project") ?? process.cwd());
  const sessionOption = option(arguments_, "--session");
  const projectSessionId = sessionOption === undefined
    ? undefined
    : parseIdentifier<"ProjectSessionId">(
        sessionOption,
        "consoleCli.projectSessionId",
      ) as ProjectSessionId;
  const exportValue = option(arguments_, "--export");
  if (
    exportValue !== undefined &&
    exportValue !== "json" &&
    exportValue !== "markdown"
  ) {
    throw new Error("--export must be json or markdown");
  }
  if (exportValue !== undefined) {
    const startApplication = dependencies.startApplication ?? startFabricConsoleApplication;
    const application = await startApplication({
      bootstrap: dependencies.bootstrap ?? createConsoleCliBootstrap(),
      projectRoot,
      surface: arguments_.includes("--herdr") ? "herdr" : "standalone",
      ...(projectSessionId === undefined ? {} : { projectSessionId }),
      viewport: {
        columns: output.columns ?? 80,
        rows: output.rows ?? 24,
      },
      draw: () => {},
      eventId: () => "console-export",
      confirmationId: () => "console-export-confirmation",
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
    });
    try {
      const ui = "ui" in application
        ? application.ui
        : createFabricUiState();
      output.write(renderConsoleSnapshot({
        dataset: application.dataset,
        controller: application.controller.state,
        ui,
        viewport: {
          columns: output.columns ?? 80,
          rows: output.rows ?? 24,
        },
      }, exportValue as ConsoleSnapshotFormat));
    } finally {
      await application.close("operator");
    }
    return;
  }
  assertInteractiveTerminal(input, output);
  let terminalReady = false;
  let application:
    | Awaited<ReturnType<typeof startFabricConsoleApplication>>
    | undefined;
  let terminal: TerminalSession | undefined;
  let refreshLoop: ConsoleRefreshLoop | undefined;
  let decoderTimeout: NodeJS.Timeout | undefined;
  let onData: ((chunk: Buffer) => void) | undefined;
  let inputTail: Promise<void> = Promise.resolve();
  const draw = (frame: FabricConsoleFrame): void => {
    if (!terminalReady) return;
    output.write(`\u001b[H${frame.rows.join("\n")}`);
  };
  let finish: (() => void) | undefined;
  let fail: ((error: unknown) => void) | undefined;
  const finished = new Promise<void>((resolveFinished, rejectFinished) => {
    finish = resolveFinished;
    fail = rejectFinished;
  });
  let primaryFailure: unknown;
  let failed = false;
  try {
    const startApplication = dependencies.startApplication ?? startFabricConsoleApplication;
    application = await startApplication({
      bootstrap: dependencies.bootstrap ?? createConsoleCliBootstrap(),
      projectRoot,
      surface: arguments_.includes("--herdr") ? "herdr" : "standalone",
      ...(projectSessionId === undefined ? {} : { projectSessionId }),
      viewport: {
        ...(output.columns === undefined ? {} : { columns: output.columns }),
        ...(output.rows === undefined ? {} : { rows: output.rows }),
      },
      draw,
      eventId: (() => {
        let sequence = 0;
        return () => `cli-input-${String(++sequence)}`;
      })(),
      confirmationId: () => `console-confirmation-${randomUUID()}`,
      render: renderFabricConsoleFrame,
      reducePointer: reduceFabricPointer,
      setMouseCapture: (enabled) => terminal?.setMouseCapture(enabled),
      setEditorActive: (enabled) => terminal?.setEditorActive(enabled),
    });
    const createTerminal = dependencies.createTerminal ?? ((options) => new TerminalSession(options));
    terminal = createTerminal({
      input,
      output,
      mouseCapture: false,
      signalTarget: dependencies.signalTarget ?? process,
      onResize: (viewport) => application?.resize(viewport),
      onSignal: () => {
        void application?.close("signal").then(() => finish?.(), (error) => fail?.(error));
      },
      onSuspend: () => process.kill(process.pid, "SIGSTOP"),
      onResume: () => { application?.repaint(); },
    });
    terminalReady = true;
    application.repaint();
    refreshLoop = startConsoleRefreshLoop({
      refresh: async () => await application?.refresh(),
      isClosed: () => application?.closed === true,
      onClosed: () => {
        void inputTail.then(() => finish?.(), (error: unknown) => fail?.(error));
      },
    });
    const decoder = new TerminalInputDecoder();
    const handleEvent = (event: TerminalInputEvent): void => {
      inputTail = inputTail.then(async () => {
        await application?.handleInput(event);
        if (application?.closed === true) finish?.();
      });
      void inputTail.catch((error: unknown) => fail?.(error));
    };
    onData = (chunk: Buffer): void => {
      for (const event of decoder.push(chunk)) handleEvent(event);
    };
    input.on("data", onData);
    decoderTimeout = setInterval(() => {
      for (const event of decoder.flushTimedOut()) handleEvent(event);
    }, 10);
    await finished;
  } catch (error: unknown) {
    failed = true;
    primaryFailure = error;
  } finally {
    if (decoderTimeout !== undefined) clearInterval(decoderTimeout);
    if (onData !== undefined) input.off("data", onData);
    const cleanupFailures: unknown[] = [];
    await inputTail.catch(() => undefined);
    await refreshLoop?.stop().catch((error: unknown) => cleanupFailures.push(error));
    try {
      terminal?.close();
    } catch (error: unknown) {
      cleanupFailures.push(error);
    }
    if (application !== undefined && !application.closed) {
      await application.close("safety").catch((error: unknown) => cleanupFailures.push(error));
    }
    if (failed) {
      if (cleanupFailures.length > 0) {
        throw new AggregateError(
          [primaryFailure, ...cleanupFailures],
          "Console failed and cleanup was incomplete",
        );
      }
      throw primaryFailure;
    }
    if (cleanupFailures.length > 0) {
      throw new AggregateError(cleanupFailures, "Console cleanup failed");
    }
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

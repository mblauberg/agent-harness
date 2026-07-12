import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  CONSOLE_CLI_USAGE,
  createConsoleCliBootstrap,
  runConsoleCli,
  startConsoleRefreshLoop,
} from "../src/cli.js";
import { createProductionConsoleTypedEntryPlanner } from "../src/typed-entry-planner.js";
import { createBootstrapUnavailableDataset } from "../src/protocol-adapter.js";
import { FABRIC_VIEWS } from "../src/model.js";

describe("standalone Console executable", () => {
  it("registers the production typed-entry planner with the shipped bootstrap", () => {
    const bootstrap = { startOrAttach: vi.fn() };
    const createBootstrap = vi.fn(() => bootstrap);

    expect(createConsoleCliBootstrap(createBootstrap)).toBe(bootstrap);
    expect(createBootstrap).toHaveBeenCalledWith({
      typedEntryPlannerFactory: createProductionConsoleTypedEntryPlanner,
    });
  });

  it("ships a non-interactive help path and honestly describes production bootstrap", () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    return runConsoleCli(["--help"]).then(() => {
      expect(write).toHaveBeenCalledWith(CONSOLE_CLI_USAGE);
      expect(CONSOLE_CLI_USAGE).toContain("lock-safe local Fabric bootstrap");
      expect(CONSOLE_CLI_USAGE).toContain("unavailable state remains read-only");
      write.mockRestore();
    });
  });

  it("maps the package bin to the compiled shebang entrypoint", async () => {
    const packageValue: unknown = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    const fabricPackageValue: unknown = JSON.parse(
      await readFile(new URL("../../agent-fabric/package.json", import.meta.url), "utf8"),
    );
    const source = await readFile(new URL("../src/cli.ts", import.meta.url), "utf8");
    expect(packageValue).toMatchObject({
      bin: { "agent-fabric-console": "dist/cli.js" },
      dependencies: { "@local/agent-fabric": "file:../agent-fabric" },
    });
    expect(fabricPackageValue).toMatchObject({
      exports: {
        ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      },
    });
    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(source).toContain("createConsoleCliBootstrap()");
    expect(source).toContain(
      "typedEntryPlannerFactory: createProductionConsoleTypedEntryPlanner",
    );
    expect(source).not.toContain("unavailableBootstrap");
  });

  it("rejects a non-TTY before starting or attaching Fabric", async () => {
    const startApplication = vi.fn();
    await expect(runConsoleCli([], {
      input: {
        isTTY: false,
        isRaw: false,
        readableFlowing: false,
        setRawMode: () => {},
        resume: () => {},
        pause: () => {},
        on: () => {},
        off: () => {},
      },
      output: {
        isTTY: true,
        columns: 80,
        rows: 24,
        write: () => true,
        on: () => {},
        removeListener: () => {},
      },
      startApplication: startApplication as never,
    })).rejects.toThrow("requires a TTY");
    expect(startApplication).not.toHaveBeenCalled();
  });

  it.each(["json", "markdown"] as const)(
    "exports a non-interactive deterministic %s snapshot and detaches cleanly",
    async (format) => {
      const writes: string[] = [];
      const close = vi.fn(async () => {});
      const dataset = createBootstrapUnavailableDataset("start-failed", 1_000);
      const controller = {
        state: {
          activeView: "system",
          selectionByView: Object.fromEntries(FABRIC_VIEWS.map((view) => [view, null])),
          scrollAnchorByView: Object.fromEntries(FABRIC_VIEWS.map((view) => [view, null])),
          review: null,
          pendingCommandIds: [],
          lastActionStatus: null,
          lastReceipt: null,
          lastFailure: null,
        },
      };
      await runConsoleCli(["--export", format], {
        input: {
          isTTY: false,
          isRaw: false,
          readableFlowing: false,
          setRawMode: () => {},
          resume: () => {},
          pause: () => {},
          on: () => {},
          off: () => {},
        },
        output: {
          isTTY: false,
          write: (value) => { writes.push(String(value)); return true; },
          on: () => {},
          removeListener: () => {},
        },
        startApplication: (async () => ({ dataset, controller, close })) as never,
      });

      expect(writes.join("")).toContain(
        format === "json"
          ? '"kind": "agent-fabric-console-snapshot"'
          : "# Agent Fabric Console snapshot",
      );
      expect(close).toHaveBeenCalledWith("operator");
    },
  );

  it("passes an explicit stable session selection to the application", async () => {
    const dataset = createBootstrapUnavailableDataset("start-failed", 1_000);
    const startApplication = vi.fn(async () => ({
      dataset,
      controller: {
        state: {
          activeView: "system",
          selectionByView: Object.fromEntries(FABRIC_VIEWS.map((view) => [view, null])),
          scrollAnchorByView: Object.fromEntries(FABRIC_VIEWS.map((view) => [view, null])),
          review: null,
          pendingCommandIds: [],
          lastActionStatus: null,
          lastReceipt: null,
          lastFailure: null,
        },
      },
      close: async () => {},
    }));

    await runConsoleCli([
      "--session",
      "session_explicit_01",
      "--export",
      "json",
    ], {
      input: {
        isTTY: false,
        isRaw: false,
        readableFlowing: false,
        setRawMode: () => {},
        resume: () => {},
        pause: () => {},
        on: () => {},
        off: () => {},
      },
      output: {
        isTTY: false,
        write: () => true,
        on: () => {},
        removeListener: () => {},
      },
      startApplication: startApplication as never,
    });

    expect(startApplication).toHaveBeenCalledWith(expect.objectContaining({
      projectSessionId: "session_explicit_01",
    }));
  });

  it("closes and detaches an attached application when terminal construction fails", async () => {
    const close = vi.fn(async () => {});
    const application = {
      closed: false,
      close,
      repaint: () => { throw new Error("must not repaint"); },
    };
    await expect(runConsoleCli([], {
      input: {
        isTTY: true,
        isRaw: false,
        readableFlowing: false,
        setRawMode: () => {},
        resume: () => {},
        pause: () => {},
        on: () => {},
        off: () => {},
      },
      output: {
        isTTY: true,
        columns: 80,
        rows: 24,
        write: () => true,
        on: () => {},
        removeListener: () => {},
      },
      startApplication: (async () => application) as never,
      createTerminal: () => { throw new Error("injected terminal setup failure"); },
    })).rejects.toThrow("injected terminal setup failure");
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith("safety");
  });

  it("refreshes within two seconds without overlap and stops when the Console closes", async () => {
    let tick: (() => void) | undefined;
    let releaseRefresh!: () => void;
    const firstRefresh = new Promise<void>((resolvePromise) => {
      releaseRefresh = resolvePromise;
    });
    const refresh = vi.fn()
      .mockImplementationOnce(async () => await firstRefresh)
      .mockResolvedValue(undefined);
    let closed = false;
    const onClosed = vi.fn();
    const clear = vi.fn();
    const loop = startConsoleRefreshLoop({
      refresh,
      isClosed: () => closed,
      onClosed,
      schedule: (callback, intervalMs) => {
        expect(intervalMs).toBeLessThan(2_000);
        tick = callback;
        return "refresh-handle";
      },
      clear,
    });

    tick?.();
    tick?.();
    expect(refresh).toHaveBeenCalledTimes(1);
    releaseRefresh();
    await firstRefresh;
    await Promise.resolve();
    tick?.();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(2);
    closed = true;
    tick?.();
    expect(clear).toHaveBeenCalledWith("refresh-handle");
    expect(onClosed).toHaveBeenCalledTimes(1);
    await loop.stop();
  });

  it("does not finish terminal cleanup until the accepted detach input settles", async () => {
    let data: ((chunk: Buffer) => void) | undefined;
    let releaseDetach!: () => void;
    const detach = new Promise<void>((resolvePromise) => { releaseDetach = resolvePromise; });
    let closed = false;
    const terminalClose = vi.fn();
    const application = {
      get closed() { return closed; },
      repaint: vi.fn(),
      refresh: vi.fn(async () => undefined),
      resize: vi.fn(),
      handleInput: vi.fn(async () => {
        closed = true;
        await detach;
      }),
      close: vi.fn(async () => {
        closed = true;
        await detach;
      }),
    };
    const running = runConsoleCli([], {
      input: {
        isTTY: true,
        isRaw: false,
        readableFlowing: false,
        setRawMode: () => {},
        resume: () => {},
        pause: () => {},
        on: (_event, listener) => { data = listener; },
        off: () => {},
      },
      output: {
        isTTY: true,
        columns: 80,
        rows: 24,
        write: () => true,
        on: () => {},
        removeListener: () => {},
      },
      startApplication: (async () => application) as never,
      createTerminal: (() => ({
        close: terminalClose,
        setMouseCapture: () => {},
        setEditorActive: () => {},
      })) as never,
    });

    await vi.waitFor(() => expect(data).toBeDefined());
    data?.(Buffer.from("q", "utf8"));
    await vi.waitFor(() => expect(application.handleInput).toHaveBeenCalledOnce());
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 550));

    expect(terminalClose).not.toHaveBeenCalled();
    releaseDetach();
    await expect(running).resolves.toBeUndefined();
    expect(terminalClose).toHaveBeenCalledOnce();
  });
});
